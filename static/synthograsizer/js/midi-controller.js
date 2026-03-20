/**
 * MIDIController — Web MIDI API integration for Synthograsizer
 *
 * Supports:
 *   CC (knobs/faders): absolute 0-127 → proportional value index
 *   Notes (keys):      each note cycles the bound variable up by 1 (loops)
 *
 * Learn mode:
 *   - startLearnCC(varIndex)   — next CC message maps to that variable
 *   - startLearnNote(varIndex) — next Note-On message maps to that variable
 *   - cancelLearn()            — abort pending learn
 *
 * Auto-map:
 *   - startAutoMapCCs()   — next CC captured → map ALL variables sequentially
 *   - startAutoMapNotes() — next Note captured → map ALL variables sequentially
 *   - extendMappings(n)   — detect sequential pattern, extend to n variables
 *
 * Mappings persist in localStorage.
 */

const STORAGE_KEY = 'synthograsizerMidiMappingsV1';

export class MIDIController {
  /**
   * @param {object} app - SynthograsizerSmall instance
   * @param {object} callbacks
   * @param {function} callbacks.onStatusChange  (status: 'connected'|'disconnected'|'unsupported'|'denied', deviceName?: string)
   * @param {function} callbacks.onLearnCapture  (type: 'cc'|'note', varIndex, cc_or_note, channel)
   * @param {function} callbacks.onValueChange   (varIndex, newValueIndex)  — fires on every MIDI-driven value update
   */
  constructor(app, callbacks = {}) {
    this.app = app;
    this.onStatusChange  = callbacks.onStatusChange  || (() => {});
    this.onLearnCapture  = callbacks.onLearnCapture  || (() => {});
    this.onValueChange   = callbacks.onValueChange   || (() => {});
    this.onAutoMapComplete = callbacks.onAutoMapComplete || null;

    /** @type {Map<string, number>} key: "ch-cc" → varIndex */
    this.ccMappings = new Map();
    /** @type {Map<string, number>} key: "ch-note" → varIndex */
    this.noteMappings = new Map();
    /** @type {Map<string, string>} key: "ch-note" → actionName */
    this.actionNoteMappings = new Map();
    /** @type {Map<string, string>} key: "ch-cc" → actionName */
    this.actionCCMappings = new Map();
    /** Called with actionName ('templatePrev'|'templateNext') when an action fires */
    this.onAction = null;

    this._learnMode = null;  // null | { type: 'cc'|'note', varIndex } | { type: 'cc'|'note', action }
    this._autoMapMode = null; // null | 'cc' | 'note'
    this._midiAccess = null;
    this._devices = new Map(); // id → MIDIInput

    this._loadMappings();
  }

  // ─────────────────────────────────────────────
  //  Initialisation
  // ─────────────────────────────────────────────

  async init() {
    if (!navigator.requestMIDIAccess) {
      this.onStatusChange('unsupported');
      return false;
    }

    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      this._midiAccess = access;
      this._setupAccess(access);
      return true;
    } catch (err) {
      console.warn('MIDIController: access denied', err);
      this.onStatusChange('denied');
      return false;
    }
  }

  _setupAccess(access) {
    access.onstatechange = (e) => {
      const port = e.port;
      if (port.type !== 'input') return;

      if (port.state === 'connected') {
        this._addDevice(port);
      } else {
        this._removeDevice(port.id);
      }
    };

    // Connect existing inputs
    access.inputs.forEach(input => this._addDevice(input));
  }

  _addDevice(input) {
    this._devices.set(input.id, input);
    input.onmidimessage = (msg) => this._handleMessage(msg);
    this.onStatusChange('connected', input.name);
  }

  _removeDevice(id) {
    const input = this._devices.get(id);
    if (input) {
      input.onmidimessage = null;
      this._devices.delete(id);
    }
    if (this._devices.size === 0) {
      this.onStatusChange('disconnected');
    }
  }

  get deviceCount() {
    return this._devices.size;
  }

  get deviceNames() {
    return Array.from(this._devices.values()).map(d => d.name);
  }

  // ─────────────────────────────────────────────
  //  Message Handling
  // ─────────────────────────────────────────────

  _handleMessage(message) {
    const [status, data1, data2] = message.data;
    const type = status & 0xF0;
    const channel = status & 0x0F;

    if (type === 0xB0) {
      // Control Change
      this._handleCC(channel, data1, data2);
    } else if (type === 0x90 && data2 > 0) {
      // Note On (velocity > 0)
      this._handleNoteOn(channel, data1, data2);
    }
    // Note Off (0x80 or 0x90 velocity=0) intentionally ignored
  }

  _handleCC(channel, cc, value) {
    // Auto-map mode: first CC captured → fill ALL variables sequentially
    if (this._autoMapMode === 'cc') {
      this._autoMapMode = null;
      this._learnMode = null;
      this.autoMapCCs(channel, cc);
      this._applyCC(0, value);
      this.onAutoMapComplete?.('cc', cc, channel);
      return;
    }

    if (this._learnMode?.type === 'cc') {
      if (this._learnMode.action !== undefined) {
        // Action CC learn
        const { action } = this._learnMode;
        this._learnMode = null;
        const key = this._ccKey(channel, cc);
        this._removeActionCCByAction(action);
        this.actionCCMappings.set(key, action);
        this._saveMappings();
        this.onLearnCapture('action-cc', action, cc, channel);
        return;
      }

      const { varIndex } = this._learnMode;
      this._learnMode = null;

      // Remove any previous mapping for this CC
      const key = this._ccKey(channel, cc);
      this._removeMappingByVarIndex('cc', varIndex);
      this.ccMappings.set(key, varIndex);
      this._saveMappings();
      this.onLearnCapture('cc', varIndex, cc, channel);

      // Immediately apply the current value
      this._applyCC(varIndex, value);
      return;
    }

    const key = this._ccKey(channel, cc);

    // Action CC mappings take priority (value > 63 = trigger)
    const actionCC = this.actionCCMappings.get(key);
    if (actionCC !== undefined) {
      if (value > 63) this.onAction?.(actionCC);
      return;
    }

    const varIndex = this.ccMappings.get(key);
    if (varIndex !== undefined) {
      this._applyCC(varIndex, value);
    }
  }

  _handleNoteOn(channel, note, _velocity) {
    // Auto-map mode: first Note captured → fill ALL variables sequentially
    if (this._autoMapMode === 'note') {
      this._autoMapMode = null;
      this._learnMode = null;
      this.autoMapNotes(channel, note);
      this.onAutoMapComplete?.('note', note, channel);
      return;
    }

    if (this._learnMode?.type === 'note') {
      if (this._learnMode.action !== undefined) {
        // Action Note learn
        const { action } = this._learnMode;
        this._learnMode = null;
        const key = this._noteKey(channel, note);
        this._removeActionNoteByAction(action);
        this.actionNoteMappings.set(key, action);
        this._saveMappings();
        this.onLearnCapture('action-note', action, note, channel);
        return;
      }

      const { varIndex } = this._learnMode;
      this._learnMode = null;

      const key = this._noteKey(channel, note);
      this._removeMappingByVarIndex('note', varIndex);
      this.noteMappings.set(key, varIndex);
      this._saveMappings();
      this.onLearnCapture('note', varIndex, note, channel);
      return;
    }

    const key = this._noteKey(channel, note);

    // Action note mappings take priority
    const actionNote = this.actionNoteMappings.get(key);
    if (actionNote !== undefined) {
      this.onAction?.(actionNote);
      return;
    }

    const varIndex = this.noteMappings.get(key);
    if (varIndex !== undefined) {
      this._applyNote(varIndex);
    }
  }

  // ─────────────────────────────────────────────
  //  Value Application
  // ─────────────────────────────────────────────

  _applyCC(varIndex, midiValue) {
    const variable = this.app.variables[varIndex];
    if (!variable) return;

    const numValues = variable.values.length;
    if (numValues === 0) return;

    // Absolute: 0-127 → 0…(numValues-1)
    const newIndex = Math.round((midiValue / 127) * (numValues - 1));
    const clamped = Math.max(0, Math.min(numValues - 1, newIndex));

    if (this.app.currentValues[variable.name] === clamped) return;

    this.app.currentValues[variable.name] = clamped;
    this._syncDisplay(varIndex);
    this.app.generateOutput();
    this.onValueChange(varIndex, clamped);
  }

  _applyNote(varIndex) {
    const variable = this.app.variables[varIndex];
    if (!variable) return;

    const numValues = variable.values.length;
    const current = this.app.currentValues[variable.name] ?? 0;
    const newIndex = (current + 1) % numValues;

    this.app.currentValues[variable.name] = newIndex;
    this._syncDisplay(varIndex);
    this.app.generateOutput();
    this.onValueChange(varIndex, newIndex);
  }

  /** Push display update without full re-render */
  _syncDisplay(varIndex) {
    // If in knobs mode, update the specific knob
    if (this.app.controlMode === 'knobs') {
      this.app.updateKnobDisplay(varIndex);
    }
    // In D-pad mode, auto-follow the most recently MIDI-updated variable
    // so the card always shows what MIDI is currently controlling.
    // We set currentVariableIndex directly (not jumpToVariable) because
    // the caller (_applyCC / _applyNote) already calls generateOutput().
    if (this.app.controlMode === 'dpad') {
      this.app.currentVariableIndex = varIndex;
      this.app.updateCenterControl();
    }
  }

  // ─────────────────────────────────────────────
  //  Learn Mode
  // ─────────────────────────────────────────────

  /** Enter CC learn mode for a variable. Returns false if MIDI not ready. */
  startLearnCC(varIndex) {
    if (!this._midiAccess) return false;
    this._learnMode = { type: 'cc', varIndex };
    return true;
  }

  /** Enter Note learn mode for a variable. Returns false if MIDI not ready. */
  startLearnNote(varIndex) {
    if (!this._midiAccess) return false;
    this._learnMode = { type: 'note', varIndex };
    return true;
  }

  /** Cancel any pending learn (including auto-map). */
  cancelLearn() {
    this._learnMode = null;
    this._autoMapMode = null;
  }

  get learnMode() {
    return this._learnMode; // null | { type, varIndex }
  }

  get autoMapMode() {
    return this._autoMapMode; // null | 'cc' | 'note'
  }

  // ─────────────────────────────────────────────
  //  Auto-Map
  // ─────────────────────────────────────────────

  /** Enter auto-map learn for CCs. The next CC captured maps ALL variables. */
  startAutoMapCCs() {
    if (!this._midiAccess) return false;
    this._learnMode = null;
    this._autoMapMode = 'cc';
    return true;
  }

  /** Enter auto-map learn for Notes. The next Note captured maps ALL variables. */
  startAutoMapNotes() {
    if (!this._midiAccess) return false;
    this._learnMode = null;
    this._autoMapMode = 'note';
    return true;
  }

  /**
   * Map all variables to sequential CCs starting from startCC.
   * Clears any existing CC mappings first.
   */
  autoMapCCs(channel, startCC, count = null) {
    const n = count ?? (this.app.variables?.length ?? 0);
    this.ccMappings.clear();
    for (let i = 0; i < n && (startCC + i) <= 127; i++) {
      this.ccMappings.set(this._ccKey(channel, startCC + i), i);
    }
    this._saveMappings();
  }

  /**
   * Map all variables to sequential Notes starting from startNote.
   * Clears any existing Note mappings first.
   */
  autoMapNotes(channel, startNote, count = null) {
    const n = count ?? (this.app.variables?.length ?? 0);
    this.noteMappings.clear();
    for (let i = 0; i < n && (startNote + i) <= 127; i++) {
      this.noteMappings.set(this._noteKey(channel, startNote + i), i);
    }
    this._saveMappings();
  }

  /**
   * Detect if CC mappings follow a sequential pattern.
   * @returns {{ channel: number, start: number, step: number, count: number } | null}
   */
  detectCCPattern() {
    if (this.ccMappings.size < 1) return null;
    const entries = [...this.ccMappings.entries()]
      .map(([key, varIndex]) => ({ ...this._parseKey(key), varIndex }))
      .sort((a, b) => a.varIndex - b.varIndex);

    const channel = entries[0].channel;
    if (!entries.every(e => e.channel === channel)) return null;
    // Must start at varIndex 0 with no gaps
    if (entries[0].varIndex !== 0) return null;

    const start = entries[0].number;
    const step  = entries.length > 1 ? entries[1].number - entries[0].number : 1;
    if (step <= 0) return null;

    for (let i = 0; i < entries.length; i++) {
      if (entries[i].varIndex !== i) return null;
      if (entries[i].number !== start + i * step) return null;
    }
    return { channel, start, step, count: entries.length };
  }

  /**
   * Detect if Note mappings follow a sequential pattern.
   * @returns {{ channel: number, start: number, step: number, count: number } | null}
   */
  detectNotePattern() {
    if (this.noteMappings.size < 1) return null;
    const entries = [...this.noteMappings.entries()]
      .map(([key, varIndex]) => ({ ...this._parseKey(key), varIndex }))
      .sort((a, b) => a.varIndex - b.varIndex);

    const channel = entries[0].channel;
    if (!entries.every(e => e.channel === channel)) return null;
    if (entries[0].varIndex !== 0) return null;

    const start = entries[0].number;
    const step  = entries.length > 1 ? entries[1].number - entries[0].number : 1;
    if (step <= 0) return null;

    for (let i = 0; i < entries.length; i++) {
      if (entries[i].varIndex !== i) return null;
      if (entries[i].number !== start + i * step) return null;
    }
    return { channel, start, step, count: entries.length };
  }

  /**
   * After a template change, extend existing sequential mappings to cover
   * any new variables beyond the previous count.
   * Returns true if mappings were extended.
   */
  extendMappings(newVarCount) {
    let extended = false;

    const ccP = this.detectCCPattern();
    if (ccP && ccP.count < newVarCount) {
      for (let i = ccP.count; i < newVarCount && (ccP.start + i * ccP.step) <= 127; i++) {
        this.ccMappings.set(this._ccKey(ccP.channel, ccP.start + i * ccP.step), i);
      }
      extended = true;
    }

    const noteP = this.detectNotePattern();
    if (noteP && noteP.count < newVarCount) {
      for (let i = noteP.count; i < newVarCount && (noteP.start + i * noteP.step) <= 127; i++) {
        this.noteMappings.set(this._noteKey(noteP.channel, noteP.start + i * noteP.step), i);
      }
      extended = true;
    }

    if (extended) this._saveMappings();
    return extended;
  }

  // ─────────────────────────────────────────────
  //  Mapping Management
  // ─────────────────────────────────────────────

  /** Get CC mapping for a variable index, or null. */
  getCCForVar(varIndex) {
    for (const [key, vi] of this.ccMappings) {
      if (vi === varIndex) return this._parseKey(key); // { channel, number }
    }
    return null;
  }

  /** Get Note mapping for a variable index, or null. */
  getNoteForVar(varIndex) {
    for (const [key, vi] of this.noteMappings) {
      if (vi === varIndex) return this._parseKey(key);
    }
    return null;
  }

  /** Remove CC mapping for a variable. */
  removeCCMapping(varIndex) {
    this._removeMappingByVarIndex('cc', varIndex);
    this._saveMappings();
  }

  /** Remove Note mapping for a variable. */
  removeNoteMapping(varIndex) {
    this._removeMappingByVarIndex('note', varIndex);
    this._saveMappings();
  }

  /** Clear all mappings. */
  clearAllMappings() {
    this.ccMappings.clear();
    this.noteMappings.clear();
    this._saveMappings();
  }

  /** All current mappings as a plain object for display. */
  getMappingSummary() {
    const result = [];
    for (const [key, vi] of this.ccMappings) {
      const { channel, number } = this._parseKey(key);
      result.push({ type: 'cc', varIndex: vi, number, channel });
    }
    for (const [key, vi] of this.noteMappings) {
      const { channel, number } = this._parseKey(key);
      result.push({ type: 'note', varIndex: vi, number, channel });
    }
    return result;
  }

  _removeMappingByVarIndex(type, varIndex) {
    const map = type === 'cc' ? this.ccMappings : this.noteMappings;
    for (const [key, vi] of map) {
      if (vi === varIndex) { map.delete(key); break; }
    }
  }

  _ccKey(ch, cc)     { return `${ch}-${cc}`; }
  _noteKey(ch, note) { return `${ch}-${note}`; }
  _parseKey(key)     { const [ch, n] = key.split('-'); return { channel: +ch, number: +n }; }

  // ─────────────────────────────────────────────
  //  Action Mappings — public API
  // ─────────────────────────────────────────────

  startLearnActionNote(action) {
    if (!this._midiAccess) return false;
    this._learnMode = { type: 'note', action };
    return true;
  }

  startLearnActionCC(action) {
    if (!this._midiAccess) return false;
    this._learnMode = { type: 'cc', action };
    return true;
  }

  getActionNoteMapping(action) {
    for (const [key, a] of this.actionNoteMappings) {
      if (a === action) {
        const [ch, note] = key.split('-').map(Number);
        return { channel: ch, number: note };
      }
    }
    return null;
  }

  getActionCCMapping(action) {
    for (const [key, a] of this.actionCCMappings) {
      if (a === action) {
        const [ch, cc] = key.split('-').map(Number);
        return { channel: ch, number: cc };
      }
    }
    return null;
  }

  removeActionNoteMapping(action) {
    this._removeActionNoteByAction(action);
    this._saveMappings();
  }

  removeActionCCMapping(action) {
    this._removeActionCCByAction(action);
    this._saveMappings();
  }

  _removeActionNoteByAction(action) {
    for (const [key, a] of this.actionNoteMappings) {
      if (a === action) { this.actionNoteMappings.delete(key); return; }
    }
  }

  _removeActionCCByAction(action) {
    for (const [key, a] of this.actionCCMappings) {
      if (a === action) { this.actionCCMappings.delete(key); return; }
    }
  }

  // ─────────────────────────────────────────────
  //  Persistence
  // ─────────────────────────────────────────────

  _saveMappings() {
    try {
      const data = {
        cc:         Object.fromEntries(this.ccMappings),
        note:       Object.fromEntries(this.noteMappings),
        actionNote: Object.fromEntries(this.actionNoteMappings),
        actionCC:   Object.fromEntries(this.actionCCMappings),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* non-fatal */ }
  }

  _loadMappings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.cc)         Object.entries(data.cc).forEach(([k, v])         => this.ccMappings.set(k, v));
      if (data.note)       Object.entries(data.note).forEach(([k, v])       => this.noteMappings.set(k, v));
      if (data.actionNote) Object.entries(data.actionNote).forEach(([k, v]) => this.actionNoteMappings.set(k, v));
      if (data.actionCC)   Object.entries(data.actionCC).forEach(([k, v])   => this.actionCCMappings.set(k, v));
    } catch { /* non-fatal */ }
  }

  /** Call after a new template is loaded — prune stale var indices. */
  pruneStaleMappings() {
    const maxIndex = (this.app.variables?.length ?? 0) - 1;
    for (const [k, vi] of this.ccMappings)   { if (vi > maxIndex) this.ccMappings.delete(k); }
    for (const [k, vi] of this.noteMappings) { if (vi > maxIndex) this.noteMappings.delete(k); }
    this._saveMappings();
  }

  // ─────────────────────────────────────────────
  //  Note name helper (for UI)
  // ─────────────────────────────────────────────
  static noteNumberToName(n) {
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    return `${names[n % 12]}${Math.floor(n / 12) - 1}`;
  }
}
