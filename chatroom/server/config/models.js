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
   * (promotional, through 2026-12-31) vs $2.00/$12.00 for 3.1 Pro.
   */
  FAST: 'gemini-3.8-flash',

  /**
   * Opt-in "deliberate" tier for analytical personas. Still preview — expect a
   * rename when it goes GA.
   */
  SMART: 'gemini-3.1-pro-preview',

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
 * - gemini-3.1-pro-preview has no announced shutdown date as of 2026-09-11.
 */

/** Model used for an agent turn when neither the agent nor the session overrides it. */
export const DEFAULT_AGENT_MODEL = MODELS.FAST;

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
    label: 'Gemini 3.1 Pro',
    blurb: 'Slower and ~5x the cost. Worth it for an architect or critic role.',
  },
  {
    id: MODELS.LITE,
    label: 'Gemini 3.5 Flash-Lite',
    blurb: 'Cheapest. Good for a heckler, a moderator, or a one-line persona.',
  },
];

const VALID_AGENT_MODELS = new Set(AGENT_MODEL_CHOICES.map(m => m.id));

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

/** True if `id` is one of the models the UI offers. */
export function isKnownAgentModel(id) {
  return typeof id === 'string' && VALID_AGENT_MODELS.has(id);
}
