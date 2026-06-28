import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImageChangeabilityRules {
  canChangeBackground: boolean;
  canChangeColors: boolean;
  canChangeShape: boolean;
  canChangeTexture: boolean;
  mustPreserveExactly: string[];
  allowedModifications: string[];
}

export interface ImageAnalysisResult {
  imageType: 'product' | 'model' | 'scene' | 'logo' | 'lifestyle' | 'mixed';
  subject: string;
  altText: string;
  dominantColors: string[];
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
}

export interface ImageSlot {
  id: string;
  rawBase64: string;
  fileName: string;
  originalUrl: string;
  preprocessedUrl: string | null;
  upscaledUrl?: string | null;
  upscaleLoading?: boolean;
  analysis: ImageAnalysisResult | null;
  analysisLoading: boolean;
  preprocessLoading: boolean;
  role: 'product' | 'model' | 'background' | 'auto';
  userEditedDescription: string;
  alternativeTextDescription?: string;
  locked: boolean;
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
    analysis: null,
    analysisLoading: false,
    preprocessLoading: false,
    role: 'auto',
    userEditedDescription: '',
    alternativeTextDescription: '',
    locked: false,
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

function PanZoomImage({ src, alt, isZoomed, onToggleZoom }: PanZoomImageProps) {
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
  maxSlots?: number;
  disabled?: boolean;
  label?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImageSlotUploader({
  slots,
  onChange,
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
      const upResp = await fetch('http://localhost:3001/api/image/upscale', {
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
        const bgResp = await fetch('http://localhost:3001/api/image/remove-background', {
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
      const anResp = await fetch('http://localhost:3001/api/image/analyze', {
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
    try {
      const ppResp = await fetch('http://localhost:3001/api/image/preprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      });
      if (!ppResp.ok) throw new Error(await ppResp.text());
      const ppData = await ppResp.json();
      originalUrl = ppData.originalUrl || '';
      preprocessedUrl = ppData.url || null;
    } catch (e: any) {
      onChange(prev => prev.map(s => s.id === slotId
        ? { ...s, preprocessLoading: false, error: 'Előfeldolgozás hiba: ' + e.message }
        : s
      ));
      return;
    }

    onChange(prev => prev.map(s => s.id === slotId
      ? { ...s, originalUrl, preprocessedUrl, preprocessLoading: false, analysisLoading: true }
      : s
    ));

    // Step 3: Claude Vision analysis
    try {
      const anResp = await fetch('http://localhost:3001/api/image/analyze', {
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

      if (isLowRes || isTextUnreadable) {
        await triggerUpscale(slotId, originalUrl, preprocessedUrl);
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
              width: (slot.upscaledUrl || slot.upscaleLoading) ? 360 : 200, background: 'var(--bg3)',
              border: `1.5px solid ${dragOverIdx === idx ? '#8b5cf6' : 'var(--border)'}`,
              borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.2s', flexShrink: 0,
            }}
          >
            {/* Preview */}
            <div style={{ position: 'relative', height: 140, background: 'var(--bg)', overflow: 'hidden' }}>
              {slot.preprocessLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                  <div style={{ width: 22, height: 22, border: '2.5px solid rgba(139,92,246,0.2)', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Feltöltés + háttéreltávolítás...</span>
                </div>
              ) : slot.analysisLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                  <div style={{ width: 22, height: 22, border: '2.5px solid rgba(167,139,250,0.2)', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Claude Vision elemzés...</span>
                </div>
              ) : slot.rawBase64 ? (
                <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                  {/* Left part: Original / Preprocessed image */}
                  <div 
                    onClick={() => slot.upscaledUrl && setComparisonSlotId(slot.id)}
                    style={{ 
                      position: 'relative', 
                      width: (slot.upscaledUrl || slot.upscaleLoading) ? '50%' : '100%', 
                      height: '100%', 
                      borderRight: (slot.upscaledUrl || slot.upscaleLoading) ? '1px solid var(--border)' : 'none', 
                      cursor: slot.upscaledUrl ? 'zoom-in' : 'default' 
                    }}
                  >
                    <img
                      src={slot.preprocessedUrl || slot.rawBase64}
                      alt={slot.analysis?.altText || `Kép ${idx + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>

                  {/* Right part: Upscaled image or Loader */}
                  {(slot.upscaledUrl || slot.upscaleLoading) && (
                    <div 
                      onClick={() => slot.upscaledUrl && setComparisonSlotId(slot.id)}
                      style={{ 
                        position: 'relative', 
                        width: '50%', 
                        height: '100%', 
                        background: 'var(--bg2)',
                        cursor: slot.upscaledUrl ? 'zoom-in' : 'default'
                      }}
                    >
                      {slot.upscaleLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6 }}>
                          <div style={{ width: 16, height: 16, border: '2px solid rgba(139,92,246,0.2)', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          <span style={{ fontSize: 8, color: 'var(--text-muted)', textAlign: 'center' }}>Javítás...</span>
                        </div>
                      ) : slot.upscaledUrl ? (
                        <>
                          <img
                            src={slot.upscaledUrl}
                            alt="Feljavított kép"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div style={{ position: 'absolute', bottom: 4, left: 4, padding: '2px 4px', background: 'rgba(34,197,94,0.85)', borderRadius: 3, fontSize: 8, color: '#fff', fontWeight: 600, zIndex: 3 }}>
                            ✨ Javított
                          </div>
                        </>
                      ) : null}
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
                    <div style={{ position: 'absolute', bottom: 5, left: (slot.upscaledUrl || slot.upscaleLoading) ? '52%' : 5, display: 'flex', gap: 3, zIndex: 2 }}>
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
              ) : (
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
                          : 'rgba(139,92,246,0.1)',
                      border: `1px solid ${
                        slot.upscaledUrl 
                          ? 'rgba(34,197,94,0.3)' 
                          : 'rgba(139,92,246,0.25)'
                      }`,
                      borderRadius: 6,
                      color: slot.upscaledUrl ? '#22c55e' : '#a78bfa',
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
        if (!slot || !slot.upscaledUrl) return null;

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
                    🔍 Kép felbontás összehasonlítás {isZoomed ? '• Görgess a nagyításhoz, húzd a mozgatáshoz' : '(kattints a képre a belenagyításhoz)'}
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
                {/* Left Pane (Original) */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)' }}>
                      Eredeti / Előfeldolgozott kép
                    </span>
                    <span style={{ fontSize: 10.5, padding: '2px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: 4, color: 'var(--text-muted)' }}>
                      Nincs feljavítva
                    </span>
                  </div>
                  <PanZoomImage
                    src={slot.preprocessedUrl || slot.rawBase64}
                    alt="Eredeti kép"
                    isZoomed={isZoomed}
                    onToggleZoom={() => setIsZoomed(!isZoomed)}
                  />
                </div>

                {/* Right Pane (Upscaled) */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>
                      ✨ Feljavított (DRCT 4x)
                    </span>
                    <span style={{ fontSize: 10.5, padding: '2px 8px', background: 'rgba(34,197,94,0.15)', borderRadius: 4, color: '#22c55e', fontWeight: 600 }}>
                      Nagy felbontás + megtartott élek
                    </span>
                  </div>
                  <PanZoomImage
                    src={slot.upscaledUrl}
                    alt="Feljavított kép"
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
        userEditedDescription: finalDesc,
      };
    }),
    scenePrompt, brandKit, aspectRatio: '2:3', width: 1024, height: 1536,
  };
}
