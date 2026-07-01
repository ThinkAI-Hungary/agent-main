// Test: does DECOMPOSE correctly extract "30% kedvezmény" as layerText?
import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const rawPrompt = '30% kedvezmény a festékre ami egy munkaasztalon van egy műhelyben, kicsit kupi van';
const imageSubjects = ['white plastic paint bucket with dark navy blue lid and label'];
const brandDna = 'professional, clean, modern';

const systemPrompt = `You are a social media post production AI. Your job is to split a user's raw creative brief into two separate parts:

1. SCENE PROMPT (for AI image generation):
   - Describes the physical scene, setting, lighting, atmosphere, composition
   - MUST NOT contain any promotional text, discounts, percentages, prices, or calls-to-action
   - MUST NOT contain any text that would appear written/overlaid on the image
   - Keep only: location, lighting, mood, style, product positioning
   - CRITICAL: PRESERVE all atmosphere/mood descriptors exactly as-is, even informal ones:
     * "kicsit kupi" → keep as "slightly cluttered/messy" in the scene prompt
     * Do NOT upgrade "messy workshop" into "clean professional studio"

2. LAYER TEXT (for graphic overlay):
   - Short promotional headline or offer text (max 5 words, UPPERCASE in Hungarian)
   - Examples: "30% KEDVEZMÉNY", "NYÁRI AKCIÓ", "ÚJ TERMÉK"
   - If the raw prompt contains NO promotional/offer/discount content → return null
   - This text will be rendered as a graphic layer ON TOP of the image

3. LAYER CTA (optional button text):
   - Short call-to-action for a button (max 3 words, UPPERCASE in Hungarian)
   - Only include if the content clearly calls for user action
   - If not applicable → return null

User input: "${rawPrompt}"
Image subjects: ${JSON.stringify(imageSubjects)}
Brand DNA context: ${brandDna}

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "scenePrompt": "...",
  "layerText": "..." or null,
  "layerCta": "..." or null
}`;

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 400,
  temperature: 0.1,
  system: systemPrompt,
  messages: [{ role: 'user', content: 'Decompose the user prompt now.' }]
});

const text = response.content[0].type === 'text' ? response.content[0].text : '';
console.log('RAW RESPONSE:', text);
try {
  const parsed = JSON.parse(text);
  console.log('\n✅ PARSED:');
  console.log('  scenePrompt:', parsed.scenePrompt?.substring(0, 100));
  console.log('  layerText:', parsed.layerText);
  console.log('  layerCta:', parsed.layerCta);
  
  if (!parsed.layerText) {
    console.log('\n❌ FAIL: layerText is null — "30% kedvezmény" was lost!');
  } else {
    console.log('\n✅ PASS: layerText correctly extracted:', parsed.layerText);
  }
  if (!parsed.scenePrompt?.toLowerCase().includes('clutter') && !parsed.scenePrompt?.toLowerCase().includes('mess')) {
    console.log('❌ FAIL: "kicsit kupi" mood lost from scenePrompt!');
  } else {
    console.log('✅ PASS: mood preserved in scenePrompt');
  }
} catch (e) {
  console.log('❌ JSON parse error:', e.message);
}
