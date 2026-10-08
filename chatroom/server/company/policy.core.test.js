import test from 'node:test';
import assert from 'node:assert/strict';
import { HARD_LIMITS, PUBLISHING_FLOOR, HARD_LIMIT_IDS, PUBLISHING_FLOOR_IDS, isHardLimit } from './hardLimits.js';
import {
  MANDATE_DIALS, DEFAULT_OPERATOR_MANDATE, DIAL_PATHS, validateMandate, resolveMandate, isAtLeastAsStrict, strictness, mandateScreenRules,
} from './mandate.js';
import { CEILING_FIELDS, CEILING_NAMES, DEFAULT_OPERATOR_CEILINGS, validateCeilings, resolveCeilings } from './ceilings.js';
import {
  KNOWN_TOOLS, DEFAULT_COMPANY_GRANT, DEFAULT_OPERATOR_TOOLS, DEFAULT_AGENT_TIER, validateToolList, resolveToolGrant, tierFitsGrant, checkAgentTier, tiersThatFit,
} from './toolGrants.js';
import { scanForSecrets, assertNoSecrets, redactSecrets } from './secrets.js';
import { DEFAULT_MISSION, validateMission, MISSION_MAX_CHARS } from './mission.js';
import { getPath, clone } from './util.js';
import { PolicyError } from './errors.js';
import { TOOL_TIERS } from '../config/tools.js';
import { textCostUsd, toolCostUsd, pricingFor } from './spend.js';
import { MODEL_PRICING_USD_PER_M, MODELS } from '../config/models.js';

// ── hard limits ──────────────────────────────────────────────────────────────

test('the six hard limits and the two publishing-floor rules are exactly these (dropping or renaming one fails the build)', () => {
  assert.deepEqual([...HARD_LIMIT_IDS], ['minors_sexual', 'real_person', 'deception', 'private_info', 'harassment_hate', 'serious_harm']);
  assert.deepEqual([...PUBLISHING_FLOOR_IDS], ['copyrighted_character', 'living_artist_style']);
  for (const l of [...HARD_LIMITS, ...PUBLISHING_FLOOR]) {
    assert.ok(l.rule.length > 20 && l.check.length > 40 && l.title, `${l.id} has a rule, a check and a title`);
    assert.ok(/NOT/.test(l.check), `${l.id} says what is NOT a violation, so fiction is not flagged for being dark`);
  }
  assert.ok(isHardLimit('deception') && !isHardLimit('copyrighted_character'));
});

test('the hard limits are frozen all the way down: nothing can edit a rule at run time', () => {
  assert.throws(() => { HARD_LIMITS.pop(); }, TypeError);
  assert.throws(() => { HARD_LIMITS.push({ id: 'x' }); }, TypeError);
  assert.throws(() => { HARD_LIMITS[0].rule = 'Anything goes.'; }, TypeError);
  assert.throws(() => { PUBLISHING_FLOOR[0].check = ''; }, TypeError);
  assert.throws(() => { MANDATE_DIALS['drafting.themes'].levels.push('anything'); }, TypeError);
  assert.throws(() => { CEILING_FIELDS.maxAgents.max = 9999; }, TypeError);
  assert.throws(() => { DEFAULT_OPERATOR_MANDATE.drafting.themes = 'explore'; }, TypeError);
});

// ── the mandate: tighten, never loosen ───────────────────────────────────────

test('the operator default is permissive in drafting and stricter in publishing', () => {
  assert.equal(getPath(DEFAULT_OPERATOR_MANDATE, 'drafting.themes'), 'explore');
  assert.equal(getPath(DEFAULT_OPERATOR_MANDATE, 'publishing.audience'), 'teen');
  assert.ok(strictness('publishing.audience', 'teen') > 0, 'publishing is not at its most permissive');
});

test('mandate merge: for every operator value and every request, the result is never looser than the operator\'s (all combinations)', () => {
  for (const path of DIAL_PATHS) {
    const { levels } = MANDATE_DIALS[path];
    for (const op of levels) {
      for (const req of levels) {
        const operator = clone(DEFAULT_OPERATOR_MANDATE);
        const [stage, key] = path.split('.');
        operator[stage][key] = op;
        const { effective, clamped } = resolveMandate(operator, { [stage]: { [key]: req } });
        const got = effective[stage][key];
        assert.ok(strictness(path, got) >= strictness(path, op), `${path}: operator ${op}, request ${req} gave ${got}, which is looser than the operator`);
        assert.equal(got, strictness(path, req) >= strictness(path, op) ? req : op, 'the stricter of the two wins');
        assert.equal(clamped.length, strictness(path, req) < strictness(path, op) ? 1 : 0, 'a loosening request is reported, not silently applied');
        assert.ok(isAtLeastAsStrict(effective, operator));
      }
    }
  }
});

test('mandate merge: a clamp says what was asked and what applies', () => {
  const { effective, clamped } = resolveMandate(DEFAULT_OPERATOR_MANDATE, { publishing: { audience: 'mature' }, drafting: { themes: 'avoid' } });
  assert.equal(effective.publishing.audience, 'teen');
  assert.equal(effective.drafting.themes, 'avoid');
  assert.deepEqual(clamped, [{ path: 'publishing.audience', requested: 'mature', effective: 'teen' }]);
});

test('mandate validation refuses unknown dials and names the fixed things instead of ignoring them', () => {
  const bad = [
    { publishing: { humanApproval: false } },
    { publishing: { requireHumanApproval: false } },
    { publishing: { autoPublish: true } },
    { publishing: { labelAiGenerated: false } },
    { hardLimits: [] },
    { screen: 'off' },
    { drafting: { hardLimits: 'off' } },
    { drafting: { themes: 'anything-goes' } },
    { drafting: { themes: 'EXPLORE' } },
    { publishing: { rating: 'x' } },
    { rogue: {} },
    'explore',
    [],
  ];
  for (const input of bad) {
    const r = validateMandate(input);
    assert.equal(r.ok, false, `${JSON.stringify(input)} should be refused`);
    assert.ok(r.errors.length > 0);
  }
  const fixed = validateMandate({ publishing: { humanApproval: false } });
  assert.match(fixed.errors[0], /fixed by the safety floor/);
  assert.deepEqual(validateMandate(undefined), { ok: true, value: {}, errors: [] });
  assert.deepEqual(validateMandate({ drafting: { themes: 'careful' } }).value, { drafting: { themes: 'careful' } });
});

test('the screen is told about the mandate only where the mandate adds something', () => {
  assert.deepEqual(mandateScreenRules({ drafting: { themes: 'explore' }, publishing: { audience: 'teen' } }, 'drafting'), []);
  assert.equal(mandateScreenRules({ drafting: { themes: 'avoid' }, publishing: { audience: 'teen' } }, 'drafting')[0].id, 'theme_exceeds_mandate');
  assert.equal(mandateScreenRules({ drafting: { themes: 'explore' }, publishing: { audience: 'general' } }, 'publishing')[0].id, 'audience_exceeded');
});

// ── ceilings ─────────────────────────────────────────────────────────────────

test('ceilings: a request lowers a cap and never raises it (every field, below, at and above the operator value)', () => {
  for (const name of CEILING_NAMES) {
    const op = DEFAULT_OPERATOR_CEILINGS[name];
    for (const want of [CEILING_FIELDS[name].min, Math.max(CEILING_FIELDS[name].min, op - 1), op, op + 1, CEILING_FIELDS[name].max]) {
      const { effective, clamped } = resolveCeilings(DEFAULT_OPERATOR_CEILINGS, { [name]: want });
      assert.ok(effective[name] <= op, `${name}: asked ${want}, got ${effective[name]}, operator ${op}`);
      assert.equal(effective[name], Math.min(want, op));
      assert.equal(clamped.length, want > op ? 1 : 0);
    }
  }
});

test('ceilings: bad numbers and unknown caps are refused', () => {
  for (const input of [{ maxAgents: 0 }, { maxAgents: 2.5 }, { maxAgents: '8' }, { maxAgents: 1e9 }, { spendLimitUsd: -1 }, { tokenLimit: NaN }, { color: 1 }, 5, []]) {
    assert.equal(validateCeilings(input).ok, false, JSON.stringify(input));
  }
  assert.deepEqual(validateCeilings({ maxAgents: 6, spendLimitUsd: 0.5 }).value, { maxAgents: 6, spendLimitUsd: 0.5 });
  assert.equal(DEFAULT_OPERATOR_CEILINGS.maxAgents, 8, 'at most 8 active agents per room by default');
});

// ── tools: least privilege ───────────────────────────────────────────────────

test('a company starts with the research tools, an agent starts with none', () => {
  assert.deepEqual([...DEFAULT_COMPANY_GRANT].sort(), ['google_search', 'url_context']);
  assert.equal(DEFAULT_AGENT_TIER, 'none');
  assert.equal(checkAgentTier(undefined, DEFAULT_COMPANY_GRANT), 'none');
  assert.equal(checkAgentTier('research', DEFAULT_COMPANY_GRANT), 'research');
});

test('a tier is refused until every tool in it has been granted, and the refusal names the missing tools', () => {
  for (const tier of ['visual', 'builder', 'analyst', 'full', 'researcher']) {
    assert.throws(() => checkAgentTier(tier, DEFAULT_COMPANY_GRANT), (e) => e instanceof PolicyError && e.code === 'tier_not_granted' && /not been granted/.test(e.message));
  }
  assert.throws(() => checkAgentTier('analyst', DEFAULT_COMPANY_GRANT), /code_execution/);
  const widened = [...DEFAULT_COMPANY_GRANT, 'code_execution'];
  assert.equal(checkAgentTier('analyst', widened), 'analyst');
  assert.throws(() => checkAgentTier('visual', widened), /generate_image/);
  assert.throws(() => checkAgentTier('nonsense', widened), (e) => e.code === 'bad_tier');
  assert.deepEqual(tiersThatFit(DEFAULT_COMPANY_GRANT).sort(), ['none', 'research']);
});

test('the check is on tool names, so every tier is covered, including ones added later', () => {
  for (const tier of Object.keys(TOOL_TIERS)) {
    assert.equal(tierFitsGrant(tier, TOOL_TIERS[tier]).ok, true, `${tier} fits a grant of exactly its own tools`);
    assert.equal(tierFitsGrant(tier, []).ok, TOOL_TIERS[tier].length === 0, `${tier} fits an empty grant only if it is empty`);
  }
  assert.ok(KNOWN_TOOLS.includes('generate_image') && KNOWN_TOOLS.includes('deep_research'));
  assert.ok(!DEFAULT_OPERATOR_TOOLS.includes('deep_research'), 'deep research costs $1 to $3 a call and is not in the operator default');
});

test('a company can be granted no more than the operator allows', () => {
  const operator = ['google_search', 'url_context', 'write_artifact'];
  const { effective, clamped } = resolveToolGrant(operator, ['google_search', 'generate_image', 'write_artifact']);
  assert.deepEqual(effective, ['google_search', 'write_artifact']);
  assert.deepEqual(clamped, ['generate_image']);
  assert.equal(validateToolList(['google_search', 'telepathy']).ok, false);
  assert.equal(validateToolList('google_search').ok, false);
  assert.deepEqual(validateToolList(['google_search', 'google_search']).value, ['google_search']);
});

// ── secrets ──────────────────────────────────────────────────────────────────

test('secrets: things that look like credentials are refused, ordinary prose is not', () => {
  const fake = {
    'Google API key': 'key is AIza' + 'SyA1234567890abcdefghijklmnopqrstuv',
    'Anthropic API key': 'sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz0123',
    'GitHub token': 'ghp_' + 'abcdefghijklmnopqrstuvwxyz0123456789',
    'AWS access key id': 'AKIA' + 'ABCDEFGHIJKLMNOP',
    'private key block': '-----BEGIN RSA PRIVATE KEY-----',
    'JSON web token': 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk',
    'credential assignment': 'password = Hunter2Hunter2Hunter2',
  };
  for (const [kind, text] of Object.entries(fake)) {
    const found = scanForSecrets(`Some notes. ${text}. More notes.`);
    assert.ok(found.some(f => f.kind === kind), `${kind} is recognised`);
    assert.ok(!JSON.stringify(found).includes('Hunter2') && !JSON.stringify(found).includes('abcdefghijklmnop'), 'the finding never echoes the secret');
    assert.throws(() => assertNoSecrets(text, 'The character sheet', 'bio'), (e) => e.code === 'secret_in_text' && !e.message.includes(text));
    assert.ok(!redactSecrets(text).includes(text.slice(-12)), `${kind} is redacted`);
  }
  for (const prose of [
    'Born in Osaka in 1979, she keeps a token of her grandmother: a brass key.', 'The password to the story is that there is none.',
    'Tokens: about 1000000 of them.', 'He asked the secret keeper for the key to the library.', 'sk-8 is a bad ski run', '',
  ]) assert.deepEqual(scanForSecrets(prose), [], prose);
});

// ── the mission ──────────────────────────────────────────────────────────────

test('the default mission is built on the five humanist values and fits the limit', () => {
  for (const v of ['Dignity', 'Consent', 'Honesty', 'Care for the audience', 'Creative freedom with accountability']) assert.ok(DEFAULT_MISSION.text.includes(v), v);
  assert.ok(DEFAULT_MISSION.text.length < MISSION_MAX_CHARS);
  assert.equal(validateMission(DEFAULT_MISSION.text), DEFAULT_MISSION.text);
});

test('a mission must be text of a sane length with no secrets in it; control characters are dropped', () => {
  assert.throws(() => validateMission(42), PolicyError);
  assert.throws(() => validateMission('   '), PolicyError);
  assert.throws(() => validateMission('x'.repeat(MISSION_MAX_CHARS + 1)), /limit/);
  assert.throws(() => validateMission('We use AIza' + 'SyA1234567890abcdefghijklmnopqrstuv'), (e) => e.code === 'secret_in_text');
  assert.equal(validateMission('Be kind.\u0000\u0007 Be honest.\r\n'), 'Be kind. Be honest.');
});

// ── spend estimates ──────────────────────────────────────────────────────────

test('spend is estimated from list prices, thinking counts as output, and an unknown model is priced as the dearest', () => {
  const usage = { inputTokens: 1_000_000, outputTokens: 400_000, thoughtTokens: 100_000 };
  assert.equal(textCostUsd(usage, MODELS.FAST).toFixed(4), (0.75 + 0.5 * 3.75).toFixed(4));
  assert.equal(textCostUsd(usage, MODELS.SMART).toFixed(4), (2 + 0.5 * 12).toFixed(4));
  assert.deepEqual(pricingFor('gemini-from-the-future'), MODEL_PRICING_USD_PER_M[MODELS.SMART]);
  assert.equal(textCostUsd(null, MODELS.FAST), 0);
  assert.ok(toolCostUsd('generate_image') > 0 && toolCostUsd('google_search') === 0 && toolCostUsd('deep_research') >= 1);
});
