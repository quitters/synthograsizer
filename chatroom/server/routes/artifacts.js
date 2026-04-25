/**
 * Artifact API Routes
 * ────────────────────
 *   GET    /api/artifacts            — list all artifacts (metadata)
 *   POST   /api/artifacts            — create / update an artifact (UI-driven save)
 *   GET    /api/artifacts/:filename  — get artifact content + versions
 *   DELETE /api/artifacts/:filename  — delete an artifact
 */

import { Router } from 'express';
import { artifactStore } from '../services/artifactStore.js';
import { orchestrator } from '../services/orchestrator.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(artifactStore.list());
});

router.post('/', (req, res) => {
  const { filename, content, agentId, agentName } = req.body || {};
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'filename is required' });
  }
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content (string) is required' });
  }

  const artifact = artifactStore.save(
    filename,
    content,
    agentId || null,
    agentName || 'UI'
  );

  // Mirror the orchestrator's broadcast shape so clients on the SSE
  // stream pick this up identically to agent-authored saves.
  try {
    orchestrator.broadcast('artifact_update', {
      filename:   artifact.filename,
      language:   artifact.language,
      content:    artifact.content,
      version:    artifact.versions.length,
      lastEditBy: artifact.lastEditBy,
      agentId:    agentId || null,
    });
  } catch (e) {
    // Broadcast failures shouldn't fail the save — log and continue.
    console.warn('[artifacts] broadcast failed:', e.message);
  }

  res.json({
    filename:   artifact.filename,
    language:   artifact.language,
    version:    artifact.versions.length,
    lastEditBy: artifact.lastEditBy,
    updatedAt:  artifact.updatedAt,
  });
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
