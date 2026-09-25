import { chromium } from 'playwright';
import { BASE, envOf, login, dismissCookies, log } from './lib.mjs';

const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

try {
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  log('URL after login:', page.url());
  await page.screenshot({ path: '/root/.zcode/tmp/pw/01_after_login.png' });

  // API-level check while authenticated: does the interactions endpoint leak non_patient/spam rows?
  const apiRes = await page.evaluate(async () => {
    const r = await fetch('/admin/api/interactions?limit=300', { headers: { Authorization: 'Bearer ' + localStorage.getItem('admin_token') || '' } });
    const txt = await r.text();
    let body; try { body = JSON.parse(txt); } catch { body = txt.slice(0, 200); }
    return { status: r.status, keys: Array.isArray(body) ? null : Object.keys(body), isArr: Array.isArray(body), body };
  });
  const rows = Array.isArray(apiRes.body) ? apiRes.body : (apiRes.body?.interactions || apiRes.body?.items || []);
  const bad = rows.filter(r => r.funnel_stage === 'non_patient' || r.funnel_stage === 'spam');
  log('API /admin/api/interactions status=', apiRes.status, 'rows=', rows.length, 'non_patient_or_spam=', bad.length);
  const verifyInApi = rows.filter(r => (r.topic || '').includes('[VERIFY]')).map(r => r.id + ':' + r.topic + ':' + r.funnel_stage);
  log('VERIFY rows visible in interactions API:', JSON.stringify(verifyInApi));

  // Dashboard
  await page.goto(BASE + '/admin/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await dismissCookies(page);
  await page.screenshot({ path: '/root/.zcode/tmp/pw/02_dashboard_light.png', fullPage: true });

  // Section headings + counts
  const sections = await page.evaluate(() => {
    const h3s = Array.from(document.querySelectorAll('h3'));
    return h3s.map(h => ({ text: h.textContent.trim().replace(/\s+/g, ' ') }));
  });
  log('H3 headings:', JSON.stringify(sections));

  // KPI cards: find spans containing section names at card level
  const kpi = await page.evaluate(() => {
    const want = ['Sürgős teendő', 'Nyitott teendő', 'Ma elvégzett'];
    const out = [];
    const walker = document.querySelectorAll('div, span');
    walker.forEach(el => {
      const t = (el.textContent || '').trim();
      // find the big number + label pair: parent with number child then label
      for (const w of want) {
        if (t === w) {
          const card = el.closest('div[class], div');
          let p = el.parentElement; let num = null; let svg = null; let bg = null;
          for (let up = 0; up < 4 && p; up++) {
            const cand = Array.from(p.children).map(c => c.textContent.trim()).find(x => /^\d+$/.test(x));
            if (cand) { num = cand; break; }
            p = p.parentElement;
          }
          const cardRoot = el.closest('div');
          let root = cardRoot; for (let up = 0; up < 5 && root; up++) { if (/^\d+$/.test((root.textContent || '').trim().split(/\s+/)[0] || '')) break; root = root.parentElement; }
          if (root) {
            const svgEl = root.querySelector('svg');
            svg = svgEl ? svgEl.outerHTML.slice(0, 220) : null;
            const styled = root.querySelector('span[style*="background"], span[style*="rgb"]');
            bg = styled ? styled.getAttribute('style') : null;
          }
          out.push({ label: w, number: num, svg, bg });
        }
      }
    });
    return out;
  });
  log('KPI cards:', JSON.stringify(kpi, null, 1));

  // Find sections and their rows: locate h3, then its section container, then rows
  const secData = await page.evaluate(() => {
    const res = {};
    const h3s = Array.from(document.querySelectorAll('h3'));
    for (const h of h3s) {
      const name = h.textContent.trim().replace(/\s+/g, ' ');
      // walk up to a container that holds table rows
      let cont = h.parentElement; let rows = [];
      for (let up = 0; up < 6 && cont; up++) {
        rows = Array.from(cont.querySelectorAll('table tbody tr, [class*="row"]')).filter(r => r.textContent.trim());
        if (rows.length) break;
        cont = cont.parentElement;
      }
      res[name] = rows.slice(0, 12).map(r => (r.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 150));
    }
    return res;
  });
  for (const [k, v] of Object.entries(secData)) log(`SECTION [${k}] rows=${v.length}\n   ${v.join('\n   ')}`);

  // Times for sort check: extract from the section rows
  const sortProbe = await page.evaluate(() => {
    const res = {};
    const h3s = Array.from(document.querySelectorAll('h3'));
    for (const h of h3s) {
      const name = h.textContent.trim().replace(/\s+/g, ' ');
      let cont = h.parentElement; let rows = [];
      for (let up = 0; up < 6 && cont; up++) {
        rows = Array.from(cont.querySelectorAll('table tbody tr')).filter(r => r.textContent.trim());
        if (rows.length) break;
        cont = cont.parentElement;
      }
      // first cell is often the date/time
      res[name] = rows.slice(0, 12).map(r => {
        const cells = r.querySelectorAll('td');
        return cells[0] ? cells[0].textContent.trim().replace(/\s+/g, ' ') : (r.textContent.trim().slice(0, 25));
      });
    }
    return res;
  });
  log('SORT probe (first cell per row):', JSON.stringify(sortProbe, null, 1));

  // Dark mode
  const themeBtn = page.locator('.sidebar-theme-toggle').first();
  if (await themeBtn.count()) {
    await themeBtn.click({ force: true });
    await page.waitForTimeout(1200);
    await dismissCookies(page);
    await page.screenshot({ path: '/root/.zcode/tmp/pw/03_dashboard_dark.png', fullPage: true });
    const htmlClass = await page.evaluate(() => document.documentElement.className + ' | body:' + document.body.className);
    log('After theme toggle, html/body class:', htmlClass);
    // readability check: text color vs bg of "Ma elvégzett" heading
    const col = await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('h3')).find(x => x.textContent.includes('Ma elvégzett'));
      if (!h) return null;
      const cs = getComputedStyle(h);
      let bgc = 'transparent'; let el = h;
      while (el && bgc === 'transparent') { bgc = getComputedStyle(el).backgroundColor; el = el.parentElement; }
      return { color: cs.color, bg: bgc };
    });
    log('Dark-mode Ma elvégzett heading colors:', JSON.stringify(col));
    // toggle back to light
    await themeBtn.click({ force: true });
    await page.waitForTimeout(600);
  } else {
    log('NO .sidebar-theme-toggle found');
  }

  // Save storage state for subsequent scripts
  await ctx.storageState({ path: '/root/.zcode/tmp/pw/state_admin.json' });
  log('STATE saved');
} catch (e) {
  console.error('ERROR:', e);
  await page.screenshot({ path: '/root/.zcode/tmp/pw/err_dash.png', fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}
