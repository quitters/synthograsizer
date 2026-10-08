import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RosterStore, MAX_MEMORY_PER_EMPLOYEE } from './roster.js';
import { MIGRATIONS } from './migrations.js';
import { sqliteAvailable, openDatabase, migrate, versionOf } from './sqlite.js';
import { newId } from '../util.js';

/**
 * The roster: the library of invented people, their seats in companies, and what they remember there.
 * Skipped where this Node has no node:sqlite (22.5 to 22.12 need --experimental-sqlite; npm test passes it).
 */
const skip = !sqliteAvailable() && 'node:sqlite is not available in this Node';

const OWNER = newId();
const OTHER = newId();
const COMPANY_A = newId();
const COMPANY_B = newId();
const DEPT = 'abcd1234';

const profile = (name, over = {}) => ({
  id: `p_${name}`, name, icon: '🙂', color: '#336699', category: 'roleplay',
  bioTemplate: '{{agent_name}}, the {{role}}.', variables: [], anchors: { agent_name: name, role: 'editor' }, tags: [],
  ...over,
});
const cast = (over = {}) => ({
  bornYear: 1980, birthplace: { city: 'Busan', country: 'South Korea', region: 'East Asia' }, culture: 'Korean Canadian', pronoun: 'he',
  temperament: 'quiet', workingStyle: 'visual first', dissent: 'medium', intendedType: 'ISTP', tier: 'none', model: 'gemini-3.8-flash', thinking: 'low', skills: ['image models', 'photography'],
  ...over,
});
const add = (store, name, over = {}) => store.addCandidate(over.owner || OWNER, {
  profile: profile(name), casting: cast(over.casting), archetype: over.archetype || 'craftsman', role: over.role || 'image director', status: over.status || 'ready', ...(over.rest || {}),
});
const open = () => RosterStore.open({ file: ':memory:', now: () => new Date('2026-10-08T12:00:00Z') });

test('migrations run once, in order, and opening a current database changes nothing', { skip }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-test-'));
  try {
    const file = path.join(dir, 'roster.sqlite');
    const db = openDatabase(file, MIGRATIONS);
    assert.equal(versionOf(db), 1);
    assert.deepEqual(migrate(db, MIGRATIONS), [], 'a current database has nothing to run');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
    for (const t of ['candidates', 'employees', 'memory_entries', 'archetype_lessons']) assert.ok(tables.includes(t), t);
    db.close();
    const again = openDatabase(file, MIGRATIONS);
    assert.equal(versionOf(again), 1);
    // a newer migration is applied to an old file, and a failing one rolls back whole
    assert.deepEqual(migrate(again, [...MIGRATIONS, { version: 2, name: 'later', sql: 'CREATE TABLE later (id TEXT);' }]), [2]);
    assert.throws(() => migrate(again, [...MIGRATIONS, { version: 3, name: 'broken', sql: 'CREATE TABLE half (id TEXT); NOT SQL AT ALL;' }]), /migration 3 \(broken\) failed/);
    assert.equal(versionOf(again), 2);
    assert.equal(again.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'half'").get().n, 0, 'the half-made table was rolled back');
    again.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a candidate is added with the facts that were drawn, found again, and checked on the way in', { skip }, () => {
  const store = open();
  const c = add(store, 'Hyun-woo Baek', { rest: { quiz: { type: 'ISTP' }, checks: { advice: ['ok'] }, writtenBy: 'gemini-3.1-pro-preview' } });
  assert.equal(c.name, 'Hyun-woo Baek');
  assert.deepEqual([c.archetype, c.role, c.status, c.intendedType, c.measuredType, c.bornYear, c.region, c.dissent, c.tier], ['craftsman', 'image director', 'ready', 'ISTP', 'ISTP', 1980, 'East Asia', 'medium', 'none']);
  assert.deepEqual(c.skills, ['image models', 'photography']);
  assert.equal(c.employed, 0);
  assert.equal(c.profile.bioTemplate, '{{agent_name}}, the {{role}}.');
  assert.deepEqual(c.checks, { advice: ['ok'] });
  assert.equal(store.getCandidate(OWNER, c.id, { full: false }).profile, undefined, 'the list form leaves the sheet out');

  const bad = (input, code) => assert.throws(() => store.addCandidate(OWNER, input), (e) => (code ? e.code === code : e.status === 400), JSON.stringify(input).slice(0, 80));
  bad({ archetype: 'x', role: 'y' });
  bad({ profile: profile('No Role'), archetype: 'x' });
  bad({ profile: profile('No Archetype'), role: 'y' });
  bad({ profile: profile('Bad [Name]'), archetype: 'x', role: 'y' });
  bad({ profile: profile('Has Key', { bioTemplate: 'use AIzaSyA1234567890abcdefghijklmnopqrstuvw' }), archetype: 'x', role: 'y' }, 'secret_in_text');
  bad({ profile: profile('Huge', { bioTemplate: 'x'.repeat(70_000) }), archetype: 'x', role: 'y' });
  bad({ profile: profile('Odd Status'), archetype: 'x', role: 'y', status: 'hired' });
  assert.throws(() => add(store, 'hyun-woo baek'), (e) => e.code === 'name_taken', 'names are unique per owner, whatever the case');
  assert.equal(add(store, 'Hyun-woo Baek', { owner: OTHER }).name, 'Hyun-woo Baek', 'another owner can have the same name');
  store.close();
});

test('one owner\'s roster is invisible to another: lookups, lists, counts, fits, changes and deletes', { skip }, () => {
  const store = open();
  const mine = add(store, 'Mine One');
  add(store, 'Theirs One', { owner: OTHER });
  assert.throws(() => store.getCandidate(OTHER, mine.id), (e) => e.status === 404);
  assert.throws(() => store.updateCandidate(OTHER, mine.id, { status: 'retired' }), (e) => e.status === 404);
  assert.throws(() => store.deleteCandidate(OTHER, mine.id), (e) => e.status === 404);
  assert.deepEqual(store.listCandidates(OWNER).map(c => c.name), ['Mine One']);
  assert.deepEqual(store.listCandidates(OTHER).map(c => c.name), ['Theirs One']);
  assert.equal(store.countCandidates(OWNER), 1);
  assert.deepEqual(store.findFit(OTHER, { archetype: 'craftsman' }).map(f => f.candidate.name), ['Theirs One']);
  assert.throws(() => store.getCandidate('not-an-id', mine.id), (e) => e.code === 'no_owner');
  assert.equal(store.spread(OTHER).people, 1);
  store.close();
});

test('the roster holds at most so many people; retiring one makes room', { skip }, () => {
  const store = RosterStore.open({ file: ':memory:', maxCandidates: 2 });
  const a = add(store, 'Ann One');
  add(store, 'Ben Two');
  assert.throws(() => add(store, 'Cy Three'), (e) => e.code === 'roster_cap');
  store.retireCandidate(OWNER, a.id);
  assert.equal(add(store, 'Cy Three').status, 'ready');
  store.close();
});

test('the list filters by status, archetype, region, tier and a search over name, role, culture and skills; it pages', { skip }, () => {
  const store = open();
  add(store, 'Ann Reed', { archetype: 'archivist', role: 'researcher', status: 'draft', casting: { birthplace: { city: 'Cusco', country: 'Peru', region: 'South America' }, culture: 'Andean Peruvian', skills: ['catalogues'] } });
  add(store, 'Ben Okoye', { archetype: 'machinist', role: 'engineer', casting: { birthplace: { city: 'Lagos', country: 'Nigeria', region: 'Africa' }, tier: 'builder', skills: ['schemas'] } });
  add(store, 'Cy Tanaka', {});
  const names = (f) => store.listCandidates(OWNER, f).map(c => c.name).sort();
  assert.deepEqual(names({ status: 'draft' }), ['Ann Reed']);
  assert.deepEqual(names({ archetype: 'machinist' }), ['Ben Okoye']);
  assert.deepEqual(names({ region: 'Africa' }), ['Ben Okoye']);
  assert.deepEqual(names({ tier: 'builder' }), ['Ben Okoye']);
  assert.deepEqual(names({ q: 'andean' }), ['Ann Reed']);
  assert.deepEqual(names({ q: 'schema' }), ['Ben Okoye']);
  assert.deepEqual(names({ q: '100%' }), [], 'a percent sign is just a character');
  assert.equal(store.listCandidates(OWNER, { limit: 2 }).length, 2);
  assert.equal(store.listCandidates(OWNER, { limit: 2, offset: 2 }).length, 1);
  store.close();
});

test('changing a candidate: a new sheet is checked again, a rename cannot take another person\'s name, status and quiz are kept', { skip }, () => {
  const store = open();
  const a = add(store, 'Ann One');
  add(store, 'Ben Two');
  const renamed = store.updateCandidate(OWNER, a.id, { profile: profile('Ann Uno'), role: 'lead editor' });
  assert.deepEqual([renamed.name, renamed.role, renamed.profile.name], ['Ann Uno', 'lead editor', 'Ann Uno']);
  assert.throws(() => store.updateCandidate(OWNER, a.id, { profile: profile('ben two') }), (e) => e.code === 'name_taken');
  assert.throws(() => store.updateCandidate(OWNER, a.id, { profile: profile('Fine', { bioTemplate: '' }) }), (e) => e.status === 400);
  assert.throws(() => store.updateCandidate(OWNER, a.id, { status: 'nope' }), (e) => e.status === 400);
  const q = store.updateCandidate(OWNER, a.id, { quiz: { type: 'ENFP' }, checks: { n: 1 }, skills: ['a', 'b'] });
  assert.deepEqual([q.measuredType, q.checks, q.skills], ['ENFP', { n: 1 }, ['a', 'b']]);
  assert.equal(store.updateCandidate(OWNER, a.id, {}).name, 'Ann Uno', 'an empty change is not an error');
  store.close();
});

test('finding the best fit for a seat is a query: the archetype first, then dissent, tier, skills, and people who are free; only ready people', { skip }, () => {
  const store = open();
  add(store, 'Ann Reed', { archetype: 'contrarian', role: 'skeptic', casting: { dissent: 'high', tier: 'none', skills: ['fact-checking'] } });
  add(store, 'Ben Okoye', { archetype: 'machinist', role: 'engineer', casting: { dissent: 'low', tier: 'builder', skills: ['schemas', 'json'] } });
  add(store, 'Cy Tanaka', { archetype: 'machinist', role: 'engineer', casting: { dissent: 'low', tier: 'builder', skills: ['audio'] } });
  add(store, 'Dee Draft', { archetype: 'machinist', role: 'engineer', status: 'draft', casting: { tier: 'builder', skills: ['schemas'] } });
  const ben = store.listCandidates(OWNER).find(c => c.name === 'Ben Okoye');
  const cy = store.listCandidates(OWNER).find(c => c.name === 'Cy Tanaka');

  let fit = store.findFit(OWNER, { archetype: 'machinist', tier: 'builder', skills: ['schemas'] });
  assert.deepEqual(fit.map(f => f.candidate.name), ['Ben Okoye', 'Cy Tanaka', 'Ann Reed'], 'the draft is never offered');
  assert.deepEqual(fit[0].why, ['archetype', 'tier', '1 skill', 'free']);

  // Ben is working somewhere now; with the same score otherwise, the free one comes first
  store.hire(OWNER, { companyId: COMPANY_A, departmentId: DEPT, candidateId: ben.id, position: 'Engineer' });
  fit = store.findFit(OWNER, { archetype: 'machinist', tier: 'builder' });
  assert.deepEqual(fit.slice(0, 2).map(f => f.candidate.name), ['Cy Tanaka', 'Ben Okoye']);
  assert.deepEqual(store.findFit(OWNER, { archetype: 'machinist' }, { includeEmployed: false }).map(f => f.candidate.name).slice(0, 1), ['Cy Tanaka']);
  assert.deepEqual(store.findFit(OWNER, { archetype: 'machinist' }, { excludeIds: [cy.id] }).map(f => f.candidate.name)[0], 'Ben Okoye');
  assert.equal(store.findFit(OWNER, { archetype: 'machinist' }, { limit: 1 }).length, 1);
  store.close();
});

test('the spread counts people over each attribute, for the diversity report', { skip }, () => {
  const store = open();
  add(store, 'Ann Reed', { casting: { birthplace: { city: 'Cusco', country: 'Peru', region: 'South America' }, bornYear: 1963, pronoun: 'she', dissent: 'high', intendedType: 'ISTJ' }, archetype: 'archivist' });
  add(store, 'Ben Okoye', { casting: { birthplace: { city: 'Lagos', country: 'Nigeria', region: 'Africa' }, bornYear: 1998, pronoun: 'he', intendedType: 'ENFP' }, archetype: 'machinist' });
  add(store, 'Cy Tanaka', { casting: { bornYear: 1984, pronoun: 'they' }, archetype: 'machinist' });
  add(store, 'Not Ready', { status: 'draft' });
  const s = store.spread(OWNER);
  assert.equal(s.people, 3);
  assert.deepEqual(s.archetypes, { archivist: 1, machinist: 2 });
  assert.deepEqual(s.pronouns, { she: 1, he: 1, they: 1 });
  assert.deepEqual(s.dissent, { high: 1, medium: 2 });
  assert.deepEqual(s.regions, { 'South America': 1, Africa: 1, 'East Asia': 1 });
  assert.deepEqual(s.ages.sort((a, b) => a - b), [28, 42, 63]);
  assert.deepEqual(s.ageBands, { '60s': 1, '20s': 1, '40s': 1 });
  const some = store.spread(OWNER, [store.listCandidates(OWNER, { q: 'Ann' })[0].id]);
  assert.equal(some.people, 1);
  store.close();
});

test('hiring: a ready person gets one seat in a company; the same person can work in two, as two employees', { skip }, () => {
  const store = open();
  const draft = add(store, 'Dee Draft', { status: 'draft' });
  const ann = add(store, 'Ann One');
  assert.throws(() => store.hire(OWNER, { companyId: COMPANY_A, departmentId: DEPT, candidateId: draft.id, position: 'Editor' }), (e) => e.code === 'candidate_not_ready');
  assert.throws(() => store.hire(OWNER, { companyId: 'nope', departmentId: DEPT, candidateId: ann.id, position: 'Editor' }), (e) => e.status === 400);
  assert.throws(() => store.hire(OWNER, { companyId: COMPANY_A, departmentId: 'x', candidateId: ann.id, position: 'Editor' }), (e) => e.status === 400);
  assert.throws(() => store.hire(OWNER, { companyId: COMPANY_A, departmentId: DEPT, candidateId: ann.id, position: ' ' }), (e) => e.status === 400);
  assert.throws(() => store.hire(OTHER, { companyId: COMPANY_A, departmentId: DEPT, candidateId: ann.id, position: 'Editor' }), (e) => e.status === 404);

  const e1 = store.hire(OWNER, { companyId: COMPANY_A, departmentId: DEPT, candidateId: ann.id, position: 'Lead editor', isLead: true, reviewerOf: 'engine.json', knobs: { tempo: 1 } });
  assert.deepEqual([e1.name, e1.position, e1.isLead, e1.reviewerOf, e1.knobs, e1.tier, e1.sessions], ['Ann One', 'Lead editor', true, 'engine.json', { tempo: 1 }, 'none', 0]);
  assert.throws(() => store.hire(OWNER, { companyId: COMPANY_A, departmentId: DEPT, candidateId: ann.id, position: 'Again' }), (e) => e.code === 'already_hired');
  const e2 = store.hire(OWNER, { companyId: COMPANY_B, departmentId: DEPT, candidateId: ann.id, position: 'Editor', tier: 'research' });
  assert.notEqual(e1.id, e2.id);
  assert.equal(e2.tier, 'research', 'the seat\'s run settings can differ from the candidate\'s own');
  assert.equal(store.getCandidate(OWNER, ann.id).employed, 2);
  assert.deepEqual(store.employeesOf(OWNER, COMPANY_A).map(e => e.name), ['Ann One']);
  assert.deepEqual(store.employeesOf(OWNER, COMPANY_A, { departmentId: 'ffffffff' }), []);
  assert.deepEqual(store.employeesOf(OTHER, COMPANY_A), []);
  assert.throws(() => store.deleteCandidate(OWNER, ann.id), (e) => e.code === 'candidate_employed');
  store.close();
});

test('someone who leaves keeps nothing in the room; their memories stay until the owner deletes them; they can be hired again', { skip }, () => {
  const store = open();
  const ann = add(store, 'Ann One');
  const e = store.hire(OWNER, { companyId: COMPANY_A, departmentId: DEPT, candidateId: ann.id, position: 'Editor' });
  store.addMemory(OWNER, e.id, { text: 'We chose the Archive concept.', session: 'day-1' });
  assert.throws(() => store.forgetEmployee(OWNER, e.id), (err) => err.code === 'still_employed');
  const left = store.leave(OWNER, e.id);
  assert.ok(left.leftAt);
  assert.deepEqual(store.employeesOf(OWNER, COMPANY_A), []);
  assert.equal(store.employeesOf(OWNER, COMPANY_A, { includeLeft: true }).length, 1);
  assert.equal(store.listMemory(OWNER, e.id).length, 1, 'kept');
  assert.equal(store.getCandidate(OWNER, ann.id).employed, 0);
  const again = store.hire(OWNER, { companyId: COMPANY_A, departmentId: DEPT, candidateId: ann.id, position: 'Editor' });
  assert.notEqual(again.id, e.id, 'a new seat, with no memory of the old one');
  assert.deepEqual(store.listMemory(OWNER, again.id), []);
  store.forgetEmployee(OWNER, e.id);
  assert.throws(() => store.listMemory(OWNER, e.id), (err) => err.status === 404);
  store.close();
});

test('memory: written, read, edited by the owner, deleted for good, capped, and checked for secrets', { skip }, () => {
  const store = open();
  const ann = add(store, 'Ann One');
  const e = store.hire(OWNER, { companyId: COMPANY_A, departmentId: DEPT, candidateId: ann.id, position: 'Editor' });

  const m = store.addMemory(OWNER, e.id, { text: '  The team approved publishing.  ', session: 'day-2', kind: 'summary' });
  assert.deepEqual([m.text, m.source, m.verified, m.kind, m.session], ['The team approved publishing.', 'agent', 'unchecked', 'summary', 'day-2']);
  const flagged = store.updateMemory(OWNER, m.id, { verified: 'contradicted', note: 'Nothing was approved; the queue shows none.' });
  assert.deepEqual([flagged.verified, flagged.note, flagged.source], ['contradicted', 'Nothing was approved; the queue shows none.', 'agent']);
  assert.deepEqual(store.memoryForBio(OWNER, e.id), [], 'a memory found to contradict the record is not handed back');

  const edited = store.updateMemory(OWNER, m.id, { text: 'We offered the engine; nobody approved it.' });
  assert.deepEqual([edited.source, edited.verified, edited.note], ['owner', 'confirmed', null], 'an edit makes it the owner\'s word');
  assert.deepEqual(store.memoryForBio(OWNER, e.id).map(x => x.text), ['We offered the engine; nobody approved it.']);

  for (const bad of [{ text: '' }, { text: 'x'.repeat(1300) }, { text: 'a', kind: 'diary' }, { text: 'a', verified: 'maybe' }, { text: 'key AIzaSyA1234567890abcdefghijklmnopqrstuvw' }]) {
    assert.throws(() => store.addMemory(OWNER, e.id, bad), (err) => err.status === 400, JSON.stringify(bad).slice(0, 50));
  }
  assert.throws(() => store.updateMemory(OWNER, m.id, { kind: 'diary' }), (err) => err.status === 400);

  store.deleteMemory(OWNER, m.id);
  assert.deepEqual(store.listMemory(OWNER, e.id), []);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM memory_entries').get().n, 0, 'nothing keeps a copy');
  assert.throws(() => store.deleteMemory(OWNER, m.id), (err) => err.status === 404);

  for (let i = 0; i < MAX_MEMORY_PER_EMPLOYEE; i++) store.addMemory(OWNER, e.id, { text: `note ${i}`, kind: 'note' });
  assert.throws(() => store.addMemory(OWNER, e.id, { text: 'one more' }), (err) => err.code === 'memory_cap');
  assert.equal(store.memoryForBio(OWNER, e.id, { limit: 3 }).length, 3);
  assert.deepEqual(store.memoryForBio(OWNER, e.id, { limit: 3 }).map(x => x.text), ['note 97', 'note 98', 'note 99'], 'the newest few, oldest of them first');
  store.close();
});

test('no memory crosses a company or an owner: the same person hired twice remembers each job separately', { skip }, () => {
  const store = open();
  const ann = add(store, 'Ann One');
  const inA = store.hire(OWNER, { companyId: COMPANY_A, departmentId: DEPT, candidateId: ann.id, position: 'Editor' });
  const inB = store.hire(OWNER, { companyId: COMPANY_B, departmentId: DEPT, candidateId: ann.id, position: 'Editor' });
  const secret = store.addMemory(OWNER, inA.id, { text: 'Company A\'s plan is the harbour series.' });
  assert.deepEqual(store.listMemory(OWNER, inB.id), []);
  assert.deepEqual(store.memoryForBio(OWNER, inB.id), []);
  assert.throws(() => store.listMemory(OTHER, inA.id), (e) => e.status === 404);
  assert.throws(() => store.addMemory(OTHER, inA.id, { text: 'x' }), (e) => e.status === 404);
  assert.throws(() => store.updateMemory(OTHER, secret.id, { text: 'changed' }), (e) => e.status === 404);
  assert.throws(() => store.deleteMemory(OTHER, secret.id), (e) => e.status === 404);
  assert.throws(() => store.getEmployee(OTHER, inA.id), (e) => e.status === 404);
  assert.equal(store.listMemory(OWNER, inA.id)[0].text, 'Company A\'s plan is the harbour series.');
  store.close();
});

test('deleting a company takes its seats and every memory kept there; deleting an owner takes everything', { skip }, () => {
  const store = open();
  const ann = add(store, 'Ann One');
  const ben = add(store, 'Ben Two');
  const a = store.hire(OWNER, { companyId: COMPANY_A, departmentId: DEPT, candidateId: ann.id, position: 'Editor' });
  const b = store.hire(OWNER, { companyId: COMPANY_B, departmentId: DEPT, candidateId: ben.id, position: 'Editor' });
  store.addMemory(OWNER, a.id, { text: 'in A' });
  store.addMemory(OWNER, b.id, { text: 'in B' });
  store.addLesson(OWNER, 'craftsman', 'Do not give him a camera shop.');

  assert.deepEqual(store.removeCompany(OWNER, COMPANY_A), { removed: 1 });
  assert.throws(() => store.listMemory(OWNER, a.id), (e) => e.status === 404);
  assert.equal(store.listMemory(OWNER, b.id).length, 1, 'the other company is untouched');
  assert.equal(store.getCandidate(OWNER, ann.id).name, 'Ann One', 'the person is still in the library');

  add(store, 'Theirs', { owner: OTHER });
  assert.deepEqual(store.purgeOwner(OWNER), { candidates: 2 });
  assert.equal(store.countCandidates(OWNER), 0);
  assert.deepEqual(store.lessonsFor(OWNER, 'craftsman'), []);
  assert.equal(store.countCandidates(OTHER), 1, 'another owner is untouched');
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM memory_entries').get().n, 0);
  store.close();
});

test('what has been learned about casting an archetype is kept, once, and shown newest-last', { skip }, () => {
  const store = open();
  const one = store.addLesson(OWNER, 'craftsman', 'A camera shop is where the writer always starts him.', 'check');
  const dup = store.addLesson(OWNER, 'craftsman', 'A camera shop is where the writer always starts him.', 'check');
  assert.equal(dup.duplicate, true);
  assert.equal(dup.id, one.id);
  store.addLesson(OWNER, 'craftsman', 'Give him a first job that is not in image-making.', 'owner');
  store.addLesson(OWNER, 'archivist', 'Keep her out of libraries.', 'owner');
  assert.deepEqual(store.lessonsFor(OWNER, 'craftsman').map(l => l.source), ['check', 'owner']);
  assert.equal(store.lessonsFor(OTHER, 'craftsman').length, 0);
  store.deleteLesson(OWNER, one.id);
  assert.equal(store.lessonsFor(OWNER, 'craftsman').length, 1);
  assert.throws(() => store.deleteLesson(OTHER, one.id), (e) => e.status === 404);
  assert.throws(() => store.addLesson(OWNER, 'craftsman', ''), (e) => e.status === 400);
  store.close();
});

test('sessions are counted per seat', { skip }, () => {
  const store = open();
  const ann = add(store, 'Ann One');
  const e = store.hire(OWNER, { companyId: COMPANY_A, departmentId: DEPT, candidateId: ann.id, position: 'Editor' });
  store.bumpSessions(OWNER, e.id);
  store.bumpSessions(OWNER, e.id);
  store.setKnobs(OWNER, e.id, { tempo: 2 });
  const got = store.getEmployee(OWNER, e.id, { profile: true });
  assert.deepEqual([got.sessions, got.knobs, got.profile.name], [2, { tempo: 2 }, 'Ann One']);
  store.close();
});
