/**
 * LoyaltyPage – Placeholder for loyalty/rewards program (Bronze/Silver/Gold tiers).
 */
export default function LoyaltyPage() {
  const tiers = [
    { name: 'Bronze', icon: '🥉', members: 245, threshold: '0-499 pont', discount: '5%', color: 'bronze' },
    { name: 'Silver', icon: '🥈', members: 128, threshold: '500-1499 pont', discount: '10%', color: 'silver' },
    { name: 'Gold', icon: '🥇', members: 42, threshold: '1500+ pont', discount: '20%', color: 'gold' },
  ];

  return (
    <div className="page active">
      <div className="mkt-page-header">
        <div className="mkt-page-header-icon" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(234,88,12,0.15))' }}>
          <svg fill="none" stroke="#f59e0b" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <div>
          <div className="mkt-page-title">Hűségprogram</div>
          <div className="mkt-page-subtitle">Szintrendszer, pontgyűjtés és kedvezmények kezelése</div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="mkt-kpi-grid">
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#f59e0b' }}><div className="mkt-kpi-label">Összes tag</div><div className="mkt-kpi-value">415</div></div>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#22c55e' }}><div className="mkt-kpi-label">Aktív tagok</div><div className="mkt-kpi-value">312</div></div>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#8b5cf6' }}><div className="mkt-kpi-label">Kiadott pontok</div><div className="mkt-kpi-value">84.2K</div></div>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#3b82f6' }}><div className="mkt-kpi-label">Beváltott kedvezmények</div><div className="mkt-kpi-value">67</div></div>
      </div>

      {/* Tier Cards */}
      <div className="mkt-grid-3">
        {tiers.map(t => (
          <div key={t.name} className={`mkt-tier-card ${t.color}`}>
            <div className="mkt-tier-icon">{t.icon}</div>
            <div className="mkt-tier-name">{t.name}</div>
            <div className="mkt-tier-members">{t.members} tag</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{t.threshold}</div>
            <div style={{ fontSize: 13, color: 'var(--text)' }}>Kedvezmény: <strong style={{ color: 'var(--marketing-accent)' }}>{t.discount}</strong></div>
          </div>
        ))}
      </div>

      {/* Placeholder */}
      <div className="mkt-placeholder">
        <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v1" /></svg>
        <h3>Hűségprogram kezelése</h3>
        <p>A szintrendszer testreszabása, pontszabályok beállítása és a hűségkuponok kezelése hamarosan elérhető lesz.</p>
      </div>
    </div>
  );
}
