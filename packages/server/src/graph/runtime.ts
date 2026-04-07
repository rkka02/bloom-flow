import { randomUUID } from 'node:crypto'
import type { Session } from '@bloom/shared'
import { chat } from '../llm/client.js'
import { writeMessage, readUnread, markRead } from '../mailbox/mailbox.js'
import { getWorkerForGraphNode, spawnWorker } from '../worker/workerPool.js'
import { broadcast } from '../ws/broadcaster.js'
import { normalizeGraph } from './normalize.js'
import { normalizeWorkspace } from '../session/sessionStore.js'
import { normalizeModelName } from '../llm/models.js'

export type GraphNodeStatus = 'pending' | 'running' | 'completed' | 'error' | 'skipped'

export interface GraphRunResult {
  nodeStatuses: Record<string, GraphNodeStatus>
  nodeResults: Record<string, string>
  logs: string[]
}

interface FlowNode {
  id: string
  type?: string
  data?: Record<string, any>
}

interface FlowEdge {
  id?: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

interface WorkerNodeData extends Record<string, any> {
  label?: string
  model?: string
  cwd?: string
  sharedWorkerKey?: string
}

interface ScheduledExecution {
  nodeId: string
  node: FlowNode
  runCount: number
}

type SettledExecution =
  | (ScheduledExecution & { ok: true; result: string })
  | (ScheduledExecution & { ok: false; error: Error })

const GRAPH_RUNTIME_ID = '__graph_runtime__'
const MAX_LOOP_ITERATIONS = 20
const MAX_RUNS_PER_NODE = 20
const WORKER_REPLY_TIMEOUT_MS = 60 * 60 * 1000
const GRAPH_RUN_TIMEOUT_MS = 6 * 60 * 60 * 1000
const BATCH_EXECUTION_STAGGER_MS = 1_000

export async function runGraphRuntime(session: Session): Promise<GraphRunResult> {
  const runId = randomUUID().slice(0, 12)
  const startedAt = Date.now()
  const normalizedGraph = normalizeGraph(
    (session.graph?.nodes ?? []) as FlowNode[],
    (session.graph?.edges ?? []) as FlowEdge[],
  )
  const nodes = normalizedGraph.nodes
  const edges = normalizedGraph.edges
  const schedulerEdges = getSchedulerEdges(edges)
  const feedbackEdges = getFeedbackEdges(edges)
  const logs: string[] = []
  const statuses = new Map<string, GraphNodeStatus>()
  const results = new Map<string, string>()
  const completed = new Set<string>()
  const inactiveEdges = new Set<string>()
  const feedbackInputs = new Map<string, string[]>()
  const runCounts = new Map<string, number>()
  const visited = new Set<string>()
  const running = new Set<string>()
  const rerunRequested = new Set<string>()
  const nodeMap = new Map<string, FlowNode>(nodes.map(node => [node.id, node]))
  const activeExecutions = new Map<string, Promise<SettledExecution>>()
  const order = topoSort(nodes, schedulerEdges)
  let nextLaunchAt = 0
  emitRunStarted(session.id, runId)

  try {
    for (const node of nodes) statuses.set(node.id, 'pending')

    log(session.id, runId, logs, `Execution started. ${nodes.length} nodes to process.`)
    await ensureWorkerPool(session, nodes)

    const launchRunnableNodes = (): void => {
      const runnable = getRunnableBatch(order, schedulerEdges, completed, inactiveEdges, running)

      for (const nodeId of runnable) {
        const node = nodeMap.get(nodeId)
        if (!node || activeExecutions.has(nodeId)) continue

        statuses.set(nodeId, 'running')
        emitNodeStatus(session.id, runId, nodeId, 'running')

        const runCount = (runCounts.get(nodeId) ?? 0) + 1
        runCounts.set(nodeId, runCount)
        running.add(nodeId)

        const scheduledFor = Math.max(Date.now(), nextLaunchAt)
        nextLaunchAt = scheduledFor + BATCH_EXECUTION_STAGGER_MS

        const execution = (async (): Promise<SettledExecution> => {
          try {
            const waitMs = scheduledFor - Date.now()
            if (waitMs > 0) {
              await delay(waitMs)
            }
            if (rerunRequested.has(nodeId)) {
              throw new Error('Execution invalidated before start')
            }
            if (runCount > MAX_RUNS_PER_NODE) {
              throw new Error(`Max executions exceeded (${MAX_RUNS_PER_NODE})`)
            }

            const activeIncoming = getIncomingEdges(schedulerEdges, nodeId)
              .filter(edge => !inactiveEdges.has(edgeKey(edge)))
            const primaryInputs = formatPrimaryInputs(nodes, activeIncoming, results)
            const feedback = feedbackInputs.get(nodeId) ?? []
            feedbackInputs.delete(nodeId)
            const inputContext = buildNodeInputContext(primaryInputs, feedback)
            const result = await executeNode(session, runId, startedAt, nodes, edges, node, inputContext, logs)
            return { nodeId, node, runCount, ok: true, result }
          } catch (error: any) {
            const normalizedError = error instanceof Error ? error : new Error(String(error))
            return { nodeId, node, runCount, ok: false, error: normalizedError }
          }
        })()

        activeExecutions.set(nodeId, execution)
      }
    }

    while (completed.size < nodes.length) {
      ensureRunNotTimedOut(startedAt)
      launchRunnableNodes()
      if (activeExecutions.size === 0) break

      const entry = await Promise.race(Array.from(activeExecutions.values()))
      activeExecutions.delete(entry.nodeId)
      running.delete(entry.nodeId)

      if (rerunRequested.has(entry.nodeId)) {
        rerunRequested.delete(entry.nodeId)
        completed.delete(entry.nodeId)
        results.delete(entry.nodeId)
        statuses.set(entry.nodeId, 'pending')
        emitNodeStatus(session.id, runId, entry.nodeId, 'pending')
        log(session.id, runId, logs, `??${entry.node.data?.label ?? entry.nodeId} invalidated while running; scheduling retry`)
        continue
      }

      if (!entry.ok) {
        statuses.set(entry.nodeId, 'error')
        completed.add(entry.nodeId)
        emitNodeStatus(session.id, runId, entry.nodeId, 'error')
        log(session.id, runId, logs, `??${entry.node.data?.label ?? entry.nodeId} failed: ${entry.error.message}`)
        continue
      }

      const result = entry.result
      visited.add(entry.nodeId)

      if (entry.node.type === 'branch') {
        clearInactiveOutgoingEdges(inactiveEdges, getOutgoingEdges(schedulerEdges, entry.nodeId))
        const branch = normalizeBranchResult(result)
        for (const edge of getOutgoingEdges(schedulerEdges, entry.nodeId)) {
          if ((edge.sourceHandle ?? 'true') !== branch) {
            inactiveEdges.add(edgeKey(edge))
          }
        }
      }

      statuses.set(entry.nodeId, 'completed')
      completed.add(entry.nodeId)
      results.set(entry.nodeId, result)
      emitNodeStatus(session.id, runId, entry.nodeId, 'completed')
      emitNodeResult(session.id, runId, entry.nodeId, result)

      const preview = result.length > 300 ? `${result.slice(0, 300)}...` : result
      if (preview.trim()) {
        log(session.id, runId, logs, `??${entry.node.data?.label ?? entry.nodeId} completed`)
        log(session.id, runId, logs, `  ??${preview}`)
      } else {
        log(session.id, runId, logs, `??${entry.node.data?.label ?? entry.nodeId} completed (no output)`)
      }

      const outgoingFeedback = getOutgoingEdges(feedbackEdges, entry.nodeId)
        .filter(edge => entry.node.type !== 'branch' || (edge.sourceHandle ?? 'true') === normalizeBranchResult(result))

      for (const edge of outgoingFeedback) {
        queueFeedbackInput(feedbackInputs, nodes, edge, result)
        invalidateDownstream(
          edge.target,
          schedulerEdges,
          completed,
          results,
          statuses,
          inactiveEdges,
          running,
          rerunRequested,
        )
        log(session.id, runId, logs, `  ??Feedback routed to ${getNodeLabel(nodes, edge.target)}`)
      }
    }

    for (const node of nodes) {
      if (!visited.has(node.id) && (!statuses.get(node.id) || statuses.get(node.id) === 'pending')) {
        statuses.set(node.id, 'skipped')
        emitNodeStatus(session.id, runId, node.id, 'skipped')
      }
    }

    for (const node of nodes) {
      if (node.type === 'output' && results.has(node.id)) {
        log(session.id, runId, logs, `===== OUTPUT: ${node.data?.label ?? 'Result'} =====`)
        log(session.id, runId, logs, results.get(node.id) || '(empty)')
        log(session.id, runId, logs, '===================================')
      }
    }

    log(session.id, runId, logs, 'Execution complete.')
    emitRunCompleted(session.id, runId, true)

    return {
      nodeStatuses: Object.fromEntries(statuses.entries()),
      nodeResults: Object.fromEntries(results.entries()),
      logs,
    }
  } catch (error: any) {
    emitRunCompleted(session.id, runId, false, error.message)
    throw error
  }
}

async function ensureWorkerPool(session: Session, nodes: FlowNode[]): Promise<void> {
  for (const node of nodes) {
    if (node.type !== 'worker') continue
    const workerData = (node.data ?? {}) as WorkerNodeData

    const existing = getWorkerForGraphNode(node.id, workerData.sharedWorkerKey)
    if (existing) {
      existing.name = workerData.label ?? existing.name
      existing.model = workerData.model ?? existing.model
      existing.sharedWorkerKey = workerData.sharedWorkerKey ?? existing.sharedWorkerKey
      existing.workspace = normalizeWorkspace({
        ...session.workspace,
        ...existing.workspace,
        cwd: workerData.cwd ?? existing.workspace?.cwd ?? session.workspace?.cwd ?? session.workspace?.rootDir ?? '',
        permissions: {
          ...session.workspace?.permissions,
          ...existing.workspace?.permissions,
        },
      })
      continue
    }

    const worker = spawnWorker({
      name: workerData.label ?? node.id,
      model: normalizeModelName(workerData.model),
      sessionId: session.id,
      graphNodeId: node.id,
      sharedWorkerKey: workerData.sharedWorkerKey,
      workspace: normalizeWorkspace({
        ...session.workspace,
        cwd: workerData.cwd ?? session.workspace?.cwd ?? session.workspace?.rootDir ?? '',
      }),
    })
    session.agents.push(worker)
  }
}

async function executeNode(
  session: Session,
  runId: string,
  startedAt: number,
  nodes: FlowNode[],
  edges: FlowEdge[],
  node: FlowNode,
  inputContext: string,
  logs: string[],
): Promise<string> {
  const data = node.data ?? {}

  switch (node.type) {
    case 'input':
      return data.value ?? ''

    case 'output':
      return inputContext

    case 'worker': {
      const worker = getWorkerForGraphNode(node.id, (node.data as WorkerNodeData | undefined)?.sharedWorkerKey)
      if (!worker) throw new Error(`No worker registered for graph node ${node.id}`)

      const prompt = buildRuntimeWorkerPrompt(node, inputContext)

      const replyTo = `${GRAPH_RUNTIME_ID}:${node.id}:${Date.now()}`
      await writeMessage(
        session.id,
        worker.id,
        GRAPH_RUNTIME_ID,
        prompt,
        `${data.label ?? node.id} task`,
        replyTo,
      )
      return waitForRuntimeReply(session.id, replyTo, startedAt)
    }

    case 'branch': {
      const condition = data.conditions?.[0]?.expr ?? 'true'
      const prompt = [
        'Evaluate the branch condition using all provided context.',
        'Return JSON only in this exact shape:',
        '{"decision":"true"|"false","reason":"short explanation"}',
        '',
        `Condition: ${condition}`,
        '',
        'Context:',
        inputContext || '(No upstream content was provided.)',
      ].join('\n')
      const response = await chat({
        model: normalizeModelName(data.model),
        messages: [
          { role: 'system', content: 'You are a strict branch evaluator. Reply with JSON only.' },
          { role: 'user', content: prompt },
        ],
        workspace: session.workspace,
      })
      return formatBranchResult(condition, response.content ?? '')
    }

    case 'loop': {
      const condition = data.condition ?? 'until done'
      const maxIterations = Math.min(data.maxIterations ?? 5, MAX_LOOP_ITERATIONS)
      let loopResult = inputContext

      for (let iteration = 1; iteration <= maxIterations; iteration++) {
        const bodyEdge = getOutgoingEdges(edges, node.id)
          .find(edge => edge.sourceHandle === 'loop-back')
        const bodyNode = bodyEdge
          ? (nodes.find(candidate => candidate.id === bodyEdge.target) ?? null)
          : null

        if (bodyNode) {
          loopResult = await executeNode(session, runId, startedAt, nodes, edges, bodyNode, loopResult, logs)
        }

        const evalPrompt = `You are evaluating a loop condition. Based on the current result, should the loop continue?\n\nLoop condition: "${condition}"\nIteration: ${iteration}/${maxIterations}\n\nCurrent result:\n${loopResult.slice(0, 2000)}\n\nReply with ONLY "continue" or "done".`
        const response = await chat({
          model: normalizeModelName(data.model),
          messages: [
            { role: 'system', content: 'You are a loop evaluator. Reply only with continue or done.' },
            { role: 'user', content: evalPrompt },
          ],
          workspace: session.workspace,
        })
        const verdict = (response.content ?? 'done').toLowerCase()
        log(session.id, runId, logs, `  ??${data.label ?? node.id} iteration ${iteration}/${maxIterations} ??${verdict}`)
        if (!verdict.includes('continue')) break
      }

      return loopResult
    }

    default:
      return inputContext
  }
}

async function waitForRuntimeReply(sessionId: string, replyTo: string, graphStartedAt: number): Promise<string> {
  const timeoutMs = Math.min(WORKER_REPLY_TIMEOUT_MS, Math.max(1_000, GRAPH_RUN_TIMEOUT_MS - (Date.now() - graphStartedAt)))
  const waitStartedAt = Date.now()

  while (Date.now() - waitStartedAt < timeoutMs) {
    const unread = await readUnread(sessionId, replyTo)
    if (unread.length > 0) {
      const message = unread[0]!
      await markRead(sessionId, replyTo, message.id)
      return message.text
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  throw new Error('Timed out waiting for worker reply')
}

function getRunnableBatch(
  order: string[],
  edges: FlowEdge[],
  completed: Set<string>,
  inactiveEdges: Set<string>,
  running: Set<string>,
): string[] {
  return order.filter(nodeId => {
    if (completed.has(nodeId) || running.has(nodeId)) return false
    const originalIncoming = getIncomingEdges(edges, nodeId)
    const activeIncoming = originalIncoming.filter(edge => !inactiveEdges.has(edgeKey(edge)))
    if (originalIncoming.length === 0) return true
    if (activeIncoming.length === 0) return false
    return activeIncoming.every(edge => completed.has(edge.source))
  })
}

function topoSort(nodes: FlowNode[], edges: FlowEdge[]): string[] {
  const adjacency = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  for (const node of nodes) {
    adjacency.set(node.id, [])
    inDegree.set(node.id, 0)
  }

  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target)
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  const queue = nodes
    .filter(node => (inDegree.get(node.id) ?? 0) === 0)
    .map(node => node.id)
  const order: string[] = []

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    order.push(nodeId)
    for (const next of adjacency.get(nodeId) ?? []) {
      const degree = (inDegree.get(next) ?? 1) - 1
      inDegree.set(next, degree)
      if (degree === 0) queue.push(next)
    }
  }

  return order.length > 0 ? order : nodes.map(node => node.id)
}

function getIncomingEdges(edges: FlowEdge[], nodeId: string): FlowEdge[] {
  return edges.filter(edge => edge.target === nodeId)
}

function getOutgoingEdges(edges: FlowEdge[], nodeId: string): FlowEdge[] {
  return edges.filter(edge => edge.source === nodeId)
}

function getSchedulerEdges(edges: FlowEdge[]): FlowEdge[] {
  return edges.filter(edge => edge.sourceHandle !== 'loop-back' && !isFeedbackEdge(edge))
}

function getFeedbackEdges(edges: FlowEdge[]): FlowEdge[] {
  return edges.filter(isFeedbackEdge)
}

function edgeKey(edge: FlowEdge): string {
  return edge.id ?? `${edge.source}:${edge.sourceHandle ?? ''}->${edge.target}:${edge.targetHandle ?? ''}`
}

function normalizeBranchResult(result: string): 'true' | 'false' {
  const parsed = parseBranchPayload(result)
  if (parsed) return parsed.decision
  const normalized = result.toLowerCase()
  return normalized.includes('true') || normalized.includes('yes') ? 'true' : 'false'
}

function formatPrimaryInputs(
  nodes: FlowNode[],
  incoming: FlowEdge[],
  results: Map<string, string>,
): string[] {
  return incoming
    .map((edge, index) => {
      const text = results.get(edge.source)?.trim()
      if (!text) return null
      const sourceLabel = getNodeLabel(nodes, edge.source)
      return `Primary input ${index + 1} ??${sourceLabel}\n${text}`
    })
    .filter((value): value is string => Boolean(value))
}

function buildNodeInputContext(primaryInputs: string[], feedbackInputs: string[]): string {
  const sections: string[] = []

  if (primaryInputs.length > 0) {
    sections.push([
      `Primary inputs (${primaryInputs.length})`,
      ...primaryInputs.map(input => `\n${input}`),
    ].join('\n'))
  }

  if (feedbackInputs.length > 0) {
    sections.push([
      `Feedback inputs (${feedbackInputs.length})`,
      ...feedbackInputs.map(input => `\n${input}`),
    ].join('\n'))
  }

  return sections.join('\n\n---\n\n')
}

function buildRuntimeWorkerPrompt(node: FlowNode, inputContext: string): string {
  const label = node.data?.label ?? node.id
  const role = node.data?.role ?? 'Worker'
  const task = (node.data?.prompt ?? '').trim()
  const upstream = inputContext.trim()

  return [
    `You are executing graph node "${label}" as ${role}.`,
    '',
    'Task:',
    task || 'Use the upstream handoff as your input and produce the next-stage output for this node.',
    '',
    `Preferred working directory: ${node.data?.cwd || '(inherit team root)'}`,
    '',
    'Execution rules:',
    '- Use every provided input section below.',
    '- If multiple inputs are present, incorporate all of them in your reasoning and output.',
    '- Treat feedback as a revision signal for this run.',
    '',
    'Upstream handoff:',
    upstream || '(No upstream content was provided.)',
    '',
    'Return only the result for this node. Do not ask the runtime what to do next.',
  ].join('\n')
}

function isFeedbackEdge(edge: FlowEdge): boolean {
  return (edge.targetHandle ?? '').startsWith('feedback')
}

function queueFeedbackInput(
  feedbackInputs: Map<string, string[]>,
  nodes: FlowNode[],
  edge: FlowEdge,
  result: string,
): void {
  const queue = feedbackInputs.get(edge.target) ?? []
  queue.push(`Feedback from ${getNodeLabel(nodes, edge.source)}\n${result}`)
  feedbackInputs.set(edge.target, queue)
}

function invalidateDownstream(
  nodeId: string,
  edges: FlowEdge[],
  completed: Set<string>,
  results: Map<string, string>,
  statuses: Map<string, GraphNodeStatus>,
  inactiveEdges: Set<string>,
  running: Set<string>,
  rerunRequested: Set<string>,
): void {
  const stack = [nodeId]
  const seen = new Set<string>()

  while (stack.length > 0) {
    const current = stack.pop()!
    if (seen.has(current)) continue
    seen.add(current)

    completed.delete(current)
    results.delete(current)

    if (running.has(current)) {
      rerunRequested.add(current)
    } else {
      rerunRequested.delete(current)
      statuses.set(current, 'pending')
    }

    for (const edge of getOutgoingEdges(edges, current)) {
      inactiveEdges.delete(edgeKey(edge))
      stack.push(edge.target)
    }
  }
}

function clearInactiveOutgoingEdges(inactiveEdges: Set<string>, edges: FlowEdge[]): void {
  for (const edge of edges) inactiveEdges.delete(edgeKey(edge))
}

function getNodeLabel(nodes: FlowNode[], nodeId: string): string {
  return nodes.find(node => node.id === nodeId)?.data?.label ?? nodeId
}

function parseBranchPayload(result: string): { decision: 'true' | 'false'; reason: string } | null {
  const trimmed = result.trim()
  try {
    const parsed = JSON.parse(trimmed)
    const decision = parsed?.decision === 'true' || parsed?.decision === true
      ? 'true'
      : parsed?.decision === 'false' || parsed?.decision === false
        ? 'false'
        : null
    if (!decision) return null
    return { decision, reason: String(parsed?.reason ?? '').trim() }
  } catch {
    return null
  }
}

function formatBranchResult(condition: string, raw: string): string {
  const parsed = parseBranchPayload(raw)
  if (parsed) {
    return [
      `Decision: ${parsed.decision}`,
      `Condition: ${condition}`,
      `Reason: ${parsed.reason || '(no reason provided)'}`,
    ].join('\n')
  }

  const decision = normalizeBranchResult(raw)
  return [
    `Decision: ${decision}`,
    `Condition: ${condition}`,
    `Reason: ${raw.trim() || '(no reason provided)'}`,
  ].join('\n')
}

function log(sessionId: string, runId: string, logs: string[], line: string): void {
  logs.push(line)
  broadcast({
    type: 'graph:log',
    payload: {
      sessionId,
      runId,
      message: line,
      timestamp: new Date().toISOString(),
    },
  })
}

function ensureRunNotTimedOut(startedAt: number): void {
  if (Date.now() - startedAt > GRAPH_RUN_TIMEOUT_MS) {
    throw new Error('Graph runtime exceeded 6 hours')
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function emitRunStarted(sessionId: string, runId: string): void {
  broadcast({
    type: 'graph:run_started',
    payload: { sessionId, runId, timestamp: new Date().toISOString() },
  })
}

function emitNodeStatus(sessionId: string, runId: string, nodeId: string, status: GraphNodeStatus): void {
  broadcast({
    type: 'graph:node_status',
    payload: { sessionId, runId, nodeId, status, timestamp: new Date().toISOString() },
  })
}

function emitNodeResult(sessionId: string, runId: string, nodeId: string, result: string): void {
  broadcast({
    type: 'graph:node_result',
    payload: { sessionId, runId, nodeId, result, timestamp: new Date().toISOString() },
  })
}

function emitRunCompleted(sessionId: string, runId: string, success: boolean, error?: string): void {
  broadcast({
    type: 'graph:run_completed',
    payload: { sessionId, runId, success, error, timestamp: new Date().toISOString() },
  })
}
