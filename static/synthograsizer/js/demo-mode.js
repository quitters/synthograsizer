/* ──────────────────────────────────────────────────────────────────────
 * Synthograsizer DEMO Mode
 *
 * Activated when window.SYNTH_DEMO_MODE === true (set by demo.html).
 * Locks the app to a public-safe subset:
 *   - Perform layout only; Studio toggle removed
 *   - Generate button replaced with Open Glitcher
 *   - Image / Video / Agent studio modals stubbed out
 *   - Every model selector locked to gemini-3.1-flash-lite-preview
 * ────────────────────────────────────────────────────────────────────── */
(function () {
  if (!window.SYNTH_DEMO_MODE) return;

  var DEMO_MODEL = 'gemini-3.1-flash-lite-preview';
  var DEMO_MODEL_LABEL = 'Gemini 3.1 Flash Lite (DEMO)';

  // ── Lock a single <select> to the demo model ─────────────────────────
  function lockSelect(sel) {
    if (!sel || sel.dataset.demoLocked === '1') return;
    sel.innerHTML = '';
    var opt = document.createElement('option');
    opt.value = DEMO_MODEL;
    opt.textContent = DEMO_MODEL_LABEL;
    opt.selected = true;
    sel.appendChild(opt);
    sel.value = DEMO_MODEL;
    sel.disabled = true;
    sel.title = 'Locked in DEMO mode';
    sel.dataset.demoLocked = '1';
  }

  // ── Lock a radio group (e.g. analysis-model-choice) ──────────────────
  function lockRadioGroup(name) {
    var radios = document.querySelectorAll('input[type="radio"][name="' + name + '"]');
    if (!radios.length) return;
    radios.forEach(function (r, i) {
      if (i === 0) {
        r.value = DEMO_MODEL;
        r.checked = true;
        r.disabled = true;
        r.dataset.demoLocked = '1';
        var label = r.closest('label');
        if (label) label.innerHTML = '';
        if (label) {
          label.appendChild(r);
          label.appendChild(document.createTextNode(' ' + DEMO_MODEL_LABEL));
        }
      } else {
        var label = r.closest('label');
        if (label && label.parentNode) label.parentNode.removeChild(label);
        else r.parentNode && r.parentNode.removeChild(r);
      }
    });
  }

  // ── Sweep the document for any selectors that need locking ───────────
  function sweepLocks(root) {
    root = root || document;
    // Any <select> whose id ends in -model-select OR contains "model"
    var selects = root.querySelectorAll
      ? root.querySelectorAll('select[id$="model-select"], select[id*="model-select"]')
      : [];
    selects.forEach(lockSelect);
    lockRadioGroup('analysis-model-choice');
  }

  // ── Hide forbidden studios ───────────────────────────────────────────
  var FORBIDDEN_MODALS = ['image-studio-modal', 'video-studio-modal', 'agent-studio-modal'];
  function hideForbiddenModals() {
    FORBIDDEN_MODALS.forEach(function (id) {
      var m = document.getElementById(id);
      if (m) {
        m.classList.remove('active');
        m.style.display = 'none';
      }
    });
    // Hide top-nav launcher buttons that point at these modals
    document.querySelectorAll('[data-open-modal]').forEach(function (btn) {
      if (FORBIDDEN_MODALS.indexOf(btn.dataset.openModal) !== -1) btn.style.display = 'none';
    });
    // Common explicit IDs
    ['open-image-studio', 'open-video-studio', 'open-agent-studio',
     'image-studio-button', 'video-studio-button', 'agent-studio-button']
      .forEach(function (id) {
        var b = document.getElementById(id);
        if (b) b.style.display = 'none';
      });
  }

  // ── Stub out studioIntegration.openModal for forbidden modals ────────
  function patchStudioIntegration() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var si = window.studioIntegrationInstance;
      var app = window.synthSmall;

      // Patch studio integration if ready
      if (si && typeof si.openModal === 'function' && !si._demoPatched) {
        var orig = si.openModal.bind(si);
        si.openModal = function (modalId) {
          if (FORBIDDEN_MODALS.indexOf(modalId) !== -1) {
            console.info('[demo] Modal blocked:', modalId);
            return Promise.resolve();
          }
          return orig(modalId);
        };
        si._demoPatched = true;
        console.info('[demo] studioIntegration patched');
      }

      // Patch main app if ready
      if (app && !app._demoPatched) {
        app.handleGenerateImage = function() {
          console.info('[demo] Intercepted handleGenerateImage -> Glitcher');
          var btn = document.querySelector('button[data-demo-glitcher="1"]');
          if (btn) btn.click();
        };
        app._demoPatched = true;
        console.info('[demo] synthSmall patched');
      }

      if ((si && si._demoPatched && app && app._demoPatched) || tries > 100) {
        clearInterval(iv);
      }
    }, 100);
  }

  // ── Wire the Open Glitcher button ────────────────────────────────────
  // The button still has id="generate-button" so app.js's setup succeeds,
  // but data-demo-glitcher="1" tells us to override its behaviour.
  function wireGlitcherButton() {
    var btn = document.querySelector('button[data-demo-glitcher="1"]');
    if (!btn || btn.dataset.demoWired === '1') return;
    btn.dataset.demoWired = '1';
    // Capture-phase listener so we run before app.js's handleGenerateImage
    btn.addEventListener('click', function (ev) {
      ev.stopImmediatePropagation();
      ev.preventDefault();
      if (!window.glitcherStudio && window.GlitcherStudio && window.studioIntegrationInstance) {
        window.glitcherStudio = new window.GlitcherStudio(window.studioIntegrationInstance);
        window.glitcherStudio.init();
      }
      if (window.glitcherStudio) window.glitcherStudio.open();
    }, true);
  }

  // ── Strip layout switcher if it somehow exists ───────────────────────
  function stripLayoutSwitcher() {
    var ls = document.getElementById('layout-switcher');
    if (ls && ls.parentNode) ls.parentNode.removeChild(ls);
    document.body.classList.add('layout-a');
    var root = document.querySelector('.synthograsizer-small');
    if (root) root.classList.add('layout-a');
  }

  // ── Banner so users know they're in DEMO ─────────────────────────────
  function injectBanner() {
    if (document.getElementById('demo-banner')) return;
    var b = document.createElement('div');
    b.id = 'demo-banner';
    b.textContent = 'Synthograsizer Demo';
    b.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:9999;' +
      'background:linear-gradient(90deg,#FF6B35,#F7B801);color:#1a1a1a;' +
      'font:600 11px/1.4 "Roboto Mono",monospace;letter-spacing:.08em;text-transform:uppercase;' +
      'padding:6px 12px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.2);';
    document.body.appendChild(b);
    document.body.style.paddingTop = '28px';
  }

  // ── Boot ─────────────────────────────────────────────────────────────
  function boot() {
    stripLayoutSwitcher();
    injectBanner();
    hideForbiddenModals();
    sweepLocks(document);
    wireGlitcherButton();
    patchStudioIntegration();

    // Re-lock anything dynamically inserted (modal markup is built late)
    var pending = false;
    function scheduleSweep() {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        sweepLocks(document);
        hideForbiddenModals();
        wireGlitcherButton();
      }, 250);
    }
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
          scheduleSweep();
          return;
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
