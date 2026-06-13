/**
 * ZomboAuditPage – Full website audit with multi-agent AI analysis.
 * Ported from elemzes.html to React with tabbed layout.
 */
import { useState, useCallback, useRef } from 'react';
import { getToken } from '../../api/client';
import { showToast } from '../../components/ui/Toast';

/* ════════════════════════════════ Types ════════════════════════════════ */

interface SeoData {
  score: number; title: string; description: string;
  h1_count: number; h2_count: number; h3_count: number;
  total_images: number; missing_alt: number;
  total_links: number; internal_links: number; external_links: number;
  has_robots: boolean; has_sitemap: boolean;
  lang_val: string; has_lang: boolean;
  has_schema: boolean; has_viewport: boolean; is_https: boolean;
  deductions: string[]; deductions_detail: { criterion: string; points: number; reason: string; recommendation?: string; status: string }[];
}

interface VisualsData {
  visual_tone: string; warm_pct: number; cool_pct: number; neutral_pct: number;
  top_colors_detail: { hex: string; pct: number }[];
  image_colors: string[];
  visual_style_description: string;
}

interface ContentData {
  word_count: number; business_category: string; tone: string; summary: string; seo_advice: string;
}

interface MarketingAudit {
  marketing_score: number; value_proposition_evaluation: string;
  frameworks_analysis: { pas_alignment: string; aida_alignment: string };
  cta_evaluation: string; credibility_evaluation: string;
  copy_recommendations: string[];
}

interface BrandPersonality {
  brand_archetype: string; alignment_score: number; brand_archetype_reasoning: string;
  alignment_reasoning: string; target_audience: string; personality_summary: string;
  brand_voice: string[];
  brand_coordinates: {
    tone: Record<string, number>;
    business: Record<string, number> & { price_segment_label?: string };
    visual: Record<string, number> & { visual_style_tags?: string[] };
    content: Record<string, number> & { primary_industry?: string; key_content_themes?: string[] };
    engagement: Record<string, number>;
  };
  addressing: { mode: string; confidence: number; evidence: string[] };
  cta_library: { primary_ctas: string[]; secondary_ctas: string[]; slogans: string[]; tagline: string };
  brand_dont: { avoid_words: string[]; avoid_topics: string[]; avoid_tones: string[] };
}

interface ContactData {
  company_name: string; address: string; phone: string; email: string;
  social_links: Record<string, string>;
}

interface ProductData {
  name: string; brand: string; price: string; description: string; page_url: string;
}

interface AuditResult {
  url: string;
  seo: SeoData;
  visuals: VisualsData;
  content: ContentData;
  marketing_audit: MarketingAudit;
  brand_personality: BrandPersonality;
  contact: ContactData;
  products: ProductData[];
  scraper_json: unknown;
}

/* ════════════════════════════════ Helpers ════════════════════════════════ */

const DnaBar = ({ label, leftLabel, rightLabel, value }: { label: string; leftLabel: string; rightLabel: string; value: number }) => {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
        <span style={{ fontWeight: 600, minWidth: 70 }}>{leftLabel}</span>
        <span style={{ fontWeight: 700, color: '#8b5cf6', fontSize: 12, background: 'rgba(139,92,246,0.08)', padding: '1px 6px', borderRadius: 4 }}>{v}</span>
        <span style={{ fontWeight: 600, minWidth: 70, textAlign: 'right' }}>{rightLabel}</span>
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 3 }}>{label}</div>
      <div style={{ height: 8, background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ height: '100%', borderRadius: 6, background: 'linear-gradient(90deg, rgba(139,92,246,0.6), rgba(139,92,246,1))', width: `${v}%`, transition: 'width 0.8s cubic-bezier(0.22,1,0.36,1)', minWidth: 2 }} />
      </div>
    </div>
  );
};

const Tag = ({ children, color = '#8b5cf6' }: { children: React.ReactNode; color?: string }) => (
  <span style={{ fontSize: 11, padding: '3px 8px', background: `${color}14`, color, borderRadius: 6, border: `1px solid ${color}25`, fontWeight: 600, fontFamily: 'monospace' }}>{children}</span>
);

const InfoRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <tr style={{ borderBottom: '1px solid var(--border)' }}>
    <td style={{ padding: '12px 8px', fontWeight: 600, fontSize: 13, color: 'var(--text)', width: 180, verticalAlign: 'top' }}>{label}</td>
    <td style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text)' }}>{children}</td>
  </tr>
);

const SectionCard = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
  <div style={{ background: 'var(--card, #fff)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 18 }}>
    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 18 }}>{icon}</span> {title}
    </div>
    {children}
  </div>
);

const ScoreBadge = ({ score }: { score: number }) => {
  const bg = score >= 80 ? 'rgba(34,197,94,0.1)' : score >= 50 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const label = score >= 80 ? 'Kiváló' : score >= 50 ? 'Közepes' : 'Gyenge';
  return <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: bg, color }}>{label}</span>;
};

/* ══════════════════════════════ TABS ══════════════════════════════ */
const TABS = [
  { id: 'seo', label: '🔍 SEO Audit' },
  { id: 'visual', label: '🎨 Vizuális' },
  { id: 'content', label: '📝 Tartalom' },
  { id: 'marketing', label: '📣 Marketing' },
  { id: 'brand', label: '🧬 Brand DNA' },
  { id: 'contact', label: '📇 Kontakt' },
  { id: 'products', label: '📦 Termékek' },
  { id: 'generate', label: '✨ AI Generálás' },
  { id: 'raw', label: '{ } JSON' },
];

/* ════════════════════════════════ Component ════════════════════════════════ */

export default function ZomboAuditPage() {
  const [url, setUrl] = useState('');
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [activeTab, setActiveTab] = useState('seo');
  const [productSearch, setProductSearch] = useState('');
  const [productBrand, setProductBrand] = useState('');

  // AI generation states
  const [genPostPrompt, setGenPostPrompt] = useState('');
  const [genPostPlatform, setGenPostPlatform] = useState('instagram');
  const [genPostResult, setGenPostResult] = useState('');
  const [genPostLoading, setGenPostLoading] = useState(false);
  const [genImgPrompt, setGenImgPrompt] = useState('');
  const [genImgResult, setGenImgResult] = useState('');
  const [genImgPromptUsed, setGenImgPromptUsed] = useState('');
  const [genImgLoading, setGenImgLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  /* ── URL Validation ── */
  const isValidUrl = useCallback((v: string) => {
    if (!v.trim()) return false;
    return /^(https?:\/\/)?[\da-z.-]+\.[a-z.]{2,6}([/\w .-]*)*\/?$/i.test(v.trim());
  }, []);

  /* ── Streaming Scrape ── */
  const handleSubmit = useCallback(async () => {
    let submitUrl = url.trim();
    if (!submitUrl) { showToast('Adj meg egy URL-t!', 'error'); return; }

    // Auto-strip query/hash
    try {
      let temp = submitUrl;
      if (!/^https?:\/\//i.test(temp)) temp = 'https://' + temp;
      const parsed = new URL(temp);
      submitUrl = parsed.origin + parsed.pathname;
    } catch { /* keep as is */ }

    setLoading(true);
    setProgress('Kapcsolódás a szerverhez...');
    setResult(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const token = getToken();
      const response = await fetch('/marketing/api/zombo/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ url: submitUrl, limit }),
        signal: ctrl.signal,
      });

      if (!response.ok) throw new Error('Kapcsolódási hiba az elemző szerverhez.');

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.step === 'error') throw new Error(event.message);
            if (event.message) setProgress(event.message);
            if (event.step === 'complete' && event.data) {
              const data = event.data;
              // Parse scraper_json if string
              if (typeof data.scraper_json === 'string') {
                try { data.scraper_json = JSON.parse(data.scraper_json); } catch { /* keep as string */ }
              }
              setResult(data);
              setActiveTab('seo');
              showToast('Elemzés kész!');
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              // JSON parse error on one line — skip
            } else {
              throw e; // rethrow server errors and connection errors
            }
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        showToast(`Hiba: ${(e as Error).message}`, 'error');
      }
    }
    setLoading(false);
    setProgress('');
  }, [url, limit]);

  /* ── AI Post Generation ── */
  const handleGenPost = useCallback(async () => {
    if (!genPostPrompt.trim()) { showToast('Adj meg egy prompt-ot!', 'error'); return; }
    setGenPostLoading(true);
    try {
      const token = getToken();
      const resp = await fetch('/marketing/api/zombo/generate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ prompt: genPostPrompt, platform: genPostPlatform }),
      });
      const data = await resp.json();
      if (data.error) { showToast(data.error, 'error'); }
      else { setGenPostResult(data.post || ''); showToast('Poszt generálva!'); }
    } catch (e) { showToast('Hiba: ' + (e as Error).message, 'error'); }
    setGenPostLoading(false);
  }, [genPostPrompt, genPostPlatform]);

  /* ── AI Image Generation ── */
  const handleGenImage = useCallback(async () => {
    if (!genImgPrompt.trim()) { showToast('Adj meg egy prompt-ot!', 'error'); return; }
    setGenImgLoading(true);
    try {
      const token = getToken();
      const resp = await fetch('/marketing/api/zombo/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ prompt: genImgPrompt }),
      });
      const data = await resp.json();
      if (data.error) { showToast(data.error, 'error'); }
      else {
        setGenImgResult('data:image/png;base64,' + data.image_base64);
        setGenImgPromptUsed(data.prompt_used || '');
        showToast('Kép generálva!');
      }
    } catch (e) { showToast('Hiba: ' + (e as Error).message, 'error'); }
    setGenImgLoading(false);
  }, [genImgPrompt]);

  /* ── Products Filter ── */
  const filteredProducts = (result?.products || []).filter(p => {
    const q = productSearch.toLowerCase();
    const matchSearch = !q || (p.name?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
    const matchBrand = !productBrand || p.brand?.trim() === productBrand;
    return matchSearch && matchBrand;
  });
  const productBrands = [...new Set((result?.products || []).map(p => p.brand).filter(Boolean))];

  /* ══════════════════════════════ RENDER ══════════════════════════════ */

  const renderTabContent = () => {
    if (!result) return null;
    const d = result;

    switch (activeTab) {
      /* ──────── SEO AUDIT ──────── */
      case 'seo': {
        const seo = d.seo || {} as SeoData;
        let targetOrigin = '';
        try { targetOrigin = new URL(d.url).origin; } catch { targetOrigin = d.url; }
        const headings = typeof d.scraper_json === 'object' && d.scraper_json ? (d.scraper_json as Record<string, unknown>).headings as { h1?: string[] } | undefined : undefined;
        const h1s = headings?.h1 || [];

        return (
          <>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>SEO Audit Pontszám</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {seo.score} pont <ScoreBadge score={seo.score} />
                </div>
              </div>
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Szavak száma</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginTop: 8 }}>{d.content?.word_count ?? '—'} szó</div>
              </div>
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vizuális hangulat</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginTop: 8 }}>{d.visuals?.visual_tone ?? '—'}</div>
              </div>
            </div>

            {/* SEO Detail Table */}
            <SectionCard title="SEO Részletes Elemzés" icon="📊">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <InfoRow label="Meta Title">
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>"{seo.title || 'Nincs megadva'}"</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hosszúság: {(seo.title || '').length} karakter (ajánlott: 50-60)</div>
                  </InfoRow>
                  <InfoRow label="Meta Description">
                    <div style={{ lineHeight: 1.4, marginBottom: 2 }}>"{seo.description || 'Nincs megadva'}"</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hosszúság: {(seo.description || '').length} karakter (ajánlott: 120-160)</div>
                  </InfoRow>
                  <InfoRow label="Címsorok (H1-H3)">
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span><strong>H1:</strong> {seo.h1_count} db</span>
                      <span><strong>H2:</strong> {seo.h2_count || 0} db</span>
                      <span><strong>H3:</strong> {seo.h3_count || 0} db</span>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, marginTop: 8, color: 'var(--text-muted)' }}>Megtalált H1 címsorok:</div>
                    {h1s.length > 0 ? h1s.map((h, i) => (
                      <div key={i} style={{ fontFamily: 'monospace', background: 'var(--bg3)', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', marginTop: 4, fontSize: 11, color: 'var(--text)' }}>{h}</div>
                    )) : <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>⚠️ Nincs H1 címsor az oldalon!</div>}
                  </InfoRow>
                  <InfoRow label="Képek">
                    <div>Összesen: {seo.total_images} kép</div>
                    {seo.missing_alt > 0
                      ? <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>⚠️ {seo.missing_alt} képnél hiányzik az 'alt' leíró szöveg!</div>
                      : <div style={{ color: '#22c55e', fontSize: 11, marginTop: 2 }}>✅ Minden kép rendelkezik 'alt' leíróval.</div>
                    }
                  </InfoRow>
                  <InfoRow label="Linkek">
                    <div>Összesen: {seo.total_links} link</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Belső linkek: {seo.internal_links} db | Külső linkek: {seo.external_links} db</div>
                  </InfoRow>
                  <InfoRow label="Robots & Sitemap">
                    <div style={{ marginBottom: 8 }}>
                      <strong>robots.txt:</strong>{' '}
                      {seo.has_robots ? <span style={{ color: '#22c55e', fontWeight: 600 }}>✅ Elérhető</span> : <span style={{ color: '#ef4444', fontWeight: 600 }}>❌ Nem található</span>}
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', wordBreak: 'break-all', marginTop: 2 }}>
                        <a href={`${targetOrigin}/robots.txt`} target="_blank" rel="noreferrer" style={{ color: '#8b5cf6', textDecoration: 'none', fontWeight: 600 }}>{targetOrigin}/robots.txt</a>
                      </div>
                    </div>
                    <div>
                      <strong>sitemap.xml:</strong>{' '}
                      {seo.has_sitemap ? <span style={{ color: '#22c55e', fontWeight: 600 }}>✅ Elérhető</span> : <span style={{ color: '#ef4444', fontWeight: 600 }}>❌ Nem található</span>}
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', wordBreak: 'break-all', marginTop: 2 }}>
                        <a href={`${targetOrigin}/sitemap.xml`} target="_blank" rel="noreferrer" style={{ color: '#8b5cf6', textDecoration: 'none', fontWeight: 600 }}>{targetOrigin}/sitemap.xml</a>
                      </div>
                    </div>
                  </InfoRow>
                  <InfoRow label="Nyelvi beállítások">
                    <div>HTML 'lang' attribútum: <strong>"{seo.lang_val || 'Nincs megadva'}"</strong></div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {seo.has_lang ? '✅ Megfelelő nyelvi deklaráció.' : '❌ Hiányzó nyelvi deklaráció a <html> tagen.'}
                    </div>
                  </InfoRow>
                  <InfoRow label="Schema Markup (JSON-LD)">
                    {seo.has_schema
                      ? <span style={{ color: '#22c55e', fontWeight: 600 }}>✅ Megtalálva az oldalon</span>
                      : <span style={{ color: '#ef4444', fontWeight: 600 }}>❌ Nincs strukturált adat (JSON-LD)</span>}
                  </InfoRow>
                  <InfoRow label="Mobilbarát">
                    {seo.has_viewport
                      ? <span style={{ color: '#22c55e', fontWeight: 600 }}>✅ Megfelelő (viewport meta tag létezik)</span>
                      : <span style={{ color: '#ef4444', fontWeight: 600 }}>❌ Nem megfelelő (hiányzik a viewport tag)</span>}
                  </InfoRow>
                  <InfoRow label="Biztonság (HTTPS)">
                    {seo.is_https
                      ? <span style={{ color: '#22c55e', fontWeight: 600 }}>✅ SSL Tanúsítvány (HTTPS)</span>
                      : <span style={{ color: '#ef4444', fontWeight: 600 }}>❌ Nem biztonságos kapcsolat (HTTP)</span>}
                  </InfoRow>
                  <InfoRow label={seo.deductions?.length > 0 ? '⚠️ Hibák / Riasztások' : '✅ Hibák / Riasztások'}>
                    {seo.deductions?.length > 0
                      ? <ul style={{ color: '#ef4444', fontSize: 12, paddingLeft: 16, lineHeight: 1.4, margin: 0 }}>{seo.deductions.map((d, i) => <li key={i} style={{ marginBottom: 4 }}>{d}</li>)}</ul>
                      : <span style={{ color: '#22c55e', fontWeight: 600 }}>Nem találtunk kritikus SEO hibát az oldalon!</span>}
                  </InfoRow>
                </tbody>
              </table>
            </SectionCard>

            {/* Score Math */}
            {seo.deductions_detail && seo.deductions_detail.length > 0 && (
              <SectionCard title="SEO Pontszám Számítás" icon="🧮">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'var(--bg3)', borderRadius: 8, fontWeight: 600, border: '1px solid var(--border)', fontSize: 13, marginBottom: 8 }}>
                  <span>Kiinduló pontszám</span>
                  <span style={{ color: 'var(--text-muted)' }}>0 pont</span>
                </div>
                {seo.deductions_detail.map((dd, i) => {
                  const isGood = dd.status === 'good';
                  const color = isGood ? '#22c55e' : '#ef4444';
                  const badgeBg = isGood ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)';
                  const sign = dd.points > 0 ? '+' : '';
                  return (
                    <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, background: badgeBg, borderRadius: 10, marginBottom: 8, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600, marginBottom: 4 }}>
                        <span style={{ color: 'var(--text)' }}>{dd.criterion}</span>
                        <span style={{ color, fontWeight: 700 }}>{sign}{dd.points} pont</span>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.4 }}>{dd.reason}</div>
                      {!isGood && dd.recommendation && (
                        <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg)', borderLeft: '3.5px solid #8b5cf6', borderRadius: '0 6px 6px 0', fontSize: 12, color: 'var(--text)', fontStyle: 'italic' }}>
                          <strong>Javaslat:</strong> {dd.recommendation}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(139,92,246,0.08)', borderRadius: 10, fontWeight: 700, fontSize: 14, border: '1.5px solid rgba(139,92,246,0.25)', marginTop: 12 }}>
                  <span>Végeredmény (SEO Pontszám)</span>
                  <span style={{ color: '#8b5cf6', fontSize: 16 }}>{seo.score} pont</span>
                </div>
              </SectionCard>
            )}
          </>
        );
      }

      /* ──────── VISUAL ──────── */
      case 'visual': {
        const vis = d.visuals || {} as VisualsData;
        return (
          <>
            <SectionCard title="Szín Elemzés" icon="🎨">
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Hangulat eloszlás</div>
                <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                  <div><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Meleg</span> <span style={{ fontWeight: 700 }}>{vis.warm_pct}%</span></div>
                  <div><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hideg</span> <span style={{ fontWeight: 700 }}>{vis.cool_pct}%</span></div>
                  <div><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Semleges</span> <span style={{ fontWeight: 700 }}>{vis.neutral_pct}%</span></div>
                </div>
                <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{ width: `${vis.warm_pct}%`, background: 'linear-gradient(90deg, #ef4444, #f97316)', transition: 'width 0.6s' }} />
                  <div style={{ width: `${vis.cool_pct}%`, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', transition: 'width 0.6s' }} />
                  <div style={{ width: `${vis.neutral_pct}%`, background: '#94a3b8', transition: 'width 0.6s' }} />
                </div>
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, marginTop: 20 }}>Weboldal Színpaletta</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                {(vis.top_colors_detail || []).map((c, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}
                    onClick={() => { navigator.clipboard.writeText(c.hex); showToast('Színkód másolva: ' + c.hex); }} title="Kattints a másoláshoz">
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: c.hex, border: '2px solid var(--border)', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', transition: 'transform 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')} onMouseLeave={e => (e.currentTarget.style.transform = 'none')} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{c.pct}%</span>
                    <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{c.hex}</span>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Kép Alapú Színek</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                {(vis.image_colors || []).length > 0 ? vis.image_colors.map((hex, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}
                    onClick={() => { navigator.clipboard.writeText(hex); showToast('Kép színkód másolva: ' + hex); }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: hex, border: '2px solid var(--border)', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }} />
                    <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: 6 }}>{hex}</span>
                  </div>
                )) : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12 }}>Nem észlelhető kép színadat.</span>}
              </div>
            </SectionCard>

            <SectionCard title="Vizuális Stílus" icon="✨">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Hangulat: {vis.visual_tone}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{vis.visual_style_description || 'Nem áll rendelkezésre vizuális stíluselemzés.'}</div>
            </SectionCard>
          </>
        );
      }

      /* ──────── CONTENT ──────── */
      case 'content': {
        const c = d.content || {} as ContentData;
        return (
          <SectionCard title="AI Tartalom Elemzés" icon="🤖">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div style={{ padding: 16, background: 'var(--bg3)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.5px' }}>Üzleti Kategória</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{c.business_category || '—'}</div>
              </div>
              <div style={{ padding: 16, background: 'var(--bg3)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.5px' }}>Hangnem</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{c.tone || '—'}</div>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>📋 Összefoglaló</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)' }}>{c.summary || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>💡 SEO Tanács</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)' }}>{c.seo_advice || '—'}</div>
            </div>
          </SectionCard>
        );
      }

      /* ──────── MARKETING ──────── */
      case 'marketing': {
        const m = d.marketing_audit || {} as MarketingAudit;
        return (
          <SectionCard title="Marketing & Copywriting Audit" icon="📣">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#8b5cf6' }}>{m.marketing_score || 0}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>/ 100 Marketing Pontszám</div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <InfoRow label="Értékajánlat">{m.value_proposition_evaluation || '—'}</InfoRow>
                <InfoRow label="PAS Keretrendszer">{m.frameworks_analysis?.pas_alignment || '—'}</InfoRow>
                <InfoRow label="AIDA Keretrendszer">{m.frameworks_analysis?.aida_alignment || '—'}</InfoRow>
                <InfoRow label="CTA Értékelés">{m.cta_evaluation || '—'}</InfoRow>
                <InfoRow label="Hitelesség">{m.credibility_evaluation || '—'}</InfoRow>
              </tbody>
            </table>

            {m.copy_recommendations && m.copy_recommendations.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>💡 Javaslatok</div>
                <ul style={{ paddingLeft: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {m.copy_recommendations.map((r, i) => <li key={i} style={{ marginBottom: 4 }}>{r}</li>)}
                </ul>
              </div>
            )}
          </SectionCard>
        );
      }

      /* ──────── BRAND DNA ──────── */
      case 'brand': {
        const bp = d.brand_personality || {} as BrandPersonality;
        const coords = bp.brand_coordinates || { tone: {}, business: {}, visual: {}, content: {}, engagement: {} };
        const addr = bp.addressing || {};
        const cta = bp.cta_library || {} as BrandPersonality['cta_library'];
        const dont = bp.brand_dont || {} as BrandPersonality['brand_dont'];

        return (
          <>
            {/* Brand Overview */}
            <SectionCard title="Brand Személyiség" icon="🧬">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div style={{ padding: 16, background: 'var(--bg3)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>Archetípus</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#8b5cf6', marginTop: 6 }}>{bp.brand_archetype || '—'}</div>
                </div>
                <div style={{ padding: 16, background: 'var(--bg3)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>Alignment Score</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#8b5cf6', marginTop: 6 }}>{bp.alignment_score || 0} pont</div>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <InfoRow label="Archetípus indoklás">{bp.brand_archetype_reasoning || '—'}</InfoRow>
                  <InfoRow label="Alignment indoklás">{bp.alignment_reasoning || '—'}</InfoRow>
                  <InfoRow label="Célközönség">{bp.target_audience || '—'}</InfoRow>
                  <InfoRow label="Összefoglaló">{bp.personality_summary || '—'}</InfoRow>
                  <InfoRow label="Brand Hang">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(bp.brand_voice || []).map((v, i) => <Tag key={i}>{v}</Tag>)}
                      {(!bp.brand_voice || bp.brand_voice.length === 0) && <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>}
                    </div>
                  </InfoRow>
                </tbody>
              </table>
            </SectionCard>

            {/* Brand DNA Coordinates */}
            <SectionCard title="Brand DNA Koordináták" icon="📐">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* Tone */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>🎭 Hangnem</div>
                  <DnaBar label="formal_vs_casual" leftLabel="Formális" rightLabel="Laza" value={coords.tone?.formal_vs_casual} />
                  <DnaBar label="rational_vs_emotional" leftLabel="Racionális" rightLabel="Érzelmi" value={coords.tone?.rational_vs_emotional} />
                  <DnaBar label="modern_vs_traditional" leftLabel="Modern" rightLabel="Tradícionális" value={coords.tone?.modern_vs_traditional} />
                  <DnaBar label="simple_vs_technical" leftLabel="Egyszerű" rightLabel="Technikai" value={coords.tone?.simple_vs_technical} />
                  <DnaBar label="authority_vs_peer" leftLabel="Tekintély" rightLabel="Egyenrangú" value={coords.tone?.authority_vs_peer} />
                </div>

                {/* Business */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>💼 Üzleti</div>
                  <DnaBar label="price_segment_score" leftLabel="Olcsó" rightLabel="Prémium" value={coords.business?.price_segment_score} />
                  {coords.business?.price_segment_label && <div style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600, marginBottom: 8 }}>Ár szegmens: {coords.business.price_segment_label}</div>}
                  <DnaBar label="b2b_vs_b2c" leftLabel="B2B" rightLabel="B2C" value={coords.business?.b2b_vs_b2c} />
                  <DnaBar label="product_vs_service" leftLabel="Termék" rightLabel="Szolgáltatás" value={coords.business?.product_vs_service} />
                </div>

                {/* Visual */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>🎨 Vizuális</div>
                  <DnaBar label="minimalist_vs_decorative" leftLabel="Minimalista" rightLabel="Dekoratív" value={coords.visual?.minimalist_vs_decorative} />
                  <DnaBar label="warmth_vs_coolness" leftLabel="Meleg" rightLabel="Hideg" value={coords.visual?.warmth_vs_coolness} />
                  <DnaBar label="vibrancy" leftLabel="Visszafogott" rightLabel="Vibráló" value={coords.visual?.vibrancy} />
                  {coords.visual?.visual_style_tags && coords.visual.visual_style_tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {coords.visual.visual_style_tags.map((t, i) => <Tag key={i}>{t}</Tag>)}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>📝 Tartalom</div>
                  {coords.content?.primary_industry && <div style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600, marginBottom: 8 }}>Iparág: {coords.content.primary_industry}</div>}
                  {coords.content?.key_content_themes && coords.content.key_content_themes.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                      {coords.content.key_content_themes.map((t, i) => <Tag key={i} color="#ec4899">{t}</Tag>)}
                    </div>
                  )}
                  <DnaBar label="humor_level" leftLabel="Komolyság" rightLabel="Humor" value={coords.content?.humor_level} />
                  <DnaBar label="storytelling_level" leftLabel="Direkt" rightLabel="Történetmesélő" value={coords.content?.storytelling_level} />
                  <DnaBar label="educational_level" leftLabel="Szórakoztató" rightLabel="Oktató" value={coords.content?.educational_level} />
                  <DnaBar label="promotional_level" leftLabel="Informatív" rightLabel="Promóciós" value={coords.content?.promotional_level} />
                </div>

                {/* Engagement */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>📊 Elköteleződés</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <DnaBar label="cta_aggressiveness" leftLabel="Szelíd" rightLabel="Agresszív" value={coords.engagement?.cta_aggressiveness} />
                    <DnaBar label="emoji_usage" leftLabel="Nincs Emoji" rightLabel="Sok Emoji" value={coords.engagement?.emoji_usage} />
                    <DnaBar label="hashtag_density" leftLabel="Kevés #" rightLabel="Sok #" value={coords.engagement?.hashtag_density} />
                    <DnaBar label="post_length_preference" leftLabel="Rövid" rightLabel="Hosszú" value={coords.engagement?.post_length_preference} />
                    <DnaBar label="interaction_asking" leftLabel="Passzív" rightLabel="Aktív" value={coords.engagement?.interaction_asking} />
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Addressing */}
            <SectionCard title="Megszólítás" icon="🗣️">
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <div style={{ padding: '8px 16px', background: 'rgba(139,92,246,0.08)', borderRadius: 8, fontWeight: 700, color: '#8b5cf6' }}>{addr.mode || '—'}</div>
                <div style={{ padding: '8px 16px', background: 'var(--bg3)', borderRadius: 8, fontWeight: 600, color: 'var(--text-muted)' }}>Magabiztosság: {addr.confidence || 0}%</div>
              </div>
              {addr.evidence && addr.evidence.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {addr.evidence.map((e, i) => <span key={i} style={{ fontSize: 11, padding: '3px 8px', background: 'var(--bg3)', color: 'var(--text)', borderRadius: 6, border: '1px solid var(--border)', fontStyle: 'italic' }}>"{e}"</span>)}
                </div>
              )}
            </SectionCard>

            {/* CTA Library */}
            <SectionCard title="CTA Könyvtár" icon="🎯">
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Elsődleges CTA-k</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(cta.primary_ctas || []).map((c, i) => <Tag key={i}>{c}</Tag>)}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Másodlagos CTA-k</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(cta.secondary_ctas || []).map((c, i) => <Tag key={i} color="#ec4899">{c}</Tag>)}
                </div>
              </div>
              {cta.slogans && cta.slogans.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Szlogenek</div>
                  {cta.slogans.map((s, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text)', fontStyle: 'italic' }}>"{s}"</div>)}
                </div>
              )}
              {cta.tagline && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Tagline</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#8b5cf6' }}>"{cta.tagline}"</div>
                </div>
              )}
            </SectionCard>

            {/* Brand Don't */}
            {(dont.avoid_words?.length > 0 || dont.avoid_topics?.length > 0 || dont.avoid_tones?.length > 0) && (
              <SectionCard title="Brand Don't — Kerülendő" icon="🚫">
                {dont.avoid_words?.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>Kerülendő szavak</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{dont.avoid_words.map((w, i) => <Tag key={i} color="#ef4444">{w}</Tag>)}</div></div>}
                {dont.avoid_topics?.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>Kerülendő témák</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{dont.avoid_topics.map((t, i) => <Tag key={i} color="#ef4444">{t}</Tag>)}</div></div>}
                {dont.avoid_tones?.length > 0 && <div><div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>Kerülendő hangnem</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{dont.avoid_tones.map((t, i) => <Tag key={i} color="#ef4444">{t}</Tag>)}</div></div>}
              </SectionCard>
            )}
          </>
        );
      }

      /* ──────── CONTACT ──────── */
      case 'contact': {
        const ct = d.contact || {} as ContactData;
        return (
          <SectionCard title="Kontakt & Cég Adatok" icon="📇">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <InfoRow label="Cégnév">{ct.company_name || '—'}</InfoRow>
                <InfoRow label="Cím">{ct.address || '—'}</InfoRow>
                <InfoRow label="Telefon">{ct.phone || '—'}</InfoRow>
                <InfoRow label="Email">{ct.email || '—'}</InfoRow>
                <InfoRow label="Social Linkek">
                  {ct.social_links && Object.keys(ct.social_links).length > 0
                    ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {Object.entries(ct.social_links).map(([k, v]) => (
                          <a key={k} href={v} target="_blank" rel="noreferrer" style={{ fontSize: 12, padding: '4px 10px', background: 'rgba(139,92,246,0.08)', color: '#8b5cf6', borderRadius: 8, border: '1px solid rgba(139,92,246,0.15)', fontWeight: 600, textDecoration: 'none' }}>
                            {k}
                          </a>
                        ))}
                      </div>
                    : '—'}
                </InfoRow>
              </tbody>
            </table>
          </SectionCard>
        );
      }

      /* ──────── PRODUCTS ──────── */
      case 'products': {
        return (
          <SectionCard title="Termékek & Szolgáltatások" icon="📦">
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <input
                value={productSearch} onChange={e => setProductSearch(e.target.value)}
                placeholder="Keresés termékekben..."
                style={{ flex: 1, padding: '8px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: "'Inter', sans-serif", color: 'var(--text)', background: 'var(--bg)', outline: 'none' }}
              />
              <select value={productBrand} onChange={e => setProductBrand(e.target.value)}
                style={{ padding: '8px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: "'Inter', sans-serif", color: 'var(--text)', background: 'var(--bg)', outline: 'none' }}>
                <option value="">Minden márka</option>
                {productBrands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Név', 'Márka', 'Ár', 'Leírás', 'Link'].map(h => (
                    <th key={h} style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '12px 8px', textAlign: 'left', background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>Nem találtunk terméket vagy szolgáltatást.</td></tr>
                ) : filteredProducts.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 8px', fontWeight: 600, color: 'var(--text)' }}>{p.name}</td>
                    <td style={{ padding: '12px 8px' }}><span style={{ padding: '2px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, fontWeight: 600, fontSize: 11, color: 'var(--text)' }}>{p.brand || 'N/A'}</span></td>
                    <td style={{ padding: '12px 8px', fontWeight: 700, color: '#8b5cf6' }}>{p.price || 'N/A'}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{p.description || '—'}</td>
                    <td style={{ padding: '12px 8px' }}>
                      {p.page_url && p.page_url !== 'N/A'
                        ? <a href={p.page_url} target="_blank" rel="noreferrer" style={{ color: '#8b5cf6', textDecoration: 'none', fontWeight: 600, fontSize: 11.5 }}>Oldal megnyitása ↗</a>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        );
      }

      /* ──────── AI GENERATION ──────── */
      case 'generate': {
        return (
          <>
            <SectionCard title="AI Poszt Generálás" icon="✍️">
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Platform</label>
                <select value={genPostPlatform} onChange={e => setGenPostPlatform(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: "'Inter', sans-serif", color: 'var(--text)', background: 'var(--bg)', outline: 'none' }}>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="linkedin">LinkedIn</option>
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Prompt</label>
                <textarea value={genPostPrompt} onChange={e => setGenPostPrompt(e.target.value)}
                  placeholder="Miről szóljon a poszt? Pl: nyári akció, új termék bemutató..."
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: "'Inter', sans-serif", color: 'var(--text)', background: 'var(--bg)', outline: 'none', resize: 'vertical' }} />
              </div>
              <button onClick={handleGenPost} disabled={genPostLoading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: genPostLoading ? 'wait' : 'pointer', fontFamily: "'Inter', sans-serif", opacity: genPostLoading ? 0.6 : 1, boxShadow: '0 2px 8px rgba(139,92,246,0.3)' }}>
                {genPostLoading ? '✍️ Generálás...' : '✍️ Poszt Generálás'}
              </button>

              {genPostResult && (
                <div style={{ marginTop: 16, padding: 16, background: 'var(--bg3)', borderRadius: 12, border: '1px solid var(--border)', fontSize: 13, lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                  {genPostResult}
                </div>
              )}
            </SectionCard>

            <SectionCard title="AI Kép Generálás" icon="🖼️">
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Kép Prompt</label>
                <textarea value={genImgPrompt} onChange={e => setGenImgPrompt(e.target.value)}
                  placeholder="Milyen képet generáljunk? Pl: modern irodai környezet, minimalista stílusban..."
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: "'Inter', sans-serif", color: 'var(--text)', background: 'var(--bg)', outline: 'none', resize: 'vertical' }} />
              </div>
              <button onClick={handleGenImage} disabled={genImgLoading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: genImgLoading ? 'wait' : 'pointer', fontFamily: "'Inter', sans-serif", opacity: genImgLoading ? 0.6 : 1, boxShadow: '0 2px 8px rgba(139,92,246,0.3)' }}>
                {genImgLoading ? '🖼️ Generálás...' : '🖼️ Kép Generálás'}
              </button>

              {genImgResult && (
                <div style={{ marginTop: 16 }}>
                  <img src={genImgResult} alt="Generált kép" style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid var(--border)' }} />
                  {genImgPromptUsed && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Prompt: {genImgPromptUsed}</div>}
                </div>
              )}
            </SectionCard>
          </>
        );
      }

      /* ──────── RAW JSON ──────── */
      case 'raw': {
        const jsonStr = JSON.stringify(d.scraper_json || {}, null, 2);
        return (
          <SectionCard title="Nyers Scraper JSON" icon="{ }">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button onClick={() => { navigator.clipboard.writeText(jsonStr); showToast('JSON másolva a vágólapra!'); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                📋 Másolás
              </button>
            </div>
            <pre style={{ background: 'var(--bg3)', borderRadius: 10, padding: 16, fontSize: 11, lineHeight: 1.5, color: 'var(--text-muted)', overflow: 'auto', maxHeight: 500, border: '1px solid var(--border)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {jsonStr}
            </pre>
          </SectionCard>
        );
      }

      default: return null;
    }
  };

  /* ══════════════════════════════ MAIN RETURN ══════════════════════════════ */
  return (
    <div className="page active">
      {/* Header */}
      <div className="mkt-page-header">
        <div className="mkt-page-header-icon" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(109,40,217,0.15))' }}>
          <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /><path d="M2 12h20" /></svg>
        </div>
        <div>
          <div className="mkt-page-title">Zombo Weboldal Audit</div>
          <div className="mkt-page-subtitle">Multi-ágensű alapú keresőoptimalizálás és vizuális tartalomelemzés</div>
        </div>
      </div>

      {/* Info Banner */}
      <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 12, padding: '12px 18px', marginBottom: 20, fontSize: 12, color: '#8b5cf6', lineHeight: 1.5 }}>
        Adj meg egy URL-t, és állítsd be a feltérképezendő oldalszámot. A Scraper és SEO Specialist ágensek mélyrehatóan feltérképezik és kiértékelik a weboldalt.
      </div>

      {/* URL Input Row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Weboldal URL címe</label>
          <input
            value={url} onChange={e => setUrl(e.target.value)}
            placeholder="pl. bagira.hu vagy https://444.hu"
            onKeyDown={e => e.key === 'Enter' && isValidUrl(url) && handleSubmit()}
            style={{
              width: '100%', padding: '10px 14px', border: `1.5px solid ${url && !isValidUrl(url) ? '#ef4444' : isValidUrl(url) ? '#8b5cf6' : 'var(--border)'}`,
              borderRadius: 10, fontSize: 13, fontFamily: "'Inter', sans-serif", color: 'var(--text)', background: 'var(--bg)', outline: 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
          />
          {url && !isValidUrl(url) && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>⚠️ Érvénytelen URL formátum</div>}
          {url && isValidUrl(url) && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>✅ Érvényes URL</div>}
        </div>

        <div style={{ width: 180 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Párhuzamos lapok: {limit}</label>
          <input type="range" min={1} max={30} value={limit} onChange={e => setLimit(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#8b5cf6' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)' }}><span>1</span><span>{limit} oldal</span></div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !isValidUrl(url)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: loading || !isValidUrl(url) ? 'var(--bg3)' : 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
            color: loading || !isValidUrl(url) ? 'var(--text-muted)' : '#fff',
            border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600,
            cursor: loading || !isValidUrl(url) ? 'not-allowed' : 'pointer',
            fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap',
            boxShadow: loading || !isValidUrl(url) ? 'none' : '0 2px 8px rgba(139,92,246,0.3)',
            transition: 'all 0.2s',
          }}>
          {loading ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> Elemzés...</> : 'Elemzés futtatása'}
        </button>
      </div>

      {/* Progress Panel */}
      {loading && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.6s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Elemzés folyamatban...</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ width: 14, height: 14, border: '2px solid rgba(139,92,246,0.1)', borderTopColor: '#8b5cf6', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
            {progress}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!result && !loading && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '60px 20px', textAlign: 'center' }}>
          <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ width: 48, height: 48, marginBottom: 16, opacity: 0.3, color: 'var(--text-muted)' }}>
            <circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /><path d="M2 12h20" />
          </svg>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Várakozás elemzésre</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 400, margin: '0 auto' }}>Adj meg egy URL-t feljebb, és kattints az Elemzés futtatása gombra az ágensek indításához.</div>
        </div>
      )}

      {/* Results with Tabs */}
      {result && (
        <>
          {/* Tab Nav */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', padding: 4, borderRadius: 12, border: '1px solid var(--border)', marginBottom: 20, flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{
                  padding: '8px 16px', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                  transition: 'all 0.2s', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap',
                  background: activeTab === t.id ? '#8b5cf6' : 'transparent',
                  color: activeTab === t.id ? '#fff' : 'var(--text-muted)',
                  boxShadow: activeTab === t.id ? '0 1px 4px rgba(139,92,246,0.3)' : 'none',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {renderTabContent()}
        </>
      )}

      {/* Spin keyframe (inline) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
