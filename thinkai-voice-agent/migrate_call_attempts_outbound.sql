-- 2026-10-09 — Kimenő hívások megbízhatósága (research-jelentés alapján):
-- (1) call_attempts: MINDEN kimenő hívási kísérlet rögzítése eredménnyel
--     (answered | no_answer | rejected | rejected_whitelist | busy |
--      invalid_number | failed) — eddig a sikertelen kampány-hívások DB
--     nélkül 'elillantak', a kampány pedig 'Befejezett'-re állt.
-- (2) get_grouped_interactions RPC: a tisztán KIMENŐ hívás-sessionök (kampány-
--     leiratok) NE szűrődjenek ki a listanézetből — a régi has_inbound
--     szűrő (direction IS DISTINCT FROM 'outbound') a tool-logokra gondolt,
--     de a valódi kimenő hívásokat is elrejtette. Az új has_visible azoknál
--     a sessionöknél igaz, amelyekben van NEM tool-log interakció.
-- TELEPÍTÉS: stagingen MOST (Management API); prodon a következő deploy
-- jóváhagyásával. NOTIFY pgrst az RPC miatt KÖTELEZŐ.

CREATE TABLE IF NOT EXISTS public.call_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID,
  campaign_id INT,
  client_id INT,
  session_id TEXT,
  phone TEXT NOT NULL,
  scenario TEXT NOT NULL DEFAULT 'campaign',   -- campaign | script | reminder | callback
  result TEXT NOT NULL,                        -- answered | no_answer | busy | rejected | rejected_whitelist | invalid_number | failed
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_call_attempts_tenant_day
  ON public.call_attempts (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_attempts_campaign
  ON public.call_attempts (campaign_id, client_id);
ALTER TABLE public.call_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_grouped_interactions(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_tenant uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH per_session AS (
  SELECT COALESCE(session_id, 'noid_' || id::text) AS gid,
    COUNT(*) FILTER (WHERE tool_name IS NULL OR tool_name NOT IN ('book_meeting','lookup_info','check_calendar')) AS interaction_count,
    MAX(created_at) AS last_created_at,
    BOOL_OR(tool_name IS NULL OR tool_name NOT IN ('book_meeting','lookup_info','check_calendar')) AS has_visible
  FROM interactions
  WHERE (p_tenant IS NULL OR tenant_id = p_tenant)
  AND (funnel_stage IS NULL OR funnel_stage NOT IN ('non_patient','spam')) GROUP BY 1
),
filtered AS (
  SELECT * FROM per_session WHERE has_visible ORDER BY last_created_at DESC LIMIT p_limit OFFSET p_offset
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
  'total', (SELECT COUNT(*) FROM per_session WHERE has_visible)
) FROM repr r JOIN filtered f ON f.gid = r.gid;
$function$;

NOTIFY pgrst, 'reload schema';
