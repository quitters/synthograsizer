/**
 * Tier gate — hides paid-tier surfaces (Video/Music studios, Videorama) for
 * free-tier users in service mode. UX only: the server enforces everything.
 *
 * Follows demo-mode.js's technique (hide modals + [data-open-modal] buttons,
 * patch studioIntegrationInstance.openModal) but keys off the server-computed
 * `features` from auth.js's `synth:auth-ready` event instead of a URL flag.
 * Local installs and admins: this file does nothing.
 */
(function () {
  'use strict';

  var GATE_BY_FEATURE = {
    video: { modal: 'video-studio-modal', ids: ['open-video-studio', 'video-studio-button'] },
    music: { modal: 'music-studio-modal', ids: ['open-music-studio', 'music-studio-button'] },
  };

  var gatedModals = [];

  function hideGated(features) {
    Object.keys(GATE_BY_FEATURE).forEach(function (feat) {
      if (features[feat]) return; // allowed → leave alone
      var gate = GATE_BY_FEATURE[feat];
      gatedModals.push(gate.modal);
      var m = document.getElementById(gate.modal);
      if (m) { m.classList.remove('active'); m.style.display = 'none'; }
      document.querySelectorAll('[data-open-modal]').forEach(function (btn) {
        if (btn.dataset.openModal === gate.modal) btn.style.display = 'none';
      });
      gate.ids.forEach(function (id) {
        var b = document.getElementById(id);
        if (b) b.style.display = 'none';
      });
    });
    if (!features.videorama) {
      document.querySelectorAll('a[href*="/videorama"]').forEach(function (a) {
        a.style.display = 'none';
      });
    }
  }

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
    if (!me || !me.features) return; // signed out or local install → no gating here
    if (me.features.video && me.features.music && me.features.videorama) return;
    var apply = function () { hideGated(me.features); };
    apply();
    // Studios render lazily — sweep again as the app finishes booting.
    setTimeout(apply, 1000);
    setTimeout(apply, 3000);
    patchOpenModal();
  });
})();
