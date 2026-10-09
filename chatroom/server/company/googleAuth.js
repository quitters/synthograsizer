/**
 * Sign in with Google, for the owner of companies (the website's way in; see ownerAuth.js, whose `google` mode uses this).
 *
 * The OAuth 2.0 authorization-code flow, done by the server, so that the console loads no script from Google and its policy (script-src 'self') stays as strict as it is:
 *
 *   1. The console links to /api/company/owner/google/start. The server makes a state, a nonce and a PKCE verifier, keeps them in a short-lived
 *      HttpOnly cookie (cr_oauth, SameSite=Lax so that it comes back on Google's redirect, ten minutes), and sends the browser to Google.
 *   2. Google sends the browser back to /api/company/owner/google/callback with a code and the state.
 *   3. The server checks the state against the cookie, trades the code for an ID token at Google's token endpoint (with the client secret and the PKCE verifier),
 *      and checks the token: its signature against Google's published keys (RS256 only, by key id), the issuer, the audience (this client), its expiry, the nonce,
 *      and a verified email. Only then is the email looked up in the operator's allowlist (COMPANY_OWNER_EMAILS).
 *   4. The owner id is a hash of Google's stable `sub` (never of the email, which can change), so the same Google account is the same owner everywhere.
 *
 * Fails closed: without a client id, a client secret, a public URL and at least one allowed email there is no way in, and the answer says what is missing.
 * Only the accounts on the list can own companies, because a company spends the operator's model key and nothing here meters it per user (the hosted
 * service's plan says the chat room needs credit metering before it is open to anyone: docs/HANDOFF_SERVICE_LAUNCH.md).
 */
import crypto from 'node:crypto';
import { PolicyError } from './errors.js';
import { sha256 } from './util.js';

export const GOOGLE_ENDPOINTS = Object.freeze({
  authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  jwks: 'https://www.googleapis.com/oauth2/v3/certs',
  issuers: Object.freeze(['https://accounts.google.com', 'accounts.google.com']),
});

export const PENDING_COOKIE = 'cr_oauth';
export const PENDING_MS = 10 * 60_000;
const CLOCK_SKEW_S = 60;
const JWKS_TTL_MS = 60 * 60_000;
const CALL_TIMEOUT_MS = 10_000;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

/** The owner id of a Google account: a hash of its stable subject, in the same shape as every other owner id. */
export const ownerIdForGoogle = (sub) => sha256(`google:${sub}`).slice(0, 32);

/** "a@x.com, B@y.org" -> Set { 'a@x.com', 'b@y.org' } */
export function parseAllowedEmails(raw) {
  return new Set(String(raw ?? '').split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)));
}

const bad = (message, code, status = 401) => new PolicyError(message, { code, status });

/**
 * Check an ID token and return its claims, or throw. RS256 only (a token that names another algorithm, or none, is refused before anything else is
 * read), verified against the key whose id the header names.
 * @param {string} token
 * @param {{ keys: object[], clientId: string, nonce: string, issuers: readonly string[], nowMs: number }} expect
 */
export function verifyIdToken(token, { keys, clientId, nonce, issuers, nowMs }) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw bad('Google sent something that is not a sign-in token.', 'google_bad_token');
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { throw bad('Google sent something that is not a sign-in token.', 'google_bad_token'); }
  if (header?.alg !== 'RS256' || typeof header.kid !== 'string') throw bad('The sign-in token is not signed the way Google signs them.', 'google_bad_token');
  const jwk = (keys || []).find(k => k && k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) throw bad('The sign-in token is signed with a key Google does not publish.', 'google_unknown_key');
  let ok = false;
  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  } catch { ok = false; }
  if (!ok) throw bad('The sign-in token\'s signature does not check out.', 'google_bad_signature');

  const nowS = Math.floor(nowMs / 1000);
  if (!issuers.includes(claims.iss)) throw bad('The sign-in token is not from Google.', 'google_bad_issuer');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(clientId) || (audiences.length > 1 && claims.azp !== clientId)) throw bad('The sign-in token is for another application.', 'google_bad_audience');
  if (!Number.isFinite(claims.exp) || claims.exp + CLOCK_SKEW_S < nowS) throw bad('The sign-in token has expired.', 'google_expired');
  if (Number.isFinite(claims.iat) && claims.iat - CLOCK_SKEW_S > nowS) throw bad('The sign-in token is from the future.', 'google_expired');
  if (typeof claims.nonce !== 'string' || !safeEqual(claims.nonce, nonce)) throw bad('The sign-in token is not the answer to this sign-in.', 'google_bad_nonce');
  if (typeof claims.sub !== 'string' || !claims.sub) throw bad('The sign-in token names nobody.', 'google_bad_token');
  if (typeof claims.email !== 'string' || claims.email_verified !== true) throw bad('Google has not verified that email address.', 'google_unverified_email', 403);
  return claims;
}

export class GoogleSignIn {
  /**
   * @param {{ clientId?: string, clientSecret?: string, publicUrl?: string, allowedEmails?: Set<string>, endpoints?: typeof GOOGLE_ENDPOINTS,
   *           fetchImpl?: typeof fetch, now?: () => Date }} options
   *   publicUrl is where the browser reaches this chat server (it may include a path, such as https://site.example/chatroom): the redirect URI
   *   registered with Google is `${publicUrl}/api/company/owner/google/callback`. It is never taken from a request's Host header.
   */
  constructor({ clientId = '', clientSecret = '', publicUrl = '', allowedEmails = new Set(), endpoints = GOOGLE_ENDPOINTS, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
    this.clientId = String(clientId).trim();
    this.clientSecret = String(clientSecret).trim();
    this.publicUrl = String(publicUrl).trim().replace(/\/+$/, '');
    this.allowedEmails = allowedEmails;
    this.endpoints = endpoints;
    this.fetch = fetchImpl;
    this.now = now;
    this._jwks = null;
  }

  get redirectUri() { return `${this.publicUrl}/api/company/owner/google/callback`; }

  get startUrl() { return `${this.publicUrl}/api/company/owner/google/start`; }

  /** What is missing, in words, or null when sign-in can work. */
  get problem() {
    const missing = [];
    if (!this.clientId) missing.push('COMPANY_GOOGLE_CLIENT_ID');
    if (!this.clientSecret) missing.push('COMPANY_GOOGLE_CLIENT_SECRET');
    if (!this.allowedEmails.size) missing.push('COMPANY_OWNER_EMAILS (the Google accounts that may own companies)');
    if (!this.publicUrl) missing.push('COMPANY_PUBLIC_URL (where the browser reaches this server)');
    else if (!/^https:\/\/[^/\s]+/.test(this.publicUrl) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(this.publicUrl)) missing.push('COMPANY_PUBLIC_URL as an https address (http only for localhost)');
    return missing.length ? `Google sign-in is not set up: ${missing.join(', ')}.` : null;
  }

  /** The first step: where to send the browser, and the cookie value that remembers what to expect when it comes back. */
  begin() {
    if (this.problem) throw new PolicyError(this.problem, { status: 503, code: 'google_not_configured' });
    const state = b64u(crypto.randomBytes(32));
    const nonce = b64u(crypto.randomBytes(32));
    const verifier = b64u(crypto.randomBytes(48));
    const url = new URL(this.endpoints.authorization);
    url.search = new URLSearchParams({
      client_id: this.clientId, redirect_uri: this.redirectUri, response_type: 'code', scope: 'openid email',
      state, nonce, code_challenge: b64u(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256', prompt: 'select_account',
    }).toString();
    return { location: url.toString(), pending: b64u(JSON.stringify({ s: state, n: nonce, v: verifier, t: this.now().getTime() })) };
  }

  async _keys(force = false) {
    const t = this.now().getTime();
    if (!force && this._jwks && t - this._jwks.at < JWKS_TTL_MS) return this._jwks.keys;
    const res = await this._call(this.endpoints.jwks, { method: 'GET' });
    const body = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(body?.keys)) throw new PolicyError('Google\'s signing keys could not be fetched.', { status: 502, code: 'google_unavailable' });
    this._jwks = { keys: body.keys, at: t };
    return body.keys;
  }

  async _call(url, init) {
    try {
      return await this.fetch(url, { ...init, signal: AbortSignal.timeout(CALL_TIMEOUT_MS), redirect: 'error' });
    } catch {
      throw new PolicyError('Google could not be reached.', { status: 502, code: 'google_unavailable' });
    }
  }

  /**
   * The last step: the browser is back from Google. Returns who signed in; throws a PolicyError (with nothing of Google's answers in its words) when anything is wrong.
   * @param {{ code?: string, state?: string, error?: string }} query
   * @param {string|undefined} pending the cr_oauth cookie
   * @returns {Promise<{ sub: string, email: string, ownerId: string }>}
   */
  async finish(query, pending) {
    if (this.problem) throw new PolicyError(this.problem, { status: 503, code: 'google_not_configured' });
    if (query?.error) throw bad('Google did not sign you in.', 'google_denied');
    let saved = null;
    try { saved = JSON.parse(Buffer.from(String(pending || ''), 'base64url').toString('utf8')); } catch { /* checked below */ }
    const age = this.now().getTime() - Number(saved?.t);
    if (!saved || typeof saved.s !== 'string' || typeof saved.n !== 'string' || typeof saved.v !== 'string' || !Number.isFinite(age) || age < 0 || age > PENDING_MS) {
      throw bad('This sign-in did not start here, or it took too long. Start again.', 'google_bad_state');
    }
    if (typeof query?.state !== 'string' || !safeEqual(query.state, saved.s)) throw bad('This sign-in did not start here, or it took too long. Start again.', 'google_bad_state');
    if (typeof query.code !== 'string' || !query.code || query.code.length > 2048) throw bad('Google did not send a code.', 'google_denied');

    const res = await this._call(this.endpoints.token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code: query.code, redirect_uri: this.redirectUri,
        client_id: this.clientId, client_secret: this.clientSecret, code_verifier: saved.v,
      }).toString(),
    });
    const body = await res.json().catch(() => null);
    if (res.status >= 500) throw new PolicyError('Google is not answering.', { status: 502, code: 'google_unavailable' });
    if (!res.ok || typeof body?.id_token !== 'string') throw bad('Google would not accept this sign-in. Start again.', 'google_rejected');

    const check = (keys) => verifyIdToken(body.id_token, { keys, clientId: this.clientId, nonce: saved.n, issuers: this.endpoints.issuers, nowMs: this.now().getTime() });
    let claims;
    try {
      claims = check(await this._keys());
    } catch (err) {
      if (err.code !== 'google_unknown_key') throw err;
      claims = check(await this._keys(true));          // Google rotates its keys: look once more before refusing
    }
    const email = claims.email.toLowerCase();
    if (!this.allowedEmails.has(email)) throw new PolicyError('That Google account is not allowed to own companies here.', { status: 403, code: 'not_allowed' });
    return { sub: claims.sub, email, ownerId: ownerIdForGoogle(claims.sub) };
  }
}

/** The settings from the environment. */
export function googleFromEnv(env, extra = {}) {
  return new GoogleSignIn({
    clientId: env.COMPANY_GOOGLE_CLIENT_ID, clientSecret: env.COMPANY_GOOGLE_CLIENT_SECRET, publicUrl: env.COMPANY_PUBLIC_URL,
    allowedEmails: parseAllowedEmails(env.COMPANY_OWNER_EMAILS), ...extra,
  });
}
