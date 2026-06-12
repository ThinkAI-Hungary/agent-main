# 10 — Accessibility & UX Patternek

> Keyboard navigáció, focus management, a11y patternek, mobil támogatás, egyéb UX döntések.

---

## Focus Management

### Keyboard Focus (`:focus-visible`)

```css
*:focus-visible {
  outline: 2px solid hsl(var(--ring));  /* Brand teal */
  outline-offset: 2px;
}
```

### Mouse Focus Elnyomás

```css
/* Mouse/JS focus — nincs vizuális jelzés */
*:focus:not(:focus-visible) {
  outline: none !important;
  box-shadow: none !important;
}

/* Input elemek mouse focus — border nem változik */
input:focus:not(:focus-visible),
textarea:focus:not(:focus-visible),
select:focus:not(:focus-visible) {
  border-color: inherit !important;
  box-shadow: none !important;
  transition: none !important;
}
```

> **Döntés:** Csak billentyűzetes navigáció esetén jelenik meg a focus ring. Egérkattintásra nincs vizuális feedback, ami letisztultabb megjelenést eredményez.

---

## Tap & Touch Optimalizáció

### Tap Highlight Eltávolítás

```css
button, a, [role="button"], [type="button"], [type="submit"], [type="reset"] {
  -webkit-tap-highlight-color: transparent;
}
```

### Text Selection Megelőzés

```css
.sidebar-item, [data-sidebar="menu-button"], button, a, [role="button"], .nav-link {
  -webkit-user-select: none;
  user-select: none;
  cursor: pointer;
  touch-action: manipulation;  /* 300ms tap delay eltávolítás */
}
```

> **`touch-action: manipulation`**: Eltávolítja a mobil böngészők 300ms-os tap delay-ét, ami gyorsabb interakciókat eredményez.

---

## ARIA Patternek

### Role Attribútumok

| Komponens | ARIA | Megjegyzés |
|-----------|------|------------|
| iOS Toggle | `role="switch" aria-checked={checked}` | Switch szemantika |
| Copyable Cell | `role="button" tabIndex={0}` | Kattintható elem |
| Idle Modal | `onEscapeKeyDown={(e) => e.preventDefault()}` | Nem escapable |
| Loading Spinner | – | (Hiányzik `aria-busy`) |
| StableFallback | `aria-busy="true"` | Loading jelzés |
| Feedback FAB | `aria-label="Visszajelzés küldése"` | Screen reader |
| Pagination gombok | `aria-label="Első oldal"` etc. | Magyar nyelvű |

### Keyboard Navigáció Támogatás

| Komponens | Billentyű | Művelet |
|-----------|-----------|---------|
| iOS Toggle | `Enter` / `Space` | Toggle |
| Copyable Cell | `Enter` / `Space` | Másolás |
| Sidebar items | Tab + Enter | Navigáció |
| Dialog | Tab trap | Focus csapda |
| Select | Arrow keys | Opció váltás |
| Idle Modal | – | Nem dismissable |

---

## Szövegkijelölés (Selection)

```css
::selection {
  background-color: hsl(var(--primary) / 0.2);  /* 20% teal háttér */
  color: hsl(var(--foreground));
}
```

Minden szövegkijelölés brand teal színnel történik — az alkalmazás mindkét theme-jében.

---

## Scrollbar Accessibility

### Méret

```css
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
```

### Firefox Támogatás

```css
* {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted-foreground) / 0.3) hsl(var(--muted) / 0.3);
}
```

### Teal Scrollbar (Dark Mode)

```css
.dark ::-webkit-scrollbar-thumb {
  background: hsl(var(--primary) / 0.4);
}
```

---

## Autofill Kezelés

### Probléma

A böngésző autofill (jelszó manager, Chrome autofill) kék/sárga hátteret ad az input mezőknek, ami megtöri a design rendszert.

### Megoldás

```css
input:-webkit-autofill {
  -webkit-box-shadow: 0 0 0 1000px hsl(var(--muted)) inset !important;
  -webkit-text-fill-color: hsl(var(--foreground)) !important;
  transition: background-color 9999s ease-in-out 0s;  /* Végtelen transition → soha nem vált */
}
```

Külön dark mode verzió: `hsl(222 37% 10%)` háttér.

### Date Input Calendar Ikon (Dark Mode)

```css
.dark input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(0.8) sepia(1) saturate(3) hue-rotate(130deg);
}
```

---

## Print Támogatás

| Elem | Viselkedés |
|------|-----------|
| Sidebar | `print:hidden` |
| TopBar (DatePicker) | `print:hidden` |
| FAB | `print:hidden` |
| Page Header | `print:hidden` |
| Content | `print:p-0 print:overflow-visible` |
| Layout | `print:h-auto print:overflow-visible` |

```css
@media print {
  @page { size: landscape; margin: 15mm; }
  html, body, #root {
    height: auto !important;
    overflow: visible !important;
  }
}
```

---

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## Product Tour (Onboarding)

**Könyvtár:** `react-joyride`

**Fájl:** `components/ProductTour.tsx` + `components/ProductTourTooltip.tsx`

A sidebar elemeken `data-tour` attribútumok jelölik a tour lépéseket:

```tsx
<SidebarMenuItem data-tour="dashboard">
<SidebarMenuItem data-tour="invoices">
<div data-tour="company-selector">
```

---

## Mobil Responsiveness

### Use Mobile Hook

**Fájl:** `hooks/use-mobile.tsx`

Breakpoint-alapú mobil detektálás (valószínűleg `768px`).

### Responsive Patternek

```tsx
// Page header
className="flex flex-col md:flex-row items-start md:items-center"

// KPI cards
className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"

// Hidden on mobile
className="hidden sm:block"

// TopBar
className="flex items-center gap-2 flex-wrap"
```

### Auth Viewport Scaling

```css
@media (max-height: 900px) {
  .auth-root {
    transform: scale(0.9);
    transform-origin: top left;
    width: 111.111%;  /* Kompenzáció a scale-hez */
    height: 111.111vh;
  }
}
```

---

## UX Döntések & Konvenciók

### Magyar Nyelvű UI

Minden felhasználói felületi elem magyar nyelvű:
- Gomb szövegek: „Szűrők törlése", „Vissza a főoldalra"
- Toast üzenetek: „Másolva", „Hiba"
- Modal szövegek: „Igen, maradok", „Kijelentkezés"
- Pagination: „Találatok", „Oldalméret"
- Dátum formátum: `hu` locale (`2026. jan. 01.`)

### Clipboard Másolás Pattern

- Click-to-copy a cella szövegére
- Hover → Copy ikon megjelenik
- Click → „Másolva" toast + Check ikon 2 mp-ig

### Financial Number Display

- `font-mono tabular-nums` — fix szélességű számjegyek
- `font-feature-settings: "tnum" 1, "lnum" 1`
- Magyar számformátum: `toLocaleString('hu-HU')`
