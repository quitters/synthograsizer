<template>
  <div class="node-color-control">
    <input
      type="color"
      :value="value"
      @input="onInput"
    />
    <div class="value-display">{{ value }}</div>
  </div>
</template>

<script>
export default {
  name: 'NodeColorControl',
  
  props: {
    value: {
      type: String,
      required: true
    },
    variable: {
      type: Object,
      required: true
    }
  },

  methods: {
    onInput(event) {
      this.$emit('input', event.target.value);
    }
  }
};
</script>

<style>
.node-color-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
}

.node-color-control input[type="color"] {
  width: 100%;
  height: 40px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: none;
  cursor: pointer;
}

.node-color-control input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 0;
}

.node-color-control input[type="color"]::-webkit-color-swatch {
  border: none;
  border-radius: 4px;
}

.value-display {
  font-family: monospace;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}
</style>
