import { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '../api/client';

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
  client_id?: number | string;
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
  // Csendes háttér-poll (glitch-fix): a loading-skeleton csak az ELSŐ
  // betöltésig jelenik meg; a 30 mp-es körök a meglévő tartalom mögött futnak
  const hasData = useRef(false);

  const fetchEvents = useCallback(async () => {
    if (!hasData.current) setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/admin/api/calendar');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const evts = data?.events || data;
      const nextEvents: CalendarEvent[] = Array.isArray(evts) ? evts as CalendarEvent[] : [];
      hasData.current = true;
      // No-op szűrő: változatlan adatnál nincs újrarenderelés
      setEvents(prev => JSON.stringify(prev) === JSON.stringify(nextEvents) ? prev : nextEvents);
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
        const res = await authFetch('/admin/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        });
        if (!res.ok) return false;
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
        // Use the calendar endpoint — no dedicated delete endpoint, but events can be deleted via client operations
        const res = await authFetch(`/admin/api/calendar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ delete_id: id }),
        });
        if (!res.ok) return false;
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
    // Polling fallback instead of Supabase realtime
    const interval = setInterval(fetchEvents, 30000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  return { events, loading, error, refetch: fetchEvents, addEvent, deleteEvent };
}
