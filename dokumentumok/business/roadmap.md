# Fejlesztési Ütemterv (Roadmap)

> **Projekt:** ThinkAI Voice Agent  
> **Visszautalás:** [Üzleti Áttekintés](overview.md) | [Főáttekintés](../overview.md)

---

## 1. Jelenlegi állapot — v1.x (Production)

### ✅ Megvalósított funkciók

#### Core — Voice Agent
- [x] LiveKit Agents v1.5.16 alapú hangügynök
- [x] Soniox STT (stt-rt-v4, magyar nyelv)
- [x] Google Gemini 2.5 Flash LLM
- [x] Cartesia TTS (sonic-3, magyar nyelv)
- [x] Silero VAD
- [x] 9 function tool (email, naptár, időpont, feladat, időjárás, tudásbázis, riasztás)
- [x] Dinamikus system prompt generálás (prompt_utils.py)
- [x] Konfigurálható hangszín (voice_id), hangerő, sebesség

#### Bejövő kommunikáció
- [x] Telnyx SIP telefónia (HD Voice, G.722, direct LiveKit integráció)
- [x] Webchat widget (voice-widget.html)
- [x] Meta Messenger webhook integráció
- [x] Instagram DM webhook integráció
- [x] Email bejövő feldolgozás (IMAP + AI triázs)

#### Kimenő kommunikáció
- [x] Időpont-emlékeztető (reminder_worker_loop)
- [x] Outbound automatizmusok (eseményvezérelt)
- [x] Kampánykezelés (email, telefon, üzenet)
- [x] AI draft válaszok + jóváhagyási rendszer
- [x] Outbound SIP hívások (LiveKit → Telnyx)

#### CRM
- [x] Ügyféladatbázis (Supabase)
- [x] Kanban-alapú érdeklődőkezelés
- [x] 3 rétegű címkerendszer
- [x] Egyedi mezők (client_fields)
- [x] Ügyféltörténet és interakciós napló

#### Admin Dashboard
- [x] FastAPI web server (web_server.py)
- [x] Analitika dashboard
- [x] Ügyfélközpont (lista + kanban)
- [x] Naptárkezelés
- [x] Tudástár (beállítások, céginformáció, GYIK)
- [x] Admin felhasználókezelés

#### EAISY Marketing
- [x] Email kampánykezelés (Brevo integráció)
- [x] Email feliratkozó-kezelés
- [x] A/B tesztelés (tárgysor)
- [x] AI tartalomgenerálás (Gemini)
- [x] Instagram posztolás (Content Publishing API)
- [x] Facebook Page posztolás
- [x] Social média analytics (IG + FB)
- [x] Ütemezett posztolás (social_publisher_worker)
- [x] Kampány statisztikák (open rate, CTR, bounce)

#### Infrastruktúra
- [x] Docker + Docker Compose deployment
- [x] Railway.toml konfiguráció
- [x] Health check endpoint (/api/health)
- [x] Supabase migráció (SQLite → PostgreSQL)
- [x] Git-alapú verziókezelés
- [x] update.sh automatikus deploy script

---

## 2. Rövid távú fejlesztések (Q3-Q4 2026)

Az `spec_output.txt` és `_pdf_extract.txt` alapján tervezett funkciók:

### 🔲 WhatsApp Business API
- Dedikált WhatsApp integráció (nem csak Meta Webhook)
- Kétirányú üzenetküldés
- Média üzenetek támogatása

### 🔲 Multi-tenant támogatás
- Egy szerverpéldányon több ügyfél kiszolgálása
- Tenant-izolált adatbázis (Supabase RLS)
- Tenant-specifikus konfiguráció

### 🔲 Fejlettebb analitika
- Konverziós tölcsér vizualizáció
- Hívásminőség metrikák
- Ügyfél-elégedettség mérés
- Operátori teljesítmény riportok

---

## 3. Középtávú fejlesztések (2027)

Az EAISY Marketing specifikáció alapján:

### 🔲 SEO/SEM eszközök
- Kulcsszó-nyilvántartás és pozíciókövetés
- On-page SEO javaslatok (AI-generált tartalmakhoz)
- Google Ads kampány nyomon követés (CPC, ROI)
- Költségkeret figyelés

### 🔲 Hűségprogram modul
- Pontgyűjtés (konfigurálható arány)
- Törzsvásárlói szintek (Bronz, Ezüst, Arany)
- Jutalmak és kedvezmények
- Automatikus értesítések (pontegyenleg, szintlépés)
- Riportok (részvételi arány, beváltási ráta)

### 🔲 Versenytárs árfigyelő rendszer
- Versenytárs és termék regisztráció
- Ütemezett web scraping (napi/heti)
- AI-alapú árkinyerés (Claude/Gemini)
- Automatikus eszkaláció árváltozáskor
- Történeti árelemzés és trendek

### 🔲 Kuponkód rendszer
- Kuponkódok generálása (százalék/fix összeg/ingyenes szállítás)
- Érvényességi kezelés (dátum, max. felhasználás)
- Szegmens-specifikus kuponok
- Kampány-integrált kuponok

---

## 4. Technikai adósságok és fejlesztési igények

### Azonosított technikai adósságok

| Probléma | Részlet | Prioritás |
|---|---|---|
| **Monolitikus web_server.py** | 3760 sor egyetlen fájlban, vegyes felelősségek | 🟡 Közepes |
| **Monolitikus database.py** | 1784 sor, nincs ORM, közvetlen Supabase hívások | 🟡 Közepes |
| **Hiányzó tesztek** | Nincs unit/integration test | 🔴 Magas |
| **AGENT_DOCS.md elavult** | Még SQLite-ot említ, a valóságban Supabase | 🟡 Közepes |
| **Hardcoded értékek** | IG_USER_ID, FB_PAGE_ID a social_media.py-ban | 🟡 Közepes |
| **Hiányzó rate limiting** | Publikus API végpontokon nincs throttling | 🔴 Magas |
| **Encoding problémák** | spec_output.txt encoding hibás (ékezetes karakterek) | 🟢 Alacsony |

### Javasolt architekturális fejlesztések

1. **web_server.py szétbontása** — Route-ok szeparálása modulokba (admin, marketing, api, auth)
2. **database.py refaktorálás** — Repository pattern bevezetése, típusozott modellek
3. **Tesztelési keretrendszer** — pytest + httpx testclient
4. **CI/CD pipeline** — GitHub Actions (lint, test, deploy)
5. **API dokumentáció** — FastAPI automata OpenAPI/Swagger

---

## Kereszthivatkozások

| Téma | Dokumentum |
|---|---|
| EAISY Marketing spec | [`spec_output.txt`](../../spec_output.txt) |
| DigiDesk spec | [`_pdf_extract.txt`](../../_pdf_extract.txt) |
| Architekturális áttekintés | [Architecture Overview](../architecture/overview.md) |
| Funkciók részletezése | [Funkciók és Képességek](features_and_capabilities.md) |
