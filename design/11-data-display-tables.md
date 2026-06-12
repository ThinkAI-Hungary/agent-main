# 11 — Adatmegjelenítés & Táblázatok

> Táblázat stílusok, pagination, chart-ok, pénzügyi számok formázása.

---

## Compact Table Stílus

**Fájl:** `index.css`

```css
.compact-table {
  font-size: 0.875rem;  /* text-sm */
  table-layout: auto;   /* tartalom szerinti oszlopszélesség */
}

.compact-table th {
  padding: 0.5rem;
  font-size: 0.75rem;   /* text-xs */
  height: 45px;
  max-height: 45px;
}

.compact-table td {
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  height: 45px;
  max-height: 45px;
  /* NE legyen overflow: hidden — a horizontális scroll kezeli */
}

.compact-table tr {
  height: 45px;
  max-height: 45px;
}
```

> **Fix 45px sor magasság:** Biztosítja a layout stabilitást — a sorok sosem nőnek a tartalom szerint, ami megakadályozza a layout shift-eket scrollozás közben.

---

## Standard Tábla Layout Szabályok

> **Döntés (2026-06-08):** A táblák soha nem vághatják le a tartalmat. Keskenyebb felbontáson horizontálisan scrollozhatónak kell lenniük.

### 1. `table-layout: auto` (nem `fixed`)

A `table-layout: fixed` kényszeríti a táblát a konténer szélességébe, ami levágja a tartalmat. Az `auto` mód a tartalom szerint méretezi az oszlopokat.

### 2. Horizontális scroll wrapper

```tsx
<div className="rounded-lg border border-border/50 overflow-x-auto">
  <Table className="compact-table min-w-max">
    {/* ... */}
  </Table>
</div>
```

- `overflow-x-auto` a wrapper `<div>`-en → scrollbar megjelenik ha szükséges
- `min-w-max` a `<Table>`-ön → a tábla soha nem nyomódik kisebbre a tartalomnál

### 3. Partner név truncálás (13 karakter)

A partner nevek 13 karakter felett `…`-tal levágódnak. A teljes név másolásra és tooltip-ként elérhető marad.

```tsx
<CopyableCell
  value={partnerName}
  displayValue={partnerName.length > 13 ? partnerName.slice(0, 13) + '…' : partnerName}
  truncate
  maxWidth="100%"
  className="font-medium text-xs"
  ariaLabel={`${partnerName} másolása`}
/>
```

### 4. Oszlop szélességek

| Oszlop | Szabály | Megjegyzés |
|--------|---------|------------|
| Partner | 13 kar. truncate | `displayValue` JS truncálással |
| Kiáll. / Telj. (beküldött) | `w-[100px]` | Fix szélesség a `yyyy. MM. dd.` formátumnak |
| Kiáll. / Telj. (NAV) | `whitespace-nowrap` | Természetes szélesség, nem törik |
| Biz.szám | `min-w-[200px]` + `whitespace-nowrap` | Fejléc + cella egyaránt |
| Összeg oszlopok | `whitespace-nowrap` + `tabular-nums` | Számok nem törhetnek |

### 5. NE legyen `overflow: hidden` a cellákon

A `td` elemeken **tilos** az `overflow: hidden` — a horizontális scroll wrapper kezeli a túlcsordulást.


## Sor Elválasztók

```css
table tbody tr {
  box-shadow: inset 0 -1px 0 0 hsl(var(--foreground) / 0.08);
}

.dark table tbody tr {
  box-shadow: inset 0 -1px 0 0 hsl(var(--foreground) / 0.1);
}
```

> **Miért `box-shadow` és nem `border-bottom`?** A `box-shadow` nem ad hozzá a layout magassághoz és nem okoz sub-pixel rendering problémákat.

---

## Táblázat Komponensek

### Alap Table Primitívek (`ui/table.tsx`)

| Komponens | CSS | Felhasználás |
|-----------|-----|-------------|
| `<Table>` | `w-full caption-bottom text-sm` | Tábla wrapper |
| `<TableHeader>` | `[&_tr]:border-b` | Fejléc |
| `<TableBody>` | `[&_tr:last-child]:border-0` | Tartalom |
| `<TableRow>` | `border-b transition-colors hover:bg-muted/50` | Sor |
| `<TableHead>` | `h-12 px-4 text-left font-medium text-muted-foreground` | Fejléc cella |
| `<TableCell>` | `p-4 align-middle` | Tartalom cella |

### Table Empty State (`ui/table-empty-state.tsx`)

Üres táblázat placeholder. Lásd: [09-error-handling-feedback.md](./09-error-handling-feedback.md)

### Table Skeleton (`ui/table-skeleton.tsx`)

Betöltés alatti tábla placeholder skeleton animációval.

### Table Placeholder Rows (`ui/table-placeholder-rows.tsx`)

Üres placeholder sorok a tábla magasságának fenntartásához.

---

## Unified Pagination

**Fájl:** `ui/unified-pagination.tsx`

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ Találatok (500)  │  ⟨⟨ ⟨ 1 2 [3] 4 5 ⟩ ⟩⟩  │  Oldalméret [50▾] │
└─────────────────────────────────────────────────────────┘
```

| Szekció | Pozíció | Tartalom |
|---------|---------|----------|
| Bal | `justify-start` | Összesítés: „Találatok (500)" |
| Közép | `center` | Oldalszámok (max 5 látható) |
| Jobb | `justify-end` | Oldalméret választó |

### Oldalszám Megjelenítés

- Max 5 oldalszám egyszerre
- Aktív oldal: `variant="default"` (teal)
- Inaktív: `variant="ghost"`
- First/Last: `ChevronsLeft`/`ChevronsRight`
- Prev/Next: `ChevronLeft`/`ChevronRight`

### Oldalméret Opciók

Alapértelmezett: `[50, 100]`

### Összesítés Formázás

```tsx
totalItems > 10000 ? '10000+' : totalItems.toLocaleString('hu-HU')
```

---

## Pénzügyi Számok Formázás

### CSS

```css
.financial-number {
  font-family: monospace;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
}
```

### Tailwind Pattern

```tsx
className="font-mono tabular-nums"
```

### Szám Formázás

```tsx
// Magyar formátum
value.toLocaleString('hu-HU')
// → "1 234 567"

// Pénznem
`${amount.toLocaleString('hu-HU')} Ft`
// → "1 234 567 Ft"
```

---

## Chart-ok (Recharts)

### Chart Színpaletta

A `chart.tsx` (10KB) komponens és a CSS tokenek biztosítják a konzisztens színezést:

| Index | Szín | Token |
|-------|------|-------|
| 1 | Teal | `--chart-1` |
| 2 | Kék | `--chart-2` |
| 3 | Narancs | `--chart-3` |
| 4 | Zöld | `--chart-4` |
| 5 | Rózsaszín | `--chart-5` |

### Revenue/Expenses Chart

**Fájl:** `components/dashboard/RevenueExpensesChart.tsx` (12KB)

Bevétel vs kiadás vonaldiagram a dashboard-on. A `eaisybill_dashboard_chart_lines` localStorage kulcsban tárolja, mely vonalak láthatók.

### Waterfall Chart (Tape Slide)

CSS animáció hover-re:

```css
.tape-slide:hover .tape-slide-inner {
  transform: scale(1.05);
}
```

---

## Tranzakció Típus Színkódolás

Táblázat sorok/badge-ek színezése tranzakció típus szerint:

```tsx
// Háttér szín
style={{ backgroundColor: `hsl(var(--tr-supplier-bg))` }}

// Szöveg szín
style={{ color: `hsl(var(--tr-supplier-text))` }}
```

14 különböző tranzakció típus, mindegyiknek saját háttér+szöveg szín páros, light és dark mode-ban.

---

## Sor Státusz Kiemelés

```tsx
// Sikeres sor (pl. fizetve)
className="bg-[hsl(var(--success-row-bg))] text-[hsl(var(--success-row-text))]"

// Hibás sor
className="bg-[hsl(var(--error-row-bg))] text-[hsl(var(--error-row-text))]"

// Figyelmeztetés sor
className="bg-[hsl(var(--warning-row-bg))] text-[hsl(var(--warning-row-text))]"
```

---

## Copyable Cell Pattern

Táblázat cellák kattintásra másolhatók:

```
Normál állapot:     INV-2024-001
Hover:              INV-2024-001 📋    ← Copy ikon megjelenik
Click:              INV-2024-001 ✓     ← Check ikon + toast
```

Részletes leírás: [04-component-library.md](./04-component-library.md#copyable-cell)

---

## Expanded Row Pattern

**Fájl:** `components/ExpandedInvoiceRow.tsx` (24KB)

Számla táblázat sorok kibonthatók részletes nézetté, ami tartalmazza:
- Számla képe/PDF
- Tételek listája
- Párosítási információk
- Szerkesztési lehetőségek

---

## Metric Card Grid

Dashboard KPI kártyák elrendezése:

```tsx
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
  <MetricCard title="Bevétel" ... />
  <MetricCard title="Kiadás" ... />
  <MetricCard title="Eredmény" ... />
  <MetricCard title="Nyitott számlák" ... />
</div>
```

| Breakpoint | Oszlopok |
|-----------|---------|
| `< sm` | 1 |
| `sm` – `lg` | 2 |
| `lg+` | 4 |

---

## Export Formátumok

| Formátum | Könyvtár | Felhasználás |
|----------|----------|-------------|
| Excel (.xlsx) | `exceljs` / `xlsx` | Számla, tranzakció export |
| PDF | `jspdf` + `jspdf-autotable` | Éves beszámoló, ÁFA bevallás |
| CSV | `papaparse` | Adat import/export |
| XML | Custom | ÁFA bevallás XML |
