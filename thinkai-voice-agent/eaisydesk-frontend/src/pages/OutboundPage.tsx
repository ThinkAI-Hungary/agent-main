/**
 * OutboundPage – 1:1 port of legacy Kimenő kommunikáció
 * Features: campaign list/cards, KPI stats, status filter, reminder toggle,
 * campaign creation, start/stop/delete, analytics summary.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { authFetch } from '../api/client';
import { fmtDt } from '../helpers/formatters';
import Spinner from '../components/ui/Spinner';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { showToast } from '../components/ui/Toast';

interface Campaign {
  id: number;
  name: string;
  status: string;
  channels: string[];
  channel?: string;
  client_ids: number[];
  created_at: string;
  processed_count?: number;
  total_count?: number;
  content?: string;
}

const STATUS_FILTERS = ['Összes', 'Tervezet', 'Aktív', 'Elküldött', 'Ütemezett'] as const;

const STATUS_MAP: Record<string, string> = {
  'Tervezet': 'Vázlat',
  'Aktív': 'Aktív',
  'Elküldött': 'Befejezett',
  'Ütemezett': 'Ütemezett',
};

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  'Vázlat':     { bg: 'rgba(107,139,153,0.1)', color: 'var(--text-muted)', label: 'Tervezet' },
  'Aktív':      { bg: 'rgba(34,197,94,0.1)',    color: '#22c55e',           label: 'Aktív' },
  'Befejezett': { bg: 'rgba(28,238,224,0.1)',   color: 'var(--accent)',     label: 'Elküldött' },
  'Megállítva': { bg: 'rgba(245,158,11,0.1)',   color: '#f59e0b',          label: 'Megállítva' },
  'Ütemezett':  { bg: 'rgba(139,92,246,0.1)',   color: '#8b5cf6',          label: 'Ütemezett' },
};

const CHANNEL_ICONS: Record<string, string> = { email: '📧', whatsapp: '💬', telefon: '📞', messenger: '💬', instagram: '📸' };
const CHANNEL_NAMES: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp', telefon: 'Telefon', messenger: 'Messenger', instagram: 'Instagram' };

export default function OutboundPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('Összes');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignChannels, setNewCampaignChannels] = useState<string[]>(['email']);
  const [newCampaignContent, setNewCampaignContent] = useState('');
  const { confirm, ConfirmDialog } = useConfirm();

  // ── Load campaigns ──
  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/admin/api/campaigns');
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load reminder status ──
  useEffect(() => {
    loadCampaigns();
    authFetch('/admin/api/settings/reminder').then(r => r.json()).then(data => {
      if (data) setReminderEnabled(!!data.reminder_enabled);
    }).catch(() => {});
  }, [loadCampaigns]);

  // ── KPIs ──
  const kpis = useMemo(() => ({
    total: campaigns.length,
    running: campaigns.filter(c => c.status === 'Aktív').length,
    closed: campaigns.filter(c => c.status === 'Befejezett').length,
    targeted: campaigns.reduce((sum, c) => sum + (c.client_ids?.length || 0), 0),
  }), [campaigns]);

  // ── Filtered campaigns ──
  const filteredCampaigns = useMemo(() => {
    if (activeFilter === 'Összes') return campaigns;
    const targetStatus = STATUS_MAP[activeFilter];
    return campaigns.filter(c => c.status === targetStatus);
  }, [campaigns, activeFilter]);

  // ── Actions ──
  const handleToggleReminder = useCallback(async (enabled: boolean) => {
    setReminderEnabled(enabled);
    try {
      const getRes = await authFetch('/admin/api/settings/reminder');
      const current = await getRes.json();
      const res = await authFetch('/admin/api/settings/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminder_enabled: enabled, reminder_hours: current.reminder_hours || 24, reminder_template: current.reminder_template || '' }),
      });
      if (!res.ok) throw new Error();
      showToast(enabled ? 'Emlékeztető bekapcsolva!' : 'Emlékeztető kikapcsolva!');
    } catch {
      setReminderEnabled(!enabled);
      showToast('Hiba a mentés során!', 'error');
    }
  }, []);

  const handleStartCampaign = useCallback(async (id: number) => {
    try {
      const res = await authFetch(`/admin/api/campaigns/${id}/start`, { method: 'POST' });
      if (res.ok) { showToast('Kampány elindítva!'); loadCampaigns(); }
      else showToast('Hiba az indításnál', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [loadCampaigns]);

  const handleStopCampaign = useCallback(async (id: number) => {
    try {
      const res = await authFetch(`/admin/api/campaigns/${id}/stop`, { method: 'POST' });
      if (res.ok) { showToast('Kampány megállítva'); loadCampaigns(); }
      else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [loadCampaigns]);

  const handleDeleteCampaign = useCallback(async (id: number) => {
    const ok = await confirm('Biztosan törlöd ezt a kampányt?', { title: 'Kampány törlése', danger: true });
    if (!ok) return;
    try {
      const res = await authFetch(`/admin/api/campaigns/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Kampány törölve'); loadCampaigns(); }
      else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [confirm, loadCampaigns]);

  const handleCreateCampaign = useCallback(async () => {
    if (!newCampaignName.trim()) { showToast('A kampány neve kötelező!', 'error'); return; }
    try {
      const res = await authFetch('/admin/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCampaignName.trim(), channels: newCampaignChannels, content: newCampaignContent, client_ids: [] }),
      });
      if (res.ok) {
        showToast('Kampány létrehozva!');
        setShowNewCampaign(false);
        setNewCampaignName('');
        setNewCampaignContent('');
        loadCampaigns();
      } else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [newCampaignName, newCampaignChannels, newCampaignContent, loadCampaigns]);

  const toggleChannel = useCallback((ch: string) => {
    setNewCampaignChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);
  }, []);

  return (
    <div className="analytics-shell">
      <ConfirmDialog />

      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg, rgba(28,238,224,0.15), rgba(59,130,246,0.15))', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
            <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 24, height: 24 }}>
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </div>
          <div>
            <div className="page-title" style={{ margin: 0 }}>Kimenő kommunikáció</div>
            <div className="page-subtitle" style={{ margin: 0 }}>Kampányok kezelése és kimenő üzenetek irányítása</div>
          </div>
        </div>
      </div>

      {/* Event-driven actions */}
      <div className="out-section">
        <div className="out-section-title">
          <div className="out-section-icon" style={{ background: 'rgba(34,197,94,0.12)' }}>
            <svg fill="none" stroke="#22c55e" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          Eseményvezérelt akciók
        </div>
        <div className="out-notif-item">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(28,238,224,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Időpont emlékeztető</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Automatikus e-mail emlékeztetők</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label className="tt-toggle" style={{ transform: 'scale(0.8)' }}>
              <input type="checkbox" checked={reminderEnabled} onChange={(e) => handleToggleReminder(e.target.checked)} />
              <span className="tt-toggle-slider" />
            </label>
            <span style={{ fontSize: 11, fontWeight: 600, color: reminderEnabled ? '#22c55e' : 'var(--text-muted)' }}>
              {reminderEnabled ? 'Aktív' : 'Kikapcsolva'}
            </span>
          </div>
        </div>
      </div>

      {/* Campaigns section */}
      <div className="out-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div className="out-section-title" style={{ marginBottom: 0 }}>
            <div className="out-section-icon" style={{ background: 'rgba(28,238,224,0.12)' }}>
              <svg fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
            </div>
            Kampányok
          </div>
          <button onClick={() => setShowNewCampaign(true)} className="out-new-campaign-btn">
            <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            + ÚJ KAMPÁNY
          </button>
        </div>

        {/* KPI overview */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Összes kampány" value={kpis.total} icon="📊" />
          <KpiCard label="Futó" value={kpis.running} icon="▶" color="#22c55e" />
          <KpiCard label="Befejezett" value={kpis.closed} icon="✓" color="var(--accent)" />
          <KpiCard label="Célzott ügyfelek" value={kpis.targeted} icon="👥" />
        </div>

        {/* Status filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map((tab) => (
            <button
              key={tab}
              className={`out-view-btn ${activeFilter === tab ? 'active' : ''}`}
              onClick={() => setActiveFilter(tab)}
              style={{
                padding: '6px 16px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: activeFilter === tab ? 'rgba(28,238,224,0.1)' : 'var(--card)',
                color: activeFilter === tab ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Campaign grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
        ) : filteredCampaigns.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <svg fill="none" stroke="var(--text-dim)" strokeWidth="1.5" viewBox="0 0 24 24" style={{ width: 48, height: 48, marginBottom: 12, opacity: 0.4 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            <p style={{ fontSize: 14 }}>
              {activeFilter === 'Összes' ? 'Még nincsenek kampányok. Kattints a "+ ÚJ KAMPÁNY" gombra!' : `Nincsenek "${activeFilter}" státuszú kampányok.`}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {filteredCampaigns.map((c) => {
              const st = STATUS_COLORS[c.status] || STATUS_COLORS['Vázlat'];
              const channels = c.channels || (c.channel ? [c.channel] : ['email']);
              const clientCount = c.client_ids?.length || 0;

              return (
                <div key={c.id} className="out-campaign-card" style={{ cursor: 'default' }}>
                  {/* Channel + status badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {channels.map((ch) => (
                      <span key={ch} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(59,130,246,0.08)', color: '#3b82f6', padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600 }}>
                        {CHANNEL_ICONS[ch] || ''} {CHANNEL_NAMES[ch] || ch}
                      </span>
                    ))}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: st.bg, color: st.color, padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.color, display: 'inline-block' }} />
                      {st.label}
                    </span>
                  </div>

                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span>{c.status === 'Aktív' ? `${c.processed_count || 0}/${c.total_count || clientCount} feldolgozva` : `${clientCount} ügyfél célozva`}</span>
                    <span>·</span>
                    <span>{c.created_at ? new Date(c.created_at).toLocaleDateString('hu-HU') : '-'}</span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <ActionBtn label="Törlés" color="#ef4444" onClick={() => handleDeleteCampaign(c.id)} />
                    {(c.status === 'Vázlat' || c.status === 'Megállítva') && (
                      <>
                        <ActionBtn label="▶ Indítás" color="#22c55e" onClick={() => handleStartCampaign(c.id)} />
                      </>
                    )}
                    {c.status === 'Aktív' && (
                      <ActionBtn label="⏸ Megállítás" color="#f59e0b" onClick={() => handleStopCampaign(c.id)} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Campaign Modal */}
      {showNewCampaign && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowNewCampaign(false)}>
          <div style={{ background: 'var(--card, #fff)', borderRadius: 16, padding: 28, width: 480, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Új kampány létrehozása</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Kampány neve *</label>
                <input
                  type="text" value={newCampaignName} onChange={(e) => setNewCampaignName(e.target.value)}
                  placeholder="Pl. Nyári akció 2025"
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>Csatornák</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(CHANNEL_NAMES).map(([key, name]) => (
                    <button
                      key={key}
                      onClick={() => toggleChannel(key)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: `1px solid ${newCampaignChannels.includes(key) ? 'var(--accent)' : 'var(--border)'}`,
                        background: newCampaignChannels.includes(key) ? 'rgba(28,238,224,0.06)' : 'var(--bg)',
                        color: newCampaignChannels.includes(key) ? 'var(--accent)' : 'var(--text-muted)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {CHANNEL_ICONS[key]} {name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Tartalom</label>
                <textarea
                  value={newCampaignContent} onChange={(e) => setNewCampaignContent(e.target.value)}
                  rows={4}
                  placeholder="Írj kampány tartalmat..."
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowNewCampaign(false)} style={{ padding: '10px 20px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Mégse</button>
              <button onClick={handleCreateCampaign} style={{ padding: '10px 20px', border: 'none', background: 'linear-gradient(135deg,#1ceee0,#0bbdb1)', color: '#082432', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(28,238,224,0.3)' }}>Létrehozás</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon, color }: { label: string; value: number; icon: string; color?: string }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--text)', fontFamily: 'Inter, sans-serif' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
    </div>
  );
}

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
