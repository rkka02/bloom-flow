import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { BranchNodeData } from './nodeTypes.js'

export function BranchNode({ data, selected }: NodeProps & { data: BranchNodeData }) {
  return (
    <div className={`w-60 overflow-visible transition-all ${selected ? 'node-aura' : ''}`}>
      <div className="rounded-xl overflow-visible border-l-4 border-tertiary bg-surface-container-highest">
        <div className="p-4">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-tertiary text-lg">alt_route</span>
              <span className="text-[11px] font-bold tracking-widest uppercase text-tertiary font-label">Branch</span>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant text-sm">hourglass_empty</span>
          </div>
          <h3 className="text-on-surface font-medium text-sm mb-3 font-body">{data.label}</h3>
          <div className="flex flex-col gap-1.5">
            {data.conditions.map((c, i) => (
              <div key={i} className="relative flex items-center justify-between px-2 py-1 pr-7 rounded text-[10px] text-on-surface-variant bg-surface-container font-label">
                <span>{c.expr}</span>
                <span className={i === 0 ? 'text-secondary' : 'text-tertiary'}>{c.target}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={i === 0 ? 'true' : 'false'}
                  style={{ top: '50%', right: -10, transform: 'translateY(-50%)' }}
                  className={`${i === 0 ? '!bg-secondary' : '!bg-tertiary'} !w-2.5 !h-2.5 !border-2 !border-surface-container-highest`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <Handle type="target" position={Position.Left} className="!bg-tertiary !w-2.5 !h-2.5 !border-2 !border-surface-container-highest" />
    </div>
  )
}
