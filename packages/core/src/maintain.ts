import type { LintIssue } from "./lint.js"
import type { KnowledgeGap } from "./graph-insights.js"

/**
 * Owned autonomy/maintenance loop (differentiator A). Unlike the reference
 * projects (which outsource maintenance to an external scheduled routine), the
 * engine itself plans and runs maintenance from its own signals: staleness,
 * knowledge gaps, and open lint issues.
 *
 * `planMaintenance` is pure (signal -> prioritized task list). The execution
 * (`Wiki.maintain`) uses an injected LLM to fill gaps and refresh stale pages.
 */

export interface MaintenanceTask {
  kind: "resynthesize" | "propose" | "review"
  pageId?: string
  target?: string
  detail: string
}

export interface MaintenancePlan {
  tasks: MaintenanceTask[]
  counts: { resynthesize: number; propose: number; review: number }
}

export function planMaintenance(input: {
  stalePageIds: string[]
  gaps: KnowledgeGap[]
  lintIssues: LintIssue[]
  maxPropose?: number
}): MaintenancePlan {
  const maxPropose = input.maxPropose ?? 5
  const tasks: MaintenanceTask[] = []

  for (const id of input.stalePageIds) {
    tasks.push({ kind: "resynthesize", pageId: id, detail: `Re-synthesize stale page '${id}' from its sources.` })
  }
  for (const gap of input.gaps.slice(0, maxPropose)) {
    tasks.push({
      kind: "propose",
      target: gap.target,
      detail: `Create a page for '${gap.target}', referenced by ${gap.referencedBy.join(", ")}.`,
    })
  }
  for (const issue of input.lintIssues) {
    if (issue.autoFixable) continue // those are fixed by `lint --fix`, not maintenance
    tasks.push({
      kind: "review",
      pageId: issue.pageId,
      detail: `[${issue.severity}] ${issue.rule}: ${issue.message}`,
    })
  }

  const counts = {
    resynthesize: tasks.filter((t) => t.kind === "resynthesize").length,
    propose: tasks.filter((t) => t.kind === "propose").length,
    review: tasks.filter((t) => t.kind === "review").length,
  }
  return { tasks, counts }
}

/** Prompt the model to draft a stub page for a missing concept (a knowledge gap). */
export function buildProposePrompt(gap: KnowledgeGap, neighborSnippets: string): string {
  return [
    `A page for '${gap.target}' is referenced by ${gap.referencedBy.length} page(s) but does not exist.`,
    `Draft a concise stub page so the wiki has no dangling link.`,
    ``,
    `## Context from pages that reference it`,
    neighborSnippets.trim() || "(no snippets available)",
    ``,
    `## Output format (emit ONLY this block)`,
    `---FILE: ${gap.target.includes("/") ? `wiki/${gap.target}` : `wiki/concepts/${gap.target}`}.md---`,
    `<YAML frontmatter: type, title, tags (>=2), related, sources, created, updated, confidence: INFERRED>`,
    `<short markdown body with [[wikilinks]]>`,
    `---END FILE---`,
  ].join("\n")
}

/** Prompt the model to refresh a stale page from its sources. */
export function buildRefreshPrompt(pageId: string, currentBody: string, sourceSnippets: string): string {
  return [
    `Refresh the wiki page '${pageId}' — it is stale (something it depends on changed).`,
    `Rewrite it using the source material below, keeping it consistent with the rest of the wiki.`,
    `Do NOT restate these instructions; emit only the page.`,
    ``,
    `## Current page body`,
    currentBody.trim() || "(empty)",
    ``,
    `## Source material`,
    sourceSnippets.trim() || "(no sources available — refresh from general knowledge of the topic)",
    ``,
    `## Output format (emit ONLY this block)`,
    `---FILE: ${pageId}.md---`,
    `<full page with YAML frontmatter and markdown body>`,
    `---END FILE---`,
  ].join("\n")
}
