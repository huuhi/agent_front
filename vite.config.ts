import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },

    proxy: {
      // ── Unified /api prefix ─────────────────────────────────────
      // Backend has added server.servlet.context-path=/api, so every
      // request path already carries the prefix.  No rewrite needed.
      '/api': {
        target: 'http://106.52.234.62:8989',
        changeOrigin: true,
      },

      // ── WebSocket under /api prefix ─────────────────────────────
      '/api/ws': {
        target: 'ws://106.52.234.62:8989',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if ((err as any)?.code === 'ECONNREFUSED') return
            console.error(`[ws proxy] ${err.message}`)
          })
        },
      },
    },
  },
})
