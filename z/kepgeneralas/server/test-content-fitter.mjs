// test-content-fitter.mjs
// Teszteli a contentFitter logikát a backend render API-n keresztul

const BACKEND = 'http://localhost:3001';
const IMAGE_URL = `${BACKEND}/renders/uploaded-1783124532175.png`;

// ── Sablon definicio (center-circle-promo, Brand: Piktor) ────────────────────
const PRIMARY = '#1a237e';   // deep blue (teszt brand szin)
const ACCENT  = '#e53935';   // red
const FONT    = 'Inter';

const template = {
  id: 'center-circle-promo',
  layers: [
    { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.45)', opacity: 1 },
    { type: 'figure', subType: 'circle', x: 190, y: 190, width: 700, height: 700, fill: PRIMARY, opacity: 0.95, border: `10px solid ${ACCENT}`, shadow: '0 20px 60px rgba(0,0,0,0.6)' },
    { type: 'text', role: 'headline', text: '', x: 240, y: 290, width: 600, fontSize: 200, fontFamily: FONT, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
    { type: 'text', role: 'subtitle', text: '', x: 250, y: 520, width: 580, fontSize: 46, fontFamily: FONT, fontWeight: '700', align: 'center', fill: ACCENT, opacity: 1, lineHeight: 1.25 },
    { type: 'figure', subType: 'rect', x: 290, y: 940, width: 500, height: 96, fill: '#ffffff', opacity: 1, cornerRadius: 48 },
    { type: 'text', role: 'cta', text: '', x: 302, y: 963, width: 476, fontSize: 34, fontFamily: FONT, fontWeight: '800', align: 'center', fill: PRIMARY, opacity: 1 },
  ]
};

// ── Szoveg amit tesztelunk (valodi usecase: "30% akció minden autós termékre") ──
const OVERLAY_TEXT = '30% akció minden autós termékre';
const CTA_TEXT = 'Megnézem';

// ── contentFitter logika (inline, mert ez Node.js nem TS) ───────────────────
const CHAR_WIDTH_RATIO = 0.56;
const PROMO_KEYWORDS = ['akcio','sale','kedvezmeny','learazas','uj','hot','kupon','promo'];
const STOP_WORDS = new Set(['a','az','es','vagy','hogy','mint','de','ha','is','egy','van','volt','for','the','and','or','to','of','in','on','at']);

function removeDiacritics(s) {
  return s.replace(/[áà]/g,'a').replace(/[éè]/g,'e').replace(/[íì]/g,'i')
    .replace(/[óòő]/g,'o').replace(/[öô]/g,'o').replace(/[úùű]/g,'u').replace(/[üû]/g,'u');
}

function estimateCharCapacity(layer) {
  const fontSize = layer.fontSize || 28;
  const width = layer.width || 800;
  const height = layer.height;
  const lh = layer.lineHeight || 1.2;
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * CHAR_WIDTH_RATIO)));
  let maxLines = height && height > fontSize ? Math.max(1, Math.floor(height / (fontSize * lh))) : 4;
  return charsPerLine * maxLines;
}

function softTruncate(text, capacity) {
  if (text.length <= capacity) return { fits: text, overflow: '' };
  const words = text.split(/\s+/);
  let fits = '';
  let i = 0;
  while (i < words.length) {
    const candidate = fits ? `${fits} ${words[i]}` : words[i];
    if (candidate.length <= capacity) { fits = candidate; i++; } else break;
  }
  return { fits: fits || words[0].substring(0, capacity - 3) + '...', overflow: words.slice(i).join(' ') };
}

function fitContent(template, overlayText, ctaText) {
  const layers = template.layers.map(l => ({ ...l }));
  const text = overlayText.trim();
  const cta = ctaText.trim();
  const words = text.split(/\s+/);

  // Classify tokens
  let badgeCandidate = '';
  let bodyTokens = [];

  for (const word of words) {
    const lower = removeDiacritics(word.toLowerCase().replace(/[.,!?;:]/g, ''));
    if (/^\d+%?$/.test(word) || /^-?\d+[%+]?$/.test(word)) {
      if (!badgeCandidate) badgeCandidate = word;
      else bodyTokens.push(word);
    } else if (PROMO_KEYWORDS.some(kw => lower.includes(kw))) {
      bodyTokens.push(word); // promo word stays in body for subtitle
    } else {
      bodyTokens.push(word);
    }
  }

  const bodyText = bodyTokens.join(' ');

  // Assign to slots
  const roleOrder = ['badge','kicker','headline','subtitle','cta'];
  const slots = layers
    .map((l, i) => ({ idx: i, layer: l, role: l.role || 'headline', cap: estimateCharCapacity(l) }))
    .filter(s => s.layer.type === 'text' && (s.layer.opacity || 1) >= 0.5)
    .sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));

  const assigned = new Set();
  const log = [];

  function assign(role, txt) {
    if (!txt) return;
    const slot = slots.find(s => s.role === role && !assigned.has(s.idx));
    if (!slot) return;
    const { fits, overflow } = softTruncate(txt, slot.cap);
    layers[slot.idx] = { ...layers[slot.idx], text: fits };
    assigned.add(slot.idx);
    log.push(`[${role}] cap=${slot.cap} used=${fits.length} text="${fits}"${overflow ? ` overflow="${overflow}"` : ''}`);
  }

  // Fill headline with badge candidate (the number)
  const headlineSlot = slots.find(s => s.role === 'headline');
  if (headlineSlot && badgeCandidate) {
    layers[headlineSlot.idx] = { ...layers[headlineSlot.idx], text: badgeCandidate };
    assigned.add(headlineSlot.idx);
    log.push(`[headline] text="${badgeCandidate}" (number token)`);
  }

  // Fill subtitle with body text
  assign('subtitle', bodyText);

  // Fill CTA
  if (cta) {
    assign('cta', cta.toUpperCase());
  } else {
    // Hide empty CTA
    const ctaSlot = slots.find(s => s.role === 'cta');
    if (ctaSlot) {
      layers[ctaSlot.idx] = { ...layers[ctaSlot.idx], text: '', visible: false };
      // Hide preceding button rect
      if (ctaSlot.idx > 0 && layers[ctaSlot.idx - 1]?.subType === 'rect') {
        layers[ctaSlot.idx - 1] = { ...layers[ctaSlot.idx - 1], visible: false };
      }
      log.push('[cta] hidden - no CTA text provided');
    }
  }

  return { layers, log };
}

// ── Main test ─────────────────────────────────────────────────────────────────
async function runTest() {
  console.log('='.repeat(60));
  console.log('ContentFitter Test — center-circle-promo sablon');
  console.log('Kep:', IMAGE_URL);
  console.log('Szoveg:', OVERLAY_TEXT);
  console.log('CTA:', CTA_TEXT);
  console.log('='.repeat(60));

  // 1. Run content fitter
  const { layers: filledLayers, log } = fitContent(template, OVERLAY_TEXT, CTA_TEXT);
  console.log('\n[FITTER] Slot assignments:');
  log.forEach(l => console.log(' ', l));

  // 2. Build background layer (cover crop: Math.max)
  // Image is landscape (1280x853 approx), canvas is 1080x1350 portrait
  // cover scale = Math.max(1080/1280, 1350/853) = Math.max(0.84, 1.58) = 1.58
  // → covers full canvas, image is wider than needed → center-crop x
  const BG_W = 1440, BG_H = 960; // typical Audi photo dimensions estimate
  const coverScale = Math.max(1080 / BG_W, 1350 / BG_H);
  const fw = Math.round(BG_W * coverScale);
  const fh = Math.round(BG_H * coverScale);
  const bgLayer = {
    type: 'image',
    src: IMAGE_URL,
    x: Math.round((1080 - fw) / 2),
    y: Math.round((1350 - fh) / 2),
    width: fw,
    height: fh,
    opacity: 1,
    objectFit: 'cover',
  };

  const layoutJson = {
    width: 1080,
    height: 1350,
    pages: [{
      background: '#0d1b2a',
      children: [bgLayer, ...filledLayers]
    }]
  };

  console.log('\n[RENDER] Sending to /api/render-polotno...');
  console.log('[RENDER] Canvas: 1080x1350, Layers:', layoutJson.pages[0].children.length);

  // 3. Call render API
  const resp = await fetch(`${BACKEND}/api/render-polotno`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layoutJson })
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error('[RENDER] FAILED:', err);
    process.exit(1);
  }

  const data = await resp.json();
  console.log('\n[RENDER] SUCCESS!');
  console.log('[RENDER] Output URL:', data.imageUrl);
  console.log('[RENDER] Full URL:', `${BACKEND}${data.imageUrl}`);
  
  // 4. Check file exists locally
  const filename = data.imageUrl.split('/renders/')[1];
  const localPath = `C:\\Users\\Zombo\\Desktop\\Antigrav\\agentmain_digidesk\\agent-main\\z\\kepgeneralas\\server\\renders\\${filename}`;
  console.log('[RENDER] Local path:', localPath);

  return data;
}

runTest().catch(console.error);
