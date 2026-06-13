/**
 * OutboundPage – 1:1 port of legacy Kimenő kommunikáció
 * Features: campaign list/cards, KPI stats, status filter, reminder toggle,
 * campaign creation, start/stop/delete, analytics summary.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { authFetch } from '../api/client';
import { supabase } from '../lib/supabase';

import Spinner from '../components/ui/Spinner';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { showToast } from '../components/ui/Toast';
import CampaignWizardModal from '../components/outbound/CampaignWizardModal';
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
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showDetail, setShowDetail] = useState<Campaign | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  // ── Load campaigns ──
  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCampaigns(data || []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load reminder status ──
  useEffect(() => {
    loadCampaigns();
    supabase.from('reminder_settings').select('reminder_enabled').limit(1).single()
      .then(({ data }) => {
        if (data) setReminderEnabled(!!data.reminder_enabled);
      });
  }, [loadCampaigns]);

  // ── KPIs ──
  const kpis = useMemo(() => ({
    total: campaigns.length,
    running: campaigns.filter(c => c.status === 'Aktív').length,
    closed: campaigns.filter(c => c.status === 'Befejezett').length,
    targeted: campaigns.reduce((sum, c) => sum + (c.client_ids?.length || 0), 0),
  }), [campaigns]);

  // ── Analytics computations ──
  const analytics = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    const channelCounts: Record<string, number> = {};
    campaigns.forEach(c => {
      statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
      const chs = c.channels || (c.channel ? [c.channel] : ['email']);
      chs.forEach(ch => { channelCounts[ch] = (channelCounts[ch] || 0) + 1; });
    });
    const avgClients = campaigns.length > 0 ? Math.round(kpis.targeted / campaigns.length) : 0;
    const topChannel = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0];
    const successRate = campaigns.length > 0 ? Math.round((kpis.closed / campaigns.length) * 100) : 0;
    const lastCampaign = campaigns.length > 0 ? campaigns[0] : null;
    return { statusCounts, channelCounts, avgClients, topChannel, successRate, lastCampaign };
  }, [campaigns, kpis]);

  // ── Chart.js Datas & Options ──
  const statusChartData = useMemo(() => {
    const rawCounts = {
      'Tervezet': campaigns.filter(c => c.status === 'Vázlat').length,
      'Aktív': campaigns.filter(c => c.status === 'Aktív').length,
      'Elküldött': campaigns.filter(c => c.status === 'Befejezett').length,
      'Megállítva': campaigns.filter(c => c.status === 'Megállítva').length,
      'Ütemezett': campaigns.filter(c => c.status === 'Ütemezett').length,
    };
    return {
      labels: Object.keys(rawCounts),
      datasets: [{
        data: Object.values(rawCounts),
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
    };
  }, [campaigns]);

  const statusChartOptions = useMemo(() => ({
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
  }), []);

  const channelChartData = useMemo(() => {
    const channelCounts: Record<string, number> = {};
    campaigns.forEach(c => {
      const chs = c.channels || (c.channel ? [c.channel] : ['email']);
      chs.forEach(ch => {
        channelCounts[ch] = (channelCounts[ch] || 0) + 1;
      });
    });
    const keys = Object.keys(channelCounts);
    const labels = keys.map(k => CHANNEL_NAMES[k] || k);
    const bgColors = keys.map(k => {
      const map: Record<string, string> = {
        email: 'rgba(59,130,246,0.8)',
        messenger: 'rgba(139,92,246,0.8)',
        telefon: 'rgba(34,197,94,0.8)',
        whatsapp: 'rgba(37,211,102,0.8)',
        instagram: 'rgba(225,48,108,0.8)'
      };
      return map[k] || 'rgba(28,238,224,0.8)';
    });
    return {
      labels,
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

  const channelChartOptions = useMemo(() => ({
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
  }), []);

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

  const clientsChartOptions = useMemo(() => ({
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
  }), []);

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
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointBackgroundColor: '#1ceee0',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 8
        },
        {
          label: 'Célzott ügyfelek',
          data: sortedMonths.map(k => monthMap[k].clients),
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139,92,246,0.08)',
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          borderDash: [5, 5],
          pointBackgroundColor: '#8b5cf6',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 7
        }
      ]
    };
  }, [campaigns]);

  const timelineChartOptions = useMemo(() => ({
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
  }), []);

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
      // Read current row
      const { data: current } = await supabase.from('reminder_settings').select('*').limit(1).single();
      if (current?.id) {
        await supabase.from('reminder_settings').update({ reminder_enabled: enabled }).eq('id', current.id);
      } else {
        await supabase.from('reminder_settings').insert({ reminder_enabled: enabled, reminder_hours: 24, reminder_template: '' });
      }
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


  return (
    <div className="page active" id="page-outbound">
      <ConfirmDialog />

      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg, rgba(28,238,224,0.15), rgba(59,130,246,0.15))', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
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
        {/* Lemondási értesítő */}
        <div className="out-notif-item">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Lemondási értesítő</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Automatikus értesítés lemondáskor</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e' }}>Aktív</span>
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
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Kampányok áttekintése</div>
          <div className="out-kpi-grid">
            <div className="out-kpi-stat">
              <div className="out-kpi-value">{kpis.total}</div>
              <div className="out-kpi-label">Összes kampány</div>
            </div>
            <div className="out-kpi-stat">
              <div className="out-kpi-value" style={{ color: '#22c55e' }}>{kpis.running}</div>
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
            <div className="out-kpi-stat">
              <div className="out-kpi-value">0</div>
              <div className="out-kpi-label">Ügyfélreakció</div>
            </div>
            <div className="out-kpi-stat" style={{ borderColor: 'rgba(34,197,94,0.3)' }}>
              <div className="out-kpi-value" style={{ color: '#22c55e' }}>0</div>
              <div className="out-kpi-label">Konverzió</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
            <button className="out-analytics-btn" onClick={() => setShowAnalytics(!showAnalytics)}>
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 14, height: 14, verticalAlign: -2, marginRight: 4 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Analitika megtekintése
            </button>
          </div>
          </div>

          {/* Analytics Panel (slide-down) */}
          {showAnalytics && (
            <div className="out-analytics-panel open">
              <div className="out-analytics-inner">
                <div className="out-analytics-header">
                  <div className="out-analytics-title">
                    <div className="out-analytics-title-icon">
                      <svg fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    Kampány Analitika
                  </div>
                  <button onClick={() => setShowAnalytics(false)} className="out-analytics-close">
                    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Bezárás
                  </button>
                </div>

                {/* Charts Grid */}
                <div className="out-analytics-grid">
                  {/* Státusz eloszlás */}
                  <div className="out-chart-card">
                    <div className="out-chart-title">Státusz eloszlás</div>
                    <div className="out-chart-subtitle">Kampányok állapota</div>
                    <div className="out-chart-wrap">
                      {campaigns.length > 0 ? (
                        <Doughnut data={statusChartData} options={statusChartOptions} />
                      ) : (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: 12 }}>Nincs adat</div>
                      )}
                    </div>
                  </div>

                  {/* Csatorna használat */}
                  <div className="out-chart-card">
                    <div className="out-chart-title">Csatorna használat</div>
                    <div className="out-chart-subtitle">Melyik csatornán hány kampány fut</div>
                    <div className="out-chart-wrap">
                      {campaigns.length > 0 ? (
                        <Bar data={channelChartData} options={channelChartOptions} />
                      ) : (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: 12 }}>Nincs adat</div>
                      )}
                    </div>
                  </div>

                  {/* Célzott ügyfelek */}
                  <div className="out-chart-card">
                    <div className="out-chart-title">Célzott ügyfelek</div>
                    <div className="out-chart-subtitle">Ügyfélszám kampányonként</div>
                    <div className="out-chart-wrap">
                      {campaigns.length > 0 ? (
                        <Bar data={clientsChartData} options={clientsChartOptions} />
                      ) : (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: 12 }}>Nincs adat</div>
                      )}
                    </div>
                  </div>

                  {/* Idővonal */}
                  <div className="out-chart-card">
                    <div className="out-chart-title">Idővonal</div>
                    <div className="out-chart-subtitle">Kampány létrehozások időrendben</div>
                    <div className="out-chart-wrap">
                      {campaigns.length > 0 ? (
                        <Line data={timelineChartData} options={timelineChartOptions} />
                      ) : (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: 12 }}>Nincs adat</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Summary Row */}
                <div className="out-analytics-summary">
                  <div className="out-summary-item">
                    <div className="out-summary-value">{analytics.avgClients}</div>
                    <div className="out-summary-label">Átl. ügyfél/kampány</div>
                  </div>
                  <div className="out-summary-item">
                    <div className="out-summary-value">{analytics.topChannel ? (CHANNEL_NAMES[analytics.topChannel[0]] || analytics.topChannel[0]) : '-'}</div>
                    <div className="out-summary-label">Leggyakoribb csatorna</div>
                  </div>
                  <div className="out-summary-item">
                    <div className="out-summary-value">{analytics.successRate}%</div>
                    <div className="out-summary-label">Befejezési arány</div>
                  </div>
                  <div className="out-summary-item">
                    <div className="out-summary-value">{analytics.lastCampaign ? new Date(analytics.lastCampaign.created_at).toLocaleDateString('hu-HU') : '-'}</div>
                    <div className="out-summary-label">Utolsó kampány</div>
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* Status filter tabs */}
        <div className="out-view-switcher">
          {STATUS_FILTERS.map((tab) => (
            <button
              key={tab}
              className={`out-view-btn ${activeFilter === tab ? 'active' : ''}`}
              onClick={() => setActiveFilter(tab)}
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
          <div className="out-campaign-grid">
            {filteredCampaigns.map((c) => {
              const st = STATUS_COLORS[c.status] || STATUS_COLORS['Vázlat'];
              const channels = c.channels || (c.channel ? [c.channel] : ['email']);
              const clientCount = c.client_ids?.length || 0;

              return (
                <div key={c.id} className="out-campaign-card" style={{ cursor: 'pointer' }} onClick={() => setShowDetail(c)}>
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

      {/* Campaign Preview Modal — 1:1 DIGIDESK_OLD port */}
      {showDetail && (() => {
        const channels = showDetail.channels || (showDetail.channel ? [showDetail.channel] : ['email']);
        const channelLabels: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp', telefon: 'Telefon', messenger: 'Messenger', instagram: 'Instagram' };
        const clientCount = showDetail.client_ids?.length || 0;
        const delivered = showDetail.processed_count || 0;
        const total = showDetail.total_count || clientCount || 1;
        const deliveredPct = total > 0 ? ((delivered / total) * 100).toFixed(1) : '0.0';
        const sc = STATUS_COLORS[showDetail.status] || STATUS_COLORS['Vázlat'];
        // Parse email content exactly like DIGIDESK_OLD
        let emailContent = showDetail.ai_instructions || showDetail.content || showDetail.body_html || '';
        if (emailContent.startsWith('MODE:')) {
          const colonIdx = emailContent.indexOf(':', 5);
          emailContent = colonIdx >= 0 ? emailContent.substring(colonIdx + 1) : emailContent;
        }

        return (
          <div className="cpv-overlay" onClick={() => setShowDetail(null)}>
            <div className="cpv-card" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="cpv-header">
                <button className="cpv-close" onClick={() => setShowDetail(null)}>✕</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span className="cpv-badge cpv-badge-status">{sc.label.toUpperCase()}</span>
                  {channels.map(ch => (
                    <span key={ch} className="cpv-badge cpv-badge-channel">{channelLabels[ch] || ch}</span>
                  ))}
                </div>
                <h2 className="cpv-name">{showDetail.name}</h2>
              </div>

              {/* Scrollable body */}
              <div className="cpv-body">
                {/* Meta info */}
                <div className="cpv-meta">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: 'var(--accent)' }}>⏱</span> <b>Létrehozva:</b> {showDetail.created_at ? new Date(showDetail.created_at).toLocaleString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: 'var(--accent)' }}>👥</span> <b>Címzettek:</b> {clientCount} fő
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: 'var(--accent)' }}>✈</span> <b>Feldolgozva:</b> {delivered} / {showDetail.total_count || clientCount}
                  </div>
                </div>

                <div className="cpv-content">
                  {/* Performance Stats */}
                  <div className="cpv-section-title">📊 Kampány teljesítmény</div>
                  <div className="cpv-stats-grid">
                    <div className="cpv-stat">
                      <div className="cpv-stat-icon" style={{ background: 'rgba(28,238,224,0.1)' }}><span>📬</span></div>
                      <div className="cpv-stat-num" style={{ color: '#1ceee0' }}>{delivered}</div>
                      <div className="cpv-stat-label">Kézbesítve</div>
                      <div className="cpv-stat-pct">{deliveredPct}%</div>
                    </div>
                    <div className="cpv-stat">
                      <div className="cpv-stat-icon" style={{ background: 'rgba(34,197,94,0.1)' }}><span>👁</span></div>
                      <div className="cpv-stat-num" style={{ color: '#22c55e' }}>0</div>
                      <div className="cpv-stat-label">Megnyitás</div>
                      <div className="cpv-stat-pct">0.0%</div>
                    </div>
                    <div className="cpv-stat">
                      <div className="cpv-stat-icon" style={{ background: 'rgba(59,130,246,0.1)' }}><span>🖱</span></div>
                      <div className="cpv-stat-num" style={{ color: '#3b82f6' }}>0</div>
                      <div className="cpv-stat-label">Kattintás</div>
                      <div className="cpv-stat-pct">0.0%</div>
                    </div>
                    <div className="cpv-stat">
                      <div className="cpv-stat-icon" style={{ background: 'rgba(239,68,68,0.1)' }}><span>🚫</span></div>
                      <div className="cpv-stat-num" style={{ color: '#ef4444' }}>0</div>
                      <div className="cpv-stat-label">Visszapattant</div>
                      <div className="cpv-stat-pct">0.0%</div>
                    </div>
                  </div>

                  {/* Email Content */}
                  {emailContent && (
                    <>
                      <div className="cpv-section-title">✉ Email tartalom</div>
                      <div className="cpv-email-card">
                        <div className="cpv-email-header"><span>Eaisydesk Kampány</span></div>
                        <div className="cpv-email-body" dangerouslySetInnerHTML={{ __html: emailContent.includes('<') ? emailContent : emailContent }} />
                      </div>
                    </>
                  )}

                  {/* Recipients */}
                  <div className="cpv-section-title">👥 Címzettek ({clientCount})</div>
                  <CampaignRecipients campaignId={showDetail.id} />
                </div>
              </div>

              {/* Footer */}
              <div className="cpv-footer">
                {(showDetail.status === 'Vázlat' || showDetail.status === 'Megállítva') && (
                  <button className="cpv-btn cpv-btn-start" onClick={() => { handleStartCampaign(showDetail.id); setShowDetail(null); }}>
                    ✈ Indítás
                  </button>
                )}
                <button className="cpv-btn cpv-btn-delete" onClick={() => { handleDeleteCampaign(showDetail.id); setShowDetail(null); }}>
                  Törlés
                </button>
                <button className="cpv-btn cpv-btn-close" onClick={() => setShowDetail(null)}>Bezárás</button>
              </div>
            </div>
          </div>
        );
      })()}

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

interface ClientInfo { name: string; email: string; phone?: string; status: string; }

function CampaignRecipients({ campaignId }: { campaignId: number }) {
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const avatarColors = ['#1ceee0','#2563eb','#0891b2','#059669','#d97706','#dc2626','#6366f1','#8b5cf6'];

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`/admin/api/campaigns/${campaignId}/clients`);
        if (res.ok) {
          const data = await res.json();
          setClients(data.clients || []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [campaignId]);

  if (loading) return <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Betöltés...</div>;
  if (!clients.length) return <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Nincsenek címzettek</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {clients.map((cl, i) => {
        const initials = (cl.name || 'N/A').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
        const clColor = avatarColors[i % avatarColors.length];
        return (
          <div key={i} className="cpv-recipient">
            <div className="cpv-avatar" style={{ background: `${clColor}15`, color: clColor }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cl.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cl.email || cl.phone || '—'}</div>
            </div>
            <span style={{ padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', background: 'rgba(28,238,224,0.08)', color: 'var(--accent)' }}>
              {cl.status || 'Várakozik'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
