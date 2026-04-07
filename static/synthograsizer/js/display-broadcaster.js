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
    this._lastType = null;    // 'p5' | 'html' | 'svg' | 'url'
    this._lastContent = null; // html/svg string or url string

    // Separate channel for blob simulator control (always open, low overhead)
    this._blobChannel = null;
    try { this._blobChannel = new BroadcastChannel('synthograsizer-blob-v1'); } catch (e) {}

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

    // Background color picker
    this._bgColorInput = document.getElementById('disp-bg-color');
    this._bgColorInput?.addEventListener('input', () => {
      this._post({ type: 'bg-color', color: this._bgColorInput.value });
    });

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

    // Replay last sketch after display page loads, regardless of type
    const type = this._lastType;
    const content = this._lastContent;
    const liveCode = this.app.codeOverlayManager?.getCurrentCode() || this._lastCode;

    if (type || liveCode) {
      setTimeout(() => {
        switch (type) {
          case 'html': this._post({ type: 'html-run', html: content }); break;
          case 'svg':  this._post({ type: 'svg-run',  svg:  content }); break;
          case 'url':  this._post({ type: 'html-run', url:  content }); break;
          default:
            if (liveCode) this._post({ type: 'p5-run', code: liveCode, vars: this._buildVars() });
            break;
        }
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
    this._lastType = 'p5';
    this._lastCode = code;
    this._lastVars = vars;
    this._post({ type: 'p5-run', code, vars });
  }

  sendHtmlRun(html) {
    this._lastType = 'html';
    this._lastContent = html;
    this._post({ type: 'html-run', html });
  }

  sendSvgRun(svg) {
    this._lastType = 'svg';
    this._lastContent = svg;
    this._post({ type: 'svg-run', svg });
  }

  sendUrlRun(url) {
    this._lastType = 'url';
    this._lastContent = url;
    this._post({ type: 'html-run', url });
    // Initial param sync once the page has had time to load
    setTimeout(() => this.syncBlobFromVars(this._buildVars()), 2200);
  }

  /**
   * Translate Synthograsizer variable values into blob simulator control messages.
   * Sent on the blob BroadcastChannel whenever variables change while a URL sketch
   * (i.e. the blob sim) is active in the display window.
   *
   * Variable naming convention for blob templates:
   *   blob_preset    → apply-preset  (sets all params as a baseline)
   *   blob_size      → set-params.size   (1–125)
   *   blob_inflation → set-params.pres   (0–125)
   *   blob_tension   → set-params.tens   (5–125)
   *   blob_damping   → set-params.damp   (1–50)
   *   blob_mass      → set-params.mass   (1–15)
   *   blob_gravity   → set-params.grav   (0–50)
   *   blob_bend      → set-params.bend   (0–38)
   *   color_theme    → set-colors
   *   blob_mode      → set-mode
   *   blob_count     → set-blob-count
   */
  syncBlobFromVars(vars) {
    if (!this._blobChannel) return;
    const post = (msg) => { try { this._blobChannel.postMessage(msg); } catch (e) {} };

    // 1. Apply preset first — sets a full physics baseline
    if (vars.blob_preset) post({ type: 'apply-preset', preset: vars.blob_preset });

    // 2. Override individual params on top of the preset
    const PARAM_MAP = {
      blob_size: 'size', blob_inflation: 'pres', blob_tension: 'tens',
      blob_damping: 'damp', blob_mass: 'mass', blob_gravity: 'grav', blob_bend: 'bend'
    };
    const params = {};
    for (const [varName, paramKey] of Object.entries(PARAM_MAP)) {
      const v = vars[varName];
      if (v !== undefined && v !== '' && !isNaN(Number(v))) params[paramKey] = Number(v);
    }
    if (Object.keys(params).length > 0) post({ type: 'set-params', params });

    // 3. Color theme
    const theme = vars.color_theme || vars.blob_colors;
    if (theme) post({ type: 'set-colors', theme });

    // 4. Mode
    if (vars.blob_mode) post({ type: 'set-mode', mode: vars.blob_mode });

    // 5. Blob count
    if (vars.blob_count) post({ type: 'set-blob-count', count: Number(vars.blob_count) });
  }

  sendSketchStop() {
    this._lastType = null;
    this._lastContent = null;
    this._lastCode = null;
    this._post({ type: 'p5-stop' });
    this._post({ type: 'html-stop' });
    this._post({ type: 'svg-stop' });
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
    if (this._lastType === 'url') this.syncBlobFromVars(vars);
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
