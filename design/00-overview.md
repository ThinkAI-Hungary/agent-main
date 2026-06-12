# eaisybill Design System — Áttekintés

> **Utolsó frissítés:** 2026-06-03  
> **Verzió:** 2.0  
> **Scope:** Platform-szintű design rendszer — minden eaisybill termékre alkalmazandó

---

## Design System Célja

Ez a design rendszer nem egyetlen alkalmazásra, hanem az **eaisybill termékcsaládra** vonatkozik. Minden új szoftver (számlázó, könyvelési modul, HR, stb.) erre a design vonalra épül: azonos szín tokenek, tipográfia, komponensek, animációk.

---

## Tartalomjegyzék — Design Dokumentáció

Ez a `docs/design/` mappa tartalmazza az eaisybill platform **vizuális design rendszerének** dokumentációját:

| # | Dokumentum | Leírás |
|---|------------|--------|
| 00 | [Áttekintés](./00-overview.md) | Ez a fájl — tartalomjegyzék és magasszintű összefoglaló |
| 02 | [Design Tokens & Színrendszer](./02-design-tokens.md) | CSS változók, HSL színpaletta, sötét/világos mód |
| 03 | [Tipográfia & Ikonok](./03-typography-icons.md) | Betűtípusok, méretezés, Lucide ikonok |
| 04 | [Komponens Könyvtár](./04-component-library.md) | shadcn/ui komponensek, egyedi komponensek, variánsok |
| 05 | [Layout & Navigáció](./05-layout-navigation.md) | App shell, sidebar, collapsible nav groups, scoped routing |
| 07 | [Betöltés & Skeleton Patternek](./07-loading-patterns.md) | Loading spinnerek, skeleton-ök, lazy loading |
| 08 | [Interakciók & Animációk](./08-interactions-animations.md) | Hover, transition, page-animate, micro-animációk |
| 09 | [Hibakezelés & Feedback](./09-error-handling-feedback.md) | Error boundary, toast, validation, empty state |
| 10 | [Accessibility & UX Patternek](./10-accessibility-ux.md) | Keyboard nav, focus management, a11y patternek |
| 11 | [Adatmegjelenítés & Táblázatok](./11-data-display-tables.md) | Táblázat stílus, pagination, chart-ok, pénzügyi számok |
| 12 | [Dialógusok & Felugró ablakok](./12-dialogs-modals.md) | Dialog, Sheet, Popover, Drawer patternek |

### Átkerült a `docs/architecture/` mappába

Az alábbi dokumentumok architekturális tartalmúak, ezért átkerültek:

| Eredeti | Új hely | Leírás |
|---------|---------|--------|
| ~~01-tech-stack~~ | [frontend-tech-stack.md](../architecture/frontend-tech-stack.md) | Tech stack, build, provider hierarchy |
| ~~06-state-management~~ | [frontend-state-management.md](../architecture/frontend-state-management.md) | React Context, React Query, Realtime |
| ~~13-auth-onboarding~~ | [frontend-auth-onboarding.md](../architecture/frontend-auth-onboarding.md) | Auth flow, session, onboarding wizard |
| ~~14-performance~~ | [frontend-performance.md](../architecture/frontend-performance.md) | Code splitting, prefetch, memoizáció |

---

## Az Alkalmazás Dióhéjban

Az **eaisybill** egy modern, teljes körű pénzügyi menedzsment SaaS platform magyar nyelvű felhasználói felülettel. Fő funkciói:

- 📄 **Számlakezelés** — Bejövő és kimenő számlák AI-alapú feldolgozása
- 💰 **Tranzakció párosítás** — Banki tranzakciók és számlák automatikus összekapcsolása
- 📊 **Pénzügyi kimutatások** — Eredménykimutatás, mérleg, főkönyv, ÁFA bevallás
- 👥 **Bérszámfejtés** — Munkaidő nyilvántartás, bér- és járulékkezelés
- 📁 **Projekt tracking** — Bevétel/kiadás projektek mentén
- 🏦 **Házipénztár** — Készpénzes tételek kezelése
- 🏗️ **Tárgyi eszközök (TENY)** — Eszköznyilvántartás és értékcsökkenés

---

## Design Filozófia

### Vizuális Elvek

| Elv | Leírás |
|-----|--------|
| **Linear-inspirált flat design** | Lapos, shadow-mentes stílus. Dark mode-ban 1px inset border-ek, hover shadow globálisan tiltva. |
| **Fintech Teal Branding** | Egységes teal (`#0D9488` light / `#14D4B8` dark) brand szín az egész platformon. |
| **Compact Data Density** | Fix magasságú sorok, `tabular-nums` pénzügyi adatokhoz, kompakt UI sűrűség. |
| **Smooth Micro-animációk** | CSS transition-alapú animációk, `page-animate` fade-in, collapsible nav. |

### Brand Logó

A **eaisybill** logó szöveg-alapú, a következő stílus-struktúrával:

```
e  — font-medium, text-foreground/80
ai — font-bold, text-primary (KIEMELVE)
sy — font-medium, text-foreground/80
bill — font-medium, text-primary
```

Az **"ai"** rész bold + teal színnel van kiemelve, jelezve az AI képességeket. A **"bill"** rész szintén teal, de normál vastagságú.

| Kontextus | Font méret | Collapsed |
|-----------|-----------|-----------|
| Auth oldal | `text-4xl` | — |
| Sidebar (expanded) | `text-2xl` | `eai` (text-2xl) |
| Print fejlécek | `text-5xl` | — |

### Tipográfiai Hangsúlyozás

| Használat | Tailwind class | KERÜLENDŐ |
|-----------|---------------|-----------|
| UI címek | `font-semibold` | `font-bold` (túl erős) |
| Pénzügyi értékek | `text-emerald-700 dark:text-emerald-400` | `font-bold` |
| Muted szövegek | `font-medium` | — |

---

## Multi-Product Design System

### Alkalmazási Terület

Ez a design system **nem eaisybill-specifikus**. Minden jövőbeli termék ugyanezeket a tokeneket használja:

- **Szín paletta** → `02-design-tokens.md`
- **Tipográfia** → `03-typography-icons.md`  
- **Komponensek** → `04-component-library.md`
- **Animációk** → `08-interactions-animations.md`

### Konvenciók Új Termékekhez

1. **Szín tokenek** — Használd a CSS custom property-ket, NE hardcoded értékeket
2. **Font** — Montserrat minden eaisybill termékben
3. **Ikonok** — Lucide React, egységes `h-4 w-4` méretezés
4. **Dark mode** — Kötelező, `darkMode: ["class"]` TailwindCSS config
5. **Magyar UI** — Alapértelmezett nyelv, teljes lokalizáció
