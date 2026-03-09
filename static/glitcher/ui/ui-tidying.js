/**
 * UI Tidying Enhancements
 * Adds icon-based mode toggle button to Studio Mode
 */

(function() {
  'use strict';

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Add mode toggle icon button when in Studio Mode
    addModeToggleIcon();
    
    // Watch for mode changes
    observeModeChanges();
  }

  function addModeToggleIcon() {
    // Check if we're in Studio Mode
    const isStudioMode = document.body.classList.contains('studio-mode');
    
    if (!isStudioMode) {
      return; // Only add in Studio Mode
    }

    // Check if button already exists
    if (document.querySelector('.mode-toggle-icon-button')) {
      return;
    }

    // Create the mode toggle icon button
    const modeToggleBtn = document.createElement('button');
    modeToggleBtn.className = 'mode-toggle-icon-button';
    modeToggleBtn.title = 'Switch to Classic Mode';
    modeToggleBtn.innerHTML = '🔁';
    
    // Add click handler to toggle mode
    modeToggleBtn.addEventListener('click', () => {
      // Trigger the existing studio mode toggle
      const studioToggle = document.getElementById('studio-mode-toggle');
      if (studioToggle) {
        studioToggle.click();
      } else {
        // Fallback: toggle body class directly
        document.body.classList.remove('studio-mode');
      }
    });

    // Add to document
    document.body.appendChild(modeToggleBtn);
  }

  function observeModeChanges() {
    // Create a MutationObserver to watch for mode changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const isStudioMode = document.body.classList.contains('studio-mode');
          const existingButton = document.querySelector('.mode-toggle-icon-button');
          
          if (isStudioMode && !existingButton) {
            addModeToggleIcon();
          } else if (!isStudioMode && existingButton) {
            existingButton.remove();
          }
        }
      });
    });

    // Start observing
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  // Hide old Studio/Classic text buttons if they exist
  function hideOldButtons() {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      .header-controls .view-mode-btn {
        display: none !important;
      }
    `;
    document.head.appendChild(styleSheet);
  }

  hideOldButtons();

})();
