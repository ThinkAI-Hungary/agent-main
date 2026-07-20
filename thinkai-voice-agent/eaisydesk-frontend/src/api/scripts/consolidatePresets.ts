import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RawPresetItem {
  id: string;
  type: string;
  name: string;
  opacity: number;
  geometry: {
    position: { left: any; top: any };
    size: { width: any; height: any };
    rotation?: number;
  };
  fields: any;
  zIndex: number;
}

interface RawPresetFile {
  preset_id: number;
  title: string;
  cover: string;
  tags: string[];
  canvas: {
    canvasWidth: any;
    canvasHeight: any;
    fields: any;
  };
  items: RawPresetItem[];
}

interface ProcessedLayer {
  name: string;
  type: string;
  position: {
    xmin: number;
    xmax: number;
    ymin: number;
    ymax: number;
  };
  style: Record<string, any>;
  description: string;
  context_instruction: string;
}

interface ProcessedTemplate {
  uuid: string;
  title: string;
  thumbnail: string;
  tags: string[];
  resolution: {
    width: number;
    height: number;
  };
  layers: ProcessedLayer[];
}

function processColor(colorObj: any): string | undefined {
  if (!colorObj) return undefined;
  const color = colorObj.color || colorObj.content?.color;
  if (!color) return undefined;
  if (color.hex) return color.hex;
  if (color.rgba) {
    const { r, g, b, a } = color.rgba;
    return `rgba(${r},${g},${b},${a})`;
  }
  return undefined;
}

function processPresetItem(item: RawPresetItem, canvasWidth: number, canvasHeight: number): ProcessedLayer {
  // Parse all geometry parameters strictly as numbers to prevent string concatenation bugs
  const left = Number(item.geometry.position.left || 0);
  const top = Number(item.geometry.position.top || 0);
  const width = Number(item.geometry.size.width || 0);
  const height = Number(item.geometry.size.height || 0);

  const xmin = Math.round((left / canvasWidth) * 100);
  const xmax = Math.round(((left + width) / canvasWidth) * 100);
  const ymin = Math.round((top / canvasHeight) * 100);
  const ymax = Math.round(((top + height) / canvasHeight) * 100);

  const style: Record<string, any> = {};
  let type = 'shape';
  let desc = '';
  let instruction = '';
  let text: string | undefined = undefined;

  if (item.type === 'text') {
    type = 'text';
    const textField = item.fields?.text || {};
    const display = textField.display || {};
    const content = textField.content || {};

    style.color = processColor(item.fields?.color) || '#000000';
    style.fontSize = display.fontSize ? `${display.fontSize}px` : '24px';
    style.fontFamily = display.fontFamily || 'sans-serif';
    style.fontWeight = display.fontWeight || 'normal';
    style.textAlign = display.alignment || 'left';
    style.lineHeight = display.lineHeight || '1.2';
    style.textTransform = display.textTransform || 'none';
    style.letterSpacing = display.letterSpacing ? `${display.letterSpacing}px` : '0px';

    const textSample = content.text || '';
    text = textSample;
    desc = `Szöveg réteg "${item.name}" névvel. Kezdeti minta szövege: "${textSample}".`;
    instruction = `Módosítsd ezt a szöveget a kívánt feliratra. Figyelj a szövegdoboz méretére (${width}x${height}px).`;
  } else if (item.type === 'picture' || item.type === 'image') {
    type = 'picture';
    const imageField = item.fields?.image || {};
    const display = imageField.display || {};

    style.objectFit = display.backgroundSize || 'cover';
    style.borderRadius = display.borderRadius ? `${display.borderRadius}px` : '0px';
    style.objectPosition = 'center';

    desc = `Képkeret réteg "${item.name}" névvel, amely vizuális elemként vagy háttérként szolgál.`;
    instruction = `Cseréld le ezt a képet a saját képedre vagy illusztrációdra. Ajánlott felbontása követi a réteg arányait.`;
  } else {
    // Default shape/rectangle/circle
    type = 'shape';
    const bgCol = processColor(item.fields?.backgroundColor) || processColor(item.fields?.color);
    if (bgCol) {
      style.backgroundColor = bgCol;
    }
    
    // Check for border
    const shapeField = item.fields?.rectangle || item.fields?.circle || item.fields?.shape || {};
    const display = shapeField.display || {};
    if (display.borderWidth) {
      style.borderWidth = `${display.borderWidth}px`;
      style.borderStyle = 'solid';
      style.borderColor = processColor(item.fields?.borderColor) || '#000000';
    }
    style.borderRadius = display.borderRadius ? `${display.borderRadius}px` : '0px';

    desc = `Alakzat réteg ("${item.name}"), amely háttérként, keretként vagy elválasztóként funkcionál.`;
    instruction = `A színe és szegélye módosítható a márkád arculatának megfelelően.`;
  }

  // Add rotation if present
  if (item.geometry.rotation) {
    style.transform = `rotate(${item.geometry.rotation}deg)`;
  }

  // Ensure z-index is stored
  style.zIndex = item.zIndex || 1;

  return {
    name: item.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    type,
    position: { xmin, xmax, ymin, ymax },
    style,
    text,
    description: desc,
    context_instruction: instruction
  };
}

async function main() {
  console.log('[CONSOLIDATOR] Consolidating scraped presets...');

  const presetsDir = path.resolve(__dirname, '../data/presets');
  const targetFile = path.resolve(__dirname, '../data/placid_presets_library.json');

  if (!fs.existsSync(presetsDir)) {
    console.error(`[CONSOLIDATOR] Presets directory does not exist: ${presetsDir}`);
    return;
  }

  const files = fs.readdirSync(presetsDir).filter(f => f.startsWith('preset_') && f.endsWith('.json'));
  console.log(`[CONSOLIDATOR] Found ${files.length} preset files to process.`);

  const processedTemplates: ProcessedTemplate[] = [];

  for (const file of files) {
    const filePath = path.join(presetsDir, file);
    try {
      const presetData: RawPresetFile = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      const canvasWidth = Number(presetData.canvas.canvasWidth || 1200);
      const canvasHeight = Number(presetData.canvas.canvasHeight || 1200);

      // Base canvas background layer
      const layers: ProcessedLayer[] = [];
      const canvasBgColor = processColor(presetData.canvas.fields?.backgroundColor) || '#FFFFFF';
      
      layers.push({
        name: 'background_layer',
        type: 'shape',
        position: { xmin: 0, xmax: 100, ymin: 0, ymax: 100 },
        style: {
          backgroundColor: canvasBgColor,
          zIndex: 0
        },
        description: 'A sablon alap háttere, amely az egész tervezőfelületet kitölti.',
        context_instruction: 'Ez a réteg határozza meg a háttérszínt. Szükség esetén cseréld le.'
      });

      // Map other layers
      if (presetData.items && Array.isArray(presetData.items)) {
        // Sort items by zIndex/zIndex level from raw schema to preserve layering order
        const sortedItems = [...presetData.items].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
        
        for (const item of sortedItems) {
          try {
            const layer = processPresetItem(item, canvasWidth, canvasHeight);
            layers.push(layer);
          } catch (e: any) {
            console.log(`[CONSOLIDATOR] Skipped item "${item.name}" in preset ID ${presetData.preset_id}: ${e.message}`);
          }
        }
      }

      processedTemplates.push({
        uuid: `preset_${presetData.preset_id}`,
        title: presetData.title,
        thumbnail: presetData.cover,
        tags: presetData.tags || [],
        resolution: {
          width: canvasWidth,
          height: canvasHeight
        },
        layers
      });

    } catch (err: any) {
      console.error(`[CONSOLIDATOR] Failed to process file ${file}:`, err.message);
    }
  }

  // Save the result
  const finalLibrary = {
    templates: processedTemplates
  };

  fs.writeFileSync(targetFile, JSON.stringify(finalLibrary, null, 2));
  console.log(`[CONSOLIDATOR] Consolidated library saved to: ${targetFile}`);
  console.log(`[CONSOLIDATOR] Successfully processed ${processedTemplates.length} templates.`);
}

main();
