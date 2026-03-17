/**
 * OSCController — sends the resolved prompt (and optional params) to
 * Daydream Scope via the FastAPI OSC bridge.
 *
 * The browser can't send UDP directly, so every call goes through
 *   POST /api/osc/send-prompt   { prompt, address }
 *   POST /api/osc/send-param    { address, value }
 *
 * Debounces rapid knob changes to avoid flooding Scope.
 */

const STORAGE_KEY = 'synthograsizerOscConfigV1';

export class OSCController {
  constructor(callbacks = {}) {
    this.onStatusChange = callbacks.onStatusChange || (() => {});
    this.onSend = callbacks.onSend || (() => {});

    // Defaults — overwritten by localStorage if present
    this.enabled = false;
    this.autoSend = false;
    this.host = '127.0.0.1';
    this.port = 9000;
    this.address = '/prompts';

    this._debounceTimer = null;
    this._debounceMs = 80;          // ms to wait before sending
    this._lastSentPrompt = null;    // avoid duplicate sends

    this._loadConfig();
    this._syncBackendConfig();      // push stored host/port to backend on init
  }

  // ── public API ─────────────────────────────────────────

  /** Send a prompt string immediately (no debounce). */
  async sendPrompt(prompt) {
    if (!this.enabled) return;
    if (!prompt || prompt === this._lastSentPrompt) return;

    this._lastSentPrompt = prompt;

    try {
      const res = await fetch('/api/osc/send-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, address: this.address }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.onSend(prompt);
      this.onStatusChange('sent');
    } catch (err) {
      console.warn('OSCController: send failed', err);
      this.onStatusChange('error', err.message);
    }
  }

  /** Debounced send — call this from updateDisplay(). */
  debouncedSendPrompt(prompt) {
    if (!this.enabled || !this.autoSend) return;
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this.sendPrompt(prompt), this._debounceMs);
  }

  /** Send a numeric float parameter (guidance_scale, delta, etc.). */
  async sendParam(address, value) {
    if (!this.enabled) return;

    try {
      const res = await fetch('/api/osc/send-param', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, value }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.warn('OSCController: sendParam failed', err);
    }
  }

  /**
   * Send a template variable update as a normalized float (0-1).
   * Address: /synthograsizer/var/{index}
   * Also sends the variable name + value text for debugging/routing.
   */
  async sendVarUpdate(index, normalizedValue, varName, valueText) {
    if (!this.enabled) return;

    // Float value for MIDI-like mapping
    this.sendParam(`/synthograsizer/var/${index}`, normalizedValue);

    // Optional: send the text value for downstream consumers
    if (varName && valueText) {
      try {
        await fetch('/api/osc/send-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: valueText,
            address: `/synthograsizer/var/${index}/text`,
          }),
        });
      } catch {}
    }
  }

  // ── configuration ──────────────────────────────────────

  setEnabled(enabled) {
    this.enabled = enabled;
    this._saveConfig();
    this.onStatusChange(enabled ? 'enabled' : 'disabled');
  }

  setAutoSend(autoSend) {
    this.autoSend = autoSend;
    this._saveConfig();
  }

  async updateTarget(host, port) {
    this.host = host || this.host;
    this.port = parseInt(port, 10) || this.port;
    this._saveConfig();
    await this._syncBackendConfig();
  }

  setAddress(address) {
    this.address = address || '/prompts';
    this._saveConfig();
  }

  setDebounce(ms) {
    this._debounceMs = Math.max(10, Math.min(1000, ms));
    this._saveConfig();
  }

  // ── persistence ────────────────────────────────────────

  _saveConfig() {
    const cfg = {
      enabled: this.enabled,
      autoSend: this.autoSend,
      host: this.host,
      port: this.port,
      address: this.address,
      debounceMs: this._debounceMs,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch {}
  }

  _loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const cfg = JSON.parse(raw);
      if (cfg.enabled !== undefined) this.enabled = cfg.enabled;
      if (cfg.autoSend !== undefined) this.autoSend = cfg.autoSend;
      if (cfg.host) this.host = cfg.host;
      if (cfg.port) this.port = cfg.port;
      if (cfg.address) this.address = cfg.address;
      if (cfg.debounceMs) this._debounceMs = cfg.debounceMs;
    } catch {}
  }

  async _syncBackendConfig() {
    try {
      await fetch('/api/osc/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: this.host, port: this.port }),
      });
    } catch {}
  }

  /** Fetch current backend status. */
  async getStatus() {
    try {
      const res = await fetch('/api/osc/status');
      return await res.json();
    } catch { return null; }
  }
}
