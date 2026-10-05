/**
 * Give every request its visitor's own chat room: `req.room`
 * ({ id, orchestrator, mediaStore, artifactStore }).
 *
 * The visitor is identified by an unguessable cookie. A browser without one is
 * handed a new id in a Set-Cookie header and starts with an empty room. A cookie
 * that does not look like an id we issued is ignored, never trusted.
 *
 * It is one cookie for the whole origin (Path=/) so every page of the suite that
 * talks to the chat room -- the chat room itself, Agent Studio, the trace viewer,
 * the workflow runner -- lands in the same room.
 */
import { getRoom, isRoomId, newRoomId } from '../services/sessionRegistry.js';

export const COOKIE_NAME = 'cr_sid';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (name && !(name in out)) out[name] = part.slice(i + 1).trim();
  }
  return out;
}

export function buildCookie(id, req) {
  const https = req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  return [
    `${COOKIE_NAME}=${id}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_SECONDS}`,
    https ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export function roomMiddleware(req, res, next) {
  // A liveness probe is nobody's visit: do not mint a room (or a cookie) for it.
  if (req.path === '/health') return next();
  let id = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const isNew = !isRoomId(id);
  if (isNew) {
    id = newRoomId();
    res.append('Set-Cookie', buildCookie(id, req));
  }
  req.room = getRoom(id);
  req.roomIsNew = isNew;
  next();
}
