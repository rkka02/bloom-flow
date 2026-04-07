export interface WorkerNodeData {
  label: string
  model: string
  role: string
  cwd?: string
  prompt: string
  color?: string
  sharedWorkerKey?: string
  status: 'idle' | 'running' | 'completed' | 'error'
}

export interface BranchNodeData {
  label: string
  model: string
  conditions: { expr: string; target: string }[]
  status: 'idle' | 'running' | 'completed'
}

export interface LoopNodeData {
  label: string
  model: string
  maxIterations: number
  condition: string
  progress: number // 0-100
  status: 'idle' | 'running' | 'completed'
}

export interface MergeNodeData {
  label: string
  status: 'idle' | 'running' | 'completed'
}

export interface IONodeData {
  label: string
  value: string
  direction: 'input' | 'output'
}

export type BloomNodeData = WorkerNodeData | BranchNodeData | LoopNodeData | MergeNodeData | IONodeData
