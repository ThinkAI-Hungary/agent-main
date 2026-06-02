# ThinkAI Voice Agent — Technical Documentation

> **Last updated:** 2026-06-02  
> **Framework:** LiveKit Agents v1.4.4  
> **Status:** Production — DigitalOcean deployment, Telnyx telephony

---

## Architecture

```
┌──────────────┐        ┌──────────────────────┐        ┌───────────────┐
│  Browser     │  WS/   │  LiveKit Cloud       │  WS    │  Agent Worker │
│  (widget)    │◄─────► │  (WebRTC relay)      │◄──────►│  (server.py)  │
│              │  WebRTC│  Germany 2 region     │        │               │
└──────┬───────┘        └─────────┬────────────┘        └───────┬───────┘
       │ HTTP                     │                             │
       ▼                          │ SIP                         │
┌──────────────┐        ┌────────┴──────────┐                  │
│  Web Server  │        │  Telnyx           │                  │
│  (web_server)│        │  +3612114217      │                  │
│  :8000       │        │  SIP ↔ LiveKit    │                  │
└──────────────┘        │  (direct, no      │                  │
       │                │   Asterisk bridge) │                  │
       ▼                └───────────────────┘                  │
┌──────────────┐                                               │
│  SQLite DB   │◄──────────────────────────────────────────────┘
│  database.db │  (tools, sessions, interactions)
└──────────────┘
       │
       ▼
┌─────────────────────────────┐
│  External Services          │
│  ├─ Soniox STT (stt-rt-v4) │
│  ├─ Gemini 2.5 Flash (LLM) │
│  ├─ Cartesia TTS (sonic-3) │
│  ├─ Silero VAD             │
│  ├─ Brevo (email sending)  │
│  └─ Open-Meteo (weather)   │
└─────────────────────────────┘
```

**Two processes** run in parallel:
1. `server.py` — LiveKit agent worker (connects to LiveKit Cloud via WebSocket)
2. `web_server.py` — FastAPI (serves admin dashboard + REST API + widget)

`start.sh` launches both from a single command.

---

## Telephony — Telnyx Direct Integration

### Inbound Calls (PSTN → Agent)

```
Caller dials +3612114217
        │
        ▼
Telnyx SIP → LiveKit Cloud (direct)
        │
        ▼
LiveKit Dispatch Rule (SDR_KjoiKH4icXeX)
  → auto-creates room "call-{id}"
  → auto-dispatches "dobozos-ai"
        │
        ▼
Agent Worker (server.py) joins room
```

No Asterisk bridge, no `lk_trigger.py` — Telnyx sends SIP INVITEs directly to LiveKit Cloud,
which auto-dispatches the agent via the configured dispatch rule.

### Outbound Calls (Agent → PSTN)

3 trigger paths, all use the same LiveKit API pattern:

1. **Manual** — `POST /admin/api/sip/call` (admin dashboard)
2. **Approved draft** — Approval system with `channel: "telefon"`
3. **Phone campaign** — `_run_phone_campaign()` bulk calls

All create: Room → SIP Participant (via Telnyx outbound trunk) → Agent Dispatch.

### Trunk IDs

| Trunk | ID | Purpose |
|-------|-----|---------|
| Inbound (Telnyx → LiveKit) | `ST_ef3HCCiTmxfv` | Receiving calls (Krisp + HD Voice) |
| Outbound (LiveKit → Telnyx) | `ST_8r89G8rStSNp` | Making calls (TCP + SRTP + HD Voice) |
| Dispatch Rule | `SDR_KjoiKH4icXeX` | Auto-dispatch agent |

### Audio Quality Optimizations

| Setting | Value | Why |
|---------|-------|-----|
| **Codec** | G.722 (16kHz wideband) | 2× the sample rate of G.711, dramatically clearer voice |
| **Transport** | TCP | Reliable delivery, no packet loss (Telnyx recommended) |
| **Krisp** | Enabled (inbound) | AI noise cancellation for incoming callers |
| **SRTP** | Allow | Encrypted media stream when both sides support it |
| **X-Telnyx-Username** | Set | Ensures proper SIP digest auth, prevents misrouted calls |

---

## File Structure

```
thinkai-voice-agent/
├── server.py              # LiveKit agent worker (STT → LLM → TTS pipeline)
├── web_server.py          # FastAPI web server (admin + widget + REST API)
├── tools.py               # 9 function tools the agent can call
├── prompt_utils.py        # Dynamic system prompt builder
├── system_prompt.md       # System prompt template
├── database.py            # SQLite database layer
├── email_processor.py     # Reminder & automation workers
├── voice-widget.html      # Browser voice widget (embedded)
├── start.sh               # Single-command launcher for both processes
├── setup_telnyx_trunk.py  # Telnyx SIP trunk setup utility
├── agent_settings.json    # Runtime voice/tone/greeting settings
├── praxisinfo.json        # Practice configuration
├── requirements.txt       # Python dependencies
└── AGENT_DOCS.md          # This file
```

---

## Components

### 1. Agent Worker (`server.py`)

| Component | Provider | Config |
|-----------|----------|--------|
| **STT** | Soniox | Model: `stt-rt-v4`, language: `hu` |
| **LLM** | Google | Model: `gemini-2.5-flash` |
| **TTS** | Cartesia | Model: `sonic-3`, speed: `1.0`, language: `hu` |
| **VAD** | Silero | threshold: `0.85`, min_speech: `0.4s`, min_silence: `0.5s` |
| **Noise** | LiveKit BVC | Server-side noise cancellation |

**Agent class:** `ThinkAIAgent(Agent)`
- `min_endpointing_delay`: 0.5s
- `max_endpointing_delay`: 3.0s
- `min_interruption_duration`: 0.5s
- Greeting: configurable via `agent_settings.json`

**Cartesia TTS gotchas:**
- `word_timestamps=False` — not supported for Hungarian
- `speed` must be a **float**, not string
- Use `sonic-3` (sonic-2 is deprecated)

**Startup:**
```bash
python server.py dev    # dev mode (hot-reload)
python server.py start  # production
```

---

### 2. Web Server (`web_server.py`)

**Framework:** FastAPI + Uvicorn

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Serves admin dashboard |
| `/widget` | GET | Serves voice widget |
| `/api/token` | GET | Generates LiveKit room token |
| `/admin/api/settings` | POST | Save agent settings |
| `/admin/api/praxisinfo` | GET/POST | Practice config |
| `/admin/api/sip/call` | POST | Outbound SIP call |
| `/admin/api/campaigns` | GET/POST | Campaign management |
| `/admin/api/approvals` | GET/POST | Approval system |
| `/api/health` | GET | Health check |

**CORS origins:** `thinkai.hu`, `www.thinkai.hu`, `localhost:3000/8000`

---

### 3. Tools (`tools.py`)

| # | Tool | What it does |
|---|------|-------------|
| 1 | `send_followup_email` | Send email via Brevo SMTP API |
| 2 | `check_calendar` | Query upcoming events |
| 3 | `book_meeting` | Create appointment (with conflict detection) |
| 4 | `modify_meeting` | Change date/time/title of existing event |
| 5 | `delete_meeting` | Cancel an appointment |
| 6 | `create_task` | Save a task/note |
| 7 | `get_weather` | Weather via Open-Meteo (15 Hungarian cities) |
| 8 | `lookup_info` | Knowledge base lookup (fuzzy + alias matching) |
| 9 | `report_alert` | Flag urgent/complaint/callback alerts |

---

## Environment Variables (`.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `LIVEKIT_URL` | ✅ | `wss://thinkai-ugyfelszolgalat-f05w09v7.livekit.cloud` |
| `LIVEKIT_API_KEY` | ✅ | LiveKit Cloud API key |
| `LIVEKIT_API_SECRET` | ✅ | LiveKit Cloud API secret |
| `SONIOX_API_KEY` | ✅ | Soniox STT |
| `GOOGLE_API_KEY` | ✅ | Gemini LLM |
| `CARTESIA_API_KEY` | ✅ | Cartesia TTS |
| `BREVO_API_KEY` | ✅ | Email sending (base64-encoded MCP format) |
| `SIP_OUTBOUND_TRUNK_ID` | ❌ | Default: `ST_8r89G8rStSNp` (Telnyx HD Voice) |
| `CARTESIA_VOICE_ID` | ❌ | Fallback voice ID |
| `PORT` | ❌ | Web server port (default: `8000`) |

---

## Data Flow

```
User speaks → Soniox STT → text
                              ↓
                         Gemini 2.5 Flash → response text
                              ↓                    ↓ (if tool call)
                         Cartesia TTS         tools.py writes to
                              ↓               SQLite database
                         Audio → User              ↓
                                              Admin dashboard
                                              updates in real-time
```
