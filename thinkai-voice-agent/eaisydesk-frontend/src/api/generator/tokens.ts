// @ts-nocheck
import { GeneratorBrandKit } from './types';

// 8px Base Spacing Grid
export const spacing = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 40,
  xl: 64,
  '2xl': 96,
  '3xl': 128,
};

// Modular Type Scale Steps
export const typography = {
  display: { size: 96, lineHeight: 1.05 },
  headline: { size: 72, lineHeight: 1.10 },
  subhead: { size: 48, lineHeight: 1.20 },
  body: { size: 36, lineHeight: 1.35 },
  caption: { size: 28, lineHeight: 1.30 },
  micro: { size: 22, lineHeight: 1.30 },
};

// Conversions and math for contrast checking
export function hexToRgb(hex: string) {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return { r, g, b };
}

export function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

// Pick the best text color option (e.g. light vs dark) based on contrast ratios
export function pickInkFor(surface: string, lightOption: string, darkOption: string): string {
  const ratioLight = getContrastRatio(surface, lightOption);
  const ratioDark = getContrastRatio(surface, darkOption);
  
  if (ratioLight >= 4.5 && ratioLight >= ratioDark) {
    return lightOption;
  }
  if (ratioDark >= 4.5) {
    return darkOption;
  }
  
  // Fallbacks if neither option hits WCAG standard
  return ratioLight > ratioDark ? '#FFFFFF' : '#000000';
}

export interface ColorRoles {
  surface: string;
  ink: string;
  inkMuted: string;
  accent: string;
}

// Map the brand kit colors onto standard visual roles
export function resolveColorRoles(brandKit: GeneratorBrandKit, accentEmphasis: 'low' | 'medium' | 'high' = 'medium'): ColorRoles {
  // Extract colors from brand kit
  const brandPrimary = brandKit.colors.primary; // Often dark or dominant
  const brandSecondary = brandKit.colors.secondary; // Often light or secondary
  const brandAccent = brandKit.colors.accent; // Action/CTA color

  // Determine if primary is dark or light based on luminance
  const isPrimaryDark = getLuminance(brandPrimary) < 0.5;

  let surface = brandPrimary;
  let ink = isPrimaryDark ? '#FFFFFF' : '#102A2E'; // contrast default
  
  // Resolve ink against surface
  ink = pickInkFor(surface, brandSecondary, isPrimaryDark ? '#FFFFFF' : '#1A1A1A');
  
  // Resolve inkMuted by applying opacity in style sheet, or picking a less contrasting tone
  const inkMuted = ink.startsWith('#') && ink.length === 7 ? ink + 'B3' : ink; // ~70% opacity in hex (B3)

  return {
    surface,
    ink,
    inkMuted,
    accent: brandAccent,
  };
}
