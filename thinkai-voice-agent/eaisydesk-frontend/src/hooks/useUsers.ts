import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../api/client';

export interface AdminUser {
  id: number;
  username: string;
  email?: string;
  full_name?: string;
  role: string;
  last_login?: string;
}

export interface MemberInfo {
  name: string;
  username: string;
}

interface UseUsersReturn {
  users: AdminUser[];
  members: MemberInfo[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createUser: (data: {
    username: string;
    email?: string;
    password: string;
    role: string;
    full_name: string;
  }) => Promise<boolean>;
  deleteUser: (id: number) => Promise<boolean>;
  changeRole: (id: number, role: string) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
}

export function useUsers(): UseUsersReturn {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/admin/api/users');
      const json = await res.json();
      setUsers(json.data || []);
    } catch (e) {
      if ((e as Error).message !== 'Unauthorized') {
        setError('Hiba a felhasználók betöltésekor');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await authFetch('/admin/api/members');
      const data = await res.json();
      setMembers(
        (data.data || []).map((m: AdminUser) => ({
          name: m.full_name || m.username,
          username: m.username,
        }))
      );
    } catch {
      // members list is optional for non-admins
    }
  }, []);

  const createUser = useCallback(
    async (data: {
      username: string;
      email?: string;
      password: string;
      role: string;
      full_name: string;
    }): Promise<boolean> => {
      try {
        const res = await authFetch('/admin/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) return false;
        await fetchUsers();
        return true;
      } catch {
        return false;
      }
    },
    [fetchUsers]
  );

  const deleteUser = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        const res = await authFetch(`/admin/api/users/${id}`, {
          method: 'DELETE',
        });
        if (!res.ok) return false;
        await fetchUsers();
        return true;
      } catch {
        return false;
      }
    },
    [fetchUsers]
  );

  const changeRole = useCallback(
    async (id: number, role: string): Promise<boolean> => {
      try {
        const res = await authFetch(`/admin/api/users/${id}/role`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        });
        if (!res.ok) return false;
        await fetchUsers();
        return true;
      } catch {
        return false;
      }
    },
    [fetchUsers]
  );

  const changePassword = useCallback(
    async (
      currentPassword: string,
      newPassword: string
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await authFetch('/admin/api/users/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
          }),
        });
        const d = await res.json();
        if (!res.ok) return { ok: false, error: d.detail || 'Hiba' };
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    []
  );

  useEffect(() => {
    fetchUsers();
    fetchMembers();
  }, [fetchUsers, fetchMembers]);

  return {
    users,
    members,
    loading,
    error,
    refetch: fetchUsers,
    createUser,
    deleteUser,
    changeRole,
    changePassword,
  };
}
