# API Referencia

> **Projekt:** ThinkAI Voice Agent  
> **Visszautalás:** [Architecture Áttekintés](overview.md) | [Főáttekintés](../overview.md)

---

## Áttekintés

Összes REST API végpont a `web_server.py` (FastAPI) alapján. A szerver a `PORT` env var-on (alapértelmezett: 8000) fut.

---

## 1. Publikus API (`/api/`)

### Health & Token

| Metódus | Végpont | Leírás | Auth |
|---|---|---|---|
| GET | `/api/health` | Health check | — |
| GET | `/api/token` | LiveKit room token generálás | — |
| POST | `/api/session/end` | Session lezárás (widget) | — |

### Meta Webhook

| Metódus | Végpont | Leírás | Auth |
|---|---|---|---|
| GET | `/api/webhook/meta` | Webhook verification (hub.challenge) | META_VERIFY_TOKEN |
| POST | `/api/webhook/meta` | Bejövő Messenger/Instagram üzenetek | — |

### Statikus fájlok

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/` | Admin dashboard (HTML) |
| GET | `/widget` | Voice widget (HTML) |
| GET | `/thinkai-logo.png` | Logó |
| GET | `/eaisydesk_logo.png` | EAISY Desk logó |
| GET | `/login-bg.jpg` | Login háttérkép |

---

## 2. Admin API (`/admin/api/`)

### Beállítások

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/admin/api/settings` | Agent beállítások lekérése |
| POST | `/admin/api/settings` | Agent beállítások mentése |
| GET | `/admin/api/praxisinfo` | Rendelő konfiguráció lekérése |
| POST | `/admin/api/praxisinfo` | Rendelő konfiguráció mentése |

### Ügyfelek (Clients)

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/admin/api/clients` | Ügyfelek listázása |
| POST | `/admin/api/clients` | Új ügyfél létrehozása |
| PUT | `/admin/api/clients/{id}` | Ügyfél frissítése |
| DELETE | `/admin/api/clients/{id}` | Ügyfél törlése |
| POST | `/admin/api/clients/import` | Tömeges ügyfél import (Excel) |
| GET | `/admin/api/clients/export` | Ügyfélexport (Excel) |

### Kanban / CRM

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/admin/api/kanban/columns` | Kanban oszlopok |
| POST | `/admin/api/kanban/columns` | Kanban oszlopok mentése |
| POST | `/admin/api/clients/{id}/kanban` | Ügyfél áthelyezése kanban oszlopba |
| GET | `/admin/api/client-fields` | Egyedi mezők listázása |
| POST | `/admin/api/client-fields` | Egyedi mezők mentése |

### Interakciók

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/admin/api/interactions` | Interakciók listázása |
| GET | `/admin/api/interactions/{id}` | Egy interakció részletei |

### Naptár

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/admin/api/calendar` | Naptáresemények listázása |
| POST | `/admin/api/calendar` | Új esemény létrehozása |
| PUT | `/admin/api/calendar/{id}` | Esemény frissítése |
| DELETE | `/admin/api/calendar/{id}` | Esemény törlése |

### Orvosok

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/admin/api/doctors` | Orvosok listázása |
| POST | `/admin/api/doctors` | Új orvos hozzáadása |
| PUT | `/admin/api/doctors/{id}` | Orvos frissítése |
| DELETE | `/admin/api/doctors/{id}` | Orvos törlése |

### Szolgáltatások

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/admin/api/services` | Szolgáltatások listázása |
| POST | `/admin/api/services` | Új szolgáltatás hozzáadása |
| PUT | `/admin/api/services/{id}` | Szolgáltatás frissítése |
| DELETE | `/admin/api/services/{id}` | Szolgáltatás törlése |

### Telephelyek (Clinics)

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/admin/api/clinics` | Telephelyek listázása |
| POST | `/admin/api/clinics` | Telephelyek mentése (bulk) |

### Kampányok

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/admin/api/campaigns` | Kampányok listázása |
| POST | `/admin/api/campaigns` | Új kampány létrehozása |
| POST | `/admin/api/campaigns/{id}/start` | Kampány indítása |
| DELETE | `/admin/api/campaigns/{id}` | Kampány törlése |

### Kimenő automatizmusok

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/admin/api/outbound-automations` | Automatizmusok listázása |
| PUT | `/admin/api/outbound-automations/{id}` | Automatizmus frissítése |

### Jóváhagyások (Approvals)

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/admin/api/approvals` | Jóváhagyásra váró tételek |
| POST | `/admin/api/approvals/{id}/approve` | Jóváhagyás |
| POST | `/admin/api/approvals/{id}/reject` | Elutasítás |
| DELETE | `/admin/api/approvals` | Jóváhagyások törlése |

### Emlékeztetők

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/admin/api/reminder-settings` | Emlékeztető beállítások |
| POST | `/admin/api/reminder-settings` | Emlékeztető beállítások mentése |

### SIP / Telefónia

| Metódus | Végpont | Leírás |
|---|---|---|
| POST | `/admin/api/sip/call` | Kimenő SIP hívás indítása |

### Analitika

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/admin/api/analytics/summary` | Összesített dashboard KPI |
| GET | `/admin/api/analytics/daily` | Napi bontás |
| GET | `/admin/api/analytics/weekly` | Heti bontás |
| GET | `/admin/api/analytics/monthly` | Havi bontás |
| GET | `/admin/api/analytics/channels` | Csatorna-eloszlás |
| GET | `/admin/api/analytics/types` | Interakció típus eloszlás |
| GET | `/admin/api/analytics/funnel` | Tölcsér nézet |

---

## 3. Marketing API (`/marketing/api/`)

### Email kampányok

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/marketing/api/campaigns` | Email kampányok listázása |
| POST | `/marketing/api/campaigns` | Új email kampány |
| GET | `/marketing/api/campaigns/{id}` | Kampány részletei |
| PUT | `/marketing/api/campaigns/{id}` | Kampány frissítése |
| DELETE | `/marketing/api/campaigns/{id}` | Kampány törlése |
| POST | `/marketing/api/campaigns/{id}/send` | Kampány küldés |
| GET | `/marketing/api/campaigns/stats` | Kampány KPI összesítés |

### Email feliratkozók

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/marketing/api/subscribers` | Feliratkozók listázása |
| POST | `/marketing/api/subscribers` | Új feliratkozó |
| GET | `/marketing/api/subscribers/count` | Feliratkozók száma |

### AI tartalom

| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/marketing/api/content` | Tartalmak listázása |
| POST | `/marketing/api/content` | Új tartalom létrehozása |
| PUT | `/marketing/api/content/{id}` | Tartalom frissítése |
| DELETE | `/marketing/api/content/{id}` | Tartalom törlése |
| POST | `/marketing/api/content/{id}/generate` | AI tartalom generálás |
| GET | `/marketing/api/content/stats` | Tartalom statisztikák |

### Social média

| Metódus | Végpont | Leírás |
|---|---|---|
| POST | `/marketing/api/social/publish` | Poszt publikálása (IG/FB/all) |
| POST | `/marketing/api/content/{id}/schedule` | Tartalom ütemezése |
| GET | `/marketing/api/social/instagram/media` | IG legutóbbi posztok |
| GET | `/marketing/api/social/instagram/quota` | IG publikálási kvóta |
| GET | `/marketing/api/social/facebook/posts` | FB legutóbbi posztok |
| GET | `/marketing/api/social/analytics` | Social analytics összesítés |

---

## 4. Hitelesítés

### Admin API hitelesítés

Az admin API végpontok session-alapú hitelesítést használnak:

```
POST /admin/api/login
Body: { "username": "admin", "password": "..." }
→ Set-Cookie: session_id=...

POST /admin/api/logout
→ Clear cookie
```

### CORS konfiguráció

Engedélyezett origin-ek:
- `https://thinkai.hu`
- `https://www.thinkai.hu`
- `http://localhost:3000`
- `http://localhost:8000`

---

## 5. Válasz formátumok

### Sikeres válasz
```json
{
  "success": true,
  "data": { ... }
}
```

### Hiba válasz
```json
{
  "error": "Hibaüzenet",
  "detail": "Részletes leírás"
}
```

### Lista válasz
```json
[
  { "id": 1, "name": "..." },
  { "id": 2, "name": "..." }
]
```

---

## Kereszthivatkozások

| Téma | Dokumentum |
|---|---|
| Adatmodell | [Data Model](data_model.md) |
| Rendszerkomponensek | [System Components](system_components.md) |
| Deployment | [Deployment](../production/deployment.md) |
