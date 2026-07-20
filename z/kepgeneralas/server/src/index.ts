import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { fal } from '@fal-ai/client';

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
import { uploadToFal, removeBackground, compositeProduct, harmonizeImage, applyLowResMaskToUpscaled, localUpscale } from './compositor.js';
import { SatoriRenderer } from './SatoriRenderer.js';
import { renderLocalPlacid } from './LocalPlacidRenderer.js';
import fs from 'fs';
import sharp from 'sharp';
// OpenAI import removed — using Bria Product Shot via fal.ai

// ═══════════════════════════════════════════════════════════════════════════════
// FLUX.2 [flex] HELPER — BFL Direct API (recommended for label/packaging + general use)
// Defaults: safety_tolerance=1, guidance=4.5, steps=50
// ═══════════════════════════════════════════════════════════════════════════════

function promptContainsTextRequest(prompt: string): boolean {
  const lowercase = prompt.toLowerCase();
  // Check for quotes containing at least 2 characters (e.g. "SALE")
  const hasQuotes = /["'][a-zA-Z0-9\sáéíóöőúüűÁÉÍÓÖŐÚÜŰ]{2,}["']/.test(prompt);
  const keywords = ['felirat', 'szöveg', 'kiírva', 'writing', ' label ', ' sign ', 'text ', 'write '];
  const hasKeywords = keywords.some(kw => lowercase.includes(kw));
  return hasQuotes || hasKeywords;
}

function clampBflProDimensions(width: number, height: number, maxLimit = 1440): { width: number; height: number } {
  let w = width;
  let h = height;
  if (w > maxLimit || h > maxLimit) {
    const ratio = w / h;
    if (w > h) {
      w = maxLimit;
      h = Math.round(maxLimit / ratio);
    } else {
      h = maxLimit;
      w = Math.round(maxLimit * ratio);
    }
  }
  // Snapping to multiple of 16
  w = Math.round(w / 16) * 16;
  h = Math.round(h / 16) * 16;

  // Snapping checks to keep within [256, 1440]
  w = Math.max(256, Math.min(maxLimit, w));
  h = Math.max(256, Math.min(maxLimit, h));
  return { width: w, height: h };
}

async function generateWithFluxFlex(
  prompt: string,
  width: number,
  height: number,
  opts?: { safetyTolerance?: number; guidance?: number; steps?: number; aspectRatio?: string; inputImage?: string; inputImage2?: string; backgroundPrompt?: string; forceFlex?: boolean }
): Promise<{ imageUrl: string; model: string; generationTime: number }> {
  const bflKey = process.env.BFL_API_KEY;
  if (!bflKey) throw new Error('BFL_API_KEY is not configured in .env');

  // Bypassed Bria Product Shot (Fal.ai) as per user request to avoid Fal.ai dependency entirely.
  // All image generations with reference images will route directly to BFL Direct API (Flux Flex).

  // Hybrid Compositing & Harmonization pipeline bypassed as per user request.
  // Standard single-pass BFL Flex generation will be used to ensure natural shadows, lighting, and reflections.

  const hasReferenceImage = !!(opts?.inputImage || opts?.inputImage2);
  const containsText = promptContainsTextRequest(prompt);

  // Router logic:
  // Route to Flex (Direction A) if: reference image present, prompt has text request, OR forceFlex is set.
  // Otherwise, route to FLUX 1.1 Pro (Direction B) for flagship quality at a flat-rate $0.04.
  const isFlex = hasReferenceImage || containsText || !!(opts?.forceFlex);
  const endpoint = isFlex ? 'https://api.bfl.ai/v1/flux-2-flex' : 'https://api.bfl.ai/v1/flux-pro-1.1';
  const modelName = isFlex ? 'FLUX.2 Flex' : 'FLUX 1.1 Pro';

  console.log(`\n[BFL-ROUTER] Routing image generation request:`);
  console.log(`[BFL-ROUTER]   Has reference image: ${hasReferenceImage}`);
  console.log(`[BFL-ROUTER]   Prompt contains text request: ${containsText}`);
  console.log(`[BFL-ROUTER]   Selected Model: ${modelName}`);
  console.log(`[BFL-ROUTER]   Endpoint: ${endpoint}`);

  const safetyTol = opts?.safetyTolerance ?? 5;
  const guidance  = opts?.guidance ?? 4.5;
  const steps     = opts?.steps ?? 50;
  const ar        = opts?.aspectRatio ?? '2:3';

  console.log(`[BFL-ROUTER] Submitting task — ${width}x${height} | guidance=${guidance} steps=${steps}`);
  console.log(`[BFL-ROUTER] Prompt: "${prompt.substring(0, 100)}..."`);

  const payload: any = {
    prompt,
    output_format: 'jpeg',
    safety_tolerance: safetyTol,
  };

  if (isFlex) {
    payload.aspect_ratio = ar;
    payload.guidance = guidance;
    payload.steps = steps;
    payload.width = width;
    payload.height = height;

    if (opts?.inputImage) {
      payload.input_image = imageToBflInput(opts.inputImage);
      if (opts.inputImage2) {
        payload.input_image_2 = imageToBflInput(opts.inputImage2);
      }
    }
  } else {
    // Pro endpoint expects width and height
    const clamped = clampBflProDimensions(width, height);
    payload.width = clamped.width;
    payload.height = clamped.height;
    console.log(`[BFL-ROUTER] Clamped Pro dimensions: original ${width}x${height} -> clamped ${clamped.width}x${clamped.height}`);
  }

  // Step 1: Submit generation task — with retry for transient network errors (ETIMEDOUT etc.)
  let submitResponse: any;
  const maxSubmitAttempts = 3;
  for (let attempt = 1; attempt <= maxSubmitAttempts; attempt++) {
    try {
      submitResponse = await axios.post(
        endpoint,
        payload,
        {
          headers: { 'X-Key': bflKey, 'Content-Type': 'application/json' },
          timeout: 35000,
        }
      );
      break; // success — exit retry loop
    } catch (err: any) {
      const isRetryable = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'].includes(err.code)
        || (err.response?.status >= 500);
      if (isRetryable && attempt < maxSubmitAttempts) {
        const delayMs = attempt * 3000;
        console.warn(`[BFL-ROUTER] Attempt ${attempt}/${maxSubmitAttempts} failed (${err.code || err.response?.status}). Retrying in ${delayMs/1000}s...`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        throw err; // non-retryable or last attempt — rethrow
      }
    }
  }

  const taskId = submitResponse.data?.id;
  const pollingUrl = submitResponse.data?.polling_url;
  if (!taskId || !pollingUrl) {
    throw new Error(`BFL submit failed: ${JSON.stringify(submitResponse.data)}`);
  }
  console.log(`[BFL-ROUTER] Task submitted: ${taskId}`);

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
    console.log(`[BFL-ROUTER] Poll: ${status} (${((Date.now() - pollStart) / 1000).toFixed(0)}s)`);

    if (status === 'Ready') {
      const imageUrl = result?.sample;
      if (!imageUrl) throw new Error('BFL returned Ready but no sample URL');
      const generationTime = Number(((Date.now() - pollStart) / 1000).toFixed(1));
      console.log(`[BFL-ROUTER] ✅ Done in ${generationTime}s → ${imageUrl.substring(0, 80)}...`);
      try {
        const localRendersDir = path.resolve(__dirname, '../renders');
        if (!fs.existsSync(localRendersDir)) {
          fs.mkdirSync(localRendersDir, { recursive: true });
        }
        const filename = `bfl-gen-${Date.now()}-${Math.floor(Math.random() * 9999)}.jpg`;
        const localPath = path.join(localRendersDir, filename);
        console.log(`[BFL-ROUTER] Downloading generated image to local storage: ${localPath}`);
        const imageResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
        await fs.promises.writeFile(localPath, Buffer.from(imageResp.data));
        const localUrl = `/renders/${filename}`;
        console.log(`[BFL-ROUTER] Saved locally: ${localUrl}`);
        return { imageUrl: localUrl, model: modelName, generationTime };
      } catch (saveErr: any) {
        console.warn(`[BFL-ROUTER] ⚠️ Failed to save image locally (${saveErr.message}), returning remote URL`);
        return { imageUrl, model: modelName, generationTime };
      }
    } else if (status && typeof status === 'string' && status.toLowerCase().includes('moderated')) {
      throw new Error('BFL request was moderated/blocked by safety filters.');
    } else if (status === 'Failed') {
      throw new Error(`BFL task failed: ${JSON.stringify(statusResp.data?.error || statusResp.data)}`);
    }
  }

  throw new Error('BFL task timed out after 2 minutes');
}

// Backwards-compat alias
const generateWithFlux2 = generateWithFluxFlex;

// Reload trigger comment - updated model to sonnet 4.6
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

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

function imageToBflInput(imageUrl: string | undefined): string | undefined {
  if (!imageUrl) return undefined;
  
  if (imageUrl.startsWith('data:image/') || imageUrl.startsWith('data:application/')) {
    return imageUrl;
  }
  
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    if (imageUrl.includes('/renders/')) {
      const parts = imageUrl.split('/renders/');
      const filename = parts[parts.length - 1];
      const filePath = path.join(rendersDir, filename);
      if (fs.existsSync(filePath)) {
        console.log(`[BFL-BASE64] Converting localhost URL ${imageUrl} to base64`);
        const buffer = fs.readFileSync(filePath);
        return buffer.toString('base64');
      }
    }
    return imageUrl;
  }
  
  if (imageUrl.startsWith('/renders/') || imageUrl.startsWith('renders/')) {
    const filename = path.basename(imageUrl);
    const filePath = path.join(rendersDir, filename);
    if (fs.existsSync(filePath)) {
      console.log(`[BFL-BASE64] Converting relative URL ${imageUrl} to base64`);
      const buffer = fs.readFileSync(filePath);
      return buffer.toString('base64');
    }
  }

  try {
    const absPath = path.resolve(imageUrl);
    if (fs.existsSync(absPath)) {
      console.log(`[BFL-BASE64] Converting local path ${imageUrl} to base64`);
      const buffer = fs.readFileSync(absPath);
      return buffer.toString('base64');
    }
  } catch {}

  return imageUrl;
}

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
      let genModel = '';
      let genTime = 0;
      if (process.env.BFL_API_KEY) {
        try {
          const fullPrompt = `${variant.imagePrompt}, visual style matching rules: ${brandKit.visualRules.join(', ')}`;
          const genResult = await generateWithFlux2(fullPrompt, 768, 960, { aspectRatio: '4:5', safetyTolerance: 1, guidance: 4.5, steps: 50 });
          imageUrl = genResult.imageUrl;
          genModel = genResult.model;
          genTime = genResult.generationTime;
          console.log(`[FLUX2] Image generated for variant ${idx+1}: ${imageUrl} using ${genModel} in ${genTime}s`);
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
        createdAt: new Date().toISOString(),
        generationModel: genModel || undefined,
        generationTime: genTime || undefined
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
    let genModel = '';
    let genTime = 0;
    if (process.env.BFL_API_KEY) {
      try {
        const fullPrompt = `${postImagePrompt}, visual style matching rules: ${brandKit.visualRules.join(', ')}`;
        const genResult = await generateWithFlux2(fullPrompt, 768, 960, {
          aspectRatio: '4:5',
          safetyTolerance: 1,
          guidance: 4.5,
          steps: 50,
          inputImage: preprocessedImageUrl || productImageUrl,
          inputImage2: preprocessedImageUrl ? productImageUrl : undefined,
          backgroundPrompt: brief || undefined
        });
        imageUrl = genResult.imageUrl;
        genModel = genResult.model;
        genTime = genResult.generationTime;
        console.log(`[ADHOC-FLUX2] Image generated: ${imageUrl} using ${genModel} in ${genTime}s`);
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
      createdAt: new Date().toISOString(),
      generationModel: genModel || undefined,
      generationTime: genTime || undefined
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


function sniffMediaType(buffer: Buffer): string {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.length >= 3 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
  return 'image/jpeg'; // default fallback
}

async function fetchImageAsClaudeBlock(imageUrl: string): Promise<{
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg';
    data: string;
  };
}> {
  console.log(`[IMAGE-FETCH] Fetching image from URL/path: ${imageUrl}`);
  
  let rawBuffer: Buffer;
  
  // Detect local relative renders paths, local paths, or relative paths
  if (imageUrl.startsWith('/renders/') || imageUrl.startsWith('renders/') || (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('data:'))) {
    const filename = path.basename(imageUrl);
    const filePath = path.join(rendersDir, filename);
    if (fs.existsSync(filePath)) {
      console.log(`[IMAGE-FETCH] Reading local file directly from: ${filePath}`);
      rawBuffer = fs.readFileSync(filePath);
    } else {
      const absPath = path.resolve(imageUrl);
      if (fs.existsSync(absPath)) {
        console.log(`[IMAGE-FETCH] Reading local file directly from absolute path: ${absPath}`);
        rawBuffer = fs.readFileSync(absPath);
      } else {
        throw new Error(`Local image file not found at: ${filePath} or ${absPath}`);
      }
    }
  } else {
    // If it's a localhost URL, extract filename and read from rendersDir directly to avoid network loopback issues
    if (imageUrl.includes('/renders/')) {
      const parts = imageUrl.split('/renders/');
      const filename = parts[parts.length - 1];
      const filePath = path.join(rendersDir, filename);
      if (fs.existsSync(filePath)) {
        console.log(`[IMAGE-FETCH] Detected localhost/renders URL. Reading directly from: ${filePath}`);
        rawBuffer = fs.readFileSync(filePath);
      } else {
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
        rawBuffer = Buffer.from(imageResponse.data);
      }
    } else {
      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
      rawBuffer = Buffer.from(imageResponse.data);
    }
  }
  
  console.log(`[IMAGE-FETCH] Original size: ${(rawBuffer.length / 1024).toFixed(1)} KB. Processing with sharp...`);
  
  let processedBuffer: Buffer;
  try {
    const imagePipeline = sharp(rawBuffer);
    const metadata = await imagePipeline.metadata();
    
    // Resize if any dimension exceeds 1600px
    if ((metadata.width && metadata.width > 1600) || (metadata.height && metadata.height > 1600)) {
      imagePipeline.resize(1600, 1600, { fit: 'inside', withoutEnlargement: true });
    }
    
    // Convert to jpeg: flatten transparency on a white background, output standard JPEG
    processedBuffer = await imagePipeline
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 85 })
      .toBuffer();
      
    console.log(`[IMAGE-FETCH] Processed size: ${(processedBuffer.length / 1024).toFixed(1)} KB`);
  } catch (err: any) {
    console.warn(`[IMAGE-FETCH] Sharp processing failed, falling back to raw buffer: ${err.message}`);
    processedBuffer = rawBuffer;
  }
  
  const base64Data = processedBuffer.toString('base64');
  
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/jpeg',
      data: base64Data,
    },
  };
}

function condenseDescription(desc: string): string {
  let cleaned = desc.replace(/\b(featuring|with a|small|large|a |an |the )\b/gi, '').trim();
  const commaIdx = cleaned.indexOf(',');
  if (commaIdx !== -1) {
    cleaned = cleaned.substring(0, commaIdx);
  }
  const withIdx = cleaned.toLowerCase().indexOf(' with');
  if (withIdx !== -1) {
    cleaned = cleaned.substring(0, withIdx);
  }
  const featIdx = cleaned.toLowerCase().indexOf(' featuring');
  if (featIdx !== -1) {
    cleaned = cleaned.substring(0, featIdx);
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

async function getStyleTags(rules: string[]): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey || !rules || rules.length === 0) {
    return '';
  }

  const rulesText = rules.join(', ');
  const systemPrompt = `You are an expert design director. Convert the given brand style rules and guidelines into a concise list of 3-6 English style keywords/tags separated by commas.
Examples of output format: "clean, minimalist, warm lighting, high-end photography"
DO NOT output full sentences, markdown, or explanations. Only output the comma-separated keywords in English.`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        contents: [{ role: 'user', parts: [{ text: `Convert these rules to style keywords:\n\n${rulesText}` }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 100, temperature: 0.2 }
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    console.log(`[STYLE-TAGS] Rules summarized: "${result}"`);
    return result;
  } catch (err: any) {
    console.error('[STYLE-TAGS] Gemini error:', err.message);
    return '';
  }
}

async function intelligentComposePrompt(
  scenePrompt: string,
  slotSubjects: string[],
  brandRules: string[]
): Promise<string> {
  const systemPrompt = `You are an expert AI prompt engineer. Your job is to compose a single, highly detailed, unified English prompt for image generation (FLUX) by combining a user's scene description with the foreground subjects from uploaded image slots.

Inputs:
- User's scene description (in Hungarian or English): "${scenePrompt}"
- Foreground subjects: ${JSON.stringify(slotSubjects)}
- Brand rules (SECONDARY — only use if user didn't specify): ${JSON.stringify(brandRules)}

PRIORITY RULE: The user's scene description is the MASTER. It always wins over brand rules.
- If the user specifies lighting (e.g. "overhead spotlight") — use that lighting, NOT the brand default.
- If the user specifies mood (e.g. "messy", "dark", "kupi/cluttered") — KEEP that mood exactly, do not sanitize it to "clean studio".
- If the user specifies a location — use that location, do not replace it with a generic one.
- Brand rules only fill in aspects the user DID NOT mention (e.g. if user said nothing about style, then apply brand style).

CRITICAL RULES:
1. REMOVE ALL BRAND NAMES, TRADEMARKS, COMPANY NAMES, AND MODEL DESIGNATIONS (e.g. Audi, BMW, Mercedes, Poli-Farbe, PoliFarbe, A8, etc.). Replace them with high-quality generic equivalents (e.g. "luxury sedan car" instead of "Audi car", "bucket of paint" instead of "Poli-Farbe paint").
2. INTEGRATE ALL SUBJECTS TOGETHER IN ONE SCENE. You MUST describe the exact physical relationship between every subject. Do NOT place them separately or independently in the scene. If there is a car and a paint bucket, the paint bucket must be placed directly on, in, or immediately next to the car (e.g. "a white paint bucket sitting on the car hood", "a paint bucket leaning against the car door"). If there is a product and a person, the person must be interacting with or holding the product. Every subject must share the same scene, the same ground plane, the same light source. Never describe them as separate elements in different locations.
3. EVERY SUBJECT MUST BE 100% FULLY INSIDE THE FRAME — NO EXCEPTIONS. This is the most critical rule. You MUST explicitly state in the prompt that every single subject is completely contained within the image boundaries. Use phrases like: "entire vehicle fully visible from front bumper to rear bumper, all four wheels on the ground, no part of the car is cut off or outside the frame", "the paint bucket is shown in its entirety, completely within the frame". If the composition requires a wide shot to show everything, describe a wide-angle or pulled-back camera position. Never describe a close-up if it risks cutting off any subject.
4. DO NOT REPRODUCE OR ADD TEXT unless the subject clearly has existing text on it. If any foreground subject has text on it (label, logo), describe it as "existing label visible, kept intact and legible". Do NOT invent new text. Do NOT describe re-generating or re-spelling any text. If the scene prompt explicitly suppresses text (no_text), instruct the generator to keep all surfaces clean and text-free.
5. DO NOT output split-screen, multiple panels, or collages. The prompt must describe a single unified photo or scene.
6. Output ONLY the composed English prompt. Maximum 120 words. Do not write markdown, code blocks, or explanations.`;

  try {
    const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    const response = await anthropic.messages.create({
      model,
      max_tokens: 800,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: [{ type: 'text', text: `Compose the final prompt following ALL rules strictly. Rule 3 (everything fully in frame) and Rule 2 (subjects integrated together) are mandatory — do not skip them.` }] }]
    });

    const result = (response.content[0].type === 'text' ? response.content[0].text : '').trim() || '';
    console.log(`[COMPOSE] Composed prompt via Claude: "${result}"`);
    return result;
  } catch (err: any) {
    console.error('[COMPOSE] Claude error:', err.message);
    return `${scenePrompt} featuring ${slotSubjects.join(', ')}`;
  }
}

// ── Prompt Decomposer ────────────────────────────────────────────────────────
// Splits the user's raw input into:
//   - scenePrompt: visual/environmental instructions for FLUX (no promo text)
//   - layerText:   promotional/headline text for the overlay layer (e.g. "30% KEDVEZMÉNY")
//   - layerCta:    optional CTA button text (e.g. "VÁSÁROLJ MOST")
async function decomposeUserPrompt(
  rawPrompt: string,
  imageSubjects: string[],
  brandDna?: string,
  exactTextOnly = false
): Promise<{ scenePrompt: string; layerText: string | null; layerCta: string | null }> {
  let strictInstruction = "";
  if (exactTextOnly) {
    strictInstruction = "\nCRITICAL STRICT RULE: The user has requested EXACT TEXT ONLY. You MUST NOT summarize, edit, or shorten the promotional text or offer details. Extract the literal promotional phrase exactly as written in the user's input (e.g. if the user wrote '/ Nyáron 30% akció minden falfestékre', extract 'Nyáron 30% akció minden falfestékre' word-for-word, do NOT shorten it to '30% AKCIÓ'). Return this exact text in 'layerText'.";
  }

  const systemPrompt = `You are a social media post production AI. Your job is to split a user's raw creative brief into two separate parts:${strictInstruction}

1. SCENE PROMPT (for AI image generation):
   - Describes the physical scene, setting, lighting, atmosphere, composition
   - MUST NOT contain any promotional text, discounts, percentages, prices, or calls-to-action
   - MUST NOT contain any text that would appear written/overlaid on the image
   - Keep only: location, lighting, mood, style, product positioning
   - CRITICAL: PRESERVE all atmosphere/mood descriptors exactly as-is, even informal ones:
     * "kicsit kupi" → keep as "slightly cluttered/messy" in the scene prompt
     * "sötét" → keep as "dark"
     * "hangulatos" → keep as "moody/atmospheric"
     * "szakadt" → keep as "worn/industrial"
     * Do NOT upgrade "messy workshop" into "clean professional studio" — keep the requested mood!

2. LAYER TEXT (for graphic overlay):
   - Short promotional headline or offer text (max 5 words, UPPERCASE in Hungarian)
   - Examples: "30% KEDVEZMÉNY", "NYÁRI AKCIÓ", "ÚJ TERMÉK", "KORLÁTOZOTT AJÁNLAT"
   - If the raw prompt contains NO promotional/offer/discount content → return null
   - This text will be rendered as a graphic layer ON TOP of the image

3. LAYER CTA (optional button text):
   - Short call-to-action for a button (max 3 words, UPPERCASE in Hungarian)
   - Examples: "VÁSÁROLJ MOST", "MEGNÉZEM", "RENDELD MEG"
   - Only include if the content clearly calls for user action
   - If not applicable → return null

User input: "${rawPrompt}"
Image subjects: ${JSON.stringify(imageSubjects)}
Brand DNA context: ${brandDna || 'not provided'}

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "scenePrompt": "...",
  "layerText": "..." or null,
  "layerCta": "..." or null
}`;

  try {
    const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    const response = await anthropic.messages.create({
      model,
      max_tokens: 400,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Decompose the user prompt now.' }]
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = extractJsonStr(text);
    const parsed = JSON.parse(cleaned);
    console.log(`[DECOMPOSE] scenePrompt: "${parsed.scenePrompt}" | layerText: ${parsed.layerText} | layerCta: ${parsed.layerCta}`);
    return {
      scenePrompt: parsed.scenePrompt || rawPrompt,
      layerText: parsed.layerText || null,
      layerCta: parsed.layerCta || null,
    };
  } catch (err: any) {
    console.error('[DECOMPOSE] Claude error:', err.message);
    return { scenePrompt: rawPrompt, layerText: null, layerCta: null };
  }
}

const LAYER_TEMPLATE_DESCRIPTIONS = [
  { id: 'tailwind-cta', idLegacy: 'tailwind-cta', name: 'Tailwind 1', occupiedArea: 'Bottom-left card. X: -450 to 0, Y: 100 to 500. Avoid if subject is bottom-left.' },
  { id: 'tailwind-gradient-bottom', idLegacy: 'tailwind-gradient-bottom', name: 'Tailwind 2', occupiedArea: 'Bottom bar. X: -540 to 540, Y: 200 to 540. Avoid if subject is bottom center.' },
  { id: 'tailwind-gradient-left', idLegacy: 'tailwind-gradient-left', name: 'Tailwind 3', occupiedArea: 'Left column. X: -540 to -200, Y: -675 to 675. Avoid if subject is on the left.' },
  { id: 'tailwind-luxury-frame', idLegacy: 'tailwind-luxury-frame', name: 'Tailwind 4', occupiedArea: 'Outer 10% edges of the image. Text is bottom-left. Minimal cover.' },
  { id: 'tailwind-neo-brutal', idLegacy: 'tailwind-neo-brutal', name: 'Tailwind 5', occupiedArea: 'Bottom-left card. X: -450 to 0, Y: 150 to 500. Avoid if subject is bottom-left.' },
  { id: 'tailwind-ribbon-top', idLegacy: 'tailwind-ribbon-top', name: 'Tailwind 6', occupiedArea: 'Top bar ribbon. X: -540 to 540, Y: -675 to -450. Avoid if subject is top center.' },
  { id: 'tailwind-circle-badge', idLegacy: 'tailwind-circle-badge', name: 'Tailwind 7', occupiedArea: 'Centered circle badge. X: -250 to 250, Y: -150 to 150. Avoid if subject is center.' },
  { id: 'tailwind-feature-list', idLegacy: 'tailwind-feature-list', name: 'Tailwind 8', occupiedArea: 'Bottom-left list card. X: -450 to 0, Y: 100 to 500. Avoid if subject is bottom-left.' },
  { id: 'tailwind-side-panel', idLegacy: 'tailwind-side-panel', name: 'Tailwind 9', occupiedArea: 'Left column sidebar. X: -540 to -150, Y: -675 to 675. Avoid if subject is left column.' },
  { id: 'tailwind-minimal-corner', idLegacy: 'tailwind-minimal-corner', name: 'Tailwind 10', occupiedArea: 'Small card in bottom-right corner. X: 150 to 450, Y: 300 to 540. Avoid if subject is bottom-right.' },
  { id: 'modernist-split', idLegacy: 'modernist-split', name: 'Tailwind 11', occupiedArea: 'Right column sidebar. X: 150 to 540, Y: -675 to 675. Avoid if subject is right column.' },
  { id: 'magazine-cover', idLegacy: 'magazine-cover', name: 'Tailwind 12', occupiedArea: 'Centered cover overlay. Text center and bottom. Avoid if subject is center/bottom.' },
  { id: 'minimalist-editorial', idLegacy: 'minimalist-editorial', name: 'Tailwind 13', occupiedArea: 'Center frame with text below product. X: -400 to 400, Y: 150 to 500. Avoid if subject is bottom center.' },
  { id: 'glow-dark', idLegacy: 'glow-dark', name: 'Tailwind 14', occupiedArea: 'Bottom-left glowing card. X: -450 to 0, Y: 150 to 500. Avoid if subject is bottom-left.' },
  { id: 'bold-slant', idLegacy: 'bold-slant', name: 'Tailwind 15', occupiedArea: 'Slanted footer bar. X: -540 to 540, Y: 250 to 540. Avoid if subject is bottom center.' },
  { id: 'duotone-overlay', idLegacy: 'duotone-overlay', name: 'Tailwind 16', occupiedArea: 'Center text overlay. X: -300 to 300, Y: -100 to 300. Avoid if subject is center.' },
  { id: 'neon-sign', idLegacy: 'neon-sign', name: 'Tailwind 17', occupiedArea: 'Bottom-left glowing card. X: -450 to 0, Y: 150 to 500. Avoid if subject is bottom-left.' },
  { id: 'glass-list', idLegacy: 'glass-list', name: 'Tailwind 18', occupiedArea: 'Left column sidebar. X: -540 to -150, Y: -675 to 675. Avoid if subject is left column.' },
  { id: 'brushed-metal', idLegacy: 'brushed-metal', name: 'Tailwind 19', occupiedArea: 'Bottom-left card. X: -450 to 0, Y: 150 to 500. Avoid if subject is bottom-left.' },
  { id: 'cyberpunk-hud', idLegacy: 'cyberpunk-hud', name: 'Tailwind 20', occupiedArea: 'Outer HUD frame. Text bottom-left. Minimal cover.' },
  { id: 'stripe-card', idLegacy: 'stripe-card', name: 'Tailwind 21', occupiedArea: 'Diagonal card at the bottom. X: -450 to 450, Y: 200 to 540. Avoid if subject is bottom.' },
  { id: 'linear-board', idLegacy: 'linear-board', name: 'Tailwind 22', occupiedArea: 'Bottom-left card. X: -450 to 0, Y: 150 to 500. Avoid if subject is bottom-left.' },
  { id: 'apple-spec', idLegacy: 'apple-spec', name: 'Tailwind 23', occupiedArea: 'Clean top-left card. X: -450 to 0, Y: -500 to -100. Avoid if subject is top-left.' },
  { id: 'netflix-billboard', idLegacy: 'netflix-billboard', name: 'Tailwind 24', occupiedArea: 'Bottom gradient billboard. X: -540 to 540, Y: 150 to 540. Avoid if subject is bottom.' },
  { id: 'airbnb-card', idLegacy: 'airbnb-card', name: 'Tailwind 25', occupiedArea: 'Bottom-left card. X: -450 to 0, Y: 150 to 500. Avoid if subject is bottom-left.' },
  { id: 'spotify-lyrics', idLegacy: 'spotify-lyrics', name: 'Tailwind 26', occupiedArea: 'Left column text overlay. X: -450 to 0, Y: -300 to 300. Avoid if subject is left.' },
  { id: 'notion-board', idLegacy: 'notion-board', name: 'Tailwind 27', occupiedArea: 'Bottom-left card. X: -450 to 0, Y: 150 to 500. Avoid if subject is bottom-left.' },
  { id: 'figma-canvas', idLegacy: 'figma-canvas', name: 'Tailwind 28', occupiedArea: 'Bottom-left card. X: -450 to 0, Y: 150 to 500. Avoid if subject is bottom-left.' },
  { id: 'github-readme', idLegacy: 'github-readme', name: 'Tailwind 29', occupiedArea: 'Bottom-left card. X: -450 to 0, Y: 150 to 500. Avoid if subject is bottom-left.' },
  { id: 'tesla-minimal', idLegacy: 'tesla-minimal', name: 'Tailwind 30', occupiedArea: 'Centered top header text. X: -350 to 350, Y: -550 to -350. Avoid if subject is top center.' }
];

function loadLayerConstraints(): string {
  try {
    const constraintsPath = path.join(__dirname, 'layerConstraints.json');
    if (fs.existsSync(constraintsPath)) {
      const constraintsData = JSON.parse(fs.readFileSync(constraintsPath, 'utf8'));
      if (constraintsData && constraintsData.templates) {
        return constraintsData.templates.map((t: any) => {
          const occupied = `Zone: ${t.textZone}. Occupied area bounding box: x=${t.occupiedArea.x}, y=${t.occupiedArea.y}, w=${t.occupiedArea.width}, h=${t.occupiedArea.height}.`;
          const textCaps = Object.entries(t.textCapacities).map(([k, v]: any) => `${k}: max ${v.maxChars} chars`).join(', ');
          const suit = `Best for: [${t.suitability.bestFor.join(', ')}]. Avoid for: [${t.suitability.avoidFor.join(', ')}].`;
          return `- "${t.id}" (${t.name}):\n  * ${occupied}\n  * Text capacity: ${textCaps}\n  * CTA count: ${t.ctaCount}\n  * ${suit}`;
        }).join('\n');
      }
    }
  } catch (err: any) {
    console.warn('[LOAD-CONSTRAINTS] Failed to load layerConstraints.json:', err.message);
  }
  return LAYER_TEMPLATE_DESCRIPTIONS.map(t => `- "${t.id}": ${t.occupiedArea}`).join('\n');
}

async function selectBestLayerTemplate(
  imageUrl: string,
  hasLayerText: boolean,
  brandTone?: string[],
  brandVisualRules?: string[]
): Promise<{ templateId: string; reason: string; confidence: number; suggestedStyles: { styleId: string; reason: string }[] }> {
  console.log(`[LAYER-SELECT] Analyzing image for best layer template...`);
  try {
    const imageBlock = await fetchImageAsClaudeBlock(imageUrl);
    const templateList = loadLayerConstraints();

    const systemPrompt = `You are a social media art director AI. Analyze the provided image and select the single best layer/overlay template for it.

Available templates (and their layout zones and constraints):
${templateList}

Context:
- Has promotional text to show: ${hasLayerText}
- Brand tone: ${brandTone?.join(', ') || 'not specified'}
- Brand visual rules: ${brandVisualRules?.join(', ') || 'not specified'}

CRITICAL SELECTION RULE:
Identify the main subject / product (e.g. paint can, container, chair, person) and any key prompt-requested objects in the image.
You MUST SELECT and SUGGEST only templates whose layout overlay does NOT overlap with or obscure the main product/subjects.
Filter the list of 30 templates down to all styles that do not cover the key subjects.
Propose the single best one in 'templateId', and list ALL matching suitable templates (up to 5-6) in the 'suggestedStyles' array, each with a brief Hungarian explanation of why it fits the empty space.

Return ONLY JSON (no markdown):
{
  "templateId": "one of the 30 template ids",
  "suggestedStyles": [
    { "styleId": "template id", "reason": "rövid magyar indoklás, hogy miért illik a kép üres részére és miért nem takarja ki a terméket" }
  ],
  "reason": "short English explanation",
  "confidence": 0-100
}`;

    const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    const response = await anthropic.messages.create({
      model,
      max_tokens: 600,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: 'user', content: [imageBlock, { type: 'text', text: 'Select the best layer template and list suggestions.' }] }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = extractJsonStr(text);
    const parsed = JSON.parse(cleaned);
    console.log(`[LAYER-SELECT] Selected: "${parsed.templateId}" (${parsed.confidence}%) — ${parsed.reason}`);
    return {
      templateId: parsed.templateId || 'tailwind-cta',
      reason: parsed.reason || '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 70,
      suggestedStyles: Array.isArray(parsed.suggestedStyles) ? parsed.suggestedStyles : []
    };
  } catch (err: any) {
    console.error('[LAYER-SELECT] Error:', err.message);
    return { templateId: 'tailwind-cta', reason: 'fallback due to error', confidence: 0, suggestedStyles: [] };
  }
}

// ── Scene Context Analyzer ────────────────────────────────────────────────────
// After background generation, Claude Vision analyzes the scene and returns ALL
// parameters needed for dynamic compositing. Nothing is hardcoded — every effect
// (size, shadow, warm tint, rim darkening, specular) derives from this context.
interface SceneContext {
  // Surface placement
  surfaceYPercent: number;          // 0-100: top edge of the surface where product base goes
  surfaceDepthHint: 'close'|'mid'|'far'; // how far the surface extends into the scene
  availableWidthPercent: number;    // 0-100: how much of image width is free on the surface

  // Product scale (dynamically determined by scene objects and perspective)
  recommendedScalePercent: number;  // product height as % of bg height (e.g. 35-55%)
  recommendedXOffsetPercent: number;// -20..+20: shift product left/right from center

  // Lighting
  lightSourceXPercent: number;      // 0-100: horizontal position of main light
  lightSourceYPercent: number;      // 0-100: vertical position (0=top, 50=mid)
  lightTemperatureK: number;        // 2700=warm tungsten, 4000=neutral, 6500=cool daylight
  lightIntensity: 'soft'|'medium'|'hard'; // determines specular highlight strength

  // Environment
  ambientDarkness: number;          // 0-100: how dark the background is (drives rim darkening)

  // Meta
  hasPerspective: boolean;
  confidence: number;               // 0-100
}

async function analyzeSceneContext(imageUrl: string): Promise<SceneContext> {
  const fallback: SceneContext = {
    surfaceYPercent: 68, surfaceDepthHint: 'mid', availableWidthPercent: 80,
    recommendedScalePercent: 38, recommendedXOffsetPercent: 0,
    lightSourceXPercent: 50, lightSourceYPercent: 15, lightTemperatureK: 4000,
    lightIntensity: 'medium', ambientDarkness: 50,
    hasPerspective: false, confidence: 0
  };
  console.log(`[SCENE-ANALYZE] Analyzing background scene for dynamic compositing parameters...`);
  try {
    const imageBlock = await fetchImageAsClaudeBlock(imageUrl);
    const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    const response = await anthropic.messages.create({
      model,
      max_tokens: 400,
      temperature: 0,
      system: `You are a professional photo compositing assistant. Analyze the background image and return precise parameters for placing a physical product object into this scene.

Return ONLY a JSON object with these exact fields (no markdown, no explanation):
{
  "surfaceYPercent": <number 52-85>,
  "surfaceDepthHint": <"close"|"mid"|"far">,
  "availableWidthPercent": <number 30-100>,
  "recommendedScalePercent": <number 22-55>,
  "recommendedXOffsetPercent": <number -20 to +20>,
  "lightSourceXPercent": <number 0-100>,
  "lightSourceYPercent": <number 0-100>,
  "lightTemperatureK": <number 2700-6500>,
  "lightIntensity": <"soft"|"medium"|"hard">,
  "ambientDarkness": <number 0-100>,
  "hasPerspective": <boolean>,
  "confidence": <number 0-100>
}

FIELD DEFINITIONS:

surfaceYPercent: The Y coordinate (as % of image height from top) of the TOP EDGE of the physical surface where a product would be PLACED and physically REST.
  - This is where the product's BASE/FEET would TOUCH the surface from above.
  - The surface is typically a table, workbench, shelf, counter, or floor.
  - IMPORTANT: The surface is almost always in the LOWER HALF of the image (52-85%).
  - DO NOT report as surface: the ceiling, the lamp or light fixture, the spotlight beam or cone, any lit area in mid-air, any vertical wall, anything in the upper 50% of the image.
  - Look for the sharp horizontal edge where the table/workbench top meets the air above it.
  - If unsure, return 68.

surfaceDepthHint: "close" if the surface fills the lower 40%+ of image (large foreground table), "mid" if 20-40%, "far" if the surface is small/distant.

availableWidthPercent: What % of the image width is unobstructed on the surface (0-100).

recommendedScalePercent: What % of IMAGE HEIGHT should the product be to look naturally sized for this scene. Consider the scale of furniture/objects in the scene. For a typical workbench product photo: 30-45%.

recommendedXOffsetPercent: Should the product shift left (negative) or right (positive) from center? -20 to +20.

lightSourceXPercent: Horizontal position of main light (0=far left, 50=center, 100=far right).

lightSourceYPercent: Vertical position of main light (0=ceiling/top, 50=mid-height, 100=below camera).

lightTemperatureK: Estimated color temperature: 2700=warm orange tungsten, 3200=warm-neutral, 4000=neutral white, 5500=cool, 6500=daylight.

lightIntensity: "soft" for diffuse/cloudy/ambient light, "medium" for standard room light, "hard" for direct spotlight/point source.

ambientDarkness: Overall darkness of background: 0=bright white, 30=well-lit room, 60=dim/moody, 80=very dark workshop/night, 100=pitch black.

hasPerspective: true if vanishing point lines are clearly visible.

confidence: Your confidence in surfaceYPercent accuracy (0-100).`,
      messages: [{ role: 'user', content: [imageBlock, { type: 'text', text: 'Analyze this background scene for product compositing parameters. Pay special attention to surfaceYPercent — find the physical table/workbench top edge, NOT the lamp or spotlight cone.' }] }]
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = JSON.parse(extractJsonStr(text));

    const result: SceneContext = {
      surfaceYPercent:          Math.max(52, Math.min(85,  Number(parsed.surfaceYPercent)          || 68)),  // min 52%: surface never in upper half
      surfaceDepthHint:         (['close','mid','far'].includes(parsed.surfaceDepthHint) ? parsed.surfaceDepthHint : 'mid') as 'close'|'mid'|'far',
      availableWidthPercent:    Math.max(30, Math.min(100, Number(parsed.availableWidthPercent)    || 80)),
      recommendedScalePercent:  Math.max(22, Math.min(55,  Number(parsed.recommendedScalePercent)  || 38)),
      recommendedXOffsetPercent:Math.max(-20,Math.min(20,  Number(parsed.recommendedXOffsetPercent)|| 0)),
      lightSourceXPercent:      Math.max(0,  Math.min(100, Number(parsed.lightSourceXPercent)      || 50)),
      lightSourceYPercent:      Math.max(0,  Math.min(100, Number(parsed.lightSourceYPercent)      || 15)),
      lightTemperatureK:        Math.max(2700,Math.min(6500,Number(parsed.lightTemperatureK)       || 4000)),
      lightIntensity:           (['soft','medium','hard'].includes(parsed.lightIntensity) ? parsed.lightIntensity : 'medium') as 'soft'|'medium'|'hard',
      ambientDarkness:          Math.max(0,  Math.min(100, Number(parsed.ambientDarkness)          || 50)),
      hasPerspective:           Boolean(parsed.hasPerspective),
      confidence:               Math.max(0,  Math.min(100, Number(parsed.confidence)               || 50)),
    };
    console.log(
      `[SCENE-ANALYZE] surfaceY=${result.surfaceYPercent}% | scale=${result.recommendedScalePercent}% | ` +
      `xOffset=${result.recommendedXOffsetPercent}% | lightX=${result.lightSourceXPercent}% | ` +
      `lightTemp=${result.lightTemperatureK}K | intensity=${result.lightIntensity} | ` +
      `darkness=${result.ambientDarkness} | depth=${result.surfaceDepthHint} | confidence=${result.confidence}%`
    );
    return result;
  } catch (err: any) {
    console.error('[SCENE-ANALYZE] Error:', err.message, '— using fallback values');
    return fallback;
  }
}



async function checkGeneratedImage(

  imageUrl: string,
  prompt: string
): Promise<{ passed: boolean; score: number; issues: string[]; explanation: string; suggestedPromptAdjustment: string }> {
  console.log(`[CHECKUP] Checking generated image: ${imageUrl}`);
  const start = Date.now();

  try {
    const imageContentBlock = await fetchImageAsClaudeBlock(imageUrl);

  const systemPrompt = `You are a strict visual quality inspector AI. Your job is to check the generated image for composition errors.
Evaluate the image against the prompt: "${prompt}"

We want a single, natural, integrated photograph or cohesive scene where ALL subjects are fully visible.

CRITICAL CHECKS — any single failure = passed: false:

CHECK 1 — SUBJECTS CUT OFF: Inspect EVERY main subject mentioned in the prompt (vehicle, car, truck, paint bucket, product, person, animal, object). For each one: is ANY part of that subject outside the image boundary (cut off by the edge)? Even a single wheel, bumper, roof corner, handle, or foot being cut off is a FAIL. Be extremely strict — if you can see that the image would need to show more of the subject to be complete, it FAILS. Common failures: car hood/roof/bumper cut off at top or side, product label partially outside frame, person's feet or head cropped.

CHECK 2 — SUBJECTS NOT INTEGRATED: If the prompt describes multiple subjects together (e.g. a car AND a paint bucket), verify they are in the SAME scene together. If the paint bucket is placed on a beach separately from the car, or any subject appears in a completely different location from the others, this FAILS.

CHECK 3 — COLLAGE / SPLIT SCREEN: No split-screen, picture-in-picture, multiple panels, or photo-in-photo layouts.

CHECK 4 — TEXT LEGIBILITY: Any text/labels on products must be sharp, clear, well-formed UTF-8 characters. Blurry, garbled, or abstract character blobs = FAIL.

CHECK 5 — PRODUCT SURFACE CONTACT: Does the main product appear to rest naturally and directly on the surface (table/floor/workbench)? The product must have believable physical contact with the surface. FAIL conditions: the product appears to hover or float above the surface with no visible shadow or contact; an artificial stand, base, or pedestal that was NOT described in the user prompt appears to support the product (making it look like a display prop rather than a real-world scene). IMPORTANT: Background elements like lamps, fixtures, tools, or objects that were part of the requested scene are NOT a fail — only objects that unnaturally affect the product's own placement on the surface count.

Return a JSON object:
- "passed": boolean
- "score": number (0-100; below 70 = fail)
- "issues": string[] in Hungarian (e.g. ["levágott autó", "festékes vödör nincs az autó mellett", "olvashatatlan felirat"])
- "explanation": string in Hungarian
- "suggestedPromptAdjustment": string in English — if subjects are cut off, say EXACTLY: "wide angle shot, pull camera back to show the ENTIRE [subject] from [start] to [end], all elements fully inside the frame, do not crop any part of [subject]". If subjects are separate, say: "place [subject1] directly next to/on/with [subject2] in the same location, they must be physically together in one unified scene".

You MUST return ONLY the JSON object.`;

    const userPrompt = `Perform visual checkup on this generated image.`;

    const modelName = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 800,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: 'user', content: [imageContentBlock, { type: 'text', text: userPrompt }] }],
    });

    const textContent = response.content[0].type === 'text' ? response.content[0].text : '';
    console.log(`[CHECKUP] Claude checkup response:`, textContent);

    const cleanJson = extractJsonStr(textContent);
    const parsed = JSON.parse(cleanJson);

    console.log(`[CHECKUP] Finished in ${Date.now() - start}ms: passed=${parsed.passed}, score=${parsed.score}`);
    return {
      passed: parsed.passed === true,
      score: typeof parsed.score === 'number' ? parsed.score : 80,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      explanation: parsed.explanation || '',
      suggestedPromptAdjustment: parsed.suggestedPromptAdjustment || '',
    };
  } catch (err: any) {
    console.error(`[CHECKUP] Error during checkup:`, err.message);
    return {
      passed: true,
      score: 100,
      issues: [],
      explanation: `Checkup error: ${err.message}`,
      suggestedPromptAdjustment: '',
    };
  }
}

async function detectProductPositionHelper(imageUrl: string): Promise<{ xmin: number; xmax: number; ymin: number; ymax: number } | null> {
  console.log(`[POSITION-DETECT] Helper detecting product bounds for: ${imageUrl}`);
  try {
    const fullUrl = imageUrl.startsWith('http') ? imageUrl : `http://localhost:3001${imageUrl}`;
    const imageBlock = await fetchImageAsClaudeBlock(fullUrl);

    const systemPrompt = `You are a computer vision AI specialized in detecting the exact bounding box of a product container (such as a paint can, bucket, jar, or box) in an image.

Follow these rules for high-precision detection:
1. The product container includes its lid, handle, rim, and base. If there is a lid on top (even if dark or matching the character's hands), it IS part of the product. Detect from the very top edge of the lid.
2. Do NOT include shadows on the ground or floor beneath the product base. The bottom boundary should be the physical bottom edge of the container itself, not the cast shadow.
3. Do NOT include hands, fingers, or characters touching or holding the product. Cut them off and focus only on the container's physical boundaries.
4. Return the coordinates as percentage integers (0 to 100) of the image's total width and height.

Return ONLY a JSON object (no markdown, no wrap):
{
  "xmin": number (0-100),
  "xmax": number (0-100),
  "ymin": number (0-100),
  "ymax": number (0-100)
}`;

    const modelName = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 200,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: 'user', content: [imageBlock, { type: 'text', text: 'Detect the main product bounding box.' }] }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = extractJsonStr(text);
    const parsed = JSON.parse(cleaned);
    
    let xmin = typeof parsed.xmin === 'number' ? parsed.xmin : 25;
    let xmax = typeof parsed.xmax === 'number' ? parsed.xmax : 75;
    let ymin = typeof parsed.ymin === 'number' ? parsed.ymin : 30;
    let ymax = typeof parsed.ymax === 'number' ? parsed.ymax : 95;

    // Normalization safeguard: if absolute pixels are returned (values > 100), convert to percent!
    // Since images are standard 1024x1536, scale based on those dims if they exceed 100.
    if (ymax > 100 || xmax > 100) {
      console.log(`[POSITION-DETECT] Detected absolute values (xmin=${xmin}, xmax=${xmax}, ymin=${ymin}, ymax=${ymax}). Converting to percent...`);
      xmin = Math.round((xmin / 1024) * 100);
      xmax = Math.round((xmax / 1024) * 100);
      ymin = Math.round((ymin / 1536) * 100);
      ymax = Math.round((ymax / 1536) * 100);
    }

    // Clamp values between 0 and 100
    xmin = Math.max(0, Math.min(100, xmin));
    xmax = Math.max(0, Math.min(100, xmax));
    ymin = Math.max(0, Math.min(100, ymin));
    ymax = Math.max(0, Math.min(100, ymax));

    console.log(`[POSITION-DETECT] Helper detected: xmin=${xmin}, xmax=${xmax}, ymin=${ymin}, ymax=${ymax}`);
    return { xmin, xmax, ymin, ymax };
  } catch (err: any) {
    console.error('[POSITION-DETECT] Helper error:', err.message);
    return null;
  }
}

// Helper to refine and correct analyzed image descriptions using DeepSeek Chat API
async function optimizeAnalysisWithDeepSeek(analysisResult: any): Promise<any> {
  const apiKey = process.env.Deepseek_KEY;
  if (!apiKey) {
    console.log('[DEEPSEEK] Deepseek_KEY is not configured in .env, skipping optimization.');
    return analysisResult;
  }

  console.log('[DEEPSEEK] Optimizing image analysis descriptions using DeepSeek chat...');
  const start = Date.now();

  const systemPrompt = `You are a professional Hungarian copywriter, proofreader, and translation expert.
You will be given a JSON object containing details from an image analysis.
Your task is to refine and correct all Hungarian and English descriptions, resolving any OCR typos or spelling mistakes.

CRITICAL TYPO RULES:
- Correct the spelling of Hungarian labels on containers: transcribe "koromfoltokra" (meaning soot spots) with an 'o', NEVER as "körömfoltokra" (nail spots) or "köromfoltokra".
- Verify and polish the generic foreground description in "subject" and "altText" (both in English), ensuring NO specific brand names (e.g. use "luxury sedan car", "can of interior paint" instead of "Audi", "Poli-Farbe", etc.).
- Ensure "extractedText" transcribes the exact text on the image with perfect spelling (but preserving proper brand names like "Poli-Farbe" or "Audi").
- Ensure "textPlacement" has a polished, natural Hungarian description of the text location.

Output ONLY a valid JSON object matching the input structure exactly. Do not output markdown backticks (like \`\`\`json), explanations, or trailing commas.`;

  try {
    const response = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(analysisResult, null, 2) }
        ],
        temperature: 0.1
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from DeepSeek API');
    }

    console.log(`[DEEPSEEK] Raw response:`, content.substring(0, 300));
    const cleanJson = extractJsonStr(content);
    const optimized = JSON.parse(cleanJson);
    console.log(`[DEEPSEEK] ✅ Optimization complete in ${Date.now() - start}ms`);
    return {
      ...analysisResult,
      ...optimized
    };
  } catch (err: any) {
    console.error('[DEEPSEEK] ❌ Optimization failed:', err.message);
    return analysisResult;
  }
}

// Route: Image analysis using Claude Vision
app.post('/api/image/analyze', async (req, res) => {
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
          max_tokens: 4000,
          temperature: 0.1,
          system: lightingSystemPrompt,
          messages: [{ role: 'user', content: [imageContentBlock, {
            type: 'text',
            text: 'Analyze this product image using the physics laws provided. Return ONLY the JSON with lightingAnalysis key. Derive all numbers from what you observe — do not guess randomly.'
          }] }],
        });

        const lightingText = lightingResp.content[0].type === 'text' ? lightingResp.content[0].text : '{}';
        const stopReason = lightingResp.stop_reason;
        console.log(`[ANALYZE] LightingAnalysis stop_reason=${stopReason} | response length=${lightingText.length} chars (first 300):`, lightingText.slice(0, 300));

        // Truncation-tolerant parse: if stop_reason='max_tokens', the JSON may be incomplete.
        // Try to recover partial JSON by closing all open braces before parsing.
        let lightingTextToParse = lightingText;
        if (stopReason === 'max_tokens') {
          console.warn(`[ANALYZE] ⚠️ LightingAnalysis response was truncated (max_tokens hit). Attempting partial JSON recovery...`);
          // Count open vs closed braces and close any unclosed ones
          let openBraces = 0; let openBrackets = 0; let inString = false; let escape = false;
          for (const ch of lightingTextToParse) {
            if (escape) { escape = false; continue; }
            if (ch === '\\' && inString) { escape = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (!inString) { if (ch === '{') openBraces++; else if (ch === '}') openBraces--; else if (ch === '[') openBrackets++; else if (ch === ']') openBrackets--; }
          }
          // Close truncated string if needed, then close brackets/braces
          if (inString) lightingTextToParse += '"';
          lightingTextToParse += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces));
        }

        const lightingParsed = JSON.parse(extractJsonStr(lightingTextToParse));
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
});

// Route: Composite image generation
app.post('/api/image/composite-generate', async (req, res) => {
  const { slots, scenePrompt, brandKit, aspectRatio, width, height, previewOnly, preserveOriginal, productAwareBg, exactTextOnly = false } = req.body;
  if (!slots || !Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ error: 'slots array is required.' });
  }

  const start = Date.now();
  console.log(`\n[COMPOSITE-GENERATE] Starting composite generation/preview with ${slots.length} slots. preserveOriginal=${!!preserveOriginal}`);

  try {
    const slotSubjects = slots.map(s => {
      let desc = s.userEditedDescription || s.analysis?.shortSubject || s.analysis?.subject || s.role || 'object';
      desc = condenseDescription(desc);
      desc = desc.replace(/\b(audi|polifarbe|poli-farbe|bmw|mercedes)\b/gi, '').replace(/\s+/g, ' ').trim();
      return desc;
    });

    const brandRules = brandKit?.visualRules || [];
    const brandTone  = brandKit?.tone || [];
    // SAFETY: brandKit.brandDna can arrive as string, object, or array depending on frontend version.
    // Always force to string before any string operations (.match, template literals, etc.)
    const safeBrandDna: string = (() => {
      const raw = brandKit?.brandDna;
      if (!raw) return brandRules.join('; ');
      if (typeof raw === 'string') return raw;
      if (Array.isArray(raw)) return (raw as string[]).join('; ');
      if (typeof raw === 'object') return JSON.stringify(raw);
      return String(raw);
    })();

    // ── Step 0: Decompose user prompt into scene vs. layer text ──────────────
    // This prevents promotional text (e.g. "30% kedvezmény") from entering FLUX
    // SCENE OVERRIDE: prefix signals that the scenario is absolute priority — strip it before processing
    const sceneOverrideMode = scenePrompt.trim().startsWith('SCENE OVERRIDE:');
    const rawSceneForDecompose = sceneOverrideMode
      ? scenePrompt.trim().replace(/^SCENE OVERRIDE:\s*/i, '')
      : scenePrompt.trim();
    if (sceneOverrideMode) {
      console.log(`[COMPOSITE-GENERATE] SCENE OVERRIDE mode active → DNA style will be SUPPRESSED regardless of mood keywords`);
    }

    const decomposed = await decomposeUserPrompt(
      rawSceneForDecompose,
      slotSubjects,
      safeBrandDna,
      exactTextOnly
    );
    const effectiveScenePrompt = decomposed.scenePrompt;
    console.log(`[COMPOSITE-GENERATE] Decomposed — scene: "${effectiveScenePrompt}" | layerText: ${decomposed.layerText} | layerCta: ${decomposed.layerCta}`);

    // Intelligently compose, translate and merge scene prompt with slot contents (and strip brand names)
    let activePrompt = await intelligentComposePrompt(effectiveScenePrompt, slotSubjects, brandRules);
    
    // Style tags from DNA — only append if user didn't already specify a style/mood/atmosphere.
    // If the user's scene prompt contains explicit mood words, DNA style is secondary.
    // SCENE OVERRIDE mode: DNA style ALWAYS suppressed — scenario wins completely.
    const userSpecifiedMood = sceneOverrideMode || /\b(dark|moody|messy|cluttered|clean|bright|gritty|rustic|industrial|minimal|dramatic|soft|warm|cold|vintage|modern|elegant|snowy|mountain|forest|beach|outdoor|indoor|studio|kitchen|garden|rain|snow|fog|sunset|sunrise)\b/i.test(effectiveScenePrompt);
    if (brandRules.length > 0 && !userSpecifiedMood) {
      // User didn't specify a style → use DNA style to fill the gap
      const styleTags = await getStyleTags(brandRules);
      if (styleTags) {
        activePrompt += `, style: ${styleTags}`;
      } else {
        const { translated } = await translateToEnglish(brandRules.join(', '));
        activePrompt += `, style: ${translated}`;
      }
      console.log(`[COMPOSITE-GENERATE] DNA style appended (user didn't specify mood): userSpecifiedMood=false`);
    } else if (brandRules.length > 0) {
      console.log(`[COMPOSITE-GENERATE] DNA style SKIPPED — ${sceneOverrideMode ? 'SCENE OVERRIDE active' : 'user specified mood in prompt'} (userSpecifiedMood=true)`);
    }

    // Final safety regex filter to guarantee no brand names are present
    activePrompt = activePrompt
      .replace(/\b(audi|polifarbe|poli-farbe|bmw|mercedes|porsche|ferrari|lamborghini|ford|toyota|honda)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (previewOnly) {
      console.log(`[COMPOSITE-GENERATE] Preview only requested. Composed prompt: "${activePrompt}"`);
      return res.json({ prompt: activePrompt, decomposedLayerText: decomposed.layerText, decomposedLayerCta: decomposed.layerCta });
    }

    let inputImage: string | undefined = undefined;
    let inputImage2: string | undefined = undefined;

    if (slots.length > 1) {
      // Multiple slots: use the best available version of each slot (upscaled > preprocessed > original)
      inputImage  = slots[0]?.preprocessedUrl || slots[0]?.originalUrl || undefined;
      inputImage2 = slots[1]?.preprocessedUrl || slots[1]?.originalUrl || undefined;
    } else {
      // Single slot:
      // - inputImage  = preprocessedUrl (the cutout/background-removed image)
      // - inputImage2 = upscaledUrl (the upscaled version), ONLY if it differs from preprocessedUrl
      // We do NOT send the originalUrl — it conflicts with the cutout reference and degrades quality.
      const preprocessed = slots[0]?.preprocessedUrl || undefined;
      const upscaled = slots[0]?.upscaledUrl || undefined;

      inputImage  = preprocessed || slots[0]?.originalUrl || undefined; // fallback to original only if no cutout
      inputImage2 = upscaled && upscaled !== preprocessed ? upscaled : undefined;
    }

    // Shared variables for both generation paths
    const w = width ? Number(width) : 1024;
    const h = height ? Number(height) : 1536;
    const ar = aspectRatio || '2:3';
    let imageUrl = '';
    let genModel = '';
    let genTime = 0;
    let checkupResult: any = null;
    let selectedTemplateId: string | null = null;
    let suggestedStyles: { styleId: string; reason: string }[] = [];
    let debugBgRawUrl: string | null = null;
    let debugBgHarmonizedUrl: string | null = null;


    // ── preserveOriginal: 2-step composite ─────────────────────────────────
    // Step 1: Generate ONLY the background (no product reference)
    // Step 2: sharp-composite the rembg cutout on top pixel-perfectly
    if (preserveOriginal && inputImage) {
      const rembgImagePath = inputImage; // local path like /renders/rembg-xxxx.png

      // Build a rich, cinematic background prompt — environment-only, no product
      // Key: must be atmospheric, textured, realistic — NOT clean/sterile/minimal
      const { translated: userSceneEN } = await translateToEnglish(scenePrompt?.trim() || 'workshop with spotlight');

      // Extract ONLY location keywords from user prompt — NOT lighting type.
      // RULE: Lighting quality (direction, temperature, intensity) comes from the
      //       LightingAnalysis JSON (productAwareAddition) which is physics-derived.
      //       Adding lighting keywords here (e.g. "overhead spotlight") causes FLUX to
      //       render PHYSICAL light sources (lamps, fixtures) as scene objects.
      //       The LA fullBgPrompt already describes the lighting atmosphere correctly.
      let sceneKeywords = '';
      // Brand DNA default environment — used as fallback when prompt has no location.
      // PRIORITY: user prompt > Brand DNA. If prompt specifies a place, it wins.
      // safeBrandDna is already a guaranteed string (defined above in handler scope).
      const brandDnaEnvMatch = safeBrandDna.match(/(?:environment|scene|location|setting|background|place|space)[:=]?\s*([^,;.\n]{3,40})/i);
      const brandDnaEnvFallback = brandDnaEnvMatch ? brandDnaEnvMatch[1].trim() : '';
      try {
        const kwModel = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
        const kwResp = await anthropic.messages.create({
          model: kwModel,
          max_tokens: 80,
          temperature: 0,
          system: `Extract ONLY the physical LOCATION/ENVIRONMENT from the user's text as 2-3 comma-separated English keywords. ONLY include the place — NOT lighting, NOT objects, NOT actions. Examples: "workshop" / "kitchen counter" / "outdoor garden" / "dark alley". If the text mentions a lighting type (overhead spotlight, window light, etc.) DO NOT include it — location only. If no clear location is found, output exactly: NO_LOCATION`,
          messages: [{ role: 'user', content: userSceneEN }]
        });
        const kwText = kwResp.content[0].type === 'text' ? kwResp.content[0].text.trim() : '';
        if (kwText && kwText !== 'NO_LOCATION' && kwText.length > 2) {
          sceneKeywords = kwText;  // Prompt has explicit location — use it (wins over Brand DNA)
          console.log(`[COMPOSITE-GENERATE][preserveOriginal] Scene keywords from PROMPT: "${sceneKeywords}"`);
        } else if (brandDnaEnvFallback) {
          // Prompt has no location — fall back to Brand DNA preferred environment
          sceneKeywords = brandDnaEnvFallback;
          console.log(`[COMPOSITE-GENERATE][preserveOriginal] Scene keywords from BRAND DNA fallback: "${sceneKeywords}"`);
        } else {
          sceneKeywords = 'workshop';  // last resort generic
          console.log(`[COMPOSITE-GENERATE][preserveOriginal] Scene keywords: FALLBACK generic "${sceneKeywords}"`);
        }
      } catch {
        sceneKeywords = brandDnaEnvFallback || userSceneEN.slice(0, 60);
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] Scene keywords: ERROR fallback "${sceneKeywords}"`);
      }

      // ── SOURCE-OF-TRUTH surface position ─────────────────────────────────────
      const TARGET_SURFACE_Y_PCT = 75;
      const surfaceCompositionInstruction =
        `the surface/table/workbench top edge is positioned at exactly ${TARGET_SURFACE_Y_PCT}% from the top of the image, ` +
        `the lower ${100 - TARGET_SURFACE_Y_PCT}% of the frame is the physical table surface, ` +
        `the upper ${TARGET_SURFACE_Y_PCT}% is air and background environment`;
      // ── PERSPECTIVE CAMERA INSTRUCTION (from perspective_camera_book.md §6.1) ──
      // CRITICAL: The FLUX BG must use the SAME camera angle (phi) as the product photo.
      // Without this, FLUX generates a frontal (phi=0°) table — product appears to float.
      // The placement.cameraAngle + cameraFOV from LightingAnalysis drive this instruction.
      // Built BEFORE lightingAnalysis is populated — will be reassigned below after LA loads.
      let perspectiveCameraInstruction = '';
      // Will be populated after lightingAnalysis is available (see below)

      // ── Product-aware BG analysis — LightingAnalysis JSON v2.0 ─────────────
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
          // Strip conflicting clean-white-studio hints from the LA fullBgPrompt.
        // The bgOnlyPrompt already adds dark atmospheric mood — if the LA JSON
        // says "clean white seamless studio", it contradicts the mood instruction
        // and FLUX gets confused → results in plain white wall + industrial lamp mix.
        let rawAddition = lightingAnalysis.prompts?.fullBgPrompt || '';
        // RULE: Strip ALL background-type prescriptions — these describe the ORIGINAL product photo
        // background, not the user's requested scene. They override the user's mood/atmosphere.
        rawAddition = rawAddition
          .replace(/clean white seamless studio background[^,.]*/gi, '')
          .replace(/seamless white background[^,.]*/gi, '')
          .replace(/white studio[^,.]*/gi, '')
          .replace(/professional product photography (style|background)[^,.]*/gi, '')
          .replace(/neutral (clean|white) background[^,.]*/gi, '')
          .replace(/studio (setting|environment|background)[^,.]*/gi, '')
          .replace(/,\s*,/g, ',').trim().replace(/^[,.]\s*/, '');
        // RULE: Strip explicit light-source POSITION phrases.
        rawAddition = rawAddition
          .replace(/key light from [^,.;]*/gi, '')
          .replace(/\blight (source |position )?(from|at|on) (the )?(top-?right|top-?left|right|left|top|bottom)[^,.;]*/gi, '')
          .replace(/,\s*,/g, ',').trim().replace(/^[,.]\s*/, '');
        productAwareAddition = rawAddition;
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
      // RULE: This prompt describes the ENVIRONMENT ONLY — no product, no foreground objects.
      // RULE: Light sources are described as ATMOSPHERIC CONDITIONS, not physical objects.
      //       "warm workshop light" = OK. "a hanging lamp" = NOT OK unless user requested it.
      //       The sceneKeywords (extracted from user prompt) are the authoritative source of
      //       what environment elements belong in the scene.
      // RULE: The productAwareAddition from LightingAnalysis describes lighting QUALITY
      //       (color temperature, direction) — not background COLOR (no "white studio").
      // RULE: We always explicitly define the surface position so FLUX places the table
      //       at a consistent depth, regardless of keyword content.
      // ── PERSPECTIVE CAMERA INSTRUCTION — built from LA placement data ─────────
      // Source: perspective_camera_book.md §6.1 — exact FLUX prompt wording per phi angle.
      // placement.cameraAngle: 'eye-level' | 'slightly-above' | 'low-angle' | 'bird-eye'
      // placement.cameraFOV:   'wide' | 'normal' | 'telephoto'
      // placement.perspectiveDistortion: 'none' | 'slight' | 'moderate' | 'strong'
      const laPlacement = lightingAnalysis?.placement;
      const pCameraAngle = laPlacement?.cameraAngle ?? 'slightly-above';
      const pCameraFOV   = laPlacement?.cameraFOV   ?? 'normal';
      const pPerspDist   = laPlacement?.perspectiveDistortion ?? 'slight';

      // FLUX prompt wording from §6.1 — describes WHAT WE SEE, not math angles
      const cameraAnglePrompts: Record<string, string> = {
        'eye-level':
          'camera at eye level with the product, facing directly forward, ' +
          'table surface as a thin horizontal band barely visible at the bottom, ' +
          'product seen straight-on from the side, single-point perspective, ' +
          'table edges run straight left and right without converging',
        'slightly-above':
          'camera slightly elevated approximately 15-20 degrees above horizontal, ' +
          'small amount of tabletop surface visible in foreground (10-15% of frame height), ' +
          'product seen mostly from the front with slight downward angle, ' +
          'top of product slightly visible as a narrow ellipse, ' +
          'table surface perspective lines converge gently toward sides, ' +
          'two-point perspective tendency',
        'low-angle':
          'camera below eye level, looking upward at product, ' +
          'table edge visible prominently at the top of table zone, ' +
          'product appears tall and imposing, bottom of product cropped or near frame edge',
        'bird-eye':
          'high angle shot camera pointing steeply downward approximately 45-60 degrees, ' +
          'dominant tabletop surface visible surrounding product, ' +
          'product top clearly visible occupying most of visible product area, ' +
          'strong three-point perspective convergence',
      };
      const fovPrompts: Record<string, string> = {
        'wide':       'wide-angle lens, slight barrel distortion at table edges, strong perspective depth, nearby elements appear larger',
        'normal':     'standard lens, natural undistorted perspective, proportions appear true to life',
        'telephoto':  'telephoto compression, background appears closer to product, subtle telephoto flattening, shallow depth of field',
      };
      perspectiveCameraInstruction = [
        cameraAnglePrompts[pCameraAngle] ?? cameraAnglePrompts['slightly-above'],
        fovPrompts[pCameraFOV] ?? fovPrompts['normal'],
      ].join(', ');
      console.log(`[COMPOSITE-GENERATE][preserveOriginal] [PERSPECTIVE] cameraAngle=${pCameraAngle} FOV=${pCameraFOV} perspDist=${pPerspDist} → prompt: "${perspectiveCameraInstruction.slice(0, 80)}..."`);

      // compositionPrompt from LA: describes SCENE FRAMING — safe for BG (not product-specific)
      const laPrompts = lightingAnalysis?.prompts;
      const laCompositionPrompt = laPrompts?.compositionPrompt || '';

      // Build extra prompt suffixes from LA fields that describe BACKGROUND ENVIRONMENT only.
      // CRITICAL RULE: Only add prompts that describe SCENE ATMOSPHERE — NOT the product itself.
      // Fields like materialPromptSuffix, fresnelPrompt, sssEdgePrompt, threePointPrompt describe
      // the PRODUCT (white PP bucket, cylindrical edges, three-point setup). If these go into
      // the BG FLUX generation, FLUX hallucinates a ghost bucket in the background and switches
      // to a sterile white studio look. These product-specific fields are for the compositor only.
      // SAFE for BG: volumetricLightPrompt (scene atmosphere: fog, haze, god rays).
      // SAFE for BG: compositionPrompt (scene framing rules, not product description).
      const bgSafeExtraParts: string[] = [
        laPrompts?.volumetricLightPrompt  || '',  // scene atmosphere — OK for BG
        laCompositionPrompt               || '',  // scene framing — OK for BG
        // laPrompts?.materialPromptSuffix  — PRODUCT description, NOT for BG
        // laPrompts?.fresnelPrompt         — PRODUCT edge effect, NOT for BG
        // laPrompts?.sssEdgePrompt         — PRODUCT material, NOT for BG
        // laPrompts?.threePointPrompt      — PRODUCT lighting setup, NOT for BG
      ].filter(Boolean);
      const extraPromptStr = bgSafeExtraParts.join(', ');
      if (laPrompts?.materialPromptSuffix || laPrompts?.fresnelPrompt || laPrompts?.threePointPrompt) {
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] [LA] Product prompts (compositor-only, NOT in BG): mat="${(laPrompts?.materialPromptSuffix||'').slice(0,40)}" fresnel="${(laPrompts?.fresnelPrompt||'').slice(0,40)}" 3pt="${(laPrompts?.threePointPrompt||'').slice(0,40)}"`);
      }
      // ── Build bgOnlyPrompt with user mood FIRST (highest priority to FLUX) ──────
      // CRITICAL: sceneKeywords only contains the LOCATION (e.g. "workshop") — the
      // USER ATMOSPHERE ("slightly cluttered", "rustic", "gloomy") is in effectiveScenePrompt.
      // If we only use sceneKeywords, FLUX defaults to a clean studio interpretation.
      // Solution: use effectiveScenePrompt as the FIRST token (highest FLUX attention),
      // then sceneKeywords as a secondary anchor, then technical instructions.
      const bgMoodPrefix = (() => {
        if (!effectiveScenePrompt) return sceneKeywords;
        let mood = effectiveScenePrompt
          // Strip product-description parts (we only want scene/environment description)
          .replace(/\bwhite plastic (paint )?bucket[^,.;]*/gi, '')
          .replace(/\bdark navy blue lid[^,.;]*/gi, '')
          .replace(/\blabel[^,.;]*/gi, '')
          .replace(/\bblue and white design[^,.;]*/gi, '')
          .replace(/\bfeatur(ing|es)[^,.;]*/gi, '')
          .replace(/close-?up product composition[^,.;]*/gi, '')
          .replace(/professional style[^,.;]*/gi, '')
          // Strip orphaned verb phrases left after product noun removal
          .replace(/\bplaced (directly )?on [^,.;]+/gi, '')
          .replace(/\bsit(ting|s)? on [^,.;]+/gi, '')
          .replace(/\b(resting|standing) on [^,.;]+/gi, '')
          // Clean dangling article fragments: "A ," "An ," "The ,"
          .replace(/\b(A|An|The)\s*,/g, '')
          .replace(/,\s*,/g, ',').trim().replace(/^[,. ]+|[,. ]+$/g, '');
        // If too little remains after stripping, fall back to sceneKeywords
        if (mood.replace(/[,. ]/g, '').length < 8) return sceneKeywords;
        return mood;
      })();
      console.log(`[COMPOSITE-GENERATE][preserveOriginal] [BG-MOOD] Scene mood prefix: "${bgMoodPrefix.slice(0, 120)}"`);
      const bgOnlyPrompt = [
        bgMoodPrefix,          // ← USER ATMOSPHERE: highest FLUX attention ("slightly cluttered workshop")
        sceneKeywords,         // ← location anchor ("workshop, workbench")
        surfaceCompositionInstruction,
        perspectiveCameraInstruction,
        ...(productAwareAddition ? [productAwareAddition] : []),
        ...(extraPromptStr ? [extraPromptStr] : []),
        'photorealistic cinematic photography, textured and imperfect surfaces, real environment',
        'lighting is environmental and atmospheric — scene elements come from the scene description, not added by default',
        'shallow depth of field, background detail with natural blur',
        'richly detailed background with authentic atmosphere — NOT sterile, NOT minimal, clutter and imperfections are welcome',
        // CRITICAL: the table/workbench surface must be completely empty
        // FLUX tends to hallucinate a bottle/flask/tool in the center of the frame.
        // These explicit prohibitions prevent that.
        'THE TABLE SURFACE IS COMPLETELY EMPTY AND BARE — no objects, no bottles, no flasks, no products, no cylinders, no tools, no anything on the table surface',
        'the workbench top itself is clear with nothing sitting on it — completely bare wooden surface only',
        'no bottle, no flask, no jar, no container, no object placed on the table or workbench',
        // Extend prohibition ABOVE table too — FLUX-generated objects extend above their base
        'the CENTER of the image is completely empty — no object, no product placeholder, no bottle silhouette anywhere in the center vertical zone of the image',
        'background walls, pegboards, and shelves may have tools and clutter — but the TABLE SURFACE and the AIR ABOVE IT must be completely clear of any objects',
        'high quality photography',
      ].join('. ');
      // bgNegativePrompt from LA — logged for reference (FLUX Flex does not accept neg prompt via API,
      // but it is injected into harmonizer as avoidance instruction)
      const laBgNegativePrompt = laPrompts?.bgNegativePrompt || '';
      if (laBgNegativePrompt) {
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] [LA] bgNegativePrompt: "${laBgNegativePrompt}"`);
      }
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
      // Save BG #1 (raw generated BG) — keep for debugging
      const bgRawFilename = `bg-raw-${Date.now()}.jpg`;
      const bgRawPath = path.join(rendersDir, bgRawFilename);
      await fs.promises.writeFile(bgRawPath, bgBuffer);
      debugBgRawUrl = `http://localhost:${port}/renders/${bgRawFilename}`;
      console.log(`[DEBUG-IMG] ▶ BG #1 (raw FLUX output): ${debugBgRawUrl}`);
      const bgAnalyzeFilename = bgRawFilename;
      const bgAnalyzePath = bgRawPath;
      const sceneCtx = await analyzeSceneContext(`http://localhost:${port}/renders/${bgAnalyzeFilename}`);
      // Keep bg-raw file — user uses it to check intermediate results

      // ── Product-aware compositing override — v2.0 (direct numeric values) ─────
      // When lightingAnalysis is available, override sceneCtx with the pre-computed
      // physics values. All values are DIRECT NUMBERS — no string-to-number heuristics.
      // Save BG scene darkness BEFORE any product-aware override — needed for warm tint boost.
      const bgSceneAnalysisDarkness = sceneCtx.ambientDarkness;  // from SCENE-ANALYZE, unmodified
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

        // CRITICAL BUG FIX: LA shadow directional values (dropOffsetX, dropOffsetY, dropOpacity,
        // dropLengthPx, dropBlurPx) are derived from the ORIGINAL STUDIO PRODUCT PHOTO.
        // These studio-specific values do NOT match the workshop/background scene lighting.
        // Example: studio dropOffsetX=-18px → tiny shift that creates a round disc, not an elongated cast shadow.
        // Fix: nullify these values so our dynamic scene-based formulas run instead.
        // Only STRUCTURAL values (hasDropShadow, dropWidthMultiplier, penumbraWidth) are kept.
        if (lightingAnalysis.shadow) {
          lightingAnalysis.shadow.dropOffsetX  = undefined;  // use sceneCtx.lightSourceXPercent formula
          lightingAnalysis.shadow.dropOffsetY  = undefined;  // no y-shift by default
          lightingAnalysis.shadow.dropOpacity  = undefined;  // use laDarkness formula
          lightingAnalysis.shadow.dropLengthPx = undefined;  // use finalH * 0.12 formula
          lightingAnalysis.shadow.dropBlurPx   = undefined;  // use penumbraBlur formula
          lightingAnalysis.shadow.penumbraWidth = undefined;  // use shadowH-based blur formula (studio penumbra is wrong for scene)
          console.log(`[COMPOSITE-GENERATE][preserveOriginal] [PRODUCT-AWARE-v2] Studio shadow directionals nullified → dynamic scene-based shadow will be used`);
        }
      }

      // surfaceY = derived from our TARGET, not from Claude Vision guess
      // Claude's surfaceYPercent is logged for reference but NOT used for placement.
      const surfaceY = Math.round(bgH * (TARGET_SURFACE_Y_PCT / 100));
      console.log(
        `[COMPOSITE-GENERATE][preserveOriginal] surfaceY=TARGET ${TARGET_SURFACE_Y_PCT}%=${surfaceY}px` +
        ` (Claude guessed ${sceneCtx.surfaceYPercent}% — ignored for placement)` +
        ` | scale=${sceneCtx.recommendedScalePercent}% | lightTemp=${sceneCtx.lightTemperatureK}K | darkness=${sceneCtx.ambientDarkness}` +
        (productAwareBg && lightingAnalysis ? ' [product-aware override active]' : '')
      );


      // ── Helper: render SVG on explicit transparent RGBA canvas ─────────────
      // Direct sharp(svgBuffer).png() may leave non-zero alpha in "transparent" areas
      // causing rectangle artifacts with screen/soft-light blend modes.
      const svgToTransparentPng = async (svgBuf: Buffer, w: number, h: number): Promise<Buffer> =>
        sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
          .composite([{ input: await sharp(svgBuf).png().toBuffer(), blend: 'over' }])
          .png().toBuffer();

      // Load the rembg cutout (local file, PNG with transparency)
      // ── Step F: FLUX img2img on BACKGROUND ONLY (before compositing) ────────────
      // CRITICAL: FLUX runs on the BACKGROUND, NOT on the full composite.
      // The product label is NEVER touched by FLUX. FLUX only harmonizes the
      // background lighting/atmosphere before the product is placed on it.
      // We add a soft placeholder shadow where the product will sit so FLUX
      // generates natural ground AO and warm light pooling at that location.
      let harmonizedBgBuffer = bgBuffer;
      try {
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] [F] FLUX BG-only harmonization...`);
        const phH = Math.round(bgH * (sceneCtx.recommendedScalePercent / 100));
        const phW = Math.round(phH);
        const phCenterX = Math.round(bgW / 2);
        const phSurfaceY = Math.round(bgH * (TARGET_SURFACE_Y_PCT / 100));
        // NOTE: Placeholder shadow ellipse was REMOVED — it was baking a visible black ring
        // onto the table surface which FLUX then learned and reproduced in the final image.
        // Contact shadow is applied by the Sharp compositor after compositing, not here.
        const bgWithPlaceholder = bgBuffer; // use BG directly, no placeholder overlay
        const bgPhFilename = `bg-ph-${Date.now()}.jpg`;
        const bgPhPath = path.join(rendersDir, bgPhFilename);
        await fs.promises.writeFile(bgPhPath, await sharp(bgWithPlaceholder).jpeg({ quality: 95 }).toBuffer());
        const bgPhUrl = `http://localhost:${port}/renders/${bgPhFilename}`;
        // Harmonize prompt RULE SYSTEM:
        // RULE 1: bgMoodPrefix (user atmosphere) is primary — preserve the scene mood.
        // RULE 2: LA bgLightingPrompt = lighting QUALITY only (strip BG-type prescriptions).
        // RULE 3: Harmonizer adjusts AO/contact/light cohesion — not scene content.
        let harmonizeLightHint = lightingAnalysis?.prompts?.bgLightingPrompt || '';
        harmonizeLightHint = harmonizeLightHint
          .replace(/\b(clean\s+)?(white|seamless|studio)\s+(background|wall|surface)[^,.;]*/gi, '')
          .replace(/professional product photography (style|background)[^,.;]*/gi, '')
          // Strip studio light SOURCE directions — these cause FLUX to add corner flares
          .replace(/\bstudio light[^,.;]*/gi, '')
          .replace(/\bkey light[^,.;]*/gi, '')
          .replace(/\bfrom (the )?(top-?right|top-?left|right|left|top|bottom)[^,.;]*/gi, '')
          .replace(/\blight from [^,.;]*/gi, '')
          .replace(/\bfill (light |from )[^,.;]*/gi, '')
          .replace(/,\s*,/g, ',').trim().replace(/^[,. ]+/, '');
        const harmonizeFallback = 'natural shadows and ambient occlusion on surface, cohesive scene lighting';
        const avoidClause = laBgNegativePrompt ? ` Avoid: ${laBgNegativePrompt}.` : '';
        // Use bgMoodPrefix (has user atmosphere) instead of bare sceneKeywords
        const harmonizePrompt =
          `${bgMoodPrefix}, ${sceneKeywords}. ` +
          `${harmonizeLightHint || harmonizeFallback}. ` +
          `Reinforce existing scene atmosphere and mood, enhance surface contact and ambient occlusion. Photorealistic. ` +
          `No light flare, no bright vignette in corners, no glowing corners, no added light sources. Preserve the exact scene as-is. ` +
          `IMPORTANT: The table/workbench surface must be completely bare and empty — remove any bottles, flasks, objects, or products from the table surface if present. The table top must have nothing on it.${avoidClause}`;
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] [F] Harmonize prompt: "${harmonizePrompt.slice(0, 200)}"`);
        const harmonizedBgResult = await generateWithFluxFlex(harmonizePrompt, bgW, bgH, {
          aspectRatio: ar, safetyTolerance: 5, guidance: 2.5, steps: 25,
          inputImage: bgPhUrl, forceFlex: true,
        });
        const harmonizedBgResp = await axios.get(harmonizedBgResult.imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
        harmonizedBgBuffer = Buffer.from(harmonizedBgResp.data);
        // Save harmonized BG for debugging — keep file
        const bgHarmonizedFilename = `bg-harmonized-${Date.now()}.jpg`;
        const bgHarmonizedPath = path.join(rendersDir, bgHarmonizedFilename);
        await fs.promises.writeFile(bgHarmonizedPath, harmonizedBgBuffer);
        debugBgHarmonizedUrl = `http://localhost:${port}/renders/${bgHarmonizedFilename}`;
        console.log(`[DEBUG-IMG] ▶ BG #2 (harmonized FLUX output): ${debugBgHarmonizedUrl}`);
        fs.promises.unlink(bgPhPath).catch(() => {}); // delete temp ph file, keep harmonized
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] [F] ✅ BG harmonized in ${harmonizedBgResult.generationTime}s — product label untouched`);
      } catch (bgHarmonizeErr: any) {
        console.warn(`[COMPOSITE-GENERATE][preserveOriginal] [F] ⚠️ BG harmonize failed (${(bgHarmonizeErr as any).message}) — using original BG`);
      }

      let rembgBuffer: Buffer;
      if (rembgImagePath.startsWith('/renders/')) {
        const localPath = path.join(rendersDir, rembgImagePath.replace('/renders/', ''));
        rembgBuffer = await fs.promises.readFile(localPath);
      } else {
        const rembgResp = await axios.get(rembgImagePath, { responseType: 'arraybuffer', timeout: 15000 });
        rembgBuffer = Buffer.from(rembgResp.data);
      }

      // ── Fix #1 (v3): Hard alpha cutoff for white product on dark background ──
      // Root cause: The white plastic bucket has many semi-transparent pixels (alpha 80-240)
      // that are near-white (R+G+B > 480). On a dark workshop background, these show as
      // a visible golden/warm rectangle — NOT a rembg artifact, but a natural consequence
      // of compositing a white product with antialiased edges onto a dark background.
      //
      // Strategy:
      //   Pass 1: near-white (R+G+B > 480) AND alpha < 120 → 0 (probably background edge)
      //   Pass 2: near-white (R+G+B > 480) AND alpha 120-240 → 255 (definitely product, boost to solid)
      //   Pass 3: any alpha < 20 → 0 (general noise)
      //
      // Result: No semi-transparent white pixels remain. Product has hard edge.
      const rembgMetaRaw = await sharp(rembgBuffer).metadata();
      if (rembgMetaRaw.channels === 4) {
        const rawBuf = await sharp(rembgBuffer).raw().toBuffer();
        let pass1Count = 0, pass2Count = 0, pass3Count = 0;
        for (let i = 0; i < rawBuf.length; i += 4) {
          const r = rawBuf[i], g = rawBuf[i+1], b = rawBuf[i+2], a = rawBuf[i+3];
          const rgb = r + g + b;
          if (rgb > 480 && a > 0 && a < 120) {
            rawBuf[i+3] = 0;     // near-white, mostly transparent → erase (background residue)
            pass1Count++;
          } else if (rgb > 480 && a >= 120 && a < 240) {
            rawBuf[i+3] = 255;   // near-white, mostly opaque → boost to solid (product body)
            pass2Count++;
          } else if (a < 20) {
            rawBuf[i+3] = 0;     // any very-low-alpha → erase (noise)
            pass3Count++;
          }
        }
        rembgBuffer = await sharp(rawBuf, {
          raw: { width: rembgMetaRaw.width!, height: rembgMetaRaw.height!, channels: 4 }
        }).png().toBuffer();
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] [FIX1] rembg alpha: ` +
          `pass1(white→0)=${pass1Count} pass2(white→255)=${pass2Count} pass3(noise→0)=${pass3Count} | ` +
          `total modified=${pass1Count+pass2Count+pass3Count}px`);
      }


      // ── TIGHT CROP: Remove transparent margins from rembg PNG ─────────────────
      // rembg leaves transparent padding around the product (top ~41px, bottom ~31px, sides ~56px).
      // Since productTop = surfaceY - finalH, the PNG BOTTOM lands on surfaceY.
      // But the product base is INSIDE the PNG (above the bottom margin) → product floats.
      // Fix: crop to exact content bounding box so PNG bottom = product base = surfaceY.
      {
        const cropMeta = await sharp(rembgBuffer).metadata();
        const cropW = cropMeta.width!;
        const cropH = cropMeta.height!;
        const cropRaw = await sharp(rembgBuffer).raw().toBuffer();

        // Find bounding box of non-transparent pixels
        let minY = cropH, maxY = 0, minX = cropW, maxX = 0;
        for (let y = 0; y < cropH; y++) {
          for (let x = 0; x < cropW; x++) {
            if (cropRaw[(y * cropW + x) * 4 + 3] > 0) {
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
            }
          }
        }

        if (maxY > minY && maxX > minX) {
          const trimTop = minY, trimBottom = cropH - 1 - maxY;
          const trimLeft = minX, trimRight = cropW - 1 - maxX;
          rembgBuffer = await sharp(rembgBuffer)
            .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
            .png().toBuffer();
          console.log(`[COMPOSITE-GENERATE][preserveOriginal] Tight-crop: removed margins top=${trimTop}px bottom=${trimBottom}px left=${trimLeft}px right=${trimRight}px → product bottom now exact`);
        }
      }

      // ── Product sizing: dynamically from sceneCtx.recommendedScalePercent ──
      // NOT a hardcoded number — Claude Vision determines the right scale.
      const productMeta = await sharp(rembgBuffer).metadata();
      const productAspect = (productMeta.width || 1) / (productMeta.height || 1);

      let productTargetH = Math.round(bgH * (sceneCtx.recommendedScalePercent / 100));

      // ── Fix #2: PHYSICAL SAFETY NET — product top must not float near ceiling ──
      // Constraint: the product's top edge must be AT LEAST 12% of bgH from the top.
      // This catches bad surfaceY detections before they produce floating products.
      const maxProductH = Math.round(surfaceY - bgH * 0.12);
      if (productTargetH > maxProductH) {
        const originalPct = sceneCtx.recommendedScalePercent;
        productTargetH = maxProductH;
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] ⚠ Scale clamped to prevent floating: ${Math.round(originalPct)}% → ${Math.round(productTargetH / bgH * 100)}% (maxH=${maxProductH}px, surfaceY=${surfaceY}px)`);
      }

      let productTargetW = Math.round(productTargetH * productAspect);
      if (productTargetW > bgW) { productTargetW = bgW; productTargetH = Math.round(productTargetW / productAspect); }
      if (productTargetH > bgH) { productTargetH = bgH; productTargetW = Math.round(productTargetH * productAspect); }

      console.log(`[COMPOSITE-GENERATE][preserveOriginal] BG: ${bgW}×${bgH} | Product: ${productTargetW}×${productTargetH} (${Math.round(productTargetH/bgH*100)}% of bgH | Claude suggested ${sceneCtx.recommendedScalePercent}%)`);

      const scaledProductBuffer = await sharp(rembgBuffer)
        .resize(productTargetW, productTargetH, { fit: 'inside', withoutEnlargement: false })
        .png()
        .toBuffer();

      // ── Brightness + Environment Integration ─────────────────────────────
      // Fix #1: The white product body was too bright vs dark moody scenes.
      // Old: dimAmount 0.88-0.98 (barely noticeable on white plastic)
      // New: darkScene → stronger dim (0.72-0.95) so white integrates with dark env
      // Additionally: an environment tint (dark ambient color) is overlaid on the product
      // so white plastic picks up the scene's darkness/atmosphere color.
      // ── LightingAnalysis resolver — use pre-computed physics values when available ──
      // la = lightingAnalysis from the product slot (v2.0 physics pipeline).
      // When la is available, all compositing parameters come from physics-derived numbers.
      // When la is null, fall back to sceneCtx heuristic values (legacy mode).
      const la: any = lightingAnalysis && !lightingAnalysis._legacyMode ? lightingAnalysis : null;

      // Helper: clamp value to range
      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

      // dimAmount: from la.colorThermal.ambientDarkness OR sceneCtx fallback
      const laDarkness = la ? la.colorThermal?.ambientDarkness ?? sceneCtx.ambientDarkness : sceneCtx.ambientDarkness;
      const dimAmount = Math.max(0.72, 0.95 - (laDarkness / 100) * 0.23);  // 0.72-0.95
      let productWithEffects = await sharp(scaledProductBuffer)
        .modulate({ brightness: dimAmount })
        .png()
        .toBuffer();
      console.log(`[COMPOSITE-GENERATE][preserveOriginal] dimAmount=${dimAmount.toFixed(3)} (darkness=${laDarkness}${la ? ' [LA-v2]' : ' [sceneCtx]'})`);

      const scaledMeta = await sharp(productWithEffects).metadata();
      const finalW = scaledMeta.width || productTargetW;
      const finalH = scaledMeta.height || productTargetH;

      // ── Positioning: from sceneCtx surface + x-offset ──────────────────────
      const centerX    = Math.round(bgW / 2) + Math.round(bgW * (sceneCtx.recommendedXOffsetPercent / 100));
      const productLeft = Math.max(0, Math.min(bgW - finalW, centerX - Math.round(finalW / 2)));
      const productTop  = Math.max(0, Math.min(surfaceY - finalH, bgH - finalH - 5));

      // Sanity check: productTop must be >= 12% of bgH (same constraint as maxProductH)
      const minProductTop = Math.round(bgH * 0.12);
      if (productTop < minProductTop) {
        console.warn(`[COMPOSITE-GENERATE][preserveOriginal] ⚠ productTop=${productTop}px < minProductTop=${minProductTop}px — surfaceY likely wrong, used safety clamp`);
      }

      console.log(`[COMPOSITE-GENERATE][preserveOriginal] Product: left=${productLeft}, top=${productTop} | base Y=${productTop + finalH}px | surfaceY=${surfaceY}px | delta=${(productTop + finalH) - surfaceY}px`);

      // Perspective-based scale: eye-level = 0.7×, slightly-above = 1.0×, bird-eye = 1.5×
      const cameraAngle = la?.placement?.cameraAngle ?? 'slightly-above';
      const cameraFOV = la?.placement?.cameraFOV ?? 'normal';
      const cameraAngleScale: Record<string, number> = { 'eye-level': 0.70, 'slightly-above': 1.00, 'low-angle': 0.55, 'bird-eye': 1.50 };
      const cameraFOVScale: Record<string, number> = { 'wide': 1.20, 'normal': 1.00, 'telephoto': 0.80 };
      const perspScale = (cameraAngleScale[cameraAngle] ?? 1.0) * (cameraFOVScale[cameraFOV] ?? 1.0);

      // ── Cast shadow: elongated directional shadow from product ──────────────
      // PHYSICS: A cast shadow from a directional light (e.g. spotlight on right) extends
      // BEHIND the product AND to the opposite side (left if light is right).
      // The shadow is ELONGATED — its length-to-width ratio is typically 1:3 to 1:5.
      // The shadow gradient: darkest near product base, transparent at far end.
      // Key rule: shadowH (depth into scene) must be >> shadowH was (which was only 4%).
      const hasDropShadow = la?.shadow?.hasDropShadow !== false;
      const shadowScaleByDepth = { 'close': 0.75, 'mid': 0.68, 'far': 0.58 }[sceneCtx.surfaceDepthHint] ?? 0.72;
      const shadowWidthMult = la?.shadow?.dropWidthMultiplier ?? shadowScaleByDepth;
      const shadowW = Math.round(finalW * Math.min(1.1, shadowWidthMult));
      // Shadow LENGTH (depth into scene): based on physics L = H / tan(theta)
      // theta = 90 (overhead) -> L=0
      // theta = 45 -> L=H
      // theta = 30 -> L=1.73H
      // We map lightSourceYPercent (0=top, 50=eye-level) to theta (90..10)
      const lightTheta = la?.lightSource?.directionAngle ?? (90 - Math.min(80, (sceneCtx.lightSourceYPercent ?? 15) * 1.5));
      const rad = (lightTheta * Math.PI) / 180;
      const lOverH = Math.abs(Math.tan(rad)) > 0.05 ? 1 / Math.tan(rad) : 0;
      
      // Perspective adjustment: shadows receding into distance appear shorter on 2D canvas
      // unless it's a bird-eye view.
      const groundPerspectiveFactor = cameraAngle === 'bird-eye' ? 1.0 : 0.65;
      
      const rawDropLengthPx = la?.shadow?.dropLengthPx;
      const shadowH = rawDropLengthPx
        ? Math.round(rawDropLengthPx * (finalH / 1000) * perspScale)
        : Math.round(finalH * lOverH * groundPerspectiveFactor * perspScale);
      // Lateral shift: proportional to how far off-center the light is.
      // Light at 65% right → lightOffsetPct=0.30 → xShift = -finalW * 0.35 * 0.30 = -10.5% of width
      // Cap at 35% of product width (was 15%)
      const lightOffsetPct = (sceneCtx.lightSourceXPercent - 50) / 50;   // -1..+1
      const shadowXShift = la?.shadow?.dropOffsetX !== undefined
        ? Math.round(Math.max(-finalW * 0.35, Math.min(finalW * 0.35, la.shadow.dropOffsetX)))
        : Math.round(finalW * 0.35 * (-lightOffsetPct));  // shadow goes opposite to light
      const shadowYShift = la?.shadow?.dropOffsetY !== undefined
        ? Math.round(Math.max(-finalH * 0.15, Math.min(finalH * 0.15, la.shadow.dropOffsetY)))
        : 0; // Physics fix: shadow must start AT the base. Default shift 0 (was 5% finalH).
      // Position: shadow starts at the product base and extends backward
      const shadowLeft = productLeft + Math.round((finalW - shadowW) / 2) + shadowXShift;
      const shadowTop = Math.min(bgH - shadowH - 1, surfaceY - Math.round(shadowH * 0.15) + shadowYShift);
      // shadowPad: limit to 120px max — shadowH*1.5 was creating 400px pads that exploded canvas sizes
      const shadowPad = Math.round(Math.min(120, Math.max(60, shadowH * 0.4)));
      const shadowCanW = shadowW + shadowPad * 2;
      const shadowCanH = shadowH + shadowPad * 2;
      // Opacity: strong enough to be visible.
      // Old formula gave 0.22 which made shadows nearly invisible.
      // New: base 0.38 + darkness-scaled addition, capped at 0.65.
      const shadowOpacity = hasDropShadow
        ? Math.min(0.65, la?.shadow?.dropOpacity ?? Math.max(0.30, 0.38 + (laDarkness / 100) * 0.25))
        : 0;
      // Blur: FIXED range 22-42px — old formula (shadowH*0.8 = 213px) made shadows invisible.
      // Penumbra should be a fixed photographic soft-shadow, not scaled by shadow length.
      const penumbraBlurOverride: Record<string,number> = { 'none': 6, 'narrow': 14, 'medium': 24, 'wide': 38 };
      const penumbraBlur = la?.shadow?.penumbraWidth ? penumbraBlurOverride[la.shadow.penumbraWidth] : undefined;
      const shadowBlurPx = Math.min(42, Math.max(22, la?.shadow?.dropBlurPx ?? penumbraBlur ?? 28));
      // GRADIENT shadow: cx=50%, cy=10% — gradient center at top of shadow ellipse
      // (= near product base). Shadow fades toward the far end (cy=100%).
      // This creates the elongated teardrop look of a real cast shadow.
      const cxPct = 50;
      const cyPct = Math.round(shadowPad / shadowCanH * 100) + 5;  // near product base
      const shadowEllipseSvg = Buffer.from(
        `<svg width="${shadowCanW}" height="${shadowCanH}" xmlns="http://www.w3.org/2000/svg">` +
        `<defs><radialGradient id="sg" cx="${cxPct}%" cy="${cyPct}%" r="60%" gradientUnits="objectBoundingBox">` +
        `<stop offset="0%"   stop-color="black" stop-opacity="${shadowOpacity.toFixed(2)}"/>` +
        `<stop offset="45%"  stop-color="black" stop-opacity="${(shadowOpacity * 0.40).toFixed(2)}"/>` +
        `<stop offset="100%" stop-color="black" stop-opacity="0"/>` +
        `</radialGradient></defs>` +
        `<ellipse cx="${Math.round(shadowCanW/2)}" cy="${Math.round(shadowCanH/2)}" rx="${Math.round(shadowW/2)}" ry="${Math.round(shadowH/2)}" fill="url(#sg)"/>` +
        `</svg>`
      );
      const shadowBufferFull = await sharp({
        create: { width: shadowCanW, height: shadowCanH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
      })
        .composite([{ input: await sharp(shadowEllipseSvg).png().toBuffer(), blend: 'over' }])
        .blur(shadowBlurPx)
        .png()
        .toBuffer();
      console.log(`[COMPOSITE-GENERATE][preserveOriginal] Cast shadow: opacity=${shadowOpacity.toFixed(2)} hasDropShadow=${hasDropShadow} xShift=${shadowXShift}px yShift=${shadowYShift}px blurPx=${shadowBlurPx} shadowH=${shadowH}px shadowW=${shadowW}px lightX=${sceneCtx.lightSourceXPercent}%`);
      // ── CRITICAL: Shadow buffer may be larger than bg or have negative offsets. ──
      // Sharp throws 'Image to composite must have same dimensions or smaller' if the
      // overlay extends outside the base. We must extract only the visible intersection.
      let shadowLeftAdj = shadowLeft - shadowPad;
      let shadowTopAdj  = shadowTop  - shadowPad;
      // Crop region inside the full shadow canvas that overlaps with bg
      const cropLeft   = Math.max(0, -shadowLeftAdj);
      const cropTop    = Math.max(0, -shadowTopAdj);
      const cropRight  = Math.min(shadowCanW, bgW - shadowLeftAdj);
      const cropBottom = Math.min(shadowCanH, bgH - shadowTopAdj);
      const cropW = Math.max(1, cropRight - cropLeft);
      const cropH = Math.max(1, cropBottom - cropTop);
      // Extract the visible portion only
      const shadowBuffer = (cropLeft > 0 || cropTop > 0 || cropW < shadowCanW || cropH < shadowCanH)
        ? await sharp(shadowBufferFull).extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH }).png().toBuffer()
        : shadowBufferFull;
      // Adjust placement to match the crop
      shadowLeftAdj = Math.max(0, shadowLeftAdj + cropLeft);
      shadowTopAdj  = Math.max(0, shadowTopAdj  + cropTop);

      // ── Fix #3: Apply rim darkening + warm tint DIRECTLY onto product PNG ──
      // Reason: multiply/soft-light blend on a full-size overlay buffer (finalW×finalH)
      // creates a visible rectangle artifact because sharp's premultiplied alpha treats
      // transparent (alpha=0) pixels as black (0,0,0,0) → multiply darkens non-product area.
      // Solution: apply these effects ONTO the RGBA product buffer before compositing.
      // On RGBA PNG, multiply preserves alpha: transparent pixels stay transparent.

      // Warm tint: use la.colorThermal.ambientTintRgb if available, else sceneCtx K-based
      let warmOpacity: number, warmG: number, warmB: number;
      if (la?.colorThermal?.ambientTintRgb) {
        // Direct RGB from LightingAnalysis (physics-derived, exact Kelvin match)
        const [tR, tG, tB] = la.colorThermal.ambientTintRgb;
        let baseWarmOpacity = clamp(la.colorThermal.ambientTintOpacity ?? 0.12, 0, 0.28);
        // BG scene is warm (dark/workshop) → boost tint to at least 0.12 to visually match
        // The original studio photo's ambient tint (0.06) is too weak for warm BG scenes
        // Use PRE-OVERRIDE darkness from SCENE-ANALYZE (laDarkness), NOT overridden value
        if (laDarkness > 35) {
          // Warm/dark scene: ensure minimum warm tint for product integration
          baseWarmOpacity = Math.max(0.12, baseWarmOpacity);
        }
        warmOpacity = baseWarmOpacity;
        warmG = Math.round(clamp(tG, 80, 255));
        warmB = Math.round(clamp(tB, 20, 255));
        // BONUS: if lightSource.colorCastRgb is available, blend it into the warm tint
        // colorCastRgb = [R_shift, G_shift, B_shift] relative to neutral (e.g. +22,+8,-18 for 3200K)
        const castRgb = la.lightSource?.colorCastRgb;
        if (Array.isArray(castRgb) && castRgb.length === 3) {
          // Apply shift: the shift tells us how far from neutral the light is
          // Blend 30% of the cast shift into the warm tint RGB
          warmG = Math.round(clamp(warmG + castRgb[1] * 0.3, 80, 255));
          warmB = Math.round(clamp(warmB + castRgb[2] * 0.3, 20, 255));
        }
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] [LA-v2] Warm tint from LightingAnalysis: rgb(255,${warmG},${warmB}) opacity=${warmOpacity.toFixed(3)} colorCast=${la.lightSource?.colorCastRgb} bgDarkness=${laDarkness}`);
      } else {
        // Legacy heuristic
        const warmIntensity = Math.max(0, (5000 - sceneCtx.lightTemperatureK) / 2300);
        warmOpacity = warmIntensity * 0.28;
        warmG = Math.round(130 + (sceneCtx.lightTemperatureK - 2700) * 0.02);
        warmB = Math.round(25  + (sceneCtx.lightTemperatureK - 2700) * 0.018);
      }
      const warmCoverage = Math.round(finalH * 0.45);

      // Environment integration tint: ambient color cast from the scene onto the product.
      // PHYSICS FIX: Use la.colorThermal.ambientTintRgb + ambientTintOpacity directly from
      // LightingAnalysis if available. Claude derives these from the actual product photo,
      // so they are more accurate than our formula. The old approach (darkness > 40 gate)
      // was wrong because ambient color bleeding occurs even in bright scenes (e.g. warm
      // wooden table reflecting onto white plastic base).
      // Fallback: if no LA, use darkness-derived formula (kept as before for non-LA mode).
      let envTintOpacity: number;
      let envR: number, envG: number, envB: number;
      const laTintRgb = la?.colorThermal?.ambientTintRgb;  // [R, G, B] or undefined
      const laTintOpacity = la?.colorThermal?.ambientTintOpacity;  // 0-0.25 or undefined
      if (laTintRgb && Array.isArray(laTintRgb) && laTintOpacity !== undefined && laTintOpacity > 0.005) {
        // LA-provided: Claude's physics-derived ambient tint (always active regardless of darkness)
        envR = Math.round(Math.max(0, Math.min(255, laTintRgb[0])));
        envG = Math.round(Math.max(0, Math.min(255, laTintRgb[1])));
        envB = Math.round(Math.max(0, Math.min(255, laTintRgb[2])));
        envTintOpacity = Math.min(0.22, laTintOpacity);  // cap at 0.22 to avoid overdoing it
      } else {
        // Fallback: darkness-derived formula for non-LA mode
        const envTintK = sceneCtx.lightTemperatureK;
        envR = Math.round(20 + (envTintK - 2700) * 0.005);   // ~20-30
        envG = Math.round(25 + (envTintK - 2700) * 0.008);   // ~25-40
        envB = Math.round(40 + (envTintK - 2700) * 0.015);   // ~40-70
        envTintOpacity = Math.max(0, (laDarkness - 40) / 100) * 0.22;  // 0-0.22, only for dark scenes
      }
      if (envTintOpacity > 0.005) {
        const envTintSvg = Buffer.from(
          `<svg width="${finalW}" height="${finalH}" xmlns="http://www.w3.org/2000/svg">` +
          `<rect width="${finalW}" height="${finalH}" fill="rgb(${envR},${envG},${envB})" opacity="${envTintOpacity.toFixed(3)}"/>` +
          `</svg>`
        );
        const envTintBuf = await svgToTransparentPng(envTintSvg, finalW, finalH);
        productWithEffects = await sharp(productWithEffects)
          .composite([{ input: envTintBuf, left: 0, top: 0, blend: 'multiply' }])
          .png().toBuffer();
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] envTint applied: opacity=${envTintOpacity.toFixed(3)} rgb(${envR},${envG},${envB}) ${laTintRgb ? '[LA-direct]' : '[fallback]'}`);
      }

      if (warmOpacity > 0.01) {
        const warmTintSvg = Buffer.from(
          `<svg width="${finalW}" height="${warmCoverage}" xmlns="http://www.w3.org/2000/svg">` +
          `<defs><linearGradient id="wt" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="0%"   stop-color="rgb(255,${warmG},${warmB})" stop-opacity="${warmOpacity.toFixed(3)}"/>` +
          `<stop offset="50%"  stop-color="rgb(255,${warmG},${warmB})" stop-opacity="${(warmOpacity*0.45).toFixed(3)}"/>` +
          `<stop offset="100%" stop-color="rgb(255,${warmG},${warmB})" stop-opacity="0"/>` +
          `</linearGradient></defs>` +
          `<rect width="${finalW}" height="${warmCoverage}" fill="url(#wt)"/>` +
          `</svg>`
        );
        // Composite warm tint at (0, 0) of the product PNG — transparent product pixels untouched
        const warmBuf = await svgToTransparentPng(warmTintSvg, finalW, warmCoverage);
        productWithEffects = await sharp(productWithEffects)
          .composite([{ input: warmBuf, left: 0, top: 0, blend: 'soft-light' }])
          .png().toBuffer();
      }

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

      // ── NEW: Fresnel edge highlight (la.material.fresnelEdgeGlow) ────────────
      // Physics: dielectric materials (IOR > 1) have brighter edges at grazing angles.
      // White PP plastic (IOR~1.49): edges 15-25% brighter than center face.
      // Applied as a soft white screen-blend on the left and right edges.
      if (la?.material?.fresnelEdgeGlow === true) {
        const fresnelScale: Record<string,number> = { 'subtle': 0.12, 'medium': 0.22, 'strong': 0.38 };
        const fresnelOpacity = fresnelScale[la.material.fresnelIntensity ?? 'subtle'] ?? 0.12;
        const fresnelW = Math.round(finalW * 0.12);  // 12% of product width per edge
        const fresnelSvg = Buffer.from(
          `<svg width="${finalW}" height="${finalH}" xmlns="http://www.w3.org/2000/svg">` +
          `<defs>` +
          `<linearGradient id="fl" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="white" stop-opacity="${fresnelOpacity.toFixed(2)}"/><stop offset="${(fresnelW/finalW*100).toFixed(1)}%" stop-color="white" stop-opacity="0"/></linearGradient>` +
          `<linearGradient id="fr" x1="1" y1="0" x2="0" y2="0"><stop offset="0%" stop-color="white" stop-opacity="${fresnelOpacity.toFixed(2)}"/><stop offset="${(fresnelW/finalW*100).toFixed(1)}%" stop-color="white" stop-opacity="0"/></linearGradient>` +
          `</defs>` +
          `<rect width="${finalW}" height="${finalH}" fill="url(#fl)"/>` +
          `<rect width="${finalW}" height="${finalH}" fill="url(#fr)"/>` +
          `</svg>`
        );
        const fresnelBuf = await svgToTransparentPng(fresnelSvg, finalW, finalH);
        productWithEffects = await sharp(productWithEffects)
          .composite([{ input: fresnelBuf, left: 0, top: 0, blend: 'screen' }])
          .png().toBuffer();
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] [LA] Fresnel edge: opacity=${fresnelOpacity.toFixed(2)} intensity=${la.material.fresnelIntensity}`);
      }

      // ── NEW: Color bleeding (la.colorThermal.hasColorBleeding) ───────────────
      // Physics: strongly colored nearby surfaces reflect their color onto adjacent white objects.
      // Applied as a subtle tinted gradient on the side facing the bleeding source.
      if (la?.colorThermal?.hasColorBleeding && la.colorThermal.bleedingSourceColor && la.colorThermal.bleedingOpacity > 0.005) {
        const [bR, bG, bB] = la.colorThermal.bleedingSourceColor;
        const bleedOp = Math.min(0.15, la.colorThermal.bleedingOpacity);
        // Apply bleeding as a subtle tint across the whole product (the source direction
        // is usually lateral — we use a simple uniform tint for now)
        const bleedSvg = Buffer.from(
          `<svg width="${finalW}" height="${finalH}" xmlns="http://www.w3.org/2000/svg">` +
          `<rect width="${finalW}" height="${finalH}" fill="rgb(${Math.round(bR)},${Math.round(bG)},${Math.round(bB)})" opacity="${bleedOp.toFixed(3)}"/>` +
          `</svg>`
        );
        const bleedBuf = await svgToTransparentPng(bleedSvg, finalW, finalH);
        productWithEffects = await sharp(productWithEffects)
          .composite([{ input: bleedBuf, left: 0, top: 0, blend: 'multiply' }])
          .png().toBuffer();
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] [LA] Color bleed: rgb(${Math.round(bR)},${Math.round(bG)},${Math.round(bB)}) opacity=${bleedOp.toFixed(3)}`);
      }

      // ── NEW: SSS edge glow (la.material.hasSSS + sssStrength) ────────────────
      // Physics: sub-surface scattering creates a warm edge glow when backlit.
      // Only visible when light comes from behind (backlit scenario) or at high directionAngle.
      if (la?.material?.hasSSS && la.material.sssStrength !== 'none') {
        const theta = la.lightSource?.directionAngle ?? 70;
        const isBacklit = (la.lightSource?.type === 'backlit') || (la.lightSource?.directionLabel === 'back');
        const isHighAngle = theta >= 70;  // overhead light also causes SSS on rim
        if (isBacklit || isHighAngle) {
          const sssScale: Record<string,number> = { 'weak': 0.08, 'medium': 0.18, 'strong': 0.30 };
          const sssOp = sssScale[la.material.sssStrength ?? 'weak'] ?? 0.08;
          const sssColor = la.material.sssColorShift === 'warm' ? [255, 210, 150] : [255, 255, 255];
          const sssW = Math.round(finalW * 0.15);
          const sssSvg = Buffer.from(
            `<svg width="${finalW}" height="${finalH}" xmlns="http://www.w3.org/2000/svg">` +
            `<defs>` +
            `<linearGradient id="sl" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="rgb(${sssColor[0]},${sssColor[1]},${sssColor[2]})" stop-opacity="${sssOp.toFixed(2)}"/><stop offset="${(sssW/finalW*100).toFixed(1)}%" stop-color="rgb(${sssColor[0]},${sssColor[1]},${sssColor[2]})" stop-opacity="0"/></linearGradient>` +
            `<linearGradient id="sr" x1="1" y1="0" x2="0" y2="0"><stop offset="0%" stop-color="rgb(${sssColor[0]},${sssColor[1]},${sssColor[2]})" stop-opacity="${sssOp.toFixed(2)}"/><stop offset="${(sssW/finalW*100).toFixed(1)}%" stop-color="rgb(${sssColor[0]},${sssColor[1]},${sssColor[2]})" stop-opacity="0"/></linearGradient>` +
            `</defs>` +
            `<rect width="${finalW}" height="${finalH}" fill="url(#sl)"/>` +
            `<rect width="${finalW}" height="${finalH}" fill="url(#sr)"/>` +
            `</svg>`
          );
          const sssBuf = await svgToTransparentPng(sssSvg, finalW, finalH);
          productWithEffects = await sharp(productWithEffects)
            .composite([{ input: sssBuf, left: 0, top: 0, blend: 'screen' }])
            .png().toBuffer();
          console.log(`[COMPOSITE-GENERATE][preserveOriginal] [LA] SSS edge glow: strength=${la.material.sssStrength} colorShift=${la.material.sssColorShift} opacity=${sssOp.toFixed(2)}`);
        }
      }

      // ── NEW: Rim light effect (la.compositing.rimLight) ──────────────────────
      // Physics: in three-point setups, a back-right or back-left light creates
      // a bright edge highlight on the opposite side — adds depth and separation.
      // This is different from rimDarkening: rimLight BRIGHTENS the edge.
      const rimLightCfg = la?.compositing?.rimLight;
      if (rimLightCfg && rimLightCfg.side !== 'none' && (rimLightCfg.opacity ?? 0) > 0.02) {
        const rlOp = clamp(rimLightCfg.opacity, 0, 0.50);
        const rlW = Math.round(finalW * (rimLightCfg.widthMultiplier ?? 0.15));
        // Build a gradient on the correct side
        const isLeft  = rimLightCfg.side === 'left';
        const isRight = rimLightCfg.side === 'right';
        const isTop   = rimLightCfg.side === 'top';
        const rlSvgParts: string[] = [`<svg width="${finalW}" height="${finalH}" xmlns="http://www.w3.org/2000/svg"><defs>`];
        if (isLeft || !isRight && !isTop) {
          rlSvgParts.push(`<linearGradient id="rll" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="white" stop-opacity="${rlOp.toFixed(2)}"/><stop offset="${(rlW/finalW*100).toFixed(1)}%" stop-color="white" stop-opacity="0"/></linearGradient>`);
        }
        if (isRight || !isLeft && !isTop) {
          rlSvgParts.push(`<linearGradient id="rlr" x1="1" y1="0" x2="0" y2="0"><stop offset="0%" stop-color="white" stop-opacity="${rlOp.toFixed(2)}"/><stop offset="${(rlW/finalW*100).toFixed(1)}%" stop-color="white" stop-opacity="0"/></linearGradient>`);
        }
        if (isTop) {
          rlSvgParts.push(`<linearGradient id="rlt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="white" stop-opacity="${rlOp.toFixed(2)}"/><stop offset="${(rlW/finalW*100).toFixed(1)}%" stop-color="white" stop-opacity="0"/></linearGradient>`);
        }
        rlSvgParts.push(`</defs>`);
        if (isLeft  || !isRight && !isTop) rlSvgParts.push(`<rect width="${finalW}" height="${finalH}" fill="url(#rll)"/>`);
        if (isRight || !isLeft && !isTop)  rlSvgParts.push(`<rect width="${finalW}" height="${finalH}" fill="url(#rlr)"/>`);
        if (isTop)                          rlSvgParts.push(`<rect width="${finalW}" height="${finalH}" fill="url(#rlt)"/>`);
        rlSvgParts.push(`</svg>`);
        const rlBuf = await svgToTransparentPng(Buffer.from(rlSvgParts.join('')), finalW, finalH);
        productWithEffects = await sharp(productWithEffects)
          .composite([{ input: rlBuf, left: 0, top: 0, blend: 'screen' }])
          .png().toBuffer();
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] [LA] Rim light: side=${rimLightCfg.side} opacity=${rlOp.toFixed(2)} widthMult=${rimLightCfg.widthMultiplier}`);
      }

      if (rimOpacity > 0.02) {
        const rimW = Math.round(finalW * (la?.compositing?.rimDarkening?.widthMultiplier ?? 0.20));
        const rimSvg = Buffer.from(
          `<svg width="${finalW}" height="${finalH}" xmlns="http://www.w3.org/2000/svg">` +
          `<defs>` +
          `<linearGradient id="rl" x1="0" y1="0" x2="1" y2="0">` +
          `<stop offset="0%"             stop-color="black" stop-opacity="${rimOpacity.toFixed(3)}"/>` +
          `<stop offset="${(rimW/finalW*100).toFixed(1)}%" stop-color="black" stop-opacity="0"/>` +
          `</linearGradient>` +
          `<linearGradient id="rr" x1="1" y1="0" x2="0" y2="0">` +
          `<stop offset="0%"             stop-color="black" stop-opacity="${rimOpacity.toFixed(3)}"/>` +
          `<stop offset="${(rimW/finalW*100).toFixed(1)}%" stop-color="black" stop-opacity="0"/>` +
          `</linearGradient>` +
          `</defs>` +
          `<rect width="${finalW}" height="${finalH}" fill="url(#rl)"/>` +
          `<rect width="${finalW}" height="${finalH}" fill="url(#rr)"/>` +
          `</svg>`
        );
        const rimBuf = await svgToTransparentPng(rimSvg, finalW, finalH);
        productWithEffects = await sharp(productWithEffects)
          .composite([{ input: rimBuf, left: 0, top: 0, blend: 'multiply' }])
          .png().toBuffer();
      }

      // ── CRITICAL: Re-apply original alpha mask after blend effects ────────────
      // soft-light and multiply blend modes in sharp (libvips) operate on premultiplied
      // alpha, which causes visible color bleed in transparent (alpha=0) regions of the
      // product PNG — creating the golden rectangle artifact.
      // Fix: extract the original alpha from the scaled product (before effects) and re-stamp.
      if (scaledMeta.channels === 4) {
        const origAlpha = await sharp(scaledProductBuffer).extractChannel('alpha').raw().toBuffer();
        const effRaw = await sharp(productWithEffects).raw().toBuffer();
        const effMeta = await sharp(productWithEffects).metadata();
        for (let i = 0; i < origAlpha.length; i++) {
          effRaw[i * 4 + 3] = origAlpha[i];  // restore original alpha from pre-effect product
        }
        productWithEffects = await sharp(effRaw, {
          raw: { width: effMeta.width!, height: effMeta.height!, channels: 4 }
        }).png().toBuffer();
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] Alpha mask re-applied after effects (rectangle fix)`);
      }

      console.log(`[COMPOSITE-GENERATE][preserveOriginal] Product effects baked in: warmOpacity=${warmOpacity.toFixed(3)} rimOpacity=${rimOpacity.toFixed(3)}`);

      // ── Base composite: FLUX-harmonized BG + shadow + product ─────────────
      // Use harmonizedBgBuffer: FLUX already added natural shadows/AO to the BG.
      // The product (with its intact label) is composited on top.
      // CRITICAL: Clamp all layer placements to BG bounds before compositing.
      // Sharp throws if any overlay extends outside the base image.
      const safeProductLeft = Math.max(0, Math.min(bgW - 1, productLeft));
      const safeProductTop  = Math.max(0, Math.min(bgH - 1, productTop));
      const baseComposite = await sharp(harmonizedBgBuffer)
        .composite([
          { input: shadowBuffer,        left: shadowLeftAdj, top: shadowTopAdj, blend: 'multiply' },
          { input: productWithEffects,  left: safeProductLeft, top: safeProductTop, blend: 'over' }
        ])
        .png()
        .toBuffer();

      // ── Post-effect #1: Contact shadow (ambient occlusion at base) ─────────
      // Uses a SINGLE soft radial gradient — no hard core ellipse.
      // RULE: Contact shadow visibility is determined by the product of opacity × blurPx.
      //       A small blur radius creates a hard-edged, visible disc → needs lower opacity.
      //       A large blur radius creates a soft, natural-looking shadow → can have higher opacity.
      //       Rule: opacity is scaled so that (rawOpacity × blurPx) stays within a perceptual range.
      //       Perceptual threshold T=6: if rawOpacity × blurPx < T → opacity is fine.
      //                                 if rawOpacity × blurPx ≥ T → scale opacity down to T/blurPx.
      //       This means: blur=8px at opacity=0.88 → 0.88×8=7.04 → clamp to 6/8=0.75 (visible)
      //                   blur=20px at opacity=0.88 → 0.88×20=17.6 → clamp to 6/20=0.30 (soft)
      //                   blur=3px at opacity=0.88 → 0.88×3=2.64 → fine as-is (T not exceeded)
      //       Additionally: absolute cap at 0.65 to prevent unrealistically dark shadows.
      // placement.cameraAngle → affects contactH (telephoto = less perspective = flatter oval)
      // placement.cameraFOV  → same: 'wide' = more perspective = taller oval
      const perspDistortion = la?.placement?.perspectiveDistortion ?? 'slight';
      const contactW = Math.round(finalW * (la?.shadow?.contactShadow?.widthMultiplier ?? 0.68));
      const contactH = Math.round(Math.max(10, finalH * (la?.shadow?.contactShadow?.heightMultiplier ?? 0.025) * perspScale));
      console.log(`[COMPOSITE-GENERATE][preserveOriginal] [LA] Placement: cameraAngle=${cameraAngle} FOV=${cameraFOV} perspDistortion=${perspDistortion} → perspScale=${perspScale.toFixed(2)} contactH=${contactH}px`);
      const rawContactOpacity = la?.shadow?.contactShadow?.opacity ?? 0.45;
      // RULE: blur floor at 8px — LA JSON may give very small values (e.g. 3px)
      //       which create a visually hard disc regardless of opacity. 8px is the minimum
      //       for a gradient that blends into the surface.
      const contactBlurPx = Math.max(8, la?.shadow?.contactShadow?.blurPx ?? Math.max(8, Math.round(contactH * 0.6)));
      // Apply perceptual opacity×blur rule
      const PERCEPTUAL_THRESHOLD = 6;
      const contactOpacity = Math.min(0.65, rawContactOpacity * contactBlurPx < PERCEPTUAL_THRESHOLD
        ? rawContactOpacity
        : PERCEPTUAL_THRESHOLD / contactBlurPx);
      const contactLeft = productLeft + Math.round((finalW - contactW) / 2) + shadowXShift;
      const contactTop  = Math.max(0, surfaceY - Math.round(contactH * 0.65));

      // Single smooth radial gradient contact shadow — no hard edges
      const contactCoreSvg = Buffer.from(
        `<svg width="${contactW}" height="${contactH}" xmlns="http://www.w3.org/2000/svg">` +
        `<defs><radialGradient id="cg" cx="50%" cy="50%" r="50%">` +
        `<stop offset="0%"   stop-color="black" stop-opacity="${contactOpacity.toFixed(2)}"/>` +
        `<stop offset="50%"  stop-color="black" stop-opacity="${(contactOpacity * 0.55).toFixed(2)}"/>` +
        `<stop offset="100%" stop-color="black" stop-opacity="0"/>` +
        `</radialGradient></defs>` +
        `<ellipse cx="${Math.round(contactW/2)}" cy="${Math.round(contactH/2)}" rx="${Math.round(contactW/2)}" ry="${Math.round(contactH/2)}" fill="url(#cg)"/>` +
        `</svg>`
      );
      // ── CRITICAL: Contact shadow may extend outside bg bounds. Extract visible intersection. ──
      const contactShadowFull = await sharp({
        create: { width: contactW, height: contactH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
      })
        .composite([{ input: await sharp(contactCoreSvg).png().toBuffer(), blend: 'over' }])
        .blur(contactBlurPx)
        .png().toBuffer();
      let contactLeftAdj = contactLeft;
      let contactTopAdj  = contactTop;
      const ccCropLeft   = Math.max(0, -contactLeftAdj);
      const ccCropTop    = Math.max(0, -contactTopAdj);
      const ccCropRight  = Math.min(contactW, bgW - contactLeftAdj);
      const ccCropBottom = Math.min(contactH, bgH - contactTopAdj);
      const ccCropW = Math.max(1, ccCropRight - ccCropLeft);
      const ccCropH = Math.max(1, ccCropBottom - ccCropTop);
      const contactShadowBuffer = (ccCropLeft > 0 || ccCropTop > 0 || ccCropW < contactW || ccCropH < contactH)
        ? await sharp(contactShadowFull).extract({ left: ccCropLeft, top: ccCropTop, width: ccCropW, height: ccCropH }).png().toBuffer()
        : contactShadowFull;
      contactLeftAdj = Math.max(0, contactLeftAdj + ccCropLeft);
      contactTopAdj  = Math.max(0, contactTopAdj  + ccCropTop);

      // Halo: wider, softer outer AO spread
      // RULE: AO halos are physically present only in scenes with diffuse ambient occlusion.
      //       In hard-spotlight or bright scenes (low darkness), there is no diffuse AO —
      //       the shadow is a directional drop shadow, not a radial halo.
      //       PHYSICS FIX: AO halo (ambient occlusion) is a CONTACT phenomenon — it derives
      //       from the geometry of the object touching the surface (Global Illumination),
      //       NOT from how dark the scene is. It is always present regardless of darkness.
      //       The old gate (laDarkness > 25) was wrong: it disabled AO in bright scenes
      //       (e.g. workshop darkness=12), causing the "floating bucket" visual artifact.
      //       Fix: AO is always enabled. Opacity is Claude-derived (la.shadow.aoHalo.opacity).
      //       A small minimum (0.15) ensures ground contact is always visually present.
      const haloW = Math.round(finalW * (la?.shadow?.aoHalo?.widthMultiplier ?? 0.92));
      // perspScale also flattens/rounds the AO halo oval based on camera elevation
      const haloH = Math.round(Math.max(8, finalH * (la?.shadow?.aoHalo?.heightMultiplier ?? 0.030) * perspScale));
      // PHYSICS: AO halo is a diffuse-ambient phenomenon. The LA JSON derives the correct opacity.
      // If LA says opacity=0.05 or lower, there is no meaningful AO → skip entirely.
      // Removed Math.max(0.15) floor: in bright/diffuse outdoor scenes (beach, overcast)
      // the AO is negligible and forcing 0.15 creates a visible dark ring that doesn't exist.
      const haloBaseOpacity = la?.shadow?.aoHalo?.opacity ?? 0.30;
      // Scale by darkness: in brighter scenes (low darkness) → less AO presence
      const haloOpacityScale = Math.max(0.4, Math.min(1.0, 0.4 + laDarkness / 100));  // 0.4-1.0
      const haloOpacity = haloBaseOpacity * haloOpacityScale;
      // AO halo DISABLED: user explicitly does not want the oval halo ring under the product.
      // It looks unnatural and is NOT needed — the contact shadow already grounds the product.
      const renderHalo = false;
      const haloBlurPx  = la?.shadow?.aoHalo?.blurPx   ?? Math.max(4, Math.round(haloH * 0.5));
      let haloBuffer: Buffer | null = null;
      if (renderHalo) {
        const haloLeft = productLeft + Math.round((finalW - haloW) / 2) + shadowXShift;
        const haloTop  = Math.max(0, surfaceY - Math.round(haloH * 0.5));
        const haloSvg = Buffer.from(
          `<svg width="${haloW}" height="${haloH}" xmlns="http://www.w3.org/2000/svg">` +
          `<defs><radialGradient id="hg" cx="50%" cy="50%" r="50%">` +
          `<stop offset="0%"   stop-color="black" stop-opacity="${haloOpacity.toFixed(2)}"/>` +
          `<stop offset="65%"  stop-color="black" stop-opacity="${(haloOpacity * 0.25).toFixed(2)}"/>` +
          `<stop offset="100%" stop-color="black" stop-opacity="0"/>` +
          `</radialGradient></defs>` +
          `<ellipse cx="${Math.round(haloW/2)}" cy="${Math.round(haloH/2)}" rx="${Math.round(haloW/2)}" ry="${Math.round(haloH/2)}" fill="url(#hg)"/>` +
          `</svg>`
        );
        const rawHaloBuf = await sharp({
          create: { width: haloW, height: haloH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
        })
          .composite([{ input: await sharp(haloSvg).png().toBuffer(), blend: 'over' }])
          .blur(haloBlurPx)
          .png().toBuffer();
        haloBuffer = rawHaloBuf;
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] Contact shadow: w=${contactW} h=${contactH} opacity=${contactOpacity.toFixed(2)} blur=${contactBlurPx}px | Halo: DISABLED`);
      } else {
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] Contact shadow: w=${contactW} h=${contactH} opacity=${contactOpacity.toFixed(2)} blur=${contactBlurPx}px | Halo: DISABLED`);
      }

      // ── Post-effect #2: Specular highlight on lid — SMALL TIGHT BUFFER ─────
      // Fix #2: Specular is now STRICTLY bounded to the TOP 18% of the product.
      // The halo/sáv on the right edge was caused by the specular SVG buffer being
      // positioned near the edge and the radial gradient bleeding sideways.
      // Solution: specBufH capped at top-lid area only, never extends down the sides.
      // Specular: use la.material.specular values when available (physics-derived zone)
      let specOpacity: number, specZonePct: number, specWidthMult: number, specBlurFromRoughness: number;
      // HARD CAP: specZonePct max 8% — prevents specular from overlapping product handle/fül area.
      // PHYSICS: The specular highlight on a cylindrical lid is a narrow crescent on the rim edge,
      // NOT a full disc covering the top. 8% = top rim only (approx. 2cm of a 25cm lid diameter).
      // Going above 8% (e.g. 12%) causes the white SVG ellipse to overlap the white handle,
      // creating a "floating white disc" artifact via screen blend.
      const SPEC_ZONE_MAX_PCT = 0.08;  // HARD CAP — never exceed 8% of product height
      if (la?.material?.specular) {
        specOpacity    = clamp(la.material.specular.opacity ?? 0.40, 0.10, 0.55);  // cap at 0.55 (was 0.65)
        specZonePct    = Math.min(SPEC_ZONE_MAX_PCT, clamp(la.material.specular.zoneTopPct ?? 8, 4, 8) / 100);
        specWidthMult  = clamp(la.material.specular.widthMultiplier ?? 0.50, 0.25, 0.65);  // slightly narrower
        // Overhead light (theta >= 75°): boost specular on lid (top of bucket gets full irradiance)
        const theta = la.lightSource?.directionAngle ?? 70;
        if (theta >= 75) {
          specOpacity = clamp(specOpacity * 1.2, 0.25, 0.55);  // capped lower than before
        }
        // material.roughness modulates specular blur: low roughness = tight sharp highlight
        const roughness = la.material?.roughness ?? 0.5;
        specBlurFromRoughness = Math.round(2 + roughness * 12);
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] [LA-v2] Specular: opacity=${specOpacity.toFixed(2)} zone=top${Math.round(specZonePct*100)}% width=${specWidthMult} roughness=${roughness}→blurPx=${specBlurFromRoughness} [CAPPED at ${SPEC_ZONE_MAX_PCT*100}%]`);
      } else {
        specOpacity   = { 'soft': 0.15, 'medium': 0.32, 'hard': 0.50 }[sceneCtx.lightIntensity] ?? 0.32;
        specZonePct   = 0.06;  // top 6% default (was 18%!!) — safe default that avoids handle
        specWidthMult = 0.48;
        specBlurFromRoughness = 6; // fallback
      }
      let specularBuffer: Buffer | null = null;
      let specLeft = productLeft;
      let specTop  = productTop;
      if (specOpacity > 0.05) {
        // Specular zone: top specZonePct of product height — STRICTLY the lid rim (physics-derived)
        // CRITICAL: specH2 is max 35% of zone height (was 50%) to keep highlight as a thin crescent
        // and NOT overlap with the product's white handle that sits on top of the lid.
        const specZoneH = Math.round(finalH * specZonePct);
        const specW     = Math.round(finalW * specWidthMult);  // physics-derived width
        const specH2    = Math.round(Math.max(4, specZoneH * 0.35));  // max 35% of zone height (was 50%)
        // Light offset from sceneCtx (spotlight X position).
        // PHYSICS: specular highlight center = direction toward light source.
        // If light is at xPercent=65 (right), highlight shifts RIGHT on the product.
        // Scale factor 0.40: realistic range for product photography (not too extreme).
        const specOffX  = Math.round((sceneCtx.lightSourceXPercent - 50) / 100 * finalW * 0.40);
        const specPad   = Math.round(specH2 * 0.4);
        const specBufW  = specW + specPad * 2;
        const specBufH  = specH2 + specPad * 2;
        specLeft = productLeft + Math.round((finalW - specW) / 2) + specOffX - specPad;
        specTop  = productTop + Math.round(specZoneH * 0.15);  // top of lid, with small margin
        // Clamp to image bounds
        specLeft = Math.max(0, Math.min(bgW - specBufW, specLeft));
        specTop  = Math.max(0, Math.min(bgH - specBufH, specTop));
        // Ensure specular bottom never goes beyond 18% mark of product
        const specBottomMax = productTop + specZoneH;
        if (specTop + specBufH > specBottomMax) {
          specTop = Math.max(productTop, specBottomMax - specBufH);
        }
        const specularSvg = Buffer.from(
          `<svg width="${specBufW}" height="${specBufH}" xmlns="http://www.w3.org/2000/svg">` +
          `<defs><radialGradient id="sp" cx="50%" cy="40%" r="50%">` +
          `<stop offset="0%"   stop-color="white" stop-opacity="${specOpacity.toFixed(2)}"/>` +
          `<stop offset="40%"  stop-color="white" stop-opacity="${(specOpacity*0.18).toFixed(2)}"/>` +
          `<stop offset="100%" stop-color="white" stop-opacity="0"/>` +
          `</radialGradient></defs>` +
          `<ellipse cx="${Math.round(specBufW/2)}" cy="${Math.round(specBufH * 0.45)}" rx="${Math.round(specW/2)}" ry="${Math.round(specH2/2)}" fill="url(#sp)"/>` +
          `</svg>`
        );
        // Apply roughness-derived blur to the specular highlight
        const rawSpecBuf = await svgToTransparentPng(specularSvg, specBufW, specBufH);
        const specBlurPx = la?.material?.specular?.blurPx ?? specBlurFromRoughness;
        specularBuffer = specBlurPx > 1
          ? await sharp(rawSpecBuf).blur(specBlurPx).png().toBuffer()
          : rawSpecBuf;
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] Specular: zone=top${Math.round(specZonePct*100)}% specW=${specW} specH=${specH2} offX=${specOffX}px opacity=${specOpacity.toFixed(2)}`);
      }

      console.log(`[COMPOSITE-GENERATE][preserveOriginal] Post-effects: warmOp=${warmOpacity.toFixed(3)} rimOp=${rimOpacity.toFixed(3)} specOp=${specOpacity.toFixed(2)} envTint=${envTintOpacity.toFixed(3)}`);

      // ── Final composite: base + contact shadow (core+halo) + specular ──────
      // (warmTint + rimDarken + envTint + fresnel + colorBleed + SSS + rimLight are baked into productWithEffects)
      const postEffectLayers: sharp.OverlayOptions[] = [
        // Halo is conditional — only rendered if la.shadow.aoHalo.opacity >= 0.05
        ...(haloBuffer && renderHalo ? [{ input: haloBuffer, left: productLeft + Math.round((finalW - haloW) / 2) + shadowXShift, top: surfaceY - Math.round(haloH * 0.5), blend: 'multiply' as sharp.Blend }] : []),
        { input: contactShadowBuffer, left: contactLeftAdj, top: contactTopAdj, blend: 'multiply' },
        ...(specularBuffer ? [{ input: specularBuffer, left: specLeft, top: specTop, blend: 'screen' as sharp.Blend }] : []),
      ];

      // ── Post-effect #3: Light wrap (la.compositing.lightWrap) ──────────────
      // Physics: background light "bleeds" around the product edges, softening the compositing border.
      // Applied AFTER the final composite so it samples real BG pixels, not the placeholder.
      // Implementation: blur the harmonized BG heavily, expand outward slightly, apply on product edge.
      const lightWrapCfg = la?.compositing?.lightWrap;
      if (lightWrapCfg && (lightWrapCfg.opacity ?? 0) > 0.02) {
        postEffectLayers.push = postEffectLayers.push; // placeholder — lightWrap is applied post-composite below
      }

      // ── Step E: Sharp post-processing before FLUX harmonization ──────────────

      // ── Step E1: Reflection — DISABLED ──────────────────────────────────────────
      // The flip-bottom reflection artifact creates a visible dark oval under the product
      // on non-polished/non-mirror surfaces (workshop wood, workbench, matte table).
      // It looks unnatural and is not what photography normally shows.
      // DISABLED: reflection effect is off. Contact shadow is sufficient for grounding.
      const sceneIsReflective = false;
      let reflectionBuffer: Buffer | null = null;
      const reflLeft = productLeft;
      const reflTop  = Math.min(bgH - 1, surfaceY);
      console.log(`[COMPOSITE-GENERATE][preserveOriginal] [E1] Reflection: DISABLED (contact shadow is sufficient)`);

      // E2: Color grade — darken product to match scene darkness
      // A bright studio product in a dark (darkness=72) scene needs dimming
      const sceneDimFactor = 1.0 - (sceneCtx.ambientDarkness / 100) * 0.18;  // 0.82-1.0
      console.log(`[COMPOSITE-GENERATE][preserveOriginal] [E] Scene dim factor: ${sceneDimFactor.toFixed(3)} (darkness=${sceneCtx.ambientDarkness})`);

      // ── Form shadow: directional darkening of the product's shadow-facing side ──
      // Physics: when light comes from the right (lightX > 50%), the LEFT side of the
      // product should be darker. We add a linear gradient overlay that transitions from
      // black (opacity ~35%) on the shadow side to transparent on the light side.
      // This grounds the product and gives it 3D weight without touching the base image.
      let formShadowBuffer: Buffer | null = null;
      const lightXPct = sceneCtx.lightSourceXPercent ?? 65; // 0=far left, 100=far right
      const lightIsFromRight = lightXPct > 52;
      const formShadowOpacity = Math.min(0.42, Math.max(0.20, Math.abs(lightXPct - 50) / 100 * 1.4));
      if (formShadowOpacity > 0.12 && finalW > 0 && finalH > 0) {
        // Gradient goes from shadow side (dark) to light side (transparent)
        // x1/y1 = shadow side start, x2/y2 = light side end
        const x1 = lightIsFromRight ? '0%' : '100%';
        const x2 = lightIsFromRight ? '70%' : '30%';
        const formShadowSvg = Buffer.from(
          `<svg width="${finalW}" height="${finalH}" xmlns="http://www.w3.org/2000/svg">` +
          `<defs><linearGradient id="fg" x1="${x1}" y1="60%" x2="${x2}" y2="100%">` +
          `<stop offset="0%"   stop-color="black" stop-opacity="${formShadowOpacity.toFixed(2)}"/>` +
          `<stop offset="55%"  stop-color="black" stop-opacity="${(formShadowOpacity * 0.30).toFixed(2)}"/>` +
          `<stop offset="100%" stop-color="black" stop-opacity="0"/>` +
          `</linearGradient></defs>` +
          `<rect x="0" y="0" width="${finalW}" height="${finalH}" fill="url(#fg)"/>` +
          `</svg>`
        );
        formShadowBuffer = await sharp(formShadowSvg).png().toBuffer();
        console.log(`[COMPOSITE-GENERATE][preserveOriginal] Form shadow: direction=${lightIsFromRight ? 'left' : 'right'} opacity=${formShadowOpacity.toFixed(2)} lightX=${lightXPct}%`);
      }

      // All E-step layers added to post-effects
      const ePostLayers: sharp.OverlayOptions[] = [
        // reflectionBuffer is null when surface is non-reflective (sand, beach, grass...)
        ...(reflectionBuffer ? [{ input: reflectionBuffer as Buffer, left: reflLeft, top: reflTop, blend: 'multiply' as sharp.Blend }] : []),
        ...postEffectLayers,
        // Form shadow: applied AFTER contact shadow so it sits on top of the product
        ...(formShadowBuffer ? [{ input: formShadowBuffer, left: productLeft, top: productTop, blend: 'multiply' as sharp.Blend }] : []),
      ];


      let compositedBuffer = await sharp(baseComposite)
        .composite(ePostLayers)
        .modulate({ brightness: sceneDimFactor })  // E2: darken to match scene
        .jpeg({ quality: 95 })
        .toBuffer();

      // Save initial sharp composite
      const compositeFilename = `composite-${Date.now()}.jpg`;
      const compositePath = path.join(rendersDir, compositeFilename);
      await fs.promises.writeFile(compositePath, compositedBuffer);
      imageUrl = `/renders/${compositeFilename}`;
      genModel = bgGenResult.model;
      genTime  = bgGenResult.generationTime;
      console.log(`[COMPOSITE-GENERATE][preserveOriginal] [E] Sharp composite saved → ${imageUrl}`);

      console.log(`[COMPOSITE-GENERATE][preserveOriginal] ✅ Final composite ready → ${imageUrl}`);

      // Run QA on the composited result
      // Fix #3: Use a composite-specific evaluation prompt — NOT bgOnlyPrompt (which says
      // "no products visible anywhere") and NOT activePrompt (which says "clean studio").
      // The QA must evaluate the COMPOSITE QUALITY: is the product physically integrated?
      const fullImageUrl = `http://localhost:${port}${imageUrl}`;
      const compositeCheckPrompt = `A product photo composite: a product placed onto a background scene. ` +
        `Evaluate ONLY: (1) is the product physically resting ON the surface (not floating above it)? ` +
        `(2) is there a visible rectangle/box/panel artifact around the product? ` +
        `(3) does the product look naturally integrated into the scene (not copy-pasted)?`;
      checkupResult = await checkGeneratedImage(fullImageUrl, compositeCheckPrompt);

      // Run layer selector on the composited image
      const layerSelection = await selectBestLayerTemplate(
        fullImageUrl,
        !!(decomposed.layerText),
        brandTone,
        brandRules
      );
      selectedTemplateId = layerSelection.templateId !== 'none' ? layerSelection.templateId : null;
      suggestedStyles = layerSelection.suggestedStyles || [];
      console.log(`[COMPOSITE-GENERATE][preserveOriginal] Layer selector chose: "${selectedTemplateId}" (${layerSelection.confidence}%)`);

    } else {
      // ── Standard generation (no preserveOriginal) ─────────────────────────
      const genResult = await generateWithFluxFlex(activePrompt, w, h, {
        aspectRatio: ar,
        safetyTolerance: 5,
        guidance: 4.5,
        steps: 50,
        inputImage,
        inputImage2,
        backgroundPrompt: scenePrompt || undefined
      });
      imageUrl = genResult.imageUrl;
      genModel = genResult.model;
      genTime  = genResult.generationTime;

      console.log(`[COMPOSITE-GENERATE] Image generated, running QA checkup...`);
      checkupResult = await checkGeneratedImage(imageUrl, activePrompt);

      if (!checkupResult.passed) {
        console.log(`[COMPOSITE-GENERATE] ⚠️ QA FAILED (score: ${checkupResult.score}). Issues: ${checkupResult.issues.join(', ')}`);
        console.log(`[COMPOSITE-GENERATE] Suggested fix for manual retry: "${checkupResult.suggestedPromptAdjustment}"`);
      }

      // Run layer selector on the generated image
      const layerSelection = await selectBestLayerTemplate(
        imageUrl,
        !!(decomposed.layerText),
        brandTone,
        brandRules
      );
      selectedTemplateId = layerSelection.templateId !== 'none' ? layerSelection.templateId : null;
      suggestedStyles = layerSelection.suggestedStyles || [];
      console.log(`[COMPOSITE-GENERATE] Layer selector chose: "${selectedTemplateId}" (${layerSelection.confidence}%)`);
    }

    const elapsed = Date.now() - start;
    console.log(`[COMPOSITE-GENERATE] ✅ Complete in ${elapsed}ms -> ${imageUrl}`);

    // Detect actual visual product bounds on final image (after FLUX redraw/shift)
    let finalProductPosition = null;
    try {
      console.log(`[COMPOSITE-GENERATE] Running Claude Vision to detect final visual product bounds...`);
      const detection = await detectProductPositionHelper(imageUrl);
      if (detection) {
        finalProductPosition = {
          left: Math.round(detection.xmin * 10.24),
          top: Math.round(detection.ymin * 15.36),
          width: Math.round((detection.xmax - detection.xmin) * 10.24),
          height: Math.round((detection.ymax - detection.ymin) * 15.36),
          normalized: detection
        };
      }
    } catch (err: any) {
      console.warn(`[COMPOSITE-GENERATE] Bounding box detection failed, falling back to compositing bounds:`, err.message);
    }

    if (!finalProductPosition && (typeof productLeft === 'number' && typeof productTop === 'number' && typeof finalW === 'number' && typeof finalH === 'number')) {
      finalProductPosition = {
        left: productLeft,
        top: productTop,
        width: finalW,
        height: finalH,
        normalized: {
          xmin: Math.round((productLeft / bgW) * 100),
          xmax: Math.round(((productLeft + finalW) / bgW) * 100),
          ymin: Math.round((productTop / bgH) * 100),
          ymax: Math.round(((productTop + finalH) / bgH) * 100),
        }
      };
    }

    res.json({
      imageUrl,
      prompt: activePrompt,
      elapsed,
      generationModel: genModel,
      generationTime: genTime,
      checkup: checkupResult,
      decomposedLayerText: decomposed.layerText,
      decomposedLayerCta: decomposed.layerCta,
      selectedTemplateId,
      suggestedStyles,
      productPosition: finalProductPosition,
      debugImages: (debugBgRawUrl || debugBgHarmonizedUrl) ? {
        bgRaw:        debugBgRawUrl        || null,
        bgHarmonized: debugBgHarmonizedUrl || null,
      } : undefined,
    });

  } catch (err: any) {
    console.error(`[COMPOSITE-GENERATE] Error during composite generation:`, err);
    res.status(500).json({ error: 'Composite generation failed', details: err.message });
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
    const uploadFilename = `uploaded-${Date.now()}.png`;
    const uploadFilePath = path.join(rendersDir, uploadFilename);
    fs.writeFileSync(uploadFilePath, base64Data, { encoding: 'base64' });
    const fileSize = fs.statSync(uploadFilePath).size;
    console.log(`[PREPROCESS] Saved uploaded file: ${uploadFilePath} (${(fileSize / 1024).toFixed(1)} KB)`);

    console.log('[PREPROCESS] Running local background removal...');
    const isolatedUrl = await removeBackground(uploadFilePath);
    
    console.log(`[PREPROCESS] ✅ Complete in ${Date.now() - start}ms → ${isolatedUrl}`);
    res.json({ url: isolatedUrl, originalUrl: `/renders/${uploadFilename}` });
  } catch (err: any) {
    console.error(`[PREPROCESS] ❌ Failed after ${Date.now() - start}ms: ${err.message}`);
    res.status(500).json({ error: 'Failed to preprocess image', details: err.message });
  }
});

// Route 4.5: Image upscaling (Local Real-ESRGAN AI upscaler)
app.post('/api/image/upscale', async (req, res) => {
  const { imageUrl, maskUrl } = req.body;
  if (!imageUrl) {
    return res.status(400).json({ error: 'imageUrl is required.' });
  }

  const start = Date.now();
  console.log(`\n[UPSCALE] Starting local AI upscale for image: ${imageUrl.substring(0, 80)}...`);

  try {
    const localUrl = await localUpscale(imageUrl, maskUrl);
    console.log(`[UPSCALE] ✅ Local upscale success in ${Date.now() - start}ms → ${localUrl}`);
    return res.json({ url: localUrl });
  } catch (err: any) {
    console.error(`[UPSCALE] ❌ Failed after ${Date.now() - start}ms: ${err.message}`);
    res.status(500).json({ error: 'Failed to upscale image', details: err.message });
  }
});

// Route 4.6: Remove background from an existing image URL
app.post('/api/image/remove-background', async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) {
    return res.status(400).json({ error: 'imageUrl is required.' });
  }

  const start = Date.now();
  console.log(`\n[REMOVE-BG] Removing background for image: ${imageUrl.substring(0, 80)}...`);

  try {
    const url = await removeBackground(imageUrl);
    console.log(`[REMOVE-BG] ✅ Success in ${Date.now() - start}ms → ${url.substring(0, 80)}...`);
    res.json({ url });
  } catch (err: any) {
    console.error(`[REMOVE-BG] ❌ Failed after ${Date.now() - start}ms: ${err.message}`);
    res.status(500).json({ error: 'Failed to remove background', details: err.message });
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
    let activePrompt = scenePrompt;
    if (!productImageUrl && !preprocessedImageUrl) {
      activePrompt = `${scenePrompt.trim()}, prompt subject dominates the image, fully visible, fully in frame, no cropped parts, well-composed`;
    }
    let checkupResult: any = null;
    let attempts = 0;

    while (attempts < 2) {
      attempts++;
      console.log(`[TEST-IMAGE] Generation attempt ${attempts} with prompt: "${activePrompt}"`);

      if (model === 'auto' || model === 'flux-auto') {
        console.log(`[TEST-IMAGE] [ROUTER] Routing via generateWithFluxFlex`);
        const genResult = await generateWithFluxFlex(activePrompt, width ? Number(width) : 1024, height ? Number(height) : 1536, {
          aspectRatio: aspectRatio || bflAspectRatio || '2:3',
          safetyTolerance: safetyTolerance !== undefined ? Number(safetyTolerance) : 5,
          guidance: guidance !== undefined ? Number(guidance) : 4.5,
          steps: steps !== undefined ? Number(steps) : 50,
          inputImage: productImageUrl || preprocessedImageUrl || undefined,
          inputImage2: preprocessedImageUrl && preprocessedImageUrl !== productImageUrl ? preprocessedImageUrl : undefined,
          backgroundPrompt: scenePrompt || undefined
        });
        imageUrl = genResult.imageUrl;
        usedModel = genResult.model;
      } else if (model && model.startsWith('bfl-')) {
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
          prompt: activePrompt,
          output_format: 'jpeg',
          safety_tolerance: safetyTolerance !== undefined ? Number(safetyTolerance) : 5
        };

        if (isFlex) {
          bflPayload.aspect_ratio = aspectRatio || bflAspectRatio || '2:3';
          bflPayload.guidance = guidance !== undefined ? Number(guidance) : 4.5;
          bflPayload.steps = steps !== undefined ? Math.min(50, Math.max(1, Number(steps))) : 50;
          if (width) bflPayload.width = Number(width);
          if (height) bflPayload.height = Number(height);
          bflPayload.input_image = imageToBflInput(productImageUrl || preprocessedImageUrl || undefined);
          if (preprocessedImageUrl && preprocessedImageUrl !== productImageUrl) {
            bflPayload.input_image_2 = imageToBflInput(preprocessedImageUrl);
          }
        } else if (isUltra) {
          bflPayload.aspect_ratio = bflAspectRatio || '2:3';
          bflPayload.raw = bflRaw === true;
          if (preprocessedImageUrl || productImageUrl) {
            bflPayload.image_prompt = imageToBflInput(preprocessedImageUrl || productImageUrl);
            bflPayload.image_prompt_strength = imagePromptStrength !== undefined ? Number(imagePromptStrength) : 0.1;
          }
        } else {
          const finalW = width ? Number(width) : 1024;
          const finalH = height ? Number(height) : 1536;
          const clamped = clampBflProDimensions(finalW, finalH);
          bflPayload.width = clamped.width;
          bflPayload.height = clamped.height;
          console.log(`[TEST-IMAGE] [BFL] Clamped direct Pro/Max dimensions: original ${finalW}x${finalH} -> clamped ${clamped.width}x${clamped.height}`);
          bflPayload.input_image = imageToBflInput(productImageUrl || preprocessedImageUrl || undefined);
          if (preprocessedImageUrl && preprocessedImageUrl !== productImageUrl) {
            bflPayload.input_image_2 = imageToBflInput(preprocessedImageUrl);
          }
        }

        console.log(`[TEST-IMAGE] [BFL] Sending payload to BFL:`, JSON.stringify(bflPayload, null, 2));

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

        let resultUrl = '';
        const pollStart = Date.now();
        const maxPollMs = 180000;

        while (Date.now() - pollStart < maxPollMs) {
          await new Promise(r => setTimeout(r, 2000));

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
          } else if (statusData.status && typeof statusData.status === 'string' && statusData.status.toLowerCase().includes('moderated')) {
            throw new Error('BFL request was moderated/blocked by safety filters.');
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
        console.log(`[TEST-IMAGE] [FLUX-HARMONIZE] Model: ${model}, Product: ${productImageUrl ? 'yes' : 'no'}`);
        
        console.log(`[TEST-IMAGE] [FLUX-HARMONIZE] Step 1/3: Generating background using Flux 2 Pro...`);
        const generatedBgUrl = await generateWithFlux2(activePrompt, 1024, 1536, { aspectRatio: '2:3', safetyTolerance: 5, guidance: 4.5, steps: 50 });
        console.log(`[TEST-IMAGE] [FLUX-HARMONIZE] Background generated: ${generatedBgUrl}`);
        
        console.log(`[TEST-IMAGE] [FLUX-HARMONIZE] Step 2/3: Compositing product onto background...`);
        const compositedLocalPath = await compositeProduct(generatedBgUrl, preprocessedImageUrl || productImageUrl, 'feed', rendersDir);
        console.log(`[TEST-IMAGE] [FLUX-HARMONIZE] Composited local path: ${compositedLocalPath}`);
        
        const compositedCdnUrl = await uploadToFal(compositedLocalPath);
        if (fs.existsSync(compositedLocalPath)) fs.unlinkSync(compositedLocalPath);
        console.log(`[TEST-IMAGE] [FLUX-HARMONIZE] Composited CDN URL: ${compositedCdnUrl}`);
        
        console.log(`[TEST-IMAGE] [FLUX-HARMONIZE] Step 3/3: Harmonizing image...`);
        imageUrl = await harmonizeImage(compositedCdnUrl, activePrompt, '');
        usedModel = 'flux-harmonize';
        
      } else if (model === 'flux-ip' && productImageUrl) {
        console.log(`[TEST-IMAGE] [FLUX-IP] IP:${ipStrength} CN:${cnStrength} G:${guidanceScale} S:${numSteps}`);
        
        const payload = {
          prompt: `${activePrompt}, professional product photography, the product is naturally integrated into the scene with matching lighting and shadows`,
          image_size: { width: 1024, height: 1536 },
          num_images: 1,
          num_inference_steps: numSteps || 28,
          guidance_scale: guidanceScale || 3.5,
          strength: 0.85,
          enable_safety_checker: true,
          ip_adapters: [{
            path: 'XLabs-AI/flux-ip-adapter',
            image_encoder_path: 'openai/clip-vit-large-patch14',
            image_url: productImageUrl,
            scale: ipStrength !== undefined ? Number(ipStrength) : 0.85,
            weight_name: 'ip_adapter.safetensors',
          }],
          controlnets: [{
            path: 'Shakker-Labs/FLUX.1-dev-ControlNet-Depth',
            control_image_url: preprocessedImageUrl || productImageUrl,
            conditioning_scale: cnStrength !== undefined ? Number(cnStrength) : 0.7,
          }],
        };
        
        console.log(`[TEST-IMAGE] [FLUX-IP] Sending payload:`, JSON.stringify(payload, null, 2));
        
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
        
        let result: any = null;
        const pollStart = Date.now();
        const maxPollMs = 360000;
        
        while (Date.now() - pollStart < maxPollMs) {
          await new Promise(r => setTimeout(r, 2000));
          
          const statusResp = await axios.get(
            `https://queue.fal.run/fal-ai/flux-general/requests/${requestId}/status`,
            { headers: { 'Authorization': `Key ${process.env.FAL_KEY}` }, timeout: 10000 }
          );
          
          const status = statusResp.data?.status;
          console.log(`[TEST-IMAGE] [FLUX-IP] Poll: ${status} (${((Date.now() - pollStart) / 1000).toFixed(0)}s)`);
          
          if (status === 'COMPLETED') {
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
        if (productImageUrl) {
          const placement = briaPlacement || 'automatic';
          console.log(`[TEST-IMAGE] [BRIA] Product shot mode — placement:${placement}, fast:${briaFast !== false}, optimize:${briaOptimize !== false}`);
          
          const briaBody: any = {
            image_url: productImageUrl,
            scene_description: activePrompt,
            placement_type: placement,
            optimize_description: briaOptimize !== false,
            fast: briaFast !== false,
            num_results: 1,
          };
          
          if (briaShotSize && Array.isArray(briaShotSize) && briaShotSize.length === 2) {
            briaBody.shot_size = briaShotSize;
          }
          
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
          imageUrl = await generateWithFlux2(activePrompt, width ? Number(width) : 1024, height ? Number(height) : 1536, {
            aspectRatio: aspectRatio || '2:3',
            safetyTolerance: safetyTolerance !== undefined ? Number(safetyTolerance) : 5,
            guidance: guidance !== undefined ? Number(guidance) : 4.5,
            steps: steps !== undefined ? Math.min(50, Math.max(1, Number(steps))) : 50
          });
          usedModel = 'flux-2-pro';
        }
      }

      if (!imageUrl) {
        throw new Error('No image URL in response');
      }

      console.log(`[TEST-IMAGE] Running checkup on generated image...`);
      checkupResult = await checkGeneratedImage(imageUrl, activePrompt);

      if (checkupResult.passed || attempts >= 2) {
        break;
      }

      console.log(`[TEST-IMAGE] Checkup FAILED (score: ${checkupResult.score}). Issues: ${checkupResult.issues.join(', ')}`);
      console.log(`[TEST-IMAGE] Suggested adjustment: "${checkupResult.suggestedPromptAdjustment}"`);

      activePrompt = `${activePrompt}. ${checkupResult.suggestedPromptAdjustment}`;
      activePrompt += `. Ensure single unified photographic/illustration frame, the prompt subject dominates the image, is fully visible, fully in frame, not cut off or cropped at the borders.`;
    }

    const elapsed = Date.now() - start;
    console.log(`[TEST-IMAGE] ✅ ${usedModel} ${elapsed}ms → ${imageUrl?.substring(0, 60)}...`);

    res.json({
      imageUrl,
      model: usedModel,
      elapsed,
      checkup: {
        ...checkupResult,
        attempts
      }
    });
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
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');

  // If both exist, check which starts first to determine outer-most wrapper
  if (objStart !== -1 && arrStart !== -1) {
    if (objStart < arrStart) {
      return text.substring(objStart, objEnd + 1);
    } else {
      return text.substring(arrStart, arrEnd + 1);
    }
  }

  // If only object braces exist
  if (objStart !== -1 && objEnd !== -1) {
    return text.substring(objStart, objEnd + 1);
  }

  // If only array brackets exist
  if (arrStart !== -1 && arrEnd !== -1) {
    return text.substring(arrStart, arrEnd + 1);
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
        imageContentBlock = await fetchImageAsClaudeBlock(imageUrl);
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
- Make the English natural and vivid for AI image generation${brandHint}
DO NOT output any explanations, formatting, or introduction. Just output the translation itself.`;

  try {
    const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    const response = await anthropic.messages.create({
      model,
      max_tokens: 500,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: [{ type: 'text', text: `Translate this image prompt to English:\n\n${text}` }] }]
    });

    const translated = (response.content[0].type === 'text' ? response.content[0].text : '').trim() || text;
    console.log(`[TRANSLATE] HU→EN via Claude: "${text.substring(0, 60)}" → "${translated.substring(0, 60)}"`);
    return { translated, wasTranslated: true };
  } catch (err: any) {
    console.error('[TRANSLATE] Claude error:', err.message);
    return { translated: text, wasTranslated: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: /api/image/satori-render
// Applies a Satori SVG overlay style to a base image (product photo or generated BG).
// Called by the frontend Satori Layer Editor when user selects a Quick Style.
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/api/image/satori-render', async (req, res) => {
  const {
    baseImageUrl,
    text = '',
    cta = '',
    satoriStyleId = 'gradient-bottom',
    brandColors,
    fontFamily = 'Inter',
    width = 1080,
    height = 1350,
    textLayers,
    textOpts,
    ctaOpts,
    shapeOpts,
  } = req.body;

  if (!baseImageUrl) {
    return res.status(400).json({ error: 'baseImageUrl is required' });
  }

  const start = Date.now();
  console.log(`[SATORI-RENDER] styleId=${satoriStyleId} text="${text.substring(0, 40)}" base=${baseImageUrl.substring(0, 80)}`);

  try {
    // 1. Fetch the base image (may be a local /renders/... path or absolute URL)
    let baseImageBuffer: Buffer;
    if (baseImageUrl.startsWith('http')) {
      try {
        const resp = await axios.get(baseImageUrl, { responseType: 'arraybuffer' });
        baseImageBuffer = Buffer.from(resp.data);
      } catch (fetchErr: any) {
        console.error('[SATORI-RENDER] Failed to fetch remote base image:', fetchErr.message);
        return res.status(403).json({
          error: 'Satori render failed',
          details: 'A generált kép az átmeneti tárolóban elévült (403/409). Kérlek, generáld újra a képet a szerkesztéshez!'
        });
      }
    } else {
      // Local path: strip query string, resolve to file
      const cleanPath = baseImageUrl.split('?')[0];
      const localPath = cleanPath.startsWith('/renders/')
        ? path.join(rendersDir, path.basename(cleanPath))
        : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', cleanPath);
      baseImageBuffer = await fs.promises.readFile(localPath);
    }

    // 2. Render with SatoriRenderer
    const resultBuffer = await SatoriRenderer.renderToBuffer(baseImageBuffer, {
      width,
      height,
      text,
      cta,
      satoriStyleId,
      colors: brandColors || { primary: '#8b5cf6', secondary: '#ffffff', accent: '#ec4899' },
      fontFamily,
      textLayers: textLayers || [],
      textOpts: textOpts || {},
      ctaOpts: ctaOpts || {},
      shapeOpts: shapeOpts || {},
    });

    // 3. Save and return URL
    const filename = `overlay-render-${Date.now()}-${Math.floor(Math.random() * 9999)}.png`;
    const outPath = path.join(rendersDir, filename);
    await fs.promises.writeFile(outPath, resultBuffer);
    const imageUrl = `/renders/${filename}`;

    console.log(`[SATORI-RENDER] Done in ${Date.now() - start}ms → ${imageUrl}`);
    res.json({ imageUrl, elapsed: Date.now() - start });
  } catch (err: any) {
    console.error('[SATORI-RENDER] Error:', err.message);
    if (err.response?.status === 403 || err.response?.status === 404) {
      res.status(403).json({
        error: 'Satori render failed',
        details: 'A generált kép az átmeneti tárolóban elévült. Kérlek, generáld újra a képet a szerkesztéshez!'
      });
    } else {
      res.status(500).json({ error: 'Satori render failed', details: err.message });
    }
  }
});

// ROUTE: /api/image/satori-render-all
// Renders ALL 30 Satori overlay styles at once to a test-all-styles folder for Visual QA.
app.post('/api/image/satori-render-all', async (req, res) => {
  const {
    baseImageUrl,
    text = '',
    cta = '',
    brandColors,
    fontFamily = 'Inter',
    width = 1080,
    height = 1350,
    textLayers,
  } = req.body;

  if (!baseImageUrl) {
    return res.status(400).json({ error: 'baseImageUrl is required' });
  }

  const start = Date.now();
  console.log(`[SATORI-RENDER-ALL] Starting render of all styles. Base image: ${baseImageUrl}`);

  try {
    let baseImageBuffer: Buffer;
    if (baseImageUrl.startsWith('http')) {
      const resp = await axios.get(baseImageUrl, { responseType: 'arraybuffer' });
      baseImageBuffer = Buffer.from(resp.data);
    } else {
      const cleanPath = baseImageUrl.split('?')[0];
      const localPath = cleanPath.startsWith('/renders/')
        ? path.join(rendersDir, path.basename(cleanPath))
        : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', cleanPath);
      baseImageBuffer = await fs.promises.readFile(localPath);
    }

    const styles = [
      'tailwind-cta', 'tailwind-gradient-bottom', 'tailwind-gradient-left',
      'tailwind-luxury-frame', 'tailwind-neo-brutal', 'tailwind-ribbon-top',
      'tailwind-circle-badge', 'tailwind-feature-list', 'tailwind-side-panel',
      'tailwind-minimal-corner', 'modernist-split', 'magazine-cover',
      'minimalist-editorial', 'glow-dark', 'bold-slant', 'duotone-overlay',
      'neon-sign', 'glass-list', 'brushed-metal', 'cyberpunk-hud',
      'stripe-card', 'linear-board', 'apple-spec', 'netflix-billboard',
      'airbnb-card', 'spotify-lyrics', 'notion-board', 'figma-canvas',
      'github-readme', 'tesla-minimal'
    ];

    const testRendersDir = path.join(rendersDir, 'test-all-styles');
    if (!fs.existsSync(testRendersDir)) {
      fs.mkdirSync(testRendersDir, { recursive: true });
    }

    const results: { styleId: string; imageUrl: string }[] = [];

    for (const styleId of styles) {
      let layersToUse = textLayers;
      if (!layersToUse || layersToUse.length === 0) {
        layersToUse = [
          { id: '1', text, fontSize: 44, color: '#ffffff', opacity: 100, x: 0, y: 0, textAlign: 'left' }
        ];
      }

      const resultBuffer = await SatoriRenderer.renderToBuffer(baseImageBuffer, {
        width,
        height,
        text,
        cta,
        satoriStyleId: styleId,
        colors: brandColors || { primary: '#187fc0', secondary: '#ffffff', accent: '#c32226' },
        fontFamily,
        textLayers: layersToUse,
        textOpts: {},
        ctaOpts: {},
        shapeOpts: {},
      });

      const filename = `style-${styleId}.png`;
      const outPath = path.join(testRendersDir, filename);
      await fs.promises.writeFile(outPath, resultBuffer);
      results.push({
        styleId,
        imageUrl: `/renders/test-all-styles/${filename}?t=${Date.now()}`
      });
    }

    console.log(`[SATORI-RENDER-ALL] Done in ${Date.now() - start}ms`);
    res.json({ results, elapsed: Date.now() - start });
  } catch (err: any) {
    console.error('[SATORI-RENDER-ALL] Error:', err.message);
    res.status(500).json({ error: 'Satori render-all failed', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: /api/image/satori-auto-layout
// Generates an AI-suggested Satori overlay layout based on prompt and Brand DNA.
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/api/image/satori-auto-layout', async (req, res) => {
  const { prompt = '', brandDna, subject = '', exactTextOnly = false, imageUrl = '', refresh = false } = req.body;

  // Try to load local brand_dna.json if it exists
  let localBrandDna: any = null;
  try {
    const brandDnaPath = path.join(__dirname, '..', '..', '..', 'thinkai-voice-agent', 'brand_dna.json');
    if (fs.existsSync(brandDnaPath)) {
      const raw = fs.readFileSync(brandDnaPath, 'utf8');
      localBrandDna = JSON.parse(raw);
      console.log('[SATORI-AUTO-LAYOUT] Loaded brand_dna.json from thinkai-voice-agent folder');
    }
  } catch (loadErr: any) {
    console.log('[SATORI-AUTO-LAYOUT] Optional brand_dna.json load skipped:', loadErr.message);
  }

  const brandKit = brandDna || localBrandDna || {};
  const companyName = brandKit.company?.name || 'Piktor Kft.';
  const visualRecipe = brandKit.visual_recipe || {};
  const colors = visualRecipe.color_palette || { primary: '#187fc0', secondary: '#333333', accent: '#c32226', background: '#ffffff', text_color: '#000000' };

  console.log(`[SATORI-AUTO-LAYOUT] generating for subject="${subject}" prompt="${prompt.substring(0, 40)}..." exactTextOnly=${exactTextOnly} imageUrl=${imageUrl}`);

  let strictInstruction = "";
  if (exactTextOnly) {
    strictInstruction = "\nCRITICAL STRICT RULE: The user has requested EXACT TEXT ONLY. You MUST NOT invent any new promotional text, adjectives, or extra titles. Only utilize the literal words provided in the 'Image Prompt/Scene Context' or 'Brand Name' for the text fields. For example, if the prompt has '30% akció mindenre nyáron', use exactly that or parts of that. Do NOT change it to 'Nyári Nagy Akció!' or add words like 'Nagy'. Do not invent extra marketing copy.";
  }

  const templateList = loadLayerConstraints();

  let visualContextInstructions = "";
  if (imageUrl) {
    visualContextInstructions = `
You are also provided with the actual image. Analyze it visually to detect the position of the product (paint can, bottle, etc.) and any key subjects.
You MUST SELECT and SUGGEST only templates whose occupied areas do NOT overlap with or obscure the main product/subjects.
If a creature, character (e.g., "goblin", "dwarf", "elf"), person, or animal is mentioned in the prompt/subject, locate it in the image. You MUST NOT place any text, shapes, or banners over them. If the subject/character is in the center, do not select center-aligned templates (like "quote-card", "testimonial-layer", "luxury-dark", etc.); instead, select templates that place text at the top or bottom margins (like "top-bar-announcement", "caption-bottom-only", etc.).
Propose the single best template in 'satoriStyleId', and list ALL matching suitable templates (up to 5-6) in the 'suggestedStyles' array, each with a brief Hungarian explanation of why it fits the empty space.`;
  } else {
    visualContextInstructions = `
Evaluate based on the scene prompt and subject context. Select the best style ID in 'satoriStyleId', and list other potentially suitable styles in the 'suggestedStyles' array with brief Hungarian reasons. Avoid overlapping with any prominent character (e.g. "goblin") or product described in the prompt.`;
  }

  let subjectOverlapRule = "";
  if (subject && subject.trim().length > 0) {
    subjectOverlapRule = `\nCRITICAL SUBJECT PROTECTION RULE: The image contains a prominent subject: "${subject}".
- You MUST NOT select any template that covers, overlaps, or obscures this subject.
- If the subject is centered (which is typical for character/product generation like "${subject}"), you MUST NOT select any template with Zone "center" or "full" (e.g., "center-circle-promo", "promo-badge", "luxury-dark", "dark-announcement", "quote-card", "stat-big-number").
- Instead, you MUST select a margin-based template:
  * "top-bar-announcement" (covers only y: 0 to 200 at the top margin)
  * "caption-bottom-only" (covers only y: 1100 to 1350 at the bottom margin)
  * "subtitle-strip" (covers only y: 1200 to 1350 at the bottom margin)
  * "price-tag-bold" (covers only a small top-left tag)
  * "percentage-corner" (covers only a small top-right badge)
  * "watermark-corner" (covers only a small bottom-right corner)`;
  }

  const systemPrompt = `You are a marketing layout assistant for an automated graphic editor.
Analyze the image generation prompt/context, the subject, and the brand identity to propose the perfect overlay layout using the Satori engine.${strictInstruction}${visualContextInstructions}${subjectOverlapRule}

SATORI ENGINE SPECIFICATIONS:
We compose an overlay on a 1080x1350 vertical image.
Available Style IDs and their occupied areas:
${templateList}

RULES FOR OUTPUT CONFIGURATION:
- Return valid JSON matching the schema below.
- Select the best 'satoriStyleId' based on the product type and scene prompt/image content.
- CRITICAL BRAND COLOR & CONTRAST RULES:
  * The template's background type MUST match the background image brightness! If the image is dark (e.g., night scene, volcano, dark studio, etc.), you MUST NOT select a light-background template (like quote-card or polaroid-white). You must select dark-background or any-background templates. Conversely, if the image is very bright, select light-background or any-background templates.
  * For each text layer, ensure its color contrasts highly with the underlying background image area. If the background behind the text is dark, the text color MUST be light (white '#ffffff' or a light brand accent color). If the background is light, the text color MUST be dark (brand primary/text color, or dark grey/black).
  * The CTA button background ('ctaOpts.bgColor') and text color ('ctaOpts.color') must contrast highly with each other.
- CRITICAL TEXT PRESERVATION RULE:
  * Do NOT omit key details from the input prompt (like target products or seasonal duration). Segment the input text into multiple layers so all information is preserved (e.g., put the main discount/offer in 'headline', and the target products/conditions in 'productName' or 'spec').
- Formulate the text layers in HUNGARIAN. Keep them short, punchy, and marketing-focused. HUNGARIAN ACCENTS ARE MANDATORY! You MUST use proper Hungarian accents (á, é, í, ó, ö, ő, ú, ü, ű). NEVER write text without proper Hungarian accents (e.g. use "szépség", never "szepseg"; "különleges", never "kulonleges"; "Győr", never "Gyor"). Double acute accents (ő, ű) are extremely important.
- Align the colors with the brand color palette provided.
- Segment textLayers into semantically distinct layers with specific IDs: "brandName", "productName", "spec", "price", or "headline". Set "visible": true for each.
- Add root-level visibility options: "showBorder": true, "showCta": true, "showBadge": true.

JSON SCHEMA:
{
  "satoriStyleId": "gradient-bottom",
  "suggestedStyles": [
    { "styleId": "tailwind-ribbon-top", "reason": "A termék alul helyezkedik el, így a felső sáv teljesen szabadon marad." }
  ],
  "text": "Inntaler Matt Fehér",
  "textLayers": [
    {
      "id": "brandName",
      "text": "PIKTOR KFT.",
      "fontSize": 24,
      "color": "#c9a96e",
      "opacity": 100,
      "x": 0,
      "y": 240,
      "textAlign": "center",
      "visible": true
    },
    {
      "id": "productName",
      "text": "Inntaler Matt Fehér",
      "fontSize": 48,
      "color": "#ffffff",
      "opacity": 100,
      "x": 0,
      "y": 300,
      "textAlign": "center",
      "visible": true
    },
    {
      "id": "spec",
      "text": "Kiadósság: 10m²/l",
      "fontSize": 24,
      "color": "#e5e7eb",
      "opacity": 100,
      "x": 0,
      "y": 370,
      "textAlign": "center",
      "visible": true
    }
  ],
  "cta": "Vásárlás",
  "ctaOpts": {
    "color": "#ffffff",
    "bgColor": "#c32226"
  },
  "showBorder": true,
  "showCta": true,
  "showBadge": true
}

Respond ONLY with the raw JSON object. Do not include markdown formatting or explanation.`;

  const userContent = `Subject: ${subject}
Image Prompt/Scene Context: ${prompt}
Brand Name: ${companyName}
Brand Colors: ${JSON.stringify(colors)}
Brand DNA Context: ${brandKit.company?.summary || ''}
Visual Mood: ${visualRecipe.mood || ''}`;

  try {
    let messagesContent: any[] = [];
    if (imageUrl) {
      try {
        const absoluteUrl = imageUrl.startsWith('http') ? imageUrl : `http://localhost:${port}${imageUrl}`;
        const imageBlock = await fetchImageAsClaudeBlock(absoluteUrl);
        messagesContent.push(imageBlock);
      } catch (imgErr: any) {
        console.warn('[SATORI-AUTO-LAYOUT] Failed to load image block:', imgErr.message);
      }
    }
    messagesContent.push({ type: 'text', text: userContent });

    const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1000,
      temperature: refresh ? 0.9 : 0.2,
      system: systemPrompt + (refresh ? "\n\nCRITICAL REFRESH INSTRUCTION: The user wants to RE-THINK the layout. You MUST suggest a DIFFERENT satoriStyleId and DIFFERENT suggestedStyles than a standard layout. Try to explore alternative margins, corners, and formats, rather than repeating the same default choice." : ""),
      messages: [{ role: 'user', content: messagesContent }]
    });

    const rawText = (response.content[0].type === 'text') ? response.content[0].text : '';
    console.log('[SATORI-AUTO-LAYOUT] Raw response from Claude:', rawText);

    let parsedConfig: any;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsedConfig = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch (parseErr) {
      throw new Error(`Failed to parse Claude output as JSON. Raw text: ${rawText}`);
    }

    // Post-validation filter based on subject position zone
    if (subject && subject.trim().length > 0 && parsedConfig.satoriStyleId) {
      try {
        const constraintsPath = path.join(__dirname, 'layerConstraints.json');
        if (fs.existsSync(constraintsPath)) {
          const constraintsData = JSON.parse(fs.readFileSync(constraintsPath, 'utf8'));
          const selectedTemplate = constraintsData.templates?.find((t: any) => t.id === parsedConfig.satoriStyleId);
          if (selectedTemplate && (selectedTemplate.textZone === 'center' || selectedTemplate.textZone === 'full')) {
            console.log(`[SATORI-AUTO-LAYOUT] 🚨 Post-validation override: selected template "${parsedConfig.satoriStyleId}" covers the center, but subject "${subject}" is present. Overriding to "caption-bottom-only" as fallback!`);
            parsedConfig.satoriStyleId = 'caption-bottom-only';
            
            // Re-map text layers to fit the new bottom-only layout format
            parsedConfig.textLayers = [
              { id: 'productName', text: parsedConfig.text || (parsedConfig.textLayers && parsedConfig.textLayers[0]?.text) || 'Ajánlat', fontSize: 32, color: '#ffffff', opacity: 100, x: 0, y: 0, textAlign: 'center', visible: true }
            ];

            // Filter suggested styles to exclude center/full templates
            if (Array.isArray(parsedConfig.suggestedStyles)) {
              parsedConfig.suggestedStyles = parsedConfig.suggestedStyles.filter((item: any) => {
                const temp = constraintsData.templates?.find((t: any) => t.id === item.styleId);
                return temp && temp.textZone !== 'center' && temp.textZone !== 'full';
              });
              if (parsedConfig.suggestedStyles.length === 0) {
                parsedConfig.suggestedStyles = [
                  { styleId: 'caption-bottom-only', reason: 'Alul elhelyezett felirat, így a kép központi része teljesen szabadon marad.' },
                  { styleId: 'top-bar-announcement', reason: 'Fent elhelyezett vékony sáv, nem takarja ki a központi témát.' }
                ];
              }
            }
          }
        }
      } catch (err: any) {
        console.error('[SATORI-AUTO-LAYOUT] Post-validation filter error:', err.message);
      }
    }

    res.json(parsedConfig);
  } catch (err: any) {
    console.error('[SATORI-AUTO-LAYOUT] Error:', err.message);
    res.status(500).json({ error: 'AI Auto layout generation failed', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: /api/image/pin-test-image
// Elmenti a kepet a perzisztens renders/pinned/ mappaba (tesztkep.png).
// Szerver restart utan is megmarad -- a frontend ezt az URL-t menti.
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/api/image/pin-test-image', async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });

  try {
    const pinnedDir = path.join(rendersDir, 'pinned');
    await fs.promises.mkdir(pinnedDir, { recursive: true });
    const outPath = path.join(pinnedDir, 'tesztkep.png');

    let buf: Buffer;
    if (imageUrl.startsWith('http')) {
      const resp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
      buf = Buffer.from(resp.data);
    } else {
      const cleanPath = imageUrl.split('?')[0];
      const localPath = cleanPath.startsWith('/renders/')
        ? path.join(rendersDir, cleanPath.replace('/renders/', ''))
        : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', cleanPath);
      buf = await fs.promises.readFile(localPath);
    }

    await fs.promises.writeFile(outPath, buf);
    console.log(`[PIN-TEST-IMAGE] Saved → ${outPath} (${Math.round(buf.length / 1024)}KB)`);
    res.json({ imageUrl: '/renders/pinned/tesztkep.png', saved: true });
  } catch (err: any) {
    console.error('[PIN-TEST-IMAGE] Error:', err.message);
    res.status(500).json({ error: 'Pin failed', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: /api/image/text-preserve-regen
// Text-Preserve Regeneration Mode:
//   1. Detects text/label zones on the product using Claude Vision
//   2. Generates a binary inpainting mask (black=preserve, white=regenerate)
//   3. Calls BFL FLUX Fill Pro to regenerate product body + background in ONE pass
//      while keeping all label/text areas pixel-perfectly intact
// Called when user clicks the "Szöveg megőrzés" button
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/api/image/text-preserve-regen', async (req, res) => {
  const {
    productImageUrl,  // The rembg'd isolated product (preprocessedUrl from frontend)
    scenePrompt = '', // Optional: user-specified scene/background context
    brandContext,     // Optional: brand name, colors, style
    width = 1080,
    height = 1350,
  } = req.body;

  if (!productImageUrl) {
    return res.status(400).json({ error: 'productImageUrl is required' });
  }

  const start = Date.now();
  const bflKey = process.env.BFL_API_KEY;
  if (!bflKey) return res.status(500).json({ error: 'BFL_API_KEY not configured' });

  console.log(`[TEXT-PRESERVE-REGEN] Starting for: ${productImageUrl.substring(0, 80)}`);

  try {
    // ── Step 1: Fetch the product image ─────────────────────────────────────
    let productBuffer: Buffer;
    if (productImageUrl.startsWith('http')) {
      const resp = await axios.get(productImageUrl, { responseType: 'arraybuffer' });
      productBuffer = Buffer.from(resp.data);
    } else {
      const cleanPath = productImageUrl.split('?')[0];
      const localPath = cleanPath.startsWith('/renders/')
        ? path.join(rendersDir, path.basename(cleanPath))
        : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', cleanPath);
      productBuffer = await fs.promises.readFile(localPath);
    }

    // Get actual image dimensions
    const meta = await sharp(productBuffer).metadata();
    const imgW = meta.width || width;
    const imgH = meta.height || height;

    // ── Step 2: Claude Vision — detect text/label bounding boxes ─────────────
    console.log(`[TEXT-PRESERVE-REGEN] Step 2: Detecting text zones via Claude Vision...`);
    const base64Image = productBuffer.toString('base64');
    const mimeType = (meta.format === 'jpeg' || meta.format === 'jpg') ? 'image/jpeg' : 'image/png';

    const textDetectResponse = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64Image }
          },
          {
            type: 'text',
            text: `You are analyzing a product image to identify ONLY the printed text and logo areas that must be preserved pixel-perfectly during image regeneration.

DETECT ONLY:
- Brand names and logos (the actual printed characters/graphics)
- Product names (printed text)
- Specification text (e.g. "1L", "8 m²/L", percentages)
- Marketing text printed on labels
- Printed icons/badges that are part of the label design

DO NOT DETECT (these will be regenerated to match the new scene):
- The product body, lid, cap, handle (physical 3D structure)
- Background or shadows
- Reflections or glossy highlights on the product surface
- Transparent or empty areas

Use TIGHT bounding boxes — minimal pixel coverage of the actual text/logo characters only.
Group nearby text elements into single zones where logical.
Do NOT add extra margin — just the actual character bounds.

Return JSON array ONLY (no explanation, no markdown):
[
  { "label": "brand logo", "x1": 15, "y1": 22, "x2": 55, "y2": 35 },
  { "label": "product name", "x1": 10, "y1": 38, "x2": 85, "y2": 52 }
]
x1,y1 = top-left (0-100%), x2,y2 = bottom-right (0-100%). If NO text: return []`
          }
        ]
      }]
    });

    let textZones: Array<{ label: string; x1: number; y1: number; x2: number; y2: number }> = [];
    const rawText = (textDetectResponse.content[0].type === 'text') ? textDetectResponse.content[0].text : '';
    try {
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      if (jsonMatch) textZones = JSON.parse(jsonMatch[0]);
    } catch {
      console.warn('[TEXT-PRESERVE-REGEN] Claude text zone parsing failed, using empty zones');
    }
    console.log(`[TEXT-PRESERVE-REGEN] Step 2 done — detected ${textZones.length} text zones:`, textZones.map(z => z.label));

    // ── Step 3: Convert product image: flatten alpha → JPEG + resize ───────────
    // rembg images are RGBA PNGs — BFL Fill doesn't handle transparency well.
    // Flatten to white background, convert to JPEG, resize to max 1024px
    // (BFL Fill has a ~1MB payload limit for base64)
    console.log(`[TEXT-PRESERVE-REGEN] Step 3a: Flattening alpha + resizing for BFL compatibility...`);
    const flatProductBuffer = await sharp(productBuffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Get actual dimensions after resize (for mask generation)
    const flatMeta = await sharp(flatProductBuffer).metadata();
    const flatW = flatMeta.width || imgW;
    const flatH = flatMeta.height || imgH;

    // ── Step 3b: Generate inpainting mask ────────────────────────────────────
    // BFL Fill convention: WHITE = inpaint (regenerate), BLACK = preserve (keep)
    // Mask must match EXACT dimensions of the (resized) input image
    console.log(`[TEXT-PRESERVE-REGEN] Step 3b: Generating inpainting mask (${flatW}x${flatH})...`);

    let maskSvgRects = '';
    if (textZones.length > 0) {
      for (const zone of textZones) {
        // 2% margin only — tight preservation of text pixels only.
        // Product body, lid, handle remain WHITE (regeneratable) to adapt to the new scene.
        const marginPct = 2;
        const px1 = Math.max(0, zone.x1 - marginPct);
        const py1 = Math.max(0, zone.y1 - marginPct);
        const px2 = Math.min(100, zone.x2 + marginPct);
        const py2 = Math.min(100, zone.y2 + marginPct);
        const x = Math.round(flatW * px1 / 100);
        const y = Math.round(flatH * py1 / 100);
        const w = Math.round(flatW * (px2 - px1) / 100);
        const h = Math.round(flatH * (py2 - py1) / 100);
        maskSvgRects += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="black"/>`;
      }
    }

    // BFL Fill: WHITE=inpaint everything, BLACK rects=preserve text zones
    const maskSvg = Buffer.from(
      `<svg width="${flatW}" height="${flatH}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${flatW}" height="${flatH}" fill="white"/>` +  // white = regenerate everything
      maskSvgRects +                                                  // black = preserve text zones
      `</svg>`
    );
    const maskBuffer = await sharp(maskSvg).png().toBuffer();

    // Save mask for debugging
    const maskFilename = `mask-tpr-${Date.now()}.png`;
    await fs.promises.writeFile(path.join(rendersDir, maskFilename), maskBuffer);
    console.log(`[TEXT-PRESERVE-REGEN] Mask saved → /renders/${maskFilename} (${textZones.length} preserved zones, size: ${maskBuffer.length} bytes)`);

    // ── Step 4: BFL FLUX Fill Pro inpainting ─────────────────────────────────
    // BFL Fill API expects RAW base64 strings (NOT data URLs with data: prefix)
    // Image and mask must have identical dimensions
    const brandName = brandContext?.name || '';
    // Fill prompt: explicitly instructs BFL to regenerate the product BODY and BACKGROUND
    // to match the new scene, while the preserved text zones (black mask) stay pixel-perfect.
    // CRITICAL: do NOT mention table/surface unless the user asked for it.
    const sceneContext = scenePrompt.trim() || 'clean professional product photography';
    const fillPrompt = [
      sceneContext,
      brandName ? `${brandName} product` : 'professional product',
      'the product body, packaging material, lid, and handle are fully regenerated to naturally fit this scene',
      'appropriate lighting, shadows, and reflections matching the scene environment',
      'the product looks as if it was actually photographed in this setting',
      'photorealistic, high quality product photography, seamless integration with the scene',
      'no white studio background, no artificial cutout look',
    ].filter(Boolean).join('. ');

    console.log(`[TEXT-PRESERVE-REGEN] Step 4: BFL FLUX Fill Pro — image: ${flatProductBuffer.length} bytes, mask: ${maskBuffer.length} bytes`);
    console.log(`[TEXT-PRESERVE-REGEN] Prompt: "${fillPrompt.substring(0, 100)}..."`);

    // RAW base64 (no data: prefix) — BFL API requirement
    const productBase64 = flatProductBuffer.toString('base64');
    const maskBase64    = maskBuffer.toString('base64');

    const fillPayload = {
      prompt: fillPrompt,
      image: productBase64,
      mask:  maskBase64,
      safety_tolerance: 5,
      output_format: 'jpeg',
    };

    let submitResp;
    try {
      submitResp = await axios.post(
        'https://api.bfl.ai/v1/flux-pro-1.0-fill',
        fillPayload,
        { headers: { 'X-Key': bflKey, 'Content-Type': 'application/json' }, timeout: 35000 }
      );
    } catch (bflErr: any) {
      const bflDetail = bflErr.response?.data;
      console.error('[TEXT-PRESERVE-REGEN] BFL Fill submit error:', JSON.stringify(bflDetail));
      throw new Error(`BFL Fill submit HTTP ${bflErr.response?.status}: ${JSON.stringify(bflDetail)}`);
    }

    const taskId = submitResp.data?.id;
    const pollingUrl = submitResp.data?.polling_url;
    if (!taskId || !pollingUrl) throw new Error(`BFL Fill submit failed: ${JSON.stringify(submitResp.data)}`);
    console.log(`[TEXT-PRESERVE-REGEN] BFL Fill task submitted: ${taskId}`);

    // ── Step 5: Poll for result ───────────────────────────────────────────────
    const pollStart = Date.now();
    const maxPollMs = 120000;
    let resultImageUrl = '';

    while (Date.now() - pollStart < maxPollMs) {
      await new Promise(r => setTimeout(r, 2000));
      const statusResp = await axios.get(pollingUrl, {
        headers: { 'X-Key': bflKey }, timeout: 10000
      });
      const { status, result: pollResult } = statusResp.data;
      console.log(`[TEXT-PRESERVE-REGEN] Poll: ${status} (${((Date.now() - pollStart)/1000).toFixed(0)}s)`);

      if (status === 'Ready') {
        resultImageUrl = pollResult?.sample;
        break;
      } else if (status === 'Failed') {
        throw new Error(`BFL Fill task failed: ${JSON.stringify(statusResp.data?.error || statusResp.data)}`);
      }
    }
    if (!resultImageUrl) throw new Error('BFL Fill timed out after 2 minutes');

    // ── Step 6: Download + save result ───────────────────────────────────────
    const resultResp = await axios.get(resultImageUrl, { responseType: 'arraybuffer' });
    const resultBuffer = Buffer.from(resultResp.data);
    const resultFilename = `text-preserve-regen-${Date.now()}.jpg`;
    const resultPath = path.join(rendersDir, resultFilename);
    await fs.promises.writeFile(resultPath, resultBuffer);
    const finalUrl = `/renders/${resultFilename}`;

    const elapsed = Date.now() - start;
    console.log(`[TEXT-PRESERVE-REGEN] Done in ${(elapsed/1000).toFixed(1)}s → ${finalUrl}`);
    res.json({
      imageUrl: finalUrl,
      elapsed,
      textZonesDetected: textZones.length,
      maskDebugUrl: `/renders/${maskFilename}`,
      textZones,
    });

  } catch (err: any) {
    console.error('[TEXT-PRESERVE-REGEN] Error:', err.message);
    res.status(500).json({ error: 'Text-preserve regeneration failed', details: err.message });
  }
});

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

app.post('/api/image/detect-product-position', async (req, res) => {
  const { imageUrl, productImageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });

  const normalized = await detectProductPositionHelper(imageUrl, productImageUrl);
  if (normalized) {
    res.json({
      success: true,
      normalized
    });
  } else {
    res.status(500).json({ error: 'Failed to detect position' });
  }
});

app.post('/api/image/placid-refine-copy', async (req, res) => {
  const { text, cta, maxHeadlineLen, maxCtaLen } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'text is required.' });
  }

  const limitH = maxHeadlineLen || 40;
  const limitC = maxCtaLen || 15;

  console.log(`[REFINE-COPY] Refining text: "${text}" (limit: ${limitH}) and cta: "${cta}" (limit: ${limitC})...`);

  try {
    const systemPrompt = `You are a professional Hungarian copywriter. Your job is to refine and condense social media ad copy to fit strict character limits.
Return ONLY a valid JSON object matching this schema:
{
  "refinedText": "The condensed Hungarian headline text. Must be strictly <= ${limitH} characters.",
  "refinedCta": "The condensed Hungarian CTA text. Must be strictly <= ${limitC} characters."
}
Strict Rules:
1. Do not include any chat prefix or markdown formatting (like \`\`\`json). Output only raw JSON.
2. The output refinedText must be highly punchy and professional Hungarian, and its length in characters must be less than or equal to ${limitH}.
3. The output refinedCta must be <= ${limitC} characters.
4. Keep the core promotional message and brand tone intact.`;

    const modelName = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Please refine this copy. Headline: "${text}". CTA: "${cta || ''}"` }]
    });

    const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
    console.log(`[REFINE-COPY] Claude raw response:`, rawText);

    const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleaned);

    res.json(result);
  } catch (err: any) {
    console.error('[REFINE-COPY] Error refining copy:', err.message);
    res.status(500).json({ error: 'Failed to refine copy', details: err.message });
  }
});

app.get('/api/image/placid-templates', async (req, res) => {
  const customToken = req.query.token as string;
  const token = customToken || 'placid-tllizj7jfdpmujio-nav7mkoatthmwmjk';
  console.log('[PLACID-PROXY] Fetching templates from Placid API...');
  try {
    const response = await axios.get('https://api.placid.app/api/rest/templates', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      timeout: 10000
    });
    res.json({ templates: response.data.data || [] });
  } catch (err: any) {
    const errMsg = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error('[PLACID-PROXY] Failed to fetch templates:', errMsg);
    res.status(err.response?.status || 500).json({ error: errMsg });
  }
});

async function uploadLocalImageToPlacid(imageUrl: string, activeToken: string): Promise<string> {
  const isLocal = imageUrl.includes('/renders/') || imageUrl.startsWith('/renders/') || imageUrl.startsWith('renders/') || imageUrl.includes('localhost:3001');
  if (!isLocal) {
    return imageUrl;
  }

  try {
    let filename = '';
    if (imageUrl.includes('/renders/')) {
      filename = imageUrl.split('/renders/').pop() || '';
    } else {
      filename = path.basename(imageUrl);
    }
    
    // Remove query params if any
    filename = filename.split('?')[0];

    if (!filename) return imageUrl;
    
    const filePath = path.join(rendersDir, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`[PLACID-UPLOAD] File not found at local path: ${filePath}`);
      return imageUrl;
    }

    console.log(`[PLACID-UPLOAD] Uploading local file ${filePath} to Placid Media API...`);
    const fileBuffer = fs.readFileSync(filePath);
    
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'image/png' });
    formData.append('file', blob, filename);

    const uploadResponse = await axios.post(
      'https://api.placid.app/api/rest/media',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${activeToken}`
        },
        timeout: 15000
      }
    );

    const mediaList = uploadResponse.data.media;
    if (mediaList && mediaList.length > 0) {
      const uploadedUrl = mediaList[0].file_id;
      console.log(`[PLACID-UPLOAD] Successfully uploaded local image. Placid CDN URL: ${uploadedUrl}`);
      return uploadedUrl;
    }
  } catch (err: any) {
    console.error(`[PLACID-UPLOAD] Failed to upload local image to Placid media:`, err.response?.data || err.message);
  }
  return imageUrl;
}

app.post('/api/image/placid-render', async (req, res) => {
  const { template, layers, token } = req.body;
  const activeToken = token || 'placid-tllizj7jfdpmujio-nav7mkoatthmwmjk';
  console.log(`[PLACID-PROXY] Forwarding template ${template} to Placid API...`);
  try {
    // Process layers to upload any local image to Placid media storage first
    const processedLayers: any = {};
    for (const key of Object.keys(layers || {})) {
      const layerData = layers[key];
      if (layerData && typeof layerData === 'object') {
        const imgUrl = layerData.image || layerData.image_url;
        if (imgUrl) {
          const publicUrl = await uploadLocalImageToPlacid(imgUrl, activeToken);
          processedLayers[key] = {
            ...layerData,
            image: publicUrl
          };
          if (processedLayers[key].image_url) {
            delete processedLayers[key].image_url;
          }
        } else {
          processedLayers[key] = layerData;
        }
      } else {
        processedLayers[key] = layerData;
      }
    }

    const response = await axios.post(
      'https://api.placid.app/api/rest/images',
      { template_uuid: template, layers: processedLayers },
      {
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    const initialData = response.data;
    if (initialData.image_url) {
      return res.json(initialData);
    }

    if (initialData.polling_url || initialData.id) {
      const pollUrl = initialData.polling_url || `https://api.placid.app/api/rest/images/${initialData.id}`;
      console.log(`[PLACID-PROXY] Image generation queued. Polling: ${pollUrl}`);
      
      let attempts = 0;
      const maxAttempts = 15;
      
      while (attempts < maxAttempts) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 800));
        
        try {
          const pollResp = await axios.get(pollUrl, {
            headers: {
              'Authorization': `Bearer ${activeToken}`
            },
            timeout: 5000
          });
          
          const pollData = pollResp.data;
          console.log(`[PLACID-PROXY] Poll attempt ${attempts}: status = ${pollData.status}`);
          
          if (pollData.status === 'finished' && pollData.image_url) {
            return res.json(pollData);
          }
          if (pollData.status === 'error') {
            return res.status(500).json({ error: 'Placid processing error occurred during generation.' });
          }
        } catch (pollErr: any) {
          console.warn(`[PLACID-PROXY] Poll warning on attempt ${attempts}:`, pollErr.message);
        }
      }
      return res.status(504).json({ error: 'Placid image generation timed out.' });
    }

    res.json(initialData);
  } catch (err: any) {
    const errMsg = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error('[PLACID-PROXY] Placid error:', errMsg);
    res.status(err.response?.status || 500).json({ error: errMsg });
  }
});

app.post('/api/image/placid-render-local', async (req, res) => {
  const { width, height, layers, layerValues, baseImageUrl, productImageUrl, useCutoutOnly, imageMappings, productPosition, parsedRequirements } = req.body;
  try {
    const imageUrl = await renderLocalPlacid({
      width,
      height,
      layers,
      layerValues,
      baseImageUrl,
      productImageUrl,
      useCutoutOnly,
      imageMappings,
      productPosition,
      parsedRequirements
    }, port);
    res.json({ image_url: imageUrl });
  } catch (err: any) {
    console.error('[LOCAL-RENDER-ROUTE] Local render error:', err);
    res.status(500).json({ error: err.message || 'Helyi renderelési hiba történt' });
  }
});

app.post('/api/image/parse-requirements', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.json({ success: true, parsed: {} });
  }

  try {
    const anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });

    const modelToUse = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    console.log(`[PARSE-REQUIREMENTS] Request received. Calling model ${modelToUse}...`);

    const response = await anthropicClient.messages.create({
      model: modelToUse,
      max_tokens: 1000,
      system: `You are an AI assistant that converts Hungarian free-text requirements for image layouts/templates into a structured JSON object of key-value pairs (constraints).
Ensure keys are descriptive, lowercase, snake_case English words (e.g., 'images_count', 'orientation', 'has_text_overlay', 'background_color').
Values should be raw types: integers, booleans, or strings.
Example:
"Ezen a sablonon 3 különböző képnek kell elhelyezkednie, tehát követelmény hogy 3 képünk legyen" -> {"images_count": 3}
"A headline szöveg nem lehet több mint 50 karakter és fekvő formátum" -> {"headline_max_chars": 50, "orientation": "landscape"}
"Csak termékkép és semmi más" -> {"product_image_only": true}

Return ONLY the raw JSON object inside a code block or as a raw string. No other conversational text or markdown explanation.`,
      messages: [{ role: 'user', content: text }],
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text : '';
    console.log('[PARSE-REQUIREMENTS] Claude raw reply:', reply);

    // Extract JSON block
    let jsonText = reply.trim();
    if (jsonText.includes('{')) {
      const startIdx = jsonText.indexOf('{');
      const endIdx = jsonText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        jsonText = jsonText.substring(startIdx, endIdx + 1);
      }
    }

    const parsed = JSON.parse(jsonText);
    res.json({ success: true, parsed });
  } catch (err: any) {
    console.error('[PARSE-REQUIREMENTS] Error parsing requirements:', err);
    res.status(500).json({ error: err.message || 'Hiba történt a követelmények értelmezése közben' });
  }
});

app.post('/api/image/refine-requirements-json', async (req, res) => {
  const { currentJson, instruction } = req.body;
  if (!instruction) {
    return res.status(400).json({ error: 'Az instruction paraméter kötelező.' });
  }

  try {
    const anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });

    const modelToUse = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    console.log(`[REFINE-JSON] Instruction: "${instruction}". Calling model ${modelToUse}...`);

    const response = await anthropicClient.messages.create({
      model: modelToUse,
      max_tokens: 1000,
      system: `You are an AI assistant that updates an existing template requirements JSON configuration based on Hungarian free-text instructions.
You must parse the instruction and modify the current JSON object.
Rules:
1. Update existing keys or add new keys based on the user's intent.
2. Keep keys descriptive, lowercase, snake_case English words.
3. Values must be raw types: integers, booleans, or strings.
4. Support opacity settings, e.g. "xy layer opacityje 20%" should map to {"<layer_name>_opacity": 20} (ensure the layer name matches the layout standard).
5. Support gradient fade/mask requests, e.g. "első x pixele legyen gradient" or "fade-eljen ki" should map to:
   - "fade_gradient": true
   - "fade_pixels": <number of pixels, default 100>
   - "fade_direction": "top" | "bottom" | "left" | "right" (default is "top")
6. Return ONLY the raw modified JSON object. Do not include markdown blocks, code blocks, or conversational text.`,
      messages: [
        { role: 'user', content: `Current JSON:\n${JSON.stringify(currentJson, null, 2)}\n\nInstruction:\n${instruction}` }
      ],
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text : '';
    console.log('[REFINE-JSON] Claude raw reply:', reply);

    // Extract JSON block
    let jsonText = reply.trim();
    if (jsonText.includes('{')) {
      const startIdx = jsonText.indexOf('{');
      const endIdx = jsonText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        jsonText = jsonText.substring(startIdx, endIdx + 1);
      }
    }

    const parsed = JSON.parse(jsonText);
    res.json({ success: true, parsed });
  } catch (err: any) {
    console.error('[REFINE-JSON] Error refining JSON:', err);
    res.status(500).json({ error: err.message || 'Hiba történt a JSON finomítása közben' });
  }
});

app.listen(port, () => {
  console.log(`AI Creative Studio backend running at http://localhost:${port}`);
});

