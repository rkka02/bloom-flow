import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { WorkerNodeData } from './nodeTypes.js'

function friendlyModel(model: string): string {
  if (model.includes('codex')) return 'Codex'
  if (model.includes('gemini')) return 'Gemini'
  if (model.includes('claude')) return 'Claude'
  return model
}

export function WorkerNode({ data, selected }: NodeProps & { data: WorkerNodeData }) {
  const isRunning = data.status === 'running'
  const isDone = data.status === 'completed'
  const accent = data.color || '#4edea3'

  return (
    <div className={`
      w-60 rounded-xl overflow-hidden border-l-4 bg-surface-container-highest transition-all
      ${isRunning ? 'animate-pulse-glow' : selected ? 'node-aura' : ''}
      ${isDone ? 'opacity-70' : ''}
    `}
      style={{ borderLeftColor: accent }}
    >
      <div className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg" style={{ color: accent }}>memory</span>
            <span className="text-[11px] font-bold tracking-widest uppercase font-label" style={{ color: accent }}>Worker</span>
          </div>
          {isRunning && <span className="material-symbols-outlined text-sm animate-pulse" style={{ color: accent }}>radio_button_checked</span>}
          {isDone && <span className="material-symbols-outlined text-sm" style={{ color: accent }}>check_circle</span>}
        </div>
        <h3 className="text-on-surface font-medium text-sm mb-1 font-body">{data.label}</h3>
        <p className="text-[10px] text-on-surface-variant tracking-wider uppercase font-label">
          {isRunning ? 'Running...' : isDone ? 'Completed' : friendlyModel(data.model)}
        </p>
      </div>
      {/* Footer — tonal shift, no hard border */}
      <div className="px-4 py-2 bg-surface-container-lowest/30 flex justify-between items-center">
        <span className="text-[10px] text-on-surface-variant font-mono">{data.role}</span>
        <span className="text-[10px] text-on-surface-variant font-label">{friendlyModel(data.model)}</span>
      </div>
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !border-2 !border-surface-container-highest" style={{ backgroundColor: accent }} />
      <Handle type="target" position={Position.Top} id="feedback-top" className="!bg-tertiary !w-2.5 !h-2.5 !border-2 !border-surface-container-highest" />
      <Handle type="target" position={Position.Bottom} id="feedback-bottom" className="!bg-tertiary !w-2.5 !h-2.5 !border-2 !border-surface-container-highest" />
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !border-2 !border-surface-container-highest" style={{ backgroundColor: accent }} />
    </div>
  )
}
