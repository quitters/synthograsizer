<template>
  <div class="node-number-control">
    <input
      type="range"
      :min="variable?.min ?? 0"
      :max="variable?.max ?? 100"
      :step="variable?.step ?? 1"
      :value="value"
      @input="onInput"
    />
    <div class="value-display">{{ formatValue(value) }}</div>
  </div>
</template>

<script>
export default {
  name: 'NodeNumberControl',
  
  props: {
    value: {
      type: Number,
      required: true
    },
    variable: {
      type: Object,
      required: true
    }
  },

  methods: {
    onInput(event) {
      this.$emit('input', Number(event.target.value));
    },

    formatValue(val) {
      return val.toFixed(this.variable?.precision ?? 2);
    }
  }
};
</script>

<style>
.node-number-control {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.value-display {
  text-align: center;
  font-family: monospace;
  color: var(--text-secondary);
}
</style>
