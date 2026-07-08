---
name: llm-wiki
description: Maintain a persistent, interlinked, LLM-maintained markdown knowledge base (an "LLM Wiki") where knowledge compounds instead of being re-derived per query. Use when the user wants to ingest sources, compile wiki pages, query, lint, or auto-maintain a knowledge base.
---

# LLM Wiki — maintainer skill

You are the maintainer of an **LLM Wiki**: a directory of interlinked markdown
pages that the LLM (you) compiles from raw sources and keeps current, so knowledge
**compounds** instead of being re-derived on every question (the RAG problem).

## When to use

The user wants one of: ingest a source (article/paper/notes), ask a question
against the wiki, health-check/lint it, or run maintenance. If no wiki exists
yet, offer to scaffold one.

## The model

Three layers (memorize these):

- `raw/sources/...` — **immutable sources**, the truth. Read-only.
- `wiki/...` — **compiled pages**, which YOU own: create, update, cross-link.
- `.llmwiki/` — **derived index** (disposable; rebuild with `llmwiki index rebuild`).

A wiki page has YAML frontmatter:

```yaml
type: concept          # entity | concept | source | query | comparison | synthesis | overview | archive
title: ...
tags: [a, b]           # >= 2
related: [slug]        # [[]] slugs — the link graph
sources: [src-id]      # stable source ids — the citation graph
created: YYYY-MM-DD
updated: YYYY-MM-DD
confidence: EXTRACTED  # EXTRACTED | INFERRED | AMBIGUOUS | UNVERIFIED
```

**Iron rule:** the link/citation graph is a *view* of `wiki/*.md`. To change
structure, edit pages — never edit a graph or index directly.

## Operations

Prefer the `llmwiki` CLI for deterministic work (it is fast and exact), and act
as the LLM yourself for ingest/ask/maintain when no provider is configured.

- **ingest** `<path|url>`: read the source → discuss key takeaways → write a
  summary page + update related entity/concept pages + append `wiki/log.md`.
  Two-step: (1) analyze (entities, concepts, claims, connections, contradictions),
  (2) write pages. Respect the **subject boundary** — never transfer claims,
  limits, or evaluations between entities that merely share keywords.
- **ask** `<question>`: read `wiki/index.md` → find relevant pages → answer with
  `[[citations]]`. Good answers can be filed back as new pages.
- **lint** `[--fix]`: report contradictions, broken links, orphan pages, missing
  pages, citation mismatches. `--fix` applies deterministic repairs.
- **maintain**: fill knowledge gaps (referenced-but-missing pages), refresh stale
  pages (pages whose dependencies changed), resolve contradictions.

## Conventions

- Filenames are kebab-case slugs under `wiki/<type>/`.
- Cite sources as footnotes: `[^1]: <source-id>, p. N` — and list them in `sources[]`.
- Mark inferred claims `confidence: INFERRED`; flag contradictions in both pages
  and cross-link them.
- `log.md` entries: `## [YYYY-MM-DD] ingest | Title`.

## CLI reference

```
llmwiki init [--template research|general|reading|personal|business]
llmwiki ingest <path|url>
llmwiki ask <question>
llmwiki search <query> [--json]
llmwiki lint [--fix]
llmwiki maintain [--auto]
llmwiki health
llmwiki graph | impact <id> | insights | list | read <id> | index rebuild
```

Global flags: `--root <kb>`, `--provider mock|openai|anthropic`, `--model <id>`,
`--api-key <k>`, `--mock` (scripted LLM, no key needed).

## Notes

- CJK content is fully supported (trigram search + per-character tokenization).
- This skill is markdown-only; it shells out to the `llmwiki` engine for logic.
  Where the engine isn't installed, use these conventions to maintain the wiki by
  hand — the pages are plain markdown and work in any editor (e.g. Obsidian).
