import { Router } from 'express';
import { generateImageWithReferences } from '../services/imageGen.js';
import {
  listOrphanedStores, destroySessionStore, listMemoryDocuments, forgetAllMemory,
} from '../services/fileSearch.js';
import { isFileSearchEnabled, isCrossSessionMemoryEnabled } from '../config/fileSearch.js';
import { renderTranscript } from '../services/tts.js';
import { VOICES, DEFAULT_VOICE } from '../config/voices.js';
import { mintSessionToken, isLoopbackRequest } from '../services/liveSession.js';
import { isLiveApiEnabled, ALLOW_REMOTE_TOKENS } from '../config/live.js';
import { v4 as uuidv4 } from 'uuid';
import { activeFileSearchStores } from '../services/sessionRegistry.js';
import { parseCriteriaText, normalizeCriteria } from '../services/doneWhen.js';
import { isPolicyError } from '../company/errors.js';

const router = Router();

/** Checks from a request body: { criteria: [...] } or { text: "one check per line" } (or the bare list / text). */
function readDoneWhen(body) {
  if (typeof body === 'string') return parseCriteriaText(body);
  if (Array.isArray(body)) return normalizeCriteria(body);
  if (Array.isArray(body?.criteria)) return normalizeCriteria(body.criteria);
  if (typeof body?.text === 'string') return parseCriteriaText(body.text);
  return { criteria: [], errors: [] };
}

/**
 * GET /api/chat/stream
 * SSE endpoint for real-time updates
 */
router.get('/stream', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // A first visit opens this stream at the same moment as the page's other requests,
  // and each cookie-less request would be given its own room. Hand over the cookie
  // and close at once: the browser reconnects after `retry`, by which time it has
  // settled on one cookie, and joins that room's stream.
  if (req.roomIsNew) {
    res.write('retry: 300\n\n');
    return res.end();
  }

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to chat stream' })}\n\n`);

  // A page that can render artifacts (the Agent Studio) says so with ?renders=1; render requests go only to those
  res.renderCapable = req.query.renders === '1';

  // Register client
  const removeClient = req.room.orchestrator.addClient(res);

  // Send current state
  res.write(`event: state\ndata: ${JSON.stringify(req.room.orchestrator.getState())}\n\n`);

  // Handle client disconnect
  req.on('close', () => {
    removeClient();
  });
});

/**
 * POST /api/chat/start
 * Start the autonomous chat
 */
router.post('/start', async (req, res) => {
  const { goal, tokenLimit = 100000, model, mode, doneWhen } = req.body;

  if (!goal) {
    return res.status(400).json({ error: 'Goal is required' });
  }

  // Optional checks the room must pass before it may end (see /done-when)
  if (doneWhen) {
    const parsed = readDoneWhen(doneWhen);
    if (parsed.errors.length) return res.status(400).json({ error: 'Bad done-when checks', errors: parsed.errors });
    req.room.orchestrator.setDoneWhen(parsed.criteria, { maxBlocks: doneWhen.maxBlocks });
  }

  const normalizedMode = mode === 'solo' ? 'solo' : 'group';
  const minAgents = normalizedMode === 'solo' ? 1 : 2;
  const agents = req.room.orchestrator.getAgents();
  if (agents.length < minAgents) {
    return res.status(400).json({
      error: `Need at least ${minAgents} agent${minAgents > 1 ? 's' : ''} to start a ${normalizedMode} chat`
    });
  }

  try {
    // Start returns as soon as the conversation loop is going. It is awaited so a refusal (a company that is paused, a goal that
    // holds a secret) reaches the caller instead of vanishing as an unhandled rejection after "Chat started".
    await req.room.orchestrator.start(goal, tokenLimit, { model, mode: normalizedMode });
    res.json({
      success: true,
      message: 'Chat started',
      state: req.room.orchestrator.getState()
    });
  } catch (error) {
    if (isPolicyError(error)) return res.status(error.status).json({ error: error.message, code: error.code, ...(error.field ? { field: error.field } : {}) });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/chat/stop
 * Stop the chat
 */
router.post('/stop', (req, res) => {
  req.room.orchestrator.stop('user_stopped');
  res.json({
    success: true,
    message: 'Chat stopped',
    state: req.room.orchestrator.getState()
  });
});

/**
 * POST /api/chat/pause
 * Pause the chat
 */
router.post('/pause', (req, res) => {
  req.room.orchestrator.pause();
  res.json({
    success: true,
    message: 'Chat paused',
    state: req.room.orchestrator.getState()
  });
});

/**
 * POST /api/chat/resume
 * Resume the chat
 */
router.post('/resume', (req, res) => {
  req.room.orchestrator.resume();
  res.json({
    success: true,
    message: 'Chat resumed',
    state: req.room.orchestrator.getState()
  });
});

/**
 * POST /api/chat/inject
 * Inject a user message
 */
router.post('/inject', (req, res) => {
  const { content, senderName = 'User' } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const message = req.room.orchestrator.injectMessage(content, senderName);
  res.json({
    success: true,
    message
  });
});

/**
 * GET /api/chat/history
 * Get conversation history
 */
router.get('/history', (req, res) => {
  const history = req.room.orchestrator.getHistory();
  res.json({ history });
});

/**
 * GET /api/chat/state
 * Get current state
 */
router.get('/state', (req, res) => {
  const state = req.room.orchestrator.getState();
  res.json(state);
});

/**
 * POST /api/chat/reset
 * Reset everything
 */
router.post('/reset', (req, res) => {
  req.room.orchestrator.reset();
  req.room.mediaStore.clear();
  res.json({
    success: true,
    message: 'Chat reset',
    state: req.room.orchestrator.getState()
  });
});

/**
 * GET /api/chat/file-search/orphans
 * File Search stores this app created that are still alive. A crash between
 * create and destroy leaks one, and the quota is project-wide, so there has
 * to be a way to see them.
 *
 * DELETE removes all of them except the ones live rooms are using.
 */
router.get('/file-search/orphans', async (req, res) => {
  if (!isFileSearchEnabled()) return res.json({ enabled: false, stores: [] });
  try {
    res.json({ enabled: true, stores: await listOrphanedStores() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/file-search/orphans', async (req, res) => {
  if (!isFileSearchEnabled()) return res.json({ enabled: false, deleted: 0 });
  try {
    // Every live room's store is off limits, not just the caller's: this sweeps the whole
    // project, and other visitors' chats are running in it.
    const active = new Set(activeFileSearchStores());
    let deleted = 0;
    for (const store of await listOrphanedStores()) {
      if (active.has(store.name)) continue; // never pull the rug on a live session
      const result = await destroySessionStore(store.name);
      if (result.ok) deleted++;
    }
    res.json({ enabled: true, deleted, skippedActive: active.size > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/chat/memory
 * What previous sessions this visitor's room currently remembers (each visitor has their
 * own long-term memory; nobody can list or wipe another's).
 *
 * DELETE forgets all of it. Long-term memory accumulates indefinitely and is
 * invisible in the UI otherwise, so it needs a way to be inspected and wiped.
 */
router.get('/memory', async (req, res) => {
  if (!isCrossSessionMemoryEnabled()) {
    return res.json({ enabled: false, documents: [] });
  }
  try {
    const { storeName, documents } = await listMemoryDocuments(req.room.id);
    res.json({ enabled: true, storeName, count: documents.length, documents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/memory', async (req, res) => {
  if (!isCrossSessionMemoryEnabled()) {
    return res.json({ enabled: false, forgotten: false });
  }
  try {
    const result = await forgetAllMemory(req.room.id);
    // The running session holds a handle to the store just deleted.
    req.room.orchestrator.memoryStoreName = null;
    res.json({ enabled: true, forgotten: result.ok, error: result.error });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/chat/render-audio
 * Render the transcript to a single WAV, one voice per agent.
 *
 * Explicitly user-triggered rather than automatic: audio output bills at
 * $20/1M tokens (~32 tokens/second, so roughly $2.30 per hour of speech),
 * and nobody wants that happening on every turn by surprise.
 */
router.post('/render-audio', async (req, res) => {
  const messages = req.room.orchestrator.getHistory().filter(m => !m.isUser || req.body?.includeUser);
  if (messages.length === 0) {
    return res.status(400).json({ error: 'Nothing to render — the transcript is empty' });
  }

  const voiceByAgentId = new Map(
    req.room.orchestrator.getAgents().map(a => [a.id, a.voice])
  );

  try {
    const started = Date.now();
    const result = await renderTranscript(messages, voiceByAgentId, (done, total, speaker) => {
      req.room.orchestrator.broadcast('audio_progress', { done, total, speaker });
    });

    req.room.orchestrator.broadcast('audio_rendered', {
      units: result.units,
      failed: result.failed,
      durationSeconds: result.durationSeconds,
    });

    res.json({
      success: true,
      // base64 so it drops straight into the existing JSZip export path.
      audio: result.wav.toString('base64'),
      mimeType: 'audio/wav',
      units: result.units,
      failed: result.failed,
      durationSeconds: result.durationSeconds,
      renderSeconds: Math.round((Date.now() - started) / 1000),
    });
  } catch (err) {
    console.error('Audio render failed:', err);
    req.room.orchestrator.broadcast('audio_error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/chat/live-token
 * Mint a short-lived, single-use token so a browser can open a Live API
 * session without ever holding the real API key.
 *
 * ⚠ This endpoint mints spend against your key and the chat room has no
 * authentication of its own, so it is off by default and refuses non-local
 * callers unless LIVE_API_ALLOW_REMOTE is also set.
 */
router.post('/live-token', async (req, res) => {
  if (!isLiveApiEnabled()) {
    return res.status(404).json({ error: 'Live API is not enabled on this server' });
  }
  if (!ALLOW_REMOTE_TOKENS && !isLoopbackRequest(req)) {
    return res.status(403).json({
      error: 'Live tokens are served to localhost only. Set LIVE_API_ALLOW_REMOTE=true ' +
             'to change that, understanding it lets any caller spend your quota.',
    });
  }
  try {
    res.json(await mintSessionToken());
  } catch (err) {
    console.error('Live token mint failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/chat/voices
 * The voice catalogue for the UI picker.
 */
router.get('/voices', (req, res) => {
  res.json({ voices: VOICES, defaultVoice: DEFAULT_VOICE });
});

/**
 * GET /api/chat/media
 * Get all stored media summary
 */
router.get('/media', (req, res) => {
  const summary = req.room.mediaStore.getSummary();
  res.json(summary);
});

/**
 * GET /api/chat/media/:id
 * Get a specific media item by ID
 */
router.get('/media/:id', (req, res) => {
  const media = req.room.mediaStore.get(req.params.id);
  if (!media) {
    return res.status(404).json({ error: 'Media not found' });
  }
  res.json(media);
});

/**
 * GET /api/chat/media/export
 * Get all media prepared for ZIP export
 */
router.get('/media/export', (req, res) => {
  const exports = req.room.mediaStore.exportForZip();
  res.json({
    count: exports.length,
    items: exports
  });
});

/**
 * POST /api/chat/generate-image
 * Generate a new image with optional reference images
 * Used by frontend for user-initiated image generation/remixing
 *
 * Body: { prompt, referenceIds?: string[], references?: { objects?, character?, style? } }
 * `referenceIds` is the flat, untyped list and is unchanged. `references`
 * assigns media ids to the model's typed composition slots; the two are
 * additive.
 */
router.post('/generate-image', async (req, res) => {
  const { prompt, referenceIds = [], references = {} } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    // Gather reference images if provided. Unknown media ids are skipped, the
    // same way the flat path has always skipped them.
    const referenceImages = [];
    const collect = (ids, role) => {
      for (const refId of ids || []) {
        const media = req.room.mediaStore.get(refId);
        if (!media) continue;
        referenceImages.push({
          imageData: media.data,
          mimeType: media.mimeType,
          ...(role ? { role } : {})
        });
      }
    };
    collect(referenceIds, null);
    for (const slot of ['objects', 'character', 'style']) {
      collect(references[slot], slot);
    }

    // Generate the image
    const imageResult = await generateImageWithReferences(prompt, referenceImages);
    const imageId = uuidv4();

    // Store in media store
    req.room.mediaStore.add({
      id: imageId,
      type: 'image',
      data: imageResult.imageData,
      mimeType: imageResult.mimeType,
      prompt: prompt,
      agentId: 'user',
      agentName: 'User',
      referenceIds: referenceImages.length > 0
        ? [
            ...referenceIds,
            ...['objects', 'character', 'style'].flatMap(s => references[s] || [])
          ]
        : undefined
    });

    res.json({
      success: true,
      image: {
        id: imageId,
        imageData: imageResult.imageData,
        mimeType: imageResult.mimeType,
        prompt: prompt,
        text: imageResult.text
      }
    });
  } catch (error) {
    console.error('Image generation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== SESSION MEDIA ENDPOINTS ====================

/**
 * POST /api/chat/session-media
 * Upload media files for the session (images, JSON, text, etc.)
 * Expects { files: [{ name, mimeType, data (base64) }] }
 * Max 14 files total
 */
router.post('/session-media', (req, res) => {
  const { files } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'files array is required' });
  }

  const currentMedia = req.room.orchestrator.getSessionMedia();
  if (currentMedia.length + files.length > 14) {
    return res.status(400).json({
      error: `Cannot add ${files.length} files. ${currentMedia.length}/14 slots used. ${14 - currentMedia.length} remaining.`
    });
  }

  try {
    const added = [];
    for (const file of files) {
      if (!file.name || !file.mimeType || !file.data) {
        continue; // Skip invalid entries
      }

      const mediaItem = {
        id: uuidv4(),
        name: file.name,
        mimeType: file.mimeType,
        data: file.data, // base64 encoded
        description: file.description || file.name,
        uploadedAt: new Date().toISOString()
      };

      req.room.orchestrator.addSessionMedia(mediaItem);

      // Also store images in mediaStore for remix capability
      if (file.mimeType.startsWith('image/')) {
        req.room.mediaStore.add({
          id: mediaItem.id,
          type: 'image',
          data: file.data,
          mimeType: file.mimeType,
          prompt: `Uploaded: ${file.name}`,
          agentId: 'user',
          agentName: 'User (Upload)'
        });
      }

      added.push({
        id: mediaItem.id,
        name: mediaItem.name,
        mimeType: mediaItem.mimeType,
        size: file.data.length
      });
    }

    res.json({
      success: true,
      added,
      totalCount: req.room.orchestrator.getSessionMedia().length
    });
  } catch (error) {
    const body = { error: error.message };
    if (error.code) body.code = error.code;
    if (error.limit !== undefined) { body.limit = error.limit; body.current = error.current; }
    res.status(400).json(body);
  }
});

/**
 * DELETE /api/chat/session-media/:id
 * Remove a session media file
 */
router.delete('/session-media/:id', (req, res) => {
  req.room.orchestrator.removeSessionMedia(req.params.id);
  res.json({
    success: true,
    totalCount: req.room.orchestrator.getSessionMedia().length
  });
});

/**
 * POST /api/chat/session-media/clear
 * Clear all session media (used before starting a new chat)
 */
router.post('/session-media/clear', (req, res) => {
  req.room.orchestrator.clearSessionMedia();
  res.json({
    success: true,
    totalCount: 0
  });
});

/**
 * GET /api/chat/session-media
 * List all session media (metadata only, no data)
 */
router.get('/session-media', (req, res) => {
  const media = req.room.orchestrator.getSessionMedia().map(m => ({
    id: m.id,
    name: m.name,
    mimeType: m.mimeType,
    size: m.data?.length || 0,
    uploadedAt: m.uploadedAt
  }));
  res.json({ media, totalCount: media.length });
});

// ==================== SPEAKING ORDER ENDPOINTS ====================

/**
 * GET /api/chat/speaking-order
 * Get current speaking order settings
 */
router.get('/speaking-order', (req, res) => {
  const settings = req.room.orchestrator.getSpeakingOrderSettings();
  res.json(settings);
});

/**
 * POST /api/chat/speaking-order
 * Set speaking order mode
 */
router.post('/speaking-order', (req, res) => {
  const { mode } = req.body;

  const validModes = ['dynamic', 'round-robin', 'priority', 'random'];
  if (!validModes.includes(mode)) {
    return res.status(400).json({
      error: `Invalid mode. Must be one of: ${validModes.join(', ')}`
    });
  }

  req.room.orchestrator.setSpeakingOrder(mode);
  res.json({
    success: true,
    mode,
    settings: req.room.orchestrator.getSpeakingOrderSettings()
  });
});

/**
 * POST /api/chat/speaking-order/priority
 * Set priority for a specific agent
 */
router.post('/speaking-order/priority', (req, res) => {
  const { agentId, priority } = req.body;

  if (!agentId) {
    return res.status(400).json({ error: 'agentId is required' });
  }

  if (typeof priority !== 'number' || priority < 0) {
    return res.status(400).json({ error: 'priority must be a non-negative number' });
  }

  req.room.orchestrator.setAgentPriority(agentId, priority);
  res.json({
    success: true,
    agentId,
    priority,
    settings: req.room.orchestrator.getSpeakingOrderSettings()
  });
});

// ==================== BRANCHING ENDPOINTS ====================

/**
 * GET /api/chat/branches
 * List all branch points
 */
router.get('/branches', (req, res) => {
  const branches = req.room.orchestrator.getBranchPoints();
  res.json({ branches });
});

/**
 * POST /api/chat/branches
 * Create a new branch point at current state
 */
router.post('/branches', (req, res) => {
  const { name } = req.body;

  try {
    const branch = req.room.orchestrator.createBranchPoint(name);
    res.json({
      success: true,
      branch: {
        id: branch.id,
        name: branch.name,
        messageIndex: branch.messageIndex,
        createdAt: branch.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/chat/branches/:id/restore
 * Restore a branch point (go back to that state)
 */
router.post('/branches/:id/restore', (req, res) => {
  try {
    const result = req.room.orchestrator.restoreBranch(req.params.id);
    res.json({
      success: true,
      ...result,
      state: req.room.orchestrator.getState()
    });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * DELETE /api/chat/branches/:id
 * Delete a branch point
 */
router.delete('/branches/:id', (req, res) => {
  try {
    req.room.orchestrator.deleteBranch(req.params.id);
    res.json({
      success: true,
      message: 'Branch deleted'
    });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * PATCH /api/chat/branches/:id
 * Rename a branch point
 */
router.patch('/branches/:id', (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const branch = req.room.orchestrator.renameBranch(req.params.id, name);
    res.json({
      success: true,
      branch: {
        id: branch.id,
        name: branch.name
      }
    });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * POST /api/chat/rewind
 * Rewind conversation to a specific message index
 */
router.post('/rewind', (req, res) => {
  const { messageIndex } = req.body;

  if (typeof messageIndex !== 'number') {
    return res.status(400).json({ error: 'messageIndex is required and must be a number' });
  }

  try {
    const result = req.room.orchestrator.rewindToMessage(messageIndex);
    res.json({
      success: true,
      ...result,
      state: req.room.orchestrator.getState()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== CONSENSUS SETTINGS ENDPOINTS ====================

/**
 * GET /api/chat/consensus-settings
 * Get current consensus detection settings
 */
router.get('/consensus-settings', (req, res) => {
  const settings = req.room.orchestrator.getConsensusSettings();
  res.json(settings);
});

/**
 * POST /api/chat/consensus-settings
 * Update how the session ends: consensus detection, and the other ways out
 * (closeBy 'vote'|'lead' with leadAgent, minTurns, maxTurns), and the repeat check (repeatWindow: 0 = off, 2 to 10)
 */
router.post('/consensus-settings', (req, res) => {
  const {
    enabled,
    sensitivity,
    requireExplicitMarker,
    minSignoffCount,
    customPhrases,
    closeBy,
    leadAgent,
    minTurns,
    maxTurns,
    repeatWindow
  } = req.body;

  try {
    req.room.orchestrator.updateConsensusSettings({
      enabled,
      sensitivity,
      requireExplicitMarker,
      minSignoffCount,
      customPhrases,
      closeBy,
      leadAgent,
      minTurns,
      maxTurns,
      repeatWindow
    });

    res.json({
      success: true,
      settings: req.room.orchestrator.getConsensusSettings()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== REVIEW HAND-OFFS ====================

/**
 * GET /api/chat/handoffs
 * POST /api/chat/handoffs   { handoffs: [{ next: "Kasia", artifact?: "engine.json" }] }
 * After a file is saved (any file, or the one named), the agent named in `next` speaks next, and the "done when" check
 * `said_after` can hold the lead to hearing from them before closing. An empty list turns it off.
 */
router.get('/handoffs', (req, res) => {
  res.json({ handoffs: req.room.orchestrator.getHandoffs() });
});

router.post('/handoffs', (req, res) => {
  const list = Array.isArray(req.body) ? req.body : req.body?.handoffs;
  if (!Array.isArray(list)) return res.status(400).json({ error: 'Send { "handoffs": [{ "next": "Kasia" }] }' });
  if (list.length > 8) return res.status(400).json({ error: 'At most 8 hand-offs' });
  const bad = list.findIndex(h => !h || typeof h.next !== 'string' || !h.next.trim());
  if (bad >= 0) return res.status(400).json({ error: `Hand-off ${bad + 1} needs "next": an agent's name` });
  res.json({ success: true, handoffs: req.room.orchestrator.setHandoffs(list) });
});

// ==================== DONE WHEN ====================

/**
 * GET /api/chat/done-when
 * The checks the room must pass before it may end, as a list and as one line per check, with the last result.
 */
router.get('/done-when', (req, res) => {
  res.json(req.room.orchestrator.getDoneWhen());
});

/**
 * POST /api/chat/done-when   { criteria: [...] } or { text: "artifact: engine.json\nregex: /FINAL/ in last_message" }, optional maxBlocks
 * Set the checks (an empty list turns the gate off). The server runs them each time the room tries to end, and
 * each time an artifact is saved, and tells the room what failed.
 */
router.post('/done-when', (req, res) => {
  const parsed = readDoneWhen(req.body || {});
  if (parsed.errors.length) return res.status(400).json({ error: 'Bad done-when checks', errors: parsed.errors });
  res.json({ success: true, ...req.room.orchestrator.setDoneWhen(parsed.criteria, { maxBlocks: req.body?.maxBlocks }) });
});

/**
 * POST /api/chat/done-when/check
 * Run the checks now and say what passes and what does not. Changes nothing in the conversation.
 */
router.post('/done-when/check', async (req, res) => {
  const o = req.room.orchestrator;
  if (!o.doneWhen.criteria.length) return res.json({ passed: true, results: [], note: 'no checks are set' });
  const result = await o.checkDoneWhen({ manual: true });
  res.json({ passed: result.passed, results: result.results.map(r => ({ label: r.label, passed: r.passed, detail: r.detail })) });
});

// ==================== SHOW THE ROOM, CRITIC, RENDER ====================

/**
 * POST /api/chat/show   { images: [{ dataUrl | data, mimeType?, label? }], caption?, sender? }
 * Show the room pictures. They join the conversation as a note (from the Producer unless sender is given) and the
 * next speaker sees them. This is how a host or a tool lets a room look at something: a render, a contact sheet, a
 * screenshot of the preview.
 */
router.post('/show', (req, res) => {
  const { images, caption, sender } = req.body || {};
  const result = req.room.orchestrator.showToRoom({ images, caption, sender: typeof sender === 'string' && sender.trim() ? sender.trim().slice(0, 40) : 'Producer' });
  res.status(result.ok ? 200 : 400).json(result);
});

/**
 * GET /api/chat/critic        the independent critic's settings
 * POST /api/chat/critic       { enabled, auto, referenceId, criteria, model, minScore, maxCalls }
 * The critic sees only pictures (a reference, or a description, and the candidate), never the conversation, and scores 1 to 10.
 */
router.get('/critic', (req, res) => res.json(req.room.orchestrator.getCritic()));
router.post('/critic', (req, res) => {
  res.json({ success: true, settings: req.room.orchestrator.setCritic(req.body || {}) });
});

/**
 * POST /api/chat/critic/score   { imageId, referenceId?, criteria?, post? }
 * Score one picture now. With post: true the room is told, as a note from the Producer.
 */
router.post('/critic/score', async (req, res) => {
  const { imageId, referenceId, criteria, post } = req.body || {};
  if (!imageId) return res.status(400).json({ error: 'imageId is required' });
  const o = req.room.orchestrator;
  const r = await o.critique({ imageId, referenceId, criteria, source: 'host' });
  if (r.ok && post) o._postNote(`INDEPENDENT CRITIC on picture ${String(imageId).slice(0, 8)} (it saw only the pictures, not this conversation): ${r.text}`);
  res.status(r.ok ? 200 : 400).json(r);
});

/**
 * POST /api/chat/render   { artifact, draws? }
 * Render an artifact (a template, an instrument, a page) and show the room the result.
 */
router.post('/render', async (req, res) => {
  const { artifact, draws } = req.body || {};
  if (!artifact) return res.status(400).json({ error: 'artifact is required' });
  const o = req.room.orchestrator;
  const r = await o.render({ artifact, draws });
  if (!r.ok) return res.status(400).json({ ok: false, error: r.text });
  o._postNote(`Producer rendered ${artifact}: ${r.text}`, { images: r.images });
  res.json({ ok: true, text: r.text, imageIds: r.images.map(i => i.id) });
});

/**
 * POST /api/chat/render-result   { requestId, images: [{ dataUrl | data, mimeType?, label? }], error?, note? }
 * A browser's answer to a render_request event.
 */
router.post('/render-result', (req, res) => {
  const { requestId, images, error, note } = req.body || {};
  const accepted = req.room.orchestrator.resolveRender(String(requestId || ''),
    error ? { ok: false, error: String(error).slice(0, 300) } : { ok: true, images: Array.isArray(images) ? images : [], note: note ? String(note).slice(0, 300) : undefined });
  res.status(accepted ? 200 : 404).json({ accepted });
});

export default router;
