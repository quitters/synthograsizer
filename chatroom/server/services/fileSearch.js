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

/**
 * The tool declaration an agent turn uses to query stores.
 *
 * Takes a list because a turn may search both this session's uploads and the
 * long-term memory of previous sessions, and one tool over two stores beats
 * two tools competing for the model's attention.
 */
export function fileSearchTool(storeNames, topK = FILE_SEARCH_TOP_K) {
  const names = Array.isArray(storeNames) ? storeNames.filter(Boolean) : [storeNames];
  return {
    type: 'file_search',
    file_search_store_names: names,
    top_k: topK,
  };
}

// ─────────────────────────── cross-session memory ───────────────────────────

/** The one long-lived store. Distinct prefix so the orphan sweeper skips it. */
export const MEMORY_STORE_NAME = 'chatroom-longterm-memory';

let memoryStoreCache = null;

/**
 * Find the long-term memory store, creating it on first use.
 *
 * Looked up by display name rather than persisted locally, so the store
 * survives a server restart, a fresh clone, or a wiped data directory —
 * memory that vanishes when the process does is not memory.
 */
export async function getOrCreateMemoryStore() {
  if (!genAI) throw new Error('File search not initialized');
  if (memoryStoreCache) return memoryStoreCache;

  const pager = await genAI.fileSearchStores.list({ config: { pageSize: 20 } });
  for await (const store of pager) {
    if (store.displayName === MEMORY_STORE_NAME) {
      memoryStoreCache = store.name;
      return memoryStoreCache;
    }
  }

  const created = await genAI.fileSearchStores.create({
    config: { displayName: MEMORY_STORE_NAME, embeddingModel: EMBEDDING_MODEL },
  });
  memoryStoreCache = created.name;
  console.log(`[fileSearch] created long-term memory store ${created.name}`);
  return memoryStoreCache;
}

/** Forget the cached handle (after deleting the store). */
export function clearMemoryStoreCache() {
  memoryStoreCache = null;
}

/**
 * Render a finished session as a document for the memory store.
 *
 * Plain prose with a header, not JSON: this gets chunked and embedded, and
 * retrieval works far better over readable text than over serialised objects.
 */
export function formatSessionForMemory({ sessionId, goal, agents, messages, endedAt }) {
  const date = (endedAt || new Date().toISOString()).slice(0, 10);
  const lines = [
    `# Chat room session — ${date}`,
    ``,
    `Goal: ${goal || '(none stated)'}`,
    `Participants: ${(agents || []).map(a => a.name).join(', ') || '(unknown)'}`,
    `Session id: ${sessionId || '(unknown)'}`,
    ``,
    `## Transcript`,
    ``,
  ];
  for (const m of messages || []) {
    const text = (m.content || '').trim();
    if (!text) continue;
    lines.push(`**${m.agentName || 'Unknown'}:** ${text}`, ``);
  }
  return lines.join('\n');
}

/**
 * Archive a finished session into long-term memory.
 * @returns {Promise<{ok: boolean, error?: string, storeName?: string}>}
 */
export async function archiveSession(session) {
  if (!genAI) return { ok: false, error: 'file search not initialized' };
  try {
    const storeName = await getOrCreateMemoryStore();
    const text = formatSessionForMemory(session);
    const date = (session.endedAt || new Date().toISOString()).slice(0, 10);

    const result = await indexMedia(storeName, {
      id: session.sessionId,
      name: `session-${date}-${String(session.sessionId || '').slice(0, 8)}.md`,
      mimeType: 'text/markdown',
      data: Buffer.from(text, 'utf-8').toString('base64'),
    });
    if (!result.ok) return { ok: false, error: result.error };

    console.log(`[fileSearch] archived session ${session.sessionId} to long-term memory`);
    return { ok: true, storeName };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** What is currently remembered. */
export async function listMemoryDocuments() {
  if (!genAI) throw new Error('File search not initialized');
  const storeName = await getOrCreateMemoryStore();
  const docs = [];
  const pager = await genAI.fileSearchStores.documents.list({
    parent: storeName, config: { pageSize: 20 },
  });
  for await (const doc of pager) {
    docs.push({ name: doc.name, displayName: doc.displayName });
  }
  return { storeName, documents: docs };
}

/** Delete the whole memory store. Irreversible — the room forgets everything. */
export async function forgetAllMemory() {
  if (!genAI) throw new Error('File search not initialized');
  const storeName = await getOrCreateMemoryStore();
  const result = await destroySessionStore(storeName);
  clearMemoryStoreCache();
  return result;
}
