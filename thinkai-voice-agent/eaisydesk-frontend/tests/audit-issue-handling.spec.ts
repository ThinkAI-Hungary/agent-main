import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedAuth } from './helpers';

/**
 * Audit-spec: az Ügykezelési szabályok szekció (2026-09-23 mockup-redesign)
 * funkcióinak ellenőrzése mockolt API-val. Explicit futtatás:
 *   npx playwright test tests/audit-issue-handling.spec.ts
 */

const RULES_URL = '/admin/settings';

// A szekció lokátorai
const sec = (page: Page) => page.locator('.co-section', { hasText: 'Ügykezelési szabályok' });

async function openRules(page: Page, writtenBehavior: string, customRules: { desc: string; behavior: string }[] = []) {
  await mockApi(page);
  // Az Ügykezelési beállítások mockja (a többi helper-mock fölé, specifikusan)
  await page.route('**/admin/api/issue-handling**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ writtenBehavior, customRules }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await seedAuth(page);
  await page.goto(RULES_URL);
  await expect(page.locator('.co-sec-title', { hasText: 'Ügykezelési szabályok' })).toBeVisible();
}

test.describe('Ügykezelési szabályok — mockup-redesign (2026-09-23)', () => {

  test('alapértelmezett szabályok: sárga/piros státusz-badge pöttyel', async ({ page }) => {
    await openRules(page, 'approval');
    const s = sec(page);
    await expect(s.locator('.rf-row', { hasText: 'Adminisztratív' }).locator('.rb-badge--open')).toContainText('Átadás embernek');
    await expect(s.locator('.rf-row', { hasText: 'Reklamáció' }).locator('.rb-badge--err')).toContainText('Sürgős átadás embernek');
    await expect(s.locator('.rb-dot')).toHaveCount(2);
  });

  test('kérdőjeles tooltip mindhárom blokknál, hoverre megjelenik', async ({ page }) => {
    await openRules(page, 'autonomous', [{ desc: 'Fájdalom említése', behavior: 'urgent' }]);
    const s = sec(page);
    const tips = s.locator('.info-tip');
    await expect(tips).toHaveCount(3); // alapértelmezett + írásos + egyedi
    await tips.first().hover();
    await expect(tips.first().locator('.tip')).toBeVisible();
    await expect(tips.first().locator('.tip')).toContainText('Nem automatizálható ügyek');
  });

  test('írásos kommunikáció: alcím + Cdd (natív select nélkül)', async ({ page }) => {
    await openRules(page, 'approval');
    const s = sec(page);
    await expect(s.locator('text=Kérdéskezelés a feltöltött cég- és kínálati információk alapján.')).toBeVisible();
    // Nincs natív <select> a szekcióban — a Cdd (custom dropdown) dolgozik
    await expect(s.locator('select')).toHaveCount(0);
    await expect(s.locator('.cdd')).toHaveCount(1);
  });

  test('egyedi korlátozó szabályok CSAK önálló módban látszik', async ({ page }) => {
    await openRules(page, 'approval', [{ desc: 'Fájdalom említése', behavior: 'urgent' }]);
    const s = sec(page);
    // jóváhagyás-módban nincs blokk
    await expect(s.locator('text=Egyedi korlátozó szabályok')).toHaveCount(0);
    // átváltás önállóra a Cdd-n keresztül
    await s.locator('.cdd-trigger').click();
    await page.locator('.cdd-opt', { hasText: 'Önállóan válaszolhat' }).click();
    await expect(s.locator('text=Egyedi korlátozó szabályok')).toBeVisible();
    // a szabály szövege az input ÉRTÉKÉBEN van (nem textcontent)
    await expect(s.locator('.bk-cond .co-item input').first()).toHaveValue('Fájdalom említése');
  });

  test('a Cdd menü teljesen kinyílik (nincs levágás a szekció szélén)', async ({ page }) => {
    await openRules(page, 'approval');
    const s = sec(page);
    await s.locator('.cdd-trigger').click();
    const menu = s.locator('.cdd-menu');
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    const sectionBox = await s.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(sectionBox).not.toBeNull();
    // a menü teljes magasságban renderelődik (2 opció ≈ 74px) — nem vágódik le
    expect(menuBox!.height).toBeGreaterThan(60);
    // és a szekció alsó széle alá is kinyúlhat (a levágás a lényeg)
    await expect(page.locator('.cdd-opt')).toHaveCount(2);
  });

  test('szabály hozzáadása/törlése + sorbeli eljárás Cdd-vel', async ({ page }) => {
    await openRules(page, 'autonomous', [{ desc: 'Fájdalom említése', behavior: 'urgent' }]);
    const s = sec(page);
    const items = s.locator('.bk-cond .co-item');
    await expect(items).toHaveCount(1);
    // hozzáadás
    await s.locator('.co-add-row', { hasText: 'Szabály hozzáadása' }).click();
    await expect(items).toHaveCount(2);
    const row = items.last();
    await row.locator('input').fill('Számlázási ügyek');
    // az eljárás Cdd a soron
    await row.locator('.cdd-trigger').click();
    await page.locator('.cdd-opt', { hasText: 'Sürgős átadás embernek' }).click();
    await expect(row.locator('.cdd-value')).toHaveText('Sürgős átadás embernek');
    // törlés
    await row.locator('.co-del').click();
    await expect(items).toHaveCount(1);
    await expect(items.first().locator('input')).toHaveValue('Fájdalom említése');
  });

  test('mentés: a issue-handling endpoint a helyes payloadot kapja', async ({ page }) => {
    let savedBody: unknown = null;
    await mockApi(page);
    await page.route('**/admin/api/issue-handling**', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ writtenBehavior: 'approval', customRules: [] }) });
      }
      savedBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await seedAuth(page);
    await page.goto(RULES_URL);
    const s = sec(page);
    await expect(s.locator('.co-sec-title')).toBeVisible();
    // módváltás + mentés a fejléc CTA-val
    await s.locator('.cdd-trigger').click();
    await page.locator('.cdd-opt', { hasText: 'Önállóan válaszolhat' }).click();
    await page.locator('button', { hasText: 'Változtatások mentése' }).first().click();
    await page.waitForTimeout(800);
    expect(savedBody).toMatchObject({ writtenBehavior: 'autonomous' });
  });
});
