import { AsyncLocalStorage } from 'node:async_hooks'
import type { AgentId, TaskId } from '@bloom/shared'

export interface WorkerContextData {
  agentId: AgentId
  name: string
  sessionId: string
  currentTaskId?: TaskId
}

const storage = new AsyncLocalStorage<WorkerContextData>()

export function runInWorkerContext<T>(
  ctx: WorkerContextData,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return storage.run(ctx, fn)
}

export function getWorkerContext(): WorkerContextData | undefined {
  return storage.getStore()
}

export function getAgentId(): AgentId | undefined {
  return storage.getStore()?.agentId
}

export function getAgentName(): string | undefined {
  return storage.getStore()?.name
}
