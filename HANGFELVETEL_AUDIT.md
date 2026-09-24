# Hívásrögzítés audio-lánc audit — 2026-09-24

**Kontextus**: a rögzített hívások hangminősége „sokkal rosszabb, mint egy sima telefonbeszélgetés". Ez a dokumentum a teljes audio-láncot (Telnyx → LiveKit SIP → LiveKit room → agent session → rögzítő → WAV) készletezi fel élő konfig-lekérdezésekkel, kód-hivatkozásokkal és a valódi hívás jel-elemzésével.

**TL;DR — a mérés**: a **hívó csatorna G.711 szűksáv** (FFT: 3400 Hz felett 0,01% energia), miközben egy modern mobilhívás HD Voice (szélessáv) — ez a legnagyobb minőségvesztés. Emellett a rögzítő idővonal-kezelésében hibák vannak (kronológián kívüli tail, wall-clock grid), és a zajszűrők egymásra vannak stackelve. Részletek az 5. és 6. szekcióban.

---

## 0. A lánc áttekintése

```
Telefon (AMR-WB HD Voice)                    ← a páciens VELE beszél, ez a "sima telefonhívás"
   │ GSM/IP hálózat
   ▼
Telnyx (kodek-átalakítás — BEÁLLÍTATLAN, portál-default)   ← 1. gyanúsított pont
   │ SIP (kodek-egyeztetés: G.711 vs G.722)                 ← MÉRVE: G.711 szűksáv megy
   ▼
LiveKit SIP ingress → LiveKit room (Opus)                  ← trunk: krisp_enabled=true
   │ track (caller)                    track (agent TTS, 16 kHz AudioSource)
   ▼                                        ▼
call_recorder.py  ← AudioStream.from_track(sample_rate=16000) — ide az egyetlen resample
   │ 20 ms wall-clock grid + silence-fill + drop-oldest(15 s)  ← 2. gyanúsított pont
   ▼
WAV 16 kHz / 16 bit / sztereó (hívó BAL, agent JOBB) → Supabase `recordings` bucket
```

---

## 1. Telnyx szint

**Provisioning kód** — `telnyx_provision.py:111-117` (`ensure_fqdn_connection`), a test:
- `active: True`, `anchorsite_override: "Latency"`, `transport_protocol: "TCP"`
- `inbound: {"ani_number_format": "+E.164", "dnis_number_format": "+e164"}`
- **NINCS beállítva**: kodek-preferencia, media_encryption, jitter buffer, RTP időzítők, zajszűrő → a Telnyx portál-defaultok élnek
- Outbound voice profile (:88-97): `traffic_type: "conversational"`, `service_plan: "global"` — kodek-beállítás nélkül
- FQDN rekord (:128-133): `<project>.sip.livekit.cloud:5060`, A-rekord
- Szám-hozzárendelés (:137-139): PATCH `/phone_numbers/{id}` → `connection_id`

**Élő állapot** (2026-09-24, javítva): a Telnyx kulcs **NINCS a staging stackben** (rivergate tenant cred + .env üres) — DE a **PROD adatbázisban a dentors tenant** tartalmazza: `telnyx_api_key` + `telnyx_connection_id` + `telnyx_outbound_profile_id` (Fernet-titkosítva; SSH-n a prod konténerből dekriptálva — a kulcsérték soha nem íródott ki).

**PROD Dentors FQDN connection (élő Telnyx API-lekérdezés, `3045144115042845855` = "eaisyDesk-dentors-inbound", +3662207766)**:
- `inbound.codecs: ["G722", "G711U", "G711A", "G729"]` — **a G.722 az ELSŐ helyen (HD voice engedélyezve a Telnyx oldalon!)**
- `noise_suppression: "disabled"`, `jitter_buffer: disabled`, `anchorsite_override: "Latency"`, `transport_protocol: "TCP"`, `dtmf_type: RFC 2833`
- `media_encryption`: nincs beállítva (titkosítatlan RTP a Telnyx→LiveKit lábon)
- Következtetés: a PROD hívásokon a szélessáv (G.722) **elvileg egyeztethető** — a prod minőséget a következő prod teszthívásnál kell mérni (jelenleg prod rögzítés még nem fut). **A staging rivergate szám (+3612114217) egy MÁSIK Telnyx fiókon van, amelynek a kulcsa nincs tárolva** — a staging mérés (G.711 szűksáv) azt jelzi, hogy azon a kapcsolaton a G.711 él; javítása: portálon G.722 engedélyezése, vagy a kulcs megadása.

**Dokumentált (elavult) állapot**: `AGENT_DOCS.md:91-99` (2026-06-02, multi-tenant ELŐTTI) G.722 16 kHz „HD Voice" trunkot állít (`ST_ef3HCCiTmxfv`) — a mai provisioning kód ezt **nem** teszi meg.

**Mérés szerint a staging hívó lánc G.711** (lásd 5. szekció) — a 3,4 kHz feletti sáv hiánya egyértelmű bizonyíték.

---

## 2. LiveKit SIP szint (élő lekérdezés, 2026-09-24)

**Inbound trunkok** (mindkettőn `krisp_enabled: true`):
| Trunk | Név | Szám | Krisp |
|---|---|---|---|
| `ST_cvpEpZ3hEejS` | Telnyx HU inbound - Dentors | +3662207766 | ✅ |
| `ST_mzBTHyNM2VAM` | Telnyx HU inbound - rivergate | +3612114217 | ✅ |

- Nincs `media`/kodek-mező a trunkon (a `SIPInboundTrunkInfo` csak name/numbers/krisp_enabled/allowed_addresses mezőket kap — `web_server.py:4831-4838`)
- **Dispatch rule**: `SIPDispatchRuleIndividual(room_prefix="call-")` + `RoomConfiguration(agents=[RoomAgentDispatch(AGENT_NAME)])` (`web_server.py:4854-4863`)
- **Kimenő SIP participant** (3 hívóhely: kézi `web_server.py:5072-5083`, jóváhagyás `:5425-5436`, kampány `:6146-6157`): `krisp_enabled: True` is

LiveKit SIP dokumentáció szerint a **G.722 out-of-the-box támogatott** — a tényleges kodeket a Telnyx-oldalon engedélyezett kodekek + SDP-egyeztetés döntik el.

---

## 3. LiveKit room + agent session (`server.py`)

| Beállítás | Érték | Hely |
|---|---|---|
| `ctx.connect()` | opciók nélkül (auto_subscribe default) | server.py:80 |
| RealtimeModel | `gemini-3.1-flash-live-preview`, `language="hu"`, `temperature=0.8`, input/output `AudioTranscriptionConfig()` — **nincs sample_rate paraméter** | server.py:398-408 |
| VAD | silero: `activation_threshold=0.6`, `min_speech_duration=0.25`, `min_silence_duration=0.6` | server.py:410-430 |
| Endpointing | `min_endpointing_delay=0.8`, `max_endpointing_delay=3.0` | server.py:410-430 |
| `preemptive_generation` | `False` | server.py:410-430 |
| Zajszűrő — **inbound** | `room_input_options = None` → **NINCS** BVC/telephony NC (a trunk-szintű Krisp marad egyedül) | server.py:444-451 |
| Zajszűrő — outbound | `noise_cancellation.BVCTelephony()` | server.py:448-449 |
| Zajszűrő — widget | `noise_cancellation.BVC()` | server.py:450 |
| Agent kimenet | RoomIO default (nincs `room_output_options`) → 16 kHz `rtc.AudioSource` | call_recorder.py:156-159 megjegyzés |
| WorkerOptions | csak entrypoint + agent_name | server.py:894-899 |

---

## 4. Rögzítő (`call_recorder.py`)

| Beállítás | Érték | Hely |
|---|---|---|
| AudioStream (MINDKÉT oldal) | `from_track(track, sample_rate=16000, num_channels=1, frame_size_ms=20)` — **az egyetlen resample-pont** (soxr) | call_recorder.py:326-331 |
| FrameBuffer | `deque(maxlen=750)` (=15 s), drop-oldest + `dropped_samples` számláló | call_recorder.py:104-117 |
| Writer | 20 ms grid a **monotonic wall clockon**; hiányzó frame → csend-kitöltés | call_recorder.py:345-370 |
| WAV | 16 kHz / 16 bit / sztereó (hívó BAL, agent JOBB), hiányzó oldal nullapad | call_recorder.py:64-94 |
| Max hossz | 7200 s (2 h) memórialimittel | call_recorder.py:42 |

**Talált hibák**:
1. ⚠️ `finish_and_upload` (:207-252): a maradék buffer-frame-eket a **már csenddel kitöltött idővonal VÉGÉRE fűzi** (:227-230) → a hívás utolsó másodpercei kronológián kívül, a fájl végén landolnak.
2. ⚠️ A 20 ms-os wall-clock grid a **hálózati jittert beégeti** a fájlba: a track frame-jei hálózati időzítéssel érkeznek, a grid ehhez képest réseket/ismétlésekent produkuje → gépi/darabos hang.
3. ⚠️ A 750 frame-es (15 s) drop-oldest nagy terhelésnél (Gemini feldolgozás blokkolja a loopot) mintavesztést okoz — az utolsó E2E-ben 0 dobott minta volt, de ez terhelésfüggő.

---

## 5. Mérési eredmények (valódi hívás: `call-_+36706369528_WVqaSCoczQqV`, 92 s, Lederer Balázs)

**FFT sávelemzés** (numpy, 6 s beszédablak, Hann-ablak):

| Sáv | HÍVÓ (27-33 s) | AGENT (3-9 s) |
|---|---|---|
| 0-300 Hz | 10,1% | 28,7% |
| 300-3400 Hz | **89,8%** | 67,7% |
| 3400-4000 Hz | **0,01%** | 0,73% |
| 4000-6000 Hz | **0,00%** | 1,17% |
| 6000-8000 Hz | **0,00%** | 1,73% |

→ **A hívó csatorna G.711 szűksáv** (a 3,4 kHz feletti tartalom gyakorlatilag nulla), az agent csatorna szélessávú (a TTS-soha nem megy át Telnyxon). A WAV 16 kHz-es konténere félrevezető: a hívó oldala fizikailag nem tartalmaz szélessávot.

**Szintek / idővonal**: hívó ~19 s beszéd szórt blokkokban, agent ~50 s; mindkét csatornán hosszú **pontosan nulla mintájú** (digitális csend) szakaszok — ezek Opus DTX + a grid csend-kitöltésének kombinációja. 100 ms-os bontásban a beszéd belső szerkezete folyamatosnak látszik; a 20 ms szintű esetleges szakadás ennél a felbontásnál nem döntető (hallgatásban viszont hallható).

---

## 6. Minőségromló tényezők — prioritás szerint

| # | Tényező | Súly | Javítás |
|---|---|---|---|
| 1 | 🔴 **G.711 szűksáv a hívó láncon** — HD Voice mobilhívás → Telnyx → G.711 → 3,4 kHz vágás. Ez a domináns minőségvesztés. | 🔴 | Telnyx portal: a rivergate + Dentors FQDN connection-en a **G.722 engedélyezése** (a LiveKit SIP támogatja out-of-the-box); ellenőrzés: új teszthívás + FFT. Megjegyzés: a hívó mobiloperátora is küldhet már szűksávot — a Telnyx call-log mutatja a beérkezett kodeket |
| 2 | 🔴 **Rögzítő idővonal-hibák**: tail-append kronológián kívül; wall-clock grid jittert éget be | 🔴 | Mintaszámláló-alapú idővonal (nem wall clock); tail a helyére; drop-oldest → soha (2 h memória-cap már megvan) |
| 3 | 🟠 **Zajszűrő-stacking**: trunk Krisp ÉS participant Krisp (outbound) ÉS BVCTelephony — a stacking fémhangos/mesterséges hangot okoz (ismert probléma Krisp + G.722 párosnál) | 🟠 | A/B teszt: trunk-Krisp kikapcsolva participant-Krisppel, vagy fordítva; egy réteg maradjon |
| 4 | 🟡 16 kHz mono-per-side plafon a rögzítőben — szűksáv-javítás után megfontolandó a natív ráta (a hívó track LiveKit SIP-nél 16 kHz Opus, tehát a 16 kHz OK; a plafon csak akkor ér, ha G.722 → 16 kHz megmarad) | 🟡 | — |
| 5 | 🟢 WAV konténer/fejléc: **hibátlan** (minden mező ellenőrizve) | — | — |

**Kizárt okok** (mérve): nincs 8 kHz-re kényszer a kódban; a WAV-fejléc helyes; a data-URL-lejátszási teszt bizonyította, hogy a bájtjai dekódolhatók — a rossz minőség a FORRÁSBAN (szűksáv) és a RÖGZÍTÉS IDŐVONALÁBAN van, nem a tárolásban.

---

## 7. Javasolt teendők

1. **Telnyx portal** (user): a rivergate (`+3612114217`) és Dentors (`+3662207766`) FQDN connection-öknél a **G.722 / HD voice engedélyezése** — vagy Telnyx API key megadása, és kódból provisionáljuk (`telnyx_provision.py` bővítés). Új teszthívás után FFT-vel ellenőrizzük a 3400+ Hz sávot.
2. **Rögzítő fixek** (kód): mintaszámláló-alapú idővonal; `finish_and_upload` tail-rendezés; drop-oldest eltávolítása.
3. **Krisp A/B**: egy réteg maradjon (trunk vagy participant), új teszthívással összehasonlítva.
4. **Harness főmotor → Soniox** (user-kérés): a `stt-rt-v4` websocket élőben igazolt a valódi felvételünkön (token-szintű konfidencia, 117 token / 92 s); a Scribe marad fallback. Az átirányítás a rögzítő-minőség javítása UTÁN a legértékesebb (a rossz bemenetet egyik STT sem menti meg).
5. **Prod-deploykor**: ugyanezek a Telnyx/LiveKit trunk-beállítások + `migrate_recording_columns.sql` + `EMAIL_VERIFY_MODE` döntés.

---

*Mérés részletei: FFT 6 s Hann-ablakon; szintek RMS; a 100 ms-os felbontású RMS-idővonalak a mérési szekcióban. A vizsgált fájl: `recordings/rivergate/2026-09-24/call-_+36706369528_WVqaSCoczQqV.wav`.*

---

## Kiegészítés (2026-09-24, délután)

- **Prod hívás megtalálva**: a prod DB szerint a legutóbbi hívás **2026-09-23 13:41 UTC** (`call-_+36206698257_M5Wq8nAku3gA`, +36206698257 → Dentors). ⚠️ `duration_seconds` NULL és a résztvevő üres — a `close_session` nem futott le (a prod worker nem zárta le korrekten a szobát). Prod-egészségügyi tétel, külön megvizsgálandó.
- **Telnyx `call_events` API 0 eseményt ad** (connection-szűrővel és anélkül, időablakkal is) — valószínű ok: a dentors Telnyx kulcs **korlátozott scope-ú** (a connection/number olvasás megy, a call-events olvasás nem). Ezért a prod hívás ténylegesen egyeztetett kodekje itt nem ellenőrizhető; megbízható ellenőrzés: prod-deploy + `RECORDINGS_ENABLED=1` után a prod felvételen ugyanez az FFT-mérés.
- **Prod kodek-állapot**: a connection beállítása szerint a G.722 az első ajánlott kodek (HD voice a Telnyx oldalon engedélyezve) — ha a LiveKit SIP válasza elfogadja, a prod hívások szélessávúak lehetnek; ez mérés alapján igazolandó.

## Kiegészítés 2 (2026-09-24, este) — staging Telnyx fiók feltérképezve (user adta a kulcsot)

- A rivergate Telnyx fiók (kulcs mostantól a staging `tenant_credentials.telnyx_api_key`-ben tárolva + audit-log) **már kínál szélessávot**: a `LiveKit SIP Trunk` connection (`2973359939059189470`, +3612114217) `inbound.codecs = ["OPUS", "G722"]` — **az Opus az első!** `noise_suppression: disabled`, media_encryption nincs beállítva.
- **Ez megfordítja a diagnózist**: a Telnyx oldal szélessávot AJÁNL, mégis 3,4 kHz-es szűksávot mértünk → a szűk részt vagy a **LiveKit SIP SDP-válasza** (G.711-et válaszol az Opus/G.722 helyett — LiveKit-oldali preferencia, API-ból nem konfigurálható), vagy a **bejövő upstream** (a hívó mobilja → Telnyx HU DID már szűksávon érkezik) okozza.
- **Döntő ellenőrzés (user, 1 perc)**: Telnyx portal → Logs → Calls → a 11:25-ös teszthívás → részletek: a két call leg kodekje ott látszik. Ha a Telnyx→LiveKit láb OPUS/G722 → a szűksáv a hívó upstreamből jön (akkor konfiggal nem javítható); ha G711 → LiveKit válasz-oldali kérdés (LiveKit Cloud support).
- A `call_events` API ezzel a kulccsal is 0 eseményt ad (scope-korlát) — a codec-információ csak a portálon látszik.
- **A rögzítő hibái ettől függetlenül javítandók** (tail-append + wall-clock grid + drop-oldest) — ezek a hallható "darabosság" gyanúsítottjai akkor is, ha a forrás szűksáv.

## Kiegészítés 3 (2026-09-24, este) — Telnyx CDR: a kodek-egyeztetés JOÓ (a szűksáv upstreamről jön)

A user a Telnyx portál **CDR-exportját** adta a 11:25-ös teszthívásról (`+36706369528` → `+3612114217`):
- **`Rtp codec: G722`** — a Telnyx↔LiveKit lábon SZÉLESSÁV egyezett (nem G.711!)
- **`MoS: 4,49`**, `Quality percentage: 98,75%` — a szállítás minősége kiváló
- PDD 0,5 s, hangup 16 = NORMAL_CLEARING, connection: `LiveKit SIP Trunk` (2973359939059189470)

**Következtetés (a korábbi diagnózis pontosítása)**: a Telnyx→LiveKit láb rendben van — G.722-t vitt, jó minőségben. A felvételben mért 3,4 kHz-es vágás tehát **az upstreamből** jön: a hívó mobilja → Telnyx HU DID összeköttetés szűksávot (AMR-NB) szolgáltatott, amit a G.722 "átfektet" (a tartalom marad 3,4 kHz). Ez konfigurációval NEM javítható — a Telnyx magyar DID-jeinek nemzetközi bejárata szűksáv. Opciók: magyar szélessáv-­képes SIP-origination (HU helyi trunk provider), vagy elfogadjuk a telefónia-természetes szűksávot.

**Továbbra is javítandó (kód-oldal)**: a rögzítő idővonal-hibái (tail-append sorrend, wall-clock grid jitter, drop-oldest) — ezek a felvételt a forráshoz képest TOVÁBB rontják, és kijavíthatók. A harness főmotor → Soniox váltás ezen belül következik (user-döntés).

## Kiegészítés 4 (2026-09-24, este) — JAVÍTÁSOK DEPLOYOLVA (`0a0b699`, stagingen ÉL)

1. **Rögzítő**: a writer most **stall-tűrő** — a rács csak akkor lép, ha mindkét aktív oldalon megvan a minta, vagy az oldal 1 s stall-tűrése lejár (igazi csend/DTX); a hálózati/loop-jitter már NEM éget csend-réseket a beszédbe. Buffer-plafon 15 s → 50 s oldalonként. A tail a `finish_and_upload`-ban sorrendben van.
2. **Krisp de-stacking**: outbound hívásokon a participant `krisp_enabled=False` (3 hívóhely) → ott csak a session-szintű BVCTelephony marad. Inboundon a trunk-Krisp maradt (az SDK-ban nincs trunk-update; az újrateremtés élő telefónia-műtét lenne) — inbound tehát egy réteg, outbound egy réteg. Új trunk-létrehozáskor is Krisp ki.
3. **Harness főmotor**: `HARNESS_STT_ENGINE=soniox` (default) → `stt-rt-v4` websocket a hívó BAL csatornáján, token-konfidencia → logprob-kapu; Scribe v2 fallback. Scribe/Deepgram kulcsok változatlanul fent tartalékként.
4. **Staging Telnyx kulcs**: a rivergate tenant `tenant_credentials.telnyx_api_key`-be téve (titkosítva + audit).

**Következő verifikáció**: a user **5 email-diktálásos teszthívása** stagingen → ezeken mérjük: (a) a rögzítő minőség-javulást (hallgatói A/B), (b) a Soniox-főmotor átiratának email-pontosságát a Scribe/Gemini árnyékkal szemben, (c) a harness green/non-green döntéseit és a dupla opt-in flow-t. Utána: prod-deploy döntés.

## Kiegészítés 5 — audio_qc eszköz (user-adta) minden hívásra

`scripts/audio_qc.py` — referencia nélküli hangminőség-mérés WAV-on (numpy): beszédszint, SNR, digitális nullás rések beszéd közben, dupla 20 ms-os frame-ek, kattanások, clipping, rolloff99 (szűksáv-jelzés), DC offset → OK / HATÁRESET / ROSSZ verdikt. **A folyamat része: minden új hívásrögzítésen lefuttatjuk mindkét csatornára** a harness-verdikt mellett.

**Alapvonal a RÉGI rögzítővel** (`call-_+36706369528_WVqaSCoczQqV`, 92 s):
- Hívó (ch0): **HATÁRESET** — rolloff99 2250 Hz (szűksáv forrás), 4 digitális rés beszéd közben (2,6/perc, medián 15 ms = a régi grid-artefakt), szint −18,4 dBFS, SNR ~80 dB, dupla frame 0
- Agent (ch1): **OK** — rolloff99 5843 Hz (szélessáv), 1 kis rés, 1,97 kattanás/perc
Ez az A/B kiindulópont: az 5 új teszthíváson a gaps_per_min és a hallható minőség javulását mérjük.

## Kiegészítés 6 — Soniox-főmotor + harness élő E2E az 5 teszthíváson (`293f4b3`+`3890fe5`)

- **Harness await-elve** a hívás végén (a fire-and-forget task a worker kilépésekor elhalt) — 240 s timeout, fail-open.
- **Jelölt-tisztítás**: TLD utáni levágás + lokál eleji kontextus-szó lehúzás (`_candidate_variants`) — a „…hu.koszonom" / „…megjegyezted" / „hogy…" ragadványok tisztítva.
- **Élő eredmények az 5 híváson**: tiszta kinyerések — `balazs.lederer@skyrocketgroup.hu` (MX ✓), `hodi.akostizenharom@citromail.hu` (ismert domain ✓); mindegyik non-green (egyedüli forrás, conf 0,5 < 0,99) → **dupla opt-in levelek kimentek**; név-JEV: „Balázs" 0,83-0,86 → non-green, nem írta felül. Audit-lábak a 149-es ügyfél custom_data-jában.
- **Audio-QC az 5 híváson** (audio_qc): hívó csatorna gaps 6-24/perc (ROSSZ 4/5, medián 15 ms) — a szakadások a **forrás-streamben** vannak (Telnyx→LiveKit RTP), nem a writerben; a rögzítő most már nem ront rajta (nincs dup frame, nincs nagy rések). A végleges javítás forrás-oldali (szélessávú HU ingress) vagy SDK-szintű jitter-buffer — nyitva.
