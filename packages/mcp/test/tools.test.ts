import { afterEach, describe, expect, it } from "vitest"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { createWiki, type Wiki } from "llmwiki-core"
import { handleToolCall, TOOL_LIST } from "llm-wiki-agent-mcp"

const tmpRoots: string[] = []
async function freshKb(): Promise<string> {
  const dir = path.join(os.tmpdir(), `llmwiki-mcp-${randomUUID()}`)
  await fs.mkdir(dir, { recursive: true })
  tmpRoots.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map(async (d) => {
      for (let i = 0; i < 6; i++) {
        try {
          await fs.rm(d, { recursive: true, force: true })
          return
        } catch {
          await new Promise((r) => setTimeout(r, 60))
        }
      }
    }),
  )
})

const json = (r: { content: { text: string }[]; isError?: boolean }): unknown => {
  if (r.isError) throw new Error("tool error: " + r.content[0]!.text)
  return JSON.parse(r.content[0]!.text)
}

describe("MCP tool handler (deterministic tools, no LLM)", () => {
  let wiki: Wiki
  let root: string

  it("exposes a full tool table", () => {
    const names = TOOL_LIST.map((t) => t.name)
    expect(names).toContain("init_kb")
    expect(names).toContain("ingest")
    expect(names).toContain("maintain")
  })

  it("init_kb scaffolds the KB", async () => {
    root = await freshKb()
    wiki = createWiki(root)
    const r = await handleToolCall(wiki, "init_kb", {})
    expect(r.isError).toBeFalsy()
    await fs.access(path.join(root, "wiki", "purpose.md"))
  })

  it("list_pages / read / search / graph / health / insights / impact / retrieve_context work", async () => {
    await fs.mkdir(path.join(root, "wiki", "concepts"), { recursive: true })
    await fs.writeFile(
      path.join(root, "wiki", "concepts", "attention.md"),
      "---\ntype: concept\ntitle: Attention\ntags: [a, b]\n---\nAttention is all you need.\n",
      "utf8",
    )
    expect(json(await handleToolCall(wiki, "list_pages", {}))).toContainEqual(
      expect.objectContaining({ id: "concepts/attention" }),
    )
    const read = json(await handleToolCall(wiki, "read", { id: "concepts/attention" })) as { body: string }
    expect(read.body).toContain("Attention is all you need")
    const search = json(await handleToolCall(wiki, "search", { query: "attention" })) as Array<{ pageId: string }>
    expect(search.map((h) => h.pageId)).toContain("concepts/attention")
    expect(json(await handleToolCall(wiki, "graph", {}))).toMatchObject({ nodes: expect.any(Number) })
    expect(json(await handleToolCall(wiki, "health", {}))).toMatchObject({
      scorecard: { composite: expect.any(Number) },
    })
    expect(json(await handleToolCall(wiki, "insights", {}))).toMatchObject({ gaps: expect.any(Array) })
    expect(json(await handleToolCall(wiki, "impact_surface", { pageId: "concepts/attention" })).toString()).toBeDefined()
    const ctx = await handleToolCall(wiki, "retrieve_context", { query: "attention" })
    expect(typeof ctx.content[0]!.text).toBe("string")
  })

  it("guide returns the maintainer guide text", async () => {
    const r = await handleToolCall(wiki, "guide", {})
    expect(r.content[0]!.text).toContain("LLM Wiki maintainer guide")
  })

  it("ingest without a server-side LLM returns an error result", async () => {
    const r = await handleToolCall(wiki, "ingest", { sourcePath: "raw/sources/x.md" })
    expect(r.isError).toBe(true)
  })

  it("unknown tool returns an error result", async () => {
    const r = await handleToolCall(wiki, "bogus", {})
    expect(r.isError).toBe(true)
  })
})
