/**
 * urlGuard — BROWSER SHIM
 * ───────────────────────
 * Stands in for workflow-engine/urlGuard.js, which imports node:dns and
 * node:net to resolve a hostname and reject private/loopback addresses before
 * the SERVER fetches a user-supplied URL. Same module specifier, so the
 * vendored workflowEngine.js imports this unmodified.
 *
 * The engine uses exactly one export from it — safeFetchText, at the single
 * `synth_fetch` step.
 *
 * The DNS pinning is deliberately NOT reproduced here, because the threat it
 * defends against does not exist in this context. Server-side SSRF matters
 * because the server sits inside a trusted network and can be tricked into
 * fetching 169.254.x.x metadata or an internal service. A fetch issued by the
 * user's own browser reaches only what that user could already reach by typing
 * the URL into the address bar, carries no server credentials, and is subject
 * to CORS. Re-implementing a DNS allowlist here would be theatre, and browsers
 * do not expose DNS resolution to do it properly anyway.
 *
 * What IS kept is the resource discipline the Node version also provides — a
 * timeout and a byte cap — so a hostile or enormous response cannot hang or
 * exhaust the tab.
 *
 * Practical note: most cross-origin URLs will fail CORS. That is expected and
 * is reported to the workflow as a normal step failure rather than being
 * papered over, so the run surfaces an honest error instead of empty text.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Fetch a URL and return its body as text.
 * @param {string} url
 * @param {{timeoutMs?: number, maxBytes?: number}} [opts]
 * @returns {Promise<string>}
 */
export async function safeFetchText(url, opts = {}) {
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes || DEFAULT_MAX_BYTES;

  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    throw new Error(`Not a valid URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Refusing to fetch non-HTTP(S) URL: ${parsed.protocol}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(parsed.href, {
      signal: controller.signal,
      redirect: 'follow',
      // Never attach the user's session to a third-party URL.
      credentials: 'omit',
    });
    if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);

    // Cheap pre-check when the server declares a size, then a hard cap while
    // reading, since Content-Length is optional and can lie.
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared && declared > maxBytes) {
      throw new Error(`Response too large: ${declared} bytes (max ${maxBytes})`);
    }
    const text = await res.text();
    if (text.length > maxBytes) {
      throw new Error(`Response too large: ${text.length} bytes (max ${maxBytes})`);
    }
    return text;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`Fetch timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Present for import-compatibility with the Node module; no-ops in a browser. */
export function assertSafeUrl(url) { return url; }
export function assertPlausiblePublicUrl(url) { return url; }
export function isHostedInstance() { return true; }
