import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://digideskadmin.molaire.hu/admin/login');
await page.fill('#login-email', process.env.AU);
await page.fill('#login-password', process.env.AP);
await page.click('button[type="submit"]');
await page.waitForTimeout(3500);
await page.goto('https://digideskadmin.molaire.hu/admin/settings');
await page.waitForTimeout(5000);
await page.evaluate(() => {
  const el = [...document.querySelectorAll('button, a, [role="tab"], div')].find(b => (b.textContent||'').trim() === 'Céginformációk');
  if (el) el.click();
});
await page.waitForTimeout(3000);
const res = await page.evaluate(() => {
  const card = [...document.querySelectorAll('*')].find(e =>
    (e.textContent||'').trim().startsWith('Kizárt feladók') && e.querySelector('input'));
  const chip = [...document.querySelectorAll('span')].some(s => s.textContent === 'tandilau@gmail.com');
  const domChip = [...document.querySelectorAll('span')].some(s => s.textContent === 'dentors.com');
  return { kartya: !!card, emailChip: chip, domainChip: domChip };
});
console.log('VÉGEREDMÉNY:', JSON.stringify(res));
await page.screenshot({ path: '/tmp/kizaro_vegso.png' });
await browser.close();
