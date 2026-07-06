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

  // Multi-layer support
  textLayers?: SatoriTextLayer[];

  // Granular overrides
  textOpts?: { color?: string; opacity?: number; fontSize?: number; x?: number; y?: number };
  ctaOpts?: { color?: string; opacity?: number; fontSize?: number; x?: number; y?: number; bgColor?: string };
  shapeOpts?: { color?: string; opacity?: number; x?: number; y?: number };
}


export class SatoriRenderer {

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
      (({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' } as Record<string,string>)[c] || c));
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
    const cardY = H - cardH + oy; const ty = cardY + pad; const tx = pad + ox;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="${cardY}" width="${W}" height="${cardH}" fill="white" fill-opacity="${alpha}"/><rect x="0" y="${cardY}" width="6" height="${cardH}" fill="${colors.accent}"/>${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="#1a1a1a" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}${cta ? `<text x="${tx}" y="${ty + tb + 16}" font-family="${fontFamily},sans-serif" font-size="26" font-weight="700" fill="${colors.primary}">${this.esc(cta)} &#x2192;</text>` : ''}</svg>`;
  }

  private static s_glass_card(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 44; const alpha = this.al(o.opacity, 38);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 22); const lh = fz * 1.3; const tb = lines.length * lh;
    const pad = 48; const cardH = tb + pad * 2 + (cta ? 60 : 0);
    const cardY = H - cardH + oy; const ty = cardY + pad; const tx = pad + ox;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="white" stop-opacity="${alpha * 0.55}"/><stop offset="100%" stop-color="white" stop-opacity="${alpha}"/></linearGradient></defs><rect x="0" y="${cardY}" width="${W}" height="${cardH}" fill="url(#gg)"/><rect x="0" y="${cardY}" width="${W}" height="1.5" fill="white" fill-opacity="0.5"/><rect x="0" y="${cardY}" width="6" height="${cardH}" fill="${colors.accent}"/>${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="#ffffff" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}${cta ? `<text x="${tx}" y="${ty + tb + 16}" font-family="${fontFamily},sans-serif" font-size="26" font-weight="700" fill="${colors.accent}">${this.esc(cta)} &#x2192;</text>` : ''}</svg>`;
  }

  private static s_luxury_frame(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 46; const alpha = this.al(o.opacity, 85);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 22); const lh = fz * 1.3; const tb = lines.length * lh;
    const bandH = tb + 120; const bandY = H - bandH + oy; const ty = bandY + 55; const cx = W / 2 + ox;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="${bandY}" width="${W}" height="${bandH}" fill="black" fill-opacity="${alpha}"/><rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="#c9a96e" stroke-width="3" rx="4"/><rect x="28" y="28" width="${W - 56}" height="${H - 56}" fill="none" stroke="#c9a96e" stroke-width="1" rx="2" stroke-dasharray="8,5"/>${!o.textLayers?.length ? `<text x="${cx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="300" fill="#ffffff" text-anchor="middle" dominant-baseline="hanging" letter-spacing="4">${this.ts(lines, cx, lh)}</text>` : ''}<rect x="${cx - 35}" y="${ty + tb + 18}" width="70" height="2" fill="#c9a96e"/>${cta ? `<text x="${cx}" y="${ty + tb + 36}" font-family="${fontFamily},sans-serif" font-size="24" font-weight="400" fill="#c9a96e" text-anchor="middle" letter-spacing="3">${this.esc(cta.toUpperCase())}</text>` : ''}</svg>`;
  }

  private static s_neo_brutal(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 52; const alpha = this.al(o.opacity, 100);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 20); const lh = fz * 1.3; const tb = lines.length * lh;
    const bandH = tb + 100; const bandY = H - bandH + oy; const ty = bandY + 50; const tx = 56 + ox;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="black" stroke-width="20"/><rect x="0" y="${bandY}" width="${W}" height="${bandH}" fill="black" fill-opacity="${alpha}"/><rect x="0" y="${bandY}" width="16" height="${bandH}" fill="${colors.accent}"/>${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="900" fill="white" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}${cta ? `<text x="${tx}" y="${ty + tb + 14}" font-family="${fontFamily},sans-serif" font-size="28" font-weight="800" fill="${colors.accent}">${this.esc(cta)}</text>` : ''}</svg>`;
  }

  private static s_ribbon_top(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 46; const alpha = this.al(o.opacity, 96);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 24); const lh = fz * 1.3; const tb = lines.length * lh;
    const ribbonH = tb + 80; const ty = 40 + oy; const cx = W / 2 + ox;
    const txtColor = this.textOn(colors.accent);
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${W}" height="${ribbonH}" fill="${colors.accent}" fill-opacity="${alpha}"/>${!o.textLayers?.length ? `<text x="${cx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="900" fill="${txtColor}" text-anchor="middle" dominant-baseline="hanging">${this.ts(lines, cx, lh)}</text>` : ''}${cta ? `<text x="${cx}" y="${ty + tb + 14}" font-family="${fontFamily},sans-serif" font-size="26" font-weight="700" fill="${txtColor}" text-anchor="middle">${this.esc(cta)}</text>` : ''}</svg>`;
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
    
    const cx = W / 2 + (s.x ?? o.overlayX ?? 0); 
    const cy = H / 2 + (s.y ?? o.overlayY ?? 0); 
    const ty = cy - totalH / 2 + (t.y || 0);
    const tx = cx + (t.x || 0);
    
    const txtColor = t.color || this.textOn(mainColor);
    const ctaW = cta ? this.estimateTextWidth(cta, c.fontSize || 24) + 40 : 0;
    const ctaY = ty + tb + 25 + (c.y || 0);
    const ctaX = cx + (c.x || 0);

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh"><feDropShadow dx="0" dy="4" stdDeviation="16" flood-opacity="0.35"/></filter></defs><circle cx="${cx}" cy="${cy}" r="${r}" fill="${mainColor}" fill-opacity="${alpha}" filter="url(#sh)"/><circle cx="${cx}" cy="${cy}" r="${r - 12}" fill="none" stroke="${accentColor}" stroke-width="3"/>${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="900" fill="${txtColor}" fill-opacity="${this.al(t.opacity, 100)}" text-anchor="middle" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}${cta ? `<rect x="${ctaX - ctaW / 2}" y="${ctaY}" width="${ctaW}" height="44" fill="${c.bgColor || accentColor}" fill-opacity="${this.al(c.opacity, 100)}" rx="22"/><text x="${ctaX}" y="${ctaY + 22}" font-family="${fontFamily},sans-serif" font-size="${c.fontSize || 24}" font-weight="700" fill="${c.color || this.textOn(c.bgColor || accentColor)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}</svg>`;
  }

  private static s_promo_accent(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 48; const alpha = this.al(o.opacity, 88);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 22); const lh = fz * 1.3; const tb = lines.length * lh;
    const gradH = Math.min(H * 0.5, tb + 180); const ty = H - tb - 90 + oy; const tx = 60 + ox;
    const badge = cta || 'PROMO'; const bW = this.estimateTextWidth(badge, 28) + 40;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="${alpha}"/></linearGradient></defs><rect x="0" y="${H - gradH}" width="${W}" height="${gradH}" fill="url(#g)"/><rect x="${W - bW - 30}" y="28" width="${bW}" height="68" fill="${colors.accent}" rx="10"/><text x="${W - bW / 2 - 30}" y="62" font-family="${fontFamily},sans-serif" font-size="28" font-weight="900" fill="${this.textOn(colors.accent)}" text-anchor="middle">${this.esc(badge)}</text>${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="white" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}</svg>`;
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

  private static s_diagonal_split(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 44; const alpha = this.al(o.opacity, 93);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 22); const lh = fz * 1.3; const tb = lines.length * lh;
    const splitY = H * 0.62 + oy; const ty = splitY + 56; const tx = 60 + ox;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><polygon points="0,${splitY} 0,${H} ${W},${H} ${W},${splitY + H * 0.18}" fill="white" fill-opacity="${alpha}"/><rect x="0" y="${H - 8}" width="${W}" height="8" fill="${colors.accent}"/>${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="900" fill="#1a1a1a" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}${cta ? `<text x="${tx}" y="${ty + tb + 14}" font-family="${fontFamily},sans-serif" font-size="26" font-weight="700" fill="${colors.primary}">${this.esc(cta)} &#x2192;</text>` : ''}</svg>`;
  }

  public static generateSVG(options: SatoriRenderOptions): string {
    let svg = '';
    switch (options.satoriStyleId || 'gradient-bottom') {
      case 'gradient-bottom': svg = this.s_gradient_bottom(options); break;
      case 'gradient-left':   svg = this.s_gradient_left(options); break;
      case 'white-card':      svg = this.s_white_card(options); break;
      case 'glass-card':      svg = this.s_glass_card(options); break;
      case 'luxury-frame':    svg = this.s_luxury_frame(options); break;
      case 'neo-brutal':      svg = this.s_neo_brutal(options); break;
      case 'ribbon-top':      svg = this.s_ribbon_top(options); break;
      case 'circle-badge':    svg = this.s_circle_badge(options); break;
      case 'promo-accent':    svg = this.s_promo_accent(options); break;
      case 'full-dark':       svg = this.s_full_dark(options); break;
      case 'minimal-bar':     svg = this.s_minimal_bar(options); break;
      case 'diagonal-split':  svg = this.s_diagonal_split(options); break;
      default:                svg = this.s_gradient_bottom(options); break;
    }

    // Append extra text layers if provided
    if (options.textLayers && options.textLayers.length > 0) {
      const extraLayersSvg = options.textLayers.map(l => {
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
      
      svg = svg.replace('</svg>', `${extraLayersSvg}</svg>`);
    }

    return svg;
  }


  public static async renderToBuffer(baseImageBuffer: Buffer, options: SatoriRenderOptions): Promise<Buffer> {
    const svg = this.generateSVG(options);
    const { width: W, height: H } = options;

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