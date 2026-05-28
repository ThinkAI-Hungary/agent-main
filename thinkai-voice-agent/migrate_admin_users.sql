-- DigiDesk: Admin Users tábla bővítés
-- Futtasd ezt a Supabase Dashboard SQL Editor-ban

-- 1. Új oszlopok hozzáadása
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'member'));
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT '';
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- 2. Meglévő admin user frissítése
UPDATE admin_users SET role = 'admin', created_by = 'system' WHERE role IS NULL;
