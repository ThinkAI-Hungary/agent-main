/**
 * ZomboQuickPostPage - Standalone Quick Post Generator
 * Route: /admin/marketing/zombo/quickpost
 *
 * Light+dark mode kompatibilis: csak CSS-valtozok, nincs hardcoded szin.
 * ImageSlotUploader onChange: updater pattern (prev => newArr).
 * console.log logok benne vannak a debugolashoz.
 */
import React, { Component, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../../../../components/ui/Toast';
import ImageSlotUploader, { type ImageSlot } from './ImageSlotUploader';
import { SatoriEditorPanel } from './SatoriEditorPanel';
import PlacidEditorPanel from './PlacidEditorPanel';
import { useAudit } from '../../../../context/AuditContext';
import { supabase } from '../../../../lib/supabase';
import { getBackendUrl, fixImageUrl } from '../types';
import '../zombo.css';

// ── ErrorBoundary: ha a component crashel, megmutatja a hibat (nem fekete kepernyo) ──
class QPPErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(err: any) {
    console.error('[QPP ErrorBoundary] Caught error:', err);
    return { hasError: true, error: String(err?.message || err) };
  }
  componentDidCatch(err: any, info: any) {
    console.error('[QPP ErrorBoundary] componentDidCatch:', err, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, background: '#0a0813', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.4)', borderRadius: 16, padding: '24px 32px', maxWidth: 600, width: '100%' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444', marginBottom: 12 }}>QuickPost Page - React Hiba</div>
            <div style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.6, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {this.state.error}
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              style={{ marginTop: 20, padding: '9px 20px', borderRadius: 9, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Ujraprobal (Reset)
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Nyisd meg a DevTools Console-t (F12) a reszletes stack trace-ert</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Icons (inline SVG - proper JSX) ──────────────────────────────────────────
const ArrowLeft = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
);
const DlIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const CpIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const ZapIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
const RefIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);
const LayersIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
  </svg>
);
const OkIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const PinIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="17" x2="12" y2="22" />
    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
  </svg>
);
const FolderPlusIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
);
const HashIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="15" x2="20" y2="15" />
    <line x1="10" y1="3" x2="8" y2="21" />
    <line x1="16" y1="3" x2="14" y2="21" />
  </svg>
);

// ── Modes ─────────────────────────────────────────────────────────────────────
const MODES = [
  {
    id: 'standard' as const,
    label: 'Uj hatter generalas',
    desc: 'Rembg + FLUX: korbevagas + uj hatter generalodik',
    icon: '✨',
    color: '#8b5cf6',
    colorAlpha: 'rgba(139,92,246,0.1)',
  },
  {
    id: 'smart' as const,
    label: 'Okos jelenet generalas',
    desc: 'Claude Vision elemzi a terméket → FLUX scene-aware háttér → Satori layerekre kész',
    icon: '🧠',
    color: '#f59e0b',
    colorAlpha: 'rgba(245,158,11,0.1)',
  },
  {
    id: 'textpreserve' as const,
    label: 'Szoveg-megorzeses regen',
    desc: 'BFL Fill Pro: termektest + hatter ujrageneralodik a jelenethez, feliratok piksel-pontosan megmaradnak',
    icon: '🔒',
    color: '#06b6d4',
    colorAlpha: 'rgba(6,182,212,0.1)',
  },
];
type ModeId = typeof MODES[number]['id'];

interface Result {
  imageUrl: string;
  caption?: string;
  textZonesDetected?: number;
  elapsed?: number;
  mode: ModeId;
  productAnalysis?: string; // smart mode: Claude Vision leiras
  decomposedLayerText?: string;
  decomposedLayerCta?: string;
  suggestedStyles?: { styleId: string; reason: string }[];
  productPosition?: {
    left: number;
    top: number;
    width: number;
    height: number;
    normalized: {
      xmin: number;
      xmax: number;
      ymin: number;
      ymax: number;
    };
  } | null;
  hashtags?: {
    facebook: string[];
    instagram: string[];
    x: string[];
  };
}

const API = (import.meta as any).env?.VITE_KEPGENERALAS_API_URL || 'http://localhost:3001';

// Shared styles - CSS variable alapu, theme-kompatibilis
const sLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
  letterSpacing: '0.06em', display: 'block', marginBottom: 7,
  color: 'var(--text-muted)',
};
const sInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 9,
  border: '1.5px solid var(--border)',
  background: 'var(--bg3)', color: 'var(--text)',
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

const TRANSPARENT_PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1080' height='1080' viewBox='0 0 1080 1080'><rect width='1080' height='1080' fill='%2318181b'/></svg>";

// ═══════════════════════════════════════════════════════════════════════════════
function ZomboQuickPostPageInner({ inlineMode = false }: { inlineMode?: boolean }) {
  const navigate = useNavigate();
  const { activeBrand, brandKits, activeKitId, result: auditResult } = useAudit();
  const activeBrandKit = brandKits?.find(k => k.id === activeKitId) || brandKits?.[0];

  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([]);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<ModeId>('smart');
  const [exactTextOnly, setExactTextOnly] = useState(false);
  const [useBrandColors, setUseBrandColors] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'2:3' | '9:16'>('2:3');
  const [brandName, setBrandName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);
  const [isGeneratingHashtags, setIsGeneratingHashtags] = useState(false);
  const [isSavingToMedia, setIsSavingToMedia] = useState(false);
  const [useCutoutAsBase, setUseCutoutAsBase] = useState(false);
  const [copied, setCopied] = useState(false);
  // Pin tesztkép: localStorage-bol betoltjuk az oldalnyitas utan (layer tesztekhez)
  // A localStorage-ban most mar a STABIL /renders/pinned/tesztkep.png URL van
  const [savedTestImage, setSavedTestImage] = useState<string | null>(
    () => {
      const stored = localStorage.getItem('qpp_pinned_test_image');
      if (!stored) return null;
      // Cache-bust az allandó URL-hez, hogy a browser ne cache-elje a régi verziót
      if (stored.includes('/renders/pinned/')) {
        return `${API}${stored.split(API).pop()?.split('?')[0]}?t=${localStorage.getItem('qpp_pinned_ts') || '0'}`;
      }
      return stored;
    }
  );
  const [pinnedLoaded, setPinnedLoaded] = useState(false); // debug: betoltott-e mar
  const [editorMode, setEditorMode] = useState<'satori' | 'placid' | 'none'>('none');

  const hasImage = !!result?.imageUrl || imageSlots.length > 0;

  React.useEffect(() => {
    if (!hasImage) {
      setEditorMode('none');
      setEditedImageUrl(null);
    }
  }, [hasImage]);

  const isPreprocessing = imageSlots.some(
    s => s.preprocessLoading || s.analysisLoading || s.upscaleLoading
  );
  const activeMode = MODES.find(m => m.id === mode)!;

  // Debug render log
  console.log('[QPP] render isLoading=', isLoading, 'result=', !!result, 'error=', error, 'slots=', imageSlots.length);

  const handleGenerate = useCallback(async () => {
    console.log('[QPP] handleGenerate called, slots:', imageSlots.length);
    const slot = imageSlots.find(s => s.preprocessedUrl || s.originalUrl);
    if (!slot && mode === 'textpreserve') {
      console.warn('[QPP] No slot with image found for textpreserve mode');
      showToast({ title: 'Hiba', message: 'Ehhez a modhoz toltsd fel a kepet elobb!', type: 'error' });
      return;
    }
    const productImageUrl = slot ? (slot.preprocessedUrl || slot.originalUrl || '') : '';
    console.log('[QPP] productImageUrl (first 80):', productImageUrl.substring(0, 80));

    setIsLoading(true);
    setError(null);
    setResult(null);
    setEditedImageUrl(null);

    try {
      if (mode === 'smart') {
        // OKOS JELENET pipeline (javitott):
        // 1. Claude Vision elemzi a termeket (productAwareBg=true) → megérti a fizikai jellemzőket
        // 2. scenePrompt = SCENARIO FIRST: a felhasználó jelenete FELÜLÍRJA a DNA-t
        // 3. preserveOriginal=FALSE → FLUX teljesen új képet generál a termékről
        //    (NEM paste-el — az inputImage referencia kép, amiből a terméket megérti)
        // 4. Eredmény: a termék BELE VAN GENERÁLVA a jelenetbe, természetes szervülással
        setStatusMsg(slot ? 'Claude Vision: termek elemzese + FLUX jelenet generalas...' : 'FLUX jelenet generalas...');
        console.log('[QPP] smart mode → composite-generate preserveOriginal=FALSE productAwareBg=true (scratch gen)');

        // A scenePrompt: SCENARIO FIRST elv — ha van user prompt, az a legfontosabb
        // A "SCENE OVERRIDE:" prefix jelzi a backendnek hogy a scenario felülírja a DNA-t
        const smartScenePrompt = prompt
          ? `SCENE OVERRIDE: ${prompt}`
          : 'professional product photography, clean background';

        const smartPayload = {
          slots: slot ? imageSlots.map(s => ({
            originalUrl: s.originalUrl,
            preprocessedUrl: s.preprocessedUrl,
            upscaledUrl: s.upscaledUrl,
            isDefault: s.isDefault,
            analysis: s.analysis,               // Claude Vision termék elemzés
            lightingAnalysis: (s as any).lightingAnalysis, // fizika-alapú LA ha letezik
          })) : [],
          scenePrompt: smartScenePrompt,
          brandKit: activeBrandKit || (brandName ? { name: brandName, visualRules: [], tone: [] } : undefined),
          preserveOriginal: false,              // KULCS: FLUX teljesen újat generál, NEM paste-el
          productAwareBg: !!slot,                 // Claude Vision elemzi a termeket → fizika-alapú jelenet
          exactTextOnly,
          useBrandColors,
          aspectRatio,
          width: aspectRatio === '2:3' ? 1024 : 1080,
          height: aspectRatio === '2:3' ? 1536 : 1920,
        };
        console.log('[QPP] smart payload scenePrompt:', smartScenePrompt);

        const smartResp = await fetch(`${API}/api/image/composite-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(smartPayload),
        });
        const smartData = await smartResp.json();
        console.log('[QPP] smart response:', smartResp.status, JSON.stringify(smartData).substring(0, 300));
        if (!smartResp.ok || smartData.error) throw new Error(smartData.error || 'Smart generalas sikertelen');

        const smartRaw = smartData.imageUrl || '';
        const smartUrl = smartRaw.startsWith('http') ? smartRaw : `${API}${smartRaw}`;
        setResult({
          imageUrl: smartUrl,
          elapsed: smartData.elapsed || smartData.generationTime || 0,
          mode: 'smart',
          decomposedLayerText: smartData.decomposedLayerText,
          decomposedLayerCta: smartData.decomposedLayerCta,
          suggestedStyles: smartData.suggestedStyles,
          productPosition: smartData.productPosition,
          hashtags: smartData.hashtags
        });
        setEditedImageUrl(null);
        showToast({ title: 'Kesz!', message: 'Termek-tudatos jelenet generalva. Satori layerekre kesz!', type: 'success' });

      } else if (mode === 'textpreserve') {
        // TEXT-PRESERVE pipeline (javitott):
        // 1. Claude Vision: CSAK a nyomtatott szoveg/logo pixelek detektalasa (szoros hatarokkal)
        // 2. BFL Fill Pro mask: fekete=szovegzona (2% margin), feher=minden mas (termektest + hatter)
        // 3. BFL Fill Pro: a termektest es hatter ujrageneralodik az uj jelenethez,
        //    a szoveg/felirat piksel-pontosan megmarad
        setStatusMsg('Claude Vision: szoveg zonak detektalasa...');
        const fullUrl = productImageUrl.startsWith('http')
          ? productImageUrl
          : `${API}${productImageUrl}`;
        console.log('[QPP] POST /api/image/text-preserve-regen fullUrl:', fullUrl.substring(0, 80));

        const resp = await fetch(`${API}/api/image/text-preserve-regen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productImageUrl: fullUrl,
            scenePrompt: prompt || '',
            brandContext: { name: brandName },
          }),
        });
        const data = await resp.json();
        console.log('[QPP] text-preserve response:', resp.status, data);
        if (!resp.ok || data.error) throw new Error(data.error || data.details || 'Szerver hiba');

        const imageUrl = data.imageUrl.startsWith('http')
          ? data.imageUrl
          : `${API}${data.imageUrl}`;
        setResult({ imageUrl, textZonesDetected: data.textZonesDetected, elapsed: data.elapsed, mode: 'textpreserve' });
        setEditedImageUrl(null);
        showToast({ title: 'Kesz!', message: `${data.textZonesDetected} szovegzona megorizve. ${(data.elapsed / 1000).toFixed(1)}s`, type: 'success' });

      } else {
        setStatusMsg('FLUX generalas folyamatban...');
        const payload = {
          slots: slot ? imageSlots.map(s => ({
            originalUrl: s.originalUrl,
            preprocessedUrl: s.preprocessedUrl,
            isDefault: s.isDefault,
          })) : [],
          scenePrompt: prompt || 'professional product photo with clean background',
          brandKit: activeBrandKit || (brandName ? { name: brandName, visualRules: [], tone: [] } : undefined),
          preserveOriginal: true,
          productAwareBg: false,
          exactTextOnly,
          useBrandColors,
          aspectRatio,
          width: aspectRatio === '2:3' ? 1024 : 1080,
          height: aspectRatio === '2:3' ? 1536 : 1920,
        };
        console.log('[QPP] POST /api/image/composite-generate');

        const resp = await fetch(`${API}/api/image/composite-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await resp.json();
        console.log('[QPP] composite-generate response:', resp.status, JSON.stringify(data).substring(0, 200));
        if (!resp.ok || data.error) throw new Error(data.error || 'Generalas sikertelen');

        const raw = data.imageUrl || '';
        const imageUrl = raw.startsWith('http') ? raw : `${API}${raw}`;
        setResult({
          imageUrl,
          elapsed: data.elapsed || data.generationTime || 0,
          mode: 'standard',
          decomposedLayerText: data.decomposedLayerText,
          decomposedLayerCta: data.decomposedLayerCta,
          suggestedStyles: data.suggestedStyles,
          productPosition: data.productPosition,
          hashtags: data.hashtags
        });
        setEditedImageUrl(null);
        showToast({ title: 'Kesz!', message: 'Kep legeneralt.', type: 'success' });
      }
    } catch (err: any) {
      console.error('[QPP] Generation error:', err);
      const msg = err.message || 'Ismeretlen hiba';
      setError(msg);
      showToast({ title: 'Hiba', message: msg, type: 'error' });
    } finally {
      setIsLoading(false);
      setStatusMsg('');
    }
  }, [imageSlots, prompt, mode, brandName, exactTextOnly, useBrandColors, activeBrandKit]);

  const handleGenerateHashtagsOnly = useCallback(async () => {
    if (!prompt.trim()) return;
    setIsGeneratingHashtags(true);
    setError(null);
    try {
      console.log('[QPP] POST /api/image/hashtags-only');
      const resp = await fetch(`${API}/api/image/hashtags-only`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenePrompt: prompt,
          brandKit: activeBrandKit || (brandName ? { name: brandName, visualRules: [], tone: [] } : undefined),
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Hashtag generálás sikertelen');
      console.log('[QPP] hashtags-only response:', data.hashtags);
      
      setResult(prev => ({
        imageUrl: prev?.imageUrl || '',
        mode: prev?.mode || 'none',
        ...prev,
        hashtags: data.hashtags
      }));
      showToast({ title: 'Kész!', message: 'Hashtag ajánlások legenerálva.', type: 'success' });
    } catch (err: any) {
      console.error('[QPP] Hashtags only error:', err);
      const msg = err.message || 'Ismeretlen hiba';
      showToast({ title: 'Hiba', message: msg, type: 'error' });
    } finally {
      setIsGeneratingHashtags(false);
    }
  }, [prompt, activeBrandKit, brandName]);

  const handleDownload = () => {
    const activeUrl = editedImageUrl || result?.imageUrl;
    if (!activeUrl) return;
    const a = document.createElement('a');
    a.href = activeUrl;
    a.download = `quickpost-${Date.now()}.jpg`;
    a.click();
  };

  // Pin: elmenti az aktualis result kepet tesztkepkent -- FAJLBA MENTI a backenden!
  const handlePinTestImage = async () => {
    const activeUrl = editedImageUrl || result?.imageUrl;
    if (!activeUrl) return;
    const absUrl = activeUrl.startsWith('http')
      ? activeUrl
      : `${API}${activeUrl}`;

    const activeSlot = imageSlots.find(s => s.preprocessedUrl || s.originalUrl);
    const activeProductUrl = activeSlot ? (activeSlot.preprocessedUrl || activeSlot.originalUrl) : null;

    showToast({ title: 'Mentes folyamatban...', message: 'Kep atmasolasa a perzisztens tarhelyre.', type: 'success' });

    try {
      // Backend: lemásolja renders/pinned/tesztkep.png-be (szerver restart utan is megmarad)
      const resp = await fetch(`${API}/api/image/pin-test-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: absUrl }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const ts = String(Date.now());
        const pinnedUrl = `${API}${data.imageUrl}?t=${ts}`;
        localStorage.setItem('qpp_pinned_test_image', data.imageUrl); // relativ ut
        localStorage.setItem('qpp_pinned_ts', ts);
        if (result.productPosition) {
          localStorage.setItem('qpp_pinned_test_image_position', JSON.stringify(result.productPosition));
        } else {
          localStorage.removeItem('qpp_pinned_test_image_position');
        }
        if (activeProductUrl) {
          localStorage.setItem('qpp_pinned_test_image_product_url', activeProductUrl);
        } else {
          localStorage.removeItem('qpp_pinned_test_image_product_url');
        }
        setSavedTestImage(pinnedUrl);
        showToast({ title: 'Tesztkep elmentve!', message: 'Fajlba mentve -- szerver restart utan is megmarad.', type: 'success' });
      } else {
        // Fallback: URL mentese (regi viselkedes)
        localStorage.setItem('qpp_pinned_test_image', absUrl);
        if (result.productPosition) {
          localStorage.setItem('qpp_pinned_test_image_position', JSON.stringify(result.productPosition));
        } else {
          localStorage.removeItem('qpp_pinned_test_image_position');
        }
        if (activeProductUrl) {
          localStorage.setItem('qpp_pinned_test_image_product_url', activeProductUrl);
        } else {
          localStorage.removeItem('qpp_pinned_test_image_product_url');
        }
        setSavedTestImage(absUrl);
        showToast({ title: 'Mentve (URL)', message: 'Fajlba mentes sikertelen, URL mentve.', type: 'success' });
      }
    } catch {
      // Fallback: URL mentese
      localStorage.setItem('qpp_pinned_test_image', absUrl);
      if (result.productPosition) {
        localStorage.setItem('qpp_pinned_test_image_position', JSON.stringify(result.productPosition));
      } else {
        localStorage.removeItem('qpp_pinned_test_image_position');
      }
      if (activeProductUrl) {
        localStorage.setItem('qpp_pinned_test_image_product_url', activeProductUrl);
      } else {
        localStorage.removeItem('qpp_pinned_test_image_product_url');
      }
      setSavedTestImage(absUrl);
      showToast({ title: 'Mentve (URL)', message: 'Fajlba mentes sikertelen, URL mentve.', type: 'success' });
    }
  };

  const handleSaveToMediaLibrary = async () => {
    const activeUrl = result?.imageUrl;
    if (!activeUrl) return;

    setIsSavingToMedia(true);
    showToast({ title: 'Mentés folyamatban...', message: 'Kép feltöltése és AI szortírozás...', type: 'success' });

    try {
      // 1. Fetch the image and convert to blob/base64
      const response = await fetch(activeUrl);
      const blob = await response.blob();

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // 2. Upload using backend
      const backendUrl = getBackendUrl();
      const filename = `quickpost-${Date.now()}.png`;
      const uploadResp = await fetch(`${backendUrl}/marketing/api/zombo/upload-base64`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, filename }),
      });

      if (!uploadResp.ok) throw new Error(await uploadResp.text());
      const uploadData = await uploadResp.json();

      // 3. Insert into Supabase media_files
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || null;

      const { data: dbFile, error } = await supabase.from('media_files').insert({
        name: filename.replace(/\.[^/.]+$/, "") + ".webp",
        url: uploadData.url,
        folder_id: null,
        size: blob.size,
        type: 'image/webp',
        user_id: userId,
        brand_id: activeBrand?.id || null,
        is_logo: false
      }).select().single();

      if (error) throw error;
      if (!dbFile) throw new Error('Nem sikerült létrehozni a médiatár rekordot.');

      // 4. Retrieve existing folders for this brand
      const { data: dbFolders } = await supabase
        .from('media_folders')
        .select('id, name')
        .eq('brand_id', activeBrand?.id);
      const existingFolderNames = dbFolders ? dbFolders.map(f => f.name) : [];

      // 5. Call smart-sort endpoint to categorize the file
      const sortResp = await fetch(`${backendUrl}/marketing/api/zombo/smart-sort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [{ id: dbFile.id, url: dbFile.url }],
          existingFolderNames
        })
      });

      if (sortResp.ok) {
        const sortData = await sortResp.json();
        if (sortData.success && sortData.mappings && sortData.mappings[0]) {
          const mapping = sortData.mappings[0];
          const cat = mapping.category;
          const lowerCat = cat.toLowerCase();

          // Find or create folder
          let targetFolder = dbFolders?.find(f => f.name.toLowerCase() === lowerCat);
          let folderId = targetFolder?.id;

          if (!folderId) {
            const { data: newFolder, error: insertErr } = await supabase
              .from('media_folders')
              .insert({
                name: cat,
                brand_id: activeBrand?.id,
                user_id: userId,
                is_logo: false
              })
              .select()
              .single();

            if (!insertErr && newFolder) {
              folderId = newFolder.id;
            }
          }

          if (folderId) {
            await supabase
              .from('media_files')
              .update({ folder_id: folderId })
              .eq('id', dbFile.id);
            showToast({
              title: 'AI Szortírozva!',
              message: `A kép bekerült a Médiatár "${cat}" mappájába!`,
              type: 'success'
            });
            return;
          }
        }
      }

      showToast({ title: 'Sikeres mentés!', message: 'A kép bekerült a Médiatár gyökerébe!', type: 'success' });
    } catch (err: any) {
      console.error('[QPP] Save to Media Library failed:', err);
      showToast({ title: 'Hiba a mentésnél', message: err.message || 'Ismeretlen hiba', type: 'error' });
    } finally {
      setIsSavingToMedia(false);
    }
  };

  const getBaseImageUrl = () => {
    if (result?.imageUrl) {
      return result.imageUrl.startsWith('http') ? result.imageUrl : `${API}${result.imageUrl}`;
    }
    const slot = imageSlots[0];
    if (slot) {
      const url = useCutoutAsBase ? (slot.preprocessedUrl || slot.originalUrl) : slot.originalUrl;
      const fixed = fixImageUrl(url);
      if (fixed) return fixed;
      if (slot.rawBase64) return slot.rawBase64;
    }
    return TRANSPARENT_PLACEHOLDER;
  };


  // Load pinned: betolti a mentett tesztkepert result-ba
  const handleLoadPinned = () => {
    if (!savedTestImage) return;
    let savedPosition = null;
    try {
      const posStr = localStorage.getItem('qpp_pinned_test_image_position');
      if (posStr) savedPosition = JSON.parse(posStr);
    } catch (e) {
      console.error('[QPP] Failed to load pinned test image position:', e);
    }
    setResult({ imageUrl: savedTestImage, mode: 'standard', productPosition: savedPosition });
    setError(null);
    setPinnedLoaded(true);
    showToast({ title: 'Tesztkep betoltve', message: 'A mentett kep betoltve layer teszthez.', type: 'success' });

    if (imageSlots.length === 0) {
      handleLoadDefaultProduct();
    }
  };

  // Unpin: torli a mentett tesztkepert
  const handleUnpin = () => {
    localStorage.removeItem('qpp_pinned_test_image');
    localStorage.removeItem('qpp_pinned_test_image_position');
    localStorage.removeItem('qpp_pinned_test_image_product_url');
    setSavedTestImage(null);
    setPinnedLoaded(false);
    showToast({ title: 'Teszkep torolve', message: '', type: 'success' });
  };

  const handleLoadDefaultProduct = () => {
    const defaultSlot = {
      id: 'default-innentaler-slot',
      rawBase64: '',
      fileName: 'innentaler-paint-bucket.png',
      originalUrl: '/renders/uploaded-1784063008186.png',
      preprocessedUrl: '/renders/uploaded-1784063008202.png',
      upscaledUrl: null,
      upscaleLoading: false,
      suggestUpscale: false,
      analysisLoading: false,
      preprocessLoading: false,
      role: 'product' as const,
      userEditedDescription: 'A white plastic paint bucket with a dark navy blue lid and label, 1 liter interior wall paint with isolating properties, matte white finish.',
      alternativeTextDescription: 'A szöveg a vödör elülső oldalán lévő címkén helyezkedik el: a márkanév felül középen, a terméknév középen nagy betűkkel, a termékleírás és tulajdonságok a jobb oldalon, a fedőképesség és térfogat a bal oldalon található.',
      locked: true,
      isDefault: true,
      error: null,
      analysis: {
        imageType: 'product' as const,
        subject: 'A white plastic paint bucket with a dark navy blue lid and label, 1 liter interior wall paint with isolating properties, matte white finish.',
        altText: 'A 1-liter white plastic paint bucket with a dark navy blue snap-on lid. The label features a white and navy blue design with teal/cyan accent colors, displaying product name, coverage information, and usage icons including a person painting a wall.',
        dominantColors: ['#ffffff', '#0c2b5c', '#008ac6'],
        compositeRole: 'primary' as const,
        changeabilityRules: {
          canChangeBackground: true,
          canChangeColors: false,
          canChangeShape: false,
          canChangeTexture: false,
          mustPreserveExactly: ['navy blue lid color', 'white bucket body'],
          allowedModifications: ['background color or scene', 'lighting and shadow adjustments']
        },
        fluxPromptSuffix: 'a white plastic paint bucket of interior wall paint, dark blue lid, clean label',
        fluxNegativeSuffix: 'blurry, low quality, distorted text, wrong label spelling',
        confidence: 96,
        locked: true,
        hasText: true,
        extractedText: 'POLI-FARBE INNTALER IZOLÁLÓ BELSŐ FALFESTÉK MATT FEHÉR 1L FEDŐKÉPESSÉG: LEGFELJEBB 8 m²/L Nikotin- és koromfoltokra Beázás nyomaira Zsíros szennyeződésekre Fedő szálképesség',
        textPlacement: 'A szöveg a vödör elülső oldalán lévő címkén helyezkedik el: a márkanév felül középen, a terméknév középen nagy betűkkel, a termékleírás és tulajdonságok a jobb oldalon, a fedőképesség és térfogat a bal oldalon található.',
        textLegibility: 'clear' as const,
        lightingAnalysis: {
          lightSource: {
            type: 'area' as const,
            directionAngle: 45,
            directionLabel: 'top-left' as const,
            xPercent: 25,
            yPercent: 25,
            temperatureK: 5500,
            temperatureLabel: 'neutral white' as const,
            colorCastRgb: [255, 255, 255] as [number, number, number],
            intensity: 'soft' as const,
            sourceSizeLabel: 'large_area' as const,
            isThreePoint: true,
            keyLightIntensity: 80,
            fillLightIntensity: 40,
            rimLightIntensity: 30,
            fillRatio: 0.5,
            hasVolumetricLight: false,
            hasMultipleSourcesIBL: true
          },
          shadow: {
            hasDropShadow: true,
            dropDirection: 'back' as const,
            dropLengthRatio: 0.8,
            dropLengthPx: 100,
            dropOffsetX: 20,
            dropOffsetY: 20,
            dropOpacity: 0.4,
            dropBlurPx: 15,
            dropWidthMultiplier: 1.1,
            contactShadow: {
              widthMultiplier: 0.7,
              heightMultiplier: 0.05,
              opacity: 0.8,
              blurPx: 4
            },
            aoHalo: {
              widthMultiplier: 0.95,
              heightMultiplier: 0.14,
              opacity: 0.45,
              blurPx: 20
            },
            penumbraWidth: 'medium' as const,
            umbraDarkness: 75,
            formShadowPresent: false,
            formShadowSide: 'none' as const
          },
          material: {
            roughness: 0.4,
            metallic: 0.0,
            ior: 1.5,
            specularIntensity: 0.5,
            albedoRgb: [240, 240, 240] as [number, number, number],
            hasSSS: false,
            sssStrength: 'none' as const,
            sssColorShift: 'none' as const,
            fresnelEdgeGlow: false,
            fresnelIntensity: 'subtle' as const,
            materialType: 'glossy_plastic' as const,
            specular: {
              zoneTopPct: 15,
              widthMultiplier: 0.5,
              opacity: 0.3,
              blurPx: 5,
              hasSharpGlint: false
            }
          },
          colorThermal: {
            ambientTintRgb: [255, 255, 255] as [number, number, number],
            ambientTintOpacity: 0.0,
            ambientDarkness: 0,
            hasColorBleeding: false,
            bleedingSourceColor: null,
            bleedingOpacity: 0.0,
            simultaneousContrastCorrection: false,
            bgDominantColor: [128, 128, 128] as [number, number, number],
            sceneDynamicRange: 'medium' as const
          },
          compositing: {
            rimDarkening: {
              side: 'none' as const,
              widthMultiplier: 0.1,
              opacity: 0.0,
              blurPx: 0
            },
            formShadowGradient: {
              enabled: false,
              direction: 'top-to-bottom' as const,
              topBrightness: 1.0,
              bottomBrightness: 1.0,
              opacity: 0.0
            },
            rimLight: {
              side: 'none' as const,
              widthMultiplier: 0.1,
              opacity: 0.0,
              blurPx: 0
            },
            lightWrap: {
              bgBlurPx: 60,
              expandPx: 20,
              opacity: 0.15
            },
            tableReflection: {
              enabled: false,
              heightMultiplier: 0.0,
              opacity: 0.0,
              blurPx: 0,
              surfaceType: 'concrete' as const
            },
            overallLayerCount: 8
          },
          placement: {
            cameraAngle: 'eye-level' as const,
            cameraFOV: 'normal' as const,
            perspectiveDistortion: 'slight' as const,
            productTopYPct: 35,
            productBottomYPct: 85,
            surfaceYPct: 85,
            headroomPct: 35,
            tablespacePct: 15,
            productCenterXPct: 50,
            compositionStyle: 'centered' as const,
            productScalePct: 50
          },
          prompts: {
            bgLightingPrompt: 'soft studio lighting from the top-left, realistic ambient occlusion',
            bgNegativePrompt: 'harsh direct sunlight, pitch black shadows',
            materialPromptSuffix: 'a glossy white plastic bucket',
            volumetricLightPrompt: '',
            sssEdgePrompt: '',
            fresnelPrompt: '',
            threePointPrompt: 'three-point studio lighting setup',
            compositionPrompt: 'centered composition, product stands on the surface',
            fullBgPrompt: 'soft studio lighting from the top-left, three-point studio lighting setup, centered composition, product stands on the surface'
          },
          checkup: {
            expectedShadowBehavior: 'soft drop shadow extending to the back-right',
            expectedSpecularZone: 'soft specular highlight on the upper-left of the cylinder',
            expectedGradient: 'smooth light-to-shadow transition across the cylindrical body',
            expectedAmbientTint: 'neutral ambient tinting',
            activeRisks: [],
            shadowPhysicsMinScore: 20,
            integrationMinScore: 20,
            contactShadowMinScore: 15,
            specularMinScore: 12,
            placementMinScore: 12,
            totalMinScore: 75,
            criticalFailConditions: []
          },
          meta: {
            analysisVersion: '2.0',
            analysisTimestamp: '2026-07-14T23:30:00Z',
            claudeConfidence: 0.95,
            bookChaptersUsed: ['Chapter 3: Studio Lighting', 'Chapter 5: Shadow Synthesis'],
            lightingScenario: 'three_point' as const
          }
        }
      }
    };
    setImageSlots([defaultSlot]);
    setBrandName('Poli-Farbe');
    showToast({ title: 'Vödör betöltve', message: 'Alapértelmezett Poli-Farbe vödör (rembg cutout és AI adatokkal együtt) sikeresen betöltve!', type: 'success' });
  };

  const handleCopy = () => {
    if (!result?.caption) return;
    navigator.clipboard.writeText(result.caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canGenerate = (imageSlots.some(s => s.preprocessedUrl || s.originalUrl) || prompt.trim().length > 0)
    && !isPreprocessing
    && !isLoading;

  return (
    <div style={{ minHeight: inlineMode ? 'auto' : '100vh', background: inlineMode ? 'transparent' : 'var(--bg)', color: 'var(--text)', fontFamily: "'Inter','Outfit',sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      {!inlineMode && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '14px 28px',
          borderBottom: '1px solid var(--border)', background: 'var(--card)',
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          <button
            onClick={() => navigate('/marketing/social-planner')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            <ArrowLeft size={14} /> Vissza
          </button>

          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
              ⚡
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Quick Post Generator</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>/admin/marketing/zombo/quickpost</div>
            </div>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {result && (
              <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>
                Kesz
              </span>
            )}
            {isLoading && (
              <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: 'rgba(6,182,212,0.12)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.25)' }}>
                Folyamatban...
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Two-column body ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', minHeight: inlineMode ? '600px' : 'calc(100vh - 65px)' }}>

        {/* ════ LEFT: INPUT ════ */}
        <div style={{
          padding: '24px 20px', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 18,
          overflowY: 'auto', maxHeight: inlineMode ? 'calc(100vh - 200px)' : 'calc(100vh - 65px)',
          background: 'var(--card)',
        }}>

          {/* Image */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ ...sLabel, marginBottom: 0 }}>Termekkep</label>
              <button
                onClick={handleLoadDefaultProduct}
                disabled={isLoading}
                style={{
                  background: 'rgba(59,130,246,0.1)',
                  color: '#3b82f6',
                  border: '1px solid rgba(59,130,246,0.3)',
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'all 0.2s',
                }}
              >
                💾 Alapértelmezett vödör
              </button>
            </div>
            <ImageSlotUploader
              slots={imageSlots}
              onChange={(updater) => {
                console.log('[QPP] ImageSlotUploader onChange called');
                setImageSlots(updater);
              }}
              onSetDefault={(slot) => {
                console.log('[QPP] onSetDefault slot.id=', slot.id);
                setImageSlots(prev => prev.map(s => ({ ...s, isDefault: s.id === slot.id })));
              }}
              maxSlots={1}
              disabled={isLoading}
              label="Kep feltoltese"
            />
            {imageSlots.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <input
                  type="checkbox"
                  id="useCutoutAsBase"
                  checked={useCutoutAsBase}
                  onChange={e => setUseCutoutAsBase(e.target.checked)}
                  style={{ cursor: 'pointer', width: 14, height: 14, accentColor: '#8b5cf6' }}
                />
                <label htmlFor="useCutoutAsBase" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', cursor: 'pointer', userSelect: 'none' }}>
                  Körbevágott termékkép használata alapként
                </label>
              </div>
            )}
          </section>

          {/* Brand */}
          <section>
            <label style={sLabel}>Brand neve (opcionalis)</label>
            <input
              type="text"
              value={brandName}
              onChange={e => setBrandName(e.target.value)}
              placeholder="pl. Poli-Farbe"
              disabled={isLoading}
              style={sInput}
            />
          </section>

          {/* Prompt */}
          <section>
            <label style={sLabel}>Jelenet / Kontextus (opcionalis)</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="pl. festekvedro muhely, vilagos hatter"
              rows={3}
              disabled={isLoading}
              style={{ ...sInput, resize: 'vertical', fontFamily: 'inherit', marginBottom: 8 }}
            />
            {/* Clickable contact detail chips */}
            {result?.selected_contacts && (
              <div style={{ marginTop: 6, marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>
                  Beilleszthető Kapcsolati Adatok
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {result.selected_contacts.emails?.map((email, idx) => (
                    <button
                      key={`email-${idx}`}
                      type="button"
                      onClick={() => setPrompt(p => p ? `${p}\n${email}` : email)}
                      style={{
                        background: 'rgba(139, 92, 246, 0.08)',
                        color: '#a78bfa',
                        border: '1px solid rgba(139, 92, 246, 0.2)',
                        padding: '4px 10px',
                        borderRadius: 8,
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      title="E-mail beillesztése a kontextusba"
                    >
                      ✉️ {email}
                    </button>
                  ))}
                  {result.selected_contacts.phones?.map((phone, idx) => (
                    <button
                      key={`phone-${idx}`}
                      type="button"
                      onClick={() => setPrompt(p => p ? `${p}\n${phone}` : phone)}
                      style={{
                        background: 'rgba(139, 92, 246, 0.08)',
                        color: '#a78bfa',
                        border: '1px solid rgba(139, 92, 246, 0.2)',
                        padding: '4px 10px',
                        borderRadius: 8,
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      title="Telefonszám beillesztése a kontextusba"
                    >
                      📞 {phone}
                    </button>
                  ))}
                  {result.selected_contacts.addresses?.map((address, idx) => (
                    <button
                      key={`address-${idx}`}
                      type="button"
                      onClick={() => setPrompt(p => p ? `${p}\n${address}` : address)}
                      style={{
                        background: 'rgba(139, 92, 246, 0.08)',
                        color: '#a78bfa',
                        border: '1px solid rgba(139, 92, 246, 0.2)',
                        padding: '4px 10px',
                        borderRadius: 8,
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      title="Cím beillesztése a kontextusba"
                    >
                      📍 {address}
                    </button>
                  ))}
                  {(!result.selected_contacts.emails?.length &&
                    !result.selected_contacts.phones?.length &&
                    !result.selected_contacts.addresses?.length) && (
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                        Nincs kijelölt kapcsolati adat az auditban.
                      </span>
                    )}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 2px 0' }}>
              <input
                type="checkbox"
                id="exactTextOnlyMain"
                checked={exactTextOnly}
                onChange={e => setExactTextOnly(e.target.checked)}
                disabled={isLoading}
                style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#8b5cf6' }}
              />
              <label htmlFor="exactTextOnlyMain" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', cursor: 'pointer', userSelect: 'none' }}>
                Csak a megadott szöveg használata (szigorú mód)
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 2px 0' }}>
              <input
                type="checkbox"
                id="useBrandColorsMain"
                checked={useBrandColors}
                onChange={e => setUseBrandColors(e.target.checked)}
                disabled={isLoading}
                style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#8b5cf6' }}
              />
              <label htmlFor="useBrandColorsMain" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', cursor: 'pointer', userSelect: 'none' }}>
                Márka színek használata a generált háttérben
              </label>
            </div>

            {/* Képarány választó */}
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Képarány</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setAspectRatio('2:3')}
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1.5px solid ' + (aspectRatio === '2:3' ? '#8b5cf6' : 'var(--border)'),
                    background: aspectRatio === '2:3' ? 'rgba(139,92,246,0.12)' : 'transparent',
                    color: aspectRatio === '2:3' ? '#a78bfa' : 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  2:3 (Portré)
                </button>
                <button
                  type="button"
                  onClick={() => setAspectRatio('9:16')}
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1.5px solid ' + (aspectRatio === '9:16' ? '#8b5cf6' : 'var(--border)'),
                    background: aspectRatio === '9:16' ? 'rgba(139,92,246,0.12)' : 'transparent',
                    color: aspectRatio === '9:16' ? '#a78bfa' : 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  9:16 (Story / TikTok)
                </button>
              </div>
            </div>
            
            <button
              type="button"
              onClick={handleGenerateHashtagsOnly}
              disabled={isLoading || isGeneratingHashtags || !prompt.trim()}
              style={{
                marginTop: 10,
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1.5px solid rgba(167,139,250,0.3)',
                background: 'rgba(167,139,250,0.06)',
                color: '#a78bfa',
                fontSize: 11,
                fontWeight: 700,
                cursor: (isLoading || isGeneratingHashtags || !prompt.trim()) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.2s',
                opacity: (!prompt.trim() || isLoading || isGeneratingHashtags) ? 0.5 : 1
              }}
            >
              {isGeneratingHashtags ? (
                <>Hashtagek keresése...</>
              ) : (
                <>
                  <HashIcon size={12} /> Csak Hashtag generálás (kép nélkül)
                </>
              )}
            </button>
          </section>

          {/* Mode */}
          <section>
            <label style={sLabel}>Generalasi mod</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MODES.filter(m => m.id === 'smart').map(m => (
                <div
                  key={m.id}
                  onClick={() => { if (!isLoading) { console.log('[QPP] mode set:', m.id); setMode(m.id); } }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '11px 13px', borderRadius: 11,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    border: `1.5px solid ${mode === m.id ? m.color : 'var(--border)'}`,
                    background: mode === m.id ? m.colorAlpha : 'transparent',
                    transition: 'all 0.15s',
                    opacity: isLoading ? 0.6 : 1,
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                    border: `2px solid ${mode === m.id ? m.color : 'var(--border)'}`,
                    background: mode === m.id ? m.color : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {mode === m.id && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: mode === m.id ? m.color : 'var(--text)' }}>
                      {m.icon} {m.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                      {m.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Generate button */}
          <button
            id="quickpost-generate-btn"
            onClick={handleGenerate}
            disabled={!canGenerate}
            style={{
              width: '100%', padding: '13px', borderRadius: 12, border: 'none',
              background: canGenerate
                ? (mode === 'textpreserve'
                  ? 'linear-gradient(135deg,#06b6d4,#0891b2)'
                  : mode === 'smart'
                    ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                    : 'linear-gradient(135deg,#8b5cf6,#6d28d9)')
                : 'var(--bg3)',
              color: canGenerate ? (mode === 'smart' ? '#000' : '#fff') : 'var(--text-muted)',
              fontSize: 13, fontWeight: 800,
              cursor: canGenerate ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.2s',
            }}
          >
            {isLoading
              ? (<><div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Generalas...</>)
              : (<><ZapIcon size={15} /> {mode === 'textpreserve' ? 'Szoveg-megorzeses Generalas' : mode === 'smart' ? 'Okos Jelenet Generalas' : 'Kep Generalas'}</>)
            }
          </button>

          {isPreprocessing && (
            <div style={{ fontSize: 11, color: '#f59e0b', textAlign: 'center' }}>
              Kep feldolgozas... varj...
            </div>
          )}
        </div>

        {/* ════ RIGHT: RESULT ════ */}
        <div style={{
          padding: '28px 32px', display: 'flex', flexDirection: 'column',
          overflowY: 'auto', maxHeight: 'calc(100vh - 65px)',
          background: 'var(--bg)',
        }}>

          {/* Loading state */}
          {isLoading && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '60px 0' }}>
              <div style={{
                width: 80, height: 80, borderRadius: 24, fontSize: 38,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: mode === 'textpreserve'
                  ? 'linear-gradient(135deg,#06b6d4,#0891b2)'
                  : 'linear-gradient(135deg,#8b5cf6,#ec4899)',
                animation: 'qp-pulse 1.5s ease-in-out infinite',
              }}>
                {mode === 'textpreserve' ? '🔍' : '⚡'}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
                  {mode === 'textpreserve' ? 'Szoveg-megorzeses generalas...' : 'Kep generalas...'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 360 }}>
                  {mode === 'textpreserve'
                    ? 'Claude Vision → Maszk → BFL Fill Pro. ~20-40 mp.'
                    : 'Rembg + FLUX generalas. ~15-30 mp.'}
                </div>
                {statusMsg && (
                  <div style={{ marginTop: 10, fontSize: 11, color: activeMode.color, fontWeight: 600 }}>
                    {statusMsg}
                  </div>
                )}
              </div>
              <div style={{ width: '100%', maxWidth: 380, height: 4, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: '40%', borderRadius: 4,
                  background: mode === 'textpreserve'
                    ? 'linear-gradient(90deg,#06b6d4,#0891b2)'
                    : 'linear-gradient(90deg,#8b5cf6,#ec4899)',
                  animation: 'qp-progress-indeterminate 2s ease-in-out infinite',
                }} />
              </div>
            </div>
          )}

          {/* Error state */}
          {!isLoading && error && (
            <div style={{ padding: '20px', borderRadius: 14, margin: '20px 0', background: 'rgba(239,68,68,0.07)', border: '1.5px solid rgba(239,68,68,0.2)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>Hiba tortent</div>
              <div style={{ fontSize: 12, color: '#ef4444', opacity: 0.8, lineHeight: 1.5 }}>{error}</div>
              <button
                onClick={() => setError(null)}
                style={{ marginTop: 12, padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                OK, zard be
              </button>
            </div>
          )}

          {/* Result state -- 2-column: kep bal, Satori jobb */}
          {!isLoading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) 360px', gap: 24, alignItems: 'start' }}>

              {/* BAL: kep + gombok */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: result ? '#10b981' : '#3b82f6' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                      {result?.mode === 'textpreserve' ? 'Szoveg-megorzott Eredmeny'
                        : result?.mode === 'smart' ? 'Okos Jelenet Eredmeny'
                          : result ? 'Generalt Kep' : 'Szerkesztő'}
                    </span>
                    {result?.textZonesDetected !== undefined && (
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: 'rgba(6,182,212,0.12)', color: '#06b6d4' }}>
                        {result.textZonesDetected} zona megorizve
                      </span>
                    )}
                    {result?.elapsed !== undefined && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {(result.elapsed / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  {result && (
                    <button
                      onClick={() => { setResult(null); setError(null); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                    >
                      <RefIcon size={12} /> Uj generalas
                    </button>
                  )}
                </div>

                {/* Kep */}
                <div style={{ borderRadius: 16, overflow: 'hidden', border: '2px solid var(--border)', background: 'var(--bg3)' }}>
                  <img src={editedImageUrl || getBaseImageUrl()} alt="Generalt kep" style={{ width: '100%', display: 'block' }} onLoad={() => console.log('[QPP] image loaded:', (editedImageUrl || getBaseImageUrl()).substring(0, 60))} onError={(e) => console.error('[QPP] image load error:', e)} />
                </div>

                {/* Gombok */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={handleDownload}
                    disabled={!hasImage}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: 'none',
                      background: '#10b981', color: '#fff', fontSize: 12, fontWeight: 700,
                      cursor: hasImage ? 'pointer' : 'not-allowed',
                      opacity: hasImage ? 1 : 0.5
                    }}
                  >
                    <DlIcon size={13} /> Letoltes
                  </button>
                  <button
                    onClick={handlePinTestImage}
                    disabled={!hasImage}
                    title="Menti a kepet tesztkepkent"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9,
                      border: '1.5px solid rgba(251,191,36,0.4)',
                      background: 'rgba(251,191,36,0.08)', color: '#fbbf24', fontSize: 12, fontWeight: 700,
                      cursor: hasImage ? 'pointer' : 'not-allowed',
                      opacity: hasImage ? 1 : 0.5
                    }}
                  >
                    <PinIcon size={13} /> Tesztkep
                  </button>
                  <button
                    onClick={handleSaveToMediaLibrary}
                    disabled={!hasImage || isSavingToMedia}
                    title="Menti a kepet a markatárba"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: 'none',
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: '#fff', fontSize: 12, fontWeight: 700,
                      cursor: (hasImage && !isSavingToMedia) ? 'pointer' : 'not-allowed',
                      opacity: (hasImage && !isSavingToMedia) ? 1 : 0.5
                    }}
                  >
                    {isSavingToMedia ? (
                      <>Mentés...</>
                    ) : (
                      <>
                        <FolderPlusIcon size={13} /> Mentés a Képtárba
                      </>
                    )}
                  </button>
                  {result?.caption && (
                    <button onClick={handleCopy} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'transparent', color: copied ? '#10b981' : 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {copied ? <OkIcon size={13} /> : <CpIcon size={13} />}
                      {copied ? 'Masolva!' : 'Caption'}
                    </button>
                  )}
                </div>

                {result?.caption && (
                  <div style={{ padding: '14px', borderRadius: 11, border: '1.5px solid var(--border)', background: 'var(--card)' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Caption</div>
                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{result.caption}</div>
                  </div>
                )}

                {result?.hashtags && (
                  <div style={{ padding: '16px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--card)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Hashtag ajánlások (kattints a másoláshoz)
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {['facebook', 'instagram', 'x'].map((platform) => {
                        const tags = result.hashtags?.[platform as keyof typeof result.hashtags] || [];
                        if (tags.length === 0) return null;
                        
                        return (
                          <div key={platform} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                              {platform === 'x' ? 'X (Twitter)' : platform.charAt(0).toUpperCase() + platform.slice(1)}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {tags.map((tag) => (
                                <span 
                                  key={tag} 
                                  onClick={() => {
                                    navigator.clipboard.writeText(tag);
                                    showToast({ title: 'Másolva!', message: `${tag} vágólapra másolva.`, type: 'success' });
                                  }}
                                  style={{ 
                                    padding: '4px 8px', 
                                    borderRadius: 6, 
                                    fontSize: 11, 
                                    background: 'var(--bg3)', 
                                    color: '#a78bfa', 
                                    cursor: 'pointer',
                                    border: '1px solid var(--border)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    transition: 'all 0.2s',
                                  }}
                                  title="Kattints a másoláshoz"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* JOBB: Layer Editor Sidebar */}
              <div style={{ position: 'sticky', top: 0, overflowY: 'auto', maxHeight: 'calc(100vh - 90px)', paddingRight: 4 }}>
                <div style={{ padding: '16px', borderRadius: 18, background: 'var(--bg3)', border: '2px solid rgba(139,92,246,0.25)', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>

                  {/* isolated Editor Switcher */}
                  <div style={{ display: 'flex', background: 'var(--bg)', padding: 3, borderRadius: 10, border: '1px solid var(--border)', marginBottom: 16 }}>
                    <button
                      onClick={() => { setEditorMode('none'); setEditedImageUrl(null); }}
                      style={{
                        flex: 1, padding: '6px 12px', borderRadius: 8, border: 'none',
                        background: editorMode === 'none' ? 'linear-gradient(135deg,#8b5cf6,#6d28d9)' : 'transparent',
                        color: editorMode === 'none' ? '#fff' : 'var(--text-muted)',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                      }}
                    >
                      Csak kép
                    </button>
                    <button
                      onClick={() => { if (hasImage) setEditorMode('satori'); }}
                      disabled={!hasImage}
                      title={!hasImage ? 'Tölts fel egy képet a Satori használatához!' : ''}
                      style={{
                        flex: 1, padding: '6px 12px', borderRadius: 8, border: 'none',
                        background: editorMode === 'satori' ? 'linear-gradient(135deg,#8b5cf6,#6d28d9)' : 'transparent',
                        color: editorMode === 'satori' ? '#fff' : 'var(--text-muted)',
                        fontSize: 11, fontWeight: 700, cursor: hasImage ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
                        opacity: hasImage ? 1 : 0.5
                      }}
                    >
                      Satori
                    </button>
                    <button
                      onClick={() => { if (hasImage) setEditorMode('placid'); }}
                      disabled={!hasImage}
                      title={!hasImage ? 'Tölts fel egy képet a Placid használatához!' : ''}
                      style={{
                        flex: 1, padding: '6px 12px', borderRadius: 8, border: 'none',
                        background: editorMode === 'placid' ? 'linear-gradient(135deg,#8b5cf6,#6d28d9)' : 'transparent',
                        color: editorMode === 'placid' ? '#fff' : 'var(--text-muted)',
                        fontSize: 11, fontWeight: 700, cursor: hasImage ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
                        opacity: hasImage ? 1 : 0.5
                      }}
                    >
                      Placid
                    </button>
                  </div>

                  {editorMode === 'none' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: 24 }}>🖼️</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Nincs aktív layer szerkesztő</div>
                      <div style={{ fontSize: 11, lineHeight: 1.5, maxWidth: 240 }}>
                        A kép tiszta állapotban látható. Kattints a <strong>Satori</strong> vagy <strong>Placid</strong> fülre a feliratok elhelyezéséhez.
                      </div>
                    </div>
                  )}

                  {editorMode === 'satori' && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <LayersIcon size={14} />
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Satori Layer Szerkeszto</span>
                      </div>
                      <SatoriEditorPanel
                        baseImageUrl={getBaseImageUrl()}
                        prompt={prompt}
                        subject={brandName}
                        decomposedLayerText={result?.decomposedLayerText}
                        decomposedLayerCta={result?.decomposedLayerCta}
                        initialSuggestedStyles={result?.suggestedStyles}
                        onRendered={setEditedImageUrl}
                        brandKit={activeBrandKit}
                      />
                    </>
                  )}

                  {editorMode === 'placid' && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <LayersIcon size={14} />
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Placid Layer Szerkeszto</span>
                      </div>
                      <PlacidEditorPanel
                        baseImageUrl={getBaseImageUrl()}
                        productImageUrl={
                          (() => {
                            const slot = imageSlots.find(s => s.preprocessedUrl || s.originalUrl);
                            if (slot) return slot.preprocessedUrl || slot.originalUrl;
                            const stored = localStorage.getItem('qpp_pinned_test_image_product_url');
                            return stored || undefined;
                          })()
                        }
                        productPosition={result?.productPosition}
                        prompt={prompt}
                        subject={brandName}
                        decomposedLayerText={result?.decomposedLayerText}
                        decomposedLayerCta={result?.decomposedLayerCta}
                        onRendered={setEditedImageUrl}
                      />
                    </>
                  )}

                </div>
              </div>

            </div>
          )}

          {/* Pinned tesztkep banner -- ha van mentett kep es nincs aktiv result/loading/error */}
          {!isLoading && !result && !error && savedTestImage && (
            <div style={{
              margin: '0 0 16px 0', padding: '14px 16px', borderRadius: 13,
              border: '1.5px solid rgba(251,191,36,0.35)',
              background: 'rgba(251,191,36,0.07)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
                border: '2px solid rgba(251,191,36,0.3)', background: 'var(--bg3)',
              }}>
                <img src={savedTestImage} alt="Mentett tesztkep" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#fbbf24', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PinIcon size={12} /> Mentett Tesztkep
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {savedTestImage.split('/').pop()}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleLoadPinned}
                    style={{
                      padding: '5px 12px', borderRadius: 7, border: 'none',
                      background: '#fbbf24', color: '#000',
                      fontSize: 11, fontWeight: 800, cursor: 'pointer',
                    }}
                  >
                    Betoltes layer teszthez
                  </button>
                  <button
                    onClick={handleUnpin}
                    style={{
                      padding: '5px 12px', borderRadius: 7,
                      border: '1px solid rgba(239,68,68,0.3)',
                      background: 'transparent', color: '#ef4444',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Torol
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default function ZomboQuickPostPage({ inlineMode = false }: { inlineMode?: boolean }) {
  return (
    <QPPErrorBoundary>
      <ZomboQuickPostPageInner inlineMode={inlineMode} />
    </QPPErrorBoundary>
  );
}
