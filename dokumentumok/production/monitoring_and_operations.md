# Monitoring és Üzemeltetés

> **Projekt:** ThinkAI Voice Agent  
> **Visszautalás:** [Production Áttekintés](overview.md) | [Főáttekintés](../overview.md)

---

## 1. Health Check

### Endpoint

```
GET /api/health
```

**Docker health check konfiguráció:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1
```

**Railway health check:**
```toml
[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 60
```

| Paraméter | Érték |
|---|---|
| Intervallum | 30 másodperc |
| Timeout | 5 másodperc |
| Start period | 15 másodperc |
| Retries | 3 sikertelen próba → unhealthy |

---

## 2. Logolás

### 2.1 Logging keretrendszer

A rendszer a **Loguru** könyvtárat használja:

```python
from loguru import logger

logger.info("IG post published successfully!")
logger.error(f"Error fetching campaigns: {e}")
logger.warning(f"Could not read agent_settings.json: {e}")
```

### 2.2 Log szintek és használatuk

| Szint | Használat |
|---|---|
| `INFO` | Sikeres műveletek (email küldve, poszt publikálva, stb.) |
| `WARNING` | Nem kritikus problémák (hiányzó konfig, fallback aktiválás) |
| `ERROR` | Hibák (API hívás sikertelen, DB művelet sikertelen) |
| `DEBUG` | Részletes debug info (Meta API válaszok, stb.) |

### 2.3 Log tárolás

**Docker log driver:**
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

**Log megtekintés:**
```bash
# Valós idejű logok
docker compose logs -f --tail=100

# update.sh-vel
bash update.sh logs
```

### 2.4 Egyéb log kimenetek

Bizonyos modulok `print()` utasításokat is használnak (nem Loguru):
- `web_server.py` — `print(f"[Meta API DEBUG] ...")`
- `server.py` — `print("META_WEBHOOK_VERIFIED")`

> ⚠️ **Technikai adósság:** Érdemes lenne az összes `print()` hívást `logger.*` hívásra cserélni a konzisztens logolás érdekében.

---

## 3. Monitoring metrikák

### 3.1 Elérhető analitikai adatok

A rendszer az alábbi metrikákat tárolja a Supabase-ben:

**Hívási/interakciós metrikák (web_server.py analytics endpointok):**
- Összes hívás száma (sessions tábla)
- Átlagos hívási idő (duration_seconds)
- Csatorna-eloszlás (interactions.type)
- Interakció típusok (ügytípus eloszlás)
- Napi/heti/havi trendek
- Funnel stage eloszlás

**CRM metrikák:**
- Ügyfelek száma (összes, új, aktív)
- Kanban oszlop szerinti eloszlás
- Címke-eloszlás

**Marketing metrikák:**
- Email kampány statisztikák (open rate, CTR, bounce, unsubscribe)
- Social média engagement (likes, comments, reach)
- AI tartalom statisztikák (draft, approved, published)

### 3.2 Analitika API végpontok

```
GET /admin/api/analytics/summary         — Összesített dashboard
GET /admin/api/analytics/daily            — Napi bontás
GET /admin/api/analytics/weekly           — Heti bontás
GET /admin/api/analytics/monthly          — Havi bontás
GET /admin/api/analytics/channels         — Csatorna-eloszlás
GET /admin/api/analytics/types            — Interakció típusok
GET /admin/api/analytics/funnel           — Tölcsér nézet
GET /marketing/api/campaigns/stats        — Email kampány KPI
GET /marketing/api/social/analytics       — Social media analytics
```

---

## 4. Hibaelhárítás

### 4.1 Gyakori problémák

| Probléma | Oka | Megoldás |
|---|---|---|
| Agent nem indul | Hiányzó env var (LIVEKIT_URL, stb.) | Ellenőrizd a `.env` fájlt |
| Nincs hang a hívásban | Cartesia API kulcs lejárt | Frissítsd a `CARTESIA_API_KEY`-t |
| Widget nem tölt be | CORS hiba | Ellenőrizd az engedélyezett origineket |
| Email nem megy ki | Brevo API kulcs hibás | Ellenőrizd a base64 dekódolást |
| Messenger nem kap üzenetet | Meta webhook nem konfigurált | Ellenőrizd a `META_VERIFY_TOKEN`-t |
| DB műveletek sikertelenek | Supabase URL/key hibás | Ellenőrizd a `SUPABASE_URL` és `SUPABASE_KEY` |
| Időpont nem foglalható | Nyitvatartás nincs beállítva | Ellenőrizd az `agent_settings.json`-t |

### 4.2 Debug eszközök

**Szerver státusz:**
```bash
bash update.sh status
# → docker compose ps + utolsó 20 log sor
```

**Interaktív shell a konténerben:**
```bash
docker exec -it thinkai-agent bash
python -c "import database; print(database.get_clients()[:3])"
```

**API tesztelés:**
```bash
curl http://localhost:8000/api/health
curl http://localhost:8000/admin/api/analytics/summary
```

### 4.3 Graceful shutdown

A `start.sh` trap mechanizmussal biztosítja a tiszta leállítást:

```bash
cleanup() {
    echo "🛑 Shutting down..."
    kill $AGENT_PID $WEB_PID 2>/dev/null || true
    wait $AGENT_PID $WEB_PID 2>/dev/null || true
    echo "Done."
}
trap cleanup EXIT INT TERM
```

---

## 5. Backup stratégia

### 5.1 Jelenlegi állapot

| Adat | Backup módszer | Gyakoriság |
|---|---|---|
| **Üzleti adatok (Supabase)** | Supabase beépített backup | Automatikus (Supabase kezelés) |
| **Konfigurációs fájlok** | Git verziókezelés | Push-onként |
| **Docker image** | Build-elés forráskódból | Deploy-onként |
| **Logok** | Docker rotáció (10MB × 3) | Nem backup-olt |

### 5.2 Ajánlott fejlesztések

- 🔲 Supabase napi export (pg_dump) külső tárhelyre
- 🔲 Konfiguráció backup (agent_settings.json, praxisinfo.json) automatikus
- 🔲 Log aggregáció (Loki, CloudWatch, stb.)
- 🔲 Uptime monitoring (UptimeRobot, Better Uptime)

---

## Kereszthivatkozások

| Téma | Dokumentum |
|---|---|
| Deployment | [Deployment](deployment.md) |
| API végpontok | [API Referencia](../architecture/api_reference.md) |
| Környezeti változók | [Environment Variables](environment_variables.md) |
