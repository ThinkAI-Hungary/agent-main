import { chromium } from 'playwright';
import { BASE, envOf, login, log } from './lib.mjs';

const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

async function acceptCookies(p) {
  const btn = p.locator('.cookie-btn-accept-all');
  if (await btn.count()) { await btn.first().click({ timeout: 3000 }).catch(e => log('cookie click fail:', String(e).slice(0, 80))); await p.waitForTimeout(500); }
  log('cookie banner still visible?', await p.locator('.cookie-banner-wrap').count());
}

try {
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  await acceptCookies(page);

  // --- Authenticated API probe with correct token key ---
  const api = await page.evaluate(async () => {
    const tok = localStorage.getItem('thinkai_admin_token');
    const r = await fetch('/admin/api/interactions?limit=300', { headers: { Authorization: 'Bearer ' + tok } });
    const j = await r.json().catch(() => null);
    const rows = Array.isArray(j) ? j : (j?.interactions || j?.items || []);
    return { status: r.status, n: rows.length, stages: rows.reduce((m, x) => { const s = x.funnel_stage || '(null)'; m[s] = (m[s] || 0) + 1; return m; }, {}), verify: rows.filter(x => (x.topic || '').includes('[VERIFY]')).map(x => x.id + ':' + x.topic) };
  });
  log('INTERACTIONS API:', JSON.stringify(api));

  // sessions API (dashboard source) — spam rows should be skipped client-side
  const sessApi = await page.evaluate(async () => {
    const tok = localStorage.getItem('thinkai_admin_token');
    const r = await fetch('/admin/api/sessions?limit=300', { headers: { Authorization: 'Bearer ' + tok } });
    const j = await r.json().catch(() => null);
    const arr = Array.isArray(j) ? j : (j?.sessions || []);
    const testSess = arr.find(s => (s.session_id || '').includes('VERIFYTEST'));
    return { status: r.status, sessions: arr.length, testSession: testSess ? { id: testSess.session_id, inter: (testSess.interactions || []).map(i => ({ id: i.id, stage: i.funnel_stage, appr: i.approval_status, topic: i.topic })) } : null };
  });
  log('SESSIONS API:', JSON.stringify(sessApi, null, 1));

  // --- Interactions page (UI) ---
  await page.goto(BASE + '/admin/interactions', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await acceptCookies(page);
  await page.screenshot({ path: '/root/.zcode/tmp/pw/04_interactions.png', fullPage: false });
  const uiText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  log('INTERACTIONS PAGE mentions [VERIFY]?', uiText.includes('[VERIFY]'), '| mentions Szűrt feladó?', uiText.includes('Szűrt feladó'), '| mentions SPAM?', /spam/i.test(uiText));
  // count visible rows
  const rowCount = await page.evaluate(() => document.querySelectorAll('table tbody tr, [class*="interaction-row"]').length);
  log('Interactions UI row count (rough):', rowCount);

  // --- Dashboard dark mode ---
  await page.goto(BASE + '/admin/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await acceptCookies(page);
  await page.evaluate(() => { localStorage.setItem('thinkai_theme', 'dark'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await acceptCookies(page);
  const darkCls = await page.evaluate(() => 'html:' + document.documentElement.classList + ' body:' + document.body.classList);
  log('dark class state:', darkCls);
  await page.screenshot({ path: '/root/.zcode/tmp/pw/05_dashboard_dark.png', fullPage: true });
  const darkCol = await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll('h3')).find(x => x.textContent.includes('Ma elvégzett'));
    if (!h) return null;
    let bgc = 'transparent'; let el = h;
    while (el && (bgc === 'transparent' || bgc === 'rgba(0, 0, 0, 0)')) { bgc = getComputedStyle(el).backgroundColor; el = el.parentElement; }
    return { color: getComputedStyle(h).color, bg: bgc, text: h.textContent.trim() };
  });
  log('DARK Ma elvégzett heading:', JSON.stringify(darkCol));

  // toggle back
  const tbtn = page.locator('.sidebar-theme-toggle').first();
  if (await tbtn.count()) { await tbtn.click({ force: true }); await page.waitForTimeout(800); log('after toggle, class:', await page.evaluate(() => document.documentElement.className)); }
  await page.evaluate(() => { localStorage.setItem('thinkai_theme', 'light'); });

  await ctx.storageState({ path: '/root/.zcode/tmp/pw/state_admin.json' });
  log('DONE');
} catch (e) {
  console.error('ERROR:', e);
  await page.screenshot({ path: '/root/.zcode/tmp/pw/err2.png', fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}
