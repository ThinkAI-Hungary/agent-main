import { chromium } from 'playwright';
import { BASE, envOf, login, log } from '/root/.zcode/tmp/pw/lib.mjs';
const env = envOf();
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
try {
  await login(page, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  const p = await page.evaluate(async () => {
    const tok = localStorage.getItem('thinkai_admin_token');
    const H = { Authorization: 'Bearer ' + tok };
    const g = await (await fetch('/admin/api/interactions/grouped?limit=500', { headers: H })).json();
    const mine = (g?.sessions || []).filter(s => (s.session_id||'').includes('VERIFYDRAFT'));
    const flat = await (await fetch('/admin/api/interactions?limit=1500', { headers: H })).json();
    const mineFlat = (flat?.interactions || flat).filter?.(x => (x.topic||'').includes('[VERIFY]')) || [];
    return { grouped: mine.map(s => ({ sid: s.session_id, repr: s.representative ? { id: s.representative.id, appr: s.representative.approval_status, draft: !!s.representative.ai_draft_response } : null, n: s.interaction_count, statusz: s.session_statusz })), flatVerify: mineFlat.map(x => ({ id: x.id, topic: x.topic?.slice(0,30), appr: x.approval_status })) };
  });
  log(JSON.stringify(p, null, 1));
} catch(e){ console.error(String(e).slice(0,300)); } finally { await browser.close(); }
