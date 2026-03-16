// Synthograsizer Mini - Single-Variable Control Interface

import { DEFAULT_CONFIG, ERROR_MESSAGES } from './config.js';
import { TextRenderer } from './text-renderer.js';
import { BatchGenerator } from './batch-generator.js';
import { TemplateLoader } from './template-loader.js';
import { CodeOverlayManager } from './code-overlay-manager.js?v=4';
import { normalizeTemplate, getValueText, getValueWeight, getWeightsArray, computeTemplateFingerprint, generateTagId } from './template-normalizer.js?v=2';
import { MIDIController } from './midi-controller.js';
import { OSCController } from './osc-controller.js';
import { OSCPanelUI } from './osc-panel-ui.js';
import { ScopeVideoClient } from './scope-video-client.js';
import { DisplayBroadcaster } from './display-broadcaster.js';
import { GlitcherControls } from './glitcher-controls.js';

// Expose fingerprint + tag utilities globally for non-module scripts (e.g. studio-integration.js)
window.__computeTemplateFingerprint = computeTemplateFingerprint;
window.__generateTagId = generateTagId;

const STATE_STORAGE_KEY = 'synthograsizerMiniStateV1';

export class SynthograsizerSmall {
  constructor(customConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...customConfig };
    this.currentTemplate = null;
    this.variables = [];
    this.currentVariableIndex = 0;
    this.currentValues = {}; // Stores current value for each variable
    this.textRenderer = null;
    this.elements = {};
    this.likedPrompts = [];
    this.controlMode = 'dpad'; // 'dpad' or 'knobs'
    this._knobDragState = null; // Track active knob drag
    this.midi = null;        // MIDIController instance
    this.midiUI = null;      // MIDIPanelUI instance
    this.osc = null;         // OSCController instance
    this.oscUI = null;       // OSCPanelUI instance
    this.scopeVideo = null;       // ScopeVideoClient instance
    this.scopeVideoUI = null;     // ScopeVideoPanelUI instance
    this.displayBroadcaster = null; // DisplayBroadcaster instance
    this.glitcherControls = null; // GlitcherControls instance

    // Setup error handling
    this.setupErrorHandling();

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  setupErrorHandling() {
    window.addEventListener('error', (event) => {
      this.handleCriticalError(event.error);
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.handleCriticalError(event.reason);
    });
  }

  handleCriticalError(error) {
    console.error('Critical error:', error);
    this.showError(`Something went wrong: ${error.message}`);
  }

  async init() {
    try {
      // Get DOM elements
      this.elements = {
        outputContainer: document.getElementById('output-container'),
        errorDisplay: document.getElementById('error-message'),
        copyButton: document.getElementById('copy-button'),
        sendButton: document.getElementById('send-button'),
        randomizeButton: document.getElementById('randomize-button'),
        generateButton: document.getElementById('generate-button'),
        importFileInput: document.getElementById('import-file-input'),
        centerControl: document.getElementById('center-control'),
        controlValue: document.getElementById('control-value'),
        controlVariableName: document.getElementById('control-variable-name'),
        controlArrowLeft: document.querySelector('.control-arrow-left'),
        controlArrowRight: document.querySelector('.control-arrow-right'),
        prevVariable: document.getElementById('prev-variable'),
        nextVariable: document.getElementById('next-variable'),
        variableIndicators: document.getElementById('variable-indicators'),
        announcer: document.getElementById('knob-announcer'),
        favoriteButton: document.getElementById('favorite-button'),
        favoritesButton: document.getElementById('favorites-button'),
        favoritesOverlay: document.getElementById('favorites-output-overlay'),
        favoritesClose: document.getElementById('favorites-output-close'),
        favoritesTextarea: document.getElementById('favorites-output-text'),
        favoritesCopyBtn: document.getElementById('favorites-copy-btn'),
        favoritesDownloadBtn: document.getElementById('favorites-download-btn'),
        favoritesClearBtn: document.getElementById('favorites-clear-btn'),
        knobsContainer: document.getElementById('knobs-container'),
        modeDpad: document.getElementById('mode-dpad'),
        modeKnobs: document.getElementById('mode-knobs')
      };

      // Initialize text renderer
      this.textRenderer = new TextRenderer(this.elements.outputContainer);

      // Setup event listeners
      this.setupEventListeners();

      // Initialize batch generator
      this.batchGenerator = new BatchGenerator(this);

      // Initialize template loader
      this.templateLoader = new TemplateLoader(this);

      // Initialize code overlay manager
      this.codeOverlayManager = new CodeOverlayManager(this);

      // Try to restore previous session; on first visit, load the default template
      const restored = this.loadStateFromStorage();
      if (!restored) {
        // Fetch the full svg-flow-particles template (includes p5Code for the code overlay)
        try {
          const res = await fetch('templates/svg-flow-particles.json');
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const defaultTemplate = await res.json();
          this.loadTemplate(defaultTemplate);
        } catch (fetchErr) {
          console.warn('Could not fetch default template, using built-in fallback:', fetchErr);
          this.loadTemplate(this.config.fallbackTemplate);
        }
      }

      // Initialize MIDI
      this._initMIDI();

      // Initialize OSC → Daydream Scope bridge
      this._initOSC();

      // Initialize Scope Video (WebRTC / frame capture)
      this._initScopeVideo();

      // Initialize OBS Display broadcaster
      this._initDisplayBroadcaster();

      // Initialize Glitcher Controls
      this._initGlitcherControls();
    } catch (error) {
      console.error('SynthograsizerSmall: Initialization failed:', error);
      document.body.innerHTML += `<div style="padding: 20px; color: red;">Initialization Error: ${error.message}</div>`;
    }
  }

  setupEventListeners() {
    // Copy button
    this.elements.copyButton.addEventListener('click', () => this.handleCopy());

    // Favorite / liked prompts
    if (this.elements.favoriteButton) {
      this.elements.favoriteButton.addEventListener('click', () => this.addCurrentPromptToFavorites());
    }
    if (this.elements.favoritesButton) {
      this.elements.favoritesButton.addEventListener('click', () => this.openFavoritesOverlay());
    }

    // Send button → OSC
    this.elements.sendButton?.addEventListener('click', () => {
      if (this.osc) {
        const prompt = this.getCurrentPromptText();
        if (prompt) this.osc.sendPrompt(prompt);
      }
    });

    // Randomize button
    this.elements.randomizeButton.addEventListener('click', () => this.randomizeAllVariables());

    // Generate button - Auto-generate image with Gemini 3 Pro
    this.elements.generateButton.addEventListener('click', () => this.handleGenerateImage());

    // Capture button - Screenshot p5 canvas to Image Studio
    const captureBtn = document.getElementById('p5-capture-btn');
    if (captureBtn) {
      captureBtn.addEventListener('click', () => {
        this.codeOverlayManager?.captureToImageStudio();
      });
    }

    // Scope button - Send current p5 frame to Scope as VACE reference image
    const scopeBtn = document.getElementById('p5-scope-btn');
    if (scopeBtn) {
      scopeBtn.addEventListener('click', () => {
        const canvas = this.codeOverlayManager?.getActiveCanvas();
        this.scopeVideo?.sendFrame(canvas);
      });
    }

    // Display button (p5 panel) - Open full-screen OBS display window
    const p5DisplayBtn = document.getElementById('p5-display-btn');
    if (p5DisplayBtn) {
      p5DisplayBtn.addEventListener('click', () => {
        this.displayBroadcaster?.openDisplay();
      });
    }

    // Display button (Sidebar Status Bar) - Open full-screen OBS display window
    const dispToggleBtn = document.getElementById('disp-toggle-btn');
    if (dispToggleBtn) {
      dispToggleBtn.addEventListener('click', () => {
        this.displayBroadcaster?.openDisplay();
      });
    }

    // File input change (triggered from dropdown or code overlay)
    this.elements.importFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleImportFile(file);
      }
    });

    // Variable navigation arrows
    this.elements.prevVariable.addEventListener('click', () => this.prevVariable());
    this.elements.nextVariable.addEventListener('click', () => this.nextVariable());

    // Value control arrows
    this.elements.controlArrowLeft.addEventListener('click', () => this.cycleValue(-1));
    this.elements.controlArrowRight.addEventListener('click', () => this.cycleValue(1));

    // Keyboard navigation
    document.addEventListener('keydown', (e) => this.handleKeyboard(e));

    // Favorites overlay controls
    if (this.elements.favoritesClose) {
      this.elements.favoritesClose.addEventListener('click', () => this.closeFavoritesOverlay());
    }
    if (this.elements.favoritesOverlay) {
      this.elements.favoritesOverlay.addEventListener('click', (e) => {
        if (e.target === this.elements.favoritesOverlay) {
          this.closeFavoritesOverlay();
        }
      });
    }
    if (this.elements.favoritesCopyBtn) {
      this.elements.favoritesCopyBtn.addEventListener('click', () => this.copyFavorites());
    }
    if (this.elements.favoritesDownloadBtn) {
      this.elements.favoritesDownloadBtn.addEventListener('click', () => this.downloadFavorites());
    }
    if (this.elements.favoritesClearBtn) {
      this.elements.favoritesClearBtn.addEventListener('click', () => this.clearFavorites());
    }

    // Mode toggle buttons
    if (this.elements.modeDpad) {
      this.elements.modeDpad.addEventListener('click', () => this.setControlMode('dpad'));
    }
    if (this.elements.modeKnobs) {
      this.elements.modeKnobs.addEventListener('click', () => this.setControlMode('knobs'));
    }

    // Window resize handler for responsive text sizing
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (this.elements.controlValue && this.elements.controlValue.textContent) {
          this.resizeControlValueText();
        }
      }, 100);
    });
  }

  /**
   * Validates template structure
   * @param {Object} template - Template object to validate
   * @returns {Object} Validation result { valid: boolean, error: string }
   */
  validateTemplate(template) {
    if (!template) {
      return { valid: false, error: 'Template is null or undefined' };
    }

    if (!('promptTemplate' in template)) {
      return { valid: false, error: 'Missing promptTemplate field' };
    }

    if (!template.variables || !Array.isArray(template.variables)) {
      return { valid: false, error: 'Missing or invalid variables array' };
    }

    // Allow empty templates (0 variables) for starting from scratch
    // if (template.variables.length === 0) {
    //   return { valid: false, error: 'Template must have at least 1 variable' };
    // }

    if (template.variables.length > this.config.maxKnobs) {
      return {
        valid: false,
        error: `Template has ${template.variables.length} variables. Maximum is ${this.config.maxKnobs}.`
      };
    }

    // Validate each variable
    const warnings = [];
    const seenNames = new Set();

    for (let i = 0; i < template.variables.length; i++) {
      const variable = template.variables[i];

      if (!variable.name) {
        return { valid: false, error: `Variable ${i} is missing name field` };
      }

      // Check for duplicate variable names
      const normName = variable.name.trim().toLowerCase();
      if (seenNames.has(normName)) {
        return { valid: false, error: `Duplicate variable name: "${variable.name}"` };
      }
      seenNames.add(normName);

      if (!variable.values || !Array.isArray(variable.values)) {
        return { valid: false, error: `Variable "${variable.name}" is missing values array` };
      }

      if (variable.values.length === 0) {
        return { valid: false, error: `Variable "${variable.name}" has no values` };
      }

      // Filter out empty values (handles both string and object formats)
      const emptyCount = variable.values.filter(v => {
        const text = (typeof v === 'string') ? v : (v && v.text || '');
        return text.trim() === '';
      }).length;
      if (emptyCount > 0) {
        variable.values = variable.values.filter(v => {
          const text = (typeof v === 'string') ? v : (v && v.text || '');
          return text.trim() !== '';
        });
        if (variable.values.length === 0) {
          return { valid: false, error: `Variable "${variable.name}" has only empty values` };
        }
        warnings.push(`Removed ${emptyCount} empty value(s) from "${variable.name}"`);
      }
    }

    // Check for mismatched placeholders vs variables
    if (template.promptTemplate && template.variables.length > 0) {
      const placeholderRegex = /\{\{([^}]+)\}\}/g;
      const placeholders = new Set();
      let match;
      while ((match = placeholderRegex.exec(template.promptTemplate)) !== null) {
        placeholders.add(match[1].trim());
      }
      const varNames = new Set(template.variables.map(v => v.name));

      for (const ph of placeholders) {
        if (!varNames.has(ph)) {
          warnings.push(`Placeholder "{{${ph}}}" has no matching variable`);
        }
      }
      for (const vn of varNames) {
        if (!placeholders.has(vn)) {
          warnings.push(`Variable "${vn}" has no matching placeholder in template`);
        }
      }
    }

    return { valid: true, warnings };
  }

  /**
   * Loads a template
   * @param {Object} template - Template object
   * @returns {boolean} Success status
   */
  loadTemplate(template) {
    try {
      // Normalize template to nested value-weight format (handles old + new formats)
      template = normalizeTemplate(template);

      // Validate template
      const validation = this.validateTemplate(template);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Show validation warnings (non-blocking)
      if (validation.warnings && validation.warnings.length > 0) {
        const warnMsg = validation.warnings.join('; ');
        if (typeof showToast === 'function') {
          showToast(warnMsg, 'warning', 5000);
        } else {
          console.warn('Template warnings:', warnMsg);
        }
      }

      // Store template and variables
      this.currentTemplate = template;
      this.variables = template.variables;

      // Reset current variable index
      this.currentVariableIndex = 0;

      // Initialize variables and UI
      this.initializeVariables();

      // Generate initial output
      this.generateOutput();

      // Clear any error messages
      this.hideError();

      // Refresh MIDI panel for new variable set
      this._onTemplateLoadedMidi();

      // Update Run Code button visibility (show only when template has p5Code)
      this.codeOverlayManager?.updateP5CodeEditor();

      // Auto-save template to JSON directory (fire and forget - don't block UI)
      this.autoSaveTemplate(template);

      return true;

    } catch (error) {
      console.error('Failed to load template:', error);
      this.showError(error.message);

      // Try fallback if this wasn't already the fallback
      if (template !== this.config.fallbackTemplate) {
        console.log('Loading fallback template...');
        return this.loadTemplate(this.config.fallbackTemplate);
      }

      return false;
    }
  }

  /**
   * Initialize variables with random values
   */
  initializeVariables() {
    // Set random initial values for all variables
    this.variables.forEach(variable => {
      const weights = getWeightsArray(variable);
      const randomIndex = this.getWeightedRandomIndex(weights);
      this.currentValues[variable.name] = randomIndex;
    });

    // Create indicator dots
    this.createIndicatorDots();

    // Update display
    this.updateCenterControl();

    // Re-render knobs if in knob mode
    if (this.controlMode === 'knobs') {
      this.renderKnobs();
    }
  }

  /**
   * Create indicator dots for all variables
   */
  createIndicatorDots() {
    this.elements.variableIndicators.innerHTML = '';

    this.variables.forEach((variable, index) => {
      const dot = document.createElement('div');
      dot.className = 'indicator-dot';
      if (index === this.currentVariableIndex) {
        dot.classList.add('active');
      }
      dot.addEventListener('click', () => this.jumpToVariable(index));
      dot.title = variable.name;
      this.elements.variableIndicators.appendChild(dot);
    });
  }

  /**
   * Update the center control to show current variable
   */
  updateCenterControl() {
    if (this.variables.length === 0) {
      // Show empty state message
      this.elements.controlVariableName.setAttribute('data-variable-name', 'NO VARIABLES');
      this.elements.controlValue.textContent = 'Use "Add Variable from Template" in Code mode';
      this.elements.controlValue.style.fontSize = '14px';
      return;
    }

    const variable = this.variables[this.currentVariableIndex];
    const color = this.config.colorPalette[this.currentVariableIndex % this.config.colorPalette.length];
    const valueIndex = this.currentValues[variable.name];
    const value = getValueText(variable.values[valueIndex]);

    // Update variable name using data attribute for CSS ::before
    this.elements.controlVariableName.setAttribute('data-variable-name', variable.name.toUpperCase());

    // Update value (clear any cached original text first)
    this.elements.controlValue.removeAttribute('data-original-text');
    this.elements.controlValue.textContent = value;

    // Dynamically resize text to fit
    this.resizeControlValueText();

    // Update colors
    document.documentElement.style.setProperty('--current-color', color);

    // Darken color for gradient
    const darkColor = this.darkenColor(color, 20);
    document.documentElement.style.setProperty('--current-color-dark', darkColor);

    // Update indicator dots
    const dots = this.elements.variableIndicators.querySelectorAll('.indicator-dot');
    dots.forEach((dot, index) => {
      dot.classList.toggle('active', index === this.currentVariableIndex);
    });

    // Announce change for screen readers
    if (this.elements.announcer) {
      this.elements.announcer.textContent = `${variable.name}: ${value}`;
    }

    // Keep knobs in sync if in knob mode
    if (this.controlMode === 'knobs') {
      this.highlightActiveKnob(this.currentVariableIndex);
      this.variables.forEach((_, i) => this.updateKnobDisplay(i));
    }
  }

  /**
   * Format text with line breaks (max 12 characters per line)
   */
  resizeControlValueText() {
    const element = this.elements.controlValue;

    if (!element) return;

    // Get original text
    const originalText = element.getAttribute('data-original-text') || element.textContent;
    element.setAttribute('data-original-text', originalText);

    // Break text into lines with max 18 characters per line (wider control)
    const maxCharsPerLine = 18;
    const words = originalText.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach((word, index) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      if (testLine.length <= maxCharsPerLine) {
        currentLine = testLine;
      } else {
        // If current line has content, push it and start new line
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Single word is too long, break it
          lines.push(word.substring(0, maxCharsPerLine));
          currentLine = word.substring(maxCharsPerLine);
        }
      }

      // Push last line if this is the last word
      if (index === words.length - 1 && currentLine) {
        lines.push(currentLine);
      }
    });

    // Update element with line breaks (use textContent per-line to avoid XSS)
    element.textContent = '';
    lines.forEach((line, i) => {
      if (i > 0) element.appendChild(document.createElement('br'));
      element.appendChild(document.createTextNode(line));
    });

    // Adjust font size based on number of lines
    let fontSize;
    if (lines.length === 1) {
      fontSize = 42;
    } else if (lines.length === 2) {
      fontSize = 36;
    } else if (lines.length === 3) {
      fontSize = 30;
    } else {
      fontSize = 24;
    }

    element.style.fontSize = `${fontSize}px`;
  }

  /**
   * Navigate to previous variable
   */
  prevVariable() {
    if (this.variables.length === 0) return;
    this.currentVariableIndex = (this.currentVariableIndex - 1 + this.variables.length) % this.variables.length;
    this.updateCenterControl();
    this.generateOutput(); // Update highlight in output
    this.flashButton(this.elements.prevVariable);
  }

  /**
   * Navigate to next variable
   */
  nextVariable() {
    if (this.variables.length === 0) return;
    this.currentVariableIndex = (this.currentVariableIndex + 1) % this.variables.length;
    this.updateCenterControl();
    this.generateOutput(); // Update highlight in output
    this.flashButton(this.elements.nextVariable);
  }

  /**
   * Jump to specific variable by index
   */
  jumpToVariable(index) {
    if (index >= 0 && index < this.variables.length) {
      this.currentVariableIndex = index;
      this.updateCenterControl();
      this.generateOutput(); // Update highlight in output
    }
  }

  /**
   * Cycle value of current variable
   * @param {number} direction - 1 for next, -1 for previous
   */
  cycleValue(direction) {
    if (this.variables.length === 0) return;

    const variable = this.variables[this.currentVariableIndex];
    const currentIndex = this.currentValues[variable.name];
    const newIndex = (currentIndex + direction + variable.values.length) % variable.values.length;

    this.currentValues[variable.name] = newIndex;
    this.updateCenterControl();
    this.generateOutput();

    // Flash the appropriate arrow
    if (direction > 0) {
      this.flashButton(this.elements.controlArrowRight);
    } else {
      this.flashButton(this.elements.controlArrowLeft);
    }
  }

  /**
   * Randomize all variables
   */
  randomizeAllVariables() {
    this.variables.forEach(variable => {
      const weights = getWeightsArray(variable);
      const randomIndex = this.getWeightedRandomIndex(weights);
      this.currentValues[variable.name] = randomIndex;
    });

    this.updateCenterControl();
    this.generateOutput();
  }

  /**
   * Helper: Get random index based on weights
   * @param {number[]} weights - Array of weights (integers or floats)
   * @returns {number} Selected index
   */
  getWeightedRandomIndex(weights) {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random < 0) {
        return i;
      }
    }
    return weights.length - 1; // Fallback
  }

  /**
   * Handle keyboard navigation
   */
  handleKeyboard(e) {
    // Check if user is typing in an input, textarea, or navigating a select dropdown
    const activeTag = document.activeElement.tagName.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select' || document.activeElement.isContentEditable) {
      return;
    }

    // Check if any modal is open
    const isModalOpen = document.querySelector('.studio-modal.active') ||
      document.querySelector('.batch-modal-overlay.active') || // Assuming this class for batch modal
      document.querySelector('.batch-output-overlay.active') || // Assuming this class for output modal
      document.querySelector('.variable-picker-overlay.active') ||
      document.querySelector('.code-overlay.active') ||
      document.querySelector('.studio-lightbox.active');

    if (isModalOpen) {
      return;
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();

      if (this.controlMode === 'knobs') {
        // In knobs mode: left/right cycle active knob value, up/down switch active knob
        switch (e.key) {
          case 'ArrowLeft':
            this.cycleValue(-1);
            this.updateKnobDisplay(this.currentVariableIndex);
            break;
          case 'ArrowRight':
            this.cycleValue(1);
            this.updateKnobDisplay(this.currentVariableIndex);
            break;
          case 'ArrowUp':
            this.prevVariable();
            this.highlightActiveKnob(this.currentVariableIndex);
            break;
          case 'ArrowDown':
            this.nextVariable();
            this.highlightActiveKnob(this.currentVariableIndex);
            break;
        }
      } else {
        switch (e.key) {
          case 'ArrowUp':
            this.prevVariable();
            break;
          case 'ArrowDown':
            this.nextVariable();
            break;
          case 'ArrowLeft':
            this.cycleValue(-1);
            break;
          case 'ArrowRight':
            this.cycleValue(1);
            break;
        }
      }
    }
  }

  /**
   * Flash button for visual feedback
   */
  flashButton(button) {
    if (!button) return;
    button.classList.add('keyboard-flash');
    setTimeout(() => button.classList.remove('keyboard-flash'), 200);
  }

  // ───────────── Control Mode (D-Pad / Knobs) ─────────────

  /**
   * Switch between 'dpad' and 'knobs' control modes
   */
  setControlMode(mode) {
    if (mode === this.controlMode) return;
    this.controlMode = mode;

    const section = document.querySelector('.variable-control-section');

    // Toggle active button
    this.elements.modeDpad?.classList.toggle('active', mode === 'dpad');
    this.elements.modeKnobs?.classList.toggle('active', mode === 'knobs');

    if (mode === 'knobs') {
      section?.classList.add('knob-mode');
      this.elements.centerControl.style.display = 'none';
      this.elements.knobsContainer.style.display = 'flex';
      this.renderKnobs();
    } else {
      section?.classList.remove('knob-mode');
      this.elements.centerControl.style.display = '';
      this.elements.knobsContainer.style.display = 'none';
      this.updateCenterControl();
    }

    this.saveStateToStorage();
  }

  /**
   * Render all knob controls into the knobs container
   */
  renderKnobs() {
    const container = this.elements.knobsContainer;
    if (!container) return;
    container.innerHTML = '';

    this.variables.forEach((variable, index) => {
      const color = this.config.colorPalette[index % this.config.colorPalette.length];
      const valueIndex = this.currentValues[variable.name];
      const valueText = getValueText(variable.values[valueIndex]);
      const totalValues = variable.values.length;
      const rotation = totalValues > 1
        ? (valueIndex / (totalValues - 1)) * 270
        : 0;

      const item = document.createElement('div');
      item.className = 'knob-item' + (index === this.currentVariableIndex ? ' active' : '');
      item.style.setProperty('--knob-color', color);
      item.dataset.index = index;

      item.innerHTML = `
        <div class="knob-dial-wrapper">
          <div class="knob-ring"></div>
          <div class="knob-dial">
            <div class="knob-indicator" style="transform: translateX(-50%) rotate(${rotation - 135}deg)"></div>
          </div>
        </div>
        <div class="knob-value-label" title="${valueText}">${this.truncateKnobValue(valueText)}</div>
        <div class="knob-var-name">${variable.name}</div>
      `;

      // Click to select this variable
      item.addEventListener('click', (e) => {
        if (this._knobDragState?.dragged) return; // ignore if we just finished a drag
        this.jumpToVariable(index);
        this.highlightActiveKnob(index);
      });

      // Drag to rotate (change value)
      const dial = item.querySelector('.knob-dial-wrapper');
      dial.addEventListener('pointerdown', (e) => this.onKnobPointerDown(e, index));

      container.appendChild(item);
    });

    // Show MIDI badges on newly rendered knobs
    this.midiUI?._updateKnobBadges();
  }

  /**
   * Truncate value text for knob display
   */
  truncateKnobValue(text) {
    return text.length > 12 ? text.substring(0, 10) + '\u2026' : text;
  }

  /**
   * Highlight the active knob and deactivate others
   */
  highlightActiveKnob(activeIndex) {
    const items = this.elements.knobsContainer?.querySelectorAll('.knob-item');
    items?.forEach((item, i) => {
      item.classList.toggle('active', i === activeIndex);
    });
  }

  /**
   * Update a single knob's display (value label + indicator rotation)
   */
  updateKnobDisplay(index) {
    const container = this.elements.knobsContainer;
    if (!container) return;
    const item = container.children[index];
    if (!item) return;

    const variable = this.variables[index];
    const valueIndex = this.currentValues[variable.name];
    const valueText = getValueText(variable.values[valueIndex]);
    const totalValues = variable.values.length;
    const rotation = totalValues > 1
      ? (valueIndex / (totalValues - 1)) * 270
      : 0;

    const indicator = item.querySelector('.knob-indicator');
    if (indicator) {
      indicator.style.transform = `translateX(-50%) rotate(${rotation - 135}deg)`;
    }

    const label = item.querySelector('.knob-value-label');
    if (label) {
      label.textContent = this.truncateKnobValue(valueText);
      label.title = valueText;
    }
  }

  // ──── Knob Drag Interaction ────

  onKnobPointerDown(e, varIndex) {
    e.preventDefault();
    e.stopPropagation();

    const dial = e.currentTarget;
    const rect = dial.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);

    this._knobDragState = {
      varIndex,
      centerX,
      centerY,
      startAngle,
      startValueIndex: this.currentValues[this.variables[varIndex].name],
      dragged: false
    };

    dial.setPointerCapture(e.pointerId);
    dial.addEventListener('pointermove', this._onKnobPointerMove);
    dial.addEventListener('pointerup', this._onKnobPointerUp);
  }

  _onKnobPointerMove = (e) => {
    const state = this._knobDragState;
    if (!state) return;

    const angle = Math.atan2(e.clientY - state.centerY, e.clientX - state.centerX);
    let delta = angle - state.startAngle;
    // Normalize to [-PI, PI]
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;

    const variable = this.variables[state.varIndex];
    const totalValues = variable.values.length;
    if (totalValues <= 1) return;

    // Map angular delta to value steps (full rotation = all values)
    const sensitivity = totalValues / (2 * Math.PI);
    const stepDelta = Math.round(delta * sensitivity);

    if (stepDelta !== 0) {
      state.dragged = true;
      const newIndex = ((state.startValueIndex + stepDelta) % totalValues + totalValues) % totalValues;

      if (newIndex !== this.currentValues[variable.name]) {
        this.currentValues[variable.name] = newIndex;
        this.updateKnobDisplay(state.varIndex);
        this.generateOutput();
      }
    }
  }

  _onKnobPointerUp = (e) => {
    const dial = e.currentTarget;
    dial.releasePointerCapture(e.pointerId);
    dial.removeEventListener('pointermove', this._onKnobPointerMove);
    dial.removeEventListener('pointerup', this._onKnobPointerUp);

    // Reset drag state after a tick (so click handler can check .dragged)
    const wasDragged = this._knobDragState?.dragged;
    setTimeout(() => { this._knobDragState = null; }, 0);
  }

  /**
   * Darken a hex color by a percentage
   */
  darkenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) - amt));
    const G = Math.max(0, Math.min(255, (num >> 8 & 0xFF) - amt));
    const B = Math.max(0, Math.min(255, (num & 0xFF) - amt));
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  }

  generateOutput() {
    if (!this.currentTemplate) {
      return;
    }

    // Build variable map and color map
    const variableMap = {};
    const colorMap = {};

    this.variables.forEach((variable, index) => {
      // Use 'name' as the Token ID for matching {{placeholders}} in the template
      const varName = variable.name || variable.feature_name;
      const valueIndex = this.currentValues[variable.name];
      variableMap[varName] = getValueText(variable.values[valueIndex]);
      colorMap[varName] = this.config.colorPalette[index % this.config.colorPalette.length];
    });

    // Get current variable's name for highlighting
    const currentVariable = this.variables[this.currentVariableIndex];
    const currentVariableName = currentVariable ? (currentVariable.name || currentVariable.feature_name) : null;

    // Render colored text with current variable highlighted
    const html = this.textRenderer.renderColoredText(
      this.currentTemplate.promptTemplate,
      variableMap,
      colorMap,
      currentVariableName
    );

    this.textRenderer.updateDisplay(html);
    this.renderTagBadges();
    this.saveStateToStorage();

    // Auto-send prompt to Daydream Scope via OSC (debounced)
    if (this.osc) {
      this.osc.debouncedSendPrompt(this.getCurrentPromptText());
    }

    // Also push prompt through WebRTC data channel when streaming (lower latency)
    if (this.scopeVideo?.isStreaming) {
      this.scopeVideo.sendPromptUpdate(this.getCurrentPromptText());
    }

    // Sync variable values to the OBS display page in real-time
    if (this.displayBroadcaster) {
      this.displayBroadcaster.sendVarsUpdate(this.displayBroadcaster._buildVars());
    }
  }

  /**
   * Render small tag pill badges below the output area.
   * Clicking a badge opens the Code Overlay panel to the Tags section.
   */
  renderTagBadges() {
    const container = document.getElementById('tag-badges-container');
    if (!container) return;

    const tags = this.currentTemplate?.tags;
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = tags.map(tag => {
      const type = tag.type || 'custom';
      const label = tag.label || 'Untitled';
      const shortLabel = label.length > 30 ? label.slice(0, 27) + '...' : label;
      return `<button class="tag-badge-pill badge-${type}" title="${type.toUpperCase()}: ${label}">${shortLabel}</button>`;
    }).join('');

    // Click any badge → open Code Overlay to Tags section
    container.querySelectorAll('.tag-badge-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.codeOverlayManager) {
          this.codeOverlayManager.open();
          // Expand tags section if collapsed
          const tagsContent = document.getElementById('tags-section-content');
          if (tagsContent?.classList.contains('collapsed')) {
            this.codeOverlayManager.toggleTagsSection();
          }
        }
      });
    });
  }

  async handleCopy() {
    const success = await this.textRenderer.copyToClipboard();

    if (success) {
      // Visual feedback
      this.elements.copyButton.textContent = 'Copied!';
      this.elements.copyButton.classList.add('copied');

      setTimeout(() => {
        this.elements.copyButton.textContent = 'Copy';
        this.elements.copyButton.classList.remove('copied');
      }, 1500);
    } else {
      this.showError('Failed to copy to clipboard');
    }
  }

  getCurrentPromptText() {
    return this.textRenderer.getPlainText().trim();
  }

  /**
   * Handle Generate Image button - Auto-generate with Gemini 3 Pro
   */
  async handleGenerateImage() {
    const promptText = this.getCurrentPromptText();

    if (!promptText) {
      this.showError('No prompt available. Generate a prompt first.');
      return;
    }

    // Check if AI Studio integration is available
    if (!window.studioIntegrationInstance || typeof window.studioIntegrationInstance.generateImage !== 'function') {
      this.showError('AI Studio not initialized. Please refresh the page.');
      return;
    }

    // Update button state
    const btn = this.elements.generateButton;
    const labelSpan = btn.querySelector('.label');
    const originalText = labelSpan ? labelSpan.textContent : btn.textContent;

    if (labelSpan) {
      labelSpan.textContent = '⏳ Generating...';
    }
    btn.disabled = true;
    btn.style.opacity = '0.6';

    try {
      // Call AI Studio integration to generate image
      // Set up the Image Studio with Gemini 3 Pro and 1:1 aspect ratio
      await window.studioIntegrationInstance.openModal('image-studio-modal');

      // Pre-fill the prompt
      const promptInput = document.getElementById('image-prompt-input');
      if (promptInput) {
        promptInput.value = promptText;
      }

      // Set model to Gemini 3 Pro
      const modelSelect = document.getElementById('image-model-select');
      if (modelSelect) {
        modelSelect.value = 'gemini-3-pro-image-preview';
      }

      // Set aspect ratio to 1:1
      const aspectSelect = document.getElementById('image-aspect-select');
      if (aspectSelect) {
        aspectSelect.value = '1:1';
      }

      // Trigger the generation
      const runButton = document.getElementById('run-image-gen');
      if (runButton) {
        runButton.click();
      }

      // Reset button after a delay
      setTimeout(() => {
        if (labelSpan) {
          labelSpan.textContent = originalText;
        }
        btn.disabled = false;
        btn.style.opacity = '1';
      }, 1000);

    } catch (error) {
      console.error('Image generation failed:', error);
      this.showError(`Generation failed: ${error.message}`);

      // Reset button
      if (labelSpan) {
        labelSpan.textContent = originalText;
      }
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }

  addCurrentPromptToFavorites() {
    const promptText = this.getCurrentPromptText();
    if (!promptText) {
      this.showError('No prompt to add. Generate a prompt first.');
      return;
    }

    this.addPromptToFavorites(promptText);

    const btn = this.elements.favoriteButton;
    if (btn) {
      const labelSpan = btn.querySelector('.label');
      const originalLabel = btn.getAttribute('data-original-label') || (labelSpan ? labelSpan.textContent : btn.textContent);
      btn.setAttribute('data-original-label', originalLabel);

      btn.classList.add('favorited');
      if (labelSpan) {
        labelSpan.textContent = 'Added';
      }

      setTimeout(() => {
        btn.classList.remove('favorited');
        if (labelSpan) {
          labelSpan.textContent = originalLabel;
        }
      }, 1000);
    }
  }

  /**
   * Adds a specific prompt text to favorites
   * @param {string} promptText - The prompt to add
   * @returns {boolean} Success
   */
  addPromptToFavorites(promptText) {
    if (!promptText) return false;
    this.likedPrompts.push(promptText);
    this.saveStateToStorage();
    return true;
  }

  openFavoritesOverlay() {
    if (!this.elements.favoritesOverlay || !this.elements.favoritesTextarea) return;

    if (!this.likedPrompts.length) {
      this.elements.favoritesTextarea.value = 'No liked prompts yet. Use the ❤️ Add button to collect prompts.';
    } else {
      this.elements.favoritesTextarea.value = this.likedPrompts.join('\n');
    }

    this.elements.favoritesOverlay.classList.add('active');
  }

  closeFavoritesOverlay() {
    if (this.elements.favoritesOverlay) {
      this.elements.favoritesOverlay.classList.remove('active');
    }
  }

  copyFavorites() {
    if (!this.elements.favoritesTextarea) return;
    const text = this.elements.favoritesTextarea.value;
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback for older browsers / insecure contexts
      this.elements.favoritesTextarea.select();
      document.execCommand('copy');
    });
  }

  downloadFavorites() {
    if (!this.elements.favoritesTextarea) return;
    const content = this.elements.favoritesTextarea.value;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `synthograsizer-liked-prompts-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  clearFavorites() {
    this.likedPrompts = [];
    if (this.elements.favoritesTextarea) {
      this.elements.favoritesTextarea.value = '';
    }
    this.saveStateToStorage();
  }

  saveStateToStorage() {
    try {
      if (!this.currentTemplate || typeof window === 'undefined' || !window.localStorage) {
        return;
      }

      const state = {
        template: this.currentTemplate,
        currentValues: this.currentValues,
        currentVariableIndex: this.currentVariableIndex,
        likedPrompts: this.likedPrompts,
        controlMode: this.controlMode,
      };

      window.localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // Non-fatal; ignore storage errors
      console.warn('Failed to save Synthograsizer Mini state:', error);
    }
  }

  loadStateFromStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }

      const raw = window.localStorage.getItem(STATE_STORAGE_KEY);
      if (!raw) return false;

      const state = JSON.parse(raw);
      if (!state || typeof state !== 'object' || !state.template) {
        return false;
      }

      const validation = this.validateTemplate(state.template);
      if (!validation.valid) {
        console.warn('Saved template invalid, ignoring persisted state:', validation.error);
        return false;
      }

      const loaded = this.loadTemplate(state.template);
      if (!loaded) {
        return false;
      }

      // Restore currentValues within bounds
      if (state.currentValues && typeof state.currentValues === 'object') {
        this.variables.forEach((variable) => {
          const savedIndex = state.currentValues[variable.name];
          if (typeof savedIndex === 'number' && variable.values && variable.values.length) {
            const clampedIndex = Math.max(0, Math.min(savedIndex, variable.values.length - 1));
            this.currentValues[variable.name] = clampedIndex;
          }
        });
      }

      if (typeof state.currentVariableIndex === 'number' && this.variables.length) {
        this.currentVariableIndex = Math.max(0, Math.min(state.currentVariableIndex, this.variables.length - 1));
      }

      if (Array.isArray(state.likedPrompts)) {
        this.likedPrompts = state.likedPrompts;
      }

      this.updateCenterControl();
      this.generateOutput();

      // Restore control mode
      if (state.controlMode === 'knobs') {
        this.setControlMode('knobs');
      }

      return true;
    } catch (error) {
      console.warn('Failed to load Synthograsizer Mini state:', error);
      return false;
    }
  }

  /**
   * Handles importing template from JSON file
   * @param {File} file - File object
   */
  async handleImportFile(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const template = JSON.parse(text);

      // Validate first before attempting to load
      const validation = this.validateTemplate(template);
      if (!validation.valid) {
        this.showError(validation.error);
        this.elements.importFileInput.value = '';
        return;
      }

      const success = this.loadTemplate(template);

      if (success) {
        this.showSuccess('Template imported successfully!');
      }

      // Reset file input
      this.elements.importFileInput.value = '';

    } catch (error) {
      console.error('Import failed:', error);
      this.showError(ERROR_MESSAGES.IMPORT_FAILED);
    }
  }

  /**
   * Exports current prompt as JSON
   */
  exportTemplate() {
    try {
      const exportData = {
        template: this.currentTemplate ? this.currentTemplate.promptTemplate : '',
        variables: {},
        generatedText: this.textRenderer.getPlainText(),
        timestamp: new Date().toISOString()
      };

      // Add current variable values
      this.variables.forEach(variable => {
        const valueIndex = this.currentValues[variable.name];
        exportData.variables[variable.name] = {
          value: getValueText(variable.values[valueIndex]),
          index: valueIndex
        };
      });

      // Include provenance tags if any exist
      if (this.currentTemplate?.tags?.length > 0) {
        exportData.tags = this.currentTemplate.tags;
      }

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `synthograsizer-mini-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showSuccess('Prompt exported successfully!');

    } catch (error) {
      console.error('Export failed:', error);
      this.showError(ERROR_MESSAGES.EXPORT_FAILED);
    }
  }

  /**
   * Automatically saves a template to the JSON directory.
   * This is called whenever a template is loaded (from generation, import, etc.)
   * Fire-and-forget: doesn't block UI or show errors to user.
   * @param {Object} template - Template object to save
   */
  async autoSaveTemplate(template) {
    try {
      if (!template) return;

      const response = await fetch('/api/save-template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template: template
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Auto-saved template to:', result.filepath);
      } else {
        console.warn('Auto-save failed:', response.status, response.statusText);
      }
    } catch (error) {
      // Silently fail - don't disrupt user experience
      console.warn('Auto-save template failed (backend may be unavailable):', error);
    }
  }

  /**
   * Exports the full current template workflow JSON (all variables + values + p5Code etc.)
   * Saves to C:\Users\Alexander\Desktop\Synthograsizer_Output\JSON\Project Templates
   */
  async exportFullTemplate() {
    try {
      if (!this.currentTemplate) {
        this.showError('No template loaded to export.');
        return;
      }

      // Try to save to the backend first
      try {
        const response = await fetch('/api/save-template', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            template: this.currentTemplate
          })
        });

        if (response.ok) {
          const result = await response.json();
          this.showSuccess(`Template saved to: ${result.filename}`);
          return;
        } else {
          // If backend fails, fall back to download
          console.warn('Backend save failed, falling back to download');
        }
      } catch (backendError) {
        console.warn('Backend not available, falling back to download:', backendError);
      }

      // Fallback to original download behavior
      const json = JSON.stringify(this.currentTemplate, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Derive a filename from the template name field, or fall back to a timestamp
      const safeName = (this.currentTemplate.name || 'template')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      a.download = `synthograsizer-${safeName}-${Date.now()}.json`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showSuccess('Template exported successfully! (Note: Saved to Downloads folder - backend not available)');

    } catch (error) {
      console.error('Full template export failed:', error);
      this.showError(ERROR_MESSAGES.EXPORT_FAILED);
    }
  }

  showError(message) {
    if (this.elements.errorDisplay) {
      this.elements.errorDisplay.textContent = message;
      this.elements.errorDisplay.classList.add('show');
    }
  }

  hideError() {
    if (this.elements.errorDisplay) {
      this.elements.errorDisplay.classList.remove('show');
    }
  }

  showSuccess(message) {
    // Temporarily use error display for success messages
    // Could be enhanced with a dedicated success element
    this.showError(message);
    setTimeout(() => this.hideError(), 3000);
  }

  // ─────────────────────────────────────────────
  //  MIDI integration
  // ─────────────────────────────────────────────

  _initMIDI() {
    this.midi = new MIDIController(this, {
      onStatusChange: (status, deviceName) => {
        this.midiUI?.onStatusChange(status, deviceName);
      },
      onLearnCapture: (type, varIndex, number, channel) => {
        this.midiUI?.onLearnCapture(type, varIndex, number, channel);
      },
      onValueChange: (varIndex, newValueIndex) => {
        // Flash the knob ring briefly if in knobs mode
        if (this.controlMode === 'knobs') {
          const item = this.elements.knobsContainer?.children[varIndex];
          if (item) {
            item.classList.add('midi-flash');
            setTimeout(() => item.classList.remove('midi-flash'), 150);
          }
        }
      },
    });

    this.midiUI = new MIDIPanelUI(this, this.midi);

    // Kick off MIDI access request (non-blocking)
    this.midi.init();
  }

  _initOSC() {
    this.osc = new OSCController();
    this.oscUI = new OSCPanelUI(this.osc);
  }

  _initScopeVideo() {
    this.scopeVideo = new ScopeVideoClient({
      onStatusChange: (status, detail) => {
        this.scopeVideoUI?.onStatusChange(status, detail);
      },
    });
    this.scopeVideoUI = new ScopeVideoPanelUI(this, this.scopeVideo);
  }

  _initDisplayBroadcaster() {
    this.displayBroadcaster = new DisplayBroadcaster(this);
  }

  _initGlitcherControls() {
    this.glitcherControls = new GlitcherControls(this);
  }

  /** Called after a template loads — prune dead mappings & refresh UI */
  _onTemplateLoadedMidi() {
    if (!this.midi) return;
    this.midi.pruneStaleMappings();
    this.midiUI?.refresh();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MIDIPanelUI — manages the MIDI bar + collapsible panel DOM
// ─────────────────────────────────────────────────────────────────────────────

class MIDIPanelUI {
  constructor(app, midi) {
    this.app = app;
    this.midi = midi;

    this._el = {
      bar:         document.getElementById('midi-bar'),
      toggleBtn:   document.getElementById('midi-toggle-btn'),
      statusText:  document.getElementById('midi-status-text'),
      dot:         document.getElementById('midi-dot'),
      panel:       document.getElementById('midi-panel'),
      deviceName:  document.getElementById('midi-device-name'),
      learnHint:   document.getElementById('midi-learn-hint'),
      learnCancel: document.getElementById('midi-learn-cancel'),
      mappingsGrid:document.getElementById('midi-mappings-grid'),
      clearBtn:    document.getElementById('midi-clear-btn'),
    };

    this._panelOpen = false;
    this._setupListeners();
    this.refresh();
  }

  _setupListeners() {
    const { toggleBtn, learnCancel, clearBtn } = this._el;

    toggleBtn?.addEventListener('click', () => this._togglePanel());
    learnCancel?.addEventListener('click', () => {
      this.midi.cancelLearn();
      this._setLearnHint(false);
      this.refresh();
    });
    clearBtn?.addEventListener('click', () => {
      this.midi.clearAllMappings();
      this.refresh();
    });
  }

  _togglePanel() {
    this._panelOpen = !this._panelOpen;
    this._el.panel.style.display = this._panelOpen ? 'block' : 'none';
    this._el.toggleBtn.classList.toggle('active', this._panelOpen);
    if (this._panelOpen) this.refresh();
  }

  // ── Status callbacks ──────────────────────────────────────────────────────

  onStatusChange(status, deviceName) {
    const { dot, statusText, deviceName: devEl } = this._el;
    if (status === 'connected') {
      dot?.classList.add('connected');
      dot?.classList.remove('learning');
      if (statusText) statusText.textContent = 'MIDI';
      if (devEl) devEl.textContent = deviceName || '';
    } else if (status === 'disconnected') {
      dot?.classList.remove('connected', 'learning');
      if (devEl) devEl.textContent = '';
    } else if (status === 'unsupported') {
      if (statusText) statusText.textContent = 'No MIDI';
    } else if (status === 'denied') {
      if (statusText) statusText.textContent = 'MIDI denied';
    }
    this.refresh();
  }

  onLearnCapture(type, varIndex, number, channel) {
    this._setLearnHint(false);
    this._el.dot?.classList.remove('learning');
    this.refresh();
  }

  _setLearnHint(visible) {
    const { learnHint, learnCancel, dot } = this._el;
    if (learnHint) learnHint.style.display = visible ? 'block' : 'none';
    if (learnCancel) learnCancel.style.display = visible ? '' : 'none';
    if (visible) {
      dot?.classList.add('learning');
      dot?.classList.remove('connected');
    } else {
      dot?.classList.remove('learning');
      if (this.midi.deviceCount > 0) dot?.classList.add('connected');
    }
  }

  // ── Panel rendering ───────────────────────────────────────────────────────

  refresh() {
    if (!this._panelOpen) {
      // Still update knob badges even when panel is closed
      this._updateKnobBadges();
      return;
    }
    this._renderMappingsGrid();
    this._updateKnobBadges();
  }

  _renderMappingsGrid() {
    const grid = this._el.mappingsGrid;
    if (!grid) return;
    grid.innerHTML = '';

    const vars = this.app.variables;
    if (!vars || vars.length === 0) {
      grid.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:6px">No variables loaded.</div>';
      return;
    }

    vars.forEach((variable, varIndex) => {
      const ccMap   = this.midi.getCCForVar(varIndex);
      const noteMap = this.midi.getNoteForVar(varIndex);
      const color   = this.app.config.colorPalette[varIndex % this.app.config.colorPalette.length];
      const isLearning = this.midi.learnMode?.varIndex === varIndex;

      const row = document.createElement('div');
      row.className = 'midi-mapping-row' +
        (isLearning ? ' learning' : '') +
        (ccMap || noteMap ? ' has-mapping' : '');

      // Variable name
      const nameEl = document.createElement('div');
      nameEl.className = 'midi-var-label';
      nameEl.style.color = color;
      nameEl.textContent = variable.name;
      row.appendChild(nameEl);

      // CC badge or learn button
      const ccEl = document.createElement('div');
      if (ccMap) {
        ccEl.className = 'midi-cc-badge';
        ccEl.title = `Channel ${ccMap.channel + 1}`;
        ccEl.textContent = `CC ${ccMap.number}`;
        ccEl.style.cursor = 'pointer';
        ccEl.addEventListener('click', () => {
          this.midi.removeCCMapping(varIndex);
          this.refresh();
        });
        ccEl.title = `CC ${ccMap.number} ch${ccMap.channel + 1} — click to remove`;
      } else {
        ccEl.innerHTML = `<button class="midi-learn-cc-btn">CC</button>`;
        ccEl.querySelector('button').addEventListener('click', () => this._startLearn('cc', varIndex));
      }
      row.appendChild(ccEl);

      // Note badge or learn button
      const noteEl = document.createElement('div');
      if (noteMap) {
        noteEl.className = 'midi-note-badge';
        noteEl.textContent = MIDIController.noteNumberToName(noteMap.number);
        noteEl.style.cursor = 'pointer';
        noteEl.title = `Note ${noteMap.number} ch${noteMap.channel + 1} — click to remove`;
        noteEl.addEventListener('click', () => {
          this.midi.removeNoteMapping(varIndex);
          this.refresh();
        });
      } else {
        noteEl.innerHTML = `<button class="midi-learn-note-btn">Note</button>`;
        noteEl.querySelector('button').addEventListener('click', () => this._startLearn('note', varIndex));
      }
      row.appendChild(noteEl);

      grid.appendChild(row);
    });
  }

  _startLearn(type, varIndex) {
    const started = type === 'cc'
      ? this.midi.startLearnCC(varIndex)
      : this.midi.startLearnNote(varIndex);

    if (!started) {
      alert('No MIDI device connected. Connect a controller and try again.');
      return;
    }

    this._setLearnHint(true);
    this.refresh(); // re-render to show .learning row
  }

  // ── Knob badge overlays ───────────────────────────────────────────────────

  _updateKnobBadges() {
    if (this.app.controlMode !== 'knobs') return;
    const container = this.app.elements.knobsContainer;
    if (!container) return;

    Array.from(container.children).forEach((item, i) => {
      // Remove old badge
      item.querySelector('.knob-midi-badge')?.remove();

      const ccMap   = this.midi.getCCForVar(i);
      const noteMap = this.midi.getNoteForVar(i);

      if (ccMap || noteMap) {
        const badge = document.createElement('div');
        badge.className = 'knob-midi-badge';
        badge.title = ccMap
          ? `MIDI CC ${ccMap.number}`
          : `MIDI Note ${MIDIController.noteNumberToName(noteMap.number)}`;
        badge.textContent = ccMap ? '♪' : '♩';
        // Insert into the knob-dial-wrapper so position:absolute works
        item.querySelector('.knob-dial-wrapper')?.appendChild(badge);
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ScopeVideoPanelUI — toggle bar + collapsible panel for Scope Video
// ─────────────────────────────────────────────────────────────────────────────

class ScopeVideoPanelUI {
  constructor(app, scopeVideo) {
    this.app = app;
    this.sv = scopeVideo;

    this.toggleBtn   = document.getElementById('sv-toggle-btn');
    this.panel       = document.getElementById('sv-panel');
    this.dot         = document.getElementById('sv-dot');
    this.statusText  = document.getElementById('sv-status-text');
    this.statusDetail = document.getElementById('sv-status-detail');
    this.scopeUrlInput = document.getElementById('sv-scope-url');
    this.fpsSelect   = document.getElementById('sv-fps');
    this.streamBtn   = document.getElementById('sv-stream-btn');

    if (!this.toggleBtn || !this.panel) return;

    this._initValues();
    this._bindEvents();
    this._updateDot();
  }

  _initValues() {
    if (this.scopeUrlInput) this.scopeUrlInput.value = this.sv.scopeUrl;
    if (this.fpsSelect)     this.fpsSelect.value = String(this.sv.fps);
  }

  _bindEvents() {
    // Toggle panel
    this.toggleBtn.addEventListener('click', () => {
      const open = this.panel.style.display !== 'none';
      this.panel.style.display = open ? 'none' : 'block';
      this.toggleBtn.classList.toggle('active', !open);
    });

    // Scope URL
    this.scopeUrlInput?.addEventListener('change', () => {
      this.sv.setScopeUrl(this.scopeUrlInput.value);
    });

    // FPS
    this.fpsSelect?.addEventListener('change', () => {
      this.sv.setFps(parseInt(this.fpsSelect.value, 10));
    });

    // Start / Stop stream button
    this.streamBtn?.addEventListener('click', async () => {
      if (this.sv.isStreaming) {
        await this.sv.stopStream();
      } else {
        const canvas = this.app.codeOverlayManager?.getActiveCanvas();
        const prompt = this.app.getCurrentPromptText?.() || '';
        await this.sv.startStream(canvas, prompt);
      }
    });
  }

  onStatusChange(status, detail) {
    this._updateDot(status);
    if (this.statusDetail) {
      this.statusDetail.textContent = detail || '';
      this.statusDetail.title = detail || '';
    }
    if (this.streamBtn) {
      const isLive = (status === 'streaming');
      this.streamBtn.textContent = isLive ? '⏹ Stop Stream' : '▶ Start Stream';
    }
    if (this.statusText) {
      if (status === 'streaming') this.statusText.textContent = 'Live';
      else if (status === 'connecting') this.statusText.textContent = 'Connecting';
      else if (status === 'error') this.statusText.textContent = 'Err';
      else this.statusText.textContent = 'Video';
    }

    // Show / hide the Scope video output element
    const videoSection = document.getElementById('scope-video-section');
    if (videoSection) {
      videoSection.style.display = (status === 'streaming') ? 'block' : 'none';
    }
  }

  _updateDot(status) {
    if (!this.dot) return;
    this.dot.classList.remove('osc-on', 'osc-sent', 'osc-error');
    if (status === 'streaming') {
      this.dot.classList.add('osc-on');
    } else if (status === 'frame-sent') {
      this.dot.classList.add('osc-sent');
      setTimeout(() => this.dot.classList.remove('osc-sent'), 400);
    } else if (status === 'error' || status === 'disconnected') {
      this.dot.classList.add('osc-error');
    }
  }
}

// Auto-initialize when module loads
try {
  const app = new SynthograsizerSmall();

  // Expose for debugging
  window.synthSmall = app;
} catch (error) {
  console.error('Failed to create SynthograsizerSmall:', error);
  document.body.innerHTML += `<div style="padding: 20px; background: #fee; color: #c33; border: 2px solid #c33; margin: 20px;">
    <h2>Failed to Initialize</h2>
    <p><strong>Error:</strong> ${error.message}</p>
    <p><strong>Stack:</strong></p>
    <pre>${error.stack}</pre>
  </div>`;
}
