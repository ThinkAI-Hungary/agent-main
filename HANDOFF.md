# HANDOFF — eaisyDesk | 2026-09-14

## ⚠️ ÁLLANDÓ MUNKAREND — minden sessionnek

- **Ezt a HANDOFF.md-t MINDEN utasítás elvégzése UTÁN frissíteni kell** (mit csináltunk, hol állunk, mi a következő lépés), majd commit + push `origin/rebuild`-re. Cél: bármikor indulhat új session, ebből a fájlból kell tudnia folytatni.
- Deploy után verifikálni (konténer healthy, logok tiszták), és az eredményt is beírni.
- A friss, teljes rendszerdokumentáció: `/root/eaisydesk-handoff-final.md` (a repón KÍVÜL van, mert kulcsokat tartalmaz — soha ne commitold!). A repóban lévő régi dokik (`dokumentumok/`, AGENT_DOCS, RENDSZERLEIRAS) elavultak.

## Projekt áttekintés

- **Repo**: `/root/dobozos` — branch: `rebuild` (push: `origin/rebuild`)
- **Staging URL**: https://digideskadmin.molaire.hu
- **Deploy**: `/root/ugyfelszolg/docker-compose.yml` → `dobozos-agent` konténer, build context: `../dobozos`
- **Supabase**: `qhhnqqsthdrwacsxommt.supabase.co` (service_role kulcs a `.env`-ben)
- **Admin login**: `.env` → `ADMIN_USERNAME` / `ADMIN_PASSWORD`
- **Management API**: Supabase MCP configban `sbp_*` token — élő DB DDL futtatható vele

---

## ⚠️ KRITIKUS INCIDENS + JAVÍTVA (2026-09-14 délelőtt) — prod hálózati kimaradás deploykor: dockerd kikapcsolja az eth0 IPv6-át

**Tünetek** (mind egyetlen gyökérből): hívások időnként nem mennek („nálam csörög, másnál nem"), login 401/lassú, a felületen időnként „Váratlan hiba történt a felületen" ErrorBoundary, Supabase/IMAP/Gemini hibák a logokban: `[Errno -3] Temporary failure in name resolution`, `[Errno 101] Network is unreachable`, `Server disconnected`.

**Gyökérok (journal-bizonyíték)**: a konténer-recreatekor a dockerd átírja a host sysctl-jét: `net.ipv6.conf/eth0/disable_ipv6: 0→1` (journal: „Foreign process 'dockerd' changed sysctl … conflicting with our setting"). A `systemd-resolved` ekkor az IPv6-os Hetzner DNS-szervert (2a01:4ff:ff00::add:1) használta → a v6 útvonal elvesztésével a DNS és a v6 kimenő forgalom is szakadt ~30-40 percre. **NEM a DB-migráció hibája** (a prod séma kompletten megy a staginggel — összehasonlítva).

**Javítások (mindkettő élesben alkalmazva)**:
1. **Host**: `resolvectl dns eth0 185.12.64.1 185.12.64.2` (IPv4 resolver-ek, azonnali) + boot-álló `set-v4-dns.service` systemd oneshot (enabled).
2. **Prod compose** (`/root/ugyfelszolg/docker-compose.yml`, backup: `docker-compose.yml.bak-ipv6fix`): a `dobozos-agent` service kapott `dns: [185.12.64.1, 185.12.64.2]` (közvetlen v4 resolver, kikerüli a resolved-ot) és `sysctls: net.ipv6.conf.all/default.disable_ipv6=1` (a konténer IPv4-only → a host v6-állapota már nem érinti). Recreate megtörtént, verifikálva: DNS 8/8, Supabase élő OK, login 200/0,19s, 0 ERROR, konténer healthy.
3. **Staging compose**: ugyanez, de `dns: [1.1.1.1, 8.8.8.8]` (a Hetzner resolver a DigitalOcean-ről NEM elérhető — tesztelve). A következő `update.sh` rebuildnél aktiválódik.

**Tanulság**: minden prod deploy (konténer-recreate) válthatja ezt a dockerd–systemd-networkd sysctl-konfliktust. Ha a tünetek visszaadják magukat: `journalctl | grep disable_ipv6` + `resolvectl status` (Current DNS Server v4 legyen) + konténer: `cat /proc/sys/net/ipv6/conf/all/disable_ipv6` = 1. Hosszú távú megoldás lehet a dockerd frissítése vagy a host netplan DNS-beállítása (netplan apply kockázatos SSH-n — karbantartási ablakban).

---

## ✅ 2026-09-14 — PROD DEPLOY levezényelve: a staging 4 napi lemaradása pótolva (prod HEAD `592f99e`, konténer healthy)

**Előkészület (prod DB, MCP migráció: `staging_sync_2026_09_13_prod`)**: a 7 előírt migrációból 5 már korábban fent volt a prod DB-n — csak `interactions.diary_fragment` és `business_info.updated_by` hiányzott (felvéve), + `UPDATE admin_users SET role='admin' WHERE role='manager'` (2 user: testco_manager, dentors_manager → most már 0 manager, 7 admin). A `campaigns.id` identity prodon OK volt (nem kellett javítani).

**Deploy**: `deploy-prod.sh --yes` → prod HEAD `592f99e`, konténer healthy.

**Verifikáció (mind zöld)**:
- backend md5-egyezés konténer vs. repo (web_server/email_processor/server/database)
- frontend: 38 content-hash chunk, nevek megegyeznek a staging builddel → azonos forrás
- `require_admin_or_manager` a prod konténerben is 0 (a jogosultsági mátrix él)
- 0 ERROR a deploy óta; `/api/health` OK; worker `dobozos-ai`-ként indult
- auth: `/admin/api/credentials` token nélkül 401 ✓; login `/admin/login` érvényes creds-szel **200 (0,1–0,2s)** ✓ — az első, közvetlenül deploy utáni 401/32s a hideg-start Supabase-akadozás volt (ld. a reggeli `get_active_tenants: Server disconnected` blipet is)

**Megjegyzés a csapdáról**: a login-smoketest a host-ról `localhost:8000`-en NEM megy (a port csak a docker-hálózaton belülre van exponentálva) — `docker exec`-ből kell; a `.env` a konténerben env-változóként él, nem fájlként.

---

## ✅ 2026-09-21 (7. kör) — Tiszta-lap teszthívás 9 hibája (commit `7c07231`, stagingen ÉL)

1. **Átirat-sorrend**: a popup időbélyeg-sortja szedte szét a turnusokat (kevert forrású ts: chat-context fallback vs valós event). A session-szakítás és megjelenítés most a napló append-sorrendje; a ts csak kijelzés.
2. **Napló számláló**: tool-logok (foglalás/lookup) interakciónak számítottak → `get_grouped_interactions` SQL-függvény: count + reprezentatív sor tool-mentes. **Staging Management API-val ÉL; prod-deploynál a `migrate_interaction_count_toollog.sql` is kell!**
3. **„potenciális ügyfél" címke** jelentése: „érdeklődött, de NEM foglalt" → sikeres `book_meeting` után automatikusan törlődik (konverzió).
4. **Profil tool-log sorok** (átirat nélküli duplikátum) kiszűrve (voice_alert marad).
5. **Profil Időpont**: ellátó (doctor) is látszik.
6. **„minden fogorvos" poolból dentálhigiénikusok kizárva** (aki csak higiéniai szolgáltatáshoz rendelt — fogkő/dentálhigién/higién/air-flow/políroz név-minta): a Konzultációra véletlenül higiénikus (Balogh Pálma) került.
7. **Naptár szerkesztő popup**: `attendee_phone` behúzódik (volt: mindig üres mező).
8. **Hívószám a promptba**: korai SIP-feloldás a `ctx.connect()` után (a gemini-3.1 mid-session instruction-update-et nem támogat!) → az agent nem kéri el újra a hívó számát.
9. **CalendarPage member-szűrés kivezetve** (a mátrix szerint member minden eseményt lát).

**Ismert korlát (Q9 válasz)**: a „Járt már nálunk korábban?" kérdésre az agent NEM tud hívás közben ügyfelet keresni — nincs `find_client` tool. A név-bekérés után a kapcsolás a hívás VÉGÉN, a klasszifikációban történik (resolve_client_identity). Javasolt fejlesztés: `find_client` tool (név alapú keresés + meglévő adatok visszaolvasása azonosítás után).

---

## ✅ 2026-09-21 (6. kör) — Split-brain incidens + duplikátum-kezelő rendszer (commit `0526efd`, stagingen ÉL)

**Incidens**: álnév-teszt („Kiss Gizella" + erika@molaire.hu, hívó +36703200236) — a foglalás az emailhez (új 271-es ügyfél), az átirat/klasszifikáció a telefonhoz (265 = Orosz Erika) kapcsolódott; a profil laza név/telefon session-egyeztetése keresztbe-húzta a két ügyfelet.

**A megoldás (4 rész)**:
1. **`resolve_client_identity`** (database.py): erős kulcsok KÜLÖN egyeznek (phone > messenger > email primary-sorrend), eltérésnél primary + conflict_id — NEM csendes választás. Bekötve: voice klasszifikáció + `book_meeting`.
2. **`duplicate_suspect` jelző + merge flow**: konfliktusnál mindkét rekord megkapja (custom_data.duplicate_suspect = {other_id, reason, detected_at}); profilon sárga banner + „Összevonás…" modal mező-szintű keep-választással (név/email/telefon). Backend: `db.merge_clients` + `POST /admin/api/clients/merge` (admin-only) — interakció-átkötés, napló/címke-únió, source `status='merged'` + `merged_into` (visszavonható); a merged rekordok rejtve a listában/kanbanon. A 265/271 pár manuálisan bejelölve — a user a felületen döntheti el az összevonást.
3. **Profil session-egyeztetés szigorítva**: név-substring és telefon-a-session_id-ben szabályok KIVEZETVE (keresztbe-húzás); a behúzott session interakciói client_id-re újraszűrve.
4. **Single-módú popup**: nem-email csatornán az interakció SAJÁT átirata (result) az elsődleges, ügyfél-napló csak fallback.

**Nyitva**: a 265/271 tényleges összevonása a USER döntése (a felületen elérhető). A régi, tz-fix előtti naplók kevert időbázisa más ügyfeleknél is okozhat popup-szakadást (ld. 4. kör megjegyzés).

---

## ✅ 2026-09-21 (5. kör) — MINDEN foglaláshoz ellátó (commit `6bc1256`, stagingen ÉL)

**User-szabály**: foglalás csak ellátó munkatárs hozzárendelésével keletkezhet — függetlenül az ügyfél-preferenciától. A `resolve_assigned_staff` (explicit → `services.assigned_to` névsor → releváns pool; a „minden fogorvos" szöveget kiszűri) már működött a kézi naptár-végponton és az email pending flow-ban, de **két úton hiányzott**: a voice `book_meeting` (ezért maradt a 115-ös esemény doctor nélkül — backfill: Dr. Molnár Bence) és a messenger/web flow eseménylétrehozás. Mindkettő bekötve. Az agent a beszélgetésben továbbra sem nevezi meg az ellátót — a név az `event.doctor`-ban és a visszaigazoló email `{{munkatárs}}` változójában oldódik meg.

**Megjegyzés (nem javítva, user-döntés kell)**: a 115-ös esemény 30 perces lett, pedig az Implantációs konzultáció a szolgáltatás-tábla szerint 60 perces — az agent a default 30-at adta át. Javaslat: szolgáltatás-egyezésnél a tábla duration-je felülírja az LLM-ét.

**Időtartam-szabály implementálva (commit `f61ec65` + `b74dbda` + `3d1fbf7`)**: `resolve_service_duration` — szolgáltatás-egyezésnél a TÁBLA időtartama nyer az LLM 30 perces defaultjával szemben (voice + email pending + messenger/web flow; a kézi naptárfelvétel érintetlen). A 115-ös esemény backfillve (60 perc; az email-módosítás 14:00-re vitte, az is rendben — 12:00 UTC = 14:00 CEST). Egyeztetési rangsor mindkét feloldónál (duration + ellátó): **PONTOS > nm⊂cím (leghosszabb) > cím⊂nm (leghosszabb)** — így „Implantációs konzultáció - X" → 60 perc + implant-ellátó, puszta „Konzultáció" → 45 perc, ismeretlen → átadott érték + pool.

**Naptár-törlés javítva (commit `4511d48`)**: a CalendarPage a sosem létezett `/admin/api/clients/calendar/{id}` útvonalat hívta DELETE-tel → 405. Helyes: `/admin/api/calendar/{id}`. E2E tesztelve (tesztesemény create+delete, member 200 — a mátrix szerint member törölhet). Tanulság: a 405-ös válasz útvonal-eltérést jelez, nem jogosultsági hibát.

---

## ✅ 2026-09-21 (4. kör) — popup/megjelenítés javítások (commit `25283ce`, stagingen ÉL)

1. **„Szolgáltatás: Implantációs konzultáció - Orosz Erika"** — a popup ÖSSZEFOGLALÁS és a profil Időpont-szekció az esemény nyers címét mutatta, az ügyfél neve feleslegesen ismétlődött. Most a `<szolgáltatás> - <ügyfélnév>` suffix levágódik; az ellátó külön „Ellátó:" sorban (volt „Orvos:").
2. **Üres popup / aktuális hívás az Előzményekben (újra)**: a tz-fix (fd5874e) deploy ELŐTT íródott naplóbejegyzések vegyes tz-bázisúak maradtak → a session-grouping szétszakította a hívásokat. Client 265 naplójában 52 UTC-s turnus-időbélyeg Budapestire korrigálva (+2h). ⚠️ Más ügyfelek régi (tz-fix előtti) voice-naplóiban ugyanez előfordulhat — globális normalizálás csak körültekintően (a budapesti fejlécek és UTC-turnusok nem mindig megkülönböztethetők).
3. **Email thread-popup „előzmény nélkül"**: a profil/single mód TERVEZETTEN csak a saját váltást mutatja (előzmény nélkül); a napló/thread mód mutatja az előzményeket. Ha a thread módban sem látszik, az a 2-es pont adatproblémája volt.

---

## ✅ 2026-09-21 (3. kör) — foglalás-teszt hibái (commit `fd5874e`, stagingen ÉL)

A második teszthívás (session 826/827) már JÓL foglalt (book_meeting lefutott, esemény 115), 5 új hiba:

1. **Visszaigazoló email nem ment ki (Brevo 400)**: a `sender_email`/`sender_name` is áldozatul esett a 09-13-i business_info wipe-nek — a restore-ból kimaradt. Prod-értékek visszaállítva (Rivergate Dental <hello@thinkai.hu>), a 115-ös esemény visszaigazolása kézzel újraküldve (sikeres). ⚠️ Tanulság: a smoke-teszt wipe teljes körét a sender mezők is jelzik — a restore-checklist: price_list, faq, campaigns, exceptions, service_description, kulcsszavak, szakterulet, markanev, szabály-mezők, **sender_name/sender_email**.
2. **Popup „Előzmények"-ben az aktuális hívás + 2 órás időeltolódás (közös gyökér)**: a napló-fejléc budapesti, a turnus-időbélyegek UTC voltak → a hívás 2 „session"-re szakadt (>30 perces gap), az egyik az előzményekbe került. Minden transcript-időbélyeg most Budapesti (`_now_hu()`).
3. **„Dentors Member" ellátó**: a book_meeting default-assignee fallbackja (Kis Béla / „első member") tenant-szűrés nélküli volt → KIVEZETVE (a jogosultság-mátrix óta a member minden ügyfelet lát); client 265 felelőse tisztítva; `/admin/api/members` is tenant-szűrt lett.
4. **Esemény telefonszám hiányzott**: a book_meeting nem adta át az attendee_phone-t → `add_calendar_event` új paraméter + 115-ös esemény backfill.
5. **15:00-s foglalás 13:00+00:00-ként tárolva** — KORREKT (CEST→UTC), a naptár jól mutatja.

---

## ✅ 2026-09-21 (2. kör) — Voice teszthívás (Orosz Erika) hibáinak javítása (commit `85ada03`, stagingen ÉL)

A 09-21 10:56-os teszthívás (session 825, client 265 = Orosz Erika — az azonosítás és a többforrásos transcript-javítás JÓL működött: „session.history (35 turnus, 17 ügyfél)") 4 új hibát tárt fel:

1. **Foglalás-hallucináció (KRITIKUS)**: az agent ÚGY erősítette meg a szept. 24. 11:00-s foglalást, hogy SOHA nem hívta a `book_meeting` eszközt — nincs naptáresemény, nincs visszaigazoló email. Javítás: `patient_rules` új 8. szabálya — véglegesítés KIZÁRÓLAG sikeres book_meeting-hívás után; hiba esetén őszinte jelzés; betűzött emailnél visszaolvasás + megerősítés.
2. **Endpointing túl agresszív**: `min_silence_duration` 0.3→0.6s, `min_endpointing_delay` 0.3→0.8s — a betűzés mikró-szüneteinél nem vág turnust, az agent nem szól közbe az email betűzésébe.
3. **Időbélyegek**: a chat-context turnusok mind a hívás-vége idejét kapták; most szöveg-egyezés alapján az event-list valós idejét öröklik.
4. **„Ismeretlen hívás" az értesítési központban**: a hívás KÖZBENI interakciók (lookup_info `kérdés` log, voice_alert) `client_id=NULL`-lal maradtak → a klasszifikáció végén backfill a session összes client nélküli interakciójára.

**Ismert korlát (nem javítható kódból)**: a garbled STT-szöveg („Igen, játszottam", „Csücsök Ödön", „oroszkukacyahoo.is") a Gemini magyar STT minősége betűzésnél — az endpointing + a visszaolvasós prompt-szabály csökkenti a gyakorlati kárát, de az átirat gépi jellege megmarad. A szept. 24-i „foglalás" a teszthívásból NEM létezik — új teszthívással ellenőrizendő.

---

## ✅ 2026-09-21 — Voice-agent javításcsomag (commit `72fceea`, stagingen ÉL)

A voice-felmérés 4 tételéből 3 lezárva (a 267/268 merge user-döntésre vár):

1. **Ügyféloldali átirat-capture (fő javítás)**: a Gemini preview API (`gemini-3.1-flash-live-preview`) az `input_audio_transcription`-t hívásonként inkonzisztensen streameli (09-14: jött; 09-21: nem) — az event-lista ilyenkor csak AI-turnusokat tartalmazott, a popupban eltűnt az ügyféloldal. A klasszifikáció most **4 forrásból** gyűjt (AgentSession `history`, a google realtime session `_chat_ctx`-e — a plugin minden turnust ide ír —, llm chat_ctx, event-list) és azt választja, amelyik ÜGYFÉL-turnust is tartalmaz; ha egyikben sincs, `⚠️`-s WARNING log jelzi. Ellenőrzés a következő teszthívásnál: a logban „Transcript forrás: <név> (N turnus, M ügyfél)".
2. **Dedup role-onkénti**: a kereszt-role substring-dedup elnyelte a rövid ügyfélválaszokat („Igen", „Jó napot"), ha az AI-szövegben is szerepeltek — most azonos role + teljes szöveg szerinti.
3. **„voice_alert" csatorna a profilon**: a profil a nyers `interactions.type`-ot mutatta; most a `getRowChannel` determinisztikus mappingje (ismeretlen → Telefon), mint a listanézetekben.
4. (A „nem mond árat" tétel a business_info-helyreállítással oldódott meg — ld. lentebb.)

**Nyitva**: 267/268 („Pónus"/"Bónus Róbert") merge — user dönti el; telefonszám-rögzítés a SIP trunkon (HidePhoneNumber?) ellenőrizendő, különben a név-duplikátumok újrakeletkezhetnek STT-elírás esetén.

---

## ✅ 2026-09-21 — business_info adatvesztés: ok, helyreállítás, védőfal (commit `6516bb7`, stagingen ÉL)

**Tünet**: a staging céginformációkból eltűnt az árlista, GYIK, kampányok, kivételek, szabály-szövegek — a voice agent ezért nem tudott árat mondani.

**Ok (saját hiba, teljes transzparencia)**: a 09-13 23:15-i jogosultsági smoke-teszt `POST /admin/api/business-info`-t hívott RÉSZLEGES body-val (`{"practice_name":"Rivergate"}`). Az endpoint a pydantic-model DEFAULTJAIBAN küldte a hiányzó mezőket (`faq=[]`, `price_list=''` stb.), és az upsert az egész sort felülírta. Bizonyíték: minden mező a default értéket mutatta, `updated_at` = a teszt időpontja. **Tanulság: smoke-tesztnél soha ne POST-oljunk részleges body-t élő adat-endpointra.**

**Helyreállítás**: a PROD Rivergate-sor tartalmát (árlista 731 kar, GYIK 3 tétel, kampány, kivételek, service_description + az összes szabály-mező — a 09-13-i olvasásokkal bitre egyezők) visszamásoltam a stagingre. A GYIK 3. tétele a prodon is üres volt (eredeti állapot). A „Szezonális akció" lejárt (aug 31.) — a `stale_offer` őr kezeli.

**Védőfal**: a `save_business_info` most `payload.model_dump(exclude_unset=True)` — csak a kifejezetten küldött mezők íródnak; részleges POST többé nem tud adatot törölni. A frontend a teljes objektumot küldi → UI-viselkedés változatlan.

**Mellékhatás**: a voice-agent „nem mond árat" probléma (2-es tétel) ezzel megoldódott — ellenőrizve: a rendszerprompt Árlista szekciója ismét tele van.

---

## ✅ 2026-09-13 (éjjel) — Jogosultsági mátrix (admin/member) + manager szerepkör KIVEZETVE (commit `5a5dcdc`, stagingen ÉL)

User-mátrix alapján: **admin = klinikavezető/tulajdonos, member = recepciós**. Admin kezdőoldal: Analitika; memberé: Irányítópult. **Minden manager ADMINNÁ minősült át** (staging DB: `dentors_manager` → admin — ⚠️ **prod-deploynál is le kell futtatni**: `UPDATE admin_users SET role='admin' WHERE role='manager'`).

**Member (recepciós) jogai**: irányítópult, ügyfélközpont, naptár, kimenő kommunikáció; interakció megtekintés/jóváhagyás/lezárás/draft-szerkesztés; ügyféllista + ÚJ ÜGYFÉL + profil-PUT + címkék + custom mezők + kanban kártyamozgatás + felvétel érdeklődőkezelésbe; naptár teljes kézi CRUD + megjelent/no-show; teendők teljes kör (törlés is); kampány: TERVET létrehozás/szerkesztés/törlés + Gemini-generálás. **Member MINDEN ügyfelet/interakciót lát** (a korábbi assigned-szűrések kivezetve a KanbanPage-ről és az InteractionsPage-ről).

**Member TILTVA**: analitika, tudástár (route-gate is!), management; tömeges törlések; ügyfél-törlés; kanban oszlopkezelés; felelős-hozzárendelés (a profil-PUT membernél az assigned_to/felelos értéket MEGŐRZI — az edit_client_details teljes felülírása miatt merge, nem strip!); SIP hívás; értesítési toggle-ök/emlékeztetők/automatizációk (az „Automatikus értesítések" almenü + route adminOnly, mert a teljes oldal admin-funkció); kampány ütemezés/indítás/leállítás + nem-tervezet törlés (backend: státusz-ellenőrzés Vázlat/Tervezet); beállítások/credentials/voice/árlista/insights; felhasználókezelés.

**Technikai**: `require_admin_or_manager` guard TÖRÖLVE (29 endpoint átsorolva require_admin vs get_current_user közé); role-opciók mindenhol admin|member; AuthContext a régi 'manager' role-t adminnak normalizálja (régi JWT/session); új `AdminOnlyRoute` (settings/automatizaciok/analytics URL-védelem); kampány UI canManage/canDelete propok (CampaignMenu/Card/ListRow/DetailPanel).

**Verifikáció (per-role API smoke, vert tokenekkel)**: member 200: interactions, profil-PUT, új ügyfél, task PATCH, custom mező, kampány-generálás, draft-törlés; member 403: users, bulk delete, ügyfél-törlés, services, business-info, SIP, aktív kampány törlés, kampány start; admin regresszió OK.

**Mellékhatás-felfedezés + JAVÍTVA**: a staging `campaigns.id` elvesztette az identity-defaultot → MINDEN kampány-létrehozás 500 volt (nem jogosultsági bug). Management API-val javítva: `ALTER TABLE public.campaigns ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (RESTART WITH 89)`. Prod nem érintett (ott identity YES). ⚠️ A smoke-teszt egy létező Vázlat kampányt (id 75) törölt a member draft-törlés tesztje során.

---

## ✅ 2026-09-13 (késő este) — Ügykezelési/foglalási szabályok redesign + értesítési emailek megszüntetése (commit `113fb8b`, stagingen ÉL)

User-instrukció alapján, 4 pont:

1. **Design**: a szabályok fül a céginfo-oldal co-* mintáját követi (`co-page-head`/`co-section`/`co-sec-head`, `ic-tile` ikonok türkiz háttérrel, `co-input`/`co-textarea`/`select.co-input`, `co-add-row`/`co-del` CTA-k, `beallitasok-save-btn`). Új CSS: `.co-sub`, `.co-rule-row`, `.co-rule-name`, `.co-rule-tag`(+`--urgent`) a tudastar.css-ben. A régi `AddBtn`/`DeleteBtn` helper komponensek törölve.
2. **Fejléc**: breadcrumbs („Tudástár / Ügykezelési és foglalási szabályok") + „Utolsó módosítás: <név>, <időpont>" — a `save_issue_handling` endpoint is bumpolja a `business_info.updated_by/updated_at` mezőket (a céginfo-oldallal osztott jelzés).
3. **Értesítendő email mezők MEGSZŰNTETVE mindenhol**: IssueHandlingRules §1 notify-inputok + §3 custom-rule notify + az agent-fül triage-táblájának Értesítendő oszlopa. (A funkció sosem volt bekötve — a küldő kód `surgos/kiemelt/urgent` priority-t keresett, a UI `onallo/jovahagyas/ember`-t mentett. A backend endpointok+oszlopok megmaradtak, dead-but-harmless.)
4. **Időpont módosítás/lemondás: eljárás-dropdownök KIVÉVE** — csak a két szabad-szöveges mező maradt (`modositas_szoveg`, `figyelmezteto_szoveg`). A `_format_cancellation_policy` mostantól **text-vezérelt** (ami ki van töltve, az kerül a promptba; a `modositas_eng`/`lemondas_24h` enumokat figyelmen kívül hagyja). **Ez az élő bugot is javítja**: a DB-ben `lemondas_24h='urgent'` volt, amit a régi kód nem ismert → a 24 órás figyelmeztetés EDDIG EGYÁLTALÁN nem került a promptba, most igen. Kockázat: nincs visszaesés (az autonóm módosítás/lemondás eddig is az effektív viselkedés volt), a prompt csak nyer.

Verifikáció: tsc+vite build tiszta; konténer healthy, 0 ERROR; a bundle-ban nincs „Értesítendő" string; konténerben a `_format_cancellation_policy` a DB-értékekre a 24 órás figyelmeztetést adja, üres mezőkre „Nincs külön…"-et. (Böngészős vizuális teszt nem volt elérhető ebben a sessionben — a co-* minta 1:1 újrafelhasználás.)

**Design hot fixek ugyanaznap (commit `b8c8535`)**: 1) mindkét oldal címe `.page-title` (20px/700, egységes a többi oldallal); 2) a fejléc sorokra bontva — 1. sor cím balra, 2. sor mentés-CTA jobbra, alatta a tartalom — mert a fix pozíciójú notif-bell (`top/right:32px`) letakarta a jobb felső CTA-t (a cím-blokk `padding-right:64px`); 3) a Szabályok oldalon a duplikált mentés-gomb megszűnt — az IssueHandlingRules szekciós gombja kikerült, az oldal-CTA `ih-save-request` eseménnyel menti az ügykezelési szabályokat is (silent); 4) `co-sec-title` 14/600 → 15/700 a címhierarchiáért.

**Periodikus skeleton-glitch fix (commit `d84ed0a`)**: a 30 mp-es polling-hookok (useSessions, useGroupedSessions, useCalendarEvents, useKanbanColumns) minden körben `setLoading(true)`-t hívtak → a lapok a TELJES tartalmat skeletonra cserélték 30 mp-ként. Most a useClients-féle őr él mindben (skeleton csak első betöltésre) + no-op JSON-szűrő mind az 5 hookon (változatlan adat → nincs setState/újrarenderelés → lenyitott sorok/görgetés sem ugrik). Tanulság-minta: új polling-hooknál ezt a két szabályt követni.

---

## ✅ 2026-09-13 (este) — „Manuálisan lezárt (X)" wrapper pótlása a detectEredmeny-ben

**Jelenség**: a 265-ös interakció manuális lezárása után az ügyfélprofilon az eredmény továbbra is az eredeti („Válasz előkészítve") maradt — a HANDOFF/commit-üzenet által ígért „Manuálisan lezárt (X)" jelölés nem jelent meg.

**Ok**: a `75a8eca` commit a classifierbe csak a `closed_manually`/`closed_by` **típusmezőket** tette be (2 sor) + a backend flag-et — a wrapper-logika a commit-üzenet ellenére sosem került a kódba. A `detectEredmeny` első sora a `classification.eredmeny`-t változtatás nélkül adta vissza.

**Javítás**: `interactionClassifiers.ts` — a `detectEredmeny` elején `closed_manually` esetén rekurzív wrapper: az alap-eredmény a flag nélküli classification-nel számolódik, a kimenet `Manuálisan lezárt (<alap>)`. Adat továbbra is tiszta (eredeti eredmény megőrizve), a wrapper tisztán megjelenítési szabály — minden nézetben érvényes (profil, napló, irányítópult), mert mindhárom ezt a függvényt hívja. `tsc --noEmit` tiszta, tsx szanity-teszt OK (wrapper + nem-lezárt + heuristic ág is).

**Tanulság**: commit-üzenet/HANDOFF-állítás ≠ implementáció — a „kész" funkciókat a tényleges diff ellenőrzésével kell lezárni.

**Ugyanaznap**: a „Kimenő kommunikáció indítása" opció kikerült az ügyfélprofil kebab-menüjéből (user-kérés; az /outbound oldal a főmenüből továbbra is elérhető). Commit `90bb7e0`.

**Felmérés (döntésre vár)**:
- **Triage „Értesítendő" email mezők funkciótlanok**: a küldő kód `surgos/kiemelt/urgent` priority-t keres, a UI csak `onallo/jovahagyas/ember`-t ment → sosem illeszkedik; normál interakcióra nincs értesítési útvonal; a mentés-toast res.ok nélkül is „mentve"-t mutat (member 403-nál is). User jelezte: valószínűleg megszüntetjük.
- **Foglalási szabályok enum-törés ÉLŐ**: az új UI `onalloKezeles/handoff/urgent`-et ment `modositas_eng`/`lemondas_24h`-be, a `_format_cancellation_policy` csak a legacy `igen/nem` + `elfogadhato/figyelmeztetoSzoveggel/eloAtadas` értékeket ismeri → a DB-ben most `lemondas_24h='urgent'` van, így a promptba „Nincs külön lemondási/módosítási szabály" kerül (a figyelmeztető szöveg elvész); „Önállóan kezelheti" választásnál a backend fordítva, „módosítás NEM engedélyezett" szabályt generálna.

---

## ✅ 2026-09-09 (délután/este) — Voice multi-tenant rendrakás (commit `61dae72`, stagingen ÉS prodon él)

Teljes részletes handoff: `/root/eaisydesk-handoff-final.md` (2026-09-09 esti, frissítve — a repón kívül, kulcsokkal).

**1. Staging SIP szétválasztás — KÉSZ és igazolt.** A +3612114217 (Rivergate) mostantól per-tenant trunkon fut: `ST_mzBTHyNM2VAM` + rule `SDR_5jxsceMCrkBo` → `dobozos-ai-staging`. A régi shared trunk (`ST_8TJDMbQySNAb`) és rule (`SDR_bdaLWQNyei6E` — ez a PROD agentre célozott!) törölve. Prod-páros (`ST_cvpEpZ3hEejS` + `SDR_cDqqZp5sbiaz` → `dobozos-ai`) érintetlen. Staging teszt: hívás a +3612114217-re → staging agent veszi fel; worker job-felvétellel igazolva. **További javítás a staging DB-ben**: a rivergate `sip_phone_number` cred +3617001622 volt (rossz!) → +3612114217; a régi cred-trunk ID-k (ST_2qAvbcUp66QV, ST_2wJZqGsWZBC3 — nem létező trunkok) javítva.

**2. voice_provision átírva per-tenant mintára.** A régi logika (shared trunk `numbers[]` bővítés + „első létező trunk" auto-felderítés) idegen környezet agentjére irányíthatta volna az új tenant hívásait. Most: új trunk + dispatch rule tenantonként, a rule mindig a helyi `AGENT_NAME`-t dispatcheli; a Telnyx IP-tartományok meglévő trunkról másolódnak; a LiveKit nem enged dupla számot trunkok közt (cserénél a régi trunkot előbb kell törölni).

**3. Credential audit log — KÉSZ mindkét DB-n.** Új `credential_audit_log` tábla (tenant_id, key, admin_user, action: set/clear/provision, created_at — ÉRTÉK SOHA nem naplózódik). Hookok: PUT/DELETE `/admin/api/credentials`, Telnyx-kulcs validálás, voice provisioning. DDL a staging branch-en ÉS a prod main-en lefutott (Management API: `POST /v1/projects/{ref}/database/query`), élőben tesztelve mindkettőn.

**4. Gemini BYOK bekötve.** A `gemini_api_key` tenant-cred a UI-ban létezett, de a worker NEM olvasta — mostantól a `server.py` tenant-feloldás után a tenant saját kulcsát használja, ha van, különben platform-fallback.

**5. deploy.log git-zaj — MEGOLDVA.** A trackelt `deploy.log.*.gz` fájlok kikerültek a gitből (+ `.gitignore`); az `update.sh` pull ELŐTT törli őket, hogy a prod deploy el ne akadjon a lokálisan módosult változatokon.

**6. Prod `.env` rendezve.** `SIP_INBOUND_TRUNK_ID`/`SIP_DISPATCH_RULE_ID`/`SIP_PHONE_NUMBER` (volt: +3612114217!) a valós prod értékekre írva. A `SIP_PHONE_NUMBER`-módosítás a következő konténer-recreatekor élesedik (inert: a Dentorsnak van saját credje).

**⚠️ LEGFONTOSABB NYITOTT TÉTEL — kimenő kampányhívások 403 HU-ra:** a közös outbound trunk (`ST_g6C475gozrfE`) mögötti régi Rivergate Telnyx fiók OVP `destinations` listája csak USA/CAN — minden HU-címzett kimenő hívás 403-at kap ("not included in whitelisted countries"). **Portál UI-ban** bővíteni HU-val (a fiók API kulcsa sehol nincs eltárolva). Érinti a prod kampányait is. Az OVP→FQDN connection hozzárendelés (tenantonként egyszer, portál UI) szintén nyitott — a pontos állapot a külső handoff 8. szakaszában.

**Deploy verifikáció:** `git push` + staging `update.sh` + prod `deploy-prod.sh --yes` → mindkét konténer a `61dae72`-t futtatja, healthy; audit-írás stagingen és prodon is tesztelve; LiveKit végső állapot visszailleszve (2 inbound trunk, 2 dispatch rule, 1 outbound trunk caller-ID pooljal).

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

**Popup hot fix (commit `0c0dc31`)**: a fejléc chipjében hiányzott az ikon — a lookup `CHANNEL_ICONS['EMAIL']`-lal keresett, de a kulcsok címcasesek („Email"). Most mindkét kulcsalakra keres.

**Popup hot fix (commit `9e6a15e`)**: a fejléc csatorna-chipje PONTOSAN a listanézetek (kit 07 — `.int-channel-chip`) megjelenése: 28×28 tile, radius 8, --bg3 háttér + muted 15px ikon, utána 13px csatornanév.

**Popup hot fixek (2026-09-11 éjszaka, commit `47d5abe`)**: (1) fejléc — a bezárás gomb a jobb felső sarokban, ALATTA a csatorna-címke (ikon-tile + csatorna neve, a user által csatolt megjelenítés szerint); (2) előzmény-sáv felirata balra rendezve (szöveg előre, chevron közvetlenül utána); (3) az előzmény-bejegyzések ugyanúgy jelennek meg, mint az aktuális részben (avatar + név + időpont + buborék) — a felesleges „kiküldött válasz" chip eltűnt; (4) válasz-típus elnevezések: „eaisyDesk választerv" (jóváhagyás és elküldés előtt) / „Elküldött válasz" (utána).

**263-as adatjavítás (2026-09-12, kód nélkül)**: a 263-os ügy charset-fix ELŐTTI adataiban a mangolt szövegek visszafordíthatók voltak (a normalizer cp1257-ként értelmezte a cp1250 bájtokat — pl. 'á'→'į', 'ő'→'õ', 'í'→'ķ'): a 802/803 interakciók `diary_fragment`-je, `topic`-ja és az ügyfél `beszelgetes_naplo`-ja karakterszinten vissza-visszafordítva (char→cp1257-bájt→cp1250). A Tárgy-fejléc (RFC2047) nem fordítható vissza — semleges „fogkő-eltávolítás" címkére javítva. A decode-fix (23. tétel) az ÚJ leveleknél már eleve helyes szöveget ad.

**Hot fix (2026-09-12, commit `2c6e6ef`)**: a fallback elszalasztotta a célt — single+email módban ha a fragment nem triggerelt, a közös ügyfél-naplóból töltött be mindent (a user screenshotján 4 blokk + a sentBody-cserével DUPLIKÁLT válasz). Most: single+email módban **kizárólag** a `row.diary_fragment` renderelődik (a fragment definíció szerint 1 csere — szálazás/vágás nélkül), a közös napló-fallback és a single-nearest vágás törölve. Nem-email csatornánál (telefon) a teljes session marad. Deployed chunk verifikálva.

### 24. KÉSZ — egy interakció = egy ügy: diary_fragment (2026-09-12, commit `3c9d6c6`)

**User hibajelzés (263-as ügy)**: (1) az ügyfélprofil Lezárt szekciójában a Megválaszolt kérdés popup az ÚJABB emailváltást töltötte be — a single-mód idő-alapú találgatás nem megbízható; (2) a beérkezési idő 2 órával korábbit mutatott. **Gyökérok**: (1) a single mód a közös ügyfél-naplóból válogat idő szerint; (2) a napló időbélyegeket a `update_client_diary` `datetime.now()`-val (UTC!) írja. **Javítás**: új `interactions.diary_fragment TEXT` oszlop — az email flow az interakció SAJÁT fragmensét (log_szoveg) menti (`log_interaction` új paraméter, fallback-drop a hibaágban), és a single-mód popup ebből dolgozik; legacy úton 30 perces tolerancia (azon túli idegen váltást NEM tölt be). Napló-időbélyeg Budapesti időre javítva. **Adatigazítás (263)**: a két interakció fragmensének backfillje +2h-nal + ügyfél-napló +2h. Migráció a stagingen élőn lefutott.

### 26. KÉSZ — jóváhagyás utáni popup-frissítés + Tárgy sor (264-es ügy, 2026-09-12, commit `14217ab`)

**User észrevételek**: (1) a választ szerkesztette elküldés előtt, de a popup az EREDETI AI szöveget mutatta („Járt már nálunk korábban?”) — az ok: a ClientDetailView nem frissítette az interakció-listát jóváhagyás után (nem volt onApproved bekötve), így a popup a jóváhagyás ELŐTTI sor-adatokkal (pending státusz + eredeti draft) renderelt tovább; (2) a második fragment ügyfélüzenete elé a tárgy került „Implantáció: ” alakban. **Javítás**: (1) ClientDetailView modal → onApproved → onSessionsRefetch — a ClientsPage useSessions-refetchje frissíti a sorokat (a MemberDashboardnál már megvolt); (2) az email-buborék felett **„Tárgy: <tárgy>” sor** jelenik meg (parseLogEntries rögzíti a tárgyat, ChatBlock.subject), és a törzs elejéről eltávolításra kerül az esetleges tárgy-prefix; CSS: `.ism-msg-subject`. Deploy + chunk-verifikáció OK.

**Irányítópult (2026-09-12, commit `4e98b92`)**: a „csatorna iránya” oszlop eltávolítva a member irányítópult listanézeteiből (Sürgős/lejárt + Nyitott szekciók) — alapértelmezetten bejővő sorok látszanak, a kimenők csak az ügyfélprofilban jelennek meg.

**Olvasatlan jelölés (2026-09-12, commit `403adc8`)**: az interakciós naplóban és az irányítópulton a még meg nem nyitott interakciók elé kis kék pötty kerül (`unread-dot`, #2563eb). Sor-kattintásra az interakció elolvasottá válik és a pötty azonnal eltūnik. Tárolás: `localStorage('read_interaction_ids')` — **per-böngészős** olvasottság (`src/helpers/unreadInteractions.ts`). Ha csapatszintű olvasottság kell (egyikő olvassa, másiknál is eltūnik), az DB-háttér követelmény — külön tétel.

**Értesítési központ redesign (2026-09-12, commit `4bfd0fa`)**: a bell a régi lastSeen-időalapú mechanizmus helyett az **olvasatlan bejövő interakciókat** mutatja — az unread-dot rendszerrel KÖZÖS tárolóból (`read_interaction_ids`): a naplóban/irányítópulton olvasottra jelölt elem eltūnik a bellből, és fordítva. Érkezési sorrend, felül a legújabb; badge = olvasatlanok száma. Sor: csatorna tile-ikon + ügyfélnév + „csatorna · ügytípus” (determinisztikus, `detectUgyTipus`) + státusz-pötty (Sürgős piros/Nyitott sárga/Lezárt zöld) + időpont. Fejléc: „N nyitott · M sürgős”; lábléc: link az interakciós listához. Kattintás: `navigate('/interactions', { state: openInteractionId })` — a napló a sor popupját nyitja meg (handledOpenId ref a duplázás ellen) + `markInteractionRead` → az elem azonnal eltūnik. Entitás-szöveg (&nbsp;) megszűnt a preview eltávolításával; a lemondás-típus eltšnt (lemondás = Időpont ügytípus). A sürgős toast + hangjelzés megmaradt (új sürgős beérkezésre).

**Manuális lezárás a profilon (265-ös ügy, commit `7f4fdc5`)**: a kézzel lezárt interakció a dashboardról eltűnt, de a profilon a Beavatkozást igénylő szekcióban maradt — a profil szűrője az `approval_status`-t ('pending') nézte elsődleges nyitottsági jelként, a lezárás-endpoint pedig szándékosan csak a `classification.statusz`-t írja. Javítás: a szűrőben a Lezárt mindig győz (bárhol zárták le); a `done`/Elvégezve jelölés is a classification-státuszból jön.

**Profil szerkesztése modal redesign (2026-09-12, commit `77ed726`+`bff32f2`)**: a kebab menü Profil szerkesztése modalja a mockup szerint újraítíva: cím + X (vékony), Név/Telefonszám/Email mezők kitöltött értékkel, üresnél szürke „Nincs megadva” placeholder (`.form-input::placeholder{color:var(--muted)}`), Mégse/Mentés (navy) a láblécben. Mégse/X/Escape/backdrop zár; a mezők megnyitáskor az AKTUÁLIS adatokkal initálnak; mentés → PUT /admin/api/clients/{id} → hero-frissítés + monogram újraszámítás + onRefresh (lista), toast: „Profil frissítve”.

**TDZ hot fix (commit `f36ed06`)**: a 75a8eca-beli optimista lezárás deklarációja a használati hely UTÁN volt (openInteractions filter korábban renderelődött) → ReferenceError, a profil összeomlott. A deklaráció az openInteractions elé került. Tanulság: runtime-render hiba buildkor nem derül ki — TDZ/deklaráció-sorrend ellenőrzés kell.

**Optimista lezárás + „Manuálisan lezárt (X)” (265-ös ügy, 2026-09-13, commit `75a8eca`)**: (1) a manuális lezárás lassú volt a profilon (a toast után a refetchre várt a pipa/szekcióváltás) → optimista lezárás: a sor azonnal a Lezárt szekcióba kerül pipával, a PATCH a háttérben fut, hiba esetén visszavonás; (2) a lezárás-endpoint `classification.closed_manually=true` + `closed_by`-t ír — a `detectEredmeny` ezeket minden nézetben „Manuálisan lezárt (eredeti eredmény)” alakban mutatja (az adat tiszta, a wrapper megjelenítési szabály, idempotens).

**Céginfo ikon-hot fixek (2026-09-13, commit `431a476`)**: (1) a „Változtatások mentése” CTA ikonja a szöveg-baseline-re csúszott (padding-alapú gomb + inline svg) → inline-flex + align-items center + gap; (2) a GYIK törlés-ikonjai a szövegdoboz (textarea) felső bordéréhez igazítva (`.co-item.co-faq-item .co-del { margin-top: 18px }` — a label magasságával eltolva).

**🔴 KRITIKUS hot fix (commit `7971e3a`)**: a 32. tételbeli `useBlocker` eldobta a céginfo-oldalt („Váratlan hiba történt a felületen”) — a hook csak **data-routerrel** (createBrowserRouter) működik, az app viszont `<BrowserRouter>`-t (komponens-router) használ. Kikapcsolva; a kilépés-figyelmeztető modal a böngészős `beforeunload`-ra korlátozódik (oldalújratöltés/bezárás és teljes oldal-kilépés esetén figyelmeztet). **Tanulság**: react-router v7 hook-kompatibilitás — data-router-függő hookok (useBlocker, useActionData, useSubmit kombinációk) NEM használhatók a jelenlegi komponens-routerrel. SPA-belső navigációs blokk = külön tétel (data-router migráció vagy custom guard).

**Összefoglaló handoff-fájl létrehozva**: [HANDOFF-2026-09-13.md](HANDOFF-2026-09-13.md) — a 259–265 ügy-sorozat, a redesign-körök, a tanulságok és a nyitott tételek teljes, aktuális összefoglalója egyetlen fájlban (commit `4bd84b1` állapot).

### 32. KÉSZ — Céginformációk oldal redesign a mockup szerint (2026-09-13, commit `c1c60f3` + `71b9be4`)

**User mockup + kérdés-válaszokkal jóváhagyva**: a céginfo-oldal (basic tab) teljes útémázása a csatolt HTML szerint. **Implementáció**: új fejléc (crumb + cím + „Utolsó módosítás: <név>, <időpont>”); sticky mini-nav 6 szekcióhoz (ikonok + smooth scroll); szekciók co-* designban (Cégadatok + telephelyek loc-kártya, Szolgáltatás leírása, Nyitvatartás switch-sorok, Árak — a feltöltött táblázat VÁLTOZATLAN, csak a keret új, Kedvezmények Aktív-toggle kártya, GYIK rács); globális „Változtatások mentése” felül + alul. **MOCKUP-MODELL**: a basic fül KÉZI mentésű lett — a korábbi debounced business auto-save kikapcsolva; dirty-tracking + `useBlocker` kilépés-figyelmeztető modal („Módosítások elvetése” / „Mentés és kilépés”) + beforeunload. **Backend**: új `business_info.updated_by TEXT` (migráció élőn); a save-endpoint a JWT-felhasználó full_name-jét írja; az `updated_at` már létezett (minden mentéskor frissül); a `get_business_info` az updated_at-t is visszaadja (korábban eldobta). **Érintetlen**: Szolgáltatások táblázat, Voice agent, Ügykezelési szabályok, Emlékeztető-beállítások (saját mentésük maradt); az agent auto-save (nyitvatartás) is maradt.

**Ügyféllista member-szűrő eltávolítva (2026-09-12, commit `3a9a735`)**: memberként üres volt az Ügyféllista — két réteg együtt: (1) az enrichedClients a felelős-nélküli ügyfelekhez a demo-default felelőst („Kis Béla”) rendelte az assignee mezőbe, (2) a member assignee-szűrő csak a saját nevére szűrt → minden member elől üres. A 18. tétel „aki kapja, marja” szabálya szerint minden member minden ügyfelet lát; az isAdmin csak a műveletek (bulk törlés, felelős-dropdown) kapuzására maradt. Megjegyzés: a felelős-hozzárendelés metaadat megmarad (opcionális), a hozzáférés-vezérlés nem használja.

**Lemondó email szöveg (commit `8863435`)**: a cancellation sablon szövege: „Időpontját kérésére töröltük:” (volt: „Időpontját lemondtuk”).

**Ügyféllista szűrőpanel redesign + Felelős dropdown-fix (2026-09-12, commit `5a90ae7`)**: a szűrőpanel a mockup szerint újraítíva: Utolsó interakció tól/ig dátum-mezők (ÚJ szűrő a lastInteraction alapján, téglalap-inputokkal), Ügyfélstátusz/Értékesítési státusz/Felelős design-selectek (Mind = üres), lábléc „Nincs aktív szűrő” + „✕ Szűrők törlése”. A Felelős sor-dropdown panelje FIXED pozíciós (flip a képernyő alján) — a táblázat overflow-ja egyetlen sor esetén is levágta a panelt. ⚠️ Lemezkimerülés (24G/100%) a build közben — docker builder prune ért felszabadított ~14 GB-ot; a HANDOFF-szabály: pród buildeknél figyelni kell a docker build cache-t (periodikus prune).

### 31. KÉSZ — lemondás → UTÁNKÖVETÉS oszlop (nem Elveszett), 265-ös ügy (2026-09-12, commit `f9e0967`)

**User szabálya**: MINDEN értékesítési címkés ügyfél automatikusan az ELSŐ UTÁNKÖVETÉS oszlopba kerül; innen csak kézzel mozgatható a többi oszlopba. **Talált hiba**: a lemondási útvonalak (public cancel link, Meta webhook, email-törlés, ügyfél-létrehozás fallback) `status="lemondott"`-ot állítottak — az az **Elveszett oszlop** (id `lemondott`). **Javítás**: `db.resolve_utankovetes_column_id()` kanonikus feloldás minden érintett úton; a re-booking restore is az első oszlopba viszi (korábban 'uj' = leesett a kanbáról); a cancellation alerts szűrő címke-alapú lett (statusz helyett). 265-ös ügyfél élő adata helyreállítva. **Jelentett eltérések**: no-show útvonal helyesen az első oszlopba visz (✓); árkérdés/ajánlatkérés/kampánylead címkés ügyfelek a KanbanPage display-szintű auto-belépése alapján az első oszlopban jelennek meg (✓, DB-státusz nélkül).

### 30. KÉSZ — naptár listanézet: determinisztikus státuszok + design jelölőmezt (2026-09-12, commit `48b8dcd`)

**User kérése**: az „Időpont státusza” oszlop determinisztikusan működjön; a natív dropdown helyett design-stílusú jelölőmező, kiválasztás után badge státusz. **Feljegyzett determinisztikus értékkészlet**: jövőbeli pending → **Függőben** (sárga); jövőbeli confirmed → **Foglalt** (navy); múltbeli → design-select (appearance: none, szürke pill + chevron), kiválasztás után **Megjelent** (zöld cp-closed) vagy **No show** (piros cp-err) badge — a badge kattintásra visszaadja a jelölőmezőt. A no-show oldalhatások (címke + kanban UTÁNKÖVETÉS) változatlanok. Komponens: `AttendanceCell` (CalendarPage), CSS: `.cal-att-*`. A „Várakozik” felirat a kódból teljesen kikapcsolva (történelmi). **Megjegyzés**: a múltbeli, jelöletlen esemény továbbra sem kap státusz-badge-et (a select „— válassz —” áll) — ha erre is badge kell (pl. „Lezajlott” alapértelmezés), külön lépés.

### 29. KÉSZ — fragmentek időbélyeg-hiba (2026-09-12, commit `f578fea`) — a visszatérő popup-hiba valódi gyökere

**A felületes és mély gyökérok egymásra rétegződtek**: (a) `useSessions` mezőlista kihagyta az új mezőket (28. tétel); (b) **az Új interakciók fragmensei időbélyeg nélkül íródtak** — a `log_szoveg` `[ts]` fejlécét a `update_client_diary` adja hozzá, maga a fragment nem tartalmazta → a popup parse-ja (ami a `[ts]` markert keresi) **0 blokkot** adott, és a topic-fallback csak az ügyfél-kérdést mutatta válasz nélkül. A korábbi backfilljeim (802/803) ezért működtek, az új szálak (804-809+) nem. **Javítás**: logoláskor `[ts]` (Budapest) a fragment elejére; modal-védőfal (időbélyeg nélküli fragmentnél a sor idejét előre teszi); visszamenő adatfix a DB-ben (806/807/809). Végigszimulálva: mindhárom 265-ös fragment 2 blokkot ad (ügyfél-levél + AI válasz).

### 28. KÉSZ — useSessions mezők + 265-ös módosítás-visszaigazolás helyreállítása (2026-09-12, commit `7326495`)

**(1) KRITIKUS frontend-hiba**: a `useSessions` hook explicit mezőlistával másolta az interakciókat és **kihagyta a received_at / sent_at / diary_fragment mezőket** — így az ügyfélprofil és az irányítópult (amelyek ebből a hookból töltik a sorokat) popupjai soha nem kapták meg a fragmentet és a valódi időpontokat. Ez okozta visszatérően: 'csak a kérdés jelenik meg, a válasz nem', téves fragment-időpontok, és a 2 órás eltolás egy részét. A mezők most át vannak adva. **Tanulság**: új interactions-oszlopnál a useSessions/ useGroupedSessions tükrét is frissíteni kell.

**(2) 265-ös helyreállítás**: a 809-es jóváhagyása a hijack idején rögzített pending_modification-nal futott le → a módosítás-visszaigazoló (ICS-sel) a **balazs@thinkai.hu** címre ment, a 78-as esemény adataival. Helyreállítás: a helyes módosítás-visszaigazoló (Konzultáció, 09:00 → 10:00, ICS a #114-es eseményhez, Dr. Kiss Réka) küldve az et_orosz@yahoo.ie címre és naplózva a 265-ös profilba (interakció #811).

### 27. KÉSZ — időpont-módosítás IDEGEN eseményt módosított (265-ös ügy, 2026-09-12, commit `1a8807e`) — KRITIKUS

**User észrevétel**: a 265-ös (et_orosz@yahoo.ie) ügyfél 'hétfő 10:00-ra' időpont-módosítási kérelmére a naptárban Lederer Balázs neve jelent meg. **Gyökérok**: a `find_calendar_event_by_title` (módosítás/törlés ág) **ügyfél-szűrés és jövőbeli-idő szűrés nélkül**, címtöredék alapjn a LEGRÉGEBBI egyező eseményt adta — a 265-ös 'Konzultáció' kérelme a tulaj június TESZTESeményét (#78, Lederer Balázs) írta át június 23-ról hétfő 10:00-ra, a tényleges #114-es (09:00) változatlanul hagyva. **Javítás**: `find_calendar_event_by_title(title, attendee_email)` — keresési sorrend: az ügyfél jövőbeli eseménye → az ügyfél bármely eseménye → jövőbeli bárkié (nélkülöző kérelmeknél) → legacy; mind a módosítás-, mind a törlés-ágban átadjuk a kérelmező email címét. **Adatjavítás**: #78 visszaállítva június 23 10:00-ra, #114 áthelyezve hétfő 10:00-ra (a kliensnek visszaigazolt állapot). **809-es interakció**: pending jóváhagyásra vár (a válasz szerint az áthelyezés megtörtént — az adat most már ezt türközi, jóváhagyható).

### 25. KÉSZ — „járt már nálunk korábban?" tilalom (264-es ügy, 2026-09-12, commit `a6f59f2`)

**User észrevétel**: a 264-es (új teszt) ügyfél első levelére adott válasz rákérdezett, hogy „Járt már nálunk korábban?". **Ok**: a tilalom eddig csak a Visszatérő ügyfél kontextus-ágban élt — ez az ügyfél feldolgozáskor még nem létezett a nyilvántartásban (első levele), így az Új ügyfél ág futott tilalom nélkül. **Javítás — három szinten**: (1) univerzális E-MAIL CSATORNASZABÁLY (prompt_utils — mindig érvényes, client-lookup hibája esetén is); (2) VISELKEDÉSI SZABÁLYOK 5. pont (email_processor); (3) Új ügyfél kontextus-ág kiegészítése. Deploy + konténerbeli prompt-ellenőrzés OK (mindhárom szinten benne van).

### 23. KÉSZ — 263-as ügy: 3 hot fix (2026-09-12, commit `194e5e9`)

(1) **Email ékezetek** („Fogıszat", „eltıvolktıs"): a `_decode_payload` charset-normalizere rövid magyar szövegeknél rossz kódolást talált. Új sorrend: deklarált charset → utf-8 strict → **windows-1250 / iso-8859-2 / windows-1252 / iso-8859-1** → charset-normalizer (csak végső esetre) → utf-8 replace. Unit-teszt cp1250 bájtokkal: helyes ékezetek. (2) **eaisyDesk logo avatar** nem töltött be: a front-end `/admin/` base-en fut (LoginPage mintája: `/admin/wave_*.webp`) — az útvonal `/admin/eaisydesk-logo.png`-re javítva (élesben HTTP 200). (3) **Csatorna-chip az ügyfélprofilból**: a profil interakciói kisbetűs `email` type-ot adnak, a CHANNEL_ICONS címcases kulcsaihoz nem talált — kanonikus, kis/nagybetű-független kulcsfeloldás (`channelKey`), a felirat is a kanonikus alakot mutatja.

### 🔴 KRITIKUS hot fix — email-feldolgozás NameError (2026-09-12, commit `a4038f7`)

**Incidens**: 2026-09-11 19:16 UTC-től (I. kör deploy) MINDEN bejövő email feldolgozása elhasalt `NameError: name 'email_received_at' is not defined` hibával — a received_at bevezetésénél a Date fejléc parse-ja a `check_imap_sync` loopjába került, de az egyetlen éles út (`_poll_tenant_mailbox`) nem definiált változót hivatkozott. **Tanulság**: a round-1 verifikáció nem futtatott valódi email-feldolgozást — új email-pipeline featurenél MINDIG E2E teszt (valódi/szimulált levél!) kell. **Javítás**: `check_imap_sync` a beérkezési időt a tuple 7. elemeként adja vissza, a tenant-path unpackolja és továbbadja (`received_at=received_at`). Deploy után a poll hibátlan (0 ERROR), a 7 régi tesztemail a claimek miatt kihagyásra kerül („Duplikált levél kihagyva").

**260-as ügy teszt-tisztítás (user kérés)**: a user törölte a 260-as (261-es DB id) ügyfelet. Tisztítva: 31 `processed_emails` claim (erika@feedbacks.hu ×13, erika@molaire.hu ×11, et_orosz@yahoo.ie ×7) + konténer-restart (UID high-water reset). A restart után a crashed-run miatt újra-claimelt 7 feedbacks-es email szándékosan claimelve marad (a régi szál ne éledjen újjá a friss teszt előtt). Egyéb maradvány (ügyfél/interakció/session/email_log/naptár): 0 — a user törlése ezeket már eltávolította; a balazs@molaire.hu valódi adatai érintetlenek.

### 22. KÉSZ — Lemondási link flow javítás (2026-09-11 éjszaka, commit `c5acec6`)

**User hibajelzés (260-as ügy)**: a Lemondom CTA-n keresztüli lemondásnál a kimenő email + lemondás-visszaigazoló + „törölt időpont" címke lefutott, DE a lemondás nem jelent meg sem az interakciós naplóban, sem a naptárban. **Gyökérok (két külön hiba)**: (1) a jóváhagyás-módú flow szivárgása — a 15:13-as javaslat-jóváhagyás függő eseményt hozott létre (111-es), a 17:49-es megerősítés-jóváhagyás viszont ÚJ végleges eseményt (112-es) anélkül, hogy a függőt véglegesítette/felszabadította volna (a `_confirm_pending_event`/`_release_other_pending_events` csak az autonóm ágban futott); a Lemondom a 112-est törölte, a kóbor 111-es függő kártya viszont a naptárban maradt. (2) A `/api/public/cancel` endpoint SEMMILYEN interakciót nem naplóz — az egyetlen sor (800-as, „Időpont lemondása") tisztán kimenő session (`outbound_cancellation_*`), amit a napló grouped RPC-a a 14. tétel szerint kiszűr. **Javítás**: (1) approve endpoint — megerősítéskor előbb `_confirm_pending_event` (ugyanaz az esemény véglegesítődik, nincs duplikátum), utána `_release_other_pending_events`; (2) cancel endpoint — a lemondás bejövő interakcióként naplózódik (session `email_{cím}`, direction inbound, tool `cancel_link`, ügytípus Időpont / eredmény Törölt időpont / Lezárt / Nincs további teendő, funnel: lemondott, Budapesti időponttal a szövegben); (3) adat-tisztítás: a kóbor 111-es esemény törölve a staging DB-ből. **E2E verifikáció élőben**: teszteseménnyel + valódi tokennel a `/api/public/cancel` meghívva → HTTP 200, esemény törölve, interakció (inbound / Törölt időpont / Lezárt / lemondott) a DB-ben, a grouped RPC a naplóban is látja (reprezentáns result = Törölt időpont). Tesztadatok kitakarítva.

### 21. KÉSZ — II. kör: ügyfélprofil + irányítópult popupok — önálló interakció-mód (2026-09-11 este, commit `694135b`)

**User kérés**: a profil/irányítópult popupjai minden interakciót KÜLÖN sorban/KÜLÖN popupban mutassanak, ÖSSZEFŰZÉS NÉLKÜL — így a szakaszok (igény → javaslat → visszaigazolás) követhetők; a sorok az adott interakció SAJÁT eredményét őrzik meg. **Megvalósítás**: az InteractionSummaryModal `mode` propot kapott — `thread` (alapértelmezett, az Interakciós napló összefűzött nézete változatlan) vs `single` (ügyfélprofil + irányítópult): (1) e-mail szálban az EHHEZ a sorhoz tartozó üzenet jelenik meg (időben legközelebbi ügyfél-bejegyzés a sor idejéhez + válasza), előzmény-sáv NINCS; (2) KIMENŐ kommunikációnál (visszaigazolás/emlékeztető/kampány, direction outbound) CSAK a kiküldött üzenet látszik — fejléc-címke = a levél tárgya, összefoglaló = tárgy, idő = sent_at; (3) a profil sorai valós beérkezési időt mutatnak (`received_at` a sor dátuma) és a received_at/sent_at továbbadódik a popupnak; (4) **eredmény-címke a javaslati szakaszban**: függő foglalás/pending_meeting esetén (confirmed_by_client=false) az eredmény automatikusan **„Foglalási szándék rögzítve"** (a user visszaigazolta, hogy ez az egyetlen címke — a „Foglalási igény rögzítve" elírás volt; a staging DB-ben a 794-es sor átírva erre a címkére). Lezárt/Nincs további teendő státusz marad. Deploy + chunk-ellenőrzés OK (mode-logika + single prop a bundle-ben), 85/85 teszt zöld.

### 20. KÉSZ — Függő időpont-fenntartás, Lemondom-CTA szabály, munkatárs-konzisztencia (2026-09-11, commit `e510289`, deploy staging)

**I. kör — Interakciós napló popup redesign (2026-09-11 este, commit `6fdb329`)**: a user mockupokkal vezérelt átrendezés. **Adat-réteg**: új `interactions.received_at` (a bejövő levél Date fejlécéből, worker parse-ol és log_interaction-nek átad — új opcionális paraméter, a log_interaction most már az insert id-t adja vissza) + `interactions.sent_at` (autonóm küldésnél és az approve endpoint sikeres Brevo-küldése után — `db.set_interaction_sent_at()`). Migráció a stagingen ÉLŐN lefutott (Management API). **Popup struktúra (mockup szerint)**: fehér fejléc + standard csatorna chip (nem fekete pill) + beérkezési idő; ÖSSZEFOGLALÁS halványtürkiz kártya fix 170px + belső scroll; jobbra Státusz + Teendő szürke kártyák fix magassággal — az **Eredmény és az Értesítés sor VÉGLEG eltűnt** (user döntés); „Előzmények megtekintése (N)" sáv a részletek LEGFELÜL, szürke alapon; ügyfél-buborék fehér; függő választerv ea-logó avatárral (`/eaisydesk-logo.png`) + türkiz buborék + Szerkesztés / Jóváhagyás és elküldés gombsor; kiküldött válasz papírrepülő ikonnal + VALÓS sent_at időponttal, szürke buborék. **Messenger/Instagram 24 órás válaszablak banner helyett MODAL** („24 órás válaszablak" + Értem — localStorage-ban véglegesen eltüntethető). **Listanézet**: a sor dátuma emailnél `received_at`, egyébként változatlan (a popuppal azonos idő — user kérés). A valós idő-párosítás élő DB-teszttel igazolva (received_at írás + sent_at frissítés + cleanup). **Következő kör (user jelölte, MÉG NINCS implementálva)**: ügyfélprofil / irányítópult popupjainak átrendezése — ott az üzenetváltások KÜLÖN sorok (nem összefűzött thread).

**Utófix 3 — interakciós popup thread-megjelenítés (261-es ügy, commit `064d6d4`)**: a naplósor jó volt, a popup thread-je rossz logikát követett (két ügyfél-email a kibontott részben, a korábban KIKÜLDÖTT válasz sehol). Új szabály: (1) e-mail szálban az aktuális csere = az ügyfél LEGUTÓBBi levele (+ kiküldött válasza); az ugyanabba a 30 perces sessionbe eső korábbi levelezések az „Előzmények megtekintése (N)" szekcióba kerülnek; (2) a függőben lévő választerv halvány türkiz kiemelt háttérrel jelenik meg (`ism-draft-section--pending`); (3) kiküldés után a választerv NEM marad meg a popupban (a „Kiküldött válasz" szekció ELTŰNT) — a ténylegesen kiküldött, esetleg szerkesztett szöveg a chatben látszik szürke blokkban (a rekord `ai_draft_response`-ját az approve endpoint frissíti a szerkesztett szöveggel, a frontend ezt használja a naplóban lévő eredeti helyett); (4) az előzmények chat-szerű, szürke, nem kiemelt buborékokban: név + időpont + szöveg, a kiküldött válaszon „kiküldött válasz" chip. A szétvágás CSAK e-mail szálra vonatkozik (telefonosnál a teljes session marad a kibontott rész). A valós 261-es napló-adattal node-szimulációval igazolva: pending állapotban [aktuális levél | türkiz választerv | Előzmények (1): korábbi levél + kiküldött válasz], kiküldés után [aktuális levél + szürke kiküldött válasz], duplikáció nélkül.

**Utófix 2 — lejárt/nem aktuális kedvezmény őr (260-as ügy, commit `664d215`)**: a user szerint a válasz korrekt volt, de lejárt kedvezményt említett — az pedig a céginfóban bekapcsolva maradt. Új eljárás: a Gemini JSON `stale_offer` mező jelzi (detected/name/note), ha a válaszba olyan kedvezmény/akció kerülne, aminek a lejárata az AKTUÁLIS DÁTUM-hoz képest elmúlt vagy egyértelműen nem aktuális. Ilyenkor: (1) a válasz NEM megy ki automatikusan (`is_autonomous_email`-gate — pending draft marad emberi átnézésre, `draft_payload["stale_offer"]`-ben látszik az ok), (2) naptári módosítás/törlés akció NEM fut (modify/delete gate), (3) finomhangolási javaslat rögzül az `ai_insights`-ba (Analytics → „Finomhangolási javaslatok" widget): „Lejárt / nem aktuális kedvezmény a céginfóban: <név> — érdemes kikapcsolni vagy frissíteni." Dedup (pontos egyezés), lista max 8 elem. `_append_stale_offer_insight()` helper; élőben tesztelve a staging DB-n (rögzítés + dedup + cleanup OK). **Nyitott**: a voice agent (system_prompt.md) kedvezmény-őr NEM része ennek — ha kell, külön tétel.

**Utófix — ügyfélstátusz chip szín-inkonzisztencia (2026-09-11 délután)**: a Naptár listanézet Ügyfélstátusz chipjében a FELIRAT (`past > 1 → Visszatérő`) és a SZÍN (`past >= 1 → navy`) két külön számítás volt — 1 múltbeli időpontnál navy hátterű „Új ügyfél" chip jelent meg. Fix: egyetlen `clientStatusFor()` helper adja a {label, cls} párt (past >= 2 → „Visszatérő ügyfél" navy, egyébként „Új ügyfél" teal/accent) — küszöb azonos a ClientsPage `isNew = pastEvents.length <= 1` szabályával, így ugyanaz az ügyfél ugyanolyan chipet kap Naptárban és Ügyféllistán. Megjegyzés: a kapcsolódó popup (InteractionSummaryModal ÚJ ÜGYFÉL/VISSZATÉRŐ pill) saját, regisztráció-dátum alapú (≤30 nap = ÚJ) szabályt használ — ha ez is esetleges, külön tétel. Deploy verifikálva: a bundle-ben a régi inline színszámítás nincs meg, 0 ERROR.

**User észrevételek (259-es ügy, 3 tétel + 1 kiegészítés)**: (1) a foglalás előreszalad — a rendszer által felajánlott időpontot az ügyfél visszaigazolása ELŐTT véglegesen lefoglalta a naptárban; (2) a felajánló válaszemailben már volt Lemondom CTA, pedig még nincs mit lemondani; (3) az ellátó munkatárs neve keveredik (összefoglaló/email/naptár mást-mást mutat). Kiegészítés: a függő időpontot csak **24 óráig** tartjuk fenn, és a felajánló email a pontos beégetett szöveggel jelzi ezt.

**Megvalósítás**:
- **DB migráció (stagingen ÉLŐN lefutott, Management API-val)**: `calendar_events.status TEXT DEFAULT 'confirmed'` + `calendar_events.pending_until TIMESTAMPTZ`; meglévő sorok `status='confirmed'`-ra backfillelve. ⚠️ **MCP-tanulság**: a Supabase MCP default projektje `dsiluafthysysnstszbd` (ÉLES projekt — a staging `qhhnqqsthdrwacsxommt`!). Az első migráció-futtatás oda ment — ártalmatlan, additív (a következő prod-deployhoz pont kell, ott hagyva). Stagingre a Management API `POST /v1/projects/qhhnqqsthdrwacsxommt/database/query`-vel futott (sbp token: `/root/.zcode/cli/config.json`).
- **Prompt (`email_processor.py` json_instruction)**: új `meeting.confirmed_by_client` mező + „IDŐPONT-FOGLALÁSI SZABÁLYOK" blokk: true CSAK ha az ügyfél maga adott napot+órát VAGY egyértelműen elfogadta a korábbi javaslatot (akkor a felajánlott időpontot írja a meetingbe); false, ha az AI javasol (a rendszer függő foglalást készít, a 24h-s tudnivalót a rendszer fűzi a levélhez — az AI NE írja ki); foglalási szándék nélkül meeting null. Fájdalom- és „KIVÉTEL" szabályok confirmed_by_client=false-ra átírva. **ÚJ VISELKEDÉSI SZABÁLY 4**: a válaszlevélben SOHA nem nevezünk ellátó munkatársat (a 3. tétel gyökérorvosa — a név egyetlen helyen, az event.doctor-ban oldódik meg); `meeting.assigned_to` csak név szerinti ügyfél-kérésnél.
- **Függő foglalás flow**: `create_event_from_pending_meeting(pm, status="confirmed"|"pending")` — pendingnél `status='pending'` + `pending_until = most+24h`. Autonóm ág: confirmed → (`_confirm_pending_event` előbb próbálja a meglévő függőt véglegesíteni, hogy NE legyen dupla esemény; utána `_release_other_pending_events`) + visszaigazoló ICS-sel; pending → NINCS visszaigazoló/ICS/Lemondom, a válasz végére fűződik a `PENDING_HOLD_NOTICE` pontos szövege („Tájékoztatjuk, hogy a felajánlott időpontot 24 órán keresztül tudjuk tartani. Amennyiben ez idő alatt nem érkezik megerősítés az Ön részéről, az időpont felszabadul, és a foglalási folyamatot újra szükséges egyeztetni."), a draft body-ja is ezt tartalmazza.
- **Approve endpoint (`web_server.py`)**: jóváhagyáskor a pending_meetingből `confirmed_by_client` szerint végleges VAGY függő esemény készül; függőnél NINCS visszaigazoló és NINCS `get_cancellation_html` a levélben (CTA-gate a meglévő event_id-knál az esemény status-át is nézi), helyette a `PENDING_HOLD_NOTICE` megy a levél végére.
- **Módosítás/törlés**: függő esemény módosításánál NINCS módosítás-visszaigazoló email; függő törlésénél NINCS lemondó-email, „lemondott" státusz és „törölt időpont" tag — csak felszabadul.
- **Felszabadítás**: `db.release_expired_pending_events()` törli a lejárt (`pending_until < now`) függő sorokat — a reminder worker MINDEN tenanton lefuttatja 15 percenként (a toggle-öktől függetlenül). Az emlékeztető-lekérdezés (`get_upcoming_events_for_reminders`) kiszűri a pendingeket (függőre soha nem megy emlékeztető).
- **Lemondom CTA szabály (2. tétel)**: visszaigazoló (ICS) + emlékeztető (ÚJ) + approve-végleges — másikba soha.
- **Frontend (`CalendarPage.tsx` + clientprofile.css)**: `CalendarEventItem` + `status`/`pending_until`; heti abszolút kártya, hónap/nap kártya és listanézet: pending → halványsárga háttér (#fef9c3) + szaggatott sárga keret (#eab308, bal élön tömör sáv) + sárga „függőben" pill jobb felül (xs/sm kártyákon rejtve), dark mode változattal; tooltip: „· függőben (24 órás fenntartás)"; **listanézet Időpont státusza oszlop: jövőbeli végleges → „Foglalt" (navy badge), függő → „Függőben" (sárga cp-warn badge) — a korábbi „Várakozik" felirat megszűnt**.
- **Verifikáció**: 85/85 python teszt zöld; frontend build zöld; konténerben funkcionális tesztek (NOTICE szöveg, deadline, prompt/approve forrás); ÉLŐ életciklus-teszt a staging DB-n: függő létrejött (status+pending_until) → azonos időpontra véglegesítés ugyanazt az id-t flipelte (confirmed, pending_until üres) → eltérő időpontot visszautasított → lejárt függőt a sweep törölte; deployed chunkokban „Függőben"/`cal-ev-pending`/`cal-pend-pill` megvan; restart óta 0 ERROR.
- **Nyitott**: élő E2E valódi emailekkel (user tesztlevelei): (a) általános időpont-kérés → függő esemény a naptárban + tudnivaló a levélben, (b) „igen" válasz → véglegesítés + ICS-es visszaigazoló Lemondommal, (c) 24 óra passzív → esemény felszabadul. ⚠️ **Prod-deploykor**: a prod DB-be a migrációnak KELL lennie — ha a prod a `dsiluafthysysnstszbd`, már megvan (első próbálkozásból); deploy előtt `information_schema.columns` ellenőrzés!

### 19. KÉSZ — Email thread előzmények + napló count + thread-összefoglaló (2026-09-07, commit `1f517a2`+`63c11c5`, deploy `63c11c5`)

**User észrevétel (259-es ügy)**: az első email után minden jó; a MÁSODIK email után (ugyanaz a thread, session `email_{email}`) a napló 1 sorban összefűzi (OK), DE a popup már NEM mutatja a beszélgetés előzményét. Ügyfélprofilban a két email külön sor, külön összefoglalóval (ez OK).

**Gyökérok (megtalálva)**: `InteractionSummaryModal.load()` — a kliens `beszelgetes_naplo` diaryjából a `groupIntoSessions` (30 perc görget) KÜLÖN szeleteket vág, és csak az interakció idejéhez LEGKÖZELEBBI szeletet jeleníti meg. 259: 13:14 + 13:52 → 38 perc → két szelet → a második email popupja az elsőt nem mutatja. **Adatvesztés nincs** — a diary mindkét emailt teljesen tartalmazza.

**Tervezett javítás (user szabályokkal)**:
1. Popup: a teljes diary időrendben jelenjen meg — a legutóbbi csere kibontva, a korábbi cserék az alján „Előzmények megtekintése" alatt ÖSSZECSUKVA (session-határok = vizuális elválasztók).
2. Napló: a grouped RPC `interaction_count`-ja chipben a csatorna mellett („Email 2") — az RPC már adja, csak UI kell.
3. Thread-összefoglaló: az email-Gemini summary utaljon a korábbi üzenetre is („korábban érdeklődött az implantáció iránt, most a gyógyulási időről kérdez") — FIGYELEM: finom ellentmondás a korábbi „summary = csak legutolsó üzenet" szabállyal (18. tétel előtti kérés) → hibrid javaslat: aktuális ügy + egy mondat utalás.

**User kérdésre válasz (megvolt)**: member dashboardon minden interakció KÜLÖN sor (259 = 2 sor + kézi teendők külön) — a pipás lezárás per-interakció, így marad.

 — meglévő időponthoz kapcsolódó kérdés (2026-09-07, commit `d23c3f0`, 257-es ügy / 782-es interakció)

- **Probléma**: lefoglalt időpont után a „hol található a rendelő?" kérdésre az LLM helyesen Kérdés+Időpontot detektált, de a **vegyes-típus priorítás (Időpont > Kérdés)** átvágta Időpont dominánsra → eredmény „Foglalási szándék rögzítve" / teendő „Időpont véglegesítése" — pedig egyértelműen Kérdés (Válasz előkészítve / Nyitott / Jóváhagyás szükséges).
- **Javítás** (commit `d23c3f0`):
  1. `_detect_intent_llm` prompt: meglévő időponthoz kapcsolódó tájékoztató kérdés (hol a rendelő, hogyan oda, mikor pontosan) foglalási/módosítási/lemondási szándék NÉLKÜL → ugytipus Kérdés, detected_types CSAK [Kérdés].
  2. `classify_interaction`: Kérdés-dominancia kivétel — ha az intent Kérdést mond elsődlegesnek és az Időpont csak említés (altípus nélkül), a priority NEM fordítja Időpontra.
  3. Kulcsszó-fallback: Kérdés+Időpont ütközésnél foglalási ige (foglal/booking/idopontot ker…) nélkül az Időpont kikerül → Kérdés domináns, altípus None.
- **Tesztek**: +2 regressziós teszt (tájékoztató kérdés → Kérdés; kérdés + foglalási ige → Időpont). Suite: 53/53.
- **Verifikáció**: deploy `d23c3f0` — élő LLM-path classify a user pontos üzenetével: ugytipus=Kérdés, eredmény=Válasz előkészítve, státusz=Nyitott, teendő=Jóváhagyás szükséges, restriction=approval. Konténer healthy.
- **Megjegyzés**: a 782-es interakció (a hibásan klasszifikált) historyként ott marad — manuálisan javítható vagy hagyható.
- **User diagnosztika + tisztázás** (commit `a97ba64`): a user szerint a hiba az előzmény-összefűzésből jön. **Tények**: (a) a klasszifikátor CSAK az új levél szövegét értékeli (`message_text=text_content`) — előzmény-független ✓, az előző javítás (Kérdés-dominancia) marad; (b) az „összefűzés" az email-Gemini ÖSSZEFOGLALÓ mezőjében volt („a bejövő levél ÉS a válaszod" + befoglalt időpont factok bekeverése) — a `beszelgetes_naplobejegyzes` mező leírása átírva: az összefoglaló a LEGÚJABB levél tényállásáról szól, korábbi események csak hivatkozással. **A vegyes-típus priorításrendje változatlan**: egy interakción BELÜLI több ügytípusnál (pl. kérdés + foglalási szándék egy levélben) az Időpont > Kérdés dominancia érvényes.
- **Utófix — Következő időpont ikon** (commit `3561ec1`): (a) a navigate a dupla prefixet okozta (`/admin/calendar` + basename `/admin` → `/admin/admin/calendar` → SmartRedirect → analitika) — javítva basename-relatív `/calendar`-ra; (b) a `.cd-appt-edit-btn` UI Kit ghost ikongomb-stílust kapott (26×26, border, radius 8, muted → hover `--cp-a2`; clientprofile.css, az index CSS chunkba épül). Verifikálva a staging JS+CSS chunkokban. **Tanulság**: navigate mindig basename-relatív (nincs `/admin` prefix) — lásd a dupla-prefix ismert hibát.
- **Utófix — Munkatárs dropdown** (commit `e0ba3f7`): a select az **Esemény címe alatti** mezőbe került; opciói KONKRÉT NEVEK — a Szabályok → „Foglalható szolgáltatások, kollégák" Kolléga mezője vesszővel elválasztott listákat tartalmaz, ezeket egyedi nevekre bontjuk, a „minden fogorvos/dentálhigiénikus" szabad szövegeket kiszűrjük („Automatikus (szabályok alapján)" opció eltűnt, helyette „— Munkatárs választás —" placeholder; ha a meglévő érték nincs a listában, külön opcióként megjelenik). **Backend javítás**: a `resolve_assigned_staff` rossz mezőt olvasott (`name` helyett `service_name`) és a vesszős listákat egészként kezelte — most `_split_staff_names` bont egyedi nevekre. Élő teszt: Implantációs konzultáció→Dr. Kovács Márk, Fogkő-eltávolítás→Pál Alexandra, Akut vizsgálat (minden fogorvos)→random poolból.
- **Utófix 2 — duplikált mezők + üres névlista** (commit `915afc9`): (a) a modalban DUPLÁN szerepelt az „Esemény címe + Munkatárs" blokk (a fix-4 körös szerkesztés törlő lépése hiányzott) — a dátumsor utáni másolat törölve; (b) a `staffOptions` üres volt, mert a `GET /admin/api/services` csupasz tömböt ad, a kód `data.services`-t várta — most mindkét alak kezelve. Élő ellenőrzés: chunkban „Esemény címe" 1×; a valós válasz 7 szolgáltatás → 7 konkrét név (Balogh Pálma, Dr. Hegedűs Eszter, Dr. Kiss Réka, Dr. Kovács Márk, Dr. Molnár Bence, Dr. Varga Anna, Pál Alexandra).
- **Utófix 3 — Ma gomb** (commit `9bbf344`): a „Ma" gomb mindig a **NAPI nézetet** tölti be (`setCalMode('day')` + cursor azonnai napra) — heti/havi nézetből vagy ellapozás után is az aznapi napot mutatja. Verifikáció: a deployed CalendarPage chunk md5 hashesen egyezik a friss builddel.

### 18. KÉSZ — Member irányítópult áttervezés + jogosultság-legalizálás (2026-09-07, commit `621a20d` + `ed8baa6`)

**User kérés**: a member irányítópult a user NAPI teendőit mutassa (mockup alapján): hero (üdvözlet + dátum), 3 KPI-kártya (Sürgős/lejárt szám · Nyitott szám · Mai időpontok kártya — első időpont látszik, többi lenyitható), 2 szekció táblázattal: **Sürgős/lejárt** (Sürgős státuszúak + Minden nyitott/sürgős, ami created_at alapján a tegnapi nap előtt keletkezett és nincs lezárva — 24 órás szabály, státusz nem változik, csak a szekcióba feljebb kerül) és **Nyitott teendők** (az aznapi nyitottak). A dashboard szűrőként működik: Lezárt kizárva; pipára az interakció lezárul (eltűnik a dashboardról, a naplóban marad Lezártan). Interakciós modal AI összefoglalóval + Messenger/IG 24h figyelmeztetővel.

**User DÖNTÉSEK (2026-09-07)**:
1. **Felelős-hozzárendelés leépítése**: minden member MINDEN interakciót lát (napló + dashboard) és mindennel dolgozhat — az `isAssignedToMe` szűrők kikerülnek a dashboardból; „aki kapja, marja" recepció-modell. (A felelős/assigned mező marad mint opcionális metaadat, nem hozzáférés-vezérlés.)
2. **Jóváhagyás/küldés MINDEN szinten**: az approvals approve/reject és az interakció-lezárás végpontokat `require_admin_or_manager` → `verify_jwt` szintre kell hozni (approve + reject + interactions/{id}/status + task delete konzisztensen). A member elsődleges dolga a kommunikáció.
3. **Teendő = sima szöveg** a mockupban is (színes pill helyett — a korábbi döntésnek megfelelően).
4. **Mai időpontok = MINDEN mai esemény** (nem csak hozzám rendelt ügyfeleké). Kézi teendők a Nyitott szekcióba keverve.

**Implementációs teendők (később)**: backend — approvals approve/reject → verify_jwt; interactions/{id}/status → verify_jwt; tasks delete → verify_jwt (konzisztencia); MemberDashboardPage teljes rewrite a mockup szerint (hero, 3 KPI, Sürgős/lejárt + Nyitott szekciók, interakciós modal jóváhagyás-gombbal, 24h Messenger/IG figyelmeztető); useSessions limit 300; konténer = app szélesség. **Figyelem**: minden role küldhet → a jóváhagyó neve naplózva marad az approvals rekordban.

**MEGVALÓSÍTVA (2026-09-07)**:
- **Backend jogosultságok** (commit `621a20d` + `ed8baa6`): approvals approve/reject, interactions/{id}/status, tasks DELETE → `verify_jwt` (minden belépett szerep). Utófix: a status endpoint logja `_auth.get('username')` helyett `_auth` (a verify_jwt stringet ad). **Member teszttel verifikálva**: interactions lezárás 200 + classification statusz=Lezárt/teendo=Nincs további teendő; approve nem-létező id-n 404 (auth átment).
- **Frontend**: `MemberDashboardPage.tsx` teljes rewrite (~400 sor → mockup): hero (napszaki üdvözlet + dátum badge), 3 KPI (Sürgős/lejárt · Nyitott · Mai időpontok kártya — első időpont + chevronnal lenyitható többi), **Sürgős/lejárt** szekció (Sürgős + ma 00:00 előtt keletkezett nyitottak) és **Nyitott** szekció táblázatokkal (Ügyfél avatar+kontakt, időpont, csatorna-chip, irány, ügytípus, eredmény, státusz badge, teendő SIMA SZÖVEG, Elvégezve pipa). `useSessions(300)` — minden interakció, felelőshozrendelés NÉLKÜL. Kézi teendők a Nyitott szekcióba keverve. Sor kattintás → InteractionSummaryModal (AI összefoglaló, draft jóváhagyás/küldés — membernek is engedélyezett, Messenger/IG 24h banner). Ügyfélnévre kattintva ügyfélprofil (member forrással). Design: mockup tokenek light/dark (useTheme).
- **Következő lépés (user jelezte)**: az interakciós popup átalakítása (InteractionSummaryModal további finomhangolása).

- 🔴 **DEPLOY BLOKKOLVA (2026-09-07 éjszaka)**: a `eaisydesk-frontend/src/components/settings/VoiceProvisioningSection.tsx` (127. sor) TS hibát dob — a badge komponensnek átadott `extra` prop nincs deklarálva a props interfészben (`TS2322`). Ez a párhuzamos (Telefónia) session félkész munkája — a frontend build NEM fordul, amíg meg nem javítják. Két opció: (a) a Telefónia session javítja, (b) engedéllyel egy soros típus-kiegészítést csinálok (`extra?: string` a props interface-be). A 19. tétel frontend kódja commitolva + pusholva (`1ff5c9c`), deployolni akkor tudok, ha a build zöld.
- **PÁRHUZAMOS MUNKA FIGYELMEZTETÉS (2026-09-07)**: a rebuild branchre más session is commitol — `db9fcc6` = Telnyx provisioning review-fixek (`telnyx_provision.py`, user: ledererb). Ez a deploy után (a 8f0c232 utáni build) MÉG NEM él. Új sessionnél: mindig `git pull` commit ELŐTT és UTÁN is; deploy előtt ellenőrizni, hogy nincs-e félkész párhuzamos munka.
- **Member teszthozzáférés (staging, Rivergate)**: `member_test` / `Member1c9715!26` — a dashboard-teszthez létrehozott member user (2026-09-07). Ha üres a dashboard: a Teszt Munkatársnak nincs kiosztott ügyfele, de a 17. tétel óta amúgy MINDEN nyitott/sürgős interakció látszik.
- **Utófix — kézi teendő sorok a dashboardon** (commit `de197ea`): a Nyitott szekció „Hozzáadott feladat" sorai most a profilból ismert kezelést kapták — `row-task` + `tabIndex` sor (kattintás/Enter/Space), teendő `.todo-frame`-ben (280px/30px, ellipsis, title tooltip), kattintásra `#todoEditOverlay` popup (textarea + Törlés/Mégse/Mentés → PATCH/DELETE + refetch + toast, Escape zár). HIBA JAVÍTVA: korábban a kézi sorra kattintva tévedésből interakciós modál nyílt (a sor-kattintás mindig `setSummaryModalRow`-t hívta). Az interakciós sorok változatlanul modált nyitnak.
- **Utófix — dátumjelölési szabály** (commit `4e551cc`): **DÁTUMOKNÁL SOHA „Ma/Tegnap" JELLEGŰ JELölés — mindig a tényleges dátum** (pl. „szept. 7. · 18:23"). Javítva 4 helyen: ügyfélprofil kézi teendő sorok (`taskDateLabel`), naptár listanézet Időpont oszlop, interakciós napló mobil idővonal-szeparátor, member dashboard dátum cella. Ez általános design-szabály a továbbiakban is. Verifikálva a deployed chunkokban („Tegnap" sehol; „Ma" csak a Naptár Ma gomb felirataként).
- **Utófix — kronologikus sorrend a profil nyitott táblázatában** (commit `8b67a5b`): a nyitott táblázat a kézi teendőket fixen LEGFELÜLRA tette, az interakciókat alá — így a kronológia csúszott (pl. 00:32-es feladat a 02:58-as email fölé). Most **kronologikus összefésülés**: kézi teendők + interakciók közös listában `created_at` szerint csökkenő sorrendben (legújabb elöl). A Lezárt táblázat már korábban is így működött.
- **Utófix 2 — Megjelent/No show nem ment (500)** (commit `8f0c232`): GYÖKÉROK — a database.py-ban KÉT `update_calendar_event` definíció volt: az 528-as új `**fields` whitelistes (doctor/attendance_status) és egy 1481-es régi explicit-paraméteres, amelyik Pythonban FELÜLÍRTA (későbbi def nyer). Ezért minden új mező (doctor, attendance_status) TypeError-t dobott → a naptár szerkesztő Mentés 500-özött a 474af4d óta. Fix: a régi definíció törölve (az **fields verzió whitelistja mindent fed: title/start/end/duration/attendee/email/completed/doctor/attendance_status). Verifikálva: konténer signature `(event_id, **fields)`, attendance PATCH 200 + DB-ben persistence OK (event 107 = attended).
- **Utófix — Naptár lista: Megjelent / No show dropdown + Munkatárs** (commit `474af4d`): a korábbi „Nem jelent meg" gomb helyett a múltbeli eseményeknél **dropdown**: — válassz — / Megjelent / No show. No show-nál AUTOMATIKUSAN: `no-show` címke az ügyfélre + ügyfél az Érdeklődőkezelés UTÁNKÖVETÉS (első) oszlopába (kanonikus névfeloldással, mint a profil gomb) + `kanban_removed` törlés. Megjelentnél a no-show címke eltávolítása. **DB migráció**: `calendar_events.attendance_status TEXT` (stagingen lefutott). **Backend**: új `PATCH /admin/api/calendar/{id}/attendance` {value} (verify_jwt — minden szerep) + update whitelist. **Munkatárs oszlop**: tartalma most `event.doctor` (a 12. tétel óta tárolt), fallback az ügyfél assignee. A régi `handleMarkNoShow` (reminder_sent=true) kivezetve. Verifikáció: chunk md5 = friss build, endpoint 401 auth nélkül. Konténer healthy.
- **Utófix — interakciós popup polish** (commit `99444ce`): (1) a chat élő előzményeiből eltávolítottuk a dőlt betűs AI összefoglaló system-sort (duplikálta az ÖSSZEFOGLALÁS dobozt — a napló-summary és a classification.osszefoglalas különböző LLM-fordulatok miatt a korábbi duplikátum-szűrő nem fogta); (2) a modal FOOTER (Ugrás ügyfélprofilra / naptárra / teendőkre) eltávolítva; (3) fejléc pill-ekből az irány (BEJÖVŐ) és az ügytípus (IDŐPONT) kikerült — csak a csatorna pill maradt, ikonnal (Telefon/Email/WhatsApp/Messenger/Instagram SVG); (4) ügyfélstátusz badge UI kit stílus (pötty + tintelt háttér + keret: ÚJ=teal, VISSZATÉRŐ=navy; color-mix -> előre számolt hex a minifikátorral). Verifikálva a deployed ClientDetailView JS+CSS chunkokban.

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

### Migráció 6: `calendar_events.status` + `pending_until` (2026-09-11, stagingen lefutott)
```sql
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmed';
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS pending_until TIMESTAMPTZ;
UPDATE public.calendar_events SET status = 'confirmed' WHERE status IS NULL;
NOTIFY pgrst, 'reload schema';
```
**Ok**: függő (ideiglenes) időpont-foglalás — 259-es ügy, lásd a 20. tételt. ⚠️ A prod DB-n is meg kell legyen a prod-deploy előtt (a `dsiluafthysysnstszbd` projektre már kiment — lásd a 20. tétel MCP-tanulságát).

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

**KANONIKUS KÖR (user-döntés 2026-09-13) = az ügyfélprofil címke-dropdownja:**

```typescript
const SALES_TAGS = ['kampánylead', 'potenciális ügyfél', 'árkérdés', 'törölt időpont', 'no-show'];
```

- Ezek bármelyike (automatikus VAGY manuális kiosztás) az érdeklődőkezelés ELSŐ oszlopába triggerel (innét csak kézzel mozgatható)
- 2026-09-13-i konszolidáció: a backend régi írásmódjai (`kampány lead` szóközzel, `ajánlatkérés`) megszűntek mindhárom kiosztási ponton (web_server kulcsszavas, tools.py voice PREDEFINED_CLIENT_TAGS, email_processor Gemini secondary_tags — utóbbi kettőbe a `potenciális ügyfél` került helyettük); staging DB-ben 4 ügyfél `kampány lead` → `kampánylead` átnevezve (id: 175, 178, 202, 265). ⚠️ Prod-deploykor ez a normalizálás is kell!
- A `TAG_COLORS`-ban a legacy címkék színei megmaradtak (régi adatok megjelenítéséhez); a CampaignWizardModal címkelistája szándékosan bővebb (targeting-szűrő, pl. VIP)
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

**Teszt-takarítás (2026-09-21)**: a user kérésére Orosz Erika (265) + Kis Gizella (271) TELJES adattörlése stagingen: clients (már UI-ból törölte), interactions (824/825/828/808), sessions (2), kézi teendők (10/11), processed_emails (9 sor — az email-újrateszt feldolgozhassa), a 115-ös naptáresemény már kaszkádoltan törölve volt. Konténer restart a high-water mark miatt. Tiszta lap az újrateszthez.

**Email a rossz ügyfélen (2026-09-21, commit `656755b`)**: a 15:20-as tesztben a bemondott „kamu" telefonszám (+36201234567) és email (erika@feedbacks.hu) MÁR LÉTEZETT a 175-ös „Lachner Ödön" régi tesztügyfélen → a book_meeting a foglalás-adatokat (email, service, booked_datetime) a 175-RE írta, a tényleges hívó (273 „Orosz Erika", a tag_client hozta létre a hívó számával) email nélkül maradt. Javítás: a `book_meeting` identitás-feloldása a hívó VALÓS számát (SIP) is erős kulcsként figyeli; eltérésnél duplicate_suspect. A 175/273 pár bejelölve — a user a merge-felületen dönt. Tanulság: a „tag_client korai, adatszegény ügyfél-létrehozás + későbbi erős-kulcs-egyezés" kombináció ismét split-brain-t okozhat; a rendszer jelzi, de a kamu-adat + létező tesztrekord ütközése csak merge-döntéssel oldható fel.

**Teszt-takarítás #2 (2026-09-21)**: Lachner Ödön (175) + Orosz Erika (273) teljes adattörlése — clients/interakciók/események már az UI-törléssel kaszkádoltak, a háttérből 12 processed_emails sor (feedbacks/yahoo/molaire) törölve + konténer restart (high-water mark). Tiszta lap.

**Voice viselkedés-javítások (2026-09-21, commit `ed975a3`)**: 1) hívószám-injekció: a SIP participant a ctx.connect() után ~1-3 mp késéssel érkezik → 5 mp-es retry-ciklus (volt: azonnali, mindig üres); 2) `preemptive_generation=False` — a modell fragmentumokra válaszolt (közbevágás, sorrend-zűr, egyszerre sok kérdés, ismétlések); 3) dentálhigiénia-mentesség a konzultáció-kötelezettség alól (fogkő/EMS/Air-Flow/políroz → közvetlen foglalás, explicit KIVÉTEL-szabály a patient_rules-ban); 4) TANULSÁG: tiszta-lap törlésnél a `processed_emails`-t HAGYNI KELL — a törlés + restart után a 3 napos IMAP-ablak visszahozza a régi teszt-leveleket (a 837-es újrafeldolgozott levél így keletkezett; interakció + napló-fragment kézzel törölve).

**Tárgy-szintű email-threadek + csatorna-szűrt Előzmények (2026-09-21, commit `8b23961`)**: 1) email session_id: `email_<feladó>_<normalizált tárgy>` (Re:/Fwd:/Vá: prefix le, lowercase, 80 kar — `_email_thread_key`/`_email_session_id` az email_processorban) — egy ügy = egy thread, külön témák külön napló-sor; a Gemini-kontextus is a tárgy-thread előzményeit kapja; a cancel-link interakció a „Időpont visszaigazolás" threadbe naplózódik. Régi feladó-szintű sorok érintetlenek. 2) A thread-popup Előzmények csak az aktuális csatorna bejegyzéseit mutatja (parse channel-tag: email/voice/system; a teljes kép az ügyfélprofilon marad).

**KRITIKUS hotfix — emailek eltűntek a naplóból (2026-09-21, commit `f342bd3`)**: a reggeli tool-log szűrő (`tool_name IS NULL`) túl tág volt — az email-pipeline minden bejövő levelet `imap_worker_ai`, a messenger-flow `process_meta_message` stamppel lát el → az összes email/messenger interakció eltűnt a grouped-nézetből és a profilról (841-es teszt-email is). A kizárási lista pontosítva MINDKÉT helyen: csak a tiszta tool-logok (book_meeting, lookup_info, check_calendar); a csatorna-stampek valódi interakciók. **Tanulság: tool_name ≠ tool-log — a csatornák is stampelik az interakcióikat.** Staging SQL Management API-val javítva; a repo-migráció (`migrate_interaction_count_toollog.sql`) szinkronban — prod-deploynál EZT a verziót kell futtatni.

**Szabály: ügyfélnév soha az időpont-kártyán (2026-09-21, commit `2273b9f`)**: a következő időpont kártya és a popup „Szolgáltatás:" sora az ügyfél nevét MINDKÉT cím-formátumról levágja — a rendszer két formátumot is generál: „<szolgáltatás> - <név>" (voice/email) ÉS „<név> - <szolgáltatás>" (a voice book_meeting egyes hívásoknál). Helyes megjelenés: `2026. 09. 28. 09:00 · Fogkő-eltávolítás · Balogh Pálma`. (Hosszabb távon érdemes a cím-formátumot is egységesíteni a létrehozó útvonalakon.)

**Szabály: ügyfélnév soha az időpont-kártyán (2026-09-21, commit `2273b9f`)**: a következő időpont kártya és a popup „Szolgáltatás:" sora az ügyfél nevét MINDKÉT cím-formátumról levágja — a rendszer két formátumot is generál: „<szolgáltatás> - <név>" (voice/email) ÉS „<név> - <szolgáltatás>" (a voice book_meeting egyes hívásoknál). Helyes megjelenés: `2026. 09. 28. 09:00 · Fogkő-eltávolítás · Balogh Pálma`. (Hosszabb távon érdemes a cím-formátumot is egységesíteni a létrehozó útvonalakon.)

**Egységes eseménycím-formátum (2026-09-21, commit `1ba29ab`)**: `db.normalize_event_title(title, attendee)` — „<szolgáltatás> - <név>" minden létrehozó úton (voice book_meeting, email pending flow, messenger/web); „<név> - <szolgáltatás>" → felcseréli, hiányzó nevet a végére fűzi. Kézi naptárfelvétel érintetlen. Backfill: 6 meglévő esemény normalizálva (köztük a 119-es „Orosz Erika - Fogkő-eltávolítás" → „Fogkő-eltávolítás - Orosz Erika"); 3 demo-eseményhez a név hozzáfűzve (a konvenció szerint).
