/**
 * Saved sessions and session files.
 *
 *   GET    /api/chat/saved                  what is saved for this room (and whether saving is on)
 *   GET    /api/chat/saved/:id/download     one saved session as a file the Agent Studio's export button also writes
 *   POST   /api/chat/saved/:id/reopen       put a saved session back in the room, ready to carry on
 *   DELETE /api/chat/saved/:id              delete one;  DELETE /api/chat/saved  deletes them all
 *   POST   /api/chat/import                 load a session file (the Studio's export, or a downloaded saved session) into the room
 *
 * Reopening and importing replace what the room holds, so they refuse while a session is running.
 */
import { Router } from 'express';
import { hydrateSaved, toStudioExport, fromStudioExport, autosaveEnabled, retentionDays } from '../services/sessionArchive.js';

const router = Router();

const archiveOf = (req) => req.room.archive || null;

router.get('/saved', (req, res) => {
  const archive = archiveOf(req);
  res.json({
    enabled: !!archive,
    ...(archive ? { retentionDays: retentionDays(), sessions: archive.list() } : { sessions: [], reason: autosaveEnabled() ? 'unavailable' : 'Saving to disk is off on this server.' }),
  });
});

router.get('/saved/:id/download', (req, res) => {
  const archive = archiveOf(req);
  if (!archive || !archive.has(req.params.id)) return res.status(404).json({ error: 'No such saved session' });
  const saved = archive.load(req.params.id);
  const file = toStudioExport(saved, (rel) => archive.readFileBase64(req.params.id, rel));
  res.setHeader('Content-Disposition', `attachment; filename="agent-session-${req.params.id}.json"`);
  res.json(file);
});

router.post('/saved/:id/reopen', (req, res) => {
  const archive = archiveOf(req);
  if (!archive || !archive.has(req.params.id)) return res.status(404).json({ error: 'No such saved session' });
  if (req.room.orchestrator.isRunning) return res.status(409).json({ error: 'A session is running. Stop it first.' });
  const saved = hydrateSaved(archive, req.params.id);
  const summary = req.room.orchestrator.restoreSession({ ...saved, source: 'saved' });
  res.json({ success: true, ...summary, state: req.room.orchestrator.getState() });
});

router.delete('/saved/:id', (req, res) => {
  const archive = archiveOf(req);
  if (!archive || !archive.has(req.params.id)) return res.status(404).json({ error: 'No such saved session' });
  archive.remove(req.params.id);
  res.json({ success: true });
});

router.delete('/saved', (req, res) => {
  const archive = archiveOf(req);
  if (!archive) return res.json({ success: true, removed: 0 });
  const removed = archive.list().length;
  archive.removeAll();
  res.json({ success: true, removed });
});

router.post('/import', (req, res) => {
  if (req.room.orchestrator.isRunning) return res.status(409).json({ error: 'A session is running. Stop it first.' });
  let saved;
  try {
    saved = fromStudioExport(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const summary = req.room.orchestrator.restoreSession({ ...saved, source: 'file' });
  res.json({ success: true, ...summary, state: req.room.orchestrator.getState() });
});

export default router;
