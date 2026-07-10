import { afterEach, describe, expect, it } from "vitest"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"
import { createWiki } from "llmwiki-core"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureSrc = path.join(here, "fixtures")

const tmpRoots: string[] = []
async function copyFixture(): Promise<string> {
  const dir = path.join(os.tmpdir(), `llmwiki-fix-${randomUUID()}`)
  await fs.cp(fixtureSrc, dir, { recursive: true })
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

describe("fixture wiki (deterministic pipeline, no LLM)", () => {
  it("loads all pages including the CJK page", async () => {
    const wiki = createWiki(await copyFixture())
    const ids = (await wiki.listPages()).map((p) => p.id)
    expect(ids).toContain("concepts/attention")
    expect(ids).toContain("concepts/transformers")
    expect(ids).toContain("entities/vaswani")
    expect(ids).toContain("concepts/attention-zh")
    expect(ids).toContain("concepts/orphan-concept")
    wiki.close()
  })

  it("flags the broken link and the orphan", async () => {
    const wiki = createWiki(await copyFixture())
    const issues = await wiki.lint()
    const rules = (pageId: string) => issues.filter((i) => i.pageId === pageId).map((i) => i.rule)
    expect(rules("entities/vaswani")).toContain("broken-wikilink") // [[concepts/ghost]]
    expect(rules("concepts/orphan-concept")).toContain("orphan")
    // the well-formed concept pages are clean
    expect(rules("concepts/attention")).toEqual([])
    wiki.close()
  })

  it("finds English and CJK pages via search", async () => {
    const wiki = createWiki(await copyFixture())
    const en = await wiki.search("attention")
    expect(en.map((h) => h.pageId)).toContain("concepts/attention")
    const zh = await wiki.search("注意力")
    expect(zh.map((h) => h.pageId)).toContain("concepts/attention-zh")
    wiki.close()
  })

  it("builds a graph with the expected structural edges", async () => {
    const wiki = createWiki(await copyFixture())
    const g = await wiki.getGraph()
    expect(g.edges.some((e) => e.source === "concepts/attention" && e.target === "concepts/transformers")).toBe(true)
    expect(g.nodes.get("concepts/attention")?.degree).toBeGreaterThan(0)
    wiki.close()
  })
})
