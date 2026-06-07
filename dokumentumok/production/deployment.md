# Telepítés és Deployment

> **Projekt:** ThinkAI Voice Agent  
> **Visszautalás:** [Production Áttekintés](overview.md) | [Főáttekintés](../overview.md)

---

## 1. Docker-alapú deployment

### 1.1 Dockerfile

A rendszer `python:3.12-slim` alapú Docker image-et használ.

**Építési lépések:**
```dockerfile
FROM python:3.12-slim

# Rendszerfüggőségek: bash, ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends bash ffmpeg

# Requirements telepítés (layer cache)
COPY thinkai-voice-agent/requirements.txt ./requirements.txt
# Windows-specifikus csomagok kiszűrése Linux build-hez
RUN grep -viE "^(pyreadline3|win32_setctime|sounddevice|colorama)" requirements.txt > /tmp/req-linux.txt
RUN pip install --no-cache-dir -r /tmp/req-linux.txt

# Alkalmazás kód
COPY thinkai-voice-agent/ ./

# Windows CRLF javítás
RUN sed -i 's/\r$//' start.sh

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

CMD ["bash", "start.sh", "start"]
```

**Fontos megjegyzések:**
- A `requirements.txt`-ből automatikusan kiszűri a Windows-specifikus csomagokat
- A `start.sh` CRLF-eit LF-re konvertálja (Windows fejlesztés → Linux futtatás)
- A health check 15s start period-ot ad az induláshoz

### 1.2 Docker Compose

```yaml
services:
  thinkai-agent:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: thinkai-agent
    restart: unless-stopped
    ports:
      - "8000:8000"
    env_file:
      - thinkai-voice-agent/.env
    volumes:
      - agent-data:/app/data
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  agent-data:
```

**Konfigurációs elemek:**
- `restart: unless-stopped` — automatikus újraindítás crash esetén
- `env_file` — környezeti változók a `.env` fájlból
- `agent-data` volume — perzisztens adat (ha szükséges)
- Log rotáció: max 10MB × 3 fájl

---

## 2. Railway deployment

A Railway platform támogatása is be van konfigurálva:

```toml
# railway.toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 60
```

---

## 3. Szerver műveletek

### 3.1 Indítás

**Production indítás (Docker):**
```bash
docker compose up -d --build
```

**Fejlesztői indítás (lokális):**
```bash
cd thinkai-voice-agent
python server.py dev    # Agent worker (hot-reload)
python web_server.py    # Web server (külön terminálban)
```

**Egységes indítás (start.sh):**
```bash
./start.sh         # production mód
./start.sh dev     # fejlesztői mód (hot-reload)
```

A `start.sh` két folyamatot indít párhuzamosan:
1. `python3 server.py "$MODE"` — Agent worker
2. `python3 web_server.py` — Web server

Graceful shutdown: `trap cleanup EXIT INT TERM` — mindkét folyamatot leállítja.

### 3.2 Frissítés

Az `update.sh` script automatizálja a deploy-t:

```bash
bash update.sh           # Git pull + Docker rebuild
bash update.sh logs      # Logok megtekintése
bash update.sh stop      # Leállítás
bash update.sh restart   # Újraindítás
bash update.sh status    # Státusz
```

**Frissítési folyamat (`update` parancs):**
1. `git pull` — legújabb kód letöltése
2. `docker compose up -d --build` — rebuild + restart
3. Ha létezik `../ugyfelszolg` — az is rebuild-eli
4. `docker image prune -f` — régi image-ek törlése
5. Státusz kijelzés

### 3.3 Leállítás

```bash
docker compose down      # Konténer leállítás
# vagy
bash update.sh stop
```

---

## 4. Fájlstruktúra a szerveren

```
/app/                              # Docker WORKDIR
├── server.py                      # Agent worker
├── web_server.py                  # FastAPI server
├── tools.py                       # AI eszközök
├── database.py                    # Supabase adatréteg
├── prompt_utils.py                # System prompt builder
├── email_processor.py             # Email feldolgozás
├── social_media.py                # Instagram/Facebook API
├── brevo_campaigns.py             # Brevo email API
├── system_prompt.md               # Prompt sablon
├── knowledge.json                 # Tudásbázis
├── praxisinfo.json                # Rendelő konfiguráció
├── agent_settings.json            # Agent beállítások
├── voice-widget.html              # Webchat widget
├── start.sh                       # Indító script
├── requirements.txt               # Python függőségek
└── data/                          # Persistent volume mount
```

---

## 5. Hálózati követelmények

### Kimenő kapcsolatok (a szerver felől)

| Cél | Protokoll | Port | Megjegyzés |
|---|---|---|---|
| LiveKit Cloud | WSS | 443 | Agent ↔ LiveKit kommunikáció |
| Supabase | HTTPS | 443 | Adatbázis műveletek |
| Gemini API | HTTPS | 443 | LLM kérések |
| Soniox API | HTTPS/WSS | 443 | STT streaming |
| Cartesia API | HTTPS | 443 | TTS kérések |
| Brevo API | HTTPS | 443 | Email küldés |
| Meta Graph API | HTTPS | 443 | Messenger/Instagram/FB |
| Telnyx | SIP/TCP | 5060 | Telefónia (LiveKit kezeli) |
| Open-Meteo | HTTPS | 443 | Időjárás API |

### Bejövő kapcsolatok

| Forrás | Port | Végpont | Megjegyzés |
|---|---|---|---|
| Böngészők | 8000 | `/*` | Widget, admin dashboard |
| Meta Webhook | 8000 | `/api/webhook/meta` | Messenger/Instagram üzenetek |
| Health check | 8000 | `/api/health` | Docker/Railway health |

---

## 6. Python függőségek

### Fő függőségek (requirements.txt — 150 csomag)

| Kategória | Csomagok |
|---|---|
| **LiveKit** | livekit==1.1.8, livekit-agents==1.5.16, livekit-api==1.1.0 |
| **LLM** | google-genai==1.66.0, openai==2.24.0, anthropic==0.49.0 |
| **STT plugins** | livekit-plugins-deepgram, livekit-plugins-soniox, livekit-plugins-google |
| **TTS plugins** | livekit-plugins-cartesia, livekit-plugins-elevenlabs |
| **VAD** | livekit-plugins-silero |
| **Web** | fastapi==0.127.1, uvicorn==0.41.0, starlette==0.50.0 |
| **HTTP** | httpx==0.28.1, requests==2.32.5 |
| **Adatbázis** | supabase, pandas, openpyxl |
| **AI/ML** | transformers==5.2.0, numpy==2.2.6, onnxruntime==1.23.2 |
| **Logging** | loguru==0.7.3, coloredlogs==15.0.1 |
| **Utils** | python-dotenv==1.2.1, pydantic==2.12.5, PyJWT==2.11.0 |

---

## Kereszthivatkozások

| Téma | Dokumentum |
|---|---|
| Környezeti változók | [Environment Variables](environment_variables.md) |
| Monitoring | [Monitoring és Operations](monitoring_and_operations.md) |
| SETUP.md parancsok | [`SETUP.md`](../../SETUP.md) |
| Docker fájl | [`Dockerfile`](../../Dockerfile) |
