#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Patches the compositing parameter block in index.ts to use LightingAnalysis
JSON values when available, falling back to sceneCtx-based heuristics.

Replaces 4 key areas:
  A) Warm tint + env tint
  B) Rim darkening  
  C) Specular highlight zone + opacity
  D) bgOnlyPrompt tablespace instruction
  E) Form shadow gradient (NEW layer added after rim darkening)
"""
import pathlib

INDEX = pathlib.Path(
    r"C:/Users/Zombo/Desktop/Antigrav/agentmain_digidesk/agent-main/z/kepgeneralas/server/src/index.ts"
)
content = INDEX.read_text(encoding="utf-8")

# ════════════════════════════════════════════════════════════════
# PATCH A: bgOnlyPrompt — add tablespace instruction always
# ════════════════════════════════════════════════════════════════
OLD_BG_PROMPT = "        'empty foreground surface for product placement, no products or objects visible anywhere',"
NEW_BG_PROMPT = """\
        'product placed at CENTER of workbench/table surface — NOT at table edge, NOT in foreground corner',
        'substantial table surface visible in front of product (25-30% of image height as table foreground)',
        'table also extends visibly on both left and right sides of product for natural depth',
        'empty foreground surface for product placement, no products or objects visible anywhere',"""

count_a = content.count(OLD_BG_PROMPT)
if count_a == 0:
    print("WARN A: bgOnlyPrompt target not found — skipping")
elif count_a > 1:
    print(f"WARN A: {count_a} matches found — replacing all")
    content = content.replace(OLD_BG_PROMPT, NEW_BG_PROMPT)
else:
    content = content.replace(OLD_BG_PROMPT, NEW_BG_PROMPT)
    print("✅ PATCH A: bgOnlyPrompt tablespace instruction added")

# ════════════════════════════════════════════════════════════════
# PATCH B: Before the compositing effects block — insert la (lightingAnalysis) resolver
# Insert right after "const dimAmount = ..." line
# ════════════════════════════════════════════════════════════════
OLD_DIM = "      const dimAmount = Math.max(0.72, 0.95 - (sceneCtx.ambientDarkness / 100) * 0.23);  // 0.72-0.95"
NEW_DIM = """\
      // ── LightingAnalysis resolver — use pre-computed physics values when available ──
      // la = lightingAnalysis from the product slot (v2.0 physics pipeline).
      // When la is available, all compositing parameters come from physics-derived numbers.
      // When la is null, fall back to sceneCtx heuristic values (legacy mode).
      const la: any = lightingAnalysis && !lightingAnalysis._legacyMode ? lightingAnalysis : null;

      // Helper: clamp value to range
      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

      // dimAmount: from la.colorThermal.ambientDarkness OR sceneCtx fallback
      const laDarkness = la ? la.colorThermal?.ambientDarkness ?? sceneCtx.ambientDarkness : sceneCtx.ambientDarkness;
      const dimAmount = Math.max(0.72, 0.95 - (laDarkness / 100) * 0.23);  // 0.72-0.95"""

if OLD_DIM in content:
    content = content.replace(OLD_DIM, NEW_DIM, 1)
    print("✅ PATCH B: LightingAnalysis resolver inserted")
else:
    print("ERROR B: dimAmount line not found")

# ════════════════════════════════════════════════════════════════
# PATCH C: warm tint — use la.colorThermal.ambientTintRgb when available
# ════════════════════════════════════════════════════════════════
OLD_WARM = """\
      // Warm tint: derived from lightTemperatureK
      const warmIntensity = Math.max(0, (5000 - sceneCtx.lightTemperatureK) / 2300);  // 0-1
      const warmOpacity   = warmIntensity * 0.28;  // max 0.28 at 2700K
      const warmG = Math.round(130 + (sceneCtx.lightTemperatureK - 2700) * 0.02);
      const warmB = Math.round(25  + (sceneCtx.lightTemperatureK - 2700) * 0.018);
      const warmCoverage = Math.round(finalH * 0.45);"""
NEW_WARM = """\
      // Warm tint: use la.colorThermal.ambientTintRgb if available, else sceneCtx K-based
      let warmOpacity: number, warmG: number, warmB: number;
      if (la?.colorThermal?.ambientTintRgb) {
        // Direct RGB from LightingAnalysis (physics-derived, exact Kelvin match)
        const [tR, tG, tB] = la.colorThermal.ambientTintRgb;
        warmOpacity = clamp(la.colorThermal.ambientTintOpacity ?? 0.12, 0, 0.28);
        // Derive G/B for the SVG from the tint color (shift relative to 255,255,255)
        warmG = Math.round(clamp(tG, 80, 255));
        warmB = Math.round(clamp(tB, 20, 255));
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] [LA-v2] Warm tint from LightingAnalysis: rgb(255,${warmG},${warmB}) opacity=${warmOpacity.toFixed(3)}`);
      } else {
        // Legacy heuristic
        const warmIntensity = Math.max(0, (5000 - sceneCtx.lightTemperatureK) / 2300);
        warmOpacity = warmIntensity * 0.28;
        warmG = Math.round(130 + (sceneCtx.lightTemperatureK - 2700) * 0.02);
        warmB = Math.round(25  + (sceneCtx.lightTemperatureK - 2700) * 0.018);
      }
      const warmCoverage = Math.round(finalH * 0.45);"""

if OLD_WARM in content:
    content = content.replace(OLD_WARM, NEW_WARM, 1)
    print("✅ PATCH C: Warm tint LightingAnalysis-aware")
else:
    print("ERROR C: warm tint block not found")

# ════════════════════════════════════════════════════════════════
# PATCH D: rim darkening — use la.compositing.rimDarkening when available
#          + add Lambert form shadow gradient (NEW layer)
# ════════════════════════════════════════════════════════════════
OLD_RIM = """\
      // Rim darkening: derived from ambientDarkness
      const rimOpacity = (sceneCtx.ambientDarkness / 100) * 0.42;  // 0 at bright, 0.42 at very dark
      if (rimOpacity > 0.02) {
        const rimW = Math.round(finalW * 0.20);"""
NEW_RIM = """\
      // Rim darkening: use la.compositing.rimDarkening if available
      let rimOpacity: number, rimSide: 'left' | 'right' | 'both';
      if (la?.compositing?.rimDarkening) {
        rimOpacity = clamp(la.compositing.rimDarkening.opacity, 0, 0.55);
        rimSide = la.compositing.rimDarkening.side === 'none' ? 'both' : la.compositing.rimDarkening.side;
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] [LA-v2] Rim: opacity=${rimOpacity.toFixed(3)} side=${rimSide}`);
      } else {
        rimOpacity = (laDarkness / 100) * 0.42;
        rimSide = 'both';
      }

      // ── NEW: Lambert form shadow gradient (Fejezet 4.2) ────────────────────
      // At overhead theta ~80-90°: top=100%, bottom=25% → strong vertical gradient
      // At side 45°: top=70%, left or right side darkens significantly
      if (la?.compositing?.formShadowGradient?.enabled) {
        const fsg = la.compositing.formShadowGradient;
        const fsgOpacity = clamp(fsg.opacity ?? 0.28, 0.10, 0.45);
        const topStop   = clamp(1 - (fsg.topBrightness    ?? 0.95), 0, 0.4);   // invert: bright top = low dark overlay
        const bottomStop = clamp(1 - (fsg.bottomBrightness ?? 0.30), 0.3, 0.8); // invert: dark bottom = high dark overlay
        const formGradSvg = Buffer.from(
          `<svg width="${finalW}" height="${finalH}" xmlns="http://www.w3.org/2000/svg">` +
          `<defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="0%"   stop-color="black" stop-opacity="${(topStop * fsgOpacity).toFixed(3)}"/>` +
          `<stop offset="30%"  stop-color="black" stop-opacity="${(topStop * fsgOpacity * 0.3).toFixed(3)}"/>` +
          `<stop offset="65%"  stop-color="black" stop-opacity="${(bottomStop * fsgOpacity * 0.5).toFixed(3)}"/>` +
          `<stop offset="100%" stop-color="black" stop-opacity="${(bottomStop * fsgOpacity).toFixed(3)}"/>` +
          `</linearGradient></defs>` +
          `<rect width="${finalW}" height="${finalH}" fill="url(#fg)"/>` +
          `</svg>`
        );
        const formGradBuf = await svgToTransparentPng(formGradSvg, finalW, finalH);
        productWithEffects = await sharp(productWithEffects)
          .composite([{ input: formGradBuf, left: 0, top: 0, blend: 'multiply' }])
          .png().toBuffer();
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] [LA-v2] Form shadow gradient: opacity=${fsgOpacity.toFixed(3)} topDark=${(topStop*fsgOpacity).toFixed(3)} bottomDark=${(bottomStop*fsgOpacity).toFixed(3)}`);
      } else {
        // Fallback: always apply a mild Lambert gradient (25% darkening at base)
        const defaultGradSvg = Buffer.from(
          `<svg width="${finalW}" height="${finalH}" xmlns="http://www.w3.org/2000/svg">` +
          `<defs><linearGradient id="dfg" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="0%"   stop-color="black" stop-opacity="0.00"/>` +
          `<stop offset="50%"  stop-color="black" stop-opacity="0.04"/>` +
          `<stop offset="80%"  stop-color="black" stop-opacity="0.14"/>` +
          `<stop offset="100%" stop-color="black" stop-opacity="0.22"/>` +
          `</linearGradient></defs>` +
          `<rect width="${finalW}" height="${finalH}" fill="url(#dfg)"/>` +
          `</svg>`
        );
        const defaultGradBuf = await svgToTransparentPng(defaultGradSvg, finalW, finalH);
        productWithEffects = await sharp(productWithEffects)
          .composite([{ input: defaultGradBuf, left: 0, top: 0, blend: 'multiply' }])
          .png().toBuffer();
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] Form shadow gradient: default Lambert (22% base darkening)`);
      }

      if (rimOpacity > 0.02) {
        const rimW = Math.round(finalW * (la?.compositing?.rimDarkening?.widthMultiplier ?? 0.20));"""

if "      // Rim darkening: derived from ambientDarkness" in content:
    content = content.replace(
        "      // Rim darkening: derived from ambientDarkness\n      const rimOpacity = (sceneCtx.ambientDarkness / 100) * 0.42;  // 0 at bright, 0.42 at very dark\n      if (rimOpacity > 0.02) {\n        const rimW = Math.round(finalW * 0.20);",
        NEW_RIM,
        1
    )
    print("✅ PATCH D: Rim darkening + Form shadow gradient added")
else:
    print("ERROR D: rim darkening block not found")

# ════════════════════════════════════════════════════════════════
# PATCH E: specular zone — use la.material.specular values
# ════════════════════════════════════════════════════════════════
OLD_SPEC_OPACITY = "      const specOpacity = { 'soft': 0.18, 'medium': 0.40, 'hard': 0.60 }[sceneCtx.lightIntensity];"
NEW_SPEC_OPACITY = """\
      // Specular: use la.material.specular values when available (physics-derived zone)
      let specOpacity: number, specZonePct: number, specWidthMult: number;
      if (la?.material?.specular) {
        specOpacity    = clamp(la.material.specular.opacity ?? 0.40, 0.10, 0.65);
        specZonePct    = clamp(la.material.specular.zoneTopPct ?? 18, 8, 25) / 100;  // % → ratio
        specWidthMult  = clamp(la.material.specular.widthMultiplier ?? 0.55, 0.30, 0.75);
        // Overhead light (theta >= 75°): boost specular on lid (top of bucket gets full irradiance)
        const theta = la.lightSource?.directionAngle ?? 70;
        if (theta >= 75) {
          specOpacity = clamp(specOpacity * 1.3, 0.30, 0.70); // overhead → stronger specular
        }
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] [LA-v2] Specular: opacity=${specOpacity.toFixed(2)} zone=top${Math.round(specZonePct*100)}% width=${specWidthMult}`);
      } else {
        specOpacity   = { 'soft': 0.18, 'medium': 0.40, 'hard': 0.60 }[sceneCtx.lightIntensity] ?? 0.40;
        specZonePct   = 0.18;  // top 18% default
        specWidthMult = 0.55;
      }"""

if OLD_SPEC_OPACITY in content:
    content = content.replace(OLD_SPEC_OPACITY, NEW_SPEC_OPACITY, 1)
    print("✅ PATCH E: Specular opacity + zone LightingAnalysis-aware")
else:
    print("ERROR E: specular opacity line not found")

# Also update the specular zone calculation to use the new variables
OLD_SPEC_ZONE = """\
        // Specular zone: top 18% of product height — STRICTLY the lid area
        const specZoneH = Math.round(finalH * 0.18);
        const specW     = Math.round(finalW * 0.55);  // wider highlight = more natural top-lit look"""
NEW_SPEC_ZONE = """\
        // Specular zone: top specZonePct of product height — STRICTLY the lid area (physics-derived)
        const specZoneH = Math.round(finalH * specZonePct);
        const specW     = Math.round(finalW * specWidthMult);  // physics-derived width"""

if OLD_SPEC_ZONE in content:
    content = content.replace(OLD_SPEC_ZONE, NEW_SPEC_ZONE, 1)
    print("✅ PATCH E2: Specular zone calc updated to use la variables")
else:
    print("ERROR E2: specular zone calc not found")

# Fix specular log line
OLD_SPEC_LOG = '        console.log(`[COMPOSITE-GENERATE][preserveOriginal] Specular: zone=top18% specW=${specW} specH=${specH2} offX=${specOffX}px opacity=${specOpacity}`);'
NEW_SPEC_LOG = '        console.log(`[COMPOSITE-GENERATE][preserveOriginal] Specular: zone=top${Math.round(specZonePct*100)}% specW=${specW} specH=${specH2} offX=${specOffX}px opacity=${specOpacity.toFixed(2)}`);'
if OLD_SPEC_LOG in content:
    content = content.replace(OLD_SPEC_LOG, NEW_SPEC_LOG, 1)
    print("✅ PATCH E3: Specular log line updated")

# ════════════════════════════════════════════════════════════════
# PATCH F: ambientDarkness usage in envTintOpacity → use laDarkness
# ════════════════════════════════════════════════════════════════
OLD_ENV = "      const envTintOpacity = Math.max(0, (sceneCtx.ambientDarkness - 40) / 100) * 0.22;  // 0-0.22"
NEW_ENV = "      const envTintOpacity = Math.max(0, (laDarkness - 40) / 100) * 0.22;  // 0-0.22 — uses la.colorThermal.ambientDarkness if available"
if OLD_ENV in content:
    content = content.replace(OLD_ENV, NEW_ENV, 1)
    print("✅ PATCH F: envTintOpacity uses laDarkness")
else:
    print("WARN F: envTintOpacity line not found")

# ════════════════════════════════════════════════════════════════
# PATCH G: rimOpacity reference in log line (uses dimAmount log)
# ════════════════════════════════════════════════════════════════
OLD_DIM_LOG = "      console.log(`[COMPOSITE-GENERATE][preserveOriginal] dimAmount=${dimAmount.toFixed(3)} (darkness=${sceneCtx.ambientDarkness})`);"
NEW_DIM_LOG = "      console.log(`[COMPOSITE-GENERATE][preserveOriginal] dimAmount=${dimAmount.toFixed(3)} (darkness=${laDarkness}${la ? ' [LA-v2]' : ' [sceneCtx]'})`);"
if OLD_DIM_LOG in content:
    content = content.replace(OLD_DIM_LOG, NEW_DIM_LOG, 1)
    print("✅ PATCH G: dimAmount log uses laDarkness")

INDEX.write_text(content, encoding="utf-8")
print(f"\nDone. File size: {len(content):,} bytes")
