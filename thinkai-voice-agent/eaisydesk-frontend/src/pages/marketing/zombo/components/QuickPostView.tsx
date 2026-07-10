import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { BrandKit, PostCreative } from '../types';
import { fixImageUrl, getBackendUrl } from '../types';
import { buildLayerTemplates, type LayerTemplate } from '../layerTemplates';
import { normalizeLayers } from '../layerNormalizer';
import { getBestTemplate, truncateToFit } from '../templateSelector';
import { fitContentToTemplate } from '../contentFitter';
import { Layers, Loader, Cpu, Settings, ChevronDown } from 'lucide-react';
import { showToast } from '../../../../components/ui/Toast';
import ImageSlotUploader, { type ImageSlot, buildCompositePayload, PanZoomImage } from './ImageSlotUploader';
import { OverlayEngineTestbed } from './OverlayEngineTestbed';

// ─── Icons (inline SVG) ───────────────────────────────────────────────────────
const Zap = ({ size = 18 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
const RefreshCw = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>;
const Download = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
const Copy = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
const Check = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
const Bookmark = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>;

// ─── Satori Style Definitions ────────────────────────────────────────────────
const SATORI_STYLES = [
  { id: 'gradient-bottom', name: 'Gradient Alul',  emoji: '\uD83D\uDD25', desc: 'S\u00f6t\u00e9t gradient + accent s\u00e1v alul',        thumbGrad: 'linear-gradient(to top, #000 0%, rgba(0,0,0,0) 55%)' },
  { id: 'gradient-left',   name: 'Gradient Bal',   emoji: '\u25C0\uFE0F', desc: 'Bal oldali \u00e1tmenet, sz\u00f6veg balra',              thumbGrad: 'linear-gradient(to right, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0) 55%)' },
  { id: 'circle-badge',   name: 'K\u00f6r Badge',   emoji: '\u2B55',      desc: 'Brand k\u00f6r badge k\u00f6z\u00e9pen',                  thumbGrad: 'radial-gradient(circle at center, rgba(139,92,246,0.85) 0%, rgba(0,0,0,0.5) 60%)' },
  { id: 'promo-accent',   name: 'Promo Accent',   emoji: '\uD83C\uDFF7\uFE0F', desc: 'Accent badge + gradient alul',              thumbGrad: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0) 48%)' },
  { id: 'full-dark',      name: 'Full Dark',      emoji: '\uD83C\uDF11',  desc: 'Teljes s\u00f6t\u00e9t overlay',                     thumbGrad: 'rgba(0,0,0,0.7)' },
  { id: 'white-card',     name: 'Feh\u00e9r K\u00e1rtya', emoji: '\uD83C\uDCCF', desc: 'Feh\u00e9r k\u00e1rtya alul',               thumbGrad: 'linear-gradient(to top, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.97) 35%, rgba(255,255,255,0) 65%)' },
  { id: 'luxury-frame',   name: 'Luxury Keret',   emoji: '\u2728',        desc: 'S\u00f6t\u00e9t overlay + finom keret',              thumbGrad: 'rgba(5,3,12,0.87)' },
  { id: 'neo-brutal',     name: 'Neo Brutal',     emoji: '\u2B1B',        desc: 'Vastag keret + kontrasztos blokk',            thumbGrad: 'rgba(0,0,0,0.56)' },
  { id: 'ribbon-top',     name: 'Ribbon Fel\u00fcl', emoji: '\uD83C\uDF80', desc: 'Accent szalag tetej\u00e9n',               thumbGrad: 'linear-gradient(to bottom, rgba(139,92,246,0.9) 0%, rgba(139,92,246,0.9) 22%, rgba(0,0,0,0.5) 22%)' },
  { id: 'minimal-bar',    name: 'Minimal S\u00e1v',  emoji: '\u2796',     desc: 'V\u00e9kony accent s\u00e1v alul',               thumbGrad: 'rgba(0,0,0,0.14)' },
  { id: 'glass-card',     name: 'Glass Card',     emoji: '\uD83E\uDE9F',  desc: 'Glassmorphism k\u00e1rtya',                   thumbGrad: 'linear-gradient(to top, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.22) 38%, rgba(255,255,255,0) 60%)' },
  { id: 'diagonal-split', name: '\u00c1tl\u00f3s Split', emoji: '\u25E2', desc: '\u00c1tl\u00f3s feh\u00e9r/s\u00f6t\u00e9t oszt\u00e1s', thumbGrad: 'linear-gradient(135deg, #fff 48%, rgba(0,0,0,0.88) 48%)' },
];

const ENVIRONMENT_PRESETS = [
  { id: 'workshop', label: 'Műhely', prompt: 'professional industrial workshop, workbench, clean background', icon: '🛠️' },
  { id: 'studio', label: 'Stúdió', prompt: 'minimal professional studio setup, softbox lighting, clean surface', icon: '📸' },
  { id: 'living-room', label: 'Nappali', prompt: 'modern cozy living room, warm lighting, elegant furniture', icon: '🏠' },
  { id: 'kitchen', label: 'Konyha', prompt: 'modern clean kitchen, bright daylight, marble surface', icon: '🍳' },
  { id: 'outdoor', label: 'Kültér', prompt: 'sunny garden, wooden terrace, natural greenery background', icon: '🌿' },
  { id: 'luxury', label: 'Luxus', prompt: 'premium luxury interior, gold accents, dark marble, soft glowing lights', icon: '✨' },
  { id: 'minimal', label: 'Minimal', prompt: 'abstract minimal background, neutral colors, clean geometric shadows', icon: '⬜' },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface QuickPostResult {
  imageUrl: string;
  caption: string;
  hashtags: string;
  platform: string;
  style: string;
  variations: string[];
  rawImages: string[];
  generationModel?: string;
  generationTime?: number;
}

interface QuickPostViewProps {
  activeBrandKit: BrandKit;
  auditResult: any;
  onSavePost?: (post: PostCreative) => void;
}

// ─── Platform specs ───────────────────────────────────────────────────────────
const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: '📸', color: '#e1306c' },
  { id: 'facebook', label: 'Facebook', icon: '📘', color: '#1877f2' },
  { id: 'meta-ads', label: 'Meta Ads', icon: '🎯', color: '#0081fb' },
] as const;

// ─── Style / Mood options ─────────────────────────────────────────────────────
const STYLES = [
  { id: 'professional', label: '💼 Professzionális' },
  { id: 'playful', label: '🎉 Játékos' },
  { id: 'luxury', label: '✨ Prémium/Luxus' },
  { id: 'urgent', label: '⚡ Sürgős/Akció' },
  { id: 'storytelling', label: '📖 Történetmesélő' },
  { id: 'educational', label: '📚 Edukatív' },
  { id: 'emotional', label: '❤️ Érzelmi' },
  { id: 'minimal', label: '⬜ Minimalista' },
];

// ─── Helper: parse subject for viewer-facing text and matching overlay ───────
function parseSubject(subject: string, brandName: string, selectedProduct: string) {
  let cleanBrief = subject.trim();
  let overlayText = '';
  let matchedTemplateId: string | null = null;

  // 1. Semantic separators for Hungarian (felirattal, szöveggel, kiírással)
  const semanticSplits = /\s+(felirattal|felirat|szöveggel|szöveg|kiírással|kiírás|felirata|szövege)\s+/i;

  // 2. Check for quotes (Hungarian „” or English "")
  const quoteMatch = subject.match(/[„"“'”]([^„"”'”]+)[”"”'”]/);

  if (quoteMatch) {
    overlayText = quoteMatch[1].trim();
    cleanBrief = subject.replace(quoteMatch[0], '')
      .replace(semanticSplits, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } else if (semanticSplits.test(subject)) {
    const parts = subject.split(semanticSplits);
    // Usually "Visual context [felirattal] Overlay text"
    if (parts.length >= 3) {
      cleanBrief = parts[0].trim();
      overlayText = parts.slice(2).join(' ').trim();
    }
  } else {
    // 3. Punctuation separators
    const separators = /[:–\-|]/;
    if (separators.test(subject)) {
      const parts = subject.split(separators);
      const promoKeywords = /%|akció|kedvezmény|leárazás|sale|promo|ajánlat|olcsó|vásárlás|rendelés|ingyenes|szállítás|limitált|hamarosan|új|new/i;
      const promoIndex = parts.findIndex(p => promoKeywords.test(p));
      if (promoIndex !== -1) {
        overlayText = parts[promoIndex].trim();
        const otherParts = parts.filter((_, idx) => idx !== promoIndex);
        cleanBrief = otherParts.join(' ').trim();
      }
    }
  }

  // 4. Percentage & Keyword Extraction Fallback
  if (!overlayText) {
    const percentMatch = subject.match(/(\d+\s*%\s*(kedvezmény|akció|kedvezmeny|akcio)?)/i);
    if (percentMatch) {
      overlayText = percentMatch[1].trim();
      cleanBrief = cleanBrief.replace(percentMatch[0], '').trim();
    } else {
      const keywords = ['akció', 'akcio', 'kedvezmény', 'kedvezmeny', 'leárazás', 'learazas', 'sale', 'kiárusítás'];
      for (const kw of keywords) {
        const re = new RegExp(`\\b${kw}\\b`, 'gi');
        if (re.test(subject)) {
          overlayText = kw.toUpperCase() + '!';
          cleanBrief = cleanBrief.replace(re, '').trim();
          break;
        }
      }
    }
  }

  // 5. Final Cleaning of the visual prompt for Flux
  const lowerOverlay = overlayText.toLowerCase();
  const lowerSubject = subject.toLowerCase();
  const isInternalText =
    (brandName && lowerOverlay.includes(brandName.toLowerCase())) ||
    (selectedProduct && lowerOverlay.includes(selectedProduct.toLowerCase())) ||
    lowerSubject.includes('terméken') || lowerSubject.includes('vödrön') ||
    lowerSubject.includes('címk') || lowerSubject.includes('doboz');

  return {
    cleanBrief: cleanBrief || subject,
    overlayText,
    matchedTemplateId,
    isInternalText
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export const QuickPostView: React.FC<QuickPostViewProps> = ({ activeBrandKit, auditResult, onSavePost }) => {
  // Screen state: 1=input, 2=generating, 3=result
  const [screen, setScreen] = useState<1 | 2 | 3>(1);

  // Screen 1 state
  const [subject, setSubject] = useState('');
  const [platform, setPlatform] = useState<'instagram' | 'facebook' | 'meta-ads'>('instagram');
  const [style, setStyle] = useState('professional');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [showExperimentalMotors, setShowExperimentalMotors] = useState(false);

  // Screen 2 state
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // CTA Input (Screen 1)
  const [ctaInput, setCtaInput] = useState('');

  // Environment Preset
  const [selectedEnvPresetId, setSelectedEnvPresetId] = useState<string>('workshop');

  // Debounce ref for Satori
  const satoriDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Screen 3 state
  const [result, setResult] = useState<QuickPostResult | null>(null);
  const [activeVariant, setActiveVariant] = useState(0);
  const [editCaption, setEditCaption] = useState('');
  const [editHashtags, setEditHashtags] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  // Multi-slot image upload (replaces single productImage/preprocessedUrl)
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([]);
  const isPreprocessing = imageSlots.some(s => s.preprocessLoading || s.analysisLoading || s.upscaleLoading);
  const [isZoomed, setIsZoomed] = useState(false);

  // "Eredeti kép megtartása" toggle
  const [preserveOriginal, setPreserveOriginal] = useState(false);

  // "Termékre hangolt háttér" toggle — analyzes product image first, generates matching BG
  const [productAwareBg, setProductAwareBg] = useState(false);

  // "Feltöltött kép használata" toggle — skips FLUX entirely, uses original uploaded image as background
  const [useOriginalImage, setUseOriginalImage] = useState(false);

  // "Szöveg-megőrzéses regenerálás" mode — rembg + text zone detection + BFL Fill Pro in one pass
  const [textPreserveMode, setTextPreserveMode] = useState(false);

  // Text-on-image warning modal state
  const [showTextWarning, setShowTextWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Text-Preserve Regeneration state
  const [isTextPreserveLoading, setIsTextPreserveLoading] = useState(false);

  // Overlay-only preview state (no FLUX needed)
  const [overlayPreviewLoading, setOverlayPreviewLoading] = useState(false);
  const [overlayPreviewResult, setOverlayPreviewResult] = useState<{
    imageUrl: string;
    originalImageUrl: string;
    overlayText: string | null;
    cta: string | null;
    templateId: string | null;
    noOverlay?: boolean;
    elapsed: number;
  } | null>(null);
  const [overlayPreviewError, setOverlayPreviewError] = useState<string | null>(null);

  // Layer Template state
  const [selectedLayerTemplateId, setSelectedLayerTemplateId] = useState<string | null>(null);
  const [isApplyingLayerTemplate, setIsApplyingLayerTemplate] = useState(false);
  const [hoveredLayerTemplateId, setHoveredLayerTemplateId] = useState<string | null>(null);
  const [hoveredOverlayFile, setHoveredOverlayFile] = useState<string | null>(null);
  const [aiAdaptEnabled, setAiAdaptEnabled] = useState<boolean>(true);
  const [lastAdaptChanges, setLastAdaptChanges] = useState<string[]>([]);
  const [suggestedTemplateIds, setSuggestedTemplateIds] = useState<string[]>([]);

  // Modal/Sliders Editing State (Screen 3 Layer Customization)
  const [editingText, setEditingText] = useState('');
  const [editingCta, setEditingCta] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [editingLogoPosition, setEditingLogoPosition] = useState<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('top-left');
  const [editingLogoVariant, setEditingLogoVariant] = useState<'light' | 'dark'>('light');
  const [editingColorVariation, setEditingColorVariation] = useState<'default' | 'inverted' | 'accent'>('default');
  const [editingBgBlur, setEditingBgBlur] = useState(0);
  const [editingOverlayOpacity, setEditingOverlayOpacity] = useState(0.55);
  const [editingLogoSize, setEditingLogoSize] = useState(1.0);
  const [editingFontSize, setEditingFontSize] = useState(32);
  const [editingTextAlignment, setEditingTextAlignment] = useState<'left' | 'center' | 'right'>('left');
  const [editingCtaRadius, setEditingCtaRadius] = useState(8);
  const [editingFontWeight, setEditingFontWeight] = useState('700');
  const [editingTextColor, setEditingTextColor] = useState('default');

  // Default image state (persisted)
  const [defaultImage, setDefaultImage] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('qp_default_image');
    return null;
  });

  const handleSlotDefault = (slot: ImageSlot) => {
    const url = slot.upscaledUrl || slot.preprocessedUrl || slot.originalUrl || '';
    if (!url) return;
    
    // Toggle: if already default, remove. Else set as only default.
    const isNowDefault = !slot.isDefault;
    
    setImageSlots(prev => prev.map(s => ({
      ...s,
      isDefault: s.id === slot.id ? isNowDefault : false
    })));

    if (isNowDefault) {
      setDefaultImage(url);
      if (typeof window !== 'undefined') localStorage.setItem('qp_default_image', url);
      showToast({ title: 'Kész', message: 'Alapértelmezett kép kiválasztva!', type: 'success' });
    } else {
      setDefaultImage(null);
      if (typeof window !== 'undefined') localStorage.removeItem('qp_default_image');
    }
  };

  const handleUseDefault = async () => {
    if (!defaultImage) return;
    
    // 1. Create mock result for Screen 3
    const mockResult: QuickPostResult = {
      imageUrl: defaultImage,
      caption: '',
      hashtags: '',
      platform: platform,
      style: style,
      variations: [defaultImage, defaultImage, defaultImage],
      rawImages: [defaultImage]
    };
    
    setResult(mockResult);
    setActiveVariant(0);
    setEditingText(subject);
    setEditingCta(ctaInput);
    setScreen(3);

    // 2. Initialize Satori layers with current subject
    setSatoriTextLayers([{ id: '1', text: subject, x: 0, y: 0, fontSize: 52, color: '#ffffff', opacity: 100, textAlign: 'center' }]);
    setActiveTextLayerIndex(0);

    // 3. Trigger initial render AFTER state flush (setTimeout 0 lets React commit first)
    // Without this delay, handleSatoriStyleSelect reads stale result.variations (null)
    // which causes an unhandled exception that crashes the whole component → white screen.
    const styleToApply = selectedSatoriStyleId || 'gradient-bottom';
    setTimeout(() => {
      const tempResult = null; // unused — kept for reference
      // Manually fire satori-render using the known defaultImage URL
      const resolvedBase = defaultImage.startsWith('http') ? defaultImage : `${getBackendUrl()}${defaultImage}`;
      fetch(`${getBackendUrl()}/api/image/satori-render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseImageUrl: resolvedBase,
          text: subject || '',
          cta: ctaInput || '',
          satoriStyleId: styleToApply,
          brandColors: activeBrandKit?.colors,
          fontFamily: activeBrandKit?.typography?.fontName || 'Inter',
          width: 1080,
          height: 1350,
          textLayers: [{ id: '1', text: subject, x: 0, y: 0, fontSize: 52, color: '#ffffff', opacity: 100, textAlign: 'center' }],
        }),
      })
        .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
        .then(data => {
          const newUrl = (data.imageUrl.startsWith('http') ? data.imageUrl : `${getBackendUrl()}${data.imageUrl}`) + '?t=' + Date.now();
          setResult(prev => {
            if (!prev) return null;
            return { ...prev, imageUrl: newUrl, variations: [newUrl, newUrl, newUrl] };
          });
          setSelectedSatoriStyleId(styleToApply);
        })
        .catch(err => {
          console.warn('[handleUseDefault] Satori render failed (non-fatal):', err);
          // Keep the plain defaultImage visible — no white screen
        });
    }, 50);
  };
  const [editingTextYOffset, setEditingTextYOffset] = useState(0);
  const [editingTextXOffset, setEditingTextXOffset] = useState(0);
  const [editingPanelBgColor, setEditingPanelBgColor] = useState('default');
  const [editingPanelPadding, setEditingPanelPadding] = useState(50);
  const [editingPanelRadius, setEditingPanelRadius] = useState(0);
  const [editingPanelPosition, setEditingPanelPosition] = useState('relative');
  const [editingCtaFontSize, setEditingCtaFontSize] = useState(20);
  const [editingCtaBgColor, setEditingCtaBgColor] = useState('default');
  const [editingCtaYOffset, setEditingCtaYOffset] = useState(0);
  const [editingAltText, setEditingAltText] = useState<string>('');

  const [debugImages, setDebugImages] = useState<{ bgRaw: string | null; bgHarmonized: string | null } | null>(null);
  const [satoriMode, setSatoriMode] = useState(false);
  const [selectedSatoriStyleId, setSelectedSatoriStyleId] = useState<string | null>(null);
  const [showSatoriAdvanced, setShowSatoriAdvanced] = useState(false);
  const [satoriActiveTab, setSatoriActiveTab] = useState<'text' | 'cta' | 'shape'>('text');
  
  // Granular Text States
  const [satoriTextOpacity, setSatoriTextOpacity] = useState(100);
  const [satoriTextFs, setSatoriTextFs] = useState(48);
  const [satoriTextY, setSatoriTextY] = useState(0);
  const [satoriTextX, setSatoriTextX] = useState(0);
  const [satoriTextColor, setSatoriTextColor] = useState<string | null>(null);

  // Granular CTA States
  const [satoriCtaOpacity, setSatoriCtaOpacity] = useState(100);
  const [satoriCtaFs, setSatoriCtaFs] = useState(24);
  const [satoriCtaY, setSatoriCtaY] = useState(0);
  const [satoriCtaX, setSatoriCtaX] = useState(0);
  const [satoriCtaColor, setSatoriCtaColor] = useState<string | null>(null);
  const [satoriCtaBgColor, setSatoriCtaBgColor] = useState<string | null>(null);

  // Granular Shape/Style States
  const [satoriShapeOpacity, setSatoriShapeOpacity] = useState(90);
  const [satoriShapeY, setSatoriShapeY] = useState(0);
  const [satoriShapeX, setSatoriShapeX] = useState(0);
  const [satoriShapeColor, setSatoriShapeColor] = useState<string | null>(null);

  // Multi-Text Satori Layers
  const [satoriTextLayers, setSatoriTextLayers] = useState<any[]>([
    { id: '1', text: '', x: 0, y: 0, fontSize: 52, color: '#ffffff', opacity: 100, textAlign: 'center' }
  ]);
  const [activeTextLayerIndex, setActiveTextLayerIndex] = useState(0);

  const [showLegacySablon, setShowLegacySablon] = useState(false);


  // ── PNG Overlay Templates (integrated into Layer Sablon section) ──────────
  type OverlayCategoryEntry = { id: string; label: string; files: string[] };

  const OVERLAY_CATS = ['geoframe', 'badge', 'ribbon', 'sticker', 'banner', 'label', 'frame_deco'];
  const OVERLAY_META: Record<string, { label: string; emoji: string; defaultText: string; textPos: 'top' | 'center' | 'bottom' }> = {
    geoframe: { label: 'Geometrikus Keret', emoji: '⬛', defaultText: '', textPos: 'bottom' },
    badge: { label: 'Sale Badge', emoji: '🏷️', defaultText: 'SALE -30%', textPos: 'center' },
    ribbon: { label: 'Szalag (Ribbon)', emoji: '🎀', defaultText: 'AKCÍÓ', textPos: 'top' },
    sticker: { label: 'Matrica (Sticker)', emoji: '📍', defaultText: '-40%', textPos: 'top' },
    banner: { label: 'Promósáv (Banner)', emoji: '📯', defaultText: 'LEÁRAZÁS', textPos: 'top' },
    label: { label: 'Árcédula (Label)', emoji: '🏷️', defaultText: '-25% KUPON', textPos: 'bottom' },
    frame_deco: { label: 'Díszítő Keret', emoji: '🖼️', defaultText: '', textPos: 'bottom' },
  };
  const buildFallbackManifest = (): Record<string, OverlayCategoryEntry> => {
    const m: Record<string, OverlayCategoryEntry> = {};
    for (const id of OVERLAY_CATS) {
      m[id] = { id, label: OVERLAY_META[id]?.label || id, files: Array.from({ length: 10 }, (_, i) => `/overlays/${id}/${id}-${String(i + 1).padStart(2, '0')}.png`) };
    }
    return m;
  };

  const [overlayManifest, setOverlayManifest] = React.useState<Record<string, OverlayCategoryEntry>>(buildFallbackManifest());
  // Which overlay category card is expanded in the Layer Sablon section
  const [activeOverlayCat, setActiveOverlayCat] = React.useState<string | null>(null);
  // Selected PNG file within the active category
  const [selectedOverlayFile, setSelectedOverlayFile] = React.useState<string | null>(null);
  // Per-category customizable text
  const [overlayTemplateText, setOverlayTemplateText] = React.useState<string>('');
  const [overlayTextPosition, setOverlayTextPosition] = React.useState<'top' | 'center' | 'bottom'>('bottom');

  // ── AI Template Suggestion Scoring ───────────────────────────────────────────
  // Deterministic, frontend-only scoring: ranks templates using meta fields.
  // Placed AFTER all useState declarations to avoid TDZ (Temporal Dead Zone) error.
  const computeTemplateSuggestions = React.useCallback(() => {
    if (!activeBrandKit || !activeBrandKit.colors) return;
    const templates = buildLayerTemplates(
      activeBrandKit.colors.primary || '#8b5cf6',
      activeBrandKit.colors.accent || '#ec4899',
      activeBrandKit.typography?.fontName || 'Inter'
    );

    // Gather image analysis signals
    const imgAnalysis = imageSlots[0]?.analysis;
    const imageSignals = {
      imageType: imgAnalysis?.imageType,
      backgroundBrightness: imgAnalysis?.backgroundBrightness,
      subjectPosition: imgAnalysis?.subjectPosition,
      negativeSpaceZone: imgAnalysis?.negativeSpaceZone,
    };

    // Gather brand DNA signals
    const dna = activeBrandKit.brandDna;
    const brandDnaSignals = dna ? {
      promotional_level: dna.promotional_level,
      minimalist_vs_decorative: dna.minimalist_vs_decorative,
      price_segment_score: dna.price_segment_score,
      vibrancy: dna.vibrancy,
    } : undefined;

    // Split editingText into headline + subtitle for scoring
    const fullText = editingText || '';
    const words = fullText.split(/\s+/);
    const headlineWords = words.slice(0, 5).join(' ');
    const subtitleWords = words.length > 5 ? words.slice(5).join(' ') : undefined;

    // Run the unified scorer — top 3 results become suggestions
    const allScores = templates.map(t => {
      const result = getBestTemplate(
        [t],
        { headline: headlineWords, subtitle: subtitleWords, cta: editingCta || undefined },
        fullText,
        imageSignals,
        brandDnaSignals
      );
      return { id: t.id, score: result.score };
    });

    setSuggestedTemplateIds(
      allScores.filter(s => s.score >= 2).sort((a, b) => b.score - a.score).slice(0, 3).map(s => s.id)
    );
  }, [activeBrandKit, editingText, editingCta, imageSlots]);



  React.useEffect(() => {
    computeTemplateSuggestions();
  }, [computeTemplateSuggestions, result]);

  // Load manifest on mount (overrides fallback with real server data)
  React.useEffect(() => {
    fetch(`${getBackendUrl()}/api/overlays/manifest`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject('HTTP ' + r.status))
      .then(data => {
        if (data && Object.keys(data).length > 0) {
          setOverlayManifest(data);
          console.log('[OverlayTpl] Manifest loaded:', Object.keys(data).length, 'categories');
        }
      })
      .catch(e => console.warn('[OverlayTpl] Manifest fetch failed (using fallback):', e));
  }, []);

  // Map layer template ID to layout category ('product' | 'quote' | 'testimonial' | 'list' | 'universal')
  const getLayoutCategory = (tmplId: string | null): 'product' | 'quote' | 'testimonial' | 'list' | 'universal' => {
    if (!tmplId) return 'universal';
    if (tmplId.includes('quote') || tmplId.includes('bold-headline') || tmplId.includes('announcement') || tmplId === 'dark-announcement') return 'quote';
    if (tmplId.includes('testimonial') || tmplId.includes('kicker-title')) return 'testimonial';
    if (tmplId.includes('list') || tmplId.includes('carousel') || tmplId.includes('countdown')) return 'list';
    return 'product'; // fallback to product
  };

  // Style helper functions for real-time CSS/HTML preview
  const getColorValue = (colorName: string, defaultColor: string) => {
    if (colorName === 'primary') return activeBrandKit.colors.primary;
    if (colorName === 'secondary') return activeBrandKit.colors.secondary;
    if (colorName === 'accent') return activeBrandKit.colors.accent;
    if (colorName === 'white') return '#FFFFFF';
    if (colorName === 'black') return '#000000';
    return defaultColor;
  };

  const getPanelStyle = () => {
    const activeTmplId = hoveredLayerTemplateId === 'clean'
      ? null
      : (hoveredLayerTemplateId || selectedLayerTemplateId);
    const layoutCat = getLayoutCategory(activeTmplId);

    let bgColor = getColorValue(editingPanelBgColor, activeBrandKit.colors.primary);
    if (editingPanelBgColor === 'none') bgColor = 'transparent';
    else if (editingPanelBgColor === 'translucent-dark') bgColor = 'rgba(0, 0, 0, 0.65)';
    else if (editingPanelBgColor === 'translucent-light') bgColor = 'rgba(255, 255, 255, 0.65)';
    else if (editingPanelBgColor === 'default') {
      if (layoutCat === 'quote') bgColor = activeBrandKit.colors.primary;
      else if (layoutCat === 'testimonial') bgColor = activeBrandKit.colors.secondary;
      else bgColor = activeBrandKit.colors.primary;
    }

    const textColorVal = layoutCat === 'testimonial' ? activeBrandKit.colors.primary : activeBrandKit.colors.secondary;

    const scale = 300 / 1080;
    const paddingVal = editingPanelPadding * scale;
    const radiusVal = editingPanelRadius * scale;
    const posX = editingTextXOffset * scale;
    const posY = editingTextYOffset * scale;

    let positionStyles: React.CSSProperties = {};
    if (editingPanelPosition !== 'relative') {
      positionStyles = {
        position: 'absolute',
        left: '50%',
        width: 'calc(100% - 24px)',
      };
      if (editingPanelPosition === 'top') {
        positionStyles.top = `${60 * scale + posY}px`;
        positionStyles.bottom = 'auto';
        positionStyles.transform = `translateX(-50%) translateX(${posX}px)`;
      } else if (editingPanelPosition === 'center') {
        positionStyles.top = '50%';
        positionStyles.bottom = 'auto';
        positionStyles.transform = `translate(-50%, -50%) translate(${posX}px, ${posY}px)`;
      } else if (editingPanelPosition === 'bottom') {
        positionStyles.bottom = `${60 * scale + posY}px`;
        positionStyles.top = 'auto';
        positionStyles.transform = `translateX(-50%) translateX(${posX}px)`;
      }
    } else {
      positionStyles = {
        position: 'relative',
        width: '100%',
        transform: `translate(${posX}px, ${posY}px)`,
      };
    }

    return {
      backgroundColor: bgColor,
      padding: `${paddingVal}px`,
      borderRadius: `${radiusVal}px`,
      color: getColorValue(editingTextColor, textColorVal),
      ...positionStyles,
      zIndex: 3,
      display: 'flex',
      flexDirection: 'column' as const,
      boxSizing: 'border-box' as const,
      transition: 'all 0.15s ease',
    };
  };

  const getTextStyle = (): React.CSSProperties => {
    const activeTmplId = hoveredLayerTemplateId === 'clean'
      ? null
      : (hoveredLayerTemplateId || selectedLayerTemplateId);
    const layoutCat = getLayoutCategory(activeTmplId);

    const scale = 300 / 1080;
    const fontSizeVal = editingFontSize * scale;
    let textColorVal = layoutCat === 'testimonial' ? activeBrandKit.colors.primary : activeBrandKit.colors.secondary;

    return {
      fontSize: `${fontSizeVal}px`,
      fontWeight: editingFontWeight as any,
      textAlign: editingTextAlignment,
      color: getColorValue(editingTextColor, textColorVal),
      fontFamily: activeBrandKit.typography?.fontName || 'Inter',
      lineHeight: 1.45,
      margin: 0,
      wordBreak: 'break-word',
      whiteSpace: 'pre-wrap',
    };
  };

  const getCtaStyle = (): React.CSSProperties => {
    const scale = 300 / 1080;
    const radiusVal = editingCtaRadius * scale;
    const fontSizeVal = editingCtaFontSize * scale;
    const spacingVal = (24 + editingCtaYOffset) * scale;

    let bgCol = getColorValue(editingCtaBgColor, activeBrandKit.colors.accent);
    if (editingCtaBgColor === 'default') {
      if (editingColorVariation === 'inverted') bgCol = activeBrandKit.colors.secondary;
      else if (editingColorVariation === 'accent') bgCol = activeBrandKit.colors.primary;
      else bgCol = activeBrandKit.colors.accent;
    }

    let textCol = '#FFFFFF';
    if (editingCtaBgColor === 'white' || editingCtaBgColor === 'secondary' || (editingCtaBgColor === 'default' && editingColorVariation === 'inverted')) {
      textCol = activeBrandKit.colors.primary;
    }

    return {
      backgroundColor: bgCol,
      color: textCol,
      borderRadius: `${radiusVal}px`,
      fontSize: `${fontSizeVal}px`,
      fontWeight: 700,
      border: 'none',
      padding: `${10 * scale}px ${20 * scale}px`,
      marginTop: `${spacingVal}px`,
      alignSelf: editingTextAlignment === 'center' ? 'center' : editingTextAlignment === 'right' ? 'flex-end' : 'flex-start',
      textTransform: 'uppercase',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
      cursor: 'pointer',
      width: 'fit-content',
      whiteSpace: 'nowrap',
      transition: 'all 0.15s ease',
    };
  };

  const handleSavePostDetails = async () => {
    if (!result) return;
    setSavingEdit(true);
    try {
      const bgImage = result.rawImages[activeVariant];
      const response = await fetch(`${getBackendUrl()}/api/render-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post: {
            id: `quick-post-${Date.now()}`,
            briefId: `quick-post-brief`,
            templateId: selectedLayerTemplateId || 'universal',
            status: 'approved',
            text: editingText,
            cta: editingCta,
            logoPosition: editingLogoPosition,
            logoVariant: editingLogoVariant,
            colorVariation: editingColorVariation,
            bgBlur: editingBgBlur,
            overlayOpacity: editingOverlayOpacity,
            logoSize: editingLogoSize,
            fontSize: editingFontSize,
            textAlignment: editingTextAlignment,
            ctaRadius: editingCtaRadius,
            fontWeight: editingFontWeight,
            textColor: editingTextColor,
            textYOffset: editingTextYOffset,
            textXOffset: editingTextXOffset,
            panelBgColor: editingPanelBgColor,
            panelPadding: editingPanelPadding,
            panelRadius: editingPanelRadius,
            panelPosition: editingPanelPosition,
            ctaFontSize: editingCtaFontSize,
            ctaBgColor: editingCtaBgColor,
            ctaYOffset: editingCtaYOffset,
            imageUrl: bgImage,
            originalImageUrl: bgImage,
            platform: result.platform,
            hashtags: editHashtags.split(/\s+/).filter(t => t.startsWith('#')),
            altText: editingAltText,
          },
          brandKit: activeBrandKit,
          text: editingText
        })
      });

      if (!response.ok) throw new Error(await response.text());
      const updated = await response.json();
      const finalImage = fixImageUrl(updated.imageUrl);

      setResult(prev => {
        if (!prev) return null;
        const newVariations = [...prev.variations];
        newVariations[activeVariant] = finalImage;
        return {
          ...prev,
          imageUrl: finalImage,
          variations: newVariations
        };
      });
    } catch (err: any) {
      console.error(err);
      alert('Sikertelen renderelés: ' + (err.message || err));
    } finally {
      setSavingEdit(false);
    }
  };

  const applyTemplateToVariant = async (
    vIndex: number,
    templateId: string | null,
    customResult?: QuickPostResult,
    overlayText?: string,
    ctaText?: string,
    explicitAnalysis?: any
  ) => {
    const activeResult = customResult || result;
    if (!activeResult) return;
    const rawBgImage = activeResult.rawImages[vIndex];

    if (!templateId) {
      const updateResultState = (prev: QuickPostResult | null) => {
        if (!prev) return null;
        const newVariations = [...prev.variations];
        newVariations[vIndex] = rawBgImage;
        return {
          ...prev,
          imageUrl: rawBgImage,
          variations: newVariations
        };
      };
      if (customResult) {
        setResult(updateResultState(activeResult));
      } else {
        setResult(updateResultState);
      }
      return;
    }

    setIsApplyingLayerTemplate(true);
    try {
      // Compute contrast text color from current image analysis
      const analysis = explicitAnalysis || imageSlots[vIndex]?.analysis;
      const dominantColors = analysis?.dominantColors || [];
      const lightKw = ['white', 'cream', 'beige', 'ivory', 'light', 'yellow', 'pale', 'silver', 'fehér', 'ezüst', 'sárga'];
      const darkKw = ['black', 'navy', 'dark', 'charcoal', 'deep', 'midnight', 'fekete', 'sötét', 'tengerész'];
      const hasDark = dominantColors.some((c: string) => darkKw.some(k => c.toLowerCase().includes(k.toLowerCase())));

      // If image has dark areas or analysis says so, favor white text
      const isDarkBg = analysis?.backgroundBrightness === 'dark' || hasDark;
      const contrastColor = isDarkBg ? '#ffffff' : '#1a1a1a';

      const templates = buildLayerTemplates(
        activeBrandKit.colors.primary,
        activeBrandKit.colors.accent,
        activeBrandKit.typography?.fontName || 'Inter',
        contrastColor
      );
      const template = templates.find(t => t.id === templateId);
      if (!template) throw new Error('Sablon nem található');

      // ── Inject user overlay text into the template layers ─────────────────
      // Strategy: find ALL content text layers (sorted by fontSize desc),
      // replace the primary one with overlayText.
      // For templates like promo-badge, the largest is the "50%" display number.
      const finalOverlay = overlayText !== undefined ? overlayText : editingText;
      const finalCta = ctaText !== undefined ? ctaText : editingCta;

      // ── Content Fitting Engine (contentFitter.ts) ─────────────────────────
      // Universal rule-based slot assignment: badge → kicker → headline → subtitle → CTA
      // Replaces the previous 3 hardcoded strategies.
      const fitResult = fitContentToTemplate(template, finalOverlay || '', finalCta || '');
      let patchedLayers = fitResult.layers;

      if (fitResult.warnings.length > 0) {
        console.warn('[FITTER] Warnings:', fitResult.warnings);
      }
      if (fitResult.removedSlots.length > 0) {
        console.log('[FITTER] Removed empty slots:', fitResult.removedSlots);
      }
      if (fitResult.assignments.length > 0) {
        console.log('[FITTER] Assignments:', fitResult.assignments.map(a => `${a.role}="${a.text}"`).join(', '));
      }


      // ── STEP 1: Deterministic normalization (font-size, panel height, contrast shadow, frame snap)
      const imgAnalysis = explicitAnalysis || imageSlots[vIndex]?.analysis || undefined;
      const normalizeResult = normalizeLayers(template, patchedLayers, imgAnalysis);
      patchedLayers = normalizeResult.layers;
      const deterministicChanges = normalizeResult.changes;
      if (deterministicChanges.length > 0) {
        console.log('[NORMALIZER] Applied', deterministicChanges.length, 'fixes:', deterministicChanges.slice(0, 3));
      }

      // ── STEP 2: AI Adaptive Layer Adjustment (semantic-only, if enabled + image analysis exists) ──
      if (aiAdaptEnabled && imgAnalysis) {
        try {
          console.log('[ADAPT] Calling AI layer adaptation (semantic-only)...');
          const adaptResp = await fetch(`${getBackendUrl()}/api/image/adapt-template-layers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              layers: patchedLayers,
              imageAnalysis: imgAnalysis,
              editingText: finalOverlay,
              editingCta: finalCta,
              templateId,
            }),
          });
          if (adaptResp.ok) {
            const adaptData = await adaptResp.json();
            patchedLayers = adaptData.adaptedLayers || patchedLayers;
            setLastAdaptChanges([...deterministicChanges.slice(0, 2), ...(adaptData.changes || []).slice(0, 2)]);
            console.log('[ADAPT] AI changes:', adaptData.changes?.slice(0, 3));
          } else {
            setLastAdaptChanges(deterministicChanges.slice(0, 3));
          }
        } catch (adaptErr) {
          console.warn('[ADAPT] Failed, using normalized layers:', adaptErr);
          setLastAdaptChanges(deterministicChanges.slice(0, 3));
        }
      } else {
        setLastAdaptChanges(deterministicChanges.slice(0, 3));
      }

      // COVER the background image: scale so it fills the full 1080×1350 canvas (no grey bars).
      // Excess edges are cropped — correct behavior for marketing images.
      const bgFitDims = await new Promise<{ x: number, y: number, w: number, h: number }>(resolve => {
        const probe = new Image();
        probe.onload = () => {
          const iw = probe.naturalWidth || 1080;
          const ih = probe.naturalHeight || 1350;
          // Math.max = cover: scale so the SMALLER dimension fills the canvas
          const scale = Math.max(1080 / iw, 1350 / ih);
          const fw = Math.round(iw * scale);
          const fh = Math.round(ih * scale);
          // Center-crop: negative offset brings the center into view
          resolve({ x: Math.round((1080 - fw) / 2), y: Math.round((1350 - fh) / 2), w: fw, h: fh });
        };
        probe.onerror = () => resolve({ x: 0, y: 0, w: 1080, h: 1350 });
        probe.src = fixImageUrl(rawBgImage);
      });

      const bgLayer = {
        type: 'image' as const,
        src: rawBgImage,
        x: bgFitDims.x,
        y: bgFitDims.y,
        width: bgFitDims.w,
        height: bgFitDims.h,
        opacity: 1,
        objectFit: 'cover',   // hint for renderer: fill canvas, center-crop edges
      };

      // Brand color canvas — transparent areas from rembg PNG show brand identity
      const canvasBg = activeBrandKit?.colors?.primary || '#1a1a2e';

      const layoutJson = {
        width: 1080,
        height: 1350,
        pages: [{
          background: canvasBg,
          children: [bgLayer, ...patchedLayers]
        }]
      };

      // ── SATORI ENGINE MODE ────────────────────────────────────────────────
      if (satoriMode) {
        console.log('[RENDER] Using Satori Engine (Deterministic SVG)...');
        const satoriResp = await fetch(`${getBackendUrl()}/api/image/satori-render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseImageUrl: fixImageUrl(rawBgImage),
            text: finalOverlay || '',
            cta: finalCta || '',
            position: (templateId === 'quote' || templateId === 'testimonial') ? 'center' : 'bottom',
            brandColors: activeBrandKit.colors,
            fontFamily: activeBrandKit.typography?.fontName || 'Inter'
          })
        });
        if (!satoriResp.ok) throw new Error(await satoriResp.text());
        const satoriData = await satoriResp.json();
        const newImageUrl = fixImageUrl(satoriData.imageUrl);

        const updateResultState = (prev: QuickPostResult | null) => {
          if (!prev) return null;
          const newVariations = [...prev.variations];
          newVariations[vIndex] = newImageUrl;
          return { ...prev, imageUrl: newImageUrl, variations: newVariations };
        };

        if (customResult) setResult(updateResultState(activeResult));
        else setResult(updateResultState);
        return;
      }

      // ── POLOTNO LEGACY MODE ────────────────────────────────────────────────
      const response = await fetch(`${getBackendUrl()}/api/render-polotno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layoutJson })
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      const newImageUrl = fixImageUrl(data.imageUrl);

      const updateResultState = (prev: QuickPostResult | null) => {
        if (!prev) return null;
        const newVariations = [...prev.variations];
        newVariations[vIndex] = newImageUrl;
        return {
          ...prev,
          imageUrl: newImageUrl,
          variations: newVariations
        };
      };

      if (customResult) {
        setResult(updateResultState(activeResult));
      } else {
        setResult(updateResultState);
      }
    } catch (err: any) {
      console.error(err);
      alert('Sikertelen sablon alkalmazás: ' + (err.message || err));
    } finally {
      setIsApplyingLayerTemplate(false);
    }
  };

  const handleApplyLayerTemplate = (templateId: string | null) => {
    setSelectedLayerTemplateId(templateId);
    applyTemplateToVariant(activeVariant, templateId, undefined, editingText, editingCta);
  };

  /** Satori style card click: calls API directly with the chosen styleId and manual control values */
  // ── Text-Preserve Regeneration ─────────────────────────────────────────────
  // Detects text/label zones on the isolated product image, generates a mask,
  // then calls BFL FLUX Fill Pro to regenerate product body + background in one
  // pass while keeping all label text pixel-perfectly intact.
  const handleTextPreserveRegen = async () => {
    // This is a PRIMARY generation mode — works from Screen 1 even without a prior result
    if (isTextPreserveLoading) return;
    const slot = imageSlots.find(s => s.preprocessedUrl || s.originalUrl);
    if (!slot) {
      showToast({ title: 'Hiba', message: 'Nincs feltöltött termékkép.', type: 'error' });
      return;
    }
    const productImageUrl = slot.preprocessedUrl || slot.originalUrl || '';
    if (!productImageUrl) {
      showToast({ title: 'Hiba', message: 'A termékkép URL nem elérhető.', type: 'error' });
      return;
    }

    setIsTextPreserveLoading(true);
    setScreen(2); // Show loading screen
    setError(null);

    try {
      const API_BASE = import.meta.env.VITE_KEPGENERALAS_API_URL || 'http://localhost:3001';
      const resp = await fetch(`${API_BASE}/api/image/text-preserve-regen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productImageUrl: productImageUrl.startsWith('http')
            ? productImageUrl
            : `${API_BASE}${productImageUrl}`,
          scenePrompt: subject || '',
          brandContext: {
            name: brandKit?.name || '',
            colors: brandKit?.colors,
          },
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || data.details || 'Ismeretlen hiba');

      const fullImageUrl = data.imageUrl.startsWith('http')
        ? data.imageUrl
        : `${API_BASE}${data.imageUrl}`;

      // Build or update the result object
      const newResult: QuickPostResult = {
        imageUrl: fullImageUrl,
        caption: result?.caption || `${subject || 'Termék'} — prémium fotó`,
        hashtags: result?.hashtags || '',
        platform: result?.platform || 'instagram',
        style: result?.style || 'modern',
        variations: [fullImageUrl],
        rawImages: [fullImageUrl],
        generationModel: 'BFL FLUX Fill Pro',
        generationTime: data.elapsed ? data.elapsed / 1000 : undefined,
      };
      setResult(newResult);
      setActiveVariant(0);
      setScreen(3); // Navigate to result screen

      showToast({
        title: 'Szöveg-megőrzéses regen kész!',
        message: `${data.textZonesDetected} szövegzóna megőrizve. ${(data.elapsed / 1000).toFixed(1)}s`,
        type: 'success'
      });
      console.log('[TEXT-PRESERVE-REGEN] Done:', data);
    } catch (err: any) {
      console.error('[TEXT-PRESERVE-REGEN] Error:', err);
      setError(err.message || 'Szöveg-megőrzéses regenerálás sikertelen.');
      // Stay on screen 2 to show error, or go back to 1
      setScreen(1);
      showToast({ title: 'Hiba', message: err.message || 'Szöveg-megőrzéses regenerálás sikertelen.', type: 'error' });
    } finally {
      setIsTextPreserveLoading(false);
    }
  };

  const handleSatoriStyleSelect = async (styleId: string, overrides?: any, immediate = false) => {
    setSelectedSatoriStyleId(styleId);
    if (!result) return;

    const performUpdate = async () => {
      // KEY FIX: Always use rawImages (original generated image) as the base, NOT variations.
      // variations gets overwritten with the satori-rendered result after each click,
      // so using it would stack overlays on top of each other (gradient+gradient+gradient...).
      // rawImages is set once when the image is generated and never modified by satori renders.
      const rawBgImage = result.rawImages?.[activeVariant] || result.variations?.[activeVariant];
      if (!rawBgImage) return;
      const resolvedBase = rawBgImage.startsWith('http') ? rawBgImage : `${getBackendUrl()}${rawBgImage}`;
      
      setIsApplyingLayerTemplate(true);
      try {
        const currentLayers = [...satoriTextLayers];
        // Apply overrides to the current active layer if it exists
        if (overrides?.text && activeTextLayerIndex !== -1) {
          currentLayers[activeTextLayerIndex] = { ...currentLayers[activeTextLayerIndex], ...overrides.text };
        }

        const resp = await fetch(`${getBackendUrl()}/api/image/satori-render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseImageUrl: resolvedBase,
            text: currentLayers[0]?.text || '', 
            cta: editingCta || '',
            satoriStyleId: styleId,
            brandColors: activeBrandKit?.colors,
            fontFamily: activeBrandKit?.typography?.fontName || 'Inter',
            width: 1080,
            height: 1350,
            textLayers: currentLayers,
            textOpts: {
              color:    overrides?.text?.color    !== undefined ? overrides.text.color    : currentLayers[0]?.color || undefined,
              opacity:  overrides?.text?.opacity  !== undefined ? overrides.text.opacity  : currentLayers[0]?.opacity,
              fontSize: overrides?.text?.fontSize !== undefined ? overrides.text.fontSize : currentLayers[0]?.fontSize,
              x:        overrides?.text?.x        !== undefined ? overrides.text.x        : currentLayers[0]?.x,
              y:        overrides?.text?.y        !== undefined ? overrides.text.y        : currentLayers[0]?.y,
            },
            ctaOpts: {
              color:    overrides?.cta?.color    !== undefined ? overrides.cta.color    : satoriCtaColor || undefined,
              bgColor:  overrides?.cta?.bgColor  !== undefined ? overrides.cta.bgColor  : satoriCtaBgColor || undefined,
              opacity:  overrides?.cta?.opacity  !== undefined ? overrides.cta.opacity  : satoriCtaOpacity,
              fontSize: overrides?.cta?.fontSize !== undefined ? overrides.cta.fontSize : satoriCtaFs,
              x:        overrides?.cta?.x        !== undefined ? overrides.cta.x        : satoriCtaX,
              y:        overrides?.cta?.y        !== undefined ? overrides.cta.y        : satoriCtaY,
            },
            shapeOpts: {
              color:    overrides?.shape?.color   !== undefined ? overrides.shape.color   : satoriShapeColor || undefined,
              opacity:  overrides?.shape?.opacity !== undefined ? overrides.shape.opacity : satoriShapeOpacity,
              x:        overrides?.shape?.x       !== undefined ? overrides.shape.x       : satoriShapeX,
              y:        overrides?.shape?.y       !== undefined ? overrides.shape.y       : satoriShapeY,
            },
          }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        const newUrl = (data.imageUrl.startsWith('http') ? data.imageUrl : `${getBackendUrl()}${data.imageUrl}`) + '?t=' + Date.now();
        setResult(prev => {
          if (!prev) return null;
          const newVars = [...prev.variations];
          newVars[activeVariant] = newUrl;
          return { ...prev, imageUrl: newUrl, variations: newVars };
        });
      } catch (err: any) {
        console.error('[SATORI]', err);
      } finally {
        setIsApplyingLayerTemplate(false);
      }
    };

    if (satoriDebounceRef.current) clearTimeout(satoriDebounceRef.current);
    
    if (immediate) {
      performUpdate();
    } else {
      satoriDebounceRef.current = setTimeout(performUpdate, 400);
    }
  };




  // Products from audit
  const products: { name: string; page_url?: string }[] = auditResult?.products || [];
  const primaryColor = activeBrandKit?.colors?.primary || '#8b5cf6';
  const brandName = activeBrandKit?.name || 'Márka';

  // ── Build brand style context (same as ImageTestLab) ──────────────────────
  const buildBrandStyleContext = () => {
    const brandStyleContext: string[] = [];
    const bp = activeBrandKit?.brandProfile;
    const dna = activeBrandKit?.brandDna;
    const colors = activeBrandKit?.colors;
    if (bp?.visual_style_tags?.length) brandStyleContext.push(...bp.visual_style_tags);
    if (dna?.warmth_vs_coolness !== undefined) {
      if (dna.warmth_vs_coolness >= 60) brandStyleContext.push('warm lighting');
      else if (dna.warmth_vs_coolness <= 40) brandStyleContext.push('cool neutral lighting');
    }
    if (dna?.minimalist_vs_decorative !== undefined) {
      if (dna.minimalist_vs_decorative <= 35) brandStyleContext.push('minimalist composition');
      else if (dna.minimalist_vs_decorative >= 65) brandStyleContext.push('decorative rich composition');
    }
    if (dna?.vibrancy !== undefined) {
      if (dna.vibrancy >= 65) brandStyleContext.push(`vibrant colors, accent: ${colors?.accent || ''}`);
      else brandStyleContext.push('muted tones');
    }
    if (colors?.primary) brandStyleContext.push(`primary color ${colors.primary}`);
    if (bp?.brand_archetype) brandStyleContext.push(`${bp.brand_archetype} archetype atmosphere`);
    if (activeBrandKit?.visualRules?.length) brandStyleContext.push(...activeBrandKit.visualRules);
    return brandStyleContext;
  };

  const buildNegativePrompt = () => {
    const neg: string[] = [];
    const bp = activeBrandKit?.brandProfile;
    if (activeBrandKit?.negativePrompt) neg.push(activeBrandKit.negativePrompt);
    if (bp?.brand_dont?.avoid_topics?.length) neg.push(...bp.brand_dont.avoid_topics);
    if (bp?.brand_dont?.avoid_tones?.length) neg.push(...bp.brand_dont.avoid_tones);
    return neg;
  };

  // ── Translate prompt via backend (same as ImageTestLab) ────────────────────
  const translatePrompt = async (text: string): Promise<string> => {
    try {
      const products: string[] = (auditResult?.products || []).map((p: any) => p.name || p.title || '').filter(Boolean);
      const resp = await fetch(`${getBackendUrl()}/api/translate-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, brandContext: { products } }),
      });
      if (!resp.ok) return text;
      const data = await resp.json();
      return data.wasTranslated ? data.translated : text;
    } catch {
      return text;
    }
  };

  // ── Start generation ────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!auditResult) {
      showToast('Nincs scannelve oldal! Előbb futtass egy auditot.', 'error');
      return;
    }
    if (!subject.trim()) return;
    setScreen(2);
    setProgress(0);

    const steps = [
      { pct: 10, label: '🌐 Prompt fordítása...' },
      { pct: 25, label: '🤖 AI prompt felépítése...' },
      { pct: 45, label: '🎨 FLUX.2 [flex] képgenerálás indul...' },
      { pct: 70, label: '🖼️ Kép renderelése folyamatban...' },
      { pct: 88, label: '✍️ Caption & hashtag generálás...' },
      { pct: 97, label: '🔀 Variáció összeállítása...' },
    ];

    let stepIdx = 0;
    setProgressLabel(steps[0].label);

    timerRef.current = setInterval(() => {
      if (stepIdx < steps.length) {
        setProgress(steps[stepIdx].pct);
        setProgressLabel(steps[stepIdx].label);
        stepIdx++;
      }
    }, 1600);

    try {
      const { cleanBrief, overlayText: parsedOverlayText, matchedTemplateId: parsedMatchedTemplateId, isInternalText } = parseSubject(subject, brandName, selectedProduct);
      let overlayText: string | null = parsedOverlayText;
      let matchedTemplateId: string | null = parsedMatchedTemplateId;
      let cta: string | null = null;


      // Build the visual description (no viewer-facing text — that goes to overlay)
      let brief = [
        cleanBrief.trim(),
        style && `Stílus: ${style}`,
        selectedProduct && `Termék: ${selectedProduct}`,
        brandName && `Márka: ${brandName}`,
      ].filter(Boolean).join('. ');

      // Translate Hungarian → English (same as ImageTestLab)
      setProgressLabel('🌐 Magyar → angol fordítás...');
      brief = await translatePrompt(brief);

      // Final safety brand strip
      brief = brief
        .replace(/\b(audi|polifarbe|poli-farbe|bmw|mercedes|porsche|ferrari|lamborghini|ford|toyota|honda)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // ── Environment Preset Injection ──
      // If productAwareBg is ON, we use the selected preset's professional prompt.
      // This ensures the background quality is high and matches the chosen theme.
      if (productAwareBg) {
        const preset = ENVIRONMENT_PRESETS.find(p => p.id === selectedEnvPresetId);
        if (preset) {
          brief = `${brief}. Environment: ${preset.prompt}, high quality product photography, cinematic lighting, realistic surfaces`;
          console.log(`[QuickPost] Product-Aware Environment Preset Applied: ${preset.label}`);
        }
      }

      // ── Background Cleaning Logic ──
      // If we have overlay text, Flux MUST NOT generate any text in the background image.
      // Exception: if the user explicitly asked for text ON the product (isInternalText).
      const shouldCleanBackground = overlayText && !isInternalText;
      if (shouldCleanBackground) {
        brief = brief + ', high quality product photography background, minimalist clean set, absolutely no text, no letters, no words, no numbers, no symbols, no price tags, no stickers, no watermarks, no typography, clean surfaces only';
      }

      // 🔍 DEBUG: log exactly what goes into the image generator
      console.log('%c[QuickPost → Flux Prompt]', 'background:#7c3aed;color:#fff;padding:2px 6px;border-radius:3px;font-weight:700');
      console.log('  Input subject :', subject);
      console.log('  cleanBrief    :', cleanBrief);
      console.log('  overlayText   :', overlayText || '(none)');
      console.log('  matchedTmplId :', matchedTemplateId || '(none)');
      console.log('  Final brief → Flux:', brief);


      // Build brand style context
      const brandStyleContext = buildBrandStyleContext();
      const brandNegativePrompt = buildNegativePrompt();

      // Always add text-avoidance negatives
      const noTextNegatives = 'text, letters, numbers, words, stickers, labels, price tags, watermarks, overlays, badges, typography, font, caption, subtitle';
      brandNegativePrompt.push(noTextNegatives);

      // Call composite-generate if image slots present, or test-image for scene-only
      let rawMain: string;
      let captionText: string;
      let hashtagsText: string;
      let genModel = '';
      let genTime = 0;
      let compositeData: any = null;

      if (imageSlots.length >= 1 && useOriginalImage) {
        // ── BYPASS MODE: use original uploaded image directly, no FLUX ──
        const firstSlot = imageSlots[0];
        const originalUrl = firstSlot.originalUrl || firstSlot.preprocessedUrl || '';
        rawMain = originalUrl.startsWith('http') ? originalUrl : `${getBackendUrl()}${originalUrl}`;
        captionText = `${subject}\n\n${brandName} — ${style}`;
        hashtagsText = `#${brandName.replace(/\s+/g, '')} #social #marketing`;
        genModel = 'original-image';
        genTime = 0;
        // Use image analysis from slot if available
        const slotAnalysis = firstSlot.analysis;
        const dominantColorsOrig = slotAnalysis?.dominantColors || [];
        const hasDarkOrig = dominantColorsOrig.some((c: string) => ['black', 'navy', 'dark', 'charcoal', 'fekete', 'sötét'].some(k => c.toLowerCase().includes(k)));
        const contrastColorOrig = hasDarkOrig ? '#ffffff' : '#1a1a1a';
        const primaryColOrig = activeBrandKit?.colors?.primary || '#8b5cf6';
        const accentColOrig = activeBrandKit?.colors?.accent || '#ec4899';
        const finalTemplatesOrig = buildLayerTemplates(primaryColOrig, accentColOrig, activeBrandKit?.typography?.fontName || 'Inter', contrastColorOrig);
        if (!matchedTemplateId) {
          const finalSelectionOrig = getBestTemplate(finalTemplatesOrig, { headline: overlayText || '', cta: cta || '' }, subject);
          matchedTemplateId = finalSelectionOrig.templateId;
        }
        setDebugImages(null);
      } else if (imageSlots.length >= 1) {
        // Composite generation (same as ImageTestLab)
        const payload = buildCompositePayload(imageSlots, brief, activeBrandKit);
        // Attach preserveOriginal and productAwareBg flags so backend can use them
        (payload as any).preserveOriginal = preserveOriginal;
        (payload as any).productAwareBg = productAwareBg;
        const compositeResp = await fetch(`${getBackendUrl()}/api/image/composite-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!compositeResp.ok) throw new Error(await compositeResp.text());
        compositeData = await compositeResp.json();
        rawMain = compositeData.imageUrl?.startsWith('http') ? compositeData.imageUrl : `${getBackendUrl()}${compositeData.imageUrl}`;
        captionText = `${subject}\n\n${brandName} — ${style}`;
        hashtagsText = `#${brandName.replace(/\s+/g, '')} #social #marketing`;
        genModel = compositeData.generationModel || 'bfl-flux-2-flex';
        genTime = compositeData.generationTime || 0;
        // Use backend-decomposed layer text and auto-selected template
        if (compositeData.decomposedLayerText) overlayText = compositeData.decomposedLayerText;
        if (compositeData.decomposedLayerCta) cta = compositeData.decomposedLayerCta;
        if (compositeData.selectedTemplateId) matchedTemplateId = compositeData.selectedTemplateId;

        // ─── STS Decision Phase (Fallback) ───
        const primaryCol = activeBrandKit?.colors?.primary || '#8b5cf6';
        const accentCol = activeBrandKit?.colors?.accent || '#ec4899';
        // 1. Initial color detection for the templates (global)
        const dominantColors = compositeData.imageAnalysis?.dominantColors || [];
        const hasDark = dominantColors.some((c: string) => ['black', 'navy', 'dark', 'charcoal', 'fekete', 'sötét'].some(k => c.toLowerCase().includes(k)));
        const contrastColor = hasDark ? '#ffffff' : '#1a1a1a';

        const finalTemplates = buildLayerTemplates(primaryCol, accentCol, activeBrandKit?.typography?.fontName || 'Inter', contrastColor);

        let needsShortening = false;
        if (!matchedTemplateId) {
          const finalSelection = getBestTemplate(finalTemplates, { headline: overlayText || '', cta: cta || '' }, subject);
          matchedTemplateId = finalSelection.templateId;
          needsShortening = finalSelection.needsShortening;
          console.log(`[QuickPost] STS Fallback Selection: ${matchedTemplateId}`);
        } else {
          // Even if Vision picked it, check if it needs shortening
          const t = finalTemplates.find(temp => temp.id === matchedTemplateId);
          if (t) {
            const hLen = (overlayText || '').length;
            const cLen = (cta || '').length;
            needsShortening = (hLen > (t.meta.headlineMaxChars || 100)) || (cLen > (t.meta.ctaMaxChars || 20));
          }
          console.log(`[QuickPost] Using Vision AI Selected Template: ${matchedTemplateId}`);
        }

        if (needsShortening) {
          const winnerTmpl = finalTemplates.find(t => t.id === matchedTemplateId);
          if (winnerTmpl) {
            setProgressLabel('✍️ Szöveg optimalizálása a sablonhoz...');

            // Headline shortening via AI
            if (overlayText && overlayText.length > winnerTmpl.meta.headlineMaxChars && winnerTmpl.meta.headlineMaxChars > 0) {
              const refinePrompt = `Rövidítsd le ezt a marketing címsort maximum ${winnerTmpl.meta.headlineMaxChars} karakterre, maradjon ütős és márkázott: ${overlayText}`;
              const refined = await translatePrompt(refinePrompt);
              // Fallback to truncate if AI fails to shorten enough
              overlayText = refined.length > winnerTmpl.meta.headlineMaxChars ? truncateToFit(refined, winnerTmpl.meta.headlineMaxChars) : refined;
            }

            // CTA shortening via AI
            if (cta && cta.length > winnerTmpl.meta.ctaMaxChars && winnerTmpl.meta.ctaMaxChars > 0) {
              const ctaPrompt = `Rövidítsd le ezt a gomb feliratot maximum ${winnerTmpl.meta.ctaMaxChars} karakterre: ${cta}`;
              const refinedCta = await translatePrompt(ctaPrompt);
              cta = refinedCta.length > winnerTmpl.meta.ctaMaxChars ? truncateToFit(refinedCta, winnerTmpl.meta.ctaMaxChars) : refinedCta;
            }
          }
        }

        // Store debug intermediate images
        if (compositeData.debugImages) {
          setDebugImages(compositeData.debugImages);
        } else {
          setDebugImages(null);
        }
      } else if (!useOriginalImage) {
        // Scene-only — use /api/test-image just like ImageTestLab (Flex model, 2:3 aspect)
        const resp = await fetch(`${getBackendUrl()}/api/test-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productImageUrl: null,
            preprocessedImageUrl: null,
            scenePrompt: brief,
            model: 'auto',
            safetyTolerance: 1,
            aspectRatio: '2:3',
            guidance: 4.5,
            steps: 50,
            width: 1024,
            height: 1536,
            brandStyle: brandStyleContext.length > 0 ? brandStyleContext.join(', ') : undefined,
            negativePrompt: brandNegativePrompt.length > 0 ? brandNegativePrompt.join(', ') : undefined,
            brandKit: activeBrandKit ? {
              colors: activeBrandKit.colors,
              tone: activeBrandKit.tone,
              visualRules: activeBrandKit.visualRules,
              brandDna: activeBrandKit.brandDna,
              brandProfile: activeBrandKit.brandProfile
            } : undefined,
          }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        compositeData = data; // Assign to hoisted variable
        const rawMainUrl = data.imageUrl;
        rawMain = rawMainUrl?.startsWith('http') ? rawMainUrl : `${getBackendUrl()}${rawMainUrl}`;
        captionText = `${subject}\n\n${brandName} — ${style}`;
        hashtagsText = `#${brandName.replace(/\s+/g, '')} #social #marketing`;
        genModel = data.model || 'bfl-flux-2-flex';
        genTime = data.elapsed ? data.elapsed / 1000 : 0;
      }

      clearInterval(timerRef.current!);

      const newResult: QuickPostResult = {
        imageUrl: rawMain,
        caption: captionText,
        hashtags: hashtagsText,
        platform,
        style,
        variations: [rawMain],
        rawImages: [rawMain],
        generationModel: genModel || undefined,
        generationTime: genTime || undefined,
      };

      setResult(newResult);
      setEditCaption(captionText);
      setEditHashtags(hashtagsText);
      setActiveVariant(0);

      // Initialize layer customization
      setEditingText(overlayText || captionText);
      setEditingCta(ctaInput || (selectedProduct ? 'Megnézem' : 'Érdekel'));
      setEditingLogoPosition(activeBrandKit?.logoPosition || 'top-left');
      setEditingLogoVariant('dark');
      setEditingColorVariation('default');
      setEditingBgBlur(0);
      setEditingOverlayOpacity(0.55);
      setEditingLogoSize(1.0);
      setEditingFontSize(32);
      setEditingTextAlignment('left');
      setEditingCtaRadius(8);
      setEditingFontWeight('700');
      setEditingTextColor('default');
      setEditingTextYOffset(compositeData?.textYOffset || 0);
      setEditingTextXOffset(compositeData?.textXOffset || 0);
      setEditingPanelBgColor('default');
      setEditingPanelPadding(50);
      setEditingPanelRadius(0);
      setEditingPanelPosition('relative');
      setEditingCtaFontSize(20);
      setEditingCtaBgColor('default');
      setEditingCtaYOffset(0);
      setEditingAltText('');

      // Nincs automatikus overlay — a nyers kép jelenik meg, a user maga választ Satori stílust.
      setSelectedLayerTemplateId(null);
      setSelectedSatoriStyleId(null);


      setProgress(100);
      setProgressLabel('✅ Kész!');

      await new Promise(r => setTimeout(r, 500));
      setScreen(3);

    } catch (err: any) {
      clearInterval(timerRef.current!);
      console.error('[QuickPost] Generation error:', err?.message || err);
      setError(err.message || 'Ismeretlen hiba történt a generálás során.');
      setProgress(0);
      setScreen(1); // FIX: hiba esetén vissza screen 1-re, ne maradjon üres loading screen
    }
  };

  // ── Overlay-only preview (no FLUX) — navigates to Screen 3 ──────────────
  const handleOverlayPreview = async () => {
    if (!auditResult) {
      showToast('Nincs scannelve oldal! Előbb futtass egy auditot.', 'error');
      return;
    }
    // Use preprocessedUrl (rembg'd image, transparent background) first:
    // it will be centered + fit on a brand-color canvas — product shows cleanly.
    // Falls back to originalUrl if rembg not yet available.
    const uploadedSlot = imageSlots.find(s => s.preprocessedUrl || s.originalUrl);
    if (!uploadedSlot) return;
    const rawImageUrl = uploadedSlot.preprocessedUrl || uploadedSlot.originalUrl || '';
    if (!rawImageUrl) return;

    const fullImageUrl = rawImageUrl.startsWith('http') ? rawImageUrl : `${getBackendUrl()}${rawImageUrl}`;

    // Go to loading screen
    setScreen(2);
    setProgress(10);
    setProgressLabel('🤖 AI elemzi a képet...');

    try {
      // 1. Call backend — only decompose + layer select (no FLUX)
      setProgress(30);
      setProgressLabel('🎨 Overlay template kiválasztása...');

      const resp = await fetch(`${getBackendUrl()}/api/image/overlay-only`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: fullImageUrl,
          prompt: subject || 'Product photo, professional setting',
          brandKit: activeBrandKit,
          brandTone: activeBrandKit?.tone,
          brandRules: activeBrandKit?.visualRules,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();

      let overlayText: string | null = data.overlayText || null;
      let cta: string | null = data.cta || null;
      let templateId: string | null = data.selectedTemplateId || null;

      // ─── STS Decision Phase ───
      const primaryCol = activeBrandKit?.colors?.primary || '#8b5cf6';
      const accentCol = activeBrandKit?.colors?.accent || '#ec4899';
      const fontName = activeBrandKit?.typography?.fontName || 'Inter';
      const finalTemplates = buildLayerTemplates(primaryCol, accentCol, fontName);
      const finalSelection = getBestTemplate(finalTemplates, { headline: overlayText || '', cta: cta || '' }, subject);
      templateId = finalSelection.templateId;

      if (finalSelection.needsShortening) {
        const winnerTmpl = finalTemplates.find(t => t.id === templateId);
        if (winnerTmpl) {
          setProgressLabel('✍️ Szöveg optimalizálása...');

          // Headline shortening via AI
          if (overlayText && overlayText.length > winnerTmpl.meta.headlineMaxChars && winnerTmpl.meta.headlineMaxChars > 0) {
            const refinePrompt = `Rövidítsd le ezt a marketing címsort maximum ${winnerTmpl.meta.headlineMaxChars} karakterre, maradjon ütős és márkázott: ${overlayText}`;
            const refined = await translatePrompt(refinePrompt);
            overlayText = refined.length > winnerTmpl.meta.headlineMaxChars ? truncateToFit(refined, winnerTmpl.meta.headlineMaxChars) : refined;
          }

          // CTA shortening via AI
          if (cta && cta.length > winnerTmpl.meta.ctaMaxChars && winnerTmpl.meta.ctaMaxChars > 0) {
            const ctaPrompt = `Rövidítsd le ezt a gomb feliratot maximum ${winnerTmpl.meta.ctaMaxChars} karakterre: ${cta}`;
            const refinedCta = await translatePrompt(ctaPrompt);
            cta = refinedCta.length > winnerTmpl.meta.ctaMaxChars ? truncateToFit(refinedCta, winnerTmpl.meta.ctaMaxChars) : refinedCta;
          }
        }
      }

      setProgress(60);
      setProgressLabel('📐 Template alkalmazása...');

      // 2. Build QuickPostResult using the uploaded image as raw
      const captionText = subject || `${brandName} — ${style}`;
      const hashtagsText = `#${(activeBrandKit?.name || 'brand').replace(/\s+/g, '')} #social #marketing`;

      const newResult: QuickPostResult = {
        imageUrl: fullImageUrl,
        caption: captionText,
        hashtags: hashtagsText,
        platform,
        style,
        variations: [fullImageUrl],
        rawImages: [fullImageUrl],
      };

      setResult(newResult);
      setEditCaption(captionText);
      setEditHashtags(hashtagsText);
      setActiveVariant(0);
      setDebugImages(null);
      // Reset Satori selection — overlay preview applies a fresh Polotno template, not a Satori style.
      // Without this, a stale selectedSatoriStyleId from a previous session would show as "selected"
      // but the image wouldn't match it (ERR: false selected state).
      setSelectedSatoriStyleId(null);

      // Initialize editing state
      setEditingText(overlayText || captionText);
      setEditingCta(ctaInput || cta || (selectedProduct ? 'Megnézem' : 'Érdekel'));
      setEditingLogoPosition(activeBrandKit.logoPosition || 'top-left');
      setEditingLogoVariant('dark');
      setEditingColorVariation('default');
      setEditingBgBlur(0);
      setEditingOverlayOpacity(0.55);
      setEditingLogoSize(1.0);
      setEditingFontSize(32);
      setEditingTextAlignment('left');
      setEditingCtaRadius(8);
      setEditingFontWeight('700');
      setEditingTextColor('default');
      setEditingTextYOffset(0);
      setEditingTextXOffset(0);
      setEditingPanelBgColor('default');
      setEditingPanelPadding(50);
      setEditingPanelRadius(0);
      setEditingPanelPosition('relative');
      setEditingCtaFontSize(20);
      setEditingCtaBgColor('default');
      setEditingCtaYOffset(0);
      setEditingAltText('');

      // 3. Apply template if selected (same as handleGenerate)
      if (templateId) {
        setSelectedLayerTemplateId(templateId);
        const ctaDefault = cta || (selectedProduct ? 'MEGNÉZEM' : 'ÉRDEKEL');
        try {
          await applyTemplateToVariant(0, templateId, newResult, overlayText || undefined, ctaDefault);
        } catch (tmplErr: any) {
          console.error('[OverlayPreview] Template apply failed (non-fatal):', tmplErr?.message || tmplErr);
          setSelectedLayerTemplateId(null);
        }
      } else {
        setSelectedLayerTemplateId(null);
      }

      setProgress(100);
      setProgressLabel('✅ Overlay kész!');
      await new Promise(r => setTimeout(r, 400));
      setScreen(3);

    } catch (err: any) {
      clearInterval(timerRef.current!);
      console.error('[OverlayPreview] Error:', err?.message || err);
      setProgressLabel(`❌ Hiba: ${err.message || 'Ismeretlen hiba'}`);
      setProgress(0);
      setTimeout(() => setScreen(1), 3000);
    }
  };

  // ── Regenerate ─────────────────────────────────────────────────────────────
  const handleRegenerate = () => {
    setScreen(1);
    setResult(null);
    setSaved(false);
    setCopied(false);
    setSelectedLayerTemplateId(null);
    setSelectedSatoriStyleId(null);
    setSatoriShapeOpacity(90);
    setSatoriTextFs(48);
    setSatoriTextY(0);
    setSatoriTextX(0);
    setIsZoomed(false);
  };

  // ── Copy caption + hashtags ─────────────────────────────────────────────────
  const handleCopy = () => {
    const text = `${editCaption}\n\n${editHashtags}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Download image ──────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!result) return;
    const url = result.variations[activeVariant];
    const a = document.createElement('a');
    a.href = url;
    a.download = `quick-post-${Date.now()}.jpg`;
    a.target = '_blank';
    a.click();
  };

  // ── Save to calendar ────────────────────────────────────────────────────────
  const handleSave = () => {
    setSaved(true);
    if (result) {
      const postToSave: PostCreative = {
        id: `quick-post-${Date.now()}`,
        briefId: `quick-post-brief`,
        templateId: selectedLayerTemplateId || 'universal',
        status: 'approved',
        text: editCaption,
        imageUrl: result.variations[activeVariant],
        originalImageUrl: result.rawImages[activeVariant],
        imagePrompt: subject,
        colorVariation: editingColorVariation,
        logoVariant: editingLogoVariant,
        logoPosition: editingLogoPosition,
        bgBlur: editingBgBlur,
        overlayOpacity: editingOverlayOpacity,
        logoSize: editingLogoSize,
        fontSize: editingFontSize,
        textAlignment: editingTextAlignment,
        ctaRadius: editingCtaRadius,
        fontWeight: editingFontWeight,
        textColor: editingTextColor,
        textYOffset: editingTextYOffset,
        textXOffset: editingTextXOffset,
        panelBgColor: editingPanelBgColor,
        panelPadding: editingPanelPadding,
        panelRadius: editingPanelRadius,
        panelPosition: editingPanelPosition,
        ctaFontSize: editingCtaFontSize,
        ctaBgColor: editingCtaBgColor,
        ctaYOffset: editingCtaYOffset,
        cta: editingCta,
        platform: result.platform as PostCreative['platform'],
        hashtags: editHashtags.split(/\s+/).filter(t => t.startsWith('#')),
        createdAt: new Date().toISOString(),
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        generationModel: result.generationModel,
        generationTime: result.generationTime,
      };
      if (onSavePost) {
        onSavePost(postToSave);
      }
    }
  };

  // ─── Image mode radio-button helpers ────────────────────────────────────────
  const imageMode: 'original' | 'preserve' | 'productaware' | 'textpreserve' | null =
    useOriginalImage ? 'original'
    : textPreserveMode ? 'textpreserve'
    : productAwareBg ? 'productaware'
    : preserveOriginal ? 'preserve'
    : null;

  const handleModeSelect = (mode: 'original' | 'preserve' | 'productaware' | 'textpreserve' | null) => {
    if (mode === 'original') {
      setUseOriginalImage(true); setPreserveOriginal(false); setProductAwareBg(false); setTextPreserveMode(false);
    } else if (mode === 'preserve') {
      setUseOriginalImage(false); setPreserveOriginal(true); setProductAwareBg(false); setTextPreserveMode(false);
    } else if (mode === 'productaware') {
      setUseOriginalImage(false); setPreserveOriginal(true); setProductAwareBg(true); setTextPreserveMode(false);
    } else if (mode === 'textpreserve') {
      setUseOriginalImage(false); setPreserveOriginal(false); setProductAwareBg(false); setTextPreserveMode(true);
    } else {
      setUseOriginalImage(false); setPreserveOriginal(false); setProductAwareBg(false); setTextPreserveMode(false);
    }
  };

  const imageModeButtons = [
    {
      id: 'original' as const,
      label: 'H\u00e1tt\u00e9r lev\u00e1g\u00e1s n\u00e9lk\u00fcl',
      desc: 'Eredeti felt\u00f6lt\u00f6tt k\u00e9p, rembg \u00e9s FLUX n\u00e9lk\u00fcl',
      activeDesc: 'Az eredeti k\u00e9p (h\u00e1tt\u00e9rrel) megy be \u2014 FLUX gener\u00e1l\u00e1s kihagyva',
      color: '#fb923c', bg: 'rgba(251,146,60,0.1)', border: '#fb923c50',
      disabled: false,
    },
    {
      id: 'preserve' as const,
      label: 'Eredeti k\u00e9p megtart\u00e1sa',
      desc: 'K\u00f6rbev\u00e1gott term\u00e9k + \u00faj FLUX h\u00e1tt\u00e9r gener\u00e1l\u00f3dik',
      activeDesc: 'A k\u00f6rbev\u00e1gott term\u00e9k v\u00e1ltozatlan marad \u2014 csak a h\u00e1tt\u00e9r gener\u00e1l\u00f3dik \u00fajra',
      color: '#a78bfa', bg: 'rgba(139,92,246,0.1)', border: '#8b5cf650',
      disabled: useOriginalImage,
    },
    {
      id: 'productaware' as const,
      label: 'Term\u00e9kre hangolt h\u00e1tt\u00e9r',
      desc: 'K\u00f6rbev\u00e1gott term\u00e9k + a h\u00e1tt\u00e9r a term\u00e9khez igazodik',
      activeDesc: 'A h\u00e1tt\u00e9r \u00c9S az effektek (f\u00e9ny, \u00e1rny\u00e9k, t\u00f3nus) a term\u00e9k fot\u00f3j\u00e1hoz igazodnak',
      color: '#34d399', bg: 'rgba(16,185,129,0.1)', border: '#10b98150',
      disabled: useOriginalImage,
    },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 0 40px' }}>

      {/* ── SCREEN 1: INPUT ─────────────────────────────────────────────────── */}
      {screen === 1 && (
        <div style={{ animation: 'qp-slide-in 0.22s ease' }}>
          {/* Hero header */}
          <div style={{
            padding: '28px 32px', borderRadius: 18, marginBottom: 20,
            background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(236,72,153,0.08) 100%)',
            border: '1.5px solid rgba(139,92,246,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚡</div>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>Quick Post</h2>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>1 poszt · 30 másodperc · AI-generált · Brand DNA alapján</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* 1. Subject */}
            <div style={{ padding: '20px 24px', borderRadius: 14, background: 'var(--bg3, rgba(255,255,255,0.03))', border: '1.5px solid var(--border)' }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, display: 'block' }}>
                📝 Tárgy / Téma <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                value={subject}
                onChange={e => setSubject(e.target.value.slice(0, 200))}
                placeholder="Pl.: Nyári akció – 30% kedvezmény az összes festékre, csak ezen a héten!"
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '12px 14px', borderRadius: 10,
                  border: `1.5px solid ${subject.length > 0 ? primaryColor + '60' : 'var(--border)'}`,
                  background: 'var(--bg)', color: 'var(--text)', outline: 'none',
                  fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5,
                  transition: 'border-color 0.15s',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <span style={{ fontSize: 10.5, color: subject.length > 180 ? '#ef4444' : 'var(--text-muted)' }}>
                  {subject.length} / 200
                </span>
              </div>
            </div>

            {/* 1.5. CTA (Gomb felirat) */}
            <div style={{ padding: '20px 24px', borderRadius: 14, background: 'var(--bg3, rgba(255,255,255,0.03))', border: '1.5px solid var(--border)' }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'block' }}>
                🛒 Gomb felirat (CTA)
              </label>
              <input
                type="text"
                value={ctaInput}
                onChange={e => setCtaInput(e.target.value.slice(0, 25))}
                placeholder={selectedProduct ? 'MEGNÉZEM' : 'ÉRDEKEL'}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '12px 14px', borderRadius: 10,
                  border: `1.5px solid ${ctaInput.length > 0 ? primaryColor + '60' : 'var(--border)'}`,
                  background: 'var(--bg)', color: 'var(--text)', outline: 'none',
                  fontSize: 13.5, fontFamily: 'inherit',
                  transition: 'border-color 0.15s',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ctaInput.length} / 25</span>
              </div>
            </div>

            {/* 2. Platform */}
            <div style={{ padding: '20px 24px', borderRadius: 14, background: 'var(--bg3, rgba(255,255,255,0.03))', border: '1.5px solid var(--border)' }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'block' }}>
                📡 Platform
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                {PLATFORMS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPlatform(p.id)}
                    style={{
                      flex: 1, padding: '12px 10px', borderRadius: 12, cursor: 'pointer',
                      border: `2px solid ${platform === p.id ? p.color : 'var(--border)'}`,
                      background: platform === p.id ? `${p.color}18` : 'var(--bg)',
                      color: platform === p.id ? p.color : 'var(--text-muted)',
                      fontWeight: 700, fontSize: 13, transition: 'all 0.12s',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Style / Mood */}
            <div style={{ padding: '20px 24px', borderRadius: 14, background: 'var(--bg3, rgba(255,255,255,0.03))', border: '1.5px solid var(--border)' }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'block' }}>
                🎨 Stílus / Hangulat
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {STYLES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setStyle(s.id)}
                    style={{
                      padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                      border: `1.5px solid ${style === s.id ? primaryColor : 'var(--border)'}`,
                      background: style === s.id ? `${primaryColor}18` : 'var(--bg)',
                      color: style === s.id ? primaryColor : 'var(--text-muted)',
                      transition: 'all 0.12s',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Product selector */}
            {products.length > 0 && (
              <div style={{ padding: '20px 24px', borderRadius: 14, background: 'var(--bg3, rgba(255,255,255,0.03))', border: '1.5px solid var(--border)' }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'block' }}>
                  📦 Termék (opcionális)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button
                    onClick={() => setSelectedProduct('')}
                    style={{
                      padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
                      border: `1.5px solid ${!selectedProduct ? primaryColor : 'var(--border)'}`,
                      background: !selectedProduct ? `${primaryColor}18` : 'var(--bg)',
                      color: !selectedProduct ? primaryColor : 'var(--text-muted)',
                    }}
                  >
                    Nincs kiválasztva
                  </button>
                  {products.slice(0, 8).map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedProduct(p.name)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
                        border: `1.5px solid ${selectedProduct === p.name ? primaryColor : 'var(--border)'}`,
                        background: selectedProduct === p.name ? `${primaryColor}18` : 'var(--bg)',
                        color: selectedProduct === p.name ? primaryColor : 'var(--text-muted)',
                        maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                      title={p.name}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 4.5. Multi-image slot uploader */}
            <div style={{ padding: '20px 24px', borderRadius: 14, background: 'var(--bg3, rgba(255,255,255,0.03))', border: '1.5px solid var(--border)' }}>
              <ImageSlotUploader
                slots={imageSlots}
                onChange={setImageSlots}
                onSetDefault={handleSlotDefault}
                maxSlots={3}
                disabled={false}
                label="Képek csatolása (opcionális)"
              />


              {/* Hierarchical image processing selector */}
              {imageSlots.length > 0 && (
                <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14, display: 'block' }}>
                    ⚙️ Képfeldolgozás módja
                  </label>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Mode 1: Bypass (Original) */}
                    <div 
                      onClick={() => handleModeSelect('original')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '14px', borderRadius: 12,
                        background: useOriginalImage ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                        border: `1.5px solid ${useOriginalImage ? primaryColor : 'var(--border)'}`,
                        cursor: 'pointer', transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${useOriginalImage ? primaryColor : 'var(--text-muted)'}`, background: useOriginalImage ? primaryColor : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {useOriginalImage && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: useOriginalImage ? '#fff' : 'var(--text)' }}>Feltöltött kép használata</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Nincs háttér levágás és nincs generálás</div>
                      </div>
                    </div>

                    {/* Mode 2: Generation (with nested options) */}
                    <div 
                      style={{
                        padding: '14px', borderRadius: 12,
                        background: !useOriginalImage ? 'rgba(139,92,246,0.04)' : 'rgba(255,255,255,0.02)',
                        border: `1.5px solid ${!useOriginalImage ? primaryColor : 'var(--border)'}`,
                        transition: 'all 0.2s'
                      }}
                    >
                      <div 
                        onClick={() => handleModeSelect(null)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: !useOriginalImage ? 16 : 0 }}
                      >
                        <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${!useOriginalImage ? primaryColor : 'var(--text-muted)'}`, background: !useOriginalImage ? primaryColor : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {!useOriginalImage && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: !useOriginalImage ? '#fff' : 'var(--text)' }}>Új háttér generálása a termékkel</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>A termék körbevágása + mesterséges környezet</div>
                        </div>
                      </div>

                      {!useOriginalImage && (
                        <div style={{ marginLeft: 32, paddingLeft: 16, borderLeft: '2.5px solid rgba(139,92,246,0.2)', display: 'flex', flexDirection: 'column', gap: 14, animation: 'qp-fade-in 0.3s ease' }}>
                          
                          {/* Sub-option: Preserve Original */}
                          <div 
                            onClick={() => setPreserveOriginal(!preserveOriginal)}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                          >
                            <div style={{ width: 18, height: 18, borderRadius: 5, border: '2px solid #8b5cf6', background: preserveOriginal ? '#8b5cf6' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {preserveOriginal && <Check size={12} color="#fff" />}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: preserveOriginal ? '#fff' : 'var(--text-muted)' }}>Eredeti termék megtartása (Körbevágás)</span>
                          </div>

                          {/* Sub-option: Product Aware (Only if Preserve is ON) */}
                          {preserveOriginal && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'qp-slide-down 0.2s ease' }}>
                              <div 
                                onClick={() => setProductAwareBg(!productAwareBg)}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                              >
                                <div style={{ width: 18, height: 18, borderRadius: 5, border: '2px solid #34d399', background: productAwareBg ? '#34d399' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {productAwareBg && <Check size={12} color="#fff" />}
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: productAwareBg ? '#34d399' : 'var(--text-muted)' }}>Termékre hangolt fizika (Fény/Árnyék)</span>
                              </div>

                              {/* Environment Presets (Only if Product Aware is ON) */}
                              {productAwareBg && (
                                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Környezeti stílus kiválasztása:</span>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                                    {ENVIRONMENT_PRESETS.map(preset => (
                                      <button
                                        key={preset.id}
                                        onClick={() => setSelectedEnvPresetId(preset.id)}
                                        style={{
                                          padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                                          border: `1.5px solid ${selectedEnvPresetId === preset.id ? '#34d399' : 'var(--border)'}`,
                                          background: selectedEnvPresetId === preset.id ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.03)',
                                          color: selectedEnvPresetId === preset.id ? '#34d399' : 'var(--text-muted)',
                                          fontSize: 10, fontWeight: 700, transition: 'all 0.15s',
                                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4
                                        }}
                                      >
                                        <span style={{ fontSize: 14 }}>{preset.icon}</span>
                                        {preset.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Mode 3: Szöveg-megőrzéses regenerálás */}
                    <div
                      onClick={() => handleModeSelect('textpreserve')}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px', borderRadius: 12,
                        background: textPreserveMode ? 'rgba(6,182,212,0.08)' : 'rgba(255,255,255,0.02)',
                        border: `1.5px solid ${textPreserveMode ? '#06b6d4' : 'var(--border)'}`,
                        cursor: 'pointer', transition: 'all 0.2s',
                      }}
                    >
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                        border: `2px solid ${textPreserveMode ? '#06b6d4' : 'var(--text-muted)'}`,
                        background: textPreserveMode ? '#06b6d4' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {textPreserveMode && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: textPreserveMode ? '#22d3ee' : 'var(--text)' }}>
                          Szöveg-megőrzéses regenerálás
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>
                          Rembg → szöveg zóna detektálás → BFL Fill Pro generálja a hátteret és a terméket köré, a feliratokat megőrizve
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </div>

            {/* 🎨 Overlay Preview button — shown when at least one image is uploaded */}
            {imageSlots.some(s => s.preprocessedUrl || s.originalUrl) && (
              <div style={{ padding: '16px 24px', borderRadius: 14, background: 'var(--bg3, rgba(255,255,255,0.03))', border: '1.5px solid rgba(139,92,246,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Layers size={14} color="#a78bfa" />
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Overlay előnézet
                  </span>
                  <span style={{ fontSize: 10, color: '#a78bfa', background: 'rgba(139,92,246,0.12)', padding: '2px 7px', borderRadius: 5, fontWeight: 600 }}>
                    FLUX nélkül
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                  Az AI elemzi a feltöltött képet, kiválasztja a legjobb overlay sablont, és megnyitja a szerkesztőt — Black Forest tokenek nélkül.
                </div>
                <button
                  id="overlay-preview-btn"
                  onClick={handleOverlayPreview}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '12px 20px', borderRadius: 11, border: 'none',
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.8) 0%, rgba(168,85,247,0.8) 100%)',
                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    transition: 'all 0.15s', width: '100%',
                    boxShadow: '0 4px 16px rgba(139,92,246,0.25)',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.opacity = '1'}
                >
                  <Layers size={15} /> Overlay generálása → szerkesztő megnyitása
                </button>
              </div>
            )}

            {/* Text-on-image warning — shown before generation when text detected */}
            {showTextWarning && (
              <div style={{
                padding: '16px 18px', borderRadius: 12,
                background: 'rgba(245,158,11,0.08)',
                border: '1.5px solid rgba(245,158,11,0.4)',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>
                      Szöveg vagy felirat a feltöltött képen
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                      A feltöltött képen szöveg, felirat vagy márkanév látható. A FLUX diffúziós
                      modell <b>nem képes pontosan másolni a betűket</b> — az újragenerálás során
                      az apró szövegek <b>megváltozhatnak, elmosódhatnak vagy értelmetlen
                        karakterekre cserélődhetnek</b>.
                      <br /><br />
                      <b>Ajánlott:</b> kapcsold be a „🔒 Eredeti kép megtartása" opciót fent.
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowTextWarning(false)}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.15)',
                      background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Mégse
                  </button>
                  <button
                    onClick={() => { setShowTextWarning(false); handleGenerate(); }}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: '#f59e0b', color: '#000', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    }}
                  >
                    Értem, generálás →
                  </button>
                </div>
              </div>
            )}

            {/* Generate button */}
            <button
              onClick={() => {
                const hasTextSlot = imageSlots.some(s =>
                  (s as any).analysisResult?.hasText ||
                  (s as any).hasText ||
                  (s as any).analysis?.hasText
                );
                // Skip warning if preserveOriginal or textPreserveMode is on — user already chose safe mode
                if (hasTextSlot && !showTextWarning && !preserveOriginal && !textPreserveMode) {
                  setShowTextWarning(true);
                  return;
                }
                setShowTextWarning(false);
                // textPreserveMode: uses BFL Fill Pro pipeline instead of standard composite-generate
                if (textPreserveMode) {
                  handleTextPreserveRegen();
                } else {
                  handleGenerate();
                }
              }}
              disabled={!subject.trim() || isPreprocessing || isTextPreserveLoading}
              title={
                isPreprocessing ? 'A kép feldolgozása még folyamatban van – kérlek várj...' :
                  !subject.trim() ? 'Írj be egy témát a generáláshoz' :
                    textPreserveMode ? 'Szöveg-megőrzéses regenerálás indítása' :
                    'Poszt generálása'
              }
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '17px 32px', borderRadius: 14, border: 'none', cursor: (subject.trim() && !isPreprocessing && !isTextPreserveLoading) ? 'pointer' : 'not-allowed',
                background: (subject.trim() && !isPreprocessing && !isTextPreserveLoading)
                  ? (textPreserveMode
                      ? 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)'
                      : 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)')
                  : 'rgba(255,255,255,0.07)',
                color: (subject.trim() && !isPreprocessing && !isTextPreserveLoading) ? '#fff' : 'var(--text-muted)',
                fontSize: 15, fontWeight: 800, letterSpacing: '0.01em',
                boxShadow: (subject.trim() && !isPreprocessing && !isTextPreserveLoading)
                  ? (textPreserveMode ? '0 6px 24px rgba(6,182,212,0.35)' : '0 6px 24px rgba(139,92,246,0.35)')
                  : 'none',
                transition: 'all 0.2s',
              }}
            >
              {isTextPreserveLoading ? (
                <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Szöveg zónák detektálása...</>
              ) : isPreprocessing ? (
                <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Kép feldolgozása...</>
              ) : !subject.trim() ? (
                <><Zap size={20} /> Írj be témát a generáláshoz</>
              ) : textPreserveMode ? (
                <><Zap size={20} /> Szöveg-megőrzéses Regen ⚡</>
              ) : (
                <><Zap size={20} /> Poszt Generálása ⚡</>
              )}
            </button>
            {defaultImage && (
              <button
                onClick={handleUseDefault}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  padding: '12px 24px', borderRadius: 12, border: '1.5px dashed rgba(139,92,246,0.5)', cursor: 'pointer',
                  background: 'rgba(139,92,246,0.05)', color: '#a78bfa',
                  fontSize: 13, fontWeight: 700, transition: 'all 0.2s', marginTop: -8
                }}
              >
                <Bookmark size={16} /> Használom a default képet → Szerkesztő
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── SCREEN 2: GENERATING ────────────────────────────────────────────── */}
      {screen === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 32px', animation: 'qp-slide-in 0.22s ease' }}>
          {/* Animated logo */}
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: isTextPreserveLoading
              ? 'linear-gradient(135deg, #06b6d4, #0891b2)'
              : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 34, marginBottom: 28,
            boxShadow: isTextPreserveLoading
              ? '0 0 40px rgba(6,182,212,0.45)'
              : '0 0 40px rgba(139,92,246,0.4)',
            animation: 'qp-pulse 1.5s ease-in-out infinite'
          }}>
            {isTextPreserveLoading ? '🔍' : '⚡'}
          </div>

          <h3 style={{ fontSize: 22, fontWeight: 800, color: error ? '#ef4444' : 'var(--text)', margin: '0 0 8px' }}>
            {error ? 'Hiba történt' : isTextPreserveLoading ? 'Szöveg-megőrzéses generálás...' : 'Poszt generálása...'}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 36px', textAlign: 'center', maxWidth: 380 }}>
            {error ? error : isTextPreserveLoading
              ? 'Claude Vision detektálja a felirat zónákat → BFL Fill Pro egybefüggő háttér + termék generálás (~20-40 mp)'
              : 'FLUX.2 [flex] & Brand DNA alapján, ~5–15 másodperc'}
          </p>

          {error ? (
            <button
              onClick={() => { setError(null); setScreen(1); }}
              style={{
                padding: '12px 32px', borderRadius: 12, border: 'none',
                background: 'var(--bg3)', color: 'var(--text)',
                fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
            >
              OK, Vissza
            </button>
          ) : isTextPreserveLoading ? (
            /* Text-preserve mode: simple spinner steps */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%', maxWidth: 480 }}>
              <div style={{ display: 'flex', gap: 24 }}>
                {[
                  { icon: '🔍', label: 'Szöveg detektálás' },
                  { icon: '🎭', label: 'Maszk generálás' },
                  { icon: '✨', label: 'BFL Fill Pro' },
                  { icon: '💾', label: 'Mentés' },
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, fontSize: 18,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(6,182,212,0.15)',
                      border: '1.5px solid rgba(6,182,212,0.35)',
                      animation: `qp-pulse ${1 + i * 0.3}s ease-in-out infinite`,
                    }}>
                      {step.icon}
                    </div>
                    <span style={{ fontSize: 9, color: 'rgba(6,182,212,0.8)', fontWeight: 600, textAlign: 'center', maxWidth: 70 }}>{step.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ width: '100%', height: 4, background: 'rgba(6,182,212,0.15)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #06b6d4, #0891b2)', animation: 'qp-progress-indeterminate 2s ease-in-out infinite' }} />
              </div>
            </div>
          ) : (
            <>
              {/* Progress bar */}
              <div style={{ width: '100%', maxWidth: 480 }}>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{
                    height: '100%', borderRadius: 6,
                    background: 'linear-gradient(90deg, #8b5cf6, #ec4899)',
                    width: `${progress}%`, transition: 'width 1s ease',
                  }} />
                </div>
                <div style={{ fontSize: 12.5, color: '#a78bfa', fontWeight: 600, textAlign: 'center' }}>
                  {progressLabel}
                </div>
              </div>

              {/* Steps */}
              <div style={{ display: 'flex', gap: 8, marginTop: 32 }}>
                {['Input', 'AI Prompt', 'Kép', 'Caption', 'Kész'].map((step, i) => {
                  const pctThreshold = [0, 15, 55, 80, 96][i];
                  const done = progress > pctThreshold;
                  return (
                    <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: done ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
                        border: `2px solid ${done ? '#8b5cf6' : 'rgba(255,255,255,0.1)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, transition: 'all 0.3s',
                      }}>
                        {done ? <Check size={11} /> : <span style={{ color: 'var(--text-muted)', fontSize: 8 }}>{i + 1}</span>}
                      </div>
                      <span style={{ fontSize: 10, color: done ? '#a78bfa' : 'var(--text-muted)', fontWeight: done ? 700 : 400 }}>{step}</span>
                      {i < 4 && <span style={{ color: 'var(--border)', fontSize: 10 }}>→</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── SCREEN 3: RESULT (SATORI EDITOR) ────────────────────────────────── */}
      {screen === 3 && result && (
        <div style={{ animation: 'qp-slide-in 0.25s ease' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Satori Layer Editor</span>
            </div>
            <button
              onClick={handleRegenerate}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg3)',
                color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer'
              }}
            >
              <RefreshCw size={13} /> Újrakezdés
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 24, alignItems: 'start' }}>
            {/* Left Col: Real-time Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div 
                onClick={() => setIsZoomed(true)}
                style={{ 
                  position: 'relative', width: '400px', height: '500px', 
                  background: '#000', borderRadius: 16, overflow: 'hidden', 
                  border: '2px solid var(--border)', cursor: 'zoom-in',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
                }}
              >
                <img 
                  src={result.variations[activeVariant]} 
                  alt="Satori Preview" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'all 0.3s ease' }} 
                />
                
                {/* Status indicator */}
                {isApplyingLayerTemplate && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, backdropFilter: 'blur(2px)' }}>
                    <div style={{ background: 'var(--bg1)', padding: '10px 20px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)' }}>
                      <Loader size={16} className="qp-spin" color="#8b5cf6" />
                      <span style={{ fontSize: 12, fontWeight: 700 }}>Frissítés...</span>
                    </div>
                  </div>
                )}

                <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.7)', padding: '4px 10px', borderRadius: 8, color: '#a78bfa', fontSize: 10, fontWeight: 800 }}>
                  V{activeVariant + 1}
                </div>
              </div>

              {/* Variations */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {result.variations.map((url, i) => (
                  <div 
                    key={i} 
                    onClick={() => setActiveVariant(i)} 
                    style={{ 
                      aspectRatio: '4/5', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', 
                      border: `2.5px solid ${activeVariant === i ? '#8b5cf6' : 'transparent'}`, 
                      background: 'rgba(255,255,255,0.05)', transition: 'all 0.2s' 
                    }}
                  >
                    <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: activeVariant === i ? 1 : 0.5 }} />
                  </div>
                ))}
              </div>

              {/* Default image toggle */}
              <div 
                onClick={() => {
                  const url = result.variations[activeVariant];
                  const isCurrentlyDefault = defaultImage === url;
                  if (isCurrentlyDefault) {
                    setDefaultImage(null);
                    if (typeof window !== 'undefined') localStorage.removeItem('qp_default_image');
                  } else {
                    setDefaultImage(url);
                    if (typeof window !== 'undefined') localStorage.setItem('qp_default_image', url);
                    showToast({ title: 'Kész', message: 'Alapértelmezett kép elmentve!', type: 'success' });
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 14,
                  background: defaultImage === result.variations[activeVariant] ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1.5px solid ${defaultImage === result.variations[activeVariant] ? '#8b5cf6' : 'rgba(255,255,255,0.1)'}`,
                  cursor: 'pointer', transition: 'all 0.2s', marginTop: 12
                }}
              >
                <div style={{ 
                  width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${defaultImage === result.variations[activeVariant] ? '#8b5cf6' : 'var(--text-muted)'}`, 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: defaultImage === result.variations[activeVariant] ? '#8b5cf6' : 'transparent'
                }}>
                  {defaultImage === result.variations[activeVariant] && <Check size={12} color="#fff" />}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: defaultImage === result.variations[activeVariant] ? '#a78bfa' : 'var(--text-muted)' }}>
                  Alapértelmezett képként mentem
                </span>
              </div>

            </div>

            {/* Right Col: Editor */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Satori Stílusok selection */}
              <div style={{ padding: '20px', borderRadius: 18, background: 'var(--bg3)', border: '1.5px solid var(--border)' }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#22c55e', textTransform: 'uppercase', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={14} /> Satori Quick Styles
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {SATORI_STYLES.map(s => {
                    const isSel = selectedSatoriStyleId === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleSatoriStyleSelect(s.id)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 4px', borderRadius: 12, cursor: 'pointer',
                          border: `2.5px solid ${isSel ? '#22c55e' : 'transparent'}`,
                          background: isSel ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                          color: isSel ? '#22c55e' : 'var(--text-muted)', transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ width: 34, height: 34, borderRadius: 7, background: s.thumbGrad, boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }} />
                        <span style={{ fontSize: 9.5, fontWeight: 700 }}>{s.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Advanced Layer Editor */}
              <div style={{ padding: '24px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', backdropFilter: 'blur(10px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Settings size={16} color="#a78bfa" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Haladó Réteg Szerkesztő</span>
                  </div>
                </div>

                {/* Layer Tabs */}
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 18, scrollbarWidth: 'none' }}>
                  {satoriTextLayers.map((layer, idx) => (
                    <div key={layer.id} style={{ position: 'relative' }}>
                      <button
                        onClick={() => {
                          setSatoriActiveTab('text');
                          setActiveTextLayerIndex(idx);
                        }}
                        style={{
                          padding: '8px 14px', borderRadius: 10, border: 'none',
                          fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                          background: (satoriActiveTab === 'text' && activeTextLayerIndex === idx) ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
                          color: (satoriActiveTab === 'text' && activeTextLayerIndex === idx) ? '#c4b5fd' : 'var(--text-muted)',
                          border: (satoriActiveTab === 'text' && activeTextLayerIndex === idx) ? '1px solid rgba(139,92,246,0.4)' : '1px solid transparent',
                          transition: 'all 0.2s'
                        }}
                      >
                        {layer.text.substring(0, 10) || `Szöveg ${idx + 1}`}
                      </button>
                      {idx > 0 && (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            const newLayers = satoriTextLayers.filter((_, i) => i !== idx);
                            setSatoriTextLayers(newLayers);
                            setActiveTextLayerIndex(Math.max(0, idx - 1));
                            if (selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId);
                          }}
                          style={{ position: 'absolute', top: -5, right: -5, width: 14, height: 14, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 900 }}
                        >
                          ✕
                        </div>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setSatoriActiveTab('cta')}
                    style={{
                      padding: '8px 14px', borderRadius: 10, border: 'none',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                      background: satoriActiveTab === 'cta' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                      color: satoriActiveTab === 'cta' ? '#4ade80' : 'var(--text-muted)',
                      border: satoriActiveTab === 'cta' ? '1px solid rgba(34,197,94,0.4)' : '1px solid transparent',
                      transition: 'all 0.2s'
                    }}
                  >
                    🛒 CTA (Gomb)
                  </button>
                  <button
                    onClick={() => setSatoriActiveTab('shape')}
                    style={{
                      padding: '8px 14px', borderRadius: 10, border: 'none',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                      background: satoriActiveTab === 'shape' ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.05)',
                      color: satoriActiveTab === 'shape' ? '#fbbf24' : 'var(--text-muted)',
                      border: satoriActiveTab === 'shape' ? '1px solid rgba(251,191,36,0.4)' : '1px solid transparent',
                      transition: 'all 0.2s'
                    }}
                  >
                    🎨 Overlay Stílus
                  </button>

                  <button
                    onClick={() => {
                      const newId = String(satoriTextLayers.length + 1);
                      const newLayers = [...satoriTextLayers, { id: newId, text: 'Új szöveg', x: 0, y: 0, fontSize: 40, color: '#ffffff', opacity: 100, textAlign: 'center' }];
                      setSatoriTextLayers(newLayers);
                      setActiveTextLayerIndex(newLayers.length - 1);
                      setSatoriActiveTab('text');
                      if (selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId);
                    }}
                    style={{
                      padding: '8px 12px', borderRadius: 10, border: '1px dashed rgba(139,92,246,0.5)',
                      fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
                      background: 'rgba(139,92,246,0.1)',
                      color: '#a78bfa',
                      transition: 'all 0.2s'
                    }}
                  >
                    + Új Szöveg
                  </button>
                </div>

                {/* Content based on tab */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {satoriActiveTab === 'text' && satoriTextLayers[activeTextLayerIndex] && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>Szöveg Tartalom</span>
                        <textarea 
                          value={satoriTextLayers[activeTextLayerIndex].text} 
                          onChange={e => { 
                            const newLayers = [...satoriTextLayers];
                            newLayers[activeTextLayerIndex].text = e.target.value;
                            setSatoriTextLayers(newLayers);
                            if(selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId, { text: { text: e.target.value } }); 
                          }}
                          style={{ 
                            width: '100%', minHeight: 70, padding: 12, borderRadius: 14, 
                            background: 'rgba(0,0,0,0.3)', border: '1.5px solid rgba(255,255,255,0.15)', 
                            color: '#fff', fontSize: 14, outline: 'none', fontWeight: 600,
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)', transition: 'all 0.2s'
                          }}
                        />
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Méret ({satoriTextLayers[activeTextLayerIndex].fontSize}px)</label>
                          <input 
                            type="range" min="12" max="140" 
                            value={satoriTextLayers[activeTextLayerIndex].fontSize} 
                            onChange={e => { 
                              const val = parseInt(e.target.value);
                              const newLayers = [...satoriTextLayers];
                              newLayers[activeTextLayerIndex].fontSize = val;
                              setSatoriTextLayers(newLayers);
                              if(selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId, { text: { fontSize: val } }); 
                            }} 
                            style={{ width: '100%', accentColor: '#8b5cf6' }} 
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Szín</label>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input 
                              type="color" 
                              value={satoriTextLayers[activeTextLayerIndex].color || '#ffffff'} 
                              onChange={e => { 
                                const newLayers = [...satoriTextLayers];
                                newLayers[activeTextLayerIndex].color = e.target.value;
                                setSatoriTextLayers(newLayers);
                                if(selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId, { text: { color: e.target.value } }); 
                              }} 
                              style={{ width: 32, height: 32, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} 
                            />
                            <span style={{ fontSize: 11, color: '#fff', fontFamily: 'monospace' }}>{satoriTextLayers[activeTextLayerIndex].color || '#ffffff'}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Vízszintes (X) ({satoriTextLayers[activeTextLayerIndex].x}px)</label>
                          <input 
                            type="range" min="-500" max="500" 
                            value={satoriTextLayers[activeTextLayerIndex].x} 
                            onChange={e => { 
                              const val = parseInt(e.target.value);
                              const newLayers = [...satoriTextLayers];
                              newLayers[activeTextLayerIndex].x = val;
                              setSatoriTextLayers(newLayers);
                              if(selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId, { text: { x: val } }); 
                            }} 
                            style={{ width: '100%', accentColor: '#8b5cf6' }} 
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Függőleges (Y) ({satoriTextLayers[activeTextLayerIndex].y}px)</label>
                          <input 
                            type="range" min="-600" max="600" 
                            value={satoriTextLayers[activeTextLayerIndex].y} 
                            onChange={e => { 
                              const val = parseInt(e.target.value);
                              const newLayers = [...satoriTextLayers];
                              newLayers[activeTextLayerIndex].y = val;
                              setSatoriTextLayers(newLayers);
                              if(selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId, { text: { y: val } }); 
                            }} 
                            style={{ width: '100%', accentColor: '#8b5cf6' }} 
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Igazítás</label>
                          <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 8, padding: 2 }}>
                            {['left', 'center', 'right'].map(a => (
                              <button
                                key={a}
                                onClick={() => {
                                  const newLayers = [...satoriTextLayers];
                                  newLayers[activeTextLayerIndex].textAlign = a;
                                  setSatoriTextLayers(newLayers);
                                  if(selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId);
                                }}
                                style={{
                                  flex: 1, padding: '4px 0', borderRadius: 6, border: 'none',
                                  fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                  background: satoriTextLayers[activeTextLayerIndex].textAlign === a ? 'rgba(139,92,246,0.3)' : 'transparent',
                                  color: satoriTextLayers[activeTextLayerIndex].textAlign === a ? '#fff' : 'var(--text-muted)'
                                }}
                              >
                                {a === 'left' ? 'Bal' : a === 'center' ? 'Közép' : 'Jobb'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Átlátszóság ({satoriTextLayers[activeTextLayerIndex].opacity}%)</label>
                          <input 
                            type="range" min="0" max="100" 
                            value={satoriTextLayers[activeTextLayerIndex].opacity} 
                            onChange={e => { 
                              const val = parseInt(e.target.value);
                              const newLayers = [...satoriTextLayers];
                              newLayers[activeTextLayerIndex].opacity = val;
                              setSatoriTextLayers(newLayers);
                              if(selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId, { text: { opacity: val } }); 
                            }} 
                            style={{ width: '100%', accentColor: '#8b5cf6' }} 
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {satoriActiveTab === 'cta' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>Gomb Felirat</span>
                        <input 
                          type="text" 
                          value={editingCta} 
                          onChange={e => { setEditingCta(e.target.value); if(selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId, { cta: { text: e.target.value } }); }}
                          style={{ width: '100%', padding: 12, borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', color: '#fff', fontSize: 13, outline: 'none' }}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Vízszintes (X) ({satoriCtaX}px)</label>
                          <input type="range" min="-400" max="400" value={satoriCtaX} onChange={e => { setSatoriCtaX(parseInt(e.target.value)); if(selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId, { cta: { x: parseInt(e.target.value) } }); }} style={{ width: '100%', accentColor: '#4ade80' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Függőleges (Y) ({satoriCtaY}px)</label>
                          <input type="range" min="-600" max="600" value={satoriCtaY} onChange={e => { setSatoriCtaY(parseInt(e.target.value)); if(selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId, { cta: { y: parseInt(e.target.value) } }); }} style={{ width: '100%', accentColor: '#4ade80' }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {satoriActiveTab === 'shape' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Overlay Átlátszóság ({satoriShapeOpacity}%)</label>
                        <input type="range" min="0" max="100" value={satoriShapeOpacity} onChange={e => { setSatoriShapeOpacity(parseInt(e.target.value)); if(selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId, { shape: { opacity: parseInt(e.target.value) } }); }} style={{ width: '100%', accentColor: '#fbbf24' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>X Eltolás ({satoriShapeX}px)</label>
                          <input type="range" min="-400" max="400" value={satoriShapeX} onChange={e => { setSatoriShapeX(parseInt(e.target.value)); if(selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId, { shape: { x: parseInt(e.target.value) } }); }} style={{ width: '100%', accentColor: '#fbbf24' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Y Eltolás ({satoriShapeY}px)</label>
                          <input type="range" min="-600" max="600" value={satoriShapeY} onChange={e => { setSatoriShapeY(parseInt(e.target.value)); if(selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId, { shape: { y: parseInt(e.target.value) } }); }} style={{ width: '100%', accentColor: '#fbbf24' }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Reset button */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 20, paddingTop: 12, textAlign: 'center' }}>
                  <button 
                    onClick={() => {
                      setSatoriTextLayers([{ id: '1', text: editingText, x: 0, y: 0, fontSize: 52, color: '#ffffff', opacity: 100, textAlign: 'center' }]);
                      setActiveTextLayerIndex(0);
                      setSatoriCtaOpacity(100); setSatoriCtaFs(24); setSatoriCtaX(0); setSatoriCtaY(0); setSatoriCtaColor(null); setSatoriCtaBgColor(null);
                      setSatoriShapeOpacity(90); setSatoriShapeX(0); setSatoriShapeY(0); setSatoriShapeColor(null);
                      if(selectedSatoriStyleId) handleSatoriStyleSelect(selectedSatoriStyleId);
                    }}
                    style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Alaphelyzetbe állítás
                  </button>
                </div>
              </div>


              {/* Final Actions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
                <button 
                  onClick={handleDownload}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px', borderRadius: 14, background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: '#fff', fontSize: 13, fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}
                >
                  <Download size={18} /> Letöltés
                </button>
                <button 
                  onClick={handleSave}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px', borderRadius: 14, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 13, fontWeight: 700, border: '1.5px solid var(--border)', cursor: 'pointer' }}
                >
                  <Bookmark size={18} /> Mentés
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isZoomed && result && createPortal(
        <div
          onClick={() => setIsZoomed(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(5, 3, 12, 0.95)', backdropFilter: 'blur(8px)',
            zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px',
            animation: 'qp-fade-in 0.2s ease',
          }}
        >
          <button onClick={() => setIsZoomed(false)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255, 255, 255, 0.08)', border: '1.5px solid rgba(255, 255, 255, 0.15)', color: '#fff', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}>✕</button>
          <div style={{ width: '100%', maxWidth: '900px', height: '80vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <PanZoomImage src={result.variations[activeVariant]} alt="Nagyított kép" isZoomed={true} onToggleZoom={() => setIsZoomed(false)} />
          </div>
        </div>,
        document.body
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes qp-slide-in {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes qp-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes qp-pulse {
          0%, 100% { box-shadow: 0 0 24px rgba(139,92,246,0.4); }
          50%       { box-shadow: 0 0 48px rgba(236,72,153,0.5); }
        }
        @keyframes qp-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .qp-spin {
          animation: qp-spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default QuickPostView;
