export interface PolotnoFont {
  fontFamily: string;
  url: string;
}

export interface PolotnoTextChild {
  type: 'text';
  x: number;
  y: number;
  width: number;
  height?: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: string;
  align: 'left' | 'center' | 'right';
  fill: string;
  opacity?: number;
  letterSpacing?: string;
  textShadow?: string;
}

export interface PolotnoImageChild {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  filter?: 'duotone' | 'none';
  duotoneColors?: [string, string]; // [lightColor, darkColor]
  opacity?: number;
  premiumShadow?: boolean;
}

export interface PolotnoFigureChild {
  type: 'figure';
  subType: 'rect' | 'circle';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  cornerRadius?: number;
  opacity?: number;
  border?: string;
  premiumShadowSoft?: boolean;
  premiumShadow?: boolean;
}

export type PolotnoChild = PolotnoTextChild | PolotnoImageChild | PolotnoFigureChild;

export interface PolotnoPage {
  id: string;
  background: string;
  children: PolotnoChild[];
}

export interface PolotnoJSON {
  width: number;
  height: number;
  fonts: PolotnoFont[];
  pages: PolotnoPage[];
  premiumBorder?: 'dark' | 'light';
}

export interface GeneratorBrandKit {
  id: string;
  version: number;
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
}

export interface CreativeContent {
  headline?: string;
  subhead?: string;
  body?: string;
  cta?: string;
  number?: string;
  terms?: string;
  quote?: string;
  author?: string;
  title?: string;
  items?: string[];
  footer_text?: string;
}

export interface OrchestratedVariant {
  archetype: 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8' | 'A9';
  rationale: string;
  slots: Record<string, string>;
  image: {
    mode: 'solid' | 'duotone' | 'framed' | 'full-bleed';
    source: 'none' | 'stock' | 'generated' | 'brand_asset';
    queryOrPrompt?: string;
    negativePrompt?: string;
  };
  accentEmphasis: 'low' | 'medium' | 'high';
}
