/**
 * Effect Chain UI Component
 * Manages the visual representation of the effect chain
 */
export class EffectChainUI {
  constructor(container, effectChainManager) {
    this.container = container;
    this.chainManager = effectChainManager;
    this.selectedEffect = null;
    this.draggedElement = null;
    this.draggedEffect = null;
    this.performanceMonitoringEnabled = false;
    this.performanceData = new Map();
    this.propertiesPanel = null; // Reference to properties panel for mode sync
    
    this.initializeUI();
    this.bindEvents();
    this.setupContextMenu();
    
    // Listen for chain updates
    this.chainManager.on('chainUpdate', (data) => this.updateChain());
    this.chainManager.on('effectUpdate', (data) => {
      if (data && data.effect) {
        this.updateEffectModule(data.effect);
      }
    });
  }

  initializeUI() {
    this.container.innerHTML = `
      <div class="effect-chain-container">
        <div class="effect-chain-header">
          <h3>Effects Chain</h3>
          <div class="chain-info">
            <div class="stat-item">
              <span>📊</span>
              <span class="stat-value effect-count">0</span>
              <span>effects</span>
            </div>
            <div class="stat-item">
              <span>⚡</span>
              <span class="stat-value enabled-count">0</span>
              <span>active</span>
            </div>
            <div class="stat-item">
              <span>🎯</span>
              <span class="stat-value fps-counter">60</span>
              <span>fps</span>
            </div>
          </div>
          <button class="add-effect-btn" title="Add Effect">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path fill="currentColor" d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2"/>
            </svg>
          </button>
        </div>
        
        <div class="chain-controls">
          <button class="chain-btn primary add-effect-btn-alt">
            <span>➕</span>
            <span>Add Effect</span>
          </button>
          <button class="chain-btn randomize-chain-btn">
            <span>🎲</span>
            <span>Randomize</span>
          </button>
          <button class="chain-btn performance-btn">
            <span>📊</span>
            <span>Stats</span>
          </button>
        </div>
        
        <div class="effect-chain-list" id="effectChainList"></div>
        
        <div class="effect-chain-footer">
          <button class="save-preset-btn">
            <span>💾</span>
            <span>Save</span>
          </button>
          <button class="load-preset-btn">
            <span>📁</span>
            <span>Load</span>
          </button>
          <button class="templates-btn">
            <span>🎯</span>
            <span>Templates</span>
          </button>
          <button class="clear-chain-btn" title="Clear All Effects">
            <span>🗑️</span>
            <span>Clear</span>
          </button>
        </div>
      </div>
    `;
    
    this.chainList = this.container.querySelector('#effectChainList');
    this.setupDragAndDrop();
    this.setupTooltips();
    this.setupPerformanceMonitoring();
  }

  renderEffectModule(effect, index) {
    const div = document.createElement('div');
    div.className = 'effect-module';
    div.dataset.effectId = effect.id;
    div.dataset.index = index;
    div.draggable = true;
    
    // Add classes based on state
    if (!effect.enabled) div.classList.add('disabled');
    if (effect.solo) div.classList.add('soloed');
    if (this.selectedEffect === effect.id) div.classList.add('selected');
    
    // Get effect icon and category
    const effectIcon = this.getEffectIcon(effect);
    const effectCategory = this.getEffectCategory(effect);
    const performanceLevel = this.calculatePerformanceLevel(effect);
    
    div.innerHTML = `
      <div class="performance-indicator ${performanceLevel}" data-tooltip="Performance: ${performanceLevel}" data-tooltip-position="right"></div>
      <div class="effect-header">
        <div class="drag-handle" data-tooltip="Drag to reorder effects in chain">⋮⋮</div>
        <div class="effect-icon">${effectIcon}</div>
        <div class="effect-info">
          <div class="effect-name">${effect.name}</div>
          <div class="effect-type">${effect.mode === 'destructive' ? 'Destructive' : 'Non-Destructive'} • ${effectCategory}</div>
        </div>
        <div class="effect-controls">
          <button class="mode-toggle ${effect.mode}" data-tooltip="${effect.mode === 'destructive' ? 'Destructive: permanently modifies pixels' : 'Non-destructive: applies overlay effect'}" data-tooltip-shortcut="M">
            ${effect.mode === 'destructive' ? 'D' : 'ND'}
          </button>
          <button class="power-toggle ${effect.enabled ? 'active' : ''}" data-tooltip="${effect.enabled ? 'Disable effect (hide from output)' : 'Enable effect'}" data-tooltip-shortcut="E">
            ${effect.enabled ? '⚡' : '⭕'}
          </button>
          <button class="solo-toggle ${effect.solo ? 'active' : ''}" data-tooltip="Solo: show only this effect" data-tooltip-shortcut="S">
            👁️
          </button>
          <button class="delete-btn" data-tooltip="Remove effect from chain" data-tooltip-shortcut="Del">
            🗑️
          </button>
        </div>
      </div>
      <div class="effect-params-preview">
        ${this.getEnhancedParamsPreview(effect)}
      </div>
      ${effect.mode === 'non-destructive' ? `
        <div class="effect-opacity">
          <input type="range" class="opacity-slider" min="0" max="100" 
            value="${(effect.parameters.opacity || 1) * 100}" data-tooltip="Effect blend strength">
          <span class="opacity-value">${Math.round((effect.parameters.opacity || 1) * 100)}%</span>
        </div>
      ` : ''}
      ${this.shouldShowPerformanceStats(effect) ? `
        <div class="performance-stats">
          <span class="perf-stat ${this.getProcessingTimeClass(effect)}">⏱️ ${this.getProcessingTime(effect)}ms</span>
          <span class="perf-stat ${this.getMemoryUsageClass(effect)}">💾 ${this.getMemoryUsage(effect)}MB</span>
        </div>
      ` : ''}
    `;
    
    // Attach tooltips to this effect's elements
    if (window.tooltipManager) {
      setTimeout(() => window.tooltipManager.attachToContainer(div), 50);
    }
    
    return div;
  }

  getParamsPreview(effect) {
    const params = [];
    for (const [key, value] of Object.entries(effect.parameters)) {
      if (key !== 'opacity' && key !== 'blendMode') {
        const displayValue = typeof value === 'number' ? value.toFixed(2) : value;
        params.push(`<span class="param-item">${key}: ${displayValue}</span>`);
      }
    }
    return params.slice(0, 2).join(' • ');
  }

  getEnhancedParamsPreview(effect) {
    if (!effect.parameters) return '<span class="param-item">No parameters</span>';
    
    const params = [];
    let paramCount = 0;
    
    for (const [key, value] of Object.entries(effect.parameters)) {
      if (key !== 'opacity' && key !== 'blendMode' && paramCount < 3) {
        let displayValue;
        if (typeof value === 'number') {
          displayValue = value % 1 === 0 ? value.toString() : value.toFixed(2);
        } else if (typeof value === 'boolean') {
          displayValue = value ? '✓' : '✗';
        } else {
          displayValue = String(value);
        }
        
        const formattedKey = key.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, str => str.toUpperCase());
        params.push(`${formattedKey}: <strong>${displayValue}</strong>`);
        paramCount++;
      }
    }
    
    const paramsHtml = params.join(' • ');
    const totalParams = Object.keys(effect.parameters).length - 2; // Exclude opacity and blendMode
    
    if (totalParams > 3) {
      return `${paramsHtml} • <span style="color: #888;">+${totalParams - 3} more</span>`;
    }
    
    return paramsHtml || '<span class="param-item">No parameters</span>';
  }

  getEffectIcon(effect) {
    const iconMap = {
      'direction': '🧭',
      'spiral': '🌀',
      'slice': '✂️',
      'pixel-sort': '🔀',
      'color': '🎨',
      'pop-art': '🎭',
      'vintage': '📽️',
      'emboss': '🔨',
      'edge-detect': '📐',
      'motion-blur': '💨',
      'vignette': '🌑',
      'halftone': '🔵',
      'cyberpunk': '⚡',
      'artistic': '🖌️',
      'atmospheric': '🌫️',
      'experimental': '🧪',
      'dithering': '🎮'
    };
    
    // Try to find icon by effect type/category
    for (const [key, icon] of Object.entries(iconMap)) {
      if (effect.id?.includes(key) || effect.type?.includes(key) || effect.category?.includes(key)) {
        return icon;
      }
    }
    
    // Default icon based on mode
    return effect.mode === 'destructive' ? '🔥' : '🛡️';
  }

  getEffectCategory(effect) {
    const categoryMap = {
      'direction': 'Movement',
      'spiral': 'Movement',
      'slice': 'Distortion',
      'pixel-sort': 'Distortion',
      'color': 'Color',
      'pop-art': 'Artistic',
      'vintage': 'Film',
      'emboss': 'Surface',
      'edge-detect': 'Analysis',
      'motion-blur': 'Motion',
      'vignette': 'Frame',
      'halftone': 'Pattern',
      'cyberpunk': 'Futuristic',
      'artistic': 'Artistic',
      'atmospheric': 'Environment',
      'experimental': 'Experimental',
      'dithering': 'Pixel'
    };
    
    for (const [key, category] of Object.entries(categoryMap)) {
      if (effect.id?.includes(key) || effect.type?.includes(key)) {
        return category;
      }
    }
    
    return effect.category || 'Effect';
  }

  calculatePerformanceLevel(effect) {
    // Simulate performance calculation based on effect type and parameters
    const heavyEffects = ['pixel-sort', 'atmospheric', 'experimental', 'artistic'];
    const mediumEffects = ['spiral', 'cyberpunk', 'vintage', 'emboss'];
    
    for (const heavy of heavyEffects) {
      if (effect.id?.includes(heavy)) return 'high';
    }
    
    for (const medium of mediumEffects) {
      if (effect.id?.includes(medium)) return 'medium';
    }
    
    return 'low';
  }

  shouldShowPerformanceStats(effect) {
    return this.performanceMonitoringEnabled && effect.enabled;
  }

  getProcessingTime(effect) {
    // Simulate processing time (in real implementation, this would come from actual measurements)
    const baseTime = this.calculatePerformanceLevel(effect) === 'high' ? 12 : 
                    this.calculatePerformanceLevel(effect) === 'medium' ? 6 : 2;
    return baseTime + Math.random() * 3;
  }

  getMemoryUsage(effect) {
    // Simulate memory usage
    const baseMemory = effect.mode === 'non-destructive' ? 8 : 4;
    return (baseMemory + Math.random() * 4).toFixed(1);
  }

  getProcessingTimeClass(effect) {
    const time = this.getProcessingTime(effect);
    return time > 10 ? 'critical' : time > 5 ? 'warning' : 'good';
  }

  getMemoryUsageClass(effect) {
    const memory = parseFloat(this.getMemoryUsage(effect));
    return memory > 10 ? 'critical' : memory > 6 ? 'warning' : 'good';
  }

  setupDragAndDrop() {
    this.chainList.addEventListener('dragstart', (e) => this.handleDragStart(e));
    this.chainList.addEventListener('dragover', (e) => this.handleDragOver(e));
    this.chainList.addEventListener('drop', (e) => this.handleDrop(e));
    this.chainList.addEventListener('dragend', (e) => this.handleDragEnd(e));
  }

  handleDragStart(e) {
    const effectModule = e.target.closest('.effect-module');
    if (effectModule && effectModule.contains(e.target)) {
      this.draggedElement = effectModule;
      this.draggedEffect = effectModule.dataset.effectId;
      effectModule.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', ''); // Firefox compatibility
    }
  }

  handleDragOver(e) {
    e.preventDefault();
    const afterElement = this.getDragAfterElement(this.chainList, e.clientY);
    const dragging = this.chainList.querySelector('.dragging');
    
    if (dragging) {
      if (afterElement == null) {
        this.chainList.appendChild(dragging);
      } else {
        this.chainList.insertBefore(dragging, afterElement);
      }
    }
  }

  handleDrop(e) {
    e.preventDefault();
    if (this.draggedElement) {
      const newIndex = Array.from(this.chainList.children).indexOf(this.draggedElement);
      this.chainManager.moveEffect(this.draggedEffect, newIndex);
    }
  }

  handleDragEnd(e) {
    const effectModule = e.target.closest('.effect-module');
    if (effectModule) {
      effectModule.classList.remove('dragging');
    }
    this.draggedElement = null;
    this.draggedEffect = null;
  }

  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.effect-module:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  bindEvents() {
    // Add effect button
    this.container.querySelector('.add-effect-btn').addEventListener('click', () => {
      this.showAddEffectDialog();
    });

    // Save/Load preset buttons
    this.container.querySelector('.save-preset-btn').addEventListener('click', () => {
      this.savePreset();
    });

    this.container.querySelector('.load-preset-btn').addEventListener('click', () => {
      this.loadPreset();
    });

    // Clear chain button
    this.container.querySelector('.clear-chain-btn').addEventListener('click', () => {
      if (confirm('Clear all effects from the chain?')) {
        this.chainManager.clearChain();
      }
    });

    // Delegate events for effect controls
    this.chainList.addEventListener('click', (e) => {
      const effectModule = e.target.closest('.effect-module');
      if (!effectModule) return;

      const effectId = effectModule.dataset.effectId;
      const effect = this.chainManager.getEffect(effectId);
      if (!effect) return;

      // Mode toggle
      if (e.target.closest('.mode-toggle')) {
        const oldMode = effect.mode;
        const newMode = effect.mode === 'destructive' ? 'non-destructive' : 'destructive';
        effect.mode = newMode;
        this.chainManager.updateEffect(effect);
        
        // Update the mode toggle button immediately
        e.target.textContent = newMode === 'destructive' ? 'D' : 'ND';
        e.target.className = `mode-toggle ${newMode}`;
        
        // Update effect type display
        const typeDisplay = effectModule.querySelector('.effect-type');
        if (typeDisplay) {
          const category = this.getEffectCategory(effect);
          typeDisplay.textContent = `${newMode === 'destructive' ? 'Destructive' : 'Non-Destructive'} • ${category}`;
        }
        
        // **CRITICAL FIX**: Immediately update properties panel if this effect is selected
        if (this.selectedEffect === effectId) {
          // Direct update via reference
          if (this.propertiesPanel && this.propertiesPanel.showEffect) {
            this.propertiesPanel.showEffect(effect);
            console.log('✅ Properties panel updated directly via reference');
          }
          
          // Also try via global window reference
          if (window.propertiesPanel && window.propertiesPanel.showEffect) {
            window.propertiesPanel.showEffect(effect);
            console.log('✅ Properties panel updated via window reference');
          }
          
          // And via studio manager
          if (window.glitcherApp?.effectStudioManager?.components?.propertiesPanel?.showEffect) {
            window.glitcherApp.effectStudioManager.components.propertiesPanel.showEffect(effect);
            console.log('✅ Properties panel updated via studio manager');
          }
        }
        
        // Dispatch mode change event for synchronization
        const modeChangeEvent = new CustomEvent('effectModeChanged', {
          detail: {
            effect: effect,
            oldMode: oldMode,
            newMode: newMode,
            source: 'effectChain',
            effectId: effectId
          }
        });
        document.dispatchEvent(modeChangeEvent);
        
        // Show confirmation notification
        this.showNotification(`Switched to ${newMode} mode`, 'success');
      }
      // Power toggle
      else if (e.target.closest('.power-toggle')) {
        effect.enabled = !effect.enabled;
        this.chainManager.updateEffect(effect);
        this.showNotification(`Effect ${effect.enabled ? 'enabled' : 'disabled'}`, effect.enabled ? 'success' : 'warning');
      }
      // Solo toggle
      else if (e.target.closest('.solo-toggle')) {
        // If this effect is being soloed, unsolo all others
        if (!effect.solo) {
          this.chainManager.chain.forEach(e => e.solo = false);
        }
        effect.solo = !effect.solo;
        this.chainManager.updateEffect(effect);
        this.showNotification(effect.solo ? 'Effect soloed' : 'Solo disabled', 'info');
      }
      // Delete button
      else if (e.target.closest('.delete-btn')) {
        this.showDeleteConfirmation(effect);
      }
      // Select effect for properties panel
      else {
        this.selectEffect(effectId);
        
        // Dispatch effect selection event for synchronization
        const selectionEvent = new CustomEvent('effectSelected', {
          detail: {
            effectId: effectId,
            effect: effect
          }
        });
        document.dispatchEvent(selectionEvent);
      }
    });

    // Additional control events
    this.container.querySelector('.randomize-chain-btn')?.addEventListener('click', () => {
      this.randomizeChain();
    });

    this.container.querySelector('.performance-btn')?.addEventListener('click', () => {
      this.togglePerformanceMonitoring();
    });

    this.container.querySelector('.templates-btn')?.addEventListener('click', () => {
      this.showTemplatesDialog();
    });

    this.container.querySelector('.add-effect-btn-alt')?.addEventListener('click', () => {
      this.showAddEffectDialog();
    });

    // Opacity slider events
    this.chainList.addEventListener('input', (e) => {
      if (e.target.classList.contains('opacity-slider')) {
        const effectModule = e.target.closest('.effect-module');
        const effectId = effectModule.dataset.effectId;
        const effect = this.chainManager.getEffect(effectId);
        if (effect) {
          effect.parameters.opacity = e.target.value / 100;
          e.target.nextElementSibling.textContent = `${e.target.value}%`;
          this.chainManager.updateEffect(effect);
        }
      }
    });
  }

  selectEffect(effectId) {
    this.selectedEffect = effectId;
    
    // Update visual selection
    this.chainList.querySelectorAll('.effect-module').forEach(module => {
      module.classList.toggle('selected', module.dataset.effectId === effectId);
    });
    
    // Notify through chain manager
    this.chainManager.selectEffect(effectId);
  }

  updateChain() {
    const effects = this.chainManager.chain;
    
    if (effects.length === 0) {
      this.chainList.innerHTML = `
        <div class="empty-chain-message">
          <div class="empty-icon">🎨</div>
          <div class="empty-text">No effects in chain</div>
          <div class="empty-hint">Click "Add Effect" or drag from library</div>
        </div>
        
        <div class="quick-actions">
          <div class="quick-actions-title">Quick Start</div>
          <div class="quick-action-grid">
            <button class="quick-action-btn" data-action="add-vintage">📽️ Add Vintage</button>
            <button class="quick-action-btn" data-action="add-glitch">⚡ Add Glitch</button>
            <button class="quick-action-btn" data-action="load-template">🎯 Load Template</button>
            <button class="quick-action-btn" data-action="import-preset">📁 Import Preset</button>
          </div>
        </div>
      `;
      
      // Add quick action handlers
      this.chainList.querySelectorAll('.quick-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const action = e.target.dataset.action;
          this.handleQuickAction(action);
        });
      });
    } else {
      this.chainList.innerHTML = '';
      effects.forEach((effect, index) => {
        const element = this.renderEffectModule(effect, index);
        this.chainList.appendChild(element);
      });
    }
    
    this.updateChainInfo();
  }

  updateEffectModule(effect) {
    const module = this.chainList.querySelector(`[data-effect-id="${effect.id}"]`);
    if (module) {
      const index = parseInt(module.dataset.index);
      const newModule = this.renderEffectModule(effect, index);
      module.replaceWith(newModule);
    }
  }

  updateChainInfo() {
    const total = this.chainManager.chain.length;
    const active = this.chainManager.chain.filter(e => e.enabled).length;
    
    this.container.querySelector('.effect-count').textContent = 
      `${total} effect${total !== 1 ? 's' : ''}`;
    this.container.querySelector('.enabled-count').textContent = 
      `${active} active`;
  }

  showAddEffectDialog() {
    // This will be connected to the EffectLibraryUI
    const event = new CustomEvent('showEffectLibrary');
    document.dispatchEvent(event);
  }

  savePreset() {
    const name = prompt('Enter preset name:');
    if (name) {
      const event = new CustomEvent('savePreset', { 
        detail: { name } 
      });
      document.dispatchEvent(event);
    }
  }

  loadPreset() {
    const event = new CustomEvent('loadPreset');
    document.dispatchEvent(event);
  }

  // Enhanced notification system
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `effect-notification ${type}`;
    notification.textContent = message;
    
    // Style the notification
    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '8px 16px',
      borderRadius: '6px',
      fontSize: '12px',
      zIndex: '10001',
      color: 'white',
      cursor: 'pointer',
      opacity: '0',
      transform: 'translateX(100%)',
      transition: 'all 0.3s ease',
      backdropFilter: 'blur(10px)'
    });
    
    // Type-specific styling
    const typeColors = {
      'info': 'rgba(78, 205, 196, 0.9)',
      'success': 'rgba(102, 187, 106, 0.9)',
      'warning': 'rgba(255, 167, 38, 0.9)',
      'error': 'rgba(255, 107, 107, 0.9)'
    };
    
    notification.style.background = typeColors[type] || typeColors.info;
    
    document.body.appendChild(notification);
    
    // Animate in
    requestAnimationFrame(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0)';
    });
    
    // Remove after delay
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Enhanced delete confirmation
  showDeleteConfirmation(effect) {
    const modal = document.createElement('div');
    modal.className = 'delete-confirmation-modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <h3>Delete Effect</h3>
        <p>Are you sure you want to delete "<strong>${effect.name}</strong>" from the chain?</p>
        <div class="modal-actions">
          <button class="btn-cancel">Cancel</button>
          <button class="btn-delete">Delete</button>
        </div>
      </div>
    `;
    
    // Style the modal
    Object.assign(modal.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      zIndex: '10000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    });
    
    const backdrop = modal.querySelector('.modal-backdrop');
    Object.assign(backdrop.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(5px)'
    });
    
    const content = modal.querySelector('.modal-content');
    Object.assign(content.style, {
      background: '#2a2a40',
      borderRadius: '12px',
      padding: '24px',
      maxWidth: '400px',
      position: 'relative',
      border: '1px solid rgba(255,255,255,0.1)'
    });
    
    document.body.appendChild(modal);
    
    // Event handlers
    modal.querySelector('.btn-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('.btn-delete').addEventListener('click', () => {
      this.chainManager.removeEffect(effect.id);
      this.showNotification(`"${effect.name}" removed from chain`, 'success');
      modal.remove();
    });
    backdrop.addEventListener('click', () => modal.remove());
  }

  // Performance monitoring
  setupPerformanceMonitoring() {
    this.performanceMonitoringEnabled = false;
    this.performanceData = new Map();
  }

  togglePerformanceMonitoring() {
    this.performanceMonitoringEnabled = !this.performanceMonitoringEnabled;
    const btn = this.container.querySelector('.performance-btn');
    if (btn) {
      btn.classList.toggle('active', this.performanceMonitoringEnabled);
    }
    this.showNotification(
      `Performance monitoring ${this.performanceMonitoringEnabled ? 'enabled' : 'disabled'}`,
      'info'
    );
    this.updateChain(); // Refresh to show/hide performance stats
  }

  // Chain randomization
  randomizeChain() {
    if (this.chainManager.chain.length === 0) {
      this.showNotification('No effects to randomize', 'warning');
      return;
    }
    
    this.chainManager.chain.forEach(effect => {
      if (effect.parameters) {
        Object.keys(effect.parameters).forEach(key => {
          if (key !== 'opacity' && key !== 'blendMode') {
            const param = effect.parameters[key];
            if (typeof param === 'number') {
              // Randomize numeric parameters within reasonable ranges
              effect.parameters[key] = Math.random() * 100;
            } else if (typeof param === 'boolean') {
              effect.parameters[key] = Math.random() > 0.5;
            }
          }
        });
      }
    });
    
    this.chainManager.updateChain();
    this.showNotification('Chain parameters randomized', 'success');
  }

  // Templates dialog
  showTemplatesDialog() {
    const templates = [
      { name: 'Vintage Film', effects: ['vintage', 'vignette', 'halftone'] },
      { name: 'Cyberpunk Glitch', effects: ['cyberpunk-neon', 'slice', 'color'] },
      { name: 'Artistic Style', effects: ['artistic-oil_painting', 'emboss'] },
      { name: 'Heavy Distortion', effects: ['pixel-sort', 'spiral', 'direction'] }
    ];
    
    const modal = document.createElement('div');
    modal.className = 'templates-modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <h3>Effect Templates</h3>
        <div class="templates-grid">
          ${templates.map(template => `
            <div class="template-card" data-template="${template.name}">
              <h4>${template.name}</h4>
              <p>${template.effects.join(', ')}</p>
              <button class="apply-template-btn">Apply Template</button>
            </div>
          `).join('')}
        </div>
        <button class="modal-close">✕</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event handlers
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());
    
    modal.querySelectorAll('.apply-template-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const templateName = e.target.closest('.template-card').dataset.template;
        this.applyTemplate(templateName);
        modal.remove();
      });
    });
  }

  applyTemplate(templateName) {
    this.showNotification(`Applying ${templateName} template...`, 'info');
    // In real implementation, this would load the actual template
    // For now, just show a notification
    setTimeout(() => {
      this.showNotification(`${templateName} template applied`, 'success');
    }, 1000);
  }

  // Tooltip system
  setupTooltips() {
    let tooltip = null;
    
    this.container.addEventListener('mouseenter', (e) => {
      const target = e.target.closest('[title]');
      if (target && target.title) {
        tooltip = document.createElement('div');
        tooltip.className = 'effect-tooltip';
        tooltip.textContent = target.title;
        document.body.appendChild(tooltip);
        
        const updateTooltipPosition = (event) => {
          const rect = target.getBoundingClientRect();
          tooltip.style.left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + 'px';
          tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + 'px';
        };
        
        updateTooltipPosition(e);
        tooltip.classList.add('show');
        
        target.addEventListener('mouseleave', () => {
          if (tooltip) {
            tooltip.classList.remove('show');
            setTimeout(() => {
              if (tooltip) {
                tooltip.remove();
                tooltip = null;
              }
            }, 200);
          }
        }, { once: true });
      }
    }, true);
  }

  // Update chain info with enhanced statistics
  updateChainInfo() {
    const total = this.chainManager.chain.length;
    const active = this.chainManager.chain.filter(e => e.enabled).length;
    const destructive = this.chainManager.chain.filter(e => e.mode === 'destructive' && e.enabled).length;
    const nonDestructive = this.chainManager.chain.filter(e => e.mode === 'non-destructive' && e.enabled).length;
    
    const effectCountEl = this.container.querySelector('.effect-count');
    const enabledCountEl = this.container.querySelector('.enabled-count');
    const fpsCounterEl = this.container.querySelector('.fps-counter');
    
    if (effectCountEl) effectCountEl.textContent = total;
    if (enabledCountEl) enabledCountEl.textContent = active;
    
    // Simulate FPS calculation based on chain complexity
    if (fpsCounterEl) {
      const complexity = destructive * 2 + nonDestructive * 1.5;
      const estimatedFps = Math.max(15, Math.min(60, 60 - complexity * 3));
      fpsCounterEl.textContent = Math.round(estimatedFps);
      
      // Color-code FPS
      fpsCounterEl.style.color = estimatedFps > 45 ? '#66bb6a' : 
                                estimatedFps > 25 ? '#ffa726' : '#ff6b6b';
    }
    
    // Add chain statistics if performance monitoring is enabled
    if (this.performanceMonitoringEnabled) {
      this.updateChainStatistics();
    }
  }

  updateChainStatistics() {
    let statsPanel = this.container.querySelector('.chain-statistics');
    if (!statsPanel) {
      statsPanel = document.createElement('div');
      statsPanel.className = 'chain-statistics';
      this.chainList.appendChild(statsPanel);
    }
    
    const totalProcessingTime = this.chainManager.chain
      .filter(e => e.enabled)
      .reduce((sum, effect) => sum + this.getProcessingTime(effect), 0);
    
    const totalMemoryUsage = this.chainManager.chain
      .filter(e => e.enabled)
      .reduce((sum, effect) => sum + parseFloat(this.getMemoryUsage(effect)), 0);
    
    statsPanel.innerHTML = `
      <h4>Chain Statistics</h4>
      <div class="chain-stat-row">
        <span class="chain-stat-label">Processing Time:</span>
        <span class="chain-stat-value">${totalProcessingTime.toFixed(1)}ms</span>
      </div>
      <div class="chain-stat-row">
        <span class="chain-stat-label">Memory Usage:</span>
        <span class="chain-stat-value">${totalMemoryUsage.toFixed(1)}MB</span>
      </div>
      <div class="chain-stat-row">
        <span class="chain-stat-label">Efficiency:</span>
        <span class="chain-stat-value">${this.calculateEfficiency()}%</span>
      </div>
    `;
  }

  calculateEfficiency() {
    const enabledEffects = this.chainManager.chain.filter(e => e.enabled);
    if (enabledEffects.length === 0) return 100;
    
    const destructiveCount = enabledEffects.filter(e => e.mode === 'destructive').length;
    const totalCount = enabledEffects.length;
    
    // Higher percentage of destructive effects = higher efficiency
    return Math.round((destructiveCount / totalCount) * 100);
  }

  // Public methods for external use
  getSelectedEffect() {
    return this.selectedEffect;
  }

  refresh() {
    this.updateChain();
  }

  // Set reference to properties panel for mode synchronization
  setPropertiesPanel(propertiesPanel) {
    this.propertiesPanel = propertiesPanel;
  }

  // Handle quick actions from empty state
  handleQuickAction(action) {
    switch (action) {
      case 'add-vintage':
        this.showNotification('Adding vintage effect...', 'info');
        // In real implementation, this would add a vintage effect
        const event = new CustomEvent('addEffect', { 
          detail: { effectType: 'vintage' } 
        });
        document.dispatchEvent(event);
        break;
        
      case 'add-glitch':
        this.showNotification('Adding glitch effect...', 'info');
        const glitchEvent = new CustomEvent('addEffect', { 
          detail: { effectType: 'spiral' } 
        });
        document.dispatchEvent(glitchEvent);
        break;
        
      case 'load-template':
        this.showTemplatesDialog();
        break;
        
      case 'import-preset':
        this.loadPreset();
        break;
        
      default:
        this.showNotification('Action not implemented yet', 'warning');
    }
  }

  // Keyboard shortcuts
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Only handle shortcuts when effects chain is focused
      if (!this.container.contains(document.activeElement)) return;
      
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (this.selectedEffect) {
            e.preventDefault();
            const effect = this.chainManager.getEffect(this.selectedEffect);
            if (effect) {
              this.showDeleteConfirmation(effect);
            }
          }
          break;
          
        case 'Space':
          if (this.selectedEffect) {
            e.preventDefault();
            const effect = this.chainManager.getEffect(this.selectedEffect);
            if (effect) {
              effect.enabled = !effect.enabled;
              this.chainManager.updateEffect(effect);
              this.showNotification(
                `Effect ${effect.enabled ? 'enabled' : 'disabled'}`, 
                effect.enabled ? 'success' : 'warning'
              );
            }
          }
          break;
          
        case 'ArrowUp':
          if (this.selectedEffect && e.shiftKey) {
            e.preventDefault();
            this.moveEffectUp(this.selectedEffect);
          }
          break;
          
        case 'ArrowDown':
          if (this.selectedEffect && e.shiftKey) {
            e.preventDefault();
            this.moveEffectDown(this.selectedEffect);
          }
          break;
          
        case 'm':
        case 'M':
          if (this.selectedEffect) {
            e.preventDefault();
            const effect = this.chainManager.getEffect(this.selectedEffect);
            if (effect) {
              effect.mode = effect.mode === 'destructive' ? 'non-destructive' : 'destructive';
              this.chainManager.updateEffect(effect);
              this.showNotification(`Switched to ${effect.mode} mode`, 'info');
            }
          }
          break;
          
        case 's':
        case 'S':
          if (this.selectedEffect) {
            e.preventDefault();
            const effect = this.chainManager.getEffect(this.selectedEffect);
            if (effect) {
              // Unsolo all others first
              this.chainManager.chain.forEach(e => e.solo = false);
              effect.solo = !effect.solo;
              this.chainManager.updateEffect(effect);
              this.showNotification(effect.solo ? 'Effect soloed' : 'Solo disabled', 'info');
            }
          }
          break;
      }
    });
  }

  moveEffectUp(effectId) {
    const currentIndex = this.chainManager.chain.findIndex(e => e.id === effectId);
    if (currentIndex > 0) {
      this.chainManager.moveEffect(effectId, currentIndex - 1);
      this.showNotification('Effect moved up', 'success');
    }
  }

  moveEffectDown(effectId) {
    const currentIndex = this.chainManager.chain.findIndex(e => e.id === effectId);
    if (currentIndex < this.chainManager.chain.length - 1) {
      this.chainManager.moveEffect(effectId, currentIndex + 1);
      this.showNotification('Effect moved down', 'success');
    }
  }

  // Context menu for right-click actions
  setupContextMenu() {
    this.chainList.addEventListener('contextmenu', (e) => {
      const effectModule = e.target.closest('.effect-module');
      if (effectModule) {
        e.preventDefault();
        
        const effectId = effectModule.dataset.effectId;
        const effect = this.chainManager.getEffect(effectId);
        if (!effect) return;
        
        this.showContextMenu(e.clientX, e.clientY, effect);
      }
    });
  }

  showContextMenu(x, y, effect) {
    // Remove existing context menu
    const existingMenu = document.querySelector('.effect-context-menu');
    if (existingMenu) existingMenu.remove();
    
    const menu = document.createElement('div');
    menu.className = 'effect-context-menu';
    menu.innerHTML = `
      <div class="context-menu-item" data-action="toggle-mode">
        <span>${effect.mode === 'destructive' ? '🛡️' : '🔥'}</span>
        <span>Switch to ${effect.mode === 'destructive' ? 'Non-Destructive' : 'Destructive'}</span>
      </div>
      <div class="context-menu-item" data-action="duplicate">
        <span>📋</span>
        <span>Duplicate Effect</span>
      </div>
      <div class="context-menu-item" data-action="reset-params">
        <span>🔄</span>
        <span>Reset Parameters</span>
      </div>
      <div class="context-menu-item" data-action="randomize-params">
        <span>🎲</span>
        <span>Randomize Parameters</span>
      </div>
      <div class="context-menu-separator"></div>
      <div class="context-menu-item" data-action="move-to-top">
        <span>⬆️</span>
        <span>Move to Top</span>
      </div>
      <div class="context-menu-item" data-action="move-to-bottom">
        <span>⬇️</span>
        <span>Move to Bottom</span>
      </div>
      <div class="context-menu-separator"></div>
      <div class="context-menu-item danger" data-action="delete">
        <span>🗑️</span>
        <span>Delete Effect</span>
      </div>
    `;
    
    // Style the context menu
    Object.assign(menu.style, {
      position: 'fixed',
      left: x + 'px',
      top: y + 'px',
      background: 'linear-gradient(145deg, #2a2a40, #1f1f35)',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '8px',
      padding: '8px 0',
      boxShadow: '0 8px 25px rgba(0,0,0,0.4)',
      zIndex: '10000',
      minWidth: '180px',
      color: 'white',
      fontSize: '14px'
    });
    
    document.body.appendChild(menu);
    
    // Position adjustment if menu goes off screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (y - rect.height) + 'px';
    }
    
    // Handle menu actions
    menu.addEventListener('click', (e) => {
      const action = e.target.closest('.context-menu-item')?.dataset.action;
      if (action) {
        this.handleContextMenuAction(action, effect);
        menu.remove();
      }
    });
    
    // Remove menu on outside click
    setTimeout(() => {
      document.addEventListener('click', () => menu.remove(), { once: true });
    }, 100);
  }

  handleContextMenuAction(action, effect) {
    switch (action) {
      case 'toggle-mode':
        effect.mode = effect.mode === 'destructive' ? 'non-destructive' : 'destructive';
        this.chainManager.updateEffect(effect);
        this.showNotification(`Switched to ${effect.mode} mode`, 'info');
        break;
        
      case 'duplicate':
        // Create a copy of the effect
        const duplicatedEffect = {
          ...effect,
          id: effect.id + '_copy_' + Date.now(),
          name: effect.name + ' Copy',
          parameters: { ...effect.parameters }
        };
        this.chainManager.addEffect(duplicatedEffect);
        this.showNotification('Effect duplicated', 'success');
        break;
        
      case 'reset-params':
        // Reset parameters to default values
        if (effect.defaultParameters) {
          effect.parameters = { ...effect.defaultParameters };
          this.chainManager.updateEffect(effect);
          this.showNotification('Parameters reset to defaults', 'success');
        } else {
          this.showNotification('No default parameters available', 'warning');
        }
        break;
        
      case 'randomize-params':
        // Randomize effect parameters
        this.randomizeEffectParameters(effect);
        this.chainManager.updateEffect(effect);
        this.showNotification('Parameters randomized', 'success');
        break;
        
      case 'move-to-top':
        this.chainManager.moveEffect(effect.id, 0);
        this.showNotification('Effect moved to top', 'success');
        break;
        
      case 'move-to-bottom':
        this.chainManager.moveEffect(effect.id, this.chainManager.chain.length - 1);
        this.showNotification('Effect moved to bottom', 'success');
        break;
        
      case 'delete':
        this.showDeleteConfirmation(effect);
        break;
    }
  }

  randomizeEffectParameters(effect) {
    if (!effect.parameters) return;
    
    Object.keys(effect.parameters).forEach(key => {
      if (key !== 'opacity' && key !== 'blendMode') {
        const param = effect.parameters[key];
        if (typeof param === 'number') {
          // Randomize within a reasonable range
          const range = Math.max(Math.abs(param), 50);
          effect.parameters[key] = (Math.random() - 0.5) * range * 2;
        } else if (typeof param === 'boolean') {
          effect.parameters[key] = Math.random() > 0.5;
        }
      }
    });
  }
}