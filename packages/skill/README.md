# llmwiki-skill

A portable **Skill** bundle for the LLM Wiki engine. Install it into any agent
that supports the Skill standard (Claude Code, Codex CLI, OpenCode, Hermes) and
that agent becomes a disciplined wiki maintainer.

## Contents

- `SKILL.md` — the maintainer guide + workflow (what the agent reads).
- `templates/` — page-type templates (concept, entity, source, comparison,
  purpose, index, log).
- `platforms/` — per-agent install notes.

The skill is markdown-only. It shells out to the `llmwiki` engine for deterministic
ops and acts as the LLM for ingest/ask/maintain. Where the engine isn't installed,
the templates + `SKILL.md` still let a human maintain a wiki by hand in any editor.

## Internationalization

The guide (`SKILL.md`) is authored in English. **Content** in any language is
fully supported — the engine uses a CJK-aware tokenizer and a trigram full-text
index, so Chinese/Japanese/Korean pages index and retrieve as well as English.

To localize the guide itself, translate `SKILL.md` and place it under
`locales/<lang>/SKILL.md`; the engine loads the matching locale when one is
present (hook reserved for M5+; English is the default).

## Install

See [`platforms/README.md`](./platforms/README.md).
