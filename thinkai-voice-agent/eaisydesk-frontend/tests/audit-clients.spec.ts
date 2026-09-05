import { test, expect, type Page } from '@playwright/test';
import { seedAuth } from './helpers';

/**
 * Audit-spec: Ügyféllista (ClientsPage) — design és Új ügyfél modál.
 * Nem része a smoke-csomagnak — explicit futtatás:
 *   npx playwright test tests/audit-clients.spec.ts
 */

const now = Date.now();
const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000).toISOString();

const mockColumns = [
  { id: 'utankovetes', name: 'UTÁNKÖVETÉS', order_index: 0 },
  { id: 'kapcsolatfelvetel', name: 'Kapcsolatfelvétel', order_index: 1 },
  { id: 'dontes', name: 'Döntés', order_index: 2 },
];

const mockClients = [
  { id: 1, name: 'Antal Gergő', status: 'utankovetes', created_at: iso(20), custom_data: JSON.stringify({ tags: ['kampánylead'], telefonszam: '+36 30 555 6699' }) },
  { id: 2, name: 'Balogh Emese', status: 'kapcsolatfelvetel', created_at: iso(30), custom_data: JSON.stringify({ tags: ['árkérdés'], telefonszam: '+36 70 555 3344' }) },
  { id: 3, name: 'Deák Ágnes', status: 'uj', created_at: iso(50), custom_data: JSON.stringify({ tags: [], email: 'deak.agnes@pelda.hu' }) },
];

async function setup(page: Page) {
  await page.route('**/admin/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/marketing/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/admin/api/kanban_columns**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ columns: mockColumns }) })
  );
  await page.route('**/admin/api/clients**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clients: mockClients }) })
  );
  await page.route('**/admin/api/interactions**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ interactions: [] }) })
  );
  await page.route('**/admin/api/calendar**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) })
  );
  await seedAuth(page);
}

test('ügyféllista — fejléc sáv, tábla, ért. státusz', async ({ page }) => {
  await setup(page);
  await page.goto('/admin/clients');
  await expect(page.locator('.page-title', { hasText: 'Ügyféllista' })).toBeVisible();
  await page.waitForTimeout(600);
  // accent gomb
  await expect(page.locator('.cp-btn-accent', { hasText: 'Új ügyfél' })).toBeVisible();
  // értékesítési státusz: kanban-tagoknál oszlopnév, másnál üres
  const row1 = page.locator('tbody tr', { hasText: 'Antal Gergő' });
  await expect(row1).toContainText('UTÁNKÖVETÉS');
  const row3 = page.locator('tbody tr', { hasText: 'Deák Ágnes' });
  await expect(row3.locator('td').nth(6)).toContainText('—');
  await page.screenshot({ path: 'screenshots/audit-clients.png' });
});

test('új ügyfél modál + kontakt validáció', async ({ page }) => {
  await setup(page);
  await page.goto('/admin/clients');
  await expect(page.locator('.page-title', { hasText: 'Ügyféllista' })).toBeVisible();
  await page.click('.cp-btn-accent');
  await expect(page.locator('.cd-task-modal')).toBeVisible();
  // név + mindkét kontakt üres → Mentés tiltott
  await expect(page.locator('.cd-btn-primary')).toBeDisabled();
  await page.fill('#ncName', 'Teszt Elemér');
  await page.fill('#ncPhone', '+36 30 111 2222');
  await expect(page.locator('.cd-btn-primary')).toBeEnabled();
  await page.screenshot({ path: 'screenshots/audit-clients-modal.png' });
});
