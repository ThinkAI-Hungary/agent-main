-- 2026-09-24: lezárási/befejezési időbélyegek a dashboard „Ma elvégzett" szekciójához
-- (interactions.closed_at a lezárt interakciókhoz, tasks.completed_at a kézi teendőkhöz)
-- STAGINGEN már lefutott (Management API). PROD-deploynál KÖTELEZŐ futtatni!
ALTER TABLE public.interactions ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
NOTIFY pgrst, 'reload schema';
