-- ═══════════════════════════════════════════════════════════════════════════════
-- EAISY Desk / ThinkAI — Management & Debug Observability Dashboard
-- Futtatás: Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Hibatábla létrehozása
CREATE TABLE IF NOT EXISTS app_error_logs (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now() NOT NULL,
  user_id     text,                         -- username vagy user ID, ha ismert (nullable)
  tenant_id   text,                         -- bérlő azonosító (pl. rivergate vagy UUID, nullable)
  error_type  text NOT NULL,                -- 'auth' | 'db_query' | 'api_call' | 'upload' | 'validation' | 'navigation' | 'unhandled' | 'frontend' | 'render' | 'worker' | 'livekit'
  severity    text DEFAULT 'error',         -- 'error' | 'warning' | 'info'
  component   text,                         -- Érintett React komponens vagy backend modul neve
  action      text,                         -- Felhasználói vagy rendszer művelet neve
  message     text NOT NULL,                -- Hibaüzenet szövege
  stack_trace text,                         -- Stack trace
  context     jsonb DEFAULT '{}',           -- Kiegészítő adatok (HTTP status, route, payload)
  url         text,                         -- URL / route ahol a hiba történt
  user_agent  text                          -- Kliens böngésző / platform
);

-- Indexek a villámgyors szűréshez és rendezéshez
CREATE INDEX IF NOT EXISTS idx_app_error_logs_created   ON app_error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_error_logs_tenant    ON app_error_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_error_logs_type      ON app_error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_app_error_logs_severity  ON app_error_logs(severity);

-- RLS bekapcsolása
ALTER TABLE app_error_logs ENABLE ROW LEVEL SECURITY;

-- Bárki (még be nem jelentkezett kliens is, pl. login hiba vagy unhandled error) beszúrhat hibát:
CREATE POLICY "Anyone can insert error logs"
  ON app_error_logs FOR INSERT
  WITH CHECK (true);

-- Olvasási és törlési jogok kizárólag a service_role-nak (FastAPI backendnek):
CREATE POLICY "Service role full access on error logs"
  ON app_error_logs FOR ALL
  USING (auth.role() = 'service_role');
