# Zombo Audit Rendszer — Állapotjelentés és TODO

**Dátum:** 2026-07-03
**Készítette:** Antigravity AI

## 📊 Helyzetjelentés

A Zombo Audit egy kiforrott, komplex rendszer, amely sikeresen integrálja a több-ágenses AI elemzést a vizuális tartalomgenerálással. A rendszer képes egy weboldalból kinyerni a márka DNS-ét, és abból azonnal publikálható marketing anyagokat generálni.

### Főbb eredmények:
- **4-pilléres dokumentáció**: Létrejött a `dokumentZ` mappa alatt a teljes SDD, TSD és glosszárium.
- **Funkcionális integritás**: Az audit folyamat (SEO, Visual, Content, Marketing) modulárisan felépített és kategóriánként is futtatható.
- **Vizuális konzisztencia**: A Playwright alapú újrarenderelés lehetővé teszi a szöveghibák javítását a generált képeken a stílus megőrzése mellett.

---

## 🛑 Jelenlegi Problémák (Kockázatok)

1. **Óriáskomponens (Technical Debt)**: A `ZomboAuditPage.tsx` fájl hossza meghaladja a 2600 sort. Ez rendkívül nehéz karbantarthatóságot, lassabb fejlesztést és magasabb hibaarányt eredményez.
2. **SessionStorage korlátok**: A nagy audit eredmények `sessionStorage`-ben való tárolása bizonytalan (5MB limit). Egy komplex audit JSON-ja könnyen elérheti ezt a határt, ami adatvesztéshez vezethet.
3. **Globális State hatások**: A sötét mód (dark mode) kényszerítése a `body`-n keresztül `useEffect`-ben globálisan módosítja az alkalmazás megjelenését, ami navigációkor villódzást vagy más oldalakon stílusbeli hibákat okozhat.
4. **Szétszórt API hívások**: A komponensen belül több helyen közvetlen `fetch` hívások vannak, ahelyett, hogy egységes API szolgáltatást használnának.
5. **Hardkódolt URL-ek**: Néhány helyen (pl. `handleUpdateText`, `handleExtractBrandKit`) fixen szerepel a `http://localhost:3001`, ami deployment esetén hibát okoz.

---

## ✅ TODO Lista (Javasolt feladatok)

### Sürgős (P0)
- [ ] **Refaktorálás**: A `ZomboAuditPage.tsx` felosztása kisebb komponensekre (pl. `AuditHeader`, `AuditResults`, `GenerationPanel`).
- [ ] **API Service**: Egységes API wrapper létrehozása a `/marketing/api/zombo` és a `localhost:3001` hívásokhoz.
- [ ] **Környezeti változók**: A hardkódolt backend URL-ek cseréje a `getBackendUrl()` helperre vagy `.env` változókra.

### Fontos (P1)
- [ ] **State Management**: A komplex állapotkezelés (progress, results, loading states) áthelyezése egy `useZomboAudit` custom hookba vagy egy reducerbe.
- [ ] **Hibatűrés**: Robusztusabb hibaüzenetek a Playwright renderelési hibák esetén.
- [ ] **Adattárolás**: A `sessionStorage` kiváltása vagy kiegészítése egy IndexedDB alapú tárolóval a nagy audit adatokhoz.

### Fejlesztési javaslat (P2)
- [ ] **Export funkció**: Az audit eredmények PDF vagy JSON formátumban való letöltésének lehetősége.
- [ ] **Sablonkezelés**: Új vizuális sablonok (template-ek) dinamikus hozzáadása a Image Lab-hez.
