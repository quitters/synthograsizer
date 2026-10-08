/**
 * Conversations saved to disk as they happen, and loaded again: the archive itself, then the real app with two visitors.
 * Nothing here touches the network; the agents' replies are scripted.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataRoot = mkdtempSync(join(tmpdir(), 'chatroom-archive-'));
process.env.WORKFLOW_DATA_DIR = join(dataRoot, 'workflows');
process.env.WORKFLOW_TRACES_DIR = join(dataRoot, 'traces');
process.env.CHATROOM_DATA_DIR = join(dataRoot, 'chatdata');
process.env.CHATROOM_AUTOSAVE = '1';                      // off by default under `node --test`; this suite is about it

const { createApp } = await import('./app.js');
const { getRoom, clearRooms } = await import('./services/sessionRegistry.js');
const { COOKIE_NAME } = await import('./middleware/session.js');
const { SessionArchive, autosaveEnabled, retentionDays, safeName, fromStudioExport, toStudioExport } = await import('./services/sessionArchive.js');

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
      return { status: res.status, json, headers: res.headers };
    },
  };
}

async function until(cond, ms = 4000) {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 10));
  }
}

/** Script a room's agents: the lead (the first agent) closes after `closeAt` calls. */
function script(room, { closeAt = 3, image = false } = {}) {
  room.orchestrator.delay = () => Promise.resolve();
  let calls = 0;
  room.orchestrator._generate = async function* (agent) {
    calls += 1;
    const text = `${agent.name} says line ${calls}.${agent.name === 'Ann' && calls >= closeAt ? ' [CONSENSUS REACHED]' : ''}`;
    yield { type: 'chunk', text };
    yield { type: 'complete', fullResponse: text, tokenCount: 10 };
  };
  return () => calls;
}

async function twoAgents(v) {
  await v.call('POST', '/api/agents', { name: 'Ann', bio: 'You are Ann, the lead.' });
  await v.call('POST', '/api/agents', { name: 'Ben', bio: 'You are Ben.' });
}

// ── the archive itself ───────────────────────────────────────────────────────

const roomId = (n) => String(n).repeat(32).slice(0, 32);

test('a session folder is made when a session begins; messages are appended as they are said; it lists newest first', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arch-'));
  let t = new Date('2026-10-07T12:00:00');
  const archive = new SessionArchive({ rootDir: dir, roomId: roomId('a'), now: () => t });
  const first = archive.begin({ goal: 'Design a Tarot Deck!!', meta: { mode: 'group' } });
  assert.match(first, /^20261007-120000-design-a-tarot-deck$/);
  archive.appendMessage(first, { id: 'm1', agentName: 'Ann', content: 'hello' });
  archive.appendMessage(first, { id: 'm2', agentName: 'Ben', content: 'world' });
  assert.deepEqual(archive.readMessages(first).map(m => m.content), ['hello', 'world']);
  t = new Date('2026-10-07T12:00:00');                          // the same second: a second folder gets a suffix, nothing is overwritten
  const second = archive.begin({ goal: 'Design a Tarot Deck!!' });
  assert.equal(second, `${first}-2`);
  t = new Date('2026-10-07T13:00:00');
  const third = archive.begin({ goal: '' });
  assert.match(third, /^20261007-130000$/);
  const ids = archive.list().map(s => s.id);
  assert.equal(ids[0], third, 'newest first');
  assert.deepEqual([...ids].sort(), [first, second, third].sort());
  rmSync(dir, { recursive: true, force: true });
});

test('ids and file names cannot reach outside the room folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arch-'));
  const archive = new SessionArchive({ rootDir: dir, roomId: roomId('b') });
  for (const bad of ['../x', '..', 'a/b', '', '20261007-120000/../../etc', 'x'.repeat(80)]) {
    assert.equal(archive.has(bad), false, bad);
    assert.throws(() => archive._dir(bad), /bad session id/);
  }
  assert.throws(() => new SessionArchive({ rootDir: dir, roomId: '../../etc' }), /32-hex/);
  assert.equal(safeName('../../etc/passwd'), 'passwd');
  assert.equal(safeName('..\\..\\evil.js'), 'evil.js');
  assert.equal(safeName('.hidden'), 'hidden');
  assert.equal(safeName('wéird name?.json'), 'w_ird name_.json');
  const id = archive.begin({ goal: 'x' });
  assert.equal(archive.readFileBase64(id, '../../session.json'), null, 'a path out of the session folder is refused');
  rmSync(dir, { recursive: true, force: true });
});

test('images go to files, not into the transcript line, and an artifact keeps every version', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arch-'));
  const archive = new SessionArchive({ rootDir: dir, roomId: roomId('c') });
  const id = archive.begin({ goal: 'pictures' });
  const png = Buffer.from('not really a png').toString('base64');
  archive.appendMessage(id, { id: 'm1', agentName: 'Ann', content: 'look', images: [{ id: 'img1', imageData: png, mimeType: 'image/png', prompt: 'a fox' }], synthMedia: [{ id: 'vid1', type: 'video', mimeType: 'video/mp4' }] },
    (mid) => (mid === 'vid1' ? { data: Buffer.from('mp4 bytes').toString('base64'), mimeType: 'video/mp4' } : undefined));
  const line = readFileSync(join(dir, 'rooms', roomId('c'), id, 'transcript.jsonl'), 'utf8');
  assert.ok(!line.includes(png), 'no image bytes in the transcript');
  const [m] = archive.readMessages(id);
  assert.equal(m.images[0].file, 'media/img1.png');
  assert.equal(m.synthMedia[0].file, 'media/vid1.mp4');
  assert.equal(archive.readFileBase64(id, 'media/img1.png'), png);
  archive.saveArtifact(id, { filename: 'engine.json', content: 'v1', version: 1 });
  archive.saveArtifact(id, { filename: 'engine.json', content: 'v2', version: 2 });
  const [a] = archive.readArtifacts(id);
  assert.equal(a.content, 'v2');
  assert.deepEqual(a.versions.map(v => v.content), ['v1', 'v2']);
  archive.saveArtifact(id, { filename: '../../escape.txt', content: 'x', version: 1 });
  assert.ok(existsSync(join(dir, 'rooms', roomId('c'), id, 'artifacts', 'escape.txt')));
  rmSync(dir, { recursive: true, force: true });
});

test('a pathological transcript line is truncated, never refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arch-'));
  const archive = new SessionArchive({ rootDir: dir, roomId: roomId('d') });
  const id = archive.begin({ goal: 'big' });
  archive.appendMessage(id, { id: 'm1', agentName: 'Ann', content: 'x'.repeat(500_000), toolResults: ['y'.repeat(10)] });
  const [m] = archive.readMessages(id);
  assert.match(m.content, /truncated: this message was/);
  assert.equal(m.toolResults, undefined);
  rmSync(dir, { recursive: true, force: true });
});

test('sessions older than the retention window are pruned; 0 keeps everything', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arch-'));
  let now = new Date('2026-09-01T00:00:00');
  const archive = new SessionArchive({ rootDir: dir, roomId: roomId('e'), retentionDays: 30, now: () => now });
  const old = archive.begin({ goal: 'old' });
  now = new Date('2026-10-05T00:00:00');
  const recent = archive.begin({ goal: 'recent' });
  assert.equal(archive.prune(), 1);
  assert.deepEqual(archive.list().map(s => s.id), [recent]);
  assert.equal(archive.has(old), false);
  const keeper = new SessionArchive({ rootDir: dir, roomId: roomId('e'), retentionDays: 0, now: () => new Date('2030-01-01') });
  assert.equal(keeper.prune(), 0);
  rmSync(dir, { recursive: true, force: true });
});

test('saving is on locally, off when hosted unless forced, and off in tests unless forced', () => {
  assert.equal(autosaveEnabled({}), true);
  assert.equal(autosaveEnabled({ SYNTH_HOSTED: '1' }), false);
  assert.equal(autosaveEnabled({ VERCEL: '1' }), false);
  assert.equal(autosaveEnabled({ SYNTH_HOSTED: '1', CHATROOM_AUTOSAVE: '1' }), true);
  assert.equal(autosaveEnabled({ CHATROOM_AUTOSAVE: '0' }), false);
  assert.equal(autosaveEnabled({ NODE_TEST_CONTEXT: 'child-v8' }), false);
  assert.equal(retentionDays({}), 30);
  assert.equal(retentionDays({ CHATROOM_AUTOSAVE_DAYS: '0' }), 0);
  assert.equal(retentionDays({ CHATROOM_AUTOSAVE_DAYS: 'x' }), 30);
});

// ── the Studio's own export shape ────────────────────────────────────────────

const STUDIO_FILE = {
  exportedAt: '2026-10-07T18:00:00Z',
  goal: 'Check a draft prompt',
  mode: 'solo',
  agents: [{ id: 'a1', name: 'Claude', bio: 'You are an editor.', color: '#4ECDC4', muted: false }],
  messages: [
    { id: 'u1', agentId: 'user', agentName: 'User', content: 'Please check this.\n\n```\ndraft\n```', timestamp: '2026-10-07T17:58:00Z', isUser: true, tokenCount: 12 },
    { id: 'c1', agentId: 'a1', agentName: 'Claude', color: '#4ECDC4', content: '**Typos**\n`teh` → the', timestamp: '2026-10-07T18:00:00Z', isUser: false, tokenCount: 20, model: null },
  ],
  workflows: [], artifacts: [], composerContext: null,
};

test('the Studio export reads in, with unknown fields dropped, colours checked and sizes capped', () => {
  const saved = fromStudioExport({ ...STUDIO_FILE, evil: 'x', agents: [{ ...STUDIO_FILE.agents[0], color: 'red;background:url(x)' }] });
  assert.equal(saved.meta.mode, 'solo');
  assert.equal(saved.meta.agents[0].color, null, 'a colour that is not a colour is dropped, not put in a style attribute');
  assert.equal(saved.messages.length, 2);
  assert.equal(saved.messages[0].isUser, true);
  assert.ok(!('evil' in saved.meta));
  assert.throws(() => fromStudioExport(null), /not a session file/);
  assert.throws(() => fromStudioExport({ goal: 'x' }), /no "messages" list/);
  assert.throws(() => fromStudioExport({ messages: [], agents: Array.from({ length: 13 }, (_, i) => ({ name: `a${i}` })) }), /Too many agents/);
  const gaps = fromStudioExport({ messages: [{ content: 'no ids, no names' }, { isUser: true, content: 'me' }] });
  assert.ok(gaps.messages[0].id && gaps.messages[0].agentName, 'missing fields are filled in');
  assert.equal(gaps.messages[1].agentName, 'User');
});

test('a saved session exports to the same shape and reads back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arch-'));
  const archive = new SessionArchive({ rootDir: dir, roomId: roomId('f') });
  const id = archive.begin({ goal: 'g', meta: { mode: 'group', agents: [{ id: 'a1', name: 'Ann', bio: 'bio', color: '#fff' }] } });
  const png = Buffer.from('pngbytes').toString('base64');
  archive.appendMessage(id, { id: 'm1', agentId: 'a1', agentName: 'Ann', content: 'hi', isUser: false, images: [{ id: 'i1', imageData: png, mimeType: 'image/png', prompt: 'p' }] });
  archive.saveArtifact(id, { filename: 'a.txt', content: 'one', version: 1 });
  const file = toStudioExport(archive.load(id), (rel) => archive.readFileBase64(id, rel));
  assert.equal(file.messages[0].images[0].imageData, png, 'the download stands alone');
  const back = fromStudioExport(JSON.parse(JSON.stringify(file)));
  assert.equal(back.meta.goal, 'g');
  assert.equal(back.messages[0].images[0].imageData, png);
  assert.equal(back.artifacts[0].filename, 'a.txt');
  rmSync(dir, { recursive: true, force: true });
});

// ── the real app ─────────────────────────────────────────────────────────────

test('a conversation is saved as it happens, survives losing the room, and carries on where it stopped', async () => {
  const a = visitor();
  await twoAgents(a);
  const room = getRoom(a.roomId);
  script(room, { closeAt: 3 });
  assert.equal((await a.call('GET', '/api/chat/saved')).json.enabled, true);

  await a.call('POST', '/api/chat/start', { goal: 'Plan the harbour festival', tokenLimit: 50000 });
  await until(() => !room.orchestrator.isRunning);
  assert.equal(room.orchestrator.completionReason, 'lead_closed');

  const listed = (await a.call('GET', '/api/chat/saved')).json;
  assert.equal(listed.sessions.length, 1);
  const s = listed.sessions[0];
  assert.equal(s.goal, 'Plan the harbour festival');
  assert.equal(s.endReason, 'lead_closed');
  assert.deepEqual(s.agents, ['Ann', 'Ben']);
  assert.ok(s.messageCount >= 3);
  const folder = join(process.env.CHATROOM_DATA_DIR, 'rooms', a.roomId, s.id);
  assert.ok(existsSync(join(folder, 'transcript.jsonl')) && existsSync(join(folder, 'session.json')));
  const onDisk = readFileSync(join(folder, 'transcript.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(onDisk.length, room.orchestrator.messages.length, 'every message is on disk');
  const bios = JSON.parse(readFileSync(join(folder, 'session.json'), 'utf8')).agents.map(x => x.bio);
  assert.deepEqual(bios, ['You are Ann, the lead.', 'You are Ben.'], 'the agents are saved with their bios');

  // the room is lost (a restart, a closed tab, a reset)
  await a.call('POST', '/api/chat/reset');
  assert.equal(room.orchestrator.messages.length, 0);
  assert.equal((await a.call('GET', '/api/chat/saved')).json.sessions.length, 1, 'a reset does not delete what was saved');

  const reopened = await a.call('POST', `/api/chat/saved/${s.id}/reopen`);
  assert.equal(reopened.status, 200);
  assert.equal(room.orchestrator.messages.length, onDisk.length);
  assert.equal(room.orchestrator.goal, 'Plan the harbour festival');
  assert.deepEqual(room.orchestrator.agents.map(x => x.name), ['Ann', 'Ben']);
  assert.equal(room.orchestrator.agents[0].id, onDisk[0].agentId, 'agent ids survive, so the transcript still points at them');
  assert.equal(room.orchestrator.isRunning, false);

  // a message from the user restarts it, and it keeps writing into the same folder
  script(room, { closeAt: 99 });
  const before = onDisk.length;
  await a.call('POST', '/api/chat/inject', { content: 'Carry on, please.' });
  await until(() => room.orchestrator.messages.length >= before + 3);
  await a.call('POST', '/api/chat/stop');
  const after = (await a.call('GET', '/api/chat/saved')).json.sessions;
  assert.equal(after.length, 1, 'carrying on did not start a second folder');
  assert.ok(after[0].messageCount >= before + 3);
  assert.equal(after[0].endReason, 'user_stopped');
});

test('a saved session downloads as a Studio file and imports into another room', async () => {
  const a = visitor();
  await twoAgents(a);
  const room = getRoom(a.roomId);
  script(room, { closeAt: 2 });
  await a.call('POST', '/api/chat/start', { goal: 'Name a lighthouse' });
  await until(() => !room.orchestrator.isRunning);
  const id = (await a.call('GET', '/api/chat/saved')).json.sessions[0].id;

  const dl = await a.call('GET', `/api/chat/saved/${id}/download`);
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition'), /attachment; filename="agent-session-/);
  assert.equal(dl.json.mode, 'group');
  assert.ok(dl.json.messages.length >= 2 && dl.json.agents.length === 2);

  const b = visitor();
  await b.call('GET', '/api/agents');
  const imported = await b.call('POST', '/api/chat/import', dl.json);
  assert.equal(imported.status, 200, JSON.stringify(imported.json));
  const roomB = getRoom(b.roomId);
  assert.equal(roomB.orchestrator.messages.length, dl.json.messages.length);
  assert.deepEqual(roomB.orchestrator.agents.map(x => x.name), ['Ann', 'Ben']);
  // and B's copy is saved too, so closing the tab does not lose an imported session
  const savedB = (await b.call('GET', '/api/chat/saved')).json.sessions;
  assert.equal(savedB.length, 1);
  assert.equal(savedB[0].messageCount, dl.json.messages.length);
});

test('a Studio export file (a solo thread of two messages) loads, and the next message carries on', async () => {
  const v = visitor();
  await v.call('GET', '/api/agents');
  const room = getRoom(v.roomId);
  const res = await v.call('POST', '/api/chat/import', STUDIO_FILE);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(room.orchestrator.mode, 'solo');
  assert.deepEqual(room.orchestrator.messages.map(m => m.agentName), ['User', 'Claude']);
  assert.equal(room.orchestrator.agents[0].bio, 'You are an editor.');
  assert.equal(room.orchestrator.agents[0].id, 'a1');
  // solo: the next message from the user gets one reply from the agent
  room.orchestrator.delay = () => Promise.resolve();
  const seen = [];
  room.orchestrator._generate = async function* (agent, _a, messages) {
    seen.push(messages.map(m => m.agentName));
    yield { type: 'chunk', text: 'Here is more.' };
    yield { type: 'complete', fullResponse: 'Here is more.', tokenCount: 5 };
  };
  await v.call('POST', '/api/chat/inject', { content: 'Now write the clean version.' });
  await until(() => room.orchestrator.messages.length >= 4);
  assert.deepEqual(seen[0], ['User', 'Claude', 'User'], 'the imported thread is what the agent sees as history');
});

test('importing refuses a file that is not a session, and refuses while a session is running', async () => {
  const v = visitor();
  await twoAgents(v);
  assert.equal((await v.call('POST', '/api/chat/import', { hello: 'world' })).status, 400);
  assert.equal((await v.call('POST', '/api/chat/import', [1, 2, 3])).status, 400);
  const room = getRoom(v.roomId);
  room.orchestrator.delay = () => new Promise(r => setTimeout(r, 30));
  script(room, { closeAt: 99 });
  room.orchestrator.delay = () => new Promise(r => setTimeout(r, 30));
  await v.call('POST', '/api/chat/start', { goal: 'run for a while' });
  await until(() => room.orchestrator.isRunning && room.orchestrator.messages.length >= 1);
  const busy = await v.call('POST', '/api/chat/import', STUDIO_FILE);
  assert.equal(busy.status, 409);
  await v.call('POST', '/api/chat/stop');
});

test('one visitor cannot list, download, reopen or delete another\'s saved sessions', async () => {
  const a = visitor();
  await twoAgents(a);
  const room = getRoom(a.roomId);
  script(room, { closeAt: 2 });
  await a.call('POST', '/api/chat/start', { goal: 'private matters' });
  await until(() => !room.orchestrator.isRunning);
  const id = (await a.call('GET', '/api/chat/saved')).json.sessions[0].id;

  const b = visitor();
  await b.call('GET', '/api/agents');
  assert.equal((await b.call('GET', '/api/chat/saved')).json.sessions.length, 0);
  assert.equal((await b.call('GET', `/api/chat/saved/${id}/download`)).status, 404);
  assert.equal((await b.call('POST', `/api/chat/saved/${id}/reopen`)).status, 404);
  assert.equal((await b.call('DELETE', `/api/chat/saved/${id}`)).status, 404);
  assert.equal((await b.call('GET', '/api/chat/saved/..%2F..%2Fsession.json/download')).status, 404);
  assert.equal((await a.call('GET', '/api/chat/saved')).json.sessions.length >= 1, true, 'A still has it');
});

test('a saved session can be deleted, one or all; a generated image is saved with it and comes back on reopen', async () => {
  const a = visitor();
  await twoAgents(a);
  const room = getRoom(a.roomId);
  script(room, { closeAt: 2 });
  await a.call('POST', '/api/chat/start', { goal: 'a picture' });
  await until(() => !room.orchestrator.isRunning);
  // an image the room produced (as the [IMAGE] tag does)
  const png = Buffer.from('fake image bytes').toString('base64');
  room.mediaStore.add({ id: 'img-1', type: 'image', data: png, mimeType: 'image/png', prompt: 'a fox' });
  room.orchestrator.messages.push({ id: 'mi', agentId: room.orchestrator.agents[0].id, agentName: 'Ann', content: 'here', images: [{ id: 'img-1', imageData: png, mimeType: 'image/png', prompt: 'a fox' }], isUser: false, tokenCount: 3 });
  room.orchestrator.broadcast('message', room.orchestrator.messages.at(-1));
  const id = (await a.call('GET', '/api/chat/saved')).json.sessions[0].id;
  const folder = join(process.env.CHATROOM_DATA_DIR, 'rooms', a.roomId, id);
  assert.ok(readdirSync(join(folder, 'media')).includes('img-1.png'));

  await a.call('POST', '/api/chat/reset');
  await a.call('POST', `/api/chat/saved/${id}/reopen`);
  const image = room.orchestrator.messages.find(m => m.images)?.images[0];
  assert.equal(image.imageData, png, 'the picture is back in the transcript');
  assert.equal(room.mediaStore.get('img-1').data, png, 'and in the media store, so agents and the media route can reach it');

  assert.equal((await a.call('DELETE', `/api/chat/saved/${id}`)).status, 200);
  assert.equal(existsSync(folder), false);
  assert.equal((await a.call('DELETE', '/api/chat/saved')).json.removed, 0);
});

test('on a server with saving off, the endpoints say so and import still works', async () => {
  const saved = process.env.CHATROOM_AUTOSAVE;
  process.env.CHATROOM_AUTOSAVE = '0';
  try {
    const v = visitor();
    await v.call('GET', '/api/agents');
    const listed = (await v.call('GET', '/api/chat/saved')).json;
    assert.equal(listed.enabled, false);
    assert.match(listed.reason, /off on this server/);
    assert.equal(existsSync(join(process.env.CHATROOM_DATA_DIR, 'rooms', v.roomId)), false, 'nothing was written for this room');
    assert.equal((await v.call('POST', '/api/chat/import', STUDIO_FILE)).status, 200);
  } finally {
    process.env.CHATROOM_AUTOSAVE = saved;
  }
});
