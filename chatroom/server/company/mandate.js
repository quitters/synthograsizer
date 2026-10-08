/**
 * The corporate mandate: how strict a company's two stages are.
 * ─────────────────────────────────────────────────────────────
 * Drafting (inside the room) is more permissive than publishing (anything that leaves it). Each stage has a dial with
 * ordered levels, listed from the most permissive to the strictest. The rule everything here enforces:
 *
 *   A request may TIGHTEN the mandate and may never loosen it past the operator's default.
 *
 * The operator is whoever runs this server: on a hosted instance, its environment; locally, a policy file next to the data
 * (see operator.js). Nobody reaches the operator's value through a room, a profile or an API request. What is NOT a dial at
 * all, so nothing can turn it down: the hard limits, the publishing floor, human approval of every publication, and the
 * AI-generated label (hardLimits.js). A request that names one of them is refused by name.
 */
import { deepFreeze, getPath, setPath, clone, isPlainObject } from './util.js';
import { PolicyError } from './errors.js';

export const MANDATE_DIALS = deepFreeze({
  'drafting.themes': {
    title: 'Themes while drafting',
    levels: ['explore', 'careful', 'avoid'],
    levelText: {
      explore: 'Within the hard limits you may explore dark, mature or contested themes as fiction and ideation, argue the other side, and write villains. Keep fiction clearly fiction.',
      careful: 'Dark or contested themes may appear, but without graphic detail: imply rather than depict, and do not dwell.',
      avoid: 'Keep the work to everyday, all-ages themes. If a topic turns heavy, steer back.',
    },
    screenText: {
      explore: null,
      careful: 'The company asks for restraint: graphic violence, gore or explicit sexual detail is a violation here, even in fiction.',
      avoid: 'The company asks for all-ages drafting: dark, violent, sexual or distressing material is a violation here, even in fiction.',
    },
  },
  'publishing.audience': {
    title: 'Audience for published work',
    levels: ['mature', 'teen', 'general'],
    levelText: {
      mature: 'Published work is for adults: serious themes are fine, but never explicit sexual content or gratuitous gore.',
      teen: 'Published work is suitable for teenagers: no graphic violence or gore, no sexual content, nothing more frightening than a mild thriller.',
      general: 'Published work is suitable for all ages.',
    },
    screenText: {
      mature: 'The audience is adults: explicit sexual content and gratuitous gore are violations.',
      teen: 'The audience is teenagers: graphic violence or gore, any sexual content, and strong hate speech are violations.',
      general: 'The audience is all ages: violence beyond the mildest cartoon kind, any sexual content, frightening or distressing material and strong language are violations.',
    },
  },
});

export const DIAL_PATHS = Object.freeze(Object.keys(MANDATE_DIALS));

/** The operator's default when nobody has said otherwise. Publishing is stricter than drafting by design. */
export const DEFAULT_OPERATOR_MANDATE = deepFreeze({
  drafting: { themes: 'explore' },
  publishing: { audience: 'teen' },
});

// Names people (or agents) might try, so the refusal can say what they are instead of "unknown field".
const FIXED_NAMES = new Set([
  'hardlimits', 'hard_limits', 'humanapproval', 'human_approval', 'requirehumanapproval', 'autopublish', 'auto_publish',
  'label', 'labelaigenerated', 'ailabel', 'nocopyrightedcharacters', 'nolivingartiststyletargets', 'floor',
  'screen', 'providersafety', 'safetysettings', 'honesty', 'disclosure',
]);

const norm = (s) => String(s).toLowerCase().replace(/[^a-z_]/g, '');

/** The strictness of a level, 0 = most permissive. -1 for a value that is not a level. */
export const strictness = (path, value) => (MANDATE_DIALS[path]?.levels || []).indexOf(value);

/**
 * Check a mandate someone sent. Unknown or fixed things are named and refused, not ignored.
 * @param {unknown} input
 * @returns {{ ok: boolean, value: object, errors: string[] }}  value holds only the dials that were given
 */
export function validateMandate(input) {
  const errors = [];
  const value = {};
  if (input === undefined || input === null) return { ok: true, value, errors };
  if (!isPlainObject(input)) return { ok: false, value, errors: ['mandate must be an object like {"drafting": {"themes": "careful"}}'] };

  for (const [stage, body] of Object.entries(input)) {
    if (stage !== 'drafting' && stage !== 'publishing') {
      errors.push(FIXED_NAMES.has(norm(stage))
        ? `mandate.${stage} is fixed by the safety floor and cannot be changed`
        : `mandate.${stage} is not something a mandate has (stages are "drafting" and "publishing")`);
      continue;
    }
    if (!isPlainObject(body)) { errors.push(`mandate.${stage} must be an object`); continue; }
    for (const [key, level] of Object.entries(body)) {
      const path = `${stage}.${key}`;
      const dial = MANDATE_DIALS[path];
      if (!dial) {
        errors.push(FIXED_NAMES.has(norm(key))
          ? `mandate.${path} is fixed by the safety floor and cannot be changed`
          : `mandate.${path} is not a dial (dials: ${DIAL_PATHS.join(', ')})`);
        continue;
      }
      if (!dial.levels.includes(level)) { errors.push(`mandate.${path} must be one of ${dial.levels.join(', ')}`); continue; }
      setPath(value, path, level);
    }
  }
  return { ok: errors.length === 0, value, errors };
}

/**
 * Merge a request into the operator's mandate. Each dial takes the STRICTER of the two; a request that would loosen a dial
 * is clamped to the operator's value and reported, never applied.
 * @param {object} operator  a complete mandate
 * @param {object} [requested]  validated, possibly partial
 * @returns {{ effective: object, clamped: { path: string, requested: string, effective: string }[] }}
 */
export function resolveMandate(operator, requested = {}) {
  const effective = clone(operator);
  const clamped = [];
  for (const path of DIAL_PATHS) {
    const want = getPath(requested, path);
    const base = getPath(operator, path);
    if (want === undefined) continue;
    if (strictness(path, want) >= strictness(path, base)) setPath(effective, path, want);
    else clamped.push({ path, requested: want, effective: base });
  }
  return { effective, clamped };
}

/** True when `candidate` is at least as strict as `baseline` on every dial. */
export function isAtLeastAsStrict(candidate, baseline) {
  return DIAL_PATHS.every(path => strictness(path, getPath(candidate, path)) >= strictness(path, getPath(baseline, path)));
}

/** Check an operator mandate (from a file): complete, every dial a real level. */
export function assertOperatorMandate(mandate) {
  const { ok, errors, value } = validateMandate(mandate);
  const missing = DIAL_PATHS.filter(p => getPath(value, p) === undefined);
  if (!ok || missing.length) {
    throw new PolicyError(`The operator's mandate is not valid: ${[...errors, ...missing.map(p => `${p} is missing`)].join('; ')}`, { status: 500, code: 'bad_operator_policy' });
  }
  return value;
}

/** The sentence for each stage, for the agent prompt and for the screen. */
export function draftingRule(mandate) {
  return MANDATE_DIALS['drafting.themes'].levelText[getPath(mandate, 'drafting.themes')];
}
export function publishingRule(mandate) {
  return MANDATE_DIALS['publishing.audience'].levelText[getPath(mandate, 'publishing.audience')];
}

/** Extra things the screen is told to treat as violations at this stage because of the mandate (empty when it adds nothing). */
export function mandateScreenRules(mandate, stage) {
  if (stage === 'drafting') {
    const text = MANDATE_DIALS['drafting.themes'].screenText[getPath(mandate, 'drafting.themes')];
    return text ? [{ id: 'theme_exceeds_mandate', title: 'Beyond the company\'s drafting mandate', check: text }] : [];
  }
  const text = MANDATE_DIALS['publishing.audience'].screenText[getPath(mandate, 'publishing.audience')];
  return text ? [{ id: 'audience_exceeded', title: 'Beyond the company\'s publishing audience', check: text }] : [];
}
