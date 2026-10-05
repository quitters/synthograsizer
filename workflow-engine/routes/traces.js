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

/**
 * @param {{ resolve?: (req) => { ownerId?: string } }} [deps] — when given, every
 *   request is scoped to the owner it returns, so one visitor cannot list, read
 *   or delete another's traces. Without it all traces are visible (single user).
 */
export function createTraceRoutes({ resolve } = {}) {
  const router = Router();
  const ownerOf = (req) => (resolve ? resolve(req).ownerId : undefined);

  router.get('/', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      res.json(await traceStore.list(limit, ownerOf(req)));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const trace = await traceStore.get(req.params.id);
      const owner = ownerOf(req);
      if (!trace || (owner !== undefined && (trace.ownerId || null) !== owner)) {
        return res.status(404).json({ error: 'Trace not found' });
      }
      res.json(trace);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      if (!(await traceStore.canAccess(req.params.id, ownerOf(req)))) return res.json({ success: false });
      const ok = await traceStore.delete(req.params.id);
      res.json({ success: ok });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
