/**
 * File Search store management.
 * ─────────────────────────────
 * One store per chat session. Uploaded reference documents are indexed into
 * it once, and agent turns declare a `file_search` tool over it instead of
 * carrying the file contents in the prompt.
 *
 * Stores are remote state against a project-wide quota, so the lifecycle
 * matters as much as the indexing: `destroySessionStore` is called from
 * orchestrator reset/start, and a store left behind by a crash is findable
 * via `listOrphanedStores` because every name this module creates is
 * prefixed with STORE_PREFIX.
 */
import { GoogleGenAI } from '@google/genai';
import {
  EMBEDDING_MODEL,
  CHUNK_CONFIG,
  FILE_SEARCH_TOP_K,
  INDEX_TIMEOUT_MS,
  INDEX_POLL_INTERVAL_MS,
} from '../config/fileSearch.js';

/** Every store this module creates is named so it can be found again. */
export const STORE_PREFIX = 'chatroom-session-';

let genAI = null;

/**
 * @param {string} apiKey
 * @param {object} [client] Pre-built client, used by tests.
 */
export function initializeFileSearch(apiKey, client = null) {
  genAI = client || new GoogleGenAI({ apiKey });
}

/**
 * Create a store for one session.
 * @returns {Promise<string|null>} the store's resource name, or null on failure
 */
export async function createSessionStore(sessionId) {
  if (!genAI) throw new Error('File search not initialized');
  const store = await genAI.fileSearchStores.create({
    config: {
      displayName: `${STORE_PREFIX}${sessionId}`,
      embeddingModel: EMBEDDING_MODEL,
    },
  });
  console.log(`[fileSearch] created store ${store.name}`);
  return store.name;
}

/**
 * Index one in-memory media item into a store.
 *
 * The chat room holds uploads as base64 in memory, and the SDK accepts a Blob
 * directly, so nothing needs to touch the filesystem on the way through.
 *
 * Indexing is a long-running operation; this waits for it, because an agent
 * querying a half-indexed store silently gets nothing back.
 *
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function indexMedia(storeName, media) {
  if (!genAI) throw new Error('File search not initialized');
  if (!storeName || !media?.data) return { ok: false, error: 'missing store or data' };

  try {
    const bytes = Buffer.from(media.data, 'base64');
    const blob = new Blob([bytes], { type: media.mimeType });

    let operation = await genAI.fileSearchStores.uploadToFileSearchStore({
      file: blob,
      fileSearchStoreName: storeName,
      config: {
        displayName: media.name || media.id,
        mimeType: media.mimeType,
        chunkingConfig: CHUNK_CONFIG,
      },
    });

    const deadline = Date.now() + INDEX_TIMEOUT_MS;
    while (!operation.done) {
      if (Date.now() > deadline) {
        return { ok: false, error: `indexing timed out after ${INDEX_TIMEOUT_MS}ms` };
      }
      await new Promise(r => setTimeout(r, INDEX_POLL_INTERVAL_MS));
      operation = await genAI.operations.get({ operation });
    }

    if (operation.error) {
      return { ok: false, error: operation.error.message || 'indexing failed' };
    }
    console.log(`[fileSearch] indexed "${media.name}" into ${storeName}`);
    return { ok: true };
  } catch (err) {
    console.error(`[fileSearch] failed to index "${media.name}": ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * Delete a session's store and everything in it. Best-effort: a failure here
 * must not block a reset, but it does leave quota consumed, so it is logged
 * loudly rather than swallowed.
 */
export async function destroySessionStore(storeName) {
  if (!genAI || !storeName) return { ok: true };
  try {
    await genAI.fileSearchStores.delete({ name: storeName, config: { force: true } });
    console.log(`[fileSearch] deleted store ${storeName}`);
    return { ok: true };
  } catch (err) {
    console.warn(
      `[fileSearch] could not delete ${storeName}: ${err.message} — ` +
      'it still counts against the project quota; see listOrphanedStores()'
    );
    return { ok: false, error: err.message };
  }
}

/**
 * Every store this module has ever created that still exists. A crash between
 * create and destroy leaks one, and the quota is project-wide, so there has
 * to be a way to find them.
 */
export async function listOrphanedStores() {
  if (!genAI) throw new Error('File search not initialized');
  const found = [];
  // page_size must be between 1 and 20 — the API rejects anything larger.
  // The pager handles continuation, so this is a page size, not a cap.
  const pager = await genAI.fileSearchStores.list({ config: { pageSize: 20 } });
  for await (const store of pager) {
    if (store.displayName?.startsWith(STORE_PREFIX)) {
      found.push({ name: store.name, displayName: store.displayName });
    }
  }
  return found;
}

/** The tool declaration an agent turn uses to query a store. */
export function fileSearchTool(storeName, topK = FILE_SEARCH_TOP_K) {
  return {
    type: 'file_search',
    file_search_store_names: [storeName],
    top_k: topK,
  };
}
