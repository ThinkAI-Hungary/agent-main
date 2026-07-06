# Adatbázis Séma — ThinkAI Voice Agent (Supabase)

**Utolsó frissítés:** 2026-07-03

## Core Táblák

### `admin_users`
Az adminisztrációs felület hozzáféréseit kezeli.
- `id`: uuid (PK)
- `username`: text (unique)
- `password_hash`: text
- `role`: text (admin, manager, member)
- `full_name`: text
- `last_login`: timestamp

### `sessions`
Egyedi beszélgetési munkamenetek (LiveKit szobák).
- `session_id`: text (PK)
- `room_name`: text
- `participant`: text (ügyfél neve, ha ismert)
- `started_at`: timestamp
- `ended_at`: timestamp
- `duration_seconds`: integer

### `interactions`
Minden ágens-interakció részletes naplója.
- `id`: bigint (PK)
- `session_id`: text (FK -> sessions)
- `type`: text (telefon, email, whatsapp, messenger, instagram)
- `topic`: text (mapped kategóriák: Sürgős, Időpont, Árkérdés, stb.)
- `summary`: text
- `result`: text
- `tool_name`: text (melyik függvényt hívta az AI)
- `funnel_stage`: text (relevant, valaszolt, ajanlat, foglalt)
- `alert_tags`: jsonb (urgent, complaint, callback, recurring)

### `calendar_events`
Időpontfoglalások.
- `id`: bigint (PK)
- `title`: text
- `start_dt`: timestamp
- `end_dt`: timestamp
- `attendee`: text
- `attendee_email`: text

### `clients` (Kanban / CRM)
Ügyféladatok és státuszok.
- `id`: bigint (PK)
- `status`: text (kanban oszlop id)
- `custom_data`: jsonb (név, telefon, forrás, orvos, szolgáltatás)

## Segéd Táblák
- `email_logs`: Kiküldött emailek és státuszuk.
- `tasks`: Belső teendők.
- `ai_insights`: Generált üzleti betekintések.
- `triage_rules`: Sürgősségi eszkalációs szabályok.
