import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';

export interface ScrapedData {
  title: string;
  description: string;
  favicon: string;
  text: string;
  colors: string[];
  images: string[];
}

export async function scrapeWebsite(targetUrl: string): Promise<ScrapedData> {
  const scraped: ScrapedData = {
    title: '',
    description: '',
    favicon: '',
    text: '',
    colors: [],
    images: [],
  };

  try {
    const baseUrl = new URL(targetUrl).origin;
    
    // Fetch HTML with browser-like user agent
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'hu,en-US;q=0.7,en;q=0.3',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);

    // 1. Title
    scraped.title = $('title').text().trim() || $('meta[property="og:title"]').attr('content')?.trim() || '';

    // 2. Description
    scraped.description = $('meta[name="description"]').attr('content')?.trim() || 
                           $('meta[property="og:description"]').attr('content')?.trim() || '';

    // 3. Favicon
    let faviconLink = $('link[rel="shortcut icon"]').attr('href') || 
                      $('link[rel="icon"]').attr('href') || 
                      $('link[rel="apple-touch-icon"]').attr('href') ||
                      '/favicon.ico';
    
    if (faviconLink) {
      scraped.favicon = resolveUrl(baseUrl, targetUrl, faviconLink);
    }

    // 4. Text extraction (Headings, Paragraphs, Lists)
    const textBlocks: string[] = [];
    $('h1, h2, h3, h4, h5, p, li').each((_, el) => {
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      if (txt && txt.length > 5 && textBlocks.indexOf(txt) === -1) {
        textBlocks.push(txt);
      }
    });
    scraped.text = textBlocks.slice(0, 100).join('\n'); // Limit context size

    // 5. Images (Find logo/brand images and og:images first)
    const imagesList: string[] = [];
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) {
        const resolved = resolveUrl(baseUrl, targetUrl, src);
        if (resolved && imagesList.indexOf(resolved) === -1) {
          imagesList.push(resolved);
        }
      }
    });
    
    const ogImg = $('meta[property="og:image"]').attr('content');
    if (ogImg) {
      const resolved = resolveUrl(baseUrl, targetUrl, ogImg);
      if (resolved && imagesList.indexOf(resolved) === -1) {
        imagesList.unshift(resolved); // Priority
      }
    }
    scraped.images = imagesList.slice(0, 25);

    // 6. Styles & Color hex extraction
    const cssHexRegex = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})\b/g;
    const foundColors = new Set<string>();

    // Scan inline styles
    $('[style]').each((_, el) => {
      const styleAttr = $(el).attr('style');
      if (styleAttr) {
        let match;
        while ((match = cssHexRegex.exec(styleAttr)) !== null) {
          foundColors.add(match[0].toUpperCase());
        }
      }
    });

    // Scan inline style sheets
    $('style').each((_, el) => {
      const styleContent = $(el).text();
      let match;
      while ((match = cssHexRegex.exec(styleContent)) !== null) {
        foundColors.add(match[0].toUpperCase());
      }
    });

    // Scan stylesheet files (attempting relative/absolute urls)
    const stylesheetUrls: string[] = [];
    $('link[rel="stylesheet"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        const resolved = resolveUrl(baseUrl, targetUrl, href);
        if (resolved) stylesheetUrls.push(resolved);
      }
    });

    // Try fetching stylesheets to extract hex colors (limit to first 3)
    for (const cssUrl of stylesheetUrls.slice(0, 3)) {
      try {
        const cssResponse = await axios.get(cssUrl, { timeout: 3000 });
        let match;
        while ((match = cssHexRegex.exec(cssResponse.data)) !== null) {
          foundColors.add(match[0].toUpperCase());
          if (foundColors.size > 30) break; // Limit
        }
      } catch (err) {
        // Suppress stylesheet fetch errors
      }
    }

    scraped.colors = Array.from(foundColors);

  } catch (error) {
    console.error('Error scraping URL:', targetUrl, error);
    // Return partial scraped info
    scraped.title = scraped.title || 'Nem sikerült elérni a weboldalt';
    scraped.text = scraped.text || 'Hiba történt az adatok kinyerése során.';
  }

  return scraped;
}

function resolveUrl(baseUrl: string, pageUrl: string, path: string): string {
  try {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    if (path.startsWith('//')) {
      return `https:${path}`;
    }
    if (path.startsWith('/')) {
      return `${baseUrl}${path}`;
    }
    // Relative path resolve
    const absolute = new URL(path, pageUrl).href;
    return absolute;
  } catch (e) {
    return '';
  }
}
