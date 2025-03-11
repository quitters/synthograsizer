<template>
  <div class="notification-system">
    <transition-group name="notification">
      <div 
        v-for="notification in notifications" 
        :key="notification.id"
        class="notification"
        :class="[`notification-${notification.type}`]"
      >
        <div class="notification-icon">
          <i :class="getIconClass(notification.type)"></i>
        </div>
        <div class="notification-content">
          <div class="notification-message">{{ notification.message }}</div>
        </div>
        <button class="notification-close" @click="dismiss(notification.id)">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </transition-group>
  </div>
</template>

<script>
import { defineComponent, computed } from 'vue';
import { useStore } from 'vuex';

export default defineComponent({
  name: 'NotificationSystem',
  
  setup() {
    const store = useStore();
    
    const notifications = computed(() => store.state.notifications);
    
    const getIconClass = (type) => {
      switch (type) {
        case 'success':
          return 'fas fa-check-circle';
        case 'error':
          return 'fas fa-exclamation-circle';
        case 'warning':
          return 'fas fa-exclamation-triangle';
        case 'info':
        default:
          return 'fas fa-info-circle';
      }
    };
    
    const dismiss = (id) => {
      store.commit('REMOVE_NOTIFICATION', id);
    };
    
    return {
      notifications,
      getIconClass,
      dismiss
    };
  }
});
</script>

<style>
.notification-system {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 320px;
}

.notification {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-radius: 6px;
  box-shadow: var(--shadow-md);
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-left: 4px solid transparent;
  animation: slide-in 0.3s ease-out;
}

.notification-success {
  border-left-color: var(--success, #4caf50);
}

.notification-error {
  border-left-color: var(--error, #f44336);
}

.notification-warning {
  border-left-color: var(--warning, #ff9800);
}

.notification-info {
  border-left-color: var(--info, #2196f3);
}

.notification-icon {
  margin-right: 12px;
  font-size: 18px;
}

.notification-success .notification-icon {
  color: var(--success, #4caf50);
}

.notification-error .notification-icon {
  color: var(--error, #f44336);
}

.notification-warning .notification-icon {
  color: var(--warning, #ff9800);
}

.notification-info .notification-icon {
  color: var(--info, #2196f3);
}

.notification-content {
  flex: 1;
}

.notification-message {
  font-size: 14px;
  line-height: 1.4;
}

.notification-close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  margin-left: 8px;
  padding: 4px;
  transition: color 0.2s;
}

.notification-close:hover {
  color: var(--text-primary);
}

/* Animations */
.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.notification-leave-to {
  opacity: 0;
  transform: translateY(-30px);
}

@keyframes slide-in {
  from {
    transform: translateX(30px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
