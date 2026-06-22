# Layout Archetípusok — Precíz Zóna-Definíciók

A `design-system-rails.md` folytatása. Itt mind a kilenc archetípus implementálható részletességgel szerepel: zónák grid-koordinátákkal, slot-szabályok, kép-mód, logó- és accent-elhelyezés. Ebből a fejlesztő (vagy AI coding agent) egyenként megírja a determinisztikus `(tartalom, brand_kit) → Polotno JSON` layout-függvényeket.

---

## Közös konvenciók (érvényes minden archetípusra)

- **Vászon (feed):** 1080 × 1350. **Margin:** 64px. **Tartalmi box:** x 64→1016 (w=952), y 64→1286 (h=1222). Középvonal x=540.
- **Image bleed szabály:** a **képek a vászon széléig érhetnek** (ignorálják a margint). A **szöveg, logó, CTA, badge mindig a margón belül** marad.
- **Vertikális blokk-elrendezés:** ha egy zónában több szöveg-elem van, a layout-engine kiszámolja a blokk teljes magasságát (elemek + köztük lévő gap tokenek), és a zónán belül a megadott horgony szerint pozícionál (`top` / `center` / `bottom`).
- **Slot-jelölés:** `[K]` = kötelező, `[O]` = opcionális. Ha egy `[O]` slot üres, a blokk újraközépez/újraoszt.
- **Színszerepek** (`surface`, `ink`, `ink-muted`, `accent`) és **type tokenek** (`display`…`micro`) a rails-doksiból.
- **Story-variáns (A9):** bármelyik feed-archetípus átképezhető 1080×1920-ra; a szabályokat a 9. blokk írja le.

---

## A1 — Centered statement

**Cél:** idézet, bejelentés, köszöntő. **Kép-mód:** `solid` / `duotone`. **Törhetetlen, ez a safe fallback.**

| Zóna | Slot | Koordináta / szabály |
|---|---|---|
| Logó | `logo` [K] | felül középen, y=96, max magasság 80px, x=középre (w/2) |
| Fő blokk | `headline` [K] | x=64, w=952, **center** align, `display`→`headline`, max 3 sor |
| | `subhead` [O] | a headline alatt `lg` (40px) gap, `subhead`, max 2 sor, `ink-muted` |
| CTA | `cta` [O] | accent pill, alul horgonyozva y=1286−88=1198, középen, w≈320, h=88 |

**Vertikális logika:** a `headline`+`subhead` blokk a logó alja (≈176) és a CTA teteje (≈1198, vagy 1286 ha nincs CTA) közötti sávban **center** horgonnyal. Példa resolved JSON: lásd `design-system-rails.md` 12. szakasz.

---

## A2 — Hero image + bottom band

**Cél:** új termék/menüpont, promó, "hét étele". **Kép-mód:** `full-bleed` (felső) + solid sáv (alsó).

| Zóna | Slot | Koordináta / szabály |
|---|---|---|
| Kép | `image` [K] | x=0, y=0, w=1080, h=810 (felső 60%, bleeding) |
| Logó | `logo` [O] | a kép bal felső sarkában, x=64, y=64, max h=64; szükség esetén kis scrim-chip alatta a kontrasztért |
| Sáv | — | solid, `surface` (vagy `accent`, ha visszafogottan), y=810→1350, h=540 |
| | `headline` [K] | x=64, y=810+64=874, w=952, **left**, `headline`, max 2 sor, `ink` a sávon |
| | `subhead`/`price` [O] | a headline alatt `md` (24px) gap, `subhead`, max 1 sor |
| CTA | `cta` [O] | accent pill, jobbra igazítva a margón belül: jobb él x=1016, y=1286−88=1198, h=88 |

**Példa resolved JSON** (brand: surface sáv #102A2E, accent #00CED1, "Poppins"):

```json
{
  "width": 1080, "height": 1350,
  "pages": [{
    "id": "p1", "background": "#FFFFFF",
    "children": [
      { "type": "image", "x": 0, "y": 0, "width": 1080, "height": 810,
        "src": "https://cdn.thinkai/brands/kavezo/hero.jpg" },
      { "type": "figure", "subType": "rect", "x": 0, "y": 810, "width": 1080, "height": 540, "fill": "#102A2E" },
      { "type": "image", "x": 64, "y": 64, "width": 128, "height": 64,
        "src": "https://cdn.thinkai/brands/kavezo/logo-light.png" },
      { "type": "text", "x": 64, "y": 874, "width": 952,
        "text": "Szezonális tavaszi kávé", "fontFamily": "Poppins",
        "fontSize": 72, "lineHeight": 1.1, "fontWeight": "bold", "align": "left", "fill": "#FFFFFF" },
      { "type": "text", "x": 64, "y": 1010, "width": 600,
        "text": "Most a pultnál, korlátozott ideig", "fontFamily": "Poppins",
        "fontSize": 48, "lineHeight": 1.2, "fontWeight": "normal", "align": "left", "fill": "rgba(255,255,255,0.7)" },
      { "type": "figure", "subType": "rect", "x": 696, "y": 1198, "width": 320, "height": 88,
        "cornerRadius": 44, "fill": "#00CED1" },
      { "type": "text", "x": 696, "y": 1226, "width": 320, "text": "KÓSTOLD MEG",
        "fontFamily": "Poppins", "fontSize": 28, "fontWeight": "bold", "align": "center", "fill": "#102A2E" }
    ]
  }]
}
```

---

## A3 — Split

**Cél:** termékjellemző, before/after egy képen. **Kép-mód:** `framed`.

| Zóna | Slot | Koordináta / szabály |
|---|---|---|
| Kép | `image` [K] | x=0, y=0, w=1080, h=675 (felső 50%, bleeding) |
| | `image_b` [O] | **before/after**: két kép egymás mellett a felső zónában, egyenként w=540 (x=0 és x=540), opcionális "ELŐTTE"/"UTÁNA" caption-chip |
| Szöveg | solid | `surface`, y=675→1350 |
| | `headline` [K] | x=64, y=675+64=739, w=952, **left**, `headline`, max 2 sor |
| | `body` [O] | a headline alatt `md` gap, `body`, max 4 sor, `ink-muted` |
| Accent | — | rövid accent rule (4px vonal, w=120) a headline fölött, vagy CTA pill alul |
| Logó | `logo` [O] | a szöveg-zóna alján, x=64, y=1286−48, max h=48 |

---

## A4 — Full-bleed overlay

**Cél:** szezonális, lifestyle, esemény, behind the scenes. **Kép-mód:** `full-bleed` + scrim.

| Zóna | Slot | Koordináta / szabály |
|---|---|---|
| Kép | `image` [K] | x=0, y=0, w=1080, h=1350 (teljes, bleeding) |
| Scrim | — | gradient overlay a szöveg-zóna alá, surface színből, **számolt opacitás** a kontraszt-küszöbig (alapból alsó harmad) |
| Logó | `logo` [O] | bal felül, x=64, y=64, max h=64, scrim-chipen |
| Fő blokk | `headline` [K] | **alulról horgonyozva**, x=64, w=952, **left**, `headline`, max 3 sor; a blokk alja a CTA fölött `lg` gappel |
| | `subhead` [O] | a headline fölött `sm` gap, `subhead`, max 1 sor |
| CTA | `cta` [O] | accent pill, **balra**, x=64, y=1286−88=1198, h=88, w≈300 |

**Nyugodt-zóna kapcsoló:** ha a calm-zone detektálás a felső vagy középső zónát találja nyugodtabbnak, a fő blokk + CTA oda kerül (fentről vagy középről horgonyozva), a scrim is oda igazodik.

---

## A5 — Top / footer bar

**Cél:** nyitvatartás, info, "megújultunk", időpont-emlékeztető. **Kép-mód:** `framed`.

| Zóna | Slot | Koordináta / szabály |
|---|---|---|
| Felső sáv | — | `surface` vagy `accent`, x=0, y=0, w=1080, h=180 |
| | `logo` [K] | a felső sávban, középen vagy balra (x=64), vertikálisan központozva (y=90 közép), max h=88 |
| Kép | `image` [O] | x=0, y=180, w=1080, h=990 (bleeding); ha nincs kép → solid `surface` |
| Alsó sáv | — | `surface` vagy `accent` (a felsővel egyezően), y=1170, h=180 |
| | `footer_text` [K] | az alsó sávban, x=64, w=952, vertikálisan központozva (y=1260 közép), `subhead`, max 2 sor, `ink` a sávon — pl. nyitvatartás, cím, CTA |

**Megjegyzés:** ha mindkét sáv `accent`, az accent-arány meghaladhatja a 15%-ot — ilyenkor a sávok `surface` színűek, és az accent csak a `footer_text` kiemelésében jelenik meg.

---

## A6 — Big number / badge

**Cél:** akció, kedvezmény. A **szám a hős**. **Kép-mód:** `solid` / `duotone`.

| Zóna | Slot | Koordináta / szabály |
|---|---|---|
| Badge | — | accent kör, középpont (540, 500), r=300 (átfog x 240→840, y 200→800) |
| | `number` [K] | a körben középen, `display`+ (akár 160px), `fontWeight` bold, **kontraszt-ellenőrzött ink** az accent ellen — pl. "−30%", "ÚJ!" |
| Fő blokk | `headline` [K] | a badge alatt, x=64, y=880, w=952, **center**, `headline`, max 2 sor, `ink` |
| | `terms` [O] | a headline alatt `sm` gap, `caption`, max 2 sor, `ink-muted` — pl. "csak márciusban, a készlet erejéig" |
| Logó | `logo` [O] | alul középen, y=1286−56, max h=56 |

**Példa resolved JSON** (accent badge #FF5A5F, surface #FFFFFF, ink a badge-en #FFFFFF):

```json
{
  "width": 1080, "height": 1350,
  "pages": [{
    "id": "p1", "background": "#FFFFFF",
    "children": [
      { "type": "figure", "subType": "circle", "x": 240, "y": 200, "width": 600, "height": 600, "fill": "#FF5A5F" },
      { "type": "text", "x": 240, "y": 430, "width": 600, "text": "−30%",
        "fontFamily": "Poppins", "fontSize": 160, "fontWeight": "bold", "align": "center", "fill": "#FFFFFF" },
      { "type": "text", "x": 64, "y": 880, "width": 952, "text": "Tavaszi nagytakarítás akció",
        "fontFamily": "Poppins", "fontSize": 72, "lineHeight": 1.1, "fontWeight": "bold", "align": "center", "fill": "#1A1A1A" },
      { "type": "text", "x": 64, "y": 1010, "width": 952, "text": "Minden szolgáltatásra, csak márciusban",
        "fontFamily": "Poppins", "fontSize": 28, "lineHeight": 1.3, "align": "center", "fill": "rgba(26,26,26,0.7)" },
      { "type": "image", "x": 476, "y": 1190, "width": 128, "height": 56,
        "src": "https://cdn.thinkai/brands/x/logo-dark.png" }
    ]
  }]
}
```

---

## A7 — Quote card

**Cél:** ügyfélvélemény, idézet. **Kép-mód:** `solid` / `framed`.

| Zóna | Slot | Koordináta / szabály |
|---|---|---|
| Idézőjel | — | nagy `"` glyph accent színben, bal felül a quote-zónában, x=64, y=180, méret ≈220px |
| Idézet | `quote` [K] | x=64, y=420, w=952, **left**, méret a hossz szerint (`headline` ha rövid, `subhead` ha hosszabb), max 5 sor, `ink` |
| Attribúció | `author` [K] | az idézet alatt `lg` gap, `caption`, `ink-muted` — "— Név, szerep" |
| Avatar | `avatar` [O] | kis kör-kép vagy brand-logó az attribúció mellett, x=64, ø=88, a szöveg balra tőle eltolva |
| Logó | `logo` [O] | jobb felső vagy alsó sarok, max h=48 |

**Megjegyzés:** ha van `avatar`, az `author` szöveg x=64+88+md=176-tól indul, és vertikálisan az avatarhoz igazodik.

---

## A8 — List / grid

**Cél:** tipp, "3 ok amiért", hét X-e listaként. **Kép-mód:** `solid`.

| Zóna | Slot | Koordináta / szabály |
|---|---|---|
| Cím | `title` [K] | x=64, y=128, w=952, **left**, `headline`, max 2 sor |
| Lista | `items[]` [K] | 2–4 elem; a cím alja és a logó teteje közötti sáv **egyenlően elosztva** N sorra |
| — sor | `number/icon` | accent kör-chip, x=64, ø=64, benne sorszám vagy ikon, kontraszt-ellenőrzött ink |
| — sor | `item_text` | x=64+64+md=152-től, w=952−152=864, `body`, max 2 sor, `ink`, vertikálisan a chiphez igazítva |
| Logó | `logo` [O] | alul, x=64, y=1286−48, max h=48 |

**Sor-magasság:** `(zóna_magasság − (N−1)×gap) / N`, gap = `lg` (40px). Minden sor a saját boxában `center`-elve.

---

## A9 — Story CTA (9:16)

**Cél:** bármely tartalom story-formátumban. **Vászon:** 1080 × 1920. **Kép-mód:** `full-bleed` / `solid`.

**Safe zone:** felül 220px és alul 250px **kerülendő** (profilkép, UI, swipe). Fő tartalmi sáv: y 220→1670.

| Zóna | Slot | Koordináta / szabály |
|---|---|---|
| Logó | `logo` [O] | a felső kerülendő sáv **alatt**, x=64, y=260, max h=64 |
| Kép | `image` [O] | full-bleed x=0,y=0,w=1080,h=1920 (+ scrim), vagy framed középső zóna |
| Hook | `headline` [K] | felső tartalmi sávban, x=64, y≈360, w=952, **left/center**, `headline`, max 3 sor |
| | `subhead` [O] | a hook alatt `md` gap, `subhead`, max 2 sor |
| CTA | `cta` [K] | az **alsó** safe sáv felett, accent pill, x=középre, y≈1560, h=96 — "Csúsztass fel" / CTA |

**Származtatás feed-ből:** az orchestrátor a feed-tartalmat (archetípus + slotok) átképzi a vertikális safe sávra: a `headline` a hook-zónába, a kép full-bleed-re vagy a középső framed zónába, a `cta` az alsó safe sáv fölé. Nem új tartalom — újra-horgonyzás.

---

## Implementációs jegyzetek a fejlesztőnek

1. **Egy layout-függvény archetípusonként.** Signature: `renderA2(content, brandKit, format) → PolotnoJSON`. Belül minden koordináta a fenti táblákból és a tokenekből számol — soha nincs hardcode-olt "varázs-szám" a gridből és tokenekből levezethetőkön kívül.
2. **Közös helper-réteg:** `resolveColorRoles(brandKit)`, `pickInkFor(bg)` (kontraszt), `autoFit(text, box, startToken, minToken, maxLines)`, `applyScrim(image, textZone)`, `duotone(image, c1, c2)`, `placeLogo(zone, variant)`. Ezeket egyszer írod meg, mind a kilenc függvény használja.
3. **A format-paraméter** (`feed` / `story`) ugyanazt az archetípust két vászonra oldja fel; a story a 9. blokk safe-zónáit alkalmazza.
4. **Minden függvény kimenete átmegy a 10. szakasz (rails-doksi) determinisztikus check-jein**, mielőtt renderelne — ez fogja el a maradék edge-eseteket.

---

## Mi maradt hátra

Ezzel a generátor **renderelni tud** — megvan mind a kilenc archetípus és a story-származtatás. A maradék finomítás, prioritás szerint:

1. **Helper-réteg pszeudokód** (`autoFit`, `pickInk`, `duotone`, `applyScrim`) — hogy a kilenc függvény konzisztensen hívja őket.
2. **Bővített font-pairing tábla + magyar-lefedettségű fallback fontok** vetted listája.
3. **Orchestrátor prompt-struktúra** — pontosan milyen JSON-t adjon az LLM (archetípus + slotok + karakterkeretek + kép-direktíva), few-shot példákkal.

A 3-as (orchestrátor prompt) a következő logikus darab, mert az köti össze az AI-réteget ezzel a determinisztikus rendszerrel. Szólj, és megírom.
