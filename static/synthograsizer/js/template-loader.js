// Template Loader Module for Synthograsizer Mini
export class TemplateLoader {
  constructor(app) {
    this.app = app;
    this.templates = {};
    this.init();
  }

  init() {
    // Get DOM elements
    this.elements = {
      templateButton: document.getElementById('template-button'),
      templateDropdown: document.querySelector('.template-dropdown'),
      templateDropdownMenu: document.getElementById('template-dropdown-menu'),
      templateOptions: document.querySelectorAll('.template-option')
    };

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Toggle dropdown
    this.elements.templateButton?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.elements.templateDropdown?.contains(e.target)) {
        this.closeDropdown();
      }
    });

    // Template option clicks - query fresh each time to pick up all options
    const templateOptions = document.querySelectorAll('.template-option');
    templateOptions.forEach(option => {
      option.addEventListener('click', async () => {
        const templateName = option.dataset.template;
        await this.loadTemplate(templateName);
        this.closeDropdown();
      });
    });
  }

  toggleDropdown() {
    this.elements.templateDropdown?.classList.toggle('active');
  }

  closeDropdown() {
    this.elements.templateDropdown?.classList.remove('active');
  }

  async loadTemplate(templateName) {
    try {
      // Check if template is already cached
      if (this.templates[templateName]) {
        this.app.loadTemplate(this.templates[templateName]);
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
}
