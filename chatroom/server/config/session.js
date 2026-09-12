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
 *   store: false  (default, unchanged)
 *     Nothing is retained at Google. Every turn re-sends the full system
 *     prompt and windowed transcript, and `usage.total_cached_tokens` stays
 *     at zero because there is no chain for caching to key on.
 *
 *   store: true
 *     Each agent gets a server-side chain via previous_interaction_id, so a
 *     turn sends only what is new since that agent last spoke. Cached input
 *     bills at roughly a tenth of fresh input on the 3.x Flash line. The cost
 *     is retention: Google keeps the interaction for 55 days on the paid tier
 *     (1 day on free, configurable to 7/14/28/55 in AI Studio).
 *
 * chatroom/.env.example advertises `store=false` as a feature, so flipping
 * this is a product decision rather than a tuning knob. It is opt-in, and
 * orchestrator.reset() deletes the session's chains when it is on.
 */

export const STORE_INTERACTIONS = process.env.GEMINI_STORE_INTERACTIONS === 'true';

export const isStatefulEnabled = () => STORE_INTERACTIONS;

/**
 * Minimum shared prefix before implicit caching engages, per the docs:
 * 4,096 tokens for the 3.x Flash line and 3.1 Pro (2,048 for 2.5). Used only
 * to decide whether to log a "prompt too short to cache" hint.
 */
export const IMPLICIT_CACHE_MIN_TOKENS = 4096;
