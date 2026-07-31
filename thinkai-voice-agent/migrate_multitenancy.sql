-- ═══════════════════════════════════════════════════════════════════════════
-- Multi-tenant SaaS (FÁZIS 1) — tenants + tenant_credentials + tenant_id mindenhova
-- Idempotens. A prod-ra is futtatható. A backfill a meglévő adatokat a 'rivergate'
-- tenanthez rendeli.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Tenants + titkosított credential store
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'trial',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_credentials (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  value_encrypted text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_credentials ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS tenants_slug_idx ON public.tenants (slug);
CREATE INDEX IF NOT EXISTS tenant_credentials_tenant_idx ON public.tenant_credentials (tenant_id);

-- 2. tenant_id minden üzleti táblára
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'clients', 'interactions', 'sessions', 'calendar_events', 'email_logs',
    'tasks', 'triage_rules', 'text_configs', 'knowledge_base', 'business_info',
    'agent_settings', 'reminder_settings', 'campaigns', 'services', 'clinics',
    'admin_users', 'client_fields', 'kanban_columns', 'outbound_automations',
    'email_campaigns', 'email_subscribers', 'content_items', 'ai_insights',
    'processed_emails'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', t || '_tenant_idx', t);
    END IF;
  END LOOP;
END $$;

-- 3. Rivergate tenant + backfill
INSERT INTO public.tenants (slug, name, plan, active)
VALUES ('rivergate', 'Rivergate Dental & Implant Center', 'pro', true)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  rivergate_id uuid;
  t text;
  tbls text[] := ARRAY[
    'clients', 'interactions', 'sessions', 'calendar_events', 'email_logs',
    'tasks', 'triage_rules', 'text_configs', 'knowledge_base', 'business_info',
    'agent_settings', 'reminder_settings', 'campaigns', 'services', 'clinics',
    'admin_users', 'client_fields', 'kanban_columns', 'outbound_automations',
    'email_campaigns', 'email_subscribers', 'content_items', 'ai_insights',
    'processed_emails'
  ];
BEGIN
  SELECT id INTO rivergate_id FROM public.tenants WHERE slug = 'rivergate';
  FOREACH t IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('UPDATE public.%I SET tenant_id = $1 WHERE tenant_id IS NULL', t) USING rivergate_id;
    END IF;
  END LOOP;
END $$;

-- 4. admin_users.username globálisan egyedi (avatar/consent kulcsok ne ütközzenek)
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_key ON public.admin_users (username);

-- 5. get_grouped_interactions tenant-scopinggel
CREATE OR REPLACE FUNCTION public.get_grouped_interactions(p_limit int DEFAULT 100, p_offset int DEFAULT 0, p_tenant uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
WITH per_session AS (
  SELECT
    COALESCE(session_id, 'noid_' || id::text) AS gid,
    COUNT(*) AS interaction_count,
    MAX(created_at) AS last_created_at,
    MAX(CASE classification->>'statusz'
          WHEN 'Sürgős' THEN 3 WHEN 'Nyitott' THEN 2 WHEN 'Lezárt' THEN 1 ELSE 0 END) AS statusz_rank,
    BOOL_OR(direction IS DISTINCT FROM 'outbound') AS has_inbound
  FROM interactions
  WHERE (p_tenant IS NULL OR tenant_id = p_tenant)
  GROUP BY 1
),
filtered AS (
  SELECT * FROM per_session WHERE has_inbound
  ORDER BY last_created_at DESC LIMIT p_limit OFFSET p_offset
),
repr AS (
  SELECT DISTINCT ON (COALESCE(i.session_id, 'noid_' || i.id::text)) i.*,
    COALESCE(i.session_id, 'noid_' || i.id::text) AS gid
  FROM interactions i
  JOIN filtered f ON f.gid = COALESCE(i.session_id, 'noid_' || i.id::text)
  WHERE (p_tenant IS NULL OR i.tenant_id = p_tenant)
  ORDER BY gid,
    ((CASE WHEN i.classification IS NOT NULL AND i.classification <> '{}'::jsonb THEN 3 ELSE 0 END)
   + (CASE WHEN i.summary IS NOT NULL AND i.summary <> '' AND i.summary <> '-' THEN 2 ELSE 0 END)
   + (CASE WHEN i.ai_draft_response IS NOT NULL AND i.ai_draft_response <> '' THEN 1 ELSE 0 END)
   + (CASE WHEN i.type = 'telefon' THEN 1 ELSE 0 END)) DESC,
    i.created_at DESC
)
SELECT jsonb_build_object(
  'sessions', COALESCE(jsonb_agg(jsonb_build_object(
    'session_id', r.gid, 'interaction_count', f.interaction_count,
    'last_created_at', f.last_created_at,
    'session_statusz', CASE f.statusz_rank WHEN 3 THEN 'Sürgős' WHEN 2 THEN 'Nyitott' WHEN 1 THEN 'Lezárt' ELSE NULL END,
    'representative', to_jsonb(r) - 'gid'
  ) ORDER BY f.last_created_at DESC), '[]'::jsonb),
  'total', (SELECT COUNT(*) FROM per_session WHERE has_inbound)
)
FROM repr r JOIN filtered f ON f.gid = r.gid;
$$;
