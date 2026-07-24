/**
 * uuid — BROWSER SHIM
 * ───────────────────
 * The Node engine does `import { v4 as uuidv4 } from 'uuid'`, a bare npm
 * specifier a browser cannot resolve without an import map. This provides the
 * one export the engine uses, so the vendored workflowEngine.js only needs its
 * import path changed from 'uuid' to './uuid.js'.
 *
 * crypto.randomUUID is the native equivalent and is available in every browser
 * this app supports — but it is only exposed in secure contexts (https, or
 * localhost). A plain-http LAN deployment would therefore have it undefined,
 * so there is a fallback. The fallback is NOT cryptographically strong and does
 * not need to be: these ids only distinguish workflow runs and steps within one
 * browser session; nothing authenticates or authorises on them.
 */

export function v4() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC-4122-shaped fallback built from getRandomValues where available.
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;   // version 4
    b[8] = (b[8] & 0x3f) | 0x80;   // variant 10x
    const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return 'wf-' + Date.now().toString(16) + '-' + Math.random().toString(16).slice(2, 10);
}

export default { v4 };
