# llmwiki-web — interface contract (M6, deferred)

> Status: **contract only.** The full web/graph UI is a separate, larger effort
> and is intentionally not built here. This document fixes the contract any future
> implementation must satisfy.

## Role

A thin client over `createWiki` (from `llmwiki-core`). The browser cannot import
the Node core directly, so a small **local transport** exposes the `Wiki` handle;
the UI is otherwise stateless and read-mostly.

## Transport (pick one at build time)

- **Local HTTP/SSE server** (recommended for M6): a tiny Node server (could live
  in `llmwiki serve` or a new `@llmwiki/server`) wrapping each `Wiki` method.
  Bind loopback only; protect with a local token (the reference projects do this).
- **Tauri shell**: embed core in a desktop webview. Heavier; defer unless desktop
  packaging is required.

## Surface (maps 1:1 to the `Wiki` API)

| UI action | Method |
| --- | --- |
| Open / scaffold a KB | `init()` |
| Browse pages | `listPages()`, `read(id)` |
| Search | `search(q)`, `retrieveContext(q)` (for an in-UI chat) |
| View structure | `getGraph()`, `insights()` |
| See what's connected | `impactSurface(id)` |
| Quality | `health()` |
| Edit a page | `write/edit/append/delete` (footnote-aware) |
| Hygiene | `lint({fix})` |
| Grow / refresh | `ingest`, `maintain` (need an LLM) |

## The governing constraint (do not violate)

**The graph is a view.** The UI **never** edits graph state directly. To change
structure, the user edits a page (`write`/`edit`); the UI re-fetches the derived
graph. Dragging a node rearranges the *picture*, not the wiki.

Two state buckets (from the reference ADRs):
- **KB content** (`wiki/*.md`, `purpose.md`) → authoritative, version-controlled.
- **Subjective organization** (node pin positions, collapsed communities, theme)
  → **local browser state** (e.g. localStorage), never written into the KB.

## Graph rendering

Force-directed (Sigma + graphology, or d3-force). Seed layout from the engine's
`Graph`; persist only pin positions locally. Communities come from
`insights().components` (or a later Louvain pass). Color edges by relation type;
stroke by confidence (ADR-23 of the reference).

## Suggested stack (when built)

React + Vite + a minimal server (Hono or plain `node:http`) over `createWiki`.
Keep the client dumb; all logic stays in core.

## Why deferred

M1–M5 deliver the engine, CLI, MCP server, and skill — the reusable, testable
core. The UI is the largest single piece and adds no engine capability; it is the
natural next milestone once the engine is exercised against real wikis.
