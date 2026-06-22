import { hexToRgb, typography } from './tokens';

/**
 * Deterministically wraps text based on word boundaries and a character-width approximation.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number
): string[] {
  // Proportional character width factor (approx 0.52 of font size for sans-serifs)
  const charWidth = fontSize * 0.52;
  const maxCharsPerLine = Math.max(1, Math.floor(maxWidth / charWidth));
  
  // Split by explicit newlines first
  const paragraphs = text.split('\n');
  const allLines: string[] = [];
  
  for (const para of paragraphs) {
    const words = para.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      if (!word) continue;
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (testLine.length > maxCharsPerLine) {
        if (currentLine) {
          allLines.push(currentLine);
          currentLine = word;
        } else {
          // Single word exceeds line width, force it on this line anyway
          allLines.push(word);
          currentLine = '';
        }
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      allLines.push(currentLine);
    }
  }
  
  return allLines;
}

/**
 * Bounded text auto-sizing algorithm.
 * Starts from startFontSize and falls back down the modular scale steps
 * if the text overflows max lines or box height.
 */
export function autoFit(
  text: string,
  boxWidth: number,
  boxHeight: number,
  startSizeName: 'display' | 'headline' | 'subhead' | 'body' | 'caption' | 'micro',
  minSizeName: 'display' | 'headline' | 'subhead' | 'body' | 'caption' | 'micro',
  maxLines: number
): { fontSize: number; lineHeight: number; lines: string[]; height: number } {
  
  const scaleOrder: ('display' | 'headline' | 'subhead' | 'body' | 'caption' | 'micro')[] = [
    'display', 'headline', 'subhead', 'body', 'caption', 'micro'
  ];
  
  let currentIndex = scaleOrder.indexOf(startSizeName);
  const minIndex = scaleOrder.indexOf(minSizeName);
  
  let bestResult = {
    fontSize: typography[startSizeName].size,
    lineHeight: typography[startSizeName].lineHeight,
    lines: [] as string[],
    height: 0
  };
  
  while (currentIndex <= minIndex) {
    const sizeName = scaleOrder[currentIndex];
    const { size, lineHeight } = typography[sizeName];
    const wrappedLines = wrapText(text, boxWidth, size);
    const textHeight = wrappedLines.length * size * lineHeight;
    
    bestResult = {
      fontSize: size,
      lineHeight,
      lines: wrappedLines,
      height: textHeight
    };
    
    // Check constraints
    if (wrappedLines.length <= maxLines && textHeight <= boxHeight) {
      return bestResult;
    }
    
    // Scale down
    currentIndex++;
  }
  
  // Return the smallest size result even if it still doesn't fit (fallback truncation/rendering)
  return bestResult;
}

/**
 * Calculates the 20-number SVG feColorMatrix string to map grayscale tones
 * between a dark color and a light color.
 */
export function calculateDuotoneMatrix(lightHex: string, darkHex: string): string {
  const light = hexToRgb(lightHex);
  const dark = hexToRgb(darkHex);
  
  // The weights for grayscale conversion (rec709 luminance weights)
  const rWeight = 0.2126;
  const gWeight = 0.7152;
  const bWeight = 0.0722;
  
  const rDelta = (light.r - dark.r) / 255;
  const gDelta = (light.g - dark.g) / 255;
  const bDelta = (light.b - dark.b) / 255;
  
  const rOffset = dark.r / 255;
  const gOffset = dark.g / 255;
  const bOffset = dark.b / 255;
  
  return [
    rDelta * rWeight, rDelta * gWeight, rDelta * bWeight, 0, rOffset,
    gDelta * rWeight, gDelta * gWeight, gDelta * bWeight, 0, gOffset,
    bDelta * rWeight, bDelta * gWeight, bDelta * bWeight, 0, bOffset,
    0, 0, 0, 1, 0
  ].join(' ');
}
