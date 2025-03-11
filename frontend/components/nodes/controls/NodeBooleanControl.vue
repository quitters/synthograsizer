<template>
  <div class="node-boolean-control">
    <label class="switch">
      <input
        type="checkbox"
        :checked="value"
        @change="$emit('input', !value)"
      />
      <span class="slider"></span>
    </label>
    <div class="value-display">{{ value ? (variable?.labelTrue ?? 'ON') : (variable?.labelFalse ?? 'OFF') }}</div>
  </div>
</template>

<script>
export default {
  name: 'NodeBooleanControl',
  
  props: {
    value: {
      type: Boolean,
      required: true
    },
    variable: {
      type: Object,
      required: true
    }
  }
};
</script>

<style>
.node-boolean-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
}

.value-display {
  font-family: monospace;
  color: var(--text-secondary);
}

.switch {
  position: relative;
  display: inline-block;
  width: 60px;
  height: 34px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-tertiary);
  transition: .4s;
  border-radius: 34px;
  border: 1px solid var(--border-color);
}

.slider:before {
  position: absolute;
  content: "";
  height: 26px;
  width: 26px;
  left: 3px;
  bottom: 3px;
  background-color: var(--text-secondary);
  transition: .4s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: var(--accent-primary);
}

input:checked + .slider:before {
  transform: translateX(26px);
  background-color: var(--text-primary);
}
</style>
