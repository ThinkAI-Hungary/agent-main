# HANDOFF — eaisyDesk | 2026-09-06

## ⚠️ ÁLLANDÓ MUNKAREND — minden sessionnek

- **Ezt a HANDOFF.md-t MINDEN utasítás elvégzése UTÁN frissíteni kell** (mit csináltunk, hol állunk, mi a következő lépés), majd commit + push `origin/rebuild`-re. Cél: bármikor indulhat új session, ebből a fájlból kell tudnia folytatni.
- Deploy után verifikálni (konténer healthy, logok tiszták), és az eredményt is beírni.
- A friss, teljes rendszerdokumentáció: `/root/eaisydesk-context-2026-09.md` (a repón KÍVÜL van, mert kulcsokat tartalmaz — soha ne commitold!). A repóban lévő régi dokik (`dokumentumok/`, AGENT_DOCS, RENDSZERLEIRAS) elavultak.

## Projekt áttekintés

- **Repo**: `/root/dobozos` — branch: `rebuild` (push: `origin/rebuild`)
- **Staging URL**: https://digideskadmin.molaire.hu
- **Deploy**: `/root/ugyfelszolg/docker-compose.yml` → `dobozos-agent` konténer, build context: `../dobozos`
- **Supabase**: `qhhnqqsthdrwacsxommt.supabase.co` (service_role kulcs a `.env`-ben)
- **Admin login**: `.env` → `ADMIN_USERNAME` / `ADMIN_PASSWORD`
- **Management API**: Supabase MCP configban `sbp_*` token — élő DB DDL futtatható vele

---

## ✅ MEGOLDVA (2026-09-06) — Email feldolgozást blokkoló HU_DAYS naming bug

**Fájl**: `thinkai-voice-agent/prompt_utils.py`, 252. sor

A `{today}` prompt-változó egy lambda-ban hivatkozott a `HU_DAYS` tömbre, de a tömb **`_HU_DAYS`** néven van deklarálva (7. sor). A név eltérés miatt `NameError` keletkezett minden email feldolgozáskor.

**Rendezés**: commit `fb525c5` (push: origin/rebuild) → staging rebuild (`docker compose build + up -d dobozos-agent`). Ellenőrizve: konténer healthy, a javított sor bent van a konténer `/app/prompt_utils.py`-jában, indulás óta nincs ERROR a logokban, `/admin/` HTTP 200. **A prod NEM volt érintett** (a bug-bevezető `f3866e5` commit nincs a prod HEAD-ben).

**Végponttól végpontig teszt (2026-09-06 17:11)**: a 10 db bug-korszakban elhasalt `erika@molaire.hu` levél újrafeldolgozva — 10/10 Gemini-elemzés + klasszifikáció OK, 8 autonóm válasz kiment, 5 naptáresemény + visszaigazoló emailek keletkeztek, 0 hiba. A DB-ben a `processed_emails` 19 sor, mind `status=ok`.

**Újrafeldolgozás részletei (jegyzet)**: a poll UID high-water markkal dolgozik in-memory (`email_processor.py:975–992`), a `\Seen`-jelzést szándékosan NEM veszi figyelembe. Ezért egy levél újravételéhez: (1) `processed_emails` claim törlése (SQL), (2) **konténer restart** (a high-water mark nullázásához) — a `\Seen` visszabiggyesztés önmagában NEM elég.

---

## Graphify tudásgráf (2026-09-06 telepítve)

A kódbázisból queryelhető tudásgráf: [github.com/Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify). Kód, dokik, SQL sémák → gráf + jelentés + wiki.

- **CLI**: `graphify` (symlink: `/usr/local/bin/graphify` → `/root/graphify-venv/bin/graphify`, v0.9.55; PyPI csomag: `graphifyy` + extra `openai` és `graphifyy[sql]` dependenciák a venvben)
- **Gráf helye**: `/root/dobozos/graphify-out/` (graph.json: 2161 node / 3949 él / 181 közösség, továbbá GRAPH_REPORT.md, graph.html, wiki-készítés `export wiki`) — gitignored, NEM megy a repóba, csak a szerveren él
- **Kizárások**: `/root/dobozos/.graphifyignore` (commitolva: deploy logok, dokumentumok/, logo, scratch scriptek)
- **Backend**: Gemini (`GOOGLE_API_KEY` a `thinkai-voice-agent/.env`-ből exportálva a futtatáshoz; az első gráf-építés ~$0,23 volt)
- **Használat** (a `/root/dobozos`-ból):
  ```bash
  export GOOGLE_API_KEY=$(grep -oP '^GOOGLE_API_KEY=\K.*' thinkai-voice-agent/.env | head -1); export GEMINI_API_KEY="$GOOGLE_API_KEY"
  graphify query "kérdés a kódbázisról"           # BFS keresés a gráfban (--budget N a méret szabásához)
  graphify explain "_tenant_eq"                    # node + szomszédok magyarázata
  graphify path "A" "B"                            # legrövidebb út két node közt
  graphify god-nodes                               # architektúra hubok
  graphify update /root/dobozos                    # kódváltozás UTÁN — AST rész API-költség NÉLKÜL
  graphify extract /root/dobozos --backend gemini  # teljes újraépítés (LLM költséggel, a cache csak a változást számolja)
  ```
- **Új session tipp**: nagyobb kérdésnél előbb `graphify query`, utána fájl-olvasás. A GRAPH_REPORT.md `Built from commit` mezőjéből látszik, elavult-e a gráf (`graphify check-update .`).

---

## Utolsó 3 nap változtatásai (kronologikus sorrend)

### 1. Sidebar redesign — mind a 4 Ügyfélközpont oldal

**Interakciós napló** (`/interactions`):
- Fejléc sáv: breadcrumbs, széles kereső, KPI chipek (Sürgős/Nyitott/Lezárt — kattintva szűrnek), Oszlopok ikon, Szűrés primary gomb
- Eredmény oszlop: sima szöveg (nem badge)
- Teendő oszlop: sima szöveg („Nincs további teendő" halványan)
- Csatorna cella: 28px ikon-chip (Telefon/Email/WhatsApp/Messenger/Instagram)
- Sürgős sor: error-tint háttér + 3px piros inset sáv
- Lapozás: 10 sor/oldal, footer „1–10 / N találat" + lapozó gombok
- Üres állapot: ikon + „Nincs találat" + segédszöveg
- Dark mode: `--cp-*` tokenekből

**Érdeklődőkezelés** (`/kanban`):
- Belépési szabály: CSAK értékesítési címkés ügyfél (kampánylead, potenciális vásárló, árkérdés, törölt időpont, no-show) VAGY kézzel felvett
- UTÁNKÖVETÉS: védett első oszlop (nem törölhető, nem nevezhető át)
- Kártya: monogram avatar, név, kontakt, címke-chipek ×-szal, lábléc (felelős · dátum)
- Kuka gomb: CSAK kanbanról távolít (`custom_data.kanban_removed`), ügyfél marad
- Oszlop hozzáadása: muted szaggatott oszlop a sor végén
- FullCalendar (~200KB) kiadva, saját renderelés

**Ügyféllista** (`/clients`):
- Fejléc sáv: kereső + Oszlopok ikon + Szűrés primary + **+ Új ügyfél accent gomb**
- Új ügyfél modál: Név + Telefon + Email (legalább egy kontakt kötelező)
- Értékesítési státusz oszlop: kanban oszlop neve (csak olvasható, üres ha nincs ott)
- Avatar-négyzet + név, Új/Visszatérő badge, címke chipek ×-szal
- Lapozás 10/oldal

**Naptár** (`/calendar`):
- **FullCalendar (~200KB) kiváltva saját rendereléssel**: nap / hét / hónap
- Toolbar: listanézet-ikon + navigáció (előző/cím/következő) + Ma + Nap/Hét/Hónap szegmens + Időpont hozzáadása accent gomb
- Hét: órarács, abszolút pozicionált esemény-kártyák (navy tint + bal sáv), mai nap kiemelve
- Hónap: 7 oszlopos rács, 112px cellák, max 2 esemény + '+N további'
- Nap: órás bontás eseménylistával
- Listanézet: Időpont, Időpont státusza, Ügyfél, Ügyfélstátusz badge, Esemény, Időtartam, Kolléga + no-show jelölés

### 2. Ügyfélprofil redesign (`ClientDetailView.tsx`)

- **Hero**: mint háttér, „Ügyfélprofil" pill, kebab menü (Profil szerkesztése / Felvétel Érdeklődőkezelésbe / Kimenő kommunikáció indítása), monogram avatar (52px kör), név + badge (accent tint), kontakt sor, divider + regisztráció dátum
- **Teendő hozzáadása**: új funkció — modál (leírás + Nyitott/Sürgős), tasks táblába kerül `client_id` kötéssel
- A teendők megjelennek a member irányítópult Teendők szekciójában is
- **3 kártya**: Időpontok (kiemelt következő), Címkék (chipek ×-szal), Megjegyzés (textarea)
- **Listanézet**: Időpont státusza (Foglalt / No-show / Lezajlott), Munkatárs oszlop, no-show jelölés
- **Szerkesztő panel**: esemény kattintásra nyílik, módosítás + törlés
- **Dark mode**: `--cp-*` tokenek (clientprofile.css)

### 3. Visszaigazoló email beállítások

- **DB migráció**: `reminder_settings` + 4 oszlop (`confirmation_enabled`, `confirmation_subject`, `confirmation_template`, `confirmation_cancel_link`) — élőn lefutott
- **Backend**: `POST /admin/api/settings/reminder` fogadja az új mezőket; `send_booking_confirmation_email` beállításokból dolgozik
- **Frontend**: Automatikus értesítések oldalon új „Időpont visszaigazolás" akkordion — kapcsoló, lemondási link toggle, sablon textarea

### 4. Email flow ügyfél-kontextus

- `process_single_email` elején `find_client_by_contact` lefut — az eredmény MOST MÁR át van adva a válaszgeneráló promptnak
- Visszatérő ügyfél: „VISSZATÉRŐ ÜGYFÉL: már szerepel a nyilvántartásban... TILOS rákérdezni, hogy járt-e már nálunk..."
- Új ügyfél: „ÚJ ÜGYFÉL: még nem szerepel a nyilvántartásban"
- Beinjektált adatok: nyilvántartott név, nyilvántartásba vétel, interakciószám, utolsó interakció, bejegyzett jövőbeli időpontok, címkék

### 5. Dentálhigiénia szabály

- Email prompt + voice system_prompt: „Dentálhigiénés kezeléseket ÚJ ÜGYFÉLNEK IS KÖZVETLENÜL LE LEHET FOGLALNI — nem szükséges előtte konzultáció. Az esemény címe a kezelés neve."
- **KB-ban már benne volt** (campaigns szöveg), de az LLM nem alkalmazta — prompt-szintű megerősítés hozzáadva

### 6. Kanba-rendelés kiszedve az email flow-ból

- `process_single_email` korábban `status=first_col`-lal mentette az ügyfelet → MINDEN email küldő bekerült az érdeklődőkezelésbe
- Most: NEM állít oszlopot — a kanbába csak értékesítési címkés vagy kézzel felvett ügyfél kerül

### 7. Adatkérési szabályok az email válasz-promptban (2026-09-06 délután, ügyfél 252 visszajelzés)

- **Probléma**: az AI válaszban rákérdezett az ügyfél EMAIL CÍMÉRE (és ismert adatokra) — pedig azt a bejövő levélből a rendszer ismeri. Client 252 (Orosz Erika, et_orosz@yahoo.ie) új címről írt → ÚJ ÜGYFÉL ág → semmilyen adatkérési szabály nem volt benne.
- **Javítás** (`email_processor.py`, client_context blokk, commit `9ee8e4f`): csatornaszintű `ADATKÉRÉSI SZABÁLYOK` blokk **mindkét ágra** (új + visszatérő):
  - Email cím SOHA nem kérdezhető (a feladóból ismert, a blokk ki is írja a konkrét címet)
  - CSAK hiányzó adat kérhető: teljes név, ha nem egyértelmű; telefonszám, ha nincs megadva és kell (visszaigazolás/emlékeztető)
  - Visszatérő ágnál a nyilvántartott telefonszám is bekerült a kontextus-listába
- **Deploy + verifikáció**: `update.sh` → futó commit `9ee8e4f`, konténer healthy, új szabály bent a konténer `/app/email_processor.py`-jában, logok tiszták. E2E teszt: küldjön a user friss tesztemailel egy új címről → a draftban nem szerepelhet email-cím-rákérdezés.
- **Finomítás (user pontosítás után, commit `ae5d33c`)**: az indok NEM a nyilvántartás/regisztráció, hanem maga a csatorna — *aki emailt ír, annak nyilvánvaló, hogy a címzett látja a feladó címét, ezért kontraproduktív rákérdezni*. Ezért:
  - `prompt_utils.get_system_prompt(channel="email")` végére került egy **E-MAIL CSATORNASZABÁLY** blokk — ez mindig érvényes, client-lookup hibája esetén is (funkcionálisan tesztelve a konténerben: a `channel='email'` prompt tartalmazza)
  - A client-context bullet is átírótt erre az érvelésre („attól függetlenül, hogy az ügyfél ismert-e a nyilvántartásban")

---

## Adatbázis módosítások (élőn lefutottak)

### Migráció 1: `tasks.client_id` oszlop
```sql
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_tasks_client_id ON public.tasks (client_id) WHERE client_id IS NOT NULL;
```

### Migráció 2: `reminder_settings` confirmation oszlopok
```sql
ALTER TABLE public.reminder_settings ADD COLUMN IF NOT EXISTS confirmation_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.reminder_settings ADD COLUMN IF NOT EXISTS confirmation_subject TEXT DEFAULT 'Időpont visszaigazolás';
ALTER TABLE public.reminder_settings ADD COLUMN IF NOT EXISTS confirmation_template TEXT;
ALTER TABLE public.reminder_settings ADD COLUMN IF NOT EXISTS confirmation_cancel_link BOOLEAN DEFAULT true;
UPDATE public.reminder_settings SET confirmation_enabled = true, confirmation_cancel_link = true;
NOTIFY pgrst, 'reload schema';
```

### Migráció 3: szekvencia-szinkron ( ÖSSZES tábla)
```sql
DO $fix$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT table_name, column_name,
           substring(column_default from 'nextval\\(''([^'']+)''')) AS seqname
    FROM information_schema.columns
    WHERE table_schema='public' AND column_default LIKE 'nextval%'
  LOOP
    EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM public.%I), 1), true)',
                   r.seqname, r.column_name, r.table_name);
  END LOOP;
END $fix$;
```
**Ok**: az élő DB restore miatt a `calendar_events_id_seq` lemaradt (id 2-hez ütközött), emiatt minden foglalási kísérlet `duplicate key` hibával elhasalt.

### Migráció 4: `processed_emails` claim törlés (teszt)
```sql
DELETE FROM public.processed_emails WHERE from_email = 'erika@molaire.hu';
```
**Ok**: a törölt ügyfél korábbi emailek claim-jei blokkolták az újboli feldolgozást.

---

## Backend endpoint változások

| Végpont | Módosítás |
|---|---|
| `POST /admin/api/calendar` | Ha `id` van a payloadban → frissítés, különben létrehozás |
| `DELETE /admin/api/calendar/{id}` | ÚJ — naptáresemény törlése |
| `GET /admin/api/tasks` | Új query param: `client_id` (ügyfélprofil kézi teendői) |
| `POST /admin/api/tasks` | Új — kézi teendő létrehozása (text, priority, client_id) |

---

## Ismert nyitott hibák / hiányosságok

| # | Hiba | Súlyosság | Megjegyzés |
|---|---|---|---|
| 1 | ~~HU_DAYS naming bug~~ ✅ MEGOLDVA (2026-09-06, commit `fb525c5`, stagingen deployolva) | ✅ | Prod nem volt érintett |
| 2 | Inaktív-trigger hibás | 🟡 | `beszelgetes_naplo` legacy mezőtől függ, 60 nap a LÉTREHOZÁSTÓL számol (nem az utolsó interakciótól) |
| 3 | No-show auto-címkézés hiányzik | 🟡 | Nincs naptár-alapú detektálás — csak voice beszélgetésből (tag_client tool) |
| 4 | Kimenő kommunikáció nincs loggolva a profilra | 🟡 | Visszaigazoló, kampány emailek nem látszanak az ügyfélprofilban |
| 5 | Foglaláskor ügyfél kanbaba kerül | 🟢 | Voice foglalás → UTÁNKÖVETÉS-be kerül (konvertált ügyfél is) — eldöntendő, hogy ez jó-e |
| 6 | Ügyfél-identitás email címen alapul | 🟢 | Több címről tesztelve → több ügyfél rekord keletkezik ugyanannak |
| 7 | processed_emails claim nem törlődik ügyfél törléskor | 🟢 | Törölt ügyfél emailei nem dolgozhatók újra (dedup blokkolja) |

---

## Fájl módosítások összefoglalója

| Fájl | Módosítás típusa |
|---|---|
| `prompt_utils.py` | `{today}` Budapesti idő + magyar napnév; `_HU_DAYS` naming bug javítás |
| `email_processor.py` | Ügyfél-kontextus injektálás; aktuális dátum blokk; KPI csökkentés (500); visszaigazoló email beállításokból |
| `web_server.py` | `POST /admin/api/tasks` (kézi teendő); `DELETE /admin/api/calendar/{id}`; `POST /admin/api/calendar` update ág |
| `database.py` | `update_calendar_event`; `delete_calendar_event_by_id`; `add_task` client_id; `get_tasks` client_id szűrő |
| `migrate_confirmation_settings.sql` | Új fájl — reminder_settings confirmation oszlopok |
| `system_prompt.md` | Dentálhigiénia szabály + relatív dátumszabály |
| `clientprofile.css` | Ügyfélprofil + naptár + kampány UI Kit stílusok (--cp-* tokenekkel) |
| `interactions.css` | Interakciós napló UI Kit stílusok |
| `kanbanrestyle.css` | Érdeklődőkezelés UI Kit stílusok |
| `CalendarPage.tsx` | Teljes rewrite — saját renderelés, szerkesztő panel |
| `ClientDetailView.tsx` | Teljes rewrite — teendő funkció, szerkesztő panel, mockup design |
| `KanbanPage.tsx` | Belépési szabály, UTÁNKÖVETÉS védett oszlop, kanba-eltávolítás |
| `InteractionsPage.tsx` | Fejléc sáv, KPI chipek, lapozás, csatorna-chipek, rendezés |
| `MemberDashboardPage.tsx` | Kézi teendők a Teendők szekcióban |
| `ClientsPage.tsx` | Fejléc sáv, Új ügyfél modál, ért. státusz oszlop |
| `OutboundPage.tsx` | Chipek, kártya + listanézet, státusz, kebab menü |
| `Sidebar.tsx` | UTÁNKÖVETÉS védett oszlop, ikonok, brand sor |
| `Badge.tsx` | Kit 06 stílus (tintelt háttér + keret + pötty) |
| `Dockerfile` | Playwright skip, dockerignore bővítés |
| `tests/*.spec.ts` | 16 smoke + 5+3+2+2+2 audit tesztek |
| `playwright.config.ts` | Új — smoke + audit futtatás |

---

## Deploy parancsok (gyorsreferencia)

```bash
# Build + push
cd /root/dobozos
git add -A thinkai-voice-agent
git commit -m "..."
git push origin rebuild

# Staging rebuild
cd /root/ugyfelszolg
docker compose build dobozos-agent
docker compose up -d dobozos-agent

# Ellenőrzés
docker ps --filter name=dobozos-agent --format '{{.Status}}'
docker logs digidesk-dobozos-agent --since 1m 2>&1 | grep -E "ERROR|Hiba" | tail -5
```

## Teszt parancsok

```bash
cd /root/dobozos/thinkai-voice-agent/eaisydesk-frontend

# Minden teszt (smoke + audit)
npx playwright test

# Csak smoke
npx playwright test tests/smoke.spec.ts

# Képernyőképek
SHOTS=1 npx playwright test tests/visual.spec.ts

# Konkrét audit
npx playwright test tests/audit-interactions.spec.ts
npx playwright test tests/audit-clientprofile.spec.ts
npx playwright test tests/audit-kanban.spec.ts
npx playwright test tests/audit-outbound.spec.ts
npx playwright test tests/audit-calendar.spec.ts
npx playwright test tests/audit-clients.spec.ts
```

---

## Értékesítési címkék (SALES_TAGS) — a kanbába kerülés szabálya

```typescript
const SALES_TAGS = ['kampánylead', 'potenciális vásárló', 'árkérdés', 'törölt időpont', 'no-show'];
```

- Ezek bármelyikével rendelkező ügyfél automatikusan az érdeklőkezelésbe kerül
- Kézzel is felvehető (ügyfélprofil kebab → Felvétel Érdeklődőkezelésbe)
- Ném kötelező konzultáció: dentálhigiénia (EMS, Air-Flow) közvetlenül foglalható
- Foglaláskor kanba KERÜL — de konvertált ügyfélként ez az elvárás

---

## Értékesítési státusz értékek (naptár + ügyféllista)

| Státusz | Jelentés | Pill szín |
|---|---|---|
| Foglalt | Jövőbeli időpont | navy tint |
| No-show | Nem jelent meg | piros tint |
| Lezajlott | Megtörtént | zöld tint |
| Új ügyfél | Nincs korábbi időpontja | teal tint |
| Visszatérő ügyfél | Van korábbi időpontja | navy tint |

---

## Devizafejléc / toolbar szerkezet (közös minden Ügyfélközpont oldalon)

```
Ügyfélközpont / <Oldal neve>     ← breadcrumbs
<Oldal cím>                       ← h1

┌──────────────────────────────────────────────────────────┐
│ [kereső]          │ [Oszlopok] [Szűrés] [+ Új gomb]      │
└──────────────────────────────────────────────────────────┘
│ [tartalom]                                                │
```
