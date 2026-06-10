import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

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
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [logoutMessage, setLogoutMessage] = useState('');

  // Listen to Supabase auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          clearStoredUser();
          setUser(null);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // Restore session on mount
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        clearStoredUser();
        setUser(null);
      }
    })();
  }, []);

  const logout = useCallback(async (message = '') => {
    await supabase.auth.signOut();
    clearStoredUser();
    setUser(null);
    setLogoutMessage(message);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // 1. Sign in with Supabase Auth
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);

    // 2. Fetch role/username/full_name from admin_users table
    const { data: adminData, error: adminErr } = await supabase
      .from('admin_users')
      .select('username, role, full_name, email')
      .eq('email', email)
      .single();

    if (adminErr || !adminData) {
      // User exists in auth but not in admin_users -- still allow login with defaults
      const fallbackUser: User = {
        username: email.split('@')[0],
        role: 'member',
        fullName: '',
        email,
      };
      setStoredUser(fallbackUser);
      setUser(fallbackUser);
      setLogoutMessage('');
      return;
    }

    const newUser: User = {
      username: adminData.username,
      role: (adminData.role || 'member') as User['role'],
      fullName: adminData.full_name || '',
      email: adminData.email || email,
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
