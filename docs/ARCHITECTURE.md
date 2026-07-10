# Architecture

A portable, headless **LLM Wiki** engine: an LLM compiles and maintains a
persistent, interlinked markdown knowledge base so knowledge compounds instead of
being re-derived per query (RAG).

## Monorepo

| Package | Role |
| --- | --- |
| `llmwiki-core` | The engine — all real logic. Pure deterministic core + injected-LLM ops. |
| `llm-wiki-agent` | Thin `llmwiki` CLI front. |
| `llm-wiki-agent-mcp` | MCP stdio server — drive the wiki from any MCP client. |
| `llmwiki-skill` | Portable Skill bundle (SKILL.md + templates) for agent hosts. |
| `apps/web` | (M6, deferred) web/graph UI. |

## Three load-bearing invariants

1. **The graph is a *view* of `wiki/*.md`, never the source of truth.** It is
   rebuilt on demand; nobody edits it directly. Change structure → edit pages.
2. **The deterministic core never imports an LLM client.** LLM ops
   (`ingest-runner`, `runMaintenance`, `semantic-lint`) take an injected
   `LlmClient`; a canned `MockLlm` makes everything testable offline.
3. **The filesystem is truth; `.llmwiki/` is disposable.** Delete the index,
   rebuild — the wiki is fully recovered from `raw/` + `wiki/`.

## Core module map (`packages/core/src/`)

| Module | Responsibility |
| --- | --- |
| `frontmatter` | Repairing YAML parser (recovers LLM-corrupted blocks). |
| `source-identity` | Stable source IDs (FNV-1a) decoupled from filenames. |
| `context-budget` | Pure context-window budget allocator. |
| `tokenizer` | CJK-aware tokenizer (ASCII words + per-char CJK). |
| `graph` | Two-pass link/cite graph builder (a derived view). |
| `graph-insights` | Knowledge gaps, hubs, connected components. |
| `store` | SQLite + FTS5 (trigram) derived index; BM25 search; staleness. |
| `retrieval` | Hybrid retrieval: BM25 (+optional vector RRF) + graph expansion. |
| `vectors` | Pluggable `VectorIndex`, in-memory cosine, reciprocal rank fusion. |
| `lint` | Two-tier lint (mechanical auto-fix vs judgment report) + citation check. |
| `staleness` | Impact surface (backlinks that go stale when a page changes). |
| `ingest` / `ingest-parser` / `ingest-runner` | Two-step CoT ingest + FILE/REVIEW parsing. |
| `maintain` | Owned maintenance loop: plan (pure) + propose/refresh prompts. |
| `eval` | Health scorecard (coverage/citations/freshness/orphans/connectivity). |
| `llm-client` | BYOK: Mock + OpenAI-compatible + Anthropic. |
| `wiki` | `createWiki` handle — the composition root tying it together. |

## The three differentiators (vs reference projects)

- **A. Owned autonomy** — the engine plans + runs maintenance itself
  (`maintain`), gated by accumulated signal (`--auto`), no daemon.
- **B. Quality evals** — `health` makes "is the wiki compounding?" measurable.
- **C. Hybrid retrieval by default** — BM25 + optional vectors + graph expansion.

## Data layout

```
<kb-root>/
  raw/sources/<topic>/...      immutable sources (truth)
  wiki/<type>/<slug>.md        compiled pages (engine-owned)
    purpose.md overview.md index.md log.md
  .llmwiki/                    derived, disposable (index.db, state.json)
```
