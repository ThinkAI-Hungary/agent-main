# RESEARCH BRIEF — Gemini 3.8 Live: érdemes-e váltani a telefon-ügynök hangmodelljét?

**A feladat:** kettős. (1) WEB-KUTATÁS: mit tud a Gemini 3.8 Live (a 3.1 Live-hoz képest) —
javítások, új képességek, ár, elérhetőség. (2) AJÁNLÁS: érdemes-e váltani a mi telefonos
AI-ügynökünkön, és ha igen, hogyan (migrációs lépések + tesztterv + rollback).

## 0. Mi fut most (kiinduló állapot — ellenőrizd a kódban)

- Modell: **`gemini-3.1-flash-live-preview`** — `server.py:462`, `realtime.RealtimeModel(...)`
  (livekit-plugins-google). Hang: **Puck**. Nyelv: magyar (minden hívás).
- Keret: **livekit-agents 1.5.16** + livekit-plugins-google (requirements.txt — pontos
  verziót ellenőrizd), LiveKit Cloud (wss://thinkai-ugyfelszolgalat-…livekit.cloud).
- Ismert 3.1-es korlátok, amik a KÓDBAN workarounds-ként élnek (ezek a váltásnál
  elválhatnak!):
  - `generate_reply()` NEM támogatott 3.1-en (`server.py:407` környék) — a köszöntés
    prompt-injekcióval megy.
  - Nincs mid-session utasításfrissítés (`server.py:113` környék — „gemini-3.1 nem
    enged mid-session…") — a hívás közbeni instrukció-váltás ötleteinket ez korlátozta.
- BYOK: tenant-saját Gemini kulcs támogatott (`tenant_credentials.gemini_api_key` →
  `GEMINI_API_KEY` env fallback, `server.py:447-457`).
- A text-LLM már **gemini-3.8-flash** (`EMAIL_VERIFY_LLM_MODEL`, `email_verify_harness.py:469`)
  — a hangmodell váltása ettől független döntés.
- Ismert MINŐSÉGI problémák a 3.1 Live-tal (a váltás fő motivációi — súlyozd őket!):
  1. **Tool-hívás megbízhatóság**: az agent szóban „lefoglaltam"-ot mondott a
     book_meeting meghívása NÉLKÜL (2026-10-08, HANDOFF: 5. szabály + foglalás-egyeztetési
     harness épült rá).
  2. **Utasításkövetés**: NO-READ-BACK tiltás ellenére visszamondta a diktált adatokat.
  3. **STT-pontosság magyarul**: diktált email-címek félrehallása („feedbacks" →
     „feedbeks") — a harness pontosan emiatt fut.

## 1. WEB-kutatási kérdések (Google DeepMind / Vertex AI / LiveKit docs + changelogok)

1. **Gemini 3.8 Live újdonságok a 3.1 Live-hoz képest**: beszéd-minőség, késleltetés,
   megszakítás-kezelés (interruptions), hangok (Puck megmarad?), érzelmesség/proactivity,
   kontextus-ablak, multimodális képességek.
2. **STT/pontosság**: van-e javulás nem-angol (konkrétan MAGYAR) beszéd
   felismerésben/diktálásban (betűzés, email-cím diktálás)?
3. **Function calling / tool használat VALÓDI hívásban**: megbízhatósági javítások
   (a mi legnagyobb fájdalmunk), párhuzamos tool-hívások, megbízhatósági metrikák.
4. **Utasításkövetés**: rendszerutasítás-fegyelem (nem-angol nyelvű utasítások,
   tilalmak betartása — pl. „ne ismételd vissza az adatokat").
5. **Elérhetőség és stabilits**: preview vagy GA? LiveKit plugin támogatás — melyik
   livekit-agents / livekit-plugins-google verzió tudja? (Nálunk 1.5.16 — elég, vagy
   frissíteni kell, és az milyen breaking change-el jár?)
6. **Ár**: per perc audio-in/audio-out árak 3.1 vs 3.8 Live (Google AI Studio /
   Vertex árazás) — egy ~2 perces átlaghívás költség-deltája.
7. **Rate limit / kapacitás**: preview-modelleknél megszorítások — elegendő-e
   napi 10-100 hívásra?

## 2. Ajánlási kritériumok (súlyozás — a végső ajánlás ezek mentén)

| kritérium | súly | miért |
|---|---|---|
| magyar beszéd-értés/pontosság | magas | a harness/ellenőrző lánc erre épül |
| tool-hívás megbízhatóság | magas | a „foglaltam-tool nélkül" incidens |
| utasításkövetés (tilalmak) | magas | NO-READ-BACK, szó szerinti visszaolvasás tiltása |
| LiveKit-kompatibilitás + migráció kockázata | magas | 1.5.16-os keret, éles hívások |
| késleltetés/megszakítás | közepes | természetes beszédélmény |
| ár | közepes | napi 10-100 hívás, 2 perc/átlag |

## 3. Szabályok

- Kód: CSAK OLVASÁS (semmi módosítás, semmi deploy, semmi git-művelet).
- WEB-források: hivatalos (DeepMind/Google Cloud docs, LiveKit docs/GitHub changelogok,
  megbízható tech-sajtó) — minden állítást FORRÁS URL-lel jelölj; a nem-hivatalos
  forrást jelöld „megerősítésre szorul"-ként.
- Kulcsok/seed-értékek soha ne kerüljenek kiírásra.
- Ha a „Gemini 3.8 Live" néven pontos modell nem azonosítható (elnevezés változhat:
  pl. 3.8-flash-live / 3.8-live-preview), azt Expliciten jelezd, és a legközelebbi
  tényleges modellverzióval dolgozz.

## 4. Végeredmény (a végső üzeneted)

Strukturált magyar jelentés:
- A) Jelenlegi állapot (kód: fájl:sor) — a 3.1-es korlátok listája.
- B) 3.8 Live újdonságok (forrás URL-ekkel) — a 2. szakasz kritériumai mentén.
- C) Kompatibilitás (LiveKit plugin, kód-módosítás igény, törékeny pontok).
- D) AJÁNLÁS: váltás most / várni / feltételes (pl. csak ha GA) — indoklással a
  súlyozott kritériumok mentén.
- E) Ha váltás: migrációs lépések + A/B tesztterv (staging éles hívásokkal,
  kiértékelési szempontok) + rollback (env/model-string visszaállítás).
