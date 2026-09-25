import { chromium } from 'playwright';
import { BASE, envOf, login, log } from '/root/.zcode/tmp/pw/lib.mjs';
const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const state = (sel='.ism-recording audio') => page.evaluate((s)=>{ const a=document.querySelector(s); if(!a) return null; return {cur:+a.currentTime.toFixed(2), dur:+(+a.duration||0).toFixed(2), paused:a.paused, src:decodeURIComponent((a.currentSrc||'')).split('/sessions/')[1]?.split('?')[0] || null }; }, sel);
async function openAndExpand(rowText) {
  const row = page.locator('tr', { hasText: rowText }).first();
  await row.click({ force: true });
  await page.waitForTimeout(1600);
  // expand details if collapsed
  const det = page.locator('button', { hasText: /részlete/i }).first();
  if (await det.count()) { await det.click({ force: true }).catch(()=>{}); await page.waitForTimeout(900); }
  return {
    player: await page.locator('.ism-recording').count(),
    bubbles: await page.locator('.ism-chat-bubble').count(),
    playBtns: await page.locator('.ism-bubble-play').count(),
  };
}
async function closeModal() {
  // find close button candidates inside modal header
  for (const sel of ['button.ism-close', '.ism-header button', '.ism-card header button']) {
    const el = page.locator(sel).first();
    if (await el.count()) { await el.click({ force: true }).catch(()=>{}); await page.waitForTimeout(600); if (!(await page.locator('.ism-card').count())) return 'closed:' + sel; }
  }
  // generic: last button in first row of modal, or overlay click
  const overlay = page.locator('.ism-overlay, .ism-modal-overlay').first();
  if (await overlay.count()) { await overlay.click({ force: true }).catch(()=>{}); await page.waitForTimeout(500); if (!(await page.locator('.ism-card').count())) return 'closed:overlay'; }
  return 'STILL OPEN';
}
try {
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  let b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});
  await page.goto(BASE + '/admin/interactions', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});

  // ══ Call A: ReqaDdXiLNUR (981, 9 turns; starts 7.79,29.19,48.88,56.23,68.51,...) ══
  let info = await openAndExpand('Módosított időpont');
  log('CALL A (ReqaDdXiLNUR):', JSON.stringify(info), JSON.stringify(await state()));
  const btnsA = page.locator('.ism-bubble-play');
  await page.locator('.ism-recording-btn').first().click({ force: true }); // play→load
  await page.waitForTimeout(2000);
  await page.locator('.ism-recording-btn').first().click({ force: true }); // pause
  await page.waitForTimeout(400);
  for (const idx of [0, 4]) {
    await btnsA.nth(idx).click({ force: true });
    await page.waitForTimeout(350);
    const st = await state();
    const expected = idx === 0 ? 7.79 : 68.51;
    log(`A: bubble#${idx+1} → cur=${st?.cur} (expected ≈${expected}, paused=${st?.paused})`);
  }
  await page.screenshot({ path: '/root/.zcode/tmp/pw/17_callA_seek.png' });
  log('close A →', await closeModal());

  // ══ Call B: KzmNsRb39h9x (979, 15 turns; starts 12.16,14.16,38.57,...) ══
  info = await openAndExpand('Új időpont');
  log('CALL B (KzmNsRb39h9x):', JSON.stringify(info), JSON.stringify(await state()));
  const btnsB = page.locator('.ism-bubble-play');
  if (info.playBtns > 2) {
    await page.locator('.ism-recording-btn').first().click({ force: true });
    await page.waitForTimeout(2000);
    await page.locator('.ism-recording-btn').first().click({ force: true });
    await page.waitForTimeout(400);
    await btnsB.nth(2).click({ force: true });
    await page.waitForTimeout(350);
    const st = await state();
    log(`B: bubble#3 → cur=${st?.cur} (expected ≈38.57, paused=${st?.paused})`);
    await page.screenshot({ path: '/root/.zcode/tmp/pw/18_callB_seek.png' });
  }
  log('close B →', await closeModal());

  // ══ Regression: régi hívás turnusok nélkül (VERIFYOLD) ══
  const oldRow = page.locator('tr', { hasText: 'Régi Teszt' }).first();
  if (await oldRow.count()) {
    await oldRow.click({ force: true });
    await page.waitForTimeout(1600);
    const det = page.locator('button', { hasText: /részlete/i }).first();
    if (await det.count()) { await det.click({ force: true }).catch(()=>{}); await page.waitForTimeout(800); }
    const st = await state();
    const pb = await page.locator('.ism-bubble-play').count();
    const bub = await page.locator('.ism-chat-bubble').count();
    log('REGRESSION (old call, no turns): player=1?', (await page.locator('.ism-recording').count()) === 1, '| bubbles:', bub, '| bubble-play buttons (expected 0):', pb, '| audio:', JSON.stringify(st));
    await page.screenshot({ path: '/root/.zcode/tmp/pw/19_regression_old.png' });
    log('close →', await closeModal());
  } else {
    log('REGRESSION row not found on page');
  }
} catch(e){ console.error('ERR', String(e).slice(0,400)); await page.screenshot({path:'/root/.zcode/tmp/pw/err_seek3.png'}).catch(()=>{});} finally { await browser.close(); }
