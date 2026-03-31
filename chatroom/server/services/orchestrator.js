import { v4 as uuidv4 } from 'uuid';
import { generateAgentResponse } from './gemini.js';
import { generateImage, generateImageWithReferences, parseImageRequests, parseRemixRequests, stripImageTags } from './imageGen.js';
import { parseToolRequests, executeToolRequests, stripToolTags, formatToolResults, parseSynthRequests, executeSynthRequests, stripSynthTags, formatSynthResults, parseWorkflowRequests, stripWorkflowTags, workflowEngine, parseSynthStyleRequests, parseWorkflowTemplateRequests, stripStyleAndTemplateTags } from './tools.js';
import { countTokens, countMessageTokens } from '../utils/tokenCounter.js';
import { mediaStore } from './mediaStore.js';
import { artifactStore } from './artifactStore.js';
import { synthClient } from 'workflow-engine';

/**
 * Chat Orchestrator
 * Manages the autonomous conversation between agents
 */
class ChatOrchestrator {
  constructor() {
    this.reset();
  }

  reset() {
    this.agents = [];
    this.messages = [];
    this.goal = '';
    this.tokenLimit = 100000;
    this.tokenCount = 0;
    this.turnCount = 0;
    this.isRunning = false;
    this.isPaused = false;
    this.lastSpeakerId = null;
    // NOTE: do NOT clear sseClients — they are transport-level connections
    // that persist across session resets. Clearing them orphans live clients.
    if (!this.sseClients) this.sseClients = new Set();
    this.completionReason = null;
    // Speaking order: 'dynamic' (AI-driven), 'round-robin', 'priority', 'random'
    this.speakingOrder = 'dynamic';
    this.speakingPriorities = {}; // agentId -> priority (higher = more likely to speak)
    // Branching support
    this.branchPoints = []; // Saved states for branching
    this.currentBranchId = null;
    // Session media (uploaded files available to all agents)
    this.sessionMedia = []; // Array of { id, name, mimeType, data, description }
    // Consensus detection settings
    this.consensusSettings = {
      enabled: true,
      sensitivity: 'medium', // 'low', 'medium', 'high', 'manual'
      requireExplicitMarker: false,
      minSignoffCount: 2,
      customPhrases: []
    };
  }

  /**
   * Add session media (uploaded files available to all agents)
   */
  addSessionMedia(mediaItem) {
    if (this.sessionMedia.length >= 14) {
      throw new Error('Maximum of 14 session media files allowed');
    }
    this.sessionMedia.push(mediaItem);
    return mediaItem;
  }

  /**
   * Remove session media by ID
   */
  removeSessionMedia(mediaId) {
    this.sessionMedia = this.sessionMedia.filter(m => m.id !== mediaId);
  }

  /**
   * Get all session media
   */
  getSessionMedia() {
    return this.sessionMedia;
  }

  /**
   * Clear all session media
   */
  clearSessionMedia() {
    this.sessionMedia = [];
  }

  /**
   * Set an agent's avatar
   */
  setAgentAvatar(agentId, avatar) {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      agent.avatar = avatar;
      return true;
    }
    return false;
  }

  /**
   * Get an agent's context/memory window information
   */
  getAgentContext(agentId) {
    const agent = this.agents.find(a => a.id === agentId);
    if (!agent) return null;

    // Calculate token usage
    const bioTokens = countTokens(agent.bio || '');
    const systemPromptTokens = bioTokens + 500; // bio + base instructions

    const recentMessages = this.messages.slice(-20);
    const conversationTokens = recentMessages.reduce((sum, m) =>
      sum + (m.tokenCount || countTokens(m.content || '')), 0
    );

    const agentMessages = this.messages.filter(m => m.agentId === agentId);
    const mentionsOfAgent = this.messages.filter(m =>
      m.content?.toLowerCase().includes(agent.name.toLowerCase())
    );

    // Extract key topics
    const keyTopics = this.extractKeyTopics(recentMessages);

    // Build memory items
    const memoryItems = this.buildMemoryItems(agent);

    return {
      agent: { id: agent.id, name: agent.name, color: agent.color },
      systemPromptTokens,
      conversationTokens,
      totalTokens: systemPromptTokens + conversationTokens,
      recentMessages: recentMessages.map(m => ({
        agentName: m.agentName,
        content: m.content?.slice(0, 100) + '...',
        timestamp: m.timestamp
      })),
      agentContributions: agentMessages.length,
      timesMentioned: mentionsOfAgent.length,
      keyTopics,
      lastSpoke: agentMessages[agentMessages.length - 1]?.timestamp,
      memoryItems
    };
  }

  /**
   * Extract key topics from messages
   */
  extractKeyTopics(msgs) {
    const text = msgs.map(m => m.content || '').join(' ').toLowerCase();
    const topics = [];

    const keywords = [
      'strategy', 'marketing', 'budget', 'timeline', 'design', 'user', 'customer',
      'product', 'feature', 'launch', 'brand', 'creative', 'data', 'analysis',
      'growth', 'revenue', 'engagement', 'experience', 'innovation', 'technology'
    ];

    for (const keyword of keywords) {
      const count = (text.match(new RegExp(keyword, 'g')) || []).length;
      if (count >= 2) {
        topics.push({ word: keyword, count });
      }
    }

    return topics.sort((a, b) => b.count - a.count).slice(0, 8);
  }

  /**
   * Build memory items for context visualization
   */
  buildMemoryItems(agent) {
    const items = [];

    items.push({
      type: 'system',
      label: 'Character Bio & Instructions',
      content: agent.bio?.slice(0, 300) + '...',
      tokens: countTokens(agent.bio || '') + 500,
      priority: 'permanent'
    });

    items.push({
      type: 'goal',
      label: 'Session Goal',
      content: this.goal || 'Not set',
      tokens: countTokens(this.goal || ''),
      priority: 'permanent'
    });

    const recentMsgs = this.messages.slice(-15);
    items.push({
      type: 'conversation',
      label: `Recent Conversation (${recentMsgs.length} messages)`,
      content: recentMsgs.map(m => `${m.agentName}: ${m.content?.slice(0, 50)}...`).join('\n'),
      tokens: recentMsgs.reduce((sum, m) => sum + (m.tokenCount || 0), 0),
      priority: 'active'
    });

    const imagesInConvo = this.messages.filter(m => m.images?.length > 0);
    if (imagesInConvo.length > 0) {
      items.push({
        type: 'images',
        label: `Generated Images (${imagesInConvo.reduce((sum, m) => sum + m.images.length, 0)} total)`,
        content: 'Image metadata and prompts are included in context',
        tokens: imagesInConvo.length * 100,
        priority: 'reference'
      });
    }

    const toolResults = this.messages.filter(m => m.toolResults?.length > 0);
    if (toolResults.length > 0) {
      items.push({
        type: 'tools',
        label: `Research & Search Results (${toolResults.length} uses)`,
        content: 'Web search and URL analysis results',
        tokens: toolResults.length * 200,
        priority: 'reference'
      });
    }

    return items;
  }

  /**
   * Get consensus detection settings
   */
  getConsensusSettings() {
    return { ...this.consensusSettings };
  }

  /**
   * Update consensus detection settings
   */
  updateConsensusSettings(settings) {
    if (settings.enabled !== undefined) {
      this.consensusSettings.enabled = !!settings.enabled;
    }
    if (settings.sensitivity && ['low', 'medium', 'high', 'manual'].includes(settings.sensitivity)) {
      this.consensusSettings.sensitivity = settings.sensitivity;
    }
    if (settings.requireExplicitMarker !== undefined) {
      this.consensusSettings.requireExplicitMarker = !!settings.requireExplicitMarker;
    }
    if (settings.minSignoffCount !== undefined && typeof settings.minSignoffCount === 'number') {
      this.consensusSettings.minSignoffCount = Math.max(2, Math.min(settings.minSignoffCount, 10));
    }
    if (Array.isArray(settings.customPhrases)) {
      this.consensusSettings.customPhrases = settings.customPhrases.map(p => String(p).toLowerCase());
    }
    return this.consensusSettings;
  }

  /**
   * Add an agent to the chat room
   */
  addAgent(name, bio) {
    const agent = {
      id: uuidv4(),
      name,
      bio,
      color: this.generateColor(this.agents.length)
    };
    this.agents.push(agent);
    return agent;
  }

  /**
   * Remove an agent
   */
  removeAgent(agentId) {
    this.agents = this.agents.filter(a => a.id !== agentId);
  }

  /**
   * Get all agents
   */
  getAgents() {
    return this.agents;
  }

  /**
   * Generate a color for an agent based on index
   */
  generateColor(index) {
    const colors = [
      '#FF6B6B', // Red
      '#4ECDC4', // Teal
      '#45B7D1', // Blue
      '#96CEB4', // Green
      '#FFEAA7', // Yellow
      '#DDA0DD', // Plum
      '#98D8C8', // Mint
      '#F7DC6F', // Gold
    ];
    return colors[index % colors.length];
  }

  /**
   * Register an SSE client for real-time updates
   */
  addClient(res) {
    this.sseClients.add(res);
    return () => this.sseClients.delete(res);
  }

  /**
   * Broadcast an event to all connected clients
   */
  broadcast(event, data) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      client.write(message);
    }
  }

  /**
   * Start the autonomous chat
   */
  async start(goal, tokenLimit = 100000) {
    if (this.isRunning) {
      throw new Error('Chat is already running');
    }
    if (this.agents.length < 2) {
      throw new Error('Need at least 2 agents to start a chat');
    }

    this.goal = goal;
    this.tokenLimit = tokenLimit;
    this.isRunning = true;
    this.isPaused = false;
    this.completionReason = null;
    this.messages = [];
    this.tokenCount = 0;
    this.turnCount = 0;
    this.lastSpeakerId = null;

    this.broadcast('session_start', {
      goal,
      tokenLimit,
      agents: this.agents.map(a => ({ id: a.id, name: a.name, color: a.color }))
    });

    // Start the conversation loop
    this.runConversationLoop();
  }

  /**
   * Stop the chat
   */
  stop(reason = 'user_stopped') {
    this.isRunning = false;
    this.completionReason = reason;
    this.broadcast('session_end', {
      reason,
      totalTokens: this.tokenCount,
      turnCount: this.turnCount,
      messages: this.messages.length
    });
  }

  /**
   * Pause the chat
   */
  pause() {
    this.isPaused = true;
    this.broadcast('session_paused', {});
  }

  /**
   * Resume the chat
   */
  resume() {
    if (this.isPaused) {
      this.isPaused = false;
      this.broadcast('session_resumed', {});
      this.runConversationLoop();
    }
  }

  /**
   * Inject a user message into the conversation
   */
  injectMessage(content, senderName = 'User') {
    const message = {
      id: uuidv4(),
      agentId: 'user',
      agentName: senderName,
      content,
      timestamp: new Date().toISOString(),
      isUser: true,
      tokenCount: countTokens(content)
    };

    this.messages.push(message);
    this.tokenCount += message.tokenCount;

    this.broadcast('message', message);

    // If paused, resume after injection
    if (this.isPaused && this.isRunning) {
      this.resume();
    }

    // If chat ended (not running but has messages and agents), restart the conversation
    // This allows continuing after consensus/completion
    if (!this.isRunning && this.messages.length > 0 && this.agents.length >= 2 && this.goal) {
      this.isRunning = true;
      this.isPaused = false;
      this.completionReason = null;
      this.broadcast('session_resumed', { continued: true });
      this.runConversationLoop();
    }

    return message;
  }

  /**
   * Set the speaking order mode
   */
  setSpeakingOrder(mode) {
    const validModes = ['dynamic', 'round-robin', 'priority', 'random'];
    if (validModes.includes(mode)) {
      this.speakingOrder = mode;
      this.broadcast('speaking_order_changed', { mode });
    }
  }

  /**
   * Set agent speaking priorities (for priority mode)
   * Higher priority = more likely to speak
   */
  setAgentPriority(agentId, priority) {
    this.speakingPriorities[agentId] = priority;
    this.broadcast('agent_priority_changed', { agentId, priority });
  }

  /**
   * Get the current speaking order settings
   */
  getSpeakingOrderSettings() {
    return {
      mode: this.speakingOrder,
      priorities: this.speakingPriorities
    };
  }

  /**
   * Select the next speaker based on conversation context and speaking order mode
   */
  selectNextSpeaker() {
    if (this.agents.length === 0) return null;

    // First turn: start with moderator if present, otherwise first agent (or highest priority in priority mode)
    if (this.messages.length === 0) {
      if (this.speakingOrder === 'priority') {
        return this.selectByPriority(this.agents);
      }
      const moderator = this.agents.find(a =>
        a.bio.toLowerCase().includes('moderator') ||
        a.bio.toLowerCase().includes('panel moderator')
      );
      return moderator || this.agents[0];
    }

    // Use different selection strategies based on speaking order mode
    switch (this.speakingOrder) {
      case 'round-robin':
        return this.selectRoundRobin();
      case 'priority':
        return this.selectByPriority();
      case 'random':
        return this.selectRandom();
      case 'dynamic':
      default:
        return this.selectDynamic();
    }
  }

  /**
   * Round-robin selection: agents take turns in a fixed order
   */
  selectRoundRobin() {
    const lastSpeakerIndex = this.agents.findIndex(a => a.id === this.lastSpeakerId);
    const nextIndex = (lastSpeakerIndex + 1) % this.agents.length;
    return this.agents[nextIndex];
  }

  /**
   * Priority-based selection: higher priority agents speak more often
   */
  selectByPriority(eligibleAgents = null) {
    const agents = eligibleAgents || this.agents.filter(a => a.id !== this.lastSpeakerId);
    if (agents.length === 0) return this.agents[0];

    // Get priorities for each agent (default to 1 if not set)
    const agentsWithPriority = agents.map(a => ({
      agent: a,
      priority: this.speakingPriorities[a.id] || 1
    }));

    // Sort by priority (descending) and pick with weighted randomness
    const totalPriority = agentsWithPriority.reduce((sum, a) => sum + a.priority, 0);
    let random = Math.random() * totalPriority;

    for (const { agent, priority } of agentsWithPriority) {
      random -= priority;
      if (random <= 0) return agent;
    }

    return agents[0];
  }

  /**
   * Random selection: pick any agent except the last speaker
   */
  selectRandom() {
    const eligible = this.agents.filter(a => a.id !== this.lastSpeakerId);
    if (eligible.length === 0) return this.agents[0];
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  /**
   * Dynamic selection: AI-driven based on conversation context (original logic)
   */
  selectDynamic() {
    const lastMessage = this.messages[this.messages.length - 1];

    // 1. Check for direct address (@AgentName or just their name)
    for (const agent of this.agents) {
      if (agent.id === this.lastSpeakerId) continue;

      const nameLower = agent.name.toLowerCase();
      const firstName = agent.name.split(' ')[0].toLowerCase();
      const contentLower = lastMessage.content.toLowerCase();

      if (
        contentLower.includes(`@${nameLower}`) ||
        contentLower.includes(`@${firstName}`) ||
        // Check for direct address patterns
        contentLower.includes(`${firstName},`) ||
        contentLower.includes(`${firstName}?`) ||
        contentLower.includes(`what do you think, ${firstName}`) ||
        contentLower.includes(`${firstName}, what`)
      ) {
        return agent;
      }
    }

    // 2. Moderator should speak every 3-4 turns to keep things on track
    const moderator = this.agents.find(a =>
      a.bio.toLowerCase().includes('moderator') ||
      a.bio.toLowerCase().includes('panel moderator')
    );

    if (moderator && moderator.id !== this.lastSpeakerId) {
      const turnsSinceModerator = this.countTurnsSince(moderator.id);
      if (turnsSinceModerator >= 3) {
        return moderator;
      }
    }

    // 3. Match expertise to context
    const expertMatch = this.findExpertForContext(lastMessage.content);
    if (expertMatch && expertMatch.id !== this.lastSpeakerId) {
      return expertMatch;
    }

    // 4. Weighted random (excluding last speaker)
    const eligible = this.agents.filter(a => a.id !== this.lastSpeakerId);
    if (eligible.length === 0) return this.agents[0];

    // Weighted random: slightly prefer those who haven't spoken recently
    const recentSpeakers = new Set(
      this.messages.slice(-5).map(m => m.agentId)
    );

    const weights = eligible.map(a => recentSpeakers.has(a.id) ? 1 : 2);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < eligible.length; i++) {
      random -= weights[i];
      if (random <= 0) return eligible[i];
    }

    return eligible[0];
  }

  /**
   * Count turns since an agent last spoke
   */
  countTurnsSince(agentId) {
    let count = 0;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].agentId === agentId) break;
      count++;
    }
    return count;
  }

  /**
   * Find an expert agent based on content keywords
   */
  findExpertForContext(content) {
    const contentLower = content.toLowerCase();

    const expertiseMap = [
      { keywords: ['technical', 'architecture', 'ai', 'ml', 'code', 'software', 'scalable', 'api', 'infrastructure'], expertise: ['tech', 'technical', 'ph.d', 'mit', 'engineering', 'ai/ml'] },
      { keywords: ['market', 'customer', 'brand', 'marketing', 'growth', 'acquisition', 'audience', 'positioning'], expertise: ['marketing', 'brand', 'consumer', 'growth'] },
      { keywords: ['revenue', 'profit', 'cost', 'financial', 'pricing', 'unit economics', 'margin', 'investment', 'valuation'], expertise: ['finance', 'financial', 'mba', 'investment', 'economics'] },
      { keywords: ['operations', 'supply chain', 'manufacturing', 'logistics', 'team', 'hiring', 'scaling', 'execution'], expertise: ['operations', 'executive', 'ceo', 'supply chain', 'manufacturing'] },
      { keywords: ['impact', 'ethical', 'vision', 'transform', 'disrupt', 'society', 'sustainable', 'future'], expertise: ['visionary', 'ethical', 'impact', 'sustainable', 'disrupt'] },
    ];

    for (const mapping of expertiseMap) {
      const hasKeyword = mapping.keywords.some(k => contentLower.includes(k));
      if (hasKeyword) {
        const expert = this.agents.find(a =>
          mapping.expertise.some(e => a.bio.toLowerCase().includes(e)) &&
          a.id !== this.lastSpeakerId
        );
        if (expert) return expert;
      }
    }

    return null;
  }

  /**
   * Check if the conversation has reached consensus or completion
   */
  checkForCompletion(content) {
    // If consensus detection is disabled or set to manual, never auto-detect
    if (!this.consensusSettings.enabled || this.consensusSettings.sensitivity === 'manual') {
      return null;
    }

    const contentLower = content.toLowerCase();

    // Explicit consensus marker (always checked regardless of sensitivity)
    if (content.includes('[CONSENSUS REACHED]') || contentLower.includes('[consensus reached]')) {
      return 'consensus_reached';
    }

    // If require explicit marker is set, only the above check applies
    if (this.consensusSettings.requireExplicitMarker) {
      return null;
    }

    // Low sensitivity: only explicit marker (already handled above)
    if (this.consensusSettings.sensitivity === 'low') {
      return null;
    }

    // Check for consensus/completion phrases (medium and high sensitivity)
    const completionPhrases = [
      'we have consensus',
      'consensus reached',
      'brief is complete',
      'final document',
      'that\'s a wrap',
      'session complete',
      'we\'re aligned',
      'unanimous agreement',
      'brief and deck are locked',
      'goal has been achieved',
      'mission accomplished',
      'we\'ve accomplished our goal',
      // Add custom phrases
      ...this.consensusSettings.customPhrases
    ];

    for (const phrase of completionPhrases) {
      if (contentLower.includes(phrase)) {
        return 'consensus_reached';
      }
    }

    // High sensitivity: also check for sign-off patterns
    if (this.consensusSettings.sensitivity === 'high') {
      if (this.isConversationWindingDown(contentLower)) {
        return 'conversation_concluded';
      }
    }

    return null;
  }

  /**
   * Detect if multiple agents are saying goodbye/signing off
   */
  isConversationWindingDown(currentContent) {
    const signoffPhrases = [
      'signing off',
      'great session',
      'wonderful discussion',
      'look forward to',
      'until next time',
      'thanks everyone',
      'thank you all',
      'farewell',
      'take care',
      'good work today',
      'great work everyone',
      'excellent session',
      'that concludes',
      'wrapping up',
      'to wrap up',
      'in conclusion',
      'to conclude'
    ];

    // Check if current message has signoff language
    const currentHasSignoff = signoffPhrases.some(p => currentContent.includes(p));

    if (!currentHasSignoff) return false;

    // Count how many of the last few messages also have signoff language
    const recentMessages = this.messages.slice(-4);
    let signoffCount = 0;

    for (const msg of recentMessages) {
      const msgLower = msg.content?.toLowerCase() || '';
      if (signoffPhrases.some(p => msgLower.includes(p))) {
        signoffCount++;
      }
    }

    // Use the configurable minimum signoff count
    const minSignoffs = this.consensusSettings.minSignoffCount || 2;
    return signoffCount >= minSignoffs;
  }

  /**
   * Main conversation loop
   */
  async runConversationLoop() {
    while (this.isRunning && !this.isPaused) {
      // Check token limit
      if (this.tokenCount >= this.tokenLimit) {
        this.stop('token_limit_reached');
        break;
      }

      // Select next speaker
      const speaker = this.selectNextSpeaker();
      if (!speaker) {
        this.stop('no_agents');
        break;
      }

      this.turnCount++;

      // Broadcast that agent is starting
      this.broadcast('agent_start', {
        agentId: speaker.id,
        agentName: speaker.name,
        turnNumber: this.turnCount
      });

      try {
        // Generate response with streaming
        let fullResponse = '';
        let responseTokens = 0;

        const generator = generateAgentResponse(
          speaker,
          this.agents,
          this.messages,
          this.goal,
          this.sessionMedia
        );

        for await (const event of generator) {
          if (!this.isRunning || this.isPaused) break;

          if (event.type === 'chunk') {
            fullResponse += event.text;
            this.broadcast('chunk', {
              agentId: speaker.id,
              text: event.text
            });
          } else if (event.type === 'complete') {
            // Use cleaned response from completion event
            // But fall back to accumulated chunks if cleaned response is empty
            const cleanedResponse = event.fullResponse;
            if (cleanedResponse && cleanedResponse.trim().length > 0) {
              fullResponse = cleanedResponse;
            }
            // If cleanedResponse is empty but we have chunks, keep the accumulated chunks
            responseTokens = event.tokenCount;
            if (event.wasTruncated) {
              console.log(`[Orchestrator] ${speaker.name}'s response was auto-continued after truncation`);
            }
          } else if (event.type === 'error') {
            this.broadcast('error', {
              agentId: speaker.id,
              error: event.error
            });
            // Continue to next turn despite error
            break;
          }
        }

        if (!this.isRunning || this.isPaused) break;

        // Check for image generation requests in the response
        const imageRequests = parseImageRequests(fullResponse);
        const remixRequests = parseRemixRequests(fullResponse);
        const images = [];

        // Process standard image generation requests
        if (imageRequests.length > 0) {
          for (const request of imageRequests) {
            try {
              this.broadcast('image_generating', {
                agentId: speaker.id,
                prompt: request.prompt
              });

              const imageResult = await generateImage(request.prompt);
              const imageId = uuidv4();

              const imageItem = {
                id: imageId,
                prompt: request.prompt,
                imageData: imageResult.imageData,
                mimeType: imageResult.mimeType,
                caption: imageResult.text || request.prompt
              };

              images.push(imageItem);

              // Store in media store for later retrieval/export
              mediaStore.add({
                id: imageId,
                type: 'image',
                data: imageResult.imageData,
                mimeType: imageResult.mimeType,
                prompt: request.prompt,
                agentId: speaker.id,
                agentName: speaker.name
              });

              this.broadcast('image_generated', {
                agentId: speaker.id,
                imageId: imageId,
                prompt: request.prompt
              });
            } catch (imgError) {
              console.error('Image generation failed:', imgError);
              this.broadcast('image_error', {
                agentId: speaker.id,
                prompt: request.prompt,
                error: imgError.message
              });
            }
          }
        }

        // Process remix/iterate requests (uses reference images)
        if (remixRequests.length > 0) {
          for (const request of remixRequests) {
            try {
              // Get the reference image from media store
              const referenceMedia = mediaStore.get(request.referenceImageId);

              if (!referenceMedia) {
                console.warn(`Reference image ${request.referenceImageId} not found`);
                this.broadcast('image_error', {
                  agentId: speaker.id,
                  prompt: request.prompt,
                  error: `Reference image not found: ${request.referenceImageId}`
                });
                continue;
              }

              this.broadcast('image_generating', {
                agentId: speaker.id,
                prompt: request.prompt,
                isRemix: true,
                referenceId: request.referenceImageId
              });

              const imageResult = await generateImageWithReferences(
                request.prompt,
                [{ imageData: referenceMedia.data, mimeType: referenceMedia.mimeType }]
              );

              const imageId = uuidv4();

              const imageItem = {
                id: imageId,
                prompt: request.prompt,
                imageData: imageResult.imageData,
                mimeType: imageResult.mimeType,
                caption: imageResult.text || request.prompt,
                referenceId: request.referenceImageId
              };

              images.push(imageItem);

              // Store in media store
              mediaStore.add({
                id: imageId,
                type: 'image',
                data: imageResult.imageData,
                mimeType: imageResult.mimeType,
                prompt: request.prompt,
                agentId: speaker.id,
                agentName: speaker.name,
                referenceIds: [request.referenceImageId]
              });

              this.broadcast('image_generated', {
                agentId: speaker.id,
                imageId: imageId,
                prompt: request.prompt,
                isRemix: true,
                referenceId: request.referenceImageId
              });
            } catch (imgError) {
              console.error('Image remix failed:', imgError);
              this.broadcast('image_error', {
                agentId: speaker.id,
                prompt: request.prompt,
                error: imgError.message
              });
            }
          }
        }

        // Strip image tags from the text response
        if (imageRequests.length > 0 || remixRequests.length > 0) {
          fullResponse = stripImageTags(fullResponse);
        }

        // Check for tool requests (web search, URL analysis, research)
        const toolRequests = parseToolRequests(fullResponse);
        let toolResults = [];

        if (toolRequests.length > 0) {
          // Process tool requests
          for (const request of toolRequests) {
            try {
              this.broadcast('tool_executing', {
                agentId: speaker.id,
                type: request.type,
                query: request.query || request.url
              });
            } catch (e) {
              // Ignore broadcast errors
            }
          }

          // Execute all tool requests
          try {
            const rawResults = await executeToolRequests(toolRequests);
            toolResults = formatToolResults(rawResults);

            // Broadcast tool results
            for (const result of toolResults) {
              this.broadcast('tool_result', {
                agentId: speaker.id,
                result
              });
            }
          } catch (toolError) {
            console.error('Tool execution failed:', toolError);
            this.broadcast('tool_error', {
              agentId: speaker.id,
              error: toolError.message
            });
          }

          // Strip tool tags from the text response
          fullResponse = stripToolTags(fullResponse);
        }

        // Check for Synthograsizer tool requests (SYNTH_* tags)
        const synthRequests = parseSynthRequests(fullResponse);
        const synthMedia = []; // { id, type, data, mimeType, prompt }
        let synthResults = [];

        if (synthRequests.length > 0) {
          // Broadcast generating status for each request
          for (const req of synthRequests) {
            this.broadcast('synth_executing', {
              agentId: speaker.id,
              synthType: req.type,
              prompt: req.parsed?._primary || ''
            });
          }

          try {
            // mediaStore.get lets agents reference images/videos by ID
            const rawSynthResults = await executeSynthRequests(
              synthRequests,
              (id) => mediaStore.get(id)
            );
            synthResults = formatSynthResults(rawSynthResults);

            // Store any returned media and broadcast results
            for (let i = 0; i < rawSynthResults.length; i++) {
              const raw = rawSynthResults[i];
              const formatted = synthResults[i];

              if (raw.error) {
                this.broadcast('synth_error', {
                  agentId: speaker.id,
                  synthType: raw.type,
                  error: raw.error
                });
                continue;
              }

              // Handle image results (generate/transform)
              if (raw.image) {
                const mediaId = uuidv4();
                const mimeType = 'image/png';
                mediaStore.add({
                  id: mediaId,
                  type: 'image',
                  data: raw.image,
                  mimeType,
                  prompt: raw.prompt || raw.intent || '',
                  agentId: speaker.id,
                  agentName: speaker.name
                });
                synthMedia.push({ id: mediaId, type: 'image', mimeType, prompt: raw.prompt || raw.intent || '' });
                this.broadcast('synth_media', {
                  agentId: speaker.id,
                  mediaId,
                  mediaType: 'image',
                  synthType: raw.type,
                  prompt: raw.prompt || raw.intent || ''
                });
              }

              // Handle video results
              if (raw.video) {
                const mediaId = uuidv4();
                const mimeType = 'video/mp4';
                mediaStore.add({
                  id: mediaId,
                  type: 'video',
                  data: raw.video,
                  mimeType,
                  prompt: raw.prompt || '',
                  agentId: speaker.id,
                  agentName: speaker.name
                });
                synthMedia.push({ id: mediaId, type: 'video', mimeType, prompt: raw.prompt || '' });
                this.broadcast('synth_media', {
                  agentId: speaker.id,
                  mediaId,
                  mediaType: 'video',
                  synthType: raw.type,
                  prompt: raw.prompt || ''
                });
              }

              // Broadcast non-media results (template, narrative, analysis)
              if (!raw.image && !raw.video) {
                this.broadcast('synth_result', {
                  agentId: speaker.id,
                  result: formatted
                });
              }
            }
          } catch (synthError) {
            console.error('Synth execution failed:', synthError);
            this.broadcast('synth_error', {
              agentId: speaker.id,
              error: synthError.message
            });
          }

          // Strip SYNTH_* tags from the text response
          fullResponse = stripSynthTags(fullResponse);
        }

        // Check for Workflow tool requests (WORKFLOW / WORKFLOW_STATUS / WORKFLOW_CANCEL tags)
        const workflowRequests = parseWorkflowRequests(fullResponse);
        const workflowIds = []; // ids of newly submitted workflows

        if (workflowRequests.length > 0) {
          for (const req of workflowRequests) {
            if (req.type === 'workflow') {
              // Submit the workflow — execution runs in the background
              const wfId = workflowEngine.submit(req.definition, {
                broadcast: this.broadcast.bind(this),
                agentId: speaker.id,
                agentName: speaker.name,
              });
              workflowIds.push(wfId);
              this.broadcast('workflow_submitted', {
                agentId: speaker.id,
                workflowId: wfId,
                workflowName: req.definition.name || 'Unnamed Workflow',
                stepCount: (req.definition.steps || []).length,
                steps: (req.definition.steps || []).map(s => ({ id: s.id, type: s.type })),
              });
            } else if (req.type === 'workflow_status') {
              const status = workflowEngine.getStatus(req.workflowId);
              this.broadcast('workflow_status', {
                agentId: speaker.id,
                workflowId: req.workflowId,
                status: status || { error: 'Workflow not found' },
              });
            } else if (req.type === 'workflow_cancel') {
              const cancelled = workflowEngine.cancel(req.workflowId);
              this.broadcast('workflow_cancel_result', {
                agentId: speaker.id,
                workflowId: req.workflowId,
                success: cancelled,
              });
            } else if (req.type === 'workflow_parse_error') {
              this.broadcast('workflow_error', {
                agentId: speaker.id,
                error: req.error,
              });
            }
          }

          // Strip workflow tags from the text response
          fullResponse = stripWorkflowTags(fullResponse);
        }

        // Check for SYNTH_STYLE tags (style preset image generation)
        const styleRequests = parseSynthStyleRequests(fullResponse);
        if (styleRequests.length > 0) {
          for (const req of styleRequests) {
            if (req.error) {
              this.broadcast('synth_error', {
                agentId: speaker.id,
                synthType: 'synth_style',
                error: req.error,
              });
              continue;
            }

            this.broadcast('synth_executing', {
              agentId: speaker.id,
              synthType: 'synth_style',
              prompt: `${req.subject} in ${req.presetName} style`,
            });

            try {
              const result = await synthClient.generateImage(req.applied.prompt, {
                negative_prompt: req.applied.negative_prompt,
                aspect_ratio: req.applied.aspect_ratio,
              });

              if (result.image) {
                const mediaId = uuidv4();
                mediaStore.add({
                  id: mediaId,
                  type: 'image',
                  data: result.image,
                  mimeType: 'image/png',
                  prompt: req.applied.prompt,
                  agentId: speaker.id,
                  agentName: speaker.name,
                });
                synthMedia.push({ id: mediaId, type: 'image', mimeType: 'image/png', prompt: req.applied.prompt });
                this.broadcast('synth_media', {
                  agentId: speaker.id,
                  mediaId,
                  mediaType: 'image',
                  synthType: 'synth_style',
                  prompt: `${req.subject} — ${req.presetName}`,
                  stylePreset: req.styleId,
                });
              }
            } catch (err) {
              this.broadcast('synth_error', {
                agentId: speaker.id,
                synthType: 'synth_style',
                error: err.message,
              });
            }
          }
        }

        // Check for WORKFLOW_TEMPLATE tags (named workflow templates)
        const templateRequests = parseWorkflowTemplateRequests(fullResponse);
        if (templateRequests.length > 0) {
          for (const req of templateRequests) {
            if (req.error) {
              this.broadcast('workflow_error', {
                agentId: speaker.id,
                error: `Template "${req.templateId}": ${req.error}`,
              });
              continue;
            }

            const wfId = workflowEngine.submit(req.definition, {
              broadcast: this.broadcast.bind(this),
              agentId: speaker.id,
              agentName: speaker.name,
            });
            workflowIds.push(wfId);
            this.broadcast('workflow_submitted', {
              agentId: speaker.id,
              workflowId: wfId,
              workflowName: req.definition.name,
              templateId: req.templateId,
              stepCount: (req.definition.steps || []).length,
              steps: (req.definition.steps || []).map(s => ({ id: s.id, type: s.type })),
            });
          }
        }

        // Strip style and template tags from the text response
        if (styleRequests.length > 0 || templateRequests.length > 0) {
          fullResponse = stripStyleAndTemplateTags(fullResponse);
        }

        // ── Artifact tags ──────────────────────────────────────────────────
        const artifactUpdates = parseArtifactTags(fullResponse);
        for (const { filename, content: artContent } of artifactUpdates) {
          const artifact = artifactStore.save(filename, artContent, speaker.id, speaker.name);
          this.broadcast('artifact_update', {
            filename:     artifact.filename,
            language:     artifact.language,
            content:      artifact.content,
            version:      artifact.versions.length,
            lastEditBy:   artifact.lastEditBy,
            agentId:      speaker.id,
          });
        }
        if (artifactUpdates.length > 0) {
          fullResponse = stripArtifactTags(fullResponse);
        }

        // Detect artifact hallucination (agent claims code changes without tags)
        const artifactHallucinationNote = detectArtifactHallucination(
          fullResponse, artifactUpdates.length > 0
        );

        // Skip empty responses (no text, no images, no tool results, no synth, no workflows)
        const hasContent = fullResponse && fullResponse.trim().length > 0;
        const hasImages = images.length > 0;
        const hasToolResults = toolResults.length > 0;
        const hasSynthMedia = synthMedia.length > 0;
        const hasSynthResults = synthResults.length > 0;
        const hasWorkflows = workflowIds.length > 0;
        const hasArtifacts = artifactUpdates.length > 0;

        if (!hasContent && !hasImages && !hasToolResults && !hasSynthMedia && !hasSynthResults && !hasWorkflows && !hasArtifacts) {
          console.warn(`Empty response from ${speaker.name}, skipping turn`);
          await this.delay(500);
          continue;
        }

        // Create and store the message
        const message = {
          id: uuidv4(),
          agentId: speaker.id,
          agentName: speaker.name,
          color: speaker.color,
          content: fullResponse || '',
          images: hasImages ? images : undefined,
          toolResults: hasToolResults ? toolResults : undefined,
          synthMedia: hasSynthMedia ? synthMedia : undefined,
          synthResults: hasSynthResults ? synthResults : undefined,
          workflowIds: hasWorkflows ? workflowIds : undefined,
          artifactHallucination: artifactHallucinationNote || undefined,
          timestamp: new Date().toISOString(),
          isUser: false,
          tokenCount: responseTokens
        };

        this.messages.push(message);
        this.tokenCount += responseTokens;
        this.lastSpeakerId = speaker.id;

        // Broadcast completion
        this.broadcast('agent_complete', {
          agentId: speaker.id,
          message,
          totalTokens: this.tokenCount,
          turnCount: this.turnCount
        });

        // Check for consensus/completion
        const completionReason = this.checkForCompletion(fullResponse);
        if (completionReason) {
          this.stop(completionReason);
          break;
        }

        // Small delay between turns for readability
        await this.delay(1500);

      } catch (error) {
        console.error('Error in conversation loop:', error);
        this.broadcast('error', {
          agentId: speaker.id,
          error: error.message
        });
        // Continue despite errors
        await this.delay(2000);
      }
    }
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current state
   */
  getState() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      goal: this.goal,
      tokenLimit: this.tokenLimit,
      tokenCount: this.tokenCount,
      turnCount: this.turnCount,
      messageCount: this.messages.length,
      agents: this.agents, // Include full agent data with bios
      completionReason: this.completionReason,
      speakingOrder: this.speakingOrder,
      speakingPriorities: this.speakingPriorities,
      sessionMedia: this.sessionMedia.map(m => ({
        id: m.id,
        name: m.name,
        mimeType: m.mimeType,
        size: m.data?.length || 0, // base64 length as proxy for size
      })),
      branchPoints: this.branchPoints.map(b => ({
        id: b.id,
        name: b.name,
        messageIndex: b.messageIndex,
        createdAt: b.createdAt
      })),
      currentBranchId: this.currentBranchId
    };
  }

  /**
   * Get message history
   */
  getHistory() {
    return this.messages;
  }

  // ==================== BRANCHING SUPPORT ====================

  /**
   * Create a branch point (save current state for later exploration)
   */
  createBranchPoint(name = null) {
    const branchId = uuidv4();
    const branchName = name || `Branch at message ${this.messages.length}`;

    const branchPoint = {
      id: branchId,
      name: branchName,
      messageIndex: this.messages.length,
      createdAt: new Date().toISOString(),
      // Deep copy the current state
      state: {
        messages: JSON.parse(JSON.stringify(this.messages)),
        tokenCount: this.tokenCount,
        turnCount: this.turnCount,
        lastSpeakerId: this.lastSpeakerId,
        goal: this.goal,
        agents: JSON.parse(JSON.stringify(this.agents)),
        speakingOrder: this.speakingOrder,
        speakingPriorities: { ...this.speakingPriorities }
      }
    };

    this.branchPoints.push(branchPoint);
    this.broadcast('branch_created', {
      id: branchId,
      name: branchName,
      messageIndex: branchPoint.messageIndex
    });

    return branchPoint;
  }

  /**
   * List all branch points
   */
  getBranchPoints() {
    return this.branchPoints.map(b => ({
      id: b.id,
      name: b.name,
      messageIndex: b.messageIndex,
      createdAt: b.createdAt,
      messageCount: b.state.messages.length
    }));
  }

  /**
   * Restore a branch point (go back to that state and continue from there)
   */
  restoreBranch(branchId) {
    const branch = this.branchPoints.find(b => b.id === branchId);
    if (!branch) {
      throw new Error(`Branch point ${branchId} not found`);
    }

    // Stop current conversation if running
    const wasRunning = this.isRunning;
    if (wasRunning) {
      this.isRunning = false;
    }

    // Restore state from branch
    this.messages = JSON.parse(JSON.stringify(branch.state.messages));
    this.tokenCount = branch.state.tokenCount;
    this.turnCount = branch.state.turnCount;
    this.lastSpeakerId = branch.state.lastSpeakerId;
    this.goal = branch.state.goal;
    this.agents = JSON.parse(JSON.stringify(branch.state.agents));
    this.speakingOrder = branch.state.speakingOrder;
    this.speakingPriorities = { ...branch.state.speakingPriorities };
    this.currentBranchId = branchId;

    this.broadcast('branch_restored', {
      id: branchId,
      name: branch.name,
      messageCount: this.messages.length
    });

    return {
      id: branchId,
      name: branch.name,
      messages: this.messages,
      tokenCount: this.tokenCount
    };
  }

  /**
   * Delete a branch point
   */
  deleteBranch(branchId) {
    const index = this.branchPoints.findIndex(b => b.id === branchId);
    if (index === -1) {
      throw new Error(`Branch point ${branchId} not found`);
    }

    this.branchPoints.splice(index, 1);
    this.broadcast('branch_deleted', { id: branchId });

    return true;
  }

  /**
   * Rename a branch point
   */
  renameBranch(branchId, newName) {
    const branch = this.branchPoints.find(b => b.id === branchId);
    if (!branch) {
      throw new Error(`Branch point ${branchId} not found`);
    }

    branch.name = newName;
    this.broadcast('branch_renamed', { id: branchId, name: newName });

    return branch;
  }

  /**
   * Rewind conversation to a specific message index
   * Useful for "what if we went differently from here?"
   */
  rewindToMessage(messageIndex) {
    if (messageIndex < 0 || messageIndex > this.messages.length) {
      throw new Error(`Invalid message index: ${messageIndex}`);
    }

    // Stop current conversation if running
    if (this.isRunning) {
      this.isRunning = false;
    }

    // Trim messages
    const removedMessages = this.messages.splice(messageIndex);

    // Recalculate token count
    this.tokenCount = this.messages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
    this.turnCount = this.messages.filter(m => !m.isUser).length;

    // Update last speaker
    if (this.messages.length > 0) {
      this.lastSpeakerId = this.messages[this.messages.length - 1].agentId;
    } else {
      this.lastSpeakerId = null;
    }

    this.broadcast('conversation_rewound', {
      toIndex: messageIndex,
      removedCount: removedMessages.length,
      newMessageCount: this.messages.length
    });

    return {
      messageIndex,
      removedCount: removedMessages.length,
      messages: this.messages
    };
  }
}

// ─── Artifact hallucination detection ─────────────────────────────────────

/**
 * Detect when an agent claims to have written/updated code but didn't use
 * [ARTIFACT:] tags.  Returns a short correction string or null.
 */
const CODE_CLAIM_RE = /\b(here'?s?\s+(the\s+)?(updated|new|revised|modified|complete|full)\s+(code|sketch|file|html|script|game|artifact)|(i'?ve|i have|i just)\s+(updated|created|added|modified|written|built|refactored|revised)\s+(the\s+)?(code|sketch|file|artifact|game|html|function|class)|(let me (update|create|write|add)|updating the artifact|pushing.*changes|here are the changes))/i;

function detectArtifactHallucination(responseText, hadArtifactTags) {
  if (hadArtifactTags) return null;              // actually used tags — all good
  if (!responseText) return null;
  if (!CODE_CLAIM_RE.test(responseText)) return null; // no claim detected
  return '[SYSTEM NOTE: The previous message described code changes but did NOT use [ARTIFACT:] tags, so nothing was actually saved. If you want to build on their idea, YOU must output the full code inside [ARTIFACT: filename.ext]...[/ARTIFACT] tags.]';
}

// ─── Artifact tag parsers ──────────────────────────────────────────────────

const ARTIFACT_TAG_RE = /\[ARTIFACT:\s*([^\]]+)\]([\s\S]*?)\[\/ARTIFACT\]/g;

function parseArtifactTags(text) {
  const results = [];
  let m;
  while ((m = ARTIFACT_TAG_RE.exec(text)) !== null) {
    results.push({ filename: m[1].trim(), content: m[2].trim() });
  }
  ARTIFACT_TAG_RE.lastIndex = 0;
  return results;
}

function stripArtifactTags(text) {
  const stripped = text.replace(ARTIFACT_TAG_RE, '').trim();
  ARTIFACT_TAG_RE.lastIndex = 0;
  return stripped;
}

// Export singleton instance
export const orchestrator = new ChatOrchestrator();
