# llmwiki

> Compile knowledge once, maintain it continuously.

A portable, headless **LLM Wiki** CLI. An LLM incrementally builds and maintains
a persistent, interlinked markdown knowledge base from your sources — so
knowledge **compounds** instead of being re-derived on every query (RAG).

This is [Andrej Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
pattern, as a reusable engine. Bring your own key (any OpenAI-compatible endpoint
— OpenAI, DeepSeek, Ollama, OpenRouter — or Anthropic).

## Install

```bash
npm install -g llmwiki
```

## Quickstart

```bash
llmwiki init                              # scaffold a knowledge base
llmwiki ingest ./paper.md                 # two-step ingest → compiled, cross-linked pages
llmwiki ask "what are the main claims?"   # retrieval + synthesis, cited [[like-this]]
llmwiki lint --fix                        # deterministic hygiene (relocate/normalize/repair)
llmwiki maintain                          # fill knowledge gaps, refresh stale pages
llmwiki health                            # is the wiki compounding? (coverage/citations/freshness/…)
```

With a model provider:

```bash
llmwiki --provider openai --base-url https://api.deepseek.com/v1 \
        --model deepseek-chat --api-key $KEY ingest ./paper.md
```

The deterministic commands (`init`, `list`, `read`, `search`, `graph`, `lint`,
`health`, `insights`, `impact`, `index rebuild`) work with **no model at all**.
Use `--mock` to exercise the full ingest→ask loop with a scripted LLM (no key).

## What's special

- **Owned autonomy** — the engine plans + runs maintenance itself (no external
  scheduler); `--auto` gates on accumulated signal.
- **Quality evals** — `health` makes "is the wiki compounding?" measurable.
- **Hybrid retrieval by default** — BM25 + optional vectors (RRF) + graph
  expansion; CJK content is first-class.

## Related packages

- [`llmwiki-core`](https://www.npmjs.com/package/llmwiki-core) — the headless engine.
- [`llmwiki-mcp`](https://www.npmjs.com/package/llmwiki-mcp) — MCP server (drive from Claude Code / Codex).
- [`llmwiki-skill`](https://www.npmjs.com/package/llmwiki-skill) — portable Skill bundle.

Repo + architecture: see the [project README](https://github.com/Edisonzszs/llmwiki).

MIT.
