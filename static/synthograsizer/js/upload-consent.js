/* ──────────────────────────────────────────────────────────────────────
 * Upload-consent notice (PIPEDA principle 3 / GDPR transparency).
 *
 * Before the FIRST image the user brings into the app (file picker or
 * drag-and-drop, any surface), show a one-time notice that uploaded images
 * are sent to Google's generative AI APIs for the analysis/generation the
 * user requests, with a link to the Terms' data-flow table.
 *
 * Mechanics: a capture-phase listener on document intercepts the first
 * image-bearing `change`/`drop` event, cancels it, and shows the notice.
 *
 * After "I understand" the pick is REPLAYED rather than thrown away: the
 * file input is left populated (the earlier version cleared it) and a fresh
 * `change` event is dispatched on it, which the now-consented interceptor lets
 * through to the app's own handler. Picking a file, being interrupted, and then
 * having to find the same file again was the single most annoying moment in the
 * flow, and it was self-inflicted.
 *
 * Drops cannot be replayed this way — a DataTransfer's files can't be
 * re-delivered to a handler that never saw the event — so a dropped file still
 * has to be dropped again, and only that case says so in the copy.
 *
 * Consent persistence:
 *   - local install : localStorage  (once per browser)
 *   - hosted        : sessionStorage (once per visit — anonymous visitors
 *                     each consent for themselves)
 *
 * Self-contained: no dependency on studio-integration; also loaded by the
 * standalone taste-profile page.
 * ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  if (window.SYNTH_DEMO_MODE) return; // demo has uploads disabled anyway

  const KEY = 'synthograsizerUploadConsentV1';
  let hosted = false;
  let store = localStorage;

  // Resolve hosted flag in the background; default (local) is fine until then.
  fetch('/api/health').then(r => r.json()).then(d => {
    hosted = !!d.hosted;
    if (hosted) store = sessionStorage;
  }).catch(() => {});

  function hasConsent() {
    try { return store.getItem(KEY) === 'yes'; } catch (_) { return true; }
  }
  function grantConsent() {
    try { store.setItem(KEY, 'yes'); } catch (_) {}
  }

  function eventHasImages(e) {
    if (e.type === 'change') {
      const input = e.target;
      if (!input || input.type !== 'file' || !input.files?.length) return false;
      return Array.from(input.files).some(f => /^(image|video)\//.test(f.type));
    }
    if (e.type === 'drop') {
      const items = e.dataTransfer?.items;
      if (!items?.length) return false;
      return Array.from(items).some(it => it.kind === 'file' && /^(image|video)\//.test(it.type));
    }
    return false;
  }

  // The input whose pick we interrupted, so accepting can replay it.
  let pendingInput = null;

  function showNotice(canReplay) {
    if (document.getElementById('upload-consent-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'upload-consent-overlay';
    overlay.innerHTML = `
      <div id="upload-consent-card" role="dialog" aria-modal="true" aria-labelledby="uc-title">
        <div id="uc-title" style="font-weight:700; font-size:14px; margin-bottom:8px;">
          📤 Before your first upload
        </div>
        <div style="font-size:13px; line-height:1.6; margin-bottom:12px;">
          Images and media you bring into Synthograsizer are <strong>sent to Google's
          generative AI APIs</strong> (servers typically in the US) to perform the analysis or
          generation you request. Nothing is uploaded anywhere else${hosted ? '' :
          ', and results are saved only on this machine'}.
          <br><br>
          Only upload content you have the right to use — see the
          <a href="/terms/#privacy" target="_blank">data-flow table in the Terms</a>.
        </div>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button id="uc-cancel" type="button">Cancel</button>
          <button id="uc-accept" type="button">I understand — continue</button>
        </div>
        <div style="font-size:11px; opacity:.7; margin-top:8px;">
          You'll only see this once${hosted ? ' per visit' : ''}.${canReplay ? ''
            : ' After continuing, drop your file again.'}
        </div>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #upload-consent-overlay {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(20,16,10,.45);
        display: flex; align-items: center; justify-content: center;
      }
      #upload-consent-card {
        max-width: 440px; margin: 16px; padding: 18px 20px;
        background: #ede9df; color: #2e2418;
        border: 2px solid #5a5040; border-radius: 8px;
        box-shadow: 4px 4px 0 rgba(90,80,64,.55);
        font-family: 'Inter', system-ui, sans-serif;
      }
      #upload-consent-card a { color: #2563eb; }
      #upload-consent-card button {
        padding: 7px 14px; border-radius: 5px; cursor: pointer;
        font-size: 13px; border: 1.5px solid #5a5040;
      }
      #uc-cancel { background: transparent; }
      #uc-accept { background: #3dbdad; color: #fff; border-color: #2a8a7e; font-weight: 600; }
    `;
    overlay.appendChild(style);
    document.body.appendChild(overlay);
    document.getElementById('uc-accept').onclick = () => {
      grantConsent();
      overlay.remove();
      // Replay the interrupted pick. hasConsent() is now true, so the
      // interceptor passes this one straight through to the app's handler.
      const input = pendingInput;
      pendingInput = null;
      if (input && input.isConnected && input.files?.length) {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    document.getElementById('uc-cancel').onclick = () => {
      // Declining should not leave a file sitting in the input as though it
      // were accepted — clear it here, where the choice is actually made.
      if (pendingInput && pendingInput.value !== undefined) {
        try { pendingInput.value = ''; } catch (_) {}
      }
      pendingInput = null;
      overlay.remove();
    };
  }

  function interceptor(e) {
    if (hasConsent()) return;
    if (!eventHasImages(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // Keep the selection so accepting can replay it; only a drop is unreplayable.
    const replayable = e.type === 'change' && e.target?.type === 'file';
    pendingInput = replayable ? e.target : null;
    showNotice(replayable);
  }

  // Capture phase — runs before any surface-specific handler.
  document.addEventListener('change', interceptor, true);
  document.addEventListener('drop', interceptor, true);
})();
