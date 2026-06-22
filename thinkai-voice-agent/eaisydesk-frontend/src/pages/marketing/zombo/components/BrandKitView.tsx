import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { BrandKit } from '../types';

interface BrandKitViewProps {
  brandKits: BrandKit[];
  activeKitId: string;
  onSelectKit: (id: string) => void;
  onSaveKit: (newKit: BrandKit) => void;
  onExtractBrandKit?: (url: string) => Promise<void>;
  isExtracting?: boolean;
}

const defaultDna = {
  formal_vs_casual: 50,
  rational_vs_emotional: 50,
  modern_vs_traditional: 50,
  simple_vs_technical: 50,
  authority_vs_peer: 50,
  price_segment_score: 50,
  b2b_vs_b2c: 50,
  product_vs_service: 50,
  minimalist_vs_decorative: 50,
  warmth_vs_coolness: 50,
  vibrancy: 50,
  humor_level: 50,
  storytelling_level: 50,
  educational_level: 50,
  promotional_level: 50,
  cta_aggressiveness: 50,
  emoji_usage: 50,
  hashtag_density: 50,
  interaction_asking: 50,
};

/* ─── Read-only DNA bar ─── */
const DnaBar = ({ label, left, right, value }: { label: string; left: string; right: string; value: number }) => {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', background: 'rgba(124,58,237,0.08)', padding: '1px 7px', borderRadius: 4 }}>{v}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: '#9ca3af', minWidth: 64, textAlign: 'right' }}>{left}</span>
        <div style={{ flex: 1, height: 7, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
          <div style={{ height: '100%', width: `${v}%`, background: 'linear-gradient(90deg, #8b5cf6, #6d28d9)', borderRadius: 4, transition: 'width 0.6s ease' }} />
        </div>
        <span style={{ fontSize: 10, color: '#9ca3af', minWidth: 64 }}>{right}</span>
      </div>
    </div>
  );
};

/* ─── Edit DNA slider ─── */
const DnaSlider = ({
  label, left, right, value, onChange,
}: { label: string; left: string; right: string; value: number; onChange: (v: number) => void }) => (
  <div style={{ marginBottom: 12, padding: '10px 12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', background: 'rgba(124,58,237,0.1)', padding: '1px 7px', borderRadius: 4 }}>{value}</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 10, color: '#9ca3af', minWidth: 60, textAlign: 'right', flexShrink: 0 }}>{left}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: '#7c3aed', cursor: 'pointer', height: 4 }}
      />
      <span style={{ fontSize: 10, color: '#9ca3af', minWidth: 60, flexShrink: 0 }}>{right}</span>
    </div>
  </div>
);

/* ─── Section heading inside modal ─── */
const ModalSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', borderBottom: '2px solid #ede9fe', paddingBottom: 8, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
    {children}
  </div>
);

/* ─── Card wrapper ─── */
const Card = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 20px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, borderBottom: '1px solid #f3f4f6', paddingBottom: 12 }}>
      <span style={{ fontSize: 17 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{title}</span>
    </div>
    {children}
  </div>
);

/* ─── Field group ─── */
const FieldGroup = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>{label}</label>
    {children}
  </div>
);

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1.5px solid #d1d5db',
  borderRadius: 8,
  fontSize: 13,
  color: '#111827',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: "'Inter', sans-serif",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: 64,
};

export const BrandKitView: React.FC<BrandKitViewProps> = ({
  brandKits,
  activeKitId,
  onSelectKit,
  onSaveKit,
}) => {
  const activeKit = brandKits.find(k => k.id === activeKitId) || brandKits[brandKits.length - 1];

  const [isEditing, setIsEditing] = useState(false);

  // ── Form state (reset on open) ──
  const [primaryColor, setPrimaryColor] = useState('');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [colorRules, setColorRules] = useState('');

  const [fontName, setFontName] = useState('Montserrat');
  const [maxLineLength, setMaxLineLength] = useState(40);

  const [logoPosition, setLogoPosition] = useState('top-left');
  const [toneInput, setToneInput] = useState('');
  const [toneGood, setToneGood] = useState('');
  const [toneBad, setToneBad] = useState('');

  const [visualRules, setVisualRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');

  // ── DNA sliders ──
  const [formalVsCasual, setFormalVsCasual] = useState(50);
  const [rationalVsEmotional, setRationalVsEmotional] = useState(50);
  const [modernVsTraditional, setModernVsTraditional] = useState(50);
  const [simpleVsTechnical, setSimpleVsTechnical] = useState(50);
  const [authorityVsPeer, setAuthorityVsPeer] = useState(50);
  const [priceSegmentScore, setPriceSegmentScore] = useState(50);
  const [b2bVsB2c, setB2bVsB2c] = useState(50);
  const [productVsService, setProductVsService] = useState(50);
  const [minimalistVsDecorative, setMinimalistVsDecorative] = useState(50);
  const [warmthVsCoolness, setWarmthVsCoolness] = useState(50);
  const [vibrancy, setVibrancy] = useState(50);
  const [humorLevel, setHumorLevel] = useState(50);
  const [storytellingLevel, setStorytellingLevel] = useState(50);
  const [educationalLevel, setEducationalLevel] = useState(50);
  const [promotionalLevel, setPromotionalLevel] = useState(50);
  const [ctaAggressiveness, setCtaAggressiveness] = useState(50);
  const [emojiUsage, setEmojiUsage] = useState(50);
  const [hashtagDensity, setHashtagDensity] = useState(50);
  const [interactionAsking, setInteractionAsking] = useState(50);

  // ── Empty state ──
  if (!activeKit) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎨</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Még nincs Brand Kit</div>
        <div style={{ fontSize: 13 }}>Futtass egy weboldal auditot, és az eredmény alapján automatikusan létrejön az első Brand Kit verzió.</div>
      </div>
    );
  }

  const dna = activeKit.brandDna || defaultDna;

  const handleOpenEdit = () => {
    setPrimaryColor(activeKit.colors?.primary || '#3E2723');
    setSecondaryColor(activeKit.colors?.secondary || '#F5F5DC');
    setAccentColor(activeKit.colors?.accent || '#FF8F00');
    setColorRules(activeKit.colors?.rules || '');
    setFontName(activeKit.typography?.fontName || 'Montserrat');
    setMaxLineLength(activeKit.typography?.maxLineLength || 40);
    setLogoPosition(activeKit.logoPosition || 'top-left');
    setToneInput((activeKit.tone || []).join(', '));
    setToneGood(activeKit.toneExampleGood || '');
    setToneBad(activeKit.toneExampleBad || '');
    setVisualRules([...(activeKit.visualRules || [])]);
    setNegativePrompt(activeKit.negativePrompt || '');

    const d = activeKit.brandDna;
    setFormalVsCasual(d?.formal_vs_casual ?? 50);
    setRationalVsEmotional(d?.rational_vs_emotional ?? 50);
    setModernVsTraditional(d?.modern_vs_traditional ?? 50);
    setSimpleVsTechnical(d?.simple_vs_technical ?? 50);
    setAuthorityVsPeer(d?.authority_vs_peer ?? 50);
    setPriceSegmentScore(d?.price_segment_score ?? 50);
    setB2bVsB2c(d?.b2b_vs_b2c ?? 50);
    setProductVsService(d?.product_vs_service ?? 50);
    setMinimalistVsDecorative(d?.minimalist_vs_decorative ?? 50);
    setWarmthVsCoolness(d?.warmth_vs_coolness ?? 50);
    setVibrancy(d?.vibrancy ?? 50);
    setHumorLevel(d?.humor_level ?? 50);
    setStorytellingLevel(d?.storytelling_level ?? 50);
    setEducationalLevel(d?.educational_level ?? 50);
    setPromotionalLevel(d?.promotional_level ?? 50);
    setCtaAggressiveness(d?.cta_aggressiveness ?? 50);
    setEmojiUsage(d?.emoji_usage ?? 50);
    setHashtagDensity(d?.hashtag_density ?? 50);
    setInteractionAsking(d?.interaction_asking ?? 50);

    setIsEditing(true);
  };

  const handleSave = () => {
    const nextVersion = brandKits.length + 1;
    const newKit: BrandKit = {
      id: `kit-v${nextVersion}`,
      version: nextVersion,
      createdAt: new Date().toISOString(),
      colors: { primary: primaryColor, secondary: secondaryColor, accent: accentColor, rules: colorRules },
      typography: {
        fontName,
        titleSize: activeKit.typography?.titleSize || '48px',
        subtitleSize: activeKit.typography?.subtitleSize || '22px',
        bodySize: activeKit.typography?.bodySize || '15px',
        maxLineLength: Number(maxLineLength),
      },
      logoUrl: activeKit.logoUrl,
      logoPosition,
      tone: toneInput.split(',').map(t => t.trim()).filter(t => t.length > 0),
      toneExampleGood: toneGood,
      toneExampleBad: toneBad,
      visualRules: visualRules.filter(r => r.trim().length > 0),
      negativePrompt,
      brandDna: {
        formal_vs_casual: formalVsCasual,
        rational_vs_emotional: rationalVsEmotional,
        modern_vs_traditional: modernVsTraditional,
        simple_vs_technical: simpleVsTechnical,
        authority_vs_peer: authorityVsPeer,
        price_segment_score: priceSegmentScore,
        b2b_vs_b2c: b2bVsB2c,
        product_vs_service: productVsService,
        minimalist_vs_decorative: minimalistVsDecorative,
        warmth_vs_coolness: warmthVsCoolness,
        vibrancy,
        humor_level: humorLevel,
        storytelling_level: storytellingLevel,
        educational_level: educationalLevel,
        promotional_level: promotionalLevel,
        cta_aggressiveness: ctaAggressiveness,
        emoji_usage: emojiUsage,
        hashtag_density: hashtagDensity,
        interaction_asking: interactionAsking,
      },
    };
    onSaveKit(newKit);
    setIsEditing(false);
  };

  const addRule = () => {
    if (newRule.trim()) {
      setVisualRules(prev => [...prev, newRule.trim()]);
      setNewRule('');
    }
  };

  const removeRule = (i: number) => setVisualRules(prev => prev.filter((_, idx) => idx !== i));

  /* ═══════════════════════════════════════════════════════
     MAIN VIEW
  ═══════════════════════════════════════════════════════ */
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: '#111827' }}>

      {/* ── Header bar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 }}>Márka Kit (Brand Kit)</h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '3px 0 0' }}>A generátor szíve – minden kreativitás forrása</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {brandKits.length > 1 && (
            <select
              value={activeKitId}
              onChange={e => onSelectKit(e.target.value)}
              style={{ ...selectStyle, width: 'auto', paddingLeft: 12, paddingRight: 28, fontSize: 12 }}
            >
              {brandKits.map(kit => (
                <option key={kit.id} value={kit.id}>
                  Verzió {kit.version} – {new Date(kit.createdAt).toLocaleDateString('hu-HU')}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleOpenEdit}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(109,40,217,0.3)',
              transition: 'all 0.2s', fontFamily: "'Inter', sans-serif",
            }}
          >
            ✏️ Szerkesztés
          </button>
        </div>
      </div>

      {/* ── Cards grid: 2 columns on wide, 1 on narrow ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>

        {/* Colors */}
        <Card title="Színpaletta" icon="🎨">
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            {[
              { label: 'Elsődleges', hex: activeKit.colors?.primary },
              { label: 'Másodlagos', hex: activeKit.colors?.secondary },
              { label: 'Kiemelő', hex: activeKit.colors?.accent },
            ].map(c => (
              <div key={c.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: '100%', height: 44, borderRadius: 8, background: c.hex,
                  border: '1px solid rgba(0,0,0,0.1)', boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{c.label}</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#374151' }}>{c.hex}</div>
                </div>
              </div>
            ))}
          </div>
          {activeKit.colors?.rules && (
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderLeft: '3px solid #7c3aed', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#374151' }}>
              {activeKit.colors.rules}
            </div>
          )}
        </Card>

        {/* Typography */}
        <Card title="Tipográfia" icon="🔤">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {[
                ['Betűtípus', activeKit.typography?.fontName],
                ['Max. sorhossz', `${activeKit.typography?.maxLineLength} karakter`],
                ['Logó pozíció', (activeKit.logoPosition || '').replace('-', ' ')],
              ].map(([lbl, val]) => (
                <tr key={lbl as string} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 0', fontSize: 12, color: '#6b7280', fontWeight: 600, width: '45%' }}>{lbl}</td>
                  <td style={{ padding: '8px 0', fontSize: 13, color: '#111827', fontWeight: 600, fontFamily: lbl === 'Betűtípus' ? (val as string) : undefined }}>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Hungarian character test */}
          <div style={{ marginTop: 12, background: '#f9fafb', borderRadius: 6, padding: '8px 12px', fontFamily: activeKit.typography?.fontName }}>
            <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Magyar karakterek:</div>
            <div style={{ fontSize: 14, color: '#374151' }}>Árvíztűrő tükörfúrógép – Ősz, Űrhajó</div>
          </div>
        </Card>

        {/* Tone of Voice */}
        <Card title="Hangnem (Tone of Voice)" icon="🗣️">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {(activeKit.tone || []).map(tag => (
              <span key={tag} style={{ fontSize: 12, padding: '3px 10px', background: '#ede9fe', color: '#5b21b6', borderRadius: 12, fontWeight: 600, border: '1px solid #ddd6fe' }}>{tag}</span>
            ))}
          </div>
          {activeKit.toneExampleGood && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: 12, color: '#166534' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, color: '#15803d' }}>✅ Helyes stílus</div>
              "{activeKit.toneExampleGood}"
            </div>
          )}
          {activeKit.toneExampleBad && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#991b1b' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, color: '#dc2626' }}>❌ Kerülendő stílus</div>
              "{activeKit.toneExampleBad}"
            </div>
          )}
        </Card>

        {/* Visual Rules */}
        <Card title="Képi világ &amp; Negatívok" icon="🖼️">
          {(activeKit.visualRules || []).length > 0 && (
            <ul style={{ margin: '0 0 12px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {activeKit.visualRules.map((rule, i) => (
                <li key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>{rule}</li>
              ))}
            </ul>
          )}
          {activeKit.negativePrompt && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderLeft: '3px solid #ef4444', borderRadius: 6, padding: '8px 12px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>AI Negatív Prompt</div>
              <div style={{ fontSize: 11, color: '#7f1d1d', fontFamily: 'monospace', wordBreak: 'break-word' }}>{activeKit.negativePrompt}</div>
            </div>
          )}
        </Card>

      </div>

      {/* ── Brand DNA full-width card ── */}
      <div style={{ marginTop: 16 }}>
        <Card title="Brand DNA Koordináták" icon="🧬">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0 32px' }}>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #ede9fe', paddingBottom: 6, marginBottom: 12 }}>Hangnem és Kifejezésmód</div>
              <DnaBar label="Formális vs Közvetlen" left="Formális" right="Közvetlen" value={dna.formal_vs_casual} />
              <DnaBar label="Racionális vs Érzelmi" left="Racionális" right="Érzelmes" value={dna.rational_vs_emotional} />
              <DnaBar label="Modern vs Hagyományos" left="Tradicionális" right="Modern" value={dna.modern_vs_traditional} />
              <DnaBar label="Egyszerű vs Szakmai" left="Közérthető" right="Szakmai" value={dna.simple_vs_technical} />
              <DnaBar label="Tekintélyelvű vs Partneri" left="Tekintély" right="Partneri" value={dna.authority_vs_peer} />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #ede9fe', paddingBottom: 6, marginBottom: 12 }}>Vizuális DNS</div>
              <DnaBar label="Minimál vs Díszített" left="Minimál" right="Díszített" value={dna.minimalist_vs_decorative} />
              <DnaBar label="Tónus Melegsége" left="Hideg" right="Meleg" value={dna.warmth_vs_coolness} />
              <DnaBar label="Színélénkség" left="Tompa" right="Élénk" value={dna.vibrancy} />

              <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #ede9fe', paddingBottom: 6, marginBottom: 12, marginTop: 20 }}>Üzleti Profil</div>
              <DnaBar label="Árszegmens" left="Tömeg" right="Prémium" value={dna.price_segment_score} />
              <DnaBar label="B2B vs B2C" left="B2B" right="B2C" value={dna.b2b_vs_b2c} />
              <DnaBar label="Termék vs Szolgáltatás" left="Termék" right="Szolgáltatás" value={dna.product_vs_service} />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #ede9fe', paddingBottom: 6, marginBottom: 12 }}>Tartalom &amp; Hangvétel</div>
              <DnaBar label="Humor / Játékosság" left="Komoly" right="Humoros" value={dna.humor_level} />
              <DnaBar label="Történetmesélés" left="Direkt eladás" right="Storytelling" value={dna.storytelling_level} />
              <DnaBar label="Oktató jelleg" left="Termék fókusz" right="Oktató/Tipp" value={dna.educational_level} />
              <DnaBar label="Promóciós szint" left="Márkaépítés" right="Akciós" value={dna.promotional_level} />

              <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #ede9fe', paddingBottom: 6, marginBottom: 12, marginTop: 20 }}>Interakciós Stílus</div>
              <DnaBar label="CTA Agresszivitás" left="Lágy" right="Agresszív" value={dna.cta_aggressiveness} />
              <DnaBar label="Emoji Használat" left="Mellőzés" right="Sűrű emoji" value={dna.emoji_usage} />
              <DnaBar label="Hashtag Sűrűség" left="Kevés #" right="Sok #" value={dna.hashtag_density} />
              <DnaBar label="Interakció Ösztönzés" left="Kijelentés" right="Kérdező" value={dna.interaction_asking} />
            </div>

          </div>
        </Card>
      </div>

      {/* ── Brand Profile: qualitative data from audit ── */}
      {activeKit.brandProfile && (() => {
        const bp = activeKit.brandProfile!;
        const lf = bp.linguistic_fingerprint;

        const Tag = ({ children, color = '#7c3aed' }: { children: React.ReactNode; color?: string }) => (
          <span style={{ fontSize: 11, padding: '3px 9px', background: `${color}15`, color, borderRadius: 10, fontWeight: 600, border: `1px solid ${color}30`, display: 'inline-block' }}>{children}</span>
        );

        const MiniBar = ({ label, value }: { label: string; value?: number }) => {
          if (!value) return null;
          return (
            <div style={{ marginBottom: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginBottom: 2 }}>
                <span>{label}</span><span style={{ fontWeight: 700, color: '#7c3aed' }}>{value}</span>
              </div>
              <div style={{ height: 5, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${value}%`, background: 'linear-gradient(90deg, #8b5cf6, #6d28d9)', borderRadius: 3 }} />
              </div>
            </div>
          );
        };

        return (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Row 1: Identity + CTA Library */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>

              {/* Brand Identity */}
              <Card title="Brand Személyiség &amp; Identitás" icon="🏛️">
                {bp.brand_archetype && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 14px', background: 'linear-gradient(135deg, #ede9fe, #f5f3ff)', borderRadius: 10, border: '1px solid #ddd6fe' }}>
                    <span style={{ fontSize: 22 }}>🎭</span>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Brand Archetípus</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#4c1d95' }}>{bp.brand_archetype}</div>
                      {bp.alignment_score != null && <div style={{ fontSize: 11, color: '#7c3aed' }}>Alignment score: {bp.alignment_score}/100</div>}
                    </div>
                  </div>
                )}
                {bp.target_audience && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Célközönség</div>
                    <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{bp.target_audience}</div>
                  </div>
                )}
                {bp.price_segment_label && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Árszegmens</div>
                    <Tag color="#3b82f6">{bp.price_segment_label}</Tag>
                  </div>
                )}
                {bp.primary_industry && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Iparág</div>
                    <Tag color="#f59e0b">{bp.primary_industry}</Tag>
                  </div>
                )}
                {bp.addressing?.mode && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Megszólítás</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Tag color="#6366f1">{bp.addressing.mode}</Tag>
                      {bp.addressing.confidence != null && <Tag color="#6366f1">Bizonyosság: {bp.addressing.confidence}%</Tag>}
                    </div>
                    {bp.addressing.evidence && bp.addressing.evidence.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {bp.addressing.evidence.slice(0, 3).map((e, i) => (
                          <span key={i} style={{ fontSize: 10, padding: '2px 7px', background: '#f3f4f6', color: '#6b7280', borderRadius: 5, fontStyle: 'italic', border: '1px solid #e5e7eb' }}>„{e}"</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* CTA Library */}
              {bp.cta_library && (
                <Card title="CTA Könyvtár &amp; Szlogenek" icon="📣">
                  {bp.cta_library.tagline && (
                    <div style={{ textAlign: 'center', padding: '10px 16px', background: 'linear-gradient(135deg, #ede9fe, #f5f3ff)', borderRadius: 10, marginBottom: 14, border: '1px solid #ddd6fe' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Tagline</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#4c1d95', fontStyle: 'italic' }}>„{bp.cta_library.tagline}"</div>
                    </div>
                  )}
                  {bp.cta_library.primary_ctas && bp.cta_library.primary_ctas.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Elsődleges CTA-k</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {bp.cta_library.primary_ctas.map((c, i) => <Tag key={i} color="#7c3aed">{c}</Tag>)}
                      </div>
                    </div>
                  )}
                  {bp.cta_library.secondary_ctas && bp.cta_library.secondary_ctas.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Másodlagos CTA-k</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {bp.cta_library.secondary_ctas.map((c, i) => <Tag key={i} color="#ec4899">{c}</Tag>)}
                      </div>
                    </div>
                  )}
                  {bp.cta_library.slogans && bp.cta_library.slogans.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Szlogenek</div>
                      {bp.cta_library.slogans.map((s, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#374151', fontStyle: 'italic', marginBottom: 3 }}>„{s}"</div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

            </div>

            {/* Row 2: Content Strategy + Linguistic Fingerprint */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>

              {/* Content strategy */}
              <Card title="Tartalom Stratégia &amp; Vizuális Stílus" icon="🎯">
                {bp.key_content_themes && bp.key_content_themes.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Főbb Tartalmi Témák</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {bp.key_content_themes.map((t, i) => <Tag key={i} color="#f59e0b">{t}</Tag>)}
                    </div>
                  </div>
                )}
                {bp.visual_style_tags && bp.visual_style_tags.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Vizuális Stílus Jelzők</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {bp.visual_style_tags.map((t, i) => <Tag key={i} color="#ec4899">{t}</Tag>)}
                    </div>
                  </div>
                )}
                {activeKit.brandDna?.post_length_preference != null && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Poszt Hosszúsági Preferencia</div>
                    <MiniBar label="Rövid ↔ Hosszú" value={activeKit.brandDna.post_length_preference} />
                  </div>
                )}
                {bp.brand_dont && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Brand Don'ts</div>
                    {bp.brand_dont.avoid_tones && bp.brand_dont.avoid_tones.length > 0 && (
                      <div style={{ marginBottom: 5 }}>
                        <span style={{ fontSize: 10, color: '#6b7280', marginRight: 4 }}>Hangnem:</span>
                        {bp.brand_dont.avoid_tones.map((w, i) => <Tag key={i} color="#ef4444">{w}</Tag>)}
                      </div>
                    )}
                    {bp.brand_dont.avoid_words && bp.brand_dont.avoid_words.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {bp.brand_dont.avoid_words.map((w, i) => <Tag key={i} color="#ef4444">{w}</Tag>)}
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* Psycholinguistic fingerprint */}
              {lf && (
                <Card title="Pszicholingvisztikai Ujjlenyomat" icon="🧠">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: 12 }}>
                    <MiniBar label="Kognitív komplexitás" value={lf.cognitive_complexity} />
                    <MiniBar label="Érzelmi intenzitás" value={lf.emotional_intensity} />
                    <MiniBar label="Bizonyosság nyelve" value={lf.certainty_language} />
                    <MiniBar label="Hitelesség" value={lf.authenticity_score} />
                    <MiniBar label="Tekintélyi pozíció" value={lf.clout_score} />
                    <MiniBar label="Analitikus gondolkodás" value={lf.analytical_thinking} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                    {lf.temporal_focus && <Tag color="#8b5cf6">Fókusz: {lf.temporal_focus}</Tag>}
                    {lf.primary_persuasion && <Tag color="#3b82f6">Meggyőzés: {lf.primary_persuasion}</Tag>}
                    {lf.storytelling_structure && <Tag color="#f59e0b">Narratíva: {lf.storytelling_structure}</Tag>}
                    {lf.vocabulary_complexity && <Tag color="#22c55e">Szókincs: {lf.vocabulary_complexity}</Tag>}
                    {lf.dominant_emotions && lf.dominant_emotions.map((e: string, i: number) => <Tag key={i} color="#ec4899">{e}</Tag>)}
                  </div>
                  {lf.power_words && lf.power_words.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Power Words</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(lf.power_words as string[]).map((w, i) => <Tag key={i} color="#22c55e">{w}</Tag>)}
                      </div>
                    </div>
                  )}
                  {lf.opening_patterns && lf.opening_patterns.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Nyitómintázatok</div>
                      {(lf.opening_patterns as string[]).slice(0, 2).map((p, i) => (
                        <div key={i} style={{ fontSize: 11, color: '#374151', fontStyle: 'italic', padding: '3px 8px', background: '#f9fafb', borderRadius: 5, border: '1px solid #e5e7eb', marginBottom: 3 }}>„{p}"</div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

            </div>

          </div>
        );
      })()}

      {/* ════════════════════════════════════════════════════════════════
          EDIT MODAL – rendered via portal into document.body
      ════════════════════════════════════════════════════════════════ */}
      {isEditing && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setIsEditing(false); }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            zIndex: 99999,
            overflowY: 'auto',
            padding: '32px 16px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              maxWidth: 720,
              width: '100%',
              margin: '0 auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              fontFamily: "'Inter', sans-serif",
            }}
          >

            {/* Modal header */}
            <div style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', padding: '20px 28px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>Brand Kit Szerkesztése</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>
                  A mentés új verziót (v{brandKits.length + 1}) hoz létre – az AI generátorok szabályrendszere azonnal frissül.
                </div>
              </div>
              <button
                onClick={() => setIsEditing(false)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 18, lineHeight: 1, cursor: 'pointer', borderRadius: 6, padding: '2px 8px' }}
              >×</button>
            </div>

            {/* Modal body */}
            <div style={{ padding: '24px 28px', overflowY: 'visible' }}>

              <ModalSection title="🎨 Színek">
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  {[
                    { label: 'Elsődleges szín', val: primaryColor, set: setPrimaryColor },
                    { label: 'Másodlagos szín', val: secondaryColor, set: setSecondaryColor },
                    { label: 'Kiemelő szín', val: accentColor, set: setAccentColor },
                  ].map(c => (
                    <div key={c.label} style={{ flex: '1 1 160px', minWidth: 120 }}>
                      <FieldGroup label={c.label}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="color"
                            value={c.val}
                            onChange={e => c.set(e.target.value)}
                            style={{ width: 38, height: 38, border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', padding: 2, background: 'none' }}
                          />
                          <input
                            type="text"
                            value={c.val}
                            maxLength={7}
                            onChange={e => c.set(e.target.value)}
                            style={{ ...inputStyle, width: 90, fontFamily: 'monospace', textAlign: 'center' }}
                          />
                        </div>
                      </FieldGroup>
                    </div>
                  ))}
                </div>
                <FieldGroup label="Színhasználat szabályai">
                  <textarea
                    value={colorRules}
                    onChange={e => setColorRules(e.target.value)}
                    rows={2}
                    style={textareaStyle}
                  />
                </FieldGroup>
              </ModalSection>

              <ModalSection title="🔤 Tipográfia">
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <FieldGroup label="Betűtípus">
                      <select value={fontName} onChange={e => setFontName(e.target.value)} style={selectStyle}>
                        <option value="Montserrat">Montserrat (Modern Sans-serif)</option>
                        <option value="Playfair Display">Playfair Display (Elegant Serif)</option>
                        <option value="Inter">Inter (Clean Neutral)</option>
                        <option value="Caveat">Caveat (Kézírás stílusú)</option>
                        <option value="Outfit">Outfit (Dinamikus Sans)</option>
                      </select>
                    </FieldGroup>
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <FieldGroup label="Max. sorhossz (karakter)">
                      <input type="number" value={maxLineLength} onChange={e => setMaxLineLength(Number(e.target.value))} min={20} max={80} style={inputStyle} />
                    </FieldGroup>
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <FieldGroup label="Logó pozíciója">
                      <select value={logoPosition} onChange={e => setLogoPosition(e.target.value)} style={selectStyle}>
                        <option value="top-left">Bal felül</option>
                        <option value="top-right">Jobb felül</option>
                        <option value="bottom-left">Bal alul</option>
                        <option value="bottom-right">Jobb alul</option>
                      </select>
                    </FieldGroup>
                  </div>
                </div>
                <div style={{ background: '#f9fafb', borderRadius: 8, padding: '8px 14px', fontFamily: fontName, marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Előnézet: </span>
                  <span style={{ fontSize: 14, color: '#374151' }}>Árvíztűrő tükörfúrógép – Ősz és Űrhajó</span>
                </div>
              </ModalSection>

              <ModalSection title="🗣️ Hangnem (Tone of Voice)">
                <FieldGroup label="Hangnem-cipkék (vesszővel elválasztva)">
                  <input
                    type="text"
                    value={toneInput}
                    onChange={e => setToneInput(e.target.value)}
                    placeholder="pl. meleg, barátságos, fiatalos, szakmai"
                    style={inputStyle}
                  />
                </FieldGroup>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <FieldGroup label="Jó példa a hangnemre">
                      <textarea value={toneGood} onChange={e => setToneGood(e.target.value)} rows={3} style={textareaStyle} />
                    </FieldGroup>
                  </div>
                  <div style={{ flex: '1 1 200px' }}>
                    <FieldGroup label="Kerülendő (rossz) példa">
                      <textarea value={toneBad} onChange={e => setToneBad(e.target.value)} rows={3} style={textareaStyle} />
                    </FieldGroup>
                  </div>
                </div>
              </ModalSection>

              <ModalSection title="🖼️ Képi Világ &amp; Negatív Prompt">
                <FieldGroup label="Képi szabályok">
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                    {visualRules.map((rule, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <span style={{ fontSize: 13, color: '#374151' }}>{rule}</span>
                        <button onClick={() => removeRule(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13, padding: '2px 6px' }}>✕</button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, padding: 8 }}>
                      <input
                        type="text"
                        value={newRule}
                        onChange={e => setNewRule(e.target.value)}
                        placeholder="Új képi szabály..."
                        style={{ ...inputStyle, flex: 1 }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRule(); } }}
                      />
                      <button
                        onClick={addRule}
                        style={{ padding: '9px 14px', background: '#ede9fe', color: '#5b21b6', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}
                      >+ Hozzáad</button>
                    </div>
                  </div>
                </FieldGroup>
                <FieldGroup label="AI Negatív Prompt">
                  <textarea
                    value={negativePrompt}
                    onChange={e => setNegativePrompt(e.target.value)}
                    rows={2}
                    style={textareaStyle}
                    placeholder="pl. people, faces, text overlay, neon lights"
                  />
                </FieldGroup>
              </ModalSection>

              <ModalSection title="🧬 Brand DNA Koordináták">
                <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, lineHeight: 1.5 }}>
                  Húzd a csúszkákat a márka karakter pontosabb beállításához. Ezek az értékek irányítják az AI szöveg- és képgenerálást.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0 24px' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Hangnem &amp; Kifejezésmód</div>
                    <DnaSlider label="Formális vs Közvetlen" left="Formális" right="Közvetlen" value={formalVsCasual} onChange={setFormalVsCasual} />
                    <DnaSlider label="Racionális vs Érzelmes" left="Racionális" right="Érzelmes" value={rationalVsEmotional} onChange={setRationalVsEmotional} />
                    <DnaSlider label="Modern vs Hagyományos" left="Tradicionális" right="Modern" value={modernVsTraditional} onChange={setModernVsTraditional} />
                    <DnaSlider label="Egyszerű vs Szakmai" left="Közérthető" right="Szakmai" value={simpleVsTechnical} onChange={setSimpleVsTechnical} />
                    <DnaSlider label="Tekintélyelvű vs Partneri" left="Tekintély" right="Partneri" value={authorityVsPeer} onChange={setAuthorityVsPeer} />
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Vizuális DNS</div>
                    <DnaSlider label="Minimál vs Díszített" left="Minimál" right="Díszített" value={minimalistVsDecorative} onChange={setMinimalistVsDecorative} />
                    <DnaSlider label="Tónus Melegsége" left="Hideg" right="Meleg" value={warmthVsCoolness} onChange={setWarmthVsCoolness} />
                    <DnaSlider label="Színélénkség (Vibrancy)" left="Tompa" right="Élénk" value={vibrancy} onChange={setVibrancy} />

                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, marginTop: 20 }}>Üzleti Profil</div>
                    <DnaSlider label="Árszegmens" left="Tömeg" right="Prémium" value={priceSegmentScore} onChange={setPriceSegmentScore} />
                    <DnaSlider label="B2B vs B2C" left="B2B" right="B2C" value={b2bVsB2c} onChange={setB2bVsB2c} />
                    <DnaSlider label="Termék vs Szolgáltatás" left="Termék" right="Szolgáltatás" value={productVsService} onChange={setProductVsService} />
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Tartalom &amp; Hangvétel</div>
                    <DnaSlider label="Humor / Játékosság" left="Komoly" right="Humoros" value={humorLevel} onChange={setHumorLevel} />
                    <DnaSlider label="Történetmesélés szintje" left="Direkt eladás" right="Storytelling" value={storytellingLevel} onChange={setStorytellingLevel} />
                    <DnaSlider label="Oktató jelleg" left="Termék fókusz" right="Oktató/Tipp" value={educationalLevel} onChange={setEducationalLevel} />
                    <DnaSlider label="Promóciós szint" left="Márkaépítés" right="Akciós ajánlat" value={promotionalLevel} onChange={setPromotionalLevel} />

                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, marginTop: 20 }}>Interakciós Stílus</div>
                    <DnaSlider label="CTA Agresszivitás" left="Lágy ösztönzés" right="Agresszív CTA" value={ctaAggressiveness} onChange={setCtaAggressiveness} />
                    <DnaSlider label="Emoji Használat" left="Mellőzés" right="Sűrű emoji" value={emojiUsage} onChange={setEmojiUsage} />
                    <DnaSlider label="Hashtag Sűrűség" left="Kevés #" right="Sok #" value={hashtagDensity} onChange={setHashtagDensity} />
                    <DnaSlider label="Interakció Ösztönzés" left="Kijelentés" right="Kérdező" value={interactionAsking} onChange={setInteractionAsking} />
                  </div>
                </div>
              </ModalSection>

            </div>

            {/* Modal footer */}
            <div style={{ padding: '16px 28px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setIsEditing(false)}
                style={{
                  padding: '10px 20px', border: '1.5px solid #d1d5db', borderRadius: 8,
                  background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                }}
              >Mégse</button>
              <button
                onClick={handleSave}
                style={{
                  padding: '10px 24px',
                  background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                  color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                  boxShadow: '0 2px 8px rgba(109,40,217,0.35)',
                }}
              >💾 Mentés – v{brandKits.length + 1}</button>
            </div>

          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default BrandKitView;
