/**
 * MarketingDashboardPage – Overview with KPIs, charts, quick actions, recent campaigns.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../../api/client';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface CampaignStats {
  total_campaigns: number;
  active_campaigns: number;
  total_subscribers: number;
  total_sent: number;
  avg_open_rate: number;
  avg_click_rate: number;
}

interface CampaignSummary {
  id: number;
  name: string;
  status: string;
  sent_count: number;
  open_rate: number;
  created_at: string;
}

export default function MarketingDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, campaignsRes] = await Promise.all([
        authFetch('/marketing/api/campaigns/stats'),
        authFetch('/marketing/api/campaigns'),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(Array.isArray(data) ? data.slice(0, 5) : []);
      }
    } catch (e) {
      console.error('Marketing dashboard load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const kpis = [
    { label: 'Aktív kampányok', value: stats?.active_campaigns ?? 0, color: '#8b5cf6' },
    { label: 'Feliratkozók', value: stats?.total_subscribers ?? 0, color: '#22c55e' },
    { label: 'Megnyitási arány', value: `${stats?.avg_open_rate ?? 0}%`, color: '#3b82f6' },
    { label: 'Elküldött e-mailek', value: stats?.total_sent ?? 0, color: '#f59e0b' },
  ];

  // Demo chart data
  const chartData = {
    labels: ['Hét 1', 'Hét 2', 'Hét 3', 'Hét 4', 'Hét 5', 'Hét 6'],
    datasets: [
      {
        label: 'Megnyitás',
        data: [30, 42, 38, 55, 48, 62],
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139,92,246,0.08)',
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#8b5cf6',
      },
      {
        label: 'Kattintás',
        data: [8, 12, 10, 18, 15, 22],
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.08)',
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#22c55e',
      },
    ],
  };

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const, labels: { color: '#6b8b99', usePointStyle: true, font: { size: 11 } } },
    },
    scales: {
      x: { ticks: { color: '#6b8b99', font: { size: 11 } }, grid: { display: false } },
      y: { ticks: { color: '#6b8b99', font: { size: 11 } }, grid: { color: 'rgba(107,139,153,0.15)' } },
    },
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      draft: { bg: 'rgba(107,139,153,0.1)', color: '#6b8b99', label: 'Tervezet' },
      active: { bg: 'rgba(34,197,94,0.1)', color: '#22c55e', label: 'Aktív' },
      sent: { bg: 'rgba(139,92,246,0.1)', color: '#8b5cf6', label: 'Elküldött' },
      scheduled: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', label: 'Ütemezett' },
    };
    const s = map[status] || map.draft;
    return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: s.bg, color: s.color }}>{s.label}</span>;
  };

  if (loading) {
    return (
      <div className="analytics-shell" style={{ textAlign: 'center', padding: 60 }}>
        <div className="spinner" style={{ borderTopColor: '#8b5cf6' }} /> Betöltés...
      </div>
    );
  }

  return (
    <div className="page active">
      {/* Header */}
      <div className="mkt-page-header">
        <div className="mkt-page-header-icon" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15))' }}>
          <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12h2l3-9 4 18 3-9h6" /></svg>
        </div>
        <div>
          <div className="mkt-page-title">Marketing Áttekintés</div>
          <div className="mkt-page-subtitle">Összesített marketing teljesítmény és gyors műveletek</div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="mkt-kpi-grid">
        {kpis.map(k => (
          <div key={k.label} className="mkt-kpi-card" style={{ borderLeftColor: k.color }}>
            <div className="mkt-kpi-label">{k.label}</div>
            <div className="mkt-kpi-value">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Charts + Quick Actions */}
      <div className="mkt-grid-2">
        <div className="mkt-chart-card" style={{ height: 320 }}>
          <div className="mkt-card-title">
            <div className="mkt-card-title-icon" style={{ background: 'rgba(139,92,246,0.1)' }}>
              <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12h2l3-9 4 18 3-9h6" /></svg>
            </div>
            Kampány teljesítmény
          </div>
          <div style={{ height: 'calc(100% - 50px)' }}>
            <Line data={chartData} options={chartOpts} />
          </div>
        </div>

        <div className="mkt-card">
          <div className="mkt-card-title">
            <div className="mkt-card-title-icon" style={{ background: 'rgba(34,197,94,0.1)' }}>
              <svg fill="none" stroke="#22c55e" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            Gyors műveletek
          </div>
          <div className="mkt-action-grid">
            <button className="mkt-action-btn" onClick={() => navigate('/admin/marketing/email')}>
              <div className="mkt-action-btn-icon" style={{ background: 'rgba(139,92,246,0.1)' }}>
                <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
              <div className="mkt-action-btn-text"><div className="mkt-action-btn-label">Új kampány</div><div className="mkt-action-btn-sub">E-mail kampány indítása</div></div>
            </button>
            <button className="mkt-action-btn" onClick={() => navigate('/admin/marketing/social')}>
              <div className="mkt-action-btn-icon" style={{ background: 'rgba(245,158,11,0.1)' }}>
                <svg fill="none" stroke="#f59e0b" strokeWidth="2" viewBox="0 0 24 24"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
              </div>
              <div className="mkt-action-btn-text"><div className="mkt-action-btn-label">Új poszt</div><div className="mkt-action-btn-sub">Közösségi média tartalom</div></div>
            </button>
            <button className="mkt-action-btn" onClick={() => navigate('/admin/marketing/seo')}>
              <div className="mkt-action-btn-icon" style={{ background: 'rgba(59,130,246,0.1)' }}>
                <svg fill="none" stroke="#3b82f6" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
              </div>
              <div className="mkt-action-btn-text"><div className="mkt-action-btn-label">SEO Audit</div><div className="mkt-action-btn-sub">Kulcsszó pozíciók</div></div>
            </button>
            <button className="mkt-action-btn" onClick={() => navigate('/admin/marketing/segments')}>
              <div className="mkt-action-btn-icon" style={{ background: 'rgba(34,197,94,0.1)' }}>
                <svg fill="none" stroke="#22c55e" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
              </div>
              <div className="mkt-action-btn-text"><div className="mkt-action-btn-label">Szegmensek</div><div className="mkt-action-btn-sub">Célcsoport kezelés</div></div>
            </button>
          </div>
        </div>
      </div>

      {/* Recent Campaigns + Notifications */}
      <div className="mkt-grid-2">
        <div className="mkt-card">
          <div className="mkt-card-title">
            <div className="mkt-card-title-icon" style={{ background: 'rgba(59,130,246,0.1)' }}>
              <svg fill="none" stroke="#3b82f6" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8" /></svg>
            </div>
            Legutóbbi kampányok
          </div>
          {campaigns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 13 }}>Még nincsenek kampányok.</div>
          ) : campaigns.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {c.created_at ? new Date(c.created_at).toLocaleDateString('hu-HU') : '—'}
                  {c.sent_count > 0 && ` · ${c.sent_count} elküldve`}
                </div>
              </div>
              {statusBadge(c.status)}
            </div>
          ))}
        </div>

        <div className="mkt-card">
          <div className="mkt-card-title">
            <div className="mkt-card-title-icon" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <svg fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" /></svg>
            </div>
            Értesítések
          </div>
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 13 }}>
            Nincs új értesítés.
          </div>
        </div>
      </div>
    </div>
  );
}
