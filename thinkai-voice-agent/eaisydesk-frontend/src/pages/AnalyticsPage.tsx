import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { authFetch } from '../api/client';
import { useCountUp } from '../hooks/useCountUp';

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



function fmtDt(iso: string | null | undefined): string {
  if (!iso) return '\u2014';
  try {
    const utcIso = iso.includes('Z') || iso.includes('+') ? iso : iso + 'Z';
    const d = new Date(utcIso);
    return d.toLocaleString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

const ALERT_TYPE_NAMES: Record<string, string> = {
  urgent: 'Sürgős megkeresések',
  complaint: 'Panaszok',
  stuck: 'Nem kezelt / elakadt ügyek',
  callback: 'Visszahívást igénylők',
  recurring: 'Többször visszatérő kérdések',
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface StatsData {
  total_interactions: number;
  total_bookings: number;
  total_sessions: number;
  total_handovers: number;
  avg_session_duration: number;
  total_emails: number;
  open_tasks: number;
  previous_period: Record<string, number>;
  interactions_by_topic: { topic: string; count: number }[];
  interactions_by_type: { type: string; count: number }[];
  interactions_by_dow: { total: number[]; channels: Record<string, number[]> };
  interactions_by_hour: { total: number[]; channels: Record<string, number[]> };
  handovers: { reason: string; count: number }[];
  activities: Record<string, number>;
}

interface FunnelData {
  osszes_relevans: number;
  valaszolt_ugyek: number;
  ajanlatig_jutott: number;
  idopont_lett: number;
}

interface AlertData {
  urgent_count: number;
  complaint_count: number;
  stuck_count: number;
  callback_count: number;
  recurring_count: number;
}

interface OutboundSummary {
  total_outbound: number;
  reached_count: number;
  reached_rate: number;
  negotiating_count: number;
  booked_count: number;
  booked_rate: number;
  open_followup: number;
  activities: Record<string, number>;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, prev, prevLabel, suffix }: {
  label: string; value: number; sub: string; prev?: number; prevLabel: string; suffix?: string;
}) {
  const animatedValue = useCountUp(value, 900);
  let trendClass = 'kpi-trend-neutral';
  let trendText = '';
  if (prev != null && prev !== 0) {
    trendClass = value >= prev ? 'kpi-trend-up' : 'kpi-trend-down';
    const diff = value - prev;
    const pct = Math.round(Math.abs(diff / prev) * 100);
    const sign = diff >= 0 ? '+' : '-';
    const arrow = diff >= 0 ? '\u25b2' : '\u25bc';
    trendText = `${arrow} ${sign}${pct}%`;
  }
  return (
    <div className="kpi-card-figma kpi-card-figma--no-cursor">
      <div className="kpi-card-label">{label}</div>
      <div className="kpi-card-value">{animatedValue}{suffix}</div>
      <div className="kpi-card-subtitle">{sub}</div>
      {trendText && (
        <div className={`kpi-card-trend ${trendClass}`}>
          <span>{trendText}</span>
          {prevLabel && <span className="kpi-trend-desc">{prevLabel} képest</span>}
        </div>
      )}
    </div>
  );
}

// ── Funnel ────────────────────────────────────────────────────────────────────
function FunnelBlock({ data }: { data: FunnelData | null }) {
  if (!data) return <div className="spinner-center"><div className="spinner" /></div>;
  const { osszes_relevans: total, valaszolt_ugyek: valaszolt, ajanlatig_jutott: ajanlat, idopont_lett: foglalt } = data;
  const p2 = total > 0 ? Math.round((valaszolt / total) * 100) : 0;
  const p3 = valaszolt > 0 ? Math.round((ajanlat / valaszolt) * 100) : 0;
  const p4 = ajanlat > 0 ? Math.round((foglalt / ajanlat) * 100) : 0;
  const w2 = total > 0 ? Math.round((valaszolt / total) * 100) : 10;
  const w3 = total > 0 ? Math.round((ajanlat / total) * 100) : 10;
  const w4 = total > 0 ? Math.round((foglalt / total) * 100) : 10;

  const steps = [
    { label: 'Összes releváns megkeresés', val: total, pct: 100, w: 100 },
    { label: 'Válaszolt ügyek', val: valaszolt, pct: p2, w: w2, conv: p2 },
    { label: 'Foglalási ajánlatig jutott', val: ajanlat, pct: p3, w: w3, conv: p3 },
    { label: 'Időpont lett belőle', val: foglalt, pct: p4, w: w4, conv: p4 },
  ];

  return (
    <>
      {steps.map((s, i) => (
        <div key={i}>
          {i > 0 && <div className="funnel-conv">{'\u25bc'} {s.conv}% konverzió</div>}
          <div className="funnel-step" style={{ width: `${Math.max(s.w, 10)}%` }}>
            <div className="funnel-step-label">{s.label}</div>
            <div><span className="funnel-step-val">{s.val}</span><span className="funnel-step-pct">({s.pct}%)</span></div>
          </div>
        </div>
      ))}
    </>
  );
}

interface AlertDetailItem {
  created_at: string;
  channel: string;
  topic?: string;
  name?: string;
  summary?: string;
  status?: string;
  is_stuck?: boolean;
}

// ── Alert Cards ──────────────────────────────────────────────────────────────
function AlertCards({ alerts, onOpenAlert }: { alerts: AlertData | null; onOpenAlert: (type: string) => void }) {
  if (!alerts) return null;
  const items = [
    { label: 'Sürgős megkeresés', count: alerts.urgent_count, severity: 'high', type: 'urgent' },
    { label: 'Panasz', count: alerts.complaint_count, severity: 'high', type: 'complaint' },
    { label: 'Nem kezelt / elakadt ügy', count: alerts.stuck_count, severity: 'medium', type: 'stuck' },
    { label: 'Visszahívást igénylő lead', count: alerts.callback_count, severity: 'medium', type: 'callback' },
    { label: 'Többször visszatérő kérdés', count: alerts.recurring_count, severity: 'low', type: 'recurring' },
  ];
  return (
    <>
      {items.map(a => (
        <div key={a.type} className={`severity-card ${a.severity}`} onClick={() => onOpenAlert(a.type)}>
          <span className="severity-label">{a.label}</span>
          <span><span className="severity-count">{a.count}</span><span className="severity-unit">eset</span></span>
        </div>
      ))}
    </>
  );
}

// ── Campaign Doughnut options — static, module-level (never changes) ──────────
const CAMPAIGN_DOUGHNUT_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '65%',
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        padding: 16, usePointStyle: true, pointStyle: 'circle',
        font: { size: 12, weight: 'bold' as const }, color: '#8ea9c0',
      }
    },
    tooltip: { backgroundColor: '#0d2538', padding: 10, cornerRadius: 8 }
  }
};

// ── Campaign Performance Section ─────────────────────────────────────────────
function CampaignPerformanceSection({ campaigns }: { campaigns: any[] }) {
  // Merged into one useMemo — eliminates cascade recompute (kpis → analytics)
  const { kpis, analytics, statusChartData } = useMemo(() => {
    const total = campaigns.length;
    const running = campaigns.filter((c: any) => c.status === 'Aktív').length;
    const closed = campaigns.filter((c: any) => c.status === 'Befejezett').length;
    const scheduled = campaigns.filter((c: any) => c.status === 'Ütemezett').length;
    const targeted = campaigns.reduce((s: number, c: any) => s + (c.client_ids?.length || 0), 0);
    const kpis = { total, running, closed, scheduled, targeted };

    const statusCounts: Record<string, number> = {};
    campaigns.forEach((c: any) => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });
    const avgClients = total > 0 ? Math.round(targeted / total) : 0;
    const successRate = total > 0 ? Math.round((closed / total) * 100) : 0;
    const lastCampaign = total > 0 ? campaigns[0] : null;
    const analytics = { statusCounts, avgClients, successRate, lastCampaign };

    const statusChartData = {
      labels: ['Tervezet', 'Aktív', 'Elküldött', 'Megállítva', 'Ütemezett'],
      datasets: [{
        data: [
          campaigns.filter((c: any) => c.status === 'Vázlat').length,
          campaigns.filter((c: any) => c.status === 'Aktív').length,
          campaigns.filter((c: any) => c.status === 'Befejezett').length,
          campaigns.filter((c: any) => c.status === 'Megállítva').length,
          campaigns.filter((c: any) => c.status === 'Ütemezett').length,
        ],
        backgroundColor: [
          'rgba(107,139,153,0.7)', 'rgba(34,197,94,0.8)', 'rgba(28,238,224,0.8)',
          'rgba(245,158,11,0.8)', 'rgba(139,92,246,0.8)',
        ],
        borderColor: 'rgba(13,37,56,0.15)',
        borderWidth: 2,
        hoverOffset: 6,
      }]
    };

    return { kpis, analytics, statusChartData };
  }, [campaigns]);

  if (campaigns.length === 0) return null;

  const statCards = [
    { label: 'Összes kampány', value: kpis.total, color: '#1ceee0' },
    { label: 'Aktív', value: kpis.running, color: '#22c55e' },
    { label: 'Befejezett', value: kpis.closed, color: '#8b5cf6' },
    { label: 'Célzott ügyfél', value: kpis.targeted, color: '#3b82f6' },
  ];

  return (
    <>
      <div className="section-divider" />
      <h2 className="section-header-figma">Kampányteljesítmény</h2>

      {/* KPI stat row */}
      <div className="analytics-campaign-kpi-row">
        {statCards.map(sc => (
          <div key={sc.label} className="panel-white ana-stat-card">
            <div className="ana-stat-icon" style={{ background: `${sc.color}14` }}>
              <div className="ana-stat-dot" style={{ background: sc.color, boxShadow: `0 0 8px ${sc.color}60` }} />
            </div>
            <div>
              <div className="ana-stat-value">{sc.value}</div>
              <div className="ana-stat-label">{sc.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="analytics-campaign-charts-row">
        {/* Status Doughnut */}
        <div className="panel-white panel-white--p2428">
          <div className="panel-title mb-20">
            Státusz eloszlás
          </div>
          <div className="ana-doughnut-wrap">
            <Doughnut data={statusChartData} options={CAMPAIGN_DOUGHNUT_OPTIONS} />
          </div>
        </div>

        {/* Campaign summary */}
        <div className="panel-white panel-white--p2428">
          <div className="panel-title mb-20">
            Kampány összesítő
          </div>

          {/* Mini stat grid */}
          <div className="ana-mini-stat-grid">
            {[
              { label: 'Átl. ügyfél / kampány', value: analytics.avgClients, color: '#1ceee0' },
              { label: 'Befejezési arány', value: `${analytics.successRate}%`, color: '#22c55e' },
              { label: 'Ütemezett', value: kpis.scheduled, color: '#8b5cf6' },
              { label: 'Utolsó kampány', value: analytics.lastCampaign?.name || '–', sub: analytics.lastCampaign ? new Date(analytics.lastCampaign.created_at).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }) : '', color: '#3b82f6' },
            ].map(item => (
              <div key={item.label} className="ana-mini-stat-item" style={{ borderLeft: `3px solid ${item.color}` }}>
                <div className={`ana-mini-stat-value ${item.label === 'Utolsó kampány' ? 'ana-mini-stat-value--sm' : 'ana-mini-stat-value--lg'}`} title={String(item.value)}>{item.value}</div>
                {'sub' in item && item.sub && <div className="ana-mini-stat-sub">{item.sub}</div>}
                <div className="ana-mini-stat-lbl">{item.label}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex-between mb-8">
              <span className="ana-progress-text-lbl">Befejezési arány</span>
              <span className="ana-progress-text-pct">{analytics.successRate}%</span>
            </div>
            <div className="ana-progress-track">
              <div className="ana-progress-fill-bar" style={{ width: `${analytics.successRate}%` }} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { isAdmin, isAdminOnly } = useAuth();
  const navigate = useNavigate();

  // Redirect members to their dashboard
  useEffect(() => {
    if (!isAdmin) navigate('/dashboard', { replace: true });
  }, [isAdmin, navigate]);

  const [period, setPeriod] = useState('month');
  const [channel, setChannel] = useState('mind');
  const [clinic, setClinic] = useState('mind');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [alerts, setAlerts] = useState<AlertData | null>(null);
  const [outbound, setOutbound] = useState<OutboundSummary | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [chartView, setChartView] = useState<'napi' | 'oras'>('napi');
  const [channelBreakdown, setChannelBreakdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [alertModal, setAlertModal] = useState<{ type: string; title: string; rows: AlertDetailItem[]; loading: boolean } | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [clinics, setClinics] = useState<{ id: number; name_and_address: string }[]>([]);

  // Fetch clinics for the Telephely filter
  useEffect(() => {
    authFetch('/admin/api/clinics')
      .then(r => r.json())
      .then(d => { if (d?.clinics) setClinics(d.clinics); else if (Array.isArray(d)) setClinics(d); })
      .catch(() => {});
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = `period=${period}&channel=${channel}&clinic_id=${clinic}${period === 'custom' && dateFrom && dateTo ? `&date_from=${dateFrom}&date_to=${dateTo}` : ''}`;
      const [statsRes, funnelRes, alertsRes, outboundRes, insightsRes, campaignsRes] = await Promise.all([
        authFetch(`/admin/api/stats?${params}`),
        authFetch(`/admin/api/analytics/funnel?${params}`),
        authFetch(`/admin/api/analytics/alerts?${params}`),
        authFetch(`/admin/api/analytics/outbound/summary?${params}`),
        authFetch('/admin/api/analytics/insights'),
        authFetch('/admin/api/campaigns'),
      ]);
      if (statsRes.ok) { const d = await statsRes.json(); if (d) setStats(d); }
      if (funnelRes.ok) { const d = await funnelRes.json(); if (d) setFunnel(d); }
      if (alertsRes.ok) { const d = await alertsRes.json(); if (d) setAlerts(d); }
      if (outboundRes.ok) { const d = await outboundRes.json(); if (d) setOutbound(d); }
      if (insightsRes.ok) { const d = await insightsRes.json(); if (d?.insights) setInsights(d.insights); }
      if (campaignsRes.ok) { const d = await campaignsRes.json(); if (d?.campaigns || Array.isArray(d)) setCampaigns(d.campaigns || d); }
    } catch (e) {
      console.error('Analytics load error', e);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, channel, clinic, dateFrom, dateTo]);

  // Load only on initial mount
  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 5 min — useRef ensures we always call the latest loadAll
  // (avoids stale closure bug where period/channel/clinic would be frozen at mount-time)
  const loadAllRef = useRef(loadAll);
  useEffect(() => { loadAllRef.current = loadAll; }, [loadAll]);
  useEffect(() => {
    const interval = setInterval(() => loadAllRef.current(), 300000);
    return () => clearInterval(interval);
  }, []); // intentionally empty — fires once, always uses fresh ref

  async function refreshInsights() {
    setInsightsLoading(true);
    try {
      // Insight generation still needs FastAPI (calls LLM)
      const res = await authFetch('/admin/api/analytics/insights/generate', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success' && data.insights) setInsights(data.insights);
    } catch (e) { console.error(e); }
    finally { setInsightsLoading(false); }
  }

  async function openAlertDetails(type: string) {
    const title = ALERT_TYPE_NAMES[type] || type;
    setAlertModal({ type, title, rows: [], loading: true });
    try {
      // Use backend API which properly filters by alert_tags / stuck status
      const res = await authFetch(`/admin/api/analytics/alerts/details?type=${type}`);
      if (res.ok) {
        const json = await res.json();
        const details = json.data || [];
        const mapped = details.map((r: Record<string, unknown>) => ({
          created_at: r.created_at as string,
          channel: r.channel as string,
          topic: r.topic as string,
          name: r.name as string,
          summary: r.summary as string,
          status: r.status as string,
          is_stuck: r.is_stuck as boolean,
        }));
        setAlertModal(prev => prev ? { ...prev, rows: mapped, loading: false } : null);
      } else {
        setAlertModal(prev => prev ? { ...prev, rows: [], loading: false } : null);
      }
    } catch {
      setAlertModal(prev => prev ? { ...prev, rows: [], loading: false } : null);
    }
  }

  // ── Chart data ──────────────────────────────────────────────────────────────
  const { isDark } = useTheme();
  const gridColor = isDark ? '#1a3548' : '#f1f5f9';
  const gridDash = isDark ? [] : [5, 5];
  const typeColorMap: Record<string, string> = {
    'E-Mail': '#1ceee0', 'Telefon': '#3b82f6', 'Whatsapp': '#22c55e', 'Messenger': '#8b5cf6',
  };
  const typeColors = ['#3b82f6', '#1ceee0', '#22c55e', '#8b5cf6', '#f59e0b', '#f97316'];

  function getSessionsChartData() {
    if (!stats) return { labels: [], datasets: [] };
    const src = chartView === 'napi'
      ? (stats.interactions_by_dow || { total: [0,0,0,0,0,0,0], channels: {} })
      : (stats.interactions_by_hour || { total: Array(24).fill(0), channels: {} });
    const labels = chartView === 'napi'
      ? ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap']
      : Array.from({ length: 24 }, (_, i) => `${i}:00`);

    if (channelBreakdown) {
      return {
        labels,
        datasets: Object.entries(src.channels).map(([ch, counts]) => ({
          label: ch,
          data: counts as number[],
          borderColor: typeColorMap[ch] || '#f59e0b',
          backgroundColor: 'transparent',
          borderWidth: 2, tension: 0.4, pointRadius: 3,
          pointBackgroundColor: typeColorMap[ch] || '#f59e0b',
        })),
      };
    }
    return {
      labels,
      datasets: [{
        label: 'Összes megkeresés',
        data: src.total,
        borderColor: '#1ceee0',
        backgroundColor: 'rgba(28,238,224,0.08)',
        borderWidth: 2, fill: true, tension: 0.4, pointRadius: 4,
        pointBackgroundColor: '#1ceee0',
      }],
    };
  }

  // Y axis scale: same logic as the original admin-analytics.js
  function getSessionsYScale() {
    const chartData = getSessionsChartData();
    let maxVal = 5; // minimum baseline
    chartData.datasets.forEach(ds => {
      const dsMax = Math.max(...(ds.data as number[]));
      if (dsMax > maxVal) maxVal = dsMax;
    });
    const yMax = Math.ceil(maxVal * 1.25);
    const yStep = Math.max(1, Math.ceil(yMax / 6));
    return { yMax, yStep };
  }

  const prevLabel = period === 'custom' ? 'előző időszakhoz' : ({ week: 'előző héthez', month: 'előző hónaphoz', year: 'előző évhez' }[period] || '');
  const prev = stats?.previous_period || {};

  const kpiCards = stats ? [
    { label: 'Összes megkeresés', value: stats.total_interactions ?? 0, sub: 'interakció', prev: prev.total_interactions, page: 'interactions' },
    { label: 'Foglalási arány', value: stats.total_bookings ?? 0, sub: 'foglalás', prev: prev.total_bookings, page: 'calendar' },
    { label: 'Átadási arány', value: (stats.total_interactions ?? 0) > 0 ? Math.round(((stats.total_handovers ?? 0) / (stats.total_interactions ?? 1)) * 100) : 0, sub: 'az összes megkeresésből', prev: (prev.total_interactions ?? 0) > 0 ? Math.round(((prev.total_handovers ?? 0) / (prev.total_interactions ?? 1)) * 100) : undefined, page: 'interactions', suffix: '%' },
    { label: 'Átlagos ügyintézési idő', value: stats.avg_session_duration ?? 0, sub: 'másodperc', prev: prev.avg_session_duration, page: 'interactions' },
    { label: 'Kimenő kommunikációk', value: stats.total_emails ?? 0, sub: 'email küldve', prev: prev.total_emails, page: 'outbound' },
    { label: 'Nyílt feladatok', value: stats.open_tasks ?? 0, sub: 'követést igényel', prev: undefined, page: 'interactions' },
  ] : [];

  const topics = stats?.interactions_by_topic || [];
  const topicsTotal = topics.reduce((a, t) => a + (t.count || 0), 0);

  const chartTypes = stats?.interactions_by_type || [];

  // Handoff chart
  const handovers = stats?.handovers || [];
  const handoffLabels = handovers.length > 0
    ? handovers.map(h => h.reason)
    : ['Összetett kérdés', 'Sürgős / triázs', 'Hiányzó info', 'Foglalási kivétel', 'Emberi döntés'];
  const handoffValues = handovers.length > 0 ? handovers.map(h => h.count) : [0, 0, 0, 0, 0];

  // Outgoing chart
  const activityLabels = ['Visszahívás', 'Emlékeztető', 'Utánkövetés', 'Kampány', 'Kontroll', 'Passzív'];
  const activityData = outbound?.activities
    ? activityLabels.map(l => (outbound.activities as Record<string, number>)[l] || 0)
    : [0, 0, 0, 0, 0, 0];

  // Outbound funnel
  const obTotal = outbound?.total_outbound || 0;
  const obReached = outbound?.reached_count || 0;
  const obNeg = outbound?.negotiating_count || 0;
  const obBooked = outbound?.booked_count || 0;

  if (loading) {
    return (
      <div className="page active" id="page-analytics">
        <div className="analytics-shell">
          {/* Skeleton filter row */}
          <div className="flex-row gap-12 mb-28">
            {[140, 140, 140, 160].map((w, i) => (
              <div key={i} className="skeleton-shimmer" style={{ width: w, height: 40, borderRadius: 10 }} />
            ))}
          </div>
          {/* Skeleton KPI grid */}
          <div className="analytics-skeleton-kpi">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton-shimmer ana-skel-kpi" />
            ))}
          </div>
          {/* Skeleton chart row */}
          <div className="analytics-skeleton-charts">
            <div className="skeleton-shimmer ana-skel-chart" />
            <div className="skeleton-shimmer ana-skel-chart" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page active" id="page-analytics">
      <div className="analytics-shell">
        {/* Page title */}
        <div className="page-header">
          <div className="page-title">Analitika</div>
        </div>

        {/* Filter row */}
        <div className="filter-row-figma">
          <div className="filter-group">
            <label>Telephely</label>
            <select className="filter-select-figma" value={clinic} onChange={e => setClinic(e.target.value)}>
              <option value="mind">Mind</option>
              {clinics.map(c => (
                <option key={c.id} value={String(c.id)}>{c.name_and_address}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Csatorna</label>
            <select className="filter-select-figma" value={channel} onChange={e => setChannel(e.target.value)}>
              <option value="mind">Mind</option>
              <option value="telefon">Telefon</option>
              <option value="email">E-mail</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
            </select>
          </div>
          <div className="filter-group filter-group--relative">
            <label>Időszak</label>
            <select className="filter-select-figma" value={period} onChange={e => { setPeriod(e.target.value); if (e.target.value !== 'custom') { setDateFrom(''); setDateTo(''); } }}>
              <option value="week">Aktuális hét</option>
              <option value="month">Aktuális hónap</option>
              <option value="year">Aktuális év</option>
              <option value="custom">Egyedi időszak</option>
            </select>
            {period === 'custom' && (
              <div className="ana-date-picker">
                <div className="ana-date-picker-title">
                  Egyedi időszak kiválasztása
                </div>
                <div className="ana-date-picker-grid">
                  <div>
                    <label className="ana-date-picker-lbl">Kezdő dátum</label>
                    <input type="date" lang="hu" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      className="ana-date-input" />
                  </div>
                  <div>
                    <label className="ana-date-picker-lbl">Záró dátum</label>
                    <input type="date" lang="hu" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      className="ana-date-input" />
                  </div>
                </div>
                <div className="flex-row gap-6 flex-wrap">
                  {[
                    { label: 'Utolsó 7 nap', days: 7 },
                    { label: 'Utolsó 30 nap', days: 30 },
                    { label: 'Utolsó 90 nap', days: 90 },
                  ].map(p => (
                    <button key={p.days} onClick={() => {
                      const to = new Date(); const from = new Date(); from.setDate(from.getDate() - p.days);
                      setDateFrom(from.toISOString().slice(0, 10)); setDateTo(to.toISOString().slice(0, 10));
                    }} className="ana-preset-btn">{p.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button className="btn-filter-apply" onClick={loadAll}>Szűrés alkalmazása</button>
        </div>

        {/* KPI grid */}
        <div className="kpi-grid-figma">
          {kpiCards.map(c => (
            <KpiCard key={c.label} label={c.label} value={c.value} sub={c.sub}
              prev={c.prev} prevLabel={prevLabel} suffix={c.suffix} />
          ))}
        </div>

        {/* 1. Charts */}
        <div className="section-divider" />
        <h2 className="section-header-figma">Működési áttekintés</h2>
        <div className="charts-row mb-36">
          {/* Sessions over time */}
          <div className="chart-card chart-card--350">
            <div className="flex-between">
              <div className="chart-title chart-title--no-mb">
                Megkeresések időbeli alakulása
              </div>
              <div className="flex-row gap-4 ana-toggle-bar">
                <button className={`toggle-btn${chartView === 'napi' ? ' active' : ''}`}
                  onClick={() => setChartView('napi')}>Napi</button>
                <button className={`toggle-btn${chartView === 'oras' ? ' active' : ''}`}
                  onClick={() => setChartView('oras')}>Órás</button>
              </div>
            </div>
            <div className="ana-breakdown-wrap">
              <label className="ana-breakdown-label">
                <input type="checkbox" checked={channelBreakdown} onChange={e => setChannelBreakdown(e.target.checked)}
                  className="ana-breakdown-cb" /> Csatorna szerinti bontás
              </label>
            </div>
            <div className="ana-chart-inner">
              {(() => { const { yMax, yStep } = getSessionsYScale(); return (
              <Line data={getSessionsChartData()} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'bottom' as const, labels: { color: '#6b8b99', usePointStyle: true, boxWidth: 8, font: { size: 11 } } } },
                scales: {
                  x: { ticks: { color: '#6b8b99', font: { size: 11 } }, grid: { color: gridColor }, border: { display: false } },
                  y: { min: 0, max: yMax, ticks: { color: '#6b8b99', font: { size: 11 }, stepSize: yStep }, grid: { color: gridColor }, border: { display: false } },
                },
              }} />
              ); })()}
            </div>
          </div>

          {/* Channel doughnut */}
          <div className="chart-card chart-card--350">
            <div className="chart-title chart-title--no-mb">Csatornamegoszlás</div>
            <div className="ana-doughnut-wrap">
              <Doughnut data={{
                labels: chartTypes.map(t => t.type),
                datasets: [{ data: chartTypes.map(t => t.count), backgroundColor: typeColors.slice(0, chartTypes.length), borderWidth: 0 }],
              }} options={{ responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }} />
            </div>
            <div className="ana-legend-grid">
              {chartTypes.map((t, i) => (
                <div key={t.type} className="flex-col ana-legend-item">
                  <div className="flex-row ana-legend-row">
                    <div className="analytics-legend-dot" style={{ backgroundColor: typeColors[i % typeColors.length] }} />
                    <span className="ana-legend-label">{t.type}</span>
                  </div>
                  <div className="ana-legend-value">{t.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Quality & Performance */}
        <div className="section-divider" />
        <h2 className="section-header-figma">Minőség és teljesítmény</h2>
        <div className="analytics-quality-grid">
          {/* Top topics */}
          <div className="panel-white">
            <div className="panel-title">Top kérdéstípusok / témák</div>
            <div>
              {topics.length === 0 ? (
                <div className="ana-no-data-center"><span className="no-data">Nincs adat</span></div>
              ) : topics.slice(0, 5).map((t, i) => {
                const pct = topicsTotal > 0 ? Math.round((t.count / topicsTotal) * 100) : 0;
                return (
                  <div className="topic-row" key={i}>
                    <div className="topic-row-header">
                      <div className="flex-row">
                        <div className="topic-rank-badge">{i + 1}</div>
                        <span className="topic-name">{t.topic || <span className="no-data">Ismeretlen</span>}</span>
                      </div>
                      <span className="topic-value">{t.count}<span className="topic-pct">({pct}%)</span></span>
                    </div>
                    <div className="progress-bar-track"><div className="progress-bar-fill" style={{ width: `${pct * 3}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Handoff chart — admin only */}
          {isAdminOnly && (
          <div className="panel-white">
            <div className="panel-title">Átadási okok</div>
            <div className="ana-handoff-wrap">
              <Bar data={{ labels: handoffLabels, datasets: [{ label: 'Átadások', data: handoffValues, backgroundColor: '#ef4444', borderRadius: 6 }] }}
                options={{ indexAxis: 'y' as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                  scales: {
                    x: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { color: '#f3f4f6' } },
                    y: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { display: false } },
                  },
                }} />
            </div>
          </div>
          )}

          {/* Funnel */}
          <div className="panel-white">
            <div className="panel-title">Foglalási tölcsér</div>
            <div><FunnelBlock data={funnel} /></div>
          </div>
        </div>

        {/* 3. Alerts */}
        <div className="section-divider" />
        <h2 className="section-header-figma">Operatív figyelmeztetések és teendők</h2>
        <div className="analytics-alerts-grid">
          <div className="panel-white">
            <div className="panel-title">Kritikus ügyek</div>
            <AlertCards alerts={alerts} onOpenAlert={openAlertDetails} />
          </div>

          {/* AI insights — admin only */}
          {isAdminOnly && (
          <div className="panel-white">
            <div className="panel-title flex-between">
              <span>Finomhangolási javaslatok</span>
              <button onClick={refreshInsights} disabled={insightsLoading}
                className="ana-insights-btn">
                {insightsLoading ? <div className="spinner ana-spinner-tiny" /> : <span>Frissítés</span>}
              </button>
            </div>
            <div>
              {insights.length === 0 ? (
                <div className="analytics-empty-state">Nincs elérhető javaslat.</div>
              ) : insights.map((text, i) => (
                <div className="suggestion-card" key={i}>
                  <span className="suggestion-icon">&#x1f4a1;</span>
                  <span className="suggestion-text">{text}</span>
                </div>
              ))}
            </div>
          </div>
          )}
        </div>

        {/* 4. Campaign Performance */}
        <CampaignPerformanceSection campaigns={campaigns} />

      </div>

      {/* Alert Details Modal — Apple-style */}
      {alertModal && (
        <div className="alert-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setAlertModal(null); }}>
          <div className="alert-modal-card">
            {/* Gradient top accent */}
            <div className="alert-modal-accent" />

            {/* Header */}
            <div className="alert-modal-header">
              <div className="alert-modal-header-left">
                <div className="alert-modal-severity-dot" />
                <div>
                  <div className="alert-modal-title">{alertModal.title}</div>
                  <div className="alert-modal-subtitle">{alertModal.rows.length} találat az aktuális időszakban</div>
                </div>
              </div>
              <button className="alert-modal-close" onClick={() => setAlertModal(null)}>
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-18">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="alert-modal-body">
              {alertModal.loading ? (
                <div className="alert-modal-loading"><div className="spinner" /></div>
              ) : alertModal.rows.length === 0 ? (
                <div className="alert-modal-empty">
                  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="svg-40-dim">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <span>Nincs megjeleníthető adat ebben az időszakban</span>
                </div>
              ) : (
                <div className="alert-modal-list">
                  {alertModal.rows.map((item, i) => {
                    const channelColors: Record<string, { bg: string; color: string }> = {
                      instagram: { bg: 'rgba(225,48,108,0.12)', color: '#e1306c' },
                      messenger: { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6' },
                      email: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
                      'E-Mail': { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
                      telefon: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' },
                      Telefon: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' },
                      whatsapp: { bg: 'rgba(37,211,102,0.12)', color: '#25d366' },
                      Whatsapp: { bg: 'rgba(37,211,102,0.12)', color: '#25d366' },
                    };
                    const chStyle = channelColors[item.channel] || { bg: 'rgba(28,238,224,0.1)', color: '#1ceee0' };
                    return (
                      <div key={i} className="alert-modal-row" style={{ animationDelay: `${i * 0.05}s` }}>
                        <div className="alert-row-top">
                          <span className="alert-row-date">{fmtDt(item.created_at)}</span>
                          <span className="alert-row-channel" style={{ background: chStyle.bg, color: chStyle.color }}>
                            {item.channel}
                          </span>
                        </div>
                        <div className="alert-row-title">{item.is_stuck ? item.name : item.topic}</div>
                        <div className="alert-row-detail">
                          {item.is_stuck
                            ? <span className="alert-row-status">{item.status}</span>
                            : <span>{item.summary}</span>
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="alert-modal-footer">
              <button className="alert-modal-footer-btn" onClick={() => setAlertModal(null)}>Bezárás</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
