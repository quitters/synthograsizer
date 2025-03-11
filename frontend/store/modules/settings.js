export default {
    namespaced: true,

    state: () => ({
        autoSave: true,
        autoSaveInterval: 5 * 60 * 1000, // 5 minutes
        defaultVariableSettings: {
            number: {
                min: 0,
                max: 100,
                step: 1,
                precision: 2
            },
            vector: {
                dimensions: 2,
                min: 0,
                max: 1
            }
        },
        midiSettings: {
            enabled: true,
            autoLearn: false
        },
        editorSettings: {
            theme: 'dark',
            fontSize: 14,
            showLineNumbers: true,
            autoComplete: true
        },
        nodeSettings: {
            snapToGrid: true,
            gridSize: 20,
            connectionStyle: 'bezier'
        },
        theme: 'dark' // Default theme
    }),

    mutations: {
        UPDATE_SETTINGS(state, settings) {
            Object.assign(state, settings);
        },

        UPDATE_EDITOR_SETTINGS(state, settings) {
            Object.assign(state.editorSettings, settings);
        },

        UPDATE_NODE_SETTINGS(state, settings) {
            Object.assign(state.nodeSettings, settings);
        },

        UPDATE_MIDI_SETTINGS(state, settings) {
            Object.assign(state.midiSettings, settings);
        },

        UPDATE_DEFAULT_VARIABLE_SETTINGS(state, { type, settings }) {
            if (state.defaultVariableSettings[type]) {
                Object.assign(state.defaultVariableSettings[type], settings);
            }
        },

        SET_THEME(state, theme) {
            state.theme = theme;
        }
    },

    actions: {
        loadSettings({ commit }, settings) {
            commit('UPDATE_SETTINGS', settings);
        },

        updateEditorSettings({ commit }, settings) {
            commit('UPDATE_EDITOR_SETTINGS', settings);
            // Save to localStorage
            localStorage.setItem('editorSettings', JSON.stringify(settings));
        },

        updateNodeSettings({ commit }, settings) {
            commit('UPDATE_NODE_SETTINGS', settings);
            localStorage.setItem('nodeSettings', JSON.stringify(settings));
        },

        updateMIDISettings({ commit }, settings) {
            commit('UPDATE_MIDI_SETTINGS', settings);
            localStorage.setItem('midiSettings', JSON.stringify(settings));
        },

        updateDefaultVariableSettings({ commit }, payload) {
            commit('UPDATE_DEFAULT_VARIABLE_SETTINGS', payload);
            localStorage.setItem('defaultVariableSettings', JSON.stringify(payload));
        },

        setTheme({ commit }, theme) {
            commit('SET_THEME', theme);
            localStorage.setItem('appTheme', theme);
            // Also update editor theme to match
            commit('UPDATE_EDITOR_SETTINGS', { theme });
        },

        initializeSettings({ commit, dispatch }) {
            // Load theme from localStorage
            const savedTheme = localStorage.getItem('appTheme');
            if (savedTheme) {
                commit('SET_THEME', savedTheme);
            }

            // Load settings from localStorage
            const editorSettings = localStorage.getItem('editorSettings');
            if (editorSettings) {
                commit('UPDATE_EDITOR_SETTINGS', JSON.parse(editorSettings));
            }

            const nodeSettings = localStorage.getItem('nodeSettings');
            if (nodeSettings) {
                commit('UPDATE_NODE_SETTINGS', JSON.parse(nodeSettings));
            }

            const midiSettings = localStorage.getItem('midiSettings');
            if (midiSettings) {
                commit('UPDATE_MIDI_SETTINGS', JSON.parse(midiSettings));
            }

            const defaultVariableSettings = localStorage.getItem('defaultVariableSettings');
            if (defaultVariableSettings) {
                const settings = JSON.parse(defaultVariableSettings);
                Object.entries(settings).forEach(([type, typeSettings]) => {
                    commit('UPDATE_DEFAULT_VARIABLE_SETTINGS', { type, settings: typeSettings });
                });
            }
        }
    },

    getters: {
        getEditorSettings: state => state.editorSettings,
        getNodeSettings: state => state.nodeSettings,
        getMIDISettings: state => state.midiSettings,
        getDefaultVariableSettings: state => type => state.defaultVariableSettings[type],
        isAutoSaveEnabled: state => state.autoSave,
        getAutoSaveInterval: state => state.autoSaveInterval,
        currentTheme: state => state.theme
    }
};
