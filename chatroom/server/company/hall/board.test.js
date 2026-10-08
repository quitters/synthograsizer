import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteAvailable } from '../flow/sqlite.js';
import { world, clock } from './hallKit.js';
import { HALL_LIMITS } from './limits.js';
import { newId } from '../util.js';

/** The board: tasks with a lead and members, a status everyone can see, and a way to ask for a task team that only the owner can grant. */
const skip = !sqliteAvailable() && 'node:sqlite is not available in this Node';
const L = HALL_LIMITS.board;

const setup = () => { const w = world(); return { ...w, board: w.hall.board, owner: { id: null, name: 'Owner', system: true } }; };

test('a task has a lead, members and a deliverable; the creator leads it unless someone else is named; names must be people here', { skip }, () => {
  const w = setup();
  const t = w.board.create(w.ownerId, w.companyId, w.who('zayd'), { title: 'Write the engine', description: 'Six variables, twelve values each.', members: ['Kasia', 'Tavita Fa\'asavalu'], deliverable: 'engine.json' });
  assert.deepEqual([t.title, t.status, t.lead.name, t.members.map(m => m.name), t.deliverable, t.createdBy.name, t.needsTeam], ['Write the engine', 'todo', 'Zayd Siddiqui', ['Kasia Wójcik-Lindqvist', "Tavita Fa'asavalu"], 'engine.json', 'Zayd Siddiqui', false]);
  assert.equal(t.log[0].text, 'created the task');

  const led = w.board.create(w.ownerId, w.companyId, w.who('zayd'), { title: 'Review it', lead: 'Kasia', members: ['Kasia', 'Zayd'] });
  assert.equal(led.lead.name, 'Kasia Wójcik-Lindqvist');
  assert.deepEqual(led.members.map(m => m.name), ['Zayd Siddiqui'], 'the lead is not also listed as a member');

  const err = (task) => { try { w.board.create(w.ownerId, w.companyId, w.who('zayd'), task); } catch (e) { return e; } return null; };
  assert.match(err({ title: 'x', lead: 'Nobody' }).message, /no one here is called "Nobody"/);
  assert.match(err({ title: 'x', members: ['Rima', 'Ghost'] }).message, /no one here is called "Ghost"/);
  assert.equal(err({ title: '' }).status, 400);
  assert.equal(err({ title: 'x'.repeat(L.title + 1) }).status, 400);
  assert.equal(err({ title: 'x', description: 'd'.repeat(L.description + 1) }).status, 400);
  assert.equal(err({ title: 'x', description: 'AIzaSyA1234567890abcdefghijklmnopqrstuvw' }).code, 'secret_in_text');
  assert.equal(err({ title: 'x', doneWhen: 'not a list' }).status, 400);
  assert.equal(err({ title: 'x', members: ['Rima', 'Kasia', 'Zayd', 'Tavita', 'Rima', 'Kasia', 'Zayd', 'Tavita'] }), null, 'repeats are one person');
  w.roster.close();
});

test('the lead, the creator and the owner can change a task; a member can report progress and add a note; nobody else can do anything', { skip }, () => {
  const w = setup();
  const t = w.board.create(w.ownerId, w.companyId, w.who('rima'), { title: 'The engine', lead: 'Zayd', members: ['Kasia'] });
  const mem = w.who('kasia');
  const lead = w.who('zayd');
  const outsider = w.who('tavita');

  assert.equal(w.board.update(w.ownerId, w.companyId, mem, t.id, { status: 'doing', note: 'reading the values' }).status, 'doing');
  assert.match(w.board.get(w.ownerId, w.companyId, t.id).log.at(-1).text, /moved it to doing; noted: reading the values/);
  assert.throws(() => w.board.update(w.ownerId, w.companyId, mem, t.id, { status: 'done' }), (e) => e.code === 'not_allowed' && /its lead closes it/.test(e.message));
  assert.throws(() => w.board.update(w.ownerId, w.companyId, mem, t.id, { members: [] }), (e) => e.code === 'not_allowed');
  assert.throws(() => w.board.update(w.ownerId, w.companyId, outsider, t.id, { note: 'let me in' }), (e) => e.code === 'not_allowed');

  assert.equal(w.board.update(w.ownerId, w.companyId, lead, t.id, { status: 'review', deliverable: 'engine.json' }).deliverable, 'engine.json');
  assert.equal(w.board.update(w.ownerId, w.companyId, w.who('rima'), t.id, { status: 'done' }).status, 'done', 'the creator can close it');
  const changed = w.board.update(w.ownerId, w.companyId, w.owner, t.id, { lead: 'Tavita', members: ['Kasia', 'Zayd'], needsTeam: true });
  assert.deepEqual([changed.lead.name, changed.members.map(m => m.name), changed.needsTeam], ["Tavita Fa'asavalu", ['Kasia Wójcik-Lindqvist', 'Zayd Siddiqui'], true]);
  assert.throws(() => w.board.update(w.ownerId, w.companyId, w.owner, t.id, { status: 'finished' }), (e) => e.status === 400);
  assert.equal(w.board.update(w.ownerId, w.companyId, w.owner, t.id, {}).id, t.id, 'nothing to change is not an error');
  assert.throws(() => w.board.update(w.ownerId, w.companyId, lead, 'nope', { note: 'x' }), (e) => e.status === 404);
  assert.throws(() => w.board.update(newId(), w.companyId, w.owner, t.id, { note: 'x' }), (e) => e.status === 404);
  w.roster.close();
});

test('the list shows open tasks by default, can be filtered, and says who holds what; the owner makes the task team', { skip }, () => {
  const w = setup();
  const a = w.board.create(w.ownerId, w.companyId, w.who('zayd'), { title: 'A', members: ['Kasia'] });
  clock.tick();
  const b = w.board.create(w.ownerId, w.companyId, w.who('rima'), { title: 'B' });
  w.board.update(w.ownerId, w.companyId, w.who('rima'), b.id, { status: 'done' });
  assert.deepEqual(w.board.list(w.ownerId, w.companyId).map(t => t.title), ['A']);
  assert.deepEqual(w.board.list(w.ownerId, w.companyId, { includeClosed: true }).map(t => t.title), ['B', 'A']);
  assert.deepEqual(w.board.list(w.ownerId, w.companyId, { status: 'done' }).map(t => t.title), ['B']);
  assert.deepEqual(w.board.openFor(w.ownerId, w.companyId, w.who('kasia').id).map(t => t.title), ['A'], 'a member holds it too');
  assert.deepEqual(w.board.openFor(w.ownerId, w.companyId, w.who('tavita').id), []);

  w.board.update(w.ownerId, w.companyId, w.who('zayd'), a.id, { needsTeam: true });
  assert.equal(w.board.get(w.ownerId, w.companyId, a.id).teamDepartmentId, null, 'asking does not make a room');
  assert.equal(w.board.setTeam(w.ownerId, w.companyId, a.id, 'beef0001').teamDepartmentId, 'beef0001');
  assert.deepEqual(w.board.remove(w.ownerId, w.companyId, a.id), { removed: true });
  w.roster.close();
});

test('the board holds only so many open tasks, and a task is its company\'s own', { skip }, () => {
  const w = setup();
  for (let i = 0; i < L.openTasks; i++) w.board.create(w.ownerId, w.companyId, w.who('zayd'), { title: `Task ${i}` });
  assert.throws(() => w.board.create(w.ownerId, w.companyId, w.who('zayd'), { title: 'One too many' }), (e) => e.code === 'board_full');
  const first = w.board.list(w.ownerId, w.companyId, { limit: 200 }).at(-1);
  w.board.update(w.ownerId, w.companyId, w.who('zayd'), first.id, { status: 'cancelled' });
  assert.equal(w.board.create(w.ownerId, w.companyId, w.who('zayd'), { title: 'Room again' }).status, 'todo');
  assert.equal(w.board.list(newId(), w.companyId).length, 0);
  assert.equal(w.board.list(w.ownerId, newId()).length, 0);
  assert.throws(() => w.board.get(w.ownerId, newId(), first.id), (e) => e.status === 404);
  assert.equal(w.board.removeCompany(w.ownerId, w.companyId).removed, L.openTasks + 1);
  w.roster.close();
});
