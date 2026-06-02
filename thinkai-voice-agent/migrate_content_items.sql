-- Content Items tábla az AI Tartalom & Social Média modulhoz
-- EAISY Marketing specifikáció v1 - 2.5 szekció

CREATE TABLE IF NOT EXISTS content_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL DEFAULT 'Új tartalom',
    type text NOT NULL DEFAULT 'social_post',
    body text DEFAULT '',
    hashtags text[] DEFAULT '{}',
    image_url text DEFAULT '',
    image_description text DEFAULT '',
    keywords text[] DEFAULT '{}',
    status text NOT NULL DEFAULT 'requested',
    ai_prompt text DEFAULT '',
    target_platforms text[] DEFAULT '{instagram}',
    published_at timestamptz,
    published_platforms text[] DEFAULT '{}',
    ig_media_id text,
    engagement_stats jsonb DEFAULT '{}',
    created_by text DEFAULT 'admin',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- RLS policy (ha szükséges)
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON content_items FOR ALL USING (true) WITH CHECK (true);
