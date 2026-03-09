/**
 * Main Application Entry Point for Glitcher App
 * Coordinates all modules and initializes the application
 * UPDATED: Now includes selection system and filter effects!
 */

import { CanvasManager } from './core/canvas-manager.js';
import { MediaManager } from './core/media-manager.js';
import { FrameTimer } from './utils/frame-timer.js';
import { SelectionManager } from './selection/selection-manager.js';
import { EnhancedCanvasInteraction } from './ui/enhanced-canvas-interaction.js';
import { EnhancedSelectionUI } from './ui/enhanced-selection-ui.js';
import { DirectionEffects } from './effects/destructive/direction-effects.js';
import { SpiralEffects } from './effects/destructive/spiral-effects.js';
import { SliceEffects } from './effects/destructive/slice-effects.js';
import { PixelSortEffects } from './effects/destructive/pixel-sort-effects.js';
import { ColorEffects } from './effects/destructive/color-effects.js';
import { FilterEffects } from './effects/non-destructive/filter-effects.js';
import { EFFECT_DEFAULTS } from './config/constants.js';
import { EffectPresets } from './ui/effect-presets.js';
import { PanelStateManager } from './ui/panel-state-manager.js';
import { ArtisticFilter } from './effects/non-destructive/new-filters/artistic-filter.js'; // Added for artistic filter integration
import { FilterControlsUI } from './ui/filter-controls-ui.js';
import { RecordingManager } from './core/recording-manager.js';
import { copyImageData } from './utils/image-utils.js'; // Import copyImageData synchronously

// NEW: Effect Studio System Imports
import { EffectChainManager } from './core/effect-system/effect-chain-manager.js';
import { EffectFactory } from './core/effect-system/effect-factory.js';
import { RenderPipeline } from './core/effect-system/render-pipeline.js';
import { EffectStudioManager } from './ui/effect-studio/effects-studio-manager.js';

// NEW: Mode Synchronization System
import './ui/effect-studio/studio-integration.js';

class GlitcherApp {
  constructor() {
    this.canvasManager = new CanvasManager();
    this.mediaManager = new MediaManager(); // Initialize media manager
    this.selectionManager = null;
    this.canvasInteraction = null;
    this.selectionUI = null;
    this.panelStateManager = null;
    this.recordingManager = null;
    
    // NEW: Effect Studio System
    this.effectChainManager = null;
    this.effectFactory = null;
    this.renderPipeline = null;
    this.effectStudioManager = null;
    this.studioMode = false; // Toggle between classic and studio modes
    
    // Enhanced UI flag
    this.useEnhancedUI = true;
    
    this.animationId = null;
    this.isPaused = false;
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this.targetFrameRate = 60;
    this.isRecording = false; // Added for recording state
    
    // Frame timing for animated media
    this.frameTimer = null;
    this.sourcePlaybackSpeed = 1.0;
    this.isSourcePlaying = true;
    
    // Destructive effects state
    this.activeClumps = [];
    this.testDirection = 'off';
    this.testSpeed = 2;
    this.testSpiral = 'off';
    this.testSwirlStrength = 0.06;
    this.spiralDirection = 'cw';
    this.testSlice = 'off';
    this.testColorOffset = 0;
    this.testPixelSort = 'off';
    this.testColorEffect = 'off';
    this.testColorIntensity = 50;
    
    // NEW: Non-destructive filter effects state
    this.filterEffect = 'off';
    this.filterIntensity = 50;
    this.filterControlsUI = new FilterControlsUI(); // Properly instantiate FilterControlsUI
    this.filterOptions = {
      // Main style selectors
      artisticStyle: 'oil_painting',

      // Nested parameter objects for each filter category
      halftone: {
        dotSize: 4,
        pattern: 'circle',
        angle: 0,
        threshold: 128,
        colorMode: 'bw'
      },
      motionBlur: {
        direction: 'horizontal',
        distance: 10,
        angle: 0,
        fadeType: 'linear',
        quality: 'normal',
        radialType: 'zoom',
        centerX: null,
        centerY: null
      },
      liquify: {
        warpType: 'push',
        coveragePercent: 100,
        strength: 50
      },
      colorGrading: {
        shadows: { r: 0, g: 0, b: 0 },
        midtones: { r: 0, g: 0, b: 0 },
        highlights: { r: 0, g: 0, b: 0 },
        temperature: 0,
        tint: 0,
        vibrance: 0,
        saturation: 0
      },
      noise: {
        noiseType: 'film',
        noiseAmount: 50,
        noiseSize: 1,
        colorNoise: true
      },
      dithering: {
        algorithm: 'floyd_steinberg',
        colorMode: 'monochrome',
        cgaPalette: 0,
        colorLevels: 2,
        levelsPerChannel: 4,
        serpentine: true,
        brightness: 0,
        contrast: 0
      },
      artisticParams: {
        oil_painting: {
          brushSize: 5,
          smudgeDetail: 50, // Renamed from smudge/stroke detail for clarity
          colorPaletteRichness: 70,
        },
        watercolor: {
          bleedAmount: 30,
          pigmentDensity: 60,
          edgeDarkening: 40,
          paperTextureStrength: 20,
          waterAmount: 50,
        },
        pencil_sketch: {
          strokeWidth: 2,
          hatchDensity: 50,
          edgeThreshold: 20,
          graphiteShadingIntensity: 60,
          paperColor: '#FFFFFF',
          pencilColor: '#333333',
        },
        mosaic: {
          tileSize: 20,
          groutThickness: 2,
          groutColor: '#CCCCCC',
          colorVariation: 30,
        },
        stained_glass: {
          cellSize: 50,
          borderThickness: 3,
          borderColor: '#000000',
          lightRefractionIndex: 20,
          colorPaletteComplexity: 60,
        },
        comic_book: {
          inkOutlineStrength: 5,
          colorLevels: 4,
          halftoneDotSize: 3,
          halftoneAngle: 45,
          edgeDetectionThreshold: 30,
        },
        crosshatch: {
          lineSpacing: 8,
          lineThickness: 1,
          angleVariation: 15,
          hatchDarkness: 70,
          backgroundColor: '#FFFFFF', // Renamed from background lightness/paper color
          numLayers: 3, // Renamed from number of hatch layers
        },
        pointillism: {
          dotSize: 4,
          dotDensity: 60,
          colorVariation: 40,
          dotShape: 'circle',
          backgroundColor: '#FFFFFF',
        },
      },
    };

    // Configuration for Artistic Filter UI controls
    this.artisticParamsConfig = {
      oil_painting: {
        brushSize: { type: 'slider', min: 1, max: 20, step: 1, unit: 'px', default: 5 },
        smudgeDetail: { type: 'slider', min: 0, max: 100, step: 1, default: 50 },
        colorPaletteRichness: { type: 'slider', min: 0, max: 100, step: 1, default: 70 }
      },
      watercolor: {
        bleedAmount: { type: 'slider', min: 0, max: 100, step: 1, default: 30 },
        pigmentDensity: { type: 'slider', min: 0, max: 100, step: 1, default: 60 },
        edgeDarkening: { type: 'slider', min: 0, max: 100, step: 1, default: 40 },
        paperTextureStrength: { type: 'slider', min: 0, max: 100, step: 1, default: 20 },
        waterAmount: { type: 'slider', min: 0, max: 100, step: 1, default: 50 }
      },
      pencil_sketch: {
        strokeWidth: { type: 'slider', min: 1, max: 10, step: 0.5, unit: 'px', default: 2 },
        hatchDensity: { type: 'slider', min: 0, max: 100, step: 1, default: 50 },
        edgeThreshold: { type: 'slider', min: 0, max: 100, step: 1, default: 20 },
        graphiteShadingIntensity: { type: 'slider', min: 0, max: 100, step: 1, default: 60 },
        paperColor: { type: 'color', default: '#FFFFFF' },
        pencilColor: { type: 'color', default: '#333333' }
      },
      mosaic: {
        tileSize: { type: 'slider', min: 5, max: 50, step: 1, unit: 'px', default: 20 },
        groutThickness: { type: 'slider', min: 0, max: 10, step: 1, unit: 'px', default: 2 },
        groutColor: { type: 'color', default: '#CCCCCC' },
        colorVariation: { type: 'slider', min: 0, max: 100, step: 1, default: 30 }
      },
      stained_glass: {
        cellSize: { type: 'slider', min: 10, max: 100, step: 1, unit: 'px', default: 50 },
        borderThickness: { type: 'slider', min: 1, max: 10, step: 1, unit: 'px', default: 3 },
        borderColor: { type: 'color', default: '#000000' },
        lightRefractionIndex: { type: 'slider', min: 0, max: 100, step: 1, default: 20 },
        colorPaletteComplexity: { type: 'slider', min: 0, max: 100, step: 1, default: 60 }
      },
      comic_book: {
        inkOutlineStrength: { type: 'slider', min: 0, max: 10, step: 0.5, default: 5 },
        colorLevels: { type: 'slider', min: 2, max: 16, step: 1, default: 4 },
        halftoneDotSize: { type: 'slider', min: 1, max: 20, step: 1, unit: 'px', default: 3 },
        halftoneAngle: { type: 'slider', min: 0, max: 360, step: 1, unit: '°', default: 45 },
        edgeDetectionThreshold: { type: 'slider', min: 0, max: 100, step: 1, default: 30 }
      },
      crosshatch: {
        lineSpacing: { type: 'slider', min: 1, max: 20, step: 1, unit: 'px', default: 8 },
        lineThickness: { type: 'slider', min: 1, max: 10, step: 0.5, unit: 'px', default: 1 },
        angleVariation: { type: 'slider', min: 0, max: 90, step: 1, unit: '°', default: 15 },
        hatchDarkness: { type: 'slider', min: 0, max: 100, step: 1, default: 70 },
        backgroundColor: { type: 'color', default: '#FFFFFF' },
        numLayers: { type: 'slider', min: 1, max: 5, step: 1, default: 3 }
      },
      pointillism: {
        dotSize: { type: 'slider', min: 1, max: 20, step: 1, unit: 'px', default: 4 },
        dotDensity: { type: 'slider', min: 0, max: 100, step: 1, default: 60 },
        colorVariation: { type: 'slider', min: 0, max: 100, step: 1, default: 40 },
        dotShape: { type: 'dropdown', options: ['circle', 'square', 'diamond'], default: 'circle' },
        backgroundColor: { type: 'color', default: '#FFFFFF' }
      }
    };

    // Configuration for Filter Effects UI controls
    this.filterParamsConfig = {
      halftone: {
        dotSize: { type: 'slider', min: 1, max: 30, step: 1, unit: 'px' },
        pattern: { type: 'dropdown', options: ['circle', 'square', 'diamond', 'line'] },
        angle: { type: 'slider', min: 0, max: 360, step: 1, unit: '°' },
        threshold: { type: 'slider', min: 0, max: 255, step: 1 },
        colorMode: { type: 'dropdown', options: ['bw', 'duotone', 'color'] }
      },
      motionBlur: {
        direction: { type: 'dropdown', options: ['horizontal', 'vertical', 'diagonal-left', 'diagonal-right', 'radial'] },
        distance: { type: 'slider', min: 0, max: 100, step: 1, unit: 'px' },
        angle: { type: 'slider', min: 0, max: 360, step: 1, unit: '°' },
        quality: { type: 'dropdown', options: ['fast', 'normal', 'high'] },
        fadeType: { type: 'dropdown', options: ['linear', 'exponential', 'sine'] },
        radialType: { type: 'dropdown', options: ['zoom', 'spin'] }
      },
      liquify: {
        warpType: { type: 'dropdown', options: ['push', 'pull', 'twirl', 'bloat', 'pinch'] },
        strength: { type: 'slider', min: 0, max: 100, step: 1 },
        coveragePercent: { type: 'slider', min: 25, max: 150, step: 1, unit: '%' }
      },
      noise: {
        noiseAmount: { type: 'slider', min: 0, max: 100, step: 1 },
        noiseType: { type: 'dropdown', options: ['film', 'digital', 'perlin', 'cellular'] },
        noiseSize: { type: 'slider', min: 1, max: 10, step: 1 },
        colorNoise: { type: 'toggle' } // Assuming a toggle/checkbox control
      }
      // Color Grading would be more complex, handled separately
    };

    // Selection system state
    this.minLifetime = 90;
    this.maxLifetime = 150;
  }

  /**
   * Initialize the application
   */
  async init() {
    try {
      console.log('🎨 Initializing Glitcher App with Enhanced Selection System...');
      
      // Initialize canvas manager first
      this.canvasManager.init();

      // Store references to the effect classes, as their methods are static
      this.DirectionEffects = DirectionEffects;
      this.SpiralEffects = SpiralEffects;
      this.SliceEffects = SliceEffects;
      this.PixelSortEffects = PixelSortEffects;
      this.ColorEffects = ColorEffects;
      this.filterEffects = new FilterEffects(this); // Non-destructive filters need app access

      // Initialize recording manager after canvas and effect modules are ready
      this.recordingManager = new RecordingManager(this);
      
      // NEW: Initialize Effect Studio System
      console.log('🎨 Initializing Effect Studio System...');
      
      // Create effect factory and register existing effects
      this.effectFactory = new EffectFactory();
      this.registerExistingEffectsWithFactory();
      
      // Create effect chain manager
      this.effectChainManager = new EffectChainManager();
      
      // Create render pipeline
      this.renderPipeline = new RenderPipeline(this.canvasManager);
      
      // Create studio manager (handles UI coordination)
      this.effectStudioManager = new EffectStudioManager(this);
      
      console.log('✅ Effect Studio System initialized');
      
      // Initialize selection system
      this.selectionManager = new SelectionManager(this.canvasManager);
      
      // Initialize enhanced canvas interaction and UI
      if (this.useEnhancedUI) {
        this.canvasInteraction = new EnhancedCanvasInteraction(this.canvasManager, this.selectionManager);
        this.selectionUI = new EnhancedSelectionUI(this.selectionManager, this.canvasInteraction);
        console.log('✨ Enhanced selection system initialized');
      } else {
        // Fallback to original system
        const { CanvasInteraction } = await import('./ui/canvas-interaction.js');
        const { SelectionUI } = await import('./ui/selection-ui.js');
        this.canvasInteraction = new CanvasInteraction(this.canvasManager, this.selectionManager);
        this.selectionUI = new SelectionUI(this.selectionManager, this.canvasInteraction);
        console.log('📝 Standard selection system initialized');
      }
      
      // Set up image load callback
      this.canvasManager.onImageLoad((imageData, width, height) => {
        console.log(`✅ Image loaded: ${width}x${height}`);
        
        // Initialize frame timer for animated media
        if (this.canvasManager.animationMode) {
          const mediaInfo = this.canvasManager.mediaManager.getMediaInfo();
          this.frameTimer = new FrameTimer(mediaInfo.frameRate, this.targetFrameRate);
          this.frameTimer.setMaxFrames(mediaInfo.frameCount);
          console.log('[DEBUG] FrameTimer initialized. maxFrames:', mediaInfo.frameCount, 'frameRate:', mediaInfo.frameRate);
          this.frameTimer.setPlaybackMode(mediaInfo.playbackMode);
          console.log(`🎬 Animated media: ${mediaInfo.frameCount} frames at ${mediaInfo.frameRate} fps`);
        }
        
        this.startAnimation();
      });
      
      // Set up controls
      this.setupTestControls();
      this.setupFilterControls();
      this.setupSelectionControls();
      this.setupPresetControls();
      this.setupAnimationControls();
      this.setupKeyboardShortcuts();
      
      // Bind methods that might be called externally
      this.showFilterControls = this.showFilterControls.bind(this);
      
      // Initialize panel state manager AFTER all UI setup
      this.panelStateManager = new PanelStateManager();
      
      console.log('✅ Glitcher App with Enhanced Selection System & Filter Effects initialized successfully!');
      
    } catch (error) {
      console.error('❌ Failed to initialize Glitcher App:', error);
    }
  }
  
  /**
   * NEW: Register existing effects with the factory
   */
  registerExistingEffectsWithFactory() {
    // Register filter effects with the factory (needs app instance)
    this.effectFactory.registerFilterEffectsWithApp(this.filterEffects);
    
    // The factory already has built-in destructive effects registered
    console.log('✅ All effects registered with factory');
  }

  /**
   * NEW: Toggle between classic and studio modes
   */
  toggleStudioMode() {
    this.studioMode = !this.studioMode;
    this.effectStudioManager.toggleStudioMode(this.studioMode);
    
    if (this.studioMode) {
      // Migrate current settings to effect chain
      this.migrateClassicSettingsToChain();
    }
    
    console.log(`🎛️ Studio mode: ${this.studioMode ? 'ON' : 'OFF'}`);
    
    // Update UI to show current mode
    this.updateModeIndicator();
  }

  /**
   * NEW: Migrate current classic settings to effect chain
   */
  migrateClassicSettingsToChain() {
    // Only migrate if chain manager and factory are ready
    if (!this.effectChainManager || !this.effectFactory) {
      console.warn('Effect system not ready for migration');
      return;
    }
    
    // Clear existing chain
    this.effectChainManager.clearChain();
    
    // Add effects based on current classic settings
    if (this.testDirection !== 'off') {
      try {
        const directionEffect = this.effectFactory.createEffect('direction-movement');
        if (directionEffect) {
          directionEffect.parameters.direction = this.testDirection;
          directionEffect.parameters.speed = this.testSpeed;
          directionEffect.parameters.selectionAware = true;
          this.effectChainManager.addEffect(directionEffect);
        }
      } catch (error) {
        console.warn('Could not migrate direction effect:', error);
      }
    }
    
    if (this.testSpiral !== 'off') {
      try {
        const spiralEffect = this.effectFactory.createEffect('spiral-distortion');
        if (spiralEffect) {
          spiralEffect.parameters.type = this.testSpiral;
          spiralEffect.parameters.strength = this.testSwirlStrength;
          spiralEffect.parameters.direction = this.spiralDirection;
          this.effectChainManager.addEffect(spiralEffect);
        }
      } catch (error) {
        console.warn('Could not migrate spiral effect:', error);
      }
    }
    
    if (this.testSlice !== 'off') {
      try {
        const sliceEffect = this.effectFactory.createEffect('slice-glitch');
        if (sliceEffect) {
          sliceEffect.parameters.mode = this.testSlice;
          sliceEffect.parameters.offset = this.testColorOffset;
          this.effectChainManager.addEffect(sliceEffect);
        }
      } catch (error) {
        console.warn('Could not migrate slice effect:', error);
      }
    }
    
    if (this.testPixelSort !== 'off') {
      try {
        const pixelSortEffect = this.effectFactory.createEffect('pixel-sort');
        if (pixelSortEffect) {
          pixelSortEffect.parameters.mode = this.testPixelSort;
          this.effectChainManager.addEffect(pixelSortEffect);
        }
      } catch (error) {
        console.warn('Could not migrate pixel sort effect:', error);
      }
    }
    
    if (this.testColorEffect !== 'off') {
      try {
        // Map color effect names to factory IDs
        const colorEffectMap = {
          'chromaticAberration': 'chromatic-aberration',
          'hueShift': 'hue-shift',
          'saturation': 'saturation-boost',
          'invert': 'color-invert',
          'vintage': 'vintage-color',
          'colorNoise': 'color-noise'
        };
        
        const effectId = colorEffectMap[this.testColorEffect] || this.testColorEffect;
        const colorEffect = this.effectFactory.createEffect(effectId);
        if (colorEffect) {
          colorEffect.parameters.intensity = this.testColorIntensity;
          this.effectChainManager.addEffect(colorEffect);
        }
      } catch (error) {
        console.warn('Could not migrate color effect:', error);
      }
    }
    
    if (this.filterEffect !== 'off') {
      const filterEffectId = this.mapFilterEffectToId(this.filterEffect);
      if (filterEffectId) {
        try {
          const filterEffect = this.effectFactory.createEffect(filterEffectId);
          if (filterEffect) {
            // Set to non-destructive mode by default for filters
            filterEffect.mode = 'non-destructive';
            filterEffect.parameters.intensity = this.filterIntensity;
            
            // Apply additional filter options
            const additionalOptions = this.mapFilterOptionsToEffect(this.filterEffect);
            Object.assign(filterEffect.parameters, additionalOptions);
            
            this.effectChainManager.addEffect(filterEffect);
          }
        } catch (error) {
          console.warn(`⚠️ Could not migrate filter effect: ${this.filterEffect}`, error);
        }
      }
    }
    
    console.log(`🔄 Migrated ${this.effectChainManager.chain.length} effects to studio mode`);
  }

  /**
   * NEW: Map filter effect names to factory IDs
   */
  mapFilterEffectToId(filterType) {
    const filterMap = {
      'popArt': 'pop-art-filter',
      'vintage': 'vintage-filter',
      'halftone': 'halftone-filter',
      'motionBlur': 'motion-blur-filter',
      'liquify': 'liquify-filter',
      'colorGrading': 'color-grading-filter',
      'noise': 'noise-filter',
      'artistic': 'artistic-filter',
      'emboss': 'emboss-filter',
      'edgeDetect': 'edge-detect-filter',
      'vignette': 'vignette-filter',
      'cyberpunk': 'cyberpunk-filter',
      'atmospheric': 'atmospheric-filter',
      'experimental': 'experimental-filter',
      'dithering': 'dithering-filter'
    };
    
    // Handle compound filter names (e.g., "artistic-oil_painting")
    if (filterType.includes('-')) {
      const baseType = filterType.split('-')[0];
      return filterMap[baseType];
    }
    
    return filterMap[filterType];
  }

  /**
   * NEW: Map filter options to effect parameters
   */
  mapFilterOptionsToEffect(filterType) {
    const optionsMap = {
      'popArt': { style: this.filterOptions.style },
      'vintage': { 
        filmType: this.filterOptions.filmType, 
        grainAmount: this.filterOptions.grainAmount 
      },
      'halftone': this.filterOptions.halftone,
      'motionBlur': this.filterOptions.motionBlur,
      'liquify': this.filterOptions.liquify,
      'colorGrading': this.filterOptions.colorGrading,
      'noise': this.filterOptions.noise,
      'artistic': { 
        style: this.filterOptions.artisticStyle,
        params: this.filterOptions.artisticParams[this.filterOptions.artisticStyle]
      },
      'dithering': this.filterOptions.dithering
    };
    
    return optionsMap[filterType] || {};
  }

  /**
   * NEW: Update mode indicator in UI
   */
  updateModeIndicator() {
    // Update any mode indicators in the UI
    const modeButtons = document.querySelectorAll('.view-mode-btn');
    modeButtons.forEach(btn => {
      const mode = btn.dataset.mode;
      btn.classList.toggle('active', 
        (mode === 'studio' && this.studioMode) || 
        (mode === 'classic' && !this.studioMode)
      );
    });
    
    // Update status text
    const statusElement = document.getElementById('current-mode-status');
    if (statusElement) {
      statusElement.textContent = this.studioMode ? 'Studio Mode' : 'Classic Mode';
    }
    
    // Update toggle button text
    const toggleButton = document.getElementById('studio-mode-toggle');
    if (toggleButton) {
      const span = toggleButton.querySelector('span');
      if (span) {
        span.textContent = this.studioMode ? 
          '🎨 Switch to Classic Mode' : 
          '🎛️ Switch to Studio Mode';
      }
      toggleButton.classList.toggle('active', this.studioMode);
    }
  }

  /**
   * NEW: Setup keyboard shortcuts
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Shift + S: Toggle Studio Mode
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        this.toggleStudioMode();
      }
    });
  }

  /**
   * Fix double file upload dialog issue and ensure upload functionality works
   */
  setupFileUploadFix() {
    const fileInput = document.getElementById('image-input');
    
    if (!fileInput) {
      console.error('❌ File input element not found!');
      return;
    }
    
    // The canvas manager already sets up click listeners for the drop zones,
    // so we just need to ensure the file input is working properly
    
    // Test if file input is functional
    fileInput.addEventListener('change', (e) => {
      console.log('🎉 File input change event triggered:', e.target.files.length, 'files');
    });
    
    // Verify that the canvas manager has properly set up the drop zones
    const uploadArea = document.querySelector('.file-upload-area');
    const canvasDropZone = document.getElementById('canvas-placeholder');
    
    if (uploadArea) {
      console.log('✅ Upload area found');
    } else {
      console.error('❌ Upload area not found!');
    }
    
    if (canvasDropZone) {
      console.log('✅ Canvas drop zone found');
    } else {
      console.error('❌ Canvas drop zone not found!');
    }
    
    // Make sure canvas manager is initialized
    if (this.canvasManager && typeof this.canvasManager.setupEventListeners === 'function') {
      console.log('✅ Canvas manager is properly initialized');
    } else {
      console.warn('⚠️ Canvas manager may not be properly initialized');
    }
    
    console.log('✅ File upload functionality verified');
  }

  /**
   * Setup preset controls
   */
  setupPresetControls() {
    // This will be implemented by the EffectPresets module
    // Just a placeholder for now to avoid errors
    console.log('🎆 Preset controls setup skipped (to be implemented)');
  }
  
  /**
   * Setup animation controls for animated media
   */
  setupAnimationControls() {
    // Play/pause source button
    const playPauseSourceBtn = document.getElementById('play-pause-source');
    if (playPauseSourceBtn) {
      playPauseSourceBtn.addEventListener('click', () => {
        this.isSourcePlaying = !this.isSourcePlaying;
        playPauseSourceBtn.textContent = this.isSourcePlaying ? 'Pause Source' : 'Play Source';
      });
    }
    
    // Reset source button
    const resetSourceBtn = document.getElementById('reset-source');
    if (resetSourceBtn) {
      resetSourceBtn.addEventListener('click', () => {
        if (this.frameTimer) {
          this.frameTimer.reset();
          this.canvasManager.setCurrentFrame(0);
          this.canvasManager.mediaManager.currentFrame = 0;
          this.canvasManager.updateMediaInfo();
        }
      });
    }
    
    // Playback mode select
    const playbackModeSelect = document.getElementById('playback-mode');
    if (playbackModeSelect) {
      playbackModeSelect.addEventListener('change', (e) => {
        const mode = e.target.value;
        if (this.frameTimer) {
          this.frameTimer.setPlaybackMode(mode);
        }
        if (this.canvasManager.mediaManager) {
          this.canvasManager.mediaManager.setPlaybackMode(mode);
        }
      });
    }
    
    // Source speed control
    const sourceSpeedRange = document.getElementById('source-speed');
    const speedValueEl = document.getElementById('speed-value');
    if (sourceSpeedRange && speedValueEl) {
      sourceSpeedRange.addEventListener('input', (e) => {
        this.sourcePlaybackSpeed = parseFloat(e.target.value);
        speedValueEl.textContent = this.sourcePlaybackSpeed + 'x';
        if (this.frameTimer) {
          this.frameTimer.setSpeed(this.sourcePlaybackSpeed);
        }
      });
    }
  }

  /**
   * Set up selection-related controls
   */
  setupSelectionControls() {
    // Lifetime controls
    const minLifetimeRange = document.getElementById('min-lifetime');
    const minLifetimeValue = document.getElementById('min-lifetime-value');
    if (minLifetimeRange && minLifetimeValue) {
      minLifetimeRange.addEventListener('input', (e) => {
        this.minLifetime = parseInt(e.target.value);
        minLifetimeValue.textContent = this.minLifetime;
      });
    }
    
    const maxLifetimeRange = document.getElementById('max-lifetime');
    const maxLifetimeValue = document.getElementById('max-lifetime-value');
    if (maxLifetimeRange && maxLifetimeValue) {
      maxLifetimeRange.addEventListener('input', (e) => {
        this.maxLifetime = parseInt(e.target.value);
        maxLifetimeValue.textContent = this.maxLifetime;
      });
    }
  }

  /**
   * Set up existing destructive effect controls
   */
  setupTestControls() {
    // Play/Pause button
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    }
    
    // Reset button
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetImage());
    }
    
    // NEW: Studio mode toggle button
    const studioModeToggle = document.getElementById('studio-mode-toggle');
    if (studioModeToggle) {
      studioModeToggle.addEventListener('click', () => this.toggleStudioMode());
    }
    
    // Direction select
    const directionSelect = document.getElementById('direction-select');
    if (directionSelect) {
      directionSelect.addEventListener('change', (e) => {
        this.testDirection = e.target.value;
      });
    }
    
    // Spiral select
    const spiralSelect = document.getElementById('spiral-select');
    if (spiralSelect) {
      spiralSelect.addEventListener('change', (e) => {
        this.testSpiral = e.target.value;
      });
    }
    
    // Spiral direction button
    const spiralDirectionBtn = document.getElementById('spiral-direction-btn');
    if (spiralDirectionBtn) {
      spiralDirectionBtn.addEventListener('click', () => {
        this.spiralDirection = (this.spiralDirection === 'cw') ? 'ccw' : 'cw';
        spiralDirectionBtn.textContent = this.spiralDirection.toUpperCase();
      });
    }
    
    // Speed range
    const speedRange = document.getElementById('speed-range');
    if (speedRange) {
      speedRange.addEventListener('input', (e) => {
        this.testSpeed = parseInt(e.target.value);
        const speedValue = document.getElementById('speed-value');
        if (speedValue) speedValue.textContent = this.testSpeed;
      });
    }
    
    // Swirl range
    const swirlRange = document.getElementById('swirl-range');
    if (swirlRange) {
      swirlRange.addEventListener('input', (e) => {
        this.testSwirlStrength = parseFloat(e.target.value);
        const swirlValue = document.getElementById('swirl-value');
        if (swirlValue) swirlValue.textContent = this.testSwirlStrength;
      });
    }
    
    // Slice select
    const sliceSelect = document.getElementById('slice-select');
    if (sliceSelect) {
      sliceSelect.addEventListener('change', (e) => {
        this.testSlice = e.target.value;
      });
    }
    
    // Color offset range
    const colorOffsetRange = document.getElementById('color-offset-range');
    if (colorOffsetRange) {
      colorOffsetRange.addEventListener('input', (e) => {
        this.testColorOffset = parseInt(e.target.value);
        const colorOffsetValue = document.getElementById('color-offset-value');
        if (colorOffsetValue) colorOffsetValue.textContent = this.testColorOffset;
      });
    }
    
    // Pixel sort select
    const pixelSortSelect = document.getElementById('pixel-sort-select');
    if (pixelSortSelect) {
      pixelSortSelect.addEventListener('change', (e) => {
        this.testPixelSort = e.target.value;
      });
    }
    
    // Color effect select
    const colorEffectSelect = document.getElementById('color-effect-select');
    if (colorEffectSelect) {
      colorEffectSelect.addEventListener('change', (e) => {
        this.testColorEffect = e.target.value;
      });
    }
    
    // Color intensity range
    const colorIntensityRange = document.getElementById('color-intensity-range');
    if (colorIntensityRange) {
      colorIntensityRange.addEventListener('input', (e) => {
        this.testColorIntensity = parseInt(e.target.value);
        const colorIntensityValue = document.getElementById('color-intensity-value');
        if (colorIntensityValue) colorIntensityValue.textContent = this.testColorIntensity;
      });
    }
  }

  /**
   * NEW: Set up enhanced filter effect controls
   */
  setupFilterControls() {
    // Set up filter controls UI callback
    this.filterControlsUI.onControlChange((filterType, controlId, value) => {
      this.handleFilterControlChange(filterType, controlId, value);
    });
    
    // Filter effect select
    const filterEffectSelect = document.getElementById('filter-effect-select');
    if (filterEffectSelect) {
      filterEffectSelect.addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        this.filterEffect = selectedValue;
        
        // Show the appropriate filter controls
        this.showFilterControls(selectedValue);
        
        // Parse the filter type and style
        if (selectedValue.startsWith('artistic-')) {
          // Extract the style from compound value
          const style = selectedValue.replace('artistic-', '');
          this.filterOptions.artisticStyle = style;
          
          // Update the style-specific UI will be called from showFilterControls
        }
      });
    }
    
    // Filter intensity range
    const filterIntensityRange = document.getElementById('filter-intensity-range');
    if (filterIntensityRange) {
      filterIntensityRange.addEventListener('input', (e) => {
        this.filterIntensity = parseInt(e.target.value);
        const filterIntensityValue = document.getElementById('filter-intensity-value');
        if (filterIntensityValue) filterIntensityValue.textContent = this.filterIntensity;
      });
    }
    
    // Enhanced Halftone Controls
    this.setupHalftoneControls();
    this.setupHalftoneHTMLControls();
    
    // Enhanced Motion Blur Controls
    this.setupMotionBlurControls();
    
    // Existing filter controls
    this.setupBasicFilterControls();
    
    // NEW: Advanced filter controls
    this.setupAdvancedFilterControls();

    // NEW: Artistic filter controls
    this.setupArtisticControls();
  }
  
  /**
   * Setup HTML halftone controls that are in the HTML
   */
  setupHalftoneHTMLControls() {
    // Pattern control
    const patternSelect = document.getElementById('halftone-pattern');
    if (patternSelect) {
      patternSelect.addEventListener('change', (e) => {
        this.filterOptions.halftone.pattern = e.target.value;
      });
    }
    
    // Dot size control
    const dotSizeRange = document.getElementById('halftone-dot-size');
    if (dotSizeRange) {
      dotSizeRange.addEventListener('input', (e) => {
        this.filterOptions.halftone.dotSize = parseInt(e.target.value);
        const dotSizeValue = document.getElementById('halftone-dot-size-value');
        if (dotSizeValue) dotSizeValue.textContent = e.target.value + 'px';
      });
    }
    
    // Angle control
    const angleRange = document.getElementById('halftone-angle');
    if (angleRange) {
      angleRange.addEventListener('input', (e) => {
        this.filterOptions.halftone.angle = parseInt(e.target.value);
        const angleValue = document.getElementById('halftone-angle-value');
        if (angleValue) angleValue.textContent = e.target.value + '°';
      });
    }
    
    // Threshold control
    const thresholdRange = document.getElementById('halftone-threshold');
    if (thresholdRange) {
      thresholdRange.addEventListener('input', (e) => {
        this.filterOptions.halftone.threshold = parseInt(e.target.value);
        const thresholdValue = document.getElementById('halftone-threshold-value');
        if (thresholdValue) thresholdValue.textContent = e.target.value;
      });
    }
    
    // Color mode control
    const colorModeSelect = document.getElementById('halftone-color-mode');
    if (colorModeSelect) {
      colorModeSelect.addEventListener('change', (e) => {
        this.filterOptions.halftone.colorMode = e.target.value;
      });
    }
  }
  
  /**
   * Setup enhanced halftone controls
   */
  setupHalftoneControls() {
    const container = document.getElementById('halftone-controls-container');
    if (!container) return;
    container.innerHTML = ''; // Clear existing controls

    const filterKey = 'halftone';
    const paramConfigs = this.filterParamsConfig[filterKey];
    if (!paramConfigs) return;

    for (const paramKey in paramConfigs) {
      const config = paramConfigs[paramKey];
      const labelText = paramKey.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
      let controlElement = null;

      switch (config.type) {
        case 'slider':
          controlElement = this._createSliderControl(labelText, paramKey, config, this.filterOptions[filterKey]);
          break;
        case 'dropdown':
          controlElement = this._createDropdownControl(labelText, paramKey, config, this.filterOptions[filterKey]);
          break;
        case 'toggle':
          controlElement = this._createToggleControl(labelText, paramKey, config, this.filterOptions[filterKey]);
          break;
        // Add other control types as needed
      }

      if (controlElement) {
        container.appendChild(controlElement);
        console.log('✅ Added control for:', paramKey);
      } else {
        console.error('❌ Failed to create control for:', paramKey);
      }
    }
  }

  /**
   * Setup enhanced motion blur controls
   */
  setupMotionBlurControls() {
    const container = document.getElementById('motion-blur-controls-container');
    if (!container) return;
    container.innerHTML = ''; // Clear existing controls

    const filterKey = 'motionBlur';
    const paramConfigs = this.filterParamsConfig[filterKey];
    if (!paramConfigs) return;

    const targetOptionsObject = this.filterOptions[filterKey];

    for (const paramKey in paramConfigs) {
      const config = paramConfigs[paramKey];
      const labelText = paramKey.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
      let controlElement = null;

      switch (config.type) {
        case 'slider':
          controlElement = this._createSliderControl(labelText, paramKey, config, targetOptionsObject);
          break;
        case 'dropdown':
          controlElement = this._createDropdownControl(labelText, paramKey, config, targetOptionsObject);
          break;
      }

      if (controlElement) {
        // Add special listener for direction to show/hide other controls
        if (paramKey === 'direction') {
            const select = controlElement.querySelector('select');
            if(select) {
                select.addEventListener('change', (e) => {
                    // The value is already updated by the generic handler, just need to run the side effect
                    this.showMotionBlurOptions(e.target.value);
                });
            }
        }
        container.appendChild(controlElement);
      }
    }
    // Set initial visibility of conditional controls
    this.showMotionBlurOptions(targetOptionsObject.direction);
  }

  /**
   * Setup basic filter controls (existing)
   */
  setupBasicFilterControls() {
    // Pop Art style select
    const popArtStyleSelect = document.getElementById('pop-art-style');
    if (popArtStyleSelect) {
      popArtStyleSelect.addEventListener('change', (e) => {
        this.filterOptions.style = e.target.value;
      });
    }
    
    // Vintage film type select
    const vintageFilmSelect = document.getElementById('vintage-film-type');
    if (vintageFilmSelect) {
      vintageFilmSelect.addEventListener('change', (e) => {
        this.filterOptions.filmType = e.target.value;
      });
    }
    
    // Film grain range (for vintage filters)
    const filmGrainRange = document.getElementById('film-grain-range');
    if (filmGrainRange) {
      filmGrainRange.addEventListener('input', (e) => {
        this.filterOptions.grainAmount = parseInt(e.target.value);
        const filmGrainValue = document.getElementById('film-grain-value');
        if (filmGrainValue) filmGrainValue.textContent = this.filterOptions.grainAmount;
      });
    }
  }
  
  /**
   * Setup advanced filter controls (NEW)
   */
  setupAdvancedFilterControls() {
    // Liquify controls
    this.setupLiquifyControls();
    
    // Color grading controls
    this.setupColorGradingControls();
    
    // Noise controls
    this.setupNoiseControls();
  }
  
  /**
   * Setup liquify filter controls
   */
  setupLiquifyControls() {
    const container = document.getElementById('liquify-controls-container');
    if (!container) return;
    container.innerHTML = ''; // Clear existing controls

    const filterKey = 'liquify';
    const paramConfigs = this.filterParamsConfig[filterKey];
    if (!paramConfigs) return;

    const targetOptionsObject = this.filterOptions[filterKey];

    for (const paramKey in paramConfigs) {
      const config = paramConfigs[paramKey];
      const labelText = paramKey.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
      let controlElement = null;

      switch (config.type) {
        case 'slider':
          controlElement = this._createSliderControl(labelText, paramKey, config, targetOptionsObject);
          break;
        case 'dropdown':
          controlElement = this._createDropdownControl(labelText, paramKey, config, targetOptionsObject);
          break;
      }

      if (controlElement) {
        container.appendChild(controlElement);
      }
    }
    
    // Add mouse position tracking for liquify center
    this.setupLiquifyMouseTracking();
  }
  
  /**
   * Setup mouse tracking for liquify effect center position
   */
  setupLiquifyMouseTracking() {
    const canvas = this.canvasManager.canvas;
    if (!canvas) return;
    
    let isTracking = false;
    
    // Add click-to-set center functionality
    canvas.addEventListener('click', (e) => {
      if (this.filterEffect === 'liquify') {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Update liquify center position
        this.filterOptions.liquify.centerX = x;
        this.filterOptions.liquify.centerY = y;
        
        console.log(`🎯 Liquify center set to: (${x.toFixed(0)}, ${y.toFixed(0)})`);
      }
    });
    
    // Add visual feedback on hover
    canvas.addEventListener('mousemove', (e) => {
      if (this.filterEffect === 'liquify') {
        canvas.style.cursor = 'crosshair';
      } else {
        canvas.style.cursor = 'default';
      }
    });
  }
  
  /**
   * Setup color grading controls
   */
  setupColorGradingControls() {
    // Temperature control
    const temperatureRange = document.getElementById('color-grading-temperature');
    if (temperatureRange) {
      temperatureRange.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        // Store in both places for compatibility
        this.filterOptions.temperature = value;
        this.filterOptions.colorGrading.temperature = value;
        const temperatureValue = document.getElementById('color-grading-temperature-value');
        if (temperatureValue) temperatureValue.textContent = value;
      });
    }
    
    // Tint control
    const tintRange = document.getElementById('color-grading-tint');
    if (tintRange) {
      tintRange.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        // Store in both places for compatibility
        this.filterOptions.tint = value;
        this.filterOptions.colorGrading.tint = value;
        const tintValue = document.getElementById('color-grading-tint-value');
        if (tintValue) tintValue.textContent = value;
      });
    }
    
    // Vibrance control
    const vibranceRange = document.getElementById('color-grading-vibrance');
    if (vibranceRange) {
      vibranceRange.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        // Store in both places for compatibility
        this.filterOptions.vibrance = value;
        this.filterOptions.colorGrading.vibrance = value;
        const vibranceValue = document.getElementById('color-grading-vibrance-value');
        if (vibranceValue) vibranceValue.textContent = value;
      });
    }
    
    // Saturation control
    const saturationRange = document.getElementById('color-grading-saturation');
    if (saturationRange) {
      saturationRange.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        // Store in both places for compatibility
        this.filterOptions.saturation = value;
        this.filterOptions.colorGrading.saturation = value;
        const saturationValue = document.getElementById('color-grading-saturation-value');
        if (saturationValue) saturationValue.textContent = value;
      });
    }
  }
  
  /**
   * Setup noise filter controls
   */
  setupNoiseControls() {
    const container = document.getElementById('noise-controls-container');
    if (!container) return;
    container.innerHTML = ''; // Clear existing controls

    const filterKey = 'noise';
    const paramConfigs = this.filterParamsConfig[filterKey];
    if (!paramConfigs) return;

    const targetOptionsObject = this.filterOptions[filterKey];

    for (const paramKey in paramConfigs) {
      const config = paramConfigs[paramKey];
      const labelText = paramKey.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
      let controlElement = null;

      switch (config.type) {
        case 'slider':
          controlElement = this._createSliderControl(labelText, paramKey, config, targetOptionsObject);
          break;
        case 'dropdown':
          controlElement = this._createDropdownControl(labelText, paramKey, config, targetOptionsObject);
          break;
        case 'toggle':
          controlElement = this._createToggleControl(labelText, paramKey, config, targetOptionsObject);
          break;
      }

      if (controlElement) {
        container.appendChild(controlElement);
      }
    }
  }
  
  /**
   * Update filter controls dynamically
   */
  updateFilterControls(filterType) {
    // Get the appropriate container based on filter type
    let container = null;
    
    if (filterType === 'emboss') {
      container = document.getElementById('emboss-controls-container');
    } else if (filterType === 'edgeDetect') {
      container = document.getElementById('edge-detect-controls-container');
    } else if (filterType === 'vignette') {
      container = document.getElementById('vignette-controls-container');
    } else if (filterType.startsWith('cyberpunk-')) {
      container = document.getElementById('cyberpunk-style-controls-container');
    } else if (filterType.startsWith('artistic-')) {
      container = document.getElementById('artistic-style-controls-container');
    } else if (filterType.startsWith('atmospheric-')) {
      container = document.getElementById('atmospheric-style-controls-container');
    } else if (filterType.startsWith('experimental-')) {
      container = document.getElementById('experimental-style-controls-container');
    } else if (filterType === 'dithering') {
      container = document.getElementById('dithering-controls');
    }
    
    if (container) {
      this.filterControlsUI.updateControlsContainer(filterType, container);
    }
  }
  
  /**
   * Handle filter control changes from dynamic UI
   */
  handleFilterControlChange(filterType, controlId, value) {
    console.log(`🎛️ Filter control change: ${filterType} - ${controlId} = ${value}`);
    
    // Map the control values to filter options
    const paramMap = {
      // Emboss
      'emboss-angle': () => { this.filterOptions.embossAngle = parseFloat(value); },
      'emboss-depth': () => { this.filterOptions.embossDepth = parseFloat(value); },
      'emboss-blend': () => { this.filterOptions.embossBlend = value; },
      
      // Edge Detection
      'edge-method': () => { this.filterOptions.edgeMethod = value; },
      'edge-threshold': () => { this.filterOptions.edgeThreshold = parseInt(value); },
      'edge-color': () => { this.filterOptions.edgeColor = FilterControlsUI.hexToRgb(value); },
      'edge-background': () => { this.filterOptions.edgeBackground = value; },
      
      // Vignette
      'vignette-shape': () => { this.filterOptions.vignetteShape = value; },
      'vignette-size': () => { this.filterOptions.vignetteSize = parseFloat(value); },
      'vignette-softness': () => { this.filterOptions.vignetteSoftness = parseFloat(value); },
      'vignette-x': () => { this.filterOptions.vignetteX = parseFloat(value); },
      'vignette-y': () => { this.filterOptions.vignetteY = parseFloat(value); },
      'vignette-color': () => { this.filterOptions.vignetteColor = FilterControlsUI.hexToRgb(value); },
      
      // Cyberpunk filters
      'glow-radius': () => { this.filterOptions.glowRadius = parseFloat(value); },
      'digital-noise': () => { this.filterOptions.digitalNoise = parseFloat(value); },
      'gradient-strength': () => { this.filterOptions.gradientStrength = parseFloat(value); },
      'rain-density': () => { this.filterOptions.rainDensity = parseFloat(value); },
      'flicker-rate': () => { this.filterOptions.flickerRate = parseFloat(value); },
      'scan-speed': () => { this.filterOptions.scanSpeed = parseFloat(value); },
      
      // Artistic filters - these map to nested objects
      'brush-size': () => { this.updateArtisticParam('brushSize', parseInt(value)); },
      'stroke-length': () => { this.updateArtisticParam('strokeLength', parseInt(value)); },
      'texture-strength': () => { this.updateArtisticParam('textureStrength', parseFloat(value)); },
      'color-smearing': () => { this.updateArtisticParam('colorSmearing', parseFloat(value)); },
      'bleed-amount': () => { this.updateArtisticParam('bleedAmount', parseFloat(value)); },
      'pigment-density': () => { this.updateArtisticParam('pigmentDensity', parseFloat(value)); },
      'edge-darkening': () => { this.updateArtisticParam('edgeDarkening', parseFloat(value)); },
      'paper-texture': () => { this.updateArtisticParam('paperTexture', parseFloat(value)); },
      'stroke-width': () => { this.updateArtisticParam('strokeWidth', parseInt(value)); },
      'hatch-density': () => { this.updateArtisticParam('hatchDensity', parseFloat(value)); },
      'sketch-edge-threshold': () => { this.updateArtisticParam('edgeThreshold', parseInt(value)); },
      'graphite-shading': () => { this.updateArtisticParam('graphiteShading', parseFloat(value)); },
      'tile-size': () => { this.updateArtisticParam('tileSize', parseInt(value)); },
      'grout-thickness': () => { this.updateArtisticParam('groutThickness', parseInt(value)); },
      'mosaic-color-variation': () => { this.updateArtisticParam('colorVariation', parseFloat(value)); },
      'grout-color': () => { this.updateArtisticParam('groutColor', FilterControlsUI.hexToRgb(value)); },
      'cell-size': () => { this.updateArtisticParam('cellSize', parseInt(value)); },
      'border-thickness': () => { this.updateArtisticParam('borderThickness', parseInt(value)); },
      'border-color': () => { this.updateArtisticParam('borderColor', FilterControlsUI.hexToRgb(value)); },
      'light-refraction': () => { this.updateArtisticParam('lightRefraction', parseFloat(value)); },
      'ink-outline-strength': () => { this.updateArtisticParam('inkOutlineStrength', parseFloat(value)); },
      'color-levels': () => { this.updateArtisticParam('colorLevels', parseInt(value)); },
      'halftone-dot-size': () => { this.updateArtisticParam('halftoneDotSize', parseInt(value)); },
      'comic-edge-threshold': () => { this.updateArtisticParam('edgeThreshold', parseInt(value)); },
      'line-spacing': () => { this.updateArtisticParam('lineSpacing', parseInt(value)); },
      'line-thickness': () => { this.updateArtisticParam('lineThickness', parseInt(value)); },
      'angle-variation': () => { this.updateArtisticParam('angleVariation', parseFloat(value)); },
      'hatch-darkness': () => { this.updateArtisticParam('hatchDarkness', parseFloat(value)); },
      'background-lightness': () => { this.updateArtisticParam('backgroundLightness', parseFloat(value)); },
      'dot-size': () => { this.updateArtisticParam('dotSize', parseInt(value)); },
      'density': () => { this.updateArtisticParam('density', parseFloat(value)); },
      'pointillism-color-variation': () => { this.updateArtisticParam('colorVariation', parseFloat(value)); },
      'dot-shape': () => { this.updateArtisticParam('dotShape', value); },
      'background-brightness': () => { this.updateArtisticParam('backgroundBrightness', parseFloat(value)); },
      
      // Atmospheric filters
      'fog-density': () => { this.filterOptions.fogDensity = parseFloat(value); },
      'fog-color': () => { this.filterOptions.fogColor = FilterControlsUI.hexToRgb(value); },
      'rain-density': () => { this.filterOptions.rainDensity = parseFloat(value); },
      'rain-length': () => { this.filterOptions.rainLength = parseInt(value); },
      'snow-density': () => { this.filterOptions.snowDensity = parseFloat(value); },
      'snow-size': () => { this.filterOptions.snowSize = parseInt(value); },
      'dust-density': () => { this.filterOptions.dustDensity = parseFloat(value); },
      'dust-color': () => { this.filterOptions.dustColor = FilterControlsUI.hexToRgb(value); },
      'distortion-strength': () => { this.filterOptions.distortionStrength = parseInt(value); },
      'bubble-density': () => { this.filterOptions.bubbleDensity = parseFloat(value); },
      'wave-strength': () => { this.filterOptions.waveStrength = parseInt(value); },
      'lightning-chance': () => { this.filterOptions.lightningChance = parseFloat(value); },
      
      // Experimental filters
      'segments': () => { this.filterOptions.segments = parseInt(value); },
      'iterations': () => { this.filterOptions.iterations = parseInt(value); },
      'zoom': () => { this.filterOptions.zoom = parseFloat(value); },
      'tunnel-speed': () => { this.filterOptions.tunnelSpeed = parseFloat(value); },
      'warp-strength': () => { this.filterOptions.warpStrength = parseInt(value); },
      'shift-amount': () => { this.filterOptions.shiftAmount = parseInt(value); },
      'bend-strength': () => { this.filterOptions.bendStrength = parseFloat(value); },
      'mirror-type': () => { this.filterOptions.mirrorType = value; },
      'glitch-density': () => { this.filterOptions.glitchDensity = parseFloat(value); },
      
      // Dithering filters
      'dithering-algorithm': () => { this.filterOptions.dithering.algorithm = value; },
      'dithering-color-mode': () => { this.filterOptions.dithering.colorMode = value; },
      'dithering-cga-palette': () => { this.filterOptions.dithering.cgaPalette = parseInt(value); },
      'dithering-color-levels': () => { this.filterOptions.dithering.colorLevels = parseInt(value); },
      'dithering-levels-per-channel': () => { this.filterOptions.dithering.levelsPerChannel = parseInt(value); },
      'dithering-serpentine': () => { this.filterOptions.dithering.serpentine = value; },
      'dithering-brightness': () => { this.filterOptions.dithering.brightness = parseInt(value); },
      'dithering-contrast': () => { this.filterOptions.dithering.contrast = parseInt(value); }
    };
    
    // Execute the mapping if it exists
    const handler = paramMap[controlId];
    if (handler) {
      handler();
    }
  }
  
  /**
   * Helper to update artistic filter parameters
   */
  updateArtisticParam(paramName, value) {
    const style = this.filterOptions.artisticStyle;
    if (!this.filterOptions.artisticParams[style]) {
      this.filterOptions.artisticParams[style] = {};
    }
    this.filterOptions.artisticParams[style][paramName] = value;
  }
  
  /**
   * Show/hide filter-specific controls based on selected filter
   */
  showFilterControls(filterType) {
    console.log('🎨 showFilterControls called with:', filterType);
    
    // Update UI visibility using the filter controls UI system
    FilterControlsUI.updateControlVisibility(filterType);
    
    // Also update dynamic controls if needed
    this.updateFilterControls(filterType);
    
    // Hide all filter-specific controls first
    const allFilterControls = document.querySelectorAll('.filter-controls');
    allFilterControls.forEach(control => {
      control.style.display = 'none';
    });
    
    // Parse filter type to get base filter
    const [baseFilter, subType] = filterType.includes('-') ? 
      filterType.split('-', 2) : [filterType, null];
    
    // Show relevant controls based on filter type
    switch (baseFilter) {
      case 'popArt':
        const popArtControls = document.getElementById('pop-art-controls');
        if (popArtControls) {
          popArtControls.style.display = 'block';
          console.log('  ✅ Showing pop-art-controls');
        }
        break;
        
      case 'vintage':
        const vintageControls = document.getElementById('vintage-controls');
        if (vintageControls) {
          vintageControls.style.display = 'block';
          console.log('  ✅ Showing vintage-controls');
        }
        break;
        
      case 'motionBlur':
        const motionBlurControls = document.getElementById('motion-blur-controls');
        if (motionBlurControls) {
          motionBlurControls.style.display = 'block';
          this.showMotionBlurOptions(this.filterOptions.motionBlur.direction);
          console.log('  ✅ Showing motion-blur-controls');
        }
        break;
        
      case 'halftone':
        const halftoneControls = document.getElementById('halftone-controls');
        if (halftoneControls) {
          halftoneControls.style.display = 'block';
          console.log('  ✅ Showing halftone-controls');
        }
        break;
        
      case 'liquify':
        const liquifyControls = document.getElementById('liquify-controls');
        if (liquifyControls) {
          liquifyControls.style.display = 'block';
          console.log('  ✅ Showing liquify-controls');
        }
        break;
        
      case 'colorGrading':
        const colorGradingControls = document.getElementById('color-grading-controls');
        if (colorGradingControls) {
          colorGradingControls.style.display = 'block';
          console.log('  ✅ Showing color-grading-controls');
        }
        break;
        
      case 'noise':
        const noiseControls = document.getElementById('noise-controls');
        if (noiseControls) {
          noiseControls.style.display = 'block';
          console.log('  ✅ Showing noise-controls');
        }
        break;
        
      case 'artistic':
        const artisticControls = document.getElementById('artistic-controls');
        if (artisticControls) {
          artisticControls.style.display = 'block';
          console.log('  ✅ Showing artistic-controls');
          console.log('  🎨 Filter type:', filterType, 'Base:', baseFilter, 'SubType:', subType);
          // Update the artistic style-specific controls
          if (subType) {
            this.updateArtisticStyleSpecificUI(subType);
          } else {
            console.warn('  ⚠️ No subType found for artistic filter');
          }
        }
        break;
        
      case 'emboss':
        const embossControls = document.getElementById('emboss-controls');
        if (embossControls) {
          embossControls.style.display = 'block';
          console.log('  ✅ Showing emboss-controls');
        }
        break;
        
      case 'edgeDetect':
        const edgeDetectControls = document.getElementById('edge-detect-controls');
        if (edgeDetectControls) {
          edgeDetectControls.style.display = 'block';
          console.log('  ✅ Showing edge-detect-controls');
        }
        break;
        
      case 'vignette':
        const vignetteControls = document.getElementById('vignette-controls');
        if (vignetteControls) {
          vignetteControls.style.display = 'block';
          console.log('  ✅ Showing vignette-controls');
        }
        break;
        
      case 'cyberpunk':
        const cyberpunkControls = document.getElementById('cyberpunk-controls');
        if (cyberpunkControls) {
          cyberpunkControls.style.display = 'block';
          console.log('  ✅ Showing cyberpunk-controls');
        }
        break;
        
      case 'atmospheric':
        const atmosphericControls = document.getElementById('atmospheric-controls');
        if (atmosphericControls) {
          atmosphericControls.style.display = 'block';
          console.log('  ✅ Showing atmospheric-controls');
        }
        break;
        
      case 'experimental':
        const experimentalControls = document.getElementById('experimental-controls');
        if (experimentalControls) {
          experimentalControls.style.display = 'block';
          console.log('  ✅ Showing experimental-controls');
          // Generate the dynamic controls for experimental filters
          this.generateExperimentalControls(filterType, subType);
        }
        break;
        
      case 'dithering':
        const ditheringControls = document.getElementById('dithering-controls');
        if (ditheringControls) {
          ditheringControls.style.display = 'block';
          console.log('  ✅ Showing dithering-controls');
        }
        break;
        
      default:
        console.log('ℹ️ No additional controls needed for:', filterType);
        break;
    }
    
    console.log('✅ showFilterControls completed for:', filterType);
  }
  
  /**
   * Show/hide motion blur specific options based on direction
   */
  showMotionBlurOptions(direction) {
    const customAngleControls = document.getElementById('motion-blur-custom-angle-controls');
    const radialControls = document.getElementById('motion-blur-radial-controls');
    
    // Hide all optional controls first
    if (customAngleControls) customAngleControls.style.display = 'none';
    if (radialControls) radialControls.style.display = 'none';
    
    // Show relevant controls based on direction
    switch (direction) {
      case 'custom':
        if (customAngleControls) customAngleControls.style.display = 'block';
        break;
      case 'radial':
        if (radialControls) radialControls.style.display = 'block';
        break;
    }
  }
  
  /**
   * Setup controls for the artistic filter styles.
   */
  setupArtisticControls() {
    // The style is now determined by the main filter dropdown selection
    // No need for a separate artistic style selector
  }

  /**
   * Update the UI to show controls specific to the selected artistic style.
   * @param {string} styleName - The name of the selected artistic style (e.g., 'oil_painting').
   */
  updateArtisticStyleSpecificUI(styleName) {
    console.log('🎨 updateArtisticStyleSpecificUI called with style:', styleName);
    const container = document.getElementById('artistic-style-controls-container');
    if (!container) {
      console.error('❌ artistic-style-controls-container not found!');
      return;
    }

    // Clear previous controls
    container.innerHTML = '';

    const paramConfigs = this.artisticParamsConfig[styleName];
    if (!paramConfigs) {
      console.error('❌ No config found for artistic style:', styleName);
      console.log('Available styles:', Object.keys(this.artisticParamsConfig));
      return;
    }

    // Ensure the artistic params object exists for this style
    if (!this.filterOptions.artisticParams[styleName]) {
      this.filterOptions.artisticParams[styleName] = {};
    }
    const targetOptionsObject = this.filterOptions.artisticParams[styleName];
    console.log('🎯 Creating controls for', Object.keys(paramConfigs).length, 'parameters');

    for (const paramKey in paramConfigs) {
      const config = paramConfigs[paramKey];
      // Simple conversion from camelCase to Title Case for the label
      const labelText = paramKey.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());

      let controlElement = null;
      switch (config.type) {
        case 'slider':
          controlElement = this._createSliderControl(labelText, paramKey, config, targetOptionsObject);
          break;
        case 'color':
          controlElement = this._createColorPickerControl(labelText, paramKey, config, targetOptionsObject);
          break;
        case 'dropdown':
          controlElement = this._createDropdownControl(labelText, paramKey, config, targetOptionsObject);
          break;
      }

      if (controlElement) {
        container.appendChild(controlElement);
      }
    }
  }

  // --- UI Helper Functions for Dynamic Controls ---

  _createSliderControl(labelText, paramKey, config, targetOptionsObject) {
    const currentValue = targetOptionsObject[paramKey] !== undefined ? targetOptionsObject[paramKey] : config.default || config.min;

    const controlRow = document.createElement('div');
    controlRow.className = 'control-row';

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'slider-container';

    const sliderLabelDiv = document.createElement('div');
    sliderLabelDiv.className = 'slider-label';

    const labelSpan = document.createElement('span');
    labelSpan.textContent = labelText;
    sliderLabelDiv.appendChild(labelSpan);

    const valueSpan = document.createElement('span');
    valueSpan.className = 'slider-value';
    valueSpan.id = `artistic-${paramKey}-value`;
    valueSpan.textContent = `${currentValue}${config.unit || ''}`;
    sliderLabelDiv.appendChild(valueSpan);

    sliderContainer.appendChild(sliderLabelDiv);

    const sliderInput = document.createElement('input');
    sliderInput.type = 'range';
    sliderInput.className = 'control-slider';
    sliderInput.min = config.min;
    sliderInput.max = config.max;
    sliderInput.step = config.step || 1;
    sliderInput.value = currentValue;
    sliderInput.id = `artistic-${paramKey}-slider`;

    sliderInput.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      targetOptionsObject[paramKey] = value;
      valueSpan.textContent = config.unit ? `${value}${config.unit}` : value;
    });

    sliderContainer.appendChild(sliderInput);
    controlRow.appendChild(sliderContainer);
    return controlRow;
  }

  _createColorPickerControl(labelText, paramKey, config, targetOptionsObject) {
    const currentValue = targetOptionsObject[paramKey] || config.default || '#000000';

    const controlRow = document.createElement('div');
    controlRow.className = 'control-row';

    const label = document.createElement('label');
    label.textContent = labelText;
    label.htmlFor = `artistic-${paramKey}-color`;
    controlRow.appendChild(label);

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.id = `artistic-${paramKey}-color`;
    colorInput.value = currentValue;
    colorInput.className = 'control-color-picker';
    colorInput.style.width = '100%';
    colorInput.style.height = '40px';
    colorInput.style.marginTop = '5px';
    colorInput.style.cursor = 'pointer';

    colorInput.addEventListener('input', (e) => {
      targetOptionsObject[paramKey] = e.target.value;
    });

    controlRow.appendChild(colorInput);
    return controlRow;
  }

  _createDropdownControl(labelText, paramKey, config, targetOptionsObject) {
    const currentValue = targetOptionsObject[paramKey] || config.default || (config.options[0] && (typeof config.options[0] === 'object' ? config.options[0].value : config.options[0]));

    const controlRow = document.createElement('div');
    controlRow.className = 'control-row';

    const label = document.createElement('label');
    label.textContent = labelText;
    label.htmlFor = `artistic-${paramKey}-select`;
    controlRow.appendChild(label);

    const selectInput = document.createElement('select');
    selectInput.className = 'control-select';
    selectInput.id = `artistic-${paramKey}-select`;

    config.options.forEach(opt => {
      const optionEl = document.createElement('option');
      optionEl.value = typeof opt === 'object' ? opt.value : opt;
      optionEl.textContent = typeof opt === 'object' ? opt.label : opt;
      if (optionEl.value === currentValue) {
        optionEl.selected = true;
      }
      selectInput.appendChild(optionEl);
    });

    selectInput.addEventListener('change', (e) => {
      targetOptionsObject[paramKey] = e.target.value;
    });

    controlRow.appendChild(selectInput);
    return controlRow;
  }

  _createToggleControl(labelText, paramKey, config, targetOptionsObject) {
    const currentValue = targetOptionsObject[paramKey];

    const controlRow = document.createElement('div');
    controlRow.className = 'control-row toggle-control'; // Add a specific class for styling

    const label = document.createElement('label');
    label.textContent = labelText;
    const toggleId = `filter-${paramKey}-toggle`;
    label.htmlFor = toggleId;
    controlRow.appendChild(label);

    const toggleSwitch = document.createElement('div');
    toggleSwitch.className = 'toggle-switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = toggleId;
    input.checked = currentValue;

    const slider = document.createElement('span');
    slider.className = 'slider round';

    toggleSwitch.appendChild(input);
    toggleSwitch.appendChild(slider);

    input.addEventListener('change', (e) => {
      targetOptionsObject[paramKey] = e.target.checked;
    });

    controlRow.appendChild(toggleSwitch);
    return controlRow;
  }

  /**
   * Generate experimental controls for specific experimental filters
   */
  generateExperimentalControls(filterType, subType) {
    const container = document.getElementById('experimental-controls');
    if (!container) return;
    
    // Clear existing controls
    container.innerHTML = '';
    
    let controls = [];
    
    // Define controls based on the specific experimental filter
    switch (filterType) {
      case 'experimental-kaleidoscope':
        controls = [
          { type: 'slider', id: 'segments', label: 'Segments', min: 3, max: 12, default: 6 }
        ];
        break;
        
      case 'experimental-fractal':
        controls = [
          { type: 'slider', id: 'iterations', label: 'Iterations', min: 3, max: 10, default: 5 },
          { type: 'slider', id: 'zoom', label: 'Zoom', min: 0.5, max: 3, step: 0.1, default: 1 }
        ];
        break;
        
      case 'experimental-tunnel':
        controls = [
          { type: 'slider', id: 'tunnel-speed', label: 'Tunnel Speed', min: 0.5, max: 3, step: 0.1, default: 1 }
        ];
        break;
        
      case 'experimental-warp':
        controls = [
          { type: 'slider', id: 'warp-strength', label: 'Warp Strength', min: 10, max: 50, default: 20 }
        ];
        break;
        
      case 'experimental-chromatic_shift':
        controls = [
          { type: 'slider', id: 'shift-amount', label: 'Shift Amount', min: 5, max: 20, default: 10 }
        ];
        break;
        
      case 'experimental-data_bend':
        controls = [
          { type: 'slider', id: 'bend-strength', label: 'Bend Strength', min: 0.05, max: 0.3, step: 0.05, default: 0.1 }
        ];
        break;
        
      case 'experimental-mirror_world':
        controls = [
          { type: 'select', id: 'mirror-type', label: 'Mirror Type', default: 'quad',
            options: [
              { value: 'horizontal', label: 'Horizontal' },
              { value: 'vertical', label: 'Vertical' },
              { value: 'quad', label: 'Quad' },
              { value: 'radial', label: 'Radial' }
            ]
          }
        ];
        break;
        
      case 'experimental-reality_glitch':
        controls = [
          { type: 'slider', id: 'glitch-density', label: 'Glitch Density', min: 0.02, max: 0.1, step: 0.01, default: 0.05 }
        ];
        break;
    }
    
    // Generate HTML for each control
    controls.forEach(control => {
      const controlElement = this.createControlElement(control);
      container.appendChild(controlElement);
    });
    
    console.log(`✅ Generated ${controls.length} experimental controls for ${filterType}`);
  }

  /**
   * Helper method to create control elements
   */
  createControlElement(control) {
    const controlRow = document.createElement('div');
    controlRow.className = 'control-row';
    
    if (control.type === 'slider') {
      controlRow.innerHTML = `
        <label for="${control.id}">${control.label}: 
          <span id="${control.id}-value">${control.default}${control.unit || ''}</span>
        </label>
        <input type="range" 
               id="${control.id}" 
               class="control-slider" 
               min="${control.min}" 
               max="${control.max}" 
               step="${control.step || 1}" 
               value="${control.default}">
      `;
      
      // Add event listener
      const slider = controlRow.querySelector('input');
      const valueSpan = controlRow.querySelector('span');
      slider.addEventListener('input', (e) => {
        const value = e.target.value;
        valueSpan.textContent = value + (control.unit || '');
        this.handleFilterControlChange('experimental', control.id, value);
      });
      
    } else if (control.type === 'select') {
      const optionsHTML = control.options.map(opt => 
        `<option value="${opt.value}" ${opt.value === control.default ? 'selected' : ''}>${opt.label}</option>`
      ).join('');
      
      controlRow.innerHTML = `
        <label for="${control.id}">${control.label}:</label>
        <select id="${control.id}" class="control-select">
          ${optionsHTML}
        </select>
      `;
      
      // Add event listener
      const select = controlRow.querySelector('select');
      select.addEventListener('change', (e) => {
        this.handleFilterControlChange('experimental', control.id, e.target.value);
      });
    }
    
    return controlRow;
  }



  /**
   * Start animation loop
   */
  startAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    
    if (!this.canvasManager.isImageLoaded()) {
      console.warn('No image loaded for animation');
      return;
    }

    this.isPaused = false;
    this.updatePlayPauseButton();
    this.activeClumps = [];
    this.frameCount = 0;
    this.lastFrameTime = 0;
    
    console.log('🎬 Starting animation with selection system and filter effects...');
    this.animate(0);
  }

  /**
   * Main animation loop - UPDATED with selection system integration and Effect Studio support
   */
  animate(currentTime) {
    // Frame rate limiting
    if (currentTime - this.lastFrameTime < 1000 / this.targetFrameRate) {
      this.animationId = requestAnimationFrame((time) => this.animate(time));
      return;
    }
    this.lastFrameTime = currentTime;

    // If paused AND not recording, then skip frame processing and just request next frame.
    // If recording, we must continue processing frames even if paused.
    if (this.isPaused && !this.isRecording) {
      this.animationId = requestAnimationFrame((time) => this.animate(time));
      return;
    }

    this.frameCount++;
    
    // Handle animated media frame advancement
    if (this.canvasManager.animationMode && this.frameTimer && this.isSourcePlaying) {
      const newFrameIndex = this.frameTimer.advance();
      if (newFrameIndex !== this.canvasManager.currentFrameIndex) {
        console.log(`[ANIMATE] Advancing to frame: ${newFrameIndex}`);
        // Update to new frame
        this.canvasManager.setCurrentFrame(newFrameIndex);
        this.canvasManager.mediaManager.currentFrame = newFrameIndex;
        this.canvasManager.updateMediaInfo();
        // Only reset glitch buffer if not accumulating
        if (!this.canvasManager.glitchBufferEnabled) {
          this.canvasManager.glitchImageData = copyImageData(this.canvasManager.originalImageData);
        }
      }
    }

    // Process effects based on current mode
    let finalImageData;
    
    if (this.studioMode && this.effectChainManager && this.effectChainManager.chain.length > 0) {
      // Use new effect chain system
      finalImageData = this.processStudioEffects(currentTime);
    } else {
      // Use existing classic effect system
      finalImageData = this.processClassicEffects();
    }
    
    // Ensure we have valid image data
    if (!finalImageData) {
      console.warn('No final image data, using glitch buffer');
      finalImageData = this.canvasManager.glitchImageData;
    }

    // Update canvas with final result
    this.canvasManager.ctx.putImageData(finalImageData, 0, 0);
    
    // Draw selection overlays (only when preview is enabled)
    this.selectionManager.drawInteractiveSelectionOverlay();
    
    // Also draw preview of active clumps if preview is enabled
    if (this.selectionManager.showSelectionPreview) {
      this.selectionManager.drawSelectionPreview(this.activeClumps);
    }

    // Continue animation
    this.animationId = requestAnimationFrame((time) => this.animate(time));
  }

  /**
   * NEW: Process effects using the studio effect chain
   */
  processStudioEffects(currentTime) {
    // Get current image data to process
    let imageData = this.canvasManager.glitchImageData;
    
    // Get selection mask if in manual mode
    const selectionMask = this.selectionManager.isInManualMode() ? 
      this.selectionManager.getSelectionMask() : null;
    
    // Manage clumps for effects that need them
    if (this.activeClumps.length === 0) {
      this.spawnNewClumps();
    }
    
    // Create context for effects that need it
    const context = {
      frameCount: this.frameCount,
      time: currentTime,
      clumps: this.activeClumps,
      canvasManager: this.canvasManager,
      selectionMask: selectionMask
    };
    
    // Process through effect chain
    try {
      const result = this.effectChainManager.processChain(
        imageData,
        selectionMask,
        context
      );
      
      // Update clumps (decrease lifetime, remove expired)
      this.activeClumps.forEach(clump => {
        clump.framesRemaining--;
      });
      this.activeClumps = this.activeClumps.filter(c => c.framesRemaining > 0);
      
      return result || imageData;
    } catch (error) {
      console.error('Error processing studio effects:', error);
      return imageData;
    }
  }

  /**
   * NEW: Process effects using the classic system (existing logic)
   */
  processClassicEffects() {
    // Manage selection-based clump spawning
    if (this.activeClumps.length === 0) {
      this.spawnNewClumps();
    }

    // Get current selection mask for effects (only used in manual mode)
    const selectionMask = this.selectionManager.isInManualMode() ? 
      this.selectionManager.getSelectionMask() : null;

    // Process active clumps (destructive effects)
    this.activeClumps.forEach(clump => {
      if (this.testDirection !== 'off') {
        DirectionEffects.applyDirectionShift(
          this.canvasManager.glitchImageData,
          clump,
          this.testSpeed,
          this.testDirection,
          selectionMask
        );
      }
      
      if (this.testSpiral !== 'off') {
        let swirlType = this.testSpiral;
        if (this.testSpiral === 'spiral') {
          swirlType = this.spiralDirection;
        }
        SpiralEffects.applySwirlEffect(
          this.canvasManager.glitchImageData,
          clump,
          this.testSwirlStrength,
          swirlType,
          this.spiralDirection,
          selectionMask
        );
      }
      
      clump.framesRemaining--;
    });

    // Remove expired clumps
    this.activeClumps = this.activeClumps.filter(c => c.framesRemaining > 0);

    // Apply slice effects
    if (this.testSlice !== 'off') {
      SliceEffects.applySliceGlitch(
        this.canvasManager.glitchImageData,
        this.testSlice,
        this.testColorOffset
      );
    }
    
    // Apply pixel sort effects (every 5 frames to avoid overwhelming)
    if (this.testPixelSort !== 'off' && this.frameCount % 5 === 0) {
      PixelSortEffects.applyPixelSort(
        this.canvasManager.glitchImageData,
        this.testPixelSort
      );
    }
    
    // Apply color effects
    if (this.testColorEffect !== 'off') {
      const newPixelData = ColorEffects.applyColorEffect(
        this.canvasManager.glitchImageData,
        this.testColorEffect,
        this.testColorIntensity
      );
      if (newPixelData && newPixelData !== this.canvasManager.glitchImageData.data) {
        this.canvasManager.glitchImageData.data.set(new Uint8ClampedArray(newPixelData));
      }
    }

    // Apply non-destructive filter effects as final pass
    let finalImageData = this.canvasManager.glitchImageData;
    if (this.filterEffect !== 'off') {
      let currentOptions = {};
      
      Object.assign(currentOptions, this.filterOptions);
      currentOptions.halftone = this.filterOptions.halftone;
      currentOptions.motionBlur = this.filterOptions.motionBlur;
      currentOptions.liquify = this.filterOptions.liquify;
      currentOptions.colorGrading = this.filterOptions.colorGrading;
      currentOptions.noise = this.filterOptions.noise;
      currentOptions.artisticParams = this.filterOptions.artisticParams;
      
      switch (this.filterEffect) {
        case 'cyberpunk':
          currentOptions.style = this.filterOptions.cyberpunkStyle;
          break;
        case 'artistic':
          currentOptions.style = this.filterOptions.artisticStyle;
          break;
        case 'atmospheric':
          currentOptions.style = this.filterOptions.atmosphericStyle;
          break;
        case 'experimental':
          currentOptions.style = this.filterOptions.experimentalStyle;
          break;
        case 'dithering':
          currentOptions.dithering = this.filterOptions.dithering;
          break;
      }
      
      finalImageData = FilterEffects.apply(
        this.canvasManager.glitchImageData,
        this.filterEffect,
        this.filterIntensity,
        currentOptions
      );
    }

    return finalImageData;
  }

  /**
   * Spawn new clumps using selection system
   */
  spawnNewClumps() {
    if (this.selectionManager.isInManualMode()) {
      // In manual mode, convert selection mask to clumps
      const regions = this.selectionManager.maskToRegions();
      this.activeClumps = this.selectionManager.selectionsToClumps(
        regions,
        this.minLifetime,
        this.maxLifetime
      );
    } else {
      // In automatic mode, generate selections using UI settings
      // Update selection engine with current image data
      this.selectionManager.updateImageData(this.canvasManager.glitchImageData);
      
      const selections = this.selectionUI.generateSelections();
      
      if (selections.length > 0) {
        this.activeClumps = this.selectionManager.selectionsToClumps(
          selections,
          this.minLifetime,
          this.maxLifetime
        );
      } else {
        // Fallback to random if no selections generated
        this.spawnTestClump();
      }
    }
    
    console.log(`🎯 Spawned ${this.activeClumps.length} new clumps`);
  }

  /**
   * Spawn a test clump for fallback (when selection system fails)
   */
  spawnTestClump() {
    const { width, height } = this.canvasManager.getImageDimensions();
    
    // Create a random rectangular region
    const w = Math.floor(Math.random() * 100) + 50;
    const h = Math.floor(Math.random() * 100) + 50;
    const x = Math.floor(Math.random() * (width - w));
    const y = Math.floor(Math.random() * (height - h));
    
    const clump = {
      x, y, w, h,
      framesRemaining: Math.floor(Math.random() * (this.maxLifetime - this.minLifetime)) + this.minLifetime,
      clumpDirection: this.testDirection === 'random' ? 
        ['down', 'up', 'left', 'right'][Math.floor(Math.random() * 4)] : 
        this.testDirection
    };
    
    this.activeClumps.push(clump);
    console.log(`🎯 Spawned fallback test clump at (${x}, ${y}) with direction: ${clump.clumpDirection}`);
  }

  /**
   * Toggle play/pause state
   */
  togglePlayPause() {
    this.isPaused = !this.isPaused;
    this.updatePlayPauseButton();
    console.log(this.isPaused ? '⏸️ Paused' : '▶️ Playing');
  }

  /**
   * Update play/pause button text
   */
  updatePlayPauseButton() {
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (!playPauseBtn) return;

    if (this.isPaused) {
      playPauseBtn.innerHTML = `
        <div class="flex-row">
          <div class="status-indicator paused" id="status-indicator"></div>
          <span>▶️ Play</span>
        </div>
      `;
    } else {
      playPauseBtn.innerHTML = `
        <div class="flex-row">
          <div class="status-indicator" id="status-indicator"></div>
          <span>⏸️ Pause</span>
        </div>
      `;
    }
  }

  /**
   * Reset image to original state
   */
  resetImage() {
    this.canvasManager.resetImage();
    this.activeClumps = [];
    this.selectionManager.clearSelections();
    console.log('🔄 Image reset to original state');
  }

  /**
   * Stop animation
   */
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.isPaused = true;
    this.updatePlayPauseButton();
  }

  /**
   * Set up animation controls for animated media
   */
  setupAnimationControls() {
    // Play/pause source animation
    const playPauseSourceBtn = document.getElementById('play-pause-source');
    if (playPauseSourceBtn) {
      playPauseSourceBtn.addEventListener('click', () => {
        this.isSourcePlaying = !this.isSourcePlaying;
        playPauseSourceBtn.textContent = this.isSourcePlaying ? 'Pause Source' : 'Play Source';
        console.log(`🎬 Source animation ${this.isSourcePlaying ? 'playing' : 'paused'}`);
      });
    }

    // Reset source animation
    const resetSourceBtn = document.getElementById('reset-source');
    if (resetSourceBtn) {
      resetSourceBtn.addEventListener('click', () => {
        if (this.frameTimer) {
          this.frameTimer.reset();
          this.canvasManager.setCurrentFrame(0);
          this.canvasManager.mediaManager.currentFrame = 0;
          this.canvasManager.updateMediaInfo();
          console.log('🔄 Source animation reset');
        }
      });
    }

    // Playback mode selector
    const playbackModeSelect = document.getElementById('playback-mode');
    if (playbackModeSelect) {
      playbackModeSelect.addEventListener('change', (e) => {
        if (this.frameTimer) {
          this.frameTimer.setPlaybackMode(e.target.value);
          this.canvasManager.mediaManager.playbackMode = e.target.value;
          console.log(`🔄 Playback mode: ${e.target.value}`);
        }
      });
    }

    // Source speed control
    const sourceSpeedSlider = document.getElementById('source-speed');
    const speedValueSpan = document.getElementById('speed-value');
    if (sourceSpeedSlider && speedValueSpan) {
      sourceSpeedSlider.addEventListener('input', (e) => {
        this.sourcePlaybackSpeed = parseFloat(e.target.value);
        speedValueSpan.textContent = `${this.sourcePlaybackSpeed}x`;
        if (this.frameTimer) {
          this.frameTimer.setPlaybackSpeed(this.sourcePlaybackSpeed);
        }
        console.log(`⏩ Source speed: ${this.sourcePlaybackSpeed}x`);
      });
    }
  }
}

// Initialize and start the application
const app = new GlitcherApp();

// Expose app instance globally (needed for panel state restoration)
window.glitcherApp = app;

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

// Expose debug function globally
window.getGlitcherDebugInfo = () => {
  return {
    canvasManager: {
      isInitialized: !!app.canvasManager,
      isImageLoaded: app.canvasManager.isImageLoaded(),
      imageDimensions: app.canvasManager.getImageDimensions()
    },
    selectionManager: app.selectionManager ? app.selectionManager.getDebugInfo() : null,
    animation: {
      isPaused: app.isPaused,
      frameCount: app.frameCount,
      activeClumps: app.activeClumps.length,
      targetFrameRate: app.targetFrameRate
    },
    effects: {
      direction: app.testDirection,
      spiral: app.testSpiral,
      slice: app.testSlice,
      pixelSort: app.testPixelSort,
      colorEffect: app.testColorEffect,
      filterEffect: app.filterEffect
    }
  };
};

// Expose showFilterControls for presets and panel state restoration
app.showFilterControls = app.showFilterControls.bind(app);