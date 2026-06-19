/**
 * BeallitasokPage – 1:1 port of legacy page-beallitasok.html
 * Pill-style tabs: Profil, Csapat, Biztonság
 * All data via backend API.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { authFetch } from '../api/client';
import { showToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import Spinner from '../components/ui/Spinner';

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  last_login: string;
}

const TABS = [
  { id: 'profil', label: 'Profil', icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z' },
  { id: 'csapat', label: 'Csapat', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 3a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
  { id: 'biztonsag', label: 'Biztonság', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
] as const;

export default function BeallitasokPage() {
  const { user, updateUser } = useAuth();
  const { confirm, ConfirmDialog } = useConfirm();
  const [activeTab, setActiveTab] = useState('profil');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [profileName, setProfileName] = useState('');
  const [profilePosition, setProfilePosition] = useState('');
  const [profileCompany, setProfileCompany] = useState('');

  // Password modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');

  // Create user modal
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: '', username: '', email: '', password: '', role: 'member' });

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const isAdminOnly = user?.role === 'admin';

  const visibleTabs = useMemo(() => {
    return TABS.filter(tab => tab.id !== 'csapat' || isAdmin);
  }, [isAdmin]);

  useEffect(() => {
    setProfileName(user?.fullName || user?.username || '');
    // Load persisted profile fields from localStorage
    const savedPosition = localStorage.getItem('eaisydesk_profile_position');
    const savedCompany = localStorage.getItem('eaisydesk_profile_company');
    if (savedPosition) setProfilePosition(savedPosition);
    if (savedCompany) setProfileCompany(savedCompany);
  }, [user]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/admin/api/users');
      if (res.ok) {
        const json = await res.json();
        setUsers((json.data || []) as User[]);
      }
    } catch { /* ok */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleSaveProfile = useCallback(async () => {
    try {
      const res = await authFetch('/admin/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: profileName }),
      });
      if (!res.ok) {
        showToast('Hiba a mentésnél', 'error');
        return;
      }
      // Update AuthContext so sidebar reflects immediately
      updateUser({ fullName: profileName });
      // Persist position and company to localStorage
      localStorage.setItem('eaisydesk_profile_position', profilePosition);
      localStorage.setItem('eaisydesk_profile_company', profileCompany);
      showToast('Profil mentve!');
    } catch { showToast('Hiba', 'error'); }
  }, [profileName, profilePosition, profileCompany, updateUser]);

  const handleChangePassword = useCallback(async () => {
    if (!pwCurrent || !pwNew) { showToast('Mindkét mezőt ki kell tölteni!', 'error'); return; }
    if (pwNew.length < 4) { showToast('Az új jelszónak legalább 4 karakter hosszúnak kell lennie!', 'error'); return; }
    if (pwNew !== pwConfirm) { showToast('Az új jelszavak nem egyeznek!', 'error'); return; }
    try {
      const res = await authFetch('/admin/api/users/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: pwCurrent, new_password: pwNew }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.detail || 'Hiba', 'error'); return;
      }
      showToast('Jelszó sikeresen módosítva!');
      localStorage.setItem('eaisydesk_pw_changed_at', new Date().toLocaleString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }));
      setShowPasswordModal(false);
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
    } catch { showToast('Hálózati hiba', 'error'); }
  }, [pwCurrent, pwNew, pwConfirm]);

  const handleCreateUser = useCallback(async () => {
    if (!newUser.full_name || !newUser.email || !newUser.password) { showToast('Teljes név, email és jelszó kötelező!', 'error'); return; }
    if (newUser.password.length < 4) { showToast('A jelszónak legalább 4 karakter hosszúnak kell lennie!', 'error'); return; }
    try {
      const res = await authFetch('/admin/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUser.username || newUser.email.split('@')[0],
          email: newUser.email,
          password: newUser.password,
          full_name: newUser.full_name,
          role: user?.role === 'admin' ? newUser.role : 'member',
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.detail || 'Hiba a felhasználó létrehozásakor', 'error'); return;
      }
      showToast('Felhasználó létrehozva!');
      setShowCreateUserModal(false);
      setNewUser({ full_name: '', username: '', email: '', password: '', role: 'member' });
      loadUsers();
    } catch { showToast('Hiba', 'error'); }
  }, [newUser, loadUsers]);

  const handleChangeRole = useCallback(async (userId: number, newRole: string) => {
    try {
      const res = await authFetch(`/admin/api/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) loadUsers();
      else showToast('Hiba a szerepkör módosításakor', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [loadUsers]);

  const handleDeleteUser = useCallback(async (userId: number, username: string) => {
    const ok = await confirm(`Biztosan törlöd a(z) "${username}" felhasználót?`, { title: 'Felhasználó törlése', danger: true });
    if (!ok) return;
    try {
      const res = await authFetch(`/admin/api/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) { showToast('Hiba', 'error'); return; }
      showToast('Felhasználó törölve');
      loadUsers();
    } catch { showToast('Hiba', 'error'); }
  }, [confirm, loadUsers]);

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="page active" id="page-beallitasok">
      <ConfirmDialog />

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Beállítások</h1>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Rendszer és üzleti beállítások kezelése</p>
      </div>

      {/* Pill-style tab bar (legacy match) */}
      <div className="beallitasok-tabbar">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            className={`beallitasok-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={tab.icon} /></svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab contents */}
      <div className="beallitasok-content">

        {/* ── PROFIL TAB ── */}
        {activeTab === 'profil' && (
          <>
          <div className="beallitasok-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ width: 20, height: 20, color: 'var(--text)' }}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Felhasználói profil</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 32 }}>Személyes információk és avatar kezelése</div>

            {/* ── Profile Picture Upload ── */}
            <ProfileAvatarUpload
              initials={getInitials(profileName || user?.username || '')}
              username={user?.username || ''}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
              <div>
                <label className="beallitasok-label">Teljes név</label>
                <input type="text" className="beallitasok-input" value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Teljes név" />
              </div>
              <div>
                <label className="beallitasok-label">Pozíció</label>
                <input type="text" className="beallitasok-input" value={profilePosition} onChange={e => setProfilePosition(e.target.value)} placeholder="Pozíció" />
              </div>
            </div>
            <div style={{ marginBottom: 32 }}>
              <label className="beallitasok-label">Cég neve</label>
              <input type="text" className="beallitasok-input" value={profileCompany} onChange={e => setProfileCompany(e.target.value)} placeholder="Cég neve" />
            </div>

            <button className="beallitasok-save-btn" onClick={handleSaveProfile}>Profil mentése</button>
          </div>

          {/* ── CSATORNÁK SECTION ── */}
          <ChannelsSection />
          </>
        )}

        {/* ── CSAPAT TAB ── */}
        {activeTab === 'csapat' && isAdmin && (
          <div className="beallitasok-card">
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Csapat</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Felhasználók és hozzáférések kezelése</div>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 8 }}>
              {loading ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}><Spinner /></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {users
                    .filter(u => isAdminOnly ? true : u.role === 'member')
                    .map((u) => {
                    const isSelf = u.username === user?.username;
                    return (
                      <div key={u.id} className="team-member-row">
                        <div className="team-avatar">{getInitials(u.full_name || u.username)}</div>
                        <div className="team-info">
                          <div className="team-name">
                            {u.full_name || u.username}
                            {isSelf && <span className="team-self">(te)</span>}
                          </div>
                          <div className="team-meta">{u.email || (u.last_login ? `Utolsó belépés: ${new Date(u.last_login).toLocaleString('hu-HU')}` : u.username)}</div>
                        </div>
                        {/* Show badge only when there's no role dropdown */}
                        {(isSelf || !isAdmin || !isAdminOnly) && (
                        <span className={`team-role-badge ${u.role}`}>
                          {u.role === 'member' ? 'MUNKATÁRS' : u.role.toUpperCase()}
                        </span>
                        )}
                        {!isSelf && isAdmin && (
                          <div className="team-actions">
                            {isAdminOnly && <RoleDropdown value={u.role} onChange={(newRole) => handleChangeRole(u.id, newRole)} />}
                            {(isAdminOnly || u.role === 'member') && (
                            <button className="team-delete-btn" onClick={() => handleDeleteUser(u.id, u.username)} title="Törlés">
                              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 15, height: 15 }}>
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                              </svg>
                            </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {isAdmin && (
                <button className="team-add-btn" onClick={() => setShowCreateUserModal(true)}>
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}>
                    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                  Új felhasználó hozzáadása
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── BIZTONSÁG TAB ── */}
        {activeTab === 'biztonsag' && (
          <div className="beallitasok-card">
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Biztonság</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Jelszó, munkamenet és adatvédelem</div>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 8 }}>
              {/* Jelszó */}
              <div className="security-row">
                <div className="security-icon lock">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ width: 20, height: 20 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                </div>
                <div className="security-info">
                  <div className="security-title">Jelszó módosítás</div>
                  <div className="security-desc">Utolsó módosítás: {localStorage.getItem('eaisydesk_pw_changed_at') || 'még nem módosítva'}</div>
                </div>
                <div className="security-action">
                  <button className="btn-security-modify" onClick={() => setShowPasswordModal(true)}><span>Módosítás</span></button>
                </div>
              </div>
              {/* Munkamenet */}
              <div className="security-row">
                <div className="security-icon clock">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ width: 20, height: 20 }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                </div>
                <div className="security-info">
                  <div className="security-title">Munkamenet időtúllépés</div>
                  <div className="security-desc">15 perc inaktivitás után automatikus kijelentkezés</div>
                </div>
                <div className="security-action">
                  <span className="security-value">15 perc</span>
                </div>
              </div>
              {/* GDPR */}
              <div className="security-row">
                <div className="security-icon shield">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ width: 20, height: 20 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>
                </div>
                <div className="security-info">
                  <div className="security-title">GDPR megfelelőség</div>
                  <div className="security-desc">Adatkezelési nyilatkozat és hozzájárulás kezelés</div>
                </div>
                <div className="security-action">
                  <span className="security-badge green">MEGFELELŐ</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Password Modal — Premium Design */}
      {showPasswordModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'cuFadeIn 0.25s ease',
          }}
          onClick={() => setShowPasswordModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 440, maxWidth: '92vw',
              background: 'var(--card)',
              borderRadius: 20,
              border: '1px solid var(--border)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.04)',
              overflow: 'hidden',
              animation: 'cuSlideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)',
            }}
          >
            {/* Gradient accent bar */}
            <div style={{
              height: 4,
              background: 'linear-gradient(90deg, #1ceee0, #0bbdb1, #3b82f6)',
              borderRadius: '20px 20px 0 0',
            }} />

            {/* Header */}
            <div style={{ padding: '28px 32px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                  Jelszó módosítása
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Add meg a jelenlegi és új jelszavad
                </p>
              </div>
              <button
                onClick={() => setShowPasswordModal(false)}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--text-muted)',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.color = '#ef4444'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Divider */}
            <div style={{ margin: '20px 32px 0', height: 1, background: 'var(--border)' }} />

            {/* Form Body */}
            <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 7, textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block' }}>
                  Jelenlegi jelszó <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="password"
                  placeholder="Jelenlegi jelszó"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%', padding: '11px 14px', fontSize: 14,
                    border: '1.5px solid var(--border)', borderRadius: 12,
                    background: 'var(--bg, rgba(255,255,255,0.04))',
                    color: 'var(--text)', outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#1ceee0'; e.target.style.boxShadow = '0 0 0 3px rgba(28,238,224,0.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 7, textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block' }}>
                  Új jelszó <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="password"
                  placeholder="Min. 4 karakter"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  style={{
                    width: '100%', padding: '11px 14px', fontSize: 14,
                    border: '1.5px solid var(--border)', borderRadius: 12,
                    background: 'var(--bg, rgba(255,255,255,0.04))',
                    color: 'var(--text)', outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#1ceee0'; e.target.style.boxShadow = '0 0 0 3px rgba(28,238,224,0.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 7, textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block' }}>
                  Új jelszó megerősítése <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="password"
                  placeholder="Új jelszó ismét"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  style={{
                    width: '100%', padding: '11px 14px', fontSize: 14,
                    border: '1.5px solid var(--border)', borderRadius: 12,
                    background: 'var(--bg, rgba(255,255,255,0.04))',
                    color: 'var(--text)', outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#1ceee0'; e.target.style.boxShadow = '0 0 0 3px rgba(28,238,224,0.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '0 32px 28px',
              display: 'flex', gap: 12, justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setShowPasswordModal(false)}
                style={{
                  padding: '11px 24px', borderRadius: 12,
                  border: '1.5px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-muted)', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--text-muted)'; e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                Mégse
              </button>
              <button
                onClick={handleChangePassword}
                style={{
                  padding: '11px 28px', borderRadius: 12,
                  border: 'none',
                  background: 'linear-gradient(135deg, #1ceee0, #0bbdb1)',
                  color: '#082432', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 16px rgba(28,238,224,0.25)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(28,238,224,0.35)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(28,238,224,0.25)'; }}
              >
                Jelszó módosítása
              </button>
            </div>
          </div>

          {/* Animations */}
          <style>{`
            @keyframes cuFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes cuSlideUp { from { opacity: 0; transform: translateY(24px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
          `}</style>
        </div>
      )}

      {/* Create User Modal — Premium Design */}
      {showCreateUserModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'cuFadeIn 0.25s ease',
          }}
          onClick={() => setShowCreateUserModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 480, maxWidth: '92vw',
              background: 'var(--card)',
              borderRadius: 20,
              border: '1px solid var(--border)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.04)',
              overflow: 'hidden',
              animation: 'cuSlideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)',
            }}
          >
            {/* Gradient accent bar */}
            <div style={{
              height: 4,
              background: 'linear-gradient(90deg, #1ceee0, #0bbdb1, #3b82f6)',
              borderRadius: '20px 20px 0 0',
            }} />

            {/* Header */}
            <div style={{ padding: '28px 32px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                  Új felhasználó
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Hozz létre új hozzáférést a csapattagok számára
                </p>
              </div>
              <button
                onClick={() => setShowCreateUserModal(false)}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--text-muted)',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.color = '#ef4444'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Divider */}
            <div style={{ margin: '20px 32px 0', height: 1, background: 'var(--border)' }} />

            {/* Form Body */}
            <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Name + Username row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 7, textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block' }}>
                    Teljes név <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Kovács Anna"
                    value={newUser.full_name}
                    onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                    autoFocus
                    style={{
                      width: '100%', padding: '11px 14px', fontSize: 14,
                      border: '1.5px solid var(--border)', borderRadius: 12,
                      background: 'var(--bg, rgba(255,255,255,0.04))',
                      color: 'var(--text)', outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                      fontFamily: 'inherit', boxSizing: 'border-box',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = '#1ceee0'; e.target.style.boxShadow = '0 0 0 3px rgba(28,238,224,0.1)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 7, textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block' }}>
                    Felhasználónév
                  </label>
                  <input
                    type="text"
                    placeholder="kovacsanna"
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    style={{
                      width: '100%', padding: '11px 14px', fontSize: 14,
                      border: '1.5px solid var(--border)', borderRadius: 12,
                      background: 'var(--bg, rgba(255,255,255,0.04))',
                      color: 'var(--text)', outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                      fontFamily: 'inherit', boxSizing: 'border-box',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = '#1ceee0'; e.target.style.boxShadow = '0 0 0 3px rgba(28,238,224,0.1)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 7, textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block' }}>
                  Email cím <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="email"
                  placeholder="kollegak@pelda.hu"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  style={{
                    width: '100%', padding: '11px 14px', fontSize: 14,
                    border: '1.5px solid var(--border)', borderRadius: 12,
                    background: 'var(--bg, rgba(255,255,255,0.04))',
                    color: 'var(--text)', outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#1ceee0'; e.target.style.boxShadow = '0 0 0 3px rgba(28,238,224,0.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                />
              </div>

              {/* Password */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 7, textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block' }}>
                  Jelszó <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="password"
                  placeholder="Min. 4 karakter"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  style={{
                    width: '100%', padding: '11px 14px', fontSize: 14,
                    border: '1.5px solid var(--border)', borderRadius: 12,
                    background: 'var(--bg, rgba(255,255,255,0.04))',
                    color: 'var(--text)', outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#1ceee0'; e.target.style.boxShadow = '0 0 0 3px rgba(28,238,224,0.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                />
              </div>

              {/* Role selection — card style */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block' }}>
                  Szerepkör
                </label>
                {isAdminOnly ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {[
                      { value: 'member', label: 'Munkatárs', desc: 'Saját ügyfelek kezelése' },
                      { value: 'manager', label: 'Manager', desc: 'Csapatirányítás' },
                      { value: 'admin', label: 'Admin', desc: 'Teljes hozzáférés' },
                    ].map((r) => {
                      const isSelected = newUser.role === r.value;
                      return (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => setNewUser({ ...newUser, role: r.value })}
                          style={{
                            padding: '14px 12px',
                            borderRadius: 14,
                            border: isSelected ? '2px solid #1ceee0' : '1.5px solid var(--border)',
                            background: isSelected ? 'rgba(28,238,224,0.06)' : 'transparent',
                            cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                            transition: 'all 0.2s ease',
                            fontFamily: 'inherit',
                            boxShadow: isSelected ? '0 0 0 3px rgba(28,238,224,0.08)' : 'none',
                          }}
                        >

                          <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#1ceee0' : 'var(--text)' }}>{r.label}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>{r.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{
                    padding: '12px 16px', borderRadius: 12,
                    border: '1.5px solid var(--border)',
                    background: 'var(--bg, rgba(255,255,255,0.04))',
                    fontSize: 14, color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>

                    Munkatárs
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '0 32px 28px',
              display: 'flex', gap: 12, justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setShowCreateUserModal(false)}
                style={{
                  padding: '11px 24px', borderRadius: 12,
                  border: '1.5px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-muted)', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--text-muted)'; e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                Mégse
              </button>
              <button
                onClick={handleCreateUser}
                style={{
                  padding: '11px 28px', borderRadius: 12,
                  border: 'none',
                  background: 'linear-gradient(135deg, #1ceee0, #0bbdb1)',
                  color: '#082432', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 16px rgba(28,238,224,0.25)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(28,238,224,0.35)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(28,238,224,0.25)'; }}
              >

                Létrehozás
              </button>
            </div>
          </div>

          {/* Animations */}
          <style>{`
            @keyframes cuFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes cuSlideUp { from { opacity: 0; transform: translateY(24px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
          `}</style>
        </div>
      )}
    </div>
  );
}

function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="security-modal-overlay" onClick={onClose} style={{ display: 'flex' }}>
      <div className="security-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 8, padding: 28, width: 440, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 6, background: 'linear-gradient(135deg,#1ceee0,#0bbdb1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg fill="none" stroke="#082432" strokeWidth="2.5" viewBox="0 0 24 24" style={{ width: 20, height: 20 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
            {subtitle && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function ProfileAvatarUpload({ initials, username }: { initials: string; username: string }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load avatar on mount
  useEffect(() => {
    if (!username) return;
    authFetch(`/admin/api/users/${username}/avatar`)
      .then(r => r.json())
      .then(d => { if (d.avatar_url) setAvatarUrl(d.avatar_url); })
      .catch(() => {});
  }, [username]);

  const resizeAndUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Csak képfájl tölthető fel!', 'error');
      return;
    }
    if (file.size > 5_000_000) {
      showToast('A kép túl nagy (max 5MB)!', 'error');
      return;
    }

    setUploading(true);
    try {
      // Create image and resize to 200x200
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Képbetöltési hiba'));
        img.src = objectUrl;
      });

      const canvas = document.createElement('canvas');
      const size = 200;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      // Center-crop: use the smaller dimension
      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
      URL.revokeObjectURL(objectUrl);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      const res = await authFetch('/admin/api/users/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_data: dataUrl }),
      });

      if (res.ok) {
        const data = await res.json();
        setAvatarUrl(data.avatar_url);
        showToast('Profilkép feltöltve!');
        window.dispatchEvent(new Event('avatar-changed'));
      } else {
        const err = await res.json().catch(() => ({ detail: 'Ismeretlen hiba' }));
        showToast(err.detail || 'Feltöltési hiba', 'error');
      }
    } catch {
      showToast('Képfeldolgozási hiba', 'error');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDelete = useCallback(async () => {
    try {
      const res = await authFetch('/admin/api/users/avatar', { method: 'DELETE' });
      if (res.ok) {
        setAvatarUrl(null);
        showToast('Profilkép eltávolítva');
        window.dispatchEvent(new Event('avatar-changed'));
      }
    } catch {
      showToast('Hiba', 'error');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) resizeAndUpload(file);
  }, [resizeAndUpload]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 32, padding: '24px 0', borderBottom: '1px solid var(--border)' }}>
      {/* Avatar circle with hover overlay */}
      <div
        style={{
          position: 'relative', width: 96, height: 96, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
          background: dragOver ? 'rgba(28,238,224,0.15)' : 'transparent',
          padding: 3,
          backgroundImage: !dragOver ? 'linear-gradient(135deg, #1ceee0, #3b82f6, #8b5cf6)' : undefined,
          transition: 'all 0.3s ease',
        }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div style={{
          width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
          background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', opacity: 0.5 }}>{initials}</span>
          )}
        </div>

        {/* Hover overlay */}
        <div style={{
          position: 'absolute', inset: 3, borderRadius: '50%',
          background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 4,
          opacity: hovering || dragOver ? 1 : 0,
          transition: 'opacity 0.2s ease', pointerEvents: 'none',
        }}>
          {uploading ? (
            <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2, borderColor: '#fff3', borderTopColor: '#fff' }} />
          ) : (
            <>
              <svg fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 22, height: 22 }}>
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span style={{ color: 'white', fontSize: 10, fontWeight: 600 }}>
                {dragOver ? 'Ejtsd ide' : 'Módosítás'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Info & actions */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Profilkép</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
          Kattints az avatarra vagy húzd rá a képet.<br />JPG, PNG — max 5MB
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #1ceee0, #0bbdb1)', color: '#082432',
              fontSize: 12, fontWeight: 700, transition: 'all 0.2s',
            }}
          >
            {uploading ? 'Feltöltés...' : 'Kép kiválasztása'}
          </button>
          {avatarUrl && (
            <button
              onClick={handleDelete}
              style={{
                padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--border)',
                color: '#ef4444', fontSize: 12, fontWeight: 600, transition: 'all 0.2s',
              }}
            >
              Eltávolítás
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) resizeAndUpload(f); e.target.value = ''; }}
      />
    </div>
  );
}

// ── Channel settings (frontend-only, localStorage) ──────────────────────────

interface ChannelConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  placeholder: string;
  enabled: boolean;
  value: string;
}

const STORAGE_KEY = 'eaisydesk_channels';

const DEFAULT_CHANNELS: Omit<ChannelConfig, 'enabled' | 'value'>[] = [
  {
    id: 'phone',
    label: 'Telefon',
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z" />
      </svg>
    ),
    placeholder: '+36 1 234 5678',
  },
  {
    id: 'email',
    label: 'E-mail',
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
    placeholder: 'info@ceg.hu',
  },
  {
    id: 'messenger',
    label: 'Messenger',
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      </svg>
    ),
    placeholder: 'fb.com/oldal',
  },
  {
    id: 'instagram',
    label: 'Instagram üzenet',
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    ),
    placeholder: 'Profil link vagy azonosító',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      </svg>
    ),
    placeholder: '+36 30 123 4567',
  },
];

function loadChannels(): ChannelConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved: Record<string, { enabled: boolean; value: string }> = JSON.parse(raw);
      return DEFAULT_CHANNELS.map(ch => ({
        ...ch,
        enabled: saved[ch.id]?.enabled ?? false,
        value: saved[ch.id]?.value ?? '',
      }));
    }
  } catch { /* ignore */ }
  return DEFAULT_CHANNELS.map(ch => ({ ...ch, enabled: false, value: '' }));
}

function saveChannels(channels: ChannelConfig[]) {
  const data: Record<string, { enabled: boolean; value: string }> = {};
  channels.forEach(ch => { data[ch.id] = { enabled: ch.enabled, value: ch.value }; });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function ChannelsSection() {
  const [channels, setChannels] = useState<ChannelConfig[]>(loadChannels);

  const update = useCallback((id: string, patch: Partial<ChannelConfig>) => {
    setChannels(prev => {
      const next = prev.map(ch => ch.id === id ? { ...ch, ...patch } : ch);
      saveChannels(next);
      return next;
    });
  }, []);

  return (
    <div className="beallitasok-card" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ width: 20, height: 20, color: 'var(--text)' }}>
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z" />
        </svg>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Csatornák</div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Kommunikációs csatornák kezelése</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {channels.map((ch, i) => (
          <div
            key={ch.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '18px 20px',
              borderRadius: 10,
              background: i % 2 === 0 ? 'var(--bg3)' : 'transparent',
              transition: 'background 0.15s',
            }}
          >
            {/* Icon */}
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: ch.enabled ? 'rgba(28, 238, 224, 0.10)' : 'rgba(148,163,184,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: ch.enabled ? '#1ceee0' : 'var(--text-muted)',
              flexShrink: 0, transition: 'all 0.2s',
            }}>
              {ch.icon}
            </div>

            {/* Label */}
            <div style={{
              minWidth: 120, fontSize: 14, fontWeight: 600,
              color: ch.enabled ? 'var(--text)' : 'var(--text-muted)',
              transition: 'color 0.2s',
            }}>
              {ch.label}
            </div>

            {/* Toggle */}
            <label className="toggle" style={{ flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={ch.enabled}
                onChange={e => update(ch.id, { enabled: e.target.checked })}
              />
              <span className="toggle-slider" />
            </label>

            {/* Input */}
            <input
              type="text"
              className="beallitasok-input"
              placeholder={ch.placeholder}
              value={ch.value}
              onChange={e => update(ch.id, { value: e.target.value })}
              disabled={!ch.enabled}
              style={{
                flex: 1,
                opacity: ch.enabled ? 1 : 0.4,
                transition: 'opacity 0.2s',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Custom role dropdown (dark mode safe) ────────────────────────────────────
const ROLES = [
  { value: 'member', label: 'Munkatárs' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];

function RoleDropdown({ value, onChange }: { value: string; onChange: (role: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const current = ROLES.find(r => r.value === value);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: '5px 12px', borderRadius: 8,
          border: '1.5px solid var(--border)', fontSize: 12, fontWeight: 600,
          color: 'var(--text)', background: 'rgba(255,255,255,0.06)',
          fontFamily: 'inherit', cursor: 'pointer', display: 'flex',
          alignItems: 'center', gap: 6, transition: 'all 0.2s',
          ...(open ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px rgba(28,238,224,0.12)' } : {}),
        }}
      >
        {current?.label || value}
        <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12" style={{ opacity: 0.5, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 140, zIndex: 100,
          background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 10,
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)', overflow: 'hidden',
          animation: 'roleDropIn 0.15s ease',
        }}>
          {ROLES.map(r => (
            <button
              key={r.value}
              onClick={() => { onChange(r.value); setOpen(false); }}
              style={{
                width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit', textAlign: 'left',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: r.value === value ? 'rgba(28,238,224,0.08)' : 'transparent',
                color: r.value === value ? 'var(--accent)' : 'var(--text)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (r.value !== value) (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { if (r.value !== value) (e.target as HTMLElement).style.background = 'transparent'; }}
            >
              {r.label}
              {r.value === value && (
                <svg fill="none" stroke="var(--accent)" strokeWidth="2.5" viewBox="0 0 24 24" width="14" height="14">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`@keyframes roleDropIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}
