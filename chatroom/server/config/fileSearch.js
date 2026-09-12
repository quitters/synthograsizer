/**
 * File Search (RAG) configuration.
 * ────────────────────────────────
 * Phase 4 of MODERNIZATION_PLAN.md §4.1.
 *
 * Without it, an uploaded reference file reaches the model one of two bad
 * ways: a PDF is base64-inlined as a document block on the first two turns
 * and then never again, and a text file is truncated at 5,000 characters and
 * pasted into the prompt. Either way the payload rides along every turn it
 * appears in, and anything past the cutoff is simply lost.
 *
 * With it, the file is uploaded and indexed ONCE and turns carry only the
 * chunks a query actually retrieves, with citations.
 *
 * Off by default: indexing costs embedding tokens, and a store is remote
 * state with a project-wide quota behind it (1 GB free, 10 GB tier 1).
 */

export const FILE_SEARCH_ENABLED = process.env.FILE_SEARCH === 'true';

export const isFileSearchEnabled = () => FILE_SEARCH_ENABLED;

/**
 * Cross-session memory.
 * ─────────────────────
 * When on, a finished session's transcript is archived into ONE long-lived
 * store, and agents in later sessions can search it. Rooms stop being
 * amnesiac: "what did we decide about the palette last time" becomes a
 * question with an answer.
 *
 * This changes what a "session" means, which is why it is its own flag
 * rather than riding on FILE_SEARCH. It also accumulates indefinitely — see
 * the memory routes for inspecting and clearing it.
 *
 * Requires FILE_SEARCH=true; the memory store uses the same machinery.
 */
export const CROSS_SESSION_MEMORY = process.env.CROSS_SESSION_MEMORY === 'true';

export const isCrossSessionMemoryEnabled = () =>
  FILE_SEARCH_ENABLED && CROSS_SESSION_MEMORY;

/** Minimum messages before a session is worth remembering. */
export const MIN_MESSAGES_TO_ARCHIVE = 4;

/**
 * Embedding model used to index a store. Fixed at creation time — changing it
 * later means rebuilding the store, so it is pinned here rather than derived.
 */
export const EMBEDDING_MODEL = 'models/gemini-embedding-2';

/** Chunks to retrieve per query. Higher means more context and more tokens. */
export const FILE_SEARCH_TOP_K = 5;

/**
 * Chunking. Small chunks with a little overlap retrieve precisely; large ones
 * preserve more surrounding context per hit. These are the documented
 * defaults' neighbourhood and a reasonable starting point for mixed prose.
 */
export const CHUNK_CONFIG = {
  whiteSpaceConfig: {
    maxTokensPerChunk: 400,
    maxOverlapTokens: 40,
  },
};

/** How long to wait for an upload's indexing operation before giving up. */
export const INDEX_TIMEOUT_MS = 120_000;
export const INDEX_POLL_INTERVAL_MS = 2_000;

/**
 * Which uploads go to File Search rather than riding inline.
 *
 * Images deliberately stay inline: an agent asked to critique a reference
 * image needs to SEE it, and File Search would hand back retrieved text about
 * it instead. The existing includeMedia heuristic already caps images to the
 * opening turns. Everything else — PDFs and text-ish formats — is exactly
 * what was being truncated or dropped, so that is what moves.
 */
export function shouldIndex(mimeType) {
  if (!mimeType) return false;
  if (mimeType.startsWith('image/')) return false;
  if (mimeType.startsWith('video/')) return false;
  if (mimeType.startsWith('audio/')) return false;
  return (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/javascript' ||
    mimeType.includes('officedocument') ||
    mimeType === 'application/msword'
  );
}
