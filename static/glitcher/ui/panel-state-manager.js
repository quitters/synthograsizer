/**
 * Panel State Manager
 * Handles collapsible control groups with memory
 */

export class PanelStateManager {
  constructor() {
    this.panelStates = this.loadPanelStates();
    this.initializePanels();
    this.setupEventListeners();
  }

  /**
   * Load saved panel states from localStorage
   */
  loadPanelStates() {
    try {
      const saved = localStorage.getItem('glitcher-panel-states');
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.warn('Failed to load panel states:', error);
      return {};
    }
  }

  /**
   * Save panel states to localStorage
   */
  savePanelStates() {
    try {
      localStorage.setItem('glitcher-panel-states', JSON.stringify(this.panelStates));
    } catch (error) {
      console.warn('Failed to save panel states:', error);
    }
  }

  /**
   * Initialize all control panels
   */
  initializePanels() {
    const panels = document.querySelectorAll('.control-group');
    
    panels.forEach(panel => {
      const title = panel.querySelector('.group-title');
      if (!title) return;
      
      // Get panel ID from title text
      const panelId = this.getPanelId(title);
      
      // Add collapse functionality
      this.makeCollapsible(panel, title, panelId);
      
      // Apply saved state
      if (this.panelStates[panelId] === 'collapsed') {
        this.collapsePanel(panel, false);
      }
      // If panel is expanded on load, ensure UI state is correct
      else if (this.panelStates[panelId] === 'expanded' || !this.panelStates[panelId]) {
        // Delay to ensure other UI components are initialized
        setTimeout(() => {
          this.restoreUIStateForPanel(panel, panelId);
        }, 100);
      }
    });
  }

  /**
   * Get a unique ID for the panel based on its title
   */
  getPanelId(titleElement) {
    // Remove emoji and extra spaces
    return titleElement.textContent.replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
  }

  /**
   * Make a panel collapsible
   */
  makeCollapsible(panel, title, panelId) {
    // Add collapse indicator
    const indicator = document.createElement('span');
    indicator.className = 'collapse-indicator';
    indicator.textContent = '▼';
    indicator.style.cssText = `
      float: right;
      transition: transform 0.3s ease;
      font-size: 12px;
      opacity: 0.7;
    `;
    title.appendChild(indicator);
    
    // Make title clickable
    title.style.cursor = 'pointer';
    title.style.userSelect = 'none';
    
    // Add hover effect
    title.addEventListener('mouseenter', () => {
      title.style.opacity = '0.8';
    });
    
    title.addEventListener('mouseleave', () => {
      title.style.opacity = '1';
    });
    
    // Add click handler
    title.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePanel(panel, panelId);
    });
    
    // Store panel reference
    panel.dataset.panelId = panelId;
  }

  /**
   * Toggle panel collapsed state
   */
  togglePanel(panel, panelId) {
    const isCollapsed = panel.classList.contains('collapsed');
    
    if (isCollapsed) {
      this.expandPanel(panel, true, panelId);
    } else {
      this.collapsePanel(panel, true);
    }
    
    // Save state
    this.panelStates[panelId] = isCollapsed ? 'expanded' : 'collapsed';
    this.savePanelStates();
  }

  /**
   * Collapse a panel
   */
  collapsePanel(panel, animate = true) {
    panel.classList.add('collapsed');
    
    const indicator = panel.querySelector('.collapse-indicator');
    if (indicator) {
      indicator.style.transform = 'rotate(-90deg)';
    }
    
    // Hide all children except title
    const title = panel.querySelector('.group-title');
    const children = Array.from(panel.children).filter(child => child !== title);
    
    children.forEach(child => {
      if (animate) {
        child.style.transition = 'all 0.3s ease';
        child.style.maxHeight = '0';
        child.style.opacity = '0';
        child.style.overflow = 'hidden';
        child.style.marginTop = '0';
        child.style.marginBottom = '0';
        child.style.paddingTop = '0';
        child.style.paddingBottom = '0';
        
        setTimeout(() => {
          child.style.display = 'none';
        }, 300);
      } else {
        child.style.display = 'none';
      }
    });
    
    // Reduce panel padding when collapsed
    if (animate) {
      panel.style.transition = 'padding 0.3s ease';
    }
    panel.style.paddingBottom = '15px';
  }

  /**
   * Expand a panel with UI state restoration
   */
  expandPanel(panel, animate = true, panelId = null) {
    panel.classList.remove('collapsed');
    
    const indicator = panel.querySelector('.collapse-indicator');
    if (indicator) {
      indicator.style.transform = 'rotate(0deg)';
    }
    
    // Show all children
    const title = panel.querySelector('.group-title');
    const children = Array.from(panel.children).filter(child => child !== title);
    
    children.forEach(child => {
      child.style.display = '';
      
      if (animate) {
        // Force reflow
        void child.offsetHeight;
        
        child.style.transition = 'all 0.3s ease';
        child.style.maxHeight = '1000px';
        child.style.opacity = '1';
        child.style.overflow = '';
        child.style.marginTop = '';
        child.style.marginBottom = '';
        child.style.paddingTop = '';
        child.style.paddingBottom = '';
        
        setTimeout(() => {
          child.style.maxHeight = '';
          child.style.transition = '';
        }, 300);
      }
    });
    
    // Restore panel padding
    if (animate) {
      panel.style.transition = 'padding 0.3s ease';
      setTimeout(() => {
        panel.style.transition = '';
      }, 300);
    }
    panel.style.paddingBottom = '';

    // CRITICAL FIX: Restore UI component state after expansion
    setTimeout(() => {
      this.restoreUIStateForPanel(panel, panelId);
    }, animate ? 350 : 50);
  }

  /**
   * Restore UI state for specific panel types
   */
  restoreUIStateForPanel(panel, panelId) {
    const panelTitle = panel.querySelector('.group-title')?.textContent || '';
    const hasFilterGroupClass = panel.classList.contains('filter-group');
    
    console.log('🔄 Restoring UI state for panel:', panelTitle, 'hasFilterGroupClass:', hasFilterGroupClass);
    
    // Selection Method panel restoration
    if (panelTitle.includes('Selection Method')) {
      const selectionUI = window.glitcherApp?.selectionUI;
      if (selectionUI) {
        // Restore method-specific controls visibility
        const currentMethod = selectionUI.currentSelectionMethod || 'random';
        if (selectionUI.showMethodControls) {
          selectionUI.showMethodControls(currentMethod);
          console.log('✅ Restored selection method controls for:', currentMethod);
        }
        
        // Restore manual mode state
        const manualModeCheckbox = document.getElementById('manual-selection-mode');
        if (manualModeCheckbox?.checked) {
          const toolsContainer = selectionUI.findInteractiveToolsContainer();
          if (toolsContainer) {
            toolsContainer.style.display = 'block';
          }
        }
      }
    }
    
    // Filter Effects panel restoration - check for title text or CSS class
    if (panelTitle.includes('Filter Effects') || hasFilterGroupClass) {
      const app = window.glitcherApp;
      console.log('🎨 Filter panel detected. App:', !!app, 'filterEffect:', app?.filterEffect, 'showFilterControls:', !!app?.showFilterControls);
      
      if (app && app.showFilterControls) {
        // Always call showFilterControls to ensure proper state, even for 'off'
        const currentFilter = app.filterEffect || 'off';
        console.log('🎨 Restoring filter controls for:', currentFilter);
        app.showFilterControls(currentFilter);
        console.log('✅ Filter controls restored successfully for:', currentFilter);
      } else {
        if (!app) {
          console.warn('⚠️ glitcherApp not found on window object');
        } else {
          console.warn('⚠️ showFilterControls method not found on app');
        }
      }
    }
  }

  /**
   * Set up keyboard shortcuts
   */
  setupEventListeners() {
    // Ctrl+Shift+C to collapse/expand all
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        this.toggleAllPanels();
      }
    });
  }

  /**
   * Toggle all panels at once
   */
  toggleAllPanels() {
    const panels = document.querySelectorAll('.control-group');
    const allCollapsed = Array.from(panels).every(p => p.classList.contains('collapsed'));
    
    panels.forEach(panel => {
      const panelId = panel.dataset.panelId;
      if (panelId) {
        if (allCollapsed) {
          this.expandPanel(panel, true, panelId);
          this.panelStates[panelId] = 'expanded';
        } else {
          this.collapsePanel(panel, true);
          this.panelStates[panelId] = 'collapsed';
        }
      }
    });
    
    this.savePanelStates();
    
    // Show notification if enhanced UI is available
    if (window.glitcherApp && window.glitcherApp.selectionUI && window.glitcherApp.selectionUI.showNotification) {
      window.glitcherApp.selectionUI.showNotification(
        allCollapsed ? 'All panels expanded' : 'All panels collapsed',
        'info',
        2000
      );
    }
  }

  /**
   * Reset all panel states
   */
  resetPanelStates() {
    this.panelStates = {};
    this.savePanelStates();
    
    // Expand all panels
    document.querySelectorAll('.control-group.collapsed').forEach(panel => {
      const panelId = panel.dataset.panelId;
      this.expandPanel(panel, true, panelId);
    });
  }
}
