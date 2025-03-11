<template>
  <BaseNode 
    :node="node" 
    :selected="selected" 
    :initial-width="280"
    @mousedown="$emit('mousedown', $event)"
  >
    <template #header>
      <span class="node-title">{{ node.name }}</span>
      <span class="node-type">{{ node.type }}</span>
    </template>
    
    <div class="node-content">
      <textarea
        v-model="text"
        class="text-input"
        :placeholder="node.placeholder || 'Enter text...'"
      ></textarea>
      
      <div class="text-stats">
        <span class="stat">
          <span class="stat-label">Tokens:</span>
          <span class="stat-value">{{ tokenCount }}</span>
        </span>
        <span class="stat">
          <span class="stat-label">Characters:</span>
          <span class="stat-value">{{ text.length }}</span>
        </span>
      </div>
    </div>

    <template #ports>
      <div 
        class="output-port" 
        data-port="output" 
        data-type="text"
        @mousedown.stop="$emit('portMouseDown', $event, 'output', node)"
        @mouseup.stop="$emit('portMouseUp', $event, 'output', node)"
      >
        <span class="port-label">Output</span>
        <div 
          class="port-handle"
          :class="{
            'is-connected': isPortConnected('output', 'output')
          }"
        ></div>
      </div>
    </template>
  </BaseNode>
</template>

<script>
import { ref, computed, watch } from 'vue';
import { useStore } from 'vuex';
import BaseNode from '../BaseNode.vue';
import { TextProcessor } from '../../../modules/textProcessing/textProcessor';

export default {
  name: 'TextInputNode',

  components: {
    BaseNode
  },

  props: {
    node: {
      type: Object,
      required: true
    },
    selected: {
      type: Boolean,
      default: false
    }
  },

  setup(props) {
    const store = useStore();
    const text = ref(props.node.value || '');
    
    const tokenCount = computed(() => {
      return TextProcessor.countTokens(text.value);
    });

    const isPortConnected = (type, portName) => {
      const connections = store.getters['nodes/getAllConnections'];
      return connections.some(conn => {
        if (type === 'input') {
          return conn.targetId === props.node.id && conn.targetPort === portName;
        } else {
          return conn.sourceId === props.node.id && conn.sourcePort === portName;
        }
      });
    };

    watch(text, (newValue) => {
      props.node.onValueChange(newValue);
    });

    return {
      text,
      tokenCount,
      isPortConnected
    };
  }
};
</script>

<style>
.node-content {
  padding: var(--spacing-sm);
}

.text-input {
  width: 100%;
  min-height: 100px;
  padding: var(--spacing-sm);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  resize: vertical;
  transition: all var(--transition-fast);
}

.text-input:hover {
  border-color: var(--accent-primary);
}

.text-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary-alpha);
}

.text-stats {
  display: flex;
  justify-content: space-between;
  margin-top: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.stat {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.stat-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.stat-value {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  font-family: var(--font-mono);
}
</style>
