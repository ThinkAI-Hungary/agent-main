import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SatoriTextLayer {
  id: string;
  text: string;
  x?: number;
  y?: number;
  fontSize?: number;
  color?: string;
  opacity?: number;
  fontWeight?: string | number;
  textAlign?: 'left' | 'center' | 'right';
  visible?: boolean;
}

export interface SatoriRenderOptions {
  width: number;
  height: number;
  text: string;
  cta?: string;
  position?: 'top' | 'center' | 'bottom';
  satoriStyleId?: string;
  colors: { primary: string; secondary?: string; accent: string };
  fontFamily: string;
  padding?: number;
  borderRadius?: number;
  opacity?: number;
  fontSize?: number;
  overlayX?: number;
  overlayY?: number;
  satoriColor?: string;

  // Visibility toggles
  showBorder?: boolean;
  showCta?: boolean;
  showBadge?: boolean;

  // Multi-layer support
  textLayers?: SatoriTextLayer[];

  // Granular overrides
  textOpts?: { color?: string; opacity?: number; fontSize?: number; x?: number; y?: number };
  ctaOpts?: { color?: string; opacity?: number; fontSize?: number; x?: number; y?: number; bgColor?: string };
  shapeOpts?: { color?: string; opacity?: number; x?: number; y?: number };
}


export class SatoriRenderer {

  private static normalizeHex(color: string): string {
    let hex = color.trim().toLowerCase();
    if (hex.startsWith('rgb')) {
      const match = hex.match(/\d+/g);
      if (match && match.length >= 3) {
        const r = parseInt(match[0]).toString(16).padStart(2, '0');
        const g = parseInt(match[1]).toString(16).padStart(2, '0');
        const b = parseInt(match[2]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
      }
    }
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (hex.length === 4) {
      return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    if (hex.length !== 7) return '#000000';
    return hex;
  }

  private static getLuminance(hex: string): number {
    const norm = this.normalizeHex(hex);
    const c = norm.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    const a = [r, g, b].map(v => {
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }

  private static getContrastRatio(color1: string, color2: string): number {
    const l1 = this.getLuminance(color1);
    const l2 = this.getLuminance(color2);
    const brightest = Math.max(l1, l2);
    const darkest = Math.min(l1, l2);
    return (brightest + 0.05) / (darkest + 0.05);
  }

  private static ensureContrast(color: string, bg: string, fallbackColor = '#111827'): string {
    try {
      const normColor = this.normalizeHex(color);
      const normBg = this.normalizeHex(bg);
      const ratio = this.getContrastRatio(normColor, normBg);
      if (ratio < 4.5) {
        return fallbackColor;
      }
      return normColor;
    } catch (e) {
      return fallbackColor;
    }
  }

  private static estimateTextWidth(text: string, fz: number): number {
    return text.length * (fz * 0.55);
  }

  private static wrapText(text: string, maxChars: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      if ((cur + w).length > maxChars) { lines.push(cur.trim()); cur = w + ' '; }
      else cur += w + ' ';
    }
    lines.push(cur.trim());
    return lines.filter(l => l.length > 0);
  }

  private static esc(s: string): string {
    return s.replace(/[<>&"']/g, (c: string) =>
      (({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' } as Record<string, string>)[c] || c));
  }

  private static isLight(hex: string): boolean {
    const h = (hex || '#000').replace('#', '').padEnd(6, '0');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160;
  }

  private static textOn(bg: string): string { return this.isLight(bg) ? '#1a1a1a' : '#ffffff'; }

  private static al(opacity: number | undefined, fallback = 90): number {
    return Math.max(0, Math.min(1, (opacity ?? fallback) / 100));
  }

  private static ts(lines: string[], x: number, lh: number): string {
    return lines.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lh}">${this.esc(l)}</tspan>`).join('');
  }

  private static s_gradient_bottom(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const t = o.textOpts || {}; const c = o.ctaOpts || {}; const s = o.shapeOpts || {};

    const fz = t.fontSize || o.fontSize || 52;
    const alpha = this.al(s.opacity ?? o.opacity, 88);
    const mainColor = s.color || o.satoriColor || colors.accent;

    const lines = this.wrapText(text, 22); const lh = fz * 1.3; const tb = lines.length * lh;
    const totalH = tb + (cta ? 80 : 0);
    const gradH = Math.min(H * 0.6, totalH + 200);
    const ty = H - totalH - 100 + (t.y ?? o.overlayY ?? 0);
    const cx = W / 2 + (t.x ?? o.overlayX ?? 0);

    const ctaW = cta ? this.estimateTextWidth(cta, c.fontSize || 28) + 48 : 0;
    const ctaY = ty + tb + 25 + (c.y || 0);
    const ctaX = (W - ctaW) / 2 + (c.x ?? o.overlayX ?? 0);

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="${alpha}"/></linearGradient></defs><rect x="0" y="${H - gradH}" width="${W}" height="${gradH}" fill="url(#g)"/><rect x="0" y="${H - 8}" width="${W}" height="8" fill="${mainColor}" opacity="0.9"/>${!o.textLayers?.length ? `<text x="${cx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="${t.color || '#ffffff'}" fill-opacity="${this.al(t.opacity, 100)}" text-anchor="middle" dominant-baseline="hanging">${this.ts(lines, cx, lh)}</text>` : ''}${cta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="56" fill="${c.bgColor || mainColor}" fill-opacity="${this.al(c.opacity, 100)}" rx="28"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 28}" font-family="${fontFamily},sans-serif" font-size="${c.fontSize || 28}" font-weight="800" fill="${c.color || this.textOn(c.bgColor || mainColor)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}</svg>`;
  }

  private static s_gradient_left(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 48; const alpha = this.al(o.opacity, 85);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 18); const lh = fz * 1.3; const tb = lines.length * lh;
    const tx = 80 + ox; const ty = (H - tb) / 2 + oy;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#000" stop-opacity="${alpha}"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect x="0" y="0" width="${W * 0.55}" height="${H}" fill="url(#g)"/><rect x="0" y="0" width="8" height="${H}" fill="${colors.accent}" opacity="0.9"/>${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="#ffffff" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}${cta ? `<text x="${tx}" y="${ty + tb + 20}" font-family="${fontFamily},sans-serif" font-size="26" font-weight="700" fill="${colors.accent}">${this.esc(cta)} &#x2192;</text>` : ''}</svg>`;
  }

  private static s_white_card(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 44; const alpha = this.al(o.opacity, 97);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 22); const lh = fz * 1.3; const tb = lines.length * lh;
    const pad = 48; const cardH = tb + pad * 2 + (cta ? 60 : 0);
    const tl = o.textLayers && o.textLayers[0];
    const cardY = tl ? (tl.y ?? 0) + H / 2 - pad : H - cardH + oy;
    const ty = cardY + pad; const tx = pad + (tl ? (tl.x ?? 0) : ox);
    const showBadge = o.showBadge !== false;
    const showCta = o.showCta !== false && !!cta;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${showBadge ? `<rect x="0" y="${cardY}" width="${W}" height="${cardH}" fill="white" fill-opacity="${alpha}"/><rect x="0" y="${cardY}" width="6" height="${cardH}" fill="${colors.accent}"/>` : ''}${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="#1a1a1a" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}${showCta ? `<text x="${tx}" y="${ty + tb + 16}" font-family="${fontFamily},sans-serif" font-size="26" font-weight="700" fill="${colors.primary}">${this.esc(cta)} &#x2192;</text>` : ''}</svg>`;
  }

  private static s_glass_card(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 44; const alpha = this.al(o.opacity, 38);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 22); const lh = fz * 1.3; const tb = lines.length * lh;
    const pad = 48; const cardH = tb + pad * 2 + (cta ? 60 : 0);
    const tl = o.textLayers && o.textLayers[0];
    const cardY = tl ? (tl.y ?? 0) + H / 2 - pad : H - cardH + oy;
    const ty = cardY + pad; const tx = pad + (tl ? (tl.x ?? 0) : ox);
    const showBadge = o.showBadge !== false;
    const showCta = o.showCta !== false && !!cta;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="white" stop-opacity="${alpha * 0.55}"/><stop offset="100%" stop-color="white" stop-opacity="${alpha}"/></linearGradient></defs>${showBadge ? `<rect x="0" y="${cardY}" width="${W}" height="${cardH}" fill="url(#gg)"/><rect x="0" y="${cardY}" width="${W}" height="1.5" fill="white" fill-opacity="0.5"/><rect x="0" y="${cardY}" width="6" height="${cardH}" fill="${colors.accent}"/>` : ''}${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="#ffffff" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}${showCta ? `<text x="${tx}" y="${ty + tb + 16}" font-family="${fontFamily},sans-serif" font-size="26" font-weight="700" fill="${colors.accent}">${this.esc(cta)} &#x2192;</text>` : ''}</svg>`;
  }

  private static s_luxury_frame(o: SatoriRenderOptions, fg?: { x: number; y: number; w: number; h: number }): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 46; const alpha = this.al(o.opacity, 85);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 22); const lh = fz * 1.3; const tb = lines.length * lh;
    const bandH = tb + 120; const bandY = H - bandH + oy; const ty = bandY + 55; const cx = W / 2 + ox;

    const fgX = fg?.x ?? 0;
    const fgY = fg?.y ?? 0;
    const fgW = fg?.w ?? W;
    const fgH = fg?.h ?? H;

    const showBorder = o.showBorder !== false;
    const showCta = o.showCta !== false && !!cta;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="${bandY}" width="${W}" height="${bandH}" fill="black" fill-opacity="${alpha}"/>${showBorder ? `<rect x="${fgX}" y="${fgY}" width="${fgW}" height="${fgH}" fill="none" stroke="#c9a96e" stroke-width="12"/><rect x="${fgX + 16}" y="${fgY + 16}" width="${fgW - 32}" height="${fgH - 32}" fill="none" stroke="#c9a96e" stroke-width="2" rx="4" stroke-dasharray="8,5"/>` : ''}${!o.textLayers?.length ? `<text x="${cx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="300" fill="#ffffff" text-anchor="middle" dominant-baseline="hanging" letter-spacing="4">${this.ts(lines, cx, lh)}</text>` : ''}<rect x="${cx - 35}" y="${ty + tb + 18}" width="70" height="2" fill="#c9a96e"/>${showCta ? `<text x="${cx}" y="${ty + tb + 36}" font-family="${fontFamily},sans-serif" font-size="24" font-weight="400" fill="#c9a96e" text-anchor="middle" letter-spacing="3">${this.esc(cta.toUpperCase())}</text>` : ''}</svg>`;
  }

  private static s_neo_brutal(o: SatoriRenderOptions, fg?: { x: number; y: number; w: number; h: number }): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 52; const alpha = this.al(o.opacity, 100);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 20); const lh = fz * 1.3; const tb = lines.length * lh;
    const bandH = tb + 100; const bandY = H - bandH + oy; const ty = bandY + 50; const tx = 56 + ox;

    const fgX = fg?.x ?? 0;
    const fgY = fg?.y ?? 0;
    const fgW = fg?.w ?? W;
    const fgH = fg?.h ?? H;

    const showBorder = o.showBorder !== false;
    const showCta = o.showCta !== false && !!cta;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${showBorder ? `<rect x="${fgX}" y="${fgY}" width="${fgW}" height="${fgH}" fill="none" stroke="black" stroke-width="20"/>` : ''}<rect x="0" y="${bandY}" width="${W}" height="${bandH}" fill="black" fill-opacity="${alpha}"/><rect x="0" y="${bandY}" width="16" height="${bandH}" fill="${colors.accent}"/>${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="900" fill="white" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}${showCta ? `<text x="${tx}" y="${ty + tb + 14}" font-family="${fontFamily},sans-serif" font-size="28" font-weight="800" fill="${colors.accent}">${this.esc(cta)}</text>` : ''}</svg>`;
  }

  private static s_ribbon_top(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 46; const alpha = this.al(o.opacity, 96);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 24); const lh = fz * 1.3; const tb = lines.length * lh;
    const ribbonH = tb + 80;
    const tl = o.textLayers && o.textLayers[0];
    const cardY = tl ? (tl.y ?? 0) + H / 2 - 40 : 0;
    const ty = cardY + 40; const cx = W / 2 + (tl ? (tl.x ?? 0) : ox);
    const txtColor = this.textOn(colors.accent);
    const showBadge = o.showBadge !== false;
    const showCta = o.showCta !== false && !!cta;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${showBadge ? `<rect x="0" y="${cardY}" width="${W}" height="${ribbonH}" fill="${colors.accent}" fill-opacity="${alpha}"/>` : ''}${!o.textLayers?.length ? `<text x="${cx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="900" fill="${txtColor}" text-anchor="middle" dominant-baseline="hanging">${this.ts(lines, cx, lh)}</text>` : ''}${showCta ? `<text x="${cx}" y="${ty + tb + 14}" font-family="${fontFamily},sans-serif" font-size="26" font-weight="700" fill="${txtColor}" text-anchor="middle">${this.esc(cta)}</text>` : ''}</svg>`;
  }

  private static s_circle_badge(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const t = o.textOpts || {}; const c = o.ctaOpts || {}; const s = o.shapeOpts || {};

    const mainColor = s.color || o.satoriColor || colors.primary;
    const accentColor = s.color || o.satoriColor || colors.accent;
    const fz = t.fontSize || o.fontSize || 42;
    const alpha = this.al(s.opacity ?? o.opacity, 92);

    const lines = this.wrapText(text, 14); const lh = fz * 1.3; const tb = lines.length * lh;
    const totalH = tb + (cta ? 90 : 0);
    const r = Math.max(totalH / 2 + 75, 170);

    const tl = o.textLayers && o.textLayers[0];
    const cx = tl ? (tl.x ?? 0) + (tl.textAlign === 'center' ? W / 2 : tl.textAlign === 'right' ? W - 100 : 100) : W / 2 + (s.x ?? o.overlayX ?? 0);
    const cy = tl ? (tl.y ?? 0) + H / 2 + totalH / 2 - 30 : H / 2 + (s.y ?? o.overlayY ?? 0);
    const ty = cy - totalH / 2 + (t.y || 0);
    const tx = cx + (t.x || 0);

    const txtColor = t.color || this.textOn(mainColor);
    const ctaW = cta ? this.estimateTextWidth(cta, c.fontSize || 24) + 40 : 0;
    const ctaY = ty + tb + 25 + (c.y || 0);
    const ctaX = cx + (c.x || 0);

    const showBadge = o.showBadge !== false;
    const showCta = o.showCta !== false && !!cta;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh"><feDropShadow dx="0" dy="4" stdDeviation="16" flood-opacity="0.35"/></filter></defs>${showBadge ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${mainColor}" fill-opacity="${alpha}" filter="url(#sh)"/><circle cx="${cx}" cy="${cy}" r="${r - 12}" fill="none" stroke="${accentColor}" stroke-width="3"/>` : ''}${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="900" fill="${txtColor}" fill-opacity="${this.al(t.opacity, 100)}" text-anchor="middle" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}${showCta ? `<rect x="${ctaX - ctaW / 2}" y="${ctaY}" width="${ctaW}" height="44" fill="${c.bgColor || accentColor}" fill-opacity="${this.al(c.opacity, 100)}" rx="22"/><text x="${ctaX}" y="${ctaY + 22}" font-family="${fontFamily},sans-serif" font-size="${c.fontSize || 24}" font-weight="700" fill="${c.color || this.textOn(c.bgColor || accentColor)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}</svg>`;
  }

  private static s_promo_accent(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 48; const alpha = this.al(o.opacity, 88);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 22); const lh = fz * 1.3; const tb = lines.length * lh;
    const gradH = Math.min(H * 0.5, tb + 180); const ty = H - tb - 90 + oy; const tx = 60 + ox;
    const badge = cta || 'PROMO'; const bW = this.estimateTextWidth(badge, 28) + 40;
    const showBadge = o.showBadge !== false;
    const showCta = o.showCta !== false && !!cta;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="${alpha}"/></linearGradient></defs>${showBadge ? `<rect x="0" y="${H - gradH}" width="${W}" height="${gradH}" fill="url(#g)"/>` : ''}${showCta ? `<rect x="${W - bW - 30}" y="28" width="${bW}" height="68" fill="${colors.accent}" rx="10"/><text x="${W - bW / 2 - 30}" y="62" font-family="${fontFamily},sans-serif" font-size="28" font-weight="900" fill="${this.textOn(colors.accent)}" text-anchor="middle">${this.esc(badge)}</text>` : ''}${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="white" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}</svg>`;
  }

  private static s_full_dark(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 56; const alpha = this.al(o.opacity, 70);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 20); const lh = fz * 1.3; const tb = lines.length * lh;
    const ty = (H - tb) / 2 + oy; const cx = W / 2 + ox;
    const ctaW = cta ? this.estimateTextWidth(cta, 28) + 48 : 0;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${W}" height="${H}" fill="black" fill-opacity="${alpha}"/><rect x="${cx - 40}" y="${ty - 30}" width="80" height="5" fill="${colors.accent}"/>${!o.textLayers?.length ? `<text x="${cx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="900" fill="white" text-anchor="middle" dominant-baseline="hanging">${this.ts(lines, cx, lh)}</text>` : ''}<rect x="${cx - 40}" y="${ty + tb + 22}" width="80" height="5" fill="${colors.accent}"/>${cta ? `<rect x="${(W - ctaW) / 2 + ox}" y="${ty + tb + 46}" width="${ctaW}" height="56" fill="${colors.accent}" rx="28"/><text x="${cx}" y="${ty + tb + 74}" font-family="${fontFamily},sans-serif" font-size="28" font-weight="800" fill="${this.textOn(colors.accent)}" text-anchor="middle">${this.esc(cta)}</text>` : ''}</svg>`;
  }

  private static s_minimal_bar(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 40; const alpha = this.al(o.opacity, 95);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 24); const lh = fz * 1.3; const tb = lines.length * lh;
    const pad = 32;
    const boxW = Math.max(...lines.map(l => this.estimateTextWidth(l, fz))) + pad * 2;
    const boxH = tb + pad * 1.5 + (cta ? 40 : 0);
    const boxX = (W - boxW) / 2 + ox; const boxY = H - boxH - 36 + oy;
    const ty = boxY + pad * 0.75; const cx = W / 2 + ox;
    const txtColor = this.textOn(colors.primary);
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" fill="${colors.primary}" fill-opacity="${alpha}" rx="8"/>${!o.textLayers?.length ? `<text x="${cx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="${txtColor}" text-anchor="middle" dominant-baseline="hanging">${this.ts(lines, cx, lh)}</text>` : ''}${cta ? `<text x="${cx}" y="${ty + tb + 8}" font-family="${fontFamily},sans-serif" font-size="22" font-weight="700" fill="${colors.accent}" text-anchor="middle">${this.esc(cta)}</text>` : ''}<rect x="0" y="${H - 10}" width="${W}" height="10" fill="${colors.accent}"/></svg>`;
  }

  private static s_feature_list(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const t = o.textOpts || {}; const c = o.ctaOpts || {}; const s = o.shapeOpts || {};
    const fz = t.fontSize || o.fontSize || 38;
    const alpha = this.al(s.opacity ?? o.opacity, 92);
    const mainColor = s.color || o.satoriColor || colors.primary;

    const rawLines = text.split('\n').filter(l => l.trim().length > 0);
    const lines = rawLines.length > 0 ? rawLines : ['Első kiemelt előny', 'Második fontos jellemző', 'Környezetbarát anyagok'];
    
    const lh = fz * 1.5;
    const tb = lines.length * lh;
    const pad = 40;
    const cardW = W - 160;
    const cardH = tb + pad * 2 + (cta ? 80 : 0);

    const tl = o.textLayers && o.textLayers[0];
    const cardX = tl ? (tl.x ?? 0) + W / 2 - pad : 80 + (s.x ?? o.overlayX ?? 0);
    const cardY = tl ? (tl.y ?? 0) + H / 2 - pad : H - cardH - 80 + (s.y ?? o.overlayY ?? 0);

    const txtColor = t.color || this.textOn(mainColor);
    const checkColor = colors.accent;

    let listSvg = '';
    lines.forEach((line, i) => {
      const ly = cardY + pad + (i * lh);
      const iconX = cardX + pad;
      const textX = iconX + 45;
      listSvg += `
        <g>
          <circle cx="${iconX + 12}" cy="${ly + fz/2 + 2}" r="14" fill="${checkColor}" fill-opacity="0.2"/>
          <path d="M${iconX + 5} ${ly + fz/2 + 2} l5 5 l10 -10" fill="none" stroke="${checkColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          ${!o.textLayers?.length ? `<text x="${textX}" y="${ly + fz/2}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="700" fill="${txtColor}" dominant-baseline="central">${this.esc(line)}</text>` : ''}
        </g>
      `;
    });

    const ctaW = cta ? this.estimateTextWidth(cta, c.fontSize || 24) + 40 : 0;
    const ctaY = cardY + pad + tb + 20 + (c.y || 0);
    const ctaX = cardX + (cardW - ctaW) / 2 + (c.x || 0);

    const showBadge = o.showBadge !== false;
    const showCta = o.showCta !== false && !!cta;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${showBadge ? `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="${mainColor}" fill-opacity="${alpha}" rx="16"/><rect x="${cardX}" y="${cardY}" width="${cardW}" height="6" fill="${checkColor}" rx="3"/>` : ''}
      ${listSvg}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="48" fill="${c.bgColor || checkColor}" fill-opacity="${this.al(c.opacity, 100)}" rx="24"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 24}" font-family="${fontFamily},sans-serif" font-size="${c.fontSize || 24}" font-weight="800" fill="${c.color || this.textOn(c.bgColor || checkColor)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  private static s_retro_sticker(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const t = o.textOpts || {}; const c = o.ctaOpts || {}; const s = o.shapeOpts || {};
    const fz = t.fontSize || o.fontSize || 54;
    const alpha = this.al(s.opacity ?? o.opacity, 100);
    const mainColor = s.color || o.satoriColor || colors.accent;
    const strokeColor = '#000000';

    const lines = this.wrapText(text, 15);
    const lh = fz * 1.3;
    const tb = lines.length * lh;
    
    const boxW = Math.max(...lines.map(l => this.estimateTextWidth(l, fz))) + 80;
    const boxH = tb + 80;

    const tl = o.textLayers && o.textLayers[0];
    const cx = tl ? (tl.x ?? 0) + (tl.textAlign === 'center' ? W / 2 : tl.textAlign === 'right' ? W - 100 : 100) : W / 2 + (s.x ?? o.overlayX ?? 0);
    const cy = tl ? (tl.y ?? 0) + H / 2 + tb / 2 : H / 2 - 100 + (s.y ?? o.overlayY ?? 0);
    
    const bx = cx - boxW/2;
    const by = cy - boxH/2;
    const ty = cy - tb/2;

    const ctaW = cta ? this.estimateTextWidth(cta, c.fontSize || 24) + 40 : 0;
    const ctaY = cy + boxH/2 + 40 + (c.y || 0);
    const ctaX = cx - ctaW / 2 + (c.x || 0);

    const showBadge = o.showBadge !== false;
    const showCta = o.showCta !== false && !!cta;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${showBadge ? `<g transform="rotate(-6, ${cx}, ${cy})">
        <rect x="${bx + 12}" y="${by + 12}" width="${boxW}" height="${boxH}" fill="${strokeColor}" rx="12"/>
        <rect x="${bx}" y="${by}" width="${boxW}" height="${boxH}" fill="${mainColor}" fill-opacity="${alpha}" stroke="${strokeColor}" stroke-width="6" rx="12"/>
        ${!o.textLayers?.length ? lines.map((l, i) => `<text x="${cx}" y="${ty + (i * lh) + fz/2}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="900" fill="${t.color || '#ffffff'}" text-anchor="middle" dominant-baseline="central" stroke="${strokeColor}" stroke-width="2">${this.esc(l)}</text>`).join('') : ''}
      </g>` : ''}
      ${showCta ? `
      <g transform="rotate(3, ${cx}, ${ctaY + 24})">
        <rect x="${ctaX + 6}" y="${ctaY + 6}" width="${ctaW}" height="48" fill="${strokeColor}" rx="24"/>
        <rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="48" fill="${c.bgColor || '#ffffff'}" stroke="${strokeColor}" stroke-width="4" rx="24"/>
        <text x="${ctaX + ctaW / 2}" y="${ctaY + 24}" font-family="${fontFamily},sans-serif" font-size="${c.fontSize || 24}" font-weight="800" fill="${c.color || strokeColor}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>
      </g>` : ''}
    </svg>`;
  }

  private static s_side_panel(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const t = o.textOpts || {}; const c = o.ctaOpts || {}; const s = o.shapeOpts || {};
    const fz = t.fontSize || o.fontSize || 44;
    const alpha = this.al(s.opacity ?? o.opacity, 94);
    const mainColor = s.color || o.satoriColor || colors.primary;

    const lines = this.wrapText(text, 16);
    const lh = fz * 1.3;
    const tb = lines.length * lh;
    
    const tl = o.textLayers && o.textLayers[0];
    const ox = tl ? (tl.x ?? 0) : (s.x ?? o.overlayX ?? 0);
    const oy = tl ? (tl.y ?? 0) : (s.y ?? o.overlayY ?? 0);
    
    const panelW = W * 0.38;
    const tx = 50 + ox;
    const ty = tl ? (tl.y ?? 0) + H / 2 : (H - tb) / 2 - 50 + oy;

    const txtColor = t.color || this.textOn(mainColor);
    const accentColor = colors.accent;

    const ctaW = cta ? this.estimateTextWidth(cta, c.fontSize || 22) + 30 : 0;
    const ctaY = ty + tb + 40 + (c.y || 0);
    const ctaX = tx + (c.x || 0);

    const showBadge = o.showBadge !== false;
    const showCta = o.showCta !== false && !!cta;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${showBadge ? `<rect x="0" y="0" width="${panelW}" height="${H}" fill="${mainColor}" fill-opacity="${alpha}"/><rect x="${panelW}" y="0" width="8" height="${H}" fill="${accentColor}"/>` : ''}
      ${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="${txtColor}" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="46" fill="${c.bgColor || accentColor}" fill-opacity="${this.al(c.opacity, 100)}" rx="8"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 23}" font-family="${fontFamily},sans-serif" font-size="${c.fontSize || 22}" font-weight="700" fill="${c.color || this.textOn(c.bgColor || accentColor)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  private static s_minimal_corner(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const t = o.textOpts || {}; const c = o.ctaOpts || {}; const s = o.shapeOpts || {};
    const fz = t.fontSize || o.fontSize || 36;
    const alpha = this.al(s.opacity ?? o.opacity, 96);
    const mainColor = s.color || o.satoriColor || '#ffffff';

    const lines = this.wrapText(text, 20);
    const lh = fz * 1.3;
    const tb = lines.length * lh;
    
    const pad = 30;
    const cardW = Math.max(...lines.map(l => this.estimateTextWidth(l, fz))) + pad * 2;
    const cardH = tb + pad * 2 + (cta ? 60 : 0);

    const tl = o.textLayers && o.textLayers[0];
    const cardX = tl ? (tl.x ?? 0) + (tl.textAlign === 'center' ? W / 2 : tl.textAlign === 'right' ? W - 100 : 100) - 12 - pad : W - cardW - 50 + (s.x ?? o.overlayX ?? 0);
    const cardY = tl ? (tl.y ?? 0) + H / 2 - pad : H - cardH - 50 + (s.y ?? o.overlayY ?? 0);

    const tx = cardX + pad;
    const ty = cardY + pad;

    const txtColor = t.color || '#1a1a1a';
    const accentColor = colors.accent;

    const ctaY = ty + tb + 15 + (c.y || 0);
    const ctaX = tx + (c.x || 0);

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="${mainColor}" fill-opacity="${alpha}" rx="12" stroke="${colors.primary}" stroke-width="2"/>
      <rect x="${cardX + 15}" y="${cardY + 15}" width="4" height="${cardH - 30}" fill="${accentColor}" rx="2"/>
      ${!o.textLayers?.length ? `<text x="${tx + 12}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="700" fill="${txtColor}" dominant-baseline="hanging">${this.ts(lines, tx + 12, lh)}</text>` : ''}
      ${cta ? `<text x="${ctaX + 12}" y="${ctaY}" font-family="${fontFamily},sans-serif" font-size="20" font-weight="800" fill="${c.color || accentColor}">${this.esc(cta)} &#x2192;</text>` : ''}
    </svg>`;
  }

  private static s_modern_minimal_border(o: SatoriRenderOptions, fg?: { x: number; y: number; w: number; h: number }): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 42;
    const lines = this.wrapText(text, 22); const lh = fz * 1.3; const tb = lines.length * lh;
    const tx = 80; const ty = 100;

    const fgX = fg?.x ?? 0;
    const fgY = fg?.y ?? 0;
    const fgW = fg?.w ?? W;
    const fgH = fg?.h ?? H;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${fgX}" y="${fgY}" width="${fgW}" height="${fgH}" fill="none" stroke="${colors.accent}" stroke-width="12"/>
      ${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="#ffffff" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}
      ${cta ? `<rect x="${W - 280}" y="${H - 120}" width="200" height="50" fill="${colors.accent}" rx="6"/><text x="${W - 180}" y="${H - 95}" font-family="${fontFamily},sans-serif" font-size="20" font-weight="800" fill="${this.textOn(colors.accent)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  private static s_asymmetric_split(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 44; const alpha = this.al(o.opacity, 92);
    const lines = this.wrapText(text, 14); const lh = fz * 1.3; const tb = lines.length * lh;
    const tx = 710; const ty = 200;
    const accentColor = colors.accent;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="680" y="0" width="400" height="${H}" fill="${colors.primary}" fill-opacity="${alpha}"/>
      <rect x="680" y="0" width="4" height="${H}" fill="${accentColor}"/>
      ${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="#ffffff" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}
      ${cta ? `<rect x="${tx}" y="${ty + tb + 40}" width="260" height="60" fill="${accentColor}" rx="30"/><text x="${tx + 130}" y="${ty + tb + 70}" font-family="${fontFamily},sans-serif" font-size="22" font-weight="800" fill="${this.textOn(accentColor)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  private static s_badge_ticker(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const barH = 68;
    const txt = text.trim() || 'PROMO • AKCIÓ • AJÁNLAT • KEDVEZMÉNY';
    const repeated = `${txt} • ${txt} • ${txt}`;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="40" width="${W}" height="${barH}" fill="${colors.accent}"/>
      <text x="${W / 2}" y="74" font-family="${fontFamily},sans-serif" font-size="24" font-weight="900" fill="${this.textOn(colors.accent)}" text-anchor="middle" dominant-baseline="central" letter-spacing="2">${this.esc(repeated.toUpperCase())}</text>
      <rect x="0" y="${H - 40 - barH}" width="${W}" height="${barH}" fill="${colors.accent}"/>
      <text x="${W / 2}" y="${H - 40 - barH / 2}" font-family="${fontFamily},sans-serif" font-size="24" font-weight="900" fill="${this.textOn(colors.accent)}" text-anchor="middle" dominant-baseline="central" letter-spacing="2">${this.esc(repeated.toUpperCase())}</text>
    </svg>`;
  }

  private static s_comic_speech(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 40;
    const lines = this.wrapText(text, 18); const lh = fz * 1.3; const tb = lines.length * lh;
    const bubbleW = 500; const bubbleH = tb + 100;
    const tl = o.textLayers && o.textLayers[0];
    const bx = tl ? (tl.x ?? 0) + W / 2 - 40 : 100;
    const by = tl ? (tl.y ?? 0) + H / 2 - 40 : 150;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <path d="M ${bx} ${by} L ${bx + bubbleW} ${by} L ${bx + bubbleW} ${by + bubbleH} L ${bx + 120} ${by + bubbleH} L ${bx + 80} ${by + bubbleH + 60} L ${bx + 90} ${by + bubbleH} L ${bx} ${by + bubbleH} Z" fill="white" stroke="black" stroke-width="8" stroke-linejoin="round"/>
      ${!o.textLayers?.length ? `<text x="${bx + 40}" y="${by + 40}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="900" fill="#111111" dominant-baseline="hanging">${this.ts(lines, bx + 40, lh)}</text>` : ''}
      ${cta ? `<rect x="${bx + 40}" y="${by + bubbleH - 40}" width="160" height="32" fill="${colors.accent}" stroke="black" stroke-width="4" rx="4"/><text x="${bx + 120}" y="${by + bubbleH - 24}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="900" fill="black" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  private static s_bold_kicker(o: SatoriRenderOptions, fg?: { x: number; y: number; w: number; h: number }): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 88;
    const lines = this.wrapText(text, 18); const lh = fz * 1.1; const tb = lines.length * lh;
    const tx = 100; const ty = 250;

    const fgX = fg?.x ?? 0;
    const fgY = fg?.y ?? 0;
    const fgW = fg?.w ?? W;
    const fgH = fg?.h ?? H;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${fgX}" y="${fgY}" width="${fgW}" height="${fgH}" fill="none" stroke="${colors.primary}" stroke-width="12"/>
      ${!o.textLayers?.length ? `
        <text x="${tx}" y="${ty - 60}" font-family="${fontFamily},sans-serif" font-size="28" font-weight="900" fill="${colors.accent}" dominant-baseline="hanging" letter-spacing="4">KATEGÓRIA</text>
        <rect x="${tx}" y="${ty - 20}" width="120" height="6" fill="${colors.accent}"/>
        <text x="${tx}" y="${ty + 10}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="900" fill="#ffffff" dominant-baseline="hanging" line-height="1.1">${this.ts(lines, tx, lh)}</text>
      ` : ''}
      ${cta ? `<rect x="${tx}" y="${H - 180}" width="300" height="74" fill="${colors.primary}" rx="6"/><text x="${tx + 150}" y="${H - 143}" font-family="${fontFamily},sans-serif" font-size="24" font-weight="800" fill="${this.textOn(colors.primary)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  private static s_social_proof_rating(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 24;
    const lines = this.wrapText(text || '„Tökéletesen fed, nagyon elégedett vagyok a minőséggel!”', 28);
    const lh = fz * 1.35; const tb = lines.length * lh;
    const cardH = tb + 110;
    const tl = o.textLayers && o.textLayers[0];
    const bx = tl ? (tl.x ?? 0) + W / 2 - 30 : W - 520;
    const by = tl ? (tl.y ?? 0) + H / 2 - 75 : 100;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="sh"><feDropShadow dx="0" dy="4" stdDeviation="12" flood-opacity="0.25"/></filter></defs>
      <rect x="${bx}" y="${by}" width="440" height="${cardH}" fill="white" rx="16" filter="url(#sh)"/>
      <text x="${bx + 30}" y="${by + 30}" font-family="${fontFamily},sans-serif" font-size="28" fill="#fbbf24">★★★★★</text>
      ${!o.textLayers?.length ? `<text x="${bx + 30}" y="${by + 75}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="600" fill="#333333" dominant-baseline="hanging">${this.ts(lines, bx + 30, lh)}</text>` : ''}
      ${cta ? `<text x="${bx + 30}" y="${by + cardH - 30}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="800" fill="${colors.primary}">${this.esc(cta)} &#x2192;</text>` : ''}
    </svg>`;
  }
  private static s_polaroid_frame(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 38;
    const lines = this.wrapText(text, 22); const lh = fz * 1.3;
    const borderT = 60; const borderB = 260; const borderLR = 60;
    const showCta = o.showCta !== false && !!cta;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <!-- White polaroid mask -->
      <path d="M0,0 H${W} V${H} H0 Z M${borderLR},${borderT} H${W - borderLR} V${H - borderB} H${borderLR} Z" fill="white"/>
      <rect x="${borderLR}" y="${borderT}" width="${W - borderLR * 2}" height="${H - borderT - borderB}" fill="none" stroke="#e5e7eb" stroke-width="2"/>
      ${!o.textLayers?.length ? `<text x="${W / 2}" y="${H - 180}" font-family="${fontFamily},cursive,sans-serif" font-size="${fz}" font-weight="700" fill="#222222" text-anchor="middle" dominant-baseline="hanging">${this.ts(lines, W / 2, lh)}</text>` : ''}
      ${showCta ? `<rect x="${W / 2 - 120}" y="${H - 85}" width="240" height="46" fill="${colors.accent}" rx="6"/><text x="${W / 2}" y="${H - 62}" font-family="${fontFamily},sans-serif" font-size="20" font-weight="800" fill="${this.textOn(colors.accent)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  private static s_diagonal_split(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 44; const alpha = this.al(o.opacity, 92);
    const lines = this.wrapText(text, 22); const lh = fz * 1.3; const tb = lines.length * lh;
    const tx = 100; const ty = H - tb - 120;
    const showBadge = o.showBadge !== false;
    const showCta = o.showCta !== false && !!cta;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${showBadge ? `<polygon points="0,${H * 0.7} ${W},${H * 0.55} ${W},${H} 0,${H}" fill="white" fill-opacity="${alpha}"/><line x1="0" y1="${H * 0.7}" x2="${W}" y2="${H * 0.55}" stroke="${colors.accent}" stroke-width="4"/>` : ''}
      ${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="900" fill="#1a1a1a" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}
      ${showCta ? `<rect x="${tx}" y="${H - 100}" width="240" height="46" fill="${colors.primary}" rx="23"/><text x="${tx + 120}" y="${H - 77}" font-family="${fontFamily},sans-serif" font-size="20" font-weight="800" fill="${this.textOn(colors.primary)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  private static s_tailwind_cta(o: SatoriRenderOptions, fg?: { x: number; y: number; w: number; h: number }): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 42;
    const pad = 48;
    
    // Align card precisely with the sharp foreground boundaries (no blur margin overlay)
    const fgX = fg ? fg.x : 90;
    const fgW = fg ? fg.w : W - 180;
    const fgY = fg ? fg.y : 0;
    const fgH = fg ? fg.h : H;

    const cardX = fgX;
    const cardW = fgW;

    // Filter only visible text layers that have content
    const activeLayers = (o.textLayers || []).filter(l => l.visible !== false && l.text.trim());

    // If activeLayers is empty, fallback to the main text option
    let layersToRender = activeLayers;
    if (layersToRender.length === 0) {
      layersToRender = [{
        id: 'productName',
        text: text || 'READY TO DIVE IN?',
        fontSize: fz,
        color: '#111827',
        opacity: 100,
        x: 0,
        y: 0,
        textAlign: 'left'
      }];
    }

    // Let's compute positions and total text height
    let currentYOffset = 0;
    const spacing = 12;
    const mainColor = '#f9fafb';

    const computedLayers = layersToRender.map((l) => {
      const isBrand = l.id === 'brandName';
      const isProduct = l.id === 'productName';
      const isPrice = l.id === 'price';
      const isSpec = l.id === 'spec';

      const fSize = l.fontSize || (isBrand ? 22 : isProduct ? 42 : isPrice ? 36 : isSpec ? 28 : 28);
      const fontW = isProduct ? '800' : isBrand ? '700' : '600';
      
      let rawColor = l.color;
      if (!rawColor) {
        rawColor = isBrand ? colors.accent : isPrice ? colors.primary : '#1f2937';
      }
      // Apply strict contrast check against white card background (#f9fafb)
      const fillColor = this.ensureContrast(rawColor, mainColor, isBrand ? colors.accent : '#1f2937');
      
      const wrappedLines = this.wrapText(l.text, 36);
      const lineH = fSize * 1.3;
      const height = wrappedLines.length * lineH;

      const relativeY = currentYOffset;
      currentYOffset += height + spacing;

      return {
        lines: wrappedLines,
        fontSize: fSize,
        fontWeight: fontW,
        color: fillColor,
        opacity: l.opacity ?? 100,
        lineHeight: lineH,
        relativeY
      };
    });

    const totalTextHeight = currentYOffset - spacing;
    const showCta = o.showCta !== false && !!cta;
    const cardH = totalTextHeight + pad * 2 + (showCta ? 100 : 0);

    // Dynamic vertical positioning relative to first text layer Y slider offset, safe constraints
    const tl = o.textLayers && o.textLayers[0];
    let cardY = tl ? (fgY + fgH / 2 + (tl.y ?? 0)) - pad : fgY + fgH - cardH - 80;

    // Apply vertical safety constraints within foreground sharp boundaries
    if (cardY < fgY + 20) cardY = fgY + 20;
    if (cardY + cardH > fgY + fgH - 20) cardY = fgY + fgH - cardH - 20;

    const showBadge = o.showBadge !== false;
    const primaryBtnColor = colors.accent;
    const primaryBtnText = this.textOn(colors.accent);

    const ctaW = cta ? this.estimateTextWidth(cta, 20) + 60 : 0;
    const secCta = 'Több infó';
    const secW = this.estimateTextWidth(secCta, 20) + 60;

    const ctaY = cardY + cardH - pad - 56;
    const ctaX = cardX + cardW - pad - ctaW;
    const secX = ctaX - secW - 16;

    const textsSvg = computedLayers.map(cl => {
      const ty = cardY + pad + cl.relativeY;
      const tx = cardX + pad;
      return `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${cl.fontSize}" font-weight="${cl.fontWeight}" fill="${cl.color}" fill-opacity="${this.al(cl.opacity, 100)}" dominant-baseline="hanging">${this.ts(cl.lines, tx, cl.lineHeight)}</text>`;
    }).join('\n');

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh"><feDropShadow dx="0" dy="10" stdDeviation="30" flood-opacity="0.15"/></filter>
      </defs>
      ${showBadge ? `
        <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="${mainColor}" rx="24" filter="url(#sh)"/>
        <rect x="${cardX}" y="${cardY + 24}" width="6" height="${cardH - 48}" fill="${colors.accent}" rx="3"/>
      ` : ''}
      
      ${textsSvg}

      ${showCta ? `
        <rect x="${secX}" y="${ctaY}" width="${secW}" height="56" fill="none" stroke="#e5e7eb" stroke-width="2" rx="28"/>
        <text x="${secX + secW / 2}" y="${ctaY + 28}" font-family="${fontFamily},sans-serif" font-size="20" font-weight="700" fill="#4b5563" text-anchor="middle" dominant-baseline="central">${this.esc(secCta)}</text>
        
        <rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="56" fill="${primaryBtnColor}" rx="28"/>
        <text x="${ctaX + ctaW / 2}" y="${ctaY + 28}" font-family="${fontFamily},sans-serif" font-size="20" font-weight="700" fill="${primaryBtnText}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>
      ` : ''}
    </svg>`;
  }

  public static generateSVG(options: SatoriRenderOptions, fgCoords?: { x: number; y: number; w: number; h: number }): string {
    let svg = '';
    switch (options.satoriStyleId || 'gradient-bottom') {
      case 'gradient-bottom': svg = this.s_gradient_bottom(options); break;
      case 'gradient-left': svg = this.s_gradient_left(options); break;
      case 'white-card': svg = this.s_white_card(options); break;
      case 'glass-card': svg = this.s_glass_card(options); break;
      case 'luxury-frame': svg = this.s_luxury_frame(options, fgCoords); break;
      case 'neo-brutal': svg = this.s_neo_brutal(options, fgCoords); break;
      case 'ribbon-top': svg = this.s_ribbon_top(options); break;
      case 'circle-badge': svg = this.s_circle_badge(options); break;
      case 'promo-accent': svg = this.s_promo_accent(options); break;
      case 'full-dark': svg = this.s_full_dark(options); break;
      case 'minimal-bar': svg = this.s_minimal_bar(options); break;
      case 'diagonal-split': svg = this.s_diagonal_split(options); break;
      case 'feature-list': svg = this.s_feature_list(options); break;
      case 'retro-sticker': svg = this.s_retro_sticker(options); break;
      case 'side-panel': svg = this.s_side_panel(options); break;
      case 'minimal-corner': svg = this.s_minimal_corner(options); break;
      case 'modern-minimal-border': svg = this.s_modern_minimal_border(options, fgCoords); break;
      case 'asymmetric-split': svg = this.s_asymmetric_split(options); break;
      case 'badge-ticker': svg = this.s_badge_ticker(options); break;
      case 'comic-speech': svg = this.s_comic_speech(options); break;
      case 'bold-kicker': svg = this.s_bold_kicker(options, fgCoords); break;
      case 'social-proof-rating': svg = this.s_social_proof_rating(options); break;
      case 'polaroid-frame': svg = this.s_polaroid_frame(options); break;
      case 'tailwind-cta': svg = this.s_tailwind_cta(options, fgCoords); break;
      default: svg = this.s_gradient_bottom(options); break;
    }

    // Append extra text layers if provided
    if (options.textLayers && options.textLayers.length > 0 && options.satoriStyleId !== 'tailwind-cta') {
      let extraLayersSvg = options.textLayers.filter(l => l.visible !== false).map(l => {
        const fz = l.fontSize || 48;
        const lines = this.wrapText(l.text, 22);
        const lh = fz * 1.3;

        // Unified coordinate system:
        // x=0, y=0 means center of image for easier manual placement.
        const cx = (l.x ?? 0) + (l.textAlign === 'center' ? options.width / 2 : l.textAlign === 'right' ? options.width - 100 : 100);
        const ty = (l.y ?? 0) + options.height / 2; // Center-relative Y

        const anchor = l.textAlign || 'left';

        return `<text x="${cx}" y="${ty}" font-family="${options.fontFamily},sans-serif" font-size="${fz}" font-weight="${l.fontWeight || '800'}" fill="${l.color || '#ffffff'}" fill-opacity="${this.al(l.opacity, 100)}" text-anchor="${anchor === 'left' ? 'start' : anchor === 'right' ? 'end' : 'middle'}" dominant-baseline="hanging">${this.ts(lines, cx, lh)}</text>`;
      }).join('');

      if (options.satoriStyleId === 'retro-sticker') {
        const tl = options.textLayers && options.textLayers[0];
        const scx = tl ? (tl.x ?? 0) + (tl.textAlign === 'center' ? options.width / 2 : tl.textAlign === 'right' ? options.width - 100 : 100) : options.width / 2 + (options.overlayX ?? 0);
        const lines = this.wrapText(tl ? tl.text : options.text, 15);
        const fz = tl?.fontSize || options.fontSize || 54;
        const lh = fz * 1.3;
        const tb = lines.length * lh;
        const scy = tl ? (tl.y ?? 0) + options.height / 2 + tb / 2 : options.height / 2 - 100 + (options.overlayY ?? 0);
        extraLayersSvg = `<g transform="rotate(-6, ${scx}, ${scy})">${extraLayersSvg}</g>`;
      }

      svg = svg.replace('</svg>', `${extraLayersSvg}</svg>`);
    }

    // Ensure all font family declarations support Hungarian accents via Segoe UI and Arial fallback
    svg = svg.replace(/font-family="([^"]+),sans-serif"/g, `font-family="$1,'Segoe UI',Arial,sans-serif"`);

    return svg;
  }


  public static async renderToBuffer(baseImageBuffer: Buffer, options: SatoriRenderOptions): Promise<Buffer> {
    const { width: W, height: H } = options;

    let fgCoords = { x: 0, y: 0, w: W, h: H };
    try {
      const meta = await sharp(baseImageBuffer).metadata();
      const origW = meta.width || W;
      const origH = meta.height || H;

      const ratio = Math.min(W / origW, H / origH);
      const fgW = Math.round(origW * ratio);
      const fgH = Math.round(origH * ratio);
      const fgX = Math.round((W - fgW) / 2);
      const fgY = Math.round((H - fgH) / 2);
      fgCoords = { x: fgX, y: fgY, w: fgW, h: fgH };
      console.log(`[SATORI-RENDER] Original dimensions: ${origW}x${origH}. Resized fg inside canvas: ${fgW}x${fgH} at top-left: (${fgX}, ${fgY})`);
    } catch (err: any) {
      console.warn('[SATORI-RENDER] Failed to read metadata, defaulting border to canvas size:', err.message);
    }

    const svg = this.generateSVG(options, fgCoords);

    // 1. Create a blurred and darkened background from the original image (to fill 1080x1350)
    // This replaces the ugly black bars with a "Magic Fill" effect.
    const bg = await sharp(baseImageBuffer)
      .resize(W, H, { fit: 'cover' })
      .flatten({ background: '#000000' }) // Ensure transparent areas become black before blur
      .blur(60)
      .modulate({ brightness: 0.6 }) // Slightly darken to make the overlay text pop
      .toBuffer();

    // 2. Resize the actual product image to 'inside' so it is NOT cropped
    const fg = await sharp(baseImageBuffer)
      .resize(W, H, { fit: 'inside', withoutEnlargement: false })
      .toBuffer();

    // 3. Composite foreground onto background, then SVG on top
    return sharp(bg)
      .composite([
        { input: fg, gravity: 'centre' }, // Product in the middle, full size
        { input: Buffer.from(svg), top: 0, left: 0 } // Satori SVG on top
      ])
      .png()
      .toBuffer();
  }
}