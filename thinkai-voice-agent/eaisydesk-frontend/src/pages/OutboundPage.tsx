/**
 * OutboundPage – Kimenő kommunikáció / Kampányok (UI Kit)
 * Kártya- és listanézet, státusz chipek, státuszfüggő kebab menük.
 * A régi analitika overlay halott kód volt — eltávolítva.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { authFetch } from '../api/client';

import { OutboundSkeleton } from '../components/ui/Skeleton';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { showToast } from '../components/ui/Toast';
import CampaignWizardModal from '../components/outbound/CampaignWizardModal';
import CampaignCard from '../components/outbound/CampaignCard';
import CampaignDetailPanel from '../components/outbound/CampaignDetailPanel';
import CampaignMenu, { campaignStatusKey, campaignStatusDisplay, getScheduledDate, fmtCreatedDate } from '../components/outbound/CampaignMenu';

// ── Types ─────────────────────────────────────────────────────────────────────

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
  ai_instructions?: string;
  body_html?: string;
  subject?: string;
  email_subject?: string;
  created_by?: string;
}

// ── Státusz konstansok (csak a jelen adminon lévő státuszok) ──────────────────

const STATUS_FILTERS = ['Összes', 'Tervezet', 'Aktív', 'Ütemezett', 'Lezárt'] as const;

const STATUS_MAP: Record<string, string> = {
  'Tervezet': 'Vázlat',
  'Aktív': 'Aktív',
  'Ütemezett': 'Ütemezett',
  'Lezárt': 'Befejezett',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function OutboundPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('Összes');
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showDetail, setShowDetail] = useState<Campaign | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [schedulingId, setSchedulingId] = useState<number | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const { confirm, ConfirmDialog } = useConfirm();

  // ── Load campaigns ──
  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/admin/api/campaigns');
      if (res.ok) {
        const data = await res.json();
        setCampaigns(Array.isArray(data) ? data : (data.campaigns || []));
      } else {
        setCampaigns([]);
      }
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // ── Státusz chipek számlálói ──
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      'Összes': campaigns.length,
      'Tervezet': campaigns.filter(c => c.status === 'Vázlat').length,
      'Aktív': campaigns.filter(c => c.status === 'Aktív').length,
      'Ütemezett': campaigns.filter(c => c.status === 'Ütemezett').length,
      'Lezárt': campaigns.filter(c => c.status === 'Befejezett' || c.status === 'Megállítva').length,
    };
    return counts;
  }, [campaigns]);

  // ── Filtered campaigns ──
  const filteredCampaigns = useMemo(() => {
    if (activeFilter === 'Összes') return campaigns;
    if (activeFilter === 'Lezárt') {
      return campaigns.filter(c => c.status === 'Befejezett' || c.status === 'Megállítva');
    }
    const targetStatus = STATUS_MAP[activeFilter];
    return campaigns.filter(c => c.status === targetStatus);
  }, [campaigns, activeFilter]);

  // ── Actions ──
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
      if (res.ok) { showToast('Kampány megállítva (szüneteltetve)'); loadCampaigns(); }
      else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [loadCampaigns]);

  const handleCloseCampaign = useCallback(async (id: number) => {
    try {
      const res = await authFetch(`/admin/api/campaigns/${id}/close`, { method: 'POST' });
      if (res.ok) { showToast('Kampány lezárva!'); loadCampaigns(); }
      else showToast('Hiba a kampány lezárásakor', 'error');
    } catch { showToast('Hiba a kampány lezárásakor', 'error'); }
  }, [loadCampaigns]);

  const handleDeleteCampaign = useCallback(async (id: number) => {
    const ok = await confirm('Biztosan törlöd ezt a kampányt?', { title: 'Kampány törlése', danger: true });
    if (!ok) return;
    // Optimista törlés: azonnal eltávolítjuk a UI-ból
    const prev = campaigns;
    setCampaigns(c => c.filter(x => x.id !== id));
    showToast('Kampány törölve');
    try {
      const res = await authFetch(`/admin/api/campaigns/${id}`, { method: 'DELETE' });
      if (!res.ok) { setCampaigns(prev); showToast('Törlés sikertelen', 'error'); }
    } catch { setCampaigns(prev); showToast('Törlés sikertelen', 'error'); }
  }, [confirm, campaigns]);

  const handleScheduleCampaign = useCallback(async (id: number, dateStr: string) => {
    if (!dateStr) { showToast('Válassz dátumot!', 'error'); return; }
    try {
      const res = await authFetch(`/admin/api/campaigns/${id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at: dateStr }),
      });
      if (res.ok) {
        showToast('Kampány ütemezve!');
        setSchedulingId(null);
        setScheduleDate('');
        loadCampaigns();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Hiba az ütemezésnél', 'error');
      }
    } catch { showToast('Hiba', 'error'); }
  }, [loadCampaigns]);

  // ── Stable schedule handler for card ──
  const handleOpenSchedule = useCallback((id: number) => {
    setSchedulingId(id);
    setScheduleDate('');
  }, []);

  return (
    <div className="analytics-shell">
      <ConfirmDialog />

      {/* Fejléc sáv: morzsák + cím */}
      <header className="int-page-head">
        <nav className="int-breadcrumbs" aria-label="Navigációs morzsák">
          <span className="int-crumb-link">Kimenő kommunikáció</span>
          <span className="int-crumb-sep">/</span>
          <span className="int-crumb-current">Kampányok</span>
        </nav>
        <h1 className="page-title int-page-title">Kampányok</h1>
      </header>

      {loading ? (
        <OutboundSkeleton />
      ) : (
        <>
          {/* Státusz chipek + nézetváltó + Új kampány */}
          <div className="camp-top-row">
            <div className="camp-chips">
              {STATUS_FILTERS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`camp-chip${activeFilter === tab ? ' is-on' : ''}`}
                  onClick={() => setActiveFilter(tab)}
                >
                  {tab} <span className="camp-chip-count">({tabCounts[tab] ?? 0})</span>
                </button>
              ))}
            </div>

            <div className="camp-top-actions">
              {/* Nézetváltó: kártya / lista */}
              <div className="camp-view-switch" role="group" aria-label="Nézet">
                <button
                  type="button"
                  className={viewMode === 'grid' ? 'is-on' : ''}
                  title="Kártyás nézet"
                  aria-label="Kártyás nézet"
                  onClick={() => setViewMode('grid')}
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="10" rx="1.5" /><rect x="14" y="3" width="7" height="6" rx="1.5" /><rect x="3" y="17" width="7" height="4" rx="1.5" /><rect x="14" y="13" width="7" height="8" rx="1.5" /></svg>
                </button>
                <button
                  type="button"
                  className={viewMode === 'list' ? 'is-on' : ''}
                  title="Listanézet"
                  aria-label="Listanézet"
                  onClick={() => setViewMode('list')}
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                </button>
              </div>

              {/* Új kampány — accent */}
              <button className="cp-btn-accent" onClick={() => setShowNewCampaign(true)}>
                <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="15" height="15"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Új kampány
              </button>
            </div>
          </div>

          {/* Tartalom */}
          {filteredCampaigns.length === 0 ? (
            <div className="empty-state-center">
              <svg fill="none" stroke="var(--text-dim)" strokeWidth="1.5" viewBox="0 0 24 24" className="empty-state-svg">
                <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
              <p className="empty-state-text">
                {activeFilter === 'Összes' ? 'Még nincsenek kampányok. Kattints a „+ Új kampány" gombra!' : `Nincsenek "${activeFilter}" státuszú kampányok.`}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            /* ═══ Kártyás nézet ═══ */
            <div className="camp-grid">
              {filteredCampaigns.map((c) => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  onOpenDetail={setShowDetail}
                  onStart={handleStartCampaign}
                  onStop={handleStopCampaign}
                  onClose={handleCloseCampaign}
                  onDelete={handleDeleteCampaign}
                  onSchedule={handleOpenSchedule}
                />
              ))}
            </div>
          ) : (
            /* ═══ Listanézet ═══ */
            <div className="cd-table-card">
              <div className="cd-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Kampány</th>
                      <th>Státusz</th>
                      <th>Célzott</th>
                      <th>Küldés / ütemezés</th>
                      <th>Létrehozó</th>
                      <th>Létrehozva</th>
                      <th className="cd-done-col" aria-label="Műveletek" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCampaigns.map((c) => (
                      <CampaignListRow
                        key={c.id}
                        campaign={c}
                        onOpenDetail={setShowDetail}
                        onStart={handleStartCampaign}
                        onStop={handleStopCampaign}
                        onClose={handleCloseCampaign}
                        onDelete={handleDeleteCampaign}
                        onSchedule={handleOpenSchedule}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Campaign Detail Panel — lazy mounted */}
      {showDetail && (
        <CampaignDetailPanel
          campaign={showDetail}
          onClose={() => setShowDetail(null)}
          onStart={handleStartCampaign}
          onDelete={handleDeleteCampaign}
          onSchedule={handleOpenSchedule}
        />
      )}

      {/* Schedule Modal */}
      {schedulingId !== null && (
        <div className="cpv-overlay" onClick={() => { setSchedulingId(null); setScheduleDate(''); }}>
          <div className="cpv-schedule-modal" onClick={e => e.stopPropagation()}>
            <div className="cpv-schedule-modal-header">
              <h3 className="cpv-schedule-modal-title">Kampány ütemezése</h3>
              <button className="cpv-close" onClick={() => { setSchedulingId(null); setScheduleDate(''); }} aria-label="Bezárás">
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="cpv-schedule-modal-body">
              <p className="cpv-schedule-modal-desc">
                Válaszd ki, mikor induljon el automatikusan a kampány.
              </p>
              <label className="cpv-schedule-label">Dátum és időpont</label>
              <input
                type="datetime-local" lang="hu"
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
                className="cpv-schedule-input"
                min={new Date().toISOString().slice(0, 16)}
                autoFocus
              />
            </div>
            <div className="cpv-schedule-modal-footer">
              <button className="cd-btn" onClick={() => { setSchedulingId(null); setScheduleDate(''); }}>
                Mégse
              </button>
              <button
                className="cd-btn cd-btn-primary"
                onClick={() => handleScheduleCampaign(schedulingId, scheduleDate)}
                disabled={!scheduleDate}
              >
                Ütemezés megerősítése
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Campaign Wizard */}
      {showNewCampaign && (
        <CampaignWizardModal
          onClose={() => setShowNewCampaign(false)}
          onCreated={loadCampaigns}
        />
      )}
    </div>
  );
}

/** Listanézet egy sora — a kártyával azonos kebab logikával */
export function CampaignListRow({
  campaign: c,
  onOpenDetail,
  onStart,
  onStop,
  onClose,
  onDelete,
  onSchedule,
}: {
  campaign: Campaign;
  onOpenDetail: (campaign: Campaign) => void;
  onStart: (id: number) => void;
  onStop: (id: number) => void;
  onClose: (id: number) => void;
  onDelete: (id: number) => void;
  onSchedule: (id: number) => void;
}) {
  const { label: statusLabel, cls: statusCls } = campaignStatusDisplay(c.status);
  const scheduledDate = getScheduledDate(c.ai_instructions);
  const created = fmtCreatedDate(c.created_at);

  let actionCell: React.ReactNode = <span className="cp-result">—</span>;
  if (c.status === 'Aktív') {
    actionCell = <><span className="cp-time">Indítás:</span> <b className="cp-strong">{fmtCreatedDate(scheduledDate || c.created_at)}</b></>;
  } else if (c.status === 'Ütemezett') {
    actionCell = <><span className="cp-time">Ütemezés:</span> <b className="cp-strong">{fmtCreatedDate(scheduledDate || c.created_at)}</b></>;
  } else if (c.status === 'Befejezett' || c.status === 'Megállítva') {
    actionCell = <><span className="cp-time">Küldés:</span> <b className="cp-strong">{fmtCreatedDate(scheduledDate || c.created_at)}</b></>;
  } else {
    actionCell = <span className="cp-result" style={{ fontStyle: 'italic' }}>nem ütemezett</span>;
  }

  return (
    <tr className="cursor-pointer" onClick={() => onOpenDetail(c)}>
      <td><span className="cp-strong">{c.name}</span></td>
      <td><span className={`cp-badge ${statusCls}`}><i className="cp-dot" />{statusLabel}</span></td>
      <td>
        {c.client_ids?.length
          ? <b className="cp-strong">{c.client_ids.length}</b>
          : <span className="cp-result">—</span>}
      </td>
      <td>{actionCell}</td>
      <td>
        <span className="cp-channel">
          <span className="cp-ch">{(c.created_by || 'A').split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase()}</span>
          {c.created_by || 'Admin'}
        </span>
      </td>
      <td className="cd-time-cell">{created}</td>
      <td className="cd-done-col" onClick={e => e.stopPropagation()}>
        <CampaignMenu
          statusKey={campaignStatusKey(c.status)}
          onStart={() => onStart(c.id)}
          onStop={() => onStop(c.id)}
          onClose={() => onClose(c.id)}
          onDelete={() => onDelete(c.id)}
          onSchedule={() => onSchedule(c.id)}
        />
      </td>
    </tr>
  );
}
