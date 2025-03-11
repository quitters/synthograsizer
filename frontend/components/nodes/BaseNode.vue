<template>
  <div 
    class="node"
    :class="{ 'is-selected': selected }"
    :style="nodeStyle"
  >
    <div 
      class="node-header"
      @mousedown.stop="$emit('mousedown', $event)"
    >
      <slot name="header">
        <span class="node-title">{{ node.name || 'Node' }}</span>
        <span class="node-type">{{ node.type }}</span>
      </slot>
    </div>

    <div class="node-content" ref="content">
      <slot></slot>
    </div>

    <div class="node-ports">
      <div class="input-ports">
        <div 
          v-for="[portName, port] in node.inputs"
          :key="portName"
          class="input-port"
          :class="{ 'is-connected': isPortConnected('input', portName) }"
        >
          <div 
            class="port-handle"
            :class="{
              'is-connected': isPortConnected('input', portName),
              'is-dragging': isDraggingToPort('input', portName)
            }"
            data-port-type="input"
            :data-port-name="portName"
            @mousedown.stop="onPortMouseDown($event, 'input', portName)"
            @mouseup.stop="onPortMouseUp($event, 'input', portName)"
          ></div>
          <span class="port-label">{{ portName }}</span>
        </div>
      </div>

      <div class="output-ports">
        <div 
          v-for="[portName, port] in node.outputs"
          :key="portName"
          class="output-port"
          :class="{ 'is-connected': isPortConnected('output', portName) }"
        >
          <span class="port-label">{{ portName }}</span>
          <div 
            class="port-handle"
            :class="{
              'is-connected': isPortConnected('output', portName),
              'is-dragging': isDraggingFromPort('output', portName)
            }"
            data-port-type="output"
            :data-port-name="portName"
            @mousedown.stop="onPortMouseDown($event, 'output', portName)"
            @mouseup.stop="onPortMouseUp($event, 'output', portName)"
          ></div>
        </div>
      </div>
    </div>

    <!-- Resize handles -->
    <div 
      v-for="handle in resizeHandles" 
      :key="handle"
      class="resize-handle"
      :class="handle"
      @mousedown.stop="startResize($event, handle)"
    ></div>
  </div>
</template>

<script>
import { computed, ref } from 'vue';
import { useStore } from 'vuex';

export default {
  name: 'BaseNode',

  props: {
    node: {
      type: Object,
      required: true
    },
    selected: {
      type: Boolean,
      default: false
    },
    initialWidth: {
      type: Number,
      default: 240
    }
  },

  setup(props, { emit }) {
    const store = useStore();
    const width = ref(props.initialWidth);
    const height = ref(null);
    const content = ref(null);
    const isResizing = ref(false);
    const resizeDirection = ref(null);
    const startX = ref(0);
    const startY = ref(0);
    const startWidth = ref(0);
    const startHeight = ref(0);

    const connections = computed(() => store.getters['nodes/getAllConnections']);
    const draggingConnection = computed(() => store.state.nodes.draggingConnection);

    const nodeStyle = computed(() => ({
      width: `${width.value}px`,
      height: height.value ? `${height.value}px` : 'auto'
    }));

    const resizeHandles = ['e', 'se', 's'];

    const isPortConnected = (type, portName) => {
      return connections.value.some(conn => {
        if (type === 'input') {
          return conn.targetId === props.node.id && conn.targetPort === portName;
        } else {
          return conn.sourceId === props.node.id && conn.sourcePort === portName;
        }
      });
    };

    const isDraggingToPort = (type, portName) => {
      if (!draggingConnection.value || type !== 'input') return false;
      return draggingConnection.value.targetId === props.node.id && 
             draggingConnection.value.targetPort === portName;
    };

    const isDraggingFromPort = (type, portName) => {
      if (!draggingConnection.value || type !== 'output') return false;
      return draggingConnection.value.sourceId === props.node.id && 
             draggingConnection.value.sourcePort === portName;
    };

    const onPortMouseDown = (event, type, portName) => {
      if (type === 'output') {
        emit('portMouseDown', event, portName, props.node);
      }
    };

    const onPortMouseUp = (event, type, portName) => {
      if (type === 'input') {
        emit('portMouseUp', event, portName, props.node);
      }
    };

    const startResize = (event, direction) => {
      isResizing.value = true;
      resizeDirection.value = direction;
      startX.value = event.clientX;
      startY.value = event.clientY;
      startWidth.value = width.value;
      startHeight.value = height.value || content.value.offsetHeight;

      window.addEventListener('mousemove', onResize);
      window.addEventListener('mouseup', stopResize);
    };

    const onResize = (event) => {
      if (!isResizing.value) return;

      const dx = event.clientX - startX.value;
      const dy = event.clientY - startY.value;

      if (resizeDirection.value.includes('e')) {
        width.value = Math.max(240, startWidth.value + dx);
      }
      if (resizeDirection.value.includes('s')) {
        height.value = Math.max(100, startHeight.value + dy);
      }
    };

    const stopResize = () => {
      isResizing.value = false;
      window.removeEventListener('mousemove', onResize);
      window.removeEventListener('mouseup', stopResize);
    };

    return {
      width,
      height,
      content,
      nodeStyle,
      resizeHandles,
      isPortConnected,
      isDraggingToPort,
      isDraggingFromPort,
      onPortMouseDown,
      onPortMouseUp,
      startResize
    };
  }
};
</script>

<style>
.node {
  background: var(--node-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: var(--shadow-sm);
  position: relative;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.node.is-selected {
  border-color: var(--node-selected);
  box-shadow: 0 0 0 2px var(--node-selected);
}

.node-header {
  background: var(--node-header);
  padding: var(--spacing-sm);
  border-bottom: 1px solid var(--border-color);
  border-radius: 6px 6px 0 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: move;
}

.node-title {
  font-weight: 500;
  color: var(--text-primary);
}

.node-type {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  padding: 2px 6px;
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.node-content {
  padding: var(--spacing-sm);
}

.resize-handle {
  position: absolute;
  background: transparent;
  z-index: 1;
}

.resize-handle.e {
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  cursor: ew-resize;
}

.resize-handle.s {
  bottom: -4px;
  left: 0;
  width: 100%;
  height: 8px;
  cursor: ns-resize;
}

.resize-handle.se {
  bottom: -4px;
  right: -4px;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
}

.node-ports {
  padding: var(--spacing-sm);
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.input-ports,
.output-ports {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}
</style>
