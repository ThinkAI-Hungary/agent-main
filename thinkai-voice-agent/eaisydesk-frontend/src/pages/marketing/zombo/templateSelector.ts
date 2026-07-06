import type { LayerTemplate } from './layerTemplates';

export interface SelectionContent {
  headline: string;
  subtitle?: string;
  cta?: string;
}

/** Subset of BrandDna values used for template scoring */
export interface ScoringBrandDna {
  promotional_level?: number;        // 0–100, high → prefer promo/sale templates
  minimalist_vs_decorative?: number; // 0=minimal, 100=decorative
  price_segment_score?: number;      // 0–100, high → prefer luxury templates
  vibrancy?: number;                 // 0–100, high → prefer bold/colorful templates
}

/** Image analysis signals used for layout matching */
export interface ScoringImageSignals {
  imageType?: string;           // 'product' | 'model' | 'scene' | 'lifestyle' | 'mixed'
  backgroundBrightness?: string; // 'dark' | 'light' | 'mixed'
  subjectPosition?: string;     // 'left' | 'right' | 'center' | 'top' | 'bottom' | 'full' | etc.
  negativeSpaceZone?: string;   // 'left' | 'right' | 'top' | 'bottom' | 'none'
}

export interface SelectionResult {
  templateId: string;
  score: number;
  needsShortening: boolean;
  shorteningInstructions?: string;
}

/**
 * Smart Template Selector — v2
 * Scores templates based on:
 *  1. Text length / slot capacity
 *  2. Thematic keyword matching (bestFor / avoidFor)
 *  3. Image composition awareness (subjectPosition → textZone matching)
 *  4. Brand DNA values (promotional, minimalist, luxury)
 *  5. Mood keywords in prompt
 */
export function getBestTemplate(
  templates: LayerTemplate[],
  content: SelectionContent,
  prompt: string,
  imageSignals?: ScoringImageSignals,
  brandDna?: ScoringBrandDna
): SelectionResult {
  const promptLower = prompt.toLowerCase();
  const scores = templates.map(template => {
    let score = 100;
    const meta = template.meta;
    let needsShortening = false;

    // 1. Headline Length
    const headlineLen = content.headline.length;
    if (meta.headlineMaxChars > 0) {
      if (headlineLen > meta.headlineMaxChars) {
        score -= (headlineLen / meta.headlineMaxChars - 1) * 200;
        needsShortening = true;
      } else {
        score += (headlineLen / meta.headlineMaxChars) * 10;
      }
    } else if (headlineLen > 0) {
      score -= 50;
    }

    // 2. Subtitle / Body Length
    const subLen = content.subtitle?.length || 0;
    if (meta.bodyMaxChars > 0) {
      if (subLen > meta.bodyMaxChars) {
        score -= (subLen / meta.bodyMaxChars - 1) * 150;
        needsShortening = true;
      } else if (subLen > 0) {
        score += (subLen / meta.bodyMaxChars) * 5;
      }
    } else if (subLen > 0) {
      score -= 30;
    }

    // 3. CTA Length
    const ctaLen = content.cta?.length || 0;
    if (meta.ctaMaxChars > 0) {
      if (ctaLen > meta.ctaMaxChars) { score -= 100; needsShortening = true; }
    } else if (ctaLen > 0) {
      score -= 20;
    }

    // 4. Thematic Matching
    meta.bestFor.forEach(kw => { if (promptLower.includes(kw.toLowerCase())) score += 40; });
    meta.avoidFor.forEach(kw => { if (promptLower.includes(kw.toLowerCase())) score -= 80; });

    // 5. Mood Matching
    ['luxury', 'urgent', 'educational', 'emotional', 'minimal', 'storytelling'].forEach(mood => {
      if (promptLower.includes(mood) && meta.bestFor.some(k => k.toLowerCase().includes(mood))) {
        score += 60;
      }
    });

    // 6. Image composition — textZone vs negativeSpaceZone
    const negSpace = imageSignals?.negativeSpaceZone;
    const subjPos  = imageSignals?.subjectPosition;

    if (negSpace && negSpace !== 'none' && meta.textZone) {
      if (meta.textZone === negSpace) score += 25;
      if (meta.textZone === 'center') score += 5;
      if (meta.textZone === 'overlay') score += 8;
    }

    // Directional hints from prompt text
    if (promptLower.includes('bottom') || promptLower.includes('alul')) {
      if (meta.textZone === 'bottom') score += 30;
      if (meta.textZone === 'top') score -= 20;
    }
    if (promptLower.includes('top') || promptLower.includes('felül')) {
      if (meta.textZone === 'top') score += 30;
      if (meta.textZone === 'bottom') score -= 20;
    }

    // Subject position → prefer layouts that leave the other side for text
    if (subjPos === 'right' || subjPos === 'bottom-right' || subjPos === 'top-right') {
      if (['left-column', 'side-stripe-left', 'kicker-title', 'bold-headline'].includes(template.id)) score += 20;
    } else if (subjPos === 'left' || subjPos === 'bottom-left' || subjPos === 'top-left') {
      if (['side-stripe-right', 'new-arrival', 'minimal-brand'].includes(template.id)) score += 20;
    } else if (subjPos === 'center') {
      if (['bold-headline', 'flash-sale', 'promo-badge', 'center-circle-promo', 'dark-announcement'].includes(template.id)) score += 15;
    } else if (subjPos === 'full') {
      if (meta.textZone === 'overlay' || template.id.includes('gradient') || template.id.includes('dark')) score += 15;
    }

    // Image type
    const imgType = imageSignals?.imageType;
    if (imgType === 'product' && meta.imageComposition.includes('product-centered')) score += 8;
    if ((imgType === 'scene' || imgType === 'lifestyle') && (meta.imageComposition.includes('landscape') || meta.imageComposition.includes('scene'))) score += 6;
    if (imgType === 'model' && meta.imageComposition.includes('portrait')) score += 8;

    // Background brightness
    const bgBrightness = imageSignals?.backgroundBrightness;
    if (bgBrightness === 'dark' && meta.backgroundType === 'dark') score += 6;
    if (bgBrightness === 'light' && meta.backgroundType === 'light') score += 6;
    if (meta.backgroundType === 'any') score += 2;

    // Minimal penalty
    if (promptLower.includes('minimal') && template.id.includes('multi')) score -= 50;

    // 7. Brand DNA Scoring
    if (brandDna) {
      const promoLevel   = brandDna.promotional_level ?? 50;
      const minimalScore = brandDna.minimalist_vs_decorative ?? 50;
      const priceSegment = brandDna.price_segment_score ?? 50;
      const vibrancy     = brandDna.vibrancy ?? 50;

      if (promoLevel > 65 && ['promo-badge', 'flash-sale', 'corner-ribbon', 'percentage-corner', 'product-callout'].includes(template.id)) {
        score += Math.round((promoLevel - 65) * 0.4);
      }
      if (promoLevel < 35 && ['quote-card', 'bold-headline', 'minimal-brand', 'fashion-lookbook'].includes(template.id)) {
        score += Math.round((35 - promoLevel) * 0.3);
      }
      if (minimalScore < 30) {
        if (['minimal-brand', 'bold-headline', 'quote-card', 'kicker-title'].includes(template.id)) score += 12;
        if (template.id.includes('multi') || template.id.includes('bundle')) score -= 10;
      }
      if (minimalScore > 70 && ['fashion-lookbook', 'event-invite', 'summer-vibes', 'carousel-slide'].includes(template.id)) score += 10;
      if (priceSegment > 70 && ['luxury-dark', 'fashion-lookbook', 'quote-card', 'minimal-brand', 'dark-announcement'].includes(template.id)) {
        score += Math.round((priceSegment - 70) * 0.4);
      }
      if (priceSegment > 70 && ['flash-sale', 'giveaway', 'bundle-deal'].includes(template.id)) score -= 8;
      if (vibrancy > 70 && ['promo-badge', 'flash-sale', 'summer-vibes', 'fitness-motivation'].includes(template.id)) score += 8;
    }

    return { templateId: template.id, score, needsShortening };
  });

  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0];

  let shorteningInstructions = '';
  if (winner.needsShortening) {
    const t = templates.find(temp => temp.id === winner.templateId)!;
    shorteningInstructions = `Selected template "${t.name}" requires shorter text. ` +
      `Max headline: ${t.meta.headlineMaxChars}, Max body: ${t.meta.bodyMaxChars}.`;
  }

  return { ...winner, shorteningInstructions };
}

/**
 * Helper to suggest a shortened version of a text (primitive version,
 * ideally called by AI but here as a fallback logic).
 */
export function truncateToFit(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.substring(0, max - 3) + '...';
}
