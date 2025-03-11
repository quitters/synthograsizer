<template>
  <div class="prompt-processor">
    <div class="prompt-input">
      <textarea 
        v-model="prompt" 
        class="prompt-textarea"
        placeholder="Enter your prompt here..."
        @input="onPromptInput"
      ></textarea>
      <div class="prompt-controls">
        <button class="process-button" @click="processPrompt">
          <i class="fas fa-magic"></i> Process
        </button>
        <button class="clear-button" @click="clearPrompt">
          <i class="fas fa-times"></i> Clear
        </button>
      </div>
    </div>
    
    <div class="prompt-output" v-if="processedPrompt">
      <h3>Processed Prompt</h3>
      <div class="processed-prompt">{{ processedPrompt }}</div>
      <div class="prompt-actions">
        <button class="copy-button" @click="copyToClipboard">
          <i class="fas fa-copy"></i> Copy
        </button>
        <button class="send-button" @click="sendToGenerator">
          <i class="fas fa-paper-plane"></i> Send to Generator
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, computed } from 'vue';
import { useStore } from 'vuex';
import apiService from '../modules/api';
import websocketService from '../modules/websocket';

export default defineComponent({
  name: 'PromptProcessor',
  
  setup() {
    const store = useStore();
    const prompt = ref('');
    const processedPrompt = ref('');
    const isProcessing = ref(false);
    
    // Get all variables from the store
    const variables = computed(() => store.getters['variables/getAllVariables']);
    
    // Create a map of variable names to values for processing
    const variableMap = computed(() => {
      const map = {};
      variables.value.forEach(variable => {
        map[variable.name] = variable.value;
      });
      return map;
    });
    
    const onPromptInput = () => {
      // Auto-process the prompt if it's not too long (to avoid excessive API calls)
      if (prompt.value.length < 100) {
        processPrompt();
      }
    };
    
    const processPrompt = async () => {
      if (!prompt.value.trim() || isProcessing.value) return;
      
      isProcessing.value = true;
      
      try {
        // Use WebSocket for real-time processing
        websocketService.send('process_prompt', {
          text: prompt.value,
          variables: variableMap.value
        });
        
        // Also use the API for more complex processing
        const response = await apiService.post('/api/process-prompt', {
          text: prompt.value,
          processors: [
            {
              type: 'variable_substitution',
              params: {
                variables: variableMap.value
              }
            }
          ]
        });
        
        if (response.success) {
          processedPrompt.value = response.processed;
          
          // Update the store with the processed prompt
          store.dispatch('projects/updatePrompt', {
            text: response.processed,
            negative_text: store.getters['projects/getCurrentPrompt']?.negative_text || ''
          });
        } else {
          store.dispatch('notify', {
            type: 'error',
            message: response.message || 'Failed to process prompt',
            duration: 5000
          });
        }
      } catch (error) {
        console.error('Error processing prompt:', error);
        store.dispatch('notify', {
          type: 'error',
          message: 'Error processing prompt: ' + (error.message || 'Unknown error'),
          duration: 5000
        });
      } finally {
        isProcessing.value = false;
      }
    };
    
    const clearPrompt = () => {
      prompt.value = '';
      processedPrompt.value = '';
    };
    
    const copyToClipboard = () => {
      if (!processedPrompt.value) return;
      
      navigator.clipboard.writeText(processedPrompt.value)
        .then(() => {
          store.dispatch('notify', {
            type: 'success',
            message: 'Prompt copied to clipboard',
            duration: 3000
          });
        })
        .catch(err => {
          console.error('Failed to copy prompt:', err);
          store.dispatch('notify', {
            type: 'error',
            message: 'Failed to copy prompt to clipboard',
            duration: 5000
          });
        });
    };
    
    const sendToGenerator = () => {
      if (!processedPrompt.value) return;
      
      // This would integrate with an image generation API
      store.dispatch('notify', {
        type: 'info',
        message: 'Sending prompt to generator...',
        duration: 3000
      });
      
      // Placeholder for actual API integration
      setTimeout(() => {
        store.dispatch('notify', {
          type: 'success',
          message: 'Prompt sent to generator successfully',
          duration: 3000
        });
      }, 1500);
    };
    
    return {
      prompt,
      processedPrompt,
      onPromptInput,
      processPrompt,
      clearPrompt,
      copyToClipboard,
      sendToGenerator
    };
  }
});
</script>

<style>
.prompt-processor {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  box-shadow: var(--shadow-md);
}

.prompt-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-textarea {
  width: 100%;
  min-height: 120px;
  padding: 12px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-family: inherit;
  resize: vertical;
  transition: border-color 0.2s;
}

.prompt-textarea:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.prompt-controls {
  display: flex;
  gap: 8px;
}

.prompt-controls button {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.process-button {
  background: var(--accent-primary);
  color: var(--text-on-accent);
}

.process-button:hover {
  background: var(--accent-primary-dark);
}

.clear-button {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.clear-button:hover {
  background: var(--bg-tertiary-dark);
}

.prompt-output {
  padding: 16px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  border-left: 4px solid var(--accent-secondary);
}

.prompt-output h3 {
  margin-top: 0;
  margin-bottom: 8px;
  font-size: 16px;
  color: var(--accent-secondary);
}

.processed-prompt {
  padding: 12px;
  background: var(--bg-primary);
  border-radius: 4px;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 12px;
}

.prompt-actions {
  display: flex;
  gap: 8px;
}

.prompt-actions button {
  padding: 6px 12px;
  border-radius: 4px;
  border: none;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.copy-button {
  background: var(--bg-quaternary);
  color: var(--text-primary);
}

.copy-button:hover {
  background: var(--bg-quaternary-dark);
}

.send-button {
  background: var(--accent-secondary);
  color: var(--text-on-accent);
}

.send-button:hover {
  background: var(--accent-secondary-dark);
}
</style>
