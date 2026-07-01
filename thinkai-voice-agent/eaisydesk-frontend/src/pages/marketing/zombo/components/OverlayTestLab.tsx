import React, { useState, useEffect } from 'react';
import { type BrandKit, fixImageUrl, getBackendUrl } from '../types';
import { 
  Layers, Play, Cpu, Brain, Layers3, ChevronDown, ChevronUp, Copy, Check, 
  Settings, X, Save, Plus, Trash, Upload, Sliders, Type, Image as ImageIcon, 
  Square, RefreshCw, AlertTriangle, Eye 
} from 'lucide-react';

interface OverlayTestLabProps {
  activeBrandKit: BrandKit;
}

export const OverlayTestLab: React.FC<OverlayTestLabProps> = ({ activeBrandKit }) => {
  const [briefText, setBriefText] = useState('Új tavaszi jeges latte és sós karamellás croissant akció a héten.');
  const [contentType, setContentType] = useState('uj_termek');
  const [format, setFormat] = useState<'feed' | 'story'>('feed');
  const [variantCount, setVariantCount] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [logs, setLogs] = useState<string[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [expandedJsonIdx, setExpandedJsonIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Visual Builder states
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingLayout, setEditingLayout] = useState<any | null>(null);
  const [selectedChildIdx, setSelectedChildIdx] = useState<number | null>(null);
  const [isUpdatingRender, setIsUpdatingRender] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'layers' | 'settings' | 'raw_json'>('layers');
  const [imageTab, setImageTab] = useState<'url' | 'upload'>('url');
  
  // Raw JSON state
  const [rawJsonText, setRawJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSuccessMsg, setJsonSuccessMsg] = useState<boolean>(false);

  const contentTypes = [
    { value: 'uj_termek', label: 'Új termék / menüpont' },
    { value: 'akcio', label: 'Akció / kedvezmény' },
    { value: 'szezonalis', label: 'Szezonális ajánlat' },
    { value: 'nyitvatartas', label: 'Nyitvatartás' },
    { value: 'bejelentes', label: 'Általános bejelentés' },
    { value: 'ugyfelvelemeny', label: 'Ügyfélvélemény' },
    { value: 'before_after', label: 'Before / after' },
    { value: 'het_xe', label: 'Hét X-e' },
    { value: 'idezet', label: 'Idézet / motiváció' },
    { value: 'tipp', label: 'Tipp / "tudtad?"' },
    { value: 'esemeny', label: 'Esemény' },
  ];

  const steps = [
    { title: 'Orchestration', desc: 'Claude 3.5 Sonnet plans layout geometry, fills slots and selects style archetypes.', icon: Brain },
    { title: 'Asset Resolution', desc: 'Preprocesses backgrounds (Flux generation or stock mapping) and applies brand duotone filter.', icon: Cpu },
    { title: 'Headless Rendering', desc: 'Launches Playwright headless browser to render PolotnoJSON and screenshots layout.', icon: Layers3 },
  ];

  // Load fonts when editing layout changes
  useEffect(() => {
    if (!editingLayout) return;
    const fontsToLoad = new Set<string>();
    const page = editingLayout.pages?.[0] || editingLayout;
    const children = page.children || [];
    children.forEach((c: any) => {
      if (c.type === 'text' && c.fontFamily) {
        fontsToLoad.add(c.fontFamily);
      }
    });
    
    // Add default fonts just in case
    fontsToLoad.add('Inter');
    fontsToLoad.add('Outfit');
    fontsToLoad.add('Montserrat');
    fontsToLoad.add('Playfair Display');
    fontsToLoad.add('Caveat');

    fontsToLoad.forEach(fontName => {
      const id = `gfont-${fontName.replace(/ /g, '-')}`;
      if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@300;400;500;600;700;800&display=swap`;
        document.head.appendChild(link);
      }
    });
  }, [editingLayout]);

  const handleGenerate = async () => {
    if (!briefText.trim()) return;

    setIsGenerating(true);
    setCurrentStep(0);
    setVariants([]);
    setExpandedJsonIdx(null);
    
    const timestamp = new Date().toLocaleTimeString('hu-HU');
    setLogs([`[${timestamp}] [INFO] Indítás: Overlay-generálási pipeline elindítva.`]);

    try {
      setLogs(prev => [...prev, `[${timestamp}] [AI] Claude megtervezi a layout variánsokat (${variantCount} db brief alapján)...`]);
      
      const response = await fetch(`${getBackendUrl()}/api/overlay/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: briefText,
          contentType,
          brandKit: activeBrandKit,
          format,
          variantCount
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setCurrentStep(1);
      const data = await response.json();
      
      const t2 = new Date().toLocaleTimeString('hu-HU');
      setLogs(prev => [
        ...prev,
        `[${t2}] [SUCCESS] Claude sikeresen megtervezte az archetípusokat: ${data.map((v: any) => v.archetype).join(', ')}.`,
        `[${t2}] [INFO] Képi források feloldása és SVG duotone szűrők kiszámolása...`
      ]);

      setCurrentStep(2);
      const t3 = new Date().toLocaleTimeString('hu-HU');
      setLogs(prev => [
        ...prev,
        `[${t3}] [RENDER] Playwright elindítva, PolotnoJSON adatok kirajzolása és képernyőfotó mentése folyamatban...`
      ]);

      setVariants(data);
      setCurrentStep(-1);
      setIsGenerating(false);
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString('hu-HU')}] [SUCCESS] Mind a(z) ${data.length} overlay variáns sikeresen legenerálva és lementve.`]);
    } catch (err: any) {
      console.error(err);
      const tErr = new Date().toLocaleTimeString('hu-HU');
      setLogs(prev => [...prev, `[${tErr}] [Hiba] Hiba történt a generálás során: ${err.message || err}`]);
      setCurrentStep(-1);
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  // Helper functions for layout editing
  const getChildren = (layout: any): any[] => {
    if (!layout) return [];
    if (layout.pages && layout.pages[0]) {
      return layout.pages[0].children || [];
    }
    return layout.children || [];
  };

  const updateChildren = (layout: any, updater: (children: any[]) => any[]) => {
    const next = { ...layout };
    if (next.pages && next.pages[0]) {
      next.pages = [
        {
          ...next.pages[0],
          children: updater(next.pages[0].children || [])
        }
      ];
    } else {
      next.children = updater(next.children || []);
    }
    return next;
  };

  const startEditing = (idx: number) => {
    setEditingIdx(idx);
    const layoutCopy = JSON.parse(JSON.stringify(variants[idx].layoutJson));
    setEditingLayout(layoutCopy);
    setRawJsonText(JSON.stringify(layoutCopy, null, 2));
    setJsonError(null);
    setJsonSuccessMsg(false);
    setSelectedChildIdx(null);
    setSidebarTab('layers');
  };

  const updateSelectedChild = (updater: (child: any) => any) => {
    if (selectedChildIdx === null) return;
    setEditingLayout((prev: any) => {
      const next = updateChildren(prev, (children) => 
        children.map((c, idx) => {
          if (idx === selectedChildIdx) {
            return updater(c);
          }
          return c;
        })
      );
      // Keep raw JSON in sync with changes from graphical UI
      setRawJsonText(JSON.stringify(next, null, 2));
      return next;
    });
  };

  const handleApplyRawJson = () => {
    try {
      const parsed = JSON.parse(rawJsonText);
      setEditingLayout(parsed);
      setJsonError(null);
      setJsonSuccessMsg(true);
      setTimeout(() => setJsonSuccessMsg(false), 3000);
    } catch (err: any) {
      setJsonError('Érvénytelen JSON formátum: ' + err.message);
    }
  };

  // Helper to parse border: e.g. "2px solid #ffffff"
  const parseBorder = (borderStr: string | undefined) => {
    let width = 0;
    let style = 'solid';
    let color = '#ffffff';
    if (borderStr && borderStr !== 'none') {
      const parts = borderStr.split(' ');
      if (parts[0]) width = parseInt(parts[0]) || 0;
      if (parts[1]) style = parts[1];
      if (parts[2]) color = parts[2];
    }
    return { width, style, color };
  };

  // Helper to parse text shadow: e.g. "1px 1px 3px #000000"
  const parseTextShadow = (shadowStr: string | undefined) => {
    let enabled = !!shadowStr && shadowStr !== 'none';
    let offsetX = 1;
    let offsetY = 1;
    let blur = 3;
    let color = '#000000';
    if (shadowStr && shadowStr !== 'none') {
      const parts = shadowStr.split(' ');
      if (parts[0]) offsetX = parseInt(parts[0]) || 0;
      if (parts[1]) offsetY = parseInt(parts[1]) || 0;
      if (parts[2]) blur = parseInt(parts[2]) || 0;
      if (parts[3]) color = parts[3];
    }
    return { enabled, offsetX, offsetY, blur, color };
  };

  const addTextLayer = () => {
    setEditingLayout((prev: any) => {
      const next = updateChildren(prev, (children) => [
        ...children,
        {
          type: 'text',
          text: 'Új szöveg réteg',
          x: 100,
          y: 100,
          width: 600,
          fontSize: 40,
          fontFamily: 'Inter',
          fontWeight: 'normal',
          align: 'left',
          fill: '#ffffff',
          opacity: 1
        }
      ]);
      setRawJsonText(JSON.stringify(next, null, 2));
      return next;
    });
    setTimeout(() => {
      const current = getChildren(editingLayout);
      setSelectedChildIdx(current.length);
    }, 50);
  };

  const addImageLayer = () => {
    setEditingLayout((prev: any) => {
      const next = updateChildren(prev, (children) => [
        ...children,
        {
          type: 'image',
          src: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff',
          x: 150,
          y: 150,
          width: 400,
          height: 400,
          opacity: 1,
          filter: 'none'
        }
      ]);
      setRawJsonText(JSON.stringify(next, null, 2));
      return next;
    });
    setTimeout(() => {
      const current = getChildren(editingLayout);
      setSelectedChildIdx(current.length);
    }, 50);
  };

  const addFigureLayer = () => {
    setEditingLayout((prev: any) => {
      const next = updateChildren(prev, (children) => [
        ...children,
        {
          type: 'figure',
          subType: 'rect',
          x: 200,
          y: 200,
          width: 300,
          height: 150,
          fill: '#8b5cf6',
          opacity: 0.8,
          cornerRadius: 8
        }
      ]);
      setRawJsonText(JSON.stringify(next, null, 2));
      return next;
    });
    setTimeout(() => {
      const current = getChildren(editingLayout);
      setSelectedChildIdx(current.length);
    }, 50);
  };

  const deleteLayer = (idx: number) => {
    setEditingLayout((prev: any) => {
      const next = updateChildren(prev, (children) => 
        children.filter((_, i) => i !== idx)
      );
      setRawJsonText(JSON.stringify(next, null, 2));
      return next;
    });
    setSelectedChildIdx(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, childIdx: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = reader.result as string;
        
        const response = await fetch(`${getBackendUrl()}/api/image/preprocess`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Data })
        });
        
        if (!response.ok) {
          throw new Error(await response.text());
        }
        
        const data = await response.json();
        const uploadedUrl = data.url;

        setEditingLayout((prev: any) => {
          const next = updateChildren(prev, (children) => 
            children.map((c, idx) => {
              if (idx === childIdx) {
                return { ...c, src: uploadedUrl };
              }
              return c;
            })
          );
          setRawJsonText(JSON.stringify(next, null, 2));
          return next;
        });
        setIsUploadingImage(false);
      };
      reader.onerror = (error) => {
        throw error;
      };
    } catch (err: any) {
      alert('Kép feltöltés sikertelen: ' + (err.message || err));
      setIsUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (editingIdx === null || !editingLayout) return;
    setIsUpdatingRender(true);
    try {
      const response = await fetch(`${getBackendUrl()}/api/render-polotno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layoutJson: editingLayout })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      
      setVariants(prev => prev.map((v, i) => {
        if (i === editingIdx) {
          return {
            ...v,
            imageUrl: data.imageUrl,
            layoutJson: editingLayout
          };
        }
        return v;
      }));
      
      setEditingIdx(null);
      setEditingLayout(null);
      setSelectedChildIdx(null);
    } catch (err: any) {
      alert('Hiba történt a mentés és renderelés során: ' + (err.message || err));
    } finally {
      setIsUpdatingRender(false);
    }
  };

  // Helper to generate duotone SVG filter matrix values
  const createDuotoneFilterSvgMatrix = (lightHex: string, darkHex: string) => {
    const hexToRgb = (hex: string) => {
      const cleanHex = hex.replace('#', '');
      const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
      const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
      const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
      return { r, g, b };
    };

    const light = hexToRgb(lightHex);
    const dark = hexToRgb(darkHex);
    
    const rWeight = 0.2126;
    const gWeight = 0.7152;
    const bWeight = 0.0722;
    
    const rDelta = (light.r - dark.r) / 255;
    const gDelta = (light.g - dark.g) / 255;
    const bDelta = (light.b - dark.b) / 255;
    
    const rOffset = dark.r / 255;
    const gOffset = dark.g / 255;
    const bOffset = dark.b / 255;
    
    const matrixValues = [
      rDelta * rWeight, rDelta * gWeight, rDelta * bWeight, 0, rOffset,
      gDelta * rWeight, gDelta * gWeight, gDelta * bWeight, 0, gOffset,
      bDelta * rWeight, bDelta * gWeight, bDelta * bWeight, 0, bOffset,
      0, 0, 0, 1, 0
    ].join(' ');

    return <feColorMatrix type="matrix" values={matrixValues} />;
  };

  const renderInteractiveCanvas = () => {
    if (!editingLayout) return null;
    const width = editingLayout.width || 1080;
    const height = editingLayout.height || 1350;
    
    const maxPreviewW = 500;
    const maxPreviewH = 650;
    const scale = Math.min(maxPreviewW / width, maxPreviewH / height);
    
    const page = editingLayout.pages?.[0] || editingLayout;
    const children = page.children || [];
    const bg = page.background || '#000000';
    
    return (
      <div 
        className="interactive-canvas" 
        style={{
          width: `${width}px`,
          height: `${height}px`,
          backgroundColor: bg,
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        {/* SVG Duotone Filters */}
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            {children.map((child: any, idx: number) => {
              if (child.type === 'image' && child.filter === 'duotone' && child.duotoneColors) {
                return (
                  <filter id={`duotone-filter-preview-${idx}`} key={idx}>
                    {createDuotoneFilterSvgMatrix(child.duotoneColors[0], child.duotoneColors[1])}
                  </filter>
                );
              }
              return null;
            })}
          </defs>
        </svg>

        {/* Premium Outer Border */}
        {editingLayout.premiumBorder && editingLayout.premiumBorder !== 'none' && (
          <div className={editingLayout.premiumBorder === 'dark' ? 'inner-border-dark' : 'inner-border'} />
        )}

        {/* Child Elements */}
        {children.map((child: any, idx: number) => {
          const isSelected = selectedChildIdx === idx;
          const style: React.CSSProperties = {
            position: 'absolute',
            left: `${child.x}px`,
            top: `${child.y}px`,
            width: `${child.width}px`,
            height: child.height ? `${child.height}px` : 'auto',
            opacity: child.opacity !== undefined ? child.opacity : 1,
            cursor: 'pointer',
            userSelect: 'none',
            display: 'block',
            boxSizing: 'border-box',
            outline: isSelected ? '3px dashed #8b5cf6' : 'none',
            outlineOffset: isSelected ? '4px' : 'none',
            zIndex: isSelected ? 100 : idx + 1
          };

          if (child.premiumShadow) {
            style.boxShadow = '0 20px 45px rgba(0, 0, 0, 0.42), 0 5px 15px rgba(0, 0, 0, 0.28)';
          } else if (child.premiumShadowSoft) {
            style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.14)';
          }

          const onClickElement = (e: React.MouseEvent) => {
            e.stopPropagation();
            setSelectedChildIdx(idx);
          };

          if (child.type === 'text') {
            const textStyle: React.CSSProperties = {
              ...style,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              wordWrap: 'break-word',
              whiteSpace: 'pre-wrap',
              fontFamily: child.fontFamily || 'Inter',
              fontSize: `${child.fontSize}px`,
              lineHeight: child.lineHeight || 1.2,
              fontWeight: child.fontWeight || 'normal',
              textAlign: child.align || 'left',
              color: child.fill || '#ffffff',
              textShadow: child.textShadow || 'none'
            };

            if (child.fontSize >= 72) {
              textStyle.letterSpacing = '-0.035em';
            } else if (child.fontSize >= 36) {
              textStyle.letterSpacing = '-0.02em';
            } else if (child.fontSize <= 24) {
              textStyle.letterSpacing = '0.04em';
              textStyle.textTransform = 'uppercase';
            }

            return (
              <div key={idx} style={textStyle} onClick={onClickElement}>
                {child.text === '◆' ? (
                  <span className="diamond-sep" style={{ backgroundColor: child.fill || '#ffffff', alignSelf: child.align === 'center' ? 'center' : 'flex-start' }} />
                ) : (
                  child.text
                )}
              </div>
            );
          }

          if (child.type === 'image') {
            if (child.filter === 'duotone' && child.duotoneColors) {
              return (
                <div key={idx} style={style} onClick={onClickElement}>
                  <img src={child.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }} />
                  <img 
                    src={child.src} 
                    alt="" 
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'cover', 
                      position: 'absolute', 
                      top: 0, 
                      left: 0, 
                      opacity: 0.85,
                      filter: `url(#duotone-filter-preview-${idx})`
                    }} 
                  />
                </div>
              );
            }

            return (
              <img 
                key={idx} 
                src={child.src} 
                alt="" 
                style={{ ...style, objectFit: 'cover' }} 
                onClick={onClickElement} 
              />
            );
          }

          if (child.type === 'figure') {
            const figStyle: React.CSSProperties = {
              ...style,
              background: child.fill || '#000000',
              borderRadius: child.subType === 'circle' ? '50%' : (child.cornerRadius ? `${child.cornerRadius}px` : '0px'),
              border: child.border || 'none'
            };

            return (
              <div key={idx} style={figStyle} onClick={onClickElement} />
            );
          }

          return null;
        })}
      </div>
    );
  };

  const renderSidebarControls = () => {
    if (!editingLayout) return null;
    const page = editingLayout.pages?.[0] || editingLayout;
    const children = page.children || [];
    const selectedChild = selectedChildIdx !== null ? children[selectedChildIdx] : null;

    const layoutWidth = editingLayout.width || 1080;
    const layoutHeight = editingLayout.height || 1350;

    return (
      <div className="sidebar-inner">
        {/* Navigation Tabs */}
        <div className="sidebar-tabs">
          <button 
            className={`sidebar-tab-btn ${sidebarTab === 'layers' ? 'active' : ''}`}
            onClick={() => setSidebarTab('layers')}
          >
            <Sliders size={14} /> Rétegek
          </button>
          <button 
            className={`sidebar-tab-btn ${sidebarTab === 'settings' ? 'active' : ''}`}
            onClick={() => setSidebarTab('settings')}
          >
            <Settings size={14} /> Háttér
          </button>
          <button 
            className={`sidebar-tab-btn ${sidebarTab === 'raw_json' ? 'active' : ''}`}
            onClick={() => setSidebarTab('raw_json')}
          >
            <Copy size={14} /> Teljes JSON
          </button>
        </div>

        {sidebarTab === 'settings' && (
          <div className="tab-pane animate-fade-in">
            <h4 className="pane-title">Háttér és Keret Beállítások</h4>
            <div className="form-group">
              <label>Kreatív Formátum méret:</label>
              <div className="info-badge">
                {layoutWidth} × {layoutHeight} px ({layoutWidth === 1080 && layoutHeight === 1350 ? 'Instagram Feed' : 'Instagram Story'})
              </div>
            </div>

            <div className="form-group">
              <label>Háttér Kitöltő Szín:</label>
              <div className="color-picker-row">
                <input 
                  type="color" 
                  value={page.background || '#000000'} 
                  onChange={(e) => {
                    const color = e.target.value;
                    setEditingLayout((prev: any) => {
                      const next = { ...prev };
                      if (next.pages && next.pages[0]) {
                        next.pages = [{ ...next.pages[0], background: color }];
                      } else {
                        next.background = color;
                      }
                      setRawJsonText(JSON.stringify(next, null, 2));
                      return next;
                    });
                  }}
                />
                <input 
                  type="text" 
                  value={page.background || '#000000'}
                  onChange={(e) => {
                    const color = e.target.value;
                    setEditingLayout((prev: any) => {
                      const next = { ...prev };
                      if (next.pages && next.pages[0]) {
                        next.pages = [{ ...next.pages[0], background: color }];
                      } else {
                        next.background = color;
                      }
                      setRawJsonText(JSON.stringify(next, null, 2));
                      return next;
                    });
                  }}
                  className="color-hex-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Prémium Külső Keret:</label>
              <select 
                value={editingLayout.premiumBorder || 'none'}
                onChange={(e) => {
                  const borderVal = e.target.value;
                  setEditingLayout((prev: any) => {
                    const next = {
                      ...prev,
                      premiumBorder: borderVal
                    };
                    setRawJsonText(JSON.stringify(next, null, 2));
                    return next;
                  });
                }}
              >
                <option value="none">Nincs keret</option>
                <option value="light">Világos vékony keret</option>
                <option value="dark">Sötét vékony keret</option>
              </select>
            </div>
          </div>
        )}

        {sidebarTab === 'raw_json' && (
          <div className="tab-pane animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h4 className="pane-title">Teljes PolotnoJSON Szerkesztése</h4>
            <p className="pane-description" style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              Módosítsd közvetlenül az elrendezés teljes kódstruktúráját. Kattints az <strong>Alkalmazás a Vásznon</strong> gombra a változtatások kirajzolásához.
            </p>
            
            <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
              <textarea
                value={rawJsonText}
                onChange={(e) => setRawJsonText(e.target.value)}
                className="raw-json-textarea"
                style={{ 
                  flex: 1, 
                  fontFamily: 'monospace', 
                  fontSize: '11px', 
                  background: '#040306', 
                  border: '1px solid var(--panel-border)', 
                  borderRadius: '6px', 
                  color: '#a78bfa',
                  padding: '12px',
                  resize: 'none',
                  minHeight: '280px'
                }}
              />
            </div>

            {jsonError && (
              <div className="json-error-alert animate-fade-in" style={{ color: '#ef4444', fontSize: '11px', background: 'rgba(239,68,68,0.08)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.2)' }}>
                ⚠️ {jsonError}
              </div>
            )}

            {jsonSuccessMsg && (
              <div className="json-success-alert animate-fade-in" style={{ color: '#10b981', fontSize: '11px', background: 'rgba(16,185,129,0.08)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.2)' }}>
                ✓ JSON sikeresen alkalmazva a vásznon!
              </div>
            )}

            <button 
              className="btn-primary" 
              onClick={handleApplyRawJson}
              style={{ width: '100%', padding: '10px' }}
            >
              JSON Alkalmazása a Vásznon
            </button>
          </div>
        )}

        {sidebarTab === 'layers' && (
          <div className="tab-pane animate-fade-in">
            {/* Layer Creator row */}
            <div className="layer-creator-box">
              <span className="creator-label">Új réteg hozzáadása:</span>
              <div className="creator-buttons">
                <button className="btn-add-layer" onClick={addTextLayer}>
                  <Type size={12} /> Szöveg
                </button>
                <button className="btn-add-layer" onClick={addImageLayer}>
                  <ImageIcon size={12} /> Kép
                </button>
                <button className="btn-add-layer" onClick={addFigureLayer}>
                  <Square size={12} /> Alakzat
                </button>
              </div>
            </div>

            {/* List of layers */}
            <div className="layers-list-container">
              <h5 className="sub-pane-title">Aktív Rétegek ({children.length} db)</h5>
              <div className="layer-items-grid">
                {children.map((child: any, idx: number) => {
                  const isSelected = selectedChildIdx === idx;
                  const Icon = child.type === 'text' ? Type : child.type === 'image' ? ImageIcon : Square;
                  return (
                    <div 
                      key={idx} 
                      className={`layer-item-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedChildIdx(idx)}
                    >
                      <Icon size={14} className="layer-icon" />
                      <span className="layer-title">
                        {child.type === 'text' 
                          ? (child.text.length > 20 ? child.text.substring(0, 20) + '...' : child.text) 
                          : child.type === 'image' ? 'Kép réteg' : `Alakzat (${child.subType || 'rect'})`}
                      </span>
                      <button 
                        className="btn-layer-delete" 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteLayer(idx);
                        }}
                        title="Réteg törlése"
                      >
                        <Trash size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected child properties */}
            {selectedChildIdx !== null && selectedChild ? (
              <div className="properties-panel-editor animate-fade-in">
                <div className="property-editor-header">
                  <span className="editor-badge">
                    {selectedChild.type === 'text' ? 'Szöveg' : selectedChild.type === 'image' ? 'Kép' : 'Alakzat'} tulajdonságok
                  </span>
                  <button className="btn-delete-active" onClick={() => deleteLayer(selectedChildIdx)}>
                    Törlés <Trash size={12} />
                  </button>
                </div>

                {/* Common positioning fields */}
                <div className="property-section">
                  <h6 className="section-title">Elhelyezkedés & Átlátszóság (Határok között)</h6>
                  
                  <div className="property-slider-row">
                    <span className="slider-label">X Pozíció (0 - {layoutWidth}): {selectedChild.x}px</span>
                    <input 
                      type="range"
                      min={0}
                      max={layoutWidth}
                      value={selectedChild.x}
                      onChange={(e) => updateSelectedChild(c => ({ ...c, x: Number(e.target.value) }))}
                    />
                  </div>

                  <div className="property-slider-row">
                    <span className="slider-label">Y Pozíció (0 - {layoutHeight}): {selectedChild.y}px</span>
                    <input 
                      type="range"
                      min={0}
                      max={layoutHeight}
                      value={selectedChild.y}
                      onChange={(e) => updateSelectedChild(c => ({ ...c, y: Number(e.target.value) }))}
                    />
                  </div>

                  <div className="property-slider-row">
                    <span className="slider-label">Szélesség (10 - {layoutWidth}): {selectedChild.width}px</span>
                    <input 
                      type="range"
                      min={10}
                      max={layoutWidth}
                      value={selectedChild.width}
                      onChange={(e) => updateSelectedChild(c => ({ ...c, width: Number(e.target.value) }))}
                    />
                  </div>

                  {selectedChild.type !== 'text' && (
                    <div className="property-slider-row">
                      <span className="slider-label">Magasság (10 - {layoutHeight}): {selectedChild.height || 10}px</span>
                      <input 
                        type="range"
                        min={10}
                        max={layoutHeight}
                        value={selectedChild.height || 10}
                        onChange={(e) => updateSelectedChild(c => ({ ...c, height: Number(e.target.value) }))}
                      />
                    </div>
                  )}

                  <div className="property-slider-row">
                    <span className="slider-label">Átlátszóság (Opacity): {Math.round((selectedChild.opacity !== undefined ? selectedChild.opacity : 1) * 100)}%</span>
                    <input 
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={selectedChild.opacity !== undefined ? selectedChild.opacity : 1}
                      onChange={(e) => updateSelectedChild(c => ({ ...c, opacity: Number(e.target.value) }))}
                    />
                  </div>
                </div>

                {/* Specific controls: Text */}
                {selectedChild.type === 'text' && (
                  <div className="property-section">
                    <h6 className="section-title">Szöveg formázás</h6>
                    
                    <div className="form-group">
                      <label>Szabad szavas szöveg tartalom:</label>
                      <textarea
                        value={selectedChild.text}
                        onChange={(e) => updateSelectedChild(c => ({ ...c, text: e.target.value }))}
                        rows={3}
                        className="text-edit-area"
                      />
                    </div>

                    <div className="form-group">
                      <label>Betűtípus:</label>
                      <select 
                        value={selectedChild.fontFamily || 'Inter'}
                        onChange={(e) => updateSelectedChild(c => ({ ...c, fontFamily: e.target.value }))}
                      >
                        <option value="Inter">Inter (Márka alapértelmezett)</option>
                        <option value="Outfit">Outfit</option>
                        <option value="Montserrat">Montserrat</option>
                        <option value="Playfair Display">Playfair Display (Serif)</option>
                        <option value="Caveat">Caveat (Kézírásos)</option>
                        <option value="Cinzel">Cinzel</option>
                        <option value="Roboto">Roboto</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Arial">Arial</option>
                      </select>
                    </div>

                    <div className="property-slider-row">
                      <span className="slider-label">Betűméret (10 - 150): {selectedChild.fontSize}px</span>
                      <input 
                        type="range"
                        min={10}
                        max={150}
                        value={selectedChild.fontSize}
                        onChange={(e) => updateSelectedChild(c => ({ ...c, fontSize: Number(e.target.value) }))}
                      />
                    </div>

                    <div className="property-slider-row">
                      <span className="slider-label">Sor magasság (0.8 - 2.5): {selectedChild.lineHeight || 1.2}</span>
                      <input 
                        type="range"
                        min={0.8}
                        max={2.5}
                        step={0.1}
                        value={selectedChild.lineHeight || 1.2}
                        onChange={(e) => updateSelectedChild(c => ({ ...c, lineHeight: Number(e.target.value) }))}
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Vastagság:</label>
                        <select 
                          value={selectedChild.fontWeight || 'normal'}
                          onChange={(e) => updateSelectedChild(c => ({ ...c, fontWeight: e.target.value }))}
                        >
                          <option value="300">Vékony (300)</option>
                          <option value="normal">Normál (400)</option>
                          <option value="600">Félkövér (600)</option>
                          <option value="bold">Kövér (700)</option>
                          <option value="800">Extra Kövér (800)</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Igazítás:</label>
                        <div className="align-buttons-group">
                          {['left', 'center', 'right'].map((alignOpt) => (
                            <button
                              key={alignOpt}
                              className={`btn-align ${selectedChild.align === alignOpt ? 'active' : ''}`}
                              onClick={() => updateSelectedChild(c => ({ ...c, align: alignOpt }))}
                            >
                              {alignOpt === 'left' ? 'Bal' : alignOpt === 'center' ? 'Közép' : 'Jobb'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Szöveg Színe:</label>
                      <div className="color-picker-row">
                        <input 
                          type="color" 
                          value={selectedChild.fill || '#ffffff'} 
                          onChange={(e) => updateSelectedChild(c => ({ ...c, fill: e.target.value }))}
                        />
                        <input 
                          type="text" 
                          value={selectedChild.fill || '#ffffff'}
                          onChange={(e) => updateSelectedChild(c => ({ ...c, fill: e.target.value }))}
                          className="color-hex-input"
                        />
                      </div>
                    </div>

                    {/* Text Shadow Editor (Non-free text controls) */}
                    <div className="property-sub-section">
                      <span className="sub-section-title">Szöveg árnyékolása</span>
                      {(() => {
                        const shadow = parseTextShadow(selectedChild.textShadow);
                        return (
                          <div className="sub-section-content">
                            <label className="checkbox-label">
                              <input 
                                type="checkbox"
                                checked={shadow.enabled}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  updateSelectedChild(c => ({
                                    ...c,
                                    textShadow: checked ? '2px 2px 4px #000000' : 'none'
                                  }));
                                }}
                              />
                              Árnyék engedélyezése
                            </label>

                            {shadow.enabled && (
                              <div className="shadow-sub-controls animate-fade-in">
                                <div className="property-slider-row">
                                  <span className="slider-label">X Eltolás (-20 - 20): {shadow.offsetX}px</span>
                                  <input 
                                    type="range"
                                    min={-20}
                                    max={20}
                                    value={shadow.offsetX}
                                    onChange={(e) => {
                                      const newX = Number(e.target.value);
                                      updateSelectedChild(c => ({
                                        ...c,
                                        textShadow: `${newX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}`
                                      }));
                                    }}
                                  />
                                </div>

                                <div className="property-slider-row">
                                  <span className="slider-label">Y Eltolás (-20 - 20): {shadow.offsetY}px</span>
                                  <input 
                                    type="range"
                                    min={-20}
                                    max={20}
                                    value={shadow.offsetY}
                                    onChange={(e) => {
                                      const newY = Number(e.target.value);
                                      updateSelectedChild(c => ({
                                        ...c,
                                        textShadow: `${shadow.offsetX}px ${newY}px ${shadow.blur}px ${shadow.color}`
                                      }));
                                    }}
                                  />
                                </div>

                                <div className="property-slider-row">
                                  <span className="slider-label">Homályosítás (0 - 30): {shadow.blur}px</span>
                                  <input 
                                    type="range"
                                    min={0}
                                    max={30}
                                    value={shadow.blur}
                                    onChange={(e) => {
                                      const newB = Number(e.target.value);
                                      updateSelectedChild(c => ({
                                        ...c,
                                        textShadow: `${shadow.offsetX}px ${shadow.offsetY}px ${newB}px ${shadow.color}`
                                      }));
                                    }}
                                  />
                                </div>

                                <div className="form-group">
                                  <label>Árnyék színe:</label>
                                  <div className="color-picker-row">
                                    <input 
                                      type="color" 
                                      value={shadow.color.startsWith('#') ? shadow.color : '#000000'} 
                                      onChange={(e) => {
                                        const newCol = e.target.value;
                                        updateSelectedChild(c => ({
                                          ...c,
                                          textShadow: `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${newCol}`
                                        }));
                                      }}
                                    />
                                    <input 
                                      type="text" 
                                      value={shadow.color}
                                      onChange={(e) => {
                                        const newCol = e.target.value;
                                        updateSelectedChild(c => ({
                                          ...c,
                                          textShadow: `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${newCol}`
                                        }));
                                      }}
                                      className="color-hex-input"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Specific controls: Image */}
                {selectedChild.type === 'image' && (
                  <div className="property-section">
                    <h6 className="section-title">Kép Beállítások</h6>
                    
                    {/* Upload vs URL Tabs */}
                    <div className="image-tabs-group">
                      <button 
                        className={`img-tab-btn ${imageTab === 'upload' ? 'active' : ''}`}
                        onClick={() => setImageTab('upload')}
                      >
                        <Upload size={12} /> Fájl Feltöltése
                      </button>
                      <button 
                        className={`img-tab-btn ${imageTab === 'url' ? 'active' : ''}`}
                        onClick={() => setImageTab('url')}
                      >
                        <Copy size={12} /> Kép Link (URL)
                      </button>
                    </div>

                    {imageTab === 'upload' ? (
                      <div className="upload-box animate-fade-in">
                        <label className="upload-area-label">
                          <input 
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleImageUpload(e, selectedChildIdx)}
                            disabled={isUploadingImage}
                          />
                          {isUploadingImage ? (
                            <>
                              <RefreshCw size={18} className="spin" />
                              Feltöltés folyamatban...
                            </>
                          ) : (
                            <>
                              <Upload size={18} /> Kattints kép kiválasztásához
                            </>
                          )}
                        </label>
                      </div>
                    ) : (
                      <div className="form-group animate-fade-in">
                        <label>Kép URL linkje:</label>
                        <input 
                          type="text"
                          value={selectedChild.src}
                          onChange={(e) => updateSelectedChild(c => ({ ...c, src: e.target.value }))}
                          placeholder="https://..."
                        />
                      </div>
                    )}

                    <div className="form-group">
                      <label>Kép Szűrő:</label>
                      <select 
                        value={selectedChild.filter || 'none'}
                        onChange={(e) => updateSelectedChild(c => ({ ...c, filter: e.target.value }))}
                      >
                        <option value="none">Nincs szűrő (Eredeti színek)</option>
                        <option value="duotone">Duotone (Márka tónus)</option>
                      </select>
                    </div>

                    {selectedChild.filter === 'duotone' && (
                      <div className="duotone-colors-box animate-fade-in">
                        <div className="form-group">
                          <label>Világos Tónus szín:</label>
                          <div className="color-picker-row">
                            <input 
                              type="color" 
                              value={selectedChild.duotoneColors?.[0] || '#ffffff'}
                              onChange={(e) => {
                                const col = e.target.value;
                                updateSelectedChild(c => {
                                  const colors = [...(c.duotoneColors || ['#ffffff', '#000000'])];
                                  colors[0] = col;
                                  return { ...c, duotoneColors: colors };
                                });
                              }}
                            />
                            <input 
                              type="text" 
                              value={selectedChild.duotoneColors?.[0] || '#ffffff'}
                              onChange={(e) => {
                                const col = e.target.value;
                                updateSelectedChild(c => {
                                  const colors = [...(c.duotoneColors || ['#ffffff', '#000000'])];
                                  colors[0] = col;
                                  return { ...c, duotoneColors: colors };
                                });
                              }}
                              className="color-hex-input"
                            />
                          </div>
                        </div>

                        <div className="form-group">
                          <label>Sötét Tónus szín:</label>
                          <div className="color-picker-row">
                            <input 
                              type="color" 
                              value={selectedChild.duotoneColors?.[1] || '#000000'}
                              onChange={(e) => {
                                const col = e.target.value;
                                updateSelectedChild(c => {
                                  const colors = [...(c.duotoneColors || ['#ffffff', '#000000'])];
                                  colors[1] = col;
                                  return { ...c, duotoneColors: colors };
                                });
                              }}
                            />
                            <input 
                              type="text" 
                              value={selectedChild.duotoneColors?.[1] || '#000000'}
                              onChange={(e) => {
                                const col = e.target.value;
                                updateSelectedChild(c => {
                                  const colors = [...(c.duotoneColors || ['#ffffff', '#000000'])];
                                  colors[1] = col;
                                  return { ...c, duotoneColors: colors };
                                });
                              }}
                              className="color-hex-input"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Specific controls: Figure */}
                {selectedChild.type === 'figure' && (
                  <div className="property-section">
                    <h6 className="section-title">Alakzat tulajdonságok</h6>
                    
                    <div className="form-group">
                      <label>Alakzat típusa:</label>
                      <select 
                        value={selectedChild.subType || 'rect'}
                        onChange={(e) => updateSelectedChild(c => ({ ...c, subType: e.target.value }))}
                      >
                        <option value="rect">Téglalap (Rectangle)</option>
                        <option value="circle">Kör (Circle)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Kitöltő Szín:</label>
                      <div className="color-picker-row">
                        <input 
                          type="color" 
                          value={selectedChild.fill || '#000000'} 
                          onChange={(e) => updateSelectedChild(c => ({ ...c, fill: e.target.value }))}
                        />
                        <input 
                          type="text" 
                          value={selectedChild.fill || '#000000'}
                          onChange={(e) => updateSelectedChild(c => ({ ...c, fill: e.target.value }))}
                          className="color-hex-input"
                        />
                      </div>
                    </div>

                    {selectedChild.subType !== 'circle' && (
                      <div className="property-slider-row">
                        <span className="slider-label">Lekerekítés (Corner Radius): {selectedChild.cornerRadius || 0}px</span>
                        <input 
                          type="range"
                          min={0}
                          max={100}
                          value={selectedChild.cornerRadius || 0}
                          onChange={(e) => updateSelectedChild(c => ({ ...c, cornerRadius: Number(e.target.value) }))}
                        />
                      </div>
                    )}

                    {/* Figure Border Editor (Non-free text controls) */}
                    <div className="property-sub-section">
                      <span className="sub-section-title">Alakzat Keret Beállítása</span>
                      {(() => {
                        const border = parseBorder(selectedChild.border);
                        const isBorderEnabled = !!selectedChild.border && selectedChild.border !== 'none';
                        return (
                          <div className="sub-section-content">
                            <label className="checkbox-label">
                              <input 
                                type="checkbox"
                                checked={isBorderEnabled}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  updateSelectedChild(c => ({
                                    ...c,
                                    border: checked ? '2px solid #ffffff' : 'none'
                                  }));
                                }}
                              />
                              Keret engedélyezése
                            </label>

                            {isBorderEnabled && (
                              <div className="shadow-sub-controls animate-fade-in">
                                <div className="property-slider-row">
                                  <span className="slider-label">Keret Vastagság (1 - 20): {border.width}px</span>
                                  <input 
                                    type="range"
                                    min={1}
                                    max={20}
                                    value={border.width}
                                    onChange={(e) => {
                                      const newW = Number(e.target.value);
                                      updateSelectedChild(c => ({
                                        ...c,
                                        border: `${newW}px ${border.style} ${border.color}`
                                      }));
                                    }}
                                  />
                                </div>

                                <div className="form-group">
                                  <label>Keret stílusa:</label>
                                  <select 
                                    value={border.style}
                                    onChange={(e) => {
                                      const newStyle = e.target.value;
                                      updateSelectedChild(c => ({
                                        ...c,
                                        border: `${border.width}px ${newStyle} ${border.color}`
                                      }));
                                    }}
                                  >
                                    <option value="solid">Folytonos (solid)</option>
                                    <option value="dashed">Szaggatott (dashed)</option>
                                    <option value="dotted">Pontozott (dotted)</option>
                                    <option value="double">Dupla (double)</option>
                                  </select>
                                </div>

                                <div className="form-group">
                                  <label>Keret színe:</label>
                                  <div className="color-picker-row">
                                    <input 
                                      type="color" 
                                      value={border.color.startsWith('#') ? border.color : '#ffffff'} 
                                      onChange={(e) => {
                                        const newCol = e.target.value;
                                        updateSelectedChild(c => ({
                                          ...c,
                                          border: `${border.width}px ${border.style} ${newCol}`
                                        }));
                                      }}
                                    />
                                    <input 
                                      type="text" 
                                      value={border.color}
                                      onChange={(e) => {
                                        const newCol = e.target.value;
                                        updateSelectedChild(c => ({
                                          ...c,
                                          border: `${border.width}px ${border.style} ${newCol}`
                                        }));
                                      }}
                                      className="color-hex-input"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Common Shadows Toggles */}
                <div className="property-section">
                  <h6 className="section-title">Prémium Árnyékok (Effektek)</h6>
                  <label className="checkbox-label">
                    <input 
                      type="checkbox"
                      checked={!!selectedChild.premiumShadow}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        updateSelectedChild(c => {
                          const { premiumShadow, premiumShadowSoft, ...rest } = c;
                          if (checked) {
                            return { ...rest, premiumShadow: true };
                          }
                          return rest;
                        });
                      }}
                    />
                    Erős 3D Vetett Árnyék
                  </label>
                  <label className="checkbox-label">
                    <input 
                      type="checkbox"
                      checked={!!selectedChild.premiumShadowSoft}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        updateSelectedChild(c => {
                          const { premiumShadow, premiumShadowSoft, ...rest } = c;
                          if (checked) {
                            return { ...rest, premiumShadowSoft: true };
                          }
                          return rest;
                        });
                      }}
                    />
                    Finom Lágy Árnyék
                  </label>
                </div>
              </div>
            ) : (
              <div className="empty-properties-state">
                <AlertTriangle size={24} className="warning-icon" />
                <p>Nincs kijelölt réteg.</p>
                <p className="sub-p">Válassz ki egy elemet a fenti listából vagy kattints rá közvetlenül a bal oldali vásznon a szerkesztéshez.</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="overlay-lab-container animate-fade-in">
      <div className="lab-header glass-panel">
        <Layers size={24} className="glow-purple-icon" />
        <div>
          <h2>Overlay Kreatív Labor</h2>
          <p className="subtitle">Determinisztikus layout-sínek és AI-vezérelt tartalom-összeállítás</p>
        </div>
      </div>

      <div className="lab-grid">
        {/* Left Side Settings Form */}
        <div className="settings-panel glass-panel">
          <div className="form-group">
            <label>Brief (Téma / Cél):</label>
            <textarea
              value={briefText}
              onChange={(e) => setBriefText(e.target.value)}
              disabled={isGenerating}
              placeholder="Írd le mi legyen a kreatívon..."
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Tartalom Típusa:</label>
              <select 
                value={contentType} 
                onChange={(e) => setContentType(e.target.value)}
                disabled={isGenerating}
              >
                {contentTypes.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Formátum:</label>
              <select 
                value={format} 
                onChange={(e) => setFormat(e.target.value as 'feed' | 'story')}
                disabled={isGenerating}
              >
                <option value="feed">Feed (1080×1350)</option>
                <option value="story">Story (1080×1920)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Variánsok száma: {variantCount}</label>
            <input
              type="range"
              min={1}
              max={4}
              value={variantCount}
              onChange={(e) => setVariantCount(Number(e.target.value))}
              disabled={isGenerating}
              className="range-input"
            />
          </div>

          <button
            className="btn-primary generate-btn"
            onClick={handleGenerate}
            disabled={isGenerating || !briefText.trim()}
          >
            {isGenerating ? (
              <>
                <div className="loader-circle" />
                Overlay Generálás fut...
              </>
            ) : (
              <>
                <Play size={16} />
                Overlay Variánsok Generálása
              </>
            )}
          </button>

          {isGenerating && (
            <div className="progress-section">
              <h5>Pipeline Állapot:</h5>
              <div className="pipeline-steps">
                {steps.map((step, idx) => {
                  const Icon = step.icon;
                  let state = 'pending';
                  if (idx < currentStep) state = 'completed';
                  else if (idx === currentStep) state = 'active';

                  return (
                    <div key={idx} className={`step-row ${state}`}>
                      <div className="step-badge">
                        <Icon size={16} />
                      </div>
                      <div className="step-info">
                        <h6>{step.title}</h6>
                        <p>{step.desc}</p>
                      </div>
                      {state === 'completed' && <span className="check">✓</span>}
                      {state === 'active' && <div className="pulse" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {logs.length > 0 && (
            <div className="console-panel">
              <h6>Háttér Logok (Logs):</h6>
              <div className="log-lines">
                {logs.map((log, idx) => (
                  <div key={idx} className={`log-line ${log.includes('[Hiba]') ? 'error' : log.includes('[SUCCESS]') ? 'success' : ''}`}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Side Render Results */}
        <div className="results-panel">
          {variants.length === 0 ? (
            <div className="empty-results glass-panel">
              <Layers size={36} className="empty-icon" />
              <h4>Nincsenek generált overlay variánsok</h4>
              <p>Állítsd be a briefet a bal oldalon, majd kattints a Generálás gombra.</p>
            </div>
          ) : (
            <div className="variants-list">
              {variants.map((v, idx) => (
                <div key={idx} className="variant-card glass-panel">
                  <div className="variant-header">
                    <span className="badge-archetype">{v.archetype} Blueprint</span>
                    <span className="badge-emphasis">Accent: {v.accentEmphasis}</span>
                  </div>
                  
                  <div className="variant-body-layout">
                    {/* Rendered PNG preview */}
                    <div className="image-preview-box">
                      <img src={fixImageUrl(v.imageUrl)} alt={`Variant ${v.archetype}`} className="rendered-img" />
                      <a href={fixImageUrl(v.imageUrl)} download={`overlay-${v.archetype}.png`} className="btn-download">
                        Kép Letöltése
                      </a>
                      <button 
                        className="btn-edit-builder btn-primary"
                        onClick={() => startEditing(idx)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', marginTop: '6px' }}
                      >
                        <Settings size={14} /> Szerkesztés Visual Builderrel
                      </button>
                    </div>

                    {/* Metadata & Slots */}
                    <div className="metadata-box">
                      <div className="meta-item">
                        <strong>Kreatív Indoklás:</strong>
                        <p>{v.rationale}</p>
                      </div>

                      <div className="meta-item">
                        <strong>Képi Direktíva:</strong>
                        <p>Mode: <code>{v.imageConfig.mode}</code> | Source: <code>{v.imageConfig.source}</code></p>
                        <p className="query-text">Keresőszó/Prompt: <em>"{v.imageConfig.queryOrPrompt || 'none'}"</em></p>
                      </div>

                      <div className="meta-item">
                        <strong>Tartalmi Slostok (Copy):</strong>
                        <div className="slots-grid">
                          {Object.entries(v.slots).map(([key, val]: any) => (
                            <div key={key} className="slot-row">
                              <span className="slot-key">{key}:</span>
                              <span className="slot-value">{Array.isArray(val) ? val.join(', ') : val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Layout JSON Accordion */}
                  <div className="json-accordion">
                    <button 
                      className="accordion-trigger"
                      onClick={() => setExpandedJsonIdx(expandedJsonIdx === idx ? null : idx)}
                    >
                      <span>PolotnoJSON Struktúra megtekintése</span>
                      {expandedJsonIdx === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    
                    {expandedJsonIdx === idx && (
                      <div className="accordion-content">
                        <div className="code-header">
                          <span>polotno_layout.json</span>
                          <button 
                            className="btn-copy"
                            onClick={() => copyToClipboard(JSON.stringify(v.layoutJson, null, 2), idx)}
                          >
                            {copiedIdx === idx ? <Check size={14} /> : <Copy size={14} />}
                            {copiedIdx === idx ? 'Másolva' : 'Másolás'}
                          </button>
                        </div>
                        <pre className="code-block">
                          {JSON.stringify(v.layoutJson, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Visual Builder Overlay Modal */}
      {editingIdx !== null && editingLayout && (
        <div className="visual-builder-overlay animate-fade-in">
          <div className="builder-header glass-panel">
            <div className="header-left">
              <Settings size={20} className="glow-purple-icon" />
              <div>
                <h3>Visual Template Builder</h3>
                <p className="subtitle">Szerkesztés: {variants[editingIdx].archetype} Blueprint (Variáns #{editingIdx + 1})</p>
              </div>
            </div>
            <div className="header-actions">
              <button 
                className="btn-cancel" 
                onClick={() => { setEditingIdx(null); setEditingLayout(null); setSelectedChildIdx(null); }} 
                disabled={isUpdatingRender}
              >
                <X size={16} /> Mégse
              </button>
              <button 
                className="btn-save btn-primary" 
                onClick={handleSave} 
                disabled={isUpdatingRender}
              >
                {isUpdatingRender ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    Renderelés...
                  </>
                ) : (
                  <>
                    <Save size={16} /> Mentés és Frissítés
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="builder-content-grid">
            {/* Workspace Canvas (Left) */}
            <div className="builder-workspace" onClick={() => setSelectedChildIdx(null)}>
              <div className="canvas-wrapper">
                {renderInteractiveCanvas()}
              </div>
            </div>

            {/* Sidebar Controls (Right) */}
            <div className="builder-sidebar glass-panel">
              {renderSidebarControls()}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .overlay-lab-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .lab-header {
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .lab-header h2 {
          font-size: 18px;
          font-weight: 700;
        }
        .lab-header .subtitle {
          font-size: 12px;
          color: var(--text-muted);
        }
        .glow-purple-icon {
          color: var(--primary-neon);
          filter: drop-shadow(0 0 4px rgba(139, 92, 246, 0.5));
        }

        .lab-grid {
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 1024px) {
          .lab-grid {
            grid-template-columns: 1fr;
          }
        }

        .settings-panel {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted);
        }
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .range-input {
          accent-color: var(--primary-neon);
        }
        .generate-btn {
          padding: 12px;
          font-weight: 600;
        }

        /* Progress Steps */
        .progress-section {
          background: rgba(0,0,0,0.15);
          padding: 12px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.03);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .progress-section h5 {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
        }
        .pipeline-steps {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .step-row {
          display: flex;
          align-items: center;
          gap: 10px;
          opacity: 0.4;
          transition: var(--transition-smooth);
        }
        .step-row.completed {
          opacity: 0.9;
        }
        .step-row.active {
          opacity: 1;
          background: rgba(139,92,246,0.05);
          padding: 4px;
          border-radius: 6px;
        }
        .step-badge {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
        }
        .step-row.active .step-badge {
          background: var(--primary-neon);
          color: #fff;
        }
        .step-row.completed .step-badge {
          background: rgba(16,185,129,0.15);
          color: #10b981;
        }
        .step-info h6 {
          font-size: 11px;
          font-weight: 600;
        }
        .step-info p {
          font-size: 9px;
          color: var(--text-muted);
        }
        .step-row .check {
          margin-left: auto;
          color: #10b981;
          font-weight: bold;
          font-size: 12px;
        }
        .step-row .pulse {
          margin-left: auto;
          width: 6px;
          height: 6px;
          background: var(--primary-neon);
          border-radius: 50%;
          animation: pulse 1s infinite alternate;
        }

        /* Console */
        .console-panel {
          background: #050308;
          border: 1px solid var(--panel-border);
          border-radius: 8px;
          padding: 10px;
          font-family: monospace;
          font-size: 10px;
          height: 120px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .console-panel h6 {
          color: var(--primary-neon);
          font-weight: 700;
        }
        .log-lines {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .log-line {
          color: var(--text-muted);
        }
        .log-line.success {
          color: #10b981;
        }
        .log-line.error {
          color: #ef4444;
        }

        /* Right Results */
        .results-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .empty-results {
          padding: 60px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: var(--text-muted);
          gap: 12px;
        }
        .empty-icon {
          opacity: 0.3;
        }
        .variants-list {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .variant-card {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .variant-header {
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          padding-bottom: 10px;
        }
        .badge-archetype {
          background: rgba(139,92,246,0.15);
          border: 1px solid rgba(139,92,246,0.25);
          color: var(--text-main);
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 20px;
        }
        .badge-emphasis {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 600;
        }
        .variant-body-layout {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 20px;
        }
        @media (max-width: 600px) {
          .variant-body-layout {
            grid-template-columns: 1fr;
          }
        }
        .image-preview-box {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .rendered-img {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--panel-border);
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          background: #000;
        }
        .btn-download {
          display: block;
          text-align: center;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--panel-border);
          color: var(--text-main);
          padding: 8px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
          transition: var(--transition-smooth);
        }
        .btn-download:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.15);
        }

        .metadata-box {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .meta-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .meta-item strong {
          font-size: 12px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .meta-item p {
          font-size: 13px;
          line-height: 1.4;
        }
        .meta-item code {
          background: rgba(255,255,255,0.06);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
        }
        .query-text {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .slots-grid {
          background: rgba(0,0,0,0.2);
          border: 1px solid rgba(255,255,255,0.03);
          padding: 10px;
          border-radius: 6px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .slot-row {
          display: flex;
          gap: 8px;
          font-size: 12px;
        }
        .slot-key {
          color: var(--text-muted);
          font-weight: 600;
          min-width: 90px;
        }
        .slot-value {
          color: var(--text-main);
        }

        /* JSON Accordion */
        .json-accordion {
          border-top: 1px solid rgba(255,255,255,0.05);
          padding-top: 10px;
        }
        .accordion-trigger {
          background: transparent;
          border: none;
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: var(--text-muted);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          padding: 6px 0;
          transition: var(--transition-smooth);
        }
        .accordion-trigger:hover {
          color: var(--text-main);
        }
        .accordion-content {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .code-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10px;
          color: var(--text-muted);
          font-family: monospace;
          background: rgba(255,255,255,0.02);
          padding: 4px 8px;
          border-radius: 4px 4px 0 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .btn-copy {
          background: transparent;
          border: none;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          cursor: pointer;
        }
        .btn-copy:hover {
          color: var(--text-main);
        }
        .code-block {
          background: #050308;
          border: 1px solid var(--panel-border);
          border-radius: 0 0 6px 6px;
          padding: 12px;
          font-family: monospace;
          font-size: 11px;
          max-height: 250px;
          overflow-y: auto;
          color: #a78bfa;
          white-space: pre-wrap;
        }

        /* ════════════════════════════════ Visual Builder Styles ════════════════════════════════ */
        .visual-builder-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1000;
          background: #08060f;
          background-image: radial-gradient(circle at 50% 0%, #150f28 0%, #06040a 80%);
          display: flex;
          flex-direction: column;
          color: var(--text-main);
          font-family: var(--font-ui);
        }
        
        .builder-header {
          height: 70px;
          min-height: 70px;
          border-radius: 0;
          border-left: none;
          border-right: none;
          border-top: none;
          padding: 0 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(15, 11, 30, 0.7);
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .header-left h3 {
          font-size: 16px;
          font-weight: 700;
          margin: 0;
        }
        .header-actions {
          display: flex;
          gap: 12px;
        }
        .btn-cancel, .btn-save, .btn-add-layer, .btn-delete-active, .sidebar-tab-btn, .img-tab-btn, .btn-align {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .btn-cancel {
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--panel-border);
          color: var(--text-main);
        }
        .btn-cancel:hover {
          background: rgba(255,255,255,0.1);
        }
        
        .builder-content-grid {
          display: grid;
          grid-template-columns: 1fr 380px;
          flex: 1;
          height: calc(100vh - 70px);
          overflow: hidden;
        }
        
        /* Workspace */
        .builder-workspace {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #040306;
          padding: 20px;
          overflow: auto;
          position: relative;
        }
        .canvas-wrapper {
          position: relative;
        }

        /* Sidebar */
        .builder-sidebar {
          border-radius: 0;
          border-top: none;
          border-right: none;
          border-bottom: none;
          background: rgba(14, 11, 28, 0.85);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          width: 380px;
          min-width: 380px;
        }
        .sidebar-inner {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding: 20px;
          flex: 1;
        }
        .sidebar-tabs {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 6px;
          background: rgba(0,0,0,0.2);
          padding: 4px;
          border-radius: 8px;
        }
        .sidebar-tab-btn {
          background: transparent;
          border: none;
          padding: 8px;
          color: var(--text-muted);
        }
        .sidebar-tab-btn.active {
          background: var(--primary-neon);
          color: #fff;
        }
        
        .tab-pane {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .pane-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-main);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          padding-bottom: 6px;
        }
        .sub-pane-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin-bottom: 8px;
        }

        .info-badge {
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--panel-border);
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-family: monospace;
          color: var(--primary-neon);
        }
        
        /* Color Picker Row */
        .color-picker-row {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .color-picker-row input[type="color"] {
          border: 1px solid var(--panel-border);
          width: 38px;
          height: 38px;
          border-radius: 6px;
          cursor: pointer;
          background: transparent;
          padding: 0;
        }
        .color-hex-input {
          flex: 1;
          height: 38px;
          font-family: monospace;
        }

        /* Layer Creator */
        .layer-creator-box {
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: rgba(0,0,0,0.15);
          border: 1px solid var(--panel-border);
          padding: 12px;
          border-radius: 8px;
        }
        .creator-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
        }
        .creator-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 6px;
        }
        .btn-add-layer {
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.2);
          color: var(--text-main);
          padding: 6px;
          font-size: 11px;
        }
        .btn-add-layer:hover {
          background: var(--primary-neon);
          color: #fff;
        }

        /* Active Layers List */
        .layers-list-container {
          background: rgba(0,0,0,0.1);
          border: 1px solid var(--panel-border);
          border-radius: 8px;
          padding: 10px;
          max-height: 200px;
          overflow-y: auto;
        }
        .layer-items-grid {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .layer-item-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
          border: 1px solid transparent;
          transition: var(--transition-smooth);
        }
        .layer-item-row:hover {
          background: rgba(255,255,255,0.03);
        }
        .layer-item-row.selected {
          background: rgba(139, 92, 246, 0.15);
          border-color: rgba(139, 92, 246, 0.3);
        }
        .layer-icon {
          color: var(--text-muted);
        }
        .layer-item-row.selected .layer-icon {
          color: var(--primary-neon);
        }
        .layer-title {
          font-size: 11px;
          font-weight: 500;
          flex: 1;
        }
        .btn-layer-delete {
          background: transparent;
          border: none;
          color: var(--text-muted);
          padding: 4px;
          cursor: pointer;
          border-radius: 4px;
        }
        .btn-layer-delete:hover {
          color: var(--accent-rose);
          background: rgba(239, 68, 68, 0.1);
        }

        /* Properties Editor */
        .properties-panel-editor {
          display: flex;
          flex-direction: column;
          gap: 16px;
          border-top: 1px solid rgba(255,255,255,0.05);
          padding-top: 16px;
        }
        .property-editor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .editor-badge {
          background: rgba(139, 92, 246, 0.15);
          border: 1px solid rgba(139, 92, 246, 0.3);
          color: var(--text-main);
          font-size: 10px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 4px;
          text-transform: uppercase;
        }
        .btn-delete-active {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: var(--accent-rose);
          padding: 4px 8px;
          font-size: 10px;
        }
        .btn-delete-active:hover {
          background: var(--accent-rose);
          color: #fff;
        }

        .property-section {
          background: rgba(255,255,255,0.01);
          border: 1px solid rgba(255,255,255,0.02);
          padding: 12px;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .section-title {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          padding-bottom: 4px;
        }
        .property-slider-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .slider-label {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: 500;
        }
        .property-slider-row input[type="range"] {
          accent-color: var(--primary-neon);
          height: 6px;
        }

        .text-edit-area {
          background: rgba(0,0,0,0.2);
          border: 1px solid var(--panel-border);
          border-radius: 6px;
          color: #fff;
          font-family: inherit;
          padding: 8px;
          font-size: 12px;
          resize: vertical;
        }
        .text-edit-area:focus {
          border-color: var(--primary-neon);
          outline: none;
        }

        .align-buttons-group {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 4px;
          background: rgba(0,0,0,0.15);
          padding: 3px;
          border-radius: 6px;
          border: 1px solid var(--panel-border);
        }
        .btn-align {
          background: transparent;
          border: none;
          padding: 5px;
          color: var(--text-muted);
          font-size: 10px;
        }
        .btn-align.active {
          background: rgba(255,255,255,0.08);
          color: #fff;
        }

        /* Image source tabs */
        .image-tabs-group {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          background: rgba(0,0,0,0.1);
          padding: 3px;
          border-radius: 6px;
          border: 1px solid var(--panel-border);
          margin-bottom: 6px;
        }
        .img-tab-btn {
          background: transparent;
          border: none;
          padding: 6px;
          font-size: 10px;
          color: var(--text-muted);
        }
        .img-tab-btn.active {
          background: rgba(139, 92, 246, 0.15);
          color: var(--text-main);
          border: 1px solid rgba(139, 92, 246, 0.3);
        }

        .upload-box {
          border: 1px dashed var(--panel-border);
          border-radius: 6px;
          padding: 12px;
          text-align: center;
          background: rgba(255,255,255,0.01);
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .upload-box:hover {
          background: rgba(139, 92, 246, 0.05);
          border-color: var(--primary-neon);
        }
        .upload-area-label {
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: var(--text-muted);
        }
        .upload-area-label input {
          display: none;
        }

        .duotone-colors-box {
          background: rgba(0,0,0,0.15);
          padding: 10px;
          border-radius: 6px;
          border: 1px solid var(--panel-border);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        /* Figures specific sub-sections */
        .property-sub-section {
          background: rgba(0,0,0,0.15);
          border: 1px solid var(--panel-border);
          padding: 10px;
          border-radius: 8px;
          margin-top: 6px;
        }
        .sub-section-title {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: block;
          margin-bottom: 8px;
        }
        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--text-main);
          cursor: pointer;
          user-select: none;
        }
        .checkbox-label input[type="checkbox"] {
          accent-color: var(--primary-neon);
          cursor: pointer;
        }
        .shadow-sub-controls {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        .empty-properties-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 30px 10px;
          text-align: center;
          color: var(--text-muted);
          background: rgba(0,0,0,0.1);
          border: 1px dashed var(--panel-border);
          border-radius: 8px;
          gap: 8px;
        }
        .empty-properties-state .warning-icon {
          color: var(--accent-amber);
          opacity: 0.7;
        }
        .empty-properties-state p {
          font-size: 12px;
          font-weight: 600;
        }
        .empty-properties-state .sub-p {
          font-size: 10px;
          line-height: 1.4;
        }

        /* SVG and layout properties mapping from polotno.html */
        .inner-border {
          position: absolute;
          top: 24px;
          left: 24px;
          right: 24px;
          bottom: 24px;
          pointer-events: none;
          z-index: 99;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .inner-border-dark {
          position: absolute;
          top: 24px;
          left: 24px;
          right: 24px;
          bottom: 24px;
          pointer-events: none;
          z-index: 99;
          border: 1px solid rgba(0, 0, 0, 0.1);
        }
        .diamond-sep {
          display: inline-block;
          width: 12px;
          height: 12px;
          transform: rotate(45deg);
        }
        
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default OverlayTestLab;
