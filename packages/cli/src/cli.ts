#!/usr/bin/env node
import { parseArgs } from "node:util"
import { createWiki, createLlmClient, MockLlm, type LlmClient } from "llmwiki-core"

/**
 * `llmwiki` — thin CLI front for the headless LLM Wiki engine.
 *
 * Commands: init | ingest <path> | ask <q> | search <q> | lint [--fix] | list |
 *           read <id> | graph | index rebuild
 * Global:   --root <dir>   --provider mock|openai|anthropic   --model <id>
 *           --api-key <k>  --base-url <u>                     --mock
 *           --json
 *
 * `--mock` uses a scripted MockLlm so the full ingest→ask loop runs with no API
 * key — handy for demos, tests, and the M1 end-to-end smoke.
 */

function mockLlm(): LlmClient {
  // Canned two-step ingest (analysis then one FILE block), plus a generic answer.
  return new MockLlm((msgs) => {
    const last = msgs.at(-1)?.content ?? ""
    if (last.includes("produce a structured analysis")) {
      return "Key concept: attention. Connections: relates to transformers."
    }
    if (last.includes("write the wiki pages")) {
      return [
        "---FILE: wiki/concepts/attention.md---",
        "---",
        "type: concept",
        "title: Attention",
        "tags: [transformers, attention]",
        'related: ["transformers"]',
        "sources: []",
        "created: 2026-01-01",
        "updated: 2026-01-01",
        "confidence: EXTRACTED",
        "---",
        "",
        "Attention mechanisms let models focus on relevant input. See [[Transformers]].",
        "---END FILE---",
      ].join("\n")
    }
    return "Based on the wiki: attention lets a model focus on the relevant parts of the input [[concepts/attention]]."
  })
}

function buildLlm(flags: Record<string, boolean | string>): LlmClient | undefined {
  if (flags.mock) return mockLlm()
  const provider = String(flags.provider ?? "")
  const apiKey = String(flags["api-key"] ?? process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "")
  const model = String(flags.model ?? "")
  if (!provider || !apiKey || !model) return undefined
  return createLlmClient({
    provider: provider as "openai" | "anthropic",
    apiKey,
    ...(flags["base-url"] ? { baseUrl: String(flags["base-url"]) } : {}),
    model,
  })
}

async function main(): Promise<void> {
  const { positionals, values: flags } = parseArgs({
    allowPositionals: true,
    tokens: false,
    options: {
      root: { type: "string", default: process.cwd() },
      provider: { type: "string" },
      model: { type: "string" },
      "api-key": { type: "string" },
      "base-url": { type: "string" },
      mock: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      fix: { type: "boolean", default: false },
      auto: { type: "boolean", default: false },
      limit: { type: "string", default: "10" },
    },
  })

  const command = positionals[0]
  const root = String(flags.root)
  const llm = buildLlm(flags)
  const wiki = createWiki(root, { llm })

  try {
    switch (command) {
      case "init":
        await wiki.init()
        console.log(`Initialized LLM Wiki at ${root}`)
        break
      case "ingest": {
        const target = positionals[1]
        if (!target) throw new Error("usage: llmwiki ingest <path|url>")
        const r = await wiki.ingest({ sourcePath: target })
        console.log(`Ingested ${target} → ${r.files.length} page(s), ${r.reviews} review(s)`)
        for (const f of r.files) console.log(`  - ${f}`)
        break
      }
      case "ask": {
        const q = positionals.slice(1).join(" ")
        if (!q) throw new Error("usage: llmwiki ask <question>")
        console.log(await wiki.ask(q))
        break
      }
      case "search": {
        const q = positionals.slice(1).join(" ")
        const hits = await wiki.search(q, { limit: Number(flags.limit) })
        if (flags.json) console.log(JSON.stringify(hits))
        else for (const h of hits) console.log(`${h.pageId}${h.title ? `  — ${h.title}` : ""}`)
        break
      }
      case "lint": {
        const issues = await wiki.lint({ fix: Boolean(flags.fix) })
        if (flags.json) console.log(JSON.stringify(issues))
        else if (!issues.length) console.log("No issues found.")
        else for (const i of issues) console.log(`[${i.severity}] ${i.pageId}: ${i.rule} — ${i.message}`)
        break
      }
      case "list": {
        const pages = await wiki.listPages()
        if (flags.json) console.log(JSON.stringify(pages))
        else for (const p of pages) console.log(`${p.id}${p.title ? `  — ${p.title}` : ""}`)
        break
      }
      case "read": {
        const id = positionals[1]
        const page = await wiki.read(id)
        console.log(page ? page.raw : `(not found: ${id})`)
        break
      }
      case "graph": {
        const g = await wiki.getGraph()
        console.log(JSON.stringify({ nodes: g.nodes.size, edges: g.edges.length, dataVersion: g.dataVersion }))
        break
      }
      case "impact": {
        const id = positionals[1]
        if (!id) throw new Error("usage: llmwiki impact <page>")
        const surface = await wiki.impactSurface(id)
        if (flags.json) console.log(JSON.stringify(surface))
        else if (!surface.length) console.log(`No pages reference ${id}.`)
        else {
          console.log(`${surface.length} page(s) reference ${id} (would go stale if it changes):`)
          for (const s of surface) console.log(`  - ${s}`)
        }
        break
      }
      case "insights": {
        const r = await wiki.insights()
        console.log(JSON.stringify(r))
        break
      }
      case "health": {
        const { scorecard, trend } = await wiki.health()
        if (flags.json) {
          console.log(JSON.stringify({ ...scorecard, ...(trend !== undefined ? { trend } : {}) }))
        } else {
          const pct = (x: number) => `${(x * 100).toFixed(0)}%`
          console.log(`composite      ${pct(scorecard.composite)}${trend !== undefined ? `  (trend ${trend >= 0 ? "+" : ""}${trend.toFixed(2)})` : ""}`)
          console.log(`coverage       ${pct(scorecard.coverage)}`)
          console.log(`citations      ${pct(scorecard.citationDensity)}`)
          console.log(`freshness      ${pct(scorecard.freshness)}`)
          console.log(`orphan-free    ${pct(scorecard.orphanRate)}`)
          console.log(`connectivity   ${pct(scorecard.connectivity)}`)
        }
        break
      }
      case "maintain": {
        const r = await wiki.maintain({ auto: Boolean(flags.auto) })
        if (flags.json) console.log(JSON.stringify(r))
        else if (!r.ran) console.log(`maintain skipped: ${r.reason}`)
        else {
          const c = r.plan.counts
          console.log(
            `maintain ran: ${r.written ?? 0} page(s) written, ${r.staleCleared ?? 0} stale cleared ` +
              `(plan: ${c.resynthesize} resynthesize, ${c.propose} propose, ${c.review} review)`,
          )
        }
        break
      }
      case "index": {
        if (positionals[1] === "rebuild") {
          await wiki.reindex()
          console.log("Index rebuilt.")
        } else throw new Error("usage: llmwiki index rebuild")
        break
      }
      default:
        throw new Error(
          "commands: init | ingest <path> | ask <q> | search <q> | lint [--fix] | list | read <id> | graph | impact <id> | insights | index rebuild",
        )
    }
  } finally {
    wiki.close()
  }
}

main().catch((err: Error) => {
  console.error(`error: ${err.message}`)
  process.exit(1)
})
