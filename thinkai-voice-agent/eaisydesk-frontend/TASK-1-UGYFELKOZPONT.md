# Fél 1 -- Ügyfélközpont migráció

## Áttekintés

A legacy Ügyfélközpont (Interakciók, Ügyféllista, Kanban) migrálása React + Vite + TypeScript-re.
**Fontos**: az olvasás közvetlenül Supabase JS klienssel történik, NEM a FastAPI-n keresztül.

## Architekturális irányelv

```
React frontend  --olvasás-->  Supabase (közvetlen, @supabase/supabase-js)
FastAPI backend --írás--->    Supabase (feldolgozott adatok: interakciók, session-ök)
```

- A frontend SOHA nem hív `authFetch()` GET kéréseket ezekhez a táblákhoz
- Helyette: `supabase.from('interactions').select('*').order('created_at', { ascending: false })`
- A FastAPI továbbra is ír (webhook-ok, hívás feldolgozás, email feldolgozás), de a frontend közvetlenül olvas

## Előfeltétel: Supabase kliens beállítása

Mielőtt bármit csinálnál, hozd létre:

### `src/lib/supabase.ts`
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### `.env` (eaisydesk-frontend gyökérben)
```
VITE_SUPABASE_URL=https://dsiluafthysysnstszbd.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...  (az anon key a thinkai-voice-agent/.env-ből)
```

### npm install
```bash
npm install @supabase/supabase-js
```

### RLS (Row Level Security)
Az `anon` key-jel való hozzáféréshez RLS policy kell minden táblára:
```sql
-- Példa: interactions olvasása bárki számára aki anon key-jel csatlakozik
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for anon" ON interactions FOR SELECT USING (true);
```
**Megjegyzés**: Később finomítandó role-alapú RLS-re (admin/manager/member).

---

## Feladatok

### 1. Supabase kliens infrastruktúra
- [ ] `@supabase/supabase-js` telepítése
- [ ] `src/lib/supabase.ts` létrehozása
- [ ] `.env` fájl a frontend gyökérben (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- [ ] RLS policy-k alkalmazása: `interactions`, `sessions`, `clients`, `kanban_columns`

### 2. InteractionsPage (`/interactions`)
- [ ] Legacy forrás áttanulmányozása:
  - HTML: `partials/page-interactions.html` (65KB, közös a 3 oldallal)
  - JS: `js/admin-interactions.js` (41KB)
- [ ] API endpointok azonosítása és Supabase query-re cserélése:
  - `GET /admin/api/interactions` -> `supabase.from('interactions').select('*')`
  - Szűrők: dátum, csatorna, típus, klinnika
- [ ] React komponensek:
  - `InteractionsPage.tsx` -- fő oldal: szűrő sor + táblázat
  - `InteractionRow.tsx` -- egy sor a táblában
  - `InteractionDetailModal.tsx` -- részletes nézet (transcript, AI összefoglaló)
- [ ] Gyökér div: `<div className="page active" id="page-interactions">`
- [ ] Route hozzáadása App.tsx-ben: `<Route path="interactions" element={<InteractionsPage />} />`

### 3. ClientsPage (`/clients`)
- [ ] Legacy forrás:
  - JS: `js/admin-customers.js` (112KB) -- a legnagyobb fájl
- [ ] Supabase query-k:
  - `supabase.from('clients').select('*').order('created_at', { ascending: false })`
  - Keresés: `.ilike('name', '%searchterm%')`
- [ ] React komponensek:
  - `ClientsPage.tsx` -- ügyfél lista, keresés, szűrők
  - `ClientDetailModal.tsx` -- profil nézet, interakció történet, jegyzet
  - `ClientEditForm.tsx` -- szerkesztés
- [ ] Scope tabs: "Saját ügyfeleim" / "Összes" (role-alapú, mint a naptárnál)
- [ ] Route: `<Route path="clients" element={<ClientsPage />} />`

### 4. KanbanPage (`/kanban`)
- [ ] Legacy forrás:
  - JS: `js/admin-kanban.js` (75KB)
- [ ] Supabase query-k:
  - `supabase.from('clients').select('*').order('kanban_order')`
  - `supabase.from('kanban_columns').select('*').order('position')`
- [ ] React komponensek:
  - `KanbanPage.tsx` -- oszlopok + kártyák
  - `KanbanColumn.tsx` -- egy oszlop
  - `KanbanCard.tsx` -- egy kártya
- [ ] Drag-and-drop: `@dnd-kit/core` vagy natív HTML5 DnD
- [ ] Írás (kártya mozgatás): ez maradhat `authFetch` POST/PATCH amíg a FastAPI kezeli
- [ ] Route: `<Route path="kanban" element={<KanbanPage />} />`

---

## Supabase táblák (olvasás)

| Tábla | Használó oldal | Szűrők |
| --- | --- | --- |
| `interactions` | Interakciók, Ügyfelek (történet) | dátum, csatorna, session_id, klinnika |
| `sessions` | Interakciók (session részletek) | session_id, dátum |
| `clients` | Ügyfelek, Kanban | név keresés, assigned_to, kanban_column |
| `kanban_columns` | Kanban | position |

## Konvenciók

- Olvasd el a `README.md`-t a gyökérben -- minden konvenció ott van
- Magyar ékezetek kötelezőek a UI szövegekben
- 1:1 vizuális paritás a legacy verzióval
- Dark mode tesztelés kötelező
- `npx tsc --noEmit` -- 0 hiba
