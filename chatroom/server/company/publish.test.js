import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AI_LABEL } from './publishQueue.js';
import { ArtifactStore } from '../services/artifactStore.js';
import { MediaStore } from '../services/mediaStore.js';
import { createToolDispatcher } from '../services/toolDispatch.js';
import { FUNCTION_DECLARATIONS } from '../services/toolDefinitions.js';
import { TOOL_TIERS } from '../config/tools.js';
import { makeServices, makeRoom, markerClassifier, scripted, until, FORBIDDEN } from './testKit.js';
import { newId, sha256 } from './util.js';

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });

const PNG = Buffer.from('not really a png, but bytes all the same').toString('base64');

function setup({ classify = markerClassifier({ [FORBIDDEN]: 'deception', 'MOUSE-FAN': 'copyrighted_character' }), body = {} } = {}) {
  const { services, dir, cleanup } = makeServices({ classify });
  cleanups.push(cleanup);
  const ownerId = newId();
  const company = services.store.create(ownerId, { name: 'Tide Pool Studio', departments: ['Desk'], ...body });
  const artifacts = new ArtifactStore();
  const media = new MediaStore();
  const sources = { artifact: (n) => artifacts.get(n) || null, media: (id) => media.get(id) || null };
  return { services, dir, company, ownerId, artifacts, media, sources, queue: services.publish };
}

const propose = (ctx, over = {}) => ctx.queue.propose(ctx.company.id, { kind: 'text', title: 'Tide notes', text: 'Anemones close when the tide goes out.', by: 'Ann Test', ...over }, ctx.sources);
const auditOf = (ctx) => ctx.services.audit.read(ctx.company.id);

// ── proposing ────────────────────────────────────────────────────────────────

test('a proposal is screened at the publishing stage and waits for a person; nothing is approved by being proposed', async () => {
  const classify = markerClassifier({ [FORBIDDEN]: 'deception' });
  const ctx = setup({ classify });
  const item = await propose(ctx);
  assert.equal(item.status, 'pending');
  assert.equal(item.screen.verdict, 'pass');
  assert.equal(item.screen.stage, 'publishing');
  assert.equal(item.by, 'Ann Test');
  assert.equal(item.label, AI_LABEL);
  assert.equal(classify.calls.at(-1).stage, 'publishing');
  assert.equal(ctx.queue.list(ctx.company.id).length, 1);
  assert.throws(() => ctx.queue.exportBundle(ctx.company.id, item.id), (e) => e.code === 'not_approved');
});

test('the publishing stage applies the publishing floor that drafting does not', async () => {
  const ctx = setup();
  const draft = await ctx.services.screen.check({ stage: 'drafting', mandate: ctx.services.operator.mandate, parts: [{ type: 'text', text: 'MOUSE-FAN story' }] });
  assert.equal(draft.verdict, 'pass', 'a fan story is a draft');
  const blocked = await propose(ctx, { text: 'MOUSE-FAN story' });
  assert.equal(blocked.status, 'blocked');
  assert.deepEqual(blocked.screen.findings.map(f => f.rule), ['copyrighted_character']);
});

test('a proposal is a snapshot: what the screen read, what a person approves and what is exported are the same bytes, whatever happens to the file in the room', async () => {
  const ctx = setup();
  ctx.artifacts.save('poster.html', '<h1>Tide pools</h1>');
  const item = await propose(ctx, { kind: 'artifact', title: 'Poster', ref: 'poster.html', text: undefined });
  assert.equal(item.filename, 'poster.html');
  assert.equal(item.sha256, sha256(Buffer.from('<h1>Tide pools</h1>')));

  ctx.artifacts.save('poster.html', `<h1>${FORBIDDEN}</h1>`);        // the room edits the file afterwards
  ctx.queue.approve(ctx.company.id, item.id);
  const out = ctx.queue.exportBundle(ctx.company.id, item.id);
  const file = out.files.find(f => f.name === 'poster.html');
  assert.ok(file.data.includes('<h1>Tide pools</h1>') && !file.data.includes(FORBIDDEN));
});

test('an image proposal sends the screen the picture itself and the prompt that made it', async () => {
  const classify = markerClassifier({});
  const ctx = setup({ classify });
  ctx.media.add({ id: 'img1', type: 'image', data: PNG, mimeType: 'image/png', prompt: 'a calm tide pool at dawn' });
  const item = await propose(ctx, { kind: 'image', title: 'Tide pool', ref: 'img1', text: undefined });
  assert.equal(item.status, 'pending');
  const parts = classify.calls.at(-1).parts;
  assert.ok(parts.some(p => p.type === 'image' && p.data === PNG));
  assert.ok(parts.some(p => p.type === 'text' && p.text.includes('a calm tide pool at dawn')));
});

test('a prompt that names a living artist is caught at publishing even when the picture looks fine', async () => {
  const ctx = setup({ classify: markerClassifier({ 'IN-THE-STYLE-OF-A-LIVING-ARTIST': 'living_artist_style' }) });
  ctx.media.add({ id: 'img1', type: 'image', data: PNG, mimeType: 'image/png', prompt: 'a pond, IN-THE-STYLE-OF-A-LIVING-ARTIST' });
  const item = await propose(ctx, { kind: 'image', title: 'Pond', ref: 'img1', text: undefined });
  assert.equal(item.status, 'blocked');
  assert.deepEqual(item.screen.findings.map(f => f.rule), ['living_artist_style']);
});

test('the work must exist, be the right kind, be a sane size and hold no secrets', async () => {
  const ctx = setup();
  await assert.rejects(() => propose(ctx, { kind: 'artifact', title: 'x', ref: 'nope.html', text: undefined }), (e) => e.code === 'no_such_work' && e.status === 404);
  await assert.rejects(() => propose(ctx, { kind: 'image', title: 'x', ref: 'nope', text: undefined }), (e) => e.code === 'no_such_work');
  ctx.media.add({ id: 'vid', type: 'video', data: PNG, mimeType: 'video/mp4' });
  await assert.rejects(() => propose(ctx, { kind: 'image', title: 'x', ref: 'vid', text: undefined }), (e) => e.code === 'no_such_work', 'a video is not a picture');
  await assert.rejects(() => propose(ctx, { text: '   ' }), (e) => e.code === 'bad_proposal');
  await assert.rejects(() => propose(ctx, { text: 'x'.repeat(100_001) }), (e) => e.code === 'bad_proposal');
  await assert.rejects(() => propose(ctx, { text: 'my key AIza' + 'SyA1234567890abcdefghijklmnopqrstuv' }), (e) => e.code === 'secret_in_text');
  await assert.rejects(() => propose(ctx, { title: 'key AIza' + 'SyA1234567890abcdefghijklmnopqrstuv' }), (e) => e.code === 'secret_in_text');
  ctx.artifacts.save('keys.js', 'const k = "AIza' + 'SyA1234567890abcdefghijklmnopqrstuv";');
  await assert.rejects(() => propose(ctx, { kind: 'artifact', title: 'x', ref: 'keys.js', text: undefined }), (e) => e.code === 'secret_in_text');
  await assert.rejects(() => propose(ctx, { kind: 'film' }), (e) => e.code === 'bad_proposal');
  await assert.rejects(() => propose(ctx, { approved: true, status: 'approved' }), (e) => e.code === 'bad_proposal', 'a proposal cannot carry its own approval');
  assert.equal(ctx.queue.list(ctx.company.id).length, 0, 'nothing refused was queued');
});

test('only so many proposals can wait for a person at once', async () => {
  const ctx = setup({ body: { ceilings: { maxPendingProposals: 2 } } });
  const a = await propose(ctx, { title: 'One' });
  await propose(ctx, { title: 'Two' });
  await assert.rejects(() => propose(ctx, { title: 'Three' }), (e) => e.code === 'proposal_cap' && e.status === 403);
  ctx.queue.reject(ctx.company.id, a.id, 'not now');
  assert.equal((await propose(ctx, { title: 'Three' })).status, 'pending');
});

// ── the screen's verdict is final ────────────────────────────────────────────

test('work the screen blocks cannot be approved, cannot be re-screened until it changes, and can be rejected', async () => {
  const ctx = setup();
  const item = await propose(ctx, { text: `A piece with ${FORBIDDEN} in it.` });
  assert.equal(item.status, 'blocked');
  assert.throws(() => ctx.queue.approve(ctx.company.id, item.id), (e) => e.code === 'blocked' && /Nothing built to deceive/.test(e.message));
  await assert.rejects(() => ctx.queue.rescreen(ctx.company.id, item.id), (e) => e.code === 'block_is_final');
  assert.throws(() => ctx.queue.exportBundle(ctx.company.id, item.id), (e) => e.code === 'not_approved');
  assert.equal(ctx.queue.reject(ctx.company.id, item.id, 'not publishable').status, 'rejected');

  const revised = await propose(ctx, { text: 'The same piece, rewritten.' });
  assert.equal(revised.status, 'pending', 'revised work is a new proposal and is screened afresh');
});

test('a block cannot be gamed by asking the reviewer again: a reviewer that would pass it on a second look is never consulted', async () => {
  let calls = 0;
  const flaky = async ({ rules }) => {
    calls += 1;
    return { findings: calls === 1 && rules.some(r => r.id === 'deception') ? [{ rule: 'deception', severity: 'block', why: 'it looked like fake news' }] : [], model: 'stub' };
  };
  const ctx = setup({ classify: flaky });
  const item = await propose(ctx);
  assert.equal(item.status, 'blocked');
  for (let i = 0; i < 3; i++) await assert.rejects(() => ctx.queue.rescreen(ctx.company.id, item.id), (e) => e.code === 'block_is_final');
  assert.equal(calls, 1);
});

test('if the screen cannot run the proposal is "unavailable": it cannot be approved until a review succeeds', async () => {
  let up = false;
  const classify = async () => { if (!up) throw new Error('503'); return { findings: [], model: 'stub' }; };
  const ctx = setup({ classify });
  const item = await propose(ctx);
  assert.equal(item.status, 'unavailable');
  assert.equal(item.screen.verdict, 'unavailable');
  assert.throws(() => ctx.queue.approve(ctx.company.id, item.id), (e) => e.code === 'unreviewed');
  assert.equal((await ctx.queue.rescreen(ctx.company.id, item.id)).status, 'unavailable', 'still down');

  up = true;
  assert.equal((await ctx.queue.rescreen(ctx.company.id, item.id)).status, 'pending');
  assert.equal(ctx.queue.approve(ctx.company.id, item.id).status, 'approved');
});

test('a proposal waiting for a person only ever gets stricter on a second look: a block applies, an outage changes nothing', async () => {
  let mode = 'pass';
  const classify = async () => {
    if (mode === 'down') throw new Error('503');
    return { findings: mode === 'block' ? [{ rule: 'deception', severity: 'block', why: 'now it looks like fake news' }] : [], model: 'stub' };
  };
  const ctx = setup({ classify });
  const item = await propose(ctx);
  mode = 'down';
  assert.equal((await ctx.queue.rescreen(ctx.company.id, item.id)).status, 'pending', 'an earlier pass is not undone by an outage');
  mode = 'block';
  assert.equal((await ctx.queue.rescreen(ctx.company.id, item.id)).status, 'blocked');
});

// ── approval and export ──────────────────────────────────────────────────────

test('approval is recorded, final, and only a pending proposal can be approved', async () => {
  const ctx = setup();
  const item = await propose(ctx);
  const approved = ctx.queue.approve(ctx.company.id, item.id);
  assert.equal(approved.status, 'approved');
  assert.equal(approved.decidedBy, 'owner');
  assert.match(approved.decidedAt, /^\d{4}-\d\d-\d\dT/);
  assert.throws(() => ctx.queue.approve(ctx.company.id, item.id), (e) => e.code === 'already_decided');
  assert.throws(() => ctx.queue.reject(ctx.company.id, item.id), (e) => e.code === 'already_decided');
  await assert.rejects(() => ctx.queue.rescreen(ctx.company.id, item.id), (e) => e.code === 'not_waiting');
  assert.throws(() => ctx.queue.approve(ctx.company.id, 'ffffffffffffffff'), (e) => e.code === 'no_proposal' && e.status === 404);
  assert.throws(() => ctx.queue.approve(ctx.company.id, '../../x'), (e) => e.code === 'no_proposal');
});

test('an approved piece is exported with its label: in a manifest, in a note beside it, and in the work where its format has room for a line', async () => {
  const ctx = setup();
  ctx.artifacts.save('poster.html', '<!doctype html><h1>Tide pools</h1>');
  ctx.artifacts.save('engine.json', '{"promptTemplate":"x","variables":[]}');
  ctx.artifacts.save('sketch.js', 'function setup(){}');
  ctx.artifacts.save('notes.md', '# Notes');
  ctx.media.add({ id: 'img1', type: 'image', data: PNG, mimeType: 'image/png', prompt: 'a calm tide pool' });

  const bundle = async (over) => {
    const item = await propose(ctx, over);
    ctx.queue.approve(ctx.company.id, item.id);
    return ctx.queue.exportBundle(ctx.company.id, item.id);
  };

  const text = await bundle({ title: 'Tide notes' });
  assert.deepEqual(text.files.map(f => f.name), ['tide-notes.txt', 'AI-GENERATED.txt', 'manifest.json']);
  assert.match(text.files[0].data, /Anemones close when the tide goes out\.\n\n---\nAI-generated: made by an AI agent company \(Tide Pool Studio\) and approved by a person on \d{4}-\d\d-\d\d\./);
  assert.equal(text.manifest.label, AI_LABEL);
  assert.equal(text.manifest.aiGenerated, true);
  assert.equal(text.manifest.company, 'Tide Pool Studio');
  assert.equal(text.manifest.proposedBy, 'Ann Test');
  assert.match(text.manifest.approvedBy, /a person/);
  assert.match(text.files[1].data, /^AI-generated/);
  assert.deepEqual(JSON.parse(text.files[2].data), text.manifest);

  const html = (await bundle({ kind: 'artifact', title: 'Poster', ref: 'poster.html', text: undefined })).files[0];
  assert.match(html.data, /^<!-- AI-generated: made by an AI agent company/);
  assert.ok(html.data.endsWith('<!doctype html><h1>Tide pools</h1>'));
  assert.match((await bundle({ kind: 'artifact', title: 'Sketch', ref: 'sketch.js', text: undefined })).files[0].data, /^\/\* AI-generated:/);
  assert.match((await bundle({ kind: 'artifact', title: 'Notes', ref: 'notes.md', text: undefined })).files[0].data, /\n---\nAI-generated:/);
  const json = await bundle({ kind: 'artifact', title: 'Engine', ref: 'engine.json', text: undefined });
  assert.equal(json.files[0].data, '{"promptTemplate":"x","variables":[]}', 'JSON has no room for a line, so the work is unchanged and the manifest carries the label');
  assert.equal(json.manifest.label, AI_LABEL);

  const image = await bundle({ kind: 'image', title: 'Tide pool', ref: 'img1', text: undefined });
  assert.equal(image.files[0].name, 'tide-pool.png');
  assert.equal(image.files[0].encoding, 'base64');
  assert.equal(image.files[0].data, PNG, 'the picture itself is not altered');
  assert.equal(image.manifest.sha256, sha256(Buffer.from(PNG, 'base64')));
});

test('if the stored work no longer matches what was reviewed it can be neither approved nor exported', async () => {
  const ctx = setup();
  const item = await propose(ctx);
  const file = path.join(ctx.dir, 'companies', ctx.company.id, 'publish', item.id, 'content.txt');
  fs.writeFileSync(file, 'something else entirely');
  assert.throws(() => ctx.queue.approve(ctx.company.id, item.id), (e) => e.code === 'content_changed');

  const second = await propose(ctx, { title: 'Second' });
  ctx.queue.approve(ctx.company.id, second.id);
  fs.writeFileSync(path.join(ctx.dir, 'companies', ctx.company.id, 'publish', second.id, 'content.txt'), 'swapped after approval');
  assert.throws(() => ctx.queue.exportBundle(ctx.company.id, second.id), (e) => e.code === 'content_changed');
});

test('a rejection records why, and the list can be filtered by status', async () => {
  const ctx = setup();
  const a = await propose(ctx, { title: 'A' });
  await propose(ctx, { title: 'B' });
  const r = ctx.queue.reject(ctx.company.id, a.id, 'This is not what we asked for.');
  assert.equal(r.status, 'rejected');
  assert.equal(r.rejectedBecause, 'This is not what we asked for.');
  assert.deepEqual(ctx.queue.list(ctx.company.id, { status: 'pending' }).map(i => i.title), ['B']);
  assert.deepEqual(ctx.queue.list(ctx.company.id, { status: 'rejected' }).map(i => i.title), ['A']);
});

test('the list never carries the work itself; opening one proposal does', async () => {
  const ctx = setup();
  const item = await propose(ctx);
  assert.ok(!JSON.stringify(ctx.queue.list(ctx.company.id)).includes('Anemones'));
  const full = ctx.queue.get(ctx.company.id, item.id);
  assert.equal(full.content.data, 'Anemones close when the tide goes out.');
  assert.equal(full.content.encoding, 'utf8');
});

test('the audit log records proposals, approvals and exports as decisions, never the work', async () => {
  const ctx = setup();
  const item = await propose(ctx, { text: `Contains ${FORBIDDEN} so it will be blocked, and then some words nobody should find in a log.` });
  const ok = await propose(ctx, { title: 'Fine', text: 'Words nobody should find in a log.' });
  ctx.queue.approve(ctx.company.id, ok.id);
  ctx.queue.exportBundle(ctx.company.id, ok.id);
  const types = auditOf(ctx).map(e => e.type);
  assert.deepEqual(types, ['publish_proposed', 'publish_proposed', 'publish_approved', 'publish_exported']);
  assert.deepEqual(auditOf(ctx)[0].rules, ['deception']);
  assert.ok(!JSON.stringify(auditOf(ctx)).includes('nobody should find'));
  assert.ok(!JSON.stringify(auditOf(ctx)).includes(FORBIDDEN));
  assert.equal(item.status, 'blocked');
});

// ── only a person approves ───────────────────────────────────────────────────

test('no tool an agent can be given reaches approval, rejection or export: the only publishing tool is propose_publish', () => {
  const allTools = new Set(Object.values(TOOL_TIERS).flat());
  for (const name of [...allTools, ...Object.keys(FUNCTION_DECLARATIONS)]) {
    assert.ok(!/approve|reject|export|publish|release|ship/i.test(name) || name === 'propose_publish', `${name} must not be a way to publish`);
  }
  assert.ok(!allTools.has('propose_publish'), 'it belongs to no tier: a company room adds it, and nothing else does');
  assert.deepEqual(FUNCTION_DECLARATIONS.propose_publish.parameters.required, ['kind', 'title']);
  assert.deepEqual(Object.keys(FUNCTION_DECLARATIONS.propose_publish.parameters.properties).sort(), ['kind', 'note', 'ref', 'text', 'title']);
});

test('a dispatcher will not run approve, reject, export or publish by name, however it is asked', async () => {
  const dispatch = createToolDispatcher({
    agent: { id: 'a', name: 'Ann Test' }, mediaStore: new MediaStore(), artifactStore: new ArtifactStore(),
    propose: async () => ({ ok: true, id: 'x', status: 'pending' }),
  });
  for (const name of ['approve_publish', 'approve', 'reject_publish', 'export_publish', 'publish', 'publish_now', 'release']) {
    const r = await dispatch({ id: '1', name, arguments: { id: 'x', item: 'x', approved: true } });
    assert.equal(r.ok, false, name);
    assert.match(r.summary, /Unknown tool/);
  }
});

test('the propose tool queues a proposal and nothing more: extra fields cannot set a status, and the answer tells the agent it is not published', async () => {
  const ctx = setup();
  const { services } = ctx;
  const { orchestrator, policy } = makeRoom({ services, ownerId: ctx.ownerId, departmentName: 'Writers', body: { name: 'Second Co' } });
  orchestrator.addAgent('Ann Test', 'You are Ann.');
  const ann = orchestrator.agents[0];
  const dispatch = orchestrator._createDispatcher(ann, []);
  const r = await dispatch({ id: '1', name: 'propose_publish', arguments: { kind: 'text', title: 'Tide notes', text: 'Anemones close.', status: 'approved', approved: true, decidedBy: 'owner' } });
  assert.equal(r.ok, true);
  assert.match(r.result[0].text, /waiting for a person to review/);
  assert.match(r.result[0].text, /has not been published/);
  const queued = services.publish.list(policy.companyId);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].status, 'pending');
  assert.equal(queued[0].by, 'Ann Test');
  assert.equal(queued[0].decidedBy, null);
});

test('a proposal made inside a room carries the room, and an agent cannot use it to reach another company\'s queue', async () => {
  const ctx = setup();
  const { services } = ctx;
  const mine = makeRoom({ services, ownerId: ctx.ownerId, body: { name: 'Mine' } });
  const theirs = makeRoom({ services, body: { name: 'Theirs' } });
  mine.orchestrator.addAgent('Ann Test', 'You are Ann.');
  const dispatch = mine.orchestrator._createDispatcher(mine.orchestrator.agents[0], []);
  await dispatch({ id: '1', name: 'propose_publish', arguments: { kind: 'text', title: 'Mine only', text: 'hello', companyId: theirs.company.id, roomId: theirs.dept.roomId } });
  assert.equal(services.publish.list(mine.company.id).length, 1);
  assert.equal(services.publish.list(mine.company.id)[0].roomId, mine.dept.roomId);
  assert.equal(services.publish.list(theirs.company.id).length, 0);
});

test('an agent that proposes gets an honest answer when the proposal is refused', async () => {
  const ctx = setup({ body: { ceilings: { maxPendingProposals: 1 } } });
  const { services } = ctx;
  const room = makeRoom({ services, ownerId: ctx.ownerId, body: { name: 'Roomy', ceilings: { maxPendingProposals: 1 } } });
  room.orchestrator.addAgent('Ann Test', 'You are Ann.');
  const dispatch = room.orchestrator._createDispatcher(room.orchestrator.agents[0], []);
  assert.equal((await dispatch({ id: '1', name: 'propose_publish', arguments: { kind: 'text', title: 'One', text: 'a' } })).ok, true);
  const second = await dispatch({ id: '2', name: 'propose_publish', arguments: { kind: 'text', title: 'Two', text: 'b' } });
  assert.equal(second.ok, false);
  assert.match(second.result[0].text, /already waiting for a person/);
});

test('proposals made by agents running in a room appear for the owner, with the screen\'s verdict', async () => {
  const ctx = setup();
  const room = makeRoom({ services: ctx.services, ownerId: ctx.ownerId, body: { name: 'Live', ceilings: { maxTurns: 2 } } });
  room.orchestrator.addAgent('Ann Test', 'You are Ann.');
  room.orchestrator.addAgent('Ben Test', 'You are Ben.');
  // a scripted turn that calls the tool through the real dispatcher would need the model; the dispatcher is exercised above, so here
  // the proposal is made the way the dispatcher makes it, through the room's policy
  scripted(room.orchestrator, () => 'Working.');
  await room.orchestrator.start('Make a poster', 100000);
  await until(() => !room.orchestrator.isRunning);
  const item = await room.policy.propose({ kind: 'text', title: 'From the room', text: 'A finished paragraph.' }, room.orchestrator._publishSources(), 'Ann Test');
  assert.equal(item.status, 'pending');
  assert.equal(ctx.services.publish.list(room.company.id)[0].title, 'From the room');
});
