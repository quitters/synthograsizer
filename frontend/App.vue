<template>
  <div class="app">
    <TestNodeEditor class="editor-container" />
    <WebSocketConnector />
    <NotificationSystem />
  </div>
</template>

<script>
import { defineComponent } from 'vue';
import TestNodeEditor from './components/TestNodeEditor.vue';
import WebSocketConnector from './components/WebSocketConnector.vue';
import NotificationSystem from './components/NotificationSystem.vue';

export default defineComponent({
  name: 'App',
  components: {
    TestNodeEditor,
    WebSocketConnector,
    NotificationSystem
  }
});
</script>

<style>
.app {
  width: 100vw;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
}

.editor-container {
  flex: 1;
  min-height: 0;
  position: relative;
}
</style>
