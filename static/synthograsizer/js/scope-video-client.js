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
 * Once streaming, sendPromptUpdate(text) pushes live prompt changes through
 * the WebRTC data channel (Scope's native, lower-latency path for in-session
 * prompt updates — replaces/supplements the OSC path).
 *
 * Configuration is persisted in localStorage under STORAGE_KEY.
 */

const STORAGE_KEY = 'synthograsizerScopeVideoV1';

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

    this._loadConfig();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

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
   * Start a live WebRTC video-to-video session, streaming `canvas` frames into
   * Scope's diffusion pipeline.  If a session is already active it is stopped
   * first.
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
        this.onStatusChange('streaming');
        console.log('[ScopeVideo] data channel open');
      };

      this._dataChannel.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'stream_stopped') {
            console.warn('[ScopeVideo] stream stopped by Scope:', msg.error_message);
            this._cleanup();
            this.onStatusChange('stopped', msg.error_message || '');
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

      // 6. Connection monitoring
      this._pc.onconnectionstatechange = () => {
        const state = this._pc?.connectionState;
        if (state === 'failed' || state === 'disconnected') {
          this.onStatusChange('disconnected');
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

  /** Gracefully disconnect the live WebRTC stream. */
  async stopStream() {
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
   */
  sendPromptUpdate(prompt, transition = false) {
    if (!this._dataChannel || this._dataChannel.readyState !== 'open') return;
    if (!prompt) return;

    const msg = transition
      ? { transition: { target_prompts: [{ text: prompt, weight: 1.0 }], num_steps: 8 } }
      : { prompts: [{ text: prompt, weight: 1.0 }] };

    try {
      this._dataChannel.send(JSON.stringify(msg));
    } catch (e) {
      console.warn('[ScopeVideo] sendPromptUpdate failed', e);
    }
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
}
