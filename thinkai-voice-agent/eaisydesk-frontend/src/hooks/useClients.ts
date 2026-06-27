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

// ── Module-level cache so data is instantly available across components ──
let _cachedClients: ClientRecord[] = [];
let _cachedClientsMap: Record<string, ClientRecord> = {};
let _cacheReady = false;

export function useClients(): UseClientsReturn {
  const [clients, setClients] = useState<ClientRecord[]>(_cachedClients);
  const [clientsMap, setClientsMap] = useState<Record<string, ClientRecord>>(_cachedClientsMap);
  const [loading, setLoading] = useState(!_cacheReady);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    // Only show loading spinner if there is no cached data yet
    if (!_cacheReady) setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/admin/api/clients');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const rawList = data?.clients || data;

      const list: ClientRecord[] = Array.isArray(rawList) ? rawList : [];
      const map: Record<string, ClientRecord> = {};
      list.forEach((c) => {
        map[String(c.id)] = c;
      });

      // Update module-level cache
      _cachedClients = list;
      _cachedClientsMap = map;
      _cacheReady = true;

      setClients(list);
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
