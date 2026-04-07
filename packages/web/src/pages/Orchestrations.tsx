import { useState, useEffect, useCallback } from 'react'

interface WorkflowSummary {
  id: string
  name: string
  description: string
  nodeCount: number
  edgeCount: number
  createdAt: string
  updatedAt: string
}

interface Props {
  onOpen: (id: string) => void
  onNew: () => void
}

export function Orchestrations({ onOpen, onNew }: Props) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [loading, setLoading] = useState(true)

  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await fetch('/api/workflows')
      if (res.ok) setWorkflows(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchWorkflows() }, [fetchWorkflows])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    await fetch(`/api/workflows/${id}`, { method: 'DELETE' })
    fetchWorkflows()
  }

  return (
    <div className="h-full bg-surface-container-low overflow-y-auto flex justify-center">
      <div className="w-full max-w-5xl px-8 py-12">
        {/* Title + Create button */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-on-surface font-headline tracking-tight">
            Orchestration Templates
          </h1>
          <button
            onClick={onNew}
            className="px-10 py-5 bg-primary-container text-on-primary-container font-bold text-lg rounded-2xl flex items-center gap-3 shadow-lg shadow-primary-container/20 hover:scale-[1.02] transition-transform active:scale-95"
          >
            <span className="material-symbols-outlined text-2xl">auto_awesome</span>
            Create New Workflow
          </button>
        </div>

        {/* Search */}
        <div className="relative group mb-12">
          <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-outline text-xl group-focus-within:text-primary transition-colors">
            search
          </span>
          <input
            className="w-full bg-surface-container-lowest ring-1 ring-outline-variant/30 focus:ring-2 focus:ring-primary/50 rounded-2xl py-4 pl-14 pr-5 text-on-surface placeholder:text-outline/60 font-body text-base transition-all border-none outline-none"
            placeholder="Search your flows, agents, or templates..."
          />
        </div>

        {/* Cards */}
        {loading && (
          <div className="text-on-surface-variant/50 text-center py-20 font-body text-lg">Loading...</div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workflows.map((wf, index) => (
              <div
                key={wf.id}
                className="group relative bg-surface-container-high rounded-2xl overflow-hidden border border-outline-variant/5 hover:border-primary/20 transition-all duration-300 flex flex-col cursor-pointer animate-fade-slide-up"
                style={{ animationDelay: `${index * 60}ms` }}
                onClick={() => onOpen(wf.id)}
              >
                <div className={`absolute top-0 left-0 w-1 h-12 rounded-full mt-6 ${
                  index % 3 === 0 ? 'bg-secondary' : index % 3 === 1 ? 'bg-tertiary' : 'bg-primary'
                }`} />

                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-headline font-bold text-lg text-primary-fixed-dim">{wf.name}</h3>
                      {wf.description && (
                        <p className="text-xs text-on-surface-variant font-body mt-1.5 line-clamp-2">{wf.description}</p>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(wf.id, wf.name) }}
                      className="material-symbols-outlined text-on-surface-variant/40 hover:text-white transition-colors text-lg opacity-0 group-hover:opacity-100"
                    >
                      delete
                    </button>
                  </div>

                  <div className="h-32 bg-surface-container-lowest/50 rounded-xl mb-5 relative overflow-hidden flex items-center justify-center border border-outline-variant/10">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-lg bg-surface-container-highest border border-secondary/40 flex items-center justify-center">
                        <span className="material-symbols-outlined text-secondary text-base">terminal</span>
                      </div>
                      <div className="w-12 h-0.5 bg-outline-variant/30" />
                      <div className="w-9 h-9 rounded-lg bg-surface-container-highest border border-primary/40 flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-base">security</span>
                      </div>
                      <div className="w-12 h-0.5 bg-outline-variant/30" />
                      <div className="w-9 h-9 rounded-lg bg-surface-container-highest border border-tertiary/40 flex items-center justify-center">
                        <span className="material-symbols-outlined text-tertiary text-base">chat</span>
                      </div>
                    </div>
                    <div className="absolute inset-0 opacity-10 pointer-events-none"
                      style={{ backgroundImage: 'radial-gradient(#454652 1px, transparent 0)', backgroundSize: '12px 12px' }} />
                  </div>

                  <div className="flex items-center justify-between text-[11px] uppercase tracking-wider font-bold text-outline">
                    <span>{wf.nodeCount} Nodes</span>
                    <span>{wf.edgeCount} Edges</span>
                  </div>
                </div>

                <div className="mt-auto p-4 bg-surface-variant/40 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-secondary" />
                    <span className="text-xs text-on-surface-variant">{new Date(wf.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <button className="text-xs font-bold text-primary hover:underline">View Flow</button>
                </div>
              </div>
            ))}

            {/* Add card */}
            <div
              onClick={onNew}
              className="border-2 border-dashed border-outline-variant/20 rounded-2xl flex flex-col items-center justify-center p-10 hover:bg-surface-container-high/30 transition-colors cursor-pointer group min-h-[280px]"
            >
              <div className="w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-primary text-4xl">add_circle</span>
              </div>
              <p className="font-bold text-on-surface-variant font-headline text-lg">New Template</p>
              <p className="text-sm text-outline text-center mt-2 font-body max-w-[200px]">
                Start with a blank canvas or browse community nodes.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
