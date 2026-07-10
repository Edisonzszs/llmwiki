# llmwiki

> Compile knowledge once, maintain it continuously.

[![CI](https://github.com/Edisonzszs/llmwiki/actions/workflows/ci.yml/badge.svg)](https://github.com/Edisonzszs/llmwiki/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/llm-wiki-agent)](https://www.npmjs.com/package/llm-wiki-agent)
[![license](https://img.shields.io/badge/license-MIT-blue)](#license)

A portable, headless **LLM Wiki** engine. Instead of re-deriving knowledge from
raw documents on every query (RAG), an LLM incrementally builds and maintains a
persistent, interlinked markdown knowledge base — so knowledge **compounds**:
cross-references are already there, contradictions are already flagged, the
synthesis already reflects everything you've read.

This is [Andrej Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
pattern, built as a reusable engine — engine-first, model-agnostic, MIT.

```bash
npm install -g llm-wiki-agent
llmwiki init
llmwiki ingest ./paper.md            # two-step ingest → compiled, cross-linked pages
llmwiki ask "what are the main claims?"
llmwiki lint --fix                   # deterministic hygiene
llmwiki maintain                     # fill knowledge gaps, refresh stale pages
llmwiki health                       # is the wiki compounding?
```

Any OpenAI-compatible endpoint works (OpenAI, **DeepSeek**, Ollama, OpenRouter)
or Anthropic — bring your own key:

```bash
llmwiki --provider openai --base-url https://api.deepseek.com/v1 \
        --model deepseek-chat --api-key $KEY ingest ./paper.md
```

## What makes it different

Three things the reference projects don't have:

- **Owned autonomy** — the engine itself plans + runs maintenance (fill gaps,
  refresh stale pages) from its own signals (staleness, knowledge gaps, lint).
  No external scheduled routine required; `--auto` gates on accumulated signal.
- **Quality evals** — `health` turns "is my wiki compounding?" into a number
  (coverage / citation density / freshness / orphan-free / connectivity).
- **Hybrid retrieval by default** — BM25 + optional vectors (RRF) + 1-hop graph
  expansion, at all scales. CJK content is first-class (trigram index).

## Packages

| Package | What it is |
| --- | --- |
| [`llm-wiki-agent`](./packages/cli) | The `llmwiki` CLI. Install this. |
| [`llmwiki-core`](./packages/core) | The headless engine — deterministic pure functions + pluggable LLM ops. |
| [`llm-wiki-agent-mcp`](./packages/mcp) | MCP server — drive a wiki from Claude Code / Codex / any MCP client. |
| [`llmwiki-skill`](./packages/skill) | Portable Skill bundle (SKILL.md + templates). |
| [`llmwiki-web`](./apps/web) | Local web/graph UI (Canvas force-directed graph). |

## Design invariants

1. **The graph is a *view* of `wiki/*.md`, never the source of truth.** Change
   structure → edit a page; the graph regenerates.
2. **The deterministic core never imports an LLM client.** LLM ops take an
   injected `LlmClient`; a `MockLlm` makes the whole engine testable offline.
3. **The filesystem is truth; `.llmwiki/` is disposable.** Delete the index,
   rebuild — the wiki is fully recovered from `raw/` + `wiki/`.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full module map.

## Develop

```bash
git clone https://github.com/Edisonzszs/llmwiki.git && cd llmwiki
npm install
npm test          # builds (tsc -b) then runs vitest
npm run build     # compile all packages to dist/
```

Requires Node ≥ 20. The CLI/MCP bins run under plain `node` once built.

## Status

Early, actively developed. Core engine + CLI + MCP + skill + web UI all work and
are exercised against real models (DeepSeek, multi-source, CJK, autonomous
maintain). The web UI is a lean self-contained client; a richer React+sigma SPA
is a future option.

> **Note on the name:** `llmwiki` is the Karpathy-pattern name. The unrelated
> hosted product at `llmwiki.app` (Lucas Astorian) is a different project in a
> different namespace.

## License

MIT.
