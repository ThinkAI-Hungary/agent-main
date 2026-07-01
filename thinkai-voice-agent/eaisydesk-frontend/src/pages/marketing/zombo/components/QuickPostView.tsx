import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { BrandKit, PostCreative } from '../types';
import { fixImageUrl, getBackendUrl } from '../types';
import { buildLayerTemplates, type LayerTemplate } from '../layerTemplates';
import { Layers, Loader } from 'lucide-react';
import ImageSlotUploader, { type ImageSlot, buildCompositePayload, PanZoomImage } from './ImageSlotUploader';

// ─── Icons (inline SVG) ───────────────────────────────────────────────────────
const Zap     = ({ size = 18 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const RefreshCw = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
const Download = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const Copy    = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
const Check   = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const Bookmark = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>;

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
  { id: 'facebook',  label: 'Facebook',  icon: '📘', color: '#1877f2' },
  { id: 'meta-ads',  label: 'Meta Ads',  icon: '🎯', color: '#0081fb' },
] as const;

// ─── Style / Mood options ─────────────────────────────────────────────────────
const STYLES = [
  { id: 'professional', label: '💼 Professzionális' },
  { id: 'playful',      label: '🎉 Játékos' },
  { id: 'luxury',       label: '✨ Prémium/Luxus' },
  { id: 'urgent',       label: '⚡ Sürgős/Akció' },
  { id: 'storytelling', label: '📖 Történetmesélő' },
  { id: 'educational',  label: '📚 Edukatív' },
  { id: 'emotional',    label: '❤️ Érzelmi' },
  { id: 'minimal',      label: '⬜ Minimalista' },
];

// ─── Helper: parse subject for viewer-facing text and matching overlay ───────
function parseSubject(subject: string, brandName: string, selectedProduct: string) {
  let cleanBrief = subject.trim();
  let overlayText = '';
  let matchedTemplateId: string | null = null;

  // 1. Check for quotes (Hungarian „” or English "")
  const quoteMatch = subject.match(/[„"“'”]([^„"”'”]+)[”"”'”]/);
  if (quoteMatch) {
    overlayText = quoteMatch[1].trim();
    // Remove the quoted part and keywords like "felirattal", "felirat", "szöveggel", "szöveg"
    cleanBrief = subject.replace(quoteMatch[0], '')
      .replace(/\b(felirattal|felirat|szöveggel|szöveg|kiírással|kiírás)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  } else {
    // 2. If no quotes, check if there is a promo phrase using common punctuation separators
    const separators = /[:–\-|]/;
    if (separators.test(subject)) {
      const parts = subject.split(separators);
      // Find which part contains promotional keywords
      const promoKeywords = /%|akció|kedvezmény|leárazás|sale|promo|ajánlat|olcsó|vásárlás|rendelés|ingyenes|szállítás|limitált|hamarosan|új|new/i;
      const promoIndex = parts.findIndex(p => promoKeywords.test(p));
      if (promoIndex !== -1) {
        overlayText = parts[promoIndex].trim();
        // The other parts form the visual description
        const otherParts = parts.filter((_, idx) => idx !== promoIndex);
        cleanBrief = otherParts.join(' ').trim();
      }
    }
  }

  // 3. Fallback: if no separator/quotes but contains promo keywords, try to extract a percentage or short phrase
  if (!overlayText) {
    const percentMatch = subject.match(/(\d+%\s*(kedvezmény|akció)?)/i);
    if (percentMatch) {
      overlayText = percentMatch[1].trim();
      // CRITICAL: also remove it from cleanBrief so Flux doesn't render it on the image
      cleanBrief = cleanBrief
        .replace(percentMatch[0], '')
        .replace(/\s+/g, ' ')
        .trim();
    } else if (subject.toLowerCase().includes('akció')) {
      overlayText = 'AKCIÓ!';
      cleanBrief = cleanBrief
        .replace(/\bakció\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    } else if (subject.toLowerCase().includes('kedvezmény')) {
      overlayText = 'KEDVEZMÉNY!';
      cleanBrief = cleanBrief
        .replace(/\bkedvezmény\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  // Check if the overlay text is actually describing a label on the product
  const lowerOverlay = overlayText.toLowerCase();
  const lowerSubject = subject.toLowerCase();
  
  const isBrandOrProductText = 
    (brandName && lowerOverlay === brandName.toLowerCase()) ||
    (selectedProduct && lowerOverlay === selectedProduct.toLowerCase()) ||
    lowerSubject.includes('terméken') || 
    lowerSubject.includes('vödrön') || 
    lowerSubject.includes('címk') || 
    lowerSubject.includes('doboz');

  if (isBrandOrProductText) {
    overlayText = '';
    matchedTemplateId = null;
    cleanBrief = subject; // Keep full subject so Flux generates the product text
  } else if (overlayText) {
    // Determine matching template ID based on keywords
    if (lowerOverlay.includes('%') || lowerOverlay.includes('kedvezmény') || lowerOverlay.includes('leárazás')) {
      matchedTemplateId = 'promo-badge';
    } else if (lowerSubject.includes('vélemény') || lowerSubject.includes('értékelés') || lowerSubject.includes('csillag') || lowerSubject.includes('testimonial')) {
      matchedTemplateId = 'testimonial-layer';
    } else if (lowerSubject.includes('hamarosan') || lowerSubject.includes('countdown') || lowerSubject.includes('visszaszámlálás')) {
      matchedTemplateId = 'countdown-launch';
    } else if (lowerSubject.includes('luxus') || lowerSubject.includes('prémium') || lowerSubject.includes('luxury') || lowerSubject.includes('elegáns')) {
      matchedTemplateId = 'luxury-dark';
    } else if (lowerSubject.includes('új') || lowerSubject.includes('new') || lowerSubject.includes('megjelent') || lowerSubject.includes('bold')) {
      matchedTemplateId = 'bold-headline';
    } else {
      matchedTemplateId = 'product-callout'; // default for general promo text
    }

    // Final safety: strip all promo keyword fragments from cleanBrief so Flux generates a CLEAN background
    cleanBrief = cleanBrief
      .replace(/\b(akció|kedvezmény|leárazás|sale|promo|ajánlat|ingyenes szállítás|limitált|hamarosan|szállítás|felirat|szöveg|kiírás|badge|banner)\b/gi, '')
      .replace(/\d+%/g, '') // strip any remaining percentages
      .replace(/\s+/g, ' ')
      .trim();
  }

  return {
    cleanBrief: cleanBrief || subject,
    overlayText,
    matchedTemplateId
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export const QuickPostView: React.FC<QuickPostViewProps> = ({ activeBrandKit, auditResult, onSavePost }) => {
  // Screen state: 1=input, 2=generating, 3=result
  const [screen, setScreen] = useState<1 | 2 | 3>(1);

  // Screen 1 state
  const [subject, setSubject]         = useState('');
  const [platform, setPlatform]       = useState<'instagram' | 'facebook' | 'meta-ads'>('instagram');
  const [style, setStyle]             = useState('professional');
  const [selectedProduct, setSelectedProduct] = useState('');

  // Screen 2 state
  const [progress, setProgress]       = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Screen 3 state
  const [result, setResult]           = useState<QuickPostResult | null>(null);
  const [activeVariant, setActiveVariant] = useState(0);
  const [editCaption, setEditCaption] = useState('');
  const [editHashtags, setEditHashtags] = useState('');
  const [copied, setCopied]           = useState(false);
  const [saved, setSaved]             = useState(false);

  // Multi-slot image upload (replaces single productImage/preprocessedUrl)
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([]);
  const isPreprocessing = imageSlots.some(s => s.preprocessLoading || s.analysisLoading || s.upscaleLoading);
  const [isZoomed, setIsZoomed] = useState(false);

  // "Eredeti kép megtartása" toggle
  const [preserveOriginal, setPreserveOriginal] = useState(false);

  // "Termékre hangolt háttér" toggle — analyzes product image first, generates matching BG
  const [productAwareBg, setProductAwareBg] = useState(false);

  // Text-on-image warning modal state
  const [showTextWarning, setShowTextWarning] = useState(false);


  // Layer Template state
  const [selectedLayerTemplateId, setSelectedLayerTemplateId] = useState<string | null>(null);
  const [isApplyingLayerTemplate, setIsApplyingLayerTemplate] = useState(false);
  const [hoveredLayerTemplateId, setHoveredLayerTemplateId] = useState<string | null>(null);

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

  // Debug intermediate images (bg-raw, bg-harmonized)
  const [debugImages, setDebugImages] = useState<{ bgRaw: string | null; bgHarmonized: string | null } | null>(null);

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
    ctaText?: string
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
      // Compute contrast text color from current image slots analysis
      const dominantColors = imageSlots.flatMap(s => s.analysis?.dominantColors || []).map(c => c.toLowerCase());
      const lightKw = ['white', 'cream', 'beige', 'ivory', 'light', 'yellow', 'pale', 'silver', 'fehér', 'ezüst', 'sárga'];
      const darkKw  = ['black', 'navy', 'dark', 'charcoal', 'deep', 'midnight', 'fekete', 'sötét', 'tengerész'];
      const hasLight = dominantColors.some(c => lightKw.some(k => c.includes(k)));
      const hasDark  = dominantColors.some(c => darkKw.some(k => c.includes(k)));
      const contrastColor = hasLight && !hasDark ? '#1a1a1a' : hasDark && !hasLight ? '#ffffff' : '#1a1a1a';

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

      let patchedLayers = template.layers.map(layer => ({ ...layer }));

      if (finalOverlay) {
        // Get all text layers sorted by fontSize desc, filter out purely decorative (opacity < 0.5)
        const contentTextLayers = patchedLayers
          .map((l, i) => ({ l, i }))
          .filter(({ l }) => l.type === 'text' && (l.fontSize || 0) >= 20 && (l.opacity === undefined || l.opacity >= 0.5))
          .sort((a, b) => (b.l.fontSize || 0) - (a.l.fontSize || 0));

        if (contentTextLayers.length > 0) {
          // Replace the primary (largest) content layer with the overlay text
          const primaryIdx = contentTextLayers[0].i;
          patchedLayers[primaryIdx] = { ...patchedLayers[primaryIdx], text: finalOverlay };

          // If there's a second large text layer (>= 48px) AND overlay text has multiple parts,
          // replace it with an empty string to avoid showing the old placeholder
          if (contentTextLayers.length > 1 && (contentTextLayers[1].l.fontSize || 0) >= 48) {
            const secondaryIdx = contentTextLayers[1].i;
            // Only blank it out if it's different content from what we already set
            if (secondaryIdx !== primaryIdx) {
              patchedLayers[secondaryIdx] = { ...patchedLayers[secondaryIdx], text: '' };
            }
          }
        }
      }

      if (finalCta) {
        // Find button/CTA text layers: small text inside a rect button
        // Heuristic: text layer with fontSize < 44, containing typical CTA words
        const ctaKeywords = ['VÁSÁRL', 'RENDEL', 'MEGNÉZ', 'ÉRDEKEL', 'LETÖLT', 'FOGLAL',
                             'REGISZT', 'TOVÁBB', 'SHOP', 'BUY', 'ORDER', 'LEARN', 'FELIRATKOZ',
                             'ÉRTESÍT', 'RÉSZVÉTEL', 'FELFEDEZ'];
        const ctaLayers = patchedLayers
          .map((l, i) => ({ l, i }))
          .filter(({ l }) => l.type === 'text' && (l.fontSize || 0) < 44)
          .filter(({ l }) => {
            const t = (l.text || '').toUpperCase();
            return ctaKeywords.some(kw => t.includes(kw));
          });
        if (ctaLayers.length > 0) {
          const lastCta = ctaLayers[ctaLayers.length - 1];
          patchedLayers[lastCta.i] = { ...patchedLayers[lastCta.i], text: finalCta.toUpperCase() };
        }
      }

      const bgLayer = { type: 'image' as const, src: rawBgImage, x: 0, y: 0, width: 1080, height: 1350, opacity: 1 };
      
      const layoutJson = {
        width: 1080,
        height: 1350,
        pages: [{
          background: '#000000',
          children: [bgLayer, ...patchedLayers]
        }]
      };

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



  // Products from audit
  const products: { name: string; page_url?: string }[] = auditResult?.products || [];
  const primaryColor = activeBrandKit?.colors?.primary || '#8b5cf6';
  const brandName    = activeBrandKit?.name || 'Márka';

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
      const { cleanBrief, overlayText: parsedOverlayText, matchedTemplateId: parsedMatchedTemplateId } = parseSubject(subject, brandName, selectedProduct);
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

      // ── If there IS viewer-facing overlay text, instruct Flux to produce a CLEAN background ──
      // The overlay will carry all text — the background image must NOT have any embedded text.
      if (overlayText) {
        brief = brief + ', clean product photography background, absolutely no text, no stickers, no price tags, no numbers, no labels, no overlays, no watermarks, no badges, no typography';
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

      if (imageSlots.length >= 1) {
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
        const compositeData = await compositeResp.json();
        rawMain = compositeData.imageUrl?.startsWith('http') ? compositeData.imageUrl : `${getBackendUrl()}${compositeData.imageUrl}`;
        captionText = `${subject}\n\n${brandName} — ${style}`;
        hashtagsText = `#${brandName.replace(/\s+/g, '')} #social #marketing`;
        genModel = compositeData.generationModel || 'bfl-flux-2-flex';
        genTime = compositeData.generationTime || 0;
        // Use backend-decomposed layer text and auto-selected template
        if (compositeData.decomposedLayerText) overlayText = compositeData.decomposedLayerText;
        if (compositeData.decomposedLayerCta)  cta = compositeData.decomposedLayerCta;
        if (compositeData.selectedTemplateId)  matchedTemplateId = compositeData.selectedTemplateId;
        // Store debug intermediate images
        if (compositeData.debugImages) {
          setDebugImages(compositeData.debugImages);
        } else {
          setDebugImages(null);
        }
      } else {
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
        const rawMainUrl = data.imageUrl;
        rawMain = rawMainUrl?.startsWith('http') ? rawMainUrl : `${getBackendUrl()}${rawMainUrl}`;
        captionText = `${subject}\n\n${brandName} — ${style}`;
        hashtagsText = `#${brandName.replace(/\s+/g, '')} #social #marketing`;
        genModel = data.model || 'bfl-flux-2-flex';
        genTime = data.elapsed ? data.elapsed / 1000 : 0;
      }

      clearInterval(timerRef.current!);

      const newResult: QuickPostResult = {
        imageUrl:   rawMain,
        caption:    captionText,
        hashtags:   hashtagsText,
        platform,
        style,
        variations: [rawMain],
        rawImages:  [rawMain],
        generationModel: genModel || undefined,
        generationTime: genTime || undefined,
      };

      setResult(newResult);
      setEditCaption(captionText);
      setEditHashtags(hashtagsText);
      setActiveVariant(0);

      // Initialize layer customization
      setEditingText(overlayText || captionText);
      setEditingCta(selectedProduct ? 'Megnézem' : 'Érdekel');
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

      // Apply layer: use backend-selected template (Claude Vision), fallback to keyword matchedTemplateId
      // User can override everything manually on screen 3
      // IMPORTANT: wrapped in try-catch so template-render failure does NOT crash the generation!
      const templateToApply = matchedTemplateId || null;
      if (templateToApply) {
        setSelectedLayerTemplateId(templateToApply);
        const ctaDefault = cta || (selectedProduct ? 'MEGNÉZEM' : 'ÉRDEKEL');
        try {
          await applyTemplateToVariant(0, templateToApply, newResult, overlayText || undefined, ctaDefault);
        } catch (tmplErr: any) {
          // Template rendering failed — non-fatal, the raw image is still in newResult.
          console.error('[QuickPost] Template apply failed (non-fatal):', tmplErr?.message || tmplErr);
          setSelectedLayerTemplateId(null);
        }
      } else {
        setSelectedLayerTemplateId(null);
      }

      setProgress(100);
      setProgressLabel('✅ Kész!');

      await new Promise(r => setTimeout(r, 500));
      setScreen(3);

    } catch (err: any) {
      clearInterval(timerRef.current!);
      console.error('[QuickPost] Generation error:', err?.message || err);
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
                maxSlots={3}
                disabled={false}
                label="Képek csatolása (opcionális)"
              />

              {/* Preserve original toggle — only shown when at least 1 image uploaded */}
                {imageSlots.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                  {/* Eredeti kép megtartása toggle */}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 14px', borderRadius: 10,
                      background: preserveOriginal ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1.5px solid ${preserveOriginal ? '#8b5cf640' : 'var(--border)'}`,
                      cursor: 'pointer', transition: 'all 0.15s',
                      userSelect: 'none',
                    }}
                    onClick={() => setPreserveOriginal(v => !v)}
                  >
                    <div style={{
                      width: 38, height: 20, borderRadius: 10, flexShrink: 0,
                      background: preserveOriginal ? '#8b5cf6' : 'rgba(255,255,255,0.12)',
                      position: 'relative', transition: 'background 0.2s',
                    }}>
                      <div style={{
                        position: 'absolute', top: 3, left: preserveOriginal ? 20 : 3,
                        width: 14, height: 14, borderRadius: '50%', background: '#fff',
                        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                      }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: preserveOriginal ? '#a78bfa' : 'var(--text)' }}>
                        🔒 Eredeti kép megtartása
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {preserveOriginal
                          ? 'A termék változatlan marad — csak a háttér generálódik újra'
                          : 'Kikapcsolva — az AI szabadon értelmezi a terméket'
                        }
                      </div>
                    </div>
                  </div>

                  {/* Termékre hangolt háttér toggle — only visible when preserveOriginal is ON */}
                  {preserveOriginal && (
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 14px', borderRadius: 10,
                        background: productAwareBg ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
                        border: `1.5px solid ${productAwareBg ? '#10b98140' : 'var(--border)'}`,
                        cursor: 'pointer', transition: 'all 0.15s',
                        userSelect: 'none',
                      }}
                      onClick={() => setProductAwareBg(v => !v)}
                    >
                      <div style={{
                        width: 38, height: 20, borderRadius: 10, flexShrink: 0,
                        background: productAwareBg ? '#10b981' : 'rgba(255,255,255,0.12)',
                        position: 'relative', transition: 'background 0.2s',
                      }}>
                        <div style={{
                          position: 'absolute', top: 3, left: productAwareBg ? 20 : 3,
                          width: 14, height: 14, borderRadius: '50%', background: '#fff',
                          transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                        }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: productAwareBg ? '#34d399' : 'var(--text)' }}>
                          🎯 Termékre hangolt háttér
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {productAwareBg
                            ? 'A háttér ÉS az effektek (fény, árnyék, tónus) a termék fotójához igazodnak'
                            : 'Kikapcsolva — általános háttér generálódik'
                          }
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

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
                // Skip warning if preserveOriginal is on — user already chose safe mode
                if (hasTextSlot && !showTextWarning && !preserveOriginal) {
                  setShowTextWarning(true);
                  return;
                }
                setShowTextWarning(false);
                handleGenerate();
              }}
              disabled={!subject.trim() || isPreprocessing}
              title={
                isPreprocessing ? 'A kép feldolgozása még folyamatban van – kérlek várj...' :
                !subject.trim() ? 'Írj be egy témát a generáláshoz' :
                'Poszt generálása'
              }
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '17px 32px', borderRadius: 14, border: 'none', cursor: (subject.trim() && !isPreprocessing) ? 'pointer' : 'not-allowed',
                background: (subject.trim() && !isPreprocessing)
                  ? 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)'
                  : 'rgba(255,255,255,0.07)',
                color: (subject.trim() && !isPreprocessing) ? '#fff' : 'var(--text-muted)',
                fontSize: 15, fontWeight: 800, letterSpacing: '0.01em',
                boxShadow: (subject.trim() && !isPreprocessing) ? '0 6px 24px rgba(139,92,246,0.35)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {isPreprocessing ? (
                <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Kép feldolgozása...</>
              ) : !subject.trim() ? (
                <><Zap size={20} /> Írj be témát a generáláshoz</>
              ) : (
                <><Zap size={20} /> Poszt Generálása ⚡</>
              )}
            </button>

          </div>
        </div>
      )}

      {/* ── SCREEN 2: GENERATING ────────────────────────────────────────────── */}
      {screen === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 32px', animation: 'qp-slide-in 0.22s ease' }}>
          {/* Animated logo */}
          <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, marginBottom: 28, boxShadow: '0 0 40px rgba(139,92,246,0.4)', animation: 'qp-pulse 1.5s ease-in-out infinite' }}>
            ⚡
          </div>

          <h3 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px' }}>
            Poszt generálása...
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 36px', textAlign: 'center', maxWidth: 380 }}>
            FLUX.2 [flex] & Brand DNA alapján, ~5–15 másodperc
          </p>

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
        </div>
      )}

      {/* ── SCREEN 3: RESULT ────────────────────────────────────────────────── */}
      {screen === 3 && result && (
        <div style={{ animation: 'qp-slide-in 0.25s ease' }}>

          {/* Top bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Poszt kész!</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 6 }}>
                {PLATFORMS.find(p => p.id === result.platform)?.icon} {result.platform}
              </span>
            </div>
            <button
              onClick={handleRegenerate}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg3)',
                color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#8b5cf6'; (e.currentTarget as HTMLButtonElement).style.color = '#a78bfa'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
            >
              <RefreshCw size={13} /> Újragenerálás
            </button>
          </div>

          {/* Main layout: image + editor */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

            {/* Left: Image + post preview + variations */}
            <div>
              {/* Main image / Interactive preview canvas */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: 12,
              }}>
                <div 
                  onClick={() => setIsZoomed(true)}
                  style={{ 
                    position: 'relative', 
                    width: '300px', 
                    height: '375px', 
                    background: '#000', 
                    borderRadius: 12,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: (selectedLayerTemplateId === 'quote' || selectedLayerTemplateId === 'testimonial') ? 'center' : 'flex-end',
                    alignItems: (selectedLayerTemplateId === 'quote' || selectedLayerTemplateId === 'testimonial') ? 'center' : 'stretch',
                    border: '1.5px solid var(--border)',
                    cursor: 'zoom-in',
                  }}
                  title="Kattints a belenagyításhoz"
                >
                  {result.variations[activeVariant] ? (
                    <img 
                      src={result.variations[activeVariant]} 
                      alt="" 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'cover',
                        filter: editingBgBlur > 0 ? `blur(${editingBgBlur}px)` : 'none',
                        transition: 'filter 0.15s ease',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        zIndex: 1
                      }} 
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 32 }}>🖼️</div>
                  )}

                  {/* Hover Template Layers Preview — only when hovering a DIFFERENT template */}
                  {(() => {
                    // Only show CSS preview when HOVERING a template that is DIFFERENT from selected
                    // (the selected template is already baked into variations[activeVariant] via polotno render)
                    const activeTmplId = hoveredLayerTemplateId === 'clean'
                      ? null
                      : (hoveredLayerTemplateId && hoveredLayerTemplateId !== selectedLayerTemplateId ? hoveredLayerTemplateId : null);

                    if (!activeTmplId) return null;

                    const allTmpls = buildLayerTemplates(
                      activeBrandKit.colors.primary,
                      activeBrandKit.colors.accent,
                      activeBrandKit.typography?.fontName || 'Inter'
                    );
                    const tmpl = allTmpls.find(t => t.id === activeTmplId);
                    if (!tmpl) return null;

                    // Scale factor from 1080x1350 to 300x375
                    const scaleX = 300 / 1080;
                    const scaleY = 375 / 1350;

                    return (
                      <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none', overflow: 'hidden' }}>
                        {hoveredLayerTemplateId && hoveredLayerTemplateId !== 'clean' && (
                          <div style={{
                            position: 'absolute', top: 6, left: 6, zIndex: 20,
                            background: 'rgba(80,20,200,0.92)',
                            borderRadius: 6, padding: '3px 8px',
                            fontSize: 9, fontWeight: 800, color: '#fff',
                            display: 'flex', alignItems: 'center', gap: 4
                          }}>
                            <span>{tmpl.emoji}</span>
                            <span>ELŐNÉZET: {tmpl.name}</span>
                          </div>
                        )}
                        {tmpl.layers.map((layer, li) => {
                          const lx = Math.round(layer.x * scaleX);
                          const ly = Math.round(layer.y * scaleY);
                          const lw = Math.round(layer.width * scaleX);
                          const lh = layer.height != null ? Math.round(layer.height * scaleY) : undefined;
                          const baseStyle: React.CSSProperties = {
                            position: 'absolute',
                            left: lx, top: ly, width: lw,
                            height: lh,
                            opacity: layer.opacity ?? 1,
                            boxSizing: 'border-box',
                            pointerEvents: 'none'
                          };
                          if (layer.type === 'figure') {
                            return (
                              <div key={li} style={{
                                ...baseStyle,
                                background: layer.fill || 'transparent',
                                borderRadius: layer.subType === 'circle' ? '50%' : (layer.cornerRadius ? `${layer.cornerRadius * scaleX}px` : 0),
                                border: layer.border || 'none'
                              }} />
                            );
                          }
                          if (layer.type === 'text') {
                            return (
                              <div key={li} style={{
                                ...baseStyle,
                                fontFamily: layer.fontFamily || 'Inter',
                                fontSize: `${(layer.fontSize || 16) * scaleX}px`,
                                fontWeight: layer.fontWeight || 'normal',
                                color: layer.fill || '#ffffff',
                                textAlign: (layer.align || 'left') as any,
                                lineHeight: layer.lineHeight || 1.2,
                                textShadow: layer.textShadow || 'none',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                display: 'flex', flexDirection: 'column', justifyContent: 'flex-start'
                              }}>{layer.text}</div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    );
                  })()}


                  {/* Real-time Content Panel Overlays — only during hover of a different template */}
                  {(() => {
                    const activeTmplId = hoveredLayerTemplateId === 'clean'
                      ? null
                      : (hoveredLayerTemplateId && hoveredLayerTemplateId !== selectedLayerTemplateId ? hoveredLayerTemplateId : null);

                    if (!activeTmplId || activeTmplId === 'universal') return null;


                    const panelStyle = getPanelStyle();
                    const textStyle = getTextStyle();
                    const ctaStyle = getCtaStyle();
                    const scale = 300 / 1080;

                    if (activeTmplId === 'product') {
                      return (
                        <div style={{ ...panelStyle, borderTop: `${3 * scale}px solid ${activeBrandKit.colors.accent}`, zIndex: 11 }}>
                          <div style={{ width: `${24 * scale}px`, height: `${2 * scale}px`, background: activeBrandKit.colors.accent, marginBottom: `${6 * scale}px`, borderRadius: '1px' }} />
                          <p style={textStyle}>{editingText}</p>
                          {editingCta && (
                            <button style={ctaStyle}>{editingCta}</button>
                          )}
                        </div>
                      );
                    }

                    if (activeTmplId === 'quote') {
                      return (
                        <div style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          width: 'calc(100% - 40px)',
                          zIndex: 11,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          textAlign: 'center',
                          gap: `${10 * scale}px`,
                          color: activeBrandKit.colors.secondary,
                          pointerEvents: 'none'
                        }}>
                          <span style={{
                            fontSize: `${64 * scale}px`,
                            color: activeBrandKit.colors.accent,
                            fontFamily: "'Playfair Display', serif",
                            lineHeight: 0.1,
                            marginBottom: `${-10 * scale}px`
                          }}>“</span>
                          <p style={{ ...textStyle, fontStyle: 'italic', textAlign: 'center', color: '#fff' }}>{editingText}</p>
                          <div style={{
                            width: `${40 * scale}px`,
                            height: `${3 * scale}px`,
                            backgroundColor: activeBrandKit.colors.accent,
                            borderRadius: '2px'
                          }} />
                        </div>
                      );
                    }

                    if (activeTmplId === 'testimonial') {
                      return (
                        <div style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          width: 'calc(100% - 32px)',
                          zIndex: 11,
                          backgroundColor: activeBrandKit.colors.secondary || '#f8f8f8',
                          color: activeBrandKit.colors.primary,
                          borderRadius: `${8 * scale}px`,
                          padding: `${22 * scale}px ${18 * scale}px`,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          textAlign: 'center',
                          gap: `${8 * scale}px`,
                          boxShadow: `0 ${8 * scale}px ${24 * scale}px rgba(0,0,0,0.4)`,
                          borderTop: `${4 * scale}px solid ${activeBrandKit.colors.accent}`,
                          pointerEvents: 'none'
                        }}>
                          <div style={{ display: 'flex', gap: `${3 * scale}px`, color: activeBrandKit.colors.accent, fontSize: `${14 * scale}px` }}>
                            <span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>
                          </div>
                          <p style={{ ...textStyle, fontStyle: 'italic', textAlign: 'center', color: activeBrandKit.colors.primary }}>{editingText}</p>
                          {editingCta && (
                            <p style={{
                              fontSize: `${9 * scale}px`,
                              fontWeight: 700,
                              color: activeBrandKit.colors.accent,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}>{editingCta}</p>
                          )}
                        </div>
                      );
                    }

                    if (activeTmplId === 'list') {
                      const lines = editingText.split('\n').filter(Boolean);
                      const listTitle = lines[0] || '';
                      const listItems = lines.slice(1);

                      return (
                        <div style={{
                          ...panelStyle,
                          backgroundColor: 'transparent',
                          paddingTop: `${8 * scale}px`,
                          zIndex: 11
                        }}>
                          <h3 style={{
                            ...textStyle,
                            fontWeight: 800,
                            fontSize: `${14 * scale}px`,
                            borderBottom: `${1.5 * scale}px solid ${activeBrandKit.colors.accent}`,
                            paddingBottom: `${5 * scale}px`,
                            marginBottom: `${8 * scale}px`,
                            color: '#fff'
                          }}>{listTitle}</h3>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: `${8 * scale}px` }}>
                            {listItems.slice(0, 4).map((itemText, idx) => {
                              const cleanedText = itemText.replace(/^\d+\.\s*/, '');
                              return (
                                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: `${8 * scale}px` }}>
                                  <div style={{
                                    width: `${16 * scale}px`,
                                    height: `${16 * scale}px`,
                                    borderRadius: '50%',
                                    backgroundColor: activeBrandKit.colors.accent,
                                    color: '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: '700',
                                    fontSize: `${9 * scale}px`,
                                    flexShrink: 0
                                  }}>{idx + 1}</div>
                                  <p style={{ ...textStyle, fontSize: `${11 * scale}px`, color: '#fff' }}>{cleanedText}</p>
                                </div>
                              );
                            })}
                          </div>
                          {editingCta && (
                            <button style={ctaStyle}>{editingCta}</button>
                          )}
                        </div>
                      );
                    }

                    return null;
                  })()}

                  {/* Dynamic Background Gradient Overlay — only during hover of a different template */}
                  {(() => {
                    const activeTmplId = hoveredLayerTemplateId === 'clean'
                      ? null
                      : (hoveredLayerTemplateId && hoveredLayerTemplateId !== selectedLayerTemplateId ? hoveredLayerTemplateId : null);

                    if (activeTmplId === 'testimonial') {
                      return (
                        <div style={{
                          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                          background: `rgba(0,0,0,${editingOverlayOpacity})`,
                          pointerEvents: 'none', zIndex: 2
                        }} />
                      );
                    }
                    if (activeTmplId === 'quote') {
                      return (
                        <>
                          <div style={{
                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                            background: `linear-gradient(135deg, rgba(0,0,0,${editingOverlayOpacity * 1.2}) 0%, rgba(0,0,0,${editingOverlayOpacity * 0.6}) 60%, rgba(0,0,0,${editingOverlayOpacity}) 100%)`,
                            pointerEvents: 'none', zIndex: 2
                          }} />
                          <div style={{
                            position: 'absolute', top: 0, left: 0, bottom: 0, width: '5px',
                            backgroundColor: activeBrandKit.colors.accent,
                            zIndex: 4, pointerEvents: 'none'
                          }} />
                        </>
                      );
                    }
                    return (
                      <div style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        background: `linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,${editingOverlayOpacity}) 100%)`,
                        pointerEvents: 'none', zIndex: 2
                      }} />
                    );
                  })()}

                  {/* Real-time Logo Watermark Overlay */}
                  <div className="mock-watermark" style={{
                    position: 'absolute',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    background: editingLogoVariant === 'light' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.75)',
                    color: editingLogoVariant === 'light' ? '#fff' : activeBrandKit.colors.primary,
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    zIndex: 12,
                    transform: `scale(${editingLogoSize})`,
                    transformOrigin: editingLogoPosition.replace('-', ' '),
                    transition: 'all 0.15s ease',
                    ...(editingLogoPosition === 'top-right' ? { top: 12, right: 12 } :
                       editingLogoPosition === 'bottom-left' ? { bottom: 12, left: 12 } :
                       editingLogoPosition === 'bottom-right' ? { bottom: 12, right: 12 } :
                       { top: 12, left: 12 })
                  }}>
                    {(() => {
                      const brandNameLower = (activeBrandKit.name || '').toLowerCase();
                      const isCup = activeBrandKit.logoUrl === 'coffee-cup-minimal' || 
                                    brandNameLower.includes('kávé') || 
                                    brandNameLower.includes('coffee') || 
                                    brandNameLower.includes('cafe') || 
                                    brandNameLower.includes('latte');
                      return isCup ? (
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                          <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
                          <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      );
                    })()}
                    <span>{activeBrandKit.name || 'Márka'}</span>
                  </div>

                  {/* Variation badge only — platform removed from image */}
                  {result.variations.length > 1 && (
                    <div style={{
                      position: 'absolute', top: 10, right: 10,
                      background: 'rgba(0,0,0,0.72)', borderRadius: 7,
                      padding: '4px 10px', fontSize: 10, fontWeight: 700, color: '#a78bfa',
                      zIndex: 13
                    }}>
                      Variáció {activeVariant + 1}/{result.variations.length}
                    </div>
                  )}

                  {/* Zoom overlay button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsZoomed(true);
                    }}
                    style={{
                      position: 'absolute',
                      bottom: 10,
                      right: 10,
                      background: 'rgba(0,0,0,0.75)',
                      backdropFilter: 'blur(4px)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: 8,
                      width: 28,
                      height: 28,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 14,
                      color: '#a78bfa',
                      transition: 'all 0.15s ease',
                    }}
                    title="Nagyítás"
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(139, 92, 246, 0.9)';
                      e.currentTarget.style.color = '#fff';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(0,0,0,0.75)';
                      e.currentTarget.style.color = '#a78bfa';
                    }}
                  >
                    🔍
                  </button>
                </div>
              </div>

              {/* Debug: Intermediate BG Images */}
              {debugImages && (debugImages.bgRaw || debugImages.bgHarmonized) && (
                <div style={{
                  background: 'rgba(139,92,246,0.06)',
                  border: '1px solid rgba(139,92,246,0.2)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  marginBottom: 10,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', marginBottom: 8, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                    🔬 Generálási lépések (debug)
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {debugImages.bgRaw && (
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>BG #1 — nyers FLUX</div>
                        <a href={debugImages.bgRaw} target="_blank" rel="noreferrer">
                          <img
                            src={debugImages.bgRaw}
                            alt="BG raw"
                            style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)', display: 'block', cursor: 'pointer' }}
                          />
                        </a>
                      </div>
                    )}
                    {debugImages.bgHarmonized && (
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>BG #2 — harmonizált</div>
                        <a href={debugImages.bgHarmonized} target="_blank" rel="noreferrer">
                          <img
                            src={debugImages.bgHarmonized}
                            alt="BG harmonized"
                            style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)', display: 'block', cursor: 'pointer' }}
                          />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Instagram-like post preview — caption below image */}
              <div style={{
                background: 'var(--bg3, rgba(255,255,255,0.03))',
                border: '1px solid var(--border)',
                borderRadius: 14,
                overflow: 'hidden',
                marginBottom: 12,
              }}>
                {/* Post header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${activeBrandKit.colors.primary}, ${activeBrandKit.colors.accent || '#8b5cf6'})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0
                  }}>
                    {(activeBrandKit.name || 'B')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{activeBrandKit.name || 'Márka'}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {PLATFORMS.find(p => p.id === result.platform)?.icon}
                      <span style={{ textTransform: 'capitalize' }}>{result.platform}</span>
                    </div>
                  </div>
                </div>
                {/* Caption text */}
                <div style={{ padding: '0 12px 10px', fontSize: 12, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  <span style={{ fontWeight: 700 }}>{activeBrandKit.name || 'Márka'} </span>
                  {editCaption}
                </div>
                {/* Hashtags */}
                {editHashtags && (
                  <div style={{ padding: '0 12px 10px', fontSize: 11.5, color: '#60a5fa', lineHeight: 1.5, wordBreak: 'break-word' }}>
                    {editHashtags}
                  </div>
                )}
                {/* Generation info mini */}
                {result.generationModel && (
                  <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                    <span>⚡ {result.generationModel}</span>
                    {result.generationTime && <span>· {result.generationTime.toFixed(1)}s</span>}
                  </div>
                )}
              </div>

              {/* 3 variation thumbnails */}
              {result.variations.length > 1 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {result.variations.map((url, i) => (
                    <div
                      key={i}
                      onClick={async () => {
                        setActiveVariant(i);
                        if (selectedLayerTemplateId) {
                          await applyTemplateToVariant(i, selectedLayerTemplateId);
                        }
                      }}
                      style={{
                        aspectRatio: '4/5', borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                        border: `2.5px solid ${activeVariant === i ? '#8b5cf6' : 'rgba(255,255,255,0.08)'}`,
                        background: 'rgba(255,255,255,0.04)', transition: 'border-color 0.15s',
                        position: 'relative',
                      }}
                    >
                      <img src={url} alt={`Variáció ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: activeVariant === i ? 1 : 0.65 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <div style={{ position: 'absolute', bottom: 4, right: 5, fontSize: 9, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '1px 5px' }}>V{i + 1}</div>
                      {activeVariant === i && (
                        <div style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Check size={9} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Layer Template Picker */}
              {(() => {
                // Smart contrast color: pick text color based on dominant image colors from analysis
                const dominantColors = imageSlots.flatMap(s => s.analysis?.dominantColors || []).map(c => c.toLowerCase());
                const lightKeywords = ['white', 'cream', 'beige', 'ivory', 'light', 'yellow', 'pale', 'silver', 'fehér', 'ezüst', 'sárga'];
                const darkKeywords  = ['black', 'navy', 'dark', 'charcoal', 'deep', 'midnight', 'fekete', 'sötét', 'tengerész'];
                const hasLight = dominantColors.some(c => lightKeywords.some(k => c.includes(k)));
                const hasDark  = dominantColors.some(c => darkKeywords.some(k => c.includes(k)));
                // If first (most dominant) color is light → dark text; if dark → light text; mixed → prefer readable dark
                const contrastTextColor = hasLight && !hasDark ? '#1a1a1a'
                  : hasDark && !hasLight ? '#ffffff'
                  : '#1a1a1a'; // default to dark for white-dominant (like paint bucket)

                const layerTemplates = buildLayerTemplates(
                  activeBrandKit.colors.primary,
                  activeBrandKit.colors.accent,
                  activeBrandKit.typography?.fontName || 'Inter',
                  contrastTextColor
                );
                return (
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 20, paddingTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Layers size={13} style={{ color: '#8b5cf6' }} />
                        Layer Sablon Alkalmazása
                      </label>
                      {isApplyingLayerTemplate && (
                        <span style={{ fontSize: 11, color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Loader size={11} className="qp-spin" /> Renderelés...
                        </span>
                      )}
                    </div>
                    
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 8,
                      maxHeight: 280,
                      overflowY: 'auto',
                      paddingRight: 4
                    }}>
                      {/* Clean (No Layer) Option */}
                      <button
                        onClick={() => !isApplyingLayerTemplate && handleApplyLayerTemplate(null)}
                        onMouseEnter={() => setHoveredLayerTemplateId('clean')}
                        onMouseLeave={() => setHoveredLayerTemplateId(null)}
                        disabled={isApplyingLayerTemplate}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          padding: '10px',
                          borderRadius: 10,
                          border: `2px solid ${
                            hoveredLayerTemplateId === 'clean' ? '#a78bfa'
                            : selectedLayerTemplateId === null ? '#8b5cf6'
                            : 'var(--border)'
                          }`,
                          background: hoveredLayerTemplateId === 'clean'
                            ? 'rgba(167,139,250,0.18)'
                            : selectedLayerTemplateId === null
                            ? 'rgba(139,92,246,0.12)'
                            : 'var(--bg3)',
                          color: selectedLayerTemplateId === null ? '#a78bfa' : 'var(--text-muted)',
                          cursor: isApplyingLayerTemplate ? 'not-allowed' : 'pointer',
                          transition: 'all 0.12s ease',
                          textAlign: 'center',
                          boxShadow: hoveredLayerTemplateId === 'clean' ? '0 0 0 3px rgba(167,139,250,0.2)' : 'none'
                        }}
                      >
                        <span style={{ fontSize: 18 }}>🖼️</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, lineHeight: 1.2 }}>Nincs layer</span>
                        <span style={{ fontSize: 9, opacity: 0.7 }}>Tiszta kép</span>
                      </button>

                      {layerTemplates.map(tmpl => (
                        <button
                          key={tmpl.id}
                          onClick={() => !isApplyingLayerTemplate && handleApplyLayerTemplate(tmpl.id)}
                          onMouseEnter={() => setHoveredLayerTemplateId(tmpl.id)}
                          onMouseLeave={() => setHoveredLayerTemplateId(null)}
                          disabled={isApplyingLayerTemplate}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            padding: '10px',
                            borderRadius: 10,
                            border: `2px solid ${
                              hoveredLayerTemplateId === tmpl.id ? '#a78bfa'
                              : selectedLayerTemplateId === tmpl.id ? '#8b5cf6'
                              : 'var(--border)'
                            }`,
                            background: hoveredLayerTemplateId === tmpl.id
                              ? 'rgba(167,139,250,0.18)'
                              : selectedLayerTemplateId === tmpl.id
                              ? 'rgba(139,92,246,0.12)'
                              : 'var(--bg3)',
                            color: selectedLayerTemplateId === tmpl.id ? '#a78bfa' : 'var(--text-muted)',
                            cursor: isApplyingLayerTemplate ? 'not-allowed' : 'pointer',
                            transition: 'all 0.12s ease',
                            textAlign: 'center',
                            position: 'relative',
                            boxShadow: hoveredLayerTemplateId === tmpl.id ? '0 0 0 3px rgba(167,139,250,0.2)' : 'none'
                          }}
                        >
                          {isApplyingLayerTemplate && selectedLayerTemplateId === tmpl.id && (
                            <div style={{
                              position: 'absolute', inset: 0, background: 'rgba(139,92,246,0.15)',
                              borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                              <Loader size={16} className="qp-spin" style={{ color: '#8b5cf6' }} />
                            </div>
                          )}
                          <span style={{ fontSize: 18 }}>{tmpl.emoji}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, lineHeight: 1.2 }}>{tmpl.name}</span>
                          <span style={{ fontSize: 9, opacity: 0.7 }}>{tmpl.id}</span>
                        </button>
                      ))}
                    </div>
                    <p style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 8 }}>
                      Hover = előnézet a kép felett · Kattintás = renderelés
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* Right: Caption + Hashtags + Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Caption editor */}
              <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--bg3, rgba(255,255,255,0.03))', border: '1.5px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Caption</label>
                  <span style={{ fontSize: 10, color: editCaption.length > 2000 ? '#ef4444' : 'var(--text-muted)' }}>
                    {editCaption.length} / 2 200
                  </span>
                </div>
                <textarea
                  value={editCaption}
                  onChange={e => setEditCaption(e.target.value)}
                  rows={7}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '10px 12px', borderRadius: 9,
                    border: '1.5px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text)', outline: 'none', fontSize: 12.5,
                    fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.55,
                  }}
                />
              </div>

              {/* Hashtag editor */}
              <div style={{ padding: '14px 18px', borderRadius: 14, background: 'var(--bg3, rgba(255,255,255,0.03))', border: '1.5px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    # Hashtag-ek
                  </label>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {editHashtags.split(/\s+/).filter(t => t.startsWith('#')).length} db
                  </span>
                </div>
                <textarea
                  value={editHashtags}
                  onChange={e => setEditHashtags(e.target.value)}
                  rows={3}
                  placeholder="#brand #termék #akció"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '9px 12px', borderRadius: 9,
                    border: '1.5px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text)', outline: 'none', fontSize: 12,
                    fontFamily: 'monospace', resize: 'vertical',
                  }}
                />
              </div>

              {/* Layer Editor Controls (Réteg Szerkesztő) */}
              <div className="layer-editor-panel" style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--bg3, rgba(255,255,255,0.03))', border: '1.5px solid var(--border)' }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, display: 'block' }}>Rétegek Testreszabása (Layer Editor):</label>
                
                {/* 2x2 grid to fit perfectly */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  
                  {/* Column 1: Layout & Position */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 2 }}>Elrendezés & Pozíció</span>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Kártya Horgony:</label>
                      <select value={editingPanelPosition} onChange={e => setEditingPanelPosition(e.target.value as any)} style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 11 }}>
                        <option value="relative">Folyamatos (Relative)</option>
                        <option value="top">Fent (Top)</option>
                        <option value="center">Középen (Center)</option>
                        <option value="bottom">Lent (Bottom)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Vízszintes (X): <span style={{ color: '#8b5cf6', float: 'right' }}>{editingTextXOffset}px</span></label>
                      <input type="range" min="-150" max="150" step="5" value={editingTextXOffset} onChange={e => setEditingTextXOffset(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Függőleges (Y): <span style={{ color: '#8b5cf6', float: 'right' }}>{editingTextYOffset}px</span></label>
                      <input type="range" min="-300" max="300" step="5" value={editingTextYOffset} onChange={e => setEditingTextYOffset(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                    </div>
                  </div>

                  {/* Column 2: Background & Overlays */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 2 }}>Kártya & Háttér</span>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Kártya Háttér:</label>
                      <select value={editingPanelBgColor} onChange={e => setEditingPanelBgColor(e.target.value as any)} style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 11 }}>
                        <option value="default">Alapértelmezett</option>
                        <option value="primary">Elsődleges szín</option>
                        <option value="secondary">Másodlagos szín</option>
                        <option value="accent">Kiemelő szín</option>
                        <option value="translucent-dark">Áttetsző sötét</option>
                        <option value="translucent-light">Áttetsző világos</option>
                        <option value="none">Nincs (Átlátszó)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Belső Margó: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingPanelPadding}px</span></label>
                      <input type="range" min="20" max="100" step="5" value={editingPanelPadding} onChange={e => setEditingPanelPadding(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Kártya Lekerekítés: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingPanelRadius}px</span></label>
                      <input type="range" min="0" max="40" step="2" value={editingPanelRadius} onChange={e => setEditingPanelRadius(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Háttér Elmosás: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingBgBlur}px</span></label>
                      <input type="range" min="0" max="15" step="1" value={editingBgBlur} onChange={e => setEditingBgBlur(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Sötétítő réteg: <span style={{ color: '#8b5cf6', float: 'right' }}>{Math.round(editingOverlayOpacity*100)}%</span></label>
                      <input type="range" min="0.1" max="0.9" step="0.05" value={editingOverlayOpacity} onChange={e => setEditingOverlayOpacity(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                    </div>
                  </div>

                  {/* Column 3: Typography & Text */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 2 }}>Szöveg & Betű</span>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Overlay Szövege:</label>
                      <textarea
                        value={editingText}
                        onChange={e => setEditingText(e.target.value)}
                        rows={2}
                        placeholder="Overlay felirat szövege"
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          padding: '5px 7px', borderRadius: 6,
                          border: '1.5px solid var(--border)', background: 'var(--bg)',
                          color: 'var(--text)', outline: 'none', fontSize: 11,
                          fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.4,
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Szöveg Igazítás:</label>
                      <select value={editingTextAlignment} onChange={e => setEditingTextAlignment(e.target.value as any)} style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 11 }}>
                        <option value="left">Balra</option>
                        <option value="center">Középre</option>
                        <option value="right">Jobbra</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Betű Vastagság:</label>
                      <select value={editingFontWeight} onChange={e => setEditingFontWeight(e.target.value)} style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 11 }}>
                        <option value="normal">Normal</option>
                        <option value="600">Semi-Bold</option>
                        <option value="700">Bold</option>
                        <option value="800">Extra-Bold</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Szöveg Színe:</label>
                      <select value={editingTextColor} onChange={e => setEditingTextColor(e.target.value as any)} style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 11 }}>
                        <option value="default">Alapértelmezett</option>
                        <option value="primary">Elsődleges</option>
                        <option value="secondary">Másodlagos</option>
                        <option value="accent">Kiemelő</option>
                        <option value="white">Fehér</option>
                        <option value="black">Fekete</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Betűméret: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingFontSize}px</span></label>
                      <input type="range" min="18" max="64" step="2" value={editingFontSize} onChange={e => setEditingFontSize(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                    </div>
                  </div>

                  {/* Column 4: CTA Button & Logo */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 2 }}>CTA Gomb & Logó</span>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>CTA Gomb Szövege:</label>
                      <input type="text" value={editingCta} onChange={e => setEditingCta(e.target.value)} style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 11 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Gomb Háttér:</label>
                      <select value={editingCtaBgColor} onChange={e => setEditingCtaBgColor(e.target.value as any)} style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 11 }}>
                        <option value="default">Alapértelmezett</option>
                        <option value="primary">Elsődleges</option>
                        <option value="secondary">Másodlagos</option>
                        <option value="accent">Kiemelő</option>
                        <option value="white">Fehér</option>
                        <option value="black">Fekete</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Gomb Betűméret: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingCtaFontSize}px</span></label>
                      <input type="range" min="12" max="36" step="1" value={editingCtaFontSize} onChange={e => setEditingCtaFontSize(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Gomb Margó Y: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingCtaYOffset}px</span></label>
                      <input type="range" min="-50" max="150" step="5" value={editingCtaYOffset} onChange={e => setEditingCtaYOffset(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Gomb Lekerekítés: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingCtaRadius}px</span></label>
                      <input type="range" min="0" max="24" step="2" value={editingCtaRadius} onChange={e => setEditingCtaRadius(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Logó Méret: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingLogoSize}x</span></label>
                      <input type="range" min="0.6" max="1.6" step="0.1" value={editingLogoSize} onChange={e => setEditingLogoSize(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <div>
                        <label style={{ fontSize: 8.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Logó Helye:</label>
                        <select value={editingLogoPosition} onChange={e => setEditingLogoPosition(e.target.value as any)} style={{ width: '100%', padding: '3px 5px', borderRadius: 4, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 9.5 }}>
                          <option value="top-left">Bal Fent</option>
                          <option value="top-right">Jobb Fent</option>
                          <option value="bottom-left">Bal Lent</option>
                          <option value="bottom-right">Jobb Lent</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 8.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Logó Szín:</label>
                        <select value={editingLogoVariant} onChange={e => setEditingLogoVariant(e.target.value as any)} style={{ width: '100%', padding: '3px 5px', borderRadius: 4, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 9.5 }}>
                          <option value="light">Világos</option>
                          <option value="dark">Sötét</option>
                        </select>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Quick actions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {/* Re-render */}
                <button
                  onClick={handleSavePostDetails}
                  disabled={savingEdit || isApplyingLayerTemplate}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    padding: '12px', borderRadius: 11, cursor: (savingEdit || isApplyingLayerTemplate) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12.5,
                    border: '1.5px solid #8b5cf6', background: 'rgba(139,92,246,0.1)',
                    color: '#c4b5fd', transition: 'all 0.15s',
                    gridColumn: '1 / -1',
                  }}
                >
                  {savingEdit ? <Loader size={14} className="qp-spin" /> : <RefreshCw size={14} />}
                  {savingEdit ? 'Kép Újrarenderelése...' : 'Kép Újrarenderelése (Mentés & Frissítés)'}
                </button>

                {/* Copy */}
                <button
                  onClick={handleCopy}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    padding: '12px', borderRadius: 11, cursor: 'pointer', fontWeight: 700, fontSize: 12.5,
                    border: `1.5px solid ${copied ? '#10b981' : 'var(--border)'}`,
                    background: copied ? 'rgba(16,185,129,0.12)' : 'var(--bg3)',
                    color: copied ? '#10b981' : 'var(--text-muted)', transition: 'all 0.15s',
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Másolva!' : 'Szöveg másolása'}
                </button>

                {/* Download */}
                <button
                  onClick={handleDownload}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    padding: '12px', borderRadius: 11, cursor: 'pointer', fontWeight: 700, fontSize: 12.5,
                    border: '1.5px solid var(--border)', background: 'var(--bg3)',
                    color: 'var(--text-muted)', transition: 'all 0.15s',
                  }}
                >
                  <Download size={14} /> Kép letöltése
                </button>

                {/* Save to calendar */}
                <button
                  onClick={handleSave}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    padding: '12px', borderRadius: 11, cursor: 'pointer', fontWeight: 700, fontSize: 12.5,
                    border: `1.5px solid ${saved ? '#8b5cf6' : 'var(--border)'}`,
                    background: saved ? 'rgba(139,92,246,0.12)' : 'var(--bg3)',
                    color: saved ? '#a78bfa' : 'var(--text-muted)', transition: 'all 0.15s',
                    gridColumn: '1 / -1',
                  }}
                >
                  <Bookmark size={14} /> {saved ? '✓ Mentve a Naptárba' : 'Mentés az Éles Naptárba'}
                </button>
              </div>

              {/* Style badge */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
                <span style={{ fontSize: 10.5, padding: '4px 10px', borderRadius: 6, background: `${primaryColor}18`, color: primaryColor, fontWeight: 700, border: `1px solid ${primaryColor}30` }}>
                  {STYLES.find(s => s.id === result.style)?.label || result.style}
                </span>
                <span style={{ fontSize: 10.5, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.08)' }}>
                  Brand DNA ✓
                </span>
                <span style={{ fontSize: 10.5, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.08)' }}>
                  FLUX.2 [flex]
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {isZoomed && result && createPortal(
        <div 
          onClick={() => setIsZoomed(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(5, 3, 12, 0.95)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            animation: 'qp-fade-in 0.2s ease',
          }}
        >
          {/* Close button */}
          <button
            onClick={() => setIsZoomed(false)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1.5px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold',
              transition: 'all 0.15s ease',
              zIndex: 10005,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(139, 92, 246, 0.8)';
              e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.9)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            }}
          >
            ✕
          </button>

          {/* Main Zoom Image Container */}
          <div 
            style={{
              width: '100%',
              maxWidth: '900px',
              height: '80vh',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              position: 'relative',
            }}
            onClick={e => e.stopPropagation()}
          >
            <PanZoomImage
              src={result.variations[activeVariant]}
              alt="Nagyított kép"
              isZoomed={true}
              onToggleZoom={() => setIsZoomed(false)}
            />
            <div style={{
              textAlign: 'center',
              color: '#a78bfa',
              fontSize: '12px',
              fontWeight: 600,
              marginTop: '12px',
              pointerEvents: 'none',
              textShadow: '0 2px 4px rgba(0,0,0,0.5)',
            }}>
              Görgess a nagyításhoz • Húzd a mozgatáshoz • Kattints a képbe a bezáráshoz
            </div>
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
