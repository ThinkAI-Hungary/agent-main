# 03 — Tipográfia & Ikonok

> Betűtípusok, méretezés, font feature-ök, ikonrendszer — az eaisybill platform teljes tipográfiai rendszere.

---

## Betűtípus

### Elsődleges: Montserrat

```css
font-family: 'Montserrat', ui-sans-serif, system-ui, sans-serif;
```

| Tulajdonság | Érték |
|-------------|-------|
| **Forrás** | Google Fonts CDN |
| **Weights** | 300 (light), 400 (normal), 500 (medium), 600 (semibold), 700 (bold) |
| **Betöltés** | Non-render-blocking (`preload` + `media="print"` trick) |
| **Fallback** | `ui-sans-serif`, `system-ui`, `sans-serif` |
| **Scope** | Minden eaisybill termék |

### Monospace (pénzügyi adatok)

```css
font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
```

Használat: `.financial-number` class, táblázat összeg cellák.

---

## Betöltési Stratégia

Az `index.html`-ben a font betöltés a FOUC megelőzéséhez optimalizált:

```html
<!-- Preconnect a DNS lookup felgyorsításához -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<!-- Preload: korán letölti, de nem blokkolja a renderelést -->
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap">

<!-- Media trick: print-ként tölti (nem render-blocking), majd onload-ra all-ra vált -->
<link rel="stylesheet" href="..." media="print" onload="this.media='all'">

<!-- Fallback JS nélküli környezethez -->
<noscript><link rel="stylesheet" href="..."></noscript>
```

---

## Brand Logó Tipográfia

Az **eaisybill** logó szöveg-alapú, segmented tipográfiával:

```tsx
<span className="text-2xl tracking-tight select-none">
  <span className="font-medium text-foreground/80">e</span>
  <span className="font-bold text-primary">ai</span>
  <span className="font-medium text-foreground/80">sy</span>
  <span className="font-medium text-primary">bill</span>
</span>
```

### Logó Méretezés Kontextusonként

| Kontextus | Méret | Collapsed mód |
|-----------|-------|---------------|
| **Sidebar (expanded)** | `text-2xl` | `eai` (text-2xl) |
| **Sidebar (collapsed)** | `text-2xl` | csak `e` + `ai` |
| **Auth oldal** | `text-4xl` | — |
| **Employee Register** | `text-4xl` | — |
| **Reset Password** | `text-4xl` | — |
| **Print fejlécek** | `text-5xl` | egyszerű szöveg |

### Logó Stílus Szegmensek

| Szegmens | Font Weight | Szín | Cél |
|----------|------------|------|-----|
| `e` | `font-medium` | `text-foreground/80` | Halványabb prefix |
| `ai` | **`font-bold`** | **`text-primary`** | AI kiemelés — a legfontosabb vizuális elem |
| `sy` | `font-medium` | `text-foreground/80` | Halványabb közép |
| `bill` | `font-medium` | `text-primary` | Teal, de nem bold |

---

## Tipográfiai Skála

### Heading Stílusok

```css
h1, h2, h3 {
  font-family: Montserrat;
  font-weight: 700;
  letter-spacing: -0.025em;  /* Tight tracking */
  color: hsl(var(--foreground));
}
```

| Elem | Tailwind Class | Méret | Felhasználás |
|------|---------------|-------|-------------|
| Page Title (h1) | `text-3xl font-bold tracking-tight` | ~30px | Oldalcímek |
| Section Title (h2) | `text-xl font-semibold` | ~20px | Szekciócímek |
| Card Title | `text-sm font-medium` | ~14px | Kártya fejlécek |
| Body | (default) | 18px (`1.125rem`) | Alapértelmezett body méret |
| Small Text | `text-sm` | ~14px | Másodlagos szöveg |
| Tiny Text | `text-xs` | ~12px | Label-ek, breadcrumb |
| Micro Text | `text-[10px]` | 10px | Error boundary stack trace |
| Toggle Label | `text-[8px]` | 8px | Toggle belső felirat |

### Font Weight Konvenciók

> **⚠️ FONTOS:** A UI elemekben **NE használj `font-bold`-ot**. Ez túl erős hatást kelt a Linear-inspirált flat design-ban.

| Használat | Ajánlott | Kerülendő |
|-----------|----------|-----------|
| Oldal címek | `font-bold` | ✅ (csak h1) |
| Szekció címek | `font-semibold` | `font-bold` |
| Kártya címek | `font-medium` | `font-bold` |
| Pénzügyi értékek | `font-medium` | `font-bold` |
| Body szöveg | `font-normal` | `font-semibold` |
| Sidebar csoport fejléc | `font-medium uppercase text-xs tracking-wider` | `font-bold` |

### Body Alap Méret

```css
body {
  font-size: 1.125rem;  /* 18px — nagyobb az alapértelmezettnél */
  font-feature-settings: "rlig" 1, "calt" 1;  /* Ligatúrák */
}
```

---

## Font Feature Settings

### Pénzügyi Számok

```css
.financial-number {
  font-family: monospace;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
}
```

| Feature | Leírás |
|---------|--------|
| `tabular-nums` | Fix szélességű számjegyek — számoszlopok tökéletesen illeszkednek |
| `tnum` | Tabular Numbers — OpenType feature |
| `lnum` | Lining Numbers — azonos magasságú számjegyek |

**Tailwind shortcut:**
```tsx
className="font-mono tabular-nums"
```

### Pénzügyi Értékek Színezése

```tsx
// Pozitív összeg (bevétel, pozitív egyenleg)
className="text-emerald-700 dark:text-emerald-400"

// Negatív összeg (kiadás, negatív egyenleg)
className="text-rose-600 dark:text-rose-400"
```

### Szövegkijelölés

```css
::selection {
  background-color: hsl(var(--primary) / 0.2);  /* 20% teal */
  color: hsl(var(--foreground));
}
```

---

## Ikon Rendszer — Lucide React

| Tulajdonság | Érték |
|-------------|-------|
| **Könyvtár** | `lucide-react` v0.462 |
| **Méret Standard** | `h-4 w-4` (16px) — sidebar, gombok |
| **Méret Large** | `h-5 w-5` (20px) — user section gombok |
| **Méret XL** | `h-6 w-6` (24px) — FAB gomb |
| **Méret XXL** | `h-7 w-7` — `h-8 w-8` — Empty state, error |
| **Stroke Width** | Default (2) — empty state: `strokeWidth={1.5}` |

### Használt Ikonok — Navigációs Csoportok

A sidebar 5 collapsible csoportba szervezve:

#### Áttekintés (`overview`)
| Ikon | Menüpont | Csoport ikon: `LayoutDashboard` |
|------|----------|---|
| `LayoutDashboard` | Irányítópult | |
| `Tags` | Kategóriák | |
| `FolderKanban` | Projektek | |
| `Users` | Partnertörzs | |

#### Pénzügyek (`finance`)
| Ikon | Menüpont | Csoport ikon: `Landmark` |
|------|----------|---|
| `FileText` | Számlák | |
| `ReceiptText` | Kintlévőség | |
| `Landmark` | Tranzakciók | |
| `Banknote` | Házipénztár | |

#### Könyvelés (`accounting`)
| Ikon | Menüpont | Csoport ikon: `BookOpen` |
|------|----------|---|
| `BookOpen` | Főkönyv | |
| `BarChart3` | Eredménykimutatás | |
| `Scale` | Mérleg | |
| `ClipboardCheck` | Beszámoló | |
| `FileSpreadsheet` | ÁFA Bevallás | |

#### HR & Eszközök (`hr`)
| Ikon | Menüpont | Csoport ikon: `Users` |
|------|----------|---|
| `Upload` | Feltöltés | |
| `Wallet` | Bérek/járulékok | |
| `Clock` | Munkaidő | |
| `Package2` | TENY | |

#### Rendszer (`system`)
| Ikon | Menüpont | Csoport ikon: `Wrench` |
|------|----------|---|
| `Plug` | Integrációk | |
| `TrendingUp` | Árfolyamok | |

> **Megjegyzés:** Az `Előfizetés` (`CreditCard`) menüpont jelenleg kikommentelve van.

#### Csoport Fejléc Ikonok
| Ikon | Csoport |
|------|---------|
| `ChevronRight` | Lenyíló indikátor (90° forgás nyitott állapotban) |

#### Műveletek
| Ikon | Felhasználás |
|------|-------------|
| `LogOut` | Kijelentkezés |
| `Sun` / `Moon` | Téma váltás (animált) |
| `Settings` | Beállítások |
| `Copy` / `Check` | Másolás / Másolva |
| `RefreshCw` | Újratöltés |
| `AlertTriangle` | Hiba |
| `ShieldAlert` | Inaktivitás figyelmeztetés |
| `SearchX` | Nincs találat |
| `CalendarIcon` | Dátumválasztó |
| `MessageSquareText` | Feedback FAB |
| `ChevronLeft/Right` | Lapozás |
| `ChevronsLeft/Right` | Első/utolsó oldal |

---

## Ikon Méretezési Pattern

```tsx
// Standard sidebar ikon
<Icon className="h-4 w-4 shrink-0" />

// User section gomb ikon
<Icon className="h-5 w-5" />

// FAB gomb ikon
<Icon className="h-6 w-6" />

// Empty state nagy ikon
<Icon className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />

// Error state ikon
<Icon className="h-5 w-5 shrink-0" />

// Sidebar csoport fejléc ikon
<Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
```

### Animált Ikon Pattern (Téma Váltás)

A Sun/Moon ikon váltás forgó animációt használ:

```tsx
<div className="relative h-4 w-4">
  <Sun className={`h-4 w-4 absolute transition-all ${isDark ? 'animate-rotate-out' : 'animate-rotate-in'}`} />
  <Moon className={`h-4 w-4 absolute transition-all ${isDark ? 'animate-rotate-in' : 'animate-rotate-out'}`} />
</div>
```

A `rotate-in` / `rotate-out` keyframe-ek a `tailwind.config.ts`-ben definiáltak:

```ts
"rotate-in": { from: { transform: "rotate(-90deg) scale(0)", opacity: "0" }, to: { ... } }
"rotate-out": { from: { transform: "rotate(0deg) scale(1)", opacity: "1" }, to: { ... } }
```
