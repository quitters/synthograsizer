/**
 * The HTTP side of "done when", the independent critic, showing the room, and rendering: the real app, a visitor with a cookie,
 * scripted agents and a stand-in critic. Nothing touches the network.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataRoot = mkdtempSync(join(tmpdir(), 'chatroom-tools-'));
process.env.WORKFLOW_DATA_DIR = join(dataRoot, 'workflows');
process.env.WORKFLOW_TRACES_DIR = join(dataRoot, 'traces');
process.env.CHATROOM_DATA_DIR = join(dataRoot, 'chatdata');   // (saving is off under node --test anyway)

const { createApp } = await import('./app.js');
const { getRoom, clearRooms } = await import('./services/sessionRegistry.js');
const { COOKIE_NAME } = await import('./middleware/session.js');

let server, base;
before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.closeAllConnections?.();
  server.close();
  clearRooms();
  rmSync(dataRoot, { recursive: true, force: true });
});

function visitor() {
  let cookie = null;
  return {
    get roomId() { return cookie?.split('=')[1]; },
    async call(method, path, body) {
      const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const issued = res.headers.getSetCookie().find(c => c.startsWith(`${COOKIE_NAME}=`));
      if (issued) cookie = issued.split(';')[0];
      let json = null;
      try { json = await res.json(); } catch { /* not JSON */ }
      return { status: res.status, json };
    },
  };
}

const PNG = Buffer.from('a pretend png').toString('base64');
async function until(cond, ms = 4000) {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 10));
  }
}

// ── done when ────────────────────────────────────────────────────────────────

test('done-when: set as a list or as one line per check, read back, run on demand', async () => {
  const v = visitor();
  assert.deepEqual((await v.call('GET', '/api/chat/done-when')).json.criteria, []);
  const set = await v.call('POST', '/api/chat/done-when', { text: 'artifact: engine.json\nregex: /FINAL/ in last_message\n# comment' });
  assert.equal(set.status, 200);
  assert.deepEqual(set.json.criteria.map(c => c.type), ['artifact', 'regex']);
  assert.equal(set.json.text, 'artifact: engine.json\nregex: /FINAL/ in last_message');
  assert.equal(set.json.maxBlocks, 8);

  const check = await v.call('POST', '/api/chat/done-when/check');
  assert.equal(check.json.passed, false);
  assert.match(check.json.results[0].detail, /no artifact named "engine.json"/);

  const room = getRoom(v.roomId);
  room.artifactStore.save('engine.json', '{}', 'a', 'Ann');
  room.orchestrator.messages.push({ id: 'm', agentName: 'Ann', content: 'FINAL answer', isUser: false });
  assert.equal((await v.call('POST', '/api/chat/done-when/check')).json.passed, true);

  const structured = await v.call('POST', '/api/chat/done-when', { criteria: [{ type: 'url', url: 'http://localhost:8000/api/health', status: 200 }], maxBlocks: 3 });
  assert.equal(structured.json.criteria[0].url, 'http://localhost:8000/api/health');
  assert.equal(structured.json.maxBlocks, 3);
  assert.equal((await v.call('POST', '/api/chat/done-when', { criteria: [] })).json.criteria.length, 0, 'an empty list turns the gate off');
  assert.equal((await v.call('POST', '/api/chat/done-when/check')).json.note, 'no checks are set');
});

test('done-when: bad checks are refused with line numbers, and nothing is changed', async () => {
  const v = visitor();
  await v.call('POST', '/api/chat/done-when', { text: 'artifact: keep.json' });
  const bad = await v.call('POST', '/api/chat/done-when', { text: 'artifact: ok.json\nhello world\nregex: /(/' });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.json.errors.map(e => e.split(':')[0]), ['line 2', 'line 3']);
  assert.equal((await v.call('GET', '/api/chat/done-when')).json.criteria[0].name, 'keep.json');
});

test('done-when can be set when a session starts', async () => {
  const v = visitor();
  await v.call('POST', '/api/agents', { name: 'Ann', bio: 'a' });
  await v.call('POST', '/api/agents', { name: 'Ben', bio: 'b' });
  const room = getRoom(v.roomId);
  room.orchestrator.delay = () => new Promise(r => setTimeout(r, 200));
  room.orchestrator._generate = async function* () { yield { type: 'complete', fullResponse: 'hello', tokenCount: 1 }; };
  const refused = await v.call('POST', '/api/chat/start', { goal: 'g', doneWhen: { text: 'nonsense line' } });
  assert.equal(refused.status, 400);
  assert.equal(room.orchestrator.isRunning, false);
  const ok = await v.call('POST', '/api/chat/start', { goal: 'g', doneWhen: { text: 'artifact: engine.json', maxBlocks: 4 } });
  assert.equal(ok.status, 200);
  assert.equal(room.orchestrator.doneWhen.criteria[0].name, 'engine.json');
  assert.equal(room.orchestrator.doneWhen.maxBlocks, 4);
  assert.equal(ok.json.state.doneWhen.checks, 1);
  await v.call('POST', '/api/chat/stop');
});

// ── show the room ────────────────────────────────────────────────────────────

test('show: a picture posted to the room joins the conversation and is kept', async () => {
  const v = visitor();
  const res = await v.call('POST', '/api/chat/show', { images: [{ dataUrl: `data:image/png;base64,${PNG}`, label: 'contact sheet' }], caption: 'The harness saw this.' });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const room = getRoom(v.roomId);
  assert.equal(room.orchestrator.messages.at(-1).content, 'The harness saw this.');
  assert.equal(room.orchestrator.messages.at(-1).agentName, 'Producer');
  assert.equal(room.mediaStore.get(res.json.imageIds[0]).data, PNG);
  const custom = await v.call('POST', '/api/chat/show', { images: [{ data: PNG }], sender: 'Preview', caption: 'Screenshot of sketch.js' });
  assert.equal(room.orchestrator.messages.at(-1).agentName, 'Preview');
  assert.equal(custom.status, 200);
  assert.equal((await v.call('POST', '/api/chat/show', { images: [{ data: 'not base64!' }] })).status, 400);
  assert.equal((await v.call('POST', '/api/chat/show', {})).status, 400);
});

// ── the critic ───────────────────────────────────────────────────────────────

test('critic: settings round-trip and are clamped; a score can be asked for and posted to the room', async () => {
  const v = visitor();
  assert.equal((await v.call('GET', '/api/chat/critic')).json.enabled, false);
  const set = await v.call('POST', '/api/chat/critic', { enabled: true, referenceId: 'sheet', minScore: 99, maxCalls: -5, criteria: 'the same coat' });
  assert.equal(set.json.settings.minScore, 10);
  assert.equal(set.json.settings.maxCalls, 0);
  await v.call('POST', '/api/chat/critic', { maxCalls: 10, minScore: 6 });

  const room = getRoom(v.roomId);
  room.mediaStore.add({ id: 'sheet', type: 'image', data: PNG, mimeType: 'image/png' });
  room.mediaStore.add({ id: 'cand', type: 'image', data: PNG, mimeType: 'image/png' });
  room.orchestrator._critique = async () => ({ score: 4, differs: 'a different face', model: 'm' });
  const scored = await v.call('POST', '/api/chat/critic/score', { imageId: 'cand', post: true });
  assert.equal(scored.status, 200);
  assert.equal(scored.json.score, 4);
  assert.equal(scored.json.below, true);
  assert.match(room.orchestrator.messages.at(-1).content, /INDEPENDENT CRITIC on picture cand.*4\/10\. a different face/);
  assert.equal((await v.call('POST', '/api/chat/critic/score', { imageId: 'nope' })).status, 400);
  assert.equal((await v.call('POST', '/api/chat/critic/score', {})).status, 400);
});

// ── rendering ────────────────────────────────────────────────────────────────

test('render: the host asks for a render of an engine; the draws are shown to the room', async () => {
  const v = visitor();
  await v.call('GET', '/api/agents');
  const room = getRoom(v.roomId);
  room.artifactStore.save('engine.json', JSON.stringify({ promptTemplate: 'a {{x}}', variables: [{ name: 'x', values: ['fox'] }] }), 'a', 'Ann');
  room.orchestrator._draw = async () => ({ imageData: PNG, mimeType: 'image/png' });
  const res = await v.call('POST', '/api/chat/render', { artifact: 'engine.json', draws: 2 });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.imageIds.length, 2);
  const note = room.orchestrator.messages.at(-1);
  assert.equal(note.images.length, 2);
  assert.match(note.content, /^Producer rendered engine.json: 2 draws/);
  assert.equal((await v.call('POST', '/api/chat/render', { artifact: 'missing.json' })).status, 400);
  assert.equal((await v.call('POST', '/api/chat/render', {})).status, 400);
});

test('render-result: a browser answers a request over HTTP; an answer to nothing is refused', async () => {
  const v = visitor();
  await v.call('GET', '/api/agents');
  const room = getRoom(v.roomId);
  room.artifactStore.save('sketch.js', 'p.setup=()=>{}', 'a', 'Ann');
  room.orchestrator.sseClients.add({ write() {}, renderCapable: true });
  const seen = [];
  const inner = room.orchestrator.broadcast.bind(room.orchestrator);
  room.orchestrator.broadcast = (event, data) => { if (event === 'render_request') seen.push(data); inner(event, data); };
  const pending = room.orchestrator.render({ artifact: 'sketch.js', timeoutMs: 3000 });
  await until(() => seen.length === 1);
  assert.equal(seen[0].kind, 'page');
  const answered = await v.call('POST', '/api/chat/render-result', { requestId: seen[0].requestId, images: [{ dataUrl: `data:image/png;base64,${PNG}`, label: 'frame at 2 s' }] });
  assert.equal(answered.json.accepted, true);
  assert.equal((await pending).ok, true);
  assert.equal((await v.call('POST', '/api/chat/render-result', { requestId: seen[0].requestId, images: [] })).status, 404);
  assert.equal((await v.call('POST', '/api/chat/render-result', {})).status, 404);
});

test('one visitor\'s render request is never answered by another visitor', async () => {
  const a = visitor();
  const b = visitor();
  await a.call('GET', '/api/agents');
  await b.call('GET', '/api/agents');
  const roomA = getRoom(a.roomId);
  roomA.artifactStore.save('sketch.js', 'x', 'a', 'Ann');
  roomA.orchestrator.sseClients.add({ write() {}, renderCapable: true });
  const seen = [];
  const inner = roomA.orchestrator.broadcast.bind(roomA.orchestrator);
  roomA.orchestrator.broadcast = (event, data) => { if (event === 'render_request') seen.push(data); inner(event, data); };
  const pending = roomA.orchestrator.render({ artifact: 'sketch.js', timeoutMs: 400 });
  await until(() => seen.length === 1);
  assert.equal((await b.call('POST', '/api/chat/render-result', { requestId: seen[0].requestId, images: [{ data: PNG }] })).status, 404);
  assert.match((await pending).text, /no browser answered/);
});
