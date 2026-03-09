/**
 * Effect Studio Integration Script
 * Resolves competing mode toggles and ensures proper synchronization
 * between EffectChainUI and PropertiesPanel
 */

import { modeSyncManager } from './mode-synchronization.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('StudioIntegration');

export class EffectStudioIntegration {
    constructor() {
        this.effectChainUI = null;
        this.propertiesPanel = null;
        this.isInitialized = false;
        this.eventListeners = [];
        this.componentObserver = null;
        
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    async initialize() {
        logger.info('🎛️ Initializing Effect Studio Integration...');
        
        try {
            // Wait for components to be available
            await this.waitForComponents();
            
            // Connect the components
            this.connectComponents();
            
            // Set up mode synchronization
            this.setupModeSynchronization();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Hide any legacy mode controls
            this.hideLegacyControls();
            
            // Show integration status
            this.showIntegrationStatus();
            
            this.isInitialized = true;
            logger.success('✅ Effect Studio Integration complete!');
            
        } catch (error) {
            logger.error('❌ Failed to initialize Effect Studio Integration:', error);
            this.showErrorMessage('Failed to initialize mode synchronization');
        }
    }

    /**
     * Optimized component waiting using MutationObserver
     * Replaces polling with reactive observation
     */
    async waitForComponents() {
        return new Promise((resolve, reject) => {
            // Check if components already exist
            const chainContainer = document.querySelector('.effect-chain-container, #effectChainPanel');
            const propertiesContainer = document.querySelector('.properties-panel, #propertiesPanel');
            
            if (chainContainer && propertiesContainer) {
                logger.debug('📦 Found UI containers immediately');
                resolve();
                return;
            }
            
            // Set up MutationObserver to watch for components
            this.componentObserver = new MutationObserver((mutations, observer) => {
                const chain = document.querySelector('.effect-chain-container, #effectChainPanel');
                const props = document.querySelector('.properties-panel, #propertiesPanel');
                
                if (chain && props) {
                    logger.debug('📦 Found UI containers via observer');
                    observer.disconnect();
                    this.componentObserver = null;
                    resolve();
                }
            });
            
            // Start observing
            this.componentObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            // Timeout after 5 seconds
            setTimeout(() => {
                if (this.componentObserver) {
                    this.componentObserver.disconnect();
                    this.componentObserver = null;
                    reject(new Error('UI components not found after 5 seconds'));
                }
            }, 5000);
        });
    }

    connectComponents() {
        // Try multiple methods to find existing component instances
        this.effectChainUI = this.findEffectChainUI();
        this.propertiesPanel = this.findPropertiesPanel();
        
        if (this.effectChainUI && this.propertiesPanel) {
            // Connect through mode sync manager
            modeSyncManager.connect(this.effectChainUI, this.propertiesPanel);
            
            // Set up direct references (legacy support)
            if (this.effectChainUI.setPropertiesPanel) {
                this.effectChainUI.setPropertiesPanel(this.propertiesPanel);
            }
            
            logger.success('🔗 Components connected successfully');
            return true;
        } else {
            // Only show warnings if we're in Studio Mode
            const isStudioMode = window.glitcherApp && window.glitcherApp.studioMode;
            if (isStudioMode === true) {
                logger.warn('⚠️ Could not find component instances, will monitor for them');
                logger.debug('  - EffectChainUI found:', Boolean(this.effectChainUI));
                logger.debug('  - PropertiesPanel found:', Boolean(this.propertiesPanel));
            }
            this.monitorForComponents();
            return false;
        }
    }

    findEffectChainUI() {
    // Only search for EffectChainUI if we're in Studio Mode or mode is unknown
    const isStudioMode = window.glitcherApp && window.glitcherApp.studioMode;
    
    if (isStudioMode === false) {
    // We're in Classic Mode, don't spam console with "not found" messages
    return null;
    }
    
    // Try multiple discovery methods
    
    // Method 1: Check global window variable
    if (window.effectChainUI) {
    logger.debug('🔍 Found EffectChainUI via window.effectChainUI');
      return window.effectChainUI;
    }
    
    // Method 2: Check DOM element reference
    const chainElement = document.querySelector('.effect-chain-container, #effectChainPanel');
    if (chainElement && chainElement._effectChainUI) {
    logger.debug('🔍 Found EffectChainUI via DOM element reference');
    return chainElement._effectChainUI;
    }
    
    // Method 3: Check studio manager
    if (window.glitcherApp && window.glitcherApp.effectStudioManager && 
          window.glitcherApp.effectStudioManager.components && 
        window.glitcherApp.effectStudioManager.components.chainUI) {
      logger.debug('🔍 Found EffectChainUI via studio manager');
      return window.glitcherApp.effectStudioManager.components.chainUI;
    }
    
    // Only log "not found" if we're actually in Studio Mode
    if (isStudioMode === true) {
      logger.debug('❌ EffectChainUI not found (Studio Mode active)');
    }
    
    return null;
  }

    findPropertiesPanel() {
        // Try multiple discovery methods
        
        // Method 1: Check global window variable
        if (window.propertiesPanel) {
            logger.debug('🔍 Found PropertiesPanel via window.propertiesPanel');
            return window.propertiesPanel;
        }
        
        // Method 2: Check DOM element reference
        const propsElement = document.querySelector('.properties-panel, #propertiesPanel');
        if (propsElement && propsElement._propertiesPanel) {
            logger.debug('🔍 Found PropertiesPanel via DOM element reference');
            return propsElement._propertiesPanel;
        }
        
        // Method 3: Check studio manager
        if (window.glitcherApp && window.glitcherApp.effectStudioManager && 
            window.glitcherApp.effectStudioManager.components && 
            window.glitcherApp.effectStudioManager.components.propertiesPanel) {
            logger.debug('🔍 Found PropertiesPanel via studio manager');
            return window.glitcherApp.effectStudioManager.components.propertiesPanel;
        }
        
        logger.debug('❌ PropertiesPanel not found');
        return null;
    }

    monitorForComponents() {
        // Set up observers to detect when components are created
        const observer = new MutationObserver(() => {
            if (!this.effectChainUI) {
                this.effectChainUI = this.findEffectChainUI();
            }
            
            if (!this.propertiesPanel) {
                this.propertiesPanel = this.findPropertiesPanel();
            }
            
            if (this.effectChainUI && this.propertiesPanel) {
                this.connectComponents();
                observer.disconnect();
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
            observer.disconnect();
            if (!this.effectChainUI || !this.propertiesPanel) {
                logger.warn('⚠️ Could not find all components within 10 seconds');
            }
        }, 10000);
    }

    setupModeSynchronization() {
        // Enhanced mode change handler
        document.addEventListener('effectModeChanged', (e) => {
            const { effect, oldMode, newMode, source } = e.detail;
            
            console.log(`🔄 Mode changed: ${effect.id} from ${oldMode} to ${newMode} (source: ${source})`);
            
            // Update UI elements that show mode info
            this.updateModeIndicators(effect, newMode);
            
            // Ensure properties panel is updated if this effect is selected
            if (this.propertiesPanel && this.propertiesPanel.currentEffect && 
                this.propertiesPanel.currentEffect.id === effect.id) {
                this.propertiesPanel.updateEffectMode(newMode);
                console.log(`✨ Properties panel mode synchronized for ${effect.id}`);
            }
            
            // Validate synchronization
            setTimeout(() => {
                this.validateModeSync(effect.id);
            }, 100);
        });
        
        // Enhanced effect selection handler
        document.addEventListener('effectSelected', (e) => {
            const { effectId, effect } = e.detail;
            console.log(`🎯 Effect selected: ${effectId}`);
            
            // Update properties panel with selected effect
            if (this.propertiesPanel && effect) {
                this.propertiesPanel.showEffect(effect);
                console.log(`📝 Properties panel updated for effect: ${effect.name} (${effect.mode} mode)`);
            }
        });
        
        // **ENHANCED**: Direct mode change handler for immediate response
        document.addEventListener('effectModeChanged', (e) => {
            const { effect, oldMode, newMode, source, effectId } = e.detail;
            console.log(`🔄 IMMEDIATE Mode change: ${effectId} ${oldMode} → ${newMode} (${source})`);
            
            // **CRITICAL**: If this effect is currently selected, update properties panel immediately
            if (this.propertiesPanel && this.propertiesPanel.showEffect && effectId) {
                // Check if this is the selected effect via multiple methods
                const isSelected = this.isEffectCurrentlySelected(effectId);
                
                if (isSelected) {
                    console.log(`🎯 Effect ${effectId} is selected, updating properties panel IMMEDIATELY`);
                    this.propertiesPanel.showEffect(effect);
                    
                    // Also force mode synchronization manager update
                    if (window.modeSyncManager && window.modeSyncManager.updateModeIndicator) {
                        window.modeSyncManager.updateModeIndicator(effect);
                    }
                }
            }
        });
    }

    updateModeIndicators(effect, newMode) {
        // Update all mode indicators for this effect
        const effectModules = document.querySelectorAll(`[data-effect-id=\"${effect.id}\"]`);
        
        effectModules.forEach(module => {
            // Update mode toggle button
            const modeToggle = module.querySelector('.mode-toggle');
            if (modeToggle) {
                modeToggle.textContent = newMode === 'destructive' ? 'D' : 'ND';
                modeToggle.className = `mode-toggle ${newMode}`;
            }
            
            // Update effect type display
            const typeDisplay = module.querySelector('.effect-type');
            if (typeDisplay) {
                const category = this.getEffectCategory(effect);
                typeDisplay.textContent = `${newMode === 'destructive' ? 'Destructive' : 'Non-Destructive'} • ${category}`;
            }
        });
        
        // Update properties panel if this effect is selected
        if (this.propertiesPanel && this.propertiesPanel.currentEffect?.id === effect.id) {
            this.propertiesPanel.updateEffectMode(newMode);
        }
    }

    validateModeSync(effectId) {
        if (!this.effectChainUI || !this.propertiesPanel) return;
        
        const isValid = modeSyncManager.validateModeSync(effectId);
        
        if (!isValid) {
            console.warn(`⚠️ Mode synchronization issue detected for effect ${effectId}`);
            modeSyncManager.forceSynchronization();
        }
    }

    setupEventListeners() {
        // Listen for integration test events
        document.addEventListener('testModeSync', () => {
            this.runSynchronizationTest();
        });
        
        // Listen for debug commands
        document.addEventListener('debugModeSync', () => {
            console.log('🔍 Mode Sync Debug Info:', modeSyncManager.getDebugInfo());
        });
        
        // Handle component registration
        document.addEventListener('registerEffectChainUI', (e) => {
            this.effectChainUI = e.detail.component;
            this.connectComponents();
        });
        
        document.addEventListener('registerPropertiesPanel', (e) => {
            this.propertiesPanel = e.detail.component;
            this.connectComponents();
        });
    }

    hideLegacyControls() {
        // Hide any remaining radio button controls
        const legacyControls = document.querySelectorAll([
            '.mode-selector',
            '.mode-radio-group',
            'input[type=\"radio\"][name=\"mode\"]',
            '.properties-panel .mode-toggle-radio'
        ].join(', '));
        
        legacyControls.forEach(control => {
            control.style.display = 'none';
        });
        
        if (legacyControls.length > 0) {
            console.log(`🚫 Hid ${legacyControls.length} legacy mode controls`);
        }
    }

    showIntegrationStatus() {
        const statusMessage = this.createStatusMessage();
        document.body.appendChild(statusMessage);
        
        // Remove after 3 seconds
        setTimeout(() => {
            statusMessage.style.opacity = '0';
            statusMessage.style.transform = 'translateY(-20px)';
            setTimeout(() => statusMessage.remove(), 300);
        }, 3000);
    }

    createStatusMessage() {
        const message = document.createElement('div');
        message.className = 'integration-status-message';
        message.innerHTML = `
            <div class=\"status-icon\">✅</div>
            <div class=\"status-text\">
                <div class=\"status-title\">Mode Synchronization Active</div>
                <div class=\"status-detail\">Effect modes are now synchronized between chain and properties</div>
            </div>
        `;
        
        // Style the message
        Object.assign(message.style, {
            position: 'fixed',
            top: '80px',
            right: '20px',
            background: 'linear-gradient(145deg, rgba(102, 187, 106, 0.95), rgba(76, 175, 80, 0.9))',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '8px',
            boxShadow: '0 8px 25px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(10px)',
            zIndex: '10003',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            minWidth: '280px',
            fontSize: '14px',
            border: '1px solid rgba(255,255,255,0.2)',
            opacity: '0',
            transform: 'translateY(20px)',
            transition: 'all 0.3s ease'
        });
        
        // Status icon styling
        const icon = message.querySelector('.status-icon');
        Object.assign(icon.style, {
            fontSize: '20px',
            flexShrink: '0'
        });
        
        // Status text styling
        const title = message.querySelector('.status-title');
        Object.assign(title.style, {
            fontWeight: 'bold',
            marginBottom: '2px'
        });
        
        const detail = message.querySelector('.status-detail');
        Object.assign(detail.style, {
            fontSize: '12px',
            opacity: '0.9'
        });
        
        // Animate in
        requestAnimationFrame(() => {
            message.style.opacity = '1';
            message.style.transform = 'translateY(0)';
        });
        
        return message;
    }

    showErrorMessage(message) {
        const errorMsg = document.createElement('div');
        errorMsg.textContent = `❌ ${message}`;
        errorMsg.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: rgba(255, 107, 107, 0.9);
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            z-index: 10003;
            font-size: 14px;
        `;
        
        document.body.appendChild(errorMsg);
        setTimeout(() => errorMsg.remove(), 5000);
    }

    runSynchronizationTest() {
        console.log('🧪 Running mode synchronization test...');
        
        if (!this.effectChainUI || !this.propertiesPanel) {
            console.error('❌ Cannot run test: components not found');
            return;
        }
        
        const selectedEffect = this.effectChainUI.getSelectedEffect();
        if (!selectedEffect) {
            console.warn('⚠️ No effect selected for testing');
            return;
        }
        
        const effect = this.effectChainUI.chainManager.getEffect(selectedEffect);
        if (!effect) {
            console.error('❌ Selected effect not found in chain');
            return;
        }
        
        console.log('📋 Test Results:');
        console.log(`- Effect ID: ${effect.id}`);
        console.log(`- Current mode: ${effect.mode}`);
        console.log(`- Chain UI connected: ${Boolean(this.effectChainUI)}`);
        console.log(`- Properties Panel connected: ${Boolean(this.propertiesPanel)}`);
        console.log(`- Mode sync manager connected: ${modeSyncManager.getDebugInfo().connected}`);
        
        // Test mode validation
        const isValid = modeSyncManager.validateModeSync(effect.id);
        console.log(`- Mode validation: ${isValid ? '✅ PASS' : '❌ FAIL'}`);
    }

    getEffectCategory(effect) {
        // Helper method to get effect category
        const categoryMap = {
            'direction': 'Movement',
            'spiral': 'Movement', 
            'slice': 'Distortion',
            'pixel-sort': 'Distortion',
            'color': 'Color',
            'artistic': 'Artistic',
            'vintage': 'Film'
        };
        
        for (const [key, category] of Object.entries(categoryMap)) {
            if (effect.id?.includes(key) || effect.type?.includes(key)) {
                return category;
            }
        }
        
        return effect.category || 'Effect';
    }

    // Public API methods
    getStatus() {
        return {
            initialized: this.isInitialized,
            chainUI: Boolean(this.effectChainUI),
            propertiesPanel: Boolean(this.propertiesPanel),
            synchronized: modeSyncManager.getDebugInfo().connected
        };
    }

    forceReconnect() {
        console.log('🔄 Forcing component reconnection...');
        
        // Try to find components again
        this.effectChainUI = this.findEffectChainUI();
        this.propertiesPanel = this.findPropertiesPanel();
        
        if (this.effectChainUI && this.propertiesPanel) {
            // Connect through mode sync manager
            modeSyncManager.connect(this.effectChainUI, this.propertiesPanel);
            
            // Set up direct references
            if (this.effectChainUI.setPropertiesPanel) {
                this.effectChainUI.setPropertiesPanel(this.propertiesPanel);
            }
            
            console.log('✅ Components successfully reconnected');
            return true;
        } else {
            console.warn('⚠️ Could not reconnect - components still not found');
            return false;
        }
    }

    isEffectCurrentlySelected(effectId) {
        // Check multiple sources to determine if this effect is selected
        
        // Method 1: Check effect chain UI selected effect
        if (this.effectChainUI) {
            const selected = this.effectChainUI.selectedEffect || this.effectChainUI.getSelectedEffect?.();
            if (selected === effectId) {
                console.log(`🎯 Found selected effect ${effectId} via effectChainUI.selectedEffect`);
                return true;
            }
        }
        
        // Method 2: Check DOM selected state
        const effectModule = document.querySelector(`[data-effect-id="${effectId}"]`);
        if (effectModule && effectModule.classList.contains('selected')) {
            console.log(`🎯 Found selected effect ${effectId} via DOM class`);
            return true;
        }
        
        // Method 3: Check properties panel current effect
        if (this.propertiesPanel && this.propertiesPanel.currentEffect) {
            if (this.propertiesPanel.currentEffect.id === effectId) {
                console.log(`🎯 Found selected effect ${effectId} via propertiesPanel.currentEffect`);
                return true;
            }
        }
        
        return false;
    }

    runDiagnostics() {
        logger.group('🔍 Effect Studio Integration Diagnostics');
        logger.info('Status:', this.getStatus());
        logger.info('Mode Sync Manager:', modeSyncManager.getDebugInfo());
        
        // Check for legacy controls
        const legacyControls = document.querySelectorAll('.mode-selector, input[type="radio"][name="mode"]');
        logger.info(`Legacy controls found: ${legacyControls.length}`);
        
        // Check for mode toggle buttons
        const modeToggles = document.querySelectorAll('.mode-toggle');
        logger.info(`Mode toggle buttons found: ${modeToggles.length}`);
        
        // Check for mode indicators
        const modeIndicators = document.querySelectorAll('.mode-indicator');
        logger.info(`Mode indicators found: ${modeIndicators.length}`);
        
        logger.groupEnd();
    }
    
    /**
     * Cleanup method - removes observers and event listeners
     */
    destroy() {
        logger.info('🧹 Cleaning up Studio Integration...');
        
        // Disconnect component observer
        if (this.componentObserver) {
            this.componentObserver.disconnect();
            this.componentObserver = null;
        }
        
        // Clear event listeners (if we tracked them)
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners = [];
        
        // Clear references
        this.effectChainUI = null;
        this.propertiesPanel = null;
        this.isInitialized = false;
        
        logger.success('✅ Studio Integration cleaned up');
    }
}

// Create global instance
export const effectStudioIntegration = new EffectStudioIntegration();

// Expose for debugging
window.effectStudioIntegration = effectStudioIntegration;
window.modeSyncManager = modeSyncManager;

// Console helpers
window.testModeSync = () => document.dispatchEvent(new CustomEvent('testModeSync'));
window.debugModeSync = () => document.dispatchEvent(new CustomEvent('debugModeSync'));

console.log('🎛️ Effect Studio Integration loaded. Use testModeSync() or debugModeSync() in console for debugging.');
