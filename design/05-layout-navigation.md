# 05 — Layout & Navigáció

> App shell architektúra, sidebar collapsible csoportok, scoped routing, elrendezési patternek.

---

## App Shell Architektúra

```
┌─────────────────────────────────────────────────┐
│ BrowserRouter                                   │
│  ├── /auth               → Auth (standalone)    │
│  ├── /reset-password     → ResetPassword         │
│  ├── /management         → ManagementDashboard   │
│  │                                               │
│  └── ProtectedLayout ◄── Auth gate              │
│       ├── AppLayout                              │
│       │   ├── AppSidebar (bal oldal)             │
│       │   └── Main Area                          │
│       │       ├── TopBar (GlobalDatePicker)       │
│       │       └── ContentArea                    │
│       │           └── ScopedLayout               │
│       │               └── <Outlet /> (page)      │
│       └── FeedbackFab (jobb alsó sarok)          │
└─────────────────────────────────────────────────┘
```

### Komponens Felelősségek

| Komponens | Felelősség |
|-----------|-----------|
| **ProtectedLayout** | Auth gate — semmi nem renderelődik amíg auth+company+role nem kész |
| **AppLayout** | Shell layout — Sidebar + TopBar + Content. Stabil, nem mount-ol újra |
| **AppSidebar** | Navigációs sidebar — `React.memo()`, collapsible csoportokkal |
| **TopBar** | Globális dátumszűrő — `React.memo()`, elrejtve employee-knál |
| **ContentArea** | Lazy route Suspense boundary — `React.memo()` |
| **ScopedLayout** | URL ↔ Context szinkronizáció layer |
| **FeedbackFab** | Fix pozíciójú visszajelzés gomb |

---

## Sidebar

### Struktúra — Collapsible Csoportok

```
┌──────────────────────┐
│  eaisybill           │  ← Brand logó (e/ai/sy/bill segmented)
├──────────────────────┤
│  [Cég kiválasztás ▾] │  ← CompanySelector (employee-nél rejtett)
├──────────────────────┤
│  ▾ ÁTTEKINTÉS        │  ← Collapsible csoport fejléc
│    ▸ Irányítópult    │
│    ▸ Kategóriák      │
│    ▸ Projektek       │
│    ▸ Partnertörzs    │
│                      │  ← pb-1.5 gap
│  ▸ PÉNZÜGYEK         │  ← Zárt csoport (active indicator line alul)
│                      │
│  ▾ KÖNYVELÉS         │
│    ▸ Főkönyv         │  ← active state kiemelés
│    ▸ Eredménykimutatás│
│    ▸ Mérleg          │
│    ▸ Beszámoló       │
│    ▸ ÁFA Bevallás    │
│                      │
│  ▸ HR & ESZKÖZÖK     │
│  ▸ RENDSZER          │
├──────────────────────┤
│  👤 User avatar      │
│  Név / email         │
│  [☀️] [⚙️] [🚪]     │  ← Téma, beállítások, kilépés
├──────────────────────┤
│  [◀ Sidebar toggle]  │
└──────────────────────┘
```

### 5 Navigációs Csoport

| Kulcs | Csoport név | Ikon | Menüelemek |
|-------|------------|------|------------|
| `overview` | Áttekintés | `LayoutDashboard` | Irányítópult, Kategóriák, Projektek, Partnertörzs |
| `finance` | Pénzügyek | `Landmark` | Számlák, Kintlévőség, Tranzakciók, Házipénztár |
| `accounting` | Könyvelés | `BookOpen` | Főkönyv, Eredménykimutatás, Mérleg, Beszámoló, ÁFA Bevallás |
| `hr` | HR & Eszközök | `Users` | Feltöltés, Bérek/járulékok, Munkaidő, TENY |
| `system` | Rendszer | `Wrench` | Integrációk, Árfolyamok |

### Csoport Fejléc Stílus

```tsx
<CollapsibleTrigger className="relative flex items-center gap-2 w-full px-2 py-1.5 
  rounded-md text-sm font-medium text-sidebar-foreground/70 
  hover:bg-primary/10 hover:text-primary transition-colors">
  <group.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
  <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
  <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 
    ${isOpen ? 'rotate-90' : ''}`} />
</CollapsibleTrigger>
```

### Csoport Nyitott/Zárt Állapot

| Tulajdonság | Érték |
|-------------|-------|
| **Perzisztencia** | `localStorage` → `eaisybill:sidebar-groups` kulcs |
| **Formátum** | JSON tömb: `["overview","accounting"]` |
| **Auto-open** | Navigáláskor az aktív oldal csoportja automatikusan kinyílik |
| **Active indicator** | Zárt csoportnál 2px teal vonal a fejléc alatt (`bg-primary/60`) |
| **Animáció** | CSS `grid-template-rows: 0fr/1fr` + `opacity` transition (200ms ease-out) |
| **forceMount** | `CollapsibleContent forceMount` — tartalom DOM-ban marad bezárva is, hogy a CSS transition le tudjon futni |
| **Csoportok közötti gap** | `gap-1` (4px) + `pb-1.5` (6px) a nyitott tartalom alján |
| **Sub-menü elem behúzás** | `pl-9` (2.25rem) — vizuálisan elkülöníti az elemeket a csoport fejléctől |

### Collapsed (Icon-only) Mód

Összezárt sidebar-nál a csoportok eltűnnek, és egy **flat ikon lista** jelenik meg az összes menüelem ikonjával, tooltip-ekkel.

### Sidebar Viselkedés

| Tulajdonság | Érték |
|-------------|-------|
| **Collapsible** | `"icon"` — összecsukva csak ikonok |
| **Brand (expanded)** | „eaisybill" — segmented tipográfia |
| **Brand (collapsed)** | „eai" — font-medium + bold primary |
| **Active state** | `SidebarMenuButton isActive` |
| **Disabled state** | Ha nincs company: `grayscale opacity-50 cursor-not-allowed` |
| **Print** | `print:hidden` |
| **Memoizáció** | `React.memo(AppSidebar)` |
| **Prefetch** | Hover/focus-ra lazy chunk prefetch (`prefetchMap`) |

### Employee vs Owner Nézet

| Funkció | Owner | Employee |
|---------|-------|----------|
| CompanySelector | ✅ Látható | ❌ Rejtett |
| Összes menüpont | ✅ Látható | ❌ Rejtett |
| Munkaidő menüpont | ✅ Látható | ✅ Látható |
| Beállítások gomb | ✅ Látható | ❌ Rejtett |
| TopBar (GlobalDatePicker) | ✅ Látható | ❌ Rejtett |

---

## Scoped Routing

### URL Struktúra

```
/:companyId/:dateRange/page/:tab?
```

| Szegmens | Formátum | Példa |
|----------|----------|-------|
| `companyId` | UUID | `abc-123-def` |
| `dateRange` | `YYYY-MM-DD_YYYY-MM-DD` | `2026-01-01_2026-12-31` |
| `page` | Route szegmens | `invoices` |
| `tab` | Opcionális tab | `outbound_nav` |

### Navigációs Utilityk

```tsx
// Scoped path generálás
generateScopedPath('abc-123', '2026-01-01', '2026-12-31', 'invoices')
// → '/abc-123/2026-01-01_2026-12-31/invoices'

// Scoped navigáció hook
const navigate = useScopedNavigate();
navigate('invoices', { replace: true });

// Base path hook (sidebar linkekhez)
const basePath = useScopedBasePath();
// → '/abc-123/2026-01-01_2026-12-31'

// URL-alapú tab kezelés
const [tab, setTab] = useUrlTab('invoices', 'outbound_nav', VALID_TABS);
```

---

## Global Date Picker (TopBar)

```
┌─────────────────────────────────────────────────────────┐
│ Időszak: [Ez a hónap] [Előző hónap] [Ez az év] | 📅 2026. jan. 01. – 📅 2026. dec. 31. │
└─────────────────────────────────────────────────────────┘
```

| Tulajdonság | Érték |
|-------------|-------|
| **Pozíció** | Fejléc alatti sáv, `border-b` |
| **Háttér** | `bg-background/95 backdrop-blur` |
| **Preset gombok** | „Ez a hónap", „Előző hónap", „Ez az év" |
| **Custom dátum** | Két `Calendar` popover (from/to) |
| **Max tartomány** | 365 nap |
| **Locale** | `hu` — magyar dátumformátum: `2026. jan. 01.` |

---

## Elrendezési Patternek

### Full Height Layout

```css
html, body { height: 100%; overflow: hidden; }
#root { height: 100%; overflow: hidden; }
```

A content area görgetése a `<main>` elemen belül történik:

```tsx
<main className="flex-1 overflow-y-auto bg-background p-6">
```

### Page Animation

Minden oldal root container-e `.page-animate` class-t kap:

```css
.page-animate {
  animation: pageFadeIn 0.4s ease-out both;
}

@keyframes pageFadeIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### Print Layout

```css
@media print {
  html, body, #root { height: auto; overflow: visible; }
  @page { size: landscape; margin: 15mm; }
}
```

A sidebar, TopBar és FAB `print:hidden` class-szal el van rejtve nyomtatáskor.

### Content Padding

| Kontextus | Padding |
|-----------|---------|
| Main content area | `p-6` (24px) |
| Sidebar expanded | `p-4` (16px) |
| Sidebar sub-menu items | `pl-6` (24px) — vizuálisan elkülönítve a csoport fejlécektől |
| Sidebar csoport fejléc | `px-2 py-1.5` |
| TopBar | `px-6 py-2` |

> **Döntés (2026-06-08):** Sub menü elemek behúzása `pl-2` → `pl-6`-ra növelve, hogy vizuálisan egyértelműen elkülönüljenek a csoport fejlécektől. A `CollapsibleContent`-re `forceMount` attribútum került, hogy a nyitás/csukás CSS animáció simán lefusson.
