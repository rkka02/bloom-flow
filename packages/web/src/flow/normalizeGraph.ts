import type { Edge, Node } from '@xyflow/react'

export function normalizeGraph(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
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

function dedupeEdges(edges: Edge[]): Edge[] {
  const seen = new Set<string>()
  return edges.filter(edge => {
    const key = `${edge.source}:${edge.sourceHandle ?? ''}->${edge.target}:${edge.targetHandle ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
