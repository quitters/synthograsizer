export default {
    namespaced: true,
    
    state: () => ({
        devices: new Map(),
        learningMode: false,
        learningTarget: null
    }),

    mutations: {
        ADD_DEVICE(state, device) {
            state.devices.set(device.id, device);
        },

        REMOVE_DEVICE(state, deviceId) {
            state.devices.delete(deviceId);
        },

        SET_LEARNING_MODE(state, { active, target = null }) {
            state.learningMode = active;
            state.learningTarget = target;
        }
    },

    actions: {
        deviceConnected({ commit }, device) {
            commit('ADD_DEVICE', device);
        },

        deviceDisconnected({ commit }, { id }) {
            commit('REMOVE_DEVICE', id);
        },

        startLearning({ commit }, variableId) {
            commit('SET_LEARNING_MODE', { active: true, target: variableId });
        },

        stopLearning({ commit }) {
            commit('SET_LEARNING_MODE', { active: false });
        }
    },

    getters: {
        connectedDevices: state => Array.from(state.devices.values()),
        isLearning: state => state.learningMode,
        learningTarget: state => state.learningTarget
    }
};
