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
  await page.waitForSelector('table tbody tr', { timeout: 20000 }).catch(()=>log('no table rows'));
  await page.waitForTimeout(3000);
  b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});
  log('row count:', await page.locator('table tbody tr').count());
  const texts = await page.evaluate(() => Array.from(document.querySelectorAll('table tbody tr')).slice(0,10).map(r=>r.textContent.trim().replace(/\s+/g,' ').slice(0,60)));
  log('rows:', JSON.stringify(texts, null, 1));
  const row = page.locator('table tbody tr', { hasText: 'Módosított' }).first();
  log('target row found:', await row.count());
  await row.click({ force: true });
  await page.waitForTimeout(1500);
  const det = page.locator('button', { hasText: /részlete/i }).first();
  if (await det.count()) { await det.click({ force: true }).catch(()=>{}); await page.waitForTimeout(800); }
  const buffered = await page.evaluate(async () => {
    const a = document.querySelector('.ism-recording audio');
    if (!a) return 'no audio';
    a.muted = true;
    try { await a.play(); } catch(e) { return 'play fail ' + e.message; }
    const t0 = Date.now();
    while (Date.now() - t0 < 45000) {
      let end = 0;
      for (let i = 0; i < a.buffered.length; i++) end = Math.max(end, a.buffered.end(i));
      if (end >= a.duration - 0.5) break;
      await new Promise(r => setTimeout(r, 500));
    }
    a.pause(); a.muted = false;
    let end = 0; for (let i = 0; i < a.buffered.length; i++) end = Math.max(end, a.buffered.end(i));
    return { bufferedEnd: +end.toFixed(1), duration: +a.duration.toFixed(1) };
  });
  log('buffer state:', JSON.stringify(buffered));
  await page.locator('.ism-bubble-play').nth(4).click({ force: true });
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => { const a = document.querySelector('.ism-recording audio'); return { cur: +a.currentTime.toFixed(2), paused: a.paused }; });
  log('SEEK after full buffer: bubble#5 → cur=' + st.cur + ' (expected ≈68.51), paused=' + st.paused);
  await page.waitForTimeout(1500);
  log('1.5s later cur=' + (await page.evaluate(() => document.querySelector('.ism-recording audio').currentTime.toFixed(2))));
} catch(e){ console.error('ERR', String(e).slice(0,300)); } finally { await browser.close(); }
