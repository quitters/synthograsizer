import { v4 as uuidv4 } from 'uuid';

export default {
    namespaced: true,

    state: () => ({
        items: new Map(),
        groups: new Map(),
        history: new Map(),
        historyIndex: new Map()
    }),

    mutations: {
        CREATE_VARIABLE(state, variable) {
            // Extract configuration options based on type
            const config = {};
            switch (variable.type) {
                case 'number':
                    config.min = variable.min ?? 0;
                    config.max = variable.max ?? 100;
                    config.step = variable.step ?? 1;
                    config.precision = variable.precision ?? 2;
                    break;
                case 'color':
                    config.format = variable.format ?? 'hex';
                    break;
                case 'boolean':
                    config.labelTrue = variable.labelTrue ?? 'ON';
                    config.labelFalse = variable.labelFalse ?? 'OFF';
                    break;
            }

            state.items.set(variable.id, {
                ...variable,
                ...config,
                history: [],
                historyIndex: -1,
                midiMapping: null
            });
        },

        UPDATE_VARIABLE(state, { id, changes }) {
            const variable = state.items.get(id);
            if (variable) {
                state.items.set(id, { ...variable, ...changes });
            }
        },

        DELETE_VARIABLE(state, id) {
            state.items.delete(id);
        },

        UPDATE_VALUE(state, { id, value, recordHistory = true }) {
            const variable = state.items.get(id);
            if (!variable) return;

            if (recordHistory) {
                // Add to history
                const newHistory = [...variable.history.slice(0, variable.historyIndex + 1), variable.value];
                const maxHistory = 50;
                if (newHistory.length > maxHistory) {
                    newHistory.shift();
                }
                variable.history = newHistory;
                variable.historyIndex = newHistory.length - 1;
            }

            variable.value = value;
        },

        UNDO(state, id) {
            const variable = state.items.get(id);
            if (!variable || variable.historyIndex < 0) return;

            variable.value = variable.history[variable.historyIndex];
            variable.historyIndex--;
        },

        REDO(state, id) {
            const variable = state.items.get(id);
            if (!variable || variable.historyIndex >= variable.history.length - 1) return;

            variable.historyIndex++;
            variable.value = variable.history[variable.historyIndex];
        },

        SET_MIDI_MAPPING(state, { id, mapping }) {
            const variable = state.items.get(id);
            if (variable) {
                variable.midiMapping = mapping;
            }
        },

        CLEAR_MIDI_MAPPING(state, id) {
            const variable = state.items.get(id);
            if (variable) {
                variable.midiMapping = null;
            }
        },

        CREATE_GROUP(state, group) {
            state.groups.set(group.id, group);
        },

        UPDATE_GROUP(state, { id, changes }) {
            const group = state.groups.get(id);
            if (group) {
                state.groups.set(id, { ...group, ...changes });
            }
        },

        DELETE_GROUP(state, id) {
            state.groups.delete(id);
        }
    },

    actions: {
        createVariable({ commit }, variable) {
            const id = variable.id || uuidv4();
            commit('CREATE_VARIABLE', { ...variable, id });
            return id;
        },

        updateVariable({ commit }, payload) {
            commit('UPDATE_VARIABLE', payload);
        },

        deleteVariable({ commit }, id) {
            commit('DELETE_VARIABLE', id);
        },

        updateValue({ commit }, { id, value, source = 'user' }) {
            const recordHistory = source === 'user';
            commit('UPDATE_VALUE', { id, value, recordHistory });
        },

        undo({ commit }, id) {
            commit('UNDO', id);
        },

        redo({ commit }, id) {
            commit('REDO', id);
        },

        setMIDIMapping({ commit }, { variableId, mapping }) {
            commit('SET_MIDI_MAPPING', { id: variableId, mapping });
        },

        clearMIDIMapping({ commit }, variableId) {
            commit('CLEAR_MIDI_MAPPING', variableId);
        },

        createGroup({ commit }, group) {
            const id = group.id || uuidv4();
            commit('CREATE_GROUP', { ...group, id });
            return id;
        },

        updateGroup({ commit }, payload) {
            commit('UPDATE_GROUP', payload);
        },

        deleteGroup({ commit }, id) {
            commit('DELETE_GROUP', id);
        }
    },

    getters: {
        getVariable: state => id => state.items.get(id),
        getAllVariables: state => Array.from(state.items.values()),
        getVariablesByType: state => type => {
            return Array.from(state.items.values()).filter(v => v.type === type);
        },
        getGroup: state => id => state.groups.get(id),
        getAllGroups: state => Array.from(state.groups.values()),
        getVariablesByGroup: state => groupId => {
            const group = state.groups.get(groupId);
            if (!group) return [];
            return group.variables.map(id => state.items.get(id)).filter(Boolean);
        }
    }
};
