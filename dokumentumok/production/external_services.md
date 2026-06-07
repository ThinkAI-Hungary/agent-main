# Külső Szolgáltatások és Integrációk

> **Projekt:** ThinkAI Voice Agent  
> **Visszautalás:** [Production Áttekintés](overview.md) | [Főáttekintés](../overview.md)

---

## 1. Szolgáltatások áttekintése

```
┌─────────────────────────────────────────────────────┐
│              ThinkAI Voice Agent                     │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ server.py│  │web_server│  │ tools.py │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       │              │              │                │
└───────┼──────────────┼──────────────┼────────────────┘
        │              │              │
   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
   │LiveKit  │   │Supabase │   │ Brevo   │
   │Cloud    │   │         │   │ (Email) │
   └────┬────┘   └─────────┘   └─────────┘
        │
   ┌────▼────┐   ┌─────────┐   ┌─────────┐
   │ Telnyx  │   │ Meta    │   │Open-Meteo│
   │ (SIP)   │   │Graph API│   │(Weather) │
   └─────────┘   └─────────┘   └─────────┘
        
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │ Soniox  │   │ Gemini  │   │Cartesia │
   │ (STT)   │   │ (LLM)   │   │ (TTS)   │
   └─────────┘   └─────────┘   └─────────┘
```

---

## 2. LiveKit Cloud

**Cél:** Valós idejű WebRTC kommunikáció és SIP gateway

| Paraméter | Érték |
|---|---|
| **URL** | `wss://thinkai-ugyfelszolgalat-f05w09v7.livekit.cloud` |
| **Régió** | Germany 2 |
| **Protokoll** | WebSocket (WSS) |
| **Env vars** | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |

**Használat:**
- Agent worker WSS-en kapcsolódik a LiveKit Cloud-hoz
- Room-ok automatikusan jönnek létre (SIP híváshoz: `call-{id}`, widgethez: `thinkai-{uuid}`)
- Agent dispatch: `dobozos-ai` név alatt regisztrálva
- SIP trunk kezelés (inbound + outbound)

**Kritikusság:** 🔴 Nélkülözhetetlen — nélküle sem a widget, sem a telefon nem működik

---

## 3. Google Gemini

**Cél:** LLM (Large Language Model) — beszédértés és válaszgenerálás

| Paraméter | Érték |
|---|---|
| **Modell** | `gemini-2.5-flash` |
| **API** | Gemini Multimodal Live API |
| **Csomag** | `google-genai==1.66.0` |
| **Env var** | `GOOGLE_API_KEY` |

**Használat:**
- Agent LLM-ként (server.py — `AgentSession`)
- AI üzenet triázs (web_server.py — `analyze_alert_tags()`)
- AI tartalomgenerálás (marketing modul)
- Email AI feldolgozás (email_processor.py)

**Kritikusság:** 🔴 Nélkülözhetetlen — ez az AI "agya"

---

## 4. Soniox

**Cél:** STT (Speech-to-Text) — beszédfelismerés

| Paraméter | Érték |
|---|---|
| **Modell** | `stt-rt-v4` |
| **Nyelv** | `hu` (magyar) |
| **Típus** | Valós idejű streaming |
| **Csomag** | `livekit-plugins-soniox==1.4.4` |
| **Env var** | `SONIOX_API_KEY` |

**Kritikusság:** 🔴 Nélkülözhetetlen — nélküle az agent nem érti a beszédet

---

## 5. Cartesia

**Cél:** TTS (Text-to-Speech) — szöveg felolvasás

| Paraméter | Érték |
|---|---|
| **Modell** | `sonic-3` |
| **Nyelv** | Magyar |
| **Sebesség** | 1.0x (konfigurálható) |
| **Csomag** | `livekit-plugins-cartesia==1.4.4` |
| **Env var** | `CARTESIA_API_KEY` |

**Fontos megkötések:**
- `word_timestamps=False` — magyar nyelvhez NEM támogatott
- `speed` kötelezően **float** típus, nem string
- `sonic-3` modell használandó (sonic-2 deprecated)

**Kritikusság:** 🔴 Nélkülözhetetlen — nélküle az agent nem tud beszélni

---

## 6. Silero VAD

**Cél:** Voice Activity Detection — beszéd detektálás

| Paraméter | Érték |
|---|---|
| **Küszöb** | 0.85 |
| **Min. beszéd idő** | 0.4s |
| **Min. csend idő** | 0.5s |
| **Csomag** | `livekit-plugins-silero==1.4.4` |

**Használat:** Lokálisan fut (nincs külső API hívás), az ONNX runtime-on keresztül.

**Kritikusság:** 🟢 Lokális — nincs külső függőség

---

## 7. Telnyx

**Cél:** PSTN telefónia (SIP)

| Paraméter | Érték |
|---|---|
| **Telefonszám** | +3612114217 |
| **Inbound trunk** | `ST_ef3HCCiTmxfv` |
| **Outbound trunk** | `ST_8r89G8rStSNp` |
| **Codec** | G.722 (wideband) |
| **Transport** | TCP |
| **Krisp** | Engedélyezve (inbound) |
| **SRTP** | Allow |
| **Env var** | `SIP_OUTBOUND_TRUNK_ID` (opcionális) |

**Integráció:**
- Direct SIP integráció LiveKit Cloud-dal (nincs Asterisk bridge!)
- Inbound: Telnyx → LiveKit → Agent (automatikus room + dispatch)
- Outbound: Agent → LiveKit SIP Participant → Telnyx → PSTN

**Kritikusság:** 🟡 Telefon funkcióhoz szükséges

---

## 8. Supabase

**Cél:** Adatbázis (PostgreSQL) — minden üzleti adat tárolása

| Paraméter | Érték |
|---|---|
| **Típus** | Cloud PostgreSQL |
| **Csomag** | `supabase` (Python SDK) |
| **Env vars** | `SUPABASE_URL`, `SUPABASE_KEY` |

**Táblák:** → Részletek: [Adatmodell](../architecture/data_model.md)

Fő táblacsoportok:
- Alaprendszer: `admin_users`, `sessions`, `interactions`, `clients`
- Naptár: `calendar_events`
- Email: `email_logs`
- Feladatok: `tasks`
- CRM: `kanban_columns`, `client_fields`
- Marketing: `campaigns`, `email_campaigns`, `email_subscribers`, `content_items`
- Automatizmusok: `outbound_automations`, `automation_sent_log`, `reminder_settings`
- Egészségügy: `doctors`, `services`, `clinics`

**Kritikusság:** 🔴 Nélkülözhetetlen — minden modul ezt használja

---

## 9. Brevo (korábban Sendinblue)

**Cél:** Email küldés és email marketing

| Paraméter | Érték |
|---|---|
| **API** | Brevo REST API v3 |
| **Base URL** | `https://api.brevo.com/v3` |
| **Env var** | `BREVO_API_KEY` |
| **Sender** | `hello@thinkai.hu` (EAISY Marketing) |

**Használt API végpontok:**
- `POST /contacts` — Kontakt szinkronizálás
- `POST /contacts/import` — Tömeges kontakt import
- `GET/POST /contacts/lists` — Lista kezelés
- `POST /emailCampaigns` — Kampány létrehozás
- `POST /emailCampaigns/{id}/sendNow` — Azonnali küldés
- `PUT /emailCampaigns/{id}` — Kampány ütemezés
- `GET /emailCampaigns/{id}` — Kampány statisztikák

**Funkciók:**
- Tranzakciós email (időpont-visszaigazolás, emlékeztető)
- Marketing kampányok (hírlevél, promóció)
- A/B tesztelés (tárgysor)
- Kontakt lista szinkronizálás

**Kritikusság:** 🟡 Email funkcióhoz szükséges

---

## 10. Meta Graph API

**Cél:** Facebook + Instagram + Messenger integráció

### 10.1 Messenger & Instagram DM (Bejövő)

| Paraméter | Érték |
|---|---|
| **Webhook** | `POST /api/webhook/meta` |
| **Verification** | `GET /api/webhook/meta` (hub.challenge) |
| **Env vars** | `META_PAGE_ACCESS_TOKEN`, `META_VERIFY_TOKEN` |
| **API verzió** | v25.0 (webhook), v19.0 (publishing) |

### 10.2 Instagram Content Publishing (Kimenő)

| Paraméter | Érték |
|---|---|
| **Account** | `we_are_thinkai` (ID: 26530155976686869) |
| **Env var** | `META_INSTAGRAM_TOKEN` |
| **Lépések** | 1) Container → 2) Publish |

### 10.3 Facebook Page Publishing (Kimenő)

| Paraméter | Érték |
|---|---|
| **Page** | Think AI (ID: 260528583811764) |
| **Env var** | `META_FB_POST_TOKEN` |
| **Típusok** | Szöveges (`/feed`) és képes (`/photos`) posztok |

**Kritikusság:** 🟡 Social és messaging funkcióhoz szükséges

---

## 11. Open-Meteo

**Cél:** Időjárás lekérdezés (ingyenes, API kulcs nélkül)

| Paraméter | Érték |
|---|---|
| **API** | `https://api.open-meteo.com/v1/forecast` |
| **Lefedettség** | 15 magyar város (Budapest, Debrecen, Szeged, stb.) |
| **Auth** | Nincs (nyílt API) |

**Kritikusság:** 🟢 Kiegészítő funkció

---

## 12. Összefoglaló táblázat

| Szolgáltatás | Típus | Auth | Kritikusság | Havi költség |
|---|---|---|---|---|
| LiveKit Cloud | WebRTC/SIP | API Key + Secret | 🔴 | Forgalomfüggő |
| Google Gemini | LLM | API Key | 🔴 | Forgalomfüggő |
| Soniox | STT | API Key | 🔴 | Forgalomfüggő |
| Cartesia | TTS | API Key | 🔴 | Forgalomfüggő |
| Supabase | Database | URL + Anon Key | 🔴 | Ingyenes/$25+ |
| Telnyx | SIP/PSTN | SIP Trunk | 🟡 | Forgalomfüggő |
| Brevo | Email | API Key | 🟡 | Ingyenes/$25+ |
| Meta Graph API | Social/MSG | Access Token | 🟡 | Ingyenes |
| Open-Meteo | Weather | Nincs | 🟢 | Ingyenes |
| Silero VAD | Audio | Lokális | 🟢 | Ingyenes |

---

## Kereszthivatkozások

| Téma | Dokumentum |
|---|---|
| Környezeti változók | [Environment Variables](environment_variables.md) |
| Integrációk technikai részletei | [Integrációk](../architecture/integrations.md) |
| API végpontok | [API Referencia](../architecture/api_reference.md) |
