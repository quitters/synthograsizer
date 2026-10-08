import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { COLLABORATION_FEATURES, DEFAULT_COLLABORATION, FEATURE_TOOL, HALL_TOOL_NAMES, resolveCollaboration, validateCollaboration } from './collaboration.js';
import { loadOperator } from './operator.js';
import { SCHEMAS, validate } from './schema.js';
import { makeServices, tempDir } from './testKit.js';
import { newId } from './util.js';
import { CEILING_FIELDS, DEFAULT_OPERATOR_CEILINGS } from './ceilings.js';

/** Which parts of the Hall a company has open: the company's switches, the operator's master switch, and the two ceilings that bound how much people write. */

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });
const setup = (env = {}) => { const k = makeServices({ env }); cleanups.push(k.cleanup); return k.services; };

test('the features and the tools they open', () => {
  assert.deepEqual([...COLLABORATION_FEATURES], ['mail', 'forums', 'workspace', 'board', 'norms']);
  assert.deepEqual(Object.keys(DEFAULT_COLLABORATION), [...COLLABORATION_FEATURES]);
  assert.ok(Object.values(DEFAULT_COLLABORATION).every(v => v === true));
  assert.deepEqual([...HALL_TOOL_NAMES].sort(), ['board', 'forum', 'mailbox', 'propose_norm', 'workspace']);
  assert.equal(FEATURE_TOOL.forums, 'forum');
});

test('switches are validated: booleans, known names, a clear message for each mistake', () => {
  assert.deepEqual(validateCollaboration({ mail: false, board: true }), { ok: true, value: { mail: false, board: true }, errors: [] });
  assert.deepEqual(validateCollaboration(undefined), { ok: true, value: {}, errors: [] });
  const r = validateCollaboration({ mail: 'yes', telepathy: true });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ['collaboration.mail must be true or false', 'collaboration.telepathy is not a feature (features: mail, forums, workspace, board, norms)']);
  assert.equal(validateCollaboration([true]).ok, false);
});

test('a feature is open only when the operator has the Hall on and the company asked for it', () => {
  assert.deepEqual(resolveCollaboration({ enabled: true }, { mail: true, forums: false }).effective, { mail: true, forums: false, workspace: false, board: false, norms: false });
  const off = resolveCollaboration({ enabled: false }, DEFAULT_COLLABORATION);
  assert.ok(Object.values(off.effective).every(v => v === false));
  assert.deepEqual(off.clamped, [...COLLABORATION_FEATURES], 'the answer says what the operator kept closed');
  assert.deepEqual(resolveCollaboration({ enabled: true }, {}).clamped, []);
});

test('a new company starts with the whole Hall open; a patch names the switches it changes and keeps the rest', () => {
  const services = setup();
  const ownerId = newId();
  const company = services.store.create(ownerId, { name: 'Open Co' });
  assert.deepEqual(company.collaboration, DEFAULT_COLLABORATION);
  assert.deepEqual(services.store.describe(company).effective.collaboration, DEFAULT_COLLABORATION);

  services.store.update(company.id, ownerId, { collaboration: { forums: false } });
  assert.deepEqual(services.store.get(company.id).collaboration, { ...DEFAULT_COLLABORATION, forums: false });
  services.store.update(company.id, ownerId, { name: 'Renamed' });
  assert.equal(services.store.get(company.id).collaboration.forums, false, 'a patch that does not name them leaves them');

  const some = services.store.create(ownerId, { name: 'Closed Co', collaboration: { mail: false } });
  assert.deepEqual(some.collaboration, { ...DEFAULT_COLLABORATION, mail: false });
  assert.throws(() => services.store.create(ownerId, { name: 'Bad', collaboration: { mail: 'on' } }), (e) => e.status === 400 && e.field === 'collaboration');
});

test('a company made before the Hall existed has none of it open, and is served as before', () => {
  const services = setup();
  const ownerId = newId();
  const company = services.store.create(ownerId, { name: 'Old Co' });
  delete company.collaboration;
  const eff = services.store.describe(company).effective.collaboration;
  assert.ok(Object.values(eff).every(v => v === false));
});

test('the operator\'s master switch closes the Hall for every company, and says so in the answer', () => {
  const services = setup({ COMPANY_HALL: '0' });
  assert.equal(services.operator.hall.enabled, false);
  const ownerId = newId();
  const company = services.store.create(ownerId, { name: 'Closed By Operator' });
  assert.deepEqual(company.collaboration, DEFAULT_COLLABORATION, 'what the owner asked for is kept');
  const described = services.store.describe(company);
  assert.ok(Object.values(described.effective.collaboration).every(v => v === false), 'what applies is closed');
  assert.deepEqual(described.clamped.collaboration, [...COLLABORATION_FEATURES]);
  assert.equal(services.operator.snapshot().hall.enabled, false);
});

test('the operator\'s file can close the Hall too; a bad "hall" section is ignored whole, with a warning', () => {
  const dir = tempDir();
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'operator-policy.json');
  fs.writeFileSync(file, JSON.stringify({ hall: { enabled: false } }));
  assert.equal(loadOperator({ env: {}, dataDir: dir }).hall.enabled, false);
  fs.writeFileSync(file, JSON.stringify({ hall: { enabled: 'no' } }));
  const op = loadOperator({ env: {}, dataDir: dir });
  assert.equal(op.hall.enabled, true, 'the built-in default applies');
  assert.match(op.warnings[0], /hall takes only "enabled"/);
  fs.writeFileSync(file, JSON.stringify({ hall: { enabled: false, extra: 1 } }));
  assert.match(loadOperator({ env: {}, dataDir: dir }).warnings[0], /hall takes only/);
});

test('the Hall\'s two ceilings can be lowered by a request and never raised past the operator\'s', () => {
  assert.equal(CEILING_FIELDS.maxMessagesPerPerson.max, 500);
  assert.equal(DEFAULT_OPERATOR_CEILINGS.maxMessagesPerPerson, 30);
  assert.equal(DEFAULT_OPERATOR_CEILINGS.maxWorkspaceWritesPerPerson, 20);
  const services = setup({ COMPANY_MAX_MESSAGES: '10' });
  assert.equal(services.operator.ceilings.maxMessagesPerPerson, 10);
  const ownerId = newId();
  const c = services.store.create(ownerId, { name: 'Chatty', ceilings: { maxMessagesPerPerson: 50, maxWorkspaceWritesPerPerson: 5 } });
  const d = services.store.describe(c);
  assert.equal(d.effective.ceilings.maxMessagesPerPerson, 10, 'clamped to the operator\'s');
  assert.equal(d.effective.ceilings.maxWorkspaceWritesPerPerson, 5, 'lowered as asked');
  assert.deepEqual(d.clamped.ceilings, [{ name: 'maxMessagesPerPerson', requested: 50, effective: 10 }]);
});

test('the schema lists the switches for create and patch', () => {
  for (const shape of [SCHEMAS.companyCreate, SCHEMAS.companyPatch]) {
    assert.deepEqual(Object.keys(shape.properties.collaboration.properties), [...COLLABORATION_FEATURES]);
    assert.equal(shape.properties.collaboration.additionalProperties, false);
  }
  assert.deepEqual(validate(SCHEMAS.companyPatch, { collaboration: { mail: false } }), []);
  assert.equal(validate(SCHEMAS.companyPatch, { collaboration: { mail: 1 } }).length, 1);
  assert.equal(validate(SCHEMAS.companyPatch, { collaboration: { nope: true } }).length, 1);
});
