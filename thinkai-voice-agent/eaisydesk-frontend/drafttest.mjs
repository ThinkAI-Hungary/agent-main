import { chromium } from 'playwright';
import { BASE, envOf, login, log } from '/root/.zcode/tmp/pw/lib.mjs';
const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
async function openRow(rowText) {
  const row = page.locator('tr', { hasText: rowText }).first();
  if (!(await row.count())) { log('ROW NOT FOUND:', rowText); return false; }
  await row.click({ force: true });
  await page.waitForTimeout(1600);
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
  await page.waitForTimeout(3000);
  b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});

  // ── VD1: edit then approve ──
  log('VD1 modal open:', await openRow('[VERIFY] VD1'));
  await page.screenshot({ path: '/root/.zcode/tmp/pw/30_vd1_modal.png' });
  const editBtn = page.locator('.ism-btn-edit').first();
  log('Szerkesztés button:', await editBtn.count());
  if (await editBtn.count()) {
    await editBtn.click({ force: true });
    await page.waitForTimeout(500);
    const ta = page.locator('.ism-card textarea').first();
    log('textarea:', await ta.count());
    await ta.fill('SZERKESZTETT VALASZ A ZCODE TESZTBEN — ez az ember altal atirt szoveg.');
    await page.screenshot({ path: '/root/.zcode/tmp/pw/31_vd1_edited.png' });
    await page.locator('.ism-btn-approve').first().click({ force: true });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: '/root/.zcode/tmp/pw/32_vd1_approved.png' });
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1500));
    log('after approve, mentions sikertelen?', /sikertelen/i.test(bodyText), '| siker?', /siker/i.test(bodyText));
  }
  log('close VD1 →', await closeModal());

  // re-open VD1 → chip check
  log('VD1 re-open:', await openRow('[VERIFY] VD1'));
  await page.waitForTimeout(800);
  const chip = page.locator('.ism-edited-chip').first();
  log('EDITED CHIP present:', await chip.count(), '| text:', (await chip.count()) ? (await chip.innerText()).trim() : '(none)');
  await page.screenshot({ path: '/root/.zcode/tmp/pw/33_vd1_chip.png' });
  log('close →', await closeModal());

  // ── VD2: approve without editing ──
  log('VD2 modal open:', await openRow('[VERIFY] VD2'));
  await page.locator('.ism-btn-approve').first().click({ force: true });
  await page.waitForTimeout(4000);
  log('close VD2 →', await closeModal());
  log('VD2 re-open:', await openRow('[VERIFY] VD2'));
  await page.waitForTimeout(800);
  const chip2 = page.locator('.ism-edited-chip').first();
  log('VD2 EDITED CHIP (expected 0):', await chip2.count());
  await page.screenshot({ path: '/root/.zcode/tmp/pw/34_vd2_nochip.png' });
} catch(e){ console.error('ERR', String(e).slice(0,600)); await page.screenshot({path:'/root/.zcode/tmp/pw/err_draft.png'}).catch(()=>{});} finally { await browser.close(); }
