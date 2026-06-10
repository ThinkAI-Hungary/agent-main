import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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

/**
 * Reads directly from the interaction_list view which pre-joins
 * sessions + interactions + clients, then groups by session_id.
 * Subscribes to realtime changes on both sessions and interactions tables.
 */
export function useSessions(limit = 100): UseSessionsReturn {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: sbError } = await supabase
        .from('interaction_list')
        .select('id, session_id, room_name, participant, client_name, session_started_at, created_at, type, topic, summary, result, direction, client_id, approval_status, handover_reason, ai_draft_response, alert_tags, funnel_stage')
        .order('created_at', { ascending: false })
        .limit(limit * 5);

      if (sbError) throw sbError;

      // Group by session_id to build SessionSummary objects
      const sessionMap = new Map<string, SessionSummary>();
      
      for (const row of (data || [])) {
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

    // Realtime: refresh when interactions or sessions change
    const channel = supabase
      .channel('sessions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions' }, () => {
        fetchSessions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        fetchSessions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSessions]);

  return { sessions, loading, error, refetch: fetchSessions };
}
