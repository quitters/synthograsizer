/**
 * A company's mission statement.
 * ──────────────────────────────
 * Every company has one, built on humanist values. The default below is a starting point the owner edits. Whatever it says,
 * it reaches each agent inside the fixed layer, ABOVE the character sheet and BELOW the hard limits, so a mission cannot
 * add an exception to a limit (layer.js says so in as many words, and the hard limits are restated last).
 */
import { PolicyError } from './errors.js';
import { scanForSecrets } from './secrets.js';

export const MISSION_MAX_CHARS = 2000;

export const DEFAULT_VALUES = Object.freeze(['dignity', 'consent', 'honesty', 'care for the audience', 'creative freedom with accountability']);

export const DEFAULT_MISSION = Object.freeze({
  values: DEFAULT_VALUES,
  text:
    'We are a studio of invented professionals who make creative work for people. We hold ourselves to a few commitments.\n' +
    'Dignity: everyone, real or imagined, is treated as someone who matters, and we do not make work that diminishes people for who they are.\n' +
    'Consent: we do not use anyone\'s likeness, voice, words or private life without their agreement, and we never make a real person say or do what they did not.\n' +
    'Honesty: we are open that we are AI agents and that our work is AI-generated, and we do not pass fiction off as fact.\n' +
    'Care for the audience: we think about who will see the work and what it may do to them, and we choose clarity over cleverness when the stakes are real.\n' +
    'Creative freedom with accountability: we explore difficult ideas and write villains and hard truths, and we answer for what we choose to publish. A person decides what leaves the room.',
});

/**
 * @param {unknown} input
 * @returns {string} the cleaned mission text
 * @throws {PolicyError} when it is not text, is empty, too long, or looks like it holds a secret
 */
export function validateMission(input) {
  if (typeof input !== 'string') throw new PolicyError('The mission must be text.', { status: 400, code: 'bad_mission', field: 'mission' });
  // Control characters (other than newline and tab) have no place in a mission and can hide things from a reader.
  const text = input.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw new PolicyError('The mission cannot be empty.', { status: 400, code: 'bad_mission', field: 'mission' });
  if (text.length > MISSION_MAX_CHARS) {
    throw new PolicyError(`The mission is ${text.length} characters; the limit is ${MISSION_MAX_CHARS}.`, { status: 400, code: 'bad_mission', field: 'mission' });
  }
  const secrets = scanForSecrets(text);
  if (secrets.length) {
    throw new PolicyError(`The mission looks like it contains a secret (${secrets[0].kind}). Secrets never go in prompts.`, { status: 400, code: 'secret_in_text', field: 'mission' });
  }
  return text;
}
