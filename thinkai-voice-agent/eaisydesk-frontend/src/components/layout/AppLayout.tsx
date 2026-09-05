import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import MarketingSidebar from './MarketingSidebar';
import NotificationCenter from './NotificationCenter';
import CommandPalette from './CommandPalette';
import SessionTimeoutGuard from './SessionTimeoutGuard';
import { useAuth } from '../../context/AuthContext';

export default function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { impersonatedTenant, exitImpersonation } = useAuth();
  const isMarketing = pathname.startsWith('/marketing');

  const handleExit = async () => {
    await exitImpersonation();
    navigate('/management');
  };

  return (
    <div id="app">
      {isMarketing ? <MarketingSidebar /> : <Sidebar />}
      <main className="main-content">
        {impersonatedTenant && (
          <div style={{
            background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.18) 0%, rgba(217, 119, 6, 0.22) 100%)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.4)',
            padding: '8px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            zIndex: 90,
            fontSize: '13px',
            color: 'var(--text, #082432)',
            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🏢</span>
              <span>
                Ön jelenleg a(z) <strong style={{ color: '#d97706' }}>{impersonatedTenant.name}</strong> ({impersonatedTenant.slug}) cég nevében jár el. <em style={{ opacity: 0.85 }}>(Superadmin megszemélyesítés)</em>
              </span>
            </div>
            <button
              onClick={handleExit}
              style={{
                background: '#d97706',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#b45309')}
              onMouseOut={(e) => (e.currentTarget.style.background = '#d97706')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Kilépés a cégből / Vissza a Control Centerbe
            </button>
          </div>
        )}
        <NotificationCenter />
        <Outlet />
      </main>
      <CommandPalette />
      <SessionTimeoutGuard />
    </div>
  );
}
