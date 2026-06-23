/**
 * Shared layer template definitions – 30 templates.
 * Used by both ImageTestLab (Layer Szerkesztő) and ProdCalendarView (Éles Naptár).
 * Colors are injected at call-time via buildLayerTemplates(primary, accent, font).
 */

export interface LayerChild {
  type: 'text' | 'image' | 'figure';
  x: number; y: number; width: number; height?: number;
  opacity?: number;
  visible?: boolean;
  text?: string; fontSize?: number; fontFamily?: string; fontWeight?: string;
  align?: string; fill?: string; textShadow?: string; lineHeight?: number;
  src?: string; filter?: string;
  subType?: 'rect' | 'circle'; cornerRadius?: number; border?: string;
}

export interface LayerTemplate {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  layers: LayerChild[];
}

export function buildLayerTemplates(
  primary: string,
  accent: string,
  font: string
): LayerTemplate[] {
  return [
    // ─────────── 1 ───────────
    {
      id: 'bold-headline', name: 'Bold Headline', emoji: '🔥', desc: 'Nagy cím alul, gradient',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 650, width: 1080, height: 700, fill: `linear-gradient(to top, ${primary}f5, ${primary}80, transparent)`, opacity: 1 },
        { type: 'text', text: 'ÚJ KOLLEKCIÓ', x: 60, y: 730, width: 960, fontSize: 28, fontFamily: font, fontWeight: '700', align: 'left', fill: accent, opacity: 1 },
        { type: 'text', text: 'Fedezd fel\na legjobb\nTermékeinket', x: 60, y: 800, width: 960, fontSize: 112, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, textShadow: '0 4px 24px rgba(0,0,0,0.5)', lineHeight: 1.0 },
        { type: 'figure', subType: 'rect', x: 60, y: 1280, width: 280, height: 5, fill: accent, opacity: 1 },
      ],
    },
    // ─────────── 2 ───────────
    {
      id: 'product-callout', name: 'Termék Kiemelő', emoji: '🏷️', desc: 'Ár + badge + CTA gomb',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.3)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 60, width: 220, height: 64, fill: accent, opacity: 1, cornerRadius: 8 },
        { type: 'text', text: 'ÚJ!', x: 72, y: 79, width: 196, fontSize: 30, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
        { type: 'text', text: 'Prémium\nTermék', x: 60, y: 880, width: 700, fontSize: 110, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, textShadow: '0 4px 20px rgba(0,0,0,0.6)', lineHeight: 1.1 },
        { type: 'text', text: '4 990 Ft', x: 60, y: 1110, width: 400, fontSize: 72, fontFamily: font, fontWeight: '800', align: 'left', fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 1220, width: 380, height: 82, fill: accent, opacity: 1, cornerRadius: 41 },
        { type: 'text', text: 'RENDELJ MOST', x: 72, y: 1238, width: 356, fontSize: 28, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
      ],
    },
    // ─────────── 3 ───────────
    {
      id: 'promo-badge', name: 'Akció Badge', emoji: '🏅', desc: 'Nagy % kedvezmény középen',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: `${primary}dd`, opacity: 1 },
        { type: 'figure', subType: 'circle', x: 190, y: 280, width: 700, height: 700, fill: accent, opacity: 0.12 },
        { type: 'text', text: '50%', x: 60, y: 380, width: 960, fontSize: 300, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
        { type: 'text', text: 'KEDVEZMÉNY', x: 60, y: 720, width: 960, fontSize: 56, fontFamily: font, fontWeight: '800', align: 'center', fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 100, y: 830, width: 880, height: 2, fill: 'rgba(255,255,255,0.25)', opacity: 1 },
        { type: 'text', text: 'Ajánlat csak péntekig érvényes', x: 100, y: 870, width: 880, fontSize: 32, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.65)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 240, y: 1000, width: 600, height: 88, fill: '#ffffff', opacity: 1, cornerRadius: 44 },
        { type: 'text', text: 'VÁSÁRLÁS MOST', x: 252, y: 1020, width: 576, fontSize: 36, fontFamily: font, fontWeight: '800', align: 'center', fill: primary, opacity: 1 },
      ],
    },
    // ─────────── 4 ───────────
    {
      id: 'split-card', name: 'Split Card', emoji: '🃏', desc: 'Fehér kártya szövegekkel alul',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 820, width: 1080, height: 530, fill: '#ffffff', opacity: 0.96 },
        { type: 'figure', subType: 'rect', x: 60, y: 858, width: 8, height: 60, fill: accent, opacity: 1 },
        { type: 'text', text: 'KIEMELT AJÁNLAT', x: 88, y: 858, width: 900, fontSize: 22, fontFamily: font, fontWeight: '700', align: 'left', fill: accent, opacity: 1 },
        { type: 'text', text: 'Prémium\nMinőség', x: 60, y: 940, width: 860, fontSize: 108, fontFamily: font, fontWeight: '900', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.0 },
        { type: 'text', text: 'Fedezd fel kollekciónkat és találd meg a tökéletes terméked.', x: 60, y: 1175, width: 740, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'left', fill: '#555555', opacity: 1, lineHeight: 1.5 },
        { type: 'figure', subType: 'rect', x: 860, y: 1230, width: 160, height: 60, fill: primary, opacity: 1, cornerRadius: 30 },
        { type: 'text', text: 'Tovább', x: 868, y: 1244, width: 144, fontSize: 28, fontFamily: font, fontWeight: '700', align: 'center', fill: '#ffffff', opacity: 1 },
      ],
    },
    // ─────────── 5 ───────────
    {
      id: 'luxury-dark', name: 'Luxury Dark', emoji: '✨', desc: 'Sötét overlay + arany elemek',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(5,3,12,0.72)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 55, y: 55, width: 970, height: 1240, fill: 'transparent', opacity: 1, border: '1px solid rgba(212,175,55,0.35)', cornerRadius: 4 },
        { type: 'text', text: '--- LUXUS KOLLEKCIÓ ---', x: 100, y: 190, width: 880, fontSize: 22, fontFamily: 'Playfair Display', fontWeight: '400', align: 'center', fill: '#d4af37', opacity: 1 },
        { type: 'text', text: 'Időtlen\nElegancia', x: 100, y: 450, width: 880, fontSize: 130, fontFamily: 'Playfair Display', fontWeight: '700', align: 'center', fill: '#ffffff', opacity: 1, lineHeight: 1.1 },
        { type: 'figure', subType: 'rect', x: 440, y: 790, width: 200, height: 2, fill: '#d4af37', opacity: 1 },
        { type: 'text', text: 'Prémium ízlés azoknak, akik a különlegességeket keresik.', x: 100, y: 830, width: 880, fontSize: 30, fontFamily: 'Playfair Display', fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.65)', opacity: 1, lineHeight: 1.6 },
        { type: 'figure', subType: 'rect', x: 390, y: 1100, width: 300, height: 70, fill: 'transparent', opacity: 1, border: '1px solid #d4af37', cornerRadius: 35 },
        { type: 'text', text: 'FELFEDEZÉS', x: 400, y: 1118, width: 280, fontSize: 26, fontFamily: font, fontWeight: '600', align: 'center', fill: '#d4af37', opacity: 1 },
      ],
    },
    // ─────────── 6 ───────────
    {
      id: 'neo-brutal', name: 'Neo-Brutalist', emoji: '⬛', desc: 'Vastag border + kontrasztos blokkok',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.55)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 40, y: 40, width: 1000, height: 1270, fill: 'transparent', opacity: 1, border: '6px solid #ffffff' },
        { type: 'figure', subType: 'rect', x: 40, y: 40, width: 460, height: 200, fill: '#ffffff', opacity: 1 },
        { type: 'text', text: 'LEGÚJABB\nTERMÉK', x: 54, y: 55, width: 432, fontSize: 70, fontFamily: font, fontWeight: '900', align: 'left', fill: '#000000', opacity: 1, lineHeight: 1.05 },
        { type: 'figure', subType: 'rect', x: 500, y: 40, width: 540, height: 200, fill: accent, opacity: 1 },
        { type: 'text', text: '2025', x: 510, y: 88, width: 520, fontSize: 96, fontFamily: font, fontWeight: '900', align: 'center', fill: '#000000', opacity: 1 },
        { type: 'text', text: 'Forradalmi termék\namelyet megvártal', x: 60, y: 880, width: 960, fontSize: 72, fontFamily: font, fontWeight: '800', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.2 },
        { type: 'figure', subType: 'rect', x: 40, y: 1215, width: 1000, height: 95, fill: '#ffffff', opacity: 1 },
        { type: 'text', text: 'VÁSÁROLJ MOST – INGYENES SZÁLLÍTÁS', x: 50, y: 1238, width: 980, fontSize: 34, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
      ],
    },
    // ─────────── 7 ───────────
    {
      id: 'kicker-title', name: 'Kicker + Cím', emoji: '💬', desc: 'Kis badge fent + nagy cím',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.38)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 190, width: 290, height: 58, fill: accent, opacity: 1, cornerRadius: 29 },
        { type: 'text', text: '* KIEMELT', x: 72, y: 207, width: 266, fontSize: 24, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
        { type: 'text', text: 'Tedd különlegessé\na napod', x: 60, y: 315, width: 960, fontSize: 120, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, textShadow: '0 8px 32px rgba(0,0,0,0.5)', lineHeight: 1.0 },
        { type: 'figure', subType: 'rect', x: 60, y: 700, width: 100, height: 4, fill: '#ffffff', opacity: 0.45 },
        { type: 'text', text: 'Minőségi termékek mindenkinek. Próbáld ki még ma.', x: 60, y: 745, width: 800, fontSize: 34, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.78)', opacity: 1, lineHeight: 1.5 },
      ],
    },
    // ─────────── 8 ───────────
    {
      id: 'testimonial-layer', name: 'Vélemény', emoji: '⭐', desc: 'Idézet + csillagok + névjegy',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: `${primary}e8`, opacity: 1 },
        { type: 'figure', subType: 'circle', x: -150, y: -150, width: 600, height: 600, fill: accent, opacity: 0.07 },
        { type: 'figure', subType: 'circle', x: 630, y: 900, width: 600, height: 600, fill: accent, opacity: 0.07 },
        { type: 'text', text: '★ ★ ★ ★ ★', x: 100, y: 280, width: 880, fontSize: 56, fontFamily: font, fontWeight: '400', align: 'center', fill: accent, opacity: 1 },
        { type: 'text', text: '"', x: 70, y: 380, width: 180, fontSize: 220, fontFamily: 'Playfair Display', fontWeight: '700', align: 'left', fill: accent, opacity: 0.35 },
        { type: 'text', text: 'Fantasztikus termék!\nTeljesen elégedett vagyok,\nmindenképpen ajánlom.', x: 100, y: 490, width: 880, fontSize: 54, fontFamily: 'Playfair Display', fontWeight: '400', align: 'center', fill: '#ffffff', opacity: 1, lineHeight: 1.5 },
        { type: 'figure', subType: 'rect', x: 440, y: 990, width: 200, height: 2, fill: accent, opacity: 0.55 },
        { type: 'text', text: 'Kovács Anna', x: 100, y: 1030, width: 880, fontSize: 36, fontFamily: font, fontWeight: '700', align: 'center', fill: '#ffffff', opacity: 1 },
        { type: 'text', text: 'Elégedett vásárló', x: 100, y: 1082, width: 880, fontSize: 26, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.5)', opacity: 1 },
      ],
    },
    // ─────────── 9 ───────────
    {
      id: 'minimal-brand', name: 'Minimal Brand', emoji: '◎', desc: 'Brand szín sáv alul',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.12)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 1280, width: 1080, height: 70, fill: primary, opacity: 0.97 },
        { type: 'figure', subType: 'rect', x: 0, y: 1280, width: 1080, height: 4, fill: accent, opacity: 1 },
        { type: 'text', text: 'BRAND NAME', x: 60, y: 60, width: 700, fontSize: 40, fontFamily: font, fontWeight: '800', align: 'left', fill: '#ffffff', opacity: 1, textShadow: '0 2px 12px rgba(0,0,0,0.6)' },
        { type: 'figure', subType: 'rect', x: 60, y: 116, width: 60, height: 4, fill: accent, opacity: 1 },
        { type: 'text', text: 'www.brand.hu', x: 60, y: 1296, width: 960, fontSize: 28, fontFamily: font, fontWeight: '600', align: 'center', fill: 'rgba(255,255,255,0.85)', opacity: 1 },
      ],
    },
    // ─────────── 10 ───────────
    {
      id: 'story-cta', name: 'Story CTA', emoji: '👆', desc: 'Swipe up nyíl + CTA szöveg',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 1080, width: 1080, height: 270, fill: 'linear-gradient(to top, rgba(0,0,0,0.88), transparent)', opacity: 1 },
        { type: 'text', text: '^', x: 490, y: 1090, width: 100, fontSize: 72, fontFamily: font, fontWeight: '300', align: 'center', fill: '#ffffff', opacity: 0.85 },
        { type: 'text', text: 'SWIPE UP', x: 290, y: 1190, width: 500, fontSize: 38, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1 },
        { type: 'text', text: 'Kattints a linkre a profilban', x: 190, y: 1258, width: 700, fontSize: 26, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 60, width: 210, height: 62, fill: accent, opacity: 1, cornerRadius: 31 },
        { type: 'text', text: 'ÚJ *', x: 70, y: 78, width: 190, fontSize: 26, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
      ],
    },
    // ─────────── 11 ───────────
    {
      id: 'countdown-launch', name: 'Countdown', emoji: '⏰', desc: 'Visszaszámlálós hamarosan',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: `linear-gradient(160deg, ${primary} 0%, #0f0f1a 100%)`, opacity: 0.9 },
        { type: 'text', text: 'HAMAROSAN', x: 60, y: 120, width: 960, fontSize: 36, fontFamily: font, fontWeight: '800', align: 'center', fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 185, width: 960, height: 2, fill: accent, opacity: 0.3 },
        { type: 'text', text: '03', x: 100, y: 380, width: 200, fontSize: 160, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
        { type: 'text', text: 'NAP', x: 100, y: 560, width: 200, fontSize: 24, fontFamily: font, fontWeight: '700', align: 'center', fill: accent, opacity: 1 },
        { type: 'text', text: '14', x: 340, y: 380, width: 200, fontSize: 160, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
        { type: 'text', text: 'ÓRA', x: 340, y: 560, width: 200, fontSize: 24, fontFamily: font, fontWeight: '700', align: 'center', fill: accent, opacity: 1 },
        { type: 'text', text: '22', x: 580, y: 380, width: 200, fontSize: 160, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
        { type: 'text', text: 'PERC', x: 580, y: 560, width: 200, fontSize: 24, fontFamily: font, fontWeight: '700', align: 'center', fill: accent, opacity: 1 },
        { type: 'text', text: '07', x: 820, y: 380, width: 200, fontSize: 160, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
        { type: 'text', text: 'MP', x: 820, y: 560, width: 200, fontSize: 24, fontFamily: font, fontWeight: '700', align: 'center', fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 620, width: 960, height: 2, fill: 'rgba(255,255,255,0.1)', opacity: 1 },
        { type: 'text', text: 'Nagy termékbevezetés', x: 60, y: 680, width: 960, fontSize: 80, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1, lineHeight: 1.1 },
        { type: 'text', text: 'Írd be az emailodat az elsők között', x: 60, y: 820, width: 960, fontSize: 32, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 240, y: 920, width: 600, height: 80, fill: accent, opacity: 1, cornerRadius: 40 },
        { type: 'text', text: 'ÉRTESÍTS ENGEM', x: 252, y: 938, width: 576, fontSize: 30, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
      ],
    },
    // ─────────── 12 ───────────
    {
      id: 'new-arrival', name: 'New Arrival', emoji: '📦', desc: 'Új termék érkezési banner',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 420, fill: '#ffffff', opacity: 0.97 },
        { type: 'text', text: 'NEW', x: 60, y: 60, width: 580, fontSize: 200, fontFamily: font, fontWeight: '900', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.0 },
        { type: 'text', text: 'ARRIVAL', x: 60, y: 240, width: 800, fontSize: 130, fontFamily: font, fontWeight: '900', align: 'left', fill: accent, opacity: 1, lineHeight: 1.0 },
        { type: 'figure', subType: 'rect', x: 0, y: 420, width: 1080, height: 6, fill: primary, opacity: 1 },
        { type: 'text', text: 'KÜLÖNLEGES AJÁNLAT', x: 60, y: 800, width: 960, fontSize: 28, fontFamily: font, fontWeight: '700', align: 'left', fill: '#ffffff', opacity: 0.5 },
        { type: 'text', text: 'Fedezd fel az új kollekciónkat és válassz a legújabb termékek közül.', x: 60, y: 860, width: 800, fontSize: 40, fontFamily: font, fontWeight: '400', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.4 },
        { type: 'figure', subType: 'rect', x: 60, y: 1060, width: 320, height: 78, fill: '#ffffff', opacity: 1, cornerRadius: 39 },
        { type: 'text', text: 'VÁSÁRLÁS', x: 70, y: 1078, width: 300, fontSize: 30, fontFamily: font, fontWeight: '800', align: 'center', fill: primary, opacity: 1 },
      ],
    },
    // ─────────── 13 ───────────
    {
      id: 'event-invite', name: 'Event Meghívó', emoji: '📅', desc: 'Esemény meghívó kártya',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: `${primary}f0`, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 80, y: 80, width: 920, height: 1190, fill: 'transparent', opacity: 1, border: '1px solid rgba(255,255,255,0.15)', cornerRadius: 12 },
        { type: 'figure', subType: 'rect', x: 80, y: 80, width: 920, height: 280, fill: accent, opacity: 1, cornerRadius: 12 },
        { type: 'figure', subType: 'rect', x: 80, y: 280, width: 920, height: 12, fill: 'rgba(0,0,0,0.1)', opacity: 1 },
        { type: 'text', text: 'JÚLIUS 2025', x: 80, y: 90, width: 920, fontSize: 36, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
        { type: 'text', text: '22', x: 80, y: 140, width: 920, fontSize: 140, fontFamily: font, fontWeight: '900', align: 'center', fill: '#000000', opacity: 0.9, lineHeight: 1.0 },
        { type: 'text', text: 'SZOMBAT', x: 80, y: 320, width: 920, fontSize: 28, fontFamily: font, fontWeight: '700', align: 'center', fill: 'rgba(255,255,255,0.5)', opacity: 1 },
        { type: 'text', text: 'NAGY\nKIADÁS', x: 100, y: 430, width: 880, fontSize: 130, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
        { type: 'figure', subType: 'rect', x: 440, y: 740, width: 200, height: 3, fill: accent, opacity: 1 },
        { type: 'text', text: '18:00 – 23:00', x: 80, y: 780, width: 920, fontSize: 36, fontFamily: font, fontWeight: '700', align: 'center', fill: accent, opacity: 1 },
        { type: 'text', text: 'Budapest, Andrássy út 22.', x: 80, y: 840, width: 920, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 240, y: 1000, width: 600, height: 80, fill: accent, opacity: 1, cornerRadius: 40 },
        { type: 'text', text: 'REGISZTRÁCIÓ', x: 252, y: 1018, width: 576, fontSize: 32, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
      ],
    },
    // ─────────── 14 ───────────
    {
      id: 'food-recipe', name: 'Étlap / Recept', emoji: '🍽️', desc: 'Étel bemutatása ingerkeltően',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 800, width: 1080, height: 550, fill: '#fefce8', opacity: 0.98 },
        { type: 'figure', subType: 'rect', x: 0, y: 797, width: 1080, height: 6, fill: '#f59e0b', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 835, width: 160, height: 44, fill: '#f59e0b', opacity: 1, cornerRadius: 22 },
        { type: 'text', text: 'FRISS!', x: 68, y: 847, width: 144, fontSize: 20, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
        { type: 'text', text: 'Házi Rizs', x: 60, y: 900, width: 960, fontSize: 110, fontFamily: 'Playfair Display', fontWeight: '700', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.0 },
        { type: 'text', text: 'Bowl', x: 60, y: 1010, width: 960, fontSize: 110, fontFamily: 'Playfair Display', fontWeight: '700', align: 'left', fill: '#f59e0b', opacity: 1, lineHeight: 1.0 },
        { type: 'text', text: 'Friss zöldségekkel, tofuval és szezám-szójaszósszal', x: 60, y: 1150, width: 750, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'left', fill: '#555555', opacity: 1, lineHeight: 1.4 },
        { type: 'text', text: '880 Ft/adag', x: 800, y: 1200, width: 220, fontSize: 36, fontFamily: font, fontWeight: '800', align: 'right', fill: '#111111', opacity: 1 },
      ],
    },
    // ─────────── 15 ───────────
    {
      id: 'fitness-motivation', name: 'Fitness Motiváció', emoji: '💪', desc: 'Motiváló sportos kép',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.6)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 8, height: 1350, fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 1072, y: 0, width: 8, height: 1350, fill: accent, opacity: 1 },
        { type: 'text', text: 'NO', x: 60, y: 200, width: 960, fontSize: 280, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 0.08, lineHeight: 1.0 },
        { type: 'text', text: 'PAIN', x: 60, y: 450, width: 960, fontSize: 280, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 0.08, lineHeight: 1.0 },
        { type: 'text', text: 'NO GAIN.', x: 60, y: 300, width: 960, fontSize: 120, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.0, textShadow: '0 4px 20px rgba(0,0,0,0.8)' },
        { type: 'text', text: 'Az eredmény ott kezdődik ahol a komfortzónád végződik.', x: 60, y: 540, width: 960, fontSize: 44, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.75)', opacity: 1, lineHeight: 1.5 },
        { type: 'figure', subType: 'rect', x: 60, y: 720, width: 200, height: 5, fill: accent, opacity: 1 },
        { type: 'text', text: '— EDZZ KEMÉNYEN', x: 60, y: 760, width: 700, fontSize: 28, fontFamily: font, fontWeight: '700', align: 'left', fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 1200, width: 380, height: 80, fill: accent, opacity: 1, cornerRadius: 40 },
        { type: 'text', text: 'CSATLAKOZZ HOZZÁM', x: 72, y: 1218, width: 356, fontSize: 30, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
      ],
    },
    // ─────────── 16 ───────────
    {
      id: 'fashion-lookbook', name: 'Fashion Lookbook', emoji: '👗', desc: 'Divat editorial stílus',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.2)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 60, width: 960, height: 1230, fill: 'transparent', opacity: 1, border: '1px solid rgba(255,255,255,0.25)', cornerRadius: 2 },
        { type: 'text', text: 'SS25', x: 80, y: 100, width: 200, fontSize: 32, fontFamily: font, fontWeight: '800', align: 'left', fill: '#ffffff', opacity: 0.7 },
        { type: 'text', text: 'COLLECTION', x: 80, y: 140, width: 600, fontSize: 24, fontFamily: font, fontWeight: '400', align: 'left', fill: '#ffffff', opacity: 0.5 },
        { type: 'text', text: 'LOOK\n01', x: 780, y: 100, width: 260, fontSize: 52, fontFamily: font, fontWeight: '900', align: 'right', fill: '#ffffff', opacity: 0.7, lineHeight: 1.0 },
        { type: 'text', text: 'TAVASZI\nKOLLEKCIÓ', x: 80, y: 960, width: 800, fontSize: 100, fontFamily: 'Playfair Display', fontWeight: '700', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.0, textShadow: '0 4px 24px rgba(0,0,0,0.5)' },
        { type: 'text', text: 'Elegancia minden alkalomra', x: 80, y: 1180, width: 700, fontSize: 30, fontFamily: 'Playfair Display', fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.7)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 80, y: 1240, width: 80, height: 3, fill: '#ffffff', opacity: 0.6 },
        { type: 'text', text: 'Shop Now', x: 175, y: 1228, width: 200, fontSize: 22, fontFamily: 'Playfair Display', fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.8)', opacity: 1 },
      ],
    },
    // ─────────── 17 ───────────
    {
      id: 'real-estate', name: 'Ingatlan', emoji: '🏠', desc: 'Ingatlan hirdetés kártya',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 900, width: 1080, height: 450, fill: '#0f172a', opacity: 0.97 },
        { type: 'figure', subType: 'rect', x: 0, y: 897, width: 1080, height: 6, fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 935, width: 240, height: 56, fill: accent, opacity: 1, cornerRadius: 4 },
        { type: 'text', text: 'ELADÓ', x: 70, y: 950, width: 220, fontSize: 26, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
        { type: 'text', text: 'Luxus Penthouse\nBudapest, V. ker.', x: 60, y: 1010, width: 800, fontSize: 64, fontFamily: 'Playfair Display', fontWeight: '700', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.1 },
        { type: 'text', text: '185 m²  |  4 szoba  |  2 fürdőszoba', x: 60, y: 1190, width: 800, fontSize: 26, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
        { type: 'text', text: '189 000 000 Ft', x: 680, y: 940, width: 360, fontSize: 40, fontFamily: font, fontWeight: '900', align: 'right', fill: accent, opacity: 1 },
        { type: 'text', text: 'info@ingatlan.hu | +36 30 123 4567', x: 60, y: 1260, width: 960, fontSize: 22, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.4)', opacity: 1 },
      ],
    },
    // ─────────── 18 ───────────
    {
      id: 'music-release', name: 'Zeneművészet', emoji: '🎵', desc: 'Album / szám kiadás',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: `linear-gradient(145deg, #0a0010 0%, ${primary}cc 50%, #0a0010 100%)`, opacity: 1 },
        { type: 'figure', subType: 'circle', x: 190, y: 175, width: 700, height: 700, fill: accent, opacity: 0.06 },
        { type: 'figure', subType: 'circle', x: 290, y: 275, width: 500, height: 500, fill: accent, opacity: 0.1 },
        { type: 'figure', subType: 'circle', x: 390, y: 375, width: 300, height: 300, fill: accent, opacity: 0.18 },
        { type: 'text', text: 'MOST\nERHETŐ EL', x: 60, y: 950, width: 960, fontSize: 96, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1, lineHeight: 1.0, textShadow: '0 0 40px rgba(139,92,246,0.5)' },
        { type: 'text', text: 'feat. Vendég Művész', x: 60, y: 1140, width: 960, fontSize: 30, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.5)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 1220, width: 960, height: 60, fill: 'transparent', opacity: 1, border: `1px solid ${accent}66`, cornerRadius: 30 },
        { type: 'text', text: 'Hallgasd meg minden platformon', x: 70, y: 1238, width: 940, fontSize: 26, fontFamily: font, fontWeight: '600', align: 'center', fill: accent, opacity: 1 },
      ],
    },
    // ─────────── 19 ───────────
    {
      id: 'webinar', name: 'Webinar', emoji: '🖥️', desc: 'Online esemény bejelentés',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: `${primary}ee`, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 440, fill: 'rgba(255,255,255,0.04)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 60, width: 200, height: 56, fill: '#ef4444', opacity: 1, cornerRadius: 28 },
        { type: 'text', text: 'LIVE', x: 72, y: 76, width: 176, fontSize: 28, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1 },
        { type: 'text', text: 'INGYENES\nWEBINÁR', x: 60, y: 160, width: 960, fontSize: 120, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
        { type: 'figure', subType: 'rect', x: 60, y: 450, width: 960, height: 2, fill: 'rgba(255,255,255,0.1)', opacity: 1 },
        { type: 'text', text: 'Hogyan dupláld meg a bevételedet\n6 hónap alatt', x: 60, y: 500, width: 960, fontSize: 54, fontFamily: font, fontWeight: '700', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.3 },
        { type: 'text', text: 'Előzetes tapasztalat nem szükséges', x: 60, y: 720, width: 960, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.55)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 810, width: 480, height: 80, fill: 'rgba(255,255,255,0.08)', opacity: 1, cornerRadius: 8, border: '1px solid rgba(255,255,255,0.15)' },
        { type: 'text', text: 'Július 28. — 14:00', x: 72, y: 828, width: 456, fontSize: 28, fontFamily: font, fontWeight: '700', align: 'left', fill: '#ffffff', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 930, width: 960, height: 88, fill: accent, opacity: 1, cornerRadius: 44 },
        { type: 'text', text: 'REGISZTRÁLOK MOST', x: 72, y: 950, width: 936, fontSize: 36, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
      ],
    },
    // ─────────── 20 ───────────
    {
      id: 'before-after', name: 'Előtte / Utána', emoji: '⟺', desc: 'Előtte – utána összehasonlítás',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 540, height: 1350, fill: 'rgba(0,0,0,0.5)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 540, y: 0, width: 540, height: 1350, fill: 'rgba(0,0,0,0.2)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 536, y: 0, width: 8, height: 1350, fill: '#ffffff', opacity: 0.9 },
        { type: 'text', text: 'ELŐTTE', x: 40, y: 80, width: 460, fontSize: 56, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 0.7 },
        { type: 'text', text: 'UTÁNA', x: 580, y: 80, width: 460, fontSize: 56, fontFamily: font, fontWeight: '900', align: 'left', fill: accent, opacity: 1 },
        { type: 'text', text: 'VS', x: 440, y: 640, width: 200, fontSize: 100, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1 },
        { type: 'text', text: 'Látnod kell az eredményt', x: 60, y: 1180, width: 960, fontSize: 44, fontFamily: font, fontWeight: '700', align: 'center', fill: '#ffffff', opacity: 1 },
      ],
    },
    // ─────────── 21 ───────────
    {
      id: 'app-showcase', name: 'App Showcase', emoji: '📱', desc: 'Mobil app bemutatása',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: `linear-gradient(180deg, ${primary} 0%, #0f0820 100%)`, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 60, width: 280, height: 60, fill: 'rgba(255,255,255,0.08)', opacity: 1, cornerRadius: 30, border: '1px solid rgba(255,255,255,0.15)' },
        { type: 'text', text: 'ÚJ FRISSÍTÉS', x: 70, y: 78, width: 260, fontSize: 22, fontFamily: font, fontWeight: '700', align: 'center', fill: 'rgba(255,255,255,0.7)', opacity: 1 },
        { type: 'text', text: 'Az alkalmazás\namelyet vártál', x: 60, y: 180, width: 960, fontSize: 100, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.1 },
        { type: 'text', text: 'Kezelje a vállalkozását', x: 60, y: 440, width: 960, fontSize: 36, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.55)', opacity: 1 },
        { type: 'text', text: 'egyszerűen, bárhonnan.', x: 60, y: 488, width: 960, fontSize: 36, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.55)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 580, width: 280, height: 72, fill: accent, opacity: 1, cornerRadius: 16 },
        { type: 'text', text: 'LETÖLTÉS', x: 72, y: 598, width: 256, fontSize: 30, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 360, y: 580, width: 280, height: 72, fill: 'transparent', opacity: 1, cornerRadius: 16, border: '2px solid rgba(255,255,255,0.4)' },
        { type: 'text', text: 'TUDJ MEG TÖBBET', x: 372, y: 598, width: 256, fontSize: 24, fontFamily: font, fontWeight: '600', align: 'center', fill: '#ffffff', opacity: 1 },
      ],
    },
    // ─────────── 22 ───────────
    {
      id: 'travel', name: 'Utazás', emoji: '🌍', desc: 'Utazás / turizmus banner',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.35)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 600, fill: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)', opacity: 1 },
        { type: 'text', text: 'FEDEZD FEL', x: 60, y: 80, width: 960, fontSize: 28, fontFamily: font, fontWeight: '700', align: 'left', fill: accent, opacity: 1 },
        { type: 'text', text: 'Bali,\nIndonézia', x: 60, y: 120, width: 960, fontSize: 140, fontFamily: 'Playfair Display', fontWeight: '700', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.0, textShadow: '0 4px 24px rgba(0,0,0,0.5)' },
        { type: 'figure', subType: 'rect', x: 60, y: 430, width: 80, height: 4, fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 1050, width: 1080, height: 300, fill: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', opacity: 1 },
        { type: 'text', text: '7 ÉJ / 8 NAP', x: 60, y: 1100, width: 500, fontSize: 36, fontFamily: font, fontWeight: '700', align: 'left', fill: '#ffffff', opacity: 1 },
        { type: 'text', text: '299 000 Ft/fő-től', x: 60, y: 1155, width: 500, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 720, y: 1095, width: 320, height: 80, fill: accent, opacity: 1, cornerRadius: 40 },
        { type: 'text', text: 'FOGLALOK', x: 732, y: 1113, width: 296, fontSize: 30, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
      ],
    },
    // ─────────── 23 ───────────
    {
      id: 'dark-announcement', name: 'Sötét Bejelentés', emoji: '📢', desc: 'Drámai bejelentés sötét háttéren',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: '#030303', opacity: 0.95 },
        { type: 'figure', subType: 'circle', x: 240, y: 300, width: 600, height: 600, fill: accent, opacity: 0.06 },
        { type: 'figure', subType: 'rect', x: 60, y: 580, width: 960, height: 1, fill: 'rgba(255,255,255,0.08)', opacity: 1 },
        { type: 'text', text: 'FONTOS', x: 60, y: 180, width: 400, fontSize: 22, fontFamily: font, fontWeight: '800', align: 'left', fill: accent, opacity: 1 },
        { type: 'text', text: 'BEJELENTÉS', x: 60, y: 200, width: 960, fontSize: 30, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.3)', opacity: 1 },
        { type: 'text', text: 'Valami\nNagy\nKözeleg', x: 60, y: 280, width: 960, fontSize: 150, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
        { type: 'text', text: 'Készítsd el magad. 2025 júliusán minden megváltozik.', x: 60, y: 720, width: 960, fontSize: 36, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.5)', opacity: 1, lineHeight: 1.5 },
        { type: 'figure', subType: 'rect', x: 60, y: 860, width: 4, height: 120, fill: accent, opacity: 1 },
        { type: 'text', text: 'Kövesd figyelemmel a csatornáinkat a részletekért.', x: 88, y: 878, width: 900, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.4)', opacity: 1, lineHeight: 1.5 },
      ],
    },
    // ─────────── 24 ───────────
    {
      id: 'flash-sale', name: 'Flash Sale', emoji: '⚡', desc: 'Villám akciós banner',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: '#111111', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 6, fill: '#ef4444', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 1344, width: 1080, height: 6, fill: '#ef4444', opacity: 1 },
        { type: 'text', text: 'FLASH', x: 40, y: 120, width: 1000, fontSize: 220, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
        { type: 'text', text: 'SALE', x: 40, y: 330, width: 1000, fontSize: 220, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ef4444', opacity: 1, lineHeight: 1.0 },
        { type: 'figure', subType: 'rect', x: 40, y: 555, width: 1000, height: 3, fill: '#ef4444', opacity: 0.4 },
        { type: 'text', text: 'CSAK MA!', x: 40, y: 600, width: 1000, fontSize: 60, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 0.7 },
        { type: 'text', text: '70%', x: 40, y: 680, width: 600, fontSize: 280, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
        { type: 'text', text: 'minden termékre', x: 40, y: 1010, width: 700, fontSize: 50, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.5)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 40, y: 1110, width: 1000, height: 88, fill: '#ef4444', opacity: 1, cornerRadius: 6 },
        { type: 'text', text: 'VÁSÁROLJ MOST', x: 52, y: 1130, width: 976, fontSize: 40, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1 },
      ],
    },
    // ─────────── 25 ───────────
    {
      id: 'carousel-slide', name: 'Carousel Dia', emoji: '🎠', desc: 'Carousel poszt stílus, szám jelzéssel',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: `${primary}f5`, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 10, fill: accent, opacity: 1 },
        { type: 'text', text: '01 / 05', x: 60, y: 50, width: 200, fontSize: 24, fontFamily: font, fontWeight: '700', align: 'left', fill: 'rgba(255,255,255,0.4)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 200, y: 60, width: 820, height: 2, fill: 'rgba(255,255,255,0.1)', opacity: 1 },
        { type: 'text', text: '5 TIPP', x: 60, y: 200, width: 960, fontSize: 130, fontFamily: font, fontWeight: '900', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
        { type: 'text', text: 'a sikeres\nkezdethez', x: 60, y: 450, width: 960, fontSize: 80, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.6)', opacity: 1, lineHeight: 1.2 },
        { type: 'figure', subType: 'rect', x: 60, y: 660, width: 80, height: 4, fill: accent, opacity: 1 },
        { type: 'text', text: 'Nyomd a nyilat', x: 60, y: 700, width: 600, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.4)', opacity: 1 },
        { type: 'text', text: 'a további tippekért -->', x: 60, y: 740, width: 700, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.4)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 1290, width: 1080, height: 60, fill: 'rgba(0,0,0,0.25)', opacity: 1 },
        { type: 'text', text: '● ● ● ○ ○', x: 60, y: 1305, width: 960, fontSize: 20, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
      ],
    },
    // ─────────── 26 ───────────
    {
      id: 'giveaway', name: 'Nyeremény', emoji: '🎁', desc: 'Giveaway / nyeremény banner',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: `linear-gradient(135deg, ${primary} 0%, #1e1060 100%)`, opacity: 1 },
        { type: 'figure', subType: 'circle', x: -100, y: -100, width: 600, height: 600, fill: accent, opacity: 0.08 },
        { type: 'figure', subType: 'circle', x: 580, y: 900, width: 700, height: 700, fill: accent, opacity: 0.05 },
        { type: 'text', text: 'GIVEAWAY!', x: 60, y: 120, width: 960, fontSize: 110, fontFamily: font, fontWeight: '900', align: 'center', fill: accent, opacity: 1, textShadow: `0 0 40px ${accent}88` },
        { type: 'figure', subType: 'rect', x: 60, y: 260, width: 960, height: 2, fill: 'rgba(255,255,255,0.1)', opacity: 1 },
        { type: 'text', text: 'Nyerj el egy', x: 60, y: 310, width: 960, fontSize: 50, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.6)', opacity: 1 },
        { type: 'text', text: 'Prémium Csomagot', x: 60, y: 370, width: 960, fontSize: 80, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1 },
        { type: 'text', text: '100 000 Ft értékű nyeremény', x: 60, y: 470, width: 960, fontSize: 36, fontFamily: font, fontWeight: '700', align: 'center', fill: accent, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 560, width: 960, height: 2, fill: 'rgba(255,255,255,0.1)', opacity: 1 },
        { type: 'text', text: 'Hogyan vehetsz részt:', x: 60, y: 620, width: 960, fontSize: 30, fontFamily: font, fontWeight: '700', align: 'left', fill: 'rgba(255,255,255,0.5)', opacity: 1 },
        { type: 'text', text: '1. Kövesd az oldalt', x: 60, y: 680, width: 960, fontSize: 36, fontFamily: font, fontWeight: '600', align: 'left', fill: '#ffffff', opacity: 1 },
        { type: 'text', text: '2. Likelj és oszd meg', x: 60, y: 740, width: 960, fontSize: 36, fontFamily: font, fontWeight: '600', align: 'left', fill: '#ffffff', opacity: 1 },
        { type: 'text', text: '3. Jelölj meg 2 barátot', x: 60, y: 800, width: 960, fontSize: 36, fontFamily: font, fontWeight: '600', align: 'left', fill: '#ffffff', opacity: 1 },
        { type: 'text', text: 'Sorsolás: Július 30.', x: 60, y: 920, width: 960, fontSize: 28, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.45)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 200, y: 990, width: 680, height: 80, fill: accent, opacity: 1, cornerRadius: 40 },
        { type: 'text', text: 'RÉSZVÉTEL', x: 212, y: 1008, width: 656, fontSize: 34, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
      ],
    },
    // ─────────── 27 ───────────
    {
      id: 'quote-card', name: 'Idézet Kártya', emoji: '💭', desc: 'Inspiráló idézet nagybetűkkel',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: '#f8fafc', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 12, height: 1350, fill: primary, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 12, fill: primary, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 1338, width: 1080, height: 12, fill: primary, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 1068, y: 0, width: 12, height: 1350, fill: primary, opacity: 1 },
        { type: 'text', text: '"', x: 40, y: 120, width: 300, fontSize: 300, fontFamily: 'Playfair Display', fontWeight: '900', align: 'left', fill: primary, opacity: 0.12, lineHeight: 1.0 },
        { type: 'text', text: 'A legnagyobb\nkockázat az,\nha nem mersz\nkockáztatni.', x: 60, y: 300, width: 960, fontSize: 96, fontFamily: 'Playfair Display', fontWeight: '700', align: 'left', fill: primary, opacity: 1, lineHeight: 1.15 },
        { type: 'figure', subType: 'rect', x: 60, y: 980, width: 120, height: 5, fill: accent, opacity: 1 },
        { type: 'text', text: '— Mark Zuckerberg', x: 60, y: 1010, width: 600, fontSize: 32, fontFamily: 'Playfair Display', fontWeight: '400', align: 'left', fill: primary, opacity: 0.6 },
        { type: 'text', text: '@brand', x: 820, y: 1280, width: 220, fontSize: 26, fontFamily: font, fontWeight: '700', align: 'right', fill: primary, opacity: 0.4 },
      ],
    },
    // ─────────── 28 ───────────
    {
      id: 'summer-vibes', name: 'Nyári Hangulat', emoji: '☀️', desc: 'Nyári szezonális banner',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: 'rgba(0,0,0,0.25)', opacity: 1 },
        { type: 'figure', subType: 'circle', x: 780, y: -80, width: 420, height: 420, fill: '#fbbf24', opacity: 0.25 },
        { type: 'figure', subType: 'circle', x: 820, y: -40, width: 320, height: 320, fill: '#f97316', opacity: 0.2 },
        { type: 'text', text: 'NYÁR 2025', x: 60, y: 60, width: 700, fontSize: 28, fontFamily: font, fontWeight: '700', align: 'left', fill: '#fbbf24', opacity: 1 },
        { type: 'text', text: 'Nyári\nKollekció', x: 60, y: 800, width: 960, fontSize: 130, fontFamily: 'Playfair Display', fontWeight: '700', align: 'left', fill: '#ffffff', opacity: 1, lineHeight: 1.05, textShadow: '0 4px 24px rgba(0,0,0,0.5)' },
        { type: 'text', text: 'A nyár minden pillanatára', x: 60, y: 1100, width: 800, fontSize: 36, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.7)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 60, y: 1180, width: 300, height: 74, fill: '#fbbf24', opacity: 1, cornerRadius: 37 },
        { type: 'text', text: 'VÁSÁRLÁS', x: 72, y: 1198, width: 276, fontSize: 28, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
      ],
    },
    // ─────────── 29 ───────────
    {
      id: 'subscription', name: 'Előfizetés CTA', emoji: '📧', desc: 'Email feliratkozás / newsletter',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: `${primary}f0`, opacity: 1 },
        { type: 'figure', subType: 'rect', x: 80, y: 80, width: 920, height: 1190, fill: 'rgba(255,255,255,0.03)', opacity: 1, cornerRadius: 16, border: '1px solid rgba(255,255,255,0.08)' },
        { type: 'figure', subType: 'circle', x: 440, y: 100, width: 200, height: 200, fill: accent, opacity: 0.15 },
        { type: 'text', text: 'Ne maradj le!', x: 60, y: 180, width: 960, fontSize: 36, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.5)', opacity: 1 },
        { type: 'text', text: 'Iratkozz fel\na hírlevélre', x: 60, y: 350, width: 960, fontSize: 110, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1, lineHeight: 1.0 },
        { type: 'figure', subType: 'rect', x: 440, y: 620, width: 200, height: 3, fill: accent, opacity: 1 },
        { type: 'text', text: 'Heti egy email. Semmi spam.\nExkluzív ajánlatok és tippek.', x: 60, y: 660, width: 960, fontSize: 36, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.55)', opacity: 1, lineHeight: 1.5 },
        { type: 'figure', subType: 'rect', x: 100, y: 820, width: 880, height: 88, fill: 'rgba(255,255,255,0.07)', opacity: 1, cornerRadius: 12, border: '1px solid rgba(255,255,255,0.12)' },
        { type: 'text', text: 'email@gmail.com', x: 120, y: 844, width: 640, fontSize: 30, fontFamily: font, fontWeight: '400', align: 'left', fill: 'rgba(255,255,255,0.25)', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 100, y: 950, width: 880, height: 88, fill: accent, opacity: 1, cornerRadius: 12 },
        { type: 'text', text: 'FELIRATKOZÁS', x: 112, y: 970, width: 856, fontSize: 36, fontFamily: font, fontWeight: '800', align: 'center', fill: '#000000', opacity: 1 },
        { type: 'text', text: 'Bármikor leiratkozhatsz. Adataid biztonságban.', x: 60, y: 1080, width: 960, fontSize: 22, fontFamily: font, fontWeight: '400', align: 'center', fill: 'rgba(255,255,255,0.3)', opacity: 1 },
      ],
    },
    // ─────────── 30 ───────────
    {
      id: 'product-grid', name: 'Termék Grid', emoji: '🔲', desc: '4 termék négy mezőbe rendezve',
      layers: [
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 1350, fill: '#f1f5f9', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 130, fill: primary, opacity: 1 },
        { type: 'text', text: 'LEGJOBB VÁLASZTÉKUNK', x: 60, y: 42, width: 960, fontSize: 42, fontFamily: font, fontWeight: '900', align: 'center', fill: '#ffffff', opacity: 1 },
        { type: 'figure', subType: 'rect', x: 20, y: 150, width: 510, height: 550, fill: '#ffffff', opacity: 1, cornerRadius: 12 },
        { type: 'figure', subType: 'rect', x: 550, y: 150, width: 510, height: 550, fill: '#ffffff', opacity: 1, cornerRadius: 12 },
        { type: 'figure', subType: 'rect', x: 20, y: 720, width: 510, height: 550, fill: '#ffffff', opacity: 1, cornerRadius: 12 },
        { type: 'figure', subType: 'rect', x: 550, y: 720, width: 510, height: 550, fill: '#ffffff', opacity: 1, cornerRadius: 12 },
        { type: 'text', text: 'Termék A\n4 990 Ft', x: 40, y: 600, width: 470, fontSize: 32, fontFamily: font, fontWeight: '700', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.4 },
        { type: 'text', text: 'Termék B\n6 490 Ft', x: 570, y: 600, width: 470, fontSize: 32, fontFamily: font, fontWeight: '700', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.4 },
        { type: 'text', text: 'Termék C\n3 990 Ft', x: 40, y: 1170, width: 470, fontSize: 32, fontFamily: font, fontWeight: '700', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.4 },
        { type: 'text', text: 'Termék D\n8 990 Ft', x: 570, y: 1170, width: 470, fontSize: 32, fontFamily: font, fontWeight: '700', align: 'left', fill: '#111111', opacity: 1, lineHeight: 1.4 },
      ],
    },
  ];
}
