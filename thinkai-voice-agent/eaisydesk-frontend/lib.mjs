import { readFileSync } from 'fs';

export const BASE = 'https://digideskadmin.molaire.hu';
export const TENANT = '419ca186-2764-4e2a-bca0-72bce3d0d215';

export function envOf(path = '/root/dobozos/thinkai-voice-agent/.env') {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

export async function dismissCookies(page) {
  try {
    const overlay = page.locator('.cookie-overlay');
    if (await overlay.count()) {
      const btns = overlay.locator('button');
      const n = await btns.count();
      const texts = [];
      for (let k = 0; k < n; k++) texts.push((await btns.nth(k).innerText().catch(() => '')).trim());
      console.log('COOKIE buttons:', JSON.stringify(texts));
      // prefer accept-all style buttons
      const accept = overlay.getByRole('button', { name: /elfogad|accept|rendben|ok|hozzájárul/i }).first();
      if (await accept.count()) await accept.click({ force: true }).catch(() => {});
      else if (n) await btns.first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
    }
  } catch (e) { console.log('cookie dismiss issue:', String(e).slice(0, 120)); }
}

export async function login(page, email, password) {
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-email', { timeout: 20000 }).catch(async () => {
    // already logged in?
  });
  if (await page.locator('#login-email').count()) {
    await dismissCookies(page);
    await page.fill('#login-email', email);
    await page.fill('#login-password', password);
    await page.click('.login-btn');
    await page.waitForTimeout(2500);
  }
  await dismissCookies(page);
}

export function log(...a) { console.log(...a); }
