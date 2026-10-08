/**
 * "No secrets in prompts."
 * ─────────────────────────
 * Text that is about to become part of a prompt (a mission, a character sheet, a goal, a message from the host) is
 * checked for things that look like credentials. A match refuses the text; the answer names the KIND of secret and never
 * echoes it, so the refusal does not copy the secret into a log or a screen.
 *
 * It is a net with large holes, not a guarantee: a secret that does not look like one gets through. The other half of the
 * rule is structural and is tested separately: the server never puts its own environment into a prompt.
 */
import { PolicyError } from './errors.js';

// Each pattern needs enough specific shape that ordinary prose does not trip it.
const PATTERNS = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['secret key (sk-...)', /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{24,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['private key block', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['JSON web token', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  // "api_key = AbC123..." and the like: a long value that has both a letter and a digit
  ['credential assignment', /\b(?:api[_ -]?key|secret|token|passw(?:or)?d|bearer)\b\s*[:=]\s*['"]?(?=[A-Za-z0-9/+_.-]*[A-Za-z])(?=[A-Za-z0-9/+_.-]*\d)[A-Za-z0-9/+_.-]{16,}/i],
];

/** @returns {{ kind: string }[]} what looks like a secret in `text` (never the secret itself) */
export function scanForSecrets(text) {
  if (typeof text !== 'string' || !text) return [];
  const found = [];
  for (const [kind, re] of PATTERNS) if (re.test(text)) found.push({ kind });
  return found;
}

/**
 * Refuse `text` if it looks like it holds a secret.
 * @param {unknown} text
 * @param {string} label  what the text is, for the message ("the character sheet")
 * @param {string} [field]
 */
export function assertNoSecrets(text, label, field) {
  const found = scanForSecrets(typeof text === 'string' ? text : '');
  if (found.length) {
    throw new PolicyError(`${label} looks like it contains a secret (${found[0].kind}). Secrets never go in prompts; remove it and try again.`, {
      status: 400, code: 'secret_in_text', field,
    });
  }
}

/** The text with anything that looks like a secret replaced, for places that must show or log text the secret should not reach. */
export function redactSecrets(text) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const [kind, re] of PATTERNS) out = out.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`), `[removed: ${kind}]`);
  return out;
}
