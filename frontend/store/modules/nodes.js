import { v4 as uuidv4 } from 'uuid';

export default {
    namespaced: true,

    state: () => ({
        nodes: new Map(),
        connections: new Map(),
        selectedNodes: new Set(),
        hoveredNode: null,
        draggingConnection: null,
        nodePositions: new Map()
    }),

    mutations: {
        CREATE_NODE(state, node) {
            node.id = node.id || uuidv4();
            state.nodes.set(node.id, node);
            if (node.position) {
                state.nodePositions.set(node.id, { ...node.position });
            }
        },

        UPDATE_NODE(state, { id, changes }) {
            const node = state.nodes.get(id);
            if (node) {
                Object.assign(node, changes);
            }
        },

        UPDATE_NODE_POSITION(state, { id, position }) {
            const node = state.nodes.get(id);
            if (node) {
                node.position = { ...position };
                state.nodePositions.set(id, { ...position });
            }
        },

        UPDATE_NODE_POSITIONS(state, nodes) {
            nodes.forEach(node => {
                if (node.position) {
                    state.nodePositions.set(node.id, { ...node.position });
                }
            });
        },

        DELETE_NODE(state, id) {
            // Delete all connections to/from this node
            for (const [connectionId, connection] of state.connections) {
                if (connection.sourceId === id || connection.targetId === id) {
                    state.connections.delete(connectionId);
                }
            }
            state.nodes.delete(id);
            state.nodePositions.delete(id);
            state.selectedNodes.delete(id);
        },

        CREATE_CONNECTION(state, { sourceId, targetId, sourcePort, targetPort }) {
            const id = uuidv4();
            state.connections.set(id, {
                id,
                sourceId,
                targetId,
                sourcePort,
                targetPort
            });

            // Add connection to source node's output port
            const sourceNode = state.nodes.get(sourceId);
            if (sourceNode && sourceNode.outputs.has(sourcePort)) {
                sourceNode.outputs.get(sourcePort).connections.push({
                    id,
                    targetId,
                    targetPort
                });
            }

            // Add connection to target node's input port
            const targetNode = state.nodes.get(targetId);
            if (targetNode && targetNode.inputs.has(targetPort)) {
                targetNode.inputs.get(targetPort).connections.push({
                    id,
                    sourceId,
                    sourcePort
                });
            }
        },

        DELETE_CONNECTION(state, id) {
            const connection = state.connections.get(id);
            if (connection) {
                // Remove from source node
                const sourceNode = state.nodes.get(connection.sourceId);
                if (sourceNode && sourceNode.outputs.has(connection.sourcePort)) {
                    const connections = sourceNode.outputs.get(connection.sourcePort).connections;
                    const index = connections.findIndex(c => c.id === id);
                    if (index !== -1) {
                        connections.splice(index, 1);
                    }
                }

                // Remove from target node
                const targetNode = state.nodes.get(connection.targetId);
                if (targetNode && targetNode.inputs.has(connection.targetPort)) {
                    const connections = targetNode.inputs.get(connection.targetPort).connections;
                    const index = connections.findIndex(c => c.id === id);
                    if (index !== -1) {
                        connections.splice(index, 1);
                    }
                }

                state.connections.delete(id);
            }
        },

        SELECT_NODE(state, id) {
            state.selectedNodes.add(id);
        },

        DESELECT_NODE(state, id) {
            state.selectedNodes.delete(id);
        },

        TOGGLE_NODE_SELECTION(state, id) {
            if (state.selectedNodes.has(id)) {
                state.selectedNodes.delete(id);
            } else {
                state.selectedNodes.add(id);
            }
        },

        CLEAR_SELECTION(state) {
            state.selectedNodes.clear();
        },

        SET_HOVERED_NODE(state, id) {
            state.hoveredNode = id;
        },

        SET_DRAGGING_CONNECTION(state, data) {
            state.draggingConnection = data;
        },

        CLEAR_ALL(state) {
            state.nodes.clear();
            state.connections.clear();
            state.selectedNodes.clear();
            state.hoveredNode = null;
            state.draggingConnection = null;
            state.nodePositions.clear();
        }
    },

    actions: {
        createNode({ commit }, node) {
            commit('CREATE_NODE', node);
            return node.id;
        },

        updateNode({ commit }, payload) {
            commit('UPDATE_NODE', payload);
        },

        deleteNode({ commit }, id) {
            commit('DELETE_NODE', id);
        },

        createConnection({ commit, state }, { sourceId, targetId, sourcePort, targetPort }) {
            // Check if connection already exists
            const exists = Array.from(state.connections.values()).some(conn => 
                conn.sourceId === sourceId && 
                conn.targetId === targetId &&
                conn.sourcePort === sourcePort &&
                conn.targetPort === targetPort
            );

            if (!exists) {
                commit('CREATE_CONNECTION', {
                    sourceId,
                    targetId,
                    sourcePort,
                    targetPort
                });
            }
        },

        deleteConnection({ commit }, id) {
            commit('DELETE_CONNECTION', id);
        },

        selectNode({ commit }, id) {
            commit('SELECT_NODE', id);
        },

        deselectNode({ commit }, id) {
            commit('DESELECT_NODE', id);
        },

        toggleNodeSelection({ commit }, id) {
            commit('TOGGLE_NODE_SELECTION', id);
        },

        clearSelection({ commit }) {
            commit('CLEAR_SELECTION');
        },

        setHoveredNode({ commit }, id) {
            commit('SET_HOVERED_NODE', id);
        },

        setDraggingConnection({ commit }, data) {
            commit('SET_DRAGGING_CONNECTION', data);
        },

        clearAll({ commit }) {
            commit('CLEAR_ALL');
        },

        updateNodePosition({ commit }, { id, position }) {
            commit('UPDATE_NODE_POSITION', { id, position });
        },

        updateNodePositions({ commit }, nodes) {
            commit('UPDATE_NODE_POSITIONS', nodes);
        }
    },

    getters: {
        getAllNodes: state => Array.from(state.nodes.values()),
        
        getNode: state => id => state.nodes.get(id),
        
        getAllConnections: state => Array.from(state.connections.values()),
        
        getConnection: state => id => state.connections.get(id),
        
        getNodeConnections: state => nodeId => {
            return Array.from(state.connections.values()).filter(conn => 
                conn.sourceId === nodeId || conn.targetId === nodeId
            );
        },
        
        isNodeSelected: state => id => state.selectedNodes.has(id),
        
        getSelectedNodes: state => Array.from(state.selectedNodes),
        
        getHoveredNode: state => state.hoveredNode,
        
        getDraggingConnection: state => state.draggingConnection,

        getConnectedNodes: state => nodeId => {
            const connections = Array.from(state.connections.values());
            return {
                inputs: connections
                    .filter(conn => conn.targetId === nodeId)
                    .map(conn => ({
                        node: state.nodes.get(conn.sourceId),
                        port: conn.sourcePort,
                        connection: conn
                    })),
                outputs: connections
                    .filter(conn => conn.sourceId === nodeId)
                    .map(conn => ({
                        node: state.nodes.get(conn.targetId),
                        port: conn.targetPort,
                        connection: conn
                    }))
            };
        },

        getNodePosition: state => id => state.nodePositions.get(id)
    }
};
