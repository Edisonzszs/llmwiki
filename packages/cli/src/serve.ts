/**
 * `llmwiki serve` — local HTTP API + graph UI for a wiki.
 *
 * Thin loopback server over a `Wiki` handle: serves the self-contained graph UI
 * at `/` and JSON endpoints under `/api/*`. Bind is 127.0.0.1 only (local-first).
 * The UI is the bundled `web/index.html` shipped next to `dist/`.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Wiki } from "llmwiki-core"

const here = path.dirname(fileURLToPath(import.meta.url))
const indexHtmlPath = path.join(here, "..", "web", "index.html")

function json(res: ServerResponse, code: number, obj: unknown): void {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" })
  res.end(JSON.stringify(obj))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ""
    req.on("data", (c) => (data += c))
    req.on("end", () => resolve(data))
  })
}

export function serveWiki(wiki: Wiki, root: string, port: number): void {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost")
      const p = url.pathname

      if (p === "/" || p === "/index.html") {
        const html = await readFile(indexHtmlPath, "utf8")
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
        return res.end(html)
      }

      switch (p) {
        case "/api/pages":
          return json(res, 200, await wiki.listPages())
        case "/api/graph": {
          const g = await wiki.getGraph()
          return json(res, 200, {
            nodes: [...g.nodes.values()].map((n) => ({
              id: n.id,
              label: n.label,
              type: n.type,
              degree: n.degree,
            })),
            edges: g.edges.map((e) => ({
              source: e.source,
              target: e.target,
              relation: e.relation,
            })),
          })
        }
        case "/api/page":
          return json(res, 200, (await wiki.read(url.searchParams.get("id") ?? "")) ?? null)
        case "/api/insights":
          return json(res, 200, await wiki.insights())
        case "/api/health":
          return json(res, 200, await wiki.health())
        case "/api/search":
          return json(res, 200, await wiki.search(url.searchParams.get("q") ?? ""))
        case "/api/lint":
          return json(res, 200, await wiki.lint())
        case "/api/ask": {
          if (req.method !== "POST") return json(res, 405, { error: "POST required" })
          const body = JSON.parse((await readBody(req)) || "{}") as { question?: string }
          if (!wiki.hasLlm) {
            return json(res, 400, { error: "no LLM configured — start with --provider/--model/--api-key" })
          }
          return json(res, 200, { answer: await wiki.ask(body.question ?? "") })
        }
        default:
          res.writeHead(404)
          return res.end("not found")
      }
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) })
    }
  })

  server.listen(port, "127.0.0.1", () => {
    console.log(
      `LLM Wiki UI → http://127.0.0.1:${port}  (root: ${root}${wiki.hasLlm ? "" : "  [ask disabled — no LLM]"})`,
    )
  })
}
