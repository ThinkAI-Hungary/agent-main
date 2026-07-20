// @ts-nocheck
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GeneratorBrandKit, OrchestratedVariant } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const modelName = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// Clean text to extract JSON array/object blocks
function extractJson(text: string): string {
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace !== -1) {
      return text.substring(firstBrace, lastBrace + 1);
    }
  } else if (firstBracket !== -1) {
    const lastBracket = text.lastIndexOf(']');
    if (lastBracket !== -1) {
      return text.substring(firstBracket, lastBracket + 1);
    }
  }
  return text;
}

export async function orchestrateOverlayVariants(
  brief: string,
  contentType: string,
  brandKit: GeneratorBrandKit,
  format: 'feed' | 'story',
  variantCount: number = 3
): Promise<OrchestratedVariant[]> {
  const systemPrompt = `You are an art director for Hungarian small-business social media content overlays.
You do NOT design layouts or output coordinates. You make semantic choices that a deterministic layout engine will render.

# HARD RULES
- Output ONLY valid JSON matching the schema. No prose, no markdown, no backticks.
- All copy MUST be in Hungarian, with correct spelling including Hungarian vowels ő and ű.
- Choose layout archetypes ONLY from A1–A9 (catalog below).
- NEVER output colors, sizes or coordinates. Refer to accent emphasis only.
- Respect the per-slot character budgets exactly. Shorter is better than truncated.
- Imagery default: source "stock" + mode "full-bleed". Use "generated" (Flux) ONLY when stock cannot deliver the concept.
- Never write text directly INTO the background image. The overlay layout renders text separately.

# ARCHETYPE CATALOG
- A1: Centered statement — quote, announcement, greeting. slots: headline, subhead?, cta?
- A2: Hero image + bottom band — product focus. slots: headline, subhead?, cta?
- A3: Split — product feature, before/after. slots: headline, body?
- A4: Full-bleed overlay — lifestyle, event. slots: headline, subhead?, cta?
- A5: Top/footer bar — hours, info, reopening. slots: footer_text
- A6: Big number/badge — discount, sale. slots: number, headline, terms?
- A7: Quote card — testimonial. slots: quote, author
- A8: List/grid — tips, "3 reasons". slots: title, items[2..4]
- A9: Story CTA (9:16 format only) — hook and call to action. slots: headline, subhead?, cta

# CHARACTER BUDGETS (hard max characters)
- A1: headline (50), subhead (60), cta (18)
- A2: headline (32), subhead (40), cta (18)
- A3: headline (32), body (160)
- A4: headline (48), subhead (32), cta (16)
- A5: footer_text (80)
- A6: number (5), headline (32), terms (60)
- A7: quote (160), author (30)
- A8: title (36), items (50 each)
- A9: headline (44), subhead (50), cta (18)

# LINGUISTIC RULES
- Use concise Hungarian. Prefer "Akció" over "Nagy tavaszi árleszállítás".
- Avoid breaking words. If a word is long (12+ chars), pick a shorter synonym.
- For A6 'number' slot: MUST be like "-30%", "2024", or "MOST". Max 5 chars.

# INPUT CONTEXT
Format: ${format}
Content Type: ${contentType}
Brand tone tags: ${brandKit.typography.fontName} theme
Brief/Goal: "${brief}"

# OUTPUT SCHEMA
You must return a JSON object containing a "variants" array:
{
  "variants": [
    {
      "archetype": "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A7" | "A8" | "A9",
      "rationale": "Brief English rationale explaining the choice.",
      "slots": {
        // key-value pairs of the required slots for the selected archetype.
        // e.g. for A6: { "number": "-30%", "headline": "Tavaszi Akció", "terms": "Március 31-ig" }
        // e.g. for A8: { "title": "3 tipp kávézáshoz", "items": ["Tipp 1", "Tipp 2", "Tipp 3"] }
      },
      "image": {
        "mode": "solid" | "framed" | "full-bleed",
        "source": "none" | "stock" | "generated",
        "queryOrPrompt": "English search keywords for stock images OR descriptive english prompt for generation"
      },
      "accentEmphasis": "low" | "medium" | "high"
    }
  ]
}

# DIVERSITY CONSTRAINT
You must produce exactly ${variantCount} variants. They MUST differ meaningfully (e.g. use different archetypes and conceptual angles, not just slightly reworded copy).
At least one variant must be a "safe clean" option (A1 or A8).
Return the JSON now.`;

  const userPrompt = `Brief: "${brief}"
Generate ${variantCount} creative variant layout instructions in JSON.`;

  try {
    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 3000,
      temperature: 0.5,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textContent = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleanJson = extractJson(textContent);
    
    try {
      const parsed = JSON.parse(cleanJson);
      const variants = parsed.variants || parsed;
      return Array.isArray(variants) ? variants : [variants];
    } catch (parseError: any) {
      console.error('Failed to parse Claude overlay JSON:', textContent);
      throw new Error(`Failed to parse overlay JSON output: ${parseError.message}`);
    }
  } catch (error) {
    console.error('Error in orchestrateOverlayVariants:', error);
    throw error;
  }
}
