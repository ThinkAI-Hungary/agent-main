# KUTATÁSI JELENTÉS — SMS-kampány: meglévő infra + megvalósítási terv
*(research subagent, 2026-10-08 — read-only vizsgálat; kód: fájl:sor, DB: read-only SELECT prod + staging MCP-n; kulcsértékek nem kerültek kiírásra)*

## 1. Meglévő SMS-infra (teljes térkép)

### 1.1 `sms_sender.py` — a küldő mag
- **`send_sms`** (`sms_sender.py:174-257`): `send_sms(to, body, *, session_id="", tenant_id=None, purpose="")` → `{ok, sid, status, segments, encoding, error}`. **Sosem dob** (fail-open, :254-257). A kampányhoz NEM kell új küldő — csak helyes paraméterezés (purpose="campaign").
- **DRY_RUN kapu** (:48-50, :189-197): `SMS_DRY_RUN=1` → nincs Twilio-hívás, csak `sms_logs` sor `status="dry_run"`-nal. **Ez a staging-teszt kulcsa.**
- **Kredencialek: KIZÁRÓLAG globális env** (:199-205): `TWILIO_ACCOUNT_SID/AUTH_TOKEN/MESSAGING_SERVICE_SID` (fallback `TWILIO_FROM`). Tenantonkénti Twilio-kredenc **nincs** (prod + staging `tenant_credentials`: sehol twilio kulcs — csak brevo/imap/sip/telnyx/whatsapp). Az SMS platform-szintű.
- Twilio REST közvetlen (SDK nélkül, :137-169), basic auth, 1 retry 429/5xx; `StatusCallback` beállítva (:223-225).
- **Prod .env**: `SMS_DRY_RUN=0` (ÉLES), Twilio SID/token/MessagingServiceSID fenn — az éles SMS-út ma is működik (3/3 delivered bizonyíték: `sms_logs`).

### 1.2 `sms_text.py`
- `is_gsm7` (:16-26): magyar **á, í, ó, ú, ő, ű NEM GSM-7** (é, ö, ü igen) → UCS-2-t erőltet.
- `count_segments` (:29-46): GSM-7 160/153 kar, UCS-2 70/67 kar; vissza `(szegmens, "GSM7"|"UCS2")`.
- `validate_template` (:49-57) kötelező `{link}`-et kér — kampányhoz csak a `count_segments` használható belőle.

### 1.3 `sms_logs` + callback — kampányméréshez elég, migráció NÉLKÜL
- Séma (`migrate_sms_confirm.sql:3-20`): status (queued|dry_run|sent|delivered|undelivered|failed), provider_sid, stb. **Nincs campaign_id/client_id oszlop**, de a `session_id` szabad szöveg — a telefon-kampány már használja a `campaign_phone_{campaign_id}_{client_id}` mintát (`web_server.py:6450`) → SMS-nél `campaign_sms_{campaign_id}_{client_id}` **séma-módosítás nélkül** ad dedupot + eredményszámolást.
- Callback (`web_server.py:6735-6767`): X-Twilio-Signature validáció + `update_sms_status` (`sms_sender.py:260-294`) — **delivered/failed visszajelzés valósággal működik prod-ban** (3/3 delivered sor).

### 1.4 Mai SMS-üzem (3 élő sablon)
| purpose | kiváltó | sablon helye |
|---|---|---|
| `email_confirm` | hívás utáni cím-megerősítés (SMS-first) | `email_confirm_tokens.py:25-33` |
| `handoff_confirm` | igényrögzítés (handoff mód) | `email_confirm_tokens.py:36-39` |
| `reminder_sms` | T-24h emlékeztető megerősítetlen foglalásra | `email_confirm_tokens.py:248-259` |
- Kapu: `sms_eligible` (`email_verify_harness.py:1834-1853`) — E.164 magyar mobil + session-dedup; mód-kapcsoló `EMAIL_VERIFY_SMS_MODE` (prod: `all`).
- **Tenantonkénti SMS-kapcsoló NINCS** — csak globális env.
- A sablonok **szándékosan ékezet nélküliek** (GSM-7-barát, max 2 szegmens) — ez a kampány-SMS-re is átvihető precedens (`email_confirm_tokens.py:22`).

## 2. Hol csatlakozna az SMS-kampány
- A wizard már küldi a `channels: ["sms"]`-t (`CampaignWizardModal.tsx:301-310,551`); a create átadja; az **indításnál elnyelődik**: `supported = {"email","messenger","telefon"}` (`web_server.py:5906`) → csak-SMS kampánynál 400 (`:5917`); scheduler ugyanez (`:216`).
- Runner-minta: a telefon `_run_phone_campaign` (`6312-6487`) viszi a jó mintákat (napi limit, H–P 09-17 időablak, per-ügyfél dedup, záróstátusz) → **új `_run_sms_campaign` származtatható belőle**; SMS-hez az időablak és a 60 mp várakozás nem kell (1-2 mp sleep elég).
- **Címzés csapda**: a `custom_data` telefonszámok `+36 30 234 5678` SZÓKÖZÖKKEL vannak normalizálva (`database.py:1853-1879`) — a Twilio `To` szóköz-mentes E.164-et kíván (szóköznél 21211-es hiba) → az SMS-runnerben szóköz-mentes normalizálás kell.
- **Lefedettség (prod, Dentors)**: 127 ügyfélből csak **27-nek van használható telefonszáma** — a hiányzókat kihagyjuk (mint emailnél), a wizardban jelezni a várható darabszámot.

## 3. Üzenet-formázás
- Sablon-változók: `{name}` + `{rendelo}` (a `{rendelo}` feloldó már létezik: `_rendelo_name()` env → tenants.name → „Rendelo", `email_verify_harness.py:1899-1917`).
- **Ékezetek → UCS-2 → 2-3-szoros költség**. Javaslat: automatikus ékezet-levágás küldés előtt (~15 soros fordító-tábla) — konzisztens a meglévő ékezet nélküli sablonokkal; opcionális wizard-figyelmeztetés.
- Élő szegmens-számláló a wizardban: nincs; ~30 soros TS-port a `count_segments`-ről megjelenítheti „N szegmens (GSM7/UCS2)" + figyelmeztetés >2-nél. Az AI-generáláshoz a backend már ismeri az „sms" csatornát (`max_lengths["sms"]="160 karakter"`, `web_server.py:6070`) — nem kell nyúlni hozzá.

## 4. Limit / költség / GDPR
- **Napi limit**: nincs új tábla — `sms_logs.created_at + tenant_id + purpose="campaign"` alapján számolható (~10 soros db-helper) + `SMS_DAILY_SEND_LIMIT` env.
- **Twilio ár HU**: 0,091 USD/kimenő üzenet/szegmens (origin-based pricing) → 100 egy-szegmenses SMS ≈ 9,1 USD. A 27 elérhető ügyféllel az első kampányok költsége elhanyagolható.
- **Jogi keret HU-ban (tájékoztató, nem jogi vélemény)**: marketing-SMS hozzájáruláshoz kötött (Ptk. 6:155. §); feladóazonosítás + leiratkozási lehetőség várható. Gyakorlati minimum: csak saját ügyfél-adatbázis, feladóazonosítás, „Leiratkozas: STOP" zárószöveg.
- **Opt-out ma NINCS**: bejövő SMS-webhook nincs. V1: STOP-kezelés manuálisan (sms_logs-ból kikereshető); v2: Twilio inbound webhook.

## 5. Javasolt megvalósítási terv (minimál kód, meglévő infra újrahasználatával)

**Nincs DB-migráció** — a send_sms/sms_logs/callback készen áll.

**A. Backend — `web_server.py` (~150-200 sor)**
1. `supported` setekbe "sms": `:216` (scheduler) és `:5906` (start); `channel_names` bővítés `:5945`; hibaüzenet frissítés `:5917`.
2. Új `_run_sms_campaign(campaign)` a `_run_phone_campaign` mintájára: prefix-bontás → napi limit sms_logs-ból (`SMS_DAILY_SEND_LIMIT` env) → ügyfelenként: telefon a custom_data aliasokból, szóköz-mentes E.164, hiányánál kihagyás → dedup `session_id="campaign_sms_{campaign_id}_{client_id}"` → body: `{name}`/`{rendelo}` csere + ékezet-levágás → `send_sms(..., purpose="campaign")` → 1-2 mp sleep → záróstátusz.
3. Bekötés: start + scheduler után `if "sms" in active_channels: task = asyncio.create_task(_run_sms_campaign(c))`.

**B. Frontend (~50-80 sor)**: wizard szegmens-számláló (TS-port) + UCS-2 figyelmeztetés; várható SMS-darabszám. A DetailPanel processed/total kijelzés érintetlenül működik.

**C. Kockázatok**: (1) Twilio To-formátum — normalizálás + dry-run teszt; (2) UCS-2 költség — ékezet-levágás; (3) marketing-jogi megfelelés — első kampány csak meglévő ügyfélnek, STOP-szöveggel; (4) stagingen a workerek kikapcsoltak — de a start-API manuálisan futtatható.

**D. Staging-tesztterv (valódi SMS NÉLKÜL)**: `SMS_DRY_RUN=1` → minden kampány-SMS `dry_run` sms_logs sort ír → wizard → létrehozás → indítás → `SELECT * FROM sms_logs WHERE purpose='campaign'` (normalizált szám, szegmensek, dedup második indításra). Egyszeri valós kísérlet saját számmal (prod-konfig, 1 telefonszámos kampány) → delivered + callback. Limit-ág: `SMS_DAILY_SEND_LIMIT=1`-mel a második ügyfélnél „Megállítva".

**Munkaigény: KÖZEPES** (backend ~150-200 sor + frontend ~50-80 sor, **0 migráció**); a küldő, a napló, a callback és a limit-minták mindegyike élesben működik.

Források: [Twilio SMS Pricing – Hungary](https://www.twilio.com/en-us/sms/pricing/hu), [Twilio origin-based pricing](https://help.twilio.com/articles/223183188-Origin-Based-Pricing-for-European-destinations)
