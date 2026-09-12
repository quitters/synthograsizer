/**
 * Tool-layer configuration.
 * ─────────────────────────
 * Phase 2 of MODERNIZATION_PLAN.md replaces post-hoc regex parsing of the
 * model's prose with real function calling. Both paths ship; TOOL_MODE picks
 * which one runs, and 'tags' stays the default until the function path has
 * been exercised against the live API.
 */

/**
 * 'tags'      — legacy: the model writes [IMAGE: ...] in prose, the server
 *               regex-parses it after the turn ends, and the result reaches
 *               the NEXT speaker as transcript text.
 * 'functions' — the model emits function_call steps, the server executes them
 *               mid-turn and feeds results back, so the agent reacts to what
 *               actually happened inside its own message.
 */
export const TOOL_MODE = process.env.TOOL_MODE === 'functions' ? 'functions' : 'tags';

export const isFunctionCallingEnabled = () => TOOL_MODE === 'functions';

/**
 * Max function-call rounds per agent turn. Each round is one extra API call,
 * so this bounds both latency and the blast radius of a model that decides to
 * call generate_image forty times.
 */
export const MAX_TOOL_ROUNDS = 4;

/** Max function calls executed in a single round. */
export const MAX_CALLS_PER_ROUND = 4;

/**
 * How many generated images may be handed back to the model inline per turn.
 *
 * Returning the image in the function_result is the whole point — the agent
 * can critique what it actually made instead of what it asked for. But in
 * stateless mode every continuation re-sends the prior steps, so each inline
 * image is paid for again on each subsequent round. Phase 3's stateful mode
 * (previous_interaction_id) removes that re-send, at which point this can rise.
 */
export const MAX_INLINE_RESULT_IMAGES = 2;

/**
 * Tool tiers by agent capability.
 *
 * Google's guidance is 10–20 active tools maximum, and the full inventory in
 * MODERNIZATION_PLAN.md §2.3 is ~18 before the built-ins. So tools are handed
 * out by role rather than all at once. An agent's `tools` field names a tier;
 * anything unrecognised falls back to DEFAULT_TOOL_TIER.
 *
 * Phase 2 ships the media slice only. The SYNTH_*/workflow family stays on
 * the tag path until this one has proven itself.
 */
export const TOOL_TIERS = {
  /** No tools — pure conversationalists. Cheapest, least to go wrong. */
  none: [],

  /** Look things up, but don't make anything. */
  research: ['google_search', 'url_context'],

  /** Make pictures, and see what came back. */
  visual: ['generate_image', 'compose_image', 'google_search'],

  /** Write the shared file the preview panel renders. */
  builder: ['write_artifact', 'google_search', 'url_context'],

  /** Everything in the Phase 2 slice. Keep an eye on the count. */
  full: [
    'generate_image',
    'compose_image',
    'write_artifact',
    'google_search',
    'url_context',
  ],
};

export const DEFAULT_TOOL_TIER = 'full';

/** Tiers offerable in the UI, with a human-readable blurb. */
export const TOOL_TIER_CHOICES = [
  { id: 'full', label: 'All tools', blurb: 'Images, artifacts, search and URL reading.' },
  { id: 'visual', label: 'Visual', blurb: 'Image generation and composition, plus search.' },
  { id: 'builder', label: 'Builder', blurb: 'Writes the shared artifact; can research.' },
  { id: 'research', label: 'Research', blurb: 'Search and URL reading only — makes nothing.' },
  { id: 'none', label: 'No tools', blurb: 'Conversation only. Cheapest and most predictable.' },
];

export function resolveToolTier(agent) {
  const tier = agent?.tools;
  return Object.prototype.hasOwnProperty.call(TOOL_TIERS, tier) ? tier : DEFAULT_TOOL_TIER;
}

export function isKnownToolTier(tier) {
  return typeof tier === 'string' && Object.prototype.hasOwnProperty.call(TOOL_TIERS, tier);
}
