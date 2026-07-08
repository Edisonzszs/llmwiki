import type { Graph, GraphNode } from "./types.js"

/**
 * Structural insights over the link graph (pure). These turn the graph from
 * decoration into an actionable research tool: where are the gaps, the hubs,
 * the disconnected clusters? Consumed by the maintenance planner (M3) and the
 * graph/impact surfaces.
 */

export interface KnowledgeGap {
  /** A link target referenced by pages but with no page of its own. */
  target: string
  /** Pages that reference it. */
  referencedBy: string[]
}

/** Dangling link targets aggregated into proposed-page candidates (most-referenced first). */
export function findKnowledgeGaps(graph: Graph): KnowledgeGap[] {
  const refBy = new Map<string, Set<string>>()
  for (const e of graph.edges) {
    if (graph.nodes.has(e.target)) continue // only dangling targets
    if (e.source === e.target) continue
    let set = refBy.get(e.target)
    if (!set) {
      set = new Set()
      refBy.set(e.target, set)
    }
    set.add(e.source)
  }
  return [...refBy.entries()]
    .map(([target, refs]) => ({ target, referencedBy: [...refs] }))
    .sort((a, b) => b.referencedBy.length - a.referencedBy.length)
}

/** High-degree nodes (hubs), descending by degree. */
export function findHubs(graph: Graph, minDegree = 3): GraphNode[] {
  return [...graph.nodes.values()]
    .filter((n) => n.degree >= minDegree)
    .sort((a, b) => b.degree - a.degree)
}

/** Connected components of the (undirected) link graph, each a list of node ids. */
export function connectedComponents(graph: Graph): string[][] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let cur = x
    while (parent.get(cur) !== cur) {
      const p = parent.get(cur)!
      parent.set(cur, parent.get(p)!) // path compression
      cur = p
    }
    return cur
  }
  const union = (x: string, y: string): void => {
    const rx = find(x)
    const ry = find(y)
    if (rx !== ry) parent.set(rx, ry)
  }
  for (const id of graph.nodes.keys()) parent.set(id, id)
  for (const e of graph.edges) {
    if (e.source === e.target) continue
    if (!graph.nodes.has(e.source) || !graph.nodes.has(e.target)) continue
    union(e.source, e.target)
  }
  const groups = new Map<string, string[]>()
  for (const id of graph.nodes.keys()) {
    const root = find(id)
    const arr = groups.get(root)
    if (arr) arr.push(id)
    else groups.set(root, [id])
  }
  return [...groups.values()]
}
