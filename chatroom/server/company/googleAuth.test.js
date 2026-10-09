/**
 * Sign in with Google, without Google: a stand-in that signs real tokens with a real key and checks what the real one checks. What matters is everything
 * the server must refuse: another state, a replayed code, a token for another app or from another issuer or signed by another key, an unverified or
 * unlisted email, and a server that was never given its settings.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { GoogleSignIn, verifyIdToken, ownerIdForGoogle, parseAllowedEmails, PENDING_MS } from './googleAuth.js';
import { fakeGoogle, TEST_ENDPOINTS } from './googleKit.js';

const PUBLIC = 'https://site.example/chatroom';
const clock = { t: Date.parse('2026-10-09T12:00:00.000Z'), now() { return new Date(this.t); } };

function setup(over = {}) {
  clock.t = Date.parse('2026-10-09T12:00:00.000Z');
  const google = fakeGoogle({ now: () => clock.t });
  const signIn = new GoogleSignIn({
    clientId: google.clientId, clientSecret: google.clientSecret, publicUrl: PUBLIC, allowedEmails: parseAllowedEmails('Owner@Example.com, other@example.com'),
    endpoints: TEST_ENDPOINTS, fetchImpl: google.fetchImpl, now: () => clock.now(), ...over,
  });
  return { google, signIn };
}

/** The whole trip: start, approve at Google, come back. */
async function trip(signIn, google, over = {}, signOpts = {}) {
  const { location, pending } = signIn.begin();
  const { code, state } = google.approve(location, over, signOpts);
  return signIn.finish({ code, state }, pending);
}

const refuses = (promise, code, status) => assert.rejects(promise, (e) => e.code === code && (status === undefined || e.status === status), `expected ${code}`);

test('the settings: what is missing is named, an http address is for localhost only, and it will not start without them', () => {
  assert.equal(setup().signIn.problem, null);
  for (const [field, name] of [['clientId', 'COMPANY_GOOGLE_CLIENT_ID'], ['clientSecret', 'COMPANY_GOOGLE_CLIENT_SECRET'], ['publicUrl', 'COMPANY_PUBLIC_URL'], ['allowedEmails', 'COMPANY_OWNER_EMAILS']]) {
    const { signIn } = setup({ [field]: field === 'allowedEmails' ? new Set() : '' });
    assert.match(signIn.problem, new RegExp(name));
    assert.throws(() => signIn.begin(), (e) => e.status === 503 && e.code === 'google_not_configured');
  }
  assert.match(setup({ publicUrl: 'http://site.example' }).signIn.problem, /https address/);
  assert.equal(setup({ publicUrl: 'http://localhost:3012' }).signIn.problem, null);
  assert.equal(setup({ publicUrl: 'http://127.0.0.1:3012' }).signIn.problem, null);
  assert.deepEqual([...parseAllowedEmails(' A@x.com;b@y.org  not-an-email, ,C@Z.io')], ['a@x.com', 'b@y.org', 'c@z.io']);
});

test('the first step sends the browser to Google with state, nonce and a PKCE challenge, and the redirect URI is the configured one, never a request\'s', () => {
  const { signIn, google } = setup();
  const { location, pending } = signIn.begin();
  const url = new URL(location);
  assert.equal(`${url.origin}${url.pathname}`, TEST_ENDPOINTS.authorization);
  const p = url.searchParams;
  assert.equal(p.get('client_id'), google.clientId);
  assert.equal(p.get('redirect_uri'), `${PUBLIC}/api/company/owner/google/callback`);
  assert.equal(p.get('response_type'), 'code');
  assert.equal(p.get('scope'), 'openid email');
  assert.equal(p.get('code_challenge_method'), 'S256');
  assert.ok(!location.includes(google.clientSecret), 'the client secret never goes through the browser');
  const saved = JSON.parse(Buffer.from(pending, 'base64url').toString('utf8'));
  assert.equal(p.get('state'), saved.s);
  assert.equal(p.get('nonce'), saved.n);
  assert.equal(p.get('code_challenge'), require_b64u_sha256(saved.v), 'the challenge is the hash of the verifier the cookie keeps');
  const again = JSON.parse(Buffer.from(signIn.begin().pending, 'base64url').toString('utf8'));
  assert.notEqual(again.s, saved.s);
  assert.notEqual(again.n, saved.n);
  assert.equal(signIn.startUrl, `${PUBLIC}/api/company/owner/google/start`);
});

const require_b64u_sha256 = (v) => crypto.createHash('sha256').update(v).digest('base64url');

test('a sign-in that comes back right gives the account, and the code was traded with the secret and the verifier', async () => {
  const { signIn, google } = setup();
  const who = await trip(signIn, google, { sub: '42', email: 'OWNER@example.com' });
  assert.deepEqual(who, { sub: '42', email: 'owner@example.com', ownerId: ownerIdForGoogle('42') });
  assert.match(who.ownerId, /^[a-f0-9]{32}$/);
  assert.equal(google.lastTokenRequest.client_secret, google.clientSecret);
  assert.ok(google.lastTokenRequest.code_verifier.length >= 43);
  assert.notEqual(ownerIdForGoogle('42'), ownerIdForGoogle('43'));
  assert.equal(ownerIdForGoogle('42'), ownerIdForGoogle('42'), 'the same account is the same owner every time');
});

test('the state: another one, none, a cookie that is missing, garbled or too old, and Google saying no, are all refused before Google is asked anything', async () => {
  const { signIn, google } = setup();
  const { location, pending } = signIn.begin();
  const { code, state } = google.approve(location);
  await refuses(signIn.finish({ code, state: `${state}x` }, pending), 'google_bad_state');
  await refuses(signIn.finish({ code }, pending), 'google_bad_state');
  await refuses(signIn.finish({ code, state }, undefined), 'google_bad_state');
  await refuses(signIn.finish({ code, state }, 'garbage'), 'google_bad_state');
  await refuses(signIn.finish({ code, state }, Buffer.from(JSON.stringify({ s: state })).toString('base64url')), 'google_bad_state');
  await refuses(signIn.finish({ error: 'access_denied', state }, pending), 'google_denied');
  await refuses(signIn.finish({ code: ['a', 'b'], state }, pending), 'google_denied');
  assert.equal(google.calls.token, 0, 'none of that reached Google');
  clock.t += PENDING_MS + 1000;
  await refuses(signIn.finish({ code, state }, pending), 'google_bad_state');
  clock.t -= PENDING_MS + 1000;
  assert.ok(await signIn.finish({ code, state }, pending), 'and the real one still works');
});

test('a code works once', async () => {
  const { signIn, google } = setup();
  const { location, pending } = signIn.begin();
  const { code, state } = google.approve(location);
  assert.ok(await signIn.finish({ code, state }, pending));
  await refuses(signIn.finish({ code, state }, pending), 'google_rejected', 401);
});

test('a token that is not Google\'s for this sign-in is refused: another nonce, audience, issuer, expiry, signer, key, algorithm or an unverified email', async () => {
  const { signIn, google } = setup();
  await refuses(trip(signIn, google, { nonce: 'someone-elses' }), 'google_bad_nonce');
  await refuses(trip(signIn, google, { nonce: undefined }), 'google_bad_nonce');
  await refuses(trip(signIn, google, { aud: 'another-app.apps.googleusercontent.com', azp: undefined }), 'google_bad_audience');
  await refuses(trip(signIn, google, { aud: [google.clientId, 'x'], azp: 'x' }), 'google_bad_audience');
  await refuses(trip(signIn, google, { iss: 'https://evil.example' }), 'google_bad_issuer');
  await refuses(trip(signIn, google, { exp: Math.floor(clock.t / 1000) - 3600 }), 'google_expired');
  await refuses(trip(signIn, google, { iat: Math.floor(clock.t / 1000) + 3600 }), 'google_expired');
  await refuses(trip(signIn, google, { sub: '' }), 'google_bad_token');
  await refuses(trip(signIn, google, { email_verified: false }), 'google_unverified_email', 403);
  await refuses(trip(signIn, google, { email_verified: 'true' }), 'google_unverified_email', 403);
  const other = fakeGoogle().keys.k1.privateKey;
  await refuses(trip(signIn, google, {}, { signWith: other }), 'google_bad_signature');
  await refuses(trip(signIn, google, {}, { kid: 'k-nobody-publishes', signWith: other }), 'google_unknown_key');
  await refuses(trip(signIn, google, {}, { alg: 'HS256' }), 'google_bad_token');
  await refuses(trip(signIn, google, {}, { alg: 'none' }), 'google_bad_token');
});

test('the list: only the accounts the operator named may own companies, however the address is cased', async () => {
  const { signIn, google } = setup();
  assert.ok(await trip(signIn, google, { email: 'Other@EXAMPLE.com' }));
  await refuses(trip(signIn, google, { email: 'stranger@example.com' }), 'not_allowed', 403);
  await refuses(trip(signIn, google, { email: 'owner@example.com.evil.example' }), 'not_allowed', 403);
  await refuses(trip(signIn, google, { email: 'x@example.com', sub: 'owner@example.com' }), 'not_allowed', 403);
});

test('Google being down is a 502 that says so, never a way in', async () => {
  const { signIn, google } = setup();
  google.tokenStatus = 500;
  await refuses(trip(signIn, google), 'google_unavailable', 502);
  google.tokenStatus = null;
  google.certsStatus = 503;
  await refuses(trip(signIn, google), 'google_unavailable', 502);
  google.certsStatus = null;
  google.networkDown = true;
  await refuses(trip(signIn, google), 'google_unavailable', 502);
});

test('Google\'s keys are fetched once and kept for an hour, and looked up again once when a token names a key that rotated in', async () => {
  const { signIn, google } = setup();
  await trip(signIn, google);
  await trip(signIn, google);
  assert.equal(google.calls.certs, 1, 'cached');
  const k2 = google.addKey('k2');
  await refuses(trip(signIn, google, {}, { kid: k2 }), 'google_unknown_key');          // k2 is not published yet: one refetch, then refused
  assert.equal(google.calls.certs, 2);
  google.published.push(k2);
  assert.ok(await trip(signIn, google, {}, { kid: k2 }), 'once Google lists it, the next token signed with it is accepted after one more look');
  assert.equal(google.calls.certs, 3);
  clock.t += 61 * 60_000;
  await trip(signIn, google);
  assert.equal(google.calls.certs, 4, 'an hour later it is fetched again');
});

test('verifyIdToken on its own: a token that is not a token is refused without being read', () => {
  const { google } = setup();
  const expect = { keys: [], clientId: google.clientId, nonce: 'n', issuers: TEST_ENDPOINTS.issuers, nowMs: clock.t };
  for (const junk of [undefined, null, 5, '', 'a.b', 'a.b.c.d', 'a b.c.d', '<script>.x.y']) {
    assert.throws(() => verifyIdToken(junk, expect), (e) => e.code === 'google_bad_token', String(junk));
  }
});
