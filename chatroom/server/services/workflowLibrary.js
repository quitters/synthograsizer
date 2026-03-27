/**
 * Workflow Library
 * ─────────────────
 * Persists named workflow definitions to disk as JSON files.
 * Lives at chatroom/data/workflows/*.json
 *
 * Also handles workflow run checkpoints (completed step results)
 * so workflows can be resumed after failure or server restart.
 * Checkpoints live at chatroom/data/workflows/checkpoints/*.json
 *
 * Singleton export `workflowLibrary`.
 */

import { readdir, readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIBRARY_DIR  = join(__dirname, '../../data/workflows');
const CHECKPOINT_DIR = join(LIBRARY_DIR, 'checkpoints');

async function ensureDirs() {
  await mkdir(LIBRARY_DIR,    { recursive: true });
  await mkdir(CHECKPOINT_DIR, { recursive: true });
}

// ─── WorkflowLibrary class ────────────────────────────────────────────────────

class WorkflowLibrary {
  constructor() {
    this._ready = ensureDirs().catch(err =>
      console.error('[WorkflowLibrary] Failed to create data dirs:', err)
    );
  }

  async _wait() { await this._ready; }

  // ── Saved definitions ──────────────────────────────────────────────────────

  /**
   * List all saved workflow definitions (metadata only).
   * @returns {Promise<Array<{id, name, description, stepCount, savedAt}>>}
   */
  async list() {
    await this._wait();
    let files;
    try { files = await readdir(LIBRARY_DIR); }
    catch { return []; }

    const results = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(LIBRARY_DIR, file), 'utf8');
        const entry = JSON.parse(raw);
        results.push({
          id:        entry.id,
          name:      entry.name || 'Unnamed',
          description: entry.description || '',
          stepCount: entry.definition?.steps?.length ?? 0,
          savedAt:   entry.savedAt,
          tags:      entry.tags || [],
        });
      } catch { /* skip corrupt files */ }
    }

    return results.sort((a, b) => b.savedAt?.localeCompare(a.savedAt ?? '') ?? 0);
  }

  /**
   * Get a full saved definition by id.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async get(id) {
    await this._wait();
    try {
      const raw = await readFile(join(LIBRARY_DIR, `${id}.json`), 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Save a workflow definition to disk.
   * @param {object} definition  — full workflow definition {name, steps}
   * @param {object} [meta]      — { description?, tags? }
   * @returns {Promise<string>}  saved id
   */
  async save(definition, meta = {}) {
    await this._wait();
    const id = uuidv4();
    const entry = {
      id,
      name:        definition.name || meta.name || 'Unnamed Workflow',
      description: meta.description || '',
      tags:        meta.tags || [],
      definition,
      savedAt:     new Date().toISOString(),
    };
    await writeFile(join(LIBRARY_DIR, `${id}.json`), JSON.stringify(entry, null, 2), 'utf8');
    return id;
  }

  /**
   * Update metadata (name, description, tags) of a saved workflow.
   * @param {string} id
   * @param {object} meta
   * @returns {Promise<boolean>}
   */
  async update(id, meta) {
    await this._wait();
    const entry = await this.get(id);
    if (!entry) return false;
    Object.assign(entry, {
      name:        meta.name        ?? entry.name,
      description: meta.description ?? entry.description,
      tags:        meta.tags        ?? entry.tags,
      updatedAt:   new Date().toISOString(),
    });
    await writeFile(join(LIBRARY_DIR, `${id}.json`), JSON.stringify(entry, null, 2), 'utf8');
    return true;
  }

  /**
   * Delete a saved workflow definition.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    await this._wait();
    try {
      await unlink(join(LIBRARY_DIR, `${id}.json`));
      return true;
    } catch {
      return false;
    }
  }

  // ── Run checkpoints ───────────────────────────────────────────────────────

  /**
   * Save a workflow run checkpoint (completed step results, no binary blobs).
   * Called automatically by WorkflowEngine after each successful step.
   * @param {string} workflowId
   * @param {object} state  — { id, name, steps, results (Map) }
   */
  async saveCheckpoint(workflowId, state) {
    await this._wait();
    try {
      // Serialise results Map, stripping large binary fields
      const stepResults = {};
      for (const [stepId, result] of state.results.entries()) {
        stepResults[stepId] = Object.fromEntries(
          Object.entries(result).filter(([, v]) =>
            typeof v !== 'string' || v.length < 2000
          )
        );
      }

      const checkpoint = {
        workflowId,
        name:           state.name,
        workflowDef:    { name: state.name, steps: state.steps.map(s => ({
          id: s.id, type: s.type, params: s.params, dependsOn: s.dependsOn,
        }))},
        completedSteps: state.steps.filter(s => s.status === 'complete').map(s => s.id),
        failedSteps:    state.steps.filter(s => s.status === 'failed').map(s => ({
          id: s.id, error: s.error,
        })),
        stepResults,
        savedAt:        new Date().toISOString(),
      };

      await writeFile(
        join(CHECKPOINT_DIR, `${workflowId}.json`),
        JSON.stringify(checkpoint, null, 2),
        'utf8'
      );
    } catch (err) {
      console.error('[WorkflowLibrary] Failed to save checkpoint:', err.message);
    }
  }

  /**
   * Load a workflow run checkpoint.
   * @param {string} workflowId
   * @returns {Promise<object|null>}
   */
  async loadCheckpoint(workflowId) {
    await this._wait();
    try {
      const raw = await readFile(join(CHECKPOINT_DIR, `${workflowId}.json`), 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Delete a checkpoint after a workflow completes successfully.
   * @param {string} workflowId
   */
  async deleteCheckpoint(workflowId) {
    await this._wait();
    try {
      await unlink(join(CHECKPOINT_DIR, `${workflowId}.json`));
    } catch { /* already gone */ }
  }

  /**
   * List all available checkpoints (resumable workflows).
   * @returns {Promise<Array<{workflowId, name, completedSteps, failedSteps, savedAt}>>}
   */
  async listCheckpoints() {
    await this._wait();
    let files;
    try { files = await readdir(CHECKPOINT_DIR); }
    catch { return []; }

    const results = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(CHECKPOINT_DIR, file), 'utf8');
        const cp  = JSON.parse(raw);
        results.push({
          workflowId:     cp.workflowId,
          name:           cp.name,
          completedSteps: cp.completedSteps?.length ?? 0,
          failedSteps:    cp.failedSteps?.length ?? 0,
          savedAt:        cp.savedAt,
        });
      } catch { /* skip */ }
    }

    return results.sort((a, b) => b.savedAt?.localeCompare(a.savedAt ?? '') ?? 0);
  }
}

export const workflowLibrary = new WorkflowLibrary();
