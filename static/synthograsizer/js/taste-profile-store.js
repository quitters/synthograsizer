/**
 * TasteProfileStore — persistent storage for synthesised Taste Profiles.
 *
 * A Taste Profile is the artist's own model — the output of the /taste-profile/
 * onboarding flow. It carries vocabulary (subjects, tendencies, narratives) and
 * coordinates (8 axes, 5-colour palette) that downstream agent bios can pull
 * from via synthetic variables (taste_tendency, taste_narrative, etc.).
 *
 * Profiles are independent from agents. An artist can have multiple personas
 * and switch between them; agent bios re-skin against whichever profile is
 * active because variable resolution looks up the *current* active profile
 * at render time, not at agent-save time.
 *
 * Storage: localStorage (lightweight — a profile is typically <5 KB JSON).
 * Keys:
 *   tasteProfile:index   → { profiles: [{id, name, tagline, updatedAt}, ...], activeId: string|null }
 *   tasteProfile:<id>    → full profile JSON
 *
 * No IDB needed at this scale; if a user accrues dozens of profiles we can
 * migrate later without changing the public API.
 */

const INDEX_KEY = 'tasteProfile:index';
const PROFILE_KEY_PREFIX = 'tasteProfile:';

function nowIso() { return new Date().toISOString(); }

function genId() {
  return 'tp_' + Math.random().toString(36).slice(2, 10);
}

function loadIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return { profiles: [], activeId: null };
    const parsed = JSON.parse(raw);
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      activeId: parsed.activeId || null,
    };
  } catch (_) {
    return { profiles: [], activeId: null };
  }
}

function saveIndex(idx) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch (e) {
    console.warn('[TasteProfileStore] index save failed', e);
  }
}

const _listeners = new Set();
function notify() {
  for (const fn of _listeners) {
    try { fn(); } catch (e) { console.warn('[TasteProfileStore] listener threw', e); }
  }
}

const TasteProfileStore = {
  /**
   * Save a profile and mark it active. Generates an id if the profile
   * doesn't have one. Returns the saved profile with id+timestamps filled in.
   */
  save(profile) {
    if (!profile || typeof profile !== 'object') {
      throw new Error('TasteProfileStore.save: profile must be an object');
    }
    const idx = loadIndex();
    const id = profile.id || genId();
    const enriched = {
      ...profile,
      id,
      createdAt: profile.createdAt || nowIso(),
      updatedAt: nowIso(),
    };
    try {
      localStorage.setItem(PROFILE_KEY_PREFIX + id, JSON.stringify(enriched));
    } catch (e) {
      console.error('[TasteProfileStore] save failed', e);
      throw e;
    }
    // Upsert into index
    const summary = {
      id,
      name: enriched.name || 'Untitled Profile',
      tagline: enriched.tagline || '',
      updatedAt: enriched.updatedAt,
    };
    const existing = idx.profiles.findIndex(p => p.id === id);
    if (existing >= 0) idx.profiles[existing] = summary;
    else idx.profiles.unshift(summary);
    // Auto-activate newly saved profiles unless caller explicitly avoided
    idx.activeId = id;
    saveIndex(idx);
    notify();
    return enriched;
  },

  /**
   * Returns the active profile object, or null if none.
   */
  getActive() {
    const idx = loadIndex();
    if (!idx.activeId) return null;
    try {
      const raw = localStorage.getItem(PROFILE_KEY_PREFIX + idx.activeId);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  },

  /**
   * Set the active profile by id. Pass null to clear active.
   * No-op if the id doesn't exist.
   */
  setActive(id) {
    const idx = loadIndex();
    if (id !== null && !idx.profiles.find(p => p.id === id)) return false;
    idx.activeId = id;
    saveIndex(idx);
    notify();
    return true;
  },

  /**
   * Return [{id, name, tagline, updatedAt}, ...] — lightweight metadata
   * suitable for pickers. Use get(id) to load a full profile.
   */
  list() {
    return loadIndex().profiles.slice();
  },

  /**
   * Return the active id, or null.
   */
  activeId() {
    return loadIndex().activeId;
  },

  /**
   * Load a full profile by id.
   */
  get(id) {
    if (!id) return null;
    try {
      const raw = localStorage.getItem(PROFILE_KEY_PREFIX + id);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  },

  /**
   * Delete a profile. If it was the active one, active becomes null.
   */
  delete(id) {
    if (!id) return false;
    const idx = loadIndex();
    const before = idx.profiles.length;
    idx.profiles = idx.profiles.filter(p => p.id !== id);
    if (idx.activeId === id) idx.activeId = null;
    saveIndex(idx);
    try { localStorage.removeItem(PROFILE_KEY_PREFIX + id); } catch (_) {}
    notify();
    return idx.profiles.length < before;
  },

  /**
   * Subscribe to change events (save / setActive / delete). Returns an
   * unsubscribe function.
   */
  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },

  /**
   * Return the canonical set of synthetic variables and anchors derived from
   * a profile. Used by agent-profiles.js to inject taste-profile vocabulary
   * into the bio resolver.
   *
   * Returns { anchors: {key: scalar}, variables: [{name, values: [{text, weight}]}] }
   * or null if the profile is empty / unusable.
   */
  asBioContext(profile) {
    const p = profile || this.getActive();
    if (!p) return null;
    const anchors = {};
    if (p.name)    anchors.taste_profile_name = p.name;
    if (p.tagline) anchors.taste_tagline      = p.tagline;
    // Palette as comma-separated hex string (so an agent can reference {{taste_palette}})
    if (Array.isArray(p.palette) && p.palette.length) {
      anchors.taste_palette = p.palette.join(', ');
      if (p.palette[0]) anchors.taste_palette_primary   = p.palette[0];
      if (p.palette[1]) anchors.taste_palette_secondary = p.palette[1];
      if (p.palette[2]) anchors.taste_palette_accent    = p.palette[2];
    }
    const variables = [];
    const asValues = (arr) => Array.isArray(arr)
      ? arr.filter(x => x && typeof x === 'string').map(text => ({ text, weight: 1 }))
      : [];
    const tendency = asValues(p.promptingTendencies);
    if (tendency.length) variables.push({ name: 'taste_tendency', values: tendency });
    const narrative = asValues(p.narrativeInclinations);
    if (narrative.length) variables.push({ name: 'taste_narrative', values: narrative });
    // Subjects may be strings or {label, type} objects depending on path
    const subj = Array.isArray(p.subjects)
      ? p.subjects
          .map(s => typeof s === 'string' ? s : (s && s.label) || null)
          .filter(Boolean)
          .map(text => ({ text, weight: 1 }))
      : [];
    if (subj.length) variables.push({ name: 'taste_subject', values: subj });
    // Axis-derived tone: build a short phrase from the lopsided axes
    if (Array.isArray(p.axes) && p.axes.length) {
      const lopsided = p.axes
        .filter(a => typeof a.pos === 'number' && Math.abs(a.pos - 0.5) >= 0.2)
        .map(a => a.pos < 0.5 ? a.left : a.right)
        .filter(Boolean)
        .map(s => s.toLowerCase());
      if (lopsided.length) {
        anchors.taste_axes_summary = lopsided.slice(0, 4).join(', ');
      }
    }
    return { anchors, variables };
  },
};

// Expose globally so non-module scripts (taste-profile/index.html, composer
// command bus) can reach it without import.
if (typeof window !== 'undefined') {
  window.TasteProfileStore = TasteProfileStore;
}

export default TasteProfileStore;
