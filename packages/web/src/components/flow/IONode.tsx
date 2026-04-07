import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { IONodeData } from './nodeTypes.js'

export function IONode({ data, selected }: NodeProps & { data: IONodeData }) {
  const isInput = data.direction === 'input'

  return (
    <div className={`w-48 rounded-xl overflow-hidden border-l-4 bg-surface-container-highest transition-all ${selected ? 'node-aura' : ''} ${isInput ? 'border-primary' : 'border-outline'}`}>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className={`material-symbols-outlined text-sm ${isInput ? 'text-primary' : 'text-outline'}`}>
            {isInput ? 'input' : 'output'}
          </span>
          <span className={`text-[11px] font-bold tracking-widest uppercase font-label ${isInput ? 'text-primary' : 'text-outline'}`}>
            {isInput ? 'Input' : 'Output'}
          </span>
        </div>
        <h3 className="text-on-surface font-medium text-sm font-body">{data.label}</h3>
        {data.value && (
          <p className="text-[10px] text-on-surface-variant mt-2 line-clamp-2 font-body">{data.value}</p>
        )}
      </div>
      {isInput && <Handle type="source" position={Position.Right} className="!bg-primary !w-2.5 !h-2.5 !border-2 !border-surface-container-highest" />}
      {!isInput && <Handle type="target" position={Position.Left} className="!bg-outline !w-2.5 !h-2.5 !border-2 !border-surface-container-highest" />}
    </div>
  )
}
