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
      <div class="transform-controls">
        <div class="transform-type">
          <label class="control-label">Transform Type</label>
          <select v-model="transformType" class="transform-select" @change="onTransformChange">
            <option value="upper">UPPERCASE</option>
            <option value="lower">lowercase</option>
            <option value="title">Title Case</option>
            <option value="sentence">Sentence case</option>
            <option value="expand">Expand Text</option>
            <option value="summarize">Summarize</option>
          </select>
        </div>

        <div v-if="transformType === 'summarize'" class="length-control">
          <label class="control-label">Max Length</label>
          <div class="knob-container">
            <div 
              class="knob"
              :style="{ '--rotation': `${(maxLength - 50) / 200 * 270}deg` }"
              @mousedown="startKnobDrag"
            >
              <div class="knob-indicator"></div>
            </div>
            <span class="knob-value">{{ maxLength }}</span>
          </div>
        </div>

        <div class="preview-container">
          <label class="control-label">Preview</label>
          <div class="preview-text">{{ previewText }}</div>
        </div>
      </div>
    </div>

    <template #ports>
      <div 
        class="input-port" 
        data-port="input" 
        data-type="text"
        @mousedown.stop="$emit('portMouseDown', $event, 'input', node)"
        @mouseup.stop="$emit('portMouseUp', $event, 'input', node)"
      >
        <div 
          class="port-handle"
          :class="{
            'is-connected': isPortConnected('input', 'input')
          }"
        ></div>
        <span class="port-label">Input</span>
      </div>
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
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { useStore } from 'vuex';
import BaseNode from '../BaseNode.vue';
import { TextProcessor } from '../../../modules/textProcessing/textProcessor';

export default {
  name: 'TextTransformNode',

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
    const transformType = ref(props.node.transformType || 'upper');
    const maxLength = ref(props.node.maxLength || 100);
    const isDragging = ref(false);
    const startY = ref(0);
    const startValue = ref(0);
    const previewText = ref('');

    const updatePreview = async () => {
      const inputText = props.node.getInputValue('input') || 'Sample text';
      const processedText = await props.node.processText(inputText);
      previewText.value = processedText;
    };

    const onTransformChange = () => {
      props.node.onSettingsChange({
        transformType: transformType.value
      });
      updatePreview();
    };

    const startKnobDrag = (event) => {
      isDragging.value = true;
      startY.value = event.clientY;
      startValue.value = maxLength.value;

      const onMouseMove = (e) => {
        if (!isDragging.value) return;

        const deltaY = startY.value - e.clientY;
        const newValue = Math.min(250, Math.max(50, startValue.value + deltaY));
        maxLength.value = Math.round(newValue);

        props.node.onSettingsChange({
          maxLength: maxLength.value
        });
        updatePreview();
      };

      const onMouseUp = () => {
        isDragging.value = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

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

    watch(() => props.node.getInputValue('input'), updatePreview);

    onMounted(() => {
      updatePreview();
    });

    return {
      transformType,
      maxLength,
      previewText,
      startKnobDrag,
      onTransformChange,
      isPortConnected
    };
  }
};
</script>

<style>
.transform-controls {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-sm);
}

.transform-type {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.control-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.transform-select {
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.transform-select:hover {
  border-color: var(--accent-primary);
}

.transform-select:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary-alpha);
}

.length-control {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.knob-container {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.knob {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--knob-bg);
  border: 2px solid var(--knob-ring);
  position: relative;
  cursor: pointer;
  transform: rotate(var(--rotation, 0deg));
  transition: border-color var(--transition-fast);
}

.knob:hover {
  border-color: var(--accent-primary);
}

.knob-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2px;
  height: 16px;
  background: var(--knob-indicator);
  transform: translate(-50%, -100%);
  transform-origin: bottom center;
}

.knob-value {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  min-width: 40px;
}

.preview-container {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.preview-text {
  padding: var(--spacing-sm);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  min-height: 60px;
  max-height: 120px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
