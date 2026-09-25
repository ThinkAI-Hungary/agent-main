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
    const r = await fetch('/admin/api/interactions?limit=100', { headers: { Authorization: 'Bearer ' + tok } });
    const j = await r.json();
    const rows = j?.interactions || j;
    return rows.filter(x => [979,981].includes(x.id)).map(x => ({ id: x.id, recording_url: x.recording_url ?? '(missing)', session_id: x.session_id }));
  });
  log('Interaction rows recording_url:', JSON.stringify(api, null, 1));
  // stream endpoint HEAD/GET check
  const stream = await page.evaluate(async () => {
    const tok = localStorage.getItem('thinkai_admin_token');
    const sid = 'call-_+36706369528_KzmNsRb39h9x';
    const r = await fetch(`/admin/api/sessions/${encodeURIComponent(sid)}/recording?token=${encodeURIComponent(tok)}`, { method: 'GET', headers: { Range: 'bytes=0-1023' } });
    return { status: r.status, type: r.headers.get('content-type'), len: r.headers.get('content-range') || r.headers.get('content-length'), acceptRanges: r.headers.get('accept-ranges') };
  });
  log('Stream probe:', JSON.stringify(stream));
} catch (e) { console.error(String(e).slice(0, 400)); } finally { await browser.close(); }
