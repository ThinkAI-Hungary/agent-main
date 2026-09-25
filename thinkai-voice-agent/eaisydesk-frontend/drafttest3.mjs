import { chromium } from 'playwright';
import { BASE, envOf, login, log } from '/root/.zcode/tmp/pw/lib.mjs';
const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
async function openRowExpand(rowText) {
  const row = page.locator('table tbody tr', { hasText: rowText }).first();
  if (!(await row.count())) { log('ROW NOT FOUND:', rowText); return false; }
  await row.click({ force: true });
  await page.waitForTimeout(1700);
  const det = page.locator('button, [role="button"], div', { hasText: /^INTERAKCIÓ RÉSZLETEI/i }).last();
  const det2 = page.locator('text=INTERAKCIÓ RÉSZLETEI').first();
  if (await det2.count()) { await det2.click({ force: true }).catch(()=>{}); await page.waitForTimeout(900); }
  return (await page.locator('.ism-card').count()) > 0;
}
async function closeModal() {
  const x = page.locator('.ism-card button').first();
  await x.click({ force: true }).catch(()=>{});
  await page.waitForTimeout(700);
  return !(await page.locator('.ism-card').count());
}
try {
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  let b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});
  await page.goto(BASE + '/admin/interactions', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('table tbody tr', { timeout: 20000 }).catch(()=>{});
  await page.waitForTimeout(4000);
  b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});

  // ── VD1: szerkesztés + jóváhagyás ──
  log('VD1 open+expand:', await openRowExpand('Kettes'));
  const editBtn = page.locator('.ism-btn-edit').first();
  log('Szerkesztés button:', await editBtn.count());
  await page.screenshot({ path: '/root/.zcode/tmp/pw/30_vd1_modal_expanded.png' });
  if (await editBtn.count()) {
    await editBtn.click({ force: true });
    await page.waitForTimeout(600);
    const ta = page.locator('.ism-card textarea').first();
    await ta.fill('SZERKESZTETT VALASZ A ZCODE TESZTBEN — ez az ember altal atirt szoveg.');
    await page.screenshot({ path: '/root/.zcode/tmp/pw/31_vd1_edited.png' });
    await page.locator('.ism-btn-approve').first().click({ force: true });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/root/.zcode/tmp/pw/32_vd1_approved.png' });
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2500));
    log('after approve → "sikertelen"?', /sikertelen/i.test(bodyText), '| hibaüzenet slice:', bodyText.replace(/\n+/g,' | ').slice(0, 400));
  }
  log('close →', await closeModal());
  log('VD1 re-open:', await openRowExpand('Kettes'));
  await page.waitForTimeout(700);
  const chip = page.locator('.ism-edited-chip').first();
  log('VD1 EDITED CHIP:', await chip.count(), '| text:', (await chip.count()) ? (await chip.innerText()).trim() : '(none)');
  await page.screenshot({ path: '/root/.zcode/tmp/pw/33_vd1_chip.png' });
  log('close →', await closeModal());

  // ── VD2: szerkesztés NÉLKÜLI küldés ──
  log('VD2 open+expand:', await openRowExpand('ZCode Draft Teszt'));
  await page.screenshot({ path: '/root/.zcode/tmp/pw/35_vd2_expanded.png' });
  if (await page.locator('.ism-btn-approve').count()) {
    await page.locator('.ism-btn-approve').first().click({ force: true });
    await page.waitForTimeout(5000);
    log('close →', await closeModal());
    log('VD2 re-open:', await openRowExpand('ZCode Draft Teszt'));
    await page.waitForTimeout(700);
    const chip2 = page.locator('.ism-edited-chip').first();
    log('VD2 EDITED CHIP (expected 0):', await chip2.count());
    await page.screenshot({ path: '/root/.zcode/tmp/pw/34_vd2_nochip.png' });
  } else { log('VD2: no approve button visible'); }
} catch(e){ console.error('ERR', String(e).slice(0,600)); await page.screenshot({path:'/root/.zcode/tmp/pw/err_draft3.png'}).catch(()=>{});} finally { await browser.close(); }
