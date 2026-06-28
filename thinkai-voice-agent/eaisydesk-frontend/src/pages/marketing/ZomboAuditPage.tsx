/**
 * ZomboAuditPage – Full website audit with multi-agent AI analysis.
 * Ported from elemzes.html to React with tabbed layout.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { getToken } from '../../api/client';
import { showToast } from '../../components/ui/Toast';

// Cloned image generator imports
import { type BrandKit as ZomboBrandKit, type PostCreative as ZomboPostCreative, type SystemLog as ZomboSystemLog, type Campaign as ZomboCampaign } from './zombo/types';
import {
  INITIAL_BRAND_KITS,
  INITIAL_CREATIVES,
  INITIAL_SCHEDULED_POSTS,
  INITIAL_LOGS
} from './zombo/dummyData';
import { BrandKitView } from './zombo/components/BrandKitView';
import { GeneratorSimulator } from './zombo/components/GeneratorSimulator';
import { CreativeCard } from './zombo/components/CreativeCard';
import { ScheduleView } from './zombo/components/ScheduleView';
import { AdminMonitor } from './zombo/components/AdminMonitor';
import { CampaignCreator } from './zombo/components/CampaignCreator';
import { ImageTestLab } from './zombo/components/ImageTestLab';
import { OverlayTestLab } from './zombo/components/OverlayTestLab';
import { ProdCalendarView } from './zombo/components/ProdCalendarView';
import { QuickPostView }    from './zombo/components/QuickPostView';
import './zombo/zombo.css';

// Lucide icons for generator sidebar
import {
  Sparkles,
  Palette,
  Terminal,
  Grid,
  Layout,
  Coffee,
  CheckCircle,
  TrendingUp,
  Zap,
  Layers
} from 'lucide-react';


/* ════════════════════════════════ Types ════════════════════════════════ */

interface SeoData {
  score: number; title: string; description: string;
  h1_count: number; h2_count: number; h3_count: number;
  total_images: number; missing_alt: number;
  total_links: number; internal_links: number; external_links: number;
  has_robots: boolean; has_sitemap: boolean;
  lang_val: string; has_lang: boolean;
  has_schema: boolean; has_viewport: boolean; has_canonical: boolean; is_https: boolean;
  h1_texts?: string[];
  deductions: string[]; deductions_detail: { criterion: string; points: number; reason: string; recommendation?: string; status: string }[];
}

interface VisualsData {
  visual_tone: string; warm_pct: number; cool_pct: number; neutral_pct: number;
  top_colors_detail: { hex: string; pct: number; name?: string }[];
  image_colors: ({ hex: string; name?: string } | string)[];
  visual_style_description: string;
}

interface ContentData {
  word_count: number; business_category: string; tone: string; summary: string; seo_advice: string;
  global_improvements?: string[];
  detected_posts?: { title?: string; placement?: string; inferred_popularity?: string; words?: string[] }[];
  word_style_analysis?: string;
  images_analysis?: { url?: string; dominant_colors?: string[]; visual_description?: string; alt_text?: string }[];
}

interface MarketingAudit {
  marketing_score: number; value_proposition_evaluation: string;
  frameworks_analysis: { pas_alignment: string; aida_alignment: string };
  cta_evaluation: string; credibility_evaluation: string;
  copy_recommendations: string[];
}

interface BrandPersonality {
  brand_archetype: string; alignment_score: number; brand_archetype_reasoning: string;
  alignment_reasoning: string; target_audience: string; personality_summary: string;
  brand_voice: string[];
  brand_coordinates: {
    tone: Record<string, number>;
    business: Record<string, number> & { price_segment_label?: string };
    visual: Record<string, number> & { visual_style_tags?: string[] };
    content: Record<string, number> & { primary_industry?: string; key_content_themes?: string[] };
    engagement: Record<string, number>;
  };
  addressing: { mode: string; confidence: number; evidence: string[] };
  cta_library: { primary_ctas: string[]; secondary_ctas: string[]; slogans: string[]; tagline: string };
  brand_dont: { avoid_words: string[]; avoid_topics: string[]; avoid_tones: string[] };
}

interface ContactData {
  company_name?: string;
  emails?: string[];
  phone_numbers?: string[];
  addresses?: string[];
  tax_number?: string;
  registration_number?: string;
  opening_hours?: { schedule?: { day: string; hours: string }[]; note?: string } | null;
  // social platforms as individual keys
  [key: string]: unknown;
}

interface ProductData {
  name: string; brand: string; price: string; description: string; page_url: string;
  type?: string; category?: string;
}

interface AuditResult {
  url: string;
  seo: SeoData;
  visuals: VisualsData;
  content: ContentData;
  marketing_audit: MarketingAudit;
  brand_personality: BrandPersonality;
  contact: ContactData;
  contacts?: ContactData;
  products: ProductData[];
  scraper_json: unknown;
  linguistic_fingerprint?: Record<string, unknown>;
}

/* ════════════════════════════════ Helpers ════════════════════════════════ */

/* Hungarian translation map for English-stored Brand DNA values */
const HU: Record<string, string> = {
  // Emotions
  trust: 'Bizalom', anticipation: 'Várakozás', security: 'Biztonság', joy: 'Öröm',
  surprise: 'Meglepetés', fear: 'Félelem', sadness: 'Szomorúság', disgust: 'Undor',
  anger: 'Harag', love: 'Szeretet', pride: 'Büszkeség', hope: 'Remény',
  curiosity: 'Kíváncsiság',
  // Emotional arcs
  calm_authority: 'Nyugodt tekintély', neutral_to_positive: 'Semlegesből pozitívba',
  buildup_peak: 'Fokozatos csúcspont', consistent_positive: 'Állandóan pozitív',
  urgent_action: 'Sürgető cselekvés',
  // Persuasion
  ethos: 'Hitelesség (etosz)', logos: 'Logika (logosz)', pathos: 'Érzelem (pátosz)',
  // Temporal focus
  present: 'Jelenbeli', past: 'Múltbeli', future: 'Jövőbeli', mixed: 'Vegyes',
  // Storytelling
  none: 'Nincs', problem_solution: 'Probléma-megoldás', hero_journey: 'Hős útja',
  before_after: 'Előtte-utána', testimonial: 'Vélemény alapú', educational: 'Oktató',
  direct_sell: 'Direkt eladás', disruptive_narrative: 'Provokatív',
  // Vocabulary complexity
  kozertheto: 'Közérthető', kozepes: 'Közepes', szakkifejezes: 'Szakkifejezéses',
  akademiai: 'Akadémiai',
  // Sentence variance
  alacsony: 'Alacsony', magas: 'Magas',
  // Visual style tags (frequently occurring)
  'clean product photography': 'Tiszta termékfotó', 'white background': 'Fehér háttér',
  functional: 'Funkcionális', 'e-commerce': 'Webáruház', practical: 'Praktikus',
  minimalist: 'Minimalista', modern: 'Modern', professional: 'Professzionális',
  elegant: 'Elegáns', colorful: 'Színes', dark: 'Sötét', bright: 'Világos',
  playful: 'Játékos', corporate: 'Vállalati', vintage: 'Vintage', bold: 'Merész',
  luxurious: 'Luxus', natural: 'Természetes', rustic: 'Rusztikus', clean: 'Letisztult',
};
const hu = (key: string) => HU[key] || HU[key?.toLowerCase?.()] || key;

const DnaBar = ({ label, leftLabel, rightLabel, value }: { label: string; leftLabel: string; rightLabel: string; value: number }) => {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
        <span style={{ fontWeight: 600, minWidth: 70 }}>{leftLabel}</span>
        <span style={{ fontWeight: 700, color: '#8b5cf6', fontSize: 12, background: 'rgba(139,92,246,0.08)', padding: '1px 6px', borderRadius: 4 }}>{v}</span>
        <span style={{ fontWeight: 600, minWidth: 70, textAlign: 'right' }}>{rightLabel}</span>
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 3 }}>{label}</div>
      <div style={{ height: 8, background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ height: '100%', borderRadius: 6, background: 'linear-gradient(90deg, rgba(139,92,246,0.6), rgba(139,92,246,1))', width: `${v}%`, transition: 'width 0.8s cubic-bezier(0.22,1,0.36,1)', minWidth: 2 }} />
      </div>
    </div>
  );
};

/* ──────── Radar / Spider Chart for Brand DNA ──────── */
interface RadarAxis {
  label: string;
  value: number; // 0-100
  icon: string;
}

const RadarChart = ({ axes, size = 280 }: { axes: RadarAxis[]; size?: number }) => {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const levels = 5;
  const n = axes.length;
  if (n < 3) return null;

  const angleSlice = (Math.PI * 2) / n;
  // Start from top (-PI/2)
  const getPoint = (i: number, pct: number) => {
    const angle = angleSlice * i - Math.PI / 2;
    return {
      x: cx + r * pct * Math.cos(angle),
      y: cy + r * pct * Math.sin(angle),
    };
  };

  // Grid lines
  const gridLines: string[] = [];
  for (let lv = 1; lv <= levels; lv++) {
    const pct = lv / levels;
    const pts = Array.from({ length: n }, (_, i) => getPoint(i, pct));
    gridLines.push(pts.map(p => `${p.x},${p.y}`).join(' '));
  }

  // Data polygon
  const dataPoints = axes.map((a, i) => getPoint(i, Math.max(0, Math.min(100, a.value || 0)) / 100));
  const dataPolygon = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  // Label positions (pushed outward)
  const labelPoints = axes.map((_, i) => getPoint(i, 1.22));

  return (
    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
        {/* Grid polygons */}
        {gridLines.map((pts, i) => (
          <polygon
            key={`grid-${i}`}
            points={pts}
            fill="none"
            stroke="var(--border)"
            strokeWidth={i === levels - 1 ? 1.5 : 0.7}
            strokeDasharray={i < levels - 1 ? '3,3' : 'none'}
            opacity={0.5}
          />
        ))}

        {/* Axis lines */}
        {axes.map((_, i) => {
          const end = getPoint(i, 1);
          return (
            <line key={`axis-${i}`} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="var(--border)" strokeWidth={0.7} opacity={0.4} />
          );
        })}

        {/* Data fill */}
        <polygon
          points={dataPolygon}
          fill="rgba(139,92,246,0.12)"
          stroke="#8b5cf6"
          strokeWidth={2}
          strokeLinejoin="round"
          style={{ transition: 'all 0.8s cubic-bezier(0.22,1,0.36,1)' }}
        />

        {/* Data points */}
        {dataPoints.map((p, i) => (
          <g key={`dot-${i}`}>
            <circle cx={p.x} cy={p.y} r={5} fill="#8b5cf6" stroke="#fff" strokeWidth={2} style={{ transition: 'all 0.6s ease' }} />
            <circle cx={p.x} cy={p.y} r={8} fill="rgba(139,92,246,0.15)" style={{ transition: 'all 0.6s ease' }} />
          </g>
        ))}

        {/* Labels */}
        {axes.map((a, i) => {
          const lp = labelPoints[i];
          const isTop = lp.y < cy - 10;
          const isBottom = lp.y > cy + 10;
          const textAnchor = Math.abs(lp.x - cx) < 5 ? 'middle' : lp.x > cx ? 'start' : 'end';
          const dy = isTop ? -4 : isBottom ? 14 : 4;
          return (
            <g key={`label-${i}`}>
              <text
                x={lp.x} y={lp.y + dy}
                textAnchor={textAnchor}
                fontSize={11}
                fontWeight={700}
                fill="var(--text)"
                fontFamily="'Inter', sans-serif"
              >
                {a.icon} {a.label}
              </text>
              <text
                x={lp.x} y={lp.y + dy + 14}
                textAnchor={textAnchor}
                fontSize={11}
                fontWeight={800}
                fill="#8b5cf6"
                fontFamily="'Inter', sans-serif"
              >
                {Math.round(a.value || 0)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const Tag = ({ children, color = '#8b5cf6' }: { children: React.ReactNode; color?: string }) => (
  <span style={{ fontSize: 11, padding: '3px 8px', background: `${color}14`, color, borderRadius: 6, border: `1px solid ${color}25`, fontWeight: 600, fontFamily: 'monospace' }}>{children}</span>
);

const InfoRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <tr style={{ borderBottom: '1px solid var(--border)' }}>
    <td style={{ padding: '12px 8px', fontWeight: 600, fontSize: 13, color: 'var(--text)', width: 180, verticalAlign: 'top' }}>{label}</td>
    <td style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text)' }}>{children}</td>
  </tr>
);

const SectionCard = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
  <div style={{ background: 'var(--card, #fff)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 18 }}>
    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 18 }}>{icon}</span> {title}
    </div>
    {children}
  </div>
);

const ScoreBadge = ({ score }: { score: number }) => {
  const bg = score >= 80 ? 'rgba(34,197,94,0.1)' : score >= 50 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const label = score >= 80 ? 'Kiváló' : score >= 50 ? 'Közepes' : 'Gyenge';
  return <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: bg, color }}>{label}</span>;
};

/* ══════════════════════════════ TABS ══════════════════════════════ */
const TABS = [
  { id: 'seo', label: 'SEO Audit' },
  { id: 'visual', label: 'Vizuális' },
  { id: 'content', label: 'Tartalom' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'brand', label: 'Brand DNA' },
  { id: 'contact', label: 'Kontakt' },
  { id: 'products', label: 'Termékek' },
  { id: 'generate', label: 'AI Generálás' },
  { id: 'prod',        label: 'Éles Naptár (Prod)' },
  { id: 'quick-post',  label: '⚡ Quick Post' },
  { id: 'raw', label: '{ } JSON' },
];

/* ═══════════════════ SessionStorage persistence helpers ═══════════════════ */
const STORAGE_KEY_RESULT = 'zombo_audit_result';
const STORAGE_KEY_URL    = 'zombo_audit_url';
const STORAGE_KEY_TAB    = 'zombo_audit_tab';

function loadStoredResult(): AuditResult | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_RESULT);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function deriveBrandKitFromAudit(data: AuditResult, version: number): ZomboBrandKit {
  const bp = data.brand_personality;
  const coords = bp?.brand_coordinates;
  const lf = data.linguistic_fingerprint as Record<string, any> | undefined;
  const companyName = data.contact?.company_name || data.contacts?.company_name || data.seo?.title?.split(/[|-]/)[0]?.trim() || 'Márka';

  /* ── Numeric DNA coordinates ── */
  const mappedDna = coords ? {
    formal_vs_casual:       coords.tone?.formal_vs_casual ?? 50,
    rational_vs_emotional:  coords.tone?.rational_vs_emotional ?? 50,
    modern_vs_traditional:  coords.tone?.modern_vs_traditional ?? 50,
    simple_vs_technical:    coords.tone?.simple_vs_technical ?? 50,
    authority_vs_peer:      coords.tone?.authority_vs_peer ?? 50,
    price_segment_score:    coords.business?.price_segment_score ?? 50,
    b2b_vs_b2c:             coords.business?.b2b_vs_b2c ?? 50,
    product_vs_service:     coords.business?.product_vs_service ?? 50,
    minimalist_vs_decorative: coords.visual?.minimalist_vs_decorative ?? 50,
    warmth_vs_coolness:     coords.visual?.warmth_vs_coolness ?? 50,
    vibrancy:               coords.visual?.vibrancy ?? 50,
    humor_level:            coords.content?.humor_level ?? 50,
    storytelling_level:     coords.content?.storytelling_level ?? 50,
    educational_level:      coords.content?.educational_level ?? 50,
    promotional_level:      coords.content?.promotional_level ?? 50,
    cta_aggressiveness:     coords.engagement?.cta_aggressiveness ?? 50,
    emoji_usage:            coords.engagement?.emoji_usage ?? 50,
    hashtag_density:        coords.engagement?.hashtag_density ?? 50,
    interaction_asking:     coords.engagement?.interaction_asking ?? 50,
    post_length_preference: coords.engagement?.post_length_preference,
  } : undefined;

  /* ── Colors & basic fields ── */
  const colorList = data.visuals?.top_colors_detail || [];
  const primary   = colorList[0]?.hex || '#1a1a2e';
  const secondary = colorList[1]?.hex || '#f8f8f8';
  const accent    = colorList[2]?.hex || '#8b5cf6';
  const tone      = bp?.brand_voice || [];
  const colorRules = data.visuals?.visual_style_description || '';

  const avoidTones  = bp?.brand_dont?.avoid_tones?.join(', ') || '';
  const avoidWords  = bp?.brand_dont?.avoid_words?.join(', ') || '';
  const avoidTopics = bp?.brand_dont?.avoid_topics || [];
  const toneExampleBad = [
    avoidTones && `Kerülendő hangnemek: ${avoidTones}.`,
    avoidWords && `Kerülendő szavak: ${avoidWords}.`,
  ].filter(Boolean).join(' ') || '';

  /* ── Full brand profile (forwarded verbatim to AI generators) ── */
  const psych    = (lf?.psychological_markers   || {}) as Record<string, any>;
  const rhetoric = (lf?.rhetorical_patterns     || {}) as Record<string, any>;
  const vocabP   = (lf?.vocabulary_profile      || {}) as Record<string, any>;
  const emotions = (lf?.emotional_architecture  || {}) as Record<string, any>;
  const sentenceM = (lf?.sentence_metrics       || {}) as Record<string, any>;

  const brandProfile = {
    /* Identity */
    brand_archetype:          bp?.brand_archetype,
    alignment_score:          bp?.alignment_score,
    brand_archetype_reasoning: bp?.brand_archetype_reasoning,
    alignment_reasoning:      bp?.alignment_reasoning,
    target_audience:          bp?.target_audience,
    personality_summary:      bp?.personality_summary,
    brand_voice:              bp?.brand_voice,

    /* Market positioning */
    price_segment_label:      coords?.business?.price_segment_label,
    primary_industry:         coords?.content?.primary_industry,

    /* Visual */
    visual_style_tags:        coords?.visual?.visual_style_tags,

    /* Content strategy */
    key_content_themes:       coords?.content?.key_content_themes,

    /* Addressing */
    addressing: bp?.addressing ? {
      mode:       bp.addressing.mode,
      confidence: bp.addressing.confidence,
      evidence:   bp.addressing.evidence,
    } : undefined,

    /* CTA library */
    cta_library: bp?.cta_library ? {
      primary_ctas:   bp.cta_library.primary_ctas,
      secondary_ctas: bp.cta_library.secondary_ctas,
      slogans:        bp.cta_library.slogans,
      tagline:        bp.cta_library.tagline,
    } : undefined,

    /* Brand Don'ts */
    brand_dont: {
      avoid_words:  bp?.brand_dont?.avoid_words,
      avoid_topics: avoidTopics,
      avoid_tones:  bp?.brand_dont?.avoid_tones,
    },

    /* Psycholinguistic fingerprint */
    linguistic_fingerprint: lf ? {
      cognitive_complexity:     Number(psych.cognitive_complexity)    || undefined,
      emotional_intensity:      Number(psych.emotional_intensity)     || undefined,
      certainty_language:       Number(psych.certainty_language)      || undefined,
      authenticity_score:       Number(psych.authenticity_score)      || undefined,
      clout_score:              Number(psych.clout_score)             || undefined,
      analytical_thinking:      Number(psych.analytical_thinking)     || undefined,
      social_reference_density: Number(psych.social_reference_density) || undefined,
      temporal_focus:           String(psych.temporal_focus  || ''),
      primary_persuasion:       String(rhetoric.primary_persuasion || ''),
      storytelling_structure:   String(rhetoric.storytelling_structure || ''),
      vocabulary_complexity:    String(vocabP.complexity_level || ''),
      dominant_emotions:        Array.isArray(emotions.dominant_emotions) ? emotions.dominant_emotions as string[] : undefined,
      emotional_arc:            String(emotions.emotional_arc || ''),
      avg_sentence_length:      Number(sentenceM.avg_sentence_length) || undefined,
      question_ratio:           Number(sentenceM.question_ratio)      || undefined,
      exclamation_ratio:        Number(sentenceM.exclamation_ratio)   || undefined,
      sentence_length_variance: String(sentenceM.sentence_length_variance || ''),
      brand_specific_terms:     Array.isArray(vocabP.brand_specific_terms) ? vocabP.brand_specific_terms as string[] : undefined,
      power_words:              Array.isArray(vocabP.power_words)  ? vocabP.power_words  as string[] : undefined,
      avoided_words:            Array.isArray(vocabP.avoided_words) ? vocabP.avoided_words as string[] : undefined,
      opening_patterns:         Array.isArray(rhetoric.opening_patterns) ? rhetoric.opening_patterns as string[] : undefined,
      closing_patterns:         Array.isArray(rhetoric.closing_patterns) ? rhetoric.closing_patterns as string[] : undefined,
      transition_phrases:       Array.isArray(rhetoric.transition_phrases) ? rhetoric.transition_phrases as string[] : undefined,
    } : undefined,
  };

  return {
    id: `kit-v${version}`,
    version,
    createdAt: new Date().toISOString(),
    name: companyName,
    colors: { primary, secondary, accent, rules: colorRules },
    typography: {
      fontName: 'Montserrat',
      titleSize: '48px',
      subtitleSize: '22px',
      bodySize: '15px',
      maxLineLength: 40,
    },
    logoUrl: '',
    logoPosition: 'top-left',
    tone,
    toneExampleGood: bp?.personality_summary || '',
    toneExampleBad,
    visualRules: colorRules ? [colorRules] : [],
    negativePrompt: avoidTopics.join(', '),
    brandDna:     mappedDna,
    brandProfile,
  };
}


function saveResult(data: AuditResult | null, url: string, tab: string) {
  try {
    if (data) {
      sessionStorage.setItem(STORAGE_KEY_RESULT, JSON.stringify(data));
      sessionStorage.setItem(STORAGE_KEY_URL, url);
      sessionStorage.setItem(STORAGE_KEY_TAB, tab);
    }
  } catch { /* storage full — silently ignore */ }
}

/* ════════════════════════════════ Component ════════════════════════════════ */

export default function ZomboAuditPage() {
  const [url, setUrl] = useState(() => sessionStorage.getItem(STORAGE_KEY_URL) || '');
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<AuditResult | null>(() => loadStoredResult());
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem(STORAGE_KEY_TAB) || 'seo');
  const [productSearch, setProductSearch] = useState('');
  const [productBrand, setProductBrand] = useState('');

  // AI generation states
  const [genPostPrompt, setGenPostPrompt] = useState('');
  const [genPostPlatform, setGenPostPlatform] = useState('instagram');
  const [genPostResult, setGenPostResult] = useState('');
  const [genPostLoading, setGenPostLoading] = useState(false);
  const [consistencyScore, setConsistencyScore] = useState<{overall_score: number; feedback: string} | null>(null);
  const [genImgPrompt, setGenImgPrompt] = useState('');
  const [genImgContentType, setGenImgContentType] = useState('uj_termek');
  const [genImgFormat, setGenImgFormat] = useState('feed');
  const [genImgVariantCount, setGenImgVariantCount] = useState(3);
  const [genImgVariants, setGenImgVariants] = useState<any[]>([]);
  const [genImgLoading, setGenImgLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const [loadingCategory, setLoadingCategory] = useState<Record<string, boolean>>({});

  // Cloned image generator states
  const [brandKits, setBrandKits] = useState<ZomboBrandKit[]>(() => {
    const stored = loadStoredResult();
    if (stored) {
      return [deriveBrandKitFromAudit(stored, 1)];
    }
    return [];
  });
  const [activeKitId, setActiveKitId] = useState<string>(() => {
    const stored = loadStoredResult();
    if (stored) {
      return 'kit-v1';
    }
    return '';
  });
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [creatives, setCreatives] = useState<ZomboPostCreative[]>([]);
  const [logs, setLogs] = useState<ZomboSystemLog[]>([]);
  const [shouldSimulateError, setShouldSimulateError] = useState<boolean>(false);
  const [genSubTab, setGenSubTab] = useState<'dashboard' | 'campaigns' | 'imagelab' | 'overlay-lab' | 'brandkit' | 'calendar' | 'admin' | 'social-manager'>('dashboard');

  // Social Manager batch state
  interface SocialBatchItem {
    index: number;
    post_text: string;
    image_prompt: string;
    image_url: string;
    content_type: string;
  }
  const [socialItems, setSocialItems] = useState<SocialBatchItem[]>([]);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialStatus, setSocialStatus] = useState('');
  const [socialProgress, setSocialProgress] = useState<string[]>([]);
  const socialAbortRef = useRef<AbortController | null>(null);

  // Hoisted Prod Calendar / Quick Post states
  const [prodPosts, setProdPosts] = useState<ZomboPostCreative[]>([]);
  const [prodBypassOnboarding, setProdBypassOnboarding] = useState(false);

  const addLog = useCallback((message: string, level: 'info' | 'warn' | 'error' | 'success', step?: 'queue' | 'orchestrator' | 'renderer' | 'meta-api') => {
    const newLog: ZomboSystemLog = {
      id: `log-added-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      level,
      message,
      step
    };
    setLogs(prev => [newLog, ...prev]);
  }, []);

  const handleGenerateStart = useCallback((briefText: string) => {
    addLog(`Új generálási folyamat elindítva brief alapján: "${briefText}"`, 'info', 'queue');
  }, [addLog]);

  const handleCampaignComplete = useCallback((_newCampaign: ZomboCampaign, newLogs: ZomboSystemLog[]) => {
    setLogs(prev => [...newLogs, ...prev]);
  }, []);

  const handleGenerateComplete = useCallback((newCreatives: ZomboPostCreative[], newLogs: ZomboSystemLog[]) => {
    setCreatives(prev => [...newCreatives, ...prev]);
    setLogs(prev => [...newLogs, ...prev]);
  }, []);

  const handleApprove = useCallback((id: string) => {
    setCreatives(prev =>
      prev.map(p => (p.id === id ? { ...p, status: 'approved' } : p))
    );
    addLog(`Kreatív jóváhagyva (ID: ${id.substring(0, 8)}). Készen áll az ütemezésre vagy publikálásra.`, 'success', 'queue');
  }, [addLog]);

  const handleReject = useCallback((id: string) => {
    setCreatives(prev =>
      prev.map(p => (p.id === id ? { ...p, status: 'rejected' } : p))
    );
    addLog(`Kreatív elutasítva és elvetve (ID: ${id.substring(0, 8)}).`, 'warn', 'queue');
  }, [addLog]);

  const handleUpdateText = useCallback(async (id: string, newText: string) => {
    try {
      const post = creatives.find(c => c.id === id);
      if (!post) return;
      
      const activeKit = brandKits.find(k => k.id === activeKitId) || brandKits[brandKits.length - 1];
      const response = await fetch('http://localhost:3001/api/render-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post,
          brandKit: activeKit,
          text: newText
        })
      });
      
      if (!response.ok) {
        throw new Error(await response.text());
      }
      
      const updatedPost = await response.json();
      setCreatives(prev => prev.map(p => p.id === id ? updatedPost : p));
      
      addLog(`[RENDER] Playwright újrarenderelés sikeresen befejeződött (ID: ${id.substring(0, 8)}). A javított szöveg érvényesítve.`, 'success', 'renderer');
    } catch (err: any) {
      console.error(err);
      addLog(`[Hiba] Újrarenderelés sikertelen: ${err.message || err}`, 'error', 'renderer');
    }
  }, [creatives, brandKits, activeKitId, addLog]);

  const handleExtractBrandKit = useCallback(async (extractUrl: string) => {
    setIsExtracting(true);
    addLog(`[SCRAPE] Márka kinyerés elindítva a következő weboldalról: ${extractUrl}`, 'info', 'queue');
    try {
      const response = await fetch('http://localhost:3001/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: extractUrl })
      });
      
      if (!response.ok) {
        throw new Error(await response.text());
      }
      
      const scrapedKit = await response.json();
      
      setBrandKits(prev => {
        const nextVer = prev.length + 1;
        const finalKit: ZomboBrandKit = {
          ...scrapedKit,
          id: `kit-v${nextVer}`,
          version: nextVer,
          createdAt: new Date().toISOString()
        };
        setActiveKitId(finalKit.id);
        addLog(`[SUCCESS] Márka arculat sikeresen kinyerve és elmentve a(z) ${extractUrl} címről (Verzió ${nextVer})`, 'success', 'orchestrator');
        return [...prev, finalKit];
      });
    } catch (err: any) {
      console.error(err);
      addLog(`[Hiba] Márka kinyerés sikertelen: ${err.message || err}`, 'error', 'orchestrator');
    } finally {
      setIsExtracting(false);
    }
  }, [addLog]);

  const handleSchedule = useCallback((id: string, dateStr: string) => {
    setCreatives(prev =>
      prev.map(p => (p.id === id ? { ...p, status: 'scheduled', scheduledAt: dateStr } : p))
    );
    addLog(`Kreatív ütemezve (ID: ${id.substring(0, 8)}). Ütemezés dátuma: ${new Date(dateStr).toLocaleString('hu-HU')}`, 'info', 'queue');
  }, [addLog]);

  const handlePostNow = useCallback((id: string) => {
    setCreatives(prev =>
      prev.map(p => (p.id === id ? { ...p, status: 'published', publishedAt: new Date().toISOString(), instagramUrl: `https://instagram.com/p/mock_post_${Date.now()}/` } : p))
    );

    addLog(`[META API] Publikációs folyamat kezdeményezve Meta Graph API-n keresztül (ID: ${id.substring(0, 8)})`, 'info', 'meta-api');
    
    setTimeout(() => {
      addLog(`[META API] Instagram média konténer sikeresen létrehozva. (1/2 lépés kész)`, 'info', 'meta-api');
    }, 800);

    setTimeout(() => {
      addLog(`[META API] Média sikeresen publikálva. Bejegyzés URL: https://instagram.com/p/mock_post_${Date.now()}/ (2/2 kész)`, 'success', 'meta-api');
      addLog(`[RESEND API] Sikeres publikálásról szóló értesítő email elküldve Kovács Anna részére (Resend kézbesítve).`, 'success', 'queue');
    }, 1600);
  }, [addLog]);

  const handleCancelSchedule = useCallback((id: string) => {
    setCreatives(prev =>
      prev.map(p => (p.id === id ? { ...p, status: 'approved', scheduledAt: undefined } : p))
    );
    addLog(`Ütemezés törölve (ID: ${id.substring(0, 8)}). Bejegyzés visszaminősítve jóváhagyott státuszra.`, 'warn', 'queue');
  }, [addLog]);

  const handleSaveBrandKit = useCallback((newKit: ZomboBrandKit) => {
    setBrandKits(prev => [...prev, newKit]);
    setActiveKitId(newKit.id);
    addLog(`Új Brand Kit verzió elmentve és aktiválva: Verzió ${newKit.version}`, 'success', 'orchestrator');
  }, [addLog]);


  /* ── Persist active tab changes ── */
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY_TAB, activeTab); } catch {}
  }, [activeTab]);

  /* ── URL Validation ── */
  const isValidUrl = useCallback((v: string) => {
    if (!v.trim()) return false;
    return /^(https?:\/\/)?[\da-z.-]+\.[a-z.]{2,6}([/\w .-]*)*\/?$/i.test(v.trim());
  }, []);

  /* ── Per-Category Evaluation ── */
  const CATEGORY_MAP: Record<string, string> = {
    seo: 'seo', visual: 'visual', content: 'content',
    marketing: 'marketing', brand: 'brand', contact: 'contact',
    products: 'products', generate: '', prod: '', raw: ''
  };

  const handleCategoryEvaluate = useCallback(async (category: string) => {
    const backendCategory = CATEGORY_MAP[category];
    if (!backendCategory) return;
    const evalUrl = url.trim() || result?.url;
    if (!evalUrl) { showToast('Adj meg egy URL-t!', 'error'); return; }

    setLoadingCategory(prev => ({ ...prev, [category]: true }));
    try {
      const token = getToken();
      const resp = await fetch('/marketing/api/zombo/evaluate-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ url: evalUrl, category: backendCategory }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Ismeretlen hiba' }));
        throw new Error(err.detail || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (data.status === 'success' && data.data) {
        setResult(prev => {
          const merged = { ...(prev || {} as AuditResult), ...data.data, url: evalUrl };
          saveResult(merged as AuditResult, evalUrl, activeTab);
          return merged as AuditResult;
        });
        showToast(`${category.toUpperCase()} kiértékelés kész!`);
      }
    } catch (e) {
      showToast(`Hiba: ${(e as Error).message}`, 'error');
    }
    setLoadingCategory(prev => ({ ...prev, [category]: false }));
  }, [url, result, activeTab]);

  /* ── Streaming Scrape ── */
  const handleSubmit = useCallback(async () => {
    let submitUrl = url.trim();
    if (!submitUrl) { showToast('Adj meg egy URL-t!', 'error'); return; }

    // Auto-strip query/hash
    try {
      let temp = submitUrl;
      if (!/^https?:\/\//i.test(temp)) temp = 'https://' + temp;
      const parsed = new URL(temp);
      submitUrl = parsed.origin + parsed.pathname;
    } catch { /* keep as is */ }

    setLoading(true);
    setProgress('Kapcsolódás a szerverhez...');
    setResult(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const token = getToken();
      const response = await fetch('/marketing/api/zombo/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ url: submitUrl, limit }),
        signal: ctrl.signal,
      });

      if (!response.ok) throw new Error('Kapcsolódási hiba az elemző szerverhez.');

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.step === 'error') throw new Error(event.message);
            if (event.message) setProgress(event.message);
            if (event.step === 'complete' && event.data) {
              const data = event.data;
              // Parse scraper_json if string
              if (typeof data.scraper_json === 'string') {
                try { data.scraper_json = JSON.parse(data.scraper_json); } catch { /* keep as string */ }
              }
              setResult(data);
              setActiveTab('seo');
              saveResult(data, submitUrl, 'seo');
              showToast('Elemzés kész!');


              // Map brand coordinates to a new Brand Kit — uses the same deriveBrandKitFromAudit
              // as v1, guaranteeing identical logic for all auto-generated versions.
              setBrandKits(prev => {
                const nextVer = prev.length + 1;
                const newKit = deriveBrandKitFromAudit(data, nextVer);
                setActiveKitId(newKit.id);
                addLog(`[AUDIT SYMBIO] Új Brand Kit (v${nextVer}) automatikusan szinkronizálva az audit Brand DNA adatai alapján!`, 'success', 'orchestrator');
                return [...prev, newKit];
              });

            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              // JSON parse error on one line — skip
            } else {
              throw e; // rethrow server errors and connection errors
            }
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        showToast(`Hiba: ${(e as Error).message}`, 'error');
      }
    }
    setLoading(false);
    setProgress('');
  }, [url, limit, addLog]);

  /* ── AI Post Generation ── */
  const handleGenPost = useCallback(async () => {
    if (!genPostPrompt.trim()) { showToast('Adj meg egy prompt-ot!', 'error'); return; }
    setGenPostLoading(true);
    try {
      const token = getToken();
      const resp = await fetch('/marketing/api/zombo/generate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ prompt: genPostPrompt, platform: genPostPlatform }),
      });
      const data = await resp.json();
      if (data.error) { showToast(data.error, 'error'); }
      else {
        setGenPostResult(data.post || '');
        if (data.consistency_score !== undefined) {
          setConsistencyScore({ overall_score: data.consistency_score, feedback: data.consistency_feedback || '' });
        } else {
          setConsistencyScore(null);
        }
        showToast('Poszt generalva!');
      }
    } catch (e) { showToast('Hiba: ' + (e as Error).message, 'error'); }
    setGenPostLoading(false);
  }, [genPostPrompt, genPostPlatform]);

  /* ── AI Image Generation ── */
  const handleGenImage = useCallback(async () => {
    if (!genImgPrompt.trim()) { showToast('Adj meg egy briefet!', 'error'); return; }
    setGenImgLoading(true);
    setGenImgVariants([]);
    try {
      const token = getToken();
      const resp = await fetch('/marketing/api/zombo/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          brief: genImgPrompt,
          contentType: genImgContentType,
          format: genImgFormat,
          variantCount: genImgVariantCount
        }),
      });
      const data = await resp.json();
      if (data.error) {
        showToast(data.error, 'error');
      } else {
        setGenImgVariants(data.variants || []);
        showToast('Képsorozat sikeresen legenerálva!');
      }
    } catch (e) {
      showToast('Hiba: ' + (e as Error).message, 'error');
    }
    setGenImgLoading(false);
  }, [genImgPrompt, genImgContentType, genImgFormat, genImgVariantCount]);

  /* ── Products Filter ── */
  const filteredProducts = (result?.products || []).filter(p => {
    const q = productSearch.toLowerCase();
    const matchSearch = !q || (p.name?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
    const matchBrand = !productBrand || p.brand?.trim() === productBrand;
    return matchSearch && matchBrand;
  });
  const productBrands = [...new Set((result?.products || []).map(p => p.brand).filter(Boolean))];

  /* ══════════════════════════════ RENDER ══════════════════════════════ */

  /* ── Category Evaluate Button Component ── */
  const CategoryEvalButton = ({ tabId }: { tabId: string }) => {
    const backendCat = CATEGORY_MAP[tabId];
    if (!backendCat) return null;
    const isLoading = loadingCategory[tabId];
    return (
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => handleCategoryEvaluate(tabId)}
          disabled={isLoading || (!url.trim() && !result?.url)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: isLoading ? 'var(--bg3)' : 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
            color: isLoading ? 'var(--text-muted)' : '#fff',
            border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap',
            boxShadow: isLoading ? 'none' : '0 2px 6px rgba(139,92,246,0.25)',
            transition: 'all 0.2s',
          }}>
          {isLoading
            ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> Kiértékelés...</>
            : 'Kategória kiértékelés'}
        </button>
        {isLoading && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>AI feldolgozás folyamatban...</span>}
      </div>
    );
  };

  /* ── Empty State for tabs ── */
  const EmptyTabState = ({ tabId, label }: { tabId: string; label: string }) => (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center' }}>
      <CategoryEvalButton tabId={tabId} />
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginTop: 8 }}>Nincs {label} kiértékelés</div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>Kattints a gombra a kiértékelés indításához, vagy futtass egy teljes elemzést.</div>
    </div>
  );

  const renderTabContent = () => {
    const d = result;

    switch (activeTab) {
      /* ──────── SEO AUDIT ──────── */
      case 'seo': {
        if (!d?.seo?.score && !loadingCategory['seo']) return <EmptyTabState tabId="seo" label="SEO" />;
        const seo = d?.seo || {} as SeoData;
        let targetOrigin = '';
        try { targetOrigin = new URL(d?.url || '').origin; } catch { targetOrigin = d?.url || ''; }
        const h1s = seo.h1_texts || [];
        // FIX: Canonical — ha a boolean hiányzik/hamis, de a deductions_detail szerint mégis megvan, azt vesszük figyelembe
        const canonicalFromDetail = seo.deductions_detail?.find(dd => dd.criterion?.toLowerCase().includes('kanonikus') || dd.criterion?.toLowerCase().includes('canonical'));
        const hasCanonical = seo.has_canonical || (canonicalFromDetail ? canonicalFromDetail.points > 0 : false);
        const canonicalUrl = canonicalFromDetail?.reason?.match(/https?:\/\/[^\s'"]+/)?.[0] || '';

        return (
          <>
            <CategoryEvalButton tabId="seo" />
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>SEO Audit Pontszám</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {seo.score}/100 <ScoreBadge score={seo.score} />
                </div>
              </div>
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vizuális hangulat</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginTop: 8 }}>{d?.visuals?.visual_tone ?? '—'}</div>
              </div>
            </div>

            {/* SEO Detail Table */}
            <SectionCard title="SEO Részletes Elemzés" icon="">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <InfoRow label="Meta Title">
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>"{seo.title || 'Nincs megadva'}"</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hosszúság: {[...(seo.title || '')].length} karakter (ajánlott: 50-60)</div>
                  </InfoRow>
                  <InfoRow label="Meta Description">
                    <div style={{ lineHeight: 1.4, marginBottom: 2 }}>"{seo.description || 'Nincs megadva'}"</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hosszúság: {[...(seo.description || '')].length} karakter (ajánlott: 150-160)</div>
                  </InfoRow>
                  <InfoRow label="Címsorok (H1-H3)">
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span><strong>H1:</strong> {seo.h1_count} db</span>
                      <span><strong>H2:</strong> {seo.h2_count || 0} db</span>
                      <span><strong>H3:</strong> {seo.h3_count || 0} db</span>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, marginTop: 8, color: 'var(--text-muted)' }}>Megtalált H1 címsorok:</div>
                    {h1s.length > 0 ? h1s.map((h, i) => (
                      <div key={i} style={{ fontFamily: 'monospace', background: 'var(--bg3)', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', marginTop: 4, fontSize: 11, color: 'var(--text)' }}>{h}</div>
                    )) : seo.h1_count > 0
                        ? <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2, fontStyle: 'italic' }}>A backend {seo.h1_count} db H1-et talált, de a szövegek részletezése nem érhető el.</div>
                        : <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>Nincs H1 címsor az oldalon!</div>}
                  </InfoRow>
                  <InfoRow label="Képek">
                    <div>Összesen: {seo.total_images} kép</div>
                    {seo.missing_alt > 0
                      ? <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>{seo.missing_alt} képnél hiányzik az 'alt' leíró szöveg!</div>
                      : <div style={{ color: '#22c55e', fontSize: 11, marginTop: 2 }}>Minden kép rendelkezik 'alt' leíróval.</div>
                    }
                  </InfoRow>
                  <InfoRow label="Linkek">
                    <div>Összesen: {seo.total_links} link</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Belső linkek: {seo.internal_links} db | Külső linkek: {seo.external_links} db</div>
                  </InfoRow>
                  <InfoRow label="Robots & Sitemap">
                    <div style={{ marginBottom: 8 }}>
                      <strong>robots.txt:</strong>{' '}
                      {seo.has_robots ? <span style={{ color: '#22c55e', fontWeight: 600 }}>Elérhető</span> : <span style={{ color: '#ef4444', fontWeight: 600 }}>Nem található</span>}
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', wordBreak: 'break-all', marginTop: 2 }}>
                        <a href={`${targetOrigin}/robots.txt`} target="_blank" rel="noreferrer" style={{ color: '#8b5cf6', textDecoration: 'none', fontWeight: 600 }}>{targetOrigin}/robots.txt</a>
                      </div>
                    </div>
                    <div>
                      <strong>sitemap.xml:</strong>{' '}
                      {seo.has_sitemap ? <span style={{ color: '#22c55e', fontWeight: 600 }}>Elérhető</span> : <span style={{ color: '#ef4444', fontWeight: 600 }}>Nem található</span>}
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', wordBreak: 'break-all', marginTop: 2 }}>
                        <a href={`${targetOrigin}/sitemap.xml`} target="_blank" rel="noreferrer" style={{ color: '#8b5cf6', textDecoration: 'none', fontWeight: 600 }}>{targetOrigin}/sitemap.xml</a>
                      </div>
                    </div>
                  </InfoRow>
                  <InfoRow label="Nyelvi beállítások">
                    <div>HTML 'lang' attribútum: <strong>"{seo.lang_val || 'Nincs megadva'}"</strong></div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {seo.has_lang ? 'Megfelelő nyelvi deklaráció.' : 'Hiányzó nyelvi deklaráció a <html> tagen.'}
                    </div>
                  </InfoRow>
                  <InfoRow label="Schema Markup (JSON-LD)">
                    {seo.has_schema
                      ? <span style={{ color: '#22c55e', fontWeight: 600 }}>Megtalálva az oldalon</span>
                      : <span style={{ color: '#ef4444', fontWeight: 600 }}>Nincs strukturált adat (JSON-LD)</span>}
                  </InfoRow>
                  <InfoRow label="Canonical Link">
                    {hasCanonical
                      ? <>
                          <span style={{ color: '#22c55e', fontWeight: 600 }}>Canonical tag megtalálva</span>
                          {canonicalUrl && <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: 2, wordBreak: 'break-all' }}>{canonicalUrl}</div>}
                        </>
                      : <span style={{ color: '#ef4444', fontWeight: 600 }}>Hiányzó canonical tag</span>}
                  </InfoRow>
                  <InfoRow label="Mobilbarát">
                    {seo.has_viewport
                      ? <span style={{ color: '#22c55e', fontWeight: 600 }}>Megfelelő (viewport meta tag létezik)</span>
                      : <span style={{ color: '#ef4444', fontWeight: 600 }}>Nem megfelelő (hiányzik a viewport tag)</span>}
                  </InfoRow>
                  <InfoRow label="Biztonság (HTTPS)">
                    {seo.is_https
                      ? <span style={{ color: '#22c55e', fontWeight: 600 }}>SSL Tanúsítvány (HTTPS)</span>
                      : <span style={{ color: '#ef4444', fontWeight: 600 }}>Nem biztonságos kapcsolat (HTTP)</span>}
                  </InfoRow>

                </tbody>
              </table>
            </SectionCard>

            {/* Score Math */}
            {seo.deductions_detail && seo.deductions_detail.length > 0 && (
              <SectionCard title="SEO Pontszám Számítás" icon="">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'var(--bg3)', borderRadius: 8, fontWeight: 600, border: '1px solid var(--border)', fontSize: 13, marginBottom: 8 }}>
                  <span>Kiinduló pontszám</span>
                  <span style={{ color: 'var(--text-muted)' }}>0 pont</span>
                </div>
                {seo.deductions_detail.map((dd, i) => {
                  const isGood = dd.status === 'good';
                  const color = isGood ? '#22c55e' : '#ef4444';
                  const badgeBg = isGood ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)';
                  const sign = dd.points > 0 ? '+' : '';
                  return (
                    <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, background: badgeBg, borderRadius: 10, marginBottom: 8, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600, marginBottom: 4 }}>
                        <span style={{ color: 'var(--text)' }}>{dd.criterion}</span>
                        <span style={{ color, fontWeight: 700 }}>{sign}{dd.points} pont</span>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.4 }}>{dd.reason}</div>
                      {!isGood && dd.recommendation && (
                        <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg)', borderLeft: '3.5px solid #8b5cf6', borderRadius: '0 6px 6px 0', fontSize: 12, color: 'var(--text)', fontStyle: 'italic' }}>
                          <strong>Javaslat:</strong> {dd.recommendation}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(139,92,246,0.08)', borderRadius: 10, fontWeight: 700, fontSize: 14, border: '1.5px solid rgba(139,92,246,0.25)', marginTop: 12 }}>
                  <span>Végeredmény (SEO Pontszám)</span>
                  <span style={{ color: '#8b5cf6', fontSize: 16 }}>{seo.score}/100</span>
                </div>
              </SectionCard>
            )}
          </>
        );
      }

      /* ──────── VISUAL ──────── */
      case 'visual': {
        if (!d?.visuals?.top_colors_detail?.length && !loadingCategory['visual']) return <EmptyTabState tabId="visual" label="Vizuális" />;
        const vis = d?.visuals || {} as VisualsData;
        return (
          <>
            <CategoryEvalButton tabId="visual" />
            <SectionCard title="Szin Elemzes" icon="">
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Hangulat eloszlas</div>
                <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                  <div><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Meleg</span> <span style={{ fontWeight: 700 }}>{vis.warm_pct}%</span></div>
                  <div><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hideg</span> <span style={{ fontWeight: 700 }}>{vis.cool_pct}%</span></div>
                  <div><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Semleges</span> <span style={{ fontWeight: 700 }}>{vis.neutral_pct}%</span></div>
                </div>
                <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{ width: `${vis.warm_pct}%`, background: 'linear-gradient(90deg, #ef4444, #f97316)', transition: 'width 0.6s' }} />
                  <div style={{ width: `${vis.cool_pct}%`, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', transition: 'width 0.6s' }} />
                  <div style={{ width: `${vis.neutral_pct}%`, background: '#94a3b8', transition: 'width 0.6s' }} />
                </div>
              </div>

              {/* ── Two-column donut charts ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
                {/* UI Colors Donut */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>Weboldal Szinek</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>Gombok, hatterek, szovegek, keretek, bannerek, vizualok</div>
                  {(() => {
                    const colors = vis.top_colors_detail || [];
                    if (colors.length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>Nincs adat.</span>;
                    const total = colors.reduce((s, c) => s + c.pct, 0);
                    const size = 160;
                    const cx = size / 2, cy = size / 2, r = 60, strokeW = 24;
                    const circ = 2 * Math.PI * r;
                    let offset = 0;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ marginBottom: 12 }}>
                          {colors.map((c, i) => {
                            const pct = (c.pct / total) * 100;
                            const dashLen = (pct / 100) * circ;
                            const dashOff = offset;
                            offset += dashLen;
                            return (
                              <g key={i}>
                                <circle cx={cx} cy={cy} r={r}
                                  fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth={strokeW + 2}
                                  strokeDasharray={`${dashLen} ${circ - dashLen}`}
                                  strokeDashoffset={-dashOff}
                                  transform={`rotate(-90 ${cx} ${cy})`} />
                                <circle cx={cx} cy={cy} r={r}
                                  fill="none" stroke={c.hex} strokeWidth={strokeW}
                                  strokeDasharray={`${dashLen} ${circ - dashLen}`}
                                  strokeDashoffset={-dashOff}
                                  transform={`rotate(-90 ${cx} ${cy})`}
                                  style={{ transition: 'stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease' }} />
                              </g>
                            );
                          })}
                          <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text)" fontSize="18" fontWeight="800">{colors.length}</text>
                          <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--text-muted)" fontSize="9" fontWeight="600">SZIN</text>
                        </svg>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                          {colors.map((c, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border)' }}
                              onClick={() => { navigator.clipboard.writeText(c.hex); showToast('Szinkod masolva: ' + c.hex); }}>
                              <div style={{ width: 16, height: 16, borderRadius: 4, background: c.hex, border: '1.5px solid rgba(0,0,0,0.2)', boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.1)', flexShrink: 0 }} />
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{c.name || c.hex}</span>
                              <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-dim)' }}>{c.hex}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>{c.pct}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Image Colors Donut */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>Kep Szinek</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>Termekfotok, feltoltott kepek</div>
                  {(() => {
                    const raw = vis.image_colors || [];
                    const colors = raw.map(c => typeof c === 'string' ? { hex: c, name: c } : c);
                    if (colors.length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>Nincs kep szin adat.</span>;
                    const pctEach = Math.round(100 / colors.length);
                    const size = 160;
                    const cx = size / 2, cy = size / 2, r = 60, strokeW = 24;
                    const circ = 2 * Math.PI * r;
                    let offset = 0;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ marginBottom: 12 }}>
                          {colors.map((c, i) => {
                            const dashLen = (pctEach / 100) * circ;
                            const dashOff = offset;
                            offset += dashLen;
                            return (
                              <circle key={i} cx={cx} cy={cy} r={r}
                                fill="none" stroke={c.hex} strokeWidth={strokeW}
                                strokeDasharray={`${dashLen} ${circ - dashLen}`}
                                strokeDashoffset={-dashOff}
                                transform={`rotate(-90 ${cx} ${cy})`}
                                style={{ transition: 'stroke-dasharray 0.6s ease' }} />
                            );
                          })}
                          <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text)" fontSize="18" fontWeight="800">{colors.length}</text>
                          <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--text-muted)" fontSize="9" fontWeight="600">SZIN</text>
                        </svg>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                          {colors.map((c, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border)' }}
                              onClick={() => { navigator.clipboard.writeText(c.hex); showToast('Kep szinkod masolva: ' + c.hex); }}>
                              <div style={{ width: 16, height: 16, borderRadius: 4, background: c.hex, border: '1.5px solid rgba(0,0,0,0.2)', boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.1)', flexShrink: 0 }} />
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{c.name || c.hex}</span>
                              <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-dim)' }}>{c.hex}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Vizualis Stilus" icon="">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Hangulat: {vis.visual_tone}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{vis.visual_style_description || 'Nem all rendelkezesre vizualis stiluselemzes.'}</div>
            </SectionCard>
          </>
        );
      }

      /* ──────── CONTENT ──────── */
      case 'content': {
        if (!d?.content?.summary && !loadingCategory['content']) return <EmptyTabState tabId="content" label="Tartalom" />;
        const c = d?.content || {} as ContentData;
        return (
          <>
          <CategoryEvalButton tabId="content" />
          <SectionCard title="AI Tartalom Elemzés" icon="">
            {/* Word count KPI */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.5px' }}>Szavak száma</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{c.word_count ?? '—'} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>szó</span></div>
              </div>
              <div style={{ width: 1, height: 36, background: 'var(--border)' }} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {(c.word_count ?? 0) < 300 && <span style={{ color: '#ef4444' }}>⚠ Alacsony szószám — ajánlott legalább 500 szó.</span>}
                {(c.word_count ?? 0) >= 300 && (c.word_count ?? 0) < 600 && <span style={{ color: '#f59e0b' }}>Közepes szószám — fejleszthető.</span>}
                {(c.word_count ?? 0) >= 600 && <span style={{ color: '#22c55e' }}>Jó tartalommennyiség.</span>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div style={{ padding: 16, background: 'var(--bg3)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.5px' }}>Üzleti Kategória</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{c.business_category || '—'}</div>
              </div>
              <div style={{ padding: 16, background: 'var(--bg3)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.5px' }}>Hangnem</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{c.tone || '—'}</div>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Összefoglaló</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)' }}>{c.summary || '—'}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Tartalmi &amp; SEO Javaslatok</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)' }}>{c.seo_advice || '—'}</div>
            </div>

            {/* FIX 3: global_improvements */}
            {c.global_improvements && c.global_improvements.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>💡 Globális Fejlesztési Javaslatok</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {c.global_improvements.map((imp, i) => (
                    <div key={i} style={{ padding: '10px 14px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)', borderLeft: '3px solid #8b5cf6', borderRadius: 8, fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>
                      <strong>{i + 1}.</strong> {imp}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FIX 4: word_style_analysis */}
            {c.word_style_analysis && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Szövegstílus Elemzés</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7, padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)', fontStyle: 'italic' }}>{c.word_style_analysis}</div>
              </div>
            )}
          </SectionCard>

          {/* FIX 5: detected_posts */}
          {c.detected_posts && c.detected_posts.length > 0 && (
            <SectionCard title="Detekált Oldaltartalom / Posztok" icon="">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {c.detected_posts.map((dp, i) => (
                  <div key={i} style={{ padding: '12px 16px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1 }}>{dp.title || `Tartalom #${i+1}`}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {dp.placement && <span style={{ fontSize: 10, padding: '2px 7px', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', borderRadius: 5, fontWeight: 700 }}>{dp.placement}</span>}
                        {dp.inferred_popularity && <span style={{ fontSize: 10, padding: '2px 7px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 5, fontWeight: 700 }}>{dp.inferred_popularity}</span>}
                      </div>
                    </div>
                    {dp.words && dp.words.length > 0 ? (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {dp.words.slice(0, 12).map((w, j) => <Tag key={j} color="#6366f1">{w}</Tag>)}
                        {dp.words.length > 12 && <Tag color="#94a3b8">+{dp.words.length - 12} további</Tag>}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>Nincs kiegészítő kulcsszó.</div>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* FIX 6: images_analysis */}
          {c.images_analysis && c.images_analysis.length > 0 && (
            <SectionCard title="Kép Elemzés (AI)" icon="">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {c.images_analysis.map((img, i) => (
                  <div key={i} style={{ padding: 14, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12 }}>
                    {img.url ? (
                      <>
                        <img src={img.url} alt={img.alt_text || `Kep ${i+1}`}
                          style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8, marginBottom: 10, border: '1px solid var(--border)' }}
                          onError={e => {
                            const el = e.target as HTMLImageElement;
                            el.style.display = 'none';
                            const next = el.nextElementSibling as HTMLElement | null;
                            if (next) next.style.display = 'flex';
                          }} />
                        <div style={{ display: 'none', alignItems: 'center', gap: 6, height: 40, marginBottom: 10, padding: '6px 10px', background: 'var(--bg)', borderRadius: 6, border: '1px dashed var(--border)' }}>
                          <span style={{ fontSize: 16 }}>🖼️</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', wordBreak: 'break-all', fontFamily: 'monospace', flex: 1 }}>{img.url.length > 60 ? '...' + img.url.slice(-50) : img.url}</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ height: 40, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', borderRadius: 6, border: '1px dashed var(--border)' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>Nincs kép URL</span>
                      </div>
                    )}
                    {img.dominant_colors && img.dominant_colors.length > 0 && (
                      <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {img.dominant_colors.map((col, j) => (
                          <div key={j} title={col} style={{ width: 20, height: 20, borderRadius: 4, background: col, border: '1.5px solid rgba(0,0,0,0.15)', cursor: 'pointer' }}
                            onClick={() => { navigator.clipboard.writeText(col); showToast('Szín másolva: ' + col); }} />
                        ))}
                        <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 2 }}>domináns színek</span>
                      </div>
                    )}
                    {img.alt_text && (
                      <div style={{ fontSize: 10, fontStyle: 'italic', color: 'var(--text-dim)', marginBottom: 4 }}>
                        alt: "{img.alt_text}"
                      </div>
                    )}
                    {img.visual_description && (
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{img.visual_description}</div>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
          </>
        );
      }

      /* ──────── MARKETING ──────── */
      case 'marketing': {
        if (!d?.marketing_audit?.marketing_score && !loadingCategory['marketing']) return <EmptyTabState tabId="marketing" label="Marketing" />;
        const m = d?.marketing_audit || {} as MarketingAudit;
        return (
          <>
          <CategoryEvalButton tabId="marketing" />
          <SectionCard title="Marketing & Copywriting Audit" icon="">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#8b5cf6' }}>{m.marketing_score || 0}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>/ 100 Marketing Pontszám</div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <InfoRow label="Értékajánlat">{m.value_proposition_evaluation || '—'}</InfoRow>
                <InfoRow label="PAS Keretrendszer">{m.frameworks_analysis?.pas_alignment || '—'}</InfoRow>
                <InfoRow label="AIDA Keretrendszer">{m.frameworks_analysis?.aida_alignment || '—'}</InfoRow>
                <InfoRow label="CTA Értékelés">{m.cta_evaluation || '—'}</InfoRow>
                <InfoRow label="Hitelesség">{m.credibility_evaluation || '—'}</InfoRow>
              </tbody>
            </table>

            {m.copy_recommendations && m.copy_recommendations.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Javaslatok</div>
                <ul style={{ paddingLeft: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {m.copy_recommendations.map((r, i) => <li key={i} style={{ marginBottom: 4 }}>{r}</li>)}
                </ul>
              </div>
            )}
          </SectionCard>
          </>
        );
      }

      /* ──────── BRAND DNA ──────── */
      case 'brand': {
        if (!d?.brand_personality?.brand_archetype && !loadingCategory['brand']) return <EmptyTabState tabId="brand" label="Brand DNA" />;
        const bp = d?.brand_personality || {} as BrandPersonality;
        const coords = bp.brand_coordinates || { tone: {}, business: {}, visual: {}, content: {}, engagement: {} };
        const addr = bp.addressing || {};
        const cta = bp.cta_library || {} as BrandPersonality['cta_library'];
        const dont = bp.brand_dont || {} as BrandPersonality['brand_dont'];

        return (
          <>
            <CategoryEvalButton tabId="brand" />
            {/* Brand Overview */}
            <SectionCard title="Brand Személyiség" icon="">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div style={{ padding: 16, background: 'var(--bg3)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>Archetípus</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#8b5cf6', marginTop: 6 }}>{bp.brand_archetype || '—'}</div>
                </div>
                <div style={{ padding: 16, background: 'var(--bg3)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>Alignment Score</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#8b5cf6', marginTop: 6 }}>{bp.alignment_score || 0} pont</div>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <InfoRow label="Archetípus indoklás">{bp.brand_archetype_reasoning || '—'}</InfoRow>
                  <InfoRow label="Alignment indoklás">{bp.alignment_reasoning || '—'}</InfoRow>
                  <InfoRow label="Célközönség">{bp.target_audience || '—'}</InfoRow>
                  <InfoRow label="Összefoglaló">{bp.personality_summary || '—'}</InfoRow>
                  <InfoRow label="Brand Hang">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(bp.brand_voice || []).map((v, i) => <Tag key={i}>{v}</Tag>)}
                      {(!bp.brand_voice || bp.brand_voice.length === 0) && <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>}
                    </div>
                  </InfoRow>
                </tbody>
              </table>
            </SectionCard>

            {/* Brand DNA Coordinates — Radar Chart + Details */}
            <SectionCard title="Brand DNA Koordináták" icon="">
              {(() => {
                // Calculate average per dimension for the radar chart
                const avg = (vals: (number | undefined)[]) => {
                  const valid = vals.filter(v => v !== undefined && v !== null) as number[];
                  return valid.length ? Math.round(valid.reduce((s, v) => s + v, 0) / valid.length) : 0;
                };

                const toneAvg = avg([coords.tone?.formal_vs_casual, coords.tone?.rational_vs_emotional, coords.tone?.modern_vs_traditional, coords.tone?.simple_vs_technical, coords.tone?.authority_vs_peer]);
                const bizAvg = avg([coords.business?.price_segment_score, coords.business?.b2b_vs_b2c, coords.business?.product_vs_service]);
                const visAvg = avg([coords.visual?.minimalist_vs_decorative, coords.visual?.warmth_vs_coolness, coords.visual?.vibrancy]);
                const contentAvg = avg([coords.content?.humor_level, coords.content?.storytelling_level, coords.content?.educational_level, coords.content?.promotional_level]);
                const engAvg = avg([coords.engagement?.cta_aggressiveness, coords.engagement?.emoji_usage, coords.engagement?.hashtag_density, coords.engagement?.post_length_preference, coords.engagement?.interaction_asking]);

                const radarAxes: RadarAxis[] = [
                  { label: 'Hangnem', value: toneAvg, icon: '' },
                  { label: 'Üzleti', value: bizAvg, icon: '' },
                  { label: 'Vizuális', value: visAvg, icon: '' },
                  { label: 'Tartalom', value: contentAvg, icon: '' },
                  { label: 'Elköteleződés', value: engAvg, icon: '' },
                ];

                // Detail items per dimension with explanations
                const dimensions = [
                  {
                    icon: '', title: 'Hangnem', avg: toneAvg, color: '#8b5cf6',
                    items: [
                      { label: 'Formális ↔ Laza', value: coords.tone?.formal_vs_casual, low: 'Formális, hivatalos', high: 'Laza, kötetlen' },
                      { label: 'Racionális ↔ Érzelmi', value: coords.tone?.rational_vs_emotional, low: 'Tényalapú, racionális', high: 'Érzelmi, inspiráló' },
                      { label: 'Modern ↔ Tradicionális', value: coords.tone?.modern_vs_traditional, low: 'Modern, innovatív', high: 'Hagyományos, klasszikus' },
                      { label: 'Egyszerű ↔ Technikai', value: coords.tone?.simple_vs_technical, low: 'Közérthető, egyszerű', high: 'Szakkifejezéseket használ' },
                      { label: 'Tekintély ↔ Egyenrangú', value: coords.tone?.authority_vs_peer, low: 'Szakértői, tekintélyes', high: 'Baráti, egyenrangú' },
                    ]
                  },
                  {
                    icon: '', title: 'Üzleti', avg: bizAvg, color: '#3b82f6',
                    items: [
                      { label: 'Olcsó ↔ Prémium', value: coords.business?.price_segment_score, low: 'Alacsony árkategória', high: 'Prémium pozicionálás' },
                      { label: 'B2B ↔ B2C', value: coords.business?.b2b_vs_b2c, low: 'Üzleti ügyfelekre fókuszál', high: 'Végfelhasználókra fókuszál' },
                      { label: 'Termék ↔ Szolgáltatás', value: coords.business?.product_vs_service, low: 'Fizikai termékek dominálnak', high: 'Szolgáltatás központú' },
                    ],
                    extra: coords.business?.price_segment_label ? `Ár szegmens: ${coords.business.price_segment_label}` : undefined,
                  },
                  {
                    icon: '', title: 'Vizuális', avg: visAvg, color: '#ec4899',
                    items: [
                      { label: 'Minimalista ↔ Dekoratív', value: coords.visual?.minimalist_vs_decorative, low: 'Letisztult, egyszerű design', high: 'Díszített, gazdag vizuál' },
                      { label: 'Meleg ↔ Hideg', value: coords.visual?.warmth_vs_coolness, low: 'Meleg színek dominálnak', high: 'Hideg, professzionális tónus' },
                      { label: 'Visszafogott ↔ Vibráló', value: coords.visual?.vibrancy, low: 'Csendes, visszafogott', high: 'Élénk, figyelemfelkeltő' },
                    ],
                    tags: coords.visual?.visual_style_tags,
                  },
                  {
                    icon: '', title: 'Tartalom', avg: contentAvg, color: '#f59e0b',
                    items: [
                      { label: 'Komoly ↔ Humoros', value: coords.content?.humor_level, low: 'Komoly, hivatalos hangvétel', high: 'Humoros, szellemes tartalom' },
                      { label: 'Direkt ↔ Történetmesélő', value: coords.content?.storytelling_level, low: 'Direkt, lényegre törő', high: 'Narratíva-alapú tartalom' },
                      { label: 'Szórakoztató ↔ Oktató', value: coords.content?.educational_level, low: 'Szórakoztató tartalom', high: 'Edukációs, tanító jelleg' },
                      { label: 'Informatív ↔ Promóciós', value: coords.content?.promotional_level, low: 'Tájékoztató, semleges', high: 'Aktív értékesítő tartalom' },
                    ],
                    industry: coords.content?.primary_industry,
                    themes: coords.content?.key_content_themes,
                  },
                  {
                    icon: '', title: 'Elköteleződés', avg: engAvg, color: '#22c55e',
                    items: [
                      { label: 'Szelíd ↔ Agresszív CTA', value: coords.engagement?.cta_aggressiveness, low: 'Finom felhívások', high: 'Erős, sürgető CTA-k' },
                      { label: 'Emoji használat', value: coords.engagement?.emoji_usage, low: 'Nem használ emojikat', high: 'Gyakori emoji használat' },
                      { label: 'Hashtag sűrűség', value: coords.engagement?.hashtag_density, low: 'Kevés vagy nincs hashtag', high: 'Sűrű hashtag használat' },
                      { label: 'Rövid ↔ Hosszú posztok', value: coords.engagement?.post_length_preference, low: 'Tömör, rövid posztok', high: 'Részletes, hosszú posztok' },
                      { label: 'Passzív ↔ Aktív interakció', value: coords.engagement?.interaction_asking, low: 'Passzív, nem kér reakciót', high: 'Aktívan kér interakciót' },
                    ]
                  },
                ];

                return (
                  <>
                    {/* Radar Chart */}
                    <div style={{ padding: '20px 0 32px' }}>
                      <RadarChart axes={radarAxes} size={340} />
                    </div>

                    {/* Dimension Details with bullet points */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                      {dimensions.map((dim) => (
                        <div key={dim.title} style={{ background: 'var(--bg3)', borderRadius: 14, padding: '16px 18px', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{dim.icon} {dim.title}</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: dim.color, background: `${dim.color}14`, padding: '2px 10px', borderRadius: 8 }}>{dim.avg}</div>
                          </div>
                          {dim.extra && <div style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600, marginBottom: 8 }}>{dim.extra}</div>}
                          {dim.industry && <div style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600, marginBottom: 6 }}>Iparág: {dim.industry}</div>}
                          {dim.themes && dim.themes.length > 0 && (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                              {dim.themes.map((t, i) => <Tag key={i} color="#ec4899">{t}</Tag>)}
                            </div>
                          )}
                          {dim.tags && dim.tags.length > 0 && (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                              {dim.tags.map((t, i) => <Tag key={i}>{hu(t.toLowerCase())}</Tag>)}
                            </div>
                          )}
                          <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'none' }}>
                            {dim.items.map((item, i) => {
                              const v = Math.round(item.value || 0);
                              const explanation = v <= 35 ? item.low : v >= 65 ? item.high : `Kiegyensúlyozott (${item.low.split(',')[0].toLowerCase()} és ${item.high.split(',')[0].toLowerCase()} között)`;
                              return (
                                <li key={i} style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 6, position: 'relative', paddingLeft: 8 }}>
                                  <span style={{ position: 'absolute', left: -8, color: dim.color }}>•</span>
                                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{item.label}:</span>{' '}
                                  <span style={{ fontWeight: 700, color: dim.color }}>{v}</span>{' '}
                                  — {explanation}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </SectionCard>

            {/* Addressing */}
            <SectionCard title="Megszólítás" icon="">
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <div style={{ padding: '8px 16px', background: 'rgba(139,92,246,0.08)', borderRadius: 8, fontWeight: 700, color: '#8b5cf6' }}>{addr.mode || '—'}</div>
                <div style={{ padding: '8px 16px', background: 'var(--bg3)', borderRadius: 8, fontWeight: 600, color: 'var(--text-muted)' }}>Magabiztosság: {addr.confidence || 0}%</div>
              </div>
              {addr.evidence && addr.evidence.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {addr.evidence.map((e, i) => <span key={i} style={{ fontSize: 11, padding: '3px 8px', background: 'var(--bg3)', color: 'var(--text)', borderRadius: 6, border: '1px solid var(--border)', fontStyle: 'italic' }}>"{e}"</span>)}
                </div>
              )}
            </SectionCard>

            {/* CTA Library */}
            <SectionCard title="CTA Könyvtár" icon="">
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Elsődleges CTA-k</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(cta.primary_ctas || []).map((c, i) => <Tag key={i}>{c}</Tag>)}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Másodlagos CTA-k</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(cta.secondary_ctas || []).map((c, i) => <Tag key={i} color="#ec4899">{c}</Tag>)}
                </div>
              </div>
              {cta.slogans && cta.slogans.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Szlogenek</div>
                  {cta.slogans.map((s, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text)', fontStyle: 'italic' }}>"{s}"</div>)}
                </div>
              )}
              {cta.tagline && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Tagline</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#8b5cf6' }}>"{cta.tagline}"</div>
                </div>
              )}
            </SectionCard>

            {/* Brand Don't */}
            {(dont.avoid_words?.length > 0 || dont.avoid_topics?.length > 0 || dont.avoid_tones?.length > 0) && (
              <SectionCard title="Brand Don't — Kerülendő" icon="">
                {dont.avoid_words?.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>Kerülendő szavak</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{dont.avoid_words.map((w, i) => <Tag key={i} color="#ef4444">{w}</Tag>)}</div></div>}
                {dont.avoid_topics?.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>Kerülendő témák</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{dont.avoid_topics.map((t, i) => <Tag key={i} color="#ef4444">{t}</Tag>)}</div></div>}
                {dont.avoid_tones?.length > 0 && <div><div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>Kerülendő hangnem</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{dont.avoid_tones.map((t, i) => <Tag key={i} color="#ef4444">{t}</Tag>)}</div></div>}
              </SectionCard>
            )}

            {/* Linguistic Fingerprint */}
            {(() => {
              const lf = result?.linguistic_fingerprint as Record<string, unknown> | undefined;
              if (!lf || Object.keys(lf).length === 0) return null;
              const psych = (lf.psychological_markers || {}) as Record<string, unknown>;
              const rhetoric = (lf.rhetorical_patterns || {}) as Record<string, unknown>;
              const vocabP = (lf.vocabulary_profile || {}) as Record<string, unknown>;
              const emotions = (lf.emotional_architecture || {}) as Record<string, unknown>;
              const sentenceM = (lf.sentence_metrics || {}) as Record<string, unknown>;

              const PsychBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3 }}>
                    <span>{label}</span><span style={{ color }}>{value}/100</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${value}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, borderRadius: 3, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              );

              return (
                <SectionCard title="Nyelvi Ujjlenyomat (Pszicholingvisztika)" icon="">
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>Pszichologiai Markerek</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px', marginBottom: 24 }}>
                    <PsychBar label="Kognitiv komplexitas" value={Number(psych.cognitive_complexity) || 50} color="#8b5cf6" />
                    <PsychBar label="Erzelmi intenzitas" value={Number(psych.emotional_intensity) || 50} color="#ec4899" />
                    <PsychBar label="Bizonyossag nyelve" value={Number(psych.certainty_language) || 50} color="#3b82f6" />
                    <PsychBar label="Hitelesseg" value={Number(psych.authenticity_score) || 50} color="#22c55e" />
                    <PsychBar label="Tekintelyi pozicio" value={Number(psych.clout_score) || 50} color="#f59e0b" />
                    <PsychBar label="Analitikus gondolkodas" value={Number(psych.analytical_thinking) || 50} color="#6366f1" />
                    <PsychBar label="Szocialis referencia" value={Number(psych.social_reference_density) || 50} color="#14b8a6" />
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                    {!!psych.temporal_focus && <Tag color="#8b5cf6">Fokusz: {hu(String(psych.temporal_focus))}</Tag>}
                    {!!rhetoric.primary_persuasion && <Tag color="#3b82f6">Meggyozes: {hu(String(rhetoric.primary_persuasion))}</Tag>}
                    {!!rhetoric.storytelling_structure && <Tag color="#f59e0b">Narrativa: {hu(String(rhetoric.storytelling_structure))}</Tag>}
                    {!!vocabP.complexity_level && <Tag color="#22c55e">Szokincs: {hu(String(vocabP.complexity_level))}</Tag>}
                  </div>

                  {sentenceM && Object.keys(sentenceM).length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Mondatszerkezet</div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {[
                          { label: 'Atl. mondathossz', value: `${sentenceM.avg_sentence_length || '—'} szo` },
                          { label: 'Kerdesek', value: `${Math.round(Number(sentenceM.question_ratio || 0) * 100)}%` },
                          { label: 'Felkialtasok', value: `${Math.round(Number(sentenceM.exclamation_ratio || 0) * 100)}%` },
                          { label: 'Variancia', value: hu(String(sentenceM.sentence_length_variance || '—')) },
                        ].map((m, i) => (
                          <div key={i} style={{ padding: '8px 14px', background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase' }}>{m.label}</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{m.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {vocabP && (Array.isArray(vocabP.brand_specific_terms) || Array.isArray(vocabP.power_words)) && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Brand Szokincs</div>
                      {Array.isArray(vocabP.brand_specific_terms) && vocabP.brand_specific_terms.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#8b5cf6', marginBottom: 4 }}>Brand-specifikus kifejezesek</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{(vocabP.brand_specific_terms as string[]).map((t, i) => <Tag key={i} color="#8b5cf6">{t}</Tag>)}</div>
                        </div>
                      )}
                      {Array.isArray(vocabP.power_words) && vocabP.power_words.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#22c55e', marginBottom: 4 }}>Power Words</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{(vocabP.power_words as string[]).map((t, i) => <Tag key={i} color="#22c55e">{t}</Tag>)}</div>
                        </div>
                      )}
                      {Array.isArray(vocabP.avoided_words) && vocabP.avoided_words.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>Kerulendo szavak</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{(vocabP.avoided_words as string[]).map((t, i) => <Tag key={i} color="#ef4444">{t}</Tag>)}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {emotions && Object.keys(emotions).length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Erzelmi Architektura</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        {Array.isArray(emotions.dominant_emotions) && (emotions.dominant_emotions as string[]).map((e, i) => <Tag key={i} color="#ec4899">{hu(e)}</Tag>)}
                        {!!emotions.emotional_arc && <Tag color="#f59e0b">{hu(String(emotions.emotional_arc))}</Tag>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                        <PsychBar label="Surgosseg" value={Number(emotions.urgency_level) || 0} color="#ef4444" />
                        <PsychBar label="Exkluzivitas" value={Number(emotions.exclusivity_level) || 0} color="#8b5cf6" />
                        <PsychBar label="Social proof suruseg" value={Number(emotions.social_proof_density) || 0} color="#3b82f6" />
                        <PsychBar label="FOMO nyelv" value={Number(emotions.fomo_usage) || 0} color="#f59e0b" />
                      </div>
                    </div>
                  )}

                  {rhetoric && (Array.isArray(rhetoric.opening_patterns) || Array.isArray(rhetoric.closing_patterns)) && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Retorikai Mintak</div>
                      {Array.isArray(rhetoric.opening_patterns) && rhetoric.opening_patterns.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Nyito mintak</div>
                          {(rhetoric.opening_patterns as string[]).map((p, i) => (
                            <div key={i} style={{ fontSize: 12, padding: '4px 10px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 4, fontStyle: 'italic', color: 'var(--text)' }}>{`"${p}"`}</div>
                          ))}
                        </div>
                      )}
                      {Array.isArray(rhetoric.closing_patterns) && rhetoric.closing_patterns.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Zaro mintak</div>
                          {(rhetoric.closing_patterns as string[]).map((p, i) => (
                            <div key={i} style={{ fontSize: 12, padding: '4px 10px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 4, fontStyle: 'italic', color: 'var(--text)' }}>{`"${p}"`}</div>
                          ))}
                        </div>
                      )}
                      {Array.isArray(rhetoric.transition_phrases) && rhetoric.transition_phrases.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Atvezetok</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {(rhetoric.transition_phrases as string[]).map((p, i) => <Tag key={i} color="#6366f1">{p}</Tag>)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </SectionCard>
              );
            })()}
          </>
        );
      }

      /* ──────── CONTACT ──────── */
      case 'contact': {
        if (!d?.contact && !d?.contacts && !loadingCategory['contact']) return <EmptyTabState tabId="contact" label="Kontakt" />;
        const ct = (d?.contact || d?.contacts || {}) as ContactData;
        const socialPlatforms = ['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok', 'twitter', 'pinterest', 'github', 'viber', 'whatsapp', 'telegram', 'threads', 'snapchat', 'reddit', 'discord', 'twitch', 'vimeo', 'medium', 'behance', 'dribbble', 'patreon', 'soundcloud'];
        const socialLinks: Record<string, string> = {};
        for (const p of socialPlatforms) { const val = ct[p as keyof ContactData]; if (val && typeof val === 'string') socialLinks[p] = val; }
        const ctEmails = ct.emails || [];
        const ctPhones = ct.phone_numbers || [];
        const ctAddresses = ct.addresses || [];
        const openHours = ct.opening_hours;
        return (
          <>
          <CategoryEvalButton tabId="contact" />
          <SectionCard title="Kontakt & Ceg Adatok" icon="">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <InfoRow label="Cegnev">{(ct.company_name as string) || '\u2014'}</InfoRow>
                <InfoRow label="Cim">
                  {ctAddresses.length > 0
                    ? <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{ctAddresses.map((a, i) => <div key={i}>{a}</div>)}</div>
                    : '\u2014'}
                </InfoRow>
                <InfoRow label="Telefon">
                  {ctPhones.length > 0
                    ? <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{ctPhones.map((p, i) => <a key={i} href={`tel:${p}`} style={{ color: '#8b5cf6', textDecoration: 'none', fontWeight: 600 }}>{p}</a>)}</div>
                    : '\u2014'}
                </InfoRow>
                <InfoRow label="Email">
                  {ctEmails.length > 0
                    ? <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{ctEmails.map((e, i) => <a key={i} href={`mailto:${e}`} style={{ color: '#8b5cf6', textDecoration: 'none', fontWeight: 600 }}>{e}</a>)}</div>
                    : '\u2014'}
                </InfoRow>
                {ct.tax_number && <InfoRow label="Adoszam">{ct.tax_number as string}</InfoRow>}
                {ct.registration_number && <InfoRow label="Cegjegyzekszam">{ct.registration_number as string}</InfoRow>}
                <InfoRow label="Social Linkek">
                  {Object.keys(socialLinks).length > 0
                    ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {Object.entries(socialLinks).map(([k, v]) => (
                          <a key={k} href={v} target="_blank" rel="noreferrer" style={{ fontSize: 12, padding: '4px 10px', background: 'rgba(139,92,246,0.08)', color: '#8b5cf6', borderRadius: 8, border: '1px solid rgba(139,92,246,0.15)', fontWeight: 600, textDecoration: 'none' }}>
                            {k}
                          </a>
                        ))}
                      </div>
                    : '\u2014'}
                </InfoRow>
                {openHours && openHours.schedule && openHours.schedule.length > 0 && (
                  <InfoRow label="Nyitvatartas">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {openHours.schedule.map((s, i) => (
                        <div key={i} style={{ display: 'flex', gap: 12 }}>
                          <span style={{ fontWeight: 600, minWidth: 120 }}>{s.day}:</span>
                          <span>{s.hours}</span>
                        </div>
                      ))}
                      {openHours.note && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>{openHours.note}</div>}
                    </div>
                  </InfoRow>
                )}
              </tbody>
            </table>
          </SectionCard>
          </>
        );
      }

      /* ──────── PRODUCTS ──────── */
      case 'products': {
        if (!d?.products?.length && !loadingCategory['products']) return <EmptyTabState tabId="products" label="Termékek" />;
        return (
          <>
          <CategoryEvalButton tabId="products" />
          <SectionCard title="Termékek & Szolgáltatások" icon="">
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <input
                value={productSearch} onChange={e => setProductSearch(e.target.value)}
                placeholder="Keresés termékekben..."
                style={{ flex: 1, padding: '8px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: "'Inter', sans-serif", color: 'var(--text)', background: 'var(--bg)', outline: 'none' }}
              />
              <select value={productBrand} onChange={e => setProductBrand(e.target.value)}
                style={{ padding: '8px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: "'Inter', sans-serif", color: 'var(--text)', background: 'var(--bg)', outline: 'none' }}>
                <option value="">Minden márka</option>
                {productBrands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Nev', 'Tipus', 'Marka', 'Ar', 'Leiras', 'Link'].map(h => (
                    <th key={h} style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '12px 8px', textAlign: 'left', background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>Nem talaltunk termeket vagy szolgaltatast.</td>
                ) : filteredProducts.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 8px', fontWeight: 600, color: 'var(--text)' }}>{p.name}</td>
                    <td style={{ padding: '12px 8px' }}><span style={{ padding: '2px 8px', background: p.type === 'service' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)', border: `1px solid ${p.type === 'service' ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)'}`, borderRadius: 6, fontWeight: 600, fontSize: 11, color: p.type === 'service' ? '#f59e0b' : '#22c55e' }}>{p.type === 'service' ? 'Szolgaltatas' : 'Termek'}</span></td>
                    <td style={{ padding: '12px 8px' }}><span style={{ padding: '2px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, fontWeight: 600, fontSize: 11, color: 'var(--text)' }}>{p.brand || 'N/A'}</span></td>
                    <td style={{ padding: '12px 8px', fontWeight: 700, color: '#8b5cf6' }}>{p.price || 'N/A'}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{p.description || '\u2014'}</td>
                    <td style={{ padding: '12px 8px' }}>
                      {p.page_url && p.page_url !== 'N/A'
                        ? <a href={p.page_url} target="_blank" rel="noreferrer" style={{ color: '#8b5cf6', textDecoration: 'none', fontWeight: 600, fontSize: 11.5 }}>Oldal megnyitása ↗</a>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
          </>
        );
      }

      /* ──────── AI GENERATION ──────── */
      case 'generate': {
        if (brandKits.length === 0) {
          return (
            <div style={{
              background: 'var(--card, #1c1936)',
              border: '1px solid var(--border, rgba(255,255,255,0.08))',
              borderRadius: 16,
              padding: '60px 40px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 20,
              maxWidth: 600,
              margin: '40px auto',
              boxShadow: '0 8px 32px 0 rgba(139, 92, 246, 0.05)',
              borderColor: 'rgba(139, 92, 246, 0.15)'
            }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'rgba(139, 92, 246, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8b5cf6',
                boxShadow: '0 0 20px rgba(139, 92, 246, 0.2)'
              }}>
                <Sparkles size={32} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Márka Kit & AI Generátor Aktiválása</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                  Az AI képgenerátor és az arculati motor működéséhez szükség van a weboldal Brand DNA kiértékelésére.
                </p>
              </div>
              <div style={{ padding: '12px 18px', background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 10 }}>
                <p style={{ fontSize: '12.5px', color: '#8b5cf6', fontWeight: 600, margin: 0 }}>
                  Kérjük, futtasson egy weboldal auditot az "SEO Audit" fülön a fenti URL sáv segítségével. 
                  Az elemzés befejeztével a rendszer automatikusan felépíti a Brand DNA arculatot és betölti az AI-t!
                </p>
              </div>
            </div>
          );
        }

        const activeKit = brandKits.find(k => k.id === activeKitId) || brandKits[brandKits.length - 1];
        
        const draftCount = creatives.filter(c => c.status === 'draft').length;
        const approvedCount = creatives.filter(c => c.status === 'approved').length;
        const scheduledCount = creatives.filter(c => c.status === 'scheduled').length;

        const subTabs = [
          { id: 'dashboard', label: 'Kreatív Generátor', badge: draftCount > 0 ? draftCount : null, badgeStyle: { backgroundColor: 'var(--primary-neon)' } },
          { id: 'social-manager', label: '🤖 Social Manager', badge: socialItems.length > 0 ? String(socialItems.length) : 'Új', badgeStyle: { backgroundColor: '#22c55e' } },
          { id: 'campaigns', label: 'AI Kampányok', badge: 'Új', badgeStyle: { backgroundColor: 'var(--accent-pink)' } },
          { id: 'imagelab', label: 'Image Lab', badge: 'A/B', badgeStyle: { backgroundColor: '#f59e0b' } },
          { id: 'overlay-lab', label: 'Overlay Lab', badge: 'Új', badgeStyle: { backgroundColor: 'var(--primary-neon)' } },
          { id: 'brandkit', label: 'Brand Kit Kezelő', badge: `v${activeKit?.version}`, badgeStyle: { backgroundColor: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' } },
          { id: 'calendar', label: 'Instagram Naptár', badge: scheduledCount > 0 ? scheduledCount : null, badgeStyle: { backgroundColor: '#f59e0b', color: '#000' } },
          { id: 'admin', label: 'Háttér Diagnosztika', badge: null }
        ];

        return (
          <div className="zombo-creative-studio">
            {/* Horizontal Sub-tab bar */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
              {subTabs.map(st => {
                const isActive = genSubTab === st.id;
                return (
                  <button
                    key={st.id}
                    onClick={() => setGenSubTab(st.id as any)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 16px',
                      border: '1.5px solid var(--border)',
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: "'Inter', sans-serif",
                      background: isActive ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : 'var(--bg3)',
                      color: isActive ? '#fff' : 'var(--text-muted)',
                      boxShadow: isActive ? '0 2px 8px rgba(139,92,246,0.25)' : 'none',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = '#8b5cf6';
                        e.currentTarget.style.color = 'var(--text)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.color = 'var(--text-muted)';
                      }
                    }}
                  >
                    {st.label}
                    {st.badge && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 'bold',
                          padding: '2px 6px',
                          borderRadius: 8,
                          marginLeft: 4,
                          backgroundColor: isActive ? '#fff' : st.badgeStyle.backgroundColor,
                          color: isActive ? '#8b5cf6' : st.badgeStyle.color || '#fff',
                        }}
                      >
                        {st.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Globális Modell Info Sáv ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', marginBottom: 16, background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Képgenerálás:</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', background: 'rgba(139,92,246,0.14)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 6, fontSize: 10, fontWeight: 700, color: '#a78bfa' }}>
                ⚡ BFL Flux 2 Flex
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>•</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>aspect: 2:3</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>•</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>guidance: 4.5</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>•</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>steps: 50</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>•</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>safety: 1</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>•</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>1024×1536 px</span>
            </div>

            {/* Sub-tab Content Area */}
            <div className="zombo-studio-content" style={{ background: 'var(--bg-main)', backgroundImage: 'var(--bg-gradient)', borderRadius: 16, border: '1px solid var(--panel-border)', padding: 24, minHeight: '60vh' }}>

              {/* ── SOCIAL MANAGER ── */}
              {genSubTab === 'social-manager' && (() => {
                const handleSocialBatch = async () => {
                  if (!result) { showToast('Előbb futtass egy weboldal auditot!', 'error'); return; }
                  setSocialLoading(true);
                  setSocialItems([]);
                  setSocialProgress([]);
                  setSocialStatus('Kapcsolódás...');

                  const ctrl = new AbortController();
                  socialAbortRef.current = ctrl;

                  try {
                    const resp = await fetch('/marketing/api/zombo/social-batch', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ audit: result }),
                      signal: ctrl.signal,
                    });
                    if (!resp.ok) {
                      const err = await resp.json().catch(() => ({ error: 'HTTP hiba' }));
                      showToast(err.error || 'Hiba', 'error');
                      setSocialLoading(false);
                      return;
                    }
                    const reader = resp.body!.getReader();
                    const decoder = new TextDecoder();
                    let buf = '';
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      buf += decoder.decode(value, { stream: true });
                      const lines = buf.split('\n\n');
                      buf = lines.pop() || '';
                      for (const line of lines) {
                        const trimmed = line.replace(/^data:\s*/,'').trim();
                        if (!trimmed) continue;
                        try {
                          const ev = JSON.parse(trimmed);
                          if (ev.message) {
                            setSocialStatus(ev.message);
                            setSocialProgress(p => [...p.slice(-20), ev.message]);
                          }
                          if (ev.type === 'item_complete' && ev.item) {
                            setSocialItems(prev => {
                              const next = [...prev];
                              next[ev.item.index] = ev.item;
                              return next;
                            });
                          }
                          if (ev.type === 'complete') {
                            setSocialItems(ev.results || []);
                            showToast('✅ 10 poszt és kép kész!');
                          }
                          if (ev.type === 'error') {
                            showToast('Hiba: ' + ev.message, 'error');
                          }
                        } catch { /* skip bad line */ }
                      }
                    }
                  } catch (e: any) {
                    if (e.name !== 'AbortError') showToast('Hiba: ' + e.message, 'error');
                  }
                  setSocialLoading(false);
                  setSocialStatus('');
                };

                const contentTypeColors: Record<string, string> = {
                  termék: '#8b5cf6', lifestyle: '#3b82f6', inspiráció: '#f59e0b',
                  akció: '#ef4444', 'behind-the-scenes': '#14b8a6', oktatás: '#22c55e',
                  közösség: '#ec4899', szezon: '#f97316', értékek: '#6366f1', humor: '#fbbf24',
                };

                return (
                  <div>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          🤖 AI Social Media Manager
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                          10 poszt + kép, kizárólag a kinyert brand DNA alapján
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 6, fontSize: 10, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.3px' }}>
                            ⚡ Flux 2 Flex &bull; 1024×1024 &bull; guidance 4.5
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={socialLoading ? () => { socialAbortRef.current?.abort(); setSocialLoading(false); } : handleSocialBatch}
                        disabled={!result}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 8,
                          background: socialLoading ? 'rgba(239,68,68,0.15)' : !result ? 'var(--bg3)' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                          color: socialLoading ? '#ef4444' : !result ? 'var(--text-muted)' : '#fff',
                          border: 'none', borderRadius: 12, padding: '12px 24px',
                          fontSize: 14, fontWeight: 700, cursor: !result ? 'not-allowed' : 'pointer',
                          boxShadow: (!socialLoading && result) ? '0 4px 12px rgba(34,197,94,0.3)' : 'none',
                          transition: 'all 0.2s',
                        }}>
                        {socialLoading ? (
                          <><div style={{ width: 14, height: 14, border: '2px solid rgba(239,68,68,0.3)', borderTopColor: '#ef4444', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Leállít</>
                        ) : (
                          <><span>✨</span> {socialItems.length > 0 ? 'Újragenerálás' : '10 Poszt + Kép Generálása'}</>
                        )}
                      </button>
                    </div>

                    {/* Progress */}
                    {socialLoading && (
                      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 24, border: '1px solid rgba(34,197,94,0.2)' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#22c55e', marginBottom: 8 }}>{socialStatus}</div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                          {Array.from({ length: 10 }, (_, i) => (
                            <div key={i} style={{
                              width: 32, height: 32, borderRadius: 8,
                              background: i < socialItems.length ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.05)',
                              border: `2px solid ${i < socialItems.length ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 700, color: i < socialItems.length ? '#22c55e' : 'var(--text-dim)',
                            }}>{i + 1}</div>
                          ))}
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-dim)', maxHeight: 80, overflowY: 'auto' }}>
                          {socialProgress.slice(-5).map((p, i) => <div key={i}>{p}</div>)}
                        </div>
                      </div>
                    )}

                    {/* Empty state */}
                    {!socialLoading && socialItems.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Social Manager készen áll</div>
                        <div style={{ fontSize: 13 }}>
                          {result
                            ? 'Kattints a "10 Poszt + Kép Generálása" gombra a kezdéshez!'
                            : 'Előbb futtass egy weboldal auditot az SEO Audit fülön.'}
                        </div>
                      </div>
                    )}

                    {/* Results grid */}
                    {socialItems.length > 0 && (
                      <div style={{ columns: '2 400px', columnGap: 20 }}>
                        {socialItems.map((item, i) => {
                          const typeColor = contentTypeColors[item.content_type] || '#8b5cf6';
                          return (
                            <div key={i} style={{
                              breakInside: 'avoid',
                              marginBottom: 20,
                              background: 'var(--card, #1c1936)',
                              border: '1px solid var(--border)',
                              borderRadius: 16,
                              overflow: 'hidden',
                              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                              transition: 'transform 0.2s, box-shadow 0.2s',
                            }}
                              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)'; }}
                              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)'; }}>

                              {/* Image */}
                              {item.image_url ? (
                                <div style={{ position: 'relative' }}>
                                  <img
                                    src={item.image_url}
                                    alt={`Poszt ${i + 1}`}
                                    style={{ width: '100%', display: 'block', aspectRatio: '1/1', objectFit: 'cover' }}
                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                  <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
                                    <span style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>#{i + 1}</span>
                                    <span style={{ background: `${typeColor}cc`, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>{item.content_type}</span>
                                  </div>
                                  <button
                                    onClick={() => window.open(item.image_url, '_blank')}
                                    style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 10px', cursor: 'pointer' }}>
                                    ↗ Megnyitás
                                  </button>
                                </div>
                              ) : (
                                <div style={{ width: '100%', aspectRatio: '1/1', background: 'rgba(139,92,246,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--text-muted)' }}>
                                  <div style={{ fontSize: 32 }}>🎨</div>
                                  <div style={{ fontSize: 11 }}>Kép generálás folyamatban...</div>
                                </div>
                              )}

                              {/* Post text */}
                              <div style={{ padding: '16px 18px' }}>
                                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.65, marginBottom: 14, whiteSpace: 'pre-wrap' }}>
                                  {item.post_text}
                                </div>

                                {/* Copy button */}
                                <button
                                  onClick={() => { navigator.clipboard.writeText(item.post_text); showToast('Poszt szöveg másolva!'); }}
                                  style={{ width: '100%', padding: '8px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, color: '#8b5cf6', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 12, transition: 'all 0.2s' }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.15)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.08)'; }}>
                                  📋 Szöveg másolása
                                </button>

                                {/* Image prompt */}
                                <details style={{ marginTop: 4 }}>
                                  <summary style={{ fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer', fontWeight: 600, userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span>▶</span> Kép prompt megtekintése
                                  </summary>
                                  <div style={{
                                    marginTop: 8, padding: '10px 12px',
                                    background: 'rgba(0,0,0,0.3)', borderRadius: 8,
                                    fontFamily: 'monospace', fontSize: 10.5,
                                    color: 'var(--text-muted)', lineHeight: 1.6,
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    wordBreak: 'break-word',
                                  }}>
                                    {item.image_prompt}
                                  </div>
                                </details>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {genSubTab === 'dashboard' && (

                <div className="dashboard-layout">
                  <div className="dashboard-grid-left">
                    <GeneratorSimulator
                      activeBrandKit={activeKit}
                      onGenerateStart={handleGenerateStart}
                      onGenerateComplete={handleGenerateComplete}
                      shouldSimulateError={shouldSimulateError}
                      pastApproved={creatives.filter(c => c.status === 'approved')}
                    />
                    <div className="draft-creatives-section">
                      <div className="section-title-row">
                        <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Generált Kreatívok</h3>
                        <p className="subtitle">Elkészült tervek (Jóváhagyásra vár)</p>
                      </div>
                      {creatives.filter(c => c.status === 'draft').length === 0 ? (
                        <div className="empty-state-panel glass-panel">
                          <CheckCircle size={32} className="empty-state-icon" />
                          <h4>Nincs jóváhagyásra váró kreatív</h4>
                          <p>Írj be egy témát felül és indítsd el a generátort!</p>
                        </div>
                      ) : (
                        <div className="creatives-display-grid">
                          {creatives.filter(c => c.status === 'draft').map(post => (
                            <CreativeCard
                              key={post.id}
                              post={post}
                              brandKit={activeKit}
                              onApprove={handleApprove}
                              onReject={handleReject}
                              onUpdateText={handleUpdateText}
                              onSchedule={handleSchedule}
                              onPostNow={handlePostNow}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="dashboard-summary-sidebar">
                    <div className="glass-panel summary-widget">
                      <h4 className="widget-title"><Palette size={16} /> Aktív Brand Kit</h4>
                      <div className="quick-kit-details">
                        <div className="quick-row">
                          <span className="lbl">Aktív Verzió:</span>
                          <span className="val highlight">v{activeKit?.version}</span>
                        </div>
                        <div className="quick-row">
                          <span className="lbl">Betűtípus:</span>
                          <span className="val" style={{ fontFamily: activeKit?.typography?.fontName }}>{activeKit?.typography?.fontName}</span>
                        </div>
                        <div className="quick-colors-row">
                          <div className="dot-color" style={{ backgroundColor: activeKit?.colors?.primary }} title="Primary" />
                          <div className="dot-color" style={{ backgroundColor: activeKit?.colors?.secondary }} title="Secondary" />
                          <div className="dot-color" style={{ backgroundColor: activeKit?.colors?.accent }} title="Accent" />
                        </div>
                      </div>
                    </div>

                    <div className="glass-panel summary-widget">
                      <h4 className="widget-title"><Grid size={16} /> Kampány Statisztika</h4>
                      <div className="stats-list">
                        <div className="stat-row"><span className="stat-label">Vázlat</span><span className="stat-val badge-draft">{draftCount} db</span></div>
                        <div className="stat-row"><span className="stat-label">Jóváhagyott</span><span className="stat-val badge-approved">{creatives.filter(c => c.status === 'approved').length} db</span></div>
                        <div className="stat-row"><span className="stat-label">Ütemezett</span><span className="stat-val badge-scheduled">{scheduledCount} db</span></div>
                        <div className="stat-row"><span className="stat-label">Közzétett</span><span className="stat-val badge-published">{creatives.filter(c => c.status === 'published').length} db</span></div>
                      </div>
                    </div>

                    <div className="glass-panel summary-widget approvals-scroller">
                      <h4 className="widget-title"><CheckCircle size={16} /> Jóváhagyott Kreatívok</h4>
                      {creatives.filter(c => c.status === 'approved').length === 0 ? (
                        <p className="no-approvals-text">Nincs jóváhagyott poszt. Kérjük, hagyj jóvá egyet a generáltak közül!</p>
                      ) : (
                        <div className="approvals-column-list">
                          {creatives.filter(c => c.status === 'approved').map(post => (
                            <CreativeCard
                              key={post.id}
                              post={post}
                              brandKit={activeKit}
                              onApprove={handleApprove}
                              onReject={handleReject}
                              onUpdateText={handleUpdateText}
                              onSchedule={handleSchedule}
                              onPostNow={handlePostNow}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {genSubTab === 'campaigns' && (
                <CampaignCreator
                  activeBrandKit={activeKit}
                  onGenerateStart={handleGenerateStart}
                  onCampaignComplete={handleCampaignComplete}
                  shouldSimulateError={shouldSimulateError}
                  creatives={creatives}
                  setCreatives={setCreatives}
                />
              )}

              {genSubTab === 'imagelab' && <ImageTestLab activeBrandKit={activeKit} auditResult={result} />}

              {genSubTab === 'overlay-lab' && <OverlayTestLab activeBrandKit={activeKit} />}

              {genSubTab === 'brandkit' && (
                <BrandKitView
                  brandKits={brandKits}
                  activeKitId={activeKitId}
                  onSelectKit={setActiveKitId}
                  onSaveKit={handleSaveBrandKit}
                  onExtractBrandKit={handleExtractBrandKit}
                  isExtracting={isExtracting}
                />
              )}

              {genSubTab === 'calendar' && (
                <ScheduleView
                  scheduledPosts={creatives}
                  onCancelSchedule={handleCancelSchedule}
                />
              )}

              {genSubTab === 'admin' && (
                <AdminMonitor
                  logs={logs}
                  onClearLogs={() => setLogs([])}
                  shouldSimulateError={shouldSimulateError}
                  onToggleSimulateError={() => setShouldSimulateError(!shouldSimulateError)}
                />
              )}
            </div>
          </div>
        );
      }

      /* ──────── PROD CALENDAR VIEW ──────── */
      case 'prod': {
        const activeKit = brandKits.find(k => k.id === activeKitId) || brandKits[brandKits.length - 1];
        return (
          <ProdCalendarView
            activeBrandKit={activeKit}
            auditResult={result}
            posts={prodPosts}
            setPosts={setProdPosts}
            bypassOnboarding={prodBypassOnboarding}
            setBypassOnboarding={setProdBypassOnboarding}
          />
        );
      }

      /* ──────── QUICK POST (Flow 4) ──────── */
      case 'quick-post': {
        const activeKit = brandKits.find(k => k.id === activeKitId) || brandKits[brandKits.length - 1];
        return (
          <QuickPostView
            activeBrandKit={activeKit}
            auditResult={result}
            onSavePost={(post) => {
              setProdPosts(prev => {
                if (prev.some(p => p.id === post.id)) return prev;
                return [...prev, post];
              });
              setProdBypassOnboarding(true);
            }}
          />
        );
      }

      /* ──────── RAW JSON ──────── */
      case 'raw': {
        const jsonStr = JSON.stringify(d?.scraper_json || {}, null, 2);
        return (
          <SectionCard title="Nyers Scraper JSON" icon="{ }">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button onClick={() => { navigator.clipboard.writeText(jsonStr); showToast('JSON másolva a vágólapra!'); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                Másolás
              </button>
            </div>
            <pre style={{ background: 'var(--bg3)', borderRadius: 10, padding: 16, fontSize: 11, lineHeight: 1.5, color: 'var(--text-muted)', overflow: 'auto', maxHeight: 500, border: '1px solid var(--border)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {jsonStr}
            </pre>
          </SectionCard>
        );
      }

      default: return null;
    }
  };

  /* ══════════════════════════════ MAIN RETURN ══════════════════════════════ */
  return (
    <div className="page active">
      {/* Header */}
      <div className="mkt-page-header">
        <div className="mkt-page-header-icon" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(109,40,217,0.15))' }}>
          <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /><path d="M2 12h20" /></svg>
        </div>
        <div>
          <div className="mkt-page-title">Zombo Weboldal Audit</div>
          <div className="mkt-page-subtitle">Multi-ágensű alapú keresőoptimalizálás és vizuális tartalomelemzés</div>
        </div>
      </div>

      {/* Info Banner */}
      <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 12, padding: '12px 18px', marginBottom: 20, fontSize: 12, color: '#8b5cf6', lineHeight: 1.5 }}>
        Adj meg egy URL-t, és állítsd be a feltérképezendő oldalszámot. A Scraper és SEO Specialist ágensek mélyrehatóan feltérképezik és kiértékelik a weboldalt.
      </div>

      {/* URL Input Row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Weboldal URL címe</label>
          <input
            value={url} onChange={e => setUrl(e.target.value)}
            placeholder="pl. bagira.hu vagy https://444.hu"
            onKeyDown={e => e.key === 'Enter' && isValidUrl(url) && handleSubmit()}
            style={{
              width: '100%', padding: '10px 14px', border: `1.5px solid ${url && !isValidUrl(url) ? '#ef4444' : isValidUrl(url) ? '#8b5cf6' : 'var(--border)'}`,
              borderRadius: 10, fontSize: 13, fontFamily: "'Inter', sans-serif", color: 'var(--text)', background: 'var(--bg)', outline: 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
          />
          {url && !isValidUrl(url) && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>Érvénytelen URL formátum</div>}
          {url && isValidUrl(url) && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>Érvényes URL</div>}
        </div>

        <div style={{ width: 180 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Párhuzamos lapok: {limit}</label>
          <input type="range" min={1} max={30} value={limit} onChange={e => setLimit(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#8b5cf6' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)' }}><span>1</span><span>{limit} oldal</span></div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !isValidUrl(url)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: loading || !isValidUrl(url) ? 'var(--bg3)' : 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
            color: loading || !isValidUrl(url) ? 'var(--text-muted)' : '#fff',
            border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600,
            cursor: loading || !isValidUrl(url) ? 'not-allowed' : 'pointer',
            fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap',
            boxShadow: loading || !isValidUrl(url) ? 'none' : '0 2px 8px rgba(139,92,246,0.3)',
            transition: 'all 0.2s',
          }}>
          {loading ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> Elemzés...</> : 'Elemzés futtatása'}
        </button>

        {/* Clear / Reset button */}
        {result && !loading && (
          <button
            onClick={() => {
              setResult(null);
              setUrl('');
              setActiveTab('seo');
              setProgress('');
              setGenPostResult('');
              setGenImgPrompt('');
              setGenImgVariants([]);
              try {
                sessionStorage.removeItem(STORAGE_KEY_RESULT);
                sessionStorage.removeItem(STORAGE_KEY_URL);
                sessionStorage.removeItem(STORAGE_KEY_TAB);
              } catch {}
              showToast('Kiértékelések törölve.');
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'transparent',
              color: '#ef4444',
              border: '1.5px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 16px', fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)'; }}
          >
            Tiszta lap
          </button>
        )}
      </div>

      {/* Progress Panel */}
      {loading && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.6s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Elemzés folyamatban...</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ width: 14, height: 14, border: '2px solid rgba(139,92,246,0.1)', borderTopColor: '#8b5cf6', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
            {progress}
          </div>
        </div>
      )}

      {/* Tab Nav — always visible */}
      {!loading && (
        <>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', padding: 4, borderRadius: 12, border: '1px solid var(--border)', marginBottom: 20, flexWrap: 'wrap' }}>
            {TABS.map(t => {
              const catKey = CATEGORY_MAP[t.id];
              const hasData = result && (
                (t.id === 'seo' && result.seo?.score) ||
                (t.id === 'visual' && result.visuals?.top_colors_detail?.length) ||
                (t.id === 'content' && result.content?.summary) ||
                (t.id === 'marketing' && result.marketing_audit?.marketing_score) ||
                (t.id === 'brand' && result.brand_personality?.brand_archetype) ||
                (t.id === 'contact' && (result.contact || result.contacts)) ||
                (t.id === 'products' && result.products?.length) ||
                (t.id === 'generate') ||
                (t.id === 'prod') ||
                (t.id === 'raw' && result.scraper_json)
              );
              const isLoadingCat = loadingCategory[t.id];
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  style={{
                    padding: '8px 16px', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    transition: 'all 0.2s', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap',
                    background: activeTab === t.id ? '#8b5cf6' : 'transparent',
                    color: activeTab === t.id ? '#fff' : hasData ? 'var(--text)' : 'var(--text-dim)',
                    boxShadow: activeTab === t.id ? '0 1px 4px rgba(139,92,246,0.3)' : 'none',
                    opacity: (!hasData && !isLoadingCat && catKey) ? 0.6 : 1,
                    position: 'relative' as const,
                  }}>
                  {t.label}
                  {isLoadingCat && <span style={{ position: 'absolute', top: 2, right: 2, width: 6, height: 6, background: '#8b5cf6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          {renderTabContent()}
        </>
      )}

      {/* Spin keyframe (inline) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
