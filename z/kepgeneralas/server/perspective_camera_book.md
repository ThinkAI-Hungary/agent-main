# PERSPEKTÍVA ÉS KAMERAÁLLÁS — Teljes Referenciakézikönyv AI Termékgeneráláshoz

> **Ez a dokumentum egy élő kézikönyv.** Minden fejezet konkrét, alkalmazható tudást tartalmaz
> a FLUX prompt-készítéshez, a Sharp compositing-hoz, és a Claude Vision checkup-hoz.
> A végén található NEURO MAP összeköti az összes fogalmat a PerspectiveAnalysis JSON-nel.
> A fényes könyv párja — a perspektíva törvényei épp annyira fontosak, mint a fény törvényei.

---

# RÉSZ I — GEOMETRIAI ALAPOK

## Fejezet 1: A Perspektíva Természete

### 1.1 Mi a perspektíva?

A perspektíva az a geometriai transzformáció, amellyel a háromdimenziós világ
leképeződik egy kétdimenziós képfelületre (szenzor, film, canvas). Nem egyszerűen
"kicsik a távoli dolgok" — hanem egy teljes, szabályokkal teli geometriai rendszer.

**Három alaptípus:**

| Típus | Eltűnési pont | Használat |
|---|---|---|
| **Lineáris perspektíva (1VP)** | 1 db, horizonton | Frontális architektonikus |
| **Kétpontos perspektíva (2VP)** | 2 db, horizonton | Épületek, asztalok oldalra forgatva |
| **Hárompontos perspektíva (3VP)** | 3 db | Drámai felülnézet/alulnézet |

**AI következmény:** Egy generált háttér és egy composited termékfotó CSAK akkor néz
ki egységesnek, ha pontosan ugyanannyi eltűnési pontjuk van, és ezek a pontok
azonos pozícióban vannak a kép koordinátarendszerében.

---

### 1.2 Eltűnési pontok (Vanishing Points)

Minden párhuzamos vonal, ami nem párhuzamos a képsíkkal, egy közös eltűnési
pontban fut össze a horizonton.

**1VP (frontális perspektíva):**
- A kamera PONTOSAN szemből néz a tárgyra
- Az asztal előlap párhuzamos a képsíkkal
- Csak mélységi vonalak futnak össze (középen)
- **Jellemzők:** Négyzetes lapok maradnak négyszögesek, nincs oldalnézet

**2VP (szögletes perspektíva — "three-quarter view"):**
- A kamera kissé jobbra vagy balra van a tárgy tengelyéhez képest
- Két eltűnési pont: bal és jobb horizonton
- **Jellemzők:** A tárgy sarkait látjuk, az oldalfelületek láthatók

**3VP (drámás szög):**
- A kamera felülről vagy alulról néz
- Harmadik eltűnési pont a kép tetején (felülnézet) vagy alján (alulnézet)
- **Jellemzők:** A vertikális vonalak is összefutnak

**KRITIKUS SZABÁLY:** Ha a termék 2VP-ben van fotózva (ami az eredeti
Poli-Farbe vödörfotó esetén igaz — kicsit felülről nézve → 3VP tendencia),
akkor a háttér asztalának PONTOSAN UGYANOLYAN VP-rendszerben kell lennie.

---

### 1.3 Horizont Vonal (Eye Level Line)

A horizontvonal az a képzeletbeli vízszintes vonal, amely a kamera objektívének
magasságában húzódik. Ez a perspektíva legfontosabb vonala.

**Horizont magassága és a termék viszonya:**

    Ha horizont a kép 50%-ánál van → kamera a tárgy közepével egy magasságban
    Ha horizont a kép 30%-ánál van → kamera a tárgy ALATTI nézőpontból
    Ha horizont a kép 70%-ánál van → kamera a tárgy FÖLÖTTI nézőpontból (közönséges termékfotó)

**Termékfotózásban tipikus horizont pozíciók:**

| Kameraállás | Horizont a képen | Hatás |
|---|---|---|
| Szemmagasság (eye-level) | ~45-55% | Tárgy "velünk egyenlő", egyenlő méltóság |
| Kissé felülről (slightly above) | ~35-45% | Klasszikus termékfotó, természetes |
| Felülnézet (high angle) | ~20-35% | Tárgy teteje dominál, kicsi/kiszolgáltatott hatás |
| Alacsony (low angle) | ~60-75% | Tárgy monumentális, nagyobb hatás |

**AI következmény:** A horizont pozíciója MEGHATÁROZZA, hogy az asztal előlapján
mennyi látszik. Ha a kamera felülről néz → az asztallap teteje is látható → 
az előlap nagy ívű perspektívával fut a kép aljára.

---

### 1.4 Az Asztal Perspektívája

Az asztal az a felület, amelyre a terméket compositing-gal helyezzük. Az asztal
perspektívájának PONTOSAN illeszkednie kell a termék perspektívájához.

**Frontális kamera (1VP, 0° forgás):**

    - Az asztal előlapja egyenes vízszintes vonal (nincsenek összefutó oldalvonalak)
    - Csak a mélységvonalak futnak a horizontra
    - Az asztal lapja kis sávként látszik (ha kamera magasabb mint az asztallap)
    - FLUX prompt: "camera at eye level facing straight forward, 
      table surface as a flat horizontal band, 
      table edges run straight left and right, not converging"

**Kicsit felülről (2-3VP, ~15-30° ferde kameraállás):**

    - Az asztal előlapja KONVERGÁL balra-jobbra
    - Az asztallap látható felülete kiszélesedik
    - Bal oldali és jobb oldali asztalsarok látható, mindkettő felfelé fut
    - FLUX prompt: "slightly elevated camera angle showing the tabletop surface,
      perspective lines of table converge toward a vanishing point on the horizon,
      table surface visible from slightly above"

**KULCSPROBLÉMA az eredeti képben:**
A Poli-Farbe vödör FENTRŐL VAN FOTÓZVA (kb. 20-30° felülnézet) → 3VP tendencia,
a vödör teteje látható, a vödör oldalai enyhén lefele konvergálnak.
DE a generált háttér FRONTÁLISAN van generálva → az asztal és a fal nem konvergál.
EREDMÉNY: a vödör "lebeg" vagy "kukucskál" a frontális asztalon — inkonzisztens perspektíva.

---

## Fejezet 2: Kameraállás Taxonómiája

### 2.1 Függőleges tengelyszög (Tilt / Elevation Angle)

    phi = 0°    → teljesen vízszintes kamera, "oldalról nézve"
    phi = 15°   → kissé felülről ("slightly above") — leggyakoribb termékfotó
    phi = 30°   → 45 fokos perspektíva, asztal jól látható
    phi = 45°   → félúton felülről-oldalt
    phi = 60°   → erős felülnézet
    phi = 90°   → merőlegesen felülről (flat lay / overhead)

**Mi látszik phi értékétől függően:**

    phi=0°:  Asztalt szinte nem látni, terméket oldalról
    phi=15°: Asztallap ~5-10% széles sáv előtér
    phi=30°: Asztallap ~20-25% széles, asztaltávolság érezhető
    phi=45°: Asztallap domináns, ~35-40%
    phi=90°: Csak az asztallapot látjuk, a termék tetejét

**A vödörképen észlelt szög: kb. phi=20-25°**
- A vödör teteje (kék fedél) látható és élesen rajzolódik ki
- Az asztallap eleje egy szélesebb sáv
- A vödör oldalai enyhén lefele futnak

---

### 2.2 Vízszintes tengelyszög (Pan / Azimuth Angle)

    psi = 0°    → teljesen szemből (frontális)
    psi = 15°   → kissé jobbra vagy balra tolva
    psi = 30°   → 45°-os nézet, tárgy sarka középen
    psi = 45°   → "hero shot", szimmetriából kilépve
    psi = 90°   → tárgy oldalról (profilfotó)

**Mi változik psi értékétől függően:**

    psi=0°:  Csak az elülső lap látható, nincs oldalnézet
    psi=15°: Kis oldalnézet, 2VP elkezd megjelenni
    psi=30°: Jobb oldalnézet látható, 2VP erős
    psi=45°: Mindkét oldallap közel egyenlő látható
    psi=90°: Csak oldalap látható

**A vödörképen észlelt szög: kb. psi=0-5°** (szinte frontális)

---

### 2.3 Fókusztávolság (Focal Length) és Perspektíva Torzítás

A fókusztávolság ALAPVETŐEN megváltoztatja a perspektíva torzítás mértékét:

| Fókusztávolság | Látószög | Perspektíva hatás |
|---|---|---|
| 14-24mm | Ultra-wide | Erős torzítás, buborék hatás, közel lévők túl nagyok |
| 35mm | Wide-normal | Enyhe torzítás, természetes közelség |
| 50mm | "Human eye" | Minimális torzítás, "valósnak" érzett arány |
| 85mm | Short tele | Tömörítés, lapos perspektíva, flattering portrék |
| 135-200mm | Tele | Erős tömörítés, háttér és előtér "összelapul" |

**AI következmény:**
- 85-135mm fókusz → háttér és termék "közel kerül" → háttér részletei nagyobbak
- 35-50mm fókusz → természetes arányok, közepes mélység
- Ha a FLUX háttér 50mm-es perspektívára van optimalizálva, de a termék fotó
  135mm-es → az arányok inkonzisztensek lesznek

**Felismerhető jellemzők:**

    Wide (35mm alatt): hordó/buborék torzítás az asztalszéleken
    Normal (50mm): egyenes vonalak, nincs torzítás
    Tele (85mm+): az asztal viszonylag lapos, háttér közeli részletei nagyok

---

### 2.4 Dőlésszög (Roll)

    roll=0°: Kamera egyenesen tartva, horizont vízszintes
    roll≠0°: Döntött kamera (Dutch angle), horizont ferdén megy

**Termékfotóban:** roll mindig 0° — a horizont mindig vízszintes.
Ha a generált háttérben döntött a horizont → azonnal kiszúrható.

---

## Fejezet 3: Perspektíva-Konzisztencia Törvényei

### 3.1 Az Első Törvény: Horizont Konzisztencia

**TÖRVÉNY:** A composited termék és a generált háttér HORIZONTVONALÁNAK
ugyanazon a képkoordináta-pozícióban kell lennie.

**Hogyan mérjük fel a termékfotóból:**
1. Azonosítsuk az asztal felső élét (surfaceY)
2. A kamera magasságát a termék magasságának %-ában fejezzük ki
3. Ez adja meg a horizont Y pozícióját a képen

**Matematikailag:**

    horizonY_pct = (surfaceY_pct + (phi_deg / 90) * (100 - surfaceY_pct))

    Ahol:
    - surfaceY_pct: az asztal felső széle a kép tetejétől (tipikusan 60-80%)
    - phi_deg: függőleges kameraállás szög (0-90°)

**Példa (vödörkép):**
    surfaceY = 75% (az asztallap 75%-nál van)
    phi ≈ 20°
    horizonY ≈ 75% + (20/90) * (100-75%) ≈ 75% + 5.5% ≈ 80.5% (a horizont a képen kívül lent)

---

### 3.2 A Második Törvény: Eltűnési Pont Konzisztencia

**TÖRVÉNY:** Az asztal perspektívavonalai ugyanabba az eltűnési pontba kell
hogy fussanak, mint a terméken látható perspektíva jelzők.

**Hogyan mérjük fel:**
- Frontális termék (1VP): az asztal oldal élei párhuzamosak kell legyenek
- Enyhe felülnézet (2-3VP): az asztal oldalélei FELFELÉ futnak és KIFIUTNAK
  a horizonton lévő eltűnési ponthoz

**Súlyos hiba:** Ha a termék 3VP-ben van (felülnézet), az asztal pedig
1VP-ben van generálva → az asztal "dobogószerűen" néz ki, a termék "rá van téve"
mint egy matrica, nem úgy mint ami valóban azon áll.

---

### 3.3 A Harmadik Törvény: Méretarány Konzisztencia

**TÖRVÉNY:** A termék mérete a képen ARÁNYOS kell legyen a háttér perspektíva
által sugallt távolsággal és fókusztávolsággal.

**Téves arány jelei:**
- A termék "túl nagy" az asztalhoz képest → úgy néz ki, mintha miniature asztalon lenne
- A termék "túl kicsi" → lebeg, "rátéve" érzés
- Az asztal részletei (szálak, textúra) nagyobb felbontásúak mint kellene a mélységhez képest

**Fókusztávolság hatása az arányra:**

    50mm, 1m távolság:  termék H_kép = obj_valódi_H / 1m * sensor_pitch
    85mm, 1.5m távolság: termék H_kép ≈ (85/50) * (1/1.5) * előző → kisebb perspektíva torzítás
    135mm, 2m: még laposabb, termék és háttér "közelebb vannak egymáshoz"

---

### 3.4 A Negyedik Törvény: Mélységi Életlen Konzisztencia (Depth of Field)

**TÖRVÉNY:** Ha a termék éles (in focus), akkor a mögötte lévő háttér DOF
alapján PONTOSAN annyira legyen elmosódva, amennyit a kamera-beállítások
(fókusztávolság, aperture, távolság) sugallnak.

**Bokeh erőssége fókusztávolságtól és apertúrától:**

    DOF = (2 * N * c * (u/f)²) / (1 - (u/f)²) ≈ 2Nc(u/f)² ha u>>f

    Ahol:
    N = f-szám (pl. f/2.8)
    c = circle of confusion (35mm szenzornál ~0.030mm)
    u = fókusztávolság a tárgytól (méter)
    f = fókusz (mm)

**Praktikus szabályok termékfotóhoz:**

    f/2.8, 85mm, u=1.2m: DOF ≈ 7cm → nagyon sekély, háttér erősen életlenül
    f/5.6, 85mm, u=1.2m: DOF ≈ 14cm → közepes életlenítés
    f/8,   50mm, u=1.0m: DOF ≈ 22cm → kisebb életlenítés
    f/11,  50mm, u=1.0m: DOF ≈ 30cm → mélyebb élességi sík

**AI következmény:**
Ha a FLUX háttér éles textúrájú közel-tárgyakkal van teli, de a termékfotó
sekély DOF-ra utal → inkonzisztens. A háttérnek annyira kell életlennek lennie,
amennyit a termékfotó eredeti DOF beállítása sugall.

---

### 3.5 Az Ötödik Törvény: Asztal Szél Láthatóság

**TÖRVÉNY:** Az asztal látható felszíne és szélessége KISZÁMÍTHATÓ
a kameraállásból és a horizont pozícióból.

**Asztal előlap látható mélysége:**

    Látható_előlap_mélység_pct = (horizonY_pct - surfaceY_pct) * szorzó

    phi=15°: ~5% látható asztallap mélység
    phi=20°: ~10% látható asztallap mélység
    phi=30°: ~20% látható asztallap mélység
    phi=45°: ~35% látható asztallap mélység

**A vödörképben:** phi≈20°, ezért az asztallap előlapja kb. 10-15% mélység.
A generált háttérben ezért CSAK egy viszonylag KESKENY asztallap-sáv kell
legyen, ami pontosan a kép aljától számítva 10-15%-ig tart.

---

## Fejezet 4: Asztal Generálási Törvények

### 4.1 Az Asztal Szél Pozíciója és FLUX Generálás

**Az asztal felső szélét pontosan be kell állítani:**

    surfaceY = 75% → az asztal teteje a kép 75%-ánál van
    
    FLUX prompt elem:
    "table surface top edge at exactly 75% from top of image,
     lower 25% is the physical wooden/steel table surface,
     upper 75% is air and workshop background"

**Mi HIÁNYZOTT eddig:** Az asztal generálásakor nem adtuk meg a PERSPEKTÍVA
SZÖGÉT. Ezért FLUX "kitalálta" a saját perspektíváját, ami nem egyezett
a termék fotójának perspektívájával.

**Új szabály — perspektíva egyeztetés:**
A FLUX BG promptban EXPLICIT MÓDON meg kell adni:
1. A kamera szögét (phi = felülnézeti szög)
2. Az eltűnési pont pozícióját (frontális vs. enyhe oldalnézet)
3. Mennyit látunk az asztal lapjából

---

### 4.2 Az Asztalszél Vizuális Hatása

**HELYES (phi=20° felülnézet):**

    FLUX prompt:
    "slightly elevated camera angle, about 20 degrees above horizontal,
     tabletop surface visible as a substantial flat plane in the lower portion,
     table edges converge slightly toward the horizon at eye level,
     perspective depth visible on tabletop surface"

**HELYTELEN (frontális, amit eddig csináltunk):**

    FLUX prompt:
    "table surface visible" (enélkül FLUX frontálisan generál) → INKONZISZTENS

**Az inkonzisztencia oka:**
A termék phi=20°-ban volt fotózva → látjuk a tetejét.
A háttér phi=0°-ban lett generálva → az asztal egy vékony vonal.
→ A termék "lebeg" az asztalon, nem természetesen áll rajta.

---

### 4.3 Asztal Textúra Felbontása és Távolság

A háttér generálásában az asztal textúrájának FELBONTÁSA jelezheti a távolságot.

**Közel van a kamera (u < 1m):**
- Az asztallap textúra részletes, szálak/karc jól látható
- Nagy bokeh a háttérben

**Távolabb van a kamera (u > 1.5m):**
- Asztaltextúra enyhe elmosódással, részletek kevésbé élesek
- Kisebb bokeh a háttérben

**Tipikus termékfotó:** u = 0.8-1.2m távolság (85mm lencse esetén)

---

## Fejezet 5: Tárgy-Kamera Interakció Törvényei

### 5.1 A Tárgy Tetejének Láthatósága

Ha a kamera FELÜLRŐL néz (phi > 0°), a tárgy teteje látható.
A látható tető mértéke a phi szögtől függ:

    phi=0°:  Tető nem látható (merőleges oldalra nézünk)
    phi=15°: Tető kis sávja látható (fedél szélső cm-ei)
    phi=20°: Tető kb. 15-20%-a látható (a vödörfedél "lapos" tárcsaként látszik)
    phi=30°: Tető ~30-35% látható
    phi=45°: Tető ~50% látható (45°-os rombusz hatás)

**A vödörképen:** A kék fedél JÓL LÁTHATÓ, ami phi≈20-25° értékre utal.

**AI következmény:** Ha a termék teteje jól látható, a FLUX háttérnek is
"felülről nézett" perspektívában kell lennie — nem frontálisan.

---

### 5.2 A Tárgy Alapjának Viszonya az Asztalhoz

A tárgy aljának PONTOSAN az asztal felső szélénél kell lennie (surfaceY).
De a PERSPEKTÍVA SZÖGE meghatározza, hogyan "ül" a tárgy az asztalon:

**phi=0° (frontális):**
- A tárgy alja egyenes vonal, pontosan az asztal szélén
- Az asztal "mögötte" van, nem "alatta"
- Kevés kontakt-érintkezési felület látható

**phi=20° (kissé felülről):**
- A tárgy alja KICSIT PERSPEKTÍVIKUS OVÁL
- Az asztalon tárgy lábnyomán belülre egy kis terület látszik
- Ez adja az "ott áll az asztalon" érzést

**phi>30° (erős felülnézet):**
- A tárgy alja határozottan ovális/elliptikus
- Nagy asztallap-terület körülötte látható
- "Flat lay" hatás

---

### 5.3 Hengeres Tárgy Ellipszis Aránya (pl. vödör)

Hengeres tárgyaknál (vödör, palack, konzervdoboz) a TETEJe és ALJA
ellipszis alakban látszik, amelynek aránya a kameraállástól függ:

    Ellipszis kis tengely / nagy tengely = sin(phi)

    phi=0°:   0.00 → vízszintes vonal (nem látjuk a tetőt)
    phi=15°:  0.26 → lapos ellipszis
    phi=20°:  0.34 → közepes lapos ellipszis (a vödörfedélnél ez látható)
    phi=30°:  0.50 → félelő arányú ellipszis
    phi=45°:  0.71 → közel körös ellipszis
    phi=90°:  1.00 → kör (merőlegesen felülről)

**AI checkup:** Ha a termékfotón látható fedél-ellipszis aránya ≈0.34, 
akkor phi≈20°, és a háttérnek is 20°-os perspektívában kell lennie.

**Ellipszis arány mérése képből:**

    ratio = b / a
    ahol b = ellipszis rövidebbik tengelye (px), a = nagyobbik tengelye (px)
    phi = arcsin(ratio) → fokokban

---

## Fejezet 6: FLUX Prompt Konzisztencia

### 6.1 Perspektíva Leírás FLUX Számára

FLUX megérti a perspektívát ha KONKRÉT, VIZUÁLIS LEÍRÁSSAL adjuk meg —
nem matematikai szögekkel, hanem azzal, MIT LÁTUNK.

**Frontális (phi=0°, psi=0°):**

    "camera at eye level, facing directly forward,
     table surface as a thin horizontal line, barely visible,
     no tabletop depth visible, product seen straight-on from the side,
     single-point perspective, parallel table edges"

**Kissé felülről (phi=15-20°, psi=0°) — A LEGGYAKORIBB TERMÉKFOTÓ:**

    "camera slightly elevated, approximately 15-20 degrees above horizontal,
     small amount of tabletop surface visible in foreground,
     product seen mostly from the front with slight downward angle,
     top of product slightly visible, two-point perspective tendency,
     table edges converge slightly at the sides"

**Közepes felülnézet (phi=30°, psi=15°):**

    "elevated camera at 30-degree downward angle, three-quarter view,
     significant tabletop area visible in foreground,
     product top clearly visible, product sides both visible,
     two-point perspective with strong vertical convergence"

**Lapos felülnézet (phi=60-70°):**

    "high angle shot, camera pointing steeply downward,
     dominant tabletop surface visible, product appears compact,
     product top occupies most of the object's visible area"

---

### 6.2 Fókusztávolság Leírás FLUX Számára

    35mm look: "wide-angle lens, slight barrel distortion at edges,
                nearby elements appear larger than expected, 
                strong perspective depth"

    50mm look: "standard lens, natural undistorted perspective,
                proportions appear true to human eye"

    85mm look: "portrait lens compression, background appears closer to subject,
                shallow depth of field, subject isolated from background,
                subtle telephoto flattening"

    135mm look: "telephoto compression, very shallow depth of field,
                 background elements appear large and close behind subject,
                 minimal perspective distortion"

---

### 6.3 Mélységi Elmosódás (Bokeh) Leírás

    Erős bokeh (f/1.8-2.8): "extremely blurred background, heavy bokeh,
                              background entirely out of focus,
                              dreamy soft background"

    Közepes bokeh (f/4-5.6): "moderately blurred background,
                               background shapes recognizable but soft,
                               gentle out-of-focus effect"

    Kevés bokeh (f/8+): "background relatively sharp,
                          details visible in background,
                          deep depth of field"

---

## Fejezet 7: Perspektíva Hibák Diagnosztikája

### 7.1 "Lebegő" Termék Hiba

**Tünet:** A termék nem ül természetesen az asztalon, lebegni látszik.

**Okok:**
1. A termék phi szöge ELTÉR a háttér phi szögétől
2. A termék kontaktárnyéka nem a surfaceY-on van
3. A termék mérete nem arányos az asztal perspektívával

**Megoldás:**
- Mérjük fel a termékfotó phi szögét (ellipszis ratio)
- Generáljuk a hátteret ugyanolyan phi értékkel
- A surfaceY-t pontosan egyezzük

---

### 7.2 "Matricaszerű" Termék Hiba

**Tünet:** A termék úgy néz ki, mintha ráragasztották volna a háttérre.
Nincs 3D-s beágyazottság érzet.

**Okok:**
1. Perspektíva VP pozíciója eltér (LEGGYAKORIBB OK)
2. Nincs contact shadow / AO
3. A termék élessége nem illeszkedik a DOF-hoz

**Megoldás:**
- Egyeztesd a VP pozíciót (horizont magasság)
- Erősítsd a contact shadow-t (de ne legyen túl erős → fekete korong)
- Ha a háttér életlen (bokeh), a termék alapi pixeleit enyhén blurred-ként kezeld

---

### 7.3 "Arány Torzítás" Hiba

**Tünet:** A termék arányai "nem stimmelnek" a háttér méretarányával —
pl. a vödör gigantikusnak tűnik az asztalhoz képest.

**Okok:**
1. A háttér teleobjektívvel generálva, a termék wide-angle-lel fotózva
2. A termék scaling (productTargetW/H) nem veszi figyelembe a DOF-t
3. A háttér asztal "túl közel" van generálva

**Megoldás:**
- Igazítsd a fókusztávolságot (foalLength) a LightingAnalysis-hoz
- A háttér promptban adj meg fókusztávolságot
- A termék scaling legyen arányos a DOF-ból kiolvasható kamerabeállással

---

## Fejezet 8: PerspectiveAnalysis JSON Schema

### 8.1 A JSON Struktúra

Ez a JSON a termékfotó elemzésekor jön létre (ugyanolyan fázisban mint
a LightingAnalysis), és a háttérgeneráláshoz szükséges összes
perspektíva-paramétert tartalmazza.

```json
{
  "meta": {
    "analysisVersion": "1.0",
    "objectType": "cylindrical_bucket | rectangular_box | bottle | irregular",
    "confidence": 0.0
  },

  "camera": {
    "elevationAngleDeg": 0,
    "azimuthAngleDeg": 0,
    "rollDeg": 0,
    "estimatedFocalLengthMm": 50,
    "estimatedFstop": "f/5.6",
    "estimatedDistanceM": 1.2
  },

  "perspective": {
    "type": "1VP | 2VP | 3VP",
    "horizonYPercent": 80,
    "vanishingPoint1X": 50,
    "vanishingPoint2X": null,
    "tableSurfaceVisibleDepthPct": 15,
    "tableEdgesConverge": false,
    "verticalLinesConverge": false
  },

  "topEllipse": {
    "visible": true,
    "minorAxisPx": 0,
    "majorAxisPx": 0,
    "ratio": 0.34,
    "impliedElevationDeg": 20
  },

  "depthOfField": {
    "estimatedBokehLevel": "none | light | moderate | heavy",
    "backgroundBlurPct": 30,
    "foregroundSharpnessPct": 95
  },

  "fluxPromptComponents": {
    "cameraAngleDescription": "",
    "tableTopDescription": "",
    "perspectiveDescription": "",
    "bokehDescription": "",
    "fullBgPerspectivePrompt": ""
  },

  "compositingHints": {
    "productElevationCompensation": 0,
    "surfaceContactOvalRatio": 0.34,
    "shadowDirectionAngle": 0,
    "useEllipticalContactShadow": true
  }
}
```

---

### 8.2 JSON Mezők Részletes Leírása

**`camera.elevationAngleDeg`** (0-90°):
A kamera felülnézeti szöge. 0° = teljesen vízszintes. 90° = merőlegesen felülről.
Leolvasás: a tárgy tetejének ellipszis arányából → `phi = arcsin(b/a)`
Tipikus termékfotó: 15-25°.

**`camera.azimuthAngleDeg`** (-90 — +90°):
A kamera vízszintes elfordulása. 0° = frontális. ±30° = three-quarter.
Leolvasás: az oldalnézet láthatóságából, a VP eltéréséből.

**`camera.estimatedFocalLengthMm`** (14-400mm):
Kiszámított fókusztávolság a perspektíva torzításból és a tárgyarányból.
Tipikus termékfotó: 50-135mm.

**`perspective.horizonYPercent`** (0-100%):
A horizont Y pozíciója a képen (felülről mérve %).
Ha horizont a képen belül → horizonY < 100. Ha a képen kívül (felülnézet) → >100.

**`perspective.tableSurfaceVisibleDepthPct`** (0-50%):
Az asztallap látható mélysége a kép magasságának %-ában.
phi=15° → ~5%, phi=20° → ~10-15%, phi=30° → ~20-25%.

**`topEllipse.ratio`** (0.0-1.0):
A hengeres tárgy tetejének ellipszis aránya (kisebb tengely / nagyobb tengely).
0.0 = vonal (teljesen oldalról), 1.0 = kör (merőlegesen felülről).
Ebből: `phi = arcsin(ratio)`.

**`fluxPromptComponents.fullBgPerspectivePrompt`**:
A FLUX háttérgeneráló promptba közvetlenül beilleszthető perspektíva leírás.
Ez fog bekerülni a bgOnlyPrompt-ba a jelenlegi `surfaceCompositionInstruction` MELLÉ.

**`compositingHints.surfaceContactOvalRatio`**:
A contact shadow ellipszis aránya — ha a kamera felülről néz, a contact shadow
nem kör/vonal, hanem ELLIPSZIS kell legyen, amelynek b/a arány = sin(phi).
Ez megoldja, hogy az "ovál" természetes legyen a felülnézetes képen.

---

## Fejezet 9: Claude Vision Felismerési Szabályok

### 9.1 Elevation Angle Becslése

Claude Vision-nek az alábbi vizuális jelzők alapján kell becsülnie phi-t:

**1. Hengerek esetén (vödör, palack, konzervdoboz):**
- Mérje meg a tetőellipszis arányát: `ratio = b/a`
- `phi = arcsin(ratio)` → fokokban

**2. Szögletes tárgyak esetén (doboz, könyv):**
- Mérje meg a felső él perspektíva szögét
- Ha a felső él vízszintes → phi közel 0°
- Ha a felső él trapéz alakú → phi > 0°

**3. Asztal alapján:**
- Mérje meg az asztallap látható mélységét a kép magasságának %-ában
- 0-5% → phi ≈ 0-10°
- 5-15% → phi ≈ 10-20°
- 15-30% → phi ≈ 20-35°

---

### 9.2 Azimuth Angle Becslése

**Hengeres tárgyak esetén:**
- Ha csak az elülső felület látható → psi = 0°
- Ha egy kis oldalnézet látható → psi = 5-15°
- Ha az oldalnézet kb. egyenlő az elülső nézettel → psi = 45°

**Fogantyú / nyél alapján (vödör):**
- Ha a fogantyú szimmetrikusan felette van → psi ≈ 0°
- Ha a fogantyú eltolódott → psi > 0°

---

### 9.3 Fókusztávolság Becslése

**Perspektíva torzítás alapján:**
- Hordó torzítás az éleken → wide (< 35mm)
- Párhuzamos vonalak → normal (50mm)
- "Lapos" kép, háttér "közel" → tele (85mm+)

**DOF alapján (bokeh mennyisége):**
- Nagyon erős bokeh (háttér teljesen életlenül) → f/2.8 + tele, OR nagyon közeli tárgy
- Közepes bokeh → f/4-5.6, 85mm
- Kevés bokeh → f/8+, wide

---

## Fejezet 10: Rendszer Integráció

### 10.1 Ahol a PerspectiveAnalysis Bekerül a Pipeline-ba

```
[Termék feltöltés]
    ↓
[/api/image/analyze]
    → LightingAnalysis JSON (már megvan)
    → PerspectiveAnalysis JSON (ÚJ) ← CLAUDE VISION MÉRI FEL
    ↓
[/api/image/composite-generate]
    → bgOnlyPrompt összeállítás:
        sceneKeywords          (helyszín)
        surfaceCompositionInstruction (asztallap pozíció)
        productAwareAddition   (fény színe/iránya)
        perspectivePrompt      (ÚJ: phi, DOF, asztal mélység) ← INNEN JÖN
    → compositing paraméterek:
        surfaceContactOvalRatio → contact shadow ellipszis (ÚJ)
        productElevationCompensation → termék elhelyezés kiigazítás (ÚJ)
```

---

### 10.2 A Perspektíva Prompt Összeállítási Logika

```typescript
// PerspectiveAnalysis-ból a bgOnlyPrompt-ba:
function buildPerspectivePrompt(pa: PerspectiveAnalysis): string {
  const phi = pa.camera.elevationAngleDeg;
  const tableDepth = pa.perspective.tableSurfaceVisibleDepthPct;
  const focal = pa.camera.estimatedFocalLengthMm;
  const bokeh = pa.depthOfField.estimatedBokehLevel;

  // Kameraállás leírása FLUX számára
  let cameraDesc: string;
  if (phi < 5) {
    cameraDesc = 'camera at eye level facing straight forward, minimal tabletop visible';
  } else if (phi < 15) {
    cameraDesc = `camera slightly elevated (${phi}° downward angle), small tabletop strip visible in foreground`;
  } else if (phi < 25) {
    cameraDesc = `camera moderately elevated (${phi}° downward angle), substantial tabletop visible in foreground`;
  } else if (phi < 40) {
    cameraDesc = `camera at high angle (${phi}° downward), dominant tabletop area, product top clearly visible`;
  } else {
    cameraDesc = `near overhead camera (${phi}°), flat-lay style, tabletop dominates frame`;
  }

  // Fókusztávolság leírása
  let focalDesc: string;
  if (focal <= 35) {
    focalDesc = 'wide-angle perspective, slight edge distortion';
  } else if (focal <= 60) {
    focalDesc = 'natural 50mm perspective, undistorted proportions';
  } else if (focal <= 100) {
    focalDesc = '85mm portrait compression, background appears closer, slight telephoto flattening';
  } else {
    focalDesc = 'telephoto compression, background and subject appear on same focal plane';
  }

  // Bokeh leírása
  const bokehDesc = {
    'none': 'deep depth of field, background sharp',
    'light': 'slight background blur, background details softly visible',
    'moderate': 'moderate background bokeh, background recognizable but soft',
    'heavy': 'heavy bokeh, background entirely blurred, dreamy background',
  }[bokeh] ?? 'moderate background blur';

  return [cameraDesc, focalDesc, bokehDesc].join(', ');
}
```

---

### 10.3 Contact Shadow Ellipszis Kiigazítás

A compositing-ban a contact shadow jelenleg kör/ovális formában van,
de a kameraállástól FÜGGETLENÜL egységes méretű. Ez helytelen:

**Jelenleg:**

    contactW = finalW * 0.68
    contactH = finalH * 0.025 (rögzített)

**Helyes megközelítés (phi alapján):**

    contactH = contactW * sin(phi_rad)  // phi az elevation angle radiánban
              = finalW * 0.68 * sin(phi_rad)

    Ha phi=20°: contactH = finalW * 0.68 * sin(20°) = finalW * 0.68 * 0.342 = finalW * 0.232
    (sokkal magasabb mint a jelenlegi 0.025!)

    Azaz: phi=20°-nál a contact shadow ovális JÓVAL SZÉLESEBB/MAGASABB kellene legyen,
    mert a felülnézet miatt az asztal és a termék talpa közötti "ovális lenyomat" nagyobb.

**De vigyázat:** Ez csak ha a contact shadow az asztallap szintjén van.
A contact shadow "látható" nagysága függ a perspektívától:

    Látható_h_px = valódi_ovális_h * cos(phi_rad)
    
    phi=20°: Látható_h_px = valódi_ovális_h * cos(20°) = valódi_h * 0.94 ≈ valódi_h
    (tehát kis phi esetén a cos közel 1 → nincs nagy különbség a látható méretben)

Összefoglalva: a contact shadow magassága (heightMultiplier) növelhető phi-vel:

    contactHeightMultiplier = max(0.025, sin(phi_rad) * 0.15)

---

## Fejezet 11: Azonosítási Példák

### 11.1 Poli-Farbe Inntaler Vödör — Eset Tanulmány

**Termékfotó elemzés:**

| Paraméter | Megfigyelt | Levezett |
|---|---|---|
| Fedél ellipszis ratio | b/a ≈ 0.32 | phi ≈ 19° |
| Asztal látható mélysége | ~12% | phi ≈ 18-20° |
| Oldalnézet látható | minimális | psi ≈ 0-5° |
| Perspektíva torzítás | nincs buborék | focal ≈ 85mm |
| Háttér elmosódás | közepes | bokeh = moderate, f/5.6 |

**Becsült PerspectiveAnalysis:**

```json
{
  "camera": {
    "elevationAngleDeg": 19,
    "azimuthAngleDeg": 2,
    "estimatedFocalLengthMm": 85,
    "estimatedFstop": "f/5.6",
    "estimatedDistanceM": 1.0
  },
  "perspective": {
    "type": "3VP",
    "tableSurfaceVisibleDepthPct": 12,
    "tableEdgesConverge": true
  },
  "topEllipse": {
    "visible": true,
    "ratio": 0.32,
    "impliedElevationDeg": 19
  },
  "depthOfField": {
    "estimatedBokehLevel": "moderate",
    "backgroundBlurPct": 40
  },
  "fluxPromptComponents": {
    "fullBgPerspectivePrompt": "camera at approximately 19-degree downward angle, 85mm portrait lens compression, tabletop visible as a 10-15% depth foreground plane, background moderately blurred with bokeh, perspective lines of table converge gently toward the sides, single product placement area clear"
  }
}
```

**Probléma az eddigi generálásban:**
Az előző háttér promptban NEM volt benne ez a perspektíva leírás → FLUX
frontálisan generálta a hátteret → az asztal és a falháttér nem konvergáltak
a megfelelő phi=19° szögre → a composited vödör "fent ül" a fronalisan
generált asztalon, nem természetesen beágyazva.

---

## Fejezet 12: NEURO MAP — Összefoglaló

```
PERSPEKTÍVA NEURO MAP
═══════════════════════════════════════════════════════════════

TERMÉK FOTÓ ──→ MÉRÉS ──→ phi (elevation)
      │                    │
      │                    ├─→ topEllipse ratio = sin(phi)
      │                    ├─→ tableSurface depth = phi * scale
      │                    └─→ horizonY = f(phi, surfaceY)
      │
      └──→ fókusz ──→ fókusztávolság becslés
              │
              ├─→ DOF → bokeh szint
              └─→ perspektíva torzítás → VP pozíciók

FLUX PROMPT ÖSSZEÁLLÍTÁS:
   [sceneKeywords]                ← helyszín (location only)
   [surfaceCompositionInstruction] ← asztal Y pozíció
   [productAwareAddition]          ← fény minőség
   [perspectivePrompt]             ← phi, focal, bokeh ← ÚJ

COMPOSITING KIIGAZÍTÁS:
   contactShadow.heightMult = sin(phi) * 0.15
   haloEnabled = darkness > 25         (fény intenzitás alapú)
   dropShadow.opacity = laDarkness     (termék LA alapú, nem BG)

CHECKUP:
   CHECK 1: Termék nem vágódik
   CHECK 2: Integráció egységes
   CHECK 3: Nem kollázs
   CHECK 4: Szöveg olvasható
   CHECK 5: Természetes felületi kontaktus

PERSPEKTÍVA CHECKUP (javasolt):
   CHECK P1: Horizont konzisztencia (termék és háttér egyező phi)
   CHECK P2: Asztal mélység arányos phi-vel
   CHECK P3: Tárgy teteje látható/nem látható phi alapján helyesen
   CHECK P4: DOF/bokeh konzisztens a termék fókusztávolságával
```

---

## Fejezet 13: Prompt Gyorsreferencia Kártya

### 13.1 Perspective Prompt Kártya phi szerint

**phi ≈ 0° (frontális):**

    "eye-level camera, facing straight forward,
     table surface barely visible as thin line,
     product seen from the side straight on,
     single-point perspective, no tabletop depth"

**phi ≈ 15° (kissé felülről):**

    "camera slightly above eye level, 15-degree downward tilt,
     small strip of tabletop visible in lower foreground (5-8% depth),
     product seen mostly from front with gentle downward perspective,
     slight convergence of table edges toward sides"

**phi ≈ 20° (standard termékfotó):**

    "camera elevated 20 degrees above horizontal, looking slightly downward,
     tabletop visible as a meaningful foreground plane (10-15% of frame height),
     product top partially visible, standard product photography angle,
     gentle perspective convergence, table edges slope slightly outward toward bottom"

**phi ≈ 30° (erős felülnézet):**

    "camera at 30-degree elevated angle, strong downward perspective,
     significant tabletop area visible in lower third of image (20-25%),
     product top clearly visible, three-quarter downward view,
     pronounced perspective convergence"

**phi ≈ 45°:**

    "camera at 45-degree high angle, looking down steeply,
     tabletop dominates lower half of image,
     product appears compact, top surface prominently visible"

---

### 13.2 Fókusztávolság Gyorsreferencia

    35mm:   "wide-angle perspective, environment feels immersive, slight distortion at edges"
    50mm:   "natural perspective, undistorted proportions, balanced foreground-background"
    85mm:   "portrait compression, background slightly compressed closer to subject,
             soft background bokeh typical, flattering product proportions"
    135mm:  "strong telephoto compression, background appears large and close,
             very shallow depth of field, cinematic isolation of product"

---

### 13.3 DOF / Bokeh Gyorsreferencia

    none:     "sharp background, deep depth of field, everything in focus"
    light:    "slightly soft background, gentle depth of field effect"
    moderate: "background out of focus, bokeh visible, subject clearly isolated"
    heavy:    "strong bokeh, background entirely blurred, only product in sharp focus"

---

## Fejezet 14: Általánosítás — Bármilyen Termékre Alkalmazható Mérési Módszerek

> **FONTOS MEGJEGYZÉS:** Ez a könyv a Poli-Farbe festékes vödröt használja
> ILLUSZTRÁCIÓKÉNT és ESETTANULMÁNYKÉNT. Az összes törvény, mérési módszer
> és FLUX prompt stratégia BÁRMILYEN termékre alkalmazható:
> parfümösüveg, cipő, elektronikai eszköz, élelmiszer, szerszám, kozmetikum,
> játék, bútor, ruházat, ékszer — a fizika törvényei mindegyikre egyformán érvényesek.

### 14.1 Termékosztályok és Geometriai Jellemzőik

A rendszer a következő **6 alapvető termékosztályt** különbözteti meg:

| Osztály | Példák | Fő geometriai jellemző | Phi mérés módszere |
|---|---|---|---|
| **cylindrical** | Vödör, bögre, spray, konzervdoboz, pohár, csőre töltő | Körszimmetria, ellipszisek | topEllipse + bottomEllipse |
| **rectangular** | Doboz, tégla, könyv, telefon, tablet, csomag | Párhuzamos egyenes élek, sarokpontok | topFaceQuad + cornerDivergence |
| **bottle** | Bor, parfüm, szörp, palack, dezodor | Nyak+test kétszakasz, asszimmetrikus szil | neckEllipse + bodyEllipse |
| **flat_planar** | Tányér, könyv (lapjával), napelem panel, kép | Nagy lap/arány, kis magasság | edgeForeshortening + cornerQuad |
| **irregular** | Cipő, táska, szerszám, játékfigura, étel | Nincs domináns geometria | silhouetteAsymmetry + centroid |
| **composite** | Szett (termékkombináció) | Több különböző objektum | Per-object analysis |

---

### 14.2 Melyik Mérés Melyik Osztálynál Alkalmazható

| Mérési módszer | cylindrical | rectangular | bottle | flat_planar | irregular |
|---|---|---|---|---|---|
| **topEllipse** | ✅ Elsődleges | ❌ N/A | ✅ Jó | ❌ N/A | ⚠️ Ha van kerek rész |
| **bottomEllipse** | ✅ Legjobb | ❌ N/A | ✅ Jó | ❌ N/A | ⚠️ Ha van kerek rész |
| **topFaceQuad** | ❌ N/A | ✅ Elsődleges | ❌ N/A | ✅ Jó | ❌ N/A |
| **verticalEdgeConvergence** | ✅ Jó | ✅ Kiváló | ✅ Közepes | ❌ N/A | ⚠️ Ha van egyenes él |
| **footEdgeShape** | ✅ Jó | ✅ Jó | ✅ Jó | ✅ Elsődleges | ⚠️ Változó |
| **handleArc** | ⚠️ Ha van | ❌ N/A | ❌ N/A | ❌ N/A | ❌ N/A |
| **labelForeshortening** | ✅ Jó | ✅ Kiváló | ✅ Jó | ✅ Jó | ⚠️ Ha van téglalap felirat |
| **ellipseAxisOffset** | ✅ Jó | ❌ N/A | ✅ Jó | ❌ N/A | ❌ N/A |
| **barrelDistortion** | ✅ (oldalélről) | ✅ Kiváló | ✅ Közepes | ✅ Kiváló | ❌ Megbízhatatlan |
| **verticalTiltDeg** | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| **pixelFillRatio** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **shadowRemnants** | ✅ | ✅ | ✅ | ✅ | ✅ |

**Jelmagyarázat:** ✅ Megbízható | ⚠️ Feltételes | ❌ Nem alkalmazható

---

### 14.3 Téglalap Alapú Tárgyak (rectangular) — Mérési Módszerek

Doboz, csomag, elektronika, könyv, telefon esetén:

#### 14.3.1 Felső lap trapézanalízis (topFaceQuad)

A tárgy felső lapja egy NÉGYSZÖG (fizikailag téglalap), ami a perspektívában trapézként jelenik meg:

    Mérés:
    top_left  = felső lap bal sarokpontja (x1, y1)
    top_right = felső lap jobb sarokpontja (x2, y1)
    bot_left  = tárgy bal felső éle (x3, y2) — ahol az előlap találkozik a fedőlappal
    bot_right = tárgy jobb felső éle (x4, y2)

    phi becslés a trapézból:
    face_width  = abs(x2 - x1)     ← a fedőlap látszó szélességét méri
    face_depth  = abs(y2 - y1)     ← a fedőlap látszó mélységét méri
    ratio = face_depth / face_width
    phi ≈ arctan(ratio * correction_factor)

**FLUX prompt téglalap tárgyhoz:**

    "rectangular box product, camera at 20-degree downward angle,
     top face of box visible as a flat parallelogram, perspective convergence
     toward vanishing points on both sides of the horizon"

#### 14.3.2 Sarokkonvergencia (cornerDivergence)

A doboz bal és jobb oldalsó élei futnak össze a VP-kban:

    VP távolság = bal VP x pozíció + jobb VP x pozíció (mindkettő a kép szélén kívül is lehet)
    Minél KÖZELEBB vannak a VP-k → erősebb 2VP perspektíva → nagyobb psi

---

### 14.4 Palack Típusú Tárgyak (bottle) — Mérési Módszerek

Borospalack, parfüm, szörp, dezodor:

#### 14.4.1 Kétszakaszos ellipszis mérés

A palack jellemzően két eltérő átmérőjű hengeres részből áll: **nyak** és **test**.

    neckEllipse: a kupak alatti szűkített rész tetejének ellipszise
    bodyEllipse: a test legszélesebb pontjának ellipszise (általában lent)

    Mindkét ellipszis phi-t ad: phi_neck és phi_body
    Ezeknek EGYEZNIÜK kell (±3°) — ha nem → kamera vagy mérési hiba

#### 14.4.2 Palack szimmetriavonal

A palack bal és jobb kontúrjának szimmetriája:

    Ha szimmetrikus → psi ≈ 0° (frontálisan fotografált)
    Ha aszimmetrikus (egyik oldal szélesebb mint a másik) → psi > 0°
    Aszimmetria mértéke → psi becslés

**FLUX prompt palackhoz:**

    "tall bottle product, camera slightly above eye level at 18-degree downward angle,
     bottle neck and body both fully visible, slight shoulder ellipse visible at top,
     84mm portrait compression, moderate depth of field"

---

### 14.5 Lapos Tárgyak (flat_planar) — Mérési Módszerek

Tányér, könyv lapjával, kép, napelem, tábla:

#### 14.5.1 Él összehúzódás (edgeForeshortening)

A lapos tárgy ismert méretű — pl. egy A4 lap fizikailag 297mm × 210mm.

    apparent_height = lap látszó magassága (px)
    apparent_width  = lap látszó szélessége (px)
    phi = arccos(apparent_height / expected_height_at_psi_zero)

    Egyszerűbben: ha a tárgy "lapított" → phi nagy → erős felülnézet

#### 14.5.2 Sarokpontok négyszöganalízis

A lapos tárgy négy sarkai a perspektívában szabálytalan négyszöget alkotnak:

    Ha szabályos téglalap → phi = 0°, psi = 0°
    Ha trapéz (két párhuzamos oldal) → 1VP perspektíva, phi > 0°
    Ha általános négyszög → 2VP perspektíva, psi > 0° is

**FLUX prompt lapos tárgyhoz (pl. tányér):**

    "flat circular plate, camera at 25-degree elevated angle, plate face visible
     as an ellipse, plate appears as a slightly foreshortened circle from above"

---

### 14.6 Szabálytalan Tárgyak (irregular) — Mérési Módszerek

Cipő, táska, szerszám, organikus forma, élelmiszer:

#### 14.6.1 Sziluer aszimmetria (silhouetteAsymmetry)

A tárgy körvonalának bal/jobb szimmetriája:

    left_silhouette_width  = bal oldal maximális kiterjesztése a szimmetriatengelytől
    right_silhouette_width = jobb oldal maximális kiterjesztése
    asymmetry = abs(left - right) / (left + right)

    Ha asymmetry < 0.05 → kb. szimmetrikus → psi közel 0°
    Ha asymmetry > 0.15 → jelentős oldalnézet → psi > 15°

#### 14.6.2 Tömegközép pozíció (centroidY)

    centroid_y = alpha-súlyozott Y középpont
    Ha centroid_y jóval ALACSONYABB mint a geometriai középpont → tárgy "nehezebb" alul
    Ez befolyásolja a contact shadow méretezését

**Megjegyzés:** Szabálytalan tárgyaknál a phi becslés konfidenciája alacsonyabb (0.50-0.65).
A `perspectiveWarnings` tömbben jelezni kell: `"irregular shape — phi estimate less reliable"`.

**FLUX prompt szabálytalan tárgyhoz (pl. sportcipő):**

    "athletic shoe product, slightly elevated camera angle (approximately 15 degrees),
     shoe tongue and top visible, sole clearly resting on surface, 
     85mm perspective, moderate background blur"

---

### 14.7 Univerzális Mérések — Minden Tárgyosztálynál

Az alábbi mérések MINDEN terméktípusnál alkalmazhatók, tárgyosztálytól függetlenül:

| Mérés | Miért univerzális |
|---|---|
| **pixelFillRatio** | Csak az alfa maszkot nézi |
| **verticalTiltDeg** | Minden tárgynak van szimmetriatengelye |
| **symmetryAxisOffsetPct** | Horizontális elhelyezkedés mindig mérhető |
| **labelForeshortening** | Ha van téglalap felirat — legtöbb terméken van |
| **barrelDistortion** | Ha van egyenes él (legalább egy) |
| **DOF / bokeh** | Független a tárgy formájától |
| **shadowRemnants** | Alfa maszktól független |
| **reflectionRemnants** | Alfa maszktól független |
| **crossValidation** | Minden esetben futtatható |
| **productGeometry** (H/W, center, fill) | Mindig mérhető |

---

### 14.8 objectShapeClass Automatikus Felismerése

A Claude Vision-nek az alábbi döntési fa alapján kell osztályoznia:

```
1. pixelFillRatio > 0.85 ÉS aspect_ratio közel 1.0 (négyzetes bounding box)?
   → rectangular VAGY flat_planar

2. Látható-e kör/ellipszis forma felül és/vagy alul?
   → cylindrical VAGY bottle
   → Ha nyak (szűkülés) is látható → bottle

3. productHeightPct > productWidthPct * 1.5 (nagyon magas, vékony)?
   → bottle (ha kerek) VAGY irregular (ha nem kerek)

4. pixelFillRatio < 0.65 (laza körvonal, sok "lyuk")?
   → irregular

5. Egyik fenti sem illeszkedik?
   → irregular (fallback)
```

**KRITIKUS SZABÁLY:** Ha az osztályozás bizonytalan (confidence < 0.70) →
mindig `irregular` osztályba sorolandó, és a perspektíva konfidencia csökkentendő.
Jobb egy konzervatív becslés, mint egy pontatlan mérés.

---

### 14.9 FLUX Prompt Adaptáció Osztályonként

A `fullBgPerspectivePrompt` összeállításakor a tárgy osztályát BELEíRJUK:

```
cylindrical + phi=19°:
  "camera at 19-degree elevated angle, cylindrical product resting on surface,
   top circle of product visible as an ellipse, 85mm portrait compression..."

rectangular + phi=20°:
  "camera at 20-degree elevated angle, box-shaped product, top face visible
   as a parallelogram, two-point perspective, 85mm portrait compression..."

bottle + phi=18°:
  "camera at 18-degree elevated angle, bottle product, neck and body both visible,
   slight shoulder ellipse visible, 85mm portrait compression..."

flat_planar + phi=30°:
  "camera at 30-degree elevated angle, flat product resting face-up on surface,
   product face visible as a foreshortened plane, significant tabletop visible..."

irregular + phi=15°:
  "camera at 15-degree elevated angle, product resting naturally on surface,
   three-dimensional form visible from slightly above, 85mm perspective..."
```

---

### 14.10 A Fényes Könyv Párhuzamos Alkalmazása

Ez a könyv a **fényes könyv** (lighting_physics_book.md) perspektíva-társa.
A fényes könyv szintén tartalmaz vödör-specifikus példákat illusztrációként,
de törvényei ugyanúgy érvényesek BÁRMILYEN tárgyra:

- Lambert-törvény → érvényes minden diffúz felületre (nem csak fehér műanyagra)
- Fresnel-effektus → érvényes minden dielektrikumra (nem csak PP műanyagra)
- Contact shadow → érvényes minden szilárd tárgyra
- Drop shadow → érvényes minden, fényt elfogó tárgyra
- Specular highlight → érvényes minden nem-teljesen-matt felületre

**A fizika törvényei termékfüggetlen szabályok.**
A vödör csupán egy konkrét, jól dokumentált példa — semmi több.

---

*Kézikönyv verziója: 2026-07-01 (v1.1 — Fejezet 14 hozzáadva: Általánosítás)*
*Forrás: Optika tankönyvek, Photography compositon principles, PBR rendering docs,*
*Cambridge in Colour tutorials, Harold M. Merklinger — "The INs and OUTs of FOCUS",*
*Paul Davidovits — "Physics in Biology and Medicine",*
*Bryan Peterson — "Understanding Exposure",*
*Ez egy ÉLŐ DOKUMENTUM — bővítendő minden új tapasztalattal*

