# Fényvetülés és árnyékfizika — Termékgeneráló és -elemző referencia

> **Célja:** Ezt a dokumentumot használja a rendszer háttérgenerálásnál (FLUX prompt), compositing-nál (Sharp effektek), és checkup-nál (Claude Vision elemzés) is.

---

## 1. Az árnyék alapjai — fizikai törvények

### 1.1 Az árnyék hosszának kiszámítása (szögfüggvény)

```
L = H / tan(θ)
```

ahol:
- **L** = az árnyék hossza az asztalon (a tárgy alaptól mérve)
- **H** = a tárgy magassága
- **θ** = a fényforrás szöge a vízszintestől mérve (fokokban)

### 1.2 Szögtáblázat — fény pozíciója → árnyék

| Fényszög (θ) | Árnyék hossza | Irány | Megjegyzés |
|---|---|---|---|
| **90° (pontosan fentről)** | **≈ 0 — NINCS árnyék** | Csak a tárgy alatt | Csak contact shadow marad |
| **80°** | ~0.18 × H | Közel a tárgyhoz | Alig látható |
| **60°** | ~0.58 × H | Közepes | |
| **45°** | **1.00 × H** | = tárgy magasság | Klasszikus studio |
| **30°** | ~1.73 × H | Nagyon hosszú | Drámai |
| **15°** | ~3.73 × H | Extrém hosszú | Naplemente hatás |

> **KRITIKUS:** Ha a fény >= 85°-ból jön (mennyezeti spot), a tárgy NEM vet előre árnyékot. Csak contact shadow létezik.

---

## 2. Az árnyék iránya

Az árnyék MINDIG a fényforrással SZEMBEN esik:

```
Fény bal oldalt  → árnyék jobbra
Fény jobb oldalt → árnyék balra
Fény felülről    → árnyék CSAK a tárgy alatt (contact)
Fény hátulról    → árnyék előre (a néző felé)
```

---

## 3. Árnyéktípusok

### 3.1 Umbra és Penumbra

- **Umbra:** Sötét mag — ahol a fény teljesen el van takarva
- **Penumbra:** Puha szél — ahol a fény részben átszivárog
- Nagy fényforrás → nagy penumbra (puha árnyék)
- Kis/távoli fényforrás → kis penumbra (kemény árnyék)

### 3.2 Árnyékkeménység táblázat

| Fényforrás típus | Árnyék minőség |
|---|---|
| Pontszerű LED közel | Kemény, éles |
| Softbox | Ultralágy, elmosódott |
| Mennyezeti spotlight | Kemény belső, puha szél |
| Felhős ablakfény | Szinte nincs árnyék |

---

## 4. Contact Shadow (Alap-árnyék)

A legreálisabb elem — MINDIG megjelenik, fényszögtől függetlenül!

### 4.1 Fizikai szerkezete

```
[Tárgy talpa]
   =========
  [CONTACT]     ← sötét mag: ~85-95% opacitás, szűk zóna
  [ZONE   ]     ← magasság: tárgy H 3-5%-a
   =========
  [AO HALO]     ← ambient occlusion: 40-60% opacitás, szélesebb
  [       ]     ← blur: 15-30px, tárgy szélességének 0.85-1.0×-e
```

**Helyes értékek:**
- Contact mag: opacity 0.85–0.95, blur 2–4px
- AO halo: opacity 0.40–0.60, blur 15–30px, blend: multiply

### 4.2 KRITIKUS hiba

Ha a contact shadow pozíciója nem pontosan a tárgy talpánál van → LEBEGÉS hatás!

---

## 5. Drop Shadow (Vetett árnyék)

### 5.1 CSAK akkor jelenik meg, ha θ < 85°

| Jelenet | θ | Drop shadow hossz | Megjegyzés |
|---|---|---|---|
| Mennyezeti spot direkt | ~90° | NINCS | Csak contact shadow |
| Enyhén oldalt tolt spot | ~75° | ~0.27 × H | Alig látható |
| 45°-os studio lámpa | 45° | = tárgy magasság | Klasszikus |
| Oldalsó drámai | 30° | 1.7× tárgy H | Erős, hosszú |

### 5.2 Drop shadow blur

```
blur = alap_blur × (shadow_távolság / tárgy_méret) × softness
```
- Hard spotlight: softness = 0.5
- Softbox: softness = 2.0

---

## 6. Fényhőmérséklet és színhatás

### 6.1 Kelvin-skála

| Kelvin | Típus | Szín a tárgyra |
|---|---|---|
| 1800–2700K | Gyertya, izzó | Erősen narancssárga |
| 3000–3500K | Tungsten studio | Melegfehér, sárga |
| 4000–4500K | Fehér LED | Neutrális |
| 5000–5500K | Nappali, flash | Tiszta fehér |
| 6000K+ | Felhős ég | Kékes |

### 6.2 Fehér tárgy ambient tónus-átvétel

Fehér műanyag (pl. Poli-Farbe vödör) sötét workshop spotlámpa-jelenetben:

| Jelenet fényhőmérséklet | RGB shift a fehéren | Opacitás |
|---|---|---|
| 2700K sárga workshop spot | +25R, +8G, -18B | 12-18% |
| 3500K semleges spot | +12R, +4G, -8B | 8-12% |
| 5000K fehér nappali | 0, 0, 0 | 0% |
| 6500K hideg LED | -8R, +4G, +18B | 8-12% |

> **SZABÁLY:** Sötét/moody jelenetben a fehér tárgy sosem marad 255,255,255. Az ambiente kb. 8–18%-ban "bemegy" a fehér felületre. Ha a tárgy teljesen fehér marad dark scene-ben → FAKE/PASTED-ON hatás.

---

## 7. Tárgy megvilágítása fényszög szerint

### 7.1 Hengeres tárgy overhead (90°) fénynél

```
         [SPOTLIGHT FELÜLRŐL]
                  |
                  ↓
            ___________
           /     ★     \   ← FEDÉL (tető): 100% megvilágított, erős specular
          |   LABEL    |   ← Elülső oldal: 40-60% (csak bounced fény)
          |_____________|
                |||         ← Contact shadow
         [ASZTAL FELÜLETE]
```

**KÖVETKEZMÉNY:** Overhead fénynél az elülső oldal (ahol a label van) SOHA nem lehet ugyanolyan fényes mint a tető!

### 7.2 Vertikális fénygradiens (overhead fény esetén)

Az elülső felület tetőtől-talpig:
```
Fedél alatt → 75-80% brightness
Label közepe → 50-60% brightness
Talp közelében → 30-40% brightness
```

Ez a gradiens teszi a terméket 3D-snek!

### 7.3 45°-os oldalsó fénynél

```
Megvilágított oldal (fény felöl): 85-100% brightness
Elülső oldal: 50-65% brightness
Árnyékos oldal: 15-30% brightness (ambient fill)
```

---

## 8. Rim és Edge Lighting

### 8.1 Rim light (él-fény)

A tárgy peremén megjelenő highlight:
- **Fény felülről** → felső perem lit, oldalak sötétek
- **Fény bal** → jobb él rim-highlighted
- Rim opacity: 0.15–0.45 (ambient darkness alapján)
- Blend mode: screen

### 8.2 Rim darkening (árnyékos oldal)

Az árnyékban lévő él sötétedik:
- Opacity: ambient_darkness × 0.40–0.50
- Blend mode: multiply
- Width: tárgy szélességének 15–25%-a

---

## 9. Felületi reflexió

### 9.1 Mikor jelenik meg?

- Sima, fényes felület (fém, üveg, lakkozott fa): reflexió megjelenik
- Matt fa, beton: minimális
- A reflexió MINDIG a tárgy előtt/alatt, vertikálisan tükrözve

### 9.2 Reflexió paraméterei

```
opacity: surface_specularity × 0.3–0.5
height:  tárgy_magasság × 0.2–0.35
blur:    15–40px (mindig erősen elmosódott)
flip:    függőlegesen tükrözve
```

---

## 10. Compositing Szabálykönyv

### 10.1 Helyes vs. Hibás jellemzők

| Jellemző | HELYES | TIPIKUS AI HIBA |
|---|---|---|
| Overhead (90°) árnyék | Csak contact shadow | Drop shadow a tárgy ELŐTT |
| 45° oldalsó árnyék | Irányos drop shadow, ellentétes irányban | Szimmetrikus mindenütt |
| Fehér tárgy dark scene-ben | Átveszi az ambient tónust (8-18%) | Teljesen fehér, "kiszakad" |
| Overhead fény + elülső oldal | Sötétebb mint a fedél | Ugyanolyan fényes mint a fedél |
| Contact shadow | Szorosan a talp alatt | Nincs, vagy messze lent |
| Specular highlight | Csak fedélen/tetőn | Az egész magasságon |
| Tárgy pozíció | Asztal közepén | Képkeret alján lebeg |
| Gradiens a hengeres test elöl | Felülről: fényes → alul: sötét | Egységes fényesség |

### 10.2 FLUX prompt ajánlások fényszög szerint

#### 90° (mennyezeti spotlight, pontosan felülről)
```
overhead ceiling spotlight directly above the product, contact shadow only directly beneath
the product base, absolutely NO drop shadow extending forward on the table surface,
product top/lid fully illuminated with sharp specular highlight,
front face of product in partial shadow lit only by bounced ambient fill,
vertical brightness gradient on cylindrical body: bright top, darker towards base
```

#### 45° (oldalsó studio lámpa, bal)
```
45-degree key light from upper left, drop shadow extending to the right,
shadow length equal to product height, soft penumbra edges,
strong rim highlight on left edge, rim darkening on right edge
```

#### 30° (drámai alacsony szögű fény)
```
dramatic low-angle side lighting, long sweeping shadow to the right,
shadow length 1.5-2x the product height, hard shadow edges with clear umbra,
strong chiaroscuro contrast, deep shadow zone on far side
```

---

## 11. Termékelhelyezési szabályok

### 11.1 Helyes kompozíció

```
[Kép teteje — 0%]
    |
    | ~20-30% "légkör" (fény, háttér)
    |
[Tárgy teteje — ~35-45% Y]
    |
[Tárgy közepe — ~55% Y]
    |
[Tárgy alja / surface — ~70-75% Y]  ← contact shadow ittvan
    |
[Asztal felülete]
[Kép alja — 100%]
```

**Horizontal:** Enyhe aszimmetria természetesebb (ne pontosan középen)

### 11.2 Kompozíciós hibák — kerülni kell!

| Hiba | Leírás |
|---|---|
| "Úszó termék" | A tárgy alja és az asztal között rés van |
| "Képkeret alján" | Nincs elég asztal a tárgy alatt |
| "Mennyezetig ér" | Nincs elég légkör a tárgy felett |
| "Szimmetria-gyanú" | Tökéletesen középre, minden oldal egyformán megvilágítva |

---

## 12. Összefoglaló Ellenőrző Lista

### ✅ Kötelező checkupok

```
□ Árnyék iránya megfelel a fényforrás pozíciójának
□ 90° fénynél NINCS drop shadow a tárgy előtt
□ Contact shadow megvan a tárgy talpánál
□ Dark scene-ben a fehér tárgy átvett valamennyi ambient tónust
□ Elülső oldal sötétebb mint a teteje (overhead fény)
□ Specular highlight csak a fedélen/tetőn van
□ Tárgy ül az asztalon (nincs lebegés)
□ Tárgy az asztal közepén van, nem a szélén
□ Nincs rectangular artifact a tárgy körül
□ Label szöveg olvasható és valós
```

### 🔢 Minőségi pontozás

| Kategória | Max pont |
|---|---|
| Árnyék fizikai helyessége (irány, méret) | 25 pont |
| Tárgy-háttér integráció (ambient, gradiens) | 25 pont |
| Contact shadow minősége | 20 pont |
| Specular fizikai helyessége | 15 pont |
| Tárgy elhelyezése (asztalon ülés, center) | 15 pont |
| **ÖSSZESEN — elfogadható minimum:** | **70 / 100** |

---

*Forrás: Photography lighting physics, 3D rendering best practices, product photography theory*
*Utolsó frissítés: 2026-06-30*
