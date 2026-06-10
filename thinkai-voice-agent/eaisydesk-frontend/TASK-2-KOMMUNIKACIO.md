# Fél 2 -- Kommunikáció & Naptár migráció

## Áttekintés

A Naptár, Kimenő kommunikáció és Hívások oldalak migrálása React + Vite + TypeScript-re.
**Fontos**: az olvasás közvetlenül Supabase JS klienssel történik, NEM a FastAPI-n keresztül.

## Architekturális irányelv

```
React frontend  --olvasás-->  Supabase (közvetlen, @supabase/supabase-js)
FastAPI backend --írás--->    Supabase (email küldés, hívás indítás, kampány végrehajtás)
```

- Olvasás: `supabase.from('calendar_events').select('*')` -- közvetlen
- Írás (pl. új esemény létrehozása, kampány indítása): `authFetch()` POST a FastAPI-hoz, mert üzleti logika kell hozzá
- A Supabase kliens beállítása a Fél 1 feladata -- ha az még nem kész, csináld meg te (lásd TASK-1 előfeltétel szekció)

---

## Feladatok

### 1. CalendarPage (`/calendar`)
- [ ] Legacy forrás áttanulmányozása:
  - HTML: `partials/page-calendar.html` (8KB)
  - JS: `js/admin-calendar.js` (18KB)
- [ ] Supabase query-k:
  - `supabase.from('calendar_events').select('*').order('start_dt', { ascending: true })`
  - Scope szűrés: "Saját ügyfeleim" / "Összes" (assigned_to mező)
- [ ] React komponensek:
  - `CalendarPage.tsx` -- fő oldal: lista/rács nézet váltó
  - `CalendarListView.tsx` -- táblázat nézet
  - `CalendarGridView.tsx` -- FullCalendar integráció
  - `NewEventModal.tsx` -- új esemény létrehozása (ez authFetch POST marad)
- [ ] FullCalendar integráció:
  ```bash
  npm install @fullcalendar/core @fullcalendar/react @fullcalendar/timegrid @fullcalendar/daygrid
  ```
  - Magyar lokalizáció (`locale: 'hu'`)
  - Heti nézet alapértelmezett, 07:00-20:00 slot
  - Dupla kattintás -> ügyfél profil megnyitása (navigáció /clients-re)
- [ ] No-show gomb: `authFetch` POST (marad FastAPI, mert üzleti logika)
- [ ] Route: `<Route path="calendar" element={<CalendarPage />} />`

### 2. OutboundPage (`/outbound`)
- [ ] Legacy forrás:
  - HTML: `partials/page-outbound.html` (13KB)
  - JS: `js/admin-outbound.js` (87KB) -- nagyon nagy, kampány wizard
- [ ] Supabase query-k (olvasás):
  - `supabase.from('outbound_automations').select('*')`
  - `supabase.from('automation_sent_log').select('*').eq('automation_id', id)`
  - `supabase.from('email_campaigns').select('*')`
- [ ] React komponensek:
  - `OutboundPage.tsx` -- fő oldal: automatizációk lista, kampányok
  - `AutomationCard.tsx` -- egy automatizáció kártya
  - `CampaignWizardModal.tsx` -- új kampány létrehozás wizard
  - `TemplateEditor.tsx` -- sablon szerkesztő
- [ ] Írás (kampány indítás, sablon mentés): `authFetch` POST/PUT marad
- [ ] Route: `<Route path="outbound" element={<OutboundPage />} />`

### 3. CallsPage (új route: `/calls`)
- [ ] Legacy forrás:
  - HTML: `partials/page-calls.html` (7KB)
  - JS: `js/admin-core.js` -- `startCall()` függvény
- [ ] Ez szerver-oldali marad (SIP/LiveKit):
  - Hívás indítása: `authFetch` POST a FastAPI-hoz
  - Hívás állapot: `authFetch` GET
- [ ] Supabase olvasás:
  - `supabase.from('sessions').select('*').eq('room_name', ...)` -- hívás történet
- [ ] React komponensek:
  - `CallsPage.tsx` -- hívás indítás form, aktív hívások, történet
- [ ] Route hozzáadása App.tsx-ben + Sidebar NAV_ITEMS-ben
- [ ] Admin-only: `adminOnly: true` a sidebar bejegyzésnél

---

## Supabase táblák (olvasás)

| Tábla | Használó oldal | Megjegyzés |
| --- | --- | --- |
| `calendar_events` | Naptár | start_dt, attendee, duration |
| `outbound_automations` | Kimenő | automatizáció szabályok |
| `automation_sent_log` | Kimenő | küldési napló |
| `email_campaigns` | Kimenő | kampány adatok |
| `sessions` | Hívások | SIP session történet |
| `email_logs` | Kimenő (statisztika) | email küldési napló |

## RLS policy-k

```sql
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for anon" ON calendar_events FOR SELECT USING (true);

ALTER TABLE outbound_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for anon" ON outbound_automations FOR SELECT USING (true);

ALTER TABLE automation_sent_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for anon" ON automation_sent_log FOR SELECT USING (true);
```

## Konvenciók

- Olvasd el a `README.md`-t -- minden konvenció ott van
- Magyar ékezetek kötelezőek
- 1:1 vizuális paritás a legacy verzióval
- FullCalendar-nél a legacy `admin-calendar.js` logikát pontosan reprodukáld
- `npx tsc --noEmit` -- 0 hiba
