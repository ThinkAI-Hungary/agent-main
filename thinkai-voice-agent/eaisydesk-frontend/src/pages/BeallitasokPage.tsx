/**
 * BeallitasokPage – 1:1 port of legacy page-beallitasok.html
 * Pill-style tabs: Profil, Csapat, Biztonság
 * All data from Supabase.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
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
  const { user } = useAuth();
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

  const visibleTabs = useMemo(() => {
    return TABS.filter(tab => tab.id !== 'csapat' || isAdmin);
  }, [isAdmin]);

  useEffect(() => {
    setProfileName(user?.fullName || user?.full_name || user?.username || '');
    setProfilePosition('');
    setProfileCompany('');
  }, [user]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('id, username, email, full_name, role, last_login, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setUsers((data || []) as User[]);
    } catch { /* ok */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleSaveProfile = useCallback(async () => {
    try {
      if (user?.id) {
        await supabase.from('admin_users').update({ full_name: profileName }).eq('id', user.id);
      }
      showToast('Profil mentve!');
    } catch { showToast('Hiba', 'error'); }
  }, [user, profileName]);

  const handleChangePassword = useCallback(async () => {
    if (!pwCurrent || !pwNew) { showToast('Mindkét mezőt ki kell tölteni!', 'error'); return; }
    if (pwNew.length < 4) { showToast('Az új jelszónak legalább 4 karakter hosszúnak kell lennie!', 'error'); return; }
    if (pwNew !== pwConfirm) { showToast('Az új jelszavak nem egyeznek!', 'error'); return; }
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) { showToast(error.message || 'Hiba', 'error'); return; }
      showToast('Jelszó sikeresen módosítva!');
      setShowPasswordModal(false);
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
    } catch { showToast('Hálózati hiba', 'error'); }
  }, [pwCurrent, pwNew, pwConfirm]);

  const handleCreateUser = useCallback(async () => {
    if (!newUser.full_name || !newUser.email || !newUser.password) { showToast('Teljes név, email és jelszó kötelező!', 'error'); return; }
    if (newUser.password.length < 4) { showToast('A jelszónak legalább 4 karakter hosszúnak kell lennie!', 'error'); return; }
    try {
      const { error: authError } = await supabase.auth.signUp({ email: newUser.email, password: newUser.password });
      if (authError) { showToast(authError.message || 'Hiba', 'error'); return; }
      const { error: dbError } = await supabase.from('admin_users').insert({
        username: newUser.username || newUser.email.split('@')[0],
        email: newUser.email, full_name: newUser.full_name, role: newUser.role,
      });
      if (dbError) { showToast('Auth user létrehozva, de admin_users hiba: ' + dbError.message, 'error'); return; }
      showToast('Felhasználó létrehozva!');
      setShowCreateUserModal(false);
      setNewUser({ full_name: '', username: '', email: '', password: '', role: 'member' });
      loadUsers();
    } catch { showToast('Hiba', 'error'); }
  }, [newUser, loadUsers]);

  const handleChangeRole = useCallback(async (userId: number, newRole: string) => {
    try {
      const { error } = await supabase.from('admin_users').update({ role: newRole }).eq('id', userId);
      if (!error) loadUsers();
      else showToast('Hiba a szerepkör módosításakor', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [loadUsers]);

  const handleDeleteUser = useCallback(async (userId: number, username: string) => {
    const ok = await confirm(`Biztosan törlöd a(z) "${username}" felhasználót?`, { title: 'Felhasználó törlése', danger: true });
    if (!ok) return;
    try {
      const { data: userData } = await supabase.from('admin_users').select('email').eq('id', userId).single();
      const { error } = await supabase.from('admin_users').delete().eq('id', userId);
      if (error) { showToast('Hiba', 'error'); return; }
      if (userData?.email) { await supabase.rpc('delete_auth_user', { p_email: userData.email }); }
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
          <div className="beallitasok-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ width: 20, height: 20, color: 'var(--text)' }}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Felhasználói profil</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 32 }}>Személyes információk és avatar kezelése</div>

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
                  {users.map((u) => {
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
                        <span className={`team-role-badge ${u.role}`}>{u.role.toUpperCase()}</span>
                        {!isSelf && isAdmin && (
                          <div className="team-actions">
                            <select value={u.role} onChange={(e) => handleChangeRole(u.id, e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'inherit' }}>
                              <option value="member">Member</option>
                              <option value="manager">Manager</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button className="team-delete-btn" onClick={() => handleDeleteUser(u.id, u.username)} title="Törlés">
                              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 15, height: 15 }}>
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                              </svg>
                            </button>
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
                  <div className="security-desc">Utolsó módosítás: ismeretlen</div>
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

      {/* Password Modal */}
      {showPasswordModal && (
        <Modal title="Jelszó módosítása" subtitle="Add meg a jelenlegi és új jelszavad" onClose={() => setShowPasswordModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="beallitasok-label">Jelenlegi jelszó</label>
              <input type="password" className="beallitasok-input" placeholder="Jelenlegi jelszó" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="beallitasok-label">Új jelszó</label>
              <input type="password" className="beallitasok-input" placeholder="Új jelszó (min. 4 karakter)" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
            </div>
            <div>
              <label className="beallitasok-label">Új jelszó megerősítése</label>
              <input type="password" className="beallitasok-input" placeholder="Új jelszó ismét" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
            <button onClick={() => setShowPasswordModal(false)} className="btn-cancel-modal">Mégse</button>
            <button onClick={handleChangePassword} className="beallitasok-save-btn">Jelszó módosítása</button>
          </div>
        </Modal>
      )}

      {/* Create User Modal */}
      {showCreateUserModal && (
        <Modal title="Új felhasználó létrehozása" subtitle="Hozz létre új hozzáférést a csapattagok számára" onClose={() => setShowCreateUserModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="beallitasok-label">Teljes név *</label>
              <input type="text" className="beallitasok-input" placeholder="Teljes név" value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} autoFocus />
            </div>
            <div>
              <label className="beallitasok-label">Felhasználónév</label>
              <input type="text" className="beallitasok-input" placeholder="Felhasználónév" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
            </div>
            <div>
              <label className="beallitasok-label">Email *</label>
              <input type="email" className="beallitasok-input" placeholder="email@example.com" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            </div>
            <div>
              <label className="beallitasok-label">Jelszó *</label>
              <input type="password" className="beallitasok-input" placeholder="Min. 4 karakter" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            </div>
            <div>
              <label className="beallitasok-label">Szerepkör</label>
              <select className="beallitasok-input" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="member">Member</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
            <button onClick={() => setShowCreateUserModal(false)} className="btn-cancel-modal">Mégse</button>
            <button onClick={handleCreateUser} className="beallitasok-save-btn">Létrehozás</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="security-modal-overlay" onClick={onClose} style={{ display: 'flex' }}>
      <div className="security-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 16, padding: 28, width: 440, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#1ceee0,#0bbdb1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
