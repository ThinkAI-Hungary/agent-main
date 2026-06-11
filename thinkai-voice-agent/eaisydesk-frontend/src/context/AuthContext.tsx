import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { loginApi, setToken, clearToken, setOnUnauthorized, clearStoredUser as clearLegacyUser } from '../api/client';

export interface User {
  username: string;
  role: 'admin' | 'manager' | 'member';
  fullName: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAdminOnly: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: (message?: string) => void;
  logoutMessage: string;
}

const STORAGE_KEY = 'sb_admin_user';

function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function setStoredUser(user: User) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function clearStoredUser() {
  localStorage.removeItem(STORAGE_KEY);
  clearToken();
  clearLegacyUser();
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [logoutMessage, setLogoutMessage] = useState('');

  const logout = useCallback((message = '') => {
    clearStoredUser();
    setUser(null);
    setLogoutMessage(message);
  }, []);

  // Register 401 handler so authFetch can trigger logout
  setOnUnauthorized(() => logout('Munkamenet lejárt, kérlek lépj be újra.'));

  const login = useCallback(async (email: string, password: string) => {
    // Use FastAPI backend /admin/login endpoint
    // The backend accepts both username and email in the 'username' field
    const data = await loginApi(email, password);

    // Store JWT token for authFetch
    setToken(data.token);

    const newUser: User = {
      username: data.username,
      role: (data.role || 'member') as User['role'],
      fullName: data.full_name || '',
      email: email,
    };
    setStoredUser(newUser);
    setUser(newUser);
    setLogoutMessage('');
  }, []);

  const isAuthenticated = user !== null;
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const isAdminOnly = user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated, isAdmin, isAdminOnly, login, logout, logoutMessage }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
