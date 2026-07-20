import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import expressApp from './src/api/index.js' // Import embedded Express API app

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'creative-studio-api',
      configureServer(server) {
        // Only route requests starting with /api or /renders to the embedded Express app,
        // letting other requests (like /admin/login, /admin/api) pass through to the FastAPI proxy.
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/api') || req.url?.startsWith('/renders')) {
            expressApp(req as any, res as any, next);
          } else {
            next();
          }
        });
      }
    }
  ],
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
    },
  },
})
// Force config rebuild triggers: 3
