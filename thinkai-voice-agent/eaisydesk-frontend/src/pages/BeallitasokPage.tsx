/**
 * BeallitasokPage – 1:1 port of legacy page-beallitasok.html
 * Pill-style tabs: Profil, Csapat, Biztonság
 * All data via backend API.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authFetch } from '../api/client';
import { showToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import Spinner from '../components/ui/Spinner';
import ProfileAvatarUpload from '../components/settings/ProfileAvatarUpload';
import SessionTimeoutSetting from '../components/settings/SessionTimeoutSetting';
import GdprSection from '../components/settings/GdprSection';
import CustomSelect from '../components/settings/CustomSelect';


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
  { id: 'eaisydesk', label: 'eaisyDesk beállítások', icon: 'M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2zM12 15a3 3 0 100-6 3 3 0 000 6z' },
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
    return TABS.filter(tab => {
      if (tab.id === 'csapat' || tab.id === 'eaisydesk') return isAdmin;
      return true;
    });
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
      <div className="page-header">
        <div className="page-title">Beállítások</div>
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
            <div className="beal-icon-row mb-4">
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="20" height="20"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              <div className="beal-subtitle-16">Felhasználói profil</div>
            </div>
            <ProfileAvatarUpload initials={getInitials(profileName || user?.username || '')} username={user?.username || ''} />
            <div className="beal-grid-2 mb-24">
              <div>
                <label className="beallitasok-label">Teljes név</label>
                <input type="text" className="beallitasok-input" value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Teljes név" />
              </div>
              <div>
                <label className="beallitasok-label">Pozíció</label>
                <input type="text" className="beallitasok-input" value={profilePosition} onChange={e => setProfilePosition(e.target.value)} placeholder="Pozíció" />
              </div>
            </div>
            <div className="mb-32">
              <label className="beallitasok-label">Cég neve</label>
              <input type="text" className="beallitasok-input" value={profileCompany} onChange={e => setProfileCompany(e.target.value)} placeholder="Cég neve" />
            </div>
            <button className="beallitasok-save-btn" onClick={handleSaveProfile}>Profil mentése</button>
          </div>
          </>
        )}

        {/* ── CSAPAT TAB ── */}
        {activeTab === 'csapat' && isAdmin && (
          <div className="beallitasok-card">
            <div className="beal-sec-title-wrap">
              <div className="beal-sec-title">Csapat</div>
            </div>
            <div className="beal-divider-top">
              {loading ? (
                <div className="beal-empty-center"><Spinner /></div>
              ) : (
                <div className="flex-col gap-0">
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
                              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-15">
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
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="svg-16">
                    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                  Új felhasználó hozzáadása
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── EAISYDESK BEÁLLÍTÁSOK TAB ── */}
        {activeTab === 'eaisydesk' && isAdmin && (
          <>
            <CommunicationSettingsSection />
            <ChannelsSection />
          </>
        )}

        {/* ── BIZTONSÁG TAB ── */}
        {activeTab === 'biztonsag' && (
          <div className="beallitasok-card">
            <div className="beal-sec-title-wrap">
              <div className="beal-sec-title">Biztonság</div>
            </div>
            <div className="beal-divider-top">
              {/* Jelszó */}
              <div className="security-row">
                <div className="security-icon lock">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="svg-20"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
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
              <SessionTimeoutSetting />
              {/* GDPR */}
              <GdprSection />
            </div>
          </div>
        )}
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="beal-modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="beal-modal-card beal-modal-card--pw" onClick={(e) => e.stopPropagation()}>
            <div className="modal-accent-bar" />
            <div className="modal-header-pad">
              <div>
                <h3 className="beal-subtitle-18 beal-letter-spacing">Jelszó módosítása</h3>
                <p className="beal-subsub-12">Add meg a jelenlegi és új jelszavad</p>
              </div>
              <button className="beal-modal-close" onClick={() => setShowPasswordModal(false)}>
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-divider-mx" />
            <div className="modal-form-body">
              <div>
                <label className="beal-form-label">Jelenlegi jelszó <span className="beal-required">*</span></label>
                <input type="password" className="beal-modal-input" placeholder="Jelenlegi jelszó" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="beal-form-label">Új jelszó <span className="beal-required">*</span></label>
                <input type="password" className="beal-modal-input" placeholder="Min. 4 karakter" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
              </div>
              <div>
                <label className="beal-form-label">Új jelszó megerősítése <span className="beal-required">*</span></label>
                <input type="password" className="beal-modal-input" placeholder="Új jelszó ismét" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer-row">
              <button className="beal-btn-cancel" onClick={() => setShowPasswordModal(false)}>Mégse</button>
              <button className="beal-btn-submit" onClick={handleChangePassword}>Jelszó módosítása</button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateUserModal && (
        <div className="beal-modal-overlay" onClick={() => setShowCreateUserModal(false)}>
          <div className="beal-modal-card beal-modal-card--usr" onClick={(e) => e.stopPropagation()}>
            <div className="modal-accent-bar" />
            <div className="modal-header-pad">
              <div>
                <h3 className="beal-subtitle-18 beal-letter-spacing">Új felhasználó</h3>

              </div>
              <button className="beal-modal-close" onClick={() => setShowCreateUserModal(false)}>
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-divider-mx" />
            <div className="modal-form-body">
              <div className="beal-grid-2">
                <div>
                  <label className="beal-form-label">Teljes név <span className="beal-required">*</span></label>
                  <input type="text" className="beal-modal-input" placeholder="Kovács Anna" value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} autoFocus />
                </div>
                <div>
                  <label className="beal-form-label">Felhasználónév</label>
                  <input type="text" className="beal-modal-input" placeholder="kovacsanna" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="beal-form-label">Email cím <span className="beal-required">*</span></label>
                <input type="email" className="beal-modal-input" placeholder="kollegak@pelda.hu" autoComplete="off" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              </div>
              <div>
                <label className="beal-form-label">Jelszó <span className="beal-required">*</span></label>
                <input type="password" className="beal-modal-input" placeholder="Min. 4 karakter" autoComplete="new-password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
              </div>
              <div>
                <label className="beal-form-label beal-form-label--wide">Szerepkör</label>
                {isAdminOnly ? (
                  <div className="beal-grid-3">
                    {[
                      { value: 'member', label: 'Munkatárs', desc: 'Saját ügyfelek kezelése' },
                      { value: 'manager', label: 'Manager', desc: 'Csapatirányítás' },
                      { value: 'admin', label: 'Admin', desc: 'Teljes hozzáférés' },
                    ].map((r) => {
                      const isSelected = newUser.role === r.value;
                      return (
                        <button key={r.value} type="button" onClick={() => setNewUser({ ...newUser, role: r.value })} className={`beal-role-card${isSelected ? ' beal-role-card--active' : ''}`}>
                          <span className={`beal-role-label${isSelected ? ' beal-role-label--active' : ''}`}>{r.label}</span>
                          <span className="beal-role-desc">{r.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="beal-role-locked">Munkatárs</div>
                )}
              </div>
            </div>
            <div className="modal-footer-row">
              <button className="beal-btn-cancel" onClick={() => setShowCreateUserModal(false)}>Mégse</button>
              <button className="beal-btn-submit" onClick={handleCreateUser}>Létrehozás</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="security-modal-overlay" onClick={onClose} >
      <div className="security-modal beal-legacy-modal-inner" onClick={(e) => e.stopPropagation()}>
        <div className="beal-legacy-modal-hdr">
          <div className="beal-icon-box">
            <svg fill="none" stroke="#082432" strokeWidth="2.5" viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
          </div>
          <div>
            <h3 className="beal-legacy-modal-title">{title}</h3>
            {subtitle && <p className="beal-legacy-modal-sub">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}


// ProfileAvatarUpload extracted to src/components/settings/ProfileAvatarUpload.tsx


// ── Communication settings (eaisyDesk beállítások tab) ──────────────────────

// SVG Flag components
const COMM_FLAGS: Record<string, React.ReactNode> = {
  hu: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="36" height="8" fill="#cd2a3e" /><rect y="8" width="36" height="8" fill="#fff" /><rect y="16" width="36" height="8" fill="#436f4d" /></svg>,
  en: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="36" height="24" fill="#012169" /><path d="M0 0L36 24M36 0L0 24" stroke="#fff" strokeWidth="4" /><path d="M0 0L36 24M36 0L0 24" stroke="#C8102E" strokeWidth="2.5" /><path d="M18 0v24M0 12h36" stroke="#fff" strokeWidth="6" /><path d="M18 0v24M0 12h36" stroke="#C8102E" strokeWidth="3.5" /></svg>,
  de: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="36" height="8" fill="#000" /><rect y="8" width="36" height="8" fill="#D00" /><rect y="16" width="36" height="8" fill="#FFCE00" /></svg>,
  sk: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="36" height="8" fill="#fff" /><rect y="8" width="36" height="8" fill="#0B4EA2" /><rect y="16" width="36" height="8" fill="#EE1C25" /><path d="M5 4v16c0 3 4 5 7 6 3-1 7-3 7-6V4z" fill="#EE1C25" stroke="#fff" strokeWidth="1" /></svg>,
  ro: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="12" height="24" fill="#002B7F" /><rect x="12" width="12" height="24" fill="#FCD116" /><rect x="24" width="12" height="24" fill="#CE1126" /></svg>,
  sr: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="36" height="8" fill="#C6363C" /><rect y="8" width="36" height="8" fill="#0C4076" /><rect y="16" width="36" height="8" fill="#fff" /></svg>,
  hr: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="36" height="8" fill="#FF0000" /><rect y="8" width="36" height="8" fill="#fff" /><rect y="16" width="36" height="8" fill="#171796" /></svg>,
  fr: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="12" height="24" fill="#002395" /><rect x="12" width="12" height="24" fill="#fff" /><rect x="24" width="12" height="24" fill="#ED2939" /></svg>,
  es: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="36" height="6" fill="#c60b1e" /><rect y="6" width="36" height="12" fill="#ffc400" /><rect y="18" width="36" height="6" fill="#c60b1e" /></svg>,
  it: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="12" height="24" fill="#009246" /><rect x="12" width="12" height="24" fill="#fff" /><rect x="24" width="12" height="24" fill="#CE2B37" /></svg>,
};

const COMM_LANGUAGE_OPTIONS = [
  { code: 'hu', label: 'magyar' },
  { code: 'en', label: 'angol' },
  { code: 'de', label: 'német' },
  { code: 'sk', label: 'szlovák' },
  { code: 'ro', label: 'román' },
  { code: 'sr', label: 'szerb' },
  { code: 'hr', label: 'horvát' },
  { code: 'fr', label: 'francia' },
  { code: 'es', label: 'spanyol' },
  { code: 'it', label: 'olasz' },
];

function CommunicationSettingsSection() {
  const [lang, setLang] = useState('hu');
  const [tone, setTone] = useState('professional_friendly');
  const [toneCustom, setToneCustom] = useState('');
  const [greeting, setGreeting] = useState('');
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [showGreetingInfo, setShowGreetingInfo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load current settings
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/admin/api/settings');
        const data = await res.json();
        if (data && !data.error) {
          setLang(data.language || 'hu');
          setTone(data.tone || 'professional_friendly');
          setToneCustom(data.tone_custom || '');
          setGreeting(data.greeting || '');
        }
      } catch { /* ignore */ }
      setLoaded(true);
    })();
  }, []);

  // Explicit save — read-modify-write
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Read current full settings to preserve voice_id, business_hours, etc.
      const getRes = await authFetch('/admin/api/settings');
      const existing = await getRes.json();
      const merged = { ...existing, language: lang, tone, tone_custom: toneCustom, greeting };
      delete merged.error; // safety: don't send back error field if it existed
      const postRes = await authFetch('/admin/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      if (postRes.ok) {
        showToast('Kommunikációs beállítások mentve!', 'success');
      } else {
        showToast('Hiba a mentésnél', 'error');
      }
    } catch { showToast('Hiba a mentésnél', 'error'); }
    setSaving(false);
  }, [lang, tone, toneCustom, greeting]);

  if (!loaded) return null;

  return (
    <>
      {/* Save button row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="beallitasok-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Mentés...' : 'Változtatások mentése'}
        </button>
      </div>

      <div className="beallitasok-card">
        <div className="beal-subtitle-16 mb-16">Kommunikáció beállításai</div>

        <div className="beal-grid-2 mb-24">
          {/* Nyelv */}
          <div>
            <label className="tt-label">Nyelv</label>
            <div className="relative">
              <div
                onClick={() => setShowLangDropdown(!showLangDropdown)}
                className="settings-lang-trigger"
              >
                <div className="settings-flag-wrap">
                  {COMM_FLAGS[lang] || COMM_FLAGS.hu}
                </div>
                <span className="flex-1 text-md font-medium settings-lang-text">
                  {COMM_LANGUAGE_OPTIONS.find(l => l.code === lang)?.label || 'magyar'}
                </span>
                <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14" className={`settings-lang-chevron ${showLangDropdown ? 'settings-lang-chevron--open' : 'settings-lang-chevron--closed'}`}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
              {showLangDropdown && (
                <>
                  <div className="dropdown-backdrop" onClick={() => setShowLangDropdown(false)} />
                  <div className="settings-lang-dropdown">
                    {COMM_LANGUAGE_OPTIONS.map(l => (
                      <div
                        key={l.code}
                        onClick={() => { setLang(l.code); setShowLangDropdown(false); }}
                        className={`settings-lang-option ${lang === l.code ? 'settings-lang-option--active' : 'settings-lang-option--idle'}`}
                        onMouseEnter={e => { if (lang !== l.code) (e.currentTarget as HTMLDivElement).style.background = 'rgba(28,238,224,0.04)'; }}
                        onMouseLeave={e => { if (lang !== l.code) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                      >
                        <div className="settings-flag-wrap">
                          {COMM_FLAGS[l.code]}
                        </div>
                        <span className={`${lang === l.code ? 'settings-lang-option-text--active' : 'settings-lang-option-text--idle'}`}>
                          {l.label}
                        </span>
                        {lang === l.code && (
                          <svg fill="none" strokeWidth="2.5" viewBox="0 0 24 24" width="14" height="14" className="settings-lang-check">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Kommunikációs stílus */}
          <div>
            <label className="tt-label">Kommunikációs stílus</label>
            <div className="settings-tone-select-wrap">
              <CustomSelect
                value={tone}
                onChange={(v) => setTone(v)}
                options={[
                  { value: 'professional_friendly', label: 'Professzionális, segítőkész' },
                  { value: 'formal', label: 'Formális, tárgyszerű' },
                  { value: 'informal', label: 'Informális, közvetlen' },
                  { value: 'empathetic', label: 'Empatikus, támogató' },
                  { value: 'custom', label: 'Egyedi leírás...' },
                ]}
              />
            </div>
            {tone === 'custom' && (
              <textarea className="settings-textarea settings-textarea--mt" value={toneCustom} onChange={(e) => setToneCustom(e.target.value)} placeholder="Írd le a kívánt kommunikációs stílust..." />
            )}
          </div>
        </div>

        {/* Üdvözlőszöveg */}
        <div>
          <div className="flex-row gap-6 mb-6">
            <label className="tt-label" style={{ marginBottom: 0 }}>Üdvözlőszöveg beállítása (Voice Agent)</label>
            <div onClick={() => setShowGreetingInfo(!showGreetingInfo)} className={`info-tooltip ${showGreetingInfo ? 'info-tooltip--active' : 'info-tooltip--idle'}`}>
              <span className={showGreetingInfo ? 'info-tooltip-i--active' : ''}>í</span>
            </div>
          </div>
          {showGreetingInfo && (
            <div className="settings-greeting-info">
              Az üdvözlőszöveg legyen rövid, természetes és egyértelmű. A Voice Agentet nevezheted egyszerűen virtuális asszisztensnek és/vagy adhatsz neki nevet is. Kerüld a túl hosszú vagy túl információsűrű megfogalmazást. Érdemes rögtön felkínálni a segítséget — a cél az, hogy a beszélgetés gyorsan és gördülékenyen elinduljon.
            </div>
          )}
          <textarea
            className="settings-textarea settings-textarea--greeting"
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Írd ide az üdvözlőszöveget..."
          />
        </div>
      </div>
    </>
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
      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="svg-18">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z" />
      </svg>
    ),
    placeholder: '+36 1 234 5678',
  },
  {
    id: 'email',
    label: 'E-mail',
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="svg-18">
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
      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="svg-18">
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      </svg>
    ),
    placeholder: 'fb.com/oldal',
  },
  {
    id: 'instagram',
    label: 'Instagram üzenet',
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="svg-18">
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
      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="svg-18">
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
    <div className="beallitasok-card channels-card">
      <div className="channels-header">
        <div className="channels-title">Csatornák</div>
      </div>
      <div className="channels-desc">Kommunikációs csatornák kezelése</div>
      <div className="channels-list">
        {channels.map((ch, i) => (
          <div key={ch.id} className={`channels-row ${i % 2 === 0 ? 'channels-row--even' : 'channels-row--odd'}`}>
            <div className={`channels-icon ${ch.enabled ? 'channels-icon--on' : 'channels-icon--off'}`}>
              {ch.icon}
            </div>
            <div className={`channels-label ${ch.enabled ? 'channels-label--on' : 'channels-label--off'}`}>
              {ch.label}
            </div>
            <label className="toggle">
              <input type="checkbox" checked={ch.enabled} onChange={e => update(ch.id, { enabled: e.target.checked })} />
              <span className="toggle-slider" />
            </label>
            <div className="channels-input-wrap">
              <input type="text" className="beallitasok-input" placeholder={ch.placeholder} value={ch.value} onChange={e => update(ch.id, { value: e.target.value })} disabled={!ch.enabled} />
            </div>
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
    <div ref={ref} className="role-dd-wrap">
      <button onClick={() => setOpen(!open)} className={`role-dd-btn${open ? ' role-dd-btn--open' : ''}`}>
        {current?.label || value}
        <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12" className={`role-dd-chevron${open ? ' role-dd-chevron--open' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="role-dd-panel">
          {ROLES.map(r => (
            <button key={r.value} onClick={() => { onChange(r.value); setOpen(false); }} className={`role-dd-option ${r.value === value ? 'role-dd-option--active' : 'role-dd-option--idle'}`}>
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
    </div>
  );
}

// ── Session Timeout Setting row ──
const TIMEOUT_OPTIONS = [
  { value: 5, label: '5 perc' },
  { value: 15, label: '15 perc' },
  { value: 30, label: '30 perc' },
  { value: 60, label: '60 perc' },
];


// SessionTimeoutSetting extracted to src/components/settings/SessionTimeoutSetting.tsx
// GdprSection extracted to src/components/settings/GdprSection.tsx

