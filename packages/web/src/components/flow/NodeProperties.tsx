import { useState, useEffect } from 'react'
import type { Node } from '@xyflow/react'

interface Props {
  node: Node | null
  onUpdate: (id: string, data: Record<string, any>) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onClose: () => void
}

const workerColorPresets = ['#4edea3', '#ffb95f', '#bbc3ff', '#ff8fb1', '#60a5fa', '#f87171']

export function NodeProperties({ node, onUpdate, onDelete, onDuplicate, onClose }: Props) {
  const [formData, setFormData] = useState<Record<string, any>>({})

  useEffect(() => {
    if (node) setFormData({ ...node.data })
  }, [node?.id])

  if (!node) return null

  const nodeType = node.type ?? 'default'
  const set = (key: string, value: any) => setFormData(prev => ({ ...prev, [key]: value }))

  const apply = () => {
    onUpdate(node.id, formData)
  }

  return (
    <div
      className="absolute top-0 right-0 h-full w-80 z-40 overflow-y-auto bg-surface-container-high/90 backdrop-blur-xl animate-fade-slide-up"
      style={{ boxShadow: '-20px 0 40px rgba(6,14,32,0.4)' }}
    >
      {/* Asymmetric padding: spacing-8 top, spacing-5 sides per spec */}
      <div className="px-5 pt-8 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-lg font-extrabold text-on-surface font-headline">Node Properties</h2>
          <button onClick={onClose} className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-colors">
            close
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* Type badge */}
          <Field label="Component Type">
            <div className="p-3 rounded-lg flex items-center gap-3 bg-surface-container-lowest">
              <span className="material-symbols-outlined" style={{ color: typeColor(nodeType) }}>
                {typeIcon(nodeType)}
              </span>
              <span className="text-sm font-medium text-on-surface capitalize font-body">{nodeType} Node</span>
            </div>
          </Field>

          {/* Common: Label */}
          <Field label="Name">
            <input
              className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary font-body"
              value={formData.label ?? ''}
              onChange={e => set('label', e.target.value)}
            />
          </Field>

          {/* Worker fields */}
          {nodeType === 'worker' && (
            <>
              <Field label="Model">
                <select
                  className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary appearance-none font-body"
                  value={formData.model ?? 'codex'}
                  onChange={e => set('model', e.target.value)}
                >
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                  <option value="codex">Codex</option>
                </select>
              </Field>

              <Field label="Role">
                <input
                  className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary font-body"
                  value={formData.role ?? ''}
                  onChange={e => set('role', e.target.value)}
                  placeholder="e.g. Researcher, Analyzer"
                />
              </Field>

              <Field label="Shared Worker Key">
                <input
                  className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary font-mono"
                  value={formData.sharedWorkerKey ?? ''}
                  onChange={e => set('sharedWorkerKey', e.target.value)}
                  placeholder="Workers with the same key share one agent"
                />
              </Field>

              <Field label="Worker Color">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      className="h-11 w-14 cursor-pointer rounded-lg border-none bg-surface-container-lowest p-1"
                      value={formData.color ?? '#4edea3'}
                      onChange={e => set('color', e.target.value)}
                    />
                    <div className="text-xs text-on-surface-variant font-body">
                      Accent color for this worker node.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {workerColorPresets.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => set('color', color)}
                        className={`h-8 w-8 rounded-full transition-transform active:scale-95 ${
                          (formData.color ?? '#4edea3') === color ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container-high' : ''
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              </Field>

              <Field label="Worker Directory">
                <input
                  className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary font-body"
                  value={formData.cwd ?? ''}
                  onChange={e => set('cwd', e.target.value)}
                  placeholder="Optional subdirectory for this worker"
                />
              </Field>

              <Field label="Prompt Configuration">
                <textarea
                  className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary resize-none font-body"
                  rows={6}
                  value={formData.prompt ?? ''}
                  onChange={e => set('prompt', e.target.value)}
                  placeholder="Instructions for this worker..."
                />
              </Field>
            </>
          )}

          {/* Branch fields */}
          {nodeType === 'branch' && (
            <>
            <Field label="Model (evaluator)">
              <select
                className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary appearance-none font-body"
                value={formData.model ?? 'claude'}
                onChange={e => set('model', e.target.value)}
              >
                <option value="codex">Codex</option>
                <option value="gemini">Gemini</option>
                <option value="claude">Claude</option>
              </select>
            </Field>
            <Field label="Condition">
              <input
                className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary font-body"
                value={formData.conditions?.[0]?.expr ?? ''}
                onChange={e => set('conditions', [
                  { expr: e.target.value, target: formData.conditions?.[0]?.target ?? 'Yes' },
                  ...(formData.conditions?.slice(1) ?? [{ expr: 'else', target: 'No' }]),
                ])}
                placeholder="e.g. quality > 0.8"
              />
            </Field>
            </>
          )}

          {/* Loop fields */}
          {nodeType === 'loop' && (
            <>
              <Field label="Model (evaluator)">
                <select
                  className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary appearance-none font-body"
                  value={formData.model ?? 'codex'}
                  onChange={e => set('model', e.target.value)}
                >
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                  <option value="codex">Codex</option>
                </select>
              </Field>
              <Field label="Condition">
                <input
                  className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary font-body"
                  value={formData.condition ?? ''}
                  onChange={e => set('condition', e.target.value)}
                  placeholder="e.g. until tests pass"
                />
              </Field>
              <Field label="Max Iterations">
                <input
                  type="number"
                  className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary font-body"
                  value={formData.maxIterations ?? 5}
                  onChange={e => set('maxIterations', parseInt(e.target.value) || 5)}
                />
              </Field>
            </>
          )}

          {/* IO fields */}
          {(nodeType === 'input' || nodeType === 'output') && (
            <Field label="Value">
              <textarea
                className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary resize-none font-body"
                rows={4}
                value={formData.value ?? ''}
                onChange={e => set('value', e.target.value)}
                placeholder={nodeType === 'input' ? 'Input data or query...' : 'Output destination...'}
              />
            </Field>
          )}

          {/* Actions */}
          <div className="pt-4">
            <button
              onClick={apply}
              className="w-full py-3 rounded-lg font-bold text-sm text-on-primary-container bg-primary-container transition-transform active:scale-95 shadow-lg shadow-primary-container/20 font-body"
            >
              Apply Changes
            </button>
            <button
              onClick={() => onDuplicate(node.id)}
              className="w-full py-2.5 rounded-lg font-medium text-sm mt-2 bg-surface-container-lowest text-on-surface transition-colors hover:bg-surface-container-highest font-body"
            >
              Duplicate Node
            </button>
            <button
              onClick={() => { onDelete(node.id); onClose() }}
              className="w-full py-2.5 rounded-lg font-medium text-sm mt-2 bg-error-container/15 text-error transition-colors hover:bg-error-container/25 font-body"
            >
              Delete Node
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-label">
        {label}
      </label>
      {children}
    </div>
  )
}

function typeColor(type: string): string {
  switch (type) {
    case 'worker': return '#4edea3'
    case 'branch': return '#ffb95f'
    case 'loop': return '#bbc3ff'
    case 'merge': return '#bbc3ff'
    default: return '#8f909e'
  }
}

function typeIcon(type: string): string {
  switch (type) {
    case 'worker': return 'memory'
    case 'branch': return 'alt_route'
    case 'loop': return 'loop'
    case 'merge': return 'call_merge'
    case 'input': return 'input'
    case 'output': return 'output'
    default: return 'circle'
  }
}
