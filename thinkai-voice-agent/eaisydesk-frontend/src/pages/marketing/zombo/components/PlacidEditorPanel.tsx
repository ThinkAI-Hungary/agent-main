import React, { useState, useEffect } from 'react';
import { showToast } from '../../../../components/ui/Toast';
import placidPresetsLibrary from '../data/placid_presets_library.json';
import '../zombo.css';

const API = (import.meta as any).env?.VITE_KEPGENERALAS_API_URL || 'http://localhost:3001';

interface Box {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

interface PlacidPosition {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

interface PlacidLayer {
  name: string;
  type: string;
  position: PlacidPosition;
  style: Record<string, any>;
  text?: string;
  description?: string;
  context_instruction?: string;
}

interface PlacidTemplate {
  uuid: string;
  title: string;
  thumbnail: string;
  tags: string[];
  resolution: {
    width: number;
    height: number;
  };
  layers: PlacidLayer[];
}

interface GroupedTemplate {
  title: string;
  tags: string[];
  thumbnail: string;
  variants: PlacidTemplate[];
}

interface Props {
  baseImageUrl: string;
  productImageUrl?: string;
  productPosition?: {
    left: number;
    top: number;
    width: number;
    height: number;
    normalized: Box;
  } | null;
  prompt?: string;
  subject?: string;
  decomposedLayerText?: string;
  decomposedLayerCta?: string;
}

// Convert internal Placid font names to standard Google Fonts
export function parsePlacidFont(fontName: string): { fontFamily: string; fontWeight: string; fontStyle: string } {
  if (!fontName) return { fontFamily: 'sans-serif', fontWeight: '400', fontStyle: 'normal' };

  const nameLower = fontName.toLowerCase();
  let family = 'sans-serif';

  if (nameLower.startsWith('opensans')) {
    family = 'Open Sans';
  } else if (nameLower.startsWith('josefinsans')) {
    family = 'Josefin Sans';
  } else if (nameLower.startsWith('montserrat')) {
    family = 'Montserrat';
  } else if (nameLower.startsWith('lato')) {
    family = 'Lato';
  } else if (nameLower.startsWith('playfairdisplay')) {
    family = 'Playfair Display';
  } else if (nameLower.startsWith('raleway')) {
    family = 'Raleway';
  } else if (nameLower.startsWith('poppins')) {
    family = 'Poppins';
  } else if (nameLower.startsWith('roboto')) {
    family = 'Roboto';
  } else if (nameLower.startsWith('merriweather')) {
    family = 'Merriweather';
  } else if (nameLower.startsWith('oswald')) {
    family = 'Oswald';
  } else if (nameLower.startsWith('firasans')) {
    family = 'Fira Sans';
  } else if (nameLower.startsWith('lora')) {
    family = 'Lora';
  } else if (nameLower.startsWith('nunito')) {
    family = 'Nunito';
  } else if (nameLower.startsWith('quicksand')) {
    family = 'Quicksand';
  } else {
    const cleanName = nameLower.split('-')[0];
    family = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  }

  let weight = '400';
  let style = 'normal';

  if (nameLower.includes('extrabold') || nameLower.includes('black') || nameLower.includes('900') || nameLower.includes('ultrabold')) {
    weight = '800';
  } else if (nameLower.includes('bold') || nameLower.includes('700')) {
    weight = '700';
  } else if (nameLower.includes('semibold') || nameLower.includes('600')) {
    weight = '600';
  } else if (nameLower.includes('medium') || nameLower.includes('500')) {
    weight = '500';
  } else if (nameLower.includes('light') || nameLower.includes('300')) {
    weight = '300';
  }

  if (nameLower.includes('italic')) {
    style = 'italic';
  }

  return {
    fontFamily: `"${family}", sans-serif`,
    fontWeight: weight,
    fontStyle: style
  };
}

// Convert all px styling keys to relative container-query width (cqw) for perfect preview scaling
function scaleStyleToCqw(style: Record<string, any>, canvasWidth: number): React.CSSProperties {
  const scaled: Record<string, any> = {};
  Object.entries(style).forEach(([key, val]) => {
    if (typeof val === 'string' && val.endsWith('px')) {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        scaled[key] = `${(num / canvasWidth) * 100}cqw`;
        return;
      }
    }
    scaled[key] = val;
  });
  return scaled as React.CSSProperties;
}

// Generate CSS @import statement for Google Fonts used in the template
const getGoogleFontsImport = (template: PlacidTemplate) => {
  const fontNames = new Set<string>();
  if (template?.layers) {
    template.layers.forEach(layer => {
      if (layer.type === 'text' && layer.style.fontFamily) {
        const parsed = parsePlacidFont(layer.style.fontFamily);
        const cleanName = parsed.fontFamily.replace(/"/g, '').split(',')[0].trim();
        if (cleanName && cleanName !== 'sans-serif') {
          fontNames.add(cleanName.replace(/\s+/g, '+'));
        }
      }
    });
  }
  
  if (fontNames.size === 0) return '';
  const familiesParam = Array.from(fontNames)
    .map(name => `family=${name}:wght@300;400;500;600;700;800;900`)
    .join('&');
  return `@import url('https://fonts.googleapis.com/css2?${familiesParam}&display=swap');`;
};

// Categorize text layers to allow persistent text values
function getTextLayerCategory(name: string): 'headline' | 'cta' | 'url' | 'price' | 'other' {
  const n = name.toLowerCase();
  if (n.includes('title') || n.includes('headline') || n.includes('header') || n.includes('subject') || n.includes('name')) {
    return 'headline';
  }
  if (n.includes('cta') || n.includes('btn') || n.includes('button') || n.includes('link')) {
    return 'cta';
  }
  if (n.includes('url') || n.includes('website') || n.includes('domain') || n.includes('web')) {
    return 'url';
  }
  if (n.includes('price') || n.includes('discount') || n.includes('sale') || n.includes('percent') || n.includes('amount') || n.includes('currency') || n.includes('value')) {
    return 'price';
  }
  return 'other';
}

// Extract presets from library
const PRESETS: PlacidTemplate[] = (placidPresetsLibrary.templates || []) as PlacidTemplate[];

// Group presets by title to avoid duplicates
const GROUPED_PRESETS: GroupedTemplate[] = [];
PRESETS.forEach((t: PlacidTemplate) => {
  let group = GROUPED_PRESETS.find(g => g.title === t.title);
  if (!group) {
    group = {
      title: t.title,
      tags: t.tags,
      thumbnail: t.thumbnail,
      variants: []
    };
    GROUPED_PRESETS.push(group);
  }
  group.variants.push(t);
});

export default function PlacidEditorPanel({
  baseImageUrl,
  productImageUrl,
  productPosition,
  prompt = '',
  subject = '',
  decomposedLayerText = '',
  decomposedLayerCta = ''
}: Props) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(PRESETS[0]?.uuid || '');
  
  // Persistent unified text states
  const [customHeadline, setCustomHeadline] = useState(decomposedLayerText || 'dummy text');
  const [customCta, setCustomCta] = useState(decomposedLayerCta || 'dummy text');
  const [customUrl, setCustomUrl] = useState('dummy text');
  const [customPrice, setCustomPrice] = useState('dummy text');
  const [otherLayerValues, setOtherLayerValues] = useState<Record<string, string>>({});
  
  const [isRendering, setIsRendering] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'presets' | 'presets'>('presets'); // Limit to presets tab
  const [apiTemplates, setApiTemplates] = useState<any[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  
  // Custom image layer mappings state
  const [imageMappings, setImageMappings] = useState<Record<string, 'base' | 'product' | 'none'>>({});
  
  // Modal states for browsing presets
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [tempSelectedTemplateId, setTempSelectedTemplateId] = useState<string>(selectedTemplateId);

  const selectedTemplate = PRESETS.find(t => t.uuid === selectedTemplateId) || PRESETS[0];

  // Calculate product center from normalized position for background crop centering
  let productCenterX = 50;
  let productCenterY = 50;
  if (productPosition?.normalized) {
    const box = productPosition.normalized;
    productCenterX = Math.round((box.xmin + box.xmax) / 2);
    productCenterY = Math.round((box.ymin + box.ymax) / 2);
  }

  // Get resolved text for a specific layer name
  const getLayerTextValue = (layerName: string) => {
    const cat = getTextLayerCategory(layerName);
    if (cat === 'headline') return customHeadline || 'dummy text';
    if (cat === 'cta') return customCta || 'dummy text';
    if (cat === 'url') return customUrl || 'dummy text';
    if (cat === 'price') return customPrice || 'dummy text';
    return otherLayerValues[layerName] || 'dummy text';
  };

  // Sync edit fields & image mappings state on template select
  useEffect(() => {
    if (selectedTemplate) {
      // 1. Initialize other layer values
      const initialOthers: Record<string, string> = {};
      selectedTemplate.layers.forEach((layer) => {
        if (layer.type === 'text') {
          const cat = getTextLayerCategory(layer.name);
          if (cat === 'other') {
            initialOthers[layer.name] = layer.text || 'dummy text';
          }
        }
      });
      setOtherLayerValues(initialOthers);

      // 2. Image layers mapping initialization
      const initialImages: Record<string, 'base' | 'product' | 'none'> = {};
      const pictureLayers = selectedTemplate.layers.filter((l: PlacidLayer) => l.type === 'picture');
      
      pictureLayers.forEach((layer: PlacidLayer, idx: number) => {
        const nameLower = layer.name.toLowerCase();
        // Default small avatars/logos/user boxes to empty to keep clean
        if (nameLower.includes('avatar') || nameLower.includes('profile') || nameLower.includes('logo') || nameLower.includes('user') || nameLower.includes('author')) {
          initialImages[layer.name] = 'none';
        } else if (nameLower.includes('product') || nameLower.includes('item') || nameLower.includes('cutout')) {
          initialImages[layer.name] = 'product';
        } else if (idx === 0) {
          initialImages[layer.name] = 'base';
        } else if (idx === 1 && productImageUrl) {
          initialImages[layer.name] = 'product';
        } else {
          initialImages[layer.name] = 'base';
        }
      });
      setImageMappings(initialImages);
    }
  }, [selectedTemplateId, activeTab]);

  // Local Rendering Trigger
  const handlePlacidRender = async () => {
    setIsRendering(true);
    setRenderedUrl(null);
    try {
      const compiledLayerValues: Record<string, string> = {};
      selectedTemplate.layers.forEach(layer => {
        if (layer.type === 'text') {
          compiledLayerValues[layer.name] = getLayerTextValue(layer.name);
        }
      });

      const payload = {
        width: selectedTemplate.resolution?.width || 1200,
        height: selectedTemplate.resolution?.height || 1200,
        layers: selectedTemplate.layers,
        layerValues: compiledLayerValues,
        baseImageUrl,
        productImageUrl,
        imageMappings,
        productPosition
      };
      const response = await fetch(`${API}/api/image/placid-render-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`Local Render Error: ${response.status}`);
      const data = await response.json();
      if (data.image_url) {
        setRenderedUrl(data.image_url);
        showToast({ title: 'Sikeres helyi renderelés', message: 'A kompozit kép elkészült helyileg!', type: 'success' });
      } else {
        throw new Error('Nincs image_url a válaszban');
      }
    } catch (err: any) {
      console.error('[PlacidPanel] Render failed:', err);
      showToast({ title: 'Renderelési Hiba', message: err.message, type: 'error' });
    } finally {
      setIsRendering(false);
    }
  };

  const handleRefineCopy = async (category: 'headline' | 'cta') => {
    const currentVal = category === 'headline' ? customHeadline : customCta;
    if (!currentVal) return;
    setIsRendering(true);
    try {
      const resp = await fetch(`${API}/api/image/placid-refine-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: currentVal,
          maxHeadlineLen: category === 'cta' ? 15 : 45
        })
      });
      if (!resp.ok) throw new Error('Refine failed');
      const data = await resp.json();
      if (data.refinedText) {
        if (category === 'headline') setCustomHeadline(data.refinedText);
        else setCustomCta(data.refinedText);
        showToast({ title: 'AI Tömörítés kész', message: 'A szöveg optimalizálva lett!', type: 'success' });
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsRendering(false);
    }
  };

  // Get all unique tags for filter tabs
  const categories = ['All', ...Array.from(new Set(PRESETS.flatMap(t => t.tags || [])))].slice(0, 10);

  // Filter grouped presets based on query & selected category tab
  const filteredGroups = GROUPED_PRESETS.filter(g => {
    const matchesSearch = g.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          g.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat = selectedCategory === 'All' || g.tags.includes(selectedCategory);
    return matchesSearch && matchesCat;
  });

  const displayUrl = renderedUrl ? (renderedUrl.startsWith('http') ? renderedUrl : `${API}${renderedUrl}`) : null;

  // Checklist of what the template expects
  const textLayers = selectedTemplate?.layers?.filter((l: PlacidLayer) => l.type === 'text') || [];
  const pictureLayers = selectedTemplate?.layers?.filter((l: PlacidLayer) => l.type === 'picture') || [];
  const shapeLayers = selectedTemplate?.layers?.filter((l: PlacidLayer) => l.type === 'shape') || [];
  
  const hasCta = textLayers.some((l: PlacidLayer) => l.name.toLowerCase().includes('cta') || l.name.toLowerCase().includes('button'));
  const hasBadge = shapeLayers.some((l: PlacidLayer) => l.name.toLowerCase().includes('badge') || l.name.toLowerCase().includes('percentage') || l.name.toLowerCase().includes('sale') || l.name.toLowerCase().includes('discount'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      
      {/* Template Requirements Checklist panel */}
      {selectedTemplate && (
        <div style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(251,191,36,0.03)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            📋 Sablon Adatelvárások és Követelmények
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🔤</span>
              <span><strong>Szövegek ({textLayers.length} db)</strong>: {hasCta ? 'Tartalmaz CTA gombot' : 'Csak feliratok'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🖼️</span>
              <span><strong>Képek ({pictureLayers.length} db)</strong>: {pictureLayers.length > 1 ? `${pictureLayers.length} réteges kompozíció (háttér + termék)` : '1 db fő kép'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🏷️</span>
              <span><strong>Badge / Akciójel</strong>: {hasBadge ? 'Igen, akciós matrica / százalékjel van benne' : 'Nincs külön díszítő alakzat'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Local High-Fidelity Simulation Preview */}
      <div style={{ borderRadius: 14, overflow: 'hidden', border: '2px solid var(--border)', background: '#090d16', position: 'relative', aspectRatio: selectedTemplate?.resolution ? `${selectedTemplate.resolution.width}/${selectedTemplate.resolution.height}` : '1/1', containerType: 'inline-size' }}>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          
          {/* Inject dynamic fonts */}
          <style dangerouslySetInnerHTML={{ __html: getGoogleFontsImport(selectedTemplate) }} />

          {displayUrl ? (
            <img src={displayUrl} alt="Placid preview" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          ) : (
            <>
              {/* Solid white canvas background */}
              <div style={{ position: 'absolute', inset: 0, backgroundColor: '#ffffff', zIndex: 0 }} />
              
              {/* Dynamic layer renderer sorted by zIndex */}
              {selectedTemplate ? (
                <>
                  {[...selectedTemplate.layers].sort((a, b) => (a.style.zIndex || 0) - (b.style.zIndex || 0)).map((layer: PlacidLayer) => {
                    const left = `${layer.position.xmin}%`;
                    const top = `${layer.position.ymin}%`;
                    const w = `${layer.position.xmax - layer.position.xmin}%`;
                    const h = `${layer.position.ymax - layer.position.ymin}%`;

                    // Parse fonts and convert standard properties to cqw units
                    const parsedFont = layer.style.fontFamily ? parsePlacidFont(layer.style.fontFamily) : null;
                    const fontOverrides = parsedFont ? {
                      fontFamily: parsedFont.fontFamily,
                      fontWeight: parsedFont.fontWeight,
                      fontStyle: parsedFont.fontStyle
                    } : {};

                    const scaledStyle = scaleStyleToCqw({
                      ...layer.style,
                      ...fontOverrides
                    }, selectedTemplate.resolution.width);

                    const style: React.CSSProperties = {
                      position: 'absolute', left, top, width: w, height: h,
                      boxSizing: 'border-box', pointerEvents: 'none',
                      ...scaledStyle
                    };

                    if (layer.type === 'text') {
                      const val = getLayerTextValue(layer.name);
                      
                      // Map alignment to flex positioning
                      let justifyContent = 'center';
                      if (layer.style.textAlign === 'left') justifyContent = 'flex-start';
                      if (layer.style.textAlign === 'right') justifyContent = 'flex-end';

                      return (
                        <div key={layer.name} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent, padding: '0 8px', wordBreak: 'break-word', overflow: 'hidden' }}>
                          <div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', width: '100%', wordWrap: 'break-word', textAlign: 'inherit' }}>
                            {val}
                          </div>
                        </div>
                      );
                    }

                    if (layer.type === 'picture') {
                      let imgSrc = baseImageUrl;
                      const mapping = imageMappings[layer.name];
                      
                      if (mapping === 'product') {
                        imgSrc = productImageUrl || '';
                      } else if (mapping === 'none') {
                        imgSrc = '';
                      }
                      
                      const isProduct = mapping === 'product';
                      const objectFit = isProduct ? 'contain' : (layer.style.objectFit || 'cover');
                      
                      // Auto-center background image crop around the detected product
                      const objectPosition = isProduct ? 'center' : `${productCenterX}% ${productCenterY}%`;

                      return (
                        <div key={layer.name} style={{ ...style, overflow: 'hidden' }}>
                          {imgSrc && (
                            <img src={imgSrc.startsWith('http') ? imgSrc : `${API}${imgSrc}`} alt={layer.name} style={{ width: '100%', height: '100%', objectFit, objectPosition, display: 'block' }} />
                          )}
                        </div>
                      );
                    }

                    if (layer.type === 'shape') {
                      return <div key={layer.name} style={style} />;
                    }

                    return null;
                  })}
                </>
              ) : (
                <img src={baseImageUrl} alt="Placid preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              )}
            </>
          )}

          {/* Render loader overlay */}
          {isRendering && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)', zIndex: 20 }}>
              <div style={{ textAlign: 'center', color: '#fff' }}>
                <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fbbf24', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
                <div style={{ fontSize: 12, fontWeight: 700 }}>Helyi Renderelés folyamatban...</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Editor Inputs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Main semantic inputs */}
        {textLayers.some(l => getTextLayerCategory(l.name) === 'headline') && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Főcím / Headline</label>
              <button
                onClick={() => handleRefineCopy('headline')}
                style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, cursor: 'pointer' }}
              >
                ✨ AI Tömörítés
              </button>
            </div>
            <input
              type="text"
              value={customHeadline}
              onChange={e => setCustomHeadline(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        )}

        {textLayers.some(l => getTextLayerCategory(l.name) === 'cta') && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Gomb felirat / CTA</label>
              <button
                onClick={() => handleRefineCopy('cta')}
                style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, cursor: 'pointer' }}
              >
                ✨ AI Tömörítés
              </button>
            </div>
            <input
              type="text"
              value={customCta}
              onChange={e => setCustomCta(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        )}

        {textLayers.some(l => getTextLayerCategory(l.name) === 'url') && (
          <div>
            <label style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Weboldal cím / URL</label>
            <input
              type="text"
              value={customUrl}
              onChange={e => setCustomUrl(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        )}

        {textLayers.some(l => getTextLayerCategory(l.name) === 'price') && (
          <div>
            <label style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Ár / Kedvezmény / Százalék</label>
            <input
              type="text"
              value={customPrice}
              onChange={e => setCustomPrice(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        )}

        {/* Other text layers inputs */}
        {Object.keys(otherLayerValues).map(layerName => (
          <div key={layerName}>
            <label style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              {layerName.replace(/_/g, ' ')} réteg
            </label>
            <input
              type="text"
              value={otherLayerValues[layerName] || ''}
              onChange={e => setOtherLayerValues(prev => ({ ...prev, [layerName]: e.target.value }))}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        ))}

        {/* Custom dropdowns for picture layers selection */}
        {pictureLayers.length > 0 && (
          <div style={{ marginTop: 8, padding: '12px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--bg3)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>🖼️ Kép Rétegek Beállításai</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pictureLayers.map((layer: PlacidLayer) => (
                <div key={layer.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '45%' }}>
                    {layer.name.replace(/_/g, ' ')}
                  </span>
                  <select
                    value={imageMappings[layer.name] || 'base'}
                    onChange={e => setImageMappings(prev => ({ ...prev, [layer.name]: e.target.value as any }))}
                    style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 11, fontWeight: 600, outline: 'none' }}
                  >
                    <option value="base">Háttérkép (AI generált)</option>
                    <option value="product">Termékkép (Körbevágott)</option>
                    <option value="none">Üres / Átlátszó</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Preset template selector */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Sablon Kiválasztása</div>

        <div style={{ display: 'flex', background: 'var(--bg)', padding: 3, borderRadius: 10, border: '1px solid var(--border)', marginBottom: 12 }}>
          <button
            style={{ flex: 1, padding: '6px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            Gyári minták ({GROUPED_PRESETS.length})
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg3)' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{selectedTemplate?.title}</div>
              <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 2 }}>{selectedTemplate?.tags?.join(', ')}</div>
            </div>
            <button
              onClick={() => { setTempSelectedTemplateId(selectedTemplateId); setShowModal(true); }}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #fbbf24', background: 'rgba(251,191,36,0.1)', color: '#fbbf24', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
            >
              🎨 Böngészés modalban
            </button>
          </div>

          {/* Resolution Selector Pills in main sidebar */}
          {(() => {
            const currentGroup = GROUPED_PRESETS.find(g => g.variants.some(v => v.uuid === selectedTemplateId));
            if (!currentGroup || currentGroup.variants.length <= 1) return null;
            return (
              <div style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Méretek / Felbontások</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {currentGroup.variants.map(variant => {
                    const isSelected = selectedTemplateId === variant.uuid;
                    return (
                      <button
                        key={variant.uuid}
                        onClick={() => { setSelectedTemplateId(variant.uuid); setRenderedUrl(null); }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: isSelected ? '1.5px solid #fbbf24' : '1px solid var(--border)',
                          background: isSelected ? 'rgba(251,191,36,0.12)' : 'var(--bg2)',
                          color: isSelected ? '#fbbf24' : 'var(--text-dim)',
                          fontSize: 9.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        {variant.resolution.width}x{variant.resolution.height}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Render triggers */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {renderedUrl && (
          <>
            <button
              onClick={() => setRenderedUrl(null)}
              style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Vissza
            </button>
            <a
              href={renderedUrl.startsWith('http') ? renderedUrl : `${API}${renderedUrl}`}
              download={`placid-render-${Date.now()}.jpg`}
              target="_blank"
              rel="noreferrer"
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 9,
                background: '#10b981',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              Letöltés
            </a>
          </>
        )}
        {!renderedUrl && (
          <button
            onClick={handlePlacidRender}
            disabled={isRendering}
            style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#fbbf24,#d97706)', color: '#000', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
          >
            {isRendering ? 'Renderelés...' : 'Összeállítás helyileg (no-API)'}
          </button>
        )}
      </div>

      {/* Placid Templates Browser Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ maxWidth: 1100, width: '95%', height: '85vh', background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'space-between', background: 'var(--bg3)' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text)' }}>Placid Preset Sablonok ({GROUPED_PRESETS.length} dizájn)</h3>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Válassz ki egy elrendezést és válaszd ki a kívánt képarányt a helyi képösszeállításhoz</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.06)', color: 'var(--text)', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            {/* Split Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              
              {/* Left Pane - Grid */}
              <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg)' }}>
                {/* Modal Filters */}
                <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg2)' }}>
                  {/* Search input */}
                  <input
                    type="text"
                    placeholder="Keresés cím vagy kulcsszó alapján..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ width: '100%', padding: '9px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, outline: 'none' }}
                  />

                  {/* Categories horizontal list */}
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                    {categories.map(cat => {
                      const isActive = selectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(cat)}
                          style={{ padding: '5px 12px', borderRadius: 20, border: isActive ? '1.5px solid #fbbf24' : '1px solid var(--border)', background: isActive ? 'rgba(251,191,36,0.12)' : 'var(--bg3)', color: isActive ? '#fbbf24' : 'var(--text-muted)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Grid Scroll Area */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14 }}>
                    {filteredGroups.map(group => {
                      const isGroupSelected = group.variants.some(v => v.uuid === tempSelectedTemplateId);

                      return (
                        <div
                          key={group.title}
                          onClick={() => setTempSelectedTemplateId(group.variants[0].uuid)}
                          style={{ border: isGroupSelected ? '2px solid #fbbf24' : '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg2)', cursor: 'pointer', display: 'flex', flexDirection: 'column', transition: 'all 0.2s', boxShadow: isGroupSelected ? '0 0 12px rgba(251,191,36,0.2)' : 'none' }}
                        >
                          {/* Image container */}
                          <div style={{ width: '100%', aspectRatio: '1/1', background: 'var(--bg)', overflow: 'hidden', borderBottom: '1px solid var(--border)', position: 'relative' }}>
                            {group.thumbnail ? (
                              <img src={group.thumbnail} alt={group.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-muted)' }}>Nincs előnézet</div>
                            )}
                            {group.variants.length > 1 && (
                              <span style={{ position: 'absolute', top: 4, right: 4, fontSize: 8.5, fontWeight: 900, background: 'rgba(139,92,246,0.95)', color: '#fff', padding: '1px 5px', borderRadius: 4 }}>
                                {group.variants.length} méret
                              </span>
                            )}
                          </div>

                          {/* Content block */}
                          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.title}</div>
                            <div style={{ fontSize: 8.5, color: 'var(--text-muted)' }}>{group.variants.length} felbontás</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {filteredGroups.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>Nincs találat.</div>
                  )}
                </div>
              </div>

              {/* Right Pane - Preview */}
              {(() => {
                const tempTemplate = PRESETS.find(t => t.uuid === tempSelectedTemplateId) || PRESETS[0];
                const tempGroup = GROUPED_PRESETS.find(g => g.variants.some(v => v.uuid === tempSelectedTemplateId)) || GROUPED_PRESETS[0];
                const tempTextLayers = tempTemplate?.layers?.filter((l: PlacidLayer) => l.type === 'text') || [];
                const tempPictureLayers = tempTemplate?.layers?.filter((l: PlacidLayer) => l.type === 'picture') || [];
                const tempShapeLayers = tempTemplate?.layers?.filter((l: PlacidLayer) => l.type === 'shape') || [];

                return (
                  <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', height: '100%', padding: 20, background: 'var(--bg3)', overflowY: 'auto' }}>
                    <div style={{ marginBottom: 12 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{tempTemplate?.title}</h4>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                        {tempTemplate?.tags?.join(', ')}
                      </p>
                    </div>

                    {/* Resolution Selection Pills */}
                    {tempGroup && tempGroup.variants.length > 1 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Válassz Méretet / Képarány</span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {tempGroup.variants.map(v => {
                            const isSelected = tempSelectedTemplateId === v.uuid;
                            return (
                              <button
                                key={v.uuid}
                                onClick={() => setTempSelectedTemplateId(v.uuid)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  border: isSelected ? '1.5px solid #fbbf24' : '1px solid var(--border)',
                                  background: isSelected ? 'rgba(251,191,36,0.12)' : 'var(--bg2)',
                                  color: isSelected ? '#fbbf24' : 'var(--text-dim)',
                                  fontSize: 9.5,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s'
                                }}
                              >
                                {v.resolution.width}x{v.resolution.height}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Live Simulation Preview inside Modal */}
                    {tempTemplate ? (
                      <div style={{
                        position: 'relative',
                        width: '100%',
                        aspectRatio: tempTemplate.resolution ? `${tempTemplate.resolution.width}/${tempTemplate.resolution.height}` : '1/1',
                        border: '1.5px solid var(--border)',
                        borderRadius: 12,
                        overflow: 'hidden',
                        background: '#090d16',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                        marginBottom: 12,
                        flexShrink: 0,
                        containerType: 'inline-size'
                      }}>
                        {/* Solid white canvas background */}
                        <div style={{ position: 'absolute', inset: 0, backgroundColor: '#ffffff', zIndex: 0 }} />
                        
                        {/* Inject dynamic fonts */}
                        <style dangerouslySetInnerHTML={{ __html: getGoogleFontsImport(tempTemplate) }} />

                        {/* Dynamic Layers sorted by zIndex */}
                        {[...tempTemplate.layers].sort((a, b) => (a.style.zIndex || 0) - (b.style.zIndex || 0)).map((layer: PlacidLayer) => {
                          const left = `${layer.position.xmin}%`;
                          const top = `${layer.position.ymin}%`;
                          const w = `${layer.position.xmax - layer.position.xmin}%`;
                          const h = `${layer.position.ymax - layer.position.ymin}%`;

                          const parsedFont = layer.style.fontFamily ? parsePlacidFont(layer.style.fontFamily) : null;
                          const fontOverrides = parsedFont ? {
                            fontFamily: parsedFont.fontFamily,
                            fontWeight: parsedFont.fontWeight,
                            fontStyle: parsedFont.fontStyle
                          } : {};

                          const scaledStyle = scaleStyleToCqw({
                            ...layer.style,
                            ...fontOverrides
                          }, tempTemplate.resolution.width);

                          const style: React.CSSProperties = {
                            position: 'absolute', left, top, width: w, height: h,
                            boxSizing: 'border-box', pointerEvents: 'none',
                            ...scaledStyle
                          };

                          if (layer.type === 'text') {
                            const val = getLayerTextValue(layer.name);
                            
                            let justifyContent = 'center';
                            if (layer.style.textAlign === 'left') justifyContent = 'flex-start';
                            if (layer.style.textAlign === 'right') justifyContent = 'flex-end';

                            return (
                              <div key={layer.name} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent, padding: '0 4px', wordBreak: 'break-word', overflow: 'hidden' }}>
                                <div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', width: '100%', wordWrap: 'break-word', textAlign: 'inherit', fontSize: 'min(1.2vw, 11px)' }}>
                                  {val}
                                </div>
                              </div>
                            );
                          }

                          if (layer.type === 'picture') {
                            let imgSrc = baseImageUrl;
                            const mapping = imageMappings[layer.name];
                            if (mapping === 'product') {
                              imgSrc = productImageUrl || '';
                            } else if (mapping === 'none') {
                              imgSrc = '';
                            }
                            
                            const isProduct = mapping === 'product';
                            const objectFit = isProduct ? 'contain' : (layer.style.objectFit || 'cover');
                            
                            // Auto-center background image crop around the detected product
                            const objectPosition = isProduct ? 'center' : `${productCenterX}% ${productCenterY}%`;

                            return (
                              <div key={layer.name} style={{ ...style, overflow: 'hidden' }}>
                                {imgSrc && (
                                  <img src={imgSrc.startsWith('http') ? imgSrc : `${API}${imgSrc}`} alt={layer.name} style={{ width: '100%', height: '100%', objectFit, objectPosition, display: 'block' }} />
                                )}
                              </div>
                            );
                          }

                          if (layer.type === 'shape') {
                            return <div key={layer.name} style={style} />;
                          }

                          return null;
                        })}
                      </div>
                    ) : (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Válassz ki egy sablont az előnézethez
                      </div>
                    )}

                    {/* Requirements checklist inside Preview Pane */}
                    {tempTemplate && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, overflowY: 'auto', marginBottom: 14 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Sablon Követelményei</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10.5 }}>
                          <div style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg2)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>🔤 Szövegrétegek:</span>
                            <strong>{tempTextLayers.length} db</strong>
                          </div>
                          <div style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg2)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>🖼️ Képrétegek:</span>
                            <strong>{tempPictureLayers.length} db</strong>
                          </div>
                          <div style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg2)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>🏷️ Alakzatok:</span>
                            <strong>{tempShapeLayers.length} db</strong>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Select button */}
                    <button
                      onClick={() => {
                        setSelectedTemplateId(tempSelectedTemplateId);
                        setRenderedUrl(null);
                        setShowModal(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: 'none',
                        background: 'linear-gradient(135deg,#fbbf24,#d97706)',
                        color: '#000',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                        textAlign: 'center',
                        flexShrink: 0
                      }}
                    >
                      Sablon Alkalmazása
                    </button>
                  </div>
                );
              })()}

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
