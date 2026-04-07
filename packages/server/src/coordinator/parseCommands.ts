export type CoordinatorCommand =
  | { type: 'create_task'; subject: string; description: string; blockedBy?: string[] }
  | { type: 'spawn_worker'; name: string; prompt: string; model: string; taskId?: string; cwd?: string }
  | { type: 'message_worker'; name: string; message: string; taskId?: string; cwd?: string }
  | { type: 'stop_worker'; name?: string; workerId?: string }
  | { type: 'complete_session'; summary: string }

export type WorkerCommand =
  | { type: 'send_message'; to: string; message: string }

const COMMAND_RE = /<command\s+([^>]+)>([\s\S]*?)<\/command>/g
const TOOL_CALL_RE = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g
const JSON_BLOCK_RE = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g

export function parseCoordinatorCommands(text: string): CoordinatorCommand[] {
  return parseCommands(text)
    .filter((command): command is CoordinatorCommand => command.type !== 'send_message')
}

export function parseWorkerCommands(text: string): WorkerCommand[] {
  return parseCommands(text)
    .filter((command): command is WorkerCommand => command.type === 'send_message')
}

export function stripCommandBlocks(text: string): string {
  return text
    .replace(COMMAND_RE, '')
    .replace(TOOL_CALL_RE, '')
    .replace(JSON_BLOCK_RE, '')
    .trim()
}

function parseCommands(text: string): Array<CoordinatorCommand | WorkerCommand> {
  const commands = [
    ...parseCommandXml(text),
    ...parseToolCallXml(text),
    ...parseJsonBlocks(text),
  ]

  return dedup(commands)
}

function parseCommandXml(text: string): Array<CoordinatorCommand | WorkerCommand> {
  const commands: Array<CoordinatorCommand | WorkerCommand> = []

  for (const match of text.matchAll(COMMAND_RE)) {
    const attrsStr = match[1] ?? ''
    const body = match[2]?.trim() ?? ''
    const attrs = parseAttrs(attrsStr)
    const command = fromName(attrs.type, {
      ...attrs,
      body,
      prompt: attrs.prompt ?? body,
      description: attrs.description ?? body,
      message: attrs.message ?? body,
      summary: attrs.summary ?? body,
    })
    if (command) commands.push(command)
  }

  return commands
}

function parseToolCallXml(text: string): Array<CoordinatorCommand | WorkerCommand> {
  const commands: Array<CoordinatorCommand | WorkerCommand> = []

  for (const match of text.matchAll(TOOL_CALL_RE)) {
    try {
      const parsed = JSON.parse(match[1] ?? '{}') as Record<string, any>
      const command = fromJsonPayload(parsed)
      if (command) commands.push(command)
    } catch {
      continue
    }
  }

  return commands
}

function parseJsonBlocks(text: string): Array<CoordinatorCommand | WorkerCommand> {
  const commands: Array<CoordinatorCommand | WorkerCommand> = []

  for (const match of text.matchAll(JSON_BLOCK_RE)) {
    try {
      const parsed = JSON.parse(match[1] ?? '{}') as Record<string, any>
      const command = fromJsonPayload(parsed)
      if (command) commands.push(command)
    } catch {
      continue
    }
  }

  return commands
}

function fromJsonPayload(payload: Record<string, any>): CoordinatorCommand | WorkerCommand | null {
  const name = payload.name ?? payload.action ?? payload.type ?? payload.command
  const params = payload.parameters ?? payload.params ?? payload
  return fromName(name, params)
}

function fromName(name: string | undefined, params: Record<string, any> | undefined): CoordinatorCommand | WorkerCommand | null {
  if (!name || !params) return null

  switch (name) {
    case 'create_task':
      return {
        type: 'create_task',
        subject: String(params.subject ?? 'Untitled'),
        description: String(params.description ?? params.body ?? ''),
        blockedBy: normalizeStringArray(params.blocked_by ?? params.blockedBy),
      }

    case 'spawn_worker':
      return {
        type: 'spawn_worker',
        name: String(params.name ?? 'Worker'),
        prompt: String(params.prompt ?? params.body ?? ''),
        model: String(params.model ?? 'codex'),
        taskId: normalizeString(params.task_id ?? params.taskId),
        cwd: normalizeString(params.cwd),
      }

    case 'message_worker':
      return {
        type: 'message_worker',
        name: String(params.name ?? 'Worker'),
        message: String(params.message ?? params.body ?? ''),
        taskId: normalizeString(params.task_id ?? params.taskId),
        cwd: normalizeString(params.cwd),
      }

    case 'stop_worker':
      return {
        type: 'stop_worker',
        name: normalizeString(params.name),
        workerId: normalizeString(params.worker_id ?? params.workerId),
      }

    case 'complete_session':
      return {
        type: 'complete_session',
        summary: String(params.summary ?? params.body ?? ''),
      }

    case 'send_message':
      return {
        type: 'send_message',
        to: String(params.to ?? ''),
        message: String(params.message ?? params.body ?? ''),
      }

    default:
      return null
  }
}

function parseAttrs(str: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const match of str.matchAll(/(\w+)="([^"]*)"/g)) {
    attrs[match[1] ?? ''] = match[2] ?? ''
  }
  return attrs
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const normalized = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
  return normalized.length > 0 ? normalized : undefined
}

function dedup(commands: Array<CoordinatorCommand | WorkerCommand>): Array<CoordinatorCommand | WorkerCommand> {
  const seen = new Set<string>()

  return commands.filter(command => {
    const key = JSON.stringify(command)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
