import React, { useState, useCallback, useRef, useEffect } from 'react';
import { buildLayerTemplates, type LayerTemplate } from '../layerTemplates';
import ImageSlotUploader, { type ImageSlot, buildCompositePayload } from './ImageSlotUploader';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { 
  Sparkles, 
  Settings, 
  Calendar as CalendarIcon, 
  Layers, 
  Loader, 
  Download, 
  Check, 
  CheckSquare, 
  X, 
  Trash2, 
  Globe, 
  ArrowRight,
  ExternalLink,
  Clipboard,
  Phone,
  Eye
} from 'lucide-react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

const Instagram = ({ size = 24, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const Facebook = ({ size = 24, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);
import type { BrandKit, PostCreative, SystemLog } from '../types';
import { fixImageUrl, getBackendUrl } from '../types';
import { showToast } from '../../../../components/ui/Toast';

// ─── Platform / Channel Specifications ────────────────────────────────────────
const CHANNEL_SPECS = {
  instagram: {
    label: 'Instagram',
    color: '#e1306c',
    icon: '📸',
    formats: [
      { id: 'feed-square',    label: 'Feed négyzet',     ar: '1:1',  w: 1080, h: 1080, default: false, desc: 'Klasszikus feed poszt' },
      { id: 'feed-portrait',  label: 'Feed álló',        ar: '4:5',  w: 1080, h: 1350, default: true,  desc: 'Legjobb organikus elérés' },
      { id: 'feed-landscape', label: 'Feed fekvő',       ar: '1.91:1', w: 1080, h: 566, default: false, desc: 'Széles látványkép' },
      { id: 'story-reel',     label: 'Story / Reel',    ar: '9:16', w: 1080, h: 1920, default: false, desc: 'Teljes képernyős függőleges' },
    ],
    limits: {
      captionChars: 2200,
      hashtagCount: 30,
      hashtagRecommended: 5,
      altTextChars: 100,
      ctaTextChars: 40,
    },
    postingRules: [
      'Caption: max 2 200 karakter',
      'Hashtag: max 30 db (ajánlott 3–5)',
      'Kép min. 150×150px, max 8MB (JPEG/PNG)',
      'Alt szöveg: max 100 karakter',
      'Feed: 1.91:1 – 4:5 arány elfogadott',
      'Story/Reel: 9:16 kötelező',
      'Carousel: 2–10 kép (1:1 vagy 4:5)',
    ],
  },
  facebook: {
    label: 'Facebook',
    color: '#1877f2',
    icon: '📘',
    formats: [
      { id: 'feed-landscape', label: 'Feed fekvő',   ar: '1.91:1', w: 1200, h: 630,  default: true,  desc: 'Legszélesebb elérés' },
      { id: 'feed-square',    label: 'Feed négyzet', ar: '1:1',    w: 1080, h: 1080, default: false, desc: 'Kiemelkedő feed pozíció' },
      { id: 'feed-portrait',  label: 'Feed álló',    ar: '4:5',    w: 1080, h: 1350, default: false, desc: 'Mobilon teljes szélességű' },
      { id: 'story',          label: 'Story',        ar: '9:16',   w: 1080, h: 1920, default: false, desc: 'Teljes képernyős' },
    ],
    limits: {
      captionChars: 63206,
      hashtagCount: 30,
      hashtagRecommended: 3,
      altTextChars: 255,
      ctaTextChars: 25,
    },
    postingRules: [
      'Caption: technikailag korlátlan (ajánlott < 500 kar.)',
      'Kép: 1200×630px ajánlott, max 10MB (JPEG/PNG/GIF)',
      'Hashtag: max 30 (ajánlott max 3)',
      'Link preview automatikus URL-ből',
      'Feed: 1.91:1 – 1:1 – 4:5 mind elfogadott',
      'CTA gomb szöveg: max 25 karakter',
    ],
  },
  'meta-ads': {
    label: 'Meta Ads',
    color: '#0081fb',
    icon: '🎯',
    formats: [
      { id: 'single-image',   label: 'Single Image',   ar: '1:1',    w: 1080, h: 1080, default: true,  desc: 'Legjobb multi-placement' },
      { id: 'landscape',      label: 'Landscape',      ar: '1.91:1', w: 1200, h: 628,  default: false, desc: 'Feed + Right Column' },
      { id: 'portrait',       label: 'Portrait',       ar: '4:5',    w: 1080, h: 1350, default: false, desc: 'Mobile feed domináns' },
      { id: 'story-reels',    label: 'Story / Reels',  ar: '9:16',   w: 1080, h: 1920, default: false, desc: 'Immersive fullscreen' },
      { id: 'carousel-card',  label: 'Carousel kártya',ar: '1:1',    w: 1080, h: 1080, default: false, desc: '2–10 kártyás hirdetés' },
    ],
    limits: {
      captionChars: 125,
      hashtagCount: 5,
      hashtagRecommended: 0,
      altTextChars: 255,
      ctaTextChars: 25,
    },
    postingRules: [
      'Primary text: max 125 karakter (csonkítás fölötte)',
      'Headline: max 40 karakter',
      'Description: max 30 karakter',
      'Kép: min 1080×1080px, max 30MB, JPEG/PNG',
      'Szöveg arány kép területén: max 20% (Meta iránymutatás)',
      'CTA gomb: kötelező kiválasztani (Vásárlás, Tudj meg többet, stb.)',
      '1:1 – legjobb multi-placement lefedettség',
      'Carousel: 2–10 kártya, min 600×600px',
    ],
  },
} as const;

type ChannelKey = keyof typeof CHANNEL_SPECS;

interface ProdCalendarViewProps {
  activeBrandKit: BrandKit;
  auditResult: any;
  posts: PostCreative[];
  setPosts: React.Dispatch<React.SetStateAction<PostCreative[]>>;
  bypassOnboarding: boolean;
  setBypassOnboarding: (val: boolean) => void;
}

export const ProdCalendarView: React.FC<ProdCalendarViewProps> = ({
  activeBrandKit,
  auditResult,
  posts,
  setPosts,
  bypassOnboarding,
  setBypassOnboarding
}) => {
  // Navigation
  const [activeTab, setActiveTab] = useState<'calendar' | 'timeline'>('calendar');

  // Screen 1: Parameters State
  const [briefText, setBriefText] = useState('Szezonális promóciós kampány és márkaismertség növelése.');
  const [platforms, setPlatforms] = useState<string[]>(['instagram']);
  const [timeframe, setTimeframe] = useState<'weekly' | 'monthly'>('weekly');
  const [frequency, setFrequency] = useState<'3x' | 'daily'>('3x');
  const [keyDates, setKeyDates] = useState('');
  const [contentFocus, setContentFocus] = useState<'mixed' | 'product' | 'promo' | 'lifestyle' | 'educational'>('mixed');
  const [calendarPlatformFilter, setCalendarPlatformFilter] = useState<string>('all');

  // Screen 2: Generating Pipeline State
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const [selectedPost, setSelectedPost] = useState<PostCreative | null>(null);

  // Screen 5: Batch Operations State
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);

  // Screen 7: Ad-Hoc / Custom Post Creation State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'ai' | 'custom'>('ai');
  const [createBrief, setCreateBrief] = useState('');
  const [createCustomText, setCreateCustomText] = useState('');
  const [createCustomImagePrompt, setCreateCustomImagePrompt] = useState('');
  const [createTemplateId, setCreateTemplateId] = useState<'universal' | 'quote' | 'product' | 'testimonial' | 'list'>('product');
  const [createColorVariation, setCreateColorVariation] = useState<'default' | 'inverted' | 'accent'>('default');
  const [createLogoVariant, setCreateLogoVariant] = useState<'light' | 'dark'>('dark');
  const [createCta, setCreateCta] = useState('');
  const [createScheduledDate, setCreateScheduledDate] = useState('');
  const [isGeneratingAdhoc, setIsGeneratingAdhoc] = useState(false);

  // Multi-slot image upload for ad-hoc modal (replaces single adhocProductImage)
  const [adhocImageSlots, setAdhocImageSlots] = useState<ImageSlot[]>([]);


  // Modal Editing State (Screen 4)
  const [editingText, setEditingText] = useState('');
  const [editingCta, setEditingCta] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [alternativeImages, setAlternativeImages] = useState<string[]>([]);
  const [originalAltImages, setOriginalAltImages] = useState<string[]>([]);
  const [activeAltIndex, setActiveAltIndex] = useState(0);
  const [editingLogoPosition, setEditingLogoPosition] = useState<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('top-left');
  const [editingLogoVariant, setEditingLogoVariant] = useState<'light' | 'dark'>('light');
  const [editingColorVariation, setEditingColorVariation] = useState<'default' | 'inverted' | 'accent'>('default');
  const [editingBgBlur, setEditingBgBlur] = useState(0);
  const [editingOverlayOpacity, setEditingOverlayOpacity] = useState(0.55);
  const [editingLogoSize, setEditingLogoSize] = useState(1.0);
  const [editingFontSize, setEditingFontSize] = useState(32);
  const [editingTextAlignment, setEditingTextAlignment] = useState<'left' | 'center' | 'right'>('left');
  const [editingCtaRadius, setEditingCtaRadius] = useState(8);
  const [editingFontWeight, setEditingFontWeight] = useState('700');
  const [editingTextColor, setEditingTextColor] = useState('default');
  const [editingTextYOffset, setEditingTextYOffset] = useState(0);
  const [editingTextXOffset, setEditingTextXOffset] = useState(0);
  const [editingPanelBgColor, setEditingPanelBgColor] = useState('default');
  const [editingPanelPadding, setEditingPanelPadding] = useState(50);
  const [editingPanelRadius, setEditingPanelRadius] = useState(0);
  const [editingPanelPosition, setEditingPanelPosition] = useState('relative');
  const [editingCtaFontSize, setEditingCtaFontSize] = useState(20);
  const [editingCtaBgColor, setEditingCtaBgColor] = useState('default');
  const [editingCtaYOffset, setEditingCtaYOffset] = useState(0);
  const [editingHashtags, setEditingHashtags] = useState<string>('');
  const [editingAltText, setEditingAltText] = useState<string>('');

  // Layer Template state (Éles Naptár)
  const [isApplyingLayerTemplate, setIsApplyingLayerTemplate] = useState(false);
  const [selectedLayerTemplateId, setSelectedLayerTemplateId] = useState<string | null>(null);
  const [hoveredLayerTemplateId, setHoveredLayerTemplateId] = useState<string | null>(null);

  // Auto-scroll generation logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [progressLogs]);

  // Dynamic Brief Initializer based on Brand Kit name/industry
  useEffect(() => {
    if (activeBrandKit && activeBrandKit.name) {
      const name = activeBrandKit.name.toLowerCase();
      if (name.includes('festék') || name.includes('paint') || name.includes('piktor') || name.includes('diy') || name.includes('szín')) {
        setBriefText('Új prémium környezetbarát falfestékek és színkeverési szolgáltatások bevezetése a nyári felújítási szezonban.');
      } else if (name.includes('kávé') || name.includes('coffee') || name.includes('cafe') || name.includes('latte')) {
        setBriefText('Prémium nyári hűsítők és specialty kávékülönlegességek bevezetése a szezonális forgalom növelésére.');
      } else {
        setBriefText(`Szezonális promóciós kampány és márkaismertség növelése a ${activeBrandKit.name} részére.`);
      }
    }
  }, [activeBrandKit]);

  // Load JSZip dynamically from CDN for ZIP exports
  const [jszipLoaded, setJszipLoaded] = useState(false);
  useEffect(() => {
    if ((window as any).JSZip) {
      setJszipLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.async = true;
    script.onload = () => setJszipLoaded(true);
    document.body.appendChild(script);
  }, []);

  // Checkbox multi-select helpers
  const handleToggleSelectPost = (id: string) => {
    setSelectedPostIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllPosts = () => {
    const visibleIds = posts.map(p => p.id);
    if (selectedPostIds.length === visibleIds.length) {
      setSelectedPostIds([]);
    } else {
      setSelectedPostIds(visibleIds);
    }
  };

  const handleOpenCreateModal = (dateStr?: string) => {
    setCreateBrief('');
    setCreateCustomText('');
    setCreateCustomImagePrompt('');
    setCreateTemplateId('product');
    setCreateColorVariation('default');
    setCreateLogoVariant('dark');
    setCreateCta('');

    // Reset adhoc image slots
    setAdhocImageSlots([]);
    
    // Default scheduled date is either the clicked date (plus 9:00 AM) or tomorrow 9:00 AM
    if (dateStr) {
      setCreateScheduledDate(`${dateStr}T09:00`);
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tzOffset = tomorrow.getTimezoneOffset() * 60000;
      const tomorrowLocal = new Date(tomorrow.getTime() - tzOffset);
      setCreateScheduledDate(tomorrowLocal.toISOString().substring(0, 16));
    }
    
    setIsCreateModalOpen(true);
  };

  const handleGenerateAdhoc = async () => {
    setIsGeneratingAdhoc(true);
    try {
      let newPost: any;

      if (adhocImageSlots.length > 1) {
        // Multi-slot composite generation
        const scenePrompt = [createBrief, createMode === 'custom' ? createCustomText : ''].filter(Boolean).join('. ');
        const compositeResp = await fetch(`${getBackendUrl()}/api/image/composite-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildCompositePayload(adhocImageSlots, scenePrompt, activeBrandKit)),
        });
        if (!compositeResp.ok) throw new Error(await compositeResp.text());
        const compositeData = await compositeResp.json();
        newPost = {
          imageUrl: fixImageUrl(compositeData.imageUrl),
          originalImageUrl: fixImageUrl(compositeData.imageUrl),
          text: createBrief,
          logoPosition: activeBrandKit.logoPosition || 'top-left',
          id: `adhoc-${Date.now()}`,
          briefId: 'adhoc',
          templateId: createTemplateId,
          status: 'draft',
          generationModel: compositeData.generationModel,
          generationTime: compositeData.generationTime,
        };
      } else {
        // Single slot or no image — standard adhoc
        const primarySlot = adhocImageSlots[0];
        const response = await fetch(`${getBackendUrl()}/api/generate-adhoc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brief: createBrief,
            brandKit: activeBrandKit,
            customText: createMode === 'custom' ? createCustomText : undefined,
            customImagePrompt: createMode === 'custom' ? createCustomImagePrompt : undefined,
            templateId: createTemplateId,
            colorVariation: createColorVariation,
            logoVariant: createLogoVariant,
            cta: createCta,
            productImageUrl: primarySlot?.originalUrl || null,
            preprocessedImageUrl: primarySlot?.upscaledUrl || primarySlot?.preprocessedUrl || null,
          })
        });
        if (!response.ok) throw new Error(await response.text());
        newPost = await response.json();
        newPost.imageUrl = fixImageUrl(newPost.imageUrl);
        if (newPost.originalImageUrl) newPost.originalImageUrl = fixImageUrl(newPost.originalImageUrl);
        if (!newPost.logoPosition) newPost.logoPosition = activeBrandKit.logoPosition || 'top-left';
      }
      
      // Update schedule date to the chosen date
      if (createScheduledDate) {
        newPost.scheduledAt = new Date(createScheduledDate).toISOString();
      }

      setPosts(prev => [...prev, newPost]);
      setIsCreateModalOpen(false);
      showToast('Új poszt sikeresen legenerálva és beütemezve!');
    } catch (err: any) {
      console.error(err);
      showToast('Sikertelen generálás: ' + (err.message || err), 'error');
    } finally {
      setIsGeneratingAdhoc(false);
    }
  };

  // Batch operations
  const handleBatchApprove = () => {
    if (selectedPostIds.length === 0) return;
    setPosts(prev => prev.map(p => selectedPostIds.includes(p.id) ? { ...p, status: 'approved' } : p));
    setSelectedPostIds([]);
    showToast(`${selectedPostIds.length} bejegyzés tömegesen jóváhagyva!`);
  };

  const handleBatchDelete = () => {
    if (selectedPostIds.length === 0) return;
    setPosts(prev => prev.filter(p => !selectedPostIds.includes(p.id)));
    setSelectedPostIds([]);
    showToast(`${selectedPostIds.length} bejegyzés törölve.`);
  };

  const handleBatchShiftDates = () => {
    if (selectedPostIds.length === 0) return;
    setPosts(prev => prev.map(p => {
      if (selectedPostIds.includes(p.id) && p.scheduledAt) {
        const d = new Date(p.scheduledAt);
        d.setDate(d.getDate() + 1); // shift by 1 day
        return { ...p, scheduledAt: d.toISOString() };
      }
      return p;
    }));
    showToast(`Kijelöltek dátuma eltolva +1 nappal.`);
  };

  // Drag & drop rescheduling handler (Screen 3)
  const handleEventDrop = (info: any) => {
    const newDate = info.event.start.toISOString();
    const postId = info.event.id;
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'scheduled', scheduledAt: newDate } : p));
    showToast(`Bejegyzés átütemezve: ${new Date(newDate).toLocaleDateString('hu-HU')}`);
  };

  // Screen 2: Trigger Generation Process
  const handleStartGeneration = async () => {
    if (!briefText.trim()) return;
    setIsGenerating(true);
    setProgressPercent(5);
    setCurrentStep(0);
    setProgressLogs(['[START] Éles tartalomterv generálása elindítva...', `[Brief] "${briefText}"`]);

    try {
      // Step 1: Brand kit extraction
      await new Promise(r => setTimeout(r, 1000));
      setCurrentStep(1);
      setProgressPercent(25);
      setProgressLogs(prev => [...prev, '[INFO] 1/4 — Márka arculat és betűtípusok betöltése sikeres.', `[Font] ${activeBrandKit.typography.fontName}`, `[Primary Color] ${activeBrandKit.colors.primary}`]);

      // Step 2: Image Prompt Orchestration
      await new Promise(r => setTimeout(r, 1200));
      setCurrentStep(2);
      setProgressPercent(50);
      setProgressLogs(prev => [...prev, '[INFO] 2/4 — Flux v2 képgenerálási promptok tervezése Claude ágenssel...', '[AI] Kampánystratégia megalkotva. 4 fókuszterület elosztása elkészült.']);

      // Step 3: Fetching images from port 3001
      const count = timeframe === 'monthly' ? 6 : 3;
      setProgressLogs(prev => [...prev, `[INFO] ${count} db kreatív elem lekérése és háttér harmonizálása indítva...`]);
      
      const response = await fetch(`${getBackendUrl()}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: briefText,
          brandKit: activeBrandKit,
          pastApproved: [],
          platforms,
          contentFocus,
          keyDates,
          timeframe,
          frequency
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const generatedItems = await response.json();
      setCurrentStep(3);
      setProgressPercent(85);
      setProgressLogs(prev => [...prev, '[INFO] 3/4 — Playwright rétegek renderelése és kép-kompozitálás sikeres.', `[INFO] Megérkezett ${generatedItems.length} db renderelt kreatív.`]);

      // Step 4: Finalizing Metadata and mapping dates
      await new Promise(r => setTimeout(r, 1000));
      setCurrentStep(4);
      setProgressPercent(100);
      
      const today = new Date();
      const mappedPosts: PostCreative[] = generatedItems.map((item: any, index: number) => {
        const scheduledDate = new Date(today);
        scheduledDate.setDate(today.getDate() + (index * (frequency === 'daily' ? 1 : 2)) + 1);
        scheduledDate.setHours(9, 0, 0, 0);

        return {
          id: item.id || `prod-post-${Date.now()}-${index}`,
          briefId: item.briefId || `prod-brief-${Date.now()}`,
          templateId: item.templateId,
          status: 'scheduled',
          text: item.text,
          cta: item.cta,
          imageUrl: fixImageUrl(item.imageUrl),
          originalImageUrl: item.originalImageUrl ? fixImageUrl(item.originalImageUrl) : undefined,
          imagePrompt: item.imagePrompt,
          colorVariation: item.colorVariation || 'default',
          logoVariant: item.logoVariant || 'light',
          logoPosition: item.logoPosition || activeBrandKit.logoPosition || 'top-left',
          platform: platforms[index % platforms.length] as PostCreative['platform'],
          hashtags: item.hashtags || [],
          altText: item.altText || '',
          createdAt: new Date().toISOString(),
          scheduledAt: scheduledDate.toISOString(),
          generationModel: item.generationModel || undefined,
          generationTime: item.generationTime || undefined
        };
      });

      setPosts(mappedPosts);
      setProgressLogs(prev => [...prev, '[SUCCESS] 4/4 — Éles tartalomnaptár összeállítva és beütemezve!', '[END] Generálás befejeződött.']);
      
      setTimeout(() => {
        setIsGenerating(false);
        setActiveTab('calendar');
        showToast('Naptár sikeresen legenerálva!');
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setProgressLogs(prev => [...prev, `[ERROR] Hiba történt a generálás során: ${err.message || err}`]);
      setTimeout(() => {
        setIsGenerating(false);
      }, 5000);
    }
  };

  // Screen 4: Detail Modal Open
  const handleOpenDetailModal = (post: PostCreative) => {
    setSelectedPost(post);
    setEditingText(post.text);
    setEditingCta(post.cta || '');
    setActiveAltIndex(0);
    setEditingLogoPosition(post.logoPosition || activeBrandKit.logoPosition || 'top-left');
    setEditingLogoVariant(post.logoVariant || 'light');
    setEditingColorVariation(post.colorVariation || 'default');
    setEditingBgBlur(post.bgBlur || 0);
    setEditingOverlayOpacity(post.overlayOpacity !== undefined ? post.overlayOpacity : 0.55);
    setEditingLogoSize(post.logoSize || 1.0);
    setEditingFontSize(post.fontSize || 32);
    setEditingTextAlignment(post.textAlignment || 'left');
    setEditingCtaRadius(post.ctaRadius !== undefined ? post.ctaRadius : 8);
    setEditingFontWeight(post.fontWeight || '700');
    setEditingTextColor(post.textColor || 'default');
    setEditingTextYOffset(post.textYOffset !== undefined ? post.textYOffset : 0);
    setEditingTextXOffset(post.textXOffset !== undefined ? post.textXOffset : 0);
    setEditingPanelBgColor(post.panelBgColor || 'default');
    setEditingPanelPadding(post.panelPadding !== undefined ? post.panelPadding : 50);
    setEditingPanelRadius(post.panelRadius !== undefined ? post.panelRadius : 0);
    setEditingPanelPosition(post.panelPosition || 'relative');
    setEditingCtaFontSize(post.ctaFontSize !== undefined ? post.ctaFontSize : 20);
    setEditingCtaBgColor(post.ctaBgColor || 'default');
    setEditingCtaYOffset(post.ctaYOffset !== undefined ? post.ctaYOffset : 0);
    setEditingHashtags((post.hashtags || []).join(' '));
    setEditingAltText(post.altText || '');
    
    // Pick alternative mock images based on brand kit name/industry
    const name = (activeBrandKit.name || '').toLowerCase();
    let rawAlts = [
      post.originalImageUrl || post.imageUrl,
      'https://images.unsplash.com/photo-1490730141103-6cac27aaab94?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=600'
    ];
    if (name.includes('festék') || name.includes('paint') || name.includes('piktor') || name.includes('diy') || name.includes('szín')) {
      rawAlts = [
        post.originalImageUrl || post.imageUrl,
        'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&q=80&w=600', // painting walls
        'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&q=80&w=600'  // paint cans/tools
      ];
    } else if (name.includes('kávé') || name.includes('coffee') || name.includes('cafe') || name.includes('latte')) {
      rawAlts = [
        post.originalImageUrl || post.imageUrl,
        'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&q=80&w=600'
      ];
    }
    setOriginalAltImages(rawAlts);
    setAlternativeImages([post.imageUrl, rawAlts[1], rawAlts[2]]);
  };

  // Screen 4: Save Text updates and re-render template via port 3001
  const handleSavePostDetails = async () => {
    if (!selectedPost) return;
    setSavingEdit(true);

    try {
      const bgImage = originalAltImages[activeAltIndex] || selectedPost.imageUrl;

      const response = await fetch(`${getBackendUrl()}/api/render-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post: {
            ...selectedPost,
            text: editingText,
            cta: editingCta,
            logoPosition: editingLogoPosition,
            logoVariant: editingLogoVariant,
            colorVariation: editingColorVariation,
            bgBlur: editingBgBlur,
            overlayOpacity: editingOverlayOpacity,
            logoSize: editingLogoSize,
            fontSize: editingFontSize,
            textAlignment: editingTextAlignment,
            ctaRadius: editingCtaRadius,
            fontWeight: editingFontWeight,
            textColor: editingTextColor,
            textYOffset: editingTextYOffset,
            textXOffset: editingTextXOffset,
            panelBgColor: editingPanelBgColor,
            panelPadding: editingPanelPadding,
            panelRadius: editingPanelRadius,
            panelPosition: editingPanelPosition,
            ctaFontSize: editingCtaFontSize,
            ctaBgColor: editingCtaBgColor,
            ctaYOffset: editingCtaYOffset,
            imageUrl: bgImage,
            originalImageUrl: bgImage
          },
          brandKit: activeBrandKit,
          text: editingText
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const updated = await response.json();
      const finalImage = fixImageUrl(updated.imageUrl);
      
      setPosts(prev => prev.map(p => p.id === selectedPost.id ? { 
        ...p, 
        text: editingText, 
        cta: editingCta, 
        logoPosition: editingLogoPosition,
        logoVariant: editingLogoVariant,
        colorVariation: editingColorVariation,
        bgBlur: editingBgBlur,
        overlayOpacity: editingOverlayOpacity,
        logoSize: editingLogoSize,
        fontSize: editingFontSize,
        textAlignment: editingTextAlignment,
        ctaRadius: editingCtaRadius,
        fontWeight: editingFontWeight,
        textColor: editingTextColor,
        textYOffset: editingTextYOffset,
        textXOffset: editingTextXOffset,
        panelBgColor: editingPanelBgColor,
        panelPadding: editingPanelPadding,
        panelRadius: editingPanelRadius,
        panelPosition: editingPanelPosition,
        ctaFontSize: editingCtaFontSize,
        ctaBgColor: editingCtaBgColor,
        ctaYOffset: editingCtaYOffset,
        hashtags: editingHashtags.split(/\s+/).filter(t => t.startsWith('#')),
        altText: editingAltText,
        imageUrl: finalImage,
        originalImageUrl: updated.originalImageUrl
      } : p));

      setSelectedPost(prev => prev ? { 
        ...prev, 
        text: editingText, 
        cta: editingCta, 
        logoPosition: editingLogoPosition,
        logoVariant: editingLogoVariant,
        colorVariation: editingColorVariation,
        bgBlur: editingBgBlur,
        overlayOpacity: editingOverlayOpacity,
        logoSize: editingLogoSize,
        fontSize: editingFontSize,
        textAlignment: editingTextAlignment,
        ctaRadius: editingCtaRadius,
        fontWeight: editingFontWeight,
        textColor: editingTextColor,
        textYOffset: editingTextYOffset,
        textXOffset: editingTextXOffset,
        panelBgColor: editingPanelBgColor,
        panelPadding: editingPanelPadding,
        panelRadius: editingPanelRadius,
        panelPosition: editingPanelPosition,
        ctaFontSize: editingCtaFontSize,
        ctaBgColor: editingCtaBgColor,
        ctaYOffset: editingCtaYOffset,
        hashtags: editingHashtags.split(/\s+/).filter(t => t.startsWith('#')),
        altText: editingAltText,
        imageUrl: finalImage,
        originalImageUrl: updated.originalImageUrl
      } : null);

      setAlternativeImages(prev => {
        const next = [...prev];
        next[activeAltIndex] = finalImage;
        return next;
      });

      showToast('Poszt szövege és elrendezése sikeresen újrarenderelve!');
    } catch (err: any) {
      console.error(err);
      showToast('Sikertelen újrarenderelés: ' + (err.message || err), 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Approve single post
  const handleApproveSingle = (id: string) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'approved' } : p));
    setSelectedPost(prev => prev ? { ...prev, status: 'approved' } : null);
    showToast('Bejegyzés jóváhagyva.');
  };

  // Post single now
  const handlePostNowSingle = (id: string) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'published', publishedAt: new Date().toISOString() } : p));
    setSelectedPost(prev => prev ? { ...prev, status: 'published', publishedAt: new Date().toISOString() } : null);
    showToast('✓ Bejegyzés élesítve a Meta Graph API-n keresztül!');
  };

  // Delete single post
  const handleDeleteSingle = (id: string) => {
    setPosts(prev => prev.filter(p => p.id !== id));
    setSelectedPost(null);
    showToast('Bejegyzés törölve.');
  };

  // Change single post template design
  // Apply a layer template to the current post image via render-polotno
  const handleApplyLayerTemplate = async (template: LayerTemplate) => {
    if (!selectedPost) return;
    setIsApplyingLayerTemplate(true);
    setSelectedLayerTemplateId(template.id);
    try {
      const bgImageUrl = originalAltImages[activeAltIndex] || selectedPost.originalImageUrl || selectedPost.imageUrl;
      const bgLayer = { type: 'image' as const, src: bgImageUrl, x: 0, y: 0, width: 1080, height: 1350, opacity: 1 };

      const layoutJson = {
        width: 1080,
        height: 1350,
        pages: [{
          background: '#000000',
          children: [bgLayer, ...template.layers]
        }]
      };

      const response = await fetch(`${getBackendUrl()}/api/render-polotno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layoutJson })
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      const newImageUrl = fixImageUrl(data.imageUrl);

      // Update this alt image slot with the rendered result
      setAlternativeImages(prev => {
        const next = [...prev];
        next[activeAltIndex] = newImageUrl;
        return next;
      });

      // Update the post's main imageUrl too
      setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, imageUrl: newImageUrl } : p));
      setSelectedPost(prev => prev ? { ...prev, imageUrl: newImageUrl } : null);

      showToast(`✓ Layer sablon alkalmazva: ${template.name}`);
    } catch (err: any) {
      showToast('Layer sablon hiba: ' + (err.message || err), 'error');
    } finally {
      setIsApplyingLayerTemplate(false);
    }
  };

  const handleChangeTemplate = async (newTemplateId: 'universal' | 'quote' | 'product' | 'testimonial' | 'list') => {
    if (!selectedPost) return;
    setSavingEdit(true);
    try {
      const bgImage = originalAltImages[activeAltIndex] || selectedPost.imageUrl;

      const response = await fetch(`${getBackendUrl()}/api/render-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post: {
            ...selectedPost,
            templateId: newTemplateId,
            text: editingText,
            cta: editingCta,
            logoPosition: editingLogoPosition,
            logoVariant: editingLogoVariant,
            colorVariation: editingColorVariation,
            bgBlur: editingBgBlur,
            overlayOpacity: editingOverlayOpacity,
            logoSize: editingLogoSize,
            fontSize: editingFontSize,
            textAlignment: editingTextAlignment,
            ctaRadius: editingCtaRadius,
            fontWeight: editingFontWeight,
            textColor: editingTextColor,
            textYOffset: editingTextYOffset,
            textXOffset: editingTextXOffset,
            panelBgColor: editingPanelBgColor,
            panelPadding: editingPanelPadding,
            panelRadius: editingPanelRadius,
            panelPosition: editingPanelPosition,
            ctaFontSize: editingCtaFontSize,
            ctaBgColor: editingCtaBgColor,
            ctaYOffset: editingCtaYOffset,
            imageUrl: bgImage,
            originalImageUrl: bgImage
          },
          brandKit: activeBrandKit,
          text: editingText
        })
      });

      if (!response.ok) throw new Error(await response.text());
      const updated = await response.json();
      const newImageUrl = fixImageUrl(updated.imageUrl);
      
      setPosts(prev => prev.map(p => p.id === selectedPost.id ? { 
        ...p, 
        templateId: newTemplateId,
        text: editingText,
        cta: editingCta,
        logoPosition: editingLogoPosition,
        logoVariant: editingLogoVariant,
        colorVariation: editingColorVariation,
        bgBlur: editingBgBlur,
        overlayOpacity: editingOverlayOpacity,
        logoSize: editingLogoSize,
        fontSize: editingFontSize,
        textAlignment: editingTextAlignment,
        ctaRadius: editingCtaRadius,
        fontWeight: editingFontWeight,
        textColor: editingTextColor,
        textYOffset: editingTextYOffset,
        textXOffset: editingTextXOffset,
        panelBgColor: editingPanelBgColor,
        panelPadding: editingPanelPadding,
        panelRadius: editingPanelRadius,
        panelPosition: editingPanelPosition,
        ctaFontSize: editingCtaFontSize,
        ctaBgColor: editingCtaBgColor,
        ctaYOffset: editingCtaYOffset,
        imageUrl: newImageUrl,
        originalImageUrl: updated.originalImageUrl
      } : p));

      setSelectedPost(prev => prev ? { 
        ...prev, 
        templateId: newTemplateId,
        text: editingText,
        cta: editingCta,
        logoPosition: editingLogoPosition,
        logoVariant: editingLogoVariant,
        colorVariation: editingColorVariation,
        bgBlur: editingBgBlur,
        overlayOpacity: editingOverlayOpacity,
        logoSize: editingLogoSize,
        fontSize: editingFontSize,
        textAlignment: editingTextAlignment,
        ctaRadius: editingCtaRadius,
        fontWeight: editingFontWeight,
        textColor: editingTextColor,
        textYOffset: editingTextYOffset,
        textXOffset: editingTextXOffset,
        panelBgColor: editingPanelBgColor,
        panelPadding: editingPanelPadding,
        panelRadius: editingPanelRadius,
        panelPosition: editingPanelPosition,
        ctaFontSize: editingCtaFontSize,
        ctaBgColor: editingCtaBgColor,
        ctaYOffset: editingCtaYOffset,
        imageUrl: newImageUrl,
        originalImageUrl: updated.originalImageUrl
      } : null);

      setAlternativeImages(prev => {
        const next = [...prev];
        next[activeAltIndex] = newImageUrl;
        return next;
      });
      // Also keep originalAltImages in sync (the raw background doesn't change, only alternativeImages shows the render)
      // Update selectedPost imageUrl to point to new rendered image
      setOriginalAltImages(prev => {
        const next = [...prev];
        // keep original background URL at slot 0, only update if this is slot 0
        if (activeAltIndex === 0) next[0] = bgImage;
        return next;
      });

      showToast(`Sablon sikeresen megváltoztatva: ${newTemplateId}`);
    } catch (err: any) {
      showToast('Sablon váltás sikertelen: ' + err.message, 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Screen 6: Exporters (CSV)
  const handleExportCSV = () => {
    if (posts.length === 0) return;
    
    // Headers matching Buffer/Hootsuite format
    let csvContent = 'data:text/csv;charset=utf-8,Date,Time,Message,Link,ImageURL\r\n';
    
    posts.forEach(post => {
      const dateObj = new Date(post.scheduledAt || post.createdAt);
      const dateStr = dateObj.toISOString().split('T')[0];
      const timeStr = dateObj.toTimeString().split(' ')[0].substring(0, 5);
      
      // Clean text for CSV compatibility
      const cleanMsg = `"${post.text.replace(/"/g, '""')}"`;
      const cleanImg = `"${post.imageUrl}"`;
      
      csvContent += `${dateStr},${timeStr},${cleanMsg},,${cleanImg}\r\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `eles_tartalomnaptar_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV Naptár sikeresen letöltve!');
  };

  // Screen 6: ICS (Google Calendar) export
  const handleExportICS = () => {
    if (posts.length === 0) return;
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const events = posts.flatMap(p => {
      if (!p.scheduledAt) return [];
      const dt = fmt(new Date(p.scheduledAt));
      return [
        'BEGIN:VEVENT',
        `DTSTART:${dt}`,
        `DTEND:${dt}`,
        `SUMMARY:${(p.platform || 'IG').toUpperCase()} poszt — ${p.text.substring(0, 40).replace(/[\r\n]/g, ' ')}`,
        `DESCRIPTION:${(p.text || '').substring(0, 200).replace(/\n/g, '\\n')}`,
        `STATUS:${p.status === 'approved' ? 'CONFIRMED' : 'TENTATIVE'}`,
        `UID:${p.id}@eaisydesk`,
        'END:VEVENT'
      ];
    });
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EaisyDesk//HU', 'CALSCALE:GREGORIAN',
      ...events, 'END:VCALENDAR'].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `tartalomnaptár_${Date.now()}.ics`
    });
    a.click(); URL.revokeObjectURL(a.href);
    showToast('ICS naptárfájl sikeresen letöltve!');
  };

  // Screen 6: Copy all captions to clipboard
  const handleCopyAllCaptions = () => {
    if (posts.length === 0) return;
    const text = [...posts]
      .sort((a, b) => (a.scheduledAt || '') < (b.scheduledAt || '') ? -1 : 1)
      .map((p, i) => {
        const date = p.scheduledAt
          ? new Date(p.scheduledAt).toLocaleDateString('hu-HU') : `#${i + 1}`;
        const tags = (p.hashtags || []).join(' ');
        return [
          `📅 ${date} | ${(p.platform || 'instagram').toUpperCase()}`,
          p.text,
          tags
        ].filter(Boolean).join('\n');
      })
      .join('\n\n---\n\n');
    navigator.clipboard.writeText(text);
    showToast('✓ Összes caption vágólapra másolva!');
  };

  // Screen 6: PDF export (Tartalomterv PDF via window.print)
  const handleExportPDF = () => {
    if (posts.length === 0) return;
    const sortedPosts = [...posts].sort((a, b) => (a.scheduledAt || '') < (b.scheduledAt || '') ? -1 : 1);
    const html = `
      <!DOCTYPE html>
      <html lang="hu">
      <head>
        <meta charset="UTF-8">
        <title>Tartalomterv — ${activeBrandKit.name || 'Márka'}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #1a1a2e; padding: 32px; }
          h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px; color: ${activeBrandKit.colors.primary}; }
          .meta { font-size: 11px; color: #666; margin-bottom: 24px; }
          .post { display: grid; grid-template-columns: 90px 1fr; gap: 14px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 12px; page-break-inside: avoid; }
          .post img { width: 90px; height: 90px; object-fit: cover; border-radius: 6px; }
          .post-info { display: flex; flex-direction: column; gap: 5px; }
          .post-date { font-size: 11px; font-weight: 700; color: ${activeBrandKit.colors.primary}; text-transform: uppercase; letter-spacing: 0.5px; }
          .post-platform { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 9px; font-weight: 800; text-transform: uppercase; background: ${activeBrandKit.colors.accent}; color: #fff; margin-left: 6px; }
          .post-status { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 9px; font-weight: 800; text-transform: uppercase; background: #e5e7eb; color: #374151; }
          .post-text { font-size: 12px; color: #374151; line-height: 1.5; }
          .post-hashtags { font-size: 11px; color: ${activeBrandKit.colors.primary}; font-family: monospace; }
          .post-alt { font-size: 10px; color: #9ca3af; font-style: italic; }
          @media print { body { padding: 16px; } }
        </style>
      </head>
      <body>
        <h1>📅 Tartalomterv — ${activeBrandKit.name || 'Márka'}</h1>
        <p class="meta">Generálva: ${new Date().toLocaleString('hu-HU')} · ${sortedPosts.length} poszt · Platformok: ${platforms.join(', ')}</p>
        ${sortedPosts.map(p => `
          <div class="post">
            <img src="${p.imageUrl}" alt="${p.altText || ''}" onerror="this.style.display='none'" />
            <div class="post-info">
              <div>
                <span class="post-date">${p.scheduledAt ? new Date(p.scheduledAt).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Nincs dátum'}</span>
                <span class="post-platform">${p.platform || 'instagram'}</span>
                <span class="post-status">${p.status}</span>
              </div>
              <p class="post-text">${(p.text || '').replace(/\n/g, '<br>')}</p>
              ${p.hashtags && p.hashtags.length ? `<p class="post-hashtags">${p.hashtags.join(' ')}</p>` : ''}
              ${p.altText ? `<p class="post-alt">Alt: ${p.altText}</p>` : ''}
            </div>
          </div>
        `).join('')}
      </body>
      </html>
    `;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 500);
    }
    showToast('PDF előnézet megnyitva — nyomtatással menthető PDF-ként!');
  };

  // Screen 6: Exporters (ZIP images pack using dynamically loaded JSZip)
  const handleExportZIP = async () => {
    if (posts.length === 0) return;
    if (!jszipLoaded || !(window as any).JSZip) {
      showToast('ZIP könyvtár betöltése folyamatban, próbálja meg 2 másodperc múlva...', 'info');
      return;
    }

    showToast('ZIP csomag összeállítása (képek letöltése)...');

    try {
      const zip = new (window as any).JSZip();
      const imgFolder = zip.folder('images');
      const textFolder = zip.folder('captions');

      const promises = posts.map(async (post, index) => {
        try {
          // Fetch image blob
          const response = await fetch(post.imageUrl);
          const blob = await response.blob();
          const ext = post.imageUrl.split('.').pop()?.split('?')[0] || 'png';
          
          // Add to folders
          imgFolder.file(`poszt-${index + 1}.${ext}`, blob);
          textFolder.file(`poszt-${index + 1}-szoveg.txt`, `${post.text}\n\nCTA: ${post.cta || ''}\nPrompt: ${post.imagePrompt}`);
        } catch (fetchErr) {
          console.error(`Failed to pack post ${index + 1} into ZIP:`, fetchErr);
        }
      });

      await Promise.all(promises);
      const content = await zip.generateAsync({ type: 'blob' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `eles_kreativok_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showToast('ZIP Média csomag sikeresen letöltve!');
    } catch (err: any) {
      console.error(err);
      showToast('ZIP exportálás sikertelen: ' + err.message, 'error');
    }
  };

  // Overlap and modification preview variables for detailed modal mockup
  const isRendered = selectedPost ? (alternativeImages[activeAltIndex]?.includes('/renders/') || false) : false;
  const isCtaModified = selectedPost ? editingCta !== (selectedPost.cta || '') : false;
  const isLogoModified = selectedPost ? (
    editingLogoPosition !== (selectedPost.logoPosition || activeBrandKit.logoPosition || 'top-left') ||
    editingLogoVariant !== (selectedPost.logoVariant || 'light') ||
    editingLogoSize !== (selectedPost.logoSize || 1.0)
  ) : false;
  const isColorModified = selectedPost ? editingColorVariation !== (selectedPost.colorVariation || 'default') : false;
  const isBlurModified = selectedPost ? editingBgBlur !== (selectedPost.bgBlur || 0) : false;
  const isOverlayModified = selectedPost ? editingOverlayOpacity !== (selectedPost.overlayOpacity !== undefined ? selectedPost.overlayOpacity : 0.55) : false;

  const showMockLogo = selectedPost ? (!isRendered || isLogoModified) : false;
  const showMockCta = selectedPost ? (!!editingCta && (!isRendered || isCtaModified || isColorModified || editingCtaRadius !== (selectedPost.ctaRadius !== undefined ? selectedPost.ctaRadius : 8))) : false;

  // Map posts for FullCalendar display (filtered by platform)
  const filteredPosts = calendarPlatformFilter === 'all'
    ? posts
    : posts.filter(p => p.platform === calendarPlatformFilter);

  const fcEvents = filteredPosts.map(post => {
    const isScheduled = post.status === 'scheduled';
    const isPublished = post.status === 'published';
    const isApproved = post.status === 'approved';
    const color = isPublished ? '#10b981' : isScheduled ? '#f59e0b' : isApproved ? '#8b5cf6' : '#94a3b8';
    
    return {
      id: post.id,
      title: post.text.substring(0, 32) + '...',
      start: post.scheduledAt || post.createdAt,
      allDay: true,
      backgroundColor: color,
      borderColor: color,
      extendedProps: { ...post }
    };
  });

  const getColorValue = (colorName: string, defaultColor: string) => {
    if (colorName === 'primary') return activeBrandKit.colors.primary;
    if (colorName === 'secondary') return activeBrandKit.colors.secondary;
    if (colorName === 'accent') return activeBrandKit.colors.accent;
    if (colorName === 'white') return '#FFFFFF';
    if (colorName === 'black') return '#000000';
    return defaultColor;
  };

  const getPanelStyle = () => {
    let bgColor = getColorValue(editingPanelBgColor, activeBrandKit.colors.primary);
    if (editingPanelBgColor === 'none') bgColor = 'transparent';
    else if (editingPanelBgColor === 'translucent-dark') bgColor = 'rgba(0, 0, 0, 0.65)';
    else if (editingPanelBgColor === 'translucent-light') bgColor = 'rgba(255, 255, 255, 0.65)';
    else if (editingPanelBgColor === 'default') {
      if (selectedPost?.templateId === 'quote') bgColor = activeBrandKit.colors.primary;
      else if (selectedPost?.templateId === 'testimonial') bgColor = activeBrandKit.colors.secondary;
      else bgColor = activeBrandKit.colors.primary;
    }

    const textColorVal = selectedPost?.templateId === 'testimonial' ? activeBrandKit.colors.primary : activeBrandKit.colors.secondary;
    
    const scale = 300 / 1080;
    const paddingVal = editingPanelPadding * scale;
    const radiusVal = editingPanelRadius * scale;
    const posX = editingTextXOffset * scale;
    const posY = editingTextYOffset * scale;

    let positionStyles: React.CSSProperties = {};
    if (editingPanelPosition !== 'relative') {
      positionStyles = {
        position: 'absolute',
        left: '50%',
        width: 'calc(100% - 24px)',
      };
      if (editingPanelPosition === 'top') {
        positionStyles.top = `${60 * scale + posY}px`;
        positionStyles.bottom = 'auto';
        positionStyles.transform = `translateX(-50%) translateX(${posX}px)`;
      } else if (editingPanelPosition === 'center') {
        positionStyles.top = '50%';
        positionStyles.bottom = 'auto';
        positionStyles.transform = `translate(-50%, -50%) translate(${posX}px, ${posY}px)`;
      } else if (editingPanelPosition === 'bottom') {
        positionStyles.bottom = `${60 * scale + posY}px`;
        positionStyles.top = 'auto';
        positionStyles.transform = `translateX(-50%) translateX(${posX}px)`;
      }
    } else {
      positionStyles = {
        position: 'relative',
        width: '100%',
        transform: `translate(${posX}px, ${posY}px)`,
      };
    }

    return {
      backgroundColor: bgColor,
      padding: `${paddingVal}px`,
      borderRadius: `${radiusVal}px`,
      color: getColorValue(editingTextColor, textColorVal),
      ...positionStyles,
      zIndex: 3,
      display: 'flex',
      flexDirection: 'column' as const,
      boxSizing: 'border-box' as const,
      transition: 'all 0.15s ease',
    };
  };

  const getTextStyle = (): React.CSSProperties => {
    const scale = 300 / 1080;
    const fontSizeVal = editingFontSize * scale;
    let textColorVal = selectedPost?.templateId === 'testimonial' ? activeBrandKit.colors.primary : activeBrandKit.colors.secondary;
    
    return {
      fontSize: `${fontSizeVal}px`,
      fontWeight: editingFontWeight as any,
      textAlign: editingTextAlignment,
      color: getColorValue(editingTextColor, textColorVal),
      fontFamily: activeBrandKit.typography.fontName,
      lineHeight: 1.45,
      margin: 0,
      wordBreak: 'break-word',
      whiteSpace: 'pre-wrap',
    };
  };

  const getCtaStyle = (): React.CSSProperties => {
    const scale = 300 / 1080;
    const radiusVal = editingCtaRadius * scale;
    const fontSizeVal = editingCtaFontSize * scale;
    const spacingVal = (24 + editingCtaYOffset) * scale;

    let bgCol = getColorValue(editingCtaBgColor, activeBrandKit.colors.accent);
    if (editingCtaBgColor === 'default') {
      if (editingColorVariation === 'inverted') bgCol = activeBrandKit.colors.secondary;
      else if (editingColorVariation === 'accent') bgCol = activeBrandKit.colors.primary;
      else bgCol = activeBrandKit.colors.accent;
    }

    let textCol = '#FFFFFF';
    if (editingCtaBgColor === 'white' || editingCtaBgColor === 'secondary' || (editingCtaBgColor === 'default' && editingColorVariation === 'inverted')) {
      textCol = activeBrandKit.colors.primary;
    }

    return {
      backgroundColor: bgCol,
      color: textCol,
      borderRadius: `${radiusVal}px`,
      fontSize: `${fontSizeVal}px`,
      fontWeight: 700,
      border: 'none',
      padding: `${10 * scale}px ${20 * scale}px`,
      marginTop: `${spacingVal}px`,
      alignSelf: editingTextAlignment === 'center' ? 'center' : editingTextAlignment === 'right' ? 'flex-end' : 'flex-start',
      textTransform: 'uppercase',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
      cursor: 'pointer',
      width: 'fit-content',
      whiteSpace: 'nowrap',
      transition: 'all 0.15s ease',
    };
  };

  return (
    <div className="prod-calendar-view container-fluid animate-slide-up">
      
      {/* Loading/Generating view overlay */}
      {isGenerating && (
        <div className="simulation-overlay">
          <div className="simulation-card glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div className="spark-wrapper">
                <Sparkles size={20} className="spark-glow" />
              </div>
              <h4 style={{ margin: 0, fontSize: 16 }}>Éles Tartalomterv Összeállítása</h4>
            </div>
            <p className="sim-sub">Pipeline csatorna futtatása a kinyert Brand DNA alapján</p>

            <div className="pipeline-steps">
              {[
                { title: 'Brand Kit feltöltése', desc: 'Színek és stílusjegyek igazítása.' },
                { title: 'Vizualizációs stratégia', desc: 'Flux kép-prompt kompozíció tervezése.' },
                { title: 'Képek generálása (Flux v2)', desc: 'Playwright template rétegek renderelése.' },
                { title: 'Szövegek és Metaadatok', desc: 'Magyar hangnemű leírások és hashtagek.' }
              ].map((step, idx) => {
                let stepState = 'pending';
                if (idx < currentStep) stepState = 'completed';
                else if (idx === currentStep) stepState = 'active';

                return (
                  <div key={idx} className={`step-item ${stepState}`}>
                    <div className="step-icon-wrapper">
                      {stepState === 'completed' ? <Check size={14} /> : <div className="step-number">{idx + 1}</div>}
                    </div>
                    <div className="step-text">
                      <span className="step-title">{step.title}</span>
                      <span className="step-desc">{step.desc}</span>
                    </div>
                    {stepState === 'active' && <div className="pulse-indicator" />}
                  </div>
                );
              })}
            </div>

            <div className="progress-bar-wrapper" style={{ margin: '20px 0 10px', height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg, #8b5cf6, #ec4899)', width: `${progressPercent}%`, transition: 'width 0.4s ease' }} />
            </div>

            <div className="simulation-console">
              <span className="console-title">Generálási napló:</span>
              <div className="console-lines" style={{ maxHeight: 120, overflowY: 'auto' }}>
                {progressLogs.map((log, idx) => (
                  <div key={idx} className={`console-line ${log.includes('[ERROR]') ? 'err' : log.includes('[SUCCESS]') ? 'success' : ''}`}>
                    {log}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Screen 1: Parameter Panel when empty */}
      {(posts.length === 0 && !bypassOnboarding) && !isGenerating ? (
        <div className="prod-onboarding-panel glass-panel" style={{ maxWidth: 800, margin: '40px auto', padding: 32, borderRadius: 16 }}>
          <div className="text-center" style={{ marginBottom: 28 }}>
            <div className="spark-wrapper" style={{ margin: '0 auto 16px', width: 48, height: 48, borderRadius: '50%', background: 'rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={24} style={{ color: '#8b5cf6' }} />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Éles Social Media Naptár Generátor</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 500, margin: '0 auto' }}>
              Állítsd be a kívánt paramétereket. A rendszer automatikusan felépíti a tartalomnaptárt a kinyert arculat (Brand DNA) szerint.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Brief */}
            <div className="form-group">
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Kampány témája / Fókusz (Brief):</label>
              <textarea
                value={briefText}
                onChange={(e) => setBriefText(e.target.value)}
                placeholder="Pl: Nyári specialty kávék és fagylalt különlegességek..."
                rows={3}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 13, fontFamily: 'inherit' }}
              />
            </div>

            {/* Config Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Platforms */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>Célcsatornák:</label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={platforms.includes('instagram')} onChange={e => setPlatforms(prev => e.target.checked ? [...prev, 'instagram'] : prev.filter(x => x !== 'instagram'))} style={{ accentColor: '#8b5cf6' }} />
                    <Instagram size={14} style={{ color: '#ec4899' }} /> Instagram
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={platforms.includes('facebook')} onChange={e => setPlatforms(prev => e.target.checked ? [...prev, 'facebook'] : prev.filter(x => x !== 'facebook'))} style={{ accentColor: '#8b5cf6' }} />
                    <Facebook size={14} style={{ color: '#3b82f6' }} /> Facebook
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={platforms.includes('meta-ads')} onChange={e => setPlatforms(prev => e.target.checked ? [...prev, 'meta-ads'] : prev.filter(x => x !== 'meta-ads'))} style={{ accentColor: '#8b5cf6' }} />
                    <span style={{ fontSize: 13 }}>🎯</span> Meta Ads
                  </label>
                </div>
              </div>

              {/* Timeframe */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>Tervezett időtáv:</label>
                <div style={{ display: 'flex', gap: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' }}>
                    <input type="radio" checked={timeframe === 'weekly'} onChange={() => setTimeframe('weekly')} style={{ accentColor: '#8b5cf6' }} />
                    Heti terv (3 poszt)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' }}>
                    <input type="radio" checked={timeframe === 'monthly'} onChange={() => setTimeframe('monthly')} style={{ accentColor: '#8b5cf6' }} />
                    Havi terv (6 poszt)
                  </label>
                </div>
              </div>
            </div>

            {/* Frequency and Key Dates */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>Poszt gyakoriság:</label>
                <select value={frequency} onChange={e => setFrequency(e.target.value as any)} style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12.5, fontFamily: 'inherit' }}>
                  <option value="3x">Heti 3 bejegyzés (Hétfő, Szerda, Péntek)</option>
                  <option value="daily">Minden nap (Hétfőtől Vasárnapig)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Kulcsdátumok / Események (opcionális):</label>
                <input
                  type="text"
                  value={keyDates}
                  onChange={(e) => setKeyDates(e.target.value)}
                  placeholder="pl. Július 4: Szezonnyitó kávéházi nap"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12.5, fontFamily: 'inherit' }}
                />
              </div>
            </div>

            {/* Content Focus */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>Tartalmi fókusz:</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { v: 'mixed',       l: '📈 Vegyes', desc: 'Ajánlott' },
                  { v: 'product',     l: '📦 Termék', desc: 'Bemutato' },
                  { v: 'promo',       l: '🎉 Akció', desc: 'Promo' },
                  { v: 'lifestyle',   l: '☀️ Életmód', desc: 'Hangulat' },
                  { v: 'educational', l: '📚 Edukatív', desc: 'Oktato' },
                ].map(({ v, l, desc }) => (
                  <button
                    key={v}
                    onClick={() => setContentFocus(v as any)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                      border: `1.5px solid ${contentFocus === v ? '#8b5cf6' : 'var(--border)'}`,
                      background: contentFocus === v ? 'rgba(139,92,246,0.15)' : 'var(--bg3)',
                      color: contentFocus === v ? '#c4b5fd' : 'var(--text-muted)',
                      transition: 'all 0.12s'
                    }}
                    title={desc}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleStartGeneration}
              disabled={!briefText.trim()}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: '#fff',
                border: 'none', borderRadius: 12, padding: '14px 28px', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', boxShadow: '0 4px 12px rgba(139,92,246,0.3)', marginTop: 12,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <Sparkles size={16} /> Éles Tartalomterv Generálása
            </button>
            <button
              onClick={() => {
                // Belépés generálás nélkül — üres naptár, manuális feltöltésre
                setPosts([]);
                setBypassOnboarding(true);
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'transparent', color: 'var(--text-muted)',
                border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 22px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', marginTop: 12, transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.color = '#c4b5fd'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <CalendarIcon size={15} /> Belépés generálás nélkül
            </button>
          </div>
        </div>
      ) : null}

      {/* Main Workspace (Visible once posts exist) */}
      {(posts.length > 0 || bypassOnboarding) && !isGenerating && (
        <div className="prod-calendar-workspace animate-slide-up">
          {/* Header Row */}
          <div className="workspace-header glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderRadius: 16, marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
            <div>
              <span className="badge-new" style={{ background: '#10b981', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>AKTÍV TARTALOMTERV</span>
              <h3 style={{ margin: '6px 0 0', fontSize: 18, color: 'var(--text)' }}>Éles Értékesítési Naptár</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Brief: "{briefText.substring(0, 70)}..."</p>
            </div>
            
            {/* Actions & Exporters */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {/* Tab selector */}
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
                <button className={`tab-sel-btn ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>Naptár</button>
                <button className={`tab-sel-btn ${activeTab === 'timeline' ? 'active' : ''}`} onClick={() => setActiveTab('timeline')}>Lista</button>
              </div>

              {/* Ad-Hoc Creation & Exporters */}
              <button className="btn-exporter-csv" onClick={() => handleOpenCreateModal()} style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: '#fff', border: 'none' }}>
                <Sparkles size={14} /> Új Poszt
              </button>
              <button className="btn-exporter-csv" onClick={handleExportCSV} title="Tartalomnaptár CSV-ben (Buffer/Hootsuite formátum)">
                <Download size={14} /> CSV
              </button>
              <button className="btn-exporter-csv" onClick={handleExportICS} title="Google Calendar / Apple Calendar import">
                <Download size={14} /> ICS
              </button>
              <button className="btn-exporter-zip" onClick={handleExportZIP} title="ZIP: képek + caption fájlok">
                <Download size={14} /> ZIP
              </button>
              <button className="btn-exporter-csv" onClick={handleCopyAllCaptions} title="Összes caption vágólapra másolás" style={{ background: 'var(--bg3)' }}>
                📋 Clipboard
              </button>
              <button className="btn-exporter-csv" onClick={handleExportPDF} title="Tartalomterv PDF (nyomtatásba mentés)" style={{ background: 'var(--bg3)' }}>
                📄 PDF
              </button>

              <button className="btn-reset-calendar" onClick={() => { if(confirm('Biztosan törölni szeretnéd a teljes naptárt?')) { setPosts([]); setBypassOnboarding(false); } }}>
                Törlés
              </button>
            </div>
          </div>

          {/* Batch action bar (Screen 5) */}
          {selectedPostIds.length > 0 && (
            <div className="batch-actions-bar animate-slide-up">
              <span className="batch-count">Kijelölve: <strong>{selectedPostIds.length}</strong> elem</span>
              <div className="batch-buttons">
                <button className="batch-btn approve" onClick={handleBatchApprove}><Check size={14} /> Jóváhagyás</button>
                <button className="batch-btn shift" onClick={handleBatchShiftDates}><CalendarIcon size={14} /> +1 nap eltolás</button>
                <button className="batch-btn delete" onClick={handleBatchDelete}><Trash2 size={14} /> Törlés</button>
                <button className="batch-btn close" onClick={() => setSelectedPostIds([])}><X size={14} /></button>
              </div>
            </div>
          )}

          {/* Platform filter bar (Screen 3) */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginRight: 4 }}>Platform szűrő:</span>
            {[
              { value: 'all',       label: '📊 Összes' },
              { value: 'instagram', label: '📸 Instagram' },
              { value: 'facebook',  label: '📘 Facebook' },
              { value: 'meta-ads',  label: '🎯 Meta Ads' },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setCalendarPlatformFilter(value)}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${calendarPlatformFilter === value ? '#8b5cf6' : 'var(--border)'}`,
                  background: calendarPlatformFilter === value ? 'rgba(139,92,246,0.15)' : 'var(--bg3)',
                  color: calendarPlatformFilter === value ? '#c4b5fd' : 'var(--text-muted)',
                  transition: 'all 0.12s'
                }}
              >
                {label}
                {value !== 'all' && (
                  <span style={{ marginLeft: 4, opacity: 0.7, fontSize: 9 }}>
                    ({posts.filter(p => p.platform === value).length})
                  </span>
                )}
              </button>
            ))}
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {filteredPosts.length}/{posts.length} poszt látható
            </span>
          </div>

          {/* Tab 1: FullCalendar View (Screen 3) */}
          {activeTab === 'calendar' && (
            <div className="calendar-grid-container glass-panel" style={{ padding: 24, borderRadius: 16 }}>
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                locale="hu"
                firstDay={1}
                height="auto"
                editable={true}
                eventDrop={handleEventDrop}
                events={fcEvents}
                headerToolbar={{
                  left: 'prev,today,next',
                  center: 'title',
                  right: ''
                }}
                buttonText={{ today: 'Ma' }}
                dateClick={(info) => {
                  handleOpenCreateModal(info.dateStr);
                }}
                eventClick={(info) => {
                  const post = posts.find(p => p.id === info.event.id);
                  if (post) handleOpenDetailModal(post);
                }}
                eventContent={(arg) => {
                  const post = arg.event.extendedProps;
                  return (
                    <div className="fc-post-event" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px', cursor: 'pointer' }}>
                      <img src={post.imageUrl} alt="" style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: 4 }} />
                      <span className="fc-event-title" style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.text.substring(0, 18)}</span>
                    </div>
                  );
                }}
              />
            </div>
          )}

          {/* ─── Célcsatornák Specifikáció Panel (állandó, naptár alatt) ─── */}
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📡</span> Célcsatornák — Platform Specifikációk
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              {(Object.entries(CHANNEL_SPECS) as [ChannelKey, typeof CHANNEL_SPECS[ChannelKey]][]).map(([key, spec]) => (
                <div key={key} style={{
                  borderRadius: 14, padding: 16,
                  border: `2px solid ${spec.color}30`,
                  background: `${spec.color}08`,
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <span style={{ fontSize: 20 }}>{spec.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: spec.color }}>{spec.label}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 1 }}>Célcsatorna</div>
                    </div>
                  </div>

                  {/* Format tiles */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Képformátumok</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {spec.formats.map((fmt: any) => (
                        <div key={fmt.id} title={fmt.desc} style={{
                          padding: '5px 8px', borderRadius: 7, fontSize: 10,
                          border: `1.5px solid ${fmt.default ? spec.color : 'rgba(255,255,255,0.1)'}`,
                          background: fmt.default ? `${spec.color}18` : 'rgba(255,255,255,0.03)',
                          color: fmt.default ? spec.color : 'var(--text-muted)',
                        }}>
                          <div style={{ fontWeight: 800, lineHeight: 1.2 }}>{fmt.label}</div>
                          <div style={{ fontSize: 8.5, marginTop: 1, opacity: 0.85 }}>{fmt.ar} · {fmt.w}×{fmt.h}</div>
                          {fmt.default && <div style={{ fontSize: 7.5, marginTop: 2, fontWeight: 800, textTransform: 'uppercase' }}>✓ Default</div>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Limits quick ref */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Korlátok</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                      {[
                        { label: 'Caption', val: `max ${(spec.limits as any).captionChars.toLocaleString()} kar.` },
                        { label: 'Hashtag', val: `max ${(spec.limits as any).hashtagCount} db · aj. ${(spec.limits as any).hashtagRecommended}` },
                        { label: 'CTA', val: `max ${(spec.limits as any).ctaTextChars} kar.` },
                        { label: 'Alt text', val: `max ${(spec.limits as any).altTextChars} kar.` },
                      ].map(l => (
                        <div key={l.label} style={{ padding: '4px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <div style={{ fontSize: 8.5, fontWeight: 800, color: spec.color, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{l.label}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{l.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Posting rules */}
                  <details>
                    <summary style={{ fontSize: 9.5, fontWeight: 700, color: spec.color, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em', userSelect: 'none' }}>
                      📋 Szabályok ({(spec.postingRules as readonly any[]).length} db)
                    </summary>
                    <ul style={{ margin: '6px 0 0', padding: '0 0 0 12px', listStyle: 'disc' }}>
                      {(spec.postingRules as readonly string[]).map((r: string, i: number) => (
                        <li key={i} style={{ fontSize: 9.5, color: 'var(--text-muted)', marginBottom: 2.5, lineHeight: 1.4 }}>{r}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              ))}
            </div>
          </div>

          {/* Tab 2: Timeline list view (Screen 5 checkboxes here) */}
          {activeTab === 'timeline' && (
            <div className="timeline-view-list glass-panel" style={{ padding: 20, borderRadius: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <h4 style={{ margin: 0, fontSize: 14 }}>Tervezett bejegyzések ({posts.length} db)</h4>
                <button className="btn-select-all" onClick={handleSelectAllPosts}>
                  {selectedPostIds.length === posts.length ? 'Összes kijelölés megszüntetése' : 'Összes kijelölése'}
                </button>
              </div>

              <div className="timeline-items" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {posts.map((post) => {
                  const isSelected = selectedPostIds.includes(post.id);
                  return (
                    <div key={post.id} className={`timeline-item-card ${isSelected ? 'selected' : ''}`} style={{ display: 'flex', gap: 16, padding: 14, background: 'var(--bg3)', border: `1.5px solid ${isSelected ? '#8b5cf6' : 'var(--border)'}`, borderRadius: 12, alignItems: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => handleToggleSelectPost(post.id)}
                        style={{ width: 16, height: 16, accentColor: '#8b5cf6', cursor: 'pointer' }}
                      />
                      <img src={post.imageUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} onClick={() => handleOpenDetailModal(post)} />
                      
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)' }}>
                            {new Date(post.scheduledAt || post.createdAt).toLocaleString('hu-HU', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className={`status-badge-lbl badge-${post.status}`} style={{ fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase' }}>{post.status}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>{post.text}</p>
                      </div>

                      <button className="btn-edit-inline" onClick={() => handleOpenDetailModal(post)}>Szerkesztés</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Screen 4: Detailed Preview & Editor Modal */}
      {selectedPost && (
        <div className="preview-modal-overlay" onClick={() => setSelectedPost(null)}>
          <div className="preview-modal-card glass-panel" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Bejegyzés Részletes Ellenőrzése</h4>
                <span className="sub" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Státusz: <strong className={`text-${selectedPost.status}`}>{selectedPost.status.toUpperCase()}</strong></span>
              </div>
              <button className="close-modal-btn" onClick={() => setSelectedPost(null)}><X size={18} /></button>
            </div>

            {/* Modal Body */}
            <div className="modal-grid" style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, padding: 24 }}>
              
              {/* Left Column: Phone Mockup */}
              <div className="phone-mockup-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div className="phone-container">
                  <div className="phone-speaker" />
                  <div className="phone-screen">
                    {/* Simulated Instagram Interface */}
                    <div className="insta-header">
                      <div className="insta-avatar" style={{ background: activeBrandKit.colors.primary }}>{activeBrandKit.typography.fontName[0]}</div>
                      <div className="insta-meta">
                        <span className="insta-name">éles_kampány</span>
                        <span className="insta-location">Budapest, Hungary</span>
                      </div>
                      <span className="insta-more">•••</span>
                    </div>

                    <div 
                      className="phone-image-canvas" 
                      style={{ 
                        position: 'relative', 
                        width: '300px', 
                        height: '375px', 
                        background: '#000', 
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: (selectedPost.templateId === 'quote' || selectedPost.templateId === 'testimonial') ? 'center' : 'flex-end',
                        alignItems: (selectedPost.templateId === 'quote' || selectedPost.templateId === 'testimonial') ? 'center' : 'stretch'
                      }}
                    >
                      <img 
                        src={alternativeImages[activeAltIndex] || originalAltImages[activeAltIndex] || selectedPost.originalImageUrl || selectedPost.imageUrl} 
                        alt="" 
                        style={{ 
                          width: '100%', 
                          height: '100%', 
                          objectFit: 'cover',
                          filter: editingBgBlur > 0 ? `blur(${editingBgBlur}px)` : 'none',
                          transition: 'filter 0.15s ease',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          zIndex: 1
                        }} 
                      />

                      {/* Hover Layer Template Preview – CSS overlay on the phone canvas */}
                      {hoveredLayerTemplateId && (() => {
                        const allTmpls = buildLayerTemplates(
                          activeBrandKit.colors.primary,
                          activeBrandKit.colors.accent,
                          activeBrandKit.typography?.fontName || 'Inter'
                        );
                        const tmpl = allTmpls.find(t => t.id === hoveredLayerTemplateId);
                        if (!tmpl) return null;
                        // Scale from 1080x1350 to 300x375
                        const scaleX = 300 / 1080;
                        const scaleY = 375 / 1350;
                        return (
                          <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none', overflow: 'hidden', transition: 'opacity 0.2s ease' }}>
                            {/* Label badge */}
                            <div style={{
                              position: 'absolute', top: 6, left: 6, zIndex: 20,
                              background: 'rgba(80,20,200,0.92)',
                              borderRadius: 6, padding: '3px 8px',
                              fontSize: 9, fontWeight: 800, color: '#fff',
                              display: 'flex', alignItems: 'center', gap: 4
                            }}>
                              <span>{tmpl.emoji}</span>
                              <span>ELŐNÉZET: {tmpl.name}</span>
                            </div>
                            {tmpl.layers.map((layer, li) => {
                              const lx = Math.round(layer.x * scaleX);
                              const ly = Math.round(layer.y * scaleY);
                              const lw = Math.round(layer.width * scaleX);
                              const lh = layer.height != null ? Math.round(layer.height * scaleY) : undefined;
                              const baseStyle: React.CSSProperties = {
                                position: 'absolute',
                                left: lx, top: ly, width: lw,
                                height: lh,
                                opacity: layer.opacity ?? 1,
                                boxSizing: 'border-box',
                                pointerEvents: 'none'
                              };
                              if (layer.type === 'figure') {
                                return (
                                  <div key={li} style={{
                                    ...baseStyle,
                                    background: layer.fill || 'transparent',
                                    borderRadius: layer.subType === 'circle' ? '50%' : (layer.cornerRadius ? `${layer.cornerRadius * scaleX}px` : 0),
                                    border: layer.border || 'none'
                                  }} />
                                );
                              }
                              if (layer.type === 'text') {
                                return (
                                  <div key={li} style={{
                                    ...baseStyle,
                                    fontFamily: layer.fontFamily || 'Inter',
                                    fontSize: `${(layer.fontSize || 16) * scaleX}px`,
                                    fontWeight: layer.fontWeight || 'normal',
                                    color: layer.fill || '#ffffff',
                                    textAlign: (layer.align || 'left') as any,
                                    lineHeight: layer.lineHeight || 1.2,
                                    textShadow: layer.textShadow || 'none',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-start'
                                  }}>{layer.text}
                                  </div>
                                );
                              }
                              return null;
                            })}
                          </div>
                        );
                      })()}
                      
                      {/* Dynamic Background Gradient Overlay — template-specific */}
                      {selectedPost.templateId === 'testimonial' ? (
                        // Testimonial: blurred overlay
                        <div style={{
                          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                          background: `rgba(0,0,0,${editingOverlayOpacity})`,
                          pointerEvents: 'none', zIndex: 2
                        }} />
                      ) : selectedPost.templateId === 'quote' ? (
                        // Quote: diagonal gradient + left accent bar
                        <>
                          <div style={{
                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                            background: `linear-gradient(135deg, rgba(0,0,0,${editingOverlayOpacity * 1.2}) 0%, rgba(0,0,0,${editingOverlayOpacity * 0.6}) 60%, rgba(0,0,0,${editingOverlayOpacity}) 100%)`,
                            pointerEvents: 'none', zIndex: 2
                          }} />
                          <div style={{
                            position: 'absolute', top: 0, left: 0, bottom: 0, width: '5px',
                            backgroundColor: activeBrandKit.colors.accent,
                            zIndex: 4, pointerEvents: 'none'
                          }} />
                        </>
                      ) : (
                        // Default: bottom-heavy gradient
                        <div style={{
                          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                          background: `linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,${editingOverlayOpacity}) 100%)`,
                          pointerEvents: 'none', zIndex: 2
                        }} />
                      )}

                      {/* Real-time Logo Overlay */}
                      <div className="mock-watermark" style={{
                        position: 'absolute',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 10px',
                        background: editingLogoVariant === 'light' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.75)',
                        backdropFilter: 'none',
                        color: editingLogoVariant === 'light' ? '#fff' : activeBrandKit.colors.primary,
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        zIndex: 10,
                        transform: `scale(${editingLogoSize})`,
                        transformOrigin: editingLogoPosition.replace('-', ' '),
                        transition: 'all 0.15s ease',
                        ...(editingLogoPosition === 'top-right' ? { top: 12, right: 12 } :
                           editingLogoPosition === 'bottom-left' ? { bottom: 12, left: 12 } :
                           editingLogoPosition === 'bottom-right' ? { bottom: 12, right: 12 } :
                           { top: 12, left: 12 })
                      }}>
                        {(() => {
                          const brandNameLower = (activeBrandKit.name || '').toLowerCase();
                          const isCup = activeBrandKit.logoUrl === 'coffee-cup-minimal' || 
                                        brandNameLower.includes('kávé') || 
                                        brandNameLower.includes('coffee') || 
                                        brandNameLower.includes('cafe') || 
                                        brandNameLower.includes('latte');
                          return isCup ? (
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                              <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
                              <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                          );
                        })()}
                        <span>{activeBrandKit.name || 'Márka'}</span>
                      </div>


                      {/* Real-time Content Panel Overlays */}
                      {selectedPost.templateId !== 'universal' && (() => {
                        const panelStyle = getPanelStyle();
                        const textStyle = getTextStyle();
                        const ctaStyle = getCtaStyle();
                        const scale = 300 / 1080;

                        if (selectedPost.templateId === 'product') {
                          return (
                            <div style={{ ...panelStyle, borderTop: `${3 * scale}px solid ${activeBrandKit.colors.accent}` }}>
                              <div style={{ width: `${24 * scale}px`, height: `${2 * scale}px`, background: activeBrandKit.colors.accent, marginBottom: `${6 * scale}px`, borderRadius: '1px' }} />
                              <p style={textStyle}>{editingText}</p>
                              {editingCta && (
                                <button style={ctaStyle}>{editingCta}</button>
                              )}
                            </div>
                          );
                        }

                        if (selectedPost.templateId === 'quote') {
                          // Quote: centered text with big quotation mark — NO solid panel background, overlay handles darkness
                          return (
                            <div style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              width: 'calc(100% - 40px)',
                              zIndex: 3,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              textAlign: 'center',
                              gap: `${10 * scale}px`,
                              color: activeBrandKit.colors.secondary
                            }}>
                              <span style={{
                                fontSize: `${64 * scale}px`,
                                color: activeBrandKit.colors.accent,
                                fontFamily: "'Playfair Display', serif",
                                lineHeight: 0.1,
                                marginBottom: `${-10 * scale}px`
                              }}>“</span>
                              <p style={{ ...textStyle, fontStyle: 'italic', textAlign: 'center', color: '#fff' }}>{editingText}</p>
                              <div style={{
                                width: `${40 * scale}px`,
                                height: `${3 * scale}px`,
                                backgroundColor: activeBrandKit.colors.accent,
                                borderRadius: '2px'
                              }} />
                            </div>
                          );
                        }

                        if (selectedPost.templateId === 'testimonial') {
                          // Testimonial: floating white card in center (no position from panelStyle, override)
                          return (
                            <div style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              width: 'calc(100% - 32px)',
                              zIndex: 3,
                              backgroundColor: activeBrandKit.colors.secondary || '#f8f8f8',
                              color: activeBrandKit.colors.primary,
                              borderRadius: `${8 * scale}px`,
                              padding: `${22 * scale}px ${18 * scale}px`,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              textAlign: 'center',
                              gap: `${8 * scale}px`,
                              boxShadow: `0 ${8 * scale}px ${24 * scale}px rgba(0,0,0,0.4)`,
                              borderTop: `${4 * scale}px solid ${activeBrandKit.colors.accent}`
                            }}>
                              <div style={{ display: 'flex', gap: `${3 * scale}px`, color: activeBrandKit.colors.accent, fontSize: `${14 * scale}px` }}>
                                <span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>
                              </div>
                              <p style={{ ...textStyle, fontStyle: 'italic', textAlign: 'center', color: activeBrandKit.colors.primary }}>{editingText}</p>
                              {editingCta && (
                                <p style={{
                                  fontSize: `${9 * scale}px`,
                                  fontWeight: 700,
                                  color: activeBrandKit.colors.accent,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px'
                                }}>{editingCta}</p>
                              )}
                            </div>
                          );
                        }

                        if (selectedPost.templateId === 'list') {
                          // List: transparent panel (gradient shows through), numbered badges
                          const lines = editingText.split('\n').filter(Boolean);
                          const listTitle = lines[0] || '';
                          const listItems = lines.slice(1);

                          return (
                            <div style={{
                              ...panelStyle,
                              backgroundColor: 'transparent',  // no solid bg, gradient handles it
                              paddingTop: `${8 * scale}px`
                            }}>
                              <h3 style={{
                                ...textStyle,
                                fontWeight: 800,
                                fontSize: `${14 * scale}px`,
                                borderBottom: `${1.5 * scale}px solid ${activeBrandKit.colors.accent}`,
                                paddingBottom: `${5 * scale}px`,
                                marginBottom: `${8 * scale}px`,
                                color: '#fff'
                              }}>{listTitle}</h3>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: `${8 * scale}px` }}>
                                {listItems.slice(0, 4).map((itemText, idx) => {
                                  const cleanedText = itemText.replace(/^\d+\.\s*/, '');
                                  return (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: `${8 * scale}px` }}>
                                      <div style={{
                                        width: `${16 * scale}px`,
                                        height: `${16 * scale}px`,
                                        borderRadius: '50%',
                                        backgroundColor: activeBrandKit.colors.accent,
                                        color: '#fff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: '700',
                                        fontSize: `${9 * scale}px`,
                                        flexShrink: 0
                                      }}>{idx + 1}</div>
                                      <p style={{ ...textStyle, fontSize: `${11 * scale}px`, color: '#fff' }}>{cleanedText}</p>
                                    </div>
                                  );
                                })}
                              </div>
                              {editingCta && (
                                <button style={ctaStyle}>{editingCta}</button>
                              )}
                            </div>
                          );
                        }

                        return null;
                      })()}
                    </div>                    {/* Instagram actions */}
                    <div className="insta-actions" style={{ display: 'flex', gap: 12, padding: '10px 12px 6px', fontSize: 14 }}>
                      <span>❤️</span><span>💬</span><span>✈️</span>
                    </div>
                    <div className="insta-caption-text" style={{ padding: '0 12px 12px', fontSize: 11.5, color: '#e2e8f0', lineHeight: 1.45, whiteSpace: 'pre-wrap', maxHeight: 85, overflowY: 'auto' }}>
                      <strong>éles_kampány</strong> {editingText}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Editor & Options */}
              <div className="editor-side" style={{ display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto', maxHeight: 'calc(90vh - 120px)', paddingRight: 4 }}>
                
                {/* Description editing */}
                <div className="form-group">
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Bejegyzés Szövege (magyarul):</label>
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    rows={5}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12.5, fontFamily: 'inherit', lineHeight: 1.5 }}
                  />
                </div>

                {/* ─── Csatorna Specifikáció Panel ─────────────────────────── */}
                {(() => {
                  const ch = (selectedPost.platform || 'instagram') as ChannelKey;
                  const spec = CHANNEL_SPECS[ch] || CHANNEL_SPECS['instagram'];
                  const captionLen = editingText.length;
                  const hashtagCount = editingHashtags.split(/\s+/).filter(t => t.startsWith('#')).length;
                  const ctaLen = editingCta.length;
                  const altLen = editingAltText.length;
                  const capPct = Math.min(100, Math.round(captionLen / spec.limits.captionChars * 100));
                  const htPct  = Math.min(100, Math.round(hashtagCount / spec.limits.hashtagCount * 100));
                  const ctaPct = Math.min(100, Math.round(ctaLen / spec.limits.ctaTextChars * 100));

                  const barColor = (pct: number) => pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#10b981';

                  return (
                    <div style={{ padding: '16px', borderRadius: 12, border: `2px solid ${spec.color}33`, background: `${spec.color}08`, marginBottom: 16 }}>
                      {/* Header + platform switcher */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16 }}>{spec.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: spec.color }}>{spec.label} — Csatorna Spec</span>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {(['instagram', 'facebook', 'meta-ads'] as ChannelKey[]).map(p => {
                            const ps = CHANNEL_SPECS[p];
                            const isActive = (selectedPost.platform || 'instagram') === p;
                            return (
                              <button key={p}
                                title={ps.label}
                                onClick={() => {
                                  setPosts(prev => prev.map(post => post.id === selectedPost.id ? { ...post, platform: p as PostCreative['platform'] } : post));
                                  setSelectedPost(prev => prev ? { ...prev, platform: p as PostCreative['platform'] } : null);
                                }}
                                style={{
                                  padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                  border: `1.5px solid ${isActive ? ps.color : 'var(--border)'}`,
                                  background: isActive ? `${ps.color}22` : 'var(--bg3)',
                                  color: isActive ? ps.color : 'var(--text-muted)',
                                  transition: 'all 0.12s'
                                }}
                              >{ps.icon} {ps.label}</button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Format cards (aspect ratios) */}
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                          Képformátumok &amp; Arányok
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {spec.formats.map(fmt => (
                            <div key={fmt.id} title={fmt.desc}
                              style={{
                                padding: '6px 10px', borderRadius: 8, fontSize: 11,
                                border: `1.5px solid ${fmt.default ? spec.color : 'var(--border)'}`,
                                background: fmt.default ? `${spec.color}15` : 'var(--bg3)',
                                color: fmt.default ? spec.color : 'var(--text-muted)',
                                cursor: 'default',
                              }}
                            >
                              <div style={{ fontWeight: 800 }}>{fmt.label}</div>
                              <div style={{ fontSize: 9, opacity: 0.8 }}>{fmt.ar} · {fmt.w}×{fmt.h}</div>
                              {fmt.default && <div style={{ fontSize: 8, marginTop: 2, fontWeight: 700, textTransform: 'uppercase', opacity: 0.9 }}>✓ Default</div>}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Limit meters */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                        {[
                          { label: 'Caption', current: captionLen, max: spec.limits.captionChars, pct: capPct, unit: 'kar.' },
                          { label: 'Hashtag', current: hashtagCount, max: spec.limits.hashtagCount, pct: htPct, unit: `db (aj. ${spec.limits.hashtagRecommended})` },
                          { label: 'CTA szöveg', current: ctaLen, max: spec.limits.ctaTextChars, pct: ctaPct, unit: 'kar.' },
                          { label: 'Alt szöveg', current: altLen, max: spec.limits.altTextChars, pct: Math.min(100, Math.round(altLen / spec.limits.altTextChars * 100)), unit: 'kar.' },
                        ].map(m => (
                          <div key={m.label}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
                              <span style={{ fontWeight: 700 }}>{m.label}</span>
                              <span style={{ color: m.pct > 90 ? '#ef4444' : 'var(--text-muted)' }}>
                                {m.current} / {m.max} {m.unit}
                              </span>
                            </div>
                            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${m.pct}%`, background: barColor(m.pct), borderRadius: 2, transition: 'width 0.2s' }} />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Posting rules */}
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ fontSize: 10, fontWeight: 700, color: spec.color, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          📋 Platform szabályok ({spec.postingRules.length} db)
                        </summary>
                        <ul style={{ margin: '8px 0 0', padding: '0 0 0 14px', listStyle: 'disc' }}>
                          {spec.postingRules.map((r, i) => (
                            <li key={i} style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 3, lineHeight: 1.4 }}>{r}</li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  );
                })()}

                {/* Hashtag editor */}
                <div className="form-group">
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span># Hashtag-ek:</span>
                    <span style={{ fontSize: 10, color: '#8b5cf6', fontWeight: 600 }}>
                      {editingHashtags.split(/\s+/).filter(t => t.startsWith('#')).length} db
                    </span>
                  </label>
                  <textarea
                    value={editingHashtags}
                    onChange={(e) => setEditingHashtags(e.target.value)}
                    rows={2}
                    placeholder="#brand #termék #akció #nyár"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12, fontFamily: 'monospace', lineHeight: 1.5 }}
                  />
                </div>

                {/* Alt text */}
                <div className="form-group">
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Alt szöveg (SEO / accessibility):</label>
                  <input
                    type="text"
                    value={editingAltText}
                    onChange={(e) => setEditingAltText(e.target.value)}
                    placeholder="Képleírás a látássérültek számára..."
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12 }}
                  />
                </div>

                {/* CTA and Alt image picker */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>CTA gomb szövege:</label>
                    <input
                      type="text"
                      value={editingCta}
                      onChange={(e) => setEditingCta(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12.5 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Ütemezés Dátuma:</label>
                    <input
                      type="datetime-local"
                      value={selectedPost.scheduledAt ? new Date(new Date(selectedPost.scheduledAt).getTime() - new Date().getTimezoneOffset()*60000).toISOString().substring(0, 16) : ''}
                      onChange={(e) => {
                        const newDate = new Date(e.target.value).toISOString();
                        setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, scheduledAt: newDate } : p));
                        setSelectedPost(prev => prev ? { ...prev, scheduledAt: newDate } : null);
                      }}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12 }}
                    />
                  </div>

                  {/* AI Optimális időpont javaslat */}
                  {(() => {
                    const platform = selectedPost.platform || 'instagram';
                    const suggestions: Record<string, { time: string; label: string; reason: string }[]> = {
                      instagram: [
                        { time: '09:00', label: '9:00', reason: 'Legjobb organikus elérés hétköznapokon' },
                        { time: '12:00', label: '12:00', reason: 'Ebédszünet — magas activity' },
                        { time: '18:00', label: '18:00', reason: 'Csúcs engagement idő' },
                      ],
                      facebook: [
                        { time: '10:00', label: '10:00', reason: 'Business audience aktív' },
                        { time: '13:00', label: '13:00', reason: 'Lunch break scroll' },
                        { time: '19:00', label: '19:00', reason: 'Legjobb Facebook reach' },
                      ],
                      'meta-ads': [
                        { time: '08:00', label: '8:00', reason: 'Pre-work böngészés' },
                        { time: '14:00', label: '14:00', reason: 'Legolcsóbb CPM időablak' },
                        { time: '20:00', label: '20:00', reason: 'Magas konverziós időszak' },
                      ],
                    };
                    const times = suggestions[platform] || suggestions['instagram'];
                    const baseDate = selectedPost.scheduledAt
                      ? new Date(selectedPost.scheduledAt).toISOString().substring(0, 10)
                      : new Date().toISOString().substring(0, 10);
                    return (
                      <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 8 }}>
                          🤖 AI Javasolt időpontok — {platform}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {times.map(s => (
                            <button
                              key={s.time}
                              title={s.reason}
                              onClick={() => {
                                const newDate = new Date(`${baseDate}T${s.time}:00`).toISOString();
                                setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, scheduledAt: newDate } : p));
                                setSelectedPost(prev => prev ? { ...prev, scheduledAt: newDate } : null);
                              }}
                              style={{
                                padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                border: '1.5px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.12)',
                                color: '#c4b5fd', transition: 'all 0.12s'
                              }}
                            >{s.label}</button>
                          ))}
                        </div>
                        <div style={{ marginTop: 5, fontSize: 10, color: 'var(--text-muted)' }}>Hover = magyarázat · Kattintás = kitöltés</div>
                      </div>
                    );
                  })()}
                </div>

                {/* Variations Bar (Screen 4) */}
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>Vizuális Variációk (Képek):</label>
                  <div className="alternative-thumbs" style={{ display: 'flex', gap: 10 }}>
                    {alternativeImages.map((img, idx) => (
                      <div key={idx} className={`alt-thumb-wrapper ${activeAltIndex === idx ? 'active' : ''}`} onClick={() => setActiveAltIndex(idx)} style={{ width: 64, height: 64, borderRadius: 6, overflow: 'hidden', border: `2.5px solid ${activeAltIndex === idx ? '#8b5cf6' : 'transparent'}`, cursor: 'pointer', background: '#000', transition: 'all 0.15s' }}>
                        <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: activeAltIndex === idx ? 1 : 0.7 }} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Color Variation (Screen 4) */}
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>
                    Szín Variáció:
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { v: 'default',  l: 'Alap',      color: activeBrandKit.colors.primary },
                      { v: 'inverted', l: 'Fordított', color: activeBrandKit.colors.secondary },
                      { v: 'accent',   l: 'Kiemelő',  color: activeBrandKit.colors.accent },
                    ].map(({ v, l, color }) => (
                      <button
                        key={v}
                        onClick={() => setEditingColorVariation(v as any)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                          border: `2px solid ${editingColorVariation === v ? '#8b5cf6' : 'var(--border)'}`,
                          background: editingColorVariation === v ? 'rgba(139,92,246,0.15)' : 'var(--bg3)',
                          color: editingColorVariation === v ? '#c4b5fd' : 'var(--text-muted)',
                          transition: 'all 0.12s'
                        }}
                      >
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', border: '1px solid rgba(255,255,255,0.2)' }} />
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Layer Template Picker – uses shared templates from Layer Szerkesztő */}
                {(() => {
                  const layerTemplates = buildLayerTemplates(
                    activeBrandKit.colors.primary,
                    activeBrandKit.colors.accent,
                    activeBrandKit.typography?.fontName || 'Inter'
                  );
                  return (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', display: 'block' }}>
                          <Layers size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                          Layer Sablonok ({layerTemplates.length} db) – hover = előnézet, kattintás = renderelés:
                        </label>
                        {isApplyingLayerTemplate && (
                          <span style={{ fontSize: 10, color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Loader size={10} className="spin-icon" /> Renderelés...
                          </span>
                        )}
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 8,
                        maxHeight: 340,
                        overflowY: 'auto',
                        paddingRight: 4
                      }}>
                        {layerTemplates.map(tmpl => (
                          <button
                            key={tmpl.id}
                            onClick={() => handleApplyLayerTemplate(tmpl)}
                            onMouseEnter={() => setHoveredLayerTemplateId(tmpl.id)}
                            onMouseLeave={() => setHoveredLayerTemplateId(null)}
                            disabled={isApplyingLayerTemplate}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-start',
                              gap: 4,
                              padding: '10px 10px',
                              borderRadius: 10,
                              border: `2px solid ${
                                hoveredLayerTemplateId === tmpl.id ? '#a78bfa'
                                : selectedLayerTemplateId === tmpl.id ? '#8b5cf6'
                                : 'var(--border)'
                              }`,
                              background: hoveredLayerTemplateId === tmpl.id
                                ? 'rgba(167,139,250,0.18)'
                                : selectedLayerTemplateId === tmpl.id
                                ? 'rgba(139,92,246,0.12)'
                                : 'var(--bg3)',
                              cursor: isApplyingLayerTemplate ? 'not-allowed' : 'pointer',
                              opacity: isApplyingLayerTemplate && selectedLayerTemplateId !== tmpl.id ? 0.5 : 1,
                              transition: 'all 0.12s ease',
                              textAlign: 'left',
                              position: 'relative',
                              boxShadow: hoveredLayerTemplateId === tmpl.id ? '0 0 0 3px rgba(167,139,250,0.2)' : 'none'
                            }}
                          >
                            {isApplyingLayerTemplate && selectedLayerTemplateId === tmpl.id && (
                              <div style={{
                                position: 'absolute', inset: 0, background: 'rgba(139,92,246,0.15)',
                                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center'
                              }}>
                                <Loader size={18} className="spin-icon" style={{ color: '#8b5cf6' }} />
                              </div>
                            )}
                            <span style={{ fontSize: 18, lineHeight: 1 }}>{tmpl.emoji}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{tmpl.name}</span>
                            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', lineHeight: 1.3 }}>{tmpl.desc}</span>
                          </button>
                        ))}
                      </div>
                      <p style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 8 }}>
                        Hover = előnézet a telefón képén · Kattintás = Playwright renderelés
                      </p>
                    </div>
                  );
                })()}

                {/* Layer Editor Controls (Réteg Szerkesztő) */}
                <div className="layer-editor-panel" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, display: 'block' }}>Rétegek Testreszabása (Layer Editor):</label>
                  
                  {/* 2x2 grid instead of 4 columns to prevent overflow */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    
                    {/* Column 1: Layout & Position */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 2 }}>Elrendezés & Pozíció</span>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Kártya Horgony:</label>
                        <select value={editingPanelPosition} onChange={e => setEditingPanelPosition(e.target.value as any)} style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 11 }}>
                          <option value="relative">Folyamatos (Relative)</option>
                          <option value="top">Fent (Top)</option>
                          <option value="center">Középen (Center)</option>
                          <option value="bottom">Lent (Bottom)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Vízszintes (X): <span style={{ color: '#8b5cf6', float: 'right' }}>{editingTextXOffset}px</span></label>
                        <input type="range" min="-150" max="150" step="5" value={editingTextXOffset} onChange={e => setEditingTextXOffset(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Függőleges (Y): <span style={{ color: '#8b5cf6', float: 'right' }}>{editingTextYOffset}px</span></label>
                        <input type="range" min="-300" max="300" step="5" value={editingTextYOffset} onChange={e => setEditingTextYOffset(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                      </div>
                    </div>

                    {/* Column 2: Background & Overlays */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 2 }}>Kártya & Háttér</span>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Kártya Háttér:</label>
                        <select value={editingPanelBgColor} onChange={e => setEditingPanelBgColor(e.target.value as any)} style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 11 }}>
                          <option value="default">Alapértelmezett</option>
                          <option value="primary">Elsődleges szín</option>
                          <option value="secondary">Másodlagos szín</option>
                          <option value="accent">Kiemelő szín</option>
                          <option value="translucent-dark">Áttetsző sötét</option>
                          <option value="translucent-light">Áttetsző világos</option>
                          <option value="none">Nincs (Átlátszó)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Belső Margó: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingPanelPadding}px</span></label>
                        <input type="range" min="20" max="100" step="5" value={editingPanelPadding} onChange={e => setEditingPanelPadding(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Kártya Lekerekítés: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingPanelRadius}px</span></label>
                        <input type="range" min="0" max="40" step="2" value={editingPanelRadius} onChange={e => setEditingPanelRadius(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Háttér Elmosás: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingBgBlur}px</span></label>
                        <input type="range" min="0" max="15" step="1" value={editingBgBlur} onChange={e => setEditingBgBlur(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Sötétítő réteg: <span style={{ color: '#8b5cf6', float: 'right' }}>{Math.round(editingOverlayOpacity*100)}%</span></label>
                        <input type="range" min="0.1" max="0.9" step="0.05" value={editingOverlayOpacity} onChange={e => setEditingOverlayOpacity(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                      </div>
                    </div>

                    {/* Column 3: Typography & Text */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 2 }}>Szöveg & Betű</span>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Szöveg Igazítás:</label>
                        <select value={editingTextAlignment} onChange={e => setEditingTextAlignment(e.target.value as any)} style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 11 }}>
                          <option value="left">Balra</option>
                          <option value="center">Középre</option>
                          <option value="right">Jobbra</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Betű Vastagság:</label>
                        <select value={editingFontWeight} onChange={e => setEditingFontWeight(e.target.value)} style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 11 }}>
                          <option value="normal">Normal</option>
                          <option value="600">Semi-Bold</option>
                          <option value="700">Bold</option>
                          <option value="800">Extra-Bold</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Szöveg Színe:</label>
                        <select value={editingTextColor} onChange={e => setEditingTextColor(e.target.value as any)} style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 11 }}>
                          <option value="default">Alapértelmezett</option>
                          <option value="primary">Elsődleges</option>
                          <option value="secondary">Másodlagos</option>
                          <option value="accent">Kiemelő</option>
                          <option value="white">Fehér</option>
                          <option value="black">Fekete</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Betűméret: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingFontSize}px</span></label>
                        <input type="range" min="18" max="64" step="2" value={editingFontSize} onChange={e => setEditingFontSize(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                      </div>
                    </div>

                    {/* Column 4: CTA Button & Logo */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 2 }}>CTA Gomb & Logó</span>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Gomb Háttér:</label>
                        <select value={editingCtaBgColor} onChange={e => setEditingCtaBgColor(e.target.value as any)} style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 11 }}>
                          <option value="default">Alapértelmezett</option>
                          <option value="primary">Elsődleges</option>
                          <option value="secondary">Másodlagos</option>
                          <option value="accent">Kiemelő</option>
                          <option value="white">Fehér</option>
                          <option value="black">Fekete</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Gomb Betűméret: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingCtaFontSize}px</span></label>
                        <input type="range" min="12" max="36" step="1" value={editingCtaFontSize} onChange={e => setEditingCtaFontSize(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Gomb Margó Y: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingCtaYOffset}px</span></label>
                        <input type="range" min="-50" max="150" step="5" value={editingCtaYOffset} onChange={e => setEditingCtaYOffset(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Gomb Lekerekítés: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingCtaRadius}px</span></label>
                        <input type="range" min="0" max="24" step="2" value={editingCtaRadius} onChange={e => setEditingCtaRadius(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Logó Méret: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingLogoSize}x</span></label>
                        <input type="range" min="0.6" max="1.6" step="0.1" value={editingLogoSize} onChange={e => setEditingLogoSize(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <div>
                          <label style={{ fontSize: 8.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Logó Helye:</label>
                          <select value={editingLogoPosition} onChange={e => setEditingLogoPosition(e.target.value as any)} style={{ width: '100%', padding: '3px 5px', borderRadius: 4, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 9.5 }}>
                            <option value="top-left">Bal Fent</option>
                            <option value="top-right">Jobb Fent</option>
                            <option value="bottom-left">Bal Lent</option>
                            <option value="bottom-right">Jobb Lent</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 8.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Logó Szín:</label>
                          <select value={editingLogoVariant} onChange={e => setEditingLogoVariant(e.target.value as any)} style={{ width: '100%', padding: '3px 5px', borderRadius: 4, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 9.5 }}>
                            <option value="light">Világos</option>
                            <option value="dark">Sötét</option>
                          </select>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Modal actions footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <button className="btn-delete-modal" onClick={() => handleDeleteSingle(selectedPost.id)}>
                    <Trash2 size={14} /> Törlés
                  </button>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-save-modal" onClick={handleSavePostDetails} disabled={savingEdit}>
                      {savingEdit ? <Loader size={13} className="spinner" /> : 'Mentés & Újrarenderelés'}
                    </button>

                    {selectedPost.status === 'scheduled' && (
                      <button className="btn-approve-modal" onClick={() => handleApproveSingle(selectedPost.id)}>
                        Jóváhagyás
                      </button>
                    )}

                    {selectedPost.status === 'approved' && (
                      <button className="btn-publish-modal" onClick={() => handlePostNowSingle(selectedPost.id)}>
                        Élesítés most!
                      </button>
                    )}
                  </div>
                </div>

              </div>

            </div>
          </div>
        </div>
      )}

      {/* Screen 7: Custom Ad-Hoc Creation Modal */}
      {isCreateModalOpen && (
        <div className="preview-modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="preview-modal-card glass-panel" style={{ width: 600, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header-row" style={{ display: 'flex', justifyItems: 'center', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Sparkles size={18} style={{ color: '#8b5cf6' }} /> Egyedi Poszt Létrehozása &amp; Időzítése</h4>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Márka arculati réteg automatikus ráhelyezésével</span>
              </div>
              <button className="close-modal-btn" onClick={() => setIsCreateModalOpen(false)}><X size={18} /></button>
            </div>

            <div className="modal-body" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '80vh', overflowY: 'auto' }}>
              {/* Mode Selector */}
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>Létrehozás Módja:</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className={`tab-sel-btn ${createMode === 'ai' ? 'active' : ''}`} style={{ flex: 1, padding: 10 }} onClick={() => setCreateMode('ai')}>🤖 AI Teljes Generálás (Brief alapján)</button>
                  <button className={`tab-sel-btn ${createMode === 'custom' ? 'active' : ''}`} style={{ flex: 1, padding: 10 }} onClick={() => setCreateMode('custom')}>✍️ Egyedi Megadás (Szöveg + Kép Prompt)</button>
                </div>
              </div>

              {/* Mode: AI */}
              {createMode === 'ai' && (
                <div className="form-group">
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>AI Generálási Brief / Téma:</label>
                  <textarea
                    value={createBrief}
                    onChange={e => setCreateBrief(e.target.value)}
                    placeholder="Pl: Akciós mézeskalács latte promóciója a téli szezon kezdetére..."
                    rows={3}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12.5 }}
                  />
                </div>
              )}

              {/* Mode: Custom */}
              {createMode === 'custom' && (
                <>
                  <div className="form-group">
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Bejegyzés Szövege (Caption):</label>
                    <textarea
                      value={createCustomText}
                      onChange={e => setCreateCustomText(e.target.value)}
                      placeholder="Írd ide a kész bejegyzés szövegét..."
                      rows={3}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12.5 }}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Kép Generálási Prompt (Flux - angolul):</label>
                    <textarea
                      value={createCustomImagePrompt}
                      onChange={e => setCreateCustomImagePrompt(e.target.value)}
                      placeholder="Pl: Professional product photo, clean background, warm studio lighting, minimal layout..."
                      rows={2}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12.5 }}
                    />
                  </div>
                </>
              )}

              {/* Shared Parameters Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Elrendezési Sablon (Layout):</label>
                  <select value={createTemplateId} onChange={e => setCreateTemplateId(e.target.value as any)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12.5 }}>
                    <option value="universal">Univerzális (Universal)</option>
                    <option value="product">Termék Fókuszú (Product)</option>
                    <option value="quote">Idézet Sablon (Quote)</option>
                    <option value="testimonial">Vásárlói Vélemény (Testimonial)</option>
                    <option value="list">Tények / Lista (List)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>CTA Gomb Szövege / Ügyfél neve:</label>
                  <input
                    type="text"
                    value={createCta}
                    onChange={e => setCreateCta(e.target.value)}
                    placeholder="pl: Megkóstolom! / Kovács Anna"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12.5 }}
                  />
                </div>
              </div>

              {/* Style & Logo Variations */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Színvariáció:</label>
                  <select value={createColorVariation} onChange={e => setCreateColorVariation(e.target.value as any)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12.5 }}>
                    <option value="default">Alapértelmezett (Default)</option>
                    <option value="inverted">Invertált (Inverted)</option>
                    <option value="accent">Kiemelő szín (Accent)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Logó Változat:</label>
                  <select value={createLogoVariant} onChange={e => setCreateLogoVariant(e.target.value as any)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12.5 }}>
                    <option value="dark">Sötét Logó (Dark)</option>
                    <option value="light">Világos Logó (Light)</option>
                  </select>
                </div>
              </div>

              {/* Multi-image slot uploader */}
              <div style={{ padding: '16px 20px', borderRadius: 12, background: 'var(--bg3, rgba(255,255,255,0.03))', border: '1.5px solid var(--border)' }}>
                <ImageSlotUploader
                  slots={adhocImageSlots}
                  onChange={setAdhocImageSlots}
                  maxSlots={3}
                  disabled={isGeneratingAdhoc}
                  label="Képek csatolása (opcionális)"
                />
              </div>


              {/* Schedule Date */}
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Időzítés Dátuma és Időpontja:</label>
                <input
                  type="datetime-local"
                  value={createScheduledDate}
                  onChange={e => setCreateScheduledDate(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12.5 }}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
              <button className="btn-reset-calendar" style={{ border: 'none' }} onClick={() => setIsCreateModalOpen(false)}>Mégsem</button>
              <button className="btn-save-modal" onClick={handleGenerateAdhoc} disabled={isGeneratingAdhoc || (createMode === 'ai' ? !createBrief : (!createCustomText || !createCustomImagePrompt)) || adhocImageSlots.some(s => s.preprocessLoading || s.analysisLoading || s.upscaleLoading)}>
                {isGeneratingAdhoc ? (
                  <><Loader size={13} className="spinner" /> Generálás...</>
                ) : (
                  <><Sparkles size={13} /> Generálás &amp; Időzítés</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Stylesheet Embedded for encapsulation */}
      <style>{`
        .prod-calendar-view {
          color: var(--text);
          font-family: 'Inter', sans-serif;
          width: 100%;
        }

        /* Config / Parameters Panel */
        .prod-onboarding-panel {
          background: var(--card, #1c1936);
          border: 1px solid var(--border);
          box-shadow: 0 8px 32px rgba(139, 92, 246, 0.05);
        }
        
        .form-group label {
          color: var(--text-muted);
          font-weight: 600;
        }

        /* Workspace headers */
        .tab-sel-btn {
          border: none;
          background: transparent;
          color: var(--text-dim);
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tab-sel-btn.active {
          background: rgba(139,92,246,0.15);
          color: #8b5cf6;
        }
        
        .btn-exporter-csv, .btn-exporter-zip, .btn-select-all {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid var(--border);
          background: var(--bg3);
          color: var(--text-muted);
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 12px;
          fontWeight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-exporter-csv:hover, .btn-exporter-zip:hover, .btn-select-all:hover {
          border-color: #8b5cf6;
          color: var(--text);
        }

        .btn-reset-calendar {
          border: 1.5px solid rgba(239, 68, 68, 0.25);
          background: transparent;
          color: #ef4444;
          padding: 7px 14px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-reset-calendar:hover {
          background: rgba(239, 68, 68, 0.08);
          border-color: rgba(239, 68, 68, 0.4);
        }

        /* FullCalendar Customizations */
        .fc {
          --fc-border-color: var(--border, rgba(255,255,255,0.08));
          --fc-page-bg-color: transparent;
          --fc-today-bg-color: rgba(139,92,246,0.08);
          font-family: inherit;
        }
        .fc .fc-toolbar-title {
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
        }
        .fc .fc-button {
          background: var(--bg3);
          border: 1px solid var(--border);
          color: var(--text-muted);
          font-size: 12px;
          font-weight: 600;
          text-transform: capitalize;
          padding: 6px 12px;
          box-shadow: none;
        }
        .fc .fc-button:hover {
          background: var(--bg3);
          border-color: #8b5cf6;
          color: var(--text);
        }
        .fc .fc-button-active {
          background: #8b5cf6 !important;
          border-color: #8b5cf6 !important;
          color: #fff !important;
        }
        .fc-theme-standard td, .fc-theme-standard th {
          border-color: var(--border) !important;
        }
        .fc-daygrid-day-number {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-dim);
          padding: 6px !important;
        }
        .fc-day-today .fc-daygrid-day-number {
          color: #8b5cf6;
        }

        /* Timeline / List cards */
        .timeline-item-card {
          transition: transform 0.2s, border-color 0.2s;
        }
        .timeline-item-card:hover {
          transform: translateY(-1px);
        }
        .btn-edit-inline {
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text-muted);
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-edit-inline:hover {
          border-color: #8b5cf6;
          color: var(--text);
        }

        /* Batch Action Bar */
        .batch-actions-bar {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: #1c1936;
          border: 1.5px solid #8b5cf6;
          box-shadow: 0 10px 40px rgba(0,0,0,0.5), 0 0 16px rgba(139,92,246,0.2);
          border-radius: 14px;
          padding: 10px 20px;
          display: flex;
          align-items: center;
          gap: 20px;
          z-index: 1000;
        }
        .batch-count {
          font-size: 12.5px;
          color: var(--text-muted);
        }
        .batch-count strong {
          color: #8b5cf6;
        }
        .batch-buttons {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .batch-btn {
          border: none;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 11.5px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s;
        }
        .batch-btn.approve {
          background: #10b981;
          color: #fff;
        }
        .batch-btn.shift {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          border: 1px solid rgba(245,158,11,0.3);
        }
        .batch-btn.delete {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border: 1px solid rgba(239,68,68,0.3);
        }
        .batch-btn.close {
          background: transparent;
          color: var(--text-dim);
        }
        .batch-btn:hover {
          opacity: 0.9;
          transform: translateY(-0.5px);
        }

        /* Detailed Modal — no backdrop-filter to avoid flicker */
        .preview-modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.75);
          z-index: 1500;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.18s ease;
          will-change: opacity;
        }
        .preview-modal-card {
          width: 900px;
          max-width: 95vw;
          background: var(--card, #1c1936);
          border: 1px solid var(--border);
          border-radius: 18px;
          box-shadow: 0 24px 90px rgba(0,0,0,0.55);
          overflow: hidden;
          animation: modalSlideUp 0.22s cubic-bezier(.2,.9,.3,1);
          will-change: transform;
          contain: layout;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        .close-modal-btn {
          background: transparent;
          border: none;
          color: var(--text-dim);
          cursor: pointer;
          padding: 4px;
        }
        .close-modal-btn:hover {
          color: #ef4444;
        }

        /* Phone mockup inside modal */
        .phone-container {
          width: 320px;
          height: 580px;
          background: #000;
          border: 10px solid #1a1a2e;
          border-radius: 36px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.4), inset 0 0 12px rgba(255,255,255,0.06);
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .phone-speaker {
          width: 60px;
          height: 4px;
          background: #1a1a2e;
          border-radius: 2px;
          position: absolute;
          top: 6px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10;
        }
        .phone-screen {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding-top: 14px;
          overflow: hidden;
        }
        .insta-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .insta-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 800;
          color: #fff;
        }
        .insta-meta {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .insta-name {
          font-size: 11px;
          font-weight: 700;
          color: #fff;
        }
        .insta-location {
          font-size: 9px;
          color: var(--text-dim);
        }
        .insta-more {
          color: var(--text-dim);
          font-size: 10px;
        }

        /* Modal Side Controls */
        .template-badge {
          background: var(--bg3);
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .template-badge:hover {
          border-color: #8b5cf6;
          color: var(--text);
        }
        .template-badge.active {
          background: #8b5cf6;
          border-color: #8b5cf6;
          color: #fff;
          box-shadow: 0 2px 6px rgba(139,92,246,0.3);
        }

        .btn-delete-modal {
          background: transparent;
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #ef4444;
          padding: 9px 16px;
          border-radius: 9px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s;
        }
        .btn-delete-modal:hover {
          background: rgba(239, 68, 68, 0.08);
          border-color: rgba(239, 68, 68, 0.4);
        }

        .btn-save-modal {
          background: linear-gradient(135deg, #8b5cf6, #6d28d9);
          border: none;
          color: #fff;
          padding: 9px 20px;
          border-radius: 9px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(139,92,246,0.25);
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s;
        }
        .btn-save-modal:hover {
          transform: translateY(-0.5px);
          box-shadow: 0 4px 12px rgba(139,92,246,0.35);
        }
        
        .btn-approve-modal {
          background: #10b981;
          border: none;
          color: #fff;
          padding: 9px 20px;
          border-radius: 9px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(16,185,129,0.25);
          transition: all 0.15s;
        }
        .btn-approve-modal:hover {
          box-shadow: 0 4px 12px rgba(16,185,129,0.35);
        }

        .btn-publish-modal {
          background: #3b82f6;
          border: none;
          color: #fff;
          padding: 9px 20px;
          border-radius: 9px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(59,130,246,0.25);
          transition: all 0.15s;
        }
        .btn-publish-modal:hover {
          box-shadow: 0 4px 12px rgba(59,130,246,0.35);
        }

        /* Status badge labels */
        .status-badge-lbl.badge-scheduled { background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.2); }
        .status-badge-lbl.badge-published { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.2); }
        .status-badge-lbl.badge-approved { background: rgba(139, 92, 246, 0.15); color: #8b5cf6; border: 1px solid rgba(139,92,246,0.2); }
        
        .text-scheduled { color: #f59e0b; }
        .text-published { color: #10b981; }
        .text-approved { color: #8b5cf6; }

        .spinner {
          animation: spin 1s linear infinite;
        }

        /* Keyframes */
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(18px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

    </div>
  );
};
