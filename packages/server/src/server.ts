import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import type { ClientEvent, WorkspaceConfig } from '@bloom/shared'
import { addClient, broadcast } from './ws/broadcaster.js'
import { getSession, createSession, persistSession, clearSession, listSessions, renameSession, loadSession, deleteSession, addUserMessage, updateSessionGraph, updateSessionWorkspace, normalizeWorkspace } from './session/sessionStore.js'
import { listTasks, getTask } from './tasks/taskStore.js'
import { readAllMessages, readInbox, readUnread, markRead } from './mailbox/mailbox.js'
import { listWorkers, killWorker, killAllWorkers, restoreWorkers, spawnWorker, getWorkerForGraphNode } from './worker/workerPool.js'
import { runCoordinator, enqueueUserMessage } from './coordinator/coordinatorLoop.js'
import { enqueueWorkerMessage } from './worker/workerLoop.js'
import { runGraphRuntime } from './graph/runtime.js'
import { normalizeGraph } from './graph/normalize.js'
import { normalizeModelName } from './llm/models.js'

let coordinatorAbort: AbortController | null = null

export async function createServer() {
  const app = Fastify({ logger: false })

  await app.register(cors, { origin: true })
  await app.register(websocket)

  // ---- WebSocket ----

  app.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (socket, _req) => {
      addClient(socket)

      // Send current session state on connect
      const session = getSession()
      if (session) {
        socket.send(JSON.stringify({ type: 'session:init', payload: session }))
      }

      socket.on('message', async (raw: Buffer) => {
        try {
          const event: ClientEvent = JSON.parse(raw.toString())
          await handleClientEvent(event)
        } catch (err: any) {
          socket.send(JSON.stringify({
            type: 'log',
            payload: { agentId: 'system', level: 'error', text: err.message, timestamp: new Date().toISOString() },
          }))
        }
      })
    })
  })

  // ---- REST API ----

  app.get('/', async () => ({
    name: 'bloom',
    version: '0.1.0',
    status: getSession()?.status ?? 'no session',
  }))

  app.get('/api/session', async (_req, reply) => {
    const session = getSession()
    if (!session) return reply.code(404).send({ error: 'No active session' })
    return session
  })

  app.get('/api/session/graph', async (_req, reply) => {
    const session = getSession()
    if (!session) return reply.code(404).send({ error: 'No active session' })
    const normalized = normalizeGraph(session.graph?.nodes ?? [], session.graph?.edges ?? [])
    return {
      nodes: normalized.nodes,
      edges: normalized.edges,
      workflowId: session.graph?.workflowId ?? null,
      workflowName: session.graph?.workflowName ?? null,
      updatedAt: session.graph?.updatedAt ?? session.createdAt,
    }
  })

  app.post<{ Body: { goal: string; model?: string; workspace?: WorkspaceConfig } }>('/api/session', async (req) => {
    const session = createSession(req.body.goal, req.body.model, undefined, 'chat', req.body.workspace)
    broadcast({ type: 'session:init', payload: session })
    startCoordinator(session)
    return session
  })

  app.get('/api/session/workspace', async (_req, reply) => {
    const session = getSession()
    if (!session) return reply.code(404).send({ error: 'No active session' })
    return session.workspace
  })

  app.patch<{ Body: { workspace: WorkspaceConfig } }>('/api/session/workspace', async (req, reply) => {
    const session = getSession()
    if (!session) return reply.code(404).send({ error: 'No active session' })
    const workspace = updateSessionWorkspace(session.id, req.body.workspace)
    await persistSession()
    if (getSession()) {
      broadcast({ type: 'session:init', payload: getSession()! })
    }
    return workspace
  })

  app.patch<{ Body: { nodes: any[]; edges: any[]; workflowId?: string | null; workflowName?: string | null; ensureSession?: boolean; workspace?: WorkspaceConfig } }>('/api/session/graph', async (req, reply) => {
    let session = getSession()
    if (!session) {
      if (!req.body.ensureSession) {
        return reply.code(404).send({ error: 'No active session' })
      }
      session = createSession('Graph workflow', undefined, undefined, 'graph', req.body.workspace)
      const coordinator = session.agents.find(agent => agent.role === 'coordinator')
      if (coordinator) coordinator.status = 'idle'
      broadcast({ type: 'session:init', payload: session })
    }

    const normalized = normalizeGraph(req.body.nodes ?? [], req.body.edges ?? [])
    const graph = updateSessionGraph(session.id, {
      nodes: normalized.nodes,
      edges: normalized.edges,
      workflowId: req.body.workflowId ?? null,
      workflowName: req.body.workflowName ?? null,
    })
    await persistSession()
    return graph
  })

  app.post('/api/session/graph/run', async (_req, reply) => {
    const session = getSession()
    if (!session) return reply.code(404).send({ error: 'No active session' })
    const result = await runGraphRuntime(session)
    await persistSession()
    return result
  })

  app.post('/api/session/stop', async () => {
    coordinatorAbort?.abort()
    await killAllWorkers()
    const session = getSession()
    if (session) {
      session.status = 'completed'
      await persistSession()
    }
    clearSession()
    return { ok: true }
  })

  app.get('/api/tasks', async () => {
    const session = getSession()
    if (!session) return []
    return listTasks(session.id)
  })

  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (req, reply) => {
    const session = getSession()
    if (!session) return reply.code(404).send({ error: 'No session' })
    const task = await getTask(session.id, req.params.id)
    if (!task) return reply.code(404).send({ error: 'Task not found' })
    return task
  })

  app.get('/api/agents', async () => {
    const session = getSession()
    if (!session) return []
    const coordinator = session.agents.find(a => a.role === 'coordinator')
    return [coordinator, ...listWorkers()].filter(Boolean)
  })

  app.delete<{ Params: { id: string } }>('/api/agents/:id', async (req) => {
    killWorker(req.params.id)
    return { ok: true }
  })

  app.get('/api/messages', async () => {
    const session = getSession()
    if (!session) return []
    return readAllMessages(session.id)
  })

  app.get<{ Params: { agentId: string } }>('/api/messages/:agentId', async (req) => {
    const session = getSession()
    if (!session) return []
    const { messages } = await readInbox(session.id, req.params.agentId)
    return messages
  })

  app.get('/api/sessions', async () => {
    return listSessions()
  })

  app.patch<{ Body: { id: string; name: string } }>('/api/session', async (req, reply) => {
    const ok = await renameSession(req.body.id, req.body.name)
    if (!ok) return reply.code(404).send({ error: 'Session not found' })
    return { ok: true }
  })

  app.post<{ Body: { sessionId: string } }>('/api/session/switch', async (req, reply) => {
    // Stop current coordinator
    coordinatorAbort?.abort()
    await killAllWorkers()
    const current = getSession()
    if (current) {
      await persistSession()
    }

    const loaded = await loadSession(req.body.sessionId)
    if (!loaded) return reply.code(404).send({ error: 'Session not found' })

    broadcast({ type: 'session:init', payload: loaded })

    // Restart coordinator if session is still active
    if (loaded.status === 'active' && loaded.mode !== 'graph') {
      startCoordinator(loaded)
    } else {
      restoreWorkers(loaded)
    }

    return loaded
  })

  // ---- Workflows (saved graphs) ----

  app.get('/api/workflows', async () => {
    const { listWorkflows } = await import('./workflows/workflowStore.js')
    return listWorkflows()
  })

  app.get<{ Params: { id: string } }>('/api/workflows/:id', async (req, reply) => {
    const { getWorkflow } = await import('./workflows/workflowStore.js')
    const wf = await getWorkflow(req.params.id)
    if (!wf) return reply.code(404).send({ error: 'Workflow not found' })
    const normalized = normalizeGraph(wf.nodes ?? [], wf.edges ?? [])
    return { ...wf, nodes: normalized.nodes, edges: normalized.edges }
  })

  app.post<{ Body: { name: string; description?: string; nodes: any[]; edges: any[]; id?: string } }>('/api/workflows', async (req) => {
    const { saveWorkflow } = await import('./workflows/workflowStore.js')
    const normalized = normalizeGraph(req.body.nodes ?? [], req.body.edges ?? [])
    return saveWorkflow({
      id: req.body.id,
      name: req.body.name,
      description: req.body.description ?? '',
      nodes: normalized.nodes,
      edges: normalized.edges,
    })
  })

  app.delete<{ Params: { id: string } }>('/api/workflows/:id', async (req) => {
    const { deleteWorkflow } = await import('./workflows/workflowStore.js')
    await deleteWorkflow(req.params.id)
    return { ok: true }
  })

  // ---- Flow execution ----

  app.post<{ Body: { model: string; prompt: string; role: string } }>('/api/flow/execute-node', async (req) => {
    const { model, prompt, role } = req.body
    const { chat } = await import('./llm/client.js')
    const response = await chat({
      model: normalizeModelName(model),
      messages: [
        { role: 'system', content: `You are "${role}". Complete the task thoroughly and accurately. Respond with your findings or results directly.` },
        { role: 'user', content: prompt },
      ],
      workspace: getSession()?.workspace,
    })
    return { result: response.content ?? '' }
  })

  app.post<{ Body: { nodeId: string; label: string; model: string; role: string; prompt: string; cwd?: string; sharedWorkerKey?: string } }>('/api/flow/worker-node', async (req) => {
    let session = getSession()
    if (!session) {
      session = createSession('Graph workflow', undefined, undefined, 'graph')
      const coordinator = session.agents.find(agent => agent.role === 'coordinator')
      if (coordinator) coordinator.status = 'idle'
      broadcast({ type: 'session:init', payload: session })
    }

    const replyTo = `__graph__:${req.body.nodeId}:${Date.now()}`
    let worker = getWorkerForGraphNode(req.body.nodeId, req.body.sharedWorkerKey)

    if (!worker) {
      worker = spawnWorker({
        name: req.body.label || req.body.role || 'Graph Worker',
        model: normalizeModelName(req.body.model),
        sessionId: session.id,
        prompt: req.body.prompt,
        graphNodeId: req.body.nodeId,
        sharedWorkerKey: req.body.sharedWorkerKey,
        replyTo,
        workspace: normalizeWorkspace({
          ...session.workspace,
          cwd: req.body.cwd ?? session.workspace?.cwd ?? session.workspace?.rootDir ?? '',
        }),
      })
      session.agents.push(worker)
    } else {
      worker.name = req.body.label || worker.name
      worker.model = normalizeModelName(req.body.model ?? worker.model)
      worker.sharedWorkerKey = req.body.sharedWorkerKey ?? worker.sharedWorkerKey
      worker.workspace = normalizeWorkspace({
        ...session.workspace,
        ...worker.workspace,
        cwd: req.body.cwd ?? worker.workspace?.cwd ?? session.workspace?.cwd ?? session.workspace?.rootDir ?? '',
        permissions: {
          ...session.workspace?.permissions,
          ...worker.workspace?.permissions,
        },
      })
      enqueueWorkerMessage(worker.id, req.body.prompt, replyTo)
    }

    await persistSession()
    const result = await waitForGraphReply(session.id, replyTo)
    return { result, workerId: worker.id, sessionId: session.id }
  })

  return app
}

async function waitForGraphReply(sessionId: string, replyTo: string): Promise<string> {
  const timeoutMs = 60 * 60 * 1000
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const unread = await readUnread(sessionId, replyTo)
    if (unread.length > 0) {
      const msg = unread[0]!
      await markRead(sessionId, replyTo, msg.id)
      return msg.text
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  throw new Error('Timed out waiting for graph worker reply')
}

function startCoordinator(session: import('@bloom/shared').Session) {
  restoreWorkers(session)
  coordinatorAbort = new AbortController()
  runCoordinator({ session, abortController: coordinatorAbort }).then(async () => {
    await persistSession()
    broadcast({
      type: 'log',
      payload: {
        agentId: 'coordinator',
        level: 'info',
        text: 'Coordinator finished',
        timestamp: new Date().toISOString(),
      },
    })
  }).catch(err => {
    broadcast({
      type: 'log',
      payload: {
        agentId: 'coordinator',
        level: 'error',
        text: `Coordinator error: ${err.message}`,
        timestamp: new Date().toISOString(),
      },
    })
  })
}

async function handleClientEvent(event: ClientEvent): Promise<void> {
  switch (event.type) {
    case 'session:start': {
      // If session already active, treat as follow-up message
      const existing = getSession()
      if (existing && existing.status === 'active' && existing.mode !== 'graph') {
        const userMsg = { text: event.payload.goal, timestamp: new Date().toISOString() }
        if (!existing.userMessages) existing.userMessages = []
        existing.userMessages.push(userMsg)
        addUserMessage(existing.id, userMsg)
        enqueueUserMessage(event.payload.goal)
        broadcast({ type: 'user:message', payload: userMsg })
        break
      }
      const session = createSession(event.payload.goal, event.payload.model, undefined, 'chat', event.payload.workspace)
      broadcast({ type: 'session:init', payload: session })
      startCoordinator(session)
      break
    }
    case 'session:message': {
      const msgSession = getSession()
      if (msgSession) {
        if (msgSession.mode === 'graph') {
          const session = createSession(event.payload.text, undefined, undefined, 'chat', msgSession.workspace)
          broadcast({ type: 'session:init', payload: session })
          startCoordinator(session)
          break
        }
        const userMsg = { text: event.payload.text, timestamp: new Date().toISOString() }
        if (!msgSession.userMessages) msgSession.userMessages = []
        msgSession.userMessages.push(userMsg)
        addUserMessage(msgSession.id, userMsg)
        enqueueUserMessage(event.payload.text)
        broadcast({ type: 'user:message', payload: userMsg })

        // If session was completed, restart coordinator for follow-up
        if (msgSession.status === 'completed') {
          msgSession.status = 'active'
          startCoordinator(msgSession)
        }
      }
      break
    }
    case 'session:stop': {
      coordinatorAbort?.abort()
      await killAllWorkers()
      const session = getSession()
      if (session) {
        session.status = 'completed'
        await persistSession()
      }
      break
    }
    case 'session:list': {
      const sessions = await listSessions()
      broadcast({ type: 'session:list', payload: sessions })
      break
    }
    case 'session:switch': {
      coordinatorAbort?.abort()
      await killAllWorkers()
      const cur = getSession()
      if (cur) await persistSession()

      const loaded = await loadSession(event.payload.sessionId)
      if (loaded) {
        broadcast({ type: 'session:init', payload: loaded })
        if (loaded.status === 'active' && loaded.mode !== 'graph') {
          startCoordinator(loaded)
        } else {
          restoreWorkers(loaded)
        }
      }
      break
    }
    case 'session:update_workspace': {
      const session = getSession()
      if (!session) break
      updateSessionWorkspace(session.id, event.payload.workspace)
      await persistSession()
      broadcast({ type: 'session:init', payload: getSession()! })
      break
    }
    case 'session:delete': {
      await deleteSession(event.payload.sessionId)
      const sessions = await listSessions()
      broadcast({ type: 'session:list', payload: sessions })
      break
    }
    case 'session:rename': {
      await renameSession(event.payload.sessionId, event.payload.name)
      const sessions = await listSessions()
      broadcast({ type: 'session:list', payload: sessions })
      break
    }
    case 'worker:kill': {
      killWorker(event.payload.agentId)
      break
    }
  }
}
