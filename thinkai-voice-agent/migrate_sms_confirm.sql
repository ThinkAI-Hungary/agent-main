-- 2026-09-24: WP-E3 — SMS-megerősítés (Twilio). STAGINGEN már lefutott
-- (Management API). PROD-deploynál KÖTELEZŐ futtatni!
CREATE TABLE IF NOT EXISTS public.sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  tenant_id UUID,
  purpose TEXT,
  to_number TEXT,
  body TEXT,
  segments INT,
  encoding TEXT,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued|dry_run|sent|delivered|undelivered|failed
  provider_sid TEXT,
  error_code INT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sms_logs_session ON public.sms_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_provider_sid ON public.sms_logs(provider_sid);

CREATE TABLE IF NOT EXISTS public.email_confirm_tokens (
  token TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tenant_id UUID,
  event_ids UUID[],
  phone TEXT,
  candidate_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_email TEXT,
  confirmed_at TIMESTAMPTZ,
  action TEXT  -- confirmed|corrected|provided
);
CREATE INDEX IF NOT EXISTS idx_email_confirm_tokens_session ON public.email_confirm_tokens(session_id);

ALTER TABLE public.email_verify_runs
  ADD COLUMN IF NOT EXISTS sms_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_status TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_email TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirm_action TEXT;
NOTIFY pgrst, 'reload schema';
