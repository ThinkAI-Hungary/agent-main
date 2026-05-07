# DigiDesk Voice Agent - Teljes Funkcióleírás és Felhasználói Kézikönyv

A DigiDesk Voice Agent egy intelligens, mesterséges intelligenciával (AI) működő virtuális asszisztens és egy hozzá kapcsolódó adminisztrációs felület. A rendszer képes emberi hangon, természetes nyelven kommunikálni az ügyfelekkel, időpontokat foglalni, kérdésekre válaszolni és automatizált e-maileket küldeni.

Ez a dokumentum a program összes funkcióját részletezi, illetve egy lépésről-lépésre haladó útmutatót biztosít az admin felület mindennapi használatához.

---

## 1. Teljes Funkcióleírás

A rendszer két fő komponensből áll: a **Hangalapú Asszisztensből** (amellyel az ügyfelek találkoznak) és az **Admin Dashboardból** (amelyet a belső munkatársak használnak).

### Hangalapú Asszisztens (AI Agent) Funkciói:
*   **Természetes kommunikáció:** A hívókkal valós időben, magyar (vagy angol) nyelven beszélget, felismeri a szándékukat, és empatikusan válaszol.
*   **Időpontfoglalás:** Képes szabad időpontokat keresni és a hívó számára találkozót/vizsgálatot rögzíteni a naptárba.
*   **E-mail küldés és utánkövetés:** Beszélgetés után képes összefoglaló vagy tájékoztató e-maileket megfogalmazni (pl. árajánlat, részletes információk). Ezeket emberi jóváhagyásra küldi az admin felületre.
*   **Automatikus emlékeztetők és lemondás:** A rendszer e-mail emlékeztetőket küld a lefoglalt időpontokról, amelyekben egy gombnyomással le is mondható az időpont. A lemondás azonnal frissíti a naptárat.
*   **Triage (Kategorizálás):** A hívásokat tartalmuk alapján automatikusan kategorizálja (pl. Általános, Sürgős, Kiemelt). A "Sürgős" eseteket azonnal kiemeli az admin felületen.
*   **Tudásbázis integráció:** Válaszol a cég szolgáltatásaival, áraival és folyamataival kapcsolatos kérdésekre a beállított tudástár alapján.

### Admin Dashboard (Vezérlőpult) Funkciói:
Az adminisztrációs felület 5 fő nézetből áll:

1.  **Analitika:** Átfogó statisztikák a hívásokról (hívások száma, átlagos hossz, konverziós arány, sürgős esetek). Tartalmaz tölcsér (funnel) diagramokat és trendeket.
2.  **Interakciók (Hívásnapló):** Az összes lezajlott hívás listája. Itt visszahallgathatók vagy elolvashatók a beszélgetések leiratai (transcript), láthatók a hívó adatai, és szűrni lehet sürgős vagy kiemelt esetekre.
3.  **Teendők / Kanban (E-mail jóváhagyás):** Az AI által megírt e-mail piszkozatok itt jelennek meg. A munkatársak ellenőrizhetik, szerkeszthetik, majd egy gombnyomással kiküldhetik őket, vagy el is utasíthatják.
4.  **Naptár:** Vizuális áttekintés a lefoglalt időpontokról. Itt jelennek meg az AI által rögzített találkozók.
5.  **Tudástár / Beállítások:** Itt módosíthatók a cég adatai, a szolgáltatások leírásai és az AI alapvető viselkedési szabályai. Ebből az adatbázisból dolgozik az asszisztens.

---

## 2. Step-by-Step Használati Útmutató (Felhasználóknak)

A mindennapi munkavégzés során a következőképpen érdemes használni a rendszert:

### A. Napi rutin indítása és áttekintés (Analitika)
1.  **Bejelentkezés:** Nyisd meg az adminisztrációs linket (pl. `localhost:8000/admin`), és jelentkezz be a hitelesítő adatokkal.
2.  **Áttekintés:** A főoldalon (Analitika) ellenőrizd a **Sürgős esetek** kártyát. Ha itt új, kezeletlen esetet látsz, azt prioritásként kell kezelni.
3.  **Trendek:** Fusd át a statisztikákat, hogy lásd a napi hívásforgalmat és a sikeres konverziókat (foglalásokat).

### B. Bejövő hívások kezelése (Interakciók nézet)
Ide akkor kell jönnöd, ha egy adott ügyfél hívására vagy kíváncsi, vagy ellenőrizni kell egy sürgős esetet.
1.  Kattints a bal oldali menüben az **Interakciók** gombra.
2.  A listában a legújabb hívások vannak legelöl. 
3.  **Szűrés:** Használd a fenti szűrőket (pl. "Csak Sürgős" vagy "Kiemelt"), hogy megtaláld a problémás eseteket.
4.  **Részletek:** Kattints a hívás sorában a **"Részletek"** (szem ikon) gombra. Itt elolvashatod a pontos beszélgetést az AI és az ügyfél között, és láthatod a kinyert adatokat (név, telefonszám, e-mail).
5.  Ha egy sürgős esetet elolvastál és intézkedtél, a rendszer automatikusan vagy manuálisan kezeltnek veszi, így tudod, hogy kivel kell még foglalkozni.

### C. AI által írt E-mailek kiküldése (Teendők / Kanban nézet)
Amikor az AI megígéri a hívónak, hogy küld egy e-mailt (pl. tájékoztatót vagy árajánlatot), az nem megy ki automatikusan, hanem a te jóváhagyásodra vár.
1.  Kattints a bal oldali menüben a **Teendők** (vagy Kanban) pontra.
2.  Itt egy oszlopos elrendezést látsz. A bal oldali oszlopban (**"Jóváhagyásra vár"**) találod a kiküldendő e-maileket.
3.  Kattints egy kártyára a részletek megnyitásához.
4.  **Ellenőrzés és szerkesztés:** Olvasd el az e-mail szövegét. Ha az AI hibázott vagy kiegészítenéd valamivel, egyszerűen kattints a szövegdobozba, és írd át.
5.  **Jóváhagyás:** Ha rendben van a szöveg, kattints a **"Jóváhagyás és Küldés"** gombra. Az e-mail azonnal elmegy az ügyfélnek, a kártya pedig átkerül az "Elküldve" oszlopba.
6.  **Elutasítás:** Ha a hívás alapján mégsem kell e-mailt küldeni, kattints az "Elutasítás" gombra (kuka ikon).

### D. Naptár és Foglalások ellenőrzése
1.  Kattints a **Naptár** menüpontra a bal oldali sávban.
2.  Itt láthatod heti vagy havi nézetben az összes időpontot, amit az AI rögzített.
3.  Kattints egy eseményre a részletekért (ügyfél neve, elérhetőségei).
4.  *(Megjegyzés: Ha az ügyfél egy automatikus e-mailből rákattint a "Lemondás" gombra, az esemény automatikusan eltűnik ebből a naptárból).*

### E. A Rendszer tanítása (Tudástár / Beállítások)
Ha változnak az árak, új szolgáltatás indul, vagy módosítani kell, hogy az AI hogyan beszéljen, itt teheted meg.
1.  Kattints a **Tudástár / Beállítások** menüpontra.
2.  Keresd meg a módosítani kívánt szekciót (pl. "Céginformációk", "Szolgáltatások" vagy "Árak").
3.  Írd át a szöveget a megfelelő mezőben. Fogalmazz egyszerűen és egyértelműen, mert az AI szó szerint ezt fogja felhasználni a válaszaiban.
4.  Görgess az oldal aljára, és kattints a **Mentés** gombra.
5.  A módosítás azonnal életbe lép, a következő hívásnál az AI már az új információkat fogja mondani.

---

### Gyakori kérdések (FAQ) és Hibaelhárítás

*   **Mi történik, ha egy ügyfél lemondja az időpontot?** 
    Az ügyfél az e-mailben kapott linkre kattintva mondhatja le az időpontot. Ekkor a naptárból azonnal törlődik az esemény, az Interakciók listájában pedig megjelenik a "Lemondott" címke a hívásánál. Nincs további teendőd.
*   **Hol látom, ha az AI nem értett meg valamit?**
    Az *Interakciók* menüben olvasd el a beszélgetés leiratát (Transcript). Ha az AI elakadt, azt onnan látni fogod. Ilyenkor érdemes lehet a *Tudástárban* egyértelműsíteni a kérdéses információt.
*   **Sötét mód bekapcsolása:**
    A bal oldali menü alján található "Sötét mód" (Hold ikon) gombbal válthatsz a világos és sötét téma között, ahogy a szemednek kényelmesebb.
