import { chromium } from 'playwright';
import { BASE, envOf, login, log } from '/root/.zcode/tmp/pw/lib.mjs';
const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
try {
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  const btn = page.locator('.cookie-btn-accept-all');
  if (await btn.count()) await btn.first().click({ timeout: 5000 }).catch(() => {});
  await page.goto(BASE + '/admin/dashboard', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('thinkai_theme', 'dark'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const h = Array.from(document.querySelectorAll('h3')).find(x => x.textContent.includes('Nyitott'));
    return h && /[^0]$/.test(h.textContent.trim());
  }, { timeout: 20000 });
  const b2 = page.locator('.cookie-btn-accept-all');
  if (await b2.count()) await b2.first().click({ force: true, timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/root/.zcode/tmp/pw/07_dark_with_data.png', fullPage: true });
  log('dark with data screenshot taken');
  await page.evaluate(() => localStorage.setItem('thinkai_theme', 'light'));
} catch (e) { console.error('ERR', String(e).slice(0, 300)); } finally { await browser.close(); }
