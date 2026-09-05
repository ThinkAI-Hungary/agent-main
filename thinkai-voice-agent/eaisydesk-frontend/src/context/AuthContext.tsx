import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { loginApi, setToken, clearToken, setOnUnauthorized, clearStoredUser as clearLegacyUser } from '../api/client';

export interface User {
  username: string;
  role: 'admin' | 'manager' | 'member' | 'superadmin';
  fullName: string;
  email: string;
  tenantId?: string;
  tenantName?: string;
}

export interface ImpersonatedTenant {
  id: string;
  name: string;
  slug: string;
  plan?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAdminOnly: boolean;
  isSuperAdmin: boolean;
  isManager: boolean;
  isMember: boolean;
  impersonatedTenant: ImpersonatedTenant | null;
  impersonateTenant: (token: string, tenant: ImpersonatedTenant) => void;
  exitImpersonation: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  logout: (message?: string) => void;
  updateUser: (patch: Partial<User>) => void;
  logoutMessage: string;
}

const STORAGE_KEY = 'sb_admin_user';
const IMPERSONATION_STORAGE_KEY = 'thinkai_impersonated_tenant';
const ORIG_TOKEN_STORAGE_KEY = 'thinkai_original_superadmin_token';

function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function getStoredImpersonatedTenant(): ImpersonatedTenant | null {
  try {
    const raw = localStorage.getItem(IMPERSONATION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImpersonatedTenant;
  } catch {
    return null;
  }
}

function setStoredUser(user: User) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function clearStoredUser() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
  localStorage.removeItem(ORIG_TOKEN_STORAGE_KEY);
  clearToken();
  clearLegacyUser();
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [impersonatedTenant, setImpersonatedTenant] = useState<ImpersonatedTenant | null>(() => getStoredImpersonatedTenant());
  const [logoutMessage, setLogoutMessage] = useState('');

  const logout = useCallback((message = '') => {
    clearStoredUser();
    setImpersonatedTenant(null);
    setUser(null);
    setLogoutMessage(message);
  }, []);

  const impersonateTenant = useCallback((token: string, tenant: ImpersonatedTenant) => {
    const currentToken = localStorage.getItem('thinkai_admin_token') || '';
    if (!localStorage.getItem(ORIG_TOKEN_STORAGE_KEY) && currentToken) {
      localStorage.setItem(ORIG_TOKEN_STORAGE_KEY, currentToken);
    }
    localStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(tenant));
    setToken(token);
    setImpersonatedTenant(tenant);
    setUser(prev => {
      if (!prev) return null;
      const updated: User = {
        ...prev,
        tenantId: tenant.id,
        tenantName: tenant.name,
      };
      setStoredUser(updated);
      return updated;
    });
  }, []);

  const exitImpersonation = useCallback(async () => {
    const origToken = localStorage.getItem(ORIG_TOKEN_STORAGE_KEY);
    try {
      const res = await fetch('/admin/api/management/exit-impersonation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('thinkai_admin_token') || ''}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          setToken(data.token);
        } else if (origToken) {
          setToken(origToken);
        }
      } else if (origToken) {
        setToken(origToken);
      }
    } catch {
      if (origToken) setToken(origToken);
    }

    localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
    localStorage.removeItem(ORIG_TOKEN_STORAGE_KEY);
    setImpersonatedTenant(null);
    setUser(prev => {
      if (!prev) return null;
      const updated: User = {
        ...prev,
        tenantId: undefined,
        tenantName: 'Központi Rendszer',
      };
      setStoredUser(updated);
      return updated;
    });
  }, []);

  // Register 401 handler so authFetch can trigger logout
  setOnUnauthorized(() => logout('Munkamenet lejárt, kérlek lépj be újra.'));

  const login = useCallback(async (email: string, password: string): Promise<User> => {
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
      tenantId: data.tenant_id || undefined,
      tenantName: data.tenant_name || undefined,
    };
    setStoredUser(newUser);
    setUser(newUser);
    setLogoutMessage('');
    return newUser;
  }, []);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch };
      setStoredUser(updated);
      return updated;
    });
  }, []);

  const isAuthenticated = user !== null;
  const isSuperAdmin = user?.role === 'superadmin';
  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || isSuperAdmin;
  const isAdminOnly = user?.role === 'admin' || isSuperAdmin;
  const isManager = user?.role === 'manager';
  const isMember = user?.role === 'member';

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isAdmin,
        isAdminOnly,
        isSuperAdmin,
        isManager,
        isMember,
        impersonatedTenant,
        impersonateTenant,
        exitImpersonation,
        login,
        logout,
        updateUser,
        logoutMessage
      }}
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
