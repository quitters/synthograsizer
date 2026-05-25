/* ──────────────────────────────────────────────────────────────────────
 * Synthograsizer AV MODE — Resolume-focused control surface
 *
 * Activated when window.SYNTH_AV_MODE === true (set by av.html).
 *
 * Responsibilities:
 *   1. Patch template loader to read from templates-av/ first, fall back
 *      to templates/.
 *   2. Patch the app's _avMaskValueText hook so code-only variables don't
 *      pollute the prompt.
 *   3. Patch _avEmitOsc to fire per-variable OSC messages on changes
 *      (throttled, only when value normalized changes).
 *   4. Augment renderKnobs to add source-tag badges and group headers.
 *   5. Mount the AVInspector drawer.
 *   6. Inject a banner.
 *
 * Designed to coexist with demo-mode.js — but av.html does not load
 * demo-mode.js.
 * ────────────────────────────────────────────────────────────────────── */
(function () {
  if (!window.SYNTH_AV_MODE) return;

  const SOURCE_BADGES = {
    code: { text: 'CODE', cls: 'src-code', tip: 'Drives OSC out only' },
    ai:   { text: 'AI',   cls: 'src-ai',   tip: 'Fills LLM prompt only' },
    both: { text: 'BOTH', cls: 'src-both', tip: 'Prompt + OSC' },
  };

  // ── Banner ────────────────────────────────────────────────────────
  function injectBanner() {
    if (document.getElementById('av-banner')) return;
    const b = document.createElement('div');
    b.id = 'av-banner';
    b.textContent = 'Synthograsizer AV · Resolume Edition';
    b.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:9999;' +
      'background:linear-gradient(90deg,#1a8cff,#00d9c0);color:#0a1424;' +
      'font:600 11px/1.4 "Roboto Mono",monospace;letter-spacing:.08em;text-transform:uppercase;' +
      'padding:6px 12px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.2);';
    document.body.appendChild(b);
    document.body.style.paddingTop = '28px';
  }

  // ── Layout lock ───────────────────────────────────────────────────
  function lockLayout() {
    document.body.classList.add('layout-a', 'av-mode');
    const root = document.querySelector('.synthograsizer-small');
    if (root) root.classList.add('layout-a', 'av-mode');
    const ls = document.getElementById('layout-switcher');
    if (ls && ls.parentNode) ls.parentNode.removeChild(ls);
  }

  // ── Template loader patch — try templates-av/ first ───────────────
  function patchTemplateLoader(loader, store) {
    if (!loader || loader._avPatched) return;
    loader._avPatched = true;
    const origLoad = loader.loadTemplate.bind(loader);
    loader.loadTemplate = async function (templateName) {
      // Always try AV variant first — bypass cache because the badge
      // pre-fetcher may have populated it with the original template.
      // Use a separate cache namespace for AV variants.
      const avCacheKey = `__av:${templateName}`;
      let avData = loader.templates[avCacheKey];
      if (!avData) {
        try {
          const res = await fetch(`templates-av/${templateName}.json`);
          if (res.ok) {
            avData = await res.json();
            loader.templates[avCacheKey] = avData;
          }
        } catch (_) { /* no AV variant — fall through */ }
      }
      if (avData) {
        loader.templates[templateName] = avData; // overwrite cache so badge etc. see AV
        loader.app.loadTemplate(avData);
        loader.updateCurrentTemplateIndex?.(templateName);
        loader.updateHeaderButton?.(templateName);
        loader.showLoadSuccess?.(templateName);
        store.setCurrentTemplate(templateName);
        loader.app._avRefreshKnobs?.();
        console.info('[av] loaded AV variant of', templateName);
        return;
      }
      // Fallback to original templates/
      const result = await origLoad(templateName);
      store.setCurrentTemplate(templateName);
      loader.app._avRefreshKnobs?.();
      return result;
    };

    // Patch badge fetcher similarly (cosmetic — show variable counts)
    const origBadge = loader._loadCardBadge?.bind(loader);
    if (origBadge) {
      loader._loadCardBadge = async function (card, templateName) {
        try {
          if (!loader.templates[templateName]) {
            const res = await fetch(`templates-av/${templateName}.json`);
            if (res.ok) {
              loader.templates[templateName] = await res.json();
            }
          }
        } catch (_) {}
        return origBadge(card, templateName);
      };
    }
  }

  // ── Source-tag classification ─────────────────────────────────────
  function classifyTemplate(tpl) {
    if (!tpl) return 'both';
    const hasCode = !!tpl.p5Code && tpl.p5Code.trim().length > 0;
    const hasPrompt = !!tpl.promptTemplate && tpl.promptTemplate.trim().length > 0;
    if (hasCode && hasPrompt) return 'both';
    if (hasCode) return 'code';
    return 'ai';
  }

  function effectiveSource(variable, templateSource, store) {
    const ov = store?.getOverride(variable.name);
    return ov?.osc?.source
      || variable.osc?.source
      || templateSource;
  }

  // ── Throttled OSC dispatch ────────────────────────────────────────
  class OscDispatcher {
    constructor(app) {
      this.app = app;
      this.lastNorm = new Map();   // varName → last normalized
      this.lastSent = new Map();   // varName → last performance.now()
      this.pending = new Map();    // varName → pending setTimeout id
      this.minInterval = 33;       // ms (~30fps)
    }

    emit(variable, valueIndex) {
      const osc = variable.osc;
      if (!osc?.address) return;
      const source = osc.source || 'both';
      if (source === 'ai') return;

      const total = variable.values.length;
      const norm = total > 1 ? valueIndex / (total - 1) : 0.5;
      if (this.lastNorm.get(variable.name) === norm) return;
      this.lastNorm.set(variable.name, norm);

      const now = performance.now();
      const last = this.lastSent.get(variable.name) || 0;
      const delay = Math.max(0, this.minInterval - (now - last));

      const fire = () => {
        this.lastSent.set(variable.name, performance.now());
        this.pending.delete(variable.name);
        this._send(osc, norm);
      };

      if (delay === 0) {
        fire();
      } else {
        clearTimeout(this.pending.get(variable.name));
        this.pending.set(variable.name, setTimeout(fire, delay));
      }
    }

    _send(osc, norm) {
      const value = window.AVCurves.normToRange(norm, osc.range, osc.curve);
      const sendType = osc.send || 'float';
      if (!this.app?.osc?.enabled) return;
      try {
        if (sendType === 'trigger') {
          this.app.osc.sendParam(osc.address, 1);
        } else if (sendType === 'int') {
          this.app.osc.sendParam(osc.address, Math.round(value));
        } else {
          this.app.osc.sendParam(osc.address, value);
        }
      } catch (e) {
        console.warn('[av] OSC send failed', e);
      }
    }
  }

  // ── Patch app behavior (mask + emit) ──────────────────────────────
  function patchAppHooks(app, store) {
    const dispatcher = new OscDispatcher(app);

    app._avMaskValueText = function (variable, valueText) {
      // Merge override at call time so live edits in the inspector apply immediately
      const ov = store.getOverride(variable.name);
      const source = ov?.osc?.source || variable.osc?.source;
      if (source === 'code') return ''; // skip substitution; placeholder stays as-is in template
      return valueText;
    };

    app._avEmitOsc = function () {
      const tplName = store.currentTemplate();
      if (!tplName) return;
      for (const variable of app.variables) {
        const ov = store.getOverride(variable.name);
        const merged = {
          ...variable,
          osc: { ...(variable.osc || {}), ...(ov?.osc || {}) },
        };
        const valueIdx = app.currentValues[variable.name];
        if (valueIdx == null) continue;
        dispatcher.emit(merged, valueIdx);
      }
    };
  }

  // ── Override renderKnobs to add badges, color, group headers ──────
  function patchRenderKnobs(app, store, inspector) {
    const orig = app.renderKnobs.bind(app);
    app.renderKnobs = function () {
      orig();
      decorateKnobs(app, store, inspector);
    };
    app._avRefreshKnobs = function () {
      if (app.controlMode === 'knobs') decorateKnobs(app, store, inspector);
    };

    // Knob-mode might already be active
    if (app.controlMode === 'knobs') decorateKnobs(app, store, inspector);
  }

  function decorateKnobs(app, store, inspector) {
    const container = app.elements?.knobsContainer;
    if (!container) return;
    const tpl = app.currentTemplate;
    const tplSource = classifyTemplate(tpl);
    const items = Array.from(container.querySelectorAll('.knob-item'));

    items.forEach((item, idx) => {
      const variable = app.variables[idx];
      if (!variable) return;
      const ov = store.getOverride(variable.name) || {};
      const source = effectiveSource(variable, tplSource, store);
      const badge = SOURCE_BADGES[source] || SOURCE_BADGES.both;

      // Source-tag badge
      let badgeEl = item.querySelector('.av-source-badge');
      if (!badgeEl) {
        badgeEl = document.createElement('span');
        badgeEl.className = 'av-source-badge';
        item.appendChild(badgeEl);
      }
      badgeEl.classList.remove('src-code', 'src-ai', 'src-both');
      badgeEl.classList.add(badge.cls);
      badgeEl.textContent = badge.text;
      badgeEl.title = badge.tip;

      // OSC indicator dot
      let dot = item.querySelector('.av-osc-dot');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'av-osc-dot';
        item.appendChild(dot);
      }
      const oscAddr = ov.osc?.address || variable.osc?.address;
      dot.classList.toggle('bound', !!oscAddr);
      dot.title = oscAddr ? `OSC: ${oscAddr}` : 'No OSC mapping';

      // Label override
      if (ov.label) {
        const nameEl = item.querySelector('.knob-var-name');
        if (nameEl) nameEl.textContent = ov.label;
      }

      // Color override
      if (ov.color) {
        item.style.setProperty('--knob-color', ov.color);
      }

      // Group attribute (for CSS-driven header insertion or visual grouping)
      if (ov.group) {
        item.dataset.avGroup = ov.group;
      } else {
        delete item.dataset.avGroup;
      }

      // Inspector trigger: shift-click or right-click for inspector
      if (!item._avBound) {
        item._avBound = true;
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          inspector.selectVariable(variable.name);
        });
        // Long-press / shift-click also opens inspector
        item.addEventListener('click', (e) => {
          if (e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            inspector.selectVariable(variable.name);
          }
        }, true);
      }
    });

    // Insert group headers between knobs where the group changes
    insertGroupHeaders(container, items);
  }

  function insertGroupHeaders(container, items) {
    // Remove existing headers
    container.querySelectorAll('.av-group-header').forEach(n => n.remove());
    let lastGroup = null;
    items.forEach((item) => {
      const g = item.dataset.avGroup || '';
      if (g !== lastGroup) {
        if (g) {
          const h = document.createElement('div');
          h.className = 'av-group-header';
          h.textContent = g;
          container.insertBefore(h, item);
        }
        lastGroup = g;
      }
    });
  }

  // ── Auto-enable knob mode in AV (more useful than D-pad here) ─────
  function preferKnobMode(app) {
    setTimeout(() => {
      try {
        if (app.controlMode !== 'knobs') app.setControlMode('knobs');
      } catch (e) { /* ignore */ }
    }, 300);
  }

  // ── Hide forbidden modals (AI studios stay accessible for AI vars) ──
  // Keep Glitcher reachable. We keep Image Studio too — useful for VJ
  // techs who want stills. Currently we hide nothing.

  // ── Boot ──────────────────────────────────────────────────────────
  function boot() {
    injectBanner();
    lockLayout();

    const store = window.AVProfileStoreSingleton;

    // Wait for the app and template loader to exist
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      const app = window.synthSmall;
      if (app && app.templateLoader && !app._avBooted) {
        clearInterval(iv);
        app._avBooted = true;

        patchTemplateLoader(app.templateLoader, store);
        patchAppHooks(app, store);

        // Mount inspector once OSC controller exists
        const mountInspector = () => {
          if (!app.osc) {
            setTimeout(mountInspector, 200);
            return;
          }
          const inspector = new window.AVInspector({ store, app });
          window.avInspector = inspector;
          patchRenderKnobs(app, store, inspector);

          // Apply saved OSC target on boot
          const target = store.oscTarget();
          app.osc.updateTarget(target.host, target.port);

          // Reload current template through patched loader so the AV
          // variant is picked up if one exists. The original may have
          // been cached by the bootstrap fetch in app.js, so clear it.
          const initialName = 'svg-flow-particles';
          if (app.templateLoader.templates) {
            delete app.templateLoader.templates[initialName];
          }
          app.templateLoader.loadTemplate(initialName);

          app.generateOutput?.();
          app._avRefreshKnobs?.();
        };
        mountInspector();

        preferKnobMode(app);
        installTemplateGenModeFilter();
        console.info('[av] AV mode booted');
        return;
      }
      if (tries > 200) clearInterval(iv);
    }, 100);
  }

  // ── Template Generator: default to p5.js (Create/Workflow/Story are hidden via CSS) ──
  // The modal's default-active tab is "create"; once that's hidden by av-mode CSS the
  // user would see an empty modal because the Create panel doesn't switch on its own.
  // We listen for the modal opening and programmatically click the p5.js tab so the
  // user lands on a visible, AV-relevant default. Idempotent — if remix is already
  // active (e.g. user switched manually) we leave it alone.
  function installTemplateGenModeFilter() {
    function selectAvDefault() {
      const active = document.querySelector('.tg-mode-btn.active');
      const allowed = ['remix', 'p5'];
      if (active && allowed.includes(active.dataset.mode)) return; // already fine
      const p5Btn = document.querySelector('.tg-mode-btn[data-mode="p5"]');
      if (p5Btn) p5Btn.click();
    }
    // The modal can be opened from multiple buttons; the canonical paths all go through
    // window.studioIntegrationInstance.openModal('template-gen-modal'). Hook openModal
    // so we run AFTER the modal is shown, on every open.
    function patchOpenModal() {
      const si = window.studioIntegrationInstance;
      if (!si || si._avTemplateGenPatched) return false;
      const orig = si.openModal && si.openModal.bind(si);
      if (typeof orig !== 'function') return false;
      si.openModal = function (id, ...rest) {
        const result = orig(id, ...rest);
        if (id === 'template-gen-modal') {
          // Defer so the panel display:none toggles already happened
          setTimeout(selectAvDefault, 0);
        }
        return result;
      };
      si._avTemplateGenPatched = true;
      return true;
    }
    if (!patchOpenModal()) {
      // studio-integration may load slightly after av-mode; poll briefly.
      let tries = 0;
      const iv = setInterval(() => {
        if (patchOpenModal() || ++tries > 100) clearInterval(iv);
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
