import { Router } from 'express';
import { orchestrator } from '../services/orchestrator.js';
import { generateImage } from '../services/imageGen.js';
import {
  AGENT_MODEL_CHOICES,
  DEFAULT_AGENT_MODEL,
  THINKING_LEVELS,
  DEFAULT_THINKING_LEVEL,
} from '../config/models.js';
import {
  TOOL_TIER_CHOICES,
  DEFAULT_TOOL_TIER,
  TOOL_MODE,
  isFunctionCallingEnabled,
} from '../config/tools.js';

const router = Router();

/**
 * GET /api/agents
 * List all agents
 */
router.get('/', (req, res) => {
  const agents = orchestrator.getAgents();
  res.json({ agents });
});

/**
 * POST /api/agents
 * Add a new agent
 */
router.post('/', (req, res) => {
  const { name, bio, model, thinkingLevel, tools } = req.body;

  if (!name || !bio) {
    return res.status(400).json({ error: 'Name and bio are required' });
  }

  // Parse name from bio if not explicitly provided
  let agentName = name;
  if (!agentName || agentName.trim() === '') {
    // Try to extract name from first line of bio
    const firstLine = bio.split('\n')[0];
    const match = firstLine.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/);
    if (match) {
      agentName = match[1];
    } else {
      agentName = `Agent ${orchestrator.getAgents().length + 1}`;
    }
  }

  // Unrecognised model / thinking values fall back to the registry defaults
  // rather than 400-ing — an agent with a typo'd model should still join.
  const agent = orchestrator.addAgent(agentName.trim(), bio.trim(), { model, thinkingLevel, tools });
  res.status(201).json({ agent });
});

/**
 * GET /api/agents/models
 * The model + deliberation options the UI should offer, and the defaults.
 */
router.get('/models', (req, res) => {
  res.json({
    models: AGENT_MODEL_CHOICES,
    defaultModel: DEFAULT_AGENT_MODEL,
    thinkingLevels: THINKING_LEVELS,
    defaultThinkingLevel: DEFAULT_THINKING_LEVEL,
    // Tool tiers only mean anything when TOOL_MODE=functions; the UI hides
    // the selector otherwise rather than offering a setting with no effect.
    toolMode: TOOL_MODE,
    toolTiers: isFunctionCallingEnabled() ? TOOL_TIER_CHOICES : [],
    defaultToolTier: DEFAULT_TOOL_TIER,
  });
});

/**
 * DELETE /api/agents/:id
 * Remove an agent
 */
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  orchestrator.removeAgent(id);
  res.json({ success: true });
});

/**
 * PATCH /api/agents/:idOrName
 * Hot-swap an agent's bio (or name) mid-session. The path parameter is
 * matched against agent ids first, then names — the Composer's live knob
 * tweaks identify agents by name (the chatroom's uuids aren't surfaced),
 * so we fall back to that.
 *
 * Body: { bio?: string, name?: string, model?: string, thinkingLevel?: string, tools?: string }
 */
router.patch('/:idOrName', (req, res) => {
  const { idOrName } = req.params;
  const { bio, name, model, thinkingLevel, tools } = req.body || {};
  if (typeof bio !== 'string' && typeof name !== 'string' &&
      typeof model !== 'string' && typeof thinkingLevel !== 'string' && typeof tools !== 'string') {
    return res.status(400).json({ error: 'Provide at least one of: bio, name, model, thinkingLevel, tools' });
  }
  const updated = orchestrator.updateAgent(idOrName, { bio, name, model, thinkingLevel, tools });
  if (!updated) return res.status(404).json({ error: `Agent not found: ${idOrName}` });
  res.json({ agent: updated });
});

/**
 * DELETE /api/agents
 * Remove all agents (reset)
 */
router.delete('/', (req, res) => {
  orchestrator.reset();
  res.json({ success: true });
});

/**
 * POST /api/agents/:id/avatar
 * Upload an avatar for an agent
 */
router.post('/:id/avatar', (req, res) => {
  const { id } = req.params;
  const { imageData, mimeType } = req.body;

  if (!imageData || !mimeType) {
    return res.status(400).json({ error: 'Image data and mime type are required' });
  }

  const success = orchestrator.setAgentAvatar(id, { imageData, mimeType });

  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

/**
 * POST /api/agents/:id/avatar/generate
 * Generate an avatar using Gemini
 */
router.post('/:id/avatar/generate', async (req, res) => {
  const { id } = req.params;
  const { prompt } = req.body;

  const agent = orchestrator.getAgents().find(a => a.id === id);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  try {
    // Build avatar generation prompt
    const avatarPrompt = prompt || `Professional portrait avatar of ${agent.name}. Modern, clean digital art style, friendly expression, suitable for a chat avatar. High quality, centered face, simple gradient background.`;

    const result = await generateImage(avatarPrompt, { aspectRatio: '1:1' });

    if (result.imageData) {
      const avatar = {
        imageData: result.imageData,
        mimeType: result.mimeType || 'image/png'
      };

      orchestrator.setAgentAvatar(id, avatar);
      res.json({ success: true, avatar });
    } else {
      res.status(500).json({ error: 'Failed to generate image' });
    }
  } catch (err) {
    console.error('Avatar generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate avatar' });
  }
});

/**
 * DELETE /api/agents/:id/avatar
 * Remove an agent's avatar
 */
router.delete('/:id/avatar', (req, res) => {
  const { id } = req.params;
  const success = orchestrator.setAgentAvatar(id, null);

  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

/**
 * GET /api/agents/:id/context
 * Get the context/memory window for an agent
 */
router.get('/:id/context', (req, res) => {
  const { id } = req.params;
  const context = orchestrator.getAgentContext(id);

  if (context) {
    res.json(context);
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

export default router;
