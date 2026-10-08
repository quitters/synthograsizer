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
 *
 * A visitor who owns companies can also reach their department rooms: a request
 * names one with an X-Room-Id header (or ?room=, for an event stream, which cannot set
 * headers). That works only for a room that belongs to one of THAT visitor's companies;
 * for anything else the answer is "no such room", the same as for an id that does not
 * exist, so it never confirms that someone else's room is there.
 */
import { getRoom, isRoomId, newRoomId } from '../services/sessionRegistry.js';

export const COOKIE_NAME = 'cr_sid';
export const ROOM_HEADER = 'x-room-id';
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

/** The room a request names besides its own, or ''. */
export function requestedRoomId(req) {
  const header = req.headers?.[ROOM_HEADER];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  if (fromHeader) return String(fromHeader).trim();
  return typeof req.query?.room === 'string' ? req.query.room.trim() : '';
}

/**
 * @param {{ roomOwner?: (roomId: string) => ({ company: { ownerId: string }, department: object }|null) }} [options]
 *   roomOwner says which company a room id belongs to (the company store's lookup). Without it no room but the visitor's own is reachable.
 */
export function createRoomMiddleware({ roomOwner = () => null } = {}) {
  return function roomMiddleware(req, res, next) {
    // A liveness probe is nobody's visit: do not mint a room (or a cookie) for it.
    if (req.path === '/health') return next();
    let id = parseCookies(req.headers.cookie)[COOKIE_NAME];
    const isNew = !isRoomId(id);
    if (isNew) {
      id = newRoomId();
      res.append('Set-Cookie', buildCookie(id, req));
    }
    req.visitorId = id;
    req.roomIsNew = isNew;

    const wanted = requestedRoomId(req);
    if (wanted && wanted !== id) {
      const hit = isRoomId(wanted) ? roomOwner(wanted) : null;
      if (!hit || hit.company.ownerId !== id) return res.status(404).json({ error: 'No such room.' });
      req.room = getRoom(wanted);
      req.company = hit.company;
      req.department = hit.department;
    } else {
      req.room = getRoom(id);
    }
    next();
  };
}

export const roomMiddleware = createRoomMiddleware();
