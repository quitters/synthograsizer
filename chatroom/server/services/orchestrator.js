import { v4 as uuidv4 } from 'uuid';
const VISION_WINDOW = 5; // max recent generated images passed as inlineData to models
// Tools whose requests go to the image model; once the model service declines one, they stay closed for the rest of the turn
const MEDIA_TOOLS = new Set(['generate_image', 'compose_image']);
import { generateAgentResponse, generateText } from './gemini.js';
import { createStreamTagFilter } from './streamTagFilter.js';
import { foldIntoSummary, needsRefresh, agedRange, summaryIsValid, MAX_FOLD_MESSAGES } from './summarizer.js';
import { generateImage, generateImageWithReferences, parseImageRequests, parseRemixRequests, stripImageTags } from './imageGen.js';
import { parseToolRequests, executeToolRequests, stripToolTags, formatToolResults, parseSynthRequests, executeSynthRequests, stripSynthTags, formatSynthResults, parseWorkflowRequests, stripWorkflowTags, workflowEngine, parseSynthStyleRequests, parseWorkflowTemplateRequests, stripStyleAndTemplateTags } from './tools.js';
import { countTokens, countMessageTokens } from '../utils/tokenCounter.js';
import { DEFAULT_AGENT_MODEL, normalizeThinkingLevel, isKnownAgentModel } from '../config/models.js';
import { isFunctionCallingEnabled, isKnownToolTier, DEFAULT_TOOL_TIER } from '../config/tools.js';
import { isStatefulEnabled } from '../config/session.js';
import {
  isFileSearchEnabled, shouldIndex, isCrossSessionMemoryEnabled, MIN_MESSAGES_TO_ARCHIVE,
} from '../config/fileSearch.js';
import {
  isSmartOrchestrationEnabled, SPEAKER_CONFIDENCE_FLOOR, CONSENSUS_CONFIDENCE_FLOOR,
} from '../config/orchestration.js';
import { selectSpeaker, assessCompletion, createJudgeUsage, critiqueImage } from './judge.js';
import { readShownImage, MAX_SHOWN_IMAGES, describeScore, parseRoomRequests, stripRoomTags, drawValues, fillTemplate, classifyArtifact } from './roomTools.js';
import { isKnownVoice, defaultVoiceForIndex } from '../config/voices.js';
import { isDeepResearchEnabled, MAX_TASKS_PER_SESSION, ESTIMATED_COST_USD } from '../config/research.js';
import { submitResearch, pollToCompletion } from './deepResearch.js';
import { deleteInteractions } from './gemini.js';
import {
  createSessionStore, indexMedia, destroySessionStore, fileSearchTool,
  archiveSession, getOrCreateMemoryStore,
} from './fileSearch.js';
import { buildToolsForAgent } from './toolDefinitions.js';
import { createToolDispatcher } from './toolDispatch.js';
import { mediaStore as defaultMediaStore } from './mediaStore.js';
import { artifactStore as defaultArtifactStore } from './artifactStore.js';
import { synthClient, traceStore, keepAwake } from 'workflow-engine';
import { evaluate as evaluateDoneWhen, describeCriterion, describeResult, criteriaToText, normalizeCriteria } from './doneWhen.js';
import { PolicyError } from '../company/errors.js';
import { textCostUsd, toolCostUsd } from '../company/spend.js';
import { looksLikeSafetyBlock } from '../company/refusal.js';
import { describeFindings } from '../company/screen.js';

/**
 * Zeroed usage accumulator. Field names mirror the shape yielded by
 * gemini.js, which in turn mirrors `interaction.usage` minus the snake_case.
 */
function createEmptyUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    thoughtTokens: 0,
    cachedTokens: 0,
    toolUseTokens: 0,
    totalTokens: 0,
    /** Turns whose cost came from the API rather than the character estimate. */
    reportedTurns: 0,
    estimatedTurns: 0,
    /**
     * Billable Google Search queries. On Gemini 3.x grounding bills per query
     * the model executes, not per prompt, so one tool call can be several
     * billable units. Tokens alone will not show that, and an autonomous loop
     * with an unrestricted search tool is exactly where it runs away.
     */
    searchQueries: 0,
  };
}

/**
 * Chat Orchestrator
 * Manages the autonomous conversation between agents
 */
// A turn that fails (API error, empty reply) is retried with a growing pause; this
// many in a row stops the session instead of calling the API for ever. Errors that
// retrying cannot fix (a rejected key) stop it on the first one.
const MAX_CONSECUTIVE_FAILURES = 5;
const FATAL_ERROR_PATTERN = /API key not valid|API_KEY_INVALID|invalid api key|PERMISSION_DENIED|UNAUTHENTICATED/i;

/**
 * One chat room. The server keeps one per visitor (see sessionRegistry.js); the
 * exported `orchestrator` below is the default room, used by scripts and tests.
 */
export class ChatOrchestrator {
  /**
   * @param {{ ownerId?: string, mediaStore?: object, artifactStore?: object }} [options]
   *   ownerId tags this room's workflow traces and runs; the stores hold what its
   *   agents generate and write, so rooms never see each other's files.
   */
  constructor(options = {}) {
    this.ownerId = options.ownerId || null;
    this.mediaStore = options.mediaStore || defaultMediaStore;
    this.artifactStore = options.artifactStore || defaultArtifactStore;
    // A company's room carries a RoomPolicy (company/roomPolicy.js): the fixed layer, caps, least-privilege tools, the
    // independent screen. A room without one behaves exactly as it always has.
    this.policy = options.policy || null;
    // Whose long-term memory this room reads and writes (a company's rooms share the company's, and nobody else's).
    this.memoryOwnerId = options.memoryOwnerId || null;
    // Overridable so tests can drive the conversation loop without the network.
    this._generate = generateAgentResponse;
    // Overridable so tests can run the rolling summary without the network.
    this._summarize = generateText;
    // Things that want to see everything that happens in the room (the session archive): fn(event, data).
    // Like sseClients this is transport-level state that reset() leaves alone.
    this._observers = new Set();
    this._archiveId = null;
    // Overridable so tests can run the critic and the image draws without the network.
    this._critique = critiqueImage;
    this._draw = generateImage;
    this.reset();
  }

  reset() {
    // Stateful mode leaves conversation history on Google's side, so a reset
    // has to reach out and delete it — otherwise "reset" only clears the UI
    // while the transcript lives on for the retention window. Fire-and-forget:
    // a network failure must not block the reset itself.
    this._purgeStoredInteractions();
    this._destroyFileSearchStore();
    this.agents = [];
    this.messages = [];
    this.goal = '';
    this.tokenLimit = 100000;
    // tokenCount is the BUDGET counter: what the agents produced (real output
    // + thought tokens when the API reports them, character estimate when it
    // doesn't). It deliberately excludes input so the limit keeps its old
    // calibration — `usage` below is the honest full-cost picture.
    this.tokenCount = 0;
    this.usage = createEmptyUsage();
    this.turnCount = 0;
    this.isRunning = false;
    this.isPaused = false;
    this.lastSpeakerId = null;
    // Conversation mode:
    //   'group' — autonomous multi-agent loop (default)
    //   'solo'  — single agent, one reply per user inject (chat-with-agent UX)
    this.mode = 'group';
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
      customPhrases: [],
      // Cooldown (in turns) after a user message before consensus can fire
      userCooldownTurns: 2,
      // Sliding window (in turns) for collecting consensus votes
      voteWindowTurns: 4,
      // ── How a session ends, besides the vote ────────────────────────────────
      // 'lead' (the default): only the lead agent's own [CONSENSUS REACHED] or [END SESSION]
      //         ends it; everyone else's marker is a recommendation the lead sees. A vote is
      //         cheap to win: two agents echoing a third can close a room whose deliverable
      //         was never produced, and sessions were ending too early.
      // 'vote': a quorum of agents saying [CONSENSUS REACHED] ends it (the old behaviour,
      //         still available). Solo chats (one agent) always use it, since there is no one to vote.
      closeBy: 'lead',
      // The lead's name ('' = the first agent that can speak). An unknown name falls
      // back to the vote rather than leaving a room nobody can end.
      leadAgent: '',
      // No consensus or lead close before this many turns have been taken (0 = no floor)
      minTurns: 0,
      // End the session after this many turns, whatever else has happened (0 = no limit).
      // The agents are warned in the last round so the work is finished, not cut off.
      maxTurns: 0
    };
    // Turn count at which the current run began (a restart after the session ended
    // starts a new segment, so a turn limit gives it a fresh allowance)
    this.segmentStartTurn = 0;
    // Track consensus votes: { agentId, turn } per emission of [CONSENSUS REACHED]
    this.consensusVotes = [];
    // Turn count at which the last user message was injected (for cooldown)
    this.lastUserMessageTurn = -Infinity;
    // Pending workflow outcomes to surface to the next-speaking agent.
    // Each item: { workflowId, status, label, error, agentId, agentName }
    this.pendingWorkflowOutcomes = [];
    // Rolling window of recently generated images to pass as vision context
    this.recentGenImages = []; // [{ id, data, mimeType, prompt, agentName }]
    // Stateful mode (Phase 3): per-agent server-side conversation chains.
    //   agentChains[agentId]   → interaction id to continue from
    //   agentSeenUpTo[agentId] → index into this.messages of the first message
    //                            that agent has NOT yet been shown
    // Both are only populated when GEMINI_STORE_INTERACTIONS=true.
    this.agentChains = {};
    this.agentSeenUpTo = {};
    // File Search (Phase 4): one store per session, created lazily on the
    // first indexable upload. Null means "nothing indexed", which is the
    // normal state when FILE_SEARCH is off.
    this.fileSearchStoreName = null;
    // Long-term memory store, shared across sessions. Initialised once and
    // then deliberately left alone by reset() — memory that a reset wipes is
    // not memory. Same pattern as sseClients above, which is also
    // transport-level state that must outlive a session.
    if (this.memoryStoreName === undefined) this.memoryStoreName = null;
    // Deep Research (Phase 7). Tasks cost $1-3 each and run for minutes, so
    // the count is capped per session and the reports arrive asynchronously
    // through the same channel workflow outcomes use.
    this.researchTasksUsed = 0;
    this.pendingResearchOutcomes = [];
    this.activeResearchIds = new Set();
    // Turns that failed one after another, and the last failure's message
    this.consecutiveFailures = 0;
    this.lastError = null;
    // Running notes on the messages that have aged out of the prompt window
    // ({ text, upTo, lastId }, see summarizer.js) and whether a refresh is in flight.
    this.summary = null;
    this._summaryBusy = false;
    this.judgeUsage = createJudgeUsage();
    // "Done when": checks the server runs on the deliverable before it lets the room end (see doneWhen.js).
    // blocks counts endings refused so far. After maxBlocks refusals (default 8; 0 = never give up) the room ends anyway, saying so,
    // because a check nobody can pass would otherwise loop until the token limit.
    this.doneWhen = { criteria: [], blocks: 0, maxBlocks: 8, lastNoteKey: null, lastResult: null };
    // An independent critic that sees only pictures (see roomTools.js). Off until a host turns it on; a budget of scores per session.
    this.critic = { enabled: false, auto: true, referenceId: null, criteria: '', model: null, minScore: 6, maxCalls: 30, calls: 0 };
    // Renders asked for by agents or the host. Browser renders wait here for the page to answer (resolveRender).
    for (const pending of this.renderState?.pending?.values?.() ?? []) pending.settle({ ok: false, error: 'the room was reset' });
    this.renderState = { used: 0, max: 12, pending: new Map() };
    // Company rooms: estimated spend this session, and how the safety layer has acted (see _withholdTurn). `consecutive` counts
    // turns in a row in which something was withheld, refused or blocked; reaching the company's limit pauses the room for a person.
    this.spendUsd = 0;
    this.safety = { withheld: 0, refusals: 0, toolBlocks: 0, consecutive: 0, pausedFor: null };
    this._turnFlags = { blocked: 0 };
    this._emitToObservers('reset', {});
  }

  /**
   * Put this room under a company's policy. The room's own settings are brought inside it straight away: a turn limit is
   * always in force, and agents already here are checked against the caps and the tool grant.
   * @param {import('../company/roomPolicy.js').RoomPolicy} policy
   * @param {{ memoryOwnerId?: string }} [options]
   */
  attachPolicy(policy, { memoryOwnerId = null } = {}) {
    this.policy = policy;
    if (memoryOwnerId) this.memoryOwnerId = memoryOwnerId;
    this.consensusSettings.maxTurns = policy.clampMaxTurns(this.consensusSettings.maxTurns);
    return this;
  }

  /** The turn limit in force: a company room always has one. */
  _maxTurns() {
    return this.policy ? this.policy.clampMaxTurns(this.consensusSettings.maxTurns) : (this.consensusSettings.maxTurns || 0);
  }

  _chargeSpend(usd) {
    if (this.policy && Number.isFinite(usd) && usd > 0) this.spendUsd += usd;
  }

  /** Stop the loop and ask a person to look: nothing carries on until someone resumes the room. */
  _safetyPause(code, message, extra = {}) {
    if (this.safety.pausedFor) return;
    this.safety.pausedFor = code;
    this.policy?.record('safety_pause', { code, ...extra });
    this._postNote(`The room is paused: ${message}`, { sender: 'Safety' });
    this.broadcast('safety_pause', { code, message, ...extra });
    this.pause();
  }

  /**
   * A turn did not become part of the conversation because of a safety decision. The agent and the room are told in plain words (never
   * the content), it is counted, and at the company's limit the room pauses for a person.
   */
  _noteSafetyStrike(speaker, { kind, text, rules = [], detail = null }) {
    this.safety.consecutive += 1;
    this.policy.record(kind, { agent: speaker.name, rules, detail });
    this._postNote(text, { sender: 'Safety' });
    if (this.safety.consecutive >= this.policy.strikeLimit) {
      this._safetyPause('strikes', `${this.safety.consecutive} turns in a row were held back by the safety layer. A person needs to look before anyone carries on.`, { strikes: this.safety.consecutive });
    }
  }

  /** A turn the independent screen would not pass (or could not review): nothing from it is shown, saved or acted on. */
  _withholdTurn(speaker, result) {
    this.safety.withheld += 1;
    const unavailable = result.verdict === 'unavailable';
    const why = unavailable ? 'the safety screen could not be reached, so nothing was passed' : describeFindings(result.findings);
    this.broadcast('message_withheld', { agentId: speaker.id, agentName: speaker.name, rules: result.findings.map(f => f.rule), reason: why });
    this._noteSafetyStrike(speaker, {
      kind: unavailable ? 'screen_unavailable' : 'turn_withheld',
      rules: result.findings.map(f => f.rule),
      detail: unavailable ? result.error : why,
      text: `${speaker.name}'s last message was withheld by the company's safety screen (${why}). Its words were not shown or saved. Do not repeat it or work around it: carry on a different way, or leave it for a person.`,
    });
  }

  /** The model service declined a turn. That is final: no retry, no rewording, no other model. */
  _refuseTurn(speaker, detail) {
    this.safety.refusals += 1;
    this.broadcast('provider_refusal', { agentId: speaker.id, agentName: speaker.name });
    this._noteSafetyStrike(speaker, {
      kind: 'provider_refusal',
      detail,
      text: `The model service declined ${speaker.name}'s turn. That answer is final for this turn: it will not be retried, reworded or sent to another model.`,
    });
  }

  /** Watch every event in this room (what clients get over SSE, plus 'reset' and 'session_media'). Returns a function that stops watching. */
  addObserver(fn) {
    this._observers.add(fn);
    return () => this._observers.delete(fn);
  }

  _emitToObservers(event, data) {
    for (const fn of this._observers) {
      try { fn(event, data); } catch (err) { console.warn(`[orchestrator] observer failed on ${event}: ${err.message}`); }
    }
  }

  /**
   * Put a saved session (or an imported session file) back into this room, ready to carry on: the next message from the user
   * restarts the conversation exactly as it does after a session ends. Replaces whatever the room held.
   * @param {{ meta: object, messages: object[], artifacts?: object[], media?: object[], archiveId?: string|null, source?: string }} saved
   */
  restoreSession({ meta, messages, artifacts = [], media = [], archiveId = null, source = 'saved' }) {
    // A company room takes a saved or imported session only if its agents meet the same rules as agents added by hand
    // (the caps, clean names and sheets, tool tiers the company has granted). Checked before anything is replaced.
    if (this.policy) this.policy.checkRestore(meta.agents);
    this.reset();
    this.mediaStore.clear?.();
    this.artifactStore.clear?.();
    this.goal = meta.goal || '';
    this.mode = meta.mode === 'solo' ? 'solo' : 'group';
    this.tokenLimit = Number.isFinite(meta.tokenLimit) ? meta.tokenLimit : 100000;
    this.agents = (meta.agents || []).map((a, i) => ({
      id: a.id || uuidv4(),
      name: a.name,
      bio: a.bio || '',
      color: a.color || this.generateColor(i),
      model: isKnownAgentModel(a.model) ? a.model : null,
      thinkingLevel: normalizeThinkingLevel(a.thinkingLevel),
      // an agent with no tier is given the widest by default in a plain room, and the narrowest in a company's
      tools: isKnownToolTier(a.tools) ? a.tools : (this.policy ? 'none' : DEFAULT_TOOL_TIER),
      voice: isKnownVoice(a.voice) ? a.voice : defaultVoiceForIndex(i),
      ...(a.muted ? { muted: true } : {}),
    }));
    this.messages = messages.map(m => ({ ...m }));
    for (const m of this.messages) {
      for (const img of m.images || []) {
        if (img.imageData) this.mediaStore.add({ id: img.id, type: 'image', data: img.imageData, mimeType: img.mimeType, prompt: img.prompt || '', agentId: m.agentId, agentName: m.agentName });
      }
    }
    for (const item of media) this.mediaStore.add({ ...item, agentId: null, agentName: null });
    this.tokenCount = Number.isFinite(meta.tokenCount) ? meta.tokenCount : this.messages.reduce((n, m) => n + (m.tokenCount || 0), 0);
    this.turnCount = Number.isFinite(meta.turnCount) ? meta.turnCount : this.messages.filter(m => !m.isUser).length;
    this.segmentStartTurn = this.turnCount;
    this.lastSpeakerId = [...this.messages].reverse().find(m => !m.isUser)?.agentId || null;
    this.completionReason = meta.endReason || null;
    this.sessionId = uuidv4();
    if (meta.settings?.consensus) this.updateConsensusSettings(meta.settings.consensus);
    if (meta.settings?.doneWhen?.length) this.setDoneWhen(meta.settings.doneWhen);
    for (const a of artifacts) {
      const versions = a.versions?.length ? a.versions : [{ version: 1, content: a.content }];
      for (const v of versions) this.artifactStore.save(a.filename, v.content, null, 'restored');
    }
    this.broadcast('session_restored', {
      source, archiveId, goal: this.goal, mode: this.mode, messageCount: this.messages.length,
      agents: this.agents.map(a => ({ id: a.id, name: a.name, color: a.color })),
    });
    return { messageCount: this.messages.length, agents: this.agents.length, artifacts: artifacts.length };
  }

  /**
   * Add session media (uploaded files available to all agents)
   */
  addSessionMedia(mediaItem) {
    if (this.sessionMedia.length >= 14) {
      const err = new Error('Maximum of 14 session media files allowed');
      err.code = 'MEDIA_LIMIT_EXCEEDED';
      err.limit = 14;
      err.current = this.sessionMedia.length;
      throw err;
    }
    // Remember how far into the conversation this arrived, so agents are shown a fresh
    // upload even when it comes long after the opening turns (see mediaContext.js).
    if (mediaItem.addedAtMessage === undefined) mediaItem.addedAtMessage = this.messages.length;
    this.sessionMedia.push(mediaItem);
    this._emitToObservers('session_media', mediaItem);

    // Index documents into File Search rather than letting them ride inline.
    // Deliberately not awaited: uploads arrive one HTTP request at a time and
    // indexing takes seconds, so the response returns immediately and the
    // item is marked `indexed` when it lands. Turns before that still see the
    // file inline, which is the correct fallback rather than a gap.
    if (isFileSearchEnabled() && shouldIndex(mediaItem.mimeType)) {
      this._indexSessionMedia(mediaItem).catch(err =>
        console.warn(`[Orchestrator] indexing "${mediaItem.name}" failed: ${err.message}`)
      );
    }
    return mediaItem;
  }

  /**
   * Index one upload, creating the session store on first use.
   */
  async _indexSessionMedia(mediaItem) {
    if (!this.fileSearchStoreName) {
      this.fileSearchStoreName = await createSessionStore(this.sessionId || 'pending');
    }
    const result = await indexMedia(this.fileSearchStoreName, mediaItem);
    if (result.ok) {
      // Flip the flag on the live object; gemini.js reads it to decide what
      // still needs to ride inline.
      mediaItem.indexed = true;
      this.broadcast('media_indexed', { mediaId: mediaItem.id, name: mediaItem.name });
    } else {
      this.broadcast('media_index_failed', {
        mediaId: mediaItem.id, name: mediaItem.name, error: result.error,
      });
    }
  }

  /**
   * Submit a Deep Research task, enforcing the per-session budget.
   *
   * The cap lives here rather than in the tool description because a
   * description is a request and this is a rule — an autonomous room with an
   * uncapped $1-3 tool can spend real money while nobody is watching.
   *
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async _startResearch(topic, opts, speaker) {
    if (this.researchTasksUsed >= MAX_TASKS_PER_SESSION) {
      return {
        ok: false,
        error: `the session limit of ${MAX_TASKS_PER_SESSION} research task(s) is already used. ` +
               'Use google_search instead.',
      };
    }
    this.researchTasksUsed += 1;

    let submitted;
    try {
      submitted = await submitResearch(topic, opts);
    } catch (err) {
      this.researchTasksUsed -= 1; // never charge the budget for a failed submit
      return { ok: false, error: err.message };
    }

    this.activeResearchIds.add(submitted.id);
    this.broadcast('research_submitted', {
      agentId: speaker.id,
      agentName: speaker.name,
      researchId: submitted.id,
      topic,
      thorough: Boolean(opts?.max),
      tasksUsed: this.researchTasksUsed,
      tasksAllowed: MAX_TASKS_PER_SESSION,
      estimatedCostUsd: ESTIMATED_COST_USD,
    });

    // Poll in the background. The conversation keeps going; the report lands
    // in pendingResearchOutcomes for whoever speaks next after it finishes.
    pollToCompletion(submitted.id, (status, elapsed) => {
      this.broadcast('research_progress', {
        researchId: submitted.id, status, elapsedSeconds: Math.round(elapsed / 1000),
      });
    }).then(result => {
      this.activeResearchIds.delete(submitted.id);
      this.pendingResearchOutcomes.push({
        topic,
        agentName: speaker.name,
        ok: result.ok,
        text: result.text,
        error: result.error,
      });
      this.broadcast(result.ok ? 'research_completed' : 'research_failed', {
        researchId: submitted.id, topic, error: result.error,
        chars: result.text?.length || 0,
      });
    }).catch(err => {
      this.activeResearchIds.delete(submitted.id);
      this.pendingResearchOutcomes.push({
        topic, agentName: speaker.name, ok: false, error: err.message,
      });
    });

    return { ok: true, id: submitted.id };
  }

  /**
   * Delete the session's File Search store. Best-effort and not awaited —
   * called from synchronous reset paths — but a failure is logged because it
   * leaves quota consumed.
   */
  _destroyFileSearchStore() {
    const name = this.fileSearchStoreName;
    this.fileSearchStoreName = null;
    if (!name) return;
    destroySessionStore(name).catch(err =>
      console.warn(`[Orchestrator] file search store cleanup failed: ${err.message}`)
    );
  }

  /**
   * Remove session media by ID
   */
  removeSessionMedia(mediaId) {
    const removed = this.sessionMedia.find(m => m.id === mediaId);
    this.sessionMedia = this.sessionMedia.filter(m => m.id !== mediaId);

    // A removed file must stop being retrievable, or agents keep citing a
    // document the user deleted. Rather than tracking per-document resource
    // names through the upload operation, drop the store and re-index what
    // remains — removals are rare (usually before a session even starts) and
    // this uses only the store-level calls, so it cannot half-work.
    if (removed?.indexed) {
      this._destroyFileSearchStore();
      const survivors = this.sessionMedia.filter(m => m.indexed);
      for (const m of survivors) m.indexed = false;
      for (const m of survivors) {
        this._indexSessionMedia(m).catch(err =>
          console.warn(`[Orchestrator] re-indexing "${m.name}" failed: ${err.message}`)
        );
      }
    }
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
    this._destroyFileSearchStore();
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
    if (settings.closeBy && ['vote', 'lead'].includes(settings.closeBy)) {
      this.consensusSettings.closeBy = settings.closeBy;
    }
    if (typeof settings.leadAgent === 'string') {
      this.consensusSettings.leadAgent = settings.leadAgent.trim();
    }
    if (settings.minTurns !== undefined && Number.isFinite(Number(settings.minTurns))) {
      this.consensusSettings.minTurns = Math.max(0, Math.min(Math.floor(Number(settings.minTurns)), 1000));
    }
    if (settings.maxTurns !== undefined && Number.isFinite(Number(settings.maxTurns))) {
      this.consensusSettings.maxTurns = Math.max(0, Math.min(Math.floor(Number(settings.maxTurns)), 5000));
    }
    // A company's turn limit can be lowered from here and never raised past its ceiling (0, "no limit", means the ceiling)
    if (this.policy) this.consensusSettings.maxTurns = this.policy.clampMaxTurns(this.consensusSettings.maxTurns);
    return this.consensusSettings;
  }

  // ==================== SHOW THE ROOM, THE CRITIC, RENDERING ====================

  /**
   * Show the room pictures: they join the conversation as a note from the Producer (or whoever is named), are kept in the media store,
   * and enter the vision window, so the next speaker SEES them. Used by the host, by tools, and by renders.
   * @param {{ images: object[], caption?: string, sender?: string }} args  images are { data | dataUrl, mimeType?, label? }
   * @returns {{ ok: boolean, error?: string, messageId?: string, imageIds?: string[] }}
   */
  showToRoom({ images, caption = '', sender = 'Producer' } = {}) {
    if (!Array.isArray(images) || images.length === 0) return { ok: false, error: 'show needs at least one image' };
    if (images.length > MAX_SHOWN_IMAGES) return { ok: false, error: `at most ${MAX_SHOWN_IMAGES} images at a time` };
    const items = [];
    for (const raw of images) {
      const img = readShownImage(raw);
      if (img.error) return { ok: false, error: img.error };
      items.push(img);
    }
    const shown = items.map(img => this._registerImage({ imageData: img.data, mimeType: img.mimeType, prompt: img.label || caption || 'shown to the room', agentName: sender }));
    const note = this._postNote(String(caption || '').slice(0, 4000) || `${sender} shows the room ${shown.length === 1 ? 'a picture' : `${shown.length} pictures`}.`, {
      sender,
      images: shown.map(s => ({ id: s.id, prompt: s.prompt, caption: s.prompt, imageData: s.imageData, mimeType: s.mimeType })),
    });
    return { ok: true, messageId: note.id, imageIds: shown.map(s => s.id) };
  }

  /** Keep a picture: media store, and the window of recent pictures every speaker is shown. */
  _registerImage({ imageData, mimeType, prompt, agentId = null, agentName = null }) {
    const id = uuidv4();
    this.mediaStore.add({ id, type: 'image', data: imageData, mimeType, prompt, agentId, agentName });
    this.recentGenImages.push({ id, data: imageData, mimeType, prompt, agentName });
    if (this.recentGenImages.length > VISION_WINDOW) this.recentGenImages.shift();
    return { id, imageData, mimeType, prompt };
  }

  getCritic() {
    return { ...this.critic };
  }

  /** Configure the independent critic. referenceId is a picture in the room (an upload or a generated image). */
  setCritic(settings = {}) {
    const c = this.critic;
    if (settings.enabled !== undefined) c.enabled = !!settings.enabled;
    if (settings.auto !== undefined) c.auto = !!settings.auto;
    if (settings.referenceId !== undefined) c.referenceId = settings.referenceId ? String(settings.referenceId).slice(0, 120) : null;
    if (typeof settings.criteria === 'string') c.criteria = settings.criteria.slice(0, 1000);
    if (settings.model !== undefined) c.model = settings.model ? String(settings.model).slice(0, 80) : null;
    if (Number.isFinite(Number(settings.minScore))) c.minScore = Math.max(1, Math.min(10, Math.round(Number(settings.minScore))));
    if (Number.isFinite(Number(settings.maxCalls))) c.maxCalls = Math.max(0, Math.min(500, Math.floor(Number(settings.maxCalls))));
    return this.getCritic();
  }

  /** A picture by id: something generated, or a file the host attached (matched by id or by name). */
  _pictureById(id) {
    const m = this.mediaStore.get(id);
    if (m?.data && (m.type === 'image' || String(m.mimeType || '').startsWith('image/'))) return { data: m.data, mimeType: m.mimeType || 'image/png' };
    const u = this.sessionMedia.find(x => (x.id === id || x.name === id) && String(x.mimeType || '').startsWith('image/'));
    return u?.data ? { data: u.data, mimeType: u.mimeType } : null;
  }

  /**
   * Score a picture with the independent critic. It sees the reference (or the description in `criteria`) and the candidate, never the
   * conversation. Counts against the session's budget of scores.
   * @returns {Promise<{ ok: boolean, score?: number, differs?: string, text?: string, below?: boolean, error?: string }>}
   */
  async critique({ imageId, referenceId = null, criteria = '', source = 'agent' } = {}) {
    const c = this.critic;
    if (c.calls >= c.maxCalls) return { ok: false, error: `the critic's budget of ${c.maxCalls} scores for this session is used up` };
    const candidate = this._pictureById(imageId);
    if (!candidate) return { ok: false, error: `there is no picture "${imageId}" in this room` };
    const refId = referenceId || c.referenceId;
    const reference = refId ? this._pictureById(refId) : null;
    if (refId && !reference) return { ok: false, error: `there is no reference picture "${refId}" in this room` };
    const holds = criteria || c.criteria;
    if (!reference && !holds) return { ok: false, error: 'the critic needs a reference picture or a description to judge against' };
    c.calls += 1;
    const result = await this._critique({ candidate, reference, criteria: holds, model: c.model, usage: this.judgeUsage });
    if (!result) return { ok: false, error: 'the critic could not be reached' };
    const below = result.score < c.minScore;
    this.broadcast('critic_score', { imageId, referenceId: refId, score: result.score, differs: result.differs, minScore: c.minScore, below, source });
    return { ok: true, score: result.score, differs: result.differs, below, text: describeScore(result, { minScore: c.minScore }) };
  }

  /** After a turn that made pictures: the critic scores each (a few at most) and the room is told, in one note. */
  async _autoCritique(imageIds) {
    const c = this.critic;
    if (!c.enabled || !c.auto || !imageIds.length) return;
    if (!c.referenceId && !c.criteria) return;
    const lines = [];
    for (const id of imageIds.slice(0, 3)) {
      if (id === c.referenceId) continue;
      const r = await this.critique({ imageId: id, source: 'auto' });
      lines.push(`- picture ${String(id).slice(0, 8)}: ${r.ok ? r.text : `not scored (${r.error})`}`);
    }
    if (lines.length) this._postNote(`INDEPENDENT CRITIC (it saw only the pictures, not this conversation; its scores are not up for debate):\n${lines.join('\n')}`);
  }

  /**
   * Render something an agent wrote and show the room what it looks like.
   *  - an image-prompt template (.json with promptTemplate and variables): draws a few combinations with the image model;
   *  - a p5 instrument (.json with p5Code) or a page (.html, .js): a browser attached to the room does the rendering and answers
   *    through resolveRender (see the render_request event).
   * Bounded: draws per render, renders per session, seconds to wait for a browser.
   * @returns {Promise<{ ok: boolean, text: string, images?: object[] }>}
   */
  async render({ artifact, draws, speaker = null, timeoutMs = 45_000 } = {}) {
    const rs = this.renderState;
    if (rs.used >= rs.max) return { ok: false, text: `the session's limit of ${rs.max} renders is used up` };
    const art = this.artifactStore.get(String(artifact || ''));
    if (!art) return { ok: false, text: `there is no artifact named "${artifact}" (the artifacts are: ${this.artifactStore.list().map(a => a.filename).join(', ') || 'none yet'})` };
    const kind = classifyArtifact(art);
    if (kind.error) return { ok: false, text: kind.error };
    rs.used += 1;
    const count = Math.max(1, Math.min(4, Math.floor(Number(draws)) || 3));
    const who = speaker?.name || 'Producer';

    if (kind.kind === 'prompt-template') {
      const samples = Array.from({ length: count }, () => drawValues(kind.template.variables));
      const made = [];
      const failed = [];
      for (const values of samples) {
        const prompt = fillTemplate(kind.template.promptTemplate, values);
        try {
          const result = await this._draw(prompt);
          if (!result?.imageData) throw new Error('no image came back');
          const img = this._registerImage({ imageData: result.imageData, mimeType: result.mimeType || 'image/png', prompt, agentId: speaker?.id || null, agentName: who });
          made.push({ id: img.id, prompt, imageData: img.imageData, mimeType: img.mimeType, caption: prompt });
        } catch (err) {
          failed.push(err.message);
        }
      }
      if (!made.length) return { ok: false, text: `no draws came back (${failed[0] || 'unknown error'})` };
      return { ok: true, images: made, text: `${made.length} draw${made.length === 1 ? '' : 's'} from ${art.filename}, each a random combination of its values: ${made.map(m => `"${m.prompt.slice(0, 160)}"`).join(' | ')}` };
    }

    // a browser does the rendering
    if (![...this.sseClients].some(c => c.renderCapable)) {
      rs.used -= 1;
      return { ok: false, text: `no browser that can render is attached to this room, so ${art.filename} cannot be rendered; open the room in the Agent Studio and try again` };
    }
    const requestId = uuidv4();
    const samples = kind.kind === 'p5-template' ? Array.from({ length: count }, () => drawValues(kind.template.variables)) : [];
    const outcome = await new Promise(resolve => {
      const timer = setTimeout(() => resolve({ ok: false, error: `no browser answered within ${Math.round(timeoutMs / 1000)} seconds` }), timeoutMs);
      rs.pending.set(requestId, { settle: (r) => { clearTimeout(timer); rs.pending.delete(requestId); resolve(r); } });
      this.broadcast('render_request', {
        requestId, kind: kind.kind, filename: art.filename, content: art.content,
        ...(kind.kind === 'p5-template' ? { p5Code: kind.template.p5Code, samples } : {}),
      });
    });
    if (!outcome.ok) return { ok: false, text: `rendering ${art.filename} failed: ${outcome.error}` };
    const made = (outcome.images || []).slice(0, 4).map(raw => readShownImage(raw)).filter(img => !img.error)
      .map(img => ({ ...img, ...this._registerImage({ imageData: img.data, mimeType: img.mimeType, prompt: img.label || art.filename, agentId: speaker?.id || null, agentName: who }) }));
    if (!made.length) return { ok: false, text: `the browser rendered ${art.filename} but sent no usable picture${outcome.note ? ` (${outcome.note})` : ''}` };
    return {
      ok: true,
      images: made.map(m => ({ id: m.id, prompt: m.label || art.filename, imageData: m.imageData, mimeType: m.mimeType, caption: m.label || art.filename })),
      text: `${made.length} render${made.length === 1 ? '' : 's'} of ${art.filename}${samples.length ? ` with different settings: ${samples.slice(0, made.length).map(v => JSON.stringify(v).slice(0, 200)).join(' | ')}` : ''}${outcome.note ? `. Browser note: ${outcome.note}` : ''}`,
    };
  }

  /** The browser's answer to a render_request. Returns false when nothing was waiting for it. */
  resolveRender(requestId, result) {
    const pending = this.renderState.pending.get(requestId);
    if (!pending) return false;
    pending.settle(result);
    return true;
  }

  // ==================== DONE WHEN ====================

  /** Set the checks the room must pass before it may end (an empty list turns the gate off). Returns the stored state. */
  setDoneWhen(criteria, { maxBlocks } = {}) {
    const { criteria: ok } = normalizeCriteria(Array.isArray(criteria) ? criteria : []);
    this.doneWhen.criteria = ok;
    this.doneWhen.blocks = 0;
    this.doneWhen.lastNoteKey = null;
    this.doneWhen.lastResult = null;
    if (maxBlocks !== undefined && Number.isFinite(Number(maxBlocks))) this.doneWhen.maxBlocks = Math.max(0, Math.min(Math.floor(Number(maxBlocks)), 100));
    return this.getDoneWhen();
  }

  getDoneWhen() {
    const { criteria, blocks, maxBlocks, lastResult } = this.doneWhen;
    return { criteria: criteria.map(c => ({ ...c })), text: criteriaToText(criteria), blocks, maxBlocks, lastResult };
  }

  /** Which room tools this room offers its agents (see the documentation in gemini.js). */
  _roomToolsForPrompt() {
    return {
      critic: this.critic.enabled,
      criticReference: this.critic.referenceId,
      criticMinScore: this.critic.minScore,
      render: this.artifactStore.getAll().length > 0,
    };
  }

  /** Run the checks now. Broadcasts the outcome as 'done_check'; returns { passed, results }. */
  async checkDoneWhen(context = {}) {
    const result = await evaluateDoneWhen(this.doneWhen.criteria, { messages: this.messages, artifactStore: this.artifactStore });
    this.doneWhen.lastResult = { passed: result.passed, at: new Date().toISOString(), results: result.results.map(r => ({ label: r.label, passed: r.passed, detail: r.detail })) };
    this.broadcast('done_check', { ...this.doneWhen.lastResult, blocks: this.doneWhen.blocks, ...context });
    return result;
  }

  /**
   * A note from the Producer, in the conversation where every agent sees it. It is the room's way to tell agents something true that
   * none of them said (the result of a check, what a render looked like). With resetClose it also clears any ending in progress, so
   * the next attempt to end is a fresh decision made with the note in view.
   */
  _postNote(content, { resetClose = false, sender = 'Producer', images } = {}) {
    const message = {
      id: uuidv4(),
      agentId: 'user',
      agentName: sender,
      content,
      timestamp: new Date().toISOString(),
      isUser: true,
      isNote: true,
      ...(images?.length ? { images } : {}),
      tokenCount: countTokens(content),
    };
    this.messages.push(message);
    this.tokenCount += message.tokenCount;
    if (resetClose) {
      this.lastUserMessageTurn = this.turnCount;
      this.consensusVotes = [];
    }
    this.broadcast('message', message);
    return message;
  }

  /**
   * The gate every ending passes: with no checks it lets the room end. With checks it runs them, and when one fails it refuses the
   * ending, tells the room which and why, and the conversation goes on.
   * @returns {Promise<{ allowed: boolean, reason?: string }>}
   */
  async _runDoneGate(attempted) {
    if (!this.doneWhen.criteria.length) return { allowed: true };
    const result = await this.checkDoneWhen({ attempted });
    if (result.passed) return { allowed: true };
    this.doneWhen.blocks += 1;
    const { maxBlocks, blocks } = this.doneWhen;
    if (maxBlocks > 0 && blocks >= maxBlocks) {
      this._postNote(describeResult(result, { heading: `DONE-WHEN CHECK: still failing after ${blocks} attempts to end; the session ends now anyway.` }));
      return { allowed: true, reason: 'done_check_unmet' };
    }
    this._postNote(describeResult(result, { heading: `DONE-WHEN CHECK: the session cannot end yet (refused ${blocks === 1 ? 'once' : `${blocks} times`}). Fix what is listed, then close again.` }), { resetClose: true });
    return { allowed: false };
  }

  /** After an artifact is saved: say so when the checks' verdict changed, so each new version is judged without anyone asking. */
  async _noteCandidate(filenames) {
    const result = await this.checkDoneWhen({ candidate: filenames });
    const key = JSON.stringify(result.results.map(r => [r.passed, r.passed ? '' : r.detail]));
    if (key === this.doneWhen.lastNoteKey) return;
    this.doneWhen.lastNoteKey = key;
    const heading = result.passed
      ? `DONE-WHEN CHECK after ${filenames.join(', ')}: every check passes. The lead may close when the rest of the goal is met.`
      : `DONE-WHEN CHECK after ${filenames.join(', ')}:`;
    this._postNote(describeResult(result, { heading }));
  }

  /**
   * The agent who alone may end the session when closeBy is 'lead': the one named in
   * the settings, else the first agent that can speak. Null when the vote applies
   * (closeBy 'vote', or the named lead is not in the room), so a misspelt name
   * degrades to the old behaviour instead of a room nobody can close.
   */
  _leadAgent() {
    if (this.consensusSettings.closeBy !== 'lead' || this.mode === 'solo') return null;
    const speakable = this.agents.filter(a => !a.muted);
    const wanted = (this.consensusSettings.leadAgent || '').toLowerCase();
    if (!wanted) return speakable[0] || null;
    return speakable.find(a => a.name.toLowerCase() === wanted) || null;
  }

  /** True while the room is still below the minimum number of turns for an ending. */
  _tooEarly() {
    const floor = this.consensusSettings.minTurns || 0;
    return floor > 0 && this.turnCount < floor;
  }

  /**
   * One agent's call to finish the session, run through whichever ending applies.
   *
   * 'vote': it is a vote; a quorum within the window ends the session.
   * 'lead': it ends the session only when it is the lead's own EXPLICIT call; anyone else's
   * is recorded as a recommendation (and shown to the lead on their next turn).
   * Either way, nothing ends before minTurns, and a user message still starts a cooldown.
   *
   * @returns {string|null} 'consensus_reached' | 'lead_closed' | null (and a consensus_proposed event)
   */
  _tallyClose(speakerId, { inCooldown = false, explicit = true, extra = {} } = {}) {
    if (speakerId) {
      // De-dupe: one vote per agent per active window.
      this.consensusVotes = this.consensusVotes.filter(v => v.agentId !== speakerId);
      this.consensusVotes.push({ agentId: speakerId, turn: this.turnCount });
    }
    const window = this.consensusSettings.voteWindowTurns ?? 4;
    this.consensusVotes = this.consensusVotes.filter(v => this.turnCount - v.turn <= window);
    const distinctVoters = new Set(this.consensusVotes.map(v => v.agentId)).size;
    // Use unmuted agent count — muted agents can never vote, so including them
    // in the denominator can make quorum unreachable.
    const speakableCount = this.agents.filter(a => !a.muted).length;
    const required = Math.max(2, Math.ceil((speakableCount || 0) / 2));
    const tooEarly = this._tooEarly();

    const lead = this._leadAgent();
    if (lead) {
      if (speakerId === lead.id && explicit && !inCooldown && !tooEarly) return 'lead_closed';
      this.broadcast('consensus_proposed', {
        agentId: speakerId, votes: distinctVoters, required, inCooldown, tooEarly,
        leadRequired: true, lead: lead.name, ...extra
      });
      return null;
    }

    if (!inCooldown && !tooEarly && distinctVoters >= required) return 'consensus_reached';
    // Surface a "proposed" event so the UI can show progress without ending.
    this.broadcast('consensus_proposed', { agentId: speakerId, votes: distinctVoters, required, inCooldown, tooEarly, ...extra });
    return null;
  }

  /**
   * What the prompt says about ending, for one speaker (see endingInstructions in gemini.js).
   */
  _endingForPrompt(speaker) {
    const lead = this._leadAgent();
    if (!lead) return { mode: 'vote' };
    return { mode: 'lead', leadName: lead.name, isLead: lead.id === speaker.id };
  }

  /**
   * Notes about the ending for the speaker's next turn: the lead is told who has said they are
   * ready to close; everyone is warned in the last round of a turn limit, so the work is finished
   * rather than cut off.
   */
  _closingNotes(speaker) {
    const notes = [];
    if (this.doneWhen.criteria.length) {
      notes.push('DONE WHEN: the server will not let this session end until every check below passes. It runs them itself each time anyone tries to end, ' +
        'so saying they pass changes nothing; make them pass.\n' + this.doneWhen.criteria.map(c => `- ${describeCriterion(c)}`).join('\n'));
    }
    const lead = this._leadAgent();
    if (lead && lead.id === speaker.id) {
      const names = [...new Set(this.consensusVotes.filter(v => v.agentId !== lead.id).map(v => v.agentId))]
        .map(id => this.agents.find(a => a.id === id)?.name).filter(Boolean);
      if (names.length > 0) {
        notes.push(`Ready to close, they say: ${names.join(', ')}. That is a recommendation, not a decision: you alone close the session. ` +
          'Close only if what the goal asks for exists in this conversation, in that form, and no objection is open; otherwise say what is missing.');
      }
    }
    const limit = this.consensusSettings.maxTurns || 0;
    if (limit > 0) {
      const taken = this.turnCount - this.segmentStartTurn;           // includes the turn about to be spoken
      const left = limit - taken;
      if (left <= Math.max(2, this.agents.length - 1)) {
        notes.push(`TURN LIMIT: this session stops after ${limit} turns and this is turn ${taken}` +
          (left <= 0 ? ', the LAST one. ' : `, with ${left} more after it. `) +
          'Whatever the goal asks for must be complete in this conversation by then: finish it now, do not open new threads.');
      }
    }
    return notes.length ? notes.join('\n\n') : null;
  }

  /**
   * Add an agent to the chat room.
   * `model` is left null unless explicitly chosen, so an agent added without
   * one still honours a session-wide model preference (from /api/chat/start)
   * before falling back to the registry default. Storing the default here
   * would silently override that preference for every agent.
   */
  addAgent(name, bio, options = {}) {
    // In a company room an agent is admitted only within the caps, with a clean name and sheet, at a tool tier the company has
    // granted (the narrowest, `none`, unless asked). Anything else throws a PolicyError and nothing is added.
    let tools = isKnownToolTier(options.tools) ? options.tools : DEFAULT_TOOL_TIER;
    if (this.policy) {
      const spec = this.policy.checkNewAgent({ name, bio, tools: options.tools }, this.agents.length);
      ({ name, bio, tools } = spec);
    }
    const agent = {
      id: uuidv4(),
      name,
      bio,
      color: this.generateColor(this.agents.length),
      model: isKnownAgentModel(options.model) ? options.model : null,
      thinkingLevel: normalizeThinkingLevel(options.thinkingLevel),
      // Which function tools this agent may call (function-calling mode only).
      tools,
      // Voice used when the session is rendered to audio. Defaults by roster
      // position so a fresh room already sounds like distinct people.
      voice: isKnownVoice(options.voice)
        ? options.voice
        : defaultVoiceForIndex(this.agents.length),
    };
    this.agents.push(agent);
    return agent;
  }

  /**
   * Remove an agent
   */
  removeAgent(agentId) {
    this.agents = this.agents.filter(a => a.id !== agentId);
    const chainId = this.agentChains?.[agentId];
    if (chainId) {
      delete this.agentChains[agentId];
      delete this.agentSeenUpTo[agentId];
      deleteInteractions([chainId]).catch(() => { /* best effort */ });
    }
  }

  /**
   * Hot-swap an agent's bio (or other mutable fields) mid-session.
   * Looks up by id first, then falls back to a name match. Returns the
   * mutated agent on success, or null if no match.
   */
  updateAgent(idOrName, fields = {}) {
    let agent = this.agents.find(a => a.id === idOrName);
    if (!agent) agent = this.agents.find(a => a.name === idOrName);
    if (!agent) return null;
    // Company rooms: the same checks as adding an agent, before anything is changed
    if (this.policy) fields = { ...fields, ...this.policy.checkAgentFields(fields, agent) };
    if (typeof fields.bio === 'string') agent.bio = fields.bio;
    if (typeof fields.name === 'string' && fields.name.trim()) agent.name = fields.name.trim();
    if (isKnownAgentModel(fields.model)) agent.model = fields.model;
    if (typeof fields.thinkingLevel === 'string') {
      agent.thinkingLevel = normalizeThinkingLevel(fields.thinkingLevel);
    }
    if (isKnownToolTier(fields.tools)) agent.tools = fields.tools;
    if (isKnownVoice(fields.voice)) agent.voice = fields.voice;
    return agent;
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
   * Broadcast an event to all connected clients.
   *
   * This is the single chokepoint every agent action and workflow event
   * passes through, which makes it the right place to feed the trace store.
   * The store no-ops on events without a workflowId, so non-workflow chatter
   * (chunks, agent_start, etc.) is filtered there rather than here.
   */
  broadcast(event, data) {
    try { traceStore.record(event, this.ownerId && data ? { ...data, ownerId: this.ownerId } : data); }
    catch (err) { console.error('[traceStore] record failed:', err.message); }

    this._emitToObservers(event, data);

    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const clientCount = this.sseClients.size;
    console.log(`[orchestrator] broadcast: ${event}, clients: ${clientCount}`);
    for (const client of this.sseClients) {
      try {
        client.write(message);
      } catch (err) {
        console.warn(`[orchestrator] write failed for ${event}:`, err.message);
      }
    }
  }

  /**
   * Start the autonomous chat
   */
  async start(goal, tokenLimit = 100000, options = {}) {
    if (this.isRunning) {
      throw new Error('Chat is already running');
    }
    const mode = options.mode === 'solo' ? 'solo' : 'group';
    const minAgents = mode === 'solo' ? 1 : 2;
    if (this.agents.length < minAgents) {
      throw new Error(`Need at least ${minAgents} agent${minAgents > 1 ? 's' : ''} to start a ${mode} chat`);
    }
    if (this.policy) {
      // A paused company does not run. The goal is held to the same rules as a message, and the caps apply whatever was asked.
      const run = this.policy.canRun();
      if (!run.ok) throw new PolicyError(run.message, { status: 409, code: run.code });
      this.policy.checkGoal(goal);
      tokenLimit = this.policy.startLimits({ tokenLimit }).tokenLimit;
      this.consensusSettings.maxTurns = this.policy.clampMaxTurns(this.consensusSettings.maxTurns);
      this.spendUsd = 0;
      this.safety = { withheld: 0, refusals: 0, toolBlocks: 0, consecutive: 0, pausedFor: null };
      this.policy.record('session_start', { agents: this.agents.length, tokenLimit, maxTurns: this.consensusSettings.maxTurns });
    }

    this.mode = mode;
    this.goal = goal;
    this.tokenLimit = tokenLimit;
    this.isRunning = true;
    // Solo mode pauses immediately — the first user inject drives the first turn.
    this.isPaused = mode === 'solo';
    this.completionReason = null;
    // A new run means a new transcript, so the previous run's server-side
    // chains are both stale and still retained at Google — drop them.
    this._purgeStoredInteractions();
    this.messages = [];
    this.tokenCount = 0;
    // Real usage is per-run spend. Unlike tokenCount it is NOT rewound by
    // branch restore or rewindToMessage — you can't un-spend tokens.
    this.usage = createEmptyUsage();
    this.judgeUsage = createJudgeUsage();
    this.turnCount = 0;
    this.segmentStartTurn = 0;
    this.lastSpeakerId = null;
    this.consecutiveFailures = 0;
    this.lastError = null;
    this.doneWhen.blocks = 0;
    this.doneWhen.lastNoteKey = null;
    this.modelPreference = options.model || null;
    // sessionId groups all workflows + traces produced during this run.
    // The trace viewer's "session lens" pivots on this field.
    this.sessionId = uuidv4();
    this._resolveMemoryStore();

    this.broadcast('session_start', {
      sessionId: this.sessionId,
      goal,
      tokenLimit,
      mode: this.mode,
      agents: this.agents.map(a => ({ id: a.id, name: a.name, color: a.color }))
    });

    // Group mode kicks off the autonomous loop immediately.
    // Solo mode waits for the first user inject before generating any turn.
    if (this.mode === 'group') {
      this.runConversationLoop();
    }
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
      messages: this.messages.length,
      // Why a session ended by failing, so the UI can say more than "stopped"
      error: reason === 'error_limit_reached' ? this.lastError : undefined
    });
    this._archiveToMemory(reason);
  }

  /**
   * Archive a finished session into long-term memory so later rooms can
   * search it. Fire-and-forget: stop() is called from request handlers and
   * from inside the conversation loop, and neither should wait on an upload.
   */
  _archiveToMemory(reason) {
    if (!isCrossSessionMemoryEnabled()) return;
    if (this.messages.length < MIN_MESSAGES_TO_ARCHIVE) {
      // A room that barely got started is noise in the memory store.
      return;
    }
    const snapshot = {
      sessionId: this.sessionId,
      goal: this.goal,
      agents: this.agents.map(a => ({ name: a.name })),
      // Copy: the live array is about to be reset out from under the upload.
      messages: this.messages.map(m => ({ agentName: m.agentName, content: m.content })),
      ownerId: this.memoryOwnerId ?? this.ownerId,   // whose memory this goes into (see fileSearch.memoryStoreNameFor); a company's rooms share the company's
      endedAt: new Date().toISOString(),
      reason,
    };
    archiveSession(snapshot)
      .then(result => {
        this.broadcast(result.ok ? 'memory_archived' : 'memory_archive_failed', {
          sessionId: snapshot.sessionId,
          messages: snapshot.messages.length,
          error: result.error,
        });
      })
      .catch(err => console.warn(`[Orchestrator] memory archive failed: ${err.message}`));
  }

  /**
   * Resolve the long-term memory store for this run, creating it on first
   * use. Not awaited by start() — the first turn or two may go without it,
   * which is better than delaying the room on a store lookup.
   */
  _resolveMemoryStore() {
    if (!isCrossSessionMemoryEnabled()) {
      this.memoryStoreName = null;
      return;
    }
    getOrCreateMemoryStore(this.memoryOwnerId ?? this.ownerId)
      .then(name => {
        this.memoryStoreName = name;
        this.broadcast('memory_available', { storeName: name });
      })
      .catch(err => console.warn(`[Orchestrator] memory store unavailable: ${err.message}`));
  }

  /**
   * Note a failed turn. Returns true when the session was stopped because of it.
   * Solo chats are not stopped: they wait for the user, who can simply try again.
   */
  _recordFailure(message) {
    this.consecutiveFailures++;
    this.lastError = message || 'unknown error';
    if (this.mode === 'solo') return false;
    const fatal = FATAL_ERROR_PATTERN.test(this.lastError);
    if (fatal || this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(`[Orchestrator] stopping after ${this.consecutiveFailures} failed turn(s): ${this.lastError}`);
      this.stop('error_limit_reached');
      return true;
    }
    return false;
  }

  /** Pause before retrying after a failed turn: 1 s, 2 s, 4 s, 8 s ... up to 30 s. */
  _backoffMs() {
    return Math.min(30000, 1000 * 2 ** Math.max(0, this.consecutiveFailures - 1));
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
      if (this.policy) {
        // A person resuming a room that the safety layer paused is the "look" it asked for; the count starts again.
        const run = this.policy.canRun();
        if (!run.ok) { this.broadcast('safety_notice', { code: run.code, message: run.message }); return; }
        this.safety.pausedFor = null;
        this.safety.consecutive = 0;
      }
      this.isPaused = false;
      this.broadcast('session_resumed', {});
      this.runConversationLoop();
    }
  }

  /**
   * Inject a user message into the conversation
   */
  injectMessage(content, senderName = 'User') {
    // Company rooms: the host's words go into prompts, so they are held to the same rules as a character sheet (no secrets, a sane length)
    if (this.policy) this.policy.checkHostText(content, 'The message');
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

    // Reset consensus state: a fresh user prompt should never be immediately
    // closed out by an in-flight consensus marker from a previous turn.
    this.lastUserMessageTurn = this.turnCount;
    this.consensusVotes = [];
    // The user is acting, so earlier failures should not count against the next turn.
    this.consecutiveFailures = 0;

    this.broadcast('message', message);

    // If paused, resume after injection
    if (this.isPaused && this.isRunning) {
      this.resume();
    }

    // If chat ended (not running but has messages and agents), restart the conversation.
    // Solo mode needs only 1 agent; group needs 2.
    const minAgents = this.mode === 'solo' ? 1 : 2;
    if (!this.isRunning && this.messages.length > 0 && this.agents.length >= minAgents && this.goal && (!this.policy || this.policy.canRun().ok)) {
      this.isRunning = true;
      this.isPaused = false;
      this.completionReason = null;
      this.segmentStartTurn = this.turnCount;       // a turn limit gives the restarted run its own allowance
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
  /**
   * Wrap broadcast() so that workflow lifecycle events (`workflow_complete`,
   * `workflow_error`) are also recorded as pending outcomes that will be
   * surfaced to the next-speaking agent. Without this, agents continue talking
   * as if their submitted workflows succeeded — the failure mode observed in
   * the exported sessions where 9 of 10 workflows failed silently.
   */
  _wrapBroadcastForWorkflow(speaker, label) {
    const base = this.broadcast.bind(this);
    return (event, payload) => {
      if (event === 'workflow_complete') {
        const failed = (payload?.totals?.failedSteps || 0) > 0
          || (payload?.status && payload.status !== 'complete');
        this.pendingWorkflowOutcomes.push({
          workflowId: payload?.workflowId,
          label: payload?.name || label,
          status: failed ? 'failed' : 'succeeded',
          agentId: speaker.id,
          agentName: speaker.name,
          error: failed ? `${payload?.totals?.failedSteps || 0} step(s) failed` : null,
        });
      } else if (event === 'workflow_error') {
        this.pendingWorkflowOutcomes.push({
          workflowId: payload?.workflowId,
          label,
          status: 'failed',
          agentId: speaker.id,
          agentName: speaker.name,
          error: payload?.error || 'unknown error',
        });
      }
      base(event, payload);
    };
  }

  /**
   * Drain pending workflow outcomes into a system note for the next agent.
   * Returns null if there are no outcomes to report.
   */
  _drainWorkflowOutcomes() {
    const sections = [];

    if (this.pendingWorkflowOutcomes.length > 0) {
      const items = this.pendingWorkflowOutcomes.splice(0);
      const lines = items.map(o => {
        if (o.status === 'succeeded') {
          return `- "${o.label}" (submitted by ${o.agentName}) SUCCEEDED.`;
        }
        return `- "${o.label}" (submitted by ${o.agentName}) FAILED: ${o.error}.`;
      });
      sections.push([
        'Workflow outcomes since the last turn:',
        ...lines,
        'Acknowledge these results in your reply. Do NOT pretend failed workflows succeeded.',
      ].join('\n'));
    }

    // Deep Research reports land here minutes after being commissioned. They
    // are long, so they are truncated — the agent is told the report exists
    // and given enough of it to work with, rather than having a 20-page
    // document dropped into a chat turn.
    if (this.pendingResearchOutcomes.length > 0) {
      const items = this.pendingResearchOutcomes.splice(0);
      for (const r of items) {
        if (!r.ok) {
          sections.push(
            `The research task on "${r.topic}" (commissioned by ${r.agentName}) FAILED: ` +
            `${r.error}. Say so plainly rather than inventing findings.`
          );
          continue;
        }
        const MAX_REPORT_CHARS = 6000;
        const body = (r.text || '').length > MAX_REPORT_CHARS
          ? `${r.text.slice(0, MAX_REPORT_CHARS)}\n…[report truncated]`
          : (r.text || '(empty report)');
        sections.push([
          `RESEARCH REPORT — "${r.topic}" (commissioned by ${r.agentName}) has completed:`,
          body,
          'Bring the relevant findings into the discussion. Attribute claims to the report ' +
          'rather than asserting them as your own prior knowledge.',
        ].join('\n'));
      }
    }

    return sections.length > 0 ? sections.join('\n\n') : null;
  }

  selectNextSpeaker() {
    // Filter out muted agents up front — they are never selected regardless of mode.
    const speakable = this.agents.filter(a => !a.muted);
    if (speakable.length === 0) return null;
    // Temporarily swap agents -> speakable for the strategy methods that read
    // `this.agents`. Cleanest path is to delegate via a saved reference.
    const allAgents = this.agents;
    this.agents = speakable;
    try {
      return this._selectNextSpeakerInternal();
    } finally {
      this.agents = allAgents;
    }
  }

  /**
   * Smart-orchestration wrapper around speaker selection.
   *
   * The hard rules still run first and still win: muting, the fairness floor,
   * and "never twice in a row" are policy learned from real sessions, not
   * things to hand to a model. The judge only picks between candidates the
   * heuristics already consider valid, and any failure falls straight back to
   * the heuristic's own answer.
   */
  async selectNextSpeakerSmart() {
    const heuristic = this.selectNextSpeaker();
    if (!heuristic) return null;
    if (!isSmartOrchestrationEnabled()) return heuristic;
    // Only 'dynamic' is a judgement call; the other modes are deterministic
    // by definition and the user picked them on purpose.
    if (this.speakingOrder !== 'dynamic') return heuristic;

    // A starved agent is a fairness guarantee, not a preference — if the
    // heuristic invoked the floor, do not second-guess it.
    if (this._isStarvedPick(heuristic)) return heuristic;

    const candidates = this.agents.filter(a => !a.muted && a.id !== this.lastSpeakerId);
    if (candidates.length < 2) return heuristic;

    try {
      const verdict = await selectSpeaker({
        usage: this.judgeUsage,
        candidates,
        recentMessages: this.messages,
        goal: this.goal,
      });
      if (!verdict || verdict.confidence < SPEAKER_CONFIDENCE_FLOOR) return heuristic;

      const chosen = candidates.find(a => a.id === verdict.agentId);
      if (!chosen) return heuristic;

      this.broadcast('speaker_selected', {
        agentId: chosen.id,
        agentName: chosen.name,
        reason: verdict.reason,
        confidence: verdict.confidence,
      });
      return chosen;
    } catch (err) {
      console.warn(`[Orchestrator] smart speaker selection failed: ${err.message}`);
      return heuristic;
    }
  }

  /** Was this pick forced by the fairness floor rather than chosen freely? */
  _isStarvedPick(agent) {
    const threshold = this.agents.length * 2;
    const everSpoke = this.messages.some(m => m.agentId === agent.id);
    if (!everSpoke) return this.messages.length >= threshold;
    return this.countTurnsSince(agent.id) >= threshold;
  }

  _selectNextSpeakerInternal() {
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
        // Full-name address (checked first — avoids ambiguity when firstName is shared,
        // e.g. "Red Spymaster" vs "Red Operative" both having firstName="Red").
        // Patterns: "Red Operative, ...", "Red Operative?", "Red Operative."
        contentLower.includes(`${nameLower},`) ||
        contentLower.includes(`${nameLower}?`) ||
        contentLower.includes(`${nameLower}.`) ||
        // First-name fallback (single-word names or informal address)
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

    // 3b. Fairness floor — any agent who hasn't spoken in 2*N turns gets
    // priority. Prevents the dominant-speaker pattern observed in exported
    // sessions (e.g. dissent/strategist roles ignored for ~10 turns).
    const fairnessThreshold = this.agents.length * 2;
    const starved = this.agents.filter(a => {
      if (a.id === this.lastSpeakerId) return false;
      // Has the agent ever spoken? If not, they are starved by definition
      // once at least `fairnessThreshold` turns have elapsed.
      const everSpoke = this.messages.some(m => m.agentId === a.id);
      if (!everSpoke) return this.messages.length >= fairnessThreshold;
      const since = this.countTurnsSince(a.id);
      return since >= fairnessThreshold;
    });
    if (starved.length > 0) {
      // Prefer the most starved (longest silence)
      starved.sort((a, b) => this.countTurnsSince(b.id) - this.countTurnsSince(a.id));
      return starved[0];
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
  checkForCompletion(content, speakerId = null) {
    // If consensus detection is disabled or set to manual, never auto-detect
    if (!this.consensusSettings.enabled || this.consensusSettings.sensitivity === 'manual') {
      return null;
    }

    const contentLower = content.toLowerCase();
    const hasMarker = content.includes('[CONSENSUS REACHED]') || contentLower.includes('[consensus reached]');
    // A completion phrase ("that's a wrap", "final document") from ONE agent used to end
    // the whole session. It is now a vote like the explicit marker, so it takes the same
    // quorum. Sensitivity 'low' and "require explicit marker" ignore phrases entirely.
    const phraseHit = !hasMarker
      && !this.consensusSettings.requireExplicitMarker
      && this.consensusSettings.sensitivity !== 'low'
      && this._completionPhrases().some(p => contentLower.includes(p));

    // Cooldown: a single user prompt cannot be closed out within N turns of
    // being submitted. Required to prevent premature shutdown observed in
    // exported sessions where one agent fired the marker after the user was
    // still iterating.
    const cooldown = this.consensusSettings.userCooldownTurns ?? 2;
    const turnsSinceUser = this.turnCount - (this.lastUserMessageTurn ?? -Infinity);
    const inCooldown = Number.isFinite(this.lastUserMessageTurn) && turnsSinceUser < cooldown;

    // [END SESSION] is the lead's own, unmistakable call (only meaningful when the lead closes the room)
    const lead = this._leadAgent();
    const hasEnd = Boolean(lead && speakerId && speakerId === lead.id && contentLower.includes('[end session]'));

    // Explicit consensus marker or completion phrase — record as a vote, then require quorum
    // (or, when a lead closes the room, the lead's explicit call).
    if (hasMarker || phraseHit || hasEnd) {
      return this._tallyClose(speakerId, { inCooldown, explicit: hasMarker || hasEnd });
    }

    // If require explicit marker is set, only the above check applies
    if (this.consensusSettings.requireExplicitMarker) {
      return null;
    }

    // With a lead, nothing but the lead's explicit call ends the session: no phrase
    // patterns, no judge, no sign-off detection.
    if (lead) {
      return null;
    }

    // Phrase-based detection still respects the cooldown.
    if (inCooldown) {
      return null;
    }

    // Low sensitivity: only explicit marker (already handled above)
    if (this.consensusSettings.sensitivity === 'low') {
      return null;
    }

    // Completion phrases were handled above, as votes.

    // Smart mode gets a second look: the phrase list is a fixed set of strings and cannot
    // recognise "I think we're done here" or "nothing further from me on this". Marked for the
    // async pass in the loop, which still applies the cooldown and quorum rules around whatever
    // it decides.
    if (isSmartOrchestrationEnabled()) {
      return 'needs_judgement';
    }

    // High sensitivity: also check for sign-off patterns
    if (this.consensusSettings.sensitivity === 'high') {
      if (this.isConversationWindingDown(contentLower)) {
        return 'conversation_concluded';
      }
    }

    return null;
  }

  /** Phrases that count as one agent voting to finish (lower case), plus the user's own. */
  _completionPhrases() {
    return [
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
      ...(this.consensusSettings.customPhrases || []).map(p => String(p).toLowerCase())
    ];
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
    // A laptop that sleeps in the middle of a session cuts every model call it was waiting on. Held only while the loop runs.
    const release = keepAwake('chat session');
    try {
      return await this._conversationLoop();
    } finally {
      release();
    }
  }

  async _conversationLoop() {
    while (this.isRunning && !this.isPaused) {
      // Check token limit
      if (this.tokenCount >= this.tokenLimit) {
        this.stop('token_limit_reached');
        break;
      }

      // A company's room stops while its company is paused, and when its estimated spend reaches the ceiling
      if (this.policy) {
        const run = this.policy.canRun();
        if (!run.ok) { this._safetyPause(run.code, run.message); break; }
        if (this.spendUsd >= this.policy.spendLimitUsd) {
          this.policy.record('spend_limit', { spendUsd: Math.round(this.spendUsd * 100) / 100, limitUsd: this.policy.spendLimitUsd });
          this.stop('spend_limit_reached');
          break;
        }
      }

      // Check turn limit (an ending that does not depend on the agents agreeing about anything)
      const maxTurns = this._maxTurns();
      if (maxTurns > 0 && this.turnCount - this.segmentStartTurn >= maxTurns) {
        this.stop('turn_limit_reached');
        break;
      }

      // Select next speaker
      const speaker = await this.selectNextSpeakerSmart();
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
        let turnError = null;
        // Control tags are acted on at the end of the turn; keep them out of the live stream.
        const tagFilter = createStreamTagFilter();
        // A company room shows nothing of a turn until the independent screen has passed all of it (`held` is what waits).
        const buffering = Boolean(this.policy?.screensDrafts);
        let held = '';
        let turnRefusal = null;
        this._turnFlags = { blocked: 0 };
        let turnUsage = null;
        let turnUsageReported = false;
        let turnInteractionId = null;
        // Media produced by function calls during this turn, for the message
        // record. The tag path fills `images`/`synthMedia` further down.
        const toolMedia = [];
        const toolCallLog = [];

        const systemNotes = [this._drainWorkflowOutcomes(), this._closingNotes(speaker)].filter(Boolean).join('\n\n') || null;
        const turnTools = this._toolsForTurn(speaker);
        const hasCustomFunctions = turnTools.some(t => t?.type === 'function');
        const generator = this._generate(
          speaker,
          this.agents,
          this.messages,
          this.goal,
          this.sessionMedia,
          {
            // A session-wide model preference still wins over the registry
            // default, but a per-agent model wins over both (resolved inside
            // generateAgentResponse).
            model: this.modelPreference,
            thinkingLevel: speaker.thinkingLevel,
            systemNotes,
            // How this room ends (a vote, or the lead alone), so each agent's prompt says so
            ending: this._endingForPrompt(speaker),
            // (a company room documents its room tools as function declarations, never as tags)
            roomTools: this.policy ? null : this._roomToolsForPrompt(),
            policy: this.policy,
            generatedImages: this.recentGenImages,
            // Stateful chaining: continue this agent's server-side history and
            // send only the messages it has not seen. Both are ignored when
            // GEMINI_STORE_INTERACTIONS is off.
            store: isStatefulEnabled(),
            previousInteractionId: this.agentChains[speaker.id] || null,
            sinceMessageIndex: this.agentSeenUpTo[speaker.id] ?? 0,
            // Both must be present for the function-calling path to engage.
            tools: turnTools,
            // Only custom function declarations need a dispatcher. A turn
            // carrying just built-ins (file_search) stays on the tag path.
            dispatch: hasCustomFunctions
              ? this._createDispatcher(speaker, toolMedia)
              : null,
            // This room's own files, and the notes on its older messages.
            artifactStore: this.artifactStore,
            summary: this._summaryForPrompt(),
          }
        );

        for await (const event of generator) {
          if (!this.isRunning || this.isPaused) break;

          if (event.type === 'chunk') {
            fullResponse += event.text;
            // (tags are inert in a company room, so nothing is hidden from the stream there)
            const visible = this.policy ? event.text : tagFilter.push(event.text);
            if (visible) {
              if (buffering) held += visible;
              else {
                this.broadcast('chunk', {
                  agentId: speaker.id,
                  text: visible
                });
              }
            }
          } else if (event.type === 'refusal') {
            // The model service declined. Final for this turn: no second attempt (see company/refusal.js).
            turnRefusal = event.detail || 'declined';
            break;
          } else if (event.type === 'tool_call') {
            this.broadcast('tool_executing', {
              agentId: speaker.id,
              type: event.name,
              callId: event.id,
              args: event.args,
            });
          } else if (event.type === 'tool_result') {
            toolCallLog.push({ name: event.name, ok: event.ok, summary: event.summary });
            this.broadcast('tool_result', {
              agentId: speaker.id,
              result: {
                type: event.name,
                ok: event.ok,
                summary: event.summary,
                mediaId: event.media?.id,
              },
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
            turnUsage = event.usage || null;
            turnUsageReported = Boolean(event.usageReported);
            turnInteractionId = event.interactionId || null;
            if (event.wasTruncated) {
              console.log(`[Orchestrator] ${speaker.name}'s response was auto-continued after truncation`);
            }
          } else if (event.type === 'error') {
            this.broadcast('error', {
              agentId: speaker.id,
              error: event.error
            });
            turnError = event.error || 'unknown error';
            break;
          }
        }

        if (!this.isRunning || this.isPaused) break;

        if (turnRefusal) {
          if (!this.policy) {
            // A plain room treats a refusal like any failed turn, as it always did
            turnError = `The model service's safety filters declined this turn (${turnRefusal})`;
          } else {
            this._refuseTurn(speaker, turnRefusal);
            if (this.mode === 'solo') {
              this.isPaused = true;
              this.broadcast('session_waiting_user', {});
              break;
            }
            await this.delay(1500);
            continue;
          }
        }

        if (turnError) {
          // Back off and try again, but give up after repeated failures (see _recordFailure)
          if (this._recordFailure(turnError)) break;
          if (this.mode === 'solo') {
            this.isPaused = true;
            this.broadcast('session_waiting_user', {});
            break;
          }
          await this.delay(this._backoffMs());
          continue;
        }

        // A company's room: the independent screen reads the whole turn before any of it is shown, saved or acted on.
        if (this.policy) {
          const screened = await this.policy.screenTurn({ text: fullResponse, agentName: speaker.name });
          this._chargeSpend(textCostUsd(screened.usage, screened.model));
          if (!this.isRunning || this.isPaused) break;       // stopped or paused while the screen was reading
          if (screened.verdict !== 'pass') {
            this._withholdTurn(speaker, screened);
            if (this.mode === 'solo') {
              this.isPaused = true;
              this.broadcast('session_waiting_user', {});
              break;
            }
            await this.delay(1500);
            continue;
          }
          if (held) this.broadcast('chunk', { agentId: speaker.id, text: held });
        }

        // In function-calling mode the bracket vocabulary was never taught, so
        // nothing should be scraped out of the prose — and a legitimate
        // [bracketed aside] must not be eaten by a parser. Feeding the tag
        // parsers an empty string disables the whole legacy path in one place.
        // Keyed on custom functions, NOT on tools being present at all — a
        // turn can carry file_search while still speaking the tag dialect.
        // A company's room never uses the tag dialect: its tools are the declarations it was granted and nothing else.
        const tagSource = (hasCustomFunctions || this.policy) ? '' : fullResponse;

        // Check for image generation requests in the response
        const imageRequests = parseImageRequests(tagSource);
        const remixRequests = parseRemixRequests(tagSource);
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
              this.mediaStore.add({
                id: imageId,
                type: 'image',
                data: imageResult.imageData,
                mimeType: imageResult.mimeType,
                prompt: request.prompt,
                agentId: speaker.id,
                agentName: speaker.name
              });

              // Add to vision window so subsequent agents can see this image
              this.recentGenImages.push({ id: imageId, data: imageResult.imageData, mimeType: imageResult.mimeType, prompt: request.prompt, agentName: speaker.name });
              if (this.recentGenImages.length > VISION_WINDOW) this.recentGenImages.shift();

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
              const referenceMedia = this.mediaStore.get(request.referenceImageId);

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
              this.mediaStore.add({
                id: imageId,
                type: 'image',
                data: imageResult.imageData,
                mimeType: imageResult.mimeType,
                prompt: request.prompt,
                agentId: speaker.id,
                agentName: speaker.name,
                referenceIds: [request.referenceImageId]
              });

              // Add to vision window
              this.recentGenImages.push({ id: imageId, data: imageResult.imageData, mimeType: imageResult.mimeType, prompt: request.prompt, agentName: speaker.name });
              if (this.recentGenImages.length > VISION_WINDOW) this.recentGenImages.shift();

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
        const toolRequests = parseToolRequests(tagSource);
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
              this.countSearchQueries(result);
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

        // Room tools: [CRITIC: image | reference=id] scores a picture with a critic that sees nothing else;
        // [RENDER: file.json] shows the room what an artifact looks like.
        const roomRequests = parseRoomRequests(tagSource);
        if (roomRequests.length > 0) {
          for (const req of roomRequests) {
            if (req.type === 'critic') {
              const r = await this.critique({ imageId: req.imageId, referenceId: req.referenceId, criteria: req.criteria });
              toolResults.push({ type: 'critic', imageId: req.imageId, ok: r.ok, text: r.ok ? r.text : r.error });
            } else {
              const r = await this.render({ artifact: req.artifact, draws: req.draws, speaker });
              for (const img of r.images || []) images.push(img);
              toolResults.push({ type: 'render', artifact: req.artifact, ok: r.ok, text: r.text });
            }
          }
          fullResponse = stripRoomTags(fullResponse);
        }

        // Check for Synthograsizer tool requests (SYNTH_* tags)
        const synthRequests = parseSynthRequests(tagSource);
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
              (id) => this.mediaStore.get(id)
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
                this.mediaStore.add({
                  id: mediaId,
                  type: 'image',
                  data: raw.image,
                  mimeType,
                  prompt: raw.prompt || raw.intent || '',
                  agentId: speaker.id,
                  agentName: speaker.name
                });

                // Add to vision window
                this.recentGenImages.push({ id: mediaId, data: raw.image, mimeType, prompt: raw.prompt || raw.intent || '', agentName: speaker.name });
                if (this.recentGenImages.length > VISION_WINDOW) this.recentGenImages.shift();

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
                this.mediaStore.add({
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
        const workflowRequests = parseWorkflowRequests(tagSource);
        const workflowIds = []; // ids of newly submitted workflows

        if (workflowRequests.length > 0) {
          for (const req of workflowRequests) {
            if (req.type === 'workflow') {
              // Submit the workflow — execution runs in the background
              const wfLabel = req.definition.name || 'Unnamed Workflow';
              const wfId = workflowEngine.submit(req.definition, {
                broadcast: this._wrapBroadcastForWorkflow(speaker, wfLabel),
                agentId: speaker.id,
                agentName: speaker.name,
                agentColor: speaker.color,
                sessionId: this.sessionId,
                mediaStore: this.mediaStore,
                ownerId: this.ownerId,
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
              // An agent can only ask about runs from its own room
              const found = workflowEngine.getStatus(req.workflowId);
              const status = found && (this.ownerId === null || found.ownerId === this.ownerId) ? found : null;
              this.broadcast('workflow_status', {
                agentId: speaker.id,
                workflowId: req.workflowId,
                status: status || { error: 'Workflow not found' },
              });
            } else if (req.type === 'workflow_cancel') {
              const cancelled = workflowEngine.cancel(req.workflowId, this.ownerId ?? undefined);
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
        const styleRequests = parseSynthStyleRequests(tagSource);
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
                this.mediaStore.add({
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
        const templateRequests = parseWorkflowTemplateRequests(tagSource);
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
              broadcast: this._wrapBroadcastForWorkflow(speaker, req.definition.name || req.templateId),
              agentId: speaker.id,
              agentName: speaker.name,
              agentColor: speaker.color,
              sessionId: this.sessionId,
              mediaStore: this.mediaStore,
              ownerId: this.ownerId,
            });
            workflowIds.push(wfId);
            this.broadcast('workflow_submitted', {
              agentId: speaker.id,
              agentName: speaker.name,
              agentColor: speaker.color,
              sessionId: this.sessionId,
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
        const artifactUpdates = parseArtifactTags(tagSource);
        for (const { filename, content: artContent } of artifactUpdates) {
          const artifact = this.artifactStore.save(filename, artContent, speaker.id, speaker.name);
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

        // Detect artifact hallucination (agent claims code changes without
        // actually saving any). In function-calling mode a successful
        // write_artifact call counts as having saved — otherwise every real
        // tool-based edit would be flagged as a phantom one.
        const savedArtifact =
          artifactUpdates.length > 0 ||
          toolCallLog.some(c => c.name === 'write_artifact' && c.ok);
        const artifactHallucinationNote = detectArtifactHallucination(
          fullResponse, savedArtifact
        );

        // Skip empty responses (no text, no images, no tool results, no synth, no workflows)
        const hasContent = fullResponse && fullResponse.trim().length > 0;
        const hasImages = images.length > 0;
        const hasToolResults = toolResults.length > 0;
        const hasSynthMedia = synthMedia.length > 0;
        const hasSynthResults = synthResults.length > 0;
        const hasWorkflows = workflowIds.length > 0;
        const hasArtifacts = artifactUpdates.length > 0;
        // A turn that only called tools still happened — don't drop it.
        const hasToolMedia = toolMedia.length > 0;
        const hasToolCalls = toolCallLog.length > 0;

        if (!hasContent && !hasImages && !hasToolResults && !hasSynthMedia && !hasSynthResults &&
            !hasWorkflows && !hasArtifacts && !hasToolMedia && !hasToolCalls) {
          console.warn(`Empty response from ${speaker.name}, skipping turn`);
          if (this._recordFailure(`${speaker.name} returned an empty response`)) break;
          if (this.mode === 'solo') {
            this.isPaused = true;
            this.broadcast('session_waiting_user', {});
            break;
          }
          await this.delay(this._backoffMs());
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
          // Function-calling mode surfaces its media the same way the SYNTH_*
          // tags do, so ChatMessage.jsx renders both without a second branch.
          synthMedia: hasSynthMedia ? synthMedia : (hasToolMedia ? toolMedia : undefined),
          toolCalls: hasToolCalls ? toolCallLog : undefined,
          synthResults: hasSynthResults ? synthResults : undefined,
          workflowIds: hasWorkflows ? workflowIds : undefined,
          artifactHallucination: artifactHallucinationNote || undefined,
          timestamp: new Date().toISOString(),
          isUser: false,
          tokenCount: responseTokens,
          usage: turnUsage || undefined,
          model: speaker.model || this.modelPreference || DEFAULT_AGENT_MODEL
        };

        this.messages.push(message);
        this.tokenCount += responseTokens;
        this._accumulateUsage(turnUsage, turnUsageReported);
        this.lastSpeakerId = speaker.id;
        this.consecutiveFailures = 0;
        if (this.policy) {
          this._chargeSpend(textCostUsd(turnUsage, message.model));
          this._closeTurnSafety();
        }

        // Advance this agent's chain. It has now seen everything up to and
        // including its own turn, so the next one starts from here. If the
        // turn produced no chainable id (stateless mode, or an interaction
        // that never completed), the chain is dropped and the next turn
        // falls back to sending the full transcript — correct, just costlier.
        if (turnInteractionId) {
          this.agentChains[speaker.id] = turnInteractionId;
          this.agentSeenUpTo[speaker.id] = this.messages.length;
        } else if (this.agentChains[speaker.id]) {
          delete this.agentChains[speaker.id];
          delete this.agentSeenUpTo[speaker.id];
        }

        // Broadcast the message to all clients
        this.broadcast('message', message);

        // Keep the notes on older messages up to date (in the background)
        this._maybeRefreshSummary();

        // Broadcast completion
        this.broadcast('agent_complete', {
          agentId: speaker.id,
          message,
          totalTokens: this.tokenCount,
          usage: this.usage,
          turnCount: this.turnCount
        });

        // The independent critic scores what this turn made, so the room hears it before anyone can talk each other round
        const madeImageIds = [
          ...(hasImages ? images.map(i => i.id) : []),
          ...(hasSynthMedia ? synthMedia.filter(m => m.type === 'image').map(m => m.id) : []),
          ...(hasToolMedia ? toolMedia.filter(m => m.type === 'image').map(m => m.id) : []),
        ].filter(Boolean);
        if (madeImageIds.length > 0) await this._autoCritique(madeImageIds);

        // Check for consensus/completion
        let completionReason = this.checkForCompletion(fullResponse, speaker.id);
        if (completionReason === 'needs_judgement') {
          completionReason = await this._judgeCompletion(fullResponse, speaker);
        }
        if (completionReason) {
          const gate = await this._runDoneGate(completionReason);
          if (!gate.allowed) {
            await this.delay(1500);
            continue;
          }
          this.stop(gate.reason || completionReason);
          break;
        }
        // Not ending: judge each new artifact version against the checks, so a revision is never left unanswered
        if (artifactUpdates.length > 0 && this.doneWhen.criteria.length > 0) {
          await this._noteCandidate([...new Set(artifactUpdates.map(a => a.filename))]);
        }

        // Solo mode: one agent reply per user message. Pause after the turn
        // and wait for the next inject (which will resume() us automatically).
        if (this.mode === 'solo') {
          this.isPaused = true;
          this.broadcast('session_waiting_user', {});
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
        if (this._recordFailure(error.message)) break;
        if (this.mode === 'solo') {
          this.isPaused = true;
          this.broadcast('session_waiting_user', {});
          break;
        }
        await this.delay(this._backoffMs());
      }
    }
  }

  /**
   * Delete every stored interaction this session created, and forget the
   * chains. No-op in stateless mode, where nothing was stored to begin with.
   */
  _purgeStoredInteractions() {
    const ids = Object.values(this.agentChains || {}).filter(Boolean);
    this.agentChains = {};
    this.agentSeenUpTo = {};
    if (ids.length === 0) return;
    // Not awaited: reset() is synchronous and called from request handlers.
    deleteInteractions(ids).catch(err =>
      console.warn(`[Orchestrator] interaction purge failed: ${err.message}`)
    );
  }

  /**
   * Tool declarations for this speaker's turn, or [] when function calling is
   * off — in which case generateAgentResponse takes the legacy tag path.
   */
  _toolsForTurn(speaker) {
    const tools = [];

    // file_search is a built-in: it needs no dispatcher, so it works in tag
    // mode too. One tool over both stores rather than two competing for the
    // model's attention — this session's uploads and, when cross-session
    // memory is on, what previous rooms concluded.
    const stores = [this.fileSearchStoreName, this.memoryStoreName].filter(Boolean);
    if (stores.length > 0) {
      tools.push(fileSearchTool(stores));
    }

    // A company's room always uses declared tools (never the tag dialect), and a tier hands out no more than the company was granted.
    if (isFunctionCallingEnabled() || this.policy) {
      // Only offer write_artifact once the room is plausibly building
      // something; otherwise it's a tool slot spent on a capability nobody
      // asked for.
      const goalLower = (this.goal ?? '').toLowerCase();
      const allowArtifacts =
        this.artifactStore.getAll().length > 0 ||
        /\b(build|create|make|code|sketch|game|p5|html|website|app|artifact)\b/.test(goalLower);
      tools.push(...buildToolsForAgent(speaker, {
        allowArtifacts,
        allowCritic: this.critic.enabled,
        allowRender: this.artifactStore.getAll().length > 0,
        ...(this.policy ? { only: this.policy.toolNamesFor(speaker), extra: ['propose_publish'] } : {}),
      }));
    }

    // The model API refuses a request that carries file_search together with google_search or url_context ("cannot be combined in the same
    // request"). An agent that was handed a search tool for its work keeps it, and its turn goes without the stores: the first mixed-tier company
    // session lost every turn of its archivist and its engineer to this, and the room stopped after five failures in a row.
    if (tools.some(t => t?.type === 'google_search' || t?.type === 'url_context')) return tools.filter(t => t?.type !== 'file_search');

    return tools;
  }

  /** What a proposal can be made from: this room's files and pictures. */
  _publishSources() {
    return {
      artifact: (name) => this.artifactStore.get(name) || null,
      media: (id) => this.mediaStore.get(id) || null,
    };
  }

  /**
   * At the end of a committed turn: one in which a tool was blocked or the model service declined a tool request counts as a
   * strike; a clean turn clears the count. Reaching the company's limit pauses the room for a person.
   */
  _closeTurnSafety() {
    if (this._turnFlags.blocked > 0) {
      this.safety.consecutive += 1;
      if (this.safety.consecutive >= this.policy.strikeLimit) {
        this._safetyPause('strikes', `${this.safety.consecutive} turns in a row had something held back by the safety layer. A person needs to look before anyone carries on.`, { strikes: this.safety.consecutive });
      }
    } else {
      this.safety.consecutive = 0;
    }
  }

  /**
   * A company's tool dispatcher: least privilege first, then the money, then the independent screen on the words a tool is about
   * to act on, then the tool, then a refusal from the model service treated as final.
   */
  _guardDispatch(speaker, inner) {
    const allowed = new Set([...this.policy.toolNamesFor(speaker), 'propose_publish']);
    // Once the model service declines a media request, the media tools stay closed for the rest of the turn
    let declinedByService = false;
    const refuse = (text, summary = text) => ({ ok: false, result: [{ type: 'text', text }], summary });
    const blocked = () => { this._turnFlags.blocked += 1; this.safety.toolBlocks += 1; };

    return async (call) => {
      const name = call?.name;
      if (!allowed.has(name)) {
        blocked();
        this.policy.record('tool_refused', { agent: speaker.name, tool: String(name).slice(0, 60), reason: 'not granted' });
        return refuse(`The tool "${name}" is not available to you.`);
      }
      if (declinedByService && MEDIA_TOOLS.has(name)) {
        return refuse('The model service declined an earlier request this turn. That answer is final: do not retry it or a reworded version.');
      }
      const cost = toolCostUsd(name);
      if (cost > 0 && this.spendUsd + cost > this.policy.spendLimitUsd) {
        this.policy.record('spend_limit', { agent: speaker.name, tool: name, spendUsd: Math.round(this.spendUsd * 100) / 100, limitUsd: this.policy.spendLimitUsd });
        return refuse('Not run: it would take this session past its spend ceiling. Carry on without it.');
      }

      const screened = await this.policy.screenToolCall(name, call.arguments);
      if (screened) {
        this._chargeSpend(textCostUsd(screened.usage, screened.model));
        if (screened.verdict !== 'pass') {
          blocked();
          const unavailable = screened.verdict === 'unavailable';
          const why = unavailable ? 'the safety screen could not be reached' : describeFindings(screened.findings);
          this.policy.record(unavailable ? 'screen_unavailable' : 'tool_blocked', { agent: speaker.name, tool: name, rules: screened.findings.map(f => f.rule) });
          return refuse(`Not run: ${why}. Do not try again with other words; carry on without it.`, `${name} blocked by the safety screen`);
        }
      }

      const outcome = await inner(call);
      if (outcome.ok) {
        this._chargeSpend(cost);
        return outcome;
      }
      if (looksLikeSafetyBlock(outcome.summary)) {
        declinedByService = true;
        blocked();
        this.policy.record('provider_refusal', { agent: speaker.name, tool: name });
        return refuse('The model service declined this request. That answer is final for this turn: do not retry it, reword it or ask another participant to.', `${name} declined by the model service`);
      }
      return outcome;
    };
  }

  /**
   * Build the per-turn function dispatcher. It owns the app-side consequences
   * of a tool call — storing media, broadcasting, feeding the vision window —
   * so gemini.js stays a stream parser and nothing more.
   */
  _createDispatcher(speaker, toolMedia) {
    const inner = createToolDispatcher({
      agent: speaker,
      mediaStore: this.mediaStore,
      artifactStore: this.artifactStore,
      startResearch: isDeepResearchEnabled()
        ? (topic, opts) => this._startResearch(topic, opts, speaker)
        : null,
      onEvent: (event, data) => this.broadcast(event, data),
      critique: (args) => this.critique({ ...args }),
      render: (args) => this.render({ ...args, speaker }),
      // Only a company's room can offer work for publication; the answer is a queued proposal, never a publication
      propose: this.policy ? (args) => this._propose(args, speaker) : null,
      onMedia: (media) => {
        toolMedia.push({
          id: media.id,
          type: media.type,
          mimeType: media.mimeType,
          prompt: media.prompt,
          ...(media.referenceIds ? { referenceId: media.referenceIds[0] } : {}),
        });
        if (media.type === 'image' && media.data) {
          // Subsequent speakers see the image, not just its prompt.
          this.recentGenImages.push({
            id: media.id,
            data: media.data,
            mimeType: media.mimeType,
            prompt: media.prompt,
            agentName: speaker.name,
          });
          if (this.recentGenImages.length > VISION_WINDOW) this.recentGenImages.shift();
        }
      },
    });
    return this.policy ? this._guardDispatch(speaker, inner) : inner;
  }

  /** An agent offers work for publication: queued for a person, screened first, never published by anything in the room. */
  async _propose(args, speaker) {
    try {
      const item = await this.policy.propose(args, this._publishSources(), speaker.name);
      this.broadcast('publish_proposed', { agentId: speaker.id, agentName: speaker.name, id: item.id, status: item.status, title: item.title });
      return { ok: true, id: item.id, status: item.status };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Ask the judge whether a message really declares the goal finished, and
   * run the answer through the same quorum the explicit marker uses.
   *
   * Consensus ends the session, so a model's opinion alone is not enough:
   * it has to clear a high confidence floor AND still win a vote among the
   * agents, exactly as an explicit [CONSENSUS REACHED] would.
   *
   * @returns {Promise<string|null>} completion reason, or null to continue
   */
  async _judgeCompletion(content, speaker) {
    let verdict;
    try {
      verdict = await assessCompletion({
        content, goal: this.goal, agentName: speaker.name, usage: this.judgeUsage,
      });
    } catch (err) {
      console.warn(`[Orchestrator] completion judgement failed: ${err.message}`);
      return null;
    }
    if (!verdict?.complete || verdict.confidence < CONSENSUS_CONFIDENCE_FLOOR) return null;

    // Same vote bookkeeping as the explicit marker path (the judge's opinion is never an
    // explicit lead call, which is why checkForCompletion does not ask it when a lead closes).
    return this._tallyClose(speaker.id, { explicit: false, extra: { rationale: verdict.rationale, judged: true } });
  }

  /**
   * Fold one turn's reported usage into the session total.
   * Turns where the API didn't report usage are counted separately so the UI
   * can say how much of the figure is measured vs estimated.
   */
  _accumulateUsage(usage, wasReported) {
    if (!this.usage) this.usage = createEmptyUsage();
    if (wasReported) {
      this.usage.reportedTurns += 1;
    } else {
      this.usage.estimatedTurns += 1;
    }
    if (!usage) return;
    this.usage.inputTokens   += usage.inputTokens   || 0;
    this.usage.outputTokens  += usage.outputTokens  || 0;
    this.usage.thoughtTokens += usage.thoughtTokens || 0;
    this.usage.cachedTokens  += usage.cachedTokens  || 0;
    this.usage.toolUseTokens += usage.toolUseTokens || 0;
    this.usage.totalTokens   += usage.totalTokens   || 0;
  }

  /**
   * Add a tool result's grounding queries to the session's search meter.
   * Counts the queries the model actually executed, which is the billable
   * unit — not the number of tool calls, which understates it.
   */
  countSearchQueries(result) {
    const queries = result?.searchQueries;
    if (!Array.isArray(queries) || queries.length === 0) return;
    if (!this.usage) this.usage = createEmptyUsage();
    this.usage.searchQueries += queries.length;
  }

  /** Does the server hold each agent's history (stateful chains), rather than us re-sending it? */
  _usesServerHistory() {
    return isStatefulEnabled();
  }

  /**
   * The rolling summary to give the next speaker, or null. It is dropped, never trusted,
   * once the messages it describes have changed (rewind, branch restore, reset).
   */
  _summaryForPrompt() {
    return summaryIsValid(this.summary, this.messages) ? this.summary : null;
  }

  /**
   * Fold messages that have just aged out of the window into the running summary.
   * Runs in the background and never blocks or fails a turn: if the model call fails,
   * the older one-line notes are used a while longer and it is tried again next turn.
   */
  _maybeRefreshSummary() {
    // In stateful mode the server already holds each agent's real history (a chain), so the
    // notes would only add cost; they are for stateless turns (GEMINI_STORE_INTERACTIONS=false).
    if (this._usesServerHistory()) return;
    if (this._summaryBusy || !needsRefresh(this.messages, this.summary)) return;

    const range = agedRange(this.messages, this.summary);
    const from = range.from;
    const to = Math.min(range.to, from + MAX_FOLD_MESSAGES);
    const batch = this.messages.slice(from, to);
    const lastId = batch[batch.length - 1].id;
    const previous = summaryIsValid(this.summary, this.messages) ? this.summary.text : '';
    const goal = this.goal;

    this._summaryBusy = true;
    foldIntoSummary({ goal, previous, messages: batch, generate: (prompt) => this._summarize(prompt) })
      .then((text) => {
        // Only keep it if the conversation is still the one it was written about.
        if (this.messages[to - 1]?.id !== lastId) return;
        this.summary = { text, upTo: to, lastId };
        this.broadcast('summary_updated', { upTo: to, chars: text.length });
      })
      .catch((err) => console.warn(`[Orchestrator] summary refresh failed (will retry): ${err.message}`))
      .finally(() => { this._summaryBusy = false; });
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
      mode: this.mode,
      goal: this.goal,
      tokenLimit: this.tokenLimit,
      tokenCount: this.tokenCount,
      usage: this.usage,
      // Whether conversation history is being retained server-side at Google.
      // Surfaced so the UI can say so rather than leaving it to the .env.
      stateful: isStatefulEnabled(),
      // Orchestration judgements are real spend, billed separately from the
      // agent turns — surfaced so they can't hide.
      judgeUsage: isSmartOrchestrationEnabled() ? { ...this.judgeUsage } : null,
      turnCount: this.turnCount,
      messageCount: this.messages.length,
      // How many of the oldest messages the rolling summary currently covers
      summarizedMessages: this._summaryForPrompt()?.upTo ?? 0,
      agents: this.agents, // Include full agent data with bios
      completionReason: this.completionReason,
      doneWhen: { checks: this.doneWhen.criteria.length, blocks: this.doneWhen.blocks, lastResult: this.doneWhen.lastResult },
      critic: { enabled: this.critic.enabled, calls: this.critic.calls, maxCalls: this.critic.maxCalls, minScore: this.critic.minScore },
      // A company's room: which company, what applies, and how the safety layer has acted this session. Null for a plain room.
      policy: this.policy
        ? { ...this.policy.summary(), spendUsd: Math.round(this.spendUsd * 10000) / 10000, safety: { ...this.safety } }
        : null,
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
    // The server-side chains hold the history we are about to abandon, so
    // they can no longer be continued from — drop them and let the next turn
    // re-send the restored transcript in full.
    this._purgeStoredInteractions();
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

    // Same as branch restore: the chains still hold the messages we just
    // removed, so they cannot be continued from.
    this._purgeStoredInteractions();

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
const CODE_CLAIM_RE = /\b(here'?s?\s+(the\s+)?(updated|new|revised|modified|complete|full)\s+(code|sketch|file|html|script|game|artifact|implementation|solution|version|fix|feature)|(i'?ve|i have|i just)\s+(updated|created|added|modified|written|built|refactored|revised|implemented|fixed|changed)\s+(the\s+)?(code|sketch|file|artifact|game|html|function|class|script|component|module|solution|implementation|fix|feature)|let me\s+(update|create|write|add|implement|fix|refactor|build)|updating\s+the\s+(artifact|code|file|sketch)|pushing.*changes|here\s+are\s+the\s+(changes|updates|modifications)|here\s+is\s+(the\s+)?(implementation|solution|updated|new|revised|complete)\b|updated\s+it\b|check\s+out\s+(the\s+)?(changes|updates|code|implementation))\b|^(implemented|updated|created|added|modified|fixed|refactored)\b.*:/im;

function detectArtifactHallucination(responseText, hadArtifactTags) {
  if (hadArtifactTags) return null;              // actually used tags — all good
  if (!responseText) return null;
  if (!CODE_CLAIM_RE.test(responseText)) return null; // no claim detected
  return '[SYSTEM NOTE: The previous message described code changes but did NOT use [ARTIFACT:] tags, so nothing was actually saved. If you want to build on their idea, YOU must output the full code inside [ARTIFACT: filename.ext]...[/ARTIFACT] tags.]';
}

// ─── Artifact tag parsers ──────────────────────────────────────────────────

// Strict form: [ARTIFACT: filename] body [/ARTIFACT]
const ARTIFACT_TAG_STRICT = /\[ARTIFACT:\s*([^\]]+)\]([\s\S]*?)\[\/ARTIFACT\]/g;
// Forgiving form (when agents forget the closing tag):
//   [ARTIFACT: filename] then a fenced code block ```lang ... ``` and nothing more.
// Captures the filename and the inner code (without fences).
const ARTIFACT_TAG_FENCED = /\[ARTIFACT:\s*([^\]]+)\]\s*```(?:\w+)?\n([\s\S]*?)\n```/g;

// Strip leading/trailing markdown code fences from artifact content
// (in case the agent wrapped the inner code in fences inside [ARTIFACT:]...[/ARTIFACT])
function stripCodeFences(content) {
  let out = content.trim();
  out = out.replace(/^```\w*\s*\n/, '');
  out = out.replace(/\n```\s*$/, '');
  return out.trim();
}

function parseArtifactTags(text) {
  const results = [];
  const seen = new Set();
  let m;

  ARTIFACT_TAG_STRICT.lastIndex = 0;
  while ((m = ARTIFACT_TAG_STRICT.exec(text)) !== null) {
    const filename = m[1].trim();
    const content = stripCodeFences(m[2]);
    const key = filename + '|' + content.length;
    if (!seen.has(key)) {
      results.push({ filename, content });
      seen.add(key);
    }
  }
  ARTIFACT_TAG_STRICT.lastIndex = 0;

  // Fallback: catch malformed tags missing [/ARTIFACT]
  ARTIFACT_TAG_FENCED.lastIndex = 0;
  while ((m = ARTIFACT_TAG_FENCED.exec(text)) !== null) {
    const filename = m[1].trim();
    const content = m[2].trim();
    const key = filename + '|' + content.length;
    if (!seen.has(key)) {
      results.push({ filename, content });
      seen.add(key);
    }
  }
  ARTIFACT_TAG_FENCED.lastIndex = 0;

  return results;
}

function stripArtifactTags(text) {
  let out = text.replace(ARTIFACT_TAG_STRICT, '');
  ARTIFACT_TAG_STRICT.lastIndex = 0;
  out = out.replace(ARTIFACT_TAG_FENCED, '');
  ARTIFACT_TAG_FENCED.lastIndex = 0;
  return out.trim();
}

// Export singleton instance
export const orchestrator = new ChatOrchestrator();
