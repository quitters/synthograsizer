import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteAvailable } from '../flow/sqlite.js';
import { world } from './hallKit.js';
import { HALL_LIMITS } from './limits.js';
import { newId } from '../util.js';

/** Norms: a working agreement is a proposal until the owner decides; only approved ones reach the prompt; nobody approves their own. */
const skip = !sqliteAvailable() && 'node:sqlite is not available in this Node';
const L = HALL_LIMITS.norms;

const setup = () => { const w = world(); return { ...w, norms: w.hall.norms, owner: { id: null, name: 'Owner', system: true } }; };

test('a person proposes an agreement with a reason; it binds no one until the owner approves it', { skip }, () => {
  const w = setup();
  const n = w.norms.propose(w.ownerId, w.companyId, w.who('kasia'), { text: 'Whoever saves a file says in one line what changed.', why: 'Reviewers keep asking.' });
  assert.deepEqual([n.status, n.proposedBy.name, n.why, n.decidedAt], ['proposed', 'Kasia Wójcik-Lindqvist', 'Reviewers keep asking.', null]);
  assert.deepEqual(w.norms.approvedTexts(w.ownerId, w.companyId), []);
  const v0 = w.norms.versionOf(w.ownerId, w.companyId);
  const done = w.norms.decide(w.ownerId, w.companyId, n.id, 'approved');
  assert.deepEqual([done.status, typeof done.decidedAt], ['approved', 'string']);
  assert.deepEqual(w.norms.approvedTexts(w.ownerId, w.companyId), ['Whoever saves a file says in one line what changed.']);
  assert.notEqual(w.norms.versionOf(w.ownerId, w.companyId), v0, 'a prompt built from the set knows to rebuild');
  assert.throws(() => w.norms.decide(w.ownerId, w.companyId, n.id, 'rejected'), (e) => e.code === 'already_decided');
  w.roster.close();
});

test('a proposal is cleaned and bounded, and the same one is not proposed twice', { skip }, () => {
  const w = setup();
  const p = (over) => w.norms.propose(w.ownerId, w.companyId, w.who('zayd'), { text: 'Reviews name the line they mean.', ...over });
  assert.throws(() => p({ text: '' }), (e) => e.status === 400);
  assert.throws(() => p({ text: 'x'.repeat(L.text + 1) }), (e) => /at most 400/.test(e.message));
  assert.throws(() => p({ why: 'y'.repeat(L.why + 1) }), (e) => /at most 300/.test(e.message));
  assert.throws(() => p({ text: 'use AIzaSyA1234567890abcdefghijklmnopqrstuvw' }), (e) => e.code === 'secret_in_text');
  assert.equal(p({ text: '  Reviews\n name   the line they mean. ' }).text, 'Reviews name the line they mean.');
  assert.throws(() => p({ text: 'reviews name the line they mean.' }), (e) => e.code === 'norm_exists', 'any case');
  w.roster.close();
});

test('only the owner decides; a rejected one never reaches the prompt; the set has a size', { skip }, () => {
  const w = setup();
  const a = w.norms.propose(w.ownerId, w.companyId, w.who('zayd'), { text: 'Agreement A' });
  const b = w.norms.propose(w.ownerId, w.companyId, w.who('zayd'), { text: 'Agreement B' });
  assert.throws(() => w.norms.decide(w.ownerId, w.companyId, a.id, 'maybe'), (e) => e.status === 400);
  assert.throws(() => w.norms.decide(newId(), w.companyId, a.id, 'approved'), (e) => e.status === 404, 'another owner');
  assert.throws(() => w.norms.decide(w.ownerId, newId(), a.id, 'approved'), (e) => e.status === 404, 'another company');
  w.norms.decide(w.ownerId, w.companyId, a.id, 'approved');
  w.norms.decide(w.ownerId, w.companyId, b.id, 'rejected');
  assert.deepEqual(w.norms.approvedTexts(w.ownerId, w.companyId), ['Agreement A']);

  for (let i = 0; i < L.approved - 1; i++) { const n = w.norms.propose(w.ownerId, w.companyId, w.who('rima'), { text: `Filler agreement ${i}` }); w.norms.decide(w.ownerId, w.companyId, n.id, 'approved'); }
  const extra = w.norms.propose(w.ownerId, w.companyId, w.who('rima'), { text: 'One more' });
  assert.throws(() => w.norms.decide(w.ownerId, w.companyId, extra.id, 'approved'), (e) => e.code === 'norm_cap' && /withdraw one first/.test(e.message));
  // the owner ends an approved one to make room
  assert.equal(w.norms.withdraw(w.ownerId, w.companyId, w.owner, a.id).status, 'withdrawn');
  assert.equal(w.norms.decide(w.ownerId, w.companyId, extra.id, 'approved').status, 'approved');
  w.roster.close();
});

test('a person takes back only their own waiting proposal; only so many can wait at once', { skip }, () => {
  const w = setup();
  const mine = w.norms.propose(w.ownerId, w.companyId, w.who('zayd'), { text: 'Mine' });
  const theirs = w.norms.propose(w.ownerId, w.companyId, w.who('kasia'), { text: 'Theirs' });
  assert.throws(() => w.norms.withdraw(w.ownerId, w.companyId, w.who('zayd'), theirs.id), (e) => e.code === 'not_allowed');
  assert.equal(w.norms.withdraw(w.ownerId, w.companyId, w.who('zayd'), mine.id).status, 'withdrawn');
  assert.throws(() => w.norms.withdraw(w.ownerId, w.companyId, w.who('kasia'), '0'.repeat(16)), (e) => e.status === 404);
  w.norms.decide(w.ownerId, w.companyId, theirs.id, 'approved');
  assert.throws(() => w.norms.withdraw(w.ownerId, w.companyId, w.who('kasia'), theirs.id), (e) => e.code === 'not_allowed', 'an approved agreement is the owner\'s to end');

  for (let i = 0; i < L.open; i++) w.norms.propose(w.ownerId, w.companyId, w.who('rima'), { text: `Waiting ${i}` });
  assert.throws(() => w.norms.propose(w.ownerId, w.companyId, w.who('rima'), { text: 'Too many waiting' }), (e) => e.code === 'norm_cap');
  assert.deepEqual(w.norms.list(w.ownerId, w.companyId, { status: 'approved' }).map(n => n.text), ['Theirs']);
  assert.equal(w.norms.list(w.ownerId, w.companyId).length, 2 + L.open);
  w.roster.close();
});

test('the layer gets the approved agreements oldest first and no more than it has room for', { skip }, () => {
  const w = setup();
  const make = (text) => { const n = w.norms.propose(w.ownerId, w.companyId, w.who('rima'), { text }); w.norms.decide(w.ownerId, w.companyId, n.id, 'approved'); };
  make('First.');
  make('Second.');
  assert.deepEqual(w.norms.approvedTexts(w.ownerId, w.companyId), ['First.', 'Second.']);
  assert.equal(w.norms.removeCompany(w.ownerId, w.companyId).removed, 2);
  assert.deepEqual(w.norms.approvedTexts(w.ownerId, w.companyId), []);
  w.roster.close();
});
