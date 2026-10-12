# KUTATÁSI JELENTÉS — Gemini 3.8 Live: érdemes-e váltani a telefon-ügynök hangmodelljét?
*(research subagent, 2026-10-09 — kód: fájl:sor read-only; web: hivatalos források URL-lel; nem-hivatalos források jelölve)*

**Modell-név tisztázás:** a „Gemini 3.8 Live" pontos modellneve **`gemini-3.8-live`** — „3.8-flash-live" NEM létezik; a Live vonalban nincs flash/preview-tagelés, a 3.8 Live egyből **GA (stabil)**. Létezik még `gemini-3.8-live-extended-thinking` (magasabb késleltetésű, gondolkodós variáns). Forrás: [Gemini API models docs](https://ai.google.dev/gemini-api/docs/models), [modelloldal](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live), [changelog](https://ai.google.dev/gemini-api/docs/changelog).

## A) Jelenlegi állapot + 3.1-es korlátok (kód: fájl:sor)

- Modell: **`gemini-3.1-flash-live-preview`** — `server.py:462` (`realtime.RealtimeModel(...)`); log: `server.py:496`. Hang: **Puck** (whitelist `server.py:440-444`), nyelv `hu`, temperature 0.8, kétirányú audio-transzkripció bekapcsolva (`461-471`).
- Keret: **livekit-agents==1.5.16 + livekit-plugins-google==1.5.16** (`requirements.txt:57,64`); LiveKit Cloud.
- BYOK: tenant-saját Gemini kulcs (`server.py:447-458`). Text-LLM független: `gemini-3.8-flash` (`email_verify_harness.py:469`). Frontend: csak BYOK kulcs-bevitel — váltáskor nem érintett.
- **3.1-es korlátok workaroundként a kódban** (váltásnál elválhatnak):
  1. `generate_reply()` NEM támogatott → köszöntés prompt-injekcióval (`server.py:406-433`).
  2. Nincs mid-session utasításfrissítés → korai, várakozós hívószám-feloldás (`server.py:111-141`) + promptba égetett hívószám-szabály (`326-331`).
  3. Tool-hívás megbízhatóság → foglalás-egyeztetési harness (`booking_reconcile.py`) + 5. szabály + GDPR rögzítés-tájékoztatás.
  4. STT-pontosság → email-ellenőrző harness + VAD hangolás (0.6s/0.8s — `server.py:475-485`).
  5. `preemptive_generation=False`, `max_tool_steps=5` (`488-492`).

## B) 3.8 Live újdonságok a súlyozott kritériumok mentén

**Alapadatok:** GA **2026-09-15**; input 131 072 / output 65 536 token; function calling, Live API, search grounding, interleaved thinking. A 3.1-flash-live-preview a models-oldalon már „legacy, frissíts 3.8-ra" jelöléssel szerepel.

| Kritérium (súly) | 3.8 Live helyzet | Forrás |
|---|---|---|
| **Magyar beszéd-értés (magas)** | Live API 99 nyelv, **hu benne**, automatikus nyelvfelismerés. Dedikált STT-kísérők: **Gemini 3.5 Transcribe / 3.5 Live Translate** — ha a diktálás nem javul eleget, chained STT plán B. Konkrét magyar email-diktálási metrika NINCS publikálva. | [Live API guide](https://ai.google.dev/gemini-api/docs/live-guide), [Cloud blog GA](https://cloud.google.com/blog/products/ai-machine-learning/gemini-3-8-live-with-live-avatar-is-now-generally-available) |
| **Tool-hívás megbízhatóság (magas)** | **Aszinkron function calling a default** (`behavior: NON_BLOCKING`; 3.1-en csak szekvenciális) — a tool a beszéd közben a háttérben fut. Production-adat: Equal AI (1M+ élő hívás/nap) javuló tool-megbízhatóság. Extended Thinking a Sierra τ-Voice éllovasa — *nem-hivatalos*. | [live-guide](https://ai.google.dev/gemini-api/docs/live-guide), [Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/gemini-3-8-live-with-live-avatar-is-now-generally-available), [DataCamp](https://www.datacamp.com/blog/gemini-3-8-live) |
| **Utasításkövetés / tilalmak (magas)** | Interleaved reasoning a 3.8-live-on; extrém fegyelemhez `gemini-3.8-live-extended-thinking`. „Ne ismételd vissza"-tilalmakra NINCS publikus benchmark — staging A/B-ben mérendő. | [modelloldal](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live), [Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/gemini-3-8-live-with-live-avatar-is-now-generally-available) |
| **LiveKit-kompatibilitás (magas)** | **livekit-agents 1.8.6 a legfrissebb (2026-10-09)**. 3.8-live támogatás: 1.8.2 (új modellek) → 1.8.3 (NON_BLOCKING default) → **1.8.5 („support gemini-3.8-live and warn on api mismatches")**. A **jelenlegi 1.5.16 (2026-06-01, a 3.8 Live ELŐTTI) a modellt nem ismeri** — frissítés kötelező. Új pluginban: `gemini-3.8-live` a KNOWN_GEMINI_API_MODELS-ban; `generate_reply` implementált (a 3.1-es workaround elhagyható); `thinking_level` a 3.8-live-on ValueError. | [LiveKit releases](https://github.com/livekit/agents/releases), [plugin README](https://github.com/livekit/agents/blob/main/livekit-plugins/livekit-plugins-google/README.md), [plugin source](https://raw.githubusercontent.com/livekit/agents/main/livekit-plugins/livekit-plugins-google/livekit/plugins/google/realtime/realtime_api.py), [PyPI](https://pypi.org/pypi/livekit-plugins-google/json) |
| **Késleltetés/megszakítás (közepes)** | Alacsony késleltetésre tervezett default voice-modell; természetes megszakítás-visszanyerés kontextusvesztés nélkül; ügyfél-visszajelzés: javult VAD és késleltetés; interruption esetén a függő function-call-ok explicit cancelálódnak. LiveKit 1.7.1: adaptív interruption + tool-futás alatti state-javítások. | [modelloldal](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live), [Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/gemini-3-8-live-with-live-avatar-is-now-generally-available), [LiveKit releases](https://github.com/livekit/agents/releases) |
| **Ár (közepes)** | **3.8 Live és 3.1 flash-live-preview AZONOS ártáblázat**: audio-in $3,00/1M tok = **$0,005/perc**, audio-out $12,00/1M tok = **$0,018/perc**; text-out $4,50/1M. ~2 perces hívás ≈ **$0,046 (~18 Ft)** — **költség-delta: $0**. | [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| **Rate limit** | 3.8-live **GA** → standard tier-limit (a preview-modelleknél a docs szigorúbb limitre figyelmeztetett — ez a 3.1-re vonatkozott). Napi 10–100 hívás (1 párhuzamos session) messze a GA-limit alatt. BYOK-nál a tenant saját projekt-limitje érvényes. | [rate-limits docs](https://ai.google.dev/gemini-api/docs/rate-limits), [models docs](https://ai.google.dev/gemini-api/docs/models) |

**Hangok:** a Puck megmaradt a 30 előre gyártott hang listájában ([speech-generation](https://ai.google.dev/gemini-api/docs/speech-generation)); LiveKit-dokupéldák is `voice="Puck"`-ot használnak ([docs.livekit.io/agents/integrations/google](https://docs.livekit.io/agents/integrations/google/)) → a `VALID_VOICES` whitelist érvényes marad.

**Migrációs törékeny pontok (hivatalos modelloldal):** `thinking_config`/`thinking_level` TÁMOGATATLAN a 3.8-live-on (nálunk nincs — nem érint); **affective dialog ELTÁVOLÍTVA** (`enable_affective_dialog`-t törölni — nálunk nincs); **proactive audio véglegesen BE** (`proactive_audio: false` hibát ad — nálunk nincs); video-coverage default megváltozott (nem érint).

## C) Kompatibilitás / migráció-kockázat

1. **Kötelező plugin-frissítés: 1.5.16 → ~1.8.6** (livekit-agents + livekit-plugins-google együtt; 1.5.16 = 2026-06-01, a 3.8 Live ELŐTTI — a régi plugin a modellt sem ismeri). Átléptetett breaking change-ek:
   - **1.8.0: OTel GenAI semantic conventions** — Breaking (span/metric nevek); nálunk OTel-exporterek futnak (`requirements.txt:85-92`) → dashboardok/riportok ellenőrzése.
   - 1.6.8: `console`/`dev` mód deprecated (`lk agent` CLI) — fejlesztői workflow, éles futást nem érint.
   - 1.6.4: STT-handoff javítás (1.5.14–1.6.3-ról upgrade ajánlott) — nekünk pozitív.
   - 1.7.0: trace/log attribútum-nevek változása (PII redaction) — observability.
2. **Viselkedés-váltás tool-hívásoknál:** 3.8-on a plugin defaultja **NON_BLOCKING** (1.8.3 óta) — a `book_meeting`/`find_client` eredménye nem blokkolja a beszédet; a foglalás-egyeztetési harness (`booking_reconcile.py`) és a kódoldali ügyfél-feloldás (`server.py:341-401`) invariáns a modellhez, de a klasszifikációs logikát A/B-ben újra kell mérni.
3. **Kód-módosítás igénye minimál:** alapvetően 1 string (`server.py:462`) + requirements-bump. Opcionális: a köszöntés-workaround (`server.py:406-433`) cseréje valódi `session.generate_reply()`-ra; a mid-session korlát (`111-141`) újramérése.
4. **Kockázatok:** (a) teljes keret-frissítés éles SIP-hívásokon — staging-visszateszt kötelező; (b) NON_BLOCKING tool-viselkedés megváltoztathatja a beszéd/tempó-mintázatokat; (c) a 3.1 Live legacy — hosszú távon a váltás úgyis esedékes.

## D) AJÁNLÁS: **FELTÉTELES VÁLTÁS MOST — staging A/B-vel, 1-2 hetes éles canary-vel**

- **Mellette:** GA/stabil (nem preview — a legnagyobb „várjunk" érv eltűnt); **ár azonos** (költség-kockázat nulla); tool-hívás megbízhatóság = a mi 1-es fájdalmunk, és pont ebben jött a legnagyobb architekturális javulás (aszinkron non-blocking tool-hívás + független production-visszajelzés); magyar támogatott; a 3.1 legacy → a migráció előbb-utóbb úgyis esedékes.
- **Ellene / feltétel:** a keret-frissítés (1.5.16→1.8.6) nem triviális (OTel breaking + viselkedés-váltások); a magyar STT-betűzésre konkrét javulási bizonyíték nincs (a harness marad); a tilalom-fegyelemre nincs publikus metrika.
- **Feltételek:** (1) staging A/B zöld; (2) `gemini-3.8-live-extended-thinking` csak akkor, ha a standard 3.8 A/B-ben a tool-hívás/tilalom-fegyelem gyengébb marad (késleltetés-áron); (3) késleltetés/megszakítás nem romlik a jelenlegi VAD-hangolásokkal (0.6s/0.8s változatlanul).
- **Várjunk** csak akkor, ha a staging keret-frissítés 1 héten belül nem stabilizálható — de a 3.1 legacy státusza miatt a „soha" opció nincs.

## E) Migrációs lépések + A/B tesztterv + rollback

**Migráció (staging, `digidesk-dobozos-agent`):**
1. `requirements.txt`: `livekit-agents==1.8.6`, `livekit-plugins-google==1.8.6` (többi livekit-plugin 1.4.4→1.8.x-párra; OTel-csomagok maradhatnak) → image rebuild.
2. `server.py:462`: `model="gemini-3.1-flash-live-preview"` → `model="gemini-3.8-live"` — **env-varból (`GEMINI_LIVE_MODEL`, default a régi)**: ez lesz a rollback kapcsa is.
3. `server.py:496` log-string frissítése; ellenőrizni, hogy sehol nincs `enable_affective_dialog` / `thinking_config` / `proactive_audio` (jelenleg nincs — OK).
4. Eval-címek (`EVAL_CALLER_NUMBERS`) és BYOK változatlan; a harness-ek (email_verify, booking_reconcile) BEkapcsolva maradnak a teszt alatt is.
5. Opcionális 2. fázis (csak zöld 4. lépés után): köszöntés-workaround → `session.generate_reply()`.

**A/B tesztterv (staging, éles SIP-hívások, EVAL hívószámokra):**
- 2×30 hívás azonos scriptekkel/promptokkal: A = 3.1 (kontroll), B = 3.8; váltakozó sorrend.
- Kiértékelés: (1) tool-hívás: „foglaltam-tool nélkül" arány, book_meeting tényleges DB-be írás, tool-késleltetés; (2) STT magyar: diktált email-cím pontos felismerése (harness fix-rate), betűzés közbeni félbeszakadás; (3) tilalom-fegyelem: NO-READ-BACK sérülések, 7. szabály; (4) UX: első hang-reakció ideje, megszakítás utáni koherencia; (5) infra: csatlakozási hibák, session-crash, OTel-trace-ek épsége.
- A/B után 1 hét éles canary: 10-20% forgalom 3.8-ra (modell-string env-ből), hívás-riportok napi átnézéssel.

**Rollback:** env-var (`GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview`) + konténer-újraindítás — kód-változtatás nélkül visszavált; ha a plugin-bump a hibás (nem a modell), requirements vissza 1.5.16-ra + image rebuild. A prompt-workaroundok mindkét modellen működnek — a rollback nem tör el semmit.

**Kulcs-források:** [models docs](https://ai.google.dev/gemini-api/docs/models) · [gemini-3.8-live modelloldal](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live) · [changelog](https://ai.google.dev/gemini-api/docs/changelog) · [pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Live API guide](https://ai.google.dev/gemini-api/docs/live-guide) · [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [Cloud blog GA](https://cloud.google.com/blog/products/ai-machine-learning/gemini-3-8-live-with-live-avatar-is-now-generally-available) · [LiveKit releases](https://github.com/livekit/agents/releases) · [LiveKit Google-integráció](https://docs.livekit.io/agents/integrations/google/) · [plugin README](https://github.com/livekit/agents/blob/main/livekit-plugins/livekit-plugins-google/README.md) · Nem-hivatalos (megerősítésre szorul): [DataCamp τ-Voice](https://www.datacamp.com/blog/gemini-3-8-live), [MarkTechPost](https://www.marktechpost.com/2026/09/15/)
