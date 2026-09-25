import { chromium } from 'playwright';
import { BASE, envOf, login, log } from '/root/.zcode/tmp/pw/lib.mjs';
const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const state = (sel='.ism-recording audio') => page.evaluate((s)=>{ const a=document.querySelector(s); if(!a) return null; return {cur:+a.currentTime.toFixed(2), dur:+(+a.duration||0).toFixed(2), paused:a.paused, src:decodeURIComponent((a.currentSrc||'')).split('/sessions/')[1]?.split('?')[0] || null }; }, sel);
try {
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  let b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});
  await page.goto(BASE + '/admin/interactions', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});

  // Open the Módosított időpont row (session ReqaDdXiLNUR → interaction 981, 9 turns)
  const row = page.locator('tr', { hasText: 'Módosított időpont' }).first();
  await row.click({ force: true });
  await page.waitForTimeout(1800);
  log('modal count:', await page.locator('.ism-card').count());
  const st0 = await state();
  log('audio initial:', JSON.stringify(st0));
  // Start playback to load audio, then pause
  await page.locator('.ism-recording-btn').first().click({ force: true });
  await page.waitForTimeout(2000);
  await page.locator('.ism-recording-btn').first().click({ force: true }); // pause
  await page.waitForTimeout(400);
  log('after play+pause:', JSON.stringify(await state()));

  // bubble texts
  const bubbles = await page.evaluate(() => Array.from(document.querySelectorAll('.ism-chat-bubble')).slice(0,9).map((el,i)=>i+': '+el.textContent.trim().slice(0,40).replace(/\s+/g,' ')));
  log('bubbles:', JSON.stringify(bubbles, null, 1));

  // Click 5th bubble-play (expected start_s = 68.51 for 981), pause playback first
  const btns = page.locator('.ism-bubble-play');
  log('bubble-play count:', await btns.count());
  await btns.nth(4).click({ force: true });
  await page.waitForTimeout(300);
  const st1 = await state();
  log('immediately after bubble#5 click:', JSON.stringify(st1));
  log('EXPECTED 68.51 →', 'delta', st1 ? (st1.cur - 68.51).toFixed(2) : 'n/a');
  await page.waitForTimeout(2000);
  log('2s later (should advance from ~68.5):', JSON.stringify(await state()));

  // Now close modal via X / close button and verify it actually closes
  const closeSel = ['.ism-close', '.ism-card-close', 'button[aria-label*="zár"]', '.ism-overlay'];
  let closed = false;
  for (const sel of closeSel) {
    const el = page.locator(sel).first();
    if (await el.count()) { await el.click({ force: true }).catch(()=>{}); await page.waitForTimeout(600); if (!(await page.locator('.ism-card').count())) { log('closed via', sel); closed = true; break; } }
  }
  if (!closed) {
    // look for the top-right button inside modal header
    const x = page.locator('.ism-card button').first();
    await x.click({ force: true }).catch(()=>{});
    await page.waitForTimeout(600);
    log('closed via first modal button?', !(await page.locator('.ism-card').count()));
  }
  log('modal still open?', await page.locator('.ism-card').count());

  // Open the OTHER call (Új időpont → 979, 15 turns)
  const row2 = page.locator('tr', { hasText: 'Új időpont' }).first();
  await row2.click({ force: true });
  await page.waitForTimeout(1800);
  log('second modal audio:', JSON.stringify(await state()));
  const b2 = page.locator('.ism-bubble-play');
  log('second modal bubble-play count:', await b2.count());
  if (await b2.count() > 4) {
    await page.locator('.ism-recording-btn').first().click({ force: true }); // play to load
    await page.waitForTimeout(2000);
    await page.locator('.ism-recording-btn').first().click({ force: true }); // pause
    await page.waitForTimeout(300);
    await b2.nth(6).click({ force: true }); // expected start_s 75.26
    await page.waitForTimeout(300);
    const s2 = await state();
    log('after bubble#7 click (expect ~75.26):', JSON.stringify(s2));
  }
  await page.screenshot({ path: '/root/.zcode/tmp/pw/16_seek2.png' });
} catch(e){ console.error('ERR', String(e).slice(0,400)); await page.screenshot({path:'/root/.zcode/tmp/pw/err_seek2.png'}).catch(()=>{});} finally { await browser.close(); }
