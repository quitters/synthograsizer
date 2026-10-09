/**
 * Signing in as the owner (see company/ownerAuth.js). Three routes, mounted before the guard that every other company route sits behind:
 *
 *   GET  /api/company/owner           what the console needs first: whether sign-in is on, and whether this browser is signed in
 *   POST /api/company/owner/signin    { key } -> a session cookie (HttpOnly, SameSite=Strict); a wrong key is counted and, at the limit, refused
 *   POST /api/company/owner/signout   ends this browser's session
 *
 * With sign-in off, GET answers that you are "signed in" (the visitor cookie is the owner) and signin answers 400.
 */
import { Router } from 'express';
import { handle } from './httpUtil.js';
import { buildOwnerCookie } from '../company/ownerAuth.js';

/** @param {{ ownerAuth: import('../company/ownerAuth.js').OwnerAuth }} services */
export function createOwnerRouter({ ownerAuth }) {
  const router = Router();

  router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(ownerAuth.describe(Boolean(req.ownerSession)));
  });

  router.post('/signin', handle((req, res) => {
    const { token, maxAgeSeconds } = ownerAuth.signIn(req.body?.key, { address: req.ip || 'unknown' });
    res.set('Cache-Control', 'no-store');
    res.append('Set-Cookie', buildOwnerCookie(token, maxAgeSeconds, req));
    res.json(ownerAuth.describe(true));
  }));

  router.post('/signout', handle((req, res) => {
    ownerAuth.signOut(req.ownerToken);
    if (ownerAuth.enabled) res.append('Set-Cookie', buildOwnerCookie('', 0, req));
    res.set('Cache-Control', 'no-store');
    res.json(ownerAuth.describe(false));
  }));

  return router;
}

/** Everything that is about companies is for the owner: with sign-in on, a visitor who has not signed in is told to. */
export function requireOwner(req, res, next) {
  if (req.ownerId) return next();
  return res.status(401).json({ error: 'Sign in as the owner to use companies.', code: 'sign_in_required' });
}
