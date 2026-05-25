/**
 * Agent Profiles — Bespoke Template System for Agent Studio + Composer.
 *
 * Treats agent bios as variable-driven templates using the same {{placeholder}}
 * + weighted-value-array machinery the Synthograsizer uses for image prompts.
 *
 * Storage: IndexedDB (primary) with localStorage as a synchronous fallback cache.
 * Auto-migrates existing localStorage data to IndexedDB on first load.
 * Schema migration runs on every loadAll so older entries (string-array values,
 * missing valueIdx, no icon/color, etc.) are normalised to the canonical v5 shape.
 */

import { normalizeVariable } from './template-normalizer.js';

// ─── Canonical v5 schema ────────────────────────────────────────────────────
//
// {
//   id:          'profile_xxxx'
//   name:        'Display name (also serves as agent_name in chatroom)'
//   icon:        '🤖'                     // emoji, used as avatar
//   color:       '#7a6e5e'                // tint for cards / channel LEDs
//   category:    'imagegen' | 'discussion' | 'roleplay' | 'utility' | 'custom' | …
//   description: 'One-liner shown on cards.'
//   bioTemplate: 'You are {{agent_name}}, a {{role}}.'
//   variables:   [
//     {
//       name:         'role'              // identifier used in {{role}}
//       feature_name: 'Role'              // display label for the knob
//       valueIdx:     0                   // currently-selected value index
//       values:       [{text:'foo', weight: 3}, {text:'bar', weight: 1}]
//     }, …
//   ]
//   anchors:    { agent_name: 'X', signature_action: '…', … }   // fixed substitutions
//   tags:       [ { type: 'creator'|'builtin'|'remix'|'source', label: 'Built-in' } ]
//   createdAt / updatedAt: ISO strings
// }

const DEFAULT_COLORS = {
  imagegen:   '#b86880',
  discussion: '#5a8ab8',
  roleplay:   '#8868a8',
  utility:    '#7a6e5e',
  custom:     '#5a9870',
};

// First emoji-like sequence at the start of a string. Used to lift the leading
// emoji out of a name like "🎭 Chaos Muse" into the icon field.
const LEADING_EMOJI_RE = /^([\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]+)\s*/u;

function shortDescription(text, max = 120) {
  if (!text) return '';
  const stripped = String(text).replace(/\s+/g, ' ').trim();
  const firstSentence = stripped.split(/(?<=[.!?])\s/)[0] || stripped;
  return firstSentence.length > max ? firstSentence.slice(0, max - 1).trimEnd() + '…' : firstSentence;
}

// ─── Schema migration ────────────────────────────────────────────────────────

/**
 * Normalise a single profile to canonical v5 shape. Idempotent.
 * Returns { profile, changed } so callers can decide whether to write back.
 */
export function migrateProfileSchema(raw) {
  if (!raw || typeof raw !== 'object') {
    return { profile: raw, changed: false };
  }
  let changed = false;
  const p = { ...raw };

  if (!p.id) { p.id = 'profile_' + Math.random().toString(36).substring(2, 9); changed = true; }
  if (typeof p.name !== 'string' || !p.name) { p.name = 'Untitled Agent'; changed = true; }

  // Lift leading emoji from name → icon when icon is missing
  if (!p.icon) {
    const m = LEADING_EMOJI_RE.exec(p.name);
    if (m) {
      p.icon = m[1];
      const stripped = p.name.replace(LEADING_EMOJI_RE, '').trim();
      if (stripped) p.name = stripped;
    } else {
      p.icon = '🤖';
    }
    changed = true;
  }

  if (!p.category) { p.category = 'utility'; changed = true; }
  if (!p.color)    { p.color = DEFAULT_COLORS[p.category] || DEFAULT_COLORS.utility; changed = true; }

  // bioTemplate: prefer the modern field; fall back to a legacy `bio` string
  if (typeof p.bioTemplate !== 'string') {
    p.bioTemplate = (typeof p.bio === 'string' ? p.bio : '');
    changed = true;
  }

  // description: derive from bio if the user never wrote one
  if (typeof p.description !== 'string' || !p.description) {
    p.description = shortDescription(p.bioTemplate);
    if (p.description) changed = true;
  }

  // variables: normalise to [{name, feature_name, valueIdx, values:[{text, weight}]}]
  if (!Array.isArray(p.variables)) { p.variables = []; changed = true; }
  p.variables = p.variables.map(v => {
    if (!v || typeof v !== 'object') {
      changed = true;
      return { name: 'var', feature_name: 'Var', valueIdx: 0, values: [] };
    }
    let next = { ...v };
    if (typeof next.name !== 'string' || !next.name) { next.name = 'var'; changed = true; }
    if (typeof next.feature_name !== 'string' || !next.feature_name) {
      next.feature_name = next.name.charAt(0).toUpperCase() + next.name.slice(1);
      changed = true;
    }
    if (typeof next.valueIdx !== 'number') { next.valueIdx = 0; changed = true; }

    const rawValues = Array.isArray(next.values) ? next.values : [];
    const normalisedValues = rawValues.map(val => {
      if (typeof val === 'string') { changed = true; return { text: val, weight: 1 }; }
      if (val && typeof val === 'object') {
        if (typeof val.text !== 'string') { changed = true; return { text: String(val.text || ''), weight: typeof val.weight === 'number' ? val.weight : 1 }; }
        if (typeof val.weight !== 'number') { changed = true; return { text: val.text, weight: 1 }; }
        return val;
      }
      changed = true;
      return { text: String(val), weight: 1 };
    });
    next.values = normalisedValues;

    // Clamp valueIdx into range
    if (next.values.length > 0 && (next.valueIdx < 0 || next.valueIdx >= next.values.length)) {
      next.valueIdx = 0;
      changed = true;
    }
    return next;
  });

  // anchors: ensure agent_name is bound to display name unless explicitly overridden
  if (!p.anchors || typeof p.anchors !== 'object') { p.anchors = {}; changed = true; }
  if (!p.anchors.agent_name) { p.anchors = { agent_name: p.name, ...p.anchors }; changed = true; }

  // tags: default to creator-You unless we can infer builtin
  if (!Array.isArray(p.tags) || p.tags.length === 0) {
    p.tags = [{ type: 'creator', label: 'You' }];
    changed = true;
  }

  if (!p.createdAt) { p.createdAt = new Date().toISOString(); changed = true; }
  if (!p.updatedAt) { p.updatedAt = p.createdAt; changed = true; }

  return { profile: p, changed };
}

/**
 * Resolves an agent profile template into a flat bio string.
 * Anchors first, then variables (using session overrides → UI knob lock → weighted random).
 * Anti-repetition: when using weighted random, avoids picking the same value
 * that was chosen on the previous call for this profile (up to 3 re-rolls).
 */
const _lastPickMemory = {}; // profileId → { varName → lastChosenText }

export function resolveProfileBio(profile, sessionConfig = {}, uiVariableStates = {}) {
  if (!profile || !profile.bioTemplate) return profile?.bio || '';

  let bio = profile.bioTemplate;
  const memKey = profile.id || '__anon__';
  if (!_lastPickMemory[memKey]) _lastPickMemory[memKey] = {};
  const memory = _lastPickMemory[memKey];

  // Pull the active taste-profile context if available. Provides synthetic
  // anchors (taste_profile_name, taste_tagline, taste_palette_*) and synthetic
  // variables (taste_tendency, taste_narrative, taste_subject). The profile's
  // own anchors/variables override these — taste-profile vocab is a *fallback*
  // pool, not a forced override.
  const tasteCtx = (typeof window !== 'undefined' && window.TasteProfileStore?.asBioContext)
    ? window.TasteProfileStore.asBioContext()
    : null;

  // 1. Anchor substitution (taste-profile anchors first, then session-wide,
  // profile-level anchors win on top — most specific wins).
  const anchors = {
    ...(tasteCtx?.anchors || {}),
    ...(sessionConfig.sharedAnchors || {}),
    ...(profile.anchors || {}),
  };
  for (const [key, value] of Object.entries(anchors)) {
    const regex = new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, 'gi');
    bio = bio.replace(regex, value);
  }

  // 2. Variable resolution. Merge taste-profile synthetic variables in as a
  // fallback pool — the profile's own variables shadow them by name so that
  // a deliberately-pinned {{taste_tendency}} on a custom agent still wins.
  const profileVarNames = new Set((profile.variables || []).map(v => v?.name).filter(Boolean));
  const tasteVars = (tasteCtx?.variables || []).filter(v => !profileVarNames.has(v.name));
  const allVars = [...(profile.variables || []), ...tasteVars];

  if (allVars.length) {
    for (const rawVar of allVars) {
      const variable = normalizeVariable(JSON.parse(JSON.stringify(rawVar)));
      const varName = variable.name;
      let chosenValue = '';

      const overrideVal = sessionConfig.agents?.find(a => a.profileId === profile.id)?.overrides?.[varName];

      if (overrideVal) {
        chosenValue = overrideVal;
      } else if (variable.values && variable.values.length > 0) {
        const uiKnob = uiVariableStates[varName];
        let valuesToConsider = variable.values;

        if (uiKnob && typeof uiKnob.index === 'number' && valuesToConsider[uiKnob.index]) {
          chosenValue = valuesToConsider[uiKnob.index].text;
        } else if (typeof rawVar.valueIdx === 'number' && valuesToConsider[rawVar.valueIdx]) {
          // Honour the profile's own valueIdx (set by the editor's knobs)
          chosenValue = valuesToConsider[rawVar.valueIdx].text;
        } else {
          // Weighted random with anti-repetition
          let totalWeight = 0;
          const weightedValues = valuesToConsider.map((v, idx) => {
            const weight = uiKnob?.weights?.[idx] !== undefined ? uiKnob.weights[idx] : (v.weight ?? 1);
            totalWeight += weight;
            return { text: v.text, weight };
          });

          const MAX_REROLLS = 3;
          const prevPick = memory[varName];

          for (let attempt = 0; attempt <= MAX_REROLLS; attempt++) {
            if (totalWeight > 0) {
              let r = Math.random() * totalWeight;
              for (const v of weightedValues) {
                r -= v.weight;
                if (r <= 0) { chosenValue = v.text; break; }
              }
            } else {
              chosenValue = valuesToConsider[Math.floor(Math.random() * valuesToConsider.length)].text;
            }
            // Accept if different from last pick, or if only 1 option, or last attempt
            if (chosenValue !== prevPick || valuesToConsider.length <= 1 || attempt === MAX_REROLLS) break;
          }

          memory[varName] = chosenValue;
        }
      }

      const regex = new RegExp(`{{\\s*${escapeRegExp(varName)}\\s*}}`, 'gi');
      bio = bio.replace(regex, chosenValue);
    }
  }

  // 3. Drop any remaining unresolved placeholders so they don't leak to the LLM
  bio = bio.replace(/{{[^}]+}}/g, '');

  return bio.trim();
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Profile Storage (IndexedDB-backed with sync cache) ─────────────────────

const STORE_KEY = 'as_agent_profiles';
const IDB_NAME  = 'SynthoAgentProfiles';
const IDB_VER   = 1;
const IDB_STORE = 'profiles';

// ── IndexedDB helpers ────────────────────────────────────────────────────────

function _openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function _idbGetAll() {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

async function _idbPut(profile) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(profile);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function _idbDelete(id) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function _idbPutAll(profiles) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    for (const p of profiles) store.put(p);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ── localStorage → IndexedDB one-time migration ─────────────────────────────

async function _migrateLocalStorageToIDB() {
  if (localStorage.getItem('as_idb_migrated')) return;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
        const migrated = arr.map(p => migrateProfileSchema(p).profile);
        await _idbPutAll(migrated);
        console.log(`[AgentProfiles] Migrated ${migrated.length} profiles from localStorage → IndexedDB`);
      }
    }
  } catch (e) {
    console.warn('[AgentProfiles] localStorage→IDB migration failed, will retry', e);
    return; // Don't set the flag so we retry next load
  }
  localStorage.setItem('as_idb_migrated', 'true');
}

// ── Synchronous in-memory cache ──────────────────────────────────────────────
// Many callers (Composer React, Agent Studio) currently call loadAll()
// synchronously. We maintain a cache that is populated on first async load
// and kept in sync on every save/delete. This preserves backward compat.

let _profileCache = null; // null = not yet initialised

function _syncCacheFromLS() {
  // Bootstrap cache from localStorage (fast, synchronous) so the UI has
  // data immediately. The async IDB load will overwrite this shortly after.
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) {
      _profileCache = arr.map(p => migrateProfileSchema(p).profile);
    }
  } catch (_) {}
  if (!_profileCache) _profileCache = [];
}

export const AgentProfileStore = {

  /** True once IndexedDB has been loaded at least once. */
  _idbReady: false,

  /**
   * Synchronous: returns the in-memory cache (bootstrapped from localStorage,
   * then replaced by IndexedDB contents once ready). Safe for existing callers.
   */
  loadAll() {
    if (_profileCache === null) _syncCacheFromLS();
    return [..._profileCache];
  },

  /**
   * Async: loads from IndexedDB, migrates localStorage if needed,
   * and refreshes the sync cache. Callers that can await should prefer this.
   */
  async loadAllAsync() {
    await _migrateLocalStorageToIDB();
    const raw = await _idbGetAll();
    let dirty = false;
    const migrated = raw.map(p => {
      const { profile, changed } = migrateProfileSchema(p);
      if (changed) dirty = true;
      return profile;
    });
    if (dirty) {
      await _idbPutAll(migrated);
    }
    _profileCache = migrated;
    this._idbReady = true;
    return [..._profileCache];
  },

  get(id) {
    return this.loadAll().find(p => p.id === id);
  },

  /**
   * Save works synchronously (updates cache + localStorage for safety)
   * and kicks off an async IndexedDB write in the background.
   */
  save(profile) {
    const { profile: normalised } = migrateProfileSchema(profile || {});
    if (!normalised.id) {
      normalised.id = 'profile_' + Math.random().toString(36).substring(2, 9);
      normalised.createdAt = new Date().toISOString();
    }
    normalised.updatedAt = new Date().toISOString();

    if (_profileCache === null) _syncCacheFromLS();
    const idx = _profileCache.findIndex(p => p.id === normalised.id);
    if (idx >= 0) _profileCache[idx] = normalised;
    else _profileCache.push(normalised);

    // Sync write to localStorage (backward compat safety net)
    try { localStorage.setItem(STORE_KEY, JSON.stringify(_profileCache)); } catch (_) {}
    // Async write to IndexedDB (non-blocking)
    _idbPut(normalised).catch(e => console.warn('[AgentProfiles] IDB save failed', e));

    return normalised;
  },

  delete(id) {
    if (_profileCache === null) _syncCacheFromLS();
    _profileCache = _profileCache.filter(p => p.id !== id);

    try { localStorage.setItem(STORE_KEY, JSON.stringify(_profileCache)); } catch (_) {}
    _idbDelete(id).catch(e => console.warn('[AgentProfiles] IDB delete failed', e));
  },
};

// ─── Migration: legacy AS_AGENT_TEMPLATES → AgentProfileStore ────────────────

/**
 * Convert one legacy preset agent (a plain {name, bio} from AS_AGENT_TEMPLATES)
 * into a v5-shaped profile. Tagged as 'builtin' so the Composer's "Built-in"
 * filter can find it.
 */
export function migrateLegacyAgentToProfile(agentData, category, extraTags = []) {
  const seed = {
    name: agentData.name,
    category: category || 'utility',
    bioTemplate: agentData.bio || '',
    variables: [],
    anchors: { agent_name: agentData.name },
    tags: [{ type: 'builtin', label: 'Built-in' }, ...extraTags],
    isBespokeAgentProfile: true,
  };
  // migrateProfileSchema fills in id, icon, color, description, valueIdx, etc.
  return migrateProfileSchema(seed).profile;
}

/**
 * Auto-migrate every agent in the legacy AS_AGENT_TEMPLATES object into the
 * profile store on first load. Safe to call repeatedly — guarded by a marker.
 */
export function autoMigrateBuiltInPresets(legacyTemplates) {
  const needsInitialMigration = !localStorage.getItem('as_migrated_presets');
  const needsTagMigration = !localStorage.getItem('as_migrated_tags_v2');

  if (!needsInitialMigration && !needsTagMigration) return;

  for (const [key, tpl] of Object.entries(legacyTemplates || {})) {
    for (const agentData of (tpl.agents || [])) {
      const existing = AgentProfileStore.loadAll().find(p => p.name === agentData.name);
      
      const targetTags = [
        { type: 'source', label: `From: ${tpl.name}` },
        ...(agentData.tags || []),
      ];

      if (!existing && needsInitialMigration) {
        const profile = migrateLegacyAgentToProfile(agentData, tpl.category, targetTags);
        AgentProfileStore.save(profile);
      } else if (existing && needsTagMigration && existing.tags.some(t => t.type === 'builtin')) {
        // Only update tags if it's explicitly a built-in profile
        const currentTags = existing.tags || [];
        const mergedTags = [...currentTags];
        for (const targetTag of targetTags) {
          if (!mergedTags.some(t => t.type === targetTag.type && t.label === targetTag.label)) {
            mergedTags.push(targetTag);
          }
        }
        existing.tags = mergedTags;
        AgentProfileStore.save(existing);
      }
    }
  }

  if (needsInitialMigration) localStorage.setItem('as_migrated_presets', 'true');
  if (needsTagMigration) localStorage.setItem('as_migrated_tags_v2', 'true');
  console.log('[AgentProfiles] Auto-migrated built-in presets (v2) to Profile Store.');
}

// ─── Global exposure ────────────────────────────────────────────────────────
// Agent Studio (vanilla JS class) and Composer (React) both reach through window.
window.resolveProfileBio        = resolveProfileBio;
window.AgentProfileStore        = AgentProfileStore;
window.migrateProfileSchema     = migrateProfileSchema;
window.migrateLegacyAgentToProfile = migrateLegacyAgentToProfile;
window.autoMigrateBuiltInPresets   = autoMigrateBuiltInPresets;
