/**
 * Notice a person who keeps saying the same thing.
 *
 * A live company room once burned 38 turns ($0.71) while two people sent near-identical messages about eight times each, waiting on
 * a tool that could not answer. The room's other limits (turns, tokens, spend, failed turns in a row) do not see that: every turn
 * "worked". This looks at what each person said, nothing else.
 *
 * What counts as the same: the prose of a message (fenced code is left out, because revising a file means posting it again) compared as
 * word pairs, and the last `window` messages of one person all alike. A message that did something (saved a file, made a picture)
 * is progress and starts the count again, and so does a message from the host. Short messages are not compared.
 *
 * Calibrated on 71 saved conversations (1,193 pairs of one person's consecutive messages): healthy rooms almost never reach 0.8,
 * and when they do it is a coder re-posting a sketch (the code is dropped, what is left differs). Only the two real loops trip it,
 * at any threshold from 0.5 to 0.9, so 0.8 has room on both sides.
 */

export const DEFAULT_WINDOW = 3;
export const MAX_WINDOW = 10;
export const DEFAULT_THRESHOLD = 0.8;
export const MIN_WORDS = 12;
/** Only the start of a very long message is compared; a loop repeats its opening. */
const MAX_WORDS = 600;

const FENCED = /```[\s\S]*?(?:```|$)/g;

/** The words of a message's prose: lower case, no fenced code, no punctuation. */
export function proseWords(text) {
  return String(text ?? '')
    .replace(FENCED, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_WORDS);
}

/** The set of word pairs in a list of words (a single word counts as its own pair). */
export function pairsOf(words) {
  const out = new Set();
  for (let i = 0; i + 2 <= words.length; i++) out.add(`${words[i]} ${words[i + 1]}`);
  if (!out.size && words.length === 1) out.add(words[0]);
  return out;
}

/** How alike two sets are, 0 to 1 (the share of all items that both have). */
export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return shared / (a.size + b.size - shared);
}

/** How alike two messages are, 0 to 1. */
export function similarity(textA, textB) {
  return jaccard(pairsOf(proseWords(textA)), pairsOf(proseWords(textB)));
}

/** Clamp a window the way the settings do: 0 is off, 2 to 10 is the number of alike messages that trips it. */
export function clampWindow(value, fallback = DEFAULT_WINDOW) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return 0;
  return Math.max(2, Math.min(n, MAX_WINDOW));
}

const CHANGES_THE_WORK = new Set(['write_artifact', 'render_artifact', 'generate_image', 'compose_image', 'critique_image', 'deep_research']);

/**
 * Whether a tool call that succeeded changed the work (a file saved or rendered, a picture made, research started, a workspace file
 * written). Reading, mail, forums and the board are talk about the work, and a loop can send those for ever.
 */
export function changedTheWork(toolName, args) {
  return CHANGES_THE_WORK.has(toolName) || (toolName === 'workspace' && args?.action === 'write');
}

export class RepeatDetector {
  /** @param {{ threshold?: number, minWords?: number }} [options] */
  constructor({ threshold = DEFAULT_THRESHOLD, minWords = MIN_WORDS } = {}) {
    this.threshold = threshold;
    this.minWords = minWords;
    /** agent id -> the alike messages in a row so far (their word pairs) */
    this.runs = new Map();
  }

  /** Start again: the host spoke, or a person looked and resumed the room. */
  reset() {
    this.runs.clear();
  }

  /**
   * Take one committed message.
   * @param {{ agentId: string, text: string, progress?: boolean, window?: number }} message  `progress`: it saved a file, made media or started a workflow
   * @returns {null | { agentId: string, count: number, similarity: number }} set when the last `window` messages of this person are all alike
   */
  observe({ agentId, text, progress = false, window = DEFAULT_WINDOW }) {
    const size = clampWindow(window, DEFAULT_WINDOW);
    if (!size || !agentId) return null;
    if (progress) { this.runs.delete(agentId); return null; }

    const words = proseWords(text);
    if (words.length < this.minWords) return null;        // too short to say anything: neither adds to a run nor ends one
    const pairs = pairsOf(words);

    const run = this.runs.get(agentId) ?? [];
    let lowest = 1;
    for (const earlier of run) lowest = Math.min(lowest, jaccard(pairs, earlier));
    const kept = run.length && lowest >= this.threshold ? run : [];
    kept.push(pairs);
    while (kept.length > size) kept.shift();
    this.runs.set(agentId, kept);

    if (kept.length >= size) return { agentId, count: kept.length, similarity: Math.round(lowest * 100) / 100 };
    return null;
  }
}
