/**
 * Live API configuration.
 * ───────────────────────
 * Phase 8 of MODERNIZATION_PLAN.md §4.7 — a voice seat in the room.
 *
 * ⚠ SECURITY. The token endpoint mints credentials that talk to Gemini on
 * your API key's behalf. The chat room has no authentication of its own, so
 * on any deployment reachable by someone else, enabling this lets them mint
 * tokens and spend your quota. That is why it is off by default, why every
 * token is single-use and short-lived, and why the endpoint refuses to run
 * on a non-loopback bind unless LIVE_API_ALLOW_REMOTE is also set.
 *
 * Ephemeral tokens exist precisely so a browser never holds the real key:
 * a leaked one expires in minutes and buys a single session.
 */

export const LIVE_API_ENABLED = process.env.LIVE_API === 'true';

export const isLiveApiEnabled = () => LIVE_API_ENABLED;

/**
 * Explicit second opt-in for serving tokens to non-local clients. Two flags
 * rather than one because the failure mode is somebody else's bill.
 */
export const ALLOW_REMOTE_TOKENS = process.env.LIVE_API_ALLOW_REMOTE === 'true';

export const LIVE_MODEL = 'gemini-3.1-flash-live-preview';

/**
 * Token lifetime. Short on purpose — long enough to open a session, not long
 * enough to be worth stealing.
 */
export const TOKEN_USES = 1;
export const TOKEN_EXPIRY_MS = 15 * 60 * 1000;      // session may run this long
export const NEW_SESSION_WINDOW_MS = 60 * 1000;     // must CONNECT within this

/** Audio formats the Live API speaks. Fixed by the API, not by us. */
export const INPUT_AUDIO = { mimeType: 'audio/pcm', sampleRate: 16000, channels: 1, bits: 16 };
export const OUTPUT_AUDIO = { mimeType: 'audio/pcm', sampleRate: 24000, channels: 1, bits: 16 };
