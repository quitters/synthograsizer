/**
 * Synthograsizer-ComfyUI Integration
 * Bridges Synthograsizer's real-time prompt generation with ComfyUI text nodes
 */

class SynthograsizerComfyUIIntegration {
    constructor(options = {}) {
        this.bridge = null;
        this.enabled = false;
        this.textNodeId = options.textNodeId || null;
        this.comfyUrl = options.comfyUrl || 'http://localhost:8188';
        this.includeNegativePrompt = options.includeNegativePrompt || false;
        this.negativeTextNodeId = options.negativeTextNodeId || null;
        this.updateMode = options.updateMode || 'realtime'; // 'realtime' or 'manual'
        this.throttleMs = options.throttleMs || 100;
        
        // UI elements
        this.statusElement = null;
        this.connectButton = null;
        this.nodeIdInput = null;
        
        // State
        this.lastPrompt = '';
        this.lastNegativePrompt = '';
        
        this.initializeUI();
    }
    
    initializeUI() {
        // Create UI container if it doesn't exist
        let container = document.getElementById('comfyui-integration');
        if (!container) {
            container = document.createElement('div');
            container.id = 'comfyui-integration';
            container.className = 'comfyui-integration-panel';
            container.innerHTML = `
                <div class="comfyui-header">
                    <h3>ComfyUI Integration</h3>
                    <div class="connection-status">
                        <span class="status-indicator" id="comfyui-status-indicator"></span>
                        <span class="status-text" id="comfyui-status-text">Disconnected</span>
                    </div>
                </div>
                <div class="comfyui-controls">
                    <div class="control-group">
                        <label for="comfyui-url">ComfyUI URL:</label>
                        <input type="text" id="comfyui-url" value="${this.comfyUrl}" placeholder="http://localhost:8188">
                    </div>
                    <div class="control-group">
                        <label for="comfyui-node-id">Text Node ID:</label>
                        <input type="text" id="comfyui-node-id" placeholder="e.g., 6" value="${this.textNodeId || ''}">
                    </div>
                    <div class="control-group">
                        <label for="comfyui-negative-node-id">Negative Text Node ID (optional):</label>
                        <input type="text" id="comfyui-negative-node-id" placeholder="e.g., 7" value="${this.negativeTextNodeId || ''}">
                    </div>
                    <div class="control-group">
                        <label for="comfyui-update-mode">Update Mode:</label>
                        <select id="comfyui-update-mode">
                            <option value="realtime" ${this.updateMode === 'realtime' ? 'selected' : ''}>Real-time</option>
                            <option value="manual" ${this.updateMode === 'manual' ? 'selected' : ''}>Manual</option>
                        </select>
                    </div>
                    <div class="button-group">
                        <button id="comfyui-connect-btn" class="comfyui-button">Connect</button>
                        <button id="comfyui-send-btn" class="comfyui-button" disabled>Send Current Prompt</button>
                    </div>
                </div>
                <div class="comfyui-log" id="comfyui-log"></div>
            `;
            
            // Add to Mode D panel or create new panel
            const modeD = document.querySelector('.mode-d');
            if (modeD) {
                modeD.appendChild(container);
            } else {
                // Fallback: add to body or main container
                document.body.appendChild(container);
            }
            
            this.addStyles();
        }
        
        // Get references to UI elements
        this.statusElement = document.getElementById('comfyui-status-text');
        this.statusIndicator = document.getElementById('comfyui-status-indicator');
        this.connectButton = document.getElementById('comfyui-connect-btn');
        this.sendButton = document.getElementById('comfyui-send-btn');
        this.nodeIdInput = document.getElementById('comfyui-node-id');
        this.negativeNodeIdInput = document.getElementById('comfyui-negative-node-id');
        this.urlInput = document.getElementById('comfyui-url');
        this.updateModeSelect = document.getElementById('comfyui-update-mode');
        this.logElement = document.getElementById('comfyui-log');
        
        // Add event listeners
        this.connectButton.addEventListener('click', () => this.toggleConnection());
        this.sendButton.addEventListener('click', () => this.sendCurrentPrompt());
        this.updateModeSelect.addEventListener('change', (e) => {
            this.updateMode = e.target.value;
            this.sendButton.disabled = !this.enabled || this.updateMode === 'realtime';
        });
        
        // Listen for Synthograsizer variable changes
        if (typeof addVariableChangeListener === 'function') {
            addVariableChangeListener((featureName, value) => {
                if (this.enabled && this.updateMode === 'realtime') {
                    this.updatePrompt();
                }
            });
        }
        
        // Also listen for prompt template changes
        const inputText = document.getElementById('inputText');
        if (inputText) {
            inputText.addEventListener('input', () => {
                if (this.enabled && this.updateMode === 'realtime') {
                    this.updatePrompt();
                }
            });
        }
        
        const negativeInputText = document.getElementById('negativeInputText');
        if (negativeInputText) {
            negativeInputText.addEventListener('input', () => {
                if (this.enabled && this.updateMode === 'realtime' && this.negativeNodeIdInput.value) {
                    this.updatePrompt();
                }
            });
        }
    }
    
    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .comfyui-integration-panel {
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 8px;
                padding: 16px;
                margin: 16px 0;
                color: #fff;
            }
            
            .comfyui-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
            }
            
            .comfyui-header h3 {
                margin: 0;
                color: #fff;
            }
            
            .connection-status {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .status-indicator {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #666;
                transition: background 0.3s;
            }
            
            .status-indicator.connected {
                background: #4CAF50;
                box-shadow: 0 0 4px #4CAF50;
            }
            
            .status-indicator.error {
                background: #f44336;
                box-shadow: 0 0 4px #f44336;
            }
            
            .comfyui-controls {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            
            .control-group {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            
            .control-group label {
                font-size: 14px;
                color: #bbb;
            }
            
            .control-group input,
            .control-group select {
                padding: 8px;
                border: 1px solid #555;
                border-radius: 4px;
                background: #1a1a1a;
                color: #fff;
                font-size: 14px;
            }
            
            .button-group {
                display: flex;
                gap: 8px;
                margin-top: 8px;
            }
            
            .comfyui-button {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                background: #4a90e2;
                color: white;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.2s;
            }
            
            .comfyui-button:hover {
                background: #357abd;
            }
            
            .comfyui-button:disabled {
                background: #666;
                cursor: not-allowed;
                opacity: 0.6;
            }
            
            .comfyui-button.disconnect {
                background: #f44336;
            }
            
            .comfyui-button.disconnect:hover {
                background: #d32f2f;
            }
            
            .comfyui-log {
                margin-top: 12px;
                padding: 8px;
                background: #1a1a1a;
                border: 1px solid #333;
                border-radius: 4px;
                font-size: 12px;
                color: #888;
                max-height: 100px;
                overflow-y: auto;
                display: none;
            }
            
            .comfyui-log.has-content {
                display: block;
            }
            
            .comfyui-log .log-entry {
                margin: 2px 0;
            }
            
            .comfyui-log .log-entry.error {
                color: #f44336;
            }
            
            .comfyui-log .log-entry.success {
                color: #4CAF50;
            }
        `;
        document.head.appendChild(style);
    }
    
    toggleConnection() {
        if (this.enabled) {
            this.disconnect();
        } else {
            this.connect();
        }
    }
    
    connect() {
        const url = this.urlInput.value.trim();
        const nodeId = this.nodeIdInput.value.trim();
        
        if (!url) {
            this.log('Please enter a ComfyUI URL', 'error');
            return;
        }
        
        if (!nodeId) {
            this.log('Please enter a text node ID', 'error');
            return;
        }
        
        this.comfyUrl = url;
        this.textNodeId = nodeId;
        this.negativeTextNodeId = this.negativeNodeIdInput.value.trim() || null;
        
        // Create bridge
        this.bridge = new ComfyUITextBridge({
            baseUrl: this.comfyUrl,
            textNodeId: this.textNodeId,
            throttle: this.throttleMs,
            autoConnect: true,
            onConnect: (connected) => {
                this.enabled = connected;
                this.updateConnectionStatus(connected);
                if (connected) {
                    this.log('Connected to ComfyUI', 'success');
                    // Send initial prompt
                    this.updatePrompt();
                } else {
                    this.log('Disconnected from ComfyUI');
                }
            },
            onError: (error) => {
                this.log(`Error: ${error}`, 'error');
                this.updateConnectionStatus(false, true);
            },
            onUpdate: (text) => {
                this.log(`Sent prompt (${text.length} chars)`);
            }
        });
    }
    
    disconnect() {
        if (this.bridge) {
            this.bridge.disconnect();
            this.bridge = null;
        }
        this.enabled = false;
        this.updateConnectionStatus(false);
        this.log('Disconnected');
    }
    
    updateConnectionStatus(connected, error = false) {
        this.statusIndicator.classList.remove('connected', 'error');
        if (connected) {
            this.statusIndicator.classList.add('connected');
            this.statusElement.textContent = 'Connected';
            this.connectButton.textContent = 'Disconnect';
            this.connectButton.classList.add('disconnect');
            this.sendButton.disabled = this.updateMode === 'realtime';
        } else {
            if (error) {
                this.statusIndicator.classList.add('error');
                this.statusElement.textContent = 'Error';
            } else {
                this.statusElement.textContent = 'Disconnected';
            }
            this.connectButton.textContent = 'Connect';
            this.connectButton.classList.remove('disconnect');
            this.sendButton.disabled = true;
        }
    }
    
    getCurrentPrompt() {
        // Get the current generated prompt from Synthograsizer
        const outputText = document.getElementById('outputText');
        if (outputText) {
            // Extract text content without HTML tags
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = outputText.innerHTML;
            return tempDiv.textContent || tempDiv.innerText || '';
        }
        return '';
    }
    
    getCurrentNegativePrompt() {
        const negativeOutputText = document.getElementById('negativeOutputText');
        if (negativeOutputText) {
            return negativeOutputText.textContent || '';
        }
        return '';
    }
    
    updatePrompt() {
        if (!this.bridge || !this.enabled) return;
        
        const prompt = this.getCurrentPrompt();
        const negativePrompt = this.getCurrentNegativePrompt();
        
        // Update main prompt if changed
        if (prompt !== this.lastPrompt) {
            this.lastPrompt = prompt;
            this.bridge.updateText(prompt, this.textNodeId);
        }
        
        // Update negative prompt if enabled and changed
        if (this.negativeTextNodeId && negativePrompt !== this.lastNegativePrompt) {
            this.lastNegativePrompt = negativePrompt;
            this.bridge.updateText(negativePrompt, this.negativeTextNodeId);
        }
    }
    
    sendCurrentPrompt() {
        if (!this.enabled) return;
        this.updatePrompt();
        this.log('Manually sent current prompt');
    }
    
    log(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = 'log-entry ' + type;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        this.logElement.appendChild(entry);
        this.logElement.classList.add('has-content');
        
        // Auto-scroll to bottom
        this.logElement.scrollTop = this.logElement.scrollHeight;
        
        // Keep only last 20 entries
        while (this.logElement.children.length > 20) {
            this.logElement.removeChild(this.logElement.firstChild);
        }
    }
}

// Auto-initialize when in Mode D
document.addEventListener('DOMContentLoaded', () => {
    // Check if we should auto-initialize
    const checkModeD = () => {
        const mode = window.mode || 'A';
        if (mode === 'D' && !window.synthComfyIntegration) {
            window.synthComfyIntegration = new SynthograsizerComfyUIIntegration({
                comfyUrl: 'http://localhost:8188',
                updateMode: 'realtime',
                throttleMs: 100
            });
        }
    };
    
    // Check immediately and also listen for mode changes
    checkModeD();
    
    // Listen for mode toggle button clicks
    const modeToggle = document.getElementById('modeToggleButton');
    if (modeToggle) {
        modeToggle.addEventListener('click', () => {
            setTimeout(checkModeD, 100); // Wait for mode to update
        });
    }
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SynthograsizerComfyUIIntegration;
}
