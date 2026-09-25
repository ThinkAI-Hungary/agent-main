import { chromium } from 'playwright';
import { BASE, envOf, login, log } from '/root/.zcode/tmp/pw/lib.mjs';
const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
try {
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  const api = await page.evaluate(async () => {
    const tok = localStorage.getItem('thinkai_admin_token');
    const r = await fetch('/admin/api/sessions?limit=300', { headers: { Authorization: 'Bearer ' + tok } });
    const j = await r.json().catch(() => null);
    const arr = Array.isArray(j) ? j : (j?.sessions || j?.items || []);
    return arr.map(s => ({ sid: (s.session_id||'').slice(-14), room: s.room_name, nInt: (s.interactions||[]).length, ints: (s.interactions||[]).map(i => ({id:i.id, appr:i.approval_status, stage:i.funnel_stage, t:(i.topic||'').slice(0,25)})) }));
  });
  log(JSON.stringify(api, null, 1));
} catch(e) { console.error(e); } finally { await browser.close(); }
