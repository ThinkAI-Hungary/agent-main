import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Cookie {
  name: string;
  value: string;
}

interface Preset {
  title: string;
  id: number;
  width: number;
  height: number;
  cover: string;
  tags: string[];
}

async function scrapeAllPresets() {
  console.log('[SCRAPER] Starting presets layout scraper...');

  const outputDir = path.resolve(__dirname, '../data/presets');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`[SCRAPER] Created output directory: ${outputDir}`);
  }

  // 1. Load cookies
  const cookiesPath = path.resolve(__dirname, '../data/placid_cookies.json');
  if (!fs.existsSync(cookiesPath)) {
    throw new Error('Cookies file placid_cookies.json not found! Please run the scraper script first.');
  }
  const cookies: Cookie[] = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));

  // 2. Prepare headers
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const xsrfCookie = cookies.find(c => c.name === 'XSRF-TOKEN');
  const xsrfToken = xsrfCookie ? decodeURIComponent(xsrfCookie.value) : '';

  const client = axios.create({
    baseURL: 'https://placid.app',
    headers: {
      'Cookie': cookieString,
      'X-XSRF-TOKEN': xsrfToken,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://placid.app/app/projects/lsmugjlujxtkrk9grvwg1v6enizfznio/templates',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400
  });

  // 3. Load presets list
  const presetsListPath = path.resolve(__dirname, '../data/raw_api_1784135280861_https___placid_app_api_editor_form_request_type_preset_data.json');
  if (!fs.existsSync(presetsListPath)) {
    throw new Error('Presets list JSON not found in data folder.');
  }
  const rawPresetsData = JSON.parse(fs.readFileSync(presetsListPath, 'utf8'));
  const presets: Preset[] = rawPresetsData.data.presets;
  console.log(`[SCRAPER] Loaded list of ${presets.length} presets.`);

  // 4. Clean up any leftover created templates from previous runs if needed
  try {
    console.log('[SCRAPER] Fetching existing project templates list for cleanup...');
    const templatesPageResponse = await client.get('/app/projects/lsmugjlujxtkrk9grvwg1v6enizfznio/templates');
    const match = templatesPageResponse.data.match(/data-page="([^"]+)"/);
    if (match) {
      const decodedJson = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#039;/g, "'");
      const parsedData = JSON.parse(decodedJson);
      const existingTemplates = parsedData.props?.templates || [];
      console.log(`[SCRAPER] Found ${existingTemplates.length} templates in the project.`);
      
      // Clean up templates that are named after presets to avoid cluttering
      for (const t of existingTemplates) {
        const isPreset = presets.some(p => p.title === t.title);
        if (isPreset) {
          console.log(`[SCRAPER] Leftover preset template found: "${t.title}" (UUID: ${t.uuid}). Deleting...`);
          await client.delete(`/api/templates/${t.uuid}`);
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }
  } catch (e: any) {
    console.log('[SCRAPER] Cleanup failed or skipped:', e.message);
  }

  // 5. Loop through presets and scrape them
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < presets.length; i++) {
    const preset = presets[i];
    const targetFile = path.resolve(outputDir, `preset_${preset.id}.json`);

    if (fs.existsSync(targetFile)) {
      console.log(`[${i + 1}/${presets.length}] Skipping preset "${preset.title}" (ID: ${preset.id}) - already scraped.`);
      continue;
    }

    console.log(`\n[${i + 1}/${presets.length}] Scraping preset "${preset.title}" (ID: ${preset.id})...`);
    let templateUuid = '';

    try {
      // Step A: Create from preset
      const createResponse = await client.post(`/app/projects/lsmugjlujxtkrk9grvwg1v6enizfznio/templates/create-from-preset/${preset.id}`, {}, {
        headers: { 'Accept': 'application/json, text/plain, */*' }
      });

      const redirectUrl = createResponse.headers['location'] || createResponse.data?.url;
      if (redirectUrl) {
        const match = redirectUrl.match(/\/app\/templates\/([a-zA-Z0-9]+)\/edit/);
        if (match) {
          templateUuid = match[1];
        }
      }

      if (!templateUuid && createResponse.data && typeof createResponse.data === 'object') {
        const pageProps = createResponse.data?.props;
        if (pageProps?.template?.uuid) {
          templateUuid = pageProps.template.uuid;
        }
      }

      if (!templateUuid) {
        throw new Error(`Could not extract template UUID for preset ID ${preset.id}`);
      }

      console.log(`[SCRAPER] Created template. UUID: ${templateUuid}. Fetching layout...`);

      // Step B: Fetch editor page schema
      const editResponse = await client.get(`/app/projects/lsmugjlujxtkrk9grvwg1v6enizfznio/templates-schema/${templateUuid}`);
      const html = editResponse.data;

      const matchPage = html.match(/data-page="([^"]+)"/);
      if (!matchPage) {
        throw new Error('Could not find data-page attribute in editor page HTML');
      }

      const decodedJson = matchPage[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#039;/g, "'");

      const parsedData = JSON.parse(decodedJson);
      const templateDetails = parsedData.props?.template?.template;

      if (!templateDetails) {
        throw new Error('Template schema details not found in props.template.template');
      }

      // Step C: Save to file
      const presetRecord = {
        preset_id: preset.id,
        title: preset.title,
        cover: preset.cover,
        tags: preset.tags,
        canvas: templateDetails.canvas,
        items: templateDetails.items,
        snippet: templateDetails.snippet
      };

      fs.writeFileSync(targetFile, JSON.stringify(presetRecord, null, 2));
      console.log(`[SCRAPER] Saved layout schema for "${preset.title}"`);
      successCount++;

      // Step D: Delete the template immediately to clean up
      console.log(`[SCRAPER] Cleaning up template ${templateUuid}...`);
      await client.delete(`/api/templates/${templateUuid}`);

    } catch (err: any) {
      console.error(`[SCRAPER] Error scraping preset ID ${preset.id} (${preset.title}):`, err.response?.data || err.message);
      errorCount++;

      // Attempt cleanup if templateUuid was generated
      if (templateUuid) {
        try {
          await client.delete(`/api/templates/${templateUuid}`);
        } catch (cleanupErr) {
          // ignore
        }
      }
    }

    // Wait a brief period to be respectful to the API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n[SCRAPER] Scraping process completed.`);
  console.log(`[SCRAPER] Successful: ${successCount}`);
  console.log(`[SCRAPER] Failed: ${errorCount}`);
}

scrapeAllPresets();
