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

    // Select the correct template based on templateId
    let templateName = 'universal.html';
    if (['quote', 'product', 'testimonial', 'list', 'universal'].includes(variant.templateId)) {
      templateName = `${variant.templateId}.html`;
    }
    const templatePath = path.join(TEMPLATE_DIR, templateName);
    console.log(`[RENDERER] Template: ${templatePath}`);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found at ${templatePath}`);
    }

    await page.goto(`file://${templatePath}`);

    const imageToUse = imageUrl || variant.imageUrl || '';

    // Apply brand kit styles: logo position, colors, font, and image
    // Pass as a string to avoid ESBuild injecting transpile helpers (like __name) in page.evaluate
    await page.evaluate(`
      (function() {
        const brandKit = ${JSON.stringify(brandKit)};
        const variant = ${JSON.stringify(variant)};
        const imageToUse = ${JSON.stringify(imageToUse)};

        // 1. CSS variables
        document.documentElement.style.setProperty('--primary-color', brandKit.colors.primary);
        document.documentElement.style.setProperty('--secondary-color', brandKit.colors.secondary);
        document.documentElement.style.setProperty('--accent-color', brandKit.colors.accent);
        document.documentElement.style.setProperty('--font-name', "'" + brandKit.typography.fontName + "'");

        // 2. Load Google Font
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = "https://fonts.googleapis.com/css2?family=" + brandKit.typography.fontName.replace(/ /g, '+') + ":wght@400;600;700;800&display=swap";
        document.head.appendChild(link);

        // 3. Logo position and color
        const logoSlot = document.getElementById('logo-slot');
        if (logoSlot) {
          logoSlot.className = 'logo-container';
          const logoPos = variant.logoPosition || brandKit.logoPosition || 'top-left';
          logoSlot.classList.add("position-" + logoPos);
          
          const logoColor = variant.logoVariant === 'light' 
            ? '#FFFFFF'
            : brandKit.colors.primary;
          
          const isDarkLogo = variant.logoVariant === 'dark';
          logoSlot.style.display = 'flex';
          logoSlot.style.alignItems = 'center';
          logoSlot.style.gap = '10px';
          logoSlot.style.padding = '8px 16px';
          logoSlot.style.borderRadius = '8px';
          logoSlot.style.backgroundColor = isDarkLogo ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.45)';
          logoSlot.style.backdropFilter = 'blur(6px)';
          logoSlot.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          logoSlot.style.zIndex = '10';
          logoSlot.style.color = logoColor;
          logoSlot.style.transition = 'all 0.15s ease';
          
          // Check if the logo is NOT coffee-cup-minimal or coffee related
          const brandNameLower = (brandKit.name || '').toLowerCase();
          const isCup = brandKit.logoUrl === 'coffee-cup-minimal' || 
                        brandNameLower.includes('kávé') || 
                        brandNameLower.includes('coffee') || 
                        brandNameLower.includes('cafe') || 
                        brandNameLower.includes('latte');
          if (!isCup) {
            const svg = logoSlot.querySelector('svg');
            if (svg) {
              svg.innerHTML = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />';
            }
          }

          logoSlot.querySelectorAll('svg, path, line, circle, polygon').forEach(el => {
            el.setAttribute('stroke', logoColor);
            if (el.tagName.toLowerCase() !== 'svg' && el.tagName.toLowerCase() !== 'line') {
              el.setAttribute('fill', logoColor);
            }
          });
          const logoText = logoSlot.querySelector('.logo-text');
          if (logoText) {
            logoText.innerText = brandKit.name || 'Brand';
            logoText.style.color = logoColor;
          }
        }

        // 4. Set background image (full-bleed, Flux-generated with text baked in)
        const imageSlot = document.getElementById('image-slot');
        if (imageSlot && imageToUse) {
          imageSlot.src = imageToUse;
        }

        // 5. Inject text and CTA dynamic elements depending on template
        const textSlot = document.getElementById('text-slot');
        if (textSlot && variant.text) {
          textSlot.innerText = variant.text;
        }
        
        const ctaSlot = document.getElementById('cta-slot');
        if (ctaSlot) {
          if (variant.cta) {
            ctaSlot.innerText = variant.cta;
            ctaSlot.style.display = '';
          } else {
            ctaSlot.style.display = 'none';
          }
        }

        // 6. Apply Layer Editor adjustments dynamically
        const customImg = document.getElementById('image-slot');
        if (customImg && variant.bgBlur !== undefined) {
          customImg.style.filter = variant.bgBlur > 0 ? "blur(" + variant.bgBlur + "px)" : 'none';
        }

        const customOverlay = document.querySelector('.gradient-overlay') || document.querySelector('.vignette-overlay');
        if (customOverlay && variant.overlayOpacity !== undefined) {
          customOverlay.style.background = "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0," + variant.overlayOpacity + ") 100%)";
        }

        const customLogo = document.getElementById('logo-slot');
        if (customLogo && variant.logoSize !== undefined) {
          customLogo.style.transform = "scale(" + variant.logoSize + ")";
          const pos = variant.logoPosition || brandKit.logoPosition || 'top-left';
          customLogo.style.transformOrigin = pos.replace('-', ' ');
        }

        const getColor = (colorName) => {
          if (colorName === 'primary') return brandKit.colors.primary;
          if (colorName === 'secondary') return brandKit.colors.secondary;
          if (colorName === 'accent') return brandKit.colors.accent;
          if (colorName === 'white') return '#FFFFFF';
          if (colorName === 'black') return '#000000';
          return '';
        };

        const customText = document.getElementById('text-slot') || document.getElementById('title-slot');
        if (customText) {
          if (variant.fontSize !== undefined) {
            customText.style.fontSize = variant.fontSize + "px";
          }
          if (variant.textAlignment !== undefined) {
            customText.style.textAlign = variant.textAlignment;
          }
          if (variant.fontWeight !== undefined) {
            customText.style.fontWeight = variant.fontWeight;
          }
          if (variant.textColor && variant.textColor !== 'default') {
            const col = getColor(variant.textColor);
            if (col) {
              customText.style.color = col;
              const titleSlot = document.getElementById('title-slot');
              if (titleSlot) titleSlot.style.color = col;
            }
          }
        }

        const panelEl = document.querySelector('.info-panel, .quote-content, .testimonial-card, .content-panel');
        if (panelEl) {
          if (variant.panelBgColor && variant.panelBgColor !== 'default') {
            if (variant.panelBgColor === 'primary') panelEl.style.backgroundColor = brandKit.colors.primary;
            else if (variant.panelBgColor === 'secondary') panelEl.style.backgroundColor = brandKit.colors.secondary;
            else if (variant.panelBgColor === 'accent') panelEl.style.backgroundColor = brandKit.colors.accent;
            else if (variant.panelBgColor === 'none') panelEl.style.backgroundColor = 'transparent';
            else if (variant.panelBgColor === 'translucent-dark') panelEl.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
            else if (variant.panelBgColor === 'translucent-light') panelEl.style.backgroundColor = 'rgba(255, 255, 255, 0.65)';
          }
          if (variant.panelPadding !== undefined) {
            panelEl.style.padding = variant.panelPadding + "px";
          }
          if (variant.panelRadius !== undefined) {
            panelEl.style.borderRadius = variant.panelRadius + "px";
          }

          const posY = variant.textYOffset || 0;
          const posX = variant.textXOffset || 0;

          if (variant.panelPosition && variant.panelPosition !== 'relative') {
            panelEl.style.position = 'absolute';
            panelEl.style.left = '50%';
            if (variant.panelPosition === 'top') {
              panelEl.style.top = (60 + posY) + "px";
              panelEl.style.bottom = 'auto';
              panelEl.style.transform = "translateX(-50%) translateX(" + posX + "px)";
            } else if (variant.panelPosition === 'center') {
              panelEl.style.top = '50%';
              panelEl.style.bottom = 'auto';
              panelEl.style.transform = "translate(-50%, -50%) translate(" + posX + "px, " + posY + "px)";
            } else if (variant.panelPosition === 'bottom') {
              panelEl.style.bottom = (60 + posY) + "px";
              panelEl.style.top = 'auto';
              panelEl.style.transform = "translateX(-50%) translateX(" + posX + "px)";
            }
          } else {
            panelEl.style.position = 'relative';
            panelEl.style.transform = "translate(" + posX + "px, " + posY + "px)";
          }
        }

        const customCta = document.getElementById('cta-slot');
        if (customCta) {
          if (variant.ctaRadius !== undefined) {
            customCta.style.borderRadius = variant.ctaRadius + "px";
          }
          if (variant.ctaFontSize !== undefined) {
            customCta.style.fontSize = variant.ctaFontSize + "px";
          }
          if (variant.ctaBgColor && variant.ctaBgColor !== 'default') {
            const bgCol = getColor(variant.ctaBgColor);
            if (bgCol) {
              customCta.style.backgroundColor = bgCol;
              customCta.style.color = (variant.ctaBgColor === 'white' || variant.ctaBgColor === 'secondary') 
                ? brandKit.colors.primary 
                : '#FFFFFF';
            }
          }
          if (variant.ctaYOffset !== undefined) {
            customCta.style.marginTop = (24 + variant.ctaYOffset) + "px";
          }
        }

        // Special list template handling
        if (variant.templateId === 'list' && variant.text) {
          const lines = variant.text.split('\\n').filter(Boolean);
          const titleSlot = document.getElementById('title-slot');
          if (titleSlot && lines.length > 0) {
            titleSlot.innerText = lines[0];
          }
          const itemsSlot = document.getElementById('list-items-slot');
          if (itemsSlot) {
            itemsSlot.innerHTML = '';
            const listItems = lines.slice(1);
            listItems.forEach((itemText, idx) => {
              const cleanedText = itemText.replace(/^\\d+\\.\\s*/, '');
              const row = document.createElement('div');
              row.className = 'list-item-row';
              row.innerHTML = '<div class="list-badge">' + (idx + 1) + '</div><p class="list-text">' + cleanedText + '</p>';
              
              const badgeEl = row.querySelector('.list-badge');
              if (badgeEl) {
                badgeEl.style.width = '36px';
                badgeEl.style.height = '36px';
                badgeEl.style.borderRadius = '50%';
                badgeEl.style.backgroundColor = 'var(--accent-color)';
                badgeEl.style.color = '#fff';
                badgeEl.style.display = 'flex';
                badgeEl.style.alignItems = 'center';
                badgeEl.style.justifyContent = 'center';
                badgeEl.style.fontWeight = '700';
                badgeEl.style.fontSize = '18px';
                badgeEl.style.flexShrink = '0';
              }
              const textEl = row.querySelector('.list-text');
              if (textEl) {
                if (variant.fontSize !== undefined) {
                  textEl.style.fontSize = Math.round(variant.fontSize * 0.7) + "px";
                } else {
                  textEl.style.fontSize = '24px';
                }
                if (variant.fontWeight !== undefined) {
                  textEl.style.fontWeight = variant.fontWeight;
                }
                if (variant.textColor && variant.textColor !== 'default') {
                  const col = getColor(variant.textColor);
                  if (col) textEl.style.color = col;
                }
                textEl.style.lineHeight = '1.5';
              }
              row.style.display = 'flex';
              row.style.alignItems = 'flex-start';
              row.style.gap = '20px';
              itemsSlot.appendChild(row);
            });
          }
        }
      })()
    `);

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

