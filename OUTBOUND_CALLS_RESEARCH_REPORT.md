# KUTATÁSI JELENTÉS — Kimenő hívások meglévő infrastruktúrája
*(research subagent, 2026-10-09 — read-only vizsgálat, minden állítás fájl:sor hivatkozással ellenőrizve; a brief: OUTBOUND_CALLS_RESEARCH_BRIEF.md)*

## 1. Kampányhívás-végpontok

**Három indítási út létezik, mindegyik ugyanazt a LiveKit-mintát használja** (room → `create_sip_participant` → agent dispatch):

| Út | Végpont / hely | Jogosultság |
|---|---|---|
| Egyedi, kézi script-hívás | `POST /admin/api/sip/call` — `web_server.py:5177-5252` | admin (`require_admin`, 5178) |
| Jóváhagyott draft „telefon" csatornája | `approve_approval_api` telefon-ág — `web_server.py:5540-5593` | **member is** (`verify_jwt`, 5287) |
| Telefon-kampány | `POST /admin/api/campaigns/{id}/start` — `web_server.py:5869-5910` → `_run_phone_campaign` — `web_server.py:6251-6383` | admin (5870) |

- Room-név: `call-out-{8hex}` (`5192`, `5555`), kampánynál `call-out-camp-{campaign_id}-{6hex}` (`6315`); metadata `type`: `outbound_script_call` / `campaign_call`, mindhárommal `tenant_id` is átmegy (`5204`, `5562`, `6312`).
- `create_sip_participant`: `sip_trunk_id` + `wait_until_answered=True` + `sip_number=caller_number` (`5220-5231`, `5573-5584`, `6330-6341`); agent dispatch nem blokkol (`5234-5240`, `6344-6350`).
- Kampány-worker: LiveKit-cred hiányánál megszakít (`6265-6268`); telefonszám nélküli ügyfelet kihagy (`6296-6298`); sikeres hívásnál session + `direction="outbound"` interakció (`6355-6368`); **15 mp szünet** hívások közt (`6375`); stop a „Megállítva" státuszon át (`6280-6284`); ütemezett kampányt a scheduler is indít (`226-229`); staging-módban a háttér-workerek kikapcsolva (`242-244`).

**UI-ból honnan hívják:**
- Kampány-indítás: `OutboundPage.tsx:113`; Telefon csatorna a wizardban (`CampaignWizardModal.tsx:551`).
- Az `/admin/api/sip/call`-t **csak a legacy admin UI** hívja (`js/admin-core.js:738`) — az aktív React bundle-ben NINCS benne. **A React adminban nincs „hívás indítása" gomb.**

**Él-e, tesztelték-e:** Stagingen igen — 2026-10-08: 1 valós E2E kimenő hívás (`call-out-49546f6f`, 45 mp, `direction=outbound`, leirat + klasszifikáció rendben). **Prodban egyetlen `call-out-` session sincs**; a két telefon-kampány „Befejezett", de sikeres hívás-nyom nélkül.

**Hibakezelési lyukak:** nincs hívás-eredmény megkülönböztetés (nem-elvesz / fogadott / elutasított / hangposta egyetlen generikus kivételbe fut — egyedi hívásnál 500 `5251-5252`, kampánynál konzol-print + `failed` számláló, **DB-be nem kerül** `6377-6380`). Hangposta/AMD-detektálás, ringing-timeout, újrahívás: nincs. Sikertelen kampány-hívásnál is „Befejezett" lesz (`6382`) — a hibák elillannak.

## 2. `outbound_automations`

**Nem placeholder — él worker tartozik hozzá, de csak EMAIL csatornára:**
- Séma + seed: `migrate_outbound_automations.sql:6-15` (5 seedelt sor, **enabled=false, channel=email**), `automation_sent_log` dupla-küldés-védelem (67-73).
- DB: `database.py:3105-3123` (tenant-scoped + auto-seed), `update_outbound_automation` `3125-3134`, `check_automation_sent` `3136-3143`. API: GET `5814-5817` (member), PUT `5819-5827` (admin). UI: `SettingsPage.tsx:274`.
- **Worker:** `automation_worker_loop` (`email_processor.py:2901-2918`, 5 percenként, minden tenantra, indítva `web_server.py:256`) → `_run_automations_for_tenant` (`2770-2898`): trigger-ök no_show / inactive_client / cancelled_no_rebook / follow_up / price_inquiry_follow, **kizárólag jóváhagyásra váró EMAIL piszkozatot** készít (`channel: "Email"` beégetve `2878`). Telefon csatorna-ág nincs, hiába szerkeszthető a `channel` mező.
- Állapot: staging 5 sor / 0 engedélyezett; prod 15 sor / 0 engedélyezett, 0 piszkozat valaha. **Be van kötve, de sehol nincs bekapcsolva, és telefonra nem képes.**

## 3. Telnyx/LiveKit telefónia tenantonként

Egy kimenő híváshoz kell: (1) Telnyx API kulcs, (2) Outbound Voice Profile (`telnyx_provision.py:88-97`), (3) FQDN connection + FQDN (`100-134`) — **a create-ben az OVP NEM linkelődik a connection-re (`107-110` komment), kézi portál-lépés**, (4) szám a connectionre (`137-139`), (5) kimenő LiveKit trunk — **nincs per-tenant outbound trunk**: a provisioning csak a **közös** env `SIP_OUTBOUND_TRUNK_ID` szám-poolját bővíti (`web_server.py:5015-5022`); a `sip_outbound_trunk_id` tenant-credet olvassák ugyan (`55-64`), de a provisioning **soha nem írja** (csak inbound: `4983`), és kódba égetett default trunk-ID is van (`61`). Minden kimenő hívás a közös trunkon megy; caller-ID a tenant `sip_phone_number`-e.

**Prod-tenant állapot (read-only):**
- **Dentors Szeged: KOMPLETT** (telnyx_api_key, connection_id, outbound_profile_id, sip_phone_number).
- **Rivergate: SEMMI** telefónia (csak Brevo+IMAP). Demo/TestCo: demó.
- **Ismert blokkoló:** a közös outbound trunk mögötti régi Telnyx-fiók OVP-je csak USA/CAN → minden HU-címzett hívás **403**; az OVP→connection linkelés portál-munka. (Részben már javítva: a Rivergate staging SAJÁT fiókján a `whitelisted_destinations=['HU']` beállítva és élő hívás bizonyította — a KÖZÖS trunk fiókján és a prod-tenantoknál még áll.)
- Költség-modell az analitikában: $0,005/perc (`web_server.py:8725`).

## 4. Agent-oldal (server.py) outbound ága

- Irány-detektálás room-prefixből: `server.py:153-155` (`call-out-` / `call-out-camp-` / inbound).
- Tenant-feloldás outboundnál room/dispatch metadata-ból (`159-183`), inboundnál DID reverse-lookup (`199-218`); `set_current_tenant` (`223-225`).
- Script-betöltés: két külön prompt (`268-288`, `290-308`); greeting tenant practice-name-nel (`404-415`); a bejövő `get_system_prompt()` + döntési mátrix outboundnál **nem** töltődik be (`310`).
- Toolkészlet: outbound agent = teljes `ALL_TOOLS` (`66`) — kampányhívásban is tud foglalni/riasztani.
- Zajszűrés: BVCTelephony (`496-501`). Naplózás: `direction="outbound"` (`899`).
- Harness: `run-email-verify` **minden** hívásnál fut (`929-957`), outboundon gyakorlatilag üres (önmagát kapuzza: foglalás + magyar mobil + diktált cím kell) — de egy explicit `is_outbound_call → skip` olcsóbb és tisztább lenne.
- **GDPR: a kimenő promptokban NINCS rögzítés-tájékoztatás** (az egyetlen ADATVÉDELMI blokk az email-felolvasásról szól, `384`).

## 5. UI

- Kampány UI teljes: wizard + Telefon csatorna, indítás/stop/ütemezés; admin kapuzás konzisztens (UI `OutboundPage.tsx:52,55,255`, backend `5870`).
- Egyedi „hívás indítása" gomb NINCS az aktív React adminban (csak legacy fallback).
- Telefónia-beállító UI megvan: `VoiceProvisioningSection.tsx` (`web_server.py:4873-5031`).
- **Jogosultsági üres folt:** a jóváhagyás endpoint telefon-ága **membernek is elérhető** (`5287`) — „ki indíthat kimenő hívást" kérdésre: admin (sip/call, kampány) + **member (jóváhagyás-telefon)**.

## 6. Hiányzó darabok forgatókönyvenként

**(a) Időpont-emlékeztető hívás** — Megvan: reminder-worker infra (email/SMS, 24 órával előtte, tenant toggle `email_processor.py:2035-2167`), teljes kimenő lánc, Dentors prod-cred. Hiányzik: telefonszám a `calendar_events`-hez (clients-join kell — `supabase_schema.sql:41-42`), „telefon" csatorna a reminder workerben, emlékeztető-script, no-answer → SMS-fallback. **Munka: KÖZEPES.**

**(b) Handoff-visszahívás automata** — Megvan: handoff mód, `report_alert('callback')` címke (`tools.py:1489-1546`), tasks + `create_task` tool, kimenő primitív. Hiányzik: determinisztikus trigger-worker, időablak/ütemezés, retry-eredmény, emberi jóváhagyás a hívás előtt. **Munka: NAGY.**

**(c) Kampányhívás** — Megvan: teljes lánc UI → worker → agent, tenant-metadata, Dentors prod-cred. Hiányzik: HU OVP-whitelist javítás (közös trunk fiókja + prod-tenantok), OVP→connection linkelés, hívás-eredmény + újrahívás, hibák DB-naplója, consent-nyilvántartás, limit/költség-védelem, **prod-éles validáció (0 eddigi prod hívás)**. **Munka: KÖZEPES.**

## 7. Kockázatok

1. **GDPR/hozzáférés:** nincs rögzítés-tájékoztatás a kimenő promptban; HU-ban kampányhíváshoz explicit opt-in kell (2003. évi C tv. §155 — saját tervdokumentum is jelzi: `VOICE_TERV_MULTI_TENANT.md:100`); consent-nyilvántartás nincs; member is indíthat hívást a jóváhagyási úton.
2. **Költség:** nincs híváslimit / napi kvóta / költségplafon (kampány korlátlanul megy végig a listán); a 15 mp szünet után nem várja meg a hívás végét.
3. **Betanítatlan script:** szabadtext, nincs előnézet/tesztfutás; az agent teljes toolkészlettel fut — kampányhívás közben is foglalhat, ami nem kívánt viselkedés.
4. **Dupla hívás:** nincs dedup/lock (AI-kampány + emberi hívás egyszerre; kampány-újraindítás úrahívhat).
5. **Technikai:** kódba égetett default trunk-ID (`61`); per-tenant outbound trunk cred olvasásról írás nélkül (`60` vs `4983`); OVP-connection link hiánya (`telnyx_provision.py:107-110`); HU 403 a közös trunk fiókján; hibák DB nélkül (`6377-6380`); **tisztán outbound sessionöket a listanézet RPC kiszűri** (`migrate_interaction_count_toollog.sql:25` `has_inbound` filter) — a kampány-leiratok csak az ügyfélprofilban látszanak.

## ÖSSZEGZÉS — minimális, megbízható kimenő híváshoz

Közös alap (egy helyen javítandó): **(1)** HU-működő Telnyx OVP whitelist + OVP→connection linkelés (portál), **(2)** hívás-eredmény rögzítés (answered/no-answer/rejected/voicemail) DB-be, **(3)** rövid rögzítés-tájékoztatás a kimenő promptokban, **(4)** per-tenant híváslimit/költségplafon és dedup.

| Forgatókönyv | Megvan | Hiányzik | Munka |
|---|---|---|---|
| Időpont-emlékeztető hívás | kimenő lánc E2E-bizonyított, reminder-worker, Dentors prod-cred | telefonszám-join, „telefon" csatorna a workerben, script, no-answer → SMS-fallback | **KÖZEPES** |
| Handoff-visszahívás | handoff mód + callback-címke + tasks + hívási primitív | trigger-worker, ütemezés, retry, emberi jóváhagyás | **NAGY** |
| Kampányhívás | teljes kód-lánc, Dentors prod-cred | HU OVP-403, eredménykezelés, DB-napló, consent, limit, prod-validáció | **KÖZEPES** |

Leggyorsabban a **kampányhívás** vihető megbízható állapotba; az **emlékeztető-hívás** következik; a **handoff-visszahívás** a legnagyobb (új vezérlő-réteg) — de hívási primitívet egyikhez sem kell újraírni.
