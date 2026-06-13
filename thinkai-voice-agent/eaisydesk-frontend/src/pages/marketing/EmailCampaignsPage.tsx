/**
 * EmailCampaignsPage – CRUD for email campaigns, AI generation, send/schedule via Brevo.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { authFetch } from '../../api/client';
import { showToast } from '../../components/ui/Toast';
import Spinner from '../../components/ui/Spinner';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

interface CampaignStats {
  opens: number;
  clicks: number;
  bounces: number;
  unsubscribes: number;
  delivered: number;
}

interface Campaign {
  id: string;
  name: string;
  type: string;
  subject_line: string;
  subject_line_b?: string;
  template_html: string;
  segment_name: string;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  brevo_campaign_id?: string;
  stats: CampaignStats | null;
  recipients_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Legacy compat fields (from card grid)
  sent_count?: number;
  open_rate?: number;
  click_rate?: number;
  body_html?: string;
  body_text?: string;
  subject?: string;
}

const STATUS_FILTERS = ['all', 'draft', 'active', 'sent', 'scheduled'] as const;
const STATUS_LABELS: Record<string, string> = { all: 'Összes', draft: 'Tervezet', active: 'Aktív', sent: 'Elküldött', scheduled: 'Ütemezett' };
const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: 'rgba(107,139,153,0.1)', color: '#6b8b99', label: 'Tervezet' },
  active: { bg: 'rgba(34,197,94,0.1)', color: '#22c55e', label: 'Aktív' },
  sent: { bg: 'rgba(139,92,246,0.1)', color: '#8b5cf6', label: 'Elküldött' },
  scheduled: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', label: 'Ütemezett' },
};

const TYPE_LABELS: Record<string, string> = {
  newsletter: 'Hírlevél',
  promotion: 'Promóció',
  drip: 'Drip sorozat',
  transactional: 'Tranzakciós',
};

/** Helper: extract stats from campaign */
function getCampaignStats(c: Campaign) {
  const stats = c.stats || { opens: 0, clicks: 0, bounces: 0, unsubscribes: 0, delivered: 0 };
  const delivered = stats.delivered || c.recipients_count || c.sent_count || 0;
  const opens = stats.opens || 0;
  const clicks = stats.clicks || 0;
  const bounces = stats.bounces || 0;
  const openRate = delivered > 0 ? ((opens / delivered) * 100).toFixed(1) : '0.0';
  const clickRate = delivered > 0 ? ((clicks / delivered) * 100).toFixed(1) : '0.0';
  const bounceRate = delivered > 0 ? ((bounces / delivered) * 100).toFixed(1) : '0.0';
  return { delivered, opens, clicks, bounces, openRate, clickRate, bounceRate };
}

export default function EmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [subCount, setSubCount] = useState(0);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<Campaign | null>(null);
  const [showSubModal, setShowSubModal] = useState(false);
  const [refreshingStats, setRefreshingStats] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // New campaign form
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('newsletter');
  const [newSegment, setNewSegment] = useState('Összes feliratkozó');
  const [editorMode, setEditorMode] = useState<'manual' | 'ai'>('manual');
  const [newSubject, setNewSubject] = useState('');
  const [newSubjectB, setNewSubjectB] = useState('');
  const [newBody, setNewBody] = useState('');
  const [aiTone, setAiTone] = useState('professzionális');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSubject, setAiSubject] = useState('');
  const [aiBody, setAiBody] = useState('');
  const [aiGenerated, setAiGenerated] = useState(false);
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
  const sentCampaigns = campaigns.filter(c => c.status === 'sent');
  const avgOpen = sentCampaigns.length > 0
    ? (sentCampaigns.reduce((s, c) => { const st = getCampaignStats(c); return s + parseFloat(st.openRate); }, 0) / sentCampaigns.length).toFixed(1)
    : '0';
  const avgClick = sentCampaigns.length > 0
    ? (sentCampaigns.reduce((s, c) => { const st = getCampaignStats(c); return s + parseFloat(st.clickRate); }, 0) / sentCampaigns.length).toFixed(1)
    : '0';
  const totalSent = campaigns.reduce((s, c) => s + (getCampaignStats(c).delivered || c.recipients_count || 0), 0);

  // ── Actions ──
  const handleCreate = useCallback(async () => {
    if (!newName.trim()) { showToast('Kampány neve kötelező!', 'error'); return; }
    const finalSubject = editorMode === 'ai' ? aiSubject : newSubject;
    const finalBody = editorMode === 'ai' ? aiBody : newBody;
    setCreating(true);
    try {
      const res = await authFetch('/marketing/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          type: newType,
          segment_name: newSegment,
          subject_line: finalSubject,
          subject_line_b: newSubjectB || undefined,
          template_html: finalBody,
        }),
      });
      if (res.ok) {
        showToast('Kampány létrehozva!');
        setShowNewModal(false);
        setNewName(''); setNewType('newsletter'); setNewSegment('Összes feliratkozó');
        setNewSubject(''); setNewSubjectB(''); setNewBody('');
        setAiPrompt(''); setAiSubject(''); setAiBody(''); setAiGenerated(false);
        setEditorMode('manual');
        loadCampaigns();
      } else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
    setCreating(false);
  }, [newName, newType, newSegment, newSubject, newSubjectB, newBody, editorMode, aiSubject, aiBody, loadCampaigns]);

  const handleAiGenerate = useCallback(async () => {
    if (!aiPrompt.trim()) { showToast('Írd le milyen kampányt szeretnél!', 'error'); return; }
    setAiGenerating(true);
    try {
      const res = await authFetch('/marketing/api/ai/generate-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: aiPrompt, tone: aiTone }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiSubject(data.subject || '');
        setAiBody(data.body || '');
        setAiGenerated(true);
        showToast('AI tartalom generálva!');
      } else showToast('AI generálás sikertelen', 'error');
    } catch { showToast('Hiba', 'error'); }
    setAiGenerating(false);
  }, [aiPrompt, aiTone]);

  const handleSend = useCallback(async (id: string) => {
    try {
      const res = await authFetch(`/marketing/api/campaigns/${id}/send`, { method: 'POST' });
      if (res.ok) { showToast('Kampány elküldve!'); loadCampaigns(); setShowDetailModal(null); }
      else showToast('Küldési hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [loadCampaigns]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await authFetch(`/marketing/api/campaigns/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Kampány törölve'); loadCampaigns(); setShowDetailModal(null); setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; }); }
      else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [loadCampaigns]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    let deleted = 0;
    for (const id of selectedIds) {
      try {
        const res = await authFetch(`/marketing/api/campaigns/${id}`, { method: 'DELETE' });
        if (res.ok) deleted++;
      } catch { /* continue */ }
    }
    showToast(`${deleted} kampány törölve`);
    setSelectedIds(new Set());
    loadCampaigns();
    setBulkDeleting(false);
  }, [selectedIds, loadCampaigns]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  }, [selectedIds.size, filtered]);

  const handleSchedule = useCallback(async (id: string) => {
    if (!scheduleDate) { showToast('Válassz dátumot!', 'error'); return; }
    setScheduling(true);
    try {
      const res = await authFetch(`/marketing/api/campaigns/${id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at: scheduleDate }),
      });
      if (res.ok) {
        showToast('Kampány ütemezve!');
        setScheduleDate('');
        loadCampaigns();
        setShowDetailModal(null);
      } else showToast('Ütemezési hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
    setScheduling(false);
  }, [scheduleDate, loadCampaigns]);

  const handleRefreshStats = useCallback(async (id: string) => {
    setRefreshingStats(true);
    try {
      const res = await authFetch(`/marketing/api/campaigns/${id}/refresh-stats`, { method: 'POST' });
      if (res.ok) {
        showToast('Statisztikák frissítve!');
        loadCampaigns();
        // Update the detail modal in-place
        const campaignRes = await authFetch(`/marketing/api/campaigns/${id}`);
        if (campaignRes.ok) setShowDetailModal(await campaignRes.json());
      } else showToast('Frissítési hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
    setRefreshingStats(false);
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

  // Detail modal helper values
  const detail = showDetailModal;
  const detailStats = detail ? getCampaignStats(detail) : null;
  const detailSubject = detail?.subject_line || detail?.subject || '';
  const detailBody = detail?.template_html || detail?.body_html || detail?.body_text || '';
  const detailType = detail?.type || 'newsletter';
  const detailStatusBadge = detail ? (STATUS_BADGE[detail.status] || STATUS_BADGE.draft) : null;

  return (
    <div className="page active mkt-purple">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.15))', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
            <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 24, height: 24 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <div className="page-title" style={{ margin: 0 }}>E-mail kampányok</div>
            <div className="page-subtitle" style={{ margin: 0 }}>Kampányok kezelése, hírlevelek és automatizált sorozatok</div>
          </div>
        </div>
      </div>

      {/* Campaigns section */}
      <div className="out-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div className="out-section-title" style={{ marginBottom: 0 }}>
            <div className="out-section-icon" style={{ background: 'rgba(139,92,246,0.12)' }}>
              <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            Kampányok
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="out-analytics-btn" onClick={() => setShowSubModal(true)}>
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 14, height: 14, verticalAlign: -2, marginRight: 4 }}>
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M20 8v6m3-3h-6" />
              </svg>
              {subCount} Feliratkozó
            </button>
            <button className="mkt-btn-accent" onClick={() => setShowNewModal(true)}>
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
              + Új kampány
            </button>
          </div>
        </div>

        {/* KPI overview */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Kampányok áttekintése</div>
          <div className="out-kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="out-kpi-stat" style={{ borderColor: 'rgba(139,92,246,0.25)' }}>
              <div className="out-kpi-value">{totalCampaigns}</div>
              <div className="out-kpi-label">Összes kampány</div>
            </div>
            <div className="out-kpi-stat" style={{ borderColor: 'rgba(34,197,94,0.25)' }}>
              <div className="out-kpi-value" style={{ color: '#22c55e' }}>{avgOpen}%</div>
              <div className="out-kpi-label">Megnyitási arány</div>
            </div>
            <div className="out-kpi-stat" style={{ borderColor: 'rgba(59,130,246,0.25)' }}>
              <div className="out-kpi-value" style={{ color: '#3b82f6' }}>{avgClick}%</div>
              <div className="out-kpi-label">Átkattintási arány</div>
            </div>
            <div className="out-kpi-stat" style={{ borderColor: 'rgba(139,92,246,0.25)' }}>
              <div className="out-kpi-value">{totalSent}</div>
              <div className="out-kpi-label">Elküldött összesen</div>
            </div>
          </div>
        </div>

        {/* Status filter tabs + selection bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <div className="out-view-switcher" style={{ marginBottom: 0 }}>
            {STATUS_FILTERS.map(f => (
              <button key={f} className={`out-view-btn ${filter === f ? 'active' : ''}`} onClick={() => { setFilter(f); setSelectedIds(new Set()); }}>
                {STATUS_LABELS[f]}
              </button>
            ))}
          </div>

          {/* Selection toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {selectedIds.size > 0 && (
              <>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6', marginRight: 4 }}>
                  {selectedIds.size} kijelölve
                </span>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                >
                  Összes megszüntetése
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  style={{ padding: '5px 14px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s' }}
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 13, height: 13 }}>
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                  {bulkDeleting ? 'Törlés...' : 'Kijelöltek törlése'}
                </button>
              </>
            )}
            {selectedIds.size === 0 && filtered.length > 0 && (
              <button
                onClick={toggleSelectAll}
                style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
              >
                Összes kijelölése
              </button>
            )}
          </div>
        </div>

        {/* Campaign cards grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <svg fill="none" stroke="var(--text-dim)" strokeWidth="1.5" viewBox="0 0 24 24" style={{ width: 48, height: 48, marginBottom: 12, opacity: 0.4 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p style={{ fontSize: 14 }}>
              {filter === 'all' ? 'Még nincsenek kampányok. Kattints a "+ Új kampány" gombra!' : `Nincs "${STATUS_LABELS[filter]}" státuszú kampány.`}
            </p>
          </div>
        ) : (
          <div className="out-campaign-grid">
            {filtered.map(c => {
              const sb = STATUS_BADGE[c.status] || STATUS_BADGE.draft;
              const cs = getCampaignStats(c);
              const isSelected = selectedIds.has(c.id);
              const typeName = TYPE_LABELS[c.type] || 'Hírlevél';

              return (
                <div key={c.id} className="out-campaign-card" style={{ cursor: 'pointer', outline: isSelected ? '2px solid #8b5cf6' : 'none', outlineOffset: -2, transition: 'outline 0.15s' }} onClick={() => setShowDetailModal(c)}>
                  {/* Checkbox */}
                  <div
                    style={{ position: 'absolute', top: 10, right: 10, zIndex: 2 }}
                    onClick={e => { e.stopPropagation(); toggleSelect(c.id); }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 6,
                      border: isSelected ? '2px solid #8b5cf6' : '2px solid var(--border)',
                      background: isSelected ? '#8b5cf6' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                      {isSelected && (
                        <svg fill="none" stroke="#fff" strokeWidth="3" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </div>
                  {/* Channel + status badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(139,92,246,0.08)', color: '#8b5cf6', padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600 }}>
                      📧 {typeName}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: sb.bg, color: sb.color, padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: sb.color, display: 'inline-block' }} />
                      {sb.label}
                    </span>
                  </div>

                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span>Összes feliratkozó</span>
                    <span>·</span>
                    <span>{c.created_at ? new Date(c.created_at).toLocaleDateString('hu-HU') : '-'}</span>
                    {(c.subject_line || c.subject) && (
                      <>
                        <span>·</span>
                        <span>📧 {c.subject_line || c.subject}</span>
                      </>
                    )}
                  </div>

                  {/* Stats - only show if has data */}
                  {cs.delivered > 0 && (
                    <div style={{ display: 'flex', gap: 20, marginBottom: 14, fontSize: 12 }}>
                      <div><span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{cs.delivered}</span> <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 9, fontWeight: 600, letterSpacing: '0.3px' }}>Megnyitás</span></div>
                      <div><span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{cs.clicks}</span> <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 9, fontWeight: 600, letterSpacing: '0.3px' }}>Kattintás</span></div>
                      <div><span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{cs.openRate}%</span> <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 9, fontWeight: 600, letterSpacing: '0.3px' }}>Open rate</span></div>
                    </div>
                  )}
                  {cs.delivered === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14, fontStyle: 'italic' }}>Még nincs statisztika</div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                    {c.status === 'draft' && (
                      <>
                        <ActionBtn label="Küldés" color="#8b5cf6" onClick={() => handleSend(c.id)} />
                        <ActionBtn label="⏱ Ütemezés" color="var(--text-muted)" onClick={() => setShowDetailModal(c)} />
                      </>
                    )}
                    {c.status === 'sent' && c.brevo_campaign_id && (
                      <ActionBtn label="📊 Frissítés" color="var(--text-muted)" onClick={() => handleRefreshStats(c.id)} />
                    )}
                    <ActionBtn label="🗑 Törlés" color="#ef4444" onClick={() => handleDelete(c.id)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ New Campaign Modal — DIGIDESK_OLD port ═══ */}
      {showNewModal && (
        <div className="mkt-modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="mkt-modal-card" style={{ width: 640 }} onClick={e => e.stopPropagation()}>
            <div className="mkt-modal-header">
              <div className="mkt-modal-title">Új e-mail kampány</div>
              <button className="mkt-modal-close" onClick={() => setShowNewModal(false)}>
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mkt-form-row">
              <label>Kampány neve</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="pl. Nyári akció 2026" />
            </div>
            <div className="mkt-form-row">
              <label>Típus</label>
              <select value={newType} onChange={e => setNewType(e.target.value)}>
                <option value="newsletter">Hírlevél</option>
                <option value="promotion">Promóció</option>
                <option value="drip">Automatizált sorozat</option>
                <option value="transactional">Tranzakciós</option>
              </select>
            </div>
            <div className="mkt-form-row">
              <label>Célcsoport szegmens</label>
              <select value={newSegment} onChange={e => setNewSegment(e.target.value)}>
                <option>Összes feliratkozó</option>
                <option>VIP ügyfelek</option>
                <option>Aktív vásárlók</option>
                <option>Inaktív ügyfelek (3+ hónap)</option>
                <option>Új feliratkozók (30 nap)</option>
              </select>
            </div>

            {/* Mode Toggle: Szabadkéz | AI Varázsló */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', borderRadius: 10, padding: 4, margin: '16px 0 12px' }}>
              <button
                onClick={() => setEditorMode('manual')}
                style={{ flex: 1, padding: '8px 0', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit', background: editorMode === 'manual' ? '#8b5cf6' : 'transparent', color: editorMode === 'manual' ? '#fff' : 'var(--text-muted)' }}
              >
                ✏️ Szabadkéz
              </button>
              <button
                onClick={() => setEditorMode('ai')}
                style={{ flex: 1, padding: '8px 0', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit', background: editorMode === 'ai' ? '#8b5cf6' : 'transparent', color: editorMode === 'ai' ? '#fff' : 'var(--text-muted)' }}
              >
                🤖 AI Varázsló
              </button>
            </div>

            {/* ── Manual Mode ── */}
            {editorMode === 'manual' && (
              <div>
                <div className="mkt-form-row">
                  <label>Tárgysor</label>
                  <input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Az e-mail tárgysora" />
                </div>
                <div className="mkt-form-row">
                  <label>Tárgysor B (A/B teszt)</label>
                  <input value={newSubjectB} onChange={e => setNewSubjectB(e.target.value)} placeholder="Opcionális — alternatív tárgysor" />
                </div>
                <div className="mkt-form-row">
                  <label>E-mail szövege</label>
                  <div style={{ border: '1.5px solid rgba(139,92,246,0.3)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg)' }}>
                    <ReactQuill
                      theme="snow"
                      value={newBody}
                      onChange={setNewBody}
                      placeholder="Írj formázott email tartalmat... Címsorok, linkek, listák, félkövér szöveg."
                      modules={{
                        toolbar: [
                          [{ header: [1, 2, 3, false] }],
                          ['bold', 'italic', 'underline', 'strike'],
                          [{ color: [] }, { background: [] }],
                          [{ list: 'ordered' }, { list: 'bullet' }, { align: [] }],
                          ['link', 'blockquote', 'clean'],
                        ],
                      }}
                      style={{ minHeight: 160 }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-dim)' }}>
                      <div style={{ display: 'flex', gap: 14 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}>
                            <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          Link = kattintás tracking
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}>
                            <path d="M4 6h16M4 12h16m-7 6h7" />
                          </svg>
                          CTA gomb növeli a konverziót
                        </span>
                      </div>
                      <span style={{ background: 'var(--bg3)', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>
                        {(newBody || '').replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(Boolean).length} szó
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── AI Mode ── */}
            {editorMode === 'ai' && (
              <div>
                <div className="mkt-form-row">
                  <label>Hangnem</label>
                  <select value={aiTone} onChange={e => setAiTone(e.target.value)}>
                    <option value="professzionális">Professzionális</option>
                    <option value="barátságos">Barátságos</option>
                    <option value="lelkesítő">Lelkesítő / Akciós</option>
                    <option value="informatív">Informatív</option>
                    <option value="ünnepi">Ünnepi</option>
                  </select>
                </div>
                <div className="mkt-form-row">
                  <label>Utasítás az AI-nak</label>
                  <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={4} placeholder="Pl.: Írj egy nyári akciós hírlevelet, ahol 20% kedvezményt adunk minden fóliázásra augusztus végéig. Említsd meg hogy limitált helyek vannak." style={{ fontSize: 13, lineHeight: 1.6 }} />
                </div>
                <button
                  onClick={handleAiGenerate}
                  disabled={aiGenerating}
                  style={{ width: '100%', padding: 10, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, transition: 'opacity 0.2s', fontFamily: 'inherit', opacity: aiGenerating ? 0.7 : 1 }}
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}>
                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  {aiGenerating ? 'Generálás...' : 'Generálás'}
                </button>

                {/* AI Result */}
                {aiGenerated && (
                  <div style={{ animation: 'mktFadeIn 0.3s ease' }}>
                    <div className="mkt-form-row">
                      <label>📨 AI által generált tárgysor <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>(szerkeszthető)</span></label>
                      <input value={aiSubject} onChange={e => setAiSubject(e.target.value)} />
                    </div>
                    <div className="mkt-form-row">
                      <label>📝 AI által generált szöveg <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>(szerkeszthető)</span></label>
                      <textarea value={aiBody} onChange={e => setAiBody(e.target.value)} rows={6} style={{ fontSize: 13, lineHeight: 1.6 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -8, marginBottom: 8 }}>
                      <svg fill="none" stroke="#22c55e" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 14, height: 14, flexShrink: 0 }}>
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Ellenőrizd és szerkeszd a tartalmat, majd kattints a Létrehozásra!</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
              <button className="mkt-btn-outline" onClick={() => setShowNewModal(false)}>Mégse</button>
              <button className="mkt-btn-accent" onClick={handleCreate} disabled={creating}>
                {creating ? 'Létrehozás...' : 'Létrehozás'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Campaign Detail Modal — DIGIDESK_OLD port (cpv- design) ═══ */}
      {detail && detailStats && detailStatusBadge && (
        <div className="cpv-overlay" onClick={() => setShowDetailModal(null)}>
          <div className="cpv-card" onClick={e => e.stopPropagation()}>
            {/* ── Header with gradient ── */}
            <div className="cpv-header">
              <button className="cpv-close" onClick={() => setShowDetailModal(null)}>✕</button>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <span className="cpv-badge cpv-badge-status">{detailStatusBadge.label.toUpperCase()}</span>
                <span className="cpv-badge cpv-badge-channel">{TYPE_LABELS[detailType] || detailType}</span>
              </div>
              <h2 className="cpv-name">{detail.name}</h2>
              {detailSubject && (
                <div className="cpv-subject">
                  <span>📧</span> {detailSubject}
                </div>
              )}
            </div>

            {/* ── Scrollable body ── */}
            <div className="cpv-body">
              {/* Meta info row */}
              <div className="cpv-meta">
                <span>🕐 Létrehozva: <b>{detail.created_at ? new Date(detail.created_at).toLocaleString('hu-HU') : '—'}</b></span>
                <span>👥 Címzettek: <b>{detail.recipients_count || subCount} fő</b></span>
                {detail.sent_at && <span>📤 Küldve: <b>{new Date(detail.sent_at).toLocaleString('hu-HU')}</b></span>}
                {detail.scheduled_at && detail.status === 'scheduled' && <span>📅 Ütemezve: <b>{new Date(detail.scheduled_at).toLocaleString('hu-HU')}</b></span>}
              </div>

              <div className="cpv-content">
                {/* Segment */}
                <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--text-muted)' }}>
                  🏷️ Szegmens: <b style={{ color: 'var(--text)' }}>{detail.segment_name || 'Összes feliratkozó'}</b>
                </div>

                {/* ── Performance Stats ── */}
                <div className="cpv-section-title">📊 KAMPÁNY TELJESÍTMÉNY</div>
                <div className="cpv-stats-grid">
                  <div className="cpv-stat">
                    <div className="cpv-stat-icon" style={{ background: 'rgba(139,92,246,0.1)' }}>📬</div>
                    <div className="cpv-stat-num" style={{ color: '#8b5cf6' }}>{detailStats.delivered}</div>
                    <div className="cpv-stat-label">KÉZBESÍTVE</div>
                  </div>
                  <div className="cpv-stat">
                    <div className="cpv-stat-icon" style={{ background: 'rgba(34,197,94,0.1)' }}>👁</div>
                    <div className="cpv-stat-num" style={{ color: '#22c55e' }}>{detailStats.opens}</div>
                    <div className="cpv-stat-label">MEGNYITÁS</div>
                    <div className="cpv-stat-pct">{detailStats.openRate}%</div>
                  </div>
                  <div className="cpv-stat">
                    <div className="cpv-stat-icon" style={{ background: 'rgba(59,130,246,0.1)' }}>🖱</div>
                    <div className="cpv-stat-num" style={{ color: '#3b82f6' }}>{detailStats.clicks}</div>
                    <div className="cpv-stat-label">KATTINTÁS</div>
                    <div className="cpv-stat-pct">{detailStats.clickRate}%</div>
                  </div>
                  <div className="cpv-stat">
                    <div className="cpv-stat-icon" style={{ background: 'rgba(239,68,68,0.1)' }}>🔄</div>
                    <div className="cpv-stat-num" style={{ color: '#ef4444' }}>{detailStats.bounces}</div>
                    <div className="cpv-stat-label">VISSZAPATTANT</div>
                    <div className="cpv-stat-pct">{detailStats.bounceRate}%</div>
                  </div>
                </div>

                {/* ── Email Content Preview ── */}
                {detailBody && (
                  <>
                    <div className="cpv-section-title">📧 EMAIL TARTALOM</div>
                    <div className="cpv-email-card">
                      <div className="cpv-email-header">
                        <span>EAISY Marketing</span>
                      </div>
                      <div className="cpv-email-body">{detailBody}</div>
                    </div>
                  </>
                )}

                {/* ── Recipients ── */}
                <div className="cpv-section-title">👥 CÍMZETTEK ({detail.recipients_count || subCount})</div>
                <div className="cpv-recipient">
                  <div className="cpv-avatar" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.15))', color: '#8b5cf6' }}>
                    {(detail.segment_name || 'Ö')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{detail.segment_name || 'Összes feliratkozó'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{detail.recipients_count || subCount} címzett</div>
                  </div>
                  {detail.status === 'sent' && (
                    <span className="mkt-badge mkt-badge-green">✓ Kézbesítve</span>
                  )}
                </div>

                {/* ── Schedule picker (only for draft) ── */}
                {detail.status === 'draft' && (
                  <div style={{ marginTop: 20, padding: 16, background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>📅 Ütemezés</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="datetime-local"
                        value={scheduleDate}
                        onChange={e => setScheduleDate(e.target.value)}
                        style={{ flex: 1, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--bg)' }}
                      />
                      <button className="cpv-btn cpv-btn-start" onClick={() => handleSchedule(detail.id)} disabled={scheduling || !scheduleDate}>
                        {scheduling ? '⏳' : '📅'} Ütemezés
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="cpv-footer">
              {detail.status === 'draft' && (
                <button className="cpv-btn cpv-btn-start" onClick={() => handleSend(detail.id)}>
                  ✉️ Kampány küldése
                </button>
              )}
              {detail.status === 'sent' && detail.brevo_campaign_id && (
                <button className="cpv-btn cpv-btn-start" onClick={() => handleRefreshStats(detail.id)} disabled={refreshingStats}>
                  {refreshingStats ? '⏳ Frissítés...' : '📊 Stat frissítés'}
                </button>
              )}
              <button className="cpv-btn cpv-btn-delete" onClick={() => handleDelete(detail.id)}>
                🗑 Törlés
              </button>
              <button className="cpv-btn cpv-btn-close" onClick={() => setShowDetailModal(null)}>
                Bezárás
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Subscriber Management Modal ═══ */}
      {showSubModal && <SubscriberModal
        onClose={() => { setShowSubModal(false); loadSubCount(); }}
        onAdd={handleAddSubscriber}
        subEmail={subEmail} setSubEmail={setSubEmail}
        subName={subName} setSubName={setSubName}
      />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SubscriberModal — Feliratkozók kezelése (DIGIDESK_OLD port)
   ═══════════════════════════════════════════════════════════════ */

interface Subscriber {
  id: string;
  email: string;
  name: string;
  status: string;
  tags: string[];
  created_at: string;
}

interface SubscriberModalProps {
  onClose: () => void;
  onAdd: () => Promise<void>;
  subEmail: string;
  setSubEmail: (v: string) => void;
  subName: string;
  setSubName: (v: string) => void;
}

function SubscriberModal({ onClose, onAdd, subEmail, setSubEmail, subName, setSubName }: SubscriberModalProps) {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 8;

  const loadSubs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/marketing/api/subscribers');
      if (res.ok) setSubscribers(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadSubs(); }, [loadSubs]);

  // Stats
  const total = subscribers.length;
  const active = subscribers.filter(s => s.status === 'active').length;
  const inactive = total - active;

  // Search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return subscribers;
    const q = search.toLowerCase();
    return subscribers.filter(s =>
      s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q)
    );
  }, [subscribers, search]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);

  const handleAdd = async () => {
    await onAdd();
    loadSubs();
    setShowAddForm(false);
    setSubEmail('');
    setSubName('');
  };

  // Avatar colors
  const avatarColors = ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];
  const getAvatarColor = (idx: number) => avatarColors[idx % avatarColors.length];

  return (
    <div className="mkt-modal-overlay" onClick={onClose}>
      <div className="mkt-modal-card" style={{ width: 620, padding: 0 }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>👥</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Feliratkozók kezelése</span>
          </div>
          <button className="mkt-modal-close" onClick={onClose}>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ padding: '0 24px 20px' }}>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ padding: '12px 16px', border: '1.5px solid var(--border)', borderRadius: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Összes</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{total}</div>
            </div>
            <div style={{ padding: '12px 16px', border: '1.5px solid rgba(34,197,94,0.25)', borderRadius: 12, background: 'rgba(34,197,94,0.03)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Aktív</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>{active}</div>
            </div>
            <div style={{ padding: '12px 16px', border: '1.5px solid var(--border)', borderRadius: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Inaktív</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{inactive}</div>
            </div>
          </div>

          {/* Search + Add button */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <svg fill="none" stroke="var(--text-dim)" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 16, height: 16, position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Keresés név vagy e-mail alapján..."
                style={{ width: '100%', padding: '9px 14px 9px 36px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--bg)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <button className="mkt-btn-outline" style={{ whiteSpace: 'nowrap', padding: '8px 16px', fontWeight: 700 }} onClick={() => setShowAddForm(!showAddForm)}>
              + Új
            </button>
          </div>

          {/* Inline add form */}
          {showAddForm && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14, padding: '14px 16px', border: '1.5px solid rgba(139,92,246,0.2)', borderRadius: 12, background: 'rgba(139,92,246,0.02)', animation: 'mktFadeIn 0.2s ease' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>E-mail cím *</div>
                <input
                  type="email"
                  value={subEmail}
                  onChange={e => setSubEmail(e.target.value)}
                  placeholder="pelda@email.com"
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--card)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Név</div>
                <input
                  value={subName}
                  onChange={e => setSubName(e.target.value)}
                  placeholder="Teszt Felhasználó"
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--card)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <button className="mkt-btn-accent" style={{ padding: '8px 18px', fontSize: 12, whiteSpace: 'nowrap', borderRadius: 10 }} onClick={handleAdd}>
                + Hozzáad
              </button>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30 }}><Spinner /></div>
          ) : (
            <>
              <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1.4fr 80px 90px', gap: 0, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>#</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Név</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>E-mail</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Státusz</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Dátum</span>
                </div>
                {/* Table rows */}
                {pageItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>
                    {search ? 'Nincs találat' : 'Még nincsenek feliratkozók'}
                  </div>
                ) : pageItems.map((s, i) => (
                  <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1.4fr 80px 90px', gap: 0, padding: '10px 16px', borderBottom: i < pageItems.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', transition: 'background 0.15s' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{(page - 1) * perPage + i + 1}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, background: getAvatarColor((page - 1) * perPage + i),
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0
                      }}>
                        {(s.name || s.email || '?')[0].toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name || '—'}
                      </span>
                    </div>
                    <span style={{ fontSize: 12.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</span>
                    <span className="ec-badge" style={{
                      background: s.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                      color: s.status === 'active' ? '#22c55e' : '#ef4444',
                      fontSize: 10, padding: '2px 8px'
                    }}>
                      {s.status === 'active' ? 'Aktív' : 'Inaktív'}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
                      {s.created_at ? new Date(s.created_at).toLocaleDateString('hu-HU') : '—'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {filtered.length > 0 ? `${(page - 1) * perPage + 1}-${Math.min(page * perPage, filtered.length)} / ${filtered.length}` : '0'}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { label: '«', action: () => setPage(1), disabled: page === 1 },
                    { label: '‹', action: () => setPage(p => Math.max(1, p - 1)), disabled: page === 1 },
                    { label: `${page} / ${totalPages}`, action: () => {}, disabled: true, highlight: true },
                    { label: '›', action: () => setPage(p => Math.min(totalPages, p + 1)), disabled: page === totalPages },
                    { label: '»', action: () => setPage(totalPages), disabled: page === totalPages },
                  ].map((btn, i) => (
                    <button
                      key={i}
                      onClick={btn.action}
                      disabled={btn.disabled && !btn.highlight}
                      style={{
                        width: btn.highlight ? 'auto' : 30, height: 30, padding: btn.highlight ? '0 10px' : 0,
                        border: `1.5px solid ${btn.highlight ? 'var(--marketing-accent)' : 'var(--border)'}`,
                        borderRadius: 8, background: btn.highlight ? 'rgba(139,92,246,0.08)' : 'var(--card)',
                        color: btn.highlight ? 'var(--marketing-accent)' : 'var(--text-muted)',
                        fontSize: 12, fontWeight: btn.highlight ? 700 : 500, cursor: btn.disabled && !btn.highlight ? 'default' : 'pointer',
                        fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: btn.disabled && !btn.highlight ? 0.4 : 1, transition: 'all 0.15s'
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="mkt-btn-outline" onClick={onClose}>Bezárás</button>
        </div>
      </div>
    </div>
  );
}

/* ── ActionBtn helper (same as OutboundPage) ── */
function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        background: `${color}10`,
        border: `1px solid ${color}40`,
        color,
        padding: '6px 14px',
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.2s',
      }}
    >
      {label}
    </button>
  );
}
