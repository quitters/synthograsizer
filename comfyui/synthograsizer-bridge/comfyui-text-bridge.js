/**
 * ComfyUI Text Bridge for Synthograsizer
 * Provides real-time prompt updates from Synthograsizer to ComfyUI text nodes
 * 
 * This module creates a bridge between Synthograsizer's variable system
 * and ComfyUI's workflow, allowing dynamic prompt updates without regenerating images
 */

class ComfyUITextBridge {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'http://localhost:8188';
        this.wsUrl = this.baseUrl.replace('http', 'ws') + '/ws';
        this.clientId = this.generateClientId();
        this.connected = false;
        this.ws = null;
        this.textNodeId = options.textNodeId || null;
        this.updateCallback = options.onUpdate || null;
        this.errorCallback = options.onError || null;
        this.connectionCallback = options.onConnect || null;
        this.currentPrompt = '';
        this.updateThrottle = options.throttle || 100; // ms
        this.pendingUpdate = null;
        this.listeners = new Map();
        
        // Auto-connect if specified
        if (options.autoConnect !== false) {
            this.connect();
        }
    }
    
    generateClientId() {
        return 'synthograsizer_' + Math.random().toString(36).substr(2, 9);
    }
    
    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('ComfyUI bridge already connected');
            return;
        }
        
        try {
            this.ws = new WebSocket(this.wsUrl + '?clientId=' + this.clientId);
            
            this.ws.onopen = () => {
                this.connected = true;
                console.log('Connected to ComfyUI WebSocket');
                if (this.connectionCallback) {
                    this.connectionCallback(true);
                }
                this.emit('connected');
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    // Binary messages or non-JSON, ignore for now
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('ComfyUI WebSocket error:', error);
                if (this.errorCallback) {
                    this.errorCallback(error);
                }
                this.emit('error', error);
            };
            
            this.ws.onclose = () => {
                this.connected = false;
                console.log('Disconnected from ComfyUI WebSocket');
                if (this.connectionCallback) {
                    this.connectionCallback(false);
                }
                this.emit('disconnected');
                
                // Auto-reconnect after 3 seconds
                setTimeout(() => {
                    if (!this.connected) {
                        console.log('Attempting to reconnect...');
                        this.connect();
                    }
                }, 3000);
            };
            
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            if (this.errorCallback) {
                this.errorCallback(error);
            }
        }
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }
    
    handleMessage(data) {
        // Handle different message types from ComfyUI
        switch (data.type) {
            case 'status':
                // Server status update
                break;
            case 'execution_start':
                this.emit('execution_start', data);
                break;
            case 'execution_success':
                this.emit('execution_success', data);
                break;
            case 'execution_error':
                this.emit('execution_error', data);
                break;
            case 'progress':
                this.emit('progress', data);
                break;
        }
    }
    
    /**
     * Update text in ComfyUI workflow
     * This uses a custom node or API endpoint to update text without triggering generation
     */
    async updateText(text, nodeId = null) {
        if (!this.connected) {
            console.warn('Not connected to ComfyUI');
            return false;
        }
        
        // Throttle updates to prevent overwhelming the server
        if (this.pendingUpdate) {
            clearTimeout(this.pendingUpdate);
        }
        
        this.pendingUpdate = setTimeout(async () => {
            this.currentPrompt = text;
            const targetNode = nodeId || this.textNodeId;
            
            if (!targetNode) {
                console.warn('No text node ID specified');
                return false;
            }
            
            try {
                // Method 1: Direct API call to update node data
                const response = await fetch(`${this.baseUrl}/api/update_node`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        node_id: targetNode,
                        data: {
                            text: text
                        }
                    })
                });
                
                if (!response.ok) {
                    // Fallback: Try using the workflow update method
                    await this.updateViaWorkflow(text, targetNode);
                }
                
                if (this.updateCallback) {
                    this.updateCallback(text);
                }
                this.emit('text_updated', { text, nodeId: targetNode });
                
                return true;
            } catch (error) {
                console.error('Failed to update text:', error);
                if (this.errorCallback) {
                    this.errorCallback(error);
                }
                return false;
            }
        }, this.updateThrottle);
    }
    
    /**
     * Alternative method: Update via workflow modification
     */
    async updateViaWorkflow(text, nodeId) {
        // Get current workflow
        const workflowResponse = await fetch(`${this.baseUrl}/api/workflow`);
        if (!workflowResponse.ok) {
            throw new Error('Failed to fetch current workflow');
        }
        
        const workflow = await workflowResponse.json();
        
        // Find and update the text node
        if (workflow[nodeId]) {
            if (workflow[nodeId].inputs) {
                workflow[nodeId].inputs.text = text;
            }
            
            // Send updated workflow (without executing)
            const updateResponse = await fetch(`${this.baseUrl}/api/workflow/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    workflow: workflow,
                    execute: false // Don't execute, just update
                })
            });
            
            if (!updateResponse.ok) {
                throw new Error('Failed to update workflow');
            }
        }
    }
    
    /**
     * Get current prompt text
     */
    getCurrentPrompt() {
        return this.currentPrompt;
    }
    
    /**
     * Set the target text node ID
     */
    setTextNodeId(nodeId) {
        this.textNodeId = nodeId;
    }
    
    /**
     * Event emitter functionality
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
    
    off(event, callback) {
        if (!this.listeners.has(event)) return;
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }
    
    emit(event, data) {
        if (!this.listeners.has(event)) return;
        this.listeners.get(event).forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event listener for ${event}:`, error);
            }
        });
    }
}

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ComfyUITextBridge;
}
