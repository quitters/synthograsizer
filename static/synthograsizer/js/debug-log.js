/**
 * Silence console.log unless window.SYNTH_DEBUG is set.
 *
 * Loaded as the first script in index.html / demo.html. Leaves console.warn,
 * console.error, and console.info alone so users / bug reports still surface.
 * Toggle at runtime: `SYNTH_DEBUG = true` in DevTools.
 */
(function () {
  if (typeof window === 'undefined' || !window.console) return;
  const realLog = window.console.log.bind(window.console);
  window.console.log = function (...args) {
    if (window.SYNTH_DEBUG) realLog(...args);
  };
  // Convenience: window.synthDebug(true|false) flips the flag
  window.synthDebug = function (on) { window.SYNTH_DEBUG = !!on; };
})();
