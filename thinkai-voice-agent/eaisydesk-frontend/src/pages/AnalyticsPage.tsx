import { useState, useEffect, useCallback, useMemo } from 'react';
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
    <div className="kpi-card-figma" style={{ cursor: 'default' }}>
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
  if (!data) return <div style={{ textAlign: 'center', padding: 20, color: '#6b7280' }}><div className="spinner" /></div>;
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

// ── Campaign Performance Section ─────────────────────────────────────────────
function CampaignPerformanceSection({ campaigns }: { campaigns: any[] }) {
  const kpis = useMemo(() => {
    const total = campaigns.length;
    const running = campaigns.filter((c: any) => c.status === 'Aktív').length;
    const closed = campaigns.filter((c: any) => c.status === 'Befejezett').length;
    const scheduled = campaigns.filter((c: any) => c.status === 'Ütemezett').length;
    const targeted = campaigns.reduce((s: number, c: any) => s + (c.client_ids?.length || 0), 0);
    return { total, running, closed, scheduled, targeted };
  }, [campaigns]);

  const analytics = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    campaigns.forEach((c: any) => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });
    const avgClients = campaigns.length > 0 ? Math.round(kpis.targeted / campaigns.length) : 0;
    const successRate = campaigns.length > 0 ? Math.round((kpis.closed / campaigns.length) * 100) : 0;
    const lastCampaign = campaigns.length > 0 ? campaigns[0] : null;
    return { statusCounts, avgClients, successRate, lastCampaign };
  }, [campaigns, kpis]);

  const statusChartData = useMemo(() => {
    const counts: Record<string, number> = {
      'Tervezet': campaigns.filter((c: any) => c.status === 'Vázlat').length,
      'Aktív': campaigns.filter((c: any) => c.status === 'Aktív').length,
      'Elküldött': campaigns.filter((c: any) => c.status === 'Befejezett').length,
      'Megállítva': campaigns.filter((c: any) => c.status === 'Megállítva').length,
      'Ütemezett': campaigns.filter((c: any) => c.status === 'Ütemezett').length,
    };
    return {
      labels: Object.keys(counts),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: [
          'rgba(107,139,153,0.7)',
          'rgba(34,197,94,0.8)',
          'rgba(28,238,224,0.8)',
          'rgba(245,158,11,0.8)',
          'rgba(139,92,246,0.8)',
        ],
        borderColor: 'rgba(13,37,56,0.15)',
        borderWidth: 2,
        hoverOffset: 6,
      }]
    };
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {statCards.map(sc => (
          <div key={sc.label} className="panel-white" style={{ padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: `${sc.color}14`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: sc.color,
                boxShadow: `0 0 8px ${sc.color}60`,
              }} />
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>{sc.value}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b8b99', marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: 0.4 }}>{sc.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 36 }}>
        {/* Status Doughnut */}
        <div className="panel-white" style={{ padding: '24px 28px' }}>
          <div className="panel-title" style={{ marginBottom: 20 }}>
            Státusz eloszlás
          </div>
          <div style={{ position: 'relative', height: 200, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Doughnut data={statusChartData} options={{
              responsive: true, maintainAspectRatio: false, cutout: '65%',
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
            }} />
          </div>
        </div>

        {/* Campaign summary */}
        <div className="panel-white" style={{ padding: '24px 28px' }}>
          <div className="panel-title" style={{ marginBottom: 20 }}>
            Kampány összesítő
          </div>

          {/* Mini stat grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'Átl. ügyfél / kampány', value: analytics.avgClients, color: '#1ceee0' },
              { label: 'Befejezési arány', value: `${analytics.successRate}%`, color: '#22c55e' },
              { label: 'Ütemezett', value: kpis.scheduled, color: '#8b5cf6' },
              { label: 'Utolsó kampány', value: analytics.lastCampaign?.name || '–', sub: analytics.lastCampaign ? new Date(analytics.lastCampaign.created_at).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }) : '', color: '#3b82f6' },
            ].map(item => (
              <div key={item.label} style={{
                borderRadius: 12, padding: '16px 18px',
                borderLeft: `3px solid ${item.color}`,
                background: 'var(--card, #fff)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}>
                <div style={{ fontSize: item.label === 'Utolsó kampány' ? 15 : 22, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(item.value)}>{item.value}</div>
                {'sub' in item && item.sub && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b8b99)', marginTop: 2 }}>{item.sub}</div>}
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b8b99)', marginTop: 4, textTransform: 'uppercase' as const, letterSpacing: 0.3 }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #6b8b99)', textTransform: 'uppercase' as const, letterSpacing: 0.3 }}>Befejezési arány</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1ceee0' }}>{analytics.successRate}%</span>
            </div>
            <div style={{
              height: 8, borderRadius: 99,
              background: 'var(--bg3, rgba(0,0,0,0.04))',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 99,
                background: 'linear-gradient(90deg, #1ceee0, #22c55e)',
                width: `${analytics.successRate}%`,
                transition: 'width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }} />
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

  // Auto-refresh analytics every 5 minutes (uses latest loadAll via ref-like behavior)
  useEffect(() => {
    const interval = setInterval(() => loadAll(), 300000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
            {[140, 140, 140, 160].map((w, i) => (
              <div key={i} className="skeleton-shimmer" style={{ width: w, height: 40, borderRadius: 10 }} />
            ))}
          </div>
          {/* Skeleton KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 36 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton-shimmer" style={{ height: 110, borderRadius: 6 }} />
            ))}
          </div>
          {/* Skeleton chart row */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <div className="skeleton-shimmer" style={{ height: 300, borderRadius: 18 }} />
            <div className="skeleton-shimmer" style={{ height: 300, borderRadius: 18 }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page active" id="page-analytics">
      <div className="analytics-shell">
        {/* Page title */}
        <div style={{ marginBottom: 8 }}>
          <h1 className="page-title" style={{ margin: 0 }}>Analitika</h1>
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
          <div className="filter-group" style={{ position: 'relative' }}>
            <label>Időszak</label>
            <select className="filter-select-figma" value={period} onChange={e => { setPeriod(e.target.value); if (e.target.value !== 'custom') { setDateFrom(''); setDateTo(''); } }}>
              <option value="week">Aktuális hét</option>
              <option value="month">Aktuális hónap</option>
              <option value="year">Aktuális év</option>
              <option value="custom">Egyedi időszak</option>
            </select>
            {period === 'custom' && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 50,
                background: 'var(--card, #fff)', border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                padding: '20px 22px 16px', minWidth: 320,
                animation: 'fadein 0.2s ease',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>
                  Egyedi időszak kiválasztása
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b8b99)', display: 'block', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.4 }}>Kezdő dátum</label>
                    <input type="date" lang="hu" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', border: '1px solid var(--border, #e2e8f0)',
                        borderRadius: 10, fontSize: 13, background: 'var(--bg, #f8fafc)', color: 'var(--text)',
                        fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.2s',
                        boxSizing: 'border-box',
                      }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b8b99)', display: 'block', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.4 }}>Záró dátum</label>
                    <input type="date" lang="hu" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', border: '1px solid var(--border, #e2e8f0)',
                        borderRadius: 10, fontSize: 13, background: 'var(--bg, #f8fafc)', color: 'var(--text)',
                        fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.2s',
                        boxSizing: 'border-box',
                      }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Utolsó 7 nap', days: 7 },
                    { label: 'Utolsó 30 nap', days: 30 },
                    { label: 'Utolsó 90 nap', days: 90 },
                  ].map(p => (
                    <button key={p.days} onClick={() => {
                      const to = new Date(); const from = new Date(); from.setDate(from.getDate() - p.days);
                      setDateFrom(from.toISOString().slice(0, 10)); setDateTo(to.toISOString().slice(0, 10));
                    }} style={{
                      padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 8,
                      border: '1px solid var(--border, #e2e8f0)', background: 'var(--bg, #f8fafc)',
                      color: 'var(--text-muted, #6b8b99)', cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}>{p.label}</button>
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
        <div className="charts-row" style={{ marginBottom: 36 }}>
          {/* Sessions over time */}
          <div className="chart-card" style={{ height: 350 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="chart-title" style={{ marginBottom: 0, color: 'var(--text)', fontWeight: 700 }}>
                Megkeresések időbeli alakulása
              </div>
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
                <button className={`toggle-btn${chartView === 'napi' ? ' active' : ''}`}
                  style={{ background: chartView === 'napi' ? 'var(--primary)' : 'transparent', color: chartView === 'napi' ? '#0a192f' : 'var(--text)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: chartView === 'napi' ? 600 : 400, padding: '4px 12px', cursor: 'pointer' }}
                  onClick={() => setChartView('napi')}>Napi</button>
                <button className={`toggle-btn${chartView === 'oras' ? ' active' : ''}`}
                  style={{ background: chartView === 'oras' ? 'var(--primary)' : 'transparent', color: chartView === 'oras' ? '#0a192f' : 'var(--text)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: chartView === 'oras' ? 600 : 400, padding: '4px 12px', cursor: 'pointer' }}
                  onClick={() => setChartView('oras')}>Órás</button>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: '#6b8b99', cursor: 'pointer', width: 'fit-content' }}>
                <input type="checkbox" checked={channelBreakdown} onChange={e => setChannelBreakdown(e.target.checked)}
                  style={{ marginRight: 8, accentColor: '#1ceee0' }} /> Csatorna szerinti bontás
              </label>
            </div>
            <div style={{ position: 'relative', height: 'calc(100% - 70px)', marginTop: 10 }}>
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
          <div className="chart-card" style={{ height: 350 }}>
            <div className="chart-title" style={{ color: 'var(--text)', fontWeight: 700 }}>Csatornamegoszlás</div>
            <div style={{ position: 'relative', height: 160, display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 10 }}>
              <Doughnut data={{
                labels: chartTypes.map(t => t.type),
                datasets: [{ data: chartTypes.map(t => t.count), backgroundColor: typeColors.slice(0, chartTypes.length), borderWidth: 0 }],
              }} options={{ responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 16px', marginTop: 20, padding: '0 10px' }}>
              {chartTypes.map((t, i) => (
                <div key={t.type} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: typeColors[i % typeColors.length], marginRight: 8 }} />
                    <span style={{ fontSize: 12, color: '#6b8b99' }}>{t.type}</span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', paddingLeft: 16 }}>{t.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Quality & Performance */}
        <div className="section-divider" />
        <h2 className="section-header-figma">Minőség és teljesítmény</h2>
        <div style={{ display: 'grid', gridTemplateColumns: isAdminOnly ? '1fr 1fr 1fr' : '1fr 1fr', gap: 18, marginBottom: 36 }}>
          {/* Top topics */}
          <div className="panel-white">
            <div className="panel-title">Top kérdéstípusok / témák</div>
            <div>
              {topics.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20 }}><span className="no-data">Nincs adat</span></div>
              ) : topics.slice(0, 5).map((t, i) => {
                const pct = topicsTotal > 0 ? Math.round((t.count / topicsTotal) * 100) : 0;
                return (
                  <div className="topic-row" key={i}>
                    <div className="topic-row-header">
                      <div style={{ display: 'flex', alignItems: 'center' }}>
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
            <div style={{ position: 'relative', height: 240 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 36 }}>
          <div className="panel-white">
            <div className="panel-title">Kritikus ügyek</div>
            <AlertCards alerts={alerts} onOpenAlert={openAlertDetails} />
          </div>

          {/* AI insights — admin only */}
          {isAdminOnly && (
          <div className="panel-white">
            <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Finomhangolási javaslatok</span>
              <button onClick={refreshInsights} disabled={insightsLoading}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 4 }}>
                {insightsLoading ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <span>Frissítés</span>}
              </button>
            </div>
            <div>
              {insights.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Nincs elérhető javaslat.</div>
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
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
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
                  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ width: 40, height: 40, opacity: 0.3 }}>
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
