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
  await page.waitForTimeout(4000);
  b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});
  const row = page.locator('tr', { hasText: 'Módosított időpont' }).first();
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
      for (let i = 0; i < a.buffered.length; i++) end = a.buffered.end(i);
      if (end >= a.duration - 0.5) break;
      await new Promise(r => setTimeout(r, 500));
    }
    a.pause(); a.muted = false;
    let end = 0; for (let i = 0; i < a.buffered.length; i++) end = a.buffered.end(i);
    return { bufferedEnd: +end.toFixed(1), duration: +a.duration.toFixed(1) };
  });
  log('buffer state:', JSON.stringify(buffered));

  // now click bubble #5 (expect 68.51)
  await page.locator('.ism-bubble-play').nth(4).click({ force: true });
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => { const a = document.querySelector('.ism-recording audio'); return { cur: +a.currentTime.toFixed(2), paused: a.paused }; });
  log('SEEK after full buffer: bubble#5 → cur=' + st.cur + ' (expected ≈68.51), paused=' + st.paused);
  await page.waitForTimeout(1500);
  const st2 = await page.evaluate(() => { const a = document.querySelector('.ism-recording audio'); return { cur: +a.currentTime.toFixed(2) }; });
  log('1.5s later cur=' + st2.cur + ' (should be ≈70)');
} catch(e){ console.error('ERR', String(e).slice(0,400)); } finally { await browser.close(); }
