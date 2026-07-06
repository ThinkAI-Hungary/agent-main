/**
 * batch-test-templates.mjs
 * Generates renders for all 45 templates with the current product image.
 * Run: node batch-test-templates.mjs
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const BACKEND = 'http://localhost:3001';
const IMAGE_URL = 'http://localhost:3001/renders/rembg-1783091521481.png';
const PRIMARY = '#ffffff';
const ACCENT = '#187fc0';
const FONT = 'Inter';
const OVERLAY_TEXT = '30% kedvezmény';
const CTA_TEXT = 'VÁSÁROLJ MOST';

// We'll call the overlay-only endpoint which handles template building
const TEMPLATE_IDS = [
  'bold-headline','product-callout','promo-badge','split-card','luxury-dark',
  'neo-brutal','kicker-title','testimonial-layer','minimal-brand','story-cta',
  'countdown-launch','new-arrival','event-invite','food-recipe','fitness-motivation',
  'fashion-lookbook','real-estate','music-release','webinar','before-after',
  'app-showcase','travel','dark-announcement','flash-sale','carousel-slide',
  'giveaway','quote-card','summer-vibes','subscription','product-grid',
  'price-tag-bold','corner-ribbon','side-stripe-left','top-bar-announcement',
  'caption-bottom-only','watermark-corner','subtitle-strip','polaroid-white',
  'neon-glow-frame','vintage-stamp','stat-big-number','before-after-label',
  'percentage-corner','bundle-deal','flash-promo-minimal'
];

const RESULTS_DIR = path.resolve('batch-test-results');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

async function renderTemplate(templateId) {
  const resp = await fetch(`${BACKEND}/api/image/generate-overlay-only`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrl: IMAGE_URL,
      templateId,
      editingText: OVERLAY_TEXT,
      editingCta: CTA_TEXT,
      brandKit: {
        colors: { primary: PRIMARY, secondary: '#000000', accent: ACCENT },
        typography: { fontName: FONT },
        logoPosition: 'top-left'
      },
      aiAdaptEnabled: false  // skip AI for faster batch test
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[${templateId}] FAIL: ${err.slice(0, 100)}`);
    return null;
  }

  const data = await resp.json();
  const renderUrl = data.imageUrl || data.renderedImageUrl;
  if (!renderUrl) {
    console.error(`[${templateId}] No imageUrl in response: ${JSON.stringify(data).slice(0, 100)}`);
    return null;
  }

  // Copy from renders/ to batch-test-results/
  const filename = path.basename(renderUrl);
  const src = path.resolve(`z/kepgeneralas/server/renders/${filename}`);
  const dst = path.resolve(`batch-test-results/${templateId}.png`);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`[${templateId}] OK → ${dst}`);
  } else {
    console.log(`[${templateId}] render not found at ${src}`);
  }
  return dst;
}

async function main() {
  console.log(`Batch testing ${TEMPLATE_IDS.length} templates...`);
  const results = [];
  
  for (const id of TEMPLATE_IDS) {
    try {
      const result = await renderTemplate(id);
      results.push({ id, ok: !!result, path: result });
    } catch (e) {
      console.error(`[${id}] ERROR: ${e.message}`);
      results.push({ id, ok: false, error: e.message });
    }
    // Small delay to not overwhelm the renderer
    await new Promise(r => setTimeout(r, 800));
  }

  console.log('\n=== RESULTS ===');
  results.forEach(r => console.log(`${r.ok ? '✅' : '❌'} ${r.id}`));
  fs.writeFileSync('batch-test-results/results.json', JSON.stringify(results, null, 2));
}

main().catch(console.error);
