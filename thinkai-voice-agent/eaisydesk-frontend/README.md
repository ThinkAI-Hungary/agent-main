# eaisydesk-frontend -- React + Vite Migration

> **Status**: Folyamatban. A legacy vanilla JS admin feluletet fajlonkent migraljuk React + Vite + TypeScript-re.  
> Ez a dokumentum arra szolgal, hogy barki (ember vagy agent) aki hozzanyul a projekthez, gyorsan megertse a jelenlegi allapotot, az architekturalisi donteseeket, es a konvenciokat.

---

## Tartalomjegyzek

- [Technologiai verem](#technologiai-verem)
- [Projekt struktura](#projekt-struktura)
- [Futtatasa](#futtatas)
- [Architektura](#architektura)
- [Routing -- fontos!](#routing--fontos)
- [Migracioterkep](#migracioterkep)
- [CSS strategia](#css-strategia)
- [Konvenciok es szabalyok](#konvenciok-es-szabalyok)
- [Uj oldal migraciojanak lepesrei](#uj-oldal-migraciojanak-lepesei)
- [Ismert buktatók](#ismert-buktatók)

---

## Technologiai verem

| Reteg         | Technologia                              |
| ------------- | ---------------------------------------- |
| Framework     | React 19 + TypeScript 6                  |
| Build tool    | Vite 8                                   |
| Routing       | react-router-dom 7 (BrowserRouter)       |
| Charting      | chart.js 4 + react-chartjs-2 5           |
| Styling       | Vanilla CSS (legacy CSS fajlok atemelesevel) |
| API kliens    | Custom `authFetch()` wrapper (`src/api/client.ts`) |
| State mgmt    | React Context (Auth, Theme)              |
| Backend       | Python FastAPI (`web_server.py`, port 8000) |

---

## Projekt struktura

```
eaisydesk-frontend/
├── public/                     # Static assets (Vite kiszolgalja)
├── src/
│   ├── api/
│   │   └── client.ts           # authFetch(), loginApi(), token/user localStorage
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx   # Outlet wrapper: <Sidebar> + <MainHeader> + <Outlet>
│   │   │   ├── MainHeader.tsx  # Felso header sav (cim, user info)
│   │   │   └── Sidebar.tsx     # Navigacio, dark mode toggle, collapse (Ctrl+B)
│   │   └── ui/                 # Ujrahasznalhato UI komponensek (meg ures)
│   ├── context/
│   │   ├── AuthContext.tsx     # Login/logout, isAdmin, user state, 401 handler
│   │   └── ThemeContext.tsx    # Dark/light mode, body.dark class toggle
│   ├── hooks/                  # Custom hookse (meg ures)
│   ├── pages/
│   │   ├── AnalyticsPage.tsx   # KESZ - Teljes analytics: KPI, chartek, funnel, alerts, insights
│   │   ├── HelpPage.tsx        # KESZ - Segitseg: FAQ accordion, modulok, billentyuparancsok
│   │   ├── LoginPage.tsx       # KESZ - Bejelentkezes
│   │   └── PlaceholderPage.tsx # Ideiglenes placeholder meg nem migralt oldalakhoz
│   ├── styles/                 # Legacy CSS fajlok 1:1 atemelve
│   │   ├── variables.css       # CSS custom properties (--text, --bg, --accent, stb.)
│   │   ├── base.css            # Alap body/html reset
│   │   ├── layout.css          # #app flex layout
│   │   ├── sidebar.css         # .sidebar, .nav-item, collapse animacio
│   │   ├── login.css           # .login-* osztalyok
│   │   ├── components.css      # .panel-white, .chart-card, .filter-row-figma, stb.
│   │   ├── analytics.css       # .severity-card, .funnel-*, .kpi-card, stb.
│   │   ├── dark-mode.css       # body.dark feluliro szabalyok
│   │   ├── responsive.css      # Sidebar-collapsed layout
│   │   └── [tobbi].css         # calendar, kanban, clients, settings, outbound, tudastar
│   ├── App.tsx                 # BrowserRouter + AuthGate + Routes
│   └── main.tsx                # React DOM createRoot
├── vite.config.ts              # Vite: base=/admin/, API proxy -> localhost:8000
├── tsconfig.json
└── package.json
```

---

## Futtatás

```bash
# 1. Backend (a projekt gyokerebol)
cd thinkai-voice-agent
python web_server.py
# -> http://localhost:8000

# 2. Frontend (kulon terminal)
cd thinkai-voice-agent/eaisydesk-frontend
npm install
npm run dev
# -> http://localhost:5173/admin/
```

A Vite dev server API kereseket proxy-zza a backend fele (`/admin/api/*`, `/admin/login`).  
Statikus asseteket (logo, hatter) szinten proxy-zza.

---

## Architektura

### Alkalmazas inicializacio

```
main.tsx -> App.tsx -> BrowserRouter (basename="/admin")
                       -> ThemeProvider (dark/light, body.dark class)
                         -> AuthProvider (login state, token, user)
                           -> AuthGate
                              ├─ !authenticated -> LoginPage
                              └─ authenticated  -> Routes
                                                   └─ AppLayout (Sidebar + MainHeader + Outlet)
                                                      ├─ /analytics -> AnalyticsPage
                                                      ├─ /help      -> HelpPage
                                                      ├─ /interactions, /clients, ... -> PlaceholderPage
                                                      └─ /*         -> Navigate to /analytics
```

### API kommunikacio

Minden autentikalt API hivas az `authFetch()` fuggvenyen keresztul tortenik (`src/api/client.ts`):
- Automatikus `Authorization: Bearer <token>` header
- 401-es valasz eseten automatikus kijelentkezes (AuthContext `onUnauthorized` callback)
- Token localStorage-ban: `thinkai_admin_token`

### Tema (dark mode)

A `ThemeContext` kezeli. A dark mode egy `body.dark` CSS class toggle-re epul.  
Az osszes dark mode override a `dark-mode.css`-ben van, `body.dark` scope alatt.  
Chartoknal a `gridColor` es `gridDash` valtozik: dark mode-ban `#1a3548` + solid vonal, light mode-ban `#f1f5f9` + `[5, 5]` szaggatott.

### Sidebar collapse

A sidebar collapse allapot `body.sidebar-collapsed` CSS classszal jelzi a layout valtozast.  
Ezt a `Sidebar.tsx` kezeli, `localStorage`-ban menti (`digidesk_sidebar_collapsed`).  
A CSS `responsive.css`-ben van a `.sidebar-collapsed` layout (sidebar szelesseg, content margin).

---

## Routing -- FONTOS!

A `BrowserRouter` `basename="/admin"`-nel van konfigurálva.  
Ez azt jelenti:

- **A route `path`-ok NEM tartalmazzák a `/admin` prefixet.** Peldaul: `path="analytics"` -> URL: `/admin/analytics`
- **A `navigate()` hivasok szinten basename-relativak.** Tehat `navigate('/help')` -> URL: `/admin/help`. **NE** hasznald a `navigate('/admin/help')`-ot, mert az `/admin/admin/help`-re mutatna!
- **A `useLocation().pathname` szinten basename-stripped.** Ha a URL `/admin/analytics`, a `location.pathname` = `/analytics`.

**Ez egy korabban talalt bug volt**: a sidebar osszes linkje `/admin/...` prefixszel volt, ami minden navigaciot a catch-all redirect-re kuldott (analytics-ra). A fix: minden path basename-relativ.

---

## Migraciótérkép

### KÉSZ (migralva React-ra)

| Oldal | React fajl | Legacy forras (HTML + JS) | Megjegyzes |
| --- | --- | --- | --- |
| Login | `LoginPage.tsx` | `partials/login.html` | Teljes |
| Analitika | `AnalyticsPage.tsx` | `partials/page-analytics.html` + `js/admin-analytics.js` + `js/admin-core.js` (alerts, insights) | Teljes: KPI-k, Line/Doughnut/Bar chartok, funnel, handoff, outbound, severity modal, AI insights |
| Segitseg | `HelpPage.tsx` | `partials/page-help.html` + `js/admin-core.js` (initHelp, toggleFaq) | Teljes: FAQ accordion, modulok, shortcuts, kontakt, verzio |
| Sidebar | `Sidebar.tsx` | `partials/sidebar.html` + `js/admin-core.js` (sidebar toggle, nav) | Teljes |
| Header | `MainHeader.tsx` | `partials/main-header.html` | Teljes |
| Layout | `AppLayout.tsx` | - | Outlet wrapper |

### MEG NEM MIGRALT (PlaceholderPage-en)

| Oldal | Route | Legacy forras | Komplexitas |
| --- | --- | --- | --- |
| **Interakcio lista** | `/interactions` | `page-interactions.html` + `admin-interactions.js` (41KB) | **Nagy** - tabla, szurok, reszletes modal |
| **Ugyfel lista** | `/clients` | `page-interactions.html` (kozos) + `admin-customers.js` (112KB) | **Nagyon nagy** - CRUD, profil, tagging |
| **Kanban** | `/kanban` | `page-interactions.html` (kozos) + `admin-kanban.js` (75KB) | **Nagyon nagy** - drag-n-drop, oszlopok, kartyak |
| **Naptar** | `/calendar` | `page-calendar.html` + `admin-calendar.js` (18KB) | **Kozep** - FullCalendar integr., esemenyek |
| **Kimeno kommunikacio** | `/outbound` | `page-outbound.html` + `admin-outbound.js` (87KB) | **Nagyon nagy** - kampanyok, wizard, sablon szerk. |
| **Tudastar** | `/settings/*` | `page-settings.html` (89KB) + `admin-settings.js` (47KB) | **Nagyon nagy** - agent, praxis, szabalyok, csapat |
| **Jovahagyo** | (nincs meg route) | `page-approvals.html` + `admin-customers.js` (reszben) | **Kozep** - email jovahagyas/elutasitas |
| **Beallitasok** | `/beallitasok` | `page-beallitasok.html` | **Kicsi** - user profil beallitasok |
| **Hivasok** | (nincs meg route) | `page-calls.html` + `admin-core.js` (startCall) | **Kicsi** - SIP hivas inditasa |

---

## CSS stratégia

A CSS fajlokat **1:1 atemeltuk** a legacy projektbol a `src/styles/` mappaba.  
**NEM iródnak at** CSS module-ra vagy styled-components-re -- a CSS class neveket a React JSX-ben `className`-kent hasznaljuk.

**Fontos konvenciok:**
- A legacy CSS `#page-analytics`, `#page-help`, stb. selectorokat hasznal. A React oldalak megtartjak ezeket az id-kat: `<div className="page active" id="page-analytics">`.
- Dark mode: minden `body.dark` scope-olt override a `dark-mode.css`-ben van.
- A `variables.css` definialja a CSS custom property-ket: `--text`, `--bg`, `--card`, `--border`, `--accent`, stb.
- Layout: `#app` flexbox (sor iranyú), sidebar + main content. A `display: flex` a `layout.css`-bol jon, **NE** irjuk felul inline style-lal.

---

## Konvenciók és szabályok

### TypeScript
- Strict mode. Minden page/component `.tsx`.
- Interfacek a page fajl elejen, a komponens felett.
- API response-okhoz mindig definiald az interfacet.

### Magyar nyelv az UI-ban
- **Kotelazo az ekezetek hasznalata** minden felhasznalonak lathato szovegben. Pl. "Foglalássá vált", NE "Foglalassa valt".
- Valtozo- es fuggvenynevekben megengedett az ekezetmentes forma (pl. `osszes_relevans`), mert azok az API mező nevek.

### Chart.js
- A `chart.js` es `react-chartjs-2` van hasznalva.
- **Y tengely skala logika** (AnalyticsPage): `yMax = Math.ceil(maxVal * 1.25)`, `yStep = Math.max(1, Math.ceil(yMax / 6))`, minimum baseline 5. Ez az eredeti `admin-analytics.js` logika 1:1 masolata.
- Grid vonalak: light mode `borderDash: [5, 5]`, dark mode `borderDash: []` (solid).
- Szin paletta: `typeColors = ['#3b82f6', '#1ceee0', '#22c55e', '#8b5cf6', '#f59e0b', '#f97316']`.

### Migracios szabaly
- **1:1 vizualis es funkcionalis paritast kell tartani** a legacy verzióval. Ne "egyszerusitsd" vagy "modernizald" a kinezetet -- pontosan ugy kell kinezni es viselkedni, mint az eredeti.
- Minden inline `onmouseenter`/`onmouseleave` -> React `onMouseEnter`/`onMouseLeave` prop.
- Legacy `onclick="globalFunction()"` -> React state + callback.
- Legacy DOM manipulation (`document.getElementById`, `innerHTML`) -> React state + JSX.

---

## Új oldal migrációjának lépései

Kovesd ezt a checklistet, amikor egy uj oldalt migralsz:

### 1. Forras audit
- [ ] Olvasd el a legacy HTML partial-t: `partials/page-{name}.html`
- [ ] Olvasd el a kapcsolodo JS fajlt: `js/admin-{name}.js`
- [ ] Jegyezd fel az API endpointokat, amiket hiv
- [ ] Jegyezd fel a globalis fuggvenyeket, amiket hasznal (pl. `authFetch`, `showToast`, `esc`, `fmtDt`)

### 2. React page letrehozasa
- [ ] Hozd letre: `src/pages/{Name}Page.tsx`
- [ ] Definiald a TypeScript interfaceket az API response-okhoz
- [ ] A gyoker div: `<div className="page active" id="page-{id}">`
- [ ] Hasznald az `authFetch`-et az `src/api/client.ts`-bol
- [ ] Az `useAuth()` hook-ot a role-alapu megjelenitmenyhez

### 3. Route beallítása
- [ ] Add hozza a route-ot az `App.tsx`-ben (basename-relativ path!)
- [ ] Importald a page komponenst
- [ ] Csereld ki a `PlaceholderPage`-et a valos komponensre
- [ ] Ha sidebar link kell, ellenorizd, hogy a `Sidebar.tsx` NAV_ITEMS-ben a path basename-relativ (`/help`, NEM `/admin/help`)

### 4. Verifikacio
- [ ] `npx tsc --noEmit` -- 0 TypeScript hiba
- [ ] Vizualis osszehasonlitas a legacy verzioval (same browser, same data)
- [ ] Dark mode teszteles
- [ ] Sidebar collapse allapotban is nez jol
- [ ] Magyar ekezetek ellenorzese minden lathato szovegben

---

## Ismert buktatók

### 1. Routing basename
A `BrowserRouter basename="/admin"` miatt minden `navigate()` es `<Link to>` basename-relativ.  
**SOHA ne hasznald a `/admin/` prefixet** a navigate() hivasokban vagy a NAV_ITEMS path-okban.

### 2. Inline styles vs CSS class
A legacy kod sokat hasznal inline style-t a HTML-ben. Ezeket JSX inline style-ra kell konvertalni (`style={{ ... }}`), de a CSS classok is mukodnek, ha a megfelelo CSS fajl importalva van az `App.tsx`-ben.

### 3. Dark mode erzekeles renderben
Az `AnalyticsPage` a `document.body.classList.contains('dark')`-ot használja a renderben chart szinek meghatarozasara. Ez NEM reaktiv -- ha a user atkapcsol dark/light moddba, a chartek nem frissulnek automatikusan. Hosszu tavon ezt `useTheme()` hook-kal kellene megoldani es a chart config-ot memo-zni.

### 4. CSS #page-* selectorok
A legacy CSS sok helyen `#page-analytics .severity-card` tipusu selectorokat hasznal. Ha a React komponens nem teszi ki a megfelelo `id`-t a gyoker diven, a stylok nem fognak erdvenyre jutni.

### 5. `esc()` fuggveny
A legacy JS-ben a `esc()` fuggveny HTML entity escape-et csinal. A React-ban ez alig kell, mert a JSX automatikusan escape-eli a szovegeket. Csak `dangerouslySetInnerHTML` hasznalatakor szukseges (pl. FAQ valaszok, amik `<b>` tageket tartalmaznak).

### 6. Outbound zero-case
Amikor nincs outbound adat (`obTotal === 0`), az eredeti JS demo ertekeket mutat a funnel-ben (72%, 60%, 52% konverzio). Ezt a React verzio is reprodukalja. Ne egyszerusitsd el 0%-okra.

---

## Legacy forrásfájlok helye

A legacy (meg nem migralt) forrasok referenciakent itt talalhatoak:

```
thinkai-voice-agent/
├── partials/          # HTML partialok (Jinja2 template-ek)
│   ├── page-analytics.html
│   ├── page-interactions.html
│   ├── page-calendar.html
│   ├── page-outbound.html
│   ├── page-settings.html
│   ├── page-help.html
│   └── ...
├── js/                # Legacy vanilla JavaScript
│   ├── admin-core.js         # Auth, nav, sidebar, help FAQ, toast, alerts
│   ├── admin-analytics.js    # KPI, chartok, funnel rendereles
│   ├── admin-interactions.js # Interakcios tabla, szurok
│   ├── admin-customers.js    # Ugyfel CRUD, profil, jovahagyas
│   ├── admin-kanban.js       # Kanban tabla, drag-n-drop
│   ├── admin-calendar.js     # FullCalendar, esemenyek
│   ├── admin-outbound.js     # Kampany wizard, sablonok
│   ├── admin-settings.js     # Agent, praxis, szabalyok, csapat
│   └── admin-urgent.js       # Surgos ugyek kezelese
└── static/css/        # Legacy CSS (ezeket atemeltuk src/styles/-ba)
```

---

## Hasznos parancsok

```bash
# TypeScript ellenorzes (mindig futtasd migracio utan)
npx tsc --noEmit

# Dev szerver
npm run dev

# Ekezet-ellenorzes (PowerShell) -- gyanús szavak keresése a .tsx fajlokban
# Select-String -Path "src\pages\*.tsx" -Pattern "Osszes|elozo|betoltes|arany|konverzio" -CaseSensitive
```
