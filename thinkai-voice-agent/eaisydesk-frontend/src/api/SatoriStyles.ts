// @ts-nocheck
import { SatoriRenderOptions, SatoriRenderer } from './SatoriRenderer';

export class SatoriStyles {

  // Helper references from SatoriRenderer
  private static esc(s: string): string { return SatoriRenderer.esc(s); }
  private static ts(lines: string[], x: number | string, lh: number): string { return SatoriRenderer.ts(lines, x, lh); }
  private static al(opacity: number | undefined, fallback = 90): number { return SatoriRenderer.al(opacity, fallback); }
  private static textOn(bg: string): string { return SatoriRenderer.textOn(bg); }
  private static ensureContrast(color: string, bg: string, fallback: string): string { return SatoriRenderer.ensureContrast(color, bg, fallback); }
  private static wrapText(text: string, max: number): string[] { return SatoriRenderer.wrapText(text, max); }
  private static estimateTextWidth(text: string, fz: number): number { return SatoriRenderer.estimateTextWidth(text, fz); }

  private static getLayersBounds(o: SatoriRenderOptions, defaultY: number, defaultH: number): { minY: number; maxY: number; height: number } {
    if (!o.textLayers || o.textLayers.length === 0) {
      return { minY: defaultY, maxY: defaultY + defaultH, height: defaultH };
    }
    const H = o.height || 1350;
    let minY = H;
    let maxY = 0;
    for (const l of o.textLayers) {
      if (l.visible === false) continue;
      const ly = (l.y ?? 0) + H / 2;
      const lLines = this.wrapText(l.text, 22).length;
      const lFz = l.fontSize || 48;
      const lHeight = lLines * lFz * 1.3;
      if (ly < minY) minY = ly;
      if (ly + lHeight > maxY) maxY = ly + lHeight;
    }
    if (maxY > minY) {
      return { minY, maxY, height: maxY - minY };
    }
    return { minY: defaultY, maxY: defaultY + defaultH, height: defaultH };
  }

  private static checkAndFixContrast(styleId: string | undefined, textColor: string): string {
    const darkStyles = [
      'gradient-bottom', 'gradient-left', 'full-dark', 'glow-dark', 'neon-sign', 
      'cyberpunk-hud', 'netflix-billboard', 'spotify-lyrics', 'tailwind-gradient-bottom', 
      'tailwind-gradient-left', 'tailwind-side-panel', 'tailwind-circle-badge', 
      'luxury-frame', 'tailwind-luxury-frame', 'neon-glow-frame', 'dark-announcement',
      'glass-card', 'glass-list', 'duotone-overlay', 'cyberpunk-hud', 'luxury-dark'
    ];
    const lightStyles = [
      'white-card', 'polaroid-frame', 'polaroid-white', 'quote-card', 'product-grid', 
      'airbnb-card', 'figma-canvas', 'notion-board'
    ];

    const cleanColor = textColor.trim().toLowerCase();
    
    // Check if the style is known to be dark
    const isDarkBg = darkStyles.includes(styleId || 'gradient-bottom');
    const isLightBg = lightStyles.includes(styleId || '');

    // Estimate text luminance
    let isTextLight = cleanColor === '#ffffff' || cleanColor === 'white' || cleanColor.includes('rgba(255,255,255');
    let isTextDark = cleanColor === '#000000' || cleanColor === 'black' || cleanColor === '#111' || cleanColor === '#1a1a1a';
    
    if (cleanColor.startsWith('#')) {
      try {
        const lum = SatoriRenderer.getLuminance(cleanColor);
        if (lum > 0.7) isTextLight = true;
        if (lum < 0.3) isTextDark = true;
      } catch (e) {}
    }

    if (isDarkBg && isTextDark) {
      // Flip dark text on dark background to white!
      return '#ffffff';
    }
    if (isLightBg && isTextLight) {
      // Flip light text on light background to dark grey/black!
      return '#1a1a1a';
    }

    return textColor;
  }

  private static renderTextLayers(
    o: SatoriRenderOptions,
    tx: number,
    ty: number,
    fz: number,
    lh: number,
    color: string,
    anchor: 'left' | 'center' | 'right',
    maxChars = 22,
    fontWeight = '800'
  ): string {
    const fontFamily = o.fontFamily || 'Inter';
    const styleId = o.satoriStyleId;
    
    if (!o.textLayers || o.textLayers.length === 0) {
      const lines = this.wrapText(o.text, maxChars);
      const textAnchor = anchor === 'left' ? 'start' : anchor === 'right' ? 'end' : 'middle';
      const fixedColor = this.checkAndFixContrast(styleId, color);
      return `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="${fontWeight}" fill="${fixedColor}" text-anchor="${textAnchor}" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>`;
    }

    return o.textLayers.filter(l => l.visible !== false).map(l => {
      const lfz = l.fontSize || fz;
      const llh = lfz * 1.35;
      const lLines = this.wrapText(l.text, maxChars);
      const lAnchor = l.textAlign || anchor;
      const textAnchor = lAnchor === 'left' ? 'start' : lAnchor === 'right' ? 'end' : 'middle';
      
      const cx = tx + (l.x ?? 0);
      const cy = ty + (l.y ?? 0);
      const fixedColor = this.checkAndFixContrast(styleId, l.color || color);
      return `<text x="${cx}" y="${cy}" font-family="${fontFamily},sans-serif" font-size="${lfz}" font-weight="${l.fontWeight || fontWeight}" fill="${fixedColor}" fill-opacity="${this.al(l.opacity, 100)}" text-anchor="${textAnchor}" dominant-baseline="hanging">${this.ts(lLines, cx, llh)}</text>`;
    }).join('\n');
  }

  // ── 24 Existing Styles (Modularized) ──────────────────────────────────────

  public static s_gradient_bottom(o: SatoriRenderOptions): string {
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

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000" stop-opacity="${alpha}"/>
        </linearGradient>
      </defs>
      <rect x="0" y="${H - gradH}" width="${W}" height="${gradH}" fill="url(#g)"/>
      <rect x="0" y="${H - 8}" width="${W}" height="8" fill="${mainColor}" opacity="0.9"/>
      ${!o.textLayers?.length ? `<text x="${cx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="${t.color || '#ffffff'}" fill-opacity="${this.al(t.opacity, 100)}" text-anchor="middle" dominant-baseline="hanging">${this.ts(lines, cx, lh)}</text>` : ''}
      ${cta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="56" fill="${c.bgColor || mainColor}" fill-opacity="${this.al(c.opacity, 100)}" rx="28"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 28}" font-family="${fontFamily},sans-serif" font-size="${c.fontSize || 28}" font-weight="800" fill="${c.color || this.textOn(c.bgColor || mainColor)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_gradient_left(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 48; const alpha = this.al(o.opacity, 85);
    const ox = o.overlayX || 0; const oy = o.overlayY || 0;
    const lines = this.wrapText(text, 18); const lh = fz * 1.3; const tb = lines.length * lh;
    const tx = 80 + ox; const ty = (H - tb) / 2 + oy;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#000" stop-opacity="${alpha}"/>
          <stop offset="100%" stop-color="#000" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${W * 0.55}" height="${H}" fill="url(#g)"/>
      <rect x="0" y="0" width="8" height="${H}" fill="${colors.accent}" opacity="0.9"/>
      ${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="#ffffff" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}
      ${cta ? `<text x="${tx}" y="${ty + tb + 20}" font-family="${fontFamily},sans-serif" font-size="26" font-weight="700" fill="${colors.accent}">${this.esc(cta)} &#x2192;</text>` : ''}
    </svg>`;
  }

  public static s_white_card(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 44; const alpha = this.al(o.opacity, 97);
    const lines = this.wrapText(text, 22); const lh = fz * 1.3; const tb = lines.length * lh;
    const cardH = tb + (cta ? 90 : 0) + 80;
    const cy = H - cardH - 60;
    const cx = 80; const tx = cx + 40; const ty = cy + 40;
    const showCta = o.showCta !== false && !!cta;
    const ctaW = cta ? this.estimateTextWidth(cta, 20) + 48 : 0;
    const ctaX = W - 80 - ctaW - 40;
    const ctaY = ty + tb - 10;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh"><feDropShadow dx="0" dy="8" stdDeviation="24" flood-opacity="0.12"/></filter>
      </defs>
      <rect x="${cx}" y="${cy}" width="${W - cx * 2}" height="${cardH}" fill="#ffffff" fill-opacity="${alpha}" rx="20" filter="url(#sh)"/>
      <rect x="${cx}" y="${cy + 20}" width="6" height="${cardH - 40}" fill="${colors.accent}" rx="3"/>
      ${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="#1a1a1a" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="46" fill="${colors.primary}" rx="23"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 23}" font-family="${fontFamily},sans-serif" font-size="20" font-weight="800" fill="${this.textOn(colors.primary)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_glass_card(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 44; const alpha = this.al(o.opacity, 25);
    const lines = this.wrapText(text, 22); const lh = fz * 1.3; const tb = lines.length * lh;
    const cardH = tb + (cta ? 90 : 0) + 80;
    const cy = H - cardH - 60;
    const cx = 80; const tx = cx + 40; const ty = cy + 40;
    const showCta = o.showCta !== false && !!cta;
    const ctaW = cta ? this.estimateTextWidth(cta, 20) + 48 : 0;
    const ctaX = W - 80 - ctaW - 40;
    const ctaY = ty + tb - 10;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh"><feDropShadow dx="0" dy="8" stdDeviation="24" flood-opacity="0.2"/></filter>
      </defs>
      <rect x="${cx}" y="${cy}" width="${W - cx * 2}" height="${cardH}" fill="#ffffff" fill-opacity="${alpha}" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1.5" rx="20" filter="url(#sh)"/>
      ${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="#ffffff" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="46" fill="${colors.accent}" rx="23"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 23}" font-family="${fontFamily},sans-serif" font-size="20" font-weight="800" fill="${this.textOn(colors.accent)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_luxury_frame(o: SatoriRenderOptions, fg?: { x: number; y: number; w: number; h: number }): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 38; const pad = 36;
    const lines = this.wrapText(text, 26); const lh = fz * 1.35; const tb = lines.length * lh;
    
    const fgX = fg ? fg.x : 90;
    const fgW = fg ? fg.w : W - 180;
    const fgY = fg ? fg.y : 0;
    const fgH = fg ? fg.h : H;

    const frameX = fgX + pad;
    const frameY = fgY + pad;
    const frameW = fgW - pad * 2;
    const frameH = fgH - pad * 2;

    const ty = frameY + frameH - tb - (cta ? 110 : 60);
    const cx = frameX + frameW / 2;
    const showCta = o.showCta !== false && !!cta;
    const ctaW = cta ? this.estimateTextWidth(cta, 18) + 40 : 0;
    const ctaX = cx - ctaW / 2;
    const ctaY = ty + tb + 25;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" fill="none" stroke="#c9a96e" stroke-width="2"/>
      <rect x="${frameX + 6}" y="${frameY + 6}" width="${frameW - 12}" height="${frameH - 12}" fill="none" stroke="#c9a96e" stroke-width="0.5" stroke-dasharray="6,4"/>
      ${!o.textLayers?.length ? `<text x="${cx}" y="${ty}" font-family="${fontFamily},serif,sans-serif" font-size="${fz}" font-weight="600" fill="#c9a96e" text-anchor="middle" dominant-baseline="hanging">${this.ts(lines, cx, lh)}</text>` : ''}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="40" fill="none" stroke="#c9a96e" stroke-width="1.5"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 20}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="700" fill="#c9a96e" text-anchor="middle" dominant-baseline="central">${this.esc(cta).toUpperCase()}</text>` : ''}
    </svg>`;
  }

  public static s_neo_brutal(o: SatoriRenderOptions, fg?: { x: number; y: number; w: number; h: number }): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 42;
    const pad = 48;
    
    const fgX = fg ? fg.x : 90;
    const fgW = fg ? fg.w : W - 180;
    const fgY = fg ? fg.y : 0;
    const fgH = fg ? fg.h : H;

    const cardX = fgX + pad;
    const cardW = fgW - pad * 2;

    const lines = this.wrapText(text, 20); const lh = fz * 1.35; const tb = lines.length * lh;
    const showCta = o.showCta !== false && !!cta;
    const cardH = tb + (showCta ? 105 : 0) + 70;
    const cardY = fgY + fgH - cardH - 60;

    const tx = cardX + 32;
    const ty = cardY + 32;

    const ctaW = cta ? this.estimateTextWidth(cta, 18) + 40 : 0;
    const ctaX = cardX + cardW - ctaW - 32;
    const ctaY = ty + tb + 15;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${cardX + 8}" y="${cardY + 8}" width="${cardW}" height="${cardH}" fill="#000000" rx="4"/>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="#fdf0cd" stroke="#000000" stroke-width="3" rx="4"/>
      ${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="900" fill="#000000" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}
      ${showCta ? `<rect x="${ctaX + 4}" y="${ctaY + 4}" width="${ctaW}" height="44" fill="#000" rx="4"/><rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="44" fill="${colors.accent}" stroke="#000" stroke-width="2.5" rx="4"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 22}" font-family="${fontFamily},sans-serif" font-size="18" font-weight="900" fill="#000" text-anchor="middle" dominant-baseline="central">${this.esc(cta).toUpperCase()}</text>` : ''}
    </svg>`;
  }

  public static s_ribbon_top(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 32;
    const lines = this.wrapText(text, 36); const lh = fz * 1.35; const tb = lines.length * lh;
    const ribbonH = tb + 40;
    const showCta = o.showCta !== false && !!cta;
    const ctaW = cta ? this.estimateTextWidth(cta, 16) + 32 : 0;
    const cx = W / 2 - (showCta ? (ctaW + 20) / 2 : 0);
    const ty = (ribbonH - tb) / 2;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="${ribbonH}" fill="${colors.primary}"/>
      <rect x="0" y="${ribbonH}" width="${W}" height="4" fill="${colors.accent}"/>
      ${!o.textLayers?.length ? `<text x="${cx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="#ffffff" text-anchor="${showCta ? 'end' : 'middle'}" dominant-baseline="hanging">${this.ts(lines, cx, lh)}</text>` : ''}
      ${showCta ? `<rect x="${cx + 20}" y="${(ribbonH - 40) / 2}" width="${ctaW}" height="40" fill="${colors.accent}" rx="20"/><text x="${cx + 20 + ctaW / 2}" y="${ribbonH / 2}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_circle_badge(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 34;
    const lines = this.wrapText(text, 15); const lh = fz * 1.3; const tb = lines.length * lh;
    const r = Math.max(140, (tb + (cta ? 60 : 0)) / 2 + 50);
    
    const tl = o.textLayers && o.textLayers[0];
    const cx = tl ? (tl.x ?? 0) + W / 2 : W / 2 + (o.overlayX ?? 0);
    const cy = tl ? (tl.y ?? 0) + H / 2 : H / 2 - 100 + (o.overlayY ?? 0);
    const ty = cy - tb / 2 - (cta ? 25 : 0);

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh"><feDropShadow dx="0" dy="8" stdDeviation="20" flood-opacity="0.25"/></filter>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${colors.accent}" filter="url(#sh)"/>
      <circle cx="${cx}" cy="${cy}" r="${r - 8}" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="8,5"/>
      ${!o.textLayers?.length ? `<text x="${cx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="hanging">${this.ts(lines, cx, lh)}</text>` : ''}
      ${cta ? `<rect x="${cx - 80}" y="${ty + tb + 15}" width="160" height="38" fill="#ffffff" rx="19"/><text x="${cx}" y="${ty + tb + 34}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="800" fill="${colors.accent}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_promo_accent(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 46; const alpha = this.al(o.opacity, 90);
    const lines = this.wrapText(text, 22); const lh = fz * 1.3; const tb = lines.length * lh;
    const ty = H - tb - 130;
    const showCta = o.showCta !== false && !!cta;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000" stop-opacity="${alpha}"/>
        </linearGradient>
      </defs>
      <rect x="0" y="${H - 450}" width="${W}" height="450" fill="url(#g)"/>
      ${!o.textLayers?.length ? `<text x="80" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="#ffffff" dominant-baseline="hanging">${this.ts(lines, 80, lh)}</text>` : ''}
      ${showCta ? `<rect x="80" y="${H - 100}" width="240" height="46" fill="${colors.accent}" rx="23"/><text x="200" y="${H - 77}" font-family="${fontFamily},sans-serif" font-size="20" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
      <g transform="translate(${W - 200}, 80) rotate(15)">
        <polygon points="0,0 120,0 100,100 20,100" fill="${colors.primary}"/>
        <text x="60" y="50" font-family="${fontFamily},sans-serif" font-size="24" font-weight="900" fill="#ffffff" text-anchor="middle" dominant-baseline="central">AKCIÓ!</text>
      </g>
    </svg>`;
  }

  public static s_full_dark(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 54; const alpha = this.al(o.opacity, 65);
    const lines = this.wrapText(text, 20); const lh = fz * 1.3; const tb = lines.length * lh;
    const ty = (H - tb) / 2 - (cta ? 50 : 0);
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#000000" fill-opacity="${alpha}"/>
      ${!o.textLayers?.length ? `<text x="${W / 2}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="hanging">${this.ts(lines, W / 2, lh)}</text>` : ''}
      ${cta ? `<rect x="${W / 2 - 120}" y="${ty + tb + 30}" width="240" height="52" fill="none" stroke="#ffffff" stroke-width="2.5" rx="26"/><text x="${W / 2}" y="${ty + tb + 56}" font-family="${fontFamily},sans-serif" font-size="22" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_minimal_bar(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 34;
    const lines = this.wrapText(text, 28); const lh = fz * 1.3; const tb = lines.length * lh;
    const showCta = o.showCta !== false && !!cta;
    const barH = tb + (showCta ? 70 : 0) + 40;
    const by = H - barH - 40;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="140" y="${by}" width="${W - 280}" height="${barH}" fill="${colors.primary}" rx="${barH / 2}"/>
      ${!o.textLayers?.length ? `<text x="${W / 2}" y="${by + 20}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="hanging">${this.ts(lines, W / 2, lh)}</text>` : ''}
      ${showCta ? `<rect x="${W / 2 - 90}" y="${by + 20 + tb + 10}" width="180" height="36" fill="#ffffff" rx="18"/><text x="${W / 2}" y="${by + 20 + tb + 28}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="800" fill="${colors.primary}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_diagonal_split(o: SatoriRenderOptions): string {
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

  public static s_feature_list(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const t = o.textOpts || {}; const c = o.ctaOpts || {}; const s = o.shapeOpts || {};
    const fz = t.fontSize || o.fontSize || 38;
    const alpha = this.al(s.opacity ?? o.opacity, 92);
    const mainColor = s.color || o.satoriColor || '#1e293b';

    const lines = this.wrapText(text, 22); const lh = fz * 1.35; const tb = lines.length * lh;
    const pad = 40;
    const cardW = Math.max(...lines.map(l => this.estimateTextWidth(l, fz))) + pad * 2 + 30;
    const cardH = tb + pad * 2 + (cta ? 80 : 0);

    const tl = o.textLayers && o.textLayers[0];
    const cardX = tl ? (tl.x ?? 0) + (tl.textAlign === 'center' ? W / 2 : tl.textAlign === 'right' ? W - 100 : 100) - pad - 15 : 100 + (s.x ?? o.overlayX ?? 0);
    const cardY = tl ? (tl.y ?? 0) + H / 2 - pad : H - cardH - 100 + (s.y ?? o.overlayY ?? 0);

    const tx = cardX + pad + 20;
    const ty = cardY + pad;

    const txtColor = t.color || '#ffffff';
    const accentColor = colors.accent;
    const showCta = o.showCta !== false && !!cta;

    const ctaW = cta ? this.estimateTextWidth(cta, c.fontSize || 20) + 40 : 0;
    const ctaY = ty + tb + 20 + (c.y || 0);
    const ctaX = cardX + cardW - ctaW - pad + (c.x || 0);

    const bulletsSvg = lines.map((l, i) => {
      const ly = ty + (i * lh);
      return `<circle cx="${tx - 20}" cy="${ly + fz / 2}" r="5" fill="${accentColor}"/><text x="${tx}" y="${ly}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="700" fill="${txtColor}" dominant-baseline="hanging">${this.esc(l)}</text>`;
    }).join('\n');

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh"><feDropShadow dx="0" dy="8" stdDeviation="24" flood-opacity="0.25"/></filter>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="${mainColor}" fill-opacity="${alpha}" rx="16" filter="url(#sh)"/>
      ${!o.textLayers?.length ? bulletsSvg : ''}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="42" fill="${c.bgColor || accentColor}" rx="21"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 21}" font-family="${fontFamily},sans-serif" font-size="${c.fontSize || 20}" font-weight="800" fill="${c.color || this.textOn(c.bgColor || accentColor)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_retro_sticker(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const t = o.textOpts || {}; const c = o.ctaOpts || {}; const s = o.shapeOpts || {};
    const fz = t.fontSize || o.fontSize || 54;
    const alpha = this.al(s.opacity ?? o.opacity, 100);
    const mainColor = s.color || o.satoriColor || '#fbbf24';
    const strokeColor = '#000000';

    const lines = this.wrapText(text, 15); const lh = fz * 1.3; const tb = lines.length * lh;
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

  public static s_side_panel(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const t = o.textOpts || {}; const c = o.ctaOpts || {}; const s = o.shapeOpts || {};
    const fz = t.fontSize || o.fontSize || 44;
    const alpha = this.al(s.opacity ?? o.opacity, 94);
    const mainColor = s.color || o.satoriColor || colors.primary;

    const lines = this.wrapText(text, 16); const lh = fz * 1.3; const tb = lines.length * lh;
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

  public static s_minimal_corner(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const t = o.textOpts || {}; const c = o.ctaOpts || {}; const s = o.shapeOpts || {};
    const fz = t.fontSize || o.fontSize || 36;
    const alpha = this.al(s.opacity ?? o.opacity, 96);
    const mainColor = s.color || o.satoriColor || '#ffffff';

    const lines = this.wrapText(text, 20); const lh = fz * 1.3; const tb = lines.length * lh;
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

  public static s_modern_minimal_border(o: SatoriRenderOptions, fg?: { x: number; y: number; w: number; h: number }): string {
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

  public static s_asymmetric_split(o: SatoriRenderOptions): string {
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

  public static s_badge_ticker(o: SatoriRenderOptions): string {
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

  public static s_comic_speech(o: SatoriRenderOptions): string {
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

  public static s_bold_kicker(o: SatoriRenderOptions, fg?: { x: number; y: number; w: number; h: number }): string {
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
        <text x="${tx}" y="${ty + 10}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="900" fill="#ffffff" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>
      ` : ''}
      ${cta ? `<rect x="${tx}" y="${H - 180}" width="300" height="74" fill="${colors.primary}" rx="6"/><text x="${tx + 150}" y="${H - 143}" font-family="${fontFamily},sans-serif" font-size="24" font-weight="800" fill="${this.textOn(colors.primary)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_social_proof_rating(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 24;
    const lines = this.wrapText(text || '„Tökéletesen fed, nagyon elégedett vagyok a minőséggel!”', 28);
    const lh = fz * 1.35; const tb = lines.length * lh;
    
    const tl = o.textLayers && o.textLayers[0];
    const bx = tl ? (tl.x ?? 0) + 70 : W - 520;
    
    // Use dynamic bounds from layers if present
    const bounds = this.getLayersBounds(o, 175, tb);
    
    const cardH = bounds.height + 110;
    const by = bounds.minY - 75;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="sh"><feDropShadow dx="0" dy="4" stdDeviation="12" flood-opacity="0.25"/></filter></defs>
      <rect x="${bx}" y="${by}" width="440" height="${cardH}" fill="white" rx="16" filter="url(#sh)"/>
      <text x="${bx + 30}" y="${by + 30}" font-family="${fontFamily},sans-serif" font-size="28" fill="#fbbf24">★★★★★</text>
      ${!o.textLayers?.length ? `<text x="${bx + 30}" y="${by + 75}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="600" fill="#333333" dominant-baseline="hanging">${this.ts(lines, bx + 30, lh)}</text>` : ''}
      ${cta ? `<text x="${bx + 30}" y="${by + cardH - 30}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="800" fill="${colors.primary}">${this.esc(cta)} &#x2192;</text>` : ''}
    </svg>`;
  }

  public static s_polaroid_frame(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 38;
    const lines = this.wrapText(text, 22); const lh = fz * 1.3;
    const borderT = 60; const borderB = 260; const borderLR = 60;
    const showCta = o.showCta !== false && !!cta;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <path d="M0,0 H${W} V${H} H0 Z M${borderLR},${borderT} H${W - borderLR} V${H - borderB} H${borderLR} Z" fill="white"/>
      <rect x="${borderLR}" y="${borderT}" width="${W - borderLR * 2}" height="${H - borderT - borderB}" fill="none" stroke="#e5e7eb" stroke-width="2"/>
      ${!o.textLayers?.length ? `<text x="${W / 2}" y="${H - 180}" font-family="${fontFamily},cursive,sans-serif" font-size="${fz}" font-weight="700" fill="#222222" text-anchor="middle" dominant-baseline="hanging">${this.ts(lines, W / 2, lh)}</text>` : ''}
      ${showCta ? `<rect x="${W / 2 - 120}" y="${H - 85}" width="240" height="46" fill="${colors.accent}" rx="6"/><text x="${W / 2}" y="${H - 62}" font-family="${fontFamily},sans-serif" font-size="20" font-weight="800" fill="${this.textOn(colors.accent)}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_tailwind_cta(o: SatoriRenderOptions, fg?: { x: number; y: number; w: number; h: number }): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 42;
    const pad = 48;
    
    // Position horizontally centered on screen and aligned with blur boundaries
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
        color: '#ffffff',
        opacity: 100,
        x: 0,
        y: 0,
        textAlign: 'left'
      }];
    }

    // Let's compute positions and total text height
    let currentYOffset = 0;
    const spacing = 14;
    const mainColor = '#0b0f19'; // Deep luxury obsidian blue-black

    const computedLayers = layersToRender.map((l) => {
      const isBrand = l.id === 'brandName';
      const isProduct = l.id === 'productName';
      const isPrice = l.id === 'price';
      const isSpec = l.id === 'spec';

      const fSize = l.fontSize || (isBrand ? 20 : isProduct ? 44 : isPrice ? 38 : isSpec ? 28 : 28);
      const fontW = isProduct ? '800' : isBrand ? '800' : '600';
      
      // Spacing out letters for the brand name to create a premium fashion/luxury look
      let displayText = l.text;
      if (isBrand) {
        displayText = l.text.toUpperCase().split('').join(' ');
      }

      let rawColor = l.color;
      if (!rawColor) {
        rawColor = isBrand ? colors.accent : isPrice ? colors.accent : '#f8fafc';
      }
      
      // Check contrast against the dark background (#0b0f19)
      const fillColor = this.ensureContrast(rawColor, mainColor, isBrand ? colors.accent : '#f8fafc');
      
      const wrappedLines = this.wrapText(displayText, 38);
      const lineH = fSize * 1.35;
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
        relativeY,
        isBrand
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
    const primaryBtnText = '#ffffff';

    const ctaW = cta ? this.estimateTextWidth(cta, 20) + 60 : 0;
    const ctaY = cardY + cardH - pad - 56;
    const ctaX = cardX + cardW - pad - ctaW;

    const textsSvg = computedLayers.map(cl => {
      const ty = cardY + pad + cl.relativeY;
      const tx = cardX + pad;
      const textFill = cl.isBrand ? `url(#brand-text-grad)` : cl.color.startsWith('#fff') ? `url(#text-grad)` : cl.color;
      return `<text x="${tx}" y="${ty}" font-family="${fontFamily},sans-serif" font-size="${cl.fontSize}" font-weight="${cl.fontWeight}" fill="${textFill}" fill-opacity="${this.al(cl.opacity, 100)}" dominant-baseline="hanging">${this.ts(cl.lines, tx, cl.lineHeight)}</text>`;
    }).join('\n');

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- High-fidelity drop shadow for premium depth -->
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="16" stdDeviation="36" flood-color="#000000" flood-opacity="0.55"/>
        </filter>
        <!-- Glowing gradient border -->
        <linearGradient id="border-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${colors.primary}" stop-opacity="0.8"/>
          <stop offset="50%" stop-color="${colors.accent}" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="${colors.primary}" stop-opacity="0.2"/>
        </linearGradient>
        <!-- Luxury glass card background -->
        <linearGradient id="card-bg-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" stop-opacity="0.94"/>
          <stop offset="100%" stop-color="#020617" stop-opacity="0.97"/>
        </linearGradient>
        <!-- Product title silver gradient -->
        <linearGradient id="text-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="60%" stop-color="#f1f5f9"/>
          <stop offset="100%" stop-color="#cbd5e1"/>
        </linearGradient>
        <!-- Brand title gold/accent gradient -->
        <linearGradient id="brand-text-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${colors.accent}"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.8"/>
        </linearGradient>
        <!-- CTA button gradient -->
        <linearGradient id="cta-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${colors.primary}"/>
          <stop offset="100%" stop-color="${colors.accent}"/>
        </linearGradient>
      </defs>
      
      ${showBadge ? `
        <!-- Main Card Backdrop with Gradient Stroke -->
        <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#card-bg-grad)" rx="28" filter="url(#sh)"/>
        <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="none" stroke="url(#border-grad)" stroke-width="2" rx="28"/>
        <!-- Decorative subtle luxury accent top-left bar -->
        <path d="M ${cardX + 28} ${cardY} L ${cardX + 120} ${cardY}" stroke="url(#cta-grad)" stroke-width="4" stroke-linecap="round"/>
      ` : ''}
      
      ${textsSvg}

      ${showCta ? `
        <!-- Primary Button (Glowing Gradient) -->
        <rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="56" fill="url(#cta-grad)" rx="28" filter="url(#sh)"/>
        <text x="${ctaX + ctaW / 2}" y="${ctaY + 28}" font-family="${fontFamily},sans-serif" font-size="18" font-weight="800" fill="${primaryBtnText}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>
      ` : ''}
    </svg>`;
  }

  // ── 9 Tailwind Card Variants ──────────────────────────────────────────────

  public static s_tailwind_gradient_bottom(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 44; const pad = 40;
    const lines = this.wrapText(text, 22); const lh = fz * 1.35; const tb = lines.length * lh;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, H - tb - 170, tb);
    const cardH = bounds.height + (showCta ? 90 : 0) + pad * 2;
    const cardW = W - 180;
    const cardX = 90;
    const cardY = bounds.minY - pad;

    const tx = cardX + pad;
    const ty = cardY + pad;
    const ctaW = cta ? this.estimateTextWidth(cta, 18) + 48 : 0;
    const ctaX = cardX + cardW - pad - ctaW;
    const ctaY = bounds.maxY + 10;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="28" flood-color="#000000" flood-opacity="0.45"/></filter>
        <linearGradient id="card-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" stop-opacity="0.94"/>
          <stop offset="100%" stop-color="#020617" stop-opacity="0.97"/>
        </linearGradient>
        <linearGradient id="border-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${colors.primary}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="${colors.accent}" stop-opacity="0.2"/>
        </linearGradient>
        <linearGradient id="btn-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${colors.primary}"/><stop offset="100%" stop-color="${colors.accent}"/>
        </linearGradient>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#card-bg)" rx="24" filter="url(#sh)"/>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="none" stroke="url(#border-grad)" stroke-width="2" rx="24"/>
      <path d="M ${cardX + 24} ${cardY} L ${cardX + 100} ${cardY}" stroke="url(#btn-grad)" stroke-width="4" stroke-linecap="round"/>
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#ffffff', 'left', 22)}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="48" fill="url(#btn-grad)" rx="24"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 24}" font-family="${fontFamily},sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_tailwind_gradient_left(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 42; const pad = 44;
    const lines = this.wrapText(text, 16); const lh = fz * 1.35; const tb = lines.length * lh;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, (H - (tb + (cta ? 90 : 0) + pad * 2)) / 2, tb);
    const cardW = 440;
    const cardH = bounds.height + (showCta ? 90 : 0) + pad * 2;
    const cardX = 80;
    const cardY = bounds.minY - pad;

    const tx = cardX + pad;
    const ty = cardY + pad;
    const ctaW = cta ? this.estimateTextWidth(cta, 18) + 44 : 0;
    const ctaX = tx;
    const ctaY = bounds.maxY + 20;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="28" flood-color="#000" flood-opacity="0.4"/></filter>
        <linearGradient id="card-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" stop-opacity="0.94"/>
          <stop offset="100%" stop-color="#020617" stop-opacity="0.97"/>
        </linearGradient>
        <linearGradient id="border-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${colors.accent}" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="${colors.primary}" stop-opacity="0.2"/>
        </linearGradient>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#card-bg)" rx="24" filter="url(#sh)"/>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="none" stroke="url(#border-grad)" stroke-width="2" rx="24"/>
      <rect x="${cardX}" y="${cardY + 24}" width="4" height="${cardH - 48}" fill="${colors.accent}" rx="2"/>
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#ffffff', 'left', 16)}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="48" fill="${colors.accent}" rx="24"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 24}" font-family="${fontFamily},sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_tailwind_luxury_frame(o: SatoriRenderOptions, fg?: { x: number; y: number; w: number; h: number }): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 38; const pad = 36;
    const lines = this.wrapText(text, 24); const lh = fz * 1.35; const tb = lines.length * lh;
    
    const fgX = fg ? fg.x : 90;
    const fgW = fg ? fg.w : W - 180;
    const fgY = fg ? fg.y : 0;
    const fgH = fg ? fg.h : H;

    const showCta = o.showCta !== false && !!cta;

    // Use dynamic bounds from layers if present
    const bounds = this.getLayersBounds(o, fgY + fgH - tb - 110, tb);

    const cardW = fgW - pad * 2;
    const cardH = bounds.height + (showCta ? 90 : 0) + 60;
    const cardX = fgX + pad;
    const cardY = bounds.minY - 30;

    const tx = cardX + 30;
    const ty = cardY + 30;
    const ctaW = cta ? this.estimateTextWidth(cta, 16) + 40 : 0;
    const ctaX = cardX + cardW - 30 - ctaW;
    const ctaY = cardY + cardH - 30 - 40;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="32" flood-color="#000" flood-opacity="0.55"/></filter>
        <linearGradient id="card-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#020617" stop-opacity="0.98"/>
        </linearGradient>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#card-bg)" rx="20" filter="url(#sh)"/>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="none" stroke="#c9a96e" stroke-width="1.5" rx="20"/>
      <rect x="${cardX + 4}" y="${cardY + 4}" width="${cardW - 8}" height="${cardH - 8}" fill="none" stroke="#c9a96e" stroke-dasharray="4,3" stroke-width="0.5" rx="16"/>
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#c9a96e', 'left', 24, '600')}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="40" fill="none" stroke="#c9a96e" stroke-width="1.5" rx="4"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 20}" font-family="${fontFamily},sans-serif" font-size="15" font-weight="700" fill="#c9a96e" text-anchor="middle" dominant-baseline="central">${this.esc(cta).toUpperCase()}</text>` : ''}
    </svg>`;
  }

  public static s_tailwind_neo_brutal(o: SatoriRenderOptions, fg?: { x: number; y: number; w: number; h: number }): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 42; const pad = 36;
    
    const fgX = fg ? fg.x : 90;
    const fgW = fg ? fg.w : W - 180;
    const fgY = fg ? fg.y : 0;
    const fgH = fg ? fg.h : H;

    const cardW = fgW - 80;
    const lines = this.wrapText(text, 22); const lh = fz * 1.35; const tb = lines.length * lh;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, fgY + fgH - (tb + (showCta ? 90 : 0) + pad * 2) - 60, tb);
    const cardH = bounds.height + (showCta ? 90 : 0) + pad * 2;
    const cardX = fgX + 40;
    const cardY = bounds.minY - pad;

    const tx = cardX + pad;
    const ty = cardY + pad;
    const ctaW = cta ? this.estimateTextWidth(cta, 18) + 40 : 0;
    const ctaX = cardX + cardW - pad - ctaW;
    const ctaY = bounds.maxY + 10;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${cardX + 8}" y="${cardY + 8}" width="${cardW}" height="${cardH}" fill="#000000" rx="16"/>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="#fdf0cd" stroke="#000000" stroke-width="3.5" rx="16"/>
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#000000', 'left', 22, '900')}
      ${showCta ? `<rect x="${ctaX + 4}" y="${ctaY + 4}" width="${ctaW}" height="46" fill="#000" rx="8"/><rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="46" fill="${colors.accent}" stroke="#000" stroke-width="2.5" rx="8"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 23}" font-family="${fontFamily},sans-serif" font-size="18" font-weight="900" fill="#000000" text-anchor="middle" dominant-baseline="central">${this.esc(cta).toUpperCase()}</text>` : ''}
    </svg>`;
  }

  public static s_tailwind_ribbon_top(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 32; const pad = 24;
    const lines = this.wrapText(text, 36); const lh = fz * 1.35; const tb = lines.length * lh;
    const cardW = W - 180;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, 50 + pad, tb);
    const ctaW = cta ? this.estimateTextWidth(cta, 16) + 36 : 0;
    const cardH = bounds.height + pad * 2;
    const cardX = 90;
    const cardY = bounds.minY - pad;

    const tx = cardX + pad;
    const ty = cardY + pad;
    const ctaX = cardX + cardW - pad - ctaW;
    const ctaY = cardY + (cardH - 42) / 2;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="28" flood-color="#000" flood-opacity="0.45"/></filter>
        <linearGradient id="card-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" stop-opacity="0.94"/>
          <stop offset="100%" stop-color="#020617" stop-opacity="0.97"/>
        </linearGradient>
        <linearGradient id="btn-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${colors.primary}"/><stop offset="100%" stop-color="${colors.accent}"/>
        </linearGradient>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#card-bg)" rx="20" filter="url(#sh)"/>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="none" stroke="url(#btn-grad)" stroke-width="2" rx="20"/>
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#ffffff', 'left', 36)}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="42" fill="url(#btn-grad)" rx="21"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 21}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_tailwind_circle_badge(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 34; const pad = 36;
    const lines = this.wrapText(text, 16); const lh = fz * 1.3; const tb = lines.length * lh;
    const cardW = 380;
    const showCta = o.showCta !== false && !!cta;
    
    const tl = o.textLayers && o.textLayers[0];
    const defaultY = H / 2 - (tb + (showCta ? 80 : 0) + pad * 2) / 2 - 100;
    const bounds = this.getLayersBounds(o, defaultY + pad, tb);
    const cardH = bounds.height + (showCta ? 80 : 0) + pad * 2;
    const cardX = tl ? (tl.x ?? 0) + W / 2 - cardW / 2 : W / 2 - cardW / 2;
    const cardY = bounds.minY - pad;

    const tx = cardX + cardW / 2;
    const ty = cardY + pad;
    const ctaW = cta ? this.estimateTextWidth(cta, 16) + 36 : 0;
    const ctaX = cardX + (cardW - ctaW) / 2;
    const ctaY = bounds.maxY + 20;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="30" flood-color="#000" flood-opacity="0.5"/></filter>
        <linearGradient id="card-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" stop-opacity="0.94"/>
          <stop offset="100%" stop-color="#020617" stop-opacity="0.98"/>
        </linearGradient>
        <linearGradient id="btn-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${colors.primary}"/><stop offset="100%" stop-color="${colors.accent}"/>
        </linearGradient>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#card-bg)" rx="28" filter="url(#sh)"/>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="none" stroke="url(#btn-grad)" stroke-width="2" rx="28"/>
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#ffffff', 'center', 16)}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="42" fill="url(#btn-grad)" rx="21"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 21}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_tailwind_feature_list(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 38; const pad = 44;
    const lines = this.wrapText(text, 22); const lh = fz * 1.35; const tb = lines.length * lh;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, H - (tb + (showCta ? 90 : 0) + pad * 2) - 80, tb);
    const cardH = bounds.height + (showCta ? 90 : 0) + pad * 2;
    const cardW = W - 180;
    const cardX = 90;
    const cardY = bounds.minY - pad;

    const tx = cardX + pad + 24;
    const ty = cardY + pad;
    const ctaW = cta ? this.estimateTextWidth(cta, 18) + 40 : 0;
    const ctaX = cardX + cardW - pad - ctaW;
    const ctaY = bounds.maxY + 10;

    const bulletsSvg = lines.map((l, i) => {
      const ly = ty + (i * lh);
      return `<circle cx="${tx - 18}" cy="${ly + fz / 2}" r="5" fill="${colors.accent}"/><text x="${tx}" y="${ly}" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="700" fill="#f8fafc" dominant-baseline="hanging">${this.esc(l)}</text>`;
    }).join('\n');

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="32" flood-color="#000" flood-opacity="0.45"/></filter>
        <linearGradient id="card-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" stop-opacity="0.94"/>
          <stop offset="100%" stop-color="#020617" stop-opacity="0.97"/>
        </linearGradient>
        <linearGradient id="border-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${colors.primary}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="${colors.primary}" stop-opacity="0.1"/>
        </linearGradient>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#card-bg)" rx="24" filter="url(#sh)"/>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="none" stroke="url(#border-grad)" stroke-width="2" rx="24"/>
      ${(() => {
        if (!o.textLayers || o.textLayers.length === 0) return bulletsSvg;
        return o.textLayers.filter(l => l.visible !== false).map((l, i) => {
          const lfz = l.fontSize || fz;
          const llh = lfz * 1.35;
          const lLines = this.wrapText(l.text, 22);
          const lcy = ty + (l.y ?? 0);
          const lcx = tx + (l.x ?? 0);
          return `<circle cx="${lcx - 18}" cy="${lcy + lfz / 2}" r="5" fill="${colors.accent}"/><text x="${lcx}" y="${lcy}" font-family="${fontFamily},sans-serif" font-size="${lfz}" font-weight="${l.fontWeight || '700'}" fill="${l.color || '#f8fafc'}" dominant-baseline="hanging">${this.ts(lLines, lcx, llh)}</text>`;
        }).join('\n');
      })()}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="46" fill="${colors.primary}" rx="23"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 23}" font-family="${fontFamily},sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_tailwind_side_panel(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 42; const pad = 44;
    const lines = this.wrapText(text, 16); const lh = fz * 1.35; const tb = lines.length * lh;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, (H - (tb + (showCta ? 90 : 0) + pad * 2)) / 2, tb);
    const panelW = W * 0.38;
    const cardX = 24;
    const cardW = panelW - 12;
    const cardH = bounds.height + (showCta ? 90 : 0) + pad * 2;
    const cardY = bounds.minY - pad;

    const tx = cardX + pad;
    const ty = cardY + pad;
    const ctaW = cta ? this.estimateTextWidth(cta, 18) + 40 : 0;
    const ctaX = tx;
    const ctaY = bounds.maxY + 20;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="30" flood-color="#000" flood-opacity="0.45"/></filter>
        <linearGradient id="card-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" stop-opacity="0.93"/>
          <stop offset="100%" stop-color="#020617" stop-opacity="0.96"/>
        </linearGradient>
        <linearGradient id="border-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${colors.primary}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="${colors.accent}" stop-opacity="0.2"/>
        </linearGradient>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#card-bg)" rx="20" filter="url(#sh)"/>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="none" stroke="url(#border-grad)" stroke-width="1.5" rx="20"/>
      <rect x="${cardX + cardW - 4}" y="${cardY + 24}" width="4" height="${cardH - 48}" fill="${colors.accent}" rx="2"/>
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#ffffff', 'left', 16)}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="46" fill="${colors.accent}" rx="23"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 23}" font-family="${fontFamily},sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_tailwind_minimal_corner(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 34; const pad = 30;
    const lines = this.wrapText(text, 20); const lh = fz * 1.3; const tb = lines.length * lh;
    const cardW = Math.max(...lines.map(l => this.estimateTextWidth(l, fz))) + pad * 2;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, H - (tb + (showCta ? 60 : 0) + pad * 2) - 50, tb);
    const cardH = bounds.height + (showCta ? 60 : 0) + pad * 2;
    const cardX = W - cardW - 50;
    const cardY = bounds.minY - pad;

    const tx = cardX + pad;
    const ty = cardY + pad;
    const ctaX = tx;
    const ctaY = bounds.maxY + 15;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="24" flood-color="#000" flood-opacity="0.45"/></filter>
        <linearGradient id="card-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#020617" stop-opacity="0.98"/>
        </linearGradient>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#card-bg)" rx="16" filter="url(#sh)"/>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="none" stroke="${colors.primary}" stroke-width="1.5" rx="16"/>
      <rect x="${cardX + 15}" y="${cardY + 15}" width="3" height="${cardH - 30}" fill="${colors.accent}" rx="1.5"/>
      ${this.renderTextLayers(o, tx + 12, ty, fz, lh, '#f8fafc', 'left', 20, '700')}
      ${showCta ? `<text x="${ctaX + 12}" y="${ctaY}" font-family="${fontFamily},sans-serif" font-size="18" font-weight="800" fill="${colors.accent}">${this.esc(cta)} &#x2192;</text>` : ''}
    </svg>`;
  }

  // ── 10 Custom Styles ──────────────────────────────────────────────────────

  public static s_modernist_split(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 42; const pad = 60;
    const lines = this.wrapText(text, 16); const lh = fz * 1.35; const tb = lines.length * lh;
    const splitX = W * 0.55;
    const tx = splitX + pad;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, (H - tb) / 2 - (cta ? 60 : 0), tb);
    const ty = bounds.minY;
    const ctaW = cta ? this.estimateTextWidth(cta, 18) + 48 : 0;
    const ctaX = tx;
    const ctaY = bounds.maxY + 40;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="split-bg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#111827"/><stop offset="100%" stop-color="#030712"/>
        </linearGradient>
      </defs>
      <!-- Solid side panel to split layout -->
      <rect x="${splitX}" y="0" width="${W - splitX}" height="${H}" fill="url(#split-bg)"/>
      <line x1="${splitX}" y1="0" x2="${splitX}" y2="${H}" stroke="${colors.accent}" stroke-width="4"/>
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#f9fafb', 'left', 16)}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="48" fill="${colors.accent}" rx="6"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 24}" font-family="${fontFamily},sans-serif" font-size="18" font-weight="800" fill="#111827" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_magazine_cover(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 80;
    const lines = this.wrapText(text, 14); const lh = fz * 1.1; const tb = lines.length * lh;
    const tx = W / 2;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, H / 2 - tb / 2, tb);
    const ty = bounds.minY;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="overlay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000" stop-opacity="0.3"/>
          <stop offset="50%" stop-color="#000" stop-opacity="0.1"/>
          <stop offset="100%" stop-color="#000" stop-opacity="0.6"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#overlay)"/>
      <!-- Header category / Issue label -->
      <text x="${W / 2}" y="100" font-family="${fontFamily},sans-serif" font-size="20" font-weight="900" fill="${colors.accent}" text-anchor="middle" letter-spacing="8" dominant-baseline="central">EDITION EXCLUSIVE</text>
      <line x1="${W/2 - 150}" y1="130" x2="${W/2 + 150}" y2="130" stroke="${colors.accent}" stroke-width="1.5"/>
      
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#ffffff', 'center', 14, '700')}
      
      ${showCta ? `
        <rect x="${W / 2 - 120}" y="${Math.max(H - 120, bounds.maxY + 30)}" width="240" height="46" fill="none" stroke="#ffffff" stroke-width="2" rx="0"/>
        <text x="${W / 2}" y="${Math.max(H - 120, bounds.maxY + 30) + 23}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central" letter-spacing="2">${this.esc(cta).toUpperCase()}</text>
      ` : ''}
    </svg>`;
  }

  public static s_minimalist_editorial(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 42;
    const lines = this.wrapText(text, 22); const lh = fz * 1.35; const tb = lines.length * lh;
    
    // Use dynamic bounds from layers if present
    const bounds = this.getLayersBounds(o, H - tb - 180 - 60, tb);

    const cardH = bounds.height + 120 + (cta ? 80 : 0);
    const cardY = bounds.minY - 60;
    const cx = W / 2;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh"><feDropShadow dx="0" dy="4" stdDeviation="16" flood-opacity="0.1"/></filter>
      </defs>
      <rect x="60" y="${cardY}" width="${W - 120}" height="${cardH}" fill="#ffffff" rx="0" filter="url(#sh)"/>
      <line x1="${cx - 60}" y1="${cardY + 40}" x2="${cx + 60}" y2="${cardY + 40}" stroke="${colors.accent}" stroke-width="2"/>
      ${this.renderTextLayers(o, cx, cardY + 65, fz, lh, '#1f2937', 'center', 22, '400')}
      ${cta ? `
        <text x="${cx}" y="${cardY + 65 + bounds.height + 35}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="700" fill="${colors.accent}" text-anchor="middle" dominant-baseline="central" letter-spacing="2">${this.esc(cta).toUpperCase()} &#x2192;</text>
      ` : ''}
    </svg>`;
  }

  public static s_glow_dark(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 44; const pad = 44;
    const lines = this.wrapText(text, 20); const lh = fz * 1.35; const tb = lines.length * lh;
    const cardW = W - 180;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, H - (tb + (showCta ? 90 : 0) + pad * 2) - 80, tb);
    const cardH = bounds.height + (showCta ? 90 : 0) + pad * 2;
    const cardX = 90;
    const cardY = bounds.minY - pad;

    const tx = cardX + pad;
    const ty = cardY + pad;
    const ctaW = cta ? this.estimateTextWidth(cta, 18) + 40 : 0;
    const ctaX = tx;
    const ctaY = bounds.maxY + 20;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="36" flood-color="#000" flood-opacity="0.6"/></filter>
        <radialGradient id="mesh-glow" cx="50%" cy="100%" r="70%">
          <stop offset="0%" stop-color="${colors.primary}" stop-opacity="0.8"/>
          <stop offset="50%" stop-color="${colors.accent}" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#0b0f19" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="#0b0f19" rx="24" filter="url(#sh)"/>
      <!-- Glowing mesh overlay inside card -->
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#mesh-glow)" rx="24" style="mix-blend-mode: screen;"/>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="none" stroke="${colors.accent}" stroke-opacity="0.3" stroke-width="1.5" rx="24"/>
      
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#ffffff', 'left', 20)}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="44" fill="${colors.accent}" rx="6"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 22}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="800" fill="#0b0f19" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_bold_slant(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 46;
    const lines = this.wrapText(text, 20); const lh = fz * 1.3; const tb = lines.length * lh;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, H - (tb + (cta ? 90 : 0) + 80) + 40, tb);
    const barH = bounds.height + (showCta ? 90 : 0) + 80;
    const ty = bounds.minY;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <!-- Slanted colored ribbon banner at bottom -->
      <polygon points="0,${H - barH + 60} ${W},${H - barH} ${W},${H} 0,${H}" fill="${colors.primary}" fill-opacity="0.95"/>
      <line x1="0" y1="${H - barH + 60}" x2="${W}" y2="${H - barH}" stroke="${colors.accent}" stroke-width="6"/>
      ${this.renderTextLayers(o, 80, ty, fz, lh, '#ffffff', 'left', 20, '900')}
      ${showCta ? `<rect x="80" y="${bounds.maxY + 20}" width="200" height="46" fill="${colors.accent}" rx="4"/><text x="180" y="${bounds.maxY + 43}" font-family="${fontFamily},sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_duotone_overlay(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 54;
    const lines = this.wrapText(text, 18); const lh = fz * 1.35; const tb = lines.length * lh;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, (H - tb) / 2 - (cta ? 50 : 0), tb);
    const ty = bounds.minY;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <!-- Duotone full screen filter color overlays -->
      <rect x="0" y="0" width="${W}" height="${H}" fill="${colors.primary}" fill-opacity="0.4" style="mix-blend-mode: multiply;"/>
      <rect x="0" y="0" width="${W}" height="${H}" fill="${colors.accent}" fill-opacity="0.35" style="mix-blend-mode: screen;"/>
      
      ${this.renderTextLayers(o, W / 2, ty, fz, lh, '#ffffff', 'center', 18, '900')}
      ${showCta ? `<rect x="${W / 2 - 110}" y="${bounds.maxY + 30}" width="220" height="48" fill="#ffffff" rx="24"/><text x="${W / 2}" y="${bounds.maxY + 54}" font-family="${fontFamily},sans-serif" font-size="18" font-weight="800" fill="#000000" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_neon_sign(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 46; const pad = 36;
    const lines = this.wrapText(text, 16); const lh = fz * 1.35; const tb = lines.length * lh;
    const cardW = 460;
    const showCta = o.showCta !== false && !!cta;
    const cardH = tb + (showCta ? 80 : 0) + pad * 2;
    const cardX = 80;
    const cardY = (H - cardH) / 2;

    const tx = cardX + pad;
    const ty = cardY + pad;
    const ctaW = cta ? this.estimateTextWidth(cta, 18) + 36 : 0;
    const ctaX = tx;
    const ctaY = ty + tb + 20;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="neon-glow-primary" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="neon-glow-accent" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect x="0" y="0" width="${W}" height="${H}" fill="#05050a" fill-opacity="0.6"/>
      <!-- Neon glowing frame border -->
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="none" stroke="${colors.primary}" stroke-width="3" rx="16" filter="url(#neon-glow-primary)"/>
      <rect x="${cardX - 4}" y="${cardY - 4}" width="${cardW + 8}" height="${cardH + 8}" fill="none" stroke="${colors.accent}" stroke-width="1.5" rx="20" opacity="0.7" filter="url(#neon-glow-accent)"/>
      
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#ffffff', 'left', 16, '800')}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="42" fill="none" stroke="${colors.accent}" stroke-width="2.5" rx="6" filter="url(#neon-glow-accent)"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 21}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta).toUpperCase()}</text>` : ''}
    </svg>`;
  }

  public static s_glass_list(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 32; const pad = 24;
    const lines = this.wrapText(text, 24); const lh = fz * 1.35;
    const startY = H - (lines.length * 80) - (cta ? 110 : 80);
    const showCta = o.showCta !== false && !!cta;

    const listSvg = lines.map((l, i) => {
      const ly = startY + (i * 80);
      const pillW = this.estimateTextWidth(l, fz) + pad * 2 + 20;
      return `<g transform="translate(80, ${ly})">
        <rect x="0" y="0" width="${pillW}" height="64" fill="#ffffff" fill-opacity="0.2" stroke="#ffffff" stroke-opacity="0.25" stroke-width="1.5" rx="32"/>
        <circle cx="28" cy="32" r="6" fill="${colors.accent}"/>
        <text x="50" y="32" font-family="${fontFamily},sans-serif" font-size="${fz}" font-weight="700" fill="#ffffff" dominant-baseline="central">${this.esc(l)}</text>
      </g>`;
    }).join('\n');

    const ctaY = startY + (lines.length * 80) + 15;
    const ctaW = cta ? this.estimateTextWidth(cta, 18) + 40 : 0;

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${!o.textLayers?.length ? listSvg : ''}
      ${showCta ? `<rect x="80" y="${ctaY}" width="${ctaW}" height="48" fill="${colors.primary}" rx="24"/><text x="${80 + ctaW / 2}" y="${ctaY + 24}" font-family="${fontFamily},sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_brushed_metal(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 42; const pad = 48;
    const lines = this.wrapText(text, 20); const lh = fz * 1.35; const tb = lines.length * lh;
    const cardW = W - 180;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, H - (tb + (showCta ? 90 : 0) + pad * 2) - 80, tb);
    const cardH = bounds.height + (showCta ? 90 : 0) + pad * 2;
    const cardX = 90;
    const cardY = bounds.minY - pad;

    const tx = cardX + pad;
    const ty = cardY + pad;
    const ctaW = cta ? this.estimateTextWidth(cta, 18) + 40 : 0;
    const ctaX = tx;
    const ctaY = bounds.maxY + 20;

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="32" flood-color="#000" flood-opacity="0.55"/></filter>
        <!-- Brushed metal linear gradients mimicking texture lines -->
        <linearGradient id="metal-bg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#334155"/><stop offset="25%" stop-color="#475569"/>
          <stop offset="50%" stop-color="#1e293b"/><stop offset="75%" stop-color="#475569"/>
          <stop offset="100%" stop-color="#334155"/>
        </linearGradient>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#metal-bg)" rx="8" filter="url(#sh)"/>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="none" stroke="#64748b" stroke-width="2" rx="8"/>
      <line x1="${cardX}" y1="${cardY + 4}" x2="${cardX + cardW}" y2="${cardY + 4}" stroke="#94a3b8" stroke-width="2" opacity="0.6"/>
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#f8fafc', 'left', 20)}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="44" fill="${colors.accent}" rx="4"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 22}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_cyberpunk_hud(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 36;
    const lines = this.wrapText(text, 22); const lh = fz * 1.35; const tb = lines.length * lh;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, H - tb - 150, tb);
    const tx = 100; const ty = bounds.minY;
    const ctaW = cta ? this.estimateTextWidth(cta, 16) + 40 : 0;
    const ctaX = tx;
    const ctaY = bounds.maxY + 25;

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <!-- Cyberpunk HUD decorative elements -->
      <path d="M 40 40 L 160 40 L 180 60 L 40 60 Z" fill="${colors.accent}" opacity="0.8"/>
      <text x="50" y="50" font-family="${fontFamily},sans-serif" font-size="12" font-weight="900" fill="#000" dominant-baseline="central">SYSTEM: ACTIVE</text>
      <circle cx="${W - 80}" cy="60" r="10" fill="none" stroke="${colors.primary}" stroke-width="2"/>
      <circle cx="${W - 80}" cy="60" r="4" fill="${colors.accent}"/>
      
      <!-- Tech crosshairs -->
      <line x1="${W/2 - 20}" y1="${H/2}" x2="${W/2 + 20}" y2="${H/2}" stroke="${colors.accent}" stroke-width="1.5" opacity="0.7"/>
      <line x1="${W/2}" y1="${H/2 - 20}" x2="${W/2}" y2="${H/2 + 20}" stroke="${colors.accent}" stroke-width="1.5" opacity="0.7"/>
      <circle cx="${W/2}" cy="${H/2}" r="40" fill="none" stroke="${colors.accent}" stroke-width="1" stroke-dasharray="4,6" opacity="0.5"/>
      
      <!-- Text container frame -->
      <path d="M ${tx - 20} ${ty - 20} L ${tx + 400} ${ty - 20} L ${tx + 420} ${ty} L ${tx + 420} ${ty + tb + (showCta ? 80 : 20)} L ${tx - 20} ${ty + tb + (showCta ? 80 : 20)} Z" fill="#030712" fill-opacity="0.8" stroke="${colors.accent}" stroke-width="2"/>
      ${!o.textLayers?.length ? `<text x="${tx}" y="${ty}" font-family="monospace,sans-serif" font-size="${fz}" font-weight="800" fill="${colors.primary}" dominant-baseline="hanging">${this.ts(lines, tx, lh)}</text>` : ''}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="38" fill="none" stroke="${colors.accent}" stroke-width="2"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 19}" font-family="monospace,sans-serif" font-size="15" font-weight="900" fill="${colors.accent}" text-anchor="middle" dominant-baseline="central">${this.esc(cta).toUpperCase()}</text>` : ''}
    </svg>`;
  }

  // ── 10 Internet-Inspired Styles ───────────────────────────────────────────

  public static s_stripe_card(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 42; const pad = 44;
    const lines = this.wrapText(text, 22); const lh = fz * 1.35; const tb = lines.length * lh;
    const cardW = W - 180;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, H - (tb + (showCta ? 90 : 0) + pad * 2) - 80, tb);
    const cardH = bounds.height + (showCta ? 90 : 0) + pad * 2;
    const cardX = 90;
    const cardY = bounds.minY - pad;

    const tx = cardX + pad;
    const ty = cardY + pad;
    const ctaW = cta ? this.estimateTextWidth(cta, 18) + 40 : 0;
    const ctaX = tx;
    const ctaY = bounds.maxY + 20;

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="32" flood-color="#000" flood-opacity="0.45"/></filter>
        <linearGradient id="stripe-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${colors.primary}"/>
          <stop offset="50%" stop-color="${colors.primary}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="${colors.accent}"/>
        </linearGradient>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#stripe-grad)" rx="20" filter="url(#sh)"/>
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#ffffff', 'left', 22, '800')}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="44" fill="#ffffff" rx="22"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 22}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="800" fill="${colors.primary}" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_linear_board(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 38; const pad = 44;
    const lines = this.wrapText(text, 22); const lh = fz * 1.35; const tb = lines.length * lh;
    const cardW = W - 180;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, H - (tb + (showCta ? 90 : 0) + pad * 2) - 80, tb);
    const cardH = bounds.height + (showCta ? 90 : 0) + pad * 2;
    const cardX = 90;
    const cardY = bounds.minY - pad;

    const tx = cardX + pad;
    const ty = cardY + pad;
    const ctaW = cta ? this.estimateTextWidth(cta, 16) + 36 : 0;
    const ctaX = cardX + cardW - pad - ctaW;
    const ctaY = bounds.maxY + 12;

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="36" flood-color="#000000" flood-opacity="0.65"/></filter>
        <linearGradient id="linear-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#121214"/><stop offset="100%" stop-color="#18181b"/>
        </linearGradient>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#linear-bg)" rx="16" filter="url(#sh)"/>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="none" stroke="#27272a" stroke-width="1.5" rx="16"/>
      <rect x="${tx}" y="${ty - 24}" width="80" height="18" fill="#27272a" rx="4"/>
      <text x="${tx + 40}" y="${ty - 15}" font-family="monospace" font-size="10" font-weight="800" fill="#a1a1aa" text-anchor="middle" dominant-baseline="central">CTRL + K</text>
      
      ${this.renderTextLayers(o, tx, ty + 10, fz, lh, '#f4f4f5', 'left', 22, '700')}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="38" fill="${colors.primary}" rx="6"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 19}" font-family="${fontFamily},sans-serif" font-size="15" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_apple_spec(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 64;
    const lines = this.wrapText(text, 16); const lh = fz * 1.15; const tb = lines.length * lh;
    const tx = 100;
    const ty = 140;
    const showCta = o.showCta !== false && !!cta;

    let ctaY = ty + tb + 40;
    if (o.textLayers && o.textLayers.length > 0) {
      let maxBottom = 0;
      for (const l of o.textLayers) {
        if (l.visible === false) continue;
        const ly = (l.y ?? 0) + H / 2;
        const lLines = this.wrapText(l.text, 22).length;
        const lFz = l.fontSize || 48;
        const lHeight = lLines * lFz * 1.25;
        if (ly + lHeight > maxBottom) maxBottom = ly + lHeight;
      }
      if (maxBottom > 0) ctaY = maxBottom + 30;
    }

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#ffffff', 'left', 16, '600')}
      ${showCta ? `
        <text x="${tx}" y="${ctaY}" font-family="${fontFamily},sans-serif" font-size="24" font-weight="600" fill="${colors.primary}" dominant-baseline="hanging">${this.esc(cta)} &#x2192;</text>
      ` : ''}
    </svg>`;
  }

  public static s_netflix_billboard(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 54;
    const lines = this.wrapText(text, 22); const lh = fz * 1.3; const tb = lines.length * lh;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, H - tb - 120, tb);
    const gradH = Math.min(H * 0.6, bounds.height + 240);
    const ty = bounds.minY;
    const tx = 80;
    const ctaW = cta ? this.estimateTextWidth(cta, 20) + 48 : 0;
    const ctaX = tx;
    const ctaY = bounds.maxY + 25;

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bottom-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000" stop-opacity="0.95"/>
        </linearGradient>
      </defs>
      <rect x="0" y="${H - gradH}" width="${W}" height="${gradH}" fill="url(#bottom-fade)"/>
      <rect x="0" y="${H - 6}" width="${W}" height="6" fill="${colors.accent}"/>
      
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#ffffff', 'left', 22, '900')}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="48" fill="#ffffff" rx="4"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 24}" font-family="${fontFamily},sans-serif" font-size="18" font-weight="800" fill="#000000" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_airbnb_card(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 32; const pad = 30;
    const lines = this.wrapText(text, 26); const lh = fz * 1.3; const tb = lines.length * lh;
    const cardW = 460;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, H - (tb + (showCta ? 60 : 0) + pad * 2 + 40) - 80, tb);
    const cardH = bounds.height + (showCta ? 60 : 0) + pad * 2 + 40;
    const cardX = 80;
    const cardY = bounds.minY - pad - 30;

    const tx = cardX + pad;
    const ty = cardY + pad + 30;
    const ctaX = cardX + cardW - pad - (cta ? this.estimateTextWidth(cta, 14) + 24 : 0);
    const ctaY = bounds.maxY + 15;

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#000" flood-opacity="0.15"/></filter>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="#ffffff" rx="16" filter="url(#sh)"/>
      <g transform="translate(${tx}, ${cardY + pad})">
        <text x="0" y="0" font-family="${fontFamily},sans-serif" font-size="14" font-weight="800" fill="${colors.accent}" dominant-baseline="hanging">★ 4.98</text>
        <text x="60" y="0" font-family="${fontFamily},sans-serif" font-size="14" font-weight="600" fill="#717171" dominant-baseline="hanging">· (240 értékelés)</text>
      </g>
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#222222', 'left', 26, '700')}
      ${showCta ? `
        <rect x="${ctaX}" y="${ctaY}" width="${this.estimateTextWidth(cta, 14) + 24}" height="32" fill="${colors.accent}" rx="8"/>
        <text x="${ctaX + (this.estimateTextWidth(cta, 14) + 24)/2}" y="${ctaY + 16}" font-family="${fontFamily},sans-serif" font-size="13" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>
      ` : ''}
    </svg>`;
  }

  public static s_spotify_lyrics(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 48; const pad = 60;
    const lines = this.wrapText(text, 18); const lh = fz * 1.35; const tb = lines.length * lh;
    const tx = pad;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, (H - tb) / 2 - (cta ? 60 : 0), tb);
    const ty = bounds.minY;

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="${H}" fill="${colors.primary}"/>
      <circle cx="${W - 100}" cy="${H - 100}" r="250" fill="${colors.accent}" opacity="0.35" filter="blur(80px)"/>
      
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#ffffff', 'left', 18, '900')}
      ${showCta ? `
        <rect x="${tx}" y="${bounds.maxY + 40}" width="220" height="48" fill="${colors.accent}" rx="24"/>
        <text x="${tx + 110}" y="${bounds.maxY + 64}" font-family="${fontFamily},sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>
      ` : ''}
    </svg>`;
  }

  public static s_notion_board(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 34; const pad = 36;
    const lines = this.wrapText(text, 20); const lh = fz * 1.35; const tb = lines.length * lh;
    const cardW = 460;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, H - (tb + (showCta ? 70 : 0) + pad * 2 + 30) - 80, tb);
    const cardH = bounds.height + (showCta ? 70 : 0) + pad * 2 + 30;
    const cardX = 80;
    const cardY = bounds.minY - pad - 25;

    const tx = cardX + pad;
    const ty = cardY + pad + 25;
    const ctaW = cta ? this.estimateTextWidth(cta, 16) + 32 : 0;
    const ctaX = tx;
    const ctaY = bounds.maxY + 15;

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="16" flood-color="#000" flood-opacity="0.08"/></filter>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="#ffffff" rx="12" stroke="#e1e1e1" stroke-width="1.5" filter="url(#sh)"/>
      <rect x="${tx}" y="${cardY + pad}" width="50" height="18" fill="#f1f1f1" rx="4"/>
      <text x="${tx + 25}" y="${cardY + pad + 9}" font-family="${fontFamily},sans-serif" font-size="10" font-weight="700" fill="#37352f" text-anchor="middle" dominant-baseline="central">INFO</text>
      
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#37352f', 'left', 20, '600')}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="36" fill="none" stroke="#37352f" stroke-width="1.5" rx="6"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 18}" font-family="${fontFamily},sans-serif" font-size="15" font-weight="700" fill="#37352f" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_figma_canvas(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 38; const pad = 36;
    const lines = this.wrapText(text, 22); const lh = fz * 1.35; const tb = lines.length * lh;
    const cardW = W - 180;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, H - (tb + (showCta ? 90 : 0) + pad * 2) - 80, tb);
    const cardH = bounds.height + (showCta ? 90 : 0) + pad * 2;
    const cardX = 90;
    const cardY = bounds.minY - pad;

    const tx = cardX + pad;
    const ty = cardY + pad;
    const ctaW = cta ? this.estimateTextWidth(cta, 18) + 40 : 0;
    const ctaX = cardX + cardW - pad - ctaW;
    const ctaY = bounds.maxY + 10;

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="0" x2="${W}" y2="${H}" stroke="${colors.primary}" stroke-width="0.5" opacity="0.1"/>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="#ffffff" rx="8" stroke="${colors.primary}" stroke-width="1.5" filter="url(#sh)"/>
      <rect x="${cardX - 4}" y="${cardY - 4}" width="8" height="8" fill="#ffffff" stroke="${colors.primary}" stroke-width="1.5"/>
      <rect x="${cardX + cardW - 4}" y="${cardY - 4}" width="8" height="8" fill="#ffffff" stroke="${colors.primary}" stroke-width="1.5"/>
      <rect x="${cardX - 4}" y="${cardY + cardH - 4}" width="8" height="8" fill="#ffffff" stroke="${colors.primary}" stroke-width="1.5"/>
      <rect x="${cardX + cardW - 4}" y="${cardY + cardH - 4}" width="8" height="8" fill="#ffffff" stroke="${colors.primary}" stroke-width="1.5"/>
      
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#1e293b', 'left', 22, '600')}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="42" fill="${colors.primary}" rx="4"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 21}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_github_readme(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 34; const pad = 36;
    const lines = this.wrapText(text, 22); const lh = fz * 1.35; const tb = lines.length * lh;
    const cardW = W - 180;
    const showCta = o.showCta !== false && !!cta;
    const bounds = this.getLayersBounds(o, H - (tb + (showCta ? 85 : 0) + pad * 2 + 50) - 80, tb);
    const cardH = bounds.height + (showCta ? 85 : 0) + pad * 2 + 50;
    const cardX = 90;
    const cardY = bounds.minY - pad - 40;

    const tx = cardX + pad;
    const ty = cardY + pad + 40;
    const ctaW = cta ? this.estimateTextWidth(cta, 16) + 32 : 0;
    const ctaX = tx;
    const ctaY = bounds.maxY + 15;

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#000" flood-opacity="0.1"/></filter>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="#ffffff" rx="6" stroke="#d0d7de" stroke-width="1.5" filter="url(#sh)"/>
      <text x="${cardX + 44}" y="${cardY + 22}" font-family="monospace" font-size="14" font-weight="700" fill="#24292f" dominant-baseline="central">README.md</text>
      <line x1="${cardX}" y1="${cardY + 44}" x2="${cardX + cardW}" y2="${cardY + 44}" stroke="#d0d7de" stroke-width="1"/>
      
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#24292f', 'left', 22, '700')}
      ${showCta ? `<rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="36" fill="${colors.primary}" rx="6"/><text x="${ctaX + ctaW / 2}" y="${ctaY + 18}" font-family="${fontFamily},sans-serif" font-size="15" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta)}</text>` : ''}
    </svg>`;
  }

  public static s_tesla_minimal(o: SatoriRenderOptions): string {
    const { width: W, height: H, text, cta, colors, fontFamily } = o;
    const fz = o.fontSize || 60;
    const lines = this.wrapText(text, 16); const lh = fz * 1.25; const tb = lines.length * lh;
    const tx = W / 2;
    const ty = 160;
    const showCta = o.showCta !== false && !!cta;
    const ctaW = cta ? this.estimateTextWidth(cta, 18) + 80 : 0;
    const ctaX = W / 2 - ctaW / 2;
    const ctaY = H - 180;

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <line x1="80" y1="80" x2="${W - 80}" y2="80" stroke="#171a20" stroke-width="1" opacity="0.1"/>
      
      ${this.renderTextLayers(o, tx, ty, fz, lh, '#171a20', 'center', 16, '600')}
      ${showCta ? `
        <rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="50" fill="#171a20" fill-opacity="0.85" rx="25"/>
        <text x="${W / 2}" y="${ctaY + 25}" font-family="${fontFamily},sans-serif" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${this.esc(cta).toUpperCase()}</text>
      ` : ''}
    </svg>`;
  }
}

