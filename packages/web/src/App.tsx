import { useState, useCallback, useRef, useEffect } from 'react'
import { useBloomSocket, type ServerEvent } from './hooks/useBloomSocket.js'
import { Dashboard } from './pages/Dashboard.js'
import { GraphEditor, type GraphEditorHandle } from './pages/GraphEditor.js'
import { Orchestrations } from './pages/Orchestrations.js'
import { WorkspaceSettingsModal, type WorkspaceSettingsValue } from './components/WorkspaceSettingsModal.js'

export interface SessionSummaryState {
  id: string
  name?: string
  goal: string
  status: string
  createdAt: string
}

export type TimelineEntry =
  | { type: 'user'; text: string; timestamp: string }
  | { type: 'thought'; text: string; timestamp: string }
  | { type: 'message'; data: MessageState; timestamp: string }
  | { type: 'log'; data: LogEntry; timestamp: string }

export interface SessionState {
  id?: string
  name?: string
  goal?: string
  status?: string
  agents: AgentState[]
  tasks: TaskState[]
  messages: MessageState[]
  logs: LogEntry[]
  coordinatorThoughts: { text: string; timestamp: string }[]
  userMessages: { text: string; timestamp: string }[]
  timeline: TimelineEntry[]
  summary?: string
  sessionList: SessionSummaryState[]
  workspace: WorkspaceSettingsValue
}

export interface AgentState {
  id: string
  role: string
  status: string
  name: string
  model: string
  currentTaskId?: string
  tokenUsage: { prompt: number; completion: number; total: number }
  turnCount: number
}

export interface TaskState {
  id: string
  subject: string
  description: string
  status: string
  owner?: string
  blockedBy: string[]
  result?: string
  error?: string
}

export interface MessageState {
  id: string
  from: string
  to: string
  text: string
  summary?: string
  timestamp: string
}

export interface LogEntry {
  agentId: string
  level: string
  text: string
  timestamp: string
}

const emptyState: SessionState = {
  agents: [],
  tasks: [],
  messages: [],
  logs: [],
  coordinatorThoughts: [],
  userMessages: [],
  timeline: [],
  sessionList: [],
  workspace: {
    rootDir: '',
    cwd: '',
    permissionMode: 'default',
    permissions: { read: true, write: true, execute: true },
  },
}

function isHiddenCoordinatorNotification(message: MessageState): boolean {
  return message.to === 'coordinator' && message.text.includes('<worker-notification')
}

function sortTimeline(entries: TimelineEntry[]): TimelineEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const byTime = a.entry.timestamp.localeCompare(b.entry.timestamp)
      return byTime !== 0 ? byTime : a.index - b.index
    })
    .map(item => item.entry)
}

function appendTimelineEntry(state: SessionState, entry: TimelineEntry): TimelineEntry[] {
  return sortTimeline([...state.timeline, entry])
}

function buildTimelineFromState(data: Pick<SessionState, 'goal' | 'messages' | 'coordinatorThoughts' | 'userMessages'> & { createdAt?: string }): TimelineEntry[] {
  const thoughts = data.coordinatorThoughts ?? []
  const userMessages = data.userMessages ?? []
  const messages = data.messages ?? []

  return sortTimeline([
    ...(data.goal && data.createdAt
      ? [{ type: 'user' as const, text: data.goal, timestamp: data.createdAt }]
      : []),
    ...userMessages.map(message => ({ type: 'user' as const, text: message.text, timestamp: message.timestamp })),
    ...thoughts.map(thought => ({ type: 'thought' as const, text: thought.text, timestamp: thought.timestamp })),
    ...messages
      .filter(message => !isHiddenCoordinatorNotification(message))
      .map(message => ({ type: 'message' as const, data: message, timestamp: message.timestamp })),
  ])
}

function upsertSessionSummary(
  sessions: SessionSummaryState[],
  session: { id: string; name?: string; goal: string; status: string; createdAt: string },
): SessionSummaryState[] {
  const next = sessions.filter(existing => existing.id !== session.id)
  next.unshift({
    id: session.id,
    name: session.name,
    goal: session.goal,
    status: session.status,
    createdAt: session.createdAt,
  })
  return next.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function fetchSessionState(): Promise<Partial<SessionState> | null> {
  try {
    const [sessionRes, tasksRes, messagesRes, agentsRes] = await Promise.all([
      fetch('/api/session'),
      fetch('/api/tasks'),
      fetch('/api/messages'),
      fetch('/api/agents'),
    ])

    if (!sessionRes.ok) return null

    const session = await sessionRes.json()
    const tasks = tasksRes.ok ? await tasksRes.json() : []
    const messages = messagesRes.ok ? await messagesRes.json() : []
    const agents = agentsRes.ok ? await agentsRes.json() : []

    const coordinatorThoughts = (session.coordinatorThoughts ?? []).map((t: any, i: number) =>
      typeof t === 'string'
        ? { text: t, timestamp: new Date(new Date(session.createdAt).getTime() + i * 1000).toISOString() }
        : t
    )
    const userMessages = session.userMessages ?? []
    const normalizedMessages = Array.isArray(messages) ? messages : messages.messages ?? []

    return {
      id: session.id,
      name: session.name,
      goal: session.goal,
      status: session.status,
      summary: session.summary,
      workspace: session.workspace ?? emptyState.workspace,
      coordinatorThoughts,
      userMessages,
      tasks: Array.isArray(tasks) ? tasks : tasks.tasks ?? [],
      messages: normalizedMessages,
      agents: Array.isArray(agents) ? agents : agents.agents ?? [],
      timeline: buildTimelineFromState({
        goal: session.goal,
        createdAt: session.createdAt,
        coordinatorThoughts,
        userMessages,
        messages: normalizedMessages,
      }),
    }
  } catch {
    return null
  }
}

export type ViewMode = 'chat' | 'graph' | 'orchestrations'

const navTabs: { key: ViewMode; label: string }[] = [
  { key: 'graph', label: 'Graph' },
  { key: 'orchestrations', label: 'Orchestrations' },
  { key: 'chat', label: 'Chat' },
]

export function App() {
  const [view, setView] = useState<ViewMode>('chat')
  const [loadWorkflowId, setLoadWorkflowId] = useState<string | null>(null)
  const [state, setState] = useState<SessionState>(emptyState)
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false)
  const graphRef = useRef<GraphEditorHandle>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  // Restore session state + session list on mount
  useEffect(() => {
    fetchSessionState().then(restored => {
      if (restored && restored.id) {
        setState(prev => ({
          ...prev,
          ...restored,
          logs: prev.logs,
          timeline: restored.timeline ?? prev.timeline,
        }))
      }
    })
    fetch('/api/sessions').then(r => r.ok ? r.json() : []).then(list => {
      setState(prev => ({ ...prev, sessionList: Array.isArray(list) ? list : [] }))
    }).catch(() => {})
  }, [])

  const handleEvent = useCallback((event: ServerEvent) => {
    setState(prev => reduceEvent(prev, event))
  }, [])

  const { connected, send } = useBloomSocket(handleEvent)

  const startSession = useCallback((goal: string, model?: string) => {
    if (stateRef.current.id) {
      send({ type: 'session:message', payload: { text: goal } })
    } else {
      setState(prev => ({
        ...prev,
        timeline: appendTimelineEntry(prev, { type: 'user' as const, text: goal, timestamp: new Date().toISOString() }),
      }))
      send({ type: 'session:start', payload: { goal, model, workspace: stateRef.current.workspace } })
    }
  }, [send])

  const saveWorkspaceSettings = useCallback((workspace: WorkspaceSettingsValue) => {
    if (stateRef.current.id) {
      send({ type: 'session:update_workspace', payload: { workspace } })
    } else {
      setState(prev => ({ ...prev, workspace }))
    }
    setShowWorkspaceSettings(false)
  }, [send])

  const stopSession = useCallback(() => {
    send({ type: 'session:stop' })
  }, [send])

  const newSession = useCallback(() => {
    send({ type: 'session:stop' })
    setState(prev => ({ ...emptyState, sessionList: prev.sessionList, workspace: prev.workspace }))
  }, [send])

  const killWorker = useCallback((agentId: string) => {
    send({ type: 'worker:kill', payload: { agentId } })
  }, [send])

  const fetchSessionList = useCallback(() => {
    send({ type: 'session:list' })
  }, [send])

  const switchSession = useCallback((sessionId: string) => {
    send({ type: 'session:switch', payload: { sessionId } })
  }, [send])

  const renameSession = useCallback((sessionId: string, name: string) => {
    send({ type: 'session:rename', payload: { sessionId, name } })
  }, [send])

  const deleteSession = useCallback((sessionId: string) => {
    send({ type: 'session:delete', payload: { sessionId } })
  }, [send])

  return (
    <div className="flex flex-col h-screen bg-surface overflow-hidden">
      {/* ── TopNavBar ── */}
      <header className="flex justify-between items-center px-6 h-16 w-full z-50 bg-surface-container-low sticky top-0 text-on-surface font-body">
        <div className="flex items-center gap-8">
          <span className="font-headline font-bold text-primary tracking-tight text-xl">
            Bloom Flow
          </span>
          <nav className="hidden md:flex gap-6 items-center h-full">
            {navTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={`font-headline font-bold text-lg pb-1 transition-colors scale-95 active:duration-100 ${
                  view === tab.key
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-on-surface-variant border-b-2 border-transparent hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowWorkspaceSettings(true)}
            className="material-symbols-outlined text-on-surface-variant hover:text-white transition-colors"
            title="Workspace settings"
          >
            settings
          </button>
          {view === 'graph' && (
            <>
              <button onClick={() => graphRef.current?.save()} className="material-symbols-outlined text-on-surface-variant hover:text-white transition-colors">save</button>
              <div className="h-8 w-px bg-outline-variant/30 mx-1" />
              <button onClick={() => graphRef.current?.run()} className="px-4 py-1.5 bg-secondary-container text-white rounded-lg font-bold text-sm transition-all active:scale-95">Run</button>
              <button onClick={() => graphRef.current?.stop()} className="px-4 py-1.5 border border-outline-variant text-on-surface-variant rounded-lg font-bold text-sm hover:bg-surface-variant transition-colors">Stop</button>
            </>
          )}
          {view !== 'graph' && (
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
              connected ? 'bg-secondary/10 text-secondary' : 'bg-error/10 text-error'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-secondary' : 'bg-error'}`} />
              {connected ? 'Connected' : 'Disconnected'}
            </div>
          )}
        </div>
      </header>

      {/* ── Content area ── */}
      <div className="flex-1 min-h-0">
        {view === 'orchestrations' ? (
          <Orchestrations
            onOpen={(id) => { setLoadWorkflowId(id); setView('graph') }}
            onNew={() => { setLoadWorkflowId(null); setView('graph') }}
          />
        ) : view === 'chat' ? (
          <Dashboard
            state={state}
            connected={connected}
            onStart={startSession}
            onStop={stopSession}
            onKillWorker={killWorker}
            onListSessions={fetchSessionList}
            onSwitchSession={switchSession}
            onRenameSession={renameSession}
            onDeleteSession={deleteSession}
            onNewSession={newSession}
          />
        ) : (
          <GraphEditor
            ref={graphRef}
            loadWorkflowId={loadWorkflowId}
            currentSessionId={state.id}
            sessions={state.sessionList}
            workspace={state.workspace}
            onSwitchSession={switchSession}
            onWorkflowLoaded={() => setLoadWorkflowId(null)}
          />
        )}
      </div>

      <WorkspaceSettingsModal
        isOpen={showWorkspaceSettings}
        value={state.workspace}
        onClose={() => setShowWorkspaceSettings(false)}
        onSave={saveWorkspaceSettings}
      />

      {/* ── Footer Status Bar ── */}
      <footer className="flex justify-between items-center px-4 w-full z-50 bg-surface-container-lowest h-8 border-t border-outline-variant/20 font-body text-xs uppercase tracking-widest text-secondary transition-all duration-200">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-secondary rounded-full" />
            <span>System Active</span>
          </div>
          <div className="w-px h-3 bg-outline-variant/30" />
          <div className="flex items-center gap-4 text-on-surface-variant">
            <span className="cursor-pointer hover:text-white transition-colors">Terminal</span>
            <span className="cursor-pointer hover:text-white transition-colors">Logs</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-on-surface-variant">Uptime: 99.9%</span>
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">wifi</span>
            <span>LATENCY: 24ms</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function reduceEvent(state: SessionState, event: ServerEvent): SessionState {
  switch (event.type) {
    case 'session:init': {
      const thoughts = (event.payload.coordinatorThoughts ?? []).map((t: any, i: number) =>
        typeof t === 'string' ? { text: t, timestamp: new Date(new Date(event.payload.createdAt).getTime() + i * 1000).toISOString() } : t
      )
      const userMsgs = event.payload.userMessages ?? []
      const msgs = event.payload.messages ?? []
      const restoredTimeline = buildTimelineFromState({
        goal: event.payload.goal,
        createdAt: event.payload.createdAt,
        coordinatorThoughts: thoughts,
        userMessages: userMsgs,
        messages: msgs,
      })

      return {
        ...emptyState,
        sessionList: upsertSessionSummary(state.sessionList, event.payload),
        id: event.payload.id,
        name: event.payload.name,
        goal: event.payload.goal,
        status: event.payload.status,
        workspace: event.payload.workspace ?? state.workspace,
        agents: event.payload.agents ?? [],
        tasks: event.payload.tasks ?? [],
        messages: msgs,
        coordinatorThoughts: thoughts,
        userMessages: userMsgs,
        timeline: restoredTimeline,
      }
    }

    case 'session:list':
      return { ...state, sessionList: event.payload }

    case 'session:completed':
      return { ...state, status: 'completed', summary: event.payload.summary }

    case 'task:created':
      return { ...state, tasks: [...state.tasks, event.payload] }

    case 'task:updated':
      return {
        ...state,
        tasks: state.tasks.map(t => t.id === event.payload.id ? event.payload : t),
      }

    case 'worker:spawned':
      return { ...state, agents: [...state.agents, event.payload] }

    case 'worker:status':
      return {
        ...state,
        agents: state.agents.map(a =>
          a.id === event.payload.id
            ? { ...a, status: event.payload.status, currentTaskId: event.payload.currentTaskId }
            : a,
        ),
      }

    case 'worker:stopped':
      return {
        ...state,
        agents: state.agents.map(a =>
          a.id === event.payload.id ? { ...a, status: 'stopped' } : a,
        ),
      }

    case 'message:sent': {
      const isCoordinatorNotification = event.payload.to === 'coordinator' && event.payload.text.includes('<worker-notification')
      return {
        ...state,
        messages: [...state.messages, event.payload],
        timeline: isCoordinatorNotification
          ? state.timeline
          : appendTimelineEntry(state, { type: 'message', data: event.payload, timestamp: event.payload.timestamp }),
      }
    }

    case 'coordinator:thought':
      return {
        ...state,
        coordinatorThoughts: [...state.coordinatorThoughts, { text: event.payload.text, timestamp: event.payload.timestamp }],
        timeline: appendTimelineEntry(state, { type: 'thought', text: event.payload.text, timestamp: event.payload.timestamp }),
      }

    case 'user:message':
      return {
        ...state,
        userMessages: [...state.userMessages, event.payload],
        timeline: appendTimelineEntry(state, { type: 'user', text: event.payload.text, timestamp: event.payload.timestamp }),
      }

    case 'log':
      return {
        ...state,
        logs: [...state.logs, event.payload].slice(-200),
        timeline: appendTimelineEntry(state, { type: 'log', data: event.payload, timestamp: event.payload.timestamp }),
      }

    default:
      return state
  }
}
