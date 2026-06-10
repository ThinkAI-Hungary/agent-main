import { useState, useEffect, useCallback } from 'react';
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
      const res = await authFetch('/admin/api/calendar');
      const data = await res.json();
      setEvents(data.events || []);
    } catch (e) {
      if ((e as Error).message !== 'Unauthorized') {
        setError('Hiba a naptári események betöltésekor');
      }
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
        const res = await authFetch(`/admin/api/calendar/${id}`, {
          method: 'DELETE',
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
  }, [fetchEvents]);

  return { events, loading, error, refetch: fetchEvents, addEvent, deleteEvent };
}
