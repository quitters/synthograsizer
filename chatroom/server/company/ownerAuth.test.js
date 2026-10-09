/**
 * Who the owner is. The module on its own (a key, a session, wrong keys counted) and then over real HTTP: a visitor who has not signed in
 * reaches nothing of a company's, a signed-in owner reaches the same companies from any browser, and with the setting off nothing changed.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflowDir = mkdtempSync(join(tmpdir(), 'chatroom-owner-wf-'));
process.env.WORKFLOW_DATA_DIR = workflowDir;
process.env.WORKFLOW_TRACES_DIR = join(workflowDir, 'traces');

const { OwnerAuth, OWNER_COOKIE } = await import('./ownerAuth.js');
const { createApp } = await import('../app.js');
const { clearRooms, clearRoomInitializers } = await import('../services/sessionRegistry.js');
const { makeServices, markerClassifier, tempDir } = await import('./testKit.js');

const dirs = [];
const dir = () => { const d = tempDir(); dirs.push(d); return d; };
const later = (clock, ms) => { clock.t += ms; };
const clockAt = () => { const c = { t: Date.parse('2026-10-09T12:00:00.000Z'), now: () => new Date(c.t) }; return c; };
const keyOf = (auth) => fs.readFileSync(auth.keyFile, 'utf8').trim();

// ── the module ─────────────────────────────────────────────────────────────

test('off by default: nobody signs in, the answer to "signed in?" is yes, and no files are made', () => {
  const d = dir();
  const auth = new OwnerAuth({ dataDir: d, env: {} });
  assert.equal(auth.mode, 'off');
  assert.equal(auth.enabled, false);
  assert.deepEqual(auth.describe(false), { mode: 'off', signedIn: true, sessionDays: null });
  assert.throws(() => auth.signIn('anything'), (e) => e.status === 400 && e.code === 'owner_auth_off');
  assert.equal(fs.existsSync(path.join(d, 'owner')), false);
});

test('a setting that is not a mode is ignored with a warning, and a hosted instance left on the cookie is warned about', () => {
  assert.equal(new OwnerAuth({ dataDir: dir(), env: { COMPANY_OWNER_AUTH: 'password' } }).mode, 'off');
  assert.match(new OwnerAuth({ dataDir: dir(), env: { COMPANY_OWNER_AUTH: 'password' } }).warnings[0], /not one of off, key/);
  assert.match(new OwnerAuth({ dataDir: dir(), env: {}, hosted: true }).warnings.join(' '), /hosted instance/);
  const days = new OwnerAuth({ dataDir: dir(), env: { COMPANY_OWNER_AUTH: 'key', COMPANY_OWNER_SESSION_DAYS: '9000' } });
  assert.equal(days.sessionDays, 30);
  assert.match(days.warnings.join(' '), /COMPANY_OWNER_SESSION_DAYS=9000 was ignored/);
});

test('the first start in key mode makes the owner: the key goes to a file, only its hash and the owner id are kept, and a second start finds the same owner', () => {
  const d = dir();
  const first = new OwnerAuth({ dataDir: d, env: { COMPANY_OWNER_AUTH: 'key' } });
  assert.equal(first.justCreated, true);
  const key = keyOf(first);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.match(first.ownerId, /^[a-f0-9]{32}$/);
  const stored = fs.readFileSync(path.join(d, 'owner', 'owner.json'), 'utf8');
  assert.ok(!stored.includes(key), 'the key itself is not in owner.json');
  assert.match(JSON.parse(stored).keyHash, /^[a-f0-9]{64}$/);

  const second = new OwnerAuth({ dataDir: d, env: { COMPANY_OWNER_AUTH: 'key' } });
  assert.equal(second.justCreated, undefined);
  assert.equal(second.ownerId, first.ownerId);
  assert.equal(keyOf(second), key, 'the key file is not rewritten');
});

test('the right key opens a session, a wrong one is refused with the same words whatever is wrong, and the token is kept only as a hash', () => {
  const d = dir();
  const auth = new OwnerAuth({ dataDir: d, env: { COMPANY_OWNER_AUTH: 'key' } });
  for (const [i, bad] of ['', '   ', 'nope', 'x'.repeat(500), null, 12, undefined].entries()) {
    assert.throws(() => auth.signIn(bad, { address: `10.2.0.${i}` }), (e) => e.status === 401 && e.code === 'bad_key' && e.message === 'That is not the owner key.');
  }
  const { token, maxAgeSeconds, expiresAt } = auth.signIn(`  ${keyOf(auth)}\n`);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(maxAgeSeconds, 30 * 86400);
  assert.ok(Date.parse(expiresAt) > Date.now());
  assert.equal(auth.sessionFor(token).ownerId, auth.ownerId);
  assert.equal(auth.sessionFor('0'.repeat(64)), null);
  assert.equal(auth.sessionFor('not a token'), null);
  assert.equal(auth.sessionFor(undefined), null);
  const saved = fs.readFileSync(path.join(d, 'owner', 'sessions.json'), 'utf8');
  assert.ok(!saved.includes(token), 'the session file holds a hash, not the token');

  const restarted = new OwnerAuth({ dataDir: d, env: { COMPANY_OWNER_AUTH: 'key' } });
  assert.equal(restarted.sessionFor(token)?.ownerId, auth.ownerId, 'a session survives a restart');
});

test('a session ends: when its days are up, when it is signed out, and when the key is changed (the owner id never changes)', () => {
  const clock = clockAt();
  const d = dir();
  const auth = new OwnerAuth({ dataDir: d, env: { COMPANY_OWNER_AUTH: 'key', COMPANY_OWNER_SESSION_DAYS: '2' }, now: clock.now });
  const id = auth.ownerId;
  const a = auth.signIn(keyOf(auth)).token;
  const b = auth.signIn(keyOf(auth)).token;
  later(clock, 86_400_000);
  assert.ok(auth.sessionFor(a));
  later(clock, 86_400_000 + 1000);
  assert.equal(auth.sessionFor(a), null, 'two days later it is over');

  const c = auth.signIn(keyOf(auth)).token;
  assert.equal(auth.signOut(c), true);
  assert.equal(auth.sessionFor(c), null);
  assert.equal(auth.signOut(c), false);

  const live = auth.signIn(keyOf(auth)).token;
  const oldKey = keyOf(auth);
  const { key: newKey } = auth.rotateKey();
  assert.notEqual(newKey, oldKey);
  assert.equal(keyOf(auth), newKey);
  assert.equal(auth.sessionFor(live), null, 'changing the key ends every session');
  assert.equal(auth.sessionFor(b), null);
  assert.throws(() => auth.signIn(oldKey), (e) => e.code === 'bad_key');
  assert.ok(auth.signIn(newKey).token);
  assert.equal(auth.ownerId, id);
  assert.equal(new OwnerAuth({ dataDir: d, env: { COMPANY_OWNER_AUTH: 'key' }, now: clock.now }).ownerId, id);
});

test('wrong keys are counted: five from one address in fifteen minutes, or twenty-five from all in an hour, and even the right key waits', () => {
  const clock = clockAt();
  const auth = new OwnerAuth({ dataDir: dir(), env: { COMPANY_OWNER_AUTH: 'key' }, now: clock.now });
  const right = keyOf(auth);
  for (let i = 0; i < 5; i++) assert.throws(() => auth.signIn('wrong', { address: '10.0.0.1' }), (e) => e.status === 401);
  assert.throws(() => auth.signIn(right, { address: '10.0.0.1' }), (e) => e.status === 429 && e.code === 'too_many_attempts' && /minute/.test(e.message));
  assert.ok(auth.signIn(right, { address: '10.0.0.2' }).token, 'another address is not held up by it');
  later(clock, 15 * 60_000 + 1000);
  assert.ok(auth.signIn(right, { address: '10.0.0.1' }).token, 'the window passes');

  const wide = new OwnerAuth({ dataDir: dir(), env: { COMPANY_OWNER_AUTH: 'key' }, now: clock.now });
  for (let i = 0; i < 25; i++) assert.throws(() => wide.signIn('wrong', { address: `10.1.0.${i}` }), (e) => e.status === 401);
  assert.throws(() => wide.signIn(keyOf(wide), { address: '10.9.9.9' }), (e) => e.status === 429, 'too many wrong keys from everywhere hold everyone');
  later(clock, 60 * 60_000 + 1000);
  assert.ok(wide.signIn(keyOf(wide), { address: '10.9.9.9' }).token);
});

test('an owner can be started under an id that already owns companies, once, and only with a real id', () => {
  const d = dir();
  const existing = 'ab'.repeat(16);
  const auth = new OwnerAuth({ dataDir: d, env: { COMPANY_OWNER_AUTH: 'key' } });
  fs.rmSync(path.join(d, 'owner'), { recursive: true });
  const fresh = new OwnerAuth({ dataDir: dir(), env: {} });
  fresh.mode = 'key';
  assert.throws(() => fresh.initialize({ ownerId: 'not-an-id' }), (e) => e.code === 'bad_owner_id');
  assert.equal(fresh.initialize({ ownerId: existing }).ownerId, existing);
  assert.throws(() => fresh.initialize(), (e) => e.status === 409 && e.code === 'owner_exists');
  assert.ok(auth);
});

test('a damaged owner record stops the server; it never makes a new owner that would own none of the companies', () => {
  const d = dir();
  const first = new OwnerAuth({ dataDir: d, env: { COMPANY_OWNER_AUTH: 'key' } });
  const id = first.ownerId;
  const file = path.join(d, 'owner', 'owner.json');
  for (const damaged of ['', '{"ownerId": "x"', '{}', JSON.stringify({ ownerId: id, keyHash: 'short' })]) {
    fs.writeFileSync(file, damaged);
    assert.throws(() => new OwnerAuth({ dataDir: d, env: { COMPANY_OWNER_AUTH: 'key' } }), /not a valid owner record/);
    assert.equal(fs.readFileSync(file, 'utf8'), damaged, 'and nothing was overwritten');
  }
});

test('a key changed from the command line takes effect on a running server at once: the old sessions and the old key stop working', () => {
  const d = dir();
  const running = new OwnerAuth({ dataDir: d, env: { COMPANY_OWNER_AUTH: 'key' } });
  const oldKey = keyOf(running);
  const { token } = running.signIn(oldKey);
  assert.ok(running.sessionFor(token));
  const { key: newKey } = new OwnerAuth({ dataDir: d, env: { COMPANY_OWNER_AUTH: 'key' } }).rotateKey();   // another process: owner rotate
  assert.equal(running.sessionFor(token), null, 'the session ended without a restart');
  assert.throws(() => running.signIn(oldKey, { address: 'a' }), (e) => e.code === 'bad_key');
  assert.ok(running.signIn(newKey, { address: 'b' }).token);
});

test('addresses that got a wrong key long ago are forgotten, so wrong keys from many addresses over days are not a memory leak', () => {
  const clock = clockAt();
  const auth = new OwnerAuth({ dataDir: dir(), env: { COMPANY_OWNER_AUTH: 'key' }, now: clock.now });
  for (let hour = 0; hour < 40; hour++) {
    for (let i = 0; i < 25; i++) assert.throws(() => auth.signIn('wrong', { address: `10.${hour}.0.${i}` }), (e) => e.code === 'bad_key');
    later(clock, 61 * 60_000);                       // the hour's allowance of wrong keys is spent and then comes back
  }
  assert.ok(auth.failures.size < 600, `1,000 addresses failed over 40 hours and ${auth.failures.size} are remembered`);
});

// ── over HTTP ──────────────────────────────────────────────────────────────

const kit = makeServices({ classify: markerClassifier(), env: { COMPANY_OWNER_AUTH: 'key' } });
const openKit = makeServices({ classify: markerClassifier() });
let server, openServer, base, openBase;

before(async () => {
  server = createApp({ company: kit.services }).listen(0, '127.0.0.1');
  openServer = createApp({ company: openKit.services }).listen(0, '127.0.0.1');
  await Promise.all([server, openServer].map(s => new Promise(r => s.once('listening', r))));
  base = `http://127.0.0.1:${server.address().port}`;
  openBase = `http://127.0.0.1:${openServer.address().port}`;
});

after(() => {
  for (const s of [server, openServer]) { s.closeAllConnections?.(); s.close(); }
  clearRooms();
  clearRoomInitializers();
  kit.cleanup();
  openKit.cleanup();
  rmSync(workflowDir, { recursive: true, force: true });
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

/** A browser: its own cookie jar. */
function browser(origin = () => base) {
  const jar = new Map();
  return {
    jar,
    async call(method, route, body, headers = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await fetch(origin() + route, {
        method,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const issued = res.headers.getSetCookie();
      for (const line of issued) {
        const [pair, ...attrs] = line.split(';').map(s => s.trim());
        const [name, ...v] = pair.split('=');
        if (attrs.some(a => /^max-age=0$/i.test(a))) jar.delete(name); else jar.set(name, v.join('='));
      }
      let json = null;
      try { json = await res.json(); } catch { /* not JSON */ }
      return { status: res.status, json, setCookie: issued };
    },
  };
}

test('with sign-in on, a visitor who has not signed in is told so, and still reads what anyone may read', async () => {
  const b = browser();
  assert.deepEqual((await b.call('GET', '/api/company/owner')).json, { mode: 'key', signedIn: false, sessionDays: 30 });
  for (const route of ['/api/company', '/api/company/roster', '/api/company/flow']) {
    const r = await b.call('GET', route);
    assert.equal(r.status, 401, route);
    assert.equal(r.json.code, 'sign_in_required');
  }
  assert.equal((await b.call('POST', '/api/company', { name: 'Nope' })).status, 401);
  for (const route of ['/api/company/schema', '/api/company/operator', '/api/company/mission', '/api/company/house-rules']) assert.equal((await b.call('GET', route)).status, 200, route);
  assert.equal((await b.call('GET', '/api/chat/state')).status, 200, 'a plain chat room is still the visitor\'s own');
});

test('signing in: a wrong key is refused, a right one gives an HttpOnly SameSite=Strict cookie, and only JSON may ask', async () => {
  const b = browser();
  const wrong = await b.call('POST', '/api/company/owner/signin', { key: 'not it' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.code, 'bad_key');
  assert.equal(wrong.setCookie.find(c => c.startsWith(`${OWNER_COOKIE}=`)), undefined);
  const form = await fetch(`${base}/api/company/owner/signin`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ key: keyOf(kit.services.ownerAuth) }) });
  assert.equal(form.status, 415, 'a page on another origin cannot sign a visitor in with a plain post');

  const ok = await b.call('POST', '/api/company/owner/signin', { key: keyOf(kit.services.ownerAuth) });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json, { mode: 'key', signedIn: true, sessionDays: 30 });
  const cookie = ok.setCookie.find(c => c.startsWith(`${OWNER_COOKIE}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=2592000/);
  assert.deepEqual((await b.call('GET', '/api/company/owner')).json, { mode: 'key', signedIn: true, sessionDays: 30 });
  assert.equal((await b.call('GET', '/api/company')).status, 200);
});

test('the owner is the account, not the browser: a second browser that signs in sees the first one\'s companies, and one that has not sees nothing', async () => {
  const key = keyOf(kit.services.ownerAuth);
  const laptop = browser();
  const phone = browser();
  const stranger = browser();
  await laptop.call('POST', '/api/company/owner/signin', { key });
  const made = await laptop.call('POST', '/api/company', { name: 'Tide Pool Works', departments: ['Desk'] });
  assert.equal(made.status, 201);
  const id = made.json.company.id;

  assert.notEqual(laptop.jar.get('cr_sid'), phone.jar.get('cr_sid'));
  await phone.call('POST', '/api/company/owner/signin', { key });
  assert.notEqual(laptop.jar.get('cr_sid'), phone.jar.get('cr_sid'), 'two browsers, two visitor cookies');
  assert.deepEqual((await phone.call('GET', '/api/company')).json.companies.map(c => c.id), [id], 'the same companies');
  assert.equal((await phone.call('GET', `/api/company/${id}`)).status, 200);

  assert.equal((await stranger.call('GET', `/api/company/${id}`)).status, 401);
  const room = made.json.company.departments[0].roomId;
  assert.equal((await stranger.call('GET', '/api/chat/state', undefined, { 'x-room-id': room })).status, 404, 'nor a company room by its id');
  assert.equal((await phone.call('GET', '/api/chat/state', undefined, { 'x-room-id': room })).status, 200, 'but the owner, from any browser, reaches it');
});

test('signing out ends that browser\'s session and takes the cookie away; the key still works for the next sign-in', async () => {
  const key = keyOf(kit.services.ownerAuth);
  const b = browser();
  await b.call('POST', '/api/company/owner/signin', { key });
  assert.ok(b.jar.get(OWNER_COOKIE));
  const out = await b.call('POST', '/api/company/owner/signout', {});
  assert.deepEqual(out.json, { mode: 'key', signedIn: false, sessionDays: 30 });
  assert.match(out.setCookie.find(c => c.startsWith(`${OWNER_COOKIE}=`)), /Max-Age=0/);
  assert.equal(b.jar.get(OWNER_COOKIE), undefined);
  assert.equal((await b.call('GET', '/api/company')).status, 401);
  assert.equal((await b.call('POST', '/api/company/owner/signin', { key })).status, 200);
});

test('a session cookie that is not one, or is a stranger\'s, gets nothing', async () => {
  const b = browser();
  b.jar.set(OWNER_COOKIE, 'a'.repeat(64));
  assert.equal((await b.call('GET', '/api/company')).status, 401);
  b.jar.set(OWNER_COOKIE, 'garbage');
  assert.equal((await b.call('GET', '/api/company')).status, 401);
  b.jar.set(OWNER_COOKIE, keyOf(kit.services.ownerAuth));
  assert.equal((await b.call('GET', '/api/company')).status, 401, 'the key itself is not a session');
});

test('with sign-in off nothing changed: the visitor cookie is the owner, "signed in" is yes, and signing in is refused', async () => {
  const b = browser(() => openBase);
  assert.deepEqual((await b.call('GET', '/api/company/owner')).json, { mode: 'off', signedIn: true, sessionDays: null });
  assert.equal((await b.call('GET', '/api/company')).status, 200);
  assert.equal((await b.call('POST', '/api/company/owner/signin', { key: 'x' })).json.code, 'owner_auth_off');
  const made = await b.call('POST', '/api/company', { name: 'Cookie Co', departments: ['Desk'] });
  assert.equal(made.status, 201);
  const other = browser(() => openBase);
  assert.deepEqual((await other.call('GET', '/api/company')).json.companies, [], 'another visitor still sees nothing of it');
});
