import type { Page, Route } from '@playwright/test';

/**
 * Közös teszt-helperek: API mockolás és auth seedelés.
 * Smoke és vizuális tesztek egyaránt használják — backend nem szükséges.
 */

export const TEST_TOKEN = 'e2e-dummy-token';
export const TEST_USER = {
  username: 'e2e-admin',
  role: 'admin',
  fullName: 'E2E Admin',
  email: 'e2e@test.local',
};

function json(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

/**
 * Az összes API mock. FONTOS: a Playwright-nál a később regisztrált route
 * élvez elsőbbséget — a catch-all előbb jön, a specifikus mockok utána, és az
 * egymást átfedő mintáknál (pl. 'interactions**' vs 'interactions/grouped**')
 * a konkrétabb utolsó.
 */
export async function mockApi(page: Page) {
  await page.route('**/admin/api/**', (route: Route) => route.fulfill(json({})));
  await page.route('**/marketing/api/**', (route: Route) => route.fulfill(json({})));

  await page.route('**/admin/login', (route: Route) =>
    route.fulfill(json({ token: TEST_TOKEN, username: TEST_USER.username, role: 'admin', full_name: TEST_USER.fullName }))
  );
  await page.route('**/admin/api/interactions**', (route) => route.fulfill(json({ interactions: [] })));
  await page.route('**/admin/api/interactions/grouped**', (route) => route.fulfill(json({ sessions: [], total: 0 })));
  await page.route('**/admin/api/clients**', (route) => route.fulfill(json({ clients: [] })));
  await page.route('**/admin/api/kanban_columns**', (route) => route.fulfill(json({ columns: [] })));
  await page.route('**/admin/api/calendar**', (route) => route.fulfill(json({ events: [] })));
  await page.route('**/admin/api/campaigns**', (route) => route.fulfill(json([])));
  await page.route('**/admin/api/tasks**', (route) => route.fulfill(json([])));
  await page.route('**/admin/api/users**', (route) => route.fulfill(json({ data: [] })));
  await page.route('**/admin/api/members**', (route) => route.fulfill(json({ members: [] })));
  await page.route('**/admin/api/cartesia/voices**', (route) => route.fulfill(json([])));
  await page.route('**/admin/api/outbound_automations**', (route) => route.fulfill(json([])));
  await page.route('**/admin/api/analytics/alerts/details**', (route) => route.fulfill(json({ data: [] })));
  await page.route('**/admin/api/analytics/insights**', (route) => route.fulfill(json({ insights: [] })));
  await page.route('**/marketing/api/campaigns**', (route) => route.fulfill(json([])));
  await page.route('**/marketing/api/subscribers/count**', (route) => route.fulfill(json(0)));
  await page.route('**/marketing/api/subscribers**', (route) => route.fulfill(json([])));
  await page.route('**/marketing/api/content**', (route) => route.fulfill(json([])));
  await page.route('**/marketing/api/social/analytics**', (route) => route.fulfill(json({})));
}

/** Bejelentkezett állapot seedelése localStorage-ből, login flow kihagyása. */
export async function seedAuth(page: Page, extra: Record<string, string> = {}) {
  await page.addInitScript(
    ([token, user, consentKey, consentValue, extraEntries]) => {
      localStorage.setItem('thinkai_admin_token', token as string);
      localStorage.setItem('sb_admin_user', user as string);
      // cookie consent elfogadva, hogy a GDPR banner ne takarja az oldalt
      localStorage.setItem(consentKey as string, consentValue as string);
      for (const [k, v] of extraEntries as Array<[string, string]>) {
        localStorage.setItem(k, v);
      }
    },
    [
      TEST_TOKEN,
      JSON.stringify(TEST_USER),
      `eaisydesk_cookie_consent_${TEST_USER.username}`,
      JSON.stringify({ functional: true, version: '1.0', acceptedAt: new Date().toISOString() }),
      Object.entries(extra),
    ]
  );
}
