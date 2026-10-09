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
import { MODELS, AGENT_MODEL_IDS } from '../config/models.js';

export const OPERATOR_FILE_NAME = 'operator-policy.json';

/**
 * The models a company's agents may run on. Locally all three the registry offers; hosted, the two that cost what a company can plan
 * around (a red-team run found the cheapest model gave way to attacks 5.6% of the time against 0.4% for Flash, 0.2% with the safety layer on
 * all three, so the layer closes most of the gap and an operator who wants fewer misses can leave the cheap one out).
 */
export const DEFAULT_LOCAL_MODELS = Object.freeze([...AGENT_MODEL_IDS]);
export const DEFAULT_HOSTED_MODELS = Object.freeze([MODELS.FAST, MODELS.SMART]);

/** @returns {{ ok: boolean, value?: string[], errors: string[] }} a non-empty list of models the registry offers, each once */
export function validateModelList(list) {
  if (list === undefined) return { ok: true, value: undefined, errors: [] };
  if (!Array.isArray(list) || !list.length) return { ok: false, errors: ['models must be a non-empty list of model ids'] };
  const unknown = list.filter(m => !AGENT_MODEL_IDS.includes(m));
  if (unknown.length) return { ok: false, errors: [`unknown model(s): ${unknown.map(String).join(', ')} (known: ${AGENT_MODEL_IDS.join(', ')})`] };
  return { ok: true, value: [...new Set(list)], errors: [] };
}

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
  let hall = { enabled: true };
  let flow = { enabled: true, maxPeople: 32, maxSpendUsd: 8 };
  let models = [...(hosted ? DEFAULT_HOSTED_MODELS : DEFAULT_LOCAL_MODELS)];
  let file = null;

  // ── the file (local installs only) ────────────────────────────────────────
  if (!hosted) {
    const candidate = env.COMPANY_OPERATOR_POLICY ? path.resolve(env.COMPANY_OPERATOR_POLICY) : path.join(dataDir, OPERATOR_FILE_NAME);
    if (exists(candidate)) {
      try {
        const parsed = JSON.parse(readFile(candidate));
        if (!isPlainObject(parsed)) throw new Error('it must be a JSON object');
        const known = ['mandate', 'ceilings', 'tools', 'screen', 'hall', 'flow', 'models'];
        const stray = Object.keys(parsed).filter(k => !known.includes(k));
        if (stray.length) throw new Error(`unknown section(s): ${stray.join(', ')}`);

        const m = validateMandate(parsed.mandate);
        if (!m.ok) throw new Error(m.errors.join('; '));
        const c = validateCeilings(parsed.ceilings);
        if (!c.ok) throw new Error(c.errors.join('; '));
        const t = validateToolList(parsed.tools);
        if (!t.ok) throw new Error(t.errors.join('; '));
        const mo = validateModelList(parsed.models);
        if (!mo.ok) throw new Error(mo.errors.join('; '));
        if (parsed.screen !== undefined) {
          if (!isPlainObject(parsed.screen) || Object.keys(parsed.screen).some(k => !['drafts', 'model'].includes(k))) throw new Error('screen takes only "drafts" and "model"');
          if (parsed.screen.drafts !== undefined && typeof parsed.screen.drafts !== 'boolean') throw new Error('screen.drafts must be true or false');
          if (parsed.screen.model !== undefined && typeof parsed.screen.model !== 'string') throw new Error('screen.model must be a model id');
        }

        // The operator moves the dials freely (that is what the operator is for): what it names replaces the default.
        mandate = overlay(mandate, m.value);
        ceilings = { ...ceilings, ...c.value };
        if (parsed.tools !== undefined) tools = t.value;
        if (mo.value) models = mo.value;
        if (parsed.screen) screen = { ...screen, ...parsed.screen };
        if (parsed.flow !== undefined) {
          const f = parsed.flow;
          const ok = isPlainObject(f) && Object.keys(f).every(k => ['enabled', 'maxPeople', 'maxSpendUsd'].includes(k))
            && (f.enabled === undefined || typeof f.enabled === 'boolean')
            && (f.maxPeople === undefined || (Number.isInteger(f.maxPeople) && f.maxPeople >= 1 && f.maxPeople <= 200))
            && (f.maxSpendUsd === undefined || (typeof f.maxSpendUsd === 'number' && f.maxSpendUsd >= 0 && f.maxSpendUsd <= 1000));
          if (!ok) throw new Error('flow takes only "enabled" (true or false), "maxPeople" (1 to 200) and "maxSpendUsd" (0 to 1000)');
          flow = { ...flow, ...f };
        }
        if (parsed.hall !== undefined) {
          if (!isPlainObject(parsed.hall) || Object.keys(parsed.hall).some(k => k !== 'enabled') || typeof parsed.hall.enabled !== 'boolean') throw new Error('hall takes only "enabled": true or false');
          hall = { enabled: parsed.hall.enabled };
        }
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
    maxMessagesPerPerson: 'COMPANY_MAX_MESSAGES', maxWorkspaceWritesPerPerson: 'COMPANY_MAX_WORKSPACE_WRITES',
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

  if (env.COMPANY_MODELS !== undefined && env.COMPANY_MODELS !== '') {
    const list = String(env.COMPANY_MODELS).split(',').map(s => s.trim()).filter(Boolean);
    const mo = validateModelList(list);
    if (mo.ok) { models = mo.value; sources.push('env COMPANY_MODELS'); } else warnings.push(`COMPANY_MODELS was ignored (${mo.errors[0]})`);
  }

  if (env.COMPANY_HALL === '0') { hall = { enabled: false }; sources.push('env COMPANY_HALL'); }
  if (env.COMPANY_FLOW === '0') { flow = { ...flow, enabled: false }; sources.push('env COMPANY_FLOW'); }
  for (const [name, key, lo, hi, whole] of [['COMPANY_FLOW_MAX_PEOPLE', 'maxPeople', 1, 200, true], ['COMPANY_FLOW_MAX_SPEND_USD', 'maxSpendUsd', 0, 1000, false]]) {
    const n = numberFromEnv(env[name]);
    if (n === undefined) continue;
    if (!Number.isFinite(n) || n < lo || n > hi || (whole && !Number.isInteger(n))) { warnings.push(`${name}=${env[name]} was ignored (it must be ${whole ? 'a whole number ' : 'a number '}from ${lo} to ${hi})`); continue; }
    flow = { ...flow, [key]: n };
    sources.push(`env ${name}`);
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
    hall: deepFreeze(hall),
    flow: deepFreeze(flow),
    models: deepFreeze(models),
    file,
    warnings: deepFreeze(warnings),
    sources: deepFreeze(sources),
  };
  operator.snapshot = () => ({
    hosted, mandate: clone(mandate), ceilings: clone(ceilings), tools: [...tools], screen: { ...screen }, hall: { ...hall }, flow: { ...flow }, models: [...models], file, warnings: [...warnings], sources: [...sources],
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
