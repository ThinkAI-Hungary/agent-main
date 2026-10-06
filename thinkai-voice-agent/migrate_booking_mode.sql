-- 2026-09-23: Foglalási mód (booking mode) — „Időponttal kapcsolatos ügyek kezelése"
-- auto = önálló időpontkezelés | handoff = csak igényrögzítés és átadás
-- custom = műveletenkénti beállítás | none = nem kérhető időpont
-- STAGINGEN lefutott (Management API). PROD-deploynál KÖTELEZŐ futtatni!
ALTER TABLE public.business_info ADD COLUMN IF NOT EXISTS booking_mode text DEFAULT 'auto';
ALTER TABLE public.business_info ADD COLUMN IF NOT EXISTS booking_custom jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.business_info ADD COLUMN IF NOT EXISTS booking_needs jsonb DEFAULT '[]'::jsonb;
