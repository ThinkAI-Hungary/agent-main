import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { BrandKit } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RENDER_DIR = path.resolve(__dirname, '../renders');
const TEMPLATE_DIR = path.resolve(__dirname, 'templates');

// Ensure renders directory exists
if (!fs.existsSync(RENDER_DIR)) {
  fs.mkdirSync(RENDER_DIR, { recursive: true });
}

/**
 * Simplified renderer: loads the Flux-generated image full-bleed
 * and stamps the brand logo in the corner. No text overlays.
 */
export async function renderPost(
  variant: { templateId: string; logoVariant: string; [key: string]: any },
  brandKit: BrandKit,
  imageUrl?: string
): Promise<string> {
  console.log(`[RENDERER] Starting logo-overlay render (template="${variant.templateId}")`);
  const start = Date.now();
  const browser = await chromium.launch({ headless: true });
  console.log(`[RENDERER] Browser launched in ${Date.now() - start}ms`);
  
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1080, height: 1350 });

    // Always use universal template (logo-only overlay)
    const templatePath = path.join(TEMPLATE_DIR, 'universal.html');
    console.log(`[RENDERER] Template: ${templatePath}`);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Universal template not found at ${templatePath}`);
    }

    await page.goto(`file://${templatePath}`);

    const imageToUse = imageUrl || variant.imageUrl || '';

    // Apply brand kit styles: logo position, colors, font, and image
    await page.evaluate(({ brandKit, variant, imageToUse }) => {
      // 1. CSS variables
      document.documentElement.style.setProperty('--primary-color', brandKit.colors.primary);
      document.documentElement.style.setProperty('--secondary-color', brandKit.colors.secondary);
      document.documentElement.style.setProperty('--accent-color', brandKit.colors.accent);
      document.documentElement.style.setProperty('--font-name', `'${brandKit.typography.fontName}'`);

      // 2. Load Google Font
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${brandKit.typography.fontName.replace(/ /g, '+')}:wght@400;600;700;800&display=swap`;
      document.head.appendChild(link);

      // 3. Logo position and color
      const logoSlot = document.getElementById('logo-slot');
      if (logoSlot) {
        logoSlot.className = 'logo-container';
        logoSlot.classList.add(`position-${brandKit.logoPosition}`);
        
        const logoColor = variant.logoVariant === 'light' 
          ? '#FFFFFF'
          : brandKit.colors.primary;
        
        logoSlot.querySelectorAll('svg, path, line, circle').forEach(el => {
          el.setAttribute('stroke', logoColor);
          if (el.tagName.toLowerCase() !== 'svg' && el.tagName.toLowerCase() !== 'line') {
            el.setAttribute('fill', logoColor);
          }
        });
        const logoText = logoSlot.querySelector('.logo-text');
        if (logoText) {
          (logoText as HTMLElement).innerText = 'ANNA';
          (logoText as HTMLElement).style.color = logoColor;
        }
      }

      // 4. Set background image (full-bleed, Flux-generated with text baked in)
      const imageSlot = document.getElementById('image-slot') as HTMLImageElement;
      if (imageSlot && imageToUse) {
        imageSlot.src = imageToUse;
      }
    }, { brandKit, variant, imageToUse });

    // Wait for fonts
    await page.evaluate(() => document.fonts.ready);

    // Wait for image load
    if (imageToUse) {
      await page.evaluate(async () => {
        const img = document.getElementById('image-slot') as HTMLImageElement;
        if (!img) return;
        if (img.complete) return;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
      }).catch(err => {
        console.warn('[RENDERER] Image load warning:', err);
      });
    }

    // Screenshot
    const filename = `render-${Date.now()}-${Math.floor(Math.random() * 10000)}.png`;
    const outputPath = path.join(RENDER_DIR, filename);
    console.log(`[RENDERER] Taking screenshot...`);
    await page.screenshot({ path: outputPath, type: 'png' });
    const outSize = fs.statSync(outputPath).size;
    console.log(`[RENDERER] ✅ Render complete in ${Date.now() - start}ms → /renders/${filename} (${(outSize / 1024).toFixed(1)} KB)`);

    return `/renders/${filename}`;
  } catch (error: any) {
    console.error(`[RENDERER] ❌ Error: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
}

export async function renderPolotnoJSON(json: any): Promise<string> {
  console.log(`[RENDERER] Starting PolotnoJSON render (${json.width}x${json.height})`);
  const start = Date.now();
  const browser = await chromium.launch({ headless: true });
  
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: json.width, height: json.height });

    const templatePath = path.join(TEMPLATE_DIR, 'polotno.html');
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Polotno template not found at ${templatePath}`);
    }

    await page.goto(`file://${templatePath}`);

    // Call page render
    await page.evaluate(async (polotnoData) => {
      await (window as any).renderPolotno(polotnoData);
    }, json);

    // Give a buffer time for any rendering to settle
    await page.waitForTimeout(200);

    const filename = `overlay-render-${Date.now()}-${Math.floor(Math.random() * 10000)}.png`;
    const outputPath = path.join(RENDER_DIR, filename);
    await page.screenshot({ path: outputPath, type: 'png' });
    const outSize = fs.statSync(outputPath).size;
    console.log(`[RENDERER] ✅ Polotno Render complete in ${Date.now() - start}ms → /renders/${filename} (${(outSize / 1024).toFixed(1)} KB)`);

    return `/renders/${filename}`;
  } catch (error: any) {
    console.error(`[RENDERER] ❌ Polotno Render Error: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
}

