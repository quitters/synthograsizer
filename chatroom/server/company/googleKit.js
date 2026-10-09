/**
 * A stand-in for Google, for tests: it signs ID tokens with a real RSA key, publishes the key, trades one-time codes for tokens, and checks what the real one
 * checks (the client id and secret, the redirect URI, the PKCE verifier against the challenge). `fetchImpl` is what GoogleSignIn calls instead of the network.
 */
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const TEST_ENDPOINTS = Object.freeze({
  authorization: 'https://google.test/o/oauth2/v2/auth',
  token: 'https://google.test/token',
  jwks: 'https://google.test/certs',
  issuers: Object.freeze(['https://accounts.google.com', 'accounts.google.com']),
});

export function fakeGoogle({ clientId = 'client-123.apps.googleusercontent.com', clientSecret = 'not-a-real-secret', now = () => Date.now() } = {}) {
  const pair = () => crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keys = { k1: pair() };
  const jwkOf = (kid) => ({ ...keys[kid].publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' });
  const g = {
    clientId, clientSecret, endpoints: TEST_ENDPOINTS, keys,
    published: ['k1'],                 // which keys the certs endpoint lists
    calls: { certs: 0, token: 0 },
    codes: new Map(),                  // code -> { challenge, token, redirectUri }
    tokenStatus: null,                 // set to 500 (or 400) to make the token endpoint fail
    certsStatus: null,
    networkDown: false,
    lastTokenRequest: null,
  };

  /** A signed JWT. `over` replaces claims; `sign` chooses key id, algorithm and the key used (to forge). */
  g.sign = (over = {}, { kid = 'k1', alg = 'RS256', signWith = keys[kid]?.privateKey ?? keys.k1.privateKey, header = {} } = {}) => {
    const t = Math.floor(now() / 1000);
    const claims = { iss: 'https://accounts.google.com', aud: clientId, azp: clientId, sub: '1100000000000000000001', email: 'owner@example.com', email_verified: true, iat: t, exp: t + 3600, ...over };
    for (const k of Object.keys(claims)) if (claims[k] === undefined) delete claims[k];
    const head = b64u(JSON.stringify({ alg, kid, typ: 'JWT', ...header }));
    const body = b64u(JSON.stringify(claims));
    const data = `${head}.${body}`;
    const sig = alg === 'RS256' ? crypto.sign('RSA-SHA256', Buffer.from(data), signWith) : (alg === 'none' ? Buffer.alloc(0) : crypto.createHmac('sha256', 'secret').update(data).digest());
    return `${data}.${b64u(sig)}`;
  };

  g.addKey = (kid) => { keys[kid] = pair(); return kid; };

  /**
   * The person at Google's page approving the sign-in that `startUrl` asked for: returns what Google would send back to the callback.
   * `over` and `signOpts` shape the ID token (to make a bad one).
   */
  g.approve = (startUrl, over = {}, signOpts = {}) => {
    const url = new URL(startUrl);
    const p = url.searchParams;
    if (`${url.origin}${url.pathname}` !== TEST_ENDPOINTS.authorization) throw new Error(`not Google's authorization endpoint: ${url}`);
    if (p.get('client_id') !== clientId || p.get('response_type') !== 'code' || p.get('code_challenge_method') !== 'S256' || !/openid/.test(p.get('scope') || '')) throw new Error('the sign-in request is not what Google needs');
    const code = `code-${crypto.randomBytes(8).toString('hex')}`;
    g.codes.set(code, { challenge: p.get('code_challenge'), redirectUri: p.get('redirect_uri'), token: g.sign({ nonce: p.get('nonce'), ...over }, signOpts) });
    return { code, state: p.get('state') };
  };

  g.fetchImpl = async (input, init = {}) => {
    const url = String(input);
    if (g.networkDown) throw new TypeError('fetch failed');
    if (url === TEST_ENDPOINTS.jwks) {
      g.calls.certs += 1;
      if (g.certsStatus) return json(g.certsStatus, {});
      return json(200, { keys: g.published.map(jwkOf) });
    }
    if (url === TEST_ENDPOINTS.token) {
      g.calls.token += 1;
      const form = Object.fromEntries(new URLSearchParams(String(init.body || '')));
      g.lastTokenRequest = form;
      if (g.tokenStatus) return json(g.tokenStatus, { error: 'server_error' });
      const entry = g.codes.get(form.code);
      g.codes.delete(form.code);                                   // a code works once
      const challengeOfVerifier = b64u(crypto.createHash('sha256').update(String(form.code_verifier || '')).digest());
      if (form.grant_type !== 'authorization_code' || form.client_id !== clientId || form.client_secret !== clientSecret || !entry
        || form.redirect_uri !== entry.redirectUri || challengeOfVerifier !== entry.challenge) return json(400, { error: 'invalid_grant' });
      return json(200, { id_token: entry.token, access_token: 'ya29.not-used', token_type: 'Bearer', expires_in: 3599 });
    }
    return json(404, {});
  };
  return g;
}
