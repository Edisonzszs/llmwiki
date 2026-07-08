# LLM Wiki

A portable, headless **LLM Wiki** engine — *compile knowledge once, maintain it continuously.*

Instead of re-deriving knowledge from raw documents on every query (RAG), an LLM
incrementally builds and maintains a persistent, interlinked markdown wiki. The
knowledge **compounds**: cross-references are already there, contradictions are
already flagged, the synthesis already reflects everything you've read.

This is the [Karpathy LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
pattern, implemented as a reusable engine.

## What's here

A TypeScript/Node monorepo:

| Package | What it is |
| --- | --- |
| `@llmwiki/core` | The headless engine — deterministic pure functions (parse / graph / retrieval / lint / staleness / health) plus pluggable LLM ops (two-step ingest, maintain). |
| `@llmwiki/cli` | Thin CLI front (`llmwiki`). |
| `@llmwiki/mcp` | Thin MCP server front (`llmwiki-mcp`) — drive the wiki from Claude Code / Codex / any MCP client. |
| `@llmwiki/skill` | Portable Skill bundle (SKILL.md + vendored core + templates). |

> Package name `@llmwiki/*` is a placeholder pending a final product name.

## Design invariants

1. **The graph is a *view* of wiki structure, never the source of truth.** To change
   structure, edit a `wiki/*.md` page; the graph regenerates.
2. **The deterministic core never imports an LLM client.** LLM ops take an injected
   `LlmClient`; prompt builders are pure functions.
3. **The filesystem is truth; the derived index is disposable.** Delete `.llmwiki/`
   and rebuild — everything is recovered from `raw/` + `wiki/`.

## Status

Under active construction — see the implementation plan. Milestone 1 (the core
ingest → query → lint loop) is in progress.

## License

MIT.
