<template>
  <div class="node-string-control">
    <input
      type="text"
      :value="value"
      @input="$emit('input', $event.target.value)"
      :placeholder="variable.placeholder || 'Enter text...'"
    />
  </div>
</template>

<script>
export default {
  name: 'NodeStringControl',
  
  props: {
    value: {
      type: String,
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
.node-string-control input {
  width: 100%;
  padding: var(--spacing-sm);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
}

.node-string-control input:focus {
  border-color: var(--accent-primary);
  outline: none;
}
</style>
