import type { SessionState } from '../App.js'
import { TaskBoard } from '../components/TaskBoard.js'
import { WorkerCard } from '../components/WorkerCard.js'
import { MessageFlow } from '../components/MessageFlow.js'
import { ChatInput } from '../components/ChatInput.js'
import { SessionList } from '../components/SessionList.js'

interface Props {
  state: SessionState
  connected: boolean
  onStart: (goal: string, model?: string) => void
  onStop: () => void
  onKillWorker: (id: string) => void
  onListSessions: () => void
  onSwitchSession: (sessionId: string) => void
  onRenameSession: (sessionId: string, name: string) => void
  onDeleteSession: (sessionId: string) => void
  onNewSession: () => void
}

export function Dashboard({
  state,
  connected,
  onStart,
  onStop,
  onKillWorker,
  onListSessions,
  onSwitchSession,
  onRenameSession,
  onDeleteSession,
  onNewSession,
}: Props) {
  const workers = state.agents.filter(a => a.role === 'worker')
  const isActive = state.status === 'active'

  return (
    <div className="h-full min-h-0 bg-surface">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1680px] flex-col px-4 py-4 lg:px-6 lg:py-5">
        {state.goal && (
          <div className="mb-4 flex shrink-0 items-center gap-3 rounded-2xl border border-outline-variant/10 bg-linear-to-r from-surface-container-low to-surface-container px-4 py-3 shadow-ambient animate-fade-slide-up">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary font-label">Goal</span>
            <span className="min-w-0 flex-1 truncate text-sm text-on-surface font-body">{state.goal}</span>
            {state.status && (
              <span className={`ml-auto rounded-full px-3 py-1 text-[11px] font-semibold ${
                state.status === 'active'
                  ? 'bg-secondary/15 text-secondary'
                  : state.status === 'completed'
                    ? 'bg-secondary/10 text-secondary'
                    : 'bg-surface-container-highest text-on-surface-variant'
              }`}>
                {state.status}
              </span>
            )}
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.8fr)_360px]">
          <div className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-outline-variant/10 bg-linear-to-b from-surface-container-low to-surface-container shadow-ambient">
            <div className="flex shrink-0 items-center justify-between border-b border-outline-variant/10 px-5 py-4">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant/65 font-label">Conversation</div>
                <div className="mt-1 truncate text-lg font-headline font-bold text-on-surface">
                  {state.name || state.goal || 'New session'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ${
                  connected ? 'bg-secondary/12 text-secondary' : 'bg-error/12 text-error'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-secondary' : 'bg-error'}`} />
                  {connected ? 'Live' : 'Offline'}
                </div>
                <div className="hidden rounded-full bg-surface-container-high px-3 py-1 text-[11px] text-on-surface-variant md:block">
                  {state.timeline.length} events
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 md:px-5">
              <MessageFlow timeline={state.timeline} />
            </div>

            <div className="shrink-0 border-t border-outline-variant/10 bg-surface-container-lowest/50 px-4 py-4 md:px-5">
              <ChatInput
                isActive={isActive}
                onSend={onStart}
                onStop={onStop}
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
            <SessionList
              sessions={state.sessionList}
              currentSessionId={state.id}
              onSwitch={onSwitchSession}
              onRename={onRenameSession}
              onDelete={onDeleteSession}
              onRefresh={onListSessions}
              onNewSession={onNewSession}
            />

            {state.id && (
              <div className="shrink-0 rounded-2xl border border-outline-variant/10 bg-surface-container-low p-5 shadow-ambient animate-fade-slide-up">
                <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-label">Session</div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">ID</span>
                    <span className="font-mono text-xs font-medium text-on-surface">{state.id.slice(0, 8)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">Tasks</span>
                    <span className="font-medium text-on-surface">{state.tasks.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">Workers</span>
                    <span className="font-medium text-on-surface">{workers.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-on-surface-variant">Workspace</span>
                    <span className="truncate text-right font-medium text-on-surface">{state.workspace.rootDir || '(not set)'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">Permissions</span>
                    <span className="text-xs font-medium text-on-surface">{state.workspace.permissionMode}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="shrink-0 rounded-2xl border border-outline-variant/10 bg-surface-container-low p-5 shadow-ambient animate-fade-slide-up" style={{ animationDelay: '100ms' }}>
              <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-label">Tasks</div>
              <TaskBoard tasks={state.tasks} />
            </div>

            <div className="min-h-[220px] shrink-0 rounded-2xl border border-outline-variant/10 bg-surface-container-low p-5 shadow-ambient animate-fade-slide-up" style={{ animationDelay: '150ms' }}>
              <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-label">
                Workers ({workers.length})
              </div>
              <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
                {workers.length === 0 && (
                  <div className="py-6 text-center text-sm text-on-surface-variant/50">No workers yet</div>
                )}
                {workers.map(w => (
                  <WorkerCard key={w.id} agent={w} onKill={() => onKillWorker(w.id)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
