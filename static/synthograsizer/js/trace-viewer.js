/**
 * TraceViewer — Agentic Trace Viewer modal for the Synthograsizer.
 *
 * Reads workflow traces from the chatroom workflow engine and renders them
 * as a DAG with per-step details, timing, cost, and agent attribution.
 *
 * Two consumption modes:
 *   1. Live  — subscribes to /chatroom/api/chat/stream and updates as events arrive.
 *   2. Replay — fetches /chatroom/api/traces/:id and renders a finished run.
 *
 * Visual conventions:
 *   - Nodes are positioned by topological wave (column = wave, row = order in wave).
 *   - Node fill   = agent color (pastel) when attributable, else neutral.
 *   - Node border = status color (pending/running/complete/failed/skipped).
 *   - Edges drawn from `dependsOn`.
 *   - Session lens at the bottom groups recent traces by chat session.
 */
class TraceViewer {
  constructor(studioIntegration) {
    this.studio = studioIntegration;
    this.CHATROOM_API = '/chatroom/api';

    this.traces = [];          // list view rows
    this.currentTrace = null;  // full trace object
    this.selectedStepId = null;
    this.eventSource = null;
    this._refreshTimer = null;
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  async init() {
    this.studio.createModal('trace-viewer-modal', '🔍 Agentic Trace Viewer', this._buildModalHTML());
    this._injectStyles();
    this._bindEvents();
    this._bindLifecycleCleanup();
  }

  open() {
    const modal = document.getElementById('trace-viewer-modal');
    if (!modal) return;
    modal.classList.add('active');
    this._refreshList();
    // Light polling so newly arrived live traces show up without manual refresh
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = setInterval(() => this._refreshList({ silent: true }), 5000);
    this._connectLiveStream();
  }

  close() {
    const modal = document.getElementById('trace-viewer-modal');
    if (modal) modal.classList.remove('active');
    this._cleanup();
  }

  _cleanup() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    this._disconnectLiveStream();
  }

  _bindLifecycleCleanup() {
    const modalEl = document.getElementById('trace-viewer-modal');
    if (modalEl) {
      const observer = new MutationObserver(() => {
        const visible = modalEl.classList.contains('active');
        if (!visible) this._cleanup();
      });
      observer.observe(modalEl, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    window.addEventListener('beforeunload', () => this._cleanup());
  }

  // ─── Modal markup ──────────────────────────────────────────────────────────

  _buildModalHTML() {
    return `
      <div id="tv-root" class="tv-root">
        <!-- Top status strip -->
        <div class="tv-strip" id="tv-strip">
          <div class="tv-strip-left">
            <span class="tv-strip-name" id="tv-strip-name">Select a trace</span>
            <span class="tv-pill" id="tv-strip-status"></span>
          </div>
          <div class="tv-strip-right">
            <span class="tv-stat"><label>steps</label><span id="tv-stat-steps">—</span></span>
            <span class="tv-stat"><label>duration</label><span id="tv-stat-duration">—</span></span>
            <span class="tv-stat tv-stat-cost"><label>cost</label><span id="tv-stat-cost">—</span></span>
            <button class="tv-icon-btn" id="tv-refresh-btn" title="Refresh">↻</button>
          </div>
        </div>

        <!-- Two-pane main area -->
        <div class="tv-main">
          <div class="tv-left">
            <div class="tv-canvas-wrap">
              <svg id="tv-canvas" class="tv-canvas" xmlns="http://www.w3.org/2000/svg"></svg>
              <div class="tv-empty" id="tv-empty">
                <div style="font-size:38px; opacity:.3;">⊟</div>
                <div style="margin-top:8px; font-size:13px; color:#888;">
                  Pick a workflow from the lens below, or trigger one from the Agent Studio.
                </div>
              </div>
            </div>
          </div>
          <div class="tv-right">
            <div class="tv-detail" id="tv-detail">
              <div class="tv-empty-detail">Select a node to inspect inputs, outputs, and timing.</div>
            </div>
          </div>
        </div>

        <!-- Session lens -->
        <div class="tv-lens">
          <div class="tv-lens-header">
            <span>Session Lens</span>
            <span class="tv-lens-hint" id="tv-lens-count">—</span>
          </div>
          <div class="tv-lens-body" id="tv-lens-body">
            <div class="tv-lens-empty">No traces yet. Run a workflow from the Workflows modal or the Agent Studio.</div>
          </div>
        </div>
      </div>
    `;
  }

  _injectStyles() {
    if (document.getElementById('tv-styles')) return;
    const style = document.createElement('style');
    style.id = 'tv-styles';
    style.textContent = `
      #trace-viewer-modal .studio-modal-content { max-width: 1100px; width: 95vw; }
      #trace-viewer-modal .studio-modal-body    { padding: 0; }
      .tv-root { display:flex; flex-direction:column; height:78vh; min-height:560px; font-size:13px; color:#333; }

      .tv-strip { display:flex; align-items:center; justify-content:space-between;
                  padding:10px 14px; background:#fafafa; border-bottom:1px solid #e9e9e9; }
      .tv-strip-left  { display:flex; align-items:center; gap:10px; min-width:0; }
      .tv-strip-right { display:flex; align-items:center; gap:14px; }
      .tv-strip-name  { font-weight:600; font-size:13px; white-space:nowrap; overflow:hidden;
                        text-overflow:ellipsis; max-width:380px; }
      .tv-pill        { font-size:10px; text-transform:uppercase; letter-spacing:.5px;
                        padding:2px 8px; border-radius:10px; background:#eee; color:#666; }
      .tv-pill.running  { background:#fff3e0; color:#e65100; }
      .tv-pill.complete { background:#e8f5e9; color:#2e7d32; }
      .tv-pill.failed   { background:#ffebee; color:#c62828; }
      .tv-pill.cancelled{ background:#f3e5f5; color:#6a1b9a; }
      .tv-stat        { display:flex; flex-direction:column; align-items:flex-end; line-height:1.1; }
      .tv-stat label  { font-size:9px; text-transform:uppercase; letter-spacing:.5px; color:#999; }
      .tv-stat span   { font-size:13px; font-weight:600; color:#333; font-variant-numeric:tabular-nums; }
      .tv-stat-cost span { color:#2e7d32; }
      .tv-icon-btn    { background:none; border:1px solid #ddd; width:28px; height:28px;
                        border-radius:50%; cursor:pointer; font-size:14px; color:#666; }
      .tv-icon-btn:hover { background:#f3f3f3; }

      .tv-main { display:flex; flex:1 1 auto; min-height:0; }
      .tv-left  { flex:1 1 60%; min-width:0; border-right:1px solid #e9e9e9; position:relative; }
      .tv-right { flex:1 1 40%; min-width:300px; overflow:auto; background:#fcfcfc; }

      .tv-canvas-wrap { position:absolute; inset:0; overflow:auto; }
      .tv-canvas      { display:block; min-width:100%; min-height:100%; }
      .tv-empty       { position:absolute; inset:0; display:flex; flex-direction:column;
                        align-items:center; justify-content:center; pointer-events:none;
                        text-align:center; padding:20px; }

      .tv-node-rect    { stroke-width:2.5; rx:7; ry:7; cursor:pointer; transition:filter .15s; }
      .tv-node-rect:hover { filter:brightness(1.05); }
      .tv-node-rect.selected { stroke-width:4; }
      .tv-node-label   { font-size:11px; font-weight:600; fill:#222; pointer-events:none;
                         font-family:'Inter','Segoe UI',sans-serif; }
      .tv-node-sub     { font-size:9px; fill:#666; pointer-events:none;
                         font-family:'Roboto Mono',monospace; }
      .tv-node-cost    { font-size:9px; fill:#2e7d32; pointer-events:none; font-weight:600; }
      .tv-edge         { stroke:#cfcfcf; stroke-width:1.5; fill:none; }
      .tv-edge.active  { stroke:#f0a500; stroke-width:2; }

      .tv-detail       { padding:14px 16px; }
      .tv-empty-detail { color:#999; font-size:12px; padding:24px 8px; text-align:center; }
      .tv-detail-h     { font-size:13px; font-weight:700; color:#333; margin:0 0 4px;
                         display:flex; align-items:center; gap:8px; }
      .tv-detail-meta  { font-size:11px; color:#888; margin-bottom:14px; }
      .tv-section      { margin-bottom:14px; }
      .tv-section-title{ font-size:10px; text-transform:uppercase; letter-spacing:.5px;
                         color:#999; margin-bottom:4px; font-weight:600; }
      .tv-kv           { display:grid; grid-template-columns:auto 1fr; gap:4px 12px;
                         font-size:11px; }
      .tv-kv label     { color:#888; }
      .tv-kv span      { font-variant-numeric:tabular-nums; color:#333; }
      .tv-json         { background:#f5f5f7; border:1px solid #eee; border-radius:5px;
                         padding:8px 10px; font-family:'Roboto Mono',monospace; font-size:11px;
                         max-height:200px; overflow:auto; white-space:pre-wrap; word-break:break-word; }
      .tv-error-block  { background:#ffebee; color:#c62828; border:1px solid #ffcdd2;
                         border-radius:5px; padding:8px 10px; font-size:11px;
                         font-family:'Roboto Mono',monospace; }

      .tv-lens         { border-top:1px solid #e9e9e9; background:#fafafa; max-height:180px;
                         display:flex; flex-direction:column; min-height:80px; }
      .tv-lens-header  { display:flex; justify-content:space-between; align-items:center;
                         padding:8px 14px; font-size:11px; text-transform:uppercase;
                         letter-spacing:.5px; color:#666; font-weight:600; flex-shrink:0; }
      .tv-lens-hint    { font-size:10px; color:#999; text-transform:none; letter-spacing:0; }
      .tv-lens-body    { overflow-y:auto; padding:0 14px 12px; }
      .tv-lens-group   { margin-top:6px; }
      .tv-lens-group-h { font-size:10px; font-weight:700; color:#777; margin-bottom:4px;
                         text-transform:uppercase; letter-spacing:.5px; }
      .tv-lens-row     { display:flex; align-items:center; gap:8px; padding:4px 6px;
                         border-radius:4px; cursor:pointer; font-size:11px; }
      .tv-lens-row:hover { background:#fff; }
      .tv-lens-row.selected { background:#fff; box-shadow:0 0 0 1px #ddd inset; }
      .tv-lens-dot     { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
      .tv-lens-name    { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis;
                         white-space:nowrap; }
      .tv-lens-meta    { font-size:10px; color:#999; font-variant-numeric:tabular-nums; }
      .tv-lens-empty   { color:#999; font-size:12px; padding:14px; text-align:center; }
    `;
    document.head.appendChild(style);
  }

  _bindEvents() {
    const refresh = document.getElementById('tv-refresh-btn');
    if (refresh) refresh.onclick = () => this._refreshList();
  }

  // ─── Trace list (Session Lens) ─────────────────────────────────────────────

  async _refreshList({ silent = false } = {}) {
    try {
      const res = await fetch(`${this.CHATROOM_API}/traces?limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.traces = await res.json();
      this._renderLens();
      if (!silent && !this.currentTrace && this.traces.length) {
        // Auto-load the most recent trace on first open for instant context
        this._loadTrace(this.traces[0].workflowId);
      }
    } catch (err) {
      this._renderLensError(err.message);
    }
  }

  _renderLens() {
    const body = document.getElementById('tv-lens-body');
    const count = document.getElementById('tv-lens-count');
    if (!body) return;

    if (!this.traces.length) {
      body.innerHTML = `<div class="tv-lens-empty">No traces yet. Run a workflow from the Workflows modal or the Agent Studio.</div>`;
      if (count) count.textContent = '0 traces';
      return;
    }
    if (count) count.textContent = `${this.traces.length} trace${this.traces.length === 1 ? '' : 's'}`;

    // Group by sessionId — falls back to "ad-hoc" for runs not tied to a chat session
    const groups = new Map();
    for (const row of this.traces) {
      const key = row.sessionId || '__adhoc__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const html = [];
    for (const [sid, rows] of groups) {
      const label = sid === '__adhoc__'
        ? 'Ad-hoc runs'
        : `Session ${sid.slice(0, 8)} · ${rows[0].agentName || 'mixed agents'}`;
      html.push(`<div class="tv-lens-group">`);
      html.push(`<div class="tv-lens-group-h">${escapeHtml(label)}</div>`);
      for (const row of rows) {
        const selected = this.currentTrace?.workflowId === row.workflowId ? ' selected' : '';
        const dotColor = row.agentColor || statusColor(row.status);
        const dur = row.durationMs ? `${(row.durationMs / 1000).toFixed(1)}s` : (row.live ? 'live' : '—');
        const cost = row.costUsd != null ? `$${row.costUsd.toFixed(3)}` : '';
        html.push(`
          <div class="tv-lens-row${selected}" data-id="${escapeAttr(row.workflowId)}">
            <span class="tv-lens-dot" style="background:${escapeAttr(dotColor)}"></span>
            <span class="tv-lens-name">${escapeHtml(row.name || 'Workflow')}</span>
            <span class="tv-lens-meta">${row.stepCount || 0} steps · ${dur} · ${cost}</span>
          </div>
        `);
      }
      html.push(`</div>`);
    }
    body.innerHTML = html.join('');

    body.querySelectorAll('.tv-lens-row').forEach(el => {
      el.onclick = () => this._loadTrace(el.dataset.id);
    });
  }

  _renderLensError(msg) {
    const body = document.getElementById('tv-lens-body');
    if (body) body.innerHTML = `<div class="tv-lens-empty" style="color:#c62828;">⚠ ${escapeHtml(msg)}</div>`;
  }

  // ─── Trace detail ──────────────────────────────────────────────────────────

  async _loadTrace(workflowId) {
    try {
      const res = await fetch(`${this.CHATROOM_API}/traces/${encodeURIComponent(workflowId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.currentTrace = await res.json();
      this.selectedStepId = null;
      this._renderTrace();
      this._renderLens();
    } catch (err) {
      console.error('[TraceViewer] load failed', err);
      this.studio?.showToast?.(`Failed to load trace: ${err.message}`, 'error');
    }
  }

  _renderTrace() {
    const t = this.currentTrace;
    if (!t) return;

    const stripName = document.getElementById('tv-strip-name');
    const stripStatus = document.getElementById('tv-strip-status');
    const empty = document.getElementById('tv-empty');

    if (stripName) {
      const tag = t.agentName ? ` · ${t.agentName}` : '';
      stripName.textContent = `${t.name || 'Workflow'}${tag}`;
      if (t.agentColor) stripName.style.borderLeft = `3px solid ${t.agentColor}`;
      stripName.style.paddingLeft = t.agentColor ? '8px' : '0';
    }
    if (stripStatus) {
      stripStatus.textContent = t.status || 'running';
      stripStatus.className = `tv-pill ${t.status || 'running'}`;
    }

    document.getElementById('tv-stat-steps').textContent = `${t.totals?.completedSteps ?? 0} / ${Object.keys(t.steps || {}).length}`;
    document.getElementById('tv-stat-duration').textContent = formatDuration(t.totals?.durationMs);
    document.getElementById('tv-stat-cost').textContent = `$${(t.totals?.costUsd ?? 0).toFixed(4)}`;

    if (empty) empty.style.display = 'none';

    this._renderDAG();
    this._renderDetail();
  }

  // ─── DAG rendering ─────────────────────────────────────────────────────────

  _renderDAG() {
    const svg = document.getElementById('tv-canvas');
    if (!svg) return;
    const t = this.currentTrace;
    const steps = Object.values(t.steps || {});
    if (!steps.length) {
      svg.innerHTML = '';
      return;
    }

    // Topological wave assignment — each step's wave is 1 + max(wave of deps)
    const byId = Object.fromEntries(steps.map(s => [s.id, s]));
    const wave = {};
    const computeWave = (id, seen = new Set()) => {
      if (wave[id] != null) return wave[id];
      if (seen.has(id)) return 0;
      seen.add(id);
      const s = byId[id];
      const deps = (s?.dependsOn || []).filter(d => byId[d]);
      wave[id] = deps.length ? 1 + Math.max(...deps.map(d => computeWave(d, seen))) : 0;
      return wave[id];
    };
    steps.forEach(s => computeWave(s.id));

    // Group by wave (column), preserve definition order within
    const cols = [];
    steps.forEach(s => {
      const w = wave[s.id];
      if (!cols[w]) cols[w] = [];
      cols[w].push(s);
    });

    // Layout
    const NODE_W = 150, NODE_H = 56;
    const COL_GAP = 60, ROW_GAP = 16;
    const PAD_X = 30, PAD_Y = 20;
    const positions = {};
    const colCount = cols.length;
    const maxRows = Math.max(...cols.map(c => c.length));
    const totalW = PAD_X * 2 + colCount * NODE_W + (colCount - 1) * COL_GAP;
    const totalH = PAD_Y * 2 + maxRows * NODE_H + (maxRows - 1) * ROW_GAP;

    cols.forEach((col, ci) => {
      // Vertically center this column's nodes within the canvas
      const colHeight = col.length * NODE_H + (col.length - 1) * ROW_GAP;
      const yStart = PAD_Y + (totalH - PAD_Y * 2 - colHeight) / 2;
      col.forEach((s, ri) => {
        positions[s.id] = {
          x: PAD_X + ci * (NODE_W + COL_GAP),
          y: yStart + ri * (NODE_H + ROW_GAP),
        };
      });
    });

    svg.setAttribute('width', totalW);
    svg.setAttribute('height', totalH);
    svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);

    const agentColor = t.agentColor;
    const parts = [];

    // Edges first (under nodes)
    steps.forEach(s => {
      (s.dependsOn || []).forEach(depId => {
        const a = positions[depId];
        const b = positions[s.id];
        if (!a || !b) return;
        const x1 = a.x + NODE_W;
        const y1 = a.y + NODE_H / 2;
        const x2 = b.x;
        const y2 = b.y + NODE_H / 2;
        const cx = (x1 + x2) / 2;
        const path = `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`;
        const active = (byId[depId]?.status === 'complete' && s.status === 'running') ? ' active' : '';
        parts.push(`<path class="tv-edge${active}" d="${path}" />`);
      });
    });

    // Nodes
    steps.forEach(s => {
      const p = positions[s.id];
      const fill = nodeFill(s.status, agentColor);
      const stroke = statusColor(s.status);
      const sel = this.selectedStepId === s.id ? ' selected' : '';
      const typeShort = (s.type || '').replace('synth_', '');
      const cost = s.costUsd ? `$${s.costUsd.toFixed(4)}` : '';
      const dur = s.durationMs != null ? `${(s.durationMs / 1000).toFixed(1)}s` : '';
      const sub = [typeShort, dur].filter(Boolean).join(' · ');

      parts.push(`
        <g class="tv-node" data-id="${escapeAttr(s.id)}" transform="translate(${p.x},${p.y})">
          <rect class="tv-node-rect${sel}" width="${NODE_W}" height="${NODE_H}"
                fill="${fill}" stroke="${stroke}" />
          <text class="tv-node-label" x="10" y="20">${escapeHtml(truncate(s.id, 20))}</text>
          <text class="tv-node-sub" x="10" y="36">${escapeHtml(sub)}</text>
          ${cost ? `<text class="tv-node-cost" x="${NODE_W - 10}" y="${NODE_H - 8}" text-anchor="end">${cost}</text>` : ''}
          ${s.attempts > 1 ? `<text class="tv-node-sub" x="${NODE_W - 10}" y="20" text-anchor="end" fill="#e65100">×${s.attempts}</text>` : ''}
        </g>
      `);
    });

    svg.innerHTML = parts.join('');

    svg.querySelectorAll('.tv-node').forEach(g => {
      g.addEventListener('click', () => {
        this.selectedStepId = g.dataset.id;
        this._renderDAG();
        this._renderDetail();
      });
    });
  }

  // ─── Step detail pane ──────────────────────────────────────────────────────

  _renderDetail() {
    const detail = document.getElementById('tv-detail');
    if (!detail) return;
    const t = this.currentTrace;

    // Default: trace-level overview
    if (!this.selectedStepId) {
      const recent = (t.events || []).slice(-12).reverse();
      detail.innerHTML = `
        <h4 class="tv-detail-h">Trace overview</h4>
        <div class="tv-detail-meta">
          ${t.agentName ? `Triggered by <strong>${escapeHtml(t.agentName)}</strong> · ` : ''}
          ${escapeHtml(formatTime(t.startedAt))}
        </div>
        <div class="tv-section">
          <div class="tv-section-title">Totals</div>
          <div class="tv-kv">
            <label>Steps</label><span>${t.totals?.completedSteps ?? 0} complete · ${t.totals?.failedSteps ?? 0} failed</span>
            <label>Duration</label><span>${formatDuration(t.totals?.durationMs)}</span>
            <label>Cost (est.)</label><span>$${(t.totals?.costUsd ?? 0).toFixed(4)}</span>
            ${t.sessionId ? `<label>Session</label><span title="${escapeAttr(t.sessionId)}">${escapeHtml(t.sessionId.slice(0, 8))}…</span>` : ''}
          </div>
        </div>
        <div class="tv-section">
          <div class="tv-section-title">Recent events</div>
          <div class="tv-json">${recent.map(e => `[${(e.t / 1000).toFixed(2)}s] ${e.event}${e.data?.stepId ? ` · ${e.data.stepId}` : ''}`).join('\n') || '(none)'}</div>
        </div>
      `;
      return;
    }

    const s = (t.steps || {})[this.selectedStepId];
    if (!s) {
      detail.innerHTML = `<div class="tv-empty-detail">Step not found.</div>`;
      return;
    }

    const inputsBlock = s.inputs
      ? `<div class="tv-section">
           <div class="tv-section-title">Inputs (resolved)</div>
           <div class="tv-json">${escapeHtml(JSON.stringify(s.inputs, null, 2))}</div>
         </div>`
      : '';

    const outputBlock = s.outputSummary
      ? `<div class="tv-section">
           <div class="tv-section-title">Output summary</div>
           <div class="tv-json">${escapeHtml(JSON.stringify(s.outputSummary, null, 2))}</div>
         </div>`
      : '';

    const errorBlock = s.error
      ? `<div class="tv-section">
           <div class="tv-section-title" style="color:#c62828;">Error</div>
           <div class="tv-error-block">${escapeHtml(typeof s.error === 'string' ? s.error : JSON.stringify(s.error, null, 2))}</div>
         </div>`
      : '';

    detail.innerHTML = `
      <h4 class="tv-detail-h">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor(s.status)}"></span>
        ${escapeHtml(s.id)}
      </h4>
      <div class="tv-detail-meta">${escapeHtml(s.type || '')} · ${escapeHtml(s.status || '')}</div>
      <div class="tv-section">
        <div class="tv-kv">
          <label>Duration</label><span>${formatDuration(s.durationMs)}</span>
          <label>Attempts</label><span>${s.attempts || 0}</span>
          <label>Cost (est.)</label><span>$${(s.costUsd || 0).toFixed(4)}</span>
          ${(s.dependsOn || []).length ? `<label>Depends on</label><span>${s.dependsOn.map(escapeHtml).join(', ')}</span>` : ''}
          ${s.chunks ? `<label>Stream chunks</label><span>${s.chunks}</span>` : ''}
        </div>
      </div>
      ${inputsBlock}
      ${outputBlock}
      ${errorBlock}
    `;
  }

  // ─── Live updates over SSE ─────────────────────────────────────────────────

  _connectLiveStream() {
    this._disconnectLiveStream();
    try {
      this.eventSource = new EventSource(`${this.CHATROOM_API}/chat/stream`);
    } catch (err) {
      console.warn('[TraceViewer] EventSource unavailable:', err);
      return;
    }

    const events = [
      'workflow_start', 'workflow_step_start', 'workflow_step_complete',
      'workflow_step_error', 'workflow_step_chunk', 'workflow_step_retry',
      'workflow_complete', 'workflow_error', 'workflow_cancelled',
    ];

    for (const evt of events) {
      this.eventSource.addEventListener(evt, (e) => {
        try {
          const data = JSON.parse(e.data);
          this._onLiveEvent(evt, data);
        } catch { /* ignore malformed */ }
      });
    }
  }

  _disconnectLiveStream() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  _onLiveEvent(evt, data) {
    // Refresh the lens whenever a workflow starts or finishes — keeps the
    // session list current without requiring the polling timer.
    if (evt === 'workflow_start' || evt === 'workflow_complete'
        || evt === 'workflow_error' || evt === 'workflow_cancelled') {
      this._refreshList({ silent: true });
    }

    // If the user is currently watching this workflow, refetch + re-render.
    // (A diff-based approach would be lower-traffic but more code; the trace
    // payload is small enough — sub-100KB — that a refetch is fine here.)
    if (this.currentTrace && data.workflowId === this.currentTrace.workflowId) {
      // Debounce — multiple chunk events shouldn't trigger a refetch each
      clearTimeout(this._liveRefetch);
      this._liveRefetch = setTimeout(() => this._loadTrace(data.workflowId), 250);
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function statusColor(status) {
  switch (status) {
    case 'running':   return '#f0a500';
    case 'complete':  return '#4caf50';
    case 'failed':    return '#e94560';
    case 'skipped':   return '#9e9e9e';
    case 'cancelled': return '#9c27b0';
    default:          return '#bdbdbd';
  }
}

function nodeFill(status, agentColor) {
  if (status === 'failed')   return '#ffebee';
  if (status === 'pending')  return '#f5f5f5';
  if (status === 'skipped')  return '#eeeeee';
  if (agentColor) {
    // Tint with agent color at low alpha for fill — fall back to a pastel
    // derived from hex if rgba isn't computable
    return hexWithAlpha(agentColor, status === 'complete' ? 0.18 : 0.32);
  }
  return status === 'running' ? '#fff8e1' : '#f1f8e9';
}

function hexWithAlpha(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function formatDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeAttr(s) { return escapeHtml(s); }

window.TraceViewer = TraceViewer;
