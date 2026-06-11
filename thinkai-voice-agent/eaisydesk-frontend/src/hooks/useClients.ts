import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
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
      const { data, error: sbError } = await supabase
        .from('clients')
        .select('id, name, email, phone, status, custom_data, created_at')
        .order('created_at', { ascending: false });

      if (sbError) throw sbError;

      const list: ClientRecord[] = data || [];
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

    // Realtime: auto-refresh on clients table changes
    // Use unique channel name to avoid conflict when multiple components use this hook
    const channelId = `clients-changes-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
        fetchClients();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchClients]);

  return { clients, clientsMap, loading, error, refetch: fetchClients };
}
