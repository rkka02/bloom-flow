import type { AgentState } from '../App.js'

interface Props {
  agent: AgentState
  onKill: () => void
}

const STATUS_COLOR: Record<string, string> = {
  running: 'bg-secondary',
  idle: 'bg-tertiary',
  stopped: 'bg-outline-variant',
  error: 'bg-error',
}

export function WorkerCard({ agent, onKill }: Props) {
  const isRunning = agent.status === 'running'

  return (
    <div className="bg-surface-container-highest/50 rounded-xl p-3 transition-all hover:bg-surface-container-highest">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLOR[agent.status] ?? 'bg-outline-variant'} ${isRunning ? 'animate-pulse' : ''}`} />
          <span className="text-sm font-semibold text-on-surface font-body">{agent.name}</span>
          <span className="text-[10px] text-on-surface-variant font-label">{agent.status}</span>
        </div>
        {isRunning && (
          <button
            onClick={onKill}
            className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-error/10 text-error hover:bg-error/20 transition-colors font-label"
          >
            Stop
          </button>
        )}
      </div>
      <div className="flex gap-3 mt-2 text-[11px] text-on-surface-variant font-body">
        <span>{agent.model}</span>
        <span>{agent.turnCount} turns</span>
        <span>{agent.tokenUsage.total.toLocaleString()} tok</span>
      </div>
      {agent.currentTaskId && (
        <div className="text-[11px] text-primary mt-1.5 font-medium font-body">
          working on task #{agent.currentTaskId}
        </div>
      )}
    </div>
  )
}
