import type { Task, TaskId } from './types.js'

/** Check if a task is blocked by incomplete dependencies */
export function isBlocked(task: Task, allTasks: Task[]): boolean {
  if (task.blockedBy.length === 0) return false
  const completed = new Set(
    allTasks.filter(t => t.status === 'completed').map(t => t.id),
  )
  return task.blockedBy.some(id => !completed.has(id))
}

/** Get all tasks that are pending and have no unresolved blockers */
export function getReadyTasks(allTasks: Task[]): Task[] {
  return allTasks.filter(
    t => t.status === 'pending' && !t.owner && !isBlocked(t, allTasks),
  )
}

/** Topological sort for display/execution order */
export function topoSort(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const visited = new Set<TaskId>()
  const result: Task[] = []

  function visit(id: TaskId) {
    if (visited.has(id)) return
    visited.add(id)
    const task = byId.get(id)
    if (!task) return
    for (const dep of task.blockedBy) visit(dep)
    result.push(task)
  }

  for (const t of tasks) visit(t.id)
  return result
}
