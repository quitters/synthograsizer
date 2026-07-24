/**
 * workflowLibrary — BROWSER SHIM
 * ──────────────────────────────
 * Stands in for the Node module of the same name (workflow-engine/
 * workflowLibrary.js), which persists workflow checkpoints with fs/promises and
 * cannot run in a browser. Same module specifier, so the vendored
 * workflowEngine.js imports this without modification.
 *
 * The engine only ever uses three checkpoint methods (5 call sites):
 *   loadCheckpoint(id) · saveCheckpoint(id, state) · deleteCheckpoint(id)
 * so that is all this implements. The Node original additionally manages a
 * saved-workflow library on disk; nothing in the client-side path calls it.
 *
 * Backing store is localStorage, which turns out to be a feature rather than a
 * compromise: a client-side workflow would otherwise be lost when the tab
 * closes, and checkpoints let a run be resumed on the next visit — the property
 * the server-side engine had for free.
 *
 * Every method is failure-tolerant. Checkpointing is an optimisation, and
 * localStorage genuinely fails in the wild (private browsing, quota exhausted
 * by a large in-progress state). The engine already calls these with
 * .catch(() => {}), so throwing here would only add noise; a checkpoint that
 * cannot be written simply means the run is not resumable.
 */

const PREFIX = 'synthWorkflowCheckpoint:';
const INDEX_KEY = 'synthWorkflowCheckpointIndex';

function keyFor(workflowId) {
  return PREFIX + String(workflowId);
}

function readIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeIndex(ids) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(ids.slice(-50)));
  } catch (_) { /* non-fatal */ }
}

export const workflowLibrary = {
  async saveCheckpoint(workflowId, state) {
    try {
      localStorage.setItem(keyFor(workflowId), JSON.stringify({
        savedAt: new Date().toISOString(),
        state,
      }));
      const ids = readIndex().filter((id) => id !== workflowId);
      ids.push(workflowId);
      writeIndex(ids);
      return true;
    } catch (_) {
      // Most likely a quota error on a large state. Drop the oldest checkpoint
      // and give up rather than spamming; the run continues uncheckpointed.
      try {
        const ids = readIndex();
        if (ids.length) {
          localStorage.removeItem(keyFor(ids[0]));
          writeIndex(ids.slice(1));
        }
      } catch (__) { /* ignore */ }
      return false;
    }
  },

  async loadCheckpoint(workflowId) {
    try {
      const raw = localStorage.getItem(keyFor(workflowId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.state ? parsed.state : null;
    } catch (_) {
      return null;
    }
  },

  async deleteCheckpoint(workflowId) {
    try {
      localStorage.removeItem(keyFor(workflowId));
      writeIndex(readIndex().filter((id) => id !== workflowId));
      return true;
    } catch (_) {
      return false;
    }
  },

  /** Ids with a stored checkpoint, oldest first. Not used by the engine. */
  async listCheckpoints() {
    return readIndex();
  },
};

export default workflowLibrary;
