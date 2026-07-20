import { useState, useRef } from 'react';
import { Upload, Sparkles, Image as ImageIcon, Loader2, Download, RotateCcw, Zap, Eye, SlidersHorizontal } from 'lucide-react';

type ModelChoice = 'bria' | 'flux-ip' | 'flux-harmonize' | 'bfl-flux-2-pro' | 'bfl-flux-2-max' | 'bfl-flux-pro-1.1-ultra';

export function ImageTestLab() {
  const [productImage, setProductImage] = useState<string | null>(null);
  const [productFileName, setProductFileName] = useState('');
  const [scenePrompt, setScenePrompt] = useState('');
  const [model, setModel] = useState<ModelChoice>('bria');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreprocessing, setIsPreprocessing] = useState(false);
  const [preprocessedUrl, setPreprocessedUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{ url: string; prompt: string; elapsed: number; model: string; params?: Record<string, any> }>>([]);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('hu-HU');
    const logStr = `[${timestamp}] [${type.toUpperCase()}] ${msg}`;
    setLogs(prev => [...prev, logStr]);
    console.log(logStr);
  };

  // Flux IP-Adapter tuning params
  const [ipStrength, setIpStrength] = useState(0.85);
  const [cnStrength, setCnStrength] = useState(0.7);
  const [guidanceScale, setGuidanceScale] = useState(3.5);
  const [numSteps, setNumSteps] = useState(28);

  // Bria Product Shot params
  const [briaPlacement, setBriaPlacement] = useState<string>('automatic');
  const [briaPositions, setBriaPositions] = useState<string[]>(['bottom_center']);
  const [briaOptimize, setBriaOptimize] = useState(true);
  const [briaFast, setBriaFast] = useState(true);
  const [briaShotW, setBriaShotW] = useState(1000);
  const [briaShotH, setBriaShotH] = useState(1250);

  // Black Forest Labs (BFL) params
  const [safetyTolerance, setSafetyTolerance] = useState(2);
  const [bflAspectRatio, setBflAspectRatio] = useState('2:3');
  const [bflRaw, setBflRaw] = useState(false);
  const [imagePromptStrength, setImagePromptStrength] = useState(0.1);
  const [bflWidth, setBflWidth] = useState(1024);
  const [bflHeight, setBflHeight] = useState(1536);

  const BRIA_POSITIONS = [
    'upper_left', 'upper_center', 'upper_right',
    'left_center', 'center_horizontal', 'center_vertical', 'right_center',
    'bottom_left', 'bottom_center', 'bottom_right',
  ];

  const PRESET_SCENES = [
    { label: '☕ Kávézó', prompt: 'A warm sunlit spring terrace with cherry blossom petals falling gently, a polished marble countertop, steaming espresso cup in the background, soft golden hour bokeh, luxury cafe atmosphere, professional product photography' },
    { label: '🏔️ Prémium Studio', prompt: 'A premium minimalist studio setup with soft directional lighting, white marble surface with subtle gold accents, elegant floral arrangement in the background, clean luxury advertising photography' },
    { label: '🌿 Természetes', prompt: 'A natural outdoor setting with lush green foliage, morning dew on leaves, rustic wooden surface, soft diffused natural light through trees, organic lifestyle product photography' },
    { label: '🎄 Ünnepi', prompt: 'A festive holiday scene with warm candlelight, pine branches, gold ornaments, rich burgundy velvet fabric, cozy winter atmosphere, premium holiday advertising photography' },
    { label: '🏖️ Nyári', prompt: 'A bright summer beach scene with turquoise water, white sand, tropical flowers, bright sunlight with soft shadows, fresh and vibrant summer advertising photography' },
    { label: '🍂 Őszi', prompt: 'An autumn harvest scene with warm amber and burnt orange tones, rustic wooden crate, scattered maple leaves, warm afternoon light, cozy fall atmosphere, artisan product photography' },
  ];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setProductFileName(file.name);
    setPreprocessedUrl(null);
    setOriginalUrl(null);
    setError('');
    setLogs([]);
    addLog(`Fájl kiválasztva: ${file.name} (méret: ${(file.size / 1024 / 1024).toFixed(2)} MB)`, 'info');
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setProductImage(base64);
      
      // Auto bg-remove
      setIsPreprocessing(true);
      setStatusMsg('Háttér eltávolítás (Bria AI)...');
      addLog('Háttér eltávolítási kérés küldése: POST /api/image/preprocess...', 'info');
      try {
        const resp = await fetch('/api/image/preprocess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 }),
        });
        if (!resp.ok) {
          const errText = await resp.text();
          addLog(`Háttér eltávolítás hiba válasz: ${errText}`, 'error');
          throw new Error(errText);
        }
        const data = await resp.json();
        setPreprocessedUrl(data.url);
        setOriginalUrl(data.originalUrl || null);
        setStatusMsg('✅ Háttér eltávolítva');
        addLog(`Háttér sikeresen eltávolítva. Kép URL: ${data.url}`, 'success');
      } catch (err: any) {
        addLog(`Háttér eltávolítás meghiúsult: ${err.message}`, 'error');
        setError(`Háttér eltávolítás hiba: ${err.message}`);
        setStatusMsg('');
      } finally {
        setIsPreprocessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!scenePrompt.trim()) {
      setError('Adj meg egy jelenet leírást!');
      return;
    }

    setIsGenerating(true);
    setError('');
    setLogs([]);
    const modelLabelMap: Record<ModelChoice, string> = {
      'bria': 'Bria Product Shot',
      'flux-ip': 'Flux + IP-Adapter',
      'flux-harmonize': 'Flux Harmonize (Composite)',
      'bfl-flux-2-pro': 'BFL FLUX.2 [pro]',
      'bfl-flux-2-max': 'BFL FLUX.2 [max]',
      'bfl-flux-pro-1.1-ultra': 'BFL FLUX.1.1 [pro] Ultra'
    };
    const modelLabel = modelLabelMap[model];
    addLog(`Generálás indítása: ${modelLabel}...`, 'info');
    setStatusMsg(`${modelLabel} generálás...`);
    
    if (preprocessedUrl) {
      addLog(`Termék kép (háttér nélkül): ${preprocessedUrl}`, 'info');
    } else if (productImage) {
      addLog('Termék kép (eredeti, háttérrel): a háttér eltávolítás nem fejeződött be, vagy meghiúsult.', 'info');
    } else {
      addLog('Nincs megadva termék kép. Scene-only módban fut.', 'info');
    }

    const start = Date.now();

    try {
      const body: any = {
        productImageUrl: originalUrl || preprocessedUrl || null,
        preprocessedImageUrl: preprocessedUrl || null,
        scenePrompt,
        model,
      };
      
      if (model === 'flux-ip') {
        body.ipStrength = ipStrength;
        body.cnStrength = cnStrength;
        body.guidanceScale = guidanceScale;
        body.numSteps = numSteps;
        addLog(`Flux paraméterek -> IP erősség: ${ipStrength}, CN erősség: ${cnStrength}, Guidance: ${guidanceScale}, Lépések: ${numSteps}`, 'info');
      }
      if (model === 'bria') {
        body.briaPlacement = briaPlacement;
        body.briaPositions = briaPositions;
        body.briaOptimize = briaOptimize;
        body.briaFast = briaFast;
        body.briaShotSize = [briaShotW, briaShotH];
        addLog(`Bria paraméterek -> Elhelyezés: ${briaPlacement}, Pozíciók: ${briaPositions.join(', ')}, Fast: ${briaFast}, Méret: ${briaShotW}x${briaShotH}`, 'info');
      }
      if (model.startsWith('bfl-')) {
        body.safetyTolerance = safetyTolerance;
        body.bflAspectRatio = bflAspectRatio;
        body.bflRaw = bflRaw;
        body.imagePromptStrength = imagePromptStrength;
        body.width = bflWidth;
        body.height = bflHeight;
        addLog(`BFL paraméterek -> Safety: ${safetyTolerance}, Ratio: ${bflAspectRatio}, Raw: ${bflRaw}, Strength: ${imagePromptStrength}, Size: ${bflWidth}x${bflHeight}`, 'info');
      }

      addLog('API hívás küldése: POST /api/test-image...', 'info');
      const resp = await fetch('/api/test-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        addLog(`API hiba válasz érkezett: ${errorText}`, 'error');
        throw new Error(errorText);
      }
      
      const data = await resp.json();
      const elapsed = Date.now() - start;
      addLog(`Sikeres válasz a backendtől! (${(elapsed / 1000).toFixed(1)}s)`, 'success');
      addLog(`Generált kép URL: ${data.imageUrl}`, 'success');

      const paramInfo = model === 'flux-ip'
        ? { ipStrength, cnStrength, guidanceScale, numSteps }
        : model === 'bria'
        ? { placement: briaPlacement, fast: briaFast, optimize: briaOptimize, size: `${briaShotW}x${briaShotH}` }
        : model.startsWith('bfl-')
        ? { safety: safetyTolerance, ratio: bflAspectRatio, raw: bflRaw, imgStr: imagePromptStrength, size: `${bflWidth}x${bflHeight}` }
        : { method: 'Sharp composite + Flux img2img' };

      setResults(prev => [{
        url: data.imageUrl,
        prompt: scenePrompt,
        elapsed,
        model: data.model || model,
        params: paramInfo,
      }, ...prev]);

      setStatusMsg(`✅ Kész! (${(elapsed / 1000).toFixed(1)}s)`);
    } catch (err: any) {
      addLog(`Kivétel történt: ${err.message}`, 'error');
      try {
        const parsed = JSON.parse(err.message);
        setError(parsed.error || parsed.message || err.message);
        if (parsed.details) {
          addLog(`Hiba részletei: ${JSON.stringify(parsed.details, null, 2)}`, 'error');
        }
      } catch {
        setError(err.message);
      }
      setStatusMsg('');
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate with both models simultaneously
  const handleGenerateBoth = async () => {
    if (!scenePrompt.trim()) {
      setError('Adj meg egy jelenet leírást!');
      return;
    }
    setIsGenerating(true);
    setError('');
    setLogs([]);
    addLog('A/B teszt indítása mindkét modellel...', 'info');
    if (preprocessedUrl) {
      addLog(`Termék kép: ${preprocessedUrl}`, 'info');
    }
    const start = Date.now();

    try {
      addLog('Bria Product Shot hívás indítása...', 'info');
      addLog('Flux + IP-Adapter hívás indítása...', 'info');
      
      const [briaResp, fluxResp] = await Promise.allSettled([
        fetch('/api/test-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productImageUrl: preprocessedUrl || null, scenePrompt, model: 'bria', briaPlacement, briaPositions, briaOptimize, briaFast, briaShotSize: [briaShotW, briaShotH] }),
        }).then(async r => { 
          if (!r.ok) {
            const txt = await r.text();
            addLog(`Bria hiba: ${txt}`, 'error');
            throw new Error(txt); 
          }
          const resJson = await r.json();
          addLog('Bria sikeresen befejeződött.', 'success');
          return resJson;
        }),
        fetch('/api/test-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productImageUrl: originalUrl || preprocessedUrl || null, preprocessedImageUrl: preprocessedUrl || null, scenePrompt, model: 'flux-ip', ipStrength, cnStrength, guidanceScale, numSteps }),
        }).then(async r => { 
          if (!r.ok) {
            const txt = await r.text();
            addLog(`Flux + IP hiba: ${txt}`, 'error');
            throw new Error(txt); 
          }
          const resJson = await r.json();
          addLog('Flux + IP sikeresen befejeződött.', 'success');
          return resJson;
        }),
      ]);

      const elapsed = Date.now() - start;
      const newResults: typeof results = [];

      if (briaResp.status === 'fulfilled') {
        newResults.push({ url: briaResp.value.imageUrl, prompt: scenePrompt, elapsed, model: 'bria-product-shot' });
        addLog(`Bria eredmény URL: ${briaResp.value.imageUrl}`, 'success');
      } else {
        addLog(`Bria generálás meghiúsult: ${briaResp.reason.message}`, 'error');
      }
      
      if (fluxResp.status === 'fulfilled') {
        newResults.push({ url: fluxResp.value.imageUrl, prompt: scenePrompt, elapsed, model: 'flux-ip-adapter', params: { ipStrength, cnStrength, guidanceScale, numSteps } });
        addLog(`Flux eredmény URL: ${fluxResp.value.imageUrl}`, 'success');
      } else {
        addLog(`Flux generálás meghiúsult: ${fluxResp.reason.message}`, 'error');
      }

      setResults(prev => [...newResults, ...prev]);

      const failed = [briaResp, fluxResp].filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        setError(`${failed.length} modell hibázott. Lásd a logokat.`);
      }
      setStatusMsg(`✅ Kész! (${(elapsed / 1000).toFixed(1)}s)`);
    } catch (err: any) {
      addLog(`Kivétel az A/B teszt során: ${err.message}`, 'error');
      setError(err.message);
      setStatusMsg('');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="image-lab-container">
      <div className="lab-header">
        <div className="lab-title-row">
          <div className="lab-icon-circle">
            <Zap size={20} />
          </div>
          <div>
            <h2>Image Generation Lab</h2>
            <p className="lab-subtitle">A/B tesztelés: Bria Product Shot vs Flux + IP-Adapter</p>
          </div>
        </div>
      </div>

      <div className="lab-grid">
        {/* Left: Controls */}
        <div className="lab-controls">
          {/* Product Upload */}
          <div className="lab-card glass-panel">
            <h3><Upload size={16} /> Termék Kép</h3>
            <div
              className={`upload-zone ${productImage ? 'has-image' : ''}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {productImage ? (
                <div className="upload-preview-row">
                  <img src={preprocessedUrl || productImage} alt="Product" className="upload-thumb" />
                  <div className="upload-meta">
                    <span className="upload-filename">{productFileName}</span>
                    {isPreprocessing && <span className="preprocessing-badge"><Loader2 size={12} className="spin" /> BG removal...</span>}
                    {preprocessedUrl && <span className="done-badge">✅ BG eltávolítva</span>}
                  </div>
                </div>
              ) : (
                <div className="upload-placeholder">
                  <Upload size={24} />
                  <span>Kattints vagy húzd ide a termék fotót</span>
                  <span className="upload-hint">PNG, JPG — max 10MB</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </div>
            {productImage && (
              <button className="btn-clear" onClick={() => {
                setProductImage(null);
                setPreprocessedUrl(null);
                setOriginalUrl(null);
                setProductFileName('');
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}>
                <RotateCcw size={12} /> Törlés
              </button>
            )}
          </div>

          {/* Scene Prompt */}
          <div className="lab-card glass-panel">
            <h3><Sparkles size={16} /> Jelenet Leírás</h3>
            <textarea
              className="scene-textarea"
              value={scenePrompt}
              onChange={(e) => setScenePrompt(e.target.value)}
              placeholder="Describe the scene in English... e.g. A warm sunlit marble countertop with cherry blossoms..."
              rows={4}
            />
            <div className="preset-grid">
              {PRESET_SCENES.map((p, i) => (
                <button
                  key={i}
                  className={`preset-chip ${scenePrompt === p.prompt ? 'active' : ''}`}
                  onClick={() => setScenePrompt(p.prompt)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model Selector */}
          <div className="lab-card glass-panel">
            <h3><SlidersHorizontal size={16} /> Modell Választás</h3>
            <div className="model-selector" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
              <button
                className={`model-btn ${model === 'bria' ? 'active' : ''}`}
                onClick={() => setModel('bria')}
              >
                <span className="model-emoji">🎯</span>
                <div className="model-info">
                  <span className="model-name">Bria Product Shot</span>
                  <span className="model-desc">Purpose-built, pixel-perfect</span>
                </div>
              </button>
              <button
                className={`model-btn ${model === 'flux-harmonize' ? 'active' : ''}`}
                onClick={() => setModel('flux-harmonize')}
              >
                <span className="model-emoji">✨</span>
                <div className="model-info">
                  <span className="model-name">Flux Harmonize</span>
                  <span className="model-desc">Deterministic Composite</span>
                </div>
              </button>
              <button
                className={`model-btn ${model === 'flux-ip' ? 'active' : ''}`}
                onClick={() => setModel('flux-ip')}
              >
                <span className="model-emoji">🎨</span>
                <div className="model-info">
                  <span className="model-name">Flux + IP-Adapter</span>
                  <span className="model-desc">Generative from scratch</span>
                </div>
              </button>
              <button
                className={`model-btn ${model === 'bfl-flux-2-pro' ? 'active' : ''}`}
                onClick={() => setModel('bfl-flux-2-pro')}
              >
                <span className="model-emoji">⚡</span>
                <div className="model-info">
                  <span className="model-name">BFL FLUX.2 [pro]</span>
                  <span className="model-desc">Official Direct API Default</span>
                </div>
              </button>
              <button
                className={`model-btn ${model === 'bfl-flux-2-max' ? 'active' : ''}`}
                onClick={() => setModel('bfl-flux-2-max')}
              >
                <span className="model-emoji">🔥</span>
                <div className="model-info">
                  <span className="model-name">BFL FLUX.2 [max]</span>
                  <span className="model-desc">Official Maximum Quality</span>
                </div>
              </button>
              <button
                className={`model-btn ${model === 'bfl-flux-pro-1.1-ultra' ? 'active' : ''}`}
                onClick={() => setModel('bfl-flux-pro-1.1-ultra')}
              >
                <span className="model-emoji">💫</span>
                <div className="model-info">
                  <span className="model-name">BFL FLUX.1.1 Ultra</span>
                  <span className="model-desc">Style Remix & Raw Mode</span>
                </div>
              </button>
            </div>

            {/* Bria params */}
            {model === 'bria' && (
              <div className="flux-params">
                <div className="param-row">
                  <label>Placement <span className="param-val">{briaPlacement}</span></label>
                  <div className="placement-chips">
                    {['original', 'automatic', 'manual_placement', 'manual_padding'].map(p => (
                      <button key={p} className={`preset-chip ${briaPlacement === p ? 'active' : ''}`}
                        onClick={() => setBriaPlacement(p)}>{p.replace('_', ' ')}</button>
                    ))}
                  </div>
                </div>
                {briaPlacement === 'manual_placement' && (
                  <div className="param-row">
                    <label>Position(s)</label>
                    <div className="position-grid">
                      {BRIA_POSITIONS.map(pos => (
                        <button key={pos}
                          className={`pos-chip ${briaPositions.includes(pos) ? 'active' : ''}`}
                          onClick={() => setBriaPositions(prev =>
                            prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]
                          )}
                        >{pos.replace('_', ' ')}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="param-row">
                  <label>Output Size <span className="param-val">{briaShotW}×{briaShotH}</span></label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="number" className="size-input" value={briaShotW} onChange={e => setBriaShotW(+e.target.value)} placeholder="W" />
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: '30px' }}>×</span>
                    <input type="number" className="size-input" value={briaShotH} onChange={e => setBriaShotH(+e.target.value)} placeholder="H" />
                  </div>
                  <span className="param-hint">~1M pixels recommended (e.g. 1000×1000)</span>
                </div>
                <div className="toggle-row">
                  <label><input type="checkbox" checked={briaOptimize} onChange={e => setBriaOptimize(e.target.checked)} /> Optimize Description</label>
                  <label><input type="checkbox" checked={briaFast} onChange={e => setBriaFast(e.target.checked)} /> Fast Mode</label>
                </div>
              </div>
            )}

            {/* Flux IP-Adapter params */}
            {model === 'flux-ip' && (
              <div className="flux-params">
                <div className="param-row">
                  <label>IP-Adapter Strength <span className="param-val">{ipStrength}</span></label>
                  <input type="range" min="0" max="1" step="0.05" value={ipStrength} onChange={e => setIpStrength(+e.target.value)} />
                  <span className="param-hint">Higher = more faithful to product</span>
                </div>
                <div className="param-row">
                  <label>ControlNet Strength <span className="param-val">{cnStrength}</span></label>
                  <input type="range" min="0" max="1" step="0.05" value={cnStrength} onChange={e => setCnStrength(+e.target.value)} />
                  <span className="param-hint">Higher = stricter structural match</span>
                </div>
                <div className="param-row">
                  <label>Guidance Scale <span className="param-val">{guidanceScale}</span></label>
                  <input type="range" min="1" max="10" step="0.5" value={guidanceScale} onChange={e => setGuidanceScale(+e.target.value)} />
                  <span className="param-hint">Higher = closer to prompt</span>
                </div>
                <div className="param-row">
                  <label>Inference Steps <span className="param-val">{numSteps}</span></label>
                  <input type="range" min="10" max="50" step="1" value={numSteps} onChange={e => setNumSteps(+e.target.value)} />
                  <span className="param-hint">More steps = better quality, slower</span>
                </div>
              </div>
            )}

            {/* BFL FLUX.2 Params */}
            {(model === 'bfl-flux-2-pro' || model === 'bfl-flux-2-max') && (
              <div className="flux-params">
                <div className="param-row">
                  <label>Safety Tolerance <span className="param-val">{safetyTolerance}</span></label>
                  <input type="range" min="0" max="5" step="1" value={safetyTolerance} onChange={e => setSafetyTolerance(+e.target.value)} />
                  <span className="param-hint">0 = most strict, 5 = least strict (default: 2)</span>
                </div>
                <div className="param-row">
                  <label>Dimensions <span className="param-val">{bflWidth}×{bflHeight}</span></label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="number" className="size-input" value={bflWidth} onChange={e => setBflWidth(+e.target.value)} placeholder="W" />
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: '30px' }}>×</span>
                    <input type="number" className="size-input" value={bflHeight} onChange={e => setBflHeight(+e.target.value)} placeholder="H" />
                  </div>
                  <span className="param-hint">Width & Height (pixels), e.g. 1024x1536</span>
                </div>
                {(preprocessedUrl || productImage) && (
                  <div className="param-hint" style={{ marginTop: '8px', borderLeft: '2px solid #8b5cf6', paddingLeft: '8px', color: '#c4b5fd', textAlign: 'left', lineHeight: '1.4' }}>
                    <strong>Pro Tip:</strong> BFL FLUX.2 preserves your product structure. Refer to <code>image 1</code> for the product background-removed shape, and <code>image 2</code> for original colors and texture in your prompt!
                  </div>
                )}
              </div>
            )}

            {/* BFL FLUX.1.1 Ultra Params */}
            {model === 'bfl-flux-pro-1.1-ultra' && (
              <div className="flux-params">
                <div className="param-row">
                  <label>Safety Tolerance <span className="param-val">{safetyTolerance}</span></label>
                  <input type="range" min="0" max="6" step="1" value={safetyTolerance} onChange={e => setSafetyTolerance(+e.target.value)} />
                  <span className="param-hint">0 = most strict, 6 = least strict (default: 2)</span>
                </div>
                <div className="param-row">
                  <label>Aspect Ratio <span className="param-val">{bflAspectRatio}</span></label>
                  <div className="placement-chips">
                    {['1:1', '16:9', '9:16', '3:4', '4:3', '2:3', '3:2'].map(r => (
                      <button key={r} className={`preset-chip ${bflAspectRatio === r ? 'active' : ''}`}
                        onClick={() => setBflAspectRatio(r)}>{r}</button>
                    ))}
                  </div>
                </div>
                {(preprocessedUrl || productImage) && (
                  <div className="param-row">
                    <label>Image Prompt Strength <span className="param-val">{imagePromptStrength}</span></label>
                    <input type="range" min="0" max="1" step="0.05" value={imagePromptStrength} onChange={e => setImagePromptStrength(+e.target.value)} />
                    <span className="param-hint">Blend between text prompt and image details (default: 0.1)</span>
                  </div>
                )}
                <div className="toggle-row" style={{ marginTop: '4px' }}>
                  <label><input type="checkbox" checked={bflRaw} onChange={e => setBflRaw(e.target.checked)} /> Raw mode (natural texture)</label>
                </div>
                {(preprocessedUrl || productImage) && (
                  <div className="param-hint" style={{ marginTop: '8px', borderLeft: '2px solid #f59e0b', paddingLeft: '8px', color: '#fcd34d', textAlign: 'left', lineHeight: '1.4' }}>
                    <strong>Pro Tip:</strong> Ultra mode uses the product photo as a style prompt. Guide BFL on how to blend it into the scene leírás.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Generate Buttons */}
          <div className="generate-buttons">
            <button
              className={`btn-generate ${isGenerating ? 'generating' : ''}`}
              onClick={handleGenerate}
              disabled={isGenerating || isPreprocessing}
            >
              {isGenerating ? (
                <><Loader2 size={18} className="spin" /> Generálás...</>
              ) : (
                <><ImageIcon size={18} /> {model === 'bria' ? 'Bria' : model.startsWith('bfl-') ? 'BFL' : 'Flux'} Generálás</>
              )}
            </button>
            {preprocessedUrl && (
              <button
                className={`btn-generate btn-both ${isGenerating ? 'generating' : ''}`}
                onClick={handleGenerateBoth}
                disabled={isGenerating || isPreprocessing}
              >
                <Zap size={16} /> A/B Teszt (mindkettő)
              </button>
            )}
          </div>

          {statusMsg && <div className="status-msg">{statusMsg}</div>}
          {error && <div className="error-msg">❌ {error}</div>}

          {logs.length > 0 && (
            <div className="console-panel">
              <h6>Részletes Logok:</h6>
              <div className="log-lines">
                {logs.map((log, idx) => (
                  <div key={idx} className={`log-line ${log.includes('[ERROR]') ? 'error' : log.includes('[SUCCESS]') ? 'success' : ''}`}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="lab-results">
          <h3><Eye size={16} /> Eredmények ({results.length})</h3>
          {results.length === 0 ? (
            <div className="empty-results">
              <ImageIcon size={40} />
              <p>Itt jelennek meg a generált képek</p>
            </div>
          ) : (
            <div className="results-grid">
              {results.map((r, i) => (
                <div key={i} className="result-card glass-panel">
                  <img src={r.url} alt={`Result ${i}`} className="result-image" />
                  <div className="result-footer">
                    <div className="result-meta">
                      <span className={`model-badge ${r.model.includes('bria') ? 'bria' : r.model.includes('bfl') ? 'bfl' : 'flux'}`}>{r.model}</span>
                      <span className="time-badge">{(r.elapsed / 1000).toFixed(1)}s</span>
                    </div>
                    {r.params && (
                      <div className="result-params">
                        {Object.entries(r.params).map(([k, v]) => `${k}:${v}`).join(' ')}
                      </div>
                    )}
                    <p className="result-prompt">{r.prompt.substring(0, 80)}...</p>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="btn-download">
                      <Download size={12} /> Megnyitás
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .image-lab-container {
          max-width: 1400px;
          margin: 0 auto;
        }
        .lab-header { margin-bottom: 24px; }
        .lab-title-row { display: flex; align-items: center; gap: 14px; }
        .lab-icon-circle {
          width: 42px; height: 42px; border-radius: 50%;
          background: linear-gradient(135deg, rgba(250, 204, 21, 0.2), rgba(245, 158, 11, 0.2));
          border: 1px solid rgba(250, 204, 21, 0.3);
          display: flex; align-items: center; justify-content: center; color: #facc15;
        }
        .lab-header h2 { font-size: 22px; font-weight: 800; margin: 0; }
        .lab-subtitle { font-size: 13px; color: var(--text-muted); margin: 2px 0 0; }

        .lab-grid {
          display: grid; grid-template-columns: 420px 1fr; gap: 24px; align-items: start;
        }
        @media (max-width: 900px) { .lab-grid { grid-template-columns: 1fr; } }

        .lab-controls { display: flex; flex-direction: column; gap: 16px; }
        .lab-card { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
        .lab-card h3 {
          font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px;
          color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin: 0;
        }

        .upload-zone {
          border: 2px dashed rgba(139, 92, 246, 0.3); border-radius: 10px;
          padding: 24px; cursor: pointer; transition: var(--transition-smooth); text-align: center;
        }
        .upload-zone:hover { border-color: rgba(139, 92, 246, 0.6); background: rgba(139, 92, 246, 0.05); }
        .upload-zone.has-image { border-style: solid; border-color: rgba(139, 92, 246, 0.2); padding: 12px; }
        .upload-placeholder { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-muted); font-size: 13px; }
        .upload-hint { font-size: 11px; opacity: 0.6; }
        .upload-preview-row { display: flex; align-items: center; gap: 12px; }
        .upload-thumb {
          width: 60px; height: 60px; object-fit: contain; border-radius: 8px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
        }
        .upload-meta { display: flex; flex-direction: column; gap: 4px; text-align: left; }
        .upload-filename { font-size: 12px; font-weight: 600; color: var(--text-main); }
        .preprocessing-badge { font-size: 11px; color: var(--accent-amber); display: flex; align-items: center; gap: 4px; }
        .done-badge { font-size: 11px; color: #10b981; }
        .btn-clear {
          background: transparent; border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted);
          padding: 6px 12px; border-radius: 6px; font-size: 11px; cursor: pointer;
          display: flex; align-items: center; gap: 4px; align-self: flex-start; transition: var(--transition-smooth);
        }
        .btn-clear:hover { border-color: rgba(255,255,255,0.2); color: var(--text-main); }

        .scene-textarea {
          width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; padding: 12px; color: var(--text-main); font-size: 13px;
          font-family: inherit; resize: vertical; line-height: 1.5;
        }
        .scene-textarea:focus { outline: none; border-color: rgba(139, 92, 246, 0.5); }
        .scene-textarea::placeholder { color: var(--text-muted); opacity: 0.6; }

        .preset-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .preset-chip {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          color: var(--text-muted); padding: 5px 10px; border-radius: 16px; font-size: 12px;
          cursor: pointer; transition: var(--transition-smooth);
        }
        .preset-chip:hover { background: rgba(139, 92, 246, 0.15); border-color: rgba(139, 92, 246, 0.3); color: var(--text-main); }
        .preset-chip.active { background: rgba(139, 92, 246, 0.2); border-color: rgba(139, 92, 246, 0.4); color: #c4b5fd; }

        /* Model Selector */
        .model-selector { display: flex; gap: 8px; }
        .model-btn {
          flex: 1; display: flex; align-items: center; gap: 10px;
          padding: 12px; border-radius: 10px; cursor: pointer;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
          transition: all 0.2s ease; text-align: left;
        }
        .model-btn:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.15); }
        .model-btn.active {
          background: rgba(139, 92, 246, 0.12); border-color: rgba(139, 92, 246, 0.35);
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.1);
        }
        .model-emoji { font-size: 20px; }
        .model-info { display: flex; flex-direction: column; gap: 2px; }
        .model-name { font-size: 13px; font-weight: 700; color: var(--text-main); }
        .model-desc { font-size: 10px; color: var(--text-muted); }

        /* Params Panels */
        .flux-params {
          display: flex; flex-direction: column; gap: 10px;
          padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .param-row { display: flex; flex-direction: column; gap: 3px; }
        .param-row label { font-size: 11px; font-weight: 600; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
        .param-val { color: #c4b5fd; font-weight: 700; margin-left: auto; }
        .param-hint { font-size: 10px; color: var(--text-muted); opacity: 0.5; }
        .param-row input[type="range"] {
          width: 100%; accent-color: #8b5cf6; height: 4px; background: rgba(255,255,255,0.1);
          border-radius: 2px; -webkit-appearance: none; appearance: none;
        }
        .param-row input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
          background: #8b5cf6; cursor: pointer; border: 2px solid rgba(255,255,255,0.3);
        }
        .placement-chips { display: flex; flex-wrap: wrap; gap: 4px; }
        .position-grid { display: flex; flex-wrap: wrap; gap: 4px; }
        .pos-chip {
          font-size: 10px; padding: 3px 7px; border-radius: 4px; cursor: pointer;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          color: var(--text-muted); transition: all 0.15s ease;
        }
        .pos-chip.active { background: rgba(16, 185, 129, 0.2); border-color: rgba(16, 185, 129, 0.4); color: #6ee7b7; }
        .pos-chip:hover { border-color: rgba(255,255,255,0.2); }
        .size-input {
          width: 70px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px; padding: 4px 8px; color: var(--text-main); font-size: 12px;
          font-family: monospace;
        }
        .size-input:focus { outline: none; border-color: rgba(139, 92, 246, 0.5); }
        .toggle-row {
          display: flex; gap: 16px; font-size: 11px; color: var(--text-muted);
        }
        .toggle-row label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
        .toggle-row input[type="checkbox"] { accent-color: #8b5cf6; }

        /* Generate Buttons */
        .generate-buttons { display: flex; gap: 8px; }
        .btn-generate {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 14px 20px; border-radius: 10px; font-size: 14px; font-weight: 700;
          border: none; cursor: pointer;
          background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
          color: white; transition: all 0.2s ease;
          box-shadow: 0 4px 20px rgba(139, 92, 246, 0.3);
        }
        .btn-generate:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 25px rgba(139, 92, 246, 0.4); }
        .btn-generate:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-generate.generating { background: linear-gradient(135deg, #6d28d9 0%, #4c1d95 100%); }
        .btn-both {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          box-shadow: 0 4px 20px rgba(245, 158, 11, 0.3);
          font-size: 12px;
        }
        .btn-both:hover:not(:disabled) { box-shadow: 0 6px 25px rgba(245, 158, 11, 0.4); }

        .status-msg { font-size: 12px; color: #10b981; text-align: center; padding: 4px; }
        .error-msg {
          font-size: 12px; color: #ef4444; background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; padding: 10px;
        }

        /* Console */
        .console-panel {
          background: #050308;
          border: 1px solid var(--panel-border);
          border-radius: 8px;
          padding: 10px;
          font-family: monospace;
          font-size: 10px;
          height: 140px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 10px;
          text-align: left;
        }
        .console-panel h6 {
          color: var(--primary-neon);
          font-weight: 700;
          margin: 0 0 4px;
        }
        .log-lines {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .log-line {
          color: var(--text-muted);
          white-space: pre-wrap;
          word-break: break-all;
        }
        .log-line.success {
          color: #10b981;
        }
        .log-line.error {
          color: #ef4444;
        }

        .lab-results h3 {
          font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px;
          color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 16px;
        }
        .empty-results {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 60px 20px; color: var(--text-muted); gap: 12px; opacity: 0.4;
        }
        .empty-results p { font-size: 13px; }

        .results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
        .result-card { padding: 0; overflow: hidden; }
        .result-image { width: 100%; aspect-ratio: 4/5; object-fit: cover; display: block; }
        .result-footer { padding: 12px; display: flex; flex-direction: column; gap: 6px; }
        .result-meta { display: flex; gap: 6px; }
        .model-badge {
          font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; text-transform: uppercase;
        }
        .model-badge.bria { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; }
        .model-badge.bfl { background: rgba(249, 115, 22, 0.2); color: #fdba74; }
        .model-badge.flux { background: rgba(139, 92, 246, 0.2); color: #c4b5fd; }
        .time-badge {
          font-size: 10px; font-weight: 700; background: rgba(250, 204, 21, 0.15);
          color: #fcd34d; padding: 2px 8px; border-radius: 4px;
        }
        .result-params {
          font-size: 10px; color: var(--text-muted); font-family: monospace;
          background: rgba(0,0,0,0.2); padding: 3px 6px; border-radius: 4px;
        }
        .result-prompt { font-size: 11px; color: var(--text-muted); line-height: 1.4; margin: 0; }
        .btn-download {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; color: var(--primary-neon); text-decoration: none; font-weight: 600;
        }
        .btn-download:hover { text-decoration: underline; }

        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
