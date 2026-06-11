import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authFetch } from '../api/client';
import { supabase } from '../lib/supabase';
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

// ── Helper ────────────────────────────────────────────────────────────────────
function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

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
function KpiCard({ label, value, sub, prev, prevLabel, onClick }: {
  label: string; value: number; sub: string; prev?: number; prevLabel: string; onClick?: () => void;
}) {
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
    <button className="kpi-card-figma" onClick={onClick}>
      <div className="kpi-card-label">{label}</div>
      <div className="kpi-card-value">{value}</div>
      <div className="kpi-card-subtitle">{sub}</div>
      <div className={`kpi-card-trend ${trendClass}`}>
        <span>{trendText}</span>
        {prevLabel && <span className="kpi-trend-desc">{prevLabel} képest</span>}
      </div>
    </button>
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  // Redirect members to their dashboard
  useEffect(() => {
    if (!isAdmin) navigate('/dashboard', { replace: true });
  }, [isAdmin, navigate]);

  const [period, setPeriod] = useState('month');
  const [channel, setChannel] = useState('mind');
  const [clinic, setClinic] = useState('mind');
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

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsResult, funnelResult, alertsResult, outboundResult, insightsResult] = await Promise.all([
        supabase.rpc('get_analytics_stats', { p_period: period }),
        supabase.rpc('get_analytics_funnel', { p_period: period }),
        supabase.rpc('get_analytics_alerts', { p_period: period }),
        supabase.rpc('get_outbound_summary', { p_period: period }),
        supabase.from('ai_insights').select('insights').order('created_at', { ascending: false }).limit(1).single(),
      ]);
      if (statsResult.data) setStats(statsResult.data);
      if (funnelResult.data) setFunnel(funnelResult.data);
      if (alertsResult.data) setAlerts(alertsResult.data);
      if (outboundResult.data) setOutbound(outboundResult.data);
      if (insightsResult.data?.insights) setInsights(insightsResult.data.insights);
    } catch (e) {
      console.error('Analytics load error', e);
    } finally {
      setLoading(false);
    }
  }, [period, channel, clinic]);

  useEffect(() => { loadAll(); }, [loadAll]);

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
      // Alert details: read directly from interaction_list view
      const { data } = await supabase
        .from('interaction_list')
        .select('created_at, type, topic, participant, summary, approval_status')
        .order('created_at', { ascending: false })
        .limit(50);

      if (data && data.length > 0) {
        const mapped = data.map((r: Record<string, unknown>) => ({
          created_at: r.created_at as string,
          channel: r.type as string,
          topic: r.topic as string,
          name: r.participant as string,
          summary: r.summary as string,
          status: r.approval_status as string,
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
  const isDark = document.body.classList.contains('dark');
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

  const prevLabel = { week: 'előző héthez', month: 'előző hónaphoz', year: 'előző évhez' }[period] || '';
  const prev = stats?.previous_period || {};

  const kpiCards = stats ? [
    { label: 'Összes megkeresés', value: stats.total_interactions ?? 0, sub: 'interakció', prev: prev.total_interactions, page: 'interactions' },
    { label: 'Foglalási arány', value: stats.total_bookings ?? 0, sub: 'foglalás', prev: prev.total_bookings, page: 'calendar' },
    { label: 'Átadási arány', value: stats.total_sessions ?? 0, sub: 'élő átadás', prev: prev.total_sessions, page: 'interactions' },
    { label: 'Avg. session (mp)', value: stats.avg_session_duration ?? 0, sub: 'mp', prev: prev.avg_session_duration, page: 'interactions' },
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
          <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
            <div className="spinner" style={{ borderColor: '#e5e7eb', borderTopColor: '#1ceee0' }} /> Adatok betöltése...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page active" id="page-analytics">
      <div className="analytics-shell">
        {/* Filter row */}
        <div className="filter-row-figma">
          <div className="filter-group">
            <label>Telephely</label>
            <select className="filter-select-figma" value={clinic} onChange={e => setClinic(e.target.value)}>
              <option value="mind">Mind</option>
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
          <div className="filter-group">
            <label>Időszak</label>
            <select className="filter-select-figma" value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="week">Jelenlegi hét</option>
              <option value="month">Jelen hónap</option>
              <option value="year">Éves nézet</option>
            </select>
          </div>
          <button className="btn-filter-apply" onClick={loadAll}>Szűrés alkalmazása</button>
        </div>

        {/* KPI grid */}
        <div className="kpi-grid-figma">
          {kpiCards.map(c => (
            <KpiCard key={c.label} label={c.label} value={c.value} sub={c.sub}
              prev={c.prev} prevLabel={prevLabel}
              onClick={() => navigate(`/admin/${c.page}`)} />
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
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', padding: 4, borderRadius: 8 }}>
                <button className={`toggle-btn${chartView === 'napi' ? ' active' : ''}`}
                  style={{ background: chartView === 'napi' ? 'var(--primary)' : 'transparent', color: chartView === 'napi' ? '#0a192f' : '#6b8b99', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: chartView === 'napi' ? 600 : 400, padding: '4px 12px', cursor: 'pointer' }}
                  onClick={() => setChartView('napi')}>Napi</button>
                <button className={`toggle-btn${chartView === 'oras' ? ' active' : ''}`}
                  style={{ background: chartView === 'oras' ? 'var(--primary)' : 'transparent', color: chartView === 'oras' ? '#0a192f' : '#6b8b99', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: chartView === 'oras' ? 600 : 400, padding: '4px 12px', cursor: 'pointer' }}
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
                  x: { ticks: { color: '#6b8b99', font: { size: 11 } }, grid: { color: gridColor, borderDash: gridDash }, border: { display: false } },
                  y: { min: 0, max: yMax, ticks: { color: '#6b8b99', font: { size: 11 }, stepSize: yStep }, grid: { color: gridColor, borderDash: gridDash }, border: { display: false } },
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, marginBottom: 36 }}>
          {/* Top topics */}
          <div className="panel-white">
            <div className="panel-title">Top kérdéstípusok / témák</div>
            <div>
              {topics.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 20 }}>Nincs adat</div>
              ) : topics.slice(0, 5).map((t, i) => {
                const pct = topicsTotal > 0 ? Math.round((t.count / topicsTotal) * 100) : 0;
                return (
                  <div className="topic-row" key={i}>
                    <div className="topic-row-header">
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div className="topic-rank-badge">{i + 1}</div>
                        <span className="topic-name">{t.topic || 'Ismeretlen'}</span>
                      </div>
                      <span className="topic-value">{t.count}<span className="topic-pct">({pct}%)</span></span>
                    </div>
                    <div className="progress-bar-track"><div className="progress-bar-fill" style={{ width: `${pct * 3}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Handoff chart */}
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

          {/* AI insights */}
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
        </div>

        {/* 4. Outbound */}
        <div className="section-divider" />
        <h2 className="section-header-figma">Kimenő kommunikáció</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr', gap: 18, marginBottom: 20 }}>
          <div>
            <div className="out-kpi-card">
              <div className="out-kpi-label">Összes kimenő</div>
              <div className="out-kpi-value">{obTotal}</div>
            </div>
            <div className="out-kpi-card">
              <div className="out-kpi-label">Elért páciensek</div>
              <div className="out-kpi-value">{outbound?.reached_rate || 0}%</div>
              <div className="out-kpi-sub">az összes indított kapcsolatfelvételből</div>
            </div>
            <div className="out-kpi-card">
              <div className="out-kpi-label">Foglalássá vált</div>
              <div className="out-kpi-value">{obBooked}</div>
              <div className="out-kpi-trend">{outbound?.booked_rate || 0}% konverziós arány</div>
            </div>
            <div className="out-kpi-card">
              <div className="out-kpi-label">Nyitott utánkövetés</div>
              <div className="out-kpi-value">{outbound?.open_followup || 0}</div>
              <div className="out-kpi-sub">emberi lépést igényel</div>
            </div>
          </div>

          {/* Activity chart */}
          <div className="panel-white">
            <div className="panel-title">Aktivitás típusok</div>
            <div style={{ position: 'relative', height: 300 }}>
              <Bar data={{ labels: activityLabels, datasets: [{ label: 'Aktivitás', data: activityData, backgroundColor: '#1ceee0', borderRadius: 6 }] }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                  scales: {
                    x: { ticks: { color: '#6b7280', font: { size: 11 }, maxRotation: 45 }, grid: { display: false } },
                    y: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { color: '#f3f4f6' } },
                  },
                }} />
            </div>
          </div>

          {/* Outbound funnel */}
          <div className="panel-white">
            <div className="panel-title">Eredményesség és konverzió</div>
            <div>
              {obTotal === 0 ? (
                /* Demo funnel when no data -- same percentages as original JS */
                <>
                  <div className="green-funnel-step" style={{ width: '100%' }}>
                    <div className="green-funnel-label">Kimenő kommunikáció indítva</div>
                    <div><span className="green-funnel-val">0</span><span className="green-funnel-pct">(100%)</span></div>
                  </div>
                  <div className="funnel-conv">{"\u25bc"} 72% konverzió</div>
                  <div className="green-funnel-step" style={{ width: '72%' }}>
                    <div className="green-funnel-label">Páciens elérve / Reagált</div>
                    <div><span className="green-funnel-val">0</span><span className="green-funnel-pct">(0%)</span></div>
                  </div>
                  <div className="funnel-conv">{"\u25bc"} 60% konverzió</div>
                  <div className="green-funnel-step" style={{ width: '55%' }}>
                    <div className="green-funnel-label">Időpont egyeztetve</div>
                    <div><span className="green-funnel-val">0</span><span className="green-funnel-pct">(0%)</span></div>
                  </div>
                  <div className="funnel-conv">{"\u25bc"} 52% konverzió</div>
                  <div className="green-funnel-step" style={{ width: '40%' }}>
                    <div className="green-funnel-label">Foglalás létrejött</div>
                    <div><span className="green-funnel-val">0</span><span className="green-funnel-pct">(0%)</span></div>
                  </div>
                </>
              ) : [
                { label: 'Kimenő kommunikáció indítva', val: obTotal, w: 100 },
                { label: 'Páciens elérve / Reagált', val: obReached, w: Math.round((obReached / obTotal) * 100), conv: Math.round((obReached / obTotal) * 100) },
                { label: 'Időpont egyeztetve', val: obNeg, w: Math.round((obNeg / obTotal) * 100), conv: obReached > 0 ? Math.round((obNeg / obReached) * 100) : 0 },
                { label: 'Foglalás létrejött', val: obBooked, w: Math.round((obBooked / obTotal) * 100), conv: obNeg > 0 ? Math.round((obBooked / obNeg) * 100) : 0 },
              ].map((s, i) => (
                <div key={i}>
                  {i > 0 && <div className="funnel-conv">{"\u25bc"} {s.conv}% konverzió</div>}
                  <div className="green-funnel-step" style={{ width: `${Math.max(s.w, 10)}%` }}>
                    <div className="green-funnel-label">{s.label}</div>
                    <div><span className="green-funnel-val">{s.val}</span><span className="green-funnel-pct">({Math.round((s.val / obTotal) * 100)}%)</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Alert Details Modal */}
      {alertModal && (
        <div id="alert-details-modal"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setAlertModal(null); }}
        >
          <div className="login-card" style={{
            width: 800, maxWidth: '95vw', maxHeight: '85vh', padding: 0, overflow: 'hidden',
            borderRadius: 16, border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(to right, #fef2f2, #fee2e2)',
              padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: '#b91c1c', fontSize: 18, fontWeight: 700 }}>
                  Részletek: {alertModal.title}
                </h3>
                <button onClick={() => setAlertModal(null)} style={{
                  background: 'transparent', border: 'none', color: 'rgba(0,0,0,0.4)',
                  fontSize: 24, cursor: 'pointer', lineHeight: 1,
                }}>&times;</button>
              </div>
            </div>
            {/* Content */}
            <div style={{ padding: 24, overflowY: 'auto', flex: 1, background: 'var(--bg2, #f9fafb)' }}>
              <div className="table-card" style={{ margin: 0, boxShadow: 'none', border: '1px solid rgba(0,0,0,0.05)' }}>
                <table className="data-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Dátum</th>
                      <th>Csatorna</th>
                      <th>Név / Téma</th>
                      <th>Részlet / Státusz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertModal.loading ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center' }}><div className="spinner" /></td></tr>
                    ) : alertModal.rows.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Nincs megjeleníthető adat.</td></tr>
                    ) : alertModal.rows.map((item, i) => (
                      <tr key={i}>
                        <td className="td-time">{fmtDt(item.created_at)}</td>
                        <td style={{ fontWeight: 600, color: 'var(--text)' }}>{item.channel}</td>
                        <td><strong style={{ color: 'var(--text)' }}>{item.is_stuck ? item.name : item.topic}</strong></td>
                        <td>{item.is_stuck
                          ? <span className="status-badge" style={{ background: 'var(--bg3)', color: 'var(--text)', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>{item.status}</span>
                          : <span style={{ color: 'rgba(8,36,50,0.8)' }}>{item.summary}</span>
                        }</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
