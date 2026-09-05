import { test, expect, type Page } from '@playwright/test';

/**
 * Audit-spec: az Interakciós napló valósághű megjelenítésének ellenőrzése
 * realisztikus mock-adatokkal. Nem része a smoke-csomagnak — explicit futtatás:
 *   npx playwright test tests/audit-interactions.spec.ts
 */

const now = Date.now();
const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000).toISOString();

export const mockSessions = [
  {
    session_id: 'call-101', interaction_count: 3, last_created_at: iso(1), session_statusz: 'Sürgős',
    room_name: 'rivergate-call-101', participant: '+36305551122', client_name: 'Kovács Anna',
    representative: {
      id: 11, created_at: iso(1), type: 'telefon', direction: 'inbound', client_id: 1,
      topic: 'Időpont', summary: 'Esküvői fotózásra keresett időpontot, kétszer módosított.',
      result: 'Új időpont', approval_status: null, ai_draft_response: null,
      classification: { ugytipus: 'Időpont', eredmeny: 'Új időpont', statusz: 'Sürgős', teendo: 'Azonnali beavatkozás', autonomous: false, restriction: 'urgent' },
    },
  },
  {
    session_id: 'email_2026_88', interaction_count: 5, last_created_at: iso(3), session_statusz: 'Nyitott',
    participant: 'nagy.peter@pelda.hu', client_name: 'Nagy Péter',
    representative: {
      id: 12, created_at: iso(3), type: 'email', direction: 'inbound', client_id: 2,
      topic: 'Kérdés', summary: 'Árlista és csomagokról kérdezett, válasz jóváhagyásra vár.',
      result: 'Jóváhagyásra vár', approval_status: 'pending', ai_draft_response: 'Kedves Péter! ...',
      classification: { ugytipus: 'Kérdés', eredmeny: 'Jóváhagyásra vár', statusz: 'Nyitott', teendo: 'Válasz jóváhagyása szükséges', autonomous: false, restriction: 'approval' },
    },
  },
  {
    session_id: 'instagram_1706910873655270', interaction_count: 2, last_created_at: iso(26), session_statusz: 'Lezárt',
    participant: 'IG:1706910873655270', client_name: 'Szabó Mária',
    representative: {
      id: 13, created_at: iso(26), type: 'instagram', direction: 'inbound', client_id: 3,
      topic: 'Kérés', summary: 'Mintakat kért DM-ben, elküldve.',
      result: 'Igény rögzítve', approval_status: null,
      classification: { ugytipus: 'Kérés', eredmeny: 'Igény rögzítve', statusz: 'Lezárt', teendo: 'Nincs további teendő', autonomous: true },
    },
  },
  {
    session_id: 'messenger_88123', interaction_count: 1, last_created_at: iso(28), session_statusz: 'Lezárt',
    participant: 'MSG:88123', client_name: 'Kiss Eszter',
    representative: {
      id: 14, created_at: iso(28), type: 'messenger', direction: 'inbound', client_id: 4,
      topic: 'Időpont', summary: 'Konzi lefoglalva jövő hétfőre.',
      result: 'Új időpont',
      classification: { ugytipus: 'Időpont', eredmeny: 'Új időpont', statusz: 'Lezárt', teendo: 'Nincs további teendő', autonomous: true },
    },
  },
  {
    session_id: 'whatsapp_36309998877', interaction_count: 4, last_created_at: iso(50), session_statusz: 'Sürgős',
    participant: '+36309998877', client_name: 'Varga Judit',
    representative: {
      id: 15, created_at: iso(50), type: 'whatsapp', direction: 'inbound', client_id: 5,
      topic: 'Panasz', summary: 'Panasz a késés miatt, eszkaláció.',
      result: 'Panasz rögzítve', approval_status: 'rejected',
      classification: { ugytipus: 'Panasz', eredmeny: 'Panasz rögzítve', statusz: 'Sürgős', teendo: 'Azonnali beavatkozás', autonomous: false, restriction: 'handover' },
    },
  },
  {
    session_id: 'call-99', interaction_count: 2, last_created_at: iso(74), session_statusz: 'Lezárt',
    room_name: 'rivergate-call-99', participant: '+36301112233', client_name: 'Molnár Bence',
    representative: {
      id: 16, created_at: iso(74), type: 'telefon', direction: 'inbound', client_id: 6,
      topic: 'Kérdés', summary: 'Nyitvatartásról érdeklődött.',
      result: 'Megválaszolt kérdés',
      classification: { ugytipus: 'Kérdés', eredmeny: 'Megválaszolt kérdés', statusz: 'Lezárt', teendo: 'Nincs további teendő', autonomous: true },
    },
  },
];

export const mockClients = mockSessions.map((s, i) => ({
  id: i + 1,
  name: s.client_name,
  status: i % 3 === 0 ? 'lead' : 'active',
  created_at: iso(24 * (i + 5)),
  custom_data: JSON.stringify({ tags: i === 0 ? ['kampánylead', 'árkérdés'] : [] }),
}));

async function setup(page: Page) {
  // A Playwright-nál a később regisztrált route élvez elsőbbséget — a
  // konkrét mockok ezért a catch-all UTÁN, a grouped pedig LEGUTOLSÓKÉNT
  // jön (a '**/admin/api/interactions**' minta a grouped URL-t is illeszti).
  await page.route('**/admin/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/marketing/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/admin/api/interactions**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ interactions: [] }) })
  );
  await page.route('**/admin/api/clients**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clients: mockClients }) })
  );
  await page.route('**/admin/api/interactions/grouped**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: mockSessions, total: mockSessions.length }) })
  );
  const { seedAuth } = await import('./helpers');
  await seedAuth(page);
}

test('asztali nézet', async ({ page }) => {
  await setup(page);
  await page.goto('/admin/interactions');
  await expect(page.locator('.page-title', { hasText: 'Interakciós napló' })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/audit-int-desktop.png', fullPage: false });
});

test('szűrőpanel nyitva', async ({ page }) => {
  await setup(page);
  await page.goto('/admin/interactions');
  await expect(page.locator('.page-title', { hasText: 'Interakciós napló' })).toBeVisible();
  await page.click('button[title="Szűrés"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/audit-int-filter.png' });
});

test('oszlop menü', async ({ page }) => {
  await setup(page);
  await page.goto('/admin/interactions');
  await expect(page.locator('.page-title', { hasText: 'Interakciós napló' })).toBeVisible();
  await page.click('button[title="Oszlopok"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/audit-int-columns.png' });
});

test('mobil kártyanézet', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await setup(page);
  await page.goto('/admin/interactions');
  await expect(page.locator('.mobile-search-wrapper')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/audit-int-mobile.png' });
});

test('summary modal nyitva', async ({ page }) => {
  await setup(page);
  await page.goto('/admin/interactions');
  await expect(page.locator('.page-title', { hasText: 'Interakciós napló' })).toBeVisible();
  await expect(page.locator('.int-row').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.int-row').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/audit-int-modal.png' });
});
