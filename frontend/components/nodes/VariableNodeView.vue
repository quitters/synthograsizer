<template>
  <BaseNode 
    :node="node" 
    :selected="selected" 
    :initial-width="280"
  >
    <template #header>
      <span class="node-title">{{ node.name }}</span>
      <span class="node-type">{{ node.variableType }}</span>
    </template>
    
    <div class="node-content">
      <component
        :is="getControlComponent"
        v-model="value"
        :value="value"
        :variable="variable"
        :options="node.options"
        @input="onValueChange"
      />
    </div>

    <template #ports>
      <div 
        class="output-port" 
        data-port="value" 
        :data-type="node.variableType"
        @mousedown.stop="$emit('portMouseDown', $event, 'value', node)"
        @mouseup.stop="$emit('portMouseUp', $event, 'value', node)"
      >
        <span class="port-label">Value</span>
        <div 
          class="port-handle"
          :class="{
            'is-connected': isPortConnected('output', 'value')
          }"
        ></div>
      </div>
    </template>
  </BaseNode>
</template>

<script>
import { computed } from 'vue';
import { useStore } from 'vuex';
import BaseNode from './BaseNode.vue';
import NodeNumberControl from './controls/NodeNumberControl.vue';
import NodeBooleanControl from './controls/NodeBooleanControl.vue';
import NodeColorControl from './controls/NodeColorControl.vue';

const CONTROL_COMPONENTS = {
  number: NodeNumberControl,
  boolean: NodeBooleanControl,
  color: NodeColorControl
};

export default {
  name: 'VariableNodeView',

  components: {
    BaseNode,
    NodeNumberControl,
    NodeBooleanControl,
    NodeColorControl
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
    const value = computed({
      get: () => props.node.getValue(),
      set: (val) => props.node.onValueChange(val)
    });

    const variable = computed(() => {
      return store.getters['variables/getVariable'](props.node.variableId);
    });

    const getControlComponent = computed(() => {
      return CONTROL_COMPONENTS[props.node.variableType] || null;
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

    const onValueChange = (newValue) => {
      props.node.onValueChange(newValue);
    };

    return {
      value,
      variable,
      getControlComponent,
      isPortConnected,
      onValueChange
    };
  }
};
</script>

<style>
.node-content {
  padding: var(--spacing-sm);
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
</style>
