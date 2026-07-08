/**
 * Pure budget allocator for assembling the LLM context window.
 *
 * Given an LLM's `maxContextSize` (in characters), compute the per-section
 * character budgets used when packing the prompt.
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │              maxCtx (100%)                          │
 *   ├──────┬───────────────┬──────────────────┬───────────┤
 *   │ idx  │   pages       │  history + sys   │  resp     │
 *   │  5%  │    50%        │    ~30%          │   15%     │
 *   └──────┴───────────────┴──────────────────┴───────────┤
 *
 * The response reserve is a "passive" reservation: we refuse to fill above
 * (maxCtx - responseReserve) so the LLM has room to answer.
 */

/** Result of `computeContextBudget`. All values are character counts. */
export interface ContextBudget {
  /** The model's full context window (falls back to a default when caller passes 0/undefined). */
  maxCtx: number
  /** Characters left empty so the LLM has room to write its response. */
  responseReserve: number
  /** Wiki index summary budget (~5%). */
  indexBudget: number
  /** Total characters available for retrieved wiki page content (50%). */
  pageBudget: number
  /** Per-page truncation cap. Scales with pageBudget (floor 5K), capped at pageBudget. */
  maxPageSize: number
}

const DEFAULT_MAX_CTX = 204_800
const RESPONSE_RESERVE_FRAC = 0.15
const INDEX_BUDGET_FRAC = 0.05
const PAGE_BUDGET_FRAC = 0.5
const PER_PAGE_FRAC = 0.3
const PER_PAGE_FLOOR = 5_000

/**
 * Compute character budgets from the LLM's max context window.
 *
 * Falsy `maxContextSize` (0 / NaN / undefined) falls back to the default
 * (~200K chars) so existing configs don't break.
 */
export function computeContextBudget(maxContextSize: number | undefined): ContextBudget {
  const maxCtx =
    typeof maxContextSize === "number" && maxContextSize > 0 ? maxContextSize : DEFAULT_MAX_CTX

  const responseReserve = Math.floor(maxCtx * RESPONSE_RESERVE_FRAC)
  const indexBudget = Math.floor(maxCtx * INDEX_BUDGET_FRAC)
  const pageBudget = Math.floor(maxCtx * PAGE_BUDGET_FRAC)

  // Per-page cap rules:
  //   - minimum PER_PAGE_FLOOR (5K) so a small config still fits one short page;
  //   - maximum pageBudget, so for tiny configs a single page can't exceed the
  //     entire page budget (which would then be rejected wholesale by the packer);
  //   - otherwise scale linearly at PER_PAGE_FRAC (30%).
  const maxPageSize = Math.min(
    pageBudget,
    Math.max(PER_PAGE_FLOOR, Math.floor(pageBudget * PER_PAGE_FRAC)),
  )

  return { maxCtx, responseReserve, indexBudget, pageBudget, maxPageSize }
}
