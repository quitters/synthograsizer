/**
 * Signing in as the owner (see company/ownerAuth.js and company/googleAuth.js). Mounted before the guard that every other company route sits behind:
 *
 *   GET  /api/company/owner                      what the console needs first: how sign-in works here, and whether this browser is signed in
 *   POST /api/company/owner/signin               { key } (key mode) -> a session cookie; a wrong key is counted and, at the limit, refused
 *   GET  /api/company/owner/google/start         (google mode) sends the browser to Google
 *   GET  /api/company/owner/google/callback      (google mode) Google sends the browser back here with a code
 *   POST /api/company/owner/signout              ends this browser's session
 *
 * With sign-in off, GET answers that you are "signed in" (the visitor cookie is the owner) and signin answers 400.
 */
import { Router } from 'express';
import { handle } from './httpUtil.js';
import { buildOwnerCookie } from '../company/ownerAuth.js';
import { PENDING_COOKIE, PENDING_MS } from '../company/googleAuth.js';
import { isPolicyError } from '../company/errors.js';
import { parseCookies } from '../middleware/session.js';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]);

const isHttps = (req) => req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';

/** The cookie that remembers what to expect when Google sends the browser back: HttpOnly, Lax (it has to come back on a cross-site redirect), ten minutes. */
const pendingCookie = (value, maxAgeSeconds, req, secure = false) => [`${PENDING_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`, secure || isHttps(req) ? 'Secure' : ''].filter(Boolean).join('; ');

/** A page with no script and no outside resource, for the two places the browser lands on a navigation, not a fetch. */
function page(res, status, { title, body, refresh = null }) {
  res.status(status);
  res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
  res.send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${refresh ? `<meta http-equiv="refresh" content="0;url=${escapeHtml(refresh)}">` : ''}<title>${escapeHtml(title)}</title>`
    + '<body style="font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 1rem;background:#0e1116;color:#e6edf3">'
    + `<h1 style="font-size:1.2rem">${escapeHtml(title)}</h1>${body}</body></html>`);
}

/** @param {{ ownerAuth: import('../company/ownerAuth.js').OwnerAuth }} services */
export function createOwnerRouter({ ownerAuth }) {
  const router = Router();
  const consoleUrl = () => `${ownerAuth.google?.publicUrl || ''}/company/`;
  // A server whose public address is https always marks its cookies Secure, whatever headers a proxy passes along
  const secure = () => String(ownerAuth.google?.publicUrl || '').startsWith('https://');

  router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(ownerAuth.describe(req.ownerSession));
  });

  router.post('/signin', handle((req, res) => {
    const { token, maxAgeSeconds } = ownerAuth.signIn(req.body?.key, { address: req.ip || 'unknown' });
    res.set('Cache-Control', 'no-store');
    res.append('Set-Cookie', buildOwnerCookie(token, maxAgeSeconds, req));
    res.json(ownerAuth.describe(ownerAuth.sessionFor(token)));
  }));

  router.post('/signout', handle((req, res) => {
    ownerAuth.signOut(req.ownerToken);
    if (ownerAuth.enabled) res.append('Set-Cookie', buildOwnerCookie('', 0, req, { secure: secure() }));
    res.set('Cache-Control', 'no-store');
    res.json(ownerAuth.describe(null));
  }));

  // ── Google (the website's way in) ──

  router.get('/google/start', (req, res) => {
    if (ownerAuth.mode !== 'google') return res.status(404).json({ error: 'Google sign-in is not switched on here.', code: 'google_off' });
    try {
      ownerAuth.checkAttempts(req.ip || 'unknown');
      const { location, pending } = ownerAuth.google.begin();
      res.append('Set-Cookie', pendingCookie(pending, PENDING_MS / 1000, req, secure()));
      res.set('Cache-Control', 'no-store');
      return res.redirect(302, location);
    } catch (err) {
      if (!isPolicyError(err)) throw err;
      return page(res, err.status, { title: 'Sign-in is not available', body: `<p>${escapeHtml(err.message)}</p>` });
    }
  });

  router.get('/google/callback', async (req, res) => {
    if (ownerAuth.mode !== 'google') return res.status(404).json({ error: 'Google sign-in is not switched on here.', code: 'google_off' });
    const address = req.ip || 'unknown';
    try {
      ownerAuth.checkAttempts(address);
      const who = await ownerAuth.google.finish(req.query, parseCookies(req.headers.cookie)[PENDING_COOKIE]);
      ownerAuth.recordAccount(who.ownerId, who.email);
      const session = ownerAuth.openSession({ ownerId: who.ownerId, label: who.email, email: who.email, via: 'google' }, { address });
      res.append('Set-Cookie', buildOwnerCookie(session.token, session.maxAgeSeconds, req, { secure: secure() }));
      res.append('Set-Cookie', pendingCookie('', 0, req, secure()));
      // Not a redirect: the session cookie is SameSite=Strict, and a redirect that began on Google's site would not carry it. A page that sends the
      // browser on itself is a navigation from this site, so the cookie goes along.
      return page(res, 200, { title: 'Signed in', refresh: consoleUrl(), body: `<p>Taking you to the console.</p><p><a href="${escapeHtml(consoleUrl())}" style="color:#2dd4bf">Open the console</a></p>` });
    } catch (err) {
      if (!isPolicyError(err)) throw err;
      if (err.status === 401 || err.status === 403) ownerAuth.noteFailure(address);
      res.append('Set-Cookie', pendingCookie('', 0, req, secure()));
      return page(res, err.status, { title: 'Sign-in did not work', body: `<p>${escapeHtml(err.message)}</p><p><a href="${escapeHtml(consoleUrl())}" style="color:#2dd4bf">Back to the console</a></p>` });
    }
  });

  return router;
}

/** Everything that is about companies is for the owner: with sign-in on, a visitor who has not signed in is told to; with it off the visitor cookie is the owner. */
export function requireOwner(req, res, next) {
  if (req.ownerId) return next();
  return res.status(401).json({ error: 'Sign in as the owner to use companies.', code: 'sign_in_required' });
}
