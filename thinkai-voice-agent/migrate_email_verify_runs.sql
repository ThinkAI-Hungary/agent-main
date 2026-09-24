-- 2026-09-24: WP-E2 MU-0.2 — hívásonkénti futás-napló az email-ellenőrző
-- harnesshez. A két tesztelő ugyanarról a számról hív, így a clients-sori
-- audit felülíródna — a baseline verdiktek itt maradnak hívásonként kereshetően.
-- STAGINGEN már lefutott (Management API). PROD-deploynál KÖTELEZŐ futtatni!
CREATE TABLE IF NOT EXISTS public.email_verify_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  tenant_id UUID,
  caller_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mode TEXT NOT NULL DEFAULT 'live',                -- live | replay
  pipeline_version TEXT NOT NULL DEFAULT 'baseline',-- baseline | wp-e2
  readings JSONB,
  gate JSONB,
  audio_detail JSONB,
  timings_ms JSONB,
  winner TEXT,
  verdict TEXT,
  audio_qc JSONB,
  ground_truth TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_verify_runs_session ON public.email_verify_runs(session_id);
CREATE INDEX IF NOT EXISTS idx_email_verify_runs_created ON public.email_verify_runs(created_at);
ALTER TABLE public.email_verify_runs ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
