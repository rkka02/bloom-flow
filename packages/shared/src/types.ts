// ---- Identity ----

export type AgentId = string
export type TaskId = string
export type SessionId = string
export type MessageId = string

// ---- Agent ----

export type AgentRole = 'coordinator' | 'worker'
export type AgentStatus = 'idle' | 'running' | 'stopped' | 'error'
export type WorkspacePermissionMode = 'default' | 'dangerously-skip-permissions'

export interface WorkspacePermissions {
  read: boolean
  write: boolean
  execute: boolean
}

export interface WorkspaceConfig {
  rootDir?: string
  cwd?: string
  permissionMode: WorkspacePermissionMode
  permissions: WorkspacePermissions
}

export interface Agent {
  id: AgentId
  role: AgentRole
  status: AgentStatus
  name: string
  model: string
  backendSessionId?: string
  graphNodeId?: string
  sharedWorkerKey?: string
  workspace?: WorkspaceConfig
  currentTaskId?: TaskId
  createdAt: string
  tokenUsage: { prompt: number; completion: number; total: number }
  turnCount: number
}

// ---- Task ----

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface Task {
  id: TaskId
  subject: string
  description: string
  status: TaskStatus
  owner?: AgentId
  blockedBy: TaskId[]
  blocks: TaskId[]
  result?: string
  error?: string
  createdAt: string
  updatedAt: string
}

// ---- Message (mailbox) ----

export interface MailboxMessage {
  id: MessageId
  from: AgentId
  to: AgentId
  text: string
  summary?: string
  replyTo?: string
  timestamp: string
  read: boolean
}

// ---- Session ----

export type SessionStatus = 'active' | 'paused' | 'completed'
export type SessionMode = 'chat' | 'graph'

export interface SessionGraph {
  nodes: any[]
  edges: any[]
  workflowId?: string | null
  workflowName?: string | null
  updatedAt: string
}

export interface Session {
  id: SessionId
  name?: string
  goal: string
  mode?: SessionMode
  workspace?: WorkspaceConfig
  agents: Agent[]
  tasks: Task[]
  messages: MailboxMessage[]
  createdAt: string
  status: SessionStatus
  coordinatorThoughts?: { text: string; timestamp: string }[]
  userMessages?: { text: string; timestamp: string }[]
  graph?: SessionGraph
}

export interface SessionSummary {
  id: SessionId
  name?: string
  goal: string
  status: SessionStatus
  createdAt: string
}

// ---- Progress ----

export interface WorkerProgress {
  agentId: AgentId
  taskId?: TaskId
  phase: string
  detail: string
  tokensSoFar: number
  turnsSoFar: number
}

// ---- LLM ----

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ChatResponse {
  content: string | null
  tool_calls?: ToolCall[]
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  finish_reason: string
  sessionId?: string
}
