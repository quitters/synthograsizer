/**
 * Filter Controls UI Generator
 * Dynamically generates UI controls for filter effects
 */

import { FILTER_CONTROLS } from '../config/filter-controls-config.js';

export class FilterControlsUI {
  constructor() {
    this.currentFilterType = null;
    this.controlValues = new Map();
    this.changeCallbacks = [];
  }

  /**
   * Register a callback for when control values change
   * @param {Function} callback - Function to call with (filterType, controlId, value)
   */
  onControlChange(callback) {
    this.changeCallbacks.push(callback);
  }

  /**
   * Generate HTML for filter controls
   * @param {string} filterType - The filter type (e.g., 'emboss', 'cyberpunk-neon')
   * @returns {string} HTML string for the controls
   */
  generateControlsHTML(filterType) {
    const config = FILTER_CONTROLS[filterType];
    if (!config || !config.controls || config.controls.length === 0) {
      return '';
    }

    let html = '';
    config.controls.forEach(control => {
      html += this.generateControlHTML(control);
    });

    return html;
  }

  /**
   * Generate HTML for a single control
   * @param {Object} control - Control configuration
   * @returns {string} HTML string
   */
  generateControlHTML(control) {
    let html = '<div class="control-row">';

    switch (control.type) {
      case 'slider':
        html += `
          <label for="${control.id}">${control.label}: 
            <span id="${control.id}-value">${control.default}${control.unit || ''}</span>
          </label>
          <input type="range" 
                 id="${control.id}" 
                 class="control-slider" 
                 min="${control.min}" 
                 max="${control.max}" 
                 step="${control.step || 1}" 
                 value="${control.default}"
                 data-filter-control="true">
        `;
        break;

      case 'color':
        html += `
          <label for="${control.id}">${control.label}:</label>
          <input type="color" 
                 id="${control.id}" 
                 class="control-color-picker" 
                 value="${control.default}"
                 data-filter-control="true">
        `;
        break;

      case 'select':
        html += `
          <label for="${control.id}">${control.label}:</label>
          <select id="${control.id}" 
                  class="control-select"
                  data-filter-control="true">
            ${control.options.map(opt => 
              `<option value="${opt.value}" ${opt.value === control.default ? 'selected' : ''}>
                ${opt.label}
              </option>`
            ).join('')}
          </select>
        `;
        break;

      case 'checkbox':
        html += `
          <div class="checkbox-container">
            <input type="checkbox" 
                   id="${control.id}" 
                   class="control-checkbox"
                   ${control.default ? 'checked' : ''}
                   data-filter-control="true">
            <label for="${control.id}">${control.label}</label>
          </div>
        `;
        break;
    }

    html += '</div>';
    return html;
  }

  /**
   * Update the controls container for a specific filter
   * @param {string} filterType - The filter type
   * @param {HTMLElement} container - The container element to update
   */
  updateControlsContainer(filterType, container) {
    if (!container) return;

    this.currentFilterType = filterType;
    const html = this.generateControlsHTML(filterType);
    container.innerHTML = html;

    // Add event listeners to the new controls
    this.attachEventListeners(container);

    // Restore any previously set values
    this.restoreControlValues(filterType);
  }

  /**
   * Attach event listeners to dynamically created controls
   * @param {HTMLElement} container - The container with the controls
   */
  attachEventListeners(container) {
    const controls = container.querySelectorAll('[data-filter-control="true"]');
    
    controls.forEach(control => {
      if (control.type === 'range') {
        // Update display value for sliders
        control.addEventListener('input', (e) => {
          const displayEl = document.getElementById(`${control.id}-value`);
          if (displayEl) {
            const config = this.getControlConfig(control.id);
            const unit = config?.unit || '';
            displayEl.textContent = e.target.value + unit;
          }
          this.handleControlChange(control.id, e.target.value);
        });
      } else if (control.type === 'color' || control.type === 'select-one') {
        control.addEventListener('change', (e) => {
          this.handleControlChange(control.id, e.target.value);
        });
      } else if (control.type === 'checkbox') {
        control.addEventListener('change', (e) => {
          this.handleControlChange(control.id, e.target.checked);
        });
      }
    });
  }

  /**
   * Handle control value changes
   * @param {string} controlId - The control ID
   * @param {any} value - The new value
   */
  handleControlChange(controlId, value) {
    // Store the value
    const key = `${this.currentFilterType}:${controlId}`;
    this.controlValues.set(key, value);

    // Notify callbacks
    this.changeCallbacks.forEach(callback => {
      callback(this.currentFilterType, controlId, value);
    });
  }

  /**
   * Get control configuration by ID
   * @param {string} controlId - The control ID
   * @returns {Object|null} Control configuration
   */
  getControlConfig(controlId) {
    if (!this.currentFilterType) return null;
    
    const filterConfig = FILTER_CONTROLS[this.currentFilterType];
    if (!filterConfig) return null;

    return filterConfig.controls.find(c => c.id === controlId);
  }

  /**
   * Restore previously set control values
   * @param {string} filterType - The filter type
   */
  restoreControlValues(filterType) {
    const filterConfig = FILTER_CONTROLS[filterType];
    if (!filterConfig) return;

    filterConfig.controls.forEach(control => {
      const key = `${filterType}:${control.id}`;
      const storedValue = this.controlValues.get(key);
      
      if (storedValue !== undefined) {
        const element = document.getElementById(control.id);
        if (element) {
          if (element.type === 'checkbox') {
            element.checked = storedValue;
          } else {
            element.value = storedValue;
          }

          // Update display for sliders
          if (element.type === 'range') {
            const displayEl = document.getElementById(`${control.id}-value`);
            if (displayEl) {
              const unit = control.unit || '';
              displayEl.textContent = storedValue + unit;
            }
          }
        }
      }
    });
  }

  /**
   * Get current values for a filter type
   * @param {string} filterType - The filter type
   * @returns {Object} Object with control values
   */
  getFilterValues(filterType) {
    const filterConfig = FILTER_CONTROLS[filterType];
    if (!filterConfig) return {};

    const values = {};
    filterConfig.controls.forEach(control => {
      const key = `${filterType}:${control.id}`;
      const value = this.controlValues.get(key);
      values[control.id] = value !== undefined ? value : control.default;
    });

    return values;
  }

  /**
   * Reset controls to default values
   * @param {string} filterType - The filter type
   */
  resetToDefaults(filterType) {
    const filterConfig = FILTER_CONTROLS[filterType];
    if (!filterConfig) return;

    filterConfig.controls.forEach(control => {
      const element = document.getElementById(control.id);
      if (element) {
        if (element.type === 'checkbox') {
          element.checked = control.default;
        } else {
          element.value = control.default;
        }

        // Update display for sliders
        if (element.type === 'range') {
          const displayEl = document.getElementById(`${control.id}-value`);
          if (displayEl) {
            const unit = control.unit || '';
            displayEl.textContent = control.default + unit;
          }
        }

        // Store the default value
        const key = `${filterType}:${control.id}`;
        this.controlValues.set(key, control.default);
      }
    });

    // Notify callbacks
    this.changeCallbacks.forEach(callback => {
      callback(filterType, 'reset', null);
    });
  }

  /**
   * Helper to convert hex color to RGB array
   * @param {string} hex - Hex color string
   * @returns {number[]} RGB array [r, g, b]
   */
  static hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : [0, 0, 0];
  }

  /**
   * Show or hide specific control containers based on filter type
   * @param {string} filterType - The filter type
   */
  static updateControlVisibility(filterType) {
    // Hide all filter control containers
    const controlContainers = [
      'emboss-controls',
      'edge-detect-controls', 
      'vignette-controls',
      'cyberpunk-controls',
      'atmospheric-controls',
      'experimental-controls'
    ];

    controlContainers.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // Show the appropriate container
    if (filterType === 'emboss') {
      const el = document.getElementById('emboss-controls');
      if (el) el.style.display = 'block';
    } else if (filterType === 'edgeDetect') {
      const el = document.getElementById('edge-detect-controls');
      if (el) el.style.display = 'block';
    } else if (filterType === 'vignette') {
      const el = document.getElementById('vignette-controls');
      if (el) el.style.display = 'block';
    } else if (filterType.startsWith('cyberpunk-')) {
      const el = document.getElementById('cyberpunk-controls');
      if (el) el.style.display = 'block';
    } else if (filterType.startsWith('atmospheric-')) {
      const el = document.getElementById('atmospheric-controls');
      if (el) el.style.display = 'block';
    } else if (filterType.startsWith('experimental-')) {
      const el = document.getElementById('experimental-controls');
      if (el) el.style.display = 'block';
    }
  }
}

// Export a singleton instance
export const filterControlsUI = new FilterControlsUI();
