import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../api/client';
import type { ClientRecord } from '../helpers/clientResolvers';

interface UseClientsReturn {
  clients: ClientRecord[];
  clientsMap: Record<string, ClientRecord>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useClients(): UseClientsReturn {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientsMap, setClientsMap] = useState<Record<string, ClientRecord>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/admin/api/clients');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const rawList = data?.clients || data;

      const list: ClientRecord[] = Array.isArray(rawList) ? rawList : [];
      setClients(list);
      const map: Record<string, ClientRecord> = {};
      list.forEach((c) => {
        map[String(c.id)] = c;
      });
      setClientsMap(map);
    } catch (e) {
      setError('Hiba az ügyfelek betöltésekor');
      console.error('useClients error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
    // Polling fallback instead of Supabase realtime
    const interval = setInterval(fetchClients, 30000);
    return () => clearInterval(interval);
  }, [fetchClients]);

  return { clients, clientsMap, loading, error, refetch: fetchClients };
}
