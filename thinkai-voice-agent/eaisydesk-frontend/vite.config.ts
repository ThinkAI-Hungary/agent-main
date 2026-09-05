import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// A backend címe felülírható, pl. dockerben futó agentnél:
//   VITE_BACKEND_TARGET=http://172.18.0.2:8000 npm run dev
const backendTarget = process.env.VITE_BACKEND_TARGET || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    port: 5173,
    proxy: {
      '/admin/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/admin/login': {
        target: backendTarget,
        changeOrigin: true,
        bypass(req) {
          // Only proxy POST (API login) — let GET (page load) fall through to SPA
          if (req.method === 'GET') return req.url;
        },
      },
      '/marketing/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
})
