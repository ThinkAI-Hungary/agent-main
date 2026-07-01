#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Patches the /api/image/analyze endpoint in index.ts with the new
physics-based LightingAnalysis prompt and 2500 max_tokens.
"""
import pathlib, re

INDEX = pathlib.Path(
    r"C:/Users/Zombo/Desktop/Antigrav/agentmain_digidesk/agent-main/z/kepgeneralas/server/src/index.ts"
)

# ── The new analyze endpoint (replaces lines 1128-1226) ─────────────────────
NEW_ANALYZE = r"""app.post('/api/image/analyze', async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) {
    return res.status(400).json({ error: 'imageUrl is required.' });
  }

  console.log(`[ANALYZE] Request received for image: ${imageUrl}`);
  const start = Date.now();

  try {
    const imageContentBlock = await fetchImageAsClaudeBlock(imageUrl);

    // ── Phase 1: Basic analysis (imageType, subject, text, changeability) ──
    const basicSystemPrompt = `You are a professional image analysis AI. You must analyze the uploaded image and return a JSON object.
You MUST output ONLY a valid JSON object. Do not output markdown backticks, explanations, or trailing commas.

CRITICAL RULES:
1. DO NOT output specific brand names, company names, logos, or model names in "subject" or "altText". Use generic descriptions.
2. For "extractedText", write the EXACT letters/text written on the object, even if it contains brand names.
3. COMPLETELY IGNORE the background. Only describe and analyze the foreground subject.
4. For Hungarian paint buckets, ensure correct spelling: "koromfoltokra" (NOT "körömfoltokra").

JSON format:
{
  "imageType": "product" | "model" | "scene" | "logo" | "lifestyle" | "mixed",
  "subject": "Precise generic English description of the foreground subject. NO brand names.",
  "altText": "A detailed descriptive alt text of the subject.",
  "dominantColors": ["color1", "color2"],
  "hasText": boolean,
  "extractedText": "The exact text written on the object, preserving exact branding/letters.",
  "textPlacement": "Hungarian description of where the text is located on the object.",
  "textLegibility": "clear" | "blurry" | "illegible",
  "changeabilityRules": {
    "canChangeBackground": true,
    "canChangeColors": true,
    "canChangeShape": true,
    "canChangeTexture": true,
    "mustPreserveExactly": ["exact details to preserve"],
    "allowedModifications": ["details that can be modified"]
  },
  "fluxPromptSuffix": "vivid, photographic style, realistic details, high resolution",
  "fluxNegativeSuffix": "blurry, low quality, stylized, drawing",
  "confidence": 0.95
}`;

    const modelName = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    console.log(`[ANALYZE] Invoking Claude Vision (basic): ${modelName}`);

    const basicResponse = await anthropic.messages.create({
      model: modelName,
      max_tokens: 1000,
      temperature: 0.2,
      system: basicSystemPrompt,
      messages: [{ role: 'user', content: [imageContentBlock, { type: 'text', text: 'Analyze this image and return the JSON object following the strict rules.' }] }],
    });

    const basicText = basicResponse.content[0].type === 'text' ? basicResponse.content[0].text : '';
    console.log(`[ANALYZE] Basic response:`, basicText);
    const parsed = JSON.parse(extractJsonStr(basicText));

    // Normalize changeability rules based on type
    const imageType = parsed.imageType || 'product';
    let locked = parsed.locked !== undefined ? parsed.locked : false;
    if (imageType === 'product' || imageType === 'logo') {
      locked = true;
      if (!parsed.changeabilityRules) parsed.changeabilityRules = {};
      parsed.changeabilityRules.canChangeBackground = true;
      parsed.changeabilityRules.canChangeColors = false;
      parsed.changeabilityRules.canChangeShape = false;
      parsed.changeabilityRules.canChangeTexture = false;
    } else if (imageType === 'model') {
      locked = false;
      if (!parsed.changeabilityRules) parsed.changeabilityRules = {};
      parsed.changeabilityRules.canChangeBackground = true;
      parsed.changeabilityRules.canChangeColors = true;
      parsed.changeabilityRules.canChangeShape = false;
      parsed.changeabilityRules.canChangeTexture = false;
    }

    let analysisResult: any = { ...parsed, imageType, locked };

    // ── Phase 2: LightingAnalysis (physics-based, full 9-block JSON) ─────────
    // Always run for product/model images — used by productAwareBg mode
    if (imageType === 'product' || imageType === 'model' || imageType === 'lifestyle') {
      try {
        console.log(`[ANALYZE] Invoking Claude Vision (LightingAnalysis physics)...`);
        const lightingSystemPrompt = `You are an expert product photographer and 3D rendering physicist.
Analyze the product image and return a SINGLE valid JSON object with the key "lightingAnalysis".
Use physical laws to derive all numeric values. Do NOT invent values — derive them from what you see.

PHYSICS LAWS YOU MUST APPLY:
- Lambert's Law: I = I0 * cos(theta). At 90deg overhead: top=100%, 60deg=87%, 45deg=50% brightness.
- Shadow length: L = H / tan(theta). At 90deg: L=0 (no drop shadow). At 45deg: L=H. At 30deg: L=1.73*H.
- Fresnel: Plastic IOR~1.5, edges brighter than face (grazing angle glow).
- SSS: White plastic = weak SSS (warm edge glow when backlit). Wax/skin = strong SSS.
- Kelvin: Look at the white surface color cast. Warm yellow=2700-3200K. Neutral=4500K. Cool blue=6500K+.
- RGB color cast on white: 2700K=[+35,+12,-28]. 3200K=[+22,+8,-18]. 5500K=[0,0,0]. 6500K=[-12,+2,+20].
- Contact shadow: ALWAYS present at product base. Width = product_width * 0.68.
- AO halo: Width = product_width * 0.95. Always blur 15-30px.
- Drop shadow: Only if theta < 85deg. Direction = OPPOSITE to light.

OUTPUT FORMAT - return ONLY this JSON, no extra text, no markdown:
{
  "lightingAnalysis": {
    "lightSource": {
      "type": "spot"|"area"|"ambient_only"|"three_point"|"mixed"|"backlit",
      "directionAngle": <number 0-90, degrees from horizontal — 90=directly above>,
      "directionLabel": "top"|"top-left"|"top-right"|"left"|"right"|"back"|"front",
      "xPercent": <number 0-100, horizontal position of light — 50=center>,
      "yPercent": <number 0-100, 0=ceiling 100=floor>,
      "temperatureK": <number 1800-10000>,
      "temperatureLabel": "warm tungsten"|"neutral white"|"cool daylight"|"very cool",
      "colorCastRgb": [<R_shift -50 to +50>, <G_shift>, <B_shift>],
      "intensity": "hard"|"medium"|"soft",
      "sourceSizeLabel": "point"|"small_spot"|"large_area"|"diffuse",
      "isThreePoint": <boolean>,
      "keyLightIntensity": <number 0-100>,
      "fillLightIntensity": <number 0-100>,
      "rimLightIntensity": <number 0-100>,
      "fillRatio": <number 0-1, fill/key ratio>,
      "hasVolumetricLight": <boolean, Tyndall dust/fog beam visible>,
      "hasMultipleSourcesIBL": <boolean>
    },
    "shadow": {
      "hasDropShadow": <boolean, false if directionAngle >= 85>,
      "dropDirection": "none"|"front"|"right"|"left"|"back"|"front-right"|"front-left",
      "dropLengthRatio": <number, L/H = 1/tan(theta). 0 if no drop shadow>,
      "dropLengthPx": <number, estimated pixels based on object size in image>,
      "dropOffsetX": <number, signed px: positive=right>,
      "dropOffsetY": <number, signed px: positive=down>,
      "dropOpacity": <number 0-1>,
      "dropBlurPx": <number, penumbra blur. 3=hard 15=medium 30=soft>,
      "dropWidthMultiplier": <number 1.0-1.5>,
      "contactShadow": {
        "widthMultiplier": <number, typically 0.68>,
        "heightMultiplier": <number, typically 0.04>,
        "opacity": <number 0.80-0.95>,
        "blurPx": <number 2-5>
      },
      "aoHalo": {
        "widthMultiplier": <number, typically 0.92-0.98>,
        "heightMultiplier": <number, typically 0.12-0.18>,
        "opacity": <number 0.35-0.55>,
        "blurPx": <number 15-30>
      },
      "penumbraWidth": "none"|"narrow"|"medium"|"wide",
      "umbraDarkness": <number 0-100>,
      "formShadowPresent": <boolean, is there a darker shadow side on the product itself?>,
      "formShadowSide": "left"|"right"|"none"
    },
    "material": {
      "roughness": <number 0.0-1.0. 0=mirror, 0.3=glossy plastic, 0.55=white PP, 0.9=paper>,
      "metallic": <number 0.0=plastic/wood, 1.0=metal>,
      "ior": <number, 1.0=air, 1.49=white_PP, 1.5=glass, 2.5=metal>,
      "specularIntensity": <number 0-1, default 0.5 for dielectric>,
      "albedoRgb": [<R 0-255>, <G 0-255>, <B 0-255>],
      "hasSSS": <boolean>,
      "sssStrength": "none"|"weak"|"medium"|"strong",
      "sssColorShift": "warm"|"neutral"|"none",
      "fresnelEdgeGlow": <boolean, are the edges brighter than center?>,
      "fresnelIntensity": "subtle"|"medium"|"strong",
      "materialType": "white_plastic"|"colored_plastic"|"glossy_plastic"|"metal_matte"|"metal_glossy"|"glass"|"paper_label"|"fabric"|"wood"|"other",
      "specular": {
        "zoneTopPct": <number 0-25, specular zone = top X% of product height>,
        "widthMultiplier": <number, typical 0.45-0.65 of obj_width>,
        "opacity": <number 0.20-0.50>,
        "blurPx": <number 3-8>,
        "hasSharpGlint": <boolean>
      }
    },
    "colorThermal": {
      "ambientTintRgb": [<R 0-255>, <G 0-255>, <B 0-255>],
      "ambientTintOpacity": <number 0-0.25, higher in darker scenes>,
      "ambientDarkness": <number 0-100, 0=bright white studio, 100=very dark moody>,
      "hasColorBleeding": <boolean>,
      "bleedingSourceColor": [<R>, <G>, <B>] or null,
      "bleedingOpacity": <number 0-0.15>,
      "simultaneousContrastCorrection": <boolean>,
      "bgDominantColor": [<R>, <G>, <B>],
      "sceneDynamicRange": "low"|"medium"|"high"
    },
    "compositing": {
      "rimDarkening": {
        "side": "left"|"right"|"none",
        "widthMultiplier": <number 0.15-0.25>,
        "opacity": <number, ambientDarkness * 0.0042>,
        "blurPx": <number 6-10>
      },
      "formShadowGradient": {
        "enabled": <boolean>,
        "direction": "top-to-bottom"|"side",
        "topBrightness": <number 0.8-1.0>,
        "bottomBrightness": <number 0.2-0.5>,
        "opacity": <number 0.15-0.40>
      },
      "rimLight": {
        "side": "left"|"right"|"top"|"none",
        "widthMultiplier": <number 0.12-0.20>,
        "opacity": <number 0.15-0.50>,
        "blurPx": <number 3-8>
      },
      "lightWrap": {
        "bgBlurPx": <number 50-80>,
        "expandPx": <number 15-30>,
        "opacity": <number 0.08-0.28>
      },
      "tableReflection": {
        "enabled": <boolean>,
        "heightMultiplier": <number 0.15-0.25>,
        "opacity": <number 0.05-0.40>,
        "blurPx": <number 20-40>,
        "surfaceType": "metal"|"lacquered_wood"|"matte_wood"|"glass"|"concrete"
      },
      "overallLayerCount": <number 6-12>
    },
    "placement": {
      "cameraAngle": "eye-level"|"slightly-above"|"low-angle"|"bird-eye",
      "cameraFOV": "wide"|"normal"|"telephoto",
      "perspectiveDistortion": "none"|"slight"|"strong",
      "productTopYPct": <number 0-100, product top position in frame>,
      "productBottomYPct": <number 0-100, product bottom in frame>,
      "surfaceYPct": <number 0-100, table/surface top edge in frame>,
      "headroomPct": <number 0-100, air above product>,
      "tablespacePct": <number 0-100, table foreground below product>,
      "productCenterXPct": <number 0-100, horizontal center of product>,
      "compositionStyle": "centered"|"thirds"|"asymmetric",
      "productScalePct": <number, product height as % of total frame height>
    },
    "prompts": {
      "bgLightingPrompt": "<10-20 word English phrase describing ideal background lighting to match this product>",
      "bgNegativePrompt": "<things to avoid in background based on product's lighting>",
      "materialPromptSuffix": "<material-specific prompt additions for FLUX>",
      "volumetricLightPrompt": "<only if hasVolumetricLight=true, else empty string>",
      "sssEdgePrompt": "<only if hasSSS=true, describe edge glow, else empty>",
      "fresnelPrompt": "<only if fresnelEdgeGlow=true, describe edge highlight, else empty>",
      "threePointPrompt": "<only if isThreePoint=true, describe setup, else empty>",
      "compositionPrompt": "product centered at approximately X% horizontally, surface at Y%, generous headroom above",
      "fullBgPrompt": "<COMPLETE combined background prompt for FLUX, 30-60 words, ready to use directly>"
    },
    "checkup": {
      "expectedShadowBehavior": "<describe what shadow should look like based on physics>",
      "expectedSpecularZone": "<where specular should appear on product>",
      "expectedGradient": "<describe expected brightness gradient on product>",
      "expectedAmbientTint": "<describe expected color cast on white surfaces>",
      "activeRisks": [
        {
          "riskId": "<UPPERCASE_SNAKE_CASE identifier>",
          "description": "<what could go wrong>",
          "checkPrompt": "<question to ask Claude during checkup>",
          "severity": "critical"|"major"|"minor",
          "autoFixable": <boolean>
        }
      ],
      "shadowPhysicsMinScore": <number 0-25>,
      "integrationMinScore": <number 0-25>,
      "contactShadowMinScore": <number 0-20>,
      "specularMinScore": <number 0-15>,
      "placementMinScore": <number 0-15>,
      "totalMinScore": <number, sum of above minimums>,
      "criticalFailConditions": ["<condition1>", "<condition2>"]
    },
    "meta": {
      "analysisVersion": "2.0",
      "analysisTimestamp": "<ISO timestamp>",
      "claudeConfidence": <number 0-1>,
      "bookChaptersUsed": ["<chapter refs used like 1.2, 2.3, 4.2, 8.1>"],
      "lightingScenario": "overhead_spot"|"side_45"|"side_30_dramatic"|"three_point"|"backlit"|"diffuse_ambient"|"mixed_complex"
    }
  }
}`;

        const lightingResp = await anthropic.messages.create({
          model: modelName,
          max_tokens: 2500,
          temperature: 0.1,
          system: lightingSystemPrompt,
          messages: [{ role: 'user', content: [imageContentBlock, {
            type: 'text',
            text: 'Analyze this product image using the physics laws provided. Return ONLY the JSON with lightingAnalysis key. Derive all numbers from what you observe — do not guess randomly.'
          }] }],
        });

        const lightingText = lightingResp.content[0].type === 'text' ? lightingResp.content[0].text : '{}';
        console.log(`[ANALYZE] LightingAnalysis raw response (first 500 chars):`, lightingText.slice(0, 500));
        const lightingParsed = JSON.parse(extractJsonStr(lightingText));
        if (lightingParsed.lightingAnalysis) {
          analysisResult.lightingAnalysis = lightingParsed.lightingAnalysis;
          console.log(`[ANALYZE] ✅ LightingAnalysis attached — scenario: ${lightingParsed.lightingAnalysis.meta?.lightingScenario} | theta: ${lightingParsed.lightingAnalysis.lightSource?.directionAngle}° | K: ${lightingParsed.lightingAnalysis.lightSource?.temperatureK}K`);
        }
      } catch (lightingErr: any) {
        console.warn(`[ANALYZE] ⚠️ LightingAnalysis phase failed (${lightingErr.message}) — continuing without it`);
      }
    }

    // Optimize descriptions using DeepSeek if available
    analysisResult = await optimizeAnalysisWithDeepSeek(analysisResult);

    console.log(`[ANALYZE] ✅ Analysis complete in ${Date.now() - start}ms`);
    res.json({ results: [analysisResult] });
  } catch (err: any) {
    console.error(`[ANALYZE] Error analyzing image:`, err);
    res.status(500).json({ error: 'Failed to analyze image', details: err.message });
  }
});"""

content = INDEX.read_text(encoding="utf-8")

# Find the old analyze endpoint block and replace it
old_start = "app.post('/api/image/analyze', async (req, res) => {"
old_end = "// Route: Composite image generation"

start_idx = content.find(old_start)
end_idx = content.find(old_end)

if start_idx == -1:
    print("ERROR: Could not find analyze endpoint start")
    exit(1)
if end_idx == -1:
    print("ERROR: Could not find composite-generate comment marker")
    exit(1)

new_content = content[:start_idx] + NEW_ANALYZE + "\n\n" + content[end_idx:]
INDEX.write_text(new_content, encoding="utf-8")

old_lines = content[start_idx:end_idx].count("\n")
new_lines = NEW_ANALYZE.count("\n")
print(f"Replaced analyze endpoint: {old_lines} lines -> {new_lines} lines")
print(f"File size: {len(new_content):,} bytes")
