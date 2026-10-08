/**
 * The chat room's HTTP app: CORS, JSON, the per-visitor room, and every /api route.
 * Kept apart from index.js (which needs an API key, listens on a port and serves the
 * built client) so tests can run the real wiring.
 */
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import agentsRouter from './routes/agents.js';
import chatRouter from './routes/chat.js';
import savedRouter from './routes/savedSessions.js';
import artifactsRouter from './routes/artifacts.js';
import { createCompanyRouter } from './routes/company.js';
import { createWorkflowRoutes, createTraceRoutes, synthClient } from 'workflow-engine';
import { createRoomMiddleware } from './middleware/session.js';
import { registerRoomInitializer } from './services/sessionRegistry.js';
import { createCompanyServices } from './company/index.js';
import { isPolicyError } from './company/errors.js';

/**
 * @param {{ company?: ReturnType<typeof createCompanyServices> }} [options]
 *   company is the safety layer's services (the store of companies, the screen, the publish queue). Tests pass their own, built
 *   against a temp folder and a stand-in screen.
 */
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

/**
 * The owner's console is plain files, and it shows text that models and other people wrote. So the page is sent with a policy that lets no script run but
 * its own file, no style but its own sheet, and nothing be framed, embedded or sent anywhere but back to this server.
 */
export const CONSOLE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Whether the Synthograsizer backend, which draws for the chat server, answers. */
const pictureServiceAnswers = async () => (await synthClient.healthCheck())?.status === 'ok';

export function createApp({ company = createCompanyServices({ checkRenderer: pictureServiceAnswers }) } = {}) {
  const app = express();
  app.locals.company = company;

  app.use('/company', (req, res, next) => {
    res.setHeader('Content-Security-Policy', CONSOLE_CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-cache');
    next();
  }, express.static(path.join(PUBLIC_DIR, 'company'), { index: 'index.html', dotfiles: 'deny', redirect: true }));

  app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000'],
    credentials: true
  }));
  app.use(express.json({ limit: '100mb' })); // Large limit for media uploads (up to 14 files)

  // A company's department rooms take their company's policy the moment they are created
  registerRoomInitializer(company.attach);

  // Every /api request belongs to one visitor's room (cookie-identified), so one
  // browser can no longer see or steer another's conversation, media or files.
  // A visitor's own company rooms are reachable too, by id, and only by their owner.
  app.use('/api', createRoomMiddleware({ roomOwner: (id) => company.store.roomOwner(id) }));

  // What the shared workflow engine needs to act for this request's visitor only.
  // traceStore.record is invoked from inside orchestrator.broadcast (the chokepoint),
  // so every workflow path -- route-triggered, agent-triggered, retry, resume -- is
  // observed, and tagged with its room's id, without per-call-site wrapping.
  const resolveRoom = (req) => ({
    broadcast: (event, data) => req.room.orchestrator.broadcast(event, data),
    mediaStore: req.room.mediaStore,
    ownerId: req.room.id,
  });

  app.use('/api/company', createCompanyRouter(company));
  app.use('/api/agents', agentsRouter);
  app.use('/api/chat', savedRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/workflows', createWorkflowRoutes({ resolve: resolveRoom }));
  app.use('/api/traces', createTraceRoutes({ resolve: resolveRoom }));
  app.use('/api/artifacts', artifactsRouter);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // A refusal from the safety layer thrown by any route above is an answer, not a crash
  app.use((err, req, res, next) => {
    if (isPolicyError(err)) {
      return res.status(err.status).json({ error: err.message, code: err.code, ...(err.field ? { field: err.field } : {}) });
    }
    return next(err);
  });

  return app;
}
