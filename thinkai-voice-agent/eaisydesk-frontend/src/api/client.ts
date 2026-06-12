/**
 * API client for eaisydesk admin.
 * Wraps fetch with JWT auth headers and auto-logout on 401.
 */

const API_BASE = '';

export function getToken(): string {
  return localStorage.getItem('thinkai_admin_token') || '';
}

export function setToken(token: string): void {
  localStorage.setItem('thinkai_admin_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('thinkai_admin_token');
}

export function getStoredUser(): {
  username: string;
  role: string;
  fullName: string;
} {
  return {
    username: localStorage.getItem('thinkai_admin_user') || '',
    role: localStorage.getItem('thinkai_admin_role') || 'admin',
    fullName: localStorage.getItem('thinkai_admin_fullname') || '',
  };
}

export function setStoredUser(username: string, role: string, fullName: string): void {
  localStorage.setItem('thinkai_admin_user', username);
  localStorage.setItem('thinkai_admin_role', role);
  localStorage.setItem('thinkai_admin_fullname', fullName);
}

export function clearStoredUser(): void {
  localStorage.removeItem('thinkai_admin_user');
  localStorage.removeItem('thinkai_admin_role');
  localStorage.removeItem('thinkai_admin_fullname');
  localStorage.removeItem('thinkai_admin_email');
}

/** Callback set by AuthContext to trigger logout on 401. */
let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(cb: () => void): void {
  onUnauthorized = cb;
}

/**
 * Authenticated fetch wrapper.
 * Automatically adds JWT Bearer header and handles 401 -> logout.
 */
export async function authFetch(
  url: string,
  opts: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${url}`, {
    cache: 'no-store',
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      ...opts.headers,
    },
  });

  if (res.status === 401) {
    if (onUnauthorized) onUnauthorized();
    throw new Error('Unauthorized');
  }

  return res;
}

/**
 * Login API call.
 */
export async function loginApi(
  username: string,
  password: string
): Promise<{ token: string; username: string; role: string; full_name: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error('Nem sikerült csatlakozni a szerverhez.');
  }

  if (!res.ok) {
    try {
      const data = await res.json();
      throw new Error(data.detail || 'Hibás adatok.');
    } catch (e) {
      if (e instanceof Error && e.message !== 'Hibás adatok.' && !e.message.includes('detail')) {
        throw new Error('A szerver nem elérhető vagy hibás választ adott.', { cause: e });
      }
      throw e;
    }
  }

  try {
    return await res.json();
  } catch {
    throw new Error('A szerver nem elérhető vagy hibás választ adott.');
  }
}
