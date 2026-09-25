import { chromium } from 'playwright';
import { BASE, envOf, login, log } from '/root/.zcode/tmp/pw/lib.mjs';
const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
try {
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  let b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});
  await page.goto(BASE + '/admin/interactions', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('table tbody tr', { timeout: 20000 }).catch(()=>{});
  await page.waitForTimeout(4000);
  b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});
  const texts = await page.evaluate(() => Array.from(document.querySelectorAll('table tbody tr')).map(r=>r.textContent.trim().replace(/\s+/g,' ').slice(0,80)));
  log('rows:', JSON.stringify(texts, null, 1));
  const total = await page.evaluate(() => document.body.innerText.match(/\d+–\d+ \/ (\d+) találat/)?.[1] || '?');
  log('total találat:', total);
} catch(e){ console.error(String(e).slice(0,300)); } finally { await browser.close(); }
