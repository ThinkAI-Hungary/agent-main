# ThinkAI Voice Agent — Dokumentáció Áttekintés

> **Verzió:** 1.0  
> **Dátum:** 2026-06-05  
> **Státusz:** Production

---

## Dokumentáció térképe

Ez a dokumentációs csomag három fő területet fed le, amelyek együttesen teljes képet adnak a szoftver jelenlegi állapotáról, üzleti céljairól, és technikai megvalósításáról.

```
dokumentumok/
├── overview.md                          ← Ez a fájl (áttekintés és kereszthivatkozások)
│
├── business/                            ← Üzleti követelmények
│   ├── overview.md                      ← Üzleti áttekintés és összefoglaló
│   ├── value_proposition.md             ← Értékajánlat és célpiac
│   ├── features_and_capabilities.md     ← Funkciók és képességek
│   ├── revenue_model.md                 ← Bevételi modell és árazás
│   └── roadmap.md                       ← Fejlesztési ütemterv és tervezett funkciók
│
├── production/                          ← Üzemeltetési követelmények
│   ├── overview.md                      ← Üzemeltetési áttekintés
│   ├── deployment.md                    ← Telepítés és deployment
│   ├── environment_variables.md         ← Környezeti változók és konfigurációk
│   ├── monitoring_and_operations.md     ← Monitoring, logolás, maintenance
│   └── external_services.md            ← Külső szolgáltatások és integrációk
│
└── architecture/                        ← Architekturális követelmények
    ├── overview.md                      ← Architekturális áttekintés
    ├── system_components.md             ← Rendszerkomponensek
    ├── data_model.md                    ← Adatmodell és adatbázis séma
    ├── api_reference.md                 ← API végpontok referencia
    └── integrations.md                  ← Külső integrációk és protokollok
```

---

## Gyors navigáció

### 🏢 [Üzleti Követelmények](business/overview.md)
A termék üzleti kontextusa, célpiaca, értékajánlata és bevételi modellje.

| Dokumentum | Tartalom |
|---|---|
| [Értékajánlat](business/value_proposition.md) | Célpiac, piaci pozícionálás, versenyelőnyök |
| [Funkciók](business/features_and_capabilities.md) | Teljes funkcionalitás katalógus és képességek |
| [Bevételi modell](business/revenue_model.md) | Árazás, EAISY termékcsalád, pályázati lehetőségek |
| [Roadmap](business/roadmap.md) | Fejlesztési ütemterv, EAISY Marketing modul terv |

---

### ⚙️ [Üzemeltetési Követelmények](production/overview.md)
Deployment, konfiguráció, monitoring és külső szolgáltatások.

| Dokumentum | Tartalom |
|---|---|
| [Deployment](production/deployment.md) | Docker, Railway, szerver konfiguráció |
| [Környezeti változók](production/environment_variables.md) | Összes env var, titkosítás, API kulcsok |
| [Monitoring](production/monitoring_and_operations.md) | Health check, logolás, hibaelhárítás |
| [Külső szolgáltatások](production/external_services.md) | Brevo, Meta, Telnyx, LiveKit Cloud, Supabase |

---

### 🏗️ [Architekturális Követelmények](architecture/overview.md)
Rendszerarchitektúra, komponensek, adatmodell és API-k.

| Dokumentum | Tartalom |
|---|---|
| [Rendszerkomponensek](architecture/system_components.md) | Agent Worker, Web Server, Tools, Prompt Engine |
| [Adatmodell](architecture/data_model.md) | Supabase táblák, relációk, CRUD műveletek |
| [API Referencia](architecture/api_reference.md) | Összes REST endpoint dokumentáció |
| [Integrációk](architecture/integrations.md) | LiveKit, Telnyx SIP, Meta Webhook, Gemini |

---

## Fő megállapítások összefoglalója

### A rendszer jelenlegi állapota

| Szempont | Állapot |
|---|---|
| **Érettségi szint** | Production — aktívan üzemel DigitalOcean szerveren |
| **Fő technológia** | Python 3.12 + LiveKit Agents + Google Gemini 2.5 Flash |
| **Adatbázis** | Supabase (PostgreSQL) — migrálva SQLite-ról |
| **Deployment** | Docker Compose + Railway támogatás |
| **Telephony** | Telnyx SIP direct → LiveKit Cloud (G.722, HD Voice) |
| **Csatornák** | Telefon, Webchat widget, Messenger, Instagram, Email, WhatsApp |
| **Marketing modul** | EAISY Marketing — Email (Brevo), Social Media (Meta API), AI tartalom |

### Kritikus függőségek

| Szolgáltatás | Cél | Kritikusság |
|---|---|---|
| LiveKit Cloud | WebRTC relay, SIP gateway | 🔴 Nélkülözhetetlen |
| Google Gemini | LLM (beszédértés, válaszgenerálás) | 🔴 Nélkülözhetetlen |
| Supabase | Adattárolás (minden modul) | 🔴 Nélkülözhetetlen |
| Soniox | STT (beszédfelismerés) | 🔴 Nélkülözhetetlen |
| Cartesia | TTS (szöveg → hang) | 🔴 Nélkülözhetetlen |
| Telnyx | Telefónia (be-/kimenő hívások) | 🟡 Telefon funkcióhoz |
| Brevo | Email küldés | 🟡 Email funkcióhoz |
| Meta Graph API | Messenger/Instagram/FB posztolás | 🟡 Social funkcióhoz |

---

## Kapcsolódó projektdokumentáció

A projekt gyökerében az alábbi meglévő dokumentumok találhatók:

- [`SETUP.md`](../SETUP.md) — Szerver deploy és maintenance parancsok
- [`cimkerendszer_attekintes.md`](../cimkerendszer_attekintes.md) — 3 rétegű címkerendszer logikája
- [`AGENT_DOCS.md`](../thinkai-voice-agent/AGENT_DOCS.md) — Technikai dokumentáció (LiveKit, Telnyx, audio)
- [`_pdf_extract.txt`](../_pdf_extract.txt) — DigiDesk fejlesztői brief (termékspecifikáció)
- [`spec_output.txt`](../spec_output.txt) — EAISY Marketing modul funkcionális specifikáció
