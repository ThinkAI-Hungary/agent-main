# RESEARCH BRIEF — Kimenő hívások: mi van már megvalósítva a rendszerben?

**A feladat:** nem implementálás, hanem FELTÉRKÉPEZÉS. A cél, hogy teljes, ellenőrzött
képet adj arról, mi az, ami a kimenő hívásokhoz már megvan (kód, adatbázis, telefónia-
infra, UI), mi az, ami részmegoldás, és mi hiányzik teljesen. Minden állítást a kódban
kell igazolni (fájl + sor hivatkozással) — ez a dokumentum kiindulópont, nem végkövetkeztetés.

## 1. Környezet és hozzáférés

- Repo: `/root/dobozos`, branch `rebuild` (HEAD legalább `d1425ec`, 2026-10-09).
- Backend: `thinkai-voice-agent/` (FastAPI `web_server.py` + LiveKit Agents worker `server.py`).
- Frontend: `thinkai-voice-agent/eaisydesk-frontend/` (React/Vite).
- **Staging**: gép maga (`digideskadmin.molaire.hu`), konténer `digidesk-dobozos-agent`
  (`docker logs digidesk-dobozos-agent`), deploy: `bash update.sh` (a `/root/dobozos`-ból).
- **Prod**: külön szerver `root@159.69.158.245` (`desk.eaisy.hu`), ugyanaz a repo, ott futtatott
  `update.sh`; deploy: `bash deploy-prod.sh --yes` (csak user-jóváhagyással!).
- **Supabase MCP CSAPDA**: `mcp__supabase__*` = PROD (dsiluafthysysnstszbd),
  `mcp__supabase-staging__*` = STAGING (qhhnqqsthdrwacsxommt). Staging-munkához
  KIZÁRÓLAG a `-staging` eszközök.
- Kulcsok SOHA nem kerülnek kódba/dokumentációba (Twilio/Telnyx/Brevo/LiveKit kulcsok
  a `.env`-ben és a `tenant_credentials` táblában vannak).
- Teszt-venv pytest-hez: `/root/.venv-eaisydesk-tests/bin/pytest` (400+ teszt, zöld kiindulás).

## 2. Mi van MÁR megvalósítva kimenő hívásokból (kiinduló térkép — ellenőrizd!)

### 2a. Kampány-alapú kimenő hívások — VALÓSZÍNŰLEG ÉL
- **Indító végpont**: `web_server.py` kb. 6300 körül (`"type": "campaign_call"`):
  telefonszám-kampány ügyfél-listán megy végig, ügyfelenként:
  1. `lk.room.create_room` — `call-out-camp-{campaign_id}-{uuid}` room + kampány-metadata (script, client_name, tenant_id);
  2. `lk.sip.create_sip_participant` (`CreateSIPParticipantRequest`) — `sip_trunk_id`, `wait_until_answered=True`, `sip_number=caller_number`.
- **Worker oldal**: `server.py:154` — `is_outbound_call = room_name.startswith("call-out-")`,
  `server.py:154` környékén `is_campaign_call = room_name.startswith("call-out-camp-")`;
  outbound-nál BVC Telephony zajszűrés (`server.py:159` környék), kampány-metadata-ból
  tenant-feloldás (nem DID-ből! — `server.py:180` környék), `direction="outbound"` naplózás.
- **Kérdés a researchnek**: ez a végpont él-e UI-ról (melyik oldal hívja?), tesztelték-e
  valaha élesben, van-e átfogó hibakezelés (nem-elvesz hívás, hangposta, visszautasítás)?

### 2b. Script-alapú (egyi, kézi) kimenő hívások
- `web_server.py:5198` és `5558` körül: `"type": "outbound_script_call"` — ugyanazzal a
  `create_sip_participant` mintával. Kinek a UI-jából érhető el, és mi a státusza?

### 2c. Telefónia-infra per tenant
- `telnyx_provision.py`: `ensure_outbound_voice_profile`, `ensure_fqdn_connection`,
  `ensure_fqdn`, `associate_number` — tenantonkénti Telnyx provisioning (outbound
  voice profile + SIP FQDN connection a LiveKit SIP host felé).
- `web_server.py` kb. 4880–4920: tenant-credentials (`telnyx_api_key`,
  `telnyx_outbound_profile_id`) olvasás + provisioning-hívások.
- **Kérdés**: minden prod-tenantnak van-e kimenőre használható száma/profilja?
  (Ismert: Rivergate prod Telnyx-kulcs HIÁNYZIK — lásd HANDOFF.md kulcs-leltár.)

### 2d. Adatbázis
- `sessions` tábla: minden hívásnak saját sora (`session_id`, `room_name`, `participant`,
  `recording_url`, `started_at`); a kimenő hívás tenantja a room-metadata-ból jön.
- `interactions.direction`: 'inbound' | 'outbound' — a kimenő hívások outbound-ként naplózódnak.
- `outbound_automations` tábla + admin API (`web_server.py:5814`, `database.py:3105`):
  seedelt sorok, be/kapcsoló — **kiderítendő, pontosan mire való és él-e hozzá bármilyen worker.**
- `email_verify_runs` / `sms_logs` / `email_confirm_tokens`: a bejövő hívások utáni
  e-mail-ellenőrző + SMS-visszaigazoló lánc (kimenő hívás után ezek hogyan viselkednek?
  A hívás végi harness `run_and_apply_email_verification` minden hívásnál fut — kimenőnél
  kinek a „diktált címét" erősítené?).
- `calendar_events` (időpontok), `tasks` (teendők — handoff módból kikerülő visszahívások).

### 2e. Foglalás-egyeztetési + SMS/email lánc (a mostani rendszerből)
- Hívás végi futás: `server.py` `_run_classification` → HTTP `POST /api/internal/run-email-verify`
  → `email_verify_harness.run_and_apply_email_verification` (web_server folyamat!).
- Ez a lánc **bejövő** hívásokra épül (diktált email + foglalás). Kimenő hívásnál a célszemély
  nem diktál címet — a researchnek véleményt kell mondania, mi legyen a kimenő hívás utáni
  napló/utófeldolgozás (pl. csak interakció + összefoglaló, harness kihagyása?).

### 2f. Rögzítés és GDPR
- Minden hívás rögzítődik (`call_recorder.py`, sztereó WAV, Supabase Storage, 30 nap retention).
- Kimenő hívásnál a rögzítés és a GDPR-kötelezettségek (hívás eleji tájékoztatás?) —
  ellenőrizd, mit mond a prompt (`prompt_utils.py`, ADATVÉDELMI blokk).

## 3. Amit a researchnek KELL answerednínie (checklist)

1. **Kampányhívás-végpontok**: pontos fájl/sor listája, mely UI-ból hívják, él-e, mik a
   hibakezelési lyukai (nem-elvesz/fogadott/elutasított megkülönböztetés, újrahívás).
2. **`outbound_automations`**: séma + seed + olvasók — van-e hozzá futtató worker, vagy csak placeholder?
3. **Telnyx/LiveKit telefónia**: tenantonként mi kell egy kimenő híváshoz (trunk, OVP, szám,
   dispatch rule?), és mely prod-tenantoknál hiányzik ebből valami (prod `tenant_credentials`
   és a Telnyx portál összehasonlítása — kulcsokat NE írj ki sehová!).
4. **Agent-oldal**: `server.py` outbound ága — greeting/persona/mátrix hogyan viselkedik
   kimenő hívásnál, van-e külön forgatókönyv (script) betöltés, és a `classifier` +
   `run_and_apply_email_verification` hogyan viselkednek outbound irányban.
5. **UI**: van-e már 'hívás indítása' gomb/engedélyezési mátrix (admin vs member)?
6. **Hiányzó darabok felsorolása** arra az esetre, ha a cél: (a) időpont-emlékeztető hívás,
   (b) handoff-visszahívás automata, (c) kampányhívás — mindegyikhez külön jelöld, mi van
   és mi kell.
7. **Kockázatok**: GDPR/hozzáférés (ki indíthat kimenő hívást ügyfélnek?), költség
   (Telnyx percek), betanítatlan script kockázata, dupla hívás (ember + AI egyszerre).

## 4. Munkarend

- Csak olvasás + elemzés; KÓDOT NE MÓDOSÍTS, DB-t NE ÍRD (read-only MCP-kérés).
- Minden megállapítás: fájl:sor hivatkozással.
- Végeredmény: strukturált jelentés a fenti checklist számai szerint, végül egy
  'mi kell a minimális, megbízható kimenő hívás-forgatókönyvhöz' összegzés.
