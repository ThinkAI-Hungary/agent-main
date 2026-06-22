import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fal } from '@fal-ai/client';

// Configure fal client with API key at module load
if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

// 1. Upload a local file to Fal.ai storage via SDK CDN
export async function uploadToFal(filePath: string): Promise<string> {
  if (!process.env.FAL_KEY) {
    throw new Error('FAL_KEY is not configured.');
  }

  const fileSize = fs.statSync(filePath).size;
  console.log(`[COMPOSITOR/UPLOAD] Uploading ${filePath} (${(fileSize / 1024).toFixed(1)} KB) to Fal.ai CDN...`);
  const start = Date.now();

  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'image/png' });

  const url = await fal.storage.upload(blob);
  if (!url) {
    throw new Error('Failed to upload file to Fal.ai CDN storage');
  }

  console.log(`[COMPOSITOR/UPLOAD] ✅ Upload done in ${Date.now() - start}ms → ${url}`);
  return url;
}

// 2. Call Fal.ai Bria AI to remove background and isolate product
// Uses the fal SDK subscribe() method instead of raw axios to avoid REST path 404 issues
export async function removeBackground(imageUrl: string): Promise<string> {
  if (!process.env.FAL_KEY) {
    throw new Error('FAL_KEY is not configured.');
  }

  console.log(`[COMPOSITOR/BRIA] Starting background removal for: ${imageUrl.substring(0, 80)}...`);
  const start = Date.now();

  const result = await fal.subscribe('fal-ai/bria/background/remove', {
    input: {
      image_url: imageUrl,
    },
  });

  const data = result.data as any;
  if (data && data.image && data.image.url) {
    console.log(`[COMPOSITOR/BRIA] ✅ Background removed in ${Date.now() - start}ms → ${data.image.url.substring(0, 80)}...`);
    return data.image.url;
  }
  
  console.error(`[COMPOSITOR/BRIA] ❌ Unexpected response:`, JSON.stringify(data).substring(0, 200));
  throw new Error('Failed to remove background: ' + JSON.stringify(data));
}

// Helper utility to download an image locally
async function downloadImage(url: string, destPath: string): Promise<void> {
  const writer = fs.createWriteStream(destPath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
  });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// 3. Composite product PNG onto generated background image using sharp
export async function compositeProduct(
  backgroundUrl: string,
  productPngUrl: string,
  templateId: string,
  rendersDir: string
): Promise<string> {
  console.log(`[COMPOSITOR/SHARP] Starting composite for template="${templateId}"`);
  console.log(`[COMPOSITOR/SHARP]   Background: ${backgroundUrl.substring(0, 80)}...`);
  console.log(`[COMPOSITOR/SHARP]   Product:    ${productPngUrl.substring(0, 80)}...`);
  const start = Date.now();

  const tempBgPath = path.join(rendersDir, `temp-bg-${Date.now()}.png`);
  const tempProdPath = path.join(rendersDir, `temp-prod-${Date.now()}.png`);
  const outPath = path.join(rendersDir, `composited-${Date.now()}.png`);

  try {
    if (!fs.existsSync(rendersDir)) {
      fs.mkdirSync(rendersDir, { recursive: true });
    }

    console.log(`[COMPOSITOR/SHARP] Downloading background image...`);
    await downloadImage(backgroundUrl, tempBgPath);
    console.log(`[COMPOSITOR/SHARP] Downloading product image...`);
    await downloadImage(productPngUrl, tempProdPath);

    const bgMetadata = await sharp(tempBgPath).metadata();
    const bgWidth = bgMetadata.width || 1080;
    const bgHeight = bgMetadata.height || 1350;
    console.log(`[COMPOSITOR/SHARP] Background size: ${bgWidth}x${bgHeight}`);

    const targetProductWidth = Math.round(bgWidth * 0.40);
    const resizedProductBuffer = await sharp(tempProdPath)
      .resize({ width: targetProductWidth, fit: 'inside' })
      .toBuffer();

    const prodMetadata = await sharp(resizedProductBuffer).metadata();
    const prodHeight = prodMetadata.height || 400;
    console.log(`[COMPOSITOR/SHARP] Product resized to ${targetProductWidth}x${prodHeight}`);

    let left = Math.round((bgWidth - targetProductWidth) / 2);
    let top = Math.round(bgHeight - prodHeight - 120);

    if (templateId === 'list') {
      left = Math.round(bgWidth - targetProductWidth - 60);
      top = Math.round(bgHeight - prodHeight - 100);
    } else if (templateId === 'testimonial') {
      left = 60;
      top = Math.round(bgHeight - prodHeight - 100);
    }
    console.log(`[COMPOSITOR/SHARP] Placing product at (${left}, ${top})`);

    await sharp(tempBgPath)
      .composite([{ input: resizedProductBuffer, top, left }])
      .toFile(outPath);

    const outSize = fs.statSync(outPath).size;
    console.log(`[COMPOSITOR/SHARP] ✅ Composite done in ${Date.now() - start}ms → ${outPath} (${(outSize / 1024).toFixed(1)} KB)`);
    return outPath;
  } finally {
    if (fs.existsSync(tempBgPath)) fs.unlinkSync(tempBgPath);
    if (fs.existsSync(tempProdPath)) fs.unlinkSync(tempProdPath);
  }
}

// 4. Harmonize the composited image using Fal.ai Flux Image-to-Image
export async function harmonizeImage(
  compositedUrl: string,
  prompt: string,
  negativePrompt: string
): Promise<string> {
  if (!process.env.FAL_KEY) {
    throw new Error('FAL_KEY is not configured.');
  }

  console.log(`[COMPOSITOR/HARMONIZE] Starting Flux img2img harmonization...`);
  console.log(`[COMPOSITOR/HARMONIZE]   Input: ${compositedUrl.substring(0, 80)}...`);
  console.log(`[COMPOSITOR/HARMONIZE]   Prompt: "${prompt.substring(0, 100)}..."`);
  console.log(`[COMPOSITOR/HARMONIZE]   Strength: 0.18, Steps: 28, Guidance: 3.5`);
  const start = Date.now();

  const response = await axios.post(
    'https://fal.run/fal-ai/flux/dev/image-to-image',
    {
      image_url: compositedUrl,
      prompt: `${prompt}, realistic shadows, product lighting integration, soft shadows, photo-realistic`,
      strength: 0.18, 
      guidance_scale: 3.5,
      num_inference_steps: 28,
      enable_safety_checker: true,
      sync_mode: true,
    },
    {
      headers: {
        'Authorization': `Key ${process.env.FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 45000,
    }
  );

  if (response.data && response.data.images && response.data.images[0]) {
    console.log(`[COMPOSITOR/HARMONIZE] ✅ Harmonized in ${Date.now() - start}ms → ${response.data.images[0].url.substring(0, 80)}...`);
    return response.data.images[0].url;
  }

  console.error(`[COMPOSITOR/HARMONIZE] ❌ Unexpected response:`, JSON.stringify(response.data).substring(0, 300));
  throw new Error('Failed to harmonize image: ' + JSON.stringify(response.data));
}
