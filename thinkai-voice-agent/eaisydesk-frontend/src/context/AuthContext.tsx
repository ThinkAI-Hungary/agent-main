import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  loginApi,
  getToken,
  setToken,
  clearToken,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  setOnUnauthorized,
} from '../api/client';

export interface User {
  username: string;
  role: 'admin' | 'manager' | 'member';
  fullName: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAdminOnly: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: (message?: string) => void;
  logoutMessage: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const token = getToken();
    if (!token) return null;
    const stored = getStoredUser();
    if (!stored.username) return null;
    return {
      username: stored.username,
      role: stored.role as User['role'],
      fullName: stored.fullName,
    };
  });
  const [logoutMessage, setLogoutMessage] = useState('');

  const logout = useCallback((message = '') => {
    clearToken();
    clearStoredUser();
    setUser(null);
    setLogoutMessage(message);
  }, []);

  // Register the 401 handler
  useEffect(() => {
    setOnUnauthorized(() =>
      logout('A munkamenet biztonsági okokból lejárt. Kérlek, jelentkezz be újra.')
    );
  }, [logout]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await loginApi(username, password);
    setToken(data.token);
    const newUser: User = {
      username: data.username,
      role: (data.role || 'member') as User['role'],
      fullName: data.full_name || '',
    };
    setStoredUser(newUser.username, newUser.role, newUser.fullName);
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
