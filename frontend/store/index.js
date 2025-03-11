import { createStore } from 'vuex';
import variables from './modules/variables';
import projects from './modules/projects';
import midi from './modules/midi';
import nodes from './modules/nodes';
import settings from './modules/settings';
import notifications from './modules/notifications';

export const store = createStore({
    modules: {
        variables,
        projects,
        midi,
        nodes,
        settings,
        notifications
    },

    state: () => ({
        // Global app state
        theme: 'dark',
        sidebarCollapsed: false
    }),

    mutations: {
        SET_THEME(state, theme) {
            state.theme = theme;
        },

        SET_SIDEBAR_COLLAPSED(state, collapsed) {
            state.sidebarCollapsed = collapsed;
        }
    },

    actions: {
        setTheme({ commit }, theme) {
            commit('SET_THEME', theme);
            localStorage.setItem('theme', theme);
        },

        toggleSidebar({ commit, state }) {
            commit('SET_SIDEBAR_COLLAPSED', !state.sidebarCollapsed);
        },

        // Global notification action that delegates to the notifications module
        notify({ dispatch }, notification) {
            dispatch('notifications/notify', notification);
        }
    },

    getters: {
        currentTheme: state => state.theme,
        isSidebarCollapsed: state => state.sidebarCollapsed
    }
});
