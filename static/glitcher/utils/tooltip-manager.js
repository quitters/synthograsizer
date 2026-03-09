/**
 * Tooltip Manager
 * Creates custom, unobtrusive tooltips with better UX than native browser tooltips
 */

import { createLogger } from './logger.js';

const logger = createLogger('TooltipManager');

export class TooltipManager {
    constructor(options = {}) {
        this.options = {
            delay: options.delay || 700,           // Delay before showing (ms)
            fadeInDuration: options.fadeInDuration || 200,
            fadeOutDuration: options.fadeOutDuration || 150,
            offset: options.offset || 8,           // Distance from element
            maxWidth: options.maxWidth || 250,
            className: options.className || 'custom-tooltip'
        };
        
        this.currentTooltip = null;
        this.showTimeout = null;
        this.hideTimeout = null;
        this.isEnabled = true;
        
        this.init();
    }
    
    init() {
        // Create tooltip container
        this.tooltipElement = document.createElement('div');
        this.tooltipElement.className = this.options.className;
        this.tooltipElement.style.cssText = `
            position: fixed;
            z-index: 10000;
            padding: 8px 12px;
            background: rgba(40, 40, 55, 0.98);
            color: #fff;
            font-size: 13px;
            line-height: 1.4;
            border-radius: 6px;
            pointer-events: none;
            opacity: 0;
            transition: opacity ${this.options.fadeInDuration}ms ease;
            max-width: ${this.options.maxWidth}px;
            white-space: normal;
            word-wrap: break-word;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3),
                        0 0 0 1px rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
        `;
        document.body.appendChild(this.tooltipElement);
        
        logger.debug('Tooltip manager initialized');
    }
    
    /**
     * Enable tooltips for elements with data-tooltip attribute
     * @param {HTMLElement} container - Container to search for tooltip elements
     */
    attachToContainer(container = document.body) {
        const elements = container.querySelectorAll('[data-tooltip]');
        
        elements.forEach(element => {
            // Remove native title attribute if present
            if (element.hasAttribute('title')) {
                element.setAttribute('data-tooltip', element.getAttribute('title'));
                element.removeAttribute('title');
            }
            
            this.attachToElement(element);
        });
        
        logger.debug(`Attached tooltips to ${elements.length} elements`);
    }
    
    /**
     * Attach tooltip to a specific element
     */
    attachToElement(element) {
        const showHandler = (e) => {
            if (!this.isEnabled) return;
            
            const tooltipText = element.getAttribute('data-tooltip');
            const tooltipShortcut = element.getAttribute('data-tooltip-shortcut');
            const tooltipPosition = element.getAttribute('data-tooltip-position') || 'top';
            
            if (!tooltipText) return;
            
            // Clear any existing timeouts
            this.clearTimeouts();
            
            // Show tooltip after delay
            this.showTimeout = setTimeout(() => {
                this.show(tooltipText, element, tooltipPosition, tooltipShortcut);
            }, this.options.delay);
        };
        
        const hideHandler = () => {
            this.clearTimeouts();
            this.hide();
        };
        
        element.addEventListener('mouseenter', showHandler);
        element.addEventListener('mouseleave', hideHandler);
        element.addEventListener('mousedown', hideHandler); // Hide on click
        
        // Store handlers for cleanup if needed
        element._tooltipHandlers = { showHandler, hideHandler };
    }
    
    /**
     * Show tooltip
     */
    show(text, targetElement, position = 'top', shortcut = null) {
        if (!this.tooltipElement || !text) return;
        
        // Build tooltip content
        let content = `<div class="tooltip-text">${text}</div>`;
        if (shortcut) {
            content += `<div class="tooltip-shortcut">${shortcut}</div>`;
        }
        
        this.tooltipElement.innerHTML = content;
        
        // Position tooltip
        this.position(targetElement, position);
        
        // Show with fade in
        requestAnimationFrame(() => {
            this.tooltipElement.style.opacity = '1';
        });
        
        this.currentTooltip = targetElement;
    }
    
    /**
     * Hide tooltip
     */
    hide() {
        if (!this.tooltipElement) return;
        
        this.tooltipElement.style.opacity = '0';
        this.currentTooltip = null;
        
        // Clear content after fade out
        this.hideTimeout = setTimeout(() => {
            if (this.tooltipElement) {
                this.tooltipElement.innerHTML = '';
            }
        }, this.options.fadeOutDuration);
    }
    
    /**
     * Position tooltip relative to target element
     */
    position(targetElement, position = 'top') {
        const rect = targetElement.getBoundingClientRect();
        const tooltipRect = this.tooltipElement.getBoundingClientRect();
        
        let top, left;
        
        switch (position) {
            case 'top':
                top = rect.top - tooltipRect.height - this.options.offset;
                left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
                break;
                
            case 'bottom':
                top = rect.bottom + this.options.offset;
                left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
                break;
                
            case 'left':
                top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
                left = rect.left - tooltipRect.width - this.options.offset;
                break;
                
            case 'right':
                top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
                left = rect.right + this.options.offset;
                break;
                
            default:
                top = rect.top - tooltipRect.height - this.options.offset;
                left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        }
        
        // Keep tooltip within viewport
        const padding = 8;
        top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));
        left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));
        
        this.tooltipElement.style.top = `${top}px`;
        this.tooltipElement.style.left = `${left}px`;
    }
    
    /**
     * Clear all timeouts
     */
    clearTimeouts() {
        if (this.showTimeout) {
            clearTimeout(this.showTimeout);
            this.showTimeout = null;
        }
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
    }
    
    /**
     * Enable/disable tooltips
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        if (!enabled) {
            this.hide();
        }
    }
    
    /**
     * Update tooltip delay
     */
    setDelay(delay) {
        this.options.delay = delay;
    }
    
    /**
     * Clean up
     */
    destroy() {
        this.clearTimeouts();
        if (this.tooltipElement && this.tooltipElement.parentNode) {
            this.tooltipElement.parentNode.removeChild(this.tooltipElement);
        }
        this.tooltipElement = null;
        this.currentTooltip = null;
    }
}

// Create global tooltip manager instance
export const tooltipManager = new TooltipManager({
    delay: 700,         // 0.7s delay - not too fast, not too slow
    fadeInDuration: 200,
    fadeOutDuration: 150,
    maxWidth: 280
});

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        tooltipManager.attachToContainer(document.body);
        logger.info('Global tooltip manager attached');
    });
} else {
    tooltipManager.attachToContainer(document.body);
    logger.info('Global tooltip manager attached');
}

// Expose for debugging
if (typeof window !== 'undefined') {
    window.tooltipManager = tooltipManager;
}
