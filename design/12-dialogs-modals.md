# 12 — Dialógusok & Felugró Ablakok

> Dialog, Sheet, Popover, Drawer patternek és használati konvenciók.

---

## Overlay Komponensek Összefoglaló

| Típus | Komponens | Felhasználás | Méret |
|-------|-----------|-------------|-------|
| **Dialog** | `dialog.tsx` | CRUD műveletek, részletek, megerősítés | `sm:max-w-*` |
| **Alert Dialog** | `alert-dialog.tsx` | Törlés megerősítés, destructive műveletek | Kisebb |
| **Sheet** | `sheet.tsx` | Oldalsó panel (activity log) | `side="right"` |
| **Drawer** | `drawer.tsx` | Mobil-barát alsó panel | `vaul` |
| **Popover** | `popover.tsx` | Calendar, kis form-ok | `w-auto` |

---

## Dialog Pattern

### Alap Dialog Felépítés

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Cím</DialogTitle>
      <DialogDescription>Leírás</DialogDescription>
    </DialogHeader>

    {/* Tartalom */}

    <DialogFooter>
      <Button variant="outline" onClick={handleCancel}>Mégse</Button>
      <Button onClick={handleSubmit}>Mentés</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Dialog Stílus Konvenciók

| Tulajdonság | Érték |
|-------------|-------|
| **Overlay** | `bg-black/80` (alapértelmezett) |
| **Max width** | `sm:max-w-md` — `sm:max-w-4xl` |
| **Border** | `border-border/60` |
| **Shadow** | `shadow-2xl` (kivételes dialógoknál) |
| **Z-index** | Alapértelmezett Radix layering |

### Nem Escapable Dialog (Idle Warning)

```tsx
<DialogContent
  className="sm:max-w-md border-border/60 shadow-2xl z-[9999]"
  overlayClassName="backdrop-blur-md bg-black/60 z-[9999]"
  onPointerDownOutside={(e) => e.preventDefault()}
  onEscapeKeyDown={(e) => e.preventDefault()}
  onInteractOutside={(e) => e.preventDefault()}
  hideCloseButton
>
```

---

## Dialógus Típusok az Alkalmazásban

### Számla Dialógusok

| Dialog | Fájl | Méret | Felhasználás |
|--------|------|-------|-------------|
| `InvoiceDetailPopup` | 12KB | Nagy | Számla részletek |
| `InvoiceEditDialog` | 5KB | Közepes | Gyors szerkesztés |
| `InvoiceFullEditDialog` | 9KB | Nagy | Teljes szerkesztés |
| `InvoiceImageDialog` | 5KB | Nagy | Számla kép nagyítás |
| `InvoiceItemsDialog` | 15KB | Nagy | Számla tételek |
| `InvoiceFilesDialog` | 18KB | Nagy | Csatolt fájlok |

### Tranzakció Dialog

| Dialog | Fájl | Méret |
|--------|------|-------|
| `TransactionDetailsDialog` | 46KB | XL — legnagyobb dialog! |

### Egyéb Dialógusok

| Dialog | Fájl | Felhasználás |
|--------|------|-------------|
| `AssetActivationDialog` | 15KB | TENY aktiválás |
| `ChangePasswordDialog` | 8KB | Jelszó módosítás |
| `FeedbackDialog` | 11KB | Visszajelzés küldés |
| `IdleWarningModal` | 3KB | Inaktivitás figyelmeztetés |
| `UnsavedChangesDialog` | 1KB | Mentetlen változások |
| `SupplierInvoiceAssignment` | 14KB | Szállító-számla összerendelés |

---

## Sheet (Oldalsó Panel)

### Activity Log Sheet

**Fájl:** `components/dashboard/ActivityLogSheet.tsx` (65KB — a legnagyobb komponens!)

```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="right" className="w-[400px] sm:w-[540px]">
    <SheetHeader>
      <SheetTitle>Tevékenység napló</SheetTitle>
    </SheetHeader>
    {/* Aktivitás lista */}
  </SheetContent>
</Sheet>
```

---

## Popover Pattern

### Calendar Popover (GlobalDatePicker)

```tsx
<Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm" className="h-7 text-xs">
      <CalendarIcon className="mr-1.5 h-3 w-3" />
      {format(dateFrom, "yyyy. MMM dd.", { locale: hu })}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0" align="start">
    <Calendar
      mode="single"
      selected={dateFrom}
      onSelect={(date) => { setDateFrom(date); setOpen(false); }}
      disabled={{ after: dateTo }}
      initialFocus
      className="p-3 pointer-events-auto"
    />
  </PopoverContent>
</Popover>
```

### Company Selector Popover

**Fájl:** `components/CompanySelector.tsx` (17KB)

Cégválasztó dropdown a sidebar-ban, keresési funkcióval.

---

## Dialog Footer Konvenciók

### Standard Form Dialog

```tsx
<DialogFooter>
  <Button variant="outline" onClick={onCancel}>Mégse</Button>
  <Button onClick={onSubmit}>Mentés</Button>
</DialogFooter>
```

### Destructive Action Dialog

```tsx
<DialogFooter>
  <Button variant="outline" onClick={onCancel}>Mégse</Button>
  <Button variant="destructive" onClick={onDelete}>Törlés</Button>
</DialogFooter>
```

### Confirmation Dialog (Idle Warning)

```tsx
<DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
  <Button variant="outline" onClick={onLogout}>Kijelentkezés</Button>
  <Button onClick={onStay} autoFocus>Igen, maradok</Button>
</DialogFooter>
```

> **Konvenció:** Az elsődleges akció gomb mindig jobbra van (LTR layout). Mobil nézeten `flex-col-reverse` → elsődleges gomb felül.

---

## Z-Index Rétegek

| Réteg | Z-Index | Elem |
|-------|---------|------|
| Tartalom | `auto` | Normal flow |
| Popover / Dropdown | Radix default | Menük, tooltipek |
| Dialog overlay | Radix default | Sötétítő háttér |
| Dialog content | Radix default | Dialog tartalom |
| FAB | `z-50` | Feedback gomb |
| Loading spinner | `z-[9999]` | Full-page spinner |
| Idle Warning | `z-[9999]` | Kiemelt modal |
| Sign-out overlay | `z-[9999]` | Kijelentkezés overlay |

---

## Overlay Stílus Konvenciók

| Kontextus | Overlay | Blur |
|-----------|---------|------|
| Standard Dialog | `bg-black/80` | – |
| Idle Warning | `bg-black/60` | `backdrop-blur-md` |
| Sign-out | `bg-background/95` | `backdrop-blur-sm` |
| Error Boundary | – | `backdrop-blur-md` (card-on) |
