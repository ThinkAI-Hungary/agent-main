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

async function testSinglePreset(presetId: number) {
  console.log(`[TEST] Testing preset ID ${presetId}...`);

  const cookiesPath = path.resolve(__dirname, '../data/placid_cookies.json');
  const cookies: Cookie[] = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
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

  const templateUuid = 'i1h1rnce9ugll';

  try {
    const schemaUrl = `/app/projects/lsmugjlujxtkrk9grvwg1v6enizfznio/templates-schema/${templateUuid}`;
    const response = await client.get(schemaUrl);
    
    const html = response.data;
    const match = html.match(/data-page="([^"]+)"/);
    if (match) {
      const decodedJson = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#039;/g, "'");

      const parsedData = JSON.parse(decodedJson);
      const props = parsedData.props || {};
      const template = props.template;
      
      if (template && template.template) {
        const innerTemplate = template.template;
        console.log('[TEST] Inner template keys:', Object.keys(innerTemplate));
        console.log('[TEST] Width:', innerTemplate.width);
        console.log('[TEST] Height:', innerTemplate.height);
        console.log('[TEST] Title:', innerTemplate.title);
        console.log('[TEST] Layers length:', innerTemplate.layers?.length);
        if (innerTemplate.layers && innerTemplate.layers.length > 0) {
          console.log('[TEST] First layer properties:', Object.keys(innerTemplate.layers[0]));
          console.log('[TEST] First layer details:', JSON.stringify(innerTemplate.layers[0], null, 2));
        }

        fs.writeFileSync(
          path.resolve(__dirname, `../data/test_schema_${presetId}.json`),
          JSON.stringify(innerTemplate, null, 2)
        );
        console.log(`[TEST] Saved clean template schema to src/data/test_schema_${presetId}.json`);
      } else {
        console.log('[TEST] Inner template object not found');
      }
    } else {
      console.log('[TEST] Could not find data-page in schema HTML');
    }

  } catch (err: any) {
    console.error(`[TEST] Error:`, err.response?.data || err.message);
  }
}

testSinglePreset(282);
