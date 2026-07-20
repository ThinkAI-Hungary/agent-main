// @ts-nocheck
import axios from 'axios';
import { GeneratorBrandKit, OrchestratedVariant, PolotnoJSON } from './types';
import { orchestrateOverlayVariants } from './orchestrator';
import { renderVariant } from './archetypes';
import { renderPolotnoJSON } from '../renderer';

// ── Flux 2 Flex helper (BFL Direct API) — matches index.ts generateWithFluxFlex ─
async function generateWithFlux2(prompt: string, width: number, height: number): Promise<string> {
  const bflKey = process.env.BFL_API_KEY;
  if (!bflKey) throw new Error('BFL_API_KEY is not configured in .env');

  console.log(`[FLUX2-FLEX] Submitting to BFL Flux 2 Flex — ${width}x${height} with safety_tolerance=5`);

  const submitResponse = await axios.post(
    'https://api.bfl.ai/v1/flux-2-flex',
    { prompt, width, height, aspect_ratio: '2:3', output_format: 'jpeg', safety_tolerance: 5, guidance: 4.5, steps: 50 },
    { headers: { 'X-Key': bflKey, 'Content-Type': 'application/json' }, timeout: 30000 }
  );

  const taskId = submitResponse.data?.id;
  const pollingUrl = submitResponse.data?.polling_url;
  if (!taskId || !pollingUrl) throw new Error(`BFL Flex submit failed: ${JSON.stringify(submitResponse.data)}`);
  console.log(`[FLUX2-FLEX] Task submitted: ${taskId}`);

  const pollStart = Date.now();
  while (Date.now() - pollStart < 120000) {
    await new Promise(r => setTimeout(r, 2000));
    const statusResp = await axios.get(pollingUrl, { headers: { 'X-Key': bflKey }, timeout: 10000 });
    const { status, result } = statusResp.data;
    console.log(`[FLUX2-FLEX] Poll: ${status} (${((Date.now() - pollStart) / 1000).toFixed(0)}s)`);
    if (status === 'Ready') {
      const url = result?.sample;
      if (!url) throw new Error('BFL returned Ready but no sample URL');
      return url;
    } else if (status === 'Failed') {
      throw new Error(`BFL Flex 2 failed: ${JSON.stringify(statusResp.data?.error || statusResp.data)}`);
    } else if (status && typeof status === 'string' && status.toLowerCase().includes('moderated')) {
      throw new Error(`BFL request was moderated/blocked by safety filters.`);
    }
  }
  throw new Error('BFL Flux 2 Flex timed out after 2 minutes');
}


// Helper to pick a high-quality stock photo URL based on keywords
function getStockImageUrl(query: string = ''): string {
  const q = query.toLowerCase();
  if (q.includes('coffee') || q.includes('latte') || q.includes('cafe') || q.includes('kávé')) {
    return 'https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&q=80&w=1080';
  }
  if (q.includes('bakery') || q.includes('croissant') || q.includes('cake') || q.includes('pékség') || q.includes('süti')) {
    return 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=1080';
  }
  if (q.includes('burger') || q.includes('food') || q.includes('restaurant') || q.includes('étterem') || q.includes('étel')) {
    return 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&q=80&w=1080';
  }
  if (q.includes('shoe') || q.includes('product') || q.includes('sneaker') || q.includes('termék')) {
    return 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=1080';
  }
  if (q.includes('hair') || q.includes('salon') || q.includes('beauty') || q.includes('szalon') || q.includes('fodrász')) {
    return 'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&q=80&w=1080';
  }
  if (q.includes('fitness') || q.includes('gym') || q.includes('sport') || q.includes('edzés')) {
    return 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&q=80&w=1080';
  }
  // Ultimate lifestyle placeholder
  return 'https://images.unsplash.com/photo-1490730141103-6cac27aaab94?auto=format&fit=crop&q=80&w=1080';
}

export interface GeneratedOverlayResult {
  archetype: string;
  rationale: string;
  slots: Record<string, string>;
  imageConfig: any;
  accentEmphasis: string;
  imageUrl: string; // The Playwright screenshot file path
  layoutJson: PolotnoJSON;
}

export async function runOverlayPipeline(
  brief: string,
  contentType: string,
  brandKit: GeneratorBrandKit,
  format: 'feed' | 'story',
  variantCount: number = 3
): Promise<GeneratedOverlayResult[]> {
  console.log(`[PIPELINE] Starting Overlay Pipeline — Format: ${format}, Type: ${contentType}`);
  
  // 1. Claude Layout Orchestration
  const variants: OrchestratedVariant[] = await orchestrateOverlayVariants(
    brief,
    contentType,
    brandKit,
    format,
    variantCount
  );
  
  console.log(`[PIPELINE] Claude generated ${variants.length} creative overlay concepts.`);
  
  const results: GeneratedOverlayResult[] = [];
  
  // 2. Process and Render each variant
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    console.log(`[PIPELINE] [VARIANT ${i + 1}/${variants.length}] Processing layout blueprint ${variant.archetype}...`);
    
    // 2a. Determine background image url
    let backgroundUrl = '';
    if (variant.image.mode !== 'solid') {
      if (variant.image.source === 'generated' && process.env.BFL_API_KEY) {
        try {
          console.log(`[PIPELINE] [VARIANT ${i + 1}] [FLUX2] Generating background: "${variant.image.queryOrPrompt}"`);
          const fullPrompt = `${variant.image.queryOrPrompt || 'clean aesthetic background'}, empty negative space for text overlays, visual advertising photography style, no text, no watermark, no signatures, high detail`;
          const size = format === 'feed' ? { width: 768, height: 960 } : { width: 768, height: 1365 };
          backgroundUrl = await generateWithFlux2(fullPrompt, size.width, size.height);
          console.log(`[PIPELINE] [VARIANT ${i + 1}] [FLUX2] Background created: ${backgroundUrl}`);
        } catch (fluxErr: any) {
          console.warn(`[PIPELINE] [VARIANT ${i + 1}] [FLUX2] Generation failed, falling back to stock placeholder:`, fluxErr.message);
          backgroundUrl = getStockImageUrl(variant.image.queryOrPrompt);
        }
      } else {
        // Stock mode or fallback
        backgroundUrl = getStockImageUrl(variant.image.queryOrPrompt);
        console.log(`[PIPELINE] [VARIANT ${i + 1}] Stock placeholder selected: ${backgroundUrl}`);
      }
    }
    
    // 2b. Compute PolotnoJSON layout using deterministic engine
    const polotnoJson = renderVariant(
      variant.archetype,
      variant.slots,
      brandKit,
      format,
      backgroundUrl,
      variant.accentEmphasis
    );
    
    // 2c. Headless browser rendering using Playwright screenshot
    try {
      const screenshotUrl = await renderPolotnoJSON(polotnoJson);
      
      results.push({
        archetype: variant.archetype,
        rationale: variant.rationale,
        slots: variant.slots,
        imageConfig: variant.image,
        accentEmphasis: variant.accentEmphasis,
        imageUrl: screenshotUrl,
        layoutJson: polotnoJson
      });
      console.log(`[PIPELINE] [VARIANT ${i + 1}] Screenshot saved: ${screenshotUrl}`);
    } catch (renderErr: any) {
      console.error(`[PIPELINE] [VARIANT ${i + 1}] Playwright render failed:`, renderErr.message);
    }
  }
  
  return results;
}
