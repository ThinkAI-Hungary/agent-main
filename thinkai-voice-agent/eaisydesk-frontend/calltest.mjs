import { chromium } from 'playwright';
import { BASE, envOf, login, log } from './lib.mjs';

const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

async function acceptCookies(p) {
  const btn = p.locator('.cookie-btn-accept-all');
  if (await btn.count()) await btn.first().click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(300);
}

function audioState(sel = '.ism-recording audio') {
  return page.evaluate((s) => {
    const a = document.querySelector(s);
    if (!a) return null;
    return { currentTime: +a.currentTime.toFixed(2), duration: +(+a.duration || 0).toFixed(2), paused: a.paused, readyState: a.readyState, src: (a.currentSrc || a.src || '').split('/').slice(-1)[0].slice(0, 40) };
  }, sel);
}

async function openRowModal(p, rowText) {
  const row = p.locator('tr', { hasText: rowText }).first();
  if (!(await row.count())) { log('ROW NOT FOUND:', rowText); return false; }
  await row.click({ force: true });
  await p.waitForTimeout(1500);
  return (await p.locator('.ism-card').count()) > 0;
}

try {
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  await acceptCookies(page);
  await page.goto(BASE + '/admin/interactions', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await acceptCookies(page);
  await page.screenshot({ path: '/root/.zcode/tmp/pw/10_interactions_rows.png' });

  // ── Open the 07:45 Balázs call (session ...KzmNsRb39h9x) ──
  let opened = await openRowModal(page, 'Balázs');
  log('modal open (first Balázs row):', opened);
  if (!opened) {
    // fallback: click row containing 'Új időpont' + Telefon
    opened = await openRowModal(page, 'Új időpont');
    log('modal open (fallback):', opened);
  }
  const hasPlayer = await page.locator('.ism-recording').count();
  log('PLAYER (.ism-recording) present:', hasPlayer);
  await page.screenshot({ path: '/root/.zcode/tmp/pw/11_call_modal.png', fullPage: false });

  if (hasPlayer) {
    log('audio BEFORE play:', JSON.stringify(await audioState()));
    await page.locator('.ism-recording-btn').first().click({ force: true });
    await page.waitForTimeout(1500);
    log('audio after play 1.5s:', JSON.stringify(await audioState()));
    await page.waitForTimeout(3000);
    log('audio after +3s more:', JSON.stringify(await audioState()));
    await page.screenshot({ path: '/root/.zcode/tmp/pw/12_call_modal_playing.png' });
  }

  // ── Expand details (bubbles) if needed ──
  const detailsBtn = page.locator('button', { hasText: /részlete/i }).first();
  if ((await detailsBtn.count()) && !(await page.locator('.ism-chat-bubble').count())) {
    await detailsBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1000);
  }
  let bubbles = await page.locator('.ism-chat-bubble').count();
  let playBtns = await page.locator('.ism-bubble-play').count();
  log('bubbles:', bubbles, '| bubble-play buttons:', playBtns);
  if (!bubbles) {
    // try clicking any element mentioning 'részletek' or scroll inside modal
    await page.screenshot({ path: '/root/.zcode/tmp/pw/13_modal_no_bubbles.png', fullPage: true });
  } else {
    const before = await audioState();
    // click the 3rd bubble-play (user turn) or the first
    const idx = playBtns > 2 ? 2 : 0;
    await page.locator('.ism-bubble-play').nth(idx).click({ force: true });
    await page.waitForTimeout(1200);
    const after = await audioState();
    log('SEEK before:', JSON.stringify(before), '→ after:', JSON.stringify(after));
    log('SEEK WORKS:', !!(before && after && Math.abs(after.currentTime - before.currentTime) > 0.5));
    await page.screenshot({ path: '/root/.zcode/tmp/pw/14_after_seek.png' });
  }

  // Close modal
  const closeBtn = page.locator('.ism-card button').first();
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(800);

  // ── Second call (07:48 Módosított időpont) ──
  const row2 = page.locator('tr', { hasText: 'Módosított időpont' }).first();
  if (await row2.count()) {
    await row2.click({ force: true });
    await page.waitForTimeout(1500);
    log('2nd call player present:', await page.locator('.ism-recording').count());
    await page.locator('.ism-recording-btn').first().click({ force: true }).catch(e => log('play err', String(e).slice(0, 80)));
    await page.waitForTimeout(1500);
    log('2nd call audio:', JSON.stringify(await audioState()));
    await page.screenshot({ path: '/root/.zcode/tmp/pw/15_second_call.png' });
    await page.keyboard.press('Escape').catch(() => {});
  } else {
    log('2nd call row not found');
  }
} catch (e) {
  console.error('ERROR:', String(e).slice(0, 500));
  await page.screenshot({ path: '/root/.zcode/tmp/pw/err_call.png', fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}
