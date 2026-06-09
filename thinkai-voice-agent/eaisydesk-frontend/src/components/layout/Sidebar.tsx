import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  adminOnly?: boolean;
  hidden?: boolean;
  children?: { id: string; label: string; path: string }[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'analytics',
    label: 'Analitika',
    path: '/analytics',
    icon: 'M3 12h2l3-9 4 18 3-9h6',
  },
  {
    id: 'interactions-group',
    label: 'Ügyfélközpont',
    path: '',
    icon: 'M8 12h8M8 8h4m-4 8h6M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z',
    children: [
      { id: 'interactions', label: 'Interakciós lista', path: '/interactions' },
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
    id: 'outbound',
    label: 'Kimenő kommunikáció',
    path: '/outbound',
    icon: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
    adminOnly: true,
  },
  {
    id: 'settings-group',
    label: 'Tudástár',
    path: '',
    icon: 'M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2zM8 7h8M8 11h6',
    adminOnly: true,
    children: [
      { id: 'settings-agent', label: 'Telefon', path: '/settings/agent' },
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
  const { user, isAdmin, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('digidesk_sidebar_collapsed') === '1'
  );
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['interactions-group']));

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
  }, []);

  // Sync collapsed state to body class for CSS layout
  useEffect(() => {
    if (collapsed) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-collapsed');
    }
  }, [collapsed]);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('digidesk_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  }, []);

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
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* Collapse toggle */}
      <button className="sidebar-collapse-btn" onClick={toggleCollapse} title="Ctrl+B">
        <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Logo */}
      <div className="sidebar-logo">
        <img
          src="/eaisydesk_logo.png"
          alt="eaisydesk"
          className="sidebar-logo-img"
          style={{ height: 28, width: 'auto', objectFit: 'contain' }}
        />
      </div>

      <div style={{ marginBottom: 18 }} />

      {/* Navigation items */}
      {NAV_ITEMS.map((item) => {
        if (item.adminOnly && !isAdmin) return null;
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
                {item.children.map((child) => (
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
          <div className="user-avatar">{initials}</div>
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
  );
}
