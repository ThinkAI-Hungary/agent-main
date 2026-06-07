# Bevételi Modell és Árazás

> **Projekt:** ThinkAI Voice Agent  
> **Visszautalás:** [Üzleti Áttekintés](overview.md) | [Főáttekintés](../overview.md)

---

## 1. Bevételi modellek

A ThinkAI három bevételi pillérrel rendelkezik:

### 1.1 Egyedi fejlesztés (Projekt-alapú)

Specifikus üzleti problémákra szabott AI megoldások tervezése és kivitelezése.

- **Bevételi típus:** Egyszeri projektdíj + opcionális havi támogatás
- **Árazás:** Projektfüggő (egyedi árajánlat)
- **Referenciák:**
  - Listamester — Email marketing automatizáció (Make.com)
  - HungaroRisk — Biztosítási ajánlatkérés AI-agent
  - Könyvelés AI — Számlafeldolgozás és kontírozás

### 1.2 AI-Ügyfélszolgálat (SaaS / előfizetés)

Ez a termék — a Voice Agent platform.

- **Bevételi típus:** Havi előfizetés (feltételezett)
- **Bevezetési idő:** ~2 hét
- **Árazás:** Pontos árat a `knowledge.json` nem tartalmaz; projektfüggő egyedi árajánlat

### 1.3 EAISY Termékcsalád (Moduláris ERP)

Moduláris ERP és AI eszközök, azonnal integrálhatók a mindennapi működésbe.

- **Bevételi típus:** Modul-alapú licenc + fejlesztési díj
- **Modulok:** CRM, Marketing, stb.

---

## 2. EAISY Marketing modul — Árazás

A `spec_output.txt` alapján az EAISY Marketing modul részletes költségvetése:

### 2.1 Költségvetés részletezés

| Munkaszakasz | Óraszám | Óradíj | Nettó |
|---|---|---|---|
| Tervezés és audit | 12 óra | 30 000 Ft | 360 000 Ft |
| E-mail marketing (Brevo) | 30 óra | 18 000 Ft | 540 000 Ft |
| SEO/SEM + Hűségprogram | 25 óra | 18 000 Ft | 450 000 Ft |
| Ügyfél szegmentáció + kuponok | 20 óra | 18 000 Ft | 360 000 Ft |
| AI tartalom + Social média | 30 óra | 22 000 Ft | 660 000 Ft |
| Versenytárs árfigyelő | 20 óra | 22 000 Ft | 440 000 Ft |
| Többcsatornás kommunikáció | 15 óra | 18 000 Ft | 270 000 Ft |
| Tesztelés + stabilizálás | 10 óra | 15 000 Ft | 150 000 Ft |
| **ÖSSZESEN** | **162 óra** | | **3 230 000 Ft + ÁFA** |

### 2.2 Fizetési ütemezés

| Szakasz | Nettó összeg | Esedékesség |
|---|---|---|
| 1. Tervezés + Email marketing | 900 000 Ft | Indulás előtt |
| 2. SEO/SEM + Szegmentáció + Kuponok | 810 000 Ft | 2. szakasz előtt |
| 3. AI tartalom + Social + Árfigyelő | 1 370 000 Ft | 3. szakasz előtt |
| 4. Tesztelés + stabilizálás | 150 000 Ft | Tesztelés előtt |

### 2.3 Fejlesztési ütemterv

| Hét | Feladat | Csapat | Milestone |
|---|---|---|---|
| 1-2 | Tervezés, UX, Brevo setup | 2 fő | Spec kész |
| 3-4 | E-mail marketing + SEO/SEM | 2 fő | Email live |
| 5-6 | Hűségprogram + Szegmentáció | 2 fő | Szegmensek |
| 7-8 | AI tartalom + Social média | 2 fő | AI pipeline |
| 9 | Versenytárs árfigyelő | 1 fő | Árfigyelő |
| 10 | Tesztelés, bugfix, pályázati audit | 2 fő | ÉLESÍTÉS |

**Becsült fejlesztési idő:** 8-10 hét (1 senior + 1 medior fejlesztő)

---

## 3. Pályázati lehetőségek

### DIMOP Plusz 1.2.3

A ThinkAI aktívan értékesíti az AI fejlesztéseket a DIMOP Plusz pályázati keretben:

| Paraméter | Részlet |
|---|---|
| **Keretösszeg** | Akár 200 millió Ft |
| **Támogatás** | ~45% vissza nem térítendő |
| **Hitel** | 0%-os kamat, 8 évre (3. évtől törlesztés) |
| **Önerő** | Mindössze 10% |
| **Előfinanszírozás** | 100%-ban előfinanszírozott |
| **Lefedettség** | Országos |
| **Határidő** | 2027. március 31. |
| **Elbírálás** | MFB pontos pályázat, 60 napon belül szerződéskötés |

**Két konstrukció:**
1. **DIMOP Plusz 1.2.3/A-24** — kisebb volumenű digitalizációs projektek (akár egyéni vállalkozók)
2. **DIMOP Plusz 1.2.3/B-24** — komplex AI-automatizációs projektek

**Feltételek:**
- Nincs területi korlátozás
- A támogatás nem haladhatja meg az előző évi árbevételt
- Nem haladhatja meg az üzemi eredmény 10-szeresét
- Minimum 1 fő statisztikai létszám

---

## 4. Üzemeltetési költségek (becsült)

A rendszer üzemeltetéséhez szükséges havi költségek (külső szolgáltatások):

| Szolgáltatás | Becsült havi költség | Megjegyzés |
|---|---|---|
| **LiveKit Cloud** | Forgalomfüggő | WebRTC relay + SIP gateway |
| **Google Gemini API** | Forgalomfüggő | Per-token árazás |
| **Soniox STT** | Forgalomfüggő | Per-perc árazás |
| **Cartesia TTS** | Forgalomfüggő | Per-karakter árazás |
| **Supabase** | Ingyenes / $25+ | Tárhelyfüggő |
| **Telnyx** | Forgalomfüggő | Per-perc + telefonszám díj |
| **Brevo** | Ingyenes / $25+ | Per-email árazás |
| **DigitalOcean** | $6-24 /hó | VPS (szerver) |
| **Domain + SSL** | ~$15 /év | thinkai.hu |

> **Megjegyzés:** Pontos költségadatok nem állnak rendelkezésre a kódbázisból, mivel az árazás ügyfélspecifikus és forgalomfüggő.

---

## Kereszthivatkozások

| Téma | Dokumentum |
|---|---|
| Külső szolgáltatások részletei | [External Services](../production/external_services.md) |
| Roadmap és tervezett modulok | [Roadmap](roadmap.md) |
| Marketing modul specifikáció | [`spec_output.txt`](../../spec_output.txt) |
