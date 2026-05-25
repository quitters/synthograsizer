/* ──────────────────────────────────────────────────────────────────────
 * Resolume OSC preset catalog
 *
 * Catalog of common Resolume Arena/Avenue OSC targets, grouped by
 * category, with friendly names and sensible default ranges/curves.
 *
 * Resolume's OSC paths use 1-based indices for layers/clips/columns.
 * Templates use {N} / {M} placeholders; call expand(template, {N, M})
 * to substitute.
 *
 * Reference: https://resolume.com/support/en/osc
 * ──────────────────────────────────────────────────────────────────── */

(function (global) {
  'use strict';

  const PRESETS = [
    // ── Master / composition-wide ─────────────────────────────
    { category: 'Master',     label: 'Master Opacity',     template: '/composition/master',                                  range: [0, 1],      curve: 'linear', send: 'float' },
    { category: 'Master',     label: 'Master BPM',         template: '/composition/tempocontroller/tempo',                   range: [20, 200],   curve: 'linear', send: 'float' },
    { category: 'Master',     label: 'BPM Tap',            template: '/composition/tempocontroller/tempotap',                range: [0, 1],      curve: 'linear', send: 'trigger' },
    { category: 'Master',     label: 'Crossfader',         template: '/composition/crossfader/phase',                        range: [0, 1],      curve: 'linear', send: 'float' },
    { category: 'Master',     label: 'Composition Speed',  template: '/composition/speed',                                   range: [-16, 16],   curve: 'linear', send: 'float' },
    { category: 'Master',     label: 'Master Audio',       template: '/composition/audio/volume',                            range: [0, 1],      curve: 'linear', send: 'float' },

    // ── Per-layer (1-based index N) ───────────────────────────
    { category: 'Layer',      label: 'Layer {N} Opacity',  template: '/composition/layers/{N}/video/opacity/values',         range: [0, 1],      curve: 'linear', send: 'float' },
    { category: 'Layer',      label: 'Layer {N} Master',   template: '/composition/layers/{N}/master',                       range: [0, 1],      curve: 'linear', send: 'float' },
    { category: 'Layer',      label: 'Layer {N} Bypass',   template: '/composition/layers/{N}/bypassed',                     range: [0, 1],      curve: 'linear', send: 'int'   },
    { category: 'Layer',      label: 'Layer {N} Solo',     template: '/composition/layers/{N}/solo',                         range: [0, 1],      curve: 'linear', send: 'int'   },
    { category: 'Layer',      label: 'Layer {N} Speed',    template: '/composition/layers/{N}/video/speed/values',           range: [-16, 16],   curve: 'linear', send: 'float' },
    { category: 'Layer',      label: 'Layer {N} Hue',      template: '/composition/layers/{N}/video/rgbadjust/hue/values',   range: [0, 1],      curve: 'linear', send: 'float' },
    { category: 'Layer',      label: 'Layer {N} Saturation', template: '/composition/layers/{N}/video/rgbadjust/saturation/values', range: [0, 2],  curve: 'linear', send: 'float' },

    // ── Clip launching ────────────────────────────────────────
    { category: 'Clip',       label: 'Layer {N} Clip {M} Connect', template: '/composition/layers/{N}/clips/{M}/connect',    range: [0, 1],      curve: 'linear', send: 'trigger' },
    { category: 'Clip',       label: 'Layer {N} Clip {M} Select',  template: '/composition/layers/{N}/clips/{M}/select',     range: [0, 1],      curve: 'linear', send: 'trigger' },

    // ── Column launching ──────────────────────────────────────
    { category: 'Column',     label: 'Column {N} Connect', template: '/composition/columns/{N}/connect',                     range: [0, 1],      curve: 'linear', send: 'trigger' },

    // ── Groups ────────────────────────────────────────────────
    { category: 'Group',      label: 'Group {N} Master',   template: '/composition/groups/{N}/master',                       range: [0, 1],      curve: 'linear', send: 'float' },
    { category: 'Group',      label: 'Group {N} Opacity',  template: '/composition/groups/{N}/video/opacity/values',         range: [0, 1],      curve: 'linear', send: 'float' },
  ];

  /**
   * Expand {N}/{M} placeholders in an OSC address template.
   * @param {string} tpl - e.g. "/composition/layers/{N}/video/opacity/values"
   * @param {Object} vars - e.g. { N: 1, M: 2 }
   * @returns {string}
   */
  function expand(tpl, vars) {
    if (!tpl) return '';
    return tpl.replace(/\{(\w+)\}/g, (m, key) => (vars && vars[key] != null) ? String(vars[key]) : m);
  }

  /**
   * Look up a preset by exact label.
   */
  function find(label) {
    return PRESETS.find(p => p.label === label) || null;
  }

  /**
   * Return presets grouped by category for menu rendering.
   */
  function grouped() {
    const out = {};
    for (const p of PRESETS) {
      (out[p.category] ||= []).push(p);
    }
    return out;
  }

  global.ResolumePresets = { PRESETS, expand, find, grouped };
})(window);
