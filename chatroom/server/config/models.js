/**
 * Gemini model registry — single source of truth for the chat room.
 * ─────────────────────────────────────────────────────────────────
 * Model IDs used to be hard-coded in gemini.js, tools.js and imageGen.js.
 * They are centralised here because the 3.x line moves fast and preview IDs
 * get retired (see MODEL_NOTES below), so a version bump should be one edit.
 *
 * The Python side has the equivalent registry in backend/config.py — keep the
 * image model IDs in sync between the two.
 */

export const MODELS = {
  /**
   * Default conversational model for agent turns.
   * gemini-3.8-flash is the current stable workhorse: $0.75/$3.75 per 1M
   * (promotional, through 2026-12-31) vs $2.00/$10.00 for Gemini 4 Argon
   * ($4.00/$20.00 from 2026-12-01).
   */
  FAST: 'gemini-3.8-flash',

  /**
   * Opt-in "deliberate" tier for analytical personas: Gemini 4 Argon, which
   * replaced gemini-3.1-pro-preview on 2026-10-13. Verified against the live
   * API: streaming Interactions, google_search, url_context and function calls
   * (alone and combined with built-ins under tool_choice 'validated') all work.
   * It does NOT take thinking_level 'minimal' (a 400) — see thinkingLevelFor.
   * Explicit context caching is unsupported (implicit only).
   */
  SMART: 'gemini-4-argon',

  /**
   * Cheapest tier ($0.30/$2.50 per 1M). Used for the tool-running model, whose
   * only job is to execute a search / URL fetch and summarise the result.
   * Confirmed to support both google_search and url_context.
   */
  LITE: 'gemini-3.5-flash-lite',

  /**
   * Image *understanding* (describing / critiquing an image).
   * NOTE: this must be a normal multimodal text model, NOT an image-generation
   * model. Nano Banana emits images; asking it a question about one and reading
   * output_text is the wrong tool for the job.
   */
  IMAGE_UNDERSTANDING: 'gemini-3.8-flash',

  /** Image generation — Nano Banana 2. Went GA; the -preview alias is retired. */
  IMAGE_GEN_FAST: 'gemini-3.1-flash-image',

  /** Image generation — Nano Banana Pro. Went GA; the -preview alias is retired. */
  IMAGE_GEN_HQ: 'gemini-3-pro-image',
};

/**
 * MODEL_NOTES
 * - gemini-3.1-flash-image-preview and gemini-3-pro-image-preview had a
 *   published shutdown date of 2026-06-25. Anything still pinning those IDs is
 *   calling a retired endpoint.
 * - gemini-3.1-pro-preview was replaced by gemini-4-argon on 2026-10-13; the old
 *   id still works at Google but is no longer offered (see LEGACY_MODEL_IDS).
 */

/**
 * Ids this registry used to offer, mapped to what replaced them. Saved sessions,
 * an operator's COMPANY_MODELS / operator-policy.json and API callers still carry
 * the old ids, and "unknown, so ignored" would quietly drop an agent on the
 * default model instead of the deliberate one it was set up with.
 */
export const LEGACY_MODEL_IDS = Object.freeze({
  'gemini-3.1-pro-preview': MODELS.SMART,
});

/** The id an agent should run on: a legacy id becomes its replacement, anything else is returned unchanged. */
export function canonicalModelId(id) {
  return typeof id === 'string' && Object.hasOwn(LEGACY_MODEL_IDS, id) ? LEGACY_MODEL_IDS[id] : id;
}

/** Model used for an agent turn when neither the agent nor the session overrides it. */
export const DEFAULT_AGENT_MODEL = MODELS.FAST;

/**
 * List prices in US dollars per million tokens, from the notes on MODELS above. Used only to ESTIMATE spend for a company's
 * spend ceiling (company/spend.js), never to bill anyone; thinking tokens count as output. Revisit when prices move.
 * SMART carries the price from 2026-12-01 ($4/$20), not the launch price ($2/$10): a ceiling that over-estimates only stops a
 * run early, and one that under-estimates after the rise would let it overspend.
 */
export const MODEL_PRICING_USD_PER_M = {
  [MODELS.FAST]: { in: 0.75, out: 3.75 },
  [MODELS.SMART]: { in: 4.0, out: 20.0 },
  [MODELS.LITE]: { in: 0.3, out: 2.5 },
};

/** Model used by tools.js for search / URL-context / research calls. */
export const TOOL_MODEL = MODELS.LITE;

/**
 * Models offerable per agent in the UI. Kept deliberately short — the point is
 * a cheap default with one deliberate upgrade path, not a model buffet.
 */
export const AGENT_MODEL_CHOICES = [
  {
    id: MODELS.FAST,
    label: 'Gemini 3.8 Flash',
    blurb: 'Default. Fast and cheap — right for most conversational turns.',
  },
  {
    id: MODELS.SMART,
    label: 'Gemini 4 Argon',
    blurb: 'Slower and several times the cost. Worth it for an architect or critic role.',
  },
  {
    id: MODELS.LITE,
    label: 'Gemini 3.5 Flash-Lite',
    blurb: 'Cheapest. Good for a heckler, a moderator, or a one-line persona.',
  },
];

/** The ids of those models, cheapest tier last. */
export const AGENT_MODEL_IDS = Object.freeze(AGENT_MODEL_CHOICES.map(m => m.id));

const VALID_AGENT_MODELS = new Set(AGENT_MODEL_IDS);

/**
 * Reasoning effort. Gemini bills thinking tokens as output, so leaving every
 * agent at the model default (medium) means paying for deliberation on small
 * talk. 'low' is the room default; analytical personas opt up.
 */
export const THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'];
export const DEFAULT_THINKING_LEVEL = 'low';

/**
 * Hard cap on thinking + output tokens *combined* — thinking is spent first, so
 * a tight cap truncates the visible answer before it starts. 8192 was tight
 * enough to trigger the continuation loop on ordinary turns.
 */
export const MAX_OUTPUT_TOKENS = 16384;

/**
 * A per-agent override of that cap, for the agent whose job is long output at a high thinking level (a programmer writing a whole game at 'high' can
 * spend most of 16,384 on thinking). 32,768 is Gemini 4 Argon's own output ceiling; below 4,096 the cap would truncate ordinary replies.
 */
export const MAX_OUTPUT_TOKENS_CEILING = 32768;
const MAX_OUTPUT_TOKENS_FLOOR = 4096;

/** An integer within the allowed range, or null (meaning "use the room's default") for anything else. */
export function normalizeMaxOutputTokens(value) {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_OUTPUT_TOKENS_CEILING, Math.max(MAX_OUTPUT_TOKENS_FLOOR, Math.round(n)));
}

/** Gemini 3 guidance: leave temperature at 1.0. */
export const DEFAULT_TEMPERATURE = 1.0;

/**
 * Resolve which model an agent turn should use.
 * Precedence: per-agent override → session-wide preference → default.
 * Unknown IDs fall through rather than being rejected, so an operator can pin
 * a model this registry hasn't heard of yet.
 */
export function resolveAgentModel(agent, sessionPreference = null) {
  return agent?.model || sessionPreference || DEFAULT_AGENT_MODEL;
}

/** Coerce arbitrary input to a valid thinking level, or the default. */
export function normalizeThinkingLevel(value) {
  if (typeof value !== 'string') return DEFAULT_THINKING_LEVEL;
  const lowered = value.toLowerCase().trim();
  return THINKING_LEVELS.includes(lowered) ? lowered : DEFAULT_THINKING_LEVEL;
}

/**
 * Levels a model rejects with a 400, found by asking the live API (2026-10-13): Argon takes low, medium and high only.
 * The request path has a retry that drops thinking_level when the API complains, but that lands on the model's own default
 * (medium), so an agent set to 'minimal' to save money would silently pay for more thinking. Step up to the nearest level
 * the model does take instead.
 */
const UNSUPPORTED_THINKING_LEVELS = {
  [MODELS.SMART]: new Set(['minimal']),
};

/** The thinking level to actually send `model`: `level` when it accepts it, else the nearest higher one it does. */
export function thinkingLevelFor(model, level) {
  const refused = UNSUPPORTED_THINKING_LEVELS[model];
  if (!refused?.has(level)) return level;
  return THINKING_LEVELS.slice(THINKING_LEVELS.indexOf(level) + 1).find(l => !refused.has(l)) ?? DEFAULT_THINKING_LEVEL;
}

/** True if `id` is one of the models the UI offers, or an older id that has been replaced by one (see LEGACY_MODEL_IDS). */
export function isKnownAgentModel(id) {
  return typeof id === 'string' && VALID_AGENT_MODELS.has(canonicalModelId(id));
}
