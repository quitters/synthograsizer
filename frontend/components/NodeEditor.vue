<template>
  <div 
    class="node-editor"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mousedown="onMouseDown"
    @wheel="onWheel"
  >
    <div 
      class="editor-content"
      :style="{
        transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
        transformOrigin: '0 0'
      }"
    >
      <svg class="connections-layer" :width="width" :height="height">
        <!-- Active connection being dragged -->
        <path
          v-if="draggingConnection"
          :d="getConnectionPath(draggingConnection)"
          class="connection-path active"
        />
        
        <!-- Existing connections -->
        <path
          v-for="connection in connections"
          :key="connection.id"
          :d="getConnectionPath(connection)"
          class="connection-path"
          :class="{
            'is-selected': selectedConnections.has(connection.id),
            'is-text': connection.type === 'text'
          }"
          @click="selectConnection(connection)"
        />
      </svg>

      <component
        v-for="node in nodes"
        :key="node.id"
        :is="getNodeComponent(node)"
        :node="node"
        :selected="selectedNodes.has(node.id)"
        :style="{
          position: 'absolute',
          left: `${node.position.x}px`,
          top: `${node.position.y}px`,
          transform: `translate(0, 0)`
        }"
        @mousedown.stop="startNodeDrag($event, node)"
        @select="selectNode(node)"
        @portMouseDown="startConnection"
        @portMouseUp="endConnection"
      />
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useStore } from 'vuex';
import VariableNodeView from './nodes/VariableNodeView.vue';
import TextInputNode from './nodes/text-nodes/TextInputNode.vue';
import TextTransformNode from './nodes/text-nodes/TextTransformNode.vue';

const NODE_COMPONENTS = {
  variable: 'variable-node-view',
  text: 'text-input-node',
  'text-transform': 'text-transform-node'
};

export default {
  name: 'NodeEditor',

  components: {
    'variable-node-view': VariableNodeView,
    'text-input-node': TextInputNode,
    'text-transform-node': TextTransformNode
  },

  setup() {
    const store = useStore();
    const width = ref(window.innerWidth);
    const height = ref(window.innerHeight);
    const draggingConnection = ref(null);
    const selectedConnections = ref(new Set());
    const draggingNode = ref(null);
    const panOffset = ref({ x: 0, y: 0 });
    const zoom = ref(1);
    const isPanning = ref(false);
    const lastMousePos = ref({ x: 0, y: 0 });

    const nodes = computed(() => store.getters['nodes/getAllNodes']);
    const connections = computed(() => store.getters['nodes/getAllConnections']);
    const selectedNodes = computed(() => new Set(store.getters['nodes/getSelectedNodes']));

    const updateSize = () => {
      width.value = window.innerWidth;
      height.value = window.innerHeight;
    };

    const getNodeComponent = (node) => {
      return NODE_COMPONENTS[node.type] || 'div';
    };

    const startNodeDrag = (event, node) => {
      event.stopPropagation();
      if (!selectedNodes.value.has(node.id)) {
        store.commit('nodes/clearSelection');
        store.commit('nodes/selectNode', node.id);
      }
      
      draggingNode.value = {
        node,
        startX: event.clientX,
        startY: event.clientY,
        originalX: node.position.x,
        originalY: node.position.y,
        selectedNodes: Array.from(selectedNodes.value).map(nodeId => {
          const selectedNode = nodes.value.find(n => n.id === nodeId);
          return {
            id: nodeId,
            originalX: selectedNode.position.x,
            originalY: selectedNode.position.y
          };
        })
      };
    };

    const onMouseDown = (event) => {
      if (event.button === 1 || (event.button === 0 && event.altKey)) {
        isPanning.value = true;
        lastMousePos.value = { x: event.clientX, y: event.clientY };
        event.preventDefault();
      } else if (event.target === event.currentTarget) {
        store.commit('nodes/clearSelection');
        selectedConnections.value.clear();
      }
    };

    const onMouseMove = (event) => {
      if (draggingConnection.value) {
        draggingConnection.value = {
          ...draggingConnection.value,
          endX: (event.clientX - panOffset.value.x) / zoom.value,
          endY: (event.clientY - panOffset.value.y) / zoom.value
        };
      } else if (draggingNode.value) {
        const dx = (event.clientX - draggingNode.value.startX) / zoom.value;
        const dy = (event.clientY - draggingNode.value.startY) / zoom.value;
        
        // Update positions of all selected nodes
        draggingNode.value.selectedNodes.forEach(selectedNode => {
          const node = nodes.value.find(n => n.id === selectedNode.id);
          if (node) {
            node.position = {
              x: selectedNode.originalX + dx,
              y: selectedNode.originalY + dy
            };
          }
        });
        
        // Update positions in store
        store.dispatch('nodes/updateNodePositions', nodes.value.filter(node => 
          selectedNodes.value.has(node.id)
        ));
      } else if (isPanning.value) {
        const dx = event.clientX - lastMousePos.value.x;
        const dy = event.clientY - lastMousePos.value.y;
        panOffset.value.x += dx;
        panOffset.value.y += dy;
        lastMousePos.value = { x: event.clientX, y: event.clientY };
      }
    };

    const onMouseUp = () => {
      draggingConnection.value = null;
      draggingNode.value = null;
      isPanning.value = false;
    };

    const onWheel = (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const delta = event.deltaY > 0 ? 0.9 : 1.1;
        const mouseX = event.clientX - panOffset.value.x;
        const mouseY = event.clientY - panOffset.value.y;
        
        const newZoom = Math.max(0.1, Math.min(2, zoom.value * delta));
        const scale = newZoom / zoom.value;
        
        panOffset.value.x = event.clientX - (mouseX * scale);
        panOffset.value.y = event.clientY - (mouseY * scale);
        zoom.value = newZoom;
      }
    };

    const startConnection = (event, port, node) => {
      const rect = event.target.getBoundingClientRect();
      const startX = (rect.left + rect.width / 2 - panOffset.value.x) / zoom.value;
      const startY = (rect.top + rect.height / 2 - panOffset.value.y) / zoom.value;

      draggingConnection.value = {
        sourceId: node.id,
        sourcePort: port,
        startX,
        startY,
        endX: startX,
        endY: startY,
        type: node.outputs.get(port).type
      };
    };

    const endConnection = (event, port, targetNode) => {
      if (draggingConnection.value && draggingConnection.value.sourceId !== targetNode.id) {
        store.dispatch('nodes/createConnection', {
          sourceId: draggingConnection.value.sourceId,
          sourcePort: draggingConnection.value.sourcePort,
          targetId: targetNode.id,
          targetPort: port
        });
      }
      draggingConnection.value = null;
    };

    const selectConnection = (connection) => {
      if (selectedConnections.value.has(connection.id)) {
        selectedConnections.value.delete(connection.id);
      } else {
        selectedConnections.value.add(connection.id);
      }
    };

    const getConnectionPath = (connection) => {
      const startX = connection.startX;
      const startY = connection.startY;
      const endX = connection.endX;
      const endY = connection.endY;
      
      const dx = Math.abs(endX - startX);
      const controlX = dx / 2;
      
      return `M ${startX} ${startY} C ${startX + controlX} ${startY}, ${endX - controlX} ${endY}, ${endX} ${endY}`;
    };

    onMounted(() => {
      window.addEventListener('resize', updateSize);
      updateSize();
    });

    onUnmounted(() => {
      window.removeEventListener('resize', updateSize);
    });

    return {
      width,
      height,
      nodes,
      connections,
      selectedNodes,
      selectedConnections,
      draggingConnection,
      panOffset,
      zoom,
      getNodeComponent,
      startNodeDrag,
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onWheel,
      startConnection,
      endConnection,
      selectConnection,
      getConnectionPath
    };
  }
};
</script>

<style>
.node-editor {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--editor-bg);
  cursor: default;
  user-select: none;
}

.editor-content {
  position: absolute;
  width: 100%;
  height: 100%;
}

.connections-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.connection-path {
  fill: none;
  stroke: var(--connection-default);
  stroke-width: 4;
  pointer-events: stroke;
  transition: all 0.2s ease;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.connection-path.active {
  stroke: var(--connection-active);
  stroke-width: 6;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
}

.connection-path.is-selected {
  stroke: var(--connection-selected);
  stroke-width: 6;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
}

.connection-path.is-text {
  stroke: var(--connection-text);
}

.connection-path:hover {
  stroke-width: 6;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
  cursor: pointer;
}

.port-handle {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--connection-default);
  border: 2px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  box-shadow: var(--shadow-sm);
}

.port-handle::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  background: var(--bg-primary);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: all 0.2s ease;
}

.port-handle:hover {
  transform: scale(1.2);
  border-color: var(--accent-primary);
  box-shadow: var(--shadow-md);
}

.port-handle:hover::before {
  background: var(--accent-primary);
}

.port-handle.is-connected {
  background: var(--connection-active);
  border-color: var(--connection-active);
  box-shadow: var(--shadow-md);
}

.port-handle.is-connected::before {
  background: var(--bg-primary);
}

.port-handle.is-dragging {
  transform: scale(1.2);
  background: var(--connection-active);
  border-color: var(--connection-active);
  box-shadow: var(--shadow-lg);
}

.port-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0 var(--spacing-sm);
  user-select: none;
}

.input-port,
.output-port {
  display: flex;
  align-items: center;
  padding: 4px;
  position: relative;
}

.input-port {
  justify-content: flex-start;
}

.output-port {
  justify-content: flex-end;
}

.node-ports {
  padding: var(--spacing-sm);
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}
</style>
