import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { LoopNodeData } from './nodeTypes.js'

export function LoopNode({ data, selected }: NodeProps & { data: LoopNodeData }) {
  const isRunning = data.status === 'running'

  return (
    <div className={`w-60 rounded-xl overflow-hidden border-l-4 border-primary bg-surface-container-highest transition-all ${selected ? 'node-aura' : ''} ${isRunning ? 'animate-pulse-glow' : ''}`}>
      <div className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-lg">loop</span>
            <span className="text-[11px] font-bold tracking-widest uppercase text-primary font-label">Loop</span>
          </div>
          {isRunning && <span className="material-symbols-outlined text-primary text-sm animate-spin">sync</span>}
        </div>
        <h3 className="text-on-surface font-medium text-sm mb-1 font-body">{data.label}</h3>
        {data.progress > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-surface-container-lowest">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${data.progress}%` }} />
            </div>
            <span className="text-[10px] text-primary font-bold font-label">{data.progress}%</span>
          </div>
        )}
        <p className="text-[10px] text-on-surface-variant mt-2 font-label">
          {data.condition} (max {data.maxIterations})
        </p>
      </div>
      <Handle type="target" position={Position.Left} className="!bg-primary !w-2.5 !h-2.5 !border-2 !border-surface-container-highest" />
      <Handle type="source" position={Position.Right} className="!bg-primary !w-2.5 !h-2.5 !border-2 !border-surface-container-highest" />
      <Handle type="source" position={Position.Bottom} id="loop-back" className="!bg-tertiary !w-2.5 !h-2.5 !border-2 !border-surface-container-highest" />
    </div>
  )
}
