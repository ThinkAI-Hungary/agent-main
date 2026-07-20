import React, { useState } from 'react';
import type { BrandKit } from '../types';
import { Layers, Play, Cpu, Brain, Layers3, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

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

  const handleGenerate = async () => {
    if (!briefText.trim()) return;

    setIsGenerating(true);
    setCurrentStep(0);
    setVariants([]);
    setExpandedJsonIdx(null);
    
    const timestamp = new Date().toLocaleTimeString('hu-HU');
    setLogs([`[${timestamp}] [INFO] Indítás: Overlay-generálási pipeline elindítva.`]);

    try {
      // Step 1: Orchestration log
      setLogs(prev => [...prev, `[${timestamp}] [AI] Claude megtervezi a layout variánsokat (${variantCount} db brief alapján)...`]);
      
      const response = await fetch('/api/overlay/generate', {
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
                      <img src={v.imageUrl} alt={`Variant ${v.archetype}`} className="rendered-img" />
                      <a href={v.imageUrl} download={`overlay-${v.archetype}.png`} className="btn-download">
                        Kép Letöltése
                      </a>
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
      `}</style>
    </div>
  );
};
export default OverlayTestLab;
