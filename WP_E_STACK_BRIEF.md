# WP-E TELJES STACK- és MÓDSZER-BRIEF — külső research agent átadásához

**Verzió**: 2026-09-24, commit `d1811ec` (branch `rebuild`) állapot szerint.
**Nyelv**: magyar (a rendszer, a promptok és az adatok magyar nyelvűek — ez a feladat maga is magyar-specifikus).
**Titkok**: ez a dokumentum SZÉNDÉKESEN nem tartalmaz kulcsértékeket — csak a kulcsok NEVÉT és TÁROLÁSI HELYÉT. A kulcsok a staging `.env`-ben és a Supabase `tenant_credentials` táblában érhetők el.

---

## 1. Probléma és cél (miért létezik ez a rendszer)

Egy magyar fogászati klinikáknek eladott, több-bérlős CRM („eaisyDesk" / „Digidesk") AI telefonos asszisztenst üzemeltet, amely időpontfoglalást kezel. A foglalási visszaigazolás e-mailben megy, az e-mail címet viszont az ügyfél **hangosan diktálja** a telefonban.

**A probléma**: a valós idejű beszédfelismerő (Gemini 3.1 Flash Live) magyar e-mail-diktálásnál hibázik:

- ékezetes lokál-rész félreírása („tóthildi" → „tothildi"/„tothgyildi"),
- számszavak („tizenhárom" = 13, „nyolcvannégy" = 84) elrontása vagy szóként hagyása,
- domain-betűzés („citromail", „freemail") félrehallása,
- a diktálás műtermékei („kukac", „pont", szóközök a cím belsejében).

**Történeti incidens**: productionben a visszaigazoló e-mail rossz címre ment ki. Emiatt épült a **hívás utáni (post-call) e-mail-verifikációs harness** (WP-E): a hívás végén a hanganyagot ÚJRA átírjuk egy második, batch STT-vel, a két átiratból (élő + utólagos) LLM kiolvassa a diktált címet, JEV (szakértő klasszifikációs modell) dönt a jelöltek közt, és csak „zöld" verdict esetén megy ki a visszaigazolás autonóman; különben **dupla opt-in** (a cím csak kattintásos megerősítés után érvényesül).

**Alapelv (user-döntés, kötelező)**: a diktált cím **önmagában a SZÖVEGBŐL értendő** — a harness NEM hasonlítja a kinyert címet az ügyfél nevéhez vagy korábbi e-mailjéhez (egy diktálásnak semmi köze a névhez). Az extrakció LLM-alapú (nem csak regex), a verifikáció LLM + JEV együtt.

---

## 2. Rendszer-architektúra (komponenstérkép)

```
Hívó (mobil/PSTN)
   │  HU DID: +36 1 211 4217 (staging)
   ▼
Telnyx (SIP trunk, FQDN connection; inbound.codecs = ["OPUS","G722"])
   ▼
LiveKit Cloud (SIP + room; dispatch az agent workernek)
   ▼
LiveKit Agents worker (server.py, livekit-agents 1.5.x)
   ├─ Gemini 3.1 Flash Live realtime (gemini-3.1-flash-live-preview)
   │    = ÉLŐ STT + LLM + TTS EGY modellben, magyarul
   ├─ Agent tools (tools.py): book_meeting, stb. → Supabase
   └─ CallRecorder (call_recorder.py): mindkét hangsáv rögzítése
        → sztereó WAV (16 kHz, hívó=BAL/csatorna0, agent=JOBB/csatorna1)
        → Supabase Storage privát „recordings" bucket
             rivergate/<dátum>/<session_id>.wav  (30 nap retention)

Hívás vége (worker entrypoint, finally ág):
   1. finish_and_upload (WAV a bucketbe)
   2. klasszifikáció (classifier.py, Gemini batch) → interactions sor
   3. WP-E harness hook (EMAIL_VERIFY_MODE=1 esetén, await, 240 s timeout)
        email_verify_harness.py:
        felvétel letöltés → Soniox batch STT (fallback ElevenLabs Scribe)
        → LLM-extrakció (gemini-3.8-flash, JSON)
        → jelölt-összefésülés (regex + LLM + élő olvasat)
        → JEV arbitráció (OpenRouter Decisions, typesafe/jev-1.13)
        → GREEN / NON-GREEN verdict
        → visszaigazoló MOST  |  dupla opt-in levél  |  fail-open legacy

E-mail: Brevo API (email_processor.py), sender: <klinika> <hello@thinkai.hu>
Ügyfélnezet: Supabase Postgres (staging project qhhnqqsthdrwacsxommt,
             prod: dsiluafthysysnstszbd — VIGYÁZZ, az MCP defaultja a prod!)
Admin frontend: React+TS (eaisydesk-frontend) — a harnessnek nem része,
             de az auditokat itt látja az ember (interakció-popup).
```

**Két Python folyamat fut** a staging konténerben (`dobozos-agent`):
- FastAPI web-kiszolgáló (web_server.py, ~8700 sor) + e-mail worker,
- LiveKit agent worker (server.py).

---

## 3. Hang-lánc részletei (mérve, nem feltételezve)

Teljes audit: `HANGFELVETEL_AUDIT.md` a repóban. A lényeg:

- **Telnyx → LiveKit**: FQDN connection, `inbound.codecs = ["OPUS","G722"]`; a hívásokon G.722 egyezik meg (Telnyx CDR MoS ≈ 4.49). Ennek ellenére a tényleges hanganyag **szűksávos (~3,4 kHz felett elnyomott)** — a szűk keresztmetszet a **hívó upstream** (mobilhálózat → Telnyx HU DID), konfiggal nem javítható. Ez kulcskörnyezeti tény a STT-minőség értékelésénél: a batch STT nem tud többet kiolvasni, mint ami a hangban fizikailag benne van.
- **Rögzítő** (`call_recorder.py`): 16 kHz, 20 ms-os frame-ek (320 minta), sztereó WAV: hívó BAL, agent JOBB. Jitter-tűrő író („stall-wait" + `STALL_PATIENCE`): a LiveKit RTP-beszállítás akadozása (mért: 6–24 üres lyuk/perc rossz hálózatnál; nyugalmi bázis 2,6/perc) ellenére a WAV időtengelye konzisztens marad. `MAX_DURATION_S` plafon.
- **Krisp**: a szerveroldali zajszűrést kikapcsoltuk a CreateSIPParticipant helyeken (a dupla zajszűrés műtermékeket adott a batch STT-nek).

**Következmény a kutatáshoz**: minden STT/harness-mérésnél az audio_qc-vel (l. §8) ellenőrizni kell a bemenet minőségét; egy rossz hívás (sok lyuk, szűksáv) eredményét nem szabad az algoritmus hibájának-bookolni.

---

## 4. Hívás életciklus és a tool-call bekötés

### 4.1 A hívás KÖZBEN

Az agent a Gemini Live sessionben működik; az eszközeit (function calling) a `tools.py` regisztrálja. Az időpontfoglalás a **`book_meeting`** tool — paraméterek közt `attendee` (ügyfélnév) és `attendee_email`. Ezek az agent **ÉLŐ olvasatai** a diktálásról (ez az első „olvasat").

`book_meeting` lépései (tools.py ~:570–640):

1. szolgáltatás-egyezés → időtartam a szolgáltatástáblából (`resolve_service_duration` — a tábla nyer az LLM 30 perces defaultjával szemben),
2. ellátó-feloldás (`resolve_assigned_staff`),
3. `db.add_calendar_event(...)` — a naptárevent LÉTREJÖN, `attendee_email` = élő olvasat,
4. **EMAIL_VERIFY_MODE=1 esetén a visszaigazoló email NEM megy ki**: a foglalás-dikt bekerül a modulszintű stash-be:
   ```python
   stash_session_booking(get_session_id(), {
       "event_id": event_id, "title": title, "date": parsed_date,
       "time": parsed_time, "attendee": attendee, "attendee_email": attendee_email,
   })   # → tools.SESSION_BOOKING_DATA[session_id] lista
   ```
   (EMAIL_VERIFY_MODE=0 esetén itt menne ki azonnal — ez a „legacy" út, ami fail-open tartalékként is él),
5. ügyfél (kanban) létrehozás/frissítés: `custom_data.email` = élő olvasat (a harness green-verdictje később korrigálhatja).

### 4.2 A hívás VÉGÉN (server.py entrypoint, ~:867–894)

```python
if os.getenv("EMAIL_VERIFY_MODE", "0") == "1":
    await asyncio.wait_for(
        run_and_apply_email_verification(
            session_id=..., tenant_id=..., interaction_id=...,
            turns=(recorder.turns if ... else []),   # élő átirat turnusok
            client_id=...,
        ), timeout=240)
```

- `await` + `wait_for(240 s)`: fire-and-forget lenne halálos (a worker-folyamat az entrypoint visszatérésekor leáll); a Soniox-átirat 30–120 s is lehet.
- Timeout/hiba esetén `_spawn(send_session_confirmations(...))` — a fail-open legacy küldés.

### 4.3 A harness vezérlő (`run_and_apply_email_verification`, email_verify_harness.py)

1. `bookings = tools.pop_session_bookings(session_id)` → `booking_email = bookings[0].attendee_email`, `booking_name = bookings[0].attendee` (üres lehet!).
2. `run_harness(...)` — szinkron, `asyncio.to_thread`-ben (a worker event loopját ne blokkolja). **Sosem dob** — hibánál `{"status": "error"}`.
3. Verdict szerint:
   - `green` → `send_booking_confirmation_email(...)` MOST, minden stash-elt foglalásra, a **winner** (ellenőrzött) címmel;
   - `non_green` és van winner → `send_email_verification_email(...)` — dupla opt-in a jelöltre;
   - `error` / `no_recording` / nincs cím → `_send_legacy_confirmations(...)` (azonnali küldés a foglalási címmel — a visszaigazolás sosem veszik el).

### 4.4 Dupla opt-in kattintás (web_server.py `/api/public/verify-email`, :6384)

- A nem-zöld levélben JWT-link (7 napos lejárat): payload `{session_id, event_ids[], email}`, aláírás `JWT_SECRET`-tel.
- Kattintásra: `email_logs` sor `status="clicked"`; ügyfél `custom_data.email_verification.verified_at` bélyeg; a visszatartott visszaigazolók **ténylegesen kimennek** a megerősített címre; HTML visszaigazoló oldal.

---

## 5. A harness pipeline lépésről lépésre (`_run_harness_inner`)

### 5.1 Felvétel

`sessions` sor → `recording_url` (bucket-path) → `db.supabase.storage.from_("recordings").download(path)`. Nincs felvétel → `{"status": "no_recording"}` → legacy.

### 5.2 Másodlagos STT (batch, „második olvasat")

Diszpécser: `transcribe_wav_bytes` — `HARNESS_STT_ENGINE` (default `soniox`) az elsődleges, a másik motor fallback üres eredmény esetén.

**Főmotor — Soniox async fájl-átirat** (`_transcribe_soniox`; api.soniox.com, Bearer `SONIOX_API_KEY`):

1. `POST /v1/files` (multipart, audio/wav) → `file_id`,
2. `POST /v1/transcriptions` `{file_id, model: "stt-async-v5" (fallback "stt-async-v4"), language_hints: ["hu"]}` → transcription `id`,
3. poll `GET /v1/transcriptions/{id}` 3 mp-enként, max 60× (~3 perc), `status=="completed"`-ig,
4. `GET /v1/transcriptions/{id}/transcript` → `{tokens: [{text, start_ms, end_ms, confidence}], text}` — a tokenek **szub-szavas fragmentek**, a szóhatár a token szövegének VEZETŐ SZÓKÖZÉBEN van → `_soniox_tokens_to_words` fragment-akumulátorral fűz szavakat; konfidencia nélküli token → logprob −0,7,
5. takarítás: `DELETE /v1/transcriptions/{id}` és `DELETE /v1/files/{id}` (GDPR-higiénia),
6. hibánál `{}` (fail-open), sosem dob.

**Fallback — ElevenLabs Scribe v2** (`_transcribe_scribe`): `POST /v1/speech-to-text`, `model_id=scribe_v2`, `language_code=hu`, `use_multi_channel=true`, `timestamps_granularity=word`, domain-keyterms; válasz: `transcripts[]` csatornánként `words[]` (`type=word/spacing`, `logprob`). (A kulcs TTS-scope NEM rendelkezik — csak STT.)

Csatorna-szétválasztás: hívó = `min(channel_index)` (BAL); `caller_text` a hívóé, `agent_text` kontextus.

### 5.3 LLM-extrakció (a REDESIGN magja, 2026-09-24)

`llm_extract(transcript_live, transcript_stt)`:

- **Modell**: `EMAIL_VERIFY_LLM_MODEL` env, default **`gemini-3.8-flash`** (a user utasítására váltva a 2.5-ről). SDK: `google-genai` 2.25.0, `genai.Client(api_key=..., http_options=HttpOptions(timeout=90_000))`. Kulcs: BYOK — `db.get_gemini_api_key()` (tenant_credentials.gemini_api_key → env GOOGLE_API_KEY).
- **Újrapróbálás**: 429/5xx/„unavailable"-jellegű hibára 3 próbálkozás, 0/6/15 mp backoff (`_is_retryable_llm_error`); minden más hiba, vagy kimerülés → `{}` (fail-open). (Tapasztalat: a 3.8-flash terhelési csúcsban időnként 503-at ad.)
- **Bemenet**: KÉT átirat — (1) az élő turnusok beszélő-címkézve (`_live_transcript_text`: soronként `user: …` / `ai: …`), (2) az utólagos STT szöveg (`user: <caller_text>\nai: <agent_text>`). Max 6000 karakter/szakasz.
- **Prompt** (`build_llm_extract_prompt`, szó szerinti lényeg):

  > Te egy magyar fogászati rendelő telefonos AI-asszisztensének UTÓELLENŐRZŐ motorja vagy. Ugyanarról a hívásról két különböző beszédfelismerő készített átiratot (élő valós idejű és utólagos). Feladatod: a HÍVÓ (ügyfél) által diktált/közölt EMAIL CÍMET és — ha elhangzott — a NEVÉT kiolvasni.
  > A diktálás magyar konvenciói: „kukac" = @, „pont" = ., „kötőjel" = -, „aláhúzás" = _, „dupla x" = xx; a betűzést és a számdiktálást („tizenhárom" = 13) értelmezni kell; az emailcímet EGYBE kell írni — a benne lévő szóközök a diktálás műtermékei.
  > CSAK az ügyfél által mondott adatot add meg! Az ASSZISZTENS (az AI-agent) saját neve, bemutatkozása és mondatai SOHA nem ügyféladatok — ha csak az agent neve hangzott el, a name legyen null.
  > Ha az ügyfél nem diktált emailcímet → email: null; ha a neve nem hangzott el → name: null. Semmit nem szabad kitalálni.
  > A variants mező a bemondott cím MINDEN hihető írásformáját tartalmazza (ékezetes és ékezet nélküli lokál, gyanús domain-változat is).
  > A confidence 0 és 1 közti szám: mennyire vagy biztos a kinyert értékekben.
  > Válasz KIZÁRÓLAG JSON-objektum: `{"email": string|null, "name": string|null, "variants": [string], "confidence": number}`

  + `── ÉLŐ ÁTIRAT ──` és `── UTÓLAGOS ÁTIRAT ──` szakaszok.
- **Válasz-parse** (`parse_llm_extract`, pure): markdown-fence levágás; szigorú JSON-parse, hibánál megengedő második próbálkozás (érvénytelen escape-ek eldobása); `email` csak akkor fogadott, ha teljesíti a laza szintaxis-regext (`^[^@\s]+@[^@\s]+\.[^@\s]+$`); `variants` ugyanígy szűrve, dedup; `confidence` clamp [0,1]; az `email` a `variants` ELSŐ helyére kerül. Érvénytelen válasz → `{}`.
- **Élő verifikált viselkedés** (konténerben, szintetikus magyar átiratokkal):
  - „kovacs bertalan **tizenharom** kukac citromail pont hu" → `kovacsbertalan13@citromail.hu`, confidence 0.95, variants: `kovacsbertalan13@ / kovacs.bertalan13@ / kovacs_bertalan13@ / kovacs-bertalan13@citromail.hu`,
  - „aniko pont szilagyi **nyolcvannégy** kukac gmail pont com" + „Szilágyi Anikó vagyok" → `aniko.szilagyi84@gmail.com` + `name: "Szilágyi Anikó"`, confidence 0.98,
  - az agent „**Gábor vagyok**" bemutatkozása mindkét esetben NEM lett `name`.

### 5.4 Determinisztikus segéd-normalizáció (a regex-úthoz, az LLM MELLETT)

`normalize_spoken_hu`: töltelékszavak → „dupla x"→xx → kukac→@ (zárójelessel együtt), „at"→@ → pont→`.` → kötőjel/vonal→`-`, aláhúzás→`_` → számszavak számjeggyé **csak** gyanús kontextusban: telefon-trigger (+36, 06.., „telefonszám"…) + ≥2-es futam, VAGY ≥3-as számszó-futam, VAGY a szövegben van `@` (e-mail-lokál: „tizenharom"→13, „otvenhat"→56; tizes-összetételek: `tizen/húsz/huszon/harminc/…` + egyes → kétjegyű).

`extract_email_candidates(normalized_text)`: feszes regex `[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}`; szóközös műtermékek összefűzése ékezet-nyírt másolaton („kovacs @ gmail . com" → „kovacs@gmail.com"); variánsok: ismert TLD utáni szemét levágása („citromail.hu.megjegyezted"→„citromail.hu"), eleji kontextuszó lehúzása („hogybalazs…"→„balazs…").

### 5.5 Jelölt-összefésülés (`merge_email_candidates`)

Sorrend = plauzibilitás:

1. **LLM-olvasat + LLM-variants** (szintaxis-szűrve, dedup) — EZEK ÁLLNAK ELŐL,
2. foglalási élő olvasat (`booking_email`) + ékezet-nyírt változata + domain-Levenshtein javítások (≤2: „gmial.com"→„gmail.com"),
3. regexes jelöltek az élő és az utólagos normalizált szövegből (+foldolt változataik),
4. kereszt-kombinációk (élő lokál × utólagos domain és fordítva).

### 5.6 JEV-arbitráció (`arbitrate`)

- Ha a két fő olvasat (élő foglalási vs utólagos regex-első) **karakterben egyezik** → `{"choice": …, "confidence": 1.0, "source": "agree"}` (nincs hívás).
- Egyetlen jelölt → confidence 0.5, `source: "single"`.
- Különben **OpenRouter Decisions** végpont: `POST https://openrouter.ai/api/alpha/decisions`, Bearer `OPENROUTER_API_KEY`, modell `OPENROUTER_JEV_MODEL` (default `typesafe/jev-1.13` — szakértői choice-klasszifikátor, ~$0,03/1000 item). Payload:

  ```json
  {"model": "typesafe/jev-1.13",
   "state": {"kind": "email",
             "live_value": "<foglalási élő olvasat>",
             "scribe_value": "<regex-első az utólagosból>",
             "llm_value": "<LLM-olvasat>", "llm_confidence": <float>,
             "transcript_live": "<norm. élő, 800 kar>",
             "transcript_scribe": "<norm. utólagos || összes, 800 kar>",
             "note": "magyarul diktált email cím vagy név, több STT/LLM-olvasat eltér"},
   "questions": {"pick": {"type": "choice",
       "instructions": "<magyar utasítás: melyik a hívó által valójában bemondott érték; gyakori domainek, ékezetek, kukac/pont>",
       "criteria": {"<jelölt1>": "<jelölt1>", "<jelölt2>": "<jelölt2>"}}}}
  ```

  Válasz: `answers.pick.{choice, confidence}`. Hiba/érvénytelen → fail-open: első jelölt, confidence 0.0, `source: "error"`.

### 5.7 Validáció és a ZÖLD-kapu

```python
validation = validate_email(winner)   # syntax + mx_resolves(domain) + known_domain
agree = live_email and (live_email == llm_email or live_email == scribe_email)
green = syntax and (agree or jev_confidence >= 0.99) and mx is not False
```

- `mx_resolves`: dnspython MX → socket A-fallback; `False` CSAK definitív NXDOMAIN-nél; `None` (ismeretlen/timeout) NEM blokkol (hálózati hiba ne küldjön opt-int).
- Küszöb: `EMAIL_VERIFY_CONF_THRESHOLD`, default **0.99** (autonóm korrekciós kapu).

### 5.8 Döntések hatásai

**GREEN**:
- ha a winner eltér a tárolt ügyfél-címtől → `clients.email` oszlop frissül; audit: `custom_data.email_verification = {previous, value, confidence, source, status: "corrected"|"green", applied: true, ts}`; korrekciós interakció-sor (`tool_name="email_verify_harness"`),
- a hívásban keletkezett naptáreventek `attendee_email`-je frissül (cutoff: session `started_at` — régebbi eventeket SOHA nem nyúl),
- visszaigazoló email megy MOST a winnerre.

**NON-GREEN**:
- `clients.email` oszlop **ÉRINTETLEN**; audit: `{..., status: "non_green", applied: false, value: <jelölt>}`,
- dupla opt-in levél a **jelölt** címre (§4.4), a verdict `email.winner` mezője mindig a jelölt — erre megy az opt-in.

**ERROR / NO_RECORDING / nincs cím**: legacy azonnali küldés a foglalási címmel (fail-open; a visszaigazolás sosem vész el).

### 5.9 Név-út (`_verify_name`) — szigorú szabályokkal

- **Ha a foglalás (book_meeting) nem rögzített nevet → a harness NEM foglalkozik a névvel** (`return None`): nincs kinyerésből írás. (Élő incidens javítása: az agent bemutatkozóneve — „Gábor" — került ügyfél-névnek.)
- Statikus agent-név-tiltólista NINCS (user-döntés: az agent neve bérlőnként más — a guard a fenti feltétel).
- Ha van rögzített név: jelöltek = booking-név + „nevem X"/„X vagyok" regex az utólagos hívó-szövegből (`extract_scribe_name`) + LLM `name`; JEV-arbitráció; írás csak, ha a nyertes különbözik ÉS `db.is_valid_client_name` igaz ÉS confidence ≥ küszöb; audit: `custom_data.name_verification = {previous, value, confidence, source, ts}`.

---

## 6. Adatmodell (a harness által érintett objektumok)

| Tábla/mező | Szerep |
|---|---|
| `sessions.recording_url, started_at` | WAV bucket-path (`rivergate/<dátum>/<session_id>.wav`), esemény-cutoff |
| `interactions.transcript_turns` (JSONB) | élő átirat turnusok: `{role: "user"|"ai", text, start_s}` — a harness ÉLŐ bemenete és a bubble-seek alapja |
| `clients.email, name, phone, custom_data` | az ügyfél-tényleges értékek; audit a `custom_data`-ban |
| `clients.custom_data.email_verification` | `{previous, value, confidence, source, status: green|corrected|non_green, applied: bool, verified_at?, ts}` |
| `clients.custom_data.name_verification` | `{previous, value, confidence, source, ts}` |
| `calendar_events.attendee_email, attendee_phone, assigned_to` | a foglalás eseménye (green korrekciónál frissül) |
| `email_logs(status, session_id)` | küldés-lánc: `pending/sent/failed/clicked`; az opt-in kattintás `clicked` |
| `tenant_credentials` | BYOK: `gemini_api_key`, `brevo`-kulcs, `telnyx_api_key` (értékek nem ide valók) |

---

## 7. Konfiguráció (env + kulcsok — NEVEK, értékek nélkül)

| Változó | Default | Jelentés |
|---|---|---|
| `EMAIL_VERIFY_MODE` | 0 | 1 = a visszaigazolás CSAK a harness-verdict után megy |
| `EMAIL_VERIFY_CONF_THRESHOLD` | 0.99 | autonóm korrekciós/green küszöb (JEV-bizalom) |
| `EMAIL_VERIFY_LLM_MODEL` | `gemini-3.8-flash` | az extrakciós LLM |
| `HARNESS_STT_ENGINE` | `soniox` | fő STT (`soniox` / `scribe`) |
| `SONIOX_API_KEY` | — | Soniox batch STT |
| `ELEVENLABS_API_KEY` | — | Scribe STT fallback (nincs TTS-scope!) |
| `OPENROUTER_API_KEY`, `OPENROUTER_JEV_MODEL` | `typesafe/jev-1.13` | JEV-arbitráció |
| `GOOGLE_API_KEY` | — | Gemini fallback (BYOK: tenant_credentials előbb) |
| `RECORDINGS_ENABLED`, `RECORDINGS_RETENTION_DAYS` | 1, 30 | rögzítés + GDPR-takarítás |

Környezet: staging `https://digideskadmin.molaire.hu` (Supabase `qhhnqqsthdrwacsxommt`), prod Supabase `dsiluafthysysnstszbd`. Deploy: `update.sh` (staging), `deploy-prod.sh` (prod). A staging DB jelenleg szándékosan NULLÁZOTT (0 ügyfél/interakció/session/email_log) a tiszta-lapos tesztekhez; 12 demo `calendar_events` maradt.

---

## 8. Tesztelési protokoll — 5 hívás a stagingen (+36 1 211 4217)

### 8.0 Előfeltételek

- EMAIL_VERIFY_MODE=1, RECORDINGS_ENABLED=1, tiszta DB. Minden hívásnál a user FELJEGYZI a pontos (kitalált) bemondott címet — ez a **ground truth**, objektív mérés nélküle lehetetlen.

### 8.1 Forgatókönyvek

| # | Név | Cím-diktálás | Elvárt verdict | Mit bizonyít |
|---|---|---|---|---|
| 1 | „Kovács Bertalan vagyok" | lassan, tisztán: „kovacs bertalan tizenharom kukac citromail pont hu" | GREEN (élő ≈ LLM) | boldog-út; audit `applied: true`; visszaigazolás azonnal |
| 2 | — | gyorsan, elmosva/torzítva (pl. „gmail" jellegű), közben kísérőbeszéd | NON-GREEN | opt-in megy a jelöltre, ügyfél címe NEM íródik felül; kattintás → clicked→sent lánc |
| 3 | NEM mond nevet (kitér) | számszavas lokál: „… kettő nulla nulla kukac gmail pont hu" | GREEN/ NON-GREEN | **név nem íródik semmire** (Gábor-bug-regresszió); számjegy-kezelés |
| 4 | ékezetes lokál (pl. „tóthildi kukac freemail pont hu") | — | GREEN + korrekció | élő hibázik, utólagos+LLM helyes → `previous` megőrzése, event-email frissül |
| 5 | foglalás email NÉLKÜL | „most nincs nálam" | nincs email | fail-open út; semmi rossz címre; nincs crash |

### 8.2 Mérés hívásonként (4 lépés)

1. **Audio-QC** (`scripts/audio_qc.py <wav> --channel 0` és `--channel 1`; numpy-alapú, user-supplied): lyukak/perc, dupla frame-ek, kattanások, SNR, rolloff99 → OK/HATÁRESET/ROSSZ. A/B a bázishoz (2,6 lyuk/perc). **Ez a bemenet-minőség-védőbilincs**: rossz hangon az algoritmust nem szabad hibáztatni.
2. **Átirat-háromszög**: élő turnusok (`interactions.transcript_turns`) vs Soniox-újraátirat (a letöltött WAV-on `_transcribe_soniox`) vs LLM-extrakció (verdict `llm` mezője) — mind a ground truth-hoz, e-mail-span pontossággal.
3. **DB-audit** (staging Management API): `clients` (email oszlop + `email_verification` audit), `email_logs` (mi, KINEK, mikor; clicked→sent), `calendar_events.attendee_email`, `sessions.recording_url`.
4. **PASS/FAIL** — mind a négy kell:
   (a) a VALÓDI címre megérkezett a visszaigazolás (azonnal vagy kattintás után),
   (b) ROSSZ címre semmi nem ment,
   (c) az ügyfélsor nem sérült (non-green nem írt felül; green korrekció őrzi a `previous`-t),
   (d) a név csak akkor változott, ha valóban elhangzott.

Eredmény: hívásonkénti táblázat (ground truth | élő olvasat | LLM | JEV-nyertes | verdict | hova ment az email) + HANDOFF-bejegyzés.

### 8.3 Unit-teszt-bázis

`tests/test_email_verify_harness.py` — 101 teszt (teljes szóvit 241, mind zöld): normalizáció, jelölt-generálás, JEV-mock, zöld-kapu, LLM prompt/parse/hívás (mockolt kliens), merge-prioritás, név-guard, green-gated írás.

---

## 9. Ismert korlátok és nyitott kutatási kérdések

1. **Szűksávos upstream**: a hívó mobil→Telnyx HU DID lánc ~3,4 kHz felett elnyom — a batch STT pontosságának fizikai plafonja. Kérdés: magyar szélessáv-képes SIP-origination / más DID-provider érdemes-e.
2. **Rögzítő jitter**: LiveKit RTP-beszállítási lyukak (6–24/perc rossz hálózatnál, bázis 2,6) — a stall-wait író kezelni próbálja, de a forrás nem javítható szerveroldalon.
3. **gemini-3.8-flash 503**: terhelési csúcsban időnként elérhetetlen (retry 0/6/15 mp felfogja; tartós kiesésnél fail-open regex+JEV út). Kérdés: érdemes-e másodlagos extrakciós modell-fallback (pl. 3.5-flash) — user-döntés.
4. **GDPR-szövegütközés**: az agent 14 napot mond a rögzítésről, a retention 30 nap — összehangolandó.
5. **Küszöb-kalibráció**: a 0.99-es green-küszöb és a JEV/küszöbök (feladó-szűrő 0.8) kézzel nem kalibráltak — nagyobb valódi halmazon érdemes lenne (a staging nullázva van, a prod-visszamenő hívások anonimizálva termelnék a kalibrációs szettet).
6. **Aranyszet-generálás**: golden-set hanganyag TTS-ből — az ElevenLabs-kulcsnak nincs TTS-scope-ja; Gemini TTS-sel kivitelezhető, de a „telefonos szűksáv" karaktert modellezni kell (magas-frekvenciás szűrés + jitter-szimuláció), különben optimistábban mér, mint a valóság.
7. **Soniox konfidencia → logprob**: a −0,7 semleges default és a min-logprob metrika heurisztika — szisztematikus kalibráció nyitott.

---

## 10. Fájl-térkép (repó: `/root/dobozos`, branch `rebuild`)

| Fájl | Tartalom |
|---|---|
| `thinkai-voice-agent/email_verify_harness.py` | a teljes harness (§5): normalizáció, Soniox/Scribe, LLM-extrakció, merge, JEV, green-kapu, korrekciók, név-út, opt-in vezérlés |
| `thinkai-voice-agent/tools.py` | `book_meeting` EMAIL_VERIFY_MODE-ága, `SESSION_BOOKING_DATA`, `stash/pop_session_bookings`, legacy `send_session_confirmations` |
| `thinkai-voice-agent/server.py` | agent worker; hívás-vég hook (~:867), `await wait_for(240)` |
| `thinkai-voice-agent/call_recorder.py` | sztereó rögzítő (16 kHz, stall-wait író), `purge_expired_recordings` |
| `thinkai-voice-agent/jev_classifier.py` | OpenRouter Decisions kliens (`_post_decisions`) — a feladó-szűrő is ezt használja |
| `thinkai-voice-agent/email_processor.py` | Brevo-küldés, `send_booking_confirmation_email`, `send_email_verification_email` (opt-in) |
| `thinkai-voice-agent/web_server.py` | `/api/public/verify-email` (:6384), `/admin/api/sessions/{id}/recording` |
| `thinkai-voice-agent/database.py` | Supabase-réteg: `get_gemini_api_key` (BYOK), `edit_client_details`, `is_valid_client_name`, `log_interaction` |
| `thinkai-voice-agent/scripts/audio_qc.py` | referencia-mentes hangminőség-mérő (numpy) |
| `thinkai-voice-agent/tests/test_email_verify_harness.py` | 101 unit-teszt |
| `HANGFELVETEL_AUDIT.md` | a hang-lánc teljes mérése (§3 forrása) |
| `HANDOFF.md` | élő munkanapló + START CSOMAG |

*Végül — mérési mérce: a rendszer célja NEM a „legtöbb green", hanem: (1) a helyes címre menjen ki a visszaigazolás, (2) rossz címre SOHA ne menjen, (3) a felülírás csak extrém bizalommal történjen. A dupla opt-in a biztonsági tartalék, nem a kudarc.*
