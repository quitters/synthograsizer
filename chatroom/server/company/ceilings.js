/**
 * Caps: agents, turns, tokens, spend.
 * ───────────────────────────────────
 * Every field here is a ceiling, so lower is stricter. The same rule as the mandate: a request may lower a ceiling and may
 * never raise it past the operator's. A request that tries is clamped and the answer says so.
 */
import { deepFreeze, isPlainObject, clone } from './util.js';

export const CEILING_FIELDS = deepFreeze({
  maxAgents: { title: 'Most agents in a room', min: 1, max: 64, integer: true },
  maxTurns: { title: 'Most turns in a session', min: 1, max: 5000, integer: true },
  tokenLimit: { title: 'Most tokens the agents may produce in a session', min: 1000, max: 5_000_000, integer: true },
  spendLimitUsd: { title: 'Most estimated spend in a session, in US dollars', min: 0, max: 10_000, integer: false },
  maxScreenStrikes: { title: 'Withheld turns in a row before the room pauses for a person', min: 1, max: 50, integer: true },
  maxPendingProposals: { title: 'Publication proposals that may wait for a person at once', min: 0, max: 500, integer: true },
});

export const CEILING_NAMES = Object.freeze(Object.keys(CEILING_FIELDS));

/** What the operator allows when nobody has said otherwise. At most 8 active agents per room is the plan's default. */
export const DEFAULT_OPERATOR_CEILINGS = deepFreeze({
  maxAgents: 8,
  maxTurns: 200,
  tokenLimit: 200_000,
  spendLimitUsd: 10,
  maxScreenStrikes: 3,
  maxPendingProposals: 20,
});

/**
 * @param {unknown} input  an object with any of the ceiling fields
 * @returns {{ ok: boolean, value: Record<string, number>, errors: string[] }}
 */
export function validateCeilings(input) {
  const errors = [];
  const value = {};
  if (input === undefined || input === null) return { ok: true, value, errors };
  if (!isPlainObject(input)) return { ok: false, value, errors: ['ceilings must be an object like {"maxAgents": 6}'] };
  for (const [name, n] of Object.entries(input)) {
    const field = CEILING_FIELDS[name];
    if (!field) { errors.push(`ceilings.${name} is not a ceiling (ceilings: ${CEILING_NAMES.join(', ')})`); continue; }
    if (typeof n !== 'number' || !Number.isFinite(n)) { errors.push(`ceilings.${name} must be a number`); continue; }
    if (field.integer && !Number.isInteger(n)) { errors.push(`ceilings.${name} must be a whole number`); continue; }
    if (n < field.min || n > field.max) { errors.push(`ceilings.${name} must be between ${field.min} and ${field.max}`); continue; }
    value[name] = n;
  }
  return { ok: errors.length === 0, value, errors };
}

/**
 * Lower the operator's ceilings by a request. Each field takes the smaller of the two.
 * @returns {{ effective: Record<string, number>, clamped: { name: string, requested: number, effective: number }[] }}
 */
export function resolveCeilings(operator, requested = {}) {
  const effective = clone(operator);
  const clamped = [];
  for (const name of CEILING_NAMES) {
    const want = requested[name];
    if (want === undefined) continue;
    if (want <= operator[name]) effective[name] = want;
    else clamped.push({ name, requested: want, effective: operator[name] });
  }
  return { effective, clamped };
}

export function assertOperatorCeilings(input) {
  const { ok, value, errors } = validateCeilings(input);
  const missing = CEILING_NAMES.filter(n => value[n] === undefined);
  if (!ok || missing.length) {
    throw new Error(`The operator's ceilings are not valid: ${[...errors, ...missing.map(n => `${n} is missing`)].join('; ')}`);
  }
  return value;
}
