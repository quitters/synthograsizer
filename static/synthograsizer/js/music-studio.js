/**
 * Music Studio Client — Lyria RealTime WebSocket + Web Audio API playback.
 *
 * Connects to the backend's /ws/music WebSocket endpoint, receives raw PCM
 * audio chunks (16-bit signed, 48 kHz stereo), decodes them into AudioBuffers,
 * and schedules gapless playback through the Web Audio API.
 *
 * Supports auto-sync: when enabled, hooks into the Synthograsizer's
 * generateOutput() to send crossfaded prompt updates in real time.
 */

class MusicStudioClient {

    constructor(app) {
        /** @type {SynthograsizerSmall} */
        this.app = app;

        /** @type {WebSocket|null} */
        this.ws = null;

        /** @type {AudioContext|null} */
        this.audioCtx = null;

        /** @type {AnalyserNode|null} */
        this.analyser = null;

        /** @type {GainNode|null} */
        this.gainNode = null;

        /** @type {number} Scheduled time for next buffer */
        this.nextPlayTime = 0;

        /** @type {string} disconnected | connecting | connected | playing | paused | stopped */
        this.status = 'disconnected';

        /** @type {boolean} */
        this.autoSyncEnabled = false;

        /** @type {number|null} Debounce timer for auto-sync */
        this._syncTimer = null;

        /** @type {number|null} RAF id for level meter */
        this._meterRAF = null;

        /** @type {HTMLCanvasElement|null} */
        this._meterCanvas = null;

        /** @type {CanvasRenderingContext2D|null} */
        this._meterCtx = null;

        /** @type {Array<{text:string, weight:number}>} Last prompts sent */
        this.currentPrompts = [];

        /** @type {Function|null} Original generateOutput reference for unhooking */
        this._originalGenerateOutput = null;

        /** @type {object} Current generation config */
        this.currentConfig = {};
    }

    // ── Connection ──────────────────────────────────────────────────────

    connect() {
        if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;

        this._setStatus('connecting');

        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${proto}//${location.host}/ws/music`);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            console.log('[MusicStudio] WebSocket connected');
        };

        this.ws.onmessage = (evt) => {
            if (evt.data instanceof ArrayBuffer) {
                this._handleAudioChunk(evt.data);
            } else {
                this._handleControlMessage(evt.data);
            }
        };

        this.ws.onerror = (err) => {
            console.error('[MusicStudio] WebSocket error:', err);
        };

        this.ws.onclose = () => {
            console.log('[MusicStudio] WebSocket closed');
            this._setStatus('disconnected');
            this._stopMeter();
        };
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this._stopAudio();
        this._setStatus('disconnected');
    }

    // ── Playback Control ────────────────────────────────────────────────

    play() {
        this._ensureAudioContext();
        this._send({ action: 'play' });
    }

    pause() {
        this._send({ action: 'pause' });
    }

    stop() {
        this._send({ action: 'stop' });
        this._stopAudio();
    }

    // ── Prompts ─────────────────────────────────────────────────────────

    setPrompts(prompts) {
        this.currentPrompts = prompts;
        this._send({ action: 'set_prompts', prompts });
    }

    crossfadePrompts(newPrompts, steps = 5, duration = 1.5) {
        this._send({
            action: 'crossfade_prompts',
            old_prompts: this.currentPrompts,
            new_prompts: newPrompts,
            steps,
            duration,
        });
        this.currentPrompts = newPrompts;
    }

    // ── Config ──────────────────────────────────────────────────────────

    setConfig(config) {
        this.currentConfig = { ...this.currentConfig, ...config };
        this._send({ action: 'set_config', config });
    }

    resetContext() {
        this._send({ action: 'reset_context' });
    }

    // ── Auto-Sync ───────────────────────────────────────────────────────

    enableAutoSync(enabled) {
        this.autoSyncEnabled = enabled;

        if (enabled && this.app) {
            // Wrap generateOutput to intercept prompt changes
            if (!this._originalGenerateOutput) {
                this._originalGenerateOutput = this.app.generateOutput.bind(this.app);
                this.app.generateOutput = (...args) => {
                    this._originalGenerateOutput(...args);
                    this._onPromptChanged();
                };
            }
        } else if (!enabled && this._originalGenerateOutput) {
            // Restore original
            this.app.generateOutput = this._originalGenerateOutput;
            this._originalGenerateOutput = null;
        }
    }

    _onPromptChanged() {
        // Allow sync whenever the WebSocket is actually open (not only when status === 'playing'),
        // because Lyria sends states like 'connected', 'started', etc. before 'playing'.
        const wsLive = this.ws && this.ws.readyState === WebSocket.OPEN;
        if (!this.autoSyncEnabled || !wsLive) return;

        // Debounce — 500ms after last change (avoids flooding while knobs are turning)
        clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(() => {
            const promptText = this.app?.getCurrentPromptText?.() || '';
            if (!promptText) return;

            console.log('[MusicStudio] Auto-sync → crossfade to:', promptText.slice(0, 60));
            const newPrompts = [{ text: promptText, weight: 1.0 }];
            this.crossfadePrompts(newPrompts);
        }, 500);
    }

    // ── Audio Playback ──────────────────────────────────────────────────

    _ensureAudioContext() {
        if (this.audioCtx) {
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            return;
        }

        this.audioCtx = new AudioContext({ sampleRate: 48000, latencyHint: 'playback' });
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.8;

        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = 1.0;

        this.analyser.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);

        this.nextPlayTime = 0;
    }

    _handleAudioChunk(arrayBuffer) {
        if (!this.audioCtx) return;

        const int16 = new Int16Array(arrayBuffer);
        const numFrames = int16.length / 2; // stereo interleaved

        if (numFrames <= 0) return;

        const audioBuffer = this.audioCtx.createBuffer(2, numFrames, 48000);
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);

        for (let i = 0; i < numFrames; i++) {
            left[i] = int16[i * 2] / 32768;
            right[i] = int16[i * 2 + 1] / 32768;
        }

        // Schedule for gapless playback
        const source = this.audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.analyser);

        const now = this.audioCtx.currentTime;
        const startTime = Math.max(now, this.nextPlayTime);
        source.start(startTime);
        this.nextPlayTime = startTime + audioBuffer.duration;
    }

    _handleControlMessage(raw) {
        try {
            const msg = JSON.parse(raw);

            if (msg.status) {
                this._setStatus(msg.status);
                console.log('[MusicStudio] Status:', msg.status);
            }

            if (msg.error) {
                console.error('[MusicStudio] Error:', msg.error);
                this._dispatchEvent('music-error', { error: msg.error });
            }
        } catch (e) {
            console.warn('[MusicStudio] Non-JSON message:', raw);
        }
    }

    _stopAudio() {
        // Order matters: cancel the meter RAF FIRST, then null out the
        // analyser, then close the context. If we close first, the next RAF
        // callback can fire against a closed AudioContext and throw
        // InvalidStateError when it calls getByteFrequencyData.
        this._stopMeter();
        this.analyser = null;
        this.gainNode = null;
        if (this.audioCtx) {
            this.audioCtx.close().catch(() => {});
            this.audioCtx = null;
        }
        this.nextPlayTime = 0;
    }

    // ── Level Meter ─────────────────────────────────────────────────────

    attachMeter(canvas) {
        this._meterCanvas = canvas;
        this._meterCtx = canvas.getContext('2d');
        this._startMeter();
    }

    _startMeter() {
        if (this._meterRAF) return;
        this._drawMeter();
    }

    _stopMeter() {
        if (this._meterRAF) {
            cancelAnimationFrame(this._meterRAF);
            this._meterRAF = null;
        }
        if (this._meterCtx && this._meterCanvas) {
            this._meterCtx.clearRect(0, 0, this._meterCanvas.width, this._meterCanvas.height);
        }
    }

    _drawMeter() {
        // Bail before re-scheduling if any of the resources we'd touch are
        // gone. Without this guard, _stopAudio()'s teardown can race with an
        // already-queued RAF callback that then calls getByteFrequencyData
        // on a freed analyser.
        if (!this.analyser || !this._meterCtx || !this._meterCanvas) {
            this._meterRAF = null;
            return;
        }
        this._meterRAF = requestAnimationFrame(() => this._drawMeter());

        const canvas = this._meterCanvas;
        const ctx = this._meterCtx;
        const bufLen = this.analyser.frequencyBinCount;
        const data = new Uint8Array(bufLen);
        this.analyser.getByteFrequencyData(data);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = canvas.width / bufLen;
        for (let i = 0; i < bufLen; i++) {
            const val = data[i] / 255;
            const h = val * canvas.height;

            // Gradient: green → yellow → red
            const hue = 120 - val * 120;
            ctx.fillStyle = `hsl(${hue}, 80%, ${40 + val * 30}%)`;
            ctx.fillRect(i * barWidth, canvas.height - h, barWidth - 1, h);
        }
    }

    // ── Volume ──────────────────────────────────────────────────────────

    setVolume(value) {
        if (this.gainNode) {
            this.gainNode.gain.value = Math.max(0, Math.min(1, value));
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    _send(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        }
    }

    _setStatus(status) {
        this.status = status;
        this._dispatchEvent('music-status', { status });

        // Start/stop meter based on playback state
        if (status === 'playing') {
            this._startMeter();
        } else if (status === 'stopped' || status === 'disconnected') {
            this._stopMeter();
        }
    }

    _dispatchEvent(name, detail) {
        window.dispatchEvent(new CustomEvent(name, { detail }));
    }

    destroy() {
        this.enableAutoSync(false);
        this.disconnect();
    }
}

// Expose globally
window.MusicStudioClient = MusicStudioClient;
