import { useState, useEffect, useCallback } from 'react';
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
  addColumn: (id: string, name: string) => Promise<boolean>;
  renameColumn: (id: string, name: string) => Promise<boolean>;
  deleteColumn: (id: string) => Promise<boolean>;
}

export function useKanbanColumns(): UseKanbanColumnsReturn {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchColumns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/admin/api/kanban_columns');
      const data = await res.json();
      const cols: KanbanColumn[] = data.columns || [];
      cols.sort((a, b) => a.order_index - b.order_index);
      setColumns(cols);
    } catch (e) {
      if ((e as Error).message !== 'Unauthorized') {
        setError('Hiba az oszlopok betöltésekor');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const addColumn = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      const order_index =
        columns.length > 0
          ? Math.max(...columns.map((c) => c.order_index)) + 1
          : 1;
      try {
        const res = await authFetch('/admin/api/kanban_columns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, name, order_index }),
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
        const res = await authFetch(`/admin/api/kanban_columns/${id}`, {
          method: 'DELETE',
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

  useEffect(() => {
    fetchColumns();
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
