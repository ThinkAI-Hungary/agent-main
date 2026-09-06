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

### 8. Visszaigazoló email lemondási link domain-fix (2026-09-06 este)

- **Probléma**: a visszaigazoló (és emlékeztető) emailek lemondási linkje `http://localhost:8000/api/public/cancel?token=…` volt → a címzett számára kattinthatatlan.
- **Ok**: az email-link építő (`email_processor.py`, reminder ~L1427 + confirmation ~L1583) a `SERVER_URL` env-t olvasta, ami nincs beállítva → localhost fallback. Közben a `APP_BASE_URL` (a staging .env-ben már régen `https://digideskadmin.molaire.hu`) a web_server OAuth callbackjeinél már használatban volt — két konkurens base-URL konvenció élt.
- **Javítás** (commit `50e2155`): mindkét helyen `APP_BASE_URL → SERVER_URL → localhost` sorrendű feloldás `.rstrip("/")`-szal. Stagingen nem kellett .env-et állítani (APP_BASE_URL már jó). **Prod-deploy előtt ellenőrizni, hogy a prod .env-ben `APP_BASE_URL=https://desk.eaisy.hu` van-e!**
- **Verifikáció**: deploy `50e2155`, konténer env-ben APP_BASE_URL jó, a link-építő kifejezés a jó domaint adja. Élő teszt: a user által jelentett (helyes domainnel meghívott) link HTTP 200 + „Sikeres lemondás" — a 99-es tesztesemény lemondódott/törlődött (a link működésének bizonyítéka), az ügyfél „lemondott" státusz + „törölt időpont" tag-et kapott.

### 9. Fájdalom ≠ Panasz — sürgős időpont-ügy (2026-09-06 este, 254-es ügy)

- **Probléma**: "Nagyon fáj a bölcsességfogam, szeretnék mihamarabb időpontot kérni" → a rendszer **Panasz**-ként sorolta (restriction: urgent), a válasz lerázás volt ("továbbítottuk kollégáinknak"). Orvosi értelemben a fájdalom fizikai panasz, DE nem reklamáció — a várt kezelés: **ügytípus: Időpont, státusz: Sürgős, mielőbbi időpontadás**.
- **Gyökérok 3 rétegben**:
  1. `classifier.py` LLM-prompt KIFELENTETTE: "fájdalomra panaszkodik → Panasz domináns"; a kulcsszó-fallback is Panasznak vette ("fajdal, faj" tőkék)
  2. `email_processor.py` válasz-prompt: sürgős esetnél "SZIGORÚAN TILOS időpontot foglalni + csak annyit írj, hogy kollégának továbbítottad"
  3. triage_rules DB: "Erős fájdalom" sor priority=surgos → restriction=urgent
- **Javítás** (commit `5539d0f`):
  - classifier: LLM-prompt átírva (fizikai tünet ≠ Panasz, urgens mező), `urgens` validálás, kulcsszó-fallback (`_PAIN_STEM` + valódi reklamáció-stemek: fájdalom Időpontot ad, kivéve ha szolgáltatási elégedetlenség is van), urgens+Időpont-Új esetén restriction urgent/handover → none (a sürgősség a STÁTUSZON jelenik meg, nem autonómia-tiltásként), eredmény: `statusz: Sürgős, eredmeny: Sürgős időpont-kérés, teendo: Mielőbbi időpont adása`
  - email prompt: FIGYELEM-tiltás alól fájdalom-kivétel + új "SZABÁLY — FÁJDALOM" blokk (meeting a legkorábbi munkaidőre 24-48 óra ablakkal, "urgent" tag, handover_reason null, fájdalomcsillapítási tájékoztató adható)
  - DB (staging branch): `triage_rules` "Erős fájdalom" sor priority surgos → **onallo**
  - Tesztek: `test_fajdalom_is_panasz` helyett 4 új regressziós teszt (tiszta fájdalom → Időpont+urgens; fájdalom+időpont-kérés → Időpont; fájdalom+valódi elégedetlenség → Panasz; sima időpont → urgens=False). Suite: 51/51 zöld (a tools+tenancy EGYÜTTES futtatásának fixture-ütközése előzetesen is megvolt, önállóan mind zöld).
- **Új kanonikus címke-értékek** (commit `bafb2ac`): a fenti override két új értéket vezetett be — `eredmény: "Sürgős időpont-kérés"`, `teendő: "Mielőbbi időpont adása"`. Mindkettő fel lett véve a `GET /admin/api/classification-labels` kanonikus listájába (web_server.py) és a frontend `interactionClassifiers.ts` címkeszótár-kommentjébe; élőben verifikálva a labels endpointon. (Frontend: csak komment-változás, `npm run build` zöld.)
- **Verifikáció**: deploy `5539d0f` → konténerben élő fallback-teszt: az eredeti 254-es üzenet → `Időpont / Új / urgens=True`, valódi panasz → `Panasz`. Logok tiszták.
- ⚠️ **Prod-deploykor**: a prod DB-ben is át kell írni a `triage_rules` "Erős fájdalom" sorát surgos → onallo (a kód-commit egyedül nem elég, mert a sor DB-adat)!

### 10. Jóváhagyás-mód: esemény + visszaigazoló csak a jóváhagyáskor (2026-09-06 este, 257-es ügy)

- **Probléma**: jóváhagyás-küldés beállítás mellett a válasz helyesen pending draft lett, DE a naptáresemény + a visszaigazoló email (ICS + lemondási link) már azonnal kiment — miközben a user még nem hagyta jóvá a választ.
- **Új eljárás (user által előírt)**: jóváhagyás-módban 1. semmi nem történik a user jóváhagyásáig, 2. a jóváhagyáskor / vele egyidőben jön létre a calendar event és megy ki a visszaigazoló.
- **Javítás** (commit `210de4f`):
  - `email_processor.py`: az esemény-létrehozás áthelyezve a klasszifikáció UTÁNRA — autonóm válasz esetén azonnal létrejön (és megy a visszaigazoló); jóváhagyás-módban a meeting-javaslat a draftba kerül (`draft_payload["pending_meeting"]`: title/date/time/duration/attendee/email), esemény NEM készül. `f_stage` most már a tényleges esemény-létrehozástól lesz "foglalt". Új helper: `create_event_from_pending_meeting(pm)`.
  - `web_server.py` approve endpoint (`POST /admin/api/approvals/{id}/approve`, email ág): ha a draftban van `pending_meeting` → jóváhagyáskor létrejön az esemény, a `event_id` kerül a jóváhagyott levél lemondási linkjébe, és a visszaigazoló (ICS) a válasz kiküldésével egyidőben megy ki. A draft mentése az event_id-vel együtt frissül.
  - Megjegyzés: a `modify/delete_meeting` akciók továbbra is azonnal futnak (nem érinti a jóváhagyás-mód) — ha ez is kérdéses lesz, külön tétel.
- **Verifikáció**: deploy `210de4f` — konténer healthy, logok tiszták, konténerbeli import-teszt OK (helper érvénytelen adatra None-t ad). Teljes E2E: jóváhagyás-módban küldött foglalási email → pending draftban `pending_meeting` kell legyen, esemény NEM keletkezik; a jóváhagyás gombra → esemény + visszaigazoló + jóváhagyott válasz.

### 11. Megengedő Gemini JSON-parse + elveszett email megmentése (2026-09-06 este, 774-es interakció)

- **Probléma**: a user 21:30-as levele (erika@feedbacks.hu, "Fw: idﺀpont SOS", tartalom: „módosíthatnám 10 órára az időpontot?") megérkezett és claimelve lett, DE a Gemini JSON-mód ellenére érvénytelen escape-szekvenciát adott (`\n\Természetesen` → `Invalid \escape`) → a feldolgozás elszállt, csak hiba-interakció (774) készült draft nélkül, a claim pedig „ok"-ként rögzült → a levél örökre elveszett volna.
- **A csatolmány kérdése**: a postafiók BODYSTRUCTURE-je szerint a 3 feedbacks.hu levél EGYIKÉBEN sincs csatolmány — a user Outlookjában a rózsaszín helyőrző alapján a csatolmány a kliensben ragadt (feltöltés nem sikerült). Nem rendszerhiba.
- **Javítás** (commit `98ad9bf`): `_loads_lenient()` megengedő parse (`email_processor.py`) + ugyanez inline a `classifier.py` intent-parse-ban — szabványos parse először, hibánál az érvénytelen visszaperjelek (`\"\/bfnrtu` kivételébe nem tartozó) eldobása. Tesztelve a TÉNYLEGES hibás válasszal (a `\T` eldobásával a szöveg helyesen újsorral folytatódik).
- **Mentés (recovery)**: a 19:31-es hibás claim törölve + konténer restart (high-water reset) → újrafeldolgozás a javított kóddal: Gemini OK → **esemény #107 (Akut fogászati vizsgálat - fájdalom) módosítva hétfő 10:00 Budapestre** → válasz pending draftként jóváhagyásra vár (interakció 775).
- **Talált rés (a következő körbe)**: a módosítás-visszaigazoló email azonnal kiment (`send_modification_confirmation_email`), jóváhagyás-módban is — lásd a KÖVETKEZŐ FELADAT blokkot.

### 12. Automatikus értesítések rendrakása — 4 beégetett időpont-értesítés (2026-09-06 éjszaka)

**User döntések (kérdés-válasz után)**: minden esemény-változásról menjen email; {{munkatárs}} MINDEN foglaláshoz (explicit → szolgáltatás szerinti → random releváns); emlékeztető fix 24 óra; régi eseményvezérelt automatizációk kikapcsolva megmaradnak; minden típusú lemondásról email (ICS nélkül); módosítás-visszaigazoló jóváhagyás-módban a jóváhagyott válasszal megy ki; a régi visszaigazoló-akkordion megszűnik.

**A 4 beégetett sablon** (`_APPOINTMENT_NOTIFICATIONS`, email_processor.py — a user screenshotjai szerint): Időpont visszaigazolása / Időpont emlékeztető / Időpont módosításának visszaigazolása / Időpont lemondása. Változók: `{{név}} {{időpont}} {{szolgáltatás}} {{munkatárs}} {{telephely}} {{szolgáltató}}`. Az időpont formátum: „2026. szeptember 7. (hétfő) 10:00". A szöveg NEM szerkeszthető — csak toggle.

- **Változó-feloldás**: `resolve_assigned_staff` (explicit assigned_to → services.assigned_to szolgáltatás-match → random pool); telephely = ügyfél clinic_id → első klinika → practice_name; szolgáltató = business_info.practice_name. Az eseményeken a `calendar_events.doctor` oszlop tárolja (az `add_calendar_event` kapott `assigned_to` paramétert, az update whitelist "doctor").
- **DB migráció (staging branchen lefutott)**: `reminder_settings` + `modification_enabled`, `cancellation_enabled` (default true); `outbound_automations` összes sora `enabled=false` (a worker és a sorok megmaradnak).
- **Send-point lefedettség (mind toggle-ölt)**: visszaigazoló — email AI (autonóm), jóváhagyás endpoint, Meta webhook, voice book_meeting, **kézi naptár-létrehozás (ÚJ)**; módosító — email flow (jóváhagyás-módban `pending_modification` a draftban, az approve endpoint küldi — **ÚJ**), Meta webhook, **voice modify_meeting (ÚJ)**, **kézi naptár-szerkesztés (ÚJ)**; lemondó — **self-cancel link (ÚJ)**, **kézi naptár-törlés (ÚJ)**, **voice delete_meeting (ÚJ)**, **email AI törlés (ÚJ)**, **Meta webhook törlés (ÚJ)**.
- **API**: `GET /admin/api/settings/reminder` → `notifications[]` (kind/title/description/subject/body/enabled — a frontendnek); `POST /admin/api/settings/reminder/notification-toggle` {kind, enabled}.
- **Frontend**: `AutomatizaciokPage.tsx` teljes rewrite — 4 frozen kártya (ikon, toggle „Engedélyezve", csak olvasható tárgy + chip-stílusú {{változó}}-s szöveg); a régi Emlékeztető-szerkesztő, Visszaigazolás-akkordion és eseményvezérelt lista eltűnt. `reminder_hours`/`reminder_template`/`confirmation_subject`/`confirmation_template` oszlopok megmaradnak de NEM használtak (a worker fix 24 órát használ).
- **Verifikáció**: deploy `1840434` — konténer healthy, 0 ERROR; élő render-teszt: magyar dátumformátum OK, mind a 4 sablon behelyettesít, üres Helyszín-sor eldobódik; toggle-ök default true. **Nyitott**: élő E2E (foglalás → 4 email egyike a beállítás szerint) + a CalendarPage "Új időpont" modal még nem ad fel munkatárs-mezőt (a backend random fallback lép) — ha kell, UI-bővítés külön tétel.
- **Design finomhangolás** (commit `8c1b3c1` + `4b41d26`): az `AutomatizaciokPage.tsx` a user által adott HTML-mockup szerint lett újraístílusozva — co-section kártyák (surface fejléc, stroke SVG ikonok tintelt négyzetben, 40×22 toggle accent-2 színnel, „Engedélyezve" felirat), nt-token chip-stílusú változók, kikapcsolt kártyánál a törzs elhalványul (opacity .55 + pointer-events none), dark mode a ThemeContext `isDark`-jából (accent-2: #186d98 → #3fd8c8). A toggle-funkció változatlan (notification-toggle endpoint). **Konténer**: a mockup 1120px max-width-jét a user visszavételre kérte — az oldal az alkalmazás szokásos `.page` wrapperét használja (`.main-content` adja a szélességet, `4b41d26`). Deploy + a lazy chunk tartalom szerint verifikálva; vizuális böngésző-ellenőrzés nem volt lehetséges a környezetben (nincs browser backend) — user hard refresh után látja.

### 13. Naptár finomhangolás (2026-09-06 éjszaka, commit `db17909`)

A user HTML-mockupja alapján (a modal cím és a tooltip eltérő kezelése szerinti instrukciókkal):

- **Hot fix — hétfő oszlop-csúszás**: a React heti nézet fejlécéből HIÁNYZOTT a `.cal-week-corner` cella (a mockupban az első rács-elem), így a hétfő fejléce a 62px-es óra-oszlopba csúszott és az egész napsáv balra tolódott. Pótolva — a fejléc és a rács törzs oszlopai most igazodnak. (A függőleges ritmus — head margin-top 6px / body 4px — nem változott, azt a user követendőnek jelölte.)
- **Tooltip** (hét nézet, `.cal-ev-abs` hoverre): időpont · időtartam, esemény címe, ügyfél neve, „Ellátó munkatárs: …" (forrás: `event.doctor` → ügyfél `assigned_to`). Fix pozíció, képernyő-szélre flip, `pointer-events:none`. Stílusok: clientprofile.css `.cal-tip*`.
- **Szerkesztő modal**: meglévő eseménynél a cím **„Időpont szerkesztése"** (újnál marad „Új időpont létrehozása"); alsó műveleti sáv a mockup szerint: [Időpont törlése — danger + kuka ikon, balra] [Mégse] [Mentés — primary] (korábban „Frissítés"/„Törlés" feliratok, más sorrend).
- **Chevronok**: a `cal-nav-center` prev/next gombok most a bal oldali listanézet/naptárnézet kapcsoló méretét követik (36×36 gomb, 16px ikon — korábban 20px svg volt, de a gomb széles maradt).
- **Verifikáció**: deploy `db17909` — CalendarPage chunk + fő CSS chunk élesben ellenőrizve („Időpont szerkesztése", „Időpont törlése", `cal-week-corner`, `cal-tip`, chevron sizing mind benne). Vizuális böngésző-ellenőrzés nem lehetséges (nincs browser backend) — user hard refresh után látja.

### 14. Kimenő kommunikáció logolása az ügyfélprofilba (2026-09-06 éjszaka, commit `e02b6d7` + `f758baf`)

**User kérés**: bármilyen automatikus vagy kampány üzenet megjelenjen az ügyfélprofil LEZÁRT sorai között — az interakciós naplóba NEM. Öt ügytípus-érték: Időpont visszaigazolása / Időpont emlékeztető / Időpont módosításának visszaigazolása / Időpont lemondása / Kampány. Eredmény: Kiküldve · Státusz: Lezárt · Teendő: Nincs további teendő. Sor kattintható → az üzenet szövege látszik.

- **Mechanizmus**: `log_outbound_message()` (email_processor.py) — `interactions` sor: `type='email'`, **`direction='outbound'`**, `client_id`, `classification` = {ugytipus/státusz/eredmény/teendő a fenti értékekkel}, `ai_draft_response` = {channel:'Email', subject, body} (a profil modal ebből mutatja az üzenetet). **A napló automatikusan kiszűri**: a `get_grouped_interactions` RPC `has_inbound` (BOOL_OR(direction IS DISTINCT FROM 'outbound')) szűrője kihagyja a tisztán outbound sessionöket — RPC nem változott. Stabil session: `outbound_{kind}_{client_id}` (create_session ELŐBB — az interactions.session_id FK a sessions-re, enélkül FK-hiba és csendes adatvesztés!).
- **Logpontok**: `send_booking_confirmation_email`, reminder worker (a régi type='email' log leváltva), `send_modification_confirmation_email`, `send_cancellation_email`, `_run_campaign` (Kampány, client_id-val).
- **Verifikáció**: deploy `f758baf` — élő teszt: outbound sor bent (id 781, ügyfél 257, mind a 4 érték helyes), a grouped RPC NEM adja vissza, a sima interactions listában benne van. Konténer healthy.
- **Korlát**: a Marketing modul bulk Brevo kampányai (`brevo_campaigns.send_campaign_now`) Brevo-listára mennek — ügyfél-szintű logolás ott nem lehetséges (csak a Kimenő kommunikáció `campaigns` kampányai logolódnak). **Megjegyzés**: a notification bell (NotificationCenter) ma még kaphat outbound sorokat (30 mp-enként /admin/api/interactions?limit=10) — ha zavaró, külön szűrés kell oda is.
- **NotificationCenter szűrés** (commit `40ba374`): a csengő 30 mp-es pollja kiszűri a `tool_name='outbound_notification'` sorokat — a kimenő üzenetek (visszaigazoló/emlékeztető/módosítás/lemondás/kampány) nem értesítenek, csak az ügyfélprofilban látszanak.

### 15. Hozzáadott feladatok finomhangolás (2026-09-06 éjszaka, commit `1f517a2`)

- **todo-frame**: a kézi teendő szövege fix méretű keretben (280px széles, 30px magas, border + 8px radius), `text-overflow:ellipsis` csonkolással; a teljes szöveg `title` tooltipben. CSS: clientprofile.css `.todo-frame`.
- **Kattintható sor**: a feladat-sor `row-task` osztály + `tabIndex={0}`; kattintásra ÉS Enter/Space-re megnyílik a `#todoEditOverlay` popup (ügyfélprofil: nyitott + lezárt feladat sorok is).
- **Szerkesztő/törlő popup**: textarea + [Törlés — danger, balra] [Mégse] [Mentés — primary]; mentés → új `PATCH /admin/api/tasks/{task_id}` {text} (database: `update_task_text`), törlés → DELETE; utánna `loadManualTasks()` újrarenderelés + toast. Escape zárja a popupokat (szerkesztő → hozzáadás-modál sorrend).
- **esc (HTML-escape)**: React JSX alapból escape-el (nincs dangerouslySetInnerHTML) — a szöveg biztonságosan megjeleníthető.
- **Member dashboard**: a kézi teendők teendő-cellája ott is todo-frame-et kapott (csonkolás + tooltip); a sor-kattintás ott továbbra is az elkészült-jelölés (meglévő viselkedés, nem bontottam meg). Az szerkesztő popup az ügyfélprofilban érhető el.
- **Jogosultság**: a PATCH endpoint `require_admin_or_manager` (konzisztens a DELETE-tel) — member csak complete-toggle-t tud.
- **Verifikáció**: deploy `1f517a2` — ClientDetailView chunk (todo-frame/row-task/todoEditOverlay/„Teendő szerkesztése") + CSS élőben ellenőrizve; PATCH endpoint 401 auth nélkül (létezik, védett). Konténer healthy.

### 16. Hot fix kör (2026-09-06 éjszaka, commit `732a421` + `33c5085`)

1. **Érdeklődőkezelésből nyitott profil**: vissza-gomb „Vissza az érdeklődőkezeléshez" — KanbanPage `source="kanban"`-t ad át (korábban `clients`-et, ezért ügyféllista-felirat jött). A Props `source` típus bővült: + `kanban`, `member`.
2. **Ügyfélprofil oszlopfő**: „Elvégezte" → **„Elvégezve"** (mindkét táblában + a disabled checkboxok aria-labeljei is).
3. **Következő időpont szerkesztés ikon**: az ügyfélprofil Időpontok kártya „Következő időpont" sorában ceruza-ikon → `navigate('/admin/calendar', { state: { editEventId } })`. A CalendarPage `useEffect` + `handledEditIds` ref fogadja: megkeresi az eseményt és megnyitja az „Időpont szerkesztése" popupot (events betöltése után; `useRef` dupla-nyitás ellen).
4. **Naptár szerkesztő popup — Munkatárs lenyíló**: új select („Automatikus (szabályok alapján)" + a `services.assigned_to` egyedi nevei — `GET /admin/api/services`-ből). `newEvent.assigned_to` mentése create/update payloadban → `calendar_events.doctor` (a 12. tétel óta az add/update kezeli). `openEventEdit` előtölti `ev.doctor`-ból.
5. **Sidebar Interakciós napló kattintás bezárja a profilt**: `useEffect` a `location.key`-re — a Sidebar navigate-je ugyanazon path esetén is új key-t ad, ami nullázza a `selectedClientId`-et (csak InteractionsPage-ben).
6. **Vissza-gomb címkéje**: „Vissza az interakciós listához" → **„Vissza az interakciós naplóhoz"**. (Member dashboard saját: „Vissza az irányítópulthoz".)
- **Verifikáció**: deploy `33c5085` — chunkok tartalom szerint ellenőrizve (címkék, editEventId, Munkatárs select, location.key logika a forrásban); „Elvégezte" nem maradt sehol. Konténer healthy.

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

### Migráció 5: `processed_emails` claim törlés — mind a 3 teszt-domain (2026-09-06 este)
```sql
DELETE FROM public.processed_emails
WHERE from_email ILIKE '%@yahoo.ie' OR from_email ILIKE '%@molaire.hu' OR from_email ILIKE '%@feedbacks.hu';
```
**Ok**: a user ismét törölte a saját ügyfélrekordjait, hogy tiszta lappal tesztelhessen — 16 claim törlödött (et_orosz@yahoo.ie ×5, erika@molaire.hu ×10, erika@feedbacks.hu ×1). Konténer-restart NEM történt (szándékosan): a friss levelek új UID-del a high-water mark fölé esnek, így úgyis feldolgozásra kerülnek; a restart a 3 napos ablakban lévő régi tesztemaileket újraküldené.

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
