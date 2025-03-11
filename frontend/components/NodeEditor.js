import { store } from '../modules/store';

export class NodeEditor {
    constructor(container) {
        this.container = container;
        this.nodes = new Map();
        this.connections = new Map();
        this.dragState = null;
        
        this.initializeUI();
        this.setupEventListeners();
    }

    initializeUI() {
        this.container.innerHTML = `
            <div class="node-editor-toolbar">
                <button class="add-node-btn" title="Add Node">
                    <i class="fas fa-plus"></i> Add Node
                </button>
                <div class="node-types">
                    <button class="node-type" data-type="variable">Variable</button>
                    <button class="node-type" data-type="operator">Operator</button>
                    <button class="node-type" data-type="output">Output</button>
                </div>
            </div>
            <div class="node-editor-canvas">
                <svg class="connections-layer"></svg>
                <div class="nodes-layer"></div>
            </div>
        `;

        // Initialize layers
        this.connectionsLayer = this.container.querySelector('.connections-layer');
        this.nodesLayer = this.container.querySelector('.nodes-layer');
    }

    setupEventListeners() {
        // Node creation
        this.container.querySelector('.add-node-btn').addEventListener('click', () => {
            this.showNodeTypes();
        });

        this.container.querySelector('.node-types').addEventListener('click', (e) => {
            const type = e.target.dataset.type;
            if (type) {
                this.createNode(type);
            }
        });

        // Canvas events
        const canvas = this.container.querySelector('.node-editor-canvas');
        canvas.addEventListener('mousedown', this.handleCanvasMouseDown.bind(this));
        canvas.addEventListener('mousemove', this.handleCanvasMouseMove.bind(this));
        canvas.addEventListener('mouseup', this.handleCanvasMouseUp.bind(this));

        // Store events
        store.subscribe('nodeUpdate', (event) => {
            switch (event.type) {
                case 'add':
                    this.renderNode(event.node);
                    break;
                case 'update':
                    this.updateNode(event.id, event.node);
                    break;
                case 'remove':
                    this.removeNode(event.id);
                    break;
            }
        });

        store.subscribe('connectionUpdate', (event) => {
            switch (event.type) {
                case 'add':
                    this.renderConnection(event.connection);
                    break;
                case 'remove':
                    this.removeConnection(event.id);
                    break;
            }
        });
    }

    showNodeTypes() {
        const types = this.container.querySelector('.node-types');
        types.style.display = types.style.display === 'none' ? 'flex' : 'none';
    }

    createNode(type) {
        const id = 'node_' + Date.now();
        const node = {
            id,
            type,
            position: { x: 100, y: 100 },
            inputs: [],
            outputs: []
        };

        store.dispatch('addNode', node);
    }

    renderNode(node) {
        const nodeEl = document.createElement('div');
        nodeEl.className = `node node-${node.type}`;
        nodeEl.id = node.id;
        nodeEl.style.left = `${node.position.x}px`;
        nodeEl.style.top = `${node.position.y}px`;

        nodeEl.innerHTML = `
            <div class="node-header">
                <span class="node-title">${node.type}</span>
                <button class="node-delete">×</button>
            </div>
            <div class="node-content">
                <div class="node-inputs">
                    ${node.inputs.map(input => `
                        <div class="node-port node-input" data-port="${input.id}">
                            <div class="port-point"></div>
                            <span class="port-label">${input.name}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="node-outputs">
                    ${node.outputs.map(output => `
                        <div class="node-port node-output" data-port="${output.id}">
                            <span class="port-label">${output.name}</span>
                            <div class="port-point"></div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        this.nodesLayer.appendChild(nodeEl);
        this.nodes.set(node.id, nodeEl);

        // Add node-specific event listeners
        nodeEl.querySelector('.node-delete').addEventListener('click', () => {
            store.dispatch('removeNode', node.id);
        });

        nodeEl.addEventListener('mousedown', (e) => {
            if (e.target.closest('.node-port')) return;
            this.startNodeDrag(node.id, e);
        });
    }

    updateNode(id, updates) {
        const nodeEl = this.nodes.get(id);
        if (!nodeEl) return;

        if (updates.position) {
            nodeEl.style.left = `${updates.position.x}px`;
            nodeEl.style.top = `${updates.position.y}px`;
            this.updateConnections(id);
        }
    }

    removeNode(id) {
        const nodeEl = this.nodes.get(id);
        if (nodeEl) {
            nodeEl.remove();
            this.nodes.delete(id);
        }
    }

    renderConnection(connection) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'connection');
        path.setAttribute('id', connection.id);
        
        this.updateConnectionPath(connection, path);
        this.connectionsLayer.appendChild(path);
        this.connections.set(connection.id, path);
    }

    removeConnection(id) {
        const path = this.connections.get(id);
        if (path) {
            path.remove();
            this.connections.delete(id);
        }
    }

    updateConnections(nodeId) {
        // Update all connections connected to this node
        this.connections.forEach((path, id) => {
            const connection = store.getConnection(id);
            if (connection.source === nodeId || connection.target === nodeId) {
                this.updateConnectionPath(connection, path);
            }
        });
    }

    updateConnectionPath(connection, path) {
        const sourceNode = this.nodes.get(connection.source);
        const targetNode = this.nodes.get(connection.target);
        if (!sourceNode || !targetNode) return;

        const sourcePort = sourceNode.querySelector(`[data-port="${connection.sourcePort}"]`);
        const targetPort = targetNode.querySelector(`[data-port="${connection.targetPort}"]`);
        if (!sourcePort || !targetPort) return;

        const sourcePoint = this.getPortPosition(sourcePort);
        const targetPoint = this.getPortPosition(targetPort);
        
        const controlPoint1 = {
            x: sourcePoint.x + 100,
            y: sourcePoint.y
        };
        const controlPoint2 = {
            x: targetPoint.x - 100,
            y: targetPoint.y
        };

        path.setAttribute('d', `M ${sourcePoint.x} ${sourcePoint.y} C ${controlPoint1.x} ${controlPoint1.y}, ${controlPoint2.x} ${controlPoint2.y}, ${targetPoint.x} ${targetPoint.y}`);
    }

    getPortPosition(portEl) {
        const rect = portEl.querySelector('.port-point').getBoundingClientRect();
        const canvasRect = this.container.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2 - canvasRect.left,
            y: rect.top + rect.height / 2 - canvasRect.top
        };
    }

    startNodeDrag(nodeId, event) {
        const nodeEl = this.nodes.get(nodeId);
        if (!nodeEl) return;

        this.dragState = {
            nodeId,
            startX: event.clientX,
            startY: event.clientY,
            nodeX: parseInt(nodeEl.style.left),
            nodeY: parseInt(nodeEl.style.top)
        };

        nodeEl.classList.add('dragging');
    }

    handleCanvasMouseMove(event) {
        if (!this.dragState) return;

        const dx = event.clientX - this.dragState.startX;
        const dy = event.clientY - this.dragState.startY;

        const newX = this.dragState.nodeX + dx;
        const newY = this.dragState.nodeY + dy;

        store.dispatch('nodeMove', {
            nodeId: this.dragState.nodeId,
            position: { x: newX, y: newY }
        });
    }

    handleCanvasMouseUp() {
        if (!this.dragState) return;

        const nodeEl = this.nodes.get(this.dragState.nodeId);
        if (nodeEl) {
            nodeEl.classList.remove('dragging');
        }

        this.dragState = null;
    }

    handleResize() {
        // Update SVG viewBox when container size changes
        const rect = this.container.getBoundingClientRect();
        this.connectionsLayer.setAttribute('width', rect.width);
        this.connectionsLayer.setAttribute('height', rect.height);
    }

    updateFromPrompt(data) {
        // Update nodes based on prompt changes
        this.nodes.forEach((nodeEl, id) => {
            const node = store.getNode(id);
            if (node && node.type === 'output') {
                // Update output nodes with new prompt data
                store.dispatch('updateNode', {
                    id,
                    value: data.value
                });
            }
        });
    }
}
