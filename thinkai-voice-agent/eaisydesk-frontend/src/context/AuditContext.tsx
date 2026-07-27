import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { getToken } from '../api/client';
import { showToast } from '../components/ui/Toast';
import { useAuth } from './AuthContext';
import type { BrandKit as ZomboBrandKit, PostCreative as ZomboPostCreative, SystemLog as ZomboSystemLog } from '../pages/marketing/zombo/types';
import { fetchSocialBrands, saveEvaluatedBrand, fetchFullBrandData, deleteSocialBrand } from '../pages/marketing/zombo/socialBrandService';

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

interface LogoDetail {
  url: string;
  width?: string;
  height?: string;
  location: string;
  theme?: 'bright' | 'dark' | string;
  cropped?: boolean;
  usage_context?: string;
}

interface VisualsData {
  visual_tone: string; warm_pct: number; cool_pct: number; neutral_pct: number;
  top_colors_detail: { hex: string; pct: number; name?: string }[];
  image_colors: ({ hex: string; name?: string } | string)[];
  visual_style_description: string;
  logo_analysis?: {
    primary_logo?: {
      url: string;
      theme?: 'bright' | 'dark' | string;
      cropped?: boolean;
      style_description?: string;
    };
    logos_breakdown?: LogoDetail[];
  };
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
  [key: string]: unknown;
}

interface ProductData {
  name: string; brand: string; price: string; description: string; page_url: string;
  type?: string; category?: string;
}

export interface AuditResult {
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

export function deriveBrandKitFromAudit(data: AuditResult, version: number): ZomboBrandKit {
  const bp = data.brand_personality;
  const coords = bp?.brand_coordinates;
  const lf = data.linguistic_fingerprint as Record<string, any> | undefined;
  const companyName = data.contact?.company_name || data.contacts?.company_name || data.seo?.title?.split(/[|-]/)[0]?.trim() || 'Márka';

  const mappedDna = coords ? {
    formal_vs_casual: coords.tone?.formal_vs_casual ?? 50,
    rational_vs_emotional: coords.tone?.rational_vs_emotional ?? 50,
    modern_vs_traditional: coords.tone?.modern_vs_traditional ?? 50,
    simple_vs_technical: coords.tone?.simple_vs_technical ?? 50,
    authority_vs_peer: coords.tone?.authority_vs_peer ?? 50,
    price_segment_score: coords.business?.price_segment_score ?? 50,
    b2b_vs_b2c: coords.business?.b2b_vs_b2c ?? 50,
    product_vs_service: coords.business?.product_vs_service ?? 50,
    minimalist_vs_decorative: coords.visual?.minimalist_vs_decorative ?? 50,
    warmth_vs_coolness: coords.visual?.warmth_vs_coolness ?? 50,
    vibrancy: coords.visual?.vibrancy ?? 50,
    humor_level: coords.content?.humor_level ?? 50,
    storytelling_level: coords.content?.storytelling_level ?? 50,
    educational_level: coords.content?.educational_level ?? 50,
    promotional_level: coords.content?.promotional_level ?? 50,
    cta_aggressiveness: coords.engagement?.cta_aggressiveness ?? 50,
    emoji_usage: coords.engagement?.emoji_usage ?? 50,
    hashtag_density: coords.engagement?.hashtag_density ?? 50,
    interaction_asking: coords.engagement?.interaction_asking ?? 50,
    post_length_preference: coords.engagement?.post_length_preference,
  } : undefined;

  const colorList = data.visuals?.top_colors_detail || [];
  const primary = colorList[0]?.hex || '#1a1a2e';
  const secondary = colorList[3]?.hex || colorList[1]?.hex || '#f8f8f8';
  const accent = colorList[2]?.hex || '#8b5cf6';
  const tone = bp?.brand_voice || [];
  const colorRules = data.visuals?.visual_style_description || '';

  const avoidTones = bp?.brand_dont?.avoid_tones?.join(', ') || '';
  const avoidWords = bp?.brand_dont?.avoid_words?.join(', ') || '';
  const avoidTopics = bp?.brand_dont?.avoid_topics || [];
  const toneExampleBad = [
    avoidTones && `Kerülendő hangnemek: ${avoidTones}.`,
    avoidWords && `Kerülendő szavak: ${avoidWords}.`,
  ].filter(Boolean).join(' ') || '';

  const brandProfile = {
    brand_archetype: bp?.brand_archetype,
    alignment_score: bp?.alignment_score,
    brand_archetype_reasoning: bp?.brand_archetype_reasoning,
    alignment_reasoning: bp?.alignment_reasoning,
    target_audience: bp?.target_audience,
    personality_summary: bp?.personality_summary,
    brand_voice: bp?.brand_voice,
    price_segment_label: coords?.business?.price_segment_label,
    primary_industry: coords?.content?.primary_industry,
    visual_style_tags: coords?.visual?.visual_style_tags,
    key_content_themes: coords?.content?.key_content_themes,
    addressing: bp?.addressing ? {
      mode: bp.addressing.mode,
      confidence: bp.addressing.confidence,
      evidence: bp.addressing.evidence,
    } : undefined,
    cta_library: bp?.cta_library ? {
      primary_ctas: bp.cta_library.primary_ctas,
      secondary_ctas: bp.cta_library.secondary_ctas,
      slogans: bp.cta_library.slogans,
      tagline: bp.cta_library.tagline,
    } : undefined,
    brand_dont: {
      avoid_words: bp?.brand_dont?.avoid_words,
      avoid_topics: avoidTopics,
      avoid_tones: bp?.brand_dont?.avoid_tones,
    },
    linguistic_fingerprint: lf ? {
      cognitive_complexity: Number(lf.cognitive_complexity) || undefined,
      emotional_intensity: Number(lf.emotional_intensity) || undefined,
      certainty_language: Number(lf.certainty_language) || undefined,
      authenticity_score: Number(lf.authenticity_score) || undefined,
      clout_score: Number(lf.clout_score) || undefined,
      analytical_thinking: Number(lf.analytical_thinking) || undefined,
      social_reference_density: Number(lf.social_reference_density) || undefined,
      temporal_focus: String(lf.temporal_focus || ''),
      primary_persuasion: String(lf.rhetorical_patterns?.primary_persuasion || ''),
      storytelling_structure: String(lf.rhetorical_patterns?.storytelling_structure || ''),
      vocabulary_complexity: String(lf.vocabulary_profile?.complexity_level || ''),
      dominant_emotions: Array.isArray(lf.emotional_architecture?.dominant_emotions) ? lf.emotional_architecture.dominant_emotions as string[] : undefined,
      emotional_arc: String(lf.emotional_architecture?.emotional_arc || ''),
      avg_sentence_length: Number(lf.sentence_metrics?.avg_sentence_length) || undefined,
      question_ratio: Number(lf.sentence_metrics?.question_ratio) || undefined,
      exclamation_ratio: Number(lf.sentence_metrics?.exclamation_ratio) || undefined,
      sentence_length_variance: String(lf.sentence_metrics?.sentence_length_variance || ''),
      brand_specific_terms: Array.isArray(lf.vocabulary_profile?.brand_specific_terms) ? lf.vocabulary_profile.brand_specific_terms as string[] : undefined,
      power_words: Array.isArray(lf.vocabulary_profile?.power_words) ? lf.vocabulary_profile.power_words as string[] : undefined,
      avoided_words: Array.isArray(lf.vocabulary_profile?.avoided_words) ? lf.vocabulary_profile.avoided_words as string[] : undefined,
      opening_patterns: Array.isArray(lf.rhetorical_patterns?.opening_patterns) ? lf.rhetorical_patterns.opening_patterns as string[] : undefined,
      closing_patterns: Array.isArray(lf.rhetorical_patterns?.closing_patterns) ? lf.rhetorical_patterns.closing_patterns as string[] : undefined,
      transition_phrases: Array.isArray(lf.rhetorical_patterns?.transition_phrases) ? lf.rhetorical_patterns.transition_phrases as string[] : undefined,
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
    brandDna: mappedDna,
    brandProfile,
  };
}

export function sanitizeUrl(input: string): string {
  let str = input.trim();
  if (!str) return '';
  str = str.replace(/https?:\/\/w{4,}\./gi, 'https://www.');
  str = str.replace(/^w{4,}\./gi, 'www.');
  const httpMatches = str.match(/https?:\/\/[^\s"'<>]+/gi);
  if (httpMatches && httpMatches.length > 0) {
    str = httpMatches[0];
  }
  if (!/^https?:\/\//i.test(str)) {
    str = 'https://' + str;
  }
  try {
    const parsed = new URL(str);
    let hostname = parsed.hostname.replace(/^w{4,}\./i, 'www.');
    let pathname = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.protocol}//${hostname}${pathname}`;
  } catch {
    return str.split('?')[0].split('#')[0];
  }
}

const STORAGE_KEY_RESULT = 'zombo_audit_result';
const STORAGE_KEY_URL = 'zombo_audit_url';
const STORAGE_KEY_TAB = 'zombo_audit_tab';

function loadStoredResult(): AuditResult | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_RESULT);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveResult(data: AuditResult | null, url: string, tab: string) {
  try {
    if (data) {
      sessionStorage.setItem(STORAGE_KEY_RESULT, JSON.stringify(data));
      sessionStorage.setItem(STORAGE_KEY_URL, url);
      sessionStorage.setItem(STORAGE_KEY_TAB, tab);
    }
  } catch { }
}

/* ════════════════════════════════ Context ════════════════════════════════ */

interface AuditContextValue {
  url: string;
  setUrl: (u: string) => void;
  limit: number;
  setLimit: (l: number) => void;
  loading: boolean;
  progress: string;
  result: AuditResult | null;
  setResult: (r: AuditResult | null) => void;
  activeBrand: SocialBrand | null;
  setActiveBrand: (b: SocialBrand | null) => void;
  allBrands: SocialBrand[];
  setAllBrands: (brands: SocialBrand[]) => void;
  brandKits: ZomboBrandKit[];
  setBrandKits: React.Dispatch<React.SetStateAction<ZomboBrandKit[]>>;
  activeKitId: string;
  setActiveKitId: (id: string) => void;
  creatives: ZomboPostCreative[];
  setCreatives: React.Dispatch<React.SetStateAction<ZomboPostCreative[]>>;
  logs: ZomboSystemLog[];
  setLogs: React.Dispatch<React.SetStateAction<ZomboSystemLog[]>>;
  addLog: (message: string, level: 'info' | 'warn' | 'error' | 'success', step?: 'queue' | 'orchestrator' | 'renderer' | 'meta-api') => void;
  handleSubmit: () => Promise<void>;
  handleSelectBrand: (brand: SocialBrand) => Promise<void>;
  handleDeleteBrand: (brandId: string) => Promise<void>;
  handleAuditNewPage: () => void;
  isValidUrl: (v: string) => boolean;
  handleReevaluateSection: (section: string) => Promise<void>;
}

const AuditContext = createContext<AuditContextValue | null>(null);

export function AuditProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [activeBrand, setActiveBrand] = useState<SocialBrand | null>(null);
  const [allBrands, setAllBrands] = useState<SocialBrand[]>([]);
  const [url, setUrl] = useState(() => sessionStorage.getItem(STORAGE_KEY_URL) || '');
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<AuditResult | null>(() => loadStoredResult());

  const [brandKits, setBrandKits] = useState<ZomboBrandKit[]>(() => {
    const stored = loadStoredResult();
    if (stored) return [deriveBrandKitFromAudit(stored, 1)];
    return [];
  });
  const [activeKitId, setActiveKitId] = useState<string>(() => {
    const stored = loadStoredResult();
    if (stored) return 'kit-v1';
    return '';
  });
  const [creatives, setCreatives] = useState<ZomboPostCreative[]>([]);
  const [logs, setLogs] = useState<ZomboSystemLog[]>([]);

  const abortRef = useRef<AbortController | null>(null);

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

  const isValidUrl = useCallback((v: string) => {
    if (!v.trim()) return false;
    const sanitized = sanitizeUrl(v);
    try {
      const parsed = new URL(sanitized);
      return parsed.hostname.includes('.') && parsed.hostname.replace('www.', '').length > 2;
    } catch {
      return /^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(sanitized);
    }
  }, []);

  const initBrands = useCallback(async () => {
    const ownerId = user?.username || 'local_admin';
    const brandsList = await fetchSocialBrands(ownerId);
    setAllBrands(brandsList);

    const savedBrandId = sessionStorage.getItem('social_planner_active_brand_id');
    if (savedBrandId) {
      const fullData = await fetchFullBrandData(savedBrandId);
      if (fullData) {
        setActiveBrand(fullData.brand);
        if (fullData.brandKit) {
          setBrandKits([fullData.brandKit]);
          setActiveKitId(fullData.brandKit.id);
        }
        if (fullData.auditResult) {
          setResult(fullData.auditResult);
          setUrl(fullData.brand.domain);
        }
      }
    }
  }, [user]);

  useEffect(() => {
    initBrands();
  }, [initBrands]);

  const handleSelectBrand = useCallback(async (brand: SocialBrand) => {
    setActiveBrand(brand);
    sessionStorage.setItem('social_planner_active_brand_id', brand.id);

    const fullData = await fetchFullBrandData(brand.id);
    if (fullData) {
      if (fullData.brandKit) {
        setBrandKits([fullData.brandKit]);
        setActiveKitId(fullData.brandKit.id);
      }
      if (fullData.auditResult) {
        setResult(fullData.auditResult);
      }
    }
  }, []);

  const handleAuditNewPage = useCallback(() => {
    setActiveBrand(null);
    sessionStorage.removeItem('social_planner_active_brand_id');
    setResult(null);
    setUrl('');
  }, []);

  const handleSubmit = useCallback(async () => {
    const submitUrl = sanitizeUrl(url);
    if (!submitUrl || !isValidUrl(submitUrl)) { showToast('Adj meg egy érvényes URL-t!', 'error'); return; }

    setUrl(submitUrl);
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
              if (typeof data.scraper_json === 'string') {
                try { data.scraper_json = JSON.parse(data.scraper_json); } catch { }
              }
              setResult(data);
              saveResult(data, submitUrl, 'seo');
              showToast('Elemzés kész!');

              const nextVer = brandKits.length + 1;
              const newKit = deriveBrandKitFromAudit(data, nextVer);
              setActiveKitId(newKit.id);
              setBrandKits(prev => [...prev, newKit]);
              addLog(`[AUDIT SYMBIO] Új Brand Kit (v${nextVer}) automatikusan szinkronizálva az audit Brand DNA adatai alapján!`, 'success', 'orchestrator');

              const computedBrandName = data.contact?.company_name || data.contacts?.company_name || data.seo?.title?.split(/[|-]/)[0]?.trim() || submitUrl;
              const ownerId = user?.username || 'local_admin';

              saveEvaluatedBrand({
                domain: data.url || submitUrl,
                brandName: computedBrandName,
                logoUrl: newKit.logoUrl || undefined,
                brandDna: newKit.brandDna,
                brandKit: newKit,
                auditResult: data,
                ownerId: ownerId
              }).then(savedBrand => {
                if (savedBrand) {
                  setActiveBrand(savedBrand);
                  sessionStorage.setItem('social_planner_active_brand_id', savedBrand.id);
                  fetchSocialBrands(ownerId).then(setAllBrands);

                  // Auto-insert scraped logos into media library if not present
                  const logoUrls = new Set<string>();
                  const primaryLogo = data.visuals?.logo_analysis?.primary_logo?.url;
                  if (primaryLogo && primaryLogo.trim()) logoUrls.add(primaryLogo.trim());

                  const breakdownLogos = data.visuals?.logo_analysis?.logos_breakdown || [];
                  breakdownLogos.forEach((logo: any) => {
                    if (logo && logo.url && logo.url.trim()) {
                      logoUrls.add(logo.url.trim());
                    }
                  });

                  if (logoUrls.size > 0) {
                    supabase.from('media_files')
                      .select('url')
                      .eq('brand_id', savedBrand.id)
                      .eq('is_logo', true)
                      .then(({ data: existingFiles }) => {
                        const existingUrls = new Set((existingFiles || []).map(f => f.url));
                        const uniqueNewLogoUrls = Array.from(logoUrls).filter(url => !existingUrls.has(url));

                        if (uniqueNewLogoUrls.length > 0) {
                          const logoInserts = uniqueNewLogoUrls.map((logoUrl: string) => {
                            const name = logoUrl.split('/').pop()?.split('?')[0] || 'scraped_logo.png';
                            return {
                              name,
                              url: logoUrl,
                              is_logo: true,
                              brand_id: savedBrand.id,
                              user_id: user?.id || null,
                              type: 'image/png',
                              size: 0
                            };
                          });

                          supabase.from('media_files').insert(logoInserts).then(({ error: insertErr }) => {
                            if (insertErr) {
                              console.error('[AUDIT-LOGOS] Error auto-inserting logos:', insertErr);
                            } else {
                              console.log('[AUDIT-LOGOS] Scraped logos automatically saved to media library.');
                            }
                          });
                        }
                      });
                  }
                }
              });
            }
          } catch (e) {
            if (!(e instanceof SyntaxError)) throw e;
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
  }, [url, limit, brandKits.length, user, addLog, isValidUrl]);

  const handleDeleteBrand = useCallback(async (brandId: string) => {
    const success = await deleteSocialBrand(brandId);
    if (success) {
      showToast('Kiértékelt oldal sikeresen törölve.');
      setAllBrands(prev => prev.filter(b => b.id !== brandId));
      if (activeBrand?.id === brandId) {
        handleAuditNewPage();
      }
    } else {
      showToast('Nem sikerült törölni a kiértékelt oldalt.', 'error');
    }
  }, [activeBrand, handleAuditNewPage]);

  const handleReevaluateSection = useCallback(async (section: string) => {
    if (!result || !result.url) {
      showToast('Nincs betöltve auditált oldal!', 'error');
      return;
    }
    setLoading(true);
    const sectionName = section === 'contact' ? 'Kapcsolati adatok'
      : section === 'seo' ? 'SEO elemzés'
        : section === 'colors' ? 'Színek és vizualitás'
          : section === 'content' ? 'Tartalmi elemek'
            : section === 'brand_dna' ? 'Brand DNA & stílus' : section;
    setProgress(`${sectionName} részleges újraértékelése folyamatban...`);

    try {
      const response = await fetch('/marketing/api/zombo/re-evaluate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: result.url,
          section,
          scraper_json: result.scraper_json,
          existing_data: result
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sikertelen újraértékelés.');
      }

      const resObj = await response.json();
      if (resObj.success && resObj.data) {
        const updatedData = resObj.data;
        setResult(updatedData);
        saveResult(updatedData, updatedData.url, 'seo');

        const nextVer = brandKits.length + 1;
        const newKit = deriveBrandKitFromAudit(updatedData, nextVer);
        setActiveKitId(newKit.id);
        setBrandKits(prev => [...prev, newKit]);
        addLog(`[RE-EVALUATE] ${sectionName} sikeresen frissítve! Új Brand Kit (v${nextVer}) generálva.`, 'success', 'orchestrator');

        const computedBrandName = updatedData.contact?.company_name || activeBrand?.brand_name || result.url;
        const ownerId = user?.username || 'local_admin';

        const savedBrand = await saveEvaluatedBrand({
          domain: updatedData.url,
          brandName: computedBrandName,
          logoUrl: newKit.logoUrl || undefined,
          brandDna: newKit.brandDna,
          brandKit: newKit,
          auditResult: updatedData,
          ownerId: ownerId
        });

        if (savedBrand) {
          setActiveBrand(savedBrand);
          sessionStorage.setItem('social_planner_active_brand_id', savedBrand.id);
          const brandsList = await fetchSocialBrands(ownerId);
          setAllBrands(brandsList);
        }

        showToast(`${sectionName} sikeresen újraértékelve!`);
      }
    } catch (err: any) {
      console.error('[FRONTEND-REEVALUATE-ERROR]', err);
      showToast(err.message || 'Hiba történt az újraértékelés során.', 'error');
    } finally {
      setLoading(false);
    }
  }, [result, brandKits, activeBrand, user, addLog]);

  return (
    <AuditContext.Provider value={{
      url, setUrl, limit, setLimit, loading, progress, result, setResult,
      activeBrand, setActiveBrand, allBrands, setAllBrands, brandKits, setBrandKits,
      activeKitId, setActiveKitId, creatives, setCreatives, logs, setLogs,
      addLog, handleSubmit, handleSelectBrand, handleDeleteBrand, handleAuditNewPage, isValidUrl,
      handleReevaluateSection
    }}>
      {children}
    </AuditContext.Provider>
  );
}

export function useAudit() {
  const context = useContext(AuditContext);
  if (!context) throw new Error('useAudit must be used within an AuditProvider');
  return context;
}
