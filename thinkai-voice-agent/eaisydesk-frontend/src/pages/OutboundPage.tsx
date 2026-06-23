/**
 * OutboundPage – Kimenő kommunikáció / Kampányok
 * Optimized: chart options lifted to module-level constants, analytics overlay
 * lazy-rendered, campaign card and detail panel extracted to sub-components.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { authFetch } from '../api/client';

import { OutboundSkeleton } from '../components/ui/Skeleton';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { showToast } from '../components/ui/Toast';
import CampaignWizardModal from '../components/outbound/CampaignWizardModal';
import CampaignCard from '../components/outbound/CampaignCard';
import CampaignDetailPanel from '../components/outbound/CampaignDetailPanel';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend);

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
}

// ── Module-level constants (never change — no useMemo needed) ─────────────────

const STATUS_FILTERS = ['Összes', 'Tervezet', 'Aktív', 'Ütemezett', 'Lezárt'] as const;

const STATUS_MAP: Record<string, string> = {
  'Tervezet': 'Vázlat',
  'Aktív': 'Aktív',
  'Ütemezett': 'Ütemezett',
  'Lezárt': 'Befejezett',
};

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  'Vázlat':     { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', label: 'Tervezet' },
  'Aktív':      { bg: 'rgba(34,197,94,0.1)',    color: '#22c55e',           label: 'Aktív' },
  'Befejezett': { bg: 'rgba(107,114,128,0.1)',   color: '#6b7280',     label: 'Lezárt' },
  'Megállítva': { bg: 'rgba(107,114,128,0.1)',   color: '#6b7280',          label: 'Lezárt' },
  'Ütemezett':  { bg: 'rgba(28,238,224,0.1)',   color: '#1ceee0',          label: 'Ütemezett' },
};

const CHANNEL_NAMES: Record<string, string> = {
  email: 'Email', whatsapp: 'WhatsApp', telefon: 'Telefon',
  messenger: 'Messenger', instagram: 'Instagram',
};

// ── Chart options — static, extracted from useMemo to module level ────────────

const STATUS_CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '62%',
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        padding: 16,
        usePointStyle: true,
        pointStyleWidth: 10,
        font: { size: 11, weight: 'bold' as const },
        color: '#8ea9c0',
      }
    },
    tooltip: {
      backgroundColor: '#0d2538',
      titleFont: { weight: 'bold' as const },
      bodyFont: { size: 12 },
      padding: 12,
      cornerRadius: 10,
      displayColors: true,
      callbacks: {
        label: function(ctx: any) {
          const total = ctx.dataset.data.reduce((a: number, b: number) => a + b, 0);
          const pct = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
          return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
        }
      }
    }
  }
};

const CHANNEL_CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#0d2538',
      padding: 12,
      cornerRadius: 10,
      titleFont: { weight: 'bold' as const },
      callbacks: { label: function(ctx: any) { return ` ${ctx.raw} kampány`; } }
    }
  },
  scales: {
    y: { beginAtZero: true, ticks: { stepSize: 1, font: { weight: 'bold' as const }, color: '#8ea9c0' }, grid: { color: 'rgba(107,139,153,0.15)' } },
    x: { grid: { display: false }, ticks: { font: { weight: 'bold' as const }, color: '#8ea9c0' } }
  }
};

const CLIENTS_CHART_OPTIONS = {
  indexAxis: 'y' as const,
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#0d2538',
      padding: 12,
      cornerRadius: 10,
      callbacks: { label: function(ctx: any) { return ` ${ctx.raw} ügyfél célozva`; } }
    }
  },
  scales: {
    x: { beginAtZero: true, ticks: { stepSize: 1, font: { weight: 'bold' as const }, color: '#8ea9c0' }, grid: { color: 'rgba(107,139,153,0.15)' } },
    y: { grid: { display: false }, ticks: { font: { size: 11, weight: 'bold' as const }, color: '#8ea9c0' } }
  }
};

const TIMELINE_CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { position: 'bottom' as const, labels: { padding: 16, usePointStyle: true, font: { size: 11, weight: 'bold' as const }, color: '#8ea9c0' } },
    tooltip: {
      backgroundColor: '#0d2538',
      padding: 12,
      cornerRadius: 10,
      titleFont: { weight: 'bold' as const }
    }
  },
  scales: {
    y: { beginAtZero: true, ticks: { stepSize: 1, font: { weight: 'bold' as const }, color: '#8ea9c0' }, grid: { color: 'rgba(107,139,153,0.15)' } },
    x: { grid: { display: false }, ticks: { font: { weight: 'bold' as const }, color: '#8ea9c0' } }
  }
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function OutboundPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('Összes');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showDetail, setShowDetail] = useState<Campaign | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
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

  // ── Load reminder status ──
  useEffect(() => {
    loadCampaigns();
    authFetch('/admin/api/settings/reminder')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setReminderEnabled(!!data.reminder_enabled); })
      .catch(() => {});
  }, [loadCampaigns]);

  // ── KPIs + analytics — merged into one useMemo to avoid cascade recompute ──
  const { kpis, analytics } = useMemo(() => {
    const total = campaigns.length;
    const running = campaigns.filter(c => c.status === 'Aktív').length;
    const closed = campaigns.filter(c => c.status === 'Befejezett').length;
    const targeted = campaigns.reduce((sum, c) => sum + (c.client_ids?.length || 0), 0);

    const statusCounts: Record<string, number> = {};
    const channelCounts: Record<string, number> = {};
    campaigns.forEach(c => {
      statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
      const chs = c.channels || (c.channel ? [c.channel] : ['email']);
      chs.forEach(ch => { channelCounts[ch] = (channelCounts[ch] || 0) + 1; });
    });

    const avgClients = total > 0 ? Math.round(targeted / total) : 0;
    const topChannel = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0];
    const successRate = total > 0 ? Math.round((closed / total) * 100) : 0;
    const lastCampaign = total > 0 ? campaigns[0] : null;

    return {
      kpis: { total, running, closed, targeted },
      analytics: { statusCounts, channelCounts, avgClients, topChannel, successRate, lastCampaign },
    };
  }, [campaigns]);

  // ── Chart data (only computed when campaigns change) ──
  const statusChartData = useMemo(() => ({
    labels: ['Tervezet', 'Aktív', 'Elküldött', 'Megállítva', 'Ütemezett'],
    datasets: [{
      data: [
        campaigns.filter(c => c.status === 'Vázlat').length,
        campaigns.filter(c => c.status === 'Aktív').length,
        campaigns.filter(c => c.status === 'Befejezett').length,
        campaigns.filter(c => c.status === 'Megállítva').length,
        campaigns.filter(c => c.status === 'Ütemezett').length,
      ],
      backgroundColor: [
        'rgba(107,139,153,0.6)',
        'rgba(34,197,94,0.8)',
        'rgba(28,238,224,0.8)',
        'rgba(245,158,11,0.8)',
        'rgba(139,92,246,0.8)',
      ],
      borderColor: 'rgba(13, 37, 56, 0.2)',
      borderWidth: 2,
      hoverOffset: 8,
    }]
  }), [campaigns]);

  const channelChartData = useMemo(() => {
    const channelCounts: Record<string, number> = {};
    campaigns.forEach(c => {
      const chs = c.channels || (c.channel ? [c.channel] : ['email']);
      chs.forEach(ch => { channelCounts[ch] = (channelCounts[ch] || 0) + 1; });
    });
    const keys = Object.keys(channelCounts);
    const bgColors = keys.map(k => ({
      email: 'rgba(59,130,246,0.8)',
      messenger: 'rgba(139,92,246,0.8)',
      telefon: 'rgba(34,197,94,0.8)',
      whatsapp: 'rgba(37,211,102,0.8)',
      instagram: 'rgba(225,48,108,0.8)',
    }[k] || 'rgba(28,238,224,0.8)'));
    return {
      labels: keys.map(k => CHANNEL_NAMES[k] || k),
      datasets: [{
        label: 'Kampányok',
        data: Object.values(channelCounts),
        backgroundColor: bgColors,
        borderRadius: 8,
        borderSkipped: false as const,
        barThickness: 30,
        maxBarThickness: 40,
      }]
    };
  }, [campaigns]);

  const clientsChartData = useMemo(() => {
    const sorted = [...campaigns].sort((a, b) => (b.client_ids?.length || 0) - (a.client_ids?.length || 0)).slice(0, 6);
    return {
      labels: sorted.map(c => c.name.length > 18 ? c.name.substring(0, 18) + '...' : c.name),
      datasets: [{
        label: 'Ügyfelek',
        data: sorted.map(c => c.client_ids?.length || 0),
        backgroundColor: 'rgba(28,238,224,0.8)',
        borderRadius: 6,
        borderSkipped: false as const,
        barThickness: 16,
      }]
    };
  }, [campaigns]);

  const timelineChartData = useMemo(() => {
    const monthMap: Record<string, { label: string; count: number; clients: number }> = {};
    const monthNames = ['Jan', 'Feb', 'Már', 'Ápr', 'Máj', 'Jún', 'Júl', 'Aug', 'Szep', 'Okt', 'Nov', 'Dec'];
    campaigns.forEach(c => {
      if (c.created_at) {
        const d = new Date(c.created_at);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        const label = monthNames[d.getMonth()] + ' ' + d.getFullYear();
        if (!monthMap[key]) monthMap[key] = { label, count: 0, clients: 0 };
        monthMap[key].count++;
        monthMap[key].clients += (c.client_ids?.length || 0);
      }
    });
    const sortedMonths = Object.keys(monthMap).sort();
    return {
      labels: sortedMonths.map(k => monthMap[k].label),
      datasets: [
        {
          label: 'Kampányok',
          data: sortedMonths.map(k => monthMap[k].count),
          borderColor: '#1ceee0',
          backgroundColor: 'rgba(28,238,224,0.1)',
          fill: true, tension: 0.4, borderWidth: 3,
          pointBackgroundColor: '#1ceee0', pointBorderColor: '#ffffff',
          pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 8,
        },
        {
          label: 'Célzott ügyfelek',
          data: sortedMonths.map(k => monthMap[k].clients),
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139,92,246,0.08)',
          fill: true, tension: 0.4, borderWidth: 2,
          borderDash: [5, 5],
          pointBackgroundColor: '#8b5cf6', pointBorderColor: '#ffffff',
          pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 7,
        }
      ]
    };
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
  const handleToggleReminder = useCallback(async (enabled: boolean) => {
    setReminderEnabled(enabled);
    try {
      const res = await authFetch('/admin/api/settings/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminder_enabled: enabled }),
      });
      if (res.ok) showToast(enabled ? 'Emlékeztető bekapcsolva!' : 'Emlékeztető kikapcsolva!');
      else { setReminderEnabled(!enabled); showToast('Hiba a mentés során!', 'error'); }
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
    try {
      const res = await authFetch(`/admin/api/campaigns/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Kampány törölve'); setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; }); loadCampaigns(); }
      else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [confirm, loadCampaigns]);

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

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm(`Biztosan törlöd a kijelölt ${selectedIds.size} kampányt?`, { title: 'Kampányok törlése', danger: true });
    if (!ok) return;
    let deleted = 0;
    for (const id of selectedIds) {
      try {
        const res = await authFetch(`/admin/api/campaigns/${id}`, { method: 'DELETE' });
        if (res.ok) deleted++;
      } catch { /* continue */ }
    }
    setSelectedIds(new Set());
    showToast(`${deleted} kampány törölve`);
    loadCampaigns();
  }, [selectedIds, confirm, loadCampaigns]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredCampaigns.map(c => c.id)));
  }, [filteredCampaigns]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ── Stable schedule handler for card ──
  const handleOpenSchedule = useCallback((id: number) => {
    setSchedulingId(id);
    setScheduleDate('');
  }, []);

  return (
    <div className="page active" id="page-outbound">
      <ConfirmDialog />

      {/* Header */}
      <div className="page-header mb-24">
        <div className="flex-row">
          <div className="icon-box-lg icon-box-outbound">
            <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" className="svg-24">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </div>
          <div>
            <div className="page-title page-title-no-margin">Kampányok</div>
          </div>
        </div>
      </div>

      {/* Campaigns section */}
      <div className="out-section">
        {/* KPI overview */}
        <div className="mb-24">
          <div className="flex-between mb-14">
            <div className="font-semibold text-md section-overview-label">Kampányok áttekintése</div>
            <button onClick={() => setShowNewCampaign(true)} className="out-new-campaign-btn">
              <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="svg-14">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              ÚJ KAMPÁNY
            </button>
          </div>
          <div className="out-kpi-grid">
            <div className="out-kpi-stat">
              <div className="out-kpi-value">{kpis.total}</div>
              <div className="out-kpi-label">Összes kampány</div>
            </div>
            <div className="out-kpi-stat">
              <div className="out-kpi-value out-kpi-value--green">{kpis.running}</div>
              <div className="out-kpi-label">Futó kampány</div>
            </div>
            <div className="out-kpi-stat">
              <div className="out-kpi-value">{kpis.closed}</div>
              <div className="out-kpi-label">Lezárt kampány</div>
            </div>
            <div className="out-kpi-stat">
              <div className="out-kpi-value">{kpis.targeted}</div>
              <div className="out-kpi-label">Összes célzott ügyfél</div>
            </div>
          </div>
        </div>

        {/* Analytics Panel — lazy: only mounts when opened */}
        {showAnalytics && (
          <div className="ana-overlay" onClick={() => setShowAnalytics(false)}>
            <div className="ana-container" onClick={e => e.stopPropagation()}>
              {/* Close */}
              <button className="ana-close-btn" onClick={() => setShowAnalytics(false)}>
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-18">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Hero Header */}
              <div className="ana-hero">
                <div className="ana-hero-badge">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-16">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Analitika
                </div>
                <h2 className="ana-hero-title">Kampányteljesítmény</h2>
                <p className="ana-hero-sub">Részletes áttekintés kampányaid eredményéről</p>
              </div>

              {/* Hero KPI Row */}
              <div className="ana-kpi-row">
                <div className="ana-kpi-glass">
                  <div className="ana-kpi-icon ana-kpi-icon--teal">
                    <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" className="svg-20">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <div className="ana-kpi-content">
                    <div className="ana-kpi-num">{analytics.avgClients}</div>
                    <div className="ana-kpi-desc">Átl. ügyfél / kampány</div>
                  </div>
                </div>
                <div className="ana-kpi-glass">
                  <div className="ana-kpi-icon ana-kpi-icon--purple">
                    <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24" className="svg-20">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                    </svg>
                  </div>
                  <div className="ana-kpi-content">
                    <div className="ana-kpi-num">{analytics.topChannel ? (CHANNEL_NAMES[analytics.topChannel[0]] || analytics.topChannel[0]) : <span className="no-data">Nincs adat</span>}</div>
                    <div className="ana-kpi-desc">Top csatorna</div>
                  </div>
                </div>
                <div className="ana-kpi-glass">
                  <div className="ana-kpi-icon ana-kpi-icon--green">
                    <svg fill="none" stroke="#22c55e" strokeWidth="2" viewBox="0 0 24 24" className="svg-20">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ana-kpi-content">
                    <div className="ana-kpi-num">{analytics.successRate}<span className="pct-suffix">%</span></div>
                    <div className="ana-kpi-desc">Befejezési arány</div>
                  </div>
                </div>
                <div className="ana-kpi-glass">
                  <div className="ana-kpi-icon ana-kpi-icon--blue">
                    <svg fill="none" stroke="#3b82f6" strokeWidth="2" viewBox="0 0 24 24" className="svg-20">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="ana-kpi-content">
                    <div className="ana-kpi-num">{analytics.lastCampaign ? new Date(analytics.lastCampaign.created_at).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' }) : <span className="no-data">Nincs adat</span>}</div>
                    <div className="ana-kpi-desc">Utolsó kampány</div>
                  </div>
                </div>
              </div>

              {/* Charts — Bento Grid */}
              <div className="ana-bento">
                {/* Status Doughnut */}
                <div className="ana-bento-card ana-bento-featured">
                  <div className="ana-card-header">
                    <div className="ana-card-dot ana-card-dot--teal" />
                    <span className="ana-card-label">Státusz eloszlás</span>
                  </div>
                  <div className="ana-card-chart ana-card-chart--240">
                    {campaigns.length > 0 ? (
                      <Doughnut data={statusChartData} options={STATUS_CHART_OPTIONS} />
                    ) : (
                      <div className="ana-no-data no-data">Nincs adat</div>
                    )}
                  </div>
                </div>

                {/* Channel Bar */}
                <div className="ana-bento-card">
                  <div className="ana-card-header">
                    <div className="ana-card-dot ana-card-dot--blue" />
                    <span className="ana-card-label">Csatorna használat</span>
                  </div>
                  <div className="ana-card-chart ana-card-chart--240">
                    {campaigns.length > 0 ? (
                      <Bar data={channelChartData} options={CHANNEL_CHART_OPTIONS} />
                    ) : (
                      <div className="ana-no-data no-data">Nincs adat</div>
                    )}
                  </div>
                </div>

                {/* Clients Horizontal Bar */}
                <div className="ana-bento-card">
                  <div className="ana-card-header">
                    <div className="ana-card-dot ana-card-dot--purple" />
                    <span className="ana-card-label">Célzott ügyfelek</span>
                  </div>
                  <div className="ana-card-chart ana-card-chart--240">
                    {campaigns.length > 0 ? (
                      <Bar data={clientsChartData} options={CLIENTS_CHART_OPTIONS} />
                    ) : (
                      <div className="ana-no-data no-data">Nincs adat</div>
                    )}
                  </div>
                </div>

                {/* Campaign Summary mini stats */}
                <div className="ana-bento-card">
                  <div className="ana-card-header">
                    <div className="ana-card-dot ana-card-dot--amber" />
                    <span className="ana-card-label">Kampány összesítő</span>
                    <span className="ana-card-tag">Live</span>
                  </div>
                  <div className="ana-summary-grid">
                    <div className="ana-mini-stat">
                      <div className="ana-mini-icon ana-mini-icon--teal">
                        <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" className="svg-18">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                      <div className="ana-mini-num">{kpis.total}</div>
                      <div className="ana-mini-label">Összes</div>
                    </div>
                    <div className="ana-mini-stat">
                      <div className="ana-mini-icon ana-mini-icon--green">
                        <svg fill="none" stroke="#22c55e" strokeWidth="2" viewBox="0 0 24 24" className="svg-18">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="ana-mini-num ana-mini-num--green">{kpis.running}</div>
                      <div className="ana-mini-label">Aktív</div>
                    </div>
                    <div className="ana-mini-stat">
                      <div className="ana-mini-icon ana-mini-icon--purple">
                        <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24" className="svg-18">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="ana-mini-num">{kpis.closed}</div>
                      <div className="ana-mini-label">Befejezett</div>
                    </div>
                    <div className="ana-mini-stat">
                      <div className="ana-mini-icon ana-mini-icon--blue">
                        <svg fill="none" stroke="#3b82f6" strokeWidth="2" viewBox="0 0 24 24" className="svg-18">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="ana-mini-num">{kpis.targeted}</div>
                      <div className="ana-mini-label">Célzott ügyfél</div>
                    </div>
                  </div>
                  {/* Mini progress bar */}
                  <div className="ana-progress-section">
                    <div className="ana-progress-header">
                      <span className="ana-progress-label">Befejezési arány</span>
                      <span className="ana-progress-pct">{analytics.successRate}%</span>
                    </div>
                    <div className="ana-progress-bar">
                      <div className="ana-progress-fill" style={{ width: `${analytics.successRate}%` }} />
                    </div>
                  </div>
                </div>

                {/* Timeline — Wide card */}
                <div className="ana-bento-card ana-bento-wide">
                  <div className="ana-card-header">
                    <div className="ana-card-dot ana-card-dot--green" />
                    <span className="ana-card-label">Időszak</span>
                    <span className="ana-card-tag">Trend</span>
                  </div>
                  <div className="ana-card-chart ana-card-chart--220">
                    {campaigns.length > 0 ? (
                      <Line data={timelineChartData} options={TIMELINE_CHART_OPTIONS} />
                    ) : (
                      <div className="ana-no-data no-data">Nincs adat</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Status filter tabs + selection bar */}
        <div className="flex-row flex-wrap out-filter-row">
          <div className="out-view-switcher out-view-switcher--no-mb">
            {STATUS_FILTERS.map((tab) => (
              <button
                key={tab}
                className={`out-view-btn ${activeFilter === tab ? 'active' : ''}`}
                onClick={() => { setActiveFilter(tab); setSelectedIds(new Set()); }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Selection toolbar */}
          <div className="flex-row gap-8">
            {selectedIds.size > 0 && (
              <>
                <span className="selection-count-label">{selectedIds.size} kijelölve</span>
                <button className="btn btn-outline-sm" onClick={deselectAll}>Összes megszüntetése</button>
                <button className="btn btn-danger-sm" onClick={handleBulkDelete}>
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="btn-delete-svg">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                  Kijelöltek törlése
                </button>
              </>
            )}
            {selectedIds.size === 0 && filteredCampaigns.length > 0 && (
              <button className="btn btn-outline-sm" onClick={selectAll}>Összes kijelölése</button>
            )}
          </div>
        </div>

        {/* Campaign grid */}
        {loading ? (
          <OutboundSkeleton />
        ) : filteredCampaigns.length === 0 ? (
          <div className="empty-state-center">
            <svg fill="none" stroke="var(--text-dim)" strokeWidth="1.5" viewBox="0 0 24 24" className="empty-state-svg">
              <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            <p className="empty-state-text">
              {activeFilter === 'Összes' ? 'Még nincsenek kampányok. Kattints a "+ ÚJ KAMPÁNY" gombra!' : `Nincsenek "${activeFilter}" státuszú kampányok.`}
            </p>
          </div>
        ) : (
          <div className="out-campaign-grid">
            {filteredCampaigns.map((c) => (
              <CampaignCard
                key={c.id}
                campaign={c}
                statusInfo={STATUS_COLORS[c.status] || STATUS_COLORS['Vázlat']}
                isSelected={selectedIds.has(c.id)}
                onToggleSelect={toggleSelect}
                onOpenDetail={setShowDetail}
                onStart={handleStartCampaign}
                onStop={handleStopCampaign}
                onClose={handleCloseCampaign}
                onDelete={handleDeleteCampaign}
                onSchedule={handleOpenSchedule}
              />
            ))}
          </div>
        )}
      </div>

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
              <button className="cpv-btn cpv-btn-ghost" onClick={() => { setSchedulingId(null); setScheduleDate(''); }}>
                Mégse
              </button>
              <button
                className="cpv-btn cpv-btn-primary"
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
