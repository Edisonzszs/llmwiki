import Database from "better-sqlite3"
import type { Database as DB, Statement } from "better-sqlite3"

/**
 * Derived, disposable index over the wiki. The filesystem (`raw/` + `wiki/`) is
 * truth; this SQLite DB is rebuildable from it (delete `.llmwiki/index.db` and
 * call `rebuild`). Provides FTS5 search and staleness tracking.
 *
 * The FTS table uses the `trigram` tokenizer so CJK substring queries work
 * out of the box (the `unicode61` tokenizer doesn't segment Chinese). An
 * `unicode61`+porter stemming sidecar for better English recall is a later
 * refinement; trigram substring matching is good enough at personal scale.
 */

export interface StoreEntry {
  id: string
  path: string
  sourceKind: "wiki" | "source" | "asset"
  type?: string
  title?: string
  tags?: string[]
  content: string
  staleSince?: string | null
}

export interface StoreHit {
  pageId: string
  /** BM25 score (lower = more relevant; matches FTS5's `rank` ordering). */
  score: number
  title?: string
}

const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('wiki', 'source', 'asset')),
  type TEXT,
  title TEXT,
  tags TEXT DEFAULT '[]',
  content TEXT DEFAULT '',
  stale_since TEXT,
  content_hash TEXT,
  updated TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  page_id UNINDEXED, title, content, tokenize='trigram'
);
`

interface Prepared {
  insertDoc: Statement
  insertFts: Statement
  deleteFts: Statement
  upsertDoc: Statement
  deleteDoc: Statement
  search: Statement
  markStale: Statement
  clearStale: Statement
  findStale: Statement
}

export class Store {
  private readonly db: DB
  private readonly stmts: Prepared

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma("journal_mode = WAL")
    this.db.exec(SCHEMA)
    this.stmts = this.prepareStatements()
  }

  private prepareStatements(): Prepared {
    return {
      insertDoc: this.db.prepare(
        `INSERT INTO documents (id, path, source_kind, type, title, tags, content, stale_since)
         VALUES (@id, @path, @sourceKind, @type, @title, @tags, @content, @staleSince)`,
      ),
      insertFts: this.db.prepare(
        `INSERT INTO pages_fts (page_id, title, content) VALUES (?, ?, ?)`,
      ),
      deleteFts: this.db.prepare(`DELETE FROM pages_fts WHERE page_id = ?`),
      upsertDoc: this.db.prepare(
        `INSERT INTO documents (id, path, source_kind, type, title, tags, content, stale_since, updated)
         VALUES (@id, @path, @sourceKind, @type, @title, @tags, @content, @staleSince, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           path = excluded.path,
           source_kind = excluded.source_kind,
           type = excluded.type,
           title = excluded.title,
           tags = excluded.tags,
           content = excluded.content,
           stale_since = excluded.stale_since,
           updated = datetime('now')`,
      ),
      deleteDoc: this.db.prepare(`DELETE FROM documents WHERE id = ?`),
      search: this.db.prepare(
        `SELECT page_id AS pageId, title, bm25(pages_fts) AS score
         FROM pages_fts WHERE pages_fts MATCH ? ORDER BY score LIMIT ?`,
      ),
      markStale: this.db.prepare(
        `UPDATE documents SET stale_since = COALESCE(stale_since, datetime('now')) WHERE id = ?`,
      ),
      clearStale: this.db.prepare(`UPDATE documents SET stale_since = NULL WHERE id = ?`),
      findStale: this.db.prepare(`SELECT id FROM documents WHERE stale_since IS NOT NULL`),
    }
  }

  /** Wipe and re-derive the entire index from the given entries. */
  rebuild(entries: StoreEntry[]): void {
    const tx = this.db.transaction((es: StoreEntry[]) => {
      this.db.exec("DELETE FROM documents")
      this.db.exec("DELETE FROM pages_fts")
      for (const e of es) this.insertRow(e)
    })
    tx(entries)
  }

  /** Insert or replace a single entry, keeping FTS in sync. */
  upsert(entry: StoreEntry): void {
    this.stmts.deleteFts.run(entry.id)
    this.stmts.upsertDoc.run({
      id: entry.id,
      path: entry.path,
      sourceKind: entry.sourceKind,
      type: entry.type ?? null,
      title: entry.title ?? null,
      tags: JSON.stringify(entry.tags ?? []),
      content: entry.content,
      staleSince: entry.staleSince ?? null,
    })
    this.stmts.insertFts.run(entry.id, entry.title ?? "", entry.content)
  }

  private insertRow(e: StoreEntry): void {
    this.stmts.insertDoc.run({
      id: e.id,
      path: e.path,
      sourceKind: e.sourceKind,
      type: e.type ?? null,
      title: e.title ?? null,
      tags: JSON.stringify(e.tags ?? []),
      content: e.content,
      staleSince: e.staleSince ?? null,
    })
    this.stmts.insertFts.run(e.id, e.title ?? "", e.content)
  }

  delete(id: string): void {
    this.stmts.deleteDoc.run(id)
    this.stmts.deleteFts.run(id)
  }

  /** BM25 search over page content. Lower score = more relevant. */
  search(query: string, opts?: { limit?: number }): StoreHit[] {
    const match = buildMatchExpression(query)
    if (!match) return []
    const limit = opts?.limit ?? 20
    const rows = this.stmts.search.all(match, limit) as Array<{
      pageId: string
      title: string | null
      score: number
    }>
    return rows.map((r) => ({ pageId: r.pageId, score: r.score, ...(r.title ? { title: r.title } : {}) }))
  }

  markStale(id: string): void {
    this.stmts.markStale.run(id)
  }

  clearStale(id: string): void {
    this.stmts.clearStale.run(id)
  }

  findStale(): Array<{ id: string }> {
    return this.stmts.findStale.all() as Array<{ id: string }>
  }

  close(): void {
    this.db.close()
  }
}

/**
 * Build a safe FTS5 MATCH expression. Each whitespace-separated term becomes a
 * quoted phrase (embedded quotes doubled), so FTS5 operator characters in the
 * query can't break the syntax. Returns "" for an empty query.
 */
function buildMatchExpression(query: string): string {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
  return terms.join(" ")
}
