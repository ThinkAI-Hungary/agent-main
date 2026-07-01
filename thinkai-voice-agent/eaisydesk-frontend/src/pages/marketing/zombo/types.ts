export interface BrandKit {
  id: string;
  version: number;
  createdAt: string;
  name?: string;
  colors: {
    primary: string;      // Primary HEX code
    secondary: string;    // Secondary HEX code
    accent: string;       // Accent HEX code
    rules: string;        // Hungarian text description of rules
  };
  typography: {
    fontName: string;
    titleSize: string;
    subtitleSize: string;
    bodySize: string;
    maxLineLength: number;
  };
  logoUrl: string;
  logoPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  tone: string[];          // e.g., ["játékos", "direkt", "meleg"]
  toneExampleGood: string;
  toneExampleBad: string;
  visualRules: string[];   // e.g., ["mindig felülnézet", "meleg tónusok"]
  negativePrompt: string;  // e.g., "emberek, arcok, plasztik felszín"
  brandDna?: BrandDna;
  /** Full brand personality profile derived from audit — used verbatim by AI generators */
  brandProfile?: BrandProfile;
}

/** Numeric 0–100 coordinate sliders — editable via BrandKitView sliders */
export interface BrandDna {
  // Tone & Voice
  formal_vs_casual: number;
  rational_vs_emotional: number;
  modern_vs_traditional: number;
  simple_vs_technical: number;
  authority_vs_peer: number;

  // Business & Market
  price_segment_score: number;
  b2b_vs_b2c: number;
  product_vs_service: number;

  // Visual Identity
  minimalist_vs_decorative: number;
  warmth_vs_coolness: number;
  vibrancy: number;

  // Content Pillars
  humor_level: number;
  storytelling_level: number;
  educational_level: number;
  promotional_level: number;

  // Engagement Style
  cta_aggressiveness: number;
  emoji_usage: number;
  hashtag_density: number;
  interaction_asking: number;

  // Extended engagement (from brand_coordinates.engagement)
  post_length_preference?: number;
}

/**
 * Full qualitative brand personality profile, straight from the audit's brand_personality object.
 * This entire object is forwarded to the AI generator backend, enabling richer, more targeted copy.
 */
export interface BrandProfile {
  // Identity
  brand_archetype?: string;           // e.g. "The Sage"
  alignment_score?: number;           // 0–100
  brand_archetype_reasoning?: string;
  alignment_reasoning?: string;
  target_audience?: string;
  personality_summary?: string;
  brand_voice?: string[];             // same as BrandKit.tone, kept for AI verbosity

  // Market positioning
  price_segment_label?: string;       // e.g. "mid-premium"
  primary_industry?: string;          // e.g. "Food & Beverage"

  // Visual descriptors
  visual_style_tags?: string[];       // e.g. ["minimal", "warm", "artisanal"]

  // Content strategy
  key_content_themes?: string[];      // e.g. ["sustainability", "craftsmanship"]

  // Addressing / POV
  addressing?: {
    mode?: string;           // e.g. "tegező" | "magázó"
    confidence?: number;     // 0–100
    evidence?: string[];     // sample phrases proving the mode
  };

  // CTA library
  cta_library?: {
    primary_ctas?: string[];    // strong action CTAs
    secondary_ctas?: string[];  // softer engagement CTAs
    slogans?: string[];
    tagline?: string;
  };

  // Brand Don'ts
  brand_dont?: {
    avoid_words?: string[];
    avoid_topics?: string[];
    avoid_tones?: string[];
  };

  // Psycholinguistic fingerprint
  linguistic_fingerprint?: {
    // Psychological markers (0–100)
    cognitive_complexity?: number;
    emotional_intensity?: number;
    certainty_language?: number;
    authenticity_score?: number;
    clout_score?: number;
    analytical_thinking?: number;
    social_reference_density?: number;

    // Qualitative
    temporal_focus?: string;          // e.g. "present", "future"
    primary_persuasion?: string;      // e.g. "emotional", "logical"
    storytelling_structure?: string;  // e.g. "hero's journey"
    vocabulary_complexity?: string;   // e.g. "simple", "moderate", "complex"
    dominant_emotions?: string[];     // e.g. ["joy", "trust"]
    emotional_arc?: string;           // e.g. "rising"

    // Sentence metrics
    avg_sentence_length?: number;
    question_ratio?: number;
    exclamation_ratio?: number;
    sentence_length_variance?: string;

    // Vocabulary sets
    brand_specific_terms?: string[];
    power_words?: string[];
    avoided_words?: string[];

    // Rhetorical patterns
    opening_patterns?: string[];
    closing_patterns?: string[];
    transition_phrases?: string[];
  };
}


export interface PostTemplate {
  id: string;
  name: string;
  description: string;
  category: 'quote' | 'product' | 'testimonial' | 'list' | 'story';
}

export interface PostCreative {
  id: string;
  briefId: string;
  templateId: string;
  status: 'draft' | 'approved' | 'rejected' | 'scheduled' | 'published' | 'failed';
  text: string;
  cta?: string;
  imageUrl: string;
  originalImageUrl?: string;
  imagePrompt: string;
  colorVariation: 'default' | 'inverted' | 'accent';
  logoVariant: 'light' | 'dark';
  logoPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  bgBlur?: number;
  overlayOpacity?: number;
  logoSize?: number;
  fontSize?: number;
  textAlignment?: 'left' | 'center' | 'right';
  ctaRadius?: number;
  fontWeight?: string;
  textColor?: string;
  textYOffset?: number;
  textXOffset?: number;
  panelBgColor?: string;
  panelPadding?: number;
  panelRadius?: number;
  panelPosition?: string;
  ctaFontSize?: number;
  ctaBgColor?: string;
  ctaYOffset?: number;
  hashtags?: string[];
  altText?: string;
  platform?: 'instagram' | 'facebook' | 'meta-ads';
  createdAt: string;
  scheduledAt?: string;
  publishedAt?: string;
  instagramUrl?: string;
  failureReason?: string;
  generationModel?: string;
  generationTime?: number;
}

export interface Brief {
  id: string;
  text: string;
  createdAt: string;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  step?: 'queue' | 'orchestrator' | 'renderer' | 'meta-api';
}

export interface CampaignItem {
  id: string;
  type: 'post' | 'ad';
  templateId: 'quote' | 'product' | 'testimonial' | 'list';
  headline: string;     // Short creative text FOR the image (1-5 words, Flux renders this)
  caption: string;      // Full Instagram caption / ad primary text (with hashtags, emojis)
  text: string;         // Legacy field = caption (backwards compat)
  cta?: string;
  imagePrompt: string;
  colorVariation: 'default' | 'inverted' | 'accent';
  logoVariant: 'light' | 'dark';
  channel: 'instagram' | 'facebook' | 'meta-ads';
  targetAudience?: string;
  adObjective?: string;
  imageUrl?: string;
  originalImageUrl?: string;
  status: 'draft' | 'approved' | 'rejected' | 'scheduled' | 'published';
  scheduledAt?: string;
  publishedAt?: string;
}

export interface Campaign {
  id: string;
  title: string;
  description: string;
  targetAudience: string;
  adBudgetSplit: string;
  items: CampaignItem[];
  createdAt: string;
  goalType?: 'product-launch' | 'promo' | 'brand-awareness' | 'engagement' | 'seasonal' | 'retargeting';
  targetAge?: string;
  targetLocation?: string;
  targetInterests?: string;
  phases?: CampaignPhase[];
  abTests?: ABTestVariant[];
}

export interface CampaignPhase {
  name: 'teaser' | 'launch' | 'sustain' | 'closing';
  label: string;
  days: number;
  postCount: number;
  focus: string;
}

export interface ABTestVariant {
  id: string;
  label: string;
  differentiator: 'image' | 'headline' | 'cta' | 'template' | 'color';
  imageUrl?: string;
  headline?: string;
  cta?: string;
  templateId?: string;
  colorVariation?: string;
  score?: number;
}

export function getBackendUrl(): string {
  if (typeof window !== 'undefined' && (window as any).__IMAGE_API_URL__) {
    return (window as any).__IMAGE_API_URL__;
  }
  const envUrl = import.meta.env.VITE_IMAGE_API_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl;
  }
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return `${protocol}//${hostname}:3001`;
}

export function fixImageUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  if (url.includes('renders/')) {
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    return `${getBackendUrl()}${cleanUrl}`;
  }
  return url;
}
