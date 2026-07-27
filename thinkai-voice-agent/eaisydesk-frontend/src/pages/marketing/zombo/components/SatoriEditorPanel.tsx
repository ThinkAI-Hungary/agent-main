/**
 * SatoriEditorPanel -- beepitett Satori layer szerkeszto
 * Overhauled Figma-like sidebar design, presets support, layer list manager and AI auto-layout.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { showToast } from '../../../../components/ui/Toast';

const API = (import.meta as any).env?.VITE_KEPGENERALAS_API_URL || 'http://localhost:3001';

let BRAND_DNA_COLORS = {
  primary: '#187fc0',   // Piktor Kék
  secondary: '#333333', // Sötétszürke
  accent: '#c32226',    // Piktor Piros
  background: '#ffffff',
  text: '#000000',
  white: '#ffffff',
  grey: '#a1a1aa'
};

const LayersIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 17 22 12" />
  </svg>
);
const DlIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const PlusIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const RefreshIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);
const TrashIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const RobotIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4M8 15h.01M16 15h.01" />
  </svg>
);
const PalIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.01452 19.156 5.0925 19.234 5.15669 19.3278C5.29384 19.5281 5.30881 19.7891 5.19522 20.0039C5.14207 20.1044 5.06649 20.1873 4.91533 20.3533L4.82843 20.4485C4.29813 21.0318 4.03298 21.3235 4.0768 21.572C4.12061 21.8206 4.45785 21.9366 5.13233 22C5.38531 22 5.56549 22 5.72147 22H12Z" />
    <circle cx="7.5" cy="10.5" r="1.5" /><circle cx="11.5" cy="7.5" r="1.5" /><circle cx="16.5" cy="9.5" r="1.5" /><circle cx="15.5" cy="14.5" r="1.5" />
  </svg>
);
const EyeIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const SATORI_STYLES = [
  // 30 Premium Tailwind Styles at the front
  { id: 'tailwind-cta', name: 'Tailwind 1', thumbGrad: 'linear-gradient(135deg, #187fc0 0%, #3da2e3 100%)', category: 'tailwind-basic' },
  { id: 'tailwind-gradient-bottom', name: 'Tailwind 2', thumbGrad: 'linear-gradient(to top, #0f172a 0%, rgba(15,23,42,0) 100%)', category: 'tailwind-basic' },
  { id: 'tailwind-gradient-left', name: 'Tailwind 3', thumbGrad: 'linear-gradient(to right, #0f172a 0%, rgba(15,23,42,0) 100%)', category: 'tailwind-basic' },
  { id: 'tailwind-luxury-frame', name: 'Tailwind 4', thumbGrad: 'rgba(15,23,42,0.95)', category: 'tailwind-basic' },
  { id: 'tailwind-neo-brutal', name: 'Tailwind 5', thumbGrad: 'linear-gradient(135deg, #ffffff 0%, #c32226 100%)', category: 'tailwind-basic' },
  { id: 'tailwind-ribbon-top', name: 'Tailwind 6', thumbGrad: 'linear-gradient(to bottom, #0f172a 0%, rgba(15,23,42,0) 100%)', category: 'tailwind-basic' },
  { id: 'tailwind-circle-badge', name: 'Tailwind 7', thumbGrad: 'radial-gradient(circle, #0f172a 0%, rgba(15,23,42,0) 100%)', category: 'tailwind-basic' },
  { id: 'tailwind-feature-list', name: 'Tailwind 8', thumbGrad: 'linear-gradient(to bottom, #0f172a 0%, #020617 100%)', category: 'tailwind-basic' },
  { id: 'tailwind-side-panel', name: 'Tailwind 9', thumbGrad: 'linear-gradient(to right, #0f172a 0%, rgba(15,23,42,0) 100%)', category: 'tailwind-basic' },
  { id: 'tailwind-minimal-corner', name: 'Tailwind 10', thumbGrad: 'radial-gradient(circle at bottom right, #0f172a 0%, rgba(15,23,42,0) 100%)', category: 'tailwind-basic' },

  { id: 'modernist-split', name: 'Tailwind 11', thumbGrad: 'linear-gradient(to right, rgba(0,0,0,0) 50%, #111827 50%)', category: 'tailwind-custom' },
  { id: 'magazine-cover', name: 'Tailwind 12', thumbGrad: 'rgba(0,0,0,0.3)', category: 'tailwind-custom' },
  { id: 'minimalist-editorial', name: 'Tailwind 13', thumbGrad: '#ffffff', category: 'tailwind-custom' },
  { id: 'glow-dark', name: 'Tailwind 14', thumbGrad: 'radial-gradient(circle at center, #187fc0 0%, #0b0f19 100%)', category: 'tailwind-custom' },
  { id: 'bold-slant', name: 'Tailwind 15', thumbGrad: 'linear-gradient(135deg, #187fc0 0%, #3da2e3 100%)', category: 'tailwind-custom' },
  { id: 'duotone-overlay', name: 'Tailwind 16', thumbGrad: 'linear-gradient(135deg, #187fc0 0%, #c32226 100%)', category: 'tailwind-custom' },
  { id: 'neon-sign', name: 'Tailwind 17', thumbGrad: 'radial-gradient(circle, #c32226 0%, #05050a 100%)', category: 'tailwind-custom' },
  { id: 'glass-list', name: 'Tailwind 18', thumbGrad: 'linear-gradient(to bottom, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 100%)', category: 'tailwind-custom' },
  { id: 'brushed-metal', name: 'Tailwind 19', thumbGrad: 'linear-gradient(to right, #334155 0%, #1e293b 100%)', category: 'tailwind-custom' },
  { id: 'cyberpunk-hud', name: 'Tailwind 20', thumbGrad: 'radial-gradient(circle, #187fc0 0%, #030712 100%)', category: 'tailwind-custom' },

  { id: 'stripe-card', name: 'Tailwind 21', thumbGrad: 'linear-gradient(135deg, #187fc0 0%, #c32226 100%)', category: 'tailwind-internet' },
  { id: 'linear-board', name: 'Tailwind 22', thumbGrad: 'linear-gradient(to bottom, #121214 0%, #18181b 100%)', category: 'tailwind-internet' },
  { id: 'apple-spec', name: 'Tailwind 23', thumbGrad: '#000000', category: 'tailwind-internet' },
  { id: 'netflix-billboard', name: 'Tailwind 24', thumbGrad: 'linear-gradient(to top, #000000 0%, rgba(0,0,0,0) 100%)', category: 'tailwind-internet' },
  { id: 'airbnb-card', name: 'Tailwind 25', thumbGrad: '#ffffff', category: 'tailwind-internet' },
  { id: 'spotify-lyrics', name: 'Tailwind 26', thumbGrad: 'radial-gradient(circle, #1ed760 0%, #000000 100%)', category: 'tailwind-internet' },
  { id: 'notion-board', name: 'Tailwind 27', thumbGrad: '#ffffff', category: 'tailwind-internet' },
  { id: 'figma-canvas', name: 'Tailwind 28', thumbGrad: 'linear-gradient(to bottom, #f1f1f1 0%, #ffffff 100%)', category: 'tailwind-internet' },
  { id: 'github-readme', name: 'Tailwind 29', thumbGrad: '#ffffff', category: 'tailwind-internet' },
  { id: 'tesla-minimal', name: 'Tailwind 30', thumbGrad: '#f4f4f5', category: 'tailwind-internet' },

  // Original non-tailwind styles follow
  { id: 'gradient-bottom', name: 'Gradient Alul', thumbGrad: 'linear-gradient(to top, #000 0%, rgba(0,0,0,0) 55%)', category: 'legacy' },
  { id: 'gradient-left', name: 'Gradient Bal', thumbGrad: 'linear-gradient(to right, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0) 55%)', category: 'legacy' },
  { id: 'circle-badge', name: 'Kör Badge', thumbGrad: 'radial-gradient(circle at center, rgba(24,127,192,0.85) 0%, rgba(0,0,0,0.5) 60%)', category: 'legacy' },
  { id: 'promo-accent', name: 'Promo Accent', thumbGrad: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0) 48%)', category: 'legacy' },
  { id: 'full-dark', name: 'Full Dark', thumbGrad: 'rgba(0,0,0,0.7)', category: 'legacy' },
  { id: 'white-card', name: 'Fehér Kártya', thumbGrad: 'linear-gradient(to top, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.97) 35%, rgba(255,255,255,0) 65%)', category: 'legacy' },
  { id: 'luxury-frame', name: 'Luxury Keret', thumbGrad: 'rgba(5,3,12,0.87)', category: 'legacy' },
  { id: 'neo-brutal', name: 'Neo Brutal', thumbGrad: 'rgba(0,0,0,0.56)', category: 'legacy' },
  { id: 'ribbon-top', name: 'Ribbon Felül', thumbGrad: 'linear-gradient(to bottom, rgba(24,127,192,0.9) 0%, rgba(24,127,192,0.9) 22%, rgba(0,0,0,0.5) 22%)', category: 'legacy' },
  { id: 'minimal-bar', name: 'Minimál Sáv', thumbGrad: 'rgba(0,0,0,0.14)', category: 'legacy' },
  { id: 'glass-card', name: 'Glass Card', thumbGrad: 'linear-gradient(to top, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.22) 38%, rgba(255,255,255,0) 60%)', category: 'legacy' },
  { id: 'diagonal-split', name: 'Átlós Split', thumbGrad: 'linear-gradient(135deg, #fff 48%, rgba(0,0,0,0.88) 48%)', category: 'legacy' },
  { id: 'feature-list', name: 'Felsorolás', thumbGrad: 'linear-gradient(to bottom, #1e1b4b 0%, #1e1b4b 100%)', category: 'legacy' },
  { id: 'retro-sticker', name: 'Retro Matrica', thumbGrad: 'linear-gradient(135deg, #ffffff 0%, #c32226 100%)', category: 'legacy' },
  { id: 'side-panel', name: 'Oldalsáv', thumbGrad: 'linear-gradient(to right, #187fc0 0%, #187fc0 38%, rgba(0,0,0,0) 38%)', category: 'legacy' },
  { id: 'minimal-corner', name: 'Sarok Kártya', thumbGrad: 'radial-gradient(circle at bottom right, #ffffff 0%, rgba(255,255,255,0) 70%)', category: 'legacy' },
  { id: 'modern-minimal-border', name: 'Minimál Keret', thumbGrad: 'linear-gradient(135deg, #187fc0 0%, #187fc0 100%)', category: 'legacy' },
  { id: 'asymmetric-split', name: 'Aszimmetrikus', thumbGrad: 'linear-gradient(to left, #187fc0 0%, #187fc0 38%, rgba(0,0,0,0) 38%)', category: 'legacy' },
  { id: 'badge-ticker', name: 'Marquee Szalag', thumbGrad: 'linear-gradient(to bottom, #c32226 0%, #c32226 20%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 80%, #c32226 80%)', category: 'legacy' },
  { id: 'comic-speech', name: 'Képregény Buborék', thumbGrad: 'radial-gradient(circle at center, #ffffff 0%, #ffffff 50%, rgba(0,0,0,0) 55%)', category: 'legacy' },
  { id: 'bold-kicker', name: 'Kicker Cím', thumbGrad: 'linear-gradient(135deg, #187fc0 0%, #105e8f 100%)', category: 'legacy' },
  { id: 'social-proof-rating', name: 'Értékelés', thumbGrad: 'linear-gradient(135deg, #c32226 0%, #9c1b1e 100%)', category: 'legacy' },
  { id: 'polaroid-frame', name: 'Polaroid Keret', thumbGrad: 'linear-gradient(to bottom, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.2) 80%, #ffffff 80%)', category: 'legacy' }
];

const STYLE_PRESETS: Record<string, { name: string; text: string; cta: string }[]> = {
  'feature-list': [
    { name: 'Kiemelt Előnyök', text: '• Prémium minőség\n• 100% tartós fedés\n• Környezetbarát', cta: 'Megnézem' },
    { name: 'Adatok', text: '• Kiadósság: 10m²/l\n• Száradás: 2 óra\n• Beltéri glettvakolat', cta: 'Részletek' }
  ],
  'retro-sticker': [
    { name: '📢 Új Termék Sticker', text: 'Megérkezett a legújabb\nkollekciónk!', cta: 'Felfedezem' },
    { name: 'Új Termék', text: 'ÚJ TERMÉK!', cta: 'Kipróbálom' },
    { name: 'Akció', text: '-20% KEDVEZMÉNY', cta: 'Megveszem' }
  ],
  'side-panel': [
    { name: 'Oldalsáv Szöveg', text: 'PRÉMIUM\nFESTÉKEK\nA PIKTORTÓL', cta: 'Rendelés' }
  ],
  'minimal-corner': [
    { name: 'Diszkrét Címke', text: 'Piktor Kft.\nGyőr', cta: 'Kapcsolat' }
  ],
  'gradient-bottom': [
    { name: 'Standard Ajánlat', text: 'TÉLI AKCIÓ\n-30% MINDENRE!', cta: 'Vásárlás' }
  ],
  'modern-minimal-border': [
    { name: 'Klasszikus Keret', text: 'ELEGANCIA ÉS STÍLUS', cta: 'Felfedezem' }
  ],
  'asymmetric-split': [
    { name: 'Kiemelt Adat', text: 'KIVÁLÓ FEDÉS\nTARTÓS MINŐSÉG', cta: 'Rendelés' }
  ],
  'badge-ticker': [
    { name: 'Futó Ticker', text: 'SZUPER AKCIÓ • -20% MINDENRE', cta: 'Érdekel' }
  ],
  'comic-speech': [
    { name: 'Kreatív Buborék', text: '„Ez a kedvenc festékem!”', cta: 'Kipróbálom' }
  ],
  'bold-kicker': [
    { name: 'Kicker Címke', text: 'FALFESTÉK\nINNTALER MATT', cta: 'Vásárlás' }
  ],
  'social-proof-rating': [
    { name: '💬 Vásárlói Értékelés', text: '„Csodás színek, gyors száradás és rendkívül kedves kiszolgálás a győri üzletben. Csak ajánlani tudom!”', cta: 'Vélemények' }
  ],
  'polaroid-frame': [
    { name: 'Polaroid Fotó', text: 'Győri üzletünk kínálata', cta: 'Térkép' }
  ],
  'tailwind-cta': [
    { name: 'Tailwind Kártya', text: 'READY TO DIVE IN?\nStart your free trial today.', cta: 'Get started' }
  ],
  'bold-slant': [
    { name: '🔥 Szuper Akció', text: '30% NYÁRI AKCIÓ\nMINDEN TERMÉKRE', cta: 'Megnézem' }
  ],
  'apple-spec': [
    { name: '🍏 Apple Specifikáció', text: '• Rendkívüli fedőképesség\n• Illatosított formula\n• Mosható, kopásálló felület', cta: 'Megrendelem' }
  ],
  'tailwind-luxury-frame': [
    { name: '🏆 Exclusive Luxus', text: 'Különleges & Tartós', cta: 'Ajánlatkérés' }
  ],
  'minimalist-editorial': [
    { name: '📖 Editorial Cikk', text: 'Hogyan válaszd ki a tökéletes színt a nappalidba?', cta: 'Elolvasom' }
  ]
};

interface GlobalPreset {
  name: string;
  description: string;
  styleId: string;
  textLayers: { id: string; text: string; fontSize?: number; color?: string; visible?: boolean }[];
  cta: string;
  ctaColor: string;
  ctaBgColor: string;
  showBorder: boolean;
  showBadge: boolean;
  showCta: boolean;
}

const GLOBAL_PRESETS: GlobalPreset[] = [
  {
    name: '🔥 Szuper Akció',
    description: 'Nyári leárazás vagy szezonális akció kiemelése bold, ferde elemekkel.',
    styleId: 'bold-slant',
    textLayers: [
      { id: 'brandName', text: 'PIKTOR KFT.', fontSize: 24, color: BRAND_DNA_COLORS.accent, visible: true },
      { id: 'productName', text: '30% NYÁRI AKCIÓ\nMINDEN TERMÉKRE', fontSize: 44, color: BRAND_DNA_COLORS.white, visible: true },
      { id: 'spec', text: 'Kuponkód: NYAR30 | Győri és soproni üzleteinkben', fontSize: 22, color: '#e2e8f0', visible: true }
    ],
    cta: 'Megnézem',
    ctaColor: BRAND_DNA_COLORS.white,
    ctaBgColor: BRAND_DNA_COLORS.accent,
    showBorder: true,
    showBadge: true,
    showCta: true
  },
  {
    name: '🍏 Apple Specifikáció',
    description: 'Minimalista termék előnyök és technikai adatok listázása prémium sötét kártyán.',
    styleId: 'apple-spec',
    textLayers: [
      { id: 'brandName', text: 'INNTALER MATT', fontSize: 24, color: BRAND_DNA_COLORS.grey, visible: true },
      { id: 'productName', text: 'Prémium beltéri falfesték', fontSize: 48, color: BRAND_DNA_COLORS.white, visible: true },
      { id: 'spec', text: '• Rendkívüli fedőképesség\n• Illatosított formula\n• Mosható, kopásálló felület', fontSize: 28, color: BRAND_DNA_COLORS.white, visible: true }
    ],
    cta: 'Megrendelem',
    ctaColor: BRAND_DNA_COLORS.text,
    ctaBgColor: BRAND_DNA_COLORS.white,
    showBorder: true,
    showBadge: true,
    showCta: true
  },
  {
    name: '🏆 Exclusive Luxus',
    description: 'Arany keretes és elegáns arculati megjelenés prémium termékekhez.',
    styleId: 'tailwind-luxury-frame',
    textLayers: [
      { id: 'brandName', text: 'PIKTOR EXCLUSIVE', fontSize: 24, color: BRAND_DNA_COLORS.primary, visible: true },
      { id: 'productName', text: 'Különleges & Tartós', fontSize: 42, color: BRAND_DNA_COLORS.white, visible: true },
      { id: 'spec', text: 'Prémium minőségű luxus falfestékek a falak szépségéért.', fontSize: 22, color: '#f4f4f5', visible: true }
    ],
    cta: 'Ajánlatkérés',
    ctaColor: BRAND_DNA_COLORS.white,
    ctaBgColor: BRAND_DNA_COLORS.primary,
    showBorder: true,
    showBadge: true,
    showCta: true
  },
  {
    name: '💬 Vásárlói Értékelés',
    description: 'Bizalmat építő testimonial és csillagos értékelés a kép felső részén.',
    styleId: 'social-proof-rating',
    textLayers: [
      { id: 'brandName', text: 'Kovács Péter • Vásárló', fontSize: 22, color: BRAND_DNA_COLORS.grey, visible: true },
      { id: 'productName', text: '„Csodás színek, gyors száradás és rendkívül kedves kiszolgálás a győri üzletben. Csak ajánlani tudom!”', fontSize: 24, color: BRAND_DNA_COLORS.white, visible: true }
    ],
    cta: 'Vélemények',
    ctaColor: BRAND_DNA_COLORS.white,
    ctaBgColor: BRAND_DNA_COLORS.accent,
    showBorder: true,
    showBadge: true,
    showCta: true
  },
  {
    name: '📢 Új Termék Sticker',
    description: 'Neo-brutalista matrica és vastag fekete árnyékok a kiemelkedő figyelemfelkeltésért.',
    styleId: 'retro-sticker',
    textLayers: [
      { id: 'brandName', text: 'ÚJ TERMÉK!', fontSize: 26, color: BRAND_DNA_COLORS.text, visible: true },
      { id: 'productName', text: 'Megérkezett a legújabb\nkollekciónk!', fontSize: 38, color: BRAND_DNA_COLORS.white, visible: true }
    ],
    cta: 'Felfedezem',
    ctaColor: BRAND_DNA_COLORS.white,
    ctaBgColor: BRAND_DNA_COLORS.primary,
    showBorder: true,
    showBadge: true,
    showCta: true
  },
  {
    name: '📖 Editorial Cikk',
    description: 'Letisztult, magazin-szerű elrendezés blogbejegyzések és tippek megosztásához.',
    styleId: 'minimalist-editorial',
    textLayers: [
      { id: 'brandName', text: 'TIPIKUS HIBÁK ELKERÜLÉSE', fontSize: 22, color: BRAND_DNA_COLORS.secondary, visible: true },
      { id: 'productName', text: 'Hogyan válaszd ki a tökéletes színt a nappalidba?', fontSize: 40, color: BRAND_DNA_COLORS.text, visible: true },
      { id: 'spec', text: 'Szakértői tippek és trükkök a Piktor Kft. festőmestereitől.', fontSize: 24, color: BRAND_DNA_COLORS.secondary, visible: true }
    ],
    cta: 'Elolvasom',
    ctaColor: BRAND_DNA_COLORS.white,
    ctaBgColor: BRAND_DNA_COLORS.secondary,
    showBorder: true,
    showBadge: true,
    showCta: true
  }
];

interface TextLayer {
  id: string; text: string; fontSize: number; color: string;
  opacity: number; x: number; y: number; textAlign: 'left' | 'center' | 'right';
  visible?: boolean;
}
const getPromoTextFromPrompt = (rawPrompt: string): string => {
  if (!rawPrompt) return '';
  const trimmed = rawPrompt.trim();
  if (trimmed.includes('\n')) {
    return trimmed.split('\n')[0].trim();
  }
  const sentences = trimmed.split(/(?<=[.!?])\s+/);
  if (sentences.length > 1) {
    return sentences[0].trim();
  }
  if (trimmed.split(/\s+/).length <= 8) {
    return trimmed;
  }
  return '';
};

interface Props {
  baseImageUrl: string;
  onRendered?: (url: string) => void;
  prompt?: string;
  subject?: string;
  decomposedLayerText?: string;
  decomposedLayerCta?: string;
  initialSuggestedStyles?: { styleId: string; reason: string }[];
  brandKit?: any;
}

export function SatoriEditorPanel({
  baseImageUrl,
  onRendered,
  prompt = '',
  subject = '',
  decomposedLayerText = '',
  decomposedLayerCta = '',
  initialSuggestedStyles,
  brandKit
}: Props) {
  // Dynamically update the colors from props or sessionStorage to handle SPA navigation and site changes
  if (brandKit?.colors) {
    if (brandKit.colors.primary) BRAND_DNA_COLORS.primary = brandKit.colors.primary;
    if (brandKit.colors.secondary) BRAND_DNA_COLORS.secondary = brandKit.colors.secondary;
    if (brandKit.colors.accent) BRAND_DNA_COLORS.accent = brandKit.colors.accent;
  } else {
    try {
      const raw = sessionStorage.getItem('zombo_audit_result');
      if (raw) {
        const data = JSON.parse(raw);
        const colorList = data.colors?.top_colors_detail || data.visuals?.top_colors_detail || [];
        if (colorList[0]?.hex) BRAND_DNA_COLORS.primary = colorList[0].hex;
        if (colorList[1]?.hex) BRAND_DNA_COLORS.secondary = colorList[1].hex;
        if (colorList[2]?.hex) BRAND_DNA_COLORS.accent = colorList[2].hex;
      }
    } catch (e) {
      console.error('[SatoriEditorPanel] Failed to update brand colors:', e);
    }
  }
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>('tailwind-cta');
  const [styleTab, setStyleTab] = useState<'all' | 'tailwind-basic' | 'tailwind-custom' | 'tailwind-internet' | 'legacy'>('all');
  const [textLayers, setTextLayers] = useState<TextLayer[]>(() => {
    const defaultText = decomposedLayerText || getPromoTextFromPrompt(prompt) || prompt || 'READY TO DIVE IN?\nStart your free trial today.';
    return [
      { id: 'brandName', text: subject || 'Piktor Kft.', fontSize: 20, color: BRAND_DNA_COLORS.accent, opacity: 100, x: 0, y: 0, textAlign: 'left', visible: true },
      { id: 'productName', text: defaultText, fontSize: 44, color: BRAND_DNA_COLORS.white, opacity: 100, x: 0, y: 0, textAlign: 'left', visible: true }
    ];
  });
  const [activeLayerIdx, setActiveLayerIdx] = useState(0);
  const [suggestedStyles, setSuggestedStyles] = useState<{ styleId: string; reason: string }[]>(initialSuggestedStyles || []);
  const [ctaText, setCtaText] = useState(decomposedLayerCta || 'Válaszd a megfelelőt!');
  const [ctaColor, setCtaColor] = useState(BRAND_DNA_COLORS.white);
  const [ctaBgColor, setCtaBgColor] = useState(BRAND_DNA_COLORS.primary);

  const [showBorder, setShowBorder] = useState(true);
  const [showCta, setShowCta] = useState(true);
  const [showBadge, setShowBadge] = useState(true);

  const [localPrompt, setLocalPrompt] = useState(prompt || '');

  const [activeSection, setActiveSection] = useState<'ai' | 'styles' | 'layers' | 'cta' | 'presets'>('styles');
  const [isRendering, setIsRendering] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'full' | 'phone'>('full');
  const [exactTextOnly, setExactTextOnly] = useState(false);

  // States to hold the last extracted/decomposed promo text and CTA text
  const [extractedPromoText, setExtractedPromoText] = useState<string>(decomposedLayerText || getPromoTextFromPrompt(prompt || localPrompt) || '');
  const [extractedCtaText, setExtractedCtaText] = useState<string>(decomposedLayerCta || 'Ajánlatok megtekintése');

  // Sync with prop changes (e.g. after background generation completes)
  useEffect(() => {
    if (decomposedLayerText) {
      setExtractedPromoText(decomposedLayerText);
      setTextLayers(prev => prev.map(l =>
        (l.id === 'productName' || l.id === 'headline' || l.id === '1')
          ? { ...l, text: decomposedLayerText }
          : l
      ));
    }
  }, [decomposedLayerText]);

  useEffect(() => {
    if (decomposedLayerCta) {
      setExtractedCtaText(decomposedLayerCta);
      setCtaText(decomposedLayerCta);
    }
  }, [decomposedLayerCta]);

  const stateRef = useRef({ selectedStyleId, textLayers, ctaText, ctaColor, ctaBgColor, baseImageUrl, showBorder, showCta, showBadge });
  useEffect(() => {
    stateRef.current = { selectedStyleId, textLayers, ctaText, ctaColor, ctaBgColor, baseImageUrl, showBorder, showCta, showBadge };
  });

  useEffect(() => {
    if (prompt) {
      setLocalPrompt(prompt);
      if (!decomposedLayerText) {
        const fallback = getPromoTextFromPrompt(prompt);
        setExtractedPromoText(fallback || prompt);
        setTextLayers(prev => prev.map(l =>
          (l.id === 'productName' || l.id === 'headline' || l.id === '1')
            ? { ...l, text: fallback || prompt }
            : l
        ));
      }
    }
  }, [prompt, decomposedLayerText]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderingRef = useRef(false);

  const handleRender = useCallback(async (overrideStyleId?: string) => {
    const { selectedStyleId: sid0, textLayers: tl, ctaText: ct, ctaColor: cc, ctaBgColor: cbc, baseImageUrl: biu, showBorder: sb, showCta: sc, showBadge: sba } = stateRef.current;
    const sid = overrideStyleId ?? sid0;
    if (!sid || !biu) return;
    if (renderingRef.current) return;

    const primaryText = tl.find(l => l.visible !== false && l.text.trim())?.text || '';
    const payload = {
      baseImageUrl: biu,
      satoriStyleId: sid,
      text: primaryText,
      cta: ct.trim() || undefined,
      showBorder: sb,
      showCta: sc,
      showBadge: sba,
      brandColors: { primary: BRAND_DNA_COLORS.primary, secondary: BRAND_DNA_COLORS.secondary, accent: BRAND_DNA_COLORS.accent },
      textLayers: tl.filter(l => l.text.trim()).map(l => ({
        id: l.id, text: l.text, fontSize: l.fontSize, color: l.color,
        opacity: l.opacity, x: l.x, y: l.y, textAlign: l.textAlign,
        visible: l.visible !== false
      })),
      textOpts: tl[0] ? { color: tl[0].color, opacity: tl[0].opacity, fontSize: tl[0].fontSize, x: tl[0].x, y: tl[0].y } : undefined,
      ctaOpts: ct.trim() ? { color: cc, bgColor: cbc } : undefined,
      width: 1080, height: 1350,
    };

    console.log('[SatoriPanel] render:', sid, '| text:', primaryText.substring(0, 30), '| cta:', ct.substring(0, 20));
    renderingRef.current = true;
    setIsRendering(true);
    try {
      const resp = await fetch(`${API}/api/image/satori-render`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      const url = data.imageUrl?.startsWith('http') ? data.imageUrl : `${API}${data.imageUrl}`;
      setRenderedUrl(url);
      onRendered?.(url);
    } catch (err: any) {
      console.error('[SatoriPanel] err:', err.message);
      showToast({ title: 'Satori hiba', message: err.message, type: 'error' });
    } finally {
      renderingRef.current = false;
      setIsRendering(false);
    }
  }, [onRendered]);

  const prevBaseImageUrlRef = useRef<string | null>(null);

  useEffect(() => {
    console.log('[SatoriPanel Loop Debug] useEffect hook triggered.', {
      baseImageUrl,
      prevBaseImageUrl: prevBaseImageUrlRef.current,
      isDifferent: baseImageUrl !== prevBaseImageUrlRef.current,
      decomposedLayerText,
      initialSuggestedStylesLength: initialSuggestedStyles?.length
    });
    if (baseImageUrl && baseImageUrl !== prevBaseImageUrlRef.current) {
      prevBaseImageUrlRef.current = baseImageUrl;
      const defaultText = decomposedLayerText || getPromoTextFromPrompt(prompt) || prompt || 'READY TO DIVE IN?\nStart your free trial today.';
      const initial = [
        { id: 'brandName', text: subject || 'Piktor Kft.', fontSize: 20, color: '#fbbf24', opacity: 100, x: 0, y: 0, textAlign: 'left' as const, visible: true },
        { id: 'productName', text: defaultText, fontSize: 44, color: '#ffffff', opacity: 100, x: 0, y: 0, textAlign: 'left' as const, visible: true }
      ];
      setTextLayers(initial);
      stateRef.current.textLayers = initial;
      setSuggestedStyles(initialSuggestedStyles || []);
      setTimeout(() => handleRender(), 100);
    }
  }, [baseImageUrl, prompt, subject, handleRender, decomposedLayerText, initialSuggestedStyles]);

  const selectStyle = (id: string) => {
    setSelectedStyleId(id);
    stateRef.current = { ...stateRef.current, selectedStyleId: id };

    // Get the current text typed by the user to preserve it
    const currentText = textLayers.find(l => l.id === 'productName' || l.id === 'headline' || l.id === '1')?.text || textLayers[0]?.text || '';

    const activeBrief = localPrompt.trim() || prompt.trim();
    const promptFallback = getPromoTextFromPrompt(activeBrief);
    const promoTextToUse = extractedPromoText || promptFallback || currentText || 'Szöveg';

    // Always compute and apply default layers (coordinates and sizes) for the new style
    const updatedLayers = getDefaultLayersForStyle(id, promoTextToUse);
    setTextLayers(updatedLayers);
    setActiveLayerIdx(0);

    const presets = STYLE_PRESETS[id];
    let newCta = extractedCtaText || ctaText;
    if (presets && presets[0]) {
      newCta = extractedCtaText || presets[0].cta;
      setCtaText(newCta);
      // If we have an extracted/fallback promo text, ALWAYS use it!
      // Otherwise, if the user's text was empty or default, load the preset text.
      if (promoTextToUse && promoTextToUse !== 'Szöveg') {
        updatedLayers[0].text = promoTextToUse;
      } else if (!currentText || currentText === 'Szöveg') {
        updatedLayers[0].text = presets[0].text;
      }
    }

    stateRef.current = {
      ...stateRef.current,
      selectedStyleId: id,
      textLayers: updatedLayers,
      ctaText: newCta
    };

    setTimeout(() => handleRender(id), 100);
  };

  const applyGlobalPreset = (preset: GlobalPreset) => {
    setSelectedStyleId(preset.styleId);
    const defaultLayers = getDefaultLayersForStyle(preset.styleId, 'Szöveg');
    const defaults = defaultLayers[0];
    const productNameLayer = preset.textLayers.find(l => l.id === 'productName');

    const activeBrief = localPrompt.trim() || prompt.trim();
    const promptFallback = getPromoTextFromPrompt(activeBrief);
    const promoTextToUse = extractedPromoText || promptFallback || '';

    const productNameText = promoTextToUse || productNameLayer?.text || '';
    const productNameLines = productNameText.split('\n').length;

    const newLayers: TextLayer[] = preset.textLayers.map(l => {
      let yOffset = 0;
      let fontSize = l.fontSize || defaults.fontSize;

      let textVal = l.text;
      if ((l.id === 'productName' || l.id === 'headline' || l.id === '1') && promoTextToUse) {
        textVal = promoTextToUse;
      }

      if (l.id === 'brandName') {
        yOffset = -50;
        fontSize = l.fontSize || 22;
      } else if (l.id === 'spec') {
        yOffset = 85 + (productNameLines - 1) * 45;
        fontSize = l.fontSize || 24;
      } else if (l.id === 'productName') {
        yOffset = 0;
        fontSize = l.fontSize || Math.max(36, defaults.fontSize);
      }

      return {
        id: l.id,
        text: textVal,
        fontSize,
        color: l.color || defaults.color,
        opacity: 100,
        x: defaults.x,
        y: defaults.y + yOffset,
        textAlign: defaults.textAlign,
        visible: l.visible !== false
      };
    });

    const finalCta = extractedCtaText || preset.cta;
    setTextLayers(newLayers);
    setActiveLayerIdx(0);
    setCtaText(finalCta);
    setCtaColor(preset.ctaColor);
    setCtaBgColor(preset.ctaBgColor);
    setShowBorder(preset.showBorder);
    setShowBadge(preset.showBadge);
    setShowCta(preset.showCta);

    stateRef.current = {
      selectedStyleId: preset.styleId,
      textLayers: newLayers,
      ctaText: finalCta,
      ctaColor: preset.ctaColor,
      ctaBgColor: preset.ctaBgColor,
      baseImageUrl,
      showBorder: preset.showBorder,
      showBadge: preset.showBadge,
      showCta: preset.showCta
    };

    setTimeout(() => handleRender(preset.styleId), 100);
  };

  const getDefaultLayersForStyle = (styleId: string, text: string): TextLayer[] => {
    let fontSize = 48;
    let color = '#ffffff';
    let x = 0;
    let y = 0;
    let textAlign: 'left' | 'center' | 'right' = 'center';

    switch (styleId) {
      case 'side-panel':
        fontSize = 52;
        x = -50;
        y = 0;
        textAlign = 'left';
        break;
      case 'asymmetric-split':
        fontSize = 54;
        x = 610;
        y = -475;
        textAlign = 'left';
        break;
      case 'feature-list':
        fontSize = 48;
        x = 20;
        y = -395;
        textAlign = 'left';
        break;
      case 'retro-sticker':
        fontSize = 60;
        x = 0;
        y = -100;
        textAlign = 'center';
        break;
      case 'minimal-corner':
        fontSize = 40;
        color = '#1a1a1a';
        x = 650;
        y = 425;
        textAlign = 'left';
        break;
      case 'modern-minimal-border':
        fontSize = 54;
        x = -20;
        y = -575;
        textAlign = 'left';
        break;
      case 'badge-ticker':
        fontSize = 36;
        x = 0;
        y = -601;
        textAlign = 'center';
        break;
      case 'comic-speech':
        fontSize = 48;
        color = '#111111';
        x = 40;
        y = -485;
        textAlign = 'left';
        break;
      case 'bold-kicker':
        fontSize = 88;
        x = 0;
        y = -425;
        textAlign = 'left';
        break;
      case 'social-proof-rating':
        fontSize = 32;
        color = '#333333';
        x = 490;
        y = -500;
        textAlign = 'left';
        break;
      case 'polaroid-frame':
        fontSize = 48;
        color = '#222222';
        x = 0;
        y = 495;
        textAlign = 'center';
        break;
      case 'gradient-bottom':
        fontSize = 60;
        x = 0;
        y = 325;
        textAlign = 'left';
        break;
      case 'gradient-left':
        fontSize = 60;
        x = -20;
        y = -150;
        textAlign = 'left';
        break;
      case 'white-card':
        fontSize = 60;
        color = '#111111';
        x = 0;
        y = 375;
        textAlign = 'center';
        break;
      case 'glass-card':
        fontSize = 60;
        x = 0;
        y = 335;
        textAlign = 'center';
        break;
      case 'circle-badge':
        fontSize = 44;
        x = 290;
        y = -475;
        textAlign = 'center';
        break;
      case 'luxury-frame':
        fontSize = 44;
        x = 0;
        y = -395;
        textAlign = 'center';
        break;
      case 'neo-brutal':
        fontSize = 60;
        color = '#1a1a1a';
        x = -20;
        y = 295;
        textAlign = 'left';
        break;
      case 'ribbon-top':
        fontSize = 52;
        x = 0;
        y = -595;
        textAlign = 'center';
        break;
      case 'minimal-bar':
        fontSize = 44;
        x = 0;
        y = 555;
        textAlign = 'left';
        break;
      case 'diagonal-split':
        fontSize = 54;
        color = '#111111';
        x = 0;
        y = 415;
        textAlign = 'left';
        break;
      case 'tailwind-cta':
        fontSize = 38;
        color = '#111827';
        x = 0;
        y = 0;
        textAlign = 'left';
        break;

      // 9 Tailwind Card Variants
      case 'tailwind-gradient-bottom':
        fontSize = 44;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'tailwind-gradient-left':
        fontSize = 42;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'tailwind-luxury-frame':
        fontSize = 38;
        color = '#c9a96e';
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'tailwind-neo-brutal':
        fontSize = 42;
        color = '#1a1a1a';
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'tailwind-ribbon-top':
        fontSize = 32;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'tailwind-circle-badge':
        fontSize = 34;
        x = 0;
        y = 0;
        textAlign = 'center';
        break;
      case 'tailwind-feature-list':
        fontSize = 38;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'tailwind-side-panel':
        fontSize = 42;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'tailwind-minimal-corner':
        fontSize = 34;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;

      // 10 Custom Styles
      case 'modernist-split':
        fontSize = 42;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'magazine-cover':
        fontSize = 80;
        x = 0;
        y = 0;
        textAlign = 'center';
        break;
      case 'minimalist-editorial':
        fontSize = 42;
        color = '#1f2937';
        x = 0;
        y = 0;
        textAlign = 'center';
        break;
      case 'glow-dark':
        fontSize = 44;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'bold-slant':
        fontSize = 46;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'duotone-overlay':
        fontSize = 54;
        x = 0;
        y = 0;
        textAlign = 'center';
        break;
      case 'neon-sign':
        fontSize = 46;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'glass-list':
        fontSize = 32;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'brushed-metal':
        fontSize = 42;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'cyberpunk-hud':
        fontSize = 36;
        color = '#00ffcc';
        x = 0;
        y = 0;
        textAlign = 'left';
        break;

      // 10 Internet-Inspired Styles
      case 'stripe-card':
        fontSize = 42;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'linear-board':
        fontSize = 38;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'apple-spec':
        fontSize = 64;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'netflix-billboard':
        fontSize = 54;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'airbnb-card':
        fontSize = 32;
        color = '#222222';
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'spotify-lyrics':
        fontSize = 48;
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'notion-board':
        fontSize = 34;
        color = '#37352f';
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'figma-canvas':
        fontSize = 38;
        color = '#1e293b';
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'github-readme':
        fontSize = 34;
        color = '#24292f';
        x = 0;
        y = 0;
        textAlign = 'left';
        break;
      case 'tesla-minimal':
        fontSize = 60;
        color = '#171a20';
        x = 0;
        y = 0;
        textAlign = 'center';
        break;

      default:
        fontSize = 48;
        x = 0;
        y = 0;
        textAlign = 'center';
        break;
    }

    return [
      { id: '1', text, fontSize, color, opacity: 100, x, y, textAlign }
    ];
  };

  const applyPreset = (styleId: string, preset: { text: string; cta: string }) => {
    const activeBrief = localPrompt.trim() || prompt.trim();
    const promptFallback = getPromoTextFromPrompt(activeBrief);
    const textToUse = extractedPromoText || promptFallback || preset.text;
    const ctaToUse = extractedCtaText || preset.cta;
    const updatedLayers = getDefaultLayersForStyle(styleId, textToUse);
    setTextLayers(updatedLayers);
    setCtaText(ctaToUse);
    setActiveLayerIdx(0);

    stateRef.current = {
      ...stateRef.current,
      selectedStyleId: styleId,
      textLayers: updatedLayers,
      ctaText: ctaToUse
    };

    setTimeout(() => handleRender(styleId), 100);
  };

  const debounceRender = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleRender(), 600);
  };

  const updateLayer = (idx: number, patch: Partial<TextLayer>) => {
    setTextLayers(prev => {
      const next = prev.map((l, i) => i === idx ? { ...l, ...patch } : l);
      stateRef.current = { ...stateRef.current, textLayers: next };

      const activeLayer = next[idx];
      if (activeLayer && (activeLayer.id === 'productName' || activeLayer.id === 'headline' || activeLayer.id === '1')) {
        if (patch.text !== undefined) {
          setExtractedPromoText(patch.text);
        }
      }

      return next;
    });
    debounceRender();
  };

  const toggleLayerVisibility = (idx: number) => {
    setTextLayers(prev => {
      const next = prev.map((l, i) => i === idx ? { ...l, visible: l.visible === false ? true : false } : l);
      stateRef.current = { ...stateRef.current, textLayers: next };
      return next;
    });
    debounceRender();
  };

  const updateCta = (field: 'ctaText' | 'ctaColor' | 'ctaBgColor', value: string) => {
    if (field === 'ctaText') {
      setCtaText(value);
      stateRef.current = { ...stateRef.current, ctaText: value };
      setExtractedCtaText(value);
    }
    if (field === 'ctaColor') { setCtaColor(value); stateRef.current = { ...stateRef.current, ctaColor: value }; }
    if (field === 'ctaBgColor') { setCtaBgColor(value); stateRef.current = { ...stateRef.current, ctaBgColor: value }; }
    debounceRender();
  };

  const addLayer = () => {
    const nl: TextLayer = { id: String(Date.now()), text: 'Uj szoveg', fontSize: 40, color: '#ffffff', opacity: 100, x: 0, y: 0, textAlign: 'center', visible: true };
    setTextLayers(prev => {
      const next = [...prev, nl];
      stateRef.current = { ...stateRef.current, textLayers: next };
      setActiveLayerIdx(next.length - 1);
      return next;
    });
    setActiveSection('layers');
  };

  const removeLayer = (idx: number) => {
    if (textLayers.length <= 1) return;
    setTextLayers(prev => {
      const next = prev.filter((_, i) => i !== idx);
      stateRef.current = { ...stateRef.current, textLayers: next };
      setActiveLayerIdx(Math.max(0, idx - 1));
      return next;
    });
    setTimeout(() => handleRender(), 80);
  };

  const handleDownload = () => {
    const url = renderedUrl || baseImageUrl;
    const a = document.createElement('a');
    a.href = url; a.download = `satori-${Date.now()}.png`; a.click();
  };

  const handleAILayout = async (isRefresh = false) => {
    const activePrompt = localPrompt.trim() || prompt.trim();
    if (!activePrompt) {
      showToast({ title: 'Hiányzó leírás', message: 'Kérjük írj be egy leírást a prompt mezőbe a generáláshoz!', type: 'info' });
      return;
    }
    setIsGeneratingAI(true);
    try {
      const resp = await fetch(`${API}/api/image/satori-auto-layout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: activePrompt, subject, exactTextOnly, imageUrl: baseImageUrl, refresh: isRefresh })
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();

      setSelectedStyleId(data.satoriStyleId);
      if (data.suggestedStyles) {
        setSuggestedStyles(data.suggestedStyles);
      } else {
        setSuggestedStyles([]);
      }
      if (data.textLayers && data.textLayers.length > 0) {
        setTextLayers(data.textLayers.map((l: any) => ({ ...l, visible: l.visible !== false })));
      } else if (data.text) {
        setTextLayers([{ id: '1', text: data.text, fontSize: 52, color: '#ffffff', opacity: 100, x: 0, y: 0, textAlign: 'center', visible: true }]);
      }
      if (data.cta) setCtaText(data.cta);
      if (data.ctaOpts?.color) setCtaColor(data.ctaOpts.color);
      if (data.ctaOpts?.bgColor) setCtaBgColor(data.ctaOpts.bgColor);

      const promoText = data.textLayers?.find((l: any) => l.id === 'productName' || l.id === 'headline' || l.id === '1')?.text
        || data.text
        || '';
      const finalCta = data.cta || '';
      if (promoText) setExtractedPromoText(promoText);
      if (finalCta) setExtractedCtaText(finalCta);

      const sb = typeof data.showBorder === 'boolean' ? data.showBorder : true;
      const sc = typeof data.showCta === 'boolean' ? data.showCta : true;
      const sba = typeof data.showBadge === 'boolean' ? data.showBadge : true;

      setShowBorder(sb);
      setShowCta(sc);
      setShowBadge(sba);

      stateRef.current = {
        selectedStyleId: data.satoriStyleId,
        textLayers: data.textLayers ? data.textLayers.map((l: any) => ({ ...l, visible: l.visible !== false })) : [{ id: '1', text: data.text || '', fontSize: 52, color: '#ffffff', opacity: 100, x: 0, y: 0, textAlign: 'center', visible: true }],
        ctaText: data.cta || '',
        ctaColor: data.ctaOpts?.color || '#ffffff',
        ctaBgColor: data.ctaOpts?.bgColor || '#8b5cf6',
        baseImageUrl,
        showBorder: sb,
        showCta: sc,
        showBadge: sba
      };

      showToast({ title: 'AI Elrendezés kész!', message: `Kiválasztott stílus: ${data.satoriStyleId}`, type: 'success' });
      setActiveSection('styles');
      setTimeout(() => handleRender(data.satoriStyleId), 150);
    } catch (err: any) {
      console.error('[SatoriPanel] AI auto layout error:', err.message);
      showToast({ title: 'AI hiba', message: err.message, type: 'error' });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 12, outline: 'none', boxSizing: 'border-box' };
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'block', marginBottom: 5 };
  const al = textLayers[activeLayerIdx];
  const brandNameIdx = textLayers.findIndex(l => l.id === 'brandName');
  const showBrandName = brandNameIdx !== -1 ? textLayers[brandNameIdx].visible !== false : false;
  const firstVisibleText = textLayers.find(l => l.id !== 'brandName' && l.visible !== false && l.text.trim())?.text
    || textLayers.find(l => l.visible !== false && l.text.trim())?.text
    || 'Különleges ajánlatunk!';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Preview Mode Selector */}
      <div style={{ display: 'flex', background: 'rgba(255,255,255,0.02)', padding: 3, borderRadius: 10, border: '1.5px solid var(--border)', width: 'fit-content', alignSelf: 'center' }}>
        <button onClick={() => setPreviewMode('full')}
          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: previewMode === 'full' ? 'rgba(251,191,36,0.15)' : 'transparent', color: previewMode === 'full' ? '#fbbf24' : 'var(--text-muted)', fontSize: 11, fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>
          Teljes Kép
        </button>
        <button onClick={() => setPreviewMode('phone')}
          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: previewMode === 'phone' ? 'rgba(251,191,36,0.15)' : 'transparent', color: previewMode === 'phone' ? '#fbbf24' : 'var(--text-muted)', fontSize: 11, fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>
          Mobil Poszt Nézet
        </button>
      </div>

      {previewMode === 'full' ? (
        /* Preview area */
        <div style={{ borderRadius: 14, overflow: 'hidden', border: '2px solid var(--border)', background: 'var(--bg3)', position: 'relative' }}>
          <img src={renderedUrl || baseImageUrl} alt="preview" style={{ width: '100%', display: 'block' }} />
          {isRendering && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
              <div style={{ textAlign: 'center', color: '#fff' }}>
                <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
                <div style={{ fontSize: 12, fontWeight: 700 }}>Satori render...</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Premium Mobile Phone Frame */
        <div style={{ width: '100%', maxWidth: 360, margin: '0 auto', border: '10px solid #1e293b', borderRadius: 36, overflow: 'hidden', background: '#090d16', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)', position: 'relative', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
          {/* Status Bar */}
          <div style={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', background: '#000', color: '#fff', fontSize: 11, fontWeight: 600 }}>
            <span>9:41</span>
            {/* Notch */}
            <div style={{ width: 110, height: 18, background: '#000', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9 }}>📶</span>
              <span style={{ fontSize: 9 }}>🔋</span>
            </div>
          </div>

          {/* Social Media Header */}
          {showBrandName && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Mock Brand Avatar */}
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #fbbf24, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 900 }}>
                  {subject ? subject.substring(0, 1).toUpperCase() : 'P'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>{subject || 'Piktor Kft.'}</span>
                  <span style={{ fontSize: 9, color: '#94a3b8' }}>Szponzorált • Közösségi Média Poszt</span>
                </div>
              </div>
              <span style={{ color: '#94a3b8', fontSize: 16, cursor: 'pointer' }}>•••</span>
            </div>
          )}

          {/* Rendered Post Image */}
          <div style={{ position: 'relative', width: '100%', background: '#000' }}>
            <img src={renderedUrl || baseImageUrl} alt="Instagram Post Mock" style={{ width: '100%', display: 'block' }} />
            {isRendering && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
                <div style={{ textAlign: 'center', color: '#fff' }}>
                  <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fbbf24', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
                </div>
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 12px 6px', color: '#f8fafc', fontSize: 18 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              <span style={{ cursor: 'pointer' }}>❤️</span>
              <span style={{ cursor: 'pointer' }}>💬</span>
              <span style={{ cursor: 'pointer' }}>✈️</span>
            </div>
            <span style={{ cursor: 'pointer' }}>📥</span>
          </div>

          {/* Social Caption */}
          <div style={{ padding: '0 12px 16px', fontSize: 11, color: '#cbd5e1', lineHeight: 1.4 }}>
            <div style={{ marginBottom: 4 }}>
              {showBrandName && <span style={{ fontWeight: 800, color: '#f8fafc', marginRight: 5 }}>{subject || 'Piktor Kft.'}</span>}
              {firstVisibleText.split('\n')[0]}
            </div>
            <div style={{ color: '#fbbf24', fontWeight: 600 }}>
              {showBrandName ? '#piktorkft #akcio #marketing' : '#akcio #marketing'}
            </div>
          </div>
        </div>
      )}

      {/* Download + Refresh */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleDownload} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 9, border: 'none', background: '#10b981', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <DlIcon size={13} /> {renderedUrl ? 'Satori Letoltes' : 'Kep Letoltes'}
        </button>
        {selectedStyleId && (
          <button onClick={() => handleRender()} disabled={isRendering} style={{ padding: '9px 14px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <RefreshIcon size={13} />
          </button>
        )}
      </div>

      {/* Overhauled Figma/Graphics Workspace */}
      <div style={{ display: 'flex', gap: 12, minHeight: 380, background: 'rgba(255,255,255,0.01)', borderRadius: 14, border: '1.5px solid var(--border)', padding: '12px 8px 12px 12px' }}>

        {/* Left Toolbar Dock */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 44, flexShrink: 0, borderRight: '1.5px solid var(--border)', paddingRight: 8, alignItems: 'center' }}>
          <button onClick={() => setActiveSection('ai')} title="AI Assistant"
            style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: activeSection === 'ai' ? 'rgba(139,92,246,0.2)' : 'transparent', color: activeSection === 'ai' ? '#a78bfa' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RobotIcon size={16} />
          </button>
          <button onClick={() => setActiveSection('presets')} title="Campaign Presets"
            style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: activeSection === 'presets' ? 'rgba(236,72,153,0.2)' : 'transparent', color: activeSection === 'presets' ? '#f472b6' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 900 }}>⭐</span>
          </button>
          <button onClick={() => setActiveSection('styles')} title="Styles & Templates"
            style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: activeSection === 'styles' ? 'rgba(34,197,94,0.2)' : 'transparent', color: activeSection === 'styles' ? '#4ade80' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PalIcon size={16} />
          </button>
          <button onClick={() => setActiveSection('layers')} title="Layers & Text"
            style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: activeSection === 'layers' ? 'rgba(245,158,11,0.2)' : 'transparent', color: activeSection === 'layers' ? '#fbbf24' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LayersIcon size={16} />
          </button>
          <button onClick={() => setActiveSection('cta')} title="CTA Button"
            style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: activeSection === 'cta' ? 'rgba(6,182,212,0.2)' : 'transparent', color: activeSection === 'cta' ? '#22d3ee' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>B</span>
          </button>
        </div>

        {/* Right Settings Inspector Pane */}
        <div style={{ flex: 1, minWidth: 0, paddingLeft: 4, overflowY: 'auto', maxHeight: 420 }}>

          {/* PRESETS SECTION */}
          {activeSection === 'presets' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#ec4899', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Kampany Sablon Presetek</div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                Valassz az elore elkeszitett, professzionalis elrendezesek es mintaszovegek kozul egy kattintassal.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 330, overflowY: 'auto', paddingRight: 4 }}>
                {GLOBAL_PRESETS.map((preset, idx) => {
                  const isCurrentStyle = selectedStyleId === preset.styleId;
                  return (
                    <button key={idx} onClick={() => applyGlobalPreset(preset)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${isCurrentStyle ? 'rgba(236,72,153,0.5)' : 'var(--border)'}`, background: isCurrentStyle ? 'rgba(236,72,153,0.06)' : 'var(--bg2)', color: 'var(--text)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: isCurrentStyle ? '#f472b6' : 'var(--text)' }}>{preset.name}</span>
                        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'var(--border)', color: 'var(--text-muted)', fontWeight: 700 }}>
                          {preset.styleId.replace('tailwind-', 'TW ').toUpperCase()}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>{preset.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI SECTION */}
          {activeSection === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Auto Elrendezes</div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                Az AI elemzi a terméket és a promptot, majd teljesen automatikusan kiválasztja a megfelelő elrendezést, színeket, CTA-t, és megírja a reklámszöveget.
              </p>

              <div>
                <label style={lbl}>Prompt / Kép leírása</label>
                <textarea
                  value={localPrompt}
                  onChange={e => setLocalPrompt(e.target.value)}
                  placeholder="Írd ide a kép leírását vagy a hirdetés témáját (pl. 'fehér beltéri falfesték fa vödörrel, napfényes skandináv szoba background')..."
                  rows={3}
                  style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 6px 0' }}>
                <input
                  type="checkbox"
                  id="exactTextOnly"
                  checked={exactTextOnly}
                  onChange={e => setExactTextOnly(e.target.checked)}
                  style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#8b5cf6' }}
                />
                <label htmlFor="exactTextOnly" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', cursor: 'pointer', userSelect: 'none' }}>
                  Csak a megadott szöveg használata (szigorú mód)
                </label>
              </div>

              <button onClick={() => handleAILayout(false)} disabled={isGeneratingAI || isRendering}
                style={{ width: '100%', padding: '12px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {isGeneratingAI ? (
                  <>
                    <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    AI tervezes...
                  </>
                ) : (
                  <>
                    <RobotIcon size={14} /> AI Automatikus Elrendezes
                  </>
                )}
              </button>

              {suggestedStyles && suggestedStyles.length > 0 && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      ✨ AI Által Javasolt Elrendezések:
                    </div>
                    <button
                      onClick={() => handleAILayout(true)}
                      disabled={isGeneratingAI || isRendering}
                      title="Újragondolás / Frissítés"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: isGeneratingAI ? 'var(--text-muted)' : '#c084fc',
                        cursor: 'pointer',
                        fontSize: 10,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 6px',
                        borderRadius: 4,
                        backgroundColor: 'rgba(192,132,252,0.1)'
                      }}
                    >
                      <RefreshIcon size={10} /> Újragondolás
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto', paddingRight: 2 }}>
                    {suggestedStyles.map((item, idx) => {
                      let matchedStyle = SATORI_STYLES.find(s => s.id === item.styleId);
                      if (!matchedStyle) {
                        matchedStyle = {
                          id: item.styleId,
                          name: item.styleId.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                          thumbGrad: 'linear-gradient(135deg, #187fc0 0%, #c32226 100%)',
                          category: 'Satori'
                        };
                      }
                      const isSel = selectedStyleId === item.styleId;
                      return (
                        <button
                          key={idx}
                          onClick={() => selectStyle(item.styleId)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: `1.5px solid ${isSel ? '#a78bfa' : 'transparent'}`,
                            background: isSel ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.02)',
                            color: 'var(--text)',
                            textAlign: 'left',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 14, height: 14, borderRadius: 3, background: matchedStyle.thumbGrad }} />
                              <span style={{ fontSize: 11, fontWeight: 800, color: isSel ? '#c084fc' : 'var(--text)' }}>
                                {matchedStyle.name}
                              </span>
                            </div>
                            <span style={{ fontSize: 8, padding: '2px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', fontWeight: 700 }}>
                              {matchedStyle.category.replace('tailwind-', 'TW ').toUpperCase()}
                            </span>
                          </div>
                          {item.reason && (
                            <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                              {item.reason}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STYLES SECTION */}
          {activeSection === 'styles' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Satori Stilusok</div>

              {/* Category tabs */}
              <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4, borderBottom: '1.5px solid var(--border)' }}>
                {(['all', 'tailwind-basic', 'tailwind-custom', 'tailwind-internet', 'legacy'] as const).map(tab => {
                  const getTabLabel = (t: string) => {
                    if (t === 'all') return 'Összes';
                    if (t === 'tailwind-basic') return 'TW Alap';
                    if (t === 'tailwind-custom') return 'TW Egyedi';
                    if (t === 'tailwind-internet') return 'TW Web';
                    return 'Eredeti';
                  };
                  const isSel = styleTab === tab;
                  return (
                    <button key={tab} onClick={() => setStyleTab(tab)}
                      style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: isSel ? 'rgba(74,222,128,0.15)' : 'transparent', color: isSel ? '#4ade80' : 'var(--text-muted)', fontSize: 10, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                      {getTabLabel(tab)}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxHeight: 220, overflowY: 'auto', paddingRight: 2 }}>
                {SATORI_STYLES.filter(s => styleTab === 'all' || s.category === styleTab).map(s => {
                  const isSel = selectedStyleId === s.id;
                  return (
                    <button key={s.id} onClick={() => selectStyle(s.id)}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 3px', borderRadius: 8, cursor: 'pointer', border: `2.2px solid ${isSel ? '#4ade80' : 'transparent'}`, background: isSel ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.02)', color: isSel ? '#4ade80' : 'var(--text-muted)', transition: 'all 0.1s' }}>
                      <div style={{ width: 22, height: 22, borderRadius: 5, background: s.thumbGrad, boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }} />
                      <span style={{ fontSize: 7, fontWeight: 700, textAlign: 'center', lineHeight: 1.1 }}>{s.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Style Presets */}
              {selectedStyleId && STYLE_PRESETS[selectedStyleId] && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div style={lbl}>Gyors Preset Sablonok</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {STYLE_PRESETS[selectedStyleId].map((preset, idx) => (
                      <button key={idx} onClick={() => applyPreset(selectedStyleId, preset)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.05)', color: '#4ade80', fontSize: 10, fontWeight: 700, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>⚡ {preset.name}</span>
                        <span style={{ fontSize: 9, opacity: 0.7 }}>Betöltés &rarr;</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Global Elements Visibility Toggles */}
              <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={lbl}>Látható Elemek</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showBrandName} onChange={() => { if (brandNameIdx !== -1) toggleLayerVisibility(brandNameIdx); }} style={{ cursor: 'pointer' }} />
                    Márkamegnevezés
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showBorder} onChange={e => { setShowBorder(e.target.checked); stateRef.current.showBorder = e.target.checked; handleRender(); }} style={{ cursor: 'pointer' }} />
                    Keret
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showBadge} onChange={e => { setShowBadge(e.target.checked); stateRef.current.showBadge = e.target.checked; handleRender(); }} style={{ cursor: 'pointer' }} />
                    Matrica/Háttér
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showCta} onChange={e => { setShowCta(e.target.checked); stateRef.current.showCta = e.target.checked; handleRender(); }} style={{ cursor: 'pointer' }} />
                    CTA Gomb
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* LAYERS & TEXT SECTION */}
          {activeSection === 'layers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Szoveg Retegek</span>
                <button onClick={addLayer} style={{ padding: '4px 8px', borderRadius: 6, border: '1px dashed rgba(251,191,36,0.5)', fontSize: 9, fontWeight: 800, cursor: 'pointer', background: 'rgba(251,191,36,0.1)', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <PlusIcon size={9} /> Uj Reteg
                </button>
                {textLayers.map((layer, idx) => {
                  const isSel = activeLayerIdx === idx;
                  const getSemanticLabel = (id: string, index: number) => {
                    if (id === 'brandName') return 'Márkanév';
                    if (id === 'productName') return 'Terméknév';
                    if (id === 'spec') return 'Jellemző/Mérték';
                    if (id === 'price') return 'Ár';
                    if (id === 'headline') return 'Főcím';
                    return `Szöveg #${index + 1}`;
                  };
                  return (
                    <div key={layer.id} onClick={() => {
                      setActiveLayerIdx(idx);
                      if (!localPrompt.trim() && layer.text.trim()) {
                        setLocalPrompt(layer.text);
                      }
                    }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${isSel ? '#fbbf24' : 'var(--border)'}`, background: isSel ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.02)', opacity: layer.visible !== false ? 1 : 0.5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)' }}>{getSemanticLabel(layer.id, idx)}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isSel ? '#fbbf24' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {layer.text.trim() ? `"${layer.text.substring(0, 18)}"` : 'Üres szövegréteg'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={e => { e.stopPropagation(); toggleLayerVisibility(idx); }}
                          style={{ padding: 4, borderRadius: 4, border: 'none', background: 'transparent', color: layer.visible !== false ? '#4ade80' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                          title={layer.visible !== false ? 'Elrejtés' : 'Megjelenítés'}>
                          {layer.visible !== false ? <EyeIcon size={12} /> : <EyeOffIcon size={12} />}
                        </button>
                        {idx > 0 && (
                          <button onClick={e => { e.stopPropagation(); removeLayer(idx); }}
                            style={{ padding: 4, borderRadius: 4, border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            <TrashIcon size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Layer Properties */}
              {al && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label style={lbl}>Szoveg tartalma</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={al.visible !== false} onChange={e => updateLayer(activeLayerIdx, { visible: e.target.checked })} style={{ cursor: 'pointer' }} />
                        Megjelenítve
                      </label>
                    </div>
                    <textarea value={al.text} onChange={e => updateLayer(activeLayerIdx, { text: e.target.value })} rows={2} placeholder="pl. KIVALO MINOSEG" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={lbl}>Betumeret ({al.fontSize}px)</label>
                      <input type="range" min={16} max={120} value={al.fontSize} onChange={e => updateLayer(activeLayerIdx, { fontSize: Number(e.target.value) })} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={lbl}>Atlatszo ({al.opacity}%)</label>
                      <input type="range" min={0} max={100} value={al.opacity} onChange={e => updateLayer(activeLayerIdx, { opacity: Number(e.target.value) })} style={{ width: '100%' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={lbl}>Y pozicio ({al.y}px)</label>
                      <input type="range" min={-450} max={450} value={al.y} onChange={e => updateLayer(activeLayerIdx, { y: Number(e.target.value) })} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={lbl}>X pozicio ({al.x}px)</label>
                      <input type="range" min={-450} max={450} value={al.x} onChange={e => updateLayer(activeLayerIdx, { x: Number(e.target.value) })} style={{ width: '100%' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8 }}>
                    <div>
                      <label style={lbl}>Szin</label>
                      <input type="color" value={al.color} onChange={e => updateLayer(activeLayerIdx, { color: e.target.value })} style={{ width: '100%', height: 32, borderRadius: 6, border: '1.5px solid var(--border)', cursor: 'pointer', padding: 2 }} />
                    </div>
                    <div>
                      <label style={lbl}>Igazitas</label>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {(['left', 'center', 'right'] as const).map(a => (
                          <button key={a} onClick={() => updateLayer(activeLayerIdx, { textAlign: a })}
                            style={{ flex: 1, padding: '6px 3px', borderRadius: 5, border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer', background: al.textAlign === a ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.03)', color: al.textAlign === a ? '#fbbf24' : 'var(--text-muted)' }}>
                            {a === 'left' ? '«' : a === 'center' ? '|' : '»'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button onClick={() => handleRender()} disabled={isRendering || !selectedStyleId}
                    style={{ padding: '9px', borderRadius: 7, border: 'none', background: selectedStyleId ? 'linear-gradient(135deg,#fbbf24,#d97706)' : 'var(--bg3)', color: selectedStyleId ? '#000' : 'var(--text-muted)', fontSize: 12, fontWeight: 800, cursor: selectedStyleId ? 'pointer' : 'not-allowed', marginTop: 4 }}>
                    {isRendering ? 'Rendereles...' : selectedStyleId ? 'Alkalmazas' : 'Elobb valassz stilust'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CTA SECTION */}
          {activeSection === 'cta' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#22d3ee', textTransform: 'uppercase', letterSpacing: '0.06em' }}>CTA Gomb Beallitasok</div>

              <div>
                <label style={lbl}>CTA Gomb szovege</label>
                <input type="text" value={ctaText} onChange={e => updateCta('ctaText', e.target.value)} placeholder="pl. VASAROLJ MOST" style={inp} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={lbl}>Szoveg szine</label>
                  <input type="color" value={ctaColor} onChange={e => updateCta('ctaColor', e.target.value)} style={{ width: '100%', height: 32, borderRadius: 6, border: '1.5px solid var(--border)', cursor: 'pointer', padding: 2 }} />
                </div>
                <div>
                  <label style={lbl}>Hatter szine</label>
                  <input type="color" value={ctaBgColor} onChange={e => updateCta('ctaBgColor', e.target.value)} style={{ width: '100%', height: 32, borderRadius: 6, border: '1.5px solid var(--border)', cursor: 'pointer', padding: 2 }} />
                </div>
              </div>

              <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)', fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Szerkesztés után a gomb 600ms-sal automatikusan frissül az előnézeten.
              </div>

              <button onClick={() => handleRender()} disabled={isRendering || !selectedStyleId}
                style={{ padding: '9px', borderRadius: 7, border: 'none', background: selectedStyleId ? 'linear-gradient(135deg,#06b6d4,#0891b2)' : 'var(--bg3)', color: selectedStyleId ? '#fff' : 'var(--text-muted)', fontSize: 12, fontWeight: 800, cursor: selectedStyleId ? 'pointer' : 'not-allowed' }}>
                {isRendering ? 'Rendereles...' : 'CTA Frissitese'}
              </button>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}