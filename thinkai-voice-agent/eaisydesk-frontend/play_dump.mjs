import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://digideskadmin.molaire.hu/admin/login');
await page.fill('#login-email', process.env.AU);
await page.fill('#login-password', process.env.AP);
await page.click('button[type="submit"]');
await page.waitForTimeout(3500);
await page.goto('https://digideskadmin.molaire.hu/admin/interakciok');
await page.waitForTimeout(5000);
// kandidátus elemek: mi szerepel a listában?
const dump = await page.evaluate(() => {
  const out = [];
  for (const e of document.querySelectorAll('*')) {
    const t = (e.textContent || '');
    if (t.includes('07:4') && t.length < 500 && e.children.length > 1) {
      out.push({ cls: (e.className||'').toString().slice(0,50), tag: e.tagName, text: t.slice(0,120) });
    }
  }
  return out.slice(-8);
});
console.log(JSON.stringify(dump, null, 1));
await page.screenshot({ path: '/tmp/interakciok.png' });
await browser.close();
