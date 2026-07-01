-- ============================================================
-- eaisyDesk: Migrate file-based settings to Supabase
-- Run this in the Supabase SQL Editor BEFORE deploying code.
-- ============================================================

-- 1. Agent Settings (voice, tone, greeting, language, business hours)
CREATE TABLE IF NOT EXISTS agent_settings (
  id               INTEGER PRIMARY KEY DEFAULT 1,
  voice_id         TEXT DEFAULT 'Puck',
  tone             TEXT DEFAULT 'professional_friendly',
  tone_custom      TEXT DEFAULT '',
  greeting         TEXT DEFAULT '',
  language         TEXT DEFAULT 'hu',
  business_hours   JSONB DEFAULT '{}'::jsonb,
  knowledge_format TEXT DEFAULT 'json',
  updated_at       TIMESTAMPTZ DEFAULT now()
);
INSERT INTO agent_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 2. Practice Info (company metadata, FAQ, exceptions, etc.)
CREATE TABLE IF NOT EXISTS praxis_info (
  id                         INTEGER PRIMARY KEY DEFAULT 1,
  practice_name              TEXT DEFAULT '',
  description                TEXT DEFAULT '',
  address                    TEXT DEFAULT '',
  markanev                   TEXT DEFAULT '',
  szakterulet                TEXT DEFAULT '',
  kulcsszavak                TEXT DEFAULT '',
  megkozelites               TEXT DEFAULT '',
  price_list                 TEXT DEFAULT '',
  price_list_file_meta       JSONB DEFAULT '{}'::jsonb,
  doctors                    JSONB DEFAULT '[]'::jsonb,
  campaigns                  JSONB DEFAULT '[]'::jsonb,
  exceptions                 JSONB DEFAULT '[]'::jsonb,
  faq                        JSONB DEFAULT '[]'::jsonb,
  modositas_eng              TEXT DEFAULT 'igen',
  lemondas_24h               TEXT DEFAULT 'figyelmeztetoSzoveggel',
  figyelmezteto_szoveg       TEXT DEFAULT '',
  pacient_id_question        TEXT DEFAULT '',
  new_patient_required       TEXT DEFAULT '',
  new_patient_auto_visit     BOOLEAN DEFAULT true,
  returning_patient_required TEXT DEFAULT '',
  service_description        TEXT DEFAULT '',
  updated_at                 TIMESTAMPTZ DEFAULT now()
);
INSERT INTO praxis_info (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 3. Knowledge Base (format + content)
CREATE TABLE IF NOT EXISTS knowledge_base (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  format     TEXT DEFAULT 'json',
  content    TEXT DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO knowledge_base (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 4. Text Configs (system_prompt, workflow — key/value)
CREATE TABLE IF NOT EXISTS text_configs (
  key        TEXT PRIMARY KEY,
  content    TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO text_configs (key, content) VALUES ('system_prompt', '') ON CONFLICT DO NOTHING;
INSERT INTO text_configs (key, content) VALUES ('workflow', '') ON CONFLICT DO NOTHING;
