import { chromium } from 'playwright';
import { BASE, envOf, login, log } from '/root/.zcode/tmp/pw/lib.mjs';
const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const state = () => page.evaluate(() => { const a = document.querySelector('.ism-recording audio'); return a ? { dur: +(+a.duration).toFixed(2), cur: +a.currentTime.toFixed(2), paused: a.paused, src: decodeURIComponent(a.currentSrc||'').split('/sessions/')[1]?.split('?')[0] || null } : null; });
try {
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  let b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});
  await page.goto(BASE + '/admin/clients', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});
  const row = page.locator('tr', { hasText: 'Balázs' }).first();
  await row.click({ force: true });
  await page.waitForTimeout(2200);
  // click the first Lezárt call row inside profile (07:48 Módosított időpont)
  const prow = page.locator('tr', { hasText: 'Módosított időpont' }).first();
  log('profile call row:', await prow.count());
  await prow.click({ force: true });
  await page.waitForTimeout(1800);
  const ism = await page.locator('.ism-card').count();
  log('modal from profile:', ism, '| player:', await page.locator('.ism-recording').count(), '| audio:', JSON.stringify(await state()));
  const det = page.locator('button', { hasText: /részlete/i }).first();
  if (await det.count()) { await det.click({ force: true }).catch(()=>{}); await page.waitForTimeout(900); }
  log('bubbles:', await page.locator('.ism-chat-bubble').count(), '| bubble-play:', await page.locator('.ism-bubble-play').count());
  // play a bit
  const pb = page.locator('.ism-recording-btn').first();
  if (await pb.count()) { await pb.click({ force: true }); await page.waitForTimeout(1500); log('after play:', JSON.stringify(await state())); await pb.click({ force: true }); }
  await page.screenshot({ path: '/root/.zcode/tmp/pw/23_profile_modal.png' });
} catch(e){ console.error('ERR', String(e).slice(0,400)); await page.screenshot({path:'/root/.zcode/tmp/pw/err_profile2.png'}).catch(()=>{});} finally { await browser.close(); }
