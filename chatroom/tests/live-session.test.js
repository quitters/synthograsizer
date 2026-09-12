/**
 * Phase 8 (partial): Live API session brokering.
 *
 * This endpoint mints credentials that spend the operator's money, and the
 * chat room has no auth of its own — so most of these tests are about the
 * token being tightly scoped and the endpoint being hard to expose by
 * accident.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.SYNTH_BACKEND_URL = 'http://127.0.0.1:9';

const { initializeLive, mintSessionToken, isLoopbackRequest } =
  await import('../server/services/liveSession.js');
const {
  LIVE_MODEL, TOKEN_USES, TOKEN_EXPIRY_MS, NEW_SESSION_WINDOW_MS,
  INPUT_AUDIO, OUTPUT_AUDIO,
} = await import('../server/config/live.js');

function tokenClient({ name = 'auth_tokens/abc123', throws = null } = {}) {
  const configs = [];
  return {
    configs,
    authTokens: {
      create: async ({ config }) => {
        configs.push(config);
        if (throws) throw new Error(throws);
        return { name };
      },
    },
  };
}

describe('minting a session token', () => {
  test('returns the token and everything the client needs to connect', async () => {
    initializeLive(null, tokenClient());
    const result = await mintSessionToken();

    assert.equal(result.token, 'auth_tokens/abc123');
    assert.equal(result.model, LIVE_MODEL);
    assert.ok(result.expiresAt);
    assert.ok(result.connectBy);
    assert.deepEqual(result.audio.input, INPUT_AUDIO);
    assert.deepEqual(result.audio.output, OUTPUT_AUDIO);
  });

  test('is single-use and short-lived — a leaked token must be near worthless', async () => {
    const client = tokenClient();
    initializeLive(null, client);
    const before = Date.now();
    await mintSessionToken();

    const cfg = client.configs[0];
    assert.equal(cfg.uses, TOKEN_USES);
    assert.equal(cfg.uses, 1, 'more than one use defeats the point');

    const expiry = new Date(cfg.expireTime).getTime() - before;
    assert.ok(expiry <= TOKEN_EXPIRY_MS + 1000 && expiry > 0, `expiry was ${expiry}ms`);

    const connectWindow = new Date(cfg.newSessionExpireTime).getTime() - before;
    assert.ok(connectWindow <= NEW_SESSION_WINDOW_MS + 1000 && connectWindow > 0);
    assert.ok(connectWindow < expiry, 'the connect window must close before the session does');
  });

  test('surfaces a mint failure rather than returning a broken token', async () => {
    initializeLive(null, tokenClient({ throws: 'quota exceeded' }));
    await assert.rejects(() => mintSessionToken(), /quota exceeded/);
  });

  test('rejects a response with no token in it', async () => {
    initializeLive(null, tokenClient({ name: null }));
    await assert.rejects(() => mintSessionToken(), /no token/);
  });

});

describe('loopback detection', () => {
  test('recognises local callers', () => {
    for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.0.0.5']) {
      assert.ok(isLoopbackRequest({ ip }), `${ip} should be loopback`);
    }
  });

  test('treats everything else as remote', () => {
    for (const ip of ['192.168.1.50', '10.0.0.3', '203.0.113.7', '']) {
      assert.ok(!isLoopbackRequest({ ip }), `${ip} should NOT be loopback`);
    }
  });

  test('falls back to the socket address when req.ip is absent', () => {
    assert.ok(isLoopbackRequest({ socket: { remoteAddress: '127.0.0.1' } }));
    assert.ok(!isLoopbackRequest({ socket: { remoteAddress: '8.8.8.8' } }));
  });
});
