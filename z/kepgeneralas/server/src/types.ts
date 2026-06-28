export interface BrandKit {
  id: string;
  version: number;
  createdAt: string;
  name?: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    rules: string;
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
  tone: string[];
  toneExampleGood: string;
  toneExampleBad: string;
  negativePrompt: string;
  brandDna?: BrandDna;
}

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
  headline: string;
  caption: string;
  text: string;
  cta?: string;
  imagePrompt: string;
  scenePrompt?: string;
  textElementPrompt?: string;
  colorVariation: 'default' | 'inverted' | 'accent';
  logoVariant: 'light' | 'dark';
  channel: 'instagram' | 'facebook' | 'meta-ads';
  targetAudience?: string;
  adObjective?: string;
  imageUrl?: string;
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
}
