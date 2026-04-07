import type { TaskState } from '../App.js'

interface Props {
  tasks: TaskState[]
}

const STATUS_ORDER = ['pending', 'in_progress', 'completed', 'failed']

const STATUS_CONFIG: Record<string, { bg: string; text: string; accent: string; label: string }> = {
  pending: { bg: 'bg-surface-container-highest/50', text: 'text-on-surface-variant', accent: 'bg-outline-variant', label: 'Pending' },
  in_progress: { bg: 'bg-tertiary/10', text: 'text-tertiary', accent: 'bg-tertiary', label: 'In Progress' },
  completed: { bg: 'bg-secondary/10', text: 'text-secondary', accent: 'bg-secondary', label: 'Done' },
  failed: { bg: 'bg-error/10', text: 'text-error', accent: 'bg-error', label: 'Failed' },
}

export function TaskBoard({ tasks }: Props) {
  if (tasks.length === 0) {
    return <div className="text-on-surface-variant/50 text-sm text-center py-6 font-body">No tasks yet</div>
  }

  return (
    <div className="flex flex-col gap-2 overflow-auto max-h-[400px]">
      {tasks
        .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
        .map(task => (
          <TaskItem key={task.id} task={task} />
        ))}
    </div>
  )
}

function TaskItem({ task }: { task: TaskState }) {
  const config = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending

  return (
    <div className={`${config.bg} rounded-xl pl-3 pr-3 py-2.5 border-l-[3px] ${config.accent.replace('bg-', 'border-')}`}>
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-on-surface font-body">#{task.id} {task.subject}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${config.text} font-label`}>
          {config.label}
        </span>
      </div>
      {task.owner && (
        <div className="text-[11px] text-on-surface-variant mt-1 font-body">
          assigned to {task.owner}
        </div>
      )}
      {task.result && (
        <div className="text-xs text-secondary mt-2 max-h-16 overflow-auto whitespace-pre-wrap leading-relaxed bg-secondary/5 px-2 py-1 rounded-lg font-body">
          {task.result.slice(0, 300)}{task.result.length > 300 ? '...' : ''}
        </div>
      )}
      {task.error && (
        <div className="text-xs text-error mt-1 font-body">{task.error}</div>
      )}
    </div>
  )
}
