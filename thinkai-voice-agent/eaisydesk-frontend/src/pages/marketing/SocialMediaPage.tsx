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
  const [showDetailModal, setShowDetailModal] = useState<ContentItem | null>(null);

  // New content form
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newPlatform, setNewPlatform] = useState<{ig: boolean; fb: boolean}>({ ig: true, fb: false });
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTone, setAiTone] = useState('professzionális');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [newHashtags, setNewHashtags] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [imageDesc, setImageDesc] = useState('');
  const [imageDescOpen, setImageDescOpen] = useState(false);
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
    const platform = newPlatform.ig ? 'instagram' : 'facebook';
    setAiGenerating(true);
    try {
      const res = await authFetch('/marketing/api/ai/generate-social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: aiPrompt, platform, tone: aiTone }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.caption) setNewBody(data.caption);
        if (data.title) setNewTitle(data.title);
        if (data.hashtags) {
          const tags = Array.isArray(data.hashtags) ? data.hashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`).join(' ') : data.hashtags;
          setNewHashtags(tags);
        }
        if (data.image_description) setImageDesc(data.image_description);
        setAiGenerated(true);
        showToast('AI szöveg generálva!');
      } else showToast('Generálás sikertelen', 'error');
    } catch { showToast('Hiba', 'error'); }
    setAiGenerating(false);
  }, [aiPrompt, newPlatform, aiTone]);

  const handleGenerateImage = useCallback(async () => {
    if (!newBody.trim()) { showToast('Először generálj szöveget!', 'error'); return; }
    const platform = newPlatform.ig ? 'instagram' : 'facebook';
    setImgGenerating(true);
    try {
      const res = await authFetch('/marketing/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: newBody.substring(0, 200), platform }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.image_url) { setGeneratedImg(data.image_url); setNewImageUrl(data.image_url); }
        showToast('AI kép generálva!');
      } else showToast('Képgenerálás sikertelen', 'error');
    } catch { showToast('Hiba', 'error'); }
    setImgGenerating(false);
  }, [newBody, newPlatform]);

  const handleCreateContent = useCallback(async () => {
    if (!newTitle.trim() || !newBody.trim()) { showToast('Cím és szöveg kötelező!', 'error'); return; }
    const platform = newPlatform.ig && newPlatform.fb ? 'instagram,facebook' : newPlatform.ig ? 'instagram' : 'facebook';
    const hashtagsArray = newHashtags.trim() ? newHashtags.trim().split(/\s+/).filter(Boolean) : [];
    const targetPlatforms = [newPlatform.ig ? 'instagram' : null, newPlatform.fb ? 'facebook' : null].filter(Boolean);
    setCreating(true);
    try {
      const res = await authFetch('/marketing/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, body: newBody, platform, image_url: newImageUrl || generatedImg, hashtags: hashtagsArray, target_platforms: targetPlatforms, status: 'pending' }),
      });
      if (res.ok) {
        showToast('Poszt létrehozva!');
        setShowNewModal(false);
        setNewTitle(''); setNewBody(''); setAiPrompt(''); setGeneratedImg(null);
        setNewHashtags(''); setNewImageUrl(''); setImageDesc(''); setAiGenerated(false);
        loadContent();
      } else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
    setCreating(false);
  }, [newTitle, newBody, newPlatform, generatedImg, newImageUrl, newHashtags, loadContent]);

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map(item => {
            const dateStr = item.published_at ? new Date(item.published_at).toLocaleDateString('hu-HU') : new Date(item.created_at).toLocaleDateString('hu-HU');
            const hashtags = Array.isArray(item.hashtags) ? item.hashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`).join(' ') : (item.hashtags || '');
            const platforms = (item.target_platforms || [item.platform] || []).filter(Boolean);
            const platformIcons = platforms.map((p: string) => p === 'instagram' ? '📸' : p === 'facebook' ? '📘' : '📱').join(' ');
            const preview = (item.body || '').substring(0, 120) + ((item.body || '').length > 120 ? '...' : '');
            const statusLabels: Record<string, string> = { pending: 'Várakozó', requested: 'Kérelem', ai_draft: 'AI Draft', editing: 'Szerkesztés', approved: 'Jóváhagyva', scheduled: 'Ütemezett', published: 'Publikálva' };
            const statusColors: Record<string, string> = { pending: '#f59e0b', requested: '#94a3b8', ai_draft: '#f59e0b', editing: '#3b82f6', approved: '#8b5cf6', scheduled: '#3b82f6', published: '#22c55e' };
            const stColor = statusColors[item.status] || '#94a3b8';

            return (
              <div
                key={item.id}
                style={{ background: 'var(--bg-elevated, #fff)', borderRadius: 12, border: '1px solid var(--border)', padding: 16, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
                onClick={() => setShowDetailModal(item)}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
              >
                {/* Top row: badge + platform/date */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <span style={{ background: `${stColor}18`, color: stColor, fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {statusLabels[item.status] || item.status}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{platformIcons} · {dateStr}</span>
                </div>

                {/* Content: image thumbnail + title + preview */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
                  {item.image_url && (
                    <div style={{ width: 60, height: 60, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                      <img src={item.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLElement).parentElement!.style.display = 'none'; }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{item.title || 'Cím nélkül'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{preview}</div>
                  </div>
                </div>

                {/* Hashtags */}
                {hashtags && <div style={{ fontSize: 11, color: '#8b5cf6', marginBottom: 10, wordBreak: 'break-all' }}>{hashtags}</div>}

                {/* Scheduled date */}
                {item.scheduled_at && item.status === 'scheduled' && (
                  <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600, marginBottom: 10 }}>📅 {new Date(item.scheduled_at).toLocaleString('hu-HU')}</div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  {(item.status === 'pending' || item.status === 'ai_draft' || item.status === 'requested' || item.status === 'editing') && (
                    <>
                      <button onClick={e => { e.stopPropagation(); handleApprove(item.id); }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: '#22c55e', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>✅ Jóváhagyás</button>
                      <button onClick={e => { e.stopPropagation(); handleReject(item.id); }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'none', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>🗑️</button>
                    </>
                  )}
                  {item.status === 'approved' && (
                    <>
                      <button onClick={e => { e.stopPropagation(); handlePublish(item); }} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>🚀 Publikálás</button>
                      <button onClick={e => { e.stopPropagation(); setShowEditModal(item); }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>📅 Ütemezés</button>
                      <button onClick={e => { e.stopPropagation(); handleReject(item.id); }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'none', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>🗑️</button>
                    </>
                  )}
                  {item.status === 'published' && (
                    <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>✅ Publikálva</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ New Content Modal — DIGIDESK_OLD port ═══ */}
      {showNewModal && (
        <div className="mkt-modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="mkt-modal-card" style={{ width: 600 }} onClick={e => e.stopPropagation()}>
            <div className="mkt-modal-header">
              <div className="mkt-modal-title">✨ Új Social Média poszt</div>
              <button className="mkt-modal-close" onClick={() => setShowNewModal(false)}>
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Platform chips */}
            <div className="mkt-form-row">
              <label>Platform</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <div
                  onClick={() => setNewPlatform(p => ({ ...p, ig: !p.ig }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s', fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
                    background: newPlatform.ig ? 'rgba(225,48,108,0.08)' : 'var(--bg3)',
                    border: newPlatform.ig ? '2px solid #E1306C' : '2px solid var(--border)',
                    color: newPlatform.ig ? '#E1306C' : 'var(--text-muted)',
                  }}
                >
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(135deg,#833AB4,#E1306C,#F77737)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
                  </div>
                  Instagram
                </div>
                <div
                  onClick={() => setNewPlatform(p => ({ ...p, fb: !p.fb }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s', fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
                    background: newPlatform.fb ? 'rgba(24,119,242,0.08)' : 'var(--bg3)',
                    border: newPlatform.fb ? '2px solid #1877F2' : '2px solid var(--border)',
                    color: newPlatform.fb ? '#1877F2' : 'var(--text-muted)',
                  }}
                >
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                  </div>
                  Facebook
                </div>
              </div>
            </div>

            {/* AI Instruction */}
            <div className="mkt-form-row">
              <label>Utasítás az AI-nak</label>
              <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={3} placeholder="Pl. Írj egy motiváló posztot a nyári szezonról, említsd meg az új kezeléseinket..." />
            </div>

            {/* Tone */}
            <div className="mkt-form-row">
              <label>Hangnem</label>
              <select value={aiTone} onChange={e => setAiTone(e.target.value)}>
                <option value="professzionális">Professzionális</option>
                <option value="barátságos">Barátságos</option>
                <option value="lelkesítő">Lelkesítő</option>
                <option value="informatív">Informatív</option>
              </select>
            </div>

            {/* AI Generate Button */}
            <div style={{ marginBottom: 16 }}>
              <button
                onClick={handleGenerateText}
                disabled={aiGenerating}
                style={{ width: '100%', padding: 12, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', opacity: aiGenerating ? 0.7 : 1, transition: 'opacity 0.2s' }}
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}>
                  <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                {aiGenerating ? 'Generálás...' : '🤖 AI Generálás'}
              </button>
            </div>

            {/* AI Result */}
            {aiGenerated && (
              <div style={{ animation: 'mktFadeIn 0.3s ease' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>📝 AI által generált tartalom</div>
                <div className="mkt-form-row"><label>Cím (belső)</label><input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Automatikusan kitöltve" /></div>
                <div className="mkt-form-row"><label>Caption</label><textarea value={newBody} onChange={e => setNewBody(e.target.value)} rows={5} placeholder="A poszt szövege..." /></div>
                <div className="mkt-form-row"><label>Hashtag-ek</label><input value={newHashtags} onChange={e => setNewHashtags(e.target.value)} placeholder="#hashtag1 #hashtag2" /></div>
                <div className="mkt-form-row">
                  <label>🖼️ Kép URL (kötelező az Instagram poszthoz)</label>
                  <input value={newImageUrl} onChange={e => { setNewImageUrl(e.target.value); setGeneratedImg(e.target.value); }} placeholder="https://example.com/kep.jpg" />
                </div>

                {/* Image preview */}
                {(generatedImg || newImageUrl) && (
                  <div style={{ marginBottom: 14, borderRadius: 14, overflow: 'hidden', border: '2px solid rgba(139,92,246,0.25)', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>
                    <img src={generatedImg || newImageUrl} alt="Preview" style={{ width: '100%', display: 'block' }} onError={() => {}} />
                  </div>
                )}

                {/* AI image suggestion accordion */}
                {imageDesc && (
                  <div style={{ marginBottom: 16 }}>
                    <div
                      onClick={() => setImageDescOpen(!imageDescOpen)}
                      style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.08)', borderRadius: imageDescOpen ? '10px 10px 0 0' : 10, border: '1px solid rgba(245,158,11,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background 0.15s' }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>💡 AI kép javaslat <span style={{ fontWeight: 400, color: 'var(--text-dim)', fontSize: 11 }}>— kattints a részletekért</span></span>
                      <svg fill="none" stroke="#f59e0b" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 16, height: 16, transition: 'transform 0.2s', transform: imageDescOpen ? 'rotate(180deg)' : '' }}><path d="M19 9l-7 7-7-7" /></svg>
                    </div>
                    {imageDescOpen && (
                      <div style={{ padding: '12px 14px 6px', background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.12)', borderTop: 'none', borderRadius: '0 0 10px 10px' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{imageDesc}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* AI image generation button */}
                <button
                  onClick={handleGenerateImage}
                  disabled={imgGenerating}
                  style={{ width: '100%', padding: 12, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #f59e0b, #ea580c)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', opacity: imgGenerating ? 0.7 : 1, transition: 'opacity 0.2s', marginBottom: 16 }}
                >
                  {imgGenerating ? '⏳ Kép generálás...' : '🧠 Kép generálás AI-val'}
                </button>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <button className="mkt-btn-outline" onClick={() => setShowNewModal(false)}>Mégse</button>
                  <button className="mkt-btn-accent" onClick={handleCreateContent} disabled={creating}>{creating ? 'Mentés...' : '💾 Mentés (jóváhagyásra vár)'}</button>
                </div>
              </div>
            )}

            {/* Pre-generation footer */}
            {!aiGenerated && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button className="mkt-btn-outline" onClick={() => setShowNewModal(false)}>Mégse</button>
              </div>
            )}
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

      {/* ═══ Content Detail Modal ═══ */}
      {showDetailModal && (() => {
        const c = showDetailModal;
        const statusLabelsD: Record<string, string> = { pending: 'Várakozó', requested: 'Kérelem', ai_draft: 'AI Draft', editing: 'Szerkesztés', approved: 'Jóváhagyva', scheduled: 'Ütemezett', published: 'Publikálva' };
        const statusColorsD: Record<string, string> = { pending: '#f59e0b', requested: '#94a3b8', ai_draft: '#f59e0b', editing: '#3b82f6', approved: '#8b5cf6', scheduled: '#3b82f6', published: '#22c55e' };
        const stC = statusColorsD[c.status] || '#94a3b8';
        const dateD = c.created_at ? new Date(c.created_at).toLocaleString('hu-HU') : '—';
        const hashtagsD = Array.isArray(c.hashtags) ? c.hashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`).join(' ') : (c.hashtags || '');
        const platformsD = (c.target_platforms || [c.platform] || []).filter(Boolean);
        const platformLabelD = platformsD.map((p: string) => p === 'instagram' ? '📸 Instagram' : p === 'facebook' ? '📘 Facebook' : p).join(', ');

        return (
          <div className="mkt-modal-overlay" onClick={() => setShowDetailModal(null)}>
            <div className="mkt-modal-card" style={{ width: 560, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="mkt-modal-header">
                <div className="mkt-modal-title">{c.title || 'Tartalom részletek'}</div>
                <button className="mkt-modal-close" onClick={() => setShowDetailModal(null)}>
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Status + Date */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ background: `${stC}18`, color: stC, fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
                  {statusLabelsD[c.status] || c.status}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{dateD}</span>
              </div>

              {/* Image */}
              {c.image_url && (
                <div style={{ marginBottom: 16, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <img src={c.image_url} style={{ width: '100%', maxHeight: 320, objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLElement).parentElement!.style.display = 'none'; }} />
                </div>
              )}

              {/* Body */}
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 16, padding: '14px 16px', background: 'var(--bg-elevated, #f9fafb)', borderRadius: 10, border: '1px solid var(--border)', maxHeight: 240, overflowY: 'auto' }}>
                {c.body}
              </div>

              {/* Hashtags */}
              {hashtagsD && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Hashtag-ek</div>
                  <div style={{ fontSize: 12, color: '#8b5cf6', wordBreak: 'break-all' }}>{hashtagsD}</div>
                </div>
              )}

              {/* Platform + Status info boxes */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                <div style={{ flex: 1, padding: '10px 14px', background: 'var(--bg-elevated, #f9fafb)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Platform</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>{platformLabelD || '—'}</div>
                </div>
                <div style={{ flex: 1, padding: '10px 14px', background: 'var(--bg-elevated, #f9fafb)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Státusz</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: stC, marginTop: 4 }}>{statusLabelsD[c.status] || c.status}</div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                {(c.status === 'pending' || c.status === 'ai_draft' || c.status === 'requested' || c.status === 'editing') && (
                  <>
                    <button className="mkt-btn-outline" onClick={() => { handleReject(c.id); setShowDetailModal(null); }} style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>🗑️ Törlés</button>
                    <button className="mkt-btn-accent" onClick={() => { handleApprove(c.id); setShowDetailModal(null); }}>✅ Jóváhagyás</button>
                  </>
                )}
                {c.status === 'approved' && (
                  <>
                    <button className="mkt-btn-outline" onClick={() => { handleReject(c.id); setShowDetailModal(null); }} style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>🗑️ Törlés</button>
                    <button className="mkt-btn-outline" onClick={() => { setShowDetailModal(null); setShowEditModal(c); }}>📅 Ütemezés</button>
                    <button className="mkt-btn-accent" onClick={() => { handlePublish(c); setShowDetailModal(null); }}>🚀 Publikálás</button>
                  </>
                )}
                {c.status === 'published' && (
                  <button className="mkt-btn-outline" onClick={() => setShowDetailModal(null)}>Bezárás</button>
                )}
                {c.status === 'scheduled' && (
                  <>
                    <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>📅 {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString('hu-HU') : '...'}</span>
                    <button className="mkt-btn-outline" onClick={() => setShowDetailModal(null)}>Bezárás</button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
