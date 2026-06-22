# Design-System Rails — AI-vezérelt kreatív-generálás designer nélkül

Belső specifikáció a Think AI csapatnak. Ez a dokumentum definiálja azt a szabályrendszert, ami designer nélkül, tisztán AI- és kód-vezérelten márkahű, tiszta social kreatívokat állít elő SMB-ügyfeleknek.

---

## 0. A központi elv (ezt értsd meg először)

Az AI-generált layout azért szokott csúnya lenni, mert hagyjuk a modellt **nyers koordinátákat** kitalálni egy üres vászonra. Ezt itt megtiltjuk. A rendszer két részre van vágva:

- **Determinisztikus réteg (a "designer"):** a grid, a tokenek, és a layout-archetípusok (blueprintek). Ezek kódban élnek, fixek, és minden geometriát ezek számolnak ki. Soha nem hibáznak, mert matematika.
- **AI réteg (a "kitöltő"):** az LLM csak **bounded szemantikai döntéseket** hoz — melyik archetípus, milyen szöveg a slotba (megadott karakterkereten belül), milyen kép-kezelés, melyik accent szín. Koordinátát soha nem ad.

A minőség onnan jön, hogy a blueprintek eleve jól vannak megtervezve (egyszer, ebben a dokumentumban), és az AI fizikailag nem tud kilépni belőlük. Ez a "good by construction": a tört kimenet lehetetlen, mert a sínek tiltják.

**Következmény a no-designer constraintre:** nem az AI rajzol skeleton-t szabadon. Az AI a 8-9 blueprint *közül* választ és *kitölti* őket. A blueprinteket a fejlesztő (vagy egy AI coding agent) implementálja **egyszer** ebből a specifikációból, mint determinisztikus layout-függvényeket. Onnantól minden poszt ezekből áll össze.

---

## 1. Vászon és grid

Minden méret 8px-es alapegység többszöröse (8px base grid). Ez garantálja a ritmust.

**Formátumok (v1):**
- Instagram feed: **1080 × 1350** (4:5) — elsődleges
- Story / Reels cover: **1080 × 1920** (9:16)
- (Négyzet 1080×1080 és carousel: v2, nem must SMB-re)

**Safe zone (feed):**
- Outer margin: **64px** minden oldalon
- Tartalmi terület: **952 × 1222**, origó (64, 64)
- Semmilyen szöveg vagy logó nem lóghat a margón kívülre

**Grid (feed):**
- 4 oszlop, **24px** gutter, a tartalmi területen belül → oszlopszélesség 214px
- Vertikális zónák (vízszintes sávok): `header` (felső), `hero` (közép-nagy), `body`, `footer` (CTA/info). Az archetípusok ezeket a zónákat töltik ki, nem szabad pozíciókat.

**Story safe zone:**
- Felül **220px**, alul **250px** kerülendő (UI-elemek, profilkép, swipe). A fő tartalom a középső biztonságos sávba kerül.

---

## 2. Type scale

Moduláris skála, fix lépcsőkkel. 1080px vásznon nagyok a méretek, mert mobilon kicsiben nézik — a headline-nak ütnie kell.

| Token | Méret (px) | Line-height | Használat |
|---|---|---|---|
| `display` | 96 | 1.05 | hero headline, nagy kijelentés |
| `headline` | 72 | 1.10 | fő üzenet |
| `subhead` | 48 | 1.20 | másodlagos üzenet |
| `body` | 36 | 1.35 | leírás, törzs |
| `caption` | 28 | 1.30 | meta, dátum, hely |
| `micro` | 22 | 1.30 | jogi, handle, apróbetű |

**Súlyok: kizárólag kettő** — Regular (400) és Bold (a brand fontjának legerősebb elérhető súlya, 600–800). Köztes súlyt nem használunk.

**Tracking:** display/headline esetén enyhe negatív letter-spacing (-1% … -2%), body-nál 0, micro-nál +1%.

---

## 3. Spacing tokenek

| Token | px |
|---|---|
| `xs` | 8 |
| `sm` | 16 |
| `md` | 24 |
| `lg` | 40 |
| `xl` | 64 |
| `2xl` | 96 |
| `3xl` | 128 |

Minden padding, margin és gap ezekből épül. Egyedi érték tilos. (Az archetípusok ezeket a tokeneket hivatkozzák, nem nyers számot.)

---

## 4. Szín-szerepek és szabályok

A brand kit nyers színeit (primary, secondary, accent) **szerepekre** képezzük le, nem közvetlenül használjuk:

| Szerep | Mi tölti be |
|---|---|
| `surface` | háttér (gyakran semleges: brand sötét vagy világos alapszíne, vagy duotone-olt kép) |
| `ink` | elsődleges szöveg (a surface-hez képest kontrasztos) |
| `ink-muted` | másodlagos szöveg (csökkentett opacitás, ~70%) |
| `accent` | kiemelés, CTA pill, badge — a brand legélénkebb színe |

**Kötelező kontraszt-enforcement (WCAG AA):**
- Törzs/kis szöveg: **≥ 4.5:1**
- Nagy szöveg (≥ 48px, vagy ≥ 36px bold): **≥ 3:1**
- Az `ink`-et a rendszer **automatikusan választja**: a brand sötét vagy világos színe közül az, amelyik átmegy a kontraszt-küszöbön a `surface` ellen. Ha egyik sem: feketét/fehéret kényszerít.
- Szöveg képen: ha a kontraszt nem elég, **scrim** kerül a kép és a szöveg közé (lásd 6. szakasz), amíg átmegy.

**Accent-szabály:** az accent szín a vászon **legfeljebb ~15%-át** fedheti. Egyszerre egy accent. Az accent sosem megy törzsszöveg alá nagy felületen (olvashatóság).

---

## 5. Font-logika (designer nélkül)

**Alapeset:** a brand fontját használjuk a headline-okhoz. Törzshöz: ha a brandnek egy fontja van, ugyanazt használjuk Regular súllyal; ha párosítás kell, egy **fix, biztonságos pairing-táblából** választunk a brand fontjának klasszifikációja alapján:

| Brand font típusa | Biztonságos törzs-pár |
|---|---|
| Geometric sans (pl. Poppins, Montserrat) | Humanist sans (Inter, Source Sans) |
| Humanist sans (pl. Open Sans) | ugyanaz, két súlyban |
| Serif (pl. Playfair) | Semleges sans (Inter, Work Sans) |
| Display/dekoratív | csak headline-ra; törzs mindig semleges sans |

**Magyar glyph-ellenőrzés (KÖTELEZŐ):** minden használt font cmap-jét ellenőrizzük az `ő` (U+0151) és `ű` (U+0171) lefedettségére, plusz a teljes magyar készletre (á é í ó ö ő ú ü ű és nagyok). Ha hiányzik bármelyik glyph → automatikus fallback egy ismert, teljes magyar lefedettségű fontra (vetted lista: pl. Inter, Source Sans 3, Noto Sans, Work Sans), és figyelmeztetés a brand kit szerkesztőben. **Renderelt outputban is ellenőrizzük** (vision vagy .notdef-box detektálás), mert a cmap-lefedettség nem garancia a helyes rajzolásra.

---

## 6. Kép-kezelés

A háttér a "designed" érzés fele. Négy mód, az archetípus választja:

- **`solid`** — egyszínű vagy enyhe gradient surface, nincs kép. A legbiztonságosabb, soha nem néz ki rosszul. Idézetekhez, bejelentésekhez default.
- **`duotone`** — a kép a brand két színére van átszínezve (`feColorMatrix` / canvas duotone). **Ez a kép-default**, mert garantálja a paletta-harmóniát bármilyen forrásképből, és eltünteti az "AI-slop" érzést.
- **`framed`** — a kép egy zónában ül, a szöveg külön, solid zónában. Nincs szöveg-képen probléma.
- **`full-bleed`** — a kép kitölti a vásznat, scrim + szöveg a nyugodt zónában. Csak akkor, ha van elég csendes terület.

**Scrim számítás:** full-bleed esetén a szöveg-zóna alá gradient vagy solid overlay kerül (surface színből), olyan opacitással, ami a kontraszt-küszöböt eléri. Az opacitás számolt, nem fix.

**Nyugodt-zóna detektálás:** full-bleed-nél a képet kvadránsokra osztjuk, és a legkisebb vizuális varianciájú (legnyugodtabb) zónába tesszük a szöveget. Ha egyik zóna sem elég nyugodt → kényszerített scrim, vagy váltás `framed`/`solid`-ra.

**Háttér-generálás default:** a költség és a minőség miatt az alapértelmezett a **stock + duotone**, ne az AI-képgenerálás. Az AI-kép (fal.ai/Flux) csak ott engedélyezett, ahol tényleg hozzátesz. A promptba mindig megy: "minimalist composition, empty negative space for text, muted palette, no text, no people unless requested".

---

## 7. Layout archetípusok (a blueprintek)

Ez a rendszer magja. Minden archetípus egy **determinisztikus függvény**: `(tartalom, brand_kit) → Polotno JSON`. Zónákban gondolkodik, a koordinátákat a gridből számolja. Az AI csak archetípust választ és slotokat tölt.

Kilenc alap-archetípus fedi az SMB-igények túlnyomó részét:

**A1 — Centered statement** (`solid`/`duotone`)
Középre igazított headline + opcionális subhead, logó felül vagy alul. Szinte törhetetlen. → idézet, bejelentés, köszöntő.

**A2 — Hero image + bottom band** (`full-bleed`/`framed`)
Kép a felső ~60%-ban, alul solid sáv (surface vagy accent) headline + CTA-val. → termék, menüpont, promó.

**A3 — Split** (`framed`)
Kép a felső/bal felében, szöveg az alsó/jobb solid felében. Tiszta kettéosztás. → termékjellemző, before/after egy képen.

**A4 — Full-bleed overlay** (`full-bleed`)
Kép teljes, scrim, szöveg a nyugodt zónában, accent CTA pill. → szezonális, lifestyle, esemény.

**A5 — Top/footer bar** (`framed`)
Kép középen, felül brand-színű sáv logóval, alul sáv CTA-val vagy infóval. → nyitvatartás, info, "megújultunk".

**A6 — Big number / badge** (`solid`/`duotone`)
Nagy accent alakzat (kör/burst) a kedvezmény %-kal vagy "ÚJ!"-jal, támogató szöveg. → akció, kedvezmény.

**A7 — Quote card** (`solid`/`framed`)
Nagy idézőjel, vélemény-szöveg, attribúció, kis avatar/logó. → ügyfélvélemény, idézet.

**A8 — List / grid** (`solid`)
2–4 elemű lista vagy grid, számokkal/ikonokkal. → tipp, "3 ok amiért", hét X-e.

**A9 — Story CTA** (9:16, `full-bleed`/`solid`)
Vertikális: felül hook, alul CTA/swipe zóna a biztonságos sávban. → minden story-formátumú tartalom.

Minden archetípus-definíció tartalmazza: a zónák grid-koordinátáit, mely slotok kötelezők/opcionálisak, a szöveg auto-fit szabályait, a kép-kezelési módot, a logó helyét, az accent helyét. (Implementációs részletek a 12. szakasz példájában.)

---

## 8. Tartalomtípus → archetípus mapping

Az SMB-taxonómia ~20 típusa, mindegyik 1-2 preferált archetípussal. Az orchestrátor innen választ (vagy az ügyfél felülírja):

| Tartalomtípus | Preferált archetípus |
|---|---|
| Új termék / menüpont | A2, A3 |
| Akció / kedvezmény | A6, A2 |
| Szezonális ajánlat | A4, A2 |
| Nyitvatartás / ünnepi zárás | A5, A1 |
| Megújultunk / új helyszín | A5, A4 |
| Általános bejelentés | A1, A5 |
| Ügyfélvélemény | A7 |
| Before / after | A3 |
| "Hét X-e" | A2, A8 |
| Idézet / motiváció | A1, A7 |
| Behind the scenes / csapat | A4, A3 |
| Tipp / "tudtad?" | A8, A1 |
| Kérdés / szavazás | A1, A4 |
| Esemény-bejelentés | A4, A2 |
| Időpont-emlékeztető | A5, A1 |
| Álláshirdetés | A1, A5 |
| Ünnepi köszöntő | A1, A4 |

Story-verzió (A9) bármelyikből származtatható: az orchestrátor a feed-tartalmat átképzi a vertikális biztonságos sávra.

---

## 9. Auto-fit szöveg szabályok

Minden szöveg-slotnak van egy bounding boxa (az archetípus zónájából). Az algoritmus:

1. Indulás az archetípus cél-méretén (pl. A1 headline = `display`).
2. Ha a szöveg túllóg szélességben → tördelés a max sorszámig.
3. Ha még mindig túllóg magasságban → font-méret csökkentése a skála következő lépcsőjére, ismétlés.
4. Ha eléri a **min-méretet** és még mindig túllóg → tartalom-truncation **és flag a regenerálásra** rövidebb copyval.

**Max sorszám slotonként:** headline 3, subhead 2, body 4, caption 2.

**Kulcs a kevés fit-hibához:** az orchestrátor LLM-nek **megadjuk a karakterkeretet slotonként** (pl. "headline ≤ 42 karakter"), így eleve illeszkedő copyt ír. A fit-algoritmus csak a biztonsági háló.

---

## 10. Kemény constraintek (a QA-checklist)

Ezeket a determinisztikus checkek + a vision-QA ellenőrzik. Bármelyik bukása = auto-fix vagy regenerálás:

- Egyetlen elem sem lépi át a safe margint.
- Minden szöveg kontrasztja ≥ a küszöb (4. szakasz).
- Nincs nem-szándékos átfedés (determinisztikus bbox-check minden elempáron).
- Logó jelen van, a safe zónán belül, min-méret felett, clear-space tiszteletben.
- Accent-felület ≤ 15%.
- Szöveg nincs szó közepén levágva; ≤ max sorszám.
- Magyar glyphek helyesen renderelnek (nincs .notdef box).
- Full-bleed esetén a nyugodt-zóna check átment, vagy scrim alkalmazva.
- A vászon nem "üres" és nem "túlzsúfolt" (elem-szám és kitöltöttség sávban van).

---

## 11. A generálási pipeline (hogyan használja az AI az egészet)

```
Brief + tartalomtípus + brand kit
        │
        ▼
1. Orchestrátor LLM (Claude Sonnet)
   Output (JSON, NEM koordináta):
   - választott archetípus (A1–A9)
   - slot-copy a karakterkereteken belül
   - kép-direktíva (mód + forrás/prompt)
   - accent-választás
        │
        ▼
2. Determinisztikus layout-engine (kód)
   archetípus + tartalom + brand kit → Polotno JSON
   (MINDEN koordinátát itt számolunk a gridből és a tokenekből)
        │
        ▼
3. Render (self-hosted Polotno)  → PNG
        │
        ▼
4. Determinisztikus checkek
   bbox-overlap, kontraszt, margin, glyph, accent-arány
   ── bukás ──► auto-fix vagy vissza a 2-re
        │
        ▼
5. Vision-QA (vision modell a PNG-n)
   "tiszta? hierarchia világos? márkahű? vizuális törés?"
   pontszám < küszöb ──► regenerálás feedbackkel (max N=2)
        │
        ▼
6. Ha N próbálkozás után is bukik:
   SAFE FALLBACK → A1 (centered statement, solid surface)
   Ez gyakorlatilag nem tud rosszul kinézni.
        │
        ▼
   Kész kreatív
```

**A safe fallback a no-designer megbízhatóság kulcsa:** mindig van egy halál-egyszerű archetípus (A1 solid surface-en), amit akkor használunk, ha minden más megbukik a QA-n. Inkább egy tiszta, egyszerű poszt, mint egy tört.

---

## 12. Konkrét példa — A1 (Centered statement) lebontva

**Zónák (feed, 1080×1350, 64px margin):**
- `logo`: felül középen, y=96, max magasság 80px
- `headline`: vertikálisan központozva a tartalmi területen, x=64, szélesség=952, középre igazítva
- `subhead`: a headline alatt `lg` (40px) gappel
- `cta` (opcionális): alul, y=1350-96-pill_height, accent pill

**Auto-fit:** headline indul `display` (96px), min `headline` (72px), max 3 sor. Subhead `subhead` (48px), max 2 sor.

**Példa resolved Polotno JSON** (duotone surface, brand: sötét háttér #102A2E, accent #00CED1, font "Poppins"):

```json
{
  "width": 1080,
  "height": 1350,
  "fonts": [{ "fontFamily": "Poppins", "url": "https://cdn.thinkai/fonts/Poppins.ttf" }],
  "pages": [
    {
      "id": "p1",
      "background": "#102A2E",
      "children": [
        {
          "type": "image",
          "x": 460, "y": 96, "width": 160, "height": 80,
          "src": "https://cdn.thinkai/brands/kavezo/logo-light.png"
        },
        {
          "type": "text",
          "x": 64, "y": 520, "width": 952,
          "text": "Új tavaszi szezonális kávénk megérkezett",
          "fontFamily": "Poppins", "fontSize": 96, "lineHeight": 1.05,
          "fontWeight": "bold", "align": "center", "fill": "#FFFFFF"
        },
        {
          "type": "text",
          "x": 64, "y": 760, "width": 952,
          "text": "Csak korlátozott ideig, a pultnál",
          "fontFamily": "Poppins", "fontSize": 48, "lineHeight": 1.2,
          "fontWeight": "normal", "align": "center", "fill": "rgba(255,255,255,0.7)"
        },
        {
          "type": "figure",
          "subType": "rect",
          "x": 380, "y": 1130, "width": 320, "height": 88,
          "cornerRadius": 44, "fill": "#00CED1"
        },
        {
          "type": "text",
          "x": 380, "y": 1158, "width": 320,
          "text": "KÓSTOLD MEG",
          "fontFamily": "Poppins", "fontSize": 28, "fontWeight": "bold",
          "align": "center", "fill": "#102A2E"
        }
      ]
    }
  ]
}
```

Figyeld meg: minden koordináta a gridből és a tokenekből jön (64px margin, középre 460=（1080-160)/2 a logónál, accent pill 320px széles középen). Az LLM ebből **semmit** nem számolt — csak a szövegeket és a színszerepeket adta. A geometria a kódé.

---

## 13. Hogyan készül el ez designer nélkül — összefoglalás

A mechanizmus, ami a te constraintedre (nincs designer, nincs freelancer) válaszol:

1. **A 9 archetípus + a tokenek + a szabályok = a "designer", egyszer lefektetve** ebben a dokumentumban. Ezt egy fejlesztő vagy egy AI coding agent implementálja determinisztikus layout-függvényekként. Ez egyszeri munka, nem ismétlődő.
2. **Az AI sosem rajzol szabadon** — archetípust választ és slotokat tölt. A geometriát a kód számolja. Tört kimenet ezért lehetetlen.
3. **A vision-QA + a safe fallback** garantálja, hogy ami élesben kimegy, az mindig tiszta — emberi szem nélkül is.
4. **A duotone kép-default + a kontraszt-enforcement** adja a "designed" érzést automatikusan.

A minőségi mennyezet őszintén: ez "tiszta, konzisztens, professzionális, kicsit sablonos" outputot ad — ami az SMB-célnak pontosan megfelelő, és veri azt, amit az ügyfél magától Canvában összedobna. Nem díjnyertes kampány, de soha nem kontár.

**A 9 archetípus precíz zóna-definícióit** (mind a kilencet, A1-hez hasonló részletességgel, grid-koordinátákkal) érdemes következő lépésként kibontani — abból a fejlesztő egyenként megírja a layout-függvényeket. Szólj, és megcsinálom mind a kilencet.

---

## A dokumentum karbantartása

Élő dokumentum. Új archetípus, új tartalomtípus, vagy módosított token esetén itt frissítjük. A tokenek és a szabályok a generátor-kód forrásai — ha itt változik, a kódban is változnia kell (és fordítva).
