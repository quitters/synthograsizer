import { createApp } from 'vue';
import App from './App.vue';
import { store } from './store';
import './styles/themes/synthTheme.css';

// Import global styles
import './assets/styles/global.css';
import './assets/styles/themes.css';

// Import styles
import './styles/ui.css';
import './styles/animations.css';
import './styles/variable-panel.css';

// Import Font Awesome for icons
import '@fortawesome/fontawesome-free/css/all.min.css';

// Create Vue app
const app = createApp(App);

// Use Vuex store
app.use(store);

// Initialize store modules
store.dispatch('settings/initializeSettings');
store.dispatch('projects/loadProjects');

// Set initial theme class on document root
const currentTheme = store.getters['settings/currentTheme'] || 'dark';
document.documentElement.className = currentTheme + '-theme';

// Mount app
app.mount('#app');