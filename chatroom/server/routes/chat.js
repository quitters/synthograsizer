import { Router } from 'express';
import { orchestrator } from '../services/orchestrator.js';
import { mediaStore } from '../services/mediaStore.js';
import { generateImageWithReferences } from '../services/imageGen.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

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

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to chat stream' })}\n\n`);

  // Register client
  const removeClient = orchestrator.addClient(res);

  // Send current state
  res.write(`event: state\ndata: ${JSON.stringify(orchestrator.getState())}\n\n`);

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
  const { goal, tokenLimit = 100000 } = req.body;

  if (!goal) {
    return res.status(400).json({ error: 'Goal is required' });
  }

  const agents = orchestrator.getAgents();
  if (agents.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 agents to start' });
  }

  try {
    // Start is async but returns immediately
    orchestrator.start(goal, tokenLimit);
    res.json({
      success: true,
      message: 'Chat started',
      state: orchestrator.getState()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/chat/stop
 * Stop the chat
 */
router.post('/stop', (req, res) => {
  orchestrator.stop('user_stopped');
  res.json({
    success: true,
    message: 'Chat stopped',
    state: orchestrator.getState()
  });
});

/**
 * POST /api/chat/pause
 * Pause the chat
 */
router.post('/pause', (req, res) => {
  orchestrator.pause();
  res.json({
    success: true,
    message: 'Chat paused',
    state: orchestrator.getState()
  });
});

/**
 * POST /api/chat/resume
 * Resume the chat
 */
router.post('/resume', (req, res) => {
  orchestrator.resume();
  res.json({
    success: true,
    message: 'Chat resumed',
    state: orchestrator.getState()
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

  const message = orchestrator.injectMessage(content, senderName);
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
  const history = orchestrator.getHistory();
  res.json({ history });
});

/**
 * GET /api/chat/state
 * Get current state
 */
router.get('/state', (req, res) => {
  const state = orchestrator.getState();
  res.json(state);
});

/**
 * POST /api/chat/reset
 * Reset everything
 */
router.post('/reset', (req, res) => {
  orchestrator.reset();
  mediaStore.clear();
  res.json({
    success: true,
    message: 'Chat reset',
    state: orchestrator.getState()
  });
});

/**
 * GET /api/chat/media
 * Get all stored media summary
 */
router.get('/media', (req, res) => {
  const summary = mediaStore.getSummary();
  res.json(summary);
});

/**
 * GET /api/chat/media/:id
 * Get a specific media item by ID
 */
router.get('/media/:id', (req, res) => {
  const media = mediaStore.get(req.params.id);
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
  const exports = mediaStore.exportForZip();
  res.json({
    count: exports.length,
    items: exports
  });
});

/**
 * POST /api/chat/generate-image
 * Generate a new image with optional reference images
 * Used by frontend for user-initiated image generation/remixing
 */
router.post('/generate-image', async (req, res) => {
  const { prompt, referenceIds = [] } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    // Gather reference images if provided
    const referenceImages = [];
    for (const refId of referenceIds) {
      const media = mediaStore.get(refId);
      if (media) {
        referenceImages.push({
          imageData: media.data,
          mimeType: media.mimeType
        });
      }
    }

    // Generate the image
    const imageResult = await generateImageWithReferences(prompt, referenceImages);
    const imageId = uuidv4();

    // Store in media store
    mediaStore.add({
      id: imageId,
      type: 'image',
      data: imageResult.imageData,
      mimeType: imageResult.mimeType,
      prompt: prompt,
      agentId: 'user',
      agentName: 'User',
      referenceIds: referenceIds.length > 0 ? referenceIds : undefined
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

  const currentMedia = orchestrator.getSessionMedia();
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

      orchestrator.addSessionMedia(mediaItem);

      // Also store images in mediaStore for remix capability
      if (file.mimeType.startsWith('image/')) {
        mediaStore.add({
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
      totalCount: orchestrator.getSessionMedia().length
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/chat/session-media/:id
 * Remove a session media file
 */
router.delete('/session-media/:id', (req, res) => {
  orchestrator.removeSessionMedia(req.params.id);
  res.json({
    success: true,
    totalCount: orchestrator.getSessionMedia().length
  });
});

/**
 * POST /api/chat/session-media/clear
 * Clear all session media (used before starting a new chat)
 */
router.post('/session-media/clear', (req, res) => {
  orchestrator.clearSessionMedia();
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
  const media = orchestrator.getSessionMedia().map(m => ({
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
  const settings = orchestrator.getSpeakingOrderSettings();
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

  orchestrator.setSpeakingOrder(mode);
  res.json({
    success: true,
    mode,
    settings: orchestrator.getSpeakingOrderSettings()
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

  orchestrator.setAgentPriority(agentId, priority);
  res.json({
    success: true,
    agentId,
    priority,
    settings: orchestrator.getSpeakingOrderSettings()
  });
});

// ==================== BRANCHING ENDPOINTS ====================

/**
 * GET /api/chat/branches
 * List all branch points
 */
router.get('/branches', (req, res) => {
  const branches = orchestrator.getBranchPoints();
  res.json({ branches });
});

/**
 * POST /api/chat/branches
 * Create a new branch point at current state
 */
router.post('/branches', (req, res) => {
  const { name } = req.body;

  try {
    const branch = orchestrator.createBranchPoint(name);
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
    const result = orchestrator.restoreBranch(req.params.id);
    res.json({
      success: true,
      ...result,
      state: orchestrator.getState()
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
    orchestrator.deleteBranch(req.params.id);
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
    const branch = orchestrator.renameBranch(req.params.id, name);
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
    const result = orchestrator.rewindToMessage(messageIndex);
    res.json({
      success: true,
      ...result,
      state: orchestrator.getState()
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
  const settings = orchestrator.getConsensusSettings();
  res.json(settings);
});

/**
 * POST /api/chat/consensus-settings
 * Update consensus detection settings
 */
router.post('/consensus-settings', (req, res) => {
  const {
    enabled,
    sensitivity,
    requireExplicitMarker,
    minSignoffCount,
    customPhrases
  } = req.body;

  try {
    orchestrator.updateConsensusSettings({
      enabled,
      sensitivity,
      requireExplicitMarker,
      minSignoffCount,
      customPhrases
    });

    res.json({
      success: true,
      settings: orchestrator.getConsensusSettings()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
