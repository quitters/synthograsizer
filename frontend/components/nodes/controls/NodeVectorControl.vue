<template>
  <div class="node-vector-control">
    <div
      v-for="(component, index) in value"
      :key="index"
      class="vector-component"
    >
      <label>{{ ['X', 'Y', 'Z', 'W'][index] }}</label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="component"
        @input="updateComponent(index, $event)"
      />
      <span class="component-value">{{ formatValue(component) }}</span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'NodeVectorControl',
  
  props: {
    value: {
      type: Array,
      required: true
    },
    variable: {
      type: Object,
      required: true
    }
  },

  methods: {
    updateComponent(index, event) {
      const newValue = [...this.value];
      newValue[index] = Number(event.target.value);
      this.$emit('input', newValue);
    },

    formatValue(val) {
      return val.toFixed(2);
    }
  }
};
</script>

<style>
.node-vector-control {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.vector-component {
  display: grid;
  grid-template-columns: 20px 1fr 40px;
  gap: var(--spacing-sm);
  align-items: center;
}

.vector-component label {
  color: var(--text-secondary);
  font-size: 0.9em;
}

.component-value {
  font-family: monospace;
  color: var(--text-secondary);
  font-size: 0.9em;
  text-align: right;
}
</style>
