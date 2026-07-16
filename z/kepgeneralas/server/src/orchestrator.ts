import Anthropic from '@anthropic-ai/sdk';
import { ScrapedData } from './scraper';
import { BrandKit, PostCreative, Campaign } from './types';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

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

// 1. Analyzes website scraped data and returns a structured BrandKit
export async function analyzeBrandKit(scraped: ScrapedData): Promise<Partial<BrandKit>> {
  const systemPrompt = `Te egy professzionális arculattervező és márka-tanácsadó grafikus vagy. 
Feladatod, hogy a megadott weboldal scraping adatok alapján kinyerd a márka vizuális és tartalmi identitását, és összeállíts belőle egy strukturált Brand Kit-et (Márka Kit).

Az általad javasolt színeknek és tipográfiának tükröznie kell a weboldal hangulatát. 
Különösen figyelj a következő betűtípusokra (választhatsz ezek közül a leginkább illőt):
- Montserrat (Modern, geometrikus sans-serif) - Támogatja a magyar ékezeteket.
- Playfair Display (Elegáns, klasszikus serif) - Támogatja a magyar ékezeteket.
- Inter (Tiszta, semleges, modern sans-serif) - Támogatja a magyar ékezeteket.
- Caveat (Kézírásos jellegű, barátságos) - Támogatja a magyar ékezeteket.
- Cinzel (Klasszikus antikva római stílusú serif) - FIGYELEM: HIÁNYOZNAK az 'ő' és 'ű' karakterek! Csak akkor válaszd, ha a márka kifejezetten monumentális/antik jellegű és vállalja a figyelmeztetést.

A kimenetet KIZÁRÓLAG egy érvényes JSON formátumban add vissza, markdown kódblokkok és magyarázó szövegek nélkül. Bármilyen idézőjelet a JSON értékeken belül kötelezően escape-elj backslash-sel (pl. \\\"szöveg\\\"). Soha ne használj valódi újsor karaktert a string értékekben, hanem helyettesítsd \\n-nel. 

A várt JSON formátum:
{
  "name": "A cég/márka rövid neve magyarul (pl. PiktorFesték, Anna Kávézója)",
  "colors": {
    "primary": "#HEX (Elsődleges márka szín, domináns háttérszín)",
    "secondary": "#HEX (Másodlagos krémes/világos vagy kiegészítő szín)",
    "accent": "#HEX (Élénk akció/CTA szín)",
    "rules": "Magyar nyelvű leírás a színek helyes használatáról és hierarchiájáról."
  },
  "typography": {
    "fontName": "Betűtípus neve a fenti listából",
    "titleSize": "Címsor mérete pl. 48px",
    "subtitleSize": "Alcím mérete pl. 22px",
    "bodySize": "Szövegtörzs mérete pl. 15px",
    "maxLineLength": 40
  },
  "tone": ["3-4 kulcsszó a hangnemről pl. meleg, közvetlen, szakmai"],
  "toneExampleGood": "Egy ideális poszt szöveg minta ebben a hangnemben (magyarul), ami a márkát tükrözi.",
  "toneExampleBad": "Egy rossz, kerülendő poszt szöveg minta (magyarul), ami túl száraz vagy nem illik a márkához.",
  "visualRules": [
    "3-4 képi szabály pl. Mindig természetes fények",
    "Emberek nélkül, a termék a középpontban",
    "Makró felvételek és rusztikus kiegészítők"
  ],
  "negativePrompt": "AI kép-generátornak szóló negatív prompt angolul (mit kerüljön el pl. people, faces, plastic, neon light, office)",
  "brandDna": {
    "formal_vs_casual": 50,
    "rational_vs_emotional": 50,
    "modern_vs_traditional": 50,
    "simple_vs_technical": 50,
    "authority_vs_peer": 50,
    "price_segment_score": 50,
    "b2b_vs_b2c": 50,
    "product_vs_service": 50,
    "minimalist_vs_decorative": 50,
    "warmth_vs_coolness": 50,
    "vibrancy": 50,
    "humor_level": 50,
    "storytelling_level": 50,
    "educational_level": 50,
    "promotional_level": 50,
    "cta_aggressiveness": 50,
    "emoji_usage": 50,
    "hashtag_density": 50,
    "interaction_asking": 50
  }
}`;

  const userPrompt = `Itt vannak a weboldal scraping adatai:
Weboldal címe: ${scraped.title}
Leírás: ${scraped.description}
Kinyert színek (HEX jelöltek): ${scraped.colors.join(', ')}
Kinyert szövegrészletek:
${scraped.text}

Kérlek, elemezd a fentieket és készítsd el a Brand Kit-et JSON formátumban.`;

  try {
    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 1500,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textContent = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleanJson = extractJson(textContent);
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error('Error in analyzeBrandKit:', error);
    throw error;
  }
}

// 2. Generates 4 structured post creatives based on brief, brand kit, and past approved posts
export interface GeneratedPostVariant {
  templateId: 'quote' | 'product' | 'testimonial' | 'list';
  text: string;
  cta?: string;
  imagePrompt: string;
  colorVariation: 'default' | 'inverted' | 'accent';
  logoVariant: 'light' | 'dark';
}

export async function orchestrateCreatives(
  brief: string,
  brandKit: BrandKit,
  pastApproved: PostCreative[]
): Promise<GeneratedPostVariant[]> {
  const systemPrompt = `Te egy social media marketing specialista AI szövegíró és arculattervező vagy.
Feladatod, hogy a megadott Márka Kit (Brand Kit) szabályai és az aktuális Brief alapján legenerálj 4 különböző kreatív poszt variánst Instagram és Facebook felületekre.

Mindegyik variánsnak egy-egy konkrét sablon elrendezéshez kell készülnie:
1. quote (Idézet sablon): Szövegközpontú, idézet vagy mottó jellegű.
2. product (Termék fókuszú): Kép + termékleírás + CTA gomb.
3. testimonial (Vásárlói értékelés): Csillagos értékelés, idézőjeles visszajelzés szöveg, és a CTA helyén az ügyfél neve.
4. list (Tények/Lista): Fejléc sor, majd 3 pontba szedett számozott lista (1., 2., 3. formátumban), és egy CTA gomb.

Szabályok a szövegekhez (text):
- Minden szöveg MAGYAR nyelven íródjon.
- Hűen tükrözze a márka hangnemét (Tone of Voice).
- A maxLineLength korlátot tartsd be (a sorok ne legyenek túl hosszúak, használj újsor karaktert '\\n' ha szükséges, pl. a list sablonnál).

Szabályok a képgenerálási promptokhoz (imagePrompt):
- A Flux képgenerátornak szóló promptok ANGOL nyelvűek legyenek.
- Írd le részletesen a kompozíciót (pl. cozy cup on a rustic tray, soft shadows, warm natural lighting).
- Vedd figyelembe a Brand Kit képi szabályait (pl. termék fókusz, emberek nélkül) és építsd be a promptba.

A kimenetet KIZÁRÓLAG egy valid JSON tömbként add vissza, markdown kódblokkok nélkül. Bármilyen idézőjelet a JSON értékeken belül kötelezően escape-elj backslash-sel (pl. \\\"szöveg\\\"). Soha ne használj valódi újsor karaktert a string értékekben, hanem helyettesítsd \\n-nel.

Várt JSON szerkezet:
[
  {
    "templateId": "quote",
    "text": "Idézet szövege magyarul",
    "imagePrompt": "Flux image prompt in English",
    "colorVariation": "default | inverted | accent",
    "logoVariant": "light | dark"
  },
  {
    "templateId": "product",
    "text": "Termék leíró poszt szöveg magyarul",
    "cta": "CTA gomb szövege magyarul, pl: Megkóstolom!",
    "imagePrompt": "Flux image prompt in English",
    "colorVariation": "default | inverted | accent",
    "logoVariant": "light | dark"
  },
  {
    "templateId": "testimonial",
    "text": "Ügyfél értékelés idézet szövege magyarul",
    "cta": "Ügyfél neve pl. Kovács Anna, Törzsvendég",
    "imagePrompt": "Flux image prompt in English",
    "colorVariation": "default | inverted | accent",
    "logoVariant": "light | dark"
  },
  {
    "templateId": "list",
    "text": "Lista címe\\n1. Első pont\\n2. Második pont\\n3. Harmadik pont",
    "cta": "CTA gomb szövege pl: Érdekel!",
    "imagePrompt": "Flux image prompt in English",
    "colorVariation": "default | inverted | accent",
    "logoVariant": "light | dark"
  }
]`;

  const pastApprovedText = pastApproved.length > 0 
    ? `Íme a korábban jóváhagyott sikeres poszt minták:\n${pastApproved.map(p => `- Sablon: ${p.templateId}, Szöveg: ${p.text}`).join('\n')}`
    : 'Nincsenek korábbi jóváhagyott minták.';

  const userPrompt = `Márka Kit:
Színek: Elsődleges: ${brandKit.colors.primary}, Másodlagos: ${brandKit.colors.secondary}, Kiemelő: ${brandKit.colors.accent}
Betűtípus: ${brandKit.typography.fontName}
Hangnem tags: ${brandKit.tone.join(', ')}
Képi szabályok: ${brandKit.visualRules.join(', ')}
Negatív prompt: ${brandKit.negativePrompt}

${pastApprovedText}

Aktuális Brief (feladat):
"${brief}"

Kérlek, generáld le a 4 poszt ötletet a fentiek alapján JSON formátumban.`;

  try {
    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 2000,
      temperature: 0.7, // Slightly higher temperature for creative output
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textContent = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleanJson = extractJson(textContent);
    try {
      return JSON.parse(cleanJson);
    } catch (parseError: any) {
      console.error('Failed to parse Creatives JSON. Raw content:', textContent);
      console.error('Cleaned content:', cleanJson);
      throw new Error(`Poszt generálási JSON elemzés sikertelen: ${parseError.message}`);
    }
  } catch (error) {
    console.error('Error in orchestrateCreatives:', error);
    throw error;
  }
}

// Tool schema for Claude tool use — structured output, no JSON parsing needed
const campaignToolSchema = {
  name: "create_campaign",
  description: "Create a complete marketing campaign with strategy, targeting, and 2 creative items (PoC).",
  input_schema: {
    type: "object" as const,
    required: ["title", "description", "targetAudience", "adBudgetSplit", "items"],
    properties: {
      title: { type: "string" as const, description: "A kampány rövid hangzatos címe magyarul" },
      description: { type: "string" as const, description: "A kampány stratégiai koncepciójának összefoglalása magyarul (2-3 mondat)" },
      targetAudience: { type: "string" as const, description: "A meghatározott célközönség leírása magyarul" },
      adBudgetSplit: { type: "string" as const, description: "Büdzsé elosztási javaslat magyarul" },
      items: {
        type: "array" as const,
        description: "2 kreatív elem (PoC): 1 organikus poszt + 1 fizetett Meta hirdetés",
        items: {
          type: "object" as const,
          required: ["type", "templateId", "headline", "caption", "imagePrompt", "colorVariation", "logoVariant", "channel"],
          properties: {
            type: { type: "string" as const, enum: ["post", "ad"], description: "post = organikus, ad = fizetett" },
            templateId: { type: "string" as const, enum: ["quote", "product", "testimonial", "list"], description: "Vizuális stílus sablon" },
            headline: { type: "string" as const, description: "Szöveg a KÉPEN (max 5-7 szó, nagybetűs, magyar ékezetekkel). A teljes promóciót/fő üzenetet tartalmazza, pl. kedvezmény mértéke ÉS az érintett termékkör/szezon. Példa: 20% KEDVEZMÉNY MINDEN FALFESTÉKRE NYÁRON" },
            caption: { type: "string" as const, description: "Teljes Instagram/Facebook posztszöveg: bevezető hook, kifejtés, CTA, hashtagek. Ez NEM kerül a képre." },
            imagePrompt: { type: "string" as const, description: "ANGOL GPT Image 2 prompt. Tartalmazza a TELJES jelenetet ÉS a headline szöveget fizikai felületen. Részletes, fotórealisztikus." },
            colorVariation: { type: "string" as const, enum: ["default", "inverted", "accent"], description: "Szín variáció" },
            logoVariant: { type: "string" as const, enum: ["light", "dark"], description: "Logó variáns" },
            channel: { type: "string" as const, enum: ["instagram", "meta-ads"], description: "Célplatform" },
            targetAudience: { type: "string" as const, description: "Célközönség (csak ad típusnál)" },
            adObjective: { type: "string" as const, enum: ["Conversion", "Traffic", "Awareness"], description: "Hirdetési cél (csak ad típusnál)" },
          }
        }
      }
    }
  }
};

export async function orchestrateCampaign(
  brief: string,
  brandKit: BrandKit
): Promise<Partial<Campaign>> {
  const systemPrompt = `Te egy szenior marketing stratéga és kreatív igazgató AI vagy.
Feladatod, hogy a megadott Márka Kit (Brand Kit) és az aktuális Brief alapján kidolgozz egy online marketing kampányt. 

A kampánynak tartalmaznia kell:
1. Kampány címe és stratégiai koncepciója (magyarul).
2. Részletes célközönség meghatározás (magyarul).
3. Hirdetési büdzsé elosztási javaslat (magyarul).
4. Pontosan 2 kreatív elem (PoC fázis): 1 organikus közösségi poszt + 1 fizetett Meta hirdetés.

FONTOS TECHNIKAI KONTEXTUS — GPT IMAGE 2 KÉPGENERÁLÁS:
A képeket a GPT Image 2 AI generálja, ami kiváló a szöveg renderelésben. A kép EGYBEN tartalmazza a jelenetet ÉS a szöveget — nincs utólagos szöveg-overlay. A headline a képbe van ágyazva fizikai felületen (krétás tábla, cimke, menükártya stb.).

Két szöveges mező van:
- "headline": Szöveg a KÉPEN (maximum 5-7 szó, nagybetűs). A teljes promóciós üzenetet tartalmazza (pl. kedvezmény mértéke ÉS az érintett termékek). Példák: "20% KEDVEZMÉNY MINDEN FALFESTÉKRE", "TAVASZI AKCIÓ KÁVÉINKRA". FONTOS: Helyes magyar ékezetek (Á, É, Í, Ó, Ö, Ő, Ú, Ü, Ű)!
- "caption": TELJES Instagram/Facebook posztszöveg. Több bekezdés, emojik, hashtagek, CTA. NEM kerül a képre.

A sablon (templateId) a kép vizuális stílusát határozza meg:
- quote: Hangulatos, inspiráló jelenet krétás/táblafelirattal.
- product: Termékfókuszú kép, a termék előtérben, szép háttérrel.
- testimonial: Meleg, személyes hangulatú kép, vendéglátó jellegű.
- list: Dinamikus, figyelemfelkeltő kép, erős vizuális szövegelemmel.

Szabályok a szövegekhez:
- Minden caption és headline MAGYAR nyelven íródjon.
- Hangneme kövesse a márka hangnemét (Tone of Voice: ${brandKit.tone.join(', ')}).
- A "headline" legyen a fő üzenetet (kedvezmény + termékek) összefoglaló szöveg — max 5-7 szó, nagy betűs.
- A "caption" legyen teljes Instagram poszt: bevezető hook, kifejtés, CTA, hashtagek.

Szabályok az imagePrompt-hoz (Bria Product Shot):
- ANGOL nyelvű, részletes jelenet-leírás (scene description).
- NE írd le a terméket magát — a termék fotója automatikusan be lesz illesztve a Bria Product Shot modell által.
- Csak a HÁTTERET és JELENETET írd le: kompozíció, megvilágítás, hangulat, színvilág, felületek, dekoráció.
- NE írj szöveget a képbe — a szöveg a caption-ben és headline-ben jelenik meg, nem a képen.
  Példák:
  - 'A warm sunlit spring terrace with cherry blossom petals falling gently, a polished marble countertop, steaming espresso cup in the background, soft golden hour bokeh, luxury cafe atmosphere, professional product photography'
  - 'A premium minimalist studio setup with soft directional lighting, white marble surface with subtle gold accents, elegant floral arrangement in the background, clean luxury advertising photography'
- A promptnak fotórealisztikus jelenetet kell leírnia — a Bria modell a terméket természetesen illeszti a jelenetbe.

Használd a create_campaign tool-t a kampány visszaadásához.`;

  const userPrompt = `Íme a Márka Kit adatai:
Márka hangneme: ${brandKit.tone.join(', ')}
Vizuális szabályok: ${brandKit.visualRules.join(', ')}
Színek: elsődleges: ${brandKit.colors.primary}, másodlagos: ${brandKit.colors.secondary}, kiemelő: ${brandKit.colors.accent}

A kampány aktuális témája / briefje:
"${brief}"

Kérlek tervezd meg a teljes online kampányt a create_campaign tool használatával.`;

  console.log(`[ORCHESTRATOR] Claude API call (tool use) — model=${modelName}, max_tokens=4096`);
  const start = Date.now();

  try {
    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 4096,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [campaignToolSchema],
      tool_choice: { type: "tool", name: "create_campaign" },
    });

    const elapsed = Date.now() - start;
    console.log(`[ORCHESTRATOR] Claude responded in ${elapsed}ms — stop_reason=${response.stop_reason}, usage: input=${response.usage.input_tokens} output=${response.usage.output_tokens}`);

    // Find the tool_use block — this is already a parsed object!
    const toolUseBlock = response.content.find(block => block.type === 'tool_use');
    if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
      throw new Error('Claude did not return a tool_use block');
    }

    const campaign = toolUseBlock.input as Partial<Campaign>;
    console.log(`[ORCHESTRATOR] ✅ Tool use parsed — title="${campaign.title}", items=${(campaign as any).items?.length || 0}`);
    return campaign;
  } catch (error: any) {
    console.error(`[ORCHESTRATOR] ❌ Error: ${error.message}`);
    throw error;
  }
}

// 4. Generates a single post creative based on brief, template type, and Brand Kit
export async function orchestrateSingleCreative(
  brief: string,
  brandKit: BrandKit,
  templateId: 'quote' | 'product' | 'testimonial' | 'list',
  pastApproved: PostCreative[] = []
): Promise<GeneratedPostVariant> {
  const systemPrompt = `Te egy social media marketing specialista AI szövegíró és arculattervező vagy.
Feladatod, hogy a megadott Márka Kit (Brand Kit) szabályai és az aktuális Brief alapján legenerálj egy darab kreatív poszt variánst Instagram és Facebook felületekre, kifejezetten a megadott '${templateId}' sablon elrendezéshez.

A sablon elrendezés:
${
  templateId === 'quote' ? 'quote (Idézet sablon): Szövegközpontú, idézet vagy mottó jellegű.' :
  templateId === 'product' ? 'product (Termék fókuszú): Kép + termékleírás + CTA gomb.' :
  templateId === 'testimonial' ? 'testimonial (Vásárlói értékelés): Csillagos értékelés, idézőjeles visszajelzés szöveg, és a CTA helyén az ügyfél neve.' :
  'list (Tények/Lista): Fejléc sor, majd 3 pontba szedett számozott lista (1., 2., 3. formátumban), és egy CTA gomb.'
}

Szabályok a szöveghez (text):
- A szöveg MAGYAR nyelven íródjon.
- Hűen tükrözze a márka hangnemét (Tone of Voice).
- A maxLineLength korlátot tartsd be (a sorok ne legyenek túl hosszúak, használj újsor karaktert '\\n' ha szükséges, pl. a list sablonnál).

Szabályok a képgenerálási promptokhoz (imagePrompt):
- A Flux képgenerátornak szóló prompt ANGOL nyelvű legyen.
- Írd le részletesen a kompozíciót (pl. cozy cup on a rustic tray, soft shadows, warm natural lighting).
- Vedd figyelembe a Brand Kit képi szabályait (pl. termék fókusz, emberek nélkül) és építsd be a promptba.

A kimenetet KIZÁRÓLAG egy valid JSON objektumként add vissza, markdown kódblokkok nélkül. Bármilyen idézőjelet a JSON értékeken belül kötelezően escape-elj backslash-sel (pl. \\\"szöveg\\\"). Soha ne használj valódi újsor karaktert a string értékekben, hanem helyettesítsd \\n-nel.

Várt JSON szerkezet:
{
  "templateId": "${templateId}",
  "text": "Szöveg vagy idézet magyarul",
  ${templateId !== 'quote' ? '"cta": "CTA gomb szövege vagy az ügyfél neve magyarul",' : ''}
  "imagePrompt": "Flux image prompt in English",
  "colorVariation": "default | inverted | accent",
  "logoVariant": "light | dark"
}`;

  const userPrompt = `Brief: "${brief}"
Generálj le 1 db '${templateId}' típusú poszt ötletet a fentiek alapján JSON formátumban.`;

  try {
    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 1000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textContent = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleanJson = extractJson(textContent);
    try {
      return JSON.parse(cleanJson);
    } catch (parseError: any) {
      console.error('Failed to parse single creative JSON. Raw content:', textContent);
      console.error('Cleaned content:', cleanJson);
      throw new Error(`Poszt generálási JSON elemzés sikertelen: ${parseError.message}`);
    }
  } catch (error) {
    console.error('Error in orchestrateSingleCreative:', error);
    throw error;
  }
}


