# Technology Stack — Zombo Audit System

**Utolsó frissítés:** 2026-07-03

| Réteg | Technológia | Verzió | Megjegyzés |
|---|---|---|---|
| Frontend | React (Vite) | ^18.0.0 | Tab-alapú elrendezés, sötét mód orientált |
| Stílus | Vanilla CSS | - | zombo.css |
| Ikonok | Lucide React | ^0.244.0 | |
| API kliens | Fetch API | - | getToken helperrel |
| Backend | Node.js / FastAPI | - | Port 3001 |
| Renderelés | Playwright | - | Feliratok és logók pontos elhelyezése |

## Főbb típusok (TypeScript)

- **AuditResult**: A teljes weboldal audit eredménye.
- **BrandKit**: Arculati beállítások.
- **PostCreative**: Generált hirdetés/poszt adatai.
- **Campaign**: Összetett kampány struktúra.
