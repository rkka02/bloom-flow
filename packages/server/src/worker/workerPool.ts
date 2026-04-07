import { randomUUID } from 'node:crypto'
import type { Agent, AgentId } from '@bloom/shared'
import { runWorker, type WorkerConfig } from './workerLoop.js'
import { broadcast } from '../ws/broadcaster.js'
import { normalizeModelName } from '../llm/models.js'

interface ActiveWorker {
  agent: Agent
  abort: AbortController
  promise: Promise<void>
}

const workers = new Map<AgentId, ActiveWorker>()

export function spawnWorker(opts: {
  name: string
  model: string
  sessionId: string
  prompt?: string
  taskId?: string
  graphNodeId?: string
  sharedWorkerKey?: string
  replyTo?: string
  workspace?: Agent['workspace']
}): Agent {
  const id = `worker-${randomUUID().slice(0, 8)}`
  const agent: Agent = {
    id,
    role: 'worker',
    status: 'running',
    name: opts.name,
    model: normalizeModelName(opts.model),
    graphNodeId: opts.graphNodeId,
    sharedWorkerKey: opts.sharedWorkerKey,
    workspace: opts.workspace,
    currentTaskId: opts.taskId,
    createdAt: new Date().toISOString(),
    tokenUsage: { prompt: 0, completion: 0, total: 0 },
    turnCount: 0,
  }

  const abort = new AbortController()
  const config: WorkerConfig = {
    agent,
    sessionId: opts.sessionId,
    prompt: opts.prompt,
    taskId: opts.taskId,
    replyTo: opts.replyTo,
    lifecycleAbort: abort,
  }

  const promise = runWorker(config).catch(err => {
    agent.status = 'error'
    broadcast({
      type: 'log',
      payload: {
        agentId: id,
        level: 'error',
        text: `Worker crashed: ${err.message}`,
        timestamp: new Date().toISOString(),
      },
    })
  })

  workers.set(id, { agent, abort, promise })
  broadcast({ type: 'worker:spawned', payload: agent })
  return agent
}

export function restoreWorker(
  agent: Agent,
  opts: { sessionId: string; prompt?: string; taskId?: string; replyTo?: string },
): Agent {
  const existing = workers.get(agent.id)
  if (existing) return existing.agent

  agent.model = normalizeModelName(agent.model)
  if (agent.status === 'stopped') agent.status = 'idle'

  const abort = new AbortController()
  const config: WorkerConfig = {
    agent,
    sessionId: opts.sessionId,
    prompt: opts.prompt,
    taskId: opts.taskId ?? agent.currentTaskId,
    replyTo: opts.replyTo,
    lifecycleAbort: abort,
  }

  const promise = runWorker(config).catch(err => {
    agent.status = 'error'
    broadcast({
      type: 'log',
      payload: {
        agentId: agent.id,
        level: 'error',
        text: `Worker crashed: ${err.message}`,
        timestamp: new Date().toISOString(),
      },
    })
  })

  workers.set(agent.id, { agent, abort, promise })
  broadcast({ type: 'worker:spawned', payload: agent })
  return agent
}

export function restoreWorkers(session: { id: string; agents: Agent[] }): void {
  for (const agent of session.agents) {
    if (agent.role !== 'worker' || agent.status === 'stopped') continue
    restoreWorker(agent, { sessionId: session.id })
  }
}

export function killWorker(agentId: AgentId): boolean {
  const w = workers.get(agentId)
  if (!w) return false

  w.abort.abort()
  w.agent.status = 'stopped'
  broadcast({ type: 'worker:stopped', payload: { id: agentId, reason: 'killed' } })
  workers.delete(agentId)
  return true
}

export function getWorker(agentId: AgentId): Agent | undefined {
  return workers.get(agentId)?.agent
}

export function getWorkerByGraphNode(graphNodeId: string): Agent | undefined {
  for (const { agent } of workers.values()) {
    if (agent.graphNodeId === graphNodeId) return agent
  }
  return undefined
}

export function getWorkerBySharedWorkerKey(sharedWorkerKey: string): Agent | undefined {
  for (const { agent } of workers.values()) {
    if (agent.sharedWorkerKey === sharedWorkerKey) return agent
  }
  return undefined
}

export function getWorkerForGraphNode(graphNodeId: string, sharedWorkerKey?: string): Agent | undefined {
  if (sharedWorkerKey) {
    const sharedWorker = getWorkerBySharedWorkerKey(sharedWorkerKey)
    if (sharedWorker) return sharedWorker
  }
  return getWorkerByGraphNode(graphNodeId)
}

export function listWorkers(): Agent[] {
  return [...workers.values()].map(w => w.agent)
}

export async function killAllWorkers(): Promise<void> {
  for (const [id] of workers) {
    killWorker(id)
  }
}

export async function waitForAll(): Promise<void> {
  await Promise.allSettled([...workers.values()].map(w => w.promise))
}
