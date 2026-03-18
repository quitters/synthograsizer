/**
 * ScopeConnector — unified connection manager for Synthograsizer ↔ Scope.
 *
 * Coordinates three communication channels:
 *   1. OSC  — prompts + param values (via backend UDP bridge)
 *   2. WebRTC — live canvas video stream (via ScopeVideoClient)
 *   3. Spout — display window → OBS → Spout (documented setup, no code needed)
 *
 * Auto-discovers Scope on startup by probing /health.  Polls every 10s to
 * detect Scope coming online / going offline.  Emits status events for the UI.
 */

const SCOPE_CONNECTOR_STORAGE = 'synthograsizerScopeConnectorV1';
const HEALTH_POLL_MS = 10_000;
const DISCOVERY_TIMEOUT_MS = 3000;

export class ScopeConnector {
  /**
   * @param {object} deps
   * @param {import('./osc-controller.js').OSCController} deps.osc
   * @param {import('./scope-video-client.js').ScopeVideoClient} deps.video
   * @param {Function} [deps.onStatusChange]  (status, detail) => void
   */
  constructor({ osc, video, onStatusChange }) {
    this.osc = osc;
    this.video = video;
    this.onStatusChange = onStatusChange || (() => {});

    // State
    this.scopeUrl = 'http://127.0.0.1:8000';
    this.healthy = false;
    this.autoConnect = true;     // auto-enable OSC when Scope is found
    this._pollTimer = null;
    this._wasHealthy = false;    // track transitions

    this._loadConfig();
  }

  // ── Public API ──────────────────────────────────────────────

  /** Start health polling.  Call once after UI is ready. */
  async start() {
    await this.discover();
    this._startPolling();
  }

  /** Stop health polling. */
  stop() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  /**
   * Probe Scope's health endpoint and auto-configure OSC if found.
   * Returns { healthy, scopeUrl, oscHost, oscPort }.
   */
  async discover(scopeUrl) {
    const url = scopeUrl || this.scopeUrl;

    try {
      const res = await fetch('/api/scope/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopeUrl: url }),
        signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = await res.json();

      this.healthy = info.healthy;
      this.scopeUrl = info.scopeUrl || url;

      if (info.healthy && !this._wasHealthy) {
        // Scope just came online — auto-configure
        this._onScopeFound(info);
      } else if (!info.healthy && this._wasHealthy) {
        // Scope went offline
        this._onScopeLost();
      }

      this._wasHealthy = info.healthy;
      this._saveConfig();
      return info;
    } catch (err) {
      if (this._wasHealthy) this._onScopeLost();
      this.healthy = false;
      this._wasHealthy = false;
      return { healthy: false, scopeUrl: url };
    }
  }

  /** Update the Scope URL and re-discover. */
  async setScopeUrl(url) {
    this.scopeUrl = (url || 'http://127.0.0.1:8000').replace(/\/$/, '');
    this.video.setScopeUrl(this.scopeUrl);
    this._saveConfig();
    return this.discover(this.scopeUrl);
  }

  /** Get a display URL for OBS Browser Source. */
  getDisplayUrl() {
    return `${window.location.origin}/synthograsizer/display.html`;
  }

  /** Copy the display URL to clipboard. */
  async copyDisplayUrl() {
    const url = this.getDisplayUrl();
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }

  /** Summary for the UI. */
  getStatus() {
    return {
      healthy: this.healthy,
      scopeUrl: this.scopeUrl,
      oscEnabled: this.osc.enabled,
      oscPort: this.osc.port,
      streaming: this.video.isStreaming,
      displayUrl: this.getDisplayUrl(),
    };
  }

  // ── Private ─────────────────────────────────────────────────

  _onScopeFound(info) {
    console.log('[ScopeConnector] Scope found at', info.scopeUrl);

    // Auto-configure OSC
    if (this.autoConnect) {
      this.osc.setEnabled(true);
      // Ensure OSC target port matches Scope's expected port
      if (this.osc.port !== info.oscPort) {
        this.osc.updateTarget(info.oscHost, info.oscPort);
      }
    }

    // Sync video client URL
    this.video.setScopeUrl(info.scopeUrl);

    this.onStatusChange('connected', info.scopeUrl);
  }

  _onScopeLost() {
    console.log('[ScopeConnector] Scope went offline');
    this.onStatusChange('disconnected', 'Scope unreachable');
  }

  _startPolling() {
    this.stop();
    this._pollTimer = setInterval(() => this.discover(), HEALTH_POLL_MS);
  }

  _saveConfig() {
    try {
      localStorage.setItem(SCOPE_CONNECTOR_STORAGE, JSON.stringify({
        scopeUrl: this.scopeUrl,
        autoConnect: this.autoConnect,
      }));
    } catch {}
  }

  _loadConfig() {
    try {
      const raw = localStorage.getItem(SCOPE_CONNECTOR_STORAGE);
      if (!raw) return;
      const cfg = JSON.parse(raw);
      if (cfg.scopeUrl) this.scopeUrl = cfg.scopeUrl;
      if (cfg.autoConnect !== undefined) this.autoConnect = cfg.autoConnect;
    } catch {}
  }
}
