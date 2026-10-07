-- 2026-09-23: Foglalási mód (booking mode) — „Időponttal kapcsolatos ügyek kezelése"
-- auto = önálló időpontkezelés | handoff = csak igényrögzítés és átadás
-- custom = műveletenkénti beállítás | none = nem kérhető időpont
-- STAGINGEN lefutott (Management API). PROD-deploynál KÖTELEZŐ futtatni!
-- 2026-10-07 HOTFIX: a booking_needs default '[]'::jsonb (TÖMB) volt — a pydantic
-- dict-et vár, így a régi sorokból GET→POST körben 422-es mentési hiba lett
-- (prod: „Hiba mentéskor" a nagy CTA-ra). Default '{}'::jsonb + a régi
-- tömb-értékek objectre normalizálása (az UPDATE idempotens).
ALTER TABLE public.business_info ADD COLUMN IF NOT EXISTS booking_mode text DEFAULT 'auto';
ALTER TABLE public.business_info ADD COLUMN IF NOT EXISTS booking_custom jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.business_info ADD COLUMN IF NOT EXISTS booking_needs jsonb DEFAULT '{}'::jsonb;
UPDATE public.business_info SET booking_needs = '{}'::jsonb WHERE jsonb_typeof(booking_needs) <> 'object';
