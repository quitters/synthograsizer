import { store } from '../modules/store';
import { variableManager, VariableType, VariableConstraints } from '../modules/variableManager';

export class VariablePanel {
    constructor(container) {
        this.container = container;
        this.variables = new Map();
        this.selectedGroup = null;
        
        this.initializeUI();
        this.setupEventListeners();
        this.loadVariables();
    }

    initializeUI() {
        this.container.innerHTML = `
            <div class="variable-panel">
                <div class="panel-header">
                    <h3>Variables</h3>
                    <div class="header-actions">
                        <select class="group-selector">
                            <option value="">All Variables</option>
                        </select>
                        <button class="add-variable-btn" title="Add Variable">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </div>
                
                <div class="panel-content">
                    <div class="variable-list"></div>
                    
                    <div class="variable-details hidden">
                        <div class="details-header">
                            <h4>Variable Details</h4>
                            <button class="close-details-btn">×</button>
                        </div>
                        
                        <div class="details-content">
                            <div class="form-group">
                                <label for="var-name">Name:</label>
                                <input type="text" id="var-name" class="var-name" pattern="[a-zA-Z_][a-zA-Z0-9_]*">
                            </div>
                            
                            <div class="form-group">
                                <label for="var-type">Type:</label>
                                <select id="var-type" class="var-type">
                                    <option value="number">Number</option>
                                    <option value="string">String</option>
                                    <option value="boolean">Boolean</option>
                                    <option value="enum">Enum</option>
                                    <option value="color">Color</option>
                                    <option value="vector">Vector</option>
                                </select>
                            </div>
                            
                            <div class="form-group type-specific number-controls">
                                <label>Range:</label>
                                <div class="range-controls">
                                    <input type="number" class="var-min" placeholder="Min">
                                    <input type="number" class="var-max" placeholder="Max">
                                    <input type="number" class="var-step" placeholder="Step" min="0">
                                </div>
                            </div>
                            
                            <div class="form-group type-specific enum-controls hidden">
                                <label>Values:</label>
                                <div class="enum-values">
                                    <div class="enum-list"></div>
                                    <button class="add-enum-btn">Add Value</button>
                                </div>
                            </div>
                            
                            <div class="form-group type-specific vector-controls hidden">
                                <label>Dimensions:</label>
                                <input type="number" class="vector-dimensions" min="2" max="4" value="2">
                            </div>
                            
                            <div class="form-group">
                                <label for="var-description">Description:</label>
                                <textarea id="var-description" class="var-description"></textarea>
                            </div>
                            
                            <div class="form-group">
                                <label>Tags:</label>
                                <div class="tags-input">
                                    <div class="tags-list"></div>
                                    <input type="text" class="tag-input" placeholder="Add tag">
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label>MIDI Control:</label>
                                <div class="midi-control">
                                    <span class="midi-status">Not mapped</span>
                                    <button class="midi-learn-btn">Learn</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.variableList = this.container.querySelector('.variable-list');
        this.detailsPanel = this.container.querySelector('.variable-details');
        this.groupSelector = this.container.querySelector('.group-selector');
    }

    setupEventListeners() {
        // Add variable button
        this.container.querySelector('.add-variable-btn').addEventListener('click', () => {
            this.showCreateVariableDialog();
        });

        // Group selector
        this.groupSelector.addEventListener('change', (e) => {
            this.selectedGroup = e.target.value;
            this.loadVariables();
        });

        // Close details button
        this.container.querySelector('.close-details-btn').addEventListener('click', () => {
            this.hideDetails();
        });

        // Variable type change
        this.container.querySelector('#var-type').addEventListener('change', (e) => {
            this.updateTypeSpecificControls(e.target.value);
        });

        // Add enum value
        this.container.querySelector('.add-enum-btn').addEventListener('click', () => {
            this.addEnumValue();
        });

        // Tag input
        const tagInput = this.container.querySelector('.tag-input');
        tagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.value.trim()) {
                this.addTag(e.target.value.trim());
                e.target.value = '';
            }
        });

        // MIDI learn button
        this.container.querySelector('.midi-learn-btn').addEventListener('click', (e) => {
            const varName = this.detailsPanel.dataset.activeName;
            if (!varName) return;

            const btn = e.target;
            const isLearning = btn.classList.toggle('active');
            
            store.dispatch('setMidiLearnMode', {
                active: isLearning,
                targetVariable: varName
            });
            
            btn.textContent = isLearning ? 'Cancel' : 'Learn';
        });

        // Variable Manager Events
        variableManager.on('variableCreated', (variable) => {
            this.addVariableElement(variable);
        });

        variableManager.on('variableDeleted', (variable) => {
            const el = this.variableList.querySelector(`[data-name="${variable.name}"]`);
            if (el) el.remove();
        });

        variableManager.on('groupCreated', ({ name }) => {
            this.addGroupOption(name);
        });

        variableManager.on('groupDeleted', (name) => {
            const option = this.groupSelector.querySelector(`option[value="${name}"]`);
            if (option) option.remove();
        });

        // Store events
        store.subscribe('midiMappingUpdate', (event) => {
            this.updateMIDIStatus(event.variable, event.mapping);
        });
    }

    loadVariables() {
        this.variableList.innerHTML = '';
        
        const variables = this.selectedGroup ? 
            variableManager.getGroup(this.selectedGroup) :
            Array.from(variableManager.variables.values());
            
        variables.forEach(variable => {
            this.addVariableElement(variable);
        });
    }

    addVariableElement(variable) {
        const el = document.createElement('div');
        el.className = 'variable-item';
        el.dataset.name = variable.name;

        el.innerHTML = `
            <div class="variable-header">
                <span class="variable-name">${variable.name}</span>
                <div class="variable-controls">
                    <button class="edit-btn" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-btn" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            ${this.renderVariableControl(variable)}
        `;

        // Add event listeners
        el.querySelector('.edit-btn').addEventListener('click', () => {
            this.showDetails(variable);
        });

        el.querySelector('.delete-btn').addEventListener('click', () => {
            if (confirm('Delete this variable?')) {
                variableManager.deleteVariable(variable.name);
            }
        });

        this.setupVariableControl(el, variable);
        this.variableList.appendChild(el);
    }

    renderVariableControl(variable) {
        switch (variable.type) {
            case VariableType.NUMBER:
                return `
                    <div class="variable-value">
                        <input type="range" 
                            min="${variable.constraints.min ?? 0}" 
                            max="${variable.constraints.max ?? 1}" 
                            step="${variable.constraints.step ?? 0.01}"
                            value="${variable.value}">
                        <span class="value-display">${variable.value}</span>
                    </div>
                `;

            case VariableType.BOOLEAN:
                return `
                    <div class="variable-value">
                        <label class="switch">
                            <input type="checkbox" ${variable.value ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                `;

            case VariableType.ENUM:
                return `
                    <div class="variable-value">
                        <select>
                            ${variable.constraints.enum.map(value => 
                                `<option value="${value}" ${value === variable.value ? 'selected' : ''}>${value}</option>`
                            ).join('')}
                        </select>
                    </div>
                `;

            case VariableType.COLOR:
                return `
                    <div class="variable-value">
                        <input type="color" value="${variable.value}">
                    </div>
                `;

            case VariableType.VECTOR:
                return `
                    <div class="variable-value vector-control">
                        ${Array(variable.constraints.dimensions).fill(0).map((_, i) => `
                            <input type="number" 
                                value="${variable.value[i]}"
                                min="${variable.constraints.min ?? ''}"
                                max="${variable.constraints.max ?? ''}"
                                step="0.1">
                        `).join('')}
                    </div>
                `;

            default:
                return `
                    <div class="variable-value">
                        <input type="text" value="${variable.value}">
                    </div>
                `;
        }
    }

    setupVariableControl(el, variable) {
        const control = el.querySelector('.variable-value');
        
        switch (variable.type) {
            case VariableType.NUMBER:
                const range = control.querySelector('input[type="range"]');
                const display = control.querySelector('.value-display');
                
                range.addEventListener('input', (e) => {
                    const value = parseFloat(e.target.value);
                    display.textContent = value;
                    variable.setValue(value);
                });
                break;

            case VariableType.BOOLEAN:
                control.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
                    variable.setValue(e.target.checked);
                });
                break;

            case VariableType.ENUM:
                control.querySelector('select').addEventListener('change', (e) => {
                    variable.setValue(e.target.value);
                });
                break;

            case VariableType.COLOR:
                control.querySelector('input[type="color"]').addEventListener('input', (e) => {
                    variable.setValue(e.target.value);
                });
                break;

            case VariableType.VECTOR:
                const inputs = control.querySelectorAll('input[type="number"]');
                inputs.forEach((input, i) => {
                    input.addEventListener('input', (e) => {
                        const newValue = [...variable.value];
                        newValue[i] = parseFloat(e.target.value);
                        variable.setValue(newValue);
                    });
                });
                break;

            default:
                control.querySelector('input[type="text"]').addEventListener('input', (e) => {
                    variable.setValue(e.target.value);
                });
                break;
        }
    }

    showCreateVariableDialog() {
        const name = prompt('Enter variable name:');
        if (!name) return;

        try {
            const variable = variableManager.createVariable(name, VariableType.NUMBER, 0);
            this.showDetails(variable);
        } catch (error) {
            alert(error.message);
        }
    }

    showDetails(variable) {
        this.detailsPanel.dataset.activeName = variable.name;
        this.detailsPanel.classList.remove('hidden');

        // Fill in basic details
        this.container.querySelector('#var-name').value = variable.name;
        this.container.querySelector('#var-type').value = variable.type;
        this.container.querySelector('#var-description').value = variable.description;

        // Update type-specific controls
        this.updateTypeSpecificControls(variable.type, variable);

        // Update tags
        this.container.querySelector('.tags-list').innerHTML = variable.tags.map(tag => `
            <span class="tag">
                ${tag}
                <button class="remove-tag">×</button>
            </span>
        `).join('');

        // Update MIDI status
        this.updateMIDIStatus(variable.name, variable.midiMapping);
    }

    hideDetails() {
        this.detailsPanel.classList.add('hidden');
        this.detailsPanel.dataset.activeName = '';
    }

    updateTypeSpecificControls(type, variable = null) {
        const numberControls = this.container.querySelector('.number-controls');
        const enumControls = this.container.querySelector('.enum-controls');
        const vectorControls = this.container.querySelector('.vector-controls');

        numberControls.classList.add('hidden');
        enumControls.classList.add('hidden');
        vectorControls.classList.add('hidden');

        switch (type) {
            case VariableType.NUMBER:
                numberControls.classList.remove('hidden');
                if (variable) {
                    numberControls.querySelector('.var-min').value = variable.constraints.min ?? '';
                    numberControls.querySelector('.var-max').value = variable.constraints.max ?? '';
                    numberControls.querySelector('.var-step').value = variable.constraints.step ?? '';
                }
                break;

            case VariableType.ENUM:
                enumControls.classList.remove('hidden');
                if (variable) {
                    enumControls.querySelector('.enum-list').innerHTML = variable.constraints.enum.map(value => `
                        <div class="enum-value">
                            <input type="text" value="${value}">
                            <button class="remove-enum">×</button>
                        </div>
                    `).join('');
                }
                break;

            case VariableType.VECTOR:
                vectorControls.classList.remove('hidden');
                if (variable) {
                    vectorControls.querySelector('.vector-dimensions').value = variable.constraints.dimensions;
                }
                break;
        }
    }

    addEnumValue() {
        const enumList = this.container.querySelector('.enum-list');
        const div = document.createElement('div');
        div.className = 'enum-value';
        div.innerHTML = `
            <input type="text" value="New Value">
            <button class="remove-enum">×</button>
        `;
        enumList.appendChild(div);
    }

    addTag(tag) {
        const tagsList = this.container.querySelector('.tags-list');
        const span = document.createElement('span');
        span.className = 'tag';
        span.innerHTML = `
            ${tag}
            <button class="remove-tag">×</button>
        `;
        tagsList.appendChild(span);

        const varName = this.detailsPanel.dataset.activeName;
        const variable = variableManager.getVariable(varName);
        if (variable) {
            variable.tags = [...variable.tags, tag];
        }
    }

    updateMIDIStatus(varName, mapping) {
        if (this.detailsPanel.dataset.activeName !== varName) return;

        const status = this.container.querySelector('.midi-status');
        if (mapping) {
            status.textContent = `CC ${mapping.control} (Ch ${mapping.channel})`;
        } else {
            status.textContent = 'Not mapped';
        }
    }

    addGroupOption(name) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        this.groupSelector.appendChild(option);
    }
}
