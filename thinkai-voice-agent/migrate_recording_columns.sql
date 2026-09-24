-- 2026-09-24: hívásrögzítés (WP D) — sessions.recording_url a storage-út a privát
-- 'recordings' bucketben (30 napos retention nullázza), interactions.transcript_turns
-- a turnusonkénti {role,text,start_s} JSON a bubble-szintű audio seekhez.
-- STAGINGEN már lefutott (Management API). PROD-deploynál KÖTELEZŐ futtatni!
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE public.interactions ADD COLUMN IF NOT EXISTS transcript_turns JSONB;
NOTIFY pgrst, 'reload schema';
