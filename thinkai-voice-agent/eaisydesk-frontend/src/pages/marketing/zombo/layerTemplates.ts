/**
 * Shared layer template definitions - 45 templates.
 * Each template has a meta field used by the AI for intelligent template selection.
 * v2 – smart scrimFill luminosity guard added.
 */

export interface LayerChild {
  type: 'text' | 'image' | 'figure';
  role?: 'headline' | 'subtitle' | 'cta' | 'badge' | 'kicker' | 'countdown' | 'decoration' | 'logo';
  x: number; y: number; width: number; height?: number;
  opacity?: number;
  visible?: boolean;
  text?: string; fontSize?: number; fontFamily?: string; fontWeight?: string;
  align?: string; fill?: string; textShadow?: string; lineHeight?: number;
  src?: string; url?: string; filter?: string;
  subType?: 'rect' | 'circle'; cornerRadius?: number; border?: string; shadow?: string;
  keepBrandColor?: boolean;
}

export interface LayerTemplateMeta {
  bestFor: string[];
  avoidFor: string[];
  headlineMaxChars: number;
  bodyMaxChars: number;
  ctaMaxChars: number;
  textZone: 'top' | 'bottom' | 'center' | 'full' | 'corner' | 'overlay';
  productSafeZone: 'center' | 'top' | 'bottom' | 'top-half' | 'full' | 'none' | 'right';
  backgroundType: 'light' | 'dark' | 'any';
  imageComposition: Array<'product-centered' | 'portrait' | 'landscape' | 'abstract' | 'scene' | 'any' | 'product-right'>;
  aiHint: string;
}

export interface LayerTemplate {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  meta: LayerTemplateMeta;
  layers: LayerChild[];
}

export function buildLayerTemplates(
  primary: string,
  accent: string,
  font: string,
  contrastTextColor?: string
): LayerTemplate[] {
  const textColor = (defaultColor: string) => {
    if (!contrastTextColor) return defaultColor;
    const lower = defaultColor.toLowerCase();
    // If we have a contrastTextColor (the 'dark' color from brand kit),
    // and the template asks for white, we return white (normalization will flip if needed).
    // Actually, the intent of contrastTextColor in this codebase is usually the "brand dark" color.
    return defaultColor;
  };
  
  // NOTE: layerNormalizer now handles dynamic flipping, so we keep templates "ideal"
  // but we remove hardcoded hex where possible to use brand constants.

  // ── Smart scrim: if primary is too light, use a dark overlay instead ──────
  // Luminosity check: parse hex, compute perceived brightness
  const hexToLuminosity = (hex: string): number => {
    const clean = hex.replace('#', '');
    if (clean.length < 6) return 0.5;
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const primaryLum = primary.startsWith('#') ? hexToLuminosity(primary) : 0.5;
  // If primary is light (lum > 0.45), scrim should be dark — use accent darkened or #0f0f1a
  const scrimFill = primaryLum > 0.45 ? '#0f0f1a' : primary;
  // For gradient scrims: use primary if dark, else use dark fallback
  const gradientPrimary = primaryLum > 0.45 ? '#0f0f1a' : primary;

  return [
    {
      id: 'bold-headline', name: 'Bold Headline', emoji: '\uD83D\uDD25', desc: 'Nagy cim alul, gradient',
      meta: { bestFor: ['promocio','akcio','termek bevezetes','szezonalis kampany'], avoidFor: ['feher hatter','csoportkep'], headlineMaxChars: 30, bodyMaxChars: 0, ctaMaxChars: 0, textZone: 'bottom', productSafeZone: 'top', backgroundType: 'dark', imageComposition: ['product-centered','scene','landscape'], aiHint: 'Use for dramatic product shots with dark backgrounds; headline in lower third.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 700, width: 1080, height: 650, fill: `linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.80) 50%, transparent 100%)`, opacity: 1 },
        { type: 'text', role: 'kicker', text: '', x: 108, y: 820, width: 864, fontSize: 32, fontFamily: font, fontWeight: '700', align: 'left', fill: accent, opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 880, width: 864, fontSize: 96, fontFamily: font, fontWeight: '900', align: 'left', fill: textColor('#ffffff'), opacity: 1, textShadow: '0 4px 24px rgba(0,0,0,0.8)', lineHeight: 1.1 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 108, y: 1100, width: 280, height: 6, fill: accent, opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 108, y: 1180, width: 340, height: 80, fill: accent, opacity: 1, cornerRadius: 40 },
        { type: 'text', role: 'cta', text: '', x: 120, y: 1200, width: 316, fontSize: 28, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#111111'), opacity: 1 },
      ],
    },
    {
      id: 'left-column', name: 'Left Column', emoji: '\uD83D\uDCDD', desc: 'Szöveg balra, termék jobbra',
      meta: { bestFor: ['termekleiras','hosszu szoveg','prezentacio'], avoidFor: ['kozepre igazitott termek'], headlineMaxChars: 15, bodyMaxChars: 60, ctaMaxChars: 15, textZone: 'full', productSafeZone: 'right', backgroundType: 'any', imageComposition: ['product-right','any'], aiHint: 'Best for images where the main product is on the right side. Headline is large, body text below it.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 600, height: 1350, fill: 'linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.60) 60%, transparent 100%)', opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 300, width: 440, fontSize: 88, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 520, width: 440, fontSize: 32, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.8)', opacity: 1 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 108, y: 580, width: 120, height: 4, fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 108, y: 950, width: 340, height: 80, fill: accent, opacity: 1, cornerRadius: 40 },
        { type: 'text', role: 'cta', text: '', x: 120, y: 970, width: 316, fontSize: 28, fontFamily: font, fontWeight: '800', align: 'center', fill: '#111111', opacity: 1 },
      ],
    },
    {
      id: 'center-circle-promo', name: 'Center Circle', emoji: '\uD83C\uDFAF', desc: 'Prémium kör badge középen',
      meta: { bestFor: ['akcio','flash sale','nagy kedvezmeny'], avoidFor: ['fontos reszlet kozepen'], headlineMaxChars: 6, bodyMaxChars: 20, ctaMaxChars: 15, textZone: 'center', productSafeZone: 'none', backgroundType: 'any', imageComposition: ['abstract','scene','any'], aiHint: 'High-impact central badge. Use for short, powerful hooks (e.g. 50%, SALE). Circle radius is large — up to 2 lines of subtitle fit.' },
      layers: [
        // Full-canvas dark scrim
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.45)', opacity: 1 },
        // Large circle badge — centered at (540, 540), radius 350 → x=190, y=190, w=700, h=700
        { type: 'figure', subType: 'circle', x: 190, y: 190, width: 700, height: 700, fill: primary, opacity: 0.95, border: `10px solid ${accent}`, shadow: '0 20px 60px rgba(0,0,0,0.6)' },
        // Headline (big number/word): centered inside circle top third
        // Circle center Y = 190 + 350 = 540. Inscribed usable from y≈290 to y≈790.
        { type: 'text', role: 'headline', text: '', x: 240, y: 290, width: 600, fontSize: 200, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1, lineHeight: 1.0, textShadow: '0 4px 16px rgba(0,0,0,0.35)' },
        // Subtitle: below headline, still inside circle
        { type: 'text', role: 'subtitle', text: '', x: 250, y: 520, width: 580, fontSize: 46, fontFamily: font, fontWeight: '700', align: 'center', fill: accent, opacity: 1, lineHeight: 1.25, textShadow: '0 2px 8px rgba(0,0,0,0.4)' },
        // CTA button: below the circle (circle bottom = 190+700 = 890), placed at y=940
        { type: 'figure', subType: 'rect', x: 290, y: 940, width: 500, height: 96, fill: '#ffffff', opacity: 1, cornerRadius: 48 },
        { type: 'text', role: 'cta', text: '', x: 302, y: 963, width: 476, fontSize: 34, fontFamily: font, fontWeight: '800', align: 'center', fill: primary, opacity: 1 },
      ],
    },
    {
      id: 'product-callout', name: 'Termek Kiemelő', emoji: '\uD83C\uDFF7\uFE0F', desc: 'Ar + badge + CTA gomb',
      meta: { bestFor: ['termekfoto','arkozles','vasarlasi CTA','ecommerce'], avoidFor: ['szoveges tartalom','logo-only kep'], headlineMaxChars: 20, bodyMaxChars: 0, ctaMaxChars: 14, textZone: 'bottom', productSafeZone: 'center', backgroundType: 'any', imageComposition: ['product-centered','any'], aiHint: 'Best for single product images with a clear price and CTA.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.35)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 108, y: 108, width: 220, height: 64, fill: accent, opacity: 1, cornerRadius: 8 },
        { type: 'text', role: 'badge', text: '', x: 120, y: 127, width: 196, fontSize: 30, fontFamily: font, fontWeight: '800', align: 'center', fill: '#111111', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 720, width: 1080, height: 630, fill: 'linear-gradient(to top, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.35) 70%, transparent 100%)', opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 780, width: 864, fontSize: 110, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, textShadow: '0 4px 20px rgba(0,0,0,0.9)', lineHeight: 1.1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 1050, width: 400, fontSize: 72, fontFamily: font, fontWeight: '800', align: 'left', fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 108, y: 1200, width: 380, height: 82, fill: accent, opacity: 1, cornerRadius: 41 },
        { type: 'text', role: 'cta', text: '', x: 120, y: 1218, width: 356, fontSize: 28, fontFamily: font, fontWeight: '800', align: 'center', fill: '#111111', opacity: 1 },
      ],
    },
    {
      id: 'promo-badge', name: 'Akcio Badge', emoji: '🏅', desc: 'Nagy % kedvezmeny kozepen',
      meta: { bestFor: ['kedvezmeny','szazalekos akcio','kiarusitas'], avoidFor: ['termekfoto-centrikus','szoveges tartalom'], headlineMaxChars: 4, bodyMaxChars: 15, ctaMaxChars: 15, textZone: 'center', productSafeZone: 'none', backgroundType: 'any', imageComposition: ['abstract','scene','any'], aiHint: 'Use when the main message is a large percentage discount. The primary headline takes the number+symbol (e.g. "50%").' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: scrimFill, opacity: 0.55 },
        { type: 'figure', subType: 'circle', x: 190, y: 240, width: 700, height: 700, fill: accent, opacity: 0.95, border: '12px solid #ffffff', shadow: '0 20px 50px rgba(0,0,0,0.3)' },
        { type: 'text', role: 'headline', text: '', x: 190, y: 440, width: 700, fontSize: 240, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1, lineHeight: 1.0, textShadow: '0 4px 20px rgba(0,0,0,0.3)' },
        { type: 'text', role: 'subtitle', text: '', x: 190, y: 720, width: 700, fontSize: 80, fontFamily: font, fontWeight: '800', align: 'center', fill: '#ffffff', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 250, y: 820, width: 580, height: 2, fill: 'rgba(255,255,255,0.4)', opacity: 1 },
        { type: 'text', role: 'badge', text: '', x: 190, y: 850, width: 700, fontSize: 48, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.9)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 290, y: 1030, width: 500, height: 88, fill: '#ffffff', opacity: 1, cornerRadius: 44 },
        { type: 'text', role: 'cta', text: '', x: 300, y: 1050, width: 480, fontSize: 36, fontFamily: font, fontWeight: '800', align: 'center', fill: accent, opacity: 1 },
      ],
    },
    {
      id: 'split-card', name: 'Split Card', emoji: '\uD83C\uDCCF', desc: 'Feher kartya szovegekkel alul',
      meta: { bestFor: ['termek leiras','hosszabb szoveg','premium brand'], avoidFor: ['csak szam/% uzenet'], headlineMaxChars: 25, bodyMaxChars: 70, ctaMaxChars: 20, textZone: 'bottom', productSafeZone: 'top', backgroundType: 'any', imageComposition: ['product-centered','portrait','any'], aiHint: 'Use when the prompt has both a headline and a descriptive body text.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 820, width: 1080, height: 530, fill: '#ffffff', opacity: 0.92 },
        { type: 'figure', subType: 'rect', x: 60, y: 858, width: 8, height: 60, fill: accent, opacity: 1 },
        { type: 'text', role: 'kicker', text: '', x: 108, y: 858, width: 864, fontSize: 22, fontFamily: font, fontWeight: '700', align: 'left', fill: accent, opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 920, width: 864, fontSize: 84, fontFamily: font, fontWeight: '900', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 1120, width: 864, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'left', fill: '#555555', opacity: 1, lineHeight: 1.5 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 108, y: 1220, width: 380, height: 80, fill: primary, opacity: 1, cornerRadius: 40 },
        { type: 'text', role: 'cta', text: '', x: 120, y: 1240, width: 356, fontSize: 28, fontFamily: font, fontWeight: '800', align: 'center', fill: '#ffffff', opacity: 1 },
      ],
    },
    {
      id: 'luxury-dark', name: 'Luxury Dark', emoji: '\u2728', desc: 'Sotet overlay + arany elemek',
      meta: { bestFor: ['luxus termek','premium brand','ekszer','parfum'], avoidFor: ['sportos tartalom','akciaras uzenet'], headlineMaxChars: 20, bodyMaxChars: 60, ctaMaxChars: 12, textZone: 'center', productSafeZone: 'center', backgroundType: 'dark', imageComposition: ['product-centered','portrait','abstract'], aiHint: 'Use for premium/luxury products; dark overlay and gold frame.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: scrimFill, opacity: 0.85 },
        { type: 'figure', subType: 'rect', x: 55, y: 55, width: 970, height: 1240, fill: 'transparent', opacity: 1, border: `1px solid ${accent}55`, cornerRadius: 4 },
        { type: 'text', role: 'kicker', text: '', x: 108, y: 190, width: 864, fontSize: 22, fontFamily: 'Playfair Display', fontWeight: '400', align: 'center', fill: accent, opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 450, width: 864, fontSize: 130, fontFamily: 'Playfair Display', fontWeight: '700', align: 'center', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.1 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 440, y: 790, width: 200, height: 2, fill: accent, opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 830, width: 864, fontSize: 30, fontFamily: 'Playfair Display', fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.65)', opacity: 1, lineHeight: 1.6 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 390, y: 1100, width: 300, height: 70, fill: 'transparent', opacity: 1, border: `1px solid ${accent}`, cornerRadius: 35 },
        { type: 'text', role: 'cta', text: '', x: 400, y: 1118, width: 280, fontSize: 26, fontFamily: font, fontWeight: '600', align: 'center', fill: accent, opacity: 1 },
      ],
    },
    {
      id: 'neo-brutal', name: 'Neo-Brutalist', emoji: '\u2B1B', desc: 'Vastag border + kontrasztos blokkok',
      meta: { bestFor: ['fiatalos brand','tech termek','streetwear'], avoidFor: ['luxus','termeszetes termek'], headlineMaxChars: 25, bodyMaxChars: 0, ctaMaxChars: 35, textZone: 'center', productSafeZone: 'center', backgroundType: 'any', imageComposition: ['product-centered','abstract','any'], aiHint: 'Use for bold youthful brands; heavy contrast with thick border.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.55)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 40, y: 40, width: 1000, height: 1270, fill: 'transparent', opacity: 1, border: '6px solid #ffffff' },
        { type: 'figure', subType: 'rect', x: 40, y: 40, width: 460, height: 200, fill: '#ffffff', opacity: 1 },
        { type: 'text', role: 'kicker', text: '', x: 54, y: 55, width: 432, fontSize: 70, fontFamily: font, fontWeight: '900', align: 'left', fill: '#000000', opacity: 1, lineHeight: 1.05 },
        { type: 'figure', subType: 'rect', x: 500, y: 40, width: 540, height: 200, fill: accent, opacity: 1 },
        { type: 'text', role: 'badge', text: '', x: 510, y: 88, width: 520, fontSize: 96, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#000000'), opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 880, width: 864, fontSize: 72, fontFamily: font, fontWeight: '800', align: 'left', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.2 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 40, y: 1215, width: 1000, height: 95, fill: '#ffffff', opacity: 1 },
        { type: 'text', role: 'cta', text: '', x: 50, y: 1238, width: 980, fontSize: 34, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
      ],
    },
    {
      id: 'kicker-title', name: 'Kicker + Cim', emoji: '\uD83D\uDCAC', desc: 'Kis badge fent + nagy cim',
      meta: { bestFor: ['bejelentes','launch','szoveges focim'], avoidFor: ['ar kiemeles','akcio szazalek'], headlineMaxChars: 25, bodyMaxChars: 55, ctaMaxChars: 0, textZone: 'center', productSafeZone: 'bottom', backgroundType: 'any', imageComposition: ['scene','portrait','landscape','any'], aiHint: 'Use when the headline is the main message in 3-4 words.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: scrimFill, opacity: 0.52 },
        { type: 'figure', subType: 'rect', x: 60, y: 190, width: 290, height: 58, fill: accent, opacity: 1, cornerRadius: 29 },
        { type: 'text', role: 'kicker', text: '', x: 72, y: 207, width: 266, fontSize: 24, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 315, width: 864, fontSize: 120, fontFamily: font, fontWeight: '900', align: 'left', fill: textColor('#ffffff'), opacity: 1, textShadow: '0 8px 32px rgba(0,0,0,0.5)', lineHeight: 1.0 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 60, y: 700, width: 100, height: 4, fill: '#ffffff', opacity: 0.45 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 745, width: 800, fontSize: 34, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.78)', opacity: 1, lineHeight: 1.5 },
      ],
    },
    {
      id: 'testimonial-layer', name: 'Velemeny', emoji: '\u2B50', desc: 'Idezet + csillagok + nevjegy',
      meta: { bestFor: ['vasarloi velemeny','review','social proof','idezet'], avoidFor: ['termek promocio','akcio'], headlineMaxChars: 0, bodyMaxChars: 100, ctaMaxChars: 0, textZone: 'center', productSafeZone: 'none', backgroundType: 'any', imageComposition: ['portrait','abstract','any'], aiHint: 'Use for testimonials and social proof posts.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: scrimFill, opacity: 0.62 },
        { type: 'figure', subType: 'circle', x: -150, y: -150, width: 600, height: 600, fill: accent, opacity: 0.07 },
        { type: 'figure', subType: 'circle', x: 630, y: 900, width: 600, height: 600, fill: accent, opacity: 0.07 },
        { type: 'text', text: '\u2605 \u2605 \u2605 \u2605 \u2605', x: 108, y: 280, width: 864, fontSize: 56, fontFamily: font, fontWeight: '400', align: 'center', fill: accent, opacity: 1 },
        { type: 'text', text: '\u201c', x: 70, y: 380, width: 180, fontSize: 220, fontFamily: 'Playfair Display', fontWeight: '700', align: 'left', fill: accent, opacity: 0.35 },
        { type: 'text', text: '', x: 108, y: 490, width: 864, fontSize: 54, fontFamily: 'Playfair Display', fontWeight: '400', align: 'center', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.5 },
        { type: 'figure', subType: 'rect', x: 440, y: 990, width: 200, height: 2, fill: accent, opacity: 0.55 },
        { type: 'text', text: '', x: 108, y: 1030, width: 864, fontSize: 36, fontFamily: font, fontWeight: '700', align: 'center', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'text', text: '', x: 108, y: 1082, width: 864, fontSize: 26, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.5)', opacity: 1 },
      ],
    },
    {
      id: 'minimal-brand', name: 'Minimal Brand', emoji: '\u25CE', desc: 'Brand szin sav alul',
      meta: { bestFor: ['brand awareness','product photo showcase','minimal stilus'], avoidFor: ['szoveges tartalom','akcio'], headlineMaxChars: 20, bodyMaxChars: 0, ctaMaxChars: 0, textZone: 'bottom', productSafeZone: 'full', backgroundType: 'any', imageComposition: ['product-centered','portrait','landscape','any'], aiHint: 'Use when the photo should be the hero and only minimal brand info is needed.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.12)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 1280, width: 1080, height: 70, fill: scrimFill, opacity: 0.88 },
        { type: 'figure', subType: 'rect', x: 0, y: 1280, width: 1080, height: 4, fill: accent, opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 60, width: 700, fontSize: 40, fontFamily: font, fontWeight: '800', align: 'left', fill: textColor('#ffffff'), opacity: 1, textShadow: '0 2px 12px rgba(0,0,0,0.6)' },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 60, y: 116, width: 60, height: 4, fill: accent, opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 1296, width: 864, fontSize: 28, fontFamily: font, fontWeight: '600', align: 'center', fill: 'rgba(255,255,255,0.85)', opacity: 1 },
      ],
    },
    {
      id: 'story-cta', name: 'Story CTA', emoji: '\uD83D\uDC46', desc: 'Swipe up nyil + CTA szoveg',
      meta: { bestFor: ['instagram story','story link','CTA-fokuszos poszt'], avoidFor: ['feed poszt','szoveges tartalom'], headlineMaxChars: 0, bodyMaxChars: 30, ctaMaxChars: 0, textZone: 'bottom', productSafeZone: 'top', backgroundType: 'any', imageComposition: ['product-centered','portrait','scene','any'], aiHint: 'Use for Story-type posts where swipe-up CTA is needed at bottom.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 1080, width: 1080, height: 270, fill: 'linear-gradient(to top, rgba(0,0,0,0.88), transparent)', opacity: 1 },
        { type: 'text', role: 'decoration', text: '^', x: 490, y: 1090, width: 100, fontSize: 72, fontFamily: font, fontWeight: '300', align: 'center', fill: textColor('#ffffff'), opacity: 0.85 },
        { type: 'text', role: 'cta', text: '', x: 290, y: 1190, width: 500, fontSize: 38, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 190, y: 1258, width: 700, fontSize: 26, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 60, y: 60, width: 210, height: 62, fill: accent, opacity: 1, cornerRadius: 31 },
        { type: 'text', role: 'badge', text: '', x: 70, y: 78, width: 190, fontSize: 26, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
      ],
    },
    {
      id: 'countdown-launch', name: 'Countdown', emoji: '\u23F0', desc: 'Visszaszamlalo hamarosan',
      meta: { bestFor: ['termek launch','hamarosan','visszaszamlalo'], avoidFor: ['azonnali vasarlas','akcio'], headlineMaxChars: 25, bodyMaxChars: 40, ctaMaxChars: 16, textZone: 'center', productSafeZone: 'none', backgroundType: 'dark', imageComposition: ['abstract','scene','any'], aiHint: 'Use for coming soon announcements; countdown timer slots are the focus.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: `linear-gradient(160deg, ${gradientPrimary} 0%, #0f0f1a 100%)`, opacity: 0.93 },
        { type: 'text', role: 'kicker', text: '', x: 108, y: 120, width: 864, fontSize: 36, fontFamily: font, fontWeight: '800', align: 'center', fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 185, width: 960, height: 2, fill: accent, opacity: 0.3 },
        { type: 'text', role: 'countdown', text: '03', x: 100, y: 380, width: 200, fontSize: 160, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'decoration', text: 'NAP', x: 100, y: 560, width: 200, fontSize: 24, fontFamily: font, fontWeight: '700', align: 'center', fill: accent, opacity: 1 },
        { type: 'text', role: 'countdown', text: '14', x: 340, y: 380, width: 200, fontSize: 160, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'decoration', text: 'ORA', x: 340, y: 560, width: 200, fontSize: 24, fontFamily: font, fontWeight: '700', align: 'center', fill: accent, opacity: 1 },
        { type: 'text', role: 'countdown', text: '22', x: 580, y: 380, width: 200, fontSize: 160, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'decoration', text: 'PERC', x: 580, y: 560, width: 200, fontSize: 24, fontFamily: font, fontWeight: '700', align: 'center', fill: accent, opacity: 1 },
        { type: 'text', role: 'countdown', text: '07', x: 820, y: 380, width: 200, fontSize: 160, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'decoration', text: 'MP', x: 820, y: 560, width: 200, fontSize: 24, fontFamily: font, fontWeight: '700', align: 'center', fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 620, width: 960, height: 2, fill: 'rgba(255,255,255,0.1)', opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 680, width: 864, fontSize: 80, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 820, width: 864, fontSize: 32, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 190, y: 920, width: 700, height: 80, fill: accent, opacity: 1, cornerRadius: 40 },
        { type: 'text', role: 'cta', text: '', x: 202, y: 938, width: 676, fontSize: 30, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
      ],
    },
    {
      id: 'new-arrival', name: 'New Arrival', emoji: '\uD83D\uDCE6', desc: 'Uj termek erkezesi banner',
      meta: { bestFor: ['uj termek','erkezes','kollekcio','new arrival'], avoidFor: ['akcio'], headlineMaxChars: 60, bodyMaxChars: 60, ctaMaxChars: 10, textZone: 'full', productSafeZone: 'center', backgroundType: 'any', imageComposition: ['product-centered','any'], aiHint: 'Use for new product arrival announcements.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 420, fill: '#ffffff', opacity: 0.97 },
        { type: 'text', role: 'kicker', text: '', x: 108, y: 60, width: 580, fontSize: 200, fontFamily: font, fontWeight: '900', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 240, width: 800, fontSize: 130, fontFamily: font, fontWeight: '900', align: 'left', fill: accent, opacity: 1, lineHeight: 1.0 },
        { type: 'figure', subType: 'rect', x: 0, y: 420, width: 1080, height: 6, fill: primary, opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 800, width: 864, fontSize: 28, fontFamily: font, fontWeight: '700', align: 'left', fill: textColor('#ffffff'), opacity: 0.5 },
        { type: 'text', role: 'badge', text: '', x: 108, y: 860, width: 800, fontSize: 40, fontFamily: font, fontWeight: '400', align: 'left', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.4 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 60, y: 1060, width: 320, height: 78, fill: '#ffffff', opacity: 1, cornerRadius: 39 },
        { type: 'text', role: 'cta', text: '', x: 70, y: 1078, width: 300, fontSize: 30, fontFamily: font, fontWeight: '800', align: 'center', fill: primary, opacity: 1 },
      ],
    },
    {
      id: 'event-invite', name: 'Event Meghivo', emoji: '\uD83D\uDCC5', desc: 'Esemeny meghivo kartya',
      meta: { bestFor: ['esemeny','meghivo','nyilt nap','konferencia'], avoidFor: ['termek promocio','akcio banner'], headlineMaxChars: 20, bodyMaxChars: 0, ctaMaxChars: 14, textZone: 'full', productSafeZone: 'none', backgroundType: 'any', imageComposition: ['scene','abstract','any'], aiHint: 'Use for event announcements; accent block shows date, body shows title.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: scrimFill, opacity: 0.65 },
        { type: 'figure', subType: 'rect', x: 80, y: 80, width: 920, height: 1190, fill: 'transparent', opacity: 1, border: '1px solid rgba(255,255,255,0.15)', cornerRadius: 12 },
        { type: 'figure', subType: 'rect', x: 80, y: 80, width: 920, height: 280, fill: accent, opacity: 1, cornerRadius: 12 },
        { type: 'figure', subType: 'rect', x: 80, y: 280, width: 920, height: 12, fill: 'rgba(0,0,0,0.1)', opacity: 1 },
        { type: 'text', role: 'kicker', text: '', x: 108, y: 90, width: 920, fontSize: 36, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
        { type: 'text', role: 'badge', text: '', x: 108, y: 140, width: 920, fontSize: 140, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#000000'), opacity: 0.9, lineHeight: 1.0 },
        { type: 'text', role: 'decoration', text: '', x: 108, y: 320, width: 920, fontSize: 28, fontFamily: font, fontWeight: '700', align: 'center', fill: 'rgba(255,255,255,0.5)', opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 430, width: 864, fontSize: 130, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0 },
        { type: 'figure', subType: 'rect', x: 440, y: 740, width: 200, height: 3, fill: accent, opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 780, width: 920, fontSize: 36, fontFamily: font, fontWeight: '700', align: 'center', fill: accent, opacity: 1 },
        { type: 'text', role: 'badge', text: '', x: 108, y: 840, width: 920, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 190, y: 1000, width: 700, height: 80, fill: accent, opacity: 1, cornerRadius: 40 },
        { type: 'text', role: 'cta', text: 'REGISZTRACIO', x: 202, y: 1018, width: 676, fontSize: 32, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
      ],
    },
    {
      id: 'food-recipe', name: 'Etlap / Recept', emoji: '\uD83C\uDF7D\uFE0F', desc: 'Etel bemutatasa',
      meta: { bestFor: ['etel','recept','etterem','cafe'], avoidFor: ['tech termek','ruha'], headlineMaxChars: 20, bodyMaxChars: 60, ctaMaxChars: 0, textZone: 'bottom', productSafeZone: 'top', backgroundType: 'light', imageComposition: ['product-centered','landscape'], aiHint: 'Use for food content; light card at bottom.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 800, width: 1080, height: 550, fill: '#fefce8', opacity: 0.94 },
        { type: 'figure', subType: 'rect', x: 0, y: 797, width: 1080, height: 6, fill: primary, opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 60, y: 835, width: 160, height: 44, fill: primary, opacity: 1, cornerRadius: 22 },
        { type: 'text', role: 'cta', text: '', x: 68, y: 847, width: 144, fontSize: 20, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 900, width: 864, fontSize: 110, fontFamily: 'Playfair Display', fontWeight: '700', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 1010, width: 864, fontSize: 110, fontFamily: 'Playfair Display', fontWeight: '700', align: 'left', fill: '#f59e0b', opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'decoration', text: '', x: 108, y: 1150, width: 750, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'left', fill: '#555555', opacity: 1, lineHeight: 1.4 },
        { type: 'text', role: 'badge', text: '', x: 800, y: 1200, width: 220, fontSize: 36, fontFamily: font, fontWeight: '800', align: 'right', fill: '#111111', opacity: 1 },
      ],
    },
    {
      id: 'fitness-motivation', name: 'Fitness Motivacio', emoji: '\uD83D\uDCAA', desc: 'Motivaló sportos kep',
      meta: { bestFor: ['sport','fitness','edzes','motivacio'], avoidFor: ['luxus','etel'], headlineMaxChars: 15, bodyMaxChars: 60, ctaMaxChars: 18, textZone: 'center', productSafeZone: 'none', backgroundType: 'dark', imageComposition: ['portrait','scene','any'], aiHint: 'Use for fitness content; dark overlay with motivational quote.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.6)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 8, height: 1350, fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 1072, y: 0, width: 8, height: 1350, fill: accent, opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 300, width: 864, fontSize: 120, fontFamily: font, fontWeight: '900', align: 'left', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0, textShadow: '0 4px 20px rgba(0,0,0,0.8)' },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 540, width: 864, fontSize: 44, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.75)', opacity: 1, lineHeight: 1.5 },
        { type: 'figure', subType: 'rect', x: 60, y: 720, width: 200, height: 5, fill: accent, opacity: 1 },
        { type: 'text', role: 'kicker', text: '', x: 108, y: 760, width: 700, fontSize: 28, fontFamily: font, fontWeight: '700', align: 'left', fill: accent, opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 60, y: 1200, width: 380, height: 80, fill: accent, opacity: 1, cornerRadius: 40 },
        { type: 'text', role: 'cta', text: '', x: 72, y: 1218, width: 356, fontSize: 30, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
      ],
    },
    {
      id: 'real-estate', name: 'Ingatlan', emoji: '\uD83C\uDFE0', desc: 'Ingatlan hirdetes kartya',
      meta: { bestFor: ['ingatlan','elado','kiado','lakas'], avoidFor: ['termek','etel'], headlineMaxChars: 40, bodyMaxChars: 50, ctaMaxChars: 0, textZone: 'bottom', productSafeZone: 'top', backgroundType: 'any', imageComposition: ['landscape','scene','any'], aiHint: 'Use for real estate listings; dark lower card shows property details.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 900, width: 1080, height: 450, fill: primary, opacity: 0.92 },
        { type: 'figure', subType: 'rect', x: 0, y: 897, width: 1080, height: 6, fill: accent, opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 60, y: 935, width: 240, height: 56, fill: accent, opacity: 1, cornerRadius: 4 },
        { type: 'text', role: 'cta', text: '', x: 70, y: 950, width: 220, fontSize: 26, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 1010, width: 800, fontSize: 64, fontFamily: 'Playfair Display', fontWeight: '700', align: 'left', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 1190, width: 800, fontSize: 26, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
        { type: 'text', role: 'badge', text: '', x: 680, y: 940, width: 360, fontSize: 40, fontFamily: font, fontWeight: '900', align: 'right', fill: accent, opacity: 1 },
        { type: 'text', role: 'kicker', text: '', x: 108, y: 1260, width: 864, fontSize: 22, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.4)', opacity: 1 },
      ],
    },
    {
      id: 'music-release', name: 'Zenemuveszet', emoji: '\uD83C\uDFB5', desc: 'Album / szam kiadas',
      meta: { bestFor: ['zene','album','single release','zenész'], avoidFor: ['termek','etel'], headlineMaxChars: 25, bodyMaxChars: 30, ctaMaxChars: 35, textZone: 'bottom', productSafeZone: 'center', backgroundType: 'dark', imageComposition: ['portrait','abstract','any'], aiHint: 'Use for music releases; concentric circles create a vinyl-record feel.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: `linear-gradient(145deg, #0a0010 0%, ${gradientPrimary} 50%, #0a0010 100%)`, opacity: 0.88 },
        { type: 'figure', subType: 'circle', x: 190, y: 175, width: 700, height: 700, fill: accent, opacity: 0.06 },
        { type: 'figure', subType: 'circle', x: 290, y: 275, width: 500, height: 500, fill: accent, opacity: 0.1 },
        { type: 'figure', subType: 'circle', x: 390, y: 375, width: 300, height: 300, fill: accent, opacity: 0.18 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 950, width: 864, fontSize: 96, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 1140, width: 864, fontSize: 30, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.5)', opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 60, y: 1220, width: 960, height: 60, fill: 'transparent', opacity: 1, border: `1px solid ${accent}66`, cornerRadius: 30 },
        { type: 'text', role: 'cta', text: '', x: 70, y: 1238, width: 940, fontSize: 26, fontFamily: font, fontWeight: '600', align: 'center', fill: accent, opacity: 1 },
      ],
    },
    {
      id: 'webinar', name: 'Webinar', emoji: '\uD83D\uDDA5\uFE0F', desc: 'Online esemeny bejelentes',
      meta: { bestFor: ['webinar','online esemeny','oktatas','kepzes'], avoidFor: ['termek','akcio'], headlineMaxChars: 20, bodyMaxChars: 50, ctaMaxChars: 18, textZone: 'full', productSafeZone: 'none', backgroundType: 'any', imageComposition: ['portrait','abstract','any'], aiHint: 'Use for online events; LIVE badge, title, date/time and CTA.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: scrimFill, opacity: 0.65 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 440, fill: 'rgba(255,255,255,0.04)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 60, width: 200, height: 56, fill: '#ef4444', opacity: 1, cornerRadius: 28 },
        { type: 'text', role: 'decoration', text: 'LIVE', x: 72, y: 76, width: 176, fontSize: 28, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 160, width: 864, fontSize: 120, fontFamily: font, fontWeight: '900', align: 'left', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0 },
        { type: 'figure', subType: 'rect', x: 60, y: 450, width: 960, height: 2, fill: 'rgba(255,255,255,0.1)', opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 500, width: 864, fontSize: 54, fontFamily: font, fontWeight: '700', align: 'left', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.3 },
        { type: 'text', role: 'badge', text: '', x: 108, y: 720, width: 864, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.55)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 810, width: 480, height: 80, fill: 'rgba(255,255,255,0.08)', opacity: 1, cornerRadius: 8, border: '1px solid rgba(255,255,255,0.15)' },
        { type: 'text', role: 'kicker', text: '', x: 72, y: 828, width: 456, fontSize: 28, fontFamily: font, fontWeight: '700', align: 'left', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 60, y: 930, width: 960, height: 88, fill: accent, opacity: 1, cornerRadius: 44 },
        { type: 'text', role: 'cta', text: '', x: 72, y: 950, width: 936, fontSize: 36, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
      ],
    },
    {
      id: 'before-after', name: 'Elotte / Utana', emoji: '\u27BA', desc: 'Elotte - utana osszehasonlitas',
      meta: { bestFor: ['elotte-utana','transzformacio','eredmeny bemutato'], avoidFor: ['szoveges tartalom'], headlineMaxChars: 25, bodyMaxChars: 0, ctaMaxChars: 0, textZone: 'full', productSafeZone: 'none', backgroundType: 'any', imageComposition: ['portrait','product-centered','any'], aiHint: 'Use for before/after transformations; splits canvas vertically.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 540, height: 1350, fill: 'rgba(0,0,0,0.5)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 540, y: 0, width: 540, height: 1350, fill: 'rgba(0,0,0,0.2)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 536, y: 0, width: 8, height: 1350, fill: '#ffffff', opacity: 0.9 },
        { type: 'text', role: 'kicker', text: '', x: 40, y: 80, width: 460, fontSize: 56, fontFamily: font, fontWeight: '900', align: 'left', fill: textColor('#ffffff'), opacity: 0.7 },
        { type: 'text', role: 'badge', text: '', x: 580, y: 80, width: 460, fontSize: 56, fontFamily: font, fontWeight: '900', align: 'left', fill: accent, opacity: 1 },
        { type: 'text', role: 'decoration', text: '', x: 440, y: 640, width: 200, fontSize: 100, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 1180, width: 864, fontSize: 44, fontFamily: font, fontWeight: '700', align: 'center', fill: textColor('#ffffff'), opacity: 1 },
      ],
    },
    {
      id: 'app-showcase', name: 'App Showcase', emoji: '\uD83D\uDCF1', desc: 'Mobil app bemutatasa',
      meta: { bestFor: ['app','szoftver','tech termek','SaaS'], avoidFor: ['fizikai termek','etel'], headlineMaxChars: 25, bodyMaxChars: 40, ctaMaxChars: 10, textZone: 'top', productSafeZone: 'bottom', backgroundType: 'dark', imageComposition: ['product-centered','abstract','any'], aiHint: 'Use for software and app launches; dark gradient with two CTA buttons.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: `linear-gradient(180deg, ${gradientPrimary} 0%, #0f0820 100%)`, opacity: 0.93 },
        { type: 'figure', subType: 'rect', x: 60, y: 60, width: 280, height: 60, fill: 'rgba(255,255,255,0.08)', opacity: 1, cornerRadius: 30, border: '1px solid rgba(255,255,255,0.15)' },
        { type: 'text', role: 'kicker', text: '', x: 70, y: 78, width: 260, fontSize: 22, fontFamily: font, fontWeight: '700', align: 'center', fill: 'rgba(255,255,255,0.7)', opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 180, width: 864, fontSize: 100, fontFamily: font, fontWeight: '900', align: 'left', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 440, width: 864, fontSize: 36, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.55)', opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 60, y: 580, width: 280, height: 72, fill: accent, opacity: 1, cornerRadius: 16 },
        { type: 'text', role: 'cta', text: '', x: 72, y: 598, width: 256, fontSize: 30, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 360, y: 580, width: 280, height: 72, fill: 'transparent', opacity: 1, cornerRadius: 16, border: '2px solid rgba(255,255,255,0.4)' },
        { type: 'text', role: 'cta', text: '', x: 372, y: 598, width: 256, fontSize: 24, fontFamily: font, fontWeight: '600', align: 'center', fill: textColor('#ffffff'), opacity: 1 },
      ],
    },
    {
      id: 'travel', name: 'Utazas', emoji: '\uD83C\uDF0D', desc: 'Utazas / turizmus banner',
      meta: { bestFor: ['utazas','turizmus','nyaralas','szalloda'], avoidFor: ['tech termek','belso ter'], headlineMaxChars: 20, bodyMaxChars: 0, ctaMaxChars: 10, textZone: 'full', productSafeZone: 'center', backgroundType: 'any', imageComposition: ['landscape','scene','any'], aiHint: 'Use for travel and tourism posts; double-gradient with destination name.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.35)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 600, fill: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)', opacity: 1 },
        { type: 'text', role: 'kicker', text: '', x: 108, y: 80, width: 864, fontSize: 28, fontFamily: font, fontWeight: '700', align: 'left', fill: accent, opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 120, width: 864, fontSize: 140, fontFamily: 'Playfair Display', fontWeight: '700', align: 'left', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0, textShadow: '0 4px 24px rgba(0,0,0,0.5)' },
        { type: 'figure', subType: 'rect', x: 60, y: 430, width: 80, height: 4, fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 1050, width: 1080, height: 300, fill: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 1100, width: 500, fontSize: 36, fontFamily: font, fontWeight: '700', align: 'left', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'text', role: 'badge', text: '', x: 108, y: 1155, width: 500, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 720, y: 1095, width: 320, height: 80, fill: accent, opacity: 1, cornerRadius: 40 },
        { type: 'text', role: 'cta', text: '', x: 732, y: 1113, width: 296, fontSize: 30, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
      ],
    },
    {
      id: 'dark-announcement', name: 'Sotet Bejelentes', emoji: '\uD83D\uDCE2', desc: 'Dramai bejelentes sotet hatteren',
      meta: { bestFor: ['bejelentes','teaser','launch elozetes'], avoidFor: ['termek promocio','akcio'], headlineMaxChars: 20, bodyMaxChars: 60, ctaMaxChars: 0, textZone: 'center', productSafeZone: 'none', backgroundType: 'dark', imageComposition: ['abstract','scene','any'], aiHint: 'Use for dramatic announcements; very dark overlay with strong typography.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: '#030303', opacity: 0.88 },
        { type: 'figure', subType: 'circle', x: 190, y: 300, width: 700, height: 600, fill: accent, opacity: 0.06 },
        { type: 'figure', subType: 'rect', x: 60, y: 580, width: 960, height: 1, fill: 'rgba(255,255,255,0.08)', opacity: 1 },
        { type: 'text', role: 'kicker', text: '', x: 108, y: 180, width: 400, fontSize: 22, fontFamily: font, fontWeight: '800', align: 'left', fill: accent, opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 280, width: 864, fontSize: 150, fontFamily: font, fontWeight: '900', align: 'left', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 720, width: 864, fontSize: 36, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.5)', opacity: 1, lineHeight: 1.5 },
        { type: 'figure', subType: 'rect', x: 60, y: 860, width: 4, height: 120, fill: accent, opacity: 1 },
        { type: 'text', role: 'badge', text: '', x: 108, y: 878, width: 864, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.4)', opacity: 1, lineHeight: 1.5 },
      ],
    },
    {
      id: 'flash-sale', name: 'Flash Sale', emoji: '\u26A1', desc: 'Villam akcios banner',
      meta: { bestFor: ['flash sale','villamakcio','azonnali kedvezmeny'], avoidFor: ['premium termek','luxus'], headlineMaxChars: 5, bodyMaxChars: 20, ctaMaxChars: 15, textZone: 'full', productSafeZone: 'none', backgroundType: 'dark', imageComposition: ['abstract','product-centered','any'], aiHint: 'Use for urgent time-limited sales; huge FLASH SALE with large percentage.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: '#111111', opacity: 0.88 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 6, fill: '#ef4444', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 1344, width: 1080, height: 6, fill: '#ef4444', opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 40, y: 120, width: 1000, fontSize: 220, fontFamily: font, fontWeight: '900', align: 'left', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'headline', text: '', x: 40, y: 330, width: 1000, fontSize: 220, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ef4444', opacity: 1, lineHeight: 1.0 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 40, y: 555, width: 1000, height: 3, fill: '#ef4444', opacity: 0.4 },
        { type: 'text', role: 'kicker', text: '', x: 40, y: 600, width: 1000, fontSize: 60, fontFamily: font, fontWeight: '900', align: 'left', fill: textColor('#ffffff'), opacity: 0.7 },
        { type: 'text', role: 'badge', text: '', x: 40, y: 680, width: 600, fontSize: 280, fontFamily: font, fontWeight: '900', align: 'left', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'subtitle', text: '', x: 40, y: 1010, width: 700, fontSize: 50, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.5)', opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 40, y: 1110, width: 1000, height: 88, fill: '#ef4444', opacity: 1, cornerRadius: 6 },
        { type: 'text', role: 'cta', text: '', x: 52, y: 1130, width: 976, fontSize: 40, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1 },
      ],
    },
    {
      id: 'carousel-slide', name: 'Carousel Dia', emoji: '\uD83C\uDFA0', desc: 'Carousel poszt stilus, szam jelzessel',
      meta: { bestFor: ['carousel','tippek','lista','tobb reszbol allo poszt'], avoidFor: ['egyszeri termek','akcio'], headlineMaxChars: 15, bodyMaxChars: 40, ctaMaxChars: 0, textZone: 'top', productSafeZone: 'bottom', backgroundType: 'any', imageComposition: ['abstract','scene','any'], aiHint: 'Use for educational carousels; slide number shown at top left.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: scrimFill, opacity: 0.70 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 10, fill: accent, opacity: 1 },
        { type: 'text', role: 'kicker', text: '', x: 60, y: 50, width: 200, fontSize: 24, fontFamily: font, fontWeight: '700', align: 'left', fill: 'rgba(255,255,255,0.4)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 200, y: 60, width: 820, height: 2, fill: 'rgba(255,255,255,0.1)', opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 200, width: 864, fontSize: 130, fontFamily: font, fontWeight: '900', align: 'left', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 450, width: 864, fontSize: 80, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.6)', opacity: 1, lineHeight: 1.2 },
        { type: 'figure', subType: 'rect', x: 60, y: 660, width: 80, height: 4, fill: accent, opacity: 1 },
        { type: 'text', role: 'badge', text: '', x: 108, y: 700, width: 700, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.4)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 1290, width: 1080, height: 60, fill: 'rgba(0,0,0,0.25)', opacity: 1 },
        { type: 'text', role: 'decoration', text: '', x: 108, y: 1305, width: 864, fontSize: 20, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
      ],
    },
    {
      id: 'giveaway', name: 'Nyeremeny', emoji: '\uD83C\uDF81', desc: 'Giveaway / nyeremeny banner',
      meta: { bestFor: ['giveaway','nyeremeny','sorsolas','verseny'], avoidFor: ['termek promocio'], headlineMaxChars: 10, bodyMaxChars: 80, ctaMaxChars: 12, textZone: 'full', productSafeZone: 'none', backgroundType: 'dark', imageComposition: ['abstract','any'], aiHint: 'Use for giveaway posts; lists participation rules with CTA.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: `linear-gradient(135deg, ${primary} 0%, #1e1060 100%)`, opacity: 1 },
        { type: 'figure', subType: 'circle', x: -100, y: -100, width: 600, height: 600, fill: accent, opacity: 0.08 },
        { type: 'figure', subType: 'circle', x: 580, y: 900, width: 700, height: 700, fill: accent, opacity: 0.05 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 120, width: 864, fontSize: 110, fontFamily: font, fontWeight: '900', align: 'center', fill: accent, opacity: 1 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 60, y: 260, width: 960, height: 2, fill: 'rgba(255,255,255,0.1)', opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 310, width: 864, fontSize: 50, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 370, width: 864, fontSize: 80, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 470, width: 864, fontSize: 36, fontFamily: font, fontWeight: '700', align: 'center', fill: accent, opacity: 1 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 60, y: 560, width: 960, height: 2, fill: 'rgba(255,255,255,0.1)', opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 620, width: 864, fontSize: 36, fontFamily: font, fontWeight: '600', align: 'left', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 680, width: 864, fontSize: 36, fontFamily: font, fontWeight: '600', align: 'left', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 740, width: 864, fontSize: 36, fontFamily: font, fontWeight: '600', align: 'left', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 840, width: 864, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.45)', opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 190, y: 910, width: 700, height: 80, fill: accent, opacity: 1, cornerRadius: 40 },
        { type: 'text', role: 'cta', text: '', x: 202, y: 928, width: 676, fontSize: 34, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
      ],
    },
    {
      id: 'quote-card', name: 'Idezet Kartya', emoji: '\uD83D\uDCAD', desc: 'Inspiralo idezet nagybetukkel',
      meta: { bestFor: ['idezet','inspiracio','motivacio'], avoidFor: ['akcio','termek'], headlineMaxChars: 0, bodyMaxChars: 120, ctaMaxChars: 0, textZone: 'center', productSafeZone: 'none', backgroundType: 'light', imageComposition: ['abstract','any'], aiHint: 'Use for inspirational quotes; light background with primary-colored border frame.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: '#f8fafc', opacity: 0.94 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 12, height: 1350, fill: primary, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 12, fill: primary, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 1338, width: 1080, height: 12, fill: primary, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 1068, y: 0, width: 12, height: 1350, fill: primary, opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 300, width: 864, fontSize: 96, fontFamily: 'Playfair Display', fontWeight: '700', align: 'left', fill: primary, opacity: 1, lineHeight: 1.15 },
        { type: 'figure', subType: 'rect', x: 60, y: 980, width: 120, height: 5, fill: accent, opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 1010, width: 600, fontSize: 32, fontFamily: 'Playfair Display', fontWeight: '400', align: 'left', fill: primary, opacity: 0.6 },
        { type: 'text', role: 'decoration', text: '', x: 820, y: 1280, width: 220, fontSize: 26, fontFamily: font, fontWeight: '700', align: 'right', fill: primary, opacity: 0.4 },
      ],
    },
    {
      id: 'summer-vibes', name: 'Nyari Hangulat', emoji: '\u2600\uFE0F', desc: 'Nyari szezonalis banner',
      meta: { bestFor: ['nyari akcio','szezonalis promocio','nyar'], avoidFor: ['teli termek','tech'], headlineMaxChars: 20, bodyMaxChars: 35, ctaMaxChars: 10, textZone: 'bottom', productSafeZone: 'top', backgroundType: 'any', imageComposition: ['landscape','product-centered','scene','any'], aiHint: 'Use for summer seasonal campaigns; warm circles evoke sunlight.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.25)', opacity: 1 },
        { type: 'figure', subType: 'circle', x: 780, y: -80, width: 420, height: 420, fill: '#fbbf24', opacity: 0.25 },
        { type: 'figure', subType: 'circle', x: 820, y: -40, width: 320, height: 320, fill: '#f97316', opacity: 0.2 },
        { type: 'text', role: 'kicker', text: '', x: 108, y: 60, width: 700, fontSize: 28, fontFamily: font, fontWeight: '700', align: 'left', fill: '#fbbf24', opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 800, width: 864, fontSize: 130, fontFamily: 'Playfair Display', fontWeight: '700', align: 'left', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.05, textShadow: '0 4px 24px rgba(0,0,0,0.5)' },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 1100, width: 800, fontSize: 36, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.7)', opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 60, y: 1180, width: 300, height: 74, fill: '#fbbf24', opacity: 1, cornerRadius: 37 },
        { type: 'text', role: 'cta', text: '', x: 72, y: 1198, width: 276, fontSize: 28, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
      ],
    },
    {
      id: 'subscription', name: 'Elofizetes CTA', emoji: '\uD83D\uDCE7', desc: 'Email feliratkozas / newsletter',
      meta: { bestFor: ['newsletter','email feliratkozas','lead generation'], avoidFor: ['termek promocio','esemeny'], headlineMaxChars: 20, bodyMaxChars: 60, ctaMaxChars: 14, textZone: 'center', productSafeZone: 'none', backgroundType: 'dark', imageComposition: ['abstract','any'], aiHint: 'Use for email newsletter sign-up posts; mock email input field and CTA.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: scrimFill, opacity: 0.65 },
        { type: 'figure', subType: 'rect', x: 80, y: 80, width: 920, height: 1190, fill: 'rgba(255,255,255,0.03)', opacity: 1, cornerRadius: 16, border: '1px solid rgba(255,255,255,0.08)' },
        { type: 'figure', subType: 'circle', x: 440, y: 100, width: 200, height: 200, fill: accent, opacity: 0.15 },
        { type: 'text', role: 'kicker', text: '', x: 108, y: 180, width: 864, fontSize: 36, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.5)', opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 350, width: 864, fontSize: 110, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 440, y: 620, width: 200, height: 3, fill: accent, opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 660, width: 864, fontSize: 36, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.55)', opacity: 1, lineHeight: 1.5 },
        { type: 'figure', subType: 'rect', x: 100, y: 820, width: 880, height: 88, fill: 'rgba(255,255,255,0.07)', opacity: 1, cornerRadius: 12, border: '1px solid rgba(255,255,255,0.12)' },
        { type: 'text', role: 'badge', text: '', x: 120, y: 844, width: 640, fontSize: 30, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.25)', opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 100, y: 950, width: 880, height: 88, fill: accent, opacity: 1, cornerRadius: 12 },
        { type: 'text', role: 'cta', text: '', x: 112, y: 970, width: 856, fontSize: 36, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 1080, width: 864, fontSize: 22, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.3)', opacity: 1 },
      ],
    },
    {
      id: 'product-grid', name: 'Termek Grid', emoji: '\uD83D\uDD32', desc: '4 termek negy mezobe rendezve',
      meta: { bestFor: ['tobb termek','kollekcio attekinto','termek grid'], avoidFor: ['egyetlen termek','szoveges tartalom'], headlineMaxChars: 25, bodyMaxChars: 0, ctaMaxChars: 0, textZone: 'top', productSafeZone: 'center', backgroundType: 'light', imageComposition: ['product-centered','any'], aiHint: 'Use when showcasing multiple products; four white card slots.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: '#f1f5f9', opacity: 0.6 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 130, fill: scrimFill, opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 42, width: 864, fontSize: 42, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'figure', subType: 'rect', x: 20, y: 150, width: 510, height: 550, fill: '#ffffff', opacity: 1, cornerRadius: 12 },
        { type: 'figure', subType: 'rect', x: 550, y: 150, width: 510, height: 550, fill: '#ffffff', opacity: 1, cornerRadius: 12 },
        { type: 'figure', subType: 'rect', x: 20, y: 720, width: 510, height: 550, fill: '#ffffff', opacity: 1, cornerRadius: 12 },
        { type: 'figure', subType: 'rect', x: 550, y: 720, width: 510, height: 550, fill: '#ffffff', opacity: 1, cornerRadius: 12 },
        { type: 'text', text: '', x: 40, y: 600, width: 470, fontSize: 32, fontFamily: font, fontWeight: '700', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.4 },
        { type: 'text', text: '', x: 570, y: 600, width: 470, fontSize: 32, fontFamily: font, fontWeight: '700', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.4 },
        { type: 'text', text: '', x: 40, y: 1170, width: 470, fontSize: 32, fontFamily: font, fontWeight: '700', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.4 },
        { type: 'text', text: '', x: 570, y: 1170, width: 470, fontSize: 32, fontFamily: font, fontWeight: '700', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.4 },
      ],
    },
    // ===== NEW TEMPLATES 31-45 =====
    {
      id: 'price-tag-bold', name: 'Artabla', emoji: '\uD83D\uDCB0', desc: 'Bal felso nagy ar, minimalis overlay',
      meta: { bestFor: ['ar kiemeles','termek ar','kedvezo ar'], avoidFor: ['szoveges tartalom','giveaway'], headlineMaxChars: 15, bodyMaxChars: 0, ctaMaxChars: 14, textZone: 'corner', productSafeZone: 'full', backgroundType: 'any', imageComposition: ['product-centered','any'], aiHint: 'Use when the price is the key message; minimal overlay keeps product visible.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.15)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 400, height: 320, fill: scrimFill, opacity: 0.65 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 0, y: 0, width: 400, height: 8, fill: accent, opacity: 1 },
        { type: 'text', role: 'kicker', text: '', x: 20, y: 28, width: 360, fontSize: 22, fontFamily: font, fontWeight: '700', align: 'left', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 20, y: 68, width: 360, fontSize: 100, fontFamily: font, fontWeight: '900', align: 'left', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'subtitle', text: '', x: 20, y: 188, width: 360, fontSize: 26, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.5)', opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 20, y: 235, width: 240, height: 60, fill: accent, opacity: 1, cornerRadius: 30 },
        { type: 'text', role: 'cta', text: '', x: 30, y: 252, width: 220, fontSize: 22, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
      ],
    },
    {
      id: 'corner-ribbon', name: 'Sarok Szalag', emoji: '\uD83C\uDF80', desc: 'Bal felso szalag badge',
      meta: { bestFor: ['akcio','new','sale','badge'], avoidFor: ['sok szoveg','carousel'], headlineMaxChars: 8, bodyMaxChars: 0, ctaMaxChars: 0, textZone: 'corner', productSafeZone: 'full', backgroundType: 'any', imageComposition: ['product-centered','any'], aiHint: 'Use as a subtle badge overlay; ribbon in top-left corner keeps photo visible.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.08)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: -60, y: 100, width: 320, height: 80, fill: accent, opacity: 1 },
        { type: 'text', role: 'badge', text: '', x: 0, y: 116, width: 240, fontSize: 38, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#000000'), opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 1300, width: 1080, height: 50, fill: scrimFill, opacity: 0.9 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 1313, width: 864, fontSize: 22, fontFamily: font, fontWeight: '600', align: 'center', fill: 'rgba(255,255,255,0.7)', opacity: 1 },
      ],
    },
    {
      id: 'side-stripe-left', name: 'Oldalsó Csik', emoji: '\u258C', desc: 'Bal oldali accent sav + szoveg',
      meta: { bestFor: ['brand komunikacio','termek bemutato','minimal design'], avoidFor: ['sok szoveg','giveaway'], headlineMaxChars: 30, bodyMaxChars: 50, ctaMaxChars: 0, textZone: 'bottom', productSafeZone: 'top', backgroundType: 'any', imageComposition: ['portrait','product-centered','any'], aiHint: 'Use for brand-forward posts; thick left-side accent stripe with minimal text block at bottom.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.22)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 16, height: 1350, fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 900, width: 1080, height: 450, fill: scrimFill, opacity: 0.60 },
        { type: 'figure', subType: 'rect', x: 0, y: 900, width: 1080, height: 4, fill: accent, opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 40, y: 940, width: 1000, fontSize: 80, fontFamily: font, fontWeight: '900', align: 'left', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'subtitle', text: '', x: 40, y: 1048, width: 864, fontSize: 34, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.65)', opacity: 1, lineHeight: 1.4 },
        { type: 'text', role: 'kicker', text: '', x: 40, y: 1260, width: 400, fontSize: 26, fontFamily: font, fontWeight: '700', align: 'left', fill: accent, opacity: 1 },
      ],
    },
    {
      id: 'top-bar-announcement', name: 'Felso Sav', emoji: '\uD83D\uDCCC', desc: 'Felso 130px sav, minimalis szoveg',
      meta: { bestFor: ['bejelentes','cim','minimalis overlay'], avoidFor: ['sok szoveg','akcio szazalek'], headlineMaxChars: 35, bodyMaxChars: 0, ctaMaxChars: 0, textZone: 'top', productSafeZone: 'full', backgroundType: 'any', imageComposition: ['product-centered','portrait','landscape','any'], aiHint: 'Use when almost no overlay is needed; only a thin top bar with short announcement title.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.1)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 130, fill: scrimFill, opacity: 0.88 },
        { type: 'figure', subType: 'rect', x: 0, y: 126, width: 1080, height: 4, fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 40, y: 35, width: 160, height: 56, fill: accent, opacity: 1, cornerRadius: 28 },
        { type: 'text', role: 'decoration', text: 'UJ', x: 50, y: 52, width: 140, fontSize: 28, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#000000'), opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 220, y: 42, width: 820, fontSize: 40, fontFamily: font, fontWeight: '700', align: 'left', fill: textColor('#ffffff'), opacity: 1 },
      ],
    },
    {
      id: 'caption-bottom-only', name: 'Also Felirat', emoji: '\uD83D\uDCDD', desc: 'Csak alul 180px panel',
      meta: { bestFor: ['termek bemutatas','minimal','clean design'], avoidFor: ['sok szoveg','akcio'], headlineMaxChars: 45, bodyMaxChars: 0, ctaMaxChars: 0, textZone: 'bottom', productSafeZone: 'full', backgroundType: 'any', imageComposition: ['product-centered','portrait','landscape','any'], aiHint: 'Use when the photo should dominate; small caption bar at very bottom only.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 1170, width: 1080, height: 180, fill: scrimFill, opacity: 0.86 },
        { type: 'figure', subType: 'rect', x: 0, y: 1170, width: 1080, height: 4, fill: accent, opacity: 1 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 60, y: 1200, width: 8, height: 100, fill: accent, opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 1198, width: 864, fontSize: 46, fontFamily: font, fontWeight: '800', align: 'left', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 1268, width: 500, fontSize: 24, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.5)', opacity: 1 },
      ],
    },
    {
      id: 'watermark-corner', name: 'Vizjel Sarok', emoji: '\u00A9', desc: 'Csak brand badge sarokba',
      meta: { bestFor: ['brand watermark','clean photo','portfolio'], avoidFor: ['szoveges tartalom','akcio'], headlineMaxChars: 0, bodyMaxChars: 0, ctaMaxChars: 0, textZone: 'corner', productSafeZone: 'full', backgroundType: 'any', imageComposition: ['product-centered','portrait','landscape','any'], aiHint: 'Use when the photo must remain completely unobstructed; small brand watermark badge only.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 760, y: 1240, width: 280, height: 70, fill: primary, opacity: 0.80, cornerRadius: 8 },
        { type: 'figure', subType: 'rect', x: 760, y: 1240, width: 6, height: 70, fill: accent, opacity: 1, cornerRadius: 8 },
        { type: 'text', role: 'headline', text: '', x: 780, y: 1258, width: 240, fontSize: 32, fontFamily: font, fontWeight: '800', align: 'left', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'figure', subType: 'circle', x: 44, y: 44, width: 32, height: 32, fill: accent, opacity: 0.8 },
      ],
    },
    {
      id: 'subtitle-strip', name: 'Felirat Csik', emoji: '\u2014', desc: 'Alul 80px sav, egyszeru felirat',
      meta: { bestFor: ['clean termekfoto','brand tagline','minimal'], avoidFor: ['hosszu szoveg'], headlineMaxChars: 50, bodyMaxChars: 0, ctaMaxChars: 0, textZone: 'bottom', productSafeZone: 'full', backgroundType: 'any', imageComposition: ['product-centered','portrait','landscape','any'], aiHint: 'Use for clean product photos that need just a tagline; thin stripe at bottom.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 1270, width: 1080, height: 80, fill: scrimFill, opacity: 0.70 },
        { type: 'figure', subType: 'rect', x: 0, y: 1270, width: 1080, height: 3, fill: accent, opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 40, y: 1286, width: 1000, fontSize: 38, fontFamily: font, fontWeight: '700', align: 'center', fill: textColor('#ffffff'), opacity: 1 },
      ],
    },
    {
      id: 'polaroid-white', name: 'Polaroid Keret', emoji: '\uD83D\uDCF7', desc: 'Feher keret hatas + also szoveg',
      meta: { bestFor: ['retro stilus','foto keret','nostalgic','lifestyle'], avoidFor: ['akcio','tech termek'], headlineMaxChars: 30, bodyMaxChars: 0, ctaMaxChars: 0, textZone: 'bottom', productSafeZone: 'center', backgroundType: 'light', imageComposition: ['portrait','product-centered','landscape','any'], aiHint: 'Use for vintage/lifestyle brands; white border creates a polaroid photo effect.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(255,255,255,0.1)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 40, y: 40, width: 1000, height: 1270, fill: 'transparent', opacity: 1, border: '40px solid rgba(255,255,255,0.92)' },
        { type: 'figure', subType: 'rect', x: 40, y: 1110, width: 1000, height: 200, fill: 'rgba(255,255,255,0.95)', opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 1140, width: 864, fontSize: 52, fontFamily: 'Playfair Display', fontWeight: '700', align: 'center', fill: '#1a1a1a', opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 1210, width: 864, fontSize: 28, fontFamily: 'Playfair Display', fontWeight: '400', align: 'center', fill: '#888888', opacity: 1 },
      ],
    },
    {
      id: 'neon-glow-frame', name: 'Neon Keret', emoji: '\uD83C\uDF1F', desc: 'Elektromos neon stilus keret',
      meta: { bestFor: ['gaming','rave','ejszakai esemeny','neon stilus'], avoidFor: ['luxus','etel','ingatlan'], headlineMaxChars: 25, bodyMaxChars: 0, ctaMaxChars: 14, textZone: 'bottom', productSafeZone: 'center', backgroundType: 'dark', imageComposition: ['product-centered','abstract','portrait','any'], aiHint: 'Use for edgy gaming brands; glowing border with neon accent and bold bottom text.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.55)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 20, y: 20, width: 1040, height: 1310, fill: 'transparent', opacity: 1, border: `3px solid ${accent}`, cornerRadius: 12 },
        { type: 'figure', subType: 'rect', x: 30, y: 30, width: 1020, height: 1290, fill: 'transparent', opacity: 1, border: `1px solid ${accent}55`, cornerRadius: 10 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 20, y: 20, width: 60, height: 5, fill: accent, opacity: 1 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 20, y: 20, width: 5, height: 60, fill: accent, opacity: 1 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 1000, y: 20, width: 60, height: 5, fill: accent, opacity: 1 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 1055, y: 20, width: 5, height: 60, fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 1080, width: 1080, height: 270, fill: 'rgba(0,0,0,0.7)', opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 40, y: 1110, width: 1000, fontSize: 80, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 300, y: 1230, width: 480, height: 72, fill: accent, opacity: 1, cornerRadius: 36 },
        { type: 'text', role: 'cta', text: '', x: 312, y: 1248, width: 456, fontSize: 30, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#000000'), opacity: 1 },
      ],
    },
    {
      id: 'vintage-stamp', name: 'Vintage Belyeg', emoji: '\uD83C\uDFDB\uFE0F', desc: 'Kor alaku belyeg stilus sarokban',
      meta: { bestFor: ['artisan','kezmuves','helyi brand','hagyomany'], avoidFor: ['tech','gaming','modern brand'], headlineMaxChars: 20, bodyMaxChars: 0, ctaMaxChars: 0, textZone: 'corner', productSafeZone: 'full', backgroundType: 'any', imageComposition: ['product-centered','landscape','any'], aiHint: 'Use for artisan and heritage brands; circular stamp badge in corner.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.15)', opacity: 1 },
        { type: 'figure', subType: 'circle', x: 720, y: 80, width: 280, height: 280, fill: primary, opacity: 0.93 },
        { type: 'figure', subType: 'circle', x: 732, y: 92, width: 256, height: 256, fill: 'transparent', opacity: 1, border: '2px solid rgba(255,255,255,0.4)' },
        { type: 'text', role: 'headline', text: '', x: 720, y: 160, width: 280, fontSize: 28, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'figure', subType: 'rect', x: 760, y: 198, width: 200, height: 2, fill: accent, opacity: 0.7 },
        { type: 'text', role: 'kicker', text: '', x: 720, y: 210, width: 280, fontSize: 24, fontFamily: 'Playfair Display', fontWeight: '700', align: 'center', fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 760, y: 248, width: 200, height: 2, fill: accent, opacity: 0.7 },
        { type: 'text', role: 'subtitle', text: '', x: 720, y: 262, width: 280, fontSize: 20, fontFamily: font, fontWeight: '700', align: 'center', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 1295, width: 1080, height: 55, fill: scrimFill, opacity: 0.9 },
        { type: 'text', role: 'badge', text: '', x: 108, y: 1308, width: 864, fontSize: 24, fontFamily: font, fontWeight: '600', align: 'center', fill: 'rgba(255,255,255,0.65)', opacity: 1 },
      ],
    },
    {
      id: 'stat-big-number', name: 'Nagy Szam / Stat', emoji: '\uD83D\uDCCA', desc: 'Egyetlen nagy szam + kontextus',
      meta: { bestFor: ['statisztika','eredmeny','merfoldko'], avoidFor: ['termek foto','etel'], headlineMaxChars: 10, bodyMaxChars: 50, ctaMaxChars: 0, textZone: 'center', productSafeZone: 'bottom', backgroundType: 'any', imageComposition: ['abstract','scene','any'], aiHint: 'Use when a single impressive number tells the story; number dominates center.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: scrimFill, opacity: 0.60 },
        { type: 'figure', subType: 'circle', x: 140, y: 280, width: 800, height: 800, fill: accent, opacity: 0.06 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 280, width: 864, fontSize: 320, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#ffffff'), opacity: 1, lineHeight: 1.0 },
        { type: 'figure', subType: 'rect', x: 340, y: 660, width: 400, height: 4, fill: accent, opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 700, width: 864, fontSize: 52, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.7)', opacity: 1 },
        { type: 'text', role: 'badge', text: '', x: 108, y: 820, width: 864, fontSize: 36, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.5)', opacity: 1, lineHeight: 1.5 },
        { type: 'figure', subType: 'rect', x: 0, y: 1200, width: 1080, height: 150, fill: accent, opacity: 1 },
        { type: 'text', role: 'cta', text: '', x: 108, y: 1253, width: 864, fontSize: 46, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#000000'), opacity: 1 },
      ],
    },
    {
      id: 'before-after-label', name: 'Elotte/Utana Felirat', emoji: '\u2702\uFE0F', desc: 'Kis ELOTTE UTANA badge-ek',
      meta: { bestFor: ['transzformacio','szepsegapolas','renovalas'], avoidFor: ['szoveges tartalom','giveaway'], headlineMaxChars: 0, bodyMaxChars: 0, ctaMaxChars: 0, textZone: 'corner', productSafeZone: 'full', backgroundType: 'any', imageComposition: ['portrait','product-centered','any'], aiHint: 'Use when image shows before/after result; minimal badge labels in corners.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.1)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 30, y: 30, width: 200, height: 60, fill: 'rgba(0,0,0,0.75)', opacity: 1, cornerRadius: 8 },
        { type: 'text', role: 'badge', text: '', x: 40, y: 47, width: 180, fontSize: 28, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 850, y: 30, width: 200, height: 60, fill: accent, opacity: 1, cornerRadius: 8 },
        { type: 'text', role: 'badge', text: '', x: 860, y: 47, width: 180, fontSize: 28, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#000000'), opacity: 1 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 536, y: 0, width: 8, height: 1350, fill: '#ffffff', opacity: 0.6 },
        { type: 'figure', subType: 'rect', x: 0, y: 1290, width: 1080, height: 60, fill: scrimFill, opacity: 0.9 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 1304, width: 864, fontSize: 28, fontFamily: font, fontWeight: '700', align: 'center', fill: textColor('#ffffff'), opacity: 1 },
      ],
    },
    {
      id: 'percentage-corner', name: '% Sarok Badge', emoji: '%', desc: 'Sarokba kerulo % badge',
      meta: { bestFor: ['kedvezmeny','sale','akcio','szazalek'], avoidFor: ['nincs akcio','luxus'], headlineMaxChars: 0, bodyMaxChars: 0, ctaMaxChars: 0, textZone: 'corner', productSafeZone: 'full', backgroundType: 'any', imageComposition: ['product-centered','any'], aiHint: 'Use to add a discount percentage badge to a clean product photo; circular badge only.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.1)', opacity: 1 },
        { type: 'figure', subType: 'circle', x: 840, y: 60, width: 240, height: 240, fill: '#ef4444', opacity: 1 },
        { type: 'figure', subType: 'circle', x: 852, y: 72, width: 216, height: 216, fill: 'transparent', opacity: 1, border: '2px solid rgba(255,255,255,0.3)' },
        { type: 'text', role: 'headline', text: '', x: 840, y: 130, width: 240, fontSize: 72, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 1295, width: 1080, height: 55, fill: scrimFill, opacity: 0.84 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 1308, width: 864, fontSize: 26, fontFamily: font, fontWeight: '600', align: 'center', fill: 'rgba(255,255,255,0.75)', opacity: 1 },
      ],
    },
    {
      id: 'bundle-deal', name: 'Kombo Ajanlat', emoji: '\uD83C\uDFAF', desc: '2+1 / bundle ajanlat kiemelő',
      meta: { bestFor: ['kombo','2+1','csomag ajanlat','bundle'], avoidFor: ['egyetlen termek','ingatlan'], headlineMaxChars: 10, bodyMaxChars: 40, ctaMaxChars: 16, textZone: 'center', productSafeZone: 'bottom', backgroundType: 'any', imageComposition: ['product-centered','any'], aiHint: 'Use for bundle deals; 2+1 INGYEN or similar offer takes center stage.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: scrimFill, opacity: 0.55 },
        { type: 'figure', subType: 'rect', x: 100, y: 200, width: 880, height: 400, fill: accent, opacity: 1, cornerRadius: 20 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 112, y: 212, width: 856, height: 376, fill: 'transparent', opacity: 1, border: '2px solid rgba(0,0,0,0.15)', cornerRadius: 16 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 250, width: 864, fontSize: 200, fontFamily: font, fontWeight: '900', align: 'center', fill: textColor('#000000'), opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 460, width: 864, fontSize: 90, fontFamily: font, fontWeight: '900', align: 'center', fill: primary, opacity: 1 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 60, y: 660, width: 960, height: 3, fill: 'rgba(255,255,255,0.2)', opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 108, y: 700, width: 864, fontSize: 42, fontFamily: font, fontWeight: '700', align: 'center', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'text', role: 'subtitle', text: '', x: 108, y: 770, width: 864, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.55)', opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 190, y: 880, width: 700, height: 80, fill: '#ffffff', opacity: 1, cornerRadius: 40 },
        { type: 'text', role: 'cta', text: '', x: 202, y: 898, width: 676, fontSize: 30, fontFamily: font, fontWeight: '800', align: 'center', fill: primary, opacity: 1 },
      ],
    },
    {
      id: 'flash-promo-minimal', name: 'Mini Promo', emoji: '\uD83C\uDFAF', desc: 'Kompakt promo - cim + ar + gomb',
      meta: { bestFor: ['gyors promocio','termek ajanlat','kedvezo ar','ecommerce'], avoidFor: ['hosszu szoveg','esemeny'], headlineMaxChars: 25, bodyMaxChars: 0, ctaMaxChars: 14, textZone: 'bottom', productSafeZone: 'top', backgroundType: 'any', imageComposition: ['product-centered','any'], aiHint: 'Use for quick product promotions; compact layout with product name, price and CTA.' },
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.2)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 1000, width: 1080, height: 350, fill: '#ffffff', opacity: 0.95 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 0, y: 1000, width: 1080, height: 5, fill: accent, opacity: 1 },
        { type: 'text', role: 'headline', text: '', x: 40, y: 1030, width: 650, fontSize: 54, fontFamily: font, fontWeight: '900', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.0 },
        { type: 'text', role: 'subtitle', text: '', x: 40, y: 1110, width: 650, fontSize: 64, fontFamily: font, fontWeight: '800', align: 'left', fill: primary, opacity: 1 },
        { type: 'text', role: 'badge', text: '', x: 40, y: 1198, width: 500, fontSize: 26, fontFamily: font, fontWeight: '400', align: 'left', fill: '#888888', opacity: 1 },
        { type: 'figure', role: 'cta', subType: 'rect', x: 750, y: 1060, width: 290, height: 100, fill: primary, opacity: 1, cornerRadius: 12 },
        { type: 'text', role: 'cta', text: '', x: 762, y: 1092, width: 266, fontSize: 34, fontFamily: font, fontWeight: '800', align: 'center', fill: textColor('#ffffff'), opacity: 1 },
        { type: 'figure', role: 'decoration', subType: 'rect', x: 750, y: 1190, width: 290, height: 48, fill: 'transparent', opacity: 1, border: `2px solid ${accent}`, cornerRadius: 24 },
        { type: 'text', role: 'kicker', text: '', x: 758, y: 1204, width: 274, fontSize: 20, fontFamily: font, fontWeight: '600', align: 'center', fill: accent, opacity: 1 },
      ],
    },
  ];
}
