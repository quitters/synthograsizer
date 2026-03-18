/**
 * DisplayBroadcaster
 *
 * Manages the BroadcastChannel that drives the dedicated OBS display page
 * (display.html). The display page opens in a separate window and shows one
 * of three full-screen sources driven by the Synthograsizer:
 *
 *   • p5.js canvas  — live generative sketch with real-time variable sync
 *   • image         — latest generated image auto-pushed on generation
 *   • video         — generated or looping video
 *
 * All communication is one-way (main → display) except for optional `pong`
 * keepalives used to detect whether the display window is still open.
 */

import { getValueText } from './template-normalizer.js?v=2';

const CHANNEL = 'synthograsizer-display-v1';

export class DisplayBroadcaster {
  /**
   * @param {object} app — SynthograsizerSmall instance
   */
  constructor(app) {
    this.app = app;
    this._channel = new BroadcastChannel(CHANNEL);
    this._displayWindow = null;
    this._lastPong = 0;

    // Track last-known sketch state so we can replay when display opens late
    this._lastCode = null;
    this._lastVars = {};

    // Listen for pong replies from the display page
    this._channel.addEventListener('message', (e) => {
      if (e.data?.type === 'pong') {
        this._lastPong = Date.now();
        this._updateSidebarStatus(true);
      }
    });

    // Sidebar UI Elements
    this.dispDot = document.getElementById('disp-dot');
    this.dispStatus = document.getElementById('disp-status-text');
    this.dispToggleBtn = document.getElementById('disp-toggle-btn');

    // Start periodic check
    setTimeout(() => this._startStatusCheck(), 2000);
  }

  _startStatusCheck() {
    setInterval(() => {
      const isClosed = !this._displayWindow || this._displayWindow.closed;
      const timedOut = Date.now() - this._lastPong > 5000;
      
      if (isClosed || timedOut) {
        this._updateSidebarStatus(false);
      } else {
        // Ping the display to keep it alive
        this._post({ type: 'ping' });
      }
    }, 3000);
  }

  _updateSidebarStatus(isActive) {
    if (this.dispDot) {
      if (isActive) this.dispDot.classList.add('osc-on');
      else this.dispDot.classList.remove('osc-on');
    }
    if (this.dispStatus) {
      this.dispStatus.textContent = isActive ? 'Display ACTIVE' : 'Display';
    }
    if (this.dispToggleBtn) {
      this.dispToggleBtn.dataset.tooltip = isActive ? 'Display — window open' : 'Display — window closed';
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Open (or focus) the display page in a new browser window.
   * If the sketch is already running, replays the last p5-run message
   * after a short delay to ensure the display page is ready.
   */
  openDisplay() {
    if (this._displayWindow && !this._displayWindow.closed) {
      this._displayWindow.focus();
    } else {
      this._displayWindow = window.open('/synthograsizer/display.html', 'synthograsizer-display',
        'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
    }

    // If sketch is running, replay after display page loads.
    // Prefer the live editor code (getCurrentCode) so we don't use a stale cache.
    const liveCode = this.app.codeOverlayManager?.getCurrentCode() || this._lastCode;
    if (liveCode) {
      setTimeout(() => {
        this._post({ type: 'p5-run', code: liveCode, vars: this._buildVars() });
      }, 1200);
    }
  }

  /**
   * Broadcast the p5 sketch code and current variable snapshot to the display.
   * Call this when the sketch starts running on the main page.
   * @param {string} code  — raw p5 sketch code (as passed to new Function)
   * @param {object} vars  — varName → valueText map (from _buildVars)
   */
  sendP5Run(code, vars) {
    this._lastCode = code;
    this._lastVars = vars;
    this._post({ type: 'p5-run', code, vars });
  }

  /**
   * Broadcast an updated variable snapshot.
   * Call this on every updateDisplay() (i.e., every knob change).
   * The display sketch reads variables on each draw() call — no restart needed.
   * @param {object} vars  — varName → valueText map
   */
  sendVarsUpdate(vars) {
    this._lastVars = vars;
    this._post({ type: 'p5-vars', vars });
  }

  /**
   * Tell the display page the sketch has stopped.
   * The display will clear the canvas and show an idle state.
   */
  sendP5Stop() {
    this._lastCode = null;
    this._post({ type: 'p5-stop' });
  }

  /**
   * Push an image to the display page full-screen.
   * The display switches to image mode and hides other layers.
   * @param {string} src       — data URL or object URL of the image
   * @param {string} filename  — optional display label
   */
  sendImage(src, filename = '') {
    this._post({ type: 'image-show', src, filename });
  }

  /**
   * Push a video to the display page for looping full-screen playback.
   * @param {string} src  — object URL or data URL of the video
   */
  sendVideo(src) {
    this._post({ type: 'video-show', src });
  }

  /**
   * Build a varName → valueText map from the current app state.
   * Mirrors the getSynthVar logic in code-overlay-manager.js.
   */
  _buildVars() {
    const map = {};
    if (!this.app.variables) return map;
    for (const v of this.app.variables) {
      const idx = this.app.currentValues?.[v.name] ?? 0;
      const value = v.values?.[idx];
      if (value !== undefined) {
        const text = getValueText(value);
        if (v.name) map[v.name] = text;
        if (v.feature_name) map[v.feature_name] = text;
      }
    }
    return map;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _post(data) {
    try {
      this._channel.postMessage(data);
    } catch (e) {
      console.warn('[DisplayBroadcaster] postMessage failed', e);
    }
  }
}
