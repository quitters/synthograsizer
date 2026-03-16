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
    this.onStatusChange = callbacks.onStatusChange || (() => {});
    this.onLearnCapture = callbacks.onLearnCapture || (() => {});
    this.onValueChange = callbacks.onValueChange || (() => {});

    /** @type {Map<string, number>} key: "ch-cc" → varIndex */
    this.ccMappings = new Map();
    /** @type {Map<string, number>} key: "ch-note" → varIndex */
    this.noteMappings = new Map();

    this._learnMode = null;  // null | { type: 'cc'|'note', varIndex }
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
    if (this._learnMode?.type === 'cc') {
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
    const varIndex = this.ccMappings.get(key);
    if (varIndex !== undefined) {
      this._applyCC(varIndex, value);
    }
  }

  _handleNoteOn(channel, note, _velocity) {
    if (this._learnMode?.type === 'note') {
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

  /** Cancel any pending learn. */
  cancelLearn() {
    this._learnMode = null;
  }

  get learnMode() {
    return this._learnMode; // null | { type, varIndex }
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
  //  Persistence
  // ─────────────────────────────────────────────

  _saveMappings() {
    try {
      const data = {
        cc:   Object.fromEntries(this.ccMappings),
        note: Object.fromEntries(this.noteMappings),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* non-fatal */ }
  }

  _loadMappings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.cc)   Object.entries(data.cc).forEach(([k, v])   => this.ccMappings.set(k, v));
      if (data.note) Object.entries(data.note).forEach(([k, v]) => this.noteMappings.set(k, v));
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
