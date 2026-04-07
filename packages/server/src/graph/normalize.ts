interface FlowNode {
  id: string
  type?: string
  data?: Record<string, any>
}

interface FlowEdge {
  id?: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  [key: string]: any
}

export function normalizeGraph(nodes: FlowNode[], edges: FlowEdge[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  let nextNodes = [...nodes]
  let nextEdges = [...edges]

  while (nextNodes.some(node => node.type === 'merge')) {
    const mergeNode = nextNodes.find(node => node.type === 'merge')
    if (!mergeNode) break

    const incoming = nextEdges.filter(edge => edge.target === mergeNode.id)
    const outgoing = nextEdges.filter(edge => edge.source === mergeNode.id)

    const rewired = incoming.flatMap(incomingEdge => outgoing.map(outgoingEdge => ({
      ...outgoingEdge,
      id: `fanin:${incomingEdge.id ?? `${incomingEdge.source}:${incomingEdge.sourceHandle ?? ''}->${mergeNode.id}`}:${outgoingEdge.id ?? `${mergeNode.id}->${outgoingEdge.target}:${outgoingEdge.targetHandle ?? ''}`}`,
      source: incomingEdge.source,
      sourceHandle: incomingEdge.sourceHandle ?? null,
      target: outgoingEdge.target,
      targetHandle: outgoingEdge.targetHandle ?? null,
    }))).filter(edge => edge.source !== edge.target)

    nextEdges = dedupeEdges([
      ...nextEdges.filter(edge => edge.source !== mergeNode.id && edge.target !== mergeNode.id),
      ...rewired,
    ])
    nextNodes = nextNodes.filter(node => node.id !== mergeNode.id)
  }

  return { nodes: nextNodes, edges: dedupeEdges(nextEdges) }
}

function dedupeEdges(edges: FlowEdge[]): FlowEdge[] {
  const seen = new Set<string>()
  return edges.filter(edge => {
    const key = `${edge.source}:${edge.sourceHandle ?? ''}->${edge.target}:${edge.targetHandle ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
