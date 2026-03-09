// Studio Integration Script
// This script ensures the studio mode toggle is properly integrated and handles state synchronization

/**
 * Add CSS to ensure proper visibility toggling
 */
function addIntegrationStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* Ensure proper toggling between modes */
    body:not(.studio-mode) .glitcher-studio {
      display: none !important;
    }
    
    body.studio-mode .studio-container {
      display: none !important;
    }
    
    body.studio-mode .glitcher-studio {
      display: grid !important;
    }
    
    /* Ensure canvas is visible in both modes */
    #canvas {
      display: block !important;
    }
    
    /* Canvas placeholder handling */
    body.studio-mode #canvas-placeholder {
      display: none !important;
    }
    
    /* Studio mode toggle button styling */
    #studio-mode-toggle {
      position: relative;
      overflow: hidden;
    }
    
    #studio-mode-toggle::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
      transition: left 0.5s ease;
    }
    
    #studio-mode-toggle:hover::before {
      left: 100%;
    }
    
    #studio-mode-toggle.active {
      background: linear-gradient(145deg, #5ed3d0, #4ecdc4) !important;
      color: #1a1a2e !important;
    }
    
    /* Animations for mode switching */
    @keyframes fadeInStudio {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .glitcher-studio {
      animation: fadeInStudio 0.3s ease-out;
    }
    
    /* Notification styles */
    .studio-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10001;
      color: white;
      cursor: pointer;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    
    .studio-notification.show {
      opacity: 1;
      transform: translateX(0);
    }
    
    .studio-notification.info {
      background: rgba(78, 205, 196, 0.9);
      border-left: 4px solid #4ecdc4;
    }
    
    .studio-notification.success {
      background: rgba(102, 187, 106, 0.9);
      border-left: 4px solid #66bb6a;
    }
    
    .studio-notification.warning {
      background: rgba(255, 167, 38, 0.9);
      border-left: 4px solid #ffa726;
    }
    
    .studio-notification.error {
      background: rgba(255, 107, 107, 0.9);
      border-left: 4px solid #ff6b6b;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Enhance the toggleStudioMode function in main.js
 */
function enhanceStudioToggle() {
  console.log('🔧 Enhancing studio toggle...');
  
  // Wait for the app to be initialized
  const checkApp = setInterval(() => {
    if (window.glitcherApp && window.glitcherApp.effectStudioManager) {
      clearInterval(checkApp);
      console.log('✅ App ready, enhancing toggle function');
      
      // Get reference to the original toggle function
      const originalToggle = window.glitcherApp.toggleStudioMode.bind(window.glitcherApp);
      
      // Enhanced toggle function
      window.glitcherApp.toggleStudioMode = function() {
        console.log('🎛️ Toggling studio mode...');
        
        // Call original toggle
        originalToggle();
        
        // Ensure studio manager is properly initialized
        if (this.studioMode && this.effectStudioManager) {
          // Give DOM time to update before initializing components
          setTimeout(() => {
            this.effectStudioManager.initializeComponents();
            
            // Migrate settings if chain is empty
            if (this.effectChainManager && this.effectChainManager.chain.length === 0) {
              this.migrateClassicSettingsToChain();
            }
            
            // Refresh UI
            this.effectStudioManager.refreshUI();
          }, 100);
        }
        
        // Update UI elements
        const toggleBtn = document.getElementById('studio-mode-toggle');
        if (toggleBtn) {
          toggleBtn.classList.toggle('active', this.studioMode);
          const span = toggleBtn.querySelector('span');
          if (span) {
            span.textContent = this.studioMode ? 
              '🎨 Switch to Classic Mode' : 
              '🎛️ Switch to Studio Mode';
          }
        }
        
        // Update status
        const statusElement = document.getElementById('current-mode-status');
        if (statusElement) {
          statusElement.textContent = this.studioMode ? 'Studio Mode' : 'Classic Mode';
        }
        
        // Show notification
        const message = this.studioMode ? 
          'Switched to Studio Mode' : 
          'Switched to Classic Mode';
        showNotification(message, 'info');
        
        // Save preference
        localStorage.setItem('glitcherStudioMode', this.studioMode);
        
        // Ensure proper canvas visibility
        const canvas = document.getElementById('canvas');
        if (canvas) {
          canvas.style.display = 'block';
        }
      };
      
      // DISABLED: Don't auto-restore studio mode - start in Classic mode
      // const savedMode = localStorage.getItem('glitcherStudioMode') === 'true';
      // if (savedMode) {
      //   console.log('🔄 Restoring studio mode from preferences');
      //   // Wait for full initialization before restoring
      //   setTimeout(() => {
      //     window.glitcherApp.toggleStudioMode();
      //   }, 500);
      // }
      console.log('✅ Starting in Classic Mode by default');
    }
  }, 100);
}

/**
 * Show notification helper
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `studio-notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Animate in
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });
  
  // Remove after delay
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Add keyboard shortcut handler
 */
function addKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Shift + S: Toggle Studio Mode
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      if (window.glitcherApp && window.glitcherApp.toggleStudioMode) {
        window.glitcherApp.toggleStudioMode();
      }
    }
    
    // Escape: Exit studio mode
    if (e.key === 'Escape' && window.glitcherApp && window.glitcherApp.studioMode) {
      window.glitcherApp.toggleStudioMode();
    }
  });
}

/**
 * Fix canvas placeholder visibility
 */
function fixCanvasPlaceholder() {
  // Monitor for canvas visibility changes
  const observer = new MutationObserver(() => {
    const canvas = document.getElementById('canvas');
    const placeholder = document.getElementById('canvas-placeholder');
    
    if (canvas && placeholder) {
      // Hide placeholder when canvas has content
      if (canvas.width > 0 && canvas.height > 0) {
        placeholder.style.display = 'none';
      }
    }
  });
  
  const canvas = document.getElementById('canvas');
  if (canvas) {
    observer.observe(canvas, { attributes: true, attributeFilter: ['width', 'height'] });
  }
}

/**
 * Initialize state synchronization
 */
function initializeStateSynchronization() {
  // Ensure effect processing uses the same state in both modes
  setInterval(() => {
    if (window.glitcherApp) {
      // Sync animation state
      const playBtn = document.getElementById('studioPlayBtn');
      if (playBtn) {
        playBtn.textContent = window.glitcherApp.isPaused ? '▶️' : '⏸️';
      }
      
      // Sync effect count
      if (window.glitcherApp.effectStudioManager) {
        window.glitcherApp.effectStudioManager.updateEffectCount();
      }
    }
  }, 500);
}

/**
 * Initialize the integration
 */
function initializeIntegration() {
  console.log('🚀 Initializing Studio Integration...');
  
  // Add integration styles
  addIntegrationStyles();
  
  // Enhance studio toggle
  enhanceStudioToggle();
  
  // Add keyboard shortcuts
  addKeyboardShortcuts();
  
  // Fix canvas placeholder
  fixCanvasPlaceholder();
  
  // Initialize state synchronization
  initializeStateSynchronization();
  
  // Add welcome message
  setTimeout(() => {
    if (!localStorage.getItem('glitcherStudioWelcomeShown')) {
      showNotification('🎛️ Studio Mode Available! Press Ctrl+Shift+S to toggle', 'info');
      localStorage.setItem('glitcherStudioWelcomeShown', 'true');
    }
  }, 2000);
  
  console.log('✅ Studio Integration Complete!');
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeIntegration);
} else {
  initializeIntegration();
}

// Export for debugging
window.studioIntegration = {
  toggleStudioMode: () => window.glitcherApp?.toggleStudioMode(),
  getStudioState: () => window.glitcherApp?.studioMode,
  showNotification: showNotification,
  refreshStudio: () => {
    if (window.glitcherApp?.effectStudioManager) {
      window.glitcherApp.effectStudioManager.refreshUI();
    }
  }
};