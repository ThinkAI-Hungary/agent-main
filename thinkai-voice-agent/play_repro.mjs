import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
const rec = [];
page.on('response', r => { if (r.url().includes('/recording')) rec.push(`RESP ${r.status()} ${r.headers()['content-length'] || 'nincs-cl'} ${r.request().headers()['range'] || 'nincs-range'}`); });
page.on('request', r => { if (r.url().includes('/recording')) rec.push(`REQ ${r.headers()['range'] || 'nincs-range-header'}`); });
page.on('console', m => { if (m.type() === 'error') rec.push('CONSOLE ' + m.text().slice(0,140)); });

await page.goto('https://digideskadmin.molaire.hu/admin/login');
await page.fill('#login-email', process.env.AU);
await page.fill('#login-password', process.env.AP);
await page.click('button[type="submit"]');
await page.waitForTimeout(3500);

await page.goto('https://digideskadmin.molaire.hu/admin/interakciok');
await page.waitForTimeout(4500);

// A lejátszó-gomb: a popup megnyitása után van csak — előbb a sor-kártyára kattintunk force-tal
const target = page.locator('div,button,tr,li').filter({ hasText: 'Telefon' }).last();
await target.click({ force: true, timeout: 8000 }).catch(e => console.log('kattintás hiba:', e.message.slice(0,80)));
await page.waitForTimeout(2000);

// ha van player-gomb, nyomjuk meg
const playBtn = page.locator('.ism-recording-btn');
const btnCount = await playBtn.count();
console.log('player-gombok:', btnCount);
if (btnCount > 0) {
  await playBtn.first().click({ force: true });
  await page.waitForTimeout(6000);
}
const audio = await page.evaluate(() => {
  const a = document.querySelector('audio');
  if (!a) return { found: false };
  return { found: true, src: (a.currentSrc || a.src || '').slice(0,100),
           readyState: a.readyState, networkState: a.networkState,
           duration: a.duration, error: a.error ? `${a.error.code}:${a.error.message}` : null,
           currentTime: a.currentTime, paused: a.paused };
});
console.log('AUDIO:', JSON.stringify(audio, null, 1));
console.log('rec-napló:', rec.slice(0,10));
await page.screenshot({ path: '/tmp/play_repro.png' });
await browser.close();
