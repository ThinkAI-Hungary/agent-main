# Környezeti Változók és Konfigurációk

> **Projekt:** ThinkAI Voice Agent  
> **Visszautalás:** [Production Áttekintés](overview.md) | [Főáttekintés](../overview.md)

---

## 1. Környezeti változók (.env)

A `.env` fájl a `thinkai-voice-agent/` mappában található. A Docker Compose innen olvassa be.

### 1.1 Kötelező változók

| Változó | Leírás | Példa |
|---|---|---|
| `LIVEKIT_URL` | LiveKit Cloud WSS endpoint | `wss://thinkai-ugyfelszolgalat-f05w09v7.livekit.cloud` |
| `LIVEKIT_API_KEY` | LiveKit Cloud API kulcs | `APxxxxxxxx` |
| `LIVEKIT_API_SECRET` | LiveKit Cloud API secret | `xxxxxxxxxxxxxx` |
| `SONIOX_API_KEY` | Soniox STT API kulcs | `xxxxxxxxxxxxxx` |
| `GOOGLE_API_KEY` | Google Gemini LLM API kulcs | `AIzaSy...` |
| `CARTESIA_API_KEY` | Cartesia TTS API kulcs | `sk-cart-...` |
| `BREVO_API_KEY` | Brevo email API kulcs (base64 vagy raw) | `xkeysib-...` vagy base64 |
| `SUPABASE_URL` | Supabase projekt URL | `https://xxxxxxxx.supabase.co` |
| `SUPABASE_KEY` | Supabase anon key | `eyJhbGciOiJIUzI1NiIs...` |

### 1.2 Opcionális változók

| Változó | Leírás | Alapértelmezett |
|---|---|---|
| `SIP_OUTBOUND_TRUNK_ID` | Telnyx outbound SIP trunk ID | `ST_8r89G8rStSNp` |
| `CARTESIA_VOICE_ID` | Fallback hang ID (ha nem JSON-ből jön) | — |
| `PORT` | Web server port | `8000` |
| `META_PAGE_ACCESS_TOKEN` | Meta Page Access Token (Messenger/IG) | — |
| `META_VERIFY_TOKEN` | Meta Webhook ellenőrzési token | — |
| `META_INSTAGRAM_TOKEN` | Instagram Content Publishing API token | — |
| `META_FB_POST_TOKEN` | Facebook Page Publishing token | — |
| `IMAP_SERVER` | Email IMAP szerver | — |
| `IMAP_USER` | Email IMAP felhasználó | — |
| `IMAP_PASS` | Email IMAP jelszó | — |
| `ADMIN_PASSWORD` | Alapértelmezett admin jelszó | — |
| `TELNYX_API_KEY` | Telnyx API kulcs (SIP setup-hoz) | — |

### 1.3 Brevo API kulcs titkosítás

A Brevo API kulcs két formátumot támogat:

```python
# 1. Közvetlen kulcs (ajánlott)
BREVO_API_KEY=xkeysib-xxxxxxxxxxxx

# 2. Base64 kódolt JSON (kompatibilitás)
BREVO_API_KEY=eyJhcGlfa2V5IjoieGtleXNpYi14eHh4eHh4eHh4eHgifQ==
# → dekódolva: {"api_key": "xkeysib-xxxxxxxxxxxx"}
```

A dekódolás automatikus (`brevo_campaigns.py:_get_brevo_key()`):
```python
raw = os.getenv("BREVO_API_KEY", "")
if raw and not raw.startswith("xkeysib-"):
    decoded = base64.b64decode(raw).decode()
    return json.loads(decoded).get("api_key", raw)
```

---

## 2. Konfigurációs fájlok

### 2.1 agent_settings.json

Runtime beállítások az AI agenthez. Az admin dashboard-on szerkeszthető.

```json
{
  "voice_id": "36e0c00b-1bfd-4ad7-a0e8-928d4cadca00",
  "tone": "professional_friendly",
  "tone_custom": "",
  "knowledge_format": "json",
  "greeting": "Szia! A FogBox virtuális asszisztense vagyok...",
  "business_hours": {
    "monday": { "open": "09:00", "close": "17:00", "enabled": true },
    "tuesday": { "open": "09:00", "close": "17:00", "enabled": true },
    ...
    "saturday": { "open": null, "close": null, "enabled": false },
    "sunday": { "open": null, "close": null, "enabled": false }
  }
}
```

| Mező | Leírás |
|---|---|
| `voice_id` | Cartesia TTS hang azonosító |
| `tone` | Hangnem: `professional_friendly`, `warm`, stb. |
| `greeting` | Agent üdvözlő mondata |
| `business_hours` | Nyitvatartás napokra bontva |
| `knowledge_format` | Tudásbázis formátuma (json) |

### 2.2 praxisinfo.json

Rendelő/cég specifikus konfiguráció. Az admin dashboard-on szerkeszthető.

```json
{
  "practice_name": "Példa Rendelő",
  "markanev": "FogBox",
  "szakterulet": "fogászat",
  "address": "Budapest, Példa utca 1.",
  "megkozelites": "M3 metró Ferenciek tere megálló",
  "kulcsszavak": "fogászat, implantátum",
  "price_list": "Konzultáció - 15000 - HUF\n...",
  "doctors": [],
  "campaigns": [
    { "active": true, "text": "Tavaszi akció: 20% kedvezmény..." }
  ],
  "exceptions": [],
  "faq": [
    { "question": "Mennyi idővel előre kell foglalni?", "answer": "1-2 héttel..." }
  ],
  "modositas_eng": "igen",
  "lemondas_24h": "figyelmeztetoSzoveggel",
  "figyelmezteto_szoveg": "24 órán belüli lemondás...",
  "pacient_id_question": "Korábban járt már a rendelőnkben?",
  "new_patient_required": "Teljes név",
  "new_patient_auto_visit": false,
  "returning_patient_required": "Páciens azonosító vagy telefonszám"
}
```

| Szekció | Leírás |
|---|---|
| **Alapadatok** | Rendelő neve, címe, szakterülete |
| **Árlista** | Szolgáltatások árai (szöveg formátum) |
| **Orvosok** | Orvosok listája (szintén Supabase-ből) |
| **Kampányok** | Aktív promóciók |
| **Kivételek** | Emberi beavatkozást igénylő esetek |
| **GYIK** | Gyakran Ismételt Kérdések |
| **Lemondási szabályzat** | Időpont lemondás/módosítás szabályok |
| **Páciens azonosítás** | Új/visszatérő páciens kezelési szabályok |

### 2.3 knowledge.json

Tudásbázis a ThinkAI-ról (vagy az ügyfél cégéről). Key-value formátumú.

```json
{
  "rolunk": "A ThinkAI Kft. egy magyar AI automatizációs cég...",
  "pillerek": "Három pillér: egyedi fejlesztés, AI-ügyfélszolgálat, EAISY...",
  "hogyan_dolgozunk": "Két út létezik...",
  "pricing": "Az árazás projektfüggő...",
  "palyazat": "Akár 200 millió forint...",
  ...
}
```

A `lookup_info` tool fuzzy kereséssel keresi a releváns választ a kulcsszavak alapján.

### 2.4 system_prompt.md

Sablon a rendszer prompthoz. A `prompt_utils.py` tölti ki a változókat:

**Elérhető változók:**
- `{today}` — mai dátum
- `{practice_name}` — rendelő neve
- `{address}` — cím
- `{markanev}` — márkanév
- `{doctors}` — orvosok listája (Supabase-ből)
- `{services_list}` — szolgáltatások (Supabase-ből)
- `{campaigns}` — aktív kampányok
- `{exceptions}` — kivételek
- `{business_hours}` — nyitvatartás
- `{knowledge}` — tudásbázis
- `{price_list}` — árlista
- `{faq}` — GYIK
- `{patient_rules}` — páciens azonosítási szabályok
- `{cancellation_policy}` — lemondási szabályzat
- `{tone}` — hangnem
- `{clinics_prompt}` — telephelyek

---

## 3. Telnyx SIP konfiguráció

### Trunk ID-k

| Trunk | ID | Irány | Beállítások |
|---|---|---|---|
| **Inbound** | `ST_ef3HCCiTmxfv` | Telnyx → LiveKit | Krisp + HD Voice |
| **Outbound** | `ST_8r89G8rStSNp` | LiveKit → Telnyx | TCP + SRTP + HD Voice |
| **Dispatch Rule** | `SDR_KjoiKH4icXeX` | Auto-dispatch | Agent: `dobozos-ai` |

### Audio minőség beállítások

| Beállítás | Érték | Miért |
|---|---|---|
| **Codec** | G.722 (16kHz wideband) | 2× jobb minőség mint G.711 |
| **Transport** | TCP | Megbízható, nincs csomagvesztés |
| **Krisp** | Engedélyezve (inbound) | AI zajszűrés |
| **SRTP** | Allow | Titkosított média |

### Telefonszám

- **Magyar szám:** +3612114217
- **Hívás irány:** Bejövő → Telnyx SIP → LiveKit Cloud → Agent Worker

---

## 4. Meta hardcoded ID-k

A `social_media.py`-ban hardcoded Meta API azonosítók:

| ID | Érték | Leírás |
|---|---|---|
| `IG_USER_ID` | `26530155976686869` | Instagram Business Account (we_are_thinkai) |
| `FB_PAGE_ID` | `260528583811764` | Facebook Page (Think AI) |
| API verzió | `v19.0` | Meta Graph API verzió |

> ⚠️ **Figyelmeztetés:** Ezek hardcoded értékek, ami nem ideális multi-tenant környezetben. Érdemes környezeti változóba mozgatni.

---

## Kereszthivatkozások

| Téma | Dokumentum |
|---|---|
| Deployment részletek | [Deployment](deployment.md) |
| Külső szolgáltatások | [External Services](external_services.md) |
| Rendszerkomponensek | [System Components](../architecture/system_components.md) |
