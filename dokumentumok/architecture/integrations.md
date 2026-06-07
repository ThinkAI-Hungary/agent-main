# Külső Integrációk és Protokollok

> **Projekt:** ThinkAI Voice Agent  
> **Visszautalás:** [Architecture Áttekintés](overview.md) | [Főáttekintés](../overview.md)

---

## 1. LiveKit integráció

### 1.1 Agent Worker ↔ LiveKit Cloud

**Protokoll:** WebSocket Secure (WSS)

```
Agent Worker (server.py)
    ↓ WSS
LiveKit Cloud (wss://thinkai-ugyfelszolgalat-f05w09v7.livekit.cloud)
    ↕ WebRTC
Böngésző (widget) / SIP endpoint (Telnyx)
```

**Kapcsolat típusok:**
- **Agent ↔ LiveKit:** WSS (állandó kapcsolat)
- **Widget ↔ LiveKit:** WebRTC (médiastream)
- **Telnyx ↔ LiveKit:** SIP (telefonhívások)

### 1.2 Room token generálás

```python
# web_server.py - /api/token
token = (
    AccessToken(api_key, api_secret)
    .with_identity(participant_name)
    .with_name("Visitor")
    .with_grants(VideoGrants(room_join=True, room=room_name))
    .with_room_config(
        RoomConfiguration(
            agents=[RoomAgentDispatch(agent_name="dobozos-ai")]
        )
    )
)
```

**Folyamat:**
1. Widget kér tokent: `GET /api/token`
2. Server generál: room_name = `thinkai-{uuid}`, participant = `user-{uuid}`
3. Widget csatlakozik a LiveKit Cloud-hoz a tokennel
4. LiveKit dispatch-eli a `dobozos-ai` agentet a roomba

### 1.3 Agent regisztráció

```python
# server.py - entrypoint
cli.run_app(WorkerOptions(
    entrypoint_fnc=entrypoint,
    agent_name="dobozos-ai"
))
```

Az agent `dobozos-ai` néven regisztrálódik, és a dispatch rule (`SDR_KjoiKH4icXeX`) alapján automatikusan hívódik.

---

## 2. Telnyx SIP integráció

### 2.1 Bejövő hívások (PSTN → Agent)

```
Hívó tárcsáz: +3612114217
        ↓
Telnyx SIP INVITE → LiveKit Cloud (direct)
        ↓
LiveKit Dispatch Rule (SDR_KjoiKH4icXeX)
  → Auto-creates room "call-{id}"
  → Auto-dispatches "dobozos-ai"
        ↓
Agent Worker joins room → beszélgetés indul
```

**Nincs Asterisk bridge!** A Telnyx közvetlenül küldi a SIP INVITE-ot a LiveKit Cloud-nak.

### 2.2 Kimenő hívások (Agent → PSTN)

**3 trigger útvonal:**

1. **Manuális** — `POST /admin/api/sip/call` (admin dashboard)
2. **Jóváhagyott draft** — Approval rendszer (`channel: "telefon"`)
3. **Telefon kampány** — `_run_phone_campaign()` tömeges hívás

**Műszaki folyamat:**
```python
# LiveKit API hívás kimenő SIP participant létrehozásához
sip_participant = CreateSIPParticipantRequest(
    sip_trunk_id="ST_8r89G8rStSNp",  # Outbound trunk
    sip_call_to=phone_number,
    room_name=room_name,
    participant_identity="phone-user",
)
```

### 2.3 Audio minőség

| Beállítás | Érték | Indoklás |
|---|---|---|
| Codec | G.722 (16kHz wideband) | 2× jobb mintavétel mint G.711 |
| Transport | TCP | Megbízható, nincs csomagvesztés |
| Krisp | Enabled (inbound) | AI zajszűrés a hívó oldaláról |
| SRTP | Allow | Titkosított média ha mindkét fél támogatja |

---

## 3. Meta Webhook integráció

### 3.1 Webhook verification

```
GET /api/webhook/meta?hub.mode=subscribe&hub.verify_token={token}&hub.challenge={challenge}
```

A Meta elküldi a verification kérést, a szerver ellenőrzi a `META_VERIFY_TOKEN` env var-ral, és visszaküldi a `hub.challenge` értéket.

### 3.2 Bejövő üzenetek feldolgozása

```
POST /api/webhook/meta
Body: {
  "object": "page",
  "entry": [{
    "messaging": [{
      "sender": { "id": "PSID" },
      "message": { "text": "Szia, szeretnék időpontot foglalni" }
    }]
  }]
}
```

**Feldolgozási folyamat:**
```
1. Webhook payload parsing
2. Sender ID kinyerése (PSID/IGSID)
3. Csatorna azonosítás (Messenger vs Instagram)
4. Meta API → felhasználó profil lekérése (név)
5. Ügyfél keresés/létrehozás (meta_psid alapján)
6. AI elemzés:
   a. analyze_alert_tags() → címkézés
   b. AI válaszgenerálás (Gemini)
7. Interakció rögzítés (Supabase)
8. Válasz küldése:
   a. Automatikus válasz (ha engedélyezve)
   b. VAGY: Draft → jóváhagyási várósor
```

### 3.3 Messenger válaszküldés

```python
# Meta Send API
POST https://graph.facebook.com/v25.0/me/messages
Headers: { "Authorization": "Bearer {META_PAGE_ACCESS_TOKEN}" }
Body: {
  "recipient": { "id": "PSID" },
  "message": { "text": "Válasz szövege" }
}
```

### 3.4 Meta profil lekérés

```python
# Felhasználó névlekérése
GET https://graph.facebook.com/v25.0/{sender_id}
  ?fields=first_name,last_name
  &access_token={META_PAGE_ACCESS_TOKEN}
```

Fallback stratégia: először `first_name,last_name`, ha nem jön → `name`.

---

## 4. Instagram Content Publishing API

### 4.1 Kép posztolás (2 lépéses)

```python
# Step 1: Container létrehozás
POST https://graph.instagram.com/v19.0/{IG_USER_ID}/media
Params: { "image_url": "...", "caption": "...", "access_token": "..." }
→ { "id": "container_id" }

# Step 2: Publikálás
POST https://graph.instagram.com/v19.0/{IG_USER_ID}/media_publish
Params: { "creation_id": "container_id", "access_token": "..." }
→ { "id": "media_id" }
```

**Fontos:** A `image_url` KÖTELEZŐEN publikusan elérhető URL kell legyen!

### 4.2 Analytics

```python
# Poszt insights
GET https://graph.instagram.com/v19.0/{media_id}
  ?fields=like_count,comments_count,timestamp,caption,permalink
  &access_token={IG_TOKEN}

# Reach/impressions (business account szükséges)
GET https://graph.instagram.com/v19.0/{media_id}/insights
  ?metric=reach,impressions
  &access_token={IG_TOKEN}
```

---

## 5. Facebook Page Publishing API

### 5.1 Szöveges poszt

```python
POST https://graph.facebook.com/v19.0/{FB_PAGE_ID}/feed
Params: { "message": "...", "access_token": "..." }
```

### 5.2 Képes poszt

```python
POST https://graph.facebook.com/v19.0/{FB_PAGE_ID}/photos
Params: { "url": "image_url", "message": "...", "access_token": "..." }
```

---

## 6. Brevo API integráció

### 6.1 Email küldés (tools.py)

```python
# Tranzakciós email
POST https://api.brevo.com/v3/smtp/email
Headers: { "api-key": "...", "Content-Type": "application/json" }
Body: {
  "sender": { "name": "...", "email": "hello@thinkai.hu" },
  "to": [{ "email": "...", "name": "..." }],
  "subject": "...",
  "htmlContent": "..."
}
```

### 6.2 Kampány kezelés (brevo_campaigns.py)

| Művelet | API Hívás |
|---|---|
| Lista létrehozás | `POST /contacts/lists` |
| Kontakt szinkron | `POST /contacts` (upsert) |
| Tömeges import | `POST /contacts/import` |
| Kampány létrehozás | `POST /emailCampaigns` |
| Azonnali küldés | `POST /emailCampaigns/{id}/sendNow` |
| Ütemezés | `PUT /emailCampaigns/{id}` (scheduledAt) |
| Statisztikák | `GET /emailCampaigns/{id}` |

### 6.3 Statisztika kinyerés

```python
# A Brevo két helyen tárolja a statokat:
statistics = data.get("statistics", {})
global_stats = statistics.get("globalStats", {})  # Összesített

# Ha globalStats üres → fallback: campaignStats aggregáció
campaign_stats_list = statistics.get("campaignStats", [])

# Fontos: megnyitás mező = "uniqueViews" (NEM "uniqueOpens"!)
```

---

## 7. Google Gemini API

### 7.1 Agent LLM (server.py)

A Gemini a LiveKit Agent pipeline részeként fut, a `livekit-plugins-google` csomagon keresztül:

```python
# Gemini Multimodal Live API
model = "gemini-2.5-flash"
# A LiveKit plugin kezeli a streaming kommunikációt
```

### 7.2 Standalone AI hívások (web_server.py)

```python
from google import genai
from google.genai import types

client = genai.Client(api_key=google_key)
resp = await client.aio.models.generate_content(
    model="gemini-2.5-flash",
    contents=f"Üzenet: {message_text}",
    config=types.GenerateContentConfig(
        system_instruction=prompt,
        temperature=0.1
    )
)
```

**Használati helyek:**
- `analyze_alert_tags()` — bejövő üzenetek címkézése
- Email AI feldolgozás
- AI tartalomgenerálás (marketing)
- AI kampány üzenet generálás

---

## 8. Open-Meteo API

```python
# Ingyenes időjárás API (nincs API kulcs)
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lon}
  &current_weather=true
  &hourly=temperature_2m,precipitation
```

**15 előre definiált magyar város:**
Budapest, Debrecen, Szeged, Miskolc, Pécs, Győr, Nyíregyháza, Kecskemét, Székesfehérvár, Szombathely, Szolnok, Érd, Tatabánya, Kaposvár, Sopron

---

## 9. Supabase SDK

### Kapcsolat

```python
from supabase import create_client

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)
```

### Tipikus CRUD minták

```python
# SELECT
res = supabase.table("clients").select("*").order("id", desc=True).limit(100).execute()

# INSERT
res = supabase.table("clients").insert({"name": "...", "email": "..."}).execute()

# UPDATE
supabase.table("clients").update({"status": "aktiv"}).eq("id", 1).execute()

# DELETE
supabase.table("clients").delete().eq("id", 1).execute()

# UPSERT
supabase.table("email_subscribers").upsert(data, on_conflict="email").execute()

# COUNT
res = supabase.table("clients").select("id", count="exact", head=True).execute()

# JOIN (related table)
res = supabase.table("services").select("*, doctors(name)").execute()

# FILTER
res = supabase.table("interactions").select("*").gte("created_at", start).lt("created_at", end).execute()
```

---

## Kereszthivatkozások

| Téma | Dokumentum |
|---|---|
| Külső szolgáltatások | [External Services](../production/external_services.md) |
| API végpontok | [API Referencia](api_reference.md) |
| Rendszerkomponensek | [System Components](system_components.md) |
| Környezeti változók | [Environment Variables](../production/environment_variables.md) |
