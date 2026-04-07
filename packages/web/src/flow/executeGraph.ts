import type { Node, Edge } from '@xyflow/react'
import { normalizeGraph } from './normalizeGraph.js'

export type NodeStatus = 'pending' | 'running' | 'completed' | 'error' | 'skipped'

export interface ExecutionState {
  nodeStatuses: Map<string, NodeStatus>
  nodeResults: Map<string, string>
  logs: string[]
}

const MAX_RUNS_PER_NODE = 20

/** Execute a graph against the bloom backend */
export async function executeGraph(
  nodes: Node[],
  edges: Edge[],
  onStatusChange: (nodeId: string, status: NodeStatus) => void,
  onResult: (nodeId: string, result: string) => void,
  onLog: (msg: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const normalized = normalizeGraph(nodes, edges)
  nodes = normalized.nodes
  edges = normalized.edges
  const schedulerEdges = edges.filter(edge => edge.sourceHandle !== 'loop-back')
  const incoming = new Map<string, Edge[]>()
  const outgoing = new Map<string, Edge[]>()
  const pendingInputs = new Map<string, string[]>()
  const results = new Map<string, string>()
  const runCounts = new Map<string, number>()
  const visited = new Set<string>()

  for (const node of nodes) {
    incoming.set(node.id, [])
    outgoing.set(node.id, [])
  }
  for (const edge of schedulerEdges) {
    incoming.get(edge.target)?.push(edge)
    outgoing.get(edge.source)?.push(edge)
  }

  onLog(`Execution started. ${nodes.length} nodes to process.`)

  for (const node of nodes) {
    if ((incoming.get(node.id) ?? []).length === 0) {
      pendingInputs.set(node.id, [''])
    }
  }

  while (!signal.aborted) {
    const runnable = nodes.filter(node => {
      const buffered = pendingInputs.get(node.id)
      if (!buffered || buffered.length === 0) return false
      const required = (incoming.get(node.id) ?? []).length
      return required === 0 || buffered.length >= required
    })

    if (runnable.length === 0) break

    onLog(`Running batch: ${runnable.map(node => node.id).join(', ')}`)

    // Execute batch in parallel
    await Promise.all(runnable.map(async node => {
      const nodeId = node.id

      try {
        const count = (runCounts.get(nodeId) ?? 0) + 1
        runCounts.set(nodeId, count)
        if (count > MAX_RUNS_PER_NODE) {
          throw new Error(`Max executions exceeded (${MAX_RUNS_PER_NODE}). Add a stopping condition or use a Loop node.`)
        }

        onStatusChange(nodeId, 'running')

        const bufferedInputs = pendingInputs.get(nodeId) ?? []
        pendingInputs.delete(nodeId)
        const parentResults = bufferedInputs.filter(Boolean).join('\n\n---\n\n')

        const result = await executeNode(node, parentResults, edges, results, signal, nodes, onStatusChange, onLog)

        if (signal.aborted) return

        visited.add(nodeId)
        results.set(nodeId, result)
        onResult(nodeId, result)
        onStatusChange(nodeId, 'completed')

        // Log the result content
        const preview = result.length > 300 ? result.slice(0, 300) + '...' : result
        if (preview.trim()) {
          onLog(`✓ ${node.data.label ?? nodeId} completed${count > 1 ? ` (#${count})` : ''}`)
          onLog(`  ↳ ${preview}`)
        } else {
          onLog(`✓ ${node.data.label ?? nodeId} completed${count > 1 ? ` (#${count})` : ''} (no output)`)
        }

        const outgoingEdges = outgoing.get(nodeId) ?? []
        if (node.type === 'branch') {
          const takenHandle = result.toLowerCase().includes('true') || result.toLowerCase().includes('yes') ? 'true' : 'false'
          for (const edge of outgoingEdges) {
            if ((edge.sourceHandle ?? 'true') !== takenHandle) continue
            const existing = pendingInputs.get(edge.target) ?? []
            pendingInputs.set(edge.target, [...existing, parentResults])
          }
        } else {
          for (const edge of outgoingEdges) {
            const existing = pendingInputs.get(edge.target) ?? []
            pendingInputs.set(edge.target, [...existing, result])
          }
        }

      } catch (err: any) {
        if (signal.aborted) return
        onStatusChange(nodeId, 'error')
        onLog(`✗ ${node.data.label ?? nodeId} failed: ${err.message}`)
      }
    }))
  }

  // Log final output nodes
  for (const node of nodes) {
    const nodeId = node.id
    if (node?.type === 'output' && results.has(nodeId)) {
      const output = results.get(nodeId)!
      onLog(`━━━ OUTPUT: ${node.data.label ?? 'Result'} ━━━`)
      onLog(output || '(empty)')
      onLog(`━━━━━━━━━━━━━━━━━━━━━━`)
    }
  }

  for (const node of nodes) {
    if (!visited.has(node.id) && !signal.aborted) {
      onStatusChange(node.id, 'skipped')
    }
  }

  onLog(signal.aborted ? 'Execution stopped.' : 'Execution complete.')
}

async function executeNode(
  node: Node,
  parentResults: string,
  edges: Edge[],
  results: Map<string, string>,
  signal: AbortSignal,
  nodes?: Node[],
  onStatusChange?: (nodeId: string, status: NodeStatus) => void,
  onLog?: (msg: string) => void,
): Promise<string> {
  const data = node.data as Record<string, any>

  switch (node.type) {
    case 'input':
      return data.value ?? ''

    case 'output':
      return parentResults

    case 'worker': {
      const prompt = parentResults
        ? `Context from previous steps:\n${parentResults}\n\n---\n\nTask:\n${data.prompt}`
        : data.prompt

      const res = await fetch('/api/flow/worker-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: node.id,
          label: data.label ?? node.id,
          model: data.model ?? 'codex',
          prompt,
          role: data.role ?? 'Worker',
          cwd: data.cwd ?? '',
          sharedWorkerKey: data.sharedWorkerKey ?? '',
        }),
        signal,
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const json = await res.json()
      return json.result ?? ''
    }

    case 'branch': {
      // Use LLM to evaluate condition
      const condition = data.conditions?.[0]?.expr ?? 'true'
      const prompt = `Evaluate this condition based on the context. Reply with ONLY "true" or "false".\n\nCondition: ${condition}\n\nContext:\n${parentResults}`

      const res = await fetch('/api/flow/execute-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: data.model ?? 'codex',
          prompt,
          role: 'Evaluator',
        }),
        signal,
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const json = await res.json()
      return json.result ?? 'false'
    }

    case 'loop': {
      const condition = data.condition ?? 'until done'
      const maxIter = data.maxIterations ?? 5
      let loopResult = parentResults
      let iteration = 0

      while (iteration < maxIter && !signal.aborted) {
        iteration++

        // Find the loop-back target (nodes connected via loop-back handle)
        const loopBackEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'loop-back')
        const loopBodyNode = loopBackEdge && nodes ? nodes.find(n => n.id === loopBackEdge.target) : null

        // Execute loop body if there's a loop-back connection
        if (loopBodyNode) {
          const bodyResult = await executeNode(loopBodyNode, loopResult, edges, results, signal)
          if (signal.aborted) break
          loopResult = bodyResult
        }

        // Ask LLM: should we continue looping?
        const evalPrompt = `You are evaluating a loop condition. Based on the current result, should the loop continue?\n\nLoop condition: "${condition}"\nIteration: ${iteration}/${maxIter}\n\nCurrent result:\n${loopResult.slice(0, 2000)}\n\nReply with ONLY "continue" or "done".`

        const res = await fetch('/api/flow/execute-node', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: data.model ?? 'codex', prompt: evalPrompt, role: 'Loop Evaluator' }),
          signal,
        })

        if (!res.ok) break
        const json = await res.json()
        const verdict = (json.result ?? 'done').toLowerCase()

        // Update progress
        const progress = Math.round((iteration / maxIter) * 100)
        onStatusChange?.(node.id, 'running')
        // Store progress for UI
        ;(node.data as any).progress = progress
        onLog?.(`  ↻ ${node.data.label ?? node.id} iteration ${iteration}/${maxIter} — ${verdict}`)

        if (verdict.includes('done') || verdict.includes('stop') || verdict.includes('complete')) {
          break
        }
      }

      return loopResult
    }

    default:
      return parentResults
  }
}
