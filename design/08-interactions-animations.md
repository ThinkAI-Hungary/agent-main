# 08 — Interakciók & Animációk

> Hover effektek, transition patternek, témaváltás, micro-animációk, reduced motion.

---

## Design Filozófia: Flat & Calm

A eaisybill tudatosan **flat design**-t követ:
- ❌ **Nincs hover shadow** — globálisan tiltva CSS-ben
- ❌ **Nincs hover scale** — kivéve FAB gomb és tape-slide
- ✅ **Szín alapú hover** — háttérszín/szövegszín változás
- ✅ **Opacity transition** — 200ms ease-out

---

## Hover Patternek

### Gombok (Button)

```css
/* Default button */
hover:bg-primary/90                          /* Sötétebb teal */

/* Outline button */
hover:bg-primary/10 hover:text-primary hover:border-primary/30

/* Ghost button */
hover:bg-accent/50 hover:text-accent-foreground

/* Sidebar action gombok */
hover:bg-primary/10 hover:text-primary hover:border-primary/30
```

### Sidebar Menüelemek

```css
/* Aktív elem */
[data-active="true"] → SidebarMenuButton isActive styling

/* Disabled (nincs company) */
grayscale opacity-50 cursor-not-allowed
```

### Interactive Class

```css
.interactive {
  transition-property: color, background-color, border-color;
  transition-duration: 200ms;
  transition-timing-function: ease-out;
}
```

---

## Transition Timing

| Elem | Duration | Easing | Tulajdonságok |
|------|----------|--------|--------------|
| Gombok | `200ms` | `ease-out` | `colors` |
| Sidebar elemek | `200ms` | `ease-out` | `colors` |
| Téma váltás layout | `300ms` | `ease-in-out` | `background-color, color, border-color` |
| Accordion | `200ms` | `ease-out` | `height` |
| Page fade-in | `400ms` | `ease-out` | `opacity, transform` |
| Step fade-in | `300ms` | `ease-out` | `opacity, transform` |
| Content animate | `400ms` + `150ms delay` | `ease-out` | `opacity, transform` |
| Copy ikon | opacity transition | – | `opacity-0 → opacity-100` |
| iOS toggle | `200ms` | `ease-in-out` | `all` |
| Shimmer | `2s` | `ease-in-out` | `transform` (infinite) |
| Idle timer progress | `1000ms` | `linear` | `width` |
| Initial loader fade | `200ms` | `ease-out` | `opacity` |

---

## Témaváltás Animáció Megőrzés

**Fájl:** `contexts/ThemeContext.tsx`

A témaváltás **nem használ View Transitions API-t**, mert az újraindította a page-animate és egyéb animációkat. Ehelyett:

1. **Transition-ök tiltása** → `no-transitions` class
2. **Animációk pauseolása** → `theme-switching` class (`animation-play-state: paused`)
3. **Azonnali színváltás** → `setThemeState()` + `applyTheme()`
4. **2 frame múlva újraengedés** → `requestAnimationFrame` x2

```tsx
const setTheme = useCallback((newTheme: Theme) => {
  const body = document.body;

  // Suppress transitions AND pause animations
  body.classList.add('no-transitions');
  document.documentElement.classList.add('theme-switching');

  setThemeState(newTheme);
  safeStorage.setItem(STORAGE_KEYS.THEME, newTheme);
  applyTheme(newTheme);

  // Re-enable after paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      body.classList.remove('no-transitions');
      document.documentElement.classList.remove('theme-switching');
    });
  });
}, []);
```

### CSS Classes

```css
/* Suppress transitions during theme switch */
.no-transitions,
.no-transitions *,
.no-transitions *::before,
.no-transitions *::after {
  transition: none !important;
}

/* Freeze (don't reset!) animations during theme switch */
.theme-switching *,
.theme-switching *::before,
.theme-switching *::after {
  animation-play-state: paused !important;
}
```

> **⚠️ FONTOS:** Az animációkat **pauseoljuk** (`animation-play-state: paused`), NEM reseteljük (`animation: none`). A reset visszaállítja az animációt a kiindulási állapotba, és a class eltávolítása után újraindul — ez volt a régi bug oka.

### ThemeContext Stabilitás

A `ThemeContext.Provider` value-ja `useMemo`-val stabilizált, a `setTheme` pedig `useCallback`-kel. Ez megakadályozza a felesleges consumer re-rendereket.

---

## Sidebar Collapsible Nav Animáció

A sidebar menücsoportok nyitása/zárása CSS `grid-template-rows` transition-nel történik (nem CSS `animation`-nel, hogy ne replayeljen re-rendernél):

```css
/* Smooth height transition via CSS grid trick */
.nav-collapsible-content {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 200ms ease-out, opacity 200ms ease-out;
  opacity: 1;
}
.nav-collapsible-content[data-state="closed"] {
  grid-template-rows: 0fr;
  opacity: 0;
}
.nav-collapsible-content > * {
  overflow: hidden;
}
```

> **⚠️ Miért nem CSS animation?** A `@keyframes` alapú animáció újraindul ha a React component re-renderelődik (pl. theme váltás). A CSS `transition` csak **állapotváltáskor** aktiválódik, re-rendernél nem.

### Csoport Fejléc Chevron Animáció

A csoport fejléc mellett lévő `ChevronRight` ikon 90°-os forgást kap nyitott állapotban:

```tsx
<ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 
  ${isOpen ? 'rotate-90' : ''}`} />
```

---

## Rotate Animáció (Sun/Moon)

A témaváltó ikon forgó animációt használ:

```css
@keyframes rotate-in {
  from { transform: rotate(-90deg) scale(0); opacity: 0; }
  to { transform: rotate(0deg) scale(1); opacity: 1; }
}

@keyframes rotate-out {
  from { transform: rotate(0deg) scale(1); opacity: 1; }
  to { transform: rotate(90deg) scale(0); opacity: 0; }
}
```

**Duration:** `0.3s ease-out forwards`

---

## Tape Slide Hover (Waterfall Chart)

```css
.tape-slide {
  padding-top: 14px;
  padding-left: 14px;
  padding-right: 14px;
}

.tape-slide-inner {
  transition: transform 0.5s ease-in-out;
  transform-origin: center center;
}

.tape-slide:hover .tape-slide-inner {
  transform: scale(1.05);  /* Enyhe zoom */
}
```

---

## Feedback FAB Animáció

```tsx
<button className="
  hover:shadow-xl hover:shadow-primary/30
  hover:scale-105
  active:scale-95
  transition-all duration-200 ease-out
">
  <MessageSquareText className="transition-transform duration-200 group-hover:rotate-[-8deg]" />
  <span className="absolute inset-0 rounded-full bg-primary/20 animate-pulse" />
</button>
```

| Interakció | Effekt |
|-----------|--------|
| Hover | `scale(1.05)` + növekvő shadow + ikon `-8deg` rotáció |
| Active | `scale(0.95)` — press effekt |
| Idle | `animate-pulse` glow ring |

---

## Idle Warning Modal Animációk

```tsx
// Shield ikon pulzálás kritikus állapotban
<ShieldAlert className={isUrgent ? 'animate-pulse' : ''} />

// Progress bar szín váltás
<div className={isUrgent ? 'bg-destructive' : 'bg-amber-500'}
     style={{ width: `${(secondsLeft / 120) * 100}%` }}
/>
// transition-all duration-1000 ease-linear
```

---

## Scrollbar Animáció

```css
::-webkit-scrollbar-thumb {
  transition: background 0.2s ease;
}

::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--primary) / 0.5);  /* Teal hover */
}

::-webkit-scrollbar-thumb:active {
  background: hsl(var(--primary) / 0.7);  /* Sötétebb teal active */
}
```

---

## Reduced Motion Támogatás

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  .tape-slide:hover .tape-slide-inner {
    transform: none;
  }
}
```

Ez a beállítás az **OS-szintű** accessibility preference-t tiszteletben tartja.

---

## Globális Hover Shadow Tiltás

```css
*[class*="hover:shadow"]:hover {
  --tw-shadow: 0 0 #0000 !important;
  --tw-shadow-colored: 0 0 #0000 !important;
  transform: none !important;
}
```

> **Cél:** Megelőzi, hogy bármelyik komponens hover-re shadow-t adjon. Ez a flat design alappillére.

---

## CSS Transition Összefoglaló

| CSS Class / Property | Felhasználás |
|---------------------|-------------|
| `transition-colors duration-200` | Gombok, menüelemek |
| `transition-all duration-200 ease-out` | FAB, interactive elemek |
| `transition-opacity` | Copy ikon megjelenés |
| `transition-transform duration-200 ease-in-out` | iOS toggle thumb |
| `transition-none` | Autofill, no-transitions class |
| `animate-spin` | Loading spinnerek |
| `animate-pulse` | FAB glow, idle warning ikon |
| `animate-in fade-in` | Sign-out overlay |
| `animate-rotate-in/out` | Sun/Moon ikon |
| `grid-template-rows 200ms` | Sidebar collapsible nav csoportok |
| `animation-play-state: paused` | Témaváltás alatti animáció freeze |
