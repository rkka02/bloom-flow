import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const BLOOM_DIR = join(process.env.HOME ?? '.', '.bloom')
const WORKFLOWS_DIR = join(BLOOM_DIR, 'workflows')

export interface SavedWorkflow {
  id: string
  name: string
  description: string
  nodes: any[]
  edges: any[]
  createdAt: string
  updatedAt: string
}

export interface WorkflowSummary {
  id: string
  name: string
  description: string
  nodeCount: number
  edgeCount: number
  createdAt: string
  updatedAt: string
}

async function ensureDir() {
  await mkdir(WORKFLOWS_DIR, { recursive: true })
}

export async function listWorkflows(): Promise<WorkflowSummary[]> {
  await ensureDir()
  let files: string[]
  try {
    files = await readdir(WORKFLOWS_DIR)
  } catch {
    return []
  }

  const summaries: WorkflowSummary[] = []
  for (const file of files.filter(f => f.endsWith('.json')).sort()) {
    try {
      const raw = await readFile(join(WORKFLOWS_DIR, file), 'utf-8')
      const wf: SavedWorkflow = JSON.parse(raw)
      summaries.push({
        id: wf.id,
        name: wf.name,
        description: wf.description,
        nodeCount: wf.nodes.length,
        edgeCount: wf.edges.length,
        createdAt: wf.createdAt,
        updatedAt: wf.updatedAt,
      })
    } catch { /* skip */ }
  }

  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getWorkflow(id: string): Promise<SavedWorkflow | null> {
  try {
    const raw = await readFile(join(WORKFLOWS_DIR, `${id}.json`), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function saveWorkflow(data: {
  id?: string
  name: string
  description: string
  nodes: any[]
  edges: any[]
}): Promise<SavedWorkflow> {
  await ensureDir()
  const now = new Date().toISOString()
  const id = data.id ?? randomUUID().slice(0, 12)

  let existing: SavedWorkflow | null = null
  if (data.id) {
    existing = await getWorkflow(data.id)
  }

  const wf: SavedWorkflow = {
    id,
    name: data.name,
    description: data.description,
    nodes: data.nodes,
    edges: data.edges,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await writeFile(join(WORKFLOWS_DIR, `${id}.json`), JSON.stringify(wf, null, 2))
  return wf
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  try {
    await rm(join(WORKFLOWS_DIR, `${id}.json`), { force: true })
    return true
  } catch {
    return false
  }
}
