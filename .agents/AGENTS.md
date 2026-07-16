## KOTELEZO: Minden session elejen, elso valasz ELOTT

### 1. Hub betoltese -- ELSO lepeskent, MINDIG

Olvasd be:
C:\Users\Zombo\Desktop\Antigrav\!SKILLS\thinkai-skills\skills\thinkai-hub\SKILL.md

### 2. Zero Discretion Policy

NE kezdj el kodolni, fajlt modositani, vagy barmilyen muvelet vegezni
mielott a Hub pipeline aktiv es a Pipeline Manifest elkeszult.

Nincs 'gyors fix'. Nincs 'trivialis kivetel'. Minden keresen atmegy a Hub-on.

### 3. Error Memory konzultacio

Az aktualis feladat domainjeben kerdezd le az Error Memory-t mielott kodolsz.

### 4. Kivetel

Ha a user /nohub-ot ir: mindket lepest skip.

---

Ha ezt kihagyod -> ERR-004 (vakrepules, nincs checkpoint, nincs retry loop).

---

## 5. Engedélyezett Szerverek Korlátozása (MANDATORY SERVER LIMITATION)

Szigorúan TILOS bármilyen más szervert vagy szervizt elindítani a háttérben. Kizárólag az alábbi 3 megengedett szerver futhat:

1. **AI Creative Studio Express Backend**
   - Hely: `z/kepgeneralas/server`
   - Parancs: `npm run dev` (vagy `tsx watch src/index.ts`)
2. **AI Creative Studio Vite Frontend**
   - Hely: `z/kepgeneralas/frontend`
   - Parancs: `npm run dev` (vagy `vite`)
3. **DigiDesk (eaisydesk-frontend) Vite Frontend**
   - Hely: `thinkai-voice-agent/eaisydesk-frontend`
   - Parancs: `npm run dev` (vagy `vite`)

Bármilyen LiveKit (`server.py`), FastAPI/Python backend (`web_server.py`) vagy Email feldolgozó (`email_processor.py`) szerviz elindítása szigorúan TILOS.