import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChatMessage, ChatResponse, ToolDef, WorkspaceConfig } from '@bloom/shared'
import { normalizeModelName } from './models.js'

export interface ChatOptions {
  model?: string
  messages: ChatMessage[]
  tools?: ToolDef[]
  signal?: AbortSignal
  temperature?: number
  workspace?: WorkspaceConfig
  sessionId?: string
}

export interface StreamOptions extends ChatOptions {
  onDelta?: (text: string) => void
}

interface ProviderResult {
  content: string
  sessionId?: string
  usage?: ChatResponse['usage']
}

interface ProcessResult {
  stdout: string
  stderr: string
  exitCode: number
}

interface JsonLineEvent {
  [key: string]: unknown
}

export async function chat(opts: ChatOptions): Promise<ChatResponse> {
  const model = normalizeModelName(opts.model)
  const prompt = renderPrompt(opts.messages)

  if (!prompt.trim()) {
    return {
      content: '',
      finish_reason: 'stop',
      sessionId: opts.sessionId,
    }
  }

  const result = await runProvider(model, {
    prompt,
    sessionId: opts.sessionId,
    workspace: opts.workspace,
    signal: opts.signal,
  })

  return {
    content: result.content,
    usage: result.usage,
    finish_reason: 'stop',
    sessionId: result.sessionId,
  }
}

export async function chatStream(opts: StreamOptions): Promise<ChatResponse> {
  const response = await chat(opts)
  if (response.content) opts.onDelta?.(response.content)
  return response
}

async function runProvider(
  model: ReturnType<typeof normalizeModelName>,
  opts: Pick<ChatOptions, 'sessionId' | 'workspace' | 'signal'> & { prompt: string },
): Promise<ProviderResult> {
  switch (model) {
    case 'claude':
      return runClaude(opts)
    case 'gemini':
      return runGemini(opts)
    default:
      return runCodex(opts)
  }
}

async function runCodex(
  opts: Pick<ChatOptions, 'sessionId' | 'workspace' | 'signal'> & { prompt: string },
): Promise<ProviderResult> {
  const cwd = resolveCwd(opts.workspace)
  const rootDir = resolveRootDir(opts.workspace)
  const tempDir = await mkdtemp(join(tmpdir(), 'bloom-codex-'))
  const lastMessagePath = join(tempDir, 'last-message.txt')

  try {
    const args = opts.sessionId
      ? ['exec', 'resume', '--json', '--skip-git-repo-check', '-o', lastMessagePath]
      : ['exec', '--json', '--skip-git-repo-check', '-o', lastMessagePath]

    if (rootDir && rootDir !== cwd) {
      args.push('--add-dir', rootDir)
    }

    if (opts.workspace?.permissionMode === 'dangerously-skip-permissions') {
      args.push('--dangerously-bypass-approvals-and-sandbox')
    } else {
      args.push('--sandbox', 'workspace-write')
    }

    const configuredModel = process.env.BLOOM_CODEX_MODEL?.trim()
    if (configuredModel) {
      args.push('--model', configuredModel)
    }

    if (opts.sessionId) args.push(opts.sessionId)
    args.push(opts.prompt)

    const { stdout, stderr, exitCode } = await runProcess('codex', args, {
      cwd,
      signal: opts.signal,
    })

    const events = parseJsonLines(stdout)
    const started = events.find(event => event.type === 'thread.started')
    const completedTurn = findLastEvent(events, event => event.type === 'turn.completed')

    let content = ''
    try {
      content = (await readFile(lastMessagePath, 'utf-8')).trim()
    } catch {
      const lastItem = findLastValue(
        events
          .filter(event => event.type === 'item.completed')
          .map(event => event.item),
        (item): item is { type?: string; text?: string } => typeof item === 'object' && item !== null,
      )
      content = typeof lastItem?.text === 'string' ? lastItem.text.trim() : ''
    }

    if (exitCode !== 0) {
      throw new Error(formatProviderFailure('codex', stdout, stderr, content))
    }

    return {
      content,
      sessionId: typeof started?.thread_id === 'string' ? started.thread_id : opts.sessionId,
      usage: isUsagePayload(completedTurn?.usage)
        ? {
            prompt_tokens: completedTurn.usage.input_tokens,
            completion_tokens: completedTurn.usage.output_tokens,
            total_tokens: completedTurn.usage.input_tokens + completedTurn.usage.output_tokens,
          }
        : undefined,
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function runGemini(
  opts: Pick<ChatOptions, 'sessionId' | 'workspace' | 'signal'> & { prompt: string },
): Promise<ProviderResult> {
  const cwd = resolveCwd(opts.workspace)
  const rootDir = resolveRootDir(opts.workspace)
  const args = [
    '-p',
    opts.prompt,
    '--output-format',
    'stream-json',
    '--approval-mode',
    'yolo',
  ]

  const configuredModel = process.env.BLOOM_GEMINI_MODEL?.trim()
  if (configuredModel) {
    args.push('--model', configuredModel)
  }

  if (opts.sessionId) {
    args.push('--resume', opts.sessionId)
  }

  if (rootDir && rootDir !== cwd) {
    args.push('--include-directories', rootDir)
  }

  const { stdout, stderr, exitCode } = await runProcess('gemini', args, {
    cwd,
    signal: opts.signal,
  })

  const events = parseJsonLines(stdout)
  const init = events.find(event => event.type === 'init')
  const assistantChunks = events
    .filter(event => event.type === 'message' && event.role === 'assistant')
    .map(event => typeof event.content === 'string' ? event.content : '')
  const result = findLastEvent(events, event => event.type === 'result')
  const content = assistantChunks.join('').trim()

  if (exitCode !== 0 || result?.status === 'error') {
    throw new Error(formatProviderFailure('gemini', stdout, stderr, content || stringifyJsonLine(result)))
  }

  return {
    content,
    sessionId: typeof init?.session_id === 'string'
      ? init.session_id
      : typeof result?.session_id === 'string'
        ? result.session_id
        : opts.sessionId,
    usage: extractGeminiUsage(result),
  }
}

async function runClaude(
  opts: Pick<ChatOptions, 'sessionId' | 'workspace' | 'signal'> & { prompt: string },
): Promise<ProviderResult> {
  const cwd = resolveCwd(opts.workspace)
  const rootDir = resolveRootDir(opts.workspace)
  const args = [
    '-p',
    '--output-format',
    'json',
    '--permission-mode',
    'bypassPermissions',
  ]

  const configuredModel = process.env.BLOOM_CLAUDE_MODEL?.trim()
  if (configuredModel) {
    args.push('--model', configuredModel)
  }

  if (opts.sessionId) {
    args.push('--resume', opts.sessionId)
  }

  if (rootDir && rootDir !== cwd) {
    args.push('--add-dir', rootDir)
  }

  args.push(opts.prompt)

  const { stdout, stderr, exitCode } = await runProcess('claude', args, {
    cwd,
    signal: opts.signal,
  })

  const payload = parseLastJsonObject(stdout)

  if (!payload) {
    throw new Error(formatProviderFailure('claude', stdout, stderr))
  }

  if (exitCode !== 0 || payload.is_error === true) {
    throw new Error(String(payload.result ?? formatProviderFailure('claude', stdout, stderr)))
  }

  return {
    content: typeof payload.result === 'string' ? payload.result.trim() : '',
    sessionId: typeof payload.session_id === 'string' ? payload.session_id : opts.sessionId,
    usage: isClaudeUsage(payload.usage)
      ? {
          prompt_tokens: payload.usage.input_tokens,
          completion_tokens: payload.usage.output_tokens,
          total_tokens: payload.usage.input_tokens + payload.usage.output_tokens,
        }
      : undefined,
  }
}

async function runProcess(
  command: string,
  args: string[],
  opts: { cwd: string; signal?: AbortSignal },
): Promise<ProcessResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: {
        ...process.env,
        NO_COLOR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      opts.signal?.removeEventListener('abort', onAbort)
      fn()
    }

    const onAbort = () => {
      child.kill('SIGTERM')
      finish(() => reject(new Error(`${command} invocation aborted`)))
    }

    opts.signal?.addEventListener('abort', onAbort, { once: true })

    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })

    child.on('error', error => {
      finish(() => reject(error))
    })

    child.on('close', exitCode => {
      finish(() => resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 0,
      }))
    })
  })
}

function renderPrompt(messages: ChatMessage[]): string {
  return messages
    .map((message, index) => {
      const prefix = `${index + 1}. ${roleLabel(message.role)}`
      return `${prefix}\n${message.content}`.trim()
    })
    .join('\n\n')
    .trim()
}

function roleLabel(role: ChatMessage['role']): string {
  switch (role) {
    case 'assistant':
      return 'Assistant'
    case 'system':
      return 'System'
    case 'tool':
      return 'Tool Result'
    default:
      return 'User'
  }
}

function parseJsonLines(stdout: string): JsonLineEvent[] {
  return stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line) as JsonLineEvent
      } catch {
        return null
      }
    })
    .filter((event): event is JsonLineEvent => event !== null)
}

function parseLastJsonObject(stdout: string): Record<string, any> | null {
  const lines = stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!
    try {
      return JSON.parse(line) as Record<string, any>
    } catch {
      continue
    }
  }

  return null
}

function findLastEvent(
  events: JsonLineEvent[],
  predicate: (event: JsonLineEvent) => boolean,
): JsonLineEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event && predicate(event)) return event
  }
  return undefined
}

function findLastValue<T, S extends T>(
  values: T[],
  predicate: (value: T) => value is S,
): S | undefined {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]
    if (value !== undefined && predicate(value)) return value
  }
  return undefined
}

function extractGeminiUsage(result: JsonLineEvent | undefined): ChatResponse['usage'] | undefined {
  const stats = typeof result?.stats === 'object' && result.stats !== null
    ? result.stats as Record<string, any>
    : null

  if (!stats) return undefined

  const promptTokens = readNumber(stats.input_tokens) ?? readNumber(stats.input)
  const completionTokens = readNumber(stats.output_tokens)
  const totalTokens = readNumber(stats.total_tokens) ?? (
    promptTokens !== undefined && completionTokens !== undefined
      ? promptTokens + completionTokens
      : undefined
  )

  if (promptTokens === undefined || completionTokens === undefined || totalTokens === undefined) {
    return undefined
  }

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  }
}

function formatProviderFailure(
  provider: string,
  stdout: string,
  stderr: string,
  parsedContent?: string,
): string {
  const details = [parsedContent, stderr.trim(), stdout.trim()]
    .filter(Boolean)
    .join('\n')
    .trim()

  return details
    ? `${provider} CLI failed:\n${details}`
    : `${provider} CLI failed`
}

function resolveCwd(workspace?: WorkspaceConfig): string {
  return workspace?.cwd?.trim() || workspace?.rootDir?.trim() || process.cwd()
}

function resolveRootDir(workspace?: WorkspaceConfig): string {
  return workspace?.rootDir?.trim() || resolveCwd(workspace)
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringifyJsonLine(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function isUsagePayload(value: unknown): value is { input_tokens: number; output_tokens: number } {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { input_tokens?: unknown }).input_tokens === 'number'
    && typeof (value as { output_tokens?: unknown }).output_tokens === 'number'
}

function isClaudeUsage(value: unknown): value is { input_tokens: number; output_tokens: number } {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { input_tokens?: unknown }).input_tokens === 'number'
    && typeof (value as { output_tokens?: unknown }).output_tokens === 'number'
}
