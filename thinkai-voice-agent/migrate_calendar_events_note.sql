-- 2026-09-22: szabad megjegyzés mező a naptáreseményekhez (kézi popup, tétel #1)
-- STAGINGEN már lefutott (Management API). PROD-deploynál KÖTELEZŐ futtatni!
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS note text;
