import { test, expect, type Page } from '@playwright/test';
import { seedAuth } from './helpers';

/**
 * Audit-spec: Kampányok (OutboundPage) — chipek, kártya + listanézet.
 * Explicit futtatás: npx playwright test tests/audit-outbound.spec.ts
 */

const mockCampaigns = [
  { id: 1, name: '10% nyári kedvezmény', status: 'Aktív', channels: ['email'], client_ids: [1, 2, 3], created_at: '2026-08-20T10:00:00Z', created_by: 'Kovács Eszter', ai_instructions: '' },
  { id: 2, name: 'Új ügyfelek köszöntője', status: 'Ütemezett', channels: ['email'], client_ids: [1], created_at: '2026-08-30T10:00:00Z', created_by: 'Nagy Bálint', ai_instructions: 'SCHED:2026-09-08T10:00|X' },
  { id: 3, name: 'Visszatérő csomag ajánlat', status: 'Vázlat', channels: ['email'], client_ids: [], created_at: '2026-09-02T10:00:00Z', created_by: 'Tóth Rebeka', ai_instructions: '' },
  { id: 4, name: 'Tavaszi akció emlékeztető', status: 'Befejezett', channels: ['email'], client_ids: [1, 2], created_at: '2026-04-28T10:00:00Z', created_by: 'Kovács Eszter', ai_instructions: '' },
];

async function setup(page: Page) {
  await page.route('**/admin/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/marketing/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/admin/api/campaigns**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCampaigns) })
  );
  await seedAuth(page);
}

test('kampányok — chipek, kártyanézet', async ({ page }) => {
  await setup(page);
  await page.goto('/admin/outbound');
  await expect(page.locator('.page-title', { hasText: 'Kampányok' })).toBeVisible();
  await page.waitForTimeout(500);

  // chipek számlálókkal
  await expect(page.locator('.camp-chip', { hasText: 'Összes' })).toContainText('(4)');
  await expect(page.locator('.camp-chip', { hasText: 'Tervezet' })).toContainText('(1)');
  // AUTOMATIKUS-like: kártya cím + státusz badge
  await expect(page.locator('.camp-card-title', { hasText: '10% nyári kedvezmény' })).toBeVisible();
  await expect(page.locator('.camp-card', { hasText: 'Visszatérő csomag ajánlat' })).toContainText('Tervezet');
  // nézetváltó + accent gomb
  await expect(page.locator('.camp-view-switch')).toBeVisible();
  await expect(page.locator('.cp-btn-accent', { hasText: 'Új kampány' })).toBeVisible();
  await page.screenshot({ path: 'screenshots/audit-outbound-grid.png' });
});

test('kampányok — listanézet', async ({ page }) => {
  await setup(page);
  await page.goto('/admin/outbound');
  await expect(page.locator('.page-title', { hasText: 'Kampányok' })).toBeVisible();
  await page.click('.camp-view-switch button[title="Listanézet"]');
  await page.waitForTimeout(300);
  await expect(page.locator('.cd-table-card')).toBeVisible();
  await expect(page.locator('th', { hasText: 'Küldés / ütemezés' })).toBeVisible();
  await page.screenshot({ path: 'screenshots/audit-outbound-list.png' });
});
