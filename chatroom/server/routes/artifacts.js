/**
 * Artifact API Routes
 * ────────────────────
 *   GET    /api/artifacts            — list all artifacts (metadata)
 *   GET    /api/artifacts/:filename  — get artifact content + versions
 *   DELETE /api/artifacts/:filename  — delete an artifact
 */

import { Router } from 'express';
import { artifactStore } from '../services/artifactStore.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(artifactStore.list());
});

router.get('/:filename', (req, res) => {
  const art = artifactStore.get(req.params.filename);
  if (!art) return res.status(404).json({ error: 'Artifact not found' });
  res.json({
    filename: art.filename,
    language: art.language,
    content:  art.content,
    versions: art.versions.map(v => ({
      version:   v.version,
      agentName: v.agentName,
      timestamp: v.timestamp,
    })),
    lastEditBy: art.lastEditBy,
    updatedAt:  art.updatedAt,
  });
});

router.get('/:filename/version/:version', (req, res) => {
  const content = artifactStore.getVersion(req.params.filename, Number(req.params.version));
  if (content === null) return res.status(404).json({ error: 'Version not found' });
  res.json({ content });
});

router.delete('/:filename', (req, res) => {
  artifactStore.delete(req.params.filename);
  res.json({ ok: true });
});

export default router;
