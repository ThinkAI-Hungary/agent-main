export interface BrandKit {
  id: string;
  version: number;
  createdAt: string;
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
  imagePrompt: string;
  colorVariation: 'default' | 'inverted' | 'accent';
  logoVariant: 'light' | 'dark';
  createdAt: string;
  scheduledAt?: string;
  publishedAt?: string;
  instagramUrl?: string;
  failureReason?: string;
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
