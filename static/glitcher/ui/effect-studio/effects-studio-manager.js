/**
 * Effect Studio Manager
 * Coordinates all studio components and manages the overall studio interface
 */
import { EffectChainUI } from './effect-chain-ui.js';
import { EffectLibraryUI } from './effect-library-ui.js';
import { PropertiesPanel } from './properties-panel.js';
import { PresetManager } from './preset-manager.js';
import { createLogger } from '../../utils/logger.js';
import { tooltipManager } from '../../utils/tooltip-manager.js';

const logger = createLogger('EffectStudioManager');

export class EffectStudioManager {
  constructor(app) {
    this.app = app;
    this.isStudioMode = false;
    this.components = {};
    this.presetManager = new PresetManager();
    this.componentsInitialized = false;
    this.domReady = false;
    this.state = 'uninitialized'; // 'uninitialized' | 'initializing' | 'ready' | 'error'
    
    // Track event listeners for cleanup
    this.eventListeners = [];
    this.boundHandlers = new Map();
    
    // Expose globally for integration system
    if (app && app.constructor.name === 'GlitcherApp') {
      window.glitcherApp = app;
    }
    
    // Wait for DOM to be ready before creating studio interface
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.initializeStudioInterface();
      });
    } else {
      this.initializeStudioInterface();
    }
  }

  initializeStudioInterface() {
    logger.info('🎨 Initializing Studio Interface...');
    this.state = 'initializing';
    
    try {
      // Create studio layout container
      this.createStudioLayout();
      
      // Mark DOM as ready
      this.domReady = true;
      
      // Bind events
      this.bindEvents();
      
      // Hide studio interface initially
      this.toggleStudioMode(false);
      
      this.state = 'ready';
      logger.success('✅ Studio Interface initialized');
    } catch (error) {
      this.state = 'error';
      logger.error('Failed to initialize studio interface:', error);
      throw error;
    }
  }
  
  initializeComponents() {
    if (this.componentsInitialized) return;
    
    // Wait for DOM to be ready
    if (!this.domReady) {
      logger.warn('DOM not ready, deferring component initialization');
      return;
    }
    
    // Initialize components only when studio elements exist
    const chainPanel = document.getElementById('effectChainPanel');
    const libraryPanel = document.getElementById('effectLibraryPanel');
    const propertiesPanel = document.getElementById('propertiesPanel');
    
    if (!chainPanel || !libraryPanel || !propertiesPanel) {
      logger.error('Studio panels not found!');
      this.state = 'error';
      return;
    }
    
    try {
      // Initialize effect chain UI
      this.components.chainUI = new EffectChainUI(
        chainPanel,
        this.app.effectChainManager
      );
      
      // Initialize effect library UI
      this.components.libraryUI = new EffectLibraryUI(
        libraryPanel,
        this.app.effectFactory,
        (effect) => {
          // Add the effect to the chain
          this.app.effectChainManager.addEffect(effect);
          logger.debug(`✅ Added effect to chain: ${effect.name}`);
        }
      );
      
      // Initialize properties panel
      this.components.propertiesPanel = new PropertiesPanel(
        propertiesPanel
      );
      
      // Expose components globally for integration system
      window.effectChainUI = this.components.chainUI;
      window.propertiesPanel = this.components.propertiesPanel;
      window.effectLibraryUI = this.components.libraryUI;
      
      // Also store references on DOM elements for discovery
      chainPanel._effectChainUI = this.components.chainUI;
      propertiesPanel._propertiesPanel = this.components.propertiesPanel;
      libraryPanel._effectLibraryUI = this.components.libraryUI;
      
      // Set up properties panel callbacks
      this.components.propertiesPanel.setCallbacks(
        (effect, paramName, value) => {
          // Parameter changed callback
          if (this.app.requestRender) {
            this.app.requestRender();
          }
        },
        (effect, newMode) => {
          // Mode changed callback
          effect.mode = newMode;
          if (this.app.requestRender) {
            this.app.requestRender();
          }
        }
      );
      
      // Set up chain manager event listeners
      if (this.app.effectChainManager) {
      this.app.effectChainManager.on('chainUpdated', () => {
      this.updateEffectCount();
      });
      
      this.app.effectChainManager.on('effectSelected', (effect) => {
      if (this.components.propertiesPanel) {
      this.components.propertiesPanel.showEffect(effect);
      }
      });
      }
      
      // Connect to mode synchronization system
      this.connectToModeSynchronization();
      
      this.componentsInitialized = true;
      logger.success('✅ Studio components initialized successfully');
      
        // Update effect count
      this.updateEffectCount();
        
        } catch (error) {
        this.state = 'error';
        logger.error('Failed to initialize studio components:', error);
        throw error; // Re-throw to let caller handle
      }
    }

    connectToModeSynchronization() {
      // Import and connect to the mode synchronization system
      if (window.effectStudioIntegration) {
        // Force reconnection with the newly created components
        window.effectStudioIntegration.effectChainUI = this.components.chainUI;
        window.effectStudioIntegration.propertiesPanel = this.components.propertiesPanel;
        window.effectStudioIntegration.forceReconnect();
        console.log('✅ Connected to mode synchronization system');
      } else {
        // Try again after a short delay
        setTimeout(() => {
          if (window.effectStudioIntegration) {
            window.effectStudioIntegration.effectChainUI = this.components.chainUI;
            window.effectStudioIntegration.propertiesPanel = this.components.propertiesPanel;
            window.effectStudioIntegration.forceReconnect();
            console.log('✅ Connected to mode synchronization system (delayed)');
          }
        }, 100);
      }
    }

  createStudioLayout() {
    // Check if studio layout already exists
    if (document.querySelector('.glitcher-studio')) {
      logger.debug('Studio layout already exists');
      return;
    }
    
    // Create the studio wrapper
    const studioWrapper = document.createElement('div');
    studioWrapper.className = 'glitcher-studio';
    studioWrapper.style.display = 'none'; // Hidden by default
    studioWrapper.innerHTML = `
      <!-- Header -->
      <div class="studio-header">
        <div class="logo">Glitcher Studio</div>
        <button class="mode-switch-icon" id="studio-classic-btn" data-tooltip="Switch to Classic Mode" data-tooltip-shortcut="Ctrl+M" title="Switch to Classic Mode">🔁</button>
      </div>

      <!-- Main Content -->
      <div class="studio-main">
        <!-- Left Panel - Effects Library -->
        <div class="left-panel panel" id="effectLibraryPanel">
          <div class="panel-header">
            <div class="panel-title">Effects Library</div>
            <input type="search" class="search-box" placeholder="Search effects..." id="effect-search">
          </div>
          <div class="effects-categories" id="effectsCategories">
            <!-- Effect library will be populated here -->
          </div>
        </div>

        <!-- Center Panel - Canvas -->
        <div class="center-panel">
        <div class="canvas-toolbar">
          <div class="transport-controls">
          <button class="transport-btn" id="studioPlayBtn" data-tooltip="Play/Pause animation" data-tooltip-shortcut="Space">▶️</button>
        <button class="transport-btn" id="studioResetBtn" data-tooltip="Reset to original" data-tooltip-shortcut="Ctrl+R">⏹️</button>
        <button class="transport-btn" id="studioRecordBtn" data-tooltip="Record as GIF or video" data-tooltip-shortcut="Ctrl+Shift+R">⏺️</button>
        </div>
        <div class="comparison-controls">
        <button class="comparison-btn" data-mode="final">Final</button>
        <button class="comparison-btn" data-mode="split">Split</button>
          <button class="comparison-btn" data-mode="original">Original</button>
        </div>
        <span class="fps-counter" id="studioFpsCounter">60 FPS</span>
        </div>
        
        <div class="canvas-wrapper" id="studioCanvasWrapper">
        <!-- Canvas will be moved here in studio mode -->
        <!-- Studio Mode Drop Zone -->
        <div id="studio-canvas-placeholder" class="studio-drop-zone" style="display: none;">
          <div class="studio-drop-icon">🖼️</div>
          <div class="studio-drop-title">Drop Media Here</div>
          <div class="studio-drop-subtitle">Images, GIFs, or Videos (max 20s)</div>
          <div class="studio-drop-hint">Or click here to browse files</div>
          <div class="studio-drop-features">
            <span class="studio-feature-tag">🎯 Studio Mode</span>
            <span class="studio-feature-tag">🔗 Effect Chains</span>
            <span class="studio-feature-tag">🎨 Advanced Tools</span>
          </div>
        </div>
        </div>
        </div>

        <!-- Right Panel - Chain & Properties -->
        <div class="right-panel panel">
        <!-- Effect Chain Section -->
        <div class="effect-chain-section" id="effectChainPanel">
        <div class="panel-header">
        <div class="panel-title">Effects Chain</div>
        <div class="chain-controls">
          <button class="chain-btn" id="clearChainBtn" data-tooltip="Remove all effects from chain" data-tooltip-shortcut="Ctrl+Shift+X">🗑️</button>
        <button class="chain-btn" id="savePresetBtn" data-tooltip="Save current effect chain as preset" data-tooltip-shortcut="Ctrl+S">💾</button>
        <button class="chain-btn" id="loadPresetBtn" data-tooltip="Load saved preset" data-tooltip-shortcut="Ctrl+O">📂</button>
        </div>
        </div>
        <div class="effect-chain-content" id="effectChainContent">
          <div class="empty-chain">
            <div class="empty-icon">🎨</div>
            <div class="empty-text">Drag effects here or click + in library</div>
        </div>
        </div>
        </div>
          
        <!-- Properties Section -->
          <div class="properties-section" id="propertiesPanel">
            <div class="panel-header">
            <div class="panel-title">Properties</div>
        </div>
          <div class="properties-content" id="propertiesContent">
            <div class="empty-state">
            <div class="empty-icon">⚙️</div>
          <div class="empty-text">Select an effect to<br>edit its parameters</div>
        </div>
        </div>
        </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="studio-footer">
        <div class="status-info">
          <span id="statusText">Ready</span>
          <span class="divider">•</span>
          <span id="effectCountText">0 effects</span>
          <span class="divider">•</span>
          <span id="performanceText">60 FPS</span>
        </div>
        <div class="help-links">
          <a href="#" id="helpLink">Help</a>
          <span class="divider">•</span>
          <a href="#" id="shortcutsLink">Shortcuts</a>
        </div>
      </div>
    `;
    
    // Insert at the beginning of body
    document.body.insertBefore(studioWrapper, document.body.firstChild);
    
    // Set up studio drop zone event handlers
    this.setupStudioDropZone();
    
    // Attach tooltips to studio elements
    setTimeout(() => {
      tooltipManager.attachToContainer(studioWrapper);
      logger.debug('✅ Studio tooltips attached');
    }, 100);
    
    logger.success('✅ Studio layout created');
  }
  
  /**
   * Set up click and drag/drop handlers for studio drop zone
   */
  setupStudioDropZone() {
    const studioDropZone = document.getElementById('studio-canvas-placeholder');
    const fileInput = document.getElementById('image-input');
    
    if (!studioDropZone || !fileInput) {
      logger.warn('Studio drop zone or file input not found');
      return;
    }
    
    // Click to open file selector (using arrow function to avoid binding issues)
    const clickHandler = () => {
      fileInput.click();
    };
    studioDropZone.addEventListener('click', clickHandler);
    this.eventListeners.push({ 
      element: studioDropZone, 
      event: 'click', 
      handler: clickHandler 
    });
    
    // Drag over handler
    const dragoverHandler = (e) => {
      e.preventDefault();
      studioDropZone.classList.add('drag-over');
    };
    studioDropZone.addEventListener('dragover', dragoverHandler);
    this.eventListeners.push({ 
      element: studioDropZone, 
      event: 'dragover', 
      handler: dragoverHandler 
    });
    
    // Drag leave handler
    const dragleaveHandler = (e) => {
      e.preventDefault();
      if (!studioDropZone.contains(e.relatedTarget)) {
        studioDropZone.classList.remove('drag-over');
      }
    };
    studioDropZone.addEventListener('dragleave', dragleaveHandler);
    this.eventListeners.push({ 
      element: studioDropZone, 
      event: 'dragleave', 
      handler: dragleaveHandler 
    });
    
    // Drop handler
    const dropHandler = (e) => {
      e.preventDefault();
      studioDropZone.classList.remove('drag-over');
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        const type = file.type.toLowerCase();
        if (type.startsWith('image/') || type.includes('video') || type.includes('webm') || type.includes('mp4')) {
          // Create a new FileList-like object and assign to input
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          
          // Trigger change event to process the file
          const event = new Event('change', { bubbles: true });
          fileInput.dispatchEvent(event);
        } else {
          logger.warn('Invalid file type dropped');
          // Could show error notification here
        }
      }
    };
    studioDropZone.addEventListener('drop', dropHandler);
    this.eventListeners.push({ 
      element: studioDropZone, 
      event: 'drop', 
      handler: dropHandler 
    });
    
    logger.debug('✅ Studio drop zone event handlers set up');
  }
  
  /**
   * Helper to add tracked event listeners
   */
  addEventListener(element, event, handler, options = {}) {
    // Store original handler if not already bound
    if (!this.boundHandlers.has(handler)) {
      this.boundHandlers.set(handler, handler.bind(this));
    }
    const boundHandler = this.boundHandlers.get(handler);
    
    element.addEventListener(event, boundHandler, options);
    this.eventListeners.push({ element, event, handler: boundHandler, options });
    
    return boundHandler;
  }

  bindEvents() {
    // View mode switching - Classic button in studio
    const classicBtn = document.getElementById('studio-classic-btn');
    if (classicBtn) {
      classicBtn.addEventListener('click', () => {
        this.toggleStudioMode(false);
        // Also update the main app state
        if (this.app) {
          this.app.studioMode = false;
          this.app.updateModeIndicator();
        }
      });
    }
    
    // Studio transport controls
    const playBtn = document.getElementById('studioPlayBtn');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (this.app) {
          this.app.togglePlayPause();
          playBtn.textContent = this.app.isPaused ? '▶️' : '⏸️';
        }
      });
    }
    
    const resetBtn = document.getElementById('studioResetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (this.app) {
          this.app.resetImage();
        }
      });
    }
    
    const recordBtn = document.getElementById('studioRecordBtn');
    if (recordBtn) {
      recordBtn.addEventListener('click', () => {
        if (this.app && this.app.recordingManager) {
          this.app.recordingManager.startRecording();
        }
      });
    }
    
    // Comparison mode buttons
    document.querySelectorAll('.comparison-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (this.app && this.app.renderPipeline) {
          this.app.renderPipeline.setRenderMode(mode);
        }
        
        // Update active state
        document.querySelectorAll('.comparison-btn').forEach(b => {
          b.classList.toggle('active', b === btn);
        });
      });
    });
    
    // Chain controls
    const clearChainBtn = document.getElementById('clearChainBtn');
    if (clearChainBtn) {
      clearChainBtn.addEventListener('click', () => {
        if (confirm('Clear all effects from chain?')) {
          this.app.effectChainManager.clearChain();
        }
      });
    }
    
    const savePresetBtn = document.getElementById('savePresetBtn');
    if (savePresetBtn) {
      savePresetBtn.addEventListener('click', () => {
        const name = prompt('Enter preset name:');
        if (name) {
          this.saveCurrentPreset(name);
        }
      });
    }
    
    const loadPresetBtn = document.getElementById('loadPresetBtn');
    if (loadPresetBtn) {
      loadPresetBtn.addEventListener('click', () => {
        this.showPresetDialog();
      });
    }
    
    // Help links
    const helpLink = document.getElementById('helpLink');
    if (helpLink) {
      helpLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.showHelp();
      });
    }
    
    const shortcutsLink = document.getElementById('shortcutsLink');
    if (shortcutsLink) {
      shortcutsLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.showShortcuts();
      });
    }
    
    // Keyboard shortcuts (tracked for cleanup)
    this.addEventListener(document, 'keydown', this.handleKeyboardShortcut);
    
    // Set up resize functionality for chain section
    this.setupChainResize();
    
    // Performance monitoring
    this.startPerformanceMonitoring();
  }

  toggleStudioMode(enabled) {
    this.isStudioMode = enabled;
    const studio = document.querySelector('.glitcher-studio');
    const classic = document.querySelector('.studio-container');
    
    if (!studio) {
      console.error('Studio element not found!');
      return;
    }
    
    // Update body class for CSS styling
    if (enabled) {
      document.body.classList.add('studio-mode');
    } else {
      document.body.classList.remove('studio-mode');
    }
    
    if (enabled) {
      // Initialize components if not already done
      if (!this.componentsInitialized && this.app.effectFactory && this.app.effectChainManager) {
        this.initializeComponents();
      }
      
      // Show studio interface
      studio.style.display = 'grid';
      if (classic) {
        classic.style.display = 'none';
      }
      
      // Move canvas to studio
      this.moveCanvasToStudio();
      
      // Initialize chain if empty
      if (this.app.effectChainManager && this.app.effectChainManager.chain.length === 0) {
        this.loadDefaultEffects();
      }
      
      // Refresh UI components
      if (this.componentsInitialized) {
        this.components.chainUI?.updateChain();
        this.components.libraryUI?.refresh();
        this.updateEffectCount();
        
        // Force mode synchronization connection
        setTimeout(() => {
          this.connectToModeSynchronization();
        }, 100);
      }
      
      // Force correct drop zone visibility after mode switch
      setTimeout(() => {
        this.updateDropZoneVisibility();
      }, 200);
    } else {
      // Show classic interface
      studio.style.display = 'none';
      if (classic) {
        classic.style.display = 'grid';
      }
      
      // Move canvas back to classic
      this.moveCanvasToClassic();
      
      // Force correct drop zone visibility after mode switch
      setTimeout(() => {
        this.updateDropZoneVisibility();
      }, 200);
    }
    
    console.log(`🎛️ Studio mode: ${enabled ? 'ON' : 'OFF'}`);
  }

  moveCanvasToStudio() {
    const canvas = document.getElementById('canvas');
    const studioCanvasWrapper = document.getElementById('studioCanvasWrapper');
    const studioDropZone = document.getElementById('studio-canvas-placeholder');
    
    if (canvas && studioCanvasWrapper) {
      // Store original parent if not already stored
      if (!this.originalCanvasParent) {
        this.originalCanvasParent = canvas.parentElement;
      }
      
      // Move canvas to studio wrapper
      studioCanvasWrapper.appendChild(canvas);
      
      // Check if image is actually loaded by checking the app's canvas manager
      const isImageLoaded = window.glitcherApp && window.glitcherApp.canvasManager && 
                           window.glitcherApp.canvasManager.isImageLoaded && 
                           window.glitcherApp.canvasManager.isImageLoaded();
      
      console.log(`🔍 Image loaded check: ${isImageLoaded}`);
      
      if (isImageLoaded) {
        // Image is loaded - show canvas, hide studio drop zone
        canvas.style.display = 'block';
        canvas.style.visibility = 'visible';
        canvas.style.width = '';
        canvas.style.height = '';
        if (studioDropZone) {
          studioDropZone.style.display = 'none';
        }
        console.log('📷 Image loaded - showing canvas, hiding drop zone');
      } else {
        // No image loaded - hide canvas completely, show studio drop zone
        canvas.style.display = 'none';
        canvas.style.visibility = 'hidden';
        canvas.style.width = '0';
        canvas.style.height = '0';
        if (studioDropZone) {
          studioDropZone.style.display = 'block';
        }
        console.log('🖼️ No image loaded - hiding canvas completely, showing drop zone');
      }
      
      // Hide classic placeholder
      const placeholder = this.originalCanvasParent?.querySelector('#canvas-placeholder');
      if (placeholder) {
        placeholder.style.display = 'none';
      }
      
      console.log('✅ Canvas moved to studio');
    }
  }

  moveCanvasToClassic() {
    const canvas = document.getElementById('canvas');
    const studioDropZone = document.getElementById('studio-canvas-placeholder');
    
    if (canvas && this.originalCanvasParent) {
      // Move canvas back to original location
      this.originalCanvasParent.appendChild(canvas);
      
      // Hide studio drop zone
      if (studioDropZone) {
        studioDropZone.style.display = 'none';
      }
      
      // Check if image is actually loaded by checking the app's canvas manager
      const isImageLoaded = window.glitcherApp && window.glitcherApp.canvasManager && 
                           window.glitcherApp.canvasManager.isImageLoaded && 
                           window.glitcherApp.canvasManager.isImageLoaded();
      
      console.log(`🔍 Classic mode - Image loaded check: ${isImageLoaded}`);
      
      const classicPlaceholder = this.originalCanvasParent.querySelector('#canvas-placeholder');
      
      if (isImageLoaded) {
        // Image is loaded - show canvas, hide classic placeholder
        canvas.style.display = 'block';
        canvas.style.visibility = 'visible';
        canvas.style.width = '';
        canvas.style.height = '';
        if (classicPlaceholder) {
          classicPlaceholder.style.display = 'none';
        }
        console.log('📷 Image loaded - showing canvas, hiding classic placeholder');
      } else {
        // No image loaded - hide canvas completely, show classic placeholder
        canvas.style.display = 'none';
        canvas.style.visibility = 'hidden';
        canvas.style.width = '0';
        canvas.style.height = '0';
        if (classicPlaceholder) {
          classicPlaceholder.style.display = 'block';
        }
        console.log('🖼️ No image loaded - hiding canvas completely, showing classic placeholder');
      }
      
      console.log('✅ Canvas moved back to classic');
    }
  }

  loadDefaultEffects() {
    // Only load defaults if we have valid effect factory
    if (!this.app.effectFactory) {
      console.warn('Effect factory not ready');
      return;
    }
    
    // Try to migrate current classic settings first
    if (this.app.migrateClassicSettingsToChain) {
      this.app.migrateClassicSettingsToChain();
      return;
    }
    
    // Otherwise load some basic defaults
    const defaultEffects = [
      { type: 'direction-movement', parameters: { direction: 'down', speed: 2 } },
      { type: 'hue-shift', parameters: { intensity: 50 } }
    ];
    
    defaultEffects.forEach(config => {
      try {
        const effect = this.app.effectFactory.createEffect(config.type);
        if (effect) {
          Object.assign(effect.parameters, config.parameters);
          this.app.effectChainManager.addEffect(effect);
          console.log(`✅ Added default effect: ${config.type}`);
        }
      } catch (error) {
        console.warn(`⚠️ Could not create default effect: ${config.type}`, error);
      }
    });
  }

  updateEffectCount() {
    const countText = document.getElementById('effectCountText');
    if (countText && this.app.effectChainManager) {
      const count = this.app.effectChainManager.chain.length;
      const active = this.app.effectChainManager.chain.filter(e => e.enabled).length;
      countText.textContent = `${count} effects (${active} active)`;
    }
  }

  saveCurrentPreset(name) {
    if (!this.app.effectChainManager) return;
    
    const preset = this.presetManager.savePreset(name, this.app.effectChainManager.chain);
    this.showNotification(`Preset "${name}" saved!`, 'success');
  }

  showPresetDialog() {
    const presets = this.presetManager.getAllPresets();
    
    const dialog = document.createElement('div');
    dialog.className = 'preset-dialog modal';
    dialog.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Load Preset</h2>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="preset-grid">
            ${presets.map(preset => `
              <div class="preset-card" data-preset-name="${preset.name}">
                <h3>${preset.name}</h3>
                <p>${preset.chain.length} effects</p>
                <button class="load-preset-btn">Load</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Bind events
    dialog.querySelector('.modal-close').addEventListener('click', () => dialog.remove());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.remove();
    });
    
    dialog.querySelectorAll('.load-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.preset-card');
        const presetName = card.dataset.presetName;
        this.loadPreset(presetName);
        dialog.remove();
      });
    });
  }

  loadPreset(presetName) {
    const preset = this.presetManager.loadPreset(presetName);
    if (!preset || !this.app.effectChainManager) return;
    
    // Clear current chain
    this.app.effectChainManager.clearChain();
    
    // Load effects from preset
    preset.chain.forEach(effectConfig => {
      try {
        const effect = this.app.effectFactory.createEffect(effectConfig.type || effectConfig.id);
        if (effect) {
          effect.mode = effectConfig.mode || 'destructive';
          effect.enabled = effectConfig.enabled !== false;
          Object.assign(effect.parameters, effectConfig.parameters);
          this.app.effectChainManager.addEffect(effect);
        }
      } catch (error) {
        console.warn(`Failed to load effect from preset: ${effectConfig.type || effectConfig.id}`, error);
      }
    });
    
    this.showNotification(`Loaded preset "${presetName}"`, 'success');
  }

  handleKeyboardShortcut(e) {
    if (!this.isStudioMode) return;
    
    // Ctrl/Cmd + S: Save preset
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      const name = prompt('Enter preset name:');
      if (name) {
        this.saveCurrentPreset(name);
      }
    }
    
    // Ctrl/Cmd + O: Load preset
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      this.showPresetDialog();
    }
    
    // Delete: Remove selected effect
    if (e.key === 'Delete' && this.components.chainUI) {
      const selectedEffect = this.components.chainUI.selectedEffectId;
      if (selectedEffect) {
        this.app.effectChainManager.removeEffect(selectedEffect);
      }
    }
    
    // Space: Play/Pause
    if (e.key === ' ' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      this.app.togglePlayPause();
      const playBtn = document.getElementById('studioPlayBtn');
      if (playBtn) {
        playBtn.textContent = this.app.isPaused ? '▶️' : '⏸️';
      }
    }
  }

  startPerformanceMonitoring() {
    setInterval(() => {
      if (!this.isStudioMode) return;
      
      const fpsElement = document.getElementById('studioFpsCounter');
      const perfElement = document.getElementById('performanceText');
      
      if (this.app.frameCount !== undefined) {
        const fps = Math.round(1000 / (performance.now() - this.app.lastFrameTime));
        const displayFps = isFinite(fps) ? fps : 60;
        
        if (fpsElement) fpsElement.textContent = `${displayFps} FPS`;
        if (perfElement) perfElement.textContent = `${displayFps} FPS`;
      }
    }, 1000);
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `studio-notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 24px;
      background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
      color: white;
      border-radius: 4px;
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  showHelp() {
    this.showNotification('Help documentation coming soon!', 'info');
  }

  showShortcuts() {
    const shortcuts = [
      { key: 'Ctrl/Cmd + S', action: 'Save Preset' },
      { key: 'Ctrl/Cmd + O', action: 'Load Preset' },
      { key: 'Delete', action: 'Remove Selected Effect' },
      { key: 'Space', action: 'Play/Pause' },
      { key: 'Escape', action: 'Return to Classic Mode' }
    ];
    
    const dialog = document.createElement('div');
    dialog.className = 'shortcuts-dialog modal';
    dialog.innerHTML = `
      <div class="modal-content compact">
        <div class="modal-header">
          <h2>Keyboard Shortcuts</h2>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <table class="shortcuts-table">
            ${shortcuts.map(s => `
              <tr>
                <td class="shortcut-key">${s.key}</td>
                <td class="shortcut-action">${s.action}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    dialog.querySelector('.modal-close').addEventListener('click', () => dialog.remove());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.remove();
    });
  }

  setupChainResize() {
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;
    
    const chainSection = document.querySelector('.effect-chain-section');
    if (!chainSection) return;
    
    const handleMouseDown = (e) => {
      // Check if clicking on the resize handle area (bottom 8px)
      const rect = chainSection.getBoundingClientRect();
      if (e.clientY > rect.bottom - 8 && e.clientY <= rect.bottom) {
        isResizing = true;
        startY = e.clientY;
        startHeight = chainSection.offsetHeight;
        document.body.style.cursor = 'ns-resize';
        e.preventDefault();
      }
    };
    
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      
      const deltaY = e.clientY - startY;
      const newHeight = startHeight + deltaY;
      const parentHeight = chainSection.parentElement.offsetHeight;
      
      // Constrain height between 20% and 70% of parent
      const minHeight = parentHeight * 0.2;
      const maxHeight = parentHeight * 0.7;
      
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        chainSection.style.height = newHeight + 'px';
      }
    };
    
    const handleMouseUp = () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
      }
    };
    
    // Add event listeners
    chainSection.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }
  
  // Public API
  getIsStudioMode() {
    return this.isStudioMode;
  }

  refreshUI() {
  if (this.isStudioMode && this.componentsInitialized) {
  this.components.chainUI?.updateChain();
  this.components.libraryUI?.refresh();
  this.components.propertiesPanel?.refresh();
  this.updateEffectCount();
  }
      
        // Force correct drop zone visibility
        this.updateDropZoneVisibility();
    }
    
    /**
     * Update drop zone visibility based on current mode and image state
     */
    updateDropZoneVisibility() {
        const canvas = document.getElementById('canvas');
        const studioDropZone = document.getElementById('studio-canvas-placeholder');
        const classicDropZone = document.getElementById('canvas-placeholder');
        
        // Check if image is loaded
        const isImageLoaded = window.glitcherApp && window.glitcherApp.canvasManager && 
                             window.glitcherApp.canvasManager.isImageLoaded && 
                             window.glitcherApp.canvasManager.isImageLoaded();
        
        console.log(`🔍 updateDropZoneVisibility - Studio mode: ${this.isStudioMode}, Image loaded: ${isImageLoaded}`);
        
        if (isImageLoaded) {
            // Image is loaded - show canvas, hide all drop zones
            if (canvas) {
                canvas.style.display = 'block';
                canvas.style.visibility = 'visible';
            }
            if (classicDropZone) classicDropZone.style.display = 'none';
            if (studioDropZone) studioDropZone.style.display = 'none';
            console.log('📷 Image loaded - showing canvas');
        } else {
            // No image loaded - hide canvas completely, show appropriate drop zone
            if (canvas) {
                canvas.style.display = 'none';
                canvas.style.visibility = 'hidden';
                canvas.style.width = '0';
                canvas.style.height = '0';
            }
            
            if (this.isStudioMode) {
                // Studio mode - show studio drop zone
                if (classicDropZone) classicDropZone.style.display = 'none';
                if (studioDropZone) {
                    studioDropZone.style.display = 'block';
                    console.log('🏛️ Studio drop zone shown');
                } else {
                    console.warn('⚠️ Studio drop zone not found');
                }
            } else {
                // Classic mode - show classic drop zone
                if (studioDropZone) studioDropZone.style.display = 'none';
                if (classicDropZone) {
                    classicDropZone.style.display = 'block';
                    console.log('🎨 Classic drop zone shown');
                }
            }
        }
    }
    
    /**
     * Cleanup method - removes all event listeners and references
     * Call this when studio is being destroyed or reinitialized
     */
    destroy() {
        logger.info('🧹 Cleaning up Effect Studio Manager...');
        
        // Remove all tracked event listeners
        this.eventListeners.forEach(({ element, event, handler, options }) => {
            element.removeEventListener(event, handler, options);
        });
        this.eventListeners = [];
        this.boundHandlers.clear();
        
        // Clean up components
        if (this.components.chainUI && typeof this.components.chainUI.destroy === 'function') {
            this.components.chainUI.destroy();
        }
        if (this.components.libraryUI && typeof this.components.libraryUI.destroy === 'function') {
            this.components.libraryUI.destroy();
        }
        if (this.components.propertiesPanel && typeof this.components.propertiesPanel.destroy === 'function') {
            this.components.propertiesPanel.destroy();
        }
        
        // Clear references
        this.components = {};
        this.componentsInitialized = false;
        this.isStudioMode = false;
        this.state = 'uninitialized';
        
        // Remove studio layout from DOM
        const studioElement = document.querySelector('.glitcher-studio');
        if (studioElement) {
            studioElement.remove();
        }
        
        // Clear global references
        if (window.effectChainUI) delete window.effectChainUI;
        if (window.propertiesPanel) delete window.propertiesPanel;
        if (window.effectLibraryUI) delete window.effectLibraryUI;
        
        logger.success('✅ Effect Studio Manager cleaned up');
    }
    
    /**
     * Get current state for debugging
     */
    getState() {
        return {
            state: this.state,
            isStudioMode: this.isStudioMode,
            componentsInitialized: this.componentsInitialized,
            domReady: this.domReady,
            eventListenerCount: this.eventListeners.length,
            components: Object.keys(this.components)
        };
    }
}