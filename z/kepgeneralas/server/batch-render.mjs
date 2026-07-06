/**
 * batch-render.mjs - Direct batch renderer for all 45 templates
 * Calls the backend /api/render-polotno endpoint with pre-built layer JSON
 * Usage: node batch-render.mjs
 */

const BACKEND = 'http://localhost:3001';
const BG_IMAGE_URL = 'http://localhost:3001/renders/rembg-1783091521481.png';
const PRIMARY = '#ffffff';
const ACCENT = '#187fc0';
const FONT = 'Inter';
const OVERLAY_TEXT = '30% kedvezmény';
const CTA_TEXT = 'VÁSÁROLJ MOST';

// Luminosity helper (mirrors layerTemplates.ts logic)
function hexToLuminosity(hex) {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return 0.5;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const primaryLum = PRIMARY.startsWith('#') ? hexToLuminosity(PRIMARY) : 0.5;
const scrimFill = primaryLum > 0.45 ? '#0f0f1a' : PRIMARY;
const gradientPrimary = primaryLum > 0.45 ? '#0f0f1a' : PRIMARY;

// Minimal template subset - key templates most likely to be selected
const TEMPLATES = [
  {
    id: 'bold-headline',
    layers: [
      { type: 'figure', subType: 'rect', x: 0, y: 600, width: 1080, height: 750, fill: `linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.75) 50%, transparent 100%)`, opacity: 1 },
      { type: 'text', text: '', x: 60, y: 680, width: 960, fontSize: 28, fontFamily: FONT, fontWeight: '700', align: 'left', fill: ACCENT, opacity: 1 },
      { type: 'text', text: OVERLAY_TEXT, x: 60, y: 740, width: 960, fontSize: 112, fontFamily: FONT, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
      { type: 'figure', subType: 'rect', x: 60, y: 1300, width: 280, height: 5, fill: ACCENT, opacity: 1 },
    ]
  },
  {
    id: 'product-callout',
    layers: [
      { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.45)', opacity: 1 },
      { type: 'figure', subType: 'rect', x: 60, y: 60, width: 220, height: 64, fill: ACCENT, opacity: 1, cornerRadius: 8 },
      { type: 'text', text: 'UJ!', x: 72, y: 79, width: 196, fontSize: 30, fontFamily: FONT, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
      { type: 'figure', subType: 'rect', x: 0, y: 820, width: 1080, height: 530, fill: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 70%, transparent 100%)', opacity: 1 },
      { type: 'text', text: OVERLAY_TEXT, x: 60, y: 860, width: 700, fontSize: 110, fontFamily: FONT, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.1 },
      { type: 'text', text: '4 990 Ft', x: 60, y: 1100, width: 400, fontSize: 72, fontFamily: FONT, fontWeight: '800', align: 'left', fill: ACCENT, opacity: 1 },
      { type: 'figure', subType: 'rect', x: 60, y: 1220, width: 380, height: 82, fill: ACCENT, opacity: 1, cornerRadius: 41 },
      { type: 'text', text: CTA_TEXT, x: 72, y: 1238, width: 356, fontSize: 28, fontFamily: FONT, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
    ]
  },
  {
    id: 'promo-badge',
    layers: [
      { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: scrimFill, opacity: 0.55 },
      { type: 'figure', subType: 'circle', x: 190, y: 240, width: 700, height: 700, fill: ACCENT, opacity: 0.12 },
      { type: 'text', text: '30%', x: 60, y: 320, width: 960, fontSize: 300, fontFamily: FONT, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
      { type: 'text', text: 'KEDVEZMÉNY', x: 100, y: 690, width: 880, fontSize: 80, fontFamily: FONT, fontWeight: '800', align: 'center', fill: ACCENT, opacity: 1 },
      { type: 'figure', subType: 'rect', x: 100, y: 800, width: 880, height: 2, fill: 'rgba(255,255,255,0.25)', opacity: 1 },
      { type: 'text', text: 'mindenre', x: 100, y: 830, width: 880, fontSize: 48, fontFamily: FONT, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.75)', opacity: 1 },
      { type: 'figure', subType: 'rect', x: 240, y: 1030, width: 600, height: 88, fill: '#ffffff', opacity: 1, cornerRadius: 44 },
      { type: 'text', text: CTA_TEXT, x: 252, y: 1050, width: 576, fontSize: 36, fontFamily: FONT, fontWeight: '800', align: 'center', fill: scrimFill, opacity: 1 },
    ]
  },
  {
    id: 'split-card',
    layers: [
      { type: 'figure', subType: 'rect', x: 0, y: 820, width: 1080, height: 530, fill: '#ffffff', opacity: 0.92 },
      { type: 'figure', subType: 'rect', x: 60, y: 858, width: 8, height: 60, fill: ACCENT, opacity: 1 },
      { type: 'text', text: OVERLAY_TEXT, x: 88, y: 858, width: 900, fontSize: 22, fontFamily: FONT, fontWeight: '700', align: 'left', fill: ACCENT, opacity: 1 },
      { type: 'text', text: CTA_TEXT, x: 60, y: 940, width: 860, fontSize: 96, fontFamily: FONT, fontWeight: '900', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.0 },
      { type: 'figure', subType: 'rect', x: 860, y: 1230, width: 160, height: 60, fill: PRIMARY, opacity: 1, cornerRadius: 30 },
      { type: 'text', text: 'Tovabb', x: 868, y: 1244, width: 144, fontSize: 28, fontFamily: FONT, fontWeight: '700', align: 'center', fill: '#ffffff', opacity: 1 },
    ]
  },
  {
    id: 'flash-sale',
    layers: [
      { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: '#111111', opacity: 0.80 },
      { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 6, fill: '#ef4444', opacity: 1 },
      { type: 'figure', subType: 'rect', x: 0, y: 1344, width: 1080, height: 6, fill: '#ef4444', opacity: 1 },
      { type: 'text', text: 'FLASH', x: 40, y: 120, width: 1000, fontSize: 220, fontFamily: FONT, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
      { type: 'text', text: 'SALE', x: 40, y: 330, width: 1000, fontSize: 220, fontFamily: FONT, fontWeight: '900', align: 'left', fill: '#ef4444', opacity: 1, lineHeight: 1.0 },
      { type: 'text', text: '30%', x: 40, y: 680, width: 600, fontSize: 280, fontFamily: FONT, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
      { type: 'text', text: 'mindenre', x: 40, y: 1010, width: 700, fontSize: 50, fontFamily: FONT, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.5)', opacity: 1 },
      { type: 'figure', subType: 'rect', x: 40, y: 1110, width: 1000, height: 88, fill: '#ef4444', opacity: 1, cornerRadius: 6 },
      { type: 'text', text: CTA_TEXT, x: 52, y: 1130, width: 976, fontSize: 40, fontFamily: FONT, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1 },
    ]
  },
  {
    id: 'corner-ribbon',
    layers: [
      { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.08)', opacity: 1 },
      { type: 'figure', subType: 'rect', x: -60, y: 100, width: 320, height: 80, fill: ACCENT, opacity: 1 },
      { type: 'text', text: '30% AKCIÓ', x: 0, y: 116, width: 240, fontSize: 32, fontFamily: FONT, fontWeight: '900', align: 'center', fill: '#000000', opacity: 1 },
      { type: 'figure', subType: 'rect', x: 0, y: 1300, width: 1080, height: 50, fill: scrimFill, opacity: 0.82 },
      { type: 'text', text: 'piktorfestek.hu', x: 60, y: 1313, width: 960, fontSize: 22, fontFamily: FONT, fontWeight: '600', align: 'center', fill: 'rgba(255,255,255,0.7)', opacity: 1 },
    ]
  },
];

async function renderTemplate(id, layers) {
  const layoutJson = {
    width: 1080,
    height: 1350,
    pages: [{
      background: '#000000',
      children: [
        { type: 'image', src: BG_IMAGE_URL, x: 0, y: 0, width: 1080, height: 1350, opacity: 1 },
        ...layers
      ]
    }]
  };

  const resp = await fetch(`${BACKEND}/api/render-polotno`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layoutJson })
  });

  if (!resp.ok) throw new Error(await resp.text());
  const data = await resp.json();
  return data.imageUrl;
}

async function main() {
  const { default: fs } = await import('fs');
  const { default: path } = await import('path');
  const RESULTS = path.resolve('batch-test-results');
  if (!fs.existsSync(RESULTS)) fs.mkdirSync(RESULTS, { recursive: true });

  for (const tpl of TEMPLATES) {
    try {
      console.log(`Rendering ${tpl.id}...`);
      const url = await renderTemplate(tpl.id, tpl.layers);
      const filename = path.basename(url);
      const src = path.resolve(`z/kepgeneralas/server/renders/${filename}`);
      const dst = `${RESULTS}/${tpl.id}.png`;
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
        console.log(`  ✅ ${tpl.id} → ${dst}`);
      }
    } catch(e) {
      console.error(`  ❌ ${tpl.id}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('\nBatch render complete.');
}

main().catch(console.error);
