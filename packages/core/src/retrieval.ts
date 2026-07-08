import type { ContextBudget } from "./context-budget.js"
import type { Graph, Page } from "./types.js"
import type { Store } from "./store.js"

/**
 * Hybrid retrieval (differentiator C, core half): BM25 (via the store's FTS5)
 * seeds the result set, then a 1-hop graph expansion adds the neighborhood —
 * the compounding payoff that turns "find a page" into "find the page *and its
 * context*". An optional vector index + reciprocal-rank-fusion layer is added
 * in M3; this works with no vectors at all.
 *
 * The output is a ranked hit list plus a budget-packed context block ready to
 * inject into an `ask` prompt (ADR-19 retrieval+injection).
 */

export interface RetrievalInput {
  query: string
  store: Store
  graph: Graph
  pages: Page[]
  budget: ContextBudget
  opts?: { topK?: number; expansionDecay?: number }
}

export interface RetrievalHit {
  pageId: string
  score: number
  reason: "bm25" | "graph-neighbor"
}

export interface RetrievalResult {
  hits: RetrievalHit[]
  contextBlock: string
}

export function retrieve(input: RetrievalInput): RetrievalResult {
  const { query, store, graph, pages, budget } = input
  const topK = input.opts?.topK ?? 10
  const decay = input.opts?.expansionDecay ?? 0.4

  const byId = new Map(pages.map((p) => [p.id, p]))
  const scores = new Map<string, RetrievalHit>()

  const seeds = store.search(query, { limit: topK })
  seeds.forEach((s, i) => {
    scores.set(s.pageId, { pageId: s.pageId, score: 1 / (i + 1), reason: "bm25" })
  })

  for (const seed of seeds) {
    const seedScore = scores.get(seed.pageId)?.score ?? 0
    for (const neighborId of neighbors(seed.pageId, graph)) {
      const expanded = seedScore * decay
      const current = scores.get(neighborId)
      if (!current || current.score < expanded) {
        scores.set(neighborId, { pageId: neighborId, score: expanded, reason: "graph-neighbor" })
      }
    }
  }

  const hits = [...scores.values()]
    .filter((h) => byId.has(h.pageId))
    .sort((a, b) => b.score - a.score)

  const chunks: string[] = []
  let spent = 0
  for (const h of hits) {
    const page = byId.get(h.pageId)
    if (!page) continue
    const body = page.body.slice(0, budget.maxPageSize)
    if (spent + body.length > budget.pageBudget) break
    spent += body.length
    const title = page.fm?.title ?? h.pageId
    chunks.push(`### [[${h.pageId}]] — ${title}\n${body}`)
  }

  return { hits, contextBlock: chunks.join("\n\n") }
}

/** Undirected 1-hop neighbors of a node (real nodes only). */
function neighbors(id: string, graph: Graph): string[] {
  const out = new Set<string>()
  for (const e of graph.edges) {
    if (e.source === id && e.target !== id && graph.nodes.has(e.target)) out.add(e.target)
    if (e.target === id && e.source !== id && graph.nodes.has(e.source)) out.add(e.source)
  }
  return [...out]
}
