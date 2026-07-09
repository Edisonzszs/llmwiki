import { extractWikilinks, normalizeLinkTarget } from "./graph.js"
import { sourceReferenceIdentity } from "./source-identity.js"
import type { Graph, Page, SourceRef } from "./types.js"

/**
 * Two-tier linter.
 *
 * Tier 1 (mechanical, deterministic) is computed here over parsed pages + the
 * derived graph: missing frontmatter/title, too-few-tags, broken/normalizable
 * wikilinks, dangling sources, orphans. Normalizable links carry an autoFixable
 * `rewrite-wikilink` patch that {@link applyLintFixes} applies deterministically.
 *
 * Tier 2 (semantic judgments — contradictions, stale claims, suggestions) is
 * LLM-driven and added later via a `semantic-lint` module.
 */

export type LintSeverity = "error" | "warn" | "info"

export interface LintFix {
  kind: "rewrite-wikilink"
  oldTarget: string
  newTarget: string
}

export interface LintIssue {
  pageId: string
  severity: LintSeverity
  rule: string
  message: string
  autoFixable: boolean
  fix?: LintFix
}

const SPECIAL_PAGE_IDS = new Set(["overview", "index", "log", "purpose"])
const MIN_TAGS = 2
const FOOTNOTE_DEF_RE = /^\[\^[^\]\s]+\]:\s*(.+?)\s*$/gm

/** Extract source references from footnote definitions (`[^id]: <ref>, p. N`). */
export function extractFootnoteCitations(body: string): string[] {
  const out: string[] = []
  FOOTNOTE_DEF_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = FOOTNOTE_DEF_RE.exec(body)) !== null) {
    const ref = (m[1] as string)
      .split(/,\s*/)[0]!
      .replace(/^\[\[|\]\]$/g, "")
      .replace(/^["']|["']$/g, "")
      .trim()
    if (ref) out.push(ref)
  }
  return out
}

function normalizeId(id: string): string {
  return id.toLowerCase().replace(/^wiki\//, "").replace(/\.md$/i, "")
}

function basename(p: string): string {
  const i = p.lastIndexOf("/")
  return i >= 0 ? p.slice(i + 1) : p
}

export function lintPages(pages: Page[], sources: SourceRef[], graph: Graph): LintIssue[] {
  const issues: LintIssue[] = []
  const knownPageIds = new Set(pages.map((p) => p.id))
  // normalized id -> canonical page id (first wins)
  const normalizedIndex = new Map<string, string>()
  for (const p of pages) {
    const n = normalizeId(p.id)
    if (!normalizedIndex.has(n)) normalizedIndex.set(n, p.id)
  }
  const sourceIds = new Set(sources.map((s) => s.id))
  const sourceBasenames = new Set(sources.map((s) => basename(s.id)))

  for (const p of pages) {
    if (!p.fm) {
      // Structural hub/ledger pages (purpose/index/log/overview) are authored
      // without content-page frontmatter; don't nag them for it.
      if (!SPECIAL_PAGE_IDS.has(p.id)) {
        issues.push({
          pageId: p.id,
          severity: "error",
          rule: "missing-frontmatter",
          message: `Page '${p.id}' has no frontmatter.`,
          autoFixable: false,
        })
      }
      continue
    }

    if (!p.fm.title?.trim()) {
      issues.push({
        pageId: p.id,
        severity: "error",
        rule: "missing-title",
        message: `Page '${p.id}' is missing a title.`,
        autoFixable: false,
      })
    }

    if ((p.fm.tags?.length ?? 0) < MIN_TAGS) {
      issues.push({
        pageId: p.id,
        severity: "warn",
        rule: "too-few-tags",
        message: `Page '${p.id}' has fewer than ${MIN_TAGS} tags.`,
        autoFixable: false,
      })
    }

    // Body wikilinks: known, normalizable (autoFixable), or broken.
    for (const target of extractWikilinks(p.body)) {
      if (knownPageIds.has(target)) continue
      const canonical = normalizedIndex.get(normalizeId(target))
      if (canonical && canonical !== target) {
        issues.push({
          pageId: p.id,
          severity: "warn",
          rule: "link-normalizable",
          message: `Link '[[${target}]]' should be '[[${canonical}]]'.`,
          autoFixable: true,
          fix: { kind: "rewrite-wikilink", oldTarget: target, newTarget: canonical },
        })
      } else {
        issues.push({
          pageId: p.id,
          severity: "warn",
          rule: "broken-wikilink",
          message: `Link '[[${target}]]' points to no page.`,
          autoFixable: false,
        })
      }
    }

    // related[] links: broken detection only (auto-fix of frontmatter lists is later).
    for (const target of p.fm.related ?? []) {
      const normalized = normalizeLinkTarget(target)
      if (!knownPageIds.has(normalized)) {
        issues.push({
          pageId: p.id,
          severity: "warn",
          rule: "broken-wikilink",
          message: `Related link '${target}' points to no page.`,
          autoFixable: false,
        })
      }
    }

    for (const s of p.fm.sources ?? []) {
      const present =
        sourceIds.has(s) || sourceIds.has(sourceReferenceIdentity(s)) || sourceBasenames.has(basename(s))
      if (!present) {
        issues.push({
          pageId: p.id,
          severity: "warn",
          rule: "dangling-source",
          message: `Source '${s}' is not present in raw/sources.`,
          autoFixable: false,
        })
      }
    }

    // Footnote citations must be materialized as a `cites` edge, i.e. listed in
    // sources[]. A footnote whose target isn't in sources[] is a text/graph mismatch.
    const declaredSources = new Set((p.fm.sources ?? []).map((s) => sourceReferenceIdentity(s)))
    for (const citation of extractFootnoteCitations(p.body)) {
      if (!declaredSources.has(sourceReferenceIdentity(citation))) {
        issues.push({
          pageId: p.id,
          severity: "warn",
          rule: "citation-graph-mismatch",
          message: `Footnote cites '${citation}' but it is not in sources[] (no cites edge).`,
          autoFixable: false,
        })
      }
    }
  }

  // Orphans: real pages with no connections (degree 0), excluding hub/ledger pages.
  for (const p of pages) {
    if (SPECIAL_PAGE_IDS.has(p.id) || p.fm?.type === "overview") continue
    const node = graph.nodes.get(p.id)
    if (node && node.degree === 0) {
      issues.push({
        pageId: p.id,
        severity: "warn",
        rule: "orphan",
        message: `Page '${p.id}' has no connections to other pages.`,
        autoFixable: false,
      })
    }
  }

  return issues
}

/** Apply Tier-1 auto-fixable patches (currently: rewrite normalizable wikilinks). */
export function applyLintFixes(pages: Page[], issues: LintIssue[]): Page[] {
  return pages.map((p) => {
    const fixes = issues.filter(
      (i) => i.pageId === p.id && i.autoFixable && i.fix?.kind === "rewrite-wikilink",
    )
    if (!fixes.length) return p
    const rewrite = (text: string): string =>
      text.replace(/\[\[([^\]\|]+)(\|[^\]]*)?\]\]/g, (match, target: string, alias?: string) => {
        const f = fixes.find(
          (x) => x.fix?.kind === "rewrite-wikilink" && x.fix.oldTarget === target,
        )
        return f ? `[[${(f.fix as LintFix).newTarget}${alias ?? ""}]]` : match
      })
    return { ...p, body: rewrite(p.body), raw: rewrite(p.raw) }
  })
}
