/**
 * What the company routers share: turning a refusal into an HTTP answer, and holding a body to its schema.
 */
import { PolicyError, isPolicyError } from '../company/errors.js';
import { validate } from '../company/schema.js';

/** Hold a request body to a schema (the same schema GET /api/company/schema serves). */
export function checkBody(schema, body) {
  const errors = validate(schema, body ?? {});
  if (errors.length) throw new PolicyError(errors.join('; '), { status: 400, code: 'bad_request' });
  return body ?? {};
}

/** A refusal from the safety layer is an answer, not a crash. */
export const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (isPolicyError(err)) {
      return res.status(err.status).json({ error: err.message, code: err.code, ...(err.field ? { field: err.field } : {}) });
    }
    console.error('[company]', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

/** Every change is a JSON request: a page on another origin cannot send one without a preflight, which the CORS list refuses. */
export function jsonOnlyChanges(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (/^application\/json\b/i.test(req.headers['content-type'] || '')) return next();
  return res.status(415).json({ error: 'Send changes as application/json.', code: 'json_required' });
}

/** The owner as an author in the Hall: the company's own voice, which no agent can use. */
export const OWNER_AUTHOR = Object.freeze({ id: null, name: 'Owner', system: true });
