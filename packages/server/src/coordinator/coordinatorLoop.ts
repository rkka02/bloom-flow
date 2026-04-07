import type { ChatMessage, Session } from '@bloom/shared'
import { chat } from '../llm/client.js'
import { readUnread, markRead } from '../mailbox/mailbox.js'
import { addCoordinatorThought, normalizeWorkspace, persistSession } from '../session/sessionStore.js'
import { createTask, getTask, updateTask } from '../tasks/taskStore.js'
import { enqueueWorkerMessage, enqueueWorkerMessageByName } from '../worker/workerLoop.js'
import { killWorker, listWorkers, restoreWorker, spawnWorker } from '../worker/workerPool.js'
import { broadcast } from '../ws/broadcaster.js'
import { normalizeModelName } from '../llm/models.js'
import { buildCoordinatorSystemPrompt } from './coordinatorPrompt.js'
import { parseCoordinatorCommands, stripCommandBlocks } from './parseCommands.js'

function addThought(session: Session, text: string): void {
  const thought = { text, timestamp: new Date().toISOString() }
  if (!session.coordinatorThoughts) session.coordinatorThoughts = []
  session.coordinatorThoughts.push(thought)
  addCoordinatorThought(session.id, thought)
}

export interface CoordinatorConfig {
  session: Session
  abortController: AbortController
}

const MAX_TURNS = 200
const USER_MSG_POLL_INTERVAL = 300

const userMessageQueue: string[] = []

export function enqueueUserMessage(text: string): void {
  userMessageQueue.push(text)
}

function drainUserMessages(): string[] {
  return userMessageQueue.splice(0)
}

export async function runCoordinator(config: CoordinatorConfig): Promise<void> {
  const { session, abortController } = config
  const coordinator = session.agents.find(agent => agent.role === 'coordinator')

  if (!coordinator) {
    throw new Error('Coordinator agent missing from session')
  }

  coordinator.model = normalizeModelName(coordinator.model)

  const messages: ChatMessage[] = coordinator.backendSessionId
    ? []
    : [
        { role: 'system', content: buildCoordinatorSystemPrompt(session.workspace) },
        { role: 'user', content: session.goal },
      ]

  let submittedCount = 0
  let turnCount = 0

  while (!abortController.signal.aborted && turnCount < MAX_TURNS) {
    await drainPendingReports(session, messages)

    const pendingUser = drainUserMessages()
    for (const text of pendingUser) {
      messages.push({ role: 'user', content: text })
    }

    if (messages.length === submittedCount) {
      const followUp = await waitForUserOrWorker(session, abortController)
      if (!followUp) break

      if (followUp.type === 'user') {
        messages.push({ role: 'user', content: followUp.text })
      } else {
        await drainPendingReports(session, messages)
      }

      if (messages.length === submittedCount) {
        continue
      }
    }

    turnCount++

    broadcast({
      type: 'log',
      payload: {
        agentId: 'coordinator',
        level: 'info',
        text: `Turn ${turnCount}: thinking...`,
        timestamp: new Date().toISOString(),
      },
    })

    const requestMessages = coordinator.backendSessionId
      ? messages.slice(submittedCount)
      : messages

    const response = await chat({
      model: coordinator.model,
      messages: requestMessages,
      workspace: session.workspace,
      signal: abortController.signal,
      sessionId: coordinator.backendSessionId,
    })

    if (response.sessionId && response.sessionId !== coordinator.backendSessionId) {
      coordinator.backendSessionId = response.sessionId
      await persistSession()
    }

    const assistantText = response.content ?? ''
    messages.push({ role: 'assistant', content: assistantText })
    submittedCount = coordinator.backendSessionId ? messages.length : 0

    const visibleText = stripCommandBlocks(assistantText)
    if (visibleText) {
      addThought(session, visibleText)
      broadcast({
        type: 'coordinator:thought',
        payload: { text: visibleText, timestamp: new Date().toISOString() },
      })
    }

    const commands = parseCoordinatorCommands(assistantText)
    if (commands.length === 0) continue

    let sessionCompleted = false

    for (const command of commands) {
      let result = 'Unknown command'

      switch (command.type) {
        case 'spawn_worker': {
          const worker = spawnWorker({
            name: command.name,
            model: normalizeModelName(command.model || coordinator.model),
            sessionId: session.id,
            prompt: command.prompt,
            taskId: command.taskId,
            workspace: normalizeWorkspace({
              ...session.workspace,
              cwd: command.cwd ?? session.workspace?.cwd ?? session.workspace?.rootDir ?? '',
            }),
          })
          session.agents.push(worker)
          result = `Worker "${command.name}" spawned with ID ${worker.id}`

          if (command.taskId) {
            await updateTask(session.id, command.taskId, { owner: worker.id, status: 'in_progress' })
            const updated = await getTask(session.id, command.taskId)
            if (updated) broadcast({ type: 'task:updated', payload: updated })
          }

          broadcast({
            type: 'log',
            payload: {
              agentId: 'coordinator',
              level: 'info',
              text: `Spawned worker "${command.name}" (${worker.id}) [${worker.model}]`,
              timestamp: new Date().toISOString(),
            },
          })
          break
        }

        case 'create_task': {
          const task = await createTask(session.id, {
            subject: command.subject,
            description: command.description,
            blockedBy: command.blockedBy,
          })
          session.tasks.push(task)
          broadcast({ type: 'task:created', payload: task })
          result = `Task created with ID ${task.id}: "${task.subject}"`

          broadcast({
            type: 'log',
            payload: {
              agentId: 'coordinator',
              level: 'info',
              text: `Created task #${task.id}: ${task.subject}`,
              timestamp: new Date().toISOString(),
            },
          })
          break
        }

        case 'message_worker': {
          let target = enqueueWorkerMessageByName(command.name, command.message, listWorkers())

          if (!target) {
            const savedWorker = session.agents.find(agent =>
              agent.role === 'worker'
              && agent.status !== 'stopped'
              && agent.name.toLowerCase() === command.name.toLowerCase(),
            )

            if (savedWorker) {
              target = restoreWorker(savedWorker, { sessionId: session.id })
              enqueueWorkerMessage(target.id, command.message)
            }
          }

          if (target) {
            if (command.taskId) {
              target.currentTaskId = command.taskId
              await updateTask(session.id, command.taskId, { owner: target.id, status: 'in_progress' })
              const updated = await getTask(session.id, command.taskId)
              if (updated) broadcast({ type: 'task:updated', payload: updated })
            }

            if (command.cwd) {
              target.workspace = normalizeWorkspace({
                ...session.workspace,
                ...target.workspace,
                cwd: command.cwd,
                permissions: {
                  ...session.workspace?.permissions,
                  ...target.workspace?.permissions,
                },
              })
            }

            result = `Message sent to worker "${command.name}" (${target.id}). Worker will resume with full context.`
            broadcast({
              type: 'log',
              payload: {
                agentId: 'coordinator',
                level: 'info',
                text: `Sent follow-up to "${command.name}" (${target.id})`,
                timestamp: new Date().toISOString(),
              },
            })
          } else {
            result = `No worker found with name "${command.name}". Use spawn_worker to create one.`
          }
          break
        }

        case 'stop_worker': {
          const target = command.workerId
            ? listWorkers().find(worker => worker.id === command.workerId)
            : listWorkers().find(worker => worker.name.toLowerCase() === (command.name ?? '').toLowerCase())

          if (target) {
            killWorker(target.id)
            result = `Worker "${target.name}" (${target.id}) has been stopped.`
            broadcast({
              type: 'log',
              payload: {
                agentId: 'coordinator',
                level: 'info',
                text: `Stopped worker "${target.name}" (${target.id})`,
                timestamp: new Date().toISOString(),
              },
            })
          } else {
            const savedWorker = session.agents.find(agent =>
              agent.role === 'worker'
              && agent.status !== 'stopped'
              && (
                (command.workerId && agent.id === command.workerId)
                || (command.name && agent.name.toLowerCase() === command.name.toLowerCase())
              ),
            )

            if (savedWorker) {
              savedWorker.status = 'stopped'
              result = `Worker "${savedWorker.name}" (${savedWorker.id}) marked as stopped.`
            } else {
              result = `No active worker found with name "${command.name ?? command.workerId}".`
            }
          }
          break
        }

        case 'complete_session': {
          session.status = 'completed'
          sessionCompleted = true

          if (command.summary && command.summary !== visibleText) {
            addThought(session, command.summary)
            broadcast({
              type: 'coordinator:thought',
              payload: { text: command.summary, timestamp: new Date().toISOString() },
            })
          }

          broadcast({
            type: 'session:completed',
            payload: { summary: command.summary },
          })

          result = 'Session marked as completed.'
          break
        }
      }

      messages.push({ role: 'tool', content: result })
    }

    await persistSession()

    if (!sessionCompleted) continue

    const followUp = await waitForUserOrWorker(session, abortController)
    if (!followUp) return

    session.status = 'active'
    if (followUp.type === 'user') {
      messages.push({ role: 'user', content: followUp.text })
    } else {
      await drainPendingReports(session, messages)
    }
  }
}

async function drainPendingReports(
  session: Session,
  messages: ChatMessage[],
): Promise<number> {
  const unread = await readUnread(session.id, 'coordinator')
  for (const message of unread) {
    await markRead(session.id, 'coordinator', message.id)
    messages.push({ role: 'user', content: message.text })
    broadcast({
      type: 'log',
      payload: {
        agentId: message.from,
        level: 'info',
        text: 'Worker report received',
        timestamp: new Date().toISOString(),
      },
    })
  }
  return unread.length
}

async function waitForUserOrWorker(
  session: Session,
  abortController: AbortController,
  timeoutMs: number = 30 * 60 * 1000,
): Promise<{ type: 'user'; text: string } | { type: 'worker' } | null> {
  const start = Date.now()

  while (!abortController.signal.aborted && Date.now() - start < timeoutMs) {
    const userMessages = drainUserMessages()
    if (userMessages.length > 0) {
      return { type: 'user', text: userMessages.join('\n\n') }
    }

    const unread = await readUnread(session.id, 'coordinator')
    if (unread.length > 0) {
      return { type: 'worker' }
    }

    await new Promise(resolve => setTimeout(resolve, USER_MSG_POLL_INTERVAL))
  }

  return null
}
