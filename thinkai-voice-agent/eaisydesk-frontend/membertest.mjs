import { chromium } from 'playwright';
import { BASE, log } from '/root/.zcode/tmp/pw/lib.mjs';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
try {
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-email', { timeout: 20000 });
  let b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({ timeout: 3000 }).catch(()=>{});
  await page.fill('#login-email', 'member_test@thinkai.hu');
  await page.fill('#login-password', 'VerifyTemp2026!');
  await page.click('.login-btn');
  await page.waitForTimeout(3500);
  log('URL after member login:', page.url());
  b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({ timeout: 3000 }).catch(()=>{});
  await page.screenshot({ path: '/root/.zcode/tmp/pw/40_member_after_login.png' });
  // role check
  const role = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('thinkai_admin_user') || localStorage.getItem('thinkai_user') || '{}').role } catch { return '?' } });
  log('stored role:', role);
  // member landing should be /admin/dashboard (not analytics)
  const h3s = await page.evaluate(() => Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim().replace(/\s+/g, ' ')));
  log('H3 on landing:', JSON.stringify(h3s));
  // try opening admin-only page: analytics
  await page.goto(BASE + '/admin/analytics', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  log('member → /admin/analytics lands at:', page.url());
  // interactions page as member
  await page.goto(BASE + '/admin/interactions', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  b = page.locator('.cookie-btn-accept-all'); if (await b.count()) await b.first().click({ timeout: 3000 }).catch(()=>{});
  log('member → /admin/interactions url:', page.url(), '| rows:', await page.locator('table tbody tr').count());
  // back to dashboard, light screenshot with data
  await page.goto(BASE + '/admin/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const h = Array.from(document.querySelectorAll('h3')).find(x => x.textContent.includes('Nyitott'));
    return h && /[^0]$/.test(h.textContent.trim());
  }, { timeout: 20000 }).catch(() => log('member dashboard data did not load'));
  const memH3 = await page.evaluate(() => Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim().replace(/\s+/g, ' ')));
  log('MEMBER dashboard H3:', JSON.stringify(memH3));
  // KPI colors check (green check, yellow open icon)
  const kpiCols = await page.evaluate(() => {
    const out = [];
    const labels = ['Sürgős teendő', 'Nyitott teendő', 'Ma elvégzett'];
    for (const lab of labels) {
      const span = Array.from(document.querySelectorAll('span')).find(x => x.textContent.trim() === lab);
      if (!span) { out.push({ lab, found: false }); continue; }
      let p = span.parentElement; let iconSpan = null;
      for (let up = 0; up < 4 && p; up++) {
        iconSpan = Array.from(p.children).find(c => c.querySelector('svg') && (c.getAttribute('style') || '').includes('background'));
        if (iconSpan) break;
        p = p.parentElement;
      }
      out.push({ lab, found: true, iconStyle: iconSpan ? iconSpan.getAttribute('style') : null, hasSvg: !!(iconSpan && iconSpan.querySelector('svg')) });
    }
    return out;
  });
  log('MEMBER KPI icons:', JSON.stringify(kpiCols, null, 1));
  await page.screenshot({ path: '/root/.zcode/tmp/pw/41_member_dashboard.png', fullPage: true });
} catch(e){ console.error('ERR', String(e).slice(0,500)); await page.screenshot({path:'/root/.zcode/tmp/pw/err_member.png'}).catch(()=>{});} finally { await browser.close(); }
