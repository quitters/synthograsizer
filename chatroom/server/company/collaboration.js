/**
 * Which parts of the Hall a company has open.
 * ────────────────────────────────────────────
 * The Hall (hall/) is where the people of a company reach each other between rooms. It gives agents no new reach outside the company (no
 * address leaves it, nothing is published, nothing runs), but it does widen what they can write into each other's prompts, so each part is
 * a switch the owner holds, and the operator holds one master switch above them. A company made before the Hall existed has none of it open.
 *
 *   mail       mailboxes: private-to-the-two-of-them, owner-readable messages between people
 *   forums     lasting group channels
 *   workspace  shared, versioned text files
 *   board      tasks with a lead and members, and requests for a task team
 *   norms      working agreements people can propose (the owner decides)
 *
 * A switch is a permission, not a ceiling: turning one off only ever narrows what the people can do.
 */
import { PolicyError } from './errors.js';
import { isPlainObject } from './util.js';

export const COLLABORATION_FEATURES = Object.freeze(['mail', 'forums', 'workspace', 'board', 'norms']);

/** What a new company starts with: everything open. */
export const DEFAULT_COLLABORATION = Object.freeze(Object.fromEntries(COLLABORATION_FEATURES.map(f => [f, true])));

/** The tool each feature lets people use. */
export const FEATURE_TOOL = Object.freeze({ mail: 'mailbox', forums: 'forum', workspace: 'workspace', board: 'board', norms: 'propose_norm' });
export const HALL_TOOL_NAMES = Object.freeze(Object.values(FEATURE_TOOL));

/**
 * @param {unknown} input  an object of booleans, e.g. { mail: true, forums: false }
 * @returns {{ ok: boolean, value: Record<string, boolean>, errors: string[] }}
 */
export function validateCollaboration(input) {
  const errors = [];
  const value = {};
  if (input === undefined || input === null) return { ok: true, value, errors };
  if (!isPlainObject(input)) return { ok: false, value, errors: ['collaboration must be an object like {"mail": true}'] };
  for (const [name, on] of Object.entries(input)) {
    if (!COLLABORATION_FEATURES.includes(name)) { errors.push(`collaboration.${name} is not a feature (features: ${COLLABORATION_FEATURES.join(', ')})`); continue; }
    if (typeof on !== 'boolean') { errors.push(`collaboration.${name} must be true or false`); continue; }
    value[name] = on;
  }
  return { ok: errors.length === 0, value, errors };
}

/** Throws a 400 that names every problem. */
export function assertCollaboration(input) {
  const r = validateCollaboration(input);
  if (!r.ok) throw new PolicyError(r.errors.join('; '), { status: 400, code: 'bad_request', field: 'collaboration' });
  return r.value;
}

/**
 * What is actually open: a feature is open only if the operator has the Hall on and the company asked for it.
 * @param {{ enabled: boolean }} operatorHall
 * @param {Record<string, boolean>} [requested]
 * @returns {{ effective: Record<string, boolean>, clamped: string[] }} clamped lists features asked for that the operator keeps closed
 */
export function resolveCollaboration(operatorHall, requested = {}) {
  const effective = {};
  const clamped = [];
  for (const f of COLLABORATION_FEATURES) {
    const asked = requested[f] === true;
    effective[f] = asked && operatorHall.enabled;
    if (asked && !operatorHall.enabled) clamped.push(f);
  }
  return { effective, clamped };
}
