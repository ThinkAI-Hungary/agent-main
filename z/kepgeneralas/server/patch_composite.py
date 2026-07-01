#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Patches composite-generate to use LightingAnalysis JSON directly
instead of the old paResult heuristic conversion.
"""
import pathlib, re

INDEX = pathlib.Path(
    r"C:/Users/Zombo/Desktop/Antigrav/agentmain_digidesk/agent-main/z/kepgeneralas/server/src/index.ts"
)

# ── The OLD block to find and replace ────────────────────────────────────────
OLD_MARKER_START = "      // ── Product-aware BG analysis (optional) ──────────────────────────────"
OLD_MARKER_END = "      // surfaceY = derived from our TARGET, not from Claude Vision guess"

# ── NEW block ─────────────────────────────────────────────────────────────────
NEW_BLOCK = '''      // ── Product-aware BG analysis — LightingAnalysis JSON v2.0 ─────────────
      // When productAwareBg=true: use the pre-computed LightingAnalysis JSON
      // attached to the slot during /api/image/analyze. This contains all
      // physics-based values derived from the lighting physics book:
      //   lightSource.* → FLUX BG prompt (fullBgPrompt)
      //   compositing.* → sceneCtx override (direct numeric values, no heuristics)
      //   shadow.*      → contact, AO, drop shadow parameters
      //   colorThermal.* → ambient tint values
      // If lightingAnalysis is not available (older images), falls back to
      // the legacy on-the-fly Claude Vision analysis.
      let productAwareAddition = '';
      let lightingAnalysis: any = null; // will hold LightingAnalysis JSON if available

      if (productAwareBg && rembgImagePath) {
        // ── Try to use pre-computed LightingAnalysis from slot ─────────────
        const primarySlot = slots[0];
        if (primarySlot?.lightingAnalysis) {
          lightingAnalysis = primarySlot.lightingAnalysis;
          // Use the pre-built fullBgPrompt from analyze phase
          productAwareAddition = lightingAnalysis.prompts?.fullBgPrompt || '';
          console.log(
            `[COMPOSITE-GENERATE][preserveOriginal] [PRODUCT-AWARE-v2] Using pre-computed LightingAnalysis:` +
            ` scenario=${lightingAnalysis.meta?.lightingScenario}` +
            ` theta=${lightingAnalysis.lightSource?.directionAngle}°` +
            ` K=${lightingAnalysis.lightSource?.temperatureK}K` +
            ` darkness=${lightingAnalysis.colorThermal?.ambientDarkness}` +
            ` dropShadow=${lightingAnalysis.shadow?.hasDropShadow}` +
            ` → BG hint: "${productAwareAddition.slice(0, 80)}..."`
          );
        } else {
          // ── Fallback: legacy on-the-fly Claude Vision analysis ───────────
          try {
            console.log(`[COMPOSITE-GENERATE][preserveOriginal] [PRODUCT-AWARE] No pre-computed LightingAnalysis — running legacy quick analysis...`);
            const productImageBlock = await fetchImageAsClaudeBlock(
              rembgImagePath.startsWith('/renders/')
                ? `http://localhost:${port}${rembgImagePath}`
                : rembgImagePath
            );
            const paModel = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
            const paResp = await anthropic.messages.create({
              model: paModel,
              max_tokens: 400,
              temperature: 0,
              system: `You are a product photography expert. Analyze the product image and return a JSON object.
Return ONLY JSON, no markdown:
{
  "lightDirection": "top"|"top-left"|"top-right"|"left"|"right"|"front",
  "lightTemperatureDesc": "warm tungsten"|"neutral white"|"cool daylight",
  "cameraAngle": "eye-level"|"slightly-above"|"low-angle",
  "shadowStyle": "hard sharp"|"soft diffuse"|"none",
  "bgMatchHint": "<10-word English phrase describing ideal background atmosphere>",
  "lightIntensityLevel": "hard"|"medium"|"soft",
  "ambientDarknessLevel": <integer 0-100>
}`,
              messages: [{ role: 'user', content: [productImageBlock, { type: 'text', text: 'Analyze this product image. Return only the JSON.' }] }]
            });
            const paText = paResp.content[0].type === 'text' ? paResp.content[0].text : '{}';
            const paResult = JSON.parse(extractJsonStr(paText));
            // Build legacy productAwareAddition string
            productAwareAddition = [
              paResult.lightDirection ? `lighting from ${paResult.lightDirection}` : '',
              paResult.lightTemperatureDesc ? `${paResult.lightTemperatureDesc} light color` : '',
              paResult.cameraAngle ? `${paResult.cameraAngle} camera angle` : '',
              paResult.shadowStyle ? `${paResult.shadowStyle} shadows` : '',
              paResult.bgMatchHint || '',
            ].filter(Boolean).join(', ');
            // Store as minimal lightingAnalysis for sceneCtx override below
            lightingAnalysis = {
              _legacyMode: true,
              lightSource: {
                temperatureK: paResult.lightTemperatureDesc?.includes('warm') ? 2900 : paResult.lightTemperatureDesc?.includes('cool') ? 6500 : 4500,
                xPercent: { 'left': 20, 'top-left': 30, 'top': 50, 'top-right': 70, 'right': 80, 'front': 50 }[paResult.lightDirection] ?? 50,
                intensity: paResult.lightIntensityLevel || 'medium',
              },
              colorThermal: { ambientDarkness: paResult.ambientDarknessLevel ?? sceneCtx.ambientDarkness },
              shadow: { hasDropShadow: paResult.shadowStyle !== 'none' },
            };
            console.log(`[COMPOSITE-GENERATE][preserveOriginal] [PRODUCT-AWARE-legacy] BG hint: "${productAwareAddition}"`);
          } catch (paErr: any) {
            console.warn(`[COMPOSITE-GENERATE][preserveOriginal] [PRODUCT-AWARE] Fallback analysis failed: ${paErr.message}`);
            lightingAnalysis = null;
          }
        }
      }

      // Build cinematic BG prompt — uses LightingAnalysis fullBgPrompt if available
      const bgOnlyPrompt = [
        sceneKeywords,
        surfaceCompositionInstruction,
        ...(productAwareAddition ? [productAwareAddition] : []),
        'photorealistic cinematic photography, textured and imperfect surfaces, real environment',
        'dramatic moody lighting with strong shadows and visible light beams',
        'shallow depth of field, background detail with natural blur',
        'dark atmospheric mood — NOT clean white studio, NOT minimal, NOT sterile, richly detailed',
        'empty foreground surface for product placement, no products or objects visible anywhere',
        'high quality professional photography',
      ].join('. ');
      console.log(`[COMPOSITE-GENERATE][preserveOriginal] Step 1: Generating background-only scene...`);
      console.log(`[COMPOSITE-GENERATE][preserveOriginal] BG prompt: "${bgOnlyPrompt}"`);

      // Generate background using FLUX Flex (forceFlex=true), WITHOUT product reference image
      const bgGenResult = await generateWithFluxFlex(bgOnlyPrompt, w, h, {
        aspectRatio: ar,
        safetyTolerance: 5,
        guidance: 4.5,
        steps: 50,
        inputImage: undefined,
        inputImage2: undefined,
        backgroundPrompt: undefined,
        forceFlex: true       // always use FLUX Flex, not Pro
      });

      console.log(`[COMPOSITE-GENERATE][preserveOriginal] Step 1 done in ${bgGenResult.generationTime}s → ${bgGenResult.imageUrl}`);

      // Step 2: Fetch background image and rembg cutout, then composite with sharp
      console.log(`[COMPOSITE-GENERATE][preserveOriginal] Step 2: Compositing product onto background with sharp...`);

      // Fetch the generated background as buffer
      const bgResponse = await axios.get(bgGenResult.imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
      const bgBuffer = Buffer.from(bgResponse.data);

      // Get background dimensions
      const bgMeta = await sharp(bgBuffer).metadata();
      const bgW = bgMeta.width || w;
      const bgH = bgMeta.height || h;

      // ── Analyze background for LIGHTING only (Claude Vision) ──────────────────
      // surfaceY is NOT taken from Claude — we use TARGET_SURFACE_Y_PCT which we
      // already told FLUX to use during BG generation. This eliminates the
      // spotlight-cone / table-edge confusion that caused 200px floating.
      const bgAnalyzeFilename = `bg-analyze-${Date.now()}.jpg`;
      const bgAnalyzePath = path.join(rendersDir, bgAnalyzeFilename);
      await fs.promises.writeFile(bgAnalyzePath, bgBuffer);
      const sceneCtx = await analyzeSceneContext(`http://localhost:${port}/renders/${bgAnalyzeFilename}`);
      fs.promises.unlink(bgAnalyzePath).catch(() => {});

      // ── Product-aware compositing override — v2.0 (direct numeric values) ─────
      // When lightingAnalysis is available, override sceneCtx with the pre-computed
      // physics values. All values are DIRECT NUMBERS — no string-to-number heuristics.
      if (productAwareBg && lightingAnalysis) {
        const origTemp      = sceneCtx.lightTemperatureK;
        const origXPct      = sceneCtx.lightSourceXPercent;
        const origIntensity = sceneCtx.lightIntensity;
        const origDarkness  = sceneCtx.ambientDarkness;

        // Direct numeric override — no string conversion needed
        if (lightingAnalysis.lightSource?.temperatureK) {
          sceneCtx.lightTemperatureK = lightingAnalysis.lightSource.temperatureK;
        }
        if (lightingAnalysis.lightSource?.xPercent !== undefined) {
          sceneCtx.lightSourceXPercent = lightingAnalysis.lightSource.xPercent;
        }
        if (lightingAnalysis.lightSource?.intensity) {
          sceneCtx.lightIntensity = lightingAnalysis.lightSource.intensity;
        }
        if (lightingAnalysis.colorThermal?.ambientDarkness !== undefined) {
          sceneCtx.ambientDarkness = lightingAnalysis.colorThermal.ambientDarkness;
        }

        const isV2 = !lightingAnalysis._legacyMode;
        console.log(
          `[COMPOSITE-GENERATE][preserveOriginal] [PRODUCT-AWARE-${isV2 ? 'v2' : 'legacy'}] Compositing override:` +
          ` lightTemp ${origTemp}K→${sceneCtx.lightTemperatureK}K` +
          ` lightXPct ${origXPct}%→${sceneCtx.lightSourceXPercent}%` +
          ` intensity ${origIntensity}→${sceneCtx.lightIntensity}` +
          ` darkness ${origDarkness}→${sceneCtx.ambientDarkness}` +
          (isV2 ? ` | dropShadow=${lightingAnalysis.shadow?.hasDropShadow} | scenario=${lightingAnalysis.meta?.lightingScenario}` : '')
        );
      }

      // surfaceY = derived from our TARGET, not from Claude Vision guess'''

content = INDEX.read_text(encoding="utf-8")

start_idx = content.find(OLD_MARKER_START)
end_idx = content.find(OLD_MARKER_END)

if start_idx == -1:
    print("ERROR: Could not find old block start marker")
    # Try without leading spaces
    OLD_MARKER_START2 = "// ── Product-aware BG analysis (optional)"
    start_idx = content.find(OLD_MARKER_START2)
    if start_idx == -1:
        print("ERROR: Still cannot find block. Searching...")
        idx = content.find("Product-aware BG analysis")
        print(f"Found at idx: {idx}")
        print(repr(content[max(0,idx-10):idx+100]))
        exit(1)

if end_idx == -1:
    print("ERROR: Could not find end marker")
    exit(1)

print(f"Found block from char {start_idx} to {end_idx}")
print(f"Block length: {end_idx - start_idx} chars, {content[start_idx:end_idx].count(chr(10))} lines")

new_content = content[:start_idx] + NEW_BLOCK + "\n      " + content[end_idx:]
INDEX.write_text(new_content, encoding="utf-8")
print(f"Done. File size: {len(new_content):,} bytes")
