import mitt from 'mitt';
import { store } from '../modules/store';

export class TooltipManager {
    constructor() {
        this.emitter = mitt();
        this.activeTooltip = null;
        this.tooltipEl = null;
        this.contextCache = new Map();
        
        this.init();
    }

    init() {
        // Create tooltip element
        this.tooltipEl = document.createElement('div');
        this.tooltipEl.className = 'context-tooltip';
        document.body.appendChild(this.tooltipEl);

        // Initialize context data
        this.initializeContextData();
        
        // Setup global listeners
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        
        // Subscribe to store updates
        store.subscribe('variableUpdate', this.handleVariableUpdate.bind(this));
        store.subscribe('midiMappingUpdate', this.handleMidiUpdate.bind(this));
    }

    initializeContextData() {
        // Load initial context from store
        const state = store.getState();
        
        // Cache variable contexts
        state.variables.forEach((variable, id) => {
            this.contextCache.set(id, this.buildVariableContext(variable));
        });
    }

    buildVariableContext(variable) {
        return {
            type: 'variable',
            name: variable.name,
            value: variable.value,
            description: variable.description || '',
            midiMapped: store.getState().midiMappings.has(variable.name),
            connections: this.getVariableConnections(variable.name),
            history: variable.history || []
        };
    }

    getVariableConnections(variableName) {
        const connections = [];
        store.getState().connections.forEach((conn, id) => {
            if (conn.source === variableName || conn.target === variableName) {
                connections.push(conn);
            }
        });
        return connections;
    }

    handleMouseMove(e) {
        const target = e.target;
        const context = this.getElementContext(target);

        if (context) {
            this.showTooltip(context, e.clientX, e.clientY);
        } else {
            this.hideTooltip();
        }
    }

    handleKeyDown(e) {
        // Show additional info when holding Shift
        if (e.key === 'Shift' && this.activeTooltip) {
            this.updateTooltipContent(this.activeTooltip, true);
        }
    }

    handleVariableUpdate(data) {
        const { id, value } = data;
        if (this.contextCache.has(id)) {
            const context = this.contextCache.get(id);
            context.value = value;
            if (this.activeTooltip && this.activeTooltip.id === id) {
                this.updateTooltipContent(context);
            }
        }
    }

    handleMidiUpdate(data) {
        const { target } = data;
        this.contextCache.forEach((context, id) => {
            if (context.name === target) {
                context.midiMapped = true;
                if (this.activeTooltip && this.activeTooltip.id === id) {
                    this.updateTooltipContent(context);
                }
            }
        });
    }

    getElementContext(element) {
        // Check for token elements
        if (element.classList.contains('token')) {
            const tokenName = element.dataset.name;
            return this.getTokenContext(tokenName);
        }

        // Check for node elements
        if (element.classList.contains('visual-node')) {
            const nodeId = element.dataset.id;
            return this.getNodeContext(nodeId);
        }

        // Check for connection elements
        if (element.classList.contains('connection-line')) {
            const connectionId = element.dataset.id;
            return this.getConnectionContext(connectionId);
        }

        return null;
    }

    getTokenContext(tokenName) {
        // Find variable by name
        const variables = Array.from(store.getState().variables.values());
        const variable = variables.find(v => v.name === tokenName);
        
        if (variable) {
            return this.contextCache.get(variable.id) || 
                   this.buildVariableContext(variable);
        }
        
        return null;
    }

    getNodeContext(nodeId) {
        const node = store.getState().nodes.get(nodeId);
        if (!node) return null;

        return {
            type: 'node',
            id: nodeId,
            name: node.name,
            description: node.description,
            inputs: node.inputs,
            outputs: node.outputs,
            connections: this.getNodeConnections(nodeId)
        };
    }

    getConnectionContext(connectionId) {
        const connection = store.getState().connections.get(connectionId);
        if (!connection) return null;

        return {
            type: 'connection',
            id: connectionId,
            source: connection.source,
            target: connection.target,
            value: connection.value,
            active: connection.active
        };
    }

    showTooltip(context, x, y) {
        this.activeTooltip = context;
        this.tooltipEl.style.display = 'block';
        
        // Position tooltip
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        // Calculate position to avoid viewport edges
        let left = x + 10;
        let top = y + 10;
        
        const tooltipRect = this.tooltipEl.getBoundingClientRect();
        if (left + tooltipRect.width > viewport.width) {
            left = x - tooltipRect.width - 10;
        }
        if (top + tooltipRect.height > viewport.height) {
            top = y - tooltipRect.height - 10;
        }
        
        this.tooltipEl.style.left = `${left}px`;
        this.tooltipEl.style.top = `${top}px`;
        
        // Update content
        this.updateTooltipContent(context);
    }

    updateTooltipContent(context, showDetails = false) {
        let content = '';
        
        switch (context.type) {
            case 'variable':
                content = this.formatVariableTooltip(context, showDetails);
                break;
            case 'node':
                content = this.formatNodeTooltip(context, showDetails);
                break;
            case 'connection':
                content = this.formatConnectionTooltip(context, showDetails);
                break;
        }
        
        this.tooltipEl.innerHTML = content;
    }

    formatVariableTooltip(context, showDetails) {
        const midiIcon = context.midiMapped ? 
            '<span class="tooltip-icon midi">🎹</span>' : '';
        
        let content = `
            <div class="tooltip-header">
                ${midiIcon}
                <span class="tooltip-title">${context.name}</span>
                <span class="tooltip-type">Variable</span>
            </div>
            <div class="tooltip-value">${context.value}</div>
        `;
        
        if (showDetails) {
            content += `
                <div class="tooltip-details">
                    <div class="tooltip-section">
                        <h4>Description</h4>
                        <p>${context.description || 'No description available'}</p>
                    </div>
                    ${this.formatConnectionsList(context.connections)}
                    ${this.formatHistory(context.history)}
                </div>
            `;
        }
        
        return content;
    }

    formatNodeTooltip(context, showDetails) {
        let content = `
            <div class="tooltip-header">
                <span class="tooltip-title">${context.name}</span>
                <span class="tooltip-type">Node</span>
            </div>
        `;
        
        if (showDetails) {
            content += `
                <div class="tooltip-details">
                    <div class="tooltip-section">
                        <h4>Description</h4>
                        <p>${context.description || 'No description available'}</p>
                    </div>
                    <div class="tooltip-section">
                        <h4>Inputs</h4>
                        ${this.formatPortsList(context.inputs)}
                    </div>
                    <div class="tooltip-section">
                        <h4>Outputs</h4>
                        ${this.formatPortsList(context.outputs)}
                    </div>
                    ${this.formatConnectionsList(context.connections)}
                </div>
            `;
        }
        
        return content;
    }

    formatConnectionTooltip(context, showDetails) {
        let content = `
            <div class="tooltip-header">
                <span class="tooltip-title">Connection</span>
                <span class="tooltip-status ${context.active ? 'active' : 'inactive'}">
                    ${context.active ? 'Active' : 'Inactive'}
                </span>
            </div>
            <div class="tooltip-connection">
                <span class="source">${context.source}</span>
                <span class="arrow">→</span>
                <span class="target">${context.target}</span>
            </div>
        `;
        
        if (showDetails && context.value !== undefined) {
            content += `
                <div class="tooltip-details">
                    <div class="tooltip-section">
                        <h4>Current Value</h4>
                        <p>${context.value}</p>
                    </div>
                </div>
            `;
        }
        
        return content;
    }

    formatConnectionsList(connections) {
        if (!connections || connections.length === 0) return '';
        
        return `
            <div class="tooltip-section">
                <h4>Connections</h4>
                <ul class="connections-list">
                    ${connections.map(conn => `
                        <li class="connection-item">
                            <span class="source">${conn.source}</span>
                            <span class="arrow">→</span>
                            <span class="target">${conn.target}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    formatPortsList(ports) {
        if (!ports || ports.length === 0) {
            return '<p>None</p>';
        }
        
        return `
            <ul class="ports-list">
                ${ports.map(port => `
                    <li class="port-item">
                        <span class="port-name">${port.name}</span>
                        <span class="port-type">${port.type}</span>
                    </li>
                `).join('')}
            </ul>
        `;
    }

    formatHistory(history) {
        if (!history || history.length === 0) return '';
        
        return `
            <div class="tooltip-section">
                <h4>Recent Changes</h4>
                <ul class="history-list">
                    ${history.slice(-3).map(entry => `
                        <li class="history-item">
                            <span class="history-value">${entry.value}</span>
                            <span class="history-time">${entry.time}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    hideTooltip() {
        this.activeTooltip = null;
        this.tooltipEl.style.display = 'none';
    }

    // Public API
    on(event, callback) {
        this.emitter.on(event, callback);
    }

    off(event, callback) {
        this.emitter.off(event, callback);
    }
}
