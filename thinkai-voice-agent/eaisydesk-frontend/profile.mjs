import { chromium } from 'playwright';
import { BASE, envOf, login, log } from '/root/.zcode/tmp/pw/lib.mjs';
const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
try {
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  let b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});
  await page.goto(BASE + '/admin/clients', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({timeout:3000}).catch(()=>{});
  await page.screenshot({ path: '/root/.zcode/tmp/pw/20_clients.png' });
  // find Balázs row and click
  const row = page.locator('tr', { hasText: 'Balázs' }).first();
  log('Balázs row found:', await row.count());
  if (await row.count()) {
    await row.click({ force: true });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: '/root/.zcode/tmp/pw/21_profile.png' });
    const txt = await page.evaluate(() => document.body.innerText.slice(0, 4000));
    // look for diary/interaction entries
    log('profile shows "napló"?', /napló/i.test(txt), '| "Telefon"?', /Telefon/.test(txt), '| "Időpontfoglalás"?', /Időpontfoglalás/.test(txt));
    // try clicking the interaction entry mentioning phone/telefon call today
    const cand = page.locator('[class*="diary"] >> text=Telefon').first();
    const cand2 = page.locator(`text=Időpontfoglalás`).first();
    const cand3 = page.locator('tr, li, div[class*="entry"], button', { hasText: 'Telefonhívás' }).first();
    let opened = false;
    for (const c of [cand, cand2, cand3]) {
      if (await c.count()) {
        await c.click({ force: true }).catch(()=>{});
        await page.waitForTimeout(1800);
        const ism = await page.locator('.ism-card').count();
        const rec = await page.locator('.ism-recording').count();
        log('clicked candidate → modal?', ism, '| player?', rec);
        if (ism) {
          await page.screenshot({ path: '/root/.zcode/tmp/pw/22_profile_call_modal.png' });
          const st = await page.evaluate(() => { const a = document.querySelector('.ism-recording audio'); return a ? { dur: +( +a.duration).toFixed(2), cur: a.currentTime } : null; });
          log('profile popup audio:', JSON.stringify(st));
          const det = page.locator('button', { hasText: /részlete/i }).first();
          if (await det.count()) { await det.click({ force: true }).catch(()=>{}); await page.waitForTimeout(800); }
          log('profile popup bubbles:', await page.locator('.ism-chat-bubble').count(), '| play btns:', await page.locator('.ism-bubble-play').count());
          opened = true;
          break;
        }
      }
    }
    if (!opened) {
      const t = await page.evaluate(() => document.body.innerText.slice(0, 2500));
      log('NO MODAL. profile text head:', t.replace(/\n+/g, ' | ').slice(0, 800));
    }
  }
} catch(e){ console.error('ERR', String(e).slice(0,400)); await page.screenshot({path:'/root/.zcode/tmp/pw/err_profile.png', fullPage:true}).catch(()=>{});} finally { await browser.close(); }
