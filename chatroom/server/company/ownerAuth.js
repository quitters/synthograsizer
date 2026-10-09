/**
 * Who the owner is.
 *
 * Until now the owner of a company was whoever held a visitor cookie: an unguessable id, but only a browser's memory of one. Lose the cookie
 * (another browser, another machine, a cleared profile) and the companies are still on disk with nobody who can open them; leave the server
 * where more than one person can reach it and anyone who obtains the cookie is the owner.
 *
 * With `COMPANY_OWNER_AUTH=key` the owner is an account instead:
 *
 *   - There is one owner key, 256 random bits, made the first time the server starts in this mode and written to <data>/owner/owner.key.
 *     Only its SHA-256 is kept (owner.json), with the owner's id; the id never changes, even when the key does.
 *   - Signing in with the key gives a session: a random 256-bit token in an HttpOnly, SameSite=Strict cookie, stored only as a hash, expiring
 *     after COMPANY_OWNER_SESSION_DAYS (default 30), revoked by signing out and by changing the key.
 *   - Every company, flow, roster and Hall route then acts for that owner id, whatever visitor cookie the browser holds; without a session
 *     they answer 401 "sign_in_required". A plain chat room still belongs to the visitor cookie: signing in is about companies.
 *   - A wrong key is counted: five in fifteen minutes from one address, or twenty-five in an hour from all, and sign-in answers 429.
 *
 * With the setting off (the default) nothing changes: the visitor cookie is the owner, as before. This is for a server that more than one
 * person, or one person from more than one place, can reach. It is not a user directory: there is one owner. Google sign-in, for a hosted
 * deployment with real accounts, would be another way to produce the same `ownerId`; nothing downstream would change.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PolicyError } from './errors.js';
import { newId, isId, sha256 } from './util.js';

export const OWNER_COOKIE = 'cr_owner';
export const OWNER_MODES = Object.freeze(['off', 'key']);

const SESSION_MAX = 20;                         // sessions kept at once; the oldest goes first
const PER_ADDRESS = { failures: 5, windowMs: 15 * 60_000 };
const ALL_ADDRESSES = { failures: 25, windowMs: 60 * 60_000 };

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

const validAccount = (a) => (a && typeof a === 'object' && isId(a.ownerId) && /^[a-f0-9]{64}$/.test(String(a.keyHash)) ? a : null);

const sameHash = (a, b) => {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

export class OwnerAuth {
  /**
   * @param {{ dataDir: string, env?: object, now?: () => Date, hosted?: boolean, initialOwnerId?: string|null }} options
   *   initialOwnerId: when this start has to make the owner, make it under this id (companies already owned by it stay theirs, nothing moves)
   */
  constructor({ dataDir, env = process.env, now = () => new Date(), hosted = false, initialOwnerId = null }) {
    this.dir = path.join(dataDir, 'owner');
    this.now = now;
    this.hosted = hosted;
    this.warnings = [];
    const asked = String(env.COMPANY_OWNER_AUTH ?? 'off').trim().toLowerCase() || 'off';
    if (!OWNER_MODES.includes(asked)) this.warnings.push(`COMPANY_OWNER_AUTH=${env.COMPANY_OWNER_AUTH} is not one of ${OWNER_MODES.join(', ')} and was ignored (the visitor cookie is the owner)`);
    this.mode = OWNER_MODES.includes(asked) ? asked : 'off';
    const days = Number(env.COMPANY_OWNER_SESSION_DAYS);
    this.sessionDays = Number.isFinite(days) && days >= 1 && days <= 365 ? Math.floor(days) : 30;
    if (env.COMPANY_OWNER_SESSION_DAYS !== undefined && env.COMPANY_OWNER_SESSION_DAYS !== '' && this.sessionDays !== days) {
      this.warnings.push(`COMPANY_OWNER_SESSION_DAYS=${env.COMPANY_OWNER_SESSION_DAYS} was ignored (a whole number of days from 1 to 365; it is ${this.sessionDays})`);
    }
    if (this.mode === 'off' && hosted) this.warnings.push('this is a hosted instance and companies belong to a visitor cookie: set COMPANY_OWNER_AUTH=key so that the owner is an account');
    this.failures = new Map();                  // address -> [times of wrong keys]
    this.allFailures = [];
    this.sessions = new Map();                  // sha256(token) -> { createdAt, expiresAt }
    this.account = null;
    this.initialOwnerId = initialOwnerId;
    if (this.enabled) this._open();
  }

  get enabled() { return this.mode === 'key'; }

  get ownerId() { return this.account?.ownerId ?? null; }

  get keyFile() { return path.join(this.dir, 'owner.key'); }

  _accountFile() { return path.join(this.dir, 'owner.json'); }

  _sessionFile() { return path.join(this.dir, 'sessions.json'); }

  _open() {
    if (fs.existsSync(this._accountFile())) {
      // An owner.json that is there but not readable is NOT "no owner yet": making a new owner would orphan every company. Stop and say so.
      this.account = validAccount(readJson(this._accountFile()));
      if (!this.account) throw new Error(`${this._accountFile()} exists but is not a valid owner record. Restore it from a backup (or move it away to start a new owner, which will not own the existing companies; see \`npm run owner -- adopt\`).`);
    } else {
      this.initialize({ ownerId: this.initialOwnerId });
      this.justCreated = true;
    }
    this._loadSessions();
  }

  _loadSessions() {
    this.sessions = new Map();
    const saved = readJson(this._sessionFile());
    const t = this.now().getTime();
    for (const [hash, s] of Object.entries(saved?.sessions || {})) {
      if (s && Date.parse(s.expiresAt) > t) this.sessions.set(hash, s);
    }
  }

  /**
   * The owner record can be changed by someone else while the server runs (the command line's rotate): look again whenever a session is asked about,
   * so that a new key and the end of every old session take effect at once, not at the next restart.
   */
  _refresh() {
    const seen = validAccount(readJson(this._accountFile()));
    if (!seen || (seen.keyHash === this.account.keyHash && seen.ownerId === this.account.ownerId)) return;
    this.account = seen;
    this._loadSessions();
  }

  /**
   * Make the owner: a key and an id. Called the first time the server starts in key mode, and by the command line to start an owner under an
   * id that already owns companies (so that nothing has to move). Refuses to replace an owner that exists.
   * @returns {{ ownerId: string, key: string, keyFile: string }}
   */
  initialize({ ownerId = null } = {}) {
    if (this.account) throw new PolicyError('There is an owner already. Rotate the key to change it.', { status: 409, code: 'owner_exists' });
    if (ownerId !== null && !isId(ownerId)) throw new PolicyError('An owner id is 32 lower-case hex characters.', { status: 400, code: 'bad_owner_id', field: 'ownerId' });
    const key = crypto.randomBytes(32).toString('hex');
    this.account = { version: 1, ownerId: ownerId || newId(), keyHash: sha256(key), createdAt: this.now().toISOString(), keyChangedAt: this.now().toISOString() };
    writeJsonAtomic(this._accountFile(), this.account);
    fs.writeFileSync(this.keyFile, `${key}\n`, { mode: 0o600 });
    return { ownerId: this.account.ownerId, key, keyFile: this.keyFile };
  }

  /** A new key. Every session ends, because the people it was for may not have had the old key to lose. The owner id stays. */
  rotateKey() {
    if (!this.account) throw new PolicyError('There is no owner yet.', { status: 409, code: 'no_owner' });
    const key = crypto.randomBytes(32).toString('hex');
    this.account = { ...this.account, keyHash: sha256(key), keyChangedAt: this.now().toISOString() };
    writeJsonAtomic(this._accountFile(), this.account);
    fs.writeFileSync(this.keyFile, `${key}\n`, { mode: 0o600 });
    this.sessions.clear();
    this._saveSessions();
    return { key, keyFile: this.keyFile };
  }

  _saveSessions() {
    const sessions = Object.fromEntries([...this.sessions.entries()]);
    writeJsonAtomic(this._sessionFile(), { version: 1, sessions });
  }

  _recent(list, windowMs, t) {
    return list.filter(x => t - x < windowMs);
  }

  _checkAttempts(address) {
    const t = this.now().getTime();
    const mine = this._recent(this.failures.get(address) || [], PER_ADDRESS.windowMs, t);
    this.allFailures = this._recent(this.allFailures, ALL_ADDRESSES.windowMs, t);
    const blockedMine = mine.length >= PER_ADDRESS.failures ? PER_ADDRESS.windowMs - (t - mine[0]) : 0;
    const blockedAll = this.allFailures.length >= ALL_ADDRESSES.failures ? ALL_ADDRESSES.windowMs - (t - this.allFailures[0]) : 0;
    const wait = Math.max(blockedMine, blockedAll);
    if (wait > 0) {
      const minutes = Math.max(1, Math.ceil(wait / 60_000));
      throw new PolicyError(`Too many wrong keys. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, { status: 429, code: 'too_many_attempts' });
    }
  }

  /**
   * Check the key and open a session.
   * @returns {{ token: string, expiresAt: string, maxAgeSeconds: number }}
   */
  signIn(candidate, { address = 'unknown' } = {}) {
    if (!this.enabled) throw new PolicyError('Owner sign-in is not switched on here (COMPANY_OWNER_AUTH=key).', { status: 400, code: 'owner_auth_off' });
    this._refresh();
    this._checkAttempts(address);
    const given = typeof candidate === 'string' ? candidate.trim() : '';
    if (!given || given.length > 200 || !sameHash(sha256(given), this.account.keyHash)) {
      const t = this.now().getTime();
      this.failures.set(address, [...this._recent(this.failures.get(address) || [], PER_ADDRESS.windowMs, t), t]);
      this.allFailures.push(t);
      if (this.failures.size > 500) {                      // a few thousand addresses must not be a memory leak: forget the ones whose window has passed
        for (const [a, times] of this.failures) if (!this._recent(times, PER_ADDRESS.windowMs, t).length) this.failures.delete(a);
      }
      throw new PolicyError('That is not the owner key.', { status: 401, code: 'bad_key', field: 'key' });
    }
    this.failures.delete(address);
    const token = crypto.randomBytes(32).toString('hex');
    const created = this.now();
    const expires = new Date(created.getTime() + this.sessionDays * 86_400_000);
    this.sessions.set(sha256(token), { createdAt: created.toISOString(), expiresAt: expires.toISOString() });
    while (this.sessions.size > SESSION_MAX) this.sessions.delete(this.sessions.keys().next().value);
    this._saveSessions();
    return { token, expiresAt: expires.toISOString(), maxAgeSeconds: this.sessionDays * 86_400 };
  }

  /** The owner a cookie's token stands for, or null (no token, an unknown one, an expired one). */
  sessionFor(token) {
    if (!this.enabled || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    this._refresh();
    const hash = sha256(token);
    const s = this.sessions.get(hash);
    if (!s) return null;
    if (Date.parse(s.expiresAt) <= this.now().getTime()) {
      this.sessions.delete(hash);
      return null;
    }
    return { ownerId: this.account.ownerId, expiresAt: s.expiresAt };
  }

  signOut(token) {
    if (!this.enabled || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
    const had = this.sessions.delete(sha256(token));
    if (had) this._saveSessions();
    return had;
  }

  /** What the console needs to know before anything else. Never the key, the hash or anyone's token. */
  describe(signedIn) {
    return { mode: this.mode, signedIn: this.enabled ? Boolean(signedIn) : true, sessionDays: this.enabled ? this.sessionDays : null };
  }
}

/** The Set-Cookie value for a session, or its removal (maxAgeSeconds 0). Secure when the request came over https. */
export function buildOwnerCookie(token, maxAgeSeconds, req) {
  const https = req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  return [`${OWNER_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeconds}`, https ? 'Secure' : ''].filter(Boolean).join('; ');
}
