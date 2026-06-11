/**
 * ZomboAuditPage – Website scraping + AI analysis, competitor comparison, post generation.
 */
import { useState, useCallback } from 'react';
import { authFetch } from '../../api/client';
import { showToast } from '../../components/ui/Toast';

interface ScrapeResult {
  url: string;
  score: number;
  title: string;
  description: string;
  sections: { name: string; score: number; details: string[] }[];
  keywords: string[];
  suggestions: string[];
}

export default function ZomboAuditPage() {
  const [url, setUrl] = useState('');
  const [compareUrl, setCompareUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [compareResult, setCompareResult] = useState<ScrapeResult | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [generatingPost, setGeneratingPost] = useState(false);
  const [generatedPost, setGeneratedPost] = useState('');

  const handleScrape = useCallback(async (targetUrl: string, isCompare = false) => {
    if (!targetUrl.trim()) { showToast('Adj meg egy URL-t!', 'error'); return; }
    if (isCompare) setCompareMode(true);
    setLoading(true);
    try {
      const res = await authFetch('/marketing/api/zombo/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        if (isCompare) setCompareResult(data);
        else setResult(data);
        showToast('Elemzés kész!');
      } else showToast('Scraping sikertelen', 'error');
    } catch { showToast('Hiba a szerver elérésekor', 'error'); }
    setLoading(false);
  }, []);

  const handleGeneratePost = useCallback(async () => {
    if (!result) return;
    setGeneratingPost(true);
    try {
      const res = await authFetch('/marketing/api/zombo/generate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: result.url, analysis: result }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedPost(data.post || data.text || JSON.stringify(data));
        showToast('Poszt generálva!');
      } else showToast('Generálás sikertelen', 'error');
    } catch { showToast('Hiba', 'error'); }
    setGeneratingPost(false);
  }, [result]);

  const scoreColor = (score: number) => score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';

  const renderResult = (r: ScrapeResult, label?: string) => (
    <div className="mkt-zombo-result">
      {label && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--marketing-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{label}</div>}
      <div className="mkt-zombo-score">
        <div className="mkt-zombo-score-circle" style={{ background: `linear-gradient(135deg, ${scoreColor(r.score)}, ${scoreColor(r.score)}cc)` }}>
          {r.score}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{r.title || r.url}</div>
          {r.description && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{r.description}</div>}
        </div>
      </div>

      {r.keywords && r.keywords.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {r.keywords.map((kw, i) => (
            <span key={i} style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(139,92,246,0.08)', color: 'var(--marketing-accent)', borderRadius: 6, border: '1px solid rgba(139,92,246,0.15)', fontWeight: 600, fontFamily: 'monospace' }}>{kw}</span>
          ))}
        </div>
      )}

      {r.sections && r.sections.map((s, i) => (
        <div key={i} className="mkt-zombo-section">
          <div className="mkt-zombo-section-title">
            <span style={{ fontWeight: 800, color: scoreColor(s.score) }}>{s.score}/100</span>
            {s.name}
          </div>
          {s.details && s.details.map((d, j) => (
            <div key={j} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '2px 0', paddingLeft: 12 }}>• {d}</div>
          ))}
        </div>
      ))}

      {r.suggestions && r.suggestions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>💡 Javaslatok</div>
          {r.suggestions.map((s, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0', paddingLeft: 12 }}>→ {s}</div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="page active">
      <div className="mkt-page-header">
        <div className="mkt-page-header-icon" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(109,40,217,0.15))' }}>
          <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /><path d="M2 12h20" /></svg>
        </div>
        <div>
          <div className="mkt-page-title">Zombo Audit</div>
          <div className="mkt-page-subtitle">Weblap elemzés, versenytárs összehasonlítás és AI tartalomgenerálás</div>
        </div>
      </div>

      {/* URL Input */}
      <div className="mkt-zombo-input-row">
        <input
          className="mkt-zombo-input"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com — Írd be az elemzendő weboldal URL-jét"
          onKeyDown={e => e.key === 'Enter' && handleScrape(url)}
        />
        <button className="mkt-btn-accent" onClick={() => handleScrape(url)} disabled={loading}>
          {loading && !compareMode ? (
            <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Elemzés...</>
          ) : (
            <>🔍 Elemzés</>
          )}
        </button>
      </div>

      {/* Results */}
      {result && (
        <>
          {renderResult(result)}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            <button className="mkt-btn-accent" onClick={handleGeneratePost} disabled={generatingPost}>
              {generatingPost ? '✍️ Generálás...' : '✍️ AI poszt generálás'}
            </button>
            <button className="mkt-btn-outline" onClick={() => setCompareMode(true)}>
              ⚖️ Összehasonlítás
            </button>
          </div>

          {/* Generated Post */}
          {generatedPost && (
            <div className="mkt-card" style={{ marginBottom: 24 }}>
              <div className="mkt-card-title">
                <div className="mkt-card-title-icon" style={{ background: 'rgba(139,92,246,0.1)' }}>
                  <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </div>
                Generált poszt
              </div>
              <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 16, fontSize: 13, lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                {generatedPost}
              </div>
            </div>
          )}

          {/* Compare Input */}
          {compareMode && !compareResult && (
            <div className="mkt-zombo-input-row">
              <input
                className="mkt-zombo-input"
                value={compareUrl}
                onChange={e => setCompareUrl(e.target.value)}
                placeholder="https://competitor.com — Versenytárs URL összehasonlításhoz"
                onKeyDown={e => e.key === 'Enter' && handleScrape(compareUrl, true)}
              />
              <button className="mkt-btn-accent" onClick={() => handleScrape(compareUrl, true)} disabled={loading}>
                {loading && compareMode ? 'Elemzés...' : '⚖️ Összehasonlítás'}
              </button>
            </div>
          )}

          {/* Compare Result */}
          {compareResult && (
            <div className="mkt-grid-2">
              {renderResult(result, '📊 Saját oldal')}
              {renderResult(compareResult, '⚖️ Versenytárs')}
            </div>
          )}
        </>
      )}

      {/* Empty State */}
      {!result && !loading && (
        <div className="mkt-placeholder">
          <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /><path d="M2 12h20" /></svg>
          <h3>Weblap Audit</h3>
          <p>Adj meg egy URL-t a fenti mezőben, és az AI elemzi a weboldal tartalmát, SEO teljesítményét és javaslatokat ad a fejlesztésre.</p>
        </div>
      )}
    </div>
  );
}
