/**
 * EmailCampaignsPage – CRUD for email campaigns, AI generation, send/schedule via Brevo.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { authFetch } from '../../api/client';
import { showToast } from '../../components/ui/Toast';
import Spinner from '../../components/ui/Spinner';

interface Campaign {
  id: number;
  name: string;
  subject: string;
  status: string;
  body_html: string;
  body_text: string;
  sent_count: number;
  open_count: number;
  click_count: number;
  open_rate: number;
  click_rate: number;
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
}

const STATUS_FILTERS = ['all', 'draft', 'active', 'sent', 'scheduled'] as const;
const STATUS_LABELS: Record<string, string> = { all: 'Összes', draft: 'Tervezet', active: 'Aktív', sent: 'Elküldött', scheduled: 'Ütemezett' };
const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: 'rgba(107,139,153,0.1)', color: '#6b8b99', label: 'Tervezet' },
  active: { bg: 'rgba(34,197,94,0.1)', color: '#22c55e', label: 'Aktív' },
  sent: { bg: 'rgba(139,92,246,0.1)', color: '#8b5cf6', label: 'Elküldött' },
  scheduled: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', label: 'Ütemezett' },
};

export default function EmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [subCount, setSubCount] = useState(0);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<Campaign | null>(null);
  const [showSubModal, setShowSubModal] = useState(false);

  // New campaign form
  const [newName, setNewName] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [creating, setCreating] = useState(false);

  // New subscriber form
  const [subEmail, setSubEmail] = useState('');
  const [subName, setSubName] = useState('');

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/marketing/api/campaigns');
      if (res.ok) setCampaigns(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadSubCount = useCallback(async () => {
    try {
      const res = await authFetch('/marketing/api/subscribers/count');
      if (res.ok) {
        const data = await res.json();
        setSubCount(data.count || data || 0);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadCampaigns(); loadSubCount(); }, [loadCampaigns, loadSubCount]);

  const filtered = useMemo(() => {
    if (filter === 'all') return campaigns;
    return campaigns.filter(c => c.status === filter);
  }, [campaigns, filter]);

  // KPI calculations
  const totalCampaigns = campaigns.length;
  const avgOpen = campaigns.length > 0 ? (campaigns.reduce((s, c) => s + (c.open_rate || 0), 0) / campaigns.length).toFixed(1) : '0';
  const avgClick = campaigns.length > 0 ? (campaigns.reduce((s, c) => s + (c.click_rate || 0), 0) / campaigns.length).toFixed(1) : '0';
  const totalSent = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0);

  // ── Actions ──
  const handleCreate = useCallback(async () => {
    if (!newName.trim()) { showToast('Kampány neve kötelező!', 'error'); return; }
    setCreating(true);
    try {
      const res = await authFetch('/marketing/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, subject: newSubject, body_html: newBody, body_text: newBody }),
      });
      if (res.ok) {
        showToast('Kampány létrehozva!');
        setShowNewModal(false);
        setNewName(''); setNewSubject(''); setNewBody(''); setAiPrompt('');
        loadCampaigns();
      } else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
    setCreating(false);
  }, [newName, newSubject, newBody, loadCampaigns]);

  const handleAiGenerate = useCallback(async () => {
    if (!aiPrompt.trim()) { showToast('Írd le milyen kampányt szeretnél!', 'error'); return; }
    setAiGenerating(true);
    try {
      const res = await authFetch('/marketing/api/ai/generate-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.subject) setNewSubject(data.subject);
        if (data.body_html) setNewBody(data.body_html);
        else if (data.body) setNewBody(data.body);
        showToast('AI tartalom generálva!');
      } else showToast('AI generálás sikertelen', 'error');
    } catch { showToast('Hiba', 'error'); }
    setAiGenerating(false);
  }, [aiPrompt]);

  const handleSend = useCallback(async (id: number) => {
    try {
      const res = await authFetch(`/marketing/api/campaigns/${id}/send`, { method: 'POST' });
      if (res.ok) { showToast('Kampány elküldve!'); loadCampaigns(); setShowDetailModal(null); }
      else showToast('Küldési hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [loadCampaigns]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      const res = await authFetch(`/marketing/api/campaigns/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Kampány törölve'); loadCampaigns(); setShowDetailModal(null); }
      else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [loadCampaigns]);

  const handleAddSubscriber = useCallback(async () => {
    if (!subEmail.trim()) { showToast('Email kötelező!', 'error'); return; }
    try {
      const res = await authFetch('/marketing/api/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: subEmail, name: subName }),
      });
      if (res.ok) { showToast('Feliratkozó hozzáadva!'); setShowSubModal(false); setSubEmail(''); setSubName(''); loadSubCount(); }
      else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [subEmail, subName, loadSubCount]);

  const handleImportCrm = useCallback(async () => {
    try {
      const res = await authFetch('/marketing/api/subscribers/import-crm', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        showToast(`${data.imported || 0} feliratkozó importálva a CRM-ből!`);
        loadSubCount();
      } else showToast('Import hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [loadSubCount]);

  return (
    <div className="page active">
      {/* Header */}
      <div className="mkt-page-header">
        <div className="mkt-page-header-icon" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.15))' }}>
          <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div className="mkt-page-title">E-mail kampányok</div>
          <div className="mkt-page-subtitle">Kampányok kezelése, hírlevelek és automatizált sorozatok</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg3)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
            {subCount} feliratkozó
          </span>
          <button className="mkt-btn-outline" onClick={() => setShowSubModal(true)}>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M20 8v6m3-3h-6" /></svg>
            Feliratkozó
          </button>
          <button className="mkt-btn-accent" onClick={() => setShowNewModal(true)}>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
            Új kampány
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="mkt-view-switcher">
        {STATUS_FILTERS.map(f => (
          <button key={f} className={`mkt-view-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {/* KPI Grid */}
      <div className="mkt-kpi-grid" style={{ marginBottom: 20 }}>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#8b5cf6' }}><div className="mkt-kpi-label">Összes kampány</div><div className="mkt-kpi-value">{totalCampaigns}</div></div>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#22c55e' }}><div className="mkt-kpi-label">Megnyitási arány</div><div className="mkt-kpi-value">{avgOpen}%</div></div>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#3b82f6' }}><div className="mkt-kpi-label">Átkattintási arány</div><div className="mkt-kpi-value">{avgClick}%</div></div>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#ef4444' }}><div className="mkt-kpi-label">Elküldött összesen</div><div className="mkt-kpi-value">{totalSent}</div></div>
      </div>

      {/* Campaign Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="mkt-empty-state">
          <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8" /></svg>
          <p>{filter === 'all' ? 'Még nincsenek kampányok. Kattints az "Új kampány" gombra!' : `Nincs "${STATUS_LABELS[filter]}" státuszú kampány.`}</p>
        </div>
      ) : (
        <div className="mkt-campaign-grid">
          {filtered.map(c => {
            const sb = STATUS_BADGE[c.status] || STATUS_BADGE.draft;
            return (
              <div key={c.id} className="mkt-campaign-card" onClick={() => setShowDetailModal(c)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div className="mkt-campaign-name">{c.name}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: sb.bg, color: sb.color }}>{sb.label}</span>
                </div>
                {c.subject && <div className="mkt-campaign-meta">📧 {c.subject}</div>}
                <div className="mkt-campaign-meta">{c.created_at ? new Date(c.created_at).toLocaleDateString('hu-HU') : '—'}</div>
                <div className="mkt-campaign-stats">
                  <div className="mkt-campaign-stat"><div className="mkt-campaign-stat-val">{c.sent_count || 0}</div><div className="mkt-campaign-stat-label">Elküldve</div></div>
                  <div className="mkt-campaign-stat"><div className="mkt-campaign-stat-val">{c.open_rate || 0}%</div><div className="mkt-campaign-stat-label">Megnyitás</div></div>
                  <div className="mkt-campaign-stat"><div className="mkt-campaign-stat-val">{c.click_rate || 0}%</div><div className="mkt-campaign-stat-label">Kattintás</div></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ New Campaign Modal ═══ */}
      {showNewModal && (
        <div className="mkt-modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="mkt-modal-card" style={{ width: 640 }} onClick={e => e.stopPropagation()}>
            <div className="mkt-modal-header">
              <div className="mkt-modal-title">Új kampány létrehozása</div>
              <button className="mkt-modal-close" onClick={() => setShowNewModal(false)}>
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mkt-form-row">
              <label>Kampány neve *</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Pl. Nyári akció hírlevél" />
            </div>
            <div className="mkt-form-row">
              <label>Tárgy sor</label>
              <input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Pl. 🌞 Nyári kedvezmények!" />
            </div>

            {/* AI Generation */}
            <div style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 6, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                ✨ AI tartalom generálás
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Pl. Nyári fog fehérítés akció, 20% kedvezmény..." style={{ flex: 1, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--bg)' }} />
                <button className="mkt-btn-accent" onClick={handleAiGenerate} disabled={aiGenerating} style={{ whiteSpace: 'nowrap' }}>
                  {aiGenerating ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Generálás...</> : '✨ Generálás'}
                </button>
              </div>
            </div>

            <div className="mkt-form-row">
              <label>Tartalom</label>
              <textarea value={newBody} onChange={e => setNewBody(e.target.value)} rows={8} placeholder="Írj kampány tartalmat, vagy használd az AI generálást..." />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="mkt-btn-outline" onClick={() => setShowNewModal(false)}>Mégse</button>
              <button className="mkt-btn-accent" onClick={handleCreate} disabled={creating}>
                {creating ? 'Létrehozás...' : 'Létrehozás'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Campaign Detail Modal ═══ */}
      {showDetailModal && (
        <div className="mkt-modal-overlay" onClick={() => setShowDetailModal(null)}>
          <div className="mkt-modal-card" style={{ width: 640 }} onClick={e => e.stopPropagation()}>
            <div className="mkt-modal-header">
              <div className="mkt-modal-title">{showDetailModal.name}</div>
              <button className="mkt-modal-close" onClick={() => setShowDetailModal(null)}>
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div className="mkt-stat-mini">
                <div className="mkt-stat-mini-icon" style={{ background: 'rgba(139,92,246,0.1)' }}>
                  <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8" /></svg>
                </div>
                <div><div className="mkt-stat-mini-label">Elküldve</div><div className="mkt-stat-mini-value">{showDetailModal.sent_count || 0}</div></div>
              </div>
              <div className="mkt-stat-mini">
                <div className="mkt-stat-mini-icon" style={{ background: 'rgba(34,197,94,0.1)' }}>
                  <svg fill="none" stroke="#22c55e" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                </div>
                <div><div className="mkt-stat-mini-label">Megnyitás</div><div className="mkt-stat-mini-value">{showDetailModal.open_rate || 0}%</div></div>
              </div>
              <div className="mkt-stat-mini">
                <div className="mkt-stat-mini-icon" style={{ background: 'rgba(59,130,246,0.1)' }}>
                  <svg fill="none" stroke="#3b82f6" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M13.8 12H3" /></svg>
                </div>
                <div><div className="mkt-stat-mini-label">Kattintás</div><div className="mkt-stat-mini-value">{showDetailModal.click_rate || 0}%</div></div>
              </div>
            </div>

            {showDetailModal.subject && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>TÁRGY</div>
                <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{showDetailModal.subject}</div>
              </div>
            )}

            {(showDetailModal.body_html || showDetailModal.body_text) && (
              <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 16, fontSize: 13, lineHeight: 1.6, maxHeight: 200, overflowY: 'auto', marginBottom: 20, color: 'var(--text)' }}>
                {showDetailModal.body_text || 'HTML tartalom...'}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {showDetailModal.status === 'draft' && (
                <button className="mkt-btn-accent" onClick={() => handleSend(showDetailModal.id)}>📤 Küldés most</button>
              )}
              <button className="mkt-btn-outline" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} onClick={() => handleDelete(showDetailModal.id)}>🗑 Törlés</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Add Subscriber Modal ═══ */}
      {showSubModal && (
        <div className="mkt-modal-overlay" onClick={() => setShowSubModal(false)}>
          <div className="mkt-modal-card" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
            <div className="mkt-modal-header">
              <div className="mkt-modal-title">Feliratkozó hozzáadása</div>
              <button className="mkt-modal-close" onClick={() => setShowSubModal(false)}>
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="mkt-form-row"><label>Email *</label><input type="email" value={subEmail} onChange={e => setSubEmail(e.target.value)} placeholder="email@example.com" /></div>
            <div className="mkt-form-row"><label>Név</label><input value={subName} onChange={e => setSubName(e.target.value)} placeholder="Teljes név" /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 20 }}>
              <button className="mkt-btn-outline" onClick={handleImportCrm}>📥 CRM Import</button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="mkt-btn-outline" onClick={() => setShowSubModal(false)}>Mégse</button>
                <button className="mkt-btn-accent" onClick={handleAddSubscriber}>Hozzáadás</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
