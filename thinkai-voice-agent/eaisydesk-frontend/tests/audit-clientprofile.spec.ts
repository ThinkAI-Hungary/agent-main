import { test, expect, type Page } from '@playwright/test';
import { seedAuth } from './helpers';

/**
 * Audit-spec: ügyfélprofil (ClientDetailView) megjelenítés és új teendő funkció.
 * Nem része a smoke-csomagnak — explicit futtatás:
 *   npx playwright test tests/audit-clientprofile.spec.ts
 */

const now = Date.now();
const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000).toISOString();

const mockClients = [
  { id: 1, name: 'Kovács Anna', status: 'active', created_at: iso(24 * 180), custom_data: JSON.stringify({ tags: ['kampánylead'], notes: 'Kedveli a WhatsApp-kommunikációt.' }) },
  { id: 2, name: 'Nagy Péter', status: 'lead', created_at: iso(24 * 30), custom_data: '{}' },
];

const mockSessions = [
  {
    session_id: 'whatsapp_36305551122', interaction_count: 2, last_created_at: iso(5), session_statusz: 'Nyitott',
    participant: 'Kovács Anna', client_name: 'Kovács Anna',
    representative: {
      id: 21, created_at: iso(5), type: 'whatsapp', direction: 'inbound', client_id: 1,
      topic: 'Időpont', summary: 'Időpontot kért.', result: 'Új időpont', approval_status: 'pending',
      classification: { ugytipus: 'Időpont', eredmeny: 'Új időpont', statusz: 'Nyitott', teendo: 'Válasz jóváhagyása szükséges' },
    },
  },
  {
    session_id: 'call-77', interaction_count: 1, last_created_at: iso(24 * 30), session_statusz: 'Lezárt',
    room_name: 'rivergate-call-77', participant: 'Kovács Anna', client_name: 'Kovács Anna',
    representative: {
      id: 22, created_at: iso(24 * 30), type: 'telefon', direction: 'inbound', client_id: 1,
      topic: 'Kérdés', summary: 'Árakra kérdezett rá.', result: 'Megválaszolt kérdés',
      classification: { ugytipus: 'Kérdés', eredmeny: 'Megválaszolt kérdés', statusz: 'Lezárt', teendo: 'Nincs további teendő' },
    },
  },
];

const mockEvents = [
  { id: 1, attendee: 'Kovács Anna', attendee_email: 'kovacs.anna@pelda.hu', start_dt: iso(-48), title: 'Konzultáció' },
  { id: 2, attendee: 'Kovács Anna', attendee_email: 'kovacs.anna@pelda.hu', start_dt: iso(72), title: 'Bevezető' },
];

async function setup(page: Page) {
  await page.route('**/admin/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/marketing/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/admin/api/tasks**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tasks: [
      { id: 1, text: 'felhív', priority: 'high', completed: 0, created_at: iso(2), client_id: 1 },
      { id: 2, text: 'árajánlatot küldeni', priority: 'normal', completed: 1, created_at: iso(30), client_id: 1 },
    ] }) })
  );
  await page.route('**/admin/api/clients**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clients: mockClients }) })
  );
  await page.route('**/admin/api/interactions**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ interactions: [] }) })
  );
  await page.route('**/admin/api/calendar**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: mockEvents }) })
  );
  const { seedAuth } = await import('./helpers');
  await seedAuth(page);
}

async function openProfile(page: Page) {
  await page.goto('/admin/clients');
  await expect(page.locator('.page-title', { hasText: 'Ügyféllista' })).toBeVisible();
  await page.waitForTimeout(600);
  await page.locator('.int-row').first().click();
  await expect(page.locator('.cd-hero')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
}

test('ügyfélprofil — hero, kártyák, táblák', async ({ page }) => {
  await setup(page);
  await openProfile(page);
  await page.screenshot({ path: 'screenshots/audit-profile.png', fullPage: true });
});

test('ügyfélprofil — dark mode', async ({ page }) => {
  await setup(page);
  await seedAuth(page, { thinkai_theme: 'dark' });
  await page.goto('/admin/clients');
  await expect(page.locator('.page-title', { hasText: 'Ügyféllista' })).toBeVisible();
  await page.waitForTimeout(600);
  await page.locator('.int-row').first().click();
  await expect(page.locator('.cd-hero')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/audit-profile-dark.png', fullPage: true });
});

test('új teendő modál', async ({ page }) => {
  await setup(page);
  await openProfile(page);
  await page.click('.cd-add-task-btn');
  await expect(page.locator('.cd-task-modal')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/audit-profile-taskmodal.png' });
});
