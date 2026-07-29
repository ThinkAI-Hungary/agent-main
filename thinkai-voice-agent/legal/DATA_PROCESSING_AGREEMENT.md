# Adatkezelési Megállapodás
# (Data Processing Agreement — DPA)

> **Verzió / Version:** 1.0
> **Hatálybalépés / Effective date:** 2026-07-29
> **Nyelvezet:** a jelen megállapodás magyar nyelven köttetik; az angol nyelvű
> változat tájékoztató jellegű, vita esetén a magyar szöveg az irányadó.

---

## Felek

**Adatkezelő / Szolgáltató:** Think AI Korlátolt Felelősségű Társaság
(„Think AI Kft.", „Szolgáltató", „Adatkezelő")
- Székhely: 1111 Budapest, Lágymányosi utca 12. Fsz. 2. ajtó
- Cégjegyzékszám: 01-09-426295
- Adószám: 32478620-2-43

**Megbízó / Ügyfél:** az a gazdasági társaság, egyéni vállalkozó vagy egyéb
szervezet, amely a jelen megállapodást az eaisyDesk SaaS szolgáltatásra vonatkozó
megrendelésével vagy a szolgáltatás használatba vételével elfogadja
(„Megbízó", „Ügyfél").

Az eaisyDesk szoftverszolgáltatás (a továbbiakban: „Szolgáltatás") többcsatornás,
AI-alapú ügyfélszolgálati platform, amely a Megbízó ügyfeleivel folytatott
kommunikáció (telefon, e-mail, Messenger, Instagram, WhatsApp) kezelésére,
automatizált válaszadására és ügyfélkapcsolat-kezelésre szolgál.

---

## 1. A szerepkörök meghatározása (kritikus pont)

A Felek kifejezetten rögzítik, hogy a Szolgáltatás nyújtása során **Think AI Kft.
az Adatkezelő**, a Megbízó pedig **Megbízóként / Ügyfélként** szerepel — nem
adatfeldolgozóként. Ez a megállapítás a GDPR 4. cikk (7) és (8) bekezdésén, valamint
a szoftver tényleges működésén alapul, az alábbi okok miatt:

1. **Infrastruktúra és eszközök:** a Szolgáltatás az Adatkezelő saját
   felhő-infrastruktúráján (Supabase, szerverek), saját szoftveres eszközeivel
   (AI-modellek: Google Gemini; üzenetküldés: Brevo, LiveKit, Meta API-k) működik.
   A Megbízó nem biztosítja az adatkezeléshez az infrastruktúrát vagy az eszközöket.

2. **Cél és eszközök meghatározása:** az Adatkezelő határozza meg az adatkezelés
   céljait (ügyfélszolgálat automatizálása, klasszifikáció, triage), az alkalmazott
   eszközöket és az adatkezelés módszereit (az AI pipeline, a megőrzési idő, a
   biztonsági intézkedések). A Megbízó a szoftver funkcióit használja, de nem
   szabja meg az adatkezelés technikai paramétereit.

3. **Hozzáférés:** az Adatkezelő kezeli a service-role hozzáféréseket, az
   adatbázist, az API-kulcsokat. A Megbízó csak a Think AI által biztosított
   webes felületen (admin fiókkal) éri el az adatokat, korlátozott jogosultsággal.

4. **Jogalap:** az adatkezelés jogalapát (hozzájárulás, szerződéses teljesítés,
   jogos érdek) az Adatkezelő az eaisyDesk Adatvédelmi tájékoztatójában
   (https://eaisy.hu/eaisydesk/privacy) határozza meg és teszi közzé.

Ennek megfelelően a jelen megállapodás nem az GDPR 28. cikk szerinti
adatfeldolgozói szerződés, hanem a két adatkezelő (vagy adatkezelő és
adatforrás-kezelő) közötti együttműködést és felelősségmegosztást rögzíti.

## 2. Az adatkezelés tárgya, jellege és célja

1. A Szolgáltatás keretében kezelt személyes adatok az eaisyDesk Adatvédelmi
   tájékoztatójában (1. és 2. melléklet) kerülnek felsorolásra, ideértve:
   - a Megbízó ügyfeleitől közvetlenül vagy Meta API-n, telefonon, e-mailben
     érkező kommunikáció tartalmát,
   - ügyfél-azonosító adatokat (név, telefonszám, e-mail cím, Meta azonosítók),
   - a kommunikációból keletkező interakciónaplókat, klasszifikációt, booking-adatokat.

2. Az adatkezelés céljait és jogalapjait az Adatkezelő az Adatvédelmi
   tájékoztatóban határozza meg (ügyfélszolgálat, AI-válaszadás, foglaláskezelés,
   triage, biztonság). A Megbízó a szoftver használatával ezeket a célokat
   tűzi ki saját ügyfelei vonatkozásában.

3. A kezelt adatok köre: kizárólag a szoftver működéséhez szükséges adatok
   (adattömörítés elve). A Megbízó köteles gondoskodni arról, hogy a
   Szolgáltatásba kerülő adatok a vonatkozó jogszabályoknak (pl. betegügyi
   titok, banktitok) megfeleljenek, és az adatok a Szolgáltatásba jogszerűen
   kerüljenek.

## 3. A Megbízó kötelezettségei

1. A Megbízó felelős azért, hogy a Szolgáltatásba (pl. a bookingba, az ügyfél-
   adatokhoz) általa bevitt adatok jogszerűek legyenek, és a Megbízó ügyfelei
   (érintettek) megfelelő tájékoztatást kaptak az adatkezelésről.

2. A Megbízó köteles a saját admin felhasználóinak hozzáférését, jelszavait és
   fiókjait megvédeni, és azonnal értesíti az Adatkezelőt (hello@thinkai.hu)
   bármilyen jogosulatlan hozzáférésről vagy adatvédelmi incidensről.

3. A Megbízó az Adatkezelőtől kapott hozzáféréseket (admin fiók, API-token)
   kizárólag a saját munkatársai számára, a szolgáltatás nyújtása céljából
   használhatja, harmadik félnek nem adhatja át.

4. A Megbízó felelős az érintetti kérelmek (hozzáférés, helyesbítés, törlés)
   fogadásáért a saját ügyfélkörében. A kérelmek teljesítésében az Adatkezelő
   technikailag közreműködik (l. 4. pont).

## 4. Az Adatkezelő kötelezettségei

1. Az Adatkezelő a Szolgáltatást a GDPR, valamint a vonatkozó magyar és európai
   jogszabályok (pl. Infotv., az elektronikus kereskedelmi törvény) szerint
   működteti.

2. Az Adatkezelő biztosítja a megfelelő technikai és szervezeti intézkedéseket
   (TOM — Art. 32):
   - HTTPS/TLS titkosítás minden adatátvitelnél,
   - adatbázis-szintű hozzáférés-szabályozás (Row Level Security),
   - a service-role hozzáférések korlátozása a backend szerverre,
   - rendszeres biztonsági audit és sebezhetőségi ellenőrzés,
   - biztonsági mentések és visszaállítási eljárás.

3. Az Adatkezelő fenntartja és naprakészen tartja az eaisyDesk Adatvédelmi
   tájékoztatóját a https://eaisy.hu/eaisydesk/privacy címen.

4. Az Adatkezelő biztosítja a Meta-platformokon (Messenger, Instagram, WhatsApp)
   történt adatkezelés esetén az automatikus adattörlési callbackot (Meta Data
   Deletion Callback), valamint az e-mail alapú adattörlési kérelmek teljesítését.

5. Adatvédelmi incidens esetén az Adatkezelő a érintetteket és a hatóságot a
   GDPR 33–34. cikk szerint tájékoztatja, és haladéktalanul értesíti a Megbízót.

## 5. Adattovábbítás, al-adatkezelők (alfeldolgozók)

1. A Szolgáltatás nyújtásához az Adatkezelő az alábbi adatfeldolgozókat és
   al-szolgáltatókat veszi igénybe, amelyek személyes adatokhoz férhetnek
   hozzá. Ezek a felsorolat szolgáltatók adatfeldolgozóiként (GDPR 28. cikk)
   állnak a Think AI Kft.-hez:

   | Szolgáltató | Szolgáltatás | Adatkezelés jellege | Átvitel EEA-n kívül |
   |---|---|---|---|
   | Supabase, Inc. | Adatbázis-hosting (EU-régió) | Adatfeldolgozó | nem (EU-régió) |
   | Google Ireland Ltd. / Google LLC | AI-alapú szövegfeldolgozás (Gemini), hang-alapú agent (LiveKit agenthez) | Adatfeldolgozó | lehetséges (SCC) |
   | LiveKit | Valós idejű hangkommunikáció infrastruktúra | Adatfeldolgozó | lehetséges |
   | Brevo (Sendinblue) | Tranzakciós és marketing e-mailek küldése | Adatfeldolgozó | nem (EU) |
   | Meta Platforms Ireland Ltd. | Messenger/Instagram/WhatsApp üzenetek kézbesítése | Önálló adatkezelő (Meta) | EU-n belül |

2. Az Adatkezelő az al-szolgáltatók listáját naprakészen tartja. Új al-adatkezelő
   bevonása esetén az Adatkezelő a Megbízót előzetesen tájékoztatja (kivéve, ha
   a GDPR 28. cikk (2) bekezdése szerint a szerződés már felhatalmazza).

3. Az EEA-n kívüli adattovábbítások esetén az Adatkezelő megfelelő garanciákat
   alkalmaz (Standard Contractual Clauses — SCC), és az adattovábbítás jogszerűségét
   az Art. 46 szerint biztosítja.

## 6. Az érintettek jogainak érvényesülése

1. Az Adatkezelő az eaisyDesk Adatvédelmi tájékoztatóban közzétett módon biztosítja
   az érintett jogainak (GDPR 15–22. cikk) érvényesülését.

2. Adattörlési kérelem esetén (GDPR 17. cikk) az Adatkezelő az adatokat törli,
   kivéve, ha a Megbízó részéről fennálló jogi kötelezettség (pl. számviteli törvény
   szerinti megőrzés) ezt megtiltja. Ilyen esetben az Adatkezelő a Megbízóval
   egyeztet.

3. A Megbízó saját ügyfeleitől érkező adatkezelési kérelmeket (hozzáférés,
   helyesbítés) átvezeti az Adatkezelőnek (hello@thinkai.hu), amely az adatbázis-
   módosítást technikailag végrehajtja.

## 7. Adatmegőrzés és törlés

1. Az Adatkezelő a kezelt adatokat a Szolgáltatás céljának megfelelő ideig őrzi,
   az Adatvédelmi tájékoztatóban meghatározott megőrzési idők szerint:
   - beszélgetésnapló: alapértelmezetten a beszélgetés lezárása után legfeljebb
     24 hónap,
   - ügyfél-azonosító adatok: az ügyfélkapcsolat fennállásáig, törlésig,
   - szervernaplók, IP-címek: legfeljebb 30 nap,
   - booking-adatok: a foglalás teljesülése + számviteli kötelezettség ideje.

2. A Megbízó kérheti a saját ügyfeleire vonatkozó adatok korábbi törlését, ha
   az ügyfélkapcsolat megszűnt. Ilyen esetben az Adatkezelő az adatokat 30 napon
   belül törli (kivéve a jogszabályi kötelezettség szerint megőrzendőket).

## 8. Adatvédelmi incidens (data breach)

1. Adatvédelmi incidens esetén az Adatkezelő és a Megbízó haladéktalanul (a
   tudomásszerzéstől számított 24 órán belül) értesíti egymást.

2. A bejelentés tartalmazza: az incidens jellegét, az érintett adatok körét,
   a várható következményeket és a megtett vagy tervezett intézkedéseket.

3. A hatósági és érintotti értesítésről (GDPR 33–34. cikk) az Adatkezelő gondoskodik.

## 9. Auditálhatóság és igazolások

1. Az Adatkezelő a Megbízó kérésére (évente legfeljebb 1 alkalommal) írásbeli
   igazolást ad a megfelelő technikai és szervezeti intézkedések alkalmazásáról.

2. Részletesebb auditot (helyszíni vagy távoli) a Megbízó csak az Adatkezelő
   előzetes írásbeli hozzájárulásával és a saját költségére végezhet, és csak
   annyiban, amennyiben az nem sérti az Adatkezelő üzleti titkait, vagy más
   ügyfelek adatainak védelmét.

## 10. Szerződés időtartama és megszűnése

1. A jelen megállapodás a Szolgáltatás nyújtásának teljes időtartama alatt hatályos.

2. A szerződés megszűnését követően az Adatkezelő a Megbízóra vonatkozó ügyfél-
   adatokat — a Megbízó külön írásbeli kérésére — exportálja (JSON vagy CSV
   formátumban), majd a kikötött határidőn (alapértelmezetten 90 napon) belül
   véglegesen törli az élő rendszerekből. A biztonsági mentésekből a törlés
   a mentések természetes forgási ideje alatt megtörténik (legfeljebb 30 nap).

3. A jogszabály szerint megőrzendő adatokat (pl. számviteli bizonylatok) az
   Adatkezelő a kötelező ideig őrzi.

## 11. Egyéb rendelkezések

1. **Alávetési záradék:** a Megbízó az Adatkezelő szolgáltatásait önként,
   a jelen megállapodás ismeretében veszi igénybe.

2. **Titoktartás:** a Felek a szerződésből származó információkat, a kezelt
   adatokat és az üzleti titkokat harmadik fél felé bizalmasan kezelik.

3. **Módosítás:** az Adatkezelő a jelen megállapodást és a hozzá tartozó
   Adatvédelmi tájékoztatót egyoldalúan módosíthatja; a lényeges módosításról
   a Megbízót e-mailben értesíti. A módosítás a értesítést követő 15. napon
   hatályba lép.

4. **Irányadó jog és jogviták:** a jelen megállapodásra a magyar jog az irányadó.
   A Felek közötti viták eldöntésére a Budapest Környéki Törvényszék kizárólagos
   illetékességgel rendelkezik.

5. **Kapcsolat:**
   - Think AI Kft. — hello@thinkai.hu
   - Adatvédelmi incidens: hello@thinkai.hu

---

*Think AI Korlátolt Felelősségű Társaság*
*1111 Budapest, Lágymányosi utca 12. Fsz. 2. ajtó*
*Cégjegyzékszám: 01-09-426295 · Adószám: 32478620-2-43*

*1. melléklet: eaisyDesk Adatvédelmi tájékoztató — https://eaisy.hu/eaisydesk/privacy*
