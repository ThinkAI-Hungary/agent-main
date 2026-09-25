import { chromium } from 'playwright';
import { BASE, envOf, login, log } from '/root/.zcode/tmp/pw/lib.mjs';
const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
try {
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  const probes = await page.evaluate(async () => {
    const tok = localStorage.getItem('thinkai_admin_token');
    const H = { Authorization: 'Bearer ' + tok };
    const out = {};
    const r1 = await fetch('/admin/api/sessions?limit=300', { headers: H });
    const j1 = await r1.json();
    const arr1 = Array.isArray(j1) ? j1 : (j1?.sessions || []);
    const s1 = arr1.find(s => (s.session_id||'').includes('ReqaDdXiLNUR'));
    out.sessionsEndpoint = s1 ? { keys: Object.keys(s1), recording_url: s1.recording_url ?? '(missing)' } : 'session not found';
    return out;
  });
  log('sessions endpoint:', JSON.stringify(probes, null, 1));
} catch(e){ console.error(String(e).slice(0,300)); } finally { await browser.close(); }
