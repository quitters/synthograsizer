import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ArtifactStore } from '../services/artifactStore.js';
import { createToolDispatcher } from '../services/toolDispatch.js';
import { MediaStore } from '../services/mediaStore.js';
import { makeServices, markerClassifier, FORBIDDEN } from './testKit.js';
import { newId } from './util.js';

/**
 * A new proposal of the same file from the same room replaces the earlier ones that are still waiting. In the pilot the lead asked for
 * each new version of engine.json to be offered, three drafts used the whole queue, and only the last meant anything.
 */

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });

function setup({ maxPending = 3 } = {}) {
  const { services, cleanup } = makeServices({ classify: markerClassifier({ [FORBIDDEN]: 'deception' }) });
  cleanups.push(cleanup);
  const ownerId = newId();
  const company = services.store.create(ownerId, { name: 'Tide Pool Studio', departments: ['Desk', 'Annex'], ceilings: { maxPendingProposals: maxPending } });
  const [desk, annex] = company.departments;
  const artifacts = new ArtifactStore();
  const sources = { artifact: (n) => artifacts.get(n) || null, media: () => null };
  const offer = (over = {}) => services.publish.propose(company.id, { kind: 'artifact', title: 'The engine', ref: 'engine.json', roomId: desk.roomId, by: 'Zayd', ...over }, sources);
  return { services, company, desk, annex, artifacts, offer, queue: services.publish, audit: () => services.audit.read(company.id) };
}

test('a newer version of the same file from the same room retires the waiting one, and says so', async () => {
  const t = setup();
  t.artifacts.save('engine.json', '{"v":1}');
  const first = await t.offer();
  t.artifacts.save('engine.json', '{"v":2}');
  const second = await t.offer();

  assert.equal(second.status, 'pending');
  assert.deepEqual(second.superseded, [first.id]);
  const list = t.queue.list(t.company.id);
  assert.deepEqual(list.map(i => [i.id, i.status]), [[first.id, 'superseded'], [second.id, 'pending']]);
  const old = list[0];
  assert.equal(old.supersededBy, second.id);
  assert.equal(old.decidedBy, 'system', 'no person decided it');
  assert.ok(old.decidedAt);
  assert.ok(t.audit().some(e => e.type === 'publish_superseded' && e.proposal === first.id && e.by === second.id));
});

test('a superseded proposal cannot be approved, rejected, re-screened or exported; the work is still there to read', async () => {
  const t = setup();
  t.artifacts.save('engine.json', '{"v":1}');
  const first = await t.offer();
  t.artifacts.save('engine.json', '{"v":2}');
  await t.offer();

  assert.throws(() => t.queue.approve(t.company.id, first.id), (e) => e.code === 'already_decided' && /superseded/.test(e.message));
  assert.throws(() => t.queue.reject(t.company.id, first.id), (e) => e.code === 'already_decided');
  await assert.rejects(t.queue.rescreen(t.company.id, first.id), (e) => e.code === 'not_waiting');
  assert.throws(() => t.queue.exportBundle(t.company.id, first.id), (e) => e.code === 'not_approved');
  assert.equal(t.queue.get(t.company.id, first.id).content.data, '{"v":1}');
});

test('a replacement does not count against the cap; a different file still does', async () => {
  const t = setup({ maxPending: 1 });
  t.artifacts.save('engine.json', '{"v":1}');
  t.artifacts.save('poster.html', '<h1>x</h1>');
  await t.offer();
  t.artifacts.save('engine.json', '{"v":2}');
  const again = await t.offer();
  assert.equal(again.status, 'pending', 'the queue was full with one, and the new version replaced it');
  await assert.rejects(t.offer({ ref: 'poster.html', title: 'Poster' }), (e) => e.code === 'proposal_cap');
  assert.equal(t.queue.list(t.company.id).filter(i => i.status === 'pending').length, 1);
});

test('only the same room, the same file and the same kind are replaced; a decided proposal is left alone', async () => {
  const t = setup({ maxPending: 10 });
  t.artifacts.save('engine.json', '{"v":1}');
  t.artifacts.save('notes.md', 'notes');
  const mine = await t.offer();
  const other = await t.offer({ ref: 'notes.md', title: 'Notes' });
  const annex = await t.offer({ roomId: t.annex.roomId });                 // the same file name, offered from another room
  const text = await t.queue.propose(t.company.id, { kind: 'text', title: 'The engine', text: 'hello', roomId: t.desk.roomId, by: 'Zayd' }, {});
  const owner = await t.offer({ roomId: undefined, by: 'owner' });         // offered by the owner, from no room
  t.queue.approve(t.company.id, mine.id);

  t.artifacts.save('engine.json', '{"v":2}');
  const next = await t.offer();
  assert.deepEqual(next.superseded, [], 'the approved one is a decision, not a draft');
  const status = Object.fromEntries(t.queue.list(t.company.id).map(i => [i.id, i.status]));
  assert.equal(status[mine.id], 'approved');
  assert.equal(status[other.id], 'pending');
  assert.equal(status[annex.id], 'pending');
  assert.equal(status[text.id], 'pending');
  assert.equal(status[owner.id], 'pending');
  assert.equal(status[next.id], 'pending');
});

test('a newer version that the screen blocks does not retire the older one', async () => {
  const t = setup();
  t.artifacts.save('engine.json', '{"v":1}');
  const first = await t.offer();
  t.artifacts.save('engine.json', `{"v":2,"note":"${FORBIDDEN}"}`);
  const second = await t.offer();
  assert.equal(second.status, 'blocked');
  assert.deepEqual(second.superseded, []);
  assert.equal(t.queue.list(t.company.id).find(i => i.id === first.id).status, 'pending');
});

test('the agent is told that its new offer replaces the earlier one', async () => {
  const t = setup();
  t.artifacts.save('engine.json', '{"v":1}');
  await t.offer();
  t.artifacts.save('engine.json', '{"v":2}');
  const dispatch = createToolDispatcher({
    agent: { id: 'a', name: 'Zayd' }, mediaStore: new MediaStore(), artifactStore: t.artifacts,
    propose: async (args) => {
      const item = await t.queue.propose(t.company.id, { ...args, roomId: t.desk.roomId, by: 'Zayd' }, { artifact: (n) => t.artifacts.get(n) });
      return { ok: true, id: item.id, status: item.status, superseded: item.superseded };
    },
  });
  const out = await dispatch({ id: 'c', name: 'propose_publish', arguments: { kind: 'artifact', title: 'The engine', ref: 'engine.json' } });
  assert.equal(out.ok, true);
  assert.match(out.summary, /It replaces your earlier offer of this file/);
});
