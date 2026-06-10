import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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
    email: string;
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

  // READ: direct Supabase (exclude password_hash!)
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: sbError } = await supabase
        .from('admin_users')
        .select('id, username, email, full_name, role, last_login, created_at')
        .order('created_at', { ascending: true });

      if (sbError) throw sbError;

      setUsers((data || []) as AdminUser[]);
    } catch (e) {
      setError('Hiba a felhasználók betöltésekor');
      console.error('useUsers error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // READ members: also direct Supabase
  const fetchMembers = useCallback(async () => {
    try {
      const { data, error: sbError } = await supabase
        .from('admin_users')
        .select('username, full_name, role')
        .order('full_name', { ascending: true });

      if (sbError) throw sbError;

      setMembers(
        (data || []).map((m: Record<string, unknown>) => ({
          name: (m.full_name || m.username) as string,
          username: m.username as string,
        }))
      );
    } catch {
      // members list is optional for non-admins
    }
  }, []);

  // CREATE: Supabase Auth signUp + admin_users insert
  const createUser = useCallback(
    async (data: {
      username: string;
      email: string;
      password: string;
      role: string;
      full_name: string;
    }): Promise<boolean> => {
      try {
        // 1. Create Supabase Auth user
        const { error: authError } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
        });
        if (authError) return false;

        // 2. Insert into admin_users
        const { error: dbError } = await supabase.from('admin_users').insert({
          username: data.username || data.email.split('@')[0],
          email: data.email,
          full_name: data.full_name,
          role: data.role,
        });
        if (dbError) return false;

        await fetchUsers();
        return true;
      } catch {
        return false;
      }
    },
    [fetchUsers]
  );

  // DELETE: remove from admin_users + auth.users via RPC
  const deleteUser = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        const { data: userData } = await supabase
          .from('admin_users')
          .select('email')
          .eq('id', id)
          .single();

        const { error } = await supabase.from('admin_users').delete().eq('id', id);
        if (error) return false;

        if (userData?.email) {
          await supabase.rpc('delete_auth_user', { p_email: userData.email });
        }

        await fetchUsers();
        return true;
      } catch {
        return false;
      }
    },
    [fetchUsers]
  );

  // ROLE: direct Supabase update
  const changeRole = useCallback(
    async (id: number, role: string): Promise<boolean> => {
      try {
        const { error } = await supabase
          .from('admin_users')
          .update({ role })
          .eq('id', id);
        if (error) return false;
        await fetchUsers();
        return true;
      } catch {
        return false;
      }
    },
    [fetchUsers]
  );

  // PASSWORD: Supabase Auth updateUser
  const changePassword = useCallback(
    async (
      _currentPassword: string,
      newPassword: string
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) return { ok: false, error: error.message };
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
