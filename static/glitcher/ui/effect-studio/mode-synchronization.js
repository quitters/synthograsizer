/**
 * Mode Synchronization Manager
 * Ensures that destructive/non-destructive mode toggles stay in sync
 * between the EffectChainUI and PropertiesPanel components
 */

import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ModeSyncManager');

export class ModeSynchronizationManager {
    constructor() {
        this.effectChainUI = null;
        this.propertiesPanel = null;
        this.eventListeners = new Map();
        
        this.initializeEventSystem();
    }

    initializeEventSystem() {
        // Listen for mode change events
        document.addEventListener('effectModeChanged', (e) => {
            this.handleModeChange(e.detail);
        });
        
        // Listen for effect selection changes
        document.addEventListener('effectSelected', (e) => {
            this.handleEffectSelection(e.detail);
        });
    }

    /**
     * Connect the EffectChainUI and PropertiesPanel components
     */
    connect(effectChainUI, propertiesPanel) {
        this.effectChainUI = effectChainUI;
        this.propertiesPanel = propertiesPanel;
        
        // Set up bidirectional references
        if (effectChainUI && effectChainUI.setPropertiesPanel) {
            effectChainUI.setPropertiesPanel(propertiesPanel);
        }
        
        if (propertiesPanel && propertiesPanel.setEffectChainUI) {
            propertiesPanel.setEffectChainUI(effectChainUI);
        }
        
        logger.success('✓ Mode synchronization connected between EffectChainUI and PropertiesPanel');
        this.showNotification('Mode synchronization enabled', 'success');
    }

    /**
     * Handle mode changes from any source
     */
    handleModeChange(detail) {
        const { effect, oldMode, newMode, source } = detail;
        
        // Update the effect object
        if (effect) {
            effect.mode = newMode;
        }
        
        // Sync the properties panel if the change came from effect chain
        if (source === 'effectChain' && this.propertiesPanel) {
            // Check if this effect is currently selected in properties panel
            if (this.propertiesPanel.currentEffect && this.propertiesPanel.currentEffect.id === effect.id) {
                this.propertiesPanel.updateEffectMode(newMode);
                logger.debug(`🔄 Synced properties panel mode: ${oldMode} → ${newMode}`);
            }
        }
        
        // Sync the effect chain if the change came from properties panel (shouldn't happen)
        if (source === 'propertiesPanel' && this.effectChainUI) {
            this.effectChainUI.updateEffectMode(effect.id, newMode);
        }
        
        // Show user feedback
        this.showNotification(
            `Effect switched to ${newMode} mode`,
            'info',
            this.getModeIcon(newMode)
        );
        
        // Trigger any registered listeners
        this.triggerModeChangeListeners(effect, oldMode, newMode);
    }

    /**
     * Handle effect selection changes
     */
    handleEffectSelection(detail) {
        const { effectId, effect } = detail;
        
        if (this.propertiesPanel && effect) {
            this.propertiesPanel.showEffect(effect);
        }
    }

    /**
     * Register a listener for mode changes
     */
    onModeChange(effectId, callback) {
        if (!this.eventListeners.has(effectId)) {
            this.eventListeners.set(effectId, []);
        }
        this.eventListeners.get(effectId).push(callback);
    }

    /**
     * Remove a mode change listener
     */
    removeModeChangeListener(effectId, callback) {
        if (this.eventListeners.has(effectId)) {
            const listeners = this.eventListeners.get(effectId);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Trigger registered mode change listeners
     */
    triggerModeChangeListeners(effect, oldMode, newMode) {
        if (this.eventListeners.has(effect.id)) {
            const listeners = this.eventListeners.get(effect.id);
            listeners.forEach(callback => {
                try {
                    callback(effect, oldMode, newMode);
                } catch (error) {
                    logger.error('Error in mode change listener:', error);
                }
            });
        }
    }

    /**
     * Get icon for mode
     */
    getModeIcon(mode) {
        return mode === 'destructive' ? '🔥' : '🛡️';
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info', icon = '') {
        const notification = document.createElement('div');
        notification.className = `mode-sync-notification ${type}`;
        notification.innerHTML = `
            <span class="notification-icon">${icon}</span>
            <span class="notification-text">${message}</span>
        `;
        
        // Style the notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '12px',
            zIndex: '10002',
            color: 'white',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            opacity: '0',
            transition: 'all 0.3s ease',
            pointerEvents: 'none'
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
            notification.style.transform = 'translateX(-50%) translateY(0)';
        });
        
        // Remove after delay
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(-50%) translateY(-20px)';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    /**
     * Validate that mode is synchronized between components
     */
    validateModeSync(effectId) {
        if (!this.effectChainUI || !this.propertiesPanel) {
            logger.warn('Cannot validate mode sync: components not connected');
            return false;
        }
        
        const chainEffect = this.effectChainUI.chainManager.getEffect(effectId);
        const panelEffect = this.propertiesPanel.currentEffect;
        
        if (!chainEffect || !panelEffect || chainEffect.id !== panelEffect.id) {
            logger.warn('Effect mismatch between chain and panel');
            return false;
        }
        
        if (chainEffect.mode !== panelEffect.mode) {
            logger.error(`Mode mismatch for effect ${effectId}: chain=${chainEffect.mode}, panel=${panelEffect.mode}`);
            this.showNotification('Mode synchronization error detected', 'error', '⚠️');
            return false;
        }
        
        return true;
    }

    /**
     * Force synchronization of all effects
     */
    forceSynchronization() {
        if (!this.effectChainUI || !this.propertiesPanel) {
            logger.warn('Cannot force sync: components not connected');
            return;
        }
        
        const currentEffect = this.propertiesPanel.currentEffect;
        if (currentEffect) {
            const chainEffect = this.effectChainUI.chainManager.getEffect(currentEffect.id);
            if (chainEffect && chainEffect.mode !== currentEffect.mode) {
                logger.info(`Forcing mode sync for ${currentEffect.id}: ${chainEffect.mode}`);
                this.propertiesPanel.updateEffectMode(chainEffect.mode);
            }
        }
    }

    /**
     * Debug information
     */
    getDebugInfo() {
        return {
            connected: Boolean(this.effectChainUI && this.propertiesPanel),
            effectChainUI: Boolean(this.effectChainUI),
            propertiesPanel: Boolean(this.propertiesPanel),
            listeners: Array.from(this.eventListeners.keys()),
            currentEffect: this.propertiesPanel?.currentEffect?.id || null
        };
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.eventListeners.clear();
        this.effectChainUI = null;
        this.propertiesPanel = null;
        
        // Remove event listeners
        document.removeEventListener('effectModeChanged', this.handleModeChange);
        document.removeEventListener('effectSelected', this.handleEffectSelection);
    }
}

// Global instance
export const modeSyncManager = new ModeSynchronizationManager();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    logger.info('Mode synchronization manager initialized');
});
