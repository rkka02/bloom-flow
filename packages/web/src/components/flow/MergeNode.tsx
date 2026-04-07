import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { MergeNodeData } from './nodeTypes.js'

export function MergeNode({ data, selected }: NodeProps & { data: MergeNodeData }) {
  return (
    <div className={`w-44 rounded-xl overflow-hidden border-l-4 border-primary bg-surface-container-highest transition-all ${selected ? 'node-aura' : ''}`}>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-primary text-lg">call_merge</span>
          <span className="text-[11px] font-bold tracking-widest uppercase text-primary font-label">Merge</span>
        </div>
        <h3 className="text-on-surface font-medium text-sm font-body">{data.label}</h3>
      </div>
      <Handle type="target" position={Position.Left} id="in-1" style={{ top: '35%' }} className="!bg-primary !w-2.5 !h-2.5 !border-2 !border-surface-container-highest" />
      <Handle type="target" position={Position.Left} id="in-2" style={{ top: '65%' }} className="!bg-primary !w-2.5 !h-2.5 !border-2 !border-surface-container-highest" />
      <Handle type="source" position={Position.Right} className="!bg-primary !w-2.5 !h-2.5 !border-2 !border-surface-container-highest" />
    </div>
  )
}
