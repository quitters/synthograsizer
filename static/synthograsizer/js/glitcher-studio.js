/* ──────────────────────────────────────────────────────────────────────
 * Glitcher Studio Modal (Path A — iframe embed)
 *
 * Wraps the standalone Glitcher app (/glitcher/?embed=1) in a
 * Synthograsizer modal and bridges import/export between the two.
 *
 *   Pull from Synthograsizer → Glitcher
 *     - "Pull Output"  → latest #studio-result image (Image Studio output)
 *     - "Pull P5"      → snapshot of the in-page P5 modal canvas
 *     - "Live P5 Feed" → continuous frame streaming from P5 canvas
 *     - File drop / paste also forwarded
 *
 *   Push back from Glitcher → Synthograsizer
 *     - "Send to Output"     → renders into #studio-result preview
 *     - "Save as Artifact"   → POST to /chatroom/api/artifacts (when reachable)
 *     - "Download"           → triggers a local PNG download
 * ────────────────────────────────────────────────────────────────────── */

class GlitcherStudio {
  constructor(studioIntegration) {
    this.studio  = studioIntegration;
    this.MODAL   = 'glitcher-studio-modal';
    this.IFRAME  = 'gs-iframe';
    this.SRC     = '/glitcher/v2.html?embed=1';

    this._ready          = false;
    this._msgHandler     = null;
    this._liveTimer      = null;
    this._liveFps        = 12;          // P5 live feed rate
    this._exportOnReturn = null;        // callback queued for next 'glitcher-export'
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────

  init() {
    if (!this.studio || typeof this.studio.createModal !== 'function') return;
    this._injectStyles();
    this.studio.createModal(this.MODAL, '✦ Glitcher Studio', this._buildModalHTML());
    this._bindEvents();
  }

  open() {
    const modal = document.getElementById(this.MODAL);
    if (!modal) return;
    modal.classList.add('active');

    // Load iframe lazily on first open (saves ~300KB until user wants it)
    const frame = document.getElementById(this.IFRAME);
    if (frame && !frame.src) {
      this._ready = false;
      frame.src = this.SRC;
    }
  }

  close() {
    const modal = document.getElementById(this.MODAL);
    if (modal) modal.classList.remove('active');
    this._stopLiveFeed();
  }

  // ─── Markup ────────────────────────────────────────────────────────

  _buildModalHTML() {
    return `
      <div class="gs-root">
        <div class="gs-toolbar">
          <div class="gs-toolbar-left">
            <button class="gs-btn"          id="gs-pull-output" title="Load the latest Image Studio result">⤓ Pull Output</button>
            <button class="gs-btn"          id="gs-pull-p5"     title="Snapshot the in-page P5 canvas">⤓ Pull P5</button>
            <button class="gs-btn"          id="gs-pull-live"   title="Stream live frames from the P5 canvas">▶ Live P5 Feed</button>
            <label  class="gs-btn"          title="Drop or pick a local image / GIF / video">
              ⤓ File <input type="file" id="gs-file" accept="image/*,video/mp4,video/webm,image/gif" style="display:none">
            </label>
          </div>
          <div class="gs-toolbar-right">
            <button class="gs-btn"          id="gs-send-output"   title="Send glitched canvas back as the Image Studio result">⤴ Send to Output</button>
            <button class="gs-btn"          id="gs-save-artifact" title="Save glitched output as an Agent Studio artifact">◈ Save Artifact</button>
            <button class="gs-btn"          id="gs-download"      title="Download glitched canvas as PNG">⤓ Download</button>
            <span   class="gs-status"       id="gs-status">idle</span>
          </div>
        </div>
        <div class="gs-frame-wrap">
          <iframe id="${this.IFRAME}" class="gs-iframe" title="Glitcher Studio"></iframe>
          <div class="gs-loading" id="gs-loading">Loading Glitcher…</div>
        </div>
      </div>
    `;
  }

  _injectStyles() {
    if (document.getElementById('gs-studio-styles')) return;
    const s = document.createElement('style');
    s.id = 'gs-studio-styles';
    s.textContent = `
      /* Override the base 500px-wide studio-modal for Glitcher */
      #${this.MODAL} {
        width: 96vw !important; max-width: 96vw !important;
        height: 92vh !important; max-height: 92vh !important;
        overflow: hidden !important; padding: 0 !important;
        top: 50% !important; left: 50% !important;
        transform: translate(-50%, -50%) !important;
      }
      #${this.MODAL}.active { display: flex !important; flex-direction: column !important; }
      #${this.MODAL} .studio-modal-content {
        max-width: none !important; width: 100% !important;
        height: 100% !important;
        display: flex !important; flex-direction: column !important;
        overflow: hidden !important;
      }
      #${this.MODAL} .studio-modal-body {
        padding: 0 !important; flex: 1 1 auto !important; min-height: 0 !important;
        display: flex !important; flex-direction: column !important;
        overflow: hidden !important;
      }
      .gs-root { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; background: #1a1a2e; }
      .gs-toolbar {
        display: flex; justify-content: space-between; align-items: center;
        padding: 8px 12px; background: #20203a;
        border-bottom: 1px solid rgba(78,205,196,.25);
        flex-wrap: wrap; gap: 8px; flex-shrink: 0;
      }
      .gs-toolbar-left, .gs-toolbar-right { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .gs-btn {
        background: rgba(78,205,196,.12); color: #4ecdc4;
        border: 1px solid rgba(78,205,196,.45); padding: 5px 11px;
        border-radius: 4px; font-size: 11px; font-weight: 600;
        text-transform: uppercase; letter-spacing: .04em;
        cursor: pointer; transition: all .15s; line-height: 1.3;
        font-family: 'Inter', 'Segoe UI', sans-serif;
      }
      .gs-btn:hover { background: rgba(78,205,196,.32); color: #fff; border-color: #4ecdc4; }
      .gs-btn.live  { background: #ef4444; color: #fff; border-color: #ef4444; }
      .gs-btn.live:hover { background: #dc2626; }
      .gs-status {
        color: #888; font-size: 10px; font-family: 'Roboto Mono', monospace;
        padding-left: 8px; min-width: 60px; text-align: right;
      }
      .gs-status.ok    { color: #4ecdc4; }
      .gs-status.err   { color: #ef4444; }
      .gs-status.live  { color: #ef4444; }
      .gs-frame-wrap { flex: 1 1 auto; min-height: 0; position: relative; }
      .gs-iframe { width: 100%; height: 100%; border: 0; display: block; background: #1a1a2e; }
      .gs-loading {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        color: #4ecdc4; font-family: 'Roboto Mono', monospace; font-size: 12px;
        background: #1a1a2e; pointer-events: none; transition: opacity .25s;
      }
      .gs-loading.hidden { opacity: 0; }
    `;
    document.head.appendChild(s);
  }

  // ─── Events ────────────────────────────────────────────────────────

  _bindEvents() {
    // Toolbar buttons
    document.getElementById('gs-pull-output').onclick   = () => this._pullOutput();
    document.getElementById('gs-pull-p5').onclick       = () => this._pullP5(false);
    document.getElementById('gs-pull-live').onclick     = (e) => this._toggleLiveFeed(e.currentTarget);
    document.getElementById('gs-file').onchange         = (e) => this._pullFile(e.target.files[0]);
    document.getElementById('gs-send-output').onclick   = () => this._sendToOutput();
    document.getElementById('gs-save-artifact').onclick = () => this._saveAsArtifact();
    document.getElementById('gs-download').onclick      = () => this._downloadCanvas();

    // Iframe load — show/hide loader
    const frame   = document.getElementById(this.IFRAME);
    const loading = document.getElementById('gs-loading');
    if (frame) {
      frame.addEventListener('load', () => {
        if (loading) loading.classList.add('hidden');
      });
    }

    // Listen for messages from the embedded glitcher
    this._msgHandler = (e) => this._onIframeMessage(e);
    window.addEventListener('message', this._msgHandler);
  }

  _onIframeMessage(e) {
    const d = e.data;
    if (!d || typeof d !== 'object') return;

    switch (d.type) {
      case 'glitcher-ready':
        this._ready = true;
        this._setStatus('ready', 'ok');
        break;

      case 'glitcher-loaded':
        this._setStatus('loaded', 'ok');
        break;

      case 'glitcher-export':
        if (this._exportOnReturn) {
          const cb = this._exportOnReturn;
          this._exportOnReturn = null;
          cb(d.dataUrl);
        }
        break;

      case 'glitcher-export-error':
      case 'glitcher-bridge-error':
        this._setStatus('error: ' + (d.error || 'unknown'), 'err');
        break;

      case 'request-source':
        // Embed action bar inside iframe asked for a source
        if (d.source === 'output') this._pullOutput();
        else if (d.source === 'p5') this._pullP5(false);
        break;
    }
  }

  // ─── Inputs (parent → glitcher) ────────────────────────────────────

  _pullOutput() {
    // Look for the most recent generated image in #studio-result
    const result = document.getElementById('studio-result');
    if (!result) { this._setStatus('no output', 'err'); return; }
    const img = result.querySelector('img');
    if (!img || !img.src) { this._setStatus('no image', 'err'); return; }
    this._sendToGlitcher(img.src, 'output');
  }

  _pullP5(asFrame = false) {
    // Snapshot the in-page P5 modal canvas (#p5-iframe-v6 → its canvas)
    const p5Iframe = document.getElementById('p5-iframe-v6');
    if (!p5Iframe) { this._setStatus('no p5 modal', 'err'); return; }
    let cv;
    try { cv = p5Iframe.contentDocument && p5Iframe.contentDocument.querySelector('canvas'); }
    catch (e) { this._setStatus('p5 cors', 'err'); return; }
    if (!cv) { this._setStatus('no p5 canvas', 'err'); return; }
    let dataUrl;
    try { dataUrl = cv.toDataURL('image/png'); }
    catch (e) { this._setStatus('p5 export err', 'err'); return; }
    this._sendToGlitcher(dataUrl, asFrame ? 'p5-frame' : 'p5');
  }

  _pullFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this._sendToGlitcher(reader.result, 'file');
    reader.readAsDataURL(file);
  }

  _sendToGlitcher(dataUrl, source) {
    const frame = document.getElementById(this.IFRAME);
    if (!frame || !frame.contentWindow) { this._setStatus('iframe not ready', 'err'); return; }
    const msgType = (source === 'p5-frame') ? 'load-media-frame' : 'load-media';
    frame.contentWindow.postMessage({ type: msgType, dataUrl: dataUrl, source: source }, '*');
    if (source !== 'p5-frame') this._setStatus('sent: ' + source, 'ok');
  }

  // ─── Live P5 feed ──────────────────────────────────────────────────

  _toggleLiveFeed(btn) {
    if (this._liveTimer) {
      this._stopLiveFeed();
      btn.textContent = '▶ Live P5 Feed';
      btn.classList.remove('live');
    } else {
      this._startLiveFeed();
      btn.textContent = '■ Stop Feed';
      btn.classList.add('live');
    }
  }

  _startLiveFeed() {
    if (this._liveTimer) return;
    this._setStatus('live', 'live');
    this._liveTimer = setInterval(() => this._pullP5(true), Math.max(33, Math.floor(1000 / this._liveFps)));
  }

  _stopLiveFeed() {
    if (this._liveTimer) {
      clearInterval(this._liveTimer);
      this._liveTimer = null;
      const btn = document.getElementById('gs-pull-live');
      if (btn) { btn.textContent = '▶ Live P5 Feed'; btn.classList.remove('live'); }
      this._setStatus('idle');
    }
  }

  // ─── Outputs (glitcher → parent) ───────────────────────────────────

  _withExport(cb) {
    const frame = document.getElementById(this.IFRAME);
    if (!frame || !frame.contentWindow) { this._setStatus('iframe not ready', 'err'); return; }
    this._exportOnReturn = cb;
    frame.contentWindow.postMessage({ type: 'request-export', mime: 'image/png' }, '*');
    // Safety timeout
    setTimeout(() => {
      if (this._exportOnReturn === cb) {
        this._exportOnReturn = null;
        this._setStatus('export timeout', 'err');
      }
    }, 5000);
  }

  _sendToOutput() {
    this._withExport((dataUrl) => {
      const result    = document.getElementById('studio-result');
      const contentEl = document.getElementById('studio-result-content')
                     || document.getElementById('studio-content');
      if (!result) { this._setStatus('no output panel', 'err'); return; }
      const img = document.createElement('img');
      img.src = dataUrl;
      img.className = 'studio-result-image';
      img.style.maxWidth = '100%';
      const target = contentEl || result;
      target.innerHTML = '';
      target.appendChild(img);
      result.classList.add('active');
      this._setStatus('sent to output', 'ok');
    });
  }

  _downloadCanvas() {
    this._withExport((dataUrl) => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'glitcher-' + Date.now() + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      this._setStatus('downloaded', 'ok');
    });
  }

  async _saveAsArtifact() {
    this._withExport(async (dataUrl) => {
      const filename = 'glitcher-' + Date.now() + '.png';
      try {
        const res = await fetch('/chatroom/api/artifacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: filename,
            language: 'image',
            content: dataUrl,
            agentName: 'Glitcher Studio'
          })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        this._setStatus('saved as artifact', 'ok');
      } catch (e) {
        // Fallback: trigger download instead
        this._setStatus('artifact save failed → downloaded', 'err');
        const a = document.createElement('a');
        a.href = dataUrl; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
      }
    });
  }

  // ─── Status ────────────────────────────────────────────────────────

  _setStatus(text, cls) {
    const el = document.getElementById('gs-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'gs-status' + (cls ? ' ' + cls : '');
  }
}

// Global initializer — called from studio-integration.js after createModal becomes available
window.GlitcherStudio = GlitcherStudio;
