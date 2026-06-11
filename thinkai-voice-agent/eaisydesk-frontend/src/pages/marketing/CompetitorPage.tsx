/**
 * CompetitorPage – Placeholder for competitor/price monitoring.
 */
export default function CompetitorPage() {
  const competitors = [
    { name: 'Dr. Smile Dental', initials: 'DS', url: 'drsmile.hu', products: 'Implantátum, Fogfehérítés, Fogszabályozás' },
    { name: 'Dental Harmony', initials: 'DH', url: 'dentalharmony.hu', products: 'Általános fogászat, Szájsebészet' },
    { name: 'MosolyPont', initials: 'MP', url: 'mosolypont.hu', products: 'Esztétikai fogászat, Koronák' },
  ];

  return (
    <div className="page active">
      <div className="mkt-page-header">
        <div className="mkt-page-header-icon" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.15))' }}>
          <svg fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
        </div>
        <div>
          <div className="mkt-page-title">Árfigyelő</div>
          <div className="mkt-page-subtitle">Versenytárs monitoring és árösszehasonlítás</div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="mkt-kpi-grid">
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#ef4444' }}><div className="mkt-kpi-label">Figyelt versenytársak</div><div className="mkt-kpi-value">3</div></div>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#22c55e' }}><div className="mkt-kpi-label">Ár pozíció</div><div className="mkt-kpi-value">Átlag alatt</div></div>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#f59e0b' }}><div className="mkt-kpi-label">Utolsó frissítés</div><div className="mkt-kpi-value">{new Date().toLocaleDateString('hu-HU')}</div></div>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#8b5cf6' }}><div className="mkt-kpi-label">Ár változások</div><div className="mkt-kpi-value">2</div></div>
      </div>

      {/* Competitor Cards */}
      <div style={{ marginBottom: 24 }}>
        {competitors.map(c => (
          <div key={c.name} className="mkt-competitor-card">
            <div className="mkt-competitor-avatar">{c.initials}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{c.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.url}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>🏷 {c.products}</div>
            </div>
            <span className="mkt-badge mkt-badge-green">Aktív</span>
          </div>
        ))}
      </div>

      {/* Placeholder */}
      <div className="mkt-placeholder">
        <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
        <h3>Árösszehasonlítás & Riportok</h3>
        <p>A részletes ár-összehasonlító táblázat, történeti diagram és automatikus riport funkciók hamarosan elérhetők lesznek.</p>
      </div>
    </div>
  );
}
