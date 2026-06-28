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
import { uploadToFal, removeBackground, compositeProduct, harmonizeImage, applyLowResMaskToUpscaled } from './compositor.js';
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
  opts?: { safetyTolerance?: number; guidance?: number; steps?: number; aspectRatio?: string; inputImage?: string; inputImage2?: string; backgroundPrompt?: string }
): Promise<{ imageUrl: string; model: string; generationTime: number }> {
  const bflKey = process.env.BFL_API_KEY;
  if (!bflKey) throw new Error('BFL_API_KEY is not configured in .env');

  if (opts?.inputImage) {
    console.log(`[BFL-ROUTER] Input image present. Routing to Bria Product Shot for pixel-perfect integration.`);
    const startBria = Date.now();
    try {
      const briaImageUrl = (opts.inputImage2 && opts.inputImage2 !== opts.inputImage && (opts.inputImage2.includes('preprocessed') || opts.inputImage2.includes('fal.media')))
        ? opts.inputImage2
        : opts.inputImage;

      console.log(`[BFL-ROUTER] Calling Bria Product Shot with image: ${briaImageUrl.substring(0, 80)}...`);
      const briaResponse = await axios.post(
        'https://fal.run/fal-ai/bria/product-shot',
        {
          image_url: briaImageUrl,
          scene_description: prompt,
          placement_type: 'automatic',
          optimize_description: true,
          num_results: 1,
        },
        {
          headers: {
            'Authorization': `Key ${process.env.FAL_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        }
      );

      const imageUrl = briaResponse.data?.images?.[0]?.url || briaResponse.data?.image?.url || '';
      if (!imageUrl) throw new Error('No image URL returned from Bria Product Shot');

      const totalTime = Number(((Date.now() - startBria) / 1000).toFixed(1));
      console.log(`[BFL-ROUTER] Bria Product Shot success in ${totalTime}s → ${imageUrl}`);
      return {
        imageUrl,
        model: 'Bria Product Shot',
        generationTime: totalTime
      };
    } catch (briaErr: any) {
      const detail = briaErr.response?.data?.detail || '';
      console.error(`[BFL-ROUTER] Bria Product Shot failed: ${briaErr.message}. Detail: ${JSON.stringify(briaErr.response?.data || {})}`);
      if (detail.includes('Exhausted balance') || detail.includes('User is locked') || briaErr.response?.status === 403) {
        throw new Error(`FAL_KEY egyenleg elfogyott vagy zárolva van. Kérjük, töltsd fel az egyenlegedet a fal.ai oldalon! Részlet: ${detail}`);
      }
      console.log(`[BFL-ROUTER] Falling back to standard direct BFL Flex.`);
    }
  }

  // Hybrid Compositing & Harmonization pipeline bypassed as per user request.
  // Standard single-pass BFL Flex generation will be used to ensure natural shadows, lighting, and reflections.

  const hasReferenceImage = !!(opts?.inputImage || opts?.inputImage2);
  const containsText = promptContainsTextRequest(prompt);

  // Router logic:
  // Route to Flex (Direction A) if there is an input reference image OR if the prompt contains a text generation request.
  // Otherwise, route to FLUX 1.1 Pro (Direction B) for flagship quality at a flat-rate $0.04.
  const isFlex = hasReferenceImage || containsText;
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
      payload.input_image = opts.inputImage;
      if (opts.inputImage2) {
        payload.input_image_2 = opts.inputImage2;
      }
    }
  } else {
    // Pro endpoint expects width and height
    const clamped = clampBflProDimensions(width, height);
    payload.width = clamped.width;
    payload.height = clamped.height;
    console.log(`[BFL-ROUTER] Clamped Pro dimensions: original ${width}x${height} -> clamped ${clamped.width}x${clamped.height}`);
  }

  // Step 1: Submit generation task
  const submitResponse = await axios.post(
    endpoint,
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
      return { imageUrl, model: modelName, generationTime };
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
  console.log(`[IMAGE-FETCH] Fetching image from URL: ${imageUrl}`);
  const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
  const rawBuffer = Buffer.from(imageResponse.data);
  
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
- Brand rules: ${JSON.stringify(brandRules)}

CRITICAL RULES:
1. REMOVE ALL BRAND NAMES, TRADEMARKS, COMPANY NAMES, AND MODEL DESIGNATIONS (e.g. Audi, BMW, Mercedes, Poli-Farbe, PoliFarbe, A8, etc.). Replace them with high-quality generic equivalents (e.g. "luxury sedan car" instead of "Audi car", "bucket of paint" instead of "Poli-Farbe paint").
2. INTEGRATE THE SUBJECTS NATURALLY. Instead of just listing "featuring a car and a paint bucket", describe how they are arranged. For example, if the scene prompt implies paint on/with a car, describe the paint bucket sitting on the roof or next to the car with natural integration, and describe the scene elements (beach, sunset, road etc.).
3. KEEP THE FOREGROUND OBJECTS FULLY IN FRAME & DOMINANT. Specify that the foreground subjects (such as the luxury sedan car, the paint bucket, etc.) must dominate the image, be fully visible within the frame, well-composed, and never cropped out, cut off, or clipped at the borders of the image. Always describe them as fully in frame and dominating the scene (e.g. "the entire car is fully visible in the frame, dominating the composition", "the paint bucket is shown completely without being cut off, placed prominently").
4. ENSURE SHARP AND LEGIBLE TEXT/LABELS WITH REAL UTF-8 CHARACTERS. If any foreground subject contains text, writing, labels, or logos (such as a paint bucket label), describe the text/label as extremely sharp, clear, high-contrast, and 100% legible, matching the hyper-realistic photographic quality of the rest of the image. Specifically instruct the generator that the text must be rendered using standard, existing UTF-8 characters and actual typography, with clean letterforms and crisp, well-defined glyphs. Specify that no character should ever appear as a blob, spot, abstract shape, or distorted artifact (paca), and that all text must be perfectly spelled and readable.
5. DO NOT output split-screen, multiple panels, or collages. The prompt must describe a single unified photo or scene.
6. Output ONLY the composed English prompt. Do not write markdown, code blocks, or explanations.`;

  try {
    const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    const response = await anthropic.messages.create({
      model,
      max_tokens: 600,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: [{ type: 'text', text: `Compose the final prompt.` }] }]
    });

    const result = (response.content[0].type === 'text' ? response.content[0].text : '').trim() || '';
    console.log(`[COMPOSE] Composed prompt via Claude: "${result}"`);
    return result;
  } catch (err: any) {
    console.error('[COMPOSE] Claude error:', err.message);
    return `${scenePrompt} featuring ${slotSubjects.join(', ')}`;
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

    const systemPrompt = `You are a visual quality inspector AI. Your job is to check the generated image for composition errors, layouts that look like collages, split-screen layouts, picture-in-picture frames, photo-in-photo insets, duplicate floating objects, artificial-looking text cards, cropped/cut-off subjects, or blurry/illegible labels.
Evaluate the image against the prompt: "${prompt}"

We want a single, natural, integrated photograph or cohesive scene.
CRITICAL CHECKS:
- Verify if any main subjects or focal points of the prompt (such as the product, vehicle, paint bucket, animal, person, or any key object described in the prompt) are partially cut off, cropped, or clipped at the borders of the image frame. For example, if the prompt describes a gorilla, its feet, hands, head, or body must not be cut off or cropped by the edge of the image; the entire subject must be fully contained within the frame. If any key subject is cut off or cropped by the edge of the image, the check must FAIL (passed = false).
- Verify if any text, writing, labels, or logos on the products (e.g. on the paint bucket label) are blurry, garbled, distorted, illegible, or contain abstract shapes/blobs (pacák) instead of real, well-formed UTF-8 characters. The text on product labels must be sharp, clear, and readable. If the text is illegible, garbled, or contains abstract spots/blobs instead of actual readable characters, the check must FAIL (passed = false).
- Verify spelling of Hungarian text on the labels! The label text must match the expected Hungarian branding exactly. Check for letter swaps or misspelled variations (such as "IZOALILÓ" or "IZOALILO", which should be "IZOLÁLÓ", or other spelling errors). If there are obvious spelling mistakes in the main label texts, the check must FAIL (passed = false).

Analyze the image and return a JSON object with the following fields:
- "passed": boolean (true if the image is a cohesive, single-frame scene without collage/cutout/split-screen visual glitches, all main subjects/focal points (such as products, animals, persons, or key objects described in the prompt) are fully visible inside the frame without being cut off or cropped, AND all labels/text on products are sharp, readable, spelled correctly, and consist of well-formed characters; false otherwise).
- "score": number (visual quality score from 0 to 100, where 100 is perfect and below 70 usually means it should fail).
- "issues": string[] (list of specific problems found, e.g. ["kollázs elrendezés", "osztott képernyő", "duplikált tárgyak", "keret a képben", "levágott tárgy/kilógó termék", "olvashatatlan felirat/homályos szöveg/karakter paca", "helyesírási hiba a feliraton"], should be in Hungarian).
- "explanation": string (brief explanation of what is wrong, in Hungarian, e.g., "a festékes vödör feliratában a 'izoláló' szó hibásan 'izoaliló'-ként szerepel").
- "suggestedPromptAdjustment": string (English prompt instructions or negative tags to guide the generator in the retry, e.g., "correct the spelling on the paint bucket label to be exactly 'IZOLÁLÓ' instead of 'IZOALILÓ', ensuring perfectly formed letters and correct spelling").

You MUST return ONLY the JSON object. Do not include markdown formatting or explanations outside the JSON.`;

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

    const systemPrompt = `You are a professional image analysis AI. You must analyze the uploaded image and return a JSON object containing the subject, type, text analysis, and changeability rules.
You MUST output ONLY a valid JSON object matching the format below. Do not output markdown backticks (like \`\`\`json), explanations, or trailing commas.

CRITICAL RULES:
1. DO NOT output specific brand names, company names, logos, or model names in the "subject" or "altText" (e.g. NEVER use "Audi", "A8", "Poli-Farbe", "PoliFarbe", "BMW", etc.). Instead, use generic descriptions (e.g. "luxury sedan car", "bucket of paint", "beverage bottle").
2. However, for "extractedText", write the EXACT letters/text written on the object, even if it contains brand names, so we know what is on the original image (e.g. "Poli-Farbe" or "Audi").
3. COMPLETELY IGNORE the background or environment of the image. Only describe and analyze the foreground subject (e.g. if there is a car on a road in front of trees, ignore the road and trees, focus entirely on the car itself).
4. For Hungarian paint buckets, ensure correct spelling of labels: transcribe "koromfoltokra" (with an 'o', meaning soot spots), NEVER "körömfoltokra" or "köromfoltokra" (nail spots).

JSON format:
{
  "imageType": "product" | "model" | "scene" | "logo" | "lifestyle" | "mixed",
  "subject": "Precise generic English description of the foreground subject. NO brand names.",
  "altText": "A detailed descriptive alt text of the subject.",
  "dominantColors": ["color1", "color2"],
  "hasText": boolean,
  "extractedText": "The exact text written on the object, preserving exact branding/letters.",
  "textPlacement": "Hungarian description of where the text is located on the object, e.g. 'a vödör oldalán lévő fehér címkén'.",
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

    const userPrompt = `Analyze this image and return the JSON object following the strict rules.`;

    const modelName = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    console.log(`[ANALYZE] Invoking Anthropic Claude Vision: ${modelName}`);

    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 1000,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: [imageContentBlock, { type: 'text', text: userPrompt }] }],
    });

    const textContent = response.content[0].type === 'text' ? response.content[0].text : '';
    console.log(`[ANALYZE] Claude response:`, textContent);

    const cleanJson = extractJsonStr(textContent);
    const parsed = JSON.parse(cleanJson);

    // Normalize and enrich changeability rules based on type
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

    let analysisResult = {
      ...parsed,
      imageType,
      locked,
    };

    // Optimize descriptions using DeepSeek if available
    analysisResult = await optimizeAnalysisWithDeepSeek(analysisResult);

    console.log(`[ANALYZE] ✅ Analysis complete in ${Date.now() - start}ms`, analysisResult);
    res.json({ results: [analysisResult] });
  } catch (err: any) {
    console.error(`[ANALYZE] Error analyzing image:`, err);
    res.status(500).json({ error: 'Failed to analyze image', details: err.message });
  }
});

// Route: Composite image generation
app.post('/api/image/composite-generate', async (req, res) => {
  const { slots, scenePrompt, brandKit, aspectRatio, width, height, previewOnly } = req.body;
  if (!slots || !Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ error: 'slots array is required.' });
  }

  const start = Date.now();
  console.log(`\n[COMPOSITE-GENERATE] Starting composite generation/preview with ${slots.length} slots.`);

  try {
    const slotSubjects = slots.map(s => {
      let desc = s.userEditedDescription || s.analysis?.shortSubject || s.analysis?.subject || s.role || 'object';
      desc = condenseDescription(desc);
      desc = desc.replace(/\b(audi|polifarbe|poli-farbe|bmw|mercedes)\b/gi, '').replace(/\s+/g, ' ').trim();
      return desc;
    });

    const brandRules = brandKit?.visualRules || [];

    // Intelligently compose, translate and merge scene prompt with slot contents (and strip brand names)
    let activePrompt = await intelligentComposePrompt(scenePrompt.trim(), slotSubjects, brandRules);
    
    if (brandRules.length > 0) {
      const styleTags = await getStyleTags(brandRules);
      if (styleTags) {
        activePrompt += `, style: ${styleTags}`;
      } else {
        const { translated } = await translateToEnglish(brandRules.join(', '));
        activePrompt += `, style: ${translated}`;
      }
    }

    // Final safety regex filter to guarantee no brand names are present
    activePrompt = activePrompt
      .replace(/\b(audi|polifarbe|poli-farbe|bmw|mercedes|porsche|ferrari|lamborghini|ford|toyota|honda)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (previewOnly) {
      console.log(`[COMPOSITE-GENERATE] Preview only requested. Composed prompt: "${activePrompt}"`);
      return res.json({ prompt: activePrompt });
    }

    const inputImage = slots[0]?.originalUrl || slots[0]?.preprocessedUrl || undefined;
    const inputImage2 = slots[0]?.preprocessedUrl && slots[0]?.preprocessedUrl !== slots[0]?.originalUrl 
      ? slots[0]?.preprocessedUrl 
      : (slots[1]?.originalUrl || slots[1]?.preprocessedUrl || undefined);

    let imageUrl = '';
    let genModel = '';
    let genTime = 0;
    let checkupResult: any = null;
    let attempts = 0;
    const w = width ? Number(width) : 1024;
    const h = height ? Number(height) : 1536;
    const ar = aspectRatio || '2:3';

    while (attempts < 2) {
      attempts++;
      console.log(`[COMPOSITE-GENERATE] Attempt ${attempts} prompt: "${activePrompt}"`);

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
      genTime = genResult.generationTime;

      console.log(`[COMPOSITE-GENERATE] Image generated, running checkup...`);
      checkupResult = await checkGeneratedImage(imageUrl, activePrompt);

      if (checkupResult.passed || attempts >= 2) {
        break;
      }

      console.log(`[COMPOSITE-GENERATE] Checkup FAILED (score: ${checkupResult.score}). Issues: ${checkupResult.issues.join(', ')}`);
      console.log(`[COMPOSITE-GENERATE] Suggested adjustment: "${checkupResult.suggestedPromptAdjustment}"`);

      activePrompt = `${activePrompt}. ${checkupResult.suggestedPromptAdjustment}`;
      activePrompt += `. Ensure single unified photographic frame, merge background seamlessly, remove picture-in-picture, avoid multiple copies.`;
    }

    const elapsed = Date.now() - start;
    console.log(`[COMPOSITE-GENERATE] ✅ Complete in ${elapsed}ms -> ${imageUrl}`);

    res.json({
      imageUrl,
      prompt: activePrompt,
      elapsed,
      generationModel: genModel,
      generationTime: genTime,
      checkup: {
        ...checkupResult,
        attempts
      }
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

// Route 4.5: Image upscaling (drct-super-resolution for sharp details and text)
app.post('/api/image/upscale', async (req, res) => {
  const { imageUrl, maskUrl } = req.body;
  if (!imageUrl) {
    return res.status(400).json({ error: 'imageUrl is required.' });
  }

  const start = Date.now();
  console.log(`\n[UPSCALE] Starting upscale using fal-ai/drct-super-resolution for image: ${imageUrl.substring(0, 80)}...`);

  try {
    const result = await fal.subscribe('fal-ai/drct-super-resolution', {
      input: {
        image_url: imageUrl,
        upscale_factor: 4
      }
    });

    const data = result.data as any;
    if (!data || !data.image || !data.image.url) {
      throw new Error('No image URL returned in upscale response');
    }

    const upscaledUrl = data.image.url;
    console.log(`[UPSCALE] DRCT success in ${Date.now() - start}ms → ${upscaledUrl.substring(0, 80)}...`);

    // If maskUrl (preprocessed transparent URL) is provided, apply it mathematically to preserve 100% of text quality
    if (maskUrl) {
      console.log(`[UPSCALE] maskUrl provided, applying low-res mask to upscaled image`);
      const maskedLocalPath = await applyLowResMaskToUpscaled(upscaledUrl, maskUrl, rendersDir);
      const finalCdnUrl = await uploadToFal(maskedLocalPath);
      
      // Clean up local file
      if (fs.existsSync(maskedLocalPath)) {
        fs.unlinkSync(maskedLocalPath);
      }
      
      console.log(`[UPSCALE] ✅ Masked upscale success in ${Date.now() - start}ms → ${finalCdnUrl.substring(0, 80)}...`);
      return res.json({ url: finalCdnUrl });
    }

    return res.json({ url: upscaledUrl });
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
          bflPayload.input_image = productImageUrl || preprocessedImageUrl || undefined;
          if (preprocessedImageUrl && preprocessedImageUrl !== productImageUrl) {
            bflPayload.input_image_2 = preprocessedImageUrl;
          }
        } else if (isUltra) {
          bflPayload.aspect_ratio = bflAspectRatio || '2:3';
          bflPayload.raw = bflRaw === true;
          if (preprocessedImageUrl || productImageUrl) {
            bflPayload.image_prompt = preprocessedImageUrl || productImageUrl;
            bflPayload.image_prompt_strength = imagePromptStrength !== undefined ? Number(imagePromptStrength) : 0.1;
          }
        } else {
          const finalW = width ? Number(width) : 1024;
          const finalH = height ? Number(height) : 1536;
          const clamped = clampBflProDimensions(finalW, finalH);
          bflPayload.width = clamped.width;
          bflPayload.height = clamped.height;
          console.log(`[TEST-IMAGE] [BFL] Clamped direct Pro/Max dimensions: original ${finalW}x${finalH} -> clamped ${clamped.width}x${clamped.height}`);
          bflPayload.input_image = productImageUrl || preprocessedImageUrl || undefined;
          if (preprocessedImageUrl && preprocessedImageUrl !== productImageUrl) {
            bflPayload.input_image_2 = preprocessedImageUrl;
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

