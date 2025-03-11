<template>
  <div class="settings-panel">
    <h2 class="settings-title">Settings</h2>
    
    <div class="settings-section">
      <h3>Theme</h3>
      <div class="theme-selector">
        <button 
          class="theme-button" 
          :class="{ active: currentTheme === 'light' }"
          @click="setTheme('light')"
        >
          <i class="fas fa-sun"></i> Light
        </button>
        <button 
          class="theme-button" 
          :class="{ active: currentTheme === 'dark' }"
          @click="setTheme('dark')"
        >
          <i class="fas fa-moon"></i> Dark
        </button>
      </div>
    </div>
    
    <div class="settings-section">
      <h3>WebSocket Connection</h3>
      <div class="connection-settings">
        <div class="connection-status">
          <span class="status-indicator" :class="{ connected: isConnected }"></span>
          <span>{{ isConnected ? 'Connected' : 'Disconnected' }}</span>
        </div>
        <div class="connection-actions">
          <button @click="reconnectWebSocket" :disabled="isConnected">
            <i class="fas fa-sync-alt"></i> Reconnect
          </button>
        </div>
      </div>
    </div>
    
    <div class="settings-section">
      <h3>Saved States</h3>
      <div class="saved-states">
        <div v-if="savedStates.length === 0" class="no-states">
          No saved states found
        </div>
        <div v-else class="state-list">
          <div 
            v-for="state in savedStates" 
            :key="state.id" 
            class="state-item"
          >
            <div class="state-info">
              <span class="state-name">{{ state.name }}</span>
              <span class="state-date">{{ formatDate(state.created_at) }}</span>
            </div>
            <div class="state-actions">
              <button class="state-action" @click="loadState(state.id)">
                <i class="fas fa-upload"></i>
              </button>
              <button class="state-action" @click="deleteState(state.id)">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
        <div class="save-state-form">
          <input 
            v-model="newStateName" 
            type="text" 
            placeholder="State name" 
            class="state-name-input"
          />
          <button 
            @click="saveCurrentState" 
            :disabled="!newStateName.trim()"
            class="save-state-button"
          >
            <i class="fas fa-save"></i> Save Current State
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted } from 'vue';
import { useStore } from 'vuex';
import websocketService from '../modules/websocket';
import apiService from '../modules/api';

export default defineComponent({
  name: 'SettingsPanel',
  
  setup() {
    const store = useStore();
    const savedStates = ref([]);
    const newStateName = ref('');
    const isLoading = ref(false);
    
    const currentTheme = computed(() => store.getters['currentTheme']);
    const isConnected = computed(() => websocketService.isConnected);
    
    const loadSavedStates = async () => {
      isLoading.value = true;
      try {
        const response = await apiService.get('/api/state/list');
        savedStates.value = response.states || [];
      } catch (error) {
        console.error('Failed to load saved states:', error);
        store.dispatch('notify', {
          type: 'error',
          message: 'Failed to load saved states',
          duration: 5000
        });
      } finally {
        isLoading.value = false;
      }
    };
    
    const saveCurrentState = async () => {
      if (!newStateName.value.trim()) return;
      
      isLoading.value = true;
      try {
        await apiService.post('/api/state/save', {
          name: newStateName.value.trim()
        });
        
        store.dispatch('notify', {
          type: 'success',
          message: 'State saved successfully',
          duration: 3000
        });
        
        newStateName.value = '';
        await loadSavedStates();
      } catch (error) {
        console.error('Failed to save state:', error);
        store.dispatch('notify', {
          type: 'error',
          message: 'Failed to save state',
          duration: 5000
        });
      } finally {
        isLoading.value = false;
      }
    };
    
    const loadState = async (stateId) => {
      isLoading.value = true;
      try {
        await apiService.post('/api/state/load', { id: stateId });
        
        store.dispatch('notify', {
          type: 'success',
          message: 'State loaded successfully',
          duration: 3000
        });
      } catch (error) {
        console.error('Failed to load state:', error);
        store.dispatch('notify', {
          type: 'error',
          message: 'Failed to load state',
          duration: 5000
        });
      } finally {
        isLoading.value = false;
      }
    };
    
    const deleteState = async (stateId) => {
      if (!confirm('Are you sure you want to delete this state?')) return;
      
      isLoading.value = true;
      try {
        await apiService.post('/api/state/delete', { id: stateId });
        
        store.dispatch('notify', {
          type: 'success',
          message: 'State deleted successfully',
          duration: 3000
        });
        
        await loadSavedStates();
      } catch (error) {
        console.error('Failed to delete state:', error);
        store.dispatch('notify', {
          type: 'error',
          message: 'Failed to delete state',
          duration: 5000
        });
      } finally {
        isLoading.value = false;
      }
    };
    
    const setTheme = (theme) => {
      store.dispatch('setTheme', theme);
      document.documentElement.className = theme + '-theme';
    };
    
    const reconnectWebSocket = async () => {
      try {
        await websocketService.connect();
        store.dispatch('notify', {
          type: 'success',
          message: 'WebSocket reconnected successfully',
          duration: 3000
        });
      } catch (error) {
        console.error('Failed to reconnect WebSocket:', error);
        store.dispatch('notify', {
          type: 'error',
          message: 'Failed to reconnect WebSocket',
          duration: 5000
        });
      }
    };
    
    const formatDate = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleString();
    };
    
    onMounted(() => {
      loadSavedStates();
      
      // Set initial theme class on document
      document.documentElement.className = currentTheme.value + '-theme';
    });
    
    return {
      currentTheme,
      isConnected,
      savedStates,
      newStateName,
      setTheme,
      reconnectWebSocket,
      saveCurrentState,
      loadState,
      deleteState,
      formatDate
    };
  }
});
</script>

<style>
.settings-panel {
  padding: var(--spacing-md);
  background: var(--bg-secondary);
  border-radius: var(--border-radius-md);
  box-shadow: var(--shadow-md);
  max-width: 600px;
  margin: 0 auto;
}

.settings-title {
  margin-bottom: var(--spacing-lg);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--border-color);
}

.settings-section {
  margin-bottom: var(--spacing-lg);
}

.settings-section h3 {
  margin-bottom: var(--spacing-sm);
  color: var(--accent-primary);
}

.theme-selector {
  display: flex;
  gap: var(--spacing-sm);
}

.theme-button {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-radius: var(--border-radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
}

.theme-button.active {
  background: var(--accent-primary);
  color: var(--text-on-accent);
  border-color: var(--accent-primary);
}

.connection-settings {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm);
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-sm);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.status-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--error);
}

.status-indicator.connected {
  background: var(--success);
}

.saved-states {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.no-states {
  padding: var(--spacing-md);
  text-align: center;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-sm);
}

.state-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  max-height: 300px;
  overflow-y: auto;
}

.state-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm);
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-sm);
  transition: background var(--transition-fast);
}

.state-item:hover {
  background: var(--bg-quaternary);
}

.state-info {
  display: flex;
  flex-direction: column;
}

.state-name {
  font-weight: 500;
}

.state-date {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.state-actions {
  display: flex;
  gap: var(--spacing-xs);
}

.state-action {
  padding: var(--spacing-xs);
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color var(--transition-fast);
}

.state-action:hover {
  color: var(--accent-primary);
}

.save-state-form {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.state-name-input {
  flex: 1;
  padding: var(--spacing-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.save-state-button {
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}
</style>
