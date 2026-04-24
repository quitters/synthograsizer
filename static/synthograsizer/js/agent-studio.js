/**
 * AgentStudio — Vanilla-JS multi-agent chat surface for the Synthograsizer.
 *
 * Bridges the Synthograsizer studio modal system to the chatroom orchestrator
 * so users can run agentic conversations without leaving the main app.
 *
 * UX notes:
 *   - Roster lives in a popover anchored to the header — frees the entire
 *     transcript canvas for the conversation.
 *   - Workflow chips render INLINE on the message that triggered them, so the
 *     causal chain (agent prose → workflow → image) reads top-to-bottom.
 *   - Compose bar at the bottom lets the user inject mid-conversation nudges
 *     without leaving the modal (POST /api/chat/inject).
 *
 * Surface area:
 *   - Agent roster (CRUD)             → /chatroom/api/agents
 *   - Goal field + start/stop/reset   → /chatroom/api/chat/{start,stop,reset}
 *   - Inject user message             → /chatroom/api/chat/inject
 *   - Live message stream             → /chatroom/api/chat/stream (SSE)
 *   - Workflow chips (clickable)      → opens TraceViewer to that workflowId
 *   - Image chips                     → opens lightbox preview
 *   - Session export                  → JSON download of the conversation
 */
class AgentStudio {
  constructor(studioIntegration) {
    this.studio = studioIntegration;
    this.CHATROOM_API = '/chatroom/api';

    this.agents = [];
    this.messages = [];
    this.state = { isRunning: false, isPaused: false };
    this.sessionStart = null;
    this.eventSource = null;

    // workflowId → { status, label, messageIndex }
    this._workflowChipMap = new Map();
    // messageIndex → [{ id, mimeType, label }]
    this._imageChipsByMsg = new Map();
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  async init() {
    this.studio.createModal('agent-studio-modal', '🤖 Agent Studio', this._buildModalHTML());
    this._injectStyles();
    this._bindEvents();
    this._bindLifecycleCleanup();
  }

  open() {
    const modal = document.getElementById('agent-studio-modal');
    if (!modal) return;
    modal.classList.add('active');
    this._connectStream();
    this._refreshAgents();
    this._refreshState();
    this._connectStream();
  }

  close() {
    const modal = document.getElementById('agent-studio-modal');
    if (modal) modal.classList.remove('active');
    this._disconnectStream();
  }

  _bindLifecycleCleanup() {
    const modalEl = document.getElementById('agent-studio-modal');
    if (modalEl) {
      const observer = new MutationObserver(() => {
        if (!modalEl.classList.contains('active')) this._disconnectStream();
      });
      observer.observe(modalEl, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    window.addEventListener('beforeunload', () => this._disconnectStream());
    // Click outside popovers closes them
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.as-popover-anchor')) {
        document.querySelectorAll('.as-popover.open').forEach(p => p.classList.remove('open'));
      }
    });
  }

  // ─── Markup ────────────────────────────────────────────────────────────────

  _buildModalHTML() {
    return `
      <div id="as-root" class="as-root">
        <!-- Compact header: goal + roster popover + presets + controls -->
        <div class="as-header">
          <input id="as-goal" class="as-goal" type="text"
                 placeholder="Conversation goal — e.g. design a poster series for a synthwave album"/>

          <div class="as-popover-anchor">
            <button id="as-roster-btn" class="as-btn as-btn-roster" title="Manage agents">
              👥 <span id="as-roster-label">Agents</span> <span id="as-roster-count" class="as-pill">0</span>
            </button>
            <div id="as-roster-popover" class="as-popover as-popover-roster">
              <div class="as-pop-h">Agents <span class="as-hint" id="as-roster-min">need 2 minimum</span></div>
              <div id="as-agent-list" class="as-agent-list"></div>
              <div class="as-pop-divider"></div>
              <div class="as-pop-h">Add new</div>
              <div class="as-add-form">
                <input id="as-new-agent-name" class="as-input-sm" placeholder="Name"/>
                <textarea id="as-new-agent-bio" class="as-input-sm" rows="3"
                          placeholder="Bio / role / personality — describes how this agent thinks and talks"></textarea>
                <button id="as-add-agent-btn" class="as-btn-sm">+ Add agent</button>
              </div>
            </div>
          </div>

          <div class="as-popover-anchor">
            <button id="as-presets-btn" class="as-btn" title="Load a preset roster">★ Presets</button>
            <div id="as-presets-popover" class="as-popover as-popover-presets">
              <div class="as-pop-h">Drop in a starter roster</div>
              <button class="as-preset-btn" data-preset="critique">
                <strong>Director ↔ Critic</strong>
                <span>Tight 2-agent loop for sharpening any idea</span>
              </button>
              <button class="as-preset-btn" data-preset="visionary">
                <strong>Visionary trio</strong>
                <span>Architect, Painter, Curator — concept → image → refine</span>
              </button>
              <button class="as-preset-btn" data-preset="archetypes">
                <strong>4 Dream archetypes</strong>
                <span>Dream Architect, Subconscious Painter, Uncanny Curator, Mythopoet</span>
              </button>
            </div>
          </div>

          <div class="as-spacer-h"></div>

          <button id="as-start-btn"  class="as-btn as-btn-primary">▶ Start</button>
          <button id="as-stop-btn"   class="as-btn" disabled>■ Stop</button>
          <button id="as-reset-btn"  class="as-btn" title="Clear conversation">↺</button>
          <button id="as-export-btn" class="as-btn" title="Download conversation as JSON">⤓</button>
        </div>

        <!-- Transcript fills the body -->
        <div id="as-transcript-body" class="as-transcript-body">
          <div class="as-empty">
            <div class="as-empty-icon">🤖</div>
            <h3>Start a multi-agent conversation</h3>
            <p>
              Pick a preset or build your own roster (top right), set a goal, and press <strong>Start</strong>.<br/>
              Workflows the agents launch will appear inline as clickable chips — click any chip to open it in the Trace Viewer.
            </p>
          </div>
        </div>

        <!-- Compose bar: inject a nudge mid-conversation -->
        <div class="as-compose">
          <input id="as-inject-input" class="as-inject-input" type="text"
                 placeholder="Nudge the conversation — your message appears as 'User'"/>
          <button id="as-inject-btn" class="as-btn">Send →</button>
        </div>

        <!-- Slim status footer -->
        <div class="as-status-bar">
          <span class="as-dot" id="as-status-dot"></span>
          <span id="as-status-text" class="as-status-text">idle</span>
          <span class="as-spacer-h"></span>
          <span id="as-msg-count" class="as-hint">0 messages</span>
          <span class="as-sep">·</span>
          <span id="as-wf-count"  class="as-hint">0 workflows</span>
          <span class="as-sep">·</span>
          <span id="as-session-id" class="as-hint" title="Current chat session ID"></span>
        </div>
      </div>
    `;
  }

  _injectStyles() {
    if (document.getElementById('as-styles')) return;
    const style = document.createElement('style');
    style.id = 'as-styles';
    style.textContent = `
      /* Modal — override the base 500px cap and claim full viewport */
      #agent-studio-modal {
        width: 96vw !important; max-width: 96vw !important;
        height: 92vh !important; max-height: 92vh !important;
        overflow: hidden !important;
        display: none; top: 50% !important; left: 50% !important;
        transform: translate(-50%, -50%) !important;
        box-sizing: border-box !important;
      }
      #agent-studio-modal.active { display: flex !important; flex-direction: column !important; }
      #agent-studio-modal .studio-modal-content {
        max-width: none !important; width: 100% !important;
        height: 100% !important; max-height: 100% !important;
        display: flex !important; flex-direction: column !important;
        overflow: hidden !important; box-sizing: border-box !important;
      }
      #agent-studio-modal .studio-modal-body {
        padding: 0 !important; flex: 1 1 auto !important; min-height: 0 !important;
        display: flex !important; flex-direction: column !important;
        overflow: hidden !important;
      }
      .as-root { display:flex; flex-direction:column; flex:1 1 auto; min-height:0;
                 font-size:13px; color:#333; width:100%; overflow:hidden; box-sizing:border-box; }

      /* ── Header strip ───────────────────────────────────────────────────── */
      .as-header { display:flex; gap:8px; padding:10px 14px; background:#fafafa;
                   border-bottom:1px solid #e9e9e9; align-items:center;
                   position:relative; z-index:10; flex-wrap:wrap; }
      .as-goal { flex:1 1 280px; padding:8px 12px; border:1px solid #ddd;
                 border-radius:6px; font-size:13px; min-width:200px; }
      .as-goal:focus { outline:none; border-color:#673ab7; box-shadow:0 0 0 2px rgba(103,58,183,.15); }

      .as-btn { padding:7px 12px; background:#fff; border:1px solid #ddd;
                border-radius:6px; cursor:pointer; font-size:12px; white-space:nowrap;
                display:inline-flex; align-items:center; gap:6px; line-height:1; }
      .as-btn:hover:not(:disabled) { background:#f3f3f3; }
      .as-btn:disabled { opacity:.4; cursor:not-allowed; }
      .as-btn-primary { background:#673ab7; color:#fff; border-color:#673ab7; }
      .as-btn-primary:hover:not(:disabled) { background:#5e35b1; }
      .as-btn-roster .as-pill { background:#673ab7; color:#fff; border-radius:10px;
                                padding:1px 7px; font-size:11px; font-weight:600;
                                min-width:18px; text-align:center; }

      .as-spacer-h { flex:1; }

      /* ── Popovers (anchored to header buttons) ─────────────────────────── */
      .as-popover-anchor { position:relative; }
      .as-popover { display:none; position:absolute; top:calc(100% + 6px); right:0;
                    background:#fff; border:1px solid #e0e0e0; border-radius:8px;
                    box-shadow:0 8px 24px rgba(0,0,0,.12); padding:12px; min-width:320px;
                    max-width:380px; max-height:60vh; overflow-y:auto; z-index:20; }
      .as-popover.open { display:block; }
      .as-pop-h { font-size:10px; text-transform:uppercase; letter-spacing:.5px;
                  color:#888; margin:0 0 8px; font-weight:700;
                  display:flex; align-items:center; justify-content:space-between; }
      .as-pop-divider { height:1px; background:#eee; margin:14px 0; }
      .as-hint { font-size:10px; color:#999; text-transform:none; letter-spacing:0; font-weight:400; }

      /* Roster items inside popover */
      .as-agent-list { display:flex; flex-direction:column; gap:6px; }
      .as-agent-row { display:flex; align-items:flex-start; gap:8px; padding:8px;
                      background:#fafafa; border:1px solid #eee; border-radius:6px; }
      .as-agent-dot { width:12px; height:12px; border-radius:50%; flex-shrink:0; margin-top:3px; }
      .as-agent-meta { flex:1; min-width:0; }
      .as-agent-name { font-size:12px; font-weight:600; color:#333; }
      .as-agent-bio { font-size:11px; color:#777; line-height:1.4; margin-top:2px;
                      display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
                      overflow:hidden; }
      .as-agent-rm { background:none; border:none; cursor:pointer; color:#bbb;
                     font-size:16px; padding:0 4px; align-self:flex-start; }
      .as-agent-rm:hover { color:#e94560; }

      .as-add-form { display:flex; flex-direction:column; gap:6px; }
      .as-input-sm { width:100%; padding:7px 10px; font-size:12px; border:1px solid #ddd;
                     border-radius:5px; box-sizing:border-box; font-family:inherit; }
      .as-input-sm:focus { outline:none; border-color:#673ab7; }
      .as-btn-sm { padding:8px; background:#673ab7; color:#fff; border:none;
                   border-radius:5px; cursor:pointer; font-size:12px; font-weight:600; }
      .as-btn-sm:hover { background:#5e35b1; }

      /* Preset buttons */
      .as-preset-btn { display:flex; flex-direction:column; align-items:flex-start;
                       padding:10px 12px; background:#fafafa; border:1px solid #eee;
                       border-radius:6px; font-size:12px; cursor:pointer; color:#333;
                       text-align:left; gap:2px; margin-bottom:6px; width:100%; }
      .as-preset-btn:hover { background:#f3f0fb; border-color:#673ab7; }
      .as-preset-btn strong { font-size:13px; color:#5e35b1; }
      .as-preset-btn span   { font-size:11px; color:#777; line-height:1.4; }

      /* ── Transcript ─────────────────────────────────────────────────────── */
      .as-transcript-body { flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden;
                            padding:18px 24px 18px 18px; background:#fff;
                            box-sizing:border-box; width:100%; }
      .as-empty { text-align:center; color:#999; padding:80px 20px; line-height:1.6;
                  max-width:520px; margin:0 auto; }
      .as-empty-icon { font-size:48px; opacity:.4; margin-bottom:12px; }
      .as-empty h3 { margin:0 0 10px; color:#666; font-size:18px; font-weight:600; }
      .as-empty p { margin:0; font-size:13px; }

      .as-msg { display:flex; gap:12px; margin-bottom:18px; width:100%; box-sizing:border-box; }
      .as-msg-avatar { width:36px; height:36px; border-radius:50%; flex-shrink:0;
                       display:flex; align-items:center; justify-content:center;
                       color:#fff; font-weight:700; font-size:14px;
                       box-shadow:0 1px 3px rgba(0,0,0,.1); }
      .as-msg-body { flex:1; min-width:0; overflow:hidden; }
      .as-msg-head { display:flex; align-items:baseline; gap:8px; margin-bottom:3px; }
      .as-msg-name { font-weight:600; font-size:13px; }
      .as-msg-time { font-size:11px; color:#bbb; }
      .as-msg-text { font-size:13.5px; line-height:1.55; color:#222; white-space:pre-wrap;
                     word-break:break-word; overflow-wrap:break-word;
                     max-width:100%; }
      .as-msg-system { color:#888; font-style:italic; font-size:11px;
                       padding:6px 12px; background:#f7f7f7; border-radius:14px;
                       margin:10px auto; text-align:center; max-width:480px;
                       border:1px dashed #e0e0e0; }

      .as-chips { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
      .as-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 11px;
                 background:#f3f0fb; color:#5e35b1; border:1px solid #d8cdf2;
                 border-radius:14px; font-size:11px; cursor:pointer;
                 transition:transform .1s, box-shadow .1s; }
      .as-chip:hover { background:#e7defa; transform:translateY(-1px);
                       box-shadow:0 2px 6px rgba(94,53,177,.15); }
      .as-chip-img { background:#e8f5e9; color:#2e7d32; border-color:#c8e6c9; }
      .as-chip-img:hover { background:#dcedc8; box-shadow:0 2px 6px rgba(46,125,50,.15); }
      .as-chip-status { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
      .as-chip-status.running   { background:#f0a500; animation:as-pulse 1.5s infinite; }
      .as-chip-status.complete  { background:#4caf50; }
      .as-chip-status.failed    { background:#e94560; }
      .as-chip-status.submitted { background:#999; }
      @keyframes as-pulse { 50% { opacity:.4; } }

      /* ── Compose bar ────────────────────────────────────────────────────── */
      .as-compose { display:flex; gap:8px; padding:10px 14px; background:#fafafa;
                    border-top:1px solid #e9e9e9; align-items:center; }
      .as-inject-input { flex:1; padding:8px 12px; border:1px solid #ddd;
                         border-radius:6px; font-size:13px; }
      .as-inject-input:focus { outline:none; border-color:#673ab7;
                               box-shadow:0 0 0 2px rgba(103,58,183,.15); }

      /* ── Status footer ──────────────────────────────────────────────────── */
      .as-status-bar { display:flex; align-items:center; gap:10px; padding:6px 14px;
                       background:#f5f5f5; border-top:1px solid #e9e9e9; font-size:11px; }
      .as-dot { width:8px; height:8px; border-radius:50%; background:#bbb; }
      .as-dot.running { background:#f0a500; animation:as-pulse 1.5s infinite; }
      .as-dot.complete { background:#4caf50; }
      .as-status-text { font-weight:600; color:#666; text-transform:uppercase;
                        letter-spacing:.5px; font-size:10px; }
      .as-status-text.running { color:#e65100; }
      .as-sep { color:#ccc; }

      /* Lightbox */
      .as-lightbox { position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:99999;
                     display:flex; align-items:center; justify-content:center; cursor:pointer; }
      .as-lightbox img { max-width:90vw; max-height:90vh; box-shadow:0 4px 30px #000; }
    `;
    document.head.appendChild(style);
  }

  _bindEvents() {
    document.getElementById('as-start-btn').onclick   = () => this._start();
    document.getElementById('as-stop-btn').onclick    = () => this._stop();
    document.getElementById('as-reset-btn').onclick   = () => this._reset();
    document.getElementById('as-export-btn').onclick  = () => this._export();
    document.getElementById('as-add-agent-btn').onclick = () => this._addAgent();
    document.getElementById('as-inject-btn').onclick  = () => this._inject();

    // Popover toggles
    document.getElementById('as-roster-btn').onclick = (e) => {
      e.stopPropagation();
      this._togglePopover('as-roster-popover');
    };
    document.getElementById('as-presets-btn').onclick = (e) => {
      e.stopPropagation();
      this._togglePopover('as-presets-popover');
    };

    // Stop click-bubble inside popovers from closing them
    document.querySelectorAll('.as-popover').forEach(p => {
      p.addEventListener('click', e => e.stopPropagation());
    });

    document.querySelectorAll('.as-preset-btn').forEach(btn => {
      btn.onclick = () => this._loadPreset(btn.dataset.preset);
    });

    document.getElementById('as-goal').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !this.state.isRunning) this._start();
    });
    document.getElementById('as-inject-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._inject();
    });
  }

  _togglePopover(id) {
    const target = document.getElementById(id);
    const wasOpen = target?.classList.contains('open');
    document.querySelectorAll('.as-popover.open').forEach(p => p.classList.remove('open'));
    if (target && !wasOpen) target.classList.add('open');
  }

  // ─── Agent roster ──────────────────────────────────────────────────────────

  async _refreshAgents() {
    try {
      const res = await fetch(`${this.CHATROOM_API}/agents`);
      const json = await res.json();
      this.agents = json.agents || [];
      this._renderAgents();
    } catch (err) {
      console.error('[AgentStudio] refreshAgents failed', err);
    }
  }

  _renderAgents() {
    const list  = document.getElementById('as-agent-list');
    const count = document.getElementById('as-roster-count');
    const minHint = document.getElementById('as-roster-min');
    if (!list) return;

    if (count) count.textContent = String(this.agents.length);
    if (minHint) {
      minHint.textContent = this.agents.length < 2
        ? `${2 - this.agents.length} more needed`
        : 'ready to start';
      minHint.style.color = this.agents.length < 2 ? '#e65100' : '#2e7d32';
    }

    if (!this.agents.length) {
      list.innerHTML = `<div style="color:#bbb; font-size:11px; text-align:center; padding:12px;">No agents yet — add one below or load a preset.</div>`;
      return;
    }

    list.innerHTML = this.agents.map(a => `
      <div class="as-agent-row">
        <span class="as-agent-dot" style="background:${escapeAttr(a.color || '#999')}"></span>
        <div class="as-agent-meta">
          <div class="as-agent-name">${escapeHtml(a.name)}</div>
          <div class="as-agent-bio">${escapeHtml(a.bio || '')}</div>
        </div>
        <button class="as-agent-rm" data-id="${escapeAttr(a.id)}" title="Remove">×</button>
      </div>
    `).join('');

    list.querySelectorAll('.as-agent-rm').forEach(btn => {
      btn.onclick = () => this._removeAgent(btn.dataset.id);
    });
  }

  async _addAgent() {
    const nameEl = document.getElementById('as-new-agent-name');
    const bioEl  = document.getElementById('as-new-agent-bio');
    const name = nameEl.value.trim();
    const bio  = bioEl.value.trim();
    if (!name || !bio) {
      this.studio.showToast?.('Both name and bio are required', 'error');
      return;
    }
    try {
      const res = await fetch(`${this.CHATROOM_API}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, bio }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      nameEl.value = '';
      bioEl.value = '';
      this._refreshAgents();
    } catch (err) {
      this.studio.showToast?.(`Add failed: ${err.message}`, 'error');
    }
  }

  async _removeAgent(id) {
    try {
      await fetch(`${this.CHATROOM_API}/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
      this._refreshAgents();
    } catch (err) {
      this.studio.showToast?.(`Remove failed: ${err.message}`, 'error');
    }
  }

  async _loadPreset(name) {
    const presets = {
      critique: [
        { name: 'Director', bio: 'Visionary art director with strong opinions about composition, palette, and narrative impact. Pushes for bold, specific creative choices.' },
        { name: 'Critic',   bio: 'Sharp critic who interrogates assumptions, surfaces clichés, and demands rigor. Asks "what would surprise the viewer?" Always references prior work.' },
      ],
      visionary: [
        { name: 'Architect', bio: 'Designs the high-level concept and structure. Thinks in arcs and themes. Sets the brief.' },
        { name: 'Painter',   bio: 'Translates concepts into specific visual language: lighting, palette, texture. Reaches for image generation often.' },
        { name: 'Curator',   bio: 'Selects, sequences, and refines. Surfaces tensions and asks for one more pass when something falls flat.' },
      ],
      archetypes: [
        { name: 'Dream Architect',      bio: 'Builds impossible spaces — staircases that fold into rivers, libraries with ceilings of stars. Speaks in lush, specific imagery and reaches for IMAGE workflows often.' },
        { name: 'Subconscious Painter', bio: 'Paints emotional weather. Obsessed with mood, color temperature, and the feeling just before sleep. Uses CINEMATIC_ANIMATOR to give scenes motion.' },
        { name: 'Uncanny Curator',      bio: 'Hunts for the small wrong detail that makes an image unforgettable. Asks pointed questions, then proposes one specific change.' },
        { name: 'Mythopoet',            bio: 'Wraps each scene in a fragment of invented myth. Names things. Speaks in compact, declarative sentences.' },
      ],
    };
    const set = presets[name];
    if (!set) return;
    if (this.agents.length) {
      const ok = confirm('Replace current agents with this preset?');
      if (!ok) return;
      await fetch(`${this.CHATROOM_API}/agents`, { method: 'DELETE' });
    }
    for (const a of set) {
      await fetch(`${this.CHATROOM_API}/agents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(a),
      });
    }
    this._refreshAgents();
    // Close the presets popover after applying
    document.getElementById('as-presets-popover')?.classList.remove('open');
  }

  // ─── Session control ──────────────────────────────────────────────────────

  async _refreshState() {
    try {
      const res = await fetch(`${this.CHATROOM_API}/chat/state`);
      const state = await res.json();
      this.state.isRunning = !!state.isRunning;
      this.state.isPaused  = !!state.isPaused;
      this._renderControls();
      const histRes = await fetch(`${this.CHATROOM_API}/chat/history`);
      const hist = await histRes.json();
      this.messages = hist.history || [];
      this._renderTranscript();
    } catch (err) {
      console.warn('[AgentStudio] refreshState failed', err);
    }
  }

  _renderControls() {
    const start = document.getElementById('as-start-btn');
    const stop  = document.getElementById('as-stop-btn');
    const status = document.getElementById('as-status-text');
    const dot = document.getElementById('as-status-dot');
    if (!start) return;
    start.disabled = this.state.isRunning;
    stop.disabled  = !this.state.isRunning;
    const text = this.state.isRunning
      ? (this.state.isPaused ? 'paused' : 'running')
      : 'idle';
    status.textContent = text;
    status.className = `as-status-text ${this.state.isRunning ? 'running' : 'idle'}`;
    dot.className = `as-dot ${this.state.isRunning ? 'running' : ''}`;
  }

  async _start() {
    const goal = document.getElementById('as-goal').value.trim();
    if (!goal) { this.studio.showToast?.('Set a goal first', 'error'); return; }
    if (this.agents.length < 2) {
      this.studio.showToast?.('Need at least 2 agents — add some via the 👥 menu', 'error');
      this._togglePopover('as-roster-popover');
      return;
    }
    try {
      const res = await fetch(`${this.CHATROOM_API}/chat/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      this.state.isRunning = true;
      this._renderControls();
    } catch (err) {
      this.studio.showToast?.(`Start failed: ${err.message}`, 'error');
    }
  }

  async _stop() {
    try {
      await fetch(`${this.CHATROOM_API}/chat/stop`, { method: 'POST' });
      this.state.isRunning = false;
      this._renderControls();
    } catch (err) {
      this.studio.showToast?.(`Stop failed: ${err.message}`, 'error');
    }
  }

  async _reset() {
    if (!confirm('Clear the entire conversation?')) return;
    try {
      await fetch(`${this.CHATROOM_API}/chat/reset`, { method: 'POST' });
      this.messages = [];
      this._workflowChipMap.clear();
      this._imageChipsByMsg.clear();
      this._renderTranscript();
      this._refreshState();
    } catch (err) {
      this.studio.showToast?.(`Reset failed: ${err.message}`, 'error');
    }
  }

  async _inject() {
    const input = document.getElementById('as-inject-input');
    const content = input.value.trim();
    if (!content) return;
    try {
      const res = await fetch(`${this.CHATROOM_API}/chat/inject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, senderName: 'User' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      input.value = '';
      // The orchestrator will broadcast the injected message back to us via SSE.
    } catch (err) {
      this.studio.showToast?.(`Send failed: ${err.message}`, 'error');
    }
  }

  _export() {
    const payload = {
      exportedAt: new Date().toISOString(),
      agents: this.agents,
      messages: this.messages,
      workflows: Array.from(this._workflowChipMap.entries()).map(([id, info]) => ({ id, ...info })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-session-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // ─── SSE stream ────────────────────────────────────────────────────────────

  _connectStream() {
    this._disconnectStream();
    try {
      this.eventSource = new EventSource(`${this.CHATROOM_API}/chat/stream`);
    } catch (err) {
      console.warn('[AgentStudio] SSE unavailable', err);
      return;
    }

    const handlers = {
      session_start: (d) => {
        this.sessionStart = d;
        this.state.isRunning = true;
        this._renderControls();
        const sid = document.getElementById('as-session-id');
        if (sid && d.sessionId) sid.textContent = `session ${d.sessionId.slice(0, 8)}`;
        this._appendSystem(`Session started — goal: ${d.goal || '(none)'}`);
      },
      session_end: (d) => {
        this.state.isRunning = false;
        this._renderControls();
        this._appendSystem(`Session ended (${d.reason || 'complete'})`);
      },
      session_paused:  () => { this.state.isPaused = true;  this._renderControls(); },
      session_resumed: () => { this.state.isPaused = false; this._renderControls(); },
      message: (d) => this._appendMessage(d),

      // Workflow chips — pinned to the message that triggered them.
      workflow_submitted: (d) => this._upsertChip(d.workflowId, 'submitted', d.template, true),
      workflow_start:     (d) => this._upsertChip(d.workflowId, 'running', d.name),
      workflow_complete:  (d) => this._upsertChip(d.workflowId, d.status === 'failed' ? 'failed' : 'complete'),
      workflow_error:     (d) => this._upsertChip(d.workflowId, 'failed'),
      workflow_cancelled: (d) => this._upsertChip(d.workflowId, 'failed'),

      // Inline media — pinned to the message that triggered the workflow.
      synth_media: (d) => this._maybeAttachImageChip(d),
    };

    for (const [evt, fn] of Object.entries(handlers)) {
      this.eventSource.addEventListener(evt, e => {
        try {
          console.log(`[AgentStudio] SSE event: ${evt}`, e.data?.slice?.(0, 100));
          fn(JSON.parse(e.data));
        } catch (err) {
          console.warn(`[AgentStudio] SSE parse error for ${evt}:`, err);
        }
      });
    }
    console.log('[AgentStudio] SSE connected, listening for:', Object.keys(handlers).join(', '));
  }

  _disconnectStream() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  // ─── Transcript rendering ─────────────────────────────────────────────────

  _appendMessage(msg) {
    this.messages.push(msg);
    this._renderTranscript();
  }

  _appendSystem(text) {
    this.messages.push({ role: 'system', content: text, timestamp: Date.now() });
    this._renderTranscript();
  }

  _renderTranscript() {
    const body = document.getElementById('as-transcript-body');
    const msgCount = document.getElementById('as-msg-count');
    const wfCount  = document.getElementById('as-wf-count');
    if (!body) return;

    msgCount.textContent = `${this.messages.length} message${this.messages.length === 1 ? '' : 's'}`;
    wfCount.textContent  = `${this._workflowChipMap.size} workflow${this._workflowChipMap.size === 1 ? '' : 's'}`;

    if (!this.messages.length) {
      body.innerHTML = `
        <div class="as-empty">
          <div class="as-empty-icon">🤖</div>
          <h3>Start a multi-agent conversation</h3>
          <p>
            Pick a preset or build your own roster (top right), set a goal, and press <strong>Start</strong>.<br/>
            Workflows the agents launch will appear inline as clickable chips — click any chip to open it in the Trace Viewer.
          </p>
        </div>
      `;
      return;
    }

    // Pre-compute chips per message index so we can render inline
    const chipsByIndex = new Map();
    for (const [wfId, info] of this._workflowChipMap) {
      const idx = info.messageIndex ?? (this.messages.length - 1);
      if (!chipsByIndex.has(idx)) chipsByIndex.set(idx, { wf: [], img: [] });
      chipsByIndex.get(idx).wf.push({ id: wfId, ...info });
    }
    for (const [idx, imgs] of this._imageChipsByMsg) {
      if (!chipsByIndex.has(idx)) chipsByIndex.set(idx, { wf: [], img: [] });
      chipsByIndex.get(idx).img.push(...imgs);
    }

    body.innerHTML = this.messages
      .map((m, i) => this._renderMessageHTML(m, i, chipsByIndex.get(i)))
      .join('');

    body.querySelectorAll('.as-chip[data-wf]').forEach(el => {
      el.onclick = () => this._openTraceViewer(el.dataset.wf);
    });
    body.querySelectorAll('.as-chip[data-img]').forEach(el => {
      el.onclick = () => this._openLightbox(el.dataset.img, el.dataset.mime);
    });

    body.scrollTop = body.scrollHeight;
  }

  _renderMessageHTML(m, index, chips) {
    if (m.role === 'system') {
      return `<div class="as-msg-system">${escapeHtml(m.content)}</div>`;
    }

    const agent = this.agents.find(a => a.id === m.agentId)
               || { color: '#888', name: m.agentName || 'Agent' };
    const initial = (m.agentName || agent.name || '?').charAt(0).toUpperCase();
    const time = m.timestamp
      ? new Date(m.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : '';

    // Strip [WORKFLOW: ...] tags from the displayed content (already parsed).
    const content = (m.content || '').replace(/\[WORKFLOW:[\s\S]*?\]/g, '').trim();

    let chipsHTML = '';
    if (chips) {
      const wfChips = chips.wf.map(c => `
        <span class="as-chip" data-wf="${escapeAttr(c.id)}" title="Open in Trace Viewer">
          <span class="as-chip-status ${c.status}"></span>
          ⚡ ${escapeHtml(c.label || c.id.slice(0, 8))}
        </span>
      `).join('');
      const imgChips = chips.img.map(img => `
        <span class="as-chip as-chip-img" data-img="${escapeAttr(img.id)}" data-mime="${escapeAttr(img.mimeType || 'image/png')}">
          🖼 ${escapeHtml((img.label || 'image').slice(0, 24))}
        </span>
      `).join('');
      if (wfChips || imgChips) chipsHTML = `<div class="as-chips">${wfChips}${imgChips}</div>`;
    }

    return `
      <div class="as-msg">
        <div class="as-msg-avatar" style="background:${escapeAttr(agent.color)}">${escapeHtml(initial)}</div>
        <div class="as-msg-body">
          <div class="as-msg-head">
            <span class="as-msg-name" style="color:${escapeAttr(agent.color)}">${escapeHtml(m.agentName || agent.name)}</span>
            <span class="as-msg-time">${escapeHtml(time)}</span>
          </div>
          <div class="as-msg-text">${escapeHtml(content)}</div>
          ${chipsHTML}
        </div>
      </div>
    `;
  }

  // Pin a chip to the message that triggered it (most recent at the time
  // of submission — orchestrator parses [WORKFLOW: ...] tags right after
  // the message lands, so length-1 is the correct anchor).
  _upsertChip(workflowId, status, label, isNew = false) {
    if (!workflowId) return;
    const prev = this._workflowChipMap.get(workflowId) || {};
    const messageIndex = isNew
      ? Math.max(0, this.messages.length - 1)
      : prev.messageIndex;
    this._workflowChipMap.set(workflowId, {
      status,
      label: label || prev.label || workflowId.slice(0, 8),
      messageIndex,
    });
    this._renderTranscript();
  }

  _maybeAttachImageChip(d) {
    if (!d?.mediaId) return;
    // Find which message this belongs to via the workflowId chip mapping
    const wfChip = this._workflowChipMap.get(d.workflowId);
    const idx = wfChip?.messageIndex ?? Math.max(0, this.messages.length - 1);
    if (!this._imageChipsByMsg.has(idx)) this._imageChipsByMsg.set(idx, []);
    const arr = this._imageChipsByMsg.get(idx);
    if (arr.some(c => c.id === d.mediaId)) return;
    arr.push({
      id: d.mediaId,
      mimeType: d.mimeType,
      label: d.stepId || d.prompt?.slice(0, 24) || 'image',
    });
    this._renderTranscript();
  }

  // ─── Cross-app actions ────────────────────────────────────────────────────

  _openTraceViewer(workflowId) {
    if (window.traceViewer?.open) {
      window.traceViewer.open();
      setTimeout(() => window.traceViewer._loadTrace(workflowId), 80);
    } else {
      this.studio.showToast?.('Trace Viewer not available', 'error');
    }
  }

  async _openLightbox(mediaId, mimeType) {
    try {
      const res = await fetch(`${this.CHATROOM_API}/chat/media/${encodeURIComponent(mediaId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const media = await res.json();
      const src = `data:${mimeType || media.mimeType || 'image/png'};base64,${media.data}`;
      const box = document.createElement('div');
      box.className = 'as-lightbox';
      box.innerHTML = `<img src="${src}" alt=""/>`;
      box.onclick = () => box.remove();
      document.body.appendChild(box);
    } catch (err) {
      this.studio.showToast?.(`Could not open image: ${err.message}`, 'error');
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

window.AgentStudio = AgentStudio;
