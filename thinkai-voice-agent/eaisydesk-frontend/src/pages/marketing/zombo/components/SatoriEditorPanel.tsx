/**
 * SatoriEditorPanel -- beepitett Satori layer szerkeszto
 * Overhauled Figma-like sidebar design, presets support, layer list manager and AI auto-layout.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { showToast } from '../../../../components/ui/Toast';

const API = (import.meta as any).env?.VITE_KEPGENERALAS_API_URL || 'http://localhost:3001';

const LayersIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 17 22 12"/>
  </svg>
);
const DlIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const PlusIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const RefreshIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);
const TrashIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);
const RobotIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 15h.01M16 15h.01"/>
  </svg>
);
const PalIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.01452 19.156 5.0925 19.234 5.15669 19.3278C5.29384 19.5281 5.30881 19.7891 5.19522 20.0039C5.14207 20.1044 5.06649 20.1873 4.91533 20.3533L4.82843 20.4485C4.29813 21.0318 4.03298 21.3235 4.0768 21.572C4.12061 21.8206 4.45785 21.9366 5.13233 22C5.38531 22 5.56549 22 5.72147 22H12Z"/>
    <circle cx="7.5" cy="10.5" r="1.5"/><circle cx="11.5" cy="7.5" r="1.5"/><circle cx="16.5" cy="9.5" r="1.5"/><circle cx="15.5" cy="14.5" r="1.5"/>
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
  { id: 'tailwind-cta',     name: 'Tailwind Kártya', thumbGrad: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' },
  { id: 'gradient-bottom', name: 'Gradient Alul',  thumbGrad: 'linear-gradient(to top, #000 0%, rgba(0,0,0,0) 55%)' },
  { id: 'gradient-left',   name: 'Gradient Bal',   thumbGrad: 'linear-gradient(to right, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0) 55%)' },
  { id: 'circle-badge',    name: 'Kör Badge',       thumbGrad: 'radial-gradient(circle at center, rgba(139,92,246,0.85) 0%, rgba(0,0,0,0.5) 60%)' },
  { id: 'promo-accent',    name: 'Promo Accent',    thumbGrad: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0) 48%)' },
  { id: 'full-dark',       name: 'Full Dark',        thumbGrad: 'rgba(0,0,0,0.7)' },
  { id: 'white-card',      name: 'Fehér Kártya',    thumbGrad: 'linear-gradient(to top, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.97) 35%, rgba(255,255,255,0) 65%)' },
  { id: 'luxury-frame',    name: 'Luxury Keret',     thumbGrad: 'rgba(5,3,12,0.87)' },
  { id: 'neo-brutal',      name: 'Neo Brutal',        thumbGrad: 'rgba(0,0,0,0.56)' },
  { id: 'ribbon-top',      name: 'Ribbon Felül',      thumbGrad: 'linear-gradient(to bottom, rgba(139,92,246,0.9) 0%, rgba(139,92,246,0.9) 22%, rgba(0,0,0,0.5) 22%)' },
  { id: 'minimal-bar',     name: 'Minimál Sáv',       thumbGrad: 'rgba(0,0,0,0.14)' },
  { id: 'glass-card',      name: 'Glass Card',        thumbGrad: 'linear-gradient(to top, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.22) 38%, rgba(255,255,255,0) 60%)' },
  { id: 'diagonal-split',  name: 'Átlós Split',       thumbGrad: 'linear-gradient(135deg, #fff 48%, rgba(0,0,0,0.88) 48%)' },
  { id: 'feature-list',    name: 'Felsorolás',     thumbGrad: 'linear-gradient(to bottom, #1e1b4b 0%, #1e1b4b 100%)' },
  { id: 'retro-sticker',   name: 'Retro Matrica',  thumbGrad: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
  { id: 'side-panel',      name: 'Oldalsáv',       thumbGrad: 'linear-gradient(to right, #1e3a8a 0%, #1e3a8a 38%, rgba(0,0,0,0) 38%)' },
  { id: 'minimal-corner',  name: 'Sarok Kártya',   thumbGrad: 'radial-gradient(circle at bottom right, #ffffff 0%, rgba(255,255,255,0) 70%)' },
  { id: 'modern-minimal-border', name: 'Minimál Keret', thumbGrad: 'linear-gradient(135deg, #1e1b4b 0%, #1e1b4b 100%)' },
  { id: 'asymmetric-split', name: 'Aszimmetrikus', thumbGrad: 'linear-gradient(to left, #1e3a8a 0%, #1e3a8a 38%, rgba(0,0,0,0) 38%)' },
  { id: 'badge-ticker',     name: 'Marquee Szalag', thumbGrad: 'linear-gradient(to bottom, #f59e0b 0%, #f59e0b 20%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 80%, #f59e0b 80%)' },
  { id: 'comic-speech',     name: 'Képregény Buborék', thumbGrad: 'radial-gradient(circle at center, #ffffff 0%, #ffffff 50%, rgba(0,0,0,0) 55%)' },
  { id: 'bold-kicker',      name: 'Kicker Cím',     thumbGrad: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
  { id: 'social-proof-rating', name: 'Értékelés',     thumbGrad: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' },
  { id: 'polaroid-frame',   name: 'Polaroid Keret', thumbGrad: 'linear-gradient(to bottom, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.2) 80%, #ffffff 80%)' }
];

const STYLE_PRESETS: Record<string, { name: string; text: string; cta: string }[]> = {
  'feature-list': [
    { name: 'Kiemelt Előnyök', text: '• Prémium minőség\n• 100% tartós fedés\n• Környezetbarát', cta: 'Megnézem' },
    { name: 'Adatok', text: '• Kiadósság: 10m²/l\n• Száradás: 2 óra\n• Beltéri glettvakolat', cta: 'Részletek' }
  ],
  'retro-sticker': [
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
    { name: 'Vásárlói Vélemény', text: '„Csodás színek, gyors száradás. Csak ajánlani tudom!”', cta: 'Vélemények' }
  ],
  'polaroid-frame': [
    { name: 'Polaroid Fotó', text: 'Győri üzletünk kínálata', cta: 'Térkép' }
  ],
  'tailwind-cta': [
    { name: 'Tailwind Kártya', text: 'READY TO DIVE IN?\nStart your free trial today.', cta: 'Get started' }
  ]
};

interface TextLayer {
  id: string; text: string; fontSize: number; color: string;
  opacity: number; x: number; y: number; textAlign: 'left' | 'center' | 'right';
  visible?: boolean;
}
interface Props {
  baseImageUrl: string;
  onRendered?: (url: string) => void;
  prompt?: string;
  subject?: string;
}

export function SatoriEditorPanel({ baseImageUrl, onRendered, prompt = '', subject = '' }: Props) {
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>('tailwind-cta');
  const [textLayers, setTextLayers] = useState<TextLayer[]>([
    { id: '1', text: 'READY TO DIVE IN?\nStart your free trial today.', fontSize: 42, color: '#111827', opacity: 100, x: 0, y: 150, textAlign: 'left', visible: true }
  ]);
  const [activeLayerIdx, setActiveLayerIdx] = useState(0);
  const [ctaText,   setCtaText]   = useState('Get started');
  const [ctaColor,  setCtaColor]  = useState('#ffffff');
  const [ctaBgColor,setCtaBgColor]= useState('#4f46e5');
  
  const [showBorder, setShowBorder] = useState(true);
  const [showCta, setShowCta] = useState(true);
  const [showBadge, setShowBadge] = useState(true);

  const [localPrompt, setLocalPrompt] = useState(prompt || '');

  const [activeSection, setActiveSection] = useState<'ai' | 'styles' | 'layers' | 'cta'>('styles');
  const [isRendering, setIsRendering] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);

  const stateRef = useRef({ selectedStyleId, textLayers, ctaText, ctaColor, ctaBgColor, baseImageUrl, showBorder, showCta, showBadge });
  useEffect(() => {
    stateRef.current = { selectedStyleId, textLayers, ctaText, ctaColor, ctaBgColor, baseImageUrl, showBorder, showCta, showBadge };
  });

  useEffect(() => {
    if (prompt) {
      setLocalPrompt(prompt);
    }
  }, [prompt]);

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderingRef = useRef(false);

  const handleRender = useCallback(async (overrideStyleId?: string) => {
    const { selectedStyleId: sid0, textLayers: tl, ctaText: ct, ctaColor: cc, ctaBgColor: cbc, baseImageUrl: biu, showBorder: sb, showCta: sc, showBadge: sba } = stateRef.current;
    const sid = overrideStyleId ?? sid0;
    if (!sid || !biu) return;
    if (renderingRef.current) return;

    const primaryText = tl.find(l => l.text.trim())?.text || '';
    const payload = {
      baseImageUrl: biu,
      satoriStyleId: sid,
      text: primaryText,
      cta: ct.trim() || undefined,
      showBorder: sb,
      showCta: sc,
      showBadge: sba,
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

  useEffect(() => {
    if (baseImageUrl) {
      handleRender();
    }
  }, [baseImageUrl, handleRender]);

  const selectStyle = (id: string) => {
    setSelectedStyleId(id);
    stateRef.current = { ...stateRef.current, selectedStyleId: id };
    
    // Get the current text typed by the user to preserve it
    const currentText = textLayers[0]?.text || '';
    
    // Always compute and apply default layers (coordinates and sizes) for the new style
    const updatedLayers = getDefaultLayersForStyle(id, currentText || 'Szöveg');
    setTextLayers(updatedLayers);
    setActiveLayerIdx(0);

    const presets = STYLE_PRESETS[id];
    let newCta = ctaText;
    if (presets && presets[0]) {
      newCta = presets[0].cta;
      setCtaText(newCta);
      // If the user's text was empty or default, load the preset text
      if (!currentText || currentText === 'Szöveg') {
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
        fontSize = 42;
        color = '#111827';
        x = 0;
        y = 150;
        textAlign = 'left';
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
    const updatedLayers = getDefaultLayersForStyle(styleId, preset.text);
    setTextLayers(updatedLayers);
    setCtaText(preset.cta);
    setActiveLayerIdx(0);

    stateRef.current = {
      ...stateRef.current,
      selectedStyleId: styleId,
      textLayers: updatedLayers,
      ctaText: preset.cta
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
    if (field === 'ctaText')   { setCtaText(value);    stateRef.current = { ...stateRef.current, ctaText: value }; }
    if (field === 'ctaColor')  { setCtaColor(value);   stateRef.current = { ...stateRef.current, ctaColor: value }; }
    if (field === 'ctaBgColor'){ setCtaBgColor(value); stateRef.current = { ...stateRef.current, ctaBgColor: value }; }
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

  const handleAILayout = async () => {
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
        body: JSON.stringify({ prompt: activePrompt, subject })
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();

      setSelectedStyleId(data.satoriStyleId);
      if (data.textLayers && data.textLayers.length > 0) {
        setTextLayers(data.textLayers.map((l: any) => ({ ...l, visible: l.visible !== false })));
      } else if (data.text) {
        setTextLayers([{ id: '1', text: data.text, fontSize: 52, color: '#ffffff', opacity: 100, x: 0, y: 0, textAlign: 'center', visible: true }]);
      }
      if (data.cta) setCtaText(data.cta);
      if (data.ctaOpts?.color) setCtaColor(data.ctaOpts.color);
      if (data.ctaOpts?.bgColor) setCtaBgColor(data.ctaOpts.bgColor);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Preview area */}
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

              <button onClick={handleAILayout} disabled={isGeneratingAI || isRendering}
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
            </div>
          )}

          {/* STYLES SECTION */}
          {activeSection === 'styles' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Satori Stilusok</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {SATORI_STYLES.map(s => {
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
                        {(['left','center','right'] as const).map(a => (
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