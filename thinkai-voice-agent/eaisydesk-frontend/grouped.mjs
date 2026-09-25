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
    const r = await fetch('/admin/api/interactions/grouped?limit=500', { headers: { Authorization: 'Bearer ' + tok } });
    const j = await r.json();
    const arr = j?.sessions || [];
    return arr.filter(s => (s.session_id||'').includes('36706369528')).map(s => ({
      sid: s.session_id.slice(-12), rec: s.recording_url || null, n: s.interaction_count,
      keys: Object.keys(s),
      repr: s.representative ? { id: s.representative.id, type: s.representative.type, turns: (s.representative.transcript_turns||[]).length } : (s.interactions ? s.interactions.map(i=>({id:i.id,turns:(i.transcript_turns||[]).length})) : 'no-repr-key'),
      tt_top: Array.isArray(s.transcript_turns) ? s.transcript_turns.length : (s.transcript_turns ? 'str' : null),
    }));
  });
  log(JSON.stringify(api, null, 1));
} catch(e){ console.error(String(e).slice(0,400)); } finally { await browser.close(); }
