<template>
  <div class="project-manager">
    <div class="toolbar">
      <button class="new-project-btn" @click="showNewProjectDialog = true">
        New Project
      </button>
      <button class="open-project-btn" @click="showProjectList = true">
        Open Project
      </button>
      <button 
        class="save-project-btn" 
        @click="saveProject"
        :disabled="!currentProject"
      >
        Save Project
      </button>
      <input
        type="file"
        ref="fileInput"
        accept=".synth"
        style="display: none"
        @change="handleFileImport"
      >
      <button class="import-btn" @click="$refs.fileInput.click()">
        Import
      </button>
    </div>

    <!-- New Project Dialog -->
    <div v-if="showNewProjectDialog" class="dialog-overlay">
      <div class="dialog">
        <h3>New Project</h3>
        <div class="form-group">
          <label>Project Name</label>
          <input
            v-model="newProjectName"
            type="text"
            placeholder="Enter project name..."
            @keyup.enter="createProject"
          >
        </div>
        <div class="dialog-actions">
          <button @click="showNewProjectDialog = false">Cancel</button>
          <button 
            class="primary"
            @click="createProject"
            :disabled="!newProjectName"
          >
            Create
          </button>
        </div>
      </div>
    </div>

    <!-- Project List Dialog -->
    <div v-if="showProjectList" class="dialog-overlay">
      <div class="dialog project-list-dialog">
        <h3>Open Project</h3>
        <div class="project-list">
          <div
            v-for="project in projects"
            :key="project.id"
            class="project-item"
            @click="loadProject(project.id)"
          >
            <div class="project-info">
              <h4>{{ project.name }}</h4>
              <span class="updated-at">
                Last modified: {{ formatDate(project.updatedAt) }}
              </span>
            </div>
            <button
              class="delete-btn"
              @click.stop="confirmDeleteProject(project)"
            >
              Delete
            </button>
          </div>
        </div>
        <div class="dialog-actions">
          <button @click="showProjectList = false">Close</button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Dialog -->
    <div v-if="projectToDelete" class="dialog-overlay">
      <div class="dialog">
        <h3>Delete Project</h3>
        <p>
          Are you sure you want to delete "{{ projectToDelete.name }}"?
          This action cannot be undone.
        </p>
        <div class="dialog-actions">
          <button @click="projectToDelete = null">Cancel</button>
          <button
            class="danger"
            @click="deleteProject(projectToDelete.id)"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { useStore } from 'vuex';
import { ProjectManager } from '../modules/projectManager';

export default {
  name: 'ProjectManager',

  setup() {
    const store = useStore();
    const projectManager = new ProjectManager();
    
    // State
    const showNewProjectDialog = ref(false);
    const showProjectList = ref(false);
    const newProjectName = ref('');
    const projectToDelete = ref(null);
    const fileInput = ref(null);

    // Computed
    const projects = computed(() => store.getters['projects/getAllProjects']);
    const currentProject = computed(() => store.getters['projects/getCurrentProject']);

    // Methods
    const createProject = async () => {
      try {
        const projectId = await projectManager.createProject(newProjectName.value);
        await projectManager.loadProject(projectId);
        showNewProjectDialog.value = false;
        newProjectName.value = '';
      } catch (error) {
        console.error('Failed to create project:', error);
        // TODO: Show error notification
      }
    };

    const loadProject = async (projectId) => {
      try {
        await projectManager.loadProject(projectId);
        showProjectList.value = false;
      } catch (error) {
        console.error('Failed to load project:', error);
        // TODO: Show error notification
      }
    };

    const saveProject = async () => {
      if (!currentProject.value) return;
      
      try {
        await projectManager.saveProject(currentProject.value.id);
        // TODO: Show success notification
      } catch (error) {
        console.error('Failed to save project:', error);
        // TODO: Show error notification
      }
    };

    const confirmDeleteProject = (project) => {
      projectToDelete.value = project;
    };

    const deleteProject = async (projectId) => {
      try {
        await store.dispatch('projects/deleteProject', projectId);
        projectToDelete.value = null;
      } catch (error) {
        console.error('Failed to delete project:', error);
        // TODO: Show error notification
      }
    };

    const handleFileImport = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const projectId = await projectManager.importProject(file);
        await projectManager.loadProject(projectId);
        event.target.value = ''; // Reset file input
      } catch (error) {
        console.error('Failed to import project:', error);
        // TODO: Show error notification
      }
    };

    const formatDate = (dateString) => {
      return new Date(dateString).toLocaleString();
    };

    // Lifecycle
    onMounted(async () => {
      try {
        await store.dispatch('projects/loadProjects');
      } catch (error) {
        console.error('Failed to load projects:', error);
        // TODO: Show error notification
      }
    });

    return {
      showNewProjectDialog,
      showProjectList,
      newProjectName,
      projectToDelete,
      fileInput,
      projects,
      currentProject,
      createProject,
      loadProject,
      saveProject,
      confirmDeleteProject,
      deleteProject,
      handleFileImport,
      formatDate
    };
  }
};
</script>

<style>
.project-manager {
  width: 100%;
}

.toolbar {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.toolbar button {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.toolbar button:hover {
  background: var(--bg-quaternary);
}

.toolbar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: var(--spacing-lg);
  min-width: 400px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: auto;
}

.dialog h3 {
  margin: 0 0 var(--spacing-md);
  color: var(--text-primary);
}

.form-group {
  margin-bottom: var(--spacing-md);
}

.form-group label {
  display: block;
  margin-bottom: var(--spacing-sm);
  color: var(--text-secondary);
}

.form-group input {
  width: 100%;
  padding: var(--spacing-sm);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-lg);
}

.dialog-actions button {
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: 4px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.dialog-actions button.primary {
  background: var(--accent-primary);
  color: white;
  border: none;
}

.dialog-actions button.danger {
  background: var(--error);
  color: white;
  border: none;
}

.project-list-dialog {
  width: 600px;
}

.project-list {
  margin: var(--spacing-md) 0;
}

.project-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  margin-bottom: var(--spacing-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.project-item:hover {
  background: var(--bg-quaternary);
}

.project-info h4 {
  margin: 0;
  color: var(--text-primary);
}

.updated-at {
  font-size: 0.9em;
  color: var(--text-tertiary);
}

.delete-btn {
  padding: var(--spacing-sm);
  background: transparent;
  border: none;
  color: var(--text-error);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.project-item:hover .delete-btn {
  opacity: 1;
}
</style>
