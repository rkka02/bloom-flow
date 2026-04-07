import { useEffect, useState } from 'react'

export interface WorkspaceSettingsValue {
  rootDir?: string
  cwd?: string
  permissionMode: 'default' | 'dangerously-skip-permissions'
  permissions: {
    read: boolean
    write: boolean
    execute: boolean
  }
}

interface Props {
  isOpen: boolean
  value: WorkspaceSettingsValue
  onClose: () => void
  onSave: (value: WorkspaceSettingsValue) => void
}

export function WorkspaceSettingsModal({ isOpen, value, onClose, onSave }: Props) {
  const [form, setForm] = useState<WorkspaceSettingsValue>(value)

  useEffect(() => {
    setForm(value)
  }, [value, isOpen])

  if (!isOpen) return null

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-surface/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[520px] max-w-[calc(100vw-32px)] rounded-2xl bg-surface-container-high p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-lg font-extrabold text-on-surface font-headline">Workspace Settings</h3>
            <p className="text-sm text-on-surface-variant mt-1 font-body">Set the team root directory and local CLI permission mode for this session.</p>
            <p className="text-xs text-on-surface-variant/80 mt-2 font-body">Use <code>default</code> unless you explicitly want the providers to bypass their normal approval flow.</p>
          </div>
          <button onClick={onClose} className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-colors">close</button>
        </div>

        <div className="flex flex-col gap-4">
          <Field label="Team Root Folder">
            <input
              className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary font-body"
              value={form.rootDir ?? ''}
              onChange={e => setForm(prev => ({ ...prev, rootDir: e.target.value }))}
              placeholder="/absolute/path/to/team/root"
            />
          </Field>

          <Field label="Default Working Directory">
            <input
              className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary font-body"
              value={form.cwd ?? ''}
              onChange={e => setForm(prev => ({ ...prev, cwd: e.target.value }))}
              placeholder="/absolute/path/to/default/cwd"
            />
          </Field>

          <Field label="Permission Mode">
            <select
              className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary appearance-none font-body"
              value={form.permissionMode}
              onChange={e => setForm(prev => ({ ...prev, permissionMode: e.target.value as WorkspaceSettingsValue['permissionMode'] }))}
            >
              <option value="default">default</option>
              <option value="dangerously-skip-permissions">dangerously-skip-permissions</option>
            </select>
          </Field>

          <Field label="Permissions">
            <div className="grid grid-cols-3 gap-2">
              {([
                ['read', 'Read'],
                ['write', 'Write'],
                ['execute', 'Execute'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded-lg bg-surface-container-lowest px-3 py-3 text-sm text-on-surface font-body">
                  <input
                    type="checkbox"
                    checked={form.permissions[key]}
                    onChange={e => setForm(prev => ({ ...prev, permissions: { ...prev.permissions, [key]: e.target.checked } }))}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-on-surface-variant/80 font-body mt-2">
              These flags are advisory context for agents. The enforced runtime boundary comes from the provider CLI permission mode above.
            </p>
          </Field>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant bg-surface-variant/30 hover:bg-surface-variant/50 transition-colors">Cancel</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 rounded-lg text-sm font-bold text-on-primary-container bg-primary-container transition-transform active:scale-95">Save</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-label">{label}</label>
      {children}
    </div>
  )
}
