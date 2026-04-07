export type LocalCliModel = 'codex' | 'gemini' | 'claude'

export function normalizeModelName(model?: string | null): LocalCliModel {
  const value = (model ?? 'codex').toLowerCase()

  if (value.includes('gemini')) return 'gemini'
  if (value.includes('claude')) return 'claude'
  return 'codex'
}

export function getModelLabel(model?: string | null): string {
  switch (normalizeModelName(model)) {
    case 'claude':
      return 'Claude'
    case 'gemini':
      return 'Gemini'
    default:
      return 'Codex'
  }
}
