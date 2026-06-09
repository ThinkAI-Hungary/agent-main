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
      },
      '/login-bg.png': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/eaisydesk_logo.png': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/thinkai-logo.png': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
