# 09 — Hibakezelés & Feedback

> Error boundary, toast értesítések, validáció, empty state, feedback mechanizmusok.

---

## Error Boundary

**Fájl:** `components/ErrorBoundary.tsx`

### Chunk Load Error (Automatikus Kezelés)

Ha egy lazy-loaded route chunk nem tölthető be (pl. deploy után régi cache):

```
┌──────────────────────────────┐
│     ⟳ (spinning)            │
│                              │
│   Frissítések letöltése...   │
│                              │
│   Az alkalmazás új verziója  │
│   elérhető. Az oldal         │
│   automatikusan újratöltődik.│
│                              │
│   [Kézi újratöltés]         │
└──────────────────────────────┘
```

**Viselkedés:**
1. `ChunkLoadError` detektálás (regex pattern matching)
2. Auto-reload: `window.location.reload()`
3. Debounce: `sessionStorage` timestamp, 10 másodperces cooldown
4. Fallback: „Kézi újratöltés" gomb

### Általános Hiba

```
┌──────────────────────────────┐
│  Card (backdrop-blur-md)     │
│                              │
│  ⚠ Valami hiba történt       │
│                              │
│  Az oldal betöltése során    │
│  váratlan hiba lépett fel.   │
│                              │
│  ┌─────────────────────────┐ │
│  │ Error: undefined is not │ │  ← Monospace error stack
│  │ a function              │ │
│  └─────────────────────────┘ │
│                              │
│  [🔄 Oldal újratöltése    ] │  ← Primary gomb
│  [🚪 Cache törlés + logout ] │  ← Ghost gomb
└──────────────────────────────┘
```

**Stílus:**
- `border-destructive/30 shadow-lg bg-card/50 backdrop-blur-md`
- Error stack: `font-mono text-[10px] max-h-32 overflow-y-auto`
- „Cache törlés és kijelentkezés": törli az összes `eaisybill_` és `sb-` localStorage kulcsot

---

## Toast Értesítések

**Fájl:** `ui/toast.tsx` + `hooks/use-toast.ts`

### Toast Variánsok

| Variáns | Stílus | Felhasználás |
|---------|--------|-------------|
| `default` | Standard | Sikeres műveletek |
| `destructive` | Piros border/szöveg | Hibák |

### Használati Pattern

```tsx
import { toast } from '@/hooks/use-toast';

// Sikeres művelet
toast({ title: "Másolva" });

// Sikeres mentés
toast({ title: "Sikeres", description: "A módosítások elmentve." });

// Hiba
toast({
  title: "Hiba",
  description: "Nem sikerült másolni.",
  variant: "destructive",
});
```

### Toaster Pozíció

**Fájl:** `ui/toaster.tsx`

A `<Toaster />` az `App.tsx`-ben van mountolva, globálisan elérhető.

---

## Validáció

### Form Validáció Stack

```
react-hook-form   ← Form state management
      +
    zod            ← Schema validáció
      +
  @hookform/resolvers  ← Integráció
```

### Validációs Utilityk

**Fájl:** `lib/validationUtils.ts`

Centralizált validációs segédfüggvények:
- Adószám formátum ellenőrzés
- Bankszámlaszám validáció
- Magyar specifikus formátumok

---

## Empty State Patternek

### Table Empty State

```tsx
<TableEmptyState
  colSpan={8}
  icon={SearchX}
  title="Nincs megjeleníthető adat"
  description="Próbáld módosítani a szűrőket vagy keresési feltételeket."
  onClearFilters={handleClear}
  clearLabel="Szűrők törlése"
/>
```

**Vizuális struktúra:**
- Ikon: `rounded-xl bg-muted/50 p-4` konténerben
- Cím: `text-base font-bold tracking-tight`
- Leírás: `text-sm text-muted-foreground max-w-sm`
- CTA gomb: `text-primary border-primary/30` outline

### Dashboard Empty State

**Fájl:** `components/dashboard/EmptyStateDashboard.tsx` (42KB)

Onboarding wizard az első bejelentkezéskor — cég létrehozás, kategória választás stb.

---

## Feedback Rendszer

### Feedback FAB (Floating Action Button)

**Fájl:** `components/FeedbackFab.tsx`

| Tulajdonság | Érték |
|-------------|-------|
| **Pozíció** | `fixed bottom-6 right-6 z-50` |
| **Méret** | `h-14 w-14 rounded-full` |
| **Szín** | `bg-primary text-primary-foreground` |
| **Shadow** | `shadow-lg shadow-primary/25` |
| **Hover** | `scale-105` + nagyobb shadow |
| **Active** | `scale-95` |
| **Glow** | `animate-pulse` ring |
| **Ikon** | `MessageSquareText` — hover: `-8deg` rotáció |
| **A11y** | `aria-label="Visszajelzés küldése"` |
| **Print** | `print:hidden` |

### Feedback Dialog

**Fájl:** `components/FeedbackDialog.tsx` (11KB)

Felhasználói visszajelzés küldése a FAB-on keresztül.

---

## Unsaved Changes Warning

**Fájl:** `components/UnsavedChangesDialog.tsx`

```tsx
<UnsavedChangesDialog
  open={hasUnsavedChanges}
  onSave={handleSave}
  onDiscard={handleDiscard}
  onCancel={handleCancel}
/>
```

Figyelmeztetés mentetlen változások esetén navigáció előtt.

---

## Idle Warning Modal

**Fájl:** `components/IdleWarningModal.tsx`

| Tulajdonság | Érték |
|-------------|-------|
| **Trigger** | 120 mp inaktivitás után |
| **Overlay** | `backdrop-blur-md bg-black/60 z-[9999]` |
| **Ikon** | `ShieldAlert` — amber háttérrel |
| **Countdown** | `font-mono tabular-nums` fix szélességű |
| **Progress bar** | `amber-500` → `destructive` (utolsó 30 mp) |
| **Dismiss** | Nem escapable, nem kattintható ki |
| **Gombok** | „Igen, maradok" (primary, autoFocus) + „Kijelentkezés" (outline) |

---

## Hibakezelési Patternek Összefoglaló

| Hiba típus | Kezelés | Vizuális |
|-----------|---------|---------|
| Chunk load error | Auto-reload + manual button | Spinner + szöveg |
| Általános runtime error | ErrorBoundary card | Piros ikon + stack trace |
| Hálózati hiba | Toast (destructive) | Piros toast |
| Validációs hiba | Form field error | Inline hibaüzenet |
| Üres adat | TableEmptyState | Ikon + szöveg + CTA |
| Session lejárt | IdleWarningModal | Modal + countdown |
| Hozzáférés megtagadva | ScopedLayout screen | Shield ikon + szöveg |
| 404 Not Found | NotFound page | Egyszerű szöveg |
