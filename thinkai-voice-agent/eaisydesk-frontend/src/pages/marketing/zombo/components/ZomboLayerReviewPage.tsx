import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { showToast } from '../../../../components/ui/Toast';
import placidPresetsLibrary from '../data/placid_presets_library.json';
import { parsePlacidFont } from './PlacidEditorPanel';
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

const PRESETS = (placidPresetsLibrary.templates || []) as PlacidTemplate[];

// Group presets by title
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

// Helper function to check if a picture layer is a background layer
function isBackgroundLayer(layer: PlacidLayer, index: number): boolean {
  if (layer.type !== 'picture') return false;
  const nameLower = layer.name.toLowerCase();
  
  // 1. Explicit background names
  if (
    nameLower === 'bg' ||
    nameLower === 'background' ||
    nameLower === 'bg_img' ||
    nameLower === 'bg_image' ||
    nameLower === 'bg_mesh' ||
    nameLower === 'background_image' ||
    nameLower === 'pattern_bg' ||
    nameLower === 'texture' ||
    nameLower === 'carton'
  ) {
    return true;
  }
  
  // 2. Full screen picture layers
  const pos = layer.position || {};
  const isFullScreen = 
    pos.xmin === 0 && 
    pos.ymin === 0 && 
    pos.xmax === 100 && 
    pos.ymax === 100;
  if (isFullScreen) {
    return true;
  }

  // 3. Exact 'img' or 'image' or 'photo' if it is the first picture layer
  if (
    (nameLower === 'img' || nameLower === 'image' || nameLower === 'photo' || nameLower === 'picture' || nameLower === 'main') &&
    index === 0
  ) {
    return true;
  }

  return false;
}

export default function ZomboLayerReviewPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Load saved state from LocalStorage or fallbacks
  const [baseImageUrl, setBaseImageUrl] = useState<string>(() => {
    return localStorage.getItem('qpp_pinned_test_image') || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff';
  });
  const [productImageUrl, setProductImageUrl] = useState<string>(() => {
    return localStorage.getItem('qpp_pinned_test_image_product_url') || '';
  });
  const [productPosition, setProductPosition] = useState<any>(() => {
    const stored = localStorage.getItem('qpp_pinned_test_image_position');
    return stored ? JSON.parse(stored) : null;
  });

  // State for reviewed templates (saved in LocalStorage)
  const [reviewedTemplates, setReviewedTemplates] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('zombo_reviewed_templates');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // State for reviewed individual layers (saved in LocalStorage as 'templateUuid::layerName')
  const [reviewedLayers, setReviewedLayers] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('zombo_reviewed_layers');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // State for template requirements with auto-counted defaults (excluding background image unless only 1 image exists)
  const [templateRequirements, setTemplateRequirements] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    PRESETS.forEach(t => {
      const allPics = (t.layers || []).filter(l => l.type === 'picture');
      if (allPics.length === 1) {
        defaults[t.uuid] = `A sablonon 1 db kép helyezkedik el. Szükséges képek száma: 1.`;
      } else {
        const bgPics = allPics.filter((l, idx) => isBackgroundLayer(l, idx));
        const contentPics = allPics.filter((l, idx) => !isBackgroundLayer(l, idx));
        defaults[t.uuid] = `A sablonon ${contentPics.length} db tartalomkép és ${bgPics.length > 0 ? '1' : '0'} db háttérkép helyezkedik el. Szükséges tartalomképek száma: ${contentPics.length}. Háttérkép van: ${bgPics.length > 0 ? 'Igen' : 'Nem'}.`;
      }
    });

    try {
      const stored = localStorage.getItem('zombo_template_requirements_v4');
      const parsed = stored ? JSON.parse(stored) : {};
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  });

  // State for parsed template requirements with auto-counted defaults (excluding background image unless only 1 image exists)
  const [parsedRequirements, setParsedRequirements] = useState<Record<string, Record<string, any>>>(() => {
    const defaults: Record<string, Record<string, any>> = {};
    PRESETS.forEach(t => {
      const allPics = (t.layers || []).filter(l => l.type === 'picture');
      if (allPics.length === 1) {
        defaults[t.uuid] = {
          images_count: 1,
          has_background: false
        };
      } else {
        const bgPics = allPics.filter((l, idx) => isBackgroundLayer(l, idx));
        const contentPics = allPics.filter((l, idx) => !isBackgroundLayer(l, idx));
        defaults[t.uuid] = { 
          images_count: contentPics.length,
          has_background: bgPics.length > 0 
        };
      }
    });

    try {
      const stored = localStorage.getItem('zombo_template_parsed_requirements_v4');
      const parsed = stored ? JSON.parse(stored) : {};
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  });

  const [isParsing, setIsParsing] = useState(false);

  // Get active template UUID from search parameters, default to first preset
  const selectedTemplateId = searchParams.get('template') || PRESETS[0]?.uuid || '';

  const setSelectedTemplateId = (uuid: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('template', uuid);
      return next;
    }, { replace: true });
  };

  const [layerValues, setLayerValues] = useState<Record<string, string>>({});
  const [imageMappings, setImageMappings] = useState<Record<string, 'base' | 'product' | 'none'>>({});
  
  const [isRendering, setIsRendering] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);

  // Search & Filter in Sidebar
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'pending' | 'reviewed'>('all');
  const [dynamicFilters, setDynamicFilters] = useState<Record<string, any>>({});

  const selectedTemplate = PRESETS.find(t => t.uuid === selectedTemplateId) || PRESETS[0];

  const activeRequirements = templateRequirements[selectedTemplateId] || '';
  const activeParsedJson = parsedRequirements[selectedTemplateId] || {};

  const handleRequirementsChange = (text: string) => {
    setTemplateRequirements(prev => ({
      ...prev,
      [selectedTemplateId]: text
    }));
  };

  const handleParseRequirements = async () => {
    if (!activeRequirements.trim()) {
      showToast({ title: 'Figyelmeztetés', message: 'Nincs beírt követelményszöveg!', type: 'info' });
      return;
    }
    setIsParsing(true);
    try {
      const response = await fetch(`${API}/api/image/parse-requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: activeRequirements })
      });
      if (!response.ok) throw new Error(`Helyi API hiba: ${response.status}`);
      const data = await response.json();
      if (data.parsed) {
        setParsedRequirements(prev => ({
          ...prev,
          [selectedTemplateId]: data.parsed
        }));
        showToast({ title: 'AI JSON elkészült', message: 'Sikeresen strukturáltuk a leírást!', type: 'success' });
      }
    } catch (err: any) {
      console.error(err);
      showToast({ title: 'Hiba történt', message: err.message, type: 'error' });
    } finally {
      setIsParsing(false);
    }
  };

  // Save reviewed status changes
  useEffect(() => {
    localStorage.setItem('zombo_reviewed_templates', JSON.stringify(Array.from(reviewedTemplates)));
  }, [reviewedTemplates]);

  useEffect(() => {
    localStorage.setItem('zombo_reviewed_layers', JSON.stringify(Array.from(reviewedLayers)));
  }, [reviewedLayers]);

  useEffect(() => {
    localStorage.setItem('zombo_template_requirements_v4', JSON.stringify(templateRequirements));
  }, [templateRequirements]);

  useEffect(() => {
    localStorage.setItem('zombo_template_parsed_requirements_v4', JSON.stringify(parsedRequirements));
  }, [parsedRequirements]);

  // Calculate product center from normalized position for background crop centering
  let productCenterX = 50;
  let productCenterY = 50;
  if (productPosition?.normalized) {
    const box = productPosition.normalized;
    productCenterX = Math.round((box.xmin + box.xmax) / 2);
    productCenterY = Math.round((box.ymin + box.ymax) / 2);
  }

  // Initialize values when template changes
  useEffect(() => {
    if (selectedTemplate) {
      const initialTexts: Record<string, string> = {};
      const initialImages: Record<string, 'base' | 'product' | 'none'> = {};
      const pictureLayers = selectedTemplate.layers.filter(l => l.type === 'picture');

      selectedTemplate.layers.forEach(layer => {
        if (layer.type === 'text') {
          initialTexts[layer.name] = layer.text || 'dummy text';
        }
      });
      setLayerValues(initialTexts);

      pictureLayers.forEach((layer, idx) => {
        const nameLower = layer.name.toLowerCase();
        if (isBackgroundLayer(layer, idx)) {
          initialImages[layer.name] = 'base';
        } else if (nameLower.includes('avatar') || nameLower.includes('profile') || nameLower.includes('logo') || nameLower.includes('user') || nameLower.includes('author')) {
          initialImages[layer.name] = 'none';
        } else if (nameLower.includes('product') || nameLower.includes('item') || nameLower.includes('cutout')) {
          initialImages[layer.name] = 'product';
        } else if (idx === 1 && productImageUrl) {
          initialImages[layer.name] = 'product';
        } else {
          initialImages[layer.name] = 'base';
        }
      });
      setImageMappings(initialImages);
      setRenderedUrl(null);
    }
  }, [selectedTemplateId]);

  // Toggle template status
  const toggleTemplateReviewed = (uuid: string) => {
    setReviewedTemplates(prev => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  };

  // Toggle layer status
  const toggleLayerReviewed = (layerName: string) => {
    const key = `${selectedTemplateId}::${layerName}`;
    setReviewedLayers(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Extract all unique parsed requirement keys for dynamic filtering
  const allParsed = Object.values(parsedRequirements) as Record<string, any>[];
  const uniqueFilterKeys = Array.from(new Set(allParsed.flatMap(p => Object.keys(p))));

  const getUniqueValuesForFilter = (key: string) => {
    const vals = new Set<any>();
    Object.values(parsedRequirements).forEach((p: any) => {
      if (p && p[key] !== undefined) {
        vals.add(p[key]);
      }
    });
    return ['Mind', ...Array.from(vals)].sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      return String(a).localeCompare(String(b));
    });
  };

  // Filter grouped presets
  const categories = ['All', ...Array.from(new Set(PRESETS.flatMap(t => t.tags || [])))].slice(0, 8);
  
  const filteredGroups = GROUPED_PRESETS.filter(g => {
    const matchesSearch = g.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          g.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat = selectedCategory === 'All' || g.tags.includes(selectedCategory);
    
    // Review filter
    const isAnyVariantReviewed = g.variants.some(v => reviewedTemplates.has(v.uuid));
    const matchesReview = reviewFilter === 'all' ||
                          (reviewFilter === 'reviewed' && isAnyVariantReviewed) ||
                          (reviewFilter === 'pending' && !isAnyVariantReviewed);

    // Dynamic AI filters
    let matchesDynamic = true;
    for (const [fKey, fVal] of Object.entries(dynamicFilters)) {
      const hasMatchingVariant = g.variants.some(v => {
        const parsed = parsedRequirements[v.uuid];
        return parsed && parsed[fKey] === fVal;
      });
      if (!hasMatchingVariant) {
        matchesDynamic = false;
        break;
      }
    }

    return matchesSearch && matchesCat && matchesReview && matchesDynamic;
  });

  // Construct compiled API payload for the schema inspector
  const compiledPayload = {
    width: selectedTemplate?.resolution?.width || 1200,
    height: selectedTemplate?.resolution?.height || 1200,
    requirements: activeRequirements,
    parsedRequirements: activeParsedJson,
    layers: selectedTemplate?.layers || [],
    layerValues: layerValues,
    baseImageUrl: baseImageUrl,
    productImageUrl: productImageUrl || undefined,
    imageMappings: imageMappings,
    productPosition: productPosition
  };

  const handleLocalRender = async () => {
    setIsRendering(true);
    setRenderedUrl(null);
    try {
      const response = await fetch(`${API}/api/image/placid-render-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(compiledPayload)
      });
      if (!response.ok) throw new Error(`Local Render failed: ${response.status}`);
      const data = await response.json();
      if (data.image_url) {
        setRenderedUrl(data.image_url);
        showToast({ title: 'Sikeres renderelés', message: 'A Playwright kép legenerálva!', type: 'success' });
      }
    } catch (err: any) {
      console.error(err);
      showToast({ title: 'Hiba történt', message: err.message, type: 'error' });
    } finally {
      setIsRendering(false);
    }
  };

  const displayUrl = renderedUrl ? (renderedUrl.startsWith('http') ? renderedUrl : `${API}${renderedUrl}`) : null;

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Outfit', 'Inter', sans-serif", overflow: 'hidden' }}>
      
      {/* LEFT NAVIGATION SIDEBAR (Dizájn lista) */}
      <div style={{ width: 300, display: 'flex', flexDirection: 'column', background: 'var(--bg2)', borderRight: '1px solid var(--border)', height: '100%', flexShrink: 0 }}>
        
        {/* Sidebar Header & Filters */}
        <div style={{ padding: '18px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
            📁 Sablonok ({GROUPED_PRESETS.length})
          </div>
          
          <input
            type="text"
            placeholder="Keresés..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 12, outline: 'none' }}
          />

          {/* Review Filter Bar */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
            {(['all', 'pending', 'reviewed'] as const).map(f => {
              const label = f === 'all' ? 'Összes' : f === 'pending' ? 'Vizsgálandó' : 'Kész';
              const count = f === 'all' 
                ? GROUPED_PRESETS.length 
                : f === 'pending' 
                  ? GROUPED_PRESETS.filter(g => !g.variants.some(v => reviewedTemplates.has(v.uuid))).length
                  : GROUPED_PRESETS.filter(g => g.variants.some(v => reviewedTemplates.has(v.uuid))).length;
              const isActive = reviewFilter === f;
              return (
                <button
                  key={f}
                  onClick={() => setReviewFilter(f)}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    borderRadius: 6,
                    border: 'none',
                    background: isActive ? 'var(--border)' : 'transparent',
                    color: isActive ? 'var(--text)' : 'var(--text-muted)',
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>

          {/* Dynamic AI Filters Section */}
          {uniqueFilterKeys.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(251,191,36,0.03)', border: '1px dashed rgba(251,191,36,0.2)', padding: 10, borderRadius: 8 }}>
              <div style={{ fontSize: 9.5, fontWeight: 900, textTransform: 'uppercase', color: '#fbbf24', letterSpacing: '0.05em' }}>
                🔍 Dinamikus Szűrők (AI)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {uniqueFilterKeys.map(key => {
                  const vals = getUniqueValuesForFilter(key);
                  const currentValue = dynamicFilters[key] ?? 'Mind';
                  return (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'capitalize', color: 'var(--text-dim)' }}>
                        {key.replace(/_/g, ' ')}:
                      </span>
                      <select
                        value={String(currentValue)}
                        onChange={e => {
                          const val = e.target.value;
                          setDynamicFilters(prev => {
                            const next = { ...prev };
                            if (val === 'Mind') {
                              delete next[key];
                            } else {
                              const num = Number(val);
                              next[key] = isNaN(num) || val === '' ? (val === 'true' ? true : val === 'false' ? false : val) : num;
                            }
                            return next;
                          });
                        }}
                        style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 10.5 }}
                      >
                        {vals.map(v => (
                          <option key={String(v)} value={String(v)}>{String(v)}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
            {categories.map(cat => {
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 14,
                    border: isActive ? '1.5px solid #fbbf24' : '1px solid var(--border)',
                    background: isActive ? 'rgba(251,191,36,0.12)' : 'var(--bg3)',
                    color: isActive ? '#fbbf24' : 'var(--text-muted)',
                    fontSize: 9.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Layout Items List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredGroups.map(group => {
            const isGroupSelected = group.variants.some(v => v.uuid === selectedTemplateId);
            const isReviewed = group.variants.some(v => reviewedTemplates.has(v.uuid));
            return (
              <div
                key={group.title}
                onClick={() => {
                  setSelectedTemplateId(group.variants[0].uuid);
                  setRenderedUrl(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: 8,
                  borderRadius: 10,
                  border: isGroupSelected 
                    ? '1.5px solid #fbbf24' 
                    : isReviewed 
                      ? '1px solid rgba(16,185,129,0.3)' 
                      : '1px solid var(--border)',
                  background: isGroupSelected 
                    ? 'rgba(251,191,36,0.06)' 
                    : isReviewed 
                      ? 'rgba(16,185,129,0.03)' 
                      : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => {
                  if (!isGroupSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                }}
                onMouseLeave={e => {
                  if (!isGroupSelected) e.currentTarget.style.background = isReviewed ? 'rgba(16,185,129,0.03)' : 'transparent';
                }}
              >
                {/* Status Checkbox on Left */}
                <input
                  type="checkbox"
                  checked={isReviewed}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleTemplateReviewed(group.variants[0].uuid);
                  }}
                  style={{
                    width: 14,
                    height: 14,
                    cursor: 'pointer',
                    accentColor: '#10b981'
                  }}
                />

                <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', background: '#000', border: '1px solid var(--border)', flexShrink: 0 }}>
                  <img src={group.thumbnail} alt={group.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: isGroupSelected ? '#fbbf24' : isReviewed ? '#10b981' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {group.title}
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'flex', gap: 6, marginTop: 1 }}>
                    <span>{group.variants.length} méret</span>
                    <span>•</span>
                    <span style={{ textTransform: 'capitalize' }}>{group.tags[0]}</span>
                  </div>
                </div>

                {isReviewed && (
                  <span style={{ fontSize: 11, color: '#10b981', fontWeight: 900 }}>✓</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '24px 30px' }}>
        
        {/* Header section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 16, flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: 'var(--text)' }}>
              Placid Layer Review Page (Rendszerszintű Sablon Szemle)
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Hasonlítsd össze az eredeti Placid sablont a saját képeddel feltöltött változattal egymás mellett!
            </div>
          </div>
          <button
            onClick={() => navigate('/marketing/zombo')}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>←</span> Zombo Főoldal
          </button>
        </div>

        {/* Double-column Configuration Section (Images on left, Requirements on right) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 20, flexShrink: 0 }}>
          
          {/* Left Column: LocalStorage Image Status Box */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', color: '#10b981', marginBottom: 8, letterSpacing: '0.05em' }}>
                🟢 Aktív Tesztképek (LocalStorage-ból)
              </div>
              <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong>Háttérkép:</strong> <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{baseImageUrl}</span>
                </div>
                {productImageUrl && (
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong>Körbevágott termék:</strong> <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{productImageUrl}</span>
                  </div>
                )}
                {productPosition && (
                  <div>
                    <strong>Termék pozíció:</strong> <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>xmin: {productPosition.normalized.xmin}%, xmax: {productPosition.normalized.xmax}%, ymin: {productPosition.normalized.ymin}%, ymax: {productPosition.normalized.ymax}%</span>
                  </div>
                )}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 4 }}>Háttér URL:</div>
                <input
                  type="text"
                  placeholder="Egyedi háttérkép URL..."
                  value={baseImageUrl}
                  onChange={e => setBaseImageUrl(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 11.5 }}
                />
              </div>
              {productImageUrl && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 4 }}>Termék URL:</div>
                  <input
                    type="text"
                    placeholder="Egyedi termékkép URL..."
                    value={productImageUrl}
                    onChange={e => setProductImageUrl(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 11.5 }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Template requirements (notes) card */}
          <div style={{ background: 'var(--bg2)', border: '1.5px solid #fbbf24', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', color: '#fbbf24', letterSpacing: '0.05em' }}>
                📋 Sablon Működési Követelmények (Requirements)
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={handleParseRequirements}
                  disabled={isParsing || !activeRequirements.trim()}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'linear-gradient(135deg, #fbbf24, #d97706)',
                    color: '#000',
                    fontSize: 10,
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {isParsing ? 'AI Feldolgozás...' : '🪄 JSON Generálása AI-val'}
                </button>
                <div style={{ fontSize: 9.5, color: '#10b981', fontWeight: 800 }}>✓ Automatikusan mentve</div>
              </div>
            </div>
            <textarea
              placeholder="Ide írd be a sablon egyedi követelményeit és működési szabályait... (pl. elvárt képek száma, elrendezés specifikáció)"
              value={activeRequirements}
              onChange={e => handleRequirementsChange(e.target.value)}
              style={{
                flex: 1,
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg3)',
                color: 'var(--text)',
                fontSize: 12,
                lineHeight: '1.5',
                resize: 'none',
                outline: 'none',
                fontFamily: 'inherit'
              }}
            />

            {/* Structured Categories Display */}
            {Object.keys(activeParsedJson).length > 0 && (
              <div style={{ marginTop: 6, background: '#090d16', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-dim)', marginBottom: 4 }}>
                  STRUKTURÁLT KATEGÓRIÁK (AI PARSED JSON):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(activeParsedJson).map(([k, v]) => (
                    <div 
                      key={k} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 4, 
                        background: 'rgba(251,191,36,0.06)', 
                        border: '1px solid rgba(251,191,36,0.3)', 
                        borderRadius: 6, 
                        padding: '3px 8px', 
                        fontSize: 10.5, 
                        color: '#fbbf24' 
                      }}
                    >
                      <strong style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}:</strong>
                      <span>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Resolution selector + render control bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>AKTÍV FELBONTÁS: </span>
              <strong style={{ fontSize: 12, color: 'var(--text)' }}>{selectedTemplate?.resolution?.width}x{selectedTemplate?.resolution?.height}px ({selectedTemplate?.title})</strong>
            </div>

            {/* Template reviewed checkbox status indicator */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', padding: '4px 10px', borderRadius: 20, color: '#10b981' }}>
              <input
                type="checkbox"
                checked={reviewedTemplates.has(selectedTemplateId)}
                onChange={() => toggleTemplateReviewed(selectedTemplateId)}
                style={{ cursor: 'pointer', accentColor: '#10b981' }}
              />
              Sablon jóváhagyva
            </label>
          </div>
          
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            {(() => {
              const currentGroup = GROUPED_PRESETS.find(g => g.variants.some(v => v.uuid === selectedTemplateId));
              if (!currentGroup || currentGroup.variants.length <= 1) return null;
              return (
                <div style={{ display: 'flex', gap: 4 }}>
                  {currentGroup.variants.map(v => {
                    const isSelected = selectedTemplateId === v.uuid;
                    return (
                      <button
                        key={v.uuid}
                        onClick={() => { setSelectedTemplateId(v.uuid); setRenderedUrl(null); }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: isSelected ? '1.5px solid #fbbf24' : '1px solid var(--border)',
                          background: isSelected ? 'rgba(251,191,36,0.1)' : 'var(--bg3)',
                          color: isSelected ? '#fbbf24' : 'var(--text-dim)',
                          fontSize: 9.5,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {v.resolution.width}x{v.resolution.height}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            <button
              onClick={handleLocalRender}
              disabled={isRendering}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #fbbf24, #d97706)',
                color: '#000',
                fontSize: 11.5,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(245,158,11,0.15)'
              }}
            >
              {isRendering ? 'Renderelés...' : 'Playwright Render'}
            </button>
          </div>
        </div>

        {/* HUGE SIDE-BY-SIDE VISUAL COMPARISON PANE IN CENTER */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24, flexShrink: 0 }}>
          
          {/* Left Column: Placid Original Design */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                🎨 Placid Eredeti Sablon Tervezet (Original Design)
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Méret: {selectedTemplate?.resolution?.width}x{selectedTemplate?.resolution?.height}px</span>
            </div>
            <div style={{
              borderRadius: 12,
              overflow: 'hidden',
              border: '2px solid var(--border)',
              background: '#090d16',
              position: 'relative',
              aspectRatio: selectedTemplate?.resolution ? `${selectedTemplate.resolution.width}/${selectedTemplate.resolution.height}` : '1/1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%'
            }}>
              {selectedTemplate?.thumbnail ? (
                <img src={selectedTemplate.thumbnail} alt="Placid Original" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nincs gyári minta</div>
              )}
            </div>
          </div>

          {/* Right Column: Live Composite Rendering */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                🖥️ Saját Képekkel Összeállított Előnézet (Live React Canvas)
              </span>
              <span style={{ fontSize: 10.5, color: '#fbbf24', fontWeight: 800 }}>Élő CSS/HTML Szimuláció</span>
            </div>
            <div style={{
              borderRadius: 12,
              overflow: 'hidden',
              border: '2px solid var(--border)',
              background: '#090d16',
              position: 'relative',
              aspectRatio: selectedTemplate?.resolution ? `${selectedTemplate.resolution.width}/${selectedTemplate.resolution.height}` : '1/1',
              width: '100%',
              containerType: 'inline-size'
            }}>
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                
                {/* Solid white canvas background */}
                <div style={{ position: 'absolute', inset: 0, backgroundColor: '#ffffff', zIndex: 0 }} />
                
                {/* Inject dynamic fonts */}
                <style dangerouslySetInnerHTML={{ __html: getGoogleFontsImport(selectedTemplate) }} />

                {/* Render layers in zIndex sorted order */}
                {selectedTemplate ? (
                  <>
                    {[...selectedTemplate.layers].sort((a, b) => (a.style.zIndex || 0) - (b.style.zIndex || 0)).map((layer: PlacidLayer) => {
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
                      }, selectedTemplate.resolution.width);

                      const style: React.CSSProperties = {
                        position: 'absolute', left, top, width: w, height: h,
                        boxSizing: 'border-box', pointerEvents: 'none',
                        ...scaledStyle
                      };

                      if (layer.type === 'text') {
                        const val = layerValues[layer.name] !== undefined ? layerValues[layer.name] : (layer.text || 'dummy text');
                        
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
                          imgSrc = productImageUrl;
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
                ) : null}

                {/* Spinner Overlay */}
                {isRendering && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', zIndex: 10 }}>
                    <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#fbbf24', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  </div>
                )}

              </div>
            </div>
          </div>

        </div>

        {/* LAYER INSPECTOR TABLE (FULL WIDTH!) */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 24, overflow: 'hidden', flexShrink: 0 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-dim)', marginTop: 0, marginBottom: 12 }}>
            🔍 Rétegek Részletes Adatsémája (Layer Inspector)
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px 10px', fontWeight: 800, width: '80px' }}>✓ Review</th>
                  <th style={{ padding: '8px 10px', fontWeight: 800 }}>Réteg név</th>
                  <th style={{ padding: '8px 10px', fontWeight: 800 }}>Típus</th>
                  <th style={{ padding: '8px 10px', fontWeight: 800 }}>Pozíció (xmin-xmax, ymin-ymax)</th>
                  <th style={{ padding: '8px 10px', fontWeight: 800 }}>Z-Index</th>
                  <th style={{ padding: '8px 10px', fontWeight: 800, width: '40%' }}>Aktív érték / Leképezés</th>
                </tr>
              </thead>
              <tbody>
                {selectedTemplate?.layers?.map((layer: PlacidLayer, idx: number) => {
                  const typeColor = layer.type === 'text' ? '#3b82f6' : layer.type === 'picture' ? '#10b981' : '#8b5cf6';
                  const layerKey = `${selectedTemplateId}::${layer.name}`;
                  const isLayerReviewed = reviewedLayers.has(layerKey);
                  const isBg = isBackgroundLayer(layer, idx);
                  
                  return (
                    <tr 
                      key={layer.name} 
                      style={{ 
                        borderBottom: '1px solid rgba(255,255,255,0.04)', 
                        verticalAlign: 'middle',
                        background: isLayerReviewed 
                          ? 'rgba(16,185,129,0.04)' 
                          : isBg 
                            ? 'rgba(59,130,246,0.02)' 
                            : 'transparent',
                        transition: 'background 0.2s'
                      }}
                    >
                      {/* Layer status checkbox */}
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isLayerReviewed}
                          onChange={() => toggleLayerReviewed(layer.name)}
                          style={{ cursor: 'pointer', accentColor: '#10b981', width: 13, height: 13 }}
                        />
                      </td>
                      <td style={{ padding: '10px', fontWeight: 700, color: isLayerReviewed ? '#10b981' : 'var(--text)' }}>
                        {layer.name} {isBg && <span style={{ fontSize: 9, fontWeight: 900, color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '1px 5px', borderRadius: 4, marginLeft: 6 }}>háttér</span>}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ fontSize: 9, fontWeight: 900, background: typeColor, color: '#fff', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
                          {layer.type}
                        </span>
                      </td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                        {layer.position.xmin}% - {layer.position.xmax}% , {layer.position.ymin}% - {layer.position.ymax}%
                      </td>
                      <td style={{ padding: '10px', fontWeight: 700 }}>{layer.style.zIndex || 0}</td>
                      <td style={{ padding: '10px' }}>
                        {layer.type === 'text' && (
                          <input
                            type="text"
                            value={layerValues[layer.name] || ''}
                            onChange={e => setLayerValues(prev => ({ ...prev, [layer.name]: e.target.value }))}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }}
                          />
                        )}
                        {layer.type === 'picture' && (
                          <select
                            value={imageMappings[layer.name] || 'base'}
                            onChange={e => setImageMappings(prev => ({ ...prev, [layer.name]: e.target.value as any }))}
                            style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11.5, fontWeight: 600 }}
                          >
                            <option value="base">Háttérkép (AI generált)</option>
                            <option value="product">Termékkép (Körbevágott)</option>
                            <option value="none">Üres / Átlátszó</option>
                          </select>
                        )}
                        {layer.type === 'shape' && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            Háttér: {layer.style.backgroundColor || 'Nincs'}, Lekerekítés: {layer.style.borderRadius || '0px'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* JSON SCHEMA & PLAYWRIGHT OUTPUT (BOTTOM ROW: SIDE-BY-SIDE) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24, alignItems: 'start', flexShrink: 0 }}>
          
          {/* Playwright rendered image preview */}
          {displayUrl ? (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
                📸 Playwright Engine Output (JPEG)
              </div>
              <div style={{ border: '2px solid #10b981', borderRadius: 14, overflow: 'hidden', position: 'relative', background: '#000', aspectRatio: selectedTemplate?.resolution ? `${selectedTemplate.resolution.width}/${selectedTemplate.resolution.height}` : '1/1', marginBottom: 12 }}>
                <img src={displayUrl} alt="Playwright render output" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              </div>
              <a
                href={displayUrl}
                download={`placid-review-${selectedTemplate.title}-${Date.now()}.jpg`}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px',
                  borderRadius: 9,
                  background: '#10b981',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'center',
                  textDecoration: 'none'
                }}
              >
                Rendszer JPEG Letöltése
              </a>
            </div>
          ) : (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📸</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)' }}>Nincs aktív Playwright renderelő kimenet</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4, maxWidth: 260 }}>
                Kattints a fenti "Playwright Render" gombra a JPEG kép generálásához.
              </div>
            </div>
          )}

          {/* JSON Schema Inspector */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-dim)', margin: 0 }}>
                💻 API JSON Payload (Rendszerszintű Mezők)
              </h3>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(compiledPayload, null, 2));
                  showToast({ title: 'JSON másolva', message: 'A vágólapra mentve!', type: 'success' });
                }}
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Copy JSON
              </button>
            </div>
            <pre style={{ margin: 0, padding: 14, background: '#090d16', border: '1px solid var(--border)', borderRadius: 10, color: '#fbbf24', fontSize: 10.5, overflowX: 'auto', maxHeight: 240, overflowY: 'auto', fontFamily: 'Consolas, Monaco, monospace' }}>
              {JSON.stringify(compiledPayload, null, 2)}
            </pre>
          </div>

        </div>

      </div>

    </div>
  );
}
