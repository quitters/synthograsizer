/**
 * The owner signs in with Google, over real HTTP and a stand-in Google: the redirect out, the redirect back, the session cookie that comes of it, and
 * what is refused. The same Google account is the same owner from any browser; an account that is not on the list gets a page that says so and no session;
 * a server without its settings lets nobody in.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflowDir = mkdtempSync(join(tmpdir(), 'chatroom-ownergoogle-wf-'));
process.env.WORKFLOW_DATA_DIR = workflowDir;
process.env.WORKFLOW_TRACES_DIR = join(workflowDir, 'traces');

const { createApp } = await import('../app.js');
const { clearRooms, clearRoomInitializers } = await import('../services/sessionRegistry.js');
const { makeServices, markerClassifier } = await import('./testKit.js');
const { fakeGoogle, TEST_ENDPOINTS } = await import('./googleKit.js');
const { OwnerAuth, OWNER_COOKIE } = await import('./ownerAuth.js');
const { ownerIdForGoogle, PENDING_COOKIE } = await import('./googleAuth.js');

const google = fakeGoogle();
let current = 'https://site.example/chatroom';
const env = (over = {}) => ({
  COMPANY_OWNER_AUTH: 'google', COMPANY_GOOGLE_CLIENT_ID: google.clientId, COMPANY_GOOGLE_CLIENT_SECRET: google.clientSecret,
  COMPANY_PUBLIC_URL: current, COMPANY_OWNER_EMAILS: 'me@example.com, partner@example.com', ...over,
});
const kit = makeServices({ classify: markerClassifier(), env: env(), ownerGoogle: { endpoints: TEST_ENDPOINTS, fetchImpl: google.fetchImpl } });
const bareKit = makeServices({ classify: markerClassifier(), env: { COMPANY_OWNER_AUTH: 'google' } });
let server, bareServer, base, bareBase;

before(async () => {
  server = createApp({ company: kit.services }).listen(0, '127.0.0.1');
  bareServer = createApp({ company: bareKit.services }).listen(0, '127.0.0.1');
  await Promise.all([server, bareServer].map(s => new Promise(r => s.once('listening', r))));
  base = `http://127.0.0.1:${server.address().port}`;
  bareBase = `http://127.0.0.1:${bareServer.address().port}`;
});

after(() => {
  for (const s of [server, bareServer]) { s.closeAllConnections?.(); s.close(); }
  clearRooms();
  clearRoomInitializers();
  kit.cleanup();
  bareKit.cleanup();
  rmSync(workflowDir, { recursive: true, force: true });
});

function browser(origin = () => base) {
  const jar = new Map();
  const b = {
    jar,
    async call(method, route, body, headers = {}, init = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await fetch(origin() + route, {
        method, redirect: 'manual', ...init,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const issued = res.headers.getSetCookie();
      for (const line of issued) {
        const [pair, ...attrs] = line.split(';').map(s => s.trim());
        const [name, ...v] = pair.split('=');
        if (attrs.some(a => /^max-age=0$/i.test(a))) jar.delete(name); else jar.set(name, v.join('='));
      }
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* html or empty */ }
      return { status: res.status, json, text, setCookie: issued, location: res.headers.get('location'), headers: res.headers };
    },
    /** Click "Sign in with Google": out to Google, the person approves as `over`, and back to the callback. */
    async signInWithGoogle(over = {}, signOpts = {}) {
      const out = await b.call('GET', '/api/company/owner/google/start');
      assert.equal(out.status, 302, out.text);
      const back = google.approve(out.location, over, signOpts);
      return b.call('GET', `/api/company/owner/google/callback?code=${encodeURIComponent(back.code)}&state=${encodeURIComponent(back.state)}`);
    },
  };
  return b;
}

test('the console is told how sign-in works here: with Google, the address to start it, and nothing of any secret', async () => {
  const state = (await browser().call('GET', '/api/company/owner')).json;
  assert.deepEqual(state, { mode: 'google', signedIn: false, sessionDays: 30, signInUrl: 'https://site.example/chatroom/api/company/owner/google/start', problem: null });
  assert.ok(!JSON.stringify(state).includes(google.clientSecret));
});

test('the way out: a redirect to Google with a short-lived HttpOnly cookie that remembers what to expect', async () => {
  const out = await browser().call('GET', '/api/company/owner/google/start');
  assert.equal(out.status, 302);
  const url = new URL(out.location);
  assert.equal(`${url.origin}${url.pathname}`, TEST_ENDPOINTS.authorization);
  assert.equal(url.searchParams.get('redirect_uri'), 'https://site.example/chatroom/api/company/owner/google/callback');
  const cookie = out.setCookie.find(c => c.startsWith(`${PENDING_COOKIE}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=600/);
  assert.match(cookie, /Secure/, 'the public address is https, so the cookie is Secure whatever a proxy says');
  assert.ok(!out.location.includes(google.clientSecret));
});

test('signing in with Google: a session cookie (HttpOnly, SameSite=Strict) arrives on a page that carries the browser on to the console, and companies open', async () => {
  const b = browser();
  const back = await b.signInWithGoogle({ email: 'me@example.com', sub: 'sub-me' });
  assert.equal(back.status, 200);
  assert.match(back.text, /<meta http-equiv="refresh" content="0;url=https:\/\/site\.example\/chatroom\/company\/">/);
  assert.match(back.headers.get('content-security-policy'), /default-src 'none'/, 'the landing page runs no script and loads nothing');
  assert.equal(back.headers.get('cache-control'), 'no-store');
  assert.equal(back.headers.get('referrer-policy'), 'no-referrer');
  const owner = back.setCookie.find(c => c.startsWith(`${OWNER_COOKIE}=`));
  assert.match(owner, /HttpOnly/);
  assert.match(owner, /SameSite=Strict/);
  assert.match(owner, /Secure/);
  assert.ok(back.setCookie.find(c => c.startsWith(`${PENDING_COOKIE}=`) && /Max-Age=0/.test(c)), 'the pending cookie is cleared');
  assert.equal(b.jar.get(PENDING_COOKIE), undefined);
  const state = (await b.call('GET', '/api/company/owner')).json;
  assert.equal(state.signedIn, true);
  assert.equal(state.label, 'me@example.com');
  assert.equal((await b.call('GET', '/api/company')).status, 200);
  assert.equal((await b.call('POST', '/api/company', { name: 'Google Co', departments: ['Desk'] })).status, 201);
});

test('the same Google account is the same owner from any browser; another listed account is another owner; both are who they say', async () => {
  const laptop = browser();
  const phone = browser();
  const partner = browser();
  await laptop.signInWithGoogle({ email: 'me@example.com', sub: 'sub-me' });
  const made = await laptop.call('POST', '/api/company', { name: 'Shared Name Co', departments: ['Desk'] });
  const id = made.json.company.id;
  await phone.signInWithGoogle({ email: 'ME@example.com', sub: 'sub-me' });
  assert.ok((await phone.call('GET', '/api/company')).json.companies.some(c => c.id === id), 'the second browser sees the first one\'s company');
  await partner.signInWithGoogle({ email: 'partner@example.com', sub: 'sub-partner' });
  assert.deepEqual((await partner.call('GET', '/api/company')).json.companies, [], 'another account owns nothing of it');
  assert.equal((await partner.call('GET', `/api/company/${id}`)).status, 404);
  assert.equal(kit.services.store.getOwned(id, ownerIdForGoogle('sub-me')).id, id, 'the owner id is the hash of the subject');
  const accounts = JSON.parse(fs.readFileSync(path.join(kit.dir, 'owner', 'accounts.json'), 'utf8')).accounts;
  assert.equal(accounts[ownerIdForGoogle('sub-me')].email, 'me@example.com', 'the operator can see which owner id is which account');
});

test('an account that is not on the list gets a page that says so, a 403, and no session', async () => {
  const b = browser();
  const back = await b.signInWithGoogle({ email: 'stranger@example.com', sub: 'sub-stranger' });
  assert.equal(back.status, 403);
  assert.match(back.text, /not allowed to own companies/);
  assert.equal(back.setCookie.find(c => c.startsWith(`${OWNER_COOKIE}=`)), undefined);
  assert.equal((await b.call('GET', '/api/company')).status, 401);
});

test('a callback that did not start here, or came with a forged or replayed answer, is refused and opens nothing', async () => {
  const b = browser();
  const start = await b.call('GET', '/api/company/owner/google/start');
  const { code, state } = google.approve(start.location, { email: 'me@example.com', sub: 'sub-me' });
  const noCookie = browser();
  assert.equal((await noCookie.call('GET', `/api/company/owner/google/callback?code=${code}&state=${state}`)).status, 401, 'no cookie: another browser, or an attacker\'s link');
  assert.equal((await b.call('GET', `/api/company/owner/google/callback?code=${code}&state=wrong`)).status, 401, 'another state');
  const forged = browser();
  const s2 = await forged.call('GET', '/api/company/owner/google/start');
  const bad = google.approve(s2.location, { email: 'me@example.com', sub: 'sub-me' }, { signWith: fakeGoogle().keys.k1.privateKey });
  assert.equal((await forged.call('GET', `/api/company/owner/google/callback?code=${bad.code}&state=${bad.state}`)).status, 401, 'a token signed by someone else');
  const replay = browser();
  const s3 = await replay.call('GET', '/api/company/owner/google/start');
  const once = google.approve(s3.location, { email: 'me@example.com', sub: 'sub-me' });
  const url = `/api/company/owner/google/callback?code=${once.code}&state=${once.state}`;
  assert.equal((await replay.call('GET', url)).status, 200);
  const again = browser();
  again.jar.set(PENDING_COOKIE, replay.jar.get(PENDING_COOKIE) ?? s3.setCookie[0].split(';')[0].split('=')[1]);
  assert.equal((await again.call('GET', url)).status, 401, 'the same code a second time');
  for (const b2 of [noCookie, forged]) assert.equal((await b2.call('GET', '/api/company')).status, 401);
  assert.equal((await b.call('GET', '/api/company/owner/google/callback?error=access_denied')).status, 401, 'Google saying no');
});

test('wrong sign-ins are counted: after five from one address the way in answers 429, even to the right account', async () => {
  const a = new OwnerAuth({ dataDir: kit.dir + '-limit', env: env(), google: { endpoints: TEST_ENDPOINTS, fetchImpl: google.fetchImpl } });
  for (let i = 0; i < 5; i++) a.noteFailure('203.0.113.9');
  assert.throws(() => a.checkAttempts('203.0.113.9'), (e) => e.status === 429 && e.code === 'too_many_attempts');
  fs.rmSync(kit.dir + '-limit', { recursive: true, force: true });
});

test('signing out ends the session; the owner keeps their companies and can sign in again', async () => {
  const b = browser();
  await b.signInWithGoogle({ email: 'me@example.com', sub: 'sub-me' });
  assert.equal((await b.call('POST', '/api/company/owner/signout', {})).json.signedIn, false);
  assert.equal(b.jar.get(OWNER_COOKIE), undefined);
  assert.equal((await b.call('GET', '/api/company')).status, 401);
  await b.signInWithGoogle({ email: 'me@example.com', sub: 'sub-me' });
  assert.equal((await b.call('GET', '/api/company')).status, 200);
});

test('a key does nothing here, and a session of an account that has left the list is not kept across a restart', async () => {
  const b = browser();
  assert.equal((await b.call('POST', '/api/company/owner/signin', { key: 'anything' })).json.code, 'use_google');
  await b.signInWithGoogle({ email: 'partner@example.com', sub: 'sub-partner' });
  const token = b.jar.get(OWNER_COOKIE);
  assert.ok(kit.services.ownerAuth.sessionFor(token));
  const restarted = new OwnerAuth({ dataDir: kit.dir, env: env({ COMPANY_OWNER_EMAILS: 'me@example.com' }), google: { endpoints: TEST_ENDPOINTS, fetchImpl: google.fetchImpl } });
  assert.equal(restarted.sessionFor(token), null, 'removed from COMPANY_OWNER_EMAILS: out at the next start');
  const kept = new OwnerAuth({ dataDir: kit.dir, env: env(), google: { endpoints: TEST_ENDPOINTS, fetchImpl: google.fetchImpl } });
  assert.ok(kept.sessionFor(token), 'and still in while on it');
});

test('a server told to use Google but not given its settings lets nobody in, says what is missing, and never falls back to the cookie', async () => {
  const b = browser(() => bareBase);
  const state = (await b.call('GET', '/api/company/owner')).json;
  assert.equal(state.mode, 'google');
  assert.match(state.problem, /COMPANY_GOOGLE_CLIENT_ID.*COMPANY_GOOGLE_CLIENT_SECRET.*COMPANY_OWNER_EMAILS.*COMPANY_PUBLIC_URL/);
  assert.equal((await b.call('GET', '/api/company')).status, 401);
  const start = await b.call('GET', '/api/company/owner/google/start');
  assert.equal(start.status, 503);
  assert.match(start.text, /Google sign-in is not set up/);
  assert.match(bareKit.services.ownerAuth.warnings.join(' '), /Nobody can sign in until it is/);
});

test('without Google mode the Google routes are not there', async () => {
  const k = makeServices({ classify: markerClassifier(), env: { COMPANY_OWNER_AUTH: 'key' } });
  const s = createApp({ company: k.services }).listen(0, '127.0.0.1');
  await new Promise(r => s.once('listening', r));
  try {
    const res = await fetch(`http://127.0.0.1:${s.address().port}/api/company/owner/google/start`, { redirect: 'manual' });
    assert.equal(res.status, 404);
  } finally { s.closeAllConnections?.(); s.close(); k.cleanup(); }
});

test('an email is bound to the Google account that first signed in under it: the same address from a different account is not let in', async () => {
  const first = browser();
  await first.signInWithGoogle({ email: 'partner@example.com', sub: 'sub-partner' });
  const impostor = browser();
  const back = await impostor.signInWithGoogle({ email: 'partner@example.com', sub: 'sub-someone-who-got-the-address' });
  assert.equal(back.status, 403);
  assert.match(back.text, /different Google account from the one that signed in before/);
  assert.equal(back.setCookie.find(c => c.startsWith(`${OWNER_COOKIE}=`)), undefined);
  assert.equal((await impostor.call('GET', '/api/company')).status, 401);
  assert.equal((await first.call('GET', '/api/company')).status, 200, 'and the real one is unaffected');
});

test('with Google there is nothing to guess, so strangers cannot lock the owner out: failures count against their own address only', async () => {
  const a = new OwnerAuth({ dataDir: kit.dir + '-nolock', env: env(), google: { endpoints: TEST_ENDPOINTS, fetchImpl: google.fetchImpl } });
  for (let i = 0; i < 60; i++) a.noteFailure(`198.51.100.${i}`);
  assert.doesNotThrow(() => a.checkAttempts('203.0.113.77'), 'a new address is not held up by what others did');
  assert.throws(() => { for (let i = 0; i < 5; i++) a.noteFailure('203.0.113.77'); a.checkAttempts('203.0.113.77'); }, (e) => e.status === 429);
  fs.rmSync(kit.dir + '-nolock', { recursive: true, force: true });
});
