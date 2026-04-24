/**
 * TraceStore
 * ──────────
 * Captures every workflow event as it happens and persists a complete,
 * replayable trace per workflow run.
 *
 * Why this exists separately from `workflowLibrary.checkpoints`:
 *   - Checkpoints exist to *resume* a failed workflow — they only store the
 *     latest state of completed steps and intentionally drop event history.
 *   - Traces exist to *observe* a run — every state transition, every
 *     resolved input, every chunk of streamed text, with timing metadata.
 *
 * The TraceViewer UI consumes these in two modes:
 *   1. Live: subscribe to SSE and accumulate events client-side.
 *   2. Replay: GET /api/traces/:id and render a finished run.
 *
 * Persistence path: <WORKFLOW_DATA_DIR>/traces/*.json  (one file per workflow id)
 */

import { readdir, readFile, writeFile, mkdir, unlink, stat } from 'fs/promises';
import { join } from 'path';

// Per-step type cost estimates (USD). Honest rough numbers — surfaced in the
// UI so engineers see cost as a first-class concern, not an afterthought.
// Refine these as Google publishes firmer pricing.
const COST_TABLE = {
  synth_image:    { perCall: 0.0400, label: 'Imagen / Gemini image' },
  synth_video:    { perSecond: 0.350, label: 'Veo video (per second)' },
  synth_text:     { perCall: 0.0010, label: 'Gemini text' },
  synth_template: { perCall: 0.0010, label: 'Gemini template' },
  synth_story:    { perCall: 0.0010, label: 'Gemini story' },
  synth_narrative:{ perCall: 0.0015, label: 'Gemini narrative' },
  synth_analyze:  { perCall: 0.0020, label: 'Gemini vision' },
  synth_transform:{ perCall: 0.0420, label: 'Vision + Imagen' },
  synth_remix_template: { perCall: 0.0010, label: 'Gemini text' },
  synth_fetch:    { perCall: 0.0000, label: 'HTTP fetch (no LLM)' },
  loop:           { perCall: 0.0000, label: 'Control-flow only' },
};

/** Estimate cost for a single completed step. Returns USD as a number. */
export function estimateStepCost(stepType, result = {}) {
  const entry = COST_TABLE[stepType];
  if (!entry) return 0;
  if (entry.perSecond) {
    const seconds = Number(result.duration) || Number(result.durationSeconds) || 8;
    return Number((entry.perSecond * seconds).toFixed(4));
  }
  return Number((entry.perCall || 0).toFixed(4));
}

class TraceStore {
  constructor(dataDir) {
    this._dir = dataDir
      || process.env.WORKFLOW_TRACES_DIR
      || join(process.env.WORKFLOW_DATA_DIR || join(process.cwd(), 'data', 'workflows'), 'traces');
    this._ready = mkdir(this._dir, { recursive: true }).catch(err =>
      console.error('[TraceStore] Failed to create traces dir:', err)
    );
    /** workflowId → { meta, events[], steps{}, totals } */
    this._active = new Map();
  }

  async _wait() { await this._ready; }

  /**
   * Single entry point — every broadcast event flows through here.
   * Mutates the in-memory trace and persists on terminal events.
   */
  record(event, data = {}) {
    const wfId = data.workflowId;
    if (!wfId) return;

    let trace = this._active.get(wfId);
    if (!trace) {
      trace = this._newTrace(wfId, data);
      this._active.set(wfId, trace);
    }

    // Append a normalized event entry. We keep the raw payload alongside a
    // few hoisted fields so the UI doesn't need to know event-type schemas.
    trace.events.push({
      t: Date.now() - trace.startMs,    // ms since trace start
      event,
      data,
    });

    // Per-event aggregations
    switch (event) {
      case 'workflow_start':
        trace.meta.name = data.name || trace.meta.name;
        trace.meta.agentId = data.agentId ?? trace.meta.agentId;
        trace.meta.agentName = data.agentName ?? trace.meta.agentName;
        trace.meta.agentColor = data.agentColor ?? trace.meta.agentColor;
        trace.meta.sessionId = data.sessionId ?? trace.meta.sessionId;
        trace.meta.messageId = data.messageId ?? trace.meta.messageId;
        // Seed step entries from the announced DAG so the UI can render the
        // full graph immediately (before any step has run).
        for (const s of data.steps || []) {
          if (!trace.steps[s.id]) {
            trace.steps[s.id] = {
              id: s.id, type: s.type,
              dependsOn: s.dependsOn || [],
              status: 'pending',
              startedMs: null, completedMs: null, durationMs: null,
              inputs: null, outputSummary: null,
              error: null, attempts: 0,
              costUsd: 0,
            };
          }
        }
        break;

      case 'workflow_step_start': {
        const st = this._ensureStep(trace, data.stepId, data.stepType);
        st.startedMs = Date.now() - trace.startMs;
        st.status = 'running';
        st.attempts += 1;
        if (data.inputs) st.inputs = sanitizeForTrace(data.inputs);
        if (data.dependsOn) st.dependsOn = data.dependsOn;
        break;
      }

      case 'workflow_step_chunk': {
        const st = this._ensureStep(trace, data.stepId);
        st.chunks = (st.chunks || 0) + 1;
        // Keep only the most recent chunk preview to bound memory
        st.lastChunk = (data.text || '').slice(-200);
        break;
      }

      case 'workflow_step_retry': {
        const st = this._ensureStep(trace, data.stepId, data.stepType);
        st.lastRetryError = data.error;
        break;
      }

      case 'workflow_step_complete': {
        const st = this._ensureStep(trace, data.stepId, data.stepType);
        st.completedMs = Date.now() - trace.startMs;
        st.durationMs = st.startedMs != null ? st.completedMs - st.startedMs : null;
        st.status = data.summary?.skipped ? 'skipped' : 'complete';
        st.outputSummary = sanitizeForTrace(data.summary || {});
        st.costUsd = estimateStepCost(st.type, data.summary || {});
        trace.totals.costUsd = Number(
          (trace.totals.costUsd + st.costUsd).toFixed(4)
        );
        trace.totals.completedSteps += 1;
        break;
      }

      case 'workflow_step_error': {
        const st = this._ensureStep(trace, data.stepId, data.stepType);
        st.completedMs = Date.now() - trace.startMs;
        st.durationMs = st.startedMs != null ? st.completedMs - st.startedMs : null;
        st.status = 'failed';
        st.error = data.error;
        trace.totals.failedSteps += 1;
        break;
      }

      case 'workflow_loop_iteration': {
        const st = this._ensureStep(trace, data.loopStepId, 'loop');
        st.iterations = data.total;
        st.currentIteration = data.iteration;
        break;
      }

      case 'workflow_complete':
      case 'workflow_error':
      case 'workflow_cancelled':
        trace.meta.status = data.status || (event === 'workflow_complete' ? 'complete' : event.replace('workflow_', ''));
        trace.meta.completedAt = new Date().toISOString();
        trace.totals.durationMs = Date.now() - trace.startMs;
        // Persist asynchronously; don't block the broadcast pipeline
        this._persist(trace).catch(err =>
          console.error('[TraceStore] persist failed:', err.message)
        );
        // Keep in-memory copy briefly for instant replay; evict after 5 min
        setTimeout(() => this._active.delete(wfId), 5 * 60 * 1000).unref?.();
        break;
    }
  }

  _newTrace(wfId, data) {
    return {
      meta: {
        workflowId: wfId,
        name: data.name || 'Workflow',
        agentId: data.agentId || null,
        agentName: data.agentName || null,
        agentColor: data.agentColor || null,    // tint trace nodes by which agent triggered it
        sessionId: data.sessionId || null,      // group traces by chat session
        messageId: data.messageId || null,      // back-link to the originating chat message
        startedAt: new Date().toISOString(),
        completedAt: null,
        status: 'running',
      },
      startMs: Date.now(),
      events: [],
      steps: {},        // stepId → enriched step record
      totals: {
        durationMs: 0,
        costUsd: 0,
        completedSteps: 0,
        failedSteps: 0,
      },
    };
  }

  _ensureStep(trace, stepId, stepType) {
    if (!trace.steps[stepId]) {
      trace.steps[stepId] = {
        id: stepId, type: stepType || 'unknown',
        dependsOn: [], status: 'pending',
        startedMs: null, completedMs: null, durationMs: null,
        inputs: null, outputSummary: null, error: null,
        attempts: 0, costUsd: 0,
      };
    }
    if (stepType && trace.steps[stepId].type === 'unknown') {
      trace.steps[stepId].type = stepType;
    }
    return trace.steps[stepId];
  }

  async _persist(trace) {
    await this._wait();
    const path = join(this._dir, `${trace.meta.workflowId}.json`);
    const payload = {
      ...trace.meta,
      totals: trace.totals,
      steps: trace.steps,
      // Cap event log size on disk to keep traces browsable; full chunks
      // are summarized into per-step counts already.
      events: trace.events.slice(0, 5000),
    };
    await writeFile(path, JSON.stringify(payload, null, 2), 'utf8');
  }

  // ── Public read API (used by /api/traces routes) ───────────────────────────

  /** Look up an in-flight trace without hitting disk. */
  getActive(workflowId) {
    const t = this._active.get(workflowId);
    if (!t) return null;
    return { ...t.meta, totals: t.totals, steps: t.steps, events: t.events };
  }

  /** Read a persisted trace from disk. */
  async get(workflowId) {
    await this._wait();
    try {
      const raw = await readFile(join(this._dir, `${workflowId}.json`), 'utf8');
      return JSON.parse(raw);
    } catch {
      return this.getActive(workflowId);
    }
  }

  /**
   * List trace summaries (most recent first), merging in-flight + persisted.
   * Returns lightweight rows for the trace browser UI.
   */
  async list(limit = 50) {
    await this._wait();
    const rows = [];

    // In-flight runs
    for (const [, t] of this._active) {
      rows.push({
        workflowId: t.meta.workflowId,
        name: t.meta.name,
        status: t.meta.status,
        agentName: t.meta.agentName,
        agentColor: t.meta.agentColor,
        sessionId: t.meta.sessionId,
        startedAt: t.meta.startedAt,
        completedAt: t.meta.completedAt,
        durationMs: t.totals.durationMs,
        costUsd: t.totals.costUsd,
        stepCount: Object.keys(t.steps).length,
        live: true,
      });
    }

    // Persisted runs
    let files = [];
    try { files = await readdir(this._dir); } catch { /* dir may be empty */ }

    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const wfId = f.slice(0, -5);
      if (this._active.has(wfId)) continue; // prefer live entry

      try {
        const path = join(this._dir, f);
        const [s, raw] = await Promise.all([stat(path), readFile(path, 'utf8')]);
        const t = JSON.parse(raw);
        rows.push({
          workflowId: t.workflowId,
          name: t.name,
          status: t.status,
          agentName: t.agentName,
          agentColor: t.agentColor,
          sessionId: t.sessionId,
          startedAt: t.startedAt,
          completedAt: t.completedAt,
          durationMs: t.totals?.durationMs ?? 0,
          costUsd: t.totals?.costUsd ?? 0,
          stepCount: Object.keys(t.steps || {}).length,
          mtime: s.mtimeMs,
          live: false,
        });
      } catch { /* skip corrupt files */ }
    }

    rows.sort((a, b) => {
      const aT = a.live ? Date.now() : (a.mtime || Date.parse(a.startedAt) || 0);
      const bT = b.live ? Date.now() : (b.mtime || Date.parse(b.startedAt) || 0);
      return bT - aT;
    });

    return rows.slice(0, limit);
  }

  async delete(workflowId) {
    await this._wait();
    this._active.delete(workflowId);
    try { await unlink(join(this._dir, `${workflowId}.json`)); return true; }
    catch { return false; }
  }
}

/**
 * Strip large binary fields and cap string sizes so traces stay readable
 * on disk and don't OOM the UI. Any base64 image/video data is summarized
 * to "<base64:N bytes>" placeholders.
 */
function sanitizeForTrace(value, depth = 0) {
  if (depth > 4) return '[…]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.length > 800) return `${value.slice(0, 800)}… <+${value.length - 800} chars>`;
    return value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(v => sanitizeForTrace(v, depth + 1));
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    // Drop obvious raw-media fields entirely
    if ((k === 'image' || k === 'video') && typeof v === 'string' && v.length > 500) {
      out[k] = `<base64:${v.length} bytes>`;
      continue;
    }
    out[k] = sanitizeForTrace(v, depth + 1);
  }
  return out;
}

export const traceStore = new TraceStore();
