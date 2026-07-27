import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import expressApp from './src/api/index.js' // Import embedded Express API app
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

export default defineConfig(({ mode }) => {
  // Read and parse the .env file directly, completely ignoring process.env / system environment overrides
  const envPath = path.resolve(process.cwd(), '.env');
  let envConfig: Record<string, string> = {};
  try {
    if (fs.existsSync(envPath)) {
      envConfig = dotenv.parse(fs.readFileSync(envPath));
    }
  } catch (err) {
    console.error('[VITE-CONFIG] Error parsing .env file:', err);
  }

  // Fallbacks in case the file doesn't exist or is empty
  const supabaseUrl = envConfig.VITE_SUPABASE_URL || 'https://ikdansocfbvaczijknfi.supabase.co';
  const supabaseAnonKey = envConfig.VITE_SUPABASE_ANON_KEY || 'sb_publishable_yJfW1hdMkP44GCFK3VimXg_joKLhl54';

  console.log('[VITE-CONFIG] Injecting URL:', supabaseUrl);

  return {
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
    define: {
      // Force client bundle to use the exact values from .env, bypassing system-level overrides
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
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
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
})
// Force config rebuild triggers: 6
