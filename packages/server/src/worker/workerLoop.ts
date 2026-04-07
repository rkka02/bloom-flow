import type { Agent, ChatMessage } from '@bloom/shared'
import { chat } from '../llm/client.js'
import { writeMessage, readUnread, markRead } from '../mailbox/mailbox.js'
import { updateTask, getTask } from '../tasks/taskStore.js'
import { runInWorkerContext } from './workerContext.js'
import { broadcast } from '../ws/broadcaster.js'
import { persistSession } from '../session/sessionStore.js'
import { parseWorkerCommands, stripCommandBlocks } from '../coordinator/parseCommands.js'

export interface WorkerConfig {
  agent: Agent
  sessionId: string
  prompt?: string
  taskId?: string
  replyTo?: string
  lifecycleAbort: AbortController
}

const MAX_TURNS_PER_PROMPT = 20
const IDLE_POLL_INTERVAL = 500
const IDLE_TIMEOUT = 30 * 60 * 1000 // 30 min

// ---- External message injection (from coordinator via message_worker) ----
interface PendingWorkerMessage {
  text: string
  replyTo?: string
}

const pendingMessages = new Map<string, PendingWorkerMessage[]>() // agentId → messages

export function enqueueWorkerMessage(agentId: string, text: string, replyTo?: string): void {
  const queue = pendingMessages.get(agentId) ?? []
  queue.push({ text, replyTo })
  pendingMessages.set(agentId, queue)
}

function drainWorkerMessages(agentId: string): PendingWorkerMessage[] {
  const msgs = pendingMessages.get(agentId) ?? []
  pendingMessages.delete(agentId)
  return msgs
}

// Also find by name
export function enqueueWorkerMessageByName(name: string, text: string, workers: Agent[], replyTo?: string): Agent | undefined {
  const worker = workers.find(w => w.name.toLowerCase() === name.toLowerCase())
  if (worker) {
    enqueueWorkerMessage(worker.id, text, replyTo)
  }
  return worker
}

export async function runWorker(config: WorkerConfig): Promise<void> {
  const { agent, sessionId, prompt, taskId, replyTo, lifecycleAbort } = config

  await runInWorkerContext(
    { agentId: agent.id, name: agent.name, sessionId, currentTaskId: taskId },
    async () => {
      const messages: ChatMessage[] = agent.backendSessionId
        ? []
        : [{ role: 'system', content: buildWorkerSystemPrompt(agent) }]

      let currentTaskId = taskId
      let submittedCount = 0
      let pendingMessage: PendingWorkerMessage | null = prompt
        ? { text: prompt, replyTo }
        : null

      // Main loop: process prompt → idle → wait for next message → repeat
      while (!lifecycleAbort.signal.aborted) {
        if (!pendingMessage) {
          // Mark idle
          agent.status = 'idle'
          agent.currentTaskId = undefined
          broadcast({
            type: 'worker:status',
            payload: { id: agent.id, status: 'idle', currentTaskId: undefined },
          })

          // ---- Wait for next message or timeout ----
          pendingMessage = await waitForNextMessage(agent, sessionId, lifecycleAbort)

          if (!pendingMessage || lifecycleAbort.signal.aborted) break
        }

        // Resume with new message
        agent.status = 'running'
        messages.push({ role: 'user', content: pendingMessage.text })

        broadcast({
          type: 'worker:status',
          payload: { id: agent.id, status: 'running', currentTaskId: undefined },
        })

        submittedCount = await executePrompt(
          agent,
          sessionId,
          currentTaskId,
          messages,
          submittedCount,
          lifecycleAbort,
          pendingMessage.replyTo,
        )
        pendingMessage = null
      }

      // Final status
      if (agent.status !== 'stopped') {
        agent.status = 'idle'
        broadcast({
          type: 'worker:status',
          payload: { id: agent.id, status: 'idle', currentTaskId: undefined },
        })
      }
    },
  )
}

/** Execute one prompt cycle (may be multi-turn if tool calls are involved) */
async function executePrompt(
  agent: Agent,
  sessionId: string,
  taskId: string | undefined,
  messages: ChatMessage[],
  submittedCount: number,
  lifecycleAbort: AbortController,
  replyTo: string | undefined,
): Promise<number> {
  let turnCount = 0

  while (!lifecycleAbort.signal.aborted && turnCount < MAX_TURNS_PER_PROMPT) {
    turnCount++
    const turnAbort = new AbortController()
    const onAbort = () => turnAbort.abort()
    lifecycleAbort.signal.addEventListener('abort', onAbort, { once: true })

    broadcast({
      type: 'worker:progress',
      payload: {
        agentId: agent.id, taskId,
        phase: 'thinking', detail: `Turn ${agent.turnCount + 1}`,
        tokensSoFar: agent.tokenUsage.total, turnsSoFar: agent.turnCount + 1,
      },
    })

    try {
      const requestMessages = agent.backendSessionId
        ? messages.slice(submittedCount)
        : messages

      if (requestMessages.length === 0) {
        return submittedCount
      }

      const response = await chat({
        model: agent.model,
        messages: requestMessages,
        workspace: agent.workspace,
        signal: turnAbort.signal,
        sessionId: agent.backendSessionId,
      })

      if (response.sessionId && response.sessionId !== agent.backendSessionId) {
        agent.backendSessionId = response.sessionId
        await persistSession()
      }

      if (response.usage) {
        agent.tokenUsage.prompt += response.usage.prompt_tokens
        agent.tokenUsage.completion += response.usage.completion_tokens
        agent.tokenUsage.total += response.usage.total_tokens
      }
      agent.turnCount += 1

      const assistantText = response.content ?? ''
      messages.push({ role: 'assistant', content: assistantText })
      submittedCount = agent.backendSessionId ? messages.length : 0

      const commands = parseWorkerCommands(assistantText)
      if (commands.length > 0) {
        for (const command of commands) {
          let result = 'Unknown command'

          if (command.type === 'send_message') {
            const msg = await writeMessage(
              sessionId,
              command.to,
              agent.name,
              command.message,
              command.message.slice(0, 80),
            )
            broadcast({ type: 'message:sent', payload: msg })
            result = `Message sent to ${command.to}`
            broadcast({
              type: 'log',
              payload: {
                agentId: agent.name,
                level: 'info',
                text: `Sent message to ${command.to}`,
                timestamp: new Date().toISOString(),
              },
            })
          }

          messages.push({ role: 'tool', content: result })
        }
        continue
      }

      // No tool calls — final answer
      const content = stripCommandBlocks(assistantText) || assistantText

      broadcast({
        type: 'worker:progress',
        payload: {
          agentId: agent.id, taskId,
          phase: 'responded', detail: content.slice(0, 100),
          tokensSoFar: agent.tokenUsage.total, turnsSoFar: agent.turnCount,
        },
      })

      // Complete task
      if (taskId) {
        await updateTask(sessionId, taskId, { status: 'completed', result: content })
        const updated = await getTask(sessionId, taskId)
        if (updated) broadcast({ type: 'task:updated', payload: updated })
      }

      // Notify coordinator
      const notificationTarget = replyTo ?? 'coordinator'
      const notification = notificationTarget === 'coordinator'
        ? [
            `<worker-notification agent="${agent.name}" task="${taskId ?? 'none'}">`,
            content,
            `</worker-notification>`,
          ].join('\n')
        : content
      const msg = await writeMessage(sessionId, notificationTarget, agent.name, notification, content.slice(0, 80))
      if (!isInternalGraphRecipient(msg.to)) {
        broadcast({ type: 'message:sent', payload: msg })
      }

      return agent.backendSessionId ? messages.length : 0

    } catch (err: any) {
      if (turnAbort.signal.aborted || lifecycleAbort.signal.aborted) return submittedCount

      broadcast({
        type: 'log',
        payload: {
          agentId: agent.name, level: 'error',
          text: `LLM error: ${err.message}`,
          timestamp: new Date().toISOString(),
        },
      })

      if (taskId) {
        await updateTask(sessionId, taskId, { status: 'failed', error: err.message })
      }
      return submittedCount
    } finally {
      lifecycleAbort.signal.removeEventListener('abort', onAbort)
    }
  }
  return submittedCount
}

/** Wait for next message from coordinator or mailbox, or timeout */
async function waitForNextMessage(
  agent: Agent,
  sessionId: string,
  lifecycleAbort: AbortController,
): Promise<PendingWorkerMessage | null> {
  const start = Date.now()

  while (!lifecycleAbort.signal.aborted && Date.now() - start < IDLE_TIMEOUT) {
    // Check injected messages (from coordinator's message_worker tool)
    const injected = drainWorkerMessages(agent.id)
    if (injected.length > 0) {
      if (injected.length === 1) return injected[0]!
      return {
        text: injected.map(message => message.text).join('\n\n'),
        replyTo: injected[injected.length - 1]?.replyTo,
      }
    }

    // Check mailbox for peer messages
    for (const mailboxId of [agent.id, agent.name]) {
      const unread = await readUnread(sessionId, mailboxId)
      if (unread.length > 0) {
        const texts: string[] = []
        let replyTo: string | undefined
        for (const msg of unread) {
          await markRead(sessionId, mailboxId, msg.id)
          texts.push(`[Message from ${formatMailboxSender(msg.from)}]: ${msg.text}`)
          replyTo = msg.replyTo ?? replyTo
        }
        return { text: texts.join('\n\n'), replyTo }
      }
    }

    await new Promise(r => setTimeout(r, IDLE_POLL_INTERVAL))
  }

  return null // Timeout
}

function isInternalGraphRecipient(agentId: string): boolean {
  return agentId.startsWith('__graph__:')
}

function formatMailboxSender(agentId: string): string {
  return agentId.startsWith('__graph__') ? 'Graph Runtime' : agentId
}

function buildWorkerSystemPrompt(agent: Agent): string {
  const workspaceLines = [
    `Team root: ${agent.workspace?.rootDir || '(not set)'}`,
    `Working directory: ${agent.workspace?.cwd || agent.workspace?.rootDir || '(not set)'}`,
    `Permission mode: ${agent.workspace?.permissionMode ?? 'dangerously-skip-permissions'}`,
    `Permissions: read=${agent.workspace?.permissions.read ? 'yes' : 'no'}, write=${agent.workspace?.permissions.write ? 'yes' : 'no'}, execute=${agent.workspace?.permissions.execute ? 'yes' : 'no'}`,
  ].join('\n')

  return `You are "${agent.name}", a worker agent in a team.

You are a persistent teammate. You may receive work from the coordinator, the graph runtime, or another teammate.

Your job is to complete the task you were given thoroughly and accurately, then return the result to the sender.
Provide your findings in a clear, structured format.
Be specific — include concrete details, quotes, and references when possible.

## Workspace
${workspaceLines}

You have native workspace capabilities through your backend inside the permitted workspace.
That includes reading files, writing files, and running commands when permissions allow it.
Do not claim those capabilities are unavailable unless an operation actually fails or the workspace permissions deny it.

## Headless Runtime Rule
- Nothing happens unless you emit the exact plain-text command block when you need send_message.
- Never claim that you already messaged a teammate unless you emitted the command block and later received the command result confirming it.

## Execution Rules
- Focus only on the current instruction you received.
- Do not assume anything about the graph, workflow topology, or which worker should run next.
- Do not route work to the next node yourself unless the instruction explicitly asks you to message a teammate.
- Do not mention internal control flow such as "I will pass this to the next node" unless explicitly requested.
- If prior messages exist in the conversation, use them as context for continuity.
- When your current task is done, provide the actual result directly. Do not add meta-commentary about being idle or waiting.

## Team Messaging
Bloom exposes one additional coordination command: send_message.
Use your native workspace capabilities for file and shell work.
Use send_message only when you need to contact another teammate.

You can send messages to other team members by emitting this exact block:

<command type="send_message" to="Teammate">...</command>

Use this to:
- Greet teammates when asked
- Share findings with a specific teammate when explicitly instructed
- Ask a targeted question to another worker when necessary
- Coordinate on shared tasks when the instruction requires collaboration

Use send_message sparingly. Default to replying with your result instead of forwarding it elsewhere.

When you're done with your task, provide your final answer as plain text.
You will stay available after completing a task and may receive follow-up work later.`
}
