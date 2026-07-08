import { buildAnalysisPrompt, buildGenerationPrompt } from "./ingest.js"
import { parseIngestBlocks, type IngestBlocks } from "./ingest-parser.js"
import type { IngestContext, IngestSource } from "./ingest.js"
import type { LlmClient, LlmMessage } from "./types.js"

/**
 * Orchestrates the two-step CoT ingest using an injected {@link LlmClient}:
 *
 *   1. analysis  — reason over source + purpose + index, return structured notes
 *   2. generation — turn the notes into FILE/REVIEW blocks
 *
 * The runner itself is deterministic given a canned client, so the whole ingest
 * pipeline is testable with no network. Persistence (writing files, rebuilding
 * the index, propagating staleness) is the caller's job — this returns the
 * parsed blocks only.
 */

const SYSTEM =
  "You are a disciplined knowledge-base maintainer. Follow the user's output format exactly."

export async function runIngest(
  source: IngestSource,
  ctx: IngestContext,
  llm: LlmClient,
): Promise<IngestBlocks> {
  const analysisMessages: LlmMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: buildAnalysisPrompt(source, ctx) },
  ]
  const analysis = await llm.complete(analysisMessages)

  const generationMessages: LlmMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: buildGenerationPrompt(source, analysis.text, ctx) },
  ]
  const generation = await llm.complete(generationMessages)

  return parseIngestBlocks(generation.text)
}
