import { supabase } from '../../../lib/supabase';
import type { BrandDna, BrandKit } from './types';

export interface SocialBrand {
  id: string;
  owner_id: string;
  domain: string;
  brand_name: string;
  logo_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FullBrandData {
  brand: SocialBrand;
  brandDna?: BrandDna | null;
  brandKit?: BrandKit | null;
  auditResult?: any | null;
}

/**
 * Fetches all evaluated brands for the logged-in user or local admin.
 */
export async function fetchSocialBrands(ownerId?: string): Promise<SocialBrand[]> {
  console.log('[SOCIAL-BRAND-SERVICE] fetchSocialBrands called with ownerId:', ownerId);
  try {
    let query = supabase
      .from('social_brands')
      .select('*')
      .order('updated_at', { ascending: false });

    if (ownerId) {
      query = query.eq('owner_id', ownerId);
    }

    const { data, error } = await query;
    console.log('[SOCIAL-BRAND-SERVICE] fetchSocialBrands result:', data, 'error:', error);

    if (error) {
      console.error('[SOCIAL-BRAND-SERVICE] Error fetching brands:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[SOCIAL-BRAND-SERVICE] Exception fetching brands:', err);
    return [];
  }
}

/**
 * Saves or updates a complete evaluated brand profile (Social Brand, Brand DNA, Brand Kit, Audit Report).
 */
export async function saveEvaluatedBrand(payload: {
  domain: string;
  brandName: string;
  logoUrl?: string;
  brandDna?: BrandDna;
  brandKit?: BrandKit;
  auditResult?: any;
  ownerId?: string;
}): Promise<SocialBrand | null> {
  try {
    const cleanDomain = payload.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
    const displayName = payload.brandName || cleanDomain;
    const finalOwnerId = payload.ownerId || 'local_admin';

    console.log('[SOCIAL-BRAND-SERVICE] saveEvaluatedBrand payload:', {
      cleanDomain, displayName, finalOwnerId,
      hasDna: !!payload.brandDna, hasKit: !!payload.brandKit, hasAudit: !!payload.auditResult
    });

    // 1. Upsert Social Brand
    const { data: brandList, error: brandError } = await supabase
      .from('social_brands')
      .upsert(
        {
          owner_id: finalOwnerId,
          domain: cleanDomain,
          brand_name: displayName,
          logo_url: payload.logoUrl || null,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'domain' }
      )
      .select();

    console.log('[SOCIAL-BRAND-SERVICE] upsert brand result:', brandList, 'error:', brandError);

    const brandData = brandList?.[0];

    if (brandError || !brandData) {
      console.error('[SOCIAL-BRAND-SERVICE] Error upserting social brand:', brandError);
      return null;
    }

    const brandId = brandData.id;

    // 2. Save Brand DNA if available
    if (payload.brandDna) {
      const dna = payload.brandDna;
      await supabase.from('brand_dna').upsert(
        {
          brand_id: brandId,
          tone_scores: {
            formal_vs_casual: dna.formal_vs_casual,
            rational_vs_emotional: dna.rational_vs_emotional,
            modern_vs_traditional: dna.modern_vs_traditional,
            simple_vs_technical: dna.simple_vs_technical,
            authority_vs_peer: dna.authority_vs_peer
          },
          content_pillars: {
            humor_level: dna.humor_level,
            storytelling_level: dna.storytelling_level,
            educational_level: dna.educational_level,
            promotional_level: dna.promotional_level
          },
          engagement_style: {
            cta_aggressiveness: dna.cta_aggressiveness,
            emoji_usage: dna.emoji_usage,
            hashtag_density: dna.hashtag_density,
            interaction_asking: dna.interaction_asking
          },
          visual_identity: {
            minimalist_vs_decorative: dna.minimalist_vs_decorative,
            warmth_vs_coolness: dna.warmth_vs_coolness,
            vibrancy: dna.vibrancy
          },
          updated_at: new Date().toISOString()
        },
        { onConflict: 'brand_id' }
      );
    }

    // 3. Save Brand Kit if available
    if (payload.brandKit) {
      const kit = payload.brandKit;
      await supabase.from('brand_kits').upsert(
        {
          brand_id: brandId,
          colors: kit.colors || {},
          typography: kit.typography || {},
          logo_url: kit.logoUrl || '',
          logo_position: kit.logoPosition || 'top-left',
          negative_prompt: kit.negativePrompt || '',
          tone_examples: {
            good: kit.toneExampleGood || '',
            bad: kit.toneExampleBad || '',
            tone: kit.tone || []
          },
          updated_at: new Date().toISOString()
        },
        { onConflict: 'brand_id' }
      );
    }

    // 4. Save Audit Report if available
    if (payload.auditResult) {
      await supabase.from('audit_reports').insert({
        brand_id: brandId,
        scraped_url: payload.domain,
        audit_summary: payload.auditResult
      });
    }

    return brandData;
  } catch (err) {
    console.error('[SOCIAL-BRAND-SERVICE] Exception saving brand:', err);
    return null;
  }
}

/**
 * Fetches all associated data for a specific brand.
 */
export async function fetchFullBrandData(brandId: string): Promise<FullBrandData | null> {
  try {
    const { data: brand, error: brandErr } = await supabase
      .from('social_brands')
      .select('*')
      .eq('id', brandId)
      .single();

    if (brandErr || !brand) return null;

    const [dnaRes, kitRes, auditRes] = await Promise.all([
      supabase.from('brand_dna').select('*').eq('brand_id', brandId).maybeSingle(),
      supabase.from('brand_kits').select('*').eq('brand_id', brandId).maybeSingle(),
      supabase.from('audit_reports').select('*').eq('brand_id', brandId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    ]);

    let brandDna: BrandDna | null = null;
    if (dnaRes.data) {
      const d = dnaRes.data;
      brandDna = {
        formal_vs_casual: d.tone_scores?.formal_vs_casual ?? 50,
        rational_vs_emotional: d.tone_scores?.rational_vs_emotional ?? 50,
        modern_vs_traditional: d.tone_scores?.modern_vs_traditional ?? 50,
        simple_vs_technical: d.tone_scores?.simple_vs_technical ?? 50,
        authority_vs_peer: d.tone_scores?.authority_vs_peer ?? 50,
        price_segment_score: 50,
        b2b_vs_b2c: 50,
        product_vs_service: 50,
        minimalist_vs_decorative: d.visual_identity?.minimalist_vs_decorative ?? 50,
        warmth_vs_coolness: d.visual_identity?.warmth_vs_coolness ?? 50,
        vibrancy: d.visual_identity?.vibrancy ?? 50,
        humor_level: d.content_pillars?.humor_level ?? 50,
        storytelling_level: d.content_pillars?.storytelling_level ?? 50,
        educational_level: d.content_pillars?.educational_level ?? 50,
        promotional_level: d.content_pillars?.promotional_level ?? 50,
        cta_aggressiveness: d.engagement_style?.cta_aggressiveness ?? 50,
        emoji_usage: d.engagement_style?.emoji_usage ?? 50,
        hashtag_density: d.engagement_style?.hashtag_density ?? 50,
        interaction_asking: d.engagement_style?.interaction_asking ?? 50
      };
    }

    let brandKit: BrandKit | null = null;
    if (kitRes.data) {
      const k = kitRes.data;
      brandKit = {
        id: k.id,
        version: 1,
        createdAt: k.updated_at || new Date().toISOString(),
        name: brand.brand_name,
        colors: k.colors || { primary: '#1e293b', secondary: '#3b82f6', accent: '#f59e0b', rules: '' },
        typography: k.typography || { fontName: 'Inter', titleSize: '24px', subtitleSize: '18px', bodySize: '14px', maxLineLength: 60 },
        logoUrl: k.logo_url || brand.logo_url || '',
        logoPosition: k.logo_position || 'top-left',
        tone: k.tone_examples?.tone || ['Professzionális', 'Segítőkész'],
        toneExampleGood: k.tone_examples?.good || '',
        toneExampleBad: k.tone_examples?.bad || '',
        negativePrompt: k.negative_prompt || '',
        visualRules: [],
        brandDna: brandDna || undefined
      };
    }

    return {
      brand,
      brandDna,
      brandKit,
      auditResult: auditRes.data?.audit_summary || null
    };
  } catch (err) {
    console.error('[SOCIAL-BRAND-SERVICE] Exception fetching full brand data:', err);
    return null;
  }
}

/**
 * Deletes a social brand by its ID. Cascade deletes associated tables automatically.
 */
export async function deleteSocialBrand(brandId: string): Promise<boolean> {
  console.log('[SOCIAL-BRAND-SERVICE] deleteSocialBrand called for id:', brandId);
  try {
    const { error } = await supabase
      .from('social_brands')
      .delete()
      .eq('id', brandId);

    if (error) {
      console.error('[SOCIAL-BRAND-SERVICE] Error deleting brand:', error);
      return false;
    }

    console.log('[SOCIAL-BRAND-SERVICE] Brand deleted successfully:', brandId);
    return true;
  } catch (err) {
    console.error('[SOCIAL-BRAND-SERVICE] Exception deleting brand:', err);
    return false;
  }
}

