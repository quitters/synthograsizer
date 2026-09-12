/**
 * Session-state configuration.
 * ────────────────────────────
 * Phase 3 of MODERNIZATION_PLAN.md. The Interactions API can keep
 * conversation history server-side, which is the only way to get implicit
 * caching — explicit cache objects are a generateContent feature and are not
 * available here.
 *
 * That means a genuine trade, not a free optimisation:
 *
 *   store: true  (DEFAULT since 2026-09-12 — Alexander's call)
 *     Each agent gets a server-side chain via previous_interaction_id, so a
 *     turn sends only what is new since that agent last spoke. Cached input
 *     bills at roughly a tenth of fresh input on the 3.x Flash line. The cost
 *     is retention: Google keeps the interaction for 55 days on the paid tier
 *     (1 day on free, configurable to 7/14/28/55 in AI Studio).
 *
 *   store: false  (opt out with GEMINI_STORE_INTERACTIONS=false)
 *     Nothing is retained at Google. Every turn re-sends the full system
 *     prompt and windowed transcript, and `usage.total_cached_tokens` stays
 *     at zero because there is no chain for caching to key on.
 *
 * This default was flipped deliberately: the app previously advertised
 * "nothing retained at Google" as a feature, and that claim has been removed
 * from the README, ARCHITECTURE and .env.example rather than left to rot.
 * orchestrator.reset() deletes the session's chains, so resetting the room
 * still reaches out and removes the history.
 */

// Defaults ON. Only an explicit "false" opts out, so a typo'd value keeps
// the documented behaviour rather than silently changing the privacy posture.
export const STORE_INTERACTIONS = process.env.GEMINI_STORE_INTERACTIONS !== 'false';

export const isStatefulEnabled = () => STORE_INTERACTIONS;

/**
 * Minimum shared prefix before implicit caching engages, per the docs:
 * 4,096 tokens for the 3.x Flash line and 3.1 Pro (2,048 for 2.5). Used only
 * to decide whether to log a "prompt too short to cache" hint.
 */
export const IMPLICIT_CACHE_MIN_TOKENS = 4096;
