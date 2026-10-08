# KUTATÁSI JELENTÉS — Kimenő KAMPÁNY: jelenlegi állapot + üzemeltetési javaslat
*(research subagent, 2026-10-08 — read-only vizsgálat, kód: fájl:sor, DB: read-only SELECT prod + staging MCP-n; kulcsértékek nem kerültek kiírásra; semmi nem módosult. Brief: CAMPAIGN_OPERATION_RESEARCH_BRIEF.md)*

## A) A kampány-rész JELENLEGI ÁLLAPOTA

### A/1. Adatmodell — `campaigns` tábla
A táblának **nincs migrációs fájlja a repóban** (csak a DB-ben él). Prod séma:

| mező | típus | default | megjegyzés |
|---|---|---|---|
| id | bigint | — | |
| name | text | NOT NULL | |
| status | text | 'Vázlat' | státuszgép: A/6 |
| client_ids | jsonb | [] | **befagyaszott ügyfél-ID lista** — nincs tags-kapcsolat |
| ai_instructions | text | '' | **prefix-kódolású** tartalom (lásd lent) |
| processed_count / total_count | int | 0 | küldési/hívási számláló |
| channels | jsonb | ["email"] | |
| created_at | timestamptz | now() | |
| tenant_id | uuid | — | tenant-scope |

**NINCS**: `scheduled_at` oszlop (az ütemezés az `ai_instructions` `SCHED:<dátum>|` prefixében él — `web_server.py:5992-6019`), `created_by` (a UI hivatkozik rá: `OutboundPage.tsx:36,420` → mindig „Admin"), csatornánkénti/eredmény-számlálók, script-verzió.

**Prefix-kódolás** (séma elkerülése végett, konzisztens minta): `MODE:ai:` (`database.py:2998-3011`), `SUBJECT:…|` (`web_server.py:5872-5890`, `database.py:3047-3066`), `SCHED:…|` (`web_server.py:5992-6019`). Lecsippentés: worker (`web_server.py:6169-6187`), scheduler (`191-198`), UI (`CampaignDetailPanel.tsx:62-83`, `CampaignMenu.tsx:26-31`).

**Célcsoport / secondary_tags**: a célcsoport a létrehozás pillanatában ID-listává fagy (`client_ids`) — címkék csak a wizard szűrőjében élnek kiválasztáskor (`CampaignWizardModal.tsx:80-89,151-183`), mentéskor ID-listává alakulnak (`305-314`). A klasszifikátor `secondary_tags`-címkéi beépülnek a wizard címke-listájába — a klasszifikáció ma is képezhet kampány-célcsoportot, de csak kézi frissítéskor.

**email_campaigns / brevo_campaigns — külön ernyő**: a `campaigns`-táblás email-kampány közvetlenül a **Brevo TRANSACTIONAL** SMTP-végpontra küld (`web_server.py:6247-6257`), míg az `email_campaigns`+`email_subscribers` + `brevo_campaigns.py` a külön **marketing-hírlevél** funkció (`migrate_email_campaigns.sql:7-37`; API `web_server.py:929-1143`; UI `/marketing` route). Kód-, tábla- és UI-szinten nincsenek összekötve.

### A/2. UI-folyamat
**Wizard, 3 lépés** (`CampaignWizardModal.tsx`): (1) Célcsoport (`:429-533` — státusz-badgek, címke-badgek, picker, min. 1 ügyfél `:332-334`); (2) Beállítások (`:535-605` — név + **csatornák: E-Mail / Telefon / SMS** `:551`); (3) Üzenet (`:607-831` — rich-text VAGY AI-generátor `web_server.py:6022-6132`, telefonra beszélt-stílusú script-prompt `:6056-6076`; tárgy kötelező `:284-287`).

**Listaoldal** (`OutboundPage.tsx`): státusz-chipek (`:40`), kártya/lista nézet, kebab-menü (`CampaignMenu.tsx:80-98`), ütemezés-modal (`:319-358`), részletpanel: progress csak Aktívnál (`:172-182`), **„Megnyitás/Kattintás/Visszapattant" fix 0-k** (`:186-206` — nincs mögötte mérés), címzettek + üzenet-előnézet/szerkesztés (`:86-104`).

**Jogosultság**: létrehozás + email-tartalom szerkesztés membernek is (`create` `web_server.py:5873`; PUT `:5968-5985` member csak tervezetet); **indítás/stop/lezárás/ütemezés admin-only** (`require_admin`: `5896, 5939, 5947, 5993`). Üres folt: jóváhagyás-telefon ág membernek is nyitott (`:5312-5313` `verify_jwt`, telefon-ág `:5566-5584`).

### A/3. Csatornák
| csatorna | UI kínálja | backend támogatja | állapot |
|---|---|---|---|
| Email | igen | igen (`_run_campaign` `6159-6274`, Brevo SMTP) | **E2E bizonyított prod-ban** (15 Rivergate kampány, 2026. jún.–okt.) |
| Telefon | igen | igen (`_run_phone_campaign` `6277-6437` → LiveKit SIP + agent) | stagingen E2E bizonyított; **prod-ban 0 hívás-nyom** |
| SMS | **igen** (`551`) | **NEM** — supported = `{email, messenger, telefon}` (`5901`, scheduler `:216`) | „szellemscsatorna": tisztán SMS-kampány 400, keverből csendben eldobódik (prod: 2 ilyen Vázlat #75, #90) |
| Messenger | nem (csak backend) | „támogatott", de a `_run_campaign` nem ágazik el — **e-mailként megy ki** | félrevezető |

**Telefon-worker**: napi limit (`OUTBOUND_DAILY_CALL_LIMIT`, default 200 — `6308-6313`; prod-env-ben NINCS beállítva → 200 él), dedup (`database.py:3143-3152`), telefonszám nélkül kihagy (`6342-6344`), `wait_until_answered=True` (`6383`), agent-dispatch (`6390-6396`), 15 mp hívásközi szünet (`6424`) — **a hívás végét nem várja meg**; „answered" attempt a SIP-participant létrejöttekor íródik (`6418-6420`), hibánál `_classify_sip_error` (`6426-6433`). Telefónia: `_voice_outbound_params` (`56-65`) — Dentorsnak `sip_phone_number`+`telnyx_api_key`+`telnyx_connection_id` megvan, de `sip_outbound_trunk_id` **nincs** → a **közös** env trunk-ot használja, amelynek fiókján az OVP whitelist US/CA — **a HU-403 kockázat prod-ban még áll**.

### A/4. Script / ai_instructions
Tárolás: `campaigns.ai_instructions` (prefixekkel). Szerkeszthető: wizardban member is; PUT-végpont státusz- és szerep-korláttal (`5968-5990`). AI-generálás: `generate_message` (`6022-6132`), 4 stílus, telefonnál beszélt-stílusú script-prompt (`6056-6076`). **NINCS**: sablontár, verziókezelés, jóváhagyási lépés, tiltott-tartalom szűrő, teszthívás-gomb a React adminban (a `/admin/api/sip/call` él, csak legacy hívja). Promptba építés: room metadata `script` (`6352-6359`) → `server.py:291-310` kampány-prompt, **rögzítés-tájékoztatás 1. szabályként** (`:303`). Az agent **teljes toolkészlettel** fut kampányhívásban is (`server.py:66`) — foglalhat is.

### A/5. Ütemezés
`campaign_scheduler_worker` (`web_server.py:168-235`): 30 mp-enként, minden aktív tenantra, `Ütemezett` + `SCHED:` prefix, naive dátum **Europe/Budapest**-ként (`:173,203-204`); wizard `datetime-local` inputot küld (böngésző-helyi, naive — `OutboundPage.tsx:335-341`) → eltérő TZ-nél csúszás (kozmetikus). **Napszak/nap-korlát NINCS.** Stagingen a workerek kikapcsolva (`243-245`).

### A/6. Státuszgép és eredménymérés
Státuszok: `Vázlat → Aktív → Befejezett` (email `6273`; telefon `Befejezett / Részben sikeres / Sikertelen` `6435-6436`); `Ütemezett`, `Megállítva`, kézi lezárás (`5946-5952`).
Eredményrögzítés: `call_attempts` tábla + dedup + napi limit már épülnek rá — **PROD-BAN A TÁBLA MÉG NINCS** (read-only: `relation "call_attempts" does not exist`) — a segédek fail-open (`database.py:3123-3125, 3138-3140`), tehát prodban **a napi limit és a dedup jelenleg hatástalan**, az eredmények elillannak. Stagingen a tábla él.
Konverzió-mérés **nincs**: a kampány-hívás leirata az agent-interakcióba kerül (`server.py:894-908`), a foglalás nem kapcsolódik campaign_id-hez; email-nél csak „Kiküldve" profil-sort ír (`email_processor.py:1704-1726`), megnyitás/kattintás nincs (UI fix 0).
Apróság: a napi-limit dátumszűrő fix `+02:00` offsetet ír (`database.py:3133`) — télen a nap-határ 1 órát csúszik.

### A/7. Prod-állapot (read-only)
- **17 kampány**: 15 **Rivergate** (2026-06-19 → 10-05, tipikusan email, 2-19 címzett) és **2 Dentors telefon-kampány**: #89 „Igen van időpont" (telefon, 1 ügyfél, processed=0, Befejezett, 09-29) és #99 „Téli fogkő akció 10%" (email+telefon, 1 ügyfél, processed=1, Befejezett, 10-08).
- **A két telefon-kampánynak prod-ban SEMMILYEN hívás-nyoma**: 0 `call-out-camp-*` session, 0 `phone_campaign_worker` interakció, call_attempts nincs. **Pontosítás a korábbi jelentéshez: nem csak „eredmény nélkül Befejezett" — maga a hívás sem indult el** (vagy a worker cred/egyéb hiba miatt szakadt el csendesen, amit a korabeli kód DB nem örökített). **Prod-ban a telefon-kampány ma bizonyítottan nem működik végig.**
- `email_campaigns` (marketing): 1 sor, 0 sent — a Brevo marketing-funkció kihasználatlan; a jún.-okt. email-kampányok mind transactional úton mentek.
- `outbound_automations`: 15 sor, **0 engedélyezett** (csak email).
- Dentors célcsoport-alapanyag: 127 ügyfél, **mindegyik telefonszámos**; státusz: `uj` 116 / `aktiv` 6 / `utankovetes` 5 — **egyetlen `inaktiv`/`visszatero` sem** → a wizard „Inaktív/Visszatérő" szűrője Dentorsnál üres listát ad. Címkék: „potenciális ügyfél" ~6, „árkérdés" ~4, „törölt időpont" 2, „ajánlatkérés" 2, „sürgős" 1; „no-show" és „kampánylead" **0**.

### A/8. Kód-szintű hibák/lyukak
1. **UI státusz-leképezési hézag**: az új záróstátuszok (`Részben sikeres`, `Sikertelen` — `web_server.py:6435`) nincsenek leképezve — `CampaignMenu.tsx:9-14` fallback `tervezet`, `CampaignDetailPanel.tsx:36-42` fallback Vázlat, a Lezárt-chip sem számolja (`OutboundPage.tsx:95,104`) → egy **„Sikertelen" kampány „Tervezet"-ként jelenik meg, és admin Indítás gombot kap**.
2. **SMS szellemscsatorna** (A/3).
3. **Több csatorna → processed_count verseny**: email+telefon kampánynál mindkét worker ugyanazt az oszlopot írja felül (#99-nál is látszik).
4. **Prod call_attempts-hiány → limit+dedup inaktív** (A/6).
5. `created_by` nem létezik; „Megnyitás/Kattintás/Visszapattant" fix 0 (A/2).
6. `campaign_already_called` tenant-szűrő nélkül kérdez (`database.py:3147-3148`) — campaign_id+client_id gyakorlatilag egyértelmű.
7. RLS-jegyzet: a prod `campaigns`-on „Allow all for anon" policy is él — permisszívebb a szükségesnél.

## B) ÜZEMELTETÉSI JAVASLATOK (a brief 8 kérdése)

> Alapelv: **minimál kód** — prefix-kódolás, worker-ágak, limit/dedup és jóváhagyási infra használatával; új architektúra sehol.

**1. Kik és mit indíthatnak?** Létrehozás + email-tartalom: admin+member (asszisztens előkészíthet). **Indítás/ütemezés/stop: kizárólag admin** (ma is így van) — a rendelőnél „tulajdonos/vezető" szerepkör. Zárandó lyuk: jóváhagyás-telefon ág member-relényárása (`5313` `verify_jwt` → `require_admin`, 1 dependency-csere). Hívás ELŐTTI emberi jóváhagyás helyett: **script-jóváhagyás (B/4) + kötelező teszthívás**; az első kampányoknál felügyelet: az első 3 hívás után visszahallgatás (a member dashboardon már van visszahallgatás). HU jogi keret (2003. évi C tv. §155 + GDPR): **céllista-szabályként** (B/2) + rögzítés-tájékoztatással (már a promptban), nem kódként. *Munka: KICSI.*

**2. Célcsoport-képzés** Marad a mai mechanizmus (címkék/státusz + kézi picker), **futás előtti ellenőrzéssel**. Dentorsnál hívható alap-listák: (a) „potenciális ügyfél" (ma ~6 fő), (b) „árkérdés" — csak tájékoztató hívásra, árat a hívásban **soha**; (c) „törölt időpont"/no-show: inkább **email**, nem hívás. Az „Inaktív/Visszatérő" szűrő Dentorsnál üres (A/7) — a címke-szűrő a használható. Start előtti lista-ellenőrzés: a `/admin/api/campaigns/{id}/clients` **már létezik** (`6134-6156`) és a detail panel mutatja — hiányzik a fegyelem + javasolt felső korlát (telefon-kampány max 20-30 client_ids, start-endpoint ellenőrzés ~10 sor). *Munka: KICSI.*

**3. Időzítés** Napszak-korlát a telefon-workerbe: hívás csak **H–P 09:00–17:00 Budapest** (loop-eleji ellenőrzés; korláton kívül → „Megállítva" + log; ~15 sor, zoneinfo-minta már van). Ütemezett indítás **teljes** (Budapest-TZ). Email-kampányra napszak-korlát nem kell. TZ-kozmetika opcionális. *Munka: KICSI.*

**4. Script-governance** (1) Scriptet a **rendelő vezetője hagyja jóvá**: `APPROVED:<timestamp>|` prefix az `ai_instructions`-ban (mint a `SCHED:`/`SUBJECT:`), start-endpoint telefon-csatornán APPROVED nélkül **409**. (2) **Tiltott tartalom**: árajánlat-bemondás tiltása a generáló- és kampány-promptba („árat NE mondj, arra a rendelő visszahív"). (3) **Teszthívás a saját számra** gomb a detail panelbe (a `/admin/api/sip/call` él). (4) Verziókezelést NE építsünk — jóváhagyás-pillanatkép (timestamp-prefix) elég. *Munka: KÖZEPES (túlnyomó UI).*

**5. Limit és költség** Napi tenant-limit **megvan, de prod-hatályához a call_attempts prod-migráció feltétel**. Bevezetés idején env-ben 20-50. Új: **kampányonkénti max** (startnál client_ids.length ≤ limit) és hívásközi szünet 15 → 60 mp (1 sor). **Költség-becslés indítás előtt**: detail panelben `címzettek × 2 perc × $0,005` + Telnyx-perc jegyzet. *Munka: KICSI–KÖZEPES.*

**6. Eredménykezelés** (1) **Eredmény-nézet a UI-ban**: „Hívás-eredmények" blokk — `call_attempts` countok campaign_id szerint (1 kis GET + UI-blokk). (2) **Eredményfüggő dedup**: ma minden kísérlet zárol — módosítás: `no_answer`/`busy` után 1 újahívás engedélyezett (2+ nap múlva), `answered`/`rejected` után soha (~10 sor). SMS-fallback: **ne most**. (3) Visszahívás-jelzés: már van (callback alert-tag + feladatlista) — a rendelő folyamatában rögzítsük. (4) Konverzió: rövid távon közvetett (kampány-időszaki foglalás-összevetés, emberi kiértékelés); automatikus campaign_id→foglalás csak a 3. lépésben. *Munka: KÖZEPES, bontható.*

**7. Monitoring/riasztás** Rendelőnek: kampánylista + detail + hívás-eredmény blokk + javított státusz-badgék („Sikertelen" piros, ne „Tervezet"). Üzemeltetőnek: konténer-log `[PhoneCampaign]` sorai + heti gyors-SQL a call_attempts-en. Automatikus riasztást NE építsünk az 1-2. lépésben; legolcsóbb: „Sikertelen" kampánynál egyszeri email (~15 sor). *Munka: KICSI.*

## C) FOKOZATOS BEVEZETÉSI TERV (Dentors Szeged)

**0. lépés — ami már él**: email-kampány E2E-bizonyított prod-ban (15 lefutott); teljes hívási lánc stagingen E2E-bizonyított; Dentors prod telefónia-cred megvan. *Elfogadási kritérium:* ≤10 címzettes email-kampány: processed=total, minden kiküldés látszik, 0 panasz.

**1. lépés — prod-alapok (művelet + minimál kód)**: (a) **call_attempts + RPC prod-migráció** (fájl kész: `migrate_call_attempts_outbound.sql`); (b) **közös trunk Telnyx-fiók OVP-whitelist +HU** + Dentors OVP→connection linkelés (portál/API); (c) `OUTBOUND_DAILY_CALL_LIMIT=20` prod env; (d) UI státusz-leképezés javítás; (e) hívásközi szünet 15 → 60 mp. *Belső teszt:* 1-2 hívás a `/admin/api/sip/call`-on Dentors prod számáról a **rendelő saját számára**. *Elfogadási kritérium:* call_attempts sor valós eredménnyel; leirat + felvétel visszahallgatható; limit-számláló mutatja; nincs 403.

**2. lépés — első valódi kampány, felügyelettel**: jóváhagyott script + **céllista-szabály** (csak „potenciális ügyfél"/esetleg „árkérdés", telefonszámos, **max 5-10 fő**) + napszak-korlát + a rendelő tudja, hogy felügyelt. Admin indítja munkaidőben; **az első 3 hívás után manuális ellenőrzés** (Megállítva → visszahallgatás → folytatás). *Elfogadási kritérium:* minden célzott ügyfélhez pontosan 1 kísérlet (dedup naplózva); minden eredmény látszik; ≤2 technikai hiba, láthatóan; leiratok az ügyfélprofilban; **0 panasz**; script-finomítási döntés visszaigazolva.

**3. lépés — rutin üzem**: 2-3 sikeres futás után; eredmény-nézet UI-ban; script-jóváhagyási lépés élesben; **folyamatleírás** (ki mikor indíthat, mi tiltos); költségkeret. Tartalom: heti/kétheti kampányok; céllista-sablonok; havi elszámolás. *Elfogadási kritérium:* 4 hétig 0 jogi panasz, 0 limit-sértés, minden kísérlet naplózva; a rendelő admin közreműködése nélkül kezeli a napi működést.

## D) NYÍLT KÉRDÉSEK (user-döntés)

1. **Jogi alap a híváslistákhoz**: §155 szerinti hozzájárulás miből adódik Dentorsnál? Elég a „potenciális ügyfél" címke telefonos felkínáláshoz, vagy explicit opt-in kell? (User/jogi döntés.)
2. **Ki a script-jóváhagyó és ki az „admin"** a rendelőnél?
3. **Napi mennyiség és költségkeret**: 200 helyett mekkora napi limit (javaslat: 20 bevezetéskor), mekkora havi plafon?
4. **No-answer politika**: 1 automatikus úrahívás engedélyezve legyen-e, vagy minden újrahívás kézi?
5. **SMS-csatorna sorsa**: UI-ból eltávolítani, vagy implementálni? (A 2 meglévő SMS-Vázlat indíthatatlan.)
6. **Rögzítési retenció**: prompt 14 nap vs retention 30 nap — kampányhívásnál fokozottan érzékeny.
7. **Közös trunk fiók ország-engedélye**: US/CA + HU, vagy tisztán HU?
8. **Messenger „csatorna" sorsa**: ma e-mailként megy — rejtssük el implementációig?
9. **Konverzió-mérés mélysége**: közvetett (időszaki összevetés) elég, vagy kampány→foglalás automatikus lánc (3. lépés)?

---

**Összegzés egy mondatban**: az email-kampány ma is működőképes és prod-bizonyított; a telefon-kampány kódlánc-kész, de prod-ban egyszer sem futott le bizonyíthatóan — a bevezetés kulcsa nem új fejlesztés, hanem **négy kis kódjavítás** (prod call_attempts-migráció + HU-whitelist művelet, UI státusz-leképezés, napszak-korlát + szünet-tuning) és **szigorú, fokozatos operatív fegyelem** (jóváhagyott script, kis címkézett lista, felügyelt első futások).
