import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Task, TaskId, AgentId } from '@bloom/shared'
import { normalizePersistedId } from '../security.js'

const BLOOM_DIR = join(process.env.BLOOM_HOME?.trim() || process.env.HOME || process.env.USERPROFILE || '.', '.bloom')

function tasksDir(sessionId: string): string {
  return join(BLOOM_DIR, 'sessions', normalizePersistedId(sessionId, 'session id'), 'tasks')
}

function taskPath(sessionId: string, taskId: TaskId): string {
  return join(tasksDir(sessionId), `${normalizePersistedId(taskId, 'task id')}.json`)
}

let nextId = 1

export async function createTask(
  sessionId: string,
  data: Pick<Task, 'subject' | 'description'> & { blockedBy?: TaskId[] },
): Promise<Task> {
  const dir = tasksDir(sessionId)
  await mkdir(dir, { recursive: true })

  const task: Task = {
    id: String(nextId++),
    subject: data.subject,
    description: data.description,
    status: 'pending',
    blockedBy: data.blockedBy ?? [],
    blocks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await writeFile(taskPath(sessionId, task.id), JSON.stringify(task, null, 2))

  // Update reverse deps
  for (const depId of task.blockedBy) {
    const dep = await getTask(sessionId, depId)
    if (dep && !dep.blocks.includes(task.id)) {
      dep.blocks.push(task.id)
      dep.updatedAt = new Date().toISOString()
      await writeFile(taskPath(sessionId, depId), JSON.stringify(dep, null, 2))
    }
  }

  return task
}

export async function getTask(sessionId: string, taskId: TaskId): Promise<Task | null> {
  try {
    const raw = await readFile(taskPath(sessionId, taskId), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function listTasks(sessionId: string): Promise<Task[]> {
  const dir = tasksDir(sessionId)
  await mkdir(dir, { recursive: true })

  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return []
  }

  const tasks: Task[] = []
  for (const file of files.filter(f => f.endsWith('.json')).sort()) {
    try {
      const raw = await readFile(join(dir, file), 'utf-8')
      tasks.push(JSON.parse(raw))
    } catch {
      // skip
    }
  }
  return tasks
}

export async function updateTask(
  sessionId: string,
  taskId: TaskId,
  updates: Partial<Pick<Task, 'status' | 'owner' | 'result' | 'error'>>,
): Promise<Task | null> {
  const task = await getTask(sessionId, taskId)
  if (!task) return null

  Object.assign(task, updates, { updatedAt: new Date().toISOString() })
  await writeFile(taskPath(sessionId, taskId), JSON.stringify(task, null, 2))
  return task
}

/** Atomically claim a pending task for a worker (work-stealing) */
export async function claimTask(
  sessionId: string,
  taskId: TaskId,
  agentId: AgentId,
): Promise<Task | null> {
  const task = await getTask(sessionId, taskId)
  if (!task || task.status !== 'pending' || task.owner) return null

  task.owner = agentId
  task.status = 'in_progress'
  task.updatedAt = new Date().toISOString()
  await writeFile(taskPath(sessionId, taskId), JSON.stringify(task, null, 2))
  return task
}

/** Reset task ID counter (for new sessions) */
export function resetTaskIds(): void {
  nextId = 1
}
