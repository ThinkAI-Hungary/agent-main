# Adatmodell és Adatbázis Séma

> **Projekt:** ThinkAI Voice Agent  
> **Visszautalás:** [Architecture Áttekintés](overview.md) | [Főáttekintés](../overview.md)

---

## 1. Adatbázis áttekintés

| Paraméter | Érték |
|---|---|
| **Típus** | PostgreSQL (Supabase Cloud) |
| **Korábbi** | SQLite (migrálva) |
| **SDK** | Supabase Python SDK |
| **ORM** | Nincs (közvetlen SDK hívások) |
| **Séma fájl** | `supabase_schema.sql` (alap séma, nem teljes!) |

> ⚠️ **Fontos:** A `supabase_schema.sql` fájl csak az alapvető táblákat tartalmazza. A `database.py` kód alapján számos további tábla is létezik (campaigns, email_campaigns, doctors, services, stb.), amelyek feltételezhetően a Supabase Dashboard-on vagy migrációs scriptekkel lettek létrehozva.

---

## 2. Tábla áttekintés

### Alap rendszer (supabase_schema.sql)

```
┌──────────────────┐     ┌──────────────────┐
│  admin_users     │     │  sessions        │
│  ─────────────── │     │  ────────────────│
│  id (PK)         │     │  id (PK)         │
│  username        │     │  session_id (UQ) │
│  email           │     │  room_name       │
│  password_hash   │     │  started_at      │
│  created_at      │     │  ended_at        │
└──────────────────┘     │  duration_seconds│
                          │  participant     │
                          └────────┬─────────┘
                                   │ session_id (FK)
                          ┌────────▼─────────┐
                          │  interactions    │
                          │  ────────────────│
                          │  id (PK)         │
                          │  session_id (FK) │
                          │  type            │
                          │  topic           │
                          │  summary         │
                          │  result          │
                          │  tool_name       │
                          │  funnel_stage    │
                          │  alert_tags (JSON)│
                          │  created_at      │
                          └──────────────────┘
```

### CRM rendszer

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  clients         │     │  kanban_columns  │     │  client_fields   │
│  ─────────────── │     │  ────────────────│     │  ────────────────│
│  id (PK)         │     │  id (PK, TEXT)   │     │  id (PK, TEXT)   │
│  name            │     │  name            │     │  name            │
│  email           │     │  order_index     │     │  order_index     │
│  phone           │     └──────────────────┘     └──────────────────┘
│  status          │
│  custom_data (JSON)│
│  created_at      │
└──────────────────┘
```

### Naptár és feladatok

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  calendar_events │     │  email_logs      │     │  tasks           │
│  ─────────────── │     │  ────────────────│     │  ────────────────│
│  id (PK)         │     │  id (PK)         │     │  id (PK)         │
│  title           │     │  to_name         │     │  text            │
│  start_dt        │     │  to_email        │     │  priority        │
│  end_dt          │     │  subject         │     │  due_date        │
│  duration_minutes│     │  message         │     │  created_at      │
│  attendee        │     │  sent_at         │     │  completed       │
│  attendee_email  │     │  status          │     │  session_id      │
│  created_at      │     │  error           │     └──────────────────┘
│  reminder_sent   │     │  session_id      │
│  doctor_id       │     └──────────────────┘
│  clinic_id       │
└──────────────────┘
```

---

## 3. Tábla részletek

### 3.1 `admin_users`

| Mező | Típus | Kötelező | Leírás |
|---|---|---|---|
| id | BIGSERIAL PK | Igen | Auto-increment ID |
| username | TEXT UNIQUE | Igen | Felhasználónév |
| email | TEXT | Nem | Email cím |
| password_hash | TEXT | Igen | Jelszó hash |
| created_at | TIMESTAMPTZ | Igen | Létrehozás dátuma |

### 3.2 `sessions`

| Mező | Típus | Kötelező | Leírás |
|---|---|---|---|
| id | BIGSERIAL PK | Igen | Auto-increment ID |
| session_id | TEXT UNIQUE | Igen | LiveKit session azonosító |
| room_name | TEXT | Nem | LiveKit room neve |
| started_at | TIMESTAMPTZ | Igen | Hívás kezdete |
| ended_at | TIMESTAMPTZ | Nem | Hívás vége |
| duration_seconds | INTEGER | Nem | Hívás hossza (mp) |
| participant | TEXT | Nem | Résztvevő neve |

### 3.3 `interactions`

| Mező | Típus | Kötelező | Leírás |
|---|---|---|---|
| id | BIGSERIAL PK | Igen | Auto-increment ID |
| session_id | TEXT FK | Nem | Kapcsolódó session |
| type | TEXT | Igen | Interakció típusa |
| topic | TEXT | Nem | Téma |
| summary | TEXT | Nem | Összefoglaló |
| result | TEXT | Nem | Eredmény |
| tool_name | TEXT | Nem | Használt eszköz neve |
| funnel_stage | TEXT | Nem | Tölcsér fázis (default: 'relevant') |
| alert_tags | JSONB | Nem | Riasztási címkék (default: []) |
| approval_status | TEXT | Nem | Jóváhagyási státusz (pending/approved/rejected) |
| ai_draft_response | TEXT | Nem | AI által generált piszkozat válasz |
| source_channel | TEXT | Nem | Forrás csatorna (Telefon/Messenger/Instagram/Email) |
| client_id | INTEGER | Nem | Kapcsolódó ügyfél ID |
| created_at | TIMESTAMPTZ | Igen | Létrehozás dátuma |

### 3.4 `clients`

| Mező | Típus | Kötelező | Leírás |
|---|---|---|---|
| id | BIGSERIAL PK | Igen | Auto-increment ID |
| name | TEXT | Igen | Ügyfél neve |
| email | TEXT | Nem | Email cím |
| phone | TEXT | Nem | Telefonszám |
| status | TEXT | Nem | Státusz (default: 'uj') |
| custom_data | JSONB | Nem | Egyedi mezők (default: {}) |
| tags | TEXT[] | Nem | Címkék tömbje |
| kanban_column | TEXT | Nem | Kanban oszlop ID |
| notes | TEXT | Nem | Megjegyzések |
| source_channel | TEXT | Nem | Forrás csatorna |
| meta_psid | TEXT | Nem | Meta Platform Scoped User ID |
| created_at | TIMESTAMPTZ | Igen | Létrehozás dátuma |

### 3.5 `calendar_events`

| Mező | Típus | Kötelező | Leírás |
|---|---|---|---|
| id | BIGSERIAL PK | Igen | Auto-increment ID |
| title | TEXT | Igen | Esemény címe |
| start_dt | TIMESTAMPTZ | Igen | Kezdés dátuma |
| end_dt | TIMESTAMPTZ | Nem | Befejezés dátuma |
| duration_minutes | INTEGER | Nem | Időtartam (default: 30) |
| attendee | TEXT | Nem | Résztvevő neve |
| attendee_email | TEXT | Nem | Résztvevő email |
| doctor_id | INTEGER | Nem | Orvos ID (FK → doctors) |
| clinic_id | INTEGER | Nem | Telephely ID (FK → clinics) |
| reminder_sent | BOOLEAN | Nem | Emlékeztető elküldve? |
| created_at | TIMESTAMPTZ | Igen | Létrehozás dátuma |

### 3.6 `doctors`

| Mező | Típus | Kötelező | Leírás |
|---|---|---|---|
| id | BIGSERIAL PK | Igen | Auto-increment ID |
| name | TEXT | Igen | Orvos neve |
| specialty | TEXT | Nem | Szakterület |
| related_services | TEXT | Nem | Kapcsolódó szolgáltatások |

### 3.7 `services`

| Mező | Típus | Kötelező | Leírás |
|---|---|---|---|
| id | BIGSERIAL PK | Igen | Auto-increment ID |
| service_name | TEXT | Igen | Szolgáltatás neve |
| duration_minutes | INTEGER | Igen | Időtartam (perc) |
| doctor_id | INTEGER FK | Nem | Hozzárendelt orvos |
| note | TEXT | Nem | Megjegyzés |

### 3.8 `clinics`

| Mező | Típus | Kötelező | Leírás |
|---|---|---|---|
| id | BIGSERIAL PK | Igen | Auto-increment ID |
| name_and_address | TEXT | Igen | Telephely neve és címe |
| access_info | TEXT | Nem | Megközelítési információ |

### 3.9 `campaigns`

| Mező | Típus | Kötelező | Leírás |
|---|---|---|---|
| id | BIGSERIAL PK | Igen | Auto-increment ID |
| name | TEXT | Igen | Kampány neve |
| channels | JSONB | Nem | Csatornák listája |
| status | TEXT | Nem | Státusz (Vázlat/Folyamatban/Befejezve) |
| client_ids | JSONB | Nem | Célcsoport ügyfél ID-k |
| ai_instructions | TEXT | Nem | AI utasítások (MODE:{mode}:{instructions}) |
| total_count | INTEGER | Nem | Összes ügyfél száma |
| processed_count | INTEGER | Nem | Feldolgozott ügyfelek |
| created_at | TIMESTAMPTZ | Igen | Létrehozás dátuma |

### 3.10 `outbound_automations`

| Mező | Típus | Kötelező | Leírás |
|---|---|---|---|
| id | BIGSERIAL PK | Igen | Auto-increment ID |
| name | TEXT | Igen | Automatizmus neve |
| enabled | BOOLEAN | Nem | Aktív-e |
| delay_hours | INTEGER | Nem | Késleltetés (óra) |
| channel | TEXT | Nem | Csatorna |
| message_template | TEXT | Nem | Üzenet sablon |
| target_tag | TEXT | Nem | Cél címke |

### 3.11 `reminder_settings`

| Mező | Típus | Kötelező | Leírás |
|---|---|---|---|
| id | INTEGER PK | Igen | Mindig 1 (singleton) |
| reminder_enabled | BOOLEAN | Nem | Emlékeztetők aktívak? |
| reminder_hours | INTEGER | Nem | Hány órával előtte |
| reminder_template | TEXT | Nem | Emlékeztető szöveg sablon |

### 3.12 `email_campaigns` (EAISY Marketing)

| Mező | Típus | Kötelező | Leírás |
|---|---|---|---|
| id | UUID PK | Igen | UUID azonosító |
| name | TEXT | Igen | Kampány neve |
| type | TEXT | Nem | newsletter/promotion/drip/transactional |
| subject_line | TEXT | Nem | Email tárgysor |
| subject_line_b | TEXT | Nem | A/B teszt B változat |
| template_html | TEXT | Nem | Email HTML sablon |
| segment_name | TEXT | Nem | Célcsoport szegmens |
| status | TEXT | Igen | draft/scheduled/sending/sent |
| scheduled_at | TIMESTAMPTZ | Nem | Ütemezett küldés ideje |
| sent_at | TIMESTAMPTZ | Nem | Tényleges küldés ideje |
| brevo_campaign_id | TEXT | Nem | Brevo kampány ID |
| stats | JSONB | Nem | {opens, clicks, bounces, unsubscribes} |
| recipients_count | INTEGER | Nem | Címzettek száma |
| created_by | TEXT | Nem | Ki hozta létre |
| created_at | TIMESTAMPTZ | Igen | Létrehozás |
| updated_at | TIMESTAMPTZ | Nem | Utolsó frissítés |

### 3.13 `email_subscribers` (EAISY Marketing)

| Mező | Típus | Kötelező | Leírás |
|---|---|---|---|
| id | UUID PK | Igen | UUID azonosító |
| email | TEXT UNIQUE | Igen | Email cím |
| name | TEXT | Nem | Feliratkozó neve |
| tags | TEXT[] | Nem | Címkék |
| status | TEXT | Igen | active/unsubscribed/bounced/complained |
| consent_source | TEXT | Nem | Feliratkozási forrás |
| created_at | TIMESTAMPTZ | Igen | Feliratkozás dátuma |

### 3.14 `content_items` (EAISY Marketing — Social)

| Mező | Típus | Kötelező | Leírás |
|---|---|---|---|
| id | UUID PK | Igen | UUID azonosító |
| title | TEXT | Igen | Tartalom címe |
| type | TEXT | Igen | social_post/blog_post/newsletter |
| body | TEXT | Nem | Tartalom szövege |
| hashtags | TEXT[] | Nem | Hashtagek |
| image_url | TEXT | Nem | Kép URL |
| image_description | TEXT | Nem | Kép leírás |
| image_prompt | TEXT | Nem | AI kép generálási prompt |
| keywords | TEXT[] | Nem | Kulcsszavak |
| status | TEXT | Igen | requested/ai_draft/editing/approved/scheduled/published |
| ai_prompt | TEXT | Nem | AI-nak küldött prompt |
| ai_model | TEXT | Nem | Használt AI modell |
| target_platforms | TEXT[] | Nem | Cél platformok [instagram, facebook] |
| scheduled_at | TIMESTAMPTZ | Nem | Ütemezett publikálás |
| published_at | TIMESTAMPTZ | Nem | Publikálás ideje |
| published_platforms | TEXT[] | Nem | Hol lett publikálva |
| ig_media_id | TEXT | Nem | Instagram media ID |
| fb_post_id | TEXT | Nem | Facebook post ID |
| engagement_stats | JSONB | Nem | {views, likes, shares, comments} |
| created_by | TEXT | Nem | Ki hozta létre |
| created_at | TIMESTAMPTZ | Igen | Létrehozás |
| updated_at | TIMESTAMPTZ | Nem | Utolsó frissítés |

---

## 4. Relációk és kapcsolatok

```
sessions ──(1:N)──→ interactions
clients  ──(1:N)──→ interactions (client_id)
doctors  ──(1:N)──→ services (doctor_id)
doctors  ──(1:N)──→ calendar_events (doctor_id)
clinics  ──(1:N)──→ calendar_events (clinic_id)
campaigns ──(M:N)──→ clients (client_ids JSONB)
outbound_automations ──(1:N)──→ automation_sent_log
```

> ⚠️ **Megjegyzés:** A legtöbb reláció logikai (nem SQL FK constraint), mivel a Supabase SDK közvetlen hívásokkal dolgozik, és a foreign key-ek nem mindenhol vannak enforced-álva.

---

## 5. Meta tábla

```
_meta
├── key: TEXT PK
└── value: TEXT
```

Kulcs-érték tár rendszerbeállításokhoz (pl. utolsó futtatás ideje, stb.).

---

## Kereszthivatkozások

| Téma | Dokumentum |
|---|---|
| Rendszerkomponensek | [System Components](system_components.md) |
| API végpontok | [API Referencia](api_reference.md) |
| Funkciók | [Features](../business/features_and_capabilities.md) |
