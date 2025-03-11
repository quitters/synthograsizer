<template>
  <div class="node-enum-control">
    <select
      :value="value"
      @change="$emit('input', $event.target.value)"
    >
      <option
        v-for="option in variable.values"
        :key="option"
        :value="option"
      >
        {{ option }}
      </option>
    </select>
  </div>
</template>

<script>
export default {
  name: 'NodeEnumControl',
  
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
.node-enum-control select {
  width: 100%;
  padding: var(--spacing-sm);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  cursor: pointer;
}

.node-enum-control select:focus {
  border-color: var(--accent-primary);
  outline: none;
}
</style>
