/**
 * urlGuard — SSRF protection for server-side fetches of model/user-supplied URLs.
 *
 * Used by the workflow engine's `synth_fetch` step (the one place this Node
 * process fetches an arbitrary URL itself) and exported for any future tool
 * that does the same. ChatRoom's ANALYZE_URL passes URLs to Gemini's
 * urlContext tool (Google fetches, not us) — that path only needs the cheap
 * `assertPlausiblePublicUrl` scheme/literal check, not DNS resolution.
 *
 * What `safeFetchText` defends against:
 *  - http(s)-only (no file:, ftp:, gopher:…)
 *  - private/loopback/link-local/metadata targets: hostname is resolved and
 *    EVERY address must be public (cloud metadata 169.254.169.254 is
 *    link-local and rejected by the same rule)
 *  - redirect smuggling: redirects are followed manually and each hop is
 *    re-validated against the same rules
 *  - oversized responses: body reads stop at `maxBytes`
 *  - hangs: overall timeout via AbortController
 *
 * Known limitation (accepted for v1, documented in the compliance roadmap):
 * classic DNS-rebinding (resolve→public, connect→private on the second
 * lookup) isn't fully closed without a custom connection agent; the
 * resolve-and-validate + manual-redirect approach covers the practical
 * attack surface for a tool of this size.
 *
 * Local-dev affordance: loopback targets are allowed when the instance is
 * NOT hosted (SYNTH_HOSTED/VERCEL unset) — a solo operator pointing a
 * workflow at their own localhost service is legitimate.
 */

import dns from 'node:dns/promises';
import net from 'node:net';

export function isHostedInstance() {
  return process.env.SYNTH_HOSTED === '1' || !!process.env.VERCEL;
}

const MAX_REDIRECTS = 4;

function isPrivateAddress(addr) {
  // net.isIP→ 4 | 6 ; use ipaddr-style checks without a dependency.
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split('.').map(Number);
    if (a === 127) return true;                    // loopback
    if (a === 10) return true;                     // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;       // link-local incl. cloud metadata
    if (a === 0) return true;
    return false;
  }
  const lower = addr.toLowerCase();
  if (lower === '::1' || lower === '::') return true;             // loopback/unspecified
  if (lower.startsWith('fe80:')) return true;                      // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7)); // v4-mapped
  return false;
}

function isLoopbackName(hostname) {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
}

/**
 * Cheap pre-flight for URLs that a THIRD PARTY will fetch (e.g. Gemini's
 * urlContext): scheme check + obvious private-literal rejection. No DNS.
 * Throws with a user-readable message.
 */
export function assertPlausiblePublicUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error(`Invalid URL: ${rawUrl}`); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Only http(s) URLs are allowed (got ${url.protocol})`);
  }
  const host = url.hostname;
  if (isLoopbackName(host) || (net.isIP(host) && isPrivateAddress(host))) {
    throw new Error(`URL targets a private/loopback address: ${host}`);
  }
  return url;
}

/**
 * Full validation for URLs THIS process will fetch: scheme + DNS resolution
 * with every resolved address required to be public. Loopback is permitted
 * only when { allowLoopback } (local-dev, non-hosted).
 */
export async function assertSafeUrl(rawUrl, { allowLoopback = false } = {}) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error(`Invalid URL: ${rawUrl}`); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Only http(s) URLs are allowed (got ${url.protocol})`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  if (isLoopbackName(host)) {
    if (allowLoopback) return url;
    throw new Error('Fetching loopback URLs is not allowed on a hosted instance.');
  }

  if (net.isIP(host)) {
    if (isPrivateAddress(host)) {
      if (allowLoopback && (host.startsWith('127.') || host === '::1')) return url;
      throw new Error(`Fetching private/internal addresses is not allowed: ${host}`);
    }
    return url;
  }

  let records;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch (e) {
    throw new Error(`Could not resolve ${host}: ${e.code || e.message}`);
  }
  for (const rec of records) {
    if (isPrivateAddress(rec.address)) {
      if (allowLoopback && (rec.address.startsWith('127.') || rec.address === '::1')) continue;
      throw new Error(
        `Refusing to fetch ${host} — it resolves to private address ${rec.address}`
      );
    }
  }
  return url;
}

/**
 * Guarded text fetch: validates the URL (and every redirect hop), enforces
 * a byte cap and a timeout. Returns the body as a string.
 */
export async function safeFetchText(rawUrl, {
  timeoutMs = 10_000,
  maxBytes = 2 * 1024 * 1024,
  headers = {},
} = {}) {
  const allowLoopback = !isHostedInstance();
  let url = await assertSafeUrl(rawUrl, { allowLoopback });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual', // each hop re-validated — no redirect smuggling
        headers: { 'User-Agent': 'Synthograsizer-WorkflowEngine/1.0', ...headers },
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw new Error(`Redirect (${res.status}) without Location from ${url}`);
        url = await assertSafeUrl(new URL(loc, url).href, { allowLoopback });
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

      // Stream with a byte cap — don't trust Content-Length.
      const reader = res.body?.getReader();
      if (!reader) return await res.text();
      const chunks = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          reader.cancel().catch(() => {});
          throw new Error(`Response exceeds ${Math.round(maxBytes / 1024 / 1024)} MB cap: ${url}`);
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf-8');
    }
    throw new Error(`Too many redirects (>${MAX_REDIRECTS}) from ${rawUrl}`);
  } finally {
    clearTimeout(timer);
  }
}
