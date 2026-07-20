import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Box {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

interface PlacidPosition {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

interface PlacidLayer {
  name: string;
  type: string;
  position: PlacidPosition;
  style: Record<string, any>;
  text?: string;
}

interface RenderParams {
  width: number;
  height: number;
  layers: PlacidLayer[];
  layerValues: Record<string, string>;
  baseImageUrl: string;
  productImageUrl?: string;
  useCutoutOnly?: boolean;
  imageMappings?: Record<string, 'base' | 'product' | 'none'>;
  productPosition?: {
    left: number;
    top: number;
    width: number;
    height: number;
    normalized: Box;
  } | null;
  parsedRequirements?: Record<string, any>;
}

function kebabCase(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function styleObjectToString(style: Record<string, any>): string {
  return Object.entries(style)
    .map(([key, val]) => {
      if (key === 'zIndex') return `z-index: ${val}`;
      return `${kebabCase(key)}: ${val}`;
    })
    .join('; ');
}

function resolveImageUrl(url: string, port: number = 3001): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const cleanUrl = url.startsWith('/') ? url : `/${url}`;
  return `http://localhost:${port}${cleanUrl}`;
}

// Helper function to check if a picture layer is a background layer
function isBackgroundLayer(layer: PlacidLayer, index: number): boolean {
  if (layer.type !== 'picture') return false;
  const nameLower = layer.name.toLowerCase();
  
  if (
    nameLower === 'bg' ||
    nameLower === 'background' ||
    nameLower === 'bg_img' ||
    nameLower === 'bg_image' ||
    nameLower === 'bg_mesh' ||
    nameLower === 'background_image' ||
    nameLower === 'pattern_bg' ||
    nameLower === 'texture' ||
    nameLower === 'carton'
  ) {
    return true;
  }
  
  const pos = layer.position || {};
  const isFullScreen = 
    pos.xmin === 0 && 
    pos.ymin === 0 && 
    pos.xmax === 100 && 
    pos.ymax === 100;
  if (isFullScreen) {
    return true;
  }
  
  if (
    (nameLower === 'img' || nameLower === 'image' || nameLower === 'photo' || nameLower === 'picture' || nameLower === 'main') &&
    index === 0
  ) {
    return true;
  }
  
  return false;
}

export function parsePlacidFont(fontName: string): { fontFamily: string; fontWeight: string; fontStyle: string } {
  if (!fontName) return { fontFamily: 'sans-serif', fontWeight: '400', fontStyle: 'normal' };

  const nameLower = fontName.toLowerCase();
  let family = 'sans-serif';

  if (nameLower.startsWith('opensans')) {
    family = 'Open Sans';
  } else if (nameLower.startsWith('josefinsans')) {
    family = 'Josefin Sans';
  } else if (nameLower.startsWith('montserrat')) {
    family = 'Montserrat';
  } else if (nameLower.startsWith('lato')) {
    family = 'Lato';
  } else if (nameLower.startsWith('playfairdisplay')) {
    family = 'Playfair Display';
  } else if (nameLower.startsWith('raleway')) {
    family = 'Raleway';
  } else if (nameLower.startsWith('poppins')) {
    family = 'Poppins';
  } else if (nameLower.startsWith('roboto')) {
    family = 'Roboto';
  } else if (nameLower.startsWith('merriweather')) {
    family = 'Merriweather';
  } else if (nameLower.startsWith('oswald')) {
    family = 'Oswald';
  } else if (nameLower.startsWith('firasans')) {
    family = 'Fira Sans';
  } else if (nameLower.startsWith('lora')) {
    family = 'Lora';
  } else if (nameLower.startsWith('nunito')) {
    family = 'Nunito';
  } else if (nameLower.startsWith('quicksand')) {
    family = 'Quicksand';
  } else {
    const cleanName = nameLower.split('-')[0];
    family = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  }

  let weight = '400';
  let style = 'normal';

  if (nameLower.includes('extrabold') || nameLower.includes('black') || nameLower.includes('900') || nameLower.includes('ultrabold')) {
    weight = '800';
  } else if (nameLower.includes('bold') || nameLower.includes('700')) {
    weight = '700';
  } else if (nameLower.includes('semibold') || nameLower.includes('600')) {
    weight = '600';
  } else if (nameLower.includes('medium') || nameLower.includes('500')) {
    weight = '500';
  } else if (nameLower.includes('light') || nameLower.includes('300')) {
    weight = '300';
  }

  if (nameLower.includes('italic')) {
    style = 'italic';
  }

  return {
    fontFamily: `"${family}", sans-serif`,
    fontWeight: weight,
    fontStyle: style
  };
}

export async function renderLocalPlacid(params: RenderParams, port: number = 3001): Promise<string> {
  const { width, height, layers, layerValues, baseImageUrl, productImageUrl, useCutoutOnly, imageMappings, productPosition, parsedRequirements } = params;

  console.log(`[LOCAL-RENDER] Starting local template render: ${width}x${height} with ${layers.length} layers.`);

  const resolvedBaseImage = resolveImageUrl(baseImageUrl, port);
  const resolvedProductImage = productImageUrl ? resolveImageUrl(productImageUrl, port) : '';

  // Calculate product center from normalized position for background crop centering
  let productCenterX = 50;
  let productCenterY = 50;
  if (productPosition?.normalized) {
    const box = productPosition.normalized;
    productCenterX = Math.round((box.xmin + box.xmax) / 2);
    productCenterY = Math.round((box.ymin + box.ymax) / 2);
    console.log(`[LOCAL-RENDER] Centering background crops around product coordinates: ${productCenterX}% ${productCenterY}%`);
  }

  let layersHtml = '';
  const sortedLayers = [...layers].sort((a, b) => (a.style.zIndex || 0) - (b.style.zIndex || 0));

  // Collect unique fonts to import
  const fontNames = new Set<string>();

  for (const layer of sortedLayers) {
    const left = `${layer.position.xmin}%`;
    const top = `${layer.position.ymin}%`;
    const w = `${layer.position.xmax - layer.position.xmin}%`;
    const h = `${layer.position.ymax - layer.position.ymin}%`;

    let layerStyleStr = styleObjectToString(layer.style);

    if (layer.type === 'text') {
      const textContent = layerValues[layer.name] !== undefined ? layerValues[layer.name] : (layer.text || 'dummy text');
      
      // Parse and override fonts
      if (layer.style.fontFamily) {
        const parsedFont = parsePlacidFont(layer.style.fontFamily);
        const fontStyles = `font-family: ${parsedFont.fontFamily}; font-weight: ${parsedFont.fontWeight}; font-style: ${parsedFont.fontStyle}`;
        layerStyleStr = `${layerStyleStr}; ${fontStyles}`;

        const cleanName = parsedFont.fontFamily.replace(/"/g, '').split(',')[0].trim();
        if (cleanName && cleanName !== 'sans-serif') {
          fontNames.add(cleanName.replace(/\s+/g, '+'));
        }
      }

      // Sync textAlign with flex justifyContent
      let justifyContent = 'center';
      if (layer.style.textAlign === 'left') justifyContent = 'flex-start';
      if (layer.style.textAlign === 'right') justifyContent = 'flex-end';

      layersHtml += `
        <div class="layer-item text-layer" style="position: absolute; left: ${left}; top: ${top}; width: ${w}; height: ${h}; display: flex; align-items: center; justify-content: ${justifyContent}; box-sizing: border-box; padding: 0 8px; word-break: break-word; overflow: hidden; ${layerStyleStr}">
          <div style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; width: 100%; word-wrap: break-word; text-align: inherit;">
            ${textContent}
          </div>
        </div>
      `;
    } else if (layer.type === 'picture') {
      let imgSrc = resolvedBaseImage;
      const mapping = imageMappings ? imageMappings[layer.name] : null;

      if (mapping === 'product') {
        imgSrc = resolvedProductImage;
      } else if (mapping === 'none') {
        imgSrc = '';
      } else if (!mapping) {
        // Fallback to name-checking
        const isProductLayer = layer.name.includes('product') || layer.name.includes('item') || layer.name.includes('logo') || layer.name.includes('cutout');
        if (useCutoutOnly && isProductLayer && resolvedProductImage) {
          imgSrc = resolvedProductImage;
        }
      }

      const isProduct = mapping === 'product' || (!mapping && (layer.name.includes('product') || layer.name.includes('item')));
      const pictureLayers = layers.filter(l => l.type === 'picture');
      const isSingleImage = pictureLayers.length === 1;
      const isBg = isBackgroundLayer(layer, layers.indexOf(layer));
      
      // Force contain instead of cover if it is the only image OR if it is the background image
      const objectFit = (isSingleImage || isBg || isProduct) ? 'contain' : (layer.style.objectFit || 'cover');
      
      // Use dynamic crop centering for background cover images to prevent product cutoff
      const objectPosition = isProduct ? 'center' : `${productCenterX}% ${productCenterY}%`;

      // Apply CSS mask for gradient fade if specified in requirements
      let maskStyle = '';
      if (parsedRequirements && (parsedRequirements.fade_gradient === true || parsedRequirements.fade_pixels !== undefined)) {
        const fadePixels = parsedRequirements.fade_pixels ?? 100;
        const fadeDir = parsedRequirements.fade_direction ?? 'top';
        let gradDir = 'to bottom';
        if (fadeDir === 'bottom') gradDir = 'to top';
        if (fadeDir === 'left') gradDir = 'to right';
        if (fadeDir === 'right') gradDir = 'to left';
        
        const maskVal = `linear-gradient(${gradDir}, transparent, black ${fadePixels}px)`;
        maskStyle = `-webkit-mask-image: ${maskVal}; mask-image: ${maskVal};`;
      }

      const imgClass = (parsedRequirements?.background_gradient_to_dominant === true) ? 'class="source-image-for-dominant"' : '';
      layersHtml += `
        <div class="layer-item picture-layer" style="position: absolute; left: ${left}; top: ${top}; width: ${w}; height: ${h}; overflow: hidden; ${maskStyle} ${layerStyleStr}">
          ${imgSrc ? `<img ${imgClass} src="${imgSrc}" style="width: 100%; height: 100%; object-fit: ${objectFit}; object-position: ${objectPosition}; display: block;" />` : ''}
        </div>
      `;
    } else if (layer.type === 'shape') {
      const isBg = isBackgroundLayer(layer, layers.indexOf(layer)) || layer.name === 'background_layer';
      const bgIdAttr = (isBg && parsedRequirements?.background_gradient_to_dominant === true) ? 'id="background-gradient-dominant"' : '';
      layersHtml += `
        <div ${bgIdAttr} class="layer-item shape-layer" style="position: absolute; left: ${left}; top: ${top}; width: ${w}; height: ${h}; ${layerStyleStr}"></div>
      `;
    }
  }

  // Build fonts stylesheet url
  let fontsImportHtml = '';
  if (fontNames.size > 0) {
    const familiesParam = Array.from(fontNames)
      .map(name => `family=${name}:wght@300;400;500;600;700;800;900`)
      .join('&');
    fontsImportHtml = `<link href="https://fonts.googleapis.com/css2?${familiesParam}&display=swap" rel="stylesheet">`;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&family=Outfit:wght@400;700;800;900&display=swap" rel="stylesheet">
      ${fontsImportHtml}
      <style>
        body, html {
          margin: 0;
          padding: 0;
          width: ${width}px;
          height: ${height}px;
          overflow: hidden;
          font-family: 'Outfit', 'Inter', sans-serif;
          background: #ffffff;
        }
        .canvas-container {
          position: relative;
          width: ${width}px;
          height: ${height}px;
          overflow: hidden;
        }
        .layer-item {
          pointer-events: none;
        }
      </style>
    </head>
    <body>
      <div class="canvas-container">
        ${layersHtml}
      </div>
      ${parsedRequirements?.background_gradient_to_dominant === true ? `
      <script>
        window.addEventListener('DOMContentLoaded', () => {
          const imgEl = document.querySelector('.source-image-for-dominant');
          const bgEl = document.getElementById('background-gradient-dominant');
          if (imgEl && bgEl) {
            const getDominant = () => {
              try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 50;
                canvas.height = 50;
                ctx.drawImage(imgEl, 0, 0, 50, 50);
                const imgData = ctx.getImageData(0, 0, 50, 50).data;
                
                let colorCounts = {};
                let maxCount = 0;
                let dominant = '#ffffff';
                
                for (let i = 0; i < imgData.length; i += 4) {
                  const r = imgData[i];
                  const g = imgData[i+1];
                  const b = imgData[i+2];
                  const a = imgData[i+3];
                  if (a < 100) continue;
                  
                  const maxVal = Math.max(r, g, b);
                  const minVal = Math.min(r, g, b);
                  const diff = maxVal - minVal;
                  
                  const qr = Math.round(r / 15) * 15;
                  const qg = Math.round(g / 15) * 15;
                  const qb = Math.round(b / 15) * 15;
                  const key = qr + ',' + qg + ',' + qb;
                  
                  const score = diff > 20 ? 3 : 1;
                  colorCounts[key] = (colorCounts[key] || 0) + score;
                  
                  if (colorCounts[key] > maxCount) {
                    maxCount = colorCounts[key];
                    
                    const toHex = (c) => {
                      const hex = Math.max(0, Math.min(255, c)).toString(16);
                      return hex.length === 1 ? "0" + hex : hex;
                    };
                    dominant = "#" + toHex(qr) + toHex(qg) + toHex(qb);
                  }
                }
                
                // Lighten color
                let r = parseInt(dominant.substring(1, 3), 16);
                let g = parseInt(dominant.substring(3, 5), 16);
                let b = parseInt(dominant.substring(5, 7), 16);
                
                r = Math.round(r + (255 - r) * 0.82);
                g = Math.round(g + (255 - g) * 0.82);
                b = Math.round(b + (255 - b) * 0.82);
                
                const toHex = (c) => {
                  const hex = c.toString(16);
                  return hex.length === 1 ? "0" + hex : hex;
                };
                const lightenedHex = "#" + toHex(r) + toHex(g) + toHex(b);
                
                const gradDir = "${parsedRequirements.background_gradient_direction || 'to bottom'}";
                bgEl.style.background = 'linear-gradient(' + gradDir + ', ' + lightenedHex + ', transparent)';
                console.log('[LOCAL-RENDER-DOMINANT] Applied dominant gradient background:', lightenedHex);
              } catch (e) {
                console.error('[LOCAL-RENDER-DOMINANT] Error extracting dominant color:', e);
              }
            };
            
            if (imgEl.complete) {
              getDominant();
            } else {
              imgEl.addEventListener('load', getDominant);
            }
          }
        });
      </script>
      ` : ''}
    </body>
    </html>
  `;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width, height }
  });
  const page = await context.newPage();

  try {
    await page.setContent(htmlContent, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const filename = `local-placid-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.jpg`;
    const rendersDir = path.resolve(__dirname, '../renders');
    if (!fs.existsSync(rendersDir)) {
      fs.mkdirSync(rendersDir, { recursive: true });
    }

    const outputPath = path.join(rendersDir, filename);
    await page.screenshot({
      path: outputPath,
      type: 'jpeg',
      quality: 90
    });

    console.log(`[LOCAL-RENDER] Screenshot saved to ${outputPath}`);
    return `/renders/${filename}`;

  } finally {
    await browser.close();
  }
}
