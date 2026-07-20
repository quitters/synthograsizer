/* ──────────────────────────────────────────────────────────────────────
 * Backend & Safety panel
 *
 * Appends a "Backend & Safety" section to the Global Settings modal
 * (#studio-settings-modal, built by studio-integration.js injectModals).
 *
 * What it controls:
 *   - Backend tier for TEXT generation:
 *       google : Google GenAI APIs — Google's safety filters and Prohibited
 *                Use Policy apply.
 *       local  : an OpenAI-compatible endpoint on your own hardware
 *                (Ollama, LM Studio). Synthograsizer applies no content
 *                filters of its own — your discretion under the Terms (§6).
 *     Mixed-mode v1: images, video, and music ALWAYS generate via Google.
 *   - Google API mode (google_api_mode):
 *       interactions : Interactions API (default) — Google-managed filtering,
 *                      store=false on every call; threshold knobs are inert.
 *       legacy       : generateContent — honors the per-category thresholds.
 *   - Google safety defaults (saved server-side via POST /api/config).
 *
 * Hosted deployments (/api/health → hosted:true): everything renders
 * read-only — the backend is pinned by whoever runs the server — and the
 * API-key input is hidden (the operator supplies the key). When accounts are
 * also on (service.auth_required), the key note says usage is metered in
 * credits instead; `hosted` alone doesn't imply a credit system.
 *
 * Load order: after studio-integration.js. No-ops in demo mode.
 * ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  if (window.SYNTH_DEMO_MODE) return;

  const TIER_KEY = 'synthograsizerBackendTierV1';

  const SAFETY_CATEGORIES = [
    { id: 'HARM_CATEGORY_HARASSMENT',        label: 'Harassment' },
    { id: 'HARM_CATEGORY_HATE_SPEECH',       label: 'Hate speech' },
    { id: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', label: 'Sexually explicit' },
    { id: 'HARM_CATEGORY_DANGEROUS_CONTENT', label: 'Dangerous content' },
    { id: 'HARM_CATEGORY_CIVIC_INTEGRITY',   label: 'Civic integrity' },
  ];

  // Threshold vocabulary passed through verbatim — Google's API is the
  // arbiter of what's permitted; its rejections surface at generation time.
  const THRESHOLDS = [
    { v: 'BLOCK_NONE',             label: 'Off (where permitted)' },
    { v: 'BLOCK_ONLY_HIGH',        label: 'Light (block high risk)' },
    { v: 'BLOCK_MEDIUM_AND_ABOVE', label: 'Medium' },
    { v: 'BLOCK_LOW_AND_ABOVE',    label: 'Strict' },
  ];
  const BASELINE_THRESHOLD = 'BLOCK_ONLY_HIGH';

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function buildPanelHTML(snap) {
    const hosted = !!snap.hosted;
    const tier = snap.backend_tier || 'google';
    const apiMode = snap.google_api_mode || 'interactions';
    const thresholdsActive = apiMode === 'legacy';
    const safety = {};
    (snap.safety_defaults || []).forEach(s => { safety[s.category] = s.threshold; });

    const thresholdOptions = (current) => THRESHOLDS.map(t =>
      `<option value="${t.v}" ${t.v === (current || BASELINE_THRESHOLD) ? 'selected' : ''}>${t.label}</option>`
    ).join('');

    const safetyRows = SAFETY_CATEGORIES.map(c => `
      <div class="bsp-safety-row">
        <span class="bsp-safety-label">${c.label}</span>
        <select class="bsp-safety-select" data-category="${c.id}" ${(hosted || !thresholdsActive) ? 'disabled' : ''}>
          ${thresholdOptions(safety[c.id])}
        </select>
      </div>`).join('');

    return `
    <div id="backend-safety-panel" style="margin-top:20px; padding-top:16px; border-top:1px dashed rgba(0,0,0,.2);">
      <div style="font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; margin-bottom:10px;">
        Backend &amp; Safety
      </div>

      ${hosted ? `
      <div style="padding:10px 12px; background:rgba(90,138,184,.10); border:1px solid #5a8ab8; border-radius:6px; font-size:12px; line-height:1.6; margin-bottom:12px;">
        🔒 <strong>Pinned to the ${tier === 'local' ? 'local-model' : 'Google'} backend.</strong>
        Everything below is read-only on this deployment.${tier === 'google' ? ` Google's safety
        filtering and <a href="https://policies.google.com/terms/generative-ai/use-policy" target="_blank" rel="noopener">Prohibited
        Use Policy</a> apply to everything generated here.` : ''}
        <a href="https://github.com/quitters/synthograsizer" target="_blank" rel="noopener">Run Synthograsizer
        locally</a> to pick your own backend and thresholds.
      </div>` : ''}

      <div class="studio-input-group">
        <label>Text-generation backend</label>
        <label style="display:flex; gap:8px; align-items:flex-start; font-weight:normal; cursor:pointer; margin:4px 0;">
          <input type="radio" name="bsp-tier" value="google" ${tier === 'google' ? 'checked' : ''} ${hosted ? 'disabled' : ''} style="margin-top:3px;">
          <span><strong>Google AI (cloud)</strong><br>
          <span style="font-size:11.5px; opacity:.85;">Google's safety filters and
          <a href="https://policies.google.com/terms/generative-ai/use-policy" target="_blank" rel="noopener">Prohibited Use Policy</a>
          apply. The selectors below adjust Google's thresholds within what its API permits.</span></span>
        </label>
        <label style="display:flex; gap:8px; align-items:flex-start; font-weight:normal; cursor:pointer; margin:4px 0;">
          <input type="radio" name="bsp-tier" value="local" ${tier === 'local' ? 'checked' : ''} ${hosted ? 'disabled' : ''} style="margin-top:3px;">
          <span><strong>Local model (OpenAI-compatible — Ollama, LM Studio)</strong><br>
          <span style="font-size:11.5px; opacity:.85;">Runs on your hardware. Synthograsizer applies
          <em>no content filters of its own</em> — your responsibility under the
          <a href="/terms/#acceptable-use" target="_blank">Terms §6</a> acceptable-use rules.</span></span>
        </label>
        <div style="font-size:11px; opacity:.75; margin-top:6px;">
          Mixed-mode v1: images, video, and music always generate via Google.
          Daydream Scope is a third-party local renderer (output target, not a generation backend) — its own terms apply.
        </div>
      </div>

      <div id="bsp-local-fields" style="display:${tier === 'local' ? 'block' : 'none'}; padding:10px; background:rgba(0,0,0,.04); border-radius:6px; margin-bottom:10px;">
        <div class="studio-input-group">
          <label>Local endpoint (base URL)</label>
          <input type="text" id="bsp-local-url" placeholder="http://localhost:11434/v1"
                 value="${(snap.local_base_url || '').replace(/"/g, '&quot;')}" ${hosted ? 'disabled' : ''}>
        </div>
        <div class="studio-input-group">
          <label>Model name</label>
          <input type="text" id="bsp-local-model" list="bsp-model-list" placeholder="llama3.1"
                 value="${(snap.local_model || '').replace(/"/g, '&quot;')}" ${hosted ? 'disabled' : ''}>
          <datalist id="bsp-model-list"></datalist>
        </div>
        <button class="studio-btn-secondary" id="bsp-test-conn" type="button" ${hosted ? 'disabled' : ''}>⚡ Test connection</button>
        <span id="bsp-conn-status" style="font-size:11px; margin-left:8px;"></span>
      </div>

      <div id="bsp-safety-block" style="display:${tier === 'google' ? 'block' : 'none'};">
        <div class="studio-input-group">
          <label>Google API</label>
          <label style="display:flex; gap:8px; align-items:flex-start; font-weight:normal; cursor:pointer; margin:4px 0;">
            <input type="radio" name="bsp-api-mode" value="interactions" ${apiMode === 'interactions' ? 'checked' : ''} ${hosted ? 'disabled' : ''} style="margin-top:3px;">
            <span><strong>Interactions API (current)</strong><br>
            <span style="font-size:11.5px; opacity:.85;">Google's recommended interface. Filtering is
            managed by Google — the per-category thresholds below don't apply. Requests are sent
            stateless (<code>store=false</code>): nothing is retained server-side at Google.</span></span>
          </label>
          <label style="display:flex; gap:8px; align-items:flex-start; font-weight:normal; cursor:pointer; margin:4px 0;">
            <input type="radio" name="bsp-api-mode" value="legacy" ${apiMode === 'legacy' ? 'checked' : ''} ${hosted ? 'disabled' : ''} style="margin-top:3px;">
            <span><strong>generateContent (legacy)</strong><br>
            <span style="font-size:11.5px; opacity:.85;">Still fully supported by Google. Honors the
            per-category thresholds below — switch here if the Interactions API blocks too much of
            your artistic work.</span></span>
          </label>
        </div>
        <div class="studio-input-group">
          <label>Google safety thresholds <span style="font-weight:normal; opacity:.7;">(apply to all Google calls — image, video, and text on the Google backend)</span></label>
          <div id="bsp-api-mode-note" style="display:${thresholdsActive ? 'none' : 'block'}; font-size:11px; padding:8px 10px; background:rgba(90,138,184,.10); border:1px solid #5a8ab8; border-radius:6px; margin-bottom:6px;">
            ${hosted
              ? `ℹ️ <strong>Not in effect here.</strong> This deployment uses the Interactions API,
                 where Google applies its own managed filtering — the values below are shown for
                 reference only.`
              : `ℹ️ Thresholds are saved but <strong>only enforced on the legacy generateContent API</strong>.
                 On the Interactions API, Google applies its own managed filtering.`}
          </div>
          ${safetyRows}
          <div style="font-size:11px; opacity:.75; margin-top:6px;">
            "Off" is honored only where Google's API permits it for your account — rejections
            surface as errors when you generate, not here.
          </div>
        </div>
        <button class="studio-btn-secondary" id="bsp-safety-reset" type="button" ${(hosted || !thresholdsActive) ? 'disabled' : ''}>↺ Reset to defaults</button>
      </div>

      ${hosted ? '' : `<button class="studio-btn-primary" id="bsp-save" type="button" style="margin-top:12px;">Save Backend &amp; Safety</button>`}
      <div style="margin-top:12px; font-size:11px; opacity:.8;">
        💬 <a href="#" id="bsp-feedback-link">Send feedback</a> — wrong block, missing feature, anything.
      </div>
    </div>`;
  }

  function injectStyles() {
    if (document.getElementById('bsp-styles')) return;
    const s = document.createElement('style');
    s.id = 'bsp-styles';
    s.textContent = `
      #backend-safety-panel .bsp-safety-row {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; padding: 3px 0;
      }
      #backend-safety-panel .bsp-safety-label { font-size: 12px; }
      #backend-safety-panel .bsp-safety-select { font-size: 12px; padding: 2px 6px; min-width: 170px; }
      #backend-safety-panel .studio-btn-secondary {
        font-size: 12px; padding: 5px 10px; cursor: pointer;
      }
    `;
    document.head.appendChild(s);
  }

  function wirePanel(studio, snap) {
    const hosted = !!snap.hosted;

    // Tier radio → toggle sub-sections
    document.querySelectorAll('input[name="bsp-tier"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const local = radio.value === 'local' && radio.checked;
        document.getElementById('bsp-local-fields').style.display = local ? 'block' : 'none';
        document.getElementById('bsp-safety-block').style.display = local ? 'none' : 'block';
      });
    });

    // Google API mode radio → arm/disarm the threshold knobs
    document.querySelectorAll('input[name="bsp-api-mode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const legacy = document.querySelector('input[name="bsp-api-mode"]:checked')?.value === 'legacy';
        document.querySelectorAll('.bsp-safety-select').forEach(sel => { sel.disabled = hosted || !legacy; });
        const note = document.getElementById('bsp-api-mode-note');
        if (note) note.style.display = legacy ? 'none' : 'block';
        const reset = document.getElementById('bsp-safety-reset');
        if (reset) reset.disabled = hosted || !legacy;
      });
    });

    // Test connection → /api/backend/local/models (uses the SAVED url; hint if edited)
    const testBtn = document.getElementById('bsp-test-conn');
    if (testBtn) testBtn.addEventListener('click', async () => {
      const status = document.getElementById('bsp-conn-status');
      const urlInput = document.getElementById('bsp-local-url');
      status.textContent = '…';
      status.style.color = '';
      try {
        if (!hosted && urlInput && urlInput.value.trim() &&
            urlInput.value.trim().replace(/\/$/, '') !== (snap.local_base_url || '').replace(/\/$/, '')) {
          // Save the URL first so the server-side probe hits what the user typed.
          await saveConfig(studio, { local_base_url: urlInput.value.trim() }, { quiet: true });
          snap.local_base_url = urlInput.value.trim();
        }
        const res = await fetch('/api/backend/local/models');
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || res.statusText);
        const list = document.getElementById('bsp-model-list');
        list.innerHTML = (data.models || []).map(m => `<option value="${m}">`).join('');
        status.textContent = `✓ ${data.models.length} model(s) found`;
        status.style.color = '#10b981';
      } catch (e) {
        status.textContent = '✗ ' + (e.message || 'unreachable');
        status.style.color = '#ef4444';
      }
    });

    // Reset safety selects to baseline
    const resetBtn = document.getElementById('bsp-safety-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      document.querySelectorAll('.bsp-safety-select').forEach(sel => { sel.value = BASELINE_THRESHOLD; });
    });

    // Save
    const saveBtn = document.getElementById('bsp-save');
    if (saveBtn) saveBtn.addEventListener('click', async () => {
      const tier = document.querySelector('input[name="bsp-tier"]:checked')?.value || 'google';
      const payload = { backend_tier: tier };
      if (tier === 'local') {
        const url = document.getElementById('bsp-local-url').value.trim();
        const model = document.getElementById('bsp-local-model').value.trim();
        if (url) payload.local_base_url = url;
        if (model) payload.local_model = model;
      } else {
        payload.google_api_mode =
          document.querySelector('input[name="bsp-api-mode"]:checked')?.value || 'interactions';
        // Thresholds are saved regardless of mode — they take effect whenever
        // the legacy generateContent API is selected.
        payload.safety_settings = Array.from(document.querySelectorAll('.bsp-safety-select')).map(sel => ({
          category: sel.dataset.category,
          threshold: sel.value,
        }));
      }
      await saveConfig(studio, payload);
    });

    // Feedback link → general feedback modal (provided by studio-integration)
    const fb = document.getElementById('bsp-feedback-link');
    if (fb) fb.addEventListener('click', (e) => {
      e.preventDefault();
      if (studio && typeof studio.openFeedbackModal === 'function') {
        studio.openFeedbackModal();
      } else {
        window.open('https://github.com/quitters/synthograsizer/issues/new/choose', '_blank');
      }
    });
  }

  async function saveConfig(studio, payload, opts = {}) {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || res.statusText);
      if (payload.backend_tier) {
        try { localStorage.setItem(TIER_KEY, payload.backend_tier); } catch (_) {}
      }
      if (!opts.quiet && studio) studio.showToast('Backend & safety settings saved', 'success');
      return data;
    } catch (e) {
      if (studio) studio.showToast('Save failed: ' + e.message, 'error');
      throw e;
    }
  }

  function markKeyConfigured(modalBody, snap) {
    // Local instances: make it obvious when a key is already active so users
    // don't re-enter it (or think setup failed) on every visit.
    if (!snap.api_key_configured || snap.hosted) return;
    const input = modalBody.querySelector('#api-key-input');
    if (!input || document.getElementById('bsp-key-status')) return;
    input.placeholder = '•••••••• (a key is configured — leave blank to keep it)';
    const group = input.closest('.studio-input-group') || input.parentElement;
    group.appendChild(el(
      '<div id="bsp-key-status" style="font-size:11px; color:#10b981; margin-top:4px;">' +
      '✓ API key active on this server. Enter a new one only to replace it.</div>'
    ));
  }

  function applyHostedKeyUI(modalBody, snap) {
    // Hosted deployments: the operator supplies the key — hide the input and
    // replace the amber "local use only" warning with a calmer note. With
    // accounts on (service mode), say what the user actually pays with.
    const keyGroup = modalBody.querySelector('#api-key-input')?.closest('.studio-input-group');
    const saveBtn = modalBody.querySelector('#api-key-save');
    if (keyGroup) keyGroup.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'none';
    const warning = Array.from(modalBody.children).find(div =>
      div.textContent && div.textContent.includes('Local use only'));
    if (!warning) return;
    warning.innerHTML = snap && snap.service && snap.service.auth_required
      ? '🔒 <strong>Hosted service.</strong> Generation runs on the operator\'s API key and is ' +
        'metered in credits, so there\'s no key to enter here — your balance is in the account menu.'
      : '🔒 <strong>Hosted deployment.</strong> The API key is supplied by whoever runs this ' +
        'server. Run Synthograsizer locally to use your own.';
  }

  function init() {
    const studio = window.studioIntegrationInstance;
    const modal = document.getElementById('studio-settings-modal');
    if (!studio || !modal) return false;
    const body = modal.querySelector('.studio-modal-body');
    if (!body || document.getElementById('backend-safety-panel')) return true;

    injectStyles();

    // Paint immediately from the localStorage mirror, then reconcile with the server.
    fetch('/api/health')
      .then(r => r.json())
      .then(snap => {
        body.appendChild(el(buildPanelHTML(snap)));
        wirePanel(studio, snap);
        if (snap.hosted) applyHostedKeyUI(body, snap);
        markKeyConfigured(body, snap);
        try { localStorage.setItem(TIER_KEY, snap.backend_tier || 'google'); } catch (_) {}
        window.synthBackendTier = snap.backend_tier || 'google';
      })
      .catch(() => {
        // Server unreachable — render with mirrored/default state, not hosted.
        const tier = (() => { try { return localStorage.getItem(TIER_KEY) || 'google'; } catch (_) { return 'google'; } })();
        body.appendChild(el(buildPanelHTML({ backend_tier: tier, hosted: false, safety_defaults: [] })));
        wirePanel(studio, { hosted: false });
        window.synthBackendTier = tier;
      });
    return true;
  }

  // Wait for studio-integration to construct the modal (demo-mode pattern).
  const timer = setInterval(() => { if (init()) clearInterval(timer); }, 250);
  setTimeout(() => clearInterval(timer), 15000); // give up quietly after 15s
})();
