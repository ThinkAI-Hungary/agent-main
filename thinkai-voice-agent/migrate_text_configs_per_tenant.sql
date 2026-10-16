-- 2026-10-16 — Mauroni multi-tenant incidens: a text_configs GLOBÁLIS volt
-- (PRIMARY KEY (key) — környezetenként egy sor), így pl. a kizárt-feladók
-- listája minden tenantnál ugyanaz látszott ÉS ugyanaz a lista érvényesült a
-- feldolgozásukra is (a Mauroni ügyfél a Rivergate Dental listáját látta).
-- Most kompozit (key, tenant_id) kulcs → minden tenant saját sorai.
-- STAGINGEN lefutott; PROD-deploynál futtatandó (upsert: PostgREST a PK-t
-- találja — a payload tartalmazza a key+tenant_id-t).
ALTER TABLE public.text_configs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.text_configs DROP CONSTRAINT text_configs_pkey;
ALTER TABLE public.text_configs ADD PRIMARY KEY (key, tenant_id);
NOTIFY pgrst, 'reload schema';
