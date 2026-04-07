import type { WorkspaceConfig } from '@bloom/shared'
import { isAbsolute, relative, resolve } from 'node:path'

const SAFE_PERSISTED_ID_PATTERN = /^[A-Za-z0-9_-]+$/
type WorkspaceInput = Partial<Omit<WorkspaceConfig, 'permissions'>> & {
  permissions?: Partial<WorkspaceConfig['permissions']>
}

export function normalizePersistedId(value: string, label: string = 'identifier'): string {
  const normalized = value.trim()
  if (!normalized || !SAFE_PERSISTED_ID_PATTERN.test(normalized)) {
    throw new Error(`Invalid ${label}`)
  }
  return normalized
}

export function tryNormalizePersistedId(value: string): string | null {
  try {
    return normalizePersistedId(value)
  } catch {
    return null
  }
}

export function normalizeWorkspacePaths(
  workspace?: WorkspaceInput,
): { rootDir: string; cwd: string } {
  const rootDir = normalizeLocalPath(workspace?.rootDir)
    ?? normalizeLocalPath(workspace?.cwd)
    ?? process.cwd()
  const requestedCwd = normalizeLocalPath(workspace?.cwd) ?? rootDir

  return {
    rootDir,
    cwd: isPathWithinRoot(rootDir, requestedCwd) ? requestedCwd : rootDir,
  }
}

export function isPathWithinRoot(rootDir: string, targetPath: string): boolean {
  const relativePath = relative(rootDir, targetPath)
  return relativePath === ''
    || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function normalizeLocalPath(value?: string): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return resolve(trimmed)
}
