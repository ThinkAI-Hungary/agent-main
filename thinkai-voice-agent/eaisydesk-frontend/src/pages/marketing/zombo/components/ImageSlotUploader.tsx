import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { fixImageUrl, getBackendUrl } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImageChangeabilityRules {
  canChangeBackground: boolean;
  canChangeColors: boolean;
  canChangeShape: boolean;
  canChangeTexture: boolean;
  mustPreserveExactly: string[];
  allowedModifications: string[];
}

// ─── LightingAnalysis — Full physics-based analysis (9 blocks) ────────────────
// Filled by Claude Vision during /api/image/analyze when productAwareBg=true.
// All values are directly usable by FLUX prompt builder and Sharp compositor.
export interface LightingAnalysis {
  // BLOKK 1: Fényforrás fizika
  lightSource: {
    type: 'spot' | 'area' | 'ambient_only' | 'three_point' | 'mixed' | 'backlit';
    directionAngle: number;        // theta: 90=overhead, 45=side, 30=dramatic
    directionLabel: 'top' | 'top-left' | 'top-right' | 'left' | 'right' | 'back' | 'front';
    xPercent: number;              // 0=left 50=center 100=right
    yPercent: number;              // 0=top (ceiling) 100=bottom
    temperatureK: number;          // 2700=bulb, 3200=tungsten, 5500=daylight, 6500=cool
    temperatureLabel: 'warm tungsten' | 'neutral white' | 'cool daylight' | 'very cool';
    colorCastRgb: [number, number, number]; // RGB shift on white surface
    intensity: 'hard' | 'medium' | 'soft';
    sourceSizeLabel: 'point' | 'small_spot' | 'large_area' | 'diffuse';
    isThreePoint: boolean;
    keyLightIntensity: number;     // 0-100
    fillLightIntensity: number;    // 0-100
    rimLightIntensity: number;     // 0-100
    fillRatio: number;             // fill/key ratio e.g. 0.33
    hasVolumetricLight: boolean;   // Tyndall dust/fog effect
    hasMultipleSourcesIBL: boolean;
  };

  // BLOKK 2: Árnyék fizika
  shadow: {
    hasDropShadow: boolean;        // false if theta >= 85°
    dropDirection: 'none' | 'front' | 'right' | 'left' | 'back' | 'front-right' | 'front-left';
    dropLengthRatio: number;       // L/H = 1/tan(theta)
    dropLengthPx: number;          // obj_height * dropLengthRatio
    dropOffsetX: number;           // signed px, positive=right
    dropOffsetY: number;           // signed px, positive=down
    dropOpacity: number;           // 0.0-1.0
    dropBlurPx: number;            // penumbra blur
    dropWidthMultiplier: number;   // shadow width vs object width
    contactShadow: {
      widthMultiplier: number;     // obj_W * X, typically 0.68
      heightMultiplier: number;    // obj_H * X, typically 0.04
      opacity: number;             // 0.80-0.95
      blurPx: number;              // 2-5px
    };
    aoHalo: {
      widthMultiplier: number;     // obj_W * X, typically 0.95
      heightMultiplier: number;    // obj_H * X, typically 0.14
      opacity: number;             // 0.35-0.55
      blurPx: number;              // 15-30px
    };
    penumbraWidth: 'none' | 'narrow' | 'medium' | 'wide';
    umbraDarkness: number;         // 0-100
    formShadowPresent: boolean;
    formShadowSide: 'left' | 'right' | 'none';
  };

  // BLOKK 3: Anyag (PBR + SSS + Fresnel)
  material: {
    roughness: number;             // 0.0=mirror 1.0=matte
    metallic: number;              // 0.0=plastic 1.0=metal
    ior: number;                   // 1.0=air 1.5=plastic 2.5=metal
    specularIntensity: number;     // 0.0-1.0
    albedoRgb: [number, number, number];
    hasSSS: boolean;
    sssStrength: 'none' | 'weak' | 'medium' | 'strong';
    sssColorShift: 'warm' | 'neutral' | 'none';
    fresnelEdgeGlow: boolean;
    fresnelIntensity: 'subtle' | 'medium' | 'strong';
    materialType: 'white_plastic' | 'colored_plastic' | 'glossy_plastic' | 'metal_matte' | 'metal_glossy' | 'glass' | 'paper_label' | 'fabric' | 'wood' | 'other';
    specular: {
      zoneTopPct: number;          // 0-25 (lid/top zone %)
      widthMultiplier: number;     // obj_W * X
      opacity: number;             // 0.0-0.50
      blurPx: number;              // 3-8px
      hasSharpGlint: boolean;
    };
  };

  // BLOKK 4: Szín és tinting
  colorThermal: {
    ambientTintRgb: [number, number, number];
    ambientTintOpacity: number;    // 0.0-0.25
    ambientDarkness: number;       // 0-100
    hasColorBleeding: boolean;
    bleedingSourceColor: [number, number, number] | null;
    bleedingOpacity: number;       // 0.0-0.15
    simultaneousContrastCorrection: boolean;
    bgDominantColor: [number, number, number];
    sceneDynamicRange: 'low' | 'medium' | 'high';
  };

  // BLOKK 5: Compositing rétegek
  compositing: {
    rimDarkening: {
      side: 'left' | 'right' | 'none';
      widthMultiplier: number;
      opacity: number;
      blurPx: number;
    };
    formShadowGradient: {
      enabled: boolean;
      direction: 'top-to-bottom' | 'side';
      topBrightness: number;       // 0.8-1.0
      bottomBrightness: number;    // 0.2-0.5
      opacity: number;             // 0.15-0.40
    };
    rimLight: {
      side: 'left' | 'right' | 'top' | 'none';
      widthMultiplier: number;
      opacity: number;
      blurPx: number;
    };
    lightWrap: {
      bgBlurPx: number;            // 50-80px
      expandPx: number;            // 15-30px
      opacity: number;             // 0.08-0.28
    };
    tableReflection: {
      enabled: boolean;
      heightMultiplier: number;
      opacity: number;
      blurPx: number;
      surfaceType: 'metal' | 'lacquered_wood' | 'matte_wood' | 'glass' | 'concrete';
    };
    overallLayerCount: number;     // 6-12
  };

  // BLOKK 6: Elhelyezés és kompozíció
  placement: {
    cameraAngle: 'eye-level' | 'slightly-above' | 'low-angle' | 'bird-eye';
    cameraFOV: 'wide' | 'normal' | 'telephoto';
    perspectiveDistortion: 'none' | 'slight' | 'strong';
    productTopYPct: number;        // 35-45 optimal
    productBottomYPct: number;     // 65-80 optimal
    surfaceYPct: number;           // table top edge
    headroomPct: number;           // air above product
    tablespacePct: number;         // table below product
    productCenterXPct: number;     // 50=center 33=left-third
    compositionStyle: 'centered' | 'thirds' | 'asymmetric';
    productScalePct: number;       // product height as % of frame
  };

  // BLOKK 7: FLUX prompt generálás
  prompts: {
    bgLightingPrompt: string;      // FLUX BG prompt suffix
    bgNegativePrompt: string;      // FLUX negative
    materialPromptSuffix: string;  // material description
    volumetricLightPrompt: string; // if hasVolumetricLight
    sssEdgePrompt: string;         // if hasSSS
    fresnelPrompt: string;         // if fresnelEdgeGlow
    threePointPrompt: string;      // if isThreePoint
    compositionPrompt: string;     // placement instructions
    fullBgPrompt: string;          // ready-to-use combined BG prompt
  };

  // BLOKK 8: Checkup validálás
  checkup: {
    expectedShadowBehavior: string;
    expectedSpecularZone: string;
    expectedGradient: string;
    expectedAmbientTint: string;
    activeRisks: Array<{
      riskId: string;
      description: string;
      checkPrompt: string;
      severity: 'critical' | 'major' | 'minor';
      autoFixable: boolean;
    }>;
    shadowPhysicsMinScore: number; // 0-25
    integrationMinScore: number;   // 0-25
    contactShadowMinScore: number; // 0-20
    specularMinScore: number;      // 0-15
    placementMinScore: number;     // 0-15
    totalMinScore: number;         // min 70
    criticalFailConditions: string[];
  };

  // BLOKK 9: Meta
  meta: {
    analysisVersion: string;       // '2.0'
    analysisTimestamp: string;
    claudeConfidence: number;      // 0.0-1.0
    bookChaptersUsed: string[];
    lightingScenario: 'overhead_spot' | 'side_45' | 'side_30_dramatic' | 'three_point' | 'backlit' | 'diffuse_ambient' | 'mixed_complex';
  };
}

export interface ImageAnalysisResult {
  imageType: 'product' | 'model' | 'scene' | 'logo' | 'lifestyle' | 'mixed';
  subject: string;
  altText: string;
  dominantColors: string[];
  backgroundBrightness?: 'dark' | 'light' | 'mixed';
  /** Where the main subject sits in the frame */
  subjectPosition?: 'left' | 'right' | 'center' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'full';
  /** Where there is clear/empty space suitable for text overlay */
  negativeSpaceZone?: 'left' | 'right' | 'top' | 'bottom' | 'none';
  changeabilityRules: ImageChangeabilityRules;
  fluxPromptSuffix: string;
  fluxNegativeSuffix: string;
  compositeRole: 'primary' | 'secondary' | 'background';
  confidence: number;
  locked: boolean;
  hasText?: boolean;
  extractedText?: string;
  textPlacement?: string;
  textLegibility?: 'clear' | 'blurry' | 'illegible';
  lightingAnalysis?: LightingAnalysis; // physics-based lighting data (productAwareBg mode)
}

export interface ImageSlot {
  id: string;
  rawBase64: string;
  fileName: string;
  originalUrl: string;
  preprocessedUrl: string | null;
  upscaledUrl?: string | null;
  upscaleLoading?: boolean;
  suggestUpscale?: boolean;  // true = auto-upscale was recommended but NOT started
  analysis: ImageAnalysisResult | null;
  analysisLoading: boolean;
  preprocessLoading: boolean;
  role: 'product' | 'model' | 'background' | 'auto';
  userEditedDescription: string;
  alternativeTextDescription?: string;
  locked: boolean;
  isDefault?: boolean;
  error: string | null;
}

export function createEmptySlot(): ImageSlot {
  return {
    id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    rawBase64: '',
    fileName: '',
    originalUrl: '',
    preprocessedUrl: null,
    upscaledUrl: null,
    upscaleLoading: false,
    suggestUpscale: false,
    analysis: null,
    analysisLoading: false,
    preprocessLoading: false,
    role: 'auto',
    userEditedDescription: '',
    alternativeTextDescription: '',
    locked: false,
    isDefault: false,
    error: null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IMAGE_TYPE_LABELS: Record<string, string> = {
  product: '📦 Termék',
  model: '👤 Modell',
  scene: '🏙️ Jelenet',
  logo: '🔷 Logó',
  lifestyle: '✨ Lifestyle',
  mixed: '🎭 Vegyes',
};

const IMAGE_TYPE_COLORS: Record<string, string> = {
  product: '#8b5cf6',
  model: '#3b82f6',
  scene: '#22c55e',
  logo: '#f59e0b',
  lifestyle: '#ec4899',
  mixed: '#6366f1',
};

const ROLE_LABELS: Record<string, string> = {
  auto: 'Automatikus',
  product: '📦 Termék (rögzített)',
  model: '👤 Modell/Kontextus',
  background: '🏙️ Háttér',
};

// ─── Pan & Zoom Image Component ──────────────────────────────────────────────

interface PanZoomImageProps {
  src: string;
  alt: string;
  isZoomed: boolean;
  onToggleZoom: () => void;
}

export function PanZoomImage({ src, alt, isZoomed, onToggleZoom }: PanZoomImageProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const mouseStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset scale and offset if we exit zoom mode
  React.useEffect(() => {
    if (!isZoomed) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
    } else {
      setScale(2); // default zoom level when entering zoom mode
    }
  }, [isZoomed]);

  // Non-passive wheel event listener to guarantee e.preventDefault() works
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelRaw = (e: WheelEvent) => {
      if (!isZoomed) return;
      e.preventDefault();
      const zoomFactor = 0.15;
      setScale(prev => {
        let newScale = prev + (e.deltaY < 0 ? zoomFactor : -zoomFactor);
        newScale = Math.max(1, Math.min(8, newScale)); // limit between 1x and 8x
        return newScale;
      });
    };

    container.addEventListener('wheel', handleWheelRaw, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheelRaw);
    };
  }, [isZoomed]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    mouseStart.current = { x: e.clientX, y: e.clientY };
    if (!isZoomed) return;
    setIsDragging(true);
    dragStart.current = { x: offset.x, y: offset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !isZoomed) return;
    e.preventDefault();
    const dx = e.clientX - mouseStart.current.x;
    const dy = e.clientY - mouseStart.current.y;
    setOffset({
      x: dragStart.current.x + dx,
      y: dragStart.current.y + dy,
    });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isZoomed) {
      setIsDragging(false);
    }
    
    // Calculate client displacement to differentiate click from drag
    const dist = Math.hypot(e.clientX - mouseStart.current.x, e.clientY - mouseStart.current.y);
    if (dist < 6) {
      onToggleZoom();
    }
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{
        flex: 1,
        background: 'var(--bg2)',
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '350px',
        position: 'relative',
        cursor: !isZoomed ? 'zoom-in' : isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          maxWidth: '100%',
          maxHeight: '60vh',
          objectFit: 'contain',
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: isDragging ? 'none' : 'transform 0.15s ease-out',
          transformOrigin: 'center center',
        }}
      />
      {isZoomed && (
        <div style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 10,
          pointerEvents: 'none',
        }}>
          Nagyítás: {Math.round(scale * 100)}%
        </div>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ImageSlotUploaderProps {
  slots: ImageSlot[];
  onChange: (updater: (prev: ImageSlot[]) => ImageSlot[]) => void;
  onSetDefault?: (slot: ImageSlot) => void;
  maxSlots?: number;
  disabled?: boolean;
  label?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImageSlotUploader({
  slots,
  onChange,
  onSetDefault,
  maxSlots = 3,
  disabled = false,
  label = 'Képek feltöltése',
}: ImageSlotUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [comparisonSlotId, setComparisonSlotId] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);

  const closeComparison = useCallback(() => {
    setComparisonSlotId(null);
    setIsZoomed(false);
  }, []);
  const triggerUpscale = useCallback(async (slotId: string, forceOriginalUrl?: string, forcePreprocessedUrl?: string | null) => {
    let url = forceOriginalUrl;
    let ppUrl = forcePreprocessedUrl;

    if (!url) {
      const slot = slots.find(s => s.id === slotId);
      if (!slot || !slot.originalUrl) return;
      url = slot.originalUrl;
      ppUrl = slot.preprocessedUrl;
    }

    onChange(prev => prev.map(s => s.id === slotId ? { ...s, upscaleLoading: true, error: null } : s));

    try {
      // Step 1: Upscale the original image
      const upResp = await fetch(`${getBackendUrl()}/api/image/upscale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          imageUrl: url,
          maskUrl: null // Pass null to get the raw upscaled image with background, then we run high-res bg removal on it
        }),
      });
      if (!upResp.ok) throw new Error(await upResp.text());
      const upData = await upResp.json();
      const rawUpscaledUrl = upData.url;

      // Step 2: Remove background from the upscaled image (if background removal is applicable)
      let finalUpscaledUrl = rawUpscaledUrl;
      if (ppUrl) {
        console.log('[ImageSlotUploader] Removing background from upscaled image...');
        const bgResp = await fetch(`${getBackendUrl()}/api/image/remove-background`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: rawUpscaledUrl }),
        });
        if (bgResp.ok) {
          const bgData = await bgResp.json();
          finalUpscaledUrl = bgData.url;
        } else {
          console.warn('[ImageSlotUploader] Upscaled background removal failed, falling back.');
        }
      }

      // Step 3: Re-analyze the upscaled background-removed image
      console.log('[ImageSlotUploader] Re-running Claude Vision analysis on upscaled image...');
      const anResp = await fetch(`${getBackendUrl()}/api/image/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: finalUpscaledUrl }),
      });
      if (!anResp.ok) throw new Error(await anResp.text());
      const anData = await anResp.json();
      const analysis: ImageAnalysisResult = anData.results?.[0] || null;

      const autoRole: ImageSlot['role'] =
        analysis?.imageType === 'product' || analysis?.imageType === 'logo' ? 'product'
        : analysis?.imageType === 'model' ? 'model'
        : analysis?.imageType === 'scene' || analysis?.imageType === 'lifestyle' ? 'background'
        : 'auto';

      onChange(prev => prev.map(s => s.id === slotId ? { 
        ...s, 
        upscaledUrl: finalUpscaledUrl, 
        upscaleLoading: false,
        analysis,
        role: s.role !== 'auto' ? s.role : autoRole,
        locked: analysis?.locked ?? false,
        userEditedDescription: analysis?.subject || '',
        alternativeTextDescription: analysis?.hasText
          ? `Szöveg: „${(analysis.extractedText || '').replace(/k[öo]romfolt/gi, 'koromfolt')}” · Helye: ${analysis.textPlacement || ''}`
          : 'Nincs írás a képen.',
      } : s));
    } catch (upErr: any) {
      onChange(prev => prev.map(s => s.id === slotId ? { ...s, upscaleLoading: false, error: 'Feljavítási hiba: ' + upErr.message } : s));
    }
  }, [onChange, slots]);

  const triggerBackgroundRemoval = useCallback(async (slotId: string) => {
    const slot = slots.find(s => s.id === slotId);
    if (!slot) return;

    onChange(prev => prev.map(s => s.id === slotId
      ? { ...s, preprocessLoading: true, error: null }
      : s
    ));

    try {
      let preprocessedUrl = '';
      if (slot.rawBase64) {
        const ppResp = await fetch(`${getBackendUrl()}/api/image/preprocess`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: slot.rawBase64 }),
        });
        if (!ppResp.ok) throw new Error(await ppResp.text());
        const ppData = await ppResp.json();
        preprocessedUrl = ppData.url || '';
      } else if (slot.originalUrl) {
        const ppResp = await fetch(`${getBackendUrl()}/api/image/remove-background`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: slot.originalUrl }),
        });
        if (!ppResp.ok) throw new Error(await ppResp.text());
        const ppData = await ppResp.json();
        preprocessedUrl = ppData.url || '';
      } else {
        throw new Error('Nincs kiindulási kép a háttérlevételhez.');
      }

      onChange(prev => prev.map(s => s.id === slotId
        ? { ...s, preprocessedUrl, preprocessLoading: false }
        : s
      ));
    } catch (e: any) {
      onChange(prev => prev.map(s => s.id === slotId
        ? { ...s, preprocessLoading: false, error: 'Háttérlevétel hiba: ' + e.message }
        : s
      ));
    }
  }, [slots, onChange]);

  const processFile = useCallback(async (file: File, slotId: string) => {
    if (!file.type.startsWith('image/')) return;

    // Step 1: Base64 and Dimensions
    let width = 0;
    let height = 0;
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const b64 = (e.target?.result as string) || '';
        try {
          const img = new Image();
          img.src = b64;
          await new Promise((resImg) => {
            img.onload = () => {
              width = img.naturalWidth;
              height = img.naturalHeight;
              resImg(null);
            };
            img.onerror = () => resImg(null);
          });
        } catch (imgErr) {
          console.error('Error getting image dimensions:', imgErr);
        }
        resolve(b64);
      };
      reader.readAsDataURL(file);
    });

    onChange(prev => prev.map(s => s.id === slotId
      ? { ...s, rawBase64: base64, preprocessLoading: true, error: null }
      : s
    ));



    // Step 2: Preprocess (CDN + background removal)
    let originalUrl = '';
    let preprocessedUrl: string | null = null;
    let preprocessSkipped = false;
    try {
      const ppResp = await fetch(`${getBackendUrl()}/api/image/preprocess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      });
      if (!ppResp.ok) throw new Error(await ppResp.text());
      const ppData = await ppResp.json();
      originalUrl = ppData.originalUrl || '';
      preprocessedUrl = ppData.url || null;
    } catch (e: any) {
      const isNetworkError = e.message?.toLowerCase().includes('fetch') || e.message?.toLowerCase().includes('network') || e.message?.toLowerCase().includes('connect');
      if (isNetworkError) {
        // Backend not running — use base64 directly as fallback, skip preprocessing
        // The image will still work for overlay preview (cover crop handles any aspect ratio)
        originalUrl = base64;  // data:image/... URL works directly
        preprocessedUrl = null;
        preprocessSkipped = true;
        console.warn('[ImageSlot] Preprocessing skipped (backend unavailable), using raw image');
      } else {
        onChange(prev => prev.map(s => s.id === slotId
          ? { ...s, preprocessLoading: false, error: 'Előfeldolgozás hiba: ' + e.message }
          : s
        ));
        return;
      }
    }

    onChange(prev => prev.map(s => s.id === slotId
      ? {
          ...s,
          originalUrl,
          preprocessedUrl,
          preprocessLoading: false,
          analysisLoading: !preprocessSkipped,  // skip analysis if backend was offline
          ...(preprocessSkipped ? { error: null } : {}),  // clear error — image is usable
        }
      : s
    ));

    // If backend was offline, skip analysis and mark slot as ready with warning
    if (preprocessSkipped) {
      onChange(prev => prev.map(s => s.id === slotId
        ? { ...s, analysisLoading: false, role: 'auto' }
        : s
      ));
      console.warn('[ImageSlot] Analysis skipped — backend offline. Image usable for overlay preview.');
      return;
    }

    // Step 3: Claude Vision analysis
    try {
      const anResp = await fetch(`${getBackendUrl()}/api/image/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: originalUrl }),
      });
      if (!anResp.ok) throw new Error(await anResp.text());
      const anData = await anResp.json();
      const analysis: ImageAnalysisResult = anData.results?.[0] || null;

      const autoRole: ImageSlot['role'] =
        analysis?.imageType === 'product' || analysis?.imageType === 'logo' ? 'product'
        : analysis?.imageType === 'model' ? 'model'
        : analysis?.imageType === 'scene' || analysis?.imageType === 'lifestyle' ? 'background'
        : 'auto';

      onChange(prev => prev.map(s => s.id === slotId
        ? {
            ...s,
            analysis,
            analysisLoading: false,
            role: autoRole,
            locked: analysis?.locked ?? false,
            userEditedDescription: analysis?.subject || '',
            alternativeTextDescription: analysis?.hasText
              ? `Szöveg: „${(analysis.extractedText || '').replace(/k[öo]romfolt/gi, 'koromfolt')}” · Helye: ${analysis.textPlacement || ''}`
              : 'Nincs írás a képen.',
          }
        : s
      ));

      const isLowRes = width > 0 && height > 0 && (width < 800 || height < 800);
      const isTextUnreadable = !!(analysis?.hasText && (analysis.textLegibility === 'blurry' || analysis.textLegibility === 'illegible'));

      // Auto-upscale DISABLED — feljavítás mindig manuális
      // Only flag the slot so the button can show a recommendation badge
      if (isLowRes || isTextUnreadable) {
        onChange(prev => prev.map(s => s.id === slotId ? { ...s, suggestUpscale: true } : s));
      }
    } catch (e: any) {
      onChange(prev => prev.map(s => s.id === slotId
        ? { ...s, analysisLoading: false, error: 'Elemzési hiba: ' + e.message }
        : s
      ));
    }
  }, [onChange, triggerUpscale]);

  const handleFilesSelect = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;

    onChange(prev => {
      const allowedCount = Math.max(0, maxSlots - prev.length);
      const filesToProcess = fileArray.slice(0, allowedCount);
      
      if (filesToProcess.length === 0) return prev;

      const newSlots = filesToProcess.map(file => ({
        ...createEmptySlot(),
        fileName: file.name
      }));

      newSlots.forEach((slot, index) => {
        const file = filesToProcess[index];
        setTimeout(() => processFile(file, slot.id), 0);
      });

      return [...prev, ...newSlots];
    });
  }, [maxSlots, onChange, processFile]);


  const handleReplaceSlot = useCallback((slotId: string, file: File) => {
    onChange(prev => prev.map(s => s.id === slotId ? { ...createEmptySlot(), id: slotId, fileName: file.name } : s));
    setTimeout(() => processFile(file, slotId), 0);
  }, [onChange, processFile]);


  const removeSlot = useCallback((slotId: string) => {
    onChange(prev => prev.filter(s => s.id !== slotId));
  }, [onChange]);

  const updateSlotRole = useCallback((slotId: string, role: ImageSlot['role']) => {
    onChange(prev => prev.map(s => s.id === slotId
      ? { ...s, role, locked: role === 'product' }
      : s
    ));
  }, [onChange]);

  const updateDescription = useCallback((slotId: string, desc: string) => {
    onChange(prev => prev.map(s => s.id === slotId ? { ...s, userEditedDescription: desc } : s));
  }, [onChange]);

  const updateAlternativeDescription = useCallback((slotId: string, desc: string) => {
    onChange(prev => prev.map(s => s.id === slotId ? { ...s, alternativeTextDescription: desc } : s));
  }, [onChange]);

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Label */}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
        {label}
        <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8, textTransform: 'none' }}>
          (max {maxSlots} kép • Claude Vision elemzés automatikus)
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Existing slots */}
        {slots.map((slot, idx) => (
          <div
            key={slot.id}
            onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={(e) => {
              e.preventDefault(); setDragOverIdx(null);
              const file = e.dataTransfer.files?.[0];
              if (file) handleReplaceSlot(slot.id, file);
            }}
            style={{
              width: (slot.upscaledUrl || slot.upscaleLoading || slot.preprocessedUrl || slot.preprocessLoading) ? 360 : 200, background: 'var(--bg3)',
              border: `1.5px solid ${dragOverIdx === idx ? '#8b5cf6' : 'var(--border)'}`,
              borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.2s', flexShrink: 0,
            }}
          >
            {/* Preview */}
            <div style={{ position: 'relative', height: 140, background: 'var(--bg)', overflow: 'hidden' }}>
              {slot.preprocessLoading && !slot.rawBase64 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                  <div style={{ width: 22, height: 22, border: '2.5px solid rgba(139,92,246,0.2)', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Feltöltés + háttéreltávolítás...</span>
                </div>
              ) : slot.analysisLoading && !slot.rawBase64 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                  <div style={{ width: 22, height: 22, border: '2.5px solid rgba(167,139,250,0.2)', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Claude Vision elemzés...</span>
                </div>
              ) : slot.rawBase64 ? (() => {
                const hasUpscale = !!(slot.upscaledUrl || slot.upscaleLoading);
                const hasPreprocess = !!(slot.preprocessedUrl || slot.preprocessLoading);
                const isSplit = hasUpscale || hasPreprocess;

                return (
                  <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                    {/* Left part: Original / Preprocessed image */}
                    <div 
                      onClick={() => isSplit && setComparisonSlotId(slot.id)}
                      style={{ 
                        position: 'relative', 
                        width: isSplit ? '50%' : '100%', 
                        height: '100%', 
                        borderRight: isSplit ? '1px solid var(--border)' : 'none', 
                        cursor: isSplit ? 'zoom-in' : 'default' 
                      }}
                    >
                      <img
                        src={hasUpscale 
                          ? (fixImageUrl(slot.preprocessedUrl) || slot.rawBase64) 
                          : (fixImageUrl(slot.originalUrl) || slot.rawBase64)
                        }
                        alt={slot.analysis?.altText || `Kép ${idx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      {isSplit && (
                        <div style={{ position: 'absolute', bottom: 4, left: 4, padding: '2px 4px', background: 'rgba(0,0,0,0.6)', borderRadius: 3, fontSize: 8, color: '#fff', fontWeight: 600, zIndex: 3 }}>
                          {hasUpscale ? '✂️ Levágott' : 'Eredeti'}
                        </div>
                      )}
                    </div>

                    {/* Right part: Upscaled / Preprocessed image or Loader */}
                    {isSplit && (
                      <div 
                        onClick={() => (slot.upscaledUrl || slot.preprocessedUrl) && setComparisonSlotId(slot.id)}
                        style={{ 
                          position: 'relative', 
                          width: '50%', 
                          height: '100%', 
                          background: 'var(--bg2)',
                          cursor: (slot.upscaledUrl || slot.preprocessedUrl) ? 'zoom-in' : 'default'
                        }}
                      >
                        {hasUpscale ? (
                          slot.upscaleLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6 }}>
                              <div style={{ width: 16, height: 16, border: '2px solid rgba(139,92,246,0.2)', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                              <span style={{ fontSize: 8, color: 'var(--text-muted)', textAlign: 'center' }}>Javítás...</span>
                            </div>
                          ) : slot.upscaledUrl ? (
                            <>
                              <img
                                src={fixImageUrl(slot.upscaledUrl)}
                                alt="Feljavított kép"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                              <div style={{ position: 'absolute', bottom: 4, left: 4, padding: '2px 4px', background: 'rgba(34,197,94,0.85)', borderRadius: 3, fontSize: 8, color: '#fff', fontWeight: 600, zIndex: 3 }}>
                                ✨ Javított
                              </div>
                            </>
                          ) : null
                        ) : (
                          slot.preprocessLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6 }}>
                              <div style={{ width: 16, height: 16, border: '2px solid rgba(139,92,246,0.2)', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                              <span style={{ fontSize: 8, color: 'var(--text-muted)', textAlign: 'center' }}>Vágás...</span>
                            </div>
                          ) : slot.preprocessedUrl ? (
                            <>
                              <img
                                src={fixImageUrl(slot.preprocessedUrl)}
                                alt="Háttér nélküli kép"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                              <div style={{ position: 'absolute', bottom: 4, left: 4, padding: '2px 4px', background: 'rgba(139,92,246,0.85)', borderRadius: 3, fontSize: 8, color: '#fff', fontWeight: 600, zIndex: 3 }}>
                                ✂️ Levágott
                              </div>
                            </>
                          ) : null
                        )}
                      </div>
                    )}

                    {slot.locked && (
                      <div style={{ position: 'absolute', top: 5, left: 5, padding: '2px 6px', background: 'rgba(239,68,68,0.88)', borderRadius: 4, fontSize: 9, fontWeight: 700, color: '#fff', zIndex: 2 }}>
                        🔒 RÖGZÍTETT
                      </div>
                    )}
                    {slot.analysis && (
                      <div style={{
                        position: 'absolute', top: 5, right: 5, padding: '2px 6px',
                        background: `${IMAGE_TYPE_COLORS[slot.analysis.imageType]}cc`,
                        borderRadius: 4, fontSize: 9, fontWeight: 700, color: '#fff', zIndex: 2
                      }}>
                        {IMAGE_TYPE_LABELS[slot.analysis.imageType]}
                      </div>
                    )}
                    {slot.analysis?.dominantColors && slot.analysis.dominantColors.length > 0 && (
                      <div style={{ position: 'absolute', bottom: 5, left: isSplit ? '52%' : 5, display: 'flex', gap: 3, zIndex: 2 }}>
                        {slot.analysis.dominantColors.slice(0, 4).map((c, i) => (
                          <div key={i} title={c} style={{ width: 11, height: 11, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.4)' }} />
                        ))}
                      </div>
                    )}
                    {/* Confidence */}
                    {slot.analysis?.confidence && (
                      <div style={{ position: 'absolute', bottom: 5, right: 5, fontSize: 8, color: 'rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.4)', padding: '1px 4px', borderRadius: 3, zIndex: 2 }}>
                        {slot.analysis.confidence}%
                      </div>
                    )}
                  </div>
                );
              })() : (
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', cursor: 'pointer', gap: 6, color: 'var(--text-muted)' }}>
                  <span style={{ fontSize: 22 }}>📎</span>
                  <span style={{ fontSize: 9 }}>Húzd vagy kattints</span>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleReplaceSlot(slot.id, f); }} />
                </label>
              )}
            </div>

            {/* Body */}
            <div style={{ padding: 10 }}>
              {slot.error && (
                <div style={{ fontSize: 9, color: '#ef4444', marginBottom: 6, lineHeight: 1.4, padding: '4px 6px', background: 'rgba(239,68,68,0.08)', borderRadius: 5 }}>
                  ⚠ {slot.error}
                </div>
              )}

              {slot.analysis && (
                <>
                  {/* Alt text */}
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', fontStyle: 'italic', marginBottom: 5, lineHeight: 1.4 }}>
                    alt: „{slot.analysis.altText}"
                  </div>

                  {/* Description */}
                  <>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 3 }}>
                      Leírás {slot.locked ? '🔒' : '✏️ szerkeszthető'}
                    </div>
                    <textarea
                      value={slot.userEditedDescription}
                      onChange={e => updateDescription(slot.id, e.target.value)}
                      rows={3}
                      style={{ width: '100%', resize: 'none', fontSize: 9.5, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', fontFamily: 'inherit', lineHeight: 1.45, boxSizing: 'border-box' }}
                    />
                  </>

                  {/* Alternative text description */}
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.3px', marginTop: 8, marginBottom: 3 }}>
                    {slot.upscaledUrl ? 'Javított kép leírása (írás és helye)' : 'Alternatív szöveg leírás (írás és helye)'}
                  </div>
                  <textarea
                    value={slot.alternativeTextDescription || ''}
                    onChange={e => updateAlternativeDescription(slot.id, e.target.value)}
                    rows={3}
                    placeholder="Nincs írás a képen."
                    style={{ width: '100%', resize: 'none', fontSize: 9.5, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', fontFamily: 'inherit', lineHeight: 1.45, boxSizing: 'border-box' }}
                  />

                  {/* Text Legibility Badge */}
                  {slot.analysis.hasText && (
                    <div style={{
                      marginTop: 6, padding: '6px 10px', borderRadius: 6,
                      background: slot.analysis.textLegibility === 'clear' ? 'rgba(34,197,94,0.08)' : slot.analysis.textLegibility === 'blurry' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
                      border: `1px solid ${slot.analysis.textLegibility === 'clear' ? 'rgba(34,197,94,0.18)' : slot.analysis.textLegibility === 'blurry' ? 'rgba(245,158,11,0.18)' : 'rgba(239,68,68,0.18)'}`,
                      fontSize: 8.5, color: slot.analysis.textLegibility === 'clear' ? '#22c55e' : slot.analysis.textLegibility === 'blurry' ? '#fbbf24' : '#ef4444',
                      lineHeight: 1.4
                    }}>
                      <div>
                        📝 <strong>Írás észlelve:</strong> {slot.analysis.textLegibility === 'clear' ? 'Jól olvasható' : slot.analysis.textLegibility === 'blurry' ? 'Elmosódott' : 'Olvashatatlan'}
                        {slot.upscaledUrl && ' • Feljavítás kész!'}
                      </div>
                      <div style={{ marginTop: 4, padding: '4px 6px', background: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div><strong>Szöveg:</strong> <span style={{ color: 'var(--text)' }}>„{slot.analysis.extractedText || 'ismeretlen'}”</span></div>
                        <div><strong>Helye:</strong> <span style={{ color: 'var(--text)' }}>{slot.analysis.textPlacement || 'ismeretlen'}</span></div>
                      </div>
                    </div>
                  )}

                  {/* Changeability pills */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                    {slot.analysis.changeabilityRules.allowedModifications.slice(0, 2).map((m, i) => (
                      <span key={i} style={{ fontSize: 7.5, padding: '1px 5px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 4 }}>✓ {m}</span>
                    ))}
                    {slot.analysis.changeabilityRules.mustPreserveExactly.slice(0, 2).map((m, i) => (
                      <span key={i} style={{ fontSize: 7.5, padding: '1px 5px', background: 'rgba(239,68,68,0.09)', color: '#ef4444', borderRadius: 4 }}>🔒 {m}</span>
                    ))}
                  </div>

                  {/* Default toggle */}
                  <div 
                    onClick={() => onSetDefault && onSetDefault(slot)}
                    style={{
                      marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                      padding: '6px 8px', borderRadius: 8, background: slot.isDefault ? 'rgba(139,92,246,0.1)' : 'rgba(0,0,0,0.15)',
                      border: `1px solid ${slot.isDefault ? '#8b5cf6' : 'rgba(255,255,255,0.1)'}`,
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${slot.isDefault ? '#8b5cf6' : 'var(--text-muted)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: slot.isDefault ? '#8b5cf6' : 'transparent'
                    }}>
                      {slot.isDefault && <Check size={10} color="#fff" />}
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, color: slot.isDefault ? '#a78bfa' : 'var(--text-muted)' }}>
                      Alapértelmezett kép
                    </span>
                  </div>
                </>
              )}

              {/* Role selector */}
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 3 }}>Szerepkör</div>
                <select
                  value={slot.role}
                  onChange={e => updateSlotRole(slot.id, e.target.value as ImageSlot['role'])}
                  disabled={disabled}
                  style={{ width: '100%', fontSize: 10, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 5px', fontFamily: 'inherit' }}
                >
                  {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {/* Manual background removal button */}
              {(slot.rawBase64 || slot.originalUrl) && (
                <div style={{ marginTop: 8 }}>
                  <button
                    onClick={() => triggerBackgroundRemoval(slot.id)}
                    disabled={disabled || slot.preprocessLoading || slot.upscaleLoading || slot.analysisLoading}
                    style={{
                      width: '100%',
                      padding: '5px 8px',
                      background: slot.preprocessedUrl 
                        ? 'rgba(34,197,94,0.06)' 
                        : slot.preprocessLoading 
                          ? 'rgba(139,92,246,0.04)' 
                          : 'rgba(139,92,246,0.1)',
                      border: `1px solid ${
                        slot.preprocessedUrl 
                          ? 'rgba(34,197,94,0.3)' 
                          : 'rgba(139,92,246,0.25)'
                      }`,
                      borderRadius: 6,
                      color: slot.preprocessedUrl ? '#22c55e' : '#a78bfa',
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: (disabled || slot.preprocessLoading) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      transition: 'all 0.15s'
                    }}
                  >
                    {slot.preprocessLoading ? (
                      <>
                        <div style={{ width: 10, height: 10, border: '1.5px solid rgba(167,139,250,0.2)', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        Háttérlevétel folyamatban...
                      </>
                    ) : slot.preprocessedUrl ? (
                      <>✓ Háttér eltávolítva (rembg)</>
                    ) : (
                      <>✂️ Háttér eltávolítása manuálisan</>
                    )}
                  </button>
                </div>
              )}

              {/* Manual upscale button */}
              {slot.originalUrl && (
                <div style={{ marginTop: 8 }}>
                  <button
                    onClick={() => triggerUpscale(slot.id)}
                    disabled={disabled || slot.upscaleLoading || slot.preprocessLoading || slot.analysisLoading}
                    style={{
                      width: '100%',
                      padding: '5px 8px',
                      background: slot.upscaledUrl
                        ? 'rgba(34,197,94,0.06)'
                        : slot.upscaleLoading
                          ? 'rgba(139,92,246,0.04)'
                          : slot.suggestUpscale
                            ? 'rgba(245,158,11,0.08)'
                            : 'rgba(139,92,246,0.1)',
                      border: `1px solid ${
                        slot.upscaledUrl
                          ? 'rgba(34,197,94,0.3)'
                          : slot.suggestUpscale
                            ? 'rgba(245,158,11,0.5)'
                            : 'rgba(139,92,246,0.25)'
                      }`,
                      borderRadius: 6,
                      color: slot.upscaledUrl ? '#22c55e' : slot.suggestUpscale ? '#f59e0b' : '#a78bfa',
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: (disabled || slot.upscaleLoading) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      transition: 'all 0.15s'
                    }}
                  >
                    {slot.upscaleLoading ? (
                      <>
                        <div style={{ width: 10, height: 10, border: '1.5px solid rgba(167,139,250,0.2)', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        Feljavítás folyamatban...
                      </>
                    ) : slot.upscaledUrl ? (
                      <>✓ Feljavítva (DRCT 4x)</>
                    ) : slot.suggestUpscale ? (
                      <>⚡ Kép feljavítása ajánlott — kattints itt</>
                    ) : (
                      <>✨ Kép feljavítása manuálisan</>
                    )}
                  </button>
                </div>
              )}

              <button
                onClick={() => removeSlot(slot.id)}
                disabled={disabled}
                style={{ width: '100%', marginTop: 8, padding: '4px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 6, color: '#ef4444', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
              >
                Eltávolítás
              </button>
            </div>
          </div>
        ))}

        {/* Add slot button */}
        {slots.length < maxSlots && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOverIdx(-1); }}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverIdx(null);
              const files = e.dataTransfer.files;
              if (files && files.length > 0) handleFilesSelect(files);
            }}
            onClick={() => !disabled && fileInputRef.current?.click()}
            style={{
              width: 200, height: slots.length === 0 ? 180 : 130,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: dragOverIdx === -1 ? 'rgba(139,92,246,0.08)' : 'var(--bg3)',
              border: `1.5px dashed ${dragOverIdx === -1 ? '#8b5cf6' : 'var(--border)'}`,
              borderRadius: 12, cursor: disabled ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', transition: 'all 0.2s', flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 26, opacity: 0.45 }}>+</span>
            <span style={{ fontSize: 11, fontWeight: 600 }}>Kép hozzáadása</span>
            <span style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.4 }}>Termék · Modell · Háttér</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              disabled={disabled}
              onChange={e => {
                const files = e.target.files;
                if (files && files.length > 0) handleFilesSelect(files);
                e.target.value = '';
              }}
            />
          </div>
        )}
      </div>

      {/* Composite hint */}
      {slots.length >= 2 && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.14)', borderRadius: 8, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          💡 <strong>Kompozit mód aktív</strong> — {slots.filter(s => s.locked).length > 0
            ? `${slots.filter(s => s.locked).length} rögzített termék + ${slots.filter(s => !s.locked).length} kontextus kép kerül összerakásra.`
            : 'Az AI a képeket egy koherens jelenetbe rakja össze.'
          }
        </div>
      )}

      {/* Large Comparison Modal / Lightbox */}
      {comparisonSlotId && (() => {
        const slot = slots.find(s => s.id === comparisonSlotId);
        if (!slot) return null;
        const hasUpscale = !!slot.upscaledUrl;
        const hasPreprocess = !!slot.preprocessedUrl;
        if (!hasUpscale && !hasPreprocess) return null;

        return createPortal(
          <div 
            onClick={closeComparison}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: isZoomed ? 'rgba(3, 2, 8, 0.98)' : 'rgba(5, 3, 12, 0.9)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              zIndex: 9999, padding: isZoomed ? '10px' : '40px 20px',
              transition: 'background 0.2s'
            }}
          >
            <div 
              onClick={e => e.stopPropagation()}
              style={{
                width: isZoomed ? '98vw' : '1200px', 
                maxWidth: '98%', 
                background: 'var(--bg3)',
                border: '1px solid var(--border)', 
                borderRadius: 16, 
                display: 'flex',
                flexDirection: 'column', 
                height: isZoomed ? '96vh' : 'auto',
                maxHeight: isZoomed ? '96vh' : '90vh', 
                overflow: 'hidden',
                boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)', 
                backdropFilter: 'blur(15px)',
                transition: 'all 0.2s ease-in-out'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                    🔍 {hasUpscale ? 'Kép felbontás összehasonlítás' : 'Háttér eltávolítás összehasonlítás'} {isZoomed ? '• Görgess a nagyításhoz, húzd a mozgatáshoz' : '(kattints a képre a belenagyításhoz)'}
                  </h3>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{slot.fileName}</span>
                </div>
                <button 
                  onClick={closeComparison}
                  style={{
                    background: 'rgba(255,255,255,0.08)', border: 'none',
                    borderRadius: '50%', width: 32, height: 32, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: 'var(--text)',
                    cursor: 'pointer', fontSize: 16, fontWeight: 600, transition: 'all 0.15s'
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div style={{ display: 'flex', gap: 20, padding: 24, overflowY: 'auto', flex: 1 }}>
                {/* Left Pane */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)' }}>
                      {hasUpscale ? 'Eredeti / Előfeldolgozott kép' : 'Eredeti kép'}
                    </span>
                    <span style={{ fontSize: 10.5, padding: '2px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: 4, color: 'var(--text-muted)' }}>
                      {hasUpscale ? 'Nincs feljavítva' : 'Eredeti háttérrel'}
                    </span>
                  </div>
                  <PanZoomImage
                    src={hasUpscale ? (fixImageUrl(slot.preprocessedUrl) || slot.rawBase64) : (fixImageUrl(slot.originalUrl) || slot.rawBase64)}
                    alt="Eredeti kép"
                    isZoomed={isZoomed}
                    onToggleZoom={() => setIsZoomed(!isZoomed)}
                  />
                </div>

                {/* Right Pane */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: hasUpscale ? '#22c55e' : '#a78bfa' }}>
                      {hasUpscale ? '✨ Feljavított (DRCT 4x)' : '✂️ Levágott kép (rembg)'}
                    </span>
                    <span style={{ fontSize: 10.5, padding: '2px 8px', background: hasUpscale ? 'rgba(34,197,94,0.15)' : 'rgba(167,139,250,0.15)', borderRadius: 4, color: hasUpscale ? '#22c55e' : '#c4b5fd', fontWeight: 600 }}>
                      {hasUpscale ? 'Nagy felbontás + megtartott élek' : 'Háttér sikeresen eltávolítva'}
                    </span>
                  </div>
                  <PanZoomImage
                    src={hasUpscale ? fixImageUrl(slot.upscaledUrl)! : fixImageUrl(slot.preprocessedUrl)!}
                    alt="Feldolgozott kép"
                    isZoomed={isZoomed}
                    onToggleZoom={() => setIsZoomed(!isZoomed)}
                  />
                </div>
              </div>

              {/* Metadata Details panel */}
              {slot.analysis?.hasText && !isZoomed && (
                <div style={{ padding: '16px 24px', background: 'rgba(139,92,246,0.06)', borderTop: '1px solid var(--border)', display: 'flex', gap: 40 }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>
                      Észlelt felirat szövege:
                    </span>
                    <span style={{ fontSize: 13, color: '#c4b5fd', fontWeight: 600 }}>
                      „{slot.analysis.extractedText || 'ismeretlen'}”
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>
                      Szöveg elhelyezkedése:
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>
                      {slot.analysis.textPlacement || 'ismeretlen'}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>
                      Olvashatósági státusz:
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: slot.analysis.textLegibility === 'clear' ? '#22c55e' : slot.analysis.textLegibility === 'blurry' ? '#fbbf24' : '#ef4444'
                    }}>
                      {slot.analysis.textLegibility === 'clear' ? '✓ Jól olvasható' : slot.analysis.textLegibility === 'blurry' ? '⚠ Elmosódott' : '⚠ Olvashatatlan'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}

export function buildCompositePayload(slots: ImageSlot[], scenePrompt: string, brandKit: any) {
  return {
    slots: slots.map(s => {
      let finalDesc = s.userEditedDescription || s.analysis?.subject || '';
      if (s.alternativeTextDescription && s.alternativeTextDescription.trim() && s.alternativeTextDescription !== 'Nincs írás a képen.') {
        if (finalDesc) {
          finalDesc += ` (${s.alternativeTextDescription})`;
        } else {
          finalDesc = s.alternativeTextDescription;
        }
      }
      // Auto-correct common typos
      finalDesc = finalDesc.replace(/k[öo]romfolt/gi, 'koromfolt');
      return {
        id: s.id,
        originalUrl: s.originalUrl,
        preprocessedUrl: s.upscaledUrl || s.preprocessedUrl,
        role: s.role,
        locked: s.locked,
        analysis: s.analysis,
        // Pass lightingAnalysis separately at top level for easy backend access
        lightingAnalysis: s.analysis?.lightingAnalysis ?? null,
        userEditedDescription: finalDesc,
      };
    }),
    scenePrompt, brandKit, aspectRatio: '2:3', width: 1024, height: 1536,
  };
}
