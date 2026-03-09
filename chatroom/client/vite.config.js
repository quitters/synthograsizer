import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/chatroom/',
  server: {
    port: 5173,
    proxy: {
      '/chatroom/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/chatroom/, '')
      }
    }
  }
})
