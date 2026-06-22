# CLAUDE.md — Generátor modul

Ez a blokk a kreatív-generátor modul szabályait rögzíti a vibe-codinghoz. Illeszd a repo gyökerében lévő `CLAUDE.md`-hez, **vagy** tedd `lib/generator/CLAUDE.md`-ként a modul mellé (a Cursor és a Claude Code beolvassa a modul-szintű szabályfájlokat). A fő `CLAUDE.md` minden szabálya itt is érvényes; ez azt egészíti ki a generátorra specifikus invariánsokkal.

Háttér: a generátor négy dokumentumra épül — `design-system-rails.md` (szabályrendszer), `design-system-archetypes.md` (9 blueprint), `orchestrator-prompt.md` (AI-réteg), és ez. Az egész rendszer integritása néhány invariánson áll, amiket egy AI coding assistant könnyen megsért, ha nem tiltjuk explicit módon.

---

## Module structure

```
lib/generator/
  tokens.ts            # grid, spacing, type scale, szín-szerep feloldás — EGY forrás
  types.ts             # közös típusok (BrandKit, Content, Variant, PolotnoJSON)
  helpers/
    color.ts           # resolveColorRoles, pickInkFor (kontraszt), contrast()
    autofit.ts         # autoFit(text, box, startToken, minToken, maxLines)
    image.ts           # duotone, applyScrim, detectCalmZone
    logo.ts            # placeLogo(zone, variant)
    builder.ts         # tipizált Polotno-elem builder (nem nyers object literal)
  archetypes/
    a1.ts … a9.ts      # mind: (content, brandKit, format) => PolotnoJSON
    zones.ts           # archetípusonkénti zóna-konstansok (gridből/tokenből)
    index.ts           # registry: "A1" => fn
  orchestrator/
    prompt.ts          # system prompt template + interpoláció
    schema.ts          # Zod sémák (input + output)
    budgets.ts         # karakterkeret-tábla — a zones.ts-ből származtatva
    run.ts             # Claude-hívás, Zod-validáció, diverzitás-check
  qa/
    checks.ts          # determinisztikus: bbox-overlap, kontraszt, margin, glyph, accent-arány
    vision.ts          # vision-QA hívás + feedback formálás
  pipeline.ts          # brief → variánsok → render → QA → retry/fallback
```

---

## Core invariants (SOHA ne sértsd meg)

- **Az orchestrátor (LLM) SOHA nem ad koordinátát, hexa színt vagy méretet.** Kizárólag: archetípus + slot-szövegek + kép-direktíva + `accentEmphasis`. Ha az LLM-output bármi geometriát tartalmaz, az bug.
- **Minden geometria a layout-függvényeké.** Ezek **pure**, **determinisztikus** függvények: nincs I/O, nincs `Math.random()`, nincs `Date.now()`, nincs hálózat. Ugyanaz az input → bitre ugyanaz a Polotno JSON.
- **Nincs magic number layout-kódban.** Minden szám a `tokens.ts`-ből vagy a `zones.ts`-ből jön. Nyers `x: 347` tilos.
- **Nincs hardcode-olt hexa szín a generátorban.** A színek a `resolveColorRoles(brandKit)`-ből jönnek, szerepként (`surface`, `ink`, `inkMuted`, `accent`).
- **A helperek egyetlen forrásból.** A kontraszt-, autofit-, duotone-, scrim-, logó-logika **egyszer** létezik a `helpers/`-ben. Archetípus-fájlban újra-implementálni tilos.
- **Polotno JSON-t KIZÁRÓLAG archetípus-függvény állít elő.** Feature-kódban kézzel Polotno JSON-t írni tilos.
- **Minden kreatív átmegy a determinisztikus checkeken ÉS a vision-QA-n**, mielőtt `approved`/`scheduled` állapotba kerülhet. Nincs kivétel (a user explicit felülbírálása logolódik).
- **A safe fallback (A1, solid surface) mindig regisztrált és elérhető.** Soha ne töröld — ez a megbízhatóság végső védvonala.
- **A `hasHungarianGlyphs` flaget tiszteletben kell tartani.** Ha a brand font nem fedi az `ő`/`ű`-t, fallback fontra váltunk. Soha ne feltételezd a lefedettséget.

---

## Layout functions (archetypes/)

- **Egységes signature:** `(content: Content, brandKit: BrandKit, format: "feed"|"story") => PolotnoJSON`. Default export, regisztrálva az `index.ts`-ben.
- A zónákat a `zones.ts` archetípus-konstansaiból olvasd, amik a `tokens.ts` gridjéből és marginjából származnak — ne írj zóna-számot a függvénybe.
- Színhez `pickInkFor()`, szöveg-illesztéshez `autoFit()`, képhez `duotone()`/`applyScrim()`, logóhoz `placeLogo()`. Soha ne duplikáld ezeket.
- Az elemeket a `builder.ts` tipizált buildereivel hozd létre, ne nyers object literállal.
- A `format` paraméter váltja a vásznat és a safe-zónákat; a `"story"` az A9-derivációt használja (archetypes-doksi 9. blokk), a slotokat újra-horgonyozva — nem ír új tartalmat.
- **Image bleed szabály kódban:** kép a vászon széléig (0…1080); szöveg/logó/CTA/badge a 64px marginon belül. Ezt konstansként tartsd, ne ismételd.

---

## Orchestrator (orchestrator/)

- **Structured output:** Claude API JSON-mode / tool-use. `temperature` 0.4–0.6 — a variációt a több-variáns kérés adja, nem a hőmérséklet.
- **Az LLM-kimenet untrusted.** A `run.ts` a layout előtt lefuttatja: Zod-séma → archetípus/slot egyezés → karakterkeret → kép-direktíva konzisztencia → magyar glyph elő-check → moderáció (orchestrator-doksi 6. szakasz).
- **A karakterkeret-tábla (`budgets.ts`) a `zones.ts`-ből származik**, nem kézzel másolt literál. Ha egy zóna szélessége változik, a budget vele változik.
- **A diverzitás-szabályt kód ellenőrzi**, nem csak a prompt: ≥ 2 különböző archetípus és ≥ 1 "safe clean" (A1/A8) variánsonként.
- **Retry:** max 2 variánsonként, mindegyik konzervatívabb (rövidebb copy, egyszerűbb archetípus, kevesebb accent), aztán A1-solid fallback.

---

## Validation & QA (qa/)

- A determinisztikus checkek **pure függvények**, strukturált hibát adnak vissza (nem dobnak, nem logolnak mellékhatásként).
- A vision-QA pontszámot **és** strukturált feedback-stringet ad, amit az orchestrátor `retryFeedback`-jébe vezetünk vissza.
- Egy kreatív **nem** léphet `approved`/`scheduled` állapotba a checkek + vision-QA átmenete (vagy logolt user-felülbírálás) nélkül.

---

## Design tokens (tokens.ts)

- 8px base grid. Minden spacing/type/szín token itt él.
- **Két font-súly** (Regular + Bold). Köztes súly tilos.
- Off-scale érték tilos — ha egy méret nincs a skálán, az hiba, nem kivétel.

---

## Testing

- **Snapshot teszt minden archetípus-függvényre:** fix `brandKit` + `content` fixture → a Polotno JSON snapshot. Ez fogja el a véletlen geometria-driftet.
- **Property tesztek:** random szöveg-hosszakra a determinisztikus checkek a teszt-assertek — margin-safe, nincs overlap, kontraszt átmegy. (A QA-checkek és a tesztek ugyanazok a függvények.)
- **Orchestrátor:** brief-batteryre → Zod-valid + diverzitás tartja magát + karakterkeretek betartva.
- **Golden render szett + vision-QA pontszám** trackelve regresszióra.
- Nem cél a 100% coverage — a cél, hogy a fenti invariánsok automatán védve legyenek.

---

## Versioning the contract

- A `prompt.ts` + `schema.ts` + `budgets.ts` + `zones.ts` **egyetlen verziózott kontraktus.** Egy zóna-szélesség változtatása a budgetet is érinti; egy slot hozzáadása a promptot, a sémát és az archetípust is. Az a PR, ami egyiket módosítja, a többit is érintse — vagy indokolja, miért nem.
- **Render cache-kulcs:** `brandKitVersion + archetype + contentHash`. A determinizmus miatt ugyanaz a kulcs → ugyanaz a kép, nem renderelünk újra.

---

## Session scoping (vibe-coding)

- **Egy szesszió = egy darab:** egy helper, VAGY egy archetípus, VAGY egy check, VAGY egy orchestrátor-rész. Ne a kilenc archetípust egyszerre.
- **Kezdő szesszió:** `tokens.ts` + `color.ts` + `autofit.ts` + A1 + egy hardcode-olt brief → első kép a képernyőn. Onnan bővíts. Mindig legyen valami, ami már renderel.

---

## DON'T (gyors lista)

- Ne adj koordinátát/hexet/méretet az LLM-mel.
- Ne írj magic numbert vagy hardcode hexet layout-kódba.
- Ne implementáld újra a kontraszt/autofit/duotone logikát archetípusonként.
- Ne írj kézzel Polotno JSON-t feature-kódban.
- Ne engedj kreatívot QA nélkül `approved`/`scheduled`-be.
- Ne töröld a safe fallbacket (A1-solid).
- Ne feltételezd, hogy a brand font tudja az `ő`/`ű`-t.
- Ne told fel a `temperature`-t a diverzitásért.
- Ne másold a karakterkeret-táblát kézzel — származtasd a `zones.ts`-ből.
