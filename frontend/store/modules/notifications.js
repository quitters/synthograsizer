// Unique ID for notifications
let nextId = 1;

const state = {
  notifications: []
};

const mutations = {
  ADD_NOTIFICATION(state, notification) {
    state.notifications.push({
      id: nextId++,
      ...notification,
      timestamp: new Date()
    });
  },
  
  REMOVE_NOTIFICATION(state, id) {
    const index = state.notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      state.notifications.splice(index, 1);
    }
  },
  
  CLEAR_NOTIFICATIONS(state) {
    state.notifications = [];
  }
};

const actions = {
  notify({ commit }, { type = 'info', message, duration = 5000 }) {
    const id = nextId;
    
    commit('ADD_NOTIFICATION', { type, message });
    
    if (duration > 0) {
      setTimeout(() => {
        commit('REMOVE_NOTIFICATION', id);
      }, duration);
    }
    
    return id;
  },
  
  removeNotification({ commit }, id) {
    commit('REMOVE_NOTIFICATION', id);
  },
  
  clearNotifications({ commit }) {
    commit('CLEAR_NOTIFICATIONS');
  }
};

export default {
  namespaced: true,
  state,
  mutations,
  actions
};
