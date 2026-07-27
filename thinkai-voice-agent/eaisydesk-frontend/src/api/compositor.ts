// @ts-nocheck
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fal } from '@fal-ai/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// 2. Call local rembg Python script to remove background and isolate product
export async function removeBackground(imageUrl: string): Promise<string> {
  console.log(`[COMPOSITOR/REMBG] Starting background removal for: ${imageUrl.substring(0, 80)}...`);
  const start = Date.now();

  const rendersDir = path.resolve(__dirname, '../renders');
  if (!fs.existsSync(rendersDir)) {
    fs.mkdirSync(rendersDir, { recursive: true });
  }

  let inputPath = imageUrl;
  let isTemp = false;

  // Resolve source image path
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    if (imageUrl.includes('/renders/')) {
      const parts = imageUrl.split('/renders/');
      const filename = parts[parts.length - 1];
      inputPath = path.join(rendersDir, filename);
    } else {
      // Download remote image to a temp file
      inputPath = path.join(rendersDir, `downloaded-temp-${Date.now()}.png`);
      console.log(`[COMPOSITOR/REMBG] Downloading remote image for local processing to: ${inputPath}`);
      await downloadImage(imageUrl, inputPath);
      isTemp = true;
    }
  } else if (imageUrl.startsWith('/renders/') || imageUrl.startsWith('renders/')) {
    const filename = path.basename(imageUrl);
    inputPath = path.join(rendersDir, filename);
  } else {
    // Treat as absolute or relative local path directly
    inputPath = path.resolve(imageUrl);
  }

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input image file not found at: ${inputPath}`);
  }

  const timestamp = Date.now();
  const outputFilename = `rembg-${timestamp}.png`;
  const outputPath = path.join(rendersDir, outputFilename);
  const scriptPath = path.resolve(process.cwd(), 'remove_bg.py');

  try {
    const cmd = `python "${scriptPath}" "${inputPath}" "${outputPath}"`;
    console.log(`[COMPOSITOR/REMBG] Executing local Python rembg script...`);
    await execPromise(cmd);
  } catch (err: any) {
    console.log(`[COMPOSITOR/REMBG] Python execution failed, trying fallback 'py' command...`);
    const fallbackCmd = `py "${scriptPath}" "${inputPath}" "${outputPath}"`;
    await execPromise(fallbackCmd);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error('Background removal failed: output file was not created.');
  }

  // Clean up downloaded temp file if needed
  if (isTemp && fs.existsSync(inputPath)) {
    try {
      fs.unlinkSync(inputPath);
    } catch (e: any) {
      console.warn(`[COMPOSITOR/REMBG] Could not remove temp input file: ${e.message}`);
    }
  }

  const duration = Date.now() - start;
  console.log(`[COMPOSITOR/REMBG] ✅ Background removed locally in ${duration}ms → /renders/${outputFilename}`);
  return `/renders/${outputFilename}`;
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

// 5. Mathematically resize a low-res mask to match the upscaled image dimensions and apply it as the alpha channel
export async function applyLowResMaskToUpscaled(
  upscaledUrl: string,
  maskUrl: string,
  rendersDir: string
): Promise<string> {
  console.log(`[COMPOSITOR/MASK] Applying low-res mask to upscaled image`);
  console.log(`[COMPOSITOR/MASK]   Upscaled: ${upscaledUrl.substring(0, 80)}...`);
  console.log(`[COMPOSITOR/MASK]   Mask URL: ${maskUrl.substring(0, 80)}...`);
  const start = Date.now();

  const tempUpscaledPath = path.join(rendersDir, `temp-up-${Date.now()}.png`);
  const tempMaskPath = path.join(rendersDir, `temp-mask-${Date.now()}.png`);
  const outPath = path.join(rendersDir, `masked-upscaled-${Date.now()}.png`);

  try {
    if (!fs.existsSync(rendersDir)) {
      fs.mkdirSync(rendersDir, { recursive: true });
    }

    console.log(`[COMPOSITOR/MASK] Downloading upscaled image...`);
    await downloadImage(upscaledUrl, tempUpscaledPath);
    console.log(`[COMPOSITOR/MASK] Downloading mask image...`);
    await downloadImage(maskUrl, tempMaskPath);

    const upscaledMetadata = await sharp(tempUpscaledPath).metadata();
    const width = upscaledMetadata.width || 2048;
    const height = upscaledMetadata.height || 2048;
    console.log(`[COMPOSITOR/MASK] Upscaled dimensions: ${width}x${height}`);

    const resizedMaskBuffer = await sharp(tempMaskPath)
      .ensureAlpha()
      .extractChannel('alpha')
      .resize(width, height, { fit: 'fill' })
      .toBuffer();

    await sharp(tempUpscaledPath)
      .removeAlpha()
      .joinChannel(resizedMaskBuffer)
      .png()
      .toFile(outPath);

    const outSize = fs.statSync(outPath).size;
    console.log(`[COMPOSITOR/MASK] ✅ Mask applied successfully in ${Date.now() - start}ms → ${outPath} (${(outSize / 1024).toFixed(1)} KB)`);
    return outPath;
  } finally {
    if (fs.existsSync(tempUpscaledPath)) {
      try { fs.unlinkSync(tempUpscaledPath); } catch {}
    }
    if (fs.existsSync(tempMaskPath)) {
      try { fs.unlinkSync(tempMaskPath); } catch {}
    }
  }
}

// 6. Perform a local high-quality 4x Lanczos upscale as a fallback for Fal.ai
// 6. Perform a local high-quality 4x AI upscale using Real-ESRGAN-ncnn-vulkan via Python
export async function localUpscale(imageUrl: string, maskUrl: string | null): Promise<string> {
  console.log(`[LOCAL-UPSCALE] Starting local 4x AI Real-ESRGAN upscale for: ${imageUrl}`);
  const start = Date.now();
  
  const rendersDir = path.resolve(__dirname, '../renders');
  if (!fs.existsSync(rendersDir)) {
    fs.mkdirSync(rendersDir, { recursive: true });
  }

  // Resolve source image path
  let inputPath = imageUrl;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    if (imageUrl.includes('/renders/')) {
      const parts = imageUrl.split('/renders/');
      const filename = parts[parts.length - 1];
      inputPath = path.join(rendersDir, filename);
    } else {
      inputPath = path.join(rendersDir, `download-temp-up-${Date.now()}.png`);
      await downloadImage(imageUrl, inputPath);
    }
  } else if (imageUrl.startsWith('/renders/') || imageUrl.startsWith('renders/')) {
    const filename = path.basename(imageUrl);
    inputPath = path.join(rendersDir, filename);
  } else {
    inputPath = path.resolve(imageUrl);
  }

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input image file not found: ${inputPath}`);
  }

  const timestamp = Date.now();
  const tempUpscaledFilename = `upscaled-temp-${timestamp}.png`;
  const tempUpscaledPath = path.join(rendersDir, tempUpscaledFilename);
  const outputFilename = `upscaled-local-${timestamp}.png`;
  const outputPath = path.join(rendersDir, outputFilename);
  const scriptPath = path.resolve(process.cwd(), 'upscale_local.py');

  // Run the local Python upscaler script (which downloads & runs realesrgan-ncnn-vulkan)
  try {
    const cmd = `python "${scriptPath}" "${inputPath}" "${tempUpscaledPath}"`;
    console.log(`[LOCAL-UPSCALE] Executing local Python upscaler script...`);
    await execPromise(cmd);
  } catch (err: any) {
    console.log(`[LOCAL-UPSCALE] Python execution failed, trying fallback 'py' command...`);
    const fallbackCmd = `py "${scriptPath}" "${inputPath}" "${tempUpscaledPath}"`;
    await execPromise(fallbackCmd);
  }

  if (!fs.existsSync(tempUpscaledPath)) {
    throw new Error('Local AI upscaler script completed but output file was not found.');
  }

  // If maskUrl (preprocessed transparent cutout) is provided, combine it to retain transparency
  if (maskUrl) {
    // Resolve mask path
    let maskPath = maskUrl;
    if (maskUrl.startsWith('http://') || maskUrl.startsWith('https://')) {
      if (maskUrl.includes('/renders/')) {
        const parts = maskUrl.split('/renders/');
        const filename = parts[parts.length - 1];
        maskPath = path.join(rendersDir, filename);
      } else {
        maskPath = path.join(rendersDir, `download-temp-mask-${Date.now()}.png`);
        await downloadImage(maskUrl, maskPath);
      }
    } else if (maskUrl.startsWith('/renders/') || maskUrl.startsWith('renders/')) {
      const filename = path.basename(maskUrl);
      maskPath = path.join(rendersDir, filename);
    } else {
      maskPath = path.resolve(maskUrl);
    }
    
    if (fs.existsSync(maskPath)) {
      console.log(`[LOCAL-UPSCALE] Applying local mask: ${maskPath}`);
      // Get dimensions of the upscaled image using sharp
      const upscaledMetadata = await sharp(tempUpscaledPath).metadata();
      const width = upscaledMetadata.width || 2048;
      const height = upscaledMetadata.height || 2048;

      const resizedMaskBuffer = await sharp(maskPath)
        .ensureAlpha()
        .extractChannel('alpha')
        .resize(width, height, { fit: 'fill' })
        .toBuffer();

      await sharp(tempUpscaledPath)
        .removeAlpha()
        .joinChannel(resizedMaskBuffer)
        .png()
        .toFile(outputPath);
        
      // Clean up downloaded mask if it was temporary
      if (maskUrl.startsWith('http') && !maskUrl.includes('/renders/') && fs.existsSync(maskPath)) {
        try { fs.unlinkSync(maskPath); } catch {}
      }
    } else {
      // Just rename/move tempUpscaledPath to outputPath
      fs.renameSync(tempUpscaledPath, outputPath);
    }
  } else {
    // Just rename/move tempUpscaledPath to outputPath
    fs.renameSync(tempUpscaledPath, outputPath);
  }

  // Clean up downloaded input if it was temporary
  if (imageUrl.startsWith('http') && !imageUrl.includes('/renders/') && fs.existsSync(inputPath)) {
    try { fs.unlinkSync(inputPath); } catch {}
  }
  // Clean up temporary upscaled file if it still exists (in case it wasn't renamed)
  if (fs.existsSync(tempUpscaledPath)) {
    try { fs.unlinkSync(tempUpscaledPath); } catch {}
  }

  console.log(`[LOCAL-UPSCALE] ✅ Local upscale complete in ${Date.now() - start}ms -> /renders/${outputFilename}`);
  return `/renders/${outputFilename}`;
}


