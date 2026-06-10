import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface CalendarEvent {
  id?: number | string;
  title?: string;
  attendee?: string;
  attendee_email?: string;
  attendee_phone?: string;
  start_dt?: string;
  end_dt?: string;
  duration_minutes?: number;
  doctor?: string;
  reminder_sent?: boolean;
}

interface UseCalendarEventsReturn {
  events: CalendarEvent[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addEvent: (event: Partial<CalendarEvent>) => Promise<boolean>;
  deleteEvent: (id: number | string) => Promise<boolean>;
}

export function useCalendarEvents(): UseCalendarEventsReturn {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: sbError } = await supabase
        .from('calendar_events')
        .select('id, title, attendee, attendee_email, attendee_phone, start_dt, end_dt, duration_minutes, doctor, reminder_sent')
        .order('start_dt', { ascending: true });

      if (sbError) throw sbError;

      setEvents((data || []) as CalendarEvent[]);
    } catch (e) {
      setError('Hiba a naptári események betöltésekor');
      console.error('useCalendarEvents error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const addEvent = useCallback(
    async (event: Partial<CalendarEvent>): Promise<boolean> => {
      try {
        const { error } = await supabase.from('calendar_events').insert(event);
        if (error) return false;
        // Realtime will handle refresh, but also do manual for safety
        await fetchEvents();
        return true;
      } catch {
        return false;
      }
    },
    [fetchEvents]
  );

  const deleteEvent = useCallback(
    async (id: number | string): Promise<boolean> => {
      try {
        const { error } = await supabase.from('calendar_events').delete().eq('id', id);
        if (error) return false;
        await fetchEvents();
        return true;
      } catch {
        return false;
      }
    },
    [fetchEvents]
  );

  useEffect(() => {
    fetchEvents();

    const channel = supabase
      .channel('calendar-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => {
        fetchEvents();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEvents]);

  return { events, loading, error, refetch: fetchEvents, addEvent, deleteEvent };
}
