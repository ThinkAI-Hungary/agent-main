# Funkciók és Képességek

> **Projekt:** ThinkAI Voice Agent  
> **Visszautalás:** [Üzleti Áttekintés](overview.md) | [Főáttekintés](../overview.md)

---

## 1. Hangalapú AI Agent (Core)

A rendszer magja egy LiveKit-alapú valós idejű hangügynök, amely az alábbi pipeline-on keresztül működik:

```
Felhasználó beszél → Soniox STT → szöveg
                                    ↓
                              Gemini 2.5 Flash → válasz szöveg
                                    ↓                    ↓ (ha tool call)
                              Cartesia TTS         tools.py → adatbázis
                                    ↓
                              Hang → Felhasználó
```

### STT (Speech-to-Text)
- **Szolgáltató:** Soniox (`stt-rt-v4`)
- **Nyelv:** Magyar (`hu`)
- **Típus:** Valós idejű stream

### LLM (Large Language Model)
- **Szolgáltató:** Google Gemini
- **Modell:** `gemini-2.5-flash`
- **Multimodal:** Igen (Gemini Multimodal Live API)
- **System prompt:** Dinamikusan generált, tartalmazza a rendelő adatait, szolgáltatásokat, orvosokat, GYIK-et

### TTS (Text-to-Speech)
- **Szolgáltató:** Cartesia
- **Modell:** `sonic-3`
- **Nyelv:** Magyar
- **Sebesség:** 1.0x (konfigurálható)
- **Hang:** Konfigurálható voice ID

### VAD (Voice Activity Detection)
- **Szolgáltató:** Silero
- **Küszöb:** 0.85
- **Min. beszéd:** 0.4s
- **Min. csend:** 0.5s

---

## 2. Bejövő interakciókezelés (Inbound)

### 2.1 Csatornák

| Csatorna | Implementáció | Státusz |
|---|---|---|
| **Telefon (PSTN)** | Telnyx SIP → LiveKit Cloud → Agent | ✅ Production |
| **Webchat widget** | HTML widget → LiveKit WebRTC → Agent | ✅ Production |
| **Messenger** | Meta Webhook → AI feldolgozás → Válasz | ✅ Production |
| **Instagram DM** | Meta Webhook → AI feldolgozás → Válasz | ✅ Production |
| **Email** | IMAP polling → AI feldolgozás → Draft/válasz | ✅ Production |
| **WhatsApp** | Tervezett (Meta Business API) | 🔲 Planned |

### 2.2 Interakció feldolgozási logika

A `_pdf_extract.txt` (DigiDesk brief) alapján az interakciók feldolgozása:

```
Bejövő üzenet
    ↓
1. Csatorna rögzítése
2. Irány rögzítése (bejövő)
3. Ügyfél azonosítása (név + email)
   ├── Ha talál: meglévő ügyfél
   └── Ha nem talál: új rekord + "ÚJ ÜGYFÉL" címke
4. Ügytípus meghatározás
   ├── IDŐPONT (foglalás/módosítás/törlés)
   ├── KÉRDÉS (általános/vásárlási potenciál/irreleváns)
   ├── KÉRÉS (adminisztratív/akciót igénylő)
   ├── PANASZ
   └── EGYÉB
5. Kezelhetőség vizsgálata
   ├── Önállóan lezárható → LEZÁRT
   ├── Emberi beavatkozás szükséges → NYITOTT
   └── Sürgős/panasz → SÜRGŐS
```

### 2.3 AI eszközök (Function Tools)

A Voice Agent 9 beépített eszközzel rendelkezik:

| # | Eszköz | Funkció | Implementáció |
|---|---|---|---|
| 1 | `send_followup_email` | Email küldés Brevo SMTP-n | `tools.py` |
| 2 | `check_calendar` | Naptáresemények lekérdezése | `tools.py` |
| 3 | `book_meeting` | Időpontfoglalás ütközésvizsgálattal | `tools.py` |
| 4 | `modify_meeting` | Időpont módosítása | `tools.py` |
| 5 | `delete_meeting` | Időpont törlése | `tools.py` |
| 6 | `create_task` | Feladat/megjegyzés rögzítése | `tools.py` |
| 7 | `get_weather` | Időjárás lekérés (15 magyar város) | `tools.py` |
| 8 | `lookup_info` | Tudásbázis keresés (fuzzy + alias) | `tools.py` |
| 9 | `report_alert` | Sürgős/panasz/visszahívás jelzés | `tools.py` |

### 2.4 Időpontfoglalási workflow

```
1. Milyen dátumra? (kérdés)
2. Hány órakor? (kérdés)
3. Mi legyen a témája? (kérdés)
4. Mennyi ideig tartson? (szolgáltatás alapján automatikus)
5. Résztvevő neve? (kérdés)
6. Résztvevő email címe? (kötelező!)
7. Összefoglalás + megerősítés kérés
8. book_meeting tool hívás
9. Visszaigazolás + lemondási szabályzat közlése
```

**Speciális szabályok:**
- Nyitvatartási időn kívülre TILOS foglalni
- Hétvégére (ha zárva) TILOS foglalni
- Új páciensnél első alkalom = kötelezően állapotfelmérés
- Ütközésvizsgálat automatikus
- Orvos-specifikus naptárak kezelése

---

## 3. Kimenő kommunikáció (Outbound)

### 3.1 Eseményvezérelt automatizmusok

A rendszer automatikus kimenő kommunikációkat generál triggerek alapján:

| Trigger | Kommunikáció | Csatorna | Implementáció |
|---|---|---|---|
| Időpont létrehozása | Visszaigazolás | Email | `email_processor.py` |
| X óra az időpont előtt | Emlékeztető | Email | `reminder_worker_loop` |
| Időpont módosítása | Módosítás visszaigazolás | Email | automatikus |
| Új ügyfél regisztráció | Üdvözlő üzenet | Email/üzenet | `outbound_automations` |
| Inaktivitás | Reaktiválás | Konfigurálható | `outbound_automations` |

### 3.2 Kampánykezelés

**Kampány létrehozás:**
1. Ügyféllista szűrése (címkék, státusz, csatorna)
2. Ügyfelek kijelölése
3. Kampány létrehozása (név, csatorna, AI utasítás)
4. Kampány indítása

**Kampány módok:**
- `ai` — AI generál személyre szabott üzeneteket
- `manual` — Manuális üzenet sablon

**Támogatott csatornák:**
- Email (Brevo API)
- Telefon (LiveKit SIP → Telnyx outbound)
- Üzenet (tervezett)

### 3.3 Jóváhagyási rendszer (Approval Flow)

```
AI feldolgozza a bejövő üzenetet
    ↓
AI piszkozatot készít (ai_draft_response)
    ↓
Státusz: "pending" → admin dashboard-on megjelenik
    ↓
Operátor jóváhagyja / szerkeszti / elutasítja
    ↓
Jóváhagyás után: rendszer elküldi a választ
```

---

## 4. CRM és Ügyfélkezelés

### 4.1 Ügyféladatbázis

**Kötelező mezők:**
- Név
- Email
- Telefonszám

**Opcionális mezők:**
- Egyedi mezők (dinamikusan definiálható `client_fields` táblából)
- `custom_data` (JSONB — tetszőleges struktúra)

### 4.2 Címkerendszer (3 rétegű)

→ Részletek: [`cimkerendszer_attekintes.md`](../../cimkerendszer_attekintes.md)

| Réteg | Típus | Példák |
|---|---|---|
| **1. Elsődleges** | Automatikus (életciklus) | új, visszatérő, inaktív |
| **2. Másodlagos** | Automatikus (interakció) | törölt időpont, no-show, árkérdés, kampány lead |
| **3. Manuális** | Operátor által | VIP, nehéz ügyfél, szabad szavas |

### 4.3 Érdeklődőkezelés (Kanban)

Kanban-alapú konverziós munkafelület az alábbi oszlopokkal:

```
Új lehetőség → Kapcsolatfelvétel → Egyeztetés/ajánlat → Döntés → Időpont → Elveszett
```

### 4.4 Naptárkezelés

- Eseménynaptár Supabase-ben (`calendar_events`)
- Orvos-specifikus naptárak
- Ütközésvizsgálat foglaláskor
- Telephelykezelés (többtelephelyes rendelők)
- Emlékeztető küldés konfigurálható idővel

---

## 5. EAISY Marketing modul

→ Részletek: [Roadmap](roadmap.md)

### 5.1 Email Marketing (Brevo integráció)

| Funkció | Státusz |
|---|---|
| Kampány létrehozás/szerkesztés/törlés | ✅ |
| A/B tesztelés (tárgysor) | ✅ |
| Feliratkozó kezelés (upsert, leiratkozás) | ✅ |
| Brevo szinkronizáció (kontaktok, listák) | ✅ |
| Kampány statisztikák (open rate, CTR, bounce) | ✅ |
| Ütemezett küldés | ✅ |
| Sablon szerkesztő (drag & drop) | 🔲 (Brevo beépítettet használja) |

### 5.2 Social Media kezelés

| Funkció | Státusz |
|---|---|
| Instagram kép posztolás (Content Publishing API) | ✅ |
| Facebook Page poszt (kép + szöveg) | ✅ |
| Ütemezett posztolás (background worker) | ✅ |
| AI tartalomgenerálás (Gemini) | ✅ |
| Instagram/Facebook analytics | ✅ |
| LinkedIn integráció | 🔲 |

### 5.3 AI Tartalomgenerálás

```
Tartalom kérelemrögzítés (cím, típus, kulcsszavak, prompt)
    ↓
AI generálás (Gemini 2.5 Flash)
    ↓
Draft státusz → szerkesztés
    ↓
Jóváhagyás → "approved"
    ↓
Ütemezés vagy azonnali publikálás
    ↓
Multi-platform publikálás (IG + FB)
    ↓
Engagement tracking
```

---

## 6. Admin Dashboard

### 6.1 Fő menüpontok

A `web_server.py` alapján az admin dashboard az alábbi szekciókból áll:

| Szekció | Funkció |
|---|---|
| **Analitika** | Hívásvolumen, csatorna-eloszlás, átlagos idő, interakciós statisztikák |
| **Ügyfélközpont** | Interakciós lista, ügyféllista, kanban érdeklődőkezelés |
| **Naptár** | Időpontok kezelése, orvos- és telephely-specifikus nézet |
| **Kimenő kommunikáció** | Kampányok, automatizmusok, jóváhagyási várósor |
| **Tudástár** | Alapbeállítások, céginformáció, szabályok, GYIK |
| **EAISY Marketing** | Email kampányok, social media, AI tartalom |

### 6.2 Hitelesítés

- Admin felhasználók kezelése (`admin_users` tábla)
- Password hash-elés
- Session-alapú auth
- CORS policy: `thinkai.hu`, `www.thinkai.hu`, `localhost:3000/8000`

---

## Kereszthivatkozások

| Téma | Dokumentum |
|---|---|
| API végpontok | [API Referencia](../architecture/api_reference.md) |
| Adatmodell | [Data Model](../architecture/data_model.md) |
| Rendszerkomponensek | [System Components](../architecture/system_components.md) |
| Telepítés | [Deployment](../production/deployment.md) |
