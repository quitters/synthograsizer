/**
 * OSCPanelUI — collapsible settings panel for the OSC → Daydream Scope bridge.
 *
 * Mirrors the MIDI panel pattern: a toggle button in the bar area expands/
 * collapses a settings panel.  The panel lets the user configure host, port,
 * OSC address, auto-send, and debounce, and shows send status.
 */

export class OSCPanelUI {
  /**
   * @param {import('./osc-controller.js').OSCController} osc
   */
  constructor(osc) {
    this.osc = osc;

    // DOM refs
    this.toggleBtn = document.getElementById('osc-toggle-btn');
    this.panel = document.getElementById('osc-panel');
    this.dot = document.getElementById('osc-dot');
    this.statusText = document.getElementById('osc-status-text');

    this.enabledToggle = document.getElementById('osc-enabled');
    this.autoSendToggle = document.getElementById('osc-auto-send');
    this.hostInput = document.getElementById('osc-host');
    this.portInput = document.getElementById('osc-port');
    this.addressInput = document.getElementById('osc-address');
    this.debounceInput = document.getElementById('osc-debounce');
    this.sendNowBtn = document.getElementById('osc-send-now');
    this.lastSentEl = document.getElementById('osc-last-sent');

    if (!this.toggleBtn || !this.panel) return;

    this._initValues();
    this._bindEvents();
    this._updateDot();
  }

  // ── initialisation ─────────────────────────────────────

  _initValues() {
    if (this.enabledToggle)  this.enabledToggle.checked = this.osc.enabled;
    if (this.autoSendToggle) this.autoSendToggle.checked = this.osc.autoSend;
    if (this.hostInput)      this.hostInput.value = this.osc.host;
    if (this.portInput)      this.portInput.value = this.osc.port;
    if (this.addressInput)   this.addressInput.value = this.osc.address;
    if (this.debounceInput)  this.debounceInput.value = this.osc._debounceMs;
  }

  _bindEvents() {
    // Toggle panel open/close
    this.toggleBtn.addEventListener('click', () => {
      const open = this.panel.style.display !== 'none';
      this.panel.style.display = open ? 'none' : 'block';
      this.toggleBtn.classList.toggle('active', !open);
    });

    // Enabled checkbox
    this.enabledToggle?.addEventListener('change', () => {
      this.osc.setEnabled(this.enabledToggle.checked);
      this._updateDot();
    });

    // Auto-send checkbox
    this.autoSendToggle?.addEventListener('change', () => {
      this.osc.setAutoSend(this.autoSendToggle.checked);
    });

    // Host / port — sync to backend on blur
    const syncTarget = async () => {
      await this.osc.updateTarget(this.hostInput.value, this.portInput.value);
    };
    this.hostInput?.addEventListener('change', syncTarget);
    this.portInput?.addEventListener('change', syncTarget);

    // OSC address
    this.addressInput?.addEventListener('change', () => {
      this.osc.setAddress(this.addressInput.value);
    });

    // Debounce
    this.debounceInput?.addEventListener('change', () => {
      this.osc.setDebounce(parseInt(this.debounceInput.value, 10));
    });

    // Manual send
    this.sendNowBtn?.addEventListener('click', () => {
      // Trigger send via the app's current prompt
      if (window.synthSmall) {
        const prompt = window.synthSmall.getCurrentPromptText();
        this.osc.sendPrompt(prompt);
      }
    });

    // OSC controller callbacks
    this.osc.onStatusChange = (status, detail) => {
      this._updateDot(status);
      if (status === 'error') {
        this.statusText.textContent = 'OSC err';
        this.statusText.title = detail || '';
      }
    };

    this.osc.onSend = (prompt) => {
      if (this.lastSentEl) {
        const short = prompt.length > 60 ? prompt.slice(0, 57) + '...' : prompt;
        this.lastSentEl.textContent = short;
        this.lastSentEl.title = prompt;
      }
    };
  }

  // ── visual helpers ─────────────────────────────────────

  _updateDot(status) {
    if (!this.dot) return;
    this.dot.classList.remove('osc-on', 'osc-sent', 'osc-error');

    if (!this.osc.enabled) {
      this.statusText.textContent = 'OSC';
      return;
    }

    if (status === 'sent') {
      this.dot.classList.add('osc-sent');
      this.statusText.textContent = 'OSC';
      // flash green briefly
      setTimeout(() => this.dot.classList.remove('osc-sent'), 400);
      this.dot.classList.add('osc-on');
    } else if (status === 'error') {
      this.dot.classList.add('osc-error');
    } else {
      this.dot.classList.add('osc-on');
      this.statusText.textContent = 'OSC';
    }
  }
}
