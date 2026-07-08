import type { ContextBudget } from "./context-budget.js"
import type { Graph, Page } from "./types.js"
import type { Store } from "./store.js"
import { reciprocalRankFusion, type Embedder, type VectorIndex } from "./vectors.js"

/**
 * Hybrid retrieval (differentiator C). BM25 (FTS5) seeds the result set;
 * when an optional vector index + embedder are supplied, BM25 and vector
 * rankings are fused via reciprocal rank fusion. A 1-hop graph expansion then
 * adds the neighborhood — the compounding payoff. Works with no vectors at all.
 *
 * Output: a ranked hit list plus a budget-packed context block ready to inject
 * into an `ask` prompt (ADR-19 retrieval+injection).
 */

export interface RetrievalInput {
  query: string
  store: Store
  graph: Graph
  pages: Page[]
  budget: ContextBudget
  vectorIndex?: VectorIndex
  embedder?: Embedder
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

export async function retrieve(input: RetrievalInput): Promise<RetrievalResult> {
  const { query, store, graph, pages, budget } = input
  const topK = input.opts?.topK ?? 10
  const decay = input.opts?.expansionDecay ?? 0.4

  const byId = new Map(pages.map((p) => [p.id, p]))
  const scores = new Map<string, RetrievalHit>()

  const bm25 = store.search(query, { limit: topK })
  const bm25Ids = bm25.map((s) => s.pageId)

  if (input.vectorIndex && input.embedder) {
    const vec = await input.embedder.embed(query)
    const vecIds = input.vectorIndex.query(vec, topK).map((h) => h.id)
    const fused = reciprocalRankFusion([bm25Ids, vecIds])
    const max = fused[0]?.score ?? 1
    for (const f of fused) {
      if (byId.has(f.id)) {
        scores.set(f.id, { pageId: f.id, score: max > 0 ? f.score / max : 0, reason: "bm25" })
      }
    }
  } else {
    bm25.forEach((s, i) => scores.set(s.pageId, { pageId: s.pageId, score: 1 / (i + 1), reason: "bm25" }))
  }

  // 1-hop graph expansion over the seed set (snapshot before mutating).
  for (const seedId of [...scores.keys()]) {
    const seedScore = scores.get(seedId)?.score ?? 0
    for (const neighborId of neighbors(seedId, graph)) {
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
