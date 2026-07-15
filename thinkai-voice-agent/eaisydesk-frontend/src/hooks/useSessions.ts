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
  classification?: {
    ugytipus?: string;
    idopont_altipus?: string | null;
    detected_types?: string[] | null;   // EAISY-241 §2.2 — összes felismert típus (badge-ekhez)
    eredmeny?: string;
    statusz?: string;
    teendo?: string;
    osszefoglalas?: string;
    autonomous?: boolean;               // EAISY-241 §1.1.2 — jóváhagyás UI gate
    restriction?: string;
  } | null;
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

/**
 * Fetches interaction_list data via backend API, then groups by session_id.
 * Uses polling for auto-refresh instead of Supabase realtime.
 */
export function useSessions(limit = 100): UseSessionsReturn {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/admin/api/interactions?limit=${limit * 5}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const rows = data?.interactions || data;

      if (!Array.isArray(rows)) {
        setSessions([]);
        return;
      }

      // Group by session_id to build SessionSummary objects
      const sessionMap = new Map<string, SessionSummary>();
      
      for (const row of rows) {
        const sid = row.session_id || `standalone-${row.id}`;
        
        if (!sessionMap.has(sid)) {
          sessionMap.set(sid, {
            session_id: sid,
            room_name: row.room_name,
            participant: row.participant || row.client_name,
            client_name: row.client_name,
            started_at: row.session_started_at || row.created_at,
            summary: row.summary,
            channel: row.type,
            interactions: [],
          });
        }
        
        sessionMap.get(sid)!.interactions!.push({
          id: row.id,
          created_at: row.created_at,
          type: row.type,
          topic: row.topic,
          summary: row.summary,
          result: row.result,
          direction: row.direction,
          client_id: row.client_id,
          approval_status: row.approval_status,
          handover_reason: row.handover_reason,
          ai_draft_response: row.ai_draft_response,
          alert_tags: row.alert_tags,
          funnel_stage: row.funnel_stage,
          classification: row.classification,
        });
      }

      const result = Array.from(sessionMap.values()).slice(0, limit);
      setSessions(result);
    } catch (e) {
      setError('Hiba az interakciók betöltésekor');
      console.error('useSessions error:', e);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchSessions();
    // Polling fallback instead of Supabase realtime
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  return { sessions, loading, error, refetch: fetchSessions };
}
