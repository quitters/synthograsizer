/**
 * DisplayGlitcher — Headless Glitcher wrapper for Synthograsizer display.
 *
 * Listens on the same BroadcastChannel as the main display script and
 * applies effects when `glitch-vars` messages arrive.
 *
 * Destructive effects run on STATIC IMAGES only (canvas pixel manipulation).
 * Non-destructive effects apply to ALL media via CSS/SVG filters.
 *
 * KEY FIX: The render loop is started ONCE when destructive effects first
 * activate and stays running. State updates from `glitch-vars` messages are
 * picked up on the next frame — no more re-loading the image or restarting
 * the loop on every slider change.
 */

import { PixelSortEffects } from '../../glitcher/effects/destructive/pixel-sort-effects.js';
import { SliceEffects } from '../../glitcher/effects/destructive/slice-effects.js';
import { ColorEffects } from '../../glitcher/effects/destructive/color-effects.js';
import { DirectionEffects } from '../../glitcher/effects/destructive/direction-effects.js';
import { SpiralEffects } from '../../glitcher/effects/destructive/spiral-effects.js';
import { FilterEffects } from '../../glitcher/effects/non-destructive/filter-effects.js';

class DisplayGlitcher {
  constructor(channelName) {
    this.channel = new BroadcastChannel(channelName);
    this.state = {
      enabled: false,
      paused: false,
      pixelSort: 'off',
      slice: 'off',
      direction: 'off',
      spiral: 'off',
      colorShift: 'off',
      filter: 'off',
      intensity: 50,
      speed: 2,
      swirl: 0.06,
      offset: 0,
      minLife: 90,
      maxLife: 150,
      sensitivity: 1.0
    };

    this.currentMode = 'idle'; // 'idle' | 'image' | 'video' | 'canvas'
    this.originalImgSource = null;

    // Cached pristine image bitmap — loaded ONCE per image-show, never re-fetched
    this.baseImageData = null;
    // The live glitch buffer that effects accumulate into
    this.glitchImageData = null;

    // Render loop state
    this._animationFrameId = null;
    this._loopRunning = false;
    this.frameCount = 0;
    this._lastSliceTime = 0;
    this._lastDirTime = 0;
    this._lastFilterApplyFrame = 0;  // Throttle heavy non-destructive filters

    this._initDOM();
    this._bindEvents();
    this._createSVGFilters();
  }

  // ── DOM bootstrap ────────────────────────────────────────────────────────

  _initDOM() {
    // Canvas layer for destructive image effects
    this.glitchCanvasLayer = document.createElement('div');
    this.glitchCanvasLayer.id = 'glitch-layer';
    Object.assign(this.glitchCanvasLayer.style, {
      position: 'fixed', inset: '0',
      display: 'none',
      justifyContent: 'center', alignItems: 'center',
      zIndex: '5', pointerEvents: 'none',
    });

    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      maxWidth: '100vw', maxHeight: '100vh', objectFit: 'contain',
    });
    this.glitchCanvasLayer.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    // Noise overlay
    this.noiseOverlay = document.createElement('div');
    Object.assign(this.noiseOverlay.style, {
      position: 'fixed', inset: '0',
      pointerEvents: 'none', zIndex: '90',
      opacity: '0', transition: 'opacity 0.2s',
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      mixBlendMode: 'overlay',
    });

    // Vignette overlay
    this.vignetteOverlay = document.createElement('div');
    Object.assign(this.vignetteOverlay.style, {
      position: 'fixed', inset: '0',
      pointerEvents: 'none', zIndex: '91',
      opacity: '0', transition: 'opacity 0.3s',
      background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.8) 100%)',
    });

    // Atmospheric fog overlay
    this.fogOverlay = document.createElement('div');
    Object.assign(this.fogOverlay.style, {
      position: 'fixed', inset: '0',
      pointerEvents: 'none', zIndex: '89',
      opacity: '0', transition: 'opacity 0.4s',
      background: 'linear-gradient(180deg, rgba(180,200,220,0.0) 0%, rgba(180,200,220,0.35) 50%, rgba(140,160,180,0.5) 100%)',
      backdropFilter: 'blur(0px)',
    });

    document.body.appendChild(this.glitchCanvasLayer);
    document.body.appendChild(this.noiseOverlay);
    document.body.appendChild(this.vignetteOverlay);
    document.body.appendChild(this.fogOverlay);
  }

  _createSVGFilters() {
    // Invisible SVG containing reusable filter definitions
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.style.position = 'absolute';
    svg.style.width = '0';
    svg.style.height = '0';

    svg.innerHTML = `
      <filter id="svg-emboss">
        <feConvolveMatrix order="3" kernelMatrix="-2 -1 0  -1 1 1  0 1 2" preserveAlpha="true"/>
      </filter>
      <filter id="svg-edge-detect">
        <feConvolveMatrix order="3" kernelMatrix="-1 -1 -1  -1 8 -1  -1 -1 -1" preserveAlpha="true"/>
      </filter>
      <filter id="svg-dither">
        <feComponentTransfer>
          <feFuncR type="discrete" tableValues="0 0.25 0.5 0.75 1"/>
          <feFuncG type="discrete" tableValues="0 0.25 0.5 0.75 1"/>
          <feFuncB type="discrete" tableValues="0 0.25 0.5 0.75 1"/>
        </feComponentTransfer>
      </filter>
    `;

    document.body.appendChild(svg);
  }

  _showGlitchLayer() { this.glitchCanvasLayer.style.display = 'flex'; }
  _hideGlitchLayer() { this.glitchCanvasLayer.style.display = 'none'; }

  // ── BroadcastChannel ────────────────────────────────────────────────────

  _bindEvents() {
    this.channel.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case 'glitch-vars':
          this._handleGlitchVars(msg.data);
          break;

        case 'glitch-reset':
          this._resetToBaseImage();
          break;

        case 'image-show':
          if (msg.src) {
            this.currentMode = 'image';
            this.originalImgSource = msg.src;
            this._loadBaseImage(msg.src);
            this._applyNonDestructiveCSS();
          }
          break;

        case 'video-show':
          this.currentMode = 'video';
          this._stopDestructiveLoop();
          this._hideGlitchLayer();
          this._applyNonDestructiveCSS();
          break;

        case 'p5-run':
          this.currentMode = 'canvas';
          this._stopDestructiveLoop();
          this._hideGlitchLayer();
          this._applyNonDestructiveCSS();
          break;

        case 'p5-stop':
          this.currentMode = 'idle';
          this._stopDestructiveLoop();
          this._hideGlitchLayer();
          this._applyNonDestructiveCSS();
          break;
      }
    });
  }

  /**
   * Handle glitch-vars updates WITHOUT restarting the render loop.
   * The loop reads this.state on every frame, so we just update state
   * and ensure the loop is running/stopped appropriately.
   */
  _handleGlitchVars(data) {
    this.state = data;

    // For video/p5, apply CSS-based filters only
    if (this.currentMode !== 'image') {
      this._applyNonDestructiveCSS();
      return;
    }

    const hasDestructive =
      this.state.pixelSort   !== 'off' ||
      this.state.slice       !== 'off' ||
      this.state.direction   !== 'off' ||
      this.state.spiral      !== 'off' ||
      this.state.colorShift  !== 'off';

    // Check if a canvas-level non-destructive filter is active
    const hasCanvasFilter = this.state.filter !== 'off' && this._isCanvasFilter(this.state.filter);

    const needsLoop = this.state.enabled && (hasDestructive || hasCanvasFilter) && this.baseImageData;

    if (needsLoop) {
      // Clear CSS filters for image mode — canvas handles everything
      this._setGlobalFilter('');
      this._resetOverlays();
      if (!this._loopRunning) {
        this._startDestructiveLoop();
      }
    } else if (!this.state.enabled || (!hasDestructive && !hasCanvasFilter)) {
      if (this._loopRunning) {
        this._stopDestructiveLoop();
      }
      this._hideGlitchLayer();
      const imgLayer = document.getElementById('image-layer');
      if (imgLayer) imgLayer.style.display = '';
      // Apply CSS filters for basic filter types that don't need canvas
      this._applyNonDestructiveCSS();
    }
  }

  /**
   * Check if a filter type supports canvas-level rendering via FilterEffects.
   * All new filter categories (artistic, cyberpunk, atmospheric, experimental)
   * and enhanced classic filters support canvas rendering.
   */
  _isCanvasFilter(filterType) {
    // All filters except 'off' can be rendered on canvas via FilterEffects
    // Return true for filters that benefit from canvas rendering
    const canvasFilters = [
      'vintage', 'halftone', 'motionBlur', 'noise', 'popArt',
      'vignette', 'emboss', 'edgeDetect', 'dithering',
      'liquify', 'colorGrading',
    ];
    // Also match all compound filter types (artistic-*, cyberpunk-*, etc.)
    if (filterType.includes('-')) return true;
    return canvasFilters.includes(filterType);
  }

  // ── Base Image Loading (once per image-show) ────────────────────────────

  async _loadBaseImage(src) {
    this._stopDestructiveLoop();

    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = src;
      });

      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0);

      // Cache the pristine bitmap — this is reused for resets
      this.baseImageData = this.ctx.getImageData(0, 0, img.width, img.height);
      // Start the live accumulation buffer from the pristine copy
      this.glitchImageData = this._copyImageData(this.baseImageData);

      console.log(`[DisplayGlitcher] Base image cached: ${img.width}x${img.height}`);

      // If effects are already enabled, start the loop
      if (this.state.enabled) {
        const hasDestructive =
          this.state.pixelSort   !== 'off' ||
          this.state.slice       !== 'off' ||
          this.state.direction   !== 'off' ||
          this.state.spiral      !== 'off' ||
          this.state.colorShift  !== 'off';

        if (hasDestructive) {
          this._startDestructiveLoop();
        }
      }
    } catch (err) {
      console.error('[DisplayGlitcher] Failed to load base image:', err);
    }
  }

  /**
   * Reset the live buffer back to the pristine base image.
   * The render loop keeps running from a clean canvas.
   */
  _resetToBaseImage() {
    if (!this.baseImageData) return;
    this.glitchImageData = this._copyImageData(this.baseImageData);
    this.ctx.putImageData(this.glitchImageData, 0, 0);
    this.frameCount = 0;
    console.log('[DisplayGlitcher] Reset to base image');
  }

  // ── Non-destructive CSS/SVG filters (video/p5 fallback) ────────────────

  _resetOverlays() {
    this.noiseOverlay.style.opacity = '0';
    this.vignetteOverlay.style.opacity = '0';
    this.fogOverlay.style.opacity = '0';
    this.fogOverlay.style.backdropFilter = 'blur(0px)';
  }

  /**
   * Apply CSS-based filters for video/p5 modes (image mode uses canvas path).
   */
  _applyNonDestructiveCSS() {
    this._resetOverlays();

    if (!this.state.enabled || this.state.filter === 'off') {
      this._setGlobalFilter('');
      return;
    }

    const amt = this.state.intensity / 100;
    let cssFilter = '';

    switch (this.state.filter) {
      case 'vintage':
        cssFilter = `sepia(${0.5 + amt * 0.5}) contrast(${1 + amt * 0.3}) brightness(${1 - amt * 0.1})`;
        break;
      case 'halftone':
        cssFilter = `contrast(${1 + amt * 2}) grayscale(${amt})`;
        break;
      case 'motionBlur':
        cssFilter = `blur(${amt * 8}px) contrast(${1 + amt * 0.5})`;
        break;
      case 'noise':
        this.noiseOverlay.style.opacity = String(amt * 0.8);
        cssFilter = `contrast(${1 + amt * 0.2})`;
        break;
      case 'cyberpunk':
        cssFilter = `hue-rotate(${amt * 90}deg) saturate(${1 + amt * 1.5}) contrast(${1 + amt * 0.6})`;
        break;
      case 'popArt':
        cssFilter = `saturate(${2 + amt * 4}) contrast(${1.2 + amt * 1.5}) brightness(${1.1 + amt * 0.2})`;
        break;
      case 'vignette':
        this.vignetteOverlay.style.opacity = String(0.4 + amt * 0.6);
        break;
      case 'emboss':
        cssFilter = `url(#svg-emboss) brightness(${1 + amt * 0.3})`;
        break;
      case 'edgeDetect':
        cssFilter = `url(#svg-edge-detect) brightness(${0.5 + amt * 0.5})`;
        break;
      case 'atmospheric':
        this.fogOverlay.style.opacity = String(amt * 0.9);
        this.fogOverlay.style.backdropFilter = `blur(${amt * 3}px)`;
        cssFilter = `brightness(${1 + amt * 0.15}) saturate(${1 - amt * 0.3})`;
        break;
      case 'dithering':
        cssFilter = `url(#svg-dither) contrast(${1 + amt * 0.8})`;
        break;
      default:
        // For compound filters (artistic-*, cyberpunk-*, etc.),
        // apply basic CSS approximation in video/p5 mode
        if (this.state.filter.startsWith('artistic-')) {
          cssFilter = `contrast(${1 + amt * 0.3}) saturate(${1 + amt * 0.4})`;
        } else if (this.state.filter.startsWith('cyberpunk-')) {
          cssFilter = `hue-rotate(${amt * 90}deg) saturate(${1 + amt * 1.5}) contrast(${1 + amt * 0.6})`;
        } else if (this.state.filter.startsWith('atmospheric-')) {
          this.fogOverlay.style.opacity = String(amt * 0.7);
          cssFilter = `brightness(${1 + amt * 0.1}) saturate(${1 - amt * 0.2})`;
        } else if (this.state.filter.startsWith('experimental-')) {
          cssFilter = `hue-rotate(${amt * 180}deg) contrast(${1 + amt * 0.8})`;
        }
        break;
    }

    this._setGlobalFilter(cssFilter);
  }

  _setGlobalFilter(cssValue) {
    ['canvas-layer', 'image-layer', 'video-layer'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.filter = cssValue;
    });
    this.glitchCanvasLayer.style.filter = cssValue;
  }

  // ── Destructive canvas pipeline (static images only) ───────────────────

  _stopDestructiveLoop() {
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
    this._loopRunning = false;
  }

  /**
   * Start the destructive render loop. The loop runs continuously and reads
   * this.state on every frame so that slider/dropdown changes are reflected
   * immediately without restarting.
   */
  _startDestructiveLoop() {
    if (this._loopRunning) return; // Already running
    if (!this.glitchImageData || !this.baseImageData) return;

    this._loopRunning = true;
    this.frameCount = 0;
    this._lastSliceTime = 0;
    this._lastDirTime = 0;

    const w = this.canvas.width;
    const h = this.canvas.height;

    // Hide normal image-layer, show ours
    const imgLayer = document.getElementById('image-layer');
    if (imgLayer) imgLayer.style.display = 'none';
    this._showGlitchLayer();

    const renderLoop = (timestamp) => {
      // Check if we should still be running
      if (!this._loopRunning || this.currentMode !== 'image') {
        this._loopRunning = false;
        return;
      }

      // If paused, skip processing but keep loop alive to respond to unpause
      if (this.state.paused) {
        this._animationFrameId = requestAnimationFrame(renderLoop);
        return;
      }

      // Check if all effects are off → gracefully stop
      const hasDestructive =
        this.state.pixelSort   !== 'off' ||
        this.state.slice       !== 'off' ||
        this.state.direction   !== 'off' ||
        this.state.spiral      !== 'off' ||
        this.state.colorShift  !== 'off';
      const hasCanvasFilter = this.state.filter !== 'off' && this._isCanvasFilter(this.state.filter);

      if (!this.state.enabled || (!hasDestructive && !hasCanvasFilter)) {
        this._stopDestructiveLoop();
        this._hideGlitchLayer();
        if (imgLayer) imgLayer.style.display = '';
        return;
      }

      this.frameCount++;
      const intensity = this.state.intensity;

      // ── Slice ──
      if (this.state.slice !== 'off') {
        const modeMap = { horizontal: 'horizontal', vertical: 'vertical', grid: 'both' };
        SliceEffects.applySliceGlitch(this.glitchImageData, modeMap[this.state.slice] || 'horizontal', intensity, this.state.offset);
        this._lastSliceTime = timestamp;
      }

      // ── Direction Shift ──
      if (this.state.direction !== 'off') {
        if (timestamp - this._lastDirTime > 80) {
          const clumpW = Math.floor(w * 0.3 + Math.random() * w * 0.4);
          const clumpH = Math.floor(h * 0.1 + Math.random() * h * 0.3);
          const clump = {
            x: Math.floor(Math.random() * (w - clumpW)),
            y: Math.floor(Math.random() * (h - clumpH)),
            w: clumpW,
            h: clumpH,
            clumpDirection: ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)]
          };
          DirectionEffects.applyDirectionShift(this.glitchImageData, clump, this.state.speed, this.state.direction);
          this._lastDirTime = timestamp;
        }
      }

      // ── Spiral / Swirl ──
      if (this.state.spiral !== 'off') {
        const rectSize = Math.min(w, h);
        const rect = {
          x: Math.floor((w - rectSize) / 2),
          y: Math.floor((h - rectSize) / 2),
          w: rectSize,
          h: rectSize
        };
        const pulse = Math.sin(timestamp * 0.005) * 0.5 + 1;
        const strength = (this.state.swirl) * pulse;
        SpiralEffects.applySwirlEffect(this.glitchImageData, rect, strength, this.state.spiral, this.state.spiral === 'ccw' ? 'ccw' : 'cw');
      }

      // ── Pixel Sort ──
      if (this.state.pixelSort !== 'off' && this.frameCount % 5 === 0) {
        const modeMap = {
          horizontal: 'rowBrightness',
          vertical: 'columnBrightness',
          diagonal: 'diagonal',
          circular: 'circular',
          wave: 'wave'
        };
        PixelSortEffects.applyPixelSort(this.glitchImageData, modeMap[this.state.pixelSort] || 'rowBrightness');
      }

      // ── Color Effects ──
      if (this.state.colorShift !== 'off') {
        const modeMap = {
          'chromatic-aberration': 'chromaticAberration',
          'hue-shift': 'hueShift',
          'vintage': 'vintage',
          'invert': 'invert',
          'saturation': 'saturation',
          'colorNoise': 'colorNoise'
        };
        const effectType = modeMap[this.state.colorShift] || 'chromaticAberration';
        const result = ColorEffects.applyColorEffect(this.glitchImageData, effectType, intensity);
        if (result && result !== this.glitchImageData.data) {
          this.glitchImageData.data.set(new Uint8ClampedArray(result));
        }
      }

      // ── Non-Destructive Canvas Filter (applied AFTER destructive effects) ──
      // These are applied to a copy of the buffer, not accumulated
      if (this.state.filter !== 'off' && this._isCanvasFilter(this.state.filter)) {
        // Apply canvas filter every 3rd frame to reduce CPU load
        if (this.frameCount % 3 === 0 || this.frameCount <= 1) {
          try {
            const flatParams = this.state.filterParams || {};
            // FilterEffects expects certain parameters to be nested under specific keys
            const filterOptions = {
              ...flatParams,
              motionBlur: flatParams,
              halftone: flatParams,
              dithering: flatParams,
              liquify: flatParams,
              colorGrading: flatParams,
              noise: flatParams,
              artisticParams: {}
            };
            
            // For artistic filters, nest parameters under the specific style
            if (this.state.filter.startsWith('artistic-')) {
              const style = this.state.filter.split('-')[1];
              filterOptions.artisticParams[style] = flatParams;
            }

            const filtered = FilterEffects.apply(
              this._copyImageData(this.glitchImageData),
              this.state.filter,
              this.state.intensity,
              filterOptions
            );
            if (filtered) {
              this.ctx.putImageData(filtered, 0, 0);
            } else {
              this.ctx.putImageData(this.glitchImageData, 0, 0);
            }
          } catch (e) {
            // Fallback: just put the unfiltered buffer
            this.ctx.putImageData(this.glitchImageData, 0, 0);
          }
        }
      } else {
        // No non-destructive filter — write accumulated buffer directly
        this.ctx.putImageData(this.glitchImageData, 0, 0);
      }

      // Continue loop
      this._animationFrameId = requestAnimationFrame(renderLoop);
    };

    this._animationFrameId = requestAnimationFrame(renderLoop);
    console.log('[DisplayGlitcher] Destructive loop started');
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  /**
   * Deep-copy an ImageData object.
   */
  _copyImageData(source) {
    const copy = new ImageData(source.width, source.height);
    copy.data.set(source.data);
    return copy;
  }
}

// ── Auto-init ──────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  window.displayGlitcher = new DisplayGlitcher('synthograsizer-display-v1');
  console.log('[DisplayGlitcher] ready — persistent render loop architecture');
});
