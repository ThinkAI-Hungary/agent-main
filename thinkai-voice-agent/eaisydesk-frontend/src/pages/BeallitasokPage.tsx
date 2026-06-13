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
    setProfileName(user?.fullName || user?.username || '');
    setProfilePosition('');
    setProfileCompany('');
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
      // Use Supabase direct update for own profile (no admin endpoint needed)
      const { supabase } = await import('../lib/supabase');
      if (user?.username) {
        await supabase.from('admin_users').update({ full_name: profileName }).eq('username', user.username);
      }
      showToast('Profil mentve!');
    } catch { showToast('Hiba', 'error'); }
  }, [user, profileName]);

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
          role: newUser.role,
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
            <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
