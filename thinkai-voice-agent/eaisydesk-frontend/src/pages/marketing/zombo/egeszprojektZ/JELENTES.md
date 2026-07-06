# ThinkAI Globális Projekt — Állapotjelentés és TODO

**Dátum:** 2026-07-03
**Készítette:** Antigravity AI

## 📊 Helyzetjelentés

A ThinkAI projekt egy komplex, többnyelvű (Python, React) ökoszisztéma, amely a hangalapú mesterséges intelligenciát ötvözi az üzleti folyamat-automatizálással és marketing audit eszközökkel. A projekt kiforrott fázisban van, amit a Telnyx és LiveKit éles integrációi is bizonyítanak.

### Főbb eredmények:
- **Éles hangalapú ágens**: Teljesen működőképes magyar nyelvű STT/LLM/TTS pipeline (Soniox + Gemini + Cartesia).
- **Mély CRM Integráció**: Az ágens közvetlenül kezeli a Kanban (Clients) adatbázist, azonosítja az ügyfeleket és frissíti a tölcsér állapotukat (funnel stage).
- **Automatizált Triázs és Eszkaláció**: A rendszer képes detektálni a sürgős eseteket (urgent, complaint) és azonnali értesítést küldeni a személyzetnek.
- **Kifinomult Analitika**: Részletes statisztikák a hívásidőkről, témákról, konverziós arányokról és csatorna-megoszlásról.
- **Többcsatornás Jelenlét**: Támogatás telefon, email, WhatsApp, Messenger és Instagram csatornákhoz.


---

## 🛑 Globális Problémák (Kockázatok)

1. **Monolitikus Backend**: A `web_server.py` (>300KB) túl sok funkciót sűrít egybe. Ez rontja a tesztelhetőséget és növeli a hibaarányt módosításkor.
2. **Kód-clutter (Szemét a gyökérben)**: Rengeteg backup fájl (`.bak`, `_backup_before_redesign.html`, stb.) található a fő könyvtárban. Ez zavaró a fejlesztőknek és biztonsági kockázatot jelenthet.
3. **SQLite skálázhatóság**: A párhuzamos folyamatok egyetlen SQLite adatbázison osztoznak. Magas hívásszám esetén az adatbázis zárolási hibák (Database Locked) léphetnek fel.
4. **Alacsony Tesztlefedettség**: A projektben sok a segédscript, de kevés az automatizált unit teszt a kritikus üzleti logikához (pl. naptár ütközésvizsgálat).
5. **Konfigurációs fragmentáció**: A beállítások több helyen szóródnak szét (`.env`, `agent_settings.json`, `praxisinfo.json`, `brand_dna.json`).

---

## ✅ Globális TODO Lista

### Sürgős (P0)
- [ ] **Backend dekompozíció**: A `web_server.py` felbontása moduláris Router-ekre (pl. `auth.py`, `admin.py`, `marketing.py`).
- [ ] **Tisztítás**: A felesleges `.bak` és backup HTML fájlok archiválása egy külön `backups/` mappába vagy eltávolítása.
- [ ] **Központi konfig**: Egy egységes konfigurációs manager osztály létrehozása, amely összefogja a JSON és ENV alapú beállításokat.

### Fontos (P1)
- [ ] **Adatbázis migráció**: Felkészülés PostgreSQL-re (pl. Supabase-re való teljes áttérés) a jobb skálázhatóság érdekében.
- [ ] **Unit Tesztek**: Alapvető tesztek írása a `tools.py` és a `database.py` kritikus függvényeihez.
- [ ] **API Verziózás**: `/api/v1/` prefix bevezetése a későbbi breaking change-ek elkerülése végett.

### Fejlesztési javaslat (P2)
- [ ] **CI/CD Pipeline**: Automatikus deploy folyamat kialakítása (GitHub Actions).
- [ ] **Monitorozás**: Prometheus/Grafana vagy Sentry integráció a futásidejű hibák és hívásstatisztikák követéséhez.
