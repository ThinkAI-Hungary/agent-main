# ADR-002: Dinamikus Univerzális Overlay Szabályok (Visibility, Buffer, Scaling, Guard)

**Status:** Decided
**Date:** 2026-07-04
**Category:** Frontend / UI Logic

## Context
A korábbi sablon-alapú generálás során visszatérő hiba volt, hogy a rétegek kitakarták a terméket (pl. a vödröt), vagy olvashatatlanok voltak a háttérrel való azonos színük miatt (pl. fehér felirat fehér körön). A sablonok statikus koordinátái nem tudtak alkalmazkodni a kép valós tartalmához.

## Decision
Bevezettünk egy **Dinamikus Normalizáló Motort** (`layerNormalizer.ts`), amely 4 globális törvényt érvényesít minden generálásnál, felülírva a sablonok alapértelmezett értékeit:

1.  **Visibility (Luminance Inversion)**: A szöveg és panel színe a lokális fényerő alapján dől el.
2.  **Buffer (Subject Awareness)**: Ha a termék középen van, az overlay elemek automatikusan zsugorodnak vagy eltolódnak.
3.  **Scaling (Auto-Fit)**: A betűméret dinamikusan alkalmazkodik a szöveg hosszához és a konténer szélességéhez.
4.  **Integrity (Logo Guard)**: A márka logója védett zónába kerül, és semmi nem takarhatja el.

## Consequences
- **Pozitív**: Drasztikusan csökken a hibás (olvashatatlan) generálások száma. A rendszer "látja" a terméket és vigyáz rá.
- **Negatív**: A `layerNormalizer.ts` komplexitása megnőtt, a determinisztikus sablonok viselkedése nehezebben jósolható meg "ránézésre".

## Kapcsolódó
- [OVERLAY_GUIDE.md](../OVERLAY_GUIDE.md)
- [QuickPostView.tsx](../../components/QuickPostView.tsx)

## Worklog
| Dátum | Worklog | Összefoglaló |
|-------|---------|---------------|
| 2026-07-04 00:54 | [202607040054](../../worklog/202607040054.md) | Dinamikus szabályok implementálása és auditálása. |
