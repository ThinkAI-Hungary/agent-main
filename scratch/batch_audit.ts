import { buildLayerTemplates } from '../thinkai-voice-agent/eaisydesk-frontend/src/pages/marketing/zombo/layerTemplates';
import { normalizeLayers } from '../thinkai-voice-agent/eaisydesk-frontend/src/pages/marketing/zombo/layerNormalizer';
import fs from 'fs';

const primary = "#0067b1";
const accent = "#ff9900";
const font = "Inter";

const templates = buildLayerTemplates(primary, accent, font);
const testImage = "http://localhost:3001/renders/rembg-1783091521481.png";
const testText = "30% akció mindenre májusban";
const testCta = "VÁSÁROLJ MOST";

async function runAudit() {
  console.log("Starting Batch Audit...");
  
  for (const template of templates) {
    console.log(`Processing ${template.id}...`);
    
    // 1. Inject text into template layers
    let layers = template.layers.map(l => ({ ...l }));
    const textLayers = layers.filter(l => l.type === 'text').sort((a, b) => (b.fontSize || 0) - (a.fontSize || 0));
    
    if (textLayers.length > 0) {
        textLayers[0].text = testText;
        if (textLayers.length > 1 && testCta) {
            // Find the smallest text layer for CTA
            textLayers[textLayers.length - 1].text = testCta.toUpperCase();
        }
    }

    // 2. Normalize
    const analysis = { subject: "paint bucket", imageType: "product-centered" };
    const { layers: normalizedLayers } = normalizeLayers(template, layers, analysis);

    // 3. Build Polotno JSON
    const layoutJson = {
      width: 1080,
      height: 1350,
      pages: [{
        background: '#000000',
        children: [
          { type: 'image', src: testImage, x: 0, y: 0, width: 1080, height: 1350, opacity: 1 },
          ...normalizedLayers
        ]
      }]
    };

    // 4. Render
    try {
      const resp = await fetch("http://localhost:3001/api/render-polotno", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ layoutJson })
      });
      const data: any = await resp.json();
      const remoteUrl = data.imageUrl;
      console.log(`Rendered ${template.id}: ${remoteUrl}`);
      
      // Save info for model
      fs.appendFileSync("audit_results.txt", `${template.id}|${remoteUrl}\n`);
    } catch (err) {
      console.error(`Failed ${template.id}:`, err.message);
    }
  }
}

runAudit();
