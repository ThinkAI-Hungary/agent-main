import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../api/client';
import type { SessionInteraction } from './useSessions';

export interface GroupedSession {
  session_id: string;
  interaction_count: number;
  last_created_at: string;
  session_statusz: string | null;
  room_name?: string | null;
  participant?: string | null;
  client_name?: string | null;
  representative: SessionInteraction;
}

interface UseGroupedSessionsReturn {
  groups: GroupedSession[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Szerver-oldali session-aggregáció (GET /admin/api/interactions/grouped).
 * 1 session = 1 sor; a reprezentatív interakciót és a session-max státuszt az
 * SQL adja — nincs kliens-oldali 500 soros ablakos merge (régen a sessionök
 * széttöredezhettek az ablak határán, és a régebbiek láthatatlanok voltak).
 */
export function useGroupedSessions(limit = 100): UseGroupedSessionsReturn {
  const [groups, setGroups] = useState<GroupedSession[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/admin/api/interactions/grouped?limit=${limit}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setGroups(Array.isArray(data?.sessions) ? data.sessions : []);
      setTotal(typeof data?.total === 'number' ? data.total : 0);
    } catch (e) {
      setError('Hiba az interakciók betöltésekor');
      console.error('useGroupedSessions error:', e);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchGroups();
    const interval = setInterval(fetchGroups, 30000);
    return () => clearInterval(interval);
  }, [fetchGroups]);

  return { groups, total, loading, error, refetch: fetchGroups };
}
