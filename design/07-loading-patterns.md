# 07 — Betöltés & Skeleton Patternek

> Loading spinnerek, skeleton-ök, lazy loading, Suspense boundary-k.

---

## Betöltési Rétegek

A eaisybill 3 rétegű betöltési rendszert használ:

```
Layer 1: HTML Initial Loader (index.html)
    ↓ React hydration
Layer 2: Full-page LoadingSpinner (React, auth ellenőrzés)
    ↓ Auth + Company + Role resolved
Layer 3: ContentSkeleton (sidebar shell-en belül, page lazy load)
    ↓ Lazy chunk loaded
Layer 4: Page renderelés
```

---

## Layer 1: HTML Initial Loader

**Fájl:** `index.html`

```html
<div id="initial-loader">
  <div class="spinner"></div>
</div>
```

| Tulajdonság | Érték |
|-------------|-------|
| **Pozíció** | `fixed inset-0 z-9999` |
| **Háttér** | `var(--initial-bg)` — téma-tudatos |
| **Spinner** | Pure CSS: `border-4 #18b8a0 border-r-transparent animate-spin` |
| **Eltávolítás** | `fade-out` class hozzáadása → 220ms után `.remove()` |

**Miért HTML loader?**
- Zero JavaScript — azonnal látható
- Téma-tudatos (dark/light script futás után)
- Megelőzi a FOUC-ot és a fehér villanást

### Eltávolítási Pontok

| Hely | Mikor |
|------|-------|
| `LoadingSpinner` mount | Auth route-okon |
| `ProtectedLayout` ready | Protected route-okon |
| `ErrorBoundary.componentDidCatch` | Hiba esetén |
| `RemoveInitialLoader` | Standalone auth oldalak |

---

## Layer 2: LoadingSpinner

**Fájl:** `ui/loading-spinner.tsx`

Full-page spinner overlay a React app szintjén:

```tsx
<LoadingSpinner message="Betöltés..." />
<LoadingSpinner message="Bejelentkezés..." />
```

| Size | Méret |
|------|-------|
| `sm` | `h-6 w-6 border-2` |
| `md` | `h-8 w-8 border-4` |
| `lg` | `h-10 w-10 border-4` |

**Használat:** Kizárólag auth flow-kban és standalone oldalak Suspense fallback-jeként.

---

## Layer 3: ContentSkeleton

**Fájl:** `ui/content-skeleton.tsx`

A sidebar shell-en belüli tartalom placeholder:

```
┌─────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓ (h-8 w-48)           │  ← Cím
│ ▓▓▓▓▓▓▓▓▓▓▓▓ (h-4 w-64)      │  ← Leírás
│                                 │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐   │  ← 4 KPI kártya skeleton
│ │▓▓▓▓│ │▓▓▓▓│ │▓▓▓▓│ │▓▓▓▓│   │
│ │▓▓▓▓│ │▓▓▓▓│ │▓▓▓▓│ │▓▓▓▓│   │
│ └────┘ └────┘ └────┘ └────┘   │
│                                 │
│ ┌──────────────────────────┐   │  ← Tábla skeleton
│ │ ▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓ ▓▓▓▓ │   │
│ │ ▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓ ▓▓▓▓ │   │
│ │ ▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓ ▓▓▓▓ │   │
│ └──────────────────────────┘   │
└─────────────────────────────────┘
```

**Animáció:** `animate-in fade-in-0 duration-300`

---

## Shimmer Animáció

**Fájl:** `index.css`

```css
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.animate-shimmer::after {
  animation: shimmer 2s infinite ease-in-out;
  background: linear-gradient(
    90deg,
    transparent 0%,
    hsl(var(--foreground) / 0.04) 40%,
    hsl(var(--foreground) / 0.06) 50%,
    hsl(var(--foreground) / 0.04) 60%,
    transparent 100%
  );
}
```

---

## Lazy Loading (Code Splitting)

### Route-Level Splitting

**Fájl:** `App.tsx`

Minden page komponens `React.lazy()` + dynamic `import()`:

```tsx
const InvoicesPage = lazy(() => import("./pages/InvoicesPage"));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage"));
// ... 28 lazy page összesen
```

### Suspense Boundary-k

| Boundary | Fallback | Scope |
|----------|----------|-------|
| `ProtectedLayout` → `ContentArea` | `<StableFallback />` (empty div) | Protected page navigáció |
| Auth routes | `<LoadingSpinner>` | Auth oldalak |
| Management route | `<LoadingSpinner>` | Management dashboard |
| Standalone pages | `<LoadingSpinner>` | NotFound, etc. |

**StableFallback:** `<div className="h-full w-full" aria-busy="true" />` — üres div ami fenntartja a layout magasságot.

---

## Prefetch Stratégiák

### 1. Idle Prefetch (AppLayout)

**Fájl:** `AppLayout.tsx` — `useIdleRoutePrefetch()`

Mount után `requestIdleCallback` (vagy `setTimeout(1500)`) alatt betölti a leggyakrabban használt route chunk-okat:

```tsx
void import("@/pages/Index");           // Dashboard
void import("@/pages/InvoicesPage");     // Számlák (80KB)
void import("@/pages/TransactionsPage"); // Tranzakciók
void import("@/pages/SalariesPage");     // Bérek
void import("@/pages/PartnersPage");     // Partnerek
void import("@/pages/GeneralLedgerPage"); // Főkönyv
```

### 2. Hover/Focus Prefetch (AppSidebar)

**Fájl:** `AppSidebar.tsx` — `prefetchMap`

Sidebar menüelemek fölé húzva (hover/focus) azonnal elindul a chunk letöltése:

```tsx
const prefetchMap: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/pages/Index"),
  "/invoices": () => import("@/pages/InvoicesPage"),
  // ... 20 route
};

// Link-en:
<Link
  onMouseEnter={() => handlePrefetch(item.url)}
  onFocus={() => handlePrefetch(item.url)}
  onTouchStart={() => handlePrefetch(item.url)}
>
```

---

## StableFallback Pattern

A `ContentArea` Suspense fallback-je szándékosan üres div:

```tsx
const StableFallback = () => <div className="h-full w-full" aria-busy="true" />;
```

**Miért nem ContentSkeleton?**
- A `ContentArea` memoizált (`React.memo`)
- Az empty div fenntartja a layout-ot anélkül, hogy vizuális „villanást" okozna
- A ContentSkeleton inkább a `ProtectedLayout` szintjén használatos

---

## Sign-Out Overlay

Kijelentkezéskor:

```tsx
{isSigningOut && (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center
                  bg-background/95 backdrop-blur-sm animate-in fade-in duration-200">
    <div className="flex flex-col items-center gap-4">
      <div className="h-10 w-10 rounded-full border-4 border-primary border-r-transparent animate-spin" />
      <p className="text-sm font-medium text-muted-foreground animate-pulse">
        Kijelentkezés...
      </p>
    </div>
  </div>
)}
```

---

## Page Fade Animációk

```css
@keyframes pageFadeIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.page-animate  { animation: pageFadeIn 0.4s ease-out both; }
.step-animate  { animation: stepFadeIn 0.3s ease-out both; }
.content-animate { animation: pageFadeIn 0.4s ease-out 0.15s both; } /* 150ms delay */
```
