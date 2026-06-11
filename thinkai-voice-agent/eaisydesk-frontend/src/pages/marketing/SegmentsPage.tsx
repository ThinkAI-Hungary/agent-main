/**
 * SegmentsPage – Subscriber segments & coupon code management.
 */
import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../api/client';
import { showToast } from '../../components/ui/Toast';
import Spinner from '../../components/ui/Spinner';

interface Subscriber {
  id: number;
  email: string;
  name: string;
  created_at: string;
  tags: string[];
}

export default function SegmentsPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'segments' | 'coupons'>('segments');

  // Demo segments
  const segments = [
    { name: 'Összes feliratkozó', count: subscribers.length, color: '#8b5cf6', icon: '👥' },
    { name: 'Aktív páciensek', count: Math.round(subscribers.length * 0.6), color: '#22c55e', icon: '✅' },
    { name: 'Inaktív (90+ nap)', count: Math.round(subscribers.length * 0.15), color: '#f59e0b', icon: '⏳' },
    { name: 'Új feliratkozók (30 nap)', count: Math.round(subscribers.length * 0.25), color: '#3b82f6', icon: '🆕' },
  ];

  // Demo coupons
  const coupons = [
    { code: 'NYAR2025', type: 'Százalék', value: '15%', expires: '2025-08-31', used: 12, campaign: 'Nyári akció' },
    { code: 'UJPACIENS', type: 'Fix összeg', value: '5000 Ft', expires: '2025-12-31', used: 34, campaign: 'Új páciens' },
    { code: 'HIVD20', type: 'Százalék', value: '20%', expires: '2025-07-15', used: 8, campaign: 'Hivatkozási program' },
  ];

  const loadSubscribers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/marketing/api/subscribers');
      if (res.ok) setSubscribers(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadSubscribers(); }, [loadSubscribers]);

  const handleImportCrm = useCallback(async () => {
    try {
      const res = await authFetch('/marketing/api/subscribers/import-crm', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        showToast(`${data.imported || 0} feliratkozó importálva!`);
        loadSubscribers();
      } else showToast('Import hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [loadSubscribers]);

  return (
    <div className="page active">
      <div className="mkt-page-header">
        <div className="mkt-page-header-icon" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,185,129,0.15))' }}>
          <svg fill="none" stroke="#22c55e" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div className="mkt-page-title">Szegmentáció & Kuponok</div>
          <div className="mkt-page-subtitle">Célcsoportok kezelése és kuponkód generálás</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="mkt-btn-outline" onClick={handleImportCrm}>📥 CRM Import</button>
          <button className="mkt-btn-accent">
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
            Új szegmens
          </button>
        </div>
      </div>

      <div className="mkt-view-switcher">
        <button className={`mkt-view-btn ${view === 'segments' ? 'active' : ''}`} onClick={() => setView('segments')}>Szegmensek</button>
        <button className={`mkt-view-btn ${view === 'coupons' ? 'active' : ''}`} onClick={() => setView('coupons')}>Kuponkódok</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
      ) : view === 'segments' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {segments.map(s => (
            <div key={s.name} className="mkt-card" style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${s.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.count} feliratkozó</div>
                </div>
              </div>
              <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${subscribers.length > 0 ? Math.round((s.count / subscribers.length) * 100) : 0}%`, background: s.color, borderRadius: 3, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mkt-card" style={{ overflow: 'hidden', padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Kuponkód</th>
                <th>Típus</th>
                <th>Érték</th>
                <th>Érvényesség</th>
                <th>Felhasználás</th>
                <th>Kampány</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map(c => (
                <tr key={c.code}>
                  <td style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--marketing-accent)' }}>{c.code}</td>
                  <td>{c.type}</td>
                  <td style={{ fontWeight: 600 }}>{c.value}</td>
                  <td>{c.expires}</td>
                  <td>{c.used}×</td>
                  <td><span className="mkt-badge mkt-badge-purple">{c.campaign}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
