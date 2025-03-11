import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  root: './', // Serve files from the root of the frontend folder
  server: {
    port: 5173,
  },
});