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

    // Animated effect overlay (for video/p5 modes — no pixel reads needed)
    this._effectLoopId = null;
    this._effectLoopRunning = false;
    this._effectCanvas = null;
    this._effectCtx = null;
    this._svgFiltersEl = null;
    // Particle states initialised lazily per-effect
    this._rainState = null;
    this._snowState = null;
    this._digitalRainState = null;

    // Frame sampler — reads pixels from video/canvas at reduced resolution
    // for pixel-dependent effects (oil painting, pointillism).
    // TODO: Replace with WebGL fragment shaders for GPU-quality rendering at 60fps.
    this._sampleCanvas = null;
    this._sampleCtx    = null;
    this._ptSample     = null;   // cached pointillism sample
    this._ptFrame      = 0;
    this._oilSample    = null;   // cached oil painting sample
    this._oilFrame     = 0;

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

    // Animated effect canvas — draws scan lines, particles, etc. over video/p5
    this._effectCanvas = document.createElement('canvas');
    Object.assign(this._effectCanvas.style, {
      position: 'fixed', inset: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '92',
    });
    this._effectCtx = this._effectCanvas.getContext('2d');

    document.body.appendChild(this.glitchCanvasLayer);
    document.body.appendChild(this.noiseOverlay);
    document.body.appendChild(this.vignetteOverlay);
    document.body.appendChild(this.fogOverlay);
    document.body.appendChild(this._effectCanvas);
  }

  _createSVGFilters() {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    Object.assign(svg.style, { position: 'absolute', width: '0', height: '0' });
    this._svgFiltersEl = svg;  // keep ref for runtime updates

    svg.innerHTML = `
      <!-- Classic -->
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

      <!-- Chromatic aberration: isolates R and B channels, offsets them -->
      <filter id="svg-chromatic" x="-5%" y="-5%" width="110%" height="110%">
        <feColorMatrix in="SourceGraphic" type="matrix"
          values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r-chan"/>
        <feOffset in="r-chan" id="svg-chrom-r" dx="5" dy="0" result="r-shift"/>
        <feColorMatrix in="SourceGraphic" type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b-chan"/>
        <feOffset in="b-chan" id="svg-chrom-b" dx="-5" dy="0" result="b-shift"/>
        <feColorMatrix in="SourceGraphic" type="matrix"
          values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g-chan"/>
        <feBlend in="r-shift" in2="g-chan" mode="screen" result="rg"/>
        <feBlend in="rg" in2="b-shift" mode="screen"/>
      </filter>

      <!-- Glow / bloom -->
      <filter id="svg-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>
        <feColorMatrix in="blur" type="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 3 -1" result="bloom"/>
        <feBlend in="SourceGraphic" in2="bloom" mode="screen"/>
      </filter>

      <!-- Heat-haze displacement (scale/baseFrequency updated by JS rAF) -->
      <filter id="svg-heat" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence id="heat-turb" type="fractalNoise"
          baseFrequency="0.025 0.07" numOctaves="2" seed="3" result="noise"/>
        <feDisplacementMap id="heat-disp" in="SourceGraphic" in2="noise"
          scale="18" xChannelSelector="R" yChannelSelector="G"/>
      </filter>

      <!-- Underwater drift (softer) -->
      <filter id="svg-underwater" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence id="water-turb" type="fractalNoise"
          baseFrequency="0.015 0.04" numOctaves="2" seed="7" result="noise"/>
        <feDisplacementMap id="water-disp" in="SourceGraphic" in2="noise"
          scale="10" xChannelSelector="R" yChannelSelector="G"/>
      </filter>

      <!-- Strong turbulence warp for experimental effects -->
      <filter id="svg-warp" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence id="warp-turb" type="turbulence"
          baseFrequency="0.04 0.04" numOctaves="3" seed="5" result="noise"/>
        <feDisplacementMap id="warp-disp" in="SourceGraphic" in2="noise"
          scale="40" xChannelSelector="R" yChannelSelector="G"/>
      </filter>

      <!-- Warm colour grade (golden-hour) -->
      <filter id="svg-warm">
        <feColorMatrix type="matrix"
          values="1.2 0.1 0   0  0.02
                  0.1 1.0 0.1 0  0.02
                  0   0   0.8 0  0
                  0   0   0   1  0"/>
      </filter>

      <!-- Cool / cinematic grade -->
      <filter id="svg-cool">
        <feColorMatrix type="matrix"
          values="0.9 0   0.1 0  0
                  0.1 1.0 0.1 0  0
                  0.1 0.1 1.2 0  0.04
                  0   0   0   1  0"/>
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
    this._stopEffectOverlay();
    // Reset particle / sample caches so next effect starts fresh
    this._rainState        = null;
    this._snowState        = null;
    this._digitalRainState = null;
    this._ptSample         = null;
    this._oilSample        = null;
  }

  /**
   * Apply CSS/SVG filters + animated canvas overlays for video/p5 modes.
   * Each effect subtype now gets a purpose-built visual treatment instead of
   * a generic colour-tint fallback.
   */
  _applyNonDestructiveCSS() {
    this._resetOverlays();

    if (!this.state.enabled || this.state.filter === 'off') {
      this._setGlobalFilter('');
      return;
    }

    const amt = this.state.intensity / 100;
    const f   = this.state.filter;
    let cssFilter = '';

    // ── Classic single-keyword filters ──────────────────────────────────────
    switch (f) {
      case 'vintage':
        cssFilter = `sepia(${0.5 + amt * 0.5}) contrast(${1 + amt * 0.3}) brightness(${1 - amt * 0.1})`;
        this.vignetteOverlay.style.opacity = String(amt * 0.4);
        break;
      case 'halftone':
        cssFilter = `contrast(${1.5 + amt * 1.5}) grayscale(${amt * 0.8})`;
        break;
      case 'motionBlur':
        cssFilter = `blur(${amt * 8}px) contrast(${1 + amt * 0.5})`;
        break;
      case 'noise':
        this.noiseOverlay.style.opacity = String(amt * 0.85);
        cssFilter = `contrast(${1 + amt * 0.3})`;
        break;
      case 'cyberpunk':
        cssFilter = `url(#svg-chromatic) hue-rotate(${amt * 90}deg) saturate(${1 + amt * 1.5}) contrast(${1 + amt * 0.6})`;
        this._startEffectOverlay((ctx, w, h) =>
          this._drawScanLines(ctx, w, h, 3, amt * 0.35));
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

      default: {
        // ── Cyberpunk subtypes ─────────────────────────────────────────────
        if (f === 'cyberpunk-neon') {
          cssFilter = `url(#svg-glow) url(#svg-chromatic) saturate(${1.5 + amt}) contrast(${1.2 + amt * 0.6}) brightness(${0.9 + amt * 0.3})`;
          this._startEffectOverlay((ctx, w, h) =>
            this._drawScanLines(ctx, w, h, 3, amt * 0.3));

        } else if (f === 'cyberpunk-matrix') {
          cssFilter = `hue-rotate(100deg) saturate(${1.5 + amt}) contrast(${1 + amt * 0.5}) brightness(${0.5 + amt * 0.2})`;
          this._startEffectOverlay((ctx, w, h, ts) =>
            this._drawDigitalRain(ctx, w, h, amt, ts));

        } else if (f === 'cyberpunk-synthwave') {
          cssFilter = `hue-rotate(${260 + amt * 30}deg) saturate(${2 + amt * 2}) contrast(${1 + amt * 0.5})`;
          this.vignetteOverlay.style.opacity = String(amt * 0.55);
          this._startEffectOverlay((ctx, w, h) =>
            this._drawScanLines(ctx, w, h, 4, amt * 0.4, '#ff00ff'));

        } else if (f === 'cyberpunk-digital_rain') {
          cssFilter = `brightness(${0.4 + amt * 0.3}) saturate(0.4) hue-rotate(100deg)`;
          this._startEffectOverlay((ctx, w, h, ts) =>
            this._drawDigitalRain(ctx, w, h, amt, ts));

        } else if (f === 'cyberpunk-hologram') {
          cssFilter = `url(#svg-chromatic) hue-rotate(180deg) saturate(${1 + amt * 2}) brightness(${0.7 + amt * 0.5})`;
          this._startEffectOverlay((ctx, w, h, ts) => {
            this._drawScanLines(ctx, w, h, 2, amt * 0.5, '#00ffff');
            this._drawGlitchBars(ctx, w, h, amt * 0.35, ts);
          });

        } else if (f === 'cyberpunk-glitch_scan') {
          cssFilter = `url(#svg-chromatic) contrast(${1.3 + amt * 0.5})`;
          this._startEffectOverlay((ctx, w, h, ts) => {
            this._drawGlitchBars(ctx, w, h, amt, ts);
            this._drawScanLines(ctx, w, h, 3, amt * 0.25);
          });

        // ── Artistic subtypes ──────────────────────────────────────────────
        } else if (f === 'artistic-oil_painting') {
          cssFilter = `saturate(${1.3 + amt * 0.6}) contrast(${1 + amt * 0.3})`;
          this._startEffectOverlay((ctx, w, h) =>
            this._drawOilPainting(ctx, w, h, amt));

        } else if (f === 'artistic-watercolor') {
          cssFilter = `saturate(${0.7 + amt * 0.5}) brightness(${1.1 + amt * 0.2}) blur(${amt * 2.5}px) contrast(${0.85 + amt * 0.25})`;

        } else if (f === 'artistic-pencil_sketch') {
          cssFilter = `url(#svg-edge-detect) grayscale(1) brightness(${1.8 + amt}) contrast(${1 + amt * 2})`;

        } else if (f === 'artistic-mosaic') {
          cssFilter = `blur(${1 + amt * 2.5}px) contrast(${2 + amt * 2}) saturate(${1 + amt * 0.5})`;

        } else if (f === 'artistic-stained_glass') {
          cssFilter = `url(#svg-edge-detect) saturate(${3 + amt * 3}) contrast(${2 + amt}) brightness(1.2)`;

        } else if (f === 'artistic-comic_book') {
          cssFilter = `saturate(${2.5 + amt * 2.5}) contrast(${1.6 + amt}) brightness(1.1)`;

        } else if (f === 'artistic-crosshatch') {
          cssFilter = `url(#svg-edge-detect) grayscale(${0.6 + amt * 0.4}) contrast(${1.5 + amt})`;

        } else if (f === 'artistic-pointillism') {
          // Dim the underlying video slightly so the dot layer reads clearly
          cssFilter = `brightness(${0.25 + amt * 0.15}) saturate(0.4)`;
          this._startEffectOverlay((ctx, w, h) =>
            this._drawPointillism(ctx, w, h, amt));

        // ── Atmospheric subtypes ───────────────────────────────────────────
        } else if (f === 'atmospheric-fog') {
          this.fogOverlay.style.opacity = String(amt * 0.9);
          this.fogOverlay.style.backdropFilter = `blur(${amt * 5}px)`;
          cssFilter = `brightness(${1.1 + amt * 0.1}) saturate(${1 - amt * 0.4})`;

        } else if (f === 'atmospheric-rain') {
          cssFilter = `brightness(${0.82 + amt * 0.1}) saturate(${0.85 - amt * 0.15}) contrast(${1 + amt * 0.1})`;
          this._startEffectOverlay((ctx, w, h, ts) =>
            this._drawRain(ctx, w, h, amt, ts));

        } else if (f === 'atmospheric-snow') {
          cssFilter = `brightness(${1 + amt * 0.15}) saturate(${1 - amt * 0.3})`;
          this._startEffectOverlay((ctx, w, h, ts) =>
            this._drawSnow(ctx, w, h, amt, ts));

        } else if (f === 'atmospheric-dust') {
          this.noiseOverlay.style.opacity = String(amt * 0.3);
          cssFilter = `sepia(${0.2 + amt * 0.4}) saturate(${1 - amt * 0.2}) brightness(${1 + amt * 0.2})`;

        } else if (f === 'atmospheric-heat_haze') {
          cssFilter = `url(#svg-heat) brightness(${1 + amt * 0.1}) saturate(${1 + amt * 0.3})`;
          this._startEffectOverlay((ctx, w, h, ts) =>
            this._animateSVGDisplacement('heat-turb', 'heat-disp', 12 + amt * 22, ts, 0.022));

        } else if (f === 'atmospheric-underwater') {
          cssFilter = `url(#svg-underwater) hue-rotate(195deg) saturate(${1.5 + amt * 0.5}) brightness(${0.82 + amt * 0.1}) blur(${amt * 1.2}px)`;
          this._startEffectOverlay((ctx, w, h, ts) =>
            this._animateSVGDisplacement('water-turb', 'water-disp', 8 + amt * 12, ts, 0.014));

        } else if (f === 'atmospheric-aurora') {
          cssFilter = `brightness(${0.65 + amt * 0.2}) saturate(${1.3 + amt * 0.5})`;
          this._startEffectOverlay((ctx, w, h, ts) =>
            this._drawAurora(ctx, w, h, amt, ts));

        } else if (f === 'atmospheric-lightning') {
          cssFilter = `brightness(${0.75 + amt * 0.1}) contrast(${1 + amt * 0.3})`;
          this._startEffectOverlay((ctx, w, h) => {
            if (Math.random() < 0.006 * (0.3 + amt)) {
              ctx.fillStyle = `rgba(200,220,255,${0.25 + amt * 0.4})`;
              ctx.fillRect(0, 0, w, h);
            }
          });

        // ── Experimental subtypes ──────────────────────────────────────────
        } else if (f === 'experimental-chromatic_shift') {
          // Update the chromatic filter offset dynamically from intensity
          const shift = Math.round(4 + amt * 14);
          const svg = this._svgFiltersEl;
          if (svg) {
            svg.getElementById('svg-chrom-r')?.setAttribute('dx', String(shift));
            svg.getElementById('svg-chrom-b')?.setAttribute('dx', String(-shift));
          }
          cssFilter = `url(#svg-chromatic) saturate(${1 + amt * 0.4})`;

        } else if (f === 'experimental-data_bend') {
          cssFilter = `hue-rotate(${amt * 180}deg) saturate(${2 + amt * 3}) contrast(${1.3 + amt * 0.7})`;
          this._startEffectOverlay((ctx, w, h, ts) =>
            this._drawGlitchBars(ctx, w, h, amt, ts));

        } else if (f === 'experimental-reality_glitch') {
          cssFilter = `url(#svg-chromatic) url(#svg-warp) contrast(${1.3 + amt * 0.5})`;
          this._startEffectOverlay((ctx, w, h, ts) => {
            this._drawGlitchBars(ctx, w, h, amt, ts);
            this._animateSVGDisplacement('warp-turb', 'warp-disp', 20 + amt * 40, ts, 0.035);
          });

        } else if (f === 'experimental-warp') {
          cssFilter = `url(#svg-warp) saturate(${1 + amt * 0.3})`;
          this._startEffectOverlay((ctx, w, h, ts) =>
            this._animateSVGDisplacement('warp-turb', 'warp-disp', 15 + amt * 35, ts, 0.03));

        } else if (f === 'experimental-tunnel') {
          cssFilter = `saturate(${1 + amt}) contrast(${1 + amt * 0.5}) hue-rotate(${amt * 60}deg)`;
          this.vignetteOverlay.style.opacity = String(amt * 0.8);

        } else if (f === 'experimental-fractal') {
          cssFilter = `saturate(${1 + amt * 2}) contrast(${1.2 + amt}) hue-rotate(${amt * 120}deg)`;

        } else if (f === 'experimental-kaleidoscope' || f === 'experimental-mirror_world') {
          cssFilter = `saturate(${1.3 + amt * 0.8}) hue-rotate(${amt * 40}deg) contrast(${1.1 + amt * 0.3})`;

        // ── Generic compound fallback ──────────────────────────────────────
        } else if (f.startsWith('artistic-')) {
          cssFilter = `contrast(${1 + amt * 0.4}) saturate(${1 + amt * 0.5})`;
        } else if (f.startsWith('cyberpunk-')) {
          cssFilter = `url(#svg-chromatic) hue-rotate(${amt * 90}deg) saturate(${1 + amt * 1.5}) contrast(${1 + amt * 0.6})`;
          this._startEffectOverlay((ctx, w, h) =>
            this._drawScanLines(ctx, w, h, 3, amt * 0.3));
        } else if (f.startsWith('atmospheric-')) {
          this.fogOverlay.style.opacity = String(amt * 0.5);
          cssFilter = `brightness(${1 + amt * 0.1}) saturate(${1 - amt * 0.2})`;
        } else if (f.startsWith('experimental-')) {
          cssFilter = `url(#svg-chromatic) hue-rotate(${amt * 180}deg) contrast(${1 + amt * 0.8})`;
        }
        break;
      }
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

  // ── Animated effect overlay ─────────────────────────────────────────────

  _stopEffectOverlay() {
    if (this._effectLoopId) {
      cancelAnimationFrame(this._effectLoopId);
      this._effectLoopId = null;
    }
    this._effectLoopRunning = false;
    if (this._effectCtx) {
      const c = this._effectCanvas;
      this._effectCtx.clearRect(0, 0, c.width, c.height);
    }
  }

  /**
   * Start the animated canvas overlay.  `drawFn(ctx, w, h, timestamp)` is
   * called every animation frame — it should draw on a transparent canvas.
   */
  _startEffectOverlay(drawFn) {
    this._stopEffectOverlay();
    this._effectLoopRunning = true;
    const loop = (ts) => {
      if (!this._effectLoopRunning) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (this._effectCanvas.width !== w || this._effectCanvas.height !== h) {
        this._effectCanvas.width  = w;
        this._effectCanvas.height = h;
      }
      this._effectCtx.clearRect(0, 0, w, h);
      drawFn(this._effectCtx, w, h, ts);
      this._effectLoopId = requestAnimationFrame(loop);
    };
    this._effectLoopId = requestAnimationFrame(loop);
  }

  // ── Per-effect draw helpers ─────────────────────────────────────────────

  /** Horizontal scan-line bands — CRT / TV feel */
  _drawScanLines(ctx, w, h, spacing, opacity, color = '#000') {
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    for (let y = 0; y < h; y += spacing) {
      ctx.fillRect(0, y, w, Math.max(1, spacing * 0.5));
    }
    ctx.globalAlpha = 1;
  }

  /** Randomly positioned coloured horizontal bars that shift each frame */
  _drawGlitchBars(ctx, w, h, amt, ts) {
    const barCount = Math.floor(amt * 9) + 2;
    for (let i = 0; i < barCount; i++) {
      const seed  = ((i * 1234.567 + ts * 0.11) % 100) / 100;
      const seed2 = ((i * 987.654  + ts * 0.07) % 100) / 100;
      if (seed > 0.45) continue;
      const y    = (Math.sin(seed * Math.PI * 2 + ts * 0.002) * 0.5 + 0.5) * h;
      const barH = 2 + seed2 * 7;
      const hue  = (ts * 0.05 + i * 40) % 360;
      ctx.fillStyle  = `hsla(${hue},100%,60%,0.45)`;
      ctx.globalAlpha = 0.5 + seed2 * 0.5;
      ctx.fillRect(0, y, w, barH);
      ctx.fillStyle  = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, y + barH, w, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** Katakana / Matrix digital rain */
  _drawDigitalRain(ctx, w, h, amt, ts) {
    const cols = Math.floor(w / 14);
    if (!this._digitalRainState || this._digitalRainState.cols !== cols) {
      this._digitalRainState = {
        cols,
        positions: Array.from({ length: cols }, () => Math.random() * h),
        speeds:    Array.from({ length: cols }, () => 1 + Math.random() * 3),
      };
    }
    const st = this._digitalRainState;
    ctx.font = '12px monospace';
    for (let c = 0; c < cols; c++) {
      st.positions[c] += st.speeds[c] * (0.4 + amt * 0.8);
      if (st.positions[c] > h + 20) st.positions[c] = -14;
      const x = c * 14;
      // Bright head character
      ctx.fillStyle = `rgba(0,255,70,${0.5 + amt * 0.5})`;
      ctx.fillText(String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96)), x, st.positions[c]);
      // Fading trail
      for (let t = 1; t < 9; t++) {
        const ty = st.positions[c] - t * 14;
        if (ty < 0) break;
        ctx.fillStyle = `rgba(0,255,70,${(1 - t / 9) * 0.28 * amt})`;
        ctx.fillText(String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96)), x, ty);
      }
    }
  }

  /** Diagonal rain streaks */
  _drawRain(ctx, w, h, amt, ts) {
    if (!this._rainState) {
      const count = Math.floor(80 + amt * 180);
      this._rainState = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        speed:  6 + Math.random() * 10,
        length: 10 + Math.random() * 20,
        opacity: 0.2 + Math.random() * 0.5,
      }));
    }
    ctx.strokeStyle = 'rgba(180,215,255,0.7)';
    ctx.lineWidth = 1;
    for (const d of this._rainState) {
      d.y += d.speed * (0.5 + amt * 0.7);
      d.x -= d.speed * 0.14;
      if (d.y > h) { d.y = -20; d.x = Math.random() * w; }
      ctx.globalAlpha = d.opacity * Math.min(amt * 1.5, 1);
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.length * 0.14, d.y - d.length);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Drifting snowflakes */
  _drawSnow(ctx, w, h, amt, ts) {
    if (!this._snowState) {
      const count = Math.floor(60 + amt * 140);
      this._snowState = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r:     1.5 + Math.random() * 3,
        speed: 0.5 + Math.random() * 2,
        drift: (Math.random() - 0.5) * 0.5,
        opacity: 0.5 + Math.random() * 0.5,
      }));
    }
    ctx.fillStyle = 'white';
    for (const fl of this._snowState) {
      fl.y += fl.speed * (0.4 + amt * 0.5);
      fl.x += fl.drift + Math.sin(ts * 0.001 + fl.y * 0.01) * 0.3;
      if (fl.y > h) { fl.y = -5; fl.x = Math.random() * w; }
      ctx.globalAlpha = fl.opacity * Math.min(amt * 1.4, 1);
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, fl.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Northern-lights aurora banding along the top of the frame */
  _drawAurora(ctx, w, h, amt, ts) {
    for (let b = 0; b < 5; b++) {
      const hue  = 140 + b * 28 + Math.sin(ts * 0.0003 + b) * 20;
      const yBase = h * (0.04 + b * 0.07);
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const wave = Math.sin(x * 0.006 + ts * 0.0008 + b * 1.5) * 40
                   + Math.sin(x * 0.013 + ts * 0.0005 + b * 0.8) * 18;
        const y = yBase + wave;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.lineTo(w, 0); ctx.lineTo(0, 0); ctx.closePath();
      const grad = ctx.createLinearGradient(0, yBase - 55, 0, yBase + 55);
      grad.addColorStop(0,   `hsla(${hue},100%,65%,0)`);
      grad.addColorStop(0.5, `hsla(${hue},100%,65%,${0.14 * amt})`);
      grad.addColorStop(1,   `hsla(${hue},100%,65%,0)`);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  /**
   * Animate an SVG feTurbulence + feDisplacementMap pair each frame so
   * heat-haze, underwater, and warp effects feel alive rather than frozen.
   */
  _animateSVGDisplacement(turbId, dispId, scale, ts, baseFreq) {
    const svg = this._svgFiltersEl;
    if (!svg) return;
    const turb = svg.getElementById(turbId);
    const disp = svg.getElementById(dispId);
    if (turb) {
      const drift = Math.sin(ts * 0.0004) * 0.006;
      const fx = (baseFreq + drift).toFixed(4);
      const fy = (baseFreq * 2.6 + drift * 0.5).toFixed(4);
      turb.setAttribute('baseFrequency', `${fx} ${fy}`);
    }
    if (disp) disp.setAttribute('scale', String(scale.toFixed(1)));
  }

  // ── Frame sampler (pixel reads for oil painting / pointillism) ──────────
  //
  // Reads from the live video or p5 canvas at a reduced resolution so that
  // per-pixel effects have real colour data to work with.
  //
  // TODO — WebGL upgrade path:
  //   Replace _sampleFrame() + CPU drawing with a WebGL pipeline that binds
  //   the video element as a texture and runs fragment shaders:
  //   • Oil painting  → Kuwahara filter  (O(r²) per pixel, trivial in GLSL)
  //   • Pointillism   → dot-grid shader  (single-pass, 60fps at full res)
  //   This will require a new GlitcherWebGL class with an offscreen WebGL
  //   canvas composited above the video layer.

  /**
   * Copy the current video / p5 canvas frame into a small offscreen canvas
   * and return its ImageData.  Returns null if the source isn't ready or if
   * a same-origin getImageData call fails.
   *
   * @param {number} targetWidth  Width of the downsampled buffer (default 280px)
   */
  _sampleFrame(targetWidth = 280) {
    let sourceEl = null;
    let sourceW  = 0;
    let sourceH  = 0;

    if (this.currentMode === 'video') {
      const el = document.getElementById('video-layer');
      if (el && el.readyState >= 2) {
        sourceEl = el;
        sourceW  = el.videoWidth  || el.offsetWidth  || 640;
        sourceH  = el.videoHeight || el.offsetHeight || 360;
      }
    } else if (this.currentMode === 'canvas') {
      const el = document.getElementById('canvas-layer');
      if (el) {
        sourceEl = el;
        sourceW  = el.width  || el.offsetWidth  || 640;
        sourceH  = el.height || el.offsetHeight || 360;
      }
    }

    if (!sourceEl || !sourceW || !sourceH) return null;

    const sW = targetWidth;
    const sH = Math.round(targetWidth * (sourceH / sourceW));

    if (!this._sampleCanvas) {
      this._sampleCanvas = document.createElement('canvas');
      this._sampleCtx    = this._sampleCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (this._sampleCanvas.width !== sW || this._sampleCanvas.height !== sH) {
      this._sampleCanvas.width  = sW;
      this._sampleCanvas.height = sH;
    }

    try {
      this._sampleCtx.drawImage(sourceEl, 0, 0, sW, sH);
      return { imageData: this._sampleCtx.getImageData(0, 0, sW, sH), srcW: sW, srcH: sH };
    } catch (_) {
      return null;  // cross-origin or element not yet painted
    }
  }

  /**
   * Pointillism — hex-grid of coloured circles sampled from the live frame.
   * CPU path; WebGL dot-grid shader is the planned upgrade.
   */
  _drawPointillism(ctx, w, h, amt) {
    this._ptFrame++;
    // Re-sample every other frame to ease CPU load
    if (this._ptFrame % 2 === 0 || !this._ptSample) {
      this._ptSample = this._sampleFrame(200);
    }

    if (!this._ptSample) {
      // Fallback: hue-cycling dots with no source data
      const ds = 8 + (1 - amt) * 10;
      ctx.globalAlpha = amt * 0.75;
      for (let y = ds; y < h; y += ds * 1.3) {
        const rowOff = (Math.floor(y / ds) % 2) * ds * 0.65;
        for (let x = rowOff; x < w; x += ds * 1.3) {
          ctx.fillStyle = `hsl(${(x * 0.4 + y * 0.25) % 360},70%,58%)`;
          ctx.beginPath();
          ctx.arc(x, y, ds * 0.48, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      return;
    }

    const { imageData, srcW, srcH } = this._ptSample;
    const data = imageData.data;
    // Dot spacing: smaller at high intensity → more dots, finer detail
    const ds   = Math.max(3, Math.round(13 - amt * 9));
    const rad  = ds * 0.52;

    for (let dy = ds * 0.5; dy < h; dy += ds) {
      const rowOff = (Math.floor(dy / ds) % 2) * ds * 0.5;  // hex offset
      for (let dx = rowOff; dx < w; dx += ds) {
        const sx  = Math.min(srcW - 1, Math.round((dx / w) * srcW));
        const sy  = Math.min(srcH - 1, Math.round((dy / h) * srcH));
        const idx = (sy * srcW + sx) * 4;

        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Small jitter and size variation for a hand-painted feel
        const jitter = ds * 0.18;
        const px     = dx + (Math.random() - 0.5) * jitter;
        const py     = dy + (Math.random() - 0.5) * jitter;
        const radius = rad * (0.72 + Math.random() * 0.56);

        ctx.fillStyle   = `rgb(${r},${g},${b})`;
        ctx.globalAlpha = 0.85 + Math.random() * 0.15;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Oil painting — two-pass approach:
   *   Pass 1: draw the downsampled frame back at full size with blur →
   *           creates the soft, low-frequency paint-base look.
   *   Pass 2: directional brush-stroke ellipses using sampled colours
   *           and local gradient direction → adds texture and impasto feel.
   * CPU path; Kuwahara GLSL shader is the planned upgrade.
   */
  _drawOilPainting(ctx, w, h, amt) {
    this._oilFrame++;
    if (this._oilFrame % 2 === 0 || !this._oilSample) {
      this._oilSample = this._sampleFrame(260);
    }

    if (!this._oilSample) {
      // Fallback: soft coloured ellipses with no source data
      ctx.globalAlpha = amt * 0.55;
      for (let i = 0; i < 120; i++) {
        const hue = Math.random() * 360;
        ctx.fillStyle = `hsla(${hue},60%,50%,0.55)`;
        ctx.beginPath();
        ctx.ellipse(Math.random() * w, Math.random() * h,
          15 + Math.random() * 30, 4 + Math.random() * 10,
          Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }

    const { imageData, srcW, srcH } = this._oilSample;
    const data = imageData.data;

    // ── Pass 1: blurred upscale as paint base ──────────────────────────────
    const blurPx = (2 + amt * 4).toFixed(1);
    ctx.filter = `blur(${blurPx}px) saturate(${1.25 + amt * 0.45}) contrast(${1.05 + amt * 0.2})`;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(this._sampleCanvas, 0, 0, w, h);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;

    // ── Pass 2: directional brush strokes ─────────────────────────────────
    const cols = Math.max(8,  Math.round(22 + amt * 14));
    const rows = Math.max(5,  Math.round(cols * (srcH / srcW)));
    const cellW = w / cols;
    const cellH = h / rows;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const sx  = Math.min(srcW - 1, Math.round((col / cols) * srcW));
        const sy  = Math.min(srcH - 1, Math.round((row / rows) * srcH));
        const idx = (sy * srcW + sx) * 4;

        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Estimate local gradient direction from a neighbour pixel
        const nx  = Math.min(srcW - 1, sx + 1);
        const nIdx = (sy * srcW + nx) * 4;
        const angle = Math.atan2(data[nIdx + 1] - g, data[nIdx] - r) + Math.PI * 0.25
                    + (Math.random() - 0.5) * 0.4;

        const cx = (col + 0.5) * cellW + (Math.random() - 0.5) * cellW * 0.5;
        const cy = (row + 0.5) * cellH + (Math.random() - 0.5) * cellH * 0.5;
        const sW = cellW * (1.1 + Math.random() * 0.7 + amt * 0.4);
        const sH = sW * (0.18 + Math.random() * 0.12);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.fillStyle   = `rgba(${r},${g},${b},${0.5 + amt * 0.25})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, sW / 2, sH / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
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
