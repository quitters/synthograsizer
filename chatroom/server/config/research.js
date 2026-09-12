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
 * It also costs $1–3 per task ($3–7 for Max). That is not a rounding error
 * next to a whole chat session, so this is off by default, hard-capped per
 * session, and never silently substituted for the cheap [RESEARCH:] path.
 */

export const DEEP_RESEARCH_ENABLED = process.env.DEEP_RESEARCH === 'true';

export const isDeepResearchEnabled = () => DEEP_RESEARCH_ENABLED;

/** Standard agent. The Max variant is ~2x the cost for ~2x the searches. */
export const RESEARCH_AGENT = 'deep-research-preview-04-2026';
export const RESEARCH_AGENT_MAX = 'deep-research-max-preview-04-2026';

/**
 * Hard ceiling on tasks per session. An autonomous room with an uncapped
 * $1–3 tool can spend real money while nobody is watching, so the cap is
 * low and deliberate rather than generous.
 */
export const MAX_TASKS_PER_SESSION = Number(process.env.DEEP_RESEARCH_MAX_TASKS || 2);

/** Rough per-task cost, shown in the UI so the spend is never a surprise. */
export const ESTIMATED_COST_USD = { min: 1, max: 3 };

/**
 * Polling. Tasks run for minutes, so `background: true` is mandatory — a
 * synchronous call would hit the HTTP timeout long before the report lands.
 */
export const POLL_INTERVAL_MS = 15_000;
export const MAX_WAIT_MS = 15 * 60 * 1000;
