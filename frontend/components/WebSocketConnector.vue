<template>
  <div class="websocket-connector">
    <div v-if="!isConnected" class="connection-status error">
      <i class="fas fa-exclamation-circle"></i>
      WebSocket disconnected. 
      <button @click="connect" class="reconnect-button">
        <i class="fas fa-sync-alt"></i> Reconnect
      </button>
    </div>
  </div>
</template>

<script>
import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import { useStore } from 'vuex';
import websocketService from '../modules/websocket';

export default defineComponent({
  name: 'WebSocketConnector',
  
  setup() {
    const store = useStore();
    const isConnected = ref(false);
    
    // Connect to WebSocket
    const connect = async () => {
      try {
        await websocketService.connect();
        isConnected.value = true;
      } catch (error) {
        console.error('Failed to connect to WebSocket:', error);
        isConnected.value = false;
        store.dispatch('notify', {
          type: 'error',
          message: 'Failed to connect to WebSocket server',
          duration: 5000
        });
      }
    };
    
    // Register WebSocket message handlers
    const setupMessageHandlers = () => {
      // Handle initial state
      websocketService.on('initial_state', (data) => {
        console.log('Received initial state:', data);
        if (data.knobs) {
          // Process knobs
          Object.entries(data.knobs).forEach(([id, knob]) => {
            store.dispatch('variables/updateVariable', {
              id: parseInt(id),
              changes: {
                value: knob.value,
                mode: knob.mode
              }
            });
          });
        }
        
        if (data.prompt) {
          // Process prompt
          store.dispatch('projects/updatePrompt', data.prompt);
        }
        
        if (data.current_mode) {
          // Process mode
          store.dispatch('settings/updateSetting', {
            key: 'currentMode',
            value: data.current_mode
          });
        }
      });
      
      // Handle state updates
      websocketService.on('state_update', (data) => {
        console.log('Received state update:', data);
        // Similar to initial_state handling
        if (data.knobs) {
          Object.entries(data.knobs).forEach(([id, knob]) => {
            store.dispatch('variables/updateVariable', {
              id: parseInt(id),
              changes: {
                value: knob.value,
                mode: knob.mode
              }
            });
          });
        }
        
        if (data.prompt) {
          store.dispatch('projects/updatePrompt', data.prompt);
        }
      });
      
      // Handle mode updates
      websocketService.on('mode_update', (data) => {
        if (data.mode) {
          store.dispatch('settings/updateSetting', {
            key: 'currentMode',
            value: data.mode
          });
        }
      });
      
      // Handle prompt processing results
      websocketService.on('prompt_result', (data) => {
        console.log('Received prompt result:', data);
        
        if (data.success) {
          // Update the processed prompt in the store
          store.dispatch('projects/setProcessedPrompt', {
            text: data.processed,
            negative_text: data.processed_negative_text || ''
          });
          
          store.dispatch('notify', {
            type: 'success',
            message: 'Prompt processed successfully',
            duration: 3000
          });
        } else {
          store.dispatch('notify', {
            type: 'error',
            message: data.message || 'Failed to process prompt',
            duration: 5000
          });
        }
      });
      
      // Handle errors
      websocketService.on('error', (data) => {
        store.dispatch('notify', {
          type: 'error',
          message: data.message || 'WebSocket error',
          duration: 5000
        });
      });
    };
    
    // Setup connection status handlers
    const setupConnectionHandlers = () => {
      websocketService.onConnection('connect', () => {
        isConnected.value = true;
        store.dispatch('notify', {
          type: 'success',
          message: 'Connected to WebSocket server',
          duration: 3000
        });
      });
      
      websocketService.onConnection('disconnect', () => {
        isConnected.value = false;
        store.dispatch('notify', {
          type: 'warning',
          message: 'Disconnected from WebSocket server',
          duration: 5000
        });
      });
    };
    
    // Send state updates to the server when local state changes
    const setupStateSync = () => {
      // Watch for variable changes
      store.subscribe((mutation, state) => {
        if (mutation.type.startsWith('variables/') && isConnected.value) {
          // Debounce state updates to avoid flooding the server
          if (window.stateUpdateTimeout) {
            clearTimeout(window.stateUpdateTimeout);
          }
          
          window.stateUpdateTimeout = setTimeout(() => {
            const variables = store.getters['variables/getAllVariables'];
            const knobs = {};
            
            variables.forEach(variable => {
              knobs[variable.id] = {
                value: variable.value,
                mode: variable.mode || 'A'
              };
            });
            
            websocketService.send('state_update', {
              knobs,
              prompt: store.getters['projects/getCurrentPrompt']
            });
          }, 100); // 100ms debounce
        }
      });
    };
    
    onMounted(async () => {
      setupMessageHandlers();
      setupConnectionHandlers();
      setupStateSync();
      await connect();
    });
    
    onUnmounted(() => {
      websocketService.disconnect();
    });
    
    return {
      isConnected,
      connect
    };
  }
});
</script>

<style>
.websocket-connector {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 1000;
}

.connection-status {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: var(--shadow-md);
}

.connection-status.error {
  background-color: var(--error-bg, rgba(255, 0, 0, 0.1));
  color: var(--error-text, #ff3333);
  border: 1px solid var(--error-border, rgba(255, 0, 0, 0.3));
}

.reconnect-button {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.reconnect-button:hover {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--text-on-accent);
}
</style>
