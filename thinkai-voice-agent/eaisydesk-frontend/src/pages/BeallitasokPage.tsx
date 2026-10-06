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
import Cdd from '../components/ui/Cdd';
import { useConfirm } from '../components/ui/ConfirmDialog';
import Spinner from '../components/ui/Spinner';
import ProfileAvatarUpload from '../components/settings/ProfileAvatarUpload';
import SessionTimeoutSetting from '../components/settings/SessionTimeoutSetting';
import GdprSection from '../components/settings/GdprSection';
import CustomSelect from '../components/settings/CustomSelect';
import CredentialsSection from '../components/settings/CredentialsSection';
import VoiceAgentTestSection from '../components/settings/VoiceAgentTestSection';
import VoiceProvisioningSection from '../components/settings/VoiceProvisioningSection';


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
  { id: 'credentials', label: 'Hitelesítő adatok', icon: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 1 1 7.778-7.778zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4' },
  { id: 'hangteszt', label: 'Hangasszisztens teszt', icon: 'M23 7l-7 5 7 5V7zM14 5H3a2 2 0 00-2 2v10a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2z' },
  { id: 'telefonia', label: 'Telefónia', icon: 'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z' },
] as const;

export default function BeallitasokPage() {
  const { user, updateUser, isAdmin, isAdminOnly } = useAuth();
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

  const visibleTabs = useMemo(() => {
    return TABS.filter(tab => {
      if (tab.id === 'csapat' || tab.id === 'eaisydesk') return isAdmin;
      if (tab.id === 'credentials') return isAdminOnly;
      if (tab.id === 'hangteszt') return isAdmin;
      if (tab.id === 'telefonia') return isAdminOnly;
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
          <EaisyDeskSettingsTab />
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

        {/* ── HITELESÍTŐ ADATOK TAB ── */}
        {activeTab === 'credentials' && isAdminOnly && (
          <CredentialsSection />
        )}

        {/* ── HANGASSZISZTENS TESZT TAB ── */}
        {activeTab === 'hangteszt' && isAdmin && (
          <VoiceAgentTestSection />
        )}

        {/* ── TELEFÓNIA TAB ── */}
        {activeTab === 'telefonia' && isAdminOnly && (
          <VoiceProvisioningSection />
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
                      { value: 'member', label: 'Munkatárs', desc: 'Recepciós munka — ügyfelek, naptár, teendők' },
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

function EaisyDeskSettingsTab() {
  const [lang, setLang] = useState('hu');
  const [tone, setTone] = useState('professional_friendly');
  const [toneCustom, setToneCustom] = useState('');
  const [greeting, setGreeting] = useState('');
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [exclEmails, setExclEmails] = useState<string[]>([]);
  const [exclDomains, setExclDomains] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [settRes, busRes, exclRes] = await Promise.all([
          authFetch('/admin/api/settings'),
          authFetch('/admin/api/business-info'),
          authFetch('/admin/api/settings/excluded-senders'),
        ]);
        const sett = await settRes.json();
        const bus = await busRes.json();
        if (sett && !sett.error) {
          setLang(sett.language || 'hu');
          setTone(sett.tone || 'professional_friendly');
          setToneCustom(sett.tone_custom || '');
          setGreeting(sett.greeting || '');
        }
        if (bus && !bus.error) {
          setSenderName(bus.sender_name || '');
          setSenderEmail(bus.sender_email || '');
        }
        if (exclRes.ok) {
          const d = await exclRes.json();
          setExclEmails(d.emails || []);
          setExclDomains(d.domains || []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const handleSaveAll = useCallback(async () => {
    setSaving(true);
    try {
      const settGet = await authFetch('/admin/api/settings');
      const settExisting = await settGet.json();
      const settMerged = { ...settExisting, language: lang, tone, tone_custom: toneCustom, greeting };
      delete settMerged.error;

      const busGet = await authFetch('/admin/api/business-info');
      const busExisting = await busGet.json();
      const busMerged = { ...busExisting, sender_name: senderName, sender_email: senderEmail };
      delete busMerged.error;

      await Promise.all([
        authFetch('/admin/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settMerged) }),
        authFetch('/admin/api/business-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(busMerged) }),
      ]);
      showToast('Összes beállítás mentve!', 'success');
    } catch { showToast('Hiba a mentésnél', 'error'); }
    setSaving(false);
  }, [lang, tone, toneCustom, greeting, senderName, senderEmail]);

  // ── Kizárt feladók: azonnali mentés (saját endpoint) ──
  const saveExcl = useCallback(async (emailsNext: string[], domainsNext: string[]) => {
    setExclEmails(emailsNext);
    setExclDomains(domainsNext);
    try {
      const res = await authFetch('/admin/api/settings/excluded-senders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: emailsNext, domains: domainsNext }),
      });
      const d = await res.json().catch(() => ({}));
      showToast(d.ok ? 'Kizárt feladók mentve.' : 'Mentés sikertelen.', d.ok ? 'success' : 'error');
    } catch { showToast('Mentés sikertelen.', 'error'); }
  }, []);

  const addExclEmail = () => {
    const v = newEmail.trim().toLowerCase();
    if (!v || !v.includes('@')) { showToast('Érvényes e-mail címet adj meg.', 'error'); return; }
    if (exclEmails.includes(v)) { showToast('Már a listán van.', 'info'); return; }
    setNewEmail('');
    saveExcl([...exclEmails, v], exclDomains);
  };
  const addExclDomain = () => {
    let v = newDomain.trim().toLowerCase().replace(/^@+/, '');
    if (!v || !v.includes('.')) { showToast('Érvényes domaint adj meg (pl. ceg.hu).', 'error'); return; }
    if (exclDomains.includes(v)) { showToast('Már a listán van.', 'info'); return; }
    setNewDomain('');
    saveExcl(exclEmails, [...exclDomains, v]);
  };
  const removeExcl = (kind: 'email' | 'domain', value: string) => {
    if (kind === 'email') saveExcl(exclEmails.filter(x => x !== value), exclDomains);
    else saveExcl(exclEmails, exclDomains.filter(x => x !== value));
  };

  if (loading) return <div className="beal-empty-center"><Spinner /></div>;

  return (
    <div className="ed-settings-container">

      {/* ── 1. Kommunikáció beállításai ── */}
      <section className="co-section">
        <div className="co-sec-head">
          <div>
            <div className="co-sec-title">
              <svg className="ic" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>
              Kommunikáció beállításai
            </div>
            <div className="co-sec-sub">Az eaisyDesk által használt nyelv, stílus és üdvözlőszöveg</div>
          </div>
        </div>
        <div className="co-sec-body">
          <div className="co-grid2">
            <div className="co-field">
              <span>Alapértelmezett nyelv</span>
              <Cdd
                value={lang}
                options={[{ value: 'hu', label: 'Magyar' }, { value: 'en', label: 'Angol' }, { value: 'de', label: 'Német' }]}
                onChange={setLang}
                ariaLabel="Alapértelmezett nyelv"
              />
            </div>
            <div className="co-field">
              <span>Kommunikációs stílus</span>
              <Cdd
                value={tone}
                options={[
                  { value: 'professional_friendly', label: 'Professzionális, segítőkész' },
                  { value: 'friendly', label: 'Barátságos, közvetlen' },
                  { value: 'formal', label: 'Formális, távolságtartó' },
                  { value: 'short', label: 'Tömör, lényegretörő' },
                  ...(tone === 'custom' || toneCustom ? [{ value: 'custom', label: 'Egyéni' }] : []),
                ]}
                onChange={setTone}
                ariaLabel="Kommunikációs stílus"
              />
            </div>
          </div>
          {tone === 'custom' && (
            <div className="co-field" style={{ marginTop: 12 }}>
              <span>Egyéni stílus leírása</span>
              <input className="co-input" value={toneCustom} onChange={e => setToneCustom(e.target.value)} placeholder="Pl. Rövid, lényegretörő, humoros" />
            </div>
          )}
          <div className="co-field" style={{ marginTop: 14 }}>
            <div className="field-head">
              <span>Üdvözlőszöveg (Voice Agent)</span>
              <button className="info-tip" type="button" aria-label="Üdvözlőszöveg magyarázata">
                <svg className="ic" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                <span className="tip" role="tooltip">Ezt a szöveget mondja be a hangasszisztens minden beérkező hívás elején. A szövegnek tartalmaznia kell, hogy AI-asszisztens beszél, tájékoztatást kell adnia az adatkezelésről és a hangfelvételről, valamint meg kell adnia, hol érhető el a teljes tájékoztató.</span>
              </button>
            </div>
            <textarea className="co-textarea" rows={4} value={greeting} onChange={e => setGreeting(e.target.value)} placeholder="Pl.: Üdvözlöm, (név) vagyok, a (szolgáltató) virtuális asszisztense. A beszélgetést minőségbiztosítás és az esetleges hibák kivizsgálása érdekében rögzítjük. A felvételt (napok száma) nap után automatikusan töröljük. Részletes adatkezelési tájékoztatónkat a (weboldal) oldalon találja. Miben segíthetek?" />
          </div>
        </div>
      </section>

      {/* ── 2. E-mail feladó beállítások ── */}
      <section className="co-section">
        <div className="co-sec-head">
          <div>
            <div className="co-sec-title">
              <svg className="ic" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
              E-mail feladó beállítások
            </div>
            <div className="co-sec-sub">A kimenő e-mailekben megjelenő feladó neve és címe</div>
          </div>
          <button className="info-tip" type="button" aria-label="E-mail feladó magyarázata">
            <svg className="ic" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            <span className="tip" role="tooltip">Az eaisyDesk által küldött e-mailek ezzel a névvel és címmel jelennek meg a címzettek postaládájában. A feladó e-mail-cím meghatározza azt is, hová érkeznek a válaszok.</span>
          </button>
        </div>
        <div className="co-sec-body">
          <div className="co-grid2">
            <label className="co-field">
              <span>Feladó neve</span>
              <input className="co-input" type="text" value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="pl. Rivergate Dental" />
            </label>
            <label className="co-field">
              <span>Feladó e-mail</span>
              <input className="co-input" type="email" value={senderEmail} onChange={e => setSenderEmail(e.target.value)} placeholder="pl. hello@ceg.hu" />
            </label>
          </div>
        </div>
      </section>

      {/* ── 3. Kizárt feladók ── */}
      <section className="co-section">
        <div className="co-sec-head">
          <div>
            <div className="co-sec-title">
              <svg className="ic" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
              Kizárt feladók
            </div>
            <div className="co-sec-sub">Az itt megadott feladóktól érkező e-maileket az eaisyDesk figyelmen kívül hagyja</div>
          </div>
          <button className="info-tip" type="button" aria-label="Kizárt feladók magyarázata">
            <svg className="ic" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            <span className="tip" role="tooltip">A kizárt e-mail-címekről vagy domainekről érkező leveleket az eaisyDesk nem dolgozza fel, nem hoz létre belőlük ügyet, és nem küld rájuk automatikus választ. Használd például hírlevelek, rendszerüzenetek vagy belső címek kizárására.</span>
          </button>
        </div>
        <div className="co-sec-body">
          <div className="excl-block">
            <div className="excl-title">
              <svg className="ic" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.92 7.94" /></svg>
              Kizárt e-mail-címek
            </div>
            <div className="chips">
              {exclEmails.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>— nincs —</span>}
              {exclEmails.map(e => (
                <span key={e} className="chip">
                  {e}
                  <button className="chip-x" type="button" aria-label={e + ' eltávolítása'} onClick={() => removeExcl('email', e)}>
                    <svg className="ic" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="11" height="11"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </span>
              ))}
            </div>
            <div className="excl-add">
              <input className="co-input" type="email" placeholder="munkatars@gmail.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addExclEmail(); }} />
              <button className="appt-btn" type="button" onClick={addExclEmail}>Hozzáadás</button>
            </div>
          </div>

          <div className="excl-block">
            <div className="excl-title">
              <svg className="ic" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>
              Kizárt domainek
            </div>
            <div className="chips">
              {exclDomains.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>— nincs —</span>}
              {exclDomains.map(d => (
                <span key={d} className="chip">
                  @{d}
                  <button className="chip-x" type="button" aria-label={d + ' eltávolítása'} onClick={() => removeExcl('domain', d)}>
                    <svg className="ic" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="11" height="11"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </span>
              ))}
            </div>
            <div className="excl-add">
              <input className="co-input" type="text" placeholder="ceg.hu" value={newDomain} onChange={e => setNewDomain(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addExclDomain(); }} />
              <button className="appt-btn" type="button" onClick={addExclDomain}>Hozzáadás</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

const ROLES = [
  { value: 'member', label: 'Munkatárs' },
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

