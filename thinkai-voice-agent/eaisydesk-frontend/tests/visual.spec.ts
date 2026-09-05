import { test, expect } from '@playwright/test';
import { mockApi, seedAuth } from './helpers';

/**
 * Vizuális képernyőképek UI-munkához. Alapból kihagyva; futtatás:
 *   SHOTS=1 npx playwright test tests/visual.spec.ts
 * A képek a screenshots/ mappába kerülnek (gitignore-olt).
 */
test.skip(!process.env.SHOTS, 'Csak SHOTS=1 env változóval fut');

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('analytics oldal — felső szintű aktív nav elem', async ({ page }) => {
  await seedAuth(page);
  await page.goto('/admin/analytics');
  await expect(page.locator('.page-title', { hasText: 'Analitika' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/sidebar-analytics.png' });
});

test('interakciók oldal — alcím aktív, csoport nyitva', async ({ page }) => {
  await seedAuth(page);
  await page.goto('/admin/interactions');
  await expect(page.locator('.page-title', { hasText: 'Interakciós napló' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/sidebar-interactions.png' });
});

test('becsukott oldalsáv', async ({ page }) => {
  await seedAuth(page, { digidesk_sidebar_collapsed: '1' });
  await page.goto('/admin/analytics');
  await expect(page.locator('.page-title', { hasText: 'Analitika' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/sidebar-collapsed.png' });
});

test('app switcher lenyitva', async ({ page }) => {
  await seedAuth(page);
  await page.goto('/admin/analytics');
  await expect(page.locator('.page-title', { hasText: 'Analitika' })).toBeVisible();
  await page.click('.sidebar-logo--clickable');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/sidebar-switcher.png' });
});

test('mobil nézet — oldalsáv nyitva', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seedAuth(page);
  await page.goto('/admin/analytics');
  await expect(page.locator('.page-title', { hasText: 'Analitika' })).toBeVisible();
  await page.click('.mobile-hamburger-btn');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/sidebar-mobile.png' });
});
