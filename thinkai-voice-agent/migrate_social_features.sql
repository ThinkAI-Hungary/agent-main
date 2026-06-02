-- Marketing Social Media - Column Migration
-- Run this in Supabase SQL Editor

ALTER TABLE content_items ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS image_prompt text DEFAULT '';
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS fb_post_id text DEFAULT '';
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS ai_model text DEFAULT '';
