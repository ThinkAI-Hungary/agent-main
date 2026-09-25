import { chromium } from 'playwright';
import { BASE, envOf, login, log } from '/root/.zcode/tmp/pw/lib.mjs';
const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
try {
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  await page.goto(BASE + '/admin/dashboard', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('thinkai_theme', 'dark'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h3:has-text("Ma elvégzett")', { timeout: 15000 });
  // wait until the Nyitott count is > 0 or 12s elapsed
  await page.waitForFunction(() => {
    const h = Array.from(document.querySelectorAll('h3')).find(x => x.textContent.includes('Nyitott'));
    return h && !h.textContent.includes('0');
  }, { timeout: 15000 }).catch(() => log('data did not load in 15s'));
  await page.screenshot({ path: '/root/.zcode/tmp/pw/06_dashboard_dark_data.png', fullPage: true });
  const info = await page.evaluate(() => {
    const h3s = Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim().replace(/\s+/g, ' '));
    const h = Array.from(document.querySelectorAll('h3')).find(x => x.textContent.includes('Ma elvégzett'));
    let bgc = 'transparent'; let el = h;
    while (el && (bgc === 'transparent' || bgc.includes('0, 0, 0, 0'))) { bgc = getComputedStyle(el).backgroundColor; el = el.parentElement; }
    return { h3s, headingColor: getComputedStyle(h).color, sectionBg: bgc };
  });
  log('DARK+DATA:', JSON.stringify(info, null, 1));
  await page.evaluate(() => localStorage.setItem('thinkai_theme', 'light'));
} catch (e) { console.error('ERR', e); } finally { await browser.close(); }
