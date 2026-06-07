-- DigiDesk: Manager role hozzáadása az admin_users táblához
-- Futtasd ezt a Supabase Dashboard SQL Editor-ban

-- 1. Régi constraint eltávolítása és új hozzáadása (admin/manager/member)
ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check CHECK (role IN ('admin', 'manager', 'member'));

-- 2. full_name oszlop biztosítása (ha még nem létezik)
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT '';
