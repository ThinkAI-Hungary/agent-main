// @ts-nocheck
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { SatoriStyles } from './SatoriStyles';

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

  public static normalizeHex(color: string): string {
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

  public static getLuminance(hex: string): number {
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

  public static getContrastRatio(color1: string, color2: string): number {
    const l1 = this.getLuminance(color1);
    const l2 = this.getLuminance(color2);
    const brightest = Math.max(l1, l2);
    const darkest = Math.min(l1, l2);
    return (brightest + 0.05) / (darkest + 0.05);
  }

  public static ensureContrast(color: string, bg: string, fallbackColor = '#111827'): string {
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

  public static estimateTextWidth(text: string, fz: number): number {
    return text.length * (fz * 0.55);
  }

  public static wrapText(text: string, maxChars: number): string[] {
    const segments = text.split('\n');
    const lines: string[] = [];
    for (const segment of segments) {
      const words = segment.split(' ');
      let cur = '';
      for (const w of words) {
        if ((cur + w).length > maxChars) {
          if (cur.trim().length > 0) lines.push(cur.trim());
          cur = w + ' ';
        } else {
          cur += w + ' ';
        }
      }
      if (cur.trim().length > 0) lines.push(cur.trim());
    }
    return lines.filter(l => l.length > 0);
  }

  public static esc(s: string): string {
    return s.replace(/[<>&"']/g, (c: string) =>
      (({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' } as Record<string, string>)[c] || c));
  }

  public static isLight(hex: string): boolean {
    const h = (hex || '#000').replace('#', '').padEnd(6, '0');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160;
  }

  public static textOn(bg: string): string { return this.isLight(bg) ? '#1a1a1a' : '#ffffff'; }

  public static al(opacity: number | undefined, fallback = 90): number {
    return Math.max(0, Math.min(1, (opacity ?? fallback) / 100));
  }

  public static ts(lines: string[], x: number | string, lh: number): string {
    return lines.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lh}">${this.esc(l)}</tspan>`).join('');
  }



  public static generateSVG(options: SatoriRenderOptions, fgCoords?: { x: number; y: number; w: number; h: number }): string {
    let svg = '';
    switch (options.satoriStyleId || 'gradient-bottom') {
      case 'gradient-bottom': svg = SatoriStyles.s_gradient_bottom(options); break;
      case 'gradient-left': svg = SatoriStyles.s_gradient_left(options); break;
      case 'white-card': svg = SatoriStyles.s_white_card(options); break;
      case 'glass-card': svg = SatoriStyles.s_glass_card(options); break;
      case 'luxury-frame': svg = SatoriStyles.s_luxury_frame(options, fgCoords); break;
      case 'neo-brutal': svg = SatoriStyles.s_neo_brutal(options, fgCoords); break;
      case 'ribbon-top': svg = SatoriStyles.s_ribbon_top(options); break;
      case 'circle-badge': svg = SatoriStyles.s_circle_badge(options); break;
      case 'promo-accent': svg = SatoriStyles.s_promo_accent(options); break;
      case 'full-dark': svg = SatoriStyles.s_full_dark(options); break;
      case 'minimal-bar': svg = SatoriStyles.s_minimal_bar(options); break;
      case 'diagonal-split': svg = SatoriStyles.s_diagonal_split(options); break;
      case 'feature-list': svg = SatoriStyles.s_feature_list(options); break;
      case 'retro-sticker': svg = SatoriStyles.s_retro_sticker(options); break;
      case 'side-panel': svg = SatoriStyles.s_side_panel(options); break;
      case 'minimal-corner': svg = SatoriStyles.s_minimal_corner(options); break;
      case 'modern-minimal-border': svg = SatoriStyles.s_modern_minimal_border(options, fgCoords); break;
      case 'asymmetric-split': svg = SatoriStyles.s_asymmetric_split(options); break;
      case 'badge-ticker': svg = SatoriStyles.s_badge_ticker(options); break;
      case 'comic-speech': svg = SatoriStyles.s_comic_speech(options); break;
      case 'bold-kicker': svg = SatoriStyles.s_bold_kicker(options, fgCoords); break;
      case 'social-proof-rating': svg = SatoriStyles.s_social_proof_rating(options); break;
      case 'polaroid-frame': svg = SatoriStyles.s_polaroid_frame(options); break;
      case 'tailwind-cta': svg = SatoriStyles.s_tailwind_cta(options, fgCoords); break;

      // 9 Tailwind Card Variants
      case 'tailwind-gradient-bottom': svg = SatoriStyles.s_tailwind_gradient_bottom(options); break;
      case 'tailwind-gradient-left': svg = SatoriStyles.s_tailwind_gradient_left(options); break;
      case 'tailwind-luxury-frame': svg = SatoriStyles.s_tailwind_luxury_frame(options, fgCoords); break;
      case 'tailwind-neo-brutal': svg = SatoriStyles.s_tailwind_neo_brutal(options, fgCoords); break;
      case 'tailwind-ribbon-top': svg = SatoriStyles.s_tailwind_ribbon_top(options); break;
      case 'tailwind-circle-badge': svg = SatoriStyles.s_tailwind_circle_badge(options); break;
      case 'tailwind-feature-list': svg = SatoriStyles.s_tailwind_feature_list(options); break;
      case 'tailwind-side-panel': svg = SatoriStyles.s_tailwind_side_panel(options); break;
      case 'tailwind-minimal-corner': svg = SatoriStyles.s_tailwind_minimal_corner(options); break;

      // 10 Custom Styles
      case 'modernist-split': svg = SatoriStyles.s_modernist_split(options); break;
      case 'magazine-cover': svg = SatoriStyles.s_magazine_cover(options); break;
      case 'minimalist-editorial': svg = SatoriStyles.s_minimalist_editorial(options); break;
      case 'glow-dark': svg = SatoriStyles.s_glow_dark(options); break;
      case 'bold-slant': svg = SatoriStyles.s_bold_slant(options); break;
      case 'duotone-overlay': svg = SatoriStyles.s_duotone_overlay(options); break;
      case 'neon-sign': svg = SatoriStyles.s_neon_sign(options); break;
      case 'glass-list': svg = SatoriStyles.s_glass_list(options); break;
      case 'brushed-metal': svg = SatoriStyles.s_brushed_metal(options); break;
      case 'cyberpunk-hud': svg = SatoriStyles.s_cyberpunk_hud(options); break;

      // 10 Internet-Inspired Styles
      case 'stripe-card': svg = SatoriStyles.s_stripe_card(options); break;
      case 'linear-board': svg = SatoriStyles.s_linear_board(options); break;
      case 'apple-spec': svg = SatoriStyles.s_apple_spec(options); break;
      case 'netflix-billboard': svg = SatoriStyles.s_netflix_billboard(options); break;
      case 'airbnb-card': svg = SatoriStyles.s_airbnb_card(options); break;
      case 'spotify-lyrics': svg = SatoriStyles.s_spotify_lyrics(options); break;
      case 'notion-board': svg = SatoriStyles.s_notion_board(options); break;
      case 'figma-canvas': svg = SatoriStyles.s_figma_canvas(options); break;
      case 'github-readme': svg = SatoriStyles.s_github_readme(options); break;
      case 'tesla-minimal': svg = SatoriStyles.s_tesla_minimal(options); break;

      default: svg = SatoriStyles.s_gradient_bottom(options); break;
    }

    // Append extra text layers if provided (only for legacy styles, modernized styles render them internally)
    const internallyRenderedStyles = [
      'tailwind-cta', 'tailwind-gradient-bottom', 'tailwind-gradient-left',
      'tailwind-luxury-frame', 'tailwind-neo-brutal', 'tailwind-ribbon-top',
      'tailwind-circle-badge', 'tailwind-feature-list', 'tailwind-side-panel',
      'tailwind-minimal-corner', 'modernist-split', 'magazine-cover',
      'minimalist-editorial', 'glow-dark', 'bold-slant', 'duotone-overlay',
      'neon-sign', 'glass-list', 'brushed-metal', 'cyberpunk-hud',
      'stripe-card', 'linear-board', 'apple-spec', 'netflix-billboard',
      'airbnb-card', 'spotify-lyrics', 'notion-board', 'figma-canvas',
      'github-readme', 'tesla-minimal'
    ];
    if (options.textLayers && options.textLayers.length > 0 && !internallyRenderedStyles.includes(options.satoriStyleId)) {
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