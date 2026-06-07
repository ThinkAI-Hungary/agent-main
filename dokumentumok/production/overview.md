# Üzemeltetési Követelmények — Áttekintés

> **Projekt:** ThinkAI Voice Agent  
> **Verzió:** 1.0  
> **Utolsó frissítés:** 2026-06-05

---

## 1. Üzemeltetési összefoglaló

A ThinkAI Voice Agent jelenleg **DigitalOcean VPS-en** üzemel, Docker konténerben. A rendszer két párhuzamos folyamatból áll, amelyeket egyetlen `start.sh` script indít.

### Rendszerkövetelmények

| Követelmény | Érték |
|---|---|
| **OS** | Linux (Docker: python:3.12-slim) |
| **Python** | 3.12 |
| **RAM** | Minimum 2 GB (ajánlott 4 GB) |
| **CPU** | 1+ vCPU |
| **Disk** | ~500 MB (app + dependencies) |
| **Port** | 8000 (HTTP) |
| **Hálózat** | Kimenő HTTPS, WSS, SIP |

### Futó folyamatok

| Folyamat | Leírás | Port |
|---|---|---|
| `server.py` | LiveKit Agent Worker — WSS-en kapcsolódik LiveKit Cloud-hoz | — |
| `web_server.py` | FastAPI Web Server — HTTP REST API + admin dashboard | 8000 |

---

## 2. Dokumentáció navigáció

| Dokumentum | Tartalom |
|---|---|
| [Deployment](deployment.md) | Docker, Railway, szerver konfiguráció, indítás/leállítás |
| [Környezeti Változók](environment_variables.md) | Összes env var, titkosítás, konfigurációs fájlok |
| [Monitoring és Üzemeltetés](monitoring_and_operations.md) | Health check, logolás, backup, hibaelhárítás |
| [Külső Szolgáltatások](external_services.md) | LiveKit, Telnyx, Gemini, Brevo, Meta, Supabase |

---

## 3. Deployment topológia

```
┌─────────────────────────────────────────────────────────┐
│  DigitalOcean VPS                                       │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Docker Container (thinkai-agent)                │    │
│  │                                                   │    │
│  │  ┌──────────────┐    ┌──────────────────────┐   │    │
│  │  │  server.py    │    │  web_server.py       │   │    │
│  │  │  (Agent)      │    │  (FastAPI :8000)     │   │    │
│  │  │              │    │                       │   │    │
│  │  │  WSS ────────┼────┼─→ LiveKit Cloud       │   │    │
│  │  │              │    │                       │   │    │
│  │  └──────────────┘    └──────────────────────┘   │    │
│  │         │                      │                  │    │
│  │         └──────────┬───────────┘                  │    │
│  │                    │                              │    │
│  │            ┌───────▼───────┐                      │    │
│  │            │  Supabase     │  (Cloud PostgreSQL)   │    │
│  │            └───────────────┘                      │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Volume: agent-data → /app/data                         │
│  Port mapping: 8000:8000                                │
│  Logging: json-file (max 10MB × 3)                      │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Kritikus üzemeltetési pontok

### 4.1 Magas rendelkezésre állás

| Szempont | Jelenlegi állapot | Kockázat |
|---|---|---|
| **Redundancia** | Single instance | 🔴 Nincs failover |
| **Auto-restart** | `restart: unless-stopped` (Docker) | 🟢 Automatikus |
| **Health check** | 30s intervallum, 5s timeout | 🟢 Aktív |
| **Graceful shutdown** | `start.sh` trap + cleanup | 🟢 Implementálva |

### 4.2 Háttérfolyamatok (Background Workers)

A `web_server.py` az alábbi háttérfeladatokat indítja `asyncio.create_task()`-kal:

| Worker | Funkció | Ciklus |
|---|---|---|
| `social_publisher_worker` | Ütemezett social média posztok publikálása | Folyamatos |
| `email_worker_loop` | Bejövő emailek feldolgozása (IMAP) | Periodikus |
| `reminder_worker_loop` | Időpont-emlékeztetők küldése | Periodikus |

### 4.3 Adatpersisztencia

| Adat | Tárolás | Backup |
|---|---|---|
| **Üzleti adatok** | Supabase (Cloud PostgreSQL) | Supabase beépített |
| **Konfigurációk** | JSON fájlok (agent_settings.json, praxisinfo.json) | Git repo |
| **Tudásbázis** | knowledge.json | Git repo |
| **Log fájlok** | Docker json-file driver | Rotáció (10MB × 3) |

---

## Kereszthivatkozások

| Téma | Dokumentum |
|---|---|
| Architekturális felépítés | [Architecture Overview](../architecture/overview.md) |
| Üzleti funkciók | [Business Overview](../business/overview.md) |
| Szerver deploy parancsok | [`SETUP.md`](../../SETUP.md) |
