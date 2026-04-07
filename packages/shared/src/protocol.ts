import type {
  Agent,
  AgentId,
  MailboxMessage,
  Session,
  SessionSummary,
  Task,
  WorkerProgress,
  WorkspaceConfig,
} from './types.js'

// ---- Server -> Client ----

export type ServerEvent =
  | { type: 'session:init'; payload: Session }
  | { type: 'session:completed'; payload: { summary: string } }
  | { type: 'task:created'; payload: Task }
  | { type: 'task:updated'; payload: Task }
  | { type: 'worker:spawned'; payload: Agent }
  | { type: 'worker:status'; payload: Pick<Agent, 'id' | 'status' | 'currentTaskId'> }
  | { type: 'worker:progress'; payload: WorkerProgress }
  | { type: 'worker:stopped'; payload: { id: AgentId; reason: string } }
  | { type: 'message:sent'; payload: MailboxMessage }
  | { type: 'coordinator:thought'; payload: { text: string; timestamp: string } }
  | { type: 'user:message'; payload: { text: string; timestamp: string } }
  | { type: 'session:list'; payload: SessionSummary[] }
  | { type: 'graph:run_started'; payload: { sessionId: string; runId: string; timestamp: string } }
  | { type: 'graph:node_status'; payload: { sessionId: string; runId: string; nodeId: string; status: string; timestamp: string } }
  | { type: 'graph:node_result'; payload: { sessionId: string; runId: string; nodeId: string; result: string; timestamp: string } }
  | { type: 'graph:log'; payload: { sessionId: string; runId: string; message: string; timestamp: string } }
  | { type: 'graph:run_completed'; payload: { sessionId: string; runId: string; success: boolean; error?: string; timestamp: string } }
  | { type: 'log'; payload: { agentId: AgentId; level: string; text: string; timestamp: string } }

// ---- Client -> Server ----

export type ClientEvent =
  | { type: 'session:start'; payload: { goal: string; model?: string; workspace?: WorkspaceConfig } }
  | { type: 'session:message'; payload: { text: string } }
  | { type: 'session:pause' }
  | { type: 'session:resume' }
  | { type: 'session:stop' }
  | { type: 'session:switch'; payload: { sessionId: string } }
  | { type: 'session:update_workspace'; payload: { workspace: WorkspaceConfig } }
  | { type: 'session:rename'; payload: { sessionId: string; name: string } }
  | { type: 'session:delete'; payload: { sessionId: string } }
  | { type: 'session:list' }
  | { type: 'worker:kill'; payload: { agentId: AgentId } }
