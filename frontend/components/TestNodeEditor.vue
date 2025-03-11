<template>
  <div class="test-editor">
    <div class="controls">
      <button @click="createNumberVariable">Add Number Variable</button>
      <button @click="createBooleanVariable">Add Boolean Variable</button>
      <button @click="createColorVariable">Add Color Variable</button>
      <button @click="createTextNode">Add Text Node</button>
      <button @click="createTextTransformNode">Add Text Transform Node</button>
      <button @click="toggleSettings" class="settings-button">
        <i class="fas fa-cog"></i> Settings
      </button>
    </div>
    
    <div class="editor-layout">
      <NodeEditor class="node-editor-container" />
      <div class="right-panel">
        <SettingsPanel v-if="showSettings" class="settings-panel-container" />
        <PromptProcessor v-else class="prompt-processor-container" />
      </div>
    </div>
  </div>
</template>

<script>
import { useStore } from 'vuex';
import { ref } from 'vue';
import NodeEditor from './NodeEditor.vue';
import PromptProcessor from './PromptProcessor.vue';
import SettingsPanel from './SettingsPanel.vue';
import { VariableNode } from '../modules/nodeTypes/variableNode';
import { TextNode } from '../modules/nodeTypes/textNode';
import { TextTransformNode } from '../modules/nodeTypes/textTransformNode';

export default {
  name: 'TestNodeEditor',

  components: {
    NodeEditor,
    PromptProcessor,
    SettingsPanel
  },

  setup() {
    const store = useStore();
    const showSettings = ref(false);

    const toggleSettings = () => {
      showSettings.value = !showSettings.value;
    };

    const createVariable = async (type, defaultValue, options = {}) => {
      try {
        // Create variable in store
        const variableId = await store.dispatch('variables/createVariable', {
          name: `Test ${type}`,
          type,
          value: defaultValue,
          ...options
        });

        // Create node for variable
        const node = VariableNode.createFromVariable(
          store.getters['variables/getVariable'](variableId),
          { x: Math.random() * 500, y: Math.random() * 300 }
        );

        await store.dispatch('nodes/createNode', node);
      } catch (error) {
        console.error('Error creating variable:', error);
      }
    };

    const createTextNode = async () => {
      try {
        const node = new TextNode({
          name: 'Text Input',
          position: { x: Math.random() * 500, y: Math.random() * 300 },
          value: '',
          placeholder: 'Enter your prompt here...'
        });

        await store.dispatch('nodes/createNode', node);
      } catch (error) {
        console.error('Error creating text node:', error);
      }
    };

    const createTextTransformNode = async () => {
      try {
        const node = new TextTransformNode({
          name: 'Text Transform',
          position: { x: Math.random() * 500, y: Math.random() * 300 }
        });

        await store.dispatch('nodes/createNode', node);
      } catch (error) {
        console.error('Error creating text transform node:', error);
      }
    };

    const createNumberVariable = () => {
      createVariable('number', 50, {
        min: 0,
        max: 100,
        step: 1,
        precision: 2
      });
    };

    const createBooleanVariable = () => {
      createVariable('boolean', false);
    };

    const createColorVariable = () => {
      createVariable('color', '#4CAF50');
    };

    return {
      createNumberVariable,
      createBooleanVariable,
      createColorVariable,
      createTextNode,
      createTextTransformNode,
      showSettings,
      toggleSettings
    };
  }
};
</script>

<style>
.test-editor {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--editor-bg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.controls {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 1000;
  display: flex;
  gap: 8px;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 8px;
  box-shadow: var(--shadow-md);
}

.controls button {
  padding: 8px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.controls button:hover {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}

.editor-layout {
  display: flex;
  width: 100%;
  height: 100%;
  padding-top: 70px; /* Space for controls */
}

.node-editor-container {
  flex: 3;
  height: 100%;
  position: relative;
}

.right-panel {
  flex: 1;
  min-width: 300px;
  max-width: 400px;
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  border-left: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.prompt-processor-container,
.settings-panel-container {
  height: 100%;
}

.settings-button {
  margin-left: auto;
}
</style>
