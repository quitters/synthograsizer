// Template Loader Module for Synthograsizer Mini
export class TemplateLoader {
  constructor(app) {
    this.app = app;
    this.templates = {};
    this.builtInTemplates = [];
    this.currentTemplateIndex = -1;
    this.init();
  }

  init() {
    // Get DOM elements
    this.elements = {
      templateButton: document.getElementById('template-button'),
      templateDropdown: document.querySelector('.template-dropdown'),
      templateDropdownMenu: document.getElementById('template-dropdown-menu'),
      templateOptions: document.querySelectorAll('.template-option'),
      templatePrevBtn: document.getElementById('template-prev-btn'),
      templateNextBtn: document.getElementById('template-next-btn'),
      pickerOverlay: document.getElementById('template-picker-overlay'),
      pickerClose: document.getElementById('template-picker-close'),
      pickerBody: document.getElementById('template-picker-body'),
      pickerSearch: document.getElementById('template-picker-search'),
    };

    this.extractBuiltInTemplates();
    this.buildCards();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Open card picker modal
    this.elements.templateButton?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openPicker();
    });

    // Close picker: close button
    this.elements.pickerClose?.addEventListener('click', () => this.closePicker());

    // Close picker: click outside modal
    this.elements.pickerOverlay?.addEventListener('click', (e) => {
      if (e.target === this.elements.pickerOverlay) this.closePicker();
    });

    // Close picker: Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.elements.pickerOverlay?.classList.contains('active')) {
        this.closePicker();
      }
    });

    // Search filter
    this.elements.pickerSearch?.addEventListener('input', () => {
      this.filterCards(this.elements.pickerSearch.value);
    });

    // Template navigation arrow buttons
    this.elements.templatePrevBtn?.addEventListener('click', async () => {
      await this.cycleToPreviousTemplate();
    });

    this.elements.templateNextBtn?.addEventListener('click', async () => {
      await this.cycleToNextTemplate();
    });
  }

  openPicker() {
    this.elements.pickerOverlay?.classList.add('active');
    // Clear search and show all cards
    if (this.elements.pickerSearch) {
      this.elements.pickerSearch.value = '';
      this.filterCards('');
    }
    // Focus search input
    setTimeout(() => this.elements.pickerSearch?.focus(), 50);
    // Mark the currently loaded template
    this._markActiveCard();
  }

  closePicker() {
    this.elements.pickerOverlay?.classList.remove('active');
  }

  buildCards() {
    const body = this.elements.pickerBody;
    if (!body) return;
    body.innerHTML = '';

    // Built-in section label
    const builtInLabel = document.createElement('div');
    builtInLabel.className = 'template-picker-section-label';
    builtInLabel.textContent = 'Built-in templates';
    body.appendChild(builtInLabel);

    // Build a card for each built-in template option
    const builtInOptions = document.querySelectorAll(
      '.template-option[data-template]:not(.template-import-option):not(.template-export-option)'
    );
    builtInOptions.forEach(option => {
      const templateName = option.dataset.template;
      const fullText = option.textContent.trim();
      // Split emoji from text: first char(s) may be emoji
      const emojiMatch = fullText.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}]+)\s*/u);
      const icon = emojiMatch ? emojiMatch[1] : '📄';
      const name = emojiMatch ? fullText.slice(emojiMatch[0].length) : fullText;

      const card = document.createElement('button');
      card.className = 'template-card';
      card.dataset.template = templateName;
      card.dataset.searchText = fullText.toLowerCase();
      card.innerHTML = `<span class="template-card-icon">${icon}</span><span class="template-card-name">${name}</span>`;
      card.addEventListener('click', async () => {
        await this.loadTemplate(templateName);
        this.closePicker();
      });
      body.appendChild(card);
    });

    // Custom section label + import/export
    const customLabel = document.createElement('div');
    customLabel.className = 'template-picker-section-label';
    customLabel.id = 'picker-custom-label';
    customLabel.textContent = 'Custom / imported';
    body.appendChild(customLabel);

    const importOption = document.getElementById('template-import-option');
    const exportOption = document.getElementById('template-export-option');

    if (importOption) {
      const importCard = document.createElement('button');
      importCard.className = 'template-card';
      importCard.id = 'picker-import-card';
      importCard.dataset.searchText = 'import template';
      importCard.innerHTML = `<span class="template-card-icon">📥</span><span class="template-card-name">Import Template…</span>`;
      importCard.addEventListener('click', () => {
        this.closePicker();
        importOption.click();
      });
      body.appendChild(importCard);
    }

    if (exportOption) {
      const exportCard = document.createElement('button');
      exportCard.className = 'template-card';
      exportCard.id = 'picker-export-card';
      exportCard.dataset.searchText = 'export template';
      exportCard.innerHTML = `<span class="template-card-icon">📤</span><span class="template-card-name">Export Template…</span>`;
      exportCard.addEventListener('click', () => {
        this.closePicker();
        exportOption.click();
      });
      body.appendChild(exportCard);
    }
  }

  filterCards(query) {
    const q = query.trim().toLowerCase();
    const body = this.elements.pickerBody;
    if (!body) return;

    let hasBuiltIn = false;
    let hasCustom = false;

    body.querySelectorAll('.template-card').forEach(card => {
      const matches = !q || card.dataset.searchText?.includes(q);
      card.classList.toggle('hidden', !matches);
      const isCustom = card.id === 'picker-import-card' || card.id === 'picker-export-card';
      if (matches && !isCustom) hasBuiltIn = true;
      if (matches && isCustom) hasCustom = true;
    });

    // Show/hide section labels based on whether any cards in that section are visible
    const builtInLabel = body.querySelector('.template-picker-section-label:first-child');
    const customLabel = document.getElementById('picker-custom-label');
    if (builtInLabel) builtInLabel.classList.toggle('hidden', !hasBuiltIn);
    if (customLabel) customLabel.classList.toggle('hidden', !hasCustom);
  }

  _markActiveCard() {
    const body = this.elements.pickerBody;
    if (!body) return;
    body.querySelectorAll('.template-card').forEach(card => {
      const isCurrent = this.currentTemplateIndex !== -1 &&
        this.builtInTemplates[this.currentTemplateIndex] === card.dataset.template;
      card.classList.toggle('active-template', isCurrent);
    });
  }

  toggleDropdown() {
    // kept for backward compat — no-op (picker replaced dropdown)
  }

  closeDropdown() {
    this.elements.templateDropdown?.classList.remove('active');
  }

  async loadTemplate(templateName) {
    try {
      // Check if template is already cached
      if (this.templates[templateName]) {
        this.app.loadTemplate(this.templates[templateName]);
        this.updateCurrentTemplateIndex(templateName);
        return;
      }

      // Fetch template from file
      const response = await fetch(`templates/${templateName}.json`);
      
      if (!response.ok) {
        throw new Error(`Failed to load template: ${response.statusText}`);
      }

      const templateData = await response.json();
      
      // Cache the template
      this.templates[templateName] = templateData;
      
      // Load template into app
      this.app.loadTemplate(templateData);
      
      // Update current template index for cycling
      this.updateCurrentTemplateIndex(templateName);
      
      // Show success message briefly
      this.showLoadSuccess(templateName);
      
    } catch (error) {
      console.error('Template loading error:', error);
      this.showLoadError(error.message);
    }
  }

  showLoadSuccess(templateName) {
    const btn = this.elements.templateButton;
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
      <span class="label">Loaded!</span>
    `;
    btn.style.background = 'var(--color-green)';
    btn.style.color = 'white';
    btn.style.borderColor = 'var(--color-green)';

    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
    }, 2000);
  }

  showLoadError(message) {
    const btn = this.elements.templateButton;
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
      <span class="label">Error!</span>
    `;
    btn.style.background = 'var(--color-red)';
    btn.style.color = 'white';
    btn.style.borderColor = 'var(--color-red)';

    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
    }, 2000);

    console.error('Template load error:', message);
  }

  extractBuiltInTemplates() {
    // Extract built-in template names from the dropdown menu
    const builtInOptions = document.querySelectorAll('.template-option[data-template]:not(.template-import-option):not(.template-export-option)');
    this.builtInTemplates = Array.from(builtInOptions).map(option => option.dataset.template).filter(name => name);
    console.log('Extracted built-in templates:', this.builtInTemplates);
  }

  updateCurrentTemplateIndex(templateName) {
    const index = this.builtInTemplates.indexOf(templateName);
    if (index !== -1) {
      this.currentTemplateIndex = index;
    }
  }

  async cycleToPreviousTemplate() {
    if (this.builtInTemplates.length === 0) {
      console.log('No built-in templates available');
      return;
    }
    
    // If no template is currently selected, start from the last one
    if (this.currentTemplateIndex === -1) {
      this.currentTemplateIndex = this.builtInTemplates.length - 1;
    } else {
      this.currentTemplateIndex = (this.currentTemplateIndex - 1 + this.builtInTemplates.length) % this.builtInTemplates.length;
    }
    
    const templateName = this.builtInTemplates[this.currentTemplateIndex];
    console.log('Cycling to previous template:', templateName, 'at index', this.currentTemplateIndex);
    await this.loadTemplate(templateName);
    this.flashArrowButton(this.elements.templatePrevBtn);
  }

  async cycleToNextTemplate() {
    if (this.builtInTemplates.length === 0) {
      console.log('No built-in templates available');
      return;
    }
    
    // If no template is currently selected, start from the first one
    if (this.currentTemplateIndex === -1) {
      this.currentTemplateIndex = 0;
    } else {
      this.currentTemplateIndex = (this.currentTemplateIndex + 1) % this.builtInTemplates.length;
    }
    
    const templateName = this.builtInTemplates[this.currentTemplateIndex];
    console.log('Cycling to next template:', templateName, 'at index', this.currentTemplateIndex);
    await this.loadTemplate(templateName);
    this.flashArrowButton(this.elements.templateNextBtn);
  }

  flashArrowButton(button) {
    if (!button) return;
    button.classList.add('keyboard-flash');
    setTimeout(() => button.classList.remove('keyboard-flash'), 200);
  }
}
