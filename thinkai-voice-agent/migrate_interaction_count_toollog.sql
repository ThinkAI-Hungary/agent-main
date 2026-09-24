-- 2026-09-21 — a session-számláló és a reprezentatív sor kiszűri a tool-logokat
-- (book_meeting 'foglalás', lookup_info 'kérdés', check_calendar) — ezek nem önálló
-- interakciók. FIGYELEM: a csatorna-stampeket (imap_worker_ai, process_meta_message,
-- report_alert, outbound_notification) NEM szabad kizárni — azok valódi sorok!
-- (2026-09-21 hotfix: a túl tág 'tool_name IS NULL' szűrő az EMAILEKET is elrejtette.)
-- Eredeti megjegyzés: ezek nem önálló
-- interakciók, a fő beszélgetés-sor tartalmazza őket. STAGINGEN már ÉL;
-- prod-deploynál futtatandó!
-- 2026-09-24 — a JEV küldő-szűrő miatt a funnel_stage IN ('non_patient','spam')
-- sorok (szűrt feladók, spam) a csoportosításból is kikerülnek: a base rows CTE
-- (per_session) ÉS a reprezentatív sor (repr) is kizárja őket, így a számláló,
-- a reprezentatív sor és a total is tiszteletben tartja. A flat feed (get_interactions)
-- ugyanezeket a sorokat az alkalmazásoldali szűrő rejti el.
-- TELEPÍTÉS: stagingen MOST futtatandó a Management API-n keresztül; prodon a
-- következő deploy alkalmával. (A migrate futtatása nem ennek a repo-nak a része.)
CREATE OR REPLACE FUNCTION public.get_grouped_interactions(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_tenant uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH per_session AS (
  SELECT COALESCE(session_id, 'noid_' || id::text) AS gid,
    COUNT(*) FILTER (WHERE tool_name IS NULL OR tool_name NOT IN ('book_meeting','lookup_info','check_calendar')) AS interaction_count,
    MAX(created_at) AS last_created_at,
    BOOL_OR(direction IS DISTINCT FROM 'outbound') AS has_inbound
  FROM interactions
  WHERE (p_tenant IS NULL OR tenant_id = p_tenant)
  AND (funnel_stage IS NULL OR funnel_stage NOT IN ('non_patient','spam')) GROUP BY 1
),
filtered AS (
  SELECT * FROM per_session WHERE has_inbound ORDER BY last_created_at DESC LIMIT p_limit OFFSET p_offset
),
repr AS (
  SELECT DISTINCT ON (COALESCE(i.session_id, 'noid_' || i.id::text)) i.*, COALESCE(i.session_id, 'noid_' || i.id::text) AS gid
  FROM interactions i JOIN filtered f ON f.gid = COALESCE(i.session_id, 'noid_' || i.id::text)
  WHERE (p_tenant IS NULL OR i.tenant_id = p_tenant)
  AND (i.funnel_stage IS NULL OR i.funnel_stage NOT IN ('non_patient','spam'))
  AND (i.tool_name IS NULL OR i.tool_name NOT IN ('book_meeting','lookup_info','check_calendar'))
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
