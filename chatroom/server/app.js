/**
 * The chat room's HTTP app: CORS, JSON, the per-visitor room, and every /api route.
 * Kept apart from index.js (which needs an API key, listens on a port and serves the
 * built client) so tests can run the real wiring.
 */
import express from 'express';
import cors from 'cors';

import agentsRouter from './routes/agents.js';
import chatRouter from './routes/chat.js';
import artifactsRouter from './routes/artifacts.js';
import { createWorkflowRoutes, createTraceRoutes } from 'workflow-engine';
import { roomMiddleware } from './middleware/session.js';

export function createApp() {
  const app = express();

  app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000'],
    credentials: true
  }));
  app.use(express.json({ limit: '100mb' })); // Large limit for media uploads (up to 14 files)

  // Every /api request belongs to one visitor's room (cookie-identified), so one
  // browser can no longer see or steer another's conversation, media or files.
  app.use('/api', roomMiddleware);

  // What the shared workflow engine needs to act for this request's visitor only.
  // traceStore.record is invoked from inside orchestrator.broadcast (the chokepoint),
  // so every workflow path -- route-triggered, agent-triggered, retry, resume -- is
  // observed, and tagged with its room's id, without per-call-site wrapping.
  const resolveRoom = (req) => ({
    broadcast: (event, data) => req.room.orchestrator.broadcast(event, data),
    mediaStore: req.room.mediaStore,
    ownerId: req.room.id,
  });

  app.use('/api/agents', agentsRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/workflows', createWorkflowRoutes({ resolve: resolveRoom }));
  app.use('/api/traces', createTraceRoutes({ resolve: resolveRoom }));
  app.use('/api/artifacts', artifactsRouter);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}
