import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    port: 5173,
    proxy: {
      '/admin/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/admin/login': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        bypass(req) {
          // Only proxy POST (API login) — let GET (page load) fall through to SPA
          if (req.method === 'GET') return req.url;
        },
      },
      '/marketing/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
