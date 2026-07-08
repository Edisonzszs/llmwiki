import type { Wiki } from "@llmwiki/core"

/**
 * MCP tool definitions + a transport-agnostic handler. `handleToolCall` is pure
 * with respect to MCP (it just calls the engine), so it's unit-testable without
 * a live stdio connection. {@link server.ts} is the thin stdio wrapper.
 *
 * The first group of tools is fully functional with NO model — an external agent
 * (Claude Code) can drive a deterministic wiki on its own. `ingest` / `ask` /
 * `maintain` require a server-side LLM; without one they return a clear error so
 * the agent can fall back (e.g. to the CLI's own BYOK).
 */

export interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpContent {
  type: "text"
  text: string
}
export interface ToolResult {
  content: McpContent[]
  isError?: boolean
}

const obj = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
})

export const TOOL_LIST: ToolDef[] = [
  { name: "init_kb", description: "Scaffold a fresh LLM Wiki KB at the configured root.", inputSchema: obj({}) },
  {
    name: "guide",
    description: "Return the maintainer's guide: how the wiki is structured and the ingest/query/lint workflow.",
    inputSchema: obj({}),
  },
  {
    name: "list_pages",
    description: "List wiki pages (optional filter by type or path prefix).",
    inputSchema: obj({ type: { type: "string" }, path: { type: "string" } }),
  },
  { name: "read", description: "Read a wiki page by id.", inputSchema: obj({ id: { type: "string" } }, ["id"]) },
  {
    name: "search",
    description: "Hybrid BM25 + graph search over the wiki.",
    inputSchema: obj({ query: { type: "string" }, limit: { type: "number" } }, ["query"]),
  },
  {
    name: "retrieve_context",
    description: "Return a packed context block for a query (for hidden context injection).",
    inputSchema: obj({ query: { type: "string" } }, ["query"]),
  },
  { name: "graph", description: "Return the derived graph summary (node/edge counts).", inputSchema: obj({}) },
  { name: "lint", description: "Two-tier lint report; with fix=true applies Tier-1 auto-fixes.", inputSchema: obj({ fix: { type: "boolean" } }) },
  { name: "health", description: "Quality health scorecard + trend.", inputSchema: obj({}) },
  {
    name: "impact_surface",
    description: "Pages that reference a given page (would go stale if it changed).",
    inputSchema: obj({ pageId: { type: "string" } }, ["pageId"]),
  },
  { name: "insights", description: "Structural insights: knowledge gaps, hubs, connected components.", inputSchema: obj({}) },
  {
    name: "ingest",
    description: "Two-step CoT ingest of a source file (requires a server-side LLM).",
    inputSchema: obj({ sourcePath: { type: "string" } }, ["sourcePath"]),
  },
  {
    name: "ask",
    description: "Answer a question against the wiki (requires a server-side LLM).",
    inputSchema: obj({ question: { type: "string" } }, ["question"]),
  },
  {
    name: "maintain",
    description: "Run the owned maintenance loop: fill gaps, refresh stale pages (requires a server-side LLM).",
    inputSchema: obj({ auto: { type: "boolean" } }),
  },
]

const GUIDE_TEXT = `LLM Wiki maintainer guide.
Three layers: raw/sources/ (immutable truth), wiki/ (compiled pages the engine owns), .llmwiki/ (derived, disposable index).
Operations: ingest a source -> compiled, cross-linked pages; ask (retrieval + synthesis); lint (two-tier: mechanical auto-fix vs judgment report); maintain (fill knowledge gaps, refresh stale pages).
Every page carries frontmatter: type, title, tags (>=2), related ([[]] slugs), sources (stable ids), created, updated, confidence (EXTRACTED|INFERRED|AMBIGUOUS|UNVERIFIED).
The graph is a VIEW of wiki/*.md — to change structure, edit pages; never edit the graph directly.`

export async function handleToolCall(wiki: Wiki, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const a = args ?? {}
  const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] })
  const err = (msg: string): ToolResult => ({ isError: true, content: [{ type: "text", text: msg }] })

  try {
    switch (name) {
      case "init_kb":
        await wiki.init()
        return ok("initialized")
      case "guide":
        return ok(GUIDE_TEXT)
      case "list_pages": {
        let pages = await wiki.listPages()
        if (typeof a.type === "string") pages = pages.filter((p) => p.type === a.type)
        if (typeof a.path === "string") pages = pages.filter((p) => p.id.startsWith(String(a.path)))
        return ok(JSON.stringify(pages))
      }
      case "read": {
        const id = String(a.id ?? "")
        const page = await wiki.read(id)
        return ok(page ? JSON.stringify({ id: page.id, fm: page.fm, body: page.body }) : `(not found: ${id})`)
      }
      case "search":
        return ok(JSON.stringify(await wiki.search(String(a.query ?? ""), { limit: a.limit ? Number(a.limit) : undefined })))
      case "retrieve_context":
        return ok((await wiki.retrieveContext(String(a.query ?? ""))).contextBlock)
      case "graph": {
        const g = await wiki.getGraph()
        return ok(JSON.stringify({ nodes: g.nodes.size, edges: g.edges.length, dataVersion: g.dataVersion }))
      }
      case "lint":
        return ok(JSON.stringify(await wiki.lint({ fix: a.fix === true })))
      case "health":
        return ok(JSON.stringify(await wiki.health()))
      case "impact_surface":
        return ok(JSON.stringify(await wiki.impactSurface(String(a.pageId ?? ""))))
      case "insights":
        return ok(JSON.stringify(await wiki.insights()))
      case "ingest": {
        if (!wiki.hasLlm) return err("ingest requires a server-side LLM; configure one or use the CLI with --provider.")
        return ok(JSON.stringify(await wiki.ingest({ sourcePath: String(a.sourcePath ?? "") })))
      }
      case "ask": {
        if (!wiki.hasLlm) return err("ask requires a server-side LLM; configure one or use the CLI with --provider.")
        return ok(await wiki.ask(String(a.question ?? "")))
      }
      case "maintain": {
        if (!wiki.hasLlm) return err("maintain requires a server-side LLM; configure one or use the CLI with --provider.")
        return ok(JSON.stringify(await wiki.maintain({ auto: a.auto === true })))
      }
      default:
        return err(`unknown tool: ${name}`)
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e))
  }
}
