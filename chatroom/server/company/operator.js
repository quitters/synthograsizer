/**
 * The operator's policy: the defaults nobody can loosen from inside a request.
 * ─────────────────────────────────────────────────────────────────────────────
 * The operator is whoever runs this server. On a hosted instance (SYNTH_HOSTED=1) its policy comes from the environment
 * alone, the way backend/policy.py works: nothing is read from disk and nothing a visitor sends can change it. On a local
 * install it can also come from a JSON file (COMPANY_OPERATOR_POLICY, or <data>/operator-policy.json), which is the one way
 * for a person at the machine to move the defaults, in either direction, within the dials. No room, profile or API request
 * reaches it.
 *
 * Whatever is loaded, the hard limits, the publishing floor, human approval and the AI-generated label are not in here.
 * They are not settings.
 *
 * A file that is not valid is ignored whole and the built-in defaults apply, with a warning: a typo must never leave a
 * server looser than it was meant to be.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_OPERATOR_MANDATE, assertOperatorMandate, validateMandate, MANDATE_DIALS } from './mandate.js';
import { DEFAULT_OPERATOR_CEILINGS, validateCeilings, CEILING_NAMES } from './ceilings.js';
import { DEFAULT_OPERATOR_TOOLS, validateToolList } from './toolGrants.js';
import { clone, deepFreeze, isPlainObject, setPath } from './util.js';
import { MODELS } from '../config/models.js';

export const OPERATOR_FILE_NAME = 'operator-policy.json';

const numberFromEnv = (raw) => (raw === undefined || raw === '' ? undefined : Number(raw));

/**
 * @param {{ env?: object, dataDir: string, readFile?: Function, exists?: Function }} options
 */
export function loadOperator({ env = process.env, dataDir, readFile = (p) => fs.readFileSync(p, 'utf8'), exists = fs.existsSync } = {}) {
  const hosted = env.SYNTH_HOSTED === '1' || Boolean(env.VERCEL);
  const warnings = [];
  const sources = [];

  let mandate = clone(DEFAULT_OPERATOR_MANDATE);
  let ceilings = clone(DEFAULT_OPERATOR_CEILINGS);
  let tools = [...DEFAULT_OPERATOR_TOOLS];
  let screen = { drafts: true, model: MODELS.FAST };
  let file = null;

  // ── the file (local installs only) ────────────────────────────────────────
  if (!hosted) {
    const candidate = env.COMPANY_OPERATOR_POLICY ? path.resolve(env.COMPANY_OPERATOR_POLICY) : path.join(dataDir, OPERATOR_FILE_NAME);
    if (exists(candidate)) {
      try {
        const parsed = JSON.parse(readFile(candidate));
        if (!isPlainObject(parsed)) throw new Error('it must be a JSON object');
        const known = ['mandate', 'ceilings', 'tools', 'screen'];
        const stray = Object.keys(parsed).filter(k => !known.includes(k));
        if (stray.length) throw new Error(`unknown section(s): ${stray.join(', ')}`);

        const m = validateMandate(parsed.mandate);
        if (!m.ok) throw new Error(m.errors.join('; '));
        const c = validateCeilings(parsed.ceilings);
        if (!c.ok) throw new Error(c.errors.join('; '));
        const t = validateToolList(parsed.tools);
        if (!t.ok) throw new Error(t.errors.join('; '));
        if (parsed.screen !== undefined) {
          if (!isPlainObject(parsed.screen) || Object.keys(parsed.screen).some(k => !['drafts', 'model'].includes(k))) throw new Error('screen takes only "drafts" and "model"');
          if (parsed.screen.drafts !== undefined && typeof parsed.screen.drafts !== 'boolean') throw new Error('screen.drafts must be true or false');
          if (parsed.screen.model !== undefined && typeof parsed.screen.model !== 'string') throw new Error('screen.model must be a model id');
        }

        // The operator moves the dials freely (that is what the operator is for): what it names replaces the default.
        mandate = overlay(mandate, m.value);
        ceilings = { ...ceilings, ...c.value };
        if (parsed.tools !== undefined) tools = t.value;
        if (parsed.screen) screen = { ...screen, ...parsed.screen };
        file = candidate;
        sources.push(`file ${candidate}`);
      } catch (err) {
        warnings.push(`the operator policy file ${candidate} was ignored (${err.message}); the built-in defaults apply`);
      }
    }
  }

  // ── the environment (both modes) ──────────────────────────────────────────
  const envDial = (name, path) => {
    const value = env[name];
    if (value === undefined || value === '') return;
    const dial = MANDATE_DIALS[path];
    if (!dial.levels.includes(value)) { warnings.push(`${name}=${value} is not one of ${dial.levels.join(', ')} and was ignored`); return; }
    mandate = overlay(mandate, expand(path, value));
    sources.push(`env ${name}`);
  };
  envDial('COMPANY_DRAFTING_THEMES', 'drafting.themes');
  envDial('COMPANY_PUBLISHING_AUDIENCE', 'publishing.audience');

  const envCeilings = {
    maxAgents: 'COMPANY_MAX_AGENTS', maxTurns: 'COMPANY_MAX_TURNS', tokenLimit: 'COMPANY_TOKEN_LIMIT', spendLimitUsd: 'COMPANY_SPEND_LIMIT_USD',
    maxScreenStrikes: 'COMPANY_MAX_SCREEN_STRIKES', maxPendingProposals: 'COMPANY_MAX_PENDING',
  };
  for (const name of CEILING_NAMES) {
    const raw = env[envCeilings[name]];
    const n = numberFromEnv(raw);
    if (n === undefined) continue;
    const check = validateCeilings({ [name]: n });
    if (!check.ok) { warnings.push(`${envCeilings[name]}=${raw} was ignored (${check.errors[0]})`); continue; }
    ceilings[name] = n;
    sources.push(`env ${envCeilings[name]}`);
  }

  if (env.COMPANY_TOOLS !== undefined && env.COMPANY_TOOLS !== '') {
    const list = String(env.COMPANY_TOOLS).split(',').map(s => s.trim()).filter(Boolean);
    const t = validateToolList(list);
    if (t.ok) { tools = t.value; sources.push('env COMPANY_TOOLS'); } else warnings.push(`COMPANY_TOOLS was ignored (${t.errors[0]})`);
  }

  if (env.COMPANY_SCREEN_MODEL) { screen = { ...screen, model: env.COMPANY_SCREEN_MODEL }; sources.push('env COMPANY_SCREEN_MODEL'); }

  if (env.COMPANY_SCREEN_DRAFTS === '0') {
    if (hosted) warnings.push('COMPANY_SCREEN_DRAFTS=0 was ignored: a hosted instance always screens drafts');
    else { screen = { ...screen, drafts: false }; warnings.push('drafts are NOT screened on this install (COMPANY_SCREEN_DRAFTS=0); the prompt layer and the model service\'s filters are all that stand between a draft and the room'); }
  }
  if (!hosted && screen.drafts === false && !warnings.some(w => w.startsWith('drafts are NOT screened'))) {
    warnings.push('drafts are NOT screened on this install (the operator policy file says so); the prompt layer and the model service\'s filters are all that stand between a draft and the room');
  }
  if (hosted && screen.drafts === false) screen = { ...screen, drafts: true };

  assertOperatorMandate(mandate);

  // Frozen all the way down: nothing that holds the operator's policy can edit it
  const operator = {
    hosted,
    mandate: deepFreeze(mandate),
    ceilings: deepFreeze(ceilings),
    tools: deepFreeze(tools),
    screen: deepFreeze(screen),
    file,
    warnings: deepFreeze(warnings),
    sources: deepFreeze(sources),
  };
  operator.snapshot = () => ({
    hosted, mandate: clone(mandate), ceilings: clone(ceilings), tools: [...tools], screen: { ...screen }, file, warnings: [...warnings], sources: [...sources],
    fixed: 'The hard limits, the publishing floor, human approval of every publication and the AI-generated label are not settings; nothing here can change them.',
  });
  return Object.freeze(operator);
}

function expand(dotted, value) {
  return setPath({}, dotted, value);
}

/** Replace the dials `patch` names, keep the rest. */
function overlay(base, patch) {
  const out = clone(base);
  for (const [stage, body] of Object.entries(patch)) for (const [k, v] of Object.entries(body)) out[stage][k] = v;
  return out;
}
