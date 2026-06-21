import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    proxy: {
      // REST API
      '/history': { target: 'http://localhost:8080', changeOrigin: true },
      '/mcp': { target: 'http://localhost:8080', changeOrigin: true },
      '/user': { target: 'http://localhost:8080', changeOrigin: true },
      '/file': { target: 'http://localhost:8080', changeOrigin: true },
      '/knowledge': { target: 'http://localhost:8080', changeOrigin: true },
      '/common': { target: 'http://localhost:8080', changeOrigin: true },
      // Chat — only proxy API paths, not Vue Router /chat/:sessionId
      '/chat/stream': { target: 'http://localhost:8080', changeOrigin: true },
      '/chat/model': { target: 'http://localhost:8080', changeOrigin: true },
      // WebSocket
      '/ws': { target: 'ws://localhost:8080', ws: true, changeOrigin: true },
    },
  },
})
