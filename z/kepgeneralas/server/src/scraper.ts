import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';

function normalizeHexColor(hex: string): string {
  let color = hex.toUpperCase();
  if (!color.startsWith('#')) {
    color = '#' + color;
  }
  if (color.length === 4) {
    const r = color.charAt(1);
    const g = color.charAt(2);
    const b = color.charAt(3);
    color = '#' + r + r + g + g + b + b;
  }
  return color;
}

export interface ScrapedLogo {
  url: string;
  width?: string;
  height?: string;
  location: 'Fejléc' | 'Lábléc' | 'Tartalom' | 'Favicon';
}

export interface ScrapedData {
  title: string;
  description: string;
  favicon: string;
  text: string;
  colors: string[];
  images: Array<{ src: string; alt: string }>;
  logos: ScrapedLogo[];
  h1s: string[];
  h2s: string[];
  h3s: string[];
  missingAltCount: number;
  totalImagesCount: number;
  internalLinksCount: number;
  externalLinksCount: number;
  hasRobots: boolean;
  hasSitemap: boolean;
  emails: string[];
  phones: string[];
  socials: Record<string, string>;
  schemaOrgData: any[];
}

const SOCIAL_PLATFORMS_30 = [
  'facebook.com', 'fb.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'youtu.be',
  'tiktok.com', 'twitter.com', 'x.com', 'pinterest.com', 'pinterest.hu', 'snapchat.com',
  'reddit.com', 'tumblr.com', 'flickr.com', 'vimeo.com', 'twitch.tv', 'discord.gg',
  'discord.com', 'telegram.org', 't.me', 'whatsapp.com', 'wa.me', 'messenger.com',
  'skype.com', 'threads.net', 'medium.com', 'github.com', 'behance.net', 'dribbble.com',
  'viber.com', 'line.me', 'wechat.com', 'weibo.com', 'quora.com', 'patreon.com',
  'soundcloud.com'
];

export async function scrapeWebsite(targetUrl: string, pageLimit: number = 10): Promise<ScrapedData> {
  const scraped: ScrapedData = {
    title: '',
    description: '',
    favicon: '',
    text: '',
    colors: [],
    images: [],
    logos: [],
    h1s: [],
    h2s: [],
    h3s: [],
    missingAltCount: 0,
    totalImagesCount: 0,
    internalLinksCount: 0,
    externalLinksCount: 0,
    hasRobots: false,
    hasSitemap: false,
    emails: [],
    phones: [],
    socials: {},
    schemaOrgData: [],
  };

  try {
    const parsedBase = new URL(targetUrl);
    const baseUrl = parsedBase.origin;
    const baseDomain = parsedBase.hostname.toLowerCase();

    const tier1 = ['kapcsolat', 'contact', 'elerhet', 'impressz', 'ceginfo', 'cégadat', 'legal', 'ugyfelszolgalat', 'ugyfel', 'szolgalat', 'segitseg', 'help'];
    const tier2 = ['rolunk', 'about', 'company', 'info', 'bolt', 'uzlet', 'üzlet', 'partner', 'bemutatkoz'];
    const tier3 = ['termek', 'szolgaltat', 'shop', 'store', 'termékek', 'szolgáltatások', 'kategoria', 'kategória'];

    function getUrlPriorityScore(url: string): number {
      const lower = url.toLowerCase();
      // Ignore search queries, page parameters, cart, login to keep crawls meaningful
      if (
        lower.includes('smartresult') || lower.includes('smart-result') ||
        lower.includes('search') || lower.includes('kereses') ||
        lower.includes('kosar') || lower.includes('cart') ||
        lower.includes('login') || lower.includes('fiok') ||
        lower.includes('account') || lower.includes('checkout') ||
        lower.includes('regiszt') || lower.includes('levelen-val') ||
        lower.includes('newsletter')
      ) {
        return 999;
      }
      if (tier1.some(kw => lower.includes(kw))) return 1;
      if (tier2.some(kw => lower.includes(kw))) return 2;
      if (tier3.some(kw => lower.includes(kw))) return 3;
      return 10;
    }

    const visitedUrls = new Set<string>();
    const urlsToVisit: string[] = [targetUrl];

    let crawledCount = 0;
    const combinedTexts: string[] = [];
    const colorCounts = new Map<string, number>();
    const foundImages: Array<{ src: string; alt: string }> = [];

    // Helper to resolve URLs
    function resolveUrlLocal(href: string, currentUrl: string): string {
      try {
        if (href.startsWith('http://') || href.startsWith('https://')) return href;
        if (href.startsWith('//')) return `https:${href}`;
        if (href.startsWith('/')) return `${baseUrl}${href}`;
        return new URL(href, currentUrl).href;
      } catch {
        return '';
      }
    }

    // Crawl loop
    while (urlsToVisit.length > 0 && crawledCount < pageLimit) {
      // Sort URLs to prioritize contacts/about/products first
      urlsToVisit.sort((a, b) => {
        return getUrlPriorityScore(a) - getUrlPriorityScore(b);
      });

      const currentUrl = urlsToVisit.shift()!;
      if (visitedUrls.has(currentUrl)) continue;
      visitedUrls.add(currentUrl);

      try {
        const response = await axios.get(currentUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'hu,en-US;q=0.7,en;q=0.3',
          },
          timeout: 6000,
        });

        if (response.status !== 200) continue;
        crawledCount++;

        const $ = cheerio.load(response.data);

        // Extract metadata from homepage only
        if (currentUrl === targetUrl) {
          scraped.title = $('title').text().trim() || $('meta[property="og:title"]').attr('content')?.trim() || '';
          scraped.description = $('meta[name="description"]').attr('content')?.trim() ||
            $('meta[property="og:description"]').attr('content')?.trim() || '';
          let faviconLink = $('link[rel="shortcut icon"]').attr('href') ||
            $('link[rel="icon"]').attr('href') ||
            $('link[rel="apple-touch-icon"]').attr('href') ||
            '/favicon.ico';
          scraped.favicon = resolveUrlLocal(faviconLink, currentUrl);
        }

        // Headings
        $('h1').each((_, el) => { const txt = $(el).text().replace(/\s+/g, ' ').trim(); if (txt && !scraped.h1s.includes(txt)) scraped.h1s.push(txt); });
        $('h2').each((_, el) => { const txt = $(el).text().replace(/\s+/g, ' ').trim(); if (txt && !scraped.h2s.includes(txt)) scraped.h2s.push(txt); });
        $('h3').each((_, el) => { const txt = $(el).text().replace(/\s+/g, ' ').trim(); if (txt && !scraped.h3s.includes(txt)) scraped.h3s.push(txt); });

        // Text content
        const pageTexts: string[] = [];
        $('h1, h2, h3, h4, h5, p, li, span, td').each((_, el) => {
          const txt = $(el).text().replace(/\s+/g, ' ').trim();
          if (txt && txt.length > 10 && !pageTexts.includes(txt)) {
            pageTexts.push(txt);
          }
        });
        combinedTexts.push(`--- PAGE: ${currentUrl} ---\n` + pageTexts.slice(0, 50).join('\n'));

        // Image extraction & alt auditing
        $('img').each((_, el) => {
          const src = $(el).attr('src');
          if (src) {
            const absSrc = resolveUrlLocal(src, currentUrl);
            const alt = $(el).attr('alt')?.trim() || '';
            if (absSrc && !foundImages.some(img => img.src === absSrc)) {
              foundImages.push({ src: absSrc, alt });
            }
          }
        });

        // Logo detection and extraction
        $('img').each((_, el) => {
          const src = $(el).attr('src');
          const alt = ($(el).attr('alt') || '').toLowerCase();
          const id = ($(el).attr('id') || '').toLowerCase();
          const className = ($(el).attr('class') || '').toLowerCase();

          if (src) {
            const srcLower = src.toLowerCase();
            const isLogo = srcLower.includes('logo') ||
              alt.includes('logo') ||
              alt.includes('logó') ||
              id.includes('logo') ||
              className.includes('logo');

            if (isLogo) {
              const resolved = resolveUrlLocal(src, currentUrl);
              if (resolved) {
                // Determine page location based on ancestors
                let location: 'Fejléc' | 'Lábléc' | 'Tartalom' | 'Favicon' = 'Tartalom';
                const hasHeaderAncestor = $(el).closest('header, nav, .header, .nav, #header, #nav').length > 0;
                const hasFooterAncestor = $(el).closest('footer, .footer, #footer').length > 0;
                if (hasHeaderAncestor) {
                  location = 'Fejléc';
                } else if (hasFooterAncestor) {
                  location = 'Lábléc';
                }

                // Extract width/height attributes
                const width = $(el).attr('width') || undefined;
                const height = $(el).attr('height') || undefined;

                if (!scraped.logos.some(l => l.url === resolved)) {
                  scraped.logos.push({
                    url: resolved,
                    width,
                    height,
                    location
                  });
                }
              }
            }
          }
        });

        $('link[rel*="icon"]').each((_, el) => {
          const href = $(el).attr('href');
          if (href) {
            const resolved = resolveUrlLocal(href, currentUrl);
            if (resolved) {
              const sizes = $(el).attr('sizes') || undefined;
              let width: string | undefined;
              let height: string | undefined;
              if (sizes && sizes.includes('x')) {
                const parts = sizes.split('x');
                width = parts[0] + 'px';
                height = parts[1] + 'px';
              }

              if (!scraped.logos.some(l => l.url === resolved)) {
                scraped.logos.push({
                  url: resolved,
                  width,
                  height,
                  location: 'Favicon'
                });
              }
            }
          }
        });

        // JSON-LD structured data
        $('script[type="application/ld+json"]').each((_, el) => {
          try {
            const parsed = JSON.parse($(el).text());
            if (parsed) scraped.schemaOrgData.push(parsed);
          } catch { }
        });

        // Links, emails, phone numbers, and socials extraction
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href')?.trim();
          if (!href) return;

          if (href.startsWith('mailto:')) {
            const mail = href.replace('mailto:', '').split('?')[0].trim();
            if (mail && !scraped.emails.includes(mail)) scraped.emails.push(mail);
          } else if (href.startsWith('tel:')) {
            const phone = href.replace('tel:', '').trim();
            if (phone && !scraped.phones.includes(phone)) scraped.phones.push(phone);
          } else if (!href.startsWith('#') && !href.startsWith('javascript:')) {
            const resolved = resolveUrlLocal(href, currentUrl);
            if (resolved) {
              try {
                const parsedResolved = new URL(resolved);
                const resolvedHost = parsedResolved.hostname.toLowerCase();

                // Social platform matching
                const platform = SOCIAL_PLATFORMS_30.find(p => resolvedHost.includes(p));
                if (platform) {
                  let key = platform.split('.')[0];
                  if (key === 'youtu') key = 'youtube';
                  else if (key === 'fb') key = 'facebook';
                  else if (key === 't') key = 'telegram';
                  else if (key === 'wa') key = 'whatsapp';

                  if (!scraped.socials[key]) {
                    scraped.socials[key] = resolved;
                  }
                } else if (resolvedHost.includes(baseDomain)) {
                  // Internal link to visit
                  scraped.internalLinksCount++;
                  if (!visitedUrls.has(resolved) && !urlsToVisit.includes(resolved)) {
                    urlsToVisit.push(resolved);
                  }
                } else {
                  scraped.externalLinksCount++;
                }
              } catch { }
            }
          }
        });

        // Styles & color extraction from style/link tags
        const cssHexRegex = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})\b/g;
        $('[style]').each((_, el) => {
          const styleAttr = $(el).attr('style');
          if (styleAttr) {
            let match;
            while ((match = cssHexRegex.exec(styleAttr)) !== null) {
              const normalized = normalizeHexColor(match[0]);
              colorCounts.set(normalized, (colorCounts.get(normalized) || 0) + 1);
            }
          }
        });

        $('style').each((_, el) => {
          const styleContent = $(el).text();
          let match;
          while ((match = cssHexRegex.exec(styleContent)) !== null) {
            const normalized = normalizeHexColor(match[0]);
            colorCounts.set(normalized, (colorCounts.get(normalized) || 0) + 1);
          }
        });

        // Stylesheets (homepage only to save time)
        if (currentUrl === targetUrl) {
          const stylesheetUrls: string[] = [];
          $('link[rel="stylesheet"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href) {
              const resolved = resolveUrlLocal(href, currentUrl);
              if (resolved) stylesheetUrls.push(resolved);
            }
          });

          for (const cssUrl of stylesheetUrls.slice(0, 3)) {
            try {
              const cssResponse = await axios.get(cssUrl, { timeout: 3000 });
              let match;
              while ((match = cssHexRegex.exec(cssResponse.data)) !== null) {
                const normalized = normalizeHexColor(match[0]);
                colorCounts.set(normalized, (colorCounts.get(normalized) || 0) + 1);
                if (colorCounts.size > 200) break;
              }
            } catch { }
          }
        }

      } catch (err) {
        console.error(`Error crawling page: ${currentUrl}`, err);
      }
    }

    // Fallback regex email / phone scan from combined text
    const textBlob = combinedTexts.join('\n');
    if (scraped.emails.length === 0) {
      const regexEmails = textBlob.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      regexEmails.forEach(e => { if (!scraped.emails.includes(e)) scraped.emails.push(e); });
    }
    if (scraped.phones.length === 0) {
      const regexPhones = textBlob.match(/\+?[0-9\s-]{9,15}/g) || [];
      regexPhones.forEach(p => {
        const cleaned = p.replace(/\s+/g, '').trim();
        if (cleaned.length >= 9 && cleaned.length <= 15 && !scraped.phones.includes(p)) scraped.phones.push(p);
      });
    }

    // Set aggregated fields
    scraped.text = textBlob.slice(0, 12000); // Rich text dump

    // Sort colors by frequency of occurrence in descending order
    const sortedColors = Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);
    scraped.colors = sortedColors.slice(0, 40);


    scraped.totalImagesCount = foundImages.length;
    scraped.missingAltCount = foundImages.filter(img => !img.alt).length;
    scraped.images = foundImages.slice(0, 15);

    // Robots.txt and Sitemap.xml verification
    try {
      const rResp = await axios.get(`${baseUrl}/robots.txt`, { timeout: 2500 }).catch(() => null);
      scraped.hasRobots = !!(rResp && rResp.status === 200 && rResp.data && rResp.data.length > 10);
      const sResp = await axios.get(`${baseUrl}/sitemap.xml`, { timeout: 2500 }).catch(() => null);
      scraped.hasSitemap = !!(sResp && sResp.status === 200 && sResp.data && sResp.data.length > 10);
    } catch { }

  } catch (error) {
    console.error('Scraper fatal error:', error);
    scraped.title = scraped.title || 'Nem sikerült elérni a weboldalt';
    scraped.text = scraped.text || 'Hiba történt az adatok kinyerése során.';
  }

  return scraped;
}
