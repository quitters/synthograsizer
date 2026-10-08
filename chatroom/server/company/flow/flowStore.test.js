import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FlowStore, MAX_FLOWS_PER_OWNER, MAX_PROGRESS } from './flowStore.js';
import { tempDir } from '../testKit.js';
import { newId } from '../util.js';

/** Flows on disk: one file each, written whole, loaded back, kept apart by owner, and never trusted further than their name. */

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });
const fresh = () => { const dir = tempDir(); cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };
const plan = { company: { name: 'X' }, departments: [{ key: 'd1', name: 'R', positions: [] }], provenance: {} };

test('a flow is saved whole and comes back the same after a restart', () => {
  const dir = fresh();
  const owner = newId();
  const a = new FlowStore({ rootDir: dir });
  const f = a.create(owner, { prompt: 'p', plan, cast: { people: {}, castings: {} }, spend: { usd: 0 } });
  assert.equal(f.state, 'proposed');
  assert.match(f.id, /^[a-f0-9]{32}$/);
  assert.ok(fs.existsSync(path.join(dir, 'flow', owner, `${f.id}.json`)));
  f.cast.people.d1p1 = { status: 'ready' };
  a.save(f);
  const b = new FlowStore({ rootDir: dir });
  assert.deepEqual(b.get(owner, f.id).cast.people, { d1p1: { status: 'ready' } });
  assert.equal(b.list(owner).length, 1);
});

test('another visitor\'s flow is "no such flow", never "not yours"', () => {
  const dir = fresh();
  const store = new FlowStore({ rootDir: dir });
  const owner = newId();
  const f = store.create(owner, { prompt: 'p', plan });
  assert.throws(() => store.get(newId(), f.id), (e) => e.status === 404 && e.code === 'no_flow');
  assert.throws(() => store.get(owner, 'not-an-id'), (e) => e.status === 404);
  assert.throws(() => store.remove(newId(), f.id), (e) => e.status === 404);
  assert.deepEqual(store.list(newId()), []);
});

test('the progress log keeps the latest lines', () => {
  const store = new FlowStore({ rootDir: fresh() });
  const f = store.create(newId(), { prompt: 'p', plan });
  for (let i = 0; i < MAX_PROGRESS + 50; i++) store.note(f, `line ${i}`);
  assert.equal(f.progress.length, MAX_PROGRESS);
  assert.equal(f.progress.at(-1).text, `line ${MAX_PROGRESS + 49}`);
  store.note(f, 'x'.repeat(1000));
  assert.equal(f.progress.at(-1).text.length, 300);
});

test('a flow that was casting or creating when the server stopped is marked failed on the next start, with a line saying so', () => {
  const dir = fresh();
  const owner = newId();
  const a = new FlowStore({ rootDir: dir });
  const casting = a.create(owner, { prompt: 'p', plan });
  const creating = a.create(owner, { prompt: 'q', plan });
  const done = a.create(owner, { prompt: 'r', plan });
  casting.state = 'casting'; a.save(casting);
  creating.state = 'creating'; a.save(creating);
  done.state = 'created'; a.save(done);
  const b = new FlowStore({ rootDir: dir });
  assert.equal(b.get(owner, casting.id).state, 'failed');
  assert.match(b.get(owner, casting.id).progress.at(-1).text, /being cast/);
  assert.equal(b.get(owner, creating.id).state, 'failed');
  assert.match(b.get(owner, creating.id).progress.at(-1).text, /being created/);
  assert.equal(b.get(owner, done.id).state, 'created');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'flow', owner, `${casting.id}.json`), 'utf8')).state, 'failed', 'and it is saved that way');
});

test('a file that is not what its name says is skipped, not trusted', () => {
  const dir = fresh();
  const owner = newId();
  const a = new FlowStore({ rootDir: dir });
  const f = a.create(owner, { prompt: 'p', plan });
  const other = newId();
  fs.mkdirSync(path.join(dir, 'flow', owner), { recursive: true });
  fs.writeFileSync(path.join(dir, 'flow', owner, `${other}.json`), JSON.stringify({ ...f, id: newId() }));      // named one thing, says another
  fs.writeFileSync(path.join(dir, 'flow', owner, `${newId()}.json`), 'not json');
  fs.writeFileSync(path.join(dir, 'flow', owner, 'notes.json'), '{}');
  fs.mkdirSync(path.join(dir, 'flow', '..%2f..'), { recursive: true });
  const stranger = newId();
  fs.mkdirSync(path.join(dir, 'flow', stranger), { recursive: true });
  fs.writeFileSync(path.join(dir, 'flow', stranger, `${f.id}.json`), JSON.stringify(f));                          // somebody else's folder holds a copy
  const b = new FlowStore({ rootDir: dir });
  assert.deepEqual(b.list(owner).map(x => x.id), [f.id]);
  assert.deepEqual(b.list(stranger), [], 'the copy in the wrong folder was not believed');
});

test('a visitor keeps at most twenty: the oldest finished one makes room, and if none is finished nothing is made', () => {
  const store = new FlowStore({ rootDir: fresh() });
  const owner = newId();
  const first = store.create(owner, { prompt: 'first', plan });
  first.state = 'created'; store.save(first);
  for (let i = 1; i < MAX_FLOWS_PER_OWNER; i++) store.create(owner, { prompt: `n${i}`, plan });
  assert.equal(store.list(owner).length, MAX_FLOWS_PER_OWNER);
  store.create(owner, { prompt: 'twenty-first', plan });
  assert.equal(store.list(owner).length, MAX_FLOWS_PER_OWNER);
  assert.throws(() => store.get(owner, first.id), (e) => e.status === 404, 'the finished one was retired');
  assert.throws(() => store.create(owner, { prompt: 'twenty-second', plan }), (e) => e.code === 'flow_cap');
});

test('a running flow cannot be removed; any other can, and its file goes', () => {
  const dir = fresh();
  const store = new FlowStore({ rootDir: dir });
  const owner = newId();
  const f = store.create(owner, { prompt: 'p', plan });
  f.state = 'casting'; store.save(f);
  assert.throws(() => store.remove(owner, f.id), (e) => e.status === 409 && e.code === 'flow_running');
  f.state = 'failed'; store.save(f);
  assert.deepEqual(store.remove(owner, f.id), { deleted: true });
  assert.ok(!fs.existsSync(path.join(dir, 'flow', owner, `${f.id}.json`)));
  assert.deepEqual(store.list(owner), []);
});

test('everything an owner has can be removed at once (an account deletion), and nobody else\'s is touched', () => {
  const dir = fresh();
  const store = new FlowStore({ rootDir: dir });
  const [a, b] = [newId(), newId()];
  store.create(a, { prompt: '1', plan });
  store.create(a, { prompt: '2', plan });
  const kept = store.create(b, { prompt: '3', plan });
  assert.deepEqual(store.purgeOwner(a), { flows: 2 });
  assert.deepEqual(store.list(a), []);
  assert.ok(!fs.existsSync(path.join(dir, 'flow', a)));
  assert.equal(store.get(b, kept.id).prompt, '3');
});
