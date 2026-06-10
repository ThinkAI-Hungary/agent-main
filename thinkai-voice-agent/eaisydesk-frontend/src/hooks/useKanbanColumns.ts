import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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
      const { data, error: sbError } = await supabase
        .from('kanban_columns')
        .select('id, name, order_index')
        .order('order_index', { ascending: true });

      if (sbError) throw sbError;

      setColumns((data || []) as KanbanColumn[]);
    } catch (e) {
      setError('Hiba az oszlopok betöltésekor');
      console.error('useKanbanColumns error:', e);
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
        const { error } = await supabase.from('kanban_columns').insert({ id, name, order_index });
        if (error) return false;
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
        const { error } = await supabase.from('kanban_columns').update({ name }).eq('id', id);
        if (error) return false;
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
        const { error } = await supabase.from('kanban_columns').delete().eq('id', id);
        if (error) return false;
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

    const channel = supabase
      .channel('kanban-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_columns' }, () => {
        fetchColumns();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
