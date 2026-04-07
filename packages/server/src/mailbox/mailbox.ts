import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AgentId, MailboxMessage } from '@bloom/shared'
import { addSessionMessage } from '../session/sessionStore.js'

const BLOOM_DIR = join(process.env.HOME ?? '.', '.bloom')

function isInternalGraphParticipant(agentId: AgentId): boolean {
  return agentId.startsWith('__graph__')
}

function encodeInboxId(agentId: AgentId): string {
  return encodeURIComponent(agentId)
}

function decodeInboxId(encodedAgentId: string): AgentId {
  try {
    return decodeURIComponent(encodedAgentId)
  } catch {
    return encodedAgentId
  }
}

function inboxDir(sessionId: string, agentId: AgentId): string {
  return join(BLOOM_DIR, 'sessions', sessionId, 'inboxes', encodeInboxId(agentId))
}

/** Write a message to an agent's inbox */
export async function writeMessage(
  sessionId: string,
  to: AgentId,
  from: AgentId,
  text: string,
  summary?: string,
  replyTo?: string,
): Promise<MailboxMessage> {
  const dir = inboxDir(sessionId, to)
  await mkdir(dir, { recursive: true })

  const msg: MailboxMessage = {
    id: randomUUID(),
    from,
    to,
    text,
    summary,
    replyTo,
    timestamp: new Date().toISOString(),
    read: false,
  }

  const filename = `${Date.now()}-${msg.id.slice(0, 8)}.json`
  await writeFile(join(dir, filename), JSON.stringify(msg))
  if (!isInternalGraphParticipant(to) && !isInternalGraphParticipant(from)) {
    addSessionMessage(sessionId, msg)
  }
  return msg
}

/** Read all messages from an agent's inbox, sorted by time */
export async function readInbox(
  sessionId: string,
  agentId: AgentId,
): Promise<{ messages: MailboxMessage[]; filenames: string[] }> {
  const dir = inboxDir(sessionId, agentId)
  await mkdir(dir, { recursive: true })

  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return { messages: [], filenames: [] }
  }

  files = files.filter(f => f.endsWith('.json')).sort()
  const messages: MailboxMessage[] = []
  const filenames: string[] = []

  for (const file of files) {
    try {
      const raw = await readFile(join(dir, file), 'utf-8')
      messages.push(JSON.parse(raw))
      filenames.push(file)
    } catch {
      // skip corrupted
    }
  }

  return { messages, filenames }
}

/** Read unread messages from an agent's inbox */
export async function readUnread(
  sessionId: string,
  agentId: AgentId,
): Promise<MailboxMessage[]> {
  const { messages } = await readInbox(sessionId, agentId)
  return messages.filter(m => !m.read)
}

/** Mark a message as read by rewriting the file */
export async function markRead(
  sessionId: string,
  agentId: AgentId,
  messageId: string,
): Promise<void> {
  const dir = inboxDir(sessionId, agentId)
  const { messages, filenames } = await readInbox(sessionId, agentId)

  for (let i = 0; i < messages.length; i++) {
    if (messages[i]!.id === messageId && !messages[i]!.read) {
      const updated = { ...messages[i]!, read: true }
      await writeFile(join(dir, filenames[i]!), JSON.stringify(updated))
      break
    }
  }
}

/** Read all messages across all inboxes in a session */
export async function readAllMessages(sessionId: string): Promise<MailboxMessage[]> {
  const sessionDir = join(BLOOM_DIR, 'sessions', sessionId, 'inboxes')
  await mkdir(sessionDir, { recursive: true })

  let agents: string[]
  try {
    agents = await readdir(sessionDir)
  } catch {
    return []
  }

  const all: MailboxMessage[] = []
  for (const agent of agents) {
    const { messages } = await readInbox(sessionId, decodeInboxId(agent))
    all.push(...messages)
  }

  return all.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}
