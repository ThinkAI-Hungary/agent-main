import React, { useState } from 'react';
import type { BrandKit } from '../types';
import { Palette, Type, Smile, Image, AlertTriangle, Check, Plus, Trash2, Clock } from 'lucide-react';

interface BrandKitViewProps {
  brandKits: BrandKit[];
  activeKitId: string;
  onSelectKit: (id: string) => void;
  onSaveKit: (newKit: BrandKit) => void;
  onExtractBrandKit?: (url: string) => Promise<void>;
  isExtracting?: boolean;
}

export const BrandKitView: React.FC<BrandKitViewProps> = ({
  brandKits,
  activeKitId,
  onSelectKit,
  onSaveKit,
  onExtractBrandKit,
  isExtracting = false,
}) => {
  const activeKit = brandKits.find((k) => k.id === activeKitId) || brandKits[brandKits.length - 1];

  const [isEditing, setIsEditing] = useState(false);
  const [extractUrl, setExtractUrl] = useState('https://annacafe.hu');
  
  // Form state
  const [primaryColor, setPrimaryColor] = useState(activeKit.colors.primary);
  const [secondaryColor, setSecondaryColor] = useState(activeKit.colors.secondary);
  const [accentColor, setAccentColor] = useState(activeKit.colors.accent);
  const [colorRules, setColorRules] = useState(activeKit.colors.rules);
  
  const [fontName, setFontName] = useState(activeKit.typography.fontName);
  const [titleSize, setTitleSize] = useState(activeKit.typography.titleSize);
  const [maxLineLength, setMaxLineLength] = useState(activeKit.typography.maxLineLength);
  
  const [logoPosition, setLogoPosition] = useState(activeKit.logoPosition);
  const [toneInput, setToneInput] = useState(activeKit.tone.join(', '));
  const [toneGood, setToneGood] = useState(activeKit.toneExampleGood);
  const [toneBad, setToneBad] = useState(activeKit.toneExampleBad);
  
  const [visualRules, setVisualRules] = useState<string[]>([...activeKit.visualRules]);
  const [newRule, setNewRule] = useState('');
  
  const [negativePrompt, setNegativePrompt] = useState(activeKit.negativePrompt);

  // Open modal / reset state
  const handleOpenEdit = () => {
    setPrimaryColor(activeKit.colors.primary);
    setSecondaryColor(activeKit.colors.secondary);
    setAccentColor(activeKit.colors.accent);
    setColorRules(activeKit.colors.rules);
    setFontName(activeKit.typography.fontName);
    setTitleSize(activeKit.typography.titleSize);
    setMaxLineLength(activeKit.typography.maxLineLength);
    setLogoPosition(activeKit.logoPosition);
    setToneInput(activeKit.tone.join(', '));
    setToneGood(activeKit.toneExampleGood);
    setToneBad(activeKit.toneExampleBad);
    setVisualRules([...activeKit.visualRules]);
    setIsEditing(true);
  };

  // Check Hungarian glyph support
  const checkFontGlyphSupport = (font: string) => {
    // Simulated audit check: Cinzel is missing glyphs. Playfair, Montserrat, Inter, Caveat support them.
    if (font.toLowerCase() === 'cinzel') {
      return {
        supported: false,
        warning: "A választott 'Cinzel' betűtípus nem tartalmazza az 'ő' és 'ű' karaktereket! Ezen betűk helyett alapértelmezett serif betűtípus jelenik meg a rendereléskor, ami rontja a márkahűséget.",
      };
    }
    return {
      supported: true,
      success: "Betűtípus auditálva: Minden magyar karakter támogatott (ő, ű, é, á, í, ó, ú, ö, ü).",
    };
  };

  const fontAudit = checkFontGlyphSupport(fontName);

  const handleSave = () => {
    const nextVersion = brandKits.length + 1;
    const newKit: BrandKit = {
      id: `kit-v${nextVersion}`,
      version: nextVersion,
      createdAt: new Date().toISOString(),
      colors: {
        primary: primaryColor,
        secondary: secondaryColor,
        accent: accentColor,
        rules: colorRules,
      },
      typography: {
        fontName,
        titleSize,
        subtitleSize: activeKit.typography.subtitleSize,
        bodySize: activeKit.typography.bodySize,
        maxLineLength: Number(maxLineLength),
      },
      logoUrl: activeKit.logoUrl,
      logoPosition,
      tone: toneInput.split(',').map((t) => t.trim()).filter((t) => t.length > 0),
      toneExampleGood: toneGood,
      toneExampleBad: toneBad,
      visualRules: visualRules.filter((r) => r.trim().length > 0),
      negativePrompt,
    };
    onSaveKit(newKit);
    setIsEditing(false);
  };

  const addVisualRule = () => {
    if (newRule.trim()) {
      setVisualRules([...visualRules, newRule.trim()]);
      setNewRule('');
    }
  };

  const removeVisualRule = (index: number) => {
    setVisualRules(visualRules.filter((_, i) => i !== index));
  };

  return (
    <div className="brand-kit-section animate-slide-up">
      <div className="section-header">
        <div>
          <h2>Márka Kit (Brand Kit)</h2>
          <p className="subtitle">A rendszer szíve és vizuális motorja</p>
        </div>
        <div className="version-controls">
          <div className="select-wrapper">
            <Clock size={16} className="select-icon" />
            <select
              value={activeKitId}
              onChange={(e) => onSelectKit(e.target.value)}
              className="version-select"
            >
              {brandKits.map((kit) => (
                <option key={kit.id} value={kit.id}>
                  Verzió {kit.version} ({new Date(kit.createdAt).toLocaleDateString('hu-HU')})
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary" onClick={handleOpenEdit}>
            Brand Kit Szerkesztése
          </button>
        </div>
      </div>

      <div className="brand-grid">
        {/* Web Extraction Panel */}
        <div className="glass-panel info-card animate-slide-up" style={{ gridColumn: '1 / -1', minHeight: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(139, 92, 246, 0.05)', borderColor: 'rgba(139, 92, 246, 0.2)' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#d8b4fe' }}>Márka Kit Elemzése Weboldal alapján</h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Adja meg a kávézó vagy márka weboldalának címét, és az AI automatikusan kinyeri a színeket, a betűtípust és a hangnemet.</p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <input
              type="text"
              placeholder="Weboldal URL (pl. https://annacafe.hu)"
              value={extractUrl}
              onChange={(e) => setExtractUrl(e.target.value)}
              disabled={isExtracting}
              style={{ flexGrow: 1 }}
            />
            <button
              className="btn-primary"
              disabled={isExtracting || !extractUrl.trim()}
              onClick={() => onExtractBrandKit && onExtractBrandKit(extractUrl)}
              style={{ whiteSpace: 'nowrap' }}
            >
              {isExtracting ? 'Elemzés folyamatban...' : 'Elemzés Indítása'}
            </button>
          </div>
        </div>
        {/* Colors Panel */}
        <div className="glass-panel info-card">
          <div className="card-header">
            <Palette size={20} className="icon-purple" />
            <h3>Színpaletta</h3>
          </div>
          <div className="colors-display">
            <div className="color-bubble-row">
              <div className="color-bubble-item">
                <div className="color-swatch shadow" style={{ backgroundColor: activeKit.colors.primary }} />
                <div className="color-label">
                  <span className="color-name">Elsődleges</span>
                  <span className="color-hex">{activeKit.colors.primary}</span>
                </div>
              </div>
              <div className="color-bubble-item">
                <div className="color-swatch shadow" style={{ backgroundColor: activeKit.colors.secondary, border: '1px solid rgba(255,255,255,0.2)' }} />
                <div className="color-label">
                  <span className="color-name">Másodlagos</span>
                  <span className="color-hex">{activeKit.colors.secondary}</span>
                </div>
              </div>
              <div className="color-bubble-item">
                <div className="color-swatch shadow" style={{ backgroundColor: activeKit.colors.accent }} />
                <div className="color-label">
                  <span className="color-name">Kiemelő</span>
                  <span className="color-hex">{activeKit.colors.accent}</span>
                </div>
              </div>
            </div>
            <div className="rules-box">
              <p className="rules-title">Alkalmazási szabályok:</p>
              <p className="rules-text">{activeKit.colors.rules}</p>
            </div>
          </div>
        </div>

        {/* Typography & Logo Panel */}
        <div className="glass-panel info-card">
          <div className="card-header">
            <Type size={20} className="icon-purple" />
            <h3>Tipográfia & Logó</h3>
          </div>
          <div className="typo-content">
            <div className="typo-details">
              <div className="typo-row">
                <span className="label">Betűtípus:</span>
                <span className="value font-preview-tag" style={{ fontFamily: activeKit.typography.fontName }}>
                  {activeKit.typography.fontName}
                </span>
              </div>
              <div className="typo-row">
                <span className="label">Címsor méret:</span>
                <span className="value">{activeKit.typography.titleSize}</span>
              </div>
              <div className="typo-row">
                <span className="label">Max. sorhossz:</span>
                <span className="value">{activeKit.typography.maxLineLength} karakter</span>
              </div>
              <div className="typo-row">
                <span className="label">Logó pozíció:</span>
                <span className="value text-capitalize">{activeKit.logoPosition.replace('-', ' ')}</span>
              </div>
            </div>

            {/* Accent characters warning/success checker */}
            <div className={`audit-badge ${fontAudit.supported ? 'audit-success' : 'audit-warning'}`}>
              {fontAudit.supported ? (
                <>
                  <Check size={16} />
                  <span>{fontAudit.success}</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={18} />
                  <span>{fontAudit.warning}</span>
                </>
              )}
            </div>

            <div className="sample-text-area" style={{ fontFamily: activeKit.typography.fontName }}>
              <p className="sample-title">Karakter teszt (őűéáí):</p>
              <p className="sample-phrase">Árvíztűrő tükörfúrógép — Ősz és Űrhajó</p>
            </div>
          </div>
        </div>

        {/* Tone of Voice Panel */}
        <div className="glass-panel info-card">
          <div className="card-header">
            <Smile size={20} className="icon-purple" />
            <h3>Márka Hangnem (Tone)</h3>
          </div>
          <div className="tone-content">
            <div className="tags-row">
              {activeKit.tone.map((tag) => (
                <span key={tag} className="tag-pill">
                  {tag}
                </span>
              ))}
            </div>
            <div className="examples-section">
              <div className="example-box good">
                <span className="badge-good">Helyes stílus (Good Example)</span>
                <p>"{activeKit.toneExampleGood}"</p>
              </div>
              <div className="example-box bad">
                <span className="badge-bad">Helytelen stílus (Bad Example)</span>
                <p>"{activeKit.toneExampleBad}"</p>
              </div>
            </div>
          </div>
        </div>

        {/* Image Rules Panel */}
        <div className="glass-panel info-card">
          <div className="card-header">
            <Image size={20} className="icon-purple" />
            <h3>Képi Világ & Negatívok</h3>
          </div>
          <div className="rules-content">
            <div className="visual-rules-box">
              <p className="rules-title">Előírt képi szabályok:</p>
              <ul className="visual-list">
                {activeKit.visualRules.map((rule, idx) => (
                  <li key={idx}>{rule}</li>
                ))}
              </ul>
            </div>
            <div className="negative-prompt-box">
              <p className="rules-title">AI Negatív Prompt (Mit kerüljön el):</p>
              <p className="negative-text">{activeKit.negativePrompt}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Editing Dialog Modal */}
      {isEditing && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel animate-slide-up">
            <div className="modal-header">
              <h3>Brand Kit Módosítása</h3>
              <p className="modal-subtitle">A módosítás új verziót (v{brandKits.length + 1}) hoz létre.</p>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                {/* Colors section */}
                <div className="form-section">
                  <h4 className="section-sub"><Palette size={16} /> Színek</h4>
                  <div className="form-row color-pickers">
                    <div className="field-group">
                      <label>Elsődleges szín</label>
                      <div className="color-picker-wrapper">
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                        />
                        <input
                          type="text"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          maxLength={7}
                        />
                      </div>
                    </div>
                    <div className="field-group">
                      <label>Másodlagos szín</label>
                      <div className="color-picker-wrapper">
                        <input
                          type="color"
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                        />
                        <input
                          type="text"
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                          maxLength={7}
                        />
                      </div>
                    </div>
                    <div className="field-group">
                      <label>Kiemelő szín</label>
                      <div className="color-picker-wrapper">
                        <input
                          type="color"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                        />
                        <input
                          type="text"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                          maxLength={7}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="field-group">
                    <label>Színhasználat szabályai</label>
                    <textarea
                      value={colorRules}
                      onChange={(e) => setColorRules(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>

                {/* Typography section */}
                <div className="form-section">
                  <h4 className="section-sub"><Type size={16} /> Tipográfia</h4>
                  <div className="form-row">
                    <div className="field-group">
                      <label>Betűtípus</label>
                      <select value={fontName} onChange={(e) => setFontName(e.target.value)}>
                        <option value="Montserrat">Montserrat (Modern Sans-serif)</option>
                        <option value="Playfair Display">Playfair Display (Elegant Serif)</option>
                        <option value="Inter">Inter (Clean Neutral)</option>
                        <option value="Caveat">Caveat (Creative Handwriting)</option>
                        <option value="Cinzel">Cinzel (Classic Serif - Missing Glyph Warning)</option>
                      </select>
                    </div>
                    <div className="field-group">
                      <label>Max sorhossz (karakter)</label>
                      <input
                        type="number"
                        value={maxLineLength}
                        onChange={(e) => setMaxLineLength(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  {/* Font audit checker preview directly in modal */}
                  <div className={`modal-audit-preview ${checkFontGlyphSupport(fontName).supported ? 'audit-success' : 'audit-warning'}`}>
                    {checkFontGlyphSupport(fontName).supported ? (
                      <span>✓ Kiváló! A(z) {fontName} font támogatja az ő, ű betűket.</span>
                    ) : (
                      <span>⚠️ Figyelem! A(z) {fontName} font nem támogatja az ő, ű betűket!</span>
                    )}
                  </div>
                </div>

                {/* Tone & Voice section */}
                <div className="form-section">
                  <h4 className="section-sub"><Smile size={16} /> Hangnem (Tone of Voice)</h4>
                  <div className="field-group">
                    <label>Címkék (vesszővel elválasztva)</label>
                    <input
                      type="text"
                      value={toneInput}
                      onChange={(e) => setToneInput(e.target.value)}
                      placeholder="pl. meleg, barátságos, fiatalos"
                    />
                  </div>
                  <div className="field-group">
                    <label>Jó példa a hangnemre</label>
                    <textarea
                      value={toneGood}
                      onChange={(e) => setToneGood(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="field-group">
                    <label>Kerülendő (rossz) példa</label>
                    <textarea
                      value={toneBad}
                      onChange={(e) => setToneBad(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>

                {/* Imagery & Logo section */}
                <div className="form-section">
                  <h4 className="section-sub"><Image size={16} /> Képi Világ & Elrendezés</h4>
                  <div className="form-row">
                    <div className="field-group">
                      <label>Logó pozíciója</label>
                      <select
                        value={logoPosition}
                        onChange={(e) => setLogoPosition(e.target.value as any)}
                      >
                        <option value="top-left">Bal felül (Top Left)</option>
                        <option value="top-right">Jobb felül (Top Right)</option>
                        <option value="bottom-left">Bal alul (Bottom Left)</option>
                        <option value="bottom-right">Jobb alul (Bottom Right)</option>
                      </select>
                    </div>
                  </div>
                  <div className="field-group">
                    <label>Képi szabályok (Nyomj Enter-t a hozzáadáshoz)</label>
                    <div className="rules-editing-box">
                      <ul className="visual-list-edit">
                        {visualRules.map((rule, index) => (
                          <li key={index}>
                            <span>{rule}</span>
                            <button type="button" onClick={() => removeVisualRule(index)}>
                              <Trash2 size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="rule-add-row">
                        <input
                          type="text"
                          value={newRule}
                          onChange={(e) => setNewRule(e.target.value)}
                          placeholder="Új képi szabály (pl. természetes árnyékok)"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addVisualRule();
                            }
                          }}
                        />
                        <button type="button" className="btn-secondary" onClick={addVisualRule}>
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="field-group">
                    <label>AI Negatív Prompt</label>
                    <textarea
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setIsEditing(false)}>
                Mégse
              </button>
              <button className="btn-primary" onClick={handleSave}>
                Mentés Új Verzióként (v{brandKits.length + 1})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Styled component styles local to BrandKitView */}
      <style>{`
        .brand-kit-section {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }
        .subtitle {
          color: var(--text-muted);
          font-size: 14px;
          margin-top: 4px;
        }
        .version-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .select-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .select-icon {
          position: absolute;
          left: 12px;
          color: var(--primary-neon);
          pointer-events: none;
        }
        .version-select {
          padding-left: 36px;
          padding-right: 32px;
          background: rgba(25, 20, 48, 0.6);
          border: 1px solid var(--panel-border);
          border-radius: 8px;
          color: var(--text-main);
          font-weight: 500;
          cursor: pointer;
        }
        .brand-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 20px;
        }
        .info-card {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-height: 250px;
        }
        .card-header {
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 12px;
        }
        .card-header h3 {
          font-size: 16px;
          font-weight: 600;
        }
        .icon-purple {
          color: var(--primary-neon);
          filter: drop-shadow(0 0 4px rgba(139, 92, 246, 0.4));
        }
        .colors-display {
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex-grow: 1;
        }
        .color-bubble-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
        }
        .color-bubble-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          flex: 1;
        }
        .color-swatch {
          width: 100%;
          height: 48px;
          border-radius: 8px;
        }
        .color-label {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .color-name {
          font-size: 11px;
          color: var(--text-muted);
        }
        .color-hex {
          font-size: 12px;
          font-family: monospace;
          font-weight: 600;
        }
        .rules-box {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 10px;
          font-size: 12px;
          border-left: 3px solid var(--primary-neon);
        }
        .rules-title {
          font-weight: 600;
          color: var(--text-main);
          margin-bottom: 4px;
        }
        .rules-text {
          color: var(--text-muted);
          line-height: 1.4;
        }
        .typo-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex-grow: 1;
        }
        .typo-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .typo-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
        }
        .typo-row .label {
          color: var(--text-muted);
        }
        .typo-row .value {
          font-weight: 600;
        }
        .font-preview-tag {
          background: rgba(139, 92, 246, 0.15);
          color: #d8b4fe;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
        }
        .audit-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 11px;
          line-height: 1.4;
        }
        .audit-success {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: #a7f3d0;
        }
        .audit-warning {
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.2);
          color: #fde68a;
        }
        .sample-text-area {
          background: rgba(0, 0, 0, 0.15);
          padding: 10px;
          border-radius: 8px;
          border: 1px dashed rgba(255, 255, 255, 0.05);
        }
        .sample-title {
          font-size: 10px;
          color: var(--text-muted);
          text-transform: uppercase;
          margin-bottom: 2px;
        }
        .sample-phrase {
          font-size: 15px;
          text-align: center;
          padding: 4px 0;
          color: var(--text-main);
        }
        .tags-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .tag-pill {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          color: var(--text-main);
        }
        .examples-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 8px;
        }
        .example-box {
          padding: 10px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.4;
        }
        .example-box.good {
          background: rgba(16, 185, 129, 0.05);
          border: 1px solid rgba(16, 185, 129, 0.15);
          color: #e6fcf5;
        }
        .example-box.bad {
          background: rgba(239, 68, 68, 0.05);
          border: 1px solid rgba(239, 68, 68, 0.15);
          color: #fff5f5;
        }
        .badge-good {
          color: #10b981;
          font-weight: 700;
          display: block;
          margin-bottom: 4px;
          font-size: 10px;
          text-transform: uppercase;
        }
        .badge-bad {
          color: #f87171;
          font-weight: 700;
          display: block;
          margin-bottom: 4px;
          font-size: 10px;
          text-transform: uppercase;
        }
        .visual-rules-box {
          background: rgba(0,0,0,0.15);
          padding: 10px 12px;
          border-radius: 8px;
        }
        .visual-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .visual-list li {
          font-size: 12px;
          color: var(--text-muted);
          position: relative;
          padding-left: 14px;
        }
        .visual-list li::before {
          content: '•';
          color: var(--primary-neon);
          position: absolute;
          left: 0;
          font-weight: bold;
        }
        .negative-prompt-box {
          background: rgba(239, 68, 68, 0.05);
          border-left: 3px solid var(--accent-rose);
          padding: 8px 12px;
          border-radius: 4px;
          margin-top: 10px;
        }
        .negative-text {
          font-size: 11px;
          color: #fca5a5;
          font-family: monospace;
          word-break: break-all;
        }

        /* Modal styling */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          overflow-y: auto;
        }
        .modal-content {
          width: 100%;
          max-width: 680px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          border-color: rgba(139, 92, 246, 0.2);
          max-height: 90vh;
          overflow-y: auto;
        }
        .modal-header h3 {
          font-size: 18px;
          font-weight: 700;
        }
        .modal-subtitle {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 4px;
        }
        .form-grid {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .form-section {
          background: rgba(0,0,0,0.15);
          padding: 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.03);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .section-sub {
          font-size: 14px;
          font-weight: 600;
          color: #d8b4fe;
          display: flex;
          align-items: center;
          gap: 6px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          padding-bottom: 6px;
        }
        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }
        .field-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field-group label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-muted);
        }
        .color-pickers {
          display: flex;
          gap: 12px;
        }
        .color-picker-wrapper {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .color-picker-wrapper input[type="color"] {
          width: 36px;
          height: 36px;
          border: none;
          background: transparent;
          cursor: pointer;
          padding: 0;
          border-radius: 4px;
        }
        .color-picker-wrapper input[type="text"] {
          width: 75px;
          text-align: center;
          padding: 8px;
        }
        .modal-audit-preview {
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 11px;
        }
        .rules-editing-box {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .visual-list-edit {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .visual-list-edit li {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(255,255,255,0.03);
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 12px;
        }
        .visual-list-edit li button {
          background: transparent;
          border: none;
          color: #fca5a5;
          cursor: pointer;
          opacity: 0.7;
          transition: var(--transition-smooth);
        }
        .visual-list-edit li button:hover {
          opacity: 1;
        }
        .rule-add-row {
          display: flex;
          gap: 8px;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 16px;
        }
      `}</style>
    </div>
  );
};
