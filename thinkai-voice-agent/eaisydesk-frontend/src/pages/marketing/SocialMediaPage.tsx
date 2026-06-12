/**
 * SocialMediaPage – Content approval system for Instagram/Facebook posts.
 * AI text + image generation, publish, schedule.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { authFetch } from '../../api/client';
import { showToast } from '../../components/ui/Toast';
import Spinner from '../../components/ui/Spinner';

interface ContentItem {
  id: number;
  title: string;
  body: string;
  platform: string;
  status: string;
  image_url: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
}

interface SocialAnalytics {
  ig_followers: number;
  ig_media_count: number;
  fb_page_followers: number;
  fb_page_likes: number;
}

const STATUS_FILTERS = ['pending', 'approved', 'scheduled', 'published', 'all'] as const;
const STATUS_LABELS: Record<string, string> = { pending: 'Várakozó', approved: 'Jóváhagyott', scheduled: '📅 Ütemezett', published: 'Publikált', all: 'Összes' };

export default function SocialMediaPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [analytics, setAnalytics] = useState<SocialAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<ContentItem | null>(null);

  // New content form
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newPlatform, setNewPlatform] = useState('instagram');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [imgGenerating, setImgGenerating] = useState(false);
  const [generatedImg, setGeneratedImg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Schedule
  const [scheduleDate, setScheduleDate] = useState('');

  const loadContent = useCallback(async () => {
    setLoading(true);
    try {
      const [contentRes, analyticsRes] = await Promise.all([
        authFetch('/marketing/api/content'),
        authFetch('/marketing/api/social/analytics'),
      ]);
      if (contentRes.ok) setItems(await contentRes.json());
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadContent(); }, [loadContent]);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter(i => i.status === filter);
  }, [items, filter]);

  const statusCounts = useMemo(() => ({
    pending: items.filter(i => i.status === 'pending' || i.status === 'ai_draft').length,
    approved: items.filter(i => i.status === 'approved').length,
    scheduled: items.filter(i => i.status === 'scheduled').length,
    published: items.filter(i => i.status === 'published').length,
  }), [items]);

  // ── Actions ──
  const handleGenerateText = useCallback(async () => {
    if (!aiPrompt.trim()) { showToast('Adj meg egy témát!', 'error'); return; }
    setAiGenerating(true);
    try {
      const res = await authFetch('/marketing/api/ai/generate-social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, platform: newPlatform }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.text) setNewBody(data.text);
        if (data.title) setNewTitle(data.title);
        showToast('AI szöveg generálva!');
      } else showToast('Generálás sikertelen', 'error');
    } catch { showToast('Hiba', 'error'); }
    setAiGenerating(false);
  }, [aiPrompt, newPlatform]);

  const handleGenerateImage = useCallback(async () => {
    if (!newBody.trim()) { showToast('Először generálj szöveget!', 'error'); return; }
    setImgGenerating(true);
    try {
      const res = await authFetch('/marketing/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: newBody.substring(0, 200), platform: newPlatform }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.image_url) setGeneratedImg(data.image_url);
        showToast('AI kép generálva!');
      } else showToast('Képgenerálás sikertelen', 'error');
    } catch { showToast('Hiba', 'error'); }
    setImgGenerating(false);
  }, [newBody, newPlatform]);

  const handleCreateContent = useCallback(async () => {
    if (!newTitle.trim() || !newBody.trim()) { showToast('Cím és szöveg kötelező!', 'error'); return; }
    setCreating(true);
    try {
      const res = await authFetch('/marketing/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, body: newBody, platform: newPlatform, image_url: generatedImg, status: 'pending' }),
      });
      if (res.ok) {
        showToast('Poszt létrehozva!');
        setShowNewModal(false);
        setNewTitle(''); setNewBody(''); setAiPrompt(''); setGeneratedImg(null);
        loadContent();
      } else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
    setCreating(false);
  }, [newTitle, newBody, newPlatform, generatedImg, loadContent]);

  const handleApprove = useCallback(async (id: number) => {
    try {
      const res = await authFetch(`/marketing/api/content/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });
      if (res.ok) { showToast('Jóváhagyva!'); loadContent(); }
    } catch { showToast('Hiba', 'error'); }
  }, [loadContent]);

  const handleReject = useCallback(async (id: number) => {
    try {
      const res = await authFetch(`/marketing/api/content/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Elutasítva és törölve'); loadContent(); }
    } catch { showToast('Hiba', 'error'); }
  }, [loadContent]);

  const handlePublish = useCallback(async (item: ContentItem) => {
    try {
      const res = await authFetch('/marketing/api/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_id: item.id, platform: item.platform }),
      });
      if (res.ok) { showToast('Publikálva!'); loadContent(); }
      else showToast('Publikálás sikertelen', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [loadContent]);

  const handleSchedule = useCallback(async (id: number) => {
    if (!scheduleDate) { showToast('Válassz dátumot!', 'error'); return; }
    try {
      const res = await authFetch(`/marketing/api/content/${id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at: scheduleDate }),
      });
      if (res.ok) { showToast('Ütemezve!'); setShowEditModal(null); loadContent(); }
      else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [scheduleDate, loadContent]);

  const platformIcon = (p: string) => p === 'instagram'
    ? <span style={{ display: 'inline-flex', width: 20, height: 20, borderRadius: 5, background: 'linear-gradient(135deg,#833AB4,#E1306C,#F77737)', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 800 }}>IG</span>
    : <span style={{ display: 'inline-flex', width: 20, height: 20, borderRadius: 5, background: '#1877F2', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 800 }}>FB</span>;

  return (
    <div className="page active">
      {/* Header */}
      <div className="mkt-page-header">
        <div className="mkt-page-header-icon" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(234,88,12,0.15))' }}>
          <svg fill="none" stroke="#f59e0b" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div className="mkt-page-title">Közösségi Média</div>
          <div className="mkt-page-subtitle">Posztok kezelése, ütemezés és publikálás Instagramra és Facebookra</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="mkt-btn-outline" onClick={loadContent} style={{ padding: '8px 14px', fontSize: 12 }}>🔄 Frissítés</button>
          <button className="mkt-btn-accent" onClick={() => setShowNewModal(true)}>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
            Új poszt
          </button>
        </div>
      </div>

      {/* Platform Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        <div className="mkt-platform-card instagram">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#833AB4,#E1306C,#F77737)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Instagram</span>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <div><div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-dim)', marginBottom: 4 }}>Követők</div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>{analytics?.ig_followers ?? '—'}</div></div>
            <div><div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-dim)', marginBottom: 4 }}>Posztok</div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>{analytics?.ig_media_count ?? '—'}</div></div>
          </div>
        </div>
        <div className="mkt-platform-card facebook">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Facebook</span>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <div><div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-dim)', marginBottom: 4 }}>Követők</div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>{analytics?.fb_page_followers ?? '—'}</div></div>
            <div><div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-dim)', marginBottom: 4 }}>Kedvelések</div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>{analytics?.fb_page_likes ?? '—'}</div></div>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="mkt-kpi-grid">
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#f59e0b' }}><div className="mkt-kpi-label">Várakozó</div><div className="mkt-kpi-value">{statusCounts.pending}</div></div>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#8b5cf6' }}><div className="mkt-kpi-label">Jóváhagyott</div><div className="mkt-kpi-value">{statusCounts.approved}</div></div>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#3b82f6' }}><div className="mkt-kpi-label">Ütemezett</div><div className="mkt-kpi-value">{statusCounts.scheduled}</div></div>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#22c55e' }}><div className="mkt-kpi-label">Publikált</div><div className="mkt-kpi-value">{statusCounts.published}</div></div>
      </div>

      {/* Filter */}
      <div className="mkt-view-switcher" style={{ marginBottom: 16 }}>
        {STATUS_FILTERS.map(f => (
          <button key={f} className={`mkt-view-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{STATUS_LABELS[f]}</button>
        ))}
      </div>

      <div style={{ textAlign: 'right', marginBottom: 12, fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
        {filtered.length} poszt
      </div>

      {/* Content Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="mkt-empty-state">
          <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547" /></svg>
          <p>Nincs tartalom ebben a kategóriában.</p>
        </div>
      ) : (
        <div className="mkt-approval-grid">
          {filtered.map(item => (
            <div key={item.id} className={`mkt-approval-card status-${item.status}`}>
              <div className="mkt-approval-card-header">
                <div className="mkt-approval-card-title">{item.title || 'Cím nélkül'}</div>
                <span className={`mkt-badge mkt-badge-${item.status === 'published' ? 'green' : item.status === 'approved' ? 'purple' : item.status === 'scheduled' ? 'blue' : 'yellow'}`}>
                  {STATUS_LABELS[item.status] || item.status}
                </span>
              </div>
              <div className="mkt-approval-card-meta">
                {platformIcon(item.platform)}
                <span>{item.created_at ? new Date(item.created_at).toLocaleDateString('hu-HU') : '—'}</span>
                {item.scheduled_at && <span>📅 {new Date(item.scheduled_at).toLocaleString('hu-HU')}</span>}
              </div>
              <div className="mkt-approval-card-preview">{item.body}</div>
              <div className="mkt-approval-card-actions">
                {(item.status === 'pending' || item.status === 'ai_draft') && (
                  <>
                    <button className="mkt-approval-btn btn-approve" onClick={() => handleApprove(item.id)}>✓ Jóváhagyás</button>
                    <button className="mkt-approval-btn btn-reject" onClick={() => handleReject(item.id)}>✕ Elutasítás</button>
                    <button className="mkt-approval-btn" onClick={() => setShowEditModal(item)}>✏️ Szerkesztés</button>
                  </>
                )}
                {item.status === 'approved' && (
                  <>
                    <button className="mkt-approval-btn btn-publish" onClick={() => handlePublish(item)}>📤 Publikálás</button>
                    <button className="mkt-approval-btn" onClick={() => setShowEditModal(item)}>📅 Ütemezés</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ New Content Modal ═══ */}
      {showNewModal && (
        <div className="mkt-modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="mkt-modal-card" style={{ width: 640 }} onClick={e => e.stopPropagation()}>
            <div className="mkt-modal-header">
              <div className="mkt-modal-title">Új poszt létrehozása</div>
              <button className="mkt-modal-close" onClick={() => setShowNewModal(false)}>
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mkt-form-row">
              <label>Platform</label>
              <select value={newPlatform} onChange={e => setNewPlatform(e.target.value)}>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
              </select>
            </div>
            <div className="mkt-form-row"><label>Cím</label><input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Poszt címe" /></div>

            {/* AI Text Generation */}
            <div style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 6, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>✨ AI szöveggenerálás</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Pl. Nyári fog fehérítés akció poszt..." style={{ flex: 1, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--bg)' }} />
                <button className="mkt-btn-accent" onClick={handleGenerateText} disabled={aiGenerating} style={{ whiteSpace: 'nowrap' }}>
                  {aiGenerating ? 'Generálás...' : '✨ Szöveg'}
                </button>
              </div>
            </div>

            <div className="mkt-form-row"><label>Szöveg</label><textarea value={newBody} onChange={e => setNewBody(e.target.value)} rows={5} placeholder="Poszt szövege..." /></div>

            {/* AI Image Generation */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button className="mkt-btn-outline" onClick={handleGenerateImage} disabled={imgGenerating} style={{ flex: 1 }}>
                {imgGenerating ? '🖼 Kép generálás...' : '🖼 AI kép generálás'}
              </button>
            </div>
            {generatedImg && (
              <div style={{ marginBottom: 16, textAlign: 'center' }}>
                <img src={generatedImg} alt="Generated" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, border: '1px solid var(--border)' }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="mkt-btn-outline" onClick={() => setShowNewModal(false)}>Mégse</button>
              <button className="mkt-btn-accent" onClick={handleCreateContent} disabled={creating}>{creating ? 'Létrehozás...' : 'Létrehozás'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Edit/Schedule Modal ═══ */}
      {showEditModal && (
        <div className="mkt-modal-overlay" onClick={() => setShowEditModal(null)}>
          <div className="mkt-modal-card" style={{ width: 500 }} onClick={e => e.stopPropagation()}>
            <div className="mkt-modal-header">
              <div className="mkt-modal-title">{showEditModal.title || 'Poszt'}</div>
              <button className="mkt-modal-close" onClick={() => setShowEditModal(null)}>
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 16, fontSize: 13, lineHeight: 1.6, marginBottom: 20, color: 'var(--text)' }}>
              {showEditModal.body}
            </div>
            <div className="mkt-form-row">
              <label>Ütemezés dátuma</label>
              <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="mkt-btn-outline" onClick={() => setShowEditModal(null)}>Mégse</button>
              <button className="mkt-btn-accent" onClick={() => handleSchedule(showEditModal.id)}>📅 Ütemezés</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
