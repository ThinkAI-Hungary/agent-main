/**
 * layerNormalizer.ts
 * Deterministic (non-AI) layer normalization for Polotno canvas layers.
 *
 * RULES APPLIED:
 * 1. Font size scaling → text never overflows its container width
 * 2. Panel height auto-sizing → container rect grows to fit all owned text
 * 3. Text color contrast via textShadow (NO new black rect insertion)
 * 4. CTA button height = cornerRadius * 2 always (pill shape)
 * 5. Frame snap → transparent border rects always x=0,y=0,w=1080,h=1350
 * 6. Bounds clamping → nothing goes outside canvas
 */

import type { LayerChild, LayerTemplate } from './layerTemplates';

// Canvas dimensions
const CANVAS_W = 1080;
const CANVAS_H = 1350;

// Approximate average char width as a fraction of fontSize (sans-serif bold)
// Hungarian text with long words needs a higher ratio to prevent breaks.
const CHAR_WIDTH_RATIO = 0.62;

// Minimum line height multiplier when lineHeight is not set
const DEFAULT_LINE_HEIGHT = 1.2;

// Vertical padding inside a text panel (above + below the text)
const PANEL_VERTICAL_PADDING = 32;

// Minimum padding between stacked text layers in the same panel
const TEXT_VERTICAL_GAP = 12;

/**
 * Estimate how many lines a text will wrap to at given fontSize and width.
 * Handles explicit \n line breaks.
 */
function estimateLineCount(text: string, width: number, fontSize: number): number {
  // Polotno uses word-wrapping. We must ensure a single word doesn't exceed width.
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * CHAR_WIDTH_RATIO)));
  
  return text.split('\n').reduce((acc, segment) => {
    const words = segment.trim().split(/\s+/);
    if (words.length === 0) return acc + 1;

    let lines = 1;
    let currentLineLength = 0;

    for (const word of words) {
      const wordLen = word.length;
      // If word itself is longer than line, it will break anyway, but we should count it
      if (currentLineLength + wordLen + 1 > charsPerLine) {
        lines++;
        currentLineLength = wordLen;
      } else {
        currentLineLength += (currentLineLength === 0 ? wordLen : wordLen + 1);
      }
    }
    return acc + lines;
  }, 0);
}

/**
 * Estimate total rendered height of a text layer.
 */
function estimateTextHeight(layer: LayerChild): number {
  const text = layer.text || '';
  const fontSize = layer.fontSize || 28;
  const width = layer.width || CANVAS_W;
  const lh = layer.lineHeight ?? DEFAULT_LINE_HEIGHT;
  const lines = estimateLineCount(text, width, fontSize);
  return Math.ceil(lines * fontSize * lh + fontSize * 0.25); // 0.25 = descender space
}

/**
 * Compute the optimal fontSize so the text fits within maxLines lines.
 * Never goes below minSize.
 */
function computeFitFontSize(
  text: string,
  width: number,
  currentFontSize: number,
  maxLines: number = 3,
  minSize: number = 22
): number {
  let fontSize = currentFontSize;
  while (fontSize > minSize) {
    const lines = estimateLineCount(text, width, fontSize);
    if (lines <= maxLines) break;
    fontSize = Math.max(minSize, Math.floor(fontSize * 0.88));
  }
  return fontSize;
}

/**
 * Determine if a layer is a "full-canvas scrim" (background overlay),
 * not a localized text container panel.
 */
function isFullCanvasScrim(layer: LayerChild): boolean {
  return (
    layer.type === 'figure' &&
    layer.subType === 'rect' &&
    layer.x === 0 &&
    layer.y === 0 &&
    (layer.width ?? 0) >= CANVAS_W - 10 &&
    (layer.height ?? 0) >= CANVAS_H * 0.7
  );
}

/**
 * Determine if a figure rect is a "text panel" (localized container behind text).
 * Full-canvas scrims are excluded.
 */
function isTextPanel(layer: LayerChild): boolean {
  if (layer.type !== 'figure' || layer.subType !== 'rect') return false;
  if (isFullCanvasScrim(layer)) return false;
  // Transparent border frames are not text panels
  if ((layer.fill === 'transparent' || layer.fill === '') && layer.border) return false;
  // Thin decorative lines (height < 10) are not panels
  if ((layer.height ?? 0) < 10) return false;
  return true;
}

function isCtaButton(layer: LayerChild): boolean {
  // Check by role first (most reliable)
  if (layer.role === 'cta') return true;
  
  // Legacy shape-based check
  if (layer.type !== 'figure' || layer.subType !== 'rect') return false;
  const h = layer.height ?? 0;
  const r = layer.cornerRadius ?? 0;
  // Pill shape: cornerRadius >= height/2 - 5
  return h >= 60 && h <= 120 && r >= h / 2 - 6;
}

/**
 * Find all text layers that are visually "inside" a panel rect.
 * A text layer belongs to a panel if the panel's area horizontally overlaps
 * and the panel's y range covers or is close to the text's y position.
 */
function findTextLayersInPanel(
  panelIdx: number,
  layers: LayerChild[]
): number[] {
  const panel = layers[panelIdx];
  const px = panel.x;
  const py = panel.y;
  const pw = panel.width;
  const ph = panel.height ?? 300;

  const result: number[] = [];
  for (let i = panelIdx + 1; i < layers.length; i++) {
    const l = layers[i];
    if (l.type !== 'text') continue;

    const lx = l.x;
    const ly = l.y;
    const lw = l.width;

    // Horizontal overlap check
    const hOverlap = lx >= px - 20 && lx + lw <= px + pw + 20;
    // Vertical: text y starts within panel y range (with some margin)
    const vOverlap = ly >= py - 20 && ly <= py + ph + 60;

    if (hOverlap && vOverlap) {
      result.push(i);
    }
  }
  return result;
}

interface ImageAnalysisInfo {
  dominantColors?: string[];
  subject?: string;
  backgroundBrightness?: 'light' | 'dark' | 'mixed' | 'any';
}

const LIGHT_KEYWORDS = ['white', 'cream', 'beige', 'ivory', 'light', 'silver', 'yellow', 'pale', 'fehér', 'ezüst'];
const DARK_KEYWORDS = ['black', 'dark', 'navy', 'charcoal', 'deep', 'midnight', 'fekete', 'sötét'];

/**
 * Determine background luminosity based on image analysis.
 * Returns 'light', 'dark', or 'mixed'.
 */
function detectBackground(analysis?: ImageAnalysisInfo): 'light' | 'dark' | 'mixed' {
  // Priority 1: Use explicit brightness analysis from backend (usually Claude Vision)
  if (analysis?.backgroundBrightness && analysis.backgroundBrightness !== 'any') {
    return analysis.backgroundBrightness as 'light' | 'dark' | 'mixed';
  }

  // Priority 2: Fallback to dominant colors keyword matching
  if (!analysis?.dominantColors?.length) return 'mixed';
  const colors = analysis.dominantColors.map(c => c.toLowerCase());
  const hasLight = colors.some(c => LIGHT_KEYWORDS.some(k => c.includes(k)));
  const hasDark = colors.some(c => DARK_KEYWORDS.some(k => c.includes(k)));
  if (hasLight && !hasDark) return 'light';
  if (hasDark && !hasLight) return 'dark';
  return 'mixed';
}

/**
 * Estimates the pixel width of the longest single word in the text.
 */
function estimateMaxWordWidth(text: string, fontSize: number): number {
  const words = text.split(/\s+/);
  let maxW = 0;
  // CHAR_WIDTH_RATIO is the safe average. For the longest word, we use a slightly 
  // more conservative 0.65 to ensure no character is ever cut off.
  for (const word of words) {
    const w = word.length * (fontSize * 0.65);
    if (w > maxW) maxW = w;
  }
  return maxW;
}

/**
 * Calculate perceived luminance of a hex color string.
 */
function getLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return 0.5;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Apply text contrast fix using textShadow only — NO new rect layers.
 * On a mixed or dark background with a black text layer → use white text with shadow.
 */
function applyContrastFix(layer: LayerChild, bg: 'light' | 'dark' | 'mixed', underlyingFill?: string): LayerChild {
  if (layer.type !== 'text') return layer;

  const fill = (layer.fill || '').toLowerCase();
  
  // Detect if the text color itself is "light" or "dark" based on luminance
  let isTextLight = fill === '#ffffff' || fill === 'white' || fill === '#fff' || fill.includes('rgba(255,255,255');
  let isTextDark = fill === '#000000' || fill === 'black' || fill === '#1a1a1a' || fill === '#111';
  
  if (fill.startsWith('#') && fill.length >= 7) {
    const lum = getLuminance(fill);
    if (lum > 0.7) isTextLight = true;
    if (lum < 0.3) isTextDark = true;
  }

  // 1. LOCAL CONTRAST (Highest priority): If the text is on a panel/shape, check that color
  if (underlyingFill) {
    const uFill = underlyingFill.toLowerCase();
    
    // Check luminance of the panel
    let isUnderlyingLight = uFill === '#ffffff' || uFill === 'white' || uFill === '#fff' || uFill.includes('rgba(255,255,255');
    let isUnderlyingDark = uFill === '#000000' || uFill === 'black' || uFill === '#000' || uFill.includes('rgba(0,0,0');
    
    if (uFill.startsWith('#') && uFill.length >= 7) {
      const lum = getLuminance(uFill);
      if (lum > 0.65) isUnderlyingLight = true; // Slightly more aggressive threshold
      if (lum < 0.35) isUnderlyingDark = true;
    }

    if (isUnderlyingLight && isTextLight) {
      // Light text on light panel -> Flip to dark
      return { ...layer, fill: '#111111', textShadow: undefined };
    }
    if (isUnderlyingDark && isTextDark) {
      // Dark text on dark panel -> Flip to light
      return { ...layer, fill: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.5)' };
    }
    // If they already contrast, return as is (respect brand colors)
    return layer;
  }

  // 2. GLOBAL CONTRAST (Image background)
  // If the image is light and the text is light -> Flip to dark
  if (bg === 'light' && isTextLight) {
    return { ...layer, fill: '#1a1a1a', textShadow: undefined };
  }

  // If the image is dark/mixed and the text is dark -> Flip to light with strong shadow
  if ((bg === 'dark' || bg === 'mixed') && isTextDark) {
    return { ...layer, fill: '#ffffff', textShadow: '0 2px 10px rgba(0,0,0,0.9), 0 0px 4px rgba(0,0,0,1)' };
  }

  // If the image is light and text is dark, or dark and text is light -> Just add a subtle safety shadow
  if (bg === 'light' && isTextDark) {
    return { ...layer, textShadow: '0 1px 2px rgba(255,255,255,0.3)' };
  }
  
  if (bg === 'dark' && isTextLight) {
    return { ...layer, textShadow: '0 2px 8px rgba(0,0,0,0.5)' };
  }

  return layer;
}

/**
 * MAIN NORMALIZER
 */
export function normalizeLayers(
  template: LayerTemplate | null,
  inputLayers: LayerChild[],
  imageAnalysis?: ImageAnalysisInfo
): { layers: LayerChild[]; changes: string[] } {
  const changes: string[] = [];
  let layers: LayerChild[] = inputLayers.map(l => ({ ...l }));
  const bg = detectBackground(imageAnalysis);
  const subject = (imageAnalysis?.subject || '').toLowerCase();
  
  const centeredSubjectKeywords = ['bucket', 'vödör', 'bottle', 'üveg', 'product', 'termék', 'paint', 'festék'];
  // Check both AI analysis and Template metadata for centered subject intent
  const isCenteredSubject = centeredSubjectKeywords.some(k => subject.includes(k)) || 
                             template?.meta?.imageComposition?.includes('product-centered');

  // ── PASS 0: Scrim fill normalization (hex alpha → rgba, opacity enforcement) ─
  // Polotno renderer may not handle 8-digit hex (#rrggbbaa) properly.
  // Convert those to rgba() and also enforce minimum opacity on full-canvas scrims.
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (!isFullCanvasScrim(l)) continue;
    let fill = l.fill || '';
    let changed = false;

    // Convert #rrggbbaa (8-digit hex) → rgba()
    const hex8Match = fill.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
    if (hex8Match) {
      const [, r, g, b, a] = hex8Match;
      const alpha = Math.round(parseInt(a, 16) / 255 * 100) / 100;
      fill = `rgba(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)},${alpha})`;
      changed = true;
    }

    // Enforce minimum opacity: full-canvas scrims must be at least 0.7
    const currentOpacity = l.opacity ?? 1;
    const newOpacity = Math.max(currentOpacity, 0.70);

    if (changed || newOpacity !== currentOpacity) {
      layers[i] = { ...l, fill, opacity: newOpacity };
    }
  }

  // ── PASS 0: Background Cleanup for Empty Text ────────────────────────────
  // If a text layer is empty, we should also hide its background shape (button/badge)
  const layersToRemove = new Set<number>();
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (l.type === 'text' && (!l.text || l.text.trim() === '')) {
      layersToRemove.add(i);
      // Look backwards for a nearby figure that might be its background
      for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
        const prev = layers[j];
        if (prev.type === 'figure' && !layersToRemove.has(j)) {
          // Check if it's roughly in the same spot
          const dx = Math.abs(prev.x - l.x);
          const dy = Math.abs(prev.y - l.y);
          if (dx < 150 && dy < 150) {
            layersToRemove.add(j);
            changes.push(`Removed empty background shape ${j} for text ${i}`);
          }
        }
      }
    }
  }
  layers = layers.filter((_, idx) => !layersToRemove.has(idx));

  // ── PASS 1: Font size fitting & Word-break prevention ────────────────────
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (l.type !== 'text' || !l.text || !l.fontSize || !l.width) continue;

    let fontSize = l.fontSize;
    const width = l.width;
    const text = l.text;

    // Safety: ensure no single word is wider than the container (prevents word breaking)
    let safetyCounter = 0;
    while (estimateMaxWordWidth(text, fontSize) > width && fontSize > 16 && safetyCounter < 20) {
      fontSize -= 4;
      safetyCounter++;
    }

    const maxLines = fontSize >= 80 ? 3 : fontSize >= 40 ? 4 : 5;
    const currentLines = estimateLineCount(text, width, fontSize);
    if (currentLines > maxLines) {
      fontSize = computeFitFontSize(text, width, fontSize, maxLines);
    }

    if (fontSize !== l.fontSize) {
      layers[i] = { ...l, fontSize };
      changes.push(`Layer ${i}: fontSize ${l.fontSize}→${fontSize} (no-break + fit)`);
    }
  }

  // ── PASS 2: Panel height auto-sizing ─────────────────────────────────────
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (!isTextPanel(l)) continue;

    const textIdxs = findTextLayersInPanel(i, layers);
    if (textIdxs.length === 0) continue;

    const panelTop = l.y;
    let minY = Infinity;
    let maxBottom = -Infinity;

    for (const ti of textIdxs) {
      const tl = layers[ti];
      const textH = estimateTextHeight(tl);
      const top = tl.y;
      const bottom = top + textH;
      if (top < minY) minY = top;
      if (bottom > maxBottom) maxBottom = bottom;
    }

    const requiredHeight = (maxBottom - panelTop) + PANEL_VERTICAL_PADDING;
    const currentHeight = l.height ?? 300;

    if (requiredHeight > currentHeight) {
      layers[i] = { ...l, height: Math.ceil(requiredHeight) };
      changes.push(`Panel ${i}: height auto-sized to ${Math.ceil(requiredHeight)}`);
    }
  }

  // ── PASS 2b: Circle container text clamping ──────────────────────────────
  // Circles can't auto-grow like rect panels. Text inside a circle badge must
  // fit within the INSCRIBED rectangle: usable height ≈ diameter × 0.65.
  // If text overflows, font sizes are reduced (min 20px) until all layers fit.
  // After fitting, text layers are re-stacked vertically inside the circle.
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (l.type !== 'figure' || l.subType !== 'circle') continue;

    const circleW = l.width;
    const circleH = l.height ?? l.width;
    const usableH = Math.round(circleH * 0.65);  // inscribed rectangle height
    const usableW = Math.round(circleW * 0.72);   // inscribed rectangle width
    const circleMidX = l.x + circleW / 2;
    const circleMidY = l.y + circleH / 2;

    // Find text layers whose center falls within 80% of circle radius
    // (80% instead of 60% to catch subtitle in larger circles)
    const textIdxsInCircle: number[] = [];
    for (let j = i + 1; j < layers.length; j++) {
      const t = layers[j];
      if (t.type !== 'text') continue;
      const tCenterX = t.x + t.width / 2;
      const tCenterY = t.y + (t.fontSize || 28) / 2;
      const dist = Math.sqrt(Math.pow(tCenterX - circleMidX, 2) + Math.pow(tCenterY - circleMidY, 2));
      if (dist < circleW * 0.80) {
        textIdxsInCircle.push(j);
      }
    }
    if (textIdxsInCircle.length === 0) continue;

    const getTotalH = () => textIdxsInCircle.reduce((sum, ti) => sum + estimateTextHeight(layers[ti]), 0);

    // Shrink all text layers proportionally until total fits within inscribed height
    let iterations = 0;
    while (getTotalH() > usableH && iterations < 20) {
      for (const ti of textIdxsInCircle) {
        const tl = layers[ti];
        const newSize = Math.max(20, Math.floor((tl.fontSize || 28) * 0.90));
        if (newSize !== tl.fontSize) {
          layers[ti] = { ...tl, fontSize: newSize };
        }
      }
      iterations++;
    }

    // Clamp width to inscribed rectangle width and re-center horizontally
    for (const ti of textIdxsInCircle) {
      const tl = layers[ti];
      if (tl.width > usableW) {
        layers[ti] = { ...layers[ti], width: usableW, x: Math.round(circleMidX - usableW / 2) };
        changes.push(`Circle text ${ti}: width clamped to inscribed w=${usableW}`);
      }
    }

    // Re-stack text layers vertically inside the circle so they don't overlap.
    // Total text block is centered vertically within the circle's inscribed area.
    const totalTextH = getTotalH();
    const GAP = 8; // px gap between stacked text layers
    const circleTop = l.y;
    const startY = Math.round(circleMidY - totalTextH / 2);
    let cursorY = startY;
    for (const ti of textIdxsInCircle) {
      const tl = layers[ti];
      const th = estimateTextHeight(tl);
      if (tl.y !== cursorY) {
        layers[ti] = { ...layers[ti], y: cursorY };
        changes.push(`Circle text ${ti}: y re-stacked to ${cursorY}`);
      }
      cursorY += th + GAP;
    }

    // Safety: clamp any text that still goes below circle bottom
    const circleBottom = l.y + circleH;
    for (const ti of textIdxsInCircle) {
      const tl = layers[ti];
      const th = estimateTextHeight(tl);
      if (tl.y + th > circleBottom - 20) {
        layers[ti] = { ...layers[ti], y: circleBottom - th - 20 };
        changes.push(`Circle text ${ti}: y clamped to circle bottom`);
      }
    }

    if (iterations > 0) {
      changes.push(`Circle ${i}: text reduced (${iterations} passes) to fit inscribed h=${usableH}px`);
    }
  }


  // ── PASS 3: Frame snap ───────────────────────────────────────────────────
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (
      l.type === 'figure' &&
      l.subType === 'rect' &&
      (l.fill === 'transparent' || l.fill === '') &&
      l.border &&
      (l.x !== 0 || l.y !== 0 || l.width !== CANVAS_W || l.height !== CANVAS_H)
    ) {
      layers[i] = { ...l, x: 0, y: 0, width: CANVAS_W, height: CANVAS_H };
    }
  }

  // ── PASS 4: CTA button consistency & Smart Contrast ──────────────────────
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (!isCtaButton(l)) continue;

    const btnFill = (l.fill || '').toLowerCase();
    const isLightButton = btnFill === '#ffffff' || btnFill === 'white' || btnFill === 'transparent' || btnFill === '';

    const h = l.height ?? 80;
    const expectedRadius = Math.floor(h / 2);
    if (l.cornerRadius !== expectedRadius) {
      layers[i] = { ...l, cornerRadius: expectedRadius };
    }

    const btnTop = l.y;
    const btnH = h;
    const btnX = l.x;
    const btnW = l.width;
    for (let j = i + 1; j < Math.min(i + 3, layers.length); j++) {
      const tl = layers[j];
      if (tl.type !== 'text') continue;
      
      // Fix 1: Vertical centering — write back to layer (previously centeredY was discarded!)
      const textH = (tl.fontSize || 28) * 1.2;
      const centeredY = Math.round(btnTop + (btnH - textH) / 2);
      // Fix 2: Horizontal alignment — text x/width should match button bounds for center alignment
      const needsYFix = Math.abs(tl.y - centeredY) > 4;
      const needsXFix = tl.x !== btnX || tl.width !== btnW;
      if (needsYFix || needsXFix) {
        layers[j] = { ...tl, y: centeredY, x: btnX, width: btnW };
        changes.push(`CTA text ${j}: centered in button (y=${centeredY}, x=${btnX}, w=${btnW})`);
      }
    }
  }

  // ── PASS 6: Bounds clamping ───────────────────────────────────────────────
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (l.type === 'image') continue;

    let changed = false;
    let { x, y, width, height } = l;
    const h = height ?? 0;

    if (x < 0) { x = 0; changed = true; }
    if (y < 0) { y = 0; changed = true; }
    if (width > CANVAS_W) { width = CANVAS_W; changed = true; }
    if (x + width > CANVAS_W) { x = Math.max(0, CANVAS_W - width); changed = true; }
    if (h > 0 && y + h > CANVAS_H) { y = Math.max(0, CANVAS_H - h); changed = true; }

    if (changed) {
      layers[i] = { ...l, x, y, width, height: h || undefined };
    }
  }

  // ── PASS 6b: Safe Zone enforcement for text layers ────────────────────────
  // Ensures text never touches image edges: min 108px margin left/right, top
  const SAFE_X_MIN = 108;
  const SAFE_X_MAX = CANVAS_W - 108;  // 972
  const SAFE_Y_MIN = 108;
  const SAFE_Y_BOTTOM_MAX = 1200;     // CTA/text shouldn't go below this
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (l.type !== 'text') continue;
    if (!l.text || l.text.trim() === '') continue; // skip empty layers

    let { x, y, width } = l;
    let changed = false;

    // Enforce left safe margin
    if (x < SAFE_X_MIN) {
      x = SAFE_X_MIN;
      changed = true;
    }
    // Enforce right safe margin: 
    // Total available width for text is SAFE_X_MAX - SAFE_X_MIN = 864px.
    if (width > (SAFE_X_MAX - x)) {
      width = Math.floor(SAFE_X_MAX - x);
      changed = true;
    }
    // Enforce top safe margin
    if (y < SAFE_Y_MIN) {
      y = SAFE_Y_MIN;
      changed = true;
    }

    if (changed) {
      layers[i] = { ...l, x, y, width };
      changes.push(`Text ${i}: safe zone enforced x=${x} y=${y} w=${width}`);
    }
  }

  // ── PASS 7: Text contrast via shadow & Local Background Awareness ─────────
  const textToShapeMap = new Map<number, number>();
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].type !== 'text') continue;
    const t = layers[i];
    // Find the shape immediately behind this text (lower z-index)
    for (let j = i - 1; j >= 0; j--) {
      const s = layers[j];
      if (s.type === 'figure' && (s.subType === 'rect' || s.subType === 'circle')) {
        const overlaps = (t.x >= s.x - 10 && t.x <= s.x + (s.width || 0) + 10) &&
                         (t.y >= s.y - 10 && t.y <= s.y + (s.height || 0) + 10);
        if (overlaps) {
          textToShapeMap.set(i, j);
          break;
        }
      }
    }
  }

  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (l.type !== 'text') continue;
    
    const shapeIdx = textToShapeMap.get(i);
    const underlyingFill = shapeIdx !== undefined ? layers[shapeIdx].fill : undefined;

    const fill = (l.fill || '').toLowerCase();
    const isDarkText = fill === '#000000' || fill === '#1a1a1a' || fill === 'black';
    
    let fixed = applyContrastFix(l, bg, underlyingFill);
    
    // Special case: colored text on light background needs a subtle shadow
    if (bg === 'light' && !isDarkText && !l.textShadow && !underlyingFill) {
      fixed = { ...fixed, textShadow: '0 1px 4px rgba(0,0,0,0.4)' };
    }
    
    if (fixed !== l) {
      layers[i] = fixed;
      changes.push(`Text ${i}: applied ${underlyingFill ? 'local' : 'global'} contrast fix`);
    }
  }

  // ── PASS 8: Composition-Aware Layout Adaptation ─────────────────────────
  // Nudges text panels and overlay opacity to better fit the image composition.
  // Rules:
  //   - negativeSpaceZone 'top'    → push bottom-anchored panels DOWN (closer to bottom), or top panels up
  //   - negativeSpaceZone 'bottom' → bottom panels get a slight upward nudge
  //   - negativeSpaceZone 'left'   → left-anchored panels shift left (more room)
  //   - negativeSpaceZone 'right'  → right-anchored panels shift right
  //   - backgroundBrightness dark  → reduce full-canvas scrim opacity slightly
  //   - backgroundBrightness light → slightly increase scrim opacity for readability
  // MAX SHIFT: 80px in any direction (personality preservation constraint)
  {
    const negSpace = (imageAnalysis as any)?.negativeSpaceZone as string | undefined;
    const subjPos  = (imageAnalysis as any)?.subjectPosition as string | undefined;
    const MAX_NUDGE = 80;

    if (negSpace && negSpace !== 'none' && negSpace !== 'center') {
      for (let i = 0; i < layers.length; i++) {
        const l = layers[i];

        // --- Nudge text panels toward negative space ---
        if (isTextPanel(l) && !isFullCanvasScrim(l)) {
          const panelCenterY = l.y + (l.height ?? 200) / 2;
          const panelCenterX = l.x + l.width / 2;
          const isBottomPanel = panelCenterY > CANVAS_H * 0.6;
          const isTopPanel    = panelCenterY < CANVAS_H * 0.4;
          const isLeftPanel   = panelCenterX < CANVAS_W * 0.4;
          const isRightPanel  = panelCenterX > CANVAS_W * 0.6;

          let dy = 0;
          let dx = 0;

          if (negSpace === 'bottom' && isBottomPanel) dy = Math.min(MAX_NUDGE, 40);  // more room below
          if (negSpace === 'top'    && isTopPanel)    dy = -Math.min(MAX_NUDGE, 40); // more room above
          if (negSpace === 'left'   && isLeftPanel)   dx = -Math.min(MAX_NUDGE, 40);
          if (negSpace === 'right'  && isRightPanel)  dx = Math.min(MAX_NUDGE, 40);

          // Subject right → push left-anchored panels left (away from subject)
          if ((subjPos === 'right' || subjPos === 'bottom-right') && isLeftPanel) {
            dx = Math.min(MAX_NUDGE, -20);
          }
          // Subject left → push right-anchored panels right
          if ((subjPos === 'left' || subjPos === 'bottom-left') && isRightPanel) {
            dx = Math.min(MAX_NUDGE, 20);
          }

          if (dx !== 0 || dy !== 0) {
            const newX = Math.max(0, Math.min(CANVAS_W - l.width, l.x + dx));
            const newY = Math.max(0, Math.min(CANVAS_H - (l.height ?? 200), l.y + dy));
            if (newX !== l.x || newY !== l.y) {
              layers[i] = { ...l, x: newX, y: newY };
              changes.push(`Panel ${i}: nudged toward negative space '${negSpace}' by (dx=${dx},dy=${dy})`);
            }
          }
        }

        // --- Adapt overlay scrim opacity to background brightness ---
        if (isFullCanvasScrim(l)) {
          const currentOpacity = l.opacity ?? 1;
          let targetOpacity = currentOpacity;

          if (bg === 'dark') {
            // Dark bg → scrim less needed, reduce opacity slightly
            targetOpacity = Math.max(0.40, currentOpacity - 0.10);
          } else if (bg === 'light') {
            // Light bg → scrim more needed for text readability
            targetOpacity = Math.min(0.85, currentOpacity + 0.10);
          }

          if (Math.abs(targetOpacity - currentOpacity) > 0.01) {
            layers[i] = { ...l, opacity: targetOpacity };
            changes.push(`Scrim ${i}: opacity adapted ${currentOpacity.toFixed(2)}→${targetOpacity.toFixed(2)} (bg=${bg})`);
          }
        }
      }
    }
  }

  // ── PASS 9: Logo Guard ──────────────────────────────────────────────────
  // Ensures brand logo is in a safe corner (top-right or top-left) and visible
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (l.type === 'image' && (l.src?.includes('logo') || l.role === 'logo')) {
      let changed = false;
      let { x, y, width, height } = l;
      const w = width || 150;
      const h = height || 50;

      // Force to top corners if it's wandering or obscured
      if (y > 300) { y = 60; changed = true; }
      if (x > 200 && x < 800) { x = CANVAS_W - w - 60; changed = true; }

      if (changed) {
        layers[i] = { ...l, x, y, width: w, height: h };
        changes.push(`Logo ${i}: guarded to safe corner`);
      }
    }
  }




  return { layers, changes };
}
