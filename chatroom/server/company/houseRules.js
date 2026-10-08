/**
 * A company's house rules: how the people in it behave at work.
 * ─────────────────────────────────────────────────────────────
 * The mission says what the company stands for; the house rules say how its people carry themselves: grounded professionals with a job to do,
 * not a chorus drifting into the atmosphere (the plan's "not the Backrooms"). The pilot company kept this in the mission and in a paragraph
 * copied into all six character sheets, and six copies drift. Here it is one field on the company, put into the fixed layer for every agent,
 * ABOVE the character sheet and below the same sentence the mission carries: it cannot add an exception to a hard limit. A sheet that says
 * "speak in paragraphs" loses to a house rule that says "short messages".
 *
 * New companies start with the default below. A company made before this field existed has none (its sheets still carry their own copy).
 */
import { PolicyError } from './errors.js';
import { scanForSecrets } from './secrets.js';

export const HOUSE_RULES_MAX_CHARS = 2000;

export const DEFAULT_HOUSE_RULES = Object.freeze({
  text:
    'We are grounded professionals with a job to finish, in an ordinary, lived-in workplace: daylight, coffee, a whiteboard, a deadline. The work can be strange; the workplace is not.\n' +
    'We speak as ourselves, plainly, in short messages (under 120 words, except when we post the work itself). We name the person we are answering, and every time we speak we say something concrete: a proposal, an objection, a fix, a fact. If we agree, we say what we would still change.\n' +
    'We do not drift into pleasantries, summaries of what was already said, or talk about the conversation itself. We write no stage directions and no asterisk actions. We do not muse about being an AI or a simulation unless someone sincerely asks.\n' +
    'A favourite phrase is rare: we say it once a session at most, and never as the last words of a message. Only the lead writes the closing marker; the rest of us say in a sentence what we checked and what is still open.',
});

/**
 * @param {unknown} input
 * @returns {string} the cleaned text; an empty string means "no house rules"
 * @throws {PolicyError} when it is not text, is too long, or looks like it holds a secret
 */
export function validateHouseRules(input) {
  if (typeof input !== 'string') throw new PolicyError('The house rules must be text.', { status: 400, code: 'bad_house_rules', field: 'houseRules' });
  const text = input.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim();
  if (text.length > HOUSE_RULES_MAX_CHARS) {
    throw new PolicyError(`The house rules are ${text.length} characters; the limit is ${HOUSE_RULES_MAX_CHARS}.`, { status: 400, code: 'bad_house_rules', field: 'houseRules' });
  }
  const secrets = scanForSecrets(text);
  if (secrets.length) {
    throw new PolicyError(`The house rules look like they contain a secret (${secrets[0].kind}). Secrets never go in prompts.`, { status: 400, code: 'secret_in_text', field: 'houseRules' });
  }
  return text;
}
