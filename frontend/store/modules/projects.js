import { openDB } from 'idb';

const DB_NAME = 'synthograsizer';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

async function getDB() {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('updatedAt', 'updatedAt');
                store.createIndex('name', 'name');
            }
        }
    });
}

export default {
    namespaced: true,

    state: () => ({
        projects: new Map(),
        currentProject: null,
        loading: false,
        error: null,
        currentPrompt: {
            text: '',
            negative_text: '',
            processed_text: '',
            processed_negative_text: ''
        }
    }),

    mutations: {
        SET_PROJECTS(state, projects) {
            state.projects = new Map(projects.map(p => [p.id, p]));
        },

        SET_PROJECT(state, project) {
            state.projects.set(project.id, project);
        },

        DELETE_PROJECT(state, id) {
            state.projects.delete(id);
        },

        SET_CURRENT_PROJECT(state, project) {
            state.currentProject = project;
        },

        SET_LOADING(state, loading) {
            state.loading = loading;
        },

        SET_ERROR(state, error) {
            state.error = error;
        },

        SET_CURRENT_PROMPT(state, prompt) {
            state.currentPrompt = {
                ...state.currentPrompt,
                ...prompt
            };
        },

        SET_PROCESSED_PROMPT(state, { text, negative_text }) {
            state.currentPrompt.processed_text = text || state.currentPrompt.processed_text;
            state.currentPrompt.processed_negative_text = negative_text || state.currentPrompt.processed_negative_text;
        }
    },

    actions: {
        async loadProjects({ commit }) {
            commit('SET_LOADING', true);
            commit('SET_ERROR', null);

            try {
                const db = await getDB();
                const projects = await db.getAll(STORE_NAME);
                commit('SET_PROJECTS', projects);
            } catch (error) {
                commit('SET_ERROR', error.message);
                throw error;
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async createProject({ commit }, project) {
            commit('SET_LOADING', true);
            commit('SET_ERROR', null);

            try {
                const db = await getDB();
                await db.add(STORE_NAME, project);
                commit('SET_PROJECT', project);
                return project.id;
            } catch (error) {
                commit('SET_ERROR', error.message);
                throw error;
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async updateProject({ commit }, { id, changes }) {
            commit('SET_LOADING', true);
            commit('SET_ERROR', null);

            try {
                const db = await getDB();
                const project = { ...await db.get(STORE_NAME, id), ...changes };
                await db.put(STORE_NAME, project);
                commit('SET_PROJECT', project);
                return project;
            } catch (error) {
                commit('SET_ERROR', error.message);
                throw error;
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async deleteProject({ commit }, id) {
            commit('SET_LOADING', true);
            commit('SET_ERROR', null);

            try {
                const db = await getDB();
                await db.delete(STORE_NAME, id);
                commit('DELETE_PROJECT', id);
            } catch (error) {
                commit('SET_ERROR', error.message);
                throw error;
            } finally {
                commit('SET_LOADING', false);
            }
        },

        async setCurrentProject({ commit }, project) {
            commit('SET_CURRENT_PROJECT', project);
        },

        async updatePrompt({ commit, state }, { text, negative_text }) {
            commit('SET_CURRENT_PROMPT', { 
                text: text !== undefined ? text : state.currentPrompt.text,
                negative_text: negative_text !== undefined ? negative_text : state.currentPrompt.negative_text
            });

            // If we have a current project, update it with the new prompt
            if (state.currentProject) {
                const updatedProject = {
                    ...state.currentProject,
                    prompt: {
                        text: state.currentPrompt.text,
                        negative_text: state.currentPrompt.negative_text
                    },
                    updatedAt: new Date().toISOString()
                };

                try {
                    const db = await getDB();
                    await db.put(STORE_NAME, updatedProject);
                    commit('SET_PROJECT', updatedProject);
                    commit('SET_CURRENT_PROJECT', updatedProject);
                } catch (error) {
                    commit('SET_ERROR', error.message);
                    throw error;
                }
            }

            return state.currentPrompt;
        },

        setProcessedPrompt({ commit }, { text, negative_text }) {
            commit('SET_PROCESSED_PROMPT', { text, negative_text });
        }
    },

    getters: {
        getAllProjects: state => Array.from(state.projects.values()),
        
        getProject: state => id => state.projects.get(id),
        
        getCurrentProject: state => state.currentProject,
        
        getRecentProjects: state => {
            return Array.from(state.projects.values())
                .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
                .slice(0, 5);
        },
        
        isLoading: state => state.loading,
        
        getError: state => state.error,
        
        getCurrentPrompt: state => state.currentPrompt
    }
};
