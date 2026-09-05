import { test, expect, type Page } from '@playwright/test';
import { seedAuth } from './helpers';

/**
 * Audit-spec: Érdeklődőkezelés (kanban) — belépési szabály és design.
 * Nem része a smoke-csomagnak — explicit futtatás:
 *   npx playwright test tests/audit-kanban.spec.ts
 */

const now = Date.now();
const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000).toISOString();

const mockColumns = [
  { id: 'utankovetes', name: 'UTÁNKÖVETÉS', order_index: 0 },
  { id: 'egyeztetes-ajanlat', name: 'Egyeztetés / ajánlat', order_index: 1 },
  { id: 'dontes', name: 'Döntés', order_index: 2 },
];

const mockClients = [
  // 1) értékesítési címkés, státusz nélkül → UTÁNKÖVETÉS-be kell kerüljön
  { id: 1, name: 'Kovács Anna', status: 'uj', created_at: iso(3), custom_data: JSON.stringify({ tags: ['kampánylead', 'árkérdés'], telefonszam: '+36 30 555 1122', assigned_to: 'Tóth Rebeka' }) },
  // 2) NINCS értékesítési címke, státusz sem oszlop → NEM látszik
  { id: 2, name: 'Rejtett Elemér', status: 'uj', created_at: iso(4), custom_data: JSON.stringify({ tags: ['VIP'] }) },
  // 3) kézzel áthelyezve (státusz = oszlop id), címke nélkül is látszik
  { id: 3, name: 'Nagy Péter', status: 'dontes', created_at: iso(26), custom_data: JSON.stringify({ tags: [], telefonszam: '+36 20 555 4433' }) },
  // 4) kanbanról eltávolítva jelzővel → nem látszik, bár van címke
  { id: 4, name: 'Eltávolított Ilona', status: 'uj', created_at: iso(6), custom_data: JSON.stringify({ tags: ['no-show'], kanban_removed: true }) },
];

const mockSessions = [
  {
    session_id: 'call-51', interaction_count: 1, last_created_at: iso(2), session_statusz: 'Lezárt',
    room_name: 'rivergate-call-51', participant: 'Kovács Anna', client_name: 'Kovács Anna',
    representative: { id: 31, created_at: iso(2), type: 'telefon', direction: 'inbound', client_id: 1, topic: 'Kérdés', summary: 'Árakra kérdezett.', result: 'Megválaszolt kérdés' },
  },
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
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ interactions: [
      { id: 31, created_at: iso(2), type: 'telefon', client_id: 1, topic: 'Kérdés' },
    ] }) })
  );
  await page.route('**/admin/api/calendar**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) })
  );
  const { seedAuth } = await import('./helpers');
  await seedAuth(page);
}

test('kanban — belépési szabály és design', async ({ page }) => {
  await setup(page);
  await page.goto('/admin/kanban');
  await expect(page.locator('.page-title', { hasText: 'Érdeklődőkezelés' })).toBeVisible();
  await page.waitForTimeout(600);

  // UTÁNKÖVETÉS oszlop létezik ésbenne van a címkés ügyfél
  await expect(page.locator('.kanban-col-name', { hasText: 'UTÁNKÖVETÉS' })).toBeVisible();
  await expect(page.locator('#col-utankovetes .kanban-card-name', { hasText: 'Kovács Anna' })).toBeVisible();
  // nem címkés, nem áthelyezett ügyfél NEM látszik
  await expect(page.locator('.kanban-card-name', { hasText: 'Rejtett Elemér' })).toHaveCount(0);
  // kanban_removed jelzős ügyfél NEM látszik
  await expect(page.locator('.kanban-card-name', { hasText: 'Eltávolított Ilona' })).toHaveCount(0);
  // státusz-oszlopos ügyfél a Döntés oszlopban
  await expect(page.locator('#col-dontes .kanban-card-name', { hasText: 'Nagy Péter' })).toBeVisible();
  // muted Oszlop hozzáadása a sor végén
  await expect(page.locator('.kanban-add-col-trigger')).toBeVisible();
  // védett oszlopnál nincs törlés gomb
  await expect(page.locator('#col-utankovetes .kanban-col-icon-btn--danger')).toHaveCount(0);

  await page.screenshot({ path: 'screenshots/audit-kanban.png' });
});

test('kanban — dark mode', async ({ page }) => {
  await setup(page);
  await seedAuth(page, { thinkai_theme: 'dark' });
  await page.goto('/admin/kanban');
  await expect(page.locator('.page-title', { hasText: 'Érdeklődőkezelés' })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/audit-kanban-dark.png' });
});
