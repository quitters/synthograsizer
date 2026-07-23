/**
 * Tier gate — hides surfaces the hosted service can't serve.
 *
 * Two categories:
 *   - Paid/admin tier (Video, Music, Videorama): hidden unless the signed-in
 *     account's server-computed `features` allow them.
 *   - Local-only bridges (Scope: OSC / WebRTC / Spout): hidden for EVERYONE in
 *     service mode, admins included. /api/scope/ and /api/osc/ are in the
 *     middleware's DISABLED_PREFIXES and 403 before the request is attributed
 *     to a user, and they bridge to a renderer on the user's own machine —
 *     meaningless from a server. An admin-visible button could only ever fail.
 *
 * UX only: the server enforces all of this regardless.
 *
 * Hiding is done with CSS keyed off <html> classes rather than by setting
 * style.display on elements. The AI Studio Tools grid and the result-action
 * buttons are rendered (and re-rendered) by studio-integration.js at times this
 * script does not control, so anything imperative here is a race — an earlier
 * version targeted button ids that no longer existed and silently hid nothing
 * for over a month, leaving Video/Music visible-but-dead on the live service.
 * A stylesheet covers every current and future render for free.
 *
 * Local installs (no auth, no service block) are untouched.
 */
(function () {
  'use strict';

  /* Real element ids, verified against studio-integration.js's markup. If a
     button is renamed, this stylesheet is where to update it. */
  var GATE_CSS =
    /* Video studio — admin-only on the hosted tier */
    '.synth-no-video #studio-video-btn,' +
    '.synth-no-video .synth-gated-video { display: none !important; }' +
    /* Music studio (Lyria) — admin-only on the hosted tier */
    '.synth-no-music #studio-music-btn { display: none !important; }' +
    /* Scope — local machine bridge, server-disabled for everyone */
    '.synth-no-scope #scope-bar,' +
    '.synth-no-scope #scope-panel,' +
    '.synth-no-scope #p5-scope-btn,' +
    '.synth-no-scope #scope-video-section,' +
    '.synth-no-scope .synth-gated-scope { display: none !important; }';

  var gatedModals = [];

  function injectGateStyles() {
    if (document.getElementById('synth-tier-gate-styles')) return;
    var s = document.createElement('style');
    s.id = 'synth-tier-gate-styles';
    s.textContent = GATE_CSS;
    document.head.appendChild(s);
  }

  /**
   * Belt to the stylesheet's braces: close any gated modal that is already
   * open, and hide nav links to local-only tools. The buttons themselves are
   * handled by CSS above.
   */
  function hideGated(features) {
    [['video', 'video-studio-modal'], ['music', 'music-studio-modal']].forEach(function (pair) {
      if (features[pair[0]]) return;              // allowed → leave alone
      gatedModals.push(pair[1]);
      var m = document.getElementById(pair[1]);
      if (m) { m.classList.remove('active'); m.style.display = 'none'; }
    });
    if (!features.videorama) {
      document.querySelectorAll('a[href*="/videorama"]').forEach(function (a) {
        a.style.display = 'none';
      });
    }
  }

  /** Last line of defence: a gated modal must not open even if something calls in. */
  function patchOpenModal() {
    if (!gatedModals.length) return;
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var si = window.studioIntegrationInstance;
      if (si && typeof si.openModal === 'function' && !si._tierPatched) {
        var orig = si.openModal.bind(si);
        si.openModal = function (modalId) {
          if (gatedModals.indexOf(modalId) !== -1) {
            console.info('[tier-gate] blocked:', modalId);
            return Promise.resolve();
          }
          return orig(modalId);
        };
        si._tierPatched = true;
      }
      if ((si && si._tierPatched) || tries > 40) clearInterval(iv);
    }, 250);
  }

  window.addEventListener('synth:auth-ready', function (e) {
    var me = e.detail;

    // Signed-out visitors on the hosted service fire this event with a null
    // detail, so keying off `me` alone skipped them entirely — they saw every
    // paid and local-only surface. SynthAuth.active is true whenever a service
    // block was resolved, signed in or not, and false on a local install.
    var hosted = !!(window.SynthAuth && window.SynthAuth.active);
    if (!hosted) return;

    injectGateStyles();
    var root = document.documentElement;
    root.classList.add('synth-no-scope');

    // An anonymous visitor has no features block. They cannot use the paid
    // surfaces either (every call 401s), so gate them like a free account
    // rather than showing buttons that can only fail.
    var features = (me && me.features) || {};

    if (!features.video) root.classList.add('synth-no-video');
    if (!features.music) root.classList.add('synth-no-music');

    if (features.video && features.music && features.videorama) return;
    hideGated(features);
    patchOpenModal();
  });
})();
