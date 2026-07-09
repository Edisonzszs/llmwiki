#!/usr/bin/env tsx
/**
 * `llmwiki-web` — local HTTP API + UI for an LLM Wiki.
 *
 * Thin loopback server over `createWiki`: serves the self-contained graph UI at
 * `/` and JSON endpoints under `/api/*`. Bind is 127.0.0.1 only (local-first).
 *
 *   tsx src/server.ts --root <kb> [--port 8765]
 *                     [--provider openai|anthropic --model <id> --api-key <k> --base-url <u>]
 *
 * Without a provider the deterministic endpoints (pages/graph/search/health/…)
 * all work; `ask` returns an error.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createLlmClient, createWiki, type LlmClient, type Wiki } from "@llmwiki/core"

const here = path.dirname(fileURLToPath(import.meta.url))

interface Opts {
  root: string
  port: number
  provider?: string
  model?: string
  apiKey?: string
  baseUrl?: string
}

function parseArgs(): Opts {
  const args = process.argv.slice(2)
  const get = (k: string): string | undefined => {
    const i = args.indexOf(`--${k}`)
    return i >= 0 ? args[i + 1] : undefined
  }
  return {
    root: get("root") ?? process.cwd(),
    port: Number(get("port") ?? 8765),
    provider: get("provider"),
    model: get("model"),
    apiKey: get("api-key") ?? process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY,
    baseUrl: get("base-url"),
  }
}

function buildLlm(o: Opts): LlmClient | undefined {
  if (o.provider === "mock") return createLlmClient({ provider: "mock", response: "ok" })
  if (
    o.provider &&
    o.apiKey &&
    o.model &&
    (o.provider === "openai" || o.provider === "anthropic")
  ) {
    return createLlmClient({
      provider: o.provider,
      apiKey: o.apiKey,
      model: o.model,
      ...(o.baseUrl ? { baseUrl: o.baseUrl } : {}),
    })
  }
  return undefined
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ""
    req.on("data", (c) => (data += c))
    req.on("end", () => resolve(data))
  })
}

function json(res: ServerResponse, code: number, obj: unknown): void {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" })
  res.end(JSON.stringify(obj))
}

async function main(): Promise<void> {
  const o = parseArgs()
  const wiki: Wiki = createWiki(o.root, { llm: buildLlm(o) })

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost")
      const p = url.pathname

      if (p === "/" || p === "/index.html") {
        const html = await readFile(path.join(here, "index.html"), "utf8")
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
            return json(res, 400, {
              error: "no LLM configured — start the server with --provider/--model/--api-key",
            })
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

  server.listen(o.port, "127.0.0.1", () => {
    console.log(
      `LLM Wiki UI → http://127.0.0.1:${o.port}  (root: ${o.root}${wiki.hasLlm ? "" : "  [ask disabled — no LLM]"})`,
    )
  })
}

main().catch((err: Error) => {
  console.error(err.message)
  process.exit(1)
})
