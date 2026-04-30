// Batch Generator Module for Synthograsizer Mini
import { getValueText, getWeightsArray } from './template-normalizer.js';
import { StoryEngine, isStoryTemplate } from './story-engine.js?v=2';

export class BatchGenerator {
  constructor(app) {
    this.app = app;
    this.variableModes = {}; // Store mode for each variable
    this.batchSize = 24;
    this.outputFormat = 'plain';
    this.storyMode = false; // Whether to use story engine
    this.selectedCharacterId = null; // For story mode character selection
    this.init();
  }

  init() {
    // Get DOM elements
    this.elements = {
      batchButton: document.getElementById('batch-button'),
      batchModalOverlay: document.getElementById('batch-modal-overlay'),
      batchModalBody: document.getElementById('batch-modal-body'),
      batchCloseBtn: document.getElementById('batch-close-btn'),
      batchCancelBtn: document.getElementById('batch-cancel-btn'),
      batchGenerateBtn: document.getElementById('batch-generate-btn'),
      batchOutputOverlay: document.getElementById('batch-output-overlay'),
      batchOutputClose: document.getElementById('batch-output-close'),
      batchOutputText: document.getElementById('batch-output-text'),
      batchCopyBtn: document.getElementById('batch-copy-btn'),
      batchDownloadBtn: document.getElementById('batch-download-btn')
    };

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Open modal
    this.elements.batchButton?.addEventListener('click', () => this.openModal());

    // Close modal
    this.elements.batchCloseBtn?.addEventListener('click', () => this.closeModal());
    this.elements.batchCancelBtn?.addEventListener('click', () => this.closeModal());

    // Close on overlay click (with drag protection)
    let isModalMouseDown = false;
    this.elements.batchModalOverlay?.addEventListener('mousedown', (e) => {
      isModalMouseDown = (e.target === this.elements.batchModalOverlay);
    });
    this.elements.batchModalOverlay?.addEventListener('click', (e) => {
      if (isModalMouseDown && e.target === this.elements.batchModalOverlay) {
        this.closeModal();
      }
      isModalMouseDown = false;
    });

    // Generate batch
    this.elements.batchGenerateBtn?.addEventListener('click', () => this.generateBatch());

    // Output modal
    this.elements.batchOutputClose?.addEventListener('click', () => this.closeOutputModal());

    let isOutputMouseDown = false;
    this.elements.batchOutputOverlay?.addEventListener('mousedown', (e) => {
      isOutputMouseDown = (e.target === this.elements.batchOutputOverlay);
    });
    this.elements.batchOutputOverlay?.addEventListener('click', (e) => {
      if (isOutputMouseDown && e.target === this.elements.batchOutputOverlay) {
        this.closeOutputModal();
      }
      isOutputMouseDown = false;
    });

    // Copy and download
    this.elements.batchCopyBtn?.addEventListener('click', () => this.copyOutput());
    this.elements.batchDownloadBtn?.addEventListener('click', () => this.downloadOutput());
  }

  openModal() {
    if (!this.app.variables || this.app.variables.length === 0) {
      showToast('Please load a template first!', 'warning');
      return;
    }

    // Auto-detect story mode
    const hasStory = isStoryTemplate(this.app.currentTemplate);
    this.storyMode = hasStory;

    // Default to story-json format when opening in story mode
    if (hasStory && this.outputFormat === 'plain') {
      this.outputFormat = 'story-json';
    }

    // Initialize variable modes if not already set
    this.app.variables.forEach(variable => {
      if (!this.variableModes[variable.name]) {
        this.variableModes[variable.name] = {
          mode: 'sequential',
          repeatCount: 3,
          repeatSubmode: 'sequential'
        };
      }
    });

    this.renderModalContent();
    this.elements.batchModalOverlay.classList.add('active');
  }

  closeModal() {
    this.elements.batchModalOverlay.classList.remove('active');
  }

  closeOutputModal() {
    this.elements.batchOutputOverlay.classList.remove('active');
  }

  renderModalContent() {
    const hasStory = isStoryTemplate(this.app.currentTemplate);

    let html = '';

    // Story mode toggle (only shown when template has a story block)
    if (hasStory) {
      html += this.renderStoryModeToggle();
    }

    if (this.storyMode && hasStory) {
      html += this.renderStoryPanel();
    } else {
      html += this.app.variables.map((variable, index) => this.renderVariableItem(variable, index)).join('');
    }

    html += this.renderBatchSettings();

    this.elements.batchModalBody.innerHTML = html;
    this.attachModalEventListeners();
  }

  // ─── Story Mode UI ───────────────────────────────────────────

  renderStoryModeToggle() {
    return `
      <div class="batch-story-toggle">
        <label class="story-toggle-label">
          <input type="checkbox" id="story-mode-toggle" ${this.storyMode ? 'checked' : ''}>
          <span class="story-toggle-text">Story Mode</span>
          <span class="story-toggle-hint">Generate sequential narrative prompts from act structure</span>
        </label>
      </div>
    `;
  }

  renderStoryPanel() {
    const story = this.app.currentTemplate.story;
    const engine = new StoryEngine(this.app.currentTemplate);
    const summary = engine.getSummary();
    const validation = engine.validate();

    // ── Bespoke-beat panel ──
    if (summary.isBespoke) {
      const previewBeats = (story.beats || []).slice(0, 3);
      const remaining = (story.beats || []).length - previewBeats.length;

      let warningHtml = '';
      if (validation.warnings.length > 0) {
        warningHtml = `
          <div class="story-warnings">
            ${validation.warnings.map(w => `<div class="story-warning-item">${w}</div>`).join('')}
          </div>
        `;
      }

      return `
        <div class="story-panel">
          <div class="story-title">🎬 ${summary.title}</div>
          <div style="font-size:12px; color:#94a3b8; margin-bottom:8px;">
            ${summary.totalBeats} bespoke beats · ${summary.acts.length} acts ·
            ${summary.characters.length} character${summary.characters.length !== 1 ? 's' : ''}
            ${summary.duration_seconds ? ` · ${summary.duration_seconds}s total` : ''}
          </div>
          ${warningHtml}
          <div class="story-section">
            <h4>Beat Preview</h4>
            <div class="story-beat-preview">
              ${previewBeats.map(b => `
                <div class="story-preview-beat">
                  <div class="story-preview-beat-label">#${b.id} · ${b.shot || 'Shot'}</div>
                  <div class="story-preview-beat-text">${b.prompt?.slice(0, 120) || ''}${(b.prompt?.length || 0) > 120 ? '…' : ''}</div>
                </div>
              `).join('')}
              ${remaining > 0 ? `<div class="story-preview-more">+ ${remaining} more beat${remaining !== 1 ? 's' : ''}…</div>` : ''}
            </div>
          </div>
          <div style="text-align:center; margin-top:8px;">
            <em style="font-size:11px; color:#64748b;">Open the Storyboard panel (🎬 button in toolbar) for full per-beat control.</em>
          </div>
        </div>
      `;
    }

    // ── Legacy panel (acts-with-counts shape) ──
    // Character selector
    let characterHtml = '';
    if (summary.characters.length > 0) {
      characterHtml = `
        <div class="story-section">
          <h4>Characters</h4>
          <div class="story-characters">
            ${summary.characters.map((c, i) => `
              <label class="story-character-option">
                <input type="radio" name="story-character" value="${c.id}"
                  ${(this.selectedCharacterId === c.id || (!this.selectedCharacterId && i === 0)) ? 'checked' : ''}>
                <span class="story-character-name">${c.name}</span>
                <span class="story-character-id">${c.id}</span>
              </label>
            `).join('')}
            ${summary.characters.length > 1 ? `
              <label class="story-character-option">
                <input type="radio" name="story-character" value="__rotate__"
                  ${this.selectedCharacterId === '__rotate__' ? 'checked' : ''}>
                <span class="story-character-name">Rotate (per act lock)</span>
                <span class="story-character-id">Uses act locks to determine character</span>
              </label>
            ` : ''}
          </div>
        </div>
      `;
    }

    // Act timeline
    const actTimelineHtml = `
      <div class="story-section">
        <h4>Act Structure — ${summary.totalBeats} total beats</h4>
        <div class="story-act-timeline">
          ${summary.acts.map((act, i) => {
            const beatPercent = (act.beats / summary.totalBeats) * 100;
            const colors = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'];
            const color = colors[i % colors.length];
            return `
              <div class="story-act-block" style="flex: ${act.beats}; background: ${color}20; border-left: 3px solid ${color};">
                <div class="story-act-name">${act.name}</div>
                <div class="story-act-beats">${act.beats} beat${act.beats !== 1 ? 's' : ''}</div>
                ${act.locks.length > 0 ? `<div class="story-act-locks">Locks: ${act.locks.join(', ')}</div>` : ''}
                ${act.biases.length > 0 ? `<div class="story-act-biases">Biases: ${act.biases.join(', ')}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Progressions
    let progressionHtml = '';
    if (summary.progressions.length > 0) {
      progressionHtml = `
        <div class="story-section">
          <h4>Progressions</h4>
          <div class="story-progressions">
            ${summary.progressions.map(p => `
              <div class="story-progression-item">
                <span class="story-prog-var">${p.variable}</span>
                <span class="story-prog-arrow">${p.steps} steps</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Validation warnings
    let warningHtml = '';
    if (validation.warnings.length > 0) {
      warningHtml = `
        <div class="story-warnings">
          ${validation.warnings.map(w => `<div class="story-warning-item">${w}</div>`).join('')}
        </div>
      `;
    }

    // Beat preview — run the engine now to show the first 3 beats.
    // Applies the same character rotation logic as generateStoryBatch so the
    // preview is accurate when "Rotate" is selected.
    let previewHtml = '';
    try {
      const isRotate = this.selectedCharacterId === '__rotate__';
      const chars = this.app.currentTemplate.story?.characters || [];

      let previewTemplate = this.app.currentTemplate;
      let previewCharId = isRotate ? null
        : (this.selectedCharacterId || (chars[0]?.id ?? null));

      if (isRotate && chars.length > 1) {
        previewTemplate = {
          ...this.app.currentTemplate,
          story: {
            ...this.app.currentTemplate.story,
            acts: this.app.currentTemplate.story.acts.map((act, i) => ({
              ...act,
              locks: { character: chars[i % chars.length].id, ...(act.locks || {}) }
            }))
          }
        };
        previewCharId = null;
      }

      const previewEngine = new StoryEngine(previewTemplate);
      const previewSeq = previewEngine.generateSequence({
        characterId: previewCharId,
        getWeightedRandomIndex: (weights) => this.app.getWeightedRandomIndex(weights)
      });
      const shown = previewSeq.slice(0, 3);
      const remaining = previewSeq.length - shown.length;
      if (shown.length > 0) {
        previewHtml = `
          <div class="story-section">
            <h4>Preview <span class="story-preview-note">(first ${shown.length} of ${previewSeq.length} beats)</span></h4>
            <div class="story-beat-preview">
              ${shown.map(b => `
                <div class="story-preview-beat">
                  <div class="story-preview-beat-label">${b.act} &middot; Beat ${b.beat}</div>
                  <div class="story-preview-beat-text">${b.text}</div>
                </div>
              `).join('')}
              ${remaining > 0 ? `<div class="story-preview-more">+ ${remaining} more beat${remaining !== 1 ? 's' : ''}\u2026</div>` : ''}
            </div>
          </div>
        `;
      }
    } catch (_) { /* preview is best-effort */ }

    return `
      <div class="story-panel">
        <div class="story-title">${summary.title}</div>
        ${warningHtml}
        ${characterHtml}
        ${actTimelineHtml}
        ${progressionHtml}
        ${previewHtml}
      </div>
    `;
  }

  renderVariableItem(variable, index) {
    const color = this.app.config.colorPalette[index % this.app.config.colorPalette.length];
    const mode = this.variableModes[variable.name];
    const valueIndex = this.app.currentValues[variable.name] || 0;
    const currentValue = getValueText(variable.values[valueIndex]);
    const isLocked = mode.mode === 'lock';

    return `
      <div class="batch-variable-item" data-variable="${variable.name}">
        <div class="batch-variable-header">
          <span class="batch-variable-name ${isLocked ? 'locked' : ''}" style="background: ${isLocked ? '#9ca3af' : color};">
            ${variable.name.toUpperCase()}
          </span>
          <div class="batch-mode-selector">
            <button
              class="batch-mode-btn ${mode.mode === 'lock' ? 'active' : ''}"
              data-mode="lock"
              title="Keep this value fixed across all prompts."
            >
              Lock
            </button>
            <button
              class="batch-mode-btn ${mode.mode === 'random' ? 'active' : ''}"
              data-mode="random"
              title="Pick a random value for each prompt."
            >
              Random
            </button>
            <button
              class="batch-mode-btn ${mode.mode === 'sequential' ? 'active' : ''}"
              data-mode="sequential"
              title="Step through values in order for each prompt."
            >
              Sequential
            </button>
            <button
              class="batch-mode-btn ${mode.mode === 'repeat' ? 'active' : ''}"
              data-mode="repeat"
              title="Repeat the same sequence pattern across prompts."
            >
              Repeat
            </button>
          </div>
        </div>
        <div class="batch-current-value ${isLocked ? 'locked' : ''}">${currentValue}</div>
        <div class="batch-repeat-input ${mode.mode === 'repeat' ? 'active' : ''}">
          <label>Repeat each value:</label>
          <input type="number" class="repeat-count-input" value="${mode.repeatCount}" min="1" max="100">
          <div class="batch-repeat-submode">
            <button class="batch-submode-btn ${mode.repeatSubmode === 'sequential' ? 'active' : ''}" data-submode="sequential">Sequential</button>
            <button class="batch-submode-btn ${mode.repeatSubmode === 'random' ? 'active' : ''}" data-submode="random">Random</button>
          </div>
        </div>
      </div>
    `;
  }

  renderBatchSettings() {
    const hasStory = isStoryTemplate(this.app.currentTemplate);
    const storyBeats = hasStory ? new StoryEngine(this.app.currentTemplate).totalBeats : 0;

    // In story mode, batch size is determined by the story structure
    const showBatchSize = !this.storyMode;
    const promptCount = this.storyMode ? storyBeats : this.batchSize;

    return `
      <div class="batch-settings">
        <h3>Settings</h3>
        <div class="batch-setting-row">
          ${showBatchSize ? `
            <div class="batch-setting-item">
              <label>Number of Prompts</label>
              <input type="number" id="batch-size-input" value="${this.batchSize}" min="1" max="1000">
            </div>
          ` : ''}
          <div class="batch-setting-item">
            <label for="batch-format-select">Output Format</label>
            <select
              id="batch-format-select"
              title="Choose how to export this batch. Use 'AI Studio Batch JSON' to save a .json file you can import into the AI Studio Batch Image Generation window."
            >
              <option value="plain" ${this.outputFormat === 'plain' ? 'selected' : ''}>Plain Text (line breaks)</option>
              <option value="numbered" ${this.outputFormat === 'numbered' ? 'selected' : ''}>Numbered List</option>
              <option value="json" ${this.outputFormat === 'json' ? 'selected' : ''}>JSON Export</option>
              <option
                value="ai-studio-json"
                ${this.outputFormat === 'ai-studio-json' ? 'selected' : ''}
                title="Export a .json batch file for AI Studio's Batch Image Generation (Import from JSON)."
              >AI Studio Batch JSON</option>
              ${this.storyMode ? `
                <option value="story-json" ${this.outputFormat === 'story-json' ? 'selected' : ''}>Story JSON (acts + beats)</option>
              ` : ''}
            </select>
          </div>
        </div>
        <div class="batch-prompt-count" id="batch-prompt-count">
          ${this.storyMode
            ? `This will generate ${promptCount} beats across ${this.app.currentTemplate.story.acts.length} acts`
            : `This will generate ${promptCount} prompts`
          }
        </div>
      </div>
    `;
  }

  attachModalEventListeners() {
    // Story mode toggle — also auto-switch output format
    const storyToggle = document.getElementById('story-mode-toggle');
    if (storyToggle) {
      storyToggle.addEventListener('change', (e) => {
        this.storyMode = e.target.checked;
        if (this.storyMode && this.outputFormat === 'plain') {
          this.outputFormat = 'story-json';
        } else if (!this.storyMode && this.outputFormat === 'story-json') {
          this.outputFormat = 'plain';
        }
        this.renderModalContent();
      });
    }

    // Character selection (story mode)
    document.querySelectorAll('input[name="story-character"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        // Keep '__rotate__' as a string so generateStoryBatch can detect it;
        // don't convert to null (null means "no explicit selection", not "rotate").
        this.selectedCharacterId = e.target.value;
        this.renderModalContent(); // Refresh preview
      });
    });

    // Mode buttons
    document.querySelectorAll('.batch-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const variableItem = e.target.closest('.batch-variable-item');
        const variableName = variableItem.dataset.variable;
        const mode = e.target.dataset.mode;

        this.setVariableMode(variableName, mode);
        this.updateVariableUI(variableItem, variableName);
      });
    });

    // Submode buttons
    document.querySelectorAll('.batch-submode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const variableItem = e.target.closest('.batch-variable-item');
        const variableName = variableItem.dataset.variable;
        const submode = e.target.dataset.submode;

        this.variableModes[variableName].repeatSubmode = submode;

        // Update UI
        const parent = e.target.parentElement;
        parent.querySelectorAll('.batch-submode-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      });
    });

    // Repeat count inputs
    document.querySelectorAll('.repeat-count-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const variableItem = e.target.closest('.batch-variable-item');
        const variableName = variableItem.dataset.variable;
        this.variableModes[variableName].repeatCount = parseInt(e.target.value) || 3;
        this.updatePromptCount();
      });
    });

    // Batch size input
    const batchSizeInput = document.getElementById('batch-size-input');
    if (batchSizeInput) {
      batchSizeInput.addEventListener('change', (e) => {
        this.batchSize = parseInt(e.target.value) || 24;
        this.updatePromptCount();
      });
    }

    // Format select
    const formatSelect = document.getElementById('batch-format-select');
    if (formatSelect) {
      formatSelect.addEventListener('change', (e) => {
        this.outputFormat = e.target.value;
      });
    }
  }

  setVariableMode(variableName, mode) {
    this.variableModes[variableName].mode = mode;
  }

  updateVariableUI(variableItem, variableName) {
    const mode = this.variableModes[variableName].mode;
    const isLocked = mode === 'lock';

    // Update active button
    variableItem.querySelectorAll('.batch-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Update variable name styling
    const varName = variableItem.querySelector('.batch-variable-name');
    const currentValue = variableItem.querySelector('.batch-current-value');

    if (isLocked) {
      varName.classList.add('locked');
      currentValue.classList.add('locked');
      varName.style.background = '#9ca3af';
    } else {
      varName.classList.remove('locked');
      currentValue.classList.remove('locked');
      // Restore original color
      const index = this.app.variables.findIndex(v => v.name === variableName);
      const color = this.app.config.colorPalette[index % this.app.config.colorPalette.length];
      varName.style.background = color;
    }

    // Show/hide repeat input
    const repeatInput = variableItem.querySelector('.batch-repeat-input');
    if (mode === 'repeat') {
      repeatInput.classList.add('active');
    } else {
      repeatInput.classList.remove('active');
    }

    this.updatePromptCount();
  }

  updatePromptCount() {
    const countEl = document.getElementById('batch-prompt-count');
    if (!countEl) return;

    if (this.storyMode && isStoryTemplate(this.app.currentTemplate)) {
      const engine = new StoryEngine(this.app.currentTemplate);
      const acts = this.app.currentTemplate.story.acts.length;
      countEl.textContent = `This will generate ${engine.totalBeats} beats across ${acts} acts`;
    } else {
      countEl.textContent = `This will generate ${this.batchSize} prompts`;
    }
  }

  // ─── Generation ──────────────────────────────────────────────

  generateBatch() {
    if (this.storyMode && isStoryTemplate(this.app.currentTemplate)) {
      this.generateStoryBatch();
    } else {
      this.generateStandardBatch();
    }
  }

  generateStoryBatch() {
    const template = this.app.currentTemplate;
    const chars = template.story?.characters || [];
    const isRotate = this.selectedCharacterId === '__rotate__';

    // Build the effective template — may be a shallow clone with injected per-act
    // character locks when the user chose "Rotate".
    let effectiveTemplate = template;
    let characterId = isRotate ? null : (this.selectedCharacterId || chars[0]?.id || null);

    if (isRotate && chars.length > 1) {
      // Inject round-robin character locks per act. Existing character locks win.
      effectiveTemplate = {
        ...template,
        story: {
          ...template.story,
          acts: template.story.acts.map((act, i) => ({
            ...act,
            locks: {
              character: chars[i % chars.length].id, // rotation default
              ...(act.locks || {}),                  // existing locks override
            }
          }))
        }
      };
      // With per-act locks handling characters, characterId can be null
      characterId = null;
    }

    const engine = new StoryEngine(effectiveTemplate);
    const sequence = engine.generateSequence({
      characterId,
      getWeightedRandomIndex: (weights) => this.app.getWeightedRandomIndex(weights)
    });

    const entries = sequence.map(beat => ({
      text: beat.text,
      variables: beat.variables,
      beat: beat.beat,
      act: beat.act
    }));

    this.displayOutput(entries);
  }

  generateStandardBatch() {
    const entries = [];

    for (let i = 0; i < this.batchSize; i++) {
      const values = {};

      // For each variable, determine the value based on its mode
      this.app.variables.forEach((variable, varIndex) => {
        const mode = this.variableModes[variable.name];
        const valueCount = variable.values.length;

        switch (mode.mode) {
          case 'lock':
            // Use current value
            values[variable.name] = getValueText(variable.values[this.app.currentValues[variable.name]]);
            break;

          case 'random': {
            // Random value (weighted)
            const weights = getWeightsArray(variable);
            const idx = this.app.getWeightedRandomIndex(weights);
            values[variable.name] = getValueText(variable.values[idx]);
            break;
          }

          case 'sequential': {
            // Cycle through values
            const seqIndex = i % valueCount;
            values[variable.name] = getValueText(variable.values[seqIndex]);
            break;
          }

          case 'repeat': {
            // Repeat each value N times
            const repeatCount = mode.repeatCount;
            const repeatCycles = Math.floor(i / repeatCount);

            if (mode.repeatSubmode === 'sequential') {
              // Sequential after repeat
              const repeatSeqIndex = repeatCycles % valueCount;
              values[variable.name] = getValueText(variable.values[repeatSeqIndex]);
            } else {
              // Random after repeat - use cycle number as seed for consistency within repeat
              const randomSeed = repeatCycles;
              const randomIndex = this.seededRandom(randomSeed, varIndex) % valueCount;
              values[variable.name] = getValueText(variable.values[randomIndex]);
            }
            break;
          }
        }
      });

      let prompt = this.app.currentTemplate.promptTemplate;
      this.app.variables.forEach(variable => {
        // Fix: prioritize variable.name to match template {{variable_name}} format
        const varName = variable.name || variable.feature_name;
        const regex = new RegExp(`{{${varName}}}`, 'g');
        prompt = prompt.replace(regex, values[variable.name]);
      });

      entries.push({
        text: prompt,
        variables: values
      });
    }

    this.displayOutput(entries);
  }

  seededRandom(seed, salt) {
    // Mulberry32-based PRNG — deterministic, well-distributed output for a given seed+salt pair.
    // Returns a non-negative integer. Consistent across calls with the same inputs.
    let h = (seed + salt * 2654435761) | 0;  // mix seed and salt via golden-ratio hash
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;  // unsigned 32-bit
    return h;
  }

  displayOutput(entries) {
    let output = '';
    const promptTexts = entries.map(entry => entry.text);

    switch (this.outputFormat) {
      case 'numbered':
        output = promptTexts.map((p, i) => `${i + 1}. ${p}`).join('\n');
        break;
      case 'json':
        output = JSON.stringify({ prompts: promptTexts }, null, 2);
        break;
      case 'ai-studio-json': {
        const batchSpec = this.buildAISBatch(entries);
        output = JSON.stringify(batchSpec, null, 2);
        break;
      }
      case 'story-json': {
        const storySpec = this.buildStoryJSON(entries);
        output = JSON.stringify(storySpec, null, 2);
        break;
      }
      default: // plain
        output = promptTexts.join('\n');
    }

    this.elements.batchOutputText.value = output;
    this.closeModal();
    this.elements.batchOutputOverlay.classList.add('active');
  }

  buildAISBatch(entries) {
    const template = this.app.currentTemplate || {};
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const batchName = `synthograsizer_batch_${timestamp}`;

    const exportObj = {
      batch_name: batchName,
      source: 'synthograsizer-mini',
      description: 'Exported from Synthograsizer Mini for AI Studio batch generation',
      template: {
        promptTemplate: template.promptTemplate || '',
        variables: Array.isArray(template.variables) ? template.variables : []
      },
      prompts: entries.map((entry, index) => ({
        id: `prompt_${index + 1}`,
        text: entry.text,
        variables: entry.variables
      }))
    };
    // Include provenance tags if any exist
    const tags = template.tags;
    if (Array.isArray(tags) && tags.length > 0) {
      exportObj.tags = tags;
    }
    return exportObj;
  }

  buildStoryJSON(entries) {
    const template = this.app.currentTemplate || {};
    const story = template.story || {};
    const sourceActs = story.acts || [];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Detect bespoke-beat shape
    const isBespoke = Array.isArray(story.beats) && story.beats.length > 0
                      && typeof story.beats[0] === 'object' && 'prompt' in story.beats[0];

    let acts;
    if (isBespoke) {
      // Bespoke path: group entries by act name from sequence metadata
      const actMap = new Map();
      for (const act of sourceActs) {
        actMap.set(act.name || 'Unnamed', { ...act, beatEntries: [] });
      }
      for (const entry of entries) {
        const actData = actMap.get(entry.act);
        if (actData) {
          actData.beatEntries.push(entry);
        }
      }
      acts = Array.from(actMap.values()).map(act => ({
        name: act.name || 'Unnamed Act',
        beats: act.beatEntries.map(b => ({
          beat: b.beat,
          shot: b.shot || '',
          purpose: b.purpose || '',
          prompt: b.text,
          characters: b.characters || [],
          variables: b.variables || {}
        }))
      }));
    } else {
      // Legacy path: slice entries into act groups using beat counts
      let offset = 0;
      acts = sourceActs.map((act, i) => {
        const beatCount = act.beats || 1;
        const actBeats = entries.slice(offset, offset + beatCount);
        offset += beatCount;
        return {
          name: act.name || `Act ${i + 1}`,
          locks: act.locks || {},
          biases: act.biases || {},
          beats: actBeats.map(b => ({
            beat: b.beat,
            prompt: b.text,
            variables: b.variables
          }))
        };
      });
    }

    const storyObj = {
      story_name: story.title || `story_${timestamp}`,
      source: 'synthograsizer-story-engine',
      description: `Story sequence: ${story.title || 'Untitled'}`,
      total_beats: entries.length,
      ...(isBespoke && {
        duration_seconds: story.duration_seconds || null,
        beat_duration_seconds: story.beat_duration_seconds || null,
        anchors: story.anchors || {}
      }),
      characters: story.characters || [],
      acts,
      flat_prompts: entries.map(e => e.text)
    };
    // Include provenance tags if any exist
    const tags = template.tags;
    if (Array.isArray(tags) && tags.length > 0) {
      storyObj.tags = tags;
    }
    return storyObj;
  }

  copyOutput() {
    this.elements.batchOutputText.select();
    document.execCommand('copy');

    // Visual feedback
    const btn = this.elements.batchCopyBtn;
    btn.classList.add('copied');
    btn.textContent = '✓ Copied!';

    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
        </svg>
        Copy All
      `;
    }, 2000);
  }

  downloadOutput() {
    const content = this.elements.batchOutputText.value;
    const isJsonFormat = this.outputFormat === 'json' || this.outputFormat === 'ai-studio-json' || this.outputFormat === 'story-json';
    const extension = isJsonFormat ? 'json' : 'txt';
    const filename = `synthograsizer-batch-${Date.now()}.${extension}`;

    const mimeType = isJsonFormat ? 'application/json' : 'text/plain';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
