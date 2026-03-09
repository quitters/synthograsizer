/**
 * Code Overlay Manager Module
 * Manages the code overlay panel with template editor and JSON views
 */
import { getValueText, generateTagId } from './template-normalizer.js?v=2';

export class CodeOverlayManager {
  constructor(app) {
    this.app = app;
    this.isOpen = false;
    this.jsonEditMode = false;
    this.originalJsonValue = '';
    this.p5EditMode = false;
    this.originalP5Value = '';
    this.p5Instance = null;
    this.p5Running = false;
    this.init();
  }

  init() {
    // Get DOM elements
    this.elements = {
      codeButton: document.getElementById('code-button'),
      overlay: document.getElementById('code-overlay'),
      backdrop: document.getElementById('code-overlay-backdrop'),
      closeBtn: document.getElementById('close-code-overlay'),
      templateEditor: document.getElementById('template-editor'),
      applyTemplateBtn: document.getElementById('apply-template'),
      resetTemplateBtn: document.getElementById('reset-template'),
      createVariableFromSelectionBtn: document.getElementById('create-variable-from-selection'),
      variablesJson: document.getElementById('variables-json'),
      jsonStatus: document.getElementById('json-status'),
      copyJsonBtn: document.getElementById('copy-json'),
      editJsonBtn: document.getElementById('edit-json'),
      saveJsonBtn: document.getElementById('save-json'),
      cancelJsonBtn: document.getElementById('cancel-json'),
      jsonViewControls: document.querySelector('.json-view-controls'),
      jsonEditControls: document.querySelector('.json-edit-controls'),
      p5SectionHeader: document.getElementById('p5-section-header'),
      p5CollapseToggle: document.getElementById('p5-collapse-toggle'),
      p5SectionContent: document.getElementById('p5-section-content'),
      p5CodeEditor: document.getElementById('p5-code-editor'),
      copyP5Btn: document.getElementById('copy-p5'),
      editP5Btn: document.getElementById('edit-p5'),
      runP5Btn: document.getElementById('run-p5'),
      saveP5Btn: document.getElementById('save-p5'),
      cancelP5Btn: document.getElementById('cancel-p5'),
      p5ViewControls: document.querySelector('.p5-view-controls'),
      p5EditControls: document.querySelector('.p5-edit-controls'),
      p5CanvasContainer: document.getElementById('p5-canvas-container'),
      p5SketchMount: document.getElementById('p5-sketch-mount'),
      stateDisplay: document.getElementById('current-state-display'),
      addVariableBtn: document.getElementById('add-variable-btn'),
      variableListEditor: document.getElementById('variable-list-editor'),
      variablePickerOverlay: document.getElementById('variable-picker-overlay'),
      variablePickerClose: document.getElementById('variable-picker-close'),
      variableTemplateCards: document.querySelectorAll('.variable-template-card'),
      importVariableCard: document.getElementById('import-variable-card'),
      variableImportInput: document.getElementById('variable-import-input'),
      codeImportButton: document.getElementById('code-import-button'),
      codeExportButton: document.getElementById('code-export-button'),
      templateImportOption: document.getElementById('template-import-option'),
      // Tags & Provenance
      tagsSectionHeader: document.getElementById('tags-section-header'),
      tagsCollapseToggle: document.getElementById('tags-collapse-toggle'),
      tagsSectionContent: document.getElementById('tags-section-content'),
      tagsListContainer: document.getElementById('tags-list-container'),
      addTagBtn: document.getElementById('add-tag-btn'),
      tagAddForm: document.getElementById('tag-add-form'),
      tagTypeSelect: document.getElementById('tag-type-select'),
      tagLabelInput: document.getElementById('tag-label-input'),
      tagUrlInput: document.getElementById('tag-url-input'),
      tagDescriptionInput: document.getElementById('tag-description-input'),
      tagChainRow: document.getElementById('tag-chain-row'),
      tagChainSelect: document.getElementById('tag-chain-select'),
      tagDateInput: document.getElementById('tag-date-input'),
      tagSaveBtn: document.getElementById('tag-save-btn'),
      tagCancelBtn: document.getElementById('tag-cancel-btn')
    };

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Open button
    this.elements.codeButton?.addEventListener('click', () => this.open());

    // Close button
    this.elements.closeBtn?.addEventListener('click', () => this.close());

    // Backdrop click
    this.elements.backdrop?.addEventListener('click', () => this.close());

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // Apply template button
    this.elements.applyTemplateBtn?.addEventListener('click', () => this.applyTemplate());

    // Reset template button
    this.elements.resetTemplateBtn?.addEventListener('click', () => this.resetTemplate());

    // Create variable from current template selection
    this.elements.createVariableFromSelectionBtn?.addEventListener('click', () => this.createVariableFromSelection());

    // Copy JSON button
    this.elements.copyJsonBtn?.addEventListener('click', () => this.copyJson());

    // Edit JSON button
    this.elements.editJsonBtn?.addEventListener('click', () => this.enterJsonEditMode());

    // Save JSON button
    this.elements.saveJsonBtn?.addEventListener('click', () => this.saveJson());

    // Cancel JSON button
    this.elements.cancelJsonBtn?.addEventListener('click', () => this.cancelJsonEdit());

    // P5.js collapse toggle
    this.elements.p5SectionHeader?.addEventListener('click', () => this.toggleP5Section());

    // Copy P5 button
    this.elements.copyP5Btn?.addEventListener('click', () => this.copyP5Code());

    // Edit P5 button
    this.elements.editP5Btn?.addEventListener('click', () => this.enterP5EditMode());

    // Save P5 button
    this.elements.saveP5Btn?.addEventListener('click', () => this.saveP5Code());

    // Cancel P5 button
    this.elements.cancelP5Btn?.addEventListener('click', () => this.cancelP5Edit());

    // Run P5 button
    this.elements.runP5Btn?.addEventListener('click', () => this.toggleP5Sketch());

    // Add Variable button
    this.elements.addVariableBtn?.addEventListener('click', () => this.openVariablePicker());

    // Variable picker close button
    this.elements.variablePickerClose?.addEventListener('click', () => this.closeVariablePicker());

    // Close picker when clicking outside
    this.elements.variablePickerOverlay?.addEventListener('click', (e) => {
      if (e.target === this.elements.variablePickerOverlay) {
        this.closeVariablePicker();
      }
    });

    // Variable template card clicks
    this.elements.variableTemplateCards.forEach(card => {
      card.addEventListener('click', () => {
        const templateType = card.dataset.template;
        if (templateType) {
          this.addVariableFromTemplate(templateType);
        }
      });
    });

    // Import variable card click
    this.elements.importVariableCard?.addEventListener('click', () => {
      this.elements.variableImportInput?.click();
    });

    // File input change
    this.elements.variableImportInput?.addEventListener('change', (e) => {
      this.handleVariableImport(e);
    });

    // Code Import button
    this.elements.codeImportButton?.addEventListener('click', () => {
      this.app.elements.importFileInput?.click();
    });

    // Code Export button
    this.elements.codeExportButton?.addEventListener('click', () => {
      this.app.exportTemplate();
    });

    // Template Import Option in dropdown
    this.elements.templateImportOption?.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent dropdown from closing
      this.app.elements.importFileInput?.click();
    });

    // ── Tags & Provenance listeners ──

    // Tags section collapse toggle
    this.elements.tagsSectionHeader?.addEventListener('click', () => this.toggleTagsSection());

    // Add Tag button — shows the inline form
    this.elements.addTagBtn?.addEventListener('click', () => this.showAddTagForm());

    // Tag type selector — show/hide chain field for collection type
    this.elements.tagTypeSelect?.addEventListener('change', () => this.onTagTypeChange());

    // Save Tag button
    this.elements.tagSaveBtn?.addEventListener('click', () => this.saveNewTag());

    // Cancel Tag button
    this.elements.tagCancelBtn?.addEventListener('click', () => this.hideAddTagForm());
  }

  /**
   * Open the overlay panel
   */
  open() {
    if (this.elements.overlay) {
      this.elements.overlay.classList.add('open');
    }
    if (this.elements.backdrop) {
      this.elements.backdrop.classList.add('show');
    }
    this.isOpen = true;
    this.updateContent();
  }

  /**
   * Close the overlay panel
   */
  close() {
    if (this.elements.overlay) {
      this.elements.overlay.classList.remove('open');
    }
    if (this.elements.backdrop) {
      this.elements.backdrop.classList.remove('show');
    }
    this.isOpen = false;
  }

  /**
   * Toggle overlay open/closed
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Update all content in the overlay
   */
  updateContent() {
    this.updateTemplateEditor();
    this.updateVariablesJson();
    this.updateP5CodeEditor();
    this.updateStateDisplay();
    this.updateVariableListEditor();
    this.renderTags();
  }

  /**
   * Update the template editor with current template
   */
  updateTemplateEditor() {
    if (this.elements.templateEditor && this.app.currentTemplate) {
      this.elements.templateEditor.value = this.app.currentTemplate.promptTemplate || '';
    }
  }

  /**
   * Update the variables JSON view
   */
  updateVariablesJson() {
    if (this.elements.variablesJson && this.app.currentTemplate) {
      const jsonData = {
        promptTemplate: this.app.currentTemplate.promptTemplate,
        variables: this.app.variables
      };
      // Include tags in JSON view if any exist
      const tags = this.app.currentTemplate.tags;
      if (Array.isArray(tags) && tags.length > 0) {
        jsonData.tags = tags;
      }
      this.elements.variablesJson.value = JSON.stringify(jsonData, null, 2);
    }
  }

  /**
   * Update the current state display
   */
  updateStateDisplay() {
    if (!this.elements.stateDisplay) return;

    const html = `
      <div class="state-item">
        <span class="state-label">Variables Count:</span>
        <span class="state-value">${this.app.variables.length}</span>
      </div>
      <div class="state-item">
        <span class="state-label">Current Variable:</span>
        <span class="state-value">${this.getCurrentVariableName()}</span>
      </div>
      <div class="state-item">
        <span class="state-label">Current Value:</span>
        <span class="state-value">${this.getCurrentValue()}</span>
      </div>
      <div class="state-item">
        <span class="state-label">Total Combinations:</span>
        <span class="state-value">${this.getTotalCombinations()}</span>
      </div>
      ${this.getVariableStateItems()}
    `;

    this.elements.stateDisplay.innerHTML = html;
  }

  /**
   * Get current variable name
   */
  getCurrentVariableName() {
    if (this.app.variables.length === 0) return 'None';
    const variable = this.app.variables[this.app.currentVariableIndex];
    return variable ? variable.name.toUpperCase() : 'None';
  }

  /**
   * Get current value
   */
  getCurrentValue() {
    if (this.app.variables.length === 0) return 'None';
    const variable = this.app.variables[this.app.currentVariableIndex];
    if (!variable) return 'None';
    const valueIndex = this.app.currentValues[variable.name] || 0;
    return getValueText(variable.values[valueIndex]) || 'None';
  }

  /**
   * Calculate total possible combinations
   */
  getTotalCombinations() {
    if (this.app.variables.length === 0) return 0;
    return this.app.variables.reduce((total, variable) => {
      return total * (variable.values.length || 1);
    }, 1).toLocaleString();
  }

  /**
   * Get HTML for all variable states
   */
  getVariableStateItems() {
    if (this.app.variables.length === 0) return '';

    return this.app.variables.map((variable, index) => {
      const valueIndex = this.app.currentValues[variable.name] || 0;
      const currentValue = getValueText(variable.values[valueIndex]);
      const color = this.app.config.colorPalette[index % this.app.config.colorPalette.length];

      return `
        <div class="state-item">
          <span class="state-label">${variable.name}:</span>
          <span class="state-value var-name" style="background: ${color};">${currentValue}</span>
        </div>
      `;
    }).join('');
  }

  /**
   * Render the variable list editor UI
   */
  updateVariableListEditor() {
    const container = this.elements.variableListEditor;
    if (!container) return;

    // Empty state
    if (!this.app.variables || this.app.variables.length === 0) {
      container.innerHTML = `
        <div class="variable-editor-empty">
          No variables defined yet.
          <br>
          Use "Make Variable from Selection" or "Add Variable from Template" to get started.
        </div>
      `;
      return;
    }

    const rowsHtml = this.app.variables.map((variable, index) => {
      const tokenId = variable.name || variable.feature_name || '';
      const displayLabel = variable.feature_name || variable.name || '';
      const values = Array.isArray(variable.values) ? variable.values : [];

      const valuesHtml = values.map((value, valueIndex) => {
        const valueText = getValueText(value);
        return `
          <div class="variable-value-row" data-index="${index}" data-value-index="${valueIndex}">
            <input
              type="text"
              class="var-value-input"
              data-index="${index}"
              data-value-index="${valueIndex}"
              value="${this.escapeHtml(valueText)}"
            />
            <button
              type="button"
              class="var-value-delete-btn"
              data-index="${index}"
              data-value-index="${valueIndex}"
              title="Delete this value"
            >✕</button>
          </div>
        `;
      }).join('');

      return `
        <div class="variable-editor-row" data-index="${index}">
          <div class="variable-editor-info">
            <label class="variable-editor-label">Token ID (used in {{...}})</label>
            <input
              type="text"
              class="var-feature-input"
              data-index="${index}"
              value="${this.escapeHtml(tokenId)}"
            />
            <label class="variable-editor-label">Display Label</label>
            <input
              type="text"
              class="var-name-input"
              data-index="${index}"
              value="${this.escapeHtml(displayLabel)}"
            />
          </div>
          <div class="variable-editor-values">
            <div class="variable-values-list">
              ${valuesHtml}
            </div>
            <input
              type="text"
              class="var-new-value-input"
              data-index="${index}"
              placeholder="Add value and press Enter"
            />
          </div>
          <div class="variable-editor-actions">
            <button
              type="button"
              class="var-delete-btn"
              data-index="${index}"
              title="Remove this variable from the template"
            >
              ✕ Remove
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = rowsHtml;

    // Wire up events after rendering
    this.attachVariableListEvents();
  }

  /**
   * Attach event listeners for the variable list editor
   */
  attachVariableListEvents() {
    const container = this.elements.variableListEditor;
    if (!container) return;

    // Token ID changes (variable.name)
    container.querySelectorAll('.var-feature-input').forEach((input) => {
      input.addEventListener('change', (e) => {
        const target = e.target;
        const index = parseInt(target.dataset.index, 10);
        const variable = this.app.variables[index];
        if (!variable) return;

        const oldTokenId = variable.name || variable.feature_name || '';
        let newTokenId = (target.value || '').trim();
        if (!newTokenId) {
          // Revert empty edits
          target.value = oldTokenId;
          return;
        }

        // Token ID must be snake_case
        newTokenId = newTokenId.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        newTokenId = this.getUniqueFeatureName(newTokenId, index);
        target.value = newTokenId;

        if (newTokenId === oldTokenId) return;

        // Move currentValues entry to the new key
        const currentIndex = this.app.currentValues[oldTokenId];
        delete this.app.currentValues[oldTokenId];
        this.app.currentValues[newTokenId] = (typeof currentIndex === 'number') ? currentIndex : 0;

        variable.name = newTokenId;
        this.updatePromptVariableReferences(oldTokenId, newTokenId);

        this.app.createIndicatorDots();
        this.app.updateCenterControl();
        this.updateVariablesJson();
        this.updateStateDisplay();
        this.app.generateOutput();
      });
    });

    // Display Label changes (variable.feature_name)
    container.querySelectorAll('.var-name-input').forEach((input) => {
      input.addEventListener('change', (e) => {
        const target = e.target;
        const index = parseInt(target.dataset.index, 10);
        const variable = this.app.variables[index];
        if (!variable) return;

        const oldLabel = variable.feature_name || variable.name || '';
        const newLabel = (target.value || '').trim();

        if (!newLabel) {
          target.value = oldLabel;
          return;
        }

        if (newLabel === oldLabel) return;

        variable.feature_name = newLabel;

        this.app.updateCenterControl();
        this.app.generateOutput();
        this.updateVariablesJson();
        this.updateStateDisplay();
      });
    });

    // Existing value edits
    container.querySelectorAll('.var-value-input').forEach((input) => {
      input.addEventListener('change', (e) => {
        const target = e.target;
        const varIndex = parseInt(target.dataset.index, 10);
        const valueIndex = parseInt(target.dataset.valueIndex, 10);
        const variable = this.app.variables[varIndex];
        if (!variable || !Array.isArray(variable.values)) return;
        if (valueIndex < 0 || valueIndex >= variable.values.length) return;

        // Update the text property of the value object
        const valObj = variable.values[valueIndex];
        if (typeof valObj === 'object' && valObj !== null) {
          valObj.text = target.value;
        } else {
          variable.values[valueIndex] = { text: target.value };
        }

        // Ensure current value index is within bounds
        const currentIndex = this.app.currentValues[variable.name] || 0;
        const clampedIndex = Math.max(0, Math.min(currentIndex, variable.values.length - 1));
        this.app.currentValues[variable.name] = clampedIndex;

        this.app.updateCenterControl();
        this.app.generateOutput();
        this.updateVariablesJson();
        this.updateStateDisplay();
      });
    });

    // Delete value buttons
    container.querySelectorAll('.var-value-delete-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget;
        const varIndex = parseInt(target.dataset.index, 10);
        const valueIndex = parseInt(target.dataset.valueIndex, 10);
        const variable = this.app.variables[varIndex];
        if (!variable || !Array.isArray(variable.values)) return;

        if (variable.values.length <= 1) {
          showToast('Each variable must have at least one value.', 'warning');
          return;
        }

        variable.values.splice(valueIndex, 1);

        // Clamp current value index
        const currentIndex = this.app.currentValues[variable.name] || 0;
        const clampedIndex = Math.max(0, Math.min(currentIndex, variable.values.length - 1));
        this.app.currentValues[variable.name] = clampedIndex;

        this.updateVariableListEditor();
        this.app.updateCenterControl();
        this.app.generateOutput();
        this.updateVariablesJson();
        this.updateStateDisplay();
      });
    });

    // Add new value inputs
    container.querySelectorAll('.var-new-value-input').forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();

        const target = e.target;
        const varIndex = parseInt(target.dataset.index, 10);
        const variable = this.app.variables[varIndex];
        if (!variable) return;

        const newValue = (target.value || '').trim();
        if (!newValue) return;

        if (!Array.isArray(variable.values)) {
          variable.values = [];
        }
        variable.values.push({ text: newValue });
        target.value = '';

        if (typeof this.app.currentValues[variable.name] !== 'number') {
          this.app.currentValues[variable.name] = 0;
        }

        this.updateVariableListEditor();
        this.app.updateCenterControl();
        this.app.generateOutput();
        this.updateVariablesJson();
        this.updateStateDisplay();
      });
    });

    // Delete variable buttons
    container.querySelectorAll('.var-delete-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget;
        const index = parseInt(target.dataset.index, 10);
        this.deleteVariableFromEditor(index);
      });
    });
  }

  /**
   * Create a variable from the current template selection
   */
  createVariableFromSelection() {
    const editor = this.elements.templateEditor;
    if (!editor || !this.app.currentTemplate) return;

    const selectionStart = editor.selectionStart;
    const selectionEnd = editor.selectionEnd;
    if (selectionStart === undefined || selectionEnd === undefined || selectionStart === selectionEnd) {
      showToast('Select some text in the template first to create a variable.', 'warning');
      return;
    }

    const template = editor.value || '';
    const selectedText = template.slice(selectionStart, selectionEnd);
    const trimmed = selectedText.trim();

    if (!trimmed) {
      showToast('Selection is empty. Please select some non-empty text.', 'warning');
      return;
    }

    // Derive a token ID from the selected text (snake_case, no spaces)
    const base = trimmed.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const tokenId = this.getUniqueFeatureName(base || 'var');

    // Use the trimmed text as a friendly display label
    const displayLabel = trimmed.length > 40 ? `${trimmed.slice(0, 37)}…` : trimmed;

    const newVariable = {
      name: tokenId,           // Token ID - goes in {{...}} placeholders
      feature_name: displayLabel, // Display Label - shown in UI
      values: [trimmed],
      // Store original text so we can optionally restore it if the variable is deleted
      originalText: selectedText
    };

    this.app.variables.push(newVariable);
    this.app.currentValues[newVariable.name] = 0;

    // Replace the selection with the placeholder in the template
    const placeholder = `{{${tokenId}}}`;
    const newTemplate = template.slice(0, selectionStart) + placeholder + template.slice(selectionEnd);

    editor.value = newTemplate;
    this.app.currentTemplate.promptTemplate = newTemplate;

    this.app.createIndicatorDots();
    this.app.updateCenterControl();
    this.app.generateOutput();
    this.updateVariablesJson();
    this.updateStateDisplay();
    this.updateVariableListEditor();
  }

  /**
   * Delete a variable from the editor and optionally restore its original text
   */
  deleteVariableFromEditor(index) {
    const variable = this.app.variables[index];
    if (!variable) return;

    const featureName = variable.feature_name || variable.name;
    const editor = this.elements.templateEditor;
    if (editor && featureName) {
      const template = editor.value || '';
      const escaped = featureName.replace(/[-\\/\\^$*+?.()|[\\]{}]/g, '\\$&');
      const regex = new RegExp(`{{${escaped}}}`, 'g');
      const replacement = variable.originalText || '';
      const updatedTemplate = template.replace(regex, replacement);
      editor.value = updatedTemplate;
      this.app.currentTemplate.promptTemplate = updatedTemplate;
    }

    // Remove variable and its current value entry
    const varNameKey = variable.name || variable.feature_name;
    if (varNameKey && this.app.currentValues[varNameKey] !== undefined) {
      delete this.app.currentValues[varNameKey];
    }

    this.app.variables.splice(index, 1);

    // Clamp current variable index
    if (this.app.currentVariableIndex >= this.app.variables.length) {
      this.app.currentVariableIndex = Math.max(0, this.app.variables.length - 1);
    }

    this.app.createIndicatorDots();
    this.app.updateCenterControl();
    this.app.generateOutput();
    this.updateVariablesJson();
    this.updateStateDisplay();
    this.updateVariableListEditor();
  }

  /**
   * Ensure a unique feature_name across variables
   */
  getUniqueFeatureName(base, skipIndex = -1) {
    let candidate = (base || 'var').toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'var';
    const existing = new Set();

    this.app.variables.forEach((v, idx) => {
      if (idx === skipIndex) return;
      const key = (v.feature_name || v.name || '').toLowerCase();
      if (key) existing.add(key);
    });

    if (!existing.has(candidate)) return candidate;

    let counter = 2;
    while (existing.has(`${candidate}_${counter}`)) {
      counter++;
    }
    return `${candidate}_${counter}`;
  }

  /**
   * Update prompt template when a variable's feature_name changes
   */
  updatePromptVariableReferences(oldName, newName) {
    if (!oldName || oldName === newName) return;
    const editor = this.elements.templateEditor;
    if (!editor) return;

    const escape = (str) => str.replace(/[-\\/\\^$*+?.()|[\\]{}]/g, '\\$&');
    const regex = new RegExp(`{{${escape(oldName)}}}`, 'g');
    const template = editor.value || '';

    if (!regex.test(template)) {
      return;
    }

    const updated = template.replace(regex, `{{${newName}}}`);
    editor.value = updated;
    if (this.app.currentTemplate) {
      this.app.currentTemplate.promptTemplate = updated;
    }
  }

  /**
   * Minimal HTML escaping for editor-rendered values
   */
  escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Apply the edited template
   */
  applyTemplate() {
    const newTemplate = this.elements.templateEditor.value.trim();

    if (!newTemplate) {
      showToast('Template cannot be empty!', 'warning');
      return;
    }

    // Update the app's template
    this.app.currentTemplate.promptTemplate = newTemplate;

    // Regenerate the output
    this.app.generateOutput();

    // Show success feedback
    this.showApplySuccess();
  }

  /**
   * Reset template to original
   */
  resetTemplate() {
    if (confirm('Reset template to original? This will discard your changes.')) {
      this.updateTemplateEditor();
    }
  }

  /**
   * Copy JSON to clipboard
   */
  async copyJson() {
    const jsonText = this.elements.variablesJson.value;

    try {
      await navigator.clipboard.writeText(jsonText);
      this.showCopySuccess();
    } catch (err) {
      // Fallback for older browsers
      this.elements.variablesJson.select();
      document.execCommand('copy');
      this.showCopySuccess();
    }
  }

  /**
   * Enter JSON edit mode
   */
  enterJsonEditMode() {
    // Save original value
    this.originalJsonValue = this.elements.variablesJson.value;

    // Make textarea editable
    this.elements.variablesJson.removeAttribute('readonly');
    this.elements.variablesJson.style.background = '#fff';
    this.elements.variablesJson.style.cursor = 'text';

    // Clear any previous status
    if (this.elements.jsonStatus) {
      this.elements.jsonStatus.textContent = '';
      this.elements.jsonStatus.className = 'json-status';
    }

    // Switch button sets
    if (this.elements.jsonViewControls) {
      this.elements.jsonViewControls.style.display = 'none';
    }
    if (this.elements.jsonEditControls) {
      this.elements.jsonEditControls.style.display = 'flex';
    }

    // Set edit mode flag
    this.jsonEditMode = true;

    // Focus the textarea
    this.elements.variablesJson.focus();
  }

  /**
   * Save edited JSON
   */
  saveJson() {
    const jsonText = this.elements.variablesJson.value;

    try {
      // Parse JSON to validate
      const jsonData = JSON.parse(jsonText);

      // Validate structure
      if (!jsonData.promptTemplate || !Array.isArray(jsonData.variables)) {
        throw new Error('Invalid template structure. Must have "promptTemplate" and "variables" array.');
      }

      // Validate variables
      for (const variable of jsonData.variables) {
        if (!variable.name || !Array.isArray(variable.values)) {
          throw new Error('Invalid variable structure. Each variable must have "name" and "values" array.');
        }
      }

      // Apply the changes to the app
      this.app.loadTemplate(jsonData);

      // Exit edit mode
      this.exitJsonEditMode();

      // Show success
      this.showSaveSuccess();

      if (this.elements.jsonStatus) {
        this.elements.jsonStatus.textContent = '✓ JSON valid and applied.';
        this.elements.jsonStatus.className = 'json-status json-status-ok';
      }

      // Update all content
      this.updateContent();

    } catch (error) {
      if (this.elements.jsonStatus) {
        this.elements.jsonStatus.textContent = `✗ JSON error: ${error.message}`;
        this.elements.jsonStatus.className = 'json-status json-status-error';
      } else {
        showToast(`JSON Error: ${error.message}. Please fix the syntax and try again.`, 'error');
      }
    }
  }

  /**
   * Cancel JSON editing
   */
  cancelJsonEdit() {
    // Restore original value
    this.elements.variablesJson.value = this.originalJsonValue;

    // Exit edit mode
    this.exitJsonEditMode();
  }

  /**
   * Exit JSON edit mode
   */
  exitJsonEditMode() {
    // Make textarea readonly again
    this.elements.variablesJson.setAttribute('readonly', 'readonly');
    this.elements.variablesJson.style.background = '#f5f5f5';
    this.elements.variablesJson.style.cursor = 'not-allowed';

    // Switch button sets back
    if (this.elements.jsonViewControls) {
      this.elements.jsonViewControls.style.display = 'flex';
    }
    if (this.elements.jsonEditControls) {
      this.elements.jsonEditControls.style.display = 'none';
    }

    // Clear edit mode flag
    this.jsonEditMode = false;
    this.originalJsonValue = '';
  }

  /**
   * Show success feedback for apply button
   */
  showApplySuccess() {
    const btn = this.elements.applyTemplateBtn;
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="icon">✓</span> Applied!';
    btn.style.background = 'var(--color-green)';

    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
    }, 2000);
  }

  /**
   * Show success feedback for copy button
   */
  showCopySuccess() {
    const btn = this.elements.copyJsonBtn;
    if (!btn) return;

    btn.classList.add('copied');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="icon">✓</span> Copied!';

    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = originalHTML;
    }, 2000);
  }

  /**
   * Show success feedback for save button
   */
  showSaveSuccess() {
    const btn = this.elements.saveJsonBtn;
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="icon">✓</span> Saved!';
    btn.style.background = 'var(--color-green)';

    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
    }, 2000);
  }

  /**
   * Toggle P5.js section collapse/expand
   */
  toggleP5Section() {
    const content = this.elements.p5SectionContent;
    if (!content) return;

    content.classList.toggle('collapsed');

    // Rotate the icon
    const icon = this.elements.p5CollapseToggle?.querySelector('.collapse-icon');
    if (icon) {
      if (content.classList.contains('collapsed')) {
        icon.style.transform = 'rotate(-90deg)';
      } else {
        icon.style.transform = 'rotate(0deg)';
      }
    }
  }

  /**
   * Update P5.js code editor with template's p5Code
   */
  updateP5CodeEditor() {
    if (this.elements.p5CodeEditor && this.app.currentTemplate) {
      const p5Code = this.app.currentTemplate.p5Code || '';
      this.elements.p5CodeEditor.value = p5Code;

      // If there's P5 code, auto-expand the section
      if (p5Code && this.elements.p5SectionContent?.classList.contains('collapsed')) {
        this.toggleP5Section();
      }
    }
  }

  /**
   * Copy P5 code to clipboard
   */
  async copyP5Code() {
    const codeText = this.elements.p5CodeEditor.value;

    try {
      await navigator.clipboard.writeText(codeText);
      this.showCopyP5Success();
    } catch (err) {
      // Fallback for older browsers
      this.elements.p5CodeEditor.select();
      document.execCommand('copy');
      this.showCopyP5Success();
    }
  }

  /**
   * Enter P5 code edit mode
   */
  enterP5EditMode() {
    // Save original value
    this.originalP5Value = this.elements.p5CodeEditor.value;

    // Make textarea editable
    this.elements.p5CodeEditor.removeAttribute('readonly');
    this.elements.p5CodeEditor.style.background = '#fff';
    this.elements.p5CodeEditor.style.cursor = 'text';

    // Switch button sets
    if (this.elements.p5ViewControls) {
      this.elements.p5ViewControls.style.display = 'none';
    }
    if (this.elements.p5EditControls) {
      this.elements.p5EditControls.style.display = 'flex';
    }

    // Set edit mode flag
    this.p5EditMode = true;

    // Focus the textarea
    this.elements.p5CodeEditor.focus();
  }

  /**
   * Save edited P5 code
   */
  saveP5Code() {
    const codeText = this.elements.p5CodeEditor.value;

    // Update the template's p5Code
    if (this.app.currentTemplate) {
      this.app.currentTemplate.p5Code = codeText;
    }

    // Exit edit mode
    this.exitP5EditMode();

    // Show success
    this.showSaveP5Success();

    // If sketch is running, restart it with new code
    if (this.p5Running) {
      this.stopP5Sketch();
      setTimeout(() => this.runP5Sketch(), 100);
    }
  }

  /**
   * Cancel P5 code editing
   */
  cancelP5Edit() {
    // Restore original value
    this.elements.p5CodeEditor.value = this.originalP5Value;

    // Exit edit mode
    this.exitP5EditMode();
  }

  /**
   * Exit P5 code edit mode
   */
  exitP5EditMode() {
    // Make textarea readonly again
    this.elements.p5CodeEditor.setAttribute('readonly', 'readonly');
    this.elements.p5CodeEditor.style.background = '#f5f5f5';
    this.elements.p5CodeEditor.style.cursor = 'not-allowed';

    // Switch button sets back
    if (this.elements.p5ViewControls) {
      this.elements.p5ViewControls.style.display = 'flex';
    }
    if (this.elements.p5EditControls) {
      this.elements.p5EditControls.style.display = 'none';
    }

    // Clear edit mode flag
    this.p5EditMode = false;
    this.originalP5Value = '';
  }

  /**
   * Toggle P5 sketch run/stop
   */
  toggleP5Sketch() {
    if (this.p5Running) {
      this.stopP5Sketch();
    } else {
      this.runP5Sketch();
    }
  }

  /**
   * Run P5 sketch
   */
  runP5Sketch() {
    const code = this.elements.p5CodeEditor.value;
    if (!code || !code.trim()) {
      showToast('No P5.js code to run!', 'warning');
      return;
    }

    // Check if p5 library is loaded
    if (typeof p5 === 'undefined') {
      showToast('P5.js library not loaded. Please include the P5.js script in your HTML.', 'error');
      return;
    }

    // Show canvas container
    if (this.elements.p5CanvasContainer) {
      this.elements.p5CanvasContainer.style.display = 'block';
    }

    // Clear previous sketch
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }

    // Clear mount point
    if (this.elements.p5SketchMount) {
      this.elements.p5SketchMount.innerHTML = '';
    }

    try {
      // Create wrapper sketch that injects getSynthVar
      const sketch = (p) => {
        // Inject getSynthVar function (Synthograsizer-compatible)
        p.getSynthVar = (featureName) => {
          if (!this.app.currentValues) return null;

          // Find the variable by feature_name
          const variable = this.app.variables.find(v =>
            (v.feature_name || v.name) === featureName
          );

          if (!variable) return null;

          // Get the current value index
          const valueIndex = this.app.currentValues[variable.name];
          if (valueIndex === undefined) return null;

          // Return the actual value text
          return getValueText(variable.values[valueIndex]);
        };

        // Execute the user's sketch code
        const sketchFunc = new Function('p', code);
        sketchFunc(p);
      };

      // Create new p5 instance with injected functions
      this.p5Instance = new p5(sketch, this.elements.p5SketchMount);

      // Update button state
      this.p5Running = true;
      this.updateRunButtonState();

    } catch (error) {
      showToast(`P5.js Error: ${error.message}. Please check your code and try again.`, 'error');
      this.stopP5Sketch();
    }
  }

  /**
   * Stop P5 sketch
   */
  stopP5Sketch() {
    // Remove p5 instance
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }

    // Clear mount point
    if (this.elements.p5SketchMount) {
      this.elements.p5SketchMount.innerHTML = '';
    }

    // Hide canvas container
    if (this.elements.p5CanvasContainer) {
      this.elements.p5CanvasContainer.style.display = 'none';
    }

    // Update button state
    this.p5Running = false;
    this.updateRunButtonState();
  }

  /**
   * Update run button state (Run/Stop)
   */
  updateRunButtonState() {
    const btn = this.elements.runP5Btn;
    if (!btn) return;

    if (this.p5Running) {
      btn.classList.add('running');
      btn.innerHTML = '<span class="icon">⏹</span> Stop';
    } else {
      btn.classList.remove('running');
      btn.innerHTML = '<span class="icon">▶</span> Run Code';
    }
  }

  /**
   * Show success feedback for copy P5 button
   */
  showCopyP5Success() {
    const btn = this.elements.copyP5Btn;
    if (!btn) return;

    btn.classList.add('copied');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="icon">✓</span> Copied!';

    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = originalHTML;
    }, 2000);
  }

  /**
   * Show success feedback for save P5 button
   */
  showSaveP5Success() {
    const btn = this.elements.saveP5Btn;
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="icon">✓</span> Saved!';
    btn.style.background = 'var(--color-green)';

    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
    }, 2000);
  }

  /**
   * Check if overlay is currently open
   */
  isOverlayOpen() {
    return this.isOpen;
  }

  /**
   * Open variable picker modal
   */
  openVariablePicker() {
    this.elements.variablePickerOverlay?.classList.add('show');
  }

  /**
   * Close variable picker modal
   */
  closeVariablePicker() {
    this.elements.variablePickerOverlay?.classList.remove('show');
  }

  /**
   * Add a variable from a pre-defined template
   */
  addVariableFromTemplate(templateType) {
    // Define variable templates
    const templates = {
      color: {
        name: 'color',
        feature_name: 'color',
        values: ['red', 'orange', 'yellow', 'green', 'blue', 'purple']
      },
      size: {
        name: 'size',
        feature_name: 'size',
        values: ['tiny', 'small', 'medium', 'large', 'huge']
      },
      mood: {
        name: 'mood',
        feature_name: 'mood',
        values: ['happy', 'sad', 'angry', 'calm', 'excited', 'mysterious']
      },
      time: {
        name: 'time',
        feature_name: 'time',
        values: ['dawn', 'morning', 'noon', 'afternoon', 'dusk', 'night']
      },
      weather: {
        name: 'weather',
        feature_name: 'weather',
        values: ['sunny', 'cloudy', 'rainy', 'stormy', 'snowy', 'foggy', 'windy']
      },
      style: {
        name: 'style',
        feature_name: 'style',
        values: ['modern', 'vintage', 'futuristic', 'rustic', 'minimalist', 'ornate', 'abstract', 'realistic']
      },
      material: {
        name: 'material',
        feature_name: 'material',
        values: ['wood', 'metal', 'glass', 'stone', 'fabric', 'plastic', 'ceramic', 'paper']
      },
      lighting: {
        name: 'lighting',
        feature_name: 'lighting',
        values: ['bright', 'dim', 'dramatic', 'soft', 'harsh', 'ambient']
      }
    };

    const template = templates[templateType];
    if (!template) {
      console.error('Unknown template type:', templateType);
      return;
    }

    // Check if variable already exists
    const existingIndex = this.app.variables.findIndex(v => v.name === template.name);
    if (existingIndex !== -1) {
      showToast(`Variable "${template.name}" already exists in the template.`, 'warning');
      this.closeVariablePicker();
      return;
    }

    // Add variable to app
    this.app.variables.push({ ...template });

    // Initialize current value for the new variable
    this.app.currentValues[template.name] = 0;

    // Add placeholder to template if not already present
    const placeholder = `{{${template.name}}}`;
    const currentTemplate = this.elements.templateEditor.value;

    if (!currentTemplate.includes(placeholder)) {
      // Add placeholder at the end with a space
      const newTemplate = currentTemplate.trim() + ' ' + placeholder;
      this.elements.templateEditor.value = newTemplate;
      this.app.currentTemplate.promptTemplate = newTemplate;
    }

    // Update the UI
    this.app.createIndicatorDots();
    this.app.updateCenterControl();
    this.app.generateOutput();

    // Update the code overlay displays
    this.updateVariablesJson();
    this.updateStateDisplay();
    this.updateVariableListEditor();

    // Close the picker
    this.closeVariablePicker();

    // Show success feedback
    this.showAddVariableSuccess(template.name);
  }

  /**
   * Show success feedback for adding variable
   */
  showAddVariableSuccess(variableName) {
    const btn = this.elements.addVariableBtn;
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<span class="icon">✓</span> Added ${variableName}!`;
    btn.style.background = 'var(--color-green)';

    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
    }, 2000);
  }

  /**
   * Handle variable import from CSV or JSON file
   */
  async handleVariableImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name;
    const fileExtension = fileName.split('.').pop().toLowerCase();

    try {
      const text = await file.text();
      let variableData;

      if (fileExtension === 'csv') {
        variableData = this.parseCSV(text, fileName);
      } else if (fileExtension === 'json') {
        variableData = this.parseJSON(text, fileName);
      } else {
        showToast('Unsupported file type. Please use .csv or .json files.', 'warning');
        return;
      }

      if (variableData) {
        this.addImportedVariable(variableData);
      }
    } catch (error) {
      console.error('Error importing variable:', error);
      showToast(`Error importing file: ${error.message}`, 'error');
    } finally {
      // Reset file input
      event.target.value = '';
    }
  }

  /**
   * Parse CSV file into variable data
   */
  parseCSV(csvText, fileName) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row.');
    }

    // Parse header
    const header = lines[0].split(',').map(h => h.trim());

    // Find value column (prefer 'value', fallback to second column or first column)
    let valueColumnIndex = header.indexOf('value');
    if (valueColumnIndex === -1) {
      valueColumnIndex = header.indexOf('display_name');
    }
    if (valueColumnIndex === -1) {
      valueColumnIndex = header.length > 1 ? 1 : 0;
    }

    // Extract values from data rows
    const values = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(',').map(c => c.trim());
      if (columns[valueColumnIndex]) {
        values.push({ text: columns[valueColumnIndex] });
      }
    }

    if (values.length === 0) {
      throw new Error('No values found in CSV file.');
    }

    // Extract variable name from filename (remove extension)
    const variableName = fileName.replace('.csv', '').toLowerCase().replace(/[^a-z0-9]/g, '_');

    return {
      name: variableName,
      feature_name: variableName,
      values: values
    };
  }

  /**
   * Parse JSON file into variable data
   */
  parseJSON(jsonText, fileName) {
    const data = JSON.parse(jsonText);

    // Check if it's already in the correct format
    if (data.name && data.values && Array.isArray(data.values)) {
      return {
        name: data.name,
        feature_name: data.feature_name || data.name,
        values: data.values
      };
    }

    // Check if it's an array of values
    if (Array.isArray(data)) {
      const variableName = fileName.replace('.json', '').toLowerCase().replace(/[^a-z0-9]/g, '_');
      return {
        name: variableName,
        feature_name: variableName,
        values: data.map(item => {
          // Already in nested format
          if (typeof item === 'object' && item !== null && 'text' in item) return item;
          if (typeof item === 'string') return { text: item };
          if (item.value) return { text: item.value };
          if (item.display_name) return { text: item.display_name };
          return { text: String(item) };
        })
      };
    }

    // Check if it's an object with a values array
    if (data.values && Array.isArray(data.values)) {
      const variableName = data.name || fileName.replace('.json', '').toLowerCase().replace(/[^a-z0-9]/g, '_');
      return {
        name: variableName,
        feature_name: data.feature_name || variableName,
        values: data.values
      };
    }

    throw new Error('JSON format not recognized. Expected format: {name: "...", values: [...]} or [...]');
  }

  /**
   * Add imported variable to the app
   */
  addImportedVariable(variableData) {
    // Check if variable already exists
    const existingIndex = this.app.variables.findIndex(v => v.name === variableData.name);
    if (existingIndex !== -1) {
      const overwrite = confirm(`Variable "${variableData.name}" already exists. Do you want to replace it?`);
      if (!overwrite) {
        this.closeVariablePicker();
        return;
      }
      // Remove existing variable
      this.app.variables.splice(existingIndex, 1);
    }

    // Add variable to app
    this.app.variables.push({ ...variableData });

    // Initialize current value for the new variable
    this.app.currentValues[variableData.name] = 0;

    // Add placeholder to template if not already present
    const placeholder = `{{${variableData.name}}}`;
    const currentTemplate = this.elements.templateEditor.value;

    if (!currentTemplate.includes(placeholder)) {
      // Add placeholder at the end with a space
      const newTemplate = currentTemplate.trim() + ' ' + placeholder;
      this.elements.templateEditor.value = newTemplate;
      this.app.currentTemplate.promptTemplate = newTemplate;
    }

    // Update the UI
    this.app.createIndicatorDots();
    this.app.updateCenterControl();
    this.app.generateOutput();

    // Update the code overlay displays
    this.updateVariablesJson();
    this.updateStateDisplay();

    // Close the picker
    this.closeVariablePicker();

    // Show success feedback
    this.showAddVariableSuccess(variableData.name);
  }

  // ═══════════════════════════════════════════════════════════════
  // Tags & Provenance Methods
  // ═══════════════════════════════════════════════════════════════

  /**
   * Toggle the Tags & Provenance section collapse/expand
   */
  toggleTagsSection() {
    const content = this.elements.tagsSectionContent;
    if (!content) return;

    content.classList.toggle('collapsed');

    const icon = this.elements.tagsCollapseToggle?.querySelector('.collapse-icon');
    if (icon) {
      icon.style.transform = content.classList.contains('collapsed')
        ? 'rotate(-90deg)' : 'rotate(0deg)';
    }
  }

  /**
   * Render tag cards from the current template's tags array
   */
  renderTags() {
    const container = this.elements.tagsListContainer;
    if (!container) return;

    const tags = this.app.currentTemplate?.tags || [];

    if (tags.length === 0) {
      container.innerHTML = '<div class="tags-empty">No tags yet. Add provenance info to track sources and attribution.</div>';
      return;
    }

    container.innerHTML = tags.map(tag => this._renderTagCard(tag)).join('');

    // Attach delete listeners
    container.querySelectorAll('.tag-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tagId = e.currentTarget.dataset.tagId;
        this.removeTag(tagId);
      });
    });
  }

  /**
   * Render a single tag card HTML string
   * @param {Object} tag
   * @returns {string}
   */
  _renderTagCard(tag) {
    const typeClass = `type-${tag.type || 'custom'}`;
    const typeLabel = (tag.type || 'custom').toUpperCase();
    const isRemix = tag.type === 'remix';

    let urlHtml = '';
    if (tag.url) {
      const displayUrl = tag.url.length > 50 ? tag.url.slice(0, 47) + '...' : tag.url;
      urlHtml = `<a href="${this.escapeHtml(tag.url)}" class="tag-card-url" target="_blank" rel="noopener">${this.escapeHtml(displayUrl)}</a>`;
    }

    let descHtml = '';
    if (tag.description) {
      descHtml = `<div class="tag-card-description">${this.escapeHtml(tag.description)}</div>`;
    }

    let metaHtml = '';
    const metaParts = [];
    if (tag.chain) {
      metaParts.push(`<span>⛓ ${this.escapeHtml(tag.chain)}</span>`);
    }
    if (tag.date) {
      metaParts.push(`<span>📅 ${this.escapeHtml(tag.date)}</span>`);
    }
    if (isRemix && tag.meta?.parent_fingerprint) {
      metaParts.push(`<span>🔗 parent: ${this.escapeHtml(tag.meta.parent_fingerprint)}</span>`);
    }
    if (metaParts.length > 0) {
      metaHtml = `<div class="tag-card-meta">${metaParts.join('')}</div>`;
    }

    // Remix tags are auto-generated — don't allow deletion
    const deleteBtn = isRemix
      ? ''
      : `<button class="tag-delete-btn" data-tag-id="${this.escapeHtml(tag.id)}" title="Remove tag">✕</button>`;

    return `
      <div class="tag-card ${isRemix ? 'tag-remix' : ''}" data-tag-id="${this.escapeHtml(tag.id)}">
        <span class="tag-type-badge ${typeClass}">${typeLabel}</span>
        <div class="tag-card-content">
          <div class="tag-card-label">${this.escapeHtml(tag.label || 'Untitled')}</div>
          ${urlHtml}
          ${descHtml}
          ${metaHtml}
        </div>
        ${deleteBtn}
      </div>
    `;
  }

  /**
   * Show the inline add-tag form and reset its fields
   */
  showAddTagForm() {
    const form = this.elements.tagAddForm;
    if (!form) return;

    // Reset all fields
    if (this.elements.tagTypeSelect)       this.elements.tagTypeSelect.value = 'source';
    if (this.elements.tagLabelInput)       this.elements.tagLabelInput.value = '';
    if (this.elements.tagUrlInput)         this.elements.tagUrlInput.value = '';
    if (this.elements.tagDescriptionInput) this.elements.tagDescriptionInput.value = '';
    if (this.elements.tagChainSelect)      this.elements.tagChainSelect.value = '';
    if (this.elements.tagDateInput)        this.elements.tagDateInput.value = '';

    // Update type-dependent field visibility
    this.onTagTypeChange();

    form.style.display = 'block';
    this.elements.tagLabelInput?.focus();
  }

  /**
   * Hide the add-tag form
   */
  hideAddTagForm() {
    const form = this.elements.tagAddForm;
    if (form) form.style.display = 'none';
  }

  /**
   * Handle tag type change — show/hide chain field for 'collection' type
   */
  onTagTypeChange() {
    const type = this.elements.tagTypeSelect?.value || 'source';
    const chainRow = this.elements.tagChainRow;
    if (chainRow) {
      chainRow.style.display = type === 'collection' ? '' : 'none';
    }
  }

  /**
   * Save a new tag from the add-tag form
   */
  saveNewTag() {
    const label = (this.elements.tagLabelInput?.value || '').trim();
    if (!label) {
      showToast('Tag label is required.', 'warning');
      this.elements.tagLabelInput?.focus();
      return;
    }

    const type = this.elements.tagTypeSelect?.value || 'custom';
    const tag = {
      id: generateTagId('tag'),
      type,
      label,
    };

    const url = (this.elements.tagUrlInput?.value || '').trim();
    if (url) tag.url = url;

    const description = (this.elements.tagDescriptionInput?.value || '').trim();
    if (description) tag.description = description;

    if (type === 'collection') {
      const chain = (this.elements.tagChainSelect?.value || '').trim();
      if (chain) tag.chain = chain;
    }

    const date = (this.elements.tagDateInput?.value || '').trim();
    if (date) tag.date = date;

    this.addTag(tag);
    this.hideAddTagForm();
  }

  /**
   * Add a tag to the current template
   * @param {Object} tagData - Complete tag object
   */
  addTag(tagData) {
    if (!this.app.currentTemplate) return;

    if (!Array.isArray(this.app.currentTemplate.tags)) {
      this.app.currentTemplate.tags = [];
    }

    this.app.currentTemplate.tags.push(tagData);
    this.renderTags();
    this.updateVariablesJson();
    // Update badge pills on main UI
    if (typeof this.app.renderTagBadges === 'function') {
      this.app.renderTagBadges();
    }

    showToast(`Tag "${tagData.label}" added.`, 'success');
  }

  /**
   * Remove a tag by ID from the current template
   * @param {string} tagId
   */
  removeTag(tagId) {
    if (!this.app.currentTemplate || !Array.isArray(this.app.currentTemplate.tags)) return;

    const idx = this.app.currentTemplate.tags.findIndex(t => t.id === tagId);
    if (idx === -1) return;

    const removed = this.app.currentTemplate.tags.splice(idx, 1)[0];
    this.renderTags();
    this.updateVariablesJson();
    // Update badge pills on main UI
    if (typeof this.app.renderTagBadges === 'function') {
      this.app.renderTagBadges();
    }

    showToast(`Tag "${removed.label}" removed.`, 'info');
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stopP5Sketch();
    this.close();
  }
}
