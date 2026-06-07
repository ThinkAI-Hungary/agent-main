# Üzleti Követelmények — Áttekintés

> **Projekt:** ThinkAI Voice Agent (DigiDesk / EAISY Platform)  
> **Verzió:** 1.0  
> **Utolsó frissítés:** 2026-06-05

---

## 1. Termék összefoglaló

A **ThinkAI Voice Agent** egy többcsatornás, AI-alapú ügyfélkommunikációs platform, amelyet a **ThinkAI Kft.** fejleszt. A rendszer elsődleges célja, hogy a bejövő és kimenő ügyfélinterakciókat (telefon, email, chat, Messenger, Instagram, WhatsApp) egységes logika szerint kezelje, és ahol lehet, emberi beavatkozás nélkül lezárja.

### Termékvízió

> *"A jövő tegnap volt. Mi a holnap vagyunk."* — ThinkAI Kft. mottó

A termék nem prezentációkat készít az AI lehetőségeiről, hanem **működő rendszereket épít, amelyek azonnal értéket teremtenek**.

### Terméknév-hierarchia

| Név | Kontextus |
|---|---|
| **ThinkAI** | Cég (fejlesztő) |
| **EAISY** | Termékcsalád (moduláris ERP + AI eszközök) |
| **DigiDesk** | Többcsatornás ügyfélkommunikációs modul |
| **EAISY Marketing** | Marketing automatizáció modul |
| **Voice Agent** | Hangalapú AI asszisztens (a rendszer magja) |

---

## 2. Célpiac

→ Részletek: [Értékajánlat és Célpiac](value_proposition.md)

A rendszer elsődleges célpiaca:

- **Egészségügyi szolgáltatók** — orvosi rendelők, fogorvosok, klinikák
- **Szolgáltató cégek** — front office-szal, ügyfélkommunikációval rendelkező vállalkozások
- **E-kereskedelmi vállalkozások** — rendeléskezelés, ügyfélszolgálat
- **Pénzügyi szektor** — számlafeldolgozás, riportok
- **Biztosítási szektor** — ajánlatkérések automatizált feldolgozása

### Közös jellemzők a célcsoport tagjaiban

1. Van recepció / front office
2. Az ügyfélkommunikáció közvetlenül hat az ügyfélszerzésre
3. Az érdeklődésből időpont, vásárlás vagy egyéb üzleti konverzió lesz

---

## 3. Fő üzleti funkciók

→ Részletek: [Funkciók és Képességek](features_and_capabilities.md)

### Bejövő interakciókezelés (Inbound)

| Funkció | Leírás |
|---|---|
| **0-24 híváskezelés** | Valós időben, természetes magyar hangon, az ügyfél nem észleli, hogy géppel beszél |
| **Többcsatornás inbox** | Telefon, email, webchat, Messenger, Instagram, WhatsApp — egységes rendszerben |
| **Intelligens triázs** | Ügytípus felismerés (időpont, kérdés, kérés, panasz), prioritizálás, automatikus címkézés |
| **Automatikus lezárás** | Egyszerű ügyek (információkérés, időpontfoglalás) emberi beavatkozás nélkül |
| **Emberi eszkaláció** | Komplex esetek átadása élő operátornak teljes kontextussal |

### Kimenő kommunikáció (Outbound)

| Funkció | Leírás |
|---|---|
| **Eseményvezérelt automatizmusok** | Időpont-visszaigazolás, emlékeztető, no-show utókövetés |
| **Kampánykezelés** | Szegmentált ügyféllistából kampány indítás (email, telefon, üzenet) |
| **AI tartalomgenerálás** | Social media posztok, email kampányok AI-generálása |
| **Jóváhagyási rendszer** | AI draft válaszok emberi jóváhagyása küldés előtt |

### CRM & Ügyfélkezelés

| Funkció | Leírás |
|---|---|
| **Ügyféladatbázis** | Kanban-alapú érdeklődőkezelés, címkerendszer |
| **Naptárkezelés** | Időpontfoglalás ütközésvizsgálattal, orvos-specifikus naptárak |
| **Analitika** | Hívásvolumen, csatorna-eloszlás, átlagos hívási idő, interakciós statisztikák |

---

## 4. Üzleti modell

→ Részletek: [Bevételi Modell](revenue_model.md)

A ThinkAI három pillére:

1. **Egyedi fejlesztés** — Specifikus üzleti problémákra szabott AI megoldások
2. **AI-ügyfélszolgálat** — 0-24 elérhető virtuális asszisztensek (ez a termék)
3. **EAISY termékcsalád** — Moduláris ERP és AI eszközök

### Pályázati háttér

A projekt feltehetően a **DIMOP Plusz 1.2.3** pályázat keretében valósul meg:
- Akár **200 millió Ft** AI fejlesztésre
- **45% vissza nem térítendő** támogatás
- **0%-os kamatú** hitel 8 évre
- Mindössze **10% önerő**

---

## 5. Fejlesztési ütemterv

→ Részletek: [Roadmap](roadmap.md)

### Jelenlegi állapot (v1.x — Production)

- ✅ Voice Agent core (LiveKit + Gemini + Soniox + Cartesia)
- ✅ Többcsatornás bejövő kommunikáció (telefon, email, Messenger, Instagram)
- ✅ Admin dashboard (FastAPI + HTML)
- ✅ CRM alapfunkciók (ügyféllista, kanban, címkézés)
- ✅ Kampánykezelés (email, telefon, üzenet)
- ✅ EAISY Marketing modul (email kampány, social média, AI tartalom)
- ✅ Telnyx SIP integráció (HD Voice, G.722)

### Tervezett fejlesztések (Roadmap)

- 🔲 WhatsApp Business API integráció (dedikált)
- 🔲 SEO/SEM eszközök (kulcsszó-nyilvántartás, pozíciókövetés)
- 🔲 Hűségprogram modul (pontgyűjtés, szintek, jutalmak)
- 🔲 Versenytárs árfigyelő rendszer (web scraping + AI)
- 🔲 Multi-tenant támogatás (több ügyfél egy példányon)
- 🔲 Fejlettebb analitika és riportolás

---

## Kereszthivatkozások

| Téma | Dokumentum |
|---|---|
| Architekturális felépítés | [Architecture Overview](../architecture/overview.md) |
| Telepítés és üzemeltetés | [Production Overview](../production/overview.md) |
| DigiDesk specifikáció | [`_pdf_extract.txt`](../../_pdf_extract.txt) |
| EAISY Marketing specifikáció | [`spec_output.txt`](../../spec_output.txt) |
