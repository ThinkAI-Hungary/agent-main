import { test, expect, type Page } from '@playwright/test';
import { seedAuth } from './helpers';

const now = new Date();
function iso(offsetDays: number, h: number, m: number) {
  const d = new Date(now.getTime() + offsetDays * 86400000);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const mockEvents = [
  { id: 1, title: 'Konzultáció', start_dt: iso(0, 9, 30), duration_minutes: 60, attendee: 'Kovács Anna', attendee_email: 'kovacs.anna@pelda.hu', reminder_sent: false },
  { id: 2, title: 'EMS fogkő-eltávolítás', start_dt: iso(0, 14, 0), duration_minutes: 45, attendee: 'Nagy Péter', attendee_email: 'nagy.peter@pelda.hu', reminder_sent: true },
  { id: 3, title: 'Bevezető', start_dt: iso(2, 10, 0), duration_minutes: 30, attendee: 'Szabó Mária', attendee_email: 'szabo.maria@pelda.hu', reminder_sent: false },
  { id: 4, title: 'Konzultáció', start_dt: iso(5, 15, 30), duration_minutes: 60, attendee: 'Kovács Anna', attendee_email: 'kovacs.anna@pelda.hu', reminder_sent: false },
];

async function setup(page: Page) {
  await page.route('**/admin/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/marketing/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/admin/api/calendar**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockEvents) })
  );
  await seedAuth(page);
}

test('naptár — heti rács + események', async ({ page }) => {
  await setup(page);
  await page.goto('/admin/calendar');
  await expect(page.locator('.page-title', { hasText: 'Naptár' })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('.cal-week')).toBeVisible();
  await expect(page.locator('.cal-ev-abs').first()).toBeVisible();
  await page.screenshot({ path: 'screenshots/audit-calendar-week.png' });
});

test('naptár — hónap nézet', async ({ page }) => {
  await setup(page);
  await page.goto('/admin/calendar');
  await expect(page.locator('.page-title', { hasText: 'Naptár' })).toBeVisible();
  await page.click('.cal-seg-btn >> text=Hónap');
  await expect(page.locator('.cal-month-grid')).toBeVisible();
  await page.screenshot({ path: 'screenshots/audit-calendar-month.png' });
});

test('naptár — listanézet', async ({ page }) => {
  await setup(page);
  await page.goto('/admin/calendar');
  await expect(page.locator('.page-title', { hasText: 'Naptár' })).toBeVisible();
  await page.click('.cal-list-toggle');
  await expect(page.locator('.cal-list-card tbody tr').first()).toBeVisible();
  await page.screenshot({ path: 'screenshots/audit-calendar-list.png' });
});
