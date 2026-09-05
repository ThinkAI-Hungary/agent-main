import { useState, useEffect, useCallback, type ReactNode } from 'react';
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
  icon: ReactNode;
  adminOnly?: boolean;
  adminExclusive?: boolean;
  superadminOnly?: boolean;
  memberOnly?: boolean;
  hidden?: boolean;
  children?: { id: string; label: string; path: string; adminOnly?: boolean; adminExclusive?: boolean; superadminOnly?: boolean; icon?: ReactNode }[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Irányítópult',
    path: '/dashboard',
    icon: <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
    memberOnly: true,
  },
  {
    id: 'analytics',
    label: 'Analitika',
    path: '/analytics',
    icon: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
    adminOnly: true,
  },
  {
    id: 'interactions-group',
    label: 'Ügyfélközpont',
    path: '',
    icon: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    children: [
      {
        id: 'interactions', label: 'Interakciós napló', path: '/interactions',
        icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>,
      },
      {
        id: 'clients', label: 'Ügyféllista', path: '/clients',
        icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
      },
      {
        id: 'kanban', label: 'Érdeklődőkezelés', path: '/kanban',
        icon: <><rect x="3" y="3" width="7" height="10" rx="1.5" /><rect x="14" y="3" width="7" height="6" rx="1.5" /><rect x="3" y="17" width="7" height="4" rx="1.5" /><rect x="14" y="13" width="7" height="8" rx="1.5" /></>,
      },
    ],
  },
  {
    id: 'calendar',
    label: 'Naptár',
    path: '/calendar',
    icon: <><rect height="18" rx="2" width="18" x="3" y="4" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  },
  {
    id: 'outbound-group',
    label: 'Kimenő kommunikáció',
    path: '',
    icon: <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
    children: [
      {
        id: 'outbound', label: 'Kampányok', path: '/outbound',
        icon: <><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>,
      },
      {
        id: 'automatizaciok', label: 'Automatikus értesítések', path: '/automatizaciok',
        icon: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
      },
    ],
  },
  {
    id: 'settings-group',
    label: 'Tudástár',
    path: '',
    icon: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
    adminOnly: true,
    children: [
      {
        id: 'settings-basic', label: 'Céginformációk', path: '/settings/basic',
        icon: <><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="9" y1="6" x2="15" y2="6" /><line x1="9" y1="10" x2="15" y2="10" /><line x1="9" y1="14" x2="15" y2="14" /><line x1="9" y1="18" x2="11" y2="18" /></>,
      },
      {
        id: 'settings-szabalyok', label: 'Szabályok', path: '/settings/szabalyok',
        icon: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
      },
    ],
  },
  {
    id: 'management',
    label: 'Management & Debug',
    path: '/management',
    icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    superadminOnly: true,
  },
  {
    id: 'help',
    label: 'Segítség',
    path: '/help',
    icon: '',
  },
];

export default function Sidebar() {
  const { user, isAdmin, isAdminOnly, isSuperAdmin, impersonatedTenant, logout } = useAuth();
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
    user?.role === 'superadmin'
      ? (impersonatedTenant ? 'Bérlői Admin (Megszemélyesítve)' : 'Superadmin')
      : user?.role === 'admin'
        ? 'Adminisztrátor'
        : user?.role === 'manager'
          ? 'Manager'
          : 'Member';

  // rövid szerep-jelölő a brand pillhez (UI Kit 11 · sb-badge)
  const rolePill =
    user?.role === 'superadmin'
      ? 'Superadmin'
      : user?.role === 'admin'
        ? 'Admin'
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

      {/* Brand + App Switcher — accent wordmark + szerep pill, halvány divider alatta */}
      <div
        className={`sidebar-logo${(!isSuperAdmin || impersonatedTenant) ? ' sidebar-logo--clickable' : ''}${appSwitcherOpen ? ' has-switch-open' : ''}`}
        onClick={() => (!isSuperAdmin || impersonatedTenant) && setAppSwitcherOpen(!appSwitcherOpen)}
      >
        <span className="sidebar-brand-initial" aria-hidden="true">e</span>
        <span className="sidebar-brand-name">eaisyDesk</span>
        <span className="sidebar-role-pill">{rolePill}</span>
      </div>

      {/* App Switcher Dropdown */}
      {(!isSuperAdmin || impersonatedTenant) && (
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
      )}


      {/* Navigation items */}
      {NAV_ITEMS.map((item) => {
        if (isSuperAdmin && !impersonatedTenant && !item.superadminOnly) return null;
        if (item.superadminOnly && (!isSuperAdmin || impersonatedTenant)) return null;
        if (item.adminExclusive && !isAdminOnly) return null;
        if (item.adminOnly && !isAdmin) return null;
        if (item.memberOnly && isAdminOnly) return null;
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
                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  {item.icon}
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
                    {child.icon && (
                      <svg className="nav-sub-icon" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        {child.icon}
                      </svg>
                    )}
                    <span>{child.label}</span>
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
            <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              {item.icon}
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
            <div className="user-name">{impersonatedTenant ? impersonatedTenant.name : (user?.fullName || user?.username || 'admin')}</div>
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
            onClick={() => navigate((isSuperAdmin && !impersonatedTenant) ? '/management' : '/beallitasok')}
            title={(isSuperAdmin && !impersonatedTenant) ? 'Management' : 'Beállítások'}
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
