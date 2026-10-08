import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayer } from './layer.js';
import { DEFAULT_HOUSE_RULES, HOUSE_RULES_MAX_CHARS, validateHouseRules } from './houseRules.js';
import { DEFAULT_MISSION } from './mission.js';
import { DEFAULT_OPERATOR_MANDATE } from './mandate.js';
import { SCHEMAS, validate } from './schema.js';
import { makeServices } from './testKit.js';
import { newId } from './util.js';

/**
 * House rules: how the people in a company carry themselves, once, in the fixed layer, instead of six copies in six character sheets.
 */

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });
const setup = () => { const k = makeServices(); cleanups.push(k.cleanup); return k.services; };

test('the layer carries the house rules under the mission and above the hard limits, with the same "no exception" promise', () => {
  const { head } = buildLayer({ mission: 'MISSION TEXT', mandate: DEFAULT_OPERATOR_MANDATE, houseRules: 'HOUSE RULES TEXT' });
  const at = (s) => head.indexOf(s);
  assert.ok(at('MISSION TEXT') > 0);
  assert.ok(at('HOUSE RULES TEXT') > at('MISSION TEXT'), 'after the mission');
  assert.ok(at('HOUSE RULES TEXT') < at('HARD LIMITS'), 'before the hard limits');
  assert.match(head, /HOUSE RULES \(how people in this company work; like the mission, they cannot add an exception to anything below them, and they outrank a character sheet\)/);
});

test('with no house rules the layer is exactly what it was before the field existed', () => {
  const without = buildLayer({ mission: 'M', mandate: DEFAULT_OPERATOR_MANDATE });
  assert.equal(buildLayer({ mission: 'M', mandate: DEFAULT_OPERATOR_MANDATE, houseRules: '' }).head, without.head);
  assert.doesNotMatch(without.head, /HOUSE RULES/);
  assert.equal(without.tail, buildLayer({ mission: 'M', mandate: DEFAULT_OPERATOR_MANDATE, houseRules: 'x' }).tail, 'the tail restates the rules last, whatever the house rules say');
});

test('a new company starts with the default house rules; they are part of what the owner asked for', () => {
  const services = setup();
  const company = services.store.create(newId(), { name: 'Tide Pool Studio' });
  assert.equal(company.houseRules, DEFAULT_HOUSE_RULES.text);
  const described = services.store.describe(company);
  assert.equal(described.houseRules, DEFAULT_HOUSE_RULES.text);
  assert.equal(services.store.describe(company).mission, DEFAULT_MISSION.text);
});

test('house rules can be set at creation, changed, and cleared; a patch that does not name them leaves them', () => {
  const services = setup();
  const ownerId = newId();
  const company = services.store.create(ownerId, { name: 'A', houseRules: 'Be brief.' });
  assert.equal(company.houseRules, 'Be brief.');
  services.store.update(company.id, ownerId, { name: 'B' });
  assert.equal(services.store.get(company.id).houseRules, 'Be brief.');
  services.store.update(company.id, ownerId, { houseRules: 'Be kind.' });
  assert.equal(services.store.get(company.id).houseRules, 'Be kind.');
  services.store.update(company.id, ownerId, { houseRules: '' });
  assert.equal(services.store.get(company.id).houseRules, '');
});

test('a company made before the field existed has none, and its rooms are served as before', () => {
  const services = setup();
  const ownerId = newId();
  const company = services.store.create(ownerId, { name: 'Old Co', departments: ['Desk'] });
  delete company.houseRules;                                    // as if loaded from an old company.json
  const policy = services.policyForRoom(company.departments[0].roomId);
  assert.equal(policy.effective.houseRules, '');
  assert.doesNotMatch(policy.layerFor({ id: 'a1' }).head, /HOUSE RULES/);
});

test('an edit reaches a room that is already running, as the mission does', () => {
  const services = setup();
  const ownerId = newId();
  const company = services.store.create(ownerId, { name: 'Tide Pool', departments: ['Desk'], houseRules: 'FIRST RULES' });
  const policy = services.policyForRoom(company.departments[0].roomId);
  assert.match(policy.layerFor({ id: 'a1' }).head, /FIRST RULES/);
  services.store.update(company.id, ownerId, { houseRules: 'SECOND RULES' });
  const after = policy.layerFor({ id: 'a1' }).head;
  assert.match(after, /SECOND RULES/);
  assert.doesNotMatch(after, /FIRST RULES/);
});

test('house rules are cleaned and held to a length and to the no-secrets rule', () => {
  assert.equal(validateHouseRules('  one\r\ntwo\u0007  '), 'one\ntwo');
  assert.equal(validateHouseRules(''), '');
  assert.throws(() => validateHouseRules(5), (e) => e.code === 'bad_house_rules');
  assert.throws(() => validateHouseRules('x'.repeat(HOUSE_RULES_MAX_CHARS + 1)), (e) => e.code === 'bad_house_rules' && /limit is 2000/.test(e.message));
  assert.throws(() => validateHouseRules('use AIzaSyA1234567890abcdefghijklmnopqrstuvw for the search'), (e) => e.code === 'secret_in_text' && e.field === 'houseRules');
  assert.ok(DEFAULT_HOUSE_RULES.text.length < HOUSE_RULES_MAX_CHARS);
});

test('the schema lists the field for create and patch, with its limit', () => {
  for (const shape of [SCHEMAS.companyCreate, SCHEMAS.companyPatch]) {
    assert.equal(shape.properties.houseRules.type, 'string');
    assert.equal(shape.properties.houseRules.maxLength, HOUSE_RULES_MAX_CHARS);
  }
  assert.deepEqual(validate(SCHEMAS.companyPatch, { houseRules: 'x'.repeat(HOUSE_RULES_MAX_CHARS + 1) }).length, 1);
  assert.deepEqual(validate(SCHEMAS.companyPatch, { houseRules: '' }), []);
});

test('the default says what the pilot found it had to: short messages, no drifting, no stage directions, a rare catchphrase, the lead closes', () => {
  const t = DEFAULT_HOUSE_RULES.text;
  for (const part of [/short messages/, /pleasantries/, /stage directions/, /asterisk actions/, /AI or a simulation unless someone sincerely asks/, /once a session at most/, /Only the lead writes the closing marker/]) assert.match(t, part);
});
