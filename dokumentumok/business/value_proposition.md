# Értékajánlat és Célpiac

> **Projekt:** ThinkAI Voice Agent  
> **Visszautalás:** [Üzleti Áttekintés](overview.md) | [Főáttekintés](../overview.md)

---

## 1. Értékajánlat (Value Proposition)

### Ügyfélszolgálati automatizáció

A ThinkAI Voice Agent értékajánlata egy mondatban:

> **Intelligens, 0-24 elérhető virtuális asszisztens, amely emberi minőségben kezeli az ügyfelek hívásait, kérdéseit és panaszait — az ügyfél nem észleli, hogy géppel beszél.**

### Fő értékek

| Érték | Részletek |
|---|---|
| **Azonnali rendelkezésre állás** | 0-24, hétvégén is elérhető, nincs várakozási idő |
| **Többcsatornás jelenlét** | Telefon, email, webchat, Messenger, Instagram, WhatsApp — egyetlen rendszerben |
| **Költséghatékonyság** | Emberi operátorok kiváltása vagy tehermentesítése |
| **Tanulékonyság** | Tudásbázis-alapú, folyamatosan bővíthető információkkal |
| **Intelligens eszkaláció** | Komplex esetekben emberi átadás teljes kontextussal |
| **Gyors bevezetés** | Akár 2 hét alatt élesíthető |
| **Magyar nyelv** | Természetes magyar hangon kommunikál |

### Versenyelőnyök

1. **Nem dobozos megoldás** — Minden ügyfélnél a gyakorlat sajátosságaihoz igazítható (árlista, GYIK, orvosok, szolgáltatások, nyitvatartás mind konfigurálható)
2. **Valós idejű hangkommunikáció** — Nem szöveges chatbot, hanem valódi telefonhívásokat kezel
3. **Magyar nyelv priorizálása** — STT (Soniox), TTS (Cartesia) és LLM (Gemini) specifikusan magyar nyelvre optimalizálva
4. **Integrált CRM** — Nem csak ügyfélszolgálat, hanem teljes ügyfélkezelés (kanban, címkék, kampányok)
5. **Pályázati támogatás** — DIMOP Plusz keretében akár 200M Ft támogatás elérhető

---

## 2. Célpiac szegmentáció

### Elsődleges célpiac: Egészségügyi szolgáltatók

A jelenlegi implementáció (kódban: `praxisinfo.json`, `system_prompt.md`) egyértelműen **orvosi rendelőkre, fogorvosokra** van optimalizálva:

**Erre utaló elemek a kódban:**
- `practice_name` — "rendelő" terminológia
- `doctors` lista — orvosok kezelése
- `services` — szolgáltatások időtartammal
- `patient_rules` — páciens azonosítási szabályok (új/visszatérő)
- `new_patient_auto_visit` — első vizit szabály (állapotfelmérés kötelező)
- `price_list` — árlista fogászati szolgáltatásokkal

**Üzleti probléma amit megold:**
- Rendelők nem tudják felvenni a telefont munkaidőben (kezelés közben)
- Hétvégén, éjjel nincs recepciós → elveszett érdeklődők
- Időpontfoglalás komplex (orvos-specifikus naptárak, ütközésvizsgálat)

### Másodlagos célpiacok

| Szektor | Releváns funkciók | Referencia |
|---|---|---|
| **Biztosítás** | Ajánlatkérések AI-feldolgozása | HungaroRisk referencia (knowledge.json) |
| **E-kereskedelem** | Rendeléskezelés, ügyfélszolgálat | knowledge.json — "ecommerce" |
| **Pénzügy & Számvitel** | Számlafeldolgozás, riportok | knowledge.json — "penzugy", KönyvelésAI |
| **Marketing & Sales** | CRM, pipeline optimalizálás | knowledge.json — "marketing" |
| **Szolgáltató cégek** | Hibabejelentés, állapotkövetés | DigiDesk spec (front office fókusz) |

---

## 3. Ügyfélút (Customer Journey)

### Bevezetési folyamat

A ThinkAI két utat kínál a potenciális ügyfeleknek:

#### Út 1 — "Még nem tudod, mit szeretnél"
```
Audit → Prezentáció → Kiválasztás → Megvalósítás
```
- Teljeskörű szervezeti átvilágítás
- 100% pénzvisszafizetési garancia az auditra

#### Út 2 — "Tudod, mit szeretnél"
```
Technikai Spec Meeting → Árajánlat → Megvalósítás
```
- Gyorsabb, célzott megközelítés

### A Voice Agent élettartama egy ügyfélnél

```
1. Konfiguráció
   ├── praxisinfo.json feltöltése (admin UI-n)
   ├── Orvosok, szolgáltatások, árlista beállítása
   ├── Tudásbázis (knowledge.json) megírása
   ├── GYIK összeállítása
   └── Nyitvatartás, szabályok beállítása

2. Élesítés
   ├── Telnyx telefonszám hozzárendelése
   ├── Widget beágyazása a weboldalba
   └── Meta csatornák bekötése

3. Üzemelés
   ├── AI automatikusan kezeli az interakciókat
   ├── Emberi beavatkozás csak eszkalált ügyeknél
   ├── Analitika dashboard monitorozás
   └── Tudásbázis folyamatos bővítése
```

---

## 4. Piaci pozícionálás

### ThinkAI vs. hagyományos megoldások

| Szempont | Call Center | Chatbot | ThinkAI Voice Agent |
|---|---|---|---|
| **Elérhetőség** | Munkaidőben | 0-24 (szöveg) | 0-24 (hang + szöveg) |
| **Költség** | Magas (bér) | Alacsony | Közepes |
| **Minőség** | Változó | Limitált | Emberi szintű |
| **Skálázhatóság** | Lineáris | Azonnali | Azonnali |
| **Magyar nyelv** | Természetes | Közepes | Természetes |
| **Időpontfoglalás** | Manuális | Korlátozott | Automatikus, ütközésvizsgálattal |
| **CRM integráció** | Külön rendszer | Korlátozott | Beépített |

---

## Kereszthivatkozások

| Téma | Dokumentum |
|---|---|
| Funkciók részletezése | [Funkciók és Képességek](features_and_capabilities.md) |
| Árazás | [Bevételi Modell](revenue_model.md) |
| Technikai implementáció | [Architecture Overview](../architecture/overview.md) |
