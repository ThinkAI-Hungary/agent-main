import { chromium } from 'playwright';
import { BASE, envOf, login, log } from '/root/.zcode/tmp/pw/lib.mjs';
const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
try {
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  let b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});
  await page.goto(BASE + '/admin/interactions', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('table tbody tr', { timeout: 20000 }).catch(()=>{});
  await page.waitForTimeout(3500);
  b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});
  const row = page.locator('table tbody tr', { hasText: 'balazs.lederer' }).first();
  await row.click({ force: true });
  await page.waitForTimeout(1700);
  const det = page.locator('text=INTERAKCIÓ RÉSZLETEI').first();
  if (await det.count()) { await det.click({ force: true }).catch(()=>{}); await page.waitForTimeout(900); }
  const chip = await page.locator('.ism-edited-chip').count();
  const editBtn = await page.locator('.ism-btn-edit').count();
  const apprBtn = await page.locator('.ism-btn-approve').count();
  log('AUTONOMOUS row modal: chip=', chip, '| Szerkesztés btn=', editBtn, '| Jóváhagyás btn=', apprBtn, '(all expected 0)');
  await page.screenshot({ path: '/root/.zcode/tmp/pw/42_autonomous_modal.png' });
} catch(e){ console.error('ERR', String(e).slice(0,400)); } finally { await browser.close(); }
