/**
 * Two browsers, one server: each must get its own chat room.
 *
 * These run the real app (server/app.js) on a throwaway port with two simulated
 * visitors that each keep their own cookie. Workflow data goes to a temp folder.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The workflow package reads its data folder when it loads, so set it first.
const dataDir = mkdtempSync(join(tmpdir(), 'chatroom-rooms-'));
process.env.WORKFLOW_DATA_DIR = dataDir;
process.env.WORKFLOW_TRACES_DIR = join(dataDir, 'traces');

const { createApp } = await import('./app.js');
const { getRoom, clearRooms } = await import('./services/sessionRegistry.js');
const { workflowLibrary } = await import('workflow-engine');
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
  rmSync(dataDir, { recursive: true, force: true });
});

/** A browser: remembers the room cookie the server gives it. */
function visitor() {
  let cookie = null;
  return {
    get cookie() { return cookie; },
    get roomId() { return cookie?.split('=')[1]; },
    async call(method, path, body) {
      const res = await fetch(base + path, {
        method,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = res.headers.getSetCookie();
      const issued = setCookie.find(c => c.startsWith(`${COOKIE_NAME}=`));
      if (issued) cookie = issued.split(';')[0];
      let json = null;
      try { json = await res.json(); } catch { /* not JSON */ }
      return { status: res.status, json, setCookie };
    },
    /** Open the SSE stream; resolves with what arrives for `ms`. */
    stream(ms = 400) {
      return new Promise((resolve, reject) => {
        const req = http.get(`${base}/api/chat/stream`, { headers: { ...(cookie ? { cookie } : {}), accept: 'text/event-stream' } }, (res) => {
          let text = '';
          res.on('data', c => { text += c; });
          res.on('end', () => resolve({ text, ended: true, headers: res.headers }));
          setTimeout(() => { req.destroy(); resolve({ text, ended: false, headers: res.headers }); }, ms);
        });
        req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e); });
      });
    },
  };
}

// ── the cookie ───────────────────────────────────────────────────────────────

test('a first visit is given an unguessable room cookie, and keeping it keeps the room', async () => {
  const a = visitor();
  const first = await a.call('GET', '/api/agents');
  assert.match(first.setCookie[0], /^cr_sid=[a-f0-9]{32}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/);

  await a.call('POST', '/api/agents', { name: 'Ann', bio: 'You are Ann.' });
  const again = await a.call('GET', '/api/agents');
  assert.equal(again.setCookie.length, 0, 'no new cookie once it has one');
  assert.equal(again.json.agents.length, 1);
});

test('a made-up cookie is not trusted: it is replaced, not used as a room id', async () => {
  const res = await fetch(`${base}/api/agents`, { headers: { cookie: `${COOKIE_NAME}=../../etc/passwd` } });
  const issued = res.headers.getSetCookie().find(c => c.startsWith(`${COOKIE_NAME}=`));
  assert.ok(issued, 'a fresh cookie was issued');
  assert.ok(!issued.includes('passwd'));
});

test('the health check does not create a room or a cookie', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.getSetCookie().length, 0);
});

// ── what each visitor can see ────────────────────────────────────────────────

test('agents, messages and chat state are private to the visitor', async () => {
  const [a, b] = [visitor(), visitor()];
  await a.call('POST', '/api/agents', { name: 'Ann', bio: 'You are Ann.' });
  await a.call('POST', '/api/agents', { name: 'Ben', bio: 'You are Ben.' });
  await a.call('POST', '/api/chat/inject', { content: 'private to A' });

  assert.equal((await a.call('GET', '/api/agents')).json.agents.length, 2);
  assert.equal((await b.call('GET', '/api/agents')).json.agents.length, 0);

  const histA = await a.call('GET', '/api/chat/history');
  const histB = await b.call('GET', '/api/chat/history');
  assert.match(JSON.stringify(histA.json), /private to A/);
  assert.doesNotMatch(JSON.stringify(histB.json), /private to A/);
  assert.equal((await b.call('GET', '/api/chat/state')).json.agents?.length ?? 0, 0);
});

test("one visitor resetting or stopping cannot touch another's chat", async () => {
  const [a, b] = [visitor(), visitor()];
  await a.call('POST', '/api/agents', { name: 'Ann', bio: 'You are Ann.' });
  await a.call('POST', '/api/chat/inject', { content: 'keep me' });
  getRoom(a.roomId).orchestrator.isRunning = true;           // as if A's chat were mid-conversation

  await b.call('POST', '/api/chat/stop', {});
  await b.call('POST', '/api/chat/reset', {});

  assert.equal(getRoom(a.roomId).orchestrator.isRunning, true);
  assert.equal((await a.call('GET', '/api/agents')).json.agents.length, 1);
  assert.match(JSON.stringify((await a.call('GET', '/api/chat/history')).json), /keep me/);
  getRoom(a.roomId).orchestrator.isRunning = false;
});

test('generated media is private: another visitor cannot read it, even knowing the id', async () => {
  const [a, b] = [visitor(), visitor()];
  await a.call('GET', '/api/agents');
  await b.call('GET', '/api/agents');
  getRoom(a.roomId).mediaStore.add({ id: 'secret-media-1', type: 'image', data: 'AAAA', mimeType: 'image/png', prompt: 'a private picture' });

  assert.equal((await a.call('GET', '/api/chat/media/secret-media-1')).status, 200);
  assert.equal((await b.call('GET', '/api/chat/media/secret-media-1')).status, 404);
  assert.doesNotMatch(JSON.stringify((await b.call('GET', '/api/chat/media')).json), /secret-media-1/);
  assert.match(JSON.stringify((await a.call('GET', '/api/chat/media')).json), /secret-media-1/);
});

test('shared files (artifacts) are private too, including the file names', async () => {
  const [a, b] = [visitor(), visitor()];
  assert.equal((await a.call('POST', '/api/artifacts', { filename: 'plan.md', content: '# A only' })).status, 200);

  assert.match(JSON.stringify((await a.call('GET', '/api/artifacts')).json), /plan\.md/);
  assert.doesNotMatch(JSON.stringify((await b.call('GET', '/api/artifacts')).json), /plan\.md/);
  assert.equal((await b.call('GET', '/api/artifacts/plan.md')).status, 404);

  // The same name in another room is a different file.
  await b.call('POST', '/api/artifacts', { filename: 'plan.md', content: '# B only' });
  assert.match(JSON.stringify((await a.call('GET', '/api/artifacts/plan.md')).json), /A only/);
  assert.match(JSON.stringify((await b.call('GET', '/api/artifacts/plan.md')).json), /B only/);
});

// ── the live stream ──────────────────────────────────────────────────────────

test('a stream opened before the cookie exists is handed the cookie and told to reconnect', async () => {
  const fresh = visitor();
  const res = await fresh.stream();
  assert.equal(res.ended, true, 'closed straight away');
  assert.match(res.text, /^retry: 300/);
  assert.match(String(res.headers['set-cookie']), /cr_sid=[a-f0-9]{32}/);
});

test("each visitor's stream carries only their own room's events", async () => {
  const [a, b] = [visitor(), visitor()];
  await a.call('GET', '/api/agents');
  await b.call('GET', '/api/agents');

  const streams = Promise.all([a.stream(500), b.stream(500)]);
  await new Promise(r => setTimeout(r, 200));                // let both connect
  getRoom(a.roomId).orchestrator.broadcast('ping', { for: 'only-A' });
  const [sa, sb] = await streams;

  assert.match(sa.text, /event: connected/);
  assert.match(sa.text, /only-A/);
  assert.match(sb.text, /event: connected/);
  assert.doesNotMatch(sb.text, /only-A/);
});

// ── workflows and traces ─────────────────────────────────────────────────────

async function waitFor(fn, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 25));
  }
}

test("workflow runs and their traces belong to the visitor who started them", async () => {
  const [a, b] = [visitor(), visitor()];
  await b.call('GET', '/api/agents');

  const started = await a.call('POST', '/api/workflows/run', { definition: { name: 'Mine', steps: [] } });
  assert.equal(started.status, 201);
  const id = started.json.workflowId;

  const ids = async (v, path) => ((await v.call('GET', path)).json || []).map(x => x.id ?? x.workflowId);
  assert.ok((await ids(a, '/api/workflows/active')).includes(id));
  assert.ok(!(await ids(b, '/api/workflows/active')).includes(id));
  assert.equal((await b.call('GET', `/api/workflows/active/${id}`)).status, 404);
  assert.equal((await b.call('POST', `/api/workflows/active/${id}/cancel`, {})).status, 404);
  assert.equal((await b.call('POST', `/api/workflows/active/${id}/retry`, {})).status, 400);

  // its trace is recorded for A and invisible to B
  await waitFor(async () => (await a.call('GET', `/api/traces/${id}`)).status === 200);
  assert.ok((await ids(a, '/api/traces')).includes(id));
  assert.ok(!(await ids(b, '/api/traces')).includes(id));
  assert.equal((await b.call('GET', `/api/traces/${id}`)).status, 404);
  assert.equal((await b.call('DELETE', `/api/traces/${id}`)).json.success, false);
  assert.equal((await a.call('GET', `/api/traces/${id}`)).status, 200, "B's delete changed nothing");
});

test('saved checkpoints are listed, resumed and deleted only by their owner', async () => {
  const [a, b] = [visitor(), visitor()];
  await a.call('GET', '/api/agents');
  await b.call('GET', '/api/agents');
  const state = { name: 'Half done', steps: [], results: new Map(), ownerId: a.roomId };
  await workflowLibrary.saveCheckpoint('cp-owned-by-a', state);
  await workflowLibrary.saveCheckpoint('cp-legacy', { ...state, ownerId: null });   // written before rooms existed

  const names = async (v) => (await v.call('GET', '/api/workflows/checkpoints')).json.map(c => c.workflowId);
  assert.deepEqual((await names(a)).sort(), ['cp-owned-by-a']);
  assert.deepEqual(await names(b), [], 'B sees neither A\'s nor the ownerless one');

  assert.equal((await b.call('POST', '/api/workflows/resume', { workflowId: 'cp-owned-by-a' })).status, 400);
  assert.equal((await b.call('DELETE', '/api/workflows/checkpoints/cp-owned-by-a')).json.success, false);
  assert.deepEqual(await names(a), ['cp-owned-by-a'], "B's delete changed nothing");

  assert.equal((await a.call('DELETE', '/api/workflows/checkpoints/cp-owned-by-a')).json.success, true);
  assert.deepEqual(await names(a), []);
});
