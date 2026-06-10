# Fél 3 -- Tudástár & Beállítások migráció

## Áttekintés

A Tudástár (agent konfig, céginformációk, szabályok, csapatkezelés), Beállítások és Jóváhagyások migrálása React + Vite + TypeScript-re.
**Fontos**: az olvasás közvetlenül Supabase JS klienssel történik. Az írás (beállítások mentése) `authFetch` POST/PUT marad a FastAPI felé, mert az validálja és feldolgozza az adatokat.

## Architekturális irányelv

```
React frontend  --olvasás-->  Supabase (közvetlen)
React frontend  --írás--->   FastAPI (beállítások mentése, validáció)
FastAPI backend --írás--->    Supabase
```

Ennél a félnél a FastAPI-nak van beolvasó szerepe is: a beállítások oldalak konfigurációt olvasnak amit a FastAPI használ futásidőben (agent prompt, triage szabályok, stb.). Ezért itt **a beállítások olvasása is mehet Supabase-ből közvetlenül**, de az **írás mindenképp FastAPI-n keresztül** kell menjen, hogy a backend frissítse a saját cache-jét.

---

## Feladatok

### 1. SettingsPage (`/settings/*`)
Ez a legnagyobb és legösszetettebb oldal -- 4 al-tab:

#### 1a. Telefon / Agent (`/settings/agent`)
- [ ] Legacy forrás:
  - HTML: `partials/page-settings.html` (89KB) -- agent szekció
  - JS: `js/admin-settings.js` (47KB) -- `initAgentSettings()`
- [ ] Supabase olvasás:
  - Agent konfiguráció (prompt, voice, nyelv)
  - `supabase.from('services').select('*')` -- szolgáltatások listája
  - `supabase.from('doctors').select('*')` -- orvosok/munkatársak
- [ ] React komponensek:
  - `AgentSettingsTab.tsx` -- prompt szerkesztő, hang beállítások
  - `ServicesManager.tsx` -- szolgáltatások CRUD
  - `DoctorsManager.tsx` -- orvosok/munkatársak CRUD
- [ ] Írás: `authFetch` POST/PUT (FastAPI validálja és alkalmazza)

#### 1b. Céginformációk (`/settings/praxis`)
- [ ] Supabase olvasás:
  - `supabase.from('clinics').select('*')` -- klinikák/telephelyek
- [ ] React komponensek:
  - `PraxisSettingsTab.tsx` -- cégnév, cím, nyitvatartás, telephelyek
- [ ] Írás: `authFetch` POST/PUT

#### 1c. Szabályok (`/settings/szabalyok`)
- [ ] Supabase olvasás:
  - `supabase.from('triage_rules').select('*')` -- triage/irányítási szabályok
  - `supabase.from('client_fields').select('*')` -- egyéni mezők definíciók
- [ ] React komponensek:
  - `RulesSettingsTab.tsx` -- szabályok listája, szerkesztő
  - `TriageRuleEditor.tsx` -- egy szabály szerkesztése
  - `CustomFieldsManager.tsx` -- egyéni mezők kezelése
- [ ] Írás: `authFetch` POST/PUT

#### 1d. Csapatkezelés (admin-only tab)
- [ ] Supabase olvasás:
  - `supabase.from('admin_users').select('id, username, email, role, full_name, last_login')`
  - **NE olvasd a password_hash mezőt!** Select explicit oszlopokkal.
- [ ] React komponensek:
  - `TeamSettingsTab.tsx` -- felhasználók listája, meghívás, role változtatás
  - `InviteUserModal.tsx` -- új felhasználó meghívás
- [ ] Írás: `authFetch` POST/PUT/DELETE (admin-only endpoint-ok)
- [ ] Role-alapú megjelenítés: csak admin látja

#### Összefogás
- [ ] `SettingsPage.tsx` -- tab navigáció a 4 al-oldal között
- [ ] Route: `<Route path="settings/*" element={<SettingsPage />} />`
  - Nested routes: `agent`, `praxis`, `szabalyok`, `team`

### 2. BeallitasokPage (`/beallitasok`)
- [ ] Legacy forrás:
  - HTML: `partials/page-beallitasok.html` (9KB)
- [ ] Ez a user saját profil beállításai (nem admin!)
- [ ] React komponensek:
  - `BeallitasokPage.tsx` -- jelszó változtatás, email, megjelenítési név
- [ ] Supabase olvasás: a saját user rekord
- [ ] Írás: `authFetch` PUT (jelszó hash-elés szerver-oldalon)
- [ ] Route: `<Route path="beallitasok" element={<BeallitasokPage />} />`

### 3. ApprovalsPage (új route: `/approvals`)
- [ ] Legacy forrás:
  - HTML: `partials/page-approvals.html` (10KB)
  - JS: `js/admin-customers.js` (részben)
- [ ] Supabase olvasás:
  - Interakciók ahol `needs_approval = true` vagy hasonló flag
  - `supabase.from('interactions').select('*').eq('needs_approval', true)`
- [ ] React komponensek:
  - `ApprovalsPage.tsx` -- jóváhagyásra váró email piszkozatok listája
  - `ApprovalCard.tsx` -- egy jóváhagyási kártya (előnézet, elfogad/elutasít)
- [ ] Írás (jóváhagyás/elutasítás): `authFetch` POST (FastAPI küldi az emailt)
- [ ] Route + Sidebar: adminOnly

---

## Supabase táblák (olvasás)

| Tábla | Használó oldal | Megjegyzés |
| --- | --- | --- |
| `services` | Settings/Agent | szolgáltatások listája |
| `doctors` | Settings/Agent | orvosok/munkatársak |
| `clinics` | Settings/Praxis | telephelyek |
| `triage_rules` | Settings/Szabályok | irányítási szabályok |
| `client_fields` | Settings/Szabályok | egyéni mező definíciók |
| `admin_users` | Settings/Csapat, Beállítások | **password_hash NÉLKÜL!** |
| `interactions` | Jóváhagyások | needs_approval szűrővel |

## RLS policy-k

```sql
-- admin_users: csak meghatározott oszlopok olvashatók
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read safe columns" ON admin_users
  FOR SELECT USING (true);
-- FONTOS: hozz létre egy VIEW-t ami kizárja a password_hash-t,
-- és a frontend azt olvassa!

CREATE VIEW admin_users_safe AS
SELECT id, username, email, role, full_name, last_login, created_at
FROM admin_users;
```

## Konvenciók

- Olvasd el a `README.md`-t -- minden konvenció ott van
- Magyar ékezetek kötelezőek
- 1:1 vizuális paritás a legacy verzióval
- Settings tab-ok között animált váltás (ha a legacy-ben volt)
- Admin-only tartalom: `useAuth()` -> `isAdmin` / `isAdminOnly` check
- `npx tsc --noEmit` -- 0 hiba
