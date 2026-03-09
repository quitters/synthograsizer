/**
 * Properties Panel UI Component
 * Displays and allows editing of selected effect parameters
 * Supports both destructive and non-destructive modes
 */

export class PropertiesPanel {
    constructor(container) {
        this.container = container;
        this.currentEffect = null;
        this.onParameterChange = null;
        this.onModeChange = null;
        
        this.parameterRenderers = {
            'range': this.renderRangeParameter.bind(this),
            'select': this.renderSelectParameter.bind(this),
            'checkbox': this.renderCheckboxParameter.bind(this),
            'boolean': this.renderCheckboxParameter.bind(this), // Fallback for boolean type
            'color': this.renderColorParameter.bind(this),
            'number': this.renderNumberParameter.bind(this)
        };
        
        this.initialize();
    }

    initialize() {
        this.render();
    }

    render() {
        if (!this.currentEffect) {
            this.renderEmptyState();
            return;
        }
        
        this.container.innerHTML = `
            <div class="properties-panel">
                <div class="properties-header">
                    <h3>${this.currentEffect.name}</h3>
                    <div class="effect-id">${this.currentEffect.id}</div>
                </div>
                
                <div class="mode-indicator">
                    <div class="mode-status ${this.currentEffect.mode}">
                        <div class="mode-icon">
                            ${this.currentEffect.mode === 'destructive' ? '🔥' : '🛡️'}
                        </div>
                        <div class="mode-details">
                            <div class="mode-name">${this.currentEffect.mode === 'destructive' ? 'Destructive' : 'Non-Destructive'}</div>
                            <div class="mode-description">
                                ${this.currentEffect.mode === 'destructive' 
                                    ? 'Permanently modifies pixels • No undo • Better performance' 
                                    : 'Preserves original data • Editable layers • More memory'}
                            </div>
                        </div>
                        <div class="mode-change-hint">
                            <span class="hint-text">💡 Use the "${this.currentEffect.mode === 'destructive' ? 'D' : 'ND'}" toggle in the effects chain to change mode</span>
                        </div>
                    </div>
                </div>
                
                <div class="properties-content">
                    ${this.renderParameters()}
                </div>
                
                <div class="properties-footer">
                    <button class="reset-params-btn" data-tooltip="Reset all parameters to default values" data-tooltip-shortcut="Ctrl+Shift+R">
                        Reset Parameters
                    </button>
                    <button class="randomize-params-btn" data-tooltip="Generate random parameter values" data-tooltip-shortcut="Ctrl+Shift+D">
                        🎲 Randomize
                    </button>
                </div>
            </div>
        `;
        
        this.attachEventListeners();
    }

    renderEmptyState() {
        this.container.innerHTML = `
            <div class="properties-panel empty">
                <div class="empty-state">
                    <div class="empty-icon">⚙️</div>
                    <div class="empty-text">No Effect Selected</div>
                    <div class="empty-hint">Select an effect from the chain to edit its properties</div>
                </div>
            </div>
        `;
    }

    renderParameters() {
        if (!this.currentEffect) {
            return '<div class="no-parameters">No effect selected</div>';
        }
        
        // If no parameter config exists, show basic parameter list
        if (!this.currentEffect.parameterConfig) {
            return this.renderBasicParameterList();
        }
        
        let html = '';
        const config = this.currentEffect.parameterConfig;
        const params = this.currentEffect.parameters || {};
        
        // Group parameters by category if specified
        const groups = this.groupParameters(config);
        
        groups.forEach((groupParams, groupName) => {
            if (groupName !== 'default') {
                html += `<div class="parameter-group">
                    <h4 class="group-header">${groupName}</h4>`;
            }
            
            groupParams.forEach(paramConfig => {
                // Skip non-destructive only params in destructive mode
                if (paramConfig.nonDestructiveOnly && this.currentEffect.mode === 'destructive') {
                    return;
                }
                
                // Get parameter value, with fallback
                const paramValue = params[paramConfig.name] !== undefined 
                    ? params[paramConfig.name] 
                    : paramConfig.default;
                
                try {
                    html += this.renderParameter(paramConfig, paramValue);
                } catch (e) {
                    console.warn(`Error rendering parameter ${paramConfig.name}:`, e);
                    html += this.renderErrorParameter(paramConfig.name, paramValue);
                }
            });
            
            if (groupName !== 'default') {
                html += '</div>';
            }
        });
        
        // Add non-destructive specific parameters
        if (this.currentEffect.mode === 'non-destructive') {
            html += this.renderNonDestructiveParams();
        }
        
        return html || '<div class="no-parameters">No parameters available</div>';
    }

    groupParameters(config) {
        const groups = new Map();
        
        Object.entries(config).forEach(([paramName, paramConfig]) => {
            const group = paramConfig.group || 'default';
            if (!groups.has(group)) {
                groups.set(group, []);
            }
            groups.get(group).push({ name: paramName, ...paramConfig });
        });
        
        return groups;
    }

    renderParameter(config, value) {
        const renderer = this.parameterRenderers[config.type] || this.renderGenericParameter.bind(this);
        return renderer(config, value);
    }

    renderRangeParameter(config, value) {
        const percentage = ((value - config.min) / (config.max - config.min)) * 100;
        
        return `
            <div class="parameter-control" data-param="${config.name}">
                <div class="parameter-header">
                    <label for="param-${config.name}">${config.label || config.name}</label>
                    <span class="parameter-value">${this.formatValue(value, config)}</span>
                </div>
                ${config.description ? `<div class="parameter-description">${config.description}</div>` : ''}
                <div class="range-container">
                    <input type="range" 
                           id="param-${config.name}"
                           name="${config.name}"
                           min="${config.min}" 
                           max="${config.max}" 
                           step="${config.step || 1}"
                           value="${value}"
                           class="parameter-range">
                    <div class="range-fill" style="width: ${percentage}%"></div>
                </div>
                <div class="range-labels">
                    <span class="range-min">${config.min}</span>
                    <span class="range-max">${config.max}</span>
                </div>
            </div>
        `;
    }

    renderSelectParameter(config, value) {
        return `
            <div class="parameter-control" data-param="${config.name}">
                <label for="param-${config.name}">${config.label || config.name}</label>
                ${config.description ? `<div class="parameter-description">${config.description}</div>` : ''}
                <select id="param-${config.name}" 
                        name="${config.name}" 
                        class="parameter-select">
                    ${config.options.map(option => {
                        const optionValue = typeof option === 'object' ? option.value : option;
                        const optionLabel = typeof option === 'object' ? option.label : option;
                        return `<option value="${optionValue}" ${value === optionValue ? 'selected' : ''}>
                            ${optionLabel}
                        </option>`;
                    }).join('')}
                </select>
            </div>
        `;
    }

    renderCheckboxParameter(config, value) {
        return `
            <div class="parameter-control checkbox" data-param="${config.name}">
                <label class="checkbox-label">
                    <input type="checkbox" 
                           id="param-${config.name}"
                           name="${config.name}" 
                           ${value ? 'checked' : ''}
                           class="parameter-checkbox">
                    <span class="checkbox-text">${config.label || config.name}</span>
                </label>
                ${config.description ? `<div class="parameter-description">${config.description}</div>` : ''}
            </div>
        `;
    }

    renderColorParameter(config, value) {
        return `
            <div class="parameter-control color" data-param="${config.name}">
                <label for="param-${config.name}">${config.label || config.name}</label>
                ${config.description ? `<div class="parameter-description">${config.description}</div>` : ''}
                <div class="color-input-container">
                    <input type="color" 
                           id="param-${config.name}"
                           name="${config.name}" 
                           value="${value}"
                           class="parameter-color">
                    <input type="text" 
                           value="${value}"
                           class="color-hex-input"
                           data-param="${config.name}">
                </div>
            </div>
        `;
    }

    renderNumberParameter(config, value) {
        return `
            <div class="parameter-control number" data-param="${config.name}">
                <label for="param-${config.name}">${config.label || config.name}</label>
                ${config.description ? `<div class="parameter-description">${config.description}</div>` : ''}
                <input type="number" 
                       id="param-${config.name}"
                       name="${config.name}" 
                       min="${config.min !== undefined ? config.min : ''}" 
                       max="${config.max !== undefined ? config.max : ''}" 
                       step="${config.step || 1}"
                       value="${value}"
                       class="parameter-number">
            </div>
        `;
    }

    renderGenericParameter(config, value) {
        return `
            <div class="parameter-control" data-param="${config.name}">
                <label>${config.label || config.name}</label>
                <div class="parameter-value">${value}</div>
            </div>
        `;
    }

    renderBasicParameterList() {
        if (!this.currentEffect.parameters) {
            return '<div class="no-parameters">No parameters available</div>';
        }
        
        let html = '<div class="parameter-group"><h4 class="group-header">Parameters</h4>';
        
        Object.entries(this.currentEffect.parameters).forEach(([key, value]) => {
            // Skip internal parameters
            if (key === 'opacity' || key === 'blendMode') return;
            
            html += `
                <div class="parameter-control basic" data-param="${key}">
                    <label>${key}</label>
                    <div class="parameter-value">${String(value)}</div>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }

    renderErrorParameter(paramName, value) {
        return `
            <div class="parameter-control error" data-param="${paramName}">
                <label>${paramName} (Error)</label>
                <div class="parameter-value error">${String(value || 'N/A')}</div>
                <div class="parameter-error">Unable to render parameter controls</div>
            </div>
        `;
    }

    renderNonDestructiveParams() {
        return `
            <div class="parameter-group non-destructive-params">
                <h4 class="group-header">Non-Destructive Settings</h4>
                
                <div class="parameter-control" data-param="opacity">
                    <div class="parameter-header">
                        <label for="param-opacity">Opacity</label>
                        <span class="parameter-value">${Math.round(this.currentEffect.parameters.opacity * 100)}%</span>
                    </div>
                    <div class="range-container">
                        <input type="range" 
                               id="param-opacity"
                               name="opacity"
                               min="0" 
                               max="100" 
                               value="${this.currentEffect.parameters.opacity * 100}"
                               class="parameter-range">
                        <div class="range-fill" style="width: ${this.currentEffect.parameters.opacity * 100}%"></div>
                    </div>
                </div>
                
                <div class="parameter-control" data-param="blendMode">
                    <label for="param-blendMode">Blend Mode</label>
                    <select id="param-blendMode" 
                            name="blendMode" 
                            class="parameter-select">
                        <option value="normal" ${this.currentEffect.parameters.blendMode === 'normal' ? 'selected' : ''}>Normal</option>
                        <option value="multiply" ${this.currentEffect.parameters.blendMode === 'multiply' ? 'selected' : ''}>Multiply</option>
                        <option value="screen" ${this.currentEffect.parameters.blendMode === 'screen' ? 'selected' : ''}>Screen</option>
                        <option value="overlay" ${this.currentEffect.parameters.blendMode === 'overlay' ? 'selected' : ''}>Overlay</option>
                        <option value="soft-light" ${this.currentEffect.parameters.blendMode === 'soft-light' ? 'selected' : ''}>Soft Light</option>
                        <option value="hard-light" ${this.currentEffect.parameters.blendMode === 'hard-light' ? 'selected' : ''}>Hard Light</option>
                        <option value="color-dodge" ${this.currentEffect.parameters.blendMode === 'color-dodge' ? 'selected' : ''}>Color Dodge</option>
                        <option value="color-burn" ${this.currentEffect.parameters.blendMode === 'color-burn' ? 'selected' : ''}>Color Burn</option>
                        <option value="darken" ${this.currentEffect.parameters.blendMode === 'darken' ? 'selected' : ''}>Darken</option>
                        <option value="lighten" ${this.currentEffect.parameters.blendMode === 'lighten' ? 'selected' : ''}>Lighten</option>
                        <option value="difference" ${this.currentEffect.parameters.blendMode === 'difference' ? 'selected' : ''}>Difference</option>
                        <option value="exclusion" ${this.currentEffect.parameters.blendMode === 'exclusion' ? 'selected' : ''}>Exclusion</option>
                    </select>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Remove mode change listener since mode is now controlled by the effect chain toggle
        
        // Parameter changes
        this.container.addEventListener('input', (e) => {
            const control = e.target.closest('.parameter-control');
            if (control) {
                const paramName = control.dataset.param;
                this.handleParameterChange(paramName, e.target);
            }
        });

        // Range slider visual feedback
        this.container.querySelectorAll('.parameter-range').forEach(range => {
            this.updateRangeFill(range);
            range.addEventListener('input', () => this.updateRangeFill(range));
        });

        // Color hex input sync
        this.container.addEventListener('input', (e) => {
            if (e.target.classList.contains('color-hex-input')) {
                const paramName = e.target.dataset.param;
                const colorInput = this.container.querySelector(`#param-${paramName}`);
                if (colorInput && /^#[0-9A-F]{6}$/i.test(e.target.value)) {
                    colorInput.value = e.target.value;
                    this.handleParameterChange(paramName, colorInput);
                }
            }
        });

        // Reset button
        const resetBtn = this.container.querySelector('.reset-params-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetParameters());
        }

        // Randomize button
        const randomizeBtn = this.container.querySelector('.randomize-params-btn');
        if (randomizeBtn) {
            randomizeBtn.addEventListener('click', () => this.randomizeParameters());
        }
    }

    updateRangeFill(range) {
        const fill = range.nextElementSibling;
        if (fill && fill.classList.contains('range-fill')) {
            const percentage = ((range.value - range.min) / (range.max - range.min)) * 100;
            fill.style.width = `${percentage}%`;
        }
        
        // Update value display
        const valueDisplay = range.closest('.parameter-control')?.querySelector('.parameter-value');
        if (valueDisplay && this.currentEffect) {
            const paramName = range.name;
            const config = this.currentEffect.parameterConfig?.[paramName];
            const value = range.value;
            
            try {
                valueDisplay.textContent = this.formatValue(value, config);
            } catch (e) {
                console.warn(`Error formatting value for parameter ${paramName}:`, e);
                valueDisplay.textContent = String(value);
            }
        }
    }

    handleModeChange(newMode) {
        if (this.onModeChange && this.currentEffect) {
            this.onModeChange(this.currentEffect, newMode);
            this.currentEffect.mode = newMode;
            this.render(); // Re-render to show/hide mode-specific params
        }
    }

    handleParameterChange(paramName, input) {
        if (!this.currentEffect || !this.onParameterChange) return;
        
        let value = input.value;
        
        // Convert value based on input type
        if (input.type === 'checkbox') {
            value = input.checked;
        } else if (input.type === 'number' || input.type === 'range') {
            value = parseFloat(value);
            // Special handling for opacity (convert from percentage)
            if (paramName === 'opacity') {
                value = value / 100;
            }
        }
        
        this.currentEffect.parameters[paramName] = value;
        this.onParameterChange(this.currentEffect, paramName, value);
    }

    resetParameters() {
        if (!this.currentEffect) return;
        
        // Reset to default values from config
        const config = this.currentEffect.parameterConfig;
        Object.entries(config).forEach(([paramName, paramConfig]) => {
            if (paramConfig.default !== undefined) {
                this.currentEffect.parameters[paramName] = paramConfig.default;
            }
        });
        
        // Trigger change callback
        if (this.onParameterChange) {
            this.onParameterChange(this.currentEffect, null, null);
        }
        
        this.render();
    }

    randomizeParameters() {
        if (!this.currentEffect) return;
        
        const config = this.currentEffect.parameterConfig;
        Object.entries(config).forEach(([paramName, paramConfig]) => {
            if (paramConfig.randomizable === false) return;
            
            let value;
            switch (paramConfig.type) {
                case 'range':
                case 'number':
                    value = Math.random() * (paramConfig.max - paramConfig.min) + paramConfig.min;
                    if (paramConfig.step) {
                        value = Math.round(value / paramConfig.step) * paramConfig.step;
                    }
                    break;
                case 'select':
                    const options = paramConfig.options;
                    const randomIndex = Math.floor(Math.random() * options.length);
                    value = typeof options[randomIndex] === 'object' 
                        ? options[randomIndex].value 
                        : options[randomIndex];
                    break;
                case 'checkbox':
                    value = Math.random() > 0.5;
                    break;
                case 'color':
                    value = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
                    break;
            }
            
            if (value !== undefined) {
                this.currentEffect.parameters[paramName] = value;
            }
        });
        
        // Trigger change callback
        if (this.onParameterChange) {
            this.onParameterChange(this.currentEffect, null, null);
        }
        
        this.render();
    }

    formatValue(value, config) {
        // Handle null/undefined values
        if (value === null || value === undefined) {
            return 'N/A';
        }
        
        // Use custom formatter if provided
        if (config && config.format) {
            try {
                return config.format(value);
            } catch (e) {
                console.warn('Custom formatter error:', e);
                return String(value);
            }
        }
        
        // Handle numeric types
        if (config && (config.type === 'range' || config.type === 'number')) {
            // Ensure value is actually a number
            const numValue = parseFloat(value);
            if (isNaN(numValue)) {
                return String(value);
            }
            
            if (config.unit) {
                return `${numValue}${config.unit}`;
            }
            if (Number.isInteger(numValue)) {
                return numValue.toString();
            }
            return numValue.toFixed(2);
        }
        
        // Default: convert to string
        return String(value);
    }

    // External mode change handler (called by effect chain)
    updateEffectMode(newMode) {
        if (this.currentEffect && this.currentEffect.mode !== newMode) {
            const oldMode = this.currentEffect.mode;
            this.currentEffect.mode = newMode;
            
            // Update the mode indicator specifically instead of full re-render
            this.updateModeIndicator(newMode);
            
            // Also update any mode-specific parameters that might be shown/hidden
            this.updateModeSpecificParameters(oldMode, newMode);
            
            console.log(`🔄 Properties panel mode updated: ${oldMode} → ${newMode}`);
        }
    }
    
    // Update just the mode indicator for better performance and visual feedback
    updateModeIndicator(newMode) {
        const modeStatus = this.container.querySelector('.mode-status');
        const modeIcon = this.container.querySelector('.mode-icon');
        const modeName = this.container.querySelector('.mode-name');
        const modeDescription = this.container.querySelector('.mode-description');
        const modeHint = this.container.querySelector('.hint-text');
        
        if (modeStatus && modeIcon && modeName && modeDescription && modeHint) {
            // Update CSS class
            modeStatus.className = `mode-status ${newMode}`;
            
            // Update icon
            modeIcon.textContent = newMode === 'destructive' ? '🔥' : '🛡️';
            
            // Update mode name
            modeName.textContent = newMode === 'destructive' ? 'Destructive' : 'Non-Destructive';
            
            // Update description
            modeDescription.textContent = newMode === 'destructive' 
                ? 'Permanently modifies pixels • No undo • Better performance'
                : 'Preserves original data • Editable layers • More memory';
            
            // Update hint text
            modeHint.textContent = `💡 Use the "${newMode === 'destructive' ? 'D' : 'ND'}" toggle in the effects chain to change mode`;
            
            // Add animation effect
            modeStatus.style.animation = 'modeChangeGlow 0.5s ease-out';
            setTimeout(() => {
                modeStatus.style.animation = '';
            }, 500);
            
            console.log(`✨ Mode indicator updated to: ${newMode}`);
        } else {
            console.warn('⚠️ Mode indicator elements not found, falling back to full re-render');
            this.render(); // Fallback to full re-render
        }
    }
    
    // Update mode-specific parameters (show/hide non-destructive params)
    updateModeSpecificParameters(oldMode, newMode) {
        const nonDestructiveParams = this.container.querySelector('.non-destructive-params');
        
        if (newMode === 'non-destructive' && oldMode === 'destructive') {
            // Switching from destructive to non-destructive - add ND params
            if (!nonDestructiveParams) {
                const propertiesContent = this.container.querySelector('.properties-content');
                if (propertiesContent) {
                    const ndParamsHtml = this.renderNonDestructiveParams();
                    propertiesContent.insertAdjacentHTML('beforeend', ndParamsHtml);
                    
                    // Re-attach event listeners for new elements
                    const newRanges = propertiesContent.querySelectorAll('.parameter-range');
                    newRanges.forEach(range => {
                        this.updateRangeFill(range);
                        range.addEventListener('input', () => this.updateRangeFill(range));
                    });
                    
                    console.log('✅ Added non-destructive parameters');
                }
            }
        } else if (newMode === 'destructive' && oldMode === 'non-destructive') {
            // Switching from non-destructive to destructive - remove ND params
            if (nonDestructiveParams) {
                nonDestructiveParams.remove();
                console.log('🗑️ Removed non-destructive parameters');
            }
        }
    }

    // Public methods
    showEffect(effect) {
        this.currentEffect = effect;
        this.render();
    }

    clearEffect() {
        this.currentEffect = null;
        this.render();
    }

    setCallbacks(onParameterChange, onModeChange) {
        this.onParameterChange = onParameterChange;
        this.onModeChange = onModeChange;
    }

    // Refresh/update the properties panel (alias for render)
    refresh() {
        this.render();
    }
}
