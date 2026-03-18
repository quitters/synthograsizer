/**
 * ScopeVideoClient
 *
 * Two ways to send visual data from the Synthograsizer p5.js canvas to
 * Daydream Scope's HTTP / WebRTC API:
 *
 *  1. sendFrame(canvas)          — POST a single PNG snapshot to Scope's
 *                                  /api/v1/assets endpoint for use as VACE
 *                                  reference conditioning.
 *
 *  2. startStream(canvas, prompt) — establish a live WebRTC video-to-video
 *                                   pipeline from the p5.js canvas to Scope's
 *                                   diffusion pipeline.
 *
 * Once streaming, the following data-channel controls are available:
 *  - sendPromptUpdate(text, transition)  push live prompt changes
 *  - pause()                             freeze generation without disconnecting
 *  - resume()                            unfreeze generation
 *  - resetCache()                        clear frame cache to fix visual drift
 *  - pushImageToScope(base64)            upload image as VACE reference
 *
 * Reliability features:
 *  - checkHealth()      verify Scope is reachable before streaming
 *  - auto-reconnect     on unexpected stream_stopped, retries up to MAX_RECONNECT_ATTEMPTS
 *
 * Configuration is persisted in localStorage under STORAGE_KEY.
 */

const STORAGE_KEY = 'synthograsizerScopeVideoV1';
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;
const CONNECTION_TIMEOUT_MS = 10_000;

export class ScopeVideoClient {
  /**
   * @param {{ onStatusChange?: Function }} callbacks
   */
  constructor(callbacks = {}) {
    this.onStatusChange = callbacks.onStatusChange || (() => {});

    // Config (persisted)
    this.scopeUrl = 'http://127.0.0.1:7860';
    this.fps = 15;
    this.streamEnabled = false;

    // WebRTC state
    this._pc = null;           // RTCPeerConnection
    this._dataChannel = null;  // RTCDataChannel "parameters"
    this._sessionId = null;    // Scope session ID from offer response
    this._mediaStream = null;  // canvas.captureStream() MediaStream

    // Reconnect state
    this._reconnectCanvas = null;
    this._reconnectPrompt = '';
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._userStopped = false;  // true when user explicitly calls stopStream()

    this._loadConfig();
    this._autoDetectScopeUrl();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Check whether Scope is reachable by hitting its /health endpoint.
   * Returns true if healthy, false otherwise.
   */
  async checkHealth() {
    try {
      const res = await fetch(`${this.scopeUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Capture one PNG frame from `canvas` and POST it to Scope's asset endpoint.
   * Scope will make the uploaded image available as a VACE reference/conditioning
   * input for its diffusion pipeline.
   *
   * @param {HTMLCanvasElement} canvas
   */
  async sendFrame(canvas) {
    if (!canvas) {
      this.onStatusChange('error', 'No canvas available');
      return;
    }

    // Grab a PNG blob from the canvas
    let blob;
    try {
      blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png');
      });
    } catch (e) {
      this.onStatusChange('error', `Capture failed: ${e.message}`);
      return;
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(11, 19);
    const filename = `synth-frame-${ts}.png`;

    try {
      const url = `${this.scopeUrl}/api/v1/assets?filename=${encodeURIComponent(filename)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: blob,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.onStatusChange('frame-sent', filename);
      console.log('[ScopeVideo] frame uploaded', data);
    } catch (e) {
      this.onStatusChange('error', `Upload failed: ${e.message}`);
      console.warn('[ScopeVideo] sendFrame error', e);
    }
  }

  /**
   * Save a base64-encoded image to Scope's local assets directory and push it
   * as the active VACE reference image.
   *
   * Routes the file write through the Synthograsizer backend to bypass Scope's
   * cloud-mode CDN token requirement. After saving:
   *  - If streaming via WebRTC: sends vace_ref_images via the data channel.
   *  - If not streaming: starts a minimal text-mode WebRTC offer so Scope
   *    immediately uses the reference image in its generation pipeline.
   *
   * @param {string} base64  — raw base64 or full data-URL
   * @returns {Promise<string|null>}  — asset filename on success, null on failure
   */
  async pushImageToScope(base64) {
    const b64 = base64.replace(/^data:[^;]+;base64,/, '');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(11, 19);
    const filename = `synth-ref-${ts}.png`;

    // Save via Synthograsizer backend — avoids Scope's cloud CDN auth requirement
    let path = null;
    try {
      const res = await fetch('/api/scope/save-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: b64, filename }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      path = data.path || filename;
      console.log('[ScopeVideo] reference image saved to Scope assets:', path);
    } catch (e) {
      this.onStatusChange('error', `Save failed: ${e.message}`);
      console.warn('[ScopeVideo] pushImageToScope save error', e);
      return null;
    }

    // Deliver the reference image to Scope's active pipeline
    if (this.isStreaming && this._dataChannel?.readyState === 'open') {
      // Fast path: push via open data channel
      try {
        this._dataChannel.send(JSON.stringify({
          vace_ref_images: [path],
          vace_context_scale: 1.0,
        }));
        console.log('[ScopeVideo] vace_ref_images pushed via data channel');
      } catch (e) {
        console.warn('[ScopeVideo] data channel send failed', e);
      }
    } else {
      // No active stream — open a text-mode WebRTC offer with the reference image
      // as initialParameters so Scope's pipeline picks it up immediately.
      await this._pushRefViaOffer(path);
    }

    this.onStatusChange('ref-sent', filename);
    return path;
  }

  /**
   * Open a minimal WebRTC connection to Scope in text-input mode, supplying
   * vace_ref_images as initialParameters.  Keeps the connection alive so Scope
   * continues using the reference image; replaces any previous ref-only session.
   *
   * @param {string} path  — asset filename returned by /api/scope/save-asset
   */
  async _pushRefViaOffer(path) {
    // Close any stale reference-only session
    if (this._refPc) {
      try { this._refPc.close(); } catch (_) {}
      this._refPc = null;
    }

    try {
      const iceRes = await fetch(`${this.scopeUrl}/api/v1/webrtc/ice-servers`,
        { signal: AbortSignal.timeout(5000) });
      if (!iceRes.ok) throw new Error(`ICE servers: HTTP ${iceRes.status}`);
      const { iceServers } = await iceRes.json();

      const pc = new RTCPeerConnection({ iceServers });
      const dc = pc.createDataChannel('parameters', { ordered: true });

      dc.onopen = () => {
        try {
          dc.send(JSON.stringify({ vace_ref_images: [path], vace_context_scale: 1.0 }));
          console.log('[ScopeVideo] ref-only session: vace_ref_images sent via data channel');
        } catch (e) {
          console.warn('[ScopeVideo] ref-only data channel send failed', e);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const offerRes = await fetch(`${this.scopeUrl}/api/v1/webrtc/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdp: pc.localDescription.sdp,
          type: pc.localDescription.type,
          initialParameters: {
            input_mode: 'text',
            vace_ref_images: [path],
            vace_context_scale: 1.0,
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!offerRes.ok) throw new Error(`Offer: HTTP ${offerRes.status}`);

      const answer = await offerRes.json();
      await pc.setRemoteDescription({ type: answer.type, sdp: answer.sdp });

      this._refPc = pc;
      console.log('[ScopeVideo] ref-only text-mode session established');
    } catch (e) {
      console.warn('[ScopeVideo] _pushRefViaOffer failed:', e.message);
    }
  }

  /**
   * Start a live WebRTC video-to-video session, streaming `canvas` frames into
   * Scope's diffusion pipeline.  If a session is already active it is stopped
   * first.
   *
   * Performs a /health check before attempting connection. Stores canvas and
   * prompt references for auto-reconnect on unexpected disconnection.
   *
   * @param {HTMLCanvasElement} canvas
   * @param {string}            initialPrompt  — Scope prompt at connect time
   */
  async startStream(canvas, initialPrompt = '') {
    if (this._pc) await this.stopStream();
    if (!canvas) {
      this.onStatusChange('error', 'No canvas to stream');
      return;
    }

    // Health check — confirm Scope is reachable before committing to WebRTC
    this.onStatusChange('connecting', 'Checking Scope…');
    const healthy = await this.checkHealth();
    if (!healthy) {
      this.onStatusChange('error', `Scope unreachable at ${this.scopeUrl}`);
      return;
    }

    // Store for auto-reconnect
    this._reconnectCanvas = canvas;
    this._reconnectPrompt = initialPrompt;
    this._userStopped = false;

    this.onStatusChange('connecting');

    try {
      // 1. ICE server config
      const iceRes = await fetch(`${this.scopeUrl}/api/v1/webrtc/ice-servers`);
      if (!iceRes.ok) throw new Error(`ICE servers: HTTP ${iceRes.status}`);
      const { iceServers } = await iceRes.json();

      // 2. Peer connection
      this._pc = new RTCPeerConnection({ iceServers });

      const queuedCandidates = [];
      let sessionId = null;

      // 3. Data channel (Scope parameter updates)
      this._dataChannel = this._pc.createDataChannel('parameters', { ordered: true });

      this._dataChannel.onopen = () => {
        this._reconnectAttempts = 0;  // successful connection resets counter
        this.onStatusChange('streaming');
        console.log('[ScopeVideo] data channel open');
      };

      this._dataChannel.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'stream_stopped') {
            const reason = msg.error_message || '';
            console.warn('[ScopeVideo] stream stopped by Scope:', reason);
            this._cleanup();
            if (this._userStopped) {
              this.onStatusChange('stopped', reason);
            } else {
              this._scheduleReconnect(reason);
            }
          }
        } catch { /* ignore non-JSON messages */ }
      };

      // 4. Add canvas video track
      this._mediaStream = canvas.captureStream(this.fps);
      this._mediaStream.getTracks().forEach(track => {
        if (track.kind === 'video') this._pc.addTrack(track, this._mediaStream);
      });

      // 5. Receive Scope's processed video output
      this._pc.ontrack = (event) => {
        if (event.streams?.[0]) {
          const videoEl = document.getElementById('scope-video-output');
          if (videoEl) {
            videoEl.srcObject = event.streams[0];
            videoEl.play().catch(() => {});
          }
        }
      };

      // 6. Connection monitoring — trigger reconnect on unexpected drop
      this._pc.onconnectionstatechange = () => {
        const state = this._pc?.connectionState;
        if (state === 'failed' || state === 'disconnected') {
          if (!this._userStopped) {
            this._cleanup();
            this._scheduleReconnect(`Connection ${state}`);
          } else {
            this.onStatusChange('disconnected');
          }
        }
      };

      // 7. ICE candidates
      this._pc.onicecandidate = async (event) => {
        if (!event.candidate) return;
        if (sessionId) {
          await this._sendIceCandidate(sessionId, event.candidate);
        } else {
          queuedCandidates.push(event.candidate);
        }
      };

      // 8. SDP offer → Scope
      const offer = await this._pc.createOffer();
      await this._pc.setLocalDescription(offer);

      const offerRes = await fetch(`${this.scopeUrl}/api/v1/webrtc/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdp: this._pc.localDescription.sdp,
          type: this._pc.localDescription.type,
          initialParameters: {
            input_mode: 'video',
            prompts: [{ text: initialPrompt || 'generative art', weight: 1.0 }],
            denoising_step_list: [700, 500],
          },
        }),
        signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
      });
      if (!offerRes.ok) throw new Error(`Offer: HTTP ${offerRes.status}`);

      const answer = await offerRes.json();
      sessionId = answer.sessionId;
      this._sessionId = sessionId;

      // 9. Remote description
      await this._pc.setRemoteDescription({ type: answer.type, sdp: answer.sdp });

      // 10. Flush any queued candidates
      for (const c of queuedCandidates) await this._sendIceCandidate(sessionId, c);

    } catch (e) {
      console.warn('[ScopeVideo] startStream failed', e);
      this.onStatusChange('error', e.message);
      this._cleanup();
    }
  }

  /** Gracefully disconnect the live WebRTC stream (cancels any pending reconnect). */
  async stopStream() {
    this._userStopped = true;
    this._cancelReconnect();
    this._cleanup();
    this.onStatusChange('stopped');
  }

  /**
   * Send a live prompt update through the WebRTC data channel.
   * This is the fastest path for in-session prompt changes (no UDP hop).
   * Only works while a stream is active.
   *
   * @param {string}  prompt
   * @param {boolean} transition — use Scope's smooth N-step transition (default false)
   * @returns {boolean} true if sent via data channel
   */
  sendPromptUpdate(prompt, transition = false) {
    if (!prompt) return false;

    const msg = transition
      ? { transition: { target_prompts: [{ text: prompt, weight: 1.0 }], num_steps: 8 } }
      : { prompts: [{ text: prompt, weight: 1.0 }] };

    return this._sendDataChannelMsg(msg);
  }

  /**
   * Freeze Scope's generation without disconnecting the WebRTC session.
   * Call resume() to unfreeze.
   */
  pause() {
    if (!this.isStreaming) return;
    this._sendDataChannelMsg({ paused: true });
    this.onStatusChange('paused');
    console.log('[ScopeVideo] paused');
  }

  /**
   * Unfreeze Scope's generation after a pause() call.
   */
  resume() {
    if (!this.isStreaming) return;
    this._sendDataChannelMsg({ paused: false });
    this.onStatusChange('streaming');
    console.log('[ScopeVideo] resumed');
  }

  /**
   * Clear Scope's frame cache for one cycle.  Use this when you notice
   * visual drift or artifacts accumulating in the output stream.
   */
  resetCache() {
    if (!this.isStreaming) return;
    this._sendDataChannelMsg({ reset_cache: true });
    this.onStatusChange('cache-reset');
    console.log('[ScopeVideo] cache reset sent');
  }

  /** True if the WebRTC data channel is open (streaming is live). */
  get isStreaming() {
    return this._dataChannel?.readyState === 'open';
  }

  // ── Configuration ──────────────────────────────────────────────────────────

  setScopeUrl(url) {
    this.scopeUrl = (url || 'http://127.0.0.1:7860').replace(/\/$/, '');
    this._saveConfig();
  }

  setFps(fps) {
    this.fps = Math.max(1, Math.min(30, parseInt(fps, 10) || 15));
    this._saveConfig();
  }

  setStreamEnabled(enabled) {
    this.streamEnabled = Boolean(enabled);
    this._saveConfig();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Send a JSON message on the data channel if it is open.
   * @param {object} obj
   */
  _sendDataChannelMsg(obj) {
    if (!this._dataChannel || this._dataChannel.readyState !== 'open') return false;
    try {
      this._dataChannel.send(JSON.stringify(obj));
      return true;
    } catch (e) {
      console.warn('[ScopeVideo] data channel send failed', e);
      return false;
    }
  }

  /**
   * Schedule an auto-reconnect attempt after RECONNECT_DELAY_MS.
   * Gives up after MAX_RECONNECT_ATTEMPTS and emits 'error'.
   * @param {string} reason
   */
  _scheduleReconnect(reason) {
    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('[ScopeVideo] max reconnect attempts reached, giving up');
      this.onStatusChange('error', `Disconnected: ${reason}`);
      return;
    }
    this._reconnectAttempts++;
    const attempt = this._reconnectAttempts;
    this.onStatusChange('reconnecting', `Reconnecting (${attempt}/${MAX_RECONNECT_ATTEMPTS})…`);
    console.log(`[ScopeVideo] scheduling reconnect attempt ${attempt} in ${RECONNECT_DELAY_MS}ms`);

    this._reconnectTimer = setTimeout(async () => {
      if (this._userStopped) return;
      console.log(`[ScopeVideo] reconnect attempt ${attempt}`);
      await this.startStream(this._reconnectCanvas, this._reconnectPrompt);
    }, RECONNECT_DELAY_MS);
  }

  _cancelReconnect() {
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._reconnectAttempts = 0;
  }

  async _sendIceCandidate(sessionId, candidate) {
    try {
      await fetch(`${this.scopeUrl}/api/v1/webrtc/offer/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidates: [{
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
          }],
        }),
      });
    } catch (e) {
      console.warn('[ScopeVideo] ICE candidate send failed', e);
    }
  }

  _cleanup() {
    if (this._dataChannel) {
      try { this._dataChannel.close(); } catch { /* ignore */ }
      this._dataChannel = null;
    }
    if (this._mediaStream) {
      this._mediaStream.getTracks().forEach(t => t.stop());
      this._mediaStream = null;
    }
    if (this._pc) {
      try { this._pc.close(); } catch { /* ignore */ }
      this._pc = null;
    }
    this._sessionId = null;

    // Clear video output
    const videoEl = document.getElementById('scope-video-output');
    if (videoEl) {
      videoEl.srcObject = null;
      videoEl.parentElement?.classList.remove('sv-output-visible');
    }
  }

  _saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        scopeUrl: this.scopeUrl,
        fps: this.fps,
        streamEnabled: this.streamEnabled,
      }));
    } catch { /* ignore quota errors */ }
  }

  _loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const cfg = JSON.parse(raw);
      if (cfg.scopeUrl) this.scopeUrl = cfg.scopeUrl;
      if (cfg.fps) this.fps = cfg.fps;
      if (cfg.streamEnabled !== undefined) this.streamEnabled = cfg.streamEnabled;
    } catch { /* ignore corrupt config */ }
  }

  /**
   * When running as a Scope companion, the companion web server exposes
   * /api/scope-config with the correct Scope URL.  This fetches that
   * endpoint and applies the URL if the user hasn't manually overridden it.
   * Falls back gracefully when the endpoint doesn't exist (standalone mode).
   */
  async _autoDetectScopeUrl() {
    try {
      const res = await fetch('/api/scope-config', {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return;
      const cfg = await res.json();
      if (cfg.scopeUrl && this.scopeUrl === 'http://127.0.0.1:7860') {
        this.scopeUrl = cfg.scopeUrl;
      }
    } catch { /* not running as companion — ignore */ }
  }
}
