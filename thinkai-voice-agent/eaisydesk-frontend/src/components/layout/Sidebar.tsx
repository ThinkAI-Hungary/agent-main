import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { authFetch } from '../../api/client';

// Mobile breakpoint constant
const MOBILE_BP = 768;

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  adminOnly?: boolean;
  adminExclusive?: boolean;
  memberOnly?: boolean;
  hidden?: boolean;
  children?: { id: string; label: string; path: string; adminOnly?: boolean; adminExclusive?: boolean }[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Irányítópult',
    path: '/dashboard',
    icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
    memberOnly: true,
  },
  {
    id: 'analytics',
    label: 'Analitika',
    path: '/analytics',
    icon: 'M3 12h2l3-9 4 18 3-9h6',
    adminOnly: true,
  },
  {
    id: 'interactions-group',
    label: 'Ügyfélközpont',
    path: '',
    icon: 'M8 12h8M8 8h4m-4 8h6M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z',
    children: [
      { id: 'interactions', label: 'Interakciós napló', path: '/interactions' },
      { id: 'clients', label: 'Ügyféllista', path: '/clients' },
      { id: 'kanban', label: 'Érdeklődőkezelés', path: '/kanban' },
    ],
  },
  {
    id: 'calendar',
    label: 'Naptár',
    path: '/calendar',
    icon: 'M16 2v4M8 2v4M3 10h18',
  },
  {
    id: 'outbound-group',
    label: 'Kimenő kommunikáció',
    path: '',
    icon: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
    children: [
      { id: 'outbound', label: 'Kampányok', path: '/outbound' },
      { id: 'automatizaciok', label: 'Automatikus értesítések', path: '/automatizaciok' },
    ],
  },
  {
    id: 'settings-group',
    label: 'Tudástár',
    path: '',
    icon: 'M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2zM8 7h8M8 11h6',
    adminOnly: true,
    children: [
      { id: 'settings-agent', label: 'eaisyDesk beállítások', path: '/settings/agent' },
      { id: 'settings-praxis', label: 'Céginformációk', path: '/settings/praxis' },
      { id: 'settings-szabalyok', label: 'Szabályok', path: '/settings/szabalyok' },
    ],
  },

  {
    id: 'help',
    label: 'Segítség',
    path: '/help',
    icon: '',
  },
];

export default function Sidebar() {
  const { user, isAdmin, isAdminOnly, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('digidesk_sidebar_collapsed') === '1'
  );
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['interactions-group']));
  const [appSwitcherOpen, setAppSwitcherOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Load avatar from backend
  const loadAvatar = useCallback(() => {
    const username = user?.username;
    if (!username) return;
    authFetch(`/admin/api/users/${username}/avatar`)
      .then(r => r.json())
      .then(d => setAvatarUrl(d.avatar_url || null))
      .catch(() => {});
  }, [user?.username]);

  useEffect(() => {
    loadAvatar();
  }, [loadAvatar]);

  // Listen for avatar changes from settings page
  useEffect(() => {
    const handler = () => loadAvatar();
    window.addEventListener('avatar-changed', handler);
    return () => window.removeEventListener('avatar-changed', handler);
  }, [loadAvatar]);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('digidesk_sidebar_collapsed', next ? '1' : '0');
      // Szinkronban frissítjük a body class-t — nincs lag a layout-ban
      if (next) {
        document.body.classList.add('sidebar-collapsed');
      } else {
        document.body.classList.remove('sidebar-collapsed');
      }
      return next;
    });
  }, []);

  // Ctrl+B shortcut
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        toggleCollapse();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [toggleCollapse]);

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close mobile sidebar on resize to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > MOBILE_BP) setMobileOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.classList.add('sidebar-mobile-open');
    } else {
      document.body.classList.remove('sidebar-mobile-open');
    }
    return () => document.body.classList.remove('sidebar-mobile-open');
  }, [mobileOpen]);

  // Sync collapsed state to body class — initial mount + cleanup
  useEffect(() => {
    if (collapsed) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-collapsed');
    }
    return () => document.body.classList.remove('sidebar-collapsed');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleGroup(groupId: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function isActive(path: string): boolean {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }

  function isGroupActive(item: NavItem): boolean {
    if (item.children) {
      return item.children.some((c) => isActive(c.path));
    }
    return isActive(item.path);
  }

  // Avatar initials
  const avatarName = user?.fullName || user?.username || 'A';
  const nameParts = avatarName.trim().split(/\s+/);
  const initials =
    nameParts.length >= 2
      ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
      : avatarName.substring(0, 2).toUpperCase();

  const roleLabel =
    user?.role === 'admin'
      ? 'Adminisztrátor'
      : user?.role === 'manager'
        ? 'Manager'
        : 'Member';

  return (
    <>
    {/* Mobile hamburger button — rendered outside sidebar */}
    <button
      className="mobile-hamburger-btn"
      onClick={() => setMobileOpen(prev => !prev)}
      aria-label="Menü"
    >
      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="22" height="22">
        {mobileOpen
          ? <path d="M18 6L6 18M6 6l12 12" />
          : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
      </svg>
    </button>
    {/* Mobile overlay backdrop */}
    {mobileOpen && <div className="sidebar-mobile-backdrop" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
      {/* Collapse toggle */}
      <button className="sidebar-collapse-btn" onClick={toggleCollapse} title="Ctrl+B">
        <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Logo with App Switcher */}
      <div
        className={`sidebar-logo sidebar-logo--clickable${appSwitcherOpen ? ' has-switch-open' : ''}`}
        onClick={() => setAppSwitcherOpen(!appSwitcherOpen)}
      >
        <img
          src={`${import.meta.env.BASE_URL}eaisydesk_logo.png`}
          alt="eaisydesk"
          className="sidebar-logo-img"
        />
      </div>

      {/* App Switcher Dropdown */}
      <div className={`logo-switch-dd${appSwitcherOpen ? ' open' : ''}`}>
        <button
          className="logo-switch-link"
          onClick={(e) => {
            e.stopPropagation();
            navigate('/marketing');
            setAppSwitcherOpen(false);
          }}
        >
          <div className="logo-switch-icon logo-switch-icon--marketing">M</div>
          <div>
            <div className="logo-switch-name">EAISY Marketing</div>
            <div className="logo-switch-desc">Marketing automatizáció</div>
          </div>
        </button>
      </div>


      {/* Navigation items */}
      {NAV_ITEMS.map((item) => {
        if (item.adminExclusive && !isAdminOnly) return null;
        if (item.adminOnly && !isAdmin) return null;
        if (item.memberOnly && isAdmin) return null;
        if (item.hidden) return null;

        // Group with children
        if (item.children) {
          const isOpen = openGroups.has(item.id);
          return (
            <div className="nav-group" key={item.id}>
              <button
                className={`nav-group-toggle${isOpen ? ' open' : ''}${isGroupActive(item) ? ' active' : ''}`}
                onClick={() => toggleGroup(item.id)}
                data-tooltip={item.label}
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d={item.icon} />
                </svg>
                <span>{item.label}</span>
                <svg className="nav-chevron" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <div className={`nav-submenu${isOpen ? ' open' : ''}`}>
                {item.children.filter(c => {
                  if (c.adminExclusive && !isAdminOnly) return false;
                  if (c.adminOnly && !isAdmin) return false;
                  return true;
                }).map((child) => (
                  <button
                    key={child.id}
                    className={`nav-sub-item${isActive(child.path) ? ' active' : ''}`}
                    onClick={() => navigate(child.path)}
                  >
                    {child.label}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        // Help icon (special)
        if (item.id === 'help') {
          return (
            <button
              key={item.id}
              className={`nav-item${isActive(item.path) ? ' active' : ''}`}
              onClick={() => navigate(item.path)}
              data-tooltip={item.label}
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <circle cx="12" cy="17" r="1.5" fill="currentColor" stroke="none" />
              </svg>
              <span>{item.label}</span>
            </button>
          );
        }

        // Regular nav item
        return (
          <button
            key={item.id}
            className={`nav-item${isActive(item.path) ? ' active' : ''}`}
            onClick={() => navigate(item.path)}
            data-tooltip={item.label}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              {item.id === 'calendar' ? (
                <>
                  <rect height="18" rx="2" width="18" x="3" y="4" />
                  <path d={item.icon} />
                </>
              ) : (
                <path d={item.icon} />
              )}
            </svg>
            <span>{item.label}</span>
          </button>
        );
      })}

      {/* Bottom section */}
      <div className="sidebar-bottom">
        <div className="sidebar-user-row">
          <div className={`user-avatar${avatarUrl ? ' user-avatar--img' : ''}`}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="user-avatar-img" />
            ) : initials}
          </div>
          <div className="user-text">
            <div className="user-name">{user?.fullName || user?.username || 'admin'}</div>
            <div className="user-role">{roleLabel}</div>
          </div>
          <button className="sidebar-theme-toggle" onClick={toggleTheme} title="Sötét/Világos mód">
            {isDark ? (
              <svg className="icon-moon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            ) : (
              <svg className="icon-sun" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </button>
        </div>

        <div className="sidebar-btn-row">
          <button
            className="sidebar-icon-btn"
            onClick={() => navigate('/beallitasok')}
            title="Beállítások"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
          <button className="sidebar-icon-btn btn-logout-new" onClick={() => logout()} title="Kijelentkezés">
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>

        <button className="sidebar-collapse-bar" onClick={toggleCollapse} title="Oldalsáv becsukása (Ctrl+B)">
          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M9 3v18" />
          </svg>
        </button>
      </div>
    </aside>
    </>
  );
}
