# eaisydesk-frontend — React + Vite + Supabase

> **Status**: Migráció befejezve (2026-06-10). Minden oldal React + Vite + TypeScript.  
> Adatelérés: közvetlen Supabase (olvasás + írás), FastAPI csak komplex szerver-oldali logikához.

### Legutóbbi módosítások (2026-06-10)
- **Settings / Agent Mentés API javítás**: Megoldva a `/admin/api/settings` végponton jelentkező HTTP 400 hiba az üres tudástár-tartalom kezelésénél (`web_server.py` JSONDecodeError javítás).
- **Settings DB Szinkronizáció**: A `SettingsPage.tsx` mentési folyamata (`saveAgent`, `savePraxis`) mostantól közvetlenül is szinkronizálja a beállításokat a Supabase `app_settings` táblájába a helyi JSON fájlok mentése mellett.
- **Jogosultságkezelés**: A `BeallitasokPage.tsx` oldalon a Csapat (Team) tab elrejtésre került a `member` (sima felhasználó) szerepkörű fiókok elől.
- **Kampány Analitika (Chart.js)**: Az `OutboundPage.tsx` oldalon a korábbi statikus progress bar-ok helyett egy teljesen interaktív analitikai panel készült 4 interaktív Chart.js diagrammal (Státusz eloszlás, Csatorna használat, Célzott ügyfelek és Létrehozási idővonal) és összesítő statisztikákkal.
- **Fejléc optimalizálás**: Az `AppLayout.tsx` módosításával a `MainHeader` (üdvözlő kártya) mostantól kizárólag a főoldalon/analitika oldalon jelenik meg, megszüntetve a vizuális redundanciát a többi oldalon.
- **Árlista feltöltés**: Integrálásra került az Excel (XLSX) és CSV árlisták feltöltése, valamint minta-sablon letöltése a Praxis fülön a FastAPI háttérkiszolgáló segítségével.

---

## Tartalomjegyzék

- [Technológiai verem](#technológiai-verem)
- [Architektúra](#architektúra)
- [Projekt struktúra](#projekt-struktúra)
- [Futtatás](#futtatás)
- [Adatelérési minta](#adatelérési-minta)
- [Supabase konfiguráció](#supabase-konfiguráció)
- [Routing -- fontos!](#routing--fontos)
- [CSS stratégia](#css-stratégia)
- [Konvenciók és szabályok](#konvenciók-és-szabályok)
- [Ismert buktatók](#ismert-buktatók)

---

## Technológiai verem

| Réteg         | Technológia                              |
| ------------- | ---------------------------------------- |
| Framework     | React 19 + TypeScript 6                  |
| Build tool    | Vite 8                                   |
| Routing       | react-router-dom 7 (BrowserRouter)       |
| Adatbázis     | Supabase (PostgREST + Realtime + Auth)   |
| Charting      | chart.js 4 + react-chartjs-2 5           |
| Naptár        | @fullcalendar/react 6                    |
| Drag & Drop   | @dnd-kit/core + @dnd-kit/sortable        |
| Styling       | Vanilla CSS                              |
| State mgmt    | React Context (Auth, Theme, Approval)    |
| Backend       | Python FastAPI (csak komplex írásokhoz)   |

---

## Architektúra

```
Frontend (React)
  ├── OLVASÁS: supabase-js → Supabase DB (közvetlen)
  ├── ÍRÁS (egyszerű): supabase-js → Supabase DB (közvetlen)
  ├── ÍRÁS (komplex): authFetch → FastAPI → supabase-py → Supabase DB
  └── AUTH: supabase.auth (signIn, signUp, signOut, updateUser)

FastAPI backend (csak 5 endpoint maradt)
  ├── Settings mentés → cache invalidáció + DB
  ├── Kampány start/stop → email workflow + DB
  ├── Reminder toggle → backend worker config + DB
  └── AI insight generálás → LLM API + DB
```

### Alkalmazás inicializáció

```
main.tsx → App.tsx → BrowserRouter (basename="/admin")
                      → ThemeProvider (dark/light)
                        → AuthProvider (Supabase Auth session)
                          → AuthGate
                             ├─ !authenticated → LoginPage
                             └─ authenticated  → Routes
                                                   └─ AppLayout (Sidebar + Header + Outlet)
                                                      ├─ /analytics     → AnalyticsPage
                                                      ├─ /interactions  → InteractionsPage
                                                      ├─ /clients       → ClientsPage
                                                      ├─ /kanban        → KanbanPage
                                                      ├─ /calendar      → CalendarPage
                                                      ├─ /outbound      → OutboundPage
                                                      ├─ /settings/*    → SettingsPage
                                                      ├─ /beallitasok   → BeallitasokPage
                                                      ├─ /help          → HelpPage
                                                      └─ /*             → Navigate to /analytics
```

---

## Projekt struktúra

```
eaisydesk-frontend/
├── src/
│   ├── api/
│   │   └── client.ts           # authFetch() — csak a maradék 5 FastAPI endpointhoz
│   ├── lib/
│   │   └── supabase.ts         # Supabase kliens (createClient, anon key)
│   ├── components/
│   │   ├── layout/             # AppLayout, MainHeader, Sidebar
│   │   ├── kanban/             # KanbanColumn, KanbanCard
│   │   ├── clients/            # ClientDetailView
│   │   ├── interactions/       # InteractionSummaryModal
│   │   └── ui/                 # Badge, Spinner, Toast, ConfirmDialog
│   ├── context/
│   │   ├── AuthContext.tsx     # Supabase Auth session + admin_users role
│   │   ├── ThemeContext.tsx    # Dark/light mode
│   │   └── ApprovalContext.tsx # Jóváhagyás workflow
│   ├── hooks/
│   │   ├── useClients.ts       # clients tábla + Realtime
│   │   ├── useSessions.ts      # interaction_list VIEW + Realtime
│   │   ├── useCalendarEvents.ts# calendar_events + Realtime
│   │   ├── useKanbanColumns.ts # kanban_columns + Realtime
│   │   └── useUsers.ts         # admin_users + Supabase Auth CRUD
│   ├── pages/                  # 10 oldal (mind migrálva)
│   ├── helpers/                # formatters, clientResolvers, interactionClassifiers
│   └── styles/                 # Vanilla CSS
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Futtatás

```bash
# 1. Frontend
cd eaisydesk-frontend
npm install
npm run dev
# → http://localhost:5173/admin/

# 2. Backend (opcionális — csak settings/kampány/AI endpointokhoz kell)
cd thinkai-voice-agent
python web_server.py
# → http://localhost:8000
```

A frontend önmagában működik bejelentkezéshez, adatok olvasásához és a legtöbb
írási művelethez. A FastAPI backend csak az 5 komplex endpointhoz szükséges.

---

## Adatelérési minta

### Közvetlen Supabase (a legtöbb művelet)

| Hook / Oldal | Tábla / View | Művelet | Realtime |
|---|---|---|---|
| `useClients` | `clients` | SELECT, DELETE, UPDATE | igen |
| `useSessions` | `interaction_list` VIEW | SELECT | igen |
| `useCalendarEvents` | `calendar_events` | SELECT, INSERT, DELETE, UPDATE | igen |
| `useKanbanColumns` | `kanban_columns` | SELECT, INSERT, UPDATE, DELETE | igen |
| `useUsers` | `admin_users` + `supabase.auth` | SELECT, INSERT, UPDATE, DELETE | nem |
| `SettingsPage` | `app_settings` | SELECT (key='agent_settings', 'praxisinfo') | nem |
| `OutboundPage` | `campaigns`, `reminder_settings` | SELECT | nem |
| `AnalyticsPage` | RPCs | `get_analytics_stats`, `_funnel`, `_alerts`, `get_outbound_summary` | nem |
| `InteractionSummaryModal` | `calendar_events` | SELECT | nem |

### FastAPI (szerver-oldali logika szükséges)

| Endpoint | Miért nem közvetlen Supabase |
|---|---|
| `POST /admin/api/settings` | Backend RAM cache invalidáció |
| `POST /admin/api/praxisinfo` | Backend RAM cache invalidáció |
| `POST /admin/api/settings/reminder` | Backend worker konfiguráció |
| `POST /admin/api/campaigns/*` | Email workflow orchestráció |
| `POST /admin/api/analytics/insights/generate` | LLM API hívás |

### Supabase DB objektumok

| Típus | Név | Leírás |
|---|---|---|
| VIEW | `interaction_list` | sessions + interactions + clients pre-join (SECURITY INVOKER) |
| RPC | `get_analytics_stats(p_period)` | KPI aggregáció |
| RPC | `get_analytics_funnel(p_period)` | Konverziós tölcsér |
| RPC | `get_analytics_alerts(p_period)` | Figyelmeztetések |
| RPC | `get_outbound_summary(p_period)` | Kimenő kommunikáció statisztika |
| RPC | `delete_auth_user(p_email)` | Auth user törlés (SECURITY DEFINER) |

---

## Supabase konfiguráció

### Környezeti változók

A `src/lib/supabase.ts` fájlban:
- `VITE_SUPABASE_URL` — Supabase projekt URL
- `VITE_SUPABASE_ANON_KEY` — publikus anon key (RLS-el védett)

### RLS

Minden tábla `authenticated_full_access` policy-val van védve:
- Bejelentkezett user mindenhez hozzáfér (admin, manager, member egyaránt)
- Frontend-szintű jogosultság-korlátozás: member nem lát csapatkezelő panelt

**Tervezett RLS finomítás** (amikor a member felület elkészül):
- `admin_users`: member csak saját rekordját lássa (ne lássa más email/role adatait)
- `app_settings`: member ne tudjon írni (ne módosíthassa a rendszerbeállításokat)
- Többi tábla (clients, interactions, calendar, kanban): maradhat `authenticated_full_access`, mert a member felületnek is szüksége van rájuk
- A member teljesen más felületet kap, ezért a korlátozás inkább biztonsági háló, nem funkcionális szétválasztás

### Realtime

5 tábla van a `supabase_realtime` publication-ban:
`clients`, `interactions`, `sessions`, `calendar_events`, `kanban_columns`

### Indexek

10 index a leggyakrabban rendezett/szűrt oszlopokon:
- `interactions(created_at DESC, session_id)`
- `sessions(started_at DESC)`
- `clients(created_at DESC, status)`
- `calendar_events(start_dt ASC)`
- `admin_users(email)`
- `app_settings(key)` UNIQUE
- `kanban_columns(order_index ASC)`
- `campaigns(created_at DESC)`

---

## Routing -- FONTOS!

A `BrowserRouter` `basename="/admin"`-nel van konfigurálva.

- **A route path-ok NEM tartalmazzák a `/admin` prefixet.** Pl.: `path="analytics"` → URL: `/admin/analytics`
- **`navigate()` hívások basename-relatívak.** `navigate('/help')` → URL: `/admin/help`
- **`useLocation().pathname` szintén stripped.** URL `/admin/analytics` → `pathname = /analytics`

**SOHA ne használd a `/admin/` prefixet** navigate() hívásokban vagy NAV_ITEMS path-okban.

---

## CSS stratégia

- Legacy CSS fájlok 1:1 átemelve `src/styles/` mappába
- CSS custom properties: `variables.css` (`--text`, `--bg`, `--card`, `--border`, `--accent`)
- Dark mode: `body.dark` class, override-ok `dark-mode.css`-ben
- Sidebar collapse: `body.sidebar-collapsed` class, `responsive.css`

---

## Konvenciók és szabályok

### TypeScript
- Strict mode. Minden page/component `.tsx`.
- Interfacek a fájl elején.

### Magyar nyelv
- **Kötelező az ékezetek használata** minden felhasználónak látható szövegben.
- Változó- és függvénynevekben megengedett az ékezetmentes forma.

### Chart.js
- Y tengely: `yMax = Math.ceil(maxVal * 1.25)`, `yStep = Math.max(1, Math.ceil(yMax / 6))`
- Színpaletta: `['#3b82f6', '#1ceee0', '#22c55e', '#8b5cf6', '#f59e0b', '#f97316']`

---

## Ismert buktatók

### 1. Routing basename
Lásd fent. **SOHA ne használd a `/admin/` prefixet** a navigate() hívásokban.

### 2. Dark mode chart frissítés
Az `AnalyticsPage` `document.body.classList.contains('dark')`-ot használ a renderben.
Nem reaktív -- dark/light váltáskor a chartok nem frissülnek automatikusan.

### 3. Outbound zero-case
Ha nincs outbound adat, demo értékek jelennek meg a funnelben (72%, 60%, 52%).

### 4. authFetch maradék használat
Csak 5 endpoint használja még a FastAPI-t. Ha ezek közül bármelyiket
akarod átmigrálni, figyelj a szerver-oldali mellékhatásokra (cache, email, LLM).

---

## Legacy vs React paritás -- hiányzó funkciók

> A legacy `page-settings.html` (88KB) és a Tudástár (`SettingsPage.tsx`) közötti paritás szinte 100%-os. A korábban hiányzó funkciók nagy része megvalósításra került.

### Tudástár -- Telefon tab

| Szekció | Státusz |
|---------|---------|
| Hang választó (API-ból töltött lista) | OK -- Legördülő lista API-ból (Cartesia) beépítve |
| Kommunikációs stílus | OK |
| Bemutatkozás | OK |
| **Nyitvatartás tábla** (7 nap, nyitás/zárás, toggle) | OK -- Részletes táblázat, mentés lemezre (FastAPI) és Supabase-be |
| Tudásbázis Q&A (hidden a legacy-ben is) | OK -- Támogatva |
| System prompt szerkesztő (hidden) | OK -- Szerkeszthető |
| Workflow szerkesztő (hidden) | OK -- Szerkeszthető |

### Tudástár -- Céginformációk tab

| Szekció | Státusz |
|---------|---------|
| Intézményi adatok (4 input) | OK |
| **Telephelyek** (dinamikus lista, auto-save) | OK -- CRUD műveletek közvetlenül Supabase-be |
| **Orvosok -- szolgáltatások** (dinamikus lista) | OK -- CRUD műveletek közvetlenül Supabase-be |
| **Árlista feltöltés** (XLSX/CSV upload + törlés) | OK -- Excel/CSV feltöltés és sablon letöltés integrálva a Praxis tabon |
| **Időpont emlékeztetők** (toggle + óra + sablon) | OK -- CRUD műveletek közvetlenül Supabase-be |
| **Címkerendszer** (inaktivitási küszöb + címkék) | OK -- CRUD műveletek közvetlenül Supabase-be |
| **Eseményvezérelt automatizációk** | OK -- CRUD műveletek közvetlenül Supabase-be |
| **Kampányok** (toggle + szöveg) | OK -- CRUD műveletek közvetlenül Supabase-be |
| **GYIK** (kérdés-válasz párok) | OK -- Dinamikus kezelés a Praxis tabon |

### Tudástár -- Szabályok tab

| Szekció | Státusz |
|---------|---------|
| **Új/visszatérő páciens kezelés** (4 input + toggle) | OK -- Inputs és konfigurációs lehetőségek |
| **Szolgáltatások és időtartamok** (dinamikus lista) | OK -- CRUD szolgáltatáskezelő beépítve |
| **Kivételek kezelése** (dinamikus lista) | OK -- Szerkeszthető lista a Rules tabon |
| **Lemondás és módosítás** (2 select + textarea) | OK -- Konfigurálható feltételek |
| **Triázs szabályok** (tábla + hozzáadás) | OK -- CRUD triage_rules táblakezelő |

### Egyéb oldalak és modulok

| Funkció / Modul | Megvalósítás részletei | Státusz |
|-----------------|------------------------|---------|
| `page-calls.html` | Realtime hívások dashboard | **HIÁNYZIK** |
| `page-approvals.html` | Jóváhagyás workflow | `ApprovalContext` + modal |
| Outbound kampány analitika | **Chart.js diagramok** (Doughnut, Bar, Line) portolva | **OK** |
| Settings mentés szinkronizáció | Mentés lemezre (Python cache-hez) + Supabase szinkron | **OK** |
| Member fiók jogosultságok | Csapatkezelő tab elrejtése `BeallitasokPage.tsx`-ből tagoknak | **OK** |

### Prioritási sorrend

1. **Calls page**: Ha használva van
2. **Outbound wizard/schedule**: Részletek további finomítása

---

## Hasznos parancsok

```bash
# TypeScript ellenőrzés
npx tsc --noEmit

# Dev szerver
npm run dev

# authFetch maradékok keresése
npx grep -rn "authFetch" src/pages/
```

