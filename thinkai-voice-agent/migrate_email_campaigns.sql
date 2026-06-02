-- ═══════════════════════════════════════════════════════════════════════════════
-- EAISY Marketing — Email Campaign Tables
-- Futtatás: Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. email_campaigns (kampányok)
CREATE TABLE IF NOT EXISTS email_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  type            text NOT NULL DEFAULT 'newsletter',       -- newsletter / promotion / drip / transactional
  subject_line    text NOT NULL,
  subject_line_b  text,                                      -- A/B teszt B változat tárgysor
  template_html   text DEFAULT '',                           -- E-mail body HTML
  segment_name    text DEFAULT 'Összes feliratkozó',         -- Célcsoport szegmens neve
  status          text NOT NULL DEFAULT 'draft',             -- draft / scheduled / sending / sent / paused
  scheduled_at    timestamptz,                               -- Ütemezett küldés ideje
  sent_at         timestamptz,                               -- Tényleges küldés ideje
  brevo_campaign_id text,                                    -- Brevo kampány ID (API-ból)
  stats           jsonb DEFAULT '{"opens":0,"clicks":0,"bounces":0,"unsubscribes":0,"delivered":0}',
  recipients_count integer DEFAULT 0,
  created_by      text DEFAULT 'admin',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 2. email_subscribers (feliratkozók)
CREATE TABLE IF NOT EXISTS email_subscribers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  name            text DEFAULT '',
  status          text NOT NULL DEFAULT 'active',            -- active / unsubscribed / bounced / complained
  consent_date    timestamptz DEFAULT now(),                  -- GDPR hozzájárulás dátuma
  consent_source  text DEFAULT 'manual',                     -- Honnan iratkozott fel
  tags            text[] DEFAULT '{}',                        -- Címkék
  brevo_contact_id text,                                     -- Brevo kontakt ID
  created_at      timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_email ON email_subscribers(email);

-- RLS policies
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for email_campaigns" ON email_campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for email_subscribers" ON email_subscribers FOR ALL USING (true) WITH CHECK (true);

-- Indexek
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created ON email_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON email_subscribers(status);
