/**
 * Workflow Library API Routes (factory export)
 * ────────────────────────────
 * Saved definitions:
 *   GET    /api/workflows              — list saved workflow definitions
 *   GET    /api/workflows/:id          — get a saved definition
 *   POST   /api/workflows              — save a definition { definition, meta? }
 *   PATCH  /api/workflows/:id          — update name/description/tags
 *   DELETE /api/workflows/:id          — delete a definition
 *
 * Checkpoints (resumable runs):
 *   GET    /api/workflows/checkpoints  — list resumable workflow checkpoints
 *   DELETE /api/workflows/checkpoints/:id — delete a checkpoint
 *
 * Active runs (in-memory WorkflowEngine):
 *   GET    /api/workflows/active       — list all in-memory workflow statuses
 *   GET    /api/workflows/active/:id   — get status of a specific run
 *   POST   /api/workflows/active/:id/cancel — cancel a running workflow
 *   POST   /api/workflows/active/:id/retry  — retry failed steps in place
 *   POST   /api/workflows/resume       — resume from checkpoint { workflowId }
 */

import { Router } from 'express';
import { workflowLibrary } from '../workflowLibrary.js';
import { workflowEngine } from '../workflowEngine.js';
import { listTemplates, buildWorkflow } from '../workflowTemplates.js';
import { stylePresets } from '../stylePresets.js';

/**
 * Create workflow routes with injected broadcast function.
 *
 * With `resolve`, each request is scoped to one owner: the host returns that
 * owner's broadcast function, media store and id, and the routes then only list,
 * read, cancel, retry, resume and delete runs and checkpoints that owner made.
 * Without it every caller sees everything (a single-user install). The saved
 * workflow library is shared either way.
 *
 * @param {{ broadcast?: Function,
 *           resolve?: (req) => { broadcast?: Function, mediaStore?: object, ownerId?: string } }} deps
 *   broadcast(event, data) pushes an SSE event
 * @returns {Router}
 */
export function createWorkflowRoutes({ broadcast, resolve } = {}) {
  const router = Router();

  /** What this request may touch: { broadcast, mediaStore, ownerId } (ownerId undefined = unscoped). */
  function scope(req) {
    const r = resolve ? resolve(req) : {};
    return { broadcast: r.broadcast || broadcast, mediaStore: r.mediaStore, ownerId: r.ownerId };
  }

  // ── Saved definitions ───────────────────────────────────────────────────────

  router.get('/', async (req, res) => {
    try {
      res.json(await workflowLibrary.list());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/checkpoints', async (req, res) => {
    try {
      res.json(await workflowLibrary.listCheckpoints(scope(req).ownerId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/templates', (req, res) => {
    res.json(listTemplates());
  });

  router.get('/presets', (req, res) => {
    res.json(stylePresets.map(({ id, name, category }) => ({ id, name, category })));
  });

  router.get('/active', (req, res) => {
    try {
      res.json(workflowEngine.listActive(scope(req).ownerId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/active/:id', (req, res) => {
    const { ownerId } = scope(req);
    const status = workflowEngine.getStatus(req.params.id);
    if (!status || (ownerId !== undefined && status.ownerId !== ownerId)) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    res.json(status);
  });

  router.post('/active/:id/cancel', (req, res) => {
    const ok = workflowEngine.cancel(req.params.id, scope(req).ownerId);
    if (!ok) return res.status(404).json({ error: 'Workflow not found or not running' });
    res.json({ success: true });
  });

  // Run a workflow definition directly (from library UI or external caller)
  router.post('/run', async (req, res) => {
    const { definition, savedId, templateId, params } = req.body || {};

    let wfDef = definition;

    // Allow running a saved workflow by id
    if (!wfDef && savedId) {
      const entry = await workflowLibrary.get(savedId);
      if (!entry) return res.status(404).json({ error: 'Saved workflow not found' });
      wfDef = entry.definition;
    }

    // Allow running a built-in template by id
    if (!wfDef && templateId) {
      try {
        wfDef = buildWorkflow(templateId, params || {});
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    if (!wfDef || !Array.isArray(wfDef.steps)) {
      return res.status(400).json({ error: 'definition.steps array required' });
    }

    try {
      const mine = scope(req);
      const workflowId = workflowEngine.submit(wfDef, {
        broadcast: mine.broadcast, mediaStore: mine.mediaStore, ownerId: mine.ownerId,
      });

      // Notify all SSE clients
      mine.broadcast('workflow_submitted', {
        workflowId,
        workflowName: wfDef.name || 'Unnamed Workflow',
        stepCount: wfDef.steps.length,
        steps: wfDef.steps.map(s => ({ id: s.id, type: s.type })),
        source: 'library',
      });

      res.status(201).json({ workflowId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/active/:id/retry', async (req, res) => {
    try {
      const mine = scope(req);
      const id = await workflowEngine.retry(req.params.id, {
        broadcast: mine.broadcast, mediaStore: mine.mediaStore, ownerId: mine.ownerId,
      });
      res.json({ workflowId: id });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/resume', async (req, res) => {
    const { workflowId } = req.body || {};
    if (!workflowId) return res.status(400).json({ error: 'workflowId required' });

    try {
      const mine = scope(req);
      const id = await workflowEngine.resume(workflowId, {
        broadcast: mine.broadcast, mediaStore: mine.mediaStore, ownerId: mine.ownerId,
      });
      res.json({ workflowId: id });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/checkpoints/:id', async (req, res) => {
    const { ownerId } = scope(req);
    if (ownerId !== undefined) {
      const cp = await workflowLibrary.loadCheckpoint(req.params.id);
      if (!cp || (cp.ownerId ?? null) !== ownerId) return res.json({ success: false });
    }
    await workflowLibrary.deleteCheckpoint(req.params.id);
    res.json({ success: true });
  });

  router.get('/:id', async (req, res) => {
    const entry = await workflowLibrary.get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Workflow not found' });
    res.json(entry);
  });

  router.post('/', async (req, res) => {
    const { definition, meta } = req.body || {};
    if (!definition || !Array.isArray(definition.steps)) {
      return res.status(400).json({ error: 'definition.steps array required' });
    }
    try {
      const id = await workflowLibrary.save(definition, meta);
      res.status(201).json({ id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/:id', async (req, res) => {
    const ok = await workflowLibrary.update(req.params.id, req.body || {});
    if (!ok) return res.status(404).json({ error: 'Workflow not found' });
    res.json({ success: true });
  });

  router.delete('/:id', async (req, res) => {
    const ok = await workflowLibrary.delete(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Workflow not found' });
    res.json({ success: true });
  });

  return router;
}
