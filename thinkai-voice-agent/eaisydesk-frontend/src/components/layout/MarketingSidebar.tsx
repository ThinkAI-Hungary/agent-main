/**
 * MarketingSidebar – Dedicated sidebar for the Marketing module.
 * Purple-themed with "M Marketing" logo and marketing-specific navigation.
 * Has a logo switcher to go back to the DigiDesk (eaisydesk) sidebar.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const MKT_NAV_ITEMS = [
  { id: 'mkt-dashboard', label: 'Áttekintés', path: '/marketing', icon: 'M3 12h2l3-9 4 18 3-9h6' },
  { id: 'mkt-email', label: 'E-mail kampányok', path: '/marketing/email', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { id: 'mkt-segments', label: 'Szegmentáció', path: '/marketing/segments', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 3a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
  { id: 'mkt-social', label: 'Közösségi Média', path: '/marketing/social', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  { id: 'mkt-seo', label: 'SEO / SEM', path: '/marketing/seo', icon: 'M11 11m-8 0a8 8 0 1016 0 8 8 0 00-16 0zM21 21l-4.35-4.35' },
  { id: 'mkt-loyalty', label: 'Hűségprogram', path: '/marketing/loyalty', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'mkt-competitor', label: 'Árfigyelő', path: '/marketing/competitor', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  { id: 'mkt-zombo', label: 'Zombo Audit', path: '/marketing/zombo', icon: 'M12 12m-10 0a10 10 0 1020 0 10 10 0 00-20 0zM12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10zM2 12h20' },
];

export default function MarketingSidebar() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('digidesk_sidebar_collapsed') === '1'
  );
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    if (collapsed) document.body.classList.add('sidebar-collapsed');
    else document.body.classList.remove('sidebar-collapsed');
  }, [collapsed]);

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('digidesk_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'b') { e.preventDefault(); toggleCollapse(); }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [toggleCollapse]);

  function isActive(path: string): boolean {
    if (path === '/marketing') return location.pathname === '/marketing' || location.pathname === '/marketing/dashboard';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }

  const avatarName = user?.fullName || user?.username || 'A';
  const nameParts = avatarName.trim().split(/\s+/);
  const initials = nameParts.length >= 2
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : avatarName.substring(0, 2).toUpperCase();

  return (
    <aside className={`sidebar mkt-sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* Collapse toggle */}
      <button className="sidebar-collapse-btn" onClick={toggleCollapse} title="Ctrl+B">
        <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Marketing Logo with App Switcher */}
      <div
        className="sidebar-logo mkt-logo"
        onClick={() => setSwitcherOpen(!switcherOpen)}
        style={{ cursor: 'pointer' }}
      >
        <div className="mkt-logo-icon">M</div>
        <span className="mkt-logo-text">Marketing</span>
      </div>

      {/* App Switcher Dropdown — back to eaisydesk */}
      <div className={`logo-switch-dd${switcherOpen ? ' open' : ''}`}>
        <button
          className="logo-switch-link"
          onClick={(e) => {
            e.stopPropagation();
            navigate('/analytics');
            setSwitcherOpen(false);
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL}eaisydesk_logo.png`}
            alt="eaisydesk"
            style={{ height: 22, width: 'auto', objectFit: 'contain', borderRadius: 6 }}
          />
        </button>
      </div>

      {/* Section Title */}
      <div className="mkt-nav-section-title">MARKETING</div>

      {/* Navigation items */}
      {MKT_NAV_ITEMS.map(item => (
        <button
          key={item.id}
          className={`nav-item${isActive(item.path) ? ' active mkt-active' : ''}`}
          onClick={() => navigate(item.path)}
          data-tooltip={item.label}
        >
          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d={item.icon} />
          </svg>
          <span>{item.label}</span>
        </button>
      ))}

      {/* Bottom section */}
      <div className="sidebar-bottom">
        <div className="sidebar-user-row">
          <div className="user-avatar">{initials}</div>
          <div className="user-text">
            <div className="user-name">{user?.fullName || user?.username || 'admin'}</div>
            <div className="user-role">{user?.role === 'admin' ? 'Adminisztrátor' : user?.role === 'manager' ? 'Manager' : 'Member'}</div>
          </div>
          <button className="sidebar-theme-toggle" onClick={toggleTheme} title="Sötét/Világos mód">
            {isDark ? (
              <svg className="icon-moon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
            ) : (
              <svg className="icon-sun" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
            )}
          </button>
        </div>
        <div className="sidebar-btn-row">
          <button className="sidebar-icon-btn btn-logout-new" onClick={() => logout()} title="Kijelentkezés">
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
