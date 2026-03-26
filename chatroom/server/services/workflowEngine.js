import { v4 as uuidv4 } from 'uuid';
import { synthClient } from './synthClient.js';
import { mediaStore } from './mediaStore.js';

/**
 * WorkflowEngine — executes multi-step creative pipelines.
 *
 * Workflow definition schema:
 * {
 *   name: string,
 *   steps: [
 *     {
 *       id: string,          — unique within this workflow
 *       type: string,        — synth_image | synth_video | synth_template | synth_story |
 *                               synth_narrative | synth_analyze | synth_transform
 *       params: object,      — tool-specific params; may contain {{stepId.field}} templates
 *       dependsOn?: string[] — step ids this step waits for (default: [])
 *     },
 *     ...
 *   ]
 * }
 *
 * Template syntax: any string param value can contain {{stepId.field}} which is
 * replaced at execution time with the named field from that step's result object.
 * e.g. "{{tpl.promptTemplate}}" or "{{img1.mediaId}}"
 */

// ─── Template interpolation ──────────────────────────────────────────────────

const TEMPLATE_RE = /\{\{(\w+)\.(\w+)\}\}/g;

/**
 * Deep-clone an object and interpolate all {{stepId.field}} placeholders.
 * @param {*}      value     - params value (object/array/string/other)
 * @param {Map}    results   - stepId → result object
 * @returns {*} interpolated copy
 */
function interpolate(value, results) {
  if (typeof value === 'string') {
    return value.replace(TEMPLATE_RE, (_match, stepId, field) => {
      const res = results.get(stepId);
      if (!res) return _match; // leave unresolved placeholder as-is
      const val = res[field];
      return val !== undefined && val !== null ? String(val) : _match;
    });
  }
  if (Array.isArray(value)) {
    return value.map(item => interpolate(item, results));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = interpolate(v, results);
    }
    return out;
  }
  return value;
}

// ─── Dependency / wave builder ────────────────────────────────────────────────

/**
 * Arrange steps into execution waves (topological sort).
 * Steps in the same wave have no inter-dependencies and can run in parallel.
 * @param {Array} steps  - workflow steps (each has id + dependsOn)
 * @returns {Array<string[]>}  ordered waves, each wave is an array of step ids
 */
function buildWaves(steps) {
  const placed = new Set();
  const stepMap = new Map(steps.map(s => [s.id, s]));
  const waves = [];

  // Guard against circular deps
  let remaining = steps.map(s => s.id);
  let safetyCount = 0;

  while (remaining.length > 0 && safetyCount++ < steps.length + 1) {
    const wave = remaining.filter(id => {
      const step = stepMap.get(id);
      return (step.dependsOn || []).every(dep => placed.has(dep));
    });

    if (wave.length === 0) {
      // Circular or unsatisfiable deps — schedule remaining as a single wave
      waves.push([...remaining]);
      break;
    }

    waves.push(wave);
    wave.forEach(id => placed.add(id));
    remaining = remaining.filter(id => !placed.has(id));
  }

  return waves;
}

// ─── Synth call dispatcher ────────────────────────────────────────────────────

/**
 * Given a step type and interpolated params, call the correct synthClient method.
 * Returns the raw API response, augmented with mediaId if media was stored.
 */
async function dispatchSynth(type, params, agentId = null, agentName = null) {
  switch (type) {
    case 'synth_image': {
      const { prompt, ...opts } = params;
      const res = await synthClient.generateImage(prompt || '', opts);
      if (res.image) {
        const mediaId = uuidv4();
        mediaStore.add({
          id: mediaId, type: 'image', data: res.image, mimeType: 'image/png',
          prompt: prompt || '', agentId, agentName
        });
        return { ...res, mediaId, mediaType: 'image' };
      }
      return res;
    }

    case 'synth_video': {
      const { prompt, ...opts } = params;
      const res = await synthClient.generateVideo(prompt || '', opts);
      if (res.video) {
        const mediaId = uuidv4();
        mediaStore.add({
          id: mediaId, type: 'video', data: res.video, mimeType: 'video/mp4',
          prompt: prompt || '', agentId, agentName
        });
        return { ...res, mediaId, mediaType: 'video' };
      }
      return res;
    }

    case 'synth_template': {
      const { description, mode = 'text' } = params;
      return synthClient.generateTemplate(description || '', mode);
    }

    case 'synth_story': {
      const { description } = params;
      return synthClient.generateTemplate(description || '', 'story');
    }

    case 'synth_narrative': {
      const { descriptions = [], mode = 'story' } = params;
      return synthClient.generateNarrative(
        Array.isArray(descriptions) ? descriptions : [descriptions],
        mode
      );
    }

    case 'synth_analyze': {
      // image_id may be a mediaStore id or raw base64
      const imageRef = params.image_id || params.image || '';
      const media = mediaStore.get(imageRef);
      const imageBase64 = media?.data || imageRef;
      return synthClient.analyzeImage(imageBase64);
    }

    case 'synth_transform': {
      const imageRef = params.image_id || params.image || '';
      const media = mediaStore.get(imageRef);
      const imageBase64 = media?.data || imageRef;
      const intent = params.intent || '';
      const res = await synthClient.smartTransform(imageBase64, intent);
      if (res.image) {
        const mediaId = uuidv4();
        mediaStore.add({
          id: mediaId, type: 'image', data: res.image, mimeType: 'image/png',
          prompt: intent, agentId, agentName
        });
        return { ...res, mediaId, mediaType: 'image' };
      }
      return res;
    }

    default:
      throw new Error(`Unknown workflow step type: ${type}`);
  }
}

// ─── WorkflowState helpers ────────────────────────────────────────────────────

function makeStep(def) {
  return {
    id: def.id,
    type: def.type,
    params: def.params || {},
    dependsOn: def.dependsOn || [],
    status: 'pending', // pending | running | complete | failed
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
  };
}

// ─── WorkflowEngine class ─────────────────────────────────────────────────────

class WorkflowEngine {
  constructor() {
    /** @type {Map<string, object>} workflowId → state */
    this._workflows = new Map();
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Submit a new workflow for execution.
   * @param {object}   workflowDef   - { name, steps }
   * @param {object}   options
   * @param {Function} options.broadcast      - fn(event, data) for SSE
   * @param {string}   [options.agentId]      - originating agent (for media attribution)
   * @param {string}   [options.agentName]
   * @returns {string} workflowId
   */
  submit(workflowDef, { broadcast = () => {}, agentId = null, agentName = null } = {}) {
    const id = uuidv4();

    const state = {
      id,
      name: workflowDef.name || 'Unnamed Workflow',
      steps: (workflowDef.steps || []).map(makeStep),
      status: 'running',
      broadcast,
      agentId,
      agentName,
      cancelled: false,
      startedAt: new Date().toISOString(),
      completedAt: null,
      /** stepId → result (populated as steps complete) */
      results: new Map(),
    };

    this._workflows.set(id, state);

    broadcast('workflow_start', {
      workflowId: id,
      name: state.name,
      stepCount: state.steps.length,
      agentId,
    });

    // Run asynchronously; errors are surfaced via broadcast
    this._execute(state).catch(err => {
      state.status = 'failed';
      broadcast('workflow_error', { workflowId: id, error: err.message });
    });

    return id;
  }

  /**
   * Get a summary of a running/completed workflow.
   * @param {string} workflowId
   * @returns {object|null}
   */
  getStatus(workflowId) {
    const state = this._workflows.get(workflowId);
    if (!state) return null;

    return {
      id: state.id,
      name: state.name,
      status: state.status,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      steps: state.steps.map(s => ({
        id: s.id,
        type: s.type,
        status: s.status,
        error: s.error || undefined,
        startedAt: s.startedAt || undefined,
        completedAt: s.completedAt || undefined,
        // Include non-binary result fields for status inspection
        result: s.result
          ? Object.fromEntries(
              Object.entries(s.result).filter(([k, v]) =>
                typeof v !== 'string' || v.length < 500
              )
            )
          : null,
      })),
    };
  }

  /**
   * Cancel a running workflow.
   * @param {string} workflowId
   * @returns {boolean} true if found and cancelled
   */
  cancel(workflowId) {
    const state = this._workflows.get(workflowId);
    if (!state || state.status !== 'running') return false;
    state.cancelled = true;
    state.status = 'cancelled';
    state.broadcast('workflow_cancelled', { workflowId });
    return true;
  }

  // --------------------------------------------------------------------------
  // Internal execution
  // --------------------------------------------------------------------------

  async _execute(state) {
    const waves = buildWaves(state.steps);

    for (const wave of waves) {
      if (state.cancelled) break;

      // Execute all steps in this wave in parallel
      await Promise.all(wave.map(stepId => this._executeStep(state, stepId)));

      // If any step in this wave failed, abort remaining waves
      const waveFailed = state.steps
        .filter(s => wave.includes(s.id))
        .some(s => s.status === 'failed');

      if (waveFailed) break;
    }

    if (!state.cancelled) {
      const allComplete = state.steps.every(s => s.status === 'complete');
      state.status = allComplete ? 'complete' : 'failed';
    }

    state.completedAt = new Date().toISOString();

    state.broadcast('workflow_complete', {
      workflowId: state.id,
      name: state.name,
      status: state.status,
      completedAt: state.completedAt,
      agentId: state.agentId,
      stepResults: state.steps.map(s => ({
        id: s.id,
        type: s.type,
        status: s.status,
        // Pass through lightweight fields (skip raw base64)
        ...(s.result
          ? Object.fromEntries(
              Object.entries(s.result).filter(([, v]) =>
                typeof v !== 'string' || v.length < 500
              )
            )
          : {}),
      })),
    });
  }

  async _executeStep(state, stepId) {
    if (state.cancelled) return;

    const step = state.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = 'running';
    step.startedAt = new Date().toISOString();

    state.broadcast('workflow_step_start', {
      workflowId: state.id,
      stepId,
      stepType: step.type,
      agentId: state.agentId,
    });

    try {
      // Resolve {{stepId.field}} placeholders in params
      const resolvedParams = interpolate(step.params, state.results);

      // Call Synthograsizer
      const result = await dispatchSynth(step.type, resolvedParams, state.agentId, state.agentName);

      step.result = result;
      step.status = 'complete';
      step.completedAt = new Date().toISOString();
      state.results.set(stepId, result);

      state.broadcast('workflow_step_complete', {
        workflowId: state.id,
        stepId,
        stepType: step.type,
        agentId: state.agentId,
        // Lightweight result summary (skip base64 blobs)
        summary: Object.fromEntries(
          Object.entries(result).filter(([, v]) =>
            typeof v !== 'string' || v.length < 500
          )
        ),
      });
    } catch (err) {
      step.error = err.message;
      step.status = 'failed';
      step.completedAt = new Date().toISOString();

      state.broadcast('workflow_step_error', {
        workflowId: state.id,
        stepId,
        stepType: step.type,
        agentId: state.agentId,
        error: err.message,
      });
    }
  }
}

// Singleton export
export const workflowEngine = new WorkflowEngine();

// ─── Tag parsing helpers (used by tools.js) ───────────────────────────────────

/**
 * Extract [WORKFLOW: {...}] tags from text.
 * Uses brace-counting to handle JSON objects that contain nested [] arrays.
 * @param {string} text
 * @returns {Array<{ fullMatch: string, jsonStr: string }>}
 */
export function extractWorkflowTags(text) {
  const TAG = '[WORKFLOW:';
  const found = [];
  let searchFrom = 0;

  while (true) {
    const tagStart = text.indexOf(TAG, searchFrom);
    if (tagStart === -1) break;

    // Find the opening brace of the JSON object
    let jsonStart = -1;
    for (let i = tagStart + TAG.length; i < text.length; i++) {
      if (text[i] === '{') { jsonStart = i; break; }
      if (text[i] !== ' ' && text[i] !== '\n' && text[i] !== '\r') {
        // Non-whitespace before '{' — malformed tag, skip
        break;
      }
    }
    if (jsonStart === -1) { searchFrom = tagStart + 1; continue; }

    // Count braces to find matching closing brace
    let depth = 0;
    let jsonEnd = -1;
    for (let i = jsonStart; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) { jsonEnd = i; break; }
      }
    }
    if (jsonEnd === -1) { searchFrom = tagStart + 1; continue; }

    // After json object, expect optional whitespace then ']'
    let closeIdx = -1;
    for (let i = jsonEnd + 1; i < text.length; i++) {
      if (text[i] === ']') { closeIdx = i; break; }
      if (text[i] !== ' ' && text[i] !== '\n' && text[i] !== '\r') break;
    }
    if (closeIdx === -1) { searchFrom = tagStart + 1; continue; }

    const fullMatch = text.slice(tagStart, closeIdx + 1);
    const jsonStr = text.slice(jsonStart, jsonEnd + 1);
    found.push({ fullMatch, jsonStr });
    searchFrom = closeIdx + 1;
  }

  return found;
}

/**
 * Parse all workflow-related tags from agent response text.
 * Returns array of request objects with type + payload.
 */
export function parseWorkflowRequests(text) {
  const requests = [];

  // [WORKFLOW: {...}]
  for (const { fullMatch, jsonStr } of extractWorkflowTags(text)) {
    let definition = null;
    try { definition = JSON.parse(jsonStr); } catch (e) {
      requests.push({ type: 'workflow_parse_error', fullMatch, error: `Invalid JSON: ${e.message}` });
      continue;
    }
    requests.push({ type: 'workflow', fullMatch, definition });
  }

  // [WORKFLOW_STATUS: workflow_id]
  const statusPattern = /\[WORKFLOW_STATUS:\s*([\w-]+)\s*\]/gi;
  let m;
  while ((m = statusPattern.exec(text)) !== null) {
    requests.push({ type: 'workflow_status', fullMatch: m[0], workflowId: m[1].trim() });
  }

  // [WORKFLOW_CANCEL: workflow_id]
  const cancelPattern = /\[WORKFLOW_CANCEL:\s*([\w-]+)\s*\]/gi;
  while ((m = cancelPattern.exec(text)) !== null) {
    requests.push({ type: 'workflow_cancel', fullMatch: m[0], workflowId: m[1].trim() });
  }

  return requests;
}

/**
 * Strip all workflow tags from text.
 */
export function stripWorkflowTags(text) {
  // Strip STATUS and CANCEL tags (simple regex)
  let cleaned = text
    .replace(/\[WORKFLOW_STATUS:\s*[\w-]+\s*\]/gi, '')
    .replace(/\[WORKFLOW_CANCEL:\s*[\w-]+\s*\]/gi, '');

  // Strip [WORKFLOW: {...}] using brace-counting extractor
  for (const { fullMatch } of extractWorkflowTags(cleaned)) {
    cleaned = cleaned.replace(fullMatch, '');
  }

  return cleaned.trim();
}
