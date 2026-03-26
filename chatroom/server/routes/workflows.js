/**
 * Workflow Library API Routes
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
import { workflowLibrary } from '../services/workflowLibrary.js';
import { workflowEngine } from '../services/workflowEngine.js';

const router = Router();

// ── Saved definitions ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    res.json(await workflowLibrary.list());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/checkpoints', async (req, res) => {
  try {
    res.json(await workflowLibrary.listCheckpoints());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/active', (req, res) => {
  try {
    res.json(workflowEngine.listActive());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/active/:id', (req, res) => {
  const status = workflowEngine.getStatus(req.params.id);
  if (!status) return res.status(404).json({ error: 'Workflow not found' });
  res.json(status);
});

router.post('/active/:id/cancel', (req, res) => {
  const ok = workflowEngine.cancel(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Workflow not found or not running' });
  res.json({ success: true });
});

router.post('/active/:id/retry', async (req, res) => {
  try {
    const id = await workflowEngine.retry(req.params.id, {
      broadcast: () => {}, // No SSE in REST response; engine broadcasts internally
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
    const id = await workflowEngine.resume(workflowId, { broadcast: () => {} });
    res.json({ workflowId: id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/checkpoints/:id', async (req, res) => {
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

export default router;
