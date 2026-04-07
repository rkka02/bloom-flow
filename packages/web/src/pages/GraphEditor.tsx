import { useCallback, useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { WorkerNode } from '../components/flow/WorkerNode.js'
import { BranchNode } from '../components/flow/BranchNode.js'
import { LoopNode } from '../components/flow/LoopNode.js'
import { MergeNode } from '../components/flow/MergeNode.js'
import { IONode } from '../components/flow/IONode.js'
import { NodeProperties } from '../components/flow/NodeProperties.js'
import type { NodeStatus } from '../flow/executeGraph.js'
import { normalizeGraph } from '../flow/normalizeGraph.js'
import { useBloomSocket, type ServerEvent } from '../hooks/useBloomSocket.js'

const nodeTypes = {
  worker: WorkerNode,
  branch: BranchNode,
  loop: LoopNode,
  merge: MergeNode,
  input: IONode,
  output: IONode,
}

const defaultData: Record<string, Record<string, any>> = {
  worker: { label: 'New Worker', model: 'codex', role: 'Worker', prompt: '', cwd: '', color: '#4edea3', sharedWorkerKey: '', status: 'idle' },
  branch: { label: 'Condition', model: 'codex', conditions: [{ expr: 'if: condition', target: 'Yes' }, { expr: 'else', target: 'No' }], status: 'idle' },
  loop: { label: 'Loop', model: 'codex', maxIterations: 5, condition: 'until done', progress: 0, status: 'idle' },
  input: { label: 'Input', value: '', direction: 'input' },
  output: { label: 'Output', value: '', direction: 'output' },
}

function createSharedWorkerKey(): string {
  return `shared-worker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function createGraphNode(type: string, position: { x: number; y: number }, dataOverride?: Record<string, any>): Node {
  const baseData = {
    ...(defaultData[type] ?? {}),
    ...(dataOverride ?? {}),
  }

  if (type === 'worker' && !baseData.sharedWorkerKey) {
    baseData.sharedWorkerKey = createSharedWorkerKey()
  }

  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    position,
    data: baseData,
  }
}

export interface GraphEditorHandle {
  run: () => void
  stop: () => void
  save: () => void
}

interface Props {
  loadWorkflowId?: string | null
  currentSessionId?: string
  sessions: Array<{ id: string; name?: string; goal: string; status: string }>
  workspace?: {
    rootDir?: string
    cwd?: string
    permissionMode: 'default' | 'dangerously-skip-permissions'
    permissions: { read: boolean; write: boolean; execute: boolean }
  }
  onSwitchSession: (sessionId: string) => void
  onWorkflowLoaded?: () => void
}

export const GraphEditor = forwardRef<GraphEditorHandle, Props>(function GraphEditor({
  loadWorkflowId,
  currentSessionId,
  sessions,
  workspace,
  onSwitchSession,
  onWorkflowLoaded,
}, ref) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const [workflowId, setWorkflowId] = useState<string | null>(null)
  const [workflowName, setWorkflowName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveDesc, setSaveDesc] = useState('')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const graphSourceRef = useRef<'session' | 'workflow'>('session')
  const hydratedRef = useRef(false)
  const previousSessionIdRef = useRef<string | undefined>(undefined)

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }, [])

  const updateNodeStatus = useCallback((nodeId: string, status: NodeStatus) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n
      const borderColor = status === 'running' ? '#4edea3' : status === 'completed' ? '#4edea380' : status === 'error' ? '#ffb4ab' : status === 'skipped' ? '#454652' : undefined
      return {
        ...n,
        data: { ...n.data, status },
        className: status === 'running' ? 'node-running-glow' : '',
        style: borderColor ? { ...n.style } : n.style,
      }
    }))
  }, [setNodes])

  const handleGraphEvent = useCallback((event: ServerEvent) => {
    switch (event.type) {
      case 'graph:run_started':
        if (event.payload.sessionId !== currentSessionId) return
        setActiveRunId(event.payload.runId)
        setLogs([])
        break
      case 'graph:node_status':
        if (event.payload.sessionId !== currentSessionId) return
        if (activeRunId && event.payload.runId !== activeRunId) return
        updateNodeStatus(event.payload.nodeId, event.payload.status as NodeStatus)
        break
      case 'graph:node_result':
        if (event.payload.sessionId !== currentSessionId) return
        if (activeRunId && event.payload.runId !== activeRunId) return
        setNodes(nds => nds.map(node => node.id === event.payload.nodeId
          ? { ...node, data: { ...node.data, result: event.payload.result } }
          : node))
        break
      case 'graph:log':
        if (event.payload.sessionId !== currentSessionId) return
        if (activeRunId && event.payload.runId !== activeRunId) return
        setLogs(prev => [...prev, `[${new Date(event.payload.timestamp).toLocaleTimeString()}] ${event.payload.message}`])
        break
      case 'graph:run_completed':
        if (event.payload.sessionId !== currentSessionId) return
        if (activeRunId && event.payload.runId !== activeRunId) return
        setIsRunning(false)
        setActiveRunId(null)
        if (!event.payload.success && event.payload.error) {
          addLog(`Run failed: ${event.payload.error}`)
        }
        break
      default:
        return
    }
  }, [currentSessionId, activeRunId, updateNodeStatus, setNodes, addLog])

  useBloomSocket(handleGraphEvent)

  const loadSessionGraph = useCallback(async () => {
    const res = await fetch('/api/session/graph')
    if (!res.ok) return false
    const graph = await res.json()
    const normalized = normalizeGraph(graph.nodes ?? [], graph.edges ?? [])
    hydratedRef.current = true
    graphSourceRef.current = 'session'
    setNodes(normalized.nodes)
    setEdges(normalized.edges)
    setWorkflowId(graph.workflowId ?? null)
    setWorkflowName(graph.workflowName ?? '')
    return true
  }, [setNodes, setEdges])

  const persistSessionGraph = useCallback(async (ensureSession: boolean) => {
    const normalized = normalizeGraph(nodes, edges)
    const res = await fetch('/api/session/graph', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: normalized.nodes,
        edges: normalized.edges,
        workflowId,
        workflowName,
        ensureSession,
        workspace,
      }),
    })
    return res.ok
  }, [nodes, edges, workflowId, workflowName, workspace])

  // Load workflow if ID provided
  useEffect(() => {
    if (!loadWorkflowId) return
    fetch(`/api/workflows/${loadWorkflowId}`)
      .then(r => r.ok ? r.json() : null)
      .then(wf => {
        if (wf) {
          const normalized = normalizeGraph(wf.nodes ?? [], wf.edges ?? [])
          hydratedRef.current = true
          graphSourceRef.current = 'workflow'
          setNodes(normalized.nodes)
          setEdges(normalized.edges)
          setWorkflowId(wf.id)
          setWorkflowName(wf.name)
          addLog(`Loaded workflow: ${wf.name}`)
        }
        onWorkflowLoaded?.()
      })
      .catch(() => {})
  }, [loadWorkflowId, addLog, onWorkflowLoaded, setEdges, setNodes])

  useEffect(() => {
    const sessionChanged = previousSessionIdRef.current !== currentSessionId
    previousSessionIdRef.current = currentSessionId

    if (!currentSessionId || loadWorkflowId || (!sessionChanged && graphSourceRef.current === 'workflow')) {
      return
    }

    hydratedRef.current = true
    loadSessionGraph().then(loaded => {
      if (loaded) {
        addLog('Loaded graph from current session.')
      }
    }).catch(() => {})
  }, [currentSessionId, loadWorkflowId, loadSessionGraph, addLog])

  useEffect(() => {
    if (!currentSessionId || graphSourceRef.current !== 'session') return
    if (hydratedRef.current) {
      hydratedRef.current = false
      return
    }

    const timer = window.setTimeout(() => {
      persistSessionGraph(false).catch(() => {})
    }, 400)

    return () => window.clearTimeout(timer)
  }, [currentSessionId, nodes, edges, workflowId, workflowName, persistSessionGraph])

  const handleSave = useCallback(async () => {
    if (!saveName.trim() && !workflowName) return
    const name = saveName.trim() || workflowName
    const normalized = normalizeGraph(nodes, edges)
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: workflowId,
        name,
        description: saveDesc,
        nodes: normalized.nodes,
        edges: normalized.edges,
      }),
    })
    if (res.ok) {
      const wf = await res.json()
      setWorkflowId(wf.id)
      setWorkflowName(wf.name)
      setShowSaveDialog(false)
      addLog(`Saved workflow: ${wf.name}`)
    }
  }, [workflowId, workflowName, saveName, saveDesc, nodes, edges, addLog])

  useImperativeHandle(ref, () => ({
    run: () => handleRun(),
    stop: () => handleStop(),
    save: () => { setSaveName(workflowName); setShowSaveDialog(true) },
  }))

  const handleRun = useCallback(async () => {
    if (nodes.length === 0) return
    const saved = await persistSessionGraph(true)
    if (!saved) {
      addLog('Failed to bind graph to a session.')
      return
    }
    graphSourceRef.current = 'session'
    setIsRunning(true)
    setActiveRunId(null)
    setLogs([])
    const abort = new AbortController()
    abortRef.current = abort

    setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: 'pending' } })))

    try {
      const res = await fetch('/api/session/graph/run', {
        method: 'POST',
        signal: abort.signal,
      })
      if (!res.ok) {
        throw new Error(`Run failed: ${res.status}`)
      }

      const json = await res.json()
      const nodeStatuses = json.nodeStatuses ?? {}
      const nodeResults = json.nodeResults ?? {}

      setNodes(nds => nds.map(node => ({
        ...node,
        data: {
          ...node.data,
          status: nodeStatuses[node.id] ?? node.data.status ?? 'pending',
          result: nodeResults[node.id] ?? node.data.result,
        },
      })))
      setIsRunning(false)
      setActiveRunId(null)
    } catch (error: any) {
      if (!abort.signal.aborted) {
        addLog(`Run failed: ${error.message}`)
        setIsRunning(false)
        setActiveRunId(null)
      }
    }

    abortRef.current = null
  }, [nodes, setNodes, addLog, persistSessionGraph])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    setIsRunning(false)
    addLog('Execution stopped by user.')
  }, [addLog])

  const onConnect = useCallback(
    (connection: Connection) => setEdges(eds => addEdge({
      ...connection,
      style: { stroke: '#454652', strokeWidth: 2 },
      animated: false,
    }, eds)),
    [setEdges],
  )

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const onUpdateNode = useCallback((id: string, data: Record<string, any>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...data } } : n))
    setSelectedNode(prev => prev?.id === id ? { ...prev, data: { ...prev.data, ...data } } : prev)
  }, [setNodes])

  const onDeleteNode = useCallback((id: string) => {
    setNodes(nds => nds.filter(n => n.id !== id))
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id))
    setSelectedNode(prev => prev?.id === id ? null : prev)
  }, [setNodes, setEdges])

  const onDuplicateNode = useCallback((id: string) => {
    const source = nodes.find(node => node.id === id)
    if (!source) return
    const { result: _result, ...copiedData } = (source.data ?? {}) as Record<string, any>

    const duplicate = createGraphNode(
      source.type ?? 'worker',
      { x: source.position.x + 60, y: source.position.y + 60 },
      {
        ...copiedData,
        label: `${source.data?.label ?? 'Node'} Copy`,
        status: 'idle',
        progress: typeof copiedData.progress === 'number' ? 0 : copiedData.progress,
      },
    )

    setNodes(nds => [...nds, duplicate])
    setSelectedNode(duplicate)
  }, [nodes, setNodes])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Backspace' || e.key === 'Delete') && selectedNode) {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'SELECT') return
      onDeleteNode(selectedNode.id)
    }
  }, [selectedNode, onDeleteNode])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/bloom-node')
    if (!type || !defaultData[type]) return

    const bounds = (e.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect()
    if (!bounds) return

    const newNode = createGraphNode(type, { x: e.clientX - bounds.left - 120, y: e.clientY - bounds.top - 40 })
    setNodes(nds => [...nds, newNode])
    setSelectedNode(newNode)
  }, [setNodes])

  return (
    <div className="flex flex-col h-full bg-surface" onKeyDown={onKeyDown} tabIndex={0}>
      <div className="flex flex-1 min-h-0">
        {/* ── Toolbox sidebar w-64 ── */}
        <aside className="flex flex-col py-4 px-3 gap-2 shrink-0 w-64 bg-surface-container-high z-40">
          <div className="px-3 mb-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary-container">
                <span className="material-symbols-outlined text-white text-sm">construction</span>
              </div>
              <span className="text-lg font-black text-primary font-headline">Toolbox</span>
            </div>
            <p className="text-xs text-on-surface-variant font-medium font-body">Drag nodes to canvas</p>
          </div>

          <div className="mx-3 mb-4 p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20">
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 font-label">Session Binding</div>
            <select
              className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container border-none outline-none focus:ring-1 focus:ring-primary appearance-none font-body"
              value={currentSessionId ?? ''}
              onChange={e => {
                if (e.target.value) onSwitchSession(e.target.value)
              }}
            >
              <option value="" disabled>No session selected</option>
              {sessions.map(session => (
                <option key={session.id} value={session.id}>
                  {(session.name || session.goal).slice(0, 32)}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-on-surface-variant mt-2 font-body">
              {currentSessionId
                ? 'This graph loads from and saves to the selected session.'
                : 'A session will be created automatically when you run this graph.'}
            </p>
          </div>

          {toolboxItems.map(item => (
            <div
              key={item.type}
              className="flex items-center gap-3 p-3 rounded-lg cursor-grab transition-all text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50"
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('application/bloom-node', item.type)
                e.dataTransfer.effectAllowed = 'move'
              }}
            >
              <span className="material-symbols-outlined" style={{ color: item.color }}>{item.icon}</span>
              <span className="text-sm font-medium font-body">{item.label}</span>
            </div>
          ))}

          <div className="mt-auto p-3">
            <button
              onClick={() => {
                const type = 'worker'
                const newNode = createGraphNode(type, { x: 200 + Math.random() * 200, y: 150 + Math.random() * 100 })
                setNodes(nds => [...nds, newNode])
                setSelectedNode(newNode)
              }}
              className="w-full py-2.5 bg-primary-container text-on-primary-container rounded-lg font-bold text-sm transition-transform active:scale-95"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Add Node
            </button>
          </div>
        </aside>

        {/* ── Canvas — surface-container-low ── */}
        <div className="flex-1 relative bg-surface-container-low">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes as any}
            fitView
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
            onDrop={onDrop}
            defaultEdgeOptions={{
              style: { stroke: '#454652', strokeWidth: 2 },
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="#454652"
              style={{ opacity: 0.1 }}
            />
            <MiniMap
              nodeColor={n => {
                switch (n.type) {
                  case 'worker': return (n.data as Record<string, any> | undefined)?.color ?? '#4edea3'
                  case 'branch': return '#ffb95f'
                  case 'loop': return '#bbc3ff'
                  case 'merge': return '#bbc3ff'
                  default: return '#8f909e'
                }
              }}
              maskColor="rgba(11,19,38,0.8)"
            />
          </ReactFlow>

          {/* Empty state */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-on-surface-variant/30 text-xl mb-2 font-headline font-bold">
                  Drag nodes from the toolbox
                </div>
                <div className="text-on-surface-variant/20 text-sm font-body">
                  Connect them to build your agent workflow
                </div>
              </div>
            </div>
          )}

          {/* Floating Toolbar — stitch spec */}
          <div className="absolute bottom-10 left-10 flex gap-2 p-2 bg-surface-variant/60 backdrop-blur-md rounded-xl border border-outline-variant/20 shadow-2xl z-40">
            <button className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-bright transition-colors text-on-surface-variant hover:text-white">
              <span className="material-symbols-outlined">zoom_in</span>
            </button>
            <button className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-bright transition-colors text-on-surface-variant hover:text-white">
              <span className="material-symbols-outlined">zoom_out</span>
            </button>
            <div className="w-px h-6 bg-outline-variant/30 self-center" />
            <button className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-bright transition-colors text-on-surface-variant hover:text-white">
              <span className="material-symbols-outlined">center_focus_strong</span>
            </button>
            <div className="w-px h-6 bg-outline-variant/30 self-center" />
            <button className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-bright transition-colors text-on-surface-variant hover:text-white">
              <span className="material-symbols-outlined">undo</span>
            </button>
            <button className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-bright transition-colors text-on-surface-variant hover:text-white">
              <span className="material-symbols-outlined">redo</span>
            </button>
          </div>

          {/* Save Dialog — glassmorphism */}
          {showSaveDialog && (
            <div className="absolute inset-0 flex items-center justify-center z-50 bg-surface/60 backdrop-blur-sm"
              onClick={() => setShowSaveDialog(false)}>
              <div className="w-96 rounded-2xl p-6 bg-surface-container-high shadow-ambient animate-fade-slide-up"
                onClick={e => e.stopPropagation()}>
                <h3 className="text-on-surface font-extrabold text-lg mb-6 font-headline">Save Workflow</h3>
                <div className="flex flex-col gap-4 mb-6">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant block mb-1.5 font-label">Name</label>
                    <input
                      className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none focus:ring-1 focus:ring-primary font-body"
                      value={saveName}
                      onChange={e => setSaveName(e.target.value)}
                      placeholder="My Workflow"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant block mb-1.5 font-label">Description</label>
                    <textarea
                      className="w-full rounded-lg text-sm p-3 text-on-surface bg-surface-container-lowest border-none outline-none resize-none focus:ring-1 focus:ring-primary font-body"
                      rows={3}
                      value={saveDesc}
                      onChange={e => setSaveDesc(e.target.value)}
                      placeholder="What does this workflow do?"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowSaveDialog(false)}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium text-on-surface-variant bg-surface-variant/30 hover:bg-surface-variant/50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={!saveName.trim()}
                    className="flex-1 py-2.5 rounded-lg text-sm font-bold text-on-primary-container bg-primary-container transition-transform active:scale-95 disabled:opacity-30 shadow-lg shadow-primary-container/20">
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Node Properties Panel */}
          <NodeProperties
            node={selectedNode}
            onUpdate={onUpdateNode}
            onDelete={onDeleteNode}
            onDuplicate={onDuplicateNode}
            onClose={() => setSelectedNode(null)}
          />
        </div>
      </div>

      {/* ── Log panel ── */}
      {logs.length > 0 && (
        <div className="h-64 shrink-0 bg-surface-container-lowest border-t border-outline-variant/20 flex flex-col z-20 animate-fade-slide-up">
          <div className="flex items-center justify-between px-4 h-10 bg-surface-container border-b border-outline-variant/10">
            <div className="flex items-center gap-4">
              <span className="text-[11px] font-bold tracking-widest text-secondary flex items-center gap-2 uppercase font-headline">
                <span className="material-symbols-outlined text-sm">terminal</span> Live Execution Logs
              </span>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-secondary animate-pulse" />
                <span className="text-[10px] text-on-surface-variant">Streaming</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setLogs([])} className="text-[10px] text-on-surface-variant hover:text-white transition-colors uppercase font-headline">CLEAR</button>
              <button className="text-[10px] text-on-surface-variant hover:text-white transition-colors uppercase font-headline">DOWNLOAD</button>
              <span className="material-symbols-outlined text-sm cursor-pointer text-on-surface-variant">expand_more</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed">
            <div className="flex flex-col gap-1 text-on-surface-variant">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-4">
                  <span className="text-secondary font-bold flex-shrink-0 w-20">[{log.includes('\u2717') ? 'Error' : log.includes('\u2713') ? 'Success' : 'System'}]</span>
                  <span className={log.includes('\u2717') ? 'text-error' : 'text-on-surface'}>{log}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

const toolboxItems = [
  { type: 'worker', label: 'Worker', color: '#4edea3', icon: 'memory' },
  { type: 'branch', label: 'Branch', color: '#ffb95f', icon: 'alt_route' },
  { type: 'loop', label: 'Loop', color: '#bbc3ff', icon: 'loop' },
  { type: 'input', label: 'Input', color: '#8f909e', icon: 'login' },
  { type: 'output', label: 'Output', color: '#8f909e', icon: 'logout' },
]
