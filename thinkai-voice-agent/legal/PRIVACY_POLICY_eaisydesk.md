# eaisyDesk — Adatvédelmi tájékoztató / Privacy Policy (termékspecifikus)

> **Utolsó frissítés / Last updated: 2026-07-28**
> **Nyilvános URL / Public URL: https://eaisy.hu/eaisydesk/privacy**
>
> Ez a dokumentum az **eaisyDesk** termék termékspecifikus adatvédelmi tájékoztatója.
> A ThinkAI Kft. vállalati szintű tájékoztatója a https://eaisy.hu/privacy címen érhető el.

---

## Magyar verzió

### 1. Az adatkezelő adatai

**Adatkezelő (Data Controller):** Think AI Korlátolt Felelősségű Társaság
**Rövidített név:** Think AI Kft.
**Székhely:** 1111 Budapest, Lágymányosi utca 12. Fsz. 2. ajtó
**Cégjegyzékszám:** 01-09-426295
**Adószám:** 32478620-2-43
**Alapítás dátuma:** 2024. január 23.
**Kapcsolattartási e-mail:** hello@thinkai.hu

Az eaisyDesk ügyfélszolgálati platformot (a továbbiakban: „Szolgáltatás") a ThinkAI Kft. üzemelteti a Rivergate Dental & Implant Center (a továbbiakban: „Praxis") ügyfélszolgálati folyamatainak támogatására.

Az adatkezelés jogalapjai: GDPR 6. cikk (1) bek. a) (hozzájárulás), b) (szerződéses teljesítés) és f) ( jogos érdek).

### 2. Milyen adatokat gyűjtünk

A Szolgáltatás az ügyfelekkel folytatott kommunikáció kezelésére és automatizált válaszadásra szolgál. Az alábbi adatokat gyűjtjük:

**2.1. Közvetlenül az ügyféltől kapott adatok**
- A kommunikációs csatornákon (telefon, e-mail, Messenger, Instagram, WhatsApp) küldött üzenetek tartalma (szöveg),
- Személyes adatok, amelyeket az ügyfél önként megad (pl. név, telefonszám, e-mail cím, foglalási szándék, panasz leírása),
- Időpontfoglaláskor megadott adatok (név, elérhetőségek, kért szolgáltatás).

**2.2. Meta engedély-API-n keresztül kapott adatok**
A Meta platformokkal (Facebook/Messenger, Instagram, WhatsApp Business) való integráció során az alábbi adatok érkeznek a Meta API-jain keresztül:

- **Messenger:** a feladó oldal-specifikus azonosítója (PSID, Page-Scoped ID), üzenet szövege, nyilvános profiladatok (keresztnév, vezetéknév, profilkép URL).
- **Instagram DM:** a feladó Instagram-azonosítója (IGSID), üzenet szövege, nyilvános profiladatok (név, felhasználónév, profilkép URL).
- **WhatsApp Business:** a feladó telefonszáma, üzenet szövege, a Meta által szolgáltatott profilnév (ha elérhető).

A fenti adatokat a Meta Webhook API-ján keresztül kapjuk. A Meta profiladatok lekérdezéséhez a felhasználó hozzájárulása a Meta platform saját felületén történik.

**2.3. Harmadik felektől származó adatok**
- AI-szolgáltatóktól (pl. Google Gemini) származó feldolgozott válaszok és összefoglalók, amelyeket az ügyfél eredeti üzenete alapján generálunk,
- Naptár-/foglalási adatok a belső foglalási rendszerből.

**2.4. Automatikusan gyűjtött adatok**
- Szerver-oldali metaadatok: üzenet érkezési időpontja, csatorna típusa, IP-cím (a webes kiszolgáló naplóiban, a kommunikáció biztonságos kezelésére szolgáló szerveroldali naplók keretében),
- Munkamenet-adatok (session): JWT-alapú bejelentkezési token az admin felhasználók számára (8 óra lejárattal), amely nem tartalmaz személyes adatot magánügyfelekről,
- Használati adatok: az admin felület interakciói (pl. jóváhagyások, állapot-módosítások) a belső auditnapló céljára.

### 3. Hogyan kezeljük az adatokat és milyen célból

| Adatkategória | Cél | Jogalap | Megőrzési idő |
|---|---|---|---|
| Üzenet tartalma (szöveg, transzkript) | Ügyfélkiszolgálás, AI-alapú válaszadás, beszélgetésnapló vezetése | Szerződéses teljesítés (6(1)(b)) | A Praxis ügyféligények szerint; alapértelmezetten a beszélgetés lezárása után legfeljebb 24 hónap |
| Név, elérhetőségek (telefon, e-mail) | Ügyfélazonosítás visszatéréskor, kapcsolattartás, foglalás visszaigazolása | Szerződéses teljesítés (6(1)(b)) | Az ügyfélkapcsolat alatt; törlésig, de legfeljebb az adatkezelés céljának fennállásáig |
| Meta azonosítók (PSID, IGSID, WhatsApp-szám) | Válasz küldése a megfelelő csatornán, ügyfél felismerése | Hozzájárulás (6(1)(a)) és szerződéses teljesítés (6(1)(b)) | Az ügyfélkapcsolat alatt |
| AI által generált összefoglalók, besorolás | Ügyfélszolgálati munkafolyamat támogatása (triage, állapotkövetés) | Jogos érdek (6(1)(f)) — hatékony ügyfélszolgálat | A beszélgetésnaplóval egyezően |
| Szervernaplók, IP-címek | Biztonság, visszaélések megelőzése, hibakeresés | Jogos érdek (6(1)(f)) — informatikai biztonság | Legfeljebb 30 nap |
| Foglalási adatok | Időpontok kezelése, emlékeztetők küldése | Szerződéses teljesítés (6(1)(b)) | A foglalás teljesülése + könyvelési kötelezettség ideje |

**Adattovábbítás harmadik országokba:** Az AI-szolgáltató (Google) és a Meta szerverei az Európai Gazdasági Térségen (EGT) kívül is feldolgozhatnak adatokat. A ThinkAI Kft. megfelelő garanciákat (Standard Contractual Clauses) alkalmaz az adattovábbítás jogszerűsége érdekében.

**Adatfeldolgozók (processzorok), akik adatokhoz férhetnek:**
- **Meta Platforms Ireland Ltd.** — Messenger/Instagram/WhatsApp üzenetek kézbesítése
- **Google Ireland Ltd. / Google LLC** — AI-alapú szövegfeldolgozás (Gemini), LiveKit hangalapú agent
- **Brevo (Sendinblue)** — tranzakciós e-mailek küldése (visszaigazolások, emlékeztetők)
- **Supabase** — adatbázis-hosting (EU-régió)
- **LiveKit** — valós idejű hangkommunikáció

### 4. Hogyan kérheti az adatai törlését

**Meta alkalmazások esetén (Messenger, Instagram, WhatsApp):**
Ha Meta-platformon (Messenger, Instagram, WhatsApp) keresztül kommunikált a Szolgáltatással, és törölni szeretné az adatait, a következőket teheti:

1. **Meta adattörlési callback:** A Meta platformról indított adattörlési kérelem automatikusan megérkezik hozzánk a Meta adattörlési webhookján keresztül. Ennek hatására az összes, az Ön Meta-azonosítójához (PSID/IGSID/telefonszám) kapcsolódó adatot töröljük rendszerünkből, és visszaigazoljuk a törlést a Meta felé.
2. **Közvetlen kérelem:** Írjon a hello@thinkai.hu címre „Adattörlés kérelem" tárggyal. A kérelem megküldésekor adja meg a csatornát és az azonosítóját (telefonszám, e-mail cím vagy Meta-felhasználónév). A kérelmet a beérkezéstől számított legfeljebb 30 napon belül teljesítjük, és visszaigazoljuk.

**Általános adattörlés (minden csatorna):**
Kérheti adatai törlését bármikor a hello@thinkai.hu címen. A GDPR „elfeledtetéshez való jog" (17. cikk) alapján a törlést akkor teljesítjük, ha nincs fennálló jogi kötelezettség (pl. számviteli nyilvántartás) az adatok megőrzésére.

### 5. Az érintett jogai (GDPR 15–22. cikk)

A GDPR alapján a következő jogok illetik meg Önt:
- **Hozzáférési jog** (15. cikk): tájékoztatást kérhet a kezelt adatokról,
- **Helyesbítéshez való jog** (16. cikk): kérheti a pontatlan adatok módosítását,
- **Törléshez / el felejtetéshez való jog** (17. cikk),
- **Adatkezelés korlátozásához való jog** (18. cikk),
- **Adathordozhatósághoz való jog** (20. cikk),
- **Tiltakozási jog** (21. cikk),
- **Automatizált döntéshozatallal kapcsolatos jog** (22. cikk): az AI-alapú klasszifikáció nem eredményez Önt jogilag kötelező döntést; minden automatikus választ ember is felül vizsgálhatja a jóváhagyási rendszerben.

A jogok gyakorlása érdekében írjon a hello@thinkai.hu címre. Panasza esetén a Nemzeti Adatvédelmi és Információszabadság Hatósághoz (NAIH, https://naih.hu) fordulhat.

### 6. Adatbiztonság

A ThinkAI Kft. megfelelő technikai és szervezeti intézkedéseket tesz az adatok védelme érdekében:
- Adatbázis-szintű hozzáférés-szabályozás (RLS — Row Level Security),
- Titkosított kapcsolat (HTTPS/TLS) az összes adatátvitelnél,
- Service-role kulcsok korlátozott hozzáférése (csak a backend szerver),
- Rendszeres biztonsági audit és sebezhetőségi ellenőrzés.

### 7. Sütik (cookies)

Az admin felület minimális sütiket használ a bejelentkezési munkamenet fenntartására (JWT token a localStorage-ben). Harmadik fél sütiket (hirdetési, analitikai) nem használunk. A webhely cookie-consent bannert jelenít meg a látogatók számára.

### 8. Kapcsolat

**Adatkezelő:** Think AI Korlátolt Felelősségű Társaság
**Székhely:** 1111 Budapest, Lágymányosi utca 12. Fsz. 2. ajtó
**Cégjegyzékszám:** 01-09-426295
**Adószám:** 32478620-2-43
**E-mail:** hello@thinkai.hu
**Adatvédelmi incidens bejelentése:** hello@thinkai.hu

---

## English version

### 1. Data controller

**Data Controller:** Think AI Korlátolt Felelősségű Társaság (Think AI Kft.)
**Registered office:** 1111 Budapest, Lágymányosi utca 12. Fsz. 2. ajtó, Hungary
**Company registration number:** 01-09-426295
**Tax number:** 32478620-2-43
**Date of foundation:** 23 January 2024
**Contact email:** hello@thinkai.hu

The eaisyDesk customer-service platform ("Service") is operated by ThinkAI Kft. on behalf of Rivergate Dental & Implant Center to support its customer-service workflows.

Legal bases for processing: GDPR Art. 6(1)(a) (consent), (b) (contract performance), and (f) (legitimate interest).

### 2. What data we collect

The Service is used to manage and automate responses to customer communications. We collect the following data:

**2.1. Data provided directly by the user**
- Content of messages sent via any communication channel (phone, e-mail, Messenger, Instagram, WhatsApp),
- Personal details voluntarily provided (e.g. name, phone number, e-mail address, booking intent, complaint description),
- Booking details provided when scheduling (name, contact info, requested service).

**2.2. Data received via Meta permission APIs**
Through integration with Meta platforms (Facebook/Messenger, Instagram, WhatsApp Business) the following data is received via Meta's APIs:

- **Messenger:** the sender's Page-Scoped ID (PSID), message text, public profile data (first name, last name, profile picture URL).
- **Instagram DM:** the sender's Instagram ID (IGSID), message text, public profile data (name, username, profile picture URL).
- **WhatsApp Business:** the sender's phone number, message text, profile name provided by Meta (if available).

This data is received via the Meta Webhook API. Consent for Meta profile data is obtained on the Meta platform itself.

**2.3. Data from third parties**
- AI-generated responses and summaries from AI providers (e.g. Google Gemini), based on the user's original message,
- Booking data from the internal booking system.

**2.4. Automatically collected data**
- Server-side metadata: message timestamps, channel type, IP address (in web-server logs, for secure operation),
- Session data: JWT-based login token for admin users (8-hour expiry) — does not contain personal data about end customers,
- Usage data: admin-interface interactions (approvals, status changes) for the internal audit log.

### 3. How we use the data and for what purpose

| Data category | Purpose | Legal basis | Retention |
|---|---|---|---|
| Message content (text, transcript) | Customer service, AI-assisted responses, conversation log | Contract performance (6(1)(b)) | Per practice policy; by default up to 24 months after the conversation is closed |
| Name, contact info (phone, e-mail) | Customer identification on return, contact, booking confirmation | Contract performance (6(1)(b)) | For the duration of the customer relationship |
| Meta IDs (PSID, IGSID, WhatsApp number) | Sending a reply on the right channel, customer recognition | Consent (6(1)(a)) and contract performance (6(1)(b)) | For the duration of the customer relationship |
| AI-generated summaries, classification | Support of customer-service workflows (triage, status tracking) | Legitimate interest (6(1)(f)) | Same as the conversation log |
| Server logs, IP addresses | Security, abuse prevention, debugging | Legitimate interest (6(1)(f)) | Up to 30 days |
| Booking data | Appointment management, sending reminders | Contract performance (6(1)(b)) | Until appointment + accounting obligations |

**Transfers outside the EEA:** AI providers (Google) and Meta servers may process data outside the European Economic Area. ThinkAI Kft. applies appropriate safeguards (Standard Contractual Clauses) to ensure lawful transfers.

**Processors with access to data:**
- **Meta Platforms Ireland Ltd.** — Messenger/Instagram/WhatsApp message delivery
- **Google Ireland Ltd. / Google LLC** — AI-based text processing (Gemini), LiveKit voice agent
- **Brevo (Sendinblue)** — transactional e-mail sending
- **Supabase** — database hosting (EU region)
- **LiveKit** — real-time voice communication

### 4. How to request deletion of your data

**For Meta applications (Messenger, Instagram, WhatsApp):**
If you communicated with the Service via a Meta platform, you can request deletion of your data as follows:

1. **Meta data-deletion callback:** A deletion request initiated from the Meta platform is delivered to us automatically through the Meta data-deletion webhook. As a result, we delete all data linked to your Meta ID (PSID/IGSID/phone number) from our system and confirm the deletion to Meta.
2. **Direct request:** E-mail hello@thinkai.hu with the subject "Data deletion request". Please include the channel and your identifier (phone number, e-mail address or Meta username). We fulfil the request within at most 30 days of receipt and confirm it.

**General deletion (all channels):**
You may request deletion of your data at any time by e-mailing hello@thinkai.hu. Under the GDPR "right to erasure" (Art. 17), we carry out the deletion unless there is a legal obligation (e.g. accounting records) to retain the data.

### 5. Your rights under the GDPR (Arts. 15–22)

Under the GDPR you have the following rights:
- **Right of access** (Art. 15),
- **Right to rectification** (Art. 16),
- **Right to erasure / "right to be forgotten"** (Art. 17),
- **Right to restriction of processing** (Art. 18),
- **Right to data portability** (Art. 20),
- **Right to object** (Art. 21),
- **Rights regarding automated decision-making** (Art. 22): AI-based classification does not produce legal effects concerning you; every automatic reply can be reviewed by a human in the approval system.

To exercise your rights, e-mail hello@thinkai.hu. You may lodge a complaint with the Hungarian National Authority for Data Protection and Freedom of Information (NAIH, https://naih.hu).

### 6. Data security

ThinkAI Kft. takes appropriate technical and organisational measures to protect the data:
- Database-level access control (Row Level Security, RLS),
- Encrypted connection (HTTPS/TLS) for all data transmission,
- Restricted access to service-role keys (backend server only),
- Regular security audits and vulnerability checks.

### 7. Cookies

The admin interface uses minimal cookies to maintain the login session (JWT token in localStorage). We do not use third-party cookies (advertising, analytics). The website shows a cookie-consent banner to visitors.

### 8. Contact

**Data Controller:** Think AI Korlátolt Felelősségű Társaság (Think AI Kft.)
**Registered office:** 1111 Budapest, Lágymányosi utca 12. Fsz. 2. ajtó, Hungary
**Company registration number:** 01-09-426295
**Tax number:** 32478620-2-43
**E-mail:** hello@thinkai.hu
**Data-breach reporting:** hello@thinkai.hu
