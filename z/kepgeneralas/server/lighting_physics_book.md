# FÉNY ÉS ÁRNYÉK — Teljes Referenciakézikönyv AI Termékgeneráláshoz

> **Ez a dokumentum egy élő kézikönyv.** Minden fejezet konkrét, alkalmazható tudást tartalmaz
> a FLUX prompt-készítéshez, a Sharp compositing-hoz, és a Claude Vision checkup-hoz.
> A végén található NEURO MAP összeköti az összes fogalmat.

---

# RÉSZ I — FIZIKAI ALAPOK

## Fejezet 1: A Fény Természete

### 1.1 Mi a fény fizikailag?

A fény elektromágneses sugárzás (380–700 nm látható tartomány). Kettős természete
(hullám + részecske) magyarázza a következő jelenségeket:

- **Diffrakció:** Sarkok körül elhajlik (pl. fény átszűrődik rések között)
- **Reflexió:** Felületekről visszaverődik (tükrök, fényes felületek)
- **Refrakció:** Anyagokon áthaladva megtörik (üveg, víz)
- **Szórás:** Részecskéken elszóródik (por, köd, levegő)

**Termékfotó következmény:** Ha egy kép "nem tűnik valósnak", az legtöbbször azért
van, mert a fény valamelyik fizikai tulajdonsága hiányzik vagy inkonzisztens.

---

### 1.2 Lambert-törvény (diffúz visszaverődés)

A szórt fény intenzitása arányos a beesési szög koszinuszával:

    I = I0 * cos(theta)

ahol theta a fény és a felület normálisának szöge.

**Következmény:** Ha a fény merőlegesen (theta=90°) süt rá egy felületre,
az a maximálisan megvilágított pont. Ez magyarázza, miért van erős
specular highlight a vödör tetején/fedélzónáján overhead fénynél.

**Vertikális fénygradiens hengereken (overhead fény):**

    Tető (theta=0°):     I = I0 * cos(0°)  = 1.00 * I0  = 100% brightness
    30° le (elülső f.):  I = I0 * cos(30°) = 0.87 * I0  = 87%
    60° le:              I = I0 * cos(60°) = 0.50 * I0  = 50%
    Oldalvíz (90°):      I = I0 * cos(90°) = 0.00 * I0  = 0% (csak ambient)

**AI checkup kérdés:** "Van-e vertikális fénygradiens a hengeres tárgy elülső
felületén — fentről lefelé haladva fényesről sötétebbre?"

---

### 1.3 Fresnel-effektus (tükörszerű visszaverődés)

A Fresnel-egyenlet meghatározza, hogy egy felület MENNYIT ver vissza
és MENNYIT enged át a fényből — szög függvényében.

**Alapszabály:**
- Merőleges szög (0°): kis visszaverődés → anyag "valódi" színe látszik
- Súroló szög (90° grazing): nagy visszaverődés → tükörszerű felület

**Anyagok IOR értékei (törésmutatók) és jellemzőik:**

| Anyag | IOR | Közvetlen szög reflexió | Grazing reflexió |
|---|---|---|---|
| Levegő | 1.0 | 0% | 0% |
| Víz | 1.33 | ~2% | 100% |
| Üveg | 1.5 | ~4% | 100% |
| Fehér polipropilén műanyag | ~1.49 | ~4% | 100% |
| Navy kék ABS műanyag | ~1.50 | ~4% | 100% |
| Alumínium (vezető fém) | ~1.4+i·7.6 | ~60% | ~100% |
| Arany (vezető fém) | komplex | ~85% | ~100% |

**Praktikus hatás termékfotóban:**
Egy fehér műanyag vödör esetén:
- Az elülső, kamerával szemben lévő felület: kis Fresnel reflexió (4%)
- A vödör oldalai, melyek ferdén mutatnak a kamera felé: közepes reflexió
- A vödör szélei/pereme, ahol a felület szinte párhuzamos a kamerával: maximum reflexió

**AI prompt (Fresnel-effektus kiemelése):**

    subtle Fresnel edge highlight on white plastic cylindrical bucket body,
    edges subtly brighter due to grazing angle,
    specular gradient from matte center face to slightly glossier curved edges

---

### 1.4 Snell-törvény (Fénytörés)

    n1 * sin(theta1) = n2 * sin(theta2)

Alkalmazások termékfotóban:
- Üvegpalack belseje: eltorzul a tartalom látványa
- Fényes fedél/kupak: a fény eltérül az anyaghatáron
- Asztalon lévő üvegtárgy alatti caustic fénymintázat

---

### 1.5 Rayleigh és Mie szórás

**Rayleigh-szórás (kis részecskék — levegő):**
A rövid hullámhosszakat (kék) jobban szórja → kék az ég napközben,
narancsvörös a naplemente (hosszabb légköri út → a kék kiszűrődik).

**Mie-szórás (nagy részecskék — por, köd, füst):**
Minden hullámhosszt egyformán szór → fehér fénykúp (Tyndall-effektus).
Ez teszi láthatóvá a fénysugarat füstös/poros helyszíneken.

**AI prompt (workshop por/pára effektus):**

    visible light beam shaft from ceiling spotlight through workshop dust particles,
    Tyndall effect, soft volumetric hazy cone of light descending to product

---

## Fejezet 2: Árnyékok Fizikája

### 2.1 Az árnyék keletkezése

Két alaptípus:

1. **Cast shadow (vetett árnyék):** A tárgy által a felszínre vetett árnyék
2. **Form shadow (saját árnyék):** A tárgy nem megvilágított felületei

### 2.2 Umbra, Penumbra, Antumbra

    [FÉNY — nagy forrás]
    /          |          \
   /  PENUMBRA | UMBRA  PENUMBRA\
  /    [       TÁRGY      ]    \
  [AO=0][penumbra][UMBRA][penumbra][AO=0]
         soft     dark   soft

**Umbra:** Teljes árnyék. Fény 0% (+ ambient fill ~5-15%)
**Penumbra:** Átmeneti zóna. Fény 15-85% (szélességet a fényforrás mérete határozza meg)
**Antumbra:** Messzebb lévő "elhalványuló" árnyéktér (csak nagy forrásoknál)

**Penumbra szélessége és a fényforrás mérete:**

| Fényforrás méret | Penumbra szélesség | Árnyék megjelenés |
|---|---|---|
| Pontszerű (kisizzó) | ~0 (éles határ) | Kemény, noir-szerű |
| Közepes (spotlight) | 5-15% árnyékhosszból | Meghatározott mag, puha szél |
| Nagy (softbox 60x90cm) | 20-40% árnyékhosszból | Nagyon puha, szétfolyó |
| Diffúz (ablakfény) | >50% | Szinte lágy gradiens, nincs éles határ |

### 2.3 Az árnyék hosszának kiszámítása

    L = H / tan(theta)

ahol:
- L = az árnyék hossza a felszínen
- H = a tárgy magassága
- theta = a fényforrás szöge a vízszintestől mérve

**Teljes szögtáblázat:**

| Szög (theta) | L/H arány | Vizuális jellemzés | Termékfotó kontextus |
|---|---|---|---|
| 90° | 0.00 | NINCS vetett árnyék | Mennyezeti spotlight pontosan felülről |
| 85° | 0.09 | Alig látható kontakt zóna | Majdnem pontosan felülről |
| 80° | 0.18 | Nagyon rövid | Erősen overhead |
| 75° | 0.27 | Rövid | Jellemző mennyezeti lámpa |
| 70° | 0.36 | Mérsékelt | Irodai mennyezeti spot |
| 60° | 0.58 | Közepes | Magas oldalsó stúdió lámpa |
| 50° | 0.84 | Közepes-hosszú | Közepes oldalsó stúdió |
| 45° | 1.00 | = tárgy magassága | Klasszikus stúdió 45° |
| 40° | 1.19 | Hosszabb | Alacsony oldalsó lámpa |
| 30° | 1.73 | Hosszú, drámai | Drámai alacsony szögű fény |
| 20° | 2.75 | Nagyon hosszú | Este-szerű, drámai |
| 10° | 5.67 | Extrém hosszú | Naplemente hatás |
| 5°  | 11.43 | Szinte végtelen | Napfelkeltekor |

### 2.4 Az árnyék iránya

    Fény BALRÓL    → Árnyék JOBBRA
    Fény JOBBRÓL   → Árnyék BALRA
    Fény ELÖLRŐL   → Árnyék HÁTRAFELÉ (kamera felé)
    Fény HÁTULRÓL  → Árnyék ELŐRE (viewer felé)
    Fény FELÜLRŐL  → Árnyék KÖZVETLENÜL A TÁRGY ALATT (contact only)
    Fény BAL-FENTRŐL → Árnyék JOBB-LEFELÉ (kombinált)

**Közbenső szög x-eltolódás számítás:**

    shadow_x = (lightX_percent - 50) * 0.02 * object_width * (1/tan(theta))

Példa: Fény 70%-kal jobbra, 45°-os szög, obj_width=500px:

    shadow_x = (70-50) * 0.02 * 500 * 1.0 = 200px balra tol

### 2.5 Pontszerű vs. párhuzamos fényforrás

**Párhuzamos fény (nap, distant light):**
- Minden árnyék párhuzamos
- Árnyék mérete = tárgy mérete
- Éles kontúr

**Pontszerű fény (közeli izzó, spotlight):**
- Árnyékok a fényforrástól kifelé tágulnak
- Árnyék NAGYOBB mint a tárgy

Számítás:

    shadow_width = object_width * (light_to_ground / light_to_object)

Ha a spotlight 3m magasan van, a tárgy 1m magasságban:

    shadow_width = object_width * (3 / (3-1)) = object_width * 1.5

---

## Fejezet 3: Contact Shadow és Ambient Occlusion

### 3.1 Contact Shadow fizikája

A contact shadow ott keletkezik, ahol a tárgy és a felszín
közel kerülnek egymáshoz — a szórt/ambient fény sem fér be.

**MINDEN fényszögnél megjelenik** — ez az, ami a terméket "odatapad" a felszínhez.

**Pontos kompoziting értékek:**

**Contact shadow mag (inner core):**

    Szélesség: obj_width * 0.68
    Magasság:  obj_height * 0.04
    Opacitás:  0.88
    Blur:      3px
    Pozíció:   tárgy talpa, 0px offset
    Blend:     multiply

**Ambient Occlusion halo (outer soft):**

    Szélesség: obj_width * 0.95
    Magasság:  obj_height * 0.14
    Opacitás:  0.46
    Blur:      22px
    Pozíció:   tárgy talpa, kissé középre igazítva
    Blend:     multiply

**Kritikus hiba:** Ha a contact shadow Y-pozíciója nem pontosan a tárgy
talpánál van → LEBEGÉS (floating) hatás.

### 3.2 Ambient Occlusion értékei különböző geometriáknál

| Geometria | AO erőssége | Leírás |
|---|---|---|
| Hengeres tárgy asztalon | Közepes | Ovális sötét halo az alap körül |
| Négyszögletes doboz asztalon | Erős a sarkoknál | Élesebb sarkok, erősebb AO |
| Tárgy fal mellett | Erős a fal-tárgy sarokban | Sötét sáv a fal mentén |
| Tárgy mélyedésben | Nagyon erős | Sötét völgy az alján |
| Szabadon álló tárgy | Gyenge-közepes | Diffúz halo |

---

# RÉSZ II — TÁRGYAK MEGVILÁGÍTÁSA FÉNYSZÖG SZERINT

## Fejezet 4: Overhead Lighting (85-90°)

### 4.1 Vizuális szerkezet

    [CEILING SPOTLIGHT]
          |
          v
     ___________
    /     ★     \    <- LID/TETO: 100% megvilágított, erős specular
    |  FELSO 15% |   <- 85-90% brightness
    |    LABEL   |   <- 50-60% brightness (bounced ambient only)
    |  ALSO 15%  |   <- 30-40% brightness (deep shadow)
    |____________|
          |||         <- CONTACT SHADOW ONLY (NO drop shadow!)
    [ASZTALFELSZIN]

### 4.2 Vertikális fénygradiens (Lambert-törvény alkalmazva)

    Fedél tető:        100% (theta = 0°)
    Fedél perem:       92%  (theta = 23°)
    Felső cimke:       75%  (theta = 41°)
    Cimke közepe:      55%  (theta = 57°)
    Alsó cimke:        38%  (theta = 68°)
    Tárgy talpa:       25%  (theta = 76°)

**Ez a gradiens** teszi a terméket háromdimenziósnak és valószerűvé.
Ha a front face egységesen fehér → FAKE / PASTED-ON hatás.

### 4.3 FLUX prompt overhead lighting

    overhead ceiling spotlight directly above the product,
    contact shadow only directly beneath the product base,
    absolutely NO drop shadow extending forward on the table surface,
    product lid/top fully illuminated with sharp specular highlight,
    front face of cylindrical body receiving only bounced ambient fill light,
    vertical brightness gradient on cylindrical body: bright top progressively
    darker towards base, classic Lambert shading on curved surface

### 4.4 Specular highlight helye és mérete overhead fénynél

    Zóna: tárgy magasság felső 15-18%-a (fedél/tető zóna)
    Szélesség: obj_width * 0.50-0.60
    Opacitás: 0.35-0.45
    Blur: 3-5px
    Blend: screen

**Hibás:** Specular az oldalon végig → csak a fedélen szabad!

---

## Fejezet 5: Side Lighting (30-60°)

### 5.1 45°-os oldalsó fény vizuális szerkezete

    [FÉN BALRÓL 45°]           Drop shadow
          \                        /
           \                      /
        ___________            ↗
       /  ★  |      \         Irány: JOBBRA
      |   M  |       |   ->   Hossz: = obj_height
      |   E  |       |        Blur:  közepes
      | LABEL|  DARK |
      |______|_______|
      [MEGVILÁGÍTOTT][ÁRNYÉKOS]
     bal 85%    jobb 20%

### 5.2 Megvilágítási arányok 45°-os oldalsó fénynél

| Felület | Brightness % |
|---|---|
| Megvilágított oldal (fény felőli) | 85-100% |
| Elülső oldal (label) | 50-65% |
| Árnyékos oldal | 15-30% |
| Teteje (ha van rim is) | 70-80% |

### 5.3 FLUX prompt side lighting (bal, 45°)

    45-degree key light from upper left,
    bright left face with strong directional specular,
    soft gradient transitioning to darker right shadow side,
    drop shadow extending to the right with length equal to product height,
    soft penumbra shadow edges, classic three-dimensional studio appearance

---

## Fejezet 6: Hátsó és Kontra-jour Megvilágítás

### 6.1 Backlighting vizuális hatások

    [FÉN HÁTULRÓL]
          ||
     _____|_____
    / ***GLOW** \    <- Felső perem: erős rim highlight
   | *         * |   <- Oldalak: rim light
   | *  TÁRGY  * |   <- Elülső: sötét (csak ambient fill)
   |_____________|
          |||
    [HOSSZÚ ÁRNYÉK ELŐRE — viewer felé]

### 6.2 Rim light jellemzők

    Rim width: obj_width * 0.12-0.20
    Rim opacity: 0.25-0.55 (függ az ambient darkness-től)
    Rim blur: 3-8px
    Blend: screen

**Rim darkening (árnyékos ellentétes oldal):**

    Rim width: obj_width * 0.15-0.25
    Opacity: ambient_darkness * 0.42
    Blur: 6-10px
    Blend: multiply

---

## Fejezet 7: Hárompontos Megvilágítás (Three-Point Lighting)

### 7.1 A klasszikus professzionális séma

    [FILL LIGHT 30-50%]          [RIM/BACK LIGHT 50-80%]
            \                               /
             \     [TERMÉK]              /
              \        ^              /
            [KEY LIGHT 100%]

**Key Light:**
- Elsődleges, legerősebb fényforrás (referencia: 100%)
- Elhelyezés: 30-45° oldalt + 30-45° fentről
- Cél: alap megvilágítás + fő árnyék létrehozása

**Fill Light:**
- Célja: A Key által vetett árnyékot megfékezni (de nem megszüntetni)
- Elhelyezés: Key ellentétes oldalán
- Intenzitás: Key 33-66%-a (fill ratio = 1:2 vagy 1:3)
- Gyenge fill = drámai; erős fill = lapos, egyenletes

**Rim / Back Light:**
- Elválasztja a terméket a háttértől
- Éles fényes perem a tárgy szélein (szilhouette edge)
- Elhelyezés: tárgy mögül, felülről
- Intenzitás: 50-100% (ízlés szerint)

### 7.2 FLUX prompt three-point lighting

    professional three-point studio lighting,
    strong 45-degree key light from upper left creating defined shadow,
    soft fill light from right reducing shadow darkness while preserving form,
    rim/back light creating bright edge highlight separating product from background,
    balanced professional studio atmosphere

---

# RÉSZ III — ANYAGFELÜLETEK (PBR & MATERIAL SCIENCE)

## Fejezet 8: Physically Based Rendering (PBR)

### 8.1 A négy fő PBR paraméter

**Albedo (Base Color):**
A felület tiszta, fény nélküli alapszíne.

    Fehér polipropilén műanyag (vödör test): RGB(232-244, 232-244, 226-240)
    Navy kék ABS műanyag (fedél):            RGB(22-38, 32-52, 68-90)
    Fém acél (fogantyú):                     RGB(175-195, 175-195, 170-190)
    Fehér papír (label háttér):              RGB(250-255, 250-255, 248-254)

**Roughness (érdesség, 0.0-1.0):**

| Roughness | Felület | Specular megjelenés |
|---|---|---|
| 0.00-0.05 | Tükörfelület | Éles, pontos tükröződés |
| 0.10-0.20 | Polírozott fém | Majdnem tükör, enyhe elmosódás |
| 0.25-0.35 | Navy kék ABS fedél | Puha, de meghatározott highlight |
| 0.45-0.60 | Fehér PP műanyag test | Széles, diffúz highlight |
| 0.70-0.80 | Matt festékfilm | Alig látható specular |
| 0.85-0.95 | Papír label | Szinte nincs specular |

**Metallic (fémesség: 0 = dielektrikum, 1 = fém):**

    Fehér műanyag (vödör): metallic = 0.0 → fehér specular
    Fém fogantyú:          metallic = 1.0 → fém-színű specular
    Papír label:           metallic = 0.0

**Specular (reflexió intenzitás, alapértelmezetten 0.5):**
0.5 = ~4% közvetlen szögű reflexió dielektrikumoknál (fizikailag helyes default)

### 8.2 Terméktípusok és vizuális jellemzőik

**Festékes vödör (Poli-Farbe Inntaler típus):**

    Test anyaga: fehér polipropilén (PP)
    Roughness: 0.50-0.58 → puha, de látható specular highlight
    SSS: 0.08-0.12 → gyenge belső szórás vastag részeken
    Fresnel: erős az éleken
    Grazing angle glow: igen, a hengerelt oldalon látható

    Fedél anyaga: navy kék ABS műanyag
    Roughness: 0.28-0.35 → polírozzabb mint a test
    Metallic: 0.0
    Specular: 0.55

    Fogantyú: polipropilén (vagy HDPE)
    Roughness: 0.55-0.65

---

## Fejezet 9: Subsurface Scattering (SSS)

### 9.1 Hogyan működik az SSS

A fény behatol a félátlátszó anyagba, belül szóródik, és más ponton lép ki.
Eredmény: a tárgy "belülről is megvilágítva" tűnik.

**SSS anyagok és jellemzőik:**

| Anyag | SSS erősség | Jellegzetes vizuális |
|---|---|---|
| Viasz | Nagyon erős | Narancsvörös belső glow |
| Tej | Erős | Fehér belső glow, lágy élárnyék |
| Fehér PP műanyag | Gyenge | Enyhe áttűnés vékony részeken |
| Bőr (ember) | Közepes | Füleken, ujjakon narancsvörös peremfény |
| Márvány | Erős | Mélységi belső fény |
| Üveg | Nincs SSS (átlátszó helyette) | |

### 9.2 SSS vizuális jelei

1. **Peremfény (edge glow):** Vékony éleken áttűnik a háttér fénye
2. **Lágyított árnyékhatár:** A shadow terminator nem éles, puha gradiens
3. **Belső glow:** Erős backlighting esetén a belső szerkezet láthatóvá válik
4. **Meleg hőmérséklet-shift:** SSS vörös/narancssárga hullámhosszakat hosszabb
   ideig tart meg (ezért tűnik melegnek a bőr)

### 9.3 SSS hatása fehér műanyag vödörre

A festékes vödör fehér PP fala (3-5mm vastag):
- Vastag részeken: minimális SSS, szinte teljesen opak
- Fogantyú rögzítési pontoknál (vékonyabb): enyhe SSS
- Backlit helyzetben: halvány áttűnés a vékonyabb fal-részeken

**AI prompt (SSS kiemelés):**

    subtle subsurface scattering on white plastic bucket,
    slight warm edge glow at thinner plastic sections when backlit,
    soft shadow terminator on form shadow boundary rather than sharp cutoff

---

# RÉSZ IV — GLOBÁLIS MEGVILÁGÍTÁS ÉS VISSZAVERŐDÉSEK

## Fejezet 10: Global Illumination

### 10.1 Direkt vs. Indirekt Fény

**Direkt fény (direct light):**
Egyenesen a fényforrásból a tárgyra → erős, irányos, kemény árnyék

**Indirekt fény (indirect / bounce light):**
Felületekről visszaverve éri el a tárgyat → puha, diffúz töltőfény

**Indirekt fény hiánya = fake kép!**
Ha nincs indirekt fény → az árnyékok teljesen feketék → mesterséges hatás.

### 10.2 Color Bleeding (Szín-átszivárgás)

A bounce light magával viszi a felület színét:

    Piros fal mellett → tárgy árnyékos oldalán piros tónus jelenik meg
    Sárga spotlight → tárgy árnyékai melegebb tónust kapnak
    Kék háttér fal → tárgy jobb szélén kék ambient szín jelenhet meg

**Kompoziting szín-átszivárgás szimulálása:**
Ha a háttér pl. meleg barna workshop asztal:
- A tárgy talpánál alkalmaz egy gyenge meleg (narancssárga) multiply overlay-t
- Opacity: 6-12%
- Ez integrálja a terméket a jelenetbe

### 10.3 Path Tracing — Hogyan "gondolkodik" az AI

A path tracing fizikailag pontos fényszimuláció (Blender Cycles, V-Ray, stb. alapja):

1. Minden kamera-pixelből sugár indul a jelenetbe
2. A sugár megüt egy felületet → fizika alapján véletlenszerűen visszaverődik
3. Az új sugár folytatja útját → következő felületre kerül
4. Ez addig folytatódik, amíg a sugár fényforrást ér vagy "elvész"
5. Ezernyi ilyen "út" átlagolásából áll össze a pixel értéke

**A FLUX és a fizikai memória:**
A FLUX modell millió fotón tanult, amelyek mindegyike path tracing-szerű
fizikát követ. Ezért:

1. Ha a prompt fizikailag HELYES → a model könnyedén generálja
2. Ha a prompt fizikailag INKONZISZTENS → a model "kompromisszumot" köt
3. Ha a prompt ELLENKEZIK a fizikával → a model FIGYELMEN KÍVÜL HAGYJA
   a kérés azt a részét, és a tanult fizikát alkalmazza

**Tanulság:** Mindig fizikailag helyes promptot írj. A FLUX-ot NEM tudod rávenni
a fizika megszegésére — inkább eltorzítja a képet.

### 10.4 IBL — Image Based Lighting (HDRI)

Egy 360°-os panoráma HDR fotó, amely minden irányból biztosítja az ambient fényt.

**Miért a legreálisabb módszer:**
Valódi helyszínek komplex megvilágítását (több fényforrás, visszaverődések, égbolt
gradiensei) egyetlen HDRI fájl tartalmazza.

**Workshop HDRI tipikus jellemzők:**
- Mennyezeti neonok: hideg fehér, 4000-5000K, egyenletes
- Ablakfény (ha van): kékes, 6000-7500K, oldalirányból
- Fémfelületek visszaverődése: vegyes szín
- Ambient darkness index: ~60-75

**FLUX prompt IBL-szerű megvilágításra:**

    complex multi-source workshop ambient lighting,
    cool overhead fluorescent fill light, subtle warm directional spotlight accent,
    realistic inter-reflections from metal workshop surfaces,
    IBL-style environment wrap-around lighting

---

# RÉSZ V — SZÍN, HŐMÉRSÉKLET ÉS PERCEPCIÓ

## Fejezet 11: Fényhőmérséklet (Kelvin-skála)

### 11.1 A teljes Kelvin-skála termékfotó kontextusban

| K érték | Fényforrás | Vizuális szín | Termékfotó hatás |
|---|---|---|---|
| 1800K | Gyertya | Narancsvörös | Rusztikus, romantikus |
| 2200K | Naplemente | Narancs | Drámai hangulat |
| 2700K | Hagyományos izzó | Melegfehér | Workshop "emberi" légkör |
| 3000K | Halogén | Sárgásfehér | Kelemes, meleg stúdió |
| 3200K | Tungsten stúdió | Semleges-meleg | Klasszikus termékfotó |
| 3500K | Fehér LED (meleg) | Semleges | Modern irodai |
| 4000K | "Cool white" LED | Semleges-hideg | Ipari / cleanroom |
| 4500K | Reggeli napfény | Enyhén kékes | Természetes reggel |
| 5000K | Nappali | Fehér referencia | E-commerce standard |
| 5500K | Standard nappali | Neutrális fehér | Fotó referencia |
| 6000K | Felhős égbolt | Enyhén kékes | Szabad téri, overcast |
| 6500K | Kék égbolt | Kék-fehér | Hideg, kreatív |
| 7000K+ | Árnyék (kék ég alatt) | Kékes | Nagyon hideg |

### 11.2 RGB color cast hatása fehér tárgyra

Fehér műanyag (referencia: RGB 255,255,255) különböző fényekben:

| K érték | R shift | G shift | B shift | Vizuális eredmény |
|---|---|---|---|---|
| 2700K (izzó) | +35 | +12 | -28 | Sárgásfehér |
| 3200K (tungsten) | +22 | +8 | -18 | Enyhén sárga |
| 3500K | +12 | +4 | -9 | Majdnem semleges |
| 4500K | +4 | +1 | -3 | Szinte fehér |
| 5500K (referencia) | 0 | 0 | 0 | Tiszta fehér |
| 6500K (hideg) | -12 | +2 | +20 | Kékes fehér |
| 7500K (árnyék) | -22 | -3 | +35 | Kék árnyalat |

### 11.3 Ambient Tinting szabályok sötét jelenetekhez

**KRITIKUS SZABÁLY:**
Sötét/moody jelenetben (darkness 50+) a fehér tárgy SOHA nem marad RGB(255,255,255).
Az ambiente fény 8-22% mértékben "megfesti" a fehér felületet.

**Poli-Farbe vödör workshop jelenetben (2700-3200K spotlight):**

    Valós fehér = RGB(230-244, 225-238, 208-225)  — enyhén sárgásfehér

**Compositing tint értékek:**

    2700K workshop jelenet:
    - warmTint: RGB(255, 210, 170), opacity = 0.12-0.18, blend: multiply
    - envTint: opacity = 0.10-0.14

    5500K nappali stúdió:
    - Nincs tint szükséges

    6500K hideg LED:
    - coolTint: RGB(180, 200, 255), opacity = 0.10-0.14, blend: multiply

### 11.4 Emberi szín-percepció vs. Kamera

**Chromatic Adaptation (emberi agy):**
Az emberi vizuális rendszer automatikusan kompenzálja a fény színét (color constancy).
Egy fehér lap mindig fehérnek tűnik — nappali fényen és izzólámpán is.

**AWB (kamera automatikus fehéregyensúly):**
A kamera matematikai "szürkevilág" feltételezéssel korrigál.
Nem tud lokálisan adaptálni, csak globálisan.

**Simultaneous Contrast:**
Egy semleges szürke felület KÜLÖNBÖZŐNEK TŰNIK más-más szomszédos szín mellett:

    Szürke piros háttér előtt → zöldes árnyalatot kap
    Szürke kék háttér előtt  → narancsos árnyalatot kap

**Termékfotó implikáció:**
Ha az AI egy fehér vödröt piros háttér elé helyez, az vizuálisan zöldes tónust vehet
fel — ezt a tinting-gel ellensúlyozni kell.

---

# RÉSZ VI — COMPOSITING TECHNIKÁK

## Fejezet 12: Réteg Architektúra

### 12.1 Helyes Sharp composite réteg sorrend (alulról felfelé)

    Szint 1: HÁTTÉR (FLUX generált kép)
    Szint 2: Contact shadow (multiply, 0.88)
    Szint 3: AO halo (multiply, 0.46)
    Szint 4: Drop shadow (multiply, 0.68) [ha theta < 85°]
    Szint 5: Asztal reflexió (screen, 0.22) [ha fényes asztal]
    Szint 6: TÁRGY (rembg alfa)
    Szint 7: Ambient / warm tint (multiply, 0.12-0.18) [environment szín]
    Szint 8: Rim darkening (multiply, 0.40) [árnyékos oldal]
    Szint 9: Form shadow gradiens (multiply, 0.25) [vertikális gradiens]
    Szint 10: Rim light (screen, 0.20-0.35) [megvilágított él]
    Szint 11: Specular highlight (screen, 0.38-0.45) [fedél/tető zóna]
    Szint 12: Light wrap (screen, 0.18-0.25) [él-integráció]

### 12.2 Blend Mode-ok összefoglalója

| Blend Mode | Hatás | Tipikus felhasználás |
|---|---|---|
| Multiply | Sötétít (szorzás) | Árnyékok, AO, dimming, tinting |
| Screen | Világosít (inverz szorzás) | Fény, rim light, specular |
| Overlay | Kontrasztnövelés | Texture overlay, color grading |
| Soft Light | Gyengébb overlay | Subtilis color grading |
| Linear Dodge (Add) | Erős világosítás | Glint, erős specular |
| Color | Csak szín (nem fényesség) | Ambient tint, color cast |
| Luminosity | Csak fényesség (nem szín) | Fényerő egyenlítés |

---

## Fejezet 13: Light Wrap

### 13.1 Mi a Light Wrap?

A light wrap azt szimulálja, hogy a háttér fénye "körbejárja" a tárgy széleit.

**Fizikai magyarázat:**
Valós felvételeken a légköri Rayleigh-szórás, a tárgy transzlucenciája,
és az élek diffrakciója mind hozzájárulnak ahhoz, hogy a háttér fénye
kissé "kiszivárog" a tárgy körül.

**Ha ez hiányzik:** A tárgy "kivágottnak" tűnik — azt érezzük, hogy a képet
utólag ragasztották össze.

### 13.2 Light Wrap algoritmus

    1. Háttér kép → Gaussian Blur 60-80px
    2. Elmosott háttérből: csak a tárgy szélső 20-30px-e legyen látható
       (clipping mask a tárgy alfa-csatornájához képest EXPANDÁLVA 25px)
    3. Blend mode: Screen (vagy Linear Dodge ha erős effekt kell)
    4. Opacity: 0.15-0.28

**Paraméterek különböző esetekre:**

| Háttér szín | Tárgy szín | Light wrap opacity | Blur |
|---|---|---|---|
| Meleg sárga | Fehér | 22-28% | 70px |
| Hideg kék | Fehér | 15-22% | 65px |
| Sötét semleges | Fehér | 8-15% | 55px |
| Nagyon sötét | Fehér | 5-10% | 50px |
| Hasonló szín | Hasonló | 5-10% | 45px |

---

## Fejezet 14: Reflexió az Asztalfelületen

### 14.1 Mikor jelenik meg?

- Fényes fém asztal: erős reflexió (opacity 25-40%)
- Lakkozott fa asztal: közepes reflexió (12-22%)
- Matt fa: minimális (3-8%)
- Beton: szinte nincs (2-5%)
- Üveg: nagyon erős (30-50%)

### 14.2 Reflexió paraméterei

    Opacity: surface_specularity * 0.35
    Height:  obj_height * 0.22
    Blur:    20-40px (mindig erősen elmosódott)
    Flip:    függőlegesen tükrözve
    Blend:   screen vagy normal (alacsony opacity)
    Offset:  azonnal a tárgy alatt kezdődik

---

# RÉSZ VII — AI-SPECIFIKUS TECHNIKÁK

## Fejezet 15: AI Megvilágítás és Relighting

### 15.1 IC-Light (Imposing Consistent Light)

Az IC-Light a legjobb nyílt forráskódú AI relighting tool (Lvmin Zhang, a ControlNet alkotója).

**Képességei:**
- Egyetlen kép megvilágításának teljes átalakítása
- Szöveges prompt alapján: "sunlight from left", "dramatic rim light"
- Háttér-kondicionált relighting: a háttér fénye alapján meghatározza a termék megvilágítását
- Preserves label text, product shape, colors

**IC-Light API (Fal.ai):**

    POST https://fal.run/fal-ai/iclight-v2
    {
      "image_url": "rembg_cutout_url",
      "prompt": "overhead spotlight, moody dark workshop atmosphere",
      "num_inference_steps": 28,
      "guidance_scale": 7.5
    }

**Miért jobb a mi jelenlegi módszerünknél:**
A Sharp-alapú compositing statikus effekteket alkalmaz.
Az IC-Light dinamikusan, a kép geometriájához igazítva alkalmazza a fényt —
beleértve a SSS, Fresnel, és material response szimulációját.

**Jövőbeli integráció lehetőség:**
Ha `productAwareBg=true`, az IC-Light API hívható a rembg képre,
majd az ily módon megvilágított terméket kompozitáljuk a FLUX háttérre.

### 15.2 Light Estimation egyetlen képből

Az AI következő paramétereket tud becsülni egyetlen képből:

1. **Fényforrás szöge (theta):** Az árnyék irányából és hosszából
2. **Fényforrás intenzitása:** A specular highlight fényességéből
3. **Fényhőmérséklet:** A szín-castból és a fehér referencia-felületek tónusából
4. **Fényforrás mérete:** Az árnyék penumbra szélességéből

**A mi rendszerünk jelenlegi hiányossága:**
A `/api/image/analyze` Claude Vision elemzés nem veszi figyelembe ezeket részletesen.
Egy jobb elemzés tartalmazná:

    - specular_position: {x: float, y: float}  // fény szög becsléshez
    - shadow_direction: string                  // "left", "right", "none"
    - shadow_length_ratio: float               // theta szög kiszámításhoz
    - estimated_light_angle: float             // theta becsült értéke
    - estimated_color_temp: int               // Kelvin becslés
    - ambient_darkness: int                   // 0-100 skálán

### 15.3 NeRF és 3D Rekonstrukció

A Neural Radiance Fields (NeRF) több képszögből 3D-s fénymezőt rekonstruál.

**Termékfotó releváns alkalmazás:**
Ha több szögből fotózzuk a terméket, a NeRF rekonstruálja a pontos 3D geometriát
és a felület anyagtulajdonságait. Ez lehetővé teszi:
- Bármilyen szögből render
- Tetszőleges megvilágítás alkalmazása
- Fizikailag helyes compositing

**Korlátai:** Lassu, resource-intensive, nem real-time.

### 15.4 Intrinsic Image Decomposition

Szétválasztja a képet:
- **Albedo réteg:** A tárgy szín-tónus nélküli alapszíne
- **Shading réteg:** A megvilágítás mintázata (fény, árnyék)

**Alkalmazás:**
Ha az albedo réteget megkapjuk, pontosan meg tudjuk határozni a fehér műanyag
"valódi" fehérét — és azt korrigálni a jelenet ambient-jéhez.

---

# RÉSZ VIII — KOMPOZÍCIÓS SZABÁLYOK

## Fejezet 16: Termékelhelyezési Szabályok

### 16.1 Vertikális elhelyezési szabály

    Kép teteje (0%)
    --20-30%-- LÉGKÖR (fény, hangulat, háttér részletek)
    [TÁRGY TETEJE — 35-45% Y]
    [TÁRGY KÖZEPE — 55% Y]
    [TÁRGY ALJA / SURFACE — 70-75% Y] <- contact shadow itt van
    --25-30%-- ELŐTÉR (asztal, reflexió, árnyék)
    Kép alja (100%)

### 16.2 Horizontális elhelyezés

**Centerált (szimmetrikus):** E-commerce, webshop

    + Tiszta, stabil, professzionális
    + Szimmetrikus termékeknél természetes
    - Statikus, unalmas lehet

**Rule of Thirds (harmadolás):** Lifestyle, social media

    + Dinamikus, vizuálisan érdekesebb
    + "Levegőt" hagy a kép másik oldalán
    - Néha szükség van kontextusra (lifestyle elemek)

**Ajánlott social media prompthoz:**

    "product positioned slightly off-center at rule-of-thirds intersection,
    slight asymmetry for dynamic composition"

### 16.3 Leggyakoribb elhelyezési hibák

**"Lebegő termék" hiba:**
A tárgy alja szinte a képkeret alján van, nincs asztal alatta.

    Prompt javítás:
    "product placed in CENTER of table surface,
    substantial table visible beneath and in front,
    25-30% of image height as table foreground"

**"Mennyezetig ér" hiba:**
A tárgy teteje majdnem érinti a képkeretet.

    Prompt javítás:
    "generous headroom above product, product top at 35-45% frame height,
    atmospheric lighting visible above the product"

**"Tökéletes szimmetria":**
Teljesen középre igazított, mindkét oldalon egyforma megvilágítás.

    Prompt javítás:
    "slight off-center placement, directional key light creating
    clear light and shadow sides to emphasize 3D form"

---

# RÉSZ IX — CHECKUP ÉS MINŐSÉG-ELLENŐRZÉS

## Fejezet 17: Teljes Ellenőrzési Lista (100 pont)

### I. ÁRNYÉK FIZIKA (25 pont)

    [ ] (5p) Drop shadow iránya megfelel a fényforrásnak
    [ ] (5p) Drop shadow hossza arányos theta szöggel: L = H/tan(theta)
    [ ] (5p) 85-90°-os fénynél NINCS drop shadow a tárgy előtt
    [ ] (5p) Contact shadow pontosan a tárgy talpánál van
    [ ] (5p) Árnyék penumbra szélessége arányos a fényforrás méretével

### II. TÁRGY-HÁTTÉR INTEGRÁCIÓ (25 pont)

    [ ] (8p) Fehér tárgy dark scene-ben átvett ambient tónust (8-20%)
    [ ] (7p) Tárgy fénye fizikailag konzisztens a háttér fényével
    [ ] (5p) Light wrap effektus látható az éleken (subtilis)
    [ ] (5p) Color bleeding jelen van ha szín-kontraszt van

### III. CONTACT SHADOW MINŐSÉG (20 pont)

    [ ] (10p) Van sötét, szoros contact shadow a tárgy talpánál
    [ ] (5p) Contact shadow szélessége: obj_W * 0.65-0.75
    [ ] (5p) AO halo puha, elmosódott: obj_W * 0.85-1.00

### IV. SPECULAR FIZIKA (15 pont)

    [ ] (8p) Specular highlight a tárgy tetején/fedélzónáján van
    [ ] (4p) Specular mérete arányos a fényforrás méretével
    [ ] (3p) Specular NEM folyik le az oldalsó felületre

### V. ELHELYEZÉS ÉS KOMPOZÍCIÓ (15 pont)

    [ ] (5p) Tárgy az asztal közepén (nem képkeret szélén)
    [ ] (5p) Tárgy alatt elegendő asztalfelület (25-30% képmagasság)
    [ ] (5p) Tárgy felett elegendő légkör (20-30% képmagasság)

**Elfogadható minimum: 70/100**
**Jó: 82-87/100**
**Kiváló: 88-94/100**
**Tökéletes: 95+/100**

---

## Fejezet 18: Leggyakoribb Hibák és Javítások

### Hiba 1: Drop shadow overhead fénynél

    Szimptóma: Mennyezeti spot + nagy árnyék a tárgy ELŐTT az asztalon
    Gyök ok: AI összekeveri 45° és 90° szögeket
    Prompt javítás:
    "NO drop shadow on table surface in front of product,
    overhead direct light creates ONLY contact shadow directly beneath base"

### Hiba 2: Fehér tárgy "kiszakad" sötét háttérből

    Szimptóma: Fehér vödör RGB(255,255,255) a sötét workshopban
    Gyök ok: Nincs ambient tinting a compositingban
    Prompt javítás:
    "white plastic picking up warm yellow tint from workshop spotlight,
    not pure white, slightly warm-toned in the moody atmosphere"
    Compositing javítás: warmTint multiply réteg, opacity 14-18%

### Hiba 3: Specular az oldalakon (jobb-szél halo)

    Szimptóma: Fényes csík végig a vödör jobb oldalán
    Gyök ok: Specular buffer nem korlátozott a fedél-zónára
    Javítás: specBuf restrict to top 15-18% of product height ONLY

### Hiba 4: Lebegő tárgy (floating)

    Szimptóma: A vödör "lebeg" az asztal felett
    Gyök ok: Nincs AO árnyék, nincs contact shadow
    Javítás: 2-rétegű contact shadow (mag opacity 0.88 + halo opacity 0.46)

### Hiba 5: Tárgy a képkeret alján

    Szimptóma: Tárgy alja szinte érinti a képkeretet
    Gyök ok: FLUX alapértelmezetten "tölti ki" a képkeretet
    Prompt javítás:
    "product sitting in center of wooden workbench,
    camera positioned to show full table surface below AND above the product,
    product height occupying only 35-40% of total frame height"

### Hiba 6: Hiányzó vertikális fénygradiens

    Szimptóma: A hengeres test elülső oldala egységesen fehér (overhead fénynél)
    Gyök ok: Compositing nem alkalmaz Lambert-gradienst
    Javítás: form shadow gradiens réteg (multiply, 0.25, tetőtől talpig)

### Hiba 7: Hiányzó light wrap

    Szimptóma: A tárgy éle éles, "kivágott" megjelenésű
    Gyök ok: Nincs light wrap alkalmazva
    Javítás: 70px blur + 25px expand + screen blend, opacity 0.20

---

# RÉSZ X — NEURO MAP (FOGALOMTÉRKÉP)

## A Fény és Árnyéktechnológia Összefüggés-hálózata

### Fő Csomópontok és Kapcsolataik

    ┌─────────────────────────────────────────────────────────────────────┐
    │                        FÉNYFORRÁS                                   │
    │                                                                      │
    │  [Típus]     [Méret]      [Hőmérséklet]   [Szög (theta)]           │
    │  Point/Area  kicsi→kemény  Kelvin-skála    90°→0 árnyék             │
    │  Spot/IBL    nagy→puha     RGB shift       45°→L=H                  │
    └───────────────┬─────────────┬────────────────┬────────────────────┘
                    │             │                │
          ┌─────────▼──┐   ┌─────▼──────┐   ┌────▼───────────────┐
          │ FÉNY FIZIKA │   │  ÁRNYÉK    │   │ ANYAG TULAJDONS.   │
          │             │   │            │   │                    │
          │ Fresnel eq. │   │ L=H/tan(θ) │   │ PBR: Albedo        │
          │ Lambert law │   │ Umbra      │   │ Roughness          │
          │ Rayleigh    │   │ Penumbra   │   │ Metallic           │
          │ Snell       │   │ Contact    │   │ SSS                │
          │ Tyndall     │   │ Drop shadow│   │ IOR                │
          └──────┬──────┘   └─────┬──────┘   └────┬───────────────┘
                 │               │                │
                 └───────────────┼────────────────┘
                                 │
                    ┌────────────▼──────────────┐
                    │   TÁRGY MEGVILÁGÍTÁSA     │
                    │                            │
                    │ 90°: top bright, no drop   │
                    │ 45°: side, L=H drop        │
                    │ Backlit: rim + fwd shadow  │
                    │ 3-point: key+fill+rim      │
                    │ Lambert gradiens           │
                    └────────────┬───────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                       ▼
    ┌─────────────┐   ┌──────────────────┐   ┌──────────────────┐
    │ GLOBAL ILL. │   │ SZÍN & PERCEPCIÓ │   │  COMPOSITING     │
    │             │   │                  │   │                  │
    │ GI          │   │ Kelvin skála     │   │ Réteg sorrend    │
    │ Bounce fény │   │ RGB cast         │   │ Light Wrap       │
    │ Color bleed │   │ Chromatic adapt. │   │ Blend modes      │
    │ Path trace  │   │ Simult. contrast │   │ Dodge & Burn     │
    │ IBL/HDRI    │   │ Tone mapping     │   │ Contact shadow   │
    │ Radiosity   │   │ Color constancy  │   │ AO halo          │
    └──────┬──────┘   └────────┬─────────┘   └────────┬─────────┘
           │                   │                      │
           └───────────────────┼──────────────────────┘
                               │
              ┌────────────────▼──────────────────────┐
              │             AI GENERÁLÁS               │
              │                                        │
              │ FLUX → fizikai memória → prompt követ  │
              │ IC-Light → relighting                  │
              │ Light estimation → szög, K, irány      │
              │ NeRF → 3D rekonstrukció                │
              │ Intrinsic decomp → albedo+shading      │
              └────────────────┬──────────────────────┘
                               │
         ┌─────────────────────┼──────────────────────┐
         ▼                     ▼                       ▼
    ┌──────────────┐   ┌────────────────┐   ┌──────────────────┐
    │   CHECKUP    │   │  HIBÁK/JAVÍT   │   │  PONTOZÁS        │
    │              │   │                │   │                  │
    │ Árnyék irány │   │ Drop overhead  │   │ Árnyék:    25p   │
    │ Contact?     │   │ Fehér kiszakad │   │ Integráció: 25p  │
    │ Ambient tint │   │ Specular halo  │   │ Contact:   20p   │
    │ Specular zón │   │ Floating       │   │ Specular:  15p   │
    │ Elhelyezés?  │   │ Frame-bottom   │   │ Pozíció:   15p   │
    │ Gradiens?    │   │ No gradiens    │   │ Min: 70/100      │
    └──────────────┘   └────────────────┘   └──────────────────┘

### Kapcsolódási Mátrix

| Fogalom | Legfontosabb kapcsolatai |
|---|---|
| Fresnel eq. | Roughness, IOR, él-fényesség, grazing angle |
| Lambert law | Overhead fény, vertikális gradiens, form shadow |
| Theta szög | Árnyék hossz, drop shadow, irány, prompt |
| Contact shadow | AO, grounding, lebegés megszüntetése |
| Penumbra | Fényforrás méret, blur, puha árnyék |
| Color bleeding | GI, bounce light, ambient tint, integráció |
| Light Wrap | Él-integráció, compositor réteg, Screen blend |
| Roughness | Specular méret, Fresnel, highlight megjelenés |
| Kelvin | RGB cast, warm tint, white balance, tárgy szín |
| IBL/HDRI | GI, ambient, reflexió, legreálisabb módszer |
| IC-Light | AI relight, SSS, PBR, fizikailag helyes megvilágítás |
| Path Tracing | GI, bounces, caustics, fizikai memória |
| SSS | Műanyag, viasz, bőr, puha árnyékhatár, él-glow |
| Three-point | Key/Fill/Rim, professzionális standard |

---

# Fejezet 19: Gyors Referencia Kártyák

## 19.1 Fényszög → Prompt Kártya

**90° (mennyezeti spotlight pontosan felülről):**

    "overhead ceiling spotlight directly above"
    "contact shadow only beneath product base"
    "NO drop shadow on table surface in front"
    "product lid top fully illuminated with specular"
    "front cylindrical face vertical brightness gradient"

**75° (kissé előre dőlt overhead):**

    "nearly overhead spotlight"
    "very short drop shadow barely visible in front, length 0.27x product height"

**45° (klasszikus oldalsó stúdió lámpa, balról):**

    "45-degree key light from upper left"
    "drop shadow extending to the right"
    "shadow length equal to product height"
    "bright left face, dark right side"

**30° (drámai alacsony oldalsó fény):**

    "dramatic low-angle side lighting at 30 degrees"
    "long sweeping shadow, 1.7x product height to the right"
    "strong chiaroscuro, deep shadow on far side"

**Backlit (contra-jour):**

    "strong backlight/rim light from behind and above"
    "glowing bright product edges, silhouette effect"
    "dark front face, forward cast shadow toward camera"

## 19.2 Anyag → Prompt Kártya

**Fehér polipropilén (vödör test):**

    "slightly warm-tinted white plastic body"
    "matte-satin surface finish, diffuse specular"
    "subtle Fresnel edge highlight at curved sides"
    "translucent plastic, slight subsurface warm glow on thin sections"

**Navy kék ABS (fedél):**

    "polished navy blue plastic lid"
    "slightly glossy, defined specular highlight on top"
    "deep saturated navy, darker than black in shadows"

**Workshop fém asztal:**

    "weathered steel workshop table"
    "subtle surface reflections, slight specularity"
    "scratched and work-worn texture, industrial material"

## 19.3 Compositing → Paraméter Kártya

**Contact shadow (inner core):**

    width  = obj_W * 0.68
    height = obj_H * 0.04
    opacity = 0.88
    blur   = 3px
    blend  = multiply
    offset-y = 0px (pontosan a talpnál)

**AO Halo (outer soft):**

    width  = obj_W * 0.95
    height = obj_H * 0.14
    opacity = 0.46
    blur   = 22px
    blend  = multiply

**Drop shadow (45°, balról jövő fény):**

    offset-x = +obj_W * 0.40 (jobbra)
    offset-y = +obj_H * 0.75 (lefelé)
    opacity  = 0.64
    blur     = 14px
    blend    = multiply

**Rim darkening (árnyékos jobb él):**

    width   = obj_W * 0.20
    opacity = ambient_darkness * 0.43
    blur    = 8px
    blend   = multiply

**Specular highlight (fedél zóna):**

    zone    = felső 16% of obj_H
    width   = obj_W * 0.52
    opacity = 0.40
    blur    = 4px
    blend   = screen

**Warm ambient tint (2700K workshop):**

    tint_color = RGB(255, 210, 170)
    opacity    = 0.14
    blend      = multiply (Color)

**Light Wrap:**

    bg_blur  = 70px
    expand   = 25px a tárgy alfa körül
    opacity  = 0.20
    blend    = screen

    opacity  = 0.20
    blend    = screen

---

# FEJEZET 20 — Általánosítás: Bármilyen Termékre Alkalmazható Fényszabályok

> **FONTOS MEGJEGYZÉS:** Ez a könyv a Poli-Farbe Inntaler festékes vödröt
> használja ILLUSZTRÁCIÓKÉNT és ESETTANULMÁNYKÉNT. Minden fizikai törvény,
> compositing paraméter és FLUX prompt stratégia BÁRMILYEN feltöltött termékre
> alkalmazható: parfüm, bor, cipő, elektronika, élelmiszer, szerszám, kozmetikum,
> játék, bútor, ékszer, ruházat, könyv — a fény fizikájának törvényei
> termékosztálytól FÜGGETLENEK.

## 20.1 Anyagtípus → Fény-Interakció Táblázat (Kibővített)

A lighting_physics_reference.md anyagtáblázatát minden termékosztályra kiterjesztve:

| Anyagtípus | Példatermékek | Roughness | Metallic | Fresnel | SSS |
|---|---|---|---|---|---|
| **Fehér PP műanyag** | Vödör, kannister, szörpesdoboz | 0.55 | 0.0 | Gyenge | Nincs |
| **Átlátszó üveg** | Borospalack, parfüm, szósz | 0.05-0.15 | 0.0 | Erős | Nincs |
| **Matt üveg / fagyos** | Frosted palack, tej, vodka | 0.35-0.55 | 0.0 | Közepes | Gyenge |
| **Fényes műanyag** | Sampon, dezodor, kozmetika | 0.15-0.30 | 0.0 | Közepes | Nincs |
| **Matt műanyag** | Elektronikai burkolat, játék | 0.55-0.80 | 0.0 | Gyenge | Nincs |
| **Fém (polírozott)** | Kávéfőző, konzervdoboz, óra | 0.05-0.15 | 1.0 | Nagyon erős | Nincs |
| **Fém (szatén/kefe)** | Dezodor, vázlat, késpenylé | 0.30-0.50 | 1.0 | Erős | Nincs |
| **Fém (rozsdás/kopott)** | Szerszám, ipari termék | 0.65-0.85 | 0.7 | Közepes | Nincs |
| **Bőr (sima)** | Cipő, táska, karkötő | 0.40-0.60 | 0.0 | Gyenge-közepes | Nincs |
| **Bőr (matt/kopott)** | Munkacipő, vintage táska | 0.70-0.90 | 0.0 | Gyenge | Nincs |
| **Textil (sima)** | Ruházat, szatyor, pólócsomag | 0.75-0.95 | 0.0 | Nincs | Nincs |
| **Papír / karton** | Doboz, könyv, magazine | 0.70-0.90 | 0.0 | Nincs | Gyenge |
| **Fényes papír / lakkolt** | Parfümdoboz, luxus csomag | 0.10-0.30 | 0.0 | Közepes | Nincs |
| **Élelmiszer (száraz)** | Keksz, dió, chipsz (csomag) | 0.65-0.85 | 0.0 | Nincs | Nincs |
| **Élelmiszer (nedves)** | Zöldség, gyümölcs, húskészítmény | 0.40-0.70 | 0.0 | Gyenge | Erős |
| **Fa (lakkozott)** | Parfümállvány, vágódeszka | 0.20-0.40 | 0.0 | Gyenge-közepes | Nincs |
| **Fa (nyers/csiszolt)** | Szerszámnyél, organikus játék | 0.60-0.85 | 0.0 | Nincs | Gyenge |
| **Kerámia / porcelán** | Bögre, tányér, dísz | 0.10-0.40 | 0.0 | Közepes | Nincs |
| **Gumi / szilikon** | Sportfelszerelés, tömlő | 0.60-0.85 | 0.0 | Nincs | Nincs |
| **Elektroluminescent / OLED** | Telefon kijelző, tablet | 0.05 | 0.0 | Nagyon erős | Nincs |

---

## 20.2 Termékosztály → Compositing Szabálykönyv

### 20.2.1 Hengerek (cylindrical) — vödör, bögre, spray, konzervdoboz

    Contact shadow: width = obj_W * 0.68, height = obj_H * 0.04 → oval, multiply
    AO Halo: width = obj_W * 0.95, opacity = 0.40-0.55 (darkness alapján)
    Specular: top 12-16% of height, width = obj_W * 0.52
    Form shadow: top-to-bottom gradient (Lambert-törvény alapján overhead fénynél)
    Rim: oldalsó élek, Fresnel-effektus alapján

### 20.2.2 Dobozok (rectangular) — elektronika, csomag, könyv

    Contact shadow: width = obj_W * 0.85 (szögletes alap → szélesebb shadow)
                    height = obj_H * 0.03, nincs oval → elongált téglalap
    AO Halo: width = obj_W * 1.00, kisebb opacity (a saroknál AO erős)
    Specular: fedőlapra korlátozva, ha phi > 10° → látható a fedőlapon
    Form shadow: oldalnézet → erős oldalsó shadow a nem megvilágított oldalon
    Corner darkening: belső sarkok sötétebben (AO a sarkok közelében)

### 20.2.3 Palackok (bottle) — bor, parfüm, szörp, dezodor

    Contact shadow: width = obj_W * 0.60 (szűkebb alap), kisebb oval
    AO Halo: width = obj_W * 0.85
    Specular: hosszú, keskeny csík a palack testén (hengeres + üveg Fresnel)
    Ha üveg: caustics lehetséges az asztalon (fény megtörése)
    Ha üveg + backlit: translucency glow az anyagon keresztül
    Rim: erős Fresnel rim highlight az üveg szélein (grazing angle)

### 20.2.4 Lapos tárgyak (flat_planar) — tányér, könyv, panel

    Contact shadow: width = obj_W * 0.95 (széles alap), height = obj_H * 0.01 (nagyon vékony)
    AO Halo: width = obj_W * 1.05, erős (nagy érintkezési felület)
    Specular: a lap teljes felületén lehet (ha glossy) → DE CSAK a fényforrás irányában
    Form shadow: minimális (lapos → nincs mélység)

### 20.2.5 Szabálytalan tárgyak (irregular) — cipő, szerszám, táska

    Contact shadow: width = obj_W * silhouette_fill, oval ha phi > 10°
    AO Halo: width = obj_W * 0.90, opacity = 0.35-0.50
    Specular: tárgygeometria-specifikus — a sima felületeken jelenik meg
    Form shadow: oldalfelületek alapján, de irány bizonytalan → alacsony opacity
    KRITIKUS SZABÁLY: Ha irregular → minden compositing paramétert 80%-ra csökkenteni
    (konzervatívabb, mert a geometria nem ismert)

---

## 20.3 Termékosztály → FLUX Prompt Anyag Kiegészítők

### 20.3.1 Üveg termékek (palack, pohár, parfüm)

    "clear glass bottle, light refracts through transparent walls,
     subtle caustic light pattern on table surface beneath bottle,
     strong Fresnel highlight on glass rim edges,
     interior of bottle slightly visible through transparent body"

### 20.3.2 Fém termékek (kávéfőző, konzervdoboz, fém váza)

    "brushed aluminum / polished stainless steel surface,
     sharp specular highlight, reflections of surroundings visible in surface,
     high-contrast metallic sheen, environment reflected in curved metal body"

### 20.3.3 Bőr termékek (cipő, táska, bőröv)

    "genuine leather texture, subtle surface micro-texture visible,
     slight specular gloss on smooth areas, matte absorptive surface on rough areas,
     leather creases and grain pattern visible in key lighting zones"

### 20.3.4 Élelmiszer / organikus termékek

    "food product with natural subsurface scattering,
     soft diffuse glow visible through semi-translucent product body,
     warm organic tones, fresh product appearance"

### 20.3.5 Elektronikai termékek

    "consumer electronics with glossy display surface,
     strong specular highlight on screen panel,
     subtle ambient occlusion in device corners and recesses,
     clean precision edges with tight shadow at joints"

---

## 20.4 Megvilágítás → Tárgyforma Interakció Általánosítva

A legfontosabb általánosítható szabályok:

### TÖRVÉNY 1: Lambert-törvény minden diffúz felületre
    Érvényes: bőr, textil, matt műanyag, papír, fa, élelmiszer
    Nem érvényes: fém (conductor) — ott a Cook-Torrance BRDFet kell figyelni

### TÖRVÉNY 2: Fresnel-effektus minden dielektrikumra
    Érvényes: üveg, műanyag, kerámia, bőr, fa, papír
    Különösen erős: üveg (IOR ~1.5), kristály (IOR ~2.0)
    Gyenge: matt felületek (mikrogeometria elmossa)

### TÖRVÉNY 3: Contact shadow MINDIG van
    Érvényes: MINDEN szilárd tárgy MINDEN fénynél
    Kivétel: tárgy lebeg a felszíntől (pl. felakasztva)

### TÖRVÉNY 4: Overhead fény → nincs drop shadow
    Érvényes: MINDEN tárgyra, MINDEN anyagnál
    (A fényforrás szögétől függ, nem a tárgy anyagától)

### TÖRVÉNY 5: Ambient tint átvétel MINDEN világos felületre
    Fehér, sárga, szürke, bézs → átveszi az ambient színt
    Sötét tárgyak (fekete, sötétkék) → kevésbé látható
    A százalékos mérték az anyag albedo-jától és az ambient darkness-től függ

### TÖRVÉNY 6: SSS (Subsurface Scattering) organikus anyagokban
    Érvényes: viasz, bőr (emberi és állati), élelmiszer, zöldség, gyümölcs, virágszirmok
    Nem érvényes: fém, üveg, kerámia, kemény műanyag
    FLUX prompt: "soft translucent glow visible through edges when backlit"

---

## 20.5 Checkup Szabályok Általánosítva

A Claude Vision checkup kérdőlistája BÁRMILYEN termékre:

```
ÁLTALÁNOS CHECKUP (termékosztálytól független):
□ A termék ül a felszínen (nincs lebegés)?
□ Contact shadow jelen van a tárgy talpánál?
□ A fény iránya konzisztens a termék felszíni gradiensével?
□ A termék nem vágódik le a képkeret szélénél?
□ A háttér perspektívája egyezik a termék perspektívájával?
□ Az ambient tint konzisztens a háttér fényével?

ANYAGTÍPUS SZERINTI CHECKUP:
□ Üveg termék: látszanak caustics / Fresnel rim highlights?
□ Fém termék: van éles specular highlight és környezet-reflexió?
□ Bőr/textil: van anyagszerű felszíni textúra?
□ Élelmiszer: természetes organikus megjelenés, SSS ha szükséges?
□ Elektronika: éles sarokok, precíz illeszkedés, display gloss?

PERSPEKTÍVA CHECKUP:
□ A termék teteje (ha phi > 15°) látható és arányos az elevation angle-lel?
□ A háttér asztallap mélysége arányos a phi szöggel?
□ Az eltűnési pontok egyeznek a termék és háttér között?
```

---

*Kézikönyv verziója: 2026-07-01 (v1.1 — Fejezet 20 hozzáadva: Általánosítás)*
*Forrás: Fizika tankönyvek, PBR dokumentáció, Photography tutorials,*
*IC-Light/ControlNet GitHub, 3D rendering best practices,*
*PBRT Book (Pharr, Jakob, Humphreys), CG Cookie, Scratchapixel*
*Ez egy ÉLŐ DOKUMENTUM — bővítendő minden új tapasztalattal*

