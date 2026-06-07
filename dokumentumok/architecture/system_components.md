# Rendszerkomponensek

> **Projekt:** ThinkAI Voice Agent  
> **Visszautalás:** [Architecture Áttekintés](overview.md) | [Főáttekintés](../overview.md)

---

## 1. Agent Worker — `server.py`

### Szerepe
A LiveKit Agent Worker a rendszer magja: csatlakozik a LiveKit Cloud-hoz WSS-en, és minden új szobában (room) automatikusan elindul, hogy kezelje a felhasználóval való hangkommunikációt.

### Osztály: `ThinkAIAgent(Agent)`

```python
class ThinkAIAgent(Agent):
    # Konfigurációs paraméterek
    min_endpointing_delay = 0.5   # sec
    max_endpointing_delay = 3.0   # sec
    min_interruption_duration = 0.5  # sec
```

### Pipeline konfiguráció

| Komponens | Szolgáltató | Konfiguráció |
|---|---|---|
| STT | Soniox | model=`stt-rt-v4`, language=`hu` |
| LLM | Gemini | model=`gemini-2.5-flash`, Multimodal Live API |
| TTS | Cartesia | model=`sonic-3`, speed=1.0, language=`hu` |
| VAD | Silero | threshold=0.85, min_speech=0.4s, min_silence=0.5s |
| Noise | LiveKit BVC | Server-side noise cancellation |

### Indítás

```python
# Entrypoint
if __name__ == "__main__":
    cli.run_app(WorkerOptions(
        entrypoint_fnc=entrypoint,
        agent_name="dobozos-ai"
    ))
```

- `dev` mód: hot-reload
- `start` mód: production

### Agent session lifecycle

```
1. LiveKit dispatch → room created
2. Agent joins room
3. System prompt loaded (prompt_utils.get_system_prompt())
4. Tools registered (tools.py)
5. Greeting played (Cartesia TTS)
6. Conversation loop:
   a. User speaks → STT → text
   b. LLM processes → response + optional tool calls
   c. Tool execution → database writes
   d. TTS → audio response → user
7. Session end → database close_session()
```

---

## 2. Web Server — `web_server.py`

### Szerepe
FastAPI-alapú HTTP szerver, amely kiszolgálja az admin dashboardot, REST API-t, a voice widget-et, és háttérfolyamatokat futtat.

### Technológia

| Paraméter | Érték |
|---|---|
| Framework | FastAPI |
| ASGI server | Uvicorn |
| Port | 8000 (konfigurálható) |
| Méret | ~3760 sor (monolitikus!) |

### Fő felelősségi körök

1. **Admin Dashboard** — HTML oldalak szervizelése
2. **REST API** — CRUD végpontok az összes modulhoz
3. **Voice Widget** — `voice-widget.html` kiszolgálása
4. **LiveKit Token** — Room token generálás widget számára
5. **Meta Webhook** — Messenger/Instagram üzenetek fogadása
6. **Háttérfolyamatok** — Social publishing, email polling, reminders
7. **Autentikáció** — Admin session kezelés

### CORS konfiguráció

```python
allow_origins = [
    "https://thinkai.hu",
    "https://www.thinkai.hu",
    "http://localhost:3000",
    "http://localhost:8000"
]
```

### Háttérfolyamatok (asyncio tasks)

A `@app.on_event("startup")` vagy hasonló mechanizmussal indulnak:

| Worker | Funkció |
|---|---|
| `social_publisher_worker` | Ütemezett social média posztok publikálása |
| `email_worker_loop` | IMAP email bejövő feldolgozás |
| `reminder_worker_loop` | Időpont-emlékeztetők küldése |

### Route csoportok

| Prefix | Modul | Példa |
|---|---|---|
| `/` | Root | Dashboard, widget, statikus fájlok |
| `/api/` | Publikus API | `/api/token`, `/api/health`, `/api/webhook/meta` |
| `/admin/api/` | Admin API | `/admin/api/settings`, `/admin/api/clients` |
| `/marketing/api/` | Marketing API | `/marketing/api/campaigns`, `/marketing/api/content` |

---

## 3. AI Eszközök — `tools.py`

### Szerepe
A `@function_tool` dekorátor segítségével definiált eszközök, amelyeket a Gemini LLM hívhat meg a beszélgetés során.

### Eszközök részletezése

#### 3.1 `send_followup_email`
- **Input:** to_name, to_email, subject, body
- **Output:** Sikeres/sikertelen
- **Működés:** Brevo SMTP API hívás, email_logs táblába rögzítés

#### 3.2 `check_calendar`
- **Input:** start_date, end_date (opcionális)
- **Output:** Események listája
- **Működés:** Supabase query a calendar_events táblára

#### 3.3 `book_meeting`
- **Input:** title, start_dt, duration_minutes, attendee, attendee_email, doctor_id, clinic_id
- **Output:** Sikeres/sikertelen + konfliktus info
- **Működés:**
  1. Nyitvatartás ellenőrzés
  2. Ütközésvizsgálat (azonos időablakban van-e más esemény)
  3. Esemény létrehozás (calendar_events)
  4. Visszaigazoló email küldés
  5. Interakció rögzítés

#### 3.4 `modify_meeting`
- **Input:** event_id, new_title/new_start_dt/new_duration
- **Output:** Sikeres/sikertelen
- **Működés:** calendar_events update

#### 3.5 `delete_meeting`
- **Input:** event_id
- **Output:** Sikeres/sikertelen
- **Működés:** calendar_events delete

#### 3.6 `create_task`
- **Input:** text, priority, due_date
- **Output:** Task ID
- **Működés:** tasks tábla insert

#### 3.7 `get_weather`
- **Input:** city (magyar városnév)
- **Output:** Hőmérséklet, csapadék, szélsebesség, stb.
- **Működés:** Open-Meteo API hívás (15 előre definiált város koordinátáival)

#### 3.8 `lookup_info`
- **Input:** query (keresési kifejezés)
- **Output:** Legjobban illeszkedő tudásbázis bejegyzés
- **Működés:** Fuzzy keresés a knowledge.json-ben (alias matching)

#### 3.9 `report_alert`
- **Input:** alert_type (urgent/complaint/callback), description
- **Output:** Rögzítve
- **Működés:** Interakció rögzítés sürgős/panasz/visszahívás címkével

---

## 4. Prompt Engine — `prompt_utils.py`

### Szerepe
Dinamikusan generálja a system promptot a rendelő konfigurációja, az aktuális adatbázis-állapot és a beállítások alapján.

### Bemenetek

| Forrás | Adat |
|---|---|
| `praxisinfo.json` | Rendelő neve, címe, árlista, GYIK, kivételek, kampányok |
| `agent_settings.json` | Hangnem, nyitvatartás, üdvözlő szöveg |
| `database.py` | Orvosok, szolgáltatások, telephelyek (Supabase lekérdezés) |
| `system_prompt.md` | Prompt sablon (placeholder-ek) |

### Formázó függvények

| Függvény | Kimenet |
|---|---|
| `_format_doctors()` | "- Dr. Példa (Fogszakorvos)" |
| `_format_services()` | "- Konzultáció (30 perc) – Orvos: Dr. Példa" |
| `_format_campaigns()` | "- Tavaszi akció: 20% kedvezmény..." |
| `_format_exceptions()` | "- Sürgős eset → emberi beavatkozás" |
| `_format_business_hours()` | "- Hétfő: 09:00 - 17:00" |
| `_format_knowledge()` | "K: rólunk\nV: A ThinkAI egy..." |
| `_format_faq()` | "Kérdés #1: ...\nVálasz #1: ..." |
| `_format_cancellation_policy()` | Lemondási/módosítási szabályok |
| `_format_patient_rules()` | Páciens azonosítási logika |

### Generálási folyamat

```python
def get_system_prompt() -> str:
    template = system_prompt.md tartalma
    variables = {
        "today": datetime.now(),
        "practice_name": praxisinfo.json["practice_name"],
        "doctors": _format_doctors(),  # Supabase-ből
        "services_list": _format_services(),  # Supabase-ből
        "clinics_prompt": _format_clinics(),  # Supabase-ből
        ...
    }
    return template.format(**variables)
```

---

## 5. Adatréteg — `database.py`

### Szerepe
Supabase CRUD műveletek gyűjteménye. Nincs ORM — közvetlen Supabase Python SDK hívások.

### Méret: 1784 sor

### Szekciók

| Szekció | Sorok | Leírás |
|---|---|---|
| Inicializáció | 1-30 | Supabase client setup |
| Admin Users | ~50 | Felhasználókezelés |
| Sessions | ~80 | Hívás session kezelés |
| Interactions | ~100 | Interakciók rögzítése |
| Calendar Events | ~120 | Naptáresemények |
| Email Logs | ~50 | Email napló |
| Tasks | ~50 | Feladatok |
| Clients | ~200 | Ügyfelek CRUD + kanban |
| Analytics | ~200 | Statisztikák számítása |
| Doctors | ~80 | Orvosok kezelése |
| Services | ~80 | Szolgáltatások |
| Approvals | ~80 | Jóváhagyási rendszer |
| Clinics | ~80 | Telephelyek |
| Reminders | ~80 | Emlékeztetők |
| Campaigns | ~100 | Kampánykezelés |
| Outbound Automations | ~80 | Automatizmusok |
| Email Campaigns | ~150 | EAISY Marketing email |
| Email Subscribers | ~80 | Feliratkozók |
| Content Items | ~200 | AI tartalom (social) |

### Hibakezelés minta

```python
def get_clients(limit=500):
    if not supabase: return []
    try:
        res = supabase.table("clients").select("*").order("id", desc=True).limit(limit).execute()
        return res.data
    except Exception as e:
        logger.error(f"Error fetching clients: {e}")
        return []
```

Minden függvény:
1. Ellenőrzi, hogy a supabase client inicializálva van-e
2. Try-except blokkban fut
3. Hibánál üres listát / False-t / 0-t ad vissza + logol

---

## 6. Email Processor — `email_processor.py`

### Szerepe
IMAP-on bejövő emailek automatikus feldolgozása AI-val.

### Működés

```
1. IMAP server csatlakozás
2. Új emailek lekérése
3. Minden emailhez:
   a. Tartalom kinyerése
   b. AI elemzés (Gemini) → kategorizálás, válasz draft
   c. Ügyfél azonosítás/létrehozás
   d. Interakció rögzítés (Supabase)
   e. Ha automatikus válasz engedélyezve → küldés
   f. Ha nem → draft jóváhagyásra
```

---

## 7. Social Media — `social_media.py`

### Szerepe
Instagram és Facebook posztolás + analytics.

### Funkciók

| Függvény | Leírás |
|---|---|
| `publish_instagram_post(image_url, caption)` | IG kép posztolás (2 lépéses: container → publish) |
| `publish_facebook_post(caption, image_url)` | FB poszt (kép vagy szöveg) |
| `get_instagram_media(limit)` | Legutóbbi IG posztok |
| `get_facebook_posts(limit)` | Legutóbbi FB posztok |
| `get_publishing_limit()` | IG publikálási kvóta |
| `get_instagram_post_insights(media_id)` | IG poszt analytics |
| `get_facebook_post_insights(post_id)` | FB poszt analytics |
| `get_social_overview()` | Összesített social analytics |

---

## 8. Brevo Campaigns — `brevo_campaigns.py`

### Szerepe
Brevo email campaign API wrapper.

### Funkciók

| Függvény | Leírás |
|---|---|
| `ensure_marketing_list()` | "EAISY Marketing" lista létrehozása/keresése |
| `sync_contact(email, name, list_id)` | Egyedi kontakt szinkronizálás |
| `sync_contacts_batch(subscribers, list_id)` | Tömeges szinkronizálás |
| `create_campaign(name, subject, html, list_id)` | Kampány létrehozás |
| `send_campaign_now(brevo_campaign_id)` | Azonnali küldés |
| `schedule_campaign(brevo_campaign_id, scheduled_at)` | Ütemezett küldés |
| `get_campaign_stats(brevo_campaign_id)` | Statisztikák lekérése |

---

## Kereszthivatkozások

| Téma | Dokumentum |
|---|---|
| Adatmodell | [Data Model](data_model.md) |
| API végpontok | [API Referencia](api_reference.md) |
| Külső integrációk | [Integrációk](integrations.md) |
| Funkciók | [Features](../business/features_and_capabilities.md) |
