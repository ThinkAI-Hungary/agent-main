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

  // instrument currentTime setter
  await page.evaluate(() => {
    window.__seeks = [];
    const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    const origSet = desc.set;
    Object.defineProperty(document.querySelector('.ism-recording audio') ? HTMLMediaElement.prototype : HTMLMediaElement.prototype, 'currentTime', {
      get: desc.get,
      set(v) { window.__seeks.push(String(v)); return origSet.call(this, v); },
      configurable: true,
    });
  });
  const row = page.locator('tr', { hasText: 'Módosított időpont' }).first();
  await row.click({ force: true });
  await page.waitForTimeout(1500);
  // re-instrument (modal remount created new element but prototype patch persists)
  const det = page.locator('button', { hasText: /részlete/i }).first();
  if (await det.count()) { await det.click({ force: true }).catch(()=>{}); await page.waitForTimeout(800); }
  await page.evaluate(() => { window.__seeks = []; });
  // manual seek test
  const manual = await page.evaluate(() => {
    const a = document.querySelector('.ism-recording audio');
    if (!a) return 'no audio';
    a.pause();
    a.currentTime = 68.51;
    return new Promise(r => setTimeout(() => r({ after: a.currentTime, dur: a.duration, err: a.error && a.error.code, seekable: a.seekable.length }), 500));
  });
  log('MANUAL seek to 68.51 →', JSON.stringify(manual));
  await page.evaluate(() => { window.__seeks = []; });
  await page.locator('.ism-bubble-play').nth(4).click({ force: true });
  await page.waitForTimeout(400);
  const seeks = await page.evaluate(() => window.__seeks);
  const a2 = await page.evaluate(() => { const a = document.querySelector('.ism-recording audio'); return { cur: a.currentTime.toFixed(2), paused: a.paused }; });
  log('BUBBLE click assigned values:', JSON.stringify(seeks), '| state after:', JSON.stringify(a2));
  // also dump what the app thinks: check first 3 bubble play title attrs and count
  const bubInfo = await page.evaluate(() => Array.from(document.querySelectorAll('.ism-bubble-play')).slice(0,5).map(e => e.getAttribute('aria-label')));
  log('bubble buttons:', JSON.stringify(bubInfo));
} catch(e){ console.error('ERR', String(e).slice(0,400)); } finally { await browser.close(); }
