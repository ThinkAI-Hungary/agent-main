import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tesztek a buildelt SPA ellen (vite preview).
 * Minden API hívás mockolva van (lásd tests/helpers.ts), backend nem szükséges.
 * Futtatás: npm run test:e2e
 * Képernyőképek: SHOTS=1 npx playwright test tests/visual.spec.ts
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/admin/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
