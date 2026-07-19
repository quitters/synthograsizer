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
    font:500 12.5px Inter,system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.45)}`;

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
      `<button type="button" id="sy-export">Download my data</button>` +
      `<button type="button" id="sy-delete">Delete my account…</button>` +
      `<button type="button" id="sy-signout">Sign out</button>`;
    pill.addEventListener('click', () => { menu.hidden = !menu.hidden; });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) menu.hidden = true; });
    menu.addEventListener('click', async (e) => {
      if (e.target.id === 'sy-signout') {
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
        location.reload();
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
