# Orchestrátor — Prompt-Struktúra és Integrációs Kontraktus

A `design-system-rails.md` és `design-system-archetypes.md` folytatása és lezárása. Ez a darab köti össze az **AI-réteget** (Claude Sonnet) a **determinisztikus layout-engine-nel**. Definiálja pontosan, mit kap az orchestrátor, milyen JSON-t **kell** visszaadnia, magát a system promptot, a karakterkereteket, a validációt és a vision-QA visszacsatolási hurkot.

---

## 0. Hol ül ez a rendszerben

```
brand kit + brief
      │
      ▼
[ORCHESTRÁTOR]  ← ez a dokumentum
Claude Sonnet → JSON (archetípus + slot-copy + kép-direktíva + accent)
      │
      ▼
[LAYOUT-ENGINE]  ← design-system-archetypes.md
JSON + brand kit → Polotno JSON (koordinátákkal)
      │
      ▼
[RENDER] → [QA] → kész / retry
```

**Az orchestrátor egyetlen felelőssége:** szemantikai döntéseket hozni (mit, milyen hangnemben, milyen elrendezés-típusban, milyen képpel). **Koordinátát soha nem ad.** A kimenete egy szűk, validálható JSON, amit a layout-engine közvetlenül fogyaszt.

---

## 1. Input kontraktus (amit a backend átad)

Az orchestrátor-hívás bemenete egy struktúra:

```ts
type OrchestratorInput = {
  brief: {
    contentType: ContentType;     // pl. "uj_termek", "akcio", "ugyfelvelemeny"
    goal: string;                 // "új tavaszi kávé bevezetése"
    message?: string;             // a user szabad szövege, ha van
    audience?: string;            // "törzsvendégek, 25-45"
    format: "feed" | "story";
    variantCount: number;         // pl. 4
  };
  brandKit: {
    voiceDescriptors: string[];   // ["közvetlen", "meleg", "játékos"]
    voiceExamples: { good: string[]; bad: string[] };
    colorRoles: {                 // MÁR szerepekre képezve (rails 4. szakasz)
      surface: string; ink: string; inkMuted: string; accent: string;
    };
    fonts: { heading: string; body: string };
    imageryRules: { style: string; avoid: string[] };
    hasHungarianGlyphs: boolean;  // a font cmap-ellenőrzés eredménye
  };
  examples: ApprovedCreative[];   // 5-10 korábbi jóváhagyott kreatív (few-shot)
  retryFeedback?: string;         // csak retry esetén (lásd 8. szakasz)
};
```

**Fontos:** a `colorRoles` **már fel van oldva** (rails 4. szakasz) — az orchestrátor sosem találgat hexa kódot, csak szerepekre hivatkozik (`accent`, `surface`, stb.).

---

## 2. Output kontraktus (a kötelező JSON séma)

Az orchestrátor egy variáns-tömböt ad vissza. Minden variáns:

```ts
type OrchestratorOutput = {
  variants: Variant[];
};

type Variant = {
  archetype: "A1"|"A2"|"A3"|"A4"|"A5"|"A6"|"A7"|"A8"|"A9";
  rationale: string;             // rövid indoklás (debug/QA, nem renderelődik)
  slots: Record<string, string>; // az archetípus slot-jai (lásd karakterkeret-tábla)
  image: {
    mode: "solid" | "duotone" | "framed" | "full-bleed";
    source: "none" | "stock" | "generated" | "brand_asset";
    queryOrPrompt?: string;      // stock keresőkifejezés VAGY generálási prompt
    negativePrompt?: string;     // generált képnél kötelező
  };
  accentEmphasis: "low" | "medium" | "high";  // mennyire domináljon az accent
};
```

**Zod séma a backend-validációhoz:**

```ts
const Variant = z.object({
  archetype: z.enum(["A1","A2","A3","A4","A5","A6","A7","A8","A9"]),
  rationale: z.string().max(300),
  slots: z.record(z.string()),
  image: z.object({
    mode: z.enum(["solid","duotone","framed","full-bleed"]),
    source: z.enum(["none","stock","generated","brand_asset"]),
    queryOrPrompt: z.string().optional(),
    negativePrompt: z.string().optional(),
  }),
  accentEmphasis: z.enum(["low","medium","high"]),
});
const OrchestratorOutput = z.object({ variants: z.array(Variant).min(1) });
```

---

## 3. A system prompt

Az instrukciók angolul (prompt-megbízhatóság), de a **generált copy mindig magyar**. A `{{...}}` helyőrzőket a backend tölti.

```
You are an art director for Hungarian small-business social media content.
You do NOT design layouts or output coordinates. You make semantic choices that
a deterministic layout engine will render. Your job: choose a layout archetype,
write the copy, and specify imagery — all on-brand.

# HARD RULES
- Output ONLY valid JSON matching the schema. No prose, no markdown, no backticks.
- All copy MUST be in Hungarian, with correct spelling including ő and ű.
- Choose archetype ONLY from A1–A9 (catalog below).
- NEVER output colors or coordinates. Refer to accent emphasis only.
- Respect the per-slot character budgets exactly. Shorter is better than truncated.
- Match the brand voice (descriptors + examples below). Avoid the "bad" examples.
- Imagery default: source "stock" + mode "duotone". Use "generated" ONLY when stock
  cannot deliver the concept. For generated, negativePrompt MUST include "text, words,
  letters, watermark" and respect the brand's avoid-list.
- Never put Hungarian text INTO the image (the layout renders text separately).

# ARCHETYPE CATALOG
A1 Centered statement — quote, announcement, greeting. slots: headline, subhead?, cta?
A2 Hero image + bottom band — product, promo. slots: headline, subhead?, cta?
A3 Split — feature, before/after. slots: headline, body?
A4 Full-bleed overlay — seasonal, lifestyle, event. slots: headline, subhead?, cta?
A5 Top/footer bar — hours, info, reopening. slots: footer_text
A6 Big number/badge — discount, sale. slots: number, headline, terms?
A7 Quote card — testimonial. slots: quote, author
A8 List/grid — tips, "3 reasons". slots: title, items[2..4]
A9 Story CTA (9:16) — any content as story. slots: headline, subhead?, cta

# CHARACTER BUDGETS (per slot, hard max)
{{CHAR_BUDGET_TABLE}}

# CONTENT TYPE → PREFERRED ARCHETYPES
{{CONTENT_TYPE_MAPPING}}

# BRAND VOICE
Descriptors: {{VOICE_DESCRIPTORS}}
Good examples: {{VOICE_GOOD}}
Avoid (bad): {{VOICE_BAD}}
Imagery style: {{IMAGERY_STYLE}}; avoid: {{IMAGERY_AVOID}}

# BRIEF AND CONTEXT
Content type: {{CONTENT_TYPE}}
Goal: {{GOAL}}   Message: {{MESSAGE}}   Audience: {{AUDIENCE}}
Format: {{FORMAT}}

# PAST APPROVED CREATIVES (for voice + what works)
{{EXAMPLES}}

# TASK
Produce {{VARIANT_COUNT}} variants. They MUST differ meaningfully — vary the
archetype AND the angle, not just reworded copy. At least one variant must be a
"safe clean" option (A1 or A8). Return the JSON object now.
```

The task block keeps the variant count and the diversity requirement explicit so the model never collapses into four reworded versions of the same idea.

---

## 4. Karakterkeret-tábla (`CHAR_BUDGET_TABLE`)

A zóna-szélességekből, font-méretekből és max sorszámokból levezetve (archetypes-doksi). Ezek a **felső határok**; az autofit a biztonsági háló.

| Archetípus | Slot | Max karakter |
|---|---|---|
| A1 | headline | 50 |
| A1 | subhead | 60 |
| A1 | cta | 18 |
| A2 | headline | 32 |
| A2 | subhead | 40 |
| A2 | cta | 18 |
| A3 | headline | 32 |
| A3 | body | 160 |
| A4 | headline | 48 |
| A4 | subhead | 32 |
| A4 | cta | 16 |
| A5 | footer_text | 80 |
| A6 | number | 6 |
| A6 | headline | 36 |
| A6 | terms | 80 |
| A7 | quote | 180 |
| A7 | author | 40 |
| A8 | title | 40 |
| A8 | item_text (egyenként) | 60 |
| A9 | headline | 48 |
| A9 | subhead | 60 |
| A9 | cta | 18 |

---

## 5. Few-shot példák

**Példa A — kávézó, új termék, feed, 2 variáns (rövidített):**

Input: contentType="uj_termek", goal="új tavaszi szezonális kávé", voice=["közvetlen","meleg"], format="feed".

Output:
```json
{
  "variants": [
    {
      "archetype": "A2",
      "rationale": "Termék-bevezetés, a kép a hős, alul a hívás.",
      "slots": {
        "headline": "Megérkezett a tavaszi kávénk",
        "subhead": "Most a pultnál, korlátozott ideig",
        "cta": "Kóstold meg"
      },
      "image": { "mode": "duotone", "source": "stock",
        "queryOrPrompt": "spring latte art coffee cup overhead warm" },
      "accentEmphasis": "medium"
    },
    {
      "archetype": "A1",
      "rationale": "Tiszta, biztonságos variáns kép nélkül.",
      "slots": {
        "headline": "Új ízek tavaszra",
        "subhead": "Fedezd fel szezonális kávénkat a héten",
        "cta": "Gyere be"
      },
      "image": { "mode": "solid", "source": "none" },
      "accentEmphasis": "high"
    }
  ]
}
```

**Példa B — fogászat, akció, feed, 1 variáns:**

```json
{
  "variants": [
    {
      "archetype": "A6",
      "rationale": "Kedvezmény, a szám a fókusz.",
      "slots": {
        "number": "−20%",
        "headline": "Tavaszi szájhigiénés akció",
        "terms": "Új pácienseknek, márciusban, előzetes időpontfoglalással"
      },
      "image": { "mode": "solid", "source": "none" },
      "accentEmphasis": "high"
    }
  ]
}
```

---

## 6. Output-validáció (a layout-engine ELŐTT)

A backend minden orchestrátor-kimenetet átfuttat ezeken, mielőtt renderelne:

1. **Zod séma** (2. szakasz) — különben azonnali re-ask.
2. **Archetípus ∈ A1–A9** és a slotok **egyeznek az archetípus sémájával** (nincs hiányzó `[K]` slot, nincs ismeretlen slot).
3. **Karakterkeret** — minden slot ≤ a 4. szakasz maxja. Túllépés → vagy automatikus rövidítés-kérés (egy gyors LLM-hívás "írd rövidebbre, max N karakter"), vagy az autofit kezeli (de a flag rögzítődik).
4. **Kép-direktíva konzisztencia** — ha `source: "generated"`, akkor `queryOrPrompt` és `negativePrompt` kötelező, és a negatív tartalmazza a "text, words, letters"-t.
5. **Magyar glyph elő-ellenőrzés** — ha `brandKit.hasHungarianGlyphs === false` ÉS a copy tartalmaz `ő`/`ű`-t → a layout-engine fallback fontra vált (rails 5. szakasz), flag rögzül.
6. **Tiltott tartalom** — alap moderációs szűrő a generált copyn.

Bukás esetén: kis hibánál auto-javítás, nagy hibánál a variáns újragenerálása (max 2, lásd lent).

---

## 7. Variáns-diverzitás

A `variantCount` (pl. 4) variánsnak **érdemben különböznie kell** — nem ugyanaz a szöveg átfogalmazva. A prompt ezt kéri, de a backend is ellenőrzi:

- Legalább **2 különböző archetípus** a szetten belül.
- Legalább **1 "safe clean"** variáns (A1 vagy A8) — ez mindig megbízható, ha a többi a QA-n elhasal.
- Ha a diverzitás-check bukik (pl. mind A2) → egyetlen újra-kérés "make them more different" instrukcióval.

---

## 8. Vision-QA visszacsatolási hurok

Amikor egy renderelt variáns elhasal a vision-QA-n (rails 11. szakasz), a QA **strukturált feedbacket** ad, amit visszacsatolunk az orchestrátornak **csak arra a variánsra**:

```ts
retryFeedback = "A headline túl hosszú volt és átfedte a logót. " +
  "Adj rövidebb headline-t (max 28 karakter), vagy válts A1-re.";
```

Az orchestrátor a `retryFeedback`-kel a kontextusban újragenerálja a variánst. Szabályok:

- **Max 2 retry** variánsonként.
- Minden retry **konzervatívabb**: rövidebb copy, egyszerűbb archetípus, kevesebb accent.
- 2 sikertelen retry után → **safe fallback A1, solid surface** (rails 11. szakasz). Inkább tiszta-egyszerű, mint tört.

A feedback tipikus formái: "túl hosszú szöveg", "túl zsúfolt", "gyenge kontraszt → válts solid/duotone-ra", "a kép túl zajos a szöveg alatt → mode framed".

---

## 9. Feed → story származtatás

Ha a `format` mindkettőt kéri (feed + story), az orchestrátor **nem ír kétszer tartalmat**. A kiválasztott feed-variánst a backend átadja a layout-engine A9-derivációjának (archetypes-doksi 9. blokk), ami a meglévő slotokat a vertikális safe-sávra horgonyozza. Ha a story-hook rövidebb copyt igényel (a `headline` túllép az A9 keretén), egyetlen gyors LLM-hívás rövidíti — nem teljes újragenerálás.

---

## 10. Implementációs jegyzetek

1. **Structured output** — használd a Claude API JSON-mode-ját / tool-use-t, hogy a kimenet garantáltan parse-olható legyen; a Zod-validáció a második védvonal.
2. **Few-shot a brand példáiból** — a `{{EXAMPLES}}` a brand utolsó 5-10 jóváhagyott kreatívjának slot-tartalma (nem a kész kép). Ez tanítja a hangnemet és azt, ami az adott brandnél működik.
3. **Költség** — Sonnet az orchestrátor (minőség), de a "rövidítsd le" mikro-hívások mehetnek Haiku-n.
4. **Determinizmus** — a `temperature`-t tartsd alacsonyan (0.4-0.6); elég variációt a több-variáns kérés ad, nem a magas hőmérséklet.
5. **Naplózás** — minden orchestrátor-kimenet + a hozzá tartozó QA-eredmény logolódik; ez a tréning-adat a prompt finomításához és (később) a fine-tuninghoz.

---

## A teljes lánc — most már összeáll

A négy dokumentum együtt egy működő, designer nélküli generátort ír le:

1. **`design-system-rails.md`** — a szabályrendszer (grid, tokenek, színek, fontok, kép-kezelés, QA, pipeline).
2. **`design-system-archetypes.md`** — a 9 layout-blueprint precíz zónákkal.
3. **Ez a doksi** — az orchestrátor, ami az AI-réteget a determinisztikus engine-hez köti.

A maradék, ami már "rendes fejlesztés", nem koncepció:

- A **helper-réteg** megírása (`autoFit`, `pickInk`, `duotone`, `applyScrim`, `placeLogo`).
- A **9 layout-függvény** implementálása az archetypes-doksiból.
- Az **orchestrátor bedrótozása** a Claude API-ba a fenti prompttal.
- A **vision-QA** összekötése (render → vision modell → feedback → retry).

Ha szeretnéd, a `CLAUDE.md` projekt-szabálykönyvbe (projekt-biblia 3. szakasz) beleírom ennek a generátor-modulnak a konvencióit, hogy a vibe-coding alatt a csapat konzisztensen építse — vagy összerakok egy rövid implementációs sorrendet (milyen sorrendben írják meg a helper-réteget, a layout-függvényeket és az orchestrátort), hogy minden lépésnél legyen valami, ami már renderel.
