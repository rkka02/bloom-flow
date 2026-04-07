import { useState, useEffect } from 'react'
import type { SessionSummaryState } from '../App.js'

interface Props {
  sessions: SessionSummaryState[]
  currentSessionId?: string
  onSwitch: (sessionId: string) => void
  onRename: (sessionId: string, name: string) => void
  onDelete: (sessionId: string) => void
  onRefresh: () => void
  onNewSession: () => void
}

export function SessionList({ sessions, currentSessionId, onSwitch, onRename, onDelete, onRefresh, onNewSession }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    if (expanded) onRefresh()
  }, [expanded])

  const startRename = (id: string, currentName: string) => {
    setEditingId(id)
    setEditName(currentName)
  }

  const commitRename = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="bg-surface-container-low rounded-2xl p-4 shrink-0">
      {/* Toggle header */}
      <button
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`material-symbols-outlined text-sm text-on-surface-variant transition-transform ${expanded ? 'rotate-90' : ''}`}>
          chevron_right
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-label flex-1">
          Sessions
        </span>
        <span className="text-[10px] bg-surface-container-highest text-on-surface-variant rounded-full px-2 py-0.5 font-medium font-label">
          {sessions.length}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 flex flex-col gap-2 max-h-[300px] overflow-auto">
          {/* New session button */}
          <button
            onClick={onNewSession}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-primary bg-primary-container/15 border border-dashed border-primary/20 hover:bg-primary-container/25 transition-colors text-center font-body"
          >
            + New Session
          </button>

          {sessions.length === 0 && (
            <div className="text-on-surface-variant/50 text-sm text-center py-4 font-body">No saved sessions</div>
          )}

          {sessions.map(s => (
            <div
              key={s.id}
              className={`rounded-xl p-3 cursor-pointer transition-all ${
                s.id === currentSessionId
                  ? 'bg-primary-container/15'
                  : 'bg-surface-container-highest/30 hover:bg-surface-container-highest/60'
              }`}
              onClick={() => {
                if (editingId !== s.id && s.id !== currentSessionId) onSwitch(s.id)
              }}
            >
              <div className="flex items-center gap-2">
                {editingId === s.id ? (
                  <input
                    className="text-sm font-semibold text-on-surface bg-surface-container-lowest rounded-md px-2 py-0.5 border-none outline-none focus:ring-1 focus:ring-primary flex-1 font-body"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null) }}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="text-sm font-semibold text-on-surface overflow-hidden text-ellipsis whitespace-nowrap flex-1 font-body"
                    onDoubleClick={(e) => { e.stopPropagation(); startRename(s.id, s.name ?? s.goal.slice(0, 40)) }}
                    title="Double-click to rename"
                  >
                    {s.name ?? s.goal.slice(0, 40)}
                  </span>
                )}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 font-label ${
                  s.status === 'active'
                    ? 'bg-secondary/15 text-secondary'
                    : s.status === 'completed'
                      ? 'bg-secondary/10 text-secondary/70'
                      : 'bg-surface-container-highest text-on-surface-variant'
                }`}>
                  {s.status}
                </span>
                {s.id !== currentSessionId && (
                  <button
                    className="text-on-surface-variant/30 hover:text-error transition-colors text-sm shrink-0"
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete this session?`)) onDelete(s.id) }}
                    title="Delete session"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                )}
              </div>
              <div className="text-[11px] text-on-surface-variant/60 mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-body">
                {s.goal}
              </div>
              <div className="text-[10px] text-on-surface-variant/30 mt-0.5 font-label">
                {new Date(s.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
