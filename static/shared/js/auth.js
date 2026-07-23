/**
 * Synthograsizer service auth — Google sign-in, account pill, gate handling.
 *
 * Included on pages that talk to /api. Self-configuring:
 *   - Local installs (no service block on /api/health): renders nothing.
 *   - Service mode, signed out: renders the official GIS button.
 *   - Signed in: account pill (avatar · name · ⚡credits) + sign-out menu,
 *     first-login Terms/18+ interstitial, and a fetch patch that maps
 *     401 → sign-in prompt, 403 terms_required → interstitial, 402 → credits
 *     toast, and live-updates the badge from X-Credits-Balance headers.
 *
 * Mount point: #synth-account-slot when the page provides one (landing nav,
 * app bar); otherwise a floating chip is created top-right. No build step.
 */
(function () {
  'use strict';
  if (window.SynthAuth) return; // idempotent across double-includes

  const state = { me: null, service: null, booted: false };
  let slot = null;

  /* ── styles ──────────────────────────────────────────────────────────── */
  const css = `
  .sy-auth-slot{display:flex;align-items:center;gap:8px}
  .sy-auth-float{position:fixed;top:10px;right:12px;z-index:99990}
  .sy-pill{display:flex;align-items:center;gap:8px;padding:4px 10px 4px 4px;border-radius:999px;
    background:var(--suite-bg-raised,#1f1f30);border:1px solid var(--suite-border,#33334d);
    color:var(--suite-text,#e8e8f0);font:500 12px/1.2 Inter,system-ui,sans-serif;cursor:pointer}
  .sy-pill img{width:22px;height:22px;border-radius:50%}
  .sy-pill .sy-credits{color:var(--suite-teal,#3dbdad);font-weight:700;white-space:nowrap}
  .sy-menu{position:absolute;top:calc(100% + 6px);right:0;min-width:210px;padding:10px;border-radius:10px;
    background:var(--suite-bg-raised,#1f1f30);border:1px solid var(--suite-border,#33334d);
    color:var(--suite-text,#e8e8f0);font:400 12px/1.5 Inter,system-ui,sans-serif;
    box-shadow:0 8px 28px rgba(0,0,0,.45);z-index:99991}
  .sy-menu .sy-email{opacity:.7;word-break:break-all}
  .sy-menu button{margin-top:8px;width:100%;padding:6px 10px;border-radius:8px;border:1px solid var(--suite-border,#33334d);
    background:transparent;color:inherit;cursor:pointer;font:inherit}
  .sy-menu button:hover{border-color:var(--suite-teal,#3dbdad)}
  .sy-anchor{position:relative}
  .sy-overlay{position:fixed;inset:0;background:rgba(8,8,14,.78);backdrop-filter:blur(4px);
    z-index:99995;display:flex;align-items:center;justify-content:center;padding:20px}
  .sy-modal{max-width:420px;width:100%;padding:22px;border-radius:14px;
    background:var(--suite-bg-raised,#17172a);border:1px solid var(--suite-border,#33334d);
    color:var(--suite-text,#e8e8f0);font:400 13px/1.55 Inter,system-ui,sans-serif}
  .sy-modal h3{margin:0 0 8px;font:700 16px/1.3 "Space Grotesk",Inter,sans-serif}
  .sy-modal label{display:flex;gap:8px;align-items:flex-start;margin:10px 0;cursor:pointer}
  .sy-modal a{color:var(--suite-teal,#3dbdad)}
  .sy-modal .sy-continue{margin-top:14px;width:100%;padding:9px;border-radius:9px;border:0;cursor:pointer;
    background:var(--suite-teal,#3dbdad);color:#08131a;font:700 13px Inter,sans-serif}
  .sy-modal .sy-continue:disabled{opacity:.4;cursor:default}
  .sy-toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:99996;
    background:var(--suite-bg-raised,#1f1f30);border:1px solid var(--suite-border,#33334d);
    color:var(--suite-text,#e8e8f0);padding:10px 16px;border-radius:10px;
    font:500 12.5px Inter,system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.45)}
  .sy-gallery-modal{max-width:640px;max-height:80vh;display:flex;flex-direction:column}
  .sy-gallery-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
  .sy-gallery-head h3{margin:0}
  .sy-gallery-close{background:none;border:0;color:inherit;font-size:20px;line-height:1;cursor:pointer;padding:2px 6px}
  .sy-gallery-quota{opacity:.7;font-size:12px;margin-bottom:10px}
  .sy-gallery-grid{overflow-y:auto;display:flex;flex-direction:column;gap:8px}
  .sy-gallery-empty{opacity:.7;padding:20px 4px;text-align:center}
  .sy-gallery-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;
    background:rgba(255,255,255,.03);border:1px solid var(--suite-border,#33334d)}
  .sy-gallery-icon{font-size:18px;width:40px;text-align:center;flex:none}
  .sy-gallery-thumb{width:40px;height:40px;flex:none;border-radius:6px;object-fit:cover;
    background:rgba(255,255,255,.05);display:block}
  .sy-gallery-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sy-gallery-meta{opacity:.6;font-size:11px;white-space:nowrap}
  .sy-gallery-item button{width:auto;margin:0;padding:5px 10px;font-size:11.5px}
  .sy-gallery-more{margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--suite-border,#33334d);
    background:transparent;color:inherit;cursor:pointer;font:inherit}`;

  function injectStyles() {
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function ensureSlot() {
    if (slot) return slot;
    slot = document.getElementById('synth-account-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'synth-account-slot';
      slot.className = 'sy-auth-float';
      document.body.appendChild(slot);
    }
    slot.classList.add('sy-auth-slot');
    return slot;
  }

  function toast(msg, ms) {
    const el = document.createElement('div');
    el.className = 'sy-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms || 4200);
  }

  function announce() {
    state.booted = true;
    window.dispatchEvent(new CustomEvent('synth:auth-ready', { detail: state.me }));
  }

  /* ── signed-in pill ──────────────────────────────────────────────────── */
  function renderPill() {
    const me = state.me;
    const s = ensureSlot();
    s.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'sy-anchor';
    const pill = document.createElement('button');
    pill.className = 'sy-pill';
    pill.type = 'button';
    const credits = me.credits.unlimited ? '∞' : String(me.credits.balance);
    pill.innerHTML =
      (me.user.avatar_url ? `<img src="${me.user.avatar_url}" alt="" referrerpolicy="no-referrer">` : '👤') +
      `<span>${(me.user.name || me.user.email).split(' ')[0]}</span>` +
      `<span class="sy-credits" id="sy-credits">⚡${credits}</span>`;
    const menu = document.createElement('div');
    menu.className = 'sy-menu';
    menu.hidden = true;
    menu.innerHTML =
      `<div class="sy-email">${me.user.email}</div>` +
      `<div>Tier: <b>${me.user.tier}</b>${me.credits.unlimited ? '' :
        ` · resets ${me.credits.resets}`}</div>` +
      (me.features.storage ? `<button type="button" id="sy-gallery">My creations</button>` : '') +
      `<button type="button" id="sy-export">Download my data</button>` +
      `<button type="button" id="sy-delete">Delete my account…</button>` +
      `<button type="button" id="sy-signout">Sign out</button>`;
    pill.addEventListener('click', () => { menu.hidden = !menu.hidden; });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) menu.hidden = true; });
    menu.addEventListener('click', async (e) => {
      if (e.target.id === 'sy-signout') {
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
        location.reload();
      } else if (e.target.id === 'sy-gallery') {
        menu.hidden = true;
        showGalleryModal();
      } else if (e.target.id === 'sy-export') {
        window.location.href = '/api/me/export';
      } else if (e.target.id === 'sy-delete') {
        const sure = window.confirm(
          'Delete your Synthograsizer account?\n\n' +
          'Your account, sessions, and credit ledger are removed immediately. ' +
          'Templates and outputs saved in this browser stay on this device. ' +
          'This cannot be undone.');
        if (!sure) return;
        const r = await fetch('/api/me', { method: 'DELETE' }).catch(() => null);
        if (r && r.ok) { toast('Account deleted. Take care out there.'); setTimeout(() => location.reload(), 1400); }
        else toast('Deletion failed — please try again.');
      }
    });
    wrap.appendChild(pill);
    wrap.appendChild(menu);
    s.appendChild(wrap);
  }

  function updateCreditsBadge(value) {
    const el = document.getElementById('sy-credits');
    if (el && state.me && !state.me.credits.unlimited) {
      state.me.credits.balance = Number(value);
      el.textContent = '⚡' + value;
    }
  }

  /* ── signed-out: GIS button ──────────────────────────────────────────── */
  function renderSignIn() {
    const s = ensureSlot();
    s.innerHTML = '';
    const holder = document.createElement('div');
    s.appendChild(holder);
    const gsi = document.createElement('script');
    gsi.src = 'https://accounts.google.com/gsi/client';
    gsi.async = true;
    gsi.onload = () => {
      window.google.accounts.id.initialize({
        client_id: state.service.gis_client_id,
        callback: async (resp) => {
          const r = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: resp.credential }),
          });
          if (r.ok) { location.reload(); }
          else {
            const err = await r.json().catch(() => ({}));
            toast(err.detail || 'Sign-in failed — please try again.');
          }
        },
      });
      window.google.accounts.id.renderButton(holder, {
        theme: 'filled_black', size: 'medium', shape: 'pill', text: 'signin_with',
      });
    };
    document.head.appendChild(gsi);
  }

  /* ── first-login interstitial (Terms + 18+) ──────────────────────────── */
  function showInterstitial() {
    if (document.getElementById('sy-terms-overlay')) return;
    const ov = document.createElement('div');
    ov.className = 'sy-overlay';
    ov.id = 'sy-terms-overlay';
    ov.innerHTML = `
      <div class="sy-modal" role="dialog" aria-modal="true" aria-label="Terms of use">
        <h3>Before you create</h3>
        <p>Generation runs on our shared model account, so two quick things:</p>
        <label><input type="checkbox" id="sy-age"> I am 18 years of age or older.</label>
        <label><input type="checkbox" id="sy-tos"> I accept the
          <a href="/terms/" target="_blank" rel="noopener">Terms &amp; Privacy Policy</a>
          (${state.me.terms_version}).</label>
        <button class="sy-continue" id="sy-terms-go" disabled>Continue</button>
      </div>`;
    document.body.appendChild(ov);
    const age = ov.querySelector('#sy-age');
    const tos = ov.querySelector('#sy-tos');
    const go = ov.querySelector('#sy-terms-go');
    const sync = () => { go.disabled = !(age.checked && tos.checked); };
    age.addEventListener('change', sync);
    tos.addEventListener('change', sync);
    go.addEventListener('click', async () => {
      const r = await fetch('/api/me/accept-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms_version: state.me.terms_version, age_over_18: true }),
      });
      if (r.ok) { state.me = await r.json(); ov.remove(); announce(); }
      else toast('Could not record acceptance — please retry.');
    });
  }

  /* ── "My creations" gallery ────────────────────────────────────────────
   * Rows carry a kind icon by default; image rows that saved a thumbnail
   * (schema v3) lazy-load a ~256px preview from the proxy endpoint via
   * IntersectionObserver, so the list itself stays one request and only
   * visible thumbs fetch bytes. Full media opens via a signed URL on demand
   * (View); templates load straight into the app (Load template). */
  const KIND_ICON = { image: '🖼️', video: '🎬', music: '🎵', template: '🧩' };
  // Display fallback when an item has no label. Most built-in templates carry no
  // name, so unlabelled saves are common — "Image" reads better than a raw
  // lowercase kind, and the thumbnail carries the actual identification.
  const KIND_NAME = { image: 'Image', video: 'Video', music: 'Track', template: 'Template' };

  /* Lazy-load thumbnails for any rows that declared has_thumb. One observer
   * per open gallery (stashed on the overlay), re-run after each "Load more". */
  function observeThumbs(overlay) {
    const grid = overlay.querySelector('#sy-gallery-grid');
    if (!grid) return;
    let obs = overlay._thumbObs;
    if (!obs) {
      obs = new IntersectionObserver((entries, o) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const img = entry.target;
          o.unobserve(img);
          img.onerror = () => {
            // thumb object gone or link raced expiry — fall back to an icon
            const span = document.createElement('span');
            span.className = 'sy-gallery-icon';
            span.textContent = '🖼️';
            img.replaceWith(span);
          };
          img.src = `/api/artifacts/${img.dataset.thumbId}/thumb`;
        });
      }, { root: grid, rootMargin: '150px' });
      overlay._thumbObs = obs;
    }
    grid.querySelectorAll('img.sy-gallery-thumb:not([data-observed])').forEach((img) => {
      img.setAttribute('data-observed', '1');
      obs.observe(img);
    });
  }

  function formatBytes(n) {
    const mb = n / (1024 * 1024);
    return (mb >= 1 ? mb.toFixed(1) : mb.toFixed(2)) + ' MB';
  }

  async function refreshGalleryQuota(overlay) {
    const r = await fetch('/api/me/artifacts').catch(() => null);
    if (!r || !r.ok) return;
    const data = await r.json();
    const q = overlay.querySelector('#sy-gallery-quota');
    if (q) q.textContent = `${data.storage_used_mb} MB of ${data.storage_limit_mb} MB used`;
  }

  async function loadGalleryPage(overlay, beforeId) {
    const grid = overlay.querySelector('#sy-gallery-grid');
    const url = '/api/me/artifacts' + (beforeId ? `?before_id=${beforeId}` : '');
    const r = await fetch(url).catch(() => null);
    if (!r || !r.ok) {
      if (!beforeId) grid.innerHTML = '<div class="sy-gallery-empty">Couldn’t load your creations.</div>';
      return;
    }
    const data = await r.json();
    const q = overlay.querySelector('#sy-gallery-quota');
    if (q) q.textContent = `${data.storage_used_mb} MB of ${data.storage_limit_mb} MB used`;
    if (!beforeId) grid.innerHTML = '';
    if (data.items.length === 0 && !beforeId) {
      grid.innerHTML = '<div class="sy-gallery-empty">Nothing saved yet — look for a Save button under a ' +
        'generated image, video, track, or template.</div>';
      return;
    }
    const moreBtn = grid.querySelector('.sy-gallery-more');
    if (moreBtn) moreBtn.remove();
    data.items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'sy-gallery-item';
      row.dataset.id = item.id;
      row.dataset.kind = item.kind;
      const when = new Date(item.created_at).toLocaleDateString();
      // Image rows with a saved preview lazy-load it; everything else shows its icon.
      const lead = item.has_thumb
        ? `<img class="sy-gallery-thumb" alt="" data-thumb-id="${item.id}">`
        : `<span class="sy-gallery-icon">${KIND_ICON[item.kind] || '📄'}</span>`;
      // Templates load into the app; media opens via a signed URL.
      const primary = item.kind === 'template'
        ? `<button type="button" class="sy-gallery-load">Load template</button>`
        : `<button type="button" class="sy-gallery-view">View</button>`;
      row.innerHTML =
        lead +
        `<span class="sy-gallery-label">${item.label ? String(item.label).replace(/</g, '&lt;') : (KIND_NAME[item.kind] || item.kind)}</span>` +
        `<span class="sy-gallery-meta">${formatBytes(item.bytes)} · ${when}</span>` +
        primary +
        `<button type="button" class="sy-gallery-del">Delete</button>`;
      grid.appendChild(row);
    });
    observeThumbs(overlay);
    if (data.next_before_id) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'sy-gallery-more';
      more.textContent = 'Load more';
      more.addEventListener('click', () => loadGalleryPage(overlay, data.next_before_id));
      grid.appendChild(more);
    }
  }

  function showGalleryModal() {
    if (document.getElementById('sy-gallery-overlay')) return;
    const ov = document.createElement('div');
    ov.className = 'sy-overlay';
    ov.id = 'sy-gallery-overlay';
    ov.innerHTML =
      `<div class="sy-modal sy-gallery-modal" role="dialog" aria-modal="true" aria-label="My creations">` +
        `<div class="sy-gallery-head"><h3>My creations</h3>` +
        `<button type="button" class="sy-gallery-close" aria-label="Close">×</button></div>` +
        `<div class="sy-gallery-quota" id="sy-gallery-quota">Loading…</div>` +
        `<div class="sy-gallery-grid" id="sy-gallery-grid">` +
          `<div class="sy-gallery-empty">Loading…</div></div>` +
      `</div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    ov.querySelector('.sy-gallery-close').addEventListener('click', () => ov.remove());

    // Event delegation: one listener survives across "load more" pages,
    // rather than rebinding (and stacking) a handler on every page load.
    ov.querySelector('#sy-gallery-grid').addEventListener('click', async (e) => {
      const row = e.target.closest('.sy-gallery-item');
      if (!row) return;
      const id = row.dataset.id;
      if (e.target.classList.contains('sy-gallery-view')) {
        const btn = e.target;
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = '…';
        const r = await fetch(`/api/artifacts/${id}/url`).catch(() => null);
        if (r && r.ok) {
          const { url } = await r.json();
          window.open(url, '_blank', 'noopener');
        } else {
          toast('Could not open that item — the link may have expired.');
        }
        btn.disabled = false;
        btn.textContent = original;
      } else if (e.target.classList.contains('sy-gallery-load')) {
        // Load a saved template straight into the running Synthograsizer app.
        // Content comes through the same-origin proxy (no bucket CORS needed).
        const btn = e.target;
        const app = window.synthSmall;
        if (!app || typeof app.loadTemplate !== 'function') {
          toast('Open the Synthograsizer app to load templates.');
          return;
        }
        // Loading REPLACES whatever is in the app right now, and there's no undo
        // — confirm rather than silently discarding unsaved variable tweaks.
        const name = row.querySelector('.sy-gallery-label')?.textContent || 'this template';
        const current = app.currentTemplate && app.currentTemplate.name;
        if (!window.confirm(
              `Load “${name}”?\n\nThis replaces the template currently loaded` +
              (current ? ` (“${current}”)` : '') + ' — any unsaved changes to it are lost.')) {
          return;
        }
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = '…';
        try {
          const r = await fetch(`/api/artifacts/${id}/content`);
          if (!r.ok) throw new Error('fetch');
          const tpl = await r.json();
          app.loadTemplate(tpl);
          toast(`Loaded “${name}”.`);
          ov.remove();
        } catch (_) {
          toast('Could not load that template.');
        }
        btn.disabled = false;
        btn.textContent = original;
      } else if (e.target.classList.contains('sy-gallery-del')) {
        if (!window.confirm('Delete this creation? This cannot be undone.')) return;
        const r = await fetch(`/api/artifacts/${id}`, { method: 'DELETE' }).catch(() => null);
        if (r && r.ok) {
          row.remove();
          refreshGalleryQuota(ov);
        } else {
          toast('Delete failed — please try again.');
        }
      }
    });

    loadGalleryPage(ov);
  }

  /* ── global fetch patch (demo-mode.js precedent) ─────────────────────── */
  function patchFetch() {
    const orig = window.fetch;
    window.fetch = async function (input, init) {
      const resp = await orig.call(this, input, init);
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (!url.startsWith('/api/') && !url.includes(location.host + '/api/')) return resp;
        const bal = resp.headers.get('X-Credits-Balance');
        if (bal !== null) updateCreditsBadge(bal);
        if (resp.status === 401 && !url.includes('/api/me') && !url.includes('/api/auth/')) {
          toast('Sign in with Google (top right) to generate on this instance.');
        } else if (resp.status === 402) {
          const data = await resp.clone().json().catch(() => ({}));
          toast(`Out of credits — your monthly allowance resets ${
            (state.me && state.me.credits.resets) || 'on the 1st'}.`);
          if (typeof data.balance === 'number') updateCreditsBadge(data.balance);
        } else if (resp.status === 403) {
          const data = await resp.clone().json().catch(() => ({}));
          if (data && data.error === 'terms_required') showInterstitial();
        }
      } catch (_) { /* interception must never break the caller */ }
      return resp;
    };
  }

  /* ── boot ────────────────────────────────────────────────────────────── */
  async function boot() {
    injectStyles();
    let r;
    try { r = await fetch('/api/me'); } catch (_) { announce(); return; }
    if (r.ok) {
      state.me = await r.json();
      patchFetch();
      renderPill();
      if (state.me.needs_terms) showInterstitial();
      announce();
      return;
    }
    if (r.status === 401) {
      try {
        const h = await (await fetch('/api/health')).json();
        if (h.service && h.service.auth_required) {
          state.service = h.service;
          patchFetch();
          renderSignIn();
        }
      } catch (_) { /* backend down — nothing to render */ }
    }
    announce(); // 404 = local install: stay invisible
  }

  window.SynthAuth = {
    get me() { return state.me; },
    get active() { return !!(state.me || state.service); },
    refresh: boot,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
