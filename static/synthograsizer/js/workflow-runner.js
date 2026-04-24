/**
 * WorkflowRunner — Workflows modal for the Synthograsizer.
 * Fetches templates from the chatroom workflow engine, renders param forms,
 * executes workflows, and monitors progress via SSE.
 */
class WorkflowRunner {
  constructor(studioIntegration) {
    this.studio = studioIntegration;
    this.templates = [];
    this.selectedTemplate = null;
    this.activeWorkflowId = null;
    this.eventSource = null;
    this.CHATROOM_API = '/chatroom/api';
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  async init() {
    this.studio.createModal('workflows-modal', '⚡ Workflows', this._buildModalHTML());
    this._bindEvents();
    this._bindLifecycleCleanup();
    // Pre-fetch templates so the modal opens instantly
    this._fetchTemplates().catch(() => {});
  }

  // Wire up cleanup paths for the EventSource so it can never outlive the
  // workflow it's watching. Three triggers:
  //   1. The user closes the modal (close button or Escape).
  //   2. The whole tab unloads (page navigation / refresh).
  //   3. A 5-minute idle safety timeout — covers stuck workflows where the
  //      backend never emits workflow_complete or workflow_error.
  _bindLifecycleCleanup() {
    const modalEl = document.getElementById('workflows-modal');
    if (modalEl) {
      // Hook every clickable element with a "close" affordance. Studio modals
      // typically render an X button with class `close` or a backdrop. We
      // listen at the modal root and fire cleanup whenever the modal hides.
      const observer = new MutationObserver(() => {
        const visible = modalEl.style.display !== 'none' && modalEl.offsetParent !== null;
        if (!visible) this._cleanupActiveWorkflow();
      });
      observer.observe(modalEl, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    window.addEventListener('beforeunload', () => this._disconnectSSE());
  }

  // Centralized teardown for an in-flight workflow. Safe to call repeatedly.
  _cleanupActiveWorkflow() {
    this._disconnectSSE();
    if (this._sseSafetyTimer) {
      clearTimeout(this._sseSafetyTimer);
      this._sseSafetyTimer = null;
    }
  }

  // ─── Modal HTML ────────────────────────────────────────────────────────────

  _buildModalHTML() {
    return `
      <!-- Status bar -->
      <div id="wfr-status" style="display:none; text-align:center; padding:14px;">
        <div class="spinner"></div>
        <p id="wfr-status-text" style="margin:8px 0 0; font-size:12px; color:#666;"></p>
      </div>

      <!-- Offline banner -->
      <div id="wfr-offline" style="display:none; padding:16px; text-align:center; color:#999; font-size:13px;">
        Workflow engine is offline. Start the chatroom server to use workflows.
      </div>

      <!-- Phase 0: Template browser -->
      <div id="wfr-browse">
        <div id="wfr-template-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; max-height:55vh; overflow-y:auto; padding:2px;"></div>
      </div>

      <!-- Phase 1: Param form -->
      <div id="wfr-params" style="display:none;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
          <button id="wfr-back-btn" style="background:none; border:none; font-size:18px; cursor:pointer; padding:0; color:#666;">←</button>
          <h4 id="wfr-template-name" style="margin:0; font-size:14px; font-weight:600;"></h4>
        </div>
        <p id="wfr-template-desc" style="font-size:12px; color:#888; margin:0 0 14px; line-height:1.5;"></p>
        <div id="wfr-param-fields"></div>
        <button class="studio-btn-primary" id="wfr-run-btn" style="width:100%; margin-top:8px;">▶ Run Workflow</button>
      </div>

      <!-- Phase 2: Progress -->
      <div id="wfr-progress" style="display:none;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
          <h4 id="wfr-progress-name" style="margin:0; font-size:14px; font-weight:600;"></h4>
          <span id="wfr-progress-status" style="font-size:11px; padding:2px 8px; border-radius:10px; background:#fff3e0; color:#e65100;"></span>
        </div>
        <div id="wfr-step-list" style="margin-bottom:14px;"></div>
        <div id="wfr-progress-actions" style="display:none; text-align:center; margin-top:8px;">
          <div style="display:flex; gap:8px;">
            <button class="studio-btn-primary" id="wfr-view-results-btn" style="flex:2; background:#4CAF50;">View Results</button>
            <button class="studio-btn-primary" id="wfr-view-trace-btn" style="flex:1; background:#5e35b1;" title="Open this run in the Trace Viewer">🔍 Trace</button>
          </div>
        </div>
      </div>

      <!-- Phase 3: Results gallery -->
      <div id="wfr-results" style="display:none;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
          <button id="wfr-results-back-btn" style="background:none; border:none; font-size:18px; cursor:pointer; padding:0; color:#666;">←</button>
          <h4 style="margin:0; font-size:14px; font-weight:600;">Results</h4>
        </div>
        <div id="wfr-results-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px;"></div>
      </div>
    `;
  }

  // ─── Event bindings ────────────────────────────────────────────────────────

  _bindEvents() {
    this.studio.bindSafe('wfr-back-btn', 'onclick', () => this._showPhase('browse'));
    this.studio.bindSafe('wfr-run-btn', 'onclick', () => this._runWorkflow());
    this.studio.bindSafe('wfr-view-results-btn', 'onclick', () => this._showResults());
    this.studio.bindSafe('wfr-view-trace-btn', 'onclick', () => {
      const wfId = this.activeWorkflowId;
      if (!wfId) return;
      if (window.traceViewer?.open) {
        window.traceViewer.open();
        setTimeout(() => window.traceViewer._loadTrace(wfId), 80);
      } else {
        this.studio.showToast?.('Trace Viewer not loaded', 'error');
      }
    });
    this.studio.bindSafe('wfr-results-back-btn', 'onclick', () => this._showPhase('browse'));
  }

  // ─── Open modal ────────────────────────────────────────────────────────────

  async open() {
    this._showPhase('browse');
    this.studio.openModal('workflows-modal');
    await this._fetchTemplates();
  }

  // ─── Phase management ─────────────────────────────────────────────────────

  _showPhase(phase) {
    const phases = ['browse', 'params', 'progress', 'results'];
    for (const p of phases) {
      const el = document.getElementById(`wfr-${p}`);
      if (el) el.style.display = p === phase ? '' : 'none';
    }
    document.getElementById('wfr-status').style.display = 'none';
    document.getElementById('wfr-offline').style.display = 'none';
  }

  // ─── Template fetching & rendering ─────────────────────────────────────────

  async _fetchTemplates() {
    try {
      const res = await fetch(`${this.CHATROOM_API}/workflows/templates`);
      if (!res.ok) throw new Error('Failed to fetch');
      this.templates = await res.json();
      this._renderTemplateGrid();
    } catch (e) {
      console.warn('Workflow engine offline:', e.message);
      document.getElementById('wfr-offline').style.display = '';
      document.getElementById('wfr-browse').style.display = 'none';
    }
  }

  _renderTemplateGrid() {
    const grid = document.getElementById('wfr-template-grid');
    if (!grid) return;

    // Icon map for template types
    const icons = {
      style_transfer: '🎨', refinement_loop: '🔄', style_comparison: '⚖️',
      narrative_dreamscape: '🌌', progressive_transform: '🔀', img_to_video: '🎬',
      memory_visualization: '🧠', multi_image_composite: '🖼️', branching_narrative: '📖',
      cinematic_short: '🎞️', polar_opposite: '🔁',
    };

    grid.innerHTML = this.templates.map(t => `
      <div class="wfr-template-card" data-id="${t.id}" style="
        padding:14px; border:1px solid #eee; border-radius:8px; cursor:pointer;
        transition:all 0.15s ease; background:#fafafa;
      ">
        <div style="font-size:24px; margin-bottom:6px;">${icons[t.id] || '⚡'}</div>
        <div style="font-size:13px; font-weight:600; margin-bottom:4px; color:#333;">${t.name}</div>
        <div style="font-size:11px; color:#888; line-height:1.4;">${t.description?.slice(0, 80) || ''}${t.description?.length > 80 ? '…' : ''}</div>
      </div>
    `).join('');

    // Bind card clicks
    grid.querySelectorAll('.wfr-template-card').forEach(card => {
      card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; card.style.borderColor = 'transparent'; };
      card.onmouseleave = () => { card.style.transform = ''; card.style.boxShadow = ''; card.style.borderColor = '#eee'; };
      card.onclick = () => this._selectTemplate(card.dataset.id);
    });
  }

  // ─── Template selection → param form ───────────────────────────────────────

  _selectTemplate(templateId) {
    const tpl = this.templates.find(t => t.id === templateId);
    if (!tpl) return;
    this.selectedTemplate = tpl;

    document.getElementById('wfr-template-name').textContent = tpl.name;
    document.getElementById('wfr-template-desc').textContent = tpl.description || '';

    this._renderParamForm(tpl);
    this._showPhase('params');
  }

  _renderParamForm(tpl) {
    const container = document.getElementById('wfr-param-fields');
    const allParams = [...(tpl.requiredParams || []), ...(tpl.optionalParams || [])];
    const required = new Set(tpl.requiredParams || []);

    if (allParams.length === 0) {
      container.innerHTML = '<p style="color:#999; font-size:12px;">This template has no configurable parameters.</p>';
      return;
    }

    container.innerHTML = allParams.map(p => {
      const meta = WORKFLOW_PARAM_META[p] || {};
      const label = meta.label || p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const isReq = required.has(p);
      const defaultVal = meta.default ?? '';

      if (meta.type === 'select' || meta.type === 'style_select' || meta.type === 'aspect_select') {
        const options = meta.options || [];
        return `
          <div class="studio-input-group">
            <label>${label}${isReq ? ' *' : ''}</label>
            <select id="wfr-param-${p}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px; font-family:'Inter';">
              ${options.map(o => {
                const val = typeof o === 'object' ? o.value : o;
                const lbl = typeof o === 'object' ? o.label : o;
                return `<option value="${val}"${val === defaultVal ? ' selected' : ''}>${lbl}</option>`;
              }).join('')}
            </select>
          </div>`;
      }

      if (meta.type === 'boolean') {
        return `
          <div class="studio-toggle-row">
            <span class="studio-toggle-label">${label}</span>
            <input type="checkbox" id="wfr-param-${p}" ${defaultVal ? 'checked' : ''}>
          </div>`;
      }

      if (meta.type === 'number') {
        return `
          <div class="studio-input-group">
            <label>${label}${isReq ? ' *' : ''}</label>
            <input type="number" id="wfr-param-${p}" value="${defaultVal}"
              ${meta.min != null ? `min="${meta.min}"` : ''} ${meta.max != null ? `max="${meta.max}"` : ''}
              style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px; font-family:'Inter';">
          </div>`;
      }

      if (meta.type === 'textarea') {
        return `
          <div class="studio-input-group">
            <label>${label}${isReq ? ' *' : ''}</label>
            <textarea id="wfr-param-${p}" placeholder="${meta.placeholder || ''}"
              style="width:100%; height:80px; padding:8px; border:1px solid #ddd; border-radius:6px; resize:vertical; font-family:'Inter';">${defaultVal}</textarea>
          </div>`;
      }

      if (meta.type === 'image') {
        return `
          <div class="studio-input-group">
            <label>${label}${isReq ? ' *' : ''}</label>
            <div style="border:2px dashed #ddd; border-radius:8px; padding:16px; text-align:center; cursor:pointer; transition:border-color 0.15s;"
                 onclick="document.getElementById('wfr-param-${p}').click()"
                 id="wfr-drop-${p}">
              <input type="file" id="wfr-param-${p}" accept="image/*" style="display:none;"
                onchange="(function(el){
                  const file = el.files[0];
                  if (!file) return;
                  const drop = document.getElementById('wfr-drop-${p}');
                  const reader = new FileReader();
                  reader.onload = e => {
                    drop.innerHTML = '<img src=\\''+e.target.result+'\\' style=\\'max-height:120px; max-width:100%; border-radius:6px; pointer-events:none;\\'>';
                    drop.style.borderColor = '#4CAF50';
                    drop.appendChild(el);
                  };
                  reader.readAsDataURL(file);
                })(this)">
              <div style="font-size:13px; color:#999; pointer-events:none;">Click to upload image</div>
            </div>
          </div>`;
      }

      // Default: text input
      return `
        <div class="studio-input-group">
          <label>${label}${isReq ? ' *' : ''}</label>
          <input type="text" id="wfr-param-${p}" value="${defaultVal}" placeholder="${meta.placeholder || ''}"
            style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px; font-family:'Inter';">
        </div>`;
    }).join('');
  }

  // ─── Workflow execution ────────────────────────────────────────────────────

  async _runWorkflow() {
    if (!this.selectedTemplate) return;
    const tpl = this.selectedTemplate;
    const allParams = [...(tpl.requiredParams || []), ...(tpl.optionalParams || [])];

    // Collect param values
    const params = {};
    for (const p of allParams) {
      const el = document.getElementById(`wfr-param-${p}`);
      if (!el) continue;
      const meta = WORKFLOW_PARAM_META[p] || {};
      if (meta.type === 'boolean') {
        params[p] = el.checked;
      } else if (meta.type === 'number') {
        if (el.value !== '') params[p] = Number(el.value);
      } else if (meta.type === 'image') {
        const file = el.files[0];
        if (file) {
          params[p] = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result.split(',')[1]); // base64 only
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }
      } else {
        if (el.value.trim()) params[p] = el.value.trim();
      }
    }

    // Validate required
    for (const p of (tpl.requiredParams || [])) {
      if (!params[p] && params[p] !== 0 && params[p] !== false) {
        this.studio.showToast(`"${p}" is required`, 'error');
        return;
      }
    }

    // Show progress phase
    document.getElementById('wfr-progress-name').textContent = tpl.name;
    document.getElementById('wfr-progress-status').textContent = 'starting…';
    document.getElementById('wfr-step-list').innerHTML = '';
    document.getElementById('wfr-progress-actions').style.display = 'none';
    this._showPhase('progress');

    try {
      // Connect SSE before submitting so we don't miss events
      this._connectSSE();

      const res = await fetch(`${this.CHATROOM_API}/workflows/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: tpl.id, params }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to start workflow');
      }
      const data = await res.json();
      this.activeWorkflowId = data.workflowId;
      document.getElementById('wfr-progress-status').textContent = 'running';
      document.getElementById('wfr-progress-status').style.background = '#fff3e0';
      document.getElementById('wfr-progress-status').style.color = '#e65100';
    } catch (e) {
      this.studio.showToast(e.message, 'error');
      this._showPhase('params');
      this._disconnectSSE();
    }
  }

  // ─── SSE monitoring ────────────────────────────────────────────────────────

  _connectSSE() {
    this._disconnectSSE();
    this.eventSource = new EventSource(`${this.CHATROOM_API}/chat/stream`);

    const events = [
      'workflow_start', 'workflow_step_start', 'workflow_step_complete',
      'workflow_step_error', 'workflow_complete', 'workflow_error',
      'workflow_step_chunk',
    ];

    for (const evt of events) {
      this.eventSource.addEventListener(evt, (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.workflowId !== this.activeWorkflowId) return;
          this._handleWorkflowEvent(evt, data);
        } catch (_) {}
      });
    }

    // Safety net: if neither workflow_complete nor workflow_error arrives
    // within 5 minutes, force-close the stream so it can't dangle forever.
    if (this._sseSafetyTimer) clearTimeout(this._sseSafetyTimer);
    this._sseSafetyTimer = setTimeout(() => {
      console.warn('[WorkflowRunner] SSE safety timeout — closing stream');
      this._disconnectSSE();
    }, 5 * 60 * 1000);
  }

  _disconnectSSE() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this._sseSafetyTimer) {
      clearTimeout(this._sseSafetyTimer);
      this._sseSafetyTimer = null;
    }
  }

  _handleWorkflowEvent(type, data) {
    const statusEl = document.getElementById('wfr-progress-status');
    const listEl = document.getElementById('wfr-step-list');

    switch (type) {
      case 'workflow_start': {
        statusEl.textContent = 'running';
        // Build step list from step metadata
        if (data.steps) {
          listEl.innerHTML = data.steps.map(s => `
            <div id="wfr-step-${s.id}" style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #f5f5f5;">
              <span class="wfr-step-dot" style="width:8px; height:8px; border-radius:50%; background:#ddd; flex-shrink:0;"></span>
              <span style="font-size:12px; color:#666; flex:1;">${s.id}</span>
              <span style="font-size:11px; color:#999;">${(s.type || '').replace('synth_', '')}</span>
              <span class="wfr-step-status" style="font-size:11px; color:#bbb;">pending</span>
            </div>
          `).join('');
        }
        break;
      }
      case 'workflow_step_start': {
        const row = document.getElementById(`wfr-step-${data.stepId}`);
        if (row) {
          row.querySelector('.wfr-step-dot').style.background = '#f0a500';
          row.querySelector('.wfr-step-status').textContent = 'running';
          row.querySelector('.wfr-step-status').style.color = '#f0a500';
        }
        break;
      }
      case 'workflow_step_complete': {
        const row = document.getElementById(`wfr-step-${data.stepId}`);
        if (row) {
          row.querySelector('.wfr-step-dot').style.background = '#4caf50';
          row.querySelector('.wfr-step-status').textContent = 'done';
          row.querySelector('.wfr-step-status').style.color = '#4caf50';
        }
        // Store result for later display
        if (!this._stepResults) this._stepResults = [];
        this._stepResults.push({ stepId: data.stepId, stepType: data.stepType, ...data.summary });
        break;
      }
      case 'workflow_step_error': {
        const row = document.getElementById(`wfr-step-${data.stepId}`);
        if (row) {
          row.querySelector('.wfr-step-dot').style.background = '#e94560';
          row.querySelector('.wfr-step-status').textContent = 'failed';
          row.querySelector('.wfr-step-status').style.color = '#e94560';
        }
        break;
      }
      case 'workflow_complete': {
        statusEl.textContent = data.status === 'failed' ? 'failed' : 'complete';
        statusEl.style.background = data.status === 'failed' ? '#ffebee' : '#e8f5e9';
        statusEl.style.color = data.status === 'failed' ? '#c62828' : '#2e7d32';
        // Merge final step results
        if (data.stepResults) {
          this._stepResults = data.stepResults.map(s => ({
            stepId: s.id, stepType: s.type, status: s.status, ...s,
          }));
        }
        document.getElementById('wfr-progress-actions').style.display = '';
        this._disconnectSSE();
        if (data.status === 'failed') {
          this.studio.showToast('Workflow failed to complete all steps', 'error');
        } else {
          this.studio.showToast('Workflow complete', 'success');
        }
        break;
      }
      case 'workflow_step_chunk': {
        const row = document.getElementById(`wfr-step-${data.stepId}`);
        if (row) {
          const statusSpan = row.querySelector('.wfr-step-status');
          // Show truncated live text instead of just "running"
          const preview = (data.text || '').slice(-30).replace(/\n/g, ' ');
          statusSpan.textContent = preview ? `…${preview}` : 'running';
          statusSpan.style.color = '#f0a500';
        }
        break;
      }
      case 'workflow_error': {
        statusEl.textContent = 'error';
        statusEl.style.background = '#ffebee';
        statusEl.style.color = '#c62828';
        this._disconnectSSE();
        this.studio.showToast(data.error || 'Workflow failed', 'error');
        break;
      }
    }
  }

  // ─── Results display ───────────────────────────────────────────────────────

  async _showResults() {
    this._showPhase('results');
    const grid = document.getElementById('wfr-results-grid');
    grid.innerHTML = '<p style="color:#999; font-size:12px; text-align:center;">Loading results…</p>';

    const results = this._stepResults || [];
    const mediaSteps = results.filter(s => s.mediaId);
    const textSteps = results.filter(s => !s.mediaId && (s.text || s.description || s.narrative));

    if (mediaSteps.length === 0 && textSteps.length === 0) {
      grid.innerHTML = '<p style="color:#999; font-size:12px; text-align:center;">No viewable results.</p>';
      return;
    }

    // Fetch media items
    const mediaItems = [];
    for (const step of mediaSteps) {
      try {
        const res = await fetch(`${this.CHATROOM_API}/chat/media/${step.mediaId}`);
        if (res.ok) {
          const media = await res.json();
          mediaItems.push({ ...step, media });
        }
      } catch (_) {}
    }

    // Store for lightbox
    this.studio.currentBatchResults = mediaItems.map(m => m.media.data);

    let html = '';

    // Media results
    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];
      const src = `data:${item.media.mimeType || 'image/png'};base64,${item.media.data}`;
      if (item.media.type === 'video') {
        html += `
          <div style="border-radius:8px; overflow:hidden; border:1px solid #eee;">
            <video src="${src}" controls muted style="width:100%; display:block;"></video>
            <div style="padding:6px 8px; font-size:11px; color:#888;">${item.stepId}</div>
          </div>`;
      } else {
        html += `
          <div style="border-radius:8px; overflow:hidden; border:1px solid #eee; cursor:pointer;"
               onclick="window.studioIntegrationInstance.openLightbox(${i})">
            <img src="${src}" style="width:100%; height:140px; object-fit:cover; display:block;">
            <div style="padding:6px 8px; font-size:11px; color:#888;">${item.stepId}</div>
          </div>`;
      }
    }

    // Text results
    for (const step of textSteps) {
      const text = step.text || step.description || step.narrative || '';
      html += `
        <div style="grid-column:1/-1; padding:12px; border:1px solid #eee; border-radius:8px; background:#fafafa;">
          <div style="font-size:11px; font-weight:600; color:#888; margin-bottom:6px;">${step.stepId} (${(step.stepType || step.type || '').replace('synth_', '')})</div>
          <div style="font-size:12px; color:#333; line-height:1.5; max-height:150px; overflow-y:auto; white-space:pre-wrap;">${text.slice(0, 1000)}${text.length > 1000 ? '…' : ''}</div>
        </div>`;
    }

    grid.innerHTML = html;
  }
}

// ─── Param metadata (mirrors chatroom workflowData.js) ───────────────────────

const WORKFLOW_PARAM_META = {
  image:             { type: 'image', label: 'Source Image' },
  prompt:            { type: 'textarea', label: 'Prompt', placeholder: 'Describe what to generate…' },
  subject:           { type: 'textarea', label: 'Subject', placeholder: 'Subject to generate…' },
  concept:           { type: 'textarea', label: 'Concept', placeholder: 'Creative concept…' },
  description:       { type: 'textarea', label: 'Description', placeholder: 'Describe the template…' },
  theme:             { type: 'text', label: 'Theme', placeholder: 'e.g. deep sea mystery' },
  scenario:          { type: 'textarea', label: 'Scenario', placeholder: 'Starting scenario…' },
  memory:            { type: 'textarea', label: 'Memory', placeholder: 'A vivid memory to visualize…' },
  subjects:          { type: 'textarea', label: 'Subjects', placeholder: 'Comma-separated subjects' },
  scene:             { type: 'textarea', label: 'Scene', placeholder: 'Scene description…' },
  negative_prompt:   { type: 'textarea', label: 'Negative Prompt', placeholder: 'What to avoid in the image…' },
  refinement_instruction: { type: 'textarea', label: 'Refinement Instruction', default: 'enhance detail, improve composition, increase visual coherence', placeholder: 'How to refine the image…' },
  style:             { type: 'style_select', label: 'Style Preset', default: 'oil_painting', options: [
    { value: 'oil_painting', label: 'Oil Painting' }, { value: 'watercolor', label: 'Watercolor' },
    { value: 'impressionist', label: 'Impressionism' }, { value: 'ukiyo_e', label: 'Ukiyo-e' },
    { value: 'ink_wash', label: 'Ink Wash / Sumi-e' }, { value: 'expressionist', label: 'Expressionism' },
    { value: 'pointillism', label: 'Pointillism' }, { value: 'claymation', label: 'Claymation' },
    { value: 'marble_sculpture', label: 'Marble Sculpture' }, { value: 'kintsugi', label: 'Kintsugi' },
    { value: 'origami', label: 'Origami' }, { value: 'low_poly', label: 'Low Poly' },
    { value: 'daguerreotype', label: 'Daguerreotype' }, { value: 'polaroid', label: 'Polaroid' },
    { value: 'infrared', label: 'Infrared' }, { value: 'tilt_shift', label: 'Tilt Shift' },
    { value: 'noir', label: 'Noir' }, { value: 'cinematic', label: 'Cinematic' },
    { value: 'glitch', label: 'Glitch' }, { value: 'datamosh', label: 'Datamosh' },
    { value: 'vaporwave', label: 'Vaporwave' }, { value: 'pixel_art', label: 'Pixel Art' },
    { value: 'ascii', label: 'ASCII' }, { value: 'wireframe', label: 'Wireframe' },
    { value: 'synesthesia', label: 'Synesthesia' }, { value: 'temporal_collapse', label: 'Temporal Collapse' },
    { value: 'recursive', label: 'Recursive' }, { value: 'dream_logic', label: 'Dream Logic' },
    { value: 'cosmic_horror', label: 'Cosmic Horror' }, { value: 'bioluminescent', label: 'Bioluminescent' },
    { value: 'stained_glass', label: 'Stained Glass' }, { value: 'embroidery', label: 'Embroidery' },
    { value: 'mosaic', label: 'Mosaic' }, { value: 'neon_sign', label: 'Neon Sign' },
    { value: 'ice_sculpture', label: 'Ice Sculpture' }, { value: 'woodcut', label: 'Woodcut' },
    { value: 'art_nouveau', label: 'Art Nouveau' }, { value: 'art_deco', label: 'Art Deco' },
    { value: 'baroque', label: 'Baroque' }, { value: 'cyberpunk', label: 'Cyberpunk' },
    { value: 'solarpunk', label: 'Solarpunk' }, { value: 'soviet_constructivism', label: 'Soviet Constructivism' },
    { value: 'comic_book', label: 'Comic Book' }, { value: 'manga', label: 'Manga' },
    { value: 'botanical_illustration', label: 'Botanical Illustration' }, { value: 'children_book', label: "Children's Book" },
    { value: 'blueprint', label: 'Blueprint' }, { value: 'double_exposure', label: 'Double Exposure' },
    { value: 'cyanotype', label: 'Cyanotype' }, { value: 'risograph', label: 'Risograph' },
    { value: 'generative_art', label: 'Generative Art' }, { value: 'thermal_vision', label: 'Thermal Vision' },
    { value: 'x_ray', label: 'X-Ray' },
  ]},
  styles:            { type: 'text', label: 'Styles', placeholder: 'Comma-separated: oil_painting,glitch,ukiyo_e' },
  transforms:        { type: 'textarea', label: 'Transforms (one per line = one iteration)', placeholder: 'One transform per line — each applies to the previous result:\nmake it darker and moodier\nadd golden hour lighting\nconvert to oil painting style' },
  mood:              { type: 'select', label: 'Mood', default: 'cinematic', options: [
    'cinematic', 'dreamy', 'melancholic', 'eerie', 'euphoric', 'noir', 'surreal', 'intimate',
  ]},
  mode:              { type: 'select', label: 'Mode', default: 'text', options: ['text', 'image', 'hybrid', 'story', 'workflow'] },
  aspect_ratio:      { type: 'select', label: 'Aspect Ratio', default: '16:9', options: [
    { value: '1:1', label: '1:1 (Square)' },
    { value: '16:9', label: '16:9 (Widescreen)' },
    { value: '9:16', label: '9:16 (Vertical)' },
    { value: '4:3', label: '4:3 (Photo)' },
    { value: '3:4', label: '3:4 (Portrait)' },
    { value: '21:9', label: '21:9 (Cinematic)' },
  ]},
  cinematic_style:   { type: 'select', label: 'Cinematic Style', default: 'cinematic', options: [
    { value: 'cinematic', label: 'Cinematic' },
    { value: 'documentary', label: 'Documentary' },
    { value: 'music_video', label: 'Music Video' },
    { value: 'dreamy', label: 'Dreamy' },
    { value: 'horror', label: 'Horror' },
    { value: 'noir', label: 'Noir' },
    { value: 'anime', label: 'Anime' },
    { value: 'stop_motion', label: 'Stop Motion' },
    { value: 'timelapse', label: 'Timelapse' },
    { value: 'vhs', label: 'VHS' },
    { value: 'surveillance', label: 'Surveillance' },
  ]},
  refine:            { type: 'boolean', label: 'Refine Result', default: false },
  narrative_mode:    { type: 'select', label: 'Narrative Mode', default: 'dream', options: [
    { value: 'dream', label: 'Dream' }, { value: 'story', label: 'Story' },
    { value: 'poem', label: 'Poem' }, { value: 'monologue', label: 'Monologue' },
  ]},
  complexity:        { type: 'select', label: 'Complexity', default: 'medium', options: [
    { value: 'simple', label: 'Simple' }, { value: 'medium', label: 'Medium' }, { value: 'complex', label: 'Complex' },
  ]},
  scene_count:       { type: 'number', label: 'Scene Count', default: 4, min: 3, max: 5 },
  image_count:       { type: 'number', label: 'Image Count', default: 3, min: 1, max: 5 },
  page_count:        { type: 'number', label: 'Page Count', default: 12, min: 6, max: 30 },
  endings:           { type: 'number', label: 'Endings', default: 3, min: 2, max: 6 },
  duration:          { type: 'number', label: 'Duration (seconds)', default: 5, min: 4, max: 10 },
  degradation_depth: { type: 'number', label: 'Degradation Depth', default: 4, min: 1, max: 5 },
  life_stage:        { type: 'select', label: 'Life Stage', default: 'childhood', options: [
    'childhood', 'adolescence', 'young_adult', 'middle_age', 'old_age',
  ]},
};

// Expose globally
window.WorkflowRunner = WorkflowRunner;
