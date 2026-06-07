# Architekturális Követelmények — Áttekintés

> **Projekt:** ThinkAI Voice Agent  
> **Verzió:** 1.0  
> **Utolsó frissítés:** 2026-06-05

---

## 1. Architektúra áttekintés

A rendszer egy **Python 3.12** alapú, monolitikus alkalmazás, amely két párhuzamos folyamatból áll, és **Supabase (Cloud PostgreSQL)** adatbázist használ.

### Magas szintű architektúra

```
┌──────────────┐        ┌──────────────────────┐        ┌───────────────┐
│  Böngésző    │  WS/   │  LiveKit Cloud       │  WS    │  Agent Worker │
│  (widget)    │◄─────► │  (WebRTC relay)      │◄──────►│  (server.py)  │
│              │ WebRTC │  Germany 2 region     │        │               │
└──────┬───────┘        └─────────┬────────────┘        └───────┬───────┘
       │ HTTP                     │                             │
       ▼                          │ SIP                         │
┌──────────────┐        ┌────────┴──────────┐                  │
│  Web Server  │        │  Telnyx           │                  │
│  (web_server)│        │  +3612114217      │                  │
│  :8000       │        │  SIP ↔ LiveKit    │                  │
└──────────────┘        └───────────────────┘                  │
       │                                                        │
       ▼                                                        │
┌──────────────┐                                                │
│  Supabase    │◄───────────────────────────────────────────────┘
│  (PostgreSQL)│  (tools, sessions, interactions, clients, stb.)
└──────────────┘
       │
       ▼
┌─────────────────────────────┐
│  Külső szolgáltatások       │
│  ├─ Soniox STT (stt-rt-v4) │
│  ├─ Gemini 2.5 Flash (LLM) │
│  ├─ Cartesia TTS (sonic-3) │
│  ├─ Silero VAD             │
│  ├─ Brevo (email)          │
│  ├─ Meta Graph API         │
│  └─ Open-Meteo (weather)   │
└─────────────────────────────┘
```

---

## 2. Dokumentáció navigáció

| Dokumentum | Tartalom |
|---|---|
| [Rendszerkomponensek](system_components.md) | Agent Worker, Web Server, Tools, Prompt Engine, Email Processor |
| [Adatmodell](data_model.md) | Supabase táblák, relációk, CRUD műveletek |
| [API Referencia](api_reference.md) | REST API végpontok teljes dokumentáció |
| [Integrációk](integrations.md) | LiveKit, Telnyx SIP, Meta Webhook, Gemini protokollok |

---

## 3. Adatfolyam

### 3.1 Hangalapú interakció (telefon/widget)

```
Felhasználó beszél
    ↓
[Silero VAD] — beszéd detektálás
    ↓
[Soniox STT] — beszéd → szöveg (streaming)
    ↓
[Gemini 2.5 Flash] — szöveg feldolgozás
    ├─── Válasz szöveg
    │        ↓
    │    [Cartesia TTS] — szöveg → hang
    │        ↓
    │    Felhasználó hallja a választ
    │
    └─── Tool call (ha szükséges)
             ↓
         [tools.py] — végrehajtás
             ↓
         [database.py] → Supabase
             ↓
         Eredmény visszakerül a Gemini-hez
             ↓
         [Cartesia TTS] → Felhasználó
```

### 3.2 Szöveges interakció (Messenger/Instagram/Email)

```
Felhasználó üzenetet küld
    ↓
[Meta Webhook / IMAP] — üzenet beérkezik
    ↓
[web_server.py] — feldolgozás
    ├─── Ügyfél azonosítás (név, email, phone)
    ├─── AI címkézés (analyze_alert_tags)
    ├─── Interakció rögzítés (Supabase)
    │
    └─── AI válasz generálás (Gemini)
             ↓
         [Jóváhagyási rendszer]
         ├── Automatikus küldés (ha nem kell jóváhagyás)
         └── Draft → admin jóváhagyás → küldés
```

---

## 4. Fájlstruktúra és modulok

```
thinkai-voice-agent/
├── server.py              # LiveKit Agent Worker (STT → LLM → TTS)
├── web_server.py          # FastAPI Web Server (3760 sor!)
├── tools.py               # 9 function tool definíció
├── prompt_utils.py        # Dinamikus system prompt generátor
├── database.py            # Supabase adatréteg (1784 sor)
├── email_processor.py     # Email bejövő feldolgozás (IMAP)
├── social_media.py        # Instagram/Facebook API modul
├── brevo_campaigns.py     # Brevo email campaign API
├── system_prompt.md       # System prompt sablon
├── knowledge.json         # Tudásbázis (K/V)
├── praxisinfo.json        # Rendelő konfiguráció
├── agent_settings.json    # Runtime beállítások
├── voice-widget.html      # Webchat widget
├── supabase_schema.sql    # Alap DB séma (migrációs)
├── start.sh               # Indító script (both processes)
├── requirements.txt       # Python függőségek (150 csomag)
├── workflow.md            # Hangügynök workflow leírás
└── AGENT_DOCS.md          # Technikai dokumentáció
```

### Modulok közötti függőségek

```
server.py
    ├── tools.py
    ├── prompt_utils.py
    │       └── database.py
    │       └── praxisinfo.json
    │       └── agent_settings.json
    │       └── system_prompt.md
    └── database.py

web_server.py
    ├── database.py
    ├── email_processor.py
    ├── social_media.py
    ├── brevo_campaigns.py
    └── tools.py (indirekt)

tools.py
    └── database.py
```

---

## 5. Technológiai stack

| Réteg | Technológia | Verzió |
|---|---|---|
| **Nyelv** | Python | 3.12 |
| **Agent framework** | LiveKit Agents | 1.5.16 |
| **Web framework** | FastAPI + Uvicorn | 0.127.1 / 0.41.0 |
| **Adatbázis** | Supabase (PostgreSQL) | Cloud |
| **STT** | Soniox (livekit-plugins-soniox) | 1.4.4 |
| **LLM** | Google Gemini (google-genai) | 1.66.0 |
| **TTS** | Cartesia (livekit-plugins-cartesia) | 1.4.4 |
| **VAD** | Silero (livekit-plugins-silero) | 1.4.4 |
| **Email** | Brevo API v3 (httpx) | — |
| **Social** | Meta Graph API v19.0/v25.0 (httpx) | — |
| **Telephony** | Telnyx SIP (LiveKit SIP gateway) | — |
| **Container** | Docker (python:3.12-slim) | — |
| **Logging** | Loguru | 0.7.3 |
| **HTTP client** | httpx | 0.28.1 |

---

## 6. Architekturális döntések és trade-off-ok

### 6.1 Monolitikus architektúra

**Döntés:** Egyetlen Docker konténer, két párhuzamos folyamattal.

| Pro | Kontra |
|---|---|
| Egyszerű deploy | Nem skálázható horizontálisan |
| Egyszerű fejlesztés | Single point of failure |
| Alacsony infrastruktúra költség | web_server.py túl nagy (3760 sor) |

### 6.2 Supabase mint elsődleges adattár

**Döntés:** Cloud PostgreSQL Supabase SDK-n keresztül (nem ORM).

| Pro | Kontra |
|---|---|
| Egyszerű CRUD műveletek | Nincs típusbiztonság |
| Beépített auth (nem használt) | Nincs migráció rendszer |
| Automatikus backup | Vendor lock-in |
| Gyors fejlesztés | Query-k szétszórva a kódban |

### 6.3 Direct Supabase SDK vs. ORM

**Döntés:** Közvetlen Supabase Python SDK hívások (nincs SQLAlchemy/Tortoise).

| Pro | Kontra |
|---|---|
| Kevesebb absztrakció | Ismétlődő kód (database.py: 1784 sor) |
| Közvetlen kontroll | Nincs model validáció |
| Gyors fejlesztés | Nincs relation mapping |

### 6.4 LiveKit Direct SIP (nincs Asterisk)

**Döntés:** Telnyx SIP közvetlenül LiveKit Cloud-ba, Asterisk bridge nélkül.

| Pro | Kontra |
|---|---|
| Egyszerűbb infrastruktúra | Kevesebb kontroll a SIP felett |
| Jobb hangminőség (HD Voice) | LiveKit Cloud-ra való rászorulás |
| Kevesebb karbantartás | |

---

## Kereszthivatkozások

| Téma | Dokumentum |
|---|---|
| Üzleti funkciók | [Business Overview](../business/overview.md) |
| Üzemeltetés | [Production Overview](../production/overview.md) |
| Technikai docs | [`AGENT_DOCS.md`](../../thinkai-voice-agent/AGENT_DOCS.md) |
