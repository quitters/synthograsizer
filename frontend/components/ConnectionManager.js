import mitt from 'mitt';
import { store } from '../modules/store';

export class ConnectionManager {
    constructor(container) {
        this.container = container;
        this.emitter = mitt();
        this.connections = new Map();
        this.previewConnection = null;
        this.dragStartPort = null;
        this.svgContainer = null;
        
        this.init();
    }

    init() {
        // Create SVG container for connections
        this.svgContainer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svgContainer.classList.add('connections-layer');
        this.container.appendChild(this.svgContainer);

        // Initialize existing connections
        this.initializeConnections();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Subscribe to store updates
        store.subscribe('connectionUpdate', this.handleConnectionUpdate.bind(this));
        store.subscribe('nodeMove', this.handleNodeMove.bind(this));
    }

    initializeConnections() {
        const state = store.getState();
        state.connections.forEach((conn, id) => {
            this.createConnection(conn);
        });
    }

    setupEventListeners() {
        // Port interaction events
        this.container.addEventListener('mousedown', this.handlePortMouseDown.bind(this));
        this.container.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.container.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        // Window resize handler
        window.addEventListener('resize', this.handleResize.bind(this));
    }

    handlePortMouseDown(e) {
        const port = e.target.closest('.port');
        if (!port) return;

        this.dragStartPort = port;
        const portRect = port.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();

        // Create preview connection
        this.previewConnection = {
            id: 'preview',
            source: {
                x: portRect.left + portRect.width / 2 - containerRect.left,
                y: portRect.top + portRect.height / 2 - containerRect.top
            },
            target: {
                x: e.clientX - containerRect.left,
                y: e.clientY - containerRect.top
            },
            element: this.createConnectionElement('preview')
        };

        // Add preview class
        this.previewConnection.element.classList.add('preview');
    }

    handleMouseMove(e) {
        if (!this.previewConnection) return;

        const containerRect = this.container.getBoundingClientRect();
        this.previewConnection.target = {
            x: e.clientX - containerRect.left,
            y: e.clientY - containerRect.top
        };

        this.updateConnectionPath(this.previewConnection);
    }

    handleMouseUp(e) {
        if (!this.previewConnection) return;

        const targetPort = e.target.closest('.port');
        if (targetPort && targetPort !== this.dragStartPort) {
            this.createConnectionFromPorts(this.dragStartPort, targetPort);
        }

        // Clean up preview
        if (this.previewConnection.element) {
            this.previewConnection.element.remove();
        }
        this.previewConnection = null;
        this.dragStartPort = null;
    }

    handleConnectionUpdate(data) {
        const { id, type, connection } = data;
        
        switch (type) {
            case 'add':
                this.createConnection(connection);
                break;
            case 'remove':
                this.removeConnection(id);
                break;
            case 'update':
                this.updateConnection(id, connection);
                break;
        }
    }

    handleNodeMove(data) {
        const { nodeId, position } = data;
        
        // Update all connections connected to this node
        this.connections.forEach(conn => {
            if (conn.sourceNode === nodeId || conn.targetNode === nodeId) {
                this.updateConnectionPositions(conn);
            }
        });
    }

    handleResize() {
        // Update all connection positions
        this.connections.forEach(conn => {
            this.updateConnectionPositions(conn);
        });
    }

    createConnection(connection) {
        const element = this.createConnectionElement(connection.id);
        const sourcePort = this.findPort(connection.source);
        const targetPort = this.findPort(connection.target);
        
        if (!sourcePort || !targetPort) {
            console.warn('Could not find ports for connection:', connection);
            return;
        }

        const conn = {
            id: connection.id,
            sourceNode: sourcePort.closest('.visual-node').dataset.id,
            targetNode: targetPort.closest('.visual-node').dataset.id,
            element,
            active: connection.active
        };

        this.connections.set(connection.id, conn);
        this.updateConnectionPositions(conn);

        // Set initial state
        if (connection.active) {
            element.classList.add('active');
        }
    }

    createConnectionFromPorts(sourcePort, targetPort) {
        const sourceNode = sourcePort.closest('.visual-node');
        const targetNode = targetPort.closest('.visual-node');
        
        const connection = {
            id: `conn_${Date.now()}`,
            source: sourceNode.dataset.id,
            target: targetNode.dataset.id,
            active: true
        };

        // Dispatch to store
        store.dispatch('addConnection', connection);
    }

    removeConnection(id) {
        const connection = this.connections.get(id);
        if (connection) {
            connection.element.remove();
            this.connections.delete(id);
        }
    }

    updateConnection(id, data) {
        const connection = this.connections.get(id);
        if (!connection) return;

        // Update active state
        connection.active = data.active;
        connection.element.classList.toggle('active', data.active);

        // Update positions if needed
        if (data.source || data.target) {
            this.updateConnectionPositions(connection);
        }
    }

    updateConnectionPositions(connection) {
        const sourceNode = this.container.querySelector(
            `.visual-node[data-id="${connection.sourceNode}"]`
        );
        const targetNode = this.container.querySelector(
            `.visual-node[data-id="${connection.targetNode}"]`
        );
        
        if (!sourceNode || !targetNode) return;

        const sourcePort = sourceNode.querySelector('.port.output');
        const targetPort = targetNode.querySelector('.port.input');
        
        const containerRect = this.container.getBoundingClientRect();
        const sourceRect = sourcePort.getBoundingClientRect();
        const targetRect = targetPort.getBoundingClientRect();

        const source = {
            x: sourceRect.left + sourceRect.width / 2 - containerRect.left,
            y: sourceRect.top + sourceRect.height / 2 - containerRect.top
        };

        const target = {
            x: targetRect.left + targetRect.width / 2 - containerRect.left,
            y: targetRect.top + targetRect.height / 2 - containerRect.top
        };

        this.updateConnectionPath({
            element: connection.element,
            source,
            target
        });
    }

    createConnectionElement(id) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('connection-line');
        svg.dataset.id = id;
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        svg.appendChild(path);
        
        this.svgContainer.appendChild(svg);
        return svg;
    }

    updateConnectionPath(connection) {
        const { source, target, element } = connection;
        
        // Calculate control points for the curve
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const controlPoint1 = {
            x: source.x + dx * 0.5,
            y: source.y
        };
        const controlPoint2 = {
            x: target.x - dx * 0.5,
            y: target.y
        };

        // Create the path
        const path = `M ${source.x},${source.y} ` +
                    `C ${controlPoint1.x},${controlPoint1.y} ` +
                    `${controlPoint2.x},${controlPoint2.y} ` +
                    `${target.x},${target.y}`;

        // Update the path element
        const pathElement = element.querySelector('path');
        pathElement.setAttribute('d', path);

        // Update SVG viewport
        const bbox = pathElement.getBBox();
        element.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
        element.style.left = `${bbox.x}px`;
        element.style.top = `${bbox.y}px`;
        element.style.width = `${bbox.width}px`;
        element.style.height = `${bbox.height}px`;
    }

    findPort(nodeId) {
        const node = this.container.querySelector(`.visual-node[data-id="${nodeId}"]`);
        return node ? node.querySelector('.port') : null;
    }

    // Public API
    getConnection(id) {
        return this.connections.get(id);
    }

    getAllConnections() {
        return Array.from(this.connections.values());
    }

    on(event, callback) {
        this.emitter.on(event, callback);
    }

    off(event, callback) {
        this.emitter.off(event, callback);
    }
}
