import { describe, expect, it } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const pkg = path.join(here, "..")

const exists = (rel: string): Promise<boolean> =>
  fs.stat(path.join(pkg, rel)).then(
    () => true,
    () => false,
  )

describe("llmwiki-skill bundle", () => {
  it("ships a SKILL.md with the Skill frontmatter and the maintainer guide", async () => {
    const skill = (await fs.readFile(path.join(pkg, "SKILL.md"), "utf8")).replace(/\r\n/g, "\n")
    expect(skill.startsWith("---\n")).toBe(true)
    expect(skill).toContain("name: llm-wiki")
    expect(skill).toContain("description:")
    expect(skill.toLowerCase()).toContain("subject boundary")
  })

  it("ships the core page-type templates", async () => {
    for (const t of ["concept", "entity", "source", "comparison", "purpose", "index", "log"]) {
      expect(await exists(`templates/${t}.md`)).toBe(true)
    }
  })

  it("ships platform install notes", async () => {
    expect(await exists("platforms/README.md")).toBe(true)
    expect(await exists("README.md")).toBe(true)
  })
})
