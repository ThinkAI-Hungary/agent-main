# Globális Technology Stack — ThinkAI Voice Agent

**Utolsó frissítés:** 2026-07-03

## Backend & Core

| Réteg | Technológia | Megjegyzés |
|---|---|---|
| Nyelv | Python 3.10+ | |
| Web Keretrendszer | FastAPI | Web server és REST API |
| AI Pipeline | LiveKit Agents | Orchestration |
| LLM | Gemini 2.5 Flash | Google AI SDK |
| STT | Soniox | Valós idejű magyar beszédértés |
| TTS | Cartesia | Élethű magyar hanggenerálás |
| Adatbázis | SQLite / Supabase | Helyi és távoli perzisztencia |

## Frontend

| Réteg | Technológia | Megjegyzés |
|---|---|---|
| Keretrendszer | React (Vite) | `eaisydesk-frontend` |
| UI | Tailwind CSS / Vanilla CSS | Zombo modul speciális stílussal |
| State | React Hooks / SessionStorage | |
| Kommunikáció | WebSocket / Fetch | LiveKit kliens és REST hívások |

## Infrastruktúra & Integrációk

- **Telephony**: Telnyx (SIP Trunking).
- **Email**: Brevo (SMTP & API).
- **Deployment**: DigitalOcean / Railway / Vercel.
- **Monitoring**: LiveKit Cloud Dashboard.
