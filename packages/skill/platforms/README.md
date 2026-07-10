# Installing the LLM Wiki skill

This package is a portable **Skill** (markdown + templates). It shells out to the
`llmwiki` engine for logic, so install the engine first:

```bash
npm install -g llm-wiki-agent   # (or use via npx)
```

Then register the skill with your agent.

## Claude Code

Copy (or symlink) this folder into your Claude Code skills directory:

```bash
cp -r . ~/.claude/skills/llm-wiki
```

Restart Claude Code; the skill activates when you ask to build or maintain a
knowledge base.

## Codex CLI / OpenCode / Hermes

These support the same Skill standard — place the folder wherever the agent loads
skills from and point its config at it.

## Without the engine

The skill is still usable as a conventions guide: the templates and `SKILL.md`
describe how to maintain an LLM Wiki by hand in any markdown editor (Obsidian,
VS Code). The pages are plain markdown.
