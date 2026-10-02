/**
 * Live API session brokering.
 * ───────────────────────────
 * Mints short-lived, single-use tokens so a browser can open a Live API
 * WebSocket without ever holding the real API key.
 *
 * This is the server half of §4.7. The browser half — microphone capture,
 * PCM resampling, playback, barge-in, and negotiating turns between a live
 * human and the autonomous agent loop — is NOT here; see the Phase 8 notes
 * in MODERNIZATION_PLAN.md for why it was left to be built against a real
 * microphone rather than guessed at.
 */
import { GoogleGenAI } from '@google/genai';
import {
  LIVE_MODEL, TOKEN_USES, TOKEN_EXPIRY_MS, NEW_SESSION_WINDOW_MS,
  INPUT_AUDIO, OUTPUT_AUDIO,
} from '../config/live.js';

let genAI = null;

export function initializeLive(apiKey, client = null) {
  genAI = client || new GoogleGenAI({ apiKey });
}

/**
 * Mint one ephemeral token.
 *
 * Defaults are deliberately tight: a single use, a one-minute window to
 * connect, and a session that cannot outlive the quarter hour. A token that
 * leaks is worth almost nothing.
 *
 * @returns {Promise<{token: string, model: string, expiresAt: string, connectBy: string}>}
 */
export async function mintSessionToken() {
  if (!genAI) throw new Error('Live API not initialized');

  const now = Date.now();
  const expireTime = new Date(now + TOKEN_EXPIRY_MS).toISOString();
  const newSessionExpireTime = new Date(now + NEW_SESSION_WINDOW_MS).toISOString();

  const created = await genAI.authTokens.create({
    config: { uses: TOKEN_USES, expireTime, newSessionExpireTime },
  });

  if (!created?.name) throw new Error('token service returned no token');

  return {
    // The token IS the name field — it is passed as the apiKey by the client.
    token: created.name,
    model: LIVE_MODEL,
    expiresAt: expireTime,
    connectBy: newSessionExpireTime,
    audio: { input: INPUT_AUDIO, output: OUTPUT_AUDIO },
  };
}

/**
 * Is this request local to the machine running the server?
 *
 * Tokens are only served to loopback unless explicitly allowed wider,
 * because this app has no auth of its own and the endpoint mints spend.
 */
export function isLoopbackRequest(req) {
  const ip = req.ip || req.socket?.remoteAddress || '';
  return (
    ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' ||
    ip.startsWith('127.')
  );
}
