import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';

import { scrapeWebsite } from './scraper.js';
import {
  analyzeBrandKit,
  orchestrateCreatives,
  orchestrateCampaign,
  orchestrateSingleCreative,
  GeneratedPostVariant
} from './orchestrator.js';
import { renderPost, renderPolotnoJSON } from './renderer.js';
import { runOverlayPipeline } from './generator/pipeline.js';
import { BrandKit, PostCreative, Campaign, CampaignItem } from './types.js';
import { uploadToFal, removeBackground, compositeProduct, harmonizeImage } from './compositor.js';
import fs from 'fs';
// OpenAI import removed — using Bria Product Shot via fal.ai

// ═══════════════════════════════════════════════════════════════════════════════
// FLUX.2 [flex] HELPER — BFL Direct API (recommended for label/packaging + general use)
// Defaults: safety_tolerance=1, guidance=4.5, steps=50
// ═══════════════════════════════════════════════════════════════════════════════

async function generateWithFluxFlex(
  prompt: string,
  width: number,
  height: number,
  opts?: { safetyTolerance?: number; guidance?: number; steps?: number; aspectRatio?: string; inputImage?: string; inputImage2?: string }
): Promise<string> {
  const bflKey = process.env.BFL_API_KEY;
  if (!bflKey) throw new Error('BFL_API_KEY is not configured in .env');

  const safetyTol = opts?.safetyTolerance ?? 1;
  const guidance  = opts?.guidance ?? 4.5;
  const steps     = opts?.steps ?? 50;
  const ar        = opts?.aspectRatio ?? '2:3';

  console.log(`[FLEX] Submitting to BFL FLUX.2 [flex] — ${width}x${height} | guidance=${guidance} steps=${steps}`);
  console.log(`[FLEX] Prompt: "${prompt.substring(0, 100)}..."`);

  const payload: any = {
    prompt,
    aspect_ratio: ar,
    width,
    height,
    output_format: 'jpeg',
    safety_tolerance: safetyTol,
    guidance,
    steps,
  };

  if (opts?.inputImage) {
    payload.input_image = opts.inputImage;
    if (opts.inputImage2) {
      payload.input_image_2 = opts.inputImage2;
    }
  }

  // Step 1: Submit generation task
  const submitResponse = await axios.post(
    'https://api.bfl.ai/v1/flux-2-flex',
    payload,
    {
      headers: { 'X-Key': bflKey, 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  );

  const taskId = submitResponse.data?.id;
  const pollingUrl = submitResponse.data?.polling_url;
  if (!taskId || !pollingUrl) {
    throw new Error(`BFL submit failed: ${JSON.stringify(submitResponse.data)}`);
  }
  console.log(`[FLEX] Task submitted: ${taskId}`);

  // Step 2: Poll until Ready
  const pollStart = Date.now();
  const maxPollMs = 120000; // 2 minutes max

  while (Date.now() - pollStart < maxPollMs) {
    await new Promise(r => setTimeout(r, 2000));

    const statusResp = await axios.get(pollingUrl, {
      headers: { 'X-Key': bflKey },
      timeout: 10000,
    });

    const { status, result } = statusResp.data;
    console.log(`[FLEX] Poll: ${status} (${((Date.now() - pollStart) / 1000).toFixed(0)}s)`);

    if (status === 'Ready') {
      const imageUrl = result?.sample;
      if (!imageUrl) throw new Error('BFL returned Ready but no sample URL');
      console.log(`[FLEX] ✅ Done in ${((Date.now() - pollStart) / 1000).toFixed(1)}s → ${imageUrl.substring(0, 80)}...`);
      return imageUrl;
    } else if (status === 'Failed') {
      throw new Error(`BFL Flex task failed: ${JSON.stringify(statusResp.data?.error || statusResp.data)}`);
    }
  }

  throw new Error('BFL Flex task timed out after 2 minutes');
}

// Backwards-compat alias
const generateWithFlux2 = generateWithFluxFlex;

// Reload trigger comment - updated model to sonnet 4.6
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const app = express();
const port = process.env.PORT || 3001;

function getFallbackImage(brandKit: BrandKit): string {
  let fallback = 'https://images.unsplash.com/photo-1490730141103-6cac27aaab94?auto=format&fit=crop&q=80&w=1080'; // default sunrise
  if (brandKit && brandKit.name) {
    const name = brandKit.name.toLowerCase();
    if (name.includes('festék') || name.includes('paint') || name.includes('piktor') || name.includes('diy') || name.includes('szín')) {
      fallback = 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&q=80&w=1080';
    } else if (name.includes('kávé') || name.includes('coffee') || name.includes('cafe') || name.includes('latte')) {
      fallback = 'https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&q=80&w=1080';
    }
  }
  return fallback;
}

// CORS setup to allow react frontend dev server
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static rendered images
const rendersDir = path.resolve(__dirname, '../renders');
app.use('/renders', express.static(rendersDir));

// Route 1: Scrape website and extract Brand Kit (v1)
app.post('/api/extract', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL param is required.' });
  }

  try {
    console.log(`[SCRAPE] Starting brand extraction for: ${url}`);
    const scraped = await scrapeWebsite(url);
    
    console.log(`[AI] Invoking Claude Sonnet for brand kit analysis...`);
    const analyzedKit = await analyzeBrandKit(scraped);

    // Fill in default version metadata
    const finalBrandKit: BrandKit = {
      id: `kit-v1`,
      version: 1,
      createdAt: new Date().toISOString(),
      name: (analyzedKit as any).name || 'Brand',
      colors: {
        primary: analyzedKit.colors?.primary || '#3E2723',
        secondary: analyzedKit.colors?.secondary || '#F5F5DC',
        accent: analyzedKit.colors?.accent || '#FF8F00',
        rules: analyzedKit.colors?.rules || 'Elsődleges háttérnek, másodlagos kontrasztos elemeknek.'
      },
      typography: {
        fontName: analyzedKit.typography?.fontName || 'Montserrat',
        titleSize: analyzedKit.typography?.titleSize || '48px',
        subtitleSize: analyzedKit.typography?.subtitleSize || '22px',
        bodySize: analyzedKit.typography?.bodySize || '15px',
        maxLineLength: analyzedKit.typography?.maxLineLength || 40
      },
      logoUrl: '', // Default SVG design
      logoPosition: analyzedKit.logoPosition || 'top-left',
      tone: analyzedKit.tone || ['meleg', 'direkt', 'barátságos'],
      toneExampleGood: analyzedKit.toneExampleGood || 'Példa szöveg...',
      toneExampleBad: analyzedKit.toneExampleBad || 'Rossz példa szöveg...',
      visualRules: analyzedKit.visualRules || ['Mindig közeli makró', 'Természetes meleg fények'],
      negativePrompt: analyzedKit.negativePrompt || 'people, faces, plastic, neon light, office',
      brandDna: analyzedKit.brandDna
    };

    console.log(`[SUCCESS] Brand Kit v1 extracted successfully for: ${url}`);
    res.json(finalBrandKit);
  } catch (err: any) {
    console.error('Error extracting brand kit:', err);
    res.status(500).json({ error: 'Failed to extract Brand Kit', details: err.message });
  }
});

// Route 2: Generate 4 Post Creatives based on brief and Brand Kit
app.post('/api/generate', async (req, res) => {
  const { brief, brandKit, pastApproved = [] } = req.body;
  if (!brief || !brandKit) {
    return res.status(400).json({ error: 'Brief and brandKit params are required.' });
  }

  try {
    console.log(`[ORCHESTRATE] Starting generation brief: "${brief}"`);
    const plannedVariants: GeneratedPostVariant[] = await orchestrateCreatives(brief, brandKit, pastApproved);
    
    const creatives: PostCreative[] = [];
    const briefId = `brief-${Date.now()}`;

    // Process all 4 planned post layouts in parallel
    const promises = plannedVariants.map(async (variant, idx) => {
      console.log(`[VARIANT ${idx+1}/4] Processing ${variant.templateId} template...`);
      
      // 1. Generate image with Flux 2 Pro (BFL direct API)
      let imageUrl = '';
      if (process.env.BFL_API_KEY) {
        try {
          const fullPrompt = `${variant.imagePrompt}, visual style matching rules: ${brandKit.visualRules.join(', ')}`;
          imageUrl = await generateWithFlux2(fullPrompt, 768, 960, { aspectRatio: '4:5', safetyTolerance: 1, guidance: 4.5, steps: 50 });
          console.log(`[FLUX2] Image generated for variant ${idx+1}: ${imageUrl}`);
        } catch (imageErr: any) {
          console.error(`[FLUX2] Image generation failed for variant ${idx+1}:`, imageErr.message);
          // Fallback image url if generator fails
          imageUrl = getFallbackImage(brandKit);
        }
      } else {
        console.log(`[FLUX2] BFL_API_KEY not configured, using fallback image.`);
        imageUrl = getFallbackImage(brandKit);
      }

      // 2. Local rendering using Playwright
      console.log(`[RENDER] Playwright screenshotting layout: ${variant.templateId}`);
      const localRenderPath = await renderPost(variant, brandKit, imageUrl);
      console.log(`[RENDER] Screenshot saved at: ${localRenderPath}`);

      const postCreative: PostCreative = {
        id: `creative-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
        briefId,
        templateId: variant.templateId,
        status: 'draft',
        text: variant.text,
        cta: variant.cta,
        imageUrl: localRenderPath,
        originalImageUrl: imageUrl,
        imagePrompt: variant.imagePrompt,
        colorVariation: variant.colorVariation,
        logoVariant: variant.logoVariant,
        createdAt: new Date().toISOString()
      };

      creatives.push(postCreative);
    });

    await Promise.all(promises);
    console.log(`[SUCCESS] 4 creatives generated and rendered.`);
    res.json(creatives);
  } catch (err: any) {
    console.error('Error generating creatives:', err);
    res.status(500).json({ error: 'Failed to generate creatives', details: err.message });
  }
});

// Route 2.5: Generate a single custom creative from scratch or custom prompt
app.post('/api/generate-adhoc', async (req, res) => {
  const { brief, brandKit, customText, customImagePrompt, templateId, colorVariation, logoVariant, cta, productImageUrl, preprocessedImageUrl } = req.body;
  if (!brandKit || !templateId) {
    return res.status(400).json({ error: 'brandKit and templateId params are required.' });
  }

  try {
    let postText = customText || '';
    let postCta = cta || '';
    let postImagePrompt = customImagePrompt || '';
    let postColorVariation = colorVariation || 'default';
    let postLogoVariant = logoVariant || 'dark';

    // 1. If we don't have custom text or custom prompt, let Claude generate them!
    if (!customText || !customImagePrompt) {
      console.log(`[ADHOC] Orchestrating single creative using Claude for template: ${templateId}`);
      const orchestrated = await orchestrateSingleCreative(brief || 'Általános promóció', brandKit, templateId);
      if (!postText) postText = orchestrated.text;
      if (!postCta) postCta = orchestrated.cta || '';
      if (!postImagePrompt) postImagePrompt = orchestrated.imagePrompt;
      if (!colorVariation) postColorVariation = orchestrated.colorVariation;
      if (!logoVariant) postLogoVariant = orchestrated.logoVariant;
    }

    // 2. Generate image using Flux 2 Pro
    let imageUrl = '';
    if (process.env.BFL_API_KEY) {
      try {
        const fullPrompt = `${postImagePrompt}, visual style matching rules: ${brandKit.visualRules.join(', ')}`;
        imageUrl = await generateWithFlux2(fullPrompt, 768, 960, {
          aspectRatio: '4:5',
          safetyTolerance: 1,
          guidance: 4.5,
          steps: 50,
          inputImage: preprocessedImageUrl || productImageUrl,
          inputImage2: preprocessedImageUrl ? productImageUrl : undefined
        });
        console.log(`[ADHOC-FLUX2] Image generated: ${imageUrl}`);
      } catch (imageErr: any) {
        console.error(`[ADHOC-FLUX2] Image generation failed:`, imageErr.message);
        imageUrl = getFallbackImage(brandKit);
      }
    } else {
      console.log(`[ADHOC-FLUX2] BFL_API_KEY not configured, using fallback image.`);
      imageUrl = getFallbackImage(brandKit);
    }

    // 3. Render Playwright overlay
    const variant = {
      templateId,
      logoVariant: postLogoVariant,
      colorVariation: postColorVariation,
      text: postText,
      cta: postCta
    };

    console.log(`[ADHOC-RENDER] Playwright screenshotting layout: ${templateId}`);
    const localRenderPath = await renderPost(variant, brandKit, imageUrl);
    console.log(`[ADHOC-RENDER] Screenshot saved at: ${localRenderPath}`);

    const postCreative: PostCreative = {
      id: `creative-adhoc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      briefId: `brief-adhoc-${Date.now()}`,
      templateId,
      status: 'scheduled',
      text: postText,
      cta: postCta,
      imageUrl: localRenderPath,
      originalImageUrl: imageUrl,
      imagePrompt: postImagePrompt,
      colorVariation: postColorVariation,
      logoVariant: postLogoVariant,
      createdAt: new Date().toISOString()
    };

    res.json(postCreative);
  } catch (err: any) {
    console.error('Error generating adhoc creative:', err);
    res.status(500).json({ error: 'Failed to generate creative', details: err.message });
  }
});

// Route 3: Re-render copy updates
app.post('/api/render-update', async (req, res) => {
  const { post, brandKit, text } = req.body;
  if (!post || !brandKit || text === undefined) {
    return res.status(400).json({ error: 'post, brandKit, and text are required.' });
  }

  try {
    console.log(`[RE-RENDER] Updating post text content...`);
    const updatedVariant = {
      ...post,
      text: text
    };

    // Keep the same image but re-screenshot layouts with Playwright
    const bgImage = post.originalImageUrl || post.imageUrl;
    const localRenderPath = await renderPost(updatedVariant, brandKit, bgImage);
    console.log(`[RE-RENDER] Screenshot updated at: ${localRenderPath}`);

    const updatedPost: PostCreative = {
      ...post,
      text: text,
      imageUrl: localRenderPath,
      originalImageUrl: post.originalImageUrl || post.imageUrl
    };

    res.json(updatedPost);
  } catch (err: any) {
    console.error('Error updating text render:', err);
    res.status(500).json({ error: 'Failed to update render', details: err.message });
  }
});

// Expose custom PolotnoJSON rendering endpoint
app.post('/api/render-polotno', async (req, res) => {
  const { layoutJson } = req.body;
  if (!layoutJson) {
    return res.status(400).json({ error: 'layoutJson param is required.' });
  }
  try {
    console.log(`[RE-RENDER] Rendering custom PolotnoJSON layout...`);
    const localRenderPath = await renderPolotnoJSON(layoutJson);
    res.json({ imageUrl: localRenderPath });
  } catch (err: any) {
    console.error('Error rendering custom PolotnoJSON:', err);
    res.status(500).json({ error: 'Failed to render PolotnoJSON', details: err.message });
  }
});


// Route 4: Image upload & background removal (preprocess)
app.post('/api/image/preprocess', async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'Image base64 data is required.' });
  }

  const start = Date.now();
  console.log(`\n[PREPROCESS] Starting image preprocessing (base64 length: ${image.length} chars)`);

  try {
    if (!fs.existsSync(rendersDir)) {
      fs.mkdirSync(rendersDir, { recursive: true });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const tempFile = path.join(rendersDir, `uploaded-${Date.now()}.png`);
    fs.writeFileSync(tempFile, base64Data, { encoding: 'base64' });
    const fileSize = fs.statSync(tempFile).size;
    console.log(`[PREPROCESS] Saved temp file: ${tempFile} (${(fileSize / 1024).toFixed(1)} KB)`);

    console.log('[PREPROCESS] Step 1/2: Uploading to Fal.ai CDN...');
    const baseCdnUrl = await uploadToFal(tempFile);
    
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }

    console.log('[PREPROCESS] Step 2/2: Bria AI background removal...');
    const isolatedUrl = await removeBackground(baseCdnUrl);
    
    console.log(`[PREPROCESS] ✅ Complete in ${Date.now() - start}ms → ${isolatedUrl.substring(0, 80)}...`);
    res.json({ url: isolatedUrl, originalUrl: baseCdnUrl });
  } catch (err: any) {
    console.error(`[PREPROCESS] ❌ Failed after ${Date.now() - start}ms: ${err.message}`);
    res.status(500).json({ error: 'Failed to preprocess image', details: err.message });
  }
});

// Route 5: Direct image generation test (Bria, Flux+IP, or BFL)
app.post('/api/test-image', async (req, res) => {
  const { productImageUrl, preprocessedImageUrl, scenePrompt, model, ipStrength, cnStrength, guidanceScale, numSteps,
    briaPlacement, briaPositions, briaOptimize, briaFast, briaShotSize,
    safetyTolerance, bflAspectRatio, bflRaw, imagePromptStrength, width, height,
    guidance, aspectRatio, steps } = req.body;
  if (!scenePrompt) {
    return res.status(400).json({ error: 'scenePrompt is required.' });
  }
  
  const start = Date.now();
  console.log(`\n[TEST-IMAGE] Model: ${model}, Product: ${productImageUrl ? 'yes' : 'no'}, Preprocessed: ${preprocessedImageUrl ? 'yes' : 'no'}`);
  console.log(`[TEST-IMAGE] Prompt: "${scenePrompt.substring(0, 80)}..."`);
  
  try {
    let imageUrl = '';
    let usedModel = model || 'bria';
    
    if (model && model.startsWith('bfl-')) {
      // === BLACK FOREST LABS (BFL) DIRECT API CALL ===
      const bflKey = process.env.BFL_API_KEY;
      if (!bflKey) {
        throw new Error('BFL_API_KEY is not configured in .env');
      }

      const isFlex = model === 'bfl-flux-2-flex';
      const isUltra = model === 'bfl-flux-pro-1.1-ultra';
      const endpoint = model === 'bfl-flux-2-max'
        ? 'https://api.bfl.ai/v1/flux-2-max'
        : isFlex
        ? 'https://api.bfl.ai/v1/flux-2-flex'
        : isUltra
        ? 'https://api.bfl.ai/v1/flux-pro-1.1-ultra'
        : 'https://api.bfl.ai/v1/flux-2-pro';

      console.log(`[TEST-IMAGE] [BFL] Direct API call using endpoint: ${endpoint}`);

      let bflPayload: any = {
        prompt: scenePrompt,
        output_format: 'jpeg',
        safety_tolerance: safetyTolerance !== undefined ? Number(safetyTolerance) : 1
      };

      if (isFlex) {
        // FLUX.2 [flex] — BFL's recommended model for label/packaging/typography
        bflPayload.aspect_ratio = aspectRatio || bflAspectRatio || '2:3';
        bflPayload.guidance = guidance !== undefined ? Number(guidance) : 4.5;
        bflPayload.steps = steps !== undefined ? Math.min(50, Math.max(1, Number(steps))) : 50;
        if (width) bflPayload.width = Number(width);
        if (height) bflPayload.height = Number(height);
        // Image referencing for Flex
        if (preprocessedImageUrl) {
          bflPayload.input_image = preprocessedImageUrl;
          if (productImageUrl) bflPayload.input_image_2 = productImageUrl;
        } else if (productImageUrl) {
          bflPayload.input_image = productImageUrl;
        }
      } else if (isUltra) {
        bflPayload.aspect_ratio = bflAspectRatio || '2:3';
        bflPayload.raw = bflRaw === true;
        if (preprocessedImageUrl || productImageUrl) {
          bflPayload.image_prompt = preprocessedImageUrl || productImageUrl;
          bflPayload.image_prompt_strength = imagePromptStrength !== undefined ? Number(imagePromptStrength) : 0.1;
        }
      } else {
        // Pro / Max: fixed width + height
        bflPayload.width = width ? Number(width) : 1024;
        bflPayload.height = height ? Number(height) : 1536;
        if (preprocessedImageUrl) {
          bflPayload.input_image = preprocessedImageUrl;
          if (productImageUrl) bflPayload.input_image_2 = productImageUrl;
        } else if (productImageUrl) {
          bflPayload.input_image = productImageUrl;
        }
      }

      console.log(`[TEST-IMAGE] [BFL] Sending payload to BFL:`, JSON.stringify(bflPayload, null, 2));

      // Step 1: Submit generation task
      const submitResponse = await axios.post(
        endpoint,
        bflPayload,
        {
          headers: {
            'X-Key': bflKey,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const taskId = submitResponse.data?.id;
      const pollingUrl = submitResponse.data?.polling_url;
      if (!taskId || !pollingUrl) {
        throw new Error(`Failed to submit task to BFL: ${JSON.stringify(submitResponse.data)}`);
      }
      console.log(`[TEST-IMAGE] [BFL] Task submitted successfully. Task ID: ${taskId}, Polling URL: ${pollingUrl}`);

      // Step 2: Poll status
      let resultUrl = '';
      const pollStart = Date.now();
      const maxPollMs = 180000; // 3 minutes max

      while (Date.now() - pollStart < maxPollMs) {
        await new Promise(r => setTimeout(r, 2000)); // Poll every 2s

        const statusResp = await axios.get(
          pollingUrl,
          {
            headers: {
              'X-Key': bflKey
            },
            timeout: 10000
          }
        );

        const statusData = statusResp.data;
        console.log(`[TEST-IMAGE] [BFL] Poll: ${statusData.status} (${((Date.now() - pollStart) / 1000).toFixed(0)}s)`);

        if (statusData.status === 'Ready') {
          resultUrl = statusData.result?.sample;
          break;
        } else if (statusData.status === 'Failed') {
          throw new Error(`BFL task failed: ${JSON.stringify(statusData.error || statusData)}`);
        }
      }

      if (!resultUrl) {
        throw new Error('BFL task timed out or returned no sample URL');
      }

      imageUrl = resultUrl;
      usedModel = model;

    } else if (model === 'flux-harmonize' && productImageUrl) {
      // === FLUX HARMONIZE (Deterministic Composition + Low-strength img2img) ===
      console.log(`[TEST-IMAGE] [FLUX-HARMONIZE] Model: ${model}, Product: ${productImageUrl ? 'yes' : 'no'}`);
      
      // Step 1: Generate background image using Flux 2 Pro
      console.log(`[TEST-IMAGE] [FLUX-HARMONIZE] Step 1/3: Generating background using Flux 2 Pro...`);
      const generatedBgUrl = await generateWithFlux2(scenePrompt, 1024, 1536, { aspectRatio: '2:3', safetyTolerance: 1, guidance: 4.5, steps: 50 });
      console.log(`[TEST-IMAGE] [FLUX-HARMONIZE] Background generated: ${generatedBgUrl}`);
      
      // Step 2: Composite product onto background
      console.log(`[TEST-IMAGE] [FLUX-HARMONIZE] Step 2/3: Compositing product onto background...`);
      const compositedLocalPath = await compositeProduct(generatedBgUrl, preprocessedImageUrl || productImageUrl, 'feed', rendersDir);
      console.log(`[TEST-IMAGE] [FLUX-HARMONIZE] Composited local path: ${compositedLocalPath}`);
      
      // Upload composited image to Fal.ai CDN
      const compositedCdnUrl = await uploadToFal(compositedLocalPath);
      if (fs.existsSync(compositedLocalPath)) fs.unlinkSync(compositedLocalPath);
      console.log(`[TEST-IMAGE] [FLUX-HARMONIZE] Composited CDN URL: ${compositedCdnUrl}`);
      
      // Step 3: Harmonize the composited image using Flux Dev img2img
      console.log(`[TEST-IMAGE] [FLUX-HARMONIZE] Step 3/3: Harmonizing image...`);
      imageUrl = await harmonizeImage(compositedCdnUrl, scenePrompt, '');
      usedModel = 'flux-harmonize';
      
    } else if (model === 'flux-ip' && productImageUrl) {
      // === FLUX + IP-Adapter + ControlNet (queue mode — sync times out) ===
      console.log(`[TEST-IMAGE] [FLUX-IP] IP:${ipStrength} CN:${cnStrength} G:${guidanceScale} S:${numSteps}`);
      
      const payload = {
        prompt: `${scenePrompt}, professional product photography, the product is naturally integrated into the scene with matching lighting and shadows`,
        image_size: { width: 1024, height: 1536 },
        num_images: 1,
        num_inference_steps: numSteps || 28,
        guidance_scale: guidanceScale || 3.5,
        strength: 0.85,
        enable_safety_checker: true,
        ip_adapters: [{
          path: 'XLabs-AI/flux-ip-adapter',
          image_encoder_path: 'openai/clip-vit-large-patch14',
          image_url: productImageUrl, // Original image with background for color/details
          scale: ipStrength !== undefined ? Number(ipStrength) : 0.85,
          weight_name: 'ip_adapter.safetensors',
        }],
        controlnets: [{
          path: 'Shakker-Labs/FLUX.1-dev-ControlNet-Depth',
          control_image_url: preprocessedImageUrl || productImageUrl, // Background-removed image for geometry
          conditioning_scale: cnStrength !== undefined ? Number(cnStrength) : 0.7,
        }],
      };
      
      console.log(`[TEST-IMAGE] [FLUX-IP] Sending payload:`, JSON.stringify(payload, null, 2));
      
      // Step 1: Submit to queue
      const submitResponse = await axios.post(
        'https://queue.fal.run/fal-ai/flux-general',
        payload,
        {
          headers: {
            'Authorization': `Key ${process.env.FAL_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );
      
      const requestId = submitResponse.data?.request_id;
      if (!requestId) throw new Error('No request_id from queue submit');
      console.log(`[TEST-IMAGE] [FLUX-IP] Queued: ${requestId}`);
      
      // Step 2: Poll for completion
      let result: any = null;
      const pollStart = Date.now();
      const maxPollMs = 360000; // 6 minutes max (to accommodate cold-start model downloads)
      
      while (Date.now() - pollStart < maxPollMs) {
        await new Promise(r => setTimeout(r, 2000)); // Poll every 2s
        
        const statusResp = await axios.get(
          `https://queue.fal.run/fal-ai/flux-general/requests/${requestId}/status`,
          { headers: { 'Authorization': `Key ${process.env.FAL_KEY}` }, timeout: 10000 }
        );
        
        const status = statusResp.data?.status;
        console.log(`[TEST-IMAGE] [FLUX-IP] Poll: ${status} (${((Date.now() - pollStart) / 1000).toFixed(0)}s)`);
        
        if (status === 'COMPLETED') {
          // Fetch result
          const resultResp = await axios.get(
            `https://queue.fal.run/fal-ai/flux-general/requests/${requestId}`,
            { headers: { 'Authorization': `Key ${process.env.FAL_KEY}` }, timeout: 30000 }
          );
          result = resultResp.data;
          break;
        } else if (status === 'FAILED') {
          throw new Error(`Flux queue job failed: ${JSON.stringify(statusResp.data)}`);
        }
      }
      
      if (!result) throw new Error('Flux queue job timed out after 6 minutes');
      
      imageUrl = result?.images?.[0]?.url || result?.image?.url || '';
      usedModel = 'flux-ip-adapter';
      
    } else {
      // === BRIA PRODUCT SHOT (or Flux schnell if no product) ===
      if (productImageUrl) {
        const placement = briaPlacement || 'automatic';
        console.log(`[TEST-IMAGE] [BRIA] Product shot mode — placement:${placement}, fast:${briaFast !== false}, optimize:${briaOptimize !== false}`);
        
        const briaBody: any = {
          image_url: productImageUrl,
          scene_description: scenePrompt,
          placement_type: placement,
          optimize_description: briaOptimize !== false,
          fast: briaFast !== false,
          num_results: 1,
        };
        
        // Add shot_size if provided
        if (briaShotSize && Array.isArray(briaShotSize) && briaShotSize.length === 2) {
          briaBody.shot_size = briaShotSize;
        }
        
        // Add manual_placement_selection if manual placement
        if (placement === 'manual_placement' && briaPositions && briaPositions.length > 0) {
          briaBody.manual_placement_selection = briaPositions;
        }
        
        const briaResponse = await axios.post(
          'https://fal.run/fal-ai/bria/product-shot',
          briaBody,
          {
            headers: {
              'Authorization': `Key ${process.env.FAL_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 120000,
          }
        );
        
        imageUrl = briaResponse.data?.images?.[0]?.url || briaResponse.data?.image?.url || '';
        usedModel = 'bria-product-shot';
      } else {
        console.log(`[TEST-IMAGE] [FLUX2] Scene-only mode — Flux 2 Pro`);
        imageUrl = await generateWithFlux2(scenePrompt, width ? Number(width) : 1024, height ? Number(height) : 1536, {
          aspectRatio: aspectRatio || '2:3',
          safetyTolerance: safetyTolerance !== undefined ? Number(safetyTolerance) : 1,
          guidance: guidance !== undefined ? Number(guidance) : 4.5,
          steps: steps !== undefined ? Math.min(50, Math.max(1, Number(steps))) : 50
        });
        usedModel = 'flux-2-pro';
      }
    }
    
    const elapsed = Date.now() - start;
    console.log(`[TEST-IMAGE] ✅ ${usedModel} ${elapsed}ms → ${imageUrl?.substring(0, 60)}...`);
    
    if (!imageUrl) {
      throw new Error('No image URL in response');
    }
    
    res.json({ imageUrl, model: usedModel, elapsed });
  } catch (err: any) {
    const elapsed = Date.now() - start;
    console.error(`[TEST-IMAGE] ❌ ${elapsed}ms: ${err.message}`);
    if (err.response?.data) {
      console.error(`[TEST-IMAGE] Full Response data:`, JSON.stringify(err.response.data, null, 2));
    }
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

// Helper for extracting JSON block from LLM responses
function extractJsonStr(text: string): string {
  const jsonStart = text.indexOf('[');
  const jsonEnd = text.lastIndexOf(']');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    return text.substring(jsonStart, jsonEnd + 1);
  }
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1) {
    return text.substring(objStart, objEnd + 1);
  }
  return text;
}

// Route 5.7: AI Layer suggestion based on image visual layout and scene description
app.post('/api/ai/suggest-layers', async (req, res) => {
  const { imageUrl, scenePrompt, brandKit } = req.body;
  
  console.log(`[SUGGEST-LAYERS] Request received. Prompt: "${scenePrompt?.substring(0, 50)}...", Image: ${imageUrl ? 'yes' : 'no'}`);
  const start = Date.now();
  
  try {
    let imageContentBlock: any = null;
    if (imageUrl) {
      try {
        console.log(`[SUGGEST-LAYERS] Downloading image: ${imageUrl}`);
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
        const contentType = imageResponse.headers['content-type'] || 'image/jpeg';
        const base64Data = Buffer.from(imageResponse.data, 'binary').toString('base64');
        
        let mediaType = 'image/jpeg';
        if (contentType.includes('png')) mediaType = 'image/png';
        else if (contentType.includes('gif')) mediaType = 'image/gif';
        else if (contentType.includes('webp')) mediaType = 'image/webp';
        
        imageContentBlock = {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType as any,
            data: base64Data,
          },
        };
        console.log(`[SUGGEST-LAYERS] Image successfully downloaded and converted. Size: ${(base64Data.length/1024).toFixed(1)} KB`);
      } catch (imageErr: any) {
        console.warn(`[SUGGEST-LAYERS] Failed to fetch image, falling back to text-only mode: ${imageErr.message}`);
      }
    }

    const systemPrompt = `You are a professional Creative Director, Graphic Designer, and Social Media Art Director.
Your task is to analyze a social media image (usually 1080x1350 aspect ratio) and suggest a premium layout of graphic overlay layers (headline texts, badges, gradients, shapes, logos) to place on top of it.

You are given:
1. The background image (as a visual content block, if available).
2. The scene prompt/description used to generate this background image.
3. The Brand Kit containing brand colors (primary, secondary, accent), fonts, tone, and visual guidelines.

CRITICAL INSTRUCTIONS FOR DESIGNING LAYERS:
- Keep the overall composition clean, premium, and balanced (like Dribbble or high-end Instagram advertisements).
- Identify the product or main focal point in the image, and avoid putting solid shapes or large texts directly on top of it. Keep the product visible!
- Use a background gradient/vignette or solid overlay if needed to ensure high contrast and readability of the text (e.g. a linear gradient at the bottom/top, or a semi-transparent dark rectangle).
- Cap full-cover layers (solid backgrounds covering the entire canvas) at 0.55 opacity or skip them if there is a background image, so the image shines through.
- Text layer 'align' property should be 'left', 'center', or 'right'. Make sure the 'x' and 'width' bounds are correct (width should fit within 1080px, e.g. x=60, width=960 for centered text).
- Coordinate system is: width=1080, height=1350. Top-left is (0,0).
- The text content (copy) must be in HUNGARIAN. Keep it punchy, creative, and aligned with the brand's tone.
- All coordinates and sizes must be numbers. Font sizes should be appropriate (e.g. 48px to 140px for titles, 24px to 36px for subheadings/CTA).

VÁRHATÓ LAYERS TÍPUSOK:
1. type: 'text'
   - text: A kiírandó szöveg magyarul (használj újsort '\\n' ha szükséges)
   - x, y, width
   - fontSize, fontFamily (brandKit.typography.fontName vagy Inter)
   - fontWeight: '400' | '600' | '700' | '800' | '900'
   - align: 'left' | 'center' | 'right'
   - fill: szín (pl. '#ffffff', brandKit.colors.accent, brandKit.colors.primary, stb.)
   - opacity: 0-1
   - textShadow: pl. '0 2px 12px rgba(0,0,0,0.6)' a jobb olvashatóságért.
2. type: 'figure'
   - subType: 'rect' | 'circle'
   - x, y, width, height
   - fill: szín vagy gradient (pl. 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)')
   - opacity: 0-1
   - cornerRadius: lekerekítés pixelben (csak rect esetén)
   - border: pl. '1px solid rgba(255,255,255,0.1)'
3. type: 'image' (pl. logó)
   - src: brandKit.logoUrl vagy más kép URL
   - x, y, width, height, opacity

A kimenetet KIZÁRÓLAG egy érvényes JSON tömbként add vissza, markdown kódblokkok és magyarázó szövegek nélkül.
Példa válasz formátum:
[
  { "type": "figure", "subType": "rect", "x": 0, "y": 800, "width": 1080, "height": 550, "fill": "linear-gradient(to top, #120e2e, transparent)", "opacity": 0.95 },
  { "type": "text", "text": "ÚJ KOLLEKCIÓ", "x": 60, "y": 880, "width": 960, "fontSize": 28, "fontFamily": "Inter", "fontWeight": "700", "align": "left", "fill": "#f59e0b", "opacity": 1 },
  { "type": "text", "text": "Kényeztesd magad\\na legjobb ízekkel", "x": 60, "y": 940, "width": 960, "fontSize": 90, "fontFamily": "Inter", "fontWeight": "900", "align": "left", "fill": "#ffffff", "opacity": 1, "textShadow": "0 4px 20px rgba(0,0,0,0.5)" }
]`;

    const userPrompt = `Márka Kit:
Márkanév / logo URL: ${brandKit?.logoUrl || 'nincs megadva'}
Színek: elsődleges: ${brandKit?.colors?.primary || '#1a1a2e'}, másodlagos: ${brandKit?.colors?.secondary || '#f5f5f5'}, kiemelő (accent): ${brandKit?.colors?.accent || '#f59e0b'}
Betűtípus: ${brandKit?.typography?.fontName || 'Inter'}
Márka hangneme: ${brandKit?.tone?.join(', ') || 'nincs megadva'}
Képi szabályok: ${brandKit?.visualRules?.join(', ') || 'nincs megadva'}

Kép leírása (scene prompt):
"${scenePrompt || 'nincs megadva'}"

Feladat:
Elemezd a képet (ha csatolva van) és a leírást. Javasolj 2-5 darab harmonikus réteget (szövegek, gombok, gradientek, logók), amelyek kiválóan mutatnak a képen. Ne takard el a terméket! A szövegek ékezetes magyar nyelven íródjanak, a márka hangnemében.
A válasz KIZÁRÓLAG a JSON tömb legyen!`;

    const modelName = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
    const messageContent: any[] = [];
    if (imageContentBlock) {
      messageContent.push(imageContentBlock);
    }
    messageContent.push({ type: 'text', text: userPrompt });

    console.log(`[SUGGEST-LAYERS] Invoking Claude Vision — Model: ${modelName}`);
    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 1500,
      temperature: 0.5,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
    });

    const textContent = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleanJson = extractJsonStr(textContent);
    const layers = JSON.parse(cleanJson);
    
    console.log(`[SUGGEST-LAYERS] Claude returned ${layers.length} layers successfully in ${Date.now() - start}ms`);
    res.json({ layers });
  } catch (err: any) {
    console.error(`[SUGGEST-LAYERS] Error in suggest-layers: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Route 5.5: Generate Creative Overlays via deterministic engine
app.post('/api/overlay/generate', async (req, res) => {
  const { brief, contentType, brandKit, format, variantCount } = req.body;
  if (!brief || !brandKit) {
    return res.status(400).json({ error: 'Brief and brandKit params are required.' });
  }

  try {
    const start = Date.now();
    const results = await runOverlayPipeline(
      brief,
      contentType || 'general',
      brandKit,
      format || 'feed',
      variantCount !== undefined ? Number(variantCount) : 3
    );
    console.log(`[OVERLAY] Pipeline completed in ${Date.now() - start}ms, generated ${results.length} variants.`);
    res.json(results);
  } catch (err: any) {
    console.error(`[OVERLAY] Pipeline error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// Route 6: Generate Full campaign (SSE streaming for real-time progress)
app.post('/api/campaign/generate', async (req, res) => {
  const { brief, brandKit, productImageUrl } = req.body;
  if (!brief || !brandKit) {
    return res.status(400).json({ error: 'Brief and brandKit params are required.' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (type: string, data: any) => {
    try {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    } catch {}
  };

  try {
    const pipelineStart = Date.now();
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[CAMPAIGN] ====== STARTING CAMPAIGN PIPELINE (SSE) ======`);
    console.log(`[CAMPAIGN] Brief: "${brief}"`);
    console.log(`${'='.repeat(80)}\n`);

    // Step 1: Claude strategy
    sendEvent('step', { step: 0, message: 'Claude kampány stratégia tervezés...' });
    const orchestrateStart = Date.now();
    const campaignStrategy = await orchestrateCampaign(brief, brandKit);
    const orchestrateTime = Date.now() - orchestrateStart;
    console.log(`[CAMPAIGN] Strategy done in ${orchestrateTime}ms — "${campaignStrategy.title}"`);
    
    sendEvent('step', { 
      step: 1, 
      message: `"${campaignStrategy.title}" — ${campaignStrategy.items?.length || 0} kreatív tervezve (${(orchestrateTime / 1000).toFixed(1)}s)` 
    });

    if (!campaignStrategy.items || !Array.isArray(campaignStrategy.items)) {
      throw new Error('AI failed to generate campaign items');
    }

    const creatives: any[] = [];
    const briefId = `campaign-brief-${Date.now()}`;

    // Process items sequentially for real-time updates
    for (let idx = 0; idx < campaignStrategy.items.length; idx++) {
      const item = campaignStrategy.items[idx];
      const itemStart = Date.now();
      
      sendEvent('item-start', { 
        index: idx, 
        total: campaignStrategy.items.length,
        template: item.templateId, 
        type: item.type,
        headline: item.headline || '',
        message: `[${idx+1}/${campaignStrategy.items.length}] GPT Image 2 generálás: "${item.headline || item.templateId}"...` 
      });

      // === IMAGE GENERATION ===
      let finalImageUrl = '';
      const imagePrompt = item.imagePrompt || '';
      const scenePrompt = `${imagePrompt}. Visual style: ${brandKit.visualRules.join(', ')}`;
      
      try {
        const genStart = Date.now();
        
        if (productImageUrl && imagePrompt) {
          // === BRIA PRODUCT SHOT: Product preservation + scene generation ===
          console.log(`[ITEM ${idx+1}] [BRIA] Scene: "${imagePrompt.substring(0, 80)}..."`);
          console.log(`[ITEM ${idx+1}] [BRIA] Product: ${productImageUrl.substring(0, 60)}...`);
          sendEvent('item-progress', { index: idx, message: `[${idx+1}] Bria Product Shot — jelenet generálás...` });
          
          const briaResponse = await axios.post(
            'https://fal.run/fal-ai/bria/product-shot',
            {
              image_url: productImageUrl,
              scene_description: scenePrompt,
              placement_type: 'automatic',
              optimize_description: true,
              num_results: 1,
            },
            {
              headers: {
                'Authorization': `Key ${process.env.FAL_KEY}`,
                'Content-Type': 'application/json',
              },
              timeout: 60000,
            }
          );
          
          if (briaResponse.data?.images?.[0]?.url) {
            finalImageUrl = briaResponse.data.images[0].url;
          } else if (briaResponse.data?.image?.url) {
            finalImageUrl = briaResponse.data.image.url;
          }
          
          const elapsed = Date.now() - genStart;
          console.log(`[ITEM ${idx+1}] [BRIA] ✅ ${elapsed}ms → ${finalImageUrl?.substring(0, 60)}...`);
          sendEvent('item-progress', { index: idx, message: `[${idx+1}] Bria kész (${(elapsed / 1000).toFixed(1)}s)` });
          
        } else if (process.env.BFL_API_KEY && imagePrompt) {
          // === FLUX 2 PRO: No product, just scene generation ===
          console.log(`[ITEM ${idx+1}] [FLUX2] "${imagePrompt.substring(0, 80)}..."`);
          sendEvent('item-progress', { index: idx, message: `[${idx+1}] Flux 2 Pro jelenet generálás...` });
          
          finalImageUrl = await generateWithFlux2(scenePrompt, 1024, 1536, { aspectRatio: '2:3', safetyTolerance: 1, guidance: 4.5, steps: 50 });
          
          const elapsed = Date.now() - genStart;
          console.log(`[ITEM ${idx+1}] [FLUX2] ✅ ${elapsed}ms`);
          sendEvent('item-progress', { index: idx, message: `[${idx+1}] Flux 2 Pro kész (${(elapsed / 1000).toFixed(1)}s)` });
        }
      } catch (imageErr: any) {
        console.error(`[ITEM ${idx+1}] [IMAGE] ❌ ${imageErr.message}`);
        sendEvent('item-progress', { index: idx, message: `[${idx+1}] ⚠️ Kép generálás hiba` });
      }
      
      if (!finalImageUrl) {
        finalImageUrl = 'https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&q=80&w=1080';
      }

      // Convert local file path to data URI for Playwright renderer (safety net)
      let rendererImageUrl = finalImageUrl;
      if (finalImageUrl && !finalImageUrl.startsWith('http') && !finalImageUrl.startsWith('data:') && fs.existsSync(finalImageUrl)) {
        const imgBuffer = fs.readFileSync(finalImageUrl);
        rendererImageUrl = `data:image/png;base64,${imgBuffer.toString('base64')}`;
      }

      // 3. Playwright logo overlay
      sendEvent('item-progress', { index: idx, message: `[${idx+1}] Logó-overlay renderelés...` });
      const localRenderPath = await renderPost(item as any, brandKit, rendererImageUrl);

      const campaignItem = {
        id: `creative-campaign-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
        briefId,
        templateId: item.templateId,
        status: 'draft' as const,
        headline: item.headline || '',
        caption: item.caption || item.text || '',
        text: item.caption || item.text || '',
        cta: item.cta,
        imageUrl: localRenderPath,
        originalImageUrl: finalImageUrl,
        imagePrompt: item.imagePrompt,
        colorVariation: item.colorVariation,
        logoVariant: item.logoVariant,
        createdAt: new Date().toISOString(),
        type: item.type || (idx >= 4 ? 'ad' : 'post'),
        channel: item.channel || (idx >= 4 ? 'meta-ads' : 'instagram'),
        targetAudience: item.targetAudience || '',
        adObjective: item.adObjective || '',
      };

      creatives.push(campaignItem);
      const itemTime = Date.now() - itemStart;

      sendEvent('item-complete', { 
        index: idx, 
        imageUrl: localRenderPath,
        headline: campaignItem.headline,
        message: `[${idx+1}/${campaignStrategy.items.length}] ✅ "${campaignItem.headline}" kész (${(itemTime / 1000).toFixed(1)}s)` 
      });
    }

    const campaign: Campaign = {
      id: `campaign-${Date.now()}`,
      title: campaignStrategy.title || 'Új Kampány',
      description: campaignStrategy.description || '',
      targetAudience: campaignStrategy.targetAudience || '',
      adBudgetSplit: campaignStrategy.adBudgetSplit || '',
      items: creatives as any,
      createdAt: new Date().toISOString()
    };

    const totalTime = Date.now() - pipelineStart;
    console.log(`[CAMPAIGN] ✅ COMPLETE: "${campaign.title}" — ${creatives.length} items in ${(totalTime / 1000).toFixed(1)}s`);

    sendEvent('complete', { campaign, message: `Kampány kész! ${(totalTime / 1000).toFixed(1)}s` });
    res.end();
  } catch (err: any) {
    console.error(`[CAMPAIGN] ❌ FAILED: ${err.message}`);
    sendEvent('error', { message: err.message || 'Ismeretlen hiba.' });
    res.end();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HUNGARIAN → ENGLISH TRANSLATION (Gemini Flash)
// ═══════════════════════════════════════════════════════════════════════════════

async function translateToEnglish(text: string, brandContext?: any): Promise<{ translated: string; wasTranslated: boolean }> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.warn('[TRANSLATE] No GEMINI_API_KEY — skipping translation');
    return { translated: text, wasTranslated: false };
  }

  // Quick heuristic: if >60% ASCII printable chars and no Hungarian diacritics → skip
  const huChars = (text.match(/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g) || []).length;
  const nonAscii = (text.match(/[^\x00-\x7F]/g) || []).length;
  if (huChars === 0 && nonAscii < 3) {
    return { translated: text, wasTranslated: false };
  }

  const brandHint = brandContext?.products?.length
    ? `\nBrand product names to preserve exactly: ${brandContext.products.slice(0, 5).join(', ')}`
    : '';

  const systemPrompt = `You are a professional image prompt translator. Translate the given Hungarian (or other non-English) image generation prompt to English.
Rules:
- Output ONLY the translated English prompt, nothing else
- Keep brand names, product names, and proper nouns unchanged
- Preserve technical photography terms (f/2.8, 35mm, bokeh etc.)
- Make the English natural and vivid for AI image generation${brandHint}`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        contents: [{ role: 'user', parts: [{ text: `Translate this image prompt to English:\n\n${text}` }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 500, temperature: 0.2 }
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const translated = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
    console.log(`[TRANSLATE] HU→EN: "${text.substring(0, 60)}" → "${translated.substring(0, 60)}"`);
    return { translated, wasTranslated: true };
  } catch (err: any) {
    console.error('[TRANSLATE] Gemini error:', err.message);
    return { translated: text, wasTranslated: false };
  }
}

// Route: Translate prompt
app.post('/api/translate-prompt', async (req, res) => {
  const { text, brandContext } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });
  try {
    const result = await translateToEnglish(text, brandContext);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`AI Creative Studio backend running at http://localhost:${port}`);
});

