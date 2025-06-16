/**
 * Selection UI Controller
 * Manages all selection-related UI elements and their interactions
 */

export class SelectionUI {
  constructor(selectionManager, canvasInteraction) {
    this.selectionManager = selectionManager;
    this.canvasInteraction = canvasInteraction;
    
    // UI state
    this.currentSelectionMethod = 'random';
    this.selectionSensitivity = 1.0;
    
    // Tool buttons
    this.toolButtons = [];
    
    this.setupEventListeners();
    this.initializeUI();
  }

  /**
   * Set up event listeners for all selection UI elements
   */
  setupEventListeners() {
    // Manual selection mode toggle
    const manualModeCheckbox = document.getElementById('manual-selection-mode');
    if (manualModeCheckbox) {
      manualModeCheckbox.addEventListener('change', (e) => {
        this.handleManualModeToggle(e.target.checked);
      });
    }

    // Selection method dropdown
    const selectionMethodSelect = document.getElementById('selection-method');
    if (selectionMethodSelect) {
      selectionMethodSelect.addEventListener('change', (e) => {
        this.handleSelectionMethodChange(e.target.value);
      });
    }

    // Color range controls
    this.setupColorRangeControls();
    
    // Brightness controls
    this.setupBrightnessControls();
    
    // Edge detection controls
    this.setupEdgeDetectionControls();
    
    // Organic shape controls
    this.setupOrganicShapeControls();
    
    // Combined method controls
    this.setupCombinedControls();
    
    // Selection preview toggle
    const previewCheckbox = document.getElementById('selection-preview-checkbox');
    if (previewCheckbox) {
      previewCheckbox.addEventListener('change', (e) => {
        this.selectionManager.setPreviewVisibility(e.target.checked);
      });
    }
    
    // Selection sensitivity
    const sensitivityRange = document.getElementById('selection-sensitivity');
    const sensitivityValue = document.getElementById('selection-sensitivity-value');
    if (sensitivityRange && sensitivityValue) {
      sensitivityRange.addEventListener('input', (e) => {
        this.selectionSensitivity = parseFloat(e.target.value);
        sensitivityValue.textContent = this.selectionSensitivity.toFixed(1);
      });
    }
    
    // Interactive tool buttons
    this.setupToolButtons();
    
    // Brush size control
    const brushSizeRange = document.getElementById('brush-size');
    const brushSizeValue = document.getElementById('brush-size-value');
    if (brushSizeRange && brushSizeValue) {
      brushSizeRange.addEventListener('input', (e) => {
        const size = parseInt(e.target.value);
        brushSizeValue.textContent = size;
        this.canvasInteraction.setBrushSize(size);
      });
    }
    
    // Clear selections button
    const clearSelectionsBtn = document.getElementById('clear-selections');
    if (clearSelectionsBtn) {
      clearSelectionsBtn.addEventListener('click', () => {
        this.selectionManager.clearSelections();
      });
    }
    
    // Invert selection button
    const invertSelectionBtn = document.getElementById('invert-selection');
    if (invertSelectionBtn) {
      invertSelectionBtn.addEventListener('click', () => {
        this.selectionManager.invertSelection();
      });
    }

    console.log('🎛️ Selection UI event listeners set up');
  }

  /**
   * Set up color range control listeners
   */
  setupColorRangeControls() {
    const controls = [
      { id: 'target-hue', valueId: 'target-hue-value' },
      { id: 'color-tolerance', valueId: 'color-tolerance-value' },
      { id: 'min-region-size', valueId: 'min-region-size-value' }
    ];

    controls.forEach(({ id, valueId }) => {
      const range = document.getElementById(id);
      const value = document.getElementById(valueId);
      
      if (range && value) {
        range.addEventListener('input', (e) => {
          value.textContent = e.target.value;
        });
      }
    });
  }

  /**
   * Set up brightness control listeners
   */
  setupBrightnessControls() {
    // Brightness zone is just a select element, no special setup needed
    console.log('🌓 Brightness controls ready');
  }

  /**
   * Set up edge detection control listeners
   */
  setupEdgeDetectionControls() {
    const edgeThresholdRange = document.getElementById('edge-threshold');
    const edgeThresholdValue = document.getElementById('edge-threshold-value');
    
    if (edgeThresholdRange && edgeThresholdValue) {
      edgeThresholdRange.addEventListener('input', (e) => {
        edgeThresholdValue.textContent = e.target.value;
      });
    }
  }

  /**
   * Set up organic shape control listeners
   */
  setupOrganicShapeControls() {
    const controls = [
      { id: 'shape-randomness', valueId: 'shape-randomness-value' },
      { id: 'shape-count', valueId: 'shape-count-value' }
    ];

    controls.forEach(({ id, valueId }) => {
      const range = document.getElementById(id);
      const value = document.getElementById(valueId);
      
      if (range && value) {
        range.addEventListener('input', (e) => {
          value.textContent = e.target.value;
        });
      }
    });
  }

  /**
   * Set up combined method control listeners
   */
  setupCombinedControls() {
    // Combined controls are just checkboxes, they'll be read when generating selections
    console.log('🌀 Combined method controls ready');
  }

  /**
   * Set up interactive tool buttons
   */
  setupToolButtons() {
    const toolButtonSelectors = [
      '#select-tool',
      '#brush-tool', 
      '#wand-tool',
      '#lasso-tool'
    ];

    this.toolButtons = toolButtonSelectors.map(selector => {
      const button = document.querySelector(selector);
      if (button) {
        button.addEventListener('click', (e) => {
          const tool = button.getAttribute('data-tool');
          this.handleToolSelection(tool, button);
        });
      }
      return button;
    }).filter(Boolean);

    console.log('🛠️ Interactive tool buttons set up:', this.toolButtons.length);
  }

  /**
   * Handle manual selection mode toggle
   * @param {boolean} isManual - True if manual mode is enabled
   */
  handleManualModeToggle(isManual) {
    this.selectionManager.setManualMode(isManual);
    
    // Show/hide automatic selection controls
    const automaticControls = [
      'selection-method',
      'color-range-controls',
      'brightness-controls',
      'edge-detection-controls',
      'organic-shape-controls',
      'combined-controls'
    ];
    
    automaticControls.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.style.display = isManual ? 'none' : '';
      }
    });
    
    // Show/hide intensity (only for automatic mode)
    const intensityContainer = document.getElementById('intensity-select')?.parentElement;
    if (intensityContainer) {
      intensityContainer.style.display = isManual ? 'none' : '';
    }
    
    // Show/hide selection sensitivity
    const sensitivityContainer = document.getElementById('selection-sensitivity')?.parentElement;
    if (sensitivityContainer) {
      sensitivityContainer.style.display = isManual ? 'none' : '';
    }
    
    // Show/hide interactive tools
    const toolsContainer = this.findInteractiveToolsContainer();
    if (toolsContainer) {
      toolsContainer.style.display = isManual ? 'block' : 'none';
    }
    
    // Clear current selections when switching modes
    if (isManual) {
      this.selectionManager.clearSelections();
      // When switching to manual, hide all method-specific controls
      this.hideAllMethodControls();
    } else {
      this.selectionManager.setCurrentTool('none');
      this.updateToolButtons('none');
      // When switching to automatic, reset to current method
      this.handleSelectionMethodChange(this.currentSelectionMethod);
    }

    console.log('👋 Manual mode toggled:', isManual);
  }

  /**
   * Handle selection method change
   * @param {string} method - Selected method
   */
  handleSelectionMethodChange(method) {
    this.currentSelectionMethod = method;
    
    // Hide all method-specific controls
    this.hideAllMethodControls();
    
    // Show/hide intensity (only for random method)
    const intensityContainer = document.getElementById('intensity-select')?.parentElement;
    if (intensityContainer) {
      intensityContainer.style.display = (method === 'random') ? '' : 'none';
    }
    
    // Show relevant controls for selected method
    let controlToShow = null;
    switch (method) {
      case 'colorRange':
        controlToShow = 'color-range-controls';
        break;
      case 'brightness':
        controlToShow = 'brightness-controls';
        break;
      case 'edgeDetection':
        controlToShow = 'edge-detection-controls';
        break;
      case 'organicShapes':
        controlToShow = 'organic-shape-controls';
        break;
      case 'combined':
        controlToShow = 'combined-controls';
        break;
    }
    
    if (controlToShow) {
      const element = document.getElementById(controlToShow);
      if (element) element.style.display = 'block';
    }

    console.log('🎯 Selection method changed to:', method);
  }

  /**
   * Handle tool selection
   * @param {string} tool - Selected tool name
   * @param {HTMLElement} button - Clicked button element
   */
  handleToolSelection(tool, button) {
    const currentTool = this.selectionManager.currentTool;
    
    // Toggle tool if same tool is clicked
    if (currentTool === tool) {
      this.selectionManager.setCurrentTool('none');
      this.updateToolButtons('none');
      this.canvasInteraction.updateCanvasCursor('none');
    } else {
      this.selectionManager.setCurrentTool(tool);
      this.updateToolButtons(tool);
      this.canvasInteraction.updateCanvasCursor(tool);
    }

    console.log('🛠️ Tool selected:', this.selectionManager.currentTool);
  }

  /**
   * Update tool button active states
   * @param {string} activeTool - Currently active tool
   */
  updateToolButtons(activeTool) {
    this.toolButtons.forEach(button => {
      if (button) {
        const tool = button.getAttribute('data-tool');
        if (tool === activeTool) {
          button.classList.add('active');
        } else {
          button.classList.remove('active');
        }
      }
    });
  }

  /**
   * Find interactive tools container in DOM
   * @returns {HTMLElement|null} Tools container element
   */
  findInteractiveToolsContainer() {
    // Look for container with "Interactive Tools" title
    const titles = Array.from(document.querySelectorAll('.group-title'));
    const toolsTitle = titles.find(el => el.textContent.includes('Interactive Tools'));
    return toolsTitle?.parentElement || null;
  }

  /**
   * Hide all method-specific controls
   */
  hideAllMethodControls() {
    const controlGroups = [
      'color-range-controls',
      'brightness-controls', 
      'edge-detection-controls',
      'organic-shape-controls',
      'combined-controls'
    ];
    
    controlGroups.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.style.display = 'none';
    });
  }

  /**
   * Get current selection configuration from UI
   * @returns {Object} Configuration object for selection generation
   */
  getSelectionConfig() {
    const intensitySelect = document.getElementById('intensity-select');
    const intensity = intensitySelect ? intensitySelect.value : 'medium';
    
    const config = {
      intensity: intensity,
      maxRegions: this.getMaxRegionsForIntensity(intensity),
      sensitivity: this.selectionSensitivity
    };

    // Add method-specific configuration
    switch (this.currentSelectionMethod) {
      case 'colorRange':
        config.targetHue = this.getSliderValue('target-hue', 180);
        config.hueTolerance = this.getSliderValue('color-tolerance', 30) * config.sensitivity;
        config.minRegionSize = this.getSliderValue('min-region-size', 100) / config.sensitivity;
        config.saturationMin = 0.2;
        config.lightnessMin = 0.2;
        config.lightnessMax = 0.8;
        break;
        
      case 'brightness':
        const brightnessZone = document.getElementById('brightness-zone');
        config.zone = brightnessZone ? brightnessZone.value : 'shadows';
        config.threshold = 0.5;
        config.minRegionSize = 100 / config.sensitivity;
        break;
        
      case 'edgeDetection':
        config.threshold = this.getSliderValue('edge-threshold', 30) / config.sensitivity;
        config.minRegionSize = 50;
        break;
        
      case 'organicShapes':
        config.count = this.getSliderValue('shape-count', 3);
        config.baseSize = 50;
        config.randomness = this.getSliderValue('shape-randomness', 0.3);
        config.smoothness = 0.7;
        break;
        
      case 'combined':
        config.useColor = this.getCheckboxValue('combine-color');
        config.useBrightness = this.getCheckboxValue('combine-brightness');
        config.useEdges = this.getCheckboxValue('combine-edges');
        // Include sub-configurations for combined methods
        config.targetHue = this.getSliderValue('target-hue', 180);
        config.hueTolerance = this.getSliderValue('color-tolerance', 30);
        config.threshold = this.getSliderValue('edge-threshold', 30);
        break;
    }

    return config;
  }

  /**
   * Get maximum regions based on intensity
   * @param {string} intensity - Intensity setting
   * @returns {number} Maximum number of regions
   */
  getMaxRegionsForIntensity(intensity) {
    switch (intensity) {
      case 'medium': return 2;
      case 'large': return 4;
      case 'extraLarge': return 6;
      default: return 2;
    }
  }

  /**
   * Get slider value by ID with fallback
   * @param {string} id - Element ID
   * @param {number} defaultValue - Default value if element not found
   * @returns {number} Slider value
   */
  getSliderValue(id, defaultValue) {
    const element = document.getElementById(id);
    return element ? parseFloat(element.value) : defaultValue;
  }

  /**
   * Get checkbox value by ID
   * @param {string} id - Element ID
   * @returns {boolean} Checkbox checked state
   */
  getCheckboxValue(id) {
    const element = document.getElementById(id);
    return element ? element.checked : false;
  }

  /**
   * Initialize UI to default state
   */
  initializeUI() {
    // Hide all method-specific controls initially
    this.handleSelectionMethodChange('random');
    
    // Hide interactive tools initially
    const toolsContainer = this.findInteractiveToolsContainer();
    if (toolsContainer) {
      toolsContainer.style.display = 'none';
    }
    
    console.log('🎛️ Selection UI initialized');
  }

  /**
   * Generate automatic selections using current UI settings
   * @returns {Array} Array of selection regions
   */
  generateSelections() {
    if (this.selectionManager.isInManualMode()) {
      console.log('Manual mode active, skipping automatic selection generation');
      return [];
    }

    const config = this.getSelectionConfig();
    return this.selectionManager.generateAutomaticSelections(this.currentSelectionMethod, config);
  }

  /**
   * Update UI when selection method requirements change
   * @param {string} method - Selection method
   */
  updateMethodRequirements(method) {
    // Could be used to show/hide required parameters or add validation
    console.log(`📋 Updated requirements for method: ${method}`);
  }

  /**
   * Get current UI state for debugging
   * @returns {Object} Current UI state
   */
  getUIState() {
    return {
      currentMethod: this.currentSelectionMethod,
      sensitivity: this.selectionSensitivity,
      isManualMode: this.selectionManager.isInManualMode(),
      currentTool: this.selectionManager.currentTool,
      config: this.getSelectionConfig()
    };
  }

  /**
   * Reset UI to default state
   */
  resetUI() {
    // Reset selection method
    const methodSelect = document.getElementById('selection-method');
    if (methodSelect) {
      methodSelect.value = 'random';
      this.handleSelectionMethodChange('random');
    }
    
    // Reset manual mode
    const manualModeCheckbox = document.getElementById('manual-selection-mode');
    if (manualModeCheckbox) {
      manualModeCheckbox.checked = false;
      this.handleManualModeToggle(false);
    }
    
    // Reset tools
    this.selectionManager.setCurrentTool('none');
    this.updateToolButtons('none');
    
    // Reset sensitivity
    const sensitivityRange = document.getElementById('selection-sensitivity');
    const sensitivityValue = document.getElementById('selection-sensitivity-value');
    if (sensitivityRange && sensitivityValue) {
      sensitivityRange.value = '1.0';
      sensitivityValue.textContent = '1.0';
      this.selectionSensitivity = 1.0;
    }
    
    console.log('🔄 Selection UI reset to defaults');
  }

  /**
   * Show notification about selection results
   * @param {Array} selections - Generated selections
   */
  showSelectionNotification(selections) {
    if (selections.length > 0) {
      console.log(`✅ Generated ${selections.length} selections using ${this.currentSelectionMethod}`);
    } else {
      console.log(`⚠️ No selections generated using ${this.currentSelectionMethod}`);
    }
  }

  /**
   * Destroy UI event listeners (cleanup)
   */
  destroy() {
    // Remove all event listeners that were added
    // This would be useful if the UI needs to be recreated
    console.log('🗑️ Selection UI destroyed');
  }
}
