/**
 * GlitcherControls - Manages the Glitcher UI panel and broadcasts state to the display window.
 * Now with dynamic filter sub-parameter controls.
 */
import { FILTER_CONTROLS, getFilterControlConfig } from '../../glitcher/config/filter-controls-config.js';

const GLITCH_PRESETS_KEY = 'synthograsizerGlitchPresetsV1';

export class GlitcherControls {
  constructor(app) {
    this.app = app;

    // UI Elements
    this.toggleBtn = document.getElementById('glitch-toggle-btn');
    this.panel     = document.getElementById('glitch-panel');
    this.dot       = document.getElementById('glitch-dot');
    this.statusText= document.getElementById('glitch-status-text');
    this.filterParamsContainer = document.getElementById('glitch-filter-params');

    // Preset elements
    this.presetSelect = document.getElementById('glitch-preset-select');
    this.presetSaveBtn = document.getElementById('glitch-preset-save');
    this.presetDeleteBtn = document.getElementById('glitch-preset-delete');

    // Control inputs
    this.controls = {
      pixelSort:  document.getElementById('glitch-pixel-sort'),
      slice:      document.getElementById('glitch-slice'),
      direction:  document.getElementById('glitch-direction'),
      spiral:     document.getElementById('glitch-spiral'),
      colorShift: document.getElementById('glitch-color'),
      filter:     document.getElementById('glitch-filter'),
      intensity:  document.getElementById('glitch-intensity'),
      speed:      document.getElementById('glitch-speed'),
      swirl:      document.getElementById('glitch-swirl'),
      offset:     document.getElementById('glitch-offset'),
      minLife:    document.getElementById('glitch-min-life'),
      maxLife:    document.getElementById('glitch-max-life'),
      sensitivity:document.getElementById('glitch-sensitivity')
    };

    // Action buttons
    this.pauseBtn = document.getElementById('glitch-pause-btn');
    this.resetBtn = document.getElementById('glitch-reset-btn');

    // Glitcher state object — broadcasted to display window
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
      sensitivity: 1.0,
      filterParams: {}   // Sub-parameters for the active filter
    };

    // Track the current filter type to avoid unnecessary UI rebuilds
    this._lastRenderedFilter = null;

    if (!this.toggleBtn || !this.panel) return;

    this._bindEvents();
    this._bindPresetEvents();
    this._refreshPresetList();
    this._broadcastState(); // initial broadcast
  }

  _bindEvents() {
    // Toggle overall Glitcher active state
    this.toggleBtn.addEventListener('click', () => {
      const open = this.panel.style.display !== 'none';
      this.panel.style.display = open ? 'none' : 'block';
      this.toggleBtn.classList.toggle('active', !open);
      
      this.state.enabled = !open;
      this._updateDot();
      this._broadcastState();
    });

    // Handle input changes — NO image reload, just state update
    Object.keys(this.controls).forEach(key => {
      const el = this.controls[key];
      if (el) {
        const handler = () => {
          this._updateStateFromUI();
          // If filter changed, rebuild sub-parameter controls
          if (key === 'filter') {
            this._renderFilterParams();
          }
        };
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
      }
    });

    // Pause button
    if (this.pauseBtn) {
      this.pauseBtn.addEventListener('click', () => {
        this.state.paused = !this.state.paused;
        this.pauseBtn.textContent = this.state.paused ? '▶ Resume' : '⏸ Pause';
        this.pauseBtn.classList.toggle('active', this.state.paused);
        this._broadcastState();
      });
    }

    // Reset button — sends a separate reset message
    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => {
        this._broadcastReset();
      });
    }

    // Event delegation for real-time arrow key cycling on select elements
    this.panel.addEventListener('keydown', (e) => {
      const el = e.target;
      if (el.tagName.toLowerCase() === 'select') {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault(); // Prevent default browser select behavior
          const currentIdx = el.selectedIndex;
          const dir = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
          let newIdx = currentIdx + dir;
          
          // Find next valid option
          while (newIdx >= 0 && newIdx < el.options.length) {
            if (!el.options[newIdx].disabled) {
              el.selectedIndex = newIdx;
              // Dispatch input/change events to trigger handlers
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
            newIdx += dir;
          }
        }
      }
    });
  }

  _updateStateFromUI() {
    this.state.pixelSort  = this.controls.pixelSort?.value  || 'off';
    this.state.slice      = this.controls.slice?.value      || 'off';
    this.state.direction  = this.controls.direction?.value  || 'off';
    this.state.spiral     = this.controls.spiral?.value     || 'off';
    this.state.colorShift = this.controls.colorShift?.value || 'off';
    this.state.filter     = this.controls.filter?.value     || 'off';
    this.state.intensity  = parseInt(this.controls.intensity?.value || 50, 10);
    this.state.speed      = parseInt(this.controls.speed?.value || 2, 10);
    this.state.swirl      = parseFloat(this.controls.swirl?.value || 0.06);
    this.state.offset     = parseInt(this.controls.offset?.value || 0, 10);
    this.state.minLife    = parseInt(this.controls.minLife?.value || 90, 10);
    this.state.maxLife    = parseInt(this.controls.maxLife?.value || 150, 10);
    this.state.sensitivity = parseFloat(this.controls.sensitivity?.value || 1.0);
    
    // Read filter sub-parameter values from the dynamically generated controls
    this._readFilterParams();
    
    this._broadcastState();
  }

  /**
   * Read current values from the dynamic filter sub-parameter controls.
   */
  _readFilterParams() {
    if (!this.filterParamsContainer) return;
    const params = {};
    const inputs = this.filterParamsContainer.querySelectorAll('[data-param-id]');

    // Helper to convert kebab-case to camelCase and strip prefixes
    const toCamelCase = (str) => {
      str = str.replace(/^(pointillism|mosaic|sketch|comic|dithering)-/, '');
      return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    };

    // Helper to convert hex #RRGGBB to [R, G, B]
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ] : [0, 0, 0];
    };

    // Keys that Glitcher's artistic filter expects as hex strings
    const keepAsHex = ['backgroundColor', 'paperColor', 'pencilColor'];

    inputs.forEach(input => {
      const rawId = input.dataset.paramId;
      const id = toCamelCase(rawId);

      let val;
      if (input.type === 'checkbox') {
        val = input.checked;
      } else if (input.type === 'range' || input.type === 'number') {
        val = parseFloat(input.value);
      } else if (input.type === 'color') {
        val = keepAsHex.includes(id) ? input.value : hexToRgb(input.value);
      } else {
        val = input.value;
      }
      
      params[id] = val;
    });
    
    this.state.filterParams = params;
  }

  /**
   * Dynamically render sub-parameter controls for the currently selected filter.
   * Uses the FILTER_CONTROLS config from the Glitcher.
   */
  _renderFilterParams() {
    if (!this.filterParamsContainer) return;
    
    const filterType = this.state.filter;
    
    // Don't rebuild if we already rendered for this filter
    if (filterType === this._lastRenderedFilter) return;
    this._lastRenderedFilter = filterType;
    
    // Clear existing controls
    this.filterParamsContainer.innerHTML = '';
    
    if (filterType === 'off') return;
    
    // Look up config for this filter type
    const config = getFilterControlConfig(filterType);
    if (!config || !config.controls || config.controls.length === 0) return;

    // Add a sub-header
    const header = document.createElement('div');
    header.style.cssText = 'font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; margin: 6px 0 4px 0; color: rgba(0,0,0,0.4);';
    header.textContent = 'Filter Parameters';
    this.filterParamsContainer.appendChild(header);

    config.controls.forEach(ctrl => {
      const row = document.createElement('label');
      row.className = 'osc-row';
      
      const label = document.createElement('span');
      label.textContent = ctrl.label || ctrl.id;
      row.appendChild(label);

      let input;

      switch (ctrl.type) {
        case 'slider': {
          input = document.createElement('input');
          input.type = 'range';
          input.min = ctrl.min ?? 0;
          input.max = ctrl.max ?? 100;
          input.step = ctrl.step ?? 1;
          input.value = ctrl.default ?? ctrl.min ?? 0;
          input.style.width = '90px';
          input.dataset.paramId = ctrl.id;
          break;
        }
        case 'select':
        case 'dropdown': {
          input = document.createElement('select');
          input.className = 'osc-input osc-input-sm';
          (ctrl.options || []).forEach(opt => {
            const o = document.createElement('option');
            o.value = typeof opt === 'object' ? opt.value : opt;
            o.textContent = typeof opt === 'object' ? opt.label : opt;
            if ((typeof opt === 'object' ? opt.value : opt) === ctrl.default) {
              o.selected = true;
            }
            input.appendChild(o);
          });
          input.dataset.paramId = ctrl.id;
          break;
        }
        case 'color': {
          input = document.createElement('input');
          input.type = 'color';
          input.value = ctrl.default || '#ffffff';
          input.style.width = '40px';
          input.style.height = '24px';
          input.dataset.paramId = ctrl.id;
          break;
        }
        case 'checkbox':
        case 'toggle': {
          input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = ctrl.default ?? false;
          input.dataset.paramId = ctrl.id;
          break;
        }
        default: {
          input = document.createElement('input');
          input.type = 'text';
          input.value = ctrl.default ?? '';
          input.dataset.paramId = ctrl.id;
          break;
        }
      }

      if (input) {
        // Listen for changes on sub-params — update state and broadcast
        input.addEventListener('input', () => {
          this._readFilterParams();
          this._broadcastState();
        });
        input.addEventListener('change', () => {
          this._readFilterParams();
          this._broadcastState();
        });
        row.appendChild(input);
      }

      this.filterParamsContainer.appendChild(row);
    });

    // Read initial values from the newly rendered controls
    this._readFilterParams();
  }

  _broadcastState() {
    // Flash the dot to indicate transmission
    if (this.dot) {
      this.dot.classList.add('osc-sent');
      setTimeout(() => this.dot.classList.remove('osc-sent'), 200);
    }
    
    // Check if DisplayBroadcaster is available on the app
    if (this.app.displayBroadcaster && this.app.displayBroadcaster._channel) {
      this.app.displayBroadcaster._channel.postMessage({
        type: 'glitch-vars',
        data: this.state
      });
    }
  }

  _broadcastReset() {
    if (this.app.displayBroadcaster && this.app.displayBroadcaster._channel) {
      this.app.displayBroadcaster._channel.postMessage({
        type: 'glitch-reset'
      });
    }
    // Also flash the dot
    if (this.dot) {
      this.dot.classList.add('osc-sent');
      setTimeout(() => this.dot.classList.remove('osc-sent'), 200);
    }
  }

  _updateDot() {
    if (!this.dot) return;
    if (this.state.enabled) {
      this.dot.classList.add('osc-on');
      if (this.toggleBtn) {
        const filter = this.state.filter && this.state.filter !== 'off' ? ` · filter: ${this.state.filter}` : '';
        this.toggleBtn.dataset.tooltip = `Glitcher — active${filter}`;
      }
    } else {
      this.dot.classList.remove('osc-on');
      if (this.toggleBtn) this.toggleBtn.dataset.tooltip = 'Glitcher — no effects active';
    }
  }

  // ── Presets ──────────────────────────────────────────────────

  _bindPresetEvents() {
    this.presetSaveBtn?.addEventListener('click', () => this._savePreset());
    this.presetDeleteBtn?.addEventListener('click', () => this._deletePreset());
    this.presetSelect?.addEventListener('change', () => this._loadSelectedPreset());
  }

  _getPresets() {
    try {
      return JSON.parse(localStorage.getItem(GLITCH_PRESETS_KEY)) || {};
    } catch { return {}; }
  }

  _savePresets(presets) {
    try { localStorage.setItem(GLITCH_PRESETS_KEY, JSON.stringify(presets)); } catch {}
  }

  _refreshPresetList() {
    if (!this.presetSelect) return;
    const presets = this._getPresets();
    // Keep the placeholder option, remove the rest
    while (this.presetSelect.options.length > 1) this.presetSelect.remove(1);
    Object.keys(presets).sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      this.presetSelect.appendChild(opt);
    });
    this.presetSelect.value = '';
  }

  _savePreset() {
    const name = prompt('Preset name:');
    if (!name || !name.trim()) return;
    const presets = this._getPresets();
    // Snapshot the state (exclude transient flags)
    const { enabled, paused, ...snapshot } = this.state;
    presets[name.trim()] = snapshot;
    this._savePresets(presets);
    this._refreshPresetList();
    this.presetSelect.value = name.trim();
  }

  _deletePreset() {
    const name = this.presetSelect?.value;
    if (!name) return;
    const presets = this._getPresets();
    delete presets[name];
    this._savePresets(presets);
    this._refreshPresetList();
  }

  _loadSelectedPreset() {
    const name = this.presetSelect?.value;
    if (!name) return;
    const presets = this._getPresets();
    const snapshot = presets[name];
    if (!snapshot) return;

    // Apply snapshot to state (keep enabled/paused as-is)
    Object.assign(this.state, snapshot);

    // Push values into UI controls
    Object.entries(this.controls).forEach(([key, el]) => {
      if (!el) return;
      const val = this.state[key];
      if (val !== undefined) el.value = String(val);
    });

    // Rebuild filter sub-params if filter changed
    this._lastRenderedFilter = null;
    this._renderFilterParams();

    this._broadcastState();
  }
}
