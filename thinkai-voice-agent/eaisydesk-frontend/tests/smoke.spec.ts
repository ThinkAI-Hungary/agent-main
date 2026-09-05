import { test, expect } from '@playwright/test';
import { mockApi, seedAuth, TEST_USER } from './helpers';

/**
 * Smoke tesztek — fő folyamatok és minden fő oldal renderelésének ellenőrzése.
 * A backend teljesen mockolva van, így a tesztek önállóan futtathatók a buildelt frontend ellen.
 * Cél: gyors regression-háló UI/design munkákhoz (nem funkcionális teszt).
 */

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('bejelentkezési oldal betölt', async ({ page }) => {
  await page.goto('/admin/');
  await expect(page.locator('input[placeholder*="admin@thinkai"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('sikeres bejelentkezés az admin analitikára visz', async ({ page }) => {
  await page.goto('/admin/');
  await page.fill('input[placeholder*="admin@thinkai"]', TEST_USER.email);
  await page.fill('input[type="password"]', 'dummy-password');
  await page.click('button.login-btn');
  // admin szerepkör esetén a SmartRedirect az analitikára visz
  await expect(page).toHaveURL(/analytics/);
  await expect(page.locator('.page-title', { hasText: 'Analitika' })).toBeVisible();
});

const ROUTES: Array<{ path: string; title: string; sel?: string }> = [
  { path: '/admin/dashboard', title: '' }, // member dashboard: nincs .page-title, a greeting az anchor
  { path: '/admin/analytics', title: 'Analitika' },
  { path: '/admin/interactions', title: 'Interakciós napló' },
  { path: '/admin/clients', title: 'Ügyféllista' },
  { path: '/admin/kanban', title: 'Érdeklődőkezelés' },
  { path: '/admin/calendar', title: 'Naptár' },
  { path: '/admin/outbound', title: 'Kampányok' },
  { path: '/admin/automatizaciok', title: 'Automatikus értesítések' },
  { path: '/admin/beallitasok', title: 'Beállítások' },
  // a basic tab saját címet renderel; a marketing oldal címe .mkt-page-title osztályú
  { path: '/admin/settings/basic', title: 'Cég- és szolgáltatásinformációk' },
  { path: '/admin/help', title: 'Segítség' },
  { path: '/admin/marketing/dashboard', title: '', sel: '.mkt-page-title' },
];

for (const { path, title, sel } of ROUTES) {
  test(`${path} oldal betölt`, async ({ page }) => {
    await seedAuth(page);
    await page.goto(path);
    const anchor = sel
      ? page.locator(sel).first()
      : title
        ? page.locator('.page-title', { hasText: title }).first()
        : page.locator('.member-greeting-title');
    await expect(anchor.first()).toBeVisible({ timeout: 15_000 });
    // sidebar is renderelt (app shell működik)
    await expect(page.locator('button.sidebar-theme-toggle')).toBeVisible();
  });
}

test('command palette Ctrl+K nyit és Esc zár', async ({ page }) => {
  await seedAuth(page);
  await page.goto('/admin/dashboard');
  await expect(page.locator('.member-greeting-title')).toBeVisible();

  await page.keyboard.press('Control+k');
  await expect(page.locator('.cmd-modal')).toBeVisible();
  await expect(page.locator('.cmd-input')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.locator('.cmd-modal')).toBeHidden();
});

test('sötét téma váltás működik', async ({ page }) => {
  await seedAuth(page);
  await page.goto('/admin/dashboard');
  await expect(page.locator('.member-greeting-title')).toBeVisible();

  const body = page.locator('body');
  const before = await body.evaluate((el) => el.classList.contains('dark'));
  await page.click('button.sidebar-theme-toggle');
  await expect(body).toHaveClass(before ? /^((?!dark).)*$/ : /dark/);
});
