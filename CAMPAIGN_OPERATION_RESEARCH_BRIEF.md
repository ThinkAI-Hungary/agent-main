# RESEARCH BRIEF — Kimenő KAMPÁNY: jelenlegi állapot + üzemeltetési javaslatok

**A feladat:** kettős. (1) Térképezd fel, hogyan néz ki JELENLEG a kimenő kampány-rész a
rendszerben — adatmodell, UI-folyamat, worker, státuszok, csatornák — fájl:sor hivatkozásokkal.
(2) Ezután KONKRÉT ÜZEMELTETÉSI JAVASLATOT adj: hogyan kellene ezt a funkciót működtetni
egy valós fogászati rendelő tenantnál (elsősorban Dentors Szeged), a mai képességekhez
igazodva, reálisan sorba rendezve.

## 0. Előzmények — NE ezt kutasd újra

Az alábbiak már feltérképezve és dokumentálva vannak — olvasd el, és ÉPÍTS RÁJUK:
- `OUTBOUND_CALLS_RESEARCH_REPORT.md` (repo gyökér): a kimenő hívási infra (LiveKit SIP,
  Telnyx trunk/OVP whitelist, worker outbound ága, hívás-eredmény hiányok).
- `HANDOFF.md` eleje: a friss staging-fejlesztések (call_attempts napló + dedup + napi limit
  `OUTBOUND_DAILY_CALL_LIMIT`, Telnyx `whitelisted_destinations=['HU']` öngyógyítás,
  rögzítés-tájékoztatás a kimenő promptokban, RPC láthatósági javítás).

## 1. Amit a kampány-részből fel kell térképezni (jelenlegi állapot)

1. **Adatmodell**: `campaigns` tábla teljes sémája (mezők: client_ids? ai_instructions?
   channel? státusz? ütemezés? eredményszámlálók?), kapcsolata (tags? klienslista
   kiválasztás hogyan történik?), `email_campaigns` / `brevo_campaigns` viszonya a
   telefon-kampányhoz — külön funkciók vagy egy ernyő?
2. **UI-folyamat**: `CampaignWizardModal.tsx` + `OutboundPage.tsx` — mit kér be a wizard
   lépésenként (célcsoport? csatorna? ütemezés? script?), milyen státuszokat mutat, ki
   indíthat/állíthat le/ütemezhet, van-e eredmény-nézet?
3. **Csatornák**: email kampány (Brevo?) és telefon kampány — közös wizard, külön futtatók.
   Mennyire vannak készen külön-külön?
4. **Célcsoport-kiválasztás**: hogyan választja ki a user a kampány ügyfeleit (címkék?
   kézi lista? szűrő?) — és ez hogyan kapcsolódik a kliens `secondary_tags`-hez
   (árkérdés/kampánylead/potenciális ügyfél stb., lásd `classifier` + 5239324 commit)?
5. **Script/ai_instructions**: hol tárolódik, ki szerkesztheti, van-e sablon/előnézet,
   milyen promptba épül (server.py kampány-prompt)?
6. **Státuszgép és eredmények**: kampány-státuszok (Aktív/Megállítva/Befejezett/Részben
   sikeres/Sikertelen), `call_attempts` napló, hívás-eredmények, konverzió-mérés —
   mi mérhető ma és mi nem?
7. **Ütemezés**: scheduler + időzítés lehetőségek (`web_server.py` scheduler kampány-ág).
8. **Prod-állapot**: meglévő prod kampányok, mi történt velük (a korábbi jelentés: 2 telefon-
   kampány „Befejezett" hívás-nyom nélkül — ezt pontosítsd), hány email-kampány futott.

## 2. Üzemeltetési javaslat — ezt KONKRÉTANvárd el magadtól

A jelenlegi állapot ismeretében adj működtetési javaslatot legalább ezekre a kérdésekre
(mindegyiknél: javasolt döntés + mi kell hozzá + kicsi/közepes/nagy munka):

1. **Kik és mit indíthatnak?** (admin/member/agent-szerepek; jóváhagyási lépés kell-e
   a hívás-előtt; emberi felülvizsgálat telefonnál — a kutatás jogi kockázatot jelzett,
   HU: 2003. évi C tv. §155 kampányhívás + GDPR)
2. **Célcsoport-képzés**: miből legyen a céllista? (címkék alapú ajánlás: pl.
   'potenciális ügyfél' + szolgáltatás-érdeklődés; inaktív ügyfél; no-show) —
   hogyan ellenőrizhető a lista INDÍTÁS ELŐTT (előnézet, darabszám, teszthívás)?
3. **Időzítés**: napszak/nap szabályok (mikor NE hívjon), ütemezett indítás, PEST-i idő.
4. **Script-governance**: ki írja/erősíti meg a scriptet, változatkezelés, teszt-hívás
   indítás előtt, tiltott tartalom (pl. árajánlat megadása a hívásban).
5. **Limit és költség**: kampányonkénti max hívás, napi tenant-limit (már van: 200),
   óradíj-védelem, költség-becslés indítás előtt ($0,005/perc alap).
6. **Eredménykezelés**: mit csinál a rendszer a hívás UTÁN (leirat + klasszifikáció már
   van) — konverzió-mérés, visszahívás-jelzés, no-answer → második próbálkozás vagy
   SMS-fallback, eredmény-nézet a UI-ban.
7. **Monitoring/riasztás**: mit lásson a rendelő (futó kampány állapota, hibaszám),
   mit a platform-üzemeltető.
8. **Fokozatos bevezetési terv**: 0. lépés (ami már él) → 1. lépés (belső teszt) →
   2. lépés (egy tenant, kis lista, emberi felügyelettel) → 3. lépés (önálló üzem).
   Mindegyik lépéshez: előfeltételek + elfogadási kritériumok.

## 3. Szabályok

- CSAK OLVASÁS (kód + read-only SELECT). Kód/DB módosítás, deploy: tilos.
- MCP csapda: `mcp__supabase__*` = PROD, `mcp__supabase-staging__*` = STAGING — csak
  read-only. Kulcsértékeket soha ne írj ki.
- Minden állítás: fájl:sor hivatkozás. A javaslatok a MAI képességekhez igazodjanak
  (ne fantáziálj új architektúrát — minimál változtatással megvalósítható működtetés a cél).

## 4. Végeredmény (a végső üzeneted)

Strukturált magyar jelentés:
- A) Jelenlegi kampány-rész térkép (adatmodell, UI, worker, státuszok, csatornák) — fájl:sorral.
- B) Üzemeltetési javaslatok a 8 kérdésre (döntés + mi kell hozzá + munka nagysága).
- C) Fokozatos bevezetési terv (0→3 lépés, elfogadási kritériumokkal).
- D) Nyílt kérdések, amiket csak a user (Dentors/rendelő) tud eldönteni.
