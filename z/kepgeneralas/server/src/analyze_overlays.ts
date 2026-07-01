import { buildLayerTemplates } from '../../../../thinkai-voice-agent/eaisydesk-frontend/src/pages/marketing/zombo/layerTemplates';
import * as fs from 'fs';

const primaryColor = '#1a1a2e';
const accentColor = '#f59e0b';
const fontName = 'Inter';

const templates = buildLayerTemplates(primaryColor, accentColor, fontName);

const productPositions = [
  { name: 'Centered Product (600x600 at center)', x: 240, y: 375, width: 600, height: 600 },
  { name: 'Lower-Center Product (600x600 at bottom/center)', x: 240, y: 500, width: 600, height: 600 }
];

let output = '=== OVERLAY COVERAGE ANALYSIS ===\n\n';

templates.forEach((template, index) => {
  const overlayNum = index + 1;
  output += `Overlay ${overlayNum}: ${template.name} (${template.id})\n`;
  
  let hasCover = false;
  template.layers.forEach((layer, layerIdx) => {
    productPositions.forEach(prod => {
      const layerX2 = layer.x + layer.width;
      const layerHeight = layer.height ?? (layer.type === 'text' ? (layer.fontSize ? layer.fontSize * 2 : 100) : 0);
      const layerY2 = layer.y + layerHeight;
      
      const prodX2 = prod.x + prod.width;
      const prodY2 = prod.y + prod.height;
      
      const overlapW = Math.max(0, Math.min(layerX2, prodX2) - Math.max(layer.x, prod.x));
      const overlapH = Math.max(0, Math.min(layerY2, prodY2) - Math.max(layer.y, prod.y));
      const overlapArea = overlapW * overlapH;
      const prodArea = prod.width * prod.height;
      const overlapPct = (overlapArea / prodArea) * 100;
      
      if (overlapPct > 30) {
        const opacity = layer.opacity ?? 1;
        const fill = layer.fill || '';
        const isTranslucent = (fill.startsWith('rgba') && parseFloat(fill.split(',')[3] || '1') < 0.4) || fill.includes('transparent');
        
        output += `  - Layer ${layerIdx} (${layer.type} ${layer.subType || ''}) covers ${overlapPct.toFixed(1)}% of ${prod.name}\n`;
        output += `    Opacity: ${opacity}, Fill: ${fill}, IsTranslucent: ${isTranslucent}\n`;
        hasCover = true;
      }
    });
  });
  if (!hasCover) {
    output += '  (No significant product coverage)\n';
  }
  output += '\n';
});

fs.writeFileSync('analysis.txt', output, 'utf-8');
console.log('Analysis written to analysis.txt');
