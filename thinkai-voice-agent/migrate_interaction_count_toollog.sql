-- 2026-09-21 — a session-számláló és a reprezentatív sor kiszűri a tool-logokat
-- (book_meeting 'foglalás', lookup_info 'kérdés' stb.) — ezek nem önálló
-- interakciók, a fő beszélgetés-sor tartalmazza őket. STAGINGEN már ÉL;
-- prod-deploynál futtatandó!
CREATE OR REPLACE FUNCTION public.get_grouped_interactions(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_tenant uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH per_session AS (
  SELECT COALESCE(session_id, 'noid_' || id::text) AS gid,
    COUNT(*) FILTER (WHERE tool_name IS NULL) AS interaction_count,
    MAX(created_at) AS last_created_at,
    BOOL_OR(direction IS DISTINCT FROM 'outbound') AS has_inbound
  FROM interactions WHERE (p_tenant IS NULL OR tenant_id = p_tenant) GROUP BY 1
),
filtered AS (
  SELECT * FROM per_session WHERE has_inbound ORDER BY last_created_at DESC LIMIT p_limit OFFSET p_offset
),
repr AS (
  SELECT DISTINCT ON (COALESCE(i.session_id, 'noid_' || i.id::text)) i.*, COALESCE(i.session_id, 'noid_' || i.id::text) AS gid
  FROM interactions i JOIN filtered f ON f.gid = COALESCE(i.session_id, 'noid_' || i.id::text)
  WHERE (p_tenant IS NULL OR i.tenant_id = p_tenant)
  AND i.tool_name IS NULL
  ORDER BY gid, i.created_at DESC
)
SELECT jsonb_build_object(
  'sessions', COALESCE(jsonb_agg(jsonb_build_object(
    'session_id', r.gid, 'interaction_count', f.interaction_count,
    'last_created_at', f.last_created_at,
    'session_statusz', r.classification->>'statusz',
    'representative', to_jsonb(r) - 'gid'
  ) ORDER BY f.last_created_at DESC), '[]'::jsonb),
  'total', (SELECT COUNT(*) FROM per_session WHERE has_inbound)
) FROM repr r JOIN filtered f ON f.gid = r.gid;
$function$
