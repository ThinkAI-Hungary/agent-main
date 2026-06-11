/**
 * SeoPage – Placeholder for SEO/SEM features (keyword tracking, Google Ads, backlinks).
 */
export default function SeoPage() {
  const demoKeywords = [
    { keyword: 'fogászat budapest', position: 3, change: 2, volume: 2400, difficulty: 'Közepes' },
    { keyword: 'fogorvos rendelés', position: 7, change: -1, volume: 1800, difficulty: 'Magas' },
    { keyword: 'implantátum ár', position: 12, change: 4, volume: 1200, difficulty: 'Magas' },
    { keyword: 'fog fehérítés', position: 5, change: 1, volume: 900, difficulty: 'Alacsony' },
    { keyword: 'fogszabályozó felnőtt', position: 18, change: -3, volume: 600, difficulty: 'Közepes' },
  ];

  return (
    <div className="page active">
      <div className="mkt-page-header">
        <div className="mkt-page-header-icon" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(37,99,235,0.15))' }}>
          <svg fill="none" stroke="#3b82f6" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
        </div>
        <div>
          <div className="mkt-page-title">SEO / SEM</div>
          <div className="mkt-page-subtitle">Keresőoptimalizálás, kulcsszó pozíciók és Google Ads kezelés</div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="mkt-kpi-grid">
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#3b82f6' }}><div className="mkt-kpi-label">Figyelt kulcsszavak</div><div className="mkt-kpi-value">5</div></div>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#22c55e' }}><div className="mkt-kpi-label">Top 10 pozíció</div><div className="mkt-kpi-value">3</div></div>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#f59e0b' }}><div className="mkt-kpi-label">Havi organikus forgalom</div><div className="mkt-kpi-value">~4.2K</div></div>
        <div className="mkt-kpi-card" style={{ borderLeftColor: '#8b5cf6' }}><div className="mkt-kpi-label">Domain Authority</div><div className="mkt-kpi-value">34</div></div>
      </div>

      {/* Keyword Table */}
      <div className="mkt-card" style={{ overflow: 'hidden', padding: 0, marginBottom: 18 }}>
        <div style={{ padding: '18px 24px 0', fontSize: 15, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="mkt-card-title-icon" style={{ background: 'rgba(59,130,246,0.1)' }}>
            <svg fill="none" stroke="#3b82f6" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          </div>
          Kulcsszó pozíciók
        </div>
        <table className="data-table" style={{ marginTop: 12 }}>
          <thead><tr><th>Kulcsszó</th><th>Pozíció</th><th>Változás</th><th>Havi keresés</th><th>Nehézség</th></tr></thead>
          <tbody>
            {demoKeywords.map(k => (
              <tr key={k.keyword}>
                <td style={{ fontWeight: 600 }}>{k.keyword}</td>
                <td><span style={{ fontWeight: 800, fontSize: 16, color: k.position <= 10 ? '#22c55e' : 'var(--text)' }}>#{k.position}</span></td>
                <td>
                  <span className={`mkt-kpi-trend ${k.change > 0 ? 'up' : k.change < 0 ? 'down' : 'neutral'}`}>
                    {k.change > 0 ? `▲ ${k.change}` : k.change < 0 ? `▼ ${Math.abs(k.change)}` : '—'}
                  </span>
                </td>
                <td>{k.volume.toLocaleString()}</td>
                <td><span className={`mkt-badge ${k.difficulty === 'Alacsony' ? 'mkt-badge-green' : k.difficulty === 'Közepes' ? 'mkt-badge-yellow' : 'mkt-badge-red'}`}>{k.difficulty}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Placeholder */}
      <div className="mkt-placeholder">
        <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
        <h3>Google Ads & Backlink Monitoring</h3>
        <p>A Google Ads kezelés és backlink monitoring funkciók hamarosan elérhetők lesznek. Addig is figyeld a kulcsszó pozícióidat!</p>
      </div>
    </div>
  );
}
