# Zombo Audit: Kép és Layer Szerkesztő Dokumentáció

Ez a dokumentum a Zombo Audit rendszer kép- és rétegszerkesztő moduljának (Image & Layer Editor) felépítését és működését részletezi.

## 1. Rendszer Architektúra

A rendszer alapvetően két fő kísérleti labort (Test Lab) tartalmaz, amelyek különböző megközelítést alkalmaznak a kreatívok létrehozására:

- **Image Test Lab**: Képgenerálás-fókuszú, ahol a Flux modellekkel generált képekre helyezhetünk el manuálisan vagy sablonok segítségével rétegeket.
- **Overlay Test Lab**: Layout-fókuszú, ahol AI (Claude 3.5) tervezi meg a teljes elrendezést egy szöveges brief alapján.

### Fájlstruktúra és szerepkörök

- `ZomboAuditPage.tsx`: A főoldal, amely összefogja a tabokat és kezeli a globális állapotot (Brand Kit, generált kreatívok).
- [ImageTestLab.tsx](file:///c:/Users/Zombo/Desktop/Antigrav/agentmain_digidesk/agent-main/thinkai-voice-agent/eaisydesk-frontend/src/pages/marketing/zombo/components/ImageTestLab.tsx): Interaktív képszerkesztő és generáló felület.
- [OverlayTestLab.tsx](file:///c:/Users/Zombo/Desktop/Antigrav/agentmain_digidesk/agent-main/thinkai-voice-agent/eaisydesk-frontend/src/pages/marketing/zombo/components/OverlayTestLab.tsx): AI-vezérelt layout generáló és finomhangoló felület.
- [layerTemplates.ts](file:///c:/Users/Zombo/Desktop/Antigrav/agentmain_digidesk/agent-main/thinkai-voice-agent/eaisydesk-frontend/src/pages/marketing/zombo/layerTemplates.ts): 45+ előre definiált elrendezés-sablon gyűjteménye.
- [layerNormalizer.ts](file:///c:/Users/Zombo/Desktop/Antigrav/agentmain_digidesk/agent-main/thinkai-voice-agent/eaisydesk-frontend/src/pages/marketing/zombo/layerNormalizer.ts): Logikai réteg, amely automatikusan korrigálja a méreteket, kontrasztot és igazításokat.
- [ImageSlotUploader.tsx](file:///c:/Users/Zombo/Desktop/Antigrav/agentmain_digidesk/agent-main/thinkai-voice-agent/eaisydesk-frontend/src/pages/marketing/zombo/components/ImageSlotUploader.tsx): Több kép (termék + környezet) feltöltését kezelő komponens a kompozit generáláshoz.
- [types.ts](file:///c:/Users/Zombo/Desktop/Antigrav/agentmain_digidesk/agent-main/thinkai-voice-agent/eaisydesk-frontend/src/pages/marketing/zombo/types.ts): Közös interfészek (LayerChild, LayerLayout, BrandKit).

---

## 2. Image Test Lab

Az Image Test Lab a "hagyományosabb" szerkesztési folyamatot támogatja, kiegészítve AI képességekkel.

### Főbb funkciók:
- **Vizuális Stratégia**: Az audit eredményeiből automatikusan kinyer egy vizuális irányelvet (stílus, megvilágítás, hangulat).
- **Kompozit Generálás**: Képes egy feltöltött termékfotót természetes módon beilleszteni egy generált jelenetbe (Composite Flux Flex).
- **Interaktív Vászon**:
  - Drag-and-drop mozgatás.
  - Átméretezés (jobb, alsó és sarok fogantyúkkal).
  - Szövegek közvetlen szerkesztése dupla kattintással.
- **Sablonkezelés**: A `layerTemplates.ts`-ből betöltött 45 sablon egy kattintással alkalmazható a generált képre.
- **AI Rétegek**: A kép elemzése után az AI képes releváns szöveges és grafikai rétegeket javasolni és elhelyezni.

---

## 3. Overlay Test Lab

Ez a modul a "Brief-to-Creative" folyamatot valósítja meg, ahol a hangsúly az elrendezésen és a tipográfián van.

### A generálási pipeline:
1. **Orchestration (Claude 3.5 Sonnet)**: A brief alapján megtervezi a rétegek geometriáját, kiválasztja az archetípust és kitölti a szöveges slotokat.
2. **Asset Resolution**: Feloldja a képi forrásokat (háttérgenerálás vagy stock képek) és kiszámítja a duotone szűrőket.
3. **Headless Rendering**: A Playwright segítségével lerendereli a PolotnoJSON-t és végleges képet készít.

### Speciális vizuális effektek:
- **Duotone Szűrők**: Két szín alapú SVG mátrix szűrő a képek háttérbe simulásához.
- **Prémium Keretek és Árnyékok**: Speciális CSS-alapú vizuális rétegek a prémium hatás érdekében.
- **Raw JSON Szerkesztés**: Lehetőség van a teljes elrendezési JSON közvetlen módosítására.

---

## 4. Sablon Rendszer (`layerTemplates.ts`)

A sablonok nem csak egyszerű elrendezések, hanem metaadatokkal ellátott intelligens objektumok:
- **Metaadatok**: `bestFor` (mire ajánlott), `avoidFor` (kerülendő esetek), `aiHint` (tipp az AI-nak).
- **Zónák**: Meghatározza a szöveg helyét (`textZone`) és a termék biztonsági zónáját (`productSafeZone`).
- **Típusok**: Külön sablonok vannak akciókhoz, webinárokhoz, ingatlanhirdetésekhez, étlapokhoz stb.

---

## 5. Automatikus Normalizálás (`layerNormalizer.ts`)

A rendszer determinisztikus szabályokat alkalmaz a layoutok javítására:
- **Betűméret skálázás**: Ha a szöveg túl hosszú, automatikusan csökkenti a méretet a kereten belül.
- **Panel méretezés**: A szöveg mögötti téglalapok automatikusan nőnek a tartalommal.
- **Kontraszt javítás**: Világos háttér és fehér szöveg esetén automatikusan erős árnyékot (`textShadow`) ad hozzá a generáláskor.
- **Pill-alakú gombok**: A CTA gomboknál kényszeríti a megfelelő lekerekítést a magasság függvényében.
- **Canvas Clamping**: Megakadályozza, hogy a rétegek lelógjanak a vászonról.

---

## 6. Összegzés és Nyitott Kérdések

A rendszer jelenleg rendkívül rugalmas, lehetővé téve mind a teljesen manuális, mind a teljesen automatizált kreatív gyártást.

### Kérdések a tisztázáshoz:
- Van-e olyan specifikus rész a szerkesztőben (pl. egy konkrét sablon viselkedése vagy a duotone szűrők paraméterezése), amit mélyebben is át kellene alakítanunk?
- A rétegek mozgatásánál/szerkesztésénél tapasztaltál-e bármilyen nehézséget a jelenlegi implementációban?
