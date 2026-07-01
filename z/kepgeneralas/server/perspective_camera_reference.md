# Perspektíva és Kameraállás — Referencia és JSON Minta (v2.1)

> **Célja:** Ezt a dokumentumot használja a rendszer a `/api/image/analyze` fázisban
> a feltöltött, háttér nélkül körülvágott termékképből a perspektíva és kameraállás
> fizikai paramétereinek automatikus kinyeréséhez.
>
> **FONTOS:** A mérési módszerek BÁRMILYEN termékosztályra érvényesek —
> vödör, palack, doboz, cipő, elektronika, élelmiszer, szerszám, ékszer, stb.
> A vödör csupán ILLUSZTRÁCIÓ. Lásd: Fejezet 14 a perspective_camera_book.md-ben.
>
> **v2.1 változások:** Termékosztály-általánosítás — mérési alkalmazhatóság mátrix,
> shape-specific JSON blokkok, objectShapeClass döntési fa.

---

## Termékosztály Alkalmazhatóság — Mérési Mátrix

> A mérési módszerek nem egyformán alkalmazhatók minden terméktípusnál.
> Az alábbi táblázat mutatja, melyik mérés melyik osztálynál megbízható.

| Mérési módszer | cylindrical | rectangular | bottle | flat_planar | irregular |
|---|---|---|---|---|---|
| **topEllipse** | ✅ | ❌ | ✅ | ❌ | ⚠️ |
| **bottomEllipse** | ✅ Best | ❌ | ✅ | ❌ | ⚠️ |
| **topFaceQuad** | ❌ | ✅ Best | ❌ | ✅ | ❌ |
| **verticalEdgeConvergence** | ✅ | ✅ Best | ✅ | ❌ | ⚠️ |
| **footEdgeShape** | ✅ | ✅ | ✅ | ✅ Best | ⚠️ |
| **handleArc** | ⚠️ only if handle | ❌ | ❌ | ❌ | ❌ |
| **labelForeshortening** | ✅ | ✅ Best | ✅ | ✅ | ⚠️ |
| **barrelDistortion** | ✅ | ✅ Best | ✅ | ✅ Best | ❌ |
| **pixelFillRatio** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **shadowRemnants** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **verticalTiltDeg** | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |

**Jelmagyarázat:** ✅ Megbízható | ⚠️ Feltételes | ❌ Nem alkalmazható

---

## Teljes mérési lista — mit lehet kinyerni a körbevágott képből?

### CSOPORT A — Elevation (phi) — 5 független forrásból cross-validálható

#### A1. Tetőellipszis (topEllipse)
- `ratio = b / a` (kisebb / nagyobb tengely) → `phi = arcsin(ratio)`
- **Pontosság:** közepes — fedél pereme takarhat

#### A2. Aljellipszis (bottomEllipse) ← ÚJ v2.0
- Ugyanaz, de a tárgy ALJÁN mérve — jellemzően TISZTÁBB, nincs fedél-takarás
- `phi_A2 = arcsin(b_bottom / a_bottom)`
- **Keresztellenőrzés:** `phi_A1` és `phi_A2` tolerancia ±3°; ha eltérnek → lens distortion gyanú

#### A3. Vertikális oldalél konvergencia (verticalEdgeConvergence) ← ÚJ v2.0
- Felülnézetnél (phi > 0°) a tárgy oldalsó egyenes élei ENYHEN ÖSSZEFUTNAK LEFELÉ (3VP)
- `convergence_ratio = top_edge_width_px / bottom_edge_width_px`
- Ha > 1.0: a tárgy teteje szélesebb a talpánál → kamera felülről néz
- `phi_A3 = arctan((top_w - bottom_w) / 2 / height_px) * 180/pi`
- **Pontosság:** jó — hosszú egyenes élek, könnyen mérhető

#### A4. Talpél forma (footEdgeShape) ← ÚJ v2.0
- A tárgy aljának kontúrja: ha EGYENES vonal → phi ≈ 0°; ha ELLIPTIKUS ív → phi > 0°
- `phi_A4 = arcsin(foot_ellipse_b / foot_ellipse_a)` — negyedik független phi mérés
- **Pontosság:** közepes — rembg néha levágja a talp szélét

#### A5. Fogantyú-arc ellipszise (handleArc) ← ÚJ v2.0
- Vödörnél a fogantyú fizikailag FÉLKÖR ív. Látszó aránya: `arc_h / arc_w = cos(phi)`
- `phi_A5 = arccos(arc_height_px / arc_width_px)`
- Ötödik, geometriailag FÜGGETLEN mérés
- **Pontosság:** változó — csak fogantyús terméknél alkalmazható

---

### CSOPORT B — Azimuth (psi) — 3 forrásból

#### B1. Oldalnézet láthatósága (sideViewVisibility)
- Ha csak elülső felület látható → psi ≈ 0°; kis oldalnézet → psi = 5-20°
- **Pontosság:** gyenge — szubjektív becslés

#### B2. Label foreshortening ← ÚJ v2.0
- A felirat ismert arányú TÉGLALAP. Látszó szélessége: `apparent = real * cos(psi)`
- `psi_B2 = arccos(label_apparent_width / label_expected_full_width)`
- **Pontosság:** jó — ha a felirat határa jól látható

#### B3. Ellipszis középpont eltolódása (ellipseAxisOffset) ← ÚJ v2.0
- Ha a hengerfelső ellipszis középpontja NEM esik a tárgy szimmetriatengelyére
  → a henger el van fordulva → psi > 0°
- `offset_pct = (ellipse_center_x - symmetry_axis_x) / product_width * 100`
- **Pontosság:** közepes — finom jelző

---

### CSOPORT C — Fókusztávolság — 3 forrásból

#### C1. Barrel/pincushion distortion ← ÚJ v2.0
- A tárgy egyenes élei (palást, doboz sarok) fizikailag EGYENESEK
- Ha a képen BEFELÉ GÖRBÜLNEK → pincushion → telephoto (>85mm)
- Ha KIFELÉ GÖRBÜLNEK → barrel → wide (<35mm)
- `distortion_pct = max_deviation_px / product_width_px * 100`
  - `< -2%`: barrel (wide)
  - `-2% .. +2%`: normal/tele vagy korrigált
  - `> +2%`: pincushion (telephoto)
- **Pontosság:** jó, ha egyenes élek láthatók

#### C2. Aspect ratio compression
- `apparent_hw = height_px / width_px` vs ismert fizikai arány
- Ha kisebb mint fizikai → telephoto tömörítés

#### C3. Mélységi életlen (bokeh szint)
- `none / light / moderate / heavy` → f-szám becslés

---

### CSOPORT D — Termék geometria ← ÚJ mezők v2.0

#### D1. Pixel fill ratio
- `fill = alpha_px / (bbox_w * bbox_h)`
- Henger ≈ 0.75-0.80, szögletes ≈ 0.90-0.98
- Ellenőrzi a rembg minőségét és pontosítja az `objectShapeClass`-t

#### D2. Szimmetriatengelye eltolódása (symmetryAxisOffsetPct)
- Ha a tárgy középpontja NEM a kép közepe → az eredeti fotó aszimmetrikusan volt kompozíciózva
- Felhasználás: compositing elhelyezésnél az x-offset finomítása

#### D3. Függőleges dőlés (verticalTiltDeg)
- A tárgy egész teste DŐL-e? (nem csupán az ellipszis)
- Ha ≠ 0 → a shadow vetítési szög korrekciót igényel

---

### CSOPORT E — Alfa minőség és maradványok ← ÚJ v2.0

#### E1. Alfa él élessége (alphaEdgeSharpness)
- `crisp / soft / frayed`
- Ha `frayed` → ellipszis mérések megbízhatatlanok → konfidencia csökkentése

#### E2. Árnyékmaradványok (shadowRemnants)
- rembg néha bennehagyja az eredeti contact shadow-t
- Irányából következtethetünk a fény irányára → cross-validation az LA-val
- Ha eltér → `conflictsWithLA = true` → figyelmeztetés

#### E3. Reflexió maradványok (reflectionRemnants)
- Ha látható → az asztal fényes felszínű → `tableReflection.enabled = true` a compositingban

---

### CSOPORT F — Keresztvalidáció (crossValidation) ← ÚJ v2.0

- `phi_A1..A5` összehasonlítása: max tolerancia ±8°; ha eltér → konfidencia csökkentése
- `final_phi = weighted_average(phi_A1..A5)` ahol súly = egyedi konfidencia
- `psi_B1..B3` összehasonlítása: tolerancia ±10°
- Lens distortion konzisztens-e a becsült fókusztávolsággal?
- DOF konzisztens-e a fókusztávolsággal és az f-számmal?

---

## A `perspectiveAnalysis` JSON teljes sémája (v2.0)

```json
{
  "perspectiveAnalysis": {

    "meta": {
      "analysisVersion": "2.0",
      "claudeConfidence": <number 0.0-1.0>,
      "bookChaptersUsed": ["<pl. 2.1, 3.1, 5.3>"],
      "objectShapeClass": "cylindrical" | "rectangular" | "bottle" | "irregular" | "flat",
      "cameraAngleScenario": "frontal" | "slightly_above" | "high_angle" | "overhead" | "low_angle"
    },

    "camera": {
      "elevationAngleDeg": <number 0-90, FINAL phi — súlyozott átlag az összes A-csoportos mérésből>,
      "azimuthAngleDeg": <number -90 to +90, FINAL psi — B1+B2+B3 kombinációja>,
      "rollDeg": <number, tipikusan 0>,
      "estimatedFocalLengthMm": <number, pl. 35, 50, 85, 135>,
      "focalLengthLabel": "wide" | "normal" | "portrait" | "telephoto",
      "estimatedFstop": "<pl. f/2.8, f/5.6, f/8>",
      "estimatedDistanceM": <number>
    },

    "elevationMeasurements": {
      "topEllipse": {
        "visible": <boolean>,
        "minorToMajorRatio": <number 0.0-1.0>,
        "impliedElevationDeg": <number>,
        "confidence": <number 0-1>
      },
      "bottomEllipse": {
        "visible": <boolean>,
        "minorToMajorRatio": <number 0.0-1.0>,
        "impliedElevationDeg": <number>,
        "confidence": <number 0-1>,
        "note": "<pl. 'clearer than top — no lid overhang'>"
      },
      "verticalEdgeConvergence": {
        "measurable": <boolean>,
        "topEdgeWidthPx": <number>,
        "bottomEdgeWidthPx": <number>,
        "convergenceRatio": <number, top/bottom>,
        "impliedElevationDeg": <number>
      },
      "footEdgeShape": {
        "measurable": <boolean>,
        "shape": "straight_line" | "elliptical_arc" | "partial_ellipse" | "unclear",
        "ellipseRatio": <number 0.0-1.0>,
        "impliedElevationDeg": <number>
      },
      "handleArc": {
        "present": <boolean>,
        "arcHeightPx": <number>,
        "arcWidthPx": <number>,
        "heightToWidthRatio": <number, equals cos(phi)>,
        "impliedElevationDeg": <number, arccos(h/w)>
      },
      "finalElevationDeg": <number, weighted average>,
      "elevationConfidence": <number 0-1>,
      "sourcesUsed": ["<topEllipse, bottomEllipse, verticalEdgeConvergence, footEdge, handleArc>"]
    },

    "azimuthMeasurements": {
      "sideViewVisibility": {
        "leftSideVisible": <boolean>,
        "rightSideVisible": <boolean>,
        "visibleSideWidthPct": <number 0-50>,
        "impliedAzimuthDeg": <number>
      },
      "labelForeshortening": {
        "measurable": <boolean>,
        "labelApparentWidthPct": <number>,
        "labelExpectedFullWidthPct": <number>,
        "foreshortening": <number 0.0-1.0, apparent/expected>,
        "impliedAzimuthDeg": <number, arccos(foreshortening)>
      },
      "ellipseAxisOffset": {
        "measurable": <boolean>,
        "axisOffsetPct": <number -50 to +50>,
        "impliedAzimuthDir": "left" | "right" | "none"
      },
      "finalAzimuthDeg": <number>,
      "azimuthConfidence": <number 0-1>
    },

    "lensCharacteristics": {
      "barrelDistortion": {
        "measurable": <boolean>,
        "maxDeviationPx": <number>,
        "distortionPct": <number, negative=barrel, positive=pincushion>,
        "impliedFocalLengthLabel": "wide" | "normal_corrected" | "telephoto"
      },
      "aspectRatioCompression": {
        "apparentHWRatio": <number>,
        "knownPhysicalHWRatio": <number or null>,
        "compressionFactor": <number, apparent/physical>
      },
      "depthOfField": {
        "estimatedBokehLevel": "none" | "light" | "moderate" | "heavy",
        "foregroundSharpnessPct": <number 0-100>,
        "dofImpliedAperture": "<pl. f/5.6>"
      },
      "finalFocalLengthMm": <number>,
      "focalLengthConfidence": <number 0-1>
    },

    "productGeometry": {
      "boundingBoxWidthPx": <number>,
      "boundingBoxHeightPx": <number>,
      "apparentHWRatio": <number>,
      "pixelFillRatio": <number 0.0-1.0>,
      "productCenterXPct": <number 0-100>,
      "productCenterYPct": <number 0-100>,
      "productTopYPct": <number 0-100>,
      "productBottomYPct": <number 0-100>,
      "productHeightPct": <number 0-100>,
      "productWidthPct": <number 0-100>,
      "symmetryAxisOffsetPct": <number -50 to +50, signed>,
      "verticalTiltDeg": <number, 0=perfectly upright>
    },

    "alphaQuality": {
      "edgeSharpness": "crisp" | "soft" | "frayed",
      "shadowRemnants": {
        "visible": <boolean>,
        "directionHint": "left" | "right" | "forward" | "none",
        "conflictsWithLA": <boolean>
      },
      "reflectionRemnants": {
        "visible": <boolean>,
        "impliesSurface": "specular" | "matte" | "unknown"
      }
    },

    "crossValidation": {
      "phiSourcesAgreement": <boolean, all phi within 8° of each other>,
      "phiMaxSpreadDeg": <number>,
      "psiSourcesAgreement": <boolean>,
      "lensDistortionConsistentWithFocal": <boolean>,
      "dofConsistentWithFocal": <boolean>,
      "overallConsistencyScore": <number 0-100>
    },

    "perspective": {
      "type": "1VP" | "2VP" | "3VP",
      "horizonYPercent": <number 0-120>,
      "tableSurfaceVisibleDepthPct": <number 0-50>,
      "tableEdgesConvergeVisible": <boolean>
    },

    "fluxPromptComponents": {
      "cameraAngleDescription": "<FLUX-ba kész kameraállás leírás>",
      "tableSurfaceDescription": "<asztallap mélység leírás>",
      "perspectiveDescription": "<eltűnési pontok és horizont leírás>",
      "focalLengthDescription": "<fókusz leírás>",
      "bokehDescription": "<bokeh leírás>",
      "fullBgPerspectivePrompt": "<TELJES, FLUX-ba illeszthető perspektíva prompt, 20-50 szó angolul>"
    },

    "compositingHints": {
      "surfaceContactOvalRatio": <number 0.0-1.0, sin(phi_rad)>,
      "useEllipticalContactShadow": <boolean, true ha phi > 10°>,
      "contactShadowHeightMultiplier": <number, sin(phi_rad) * 0.15>,
      "productScaleMatchesPerspective": <boolean>,
      "recommendedSurfaceYPct": <number 60-85>,
      "perspectiveMatchScore": <number 0-100>,
      "perspectiveWarnings": ["<figyelmeztetések>"]
    }

  }
}
```

---

## Kitöltött minta — Poli-Farbe Inntaler vödör (v2.0)

```json
{
  "perspectiveAnalysis": {
    "meta": {
      "analysisVersion": "2.0",
      "claudeConfidence": 0.88,
      "bookChaptersUsed": ["2.1", "2.2", "3.1", "5.3", "6.1"],
      "objectShapeClass": "cylindrical",
      "cameraAngleScenario": "slightly_above"
    },
    "camera": {
      "elevationAngleDeg": 19,
      "azimuthAngleDeg": 5,
      "rollDeg": 0,
      "estimatedFocalLengthMm": 85,
      "focalLengthLabel": "portrait",
      "estimatedFstop": "f/5.6",
      "estimatedDistanceM": 1.0
    },
    "elevationMeasurements": {
      "topEllipse": {
        "visible": true,
        "minorToMajorRatio": 0.33,
        "impliedElevationDeg": 19,
        "confidence": 0.85
      },
      "bottomEllipse": {
        "visible": true,
        "minorToMajorRatio": 0.34,
        "impliedElevationDeg": 20,
        "confidence": 0.92,
        "note": "clearer measurement — no lid overhang obstruction at bottom"
      },
      "verticalEdgeConvergence": {
        "measurable": true,
        "topEdgeWidthPx": 552,
        "bottomEdgeWidthPx": 522,
        "convergenceRatio": 1.057,
        "impliedElevationDeg": 18
      },
      "footEdgeShape": {
        "measurable": true,
        "shape": "elliptical_arc",
        "ellipseRatio": 0.34,
        "impliedElevationDeg": 20
      },
      "handleArc": {
        "present": true,
        "arcHeightPx": 78,
        "arcWidthPx": 88,
        "heightToWidthRatio": 0.886,
        "impliedElevationDeg": 28
      },
      "finalElevationDeg": 19,
      "elevationConfidence": 0.91,
      "sourcesUsed": ["topEllipse", "bottomEllipse", "verticalEdgeConvergence", "footEdge", "handleArc"]
    },
    "azimuthMeasurements": {
      "sideViewVisibility": {
        "leftSideVisible": false,
        "rightSideVisible": false,
        "visibleSideWidthPct": 2,
        "impliedAzimuthDeg": 3
      },
      "labelForeshortening": {
        "measurable": true,
        "labelApparentWidthPct": 82,
        "labelExpectedFullWidthPct": 84,
        "foreshortening": 0.976,
        "impliedAzimuthDeg": 13
      },
      "ellipseAxisOffset": {
        "measurable": true,
        "axisOffsetPct": 1.2,
        "impliedAzimuthDir": "right"
      },
      "finalAzimuthDeg": 5,
      "azimuthConfidence": 0.70
    },
    "lensCharacteristics": {
      "barrelDistortion": {
        "measurable": true,
        "maxDeviationPx": 2,
        "distortionPct": 0.4,
        "impliedFocalLengthLabel": "normal_corrected"
      },
      "aspectRatioCompression": {
        "apparentHWRatio": 1.06,
        "knownPhysicalHWRatio": 1.05,
        "compressionFactor": 1.01
      },
      "depthOfField": {
        "estimatedBokehLevel": "moderate",
        "foregroundSharpnessPct": 97,
        "dofImpliedAperture": "f/5.6"
      },
      "finalFocalLengthMm": 85,
      "focalLengthConfidence": 0.80
    },
    "productGeometry": {
      "boundingBoxWidthPx": 552,
      "boundingBoxHeightPx": 584,
      "apparentHWRatio": 1.06,
      "pixelFillRatio": 0.78,
      "productCenterXPct": 50,
      "productCenterYPct": 39,
      "productTopYPct": 5,
      "productBottomYPct": 73,
      "productHeightPct": 68,
      "productWidthPct": 54,
      "symmetryAxisOffsetPct": 0.5,
      "verticalTiltDeg": 0
    },
    "alphaQuality": {
      "edgeSharpness": "crisp",
      "shadowRemnants": {
        "visible": false,
        "directionHint": "none",
        "conflictsWithLA": false
      },
      "reflectionRemnants": {
        "visible": false,
        "impliesSurface": "unknown"
      }
    },
    "crossValidation": {
      "phiSourcesAgreement": true,
      "phiMaxSpreadDeg": 10,
      "psiSourcesAgreement": false,
      "lensDistortionConsistentWithFocal": true,
      "dofConsistentWithFocal": true,
      "overallConsistencyScore": 85
    },
    "perspective": {
      "type": "3VP",
      "horizonYPercent": 105,
      "tableSurfaceVisibleDepthPct": 12,
      "tableEdgesConvergeVisible": true
    },
    "fluxPromptComponents": {
      "cameraAngleDescription": "camera at approximately 19-degree downward angle, looking gently down onto product",
      "tableSurfaceDescription": "tabletop visible as a meaningful foreground plane of about 12% of frame height",
      "perspectiveDescription": "gentle perspective convergence, table edges converge slightly toward sides, subtle three-point perspective",
      "focalLengthDescription": "85mm portrait lens compression, background appears slightly closer to subject",
      "bokehDescription": "moderate background blur, background details soft but recognizable",
      "fullBgPerspectivePrompt": "camera at 19-degree elevated angle looking gently downward, 85mm portrait compression, tabletop foreground visible as 12% deep plane, table edges converge gently toward sides, moderate background bokeh, product placed centrally on table surface"
    },
    "compositingHints": {
      "surfaceContactOvalRatio": 0.33,
      "useEllipticalContactShadow": true,
      "contactShadowHeightMultiplier": 0.05,
      "productScaleMatchesPerspective": true,
      "recommendedSurfaceYPct": 75,
      "perspectiveMatchScore": 88,
      "perspectiveWarnings": [
        "handleArc phi (28°) > consensus (19°) — wide handles compress the arc ratio, less reliable",
        "psiSourcesAgreement=false: sideView→3°, labelForeshortening→13° — conservative lower estimate used",
        "phiMaxSpreadDeg=10 — acceptable, within tolerance"
      ]
    }
  }
}
```

---

## Mérési megbízhatóság összefoglaló

| Csoport | Mit mér | Megbízhatóság | Feltétel |
|---|---|---|---|
| **A1** topEllipse | phi | Közepes (0.80) | Hengeres tárgy |
| **A2** bottomEllipse | phi | Jó (0.92) | Alj nem takart |
| **A3** verticalEdgeConvergence | phi | Jó (0.88) | Egyenes élek vannak |
| **A4** footEdgeShape | phi | Közepes (0.78) | rembg nem vágta le |
| **A5** handleArc | phi | Változó (0.60-0.85) | Csak fogantyús terméknél |
| **B1** sideViewVisibility | psi | Gyenge (0.55) | Mindig rendelkezésre áll |
| **B2** labelForeshortening | psi | Jó (0.82) | Felirat jól látható |
| **B3** ellipseAxisOffset | psi irány | Közepes (0.70) | Finom jelző |
| **C1** barrelDistortion | fókusz | Jó (0.82) | Egyenes élek láthatók |
| **C2** aspectRatioCompression | fókusz | Közepes (0.70) | Fizikai méret ismert |
| **C3** bokeh/DOF | f-szám | Közepes (0.72) | Szubjektív |
| **D1** pixelFillRatio | forma | Kiváló (0.95) | Mindig mérhető |
| **D2** symmetryAxisOffset | x-offset | Közepes (0.70) | Finom jelző |
| **D3** verticalTiltDeg | dőlés | Jó (0.85) | Egyenes élek kellenek |
| **E** alphaQuality | rembg minőség | Kiváló (0.95) | Mindig mérhető |
| **F** crossValidation | konzisztencia | — | Belső meta-mérés |

---

## Integrációs útmutató

```
POST /api/image/analyze
  → [LightingAnalysis JSON kinyerése]   (meglévő)
  → [PerspectiveAnalysis JSON kinyerése] (ÚJ v2.0)
      Claude Vision méri:
        - A1+A2: ellipszisek felső és alsó
        - A3: oldalél konvergencia
        - A4: talpél forma
        - A5: fogantyú arc (ha van)
        - B2: label foreshortening
        - B3: ellipszis középpont eltolódás
        - C1: barrel/pincushion distortion
        - D: geometriai arányok
        - E: alfa minőség
        → crossValidation → final phi, psi, focal
        → fullBgPerspectivePrompt összerakva

POST /api/image/composite-generate
  → bgOnlyPrompt += pa.fluxPromptComponents.fullBgPerspectivePrompt
  → contactShadow.heightMultiplier = pa.compositingHints.contactShadowHeightMultiplier
```

---

## Shape-Specific JSON Kiegészítések

Az `elevationMeasurements` blokk az `objectShapeClass`-tól függően különböző
alternatív mérési mezőkkel bővül:

```json
// HA objectShapeClass = "rectangular" VAGY "flat_planar":
"shapeSpecific": {
  "topFaceQuad": {
    "topLeftPx": [<x>, <y>],
    "topRightPx": [<x>, <y>],
    "botLeftPx":  [<x>, <y>],
    "botRightPx": [<x>, <y>],
    "faceWidthPx": <number>,
    "faceDepthPx":  <number>,
    "depthToWidthRatio": <number>,
    "impliedElevationDeg": <number>
  },
  "cornerDivergence": {
    "leftVPxEstimate":  <number, negative = beyond left edge>,
    "rightVPxEstimate": <number, positive = beyond right edge>,
    "vpSpreadPx": <number>,
    "impliedAzimuthDeg": <number>
  }
}

// HA objectShapeClass = "bottle":
"shapeSpecific": {
  "neckEllipse": {
    "visible": <boolean>,
    "minorToMajorRatio": <number>,
    "impliedElevationDeg": <number>
  },
  "bodyEllipse": {
    "visible": <boolean>,
    "yPositionPct": <number, ahol a test legszélesebb>,
    "minorToMajorRatio": <number>,
    "impliedElevationDeg": <number>
  },
  "neckBodyWidthRatio": <number, nyak szélessége / test szélessége>,
  "contourSymmetry": <number 0-1, 1=teljesen szimmetrikus>
}

// HA objectShapeClass = "flat_planar":
"shapeSpecific": {
  "faceForeshortening": {
    "apparentHeightPx": <number>,
    "apparentWidthPx":  <number>,
    "heightToWidthRatio": <number>,
    "impliedElevationDeg": <number, arccos(h_apparent/w_apparent) ha ismert fizikai arány>
  },
  "cornerQuad": {
    "isRectangle": <boolean, nincs perspektíva torzítás?>,
    "isTrapezoid": <boolean, egy eltűnési pont>,
    "isGeneralQuad": <boolean, két eltűnési pont>,
    "impliedVPType": "1VP" | "2VP"
  }
}

// HA objectShapeClass = "irregular":
"shapeSpecific": {
  "silhouetteAsymmetry": {
    "leftMaxExtentPx":  <number>,
    "rightMaxExtentPx": <number>,
    "asymmetryRatio": <number 0-1, 0=szimmetrikus>,
    "impliedAzimuthDeg": <number>
  },
  "centroidYPct": <number 0-100, alfa-súlyozott Y tömegközép>,
  "phiReliability": "low" | "very_low",
  "phiWarning": "irregular shape — elevation estimate unreliable, use 15° default"
}
```

---

## objectShapeClass Döntési Fa

```
Bemenet: körbevágott termékfotó (alfa maszkkal)

1. Van-e látható kör/ellipszis forma felül VAGY alul?
   IGEN → cylindrical vagy bottle
         Van-e látható szűkülés (nyak) a tárgy felső 30%-ában? → bottle
         Nincs szűkülés? → cylindrical
   NEM → tovább

2. pixelFillRatio > 0.85 ÉS aspect_ratio (H/W) < 0.6?
   IGEN → flat_planar (nagyon lapos téglalap)
   NEM → tovább

3. Vannak párhuzamos egyenes élek a tárgy NÉGY oldalán?
   IGEN → rectangular
   NEM → tovább

4. productHeightPct > productWidthPct * 1.6 (nagyon magas, vékony)?
   IGEN → bottle (ha van kerekség tetején) vagy irregular
   NEM → tovább

5. Fallback → irregular

Konfidencia:
  cylindrical: 0.85-0.95 (ellipszis könnyen azonosítható)
  rectangular: 0.80-0.92 (sarok geometria)
  bottle:      0.80-0.90 (nyak+test jellemző)
  flat_planar: 0.75-0.88 (arány alapú)
  irregular:   0.50-0.70 (konzervatív)
```

---

*Referencia verziója: 2026-07-01 (v2.1 — Termékosztály általánosítás)*
*Forrás: perspective_camera_book.md (Fejezet 14), lighting_physics_book.md*
*Ez egy ÉLŐ DOKUMENTUM — bővítendő minden új tapasztalattal*
