import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Session, SessionSummary, Agent, MailboxMessage, SessionGraph, WorkspaceConfig } from '@bloom/shared'
import { resetTaskIds } from '../tasks/taskStore.js'
import { normalizeModelName } from '../llm/models.js'
import { normalizePersistedId, normalizeWorkspacePaths, tryNormalizePersistedId } from '../security.js'

const BLOOM_DIR = join(process.env.BLOOM_HOME?.trim() || process.env.HOME || process.env.USERPROFILE || '.', '.bloom')

let currentSession: Session | null = null

type WorkspaceOverrides = Partial<Omit<WorkspaceConfig, 'permissions'>> & {
  permissions?: Partial<WorkspaceConfig['permissions']>
}

export function normalizeWorkspace(overrides?: WorkspaceOverrides): WorkspaceConfig {
  const { rootDir, cwd } = normalizeWorkspacePaths(overrides)

  return {
    rootDir,
    cwd,
    permissionMode: overrides?.permissionMode ?? 'default',
    permissions: {
      read: overrides?.permissions?.read ?? true,
      write: overrides?.permissions?.write ?? true,
      execute: overrides?.permissions?.execute ?? true,
    },
  }
}

export function getSession(): Session | null {
  return currentSession
}

export function createSession(
  goal: string,
  model?: string,
  name?: string,
  mode: 'chat' | 'graph' = 'chat',
  workspace?: Partial<WorkspaceConfig>,
): Session {
  resetTaskIds()

  const sessionWorkspace = normalizeWorkspace(workspace)

  const coordinatorAgent: Agent = {
    id: 'coordinator',
    role: 'coordinator',
    status: 'running',
    name: 'Coordinator',
    model: normalizeModelName(model),
    workspace: sessionWorkspace,
    createdAt: new Date().toISOString(),
    tokenUsage: { prompt: 0, completion: 0, total: 0 },
    turnCount: 0,
  }

  currentSession = {
    id: randomUUID().slice(0, 12),
    name: name ?? goal.slice(0, 60),
    goal,
    mode,
    workspace: sessionWorkspace,
    agents: [coordinatorAgent],
    tasks: [],
    messages: [],
    createdAt: new Date().toISOString(),
    status: 'active',
    coordinatorThoughts: [],
    userMessages: [],
    graph: {
      nodes: [],
      edges: [],
      workflowId: null,
      workflowName: null,
      updatedAt: new Date().toISOString(),
    },
  }

  // Persist immediately so session.json exists even if server crashes
  persistSession().catch(() => {})

  return currentSession
}

export async function persistSession(): Promise<void> {
  if (!currentSession) return
  const dir = join(BLOOM_DIR, 'sessions', currentSession.id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'session.json'), JSON.stringify(currentSession, null, 2))
}

export function updateSessionGraph(
  sessionId: string,
  graph: Omit<SessionGraph, 'updatedAt'> & { updatedAt?: string },
): SessionGraph | null {
  if (!currentSession || currentSession.id !== sessionId) return null

  currentSession.graph = {
    nodes: graph.nodes,
    edges: graph.edges,
    workflowId: graph.workflowId ?? null,
    workflowName: graph.workflowName ?? null,
    updatedAt: graph.updatedAt ?? new Date().toISOString(),
  }
  persistSession().catch(() => {})
  return currentSession.graph
}

export function updateSessionWorkspace(sessionId: string, workspace: Partial<WorkspaceConfig>): WorkspaceConfig | null {
  if (!currentSession || currentSession.id !== sessionId) return null

  currentSession.workspace = normalizeWorkspace({
    ...currentSession.workspace,
    ...workspace,
    permissions: {
      ...currentSession.workspace?.permissions,
      ...workspace.permissions,
    },
  })

  for (const agent of currentSession.agents) {
    agent.workspace = {
      ...currentSession.workspace,
      ...agent.workspace,
      cwd: agent.workspace?.cwd ?? currentSession.workspace.cwd,
      permissions: {
        ...currentSession.workspace.permissions,
        ...agent.workspace?.permissions,
      },
    }
  }

  persistSession().catch(() => {})
  return currentSession.workspace
}

export function addSessionMessage(sessionId: string, message: MailboxMessage): void {
  if (!currentSession || currentSession.id !== sessionId) return
  if (!currentSession.messages.some(existing => existing.id === message.id)) {
    currentSession.messages.push(message)
  }
  persistSession().catch(() => {})
}

export function addCoordinatorThought(
  sessionId: string,
  thought: { text: string; timestamp: string },
): void {
  if (!currentSession || currentSession.id !== sessionId) return
  if (!currentSession.coordinatorThoughts) currentSession.coordinatorThoughts = []
  const last = currentSession.coordinatorThoughts[currentSession.coordinatorThoughts.length - 1]
  if (!last || last.text !== thought.text || last.timestamp !== thought.timestamp) {
    currentSession.coordinatorThoughts.push(thought)
  }
  persistSession().catch(() => {})
}

export function addUserMessage(
  sessionId: string,
  message: { text: string; timestamp: string },
): void {
  if (!currentSession || currentSession.id !== sessionId) return
  if (!currentSession.userMessages) currentSession.userMessages = []
  const last = currentSession.userMessages[currentSession.userMessages.length - 1]
  if (!last || last.text !== message.text || last.timestamp !== message.timestamp) {
    currentSession.userMessages.push(message)
  }
  persistSession().catch(() => {})
}

export async function loadSession(sessionId: string): Promise<Session | null> {
  try {
    const safeSessionId = normalizePersistedId(sessionId, 'session id')
    const raw = await readFile(
      join(BLOOM_DIR, 'sessions', safeSessionId, 'session.json'),
      'utf-8',
    )
    const loadedSession: Session = JSON.parse(raw)
    loadedSession.workspace = normalizeWorkspace(loadedSession.workspace)
    const baseWorkspace = loadedSession.workspace
    loadedSession.agents = (loadedSession.agents ?? []).map(agent => ({
      ...agent,
      model: normalizeModelName(agent.model),
      workspace: normalizeWorkspace({
        ...baseWorkspace,
        ...agent.workspace,
        permissions: {
          ...baseWorkspace.permissions,
          ...agent.workspace?.permissions,
        },
      }),
    }))
    currentSession = loadedSession
    return currentSession
  } catch {
    return null
  }
}

export async function listSessions(): Promise<SessionSummary[]> {
  const sessionsDir = join(BLOOM_DIR, 'sessions')
  await mkdir(sessionsDir, { recursive: true })

  let dirs: string[]
  try {
    dirs = await readdir(sessionsDir)
  } catch {
    return []
  }

  const summaries: SessionSummary[] = []

  for (const dir of dirs) {
    if (!tryNormalizePersistedId(dir)) continue
    try {
      const raw = await readFile(
        join(sessionsDir, dir, 'session.json'),
        'utf-8',
      )
      const session: Session = JSON.parse(raw)
      summaries.push({
        id: session.id,
        name: session.name,
        goal: session.goal,
        status: session.status,
        createdAt: session.createdAt,
      })
    } catch {
      // skip directories without valid session.json
    }
  }

  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function renameSession(sessionId: string, name: string): Promise<boolean> {
  let safeSessionId: string
  try {
    safeSessionId = normalizePersistedId(sessionId, 'session id')
  } catch {
    return false
  }

  const sessionPath = join(BLOOM_DIR, 'sessions', safeSessionId, 'session.json')
  try {
    const raw = await readFile(sessionPath, 'utf-8')
    const session: Session = JSON.parse(raw)
    session.name = name
    await writeFile(sessionPath, JSON.stringify(session, null, 2))

    // Also update in-memory if it's the current session
    if (currentSession && currentSession.id === sessionId) {
      currentSession.name = name
    }
    return true
  } catch {
    return false
  }
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  let safeSessionId: string
  try {
    safeSessionId = normalizePersistedId(sessionId, 'session id')
  } catch {
    return false
  }

  const sessionDir = join(BLOOM_DIR, 'sessions', safeSessionId)
  try {
    const { rm } = await import('node:fs/promises')
    await rm(sessionDir, { recursive: true, force: true })
    if (currentSession?.id === safeSessionId) {
      currentSession = null
    }
    return true
  } catch {
    return false
  }
}

export function clearSession(): void {
  currentSession = null
}
