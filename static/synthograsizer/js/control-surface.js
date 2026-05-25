/* ──────────────────────────────────────────────────────────────────────
 * AVProfileStore — schema + persistence for the AV control surface
 *
 * One profile = a set of per-variable overrides keyed by template name +
 * variable name, plus layout order, banks, OSC config. Multiple profiles
 * live in one localStorage entry; one is "active" at any time.
 *
 * Override shape (per variable):
 *   {
 *     label?: string,           // display name override
 *     color?: string,           // hex
 *     group?: string,           // group header name
 *     order?: number,           // sort key for layout
 *     hidden?: boolean,         // skip from render
 *     osc?: {
 *       source?: 'code'|'ai'|'both',
 *       address?: string,       // OSC path (resolved, no {N}/{M})
 *       range?: [number,number],
 *       curve?: 'linear'|'exp'|'log'|'sCurve',
 *       send?: 'float'|'int'|'trigger'|'string'
 *     }
 *   }
 *
 * Profile shape:
 *   {
 *     name: string,
 *     overrides: { [templateName]: { [varName]: Override } },
 *     oscHost?: string,
 *     oscPort?: number,
 *   }
 * ──────────────────────────────────────────────────────────────────── */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'synthograsizerAVProfileV1';

  const DEFAULT_PROFILE_NAME = 'Default';

  function newProfile(name) {
    return {
      name: name || DEFAULT_PROFILE_NAME,
      overrides: {},
      oscHost: '127.0.0.1',
      oscPort: 7000, // Resolume default
    };
  }

  function defaultState() {
    return {
      activeProfile: DEFAULT_PROFILE_NAME,
      profiles: { [DEFAULT_PROFILE_NAME]: newProfile(DEFAULT_PROFILE_NAME) },
    };
  }

  class AVProfileStore {
    constructor() {
      this.state = defaultState();
      this._listeners = new Set();
      this._currentTemplate = null;
      this._load();
    }

    // ── persistence ────────────────────────────────────────

    _load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data && data.profiles && data.activeProfile) {
          this.state = data;
        }
      } catch (e) {
        console.warn('[AVProfileStore] load failed', e);
      }
    }

    _save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (e) {
        console.warn('[AVProfileStore] save failed', e);
      }
      this._notify();
    }

    // ── profile management ────────────────────────────────

    listProfiles() {
      return Object.keys(this.state.profiles);
    }

    activeProfile() {
      return this.state.profiles[this.state.activeProfile] || this.state.profiles[DEFAULT_PROFILE_NAME];
    }

    setActive(name) {
      if (this.state.profiles[name]) {
        this.state.activeProfile = name;
        this._save();
      }
    }

    createProfile(name) {
      if (this.state.profiles[name]) return false;
      this.state.profiles[name] = newProfile(name);
      this._save();
      return true;
    }

    deleteProfile(name) {
      if (name === DEFAULT_PROFILE_NAME) return false;
      delete this.state.profiles[name];
      if (this.state.activeProfile === name) this.state.activeProfile = DEFAULT_PROFILE_NAME;
      this._save();
      return true;
    }

    exportProfile(name) {
      const p = this.state.profiles[name || this.state.activeProfile];
      return p ? JSON.stringify(p, null, 2) : null;
    }

    importProfile(json) {
      try {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        if (!data?.name || typeof data.overrides !== 'object') throw new Error('Invalid profile');
        let name = data.name;
        let i = 1;
        while (this.state.profiles[name]) name = `${data.name} (${i++})`;
        data.name = name;
        this.state.profiles[name] = data;
        this.state.activeProfile = name;
        this._save();
        return name;
      } catch (e) {
        console.warn('[AVProfileStore] import failed', e);
        return null;
      }
    }

    // ── current template context ───────────────────────────

    setCurrentTemplate(templateName) {
      this._currentTemplate = templateName || null;
      this._notify();
    }

    currentTemplate() {
      return this._currentTemplate;
    }

    // ── override accessors ────────────────────────────────

    /** Get the override object for one variable (read-only; may be undefined). */
    getOverride(varName, templateName) {
      const tpl = templateName || this._currentTemplate;
      if (!tpl) return undefined;
      return this.activeProfile().overrides?.[tpl]?.[varName];
    }

    /** Merge per-variable overrides into a variable object for rendering. */
    mergeForRender(variable, templateName) {
      const ov = this.getOverride(variable.name, templateName);
      if (!ov) return variable;
      return {
        ...variable,
        _displayLabel: ov.label ?? variable.feature_name ?? variable.name,
        _color: ov.color,
        _group: ov.group,
        _order: ov.order,
        _hidden: !!ov.hidden,
        osc: { ...(variable.osc || {}), ...(ov.osc || {}) },
      };
    }

    /** Update one or more fields on an override (merges). */
    updateOverride(varName, patch, templateName) {
      const tpl = templateName || this._currentTemplate;
      if (!tpl) return;
      const profile = this.activeProfile();
      profile.overrides[tpl] ||= {};
      const existing = profile.overrides[tpl][varName] || {};
      const merged = { ...existing, ...patch };
      // Deep-merge .osc since it's nested
      if (patch.osc) merged.osc = { ...(existing.osc || {}), ...patch.osc };
      profile.overrides[tpl][varName] = merged;
      this._save();
    }

    clearOverride(varName, templateName) {
      const tpl = templateName || this._currentTemplate;
      if (!tpl) return;
      const profile = this.activeProfile();
      if (profile.overrides[tpl]) {
        delete profile.overrides[tpl][varName];
        this._save();
      }
    }

    /** Reorder variables — sets .order on each override. */
    setLayoutOrder(varNames, templateName) {
      const tpl = templateName || this._currentTemplate;
      if (!tpl) return;
      const profile = this.activeProfile();
      profile.overrides[tpl] ||= {};
      varNames.forEach((name, i) => {
        profile.overrides[tpl][name] = { ...(profile.overrides[tpl][name] || {}), order: i };
      });
      this._save();
    }

    // ── OSC config ────────────────────────────────────────

    setOscTarget(host, port) {
      const profile = this.activeProfile();
      if (host) profile.oscHost = host;
      if (port) profile.oscPort = parseInt(port, 10);
      this._save();
    }

    oscTarget() {
      const p = this.activeProfile();
      return { host: p.oscHost || '127.0.0.1', port: p.oscPort || 7000 };
    }

    // ── listeners ─────────────────────────────────────────

    subscribe(fn) {
      this._listeners.add(fn);
      return () => this._listeners.delete(fn);
    }

    _notify() {
      for (const fn of this._listeners) {
        try { fn(this); } catch (e) { console.warn('[AVProfileStore] listener error', e); }
      }
    }
  }

  // ── Curve helpers ─────────────────────────────────────

  function applyCurve(norm, curve) {
    const x = Math.max(0, Math.min(1, norm));
    switch (curve) {
      case 'exp':    return x * x;
      case 'log':    return Math.sqrt(x);
      case 'sCurve': return x * x * (3 - 2 * x);
      case 'linear':
      default:       return x;
    }
  }

  function normToRange(norm, range, curve) {
    const [lo, hi] = range || [0, 1];
    const c = applyCurve(norm, curve);
    return lo + (hi - lo) * c;
  }

  global.AVProfileStore = AVProfileStore;
  global.AVProfileStoreSingleton = global.AVProfileStoreSingleton || new AVProfileStore();
  global.AVCurves = { applyCurve, normToRange };
})(window);
