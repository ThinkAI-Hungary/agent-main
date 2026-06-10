/**
 * BeallitasokPage – 1:1 port of legacy Beállítások page
 * Features: user profile, team management (admin), password change.
 */
import { useState, useEffect, useCallback } from 'react';
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

export default function BeallitasokPage() {
  const { user } = useAuth();
  const { confirm, ConfirmDialog } = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [newUser, setNewUser] = useState({ full_name: '', username: '', email: '', password: '', role: 'member' });

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

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
      // 1. Create Supabase Auth user
      const { error: authError } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
      });
      if (authError) { showToast(authError.message || 'Hiba', 'error'); return; }

      // 2. Insert into admin_users table
      const { error: dbError } = await supabase.from('admin_users').insert({
        username: newUser.username || newUser.email.split('@')[0],
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role,
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
      const { error } = await supabase
        .from('admin_users')
        .update({ role: newRole })
        .eq('id', userId);
      if (!error) loadUsers();
      else showToast('Hiba a szerepkör módosításakor', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [loadUsers]);

  const handleDeleteUser = useCallback(async (userId: number, username: string) => {
    const ok = await confirm(`Biztosan törlöd a(z) "${username}" felhasználót?`, { title: 'Felhasználó törlése', danger: true });
    if (!ok) return;
    try {
      // Get email for auth deletion
      const { data: userData } = await supabase
        .from('admin_users')
        .select('email')
        .eq('id', userId)
        .single();

      // Delete from admin_users
      const { error } = await supabase.from('admin_users').delete().eq('id', userId);
      if (error) { showToast('Hiba', 'error'); return; }

      // Delete from auth.users via RPC
      if (userData?.email) {
        await supabase.rpc('delete_auth_user', { p_email: userData.email });
      }

      showToast('Felhasználó törölve');
      loadUsers();
    } catch { showToast('Hiba', 'error'); }
  }, [confirm, loadUsers]);

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="analytics-shell">
      <ConfirmDialog />

      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <div className="page-title">Beállítások</div>
          <div className="page-subtitle">Fiókkezelés, jelszó és csapat</div>
        </div>
      </div>

      {/* Profile card */}
      <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', padding: 24, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#1ceee0,#0bbdb1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#082432' }}>
            {getInitials(user?.full_name || user?.username || '?')}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{user?.full_name || user?.username}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{user?.email || user?.username}</div>
            <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: user?.role === 'admin' ? 'rgba(28,238,224,0.15)' : 'rgba(107,139,153,0.15)', color: user?.role === 'admin' ? 'var(--accent)' : 'var(--text-muted)', textTransform: 'uppercase' }}>{user?.role || 'member'}</span>
          </div>
        </div>
        <button onClick={() => setShowPasswordModal(true)} style={{ padding: '10px 20px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Jelszó módosítása</button>
      </div>

      {/* Team management (admin only) */}
      {isAdmin && (
        <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Csapattagok</h3>
            <button onClick={() => setShowCreateUserModal(true)} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,#1ceee0,#0bbdb1)', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#082432', cursor: 'pointer', fontFamily: 'inherit' }}>+ Új felhasználó</button>
          </div>

          {loading ? <Spinner /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {users.map((u) => {
                const isSelf = u.username === user?.username;
                const roleBadgeColor = u.role === 'admin' ? '#1ceee0' : u.role === 'manager' ? '#8b5cf6' : 'var(--text-muted)';
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
                    <span className={`team-role-badge ${u.role}`} style={{ color: roleBadgeColor, borderColor: `${roleBadgeColor}40` }}>{u.role.toUpperCase()}</span>
                    {!isSelf && (
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
        </div>
      )}

      {/* Password Modal */}
      {showPasswordModal && (
        <Modal title="Jelszó módosítása" onClose={() => setShowPasswordModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="password" placeholder="Jelenlegi jelszó" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} style={inputStyle} autoFocus />
            <input type="password" placeholder="Új jelszó" value={pwNew} onChange={(e) => setPwNew(e.target.value)} style={inputStyle} />
            <input type="password" placeholder="Új jelszó megerősítése" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setShowPasswordModal(false)} style={{ ...btnStyle, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Mégse</button>
            <button onClick={handleChangePassword} style={{ ...btnStyle, background: 'linear-gradient(135deg,#1ceee0,#0bbdb1)', color: '#082432' }}>Módosítás</button>
          </div>
        </Modal>
      )}

      {/* Create User Modal */}
      {showCreateUserModal && (
        <Modal title="Új felhasználó létrehozása" onClose={() => setShowCreateUserModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="text" placeholder="Teljes név *" value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} style={inputStyle} autoFocus />
            <input type="text" placeholder="Felhasználónév *" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} style={inputStyle} />
            <input type="email" placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} style={inputStyle} />
            <input type="password" placeholder="Jelszó *" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} style={inputStyle} />
            <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} style={inputStyle}>
              <option value="member">Member</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setShowCreateUserModal(false)} style={{ ...btnStyle, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Mégse</button>
            <button onClick={handleCreateUser} style={{ ...btnStyle, background: 'linear-gradient(135deg,#1ceee0,#0bbdb1)', color: '#082432' }}>Létrehozás</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--card, #fff)', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--bg, #f9fafb)', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
};

const btnStyle: React.CSSProperties = {
  padding: '10px 20px', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
