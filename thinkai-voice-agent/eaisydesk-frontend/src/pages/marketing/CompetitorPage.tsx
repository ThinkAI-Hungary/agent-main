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
        <div className="mkt-page-header-icon mkt-page-header-icon--competitor">
          <svg fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
        </div>
        <div>
          <div className="mkt-page-title">Árfigyelő</div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="mkt-kpi-grid">
        <div className="mkt-kpi-card mkt-kpi-card--red"><div className="mkt-kpi-label">Figyelt versenytársak</div><div className="mkt-kpi-value">3</div></div>
        <div className="mkt-kpi-card mkt-kpi-card--green"><div className="mkt-kpi-label">Ár pozíció</div><div className="mkt-kpi-value">Átlag alatt</div></div>
        <div className="mkt-kpi-card mkt-kpi-card--amber"><div className="mkt-kpi-label">Utolsó frissítés</div><div className="mkt-kpi-value">{new Date().toLocaleDateString('hu-HU')}</div></div>
        <div className="mkt-kpi-card mkt-kpi-card--purple"><div className="mkt-kpi-label">Ár változások</div><div className="mkt-kpi-value">2</div></div>
      </div>

      {/* Competitor Cards */}
      <div className="mb-24">
        {competitors.map(c => (
          <div key={c.name} className="mkt-competitor-card">
            <div className="mkt-competitor-avatar">{c.initials}</div>
            <div className="flex-1">
              <div className="mkt-competitor-name">{c.name}</div>
              <div className="mkt-competitor-url">{c.url}</div>
              <div className="mkt-competitor-products">🏷 {c.products}</div>
            </div>
            <span className="mkt-badge mkt-badge-green">Aktív</span>
          </div>
        ))}
      </div>

      {/* Placeholder */}
      <div className="mkt-placeholder">
        <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
        <h3>Árösszehasonlítás &amp; Riportok</h3>
        <p>A részletes ár-összehasonlító táblázat, történeti diagram és automatikus riport funkciók hamarosan elérhetők lesznek.</p>
      </div>
    </div>
  );
}
