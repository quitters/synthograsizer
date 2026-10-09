/**
 * Bringing a cookie's companies under the owner account: what would move is shown first, a backup is taken, the companies, flows and
 * roster rows all follow, a clash stops it before anything changes, and the owner can also be made under the id that already owns them.
 */
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createCompanyServices } from './index.js';
import { OwnerAuth } from './ownerAuth.js';
import { survey, planAdoption, applyAdoption } from './ownerAdopt.js';
import { sqliteAvailable } from './flow/sqlite.js';
import { markerClassifier, tempDir } from './testKit.js';
import { newId } from './util.js';

const skip = !sqliteAvailable() && 'node:sqlite is not available in this Node';
const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const dir = () => { const d = tempDir(); dirs.push(d); return d; };
const services = (dataDir) => createCompanyServices({ dataDir, env: {}, classify: markerClassifier() });
const person = (name) => ({ profile: { id: `p_${name}`, name, bioTemplate: '{{agent_name}}, a person.', variables: [], anchors: { agent_name: name }, tags: [] }, archetype: 'steward', role: 'x', status: 'ready' });

/** A data folder where `old` owns a company, a flow file and two people. */
function populated(old) {
  const dataDir = dir();
  const s = services(dataDir);
  const company = s.store.create(old, { name: 'Tide Pool Works', departments: ['Desk'] });
  const a = s.roster.addCandidate(old, person('Rima Haddad'));
  s.roster.addCandidate(old, person('Zayd Siddiqui'));
  s.roster.hire(old, { companyId: company.id, departmentId: company.departments[0].id, candidateId: a.id, position: 'x' });
  const flowId = newId();
  fs.mkdirSync(path.join(dataDir, 'flow', old), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'flow', old, `${flowId}.json`), JSON.stringify({ id: flowId, ownerId: old, state: 'created', plan: { departments: [] }, spend: {} }));
  s.close();
  return { dataDir, company, flowId };
}

test('survey: who owns what in a data folder, from the files and the database', { skip }, () => {
  const old = newId();
  const { dataDir, company } = populated(old);
  const owners = survey(dataDir);
  assert.deepEqual([...owners.keys()], [old]);
  const mine = owners.get(old);
  assert.deepEqual(mine.companies, [{ id: company.id, name: 'Tide Pool Works' }]);
  assert.equal(mine.flows, 1);
  assert.equal(mine.rows.candidates, 2);
  assert.equal(mine.rows.employees, 1);
});

test('the dry run says what would move and changes nothing; it refuses ids that are not owners or are the same', { skip }, () => {
  const old = newId();
  const to = newId();
  const { dataDir, company } = populated(old);
  const plan = planAdoption(dataDir, old, to);
  assert.equal(plan.nothing, false);
  assert.equal(plan.companies.length, 1);
  assert.equal(plan.flows, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'companies', company.id, 'company.json'), 'utf8')).ownerId, old, 'nothing changed');
  assert.equal(planAdoption(dataDir, newId(), to).nothing, true, 'an id that owns nothing');
  assert.throws(() => planAdoption(dataDir, 'nope', to), (e) => e.code === 'bad_owner_id');
  assert.throws(() => planAdoption(dataDir, old, old), (e) => e.code === 'same_owner');
  assert.throws(() => planAdoption(dataDir, old, null), (e) => e.code === 'no_owner');
});

test('applying moves the company, the flow and the roster; the new owner sees them and the old one does not; a backup is kept', { skip }, () => {
  const old = newId();
  const to = newId();
  const { dataDir, company, flowId } = populated(old);
  const done = applyAdoption(dataDir, old, to, { now: () => new Date('2026-10-09T12:34:56.000Z') });
  assert.deepEqual(done.moved, { companies: 1, flows: 1, rows: done.moved.rows });
  assert.equal(done.moved.rows.candidates, 2);
  assert.match(done.backup, /backup-adopt-20261009T123456$/);
  assert.ok(fs.existsSync(path.join(done.backup, 'companies', company.id, 'company.json')));
  assert.ok(fs.existsSync(path.join(done.backup, 'company.sqlite')));
  assert.ok(fs.existsSync(path.join(done.backup, 'flow', old, `${flowId}.json`)));

  const s = services(dataDir);
  try {
    assert.deepEqual(s.store.listFor(to).map(c => c.id), [company.id]);
    assert.deepEqual(s.store.listFor(old), []);
    assert.equal(s.roster.listCandidates(to, {}).length, 2);
    assert.equal(s.roster.listCandidates(old, {}).length, 0);
    assert.equal(s.roster.employeesOf(to, company.id).length, 1);
    assert.equal(s.flow.store.flows.get(flowId).ownerId, to, 'the flow the server loads belongs to the new owner');
    assert.ok(fs.existsSync(path.join(dataDir, 'flow', to, `${flowId}.json`)));
    assert.equal(fs.existsSync(path.join(dataDir, 'flow', old)), false, 'and the old owner folder is gone');
  } finally { s.close(); }
  assert.equal(applyAdoption(dataDir, old, to).nothing, true, 'a second run finds nothing to move');
});

test('a name the new owner already has stops it before anything is changed', { skip }, () => {
  const old = newId();
  const to = newId();
  const { dataDir, company } = populated(old);
  const s = services(dataDir);
  s.roster.addCandidate(to, person('Rima Haddad'));
  s.close();
  assert.throws(() => applyAdoption(dataDir, old, to), (e) => e.code === 'adopt_conflict' && /Nothing was changed/.test(e.message));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'companies', company.id, 'company.json'), 'utf8')).ownerId, old, 'the company stayed');
  const again = services(dataDir);
  try { assert.equal(again.roster.listCandidates(old, {}).length, 2, 'and so did the roster'); } finally { again.close(); }
});

test('the owner can be made under the id that already owns the companies, so nothing has to move at all', { skip }, () => {
  const old = newId();
  const { dataDir, company } = populated(old);
  const auth = new OwnerAuth({ dataDir, env: { COMPANY_OWNER_AUTH: 'key' }, initialOwnerId: old });
  assert.equal(auth.ownerId, old);
  assert.equal(auth.justCreated, true);
  const { token } = auth.signIn(fs.readFileSync(auth.keyFile, 'utf8'));
  const s = services(dataDir);
  try { assert.deepEqual(s.store.listFor(auth.sessionFor(token).ownerId).map(c => c.id), [company.id]); } finally { s.close(); }
  assert.throws(() => new OwnerAuth({ dataDir: dir(), env: { COMPANY_OWNER_AUTH: 'key' }, initialOwnerId: 'bad' }), (e) => e.code === 'bad_owner_id');
});

test('two moves in the same second keep a backup each', { skip }, () => {
  const a = newId();
  const b = newId();
  const to = newId();
  const first = populated(a);
  const s = services(first.dataDir);
  s.store.create(b, { name: 'Second Co', departments: ['Desk'] });
  s.roster.addCandidate(b, person('Ben Test'));
  s.close();
  const same = () => new Date('2026-10-09T12:34:56.000Z');
  const one = applyAdoption(first.dataDir, a, to, { now: same });
  const two = applyAdoption(first.dataDir, b, to, { now: same });
  assert.notEqual(one.backup, two.backup);
  assert.match(two.backup, /backup-adopt-20261009T123456-2$/);
  assert.ok(fs.existsSync(path.join(one.backup, 'company.sqlite')) && fs.existsSync(path.join(two.backup, 'company.sqlite')));
});
