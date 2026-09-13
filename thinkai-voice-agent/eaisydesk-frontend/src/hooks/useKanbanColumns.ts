import { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '../api/client';

export interface KanbanColumn {
  id: string;
  name: string;
  order_index: number;
}

interface UseKanbanColumnsReturn {
  columns: KanbanColumn[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addColumn: (id: string, name: string, order_index?: number) => Promise<boolean>;
  renameColumn: (id: string, name: string) => Promise<boolean>;
  deleteColumn: (id: string) => Promise<boolean>;
}

export function useKanbanColumns(): UseKanbanColumnsReturn {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Csendes háttér-poll (glitch-fix): a loading-skeleton csak az ELSŐ
  // betöltésig jelenik meg; a 30 mp-es körök a meglévő tartalom mögött futnak
  const hasData = useRef(false);

  const fetchColumns = useCallback(async () => {
    if (!hasData.current) setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/admin/api/kanban_columns');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const cols = data?.columns || data;
      const nextCols: KanbanColumn[] = Array.isArray(cols) ? cols as KanbanColumn[] : [];
      hasData.current = true;
      // No-op szűrő: változatlan adatnál nincs újrarenderelés
      setColumns(prev => JSON.stringify(prev) === JSON.stringify(nextCols) ? prev : nextCols);
    } catch (e) {
      setError('Hiba az oszlopok betöltésekor');
      console.error('useKanbanColumns error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const addColumn = useCallback(
    async (id: string, name: string, order_index?: number): Promise<boolean> => {
      const resolvedOrder =
        order_index !== undefined
          ? order_index
          : columns.length > 0
            ? Math.max(...columns.map((c) => c.order_index)) + 1
            : 1;
      try {
        const res = await authFetch('/admin/api/kanban_columns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, name, order_index: resolvedOrder }),
        });
        if (!res.ok) return false;
        await fetchColumns();
        return true;
      } catch {
        return false;
      }
    },
    [columns, fetchColumns]
  );

  const renameColumn = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      try {
        const res = await authFetch(`/admin/api/kanban_columns/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) return false;
        await fetchColumns();
        return true;
      } catch {
        return false;
      }
    },
    [fetchColumns]
  );

  const deleteColumn = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await authFetch(`/admin/api/kanban_columns/${id}`, { method: 'DELETE' });
        if (!res.ok) return false;
        await fetchColumns();
        return true;
      } catch {
        return false;
      }
    },
    [fetchColumns]
  );

  useEffect(() => {
    fetchColumns();
    // Polling fallback instead of Supabase realtime (realtime requires anon key)
    const interval = setInterval(fetchColumns, 30000);
    return () => clearInterval(interval);
  }, [fetchColumns]);

  return {
    columns,
    loading,
    error,
    refetch: fetchColumns,
    addColumn,
    renameColumn,
    deleteColumn,
  };
}
