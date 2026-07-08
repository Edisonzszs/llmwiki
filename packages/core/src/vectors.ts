/**
 * Pluggable vector index + reciprocal rank fusion (differentiator C, vector
 * half). The index is an interface so the default is *off* and any provider
 * (local Ollama, OpenAI, a native lib) can be supplied; the in-memory cosine
 * implementation is the zero-dependency default for tests and small wikis.
 */

export interface VectorIndex {
  upsert(id: string, vector: number[]): void
  query(vector: number[], k: number): Array<{ id: string; score: number }>
  size(): number
}

export interface Embedder {
  embed(text: string): Promise<number[]>
}

/** Cosine similarity; returns NaN for a zero vector. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? Number.NaN : dot / denom
}

/** In-memory cosine-similarity vector index. */
export class InMemoryVectorIndex implements VectorIndex {
  private ids: string[] = []
  private vecs: number[][] = []

  upsert(id: string, vector: number[]): void {
    const i = this.ids.indexOf(id)
    if (i >= 0) this.vecs[i] = vector
    else {
      this.ids.push(id)
      this.vecs.push(vector)
    }
  }

  query(vector: number[], k: number): Array<{ id: string; score: number }> {
    const scored = this.ids
      .map((id, i) => ({ id, score: cosineSimilarity(vector, this.vecs[i]!) }))
      .filter((s) => !Number.isNaN(s.score))
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, k)
  }

  size(): number {
    return this.ids.length
  }
}

/**
 * Reciprocal rank fusion: combine multiple ranked id lists into one, rewarding
 * items that appear high in many lists. `k` (default 60) dampens the rank term.
 */
export function reciprocalRankFusion(rankings: string[][], k = 60): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>()
  for (const ranking of rankings) {
    ranking.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1))
    })
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
}
