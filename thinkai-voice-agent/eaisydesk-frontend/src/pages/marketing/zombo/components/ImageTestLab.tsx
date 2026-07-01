import { useState, useRef, useEffect } from 'react';
import { Upload, Sparkles, Image as ImageIcon, Loader2, Download, RotateCcw, Zap, Eye, EyeOff, Wand2, Layers, Languages, Type, Square, Trash, Save, X, RefreshCw, LayoutTemplate, GripVertical } from 'lucide-react';
import type { BrandKit } from '../types';
import { fixImageUrl, getBackendUrl } from '../types';
import ImageSlotUploader, { type ImageSlot, buildCompositePayload } from './ImageSlotUploader';
import { buildLayerTemplates } from '../layerTemplates';

interface VisualStrategy {
  business_understood?: string;
  visual_subjects?: string[];
  allow_hands?: boolean;
  photography_style?: string;
  lighting?: string;
  mood?: string;
  object_condition?: string;
  arrangement_style?: string;
  background_style?: string;
  flux_negations?: string[];
  prompt_prefix?: string;
  prompt_suffix?: string;
  good_prompt_example?: string;
  bad_prompt_example?: string;
  color_direction?: string;
}

// Layer types
interface LayerChild {
  type: 'text' | 'image' | 'figure';
  x: number; y: number; width: number; height?: number;
  opacity?: number;
  visible?: boolean;
  text?: string; fontSize?: number; fontFamily?: string; fontWeight?: string;
  align?: string; fill?: string; textShadow?: string; lineHeight?: number;
  src?: string; filter?: string;
  subType?: 'rect' | 'circle'; cornerRadius?: number; border?: string;
}

interface LayerLayout {
  width: number; height: number;
  pages?: Array<{ background: string; children: LayerChild[] }>;
  background?: string;
  children?: LayerChild[];
}

interface ImageTestLabProps {
  activeBrandKit?: BrandKit;
  auditResult?: any | null;
}

export function ImageTestLab({ activeBrandKit, auditResult }: ImageTestLabProps) {
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([]);
  // Derived backward-compat vars from first slot
  const productImage = imageSlots[0]?.originalUrl || imageSlots[0]?.rawBase64 || null;
  const preprocessedUrl = imageSlots[0]?.upscaledUrl || imageSlots[0]?.preprocessedUrl || null;
  const originalUrl = imageSlots[0]?.originalUrl || null;
  const isPreprocessing = imageSlots.some(s => s.preprocessLoading || s.analysisLoading || s.upscaleLoading);
  const productFileName = imageSlots[0]?.fileName || '';


  const [scenePrompt, setScenePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [composedPromptPreview, setComposedPromptPreview] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [results, setResults] = useState<Array<{ url: string; prompt: string; elapsed: number; model: string; params?: Record<string, any> }>>([]);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [logs, setLogs] = useState<string[]>([]);

  const [autoTranslate, setAutoTranslate] = useState(true);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedPrompt, setTranslatedPrompt] = useState('');
  const [translationUsed, setTranslationUsed] = useState(false);

  // Visual Strategy
  const [visualStrategy, setVisualStrategy] = useState<VisualStrategy | null>(null);
  const [isDerivingStrategy, setIsDerivingStrategy] = useState(false);
  const [strategyExpanded, setStrategyExpanded] = useState(false);
  const [brandProductsExpanded, setBrandProductsExpanded] = useState(true);

  // Layer editor
  const [editingResultIdx, setEditingResultIdx] = useState<number | null>(null);
  const [layerLayout, setLayerLayout] = useState<LayerLayout | null>(null);
  const [selectedLayerIdx, setSelectedLayerIdx] = useState<number | null>(null);
  const [editingTextIdx, setEditingTextIdx] = useState<number | null>(null);
  const [canvasResize, setCanvasResize] = useState<{ idx: number; handle: 'r' | 'b' | 'br'; startMX: number; startMY: number; origW: number; origH: number } | null>(null);
  const [isExportingLayer, setIsExportingLayer] = useState(false);
  const [layerSidebarTab, setLayerSidebarTab] = useState<'layers' | 'templates'>('templates');
  const [hoveredTemplateId, setHoveredTemplateId] = useState<string | null>(null);
  const [dragLayerIdx, setDragLayerIdx] = useState<number | null>(null);
  const [dragOverLayerIdx, setDragOverLayerIdx] = useState<number | null>(null);
  const [canvasDrag, setCanvasDrag] = useState<{ idx: number; startMX: number; startMY: number; origX: number; origY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [aiLayersEnabled, setAiLayersEnabled] = useState<Record<number, boolean>>({});
  const [isGeneratingAiLayers, setIsGeneratingAiLayers] = useState(false);

  // BFL model + params — global defaults: Flex / safety=1 / guidance=4.5 / steps=50
  const [safetyTolerance, setSafetyTolerance] = useState(1);
  const [bflModel, setBflModel] = useState<'bfl-flux-2-pro' | 'bfl-flux-2-max' | 'bfl-flux-2-flex' | 'auto'>('auto');
  const [bflWidth, setBflWidth] = useState(1024);
  const [bflHeight, setBflHeight] = useState(1536);
  const [flexAspectRatio, setFlexAspectRatio] = useState('2:3');
  const [flexGuidance, setFlexGuidance] = useState(4.5);
  const [flexSteps, setFlexSteps] = useState(50);
  const [flexWidth, setFlexWidth] = useState(1024);
  const [flexHeight, setFlexHeight] = useState(1536);

  const addLog = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('hu-HU');
    setLogs(prev => [...prev, `[${timestamp}] [${type.toUpperCase()}] ${msg}`]);
  };

  useEffect(() => {
    if (!auditResult) return;
    setIsDerivingStrategy(true);
    fetch('/marketing/api/zombo/visual-strategy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audit: auditResult }),
    }).then(r => r.json()).then(data => {
      if (data.visual_strategy) { setVisualStrategy(data.visual_strategy); setStrategyExpanded(true); }
    }).catch(err => console.error('Visual strategy error:', err))
      .finally(() => setIsDerivingStrategy(false));
  }, [auditResult]);

  // Brand context
  const brandStyleContext: string[] = [];
  const brandNegativePrompt: string[] = visualStrategy?.flux_negations ? [...visualStrategy.flux_negations] : [];
  if (activeBrandKit) {
    const bp = activeBrandKit.brandProfile;
    const dna = activeBrandKit.brandDna;
    const colors = activeBrandKit.colors;
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
    if (activeBrandKit.visualRules?.length) brandStyleContext.push(...activeBrandKit.visualRules);
    if (brandNegativePrompt.length === 0) {
      if (activeBrandKit.negativePrompt) brandNegativePrompt.push(activeBrandKit.negativePrompt);
      if (bp?.brand_dont?.avoid_topics?.length) brandNegativePrompt.push(...bp.brand_dont.avoid_topics);
      if (bp?.brand_dont?.avoid_tones?.length) brandNegativePrompt.push(...bp.brand_dont.avoid_tones);
    }
  }
  if (visualStrategy) {
    if (visualStrategy.photography_style) brandStyleContext.push(visualStrategy.photography_style);
    if (visualStrategy.lighting) brandStyleContext.push(visualStrategy.lighting);
    if (visualStrategy.mood) brandStyleContext.push(visualStrategy.mood);
    if (visualStrategy.object_condition) brandStyleContext.push(visualStrategy.object_condition);
    if (visualStrategy.arrangement_style) brandStyleContext.push(visualStrategy.arrangement_style);
  }

  const brandProducts: Array<{ name: string; category?: string }> =
    auditResult?.products?.map((p: any) => ({ name: p.name || p.title || '', category: p.category || p.type || '' }))
      .filter((p: any) => p.name) || [];

  const brandColors: string[] = (() => {
    const cols: string[] = [];
    (auditResult?.colors?.web_colors || []).slice(0, 6).forEach((c: any) => { if (c?.hex) cols.push(c.hex); });
    if (activeBrandKit?.colors?.primary) cols.unshift(activeBrandKit.colors.primary);
    if (activeBrandKit?.colors?.accent) cols.push(activeBrandKit.colors.accent);
    return [...new Set(cols)].slice(0, 6);
  })();

  // Translate
  const handleTranslate = async (text: string) => {
    if (!text.trim()) return text;
    setIsTranslating(true);
    try {
      const resp = await fetch(`${getBackendUrl()}/api/translate-prompt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, brandContext: { products: brandProducts.map(p => p.name) } }),
      });
      const data = await resp.json();
      if (data.wasTranslated) { setTranslatedPrompt(data.translated); setTranslationUsed(true); return data.translated; }
    } catch (err) { console.error('Translation error:', err); }
    finally { setIsTranslating(false); }
    setTranslationUsed(false);
    return text;
  };

  const handlePreviewPrompt = async () => {
    if (!scenePrompt.trim()) { setError('Adj meg egy jelenet leírást!'); return; }
    setIsPreviewLoading(true); setError(''); setComposedPromptPreview('');

    try {
      if (imageSlots.length >= 1) {
        const payload = buildCompositePayload(imageSlots, scenePrompt, activeBrandKit);
        const resp = await fetch(`${getBackendUrl()}/api/image/composite-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, previewOnly: true }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        setComposedPromptPreview(data.prompt || '');
      } else {
        const translated = autoTranslate ? await handleTranslate(scenePrompt) : scenePrompt;
        let finalPrompt = translated;
        if ((bflModel as string) === 'flux-ip' && (originalUrl || preprocessedUrl)) {
          finalPrompt = `${translated}, professional product photography, the product is naturally integrated into the scene with matching lighting and shadows`;
        }
        // Final safety brand strip on frontend
        finalPrompt = finalPrompt
          .replace(/\b(audi|polifarbe|poli-farbe|bmw|mercedes|porsche|ferrari|lamborghini|ford|toyota|honda)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        setComposedPromptPreview(finalPrompt);
      }
    } catch (err: any) {
      setError('Előnézet hiba: ' + err.message);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // Generate
  const handleGenerate = async () => {
    if (!scenePrompt.trim()) { setError('Adj meg egy jelenet leirast!'); return; }
    setIsGenerating(true); setError(''); setLogs([]);
    const start = Date.now();

    try {
      // Composition mode (1+ image slots present)
      if (imageSlots.length >= 1) {
        addLog('Composite-generate inditasa...', 'info');
        setStatusMsg('Composite Flux Flex generalas...');
        const resp = await fetch(`${getBackendUrl()}/api/image/composite-generate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildCompositePayload(imageSlots, scenePrompt, activeBrandKit)),
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        const elapsed = Date.now() - start;
        addLog(`Kesz! (${(elapsed / 1000).toFixed(1)}s)`, 'success');
        setResults(prev => [{ url: data.imageUrl, prompt: data.prompt || scenePrompt, elapsed, model: 'bfl-flux-2-flex (composite)', params: { slots: imageSlots.length } }, ...prev]);
        setStatusMsg(`Kesz! (${(elapsed / 1000).toFixed(1)}s)`);
        return;
      }

      // Scene only (0 slots) — standard test-image flow
      let finalPrompt = scenePrompt;
      if (autoTranslate) { addLog('Magyar -> angol forditas...', 'info'); finalPrompt = await handleTranslate(scenePrompt); }
      // Final safety brand strip
      finalPrompt = finalPrompt
        .replace(/\b(audi|polifarbe|poli-farbe|bmw|mercedes|porsche|ferrari|lamborghini|ford|toyota|honda)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      addLog(`Generalas inditasa: BFL ${bflModel}...`, 'info');
      setStatusMsg(`${bflModel} generalas...`);
      const isFlexModel = bflModel === 'bfl-flux-2-flex' || bflModel === 'auto';
      const resp = await fetch(`${getBackendUrl()}/api/test-image`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productImageUrl: null,
          preprocessedImageUrl: null,
          scenePrompt: finalPrompt,
          model: bflModel,
          safetyTolerance,
          ...(isFlexModel
            ? { aspectRatio: flexAspectRatio, guidance: flexGuidance, steps: flexSteps, width: flexWidth, height: flexHeight }
            : { width: bflWidth, height: bflHeight }
          ),
          brandStyle: brandStyleContext.length > 0 ? brandStyleContext.join(', ') : undefined,
          negativePrompt: brandNegativePrompt.length > 0 ? brandNegativePrompt.join(', ') : undefined,
          brandKit: activeBrandKit ? { colors: activeBrandKit.colors, tone: activeBrandKit.tone, visualRules: activeBrandKit.visualRules, brandDna: activeBrandKit.brandDna, brandProfile: activeBrandKit.brandProfile } : undefined,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      const elapsed = Date.now() - start;
      addLog(`Kesz! (${(elapsed / 1000).toFixed(1)}s)`, 'success');
      setResults(prev => [{ url: data.imageUrl, prompt: finalPrompt, elapsed, model: data.model || bflModel, params: isFlexModel ? { aspectRatio: flexAspectRatio, size: `${flexWidth}x${flexHeight}`, guidance: flexGuidance, steps: flexSteps, safety: safetyTolerance } : { size: `${bflWidth}x${bflHeight}`, safety: safetyTolerance } }, ...prev]);
      setStatusMsg(`Kesz! (${(elapsed / 1000).toFixed(1)}s)`);

    } catch (err: any) {
      addLog(`Hiba: ${err.message}`, 'error');
      try { const parsed = JSON.parse(err.message); setError(parsed.error || parsed.message || err.message); }
      catch { setError(err.message); }
      setStatusMsg('');
    } finally { setIsGenerating(false); }
  };

  // Layer editor helpers
  const getLayerChildren = (layout: LayerLayout): LayerChild[] =>
    layout.pages?.[0]?.children || layout.children || [];

  const updateLayerChildren = (layout: LayerLayout, updater: (ch: LayerChild[]) => LayerChild[]): LayerLayout => {
    if (layout.pages?.[0]) return { ...layout, pages: [{ ...layout.pages[0], children: updater(layout.pages[0].children || []) }] };
    return { ...layout, children: updater(layout.children || []) };
  };

  const generateAiLayers = async (resultIdx: number) => {
    const result = results[resultIdx];
    if (!result) return;
    setIsGeneratingAiLayers(true);
    addLog('AI rétegek tervezése a kép alapján...', 'info');
    try {
      const resp = await fetch(`${getBackendUrl()}/api/ai/suggest-layers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: fixImageUrl(result.url),
          scenePrompt: result.prompt,
          brandKit: activeBrandKit ? {
            colors: activeBrandKit.colors,
            tone: activeBrandKit.tone,
            visualRules: activeBrandKit.visualRules,
            typography: activeBrandKit.typography,
            logoUrl: activeBrandKit.logoUrl
          } : undefined
        })
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      
      const aiLayers = data.layers || [];
      addLog(`Sikeres AI rétegtervezés: ${aiLayers.length} réteg hozzáadva.`, 'success');
      
      const imgUrl = fixImageUrl(result.url);
      const bgLayer: LayerChild = { type: 'image', src: imgUrl, x: 0, y: 0, width: 1080, height: 1350, opacity: 1 };
      
      setLayerLayout({
        width: 1080,
        height: 1350,
        pages: [{
          background: '#000000',
          children: [bgLayer, ...aiLayers]
        }]
      });
      
      setSelectedLayerIdx(null);
      setLayerSidebarTab('layers');
    } catch (err: any) {
      addLog(`AI réteg generálási hiba: ${err.message}`, 'error');
      alert('AI réteg generálási hiba: ' + err.message);
    } finally {
      setIsGeneratingAiLayers(false);
    }
  };

  const openLayerEditor = (resultIdx: number) => {
    const imgUrl = fixImageUrl(results[resultIdx].url);
    setLayerLayout({ width: 1080, height: 1350, pages: [{ background: '#000000', children: [{ type: 'image', src: imgUrl, x: 0, y: 0, width: 1080, height: 1350, opacity: 1 }] }] });
    setEditingResultIdx(resultIdx);
    setSelectedLayerIdx(null);
    setLayerSidebarTab('templates');
    
    if (aiLayersEnabled[resultIdx]) {
      generateAiLayers(resultIdx);
    }
  };

  const closeLayerEditor = () => { setEditingResultIdx(null); setLayerLayout(null); setSelectedLayerIdx(null); };

  const updateSelectedLayer = (updater: (c: LayerChild) => LayerChild) => {
    if (selectedLayerIdx === null || !layerLayout) return;
    setLayerLayout(prev => prev ? updateLayerChildren(prev, children => children.map((c, i) => i === selectedLayerIdx ? updater(c) : c)) : prev);
  };

  const addTextLayer = () => {
    if (!layerLayout) return;
    const newChild: LayerChild = { type: 'text', text: 'Ide irj szoveget', x: 80, y: 900, width: 920, fontSize: 64, fontFamily: 'Inter', fontWeight: 'bold', align: 'left', fill: '#ffffff', opacity: 1, textShadow: '2px 2px 8px rgba(0,0,0,0.8)', lineHeight: 1.2 };
    setLayerLayout(prev => prev ? updateLayerChildren(prev, ch => [...ch, newChild]) : prev);
    setTimeout(() => setSelectedLayerIdx((getLayerChildren(layerLayout).length)), 10);
  };

  const addGradientLayer = () => {
    if (!layerLayout) return;
    const primaryColor = activeBrandKit?.colors?.primary || '#1a1a2e';
    setLayerLayout(prev => prev ? updateLayerChildren(prev, ch => [...ch, { type: 'figure', subType: 'rect', x: 0, y: 750, width: 1080, height: 600, fill: `linear-gradient(to top, ${primaryColor}ee, transparent)`, opacity: 0.85 }]) : prev);
  };

  const addLogoLayer = () => {
    if (!layerLayout) return;
    const newChild: LayerChild = { type: 'image', src: '', x: 40, y: 40, width: 200, height: 80, opacity: 1 };
    setLayerLayout(prev => prev ? updateLayerChildren(prev, ch => [...ch, newChild]) : prev);
    setTimeout(() => setSelectedLayerIdx((getLayerChildren(layerLayout).length)), 10);
  };

  const deleteLayer = (idx: number) => {
    if (!layerLayout) return;
    setLayerLayout(prev => prev ? updateLayerChildren(prev, ch => ch.filter((_, i) => i !== idx)) : prev);
    setSelectedLayerIdx(null);
  };

  // Social Media Templates (Dribbble inspired)
  const _primary = activeBrandKit?.colors?.primary || '#1a1a2e';
  const _accent  = activeBrandKit?.colors?.accent  || '#f59e0b';
  const _font    = activeBrandKit?.typography?.fontName || 'Inter';
  const TEMPLATES = buildLayerTemplates(_primary, _accent, _font);

  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    if (!layerLayout) return;
    const bgLayer = getLayerChildren(layerLayout)[0];
    const hasBgImage = bgLayer?.type === 'image';
    // Filter template layers: if we have a background image, reduce opacity of
    // full-coverage solid background layers so they don't completely hide the image
    const processedLayers = tpl.layers.map((layer): LayerChild => {
      const isFullCover = layer.type === 'figure' && layer.x === 0 && layer.y === 0
        && (layer.width || 0) >= 900 && (layer.height || 0) >= 900;
      if (hasBgImage && isFullCover) {
        const currentOpacity = layer.opacity ?? 1;
        // Cap full-cover layers at 0.55 opacity so the background shows through
        return currentOpacity > 0.55 ? { ...layer, opacity: 0.55 } : layer;
      }
      return layer;
    });
    const newChildren = bgLayer ? [bgLayer, ...processedLayers] : [...processedLayers];
    setLayerLayout(prev => {
      if (!prev) return prev;
      if (prev.pages?.[0]) return { ...prev, pages: [{ ...prev.pages[0], children: newChildren }] };
      return { ...prev, children: newChildren };
    });
    setSelectedLayerIdx(null);
    setLayerSidebarTab('layers');
  };

  const exportLayerImage = async () => {
    if (!layerLayout) return;
    setIsExportingLayer(true);
    try {
      const resp = await fetch(`${getBackendUrl()}/api/render-polotno`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layoutJson: layerLayout }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      window.open(fixImageUrl(data.imageUrl), '_blank');
    } catch (err: any) {
      alert('Export hiba: ' + err.message);
    } finally { setIsExportingLayer(false); }
  };

  // Layer canvas render
  const renderLayerCanvas = () => {
    if (!layerLayout) return null;
    const w = layerLayout.width || 1080;
    const h = layerLayout.height || 1350;
    const maxW = 440; const maxH = 600;
    const scale = Math.min(maxW / w, maxH / h);
    const children = getLayerChildren(layerLayout);
    const bg = layerLayout.pages?.[0]?.background || layerLayout.background || '#000';
    const hoveredTpl = hoveredTemplateId ? TEMPLATES.find(t => t.id === hoveredTemplateId) : null;

    const handleChildMouseDown = (e: React.MouseEvent, idx: number) => {
      if (!canvasRef.current) return;
      e.stopPropagation(); e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      const child = children[idx];
      setCanvasDrag({ idx, startMX: (e.clientX - rect.left) / scale, startMY: (e.clientY - rect.top) / scale, origX: child.x, origY: child.y });
      setSelectedLayerIdx(idx);
      setEditingTextIdx(null); // Clear inline editing on drag start
    };

    const handleHandleMouseDown = (e: React.MouseEvent, idx: number, handle: 'r' | 'b' | 'br') => {
      if (!canvasRef.current) return;
      e.stopPropagation();
      e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      const child = children[idx];
      setCanvasResize({
        idx,
        handle,
        startMX: (e.clientX - rect.left) / scale,
        startMY: (e.clientY - rect.top) / scale,
        origW: child.width,
        origH: child.height ?? 50,
      });
      setSelectedLayerIdx(idx);
      setEditingTextIdx(null);
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
      if (canvasResize && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const curMX = (e.clientX - rect.left) / scale;
        const curMY = (e.clientY - rect.top) / scale;
        const dw = curMX - canvasResize.startMX;
        const dh = curMY - canvasResize.startMY;
        const newW = Math.max(20, canvasResize.origW + dw);
        const newH = Math.max(20, canvasResize.origH + dh);

        setLayerLayout(prev => prev ? updateLayerChildren(prev, ch => ch.map((c, i) => {
          if (i !== canvasResize.idx) return c;
          const updated = { ...c };
          if (canvasResize.handle === 'r' || canvasResize.handle === 'br') {
            updated.width = Math.round(newW);
          }
          if (canvasResize.handle === 'b' || canvasResize.handle === 'br') {
            updated.height = Math.round(newH);
          }
          return updated;
        })) : prev);
        return;
      }

      if (!canvasDrag || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const curMX = (e.clientX - rect.left) / scale;
      const curMY = (e.clientY - rect.top) / scale;
      const dx = curMX - canvasDrag.startMX;
      const dy = curMY - canvasDrag.startMY;
      const newX = Math.max(0, Math.min(w - 10, canvasDrag.origX + dx));
      const newY = Math.max(0, Math.min(h - 10, canvasDrag.origY + dy));
      setLayerLayout(prev => prev ? updateLayerChildren(prev, ch => ch.map((c, i) => i === canvasDrag.idx ? { ...c, x: Math.round(newX), y: Math.round(newY) } : c)) : prev);
    };

    const handleCanvasMouseUp = () => {
      setCanvasDrag(null);
      setCanvasResize(null);
    };

    const renderChild = (child: LayerChild, idx: number, isPreview = false) => {
      if (!isPreview && child.visible === false) return null;
      const isSelected = !isPreview && selectedLayerIdx === idx;
      const isDraggingThis = canvasDrag?.idx === idx;
      const isResizingThis = canvasResize?.idx === idx;
      const base: React.CSSProperties = {
        position: 'absolute', left: child.x, top: child.y, width: child.width,
        height: child.height ?? 'auto', opacity: child.opacity ?? 1,
        cursor: isPreview ? 'default' : isResizingThis ? 'nwse-resize' : isDraggingThis ? 'grabbing' : 'grab',
        boxSizing: 'border-box',
        outline: isSelected ? '2px dashed #8b5cf6' : 'none',
        outlineOffset: isSelected ? '3px' : '0',
        zIndex: isDraggingThis || isResizingThis ? 500 : isSelected ? 100 : idx + 1,
        pointerEvents: isPreview ? 'none' : 'auto',
        userSelect: 'none',
        transition: isDraggingThis || isResizingThis ? 'none' : undefined,
      };

      const handles = isSelected && !isPreview && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {/* Right Handle */}
          <div
            style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, borderRadius: '50%', background: '#8b5cf6', border: '2px solid #fff', cursor: 'ew-resize', pointerEvents: 'auto', zIndex: 1000 }}
            onMouseDown={e => handleHandleMouseDown(e, idx, 'r')}
          />
          {/* Bottom Handle */}
          <div
            style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', width: 12, height: 12, borderRadius: '50%', background: '#8b5cf6', border: '2px solid #fff', cursor: 'ns-resize', pointerEvents: 'auto', zIndex: 1000 }}
            onMouseDown={e => handleHandleMouseDown(e, idx, 'b')}
          />
          {/* Bottom-Right Handle */}
          <div
            style={{ position: 'absolute', bottom: -6, right: -6, width: 12, height: 12, borderRadius: '50%', background: '#8b5cf6', border: '2px solid #fff', cursor: 'nwse-resize', pointerEvents: 'auto', zIndex: 1000 }}
            onMouseDown={e => handleHandleMouseDown(e, idx, 'br')}
          />
        </div>
      );

      const onMouseDown = (e: React.MouseEvent) => { if (!isPreview) handleChildMouseDown(e, idx); };
      const handleDoubleClick = (e: React.MouseEvent) => {
        if (isPreview) return;
        e.stopPropagation();
        setEditingTextIdx(idx);
      };

      if (child.type === 'text') {
        if (editingTextIdx === idx) {
          return (
            <textarea
              key={idx}
              value={child.text || ''}
              onChange={e => {
                const val = e.target.value;
                setLayerLayout(prev => prev ? updateLayerChildren(prev, ch => ch.map((c, i) => i === idx ? { ...c, text: val } : c)) : prev);
              }}
              onBlur={() => setEditingTextIdx(null)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setEditingTextIdx(null);
                }
              }}
              autoFocus
              style={{
                ...base,
                background: 'rgba(0,0,0,0.85)',
                color: child.fill || '#fff',
                fontFamily: child.fontFamily || 'Inter',
                fontSize: `${child.fontSize}px`,
                lineHeight: child.lineHeight || 1.2,
                fontWeight: child.fontWeight || 'normal',
                textAlign: (child.align || 'left') as any,
                border: '2px solid #8b5cf6',
                borderRadius: 4,
                padding: 4,
                resize: 'none',
                outline: 'none',
                overflow: 'hidden',
                userSelect: 'text',
              }}
            />
          );
        }
        return (
          <div
            key={idx}
            style={{ ...base, display: 'flex', flexDirection: 'column', wordWrap: 'break-word', whiteSpace: 'pre-wrap', fontFamily: child.fontFamily || 'Inter', fontSize: child.fontSize, lineHeight: child.lineHeight || 1.2, fontWeight: child.fontWeight || 'normal', textAlign: (child.align || 'left') as any, color: child.fill || '#fff', textShadow: child.textShadow || 'none' }}
            onMouseDown={onMouseDown}
            onDoubleClick={handleDoubleClick}
          >
            {child.text}
            {handles}
          </div>
        );
      }

      if (child.type === 'image') return <div key={idx} style={base} onMouseDown={onMouseDown}><img src={fixImageUrl(child.src || '')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />{handles}</div>;
      if (child.type === 'figure') return <div key={idx} style={{ ...base, background: child.fill || '#000', borderRadius: child.subType === 'circle' ? '50%' : (child.cornerRadius || 0), border: child.border || 'none' }} onMouseDown={onMouseDown}>{handles}</div>;
      return null;
    };

    return (
      <div style={{ width: maxW, height: Math.round(h * scale), position: 'relative', flexShrink: 0 }}>
        <div
          ref={canvasRef}
          style={{ width: w, height: h, backgroundColor: bg, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.6)', cursor: canvasDrag ? 'grabbing' : 'default' }}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onClick={() => { if (!canvasDrag) setSelectedLayerIdx(null); }}
        >
          {children.map((child, idx) => renderChild(child, idx, false))}
          {hoveredTpl && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 200, pointerEvents: 'none' }}>
              {hoveredTpl.layers.map((child, idx) => renderChild(child, idx + 1000, true))}
            </div>
          )}
        </div>
        {hoveredTpl && (
          <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 300, background: 'rgba(109,40,217,0.92)', backdropFilter: 'blur(8px)', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
            <span>{hoveredTpl.emoji}</span>
            <span>ELONEZET: {hoveredTpl.name}</span>
          </div>
        )}
        {selectedLayerIdx !== null && children[selectedLayerIdx] && (
          <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: '3px 8px', fontSize: 10, color: '#c4b5fd', pointerEvents: 'none' }}>
            x: {Math.round(children[selectedLayerIdx].x)} · y: {Math.round(children[selectedLayerIdx].y)} · w: {children[selectedLayerIdx].width}
          </div>
        )}
      </div>
    );
  };

  // Helper: render a single layer item
  const renderLayerItem = (child: LayerChild, idx: number, allChildren: LayerChild[]) => {
    const isSelected = selectedLayerIdx === idx;
    const isDragOver = dragOverLayerIdx === idx;
    const isVisible = child.visible !== false;
    const isBg = idx === 0;
    const opacityPct = Math.round((child.opacity ?? 1) * 100);
    const isText = child.type === 'text';
    const layerLabel = isText
      ? (child.text?.replace(/\n/g, ' ').substring(0, 22) || 'Szoveg')
      : child.type === 'image' ? (isBg ? 'Hatter (zart)' : 'Kep')
      : (child.subType === 'circle' ? 'Kor' : 'Teglalap');
    const fillColor = child.fill?.startsWith('#') ? child.fill : null;
    const thumbBg = child.type === 'figure' ? (fillColor || '#555') : '#1e1b4b';
    const opacityColor = opacityPct < 40 ? '#f59e0b' : '#6b7280';

    return (
      <div
        key={idx}
        draggable={!isBg}
        onDragStart={() => setDragLayerIdx(idx)}
        onDragOver={e => { e.preventDefault(); setDragOverLayerIdx(idx); }}
        onDragLeave={() => setDragOverLayerIdx(null)}
        onDrop={() => {
          if (dragLayerIdx === null || dragLayerIdx === idx) { setDragLayerIdx(null); setDragOverLayerIdx(null); return; }
          setLayerLayout(prev => prev ? updateLayerChildren(prev, ch => {
            const arr = [...ch]; const [moved] = arr.splice(dragLayerIdx, 1); arr.splice(idx, 0, moved); return arr;
          }) : prev);
          if (selectedLayerIdx === dragLayerIdx) setSelectedLayerIdx(idx);
          setDragLayerIdx(null); setDragOverLayerIdx(null);
        }}
        onClick={() => setSelectedLayerIdx(isSelected ? null : idx)}
        style={{
          display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 8px',
          borderRadius: 7, cursor: isBg ? 'default' : 'grab', userSelect: 'none',
          opacity: isVisible ? 1 : 0.35, transition: 'background 0.1s, border 0.1s', position: 'relative',
          background: isSelected ? 'rgba(139,92,246,0.14)' : isDragOver ? 'rgba(139,92,246,0.07)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${isSelected ? '#7c3aed' : isDragOver ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
          outline: isDragOver ? '2px dashed rgba(139,92,246,0.5)' : 'none', outlineOffset: 2,
        }}
      >
        {isSelected && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: '#7c3aed', borderRadius: '7px 0 0 7px' }} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {/* Drag grip */}
          {!isBg && <GripVertical size={11} style={{ color: '#374151', flexShrink: 0 }} />}
          {isBg && <div style={{ width: 11, flexShrink: 0 }} />}

          {/* Thumbnail / T badge */}
          {isText ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: '#e2e8f0', background: 'rgba(139,92,246,0.25)', width: 22, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>T</span>
              {fillColor && <div style={{ width: 10, height: 10, borderRadius: 3, background: fillColor, border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} title={fillColor} />}
            </div>
          ) : (
            <div style={{ width: 22, height: 22, borderRadius: 4, background: thumbBg, border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
              {child.type === 'image' ? (
                child.src ? (
                  <img src={fixImageUrl(child.src)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <ImageIcon size={10} style={{ color: '#818cf8' }} />
                )
              ) : child.type === 'figure' && child.subType === 'circle' ? (
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: fillColor || '#6b7280' }} />
              ) : (
                <div style={{ width: 12, height: 12, background: fillColor || '#6b7280' }} />
              )}
            </div>
          )}

          {/* Label */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: isSelected ? 700 : 400, color: isSelected ? '#e2e8f0' : '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{layerLabel}</div>
          </div>

          {/* Opacity % */}
          <span style={{ fontSize: 9, fontWeight: 700, color: opacityColor, background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: 3, flexShrink: 0, minWidth: 28, textAlign: 'center' }}>{opacityPct}%</span>

          {/* Eye */}
          <button onClick={e => { e.stopPropagation(); setLayerLayout(prev => prev ? updateLayerChildren(prev, ch => ch.map((c, i) => i === idx ? { ...c, visible: c.visible === false ? true : false } : c)) : prev); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0, color: isVisible ? '#6b7280' : '#1f2937' }}>
            {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>

          {/* Delete */}
          {!isBg && <button onClick={e => { e.stopPropagation(); deleteLayer(idx); }}
            style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0 }}>
            <Trash size={11} />
          </button>}
        </div>

        {/* Opacity slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 16 }}>
          <input type="range" min={0} max={1} step={0.05} value={child.opacity ?? 1}
            onClick={e => e.stopPropagation()}
            onChange={e => { e.stopPropagation(); const v = +e.target.value; setLayerLayout(prev => prev ? updateLayerChildren(prev, ch => ch.map((c, i) => i === idx ? { ...c, opacity: v } : c)) : prev); }}
            style={{ flex: 1, accentColor: '#8b5cf6', cursor: 'pointer', height: 3 }} />
          <span style={{ fontSize: 8, color: '#374151', width: 22, textAlign: 'right', flexShrink: 0 }}>{opacityPct}%</span>
        </div>
      </div>
    );
  };


  // Layer sidebar render
  const renderLayerSidebar = () => {
    if (!layerLayout) return null;
    const children = getLayerChildren(layerLayout);
    const sel = selectedLayerIdx !== null ? children[selectedLayerIdx] : null;
    const lw = layerLayout.width || 1080;
    const lh = layerLayout.height || 1350;
    const reversedChildren = [...children].map((child, origIdx) => ({ child, origIdx })).reverse();
    const textLayers = reversedChildren.filter(({ child }) => child.type === 'text');
    const otherLayers = reversedChildren.filter(({ child }) => child.type !== 'text');

    return (
      <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 620, overflowX: 'hidden' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 4, flexShrink: 0 }}>
          {[
            { key: 'templates', label: 'Sablonok', icon: <LayoutTemplate size={12} /> },
            { key: 'layers', label: 'Retegek', icon: <Layers size={12} /> },
          ].map(tab => (
            <button key={tab.key} onClick={() => setLayerSidebarTab(tab.key as any)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', background: layerSidebarTab === tab.key ? 'rgba(139,92,246,0.3)' : 'transparent', color: layerSidebarTab === tab.key ? '#c4b5fd' : '#9ca3af', transition: 'all 0.15s', fontFamily: 'inherit' }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Templates tab */}
        {layerSidebarTab === 'templates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Kattints a sablonra a betölteshez</div>
            {TEMPLATES.map(tpl => (
              <button key={tpl.id}
                onClick={() => applyTemplate(tpl)}
                onMouseEnter={() => setHoveredTemplateId(tpl.id)}
                onMouseLeave={() => setHoveredTemplateId(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: hoveredTemplateId === tpl.id ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${hoveredTemplateId === tpl.id ? 'rgba(139,92,246,0.45)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s', fontFamily: 'inherit', transform: hoveredTemplateId === tpl.id ? 'translateX(-2px)' : 'none', boxShadow: hoveredTemplateId === tpl.id ? '0 4px 20px rgba(139,92,246,0.2)' : 'none' }}>
                <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{tpl.emoji}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflow: 'hidden' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: hoveredTemplateId === tpl.id ? '#e9d5ff' : '#e2e8f0' }}>{tpl.name}</span>
                  <span style={{ fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.desc}</span>
                </div>
                <div style={{ fontSize: 10, color: hoveredTemplateId === tpl.id ? '#a78bfa' : '#6b7280', flexShrink: 0, fontWeight: 600 }}>{tpl.layers.length} r.</div>
              </button>
            ))}
          </div>
        )}

        {/* Layers tab */}
        {layerSidebarTab === 'layers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button className="lab-layer-add-btn" onClick={addTextLayer}><Type size={11} /> Szoveg</button>
                <button className="lab-layer-add-btn" onClick={addGradientLayer}><Square size={11} /> Alakzat</button>
                <button className="lab-layer-add-btn" onClick={addLogoLayer}><ImageIcon size={11} /> Kep</button>
              </div>
              {children.length > 1 && (
                <button
                  onClick={() => { if (!window.confirm('Torli az osszes sablon retegett?')) return; setLayerLayout(prev => prev ? updateLayerChildren(prev, ch => ch.slice(0, 1)) : prev); setSelectedLayerIdx(null); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '5px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', cursor: 'pointer', fontFamily: 'inherit', width: '100%', justifyContent: 'center' }}>
                  <Trash size={10} /> Osszes sablon reteg torlese
                </button>
              )}
            </div>

            <div style={{ fontSize: 10, color: '#4b5563', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <GripVertical size={10} style={{ opacity: 0.5 }} />
              <span>Huzd a sorrendezes — felso = legfelul</span>
            </div>

            {/* Unified layer list — Photoshop order (top = topmost) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[...children].map((child, origIdx) => ({ child, origIdx }))
                .reverse()
                .map(({ child, origIdx }) => renderLayerItem(child, origIdx, children))}
            </div>

            {/* Selected layer properties */}
            {sel && (
              <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tulajdonsagok</div>
                
                {/* Opacity control is first */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>OPACITY</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="range" min={0} max={1} step={0.05} value={sel.opacity ?? 1} onChange={e => updateSelectedLayer(c => ({ ...c, opacity: +e.target.value }))} style={{ flex: 1, accentColor: '#8b5cf6', height: 4, cursor: 'pointer' }} />
                    <input type="number" min={0} max={100} value={Math.round((sel.opacity ?? 1) * 100)} onChange={e => {
                      const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      updateSelectedLayer(c => ({ ...c, opacity: val / 100 }));
                    }} style={{ width: 55, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 6px', color: '#fff', fontSize: 11, textAlign: 'right', fontFamily: 'inherit' }} />
                    <span style={{ fontSize: 10, color: '#6b7280' }}>%</span>
                  </div>
                </div>

                {['x','y','width'].map(field => {
                  const maxVal = field === 'y' ? lh : lw;
                  const val = (sel as any)[field] || 0;
                  return (
                    <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{field.toUpperCase()}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="range" min={0} max={maxVal} value={val} onChange={e => updateSelectedLayer(c => ({ ...c, [field]: +e.target.value }))} style={{ flex: 1, accentColor: '#8b5cf6', height: 4, cursor: 'pointer' }} />
                        <input type="number" min={0} max={maxVal} value={val} onChange={e => {
                          const valNum = Math.max(0, Math.min(maxVal, parseInt(e.target.value) || 0));
                          updateSelectedLayer(c => ({ ...c, [field]: valNum }));
                        }} style={{ width: 55, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 6px', color: '#fff', fontSize: 11, textAlign: 'right', fontFamily: 'inherit' }} />
                        <span style={{ fontSize: 10, color: '#6b7280' }}>px</span>
                      </div>
                    </div>
                  );
                })}
                {sel.type !== 'text' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>HEIGHT</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="range" min={0} max={lh} value={sel.height || 0} onChange={e => updateSelectedLayer(c => ({ ...c, height: +e.target.value }))} style={{ flex: 1, accentColor: '#8b5cf6', height: 4, cursor: 'pointer' }} />
                      <input type="number" min={0} max={lh} value={sel.height || 0} onChange={e => {
                        const valNum = Math.max(0, Math.min(lh, parseInt(e.target.value) || 0));
                        updateSelectedLayer(c => ({ ...c, height: valNum }));
                      }} style={{ width: 55, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 6px', color: '#fff', fontSize: 11, textAlign: 'right', fontFamily: 'inherit' }} />
                      <span style={{ fontSize: 10, color: '#6b7280' }}>px</span>
                    </div>
                  </div>
                )}
                {sel.type === 'image' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>KEP URL (SRC):</span>
                    <input type="text" value={sel.src || ''} onChange={e => updateSelectedLayer(c => ({ ...c, src: e.target.value }))} placeholder="https://..." style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 8px', color: '#fff', fontFamily: 'inherit', fontSize: 11, boxSizing: 'border-box' }} />
                  </div>
                )}
                {sel.type === 'text' && (<>
                  <textarea value={sel.text || ''} onChange={e => updateSelectedLayer(c => ({ ...c, text: e.target.value }))} rows={3} style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px', color: '#fff', fontFamily: 'inherit', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>BETUMERET</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="range" min={12} max={300} value={sel.fontSize || 48} onChange={e => updateSelectedLayer(c => ({ ...c, fontSize: +e.target.value }))} style={{ flex: 1, accentColor: '#8b5cf6', height: 4, cursor: 'pointer' }} />
                      <input type="number" min={12} max={300} value={sel.fontSize || 48} onChange={e => {
                        const valNum = Math.max(12, Math.min(300, parseInt(e.target.value) || 12));
                        updateSelectedLayer(c => ({ ...c, fontSize: valNum }));
                      }} style={{ width: 55, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 6px', color: '#fff', fontSize: 11, textAlign: 'right', fontFamily: 'inherit' }} />
                      <span style={{ fontSize: 10, color: '#6b7280' }}>px</span>
                    </div>
                  </div>
                  {['400','600','700','800','900'].map(w => (
                    <button key={w} onClick={() => updateSelectedLayer(c => ({ ...c, fontWeight: w }))}
                      style={{ padding: '4px 8px', background: sel.fontWeight === w ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${sel.fontWeight === w ? '#7c3aed' : 'rgba(255,255,255,0.1)'}`, borderRadius: 4, color: sel.fontWeight === w ? '#c4b5fd' : '#9ca3af', cursor: 'pointer', fontSize: 11, fontWeight: parseInt(w), fontFamily: 'inherit' }}>{w}</button>
                  ))}
                </>)}
                {sel.fill && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>Szin:</span>
                    <input type="color" value={sel.fill?.startsWith('#') ? sel.fill : '#ffffff'} onChange={e => updateSelectedLayer(c => ({ ...c, fill: e.target.value }))} style={{ width: 36, height: 26, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>{sel.fill}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };


  const PRESET_SCENES = [
    { label: 'Kavező', prompt: 'A warm sunlit spring terrace with cherry blossom petals falling gently, a polished marble countertop, steaming espresso cup in the background, soft golden hour bokeh, luxury cafe atmosphere, professional product photography' },
    { label: 'Studio', prompt: 'A premium minimalist studio setup with soft directional lighting, white marble surface with subtle gold accents, elegant floral arrangement in the background, clean luxury advertising photography' },
    { label: 'Termeszet', prompt: 'A natural outdoor setting with lush green foliage, morning dew on leaves, rustic wooden surface, soft diffused natural light through trees, organic lifestyle product photography' },
    { label: 'Unnep', prompt: 'A festive holiday scene with warm candlelight, pine branches, gold ornaments, rich burgundy velvet fabric, cozy winter atmosphere, premium holiday advertising photography' },
    { label: 'Nyar', prompt: 'A bright summer beach scene with turquoise water, white sand, tropical flowers, bright sunlight with soft shadows, fresh and vibrant summer advertising photography' },
    { label: 'Osz', prompt: 'An autumn harvest scene with warm amber and burnt orange tones, rustic wooden crate, scattered maple leaves, warm afternoon light, cozy fall atmosphere, artisan product photography' },
  ];

  return (
    <div className="image-lab-container">
      <div className="lab-header">
        <div className="lab-title-row">
          <div className="lab-icon-circle"><Zap size={20} /></div>
          <div>
            <h2>Image Generation Lab</h2>
            <p className="lab-subtitle">Termekfoto generalas + Layer szerkeszto + 10 sablon • Magyar prompt tamogatas</p>
          </div>
        </div>
      </div>

      <div className="lab-grid">
        {/* Left: Controls */}
        <div className="lab-controls">
          {/* Product Upload */}
          <div className="lab-card glass-panel">
            <h3><Upload size={16} /> Képek csatolása</h3>
            <ImageSlotUploader
              slots={imageSlots}
              onChange={setImageSlots}
              maxSlots={3}
              disabled={isGenerating}
              label="Termék / modell / jelenet képek"
            />
            {imageSlots.length > 1 && (
              <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', fontSize: 11, color: '#c4b5fd', fontWeight: 600 }}>
                ⚡ Composite mód — {imageSlots.length} kép összefésülése Flux Flex-szel
              </div>
            )}
          </div>


          {/* Brand DNA Products */}
          {(brandProducts.length > 0 || brandColors.length > 0) && (
            <div className="lab-card glass-panel" style={{ borderLeft: '3px solid #f59e0b' }}>
              <h3 style={{ color: '#f59e0b', cursor: 'pointer', userSelect: 'none' }} onClick={() => setBrandProductsExpanded(p => !p)}>
                <Sparkles size={16} /> Brand DNA Kontextus
                <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>{brandProductsExpanded ? '▲' : '▼'}</span>
              </h3>
              {brandProductsExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {brandColors.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Oldal szinek</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {brandColors.map(c => (
                          <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 20, height: 20, borderRadius: 4, background: c, border: '1px solid rgba(255,255,255,0.15)' }} />
                            <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#9ca3af' }}>{c}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {brandProducts.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Termekek</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {brandProducts.slice(0, 12).map((p, i) => (
                          <button key={i} onClick={() => setScenePrompt(prev => prev ? `${prev} — featuring ${p.name}` : `Product: ${p.name}`)}
                            style={{ fontSize: 11, padding: '3px 9px', background: 'rgba(245,158,11,0.08)', color: '#fbbf24', borderRadius: 10, fontWeight: 600, border: '1px solid rgba(245,158,11,0.25)', cursor: 'pointer' }}>
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Visual Strategy */}
          {(isDerivingStrategy || visualStrategy) && (
            <div className="lab-card glass-panel" style={{ borderLeft: '3px solid #10b981' }}>
              <h3 style={{ color: '#10b981', cursor: 'pointer', userSelect: 'none' }} onClick={() => setStrategyExpanded(p => !p)}>
                <Wand2 size={16} /> Brand DNA Visual Strategy
                {isDerivingStrategy && <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>feldolgozas...</span>}
                {!isDerivingStrategy && visualStrategy && <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8, fontWeight: 400 }}>{strategyExpanded ? '▲' : '▼'}</span>}
              </h3>
              {!isDerivingStrategy && visualStrategy && strategyExpanded && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Stilus', value: visualStrategy.photography_style },
                    { label: 'Feny', value: visualStrategy.lighting },
                    { label: 'Hangulat', value: visualStrategy.mood },
                    { label: 'Targyak', value: visualStrategy.object_condition },
                    { label: 'Elrendezes', value: visualStrategy.arrangement_style },
                    { label: 'Hatter', value: visualStrategy.background_style },
                  ].filter(x => x.value).map((item, i) => (
                    <div key={i} style={{ background: 'rgba(16,185,129,0.08)', borderRadius: 8, padding: '6px 10px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: '#d1fae5', marginTop: 2 }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Brand Style Context */}
          {activeBrandKit && brandStyleContext.length > 0 && (
            <div className="lab-card glass-panel" style={{ borderLeft: '3px solid #7c3aed' }}>
              <h3 style={{ color: '#7c3aed' }}><Wand2 size={16} /> Brand Stilus Kontextus</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {brandStyleContext.map((tag, i) => (
                  <span key={i} style={{ fontSize: 11, padding: '3px 9px', background: 'rgba(139,92,246,0.12)', color: '#c4b5fd', borderRadius: 10, fontWeight: 600, border: '1px solid rgba(139,92,246,0.25)' }}>{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Scene Prompt */}
          <div className="lab-card glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h3 style={{ margin: 0 }}><Sparkles size={16} /> Jelenet Leiras</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: autoTranslate ? '#a78bfa' : '#9ca3af', cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={autoTranslate} onChange={e => setAutoTranslate(e.target.checked)} style={{ accentColor: '#8b5cf6' }} />
                <Languages size={12} /> Magyar → EN
              </label>
            </div>
            <textarea className="scene-textarea" value={scenePrompt} onChange={e => { setScenePrompt(e.target.value); setTranslatedPrompt(''); setTranslationUsed(false); }} placeholder="Ird le a jelenetet magyarul vagy angolul..." rows={4} />
            {isTranslating && <div style={{ fontSize: 11, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={12} className="spin" /> Forditas...</div>}
            {translationUsed && translatedPrompt && (
              <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Leforditott prompt:</div>
                <div style={{ fontSize: 11, color: '#ddd6fe', lineHeight: 1.5 }}>{translatedPrompt}</div>
              </div>
            )}
            <div className="preset-grid">
              {PRESET_SCENES.map((p, i) => (
                <button key={i} className={`preset-chip ${scenePrompt === p.prompt ? 'active' : ''}`} onClick={() => { setScenePrompt(p.prompt); setTranslatedPrompt(''); setTranslationUsed(false); }}>{p.label}</button>
              ))}
            </div>
          </div>

          {/* BFL Model Selector + Params */}
          <div className="lab-card glass-panel">
            <h3 style={{ color: '#f97316', marginBottom: 14 }}>BFL FLUX.2 — Model & Params</h3>

            {/* Model selector cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 14 }}>
              {([
                {
                  id: 'auto' as const,
                  name: 'Automata (Router)',
                  badge: '🤖 Automata',
                  color: '#a78bfa',
                  desc: 'Okos irányítás: Ha nincs a promptban felirat vagy bemeneti kép, Pro-val ($0.04) generál a drágább Flex ($0.055) helyett.',
                  tags: ['Ajánlott', 'Intelligens', 'Költséghatékony'],
                  recommended: true,
                },
                {
                  id: 'bfl-flux-2-pro' as const,
                  name: 'FLUX.2 [pro]',
                  badge: '⚡ Pro',
                  color: '#f97316',
                  desc: 'Legjobb minőség/ár arány. Nagy volumenű generáláshoz, ha néhány újrapróbálás megengedett.',
                  tags: ['Általános', 'Nagy volumen', 'Költséghatékony'],
                },
                {
                  id: 'bfl-flux-2-max' as const,
                  name: 'FLUX.2 [max]',
                  badge: '🏆 Max',
                  color: '#a855f7',
                  desc: 'Legjobb általános konzisztencia és szövegminőség, ha a budget másodlagos szempont.',
                  tags: ['Legjobb minőség', 'Konzisztens', 'Prémium'],
                },
                {
                  id: 'bfl-flux-2-flex' as const,
                  name: 'FLUX.2 [flex]',
                  badge: '🏷️ Flex',
                  color: '#10b981',
                  desc: 'BFL ajánlott eszköze label/csomagolás szövegekhez: nutrition panel, pontos feliratozás.',
                  tags: ['Label/Packaging', 'Tipográfia', 'Szöveg-pontos'],
                },
              ]).map(m => (
                <div
                  key={m.id}
                  onClick={() => setBflModel(m.id)}
                  style={{
                    padding: '12px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                    border: `2px solid ${bflModel === m.id ? m.color : 'rgba(255,255,255,0.08)'}`,
                    background: bflModel === m.id ? `${m.color}18` : 'rgba(255,255,255,0.03)',
                    position: 'relative',
                  }}
                >
                  {m.recommended && (
                    <div style={{ position: 'absolute', top: -8, right: 8, fontSize: 9, fontWeight: 800, background: '#10b981', color: '#fff', padding: '1px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>BFL ajánlott</div>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 800, color: bflModel === m.id ? m.color : '#e2e8f0', marginBottom: 4 }}>{m.badge} {m.name}</div>
                  <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.4, marginBottom: 8 }}>{m.desc}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {m.tags.map(t => (
                      <span key={t} style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${m.color}22`, color: m.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flux-params">
              <div className="param-row">
                <label>Safety Tolerance <span className="param-val">{safetyTolerance}</span></label>
                <input type="range" min={0} max={5} step={1} value={safetyTolerance} onChange={e => setSafetyTolerance(+e.target.value)} />
                <span className="param-hint">0 = legbiztonságosabb, 5 = legtoleránsabb</span>
              </div>

              {/* Pro/Max: width + height */}
              {bflModel !== 'bfl-flux-2-flex' && (
                <div className="param-row">
                  <label>Méretek <span className="param-val">{bflWidth}x{bflHeight}px</span></label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="number" className="size-input" value={bflWidth} onChange={e => setBflWidth(+e.target.value)} placeholder="Szélesség" />
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>x</span>
                    <input type="number" className="size-input" value={bflHeight} onChange={e => setBflHeight(+e.target.value)} placeholder="Magasság" />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
                    {[['1:1', 1024, 1024], ['4:5', 1024, 1280], ['2:3', 1024, 1536], ['9:16', 1080, 1920], ['16:9', 1920, 1080]].map(([label, w, h]) => (
                      <button key={String(label)} className={`preset-chip ${bflWidth === w && bflHeight === h ? 'active' : ''}`} onClick={() => { setBflWidth(Number(w)); setBflHeight(Number(h)); }}>{String(label)}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Flex: aspect_ratio + resolution + guidance + steps */}
              {bflModel === 'bfl-flux-2-flex' && (
                <>
                  <div className="param-row">
                    <label>Felbontás <span className="param-val">{flexWidth}x{flexHeight}px</span></label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="number" className="size-input" value={flexWidth} onChange={e => setFlexWidth(+e.target.value)} placeholder="Szélesség" />
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>x</span>
                      <input type="number" className="size-input" value={flexHeight} onChange={e => setFlexHeight(+e.target.value)} placeholder="Magasság" />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
                      {([
                        ['1:1', 1024, 1024],
                        ['4:5', 1024, 1280],
                        ['2:3', 1024, 1536],
                        ['9:16', 1080, 1920],
                        ['16:9', 1920, 1080],
                        ['3:4', 1024, 1365],
                      ] as [string, number, number][]).map(([ar, w, h]) => (
                        <button
                          key={ar}
                          className={`preset-chip ${flexAspectRatio === ar && flexWidth === w && flexHeight === h ? 'active' : ''}`}
                          onClick={() => { setFlexAspectRatio(ar); setFlexWidth(w); setFlexHeight(h); }}
                        >{ar}</button>
                      ))}
                    </div>
                    <span className="param-hint">Preset = aspect_ratio + px méret egyszerre állítódik</span>
                  </div>
                  <div className="param-row">
                    <label>Guidance <span className="param-val">{flexGuidance.toFixed(1)}</span></label>
                    <input type="range" min={1.5} max={10} step={0.5} value={flexGuidance} onChange={e => setFlexGuidance(+e.target.value)} />
                    <span className="param-hint">Magasabb = pontosabb szöveg. Label/packaging: 4–5 ajánlott</span>
                  </div>
                  <div className="param-row">
                    <label>Inference Steps <span className="param-val">{flexSteps}</span></label>
                    <input type="range" min={1} max={50} step={1} value={flexSteps} onChange={e => setFlexSteps(+e.target.value)} />
                    <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
                      {[[10, 'Gyors'], [20, 'Normál'], [30, 'Alapért.'], [40, 'Minőségi'], [50, 'Max']].map(([v, l]) => (
                        <button key={v} className={`preset-chip ${flexSteps === v ? 'active' : ''}`} onClick={() => setFlexSteps(Number(v))}>{l} ({v})</button>
                      ))}
                    </div>
                    <span className="param-hint">Kevesebb = gyorsabb &amp; olcsóbb · Több = élesebb szöveg. Default 30 ajánlott label munkához</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Generate & Preview */}
          <div className="generate-buttons" style={{ display: 'flex', gap: 10 }}>
            <button className={`btn-generate ${isGenerating ? 'generating' : ''}`} onClick={handleGenerate} disabled={isGenerating || isPreprocessing || isPreviewLoading}>
              {isGenerating ? <><Loader2 size={18} className="spin" /> Generálás...</> : <><Zap size={18} /> FLUX.2 Generálás</>}
            </button>
            <button 
              className="btn-preview-prompt"
              onClick={handlePreviewPrompt}
              disabled={isGenerating || isPreprocessing || isPreviewLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '14px 20px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 700,
                border: '1px solid rgba(139, 92, 246, 0.4)',
                cursor: 'pointer',
                background: 'rgba(139, 92, 246, 0.1)',
                color: '#c4b5fd',
                transition: 'all 0.2s ease',
                fontFamily: 'inherit',
                flex: 1
              }}
            >
              {isPreviewLoading ? <><Loader2 size={18} className="spin" /> Összeállítás...</> : <><Eye size={18} /> Prompt előnézet</>}
            </button>
          </div>

          {composedPromptPreview && (
            <div className="lab-card glass-panel" style={{ marginTop: 12, border: '1px solid rgba(139, 92, 246, 0.3)', background: 'rgba(13, 9, 23, 0.45)', display: 'flex', flexDirection: 'column', gap: 8, animation: 'fadeInPreview 0.2s ease-out' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={12} /> Generálóba menő prompt</span>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(composedPromptPreview);
                    alert('Prompt másolva a vágólapra!');
                  }}
                  style={{
                    background: 'rgba(139, 92, 246, 0.15)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    color: '#c4b5fd',
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 10,
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.15s ease'
                  }}
                >
                  Másolás
                </button>
              </div>
              <div style={{ fontSize: 12, color: '#ddd6fe', lineHeight: 1.5, background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 6, border: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                {composedPromptPreview}
              </div>
            </div>
          )}

          {statusMsg && <div className="status-msg">{statusMsg}</div>}
          {error && <div className="error-msg">Hiba: {error}</div>}

          {logs.length > 0 && (
            <div className="console-panel">
              <h6>Logok:</h6>
              <div className="log-lines">
                {logs.map((log, idx) => (
                  <div key={idx} className={`log-line ${log.includes('[ERROR]') ? 'error' : log.includes('[SUCCESS]') ? 'success' : ''}`}>{log}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="lab-results">
          <h3><Eye size={16} /> Eredmenyek ({results.length})</h3>
          {results.length === 0 ? (
            <div className="empty-results">
              <ImageIcon size={40} />
              <p>Itt jelennek meg a generalt kepek</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {results.map((r, i) => (
                <div key={i}>
                  <div className="result-card glass-panel">
                    <img src={fixImageUrl(r.url)} alt={`Result ${i}`} className="result-image" />
                    <div className="result-footer">
                      <div className="result-meta">
                        <span className="model-badge flux">{r.model}</span>
                        <span className="time-badge">{(r.elapsed / 1000).toFixed(1)}s</span>
                      </div>
                      {r.params && <div className="result-params">{Object.entries(r.params).map(([k, v]) => `${k}:${v}`).join(' ')}</div>}
                      <p className="result-prompt">{r.prompt.substring(0, 100)}...</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <a href={fixImageUrl(r.url)} target="_blank" rel="noopener noreferrer" className="btn-download"><Download size={12} /> Megnyitas</a>
                          <button onClick={() => editingResultIdx === i ? closeLayerEditor() : openLayerEditor(i)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: editingResultIdx === i ? '#c4b5fd' : '#a78bfa', background: editingResultIdx === i ? 'rgba(139,92,246,0.15)' : 'transparent', border: `1px solid ${editingResultIdx === i ? 'rgba(139,92,246,0.4)' : 'rgba(139,92,246,0.2)'}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
                            <Layers size={11} /> {editingResultIdx === i ? 'Bezaras' : 'Layer + Sablonok'}
                          </button>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#c4b5fd', cursor: 'pointer', userSelect: 'none', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', padding: '3px 8px', borderRadius: 6 }}>
                          <input type="checkbox" checked={!!aiLayersEnabled[i]} onChange={e => {
                            const val = e.target.checked;
                            setAiLayersEnabled(prev => ({ ...prev, [i]: val }));
                            if (val && editingResultIdx === i) {
                              generateAiLayers(i);
                            }
                          }} style={{ accentColor: '#8b5cf6', cursor: 'pointer' }} />
                          <Sparkles size={11} /> AI rétegek generálása
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Inline Layer Editor */}
                  {editingResultIdx === i && layerLayout && (
                    <div style={{ marginTop: 8, background: 'rgba(17,24,39,0.97)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden', width: '100%', boxSizing: 'border-box' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Layers size={16} style={{ color: '#a78bfa' }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd' }}>Layer Szerkeszto</span>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>{getLayerChildren(layerLayout).length} reteg</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => generateAiLayers(i)} disabled={isGeneratingAiLayers} 
                            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '6px 14px', background: 'linear-gradient(135deg, #a78bfa, #7c3aed)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', opacity: isGeneratingAiLayers ? 0.6 : 1, fontFamily: 'inherit' }}>
                            {isGeneratingAiLayers ? <><RefreshCw size={12} className="spin" /> AI Tervezés...</> : <><Sparkles size={12} /> AI Rétegek</>}
                          </button>
                          <button onClick={exportLayerImage} disabled={isExportingLayer} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '6px 14px', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', opacity: isExportingLayer ? 0.6 : 1, fontFamily: 'inherit' }}>
                            {isExportingLayer ? <><RefreshCw size={12} className="spin" /> Export...</> : <><Save size={12} /> Export</>}
                          </button>
                          <button onClick={closeLayerEditor} style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#9ca3af', cursor: 'pointer', display: 'flex', fontFamily: 'inherit' }}><X size={14} /></button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', overflow: 'hidden', width: '100%', boxSizing: 'border-box' }}>
                        {renderLayerCanvas()}
                        {renderLayerSidebar()}
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>
                        Kattints egy sablonra a betolteshez · Retegeket a "Retegek" fulon szerkesztheted · Export = Playwright render
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .image-lab-container { max-width: 1400px; margin: 0 auto; }
        .lab-header { margin-bottom: 24px; }
        .lab-title-row { display: flex; align-items: center; gap: 14px; }
        .lab-icon-circle { width: 42px; height: 42px; border-radius: 50%; background: linear-gradient(135deg, rgba(250,204,21,0.2), rgba(245,158,11,0.2)); border: 1px solid rgba(250,204,21,0.3); display: flex; align-items: center; justify-content: center; color: #facc15; }
        .lab-header h2 { font-size: 22px; font-weight: 800; margin: 0; }
        .lab-subtitle { font-size: 13px; color: var(--text-muted); margin: 2px 0 0; }

        .lab-grid { display: grid; grid-template-columns: 420px 1fr; gap: 24px; align-items: start; }
        @media (max-width: 900px) { .lab-grid { grid-template-columns: 1fr; } }

        .lab-controls { display: flex; flex-direction: column; gap: 16px; }
        .lab-card { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
        .lab-card h3 { font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin: 0; }

        .upload-zone { border: 2px dashed rgba(139,92,246,0.3); border-radius: 10px; padding: 24px; cursor: pointer; transition: var(--transition-smooth); text-align: center; }
        .upload-zone:hover { border-color: rgba(139,92,246,0.6); background: rgba(139,92,246,0.05); }
        .upload-zone.has-image { border-style: solid; border-color: rgba(139,92,246,0.2); padding: 12px; }
        .upload-placeholder { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-muted); font-size: 13px; }
        .upload-hint { font-size: 11px; opacity: 0.6; }
        .upload-preview-row { display: flex; align-items: center; gap: 12px; }
        .upload-thumb { width: 60px; height: 60px; object-fit: contain; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); }
        .upload-meta { display: flex; flex-direction: column; gap: 4px; text-align: left; }
        .upload-filename { font-size: 12px; font-weight: 600; color: var(--text-main); }
        .preprocessing-badge { font-size: 11px; color: var(--accent-amber); display: flex; align-items: center; gap: 4px; }
        .done-badge { font-size: 11px; color: #10b981; }
        .btn-clear { background: transparent; border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); padding: 6px 12px; border-radius: 6px; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 4px; align-self: flex-start; }
        .btn-clear:hover { border-color: rgba(255,255,255,0.2); color: var(--text-main); }

        .scene-textarea { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 12px; color: var(--text-main); font-size: 13px; font-family: inherit; resize: vertical; line-height: 1.5; box-sizing: border-box; }
        .scene-textarea:focus { outline: none; border-color: rgba(139,92,246,0.5); }

        .preset-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .preset-chip { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); padding: 5px 10px; border-radius: 16px; font-size: 12px; cursor: pointer; transition: var(--transition-smooth); font-family: inherit; }
        .preset-chip:hover { background: rgba(139,92,246,0.15); border-color: rgba(139,92,246,0.3); color: var(--text-main); }
        .preset-chip.active { background: rgba(139,92,246,0.2); border-color: rgba(139,92,246,0.4); color: #c4b5fd; }

        .flux-params { display: flex; flex-direction: column; gap: 10px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); }
        .param-row { display: flex; flex-direction: column; gap: 3px; }
        .param-row label { font-size: 11px; font-weight: 600; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
        .param-val { color: #c4b5fd; font-weight: 700; margin-left: auto; }
        .param-hint { font-size: 10px; color: var(--text-muted); opacity: 0.5; }
        .param-row input[type="range"] { width: 100%; accent-color: #8b5cf6; }
        .size-input { width: 90px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 4px 8px; color: var(--text-main); font-size: 12px; font-family: monospace; }

        .generate-buttons { display: flex; gap: 8px; }
        .btn-generate { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 20px; border-radius: 10px; font-size: 14px; font-weight: 700; border: none; cursor: pointer; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white; transition: all 0.2s ease; box-shadow: 0 4px 20px rgba(139,92,246,0.3); font-family: inherit; }
        .btn-generate:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 25px rgba(139,92,246,0.4); }
        .btn-generate:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-generate.generating { background: linear-gradient(135deg, #6d28d9 0%, #4c1d95 100%); }
        .btn-preview-prompt:hover:not(:disabled) { background: rgba(139, 92, 246, 0.2) !important; border-color: rgba(139, 92, 246, 0.7) !important; color: #fff !important; transform: translateY(-1px); }
        .btn-preview-prompt:disabled { opacity: 0.6; cursor: not-allowed; }

        .status-msg { font-size: 12px; color: #10b981; text-align: center; padding: 4px; }
        .error-msg { font-size: 12px; color: #ef4444; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px; }

        .console-panel { background: #050308; border: 1px solid var(--panel-border); border-radius: 8px; padding: 10px; font-family: monospace; font-size: 10px; height: 140px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
        .console-panel h6 { color: var(--primary-neon); font-weight: 700; margin: 0 0 4px; }
        .log-lines { display: flex; flex-direction: column; gap: 3px; }
        .log-line { color: var(--text-muted); white-space: pre-wrap; word-break: break-all; }
        .log-line.success { color: #10b981; }
        .log-line.error { color: #ef4444; }

        .lab-results h3 { font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 16px; }
        .empty-results { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: var(--text-muted); gap: 12px; opacity: 0.4; }

        .result-card { padding: 0; overflow: hidden; }
        .result-image { width: 100%; aspect-ratio: 4/5; object-fit: cover; display: block; }
        .result-footer { padding: 12px; display: flex; flex-direction: column; gap: 6px; }
        .result-meta { display: flex; gap: 6px; }
        .model-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; }
        .model-badge.flux { background: rgba(139,92,246,0.2); color: #c4b5fd; }
        .time-badge { font-size: 10px; font-weight: 700; background: rgba(250,204,21,0.15); color: #fcd34d; padding: 2px 8px; border-radius: 4px; }
        .result-params { font-size: 10px; color: var(--text-muted); font-family: monospace; background: rgba(0,0,0,0.2); padding: 3px 6px; border-radius: 4px; }
        .result-prompt { font-size: 11px; color: var(--text-muted); line-height: 1.4; margin: 0; }
        .btn-download { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--primary-neon); text-decoration: none; font-weight: 600; }

        .lab-layer-add-btn { display: flex; align-items: center; gap: 5px; font-size: 11px; padding: 5px 10px; background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.25); border-radius: 16px; color: #a78bfa; cursor: pointer; font-family: inherit; }
        .lab-layer-add-btn:hover { background: rgba(139,92,246,0.2); }

        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInPreview {
          from { opacity: 0; transform: scale(0.94) translateX(6px); }
          to   { opacity: 1; transform: scale(1)    translateX(0); }
        }
      `}</style>
    </div>
  );
}
