/**
 * Trace Routes
 * ────────────
 * Read API for the Agentic Trace Viewer. Traces are recorded passively by
 * the TraceStore as broadcast events flow through the orchestrator — these
 * routes expose them for live observation and post-hoc replay.
 *
 *   GET    /api/traces             — list recent runs (live + persisted)
 *   GET    /api/traces/:id         — full trace (steps, events, totals)
 *   DELETE /api/traces/:id         — purge a single trace
 *
 * Live updates still flow over the existing SSE channel — these endpoints
 * serve the bootstrap state and the replay-mode UX.
 */

import { Router } from 'express';
import { traceStore } from '../traceStore.js';

export function createTraceRoutes() {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      res.json(await traceStore.list(limit));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const trace = await traceStore.get(req.params.id);
      if (!trace) return res.status(404).json({ error: 'Trace not found' });
      res.json(trace);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const ok = await traceStore.delete(req.params.id);
      res.json({ success: ok });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
