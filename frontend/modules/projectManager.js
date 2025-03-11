import { store } from '../store';
import { v4 as uuidv4 } from 'uuid';

export class ProjectManager {
    constructor() {
        this.currentProjectId = null;
        this.autoSaveInterval = null;
        this.setupAutoSave();
    }

    setupAutoSave() {
        // Auto-save every 5 minutes
        this.autoSaveInterval = setInterval(() => {
            if (this.currentProjectId) {
                this.saveProject(this.currentProjectId, true);
            }
        }, 5 * 60 * 1000);
    }

    createProject(name) {
        const projectId = uuidv4();
        const project = {
            id: projectId,
            name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: '1.0.0'
        };

        store.dispatch('projects/createProject', project);
        return projectId;
    }

    async saveProject(projectId, isAutoSave = false) {
        const project = store.getters['projects/getProject'](projectId);
        if (!project) return null;

        // Gather all project data
        const projectData = {
            ...project,
            updatedAt: new Date().toISOString(),
            data: {
                variables: this.serializeVariables(),
                nodes: this.serializeNodes(),
                connections: this.serializeConnections(),
                midiMappings: this.serializeMIDIMappings(),
                settings: this.serializeSettings()
            }
        };

        try {
            // Save to IndexedDB
            await store.dispatch('projects/updateProject', {
                id: projectId,
                changes: projectData
            });

            if (!isAutoSave) {
                // Create backup file
                const blob = new Blob([JSON.stringify(projectData, null, 2)], {
                    type: 'application/json'
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${project.name}-${new Date().toISOString()}.synth`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }

            return projectId;
        } catch (error) {
            console.error('Failed to save project:', error);
            throw error;
        }
    }

    async loadProject(projectId) {
        try {
            const project = await store.getters['projects/getProject'](projectId);
            if (!project?.data) return false;

            // Clear current state
            await this.clearCurrentState();

            // Load project data
            await this.loadVariables(project.data.variables);
            await this.loadNodes(project.data.nodes);
            await this.loadConnections(project.data.connections);
            await this.loadMIDIMappings(project.data.midiMappings);
            await this.loadSettings(project.data.settings);

            this.currentProjectId = projectId;
            return true;
        } catch (error) {
            console.error('Failed to load project:', error);
            throw error;
        }
    }

    async importProject(file) {
        try {
            const content = await file.text();
            const projectData = JSON.parse(content);

            // Validate project data
            if (!this.validateProjectData(projectData)) {
                throw new Error('Invalid project file format');
            }

            // Create new project
            const projectId = this.createProject(projectData.name);
            
            // Update with imported data
            await store.dispatch('projects/updateProject', {
                id: projectId,
                changes: {
                    ...projectData,
                    id: projectId,
                    importedAt: new Date().toISOString()
                }
            });

            return projectId;
        } catch (error) {
            console.error('Failed to import project:', error);
            throw error;
        }
    }

    async clearCurrentState() {
        await Promise.all([
            store.dispatch('variables/clearAll'),
            store.dispatch('nodes/clearAll'),
            store.dispatch('midi/clearAllMappings')
        ]);
    }

    // Serialization methods
    serializeVariables() {
        const variables = store.getters['variables/getAllVariables'];
        return variables.map(v => ({
            ...v,
            history: [], // Don't save history
            historyIndex: -1
        }));
    }

    serializeNodes() {
        return store.getters['nodes/getAllNodes'].map(node => node.toJSON());
    }

    serializeConnections() {
        return store.getters['nodes/getAllConnections'];
    }

    serializeMIDIMappings() {
        const mappings = store.getters['midi/getAllMappings'];
        return Array.from(mappings.entries()).map(([variableId, mapping]) => ({
            variableId,
            mapping
        }));
    }

    serializeSettings() {
        return store.state.settings;
    }

    // Loading methods
    async loadVariables(variables) {
        for (const variable of variables) {
            await store.dispatch('variables/createVariable', variable);
        }
    }

    async loadNodes(nodes) {
        for (const nodeData of nodes) {
            await store.dispatch('nodes/createNode', nodeData);
        }
    }

    async loadConnections(connections) {
        for (const connection of connections) {
            await store.dispatch('nodes/createConnection', connection);
        }
    }

    async loadMIDIMappings(mappings) {
        for (const { variableId, mapping } of mappings) {
            await store.dispatch('midi/setMapping', { variableId, mapping });
        }
    }

    async loadSettings(settings) {
        await store.dispatch('settings/loadSettings', settings);
    }

    validateProjectData(data) {
        // Basic validation
        if (!data || typeof data !== 'object') return false;
        if (!data.name || !data.version) return false;
        if (!data.data || typeof data.data !== 'object') return false;

        // Validate required data sections
        const requiredSections = ['variables', 'nodes', 'connections', 'midiMappings', 'settings'];
        return requiredSections.every(section => Array.isArray(data.data[section]) || typeof data.data[section] === 'object');
    }

    dispose() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
    }
}
