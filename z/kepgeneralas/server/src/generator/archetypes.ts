import { GeneratorBrandKit, CreativeContent, PolotnoJSON, PolotnoChild } from './types';
import { resolveColorRoles, spacing, typography } from './tokens';
import { autoFit } from './helpers';

// Helper to create basic Polotno JSON template
function createTemplate(width: number, height: number, fontName: string): PolotnoJSON {
  const fontUrl = `https://fonts.gstatic.com/s/${fontName.toLowerCase().replace(/ /g, '')}/v1/latin.woff2`;
  return {
    width,
    height,
    fonts: [{ fontFamily: fontName, url: fontUrl }],
    pages: []
  };
}

// ----------------------------------------------------
// A1: Centered Statement (Quote / Announcement)
// ----------------------------------------------------
export function renderA1(
  content: CreativeContent,
  brandKit: GeneratorBrandKit,
  format: 'feed' | 'story',
  accentEmphasis: 'low' | 'medium' | 'high' = 'medium'
): PolotnoJSON {
  const width = 1080;
  const height = format === 'feed' ? 1350 : 1920;
  const margin = 64;
  
  // Safe bounds
  const topBound = format === 'feed' ? 64 : 220;
  const bottomBound = format === 'feed' ? 1286 : 1670;
  
  const roles = resolveColorRoles(brandKit, accentEmphasis);
  const json = createTemplate(width, height, brandKit.typography.fontName);
  
  // Add premium outer border frame matching the ink/surface role
  json.premiumBorder = getLuminance(roles.surface) > 0.5 ? 'dark' : 'light';
  
  const children: PolotnoChild[] = [];
  
  // 1. Logo
  const logoH = 80;
  const logoW = 160;
  children.push({
    type: 'image',
    x: (width - logoW) / 2,
    y: topBound + spacing.md,
    width: logoW,
    height: logoH,
    src: brandKit.logoUrl
  });
  
  // 2. CTA (if any)
  const hasCta = !!content.cta;
  const ctaH = 88;
  const ctaW = 320;
  const ctaY = bottomBound - ctaH - spacing.md;
  
  if (hasCta && content.cta) {
    const isLow = accentEmphasis === 'low';
    children.push({
      type: 'figure',
      subType: 'rect',
      x: (width - ctaW) / 2,
      y: ctaY,
      width: ctaW,
      height: ctaH,
      cornerRadius: 44,
      fill: isLow ? 'transparent' : roles.accent,
      border: isLow ? `2px solid ${roles.accent}` : undefined,
      premiumShadowSoft: !isLow
    });
    children.push({
      type: 'text',
      x: (width - ctaW) / 2,
      y: ctaY + (ctaH - 32) / 2 - 2,
      width: ctaW,
      text: content.cta.toUpperCase(),
      fontFamily: brandKit.typography.fontName,
      fontSize: 26,
      lineHeight: 1.1,
      fontWeight: 'bold',
      align: 'center',
      fill: isLow ? roles.accent : roles.surface
    });
  }
  
  // 3. Headline & Subhead block
  const blockTop = topBound + logoH + spacing.xl;
  const blockBottom = hasCta ? ctaY - spacing.lg : bottomBound - spacing.lg;
  const blockHeight = blockBottom - blockTop;
  const blockWidth = width - (margin * 2);
  
  const headlineText = content.headline || content.quote || 'Statement';
  const subheadText = content.subhead || content.author || '';
  
  const fitHeadline = autoFit(
    headlineText,
    blockWidth,
    blockHeight * 0.55,
    'display',
    'subhead',
    3
  );
  
  const separatorSpace = subheadText ? 40 : 0;
  const headlineY = blockTop + (blockHeight - (fitHeadline.height + separatorSpace + (subheadText ? 48 : 0))) / 2;
  
  // Outer text container frame
  const framePadding = spacing.md;
  const frameH = fitHeadline.height + separatorSpace + (subheadText ? 48 : 0) + framePadding * 2;
  const frameY = headlineY - framePadding;
  const isSurfaceDark = getLuminance(roles.surface) < 0.5;
  const frameBorder = isSurfaceDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.08)';
  
  children.push({
    type: 'figure',
    subType: 'rect',
    x: margin - spacing.md,
    y: frameY,
    width: blockWidth + (spacing.md * 2),
    height: frameH,
    fill: 'transparent',
    border: frameBorder,
    cornerRadius: 12
  });
  
  // Headline text
  children.push({
    type: 'text',
    x: margin,
    y: headlineY,
    width: blockWidth,
    text: headlineText,
    fontFamily: brandKit.typography.fontName,
    fontSize: fitHeadline.fontSize,
    lineHeight: fitHeadline.lineHeight,
    fontWeight: 'bold',
    align: 'center',
    fill: roles.ink
  });
  
  // Subtle Diamond Separator
  if (subheadText) {
    const sepY = headlineY + fitHeadline.height + spacing.sm;
    children.push({
      type: 'text',
      x: margin,
      y: sepY,
      width: blockWidth,
      text: '◆',
      fontFamily: brandKit.typography.fontName,
      fontSize: 20,
      lineHeight: 1.2,
      fontWeight: 'normal',
      align: 'center',
      fill: roles.accent
    });
    
    // Subhead text
    children.push({
      type: 'text',
      x: margin,
      y: sepY + 28 + spacing.sm,
      width: blockWidth,
      text: subheadText,
      fontFamily: brandKit.typography.fontName,
      fontSize: typography.subhead.size - 4,
      lineHeight: typography.subhead.lineHeight,
      fontWeight: 'normal',
      align: 'center',
      fill: roles.inkMuted
    });
  }
  
  json.pages.push({
    id: 'p1',
    background: roles.surface,
    children
  });
  
  return json;
}

// ----------------------------------------------------
// A2: Hero Image + Bottom Band (Product Promo)
// ----------------------------------------------------
export function renderA2(
  content: CreativeContent,
  brandKit: GeneratorBrandKit,
  format: 'feed' | 'story',
  imageUrl?: string,
  accentEmphasis: 'low' | 'medium' | 'high' = 'medium'
): PolotnoJSON {
  const width = 1080;
  const height = format === 'feed' ? 1350 : 1920;
  const margin = 64;
  
  const roles = resolveColorRoles(brandKit, accentEmphasis);
  const json = createTemplate(width, height, brandKit.typography.fontName);
  const children: PolotnoChild[] = [];
  
  // Float the hero image as a framed card with drop shadow instead of a cold cutoff
  const imgMargin = 32;
  const imageH = Math.round(height * 0.56);
  
  children.push({
    type: 'image',
    x: imgMargin,
    y: imgMargin,
    width: width - (imgMargin * 2),
    height: imageH - imgMargin,
    src: imageUrl || 'https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&q=80&w=1080',
    filter: 'duotone',
    duotoneColors: [roles.ink, roles.surface],
    premiumShadow: true
  });
  
  // Bottom content band with a premium shadow overlay
  const bandY = imageH;
  const bandH = height - imageH;
  children.push({
    type: 'figure',
    subType: 'rect',
    x: 0,
    y: bandY,
    width,
    height: bandH,
    fill: roles.surface,
    premiumShadow: true // casts shadow upwards onto floating image
  });
  
  // Divider line at separating edge
  const isSurfaceDark = getLuminance(roles.surface) < 0.5;
  const dividerColor = isSurfaceDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  children.push({
    type: 'figure',
    subType: 'rect',
    x: 0,
    y: bandY,
    width,
    height: 1,
    fill: dividerColor
  });
  
  // Logo floating in top-left
  children.push({
    type: 'image',
    x: margin + 8,
    y: margin + 8,
    width: 128,
    height: 64,
    src: brandKit.logoUrl
  });
  
  // Text content
  const headlineText = content.headline || 'Product Promo';
  const subheadText = content.subhead || content.body || '';
  
  const headlineFit = autoFit(
    headlineText,
    width - (margin * 2),
    bandH - spacing.xl,
    'headline',
    'subhead',
    2
  );
  
  children.push({
    type: 'text',
    x: margin,
    y: bandY + spacing.md + 10,
    width: width - (margin * 2),
    text: headlineText,
    fontFamily: brandKit.typography.fontName,
    fontSize: headlineFit.fontSize,
    lineHeight: headlineFit.lineHeight,
    fontWeight: 'bold',
    align: 'left',
    fill: roles.ink
  });
  
  if (subheadText) {
    children.push({
      type: 'text',
      x: margin,
      y: bandY + spacing.md + 10 + headlineFit.height + spacing.sm,
      width: width - (margin * 2) - 340,
      text: subheadText,
      fontFamily: brandKit.typography.fontName,
      fontSize: typography.body.size - 4,
      lineHeight: typography.body.lineHeight,
      fontWeight: 'normal',
      align: 'left',
      fill: roles.inkMuted
    });
  }
  
  // CTA
  if (content.cta) {
    const ctaW = 300;
    const ctaH = 88;
    const isLow = accentEmphasis === 'low';
    
    children.push({
      type: 'figure',
      subType: 'rect',
      x: width - margin - ctaW,
      y: height - margin - ctaH,
      width: ctaW,
      height: ctaH,
      cornerRadius: 44,
      fill: isLow ? 'transparent' : roles.accent,
      border: isLow ? `2px solid ${roles.accent}` : undefined,
      premiumShadowSoft: !isLow
    });
    
    children.push({
      type: 'text',
      x: width - margin - ctaW,
      y: height - margin - ctaH + (ctaH - 30) / 2 - 2,
      width: ctaW,
      text: content.cta.toUpperCase(),
      fontFamily: brandKit.typography.fontName,
      fontSize: 24,
      fontWeight: 'bold',
      align: 'center',
      fill: isLow ? roles.accent : roles.surface
    });
  }
  
  json.pages.push({
    id: 'p1',
    background: roles.surface,
    children
  });
  
  return json;
}

// ----------------------------------------------------
// A3: Split Layout (Before / After or Feature Detail)
// ----------------------------------------------------
export function renderA3(
  content: CreativeContent,
  brandKit: GeneratorBrandKit,
  format: 'feed' | 'story',
  imageUrl?: string,
  accentEmphasis: 'low' | 'medium' | 'high' = 'medium'
): PolotnoJSON {
  const width = 1080;
  const height = format === 'feed' ? 1350 : 1920;
  const margin = 64;
  
  const roles = resolveColorRoles(brandKit, accentEmphasis);
  const json = createTemplate(width, height, brandKit.typography.fontName);
  const children: PolotnoChild[] = [];
  
  // Framed Float image card with gallery-style margins
  const imgMarginX = 64;
  const imgMarginY = 64;
  const imageH = Math.round(height * 0.45);
  
  children.push({
    type: 'image',
    x: imgMarginX,
    y: imgMarginY,
    width: width - (imgMarginX * 2),
    height: imageH - imgMarginY,
    src: imageUrl || 'https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&q=80&w=1080',
    filter: 'duotone',
    duotoneColors: [roles.ink, roles.surface],
    premiumShadow: true
  });
  
  // Thin horizontal divider line
  const dividerY = imageH + 16;
  const isSurfaceDark = getLuminance(roles.surface) < 0.5;
  const dividerStroke = isSurfaceDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
  
  children.push({
    type: 'figure',
    subType: 'rect',
    x: margin,
    y: dividerY,
    width: width - (margin * 2),
    height: 1,
    fill: dividerStroke
  });
  
  // Lower half solid background
  const bandY = imageH + 32;
  const bandH = height - bandY;
  children.push({
    type: 'figure',
    subType: 'rect',
    x: 0,
    y: bandY,
    width,
    height: bandH,
    fill: roles.surface,
    premiumShadow: true
  });
  
  // Minimalist thin accent rule divider above headline
  children.push({
    type: 'figure',
    subType: 'rect',
    x: margin,
    y: bandY + spacing.md,
    width: 140,
    height: 4,
    fill: roles.accent
  });
  
  const headlineText = content.headline || 'Feature Split';
  const bodyText = content.body || '';
  
  const headFit = autoFit(
    headlineText,
    width - (margin * 2),
    bandH * 0.4,
    'headline',
    'subhead',
    2
  );
  
  children.push({
    type: 'text',
    x: margin,
    y: bandY + spacing.md + 16,
    width: width - (margin * 2),
    text: headlineText,
    fontFamily: brandKit.typography.fontName,
    fontSize: headFit.fontSize,
    lineHeight: headFit.lineHeight,
    fontWeight: 'bold',
    align: 'left',
    fill: roles.ink
  });
  
  if (bodyText) {
    children.push({
      type: 'text',
      x: margin,
      y: bandY + spacing.md + 16 + headFit.height + spacing.md,
      width: width - (margin * 2),
      text: bodyText,
      fontFamily: brandKit.typography.fontName,
      fontSize: typography.body.size - 4,
      lineHeight: typography.body.lineHeight,
      fontWeight: 'normal',
      align: 'left',
      fill: roles.inkMuted
    });
  }
  
  // Logo in bottom-left
  children.push({
    type: 'image',
    x: margin,
    y: height - margin - 40,
    width: 96,
    height: 40,
    src: brandKit.logoUrl
  });
  
  json.pages.push({
    id: 'p1',
    background: roles.surface,
    children
  });
  
  return json;
}

// ----------------------------------------------------
// A4: Full-Bleed Overlay (Lifestyle)
// ----------------------------------------------------
export function renderA4(
  content: CreativeContent,
  brandKit: GeneratorBrandKit,
  format: 'feed' | 'story',
  imageUrl?: string,
  accentEmphasis: 'low' | 'medium' | 'high' = 'medium'
): PolotnoJSON {
  const width = 1080;
  const height = format === 'feed' ? 1350 : 1920;
  const margin = 64;
  
  const roles = resolveColorRoles(brandKit, accentEmphasis);
  const json = createTemplate(width, height, brandKit.typography.fontName);
  const children: PolotnoChild[] = [];
  
  // Background image
  children.push({
    type: 'image',
    x: 0,
    y: 0,
    width,
    height,
    src: imageUrl || 'https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&q=80&w=1080'
  });
  
  // Scrim: Premium multi-step easing gradient to transition smoothly from dark/surface to clear
  const scrimH = Math.round(height * 0.5);
  const scrimY = height - scrimH;
  
  const scrimColor0 = hexToRgbaStr(roles.surface, 1.0);
  const scrimColor1 = hexToRgbaStr(roles.surface, 0.85);
  const scrimColor2 = hexToRgbaStr(roles.surface, 0.45);
  const scrimColor3 = hexToRgbaStr(roles.surface, 0.15);
  const scrimColor4 = hexToRgbaStr(roles.surface, 0.0);
  const fillGradient = `linear-gradient(to top, ${scrimColor0} 0%, ${scrimColor1} 35%, ${scrimColor2} 65%, ${scrimColor3} 85%, ${scrimColor4} 100%)`;
  
  children.push({
    type: 'figure',
    subType: 'rect',
    x: 0,
    y: scrimY,
    width,
    height: scrimH,
    fill: fillGradient
  });
  
  // Logo top-left
  children.push({
    type: 'image',
    x: margin,
    y: margin,
    width: 128,
    height: 64,
    src: brandKit.logoUrl
  });
  
  // Anchored CTA
  const hasCta = !!content.cta;
  const ctaH = 88;
  const ctaW = 300;
  const ctaY = height - margin - ctaH;
  
  if (hasCta && content.cta) {
    const isLow = accentEmphasis === 'low';
    children.push({
      type: 'figure',
      subType: 'rect',
      x: margin,
      y: ctaY,
      width: ctaW,
      height: ctaH,
      cornerRadius: 44,
      fill: isLow ? 'transparent' : roles.accent,
      border: isLow ? `2px solid ${roles.accent}` : undefined,
      premiumShadowSoft: !isLow
    });
    children.push({
      type: 'text',
      x: margin,
      y: ctaY + (ctaH - 30) / 2 - 2,
      width: ctaW,
      text: content.cta.toUpperCase(),
      fontFamily: brandKit.typography.fontName,
      fontSize: 24,
      fontWeight: 'bold',
      align: 'center',
      fill: isLow ? roles.accent : roles.surface
    });
  }
  
  const textBottom = hasCta ? ctaY - spacing.md : height - margin;
  const textTop = scrimY + spacing.md;
  const availableH = textBottom - textTop;
  
  const headlineText = content.headline || 'Lifestyle Moment';
  const subheadText = content.subhead || '';
  
  const headFit = autoFit(
    headlineText,
    width - (margin * 2) - 24,
    availableH * 0.7,
    'headline',
    'subhead',
    3
  );
  
  const headlineY = textBottom - headFit.height - (subheadText ? spacing.sm + 48 : 0);
  
  // Vertical Anchor Accent Line on the left (4px width is sleeker than 6px)
  const lineH = headFit.height + (subheadText ? spacing.sm + 44 : 0);
  children.push({
    type: 'figure',
    subType: 'rect',
    x: margin,
    y: headlineY + 4,
    width: 4,
    height: lineH,
    fill: roles.accent
  });
  
  // Text elements shifted to the right of the anchor line
  children.push({
    type: 'text',
    x: margin + 20,
    y: headlineY,
    width: width - (margin * 2) - 24,
    text: headlineText,
    fontFamily: brandKit.typography.fontName,
    fontSize: headFit.fontSize,
    lineHeight: headFit.lineHeight,
    fontWeight: 'bold',
    align: 'left',
    fill: '#FFFFFF',
    textShadow: '0 2px 8px rgba(0,0,0,0.3)'
  });
  
  if (subheadText) {
    children.push({
      type: 'text',
      x: margin + 20,
      y: headlineY + headFit.height + spacing.sm,
      width: width - (margin * 2) - 24,
      text: subheadText,
      fontFamily: brandKit.typography.fontName,
      fontSize: typography.subhead.size - 4,
      lineHeight: typography.subhead.lineHeight,
      fontWeight: 'normal',
      align: 'left',
      fill: 'rgba(255, 255, 255, 0.75)',
      textShadow: '0 1px 5px rgba(0,0,0,0.25)'
    });
  }
  
  json.pages.push({
    id: 'p1',
    background: '#000000',
    children
  });
  
  return json;
}

// ----------------------------------------------------
// A5: Top / Footer Bar (Structured Hours / Reopening)
// ----------------------------------------------------
export function renderA5(content: CreativeContent, brandKit: GeneratorBrandKit, format: 'feed' | 'story', imageUrl?: string): PolotnoJSON {
  const width = 1080;
  const height = format === 'feed' ? 1350 : 1920;
  const margin = 64;
  
  const roles = resolveColorRoles(brandKit);
  const json = createTemplate(width, height, brandKit.typography.fontName);
  const children: PolotnoChild[] = [];
  
  const topBarH = 180;
  children.push({
    type: 'figure',
    subType: 'rect',
    x: 0,
    y: 0,
    width,
    height: topBarH,
    fill: roles.surface,
    premiumShadow: true
  });
  
  const logoH = 88;
  const logoW = 176;
  children.push({
    type: 'image',
    x: margin,
    y: (topBarH - logoH) / 2,
    width: logoW,
    height: logoH,
    src: brandKit.logoUrl
  });
  
  const imageH = height - (topBarH * 2);
  children.push({
    type: 'image',
    x: 0,
    y: topBarH,
    width,
    height: imageH,
    src: imageUrl || 'https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&q=80&w=1080',
    filter: 'duotone',
    duotoneColors: [roles.ink, roles.surface]
  });
  
  const footerBarY = height - topBarH;
  children.push({
    type: 'figure',
    subType: 'rect',
    x: 0,
    y: footerBarY,
    width,
    height: topBarH,
    fill: roles.surface,
    premiumShadow: true
  });
  
  const footerText = content.footer_text || content.headline || 'Információs közlemény';
  children.push({
    type: 'text',
    x: margin,
    y: footerBarY + (topBarH - typography.subhead.size * 1.2) / 2,
    width: width - (margin * 2),
    text: footerText,
    fontFamily: brandKit.typography.fontName,
    fontSize: typography.subhead.size - 4,
    lineHeight: 1.2,
    fontWeight: 'bold',
    align: 'center',
    fill: roles.ink
  });
  
  json.pages.push({
    id: 'p1',
    background: '#FFFFFF',
    children
  });
  
  return json;
}

// ----------------------------------------------------
// A6: number (5), headline (32), terms (60)
// ----------------------------------------------------
export function renderA6(
  content: CreativeContent,
  brandKit: GeneratorBrandKit,
  format: 'feed' | 'story',
  accentEmphasis: 'low' | 'medium' | 'high' = 'medium'
): PolotnoJSON {
  const width = 1080;
  const height = format === 'feed' ? 1350 : 1920;
  const margin = 64;
  
  const roles = resolveColorRoles(brandKit, accentEmphasis);
  const json = createTemplate(width, height, brandKit.typography.fontName);
  const children: PolotnoChild[] = [];
  
  // Circular Seal
  const radius = 300;
  const badgeX = (width - radius * 2) / 2;
  const badgeY = format === 'feed' ? 150 : 250;
  
  // Outer filled circle
  children.push({
    type: 'figure',
    subType: 'circle',
    x: badgeX,
    y: badgeY,
    width: radius * 2,
    height: radius * 2,
    fill: roles.accent,
    premiumShadow: true
  });
  
  // Outer thin solid border outline (inset by 8px)
  const outerBorderOffset = 8;
  const outerBorderRadius = radius - outerBorderOffset;
  const outerBorderColor = hexToRgbaStr(roles.surface, 0.5);
  children.push({
    type: 'figure',
    subType: 'circle',
    x: badgeX + outerBorderOffset,
    y: badgeY + outerBorderOffset,
    width: outerBorderRadius * 2,
    height: outerBorderRadius * 2,
    fill: 'transparent',
    border: `1px solid ${outerBorderColor}`
  });
  
  // Inner dashed border circle overlay (creates a classic badge/seal feel)
  const innerOffset = 24;
  const innerRadius = radius - innerOffset;
  children.push({
    type: 'figure',
    subType: 'circle',
    x: badgeX + innerOffset,
    y: badgeY + innerOffset,
    width: innerRadius * 2,
    height: innerRadius * 2,
    fill: 'transparent',
    border: `2px dashed ${roles.surface}`
  });
  
  const numberText = content.number || '-30%';
  const numberFit = autoFit(
    numberText,
    radius * 1.5,
    radius * 1.5,
    'display',
    'headline',
    1
  );

  children.push({
    type: 'text',
    id: 'badge-text-a6',
    ownerId: 'badge-circle-a6',
    adaptiveScaling: true,
    x: badgeX,
    y: badgeY + (radius - numberFit.height / 2) - 5,
    width: radius * 2,
    text: numberText,
    fontFamily: brandKit.typography.fontName,
    fontSize: numberFit.fontSize,
    lineHeight: 1.0,
    fontWeight: '900',
    align: 'center',
    fill: roles.surface,
    letterSpacing: '-0.05em'
  });
  
  const headlineText = content.headline || 'Tavaszi Akció';
  const termsText = content.terms || '';
  const textTop = badgeY + (radius * 2) + spacing.lg;
  
  children.push({
    type: 'text',
    x: margin,
    y: textTop,
    width: width - (margin * 2),
    text: headlineText,
    fontFamily: brandKit.typography.fontName,
    fontSize: typography.headline.size - 4,
    lineHeight: typography.headline.lineHeight,
    fontWeight: 'bold',
    align: 'center',
    fill: roles.ink
  });
  
  if (termsText) {
    children.push({
      type: 'text',
      x: margin,
      y: textTop + (typography.headline.size - 4) * 1.3 + spacing.sm,
      width: width - (margin * 2),
      text: termsText,
      fontFamily: brandKit.typography.fontName,
      fontSize: typography.caption.size,
      lineHeight: typography.caption.lineHeight,
      fontWeight: 'normal',
      align: 'center',
      fill: roles.inkMuted
    });
  }
  
  // Logo
  children.push({
    type: 'image',
    x: (width - 128) / 2,
    y: height - margin - 56,
    width: 128,
    height: 56,
    src: brandKit.logoUrl
  });
  
  json.pages.push({
    id: 'p1',
    background: roles.surface,
    children
  });
  
  return json;
}

// ----------------------------------------------------
// A7: Quote Card (Customer Review)
// ----------------------------------------------------
export function renderA7(content: CreativeContent, brandKit: GeneratorBrandKit, format: 'feed' | 'story'): PolotnoJSON {
  const width = 1080;
  const height = format === 'feed' ? 1350 : 1920;
  const margin = 64;
  
  const roles = resolveColorRoles(brandKit);
  const json = createTemplate(width, height, brandKit.typography.fontName);
  const children: PolotnoChild[] = [];
  
  // Quote Glyph
  children.push({
    type: 'text',
    x: margin,
    y: format === 'feed' ? 120 : 220,
    width: 200,
    text: '“',
    fontFamily: brandKit.typography.fontName,
    fontSize: 220,
    fontWeight: 'bold',
    align: 'left',
    fill: roles.accent
  });
  
  const quoteText = content.quote || 'Nagyon elégedett vagyok a szolgáltatással!';
  const authorText = content.author || '— Anna';
  const quoteTop = format === 'feed' ? 360 : 460;
  
  const quoteFit = autoFit(
    quoteText,
    width - (margin * 2),
    height * 0.45,
    'subhead',
    'body',
    6
  );
  
  children.push({
    type: 'text',
    x: margin,
    y: quoteTop,
    width: width - (margin * 2),
    text: quoteText,
    fontFamily: brandKit.typography.fontName,
    fontSize: quoteFit.fontSize,
    lineHeight: quoteFit.lineHeight,
    fontWeight: 'bold',
    align: 'left',
    fill: roles.ink
  });
  
  children.push({
    type: 'text',
    x: margin,
    y: quoteTop + quoteFit.height + spacing.lg,
    width: width - (margin * 2),
    text: authorText,
    fontFamily: brandKit.typography.fontName,
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    fontWeight: 'normal',
    align: 'left',
    fill: roles.inkMuted
  });
  
  // Logo
  children.push({
    type: 'image',
    x: width - margin - 128,
    y: height - margin - 48,
    width: 128,
    height: 48,
    src: brandKit.logoUrl
  });
  
  json.pages.push({
    id: 'p1',
    background: roles.surface,
    children
  });
  
  return json;
}

// ----------------------------------------------------
// A8: List / Grid (Tips or Reasons)
// ----------------------------------------------------
export function renderA8(content: CreativeContent, brandKit: GeneratorBrandKit, format: 'feed' | 'story'): PolotnoJSON {
  const width = 1080;
  const height = format === 'feed' ? 1350 : 1920;
  const margin = 64;
  
  const roles = resolveColorRoles(brandKit);
  const json = createTemplate(width, height, brandKit.typography.fontName);
  const children: PolotnoChild[] = [];
  
  const titleText = content.title || '3 dolog, amit tudnod kell';
  const titleY = format === 'feed' ? 128 : 220;
  
  children.push({
    type: 'text',
    x: margin,
    y: titleY,
    width: width - (margin * 2),
    text: titleText,
    fontFamily: brandKit.typography.fontName,
    fontSize: typography.headline.size - 8,
    lineHeight: typography.headline.lineHeight,
    fontWeight: 'bold',
    align: 'left',
    fill: roles.ink
  });
  
  const rawItems = content.items || ['Első fontos tipp', 'Második tipp részletesen', 'Harmadik kiemelt tipp'];
  const items = rawItems.slice(0, 4);
  
  const itemsTop = titleY + 120 + spacing.md;
  const itemsBottom = height - margin - 80;
  const availableH = itemsBottom - itemsTop;
  const itemH = Math.floor((availableH - (items.length - 1) * spacing.lg) / items.length);
  
  items.forEach((itemText, idx) => {
    const itemY = itemsTop + idx * (itemH + spacing.lg);
    
    const chipSize = 64;
    children.push({
      type: 'figure',
      subType: 'circle',
      x: margin,
      y: itemY + (itemH - chipSize) / 2,
      width: chipSize,
      height: chipSize,
      fill: roles.accent,
      premiumShadowSoft: true
    });
    
    children.push({
      type: 'text',
      x: margin,
      y: itemY + (itemH - chipSize) / 2 + (chipSize - 26) / 2 - 2,
      width: chipSize,
      text: String(idx + 1),
      fontFamily: brandKit.typography.fontName,
      fontSize: 26,
      fontWeight: 'bold',
      align: 'center',
      fill: roles.surface
    });
    
    children.push({
      type: 'text',
      x: margin + chipSize + spacing.md,
      y: itemY + (itemH - typography.body.size * 1.35) / 2,
      width: width - (margin * 2) - chipSize - spacing.md,
      text: itemText,
      fontFamily: brandKit.typography.fontName,
      fontSize: typography.body.size - 4,
      lineHeight: typography.body.lineHeight,
      fontWeight: 'bold',
      align: 'left',
      fill: roles.ink
    });
  });
  
  // Logo
  children.push({
    type: 'image',
    x: margin,
    y: height - margin - 48,
    width: 96,
    height: 48,
    src: brandKit.logoUrl
  });
  
  json.pages.push({
    id: 'p1',
    background: roles.surface,
    children
  });
  
  return json;
}

// ----------------------------------------------------
// A9: Story CTA (Re-anchoring)
// ----------------------------------------------------
export function renderA9(content: CreativeContent, brandKit: GeneratorBrandKit, imageUrl?: string): PolotnoJSON {
  const width = 1080;
  const height = 1920;
  const margin = 64;
  
  const roles = resolveColorRoles(brandKit);
  const json = createTemplate(width, height, brandKit.typography.fontName);
  const children: PolotnoChild[] = [];
  
  children.push({
    type: 'image',
    x: 0,
    y: 0,
    width,
    height,
    src: imageUrl || 'https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&q=80&w=1080',
    filter: 'duotone',
    duotoneColors: [roles.ink, roles.surface]
  });
  
  // Logo
  children.push({
    type: 'image',
    x: margin,
    y: 260,
    width: 128,
    height: 64,
    src: brandKit.logoUrl
  });
  
  const headlineText = content.headline || 'Új lehetőség!';
  const subheadText = content.subhead || '';
  
  const hookFit = autoFit(
    headlineText,
    width - (margin * 2),
    400,
    'headline',
    'subhead',
    3
  );
  
  children.push({
    type: 'text',
    x: margin,
    y: 360,
    width: width - (margin * 2),
    text: headlineText,
    fontFamily: brandKit.typography.fontName,
    fontSize: hookFit.fontSize,
    lineHeight: hookFit.lineHeight,
    fontWeight: 'bold',
    align: 'left',
    fill: roles.ink
  });
  
  if (subheadText) {
    children.push({
      type: 'text',
      x: margin,
      y: 360 + hookFit.height + spacing.md,
      width: width - (margin * 2),
      text: subheadText,
      fontFamily: brandKit.typography.fontName,
      fontSize: typography.subhead.size,
      lineHeight: typography.subhead.lineHeight,
      fontWeight: 'normal',
      align: 'left',
      fill: roles.inkMuted
    });
  }
  
  // CTA
  const ctaText = content.cta || 'KATTINTS IDE';
  const ctaW = 340;
  const ctaH = 96;
  const ctaY = 1560;
  
  children.push({
    type: 'figure',
    subType: 'rect',
    x: (width - ctaW) / 2,
    y: ctaY,
    width: ctaW,
    height: ctaH,
    cornerRadius: 48,
    fill: roles.accent,
    premiumShadowSoft: true
  });
  
  children.push({
    type: 'text',
    x: (width - ctaW) / 2,
    y: ctaY + (ctaH - 32) / 2 - 2,
    width: ctaW,
    text: ctaText.toUpperCase(),
    fontFamily: brandKit.typography.fontName,
    fontSize: 28,
    fontWeight: 'bold',
    align: 'center',
    fill: roles.surface
  });
  
  json.pages.push({
    id: 'p1',
    background: '#FFFFFF',
    children
  });
  
  return json;
}

// ----------------------------------------------------
// Unified Router
// ----------------------------------------------------
export function renderVariant(
  archetype: 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8' | 'A9',
  content: CreativeContent,
  brandKit: GeneratorBrandKit,
  format: 'feed' | 'story',
  imageUrl?: string,
  accentEmphasis: 'low' | 'medium' | 'high' = 'medium'
): PolotnoJSON {
  switch (archetype) {
    case 'A1':
      return renderA1(content, brandKit, format, accentEmphasis);
    case 'A2':
      return renderA2(content, brandKit, format, imageUrl, accentEmphasis);
    case 'A3':
      return renderA3(content, brandKit, format, imageUrl, accentEmphasis);
    case 'A4':
      return renderA4(content, brandKit, format, imageUrl, accentEmphasis);
    case 'A5':
      return renderA5(content, brandKit, format, imageUrl);
    case 'A6':
      return renderA6(content, brandKit, format, accentEmphasis);
    case 'A7':
      return renderA7(content, brandKit, format);
    case 'A8':
      return renderA8(content, brandKit, format);
    case 'A9':
      return renderA9(content, brandKit, imageUrl);
    default:
      return renderA1(content, brandKit, format, accentEmphasis);
  }
}

// Helper to check relative luminance of colors inside code
function getLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function hexToRgbaStr(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
