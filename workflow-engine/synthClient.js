/**
 * Synthograsizer API Client
 * HTTP client wrapping the Synthograsizer FastAPI (localhost:8001).
 * Uses native fetch (Node 18+). Exported as a singleton.
 *
 * Actual API routes confirmed from backend/server.py:
 *   GET  /api/health
 *   POST /api/generate/text
 *   POST /api/generate/image
 *   POST /api/generate/video
 *   POST /api/generate/template   (modes: text|image|hybrid|remix|story|workflow)
 *   POST /api/generate/narrative
 *   POST /api/generate/smart-transform
 *   POST /api/analyze/image-to-prompt
 *   POST /api/video/combine
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:8001';
const DEFAULT_TIMEOUT_MS = 30_000;
const VIDEO_TIMEOUT_MS = 120_000;
const HEALTH_CACHE_MS = 30_000;

class SynthClient {
  constructor(baseUrl) {
    this._baseUrl = baseUrl || process.env.SYNTH_BACKEND_URL || DEFAULT_BASE_URL;
    this._healthCache = null;       // { result, at }
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  /**
   * Fetch with timeout + optional 503 retry.
   */
  async _fetch(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const url = `${this._baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);

      // Retry once on 503 (service temporarily unavailable)
      if (res.status === 503) {
        await new Promise(r => setTimeout(r, 2000));
        const controller2 = new AbortController();
        const timer2 = setTimeout(() => controller2.abort(), timeoutMs);
        try {
          const res2 = await fetch(url, { ...options, signal: controller2.signal });
          clearTimeout(timer2);
          return res2;
        } catch (err) {
          clearTimeout(timer2);
          throw err;
        }
      }

      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  async _post(path, body, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const res = await this._fetch(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      timeoutMs
    );

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.detail || `Synthograsizer ${path} failed: HTTP ${res.status}`);
    }
    return json;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * GET /api/health — result cached for 30 s.
   * @returns {Promise<{status: string, api_key_configured: boolean}>}
   */
  async healthCheck() {
    const now = Date.now();
    if (this._healthCache && now - this._healthCache.at < HEALTH_CACHE_MS) {
      return this._healthCache.result;
    }

    const res = await this._fetch('/api/health', { method: 'GET' });
    const json = await res.json().catch(() => ({ status: 'error' }));
    this._healthCache = { result: json, at: now };
    return json;
  }

  /**
   * POST /api/generate/image
   * @param {string} prompt
   * @param {{ aspect_ratio?, negative_prompt?, style?, num_images? }} options
   */
  async generateImage(prompt, options = {}) {
    const body = {
      prompt,
      model: 'gemini-3.1-flash-image-preview',
      aspect_ratio: options.aspect_ratio ?? '1:1',
    };
    if (options.negative_prompt) body.negative_prompt = options.negative_prompt;
    if (options.num_images)      body.image_count = Number(options.num_images);
    // 'style' has no direct server param; fold it into the prompt if provided
    if (options.style) body.prompt = `${prompt} — style: ${options.style}`;

    return this._post('/api/generate/image', body);
  }

  /**
   * POST /api/generate/video
   * @param {string} prompt
   * @param {{ aspect_ratio?, duration?, negative_prompt? }} options
   */
  async generateVideo(prompt, options = {}) {
    const body = { prompt };
    if (options.aspect_ratio) body.aspect_ratio = options.aspect_ratio;
    if (options.duration)     body.duration = Number(options.duration);
    // negative_prompt is not a server param for video; ignored gracefully

    return this._post('/api/generate/video', body, VIDEO_TIMEOUT_MS);
  }

  /**
   * POST /api/generate/text
   * @param {string} prompt
   */
  async generateText(prompt) {
    return this._post('/api/generate/text', { prompt });
  }

  /**
   * POST /api/generate/text/stream
   * Streams response body incrementally, calling onChunk(text) for each chunk.
   * @param {string} prompt
   * @param {(chunk: string) => void} onChunk
   * @returns {Promise<string>} full accumulated text
   */
  async generateTextStream(prompt, onChunk) {
    const url = `${this._baseUrl}/api/generate/text/stream`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`Text stream failed: HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          fullText += chunk;
          onChunk(chunk);
        }
      }
      return fullText;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /**
   * POST /api/generate/template
   * modes: text | image | hybrid | story | workflow | remix (via current_template)
   * @param {string} description
   * @param {string} mode
   */
  async generateTemplate(description, mode = 'text') {
    return this._post('/api/generate/template', { prompt: description, mode });
  }

  /**
   * POST /api/generate/template  (mode=remix)
   * @param {Object} template  - current template JSON
   * @param {string} instructions
   */
  async remixTemplate(template, instructions) {
    return this._post('/api/generate/template', {
      prompt: instructions,
      mode: 'remix',
      current_template: template,
    });
  }

  /**
   * POST /api/generate/narrative
   * @param {string[]} descriptions
   * @param {string} mode  story | documentary | abstract | dream
   */
  async generateNarrative(descriptions, mode = 'story') {
    return this._post('/api/generate/narrative', {
      descriptions,
      user_prompt: '',
      mode,
    });
  }

  /**
   * POST /api/analyze/image-to-prompt
   * @param {string} imageBase64  raw base64 or data-URI
   */
  async analyzeImage(imageBase64) {
    return this._post('/api/analyze/image-to-prompt', { image: imageBase64 });
  }

  /**
   * POST /api/generate/smart-transform
   * @param {string} imageBase64  raw base64 or data-URI
   * @param {string} intent
   */
  async smartTransform(imageBase64, intent) {
    return this._post('/api/generate/smart-transform', {
      input_image: imageBase64,
      user_intent: intent,
    });
  }

  /**
   * POST /api/video/combine
   * @param {string[]} videoList  array of base64-encoded MP4s
   */
  async combineVideos(videoList) {
    return this._post('/api/video/combine', { videos: videoList }, VIDEO_TIMEOUT_MS);
  }
}

// Singleton export
export const synthClient = new SynthClient();
