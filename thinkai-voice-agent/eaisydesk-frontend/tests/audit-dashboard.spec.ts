import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedAuth } from './helpers';

/**
 * Audit-spec: a member dashboard három szekciójának (Sürgős teendők /
 * Nyitott teendők / Ma elvégzett) ellenőrzése craftolt mock-adatokkal.
 * Nem része a smoke-csomagnak — explicit futtatás:
 *   npx playwright test tests/audit-dashboard.spec.ts
 */

const now = Date.now();
const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000).toISOString();
// A „ma" határok órától függetlenül teszt-biztosak: az aznapi időbélyegek a
// helyi éjfél UTÁN keletkeznek, a tegnapiak 30 órával ezelőtt (soha nem ma)
const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
const isoToday = (msAfterMidnight: number) => new Date(midnight.getTime() + msAfterMidnight).toISOString();

// Mock sorok: (a) Sürgős ma, (b) Nyitott ma, (c) Nyitott 3 napja (→ Lejárt),
// (d) Lezárt closed_at-tel paraméter szerint, (e) Lezárt tegnap
const buildRows = (doneClosedAt: string) => [
  {
    id: 1, session_id: 'dash-a', created_at: isoToday(60_000), type: 'telefon', direction: 'inbound',
    client_name: 'Kovács Anna', approval_status: null,
    classification: { ugytipus: 'Panasz', eredmeny: 'Panasz rögzítve', statusz: 'Sürgős', teendo: 'Azonnali beavatkozás szükséges' },
  },
  {
    id: 2, session_id: 'dash-b', created_at: isoToday(120_000), type: 'email', direction: 'inbound',
    client_name: 'Nagy Péter', approval_status: 'pending',
    classification: { ugytipus: 'Kérdés', eredmeny: 'Válasz előkészítve', statusz: 'Nyitott', teendo: 'Jóváhagyás szükséges' },
  },
  {
    id: 3, session_id: 'dash-c', created_at: iso(72), type: 'email', direction: 'inbound',
    client_name: 'Szabó Mária', approval_status: null,
    classification: { ugytipus: 'Kérés', eredmeny: 'Igény rögzítve', statusz: 'Nyitott', teendo: 'Intézkedés' },
  },
  {
    id: 4, session_id: 'dash-d', created_at: iso(30), type: 'email', direction: 'inbound',
    client_name: 'Kiss Eszter', approval_status: 'approved', closed_at: doneClosedAt,
    classification: { ugytipus: 'Kérdés', eredmeny: 'Megválaszolt kérdés', statusz: 'Lezárt', teendo: 'Nincs további teendő' },
  },
  {
    id: 5, session_id: 'dash-e', created_at: iso(50), type: 'telefon', direction: 'inbound',
    client_name: 'Varga Judit', approval_status: null, closed_at: iso(30),
    classification: { ugytipus: 'Kérdés', eredmeny: 'Megválaszolt kérdés', statusz: 'Lezárt', teendo: 'Nincs további teendő' },
  },
];

// Kézi teendők: egy nyitott (high → Sürgős szekció) és egy ma befejezett
const buildTasks = (completedAt: string | null) => [
  { id: 101, text: 'Fogszabályozó konzultáció előkészítése', priority: 'high', completed: 0, created_at: isoToday(180_000), completed_at: null, client_id: null },
  { id: 102, text: 'Árlista kiküldése a recepcióra', priority: 'normal', completed: 1, created_at: isoToday(240_000), completed_at: completedAt, client_id: null },
];

async function setup(page: Page, opts: { doneClosedAt: string; taskCompletedAt: string | null }) {
  await mockApi(page);
  // A később regisztrált route élvez elsőbbséget — a saját mockok a mockApi UTÁN jönnek
  await page.route('**/admin/api/interactions**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ interactions: buildRows(opts.doneClosedAt) }) })
  );
  await page.route('**/admin/api/tasks**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tasks: buildTasks(opts.taskCompletedAt) }) })
  );
  await seedAuth(page);
}

const rowsOf = (page: Page, title: string) =>
  page.locator('section', { has: page.locator('h3', { hasText: title }) }).locator('tbody tr');

const kpiNumber = (page: Page, label: string) =>
  page.locator('article', { hasText: label }).locator('span').nth(1).locator('span').first();

test('három szekció és a KPI-k a mockolt adattal', async ({ page }) => {
  await setup(page, { doneClosedAt: new Date().toISOString(), taskCompletedAt: new Date().toISOString() });
  await page.goto('/admin/dashboard');
  await expect(page.locator('.member-greeting-title')).toBeVisible();

  // Sürgős teendők: (a) + high priority kézi teendő
  const urgentRows = rowsOf(page, 'Sürgős teendők');
  await expect(urgentRows).toHaveCount(2);
  await expect(urgentRows.filter({ hasText: 'Kovács Anna' })).toHaveCount(1);
  await expect(urgentRows.filter({ hasText: 'Fogszabályozó konzultáció előkészítése' })).toHaveCount(1);

  // Nyitott teendők: (b) + (c)
  const openRows = rowsOf(page, 'Nyitott teendők');
  await expect(openRows).toHaveCount(2);
  await expect(openRows.filter({ hasText: 'Nagy Péter' })).toHaveCount(1);
  await expect(openRows.filter({ hasText: 'Szabó Mária' })).toHaveCount(1);

  // Ma elvégzett: (d) + a ma befejezett kézi teendő; (e) tegnap lezárt NEM jelenik meg
  const doneRows = rowsOf(page, 'Ma elvégzett');
  await expect(doneRows).toHaveCount(2);
  await expect(doneRows.filter({ hasText: 'Kiss Eszter' })).toHaveCount(1);
  await expect(doneRows.filter({ hasText: 'Árlista kiküldése a recepcióra' })).toHaveCount(1);
  await expect(page.getByText('Varga Judit')).toHaveCount(0);

  // „Lejárt" badge csak a (c) soron (ma 00:00 előtt keletkezett Nyitott)
  await expect(page.getByText('Lejárt', { exact: true })).toHaveCount(1);
  await expect(openRows.filter({ hasText: 'Szabó Mária' }).getByText('Lejárt')).toBeVisible();
  await expect(openRows.filter({ hasText: 'Nagy Péter' }).getByText('Lejárt')).toHaveCount(0);

  // KPI-kártyák számai
  await expect(kpiNumber(page, 'Sürgős teendő')).toHaveText('2');
  await expect(kpiNumber(page, 'Nyitott teendő')).toHaveText('2');
  await expect(kpiNumber(page, 'Ma elvégzett')).toHaveText('2');
});

test('Ma elvégzett üres állapot, ha semmi nem lezárt ma', async ({ page }) => {
  await setup(page, { doneClosedAt: iso(30), taskCompletedAt: iso(30) });
  await page.goto('/admin/dashboard');
  await expect(page.locator('.member-greeting-title')).toBeVisible();

  // Pozitív horgony: a nyitott szekciók betöltöttek…
  await expect(rowsOf(page, 'Sürgős teendők')).toHaveCount(2);
  await expect(rowsOf(page, 'Nyitott teendők')).toHaveCount(2);
  // …a Ma elvégzett viszont üres, a tegnapi lezárások (d) és (e) sehol
  await expect(rowsOf(page, 'Ma elvégzett')).toHaveCount(0);
  await expect(page.getByText('Ma még nincs elvégzett teendő')).toBeVisible();
  await expect(page.getByText('Kiss Eszter')).toHaveCount(0);
  await expect(kpiNumber(page, 'Ma elvégzett')).toHaveText('0');
});
