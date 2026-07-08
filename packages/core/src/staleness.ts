import type { Graph } from "./types.js"

/**
 * Staleness / impact propagation (pure).
 *
 * When a page changes, every page that links to or cites it may now be stale.
 * {@link impactSurface} returns exactly that backlink set — the signal the
 * maintenance loop consumes. The actual `stale_since` mutation happens in the
 * store; this module only computes *what* should be marked.
 */

/** Pages that reference `targetId` via a `links_to` or `cites` edge (real nodes only). */
export function backlinkPageIds(targetId: string, graph: Graph): string[] {
  const out = new Set<string>()
  for (const e of graph.edges) {
    if (e.target === targetId && e.source !== targetId && graph.nodes.has(e.source)) {
      out.add(e.source)
    }
  }
  return [...out]
}

/** Alias: the set of pages that should go stale when `targetId` changes. */
export function impactSurface(targetId: string, graph: Graph): string[] {
  return backlinkPageIds(targetId, graph)
}
