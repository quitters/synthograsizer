import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CompanyStore, effectivePolicy, MAX_COMPANIES_PER_OWNER, MAX_DEPARTMENTS } from './store.js';
import { loadOperator } from './operator.js';
import { AuditLog } from './audit.js';
import { PolicyError } from './errors.js';
import { DEFAULT_OPERATOR_MANDATE } from './mandate.js';
import { DEFAULT_OPERATOR_CEILINGS } from './ceilings.js';
import { DEFAULT_COMPANY_GRANT, DEFAULT_OPERATOR_TOOLS } from './toolGrants.js';
import { DEFAULT_MISSION } from './mission.js';
import { tempDir } from './testKit.js';
import { newId } from './util.js';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const dir = () => { const d = tempDir(); dirs.push(d); return d; };
const operatorFor = (env = {}, dataDir = dir()) => loadOperator({ env, dataDir });
const owner = () => newId();

// ── the operator ─────────────────────────────────────────────────────────────

test('operator: with nothing configured the built-in defaults apply, drafts are screened and there are no warnings', () => {
  const op = operatorFor();
  assert.deepEqual(op.mandate, DEFAULT_OPERATOR_MANDATE);
  assert.deepEqual(op.ceilings, DEFAULT_OPERATOR_CEILINGS);
  assert.deepEqual([...op.tools], [...DEFAULT_OPERATOR_TOOLS]);
  assert.equal(op.screen.drafts, true);
  assert.equal(op.hosted, false);
  assert.deepEqual([...op.warnings], []);
  assert.throws(() => { op.mandate.drafting.themes = 'avoid'; }, TypeError, 'the operator\'s policy is frozen');
});

test('operator: a local install can move the defaults with a policy file, in either direction', () => {
  const d = dir();
  fs.writeFileSync(path.join(d, 'operator-policy.json'), JSON.stringify({
    mandate: { publishing: { audience: 'mature' }, drafting: { themes: 'careful' } }, ceilings: { maxAgents: 4, spendLimitUsd: 2 }, tools: ['google_search'],
  }));
  const op = loadOperator({ env: {}, dataDir: d });
  assert.equal(op.mandate.publishing.audience, 'mature');
  assert.equal(op.mandate.drafting.themes, 'careful');
  assert.equal(op.ceilings.maxAgents, 4);
  assert.equal(op.ceilings.maxTurns, DEFAULT_OPERATOR_CEILINGS.maxTurns, 'what the file does not name keeps its default');
  assert.deepEqual([...op.tools], ['google_search']);
  assert.match(op.file, /operator-policy\.json$/);
});

test('operator: a file that is not valid is ignored whole, with a warning, and the defaults (not something looser) apply', () => {
  const bad = [
    '{ not json', '[]', '"text"',
    JSON.stringify({ mandate: { publishing: { audience: 'anything' } } }),
    JSON.stringify({ mandate: { publishing: { humanApproval: false } } }),
    JSON.stringify({ ceilings: { maxAgents: 0 } }),
    JSON.stringify({ tools: ['telepathy'] }),
    JSON.stringify({ typo: 1, mandate: { publishing: { audience: 'mature' } } }),
    JSON.stringify({ screen: { drafts: 'no' } }),
    JSON.stringify({ screen: { everything: true } }),
  ];
  for (const text of bad) {
    const d = dir();
    fs.writeFileSync(path.join(d, 'operator-policy.json'), text);
    const op = loadOperator({ env: {}, dataDir: d });
    assert.deepEqual(op.mandate, DEFAULT_OPERATOR_MANDATE, text);
    assert.deepEqual(op.ceilings, DEFAULT_OPERATOR_CEILINGS, text);
    assert.equal(op.file, null, text);
    assert.match(op.warnings[0], /was ignored/, text);
  }
});

test('operator: a hosted instance reads its policy from the environment alone; a file on disk is never read', () => {
  const d = dir();
  fs.writeFileSync(path.join(d, 'operator-policy.json'), JSON.stringify({ mandate: { publishing: { audience: 'mature' } }, screen: { drafts: false } }));
  for (const env of [{ SYNTH_HOSTED: '1' }, { VERCEL: '1' }]) {
    const op = loadOperator({ env: { ...env, COMPANY_MAX_AGENTS: '3' }, dataDir: d });
    assert.equal(op.hosted, true);
    assert.equal(op.file, null);
    assert.equal(op.mandate.publishing.audience, DEFAULT_OPERATOR_MANDATE.publishing.audience);
    assert.equal(op.screen.drafts, true);
    assert.equal(op.ceilings.maxAgents, 3, 'the environment still applies');
  }
});

test('operator: environment variables set the dials and ceilings; a bad value is ignored with a warning', () => {
  const op = operatorFor({
    COMPANY_DRAFTING_THEMES: 'avoid', COMPANY_PUBLISHING_AUDIENCE: 'general', COMPANY_MAX_AGENTS: '5', COMPANY_SPEND_LIMIT_USD: '1.5',
    COMPANY_TOOLS: 'google_search, url_context', COMPANY_SCREEN_MODEL: 'some-model',
  });
  assert.equal(op.mandate.drafting.themes, 'avoid');
  assert.equal(op.mandate.publishing.audience, 'general');
  assert.equal(op.ceilings.maxAgents, 5);
  assert.equal(op.ceilings.spendLimitUsd, 1.5);
  assert.deepEqual([...op.tools], ['google_search', 'url_context']);
  assert.equal(op.screen.model, 'some-model');

  const bad = operatorFor({ COMPANY_DRAFTING_THEMES: 'wild', COMPANY_MAX_AGENTS: 'many', COMPANY_TOOLS: 'telepathy', COMPANY_MAX_TURNS: '-3' });
  assert.deepEqual(bad.mandate, DEFAULT_OPERATOR_MANDATE);
  assert.equal(bad.ceilings.maxAgents, DEFAULT_OPERATOR_CEILINGS.maxAgents);
  assert.equal(bad.ceilings.maxTurns, DEFAULT_OPERATOR_CEILINGS.maxTurns);
  assert.equal(bad.warnings.length, 4);
});

test('operator: turning draft screening off is possible on a local install only, and says so loudly', () => {
  const local = operatorFor({ COMPANY_SCREEN_DRAFTS: '0' });
  assert.equal(local.screen.drafts, false);
  assert.match(local.warnings.join(' '), /drafts are NOT screened/);
  const hosted = operatorFor({ COMPANY_SCREEN_DRAFTS: '0', SYNTH_HOSTED: '1' });
  assert.equal(hosted.screen.drafts, true);
  assert.match(hosted.warnings.join(' '), /always screens drafts/);

  const d = dir();
  fs.writeFileSync(path.join(d, 'operator-policy.json'), JSON.stringify({ screen: { drafts: false } }));
  const viaFile = loadOperator({ env: {}, dataDir: d });
  assert.equal(viaFile.screen.drafts, false);
  assert.match(viaFile.warnings.join(' '), /drafts are NOT screened/);
});

test('operator: the snapshot says what is fixed and carries no secrets', () => {
  const snap = operatorFor({ GEMINI_API_KEY: 'AIza' + 'SyFAKEFAKEFAKEFAKEFAKEFAKEFAKE12345' }).snapshot();
  assert.match(snap.fixed, /hard limits.*not settings/);
  assert.ok(!JSON.stringify(snap).includes('AIza'));
});

// ── companies ────────────────────────────────────────────────────────────────

function makeStore(env = {}) {
  const rootDir = dir();
  const op = loadOperator({ env, dataDir: rootDir });
  return { rootDir, op, store: new CompanyStore({ rootDir, operator: op }) };
}

test('a new company is paused, starts with the default mission, the research tools and no requests of its own', () => {
  const { store } = makeStore();
  const o = owner();
  const c = store.create(o, { name: '  Tide   Pool Studio ' });
  assert.equal(c.name, 'Tide Pool Studio');
  assert.equal(c.state, 'paused');
  assert.equal(c.mission, DEFAULT_MISSION.text);
  assert.deepEqual(c.tools, [...DEFAULT_COMPANY_GRANT]);
  assert.deepEqual(c.mandate, {});
  assert.deepEqual(c.ceilings, {});
  assert.match(c.id, /^[a-f0-9]{32}$/);
  assert.equal(c.ownerId, o);
  const d = store.describe(c);
  assert.equal(d.ownerId, undefined, 'an answer never carries the owner\'s id');
  assert.deepEqual(d.effective.mandate, DEFAULT_OPERATOR_MANDATE);
  assert.deepEqual(d.effective.ceilings, DEFAULT_OPERATOR_CEILINGS);
});

test('departments each get their own room id, and a room id leads back to its company and department', () => {
  const { store } = makeStore();
  const c = store.create(owner(), { name: 'Studio', departments: ['Writers', 'Art Desk'] });
  assert.equal(c.departments.length, 2);
  const [w, a] = c.departments;
  assert.notEqual(w.roomId, a.roomId);
  assert.match(w.roomId, /^[a-f0-9]{32}$/);
  assert.equal(store.roomOwner(w.roomId).company.id, c.id);
  assert.equal(store.roomOwner(a.roomId).department.name, 'Art Desk');
  assert.equal(store.roomOwner(newId()), null);
  const added = store.addDepartment(c.id, c.ownerId, 'Sound');
  assert.equal(store.roomOwner(added.roomId).department.name, 'Sound');
  assert.throws(() => store.addDepartment(c.id, c.ownerId, 'sound'), (e) => e.code === 'department_exists');
});

test('a company is reachable by its owner and by nobody else, and a stranger cannot tell "not yours" from "not there"', () => {
  const { store } = makeStore();
  const a = owner();
  const c = store.create(a, { name: 'Mine' });
  assert.equal(store.getOwned(c.id, a).id, c.id);
  const strangers = [owner(), 'not-an-id', ''];
  for (const who of strangers) {
    assert.throws(() => store.getOwned(c.id, who), (e) => e instanceof PolicyError && e.status === 404 && e.message === 'No such company.');
  }
  assert.throws(() => store.getOwned(newId(), a), (e) => e.status === 404 && e.message === 'No such company.');
  assert.throws(() => store.getOwned('../../etc', a), (e) => e.status === 404);
  assert.deepEqual(store.listFor(owner()), []);
  assert.equal(store.listFor(a).length, 1);
  for (const call of [() => store.update(c.id, owner(), { name: 'x' }), () => store.setState(c.id, owner(), 'active'), () => store.addDepartment(c.id, owner(), 'x'), () => store.remove(c.id, owner())]) {
    assert.throws(call, (e) => e.status === 404);
  }
});

test('what a company asks for is held to the operator\'s policy, and the answer says what was clamped', () => {
  const { store } = makeStore();
  const c = store.create(owner(), {
    name: 'Ambitious',
    mandate: { publishing: { audience: 'mature' }, drafting: { themes: 'avoid' } },
    ceilings: { maxAgents: 50, maxTurns: 20 },
    tools: ['google_search', 'generate_image'],
  });
  const d = store.describe(c);
  assert.equal(d.effective.mandate.publishing.audience, 'teen', 'looser than the operator: held at the operator\'s');
  assert.equal(d.effective.mandate.drafting.themes, 'avoid', 'stricter than the operator: applied');
  assert.equal(d.effective.ceilings.maxAgents, 8);
  assert.equal(d.effective.ceilings.maxTurns, 20);
  assert.deepEqual(d.clamped.mandate, [{ path: 'publishing.audience', requested: 'mature', effective: 'teen' }]);
  assert.deepEqual(d.clamped.ceilings, [{ name: 'maxAgents', requested: 50, effective: 8 }]);
  assert.deepEqual(d.requested.mandate, { publishing: { audience: 'mature' }, drafting: { themes: 'avoid' } }, 'the request is kept as it was made');
});

test('a hosted instance\'s limits are the operator\'s and every company is held to them', () => {
  const { store } = makeStore({ SYNTH_HOSTED: '1', COMPANY_MAX_AGENTS: '3', COMPANY_TOOLS: 'google_search', COMPANY_PUBLISHING_AUDIENCE: 'general' });
  const c = store.create(owner(), { name: 'Hosted', ceilings: { maxAgents: 8 }, mandate: { publishing: { audience: 'teen' } }, tools: ['google_search', 'url_context', 'generate_image'] });
  const e = store.describe(c).effective;
  assert.equal(e.ceilings.maxAgents, 3);
  assert.equal(e.mandate.publishing.audience, 'general');
  assert.deepEqual(e.tools, ['google_search']);
});

test('when an operator tightens its policy, existing companies tighten with it (only what was requested is stored)', () => {
  const rootDir = dir();
  const loose = loadOperator({ env: {}, dataDir: rootDir });
  const first = new CompanyStore({ rootDir, operator: loose });
  const c = first.create(owner(), { name: 'Old Co', ceilings: { maxAgents: 8 }, tools: ['google_search', 'url_context', 'generate_image'] });
  assert.equal(first.describe(c).effective.ceilings.maxAgents, 8);

  const tight = loadOperator({ env: { COMPANY_MAX_AGENTS: '2', COMPANY_TOOLS: 'google_search', COMPANY_PUBLISHING_AUDIENCE: 'general' }, dataDir: rootDir });
  const second = new CompanyStore({ rootDir, operator: tight });
  const again = second.get(c.id);
  const e = second.describe(again).effective;
  assert.equal(e.ceilings.maxAgents, 2);
  assert.deepEqual(e.tools, ['google_search']);
  assert.equal(e.mandate.publishing.audience, 'general');
});

test('the effective policy is computed from the request and the operator, never stored', () => {
  const { store, rootDir } = makeStore();
  const c = store.create(owner(), { name: 'Plain' });
  const onDisk = JSON.parse(fs.readFileSync(path.join(rootDir, 'companies', c.id, 'company.json'), 'utf8'));
  assert.equal(onDisk.effective, undefined);
  assert.deepEqual(Object.keys(onDisk).sort(), ['ceilings', 'collaboration', 'createdAt', 'departments', 'houseRules', 'id', 'mandate', 'mission', 'name', 'ownerId', 'state', 'tools', 'updatedAt', 'version']);
  const { op } = makeStore();
  assert.deepEqual(effectivePolicy(c, op).ceilings, DEFAULT_OPERATOR_CEILINGS);
});

test('companies persist: a new store on the same folder finds them, their rooms and their state', () => {
  const { store, rootDir, op } = makeStore();
  const o = owner();
  const c = store.create(o, { name: 'Persistent', departments: ['Desk'] });
  store.setState(c.id, o, 'active');
  const reopened = new CompanyStore({ rootDir, operator: op });
  assert.equal(reopened.get(c.id).state, 'active');
  assert.equal(reopened.roomOwner(c.departments[0].roomId).company.id, c.id);
  assert.equal(reopened.listFor(o).length, 1);
});

test('an update sets what it names and keeps the rest, ignores what a company may not set from a request, and changes nothing if any part is bad', () => {
  const { store } = makeStore();
  const o = owner();
  const c = store.create(o, { name: 'Edit Me', mandate: { drafting: { themes: 'careful' } } });
  store.update(c.id, o, { name: 'Edited', mission: 'We make small, honest things.', ceilings: { maxAgents: 4 } });
  assert.equal(store.get(c.id).name, 'Edited');
  assert.equal(store.get(c.id).mission, 'We make small, honest things.');
  assert.deepEqual(store.get(c.id).ceilings, { maxAgents: 4 });
  assert.deepEqual(store.get(c.id).mandate, { drafting: { themes: 'careful' } }, 'what was not named is kept');

  // raising one ceiling must not loosen the others (a patch used to replace the whole object, putting every unnamed ceiling back to the operator's)
  store.update(c.id, o, { ceilings: { maxTurns: 50 }, mandate: { publishing: { audience: 'general' } } });
  assert.deepEqual(store.get(c.id).ceilings, { maxAgents: 4, maxTurns: 50 });
  assert.deepEqual(store.get(c.id).mandate, { drafting: { themes: 'careful' }, publishing: { audience: 'general' } });
  store.update(c.id, o, { ceilings: { maxAgents: 3 }, mandate: { drafting: { themes: 'avoid' } } });
  assert.deepEqual(store.get(c.id).ceilings, { maxAgents: 3, maxTurns: 50 }, 'a named ceiling can still be changed');
  assert.deepEqual(store.get(c.id).mandate, { drafting: { themes: 'avoid' }, publishing: { audience: 'general' } });
  assert.equal(store.describe(store.get(c.id)).effective.ceilings.maxAgents, 3);
  assert.equal(store.describe(store.get(c.id)).effective.ceilings.spendLimitUsd, DEFAULT_OPERATOR_CEILINGS.spendLimitUsd, 'and a ceiling never named is the one the operator set');

  store.update(c.id, o, { state: 'active', ownerId: owner(), id: newId(), departments: [{ name: 'x' }], createdAt: 'then' });
  const now = store.get(c.id);
  assert.equal(now.state, 'paused');
  assert.equal(now.ownerId, o);
  assert.equal(now.departments.length, 0);

  assert.throws(() => store.update(c.id, o, { name: 'Fine', mandate: { publishing: { humanApproval: false } } }), (e) => e.code === 'bad_request');
  assert.equal(store.get(c.id).name, 'Edited', 'a refused update changed nothing');
  assert.throws(() => store.update(c.id, o, { mission: 'key AIza' + 'SyA1234567890abcdefghijklmnopqrstuv' }), (e) => e.code === 'secret_in_text');
});

test('names and caps: a name must be real text without secrets, and there are limits on companies and departments', () => {
  const { store } = makeStore();
  const o = owner();
  for (const name of ['', '   ', 'x'.repeat(81), 7, null, 'key AIza' + 'SyA1234567890abcdefghijklmnopqrstuv']) {
    assert.throws(() => store.create(o, { name }), PolicyError, String(name).slice(0, 20));
  }
  assert.throws(() => store.create(o, {}), (e) => e.field === 'name');
  assert.throws(() => store.create(o, { name: 'S', departments: ['ok', ''] }), PolicyError);
  assert.throws(() => store.create(o, { name: 'S', departments: Array.from({ length: MAX_DEPARTMENTS + 1 }, (_, i) => `d${i}`) }), PolicyError);
  assert.throws(() => store.create('nope', { name: 'S' }), (e) => e.code === 'no_owner');
  for (let i = 0; i < MAX_COMPANIES_PER_OWNER; i++) store.create(o, { name: `Co ${i}` });
  assert.throws(() => store.create(o, { name: 'One too many' }), (e) => e.code === 'company_cap');
  store.create(owner(), { name: 'Someone else is unaffected' });
});

test('deleting a company removes it, its audit log, its publish queue and its rooms\' saved sessions, and its rooms stop leading anywhere', () => {
  const { store, rootDir } = makeStore();
  const o = owner();
  const c = store.create(o, { name: 'Short Lived', departments: ['A', 'B'] });
  const [a] = c.departments;
  fs.mkdirSync(path.join(rootDir, 'rooms', a.roomId, '20261007-120000-x'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'rooms', a.roomId, '20261007-120000-x', 'transcript.jsonl'), '{}');
  new AuditLog({ rootDir }).append(c.id, { type: 'test' });
  fs.mkdirSync(path.join(rootDir, 'companies', c.id, 'publish', 'abc'), { recursive: true });

  const { roomIds } = store.remove(c.id, o);
  assert.equal(roomIds.length, 2);
  assert.ok(!fs.existsSync(path.join(rootDir, 'companies', c.id)));
  assert.ok(!fs.existsSync(path.join(rootDir, 'rooms', a.roomId)));
  assert.equal(store.roomOwner(a.roomId), null);
  assert.throws(() => store.getOwned(c.id, o), (e) => e.status === 404);
});

test('a company folder that cannot be read is skipped, not fatal', () => {
  const { rootDir, op } = makeStore();
  const bad = newId();
  fs.mkdirSync(path.join(rootDir, 'companies', bad), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'companies', bad, 'company.json'), '{ torn');
  fs.mkdirSync(path.join(rootDir, 'companies', 'not-an-id'), { recursive: true });
  const store = new CompanyStore({ rootDir, operator: op });
  assert.equal(store.get(bad), null);
});

test('a company file holding anything but ids where ids are used to build paths is skipped, never trusted (deleting a company removes folders)', () => {
  const { store, rootDir, op } = makeStore();
  const o = owner();
  const c = store.create(o, { name: 'Tampered', departments: ['Desk'] });
  const file = path.join(rootDir, 'companies', c.id, 'company.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  doc.departments[0].roomId = '../../../important';
  fs.writeFileSync(file, JSON.stringify(doc));
  const reopened = new CompanyStore({ rootDir, operator: op });
  assert.equal(reopened.get(c.id), null, 'skipped');
  assert.equal(reopened.roomOwner('../../../important'), null);
});

// ── the audit log ────────────────────────────────────────────────────────────

test('the audit log appends decisions in order, filters, limits, and survives a torn last line', () => {
  const rootDir = dir();
  let n = 0;
  const log = new AuditLog({ rootDir, now: () => new Date(Date.UTC(2026, 9, 7, 12, 0, n++)) });
  const id = newId();
  log.append(id, { type: 'a', n: 1 });
  log.append(id, { type: 'b', n: 2 });
  log.append(id, { type: 'a', n: 3 });
  assert.deepEqual(log.read(id).map(e => e.n), [1, 2, 3]);
  assert.deepEqual(log.read(id, { type: 'a' }).map(e => e.n), [1, 3]);
  assert.deepEqual(log.read(id, { limit: 2 }).map(e => e.n), [2, 3]);
  assert.match(log.read(id)[0].ts, /^2026-10-07T12:00:00/);
  fs.appendFileSync(path.join(rootDir, 'companies', id, 'audit.jsonl'), '{"type":"torn"');
  assert.equal(log.read(id).length, 3);
  assert.deepEqual(log.read(newId()), []);
  assert.throws(() => log.append('not-an-id', { type: 'x' }));
});

test('the audit log keeps decisions and drops content: fields that mean "the text itself" never reach the file, and long strings are cut', () => {
  const rootDir = dir();
  const log = new AuditLog({ rootDir });
  const id = newId();
  log.append(id, { type: 'turn_withheld', agent: 'Ann', rules: ['deception'], text: 'SHOULD-NOT-BE-LOGGED', content: 'NOR-THIS', bio: 'NOR-THIS-ONE', prompt: 'OR-THIS', nested: { message: 'HIDDEN', ok: 1 }, long: 'x'.repeat(1000) });
  const raw = fs.readFileSync(path.join(rootDir, 'companies', id, 'audit.jsonl'), 'utf8');
  for (const s of ['SHOULD-NOT-BE-LOGGED', 'NOR-THIS', 'OR-THIS', 'HIDDEN']) assert.ok(!raw.includes(s), s);
  const e = log.read(id)[0];
  assert.deepEqual(e.rules, ['deception']);
  assert.equal(e.nested.ok, 1);
  assert.ok(e.long.length <= 301);
});

test('two saves in one millisecond still look different, so a running room never keeps the grant an edit just narrowed', () => {
  const rootDir = dir();
  const frozen = new Date('2026-10-08T12:00:00.000Z');
  const store = new CompanyStore({ rootDir, operator: operatorFor({}, rootDir), now: () => frozen });
  const ownerId = owner();
  const company = store.create(ownerId, { name: 'Fast Co', departments: ['Desk'], tools: ['google_search', 'code_execution'] });
  const stamps = [company.updatedAt];
  for (const tools of [['google_search'], []]) { store.update(company.id, ownerId, { tools }); stamps.push(store.getOwned(company.id, ownerId).updatedAt); }
  assert.equal(new Set(stamps).size, 3, 'every save has its own stamp even though the clock did not move');
  assert.deepEqual([...stamps].sort(), stamps, 'and they only go forward');
});
