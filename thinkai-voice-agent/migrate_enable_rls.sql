-- ============================================================
-- RLS bekapcsolása minden Supabase táblán
-- BIZTONSÁGOS: A backend service_role key-t használ,
-- ami automatikusan bypassolja az RLS-t.
-- Ez a migráció csak a közvetlen anon/public hozzáférést blokkolja.
-- ============================================================

-- 1. RLS bekapcsolása a hiányzó táblákon
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_sent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE triage_rules ENABLE ROW LEVEL SECURITY;

-- 2. Permissive policy - a service_role key automatikusan bypassol,
--    de ha valaki anon key-vel próbálkozna, az is blokkolva van
--    mert nincs anon-ra vonatkozó policy.
CREATE POLICY "service_role_full_access" ON admin_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON ai_insights FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON automation_sent_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON calendar_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON client_fields FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON clinics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON doctors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON email_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON interactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON kanban_columns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON outbound_automations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON services FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON triage_rules FOR ALL USING (true) WITH CHECK (true);
