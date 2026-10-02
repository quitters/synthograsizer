/**
 * Deep Research configuration.
 * ────────────────────────────
 * Phase 7 of MODERNIZATION_PLAN.md §4.5.
 *
 * The existing [RESEARCH:] tag is google_search + url_context in a single
 * call — cheap, shallow, and returns in seconds. The Deep Research agent is a
 * different tier entirely: it plans, runs dozens of searches, reads sources,
 * and synthesises a report over several minutes.
 *
 * It costs $1–3 per task ($3–7 for Max), so it stays capped per session and
 * is never silently substituted for the cheap [RESEARCH:] path. It is on by
 * default: the cap, not the flag, is what keeps an unattended room from
 * spending. DEEP_RESEARCH=false turns it off entirely.
 */

export const DEEP_RESEARCH_ENABLED = process.env.DEEP_RESEARCH !== 'false';

export const isDeepResearchEnabled = () => DEEP_RESEARCH_ENABLED;

/** Standard agent. The Max variant is ~2x the cost for ~2x the searches. */
export const RESEARCH_AGENT = 'deep-research-preview-04-2026';
export const RESEARCH_AGENT_MAX = 'deep-research-max-preview-04-2026';

/**
 * Hard ceiling on tasks per session. A ceiling, not a budget: it exists so an
 * unattended room cannot loop on a $1–3 tool forever, and it stays finite for
 * that reason even when the spend is not the operator's concern. Raise it with
 * DEEP_RESEARCH_MAX_TASKS.
 */
export const MAX_TASKS_PER_SESSION = Number(process.env.DEEP_RESEARCH_MAX_TASKS || 10);

/** Rough per-task cost, shown in the UI so the spend is never a surprise. */
export const ESTIMATED_COST_USD = { min: 1, max: 3 };

/**
 * Polling. Tasks run for minutes, so `background: true` is mandatory — a
 * synchronous call would hit the HTTP timeout long before the report lands.
 */
export const POLL_INTERVAL_MS = 15_000;
export const MAX_WAIT_MS = 15 * 60 * 1000;
