import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../api/client';

export interface SessionInteraction {
  id?: number;
  created_at?: string;
  type?: string;
  topic?: string;
  summary?: string;
  result?: string;
  direction?: string;
  client_id?: number | string;
  approval_status?: string;
  handover_reason?: string;
  ai_draft_response?: string;
  alert_tags?: string[];
  funnel_stage?: string;
}

export interface SessionSummary {
  session_id?: string;
  room_name?: string;
  participant?: string;
  client_name?: string;
  started_at?: string;
  summary?: string;
  channel?: string;
  interactions?: SessionInteraction[];
}

interface UseSessionsReturn {
  sessions: SessionSummary[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSessions(limit = 100): UseSessionsReturn {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/admin/api/sessions/summary?limit=${limit}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (e) {
      if ((e as Error).message !== 'Unauthorized') {
        setError('Hiba az interakciók betöltésekor');
      }
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return { sessions, loading, error, refetch: fetchSessions };
}
