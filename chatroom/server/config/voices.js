/**
 * Voice registry for audio rendering.
 * ───────────────────────────────────
 * Phase 6 of MODERNIZATION_PLAN.md §4.3. A chat room with named personas,
 * distinct colours and avatars should be listenable.
 */

export const TTS_MODEL = 'gemini-3.1-flash-tts-preview';

/**
 * The 30 prebuilt voices, with the style label the docs give each one.
 * Ordered so that consecutive default assignments sound clearly different
 * from one another rather than alphabetically adjacent.
 */
export const VOICES = [
  { id: 'Kore', style: 'Firm' },
  { id: 'Puck', style: 'Upbeat' },
  { id: 'Enceladus', style: 'Breathy' },
  { id: 'Charon', style: 'Informative' },
  { id: 'Leda', style: 'Youthful' },
  { id: 'Algieba', style: 'Smooth' },
  { id: 'Fenrir', style: 'Excitable' },
  { id: 'Achernar', style: 'Soft' },
  { id: 'Gacrux', style: 'Mature' },
  { id: 'Aoede', style: 'Breezy' },
  { id: 'Alnilam', style: 'Firm' },
  { id: 'Sulafat', style: 'Warm' },
  { id: 'Zephyr', style: 'Bright' },
  { id: 'Iapetus', style: 'Clear' },
  { id: 'Algenib', style: 'Gravelly' },
  { id: 'Callirrhoe', style: 'Easy-going' },
  { id: 'Rasalgethi', style: 'Informative' },
  { id: 'Despina', style: 'Smooth' },
  { id: 'Schedar', style: 'Even' },
  { id: 'Autonoe', style: 'Bright' },
  { id: 'Vindemiatrix', style: 'Gentle' },
  { id: 'Orus', style: 'Firm' },
  { id: 'Laomedeia', style: 'Upbeat' },
  { id: 'Erinome', style: 'Clear' },
  { id: 'Achird', style: 'Friendly' },
  { id: 'Umbriel', style: 'Easy-going' },
  { id: 'Sadachbia', style: 'Lively' },
  { id: 'Pulcherrima', style: 'Forward' },
  { id: 'Zubenelgenubi', style: 'Casual' },
  { id: 'Sadaltager', style: 'Knowledgeable' },
];

const VOICE_IDS = new Set(VOICES.map(v => v.id));

export const DEFAULT_VOICE = 'Kore';

export function isKnownVoice(id) {
  return typeof id === 'string' && VOICE_IDS.has(id);
}

/**
 * Default voice for the nth agent in the room, so a fresh room sounds like
 * distinct people without anyone having to pick.
 */
export function defaultVoiceForIndex(index) {
  return VOICES[index % VOICES.length].id;
}

/**
 * ⚠ Multi-speaker TTS accepts at most TWO speakers per request.
 *
 * MODERNIZATION_PLAN.md §4.3 assumed a chunk could carry the whole cast; it
 * cannot. So rendering works per contiguous same-speaker run with a
 * single-speaker config, and the PCM is concatenated afterwards. That scales
 * to any number of agents and gives exact per-agent voice control, at the
 * cost of cross-speaker prosody (the model cannot hear the previous line).
 */
export const MAX_SPEAKERS_PER_REQUEST = 2;

/**
 * Cap on a single synthesis request. The model's context is 32k tokens and
 * quality drifts on long outputs, so runs are split well below that.
 */
export const MAX_CHARS_PER_REQUEST = 4000;

/**
 * Audio output defaults, used only when the response omits them — the
 * response carries mime_type / channels / sample_rate and those win.
 */
export const DEFAULT_SAMPLE_RATE = 24000;
export const DEFAULT_CHANNELS = 1;
export const BITS_PER_SAMPLE = 16;
