import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('[SCRAPER] Launching headless browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Track all network responses to find JSON API calls for presets
  page.on('response', async response => {
    const url = response.url();
    try {
      if (url.includes('placid.app') && (url.includes('api') || url.includes('presets') || url.includes('preset') || url.includes('templates'))) {
        const status = response.status();
        const text = await response.text();
        if (text.startsWith('{') || text.startsWith('[')) {
          console.log(`[NETWORK JSON] ${status} ${url}`);
          // Save it in src/data folder
          const safeName = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
          fs.writeFileSync(
            path.resolve(__dirname, `../data/raw_api_${Date.now()}_${safeName}.json`),
            JSON.stringify({ url, status, data: JSON.parse(text) }, null, 2)
          );
        }
      }
    } catch (e) {
      // Ignore reading errors
    }
  });

  try {
    console.log('[SCRAPER] Navigating to login page...');
    await page.goto('https://placid.app/login');

    // Handle cookie consent modal if it appears
    try {
      console.log('[SCRAPER] Checking for cookie consent banner...');
      const acceptBtnSelector = 'button:has-text("Accept all"), button:has-text("accept all"), [data-cy-modal-button-primary]';
      const cookieBannerExists = await page.locator(acceptBtnSelector).first().isVisible({ timeout: 5000 });
      if (cookieBannerExists) {
        console.log('[SCRAPER] Cookie banner detected. Clicking "Accept all"...');
        await page.click(acceptBtnSelector);
        await page.waitForTimeout(1000);
      }
    } catch (e: any) {
      console.log('[SCRAPER] Cookie banner check skipped/failed:', e.message);
    }

    console.log('[SCRAPER] Filling login details...');
    await page.fill('input[name="email"]', 'hello@thinkai.hu');
    await page.fill('input[name="password"]', 'Nincsapellata1\'');

    console.log('[SCRAPER] Submitting login...');
    // Target the regular login button specifically and avoid "Login with Google"
    const loginBtnSelector = 'button:has-text("Login"):not(:has-text("Google"))';
    await page.waitForSelector(loginBtnSelector, { timeout: 15000 });
    await page.click(loginBtnSelector);

    console.log('[SCRAPER] Waiting for dashboard/redirect...');
    await page.waitForURL('**/app/**', { timeout: 20000 });
    console.log('[SCRAPER] Login URL matched. Current URL:', page.url());

    console.log('[SCRAPER] Navigating directly to templates page...');
    await page.goto('https://placid.app/app/projects/lsmugjlujxtkrk9grvwg1v6enizfznio/templates', { waitUntil: 'domcontentloaded' });

    console.log('[SCRAPER] Waiting for "+ Create Template" button...');
    const createBtnSelector = 'button:has-text("Create Template"), .p-button:has-text("Create Template")';
    await page.waitForSelector(createBtnSelector, { timeout: 15000 });
    
    // Save cookies for Firecrawl
    const cookies = await context.cookies();
    fs.writeFileSync(
      path.resolve(__dirname, '../data/placid_cookies.json'),
      JSON.stringify(cookies, null, 2)
    );
    console.log('[SCRAPER] Saved cookies to src/data/placid_cookies.json');

    console.log('[SCRAPER] Clicking "+ Create Template" button...');
    await page.click(createBtnSelector);

    console.log('[SCRAPER] Waiting for Presets dialog to load...');
    await page.waitForSelector('.preset-dialog__close, [class*="preset-dialog"]', { timeout: 15000 });
    await page.waitForTimeout(3000);

    // Let's dump the state from Vue/Inertia
    console.log('[SCRAPER] Attempting to extract presets from client-side page state...');
    const pageState = await page.evaluate(() => {
      const appEl = document.getElementById('app');
      if (appEl && appEl.dataset.page) {
        try {
          return JSON.parse(appEl.dataset.page);
        } catch (e) {
          return { error: 'Failed to parse data-page' };
        }
      }
      return { error: 'No app element or data-page found' };
    });

    fs.writeFileSync(
      path.resolve(__dirname, '../data/inertia_page_state.json'),
      JSON.stringify(pageState, null, 2)
    );
    console.log('[SCRAPER] Saved Inertia page state to src/data/inertia_page_state.json');

    // Click through each preset category to force lazy loading if any
    console.log('[SCRAPER] Clicking through sizes/tags to trigger network loads...');
    
    const tabTexts = ['Feed Square', 'Open Graph', 'Pinterest', 'Story', 'Twitter Card', 'App', 'Article', 'Course', 'Document', 'E-Commerce', 'Event', 'Mockup', 'Podcast', 'Quote'];
    for (const text of tabTexts) {
      try {
        console.log(`[SCRAPER] Clicking category button with text "${text}"...`);
        const selector = `text="${text}"`;
        await page.click(selector);
        await page.waitForTimeout(1500);
      } catch (e: any) {
        console.log(`[SCRAPER] Category "${text}" click skipped or failed: ${e.message}`);
      }
    }

    console.log('[SCRAPER] Completed clicking categories. Saving final DOM...');
    const finalDom = await page.content();
    fs.writeFileSync(path.resolve(__dirname, '../data/preset_dialog_clicked_dom.html'), finalDom);

  } catch (err: any) {
    console.error('[SCRAPER] Error occurred during execution:', err.message);
    try {
      const errorScreenshotPath = path.resolve(__dirname, '../data/login_error.png');
      await page.screenshot({ path: errorScreenshotPath });
      console.log('[SCRAPER] Saved error screenshot to:', errorScreenshotPath);
    } catch (e: any) {
      console.log('[SCRAPER] Failed to save error screenshot:', e.message);
    }
  } finally {
    await browser.close();
    console.log('[SCRAPER] Browser closed.');
  }
}

main();
