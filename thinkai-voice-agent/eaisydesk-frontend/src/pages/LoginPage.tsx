import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, logoutMessage } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Kérlek, töltsd ki mindkét mezőt.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nem sikerült csatlakozni a szerverhez.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">e</div>
          <span>eaisydesk</span>
        </div>
        <div className="login-tagline">Ügyfélszolgálat, újragondolva.</div>
        <div className="login-sub">Jelentkezz be az admin felülethez</div>

        {(error || logoutMessage) && (
          <div className="login-error" style={{ display: 'block' }}>
            {error || logoutMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Felhasználónév</label>
            <input
              className="form-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Jelszó</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(e); }}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Belépés...' : 'BELÉPÉS'}
          </button>
        </form>
      </div>
    </div>
  );
}
