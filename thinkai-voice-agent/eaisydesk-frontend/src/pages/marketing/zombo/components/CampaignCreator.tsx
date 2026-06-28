import React, { useState, useEffect, useRef } from 'react';
import type { BrandKit, SystemLog, Campaign, CampaignItem, PostCreative, ABTestVariant, CampaignPhase } from '../types';
import { fixImageUrl } from '../types';
import { buildLayerTemplates } from '../layerTemplates';
import ImageSlotUploader, { type ImageSlot, buildCompositePayload } from './ImageSlotUploader';
import {
  Sparkles,
  UploadCloud,
  Target,
  Layers,
  DollarSign,
  CheckCircle,
  Edit3,
  Check,
  Send,
  Calendar,
  Loader,
  Eye,
  FileImage,
  Award
} from 'lucide-react';

interface CampaignCreatorProps {
  activeBrandKit: BrandKit;
  onGenerateStart: (briefText: string) => void;
  onCampaignComplete: (newCampaign: Campaign, newLogs: SystemLog[]) => void;
  shouldSimulateError: boolean;
  creatives: PostCreative[];
  setCreatives: React.Dispatch<React.SetStateAction<PostCreative[]>>;
}

export const CampaignCreator: React.FC<CampaignCreatorProps> = ({
  activeBrandKit,
  onGenerateStart,
  onCampaignComplete,
  shouldSimulateError: _shouldSimulateError,
  creatives,
  setCreatives
}) => {
  const [briefText, setBriefText] = useState('Prémium világos pörkölésű etióp kávénk bevezetése a tavaszi szezonban.');
  const [stylePreset, setStylePreset] = useState('Tavaszi terasz');
  const [dragActive, setDragActive] = useState(false);
  // Multi-slot image upload (replaces single productImageUrl)
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([]);
  // Derived backward-compat: first product slot's upscaledUrl, preprocessedUrl or originalUrl
  const productImageUrl = imageSlots[0]?.upscaledUrl || imageSlots[0]?.preprocessedUrl || imageSlots[0]?.originalUrl || null;
  const isPreprocessing = imageSlots.some(s => s.preprocessLoading || s.analysisLoading || s.upscaleLoading);
  const [preprocessWarning, setPreprocessWarning] = useState<string | null>(null);

  // Flow 3 new fields
  const [goalType, setGoalType] = useState<Campaign['goalType']>('product-launch');
  const [targetAge, setTargetAge] = useState('25–45');
  const [targetLocation, setTargetLocation] = useState('Magyarország');
  const [targetInterests, setTargetInterests] = useState('');
  const [campaignHistory, setCampaignHistory] = useState<Campaign[]>(() => {
    try { return JSON.parse(localStorage.getItem('campaign_history') || '[]'); }
    catch { return []; }
  });
  const [activeResultTab, setActiveResultTab] = useState<'funnel' | 'ab-test' | 'stats'>('funnel');
  const [abVariants, setAbVariants] = useState<ABTestVariant[]>([]);
  const [abWinnerId, setAbWinnerId] = useState<string | null>(null);
  const [editingStrategy, setEditingStrategy] = useState(false);
  const [editStrategyAudience, setEditStrategyAudience] = useState('');
  const [editStrategyBudget, setEditStrategyBudget] = useState('');
  
  // Campaign Generation State (SSE-driven)
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [simulatedLogs, setSimulatedLogs] = useState<string[]>([]);
  const [completedPreviews, setCompletedPreviews] = useState<{index: number, imageUrl: string, headline: string}[]>([]);
  
  // Active Generated Campaign display
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingCta, setEditingCta] = useState('');
  const [isUpdatingItem, setIsUpdatingItem] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');

  // Layer Template & Editing States for the active editing item
  const [editingBgBlur, setEditingBgBlur] = useState(0);
  const [editingOverlayOpacity, setEditingOverlayOpacity] = useState(0.4);
  const [editingLogoSize, setEditingLogoSize] = useState(1.0);
  const [editingLogoPosition, setEditingLogoPosition] = useState<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('top-left');
  const [editingLogoVariant, setEditingLogoVariant] = useState<'light' | 'dark'>('light');

  const [editingFontSize, setEditingFontSize] = useState(38);
  const [editingTextAlignment, setEditingTextAlignment] = useState<'left' | 'center' | 'right'>('left');
  const [editingFontWeight, setEditingFontWeight] = useState('normal');
  const [editingTextColor, setEditingTextColor] = useState<'default' | 'primary' | 'secondary' | 'accent' | 'white' | 'black'>('default');

  const [editingTextYOffset, setEditingTextYOffset] = useState(0);
  const [editingTextXOffset, setEditingTextXOffset] = useState(0);

  const [editingPanelBgColor, setEditingPanelBgColor] = useState<'default' | 'primary' | 'secondary' | 'accent' | 'translucent-dark' | 'translucent-light' | 'none'>('default');
  const [editingPanelPadding, setEditingPanelPadding] = useState(40);
  const [editingPanelRadius, setEditingPanelRadius] = useState(16);
  const [editingPanelPosition, setEditingPanelPosition] = useState<'relative' | 'top' | 'center' | 'bottom'>('relative');

  const [editingCtaFontSize, setEditingCtaFontSize] = useState(20);
  const [editingCtaBgColor, setEditingCtaBgColor] = useState<'default' | 'primary' | 'secondary' | 'accent' | 'white' | 'black'>('default');
  const [editingCtaYOffset, setEditingCtaYOffset] = useState(0);
  const [editingCtaRadius, setEditingCtaRadius] = useState(8);

  const [selectedLayerTemplateId, setSelectedLayerTemplateId] = useState<string | null>(null);
  const [hoveredLayerTemplateId, setHoveredLayerTemplateId] = useState<string | null>(null);
  const [isApplyingLayerTemplate, setIsApplyingLayerTemplate] = useState(false);

  const logsRef = useRef<string[]>([]);
  useEffect(() => {
    logsRef.current = simulatedLogs;
  }, [simulatedLogs]);

  const stylePresets = [
    { name: 'Tavaszi terasz', desc: 'Világos napfényes terasz, virágzó cseresznyefa szirmokkal, lágy árnyékokkal.' },
    { name: 'Modern iroda', desc: 'Minimalista irodai íróasztal, letisztult fa és beton felületekkel, geometrikus fény-árnyék játékkal.' },
    { name: 'Rusztikus konyha', desc: 'Kellemes vidéki konyhaasztal, konyharuha, fa vágódeszka, antik evőeszközök, meleg reggeli fény.' },
    { name: 'Fényűző márvány', desc: 'Prémium fehér márvány pult, arany kiegészítők, ellenfény, luxus kávéházi hangulat.' },
  ];

  // Pipeline execution steps
  const steps = [
    { title: 'Claude stratégia', desc: 'Marketing koncepció, headline/caption tervezés.', icon: Target },
    { title: 'Kampány kész', desc: 'Claude stratégia kész, kreatívok generálása indul...', icon: Sparkles },
    { title: 'Bria Product Shot', desc: 'Jelenet generálás a termék köré.', icon: FileImage },
    { title: 'Logó renderelés', desc: 'Playwright: logó watermark ráhelyezése.', icon: CheckCircle },
  ];



  const goalTypeLabels: Record<string, string> = {
    'product-launch': '🚀 Termékbevezető',
    'promo': '🎉 Akciós',
    'brand-awareness': '🎯 Márkaismertő',
    'engagement': '💬 Aktíváló',
    'seasonal': '☀️ Szezonális',
    'retargeting': '🔄 Retargeting',
  };

  const DEFAULT_PHASES: CampaignPhase[] = [
    { name: 'teaser',  label: 'Előzetes',   days: 5,  postCount: 1, focus: 'Kíváncsiság ébresztés' },
    { name: 'launch',  label: 'Bevetés',    days: 7,  postCount: 2, focus: 'Fő üzenet és konverzió' },
    { name: 'sustain', label: 'Fenntartás', days: 14, postCount: 2, focus: 'Elkötelezettség növelés' },
    { name: 'closing', label: 'Lezárás',    days: 4,  postCount: 1, focus: 'Utolsó hívás és CTA' },
  ];

  const saveCampaignToHistory = (c: Campaign) => {
    const updated = [c, ...campaignHistory].slice(0, 10);
    setCampaignHistory(updated);
    localStorage.setItem('campaign_history', JSON.stringify(updated));
  };

  const generateABVariants = (campaign: Campaign): ABTestVariant[] => [
    {
      id: 'var-a',
      label: 'A Variáció',
      differentiator: 'headline',
      imageUrl: campaign.items[0]?.imageUrl,
      headline: campaign.items[0]?.headline,
      cta: campaign.items[0]?.cta,
      score: Math.floor(Math.random() * 20) + 65,
    },
    {
      id: 'var-b',
      label: 'B Variáció',
      differentiator: 'cta',
      imageUrl: campaign.items[1]?.imageUrl || campaign.items[0]?.imageUrl,
      headline: campaign.items[1]?.headline,
      cta: campaign.items[1]?.cta,
      score: Math.floor(Math.random() * 20) + 60,
    },
  ];

  const handleCopyCaptions = () => {
    if (!activeCampaign) return;
    const text = activeCampaign.items.map((item, i) =>
      `=== ${i+1}. ${item.channel.toUpperCase()} ===\n${item.headline}\n\n${item.caption || item.text}${item.cta ? '\n\nCTA: ' + item.cta : ''}`
    ).join('\n\n---\n\n');
    navigator.clipboard.writeText(text)
      .then(() => alert('✅ ' + activeCampaign.items.length + ' caption másolva a vágólapra!'))
      .catch(() => alert('Másolás nem sikerült'));
  };

  const handleCloneCampaign = () => {
    if (!activeCampaign) return;
    const cloned: Campaign = {
      ...activeCampaign,
      id: `clone-${Date.now()}`,
      title: activeCampaign.title + ' (másolat)',
      createdAt: new Date().toISOString(),
      items: activeCampaign.items.map(item => ({ ...item, id: `${item.id}-clone`, status: 'draft' as const, scheduledAt: undefined, publishedAt: undefined })),
    };
    setActiveCampaign(cloned);
    setAbVariants(generateABVariants(cloned));
    setAbWinnerId(null);
    saveCampaignToHistory(cloned);
  };

  const handleSaveStrategyEdit = () => {
    if (!activeCampaign) return;
    const updated: Campaign = { ...activeCampaign, targetAudience: editStrategyAudience, adBudgetSplit: editStrategyBudget };
    setActiveCampaign(updated);
    saveCampaignToHistory(updated);
    setEditingStrategy(false);
  };

  // Export handlers
  const handleCampaignExportCSV = () => {
    if (!activeCampaign) return;
    const header = ['Dátum','Csatorna','Státusz','Headline','Caption','CTA','Kép URL'];
    const rows = activeCampaign.items.map(i => [
      i.scheduledAt ? new Date(i.scheduledAt).toLocaleDateString('hu-HU') : '',
      i.channel, i.status,
      `"${(i.headline||'').replace(/"/g,'""')}"`,
      `"${(i.caption||i.text||'').replace(/"/g,'""')}"`,
      i.cta || '', i.imageUrl || ''
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'})),
      download: `kampany_${activeCampaign.id}.csv`
    });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const handleCampaignExportPDF = () => {
    if (!activeCampaign) return;
    const html = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8">
      <title>Kampány Brief — ${activeCampaign.title}</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; padding: 32px; color: #1a1a2e; }
        h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
        h2 { font-size: 15px; margin-top: 24px; border-bottom: 2px solid #8b5cf6; padding-bottom: 4px; }
        .meta { font-size: 11px; color: #666; margin-bottom: 20px; }
        .item { page-break-inside: avoid; margin-bottom: 12px; padding: 12px 16px; border: 1px solid #e5e7eb; border-radius: 8px; }
        .channel { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 800; background: #8b5cf6; color: #fff; text-transform: uppercase; }
        @media print { body { padding: 16px; } }
      </style>
    </head><body>
      <h1>📊 Kampány Brief — ${activeCampaign.title}</h1>
      <p class="meta">Generálva: ${new Date(activeCampaign.createdAt).toLocaleString('hu-HU')}
        &nbsp;&middot;&nbsp; Cél: ${activeCampaign.targetAudience}
        &nbsp;&middot;&nbsp; Büdzsé: ${activeCampaign.adBudgetSplit}</p>
      <h2>Stratégia</h2>
      <p>${activeCampaign.description}</p>
      <h2>Kreatívok (${activeCampaign.items.length} db)</h2>
      ${activeCampaign.items.map((item, i) => `
        <div class="item">
          <strong>${i+1}. <span class="channel">${item.channel}</span> &mdash; ${item.type}</strong><br>
          <em>${item.headline}</em><br>
          <p style="margin: 6px 0; font-size: 13px; color: #374151;">${item.caption || item.text}</p>
          ${item.cta ? `<div>CTA: <strong>${item.cta}</strong></div>` : ''}
        </div>`).join('')}
    </body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 400); }
  };

  const handleCampaignExportZIP = async () => {
    if (!activeCampaign) return;
    if (!(window as any).JSZip) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        s.onload = () => res(); s.onerror = rej;
        document.body.appendChild(s);
      });
    }
    const zip = new (window as any).JSZip();
    activeCampaign.items.forEach((item, i) => {
      const txt = [item.headline, '', item.caption || item.text, '', `CTA: ${item.cta || '—'}`, `Platform: ${item.channel}`, `Kép URL: ${item.imageUrl || ''}`].join('\n');
      zip.file(`${i+1}_${item.channel}_${item.type}/caption.txt`, txt);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `kampany_kreativok_${activeCampaign.id}.zip` });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const handleGenerateCampaign = async () => {
    if (!briefText.trim()) return;

    setIsGenerating(true);
    setCurrentStep(0);
    setCompletedPreviews([]);

    const selectedPresetDesc = stylePresets.find(p => p.name === stylePreset)?.desc || '';
    const fullBrief = `${briefText} [Stílus preset: ${stylePreset} - ${selectedPresetDesc}]`;

    const initLogs = [
      `[INFO] Kampány indítva: "${briefText}"`,
      `[INFO] Választott stílus: ${stylePreset}`,
      productImageUrl 
        ? `[INFO] Termékkép csatolva: ${productImageUrl.substring(0, 45)}...` 
        : `[WARNING] Nincs csatolt termékkép. Generikus márka képek.`
    ];
    setSimulatedLogs(initLogs);

    onGenerateStart(briefText);

    try {
      const response = await fetch('http://localhost:3001/api/campaign/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: fullBrief,
          brandKit: activeBrandKit,
          productImageUrl: productImageUrl,
          goalType,
          targetAge,
          targetLocation,
          targetInterests
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(await response.text());
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep incomplete chunk

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(trimmed.replace('data: ', ''));
            const ts = new Date().toLocaleTimeString('hu-HU');

            switch (data.type) {
              case 'step':
                setCurrentStep(data.step);
                setSimulatedLogs(prev => [...prev, `[${ts}] [AI] ${data.message}`]);
                break;

              case 'item-start':
                setCurrentStep(2 + (data.index || 0)); // step 2+ = per-item
                setSimulatedLogs(prev => [...prev, `[${ts}] [FLUX] ${data.message}`]);
                break;

              case 'item-progress':
                setSimulatedLogs(prev => [...prev, `[${ts}] [PIPELINE] ${data.message}`]);
                break;

              case 'item-complete':
                setCompletedPreviews(prev => [...prev, { 
                  index: data.index, 
                  imageUrl: fixImageUrl(data.imageUrl), 
                  headline: data.headline || '' 
                }]);
                setSimulatedLogs(prev => [...prev, `[${ts}] [SUCCESS] ${data.message}`]);
                break;

              case 'complete': {
                const campaign = { ...data.campaign, goalType, targetAge, targetLocation, targetInterests };
                setIsGenerating(false);
                setCurrentStep(-1);
                setCreatives(prev => [...(campaign.items as any), ...prev]);
                setActiveCampaign(campaign);
                setActiveResultTab('funnel');
                const variants = generateABVariants(campaign);
                setAbVariants(variants);
                saveCampaignToHistory(campaign);

                const newLogs: SystemLog[] = logsRef.current.map((msg, idx) => ({
                  id: `campaign-log-${idx}-${Date.now()}`,
                  timestamp: new Date().toISOString(),
                  level: msg.includes('[ERROR]') ? 'error' as const : msg.includes('[SUCCESS]') ? 'success' as const : 'info' as const,
                  message: msg,
                  step: idx < 2 ? 'queue' as const : idx < 5 ? 'orchestrator' as const : 'renderer' as const
                }));
                onCampaignComplete(campaign, newLogs);
                break;
              }

              case 'error':
                setSimulatedLogs(prev => [...prev, `[${ts}] [ERROR] ${data.message}`]);
                setTimeout(() => {
                  setIsGenerating(false);
                  setCurrentStep(-1);
                }, 3000);
                break;
            }
          } catch (parseErr) {
            // Skip unparseable events
          }
        }
      }
    } catch (err: any) {
      console.error('[CAMPAIGN SSE ERROR]', err);
      setSimulatedLogs(prev => [...prev, `[ERROR] Kapcsolati hiba: ${err.message || err}`]);
      setTimeout(() => {
        setIsGenerating(false);
        setCurrentStep(-1);
      }, 3000);
    }
  };

  // Campaign card level updates
  const handleItemEditStart = (item: CampaignItem) => {
    setEditingItemId(item.id);
    setEditingText(item.text);
    setEditingCta(item.cta || '');

    setEditingBgBlur((item as any).bgBlur || 0);
    setEditingOverlayOpacity((item as any).overlayOpacity ?? 0.4);
    setEditingLogoSize((item as any).logoSize ?? 1.0);
    setEditingLogoPosition((item as any).logoPosition || 'top-left');
    setEditingLogoVariant((item as any).logoVariant || 'light');

    setEditingFontSize((item as any).fontSize || 38);
    setEditingTextAlignment((item as any).textAlignment || 'left');
    setEditingFontWeight((item as any).fontWeight || 'normal');
    setEditingTextColor((item as any).textColor || 'default');

    setEditingTextYOffset((item as any).textYOffset || 0);
    setEditingTextXOffset((item as any).textXOffset || 0);

    setEditingPanelBgColor((item as any).panelBgColor || 'default');
    setEditingPanelPadding((item as any).panelPadding || 40);
    setEditingPanelRadius((item as any).panelRadius || 16);
    setEditingPanelPosition((item as any).panelPosition || 'relative');

    setEditingCtaFontSize((item as any).ctaFontSize || 20);
    setEditingCtaBgColor((item as any).ctaBgColor || 'default');
    setEditingCtaYOffset((item as any).ctaYOffset || 0);
    setEditingCtaRadius((item as any).ctaRadius || 8);

    setSelectedLayerTemplateId(item.templateId || null);
    setHoveredLayerTemplateId(null);
  };

  const handleItemEditSave = async (id: string) => {
    setIsUpdatingItem(true);
    try {
      const creative = creatives.find(c => c.id === id);
      if (!creative) return;

      const response = await fetch('http://localhost:3001/api/render-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post: {
            ...creative,
            text: editingText,
            cta: editingCta,
            templateId: selectedLayerTemplateId || creative.templateId,
            bgBlur: editingBgBlur,
            overlayOpacity: editingOverlayOpacity,
            logoSize: editingLogoSize,
            logoPosition: editingLogoPosition,
            logoVariant: editingLogoVariant,
            fontSize: editingFontSize,
            textAlignment: editingTextAlignment,
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
            ctaRadius: editingCtaRadius
          },
          brandKit: activeBrandKit,
          text: editingText
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const updatedPost = await response.json();
      
      // Update creatives state
      setCreatives(prev => prev.map(c => c.id === id ? updatedPost : c));
      
      // Update local campaign items display state
      if (activeCampaign) {
        setActiveCampaign({
          ...activeCampaign,
          items: activeCampaign.items.map(item => item.id === id ? {
            ...item,
            text: editingText,
            cta: editingCta,
            imageUrl: fixImageUrl(updatedPost.imageUrl),
            templateId: (selectedLayerTemplateId || item.templateId) as any,
            bgBlur: editingBgBlur,
            overlayOpacity: editingOverlayOpacity,
            logoSize: editingLogoSize,
            logoPosition: editingLogoPosition,
            logoVariant: editingLogoVariant,
            fontSize: editingFontSize,
            textAlignment: editingTextAlignment,
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
            ctaRadius: editingCtaRadius,
            originalImageUrl: updatedPost.originalImageUrl
          } as any : item)
        });
      }
      
      setEditingItemId(null);
    } catch (err) {
      console.error(err);
      alert('Sikertelen mentés.');
    } finally {
      setIsUpdatingItem(false);
    }
  };

  const handleApproveItem = (id: string) => {
    setCreatives(prev => prev.map(c => c.id === id ? { ...c, status: 'approved' } : c));
    if (activeCampaign) {
      setActiveCampaign({
        ...activeCampaign,
        items: activeCampaign.items.map(item => item.id === id ? { ...item, status: 'approved' } : item)
      });
    }
  };

  const handlePostNowItem = (id: string) => {
    setCreatives(prev => prev.map(c => c.id === id ? { ...c, status: 'published', publishedAt: new Date().toISOString() } : c));
    if (activeCampaign) {
      setActiveCampaign({
        ...activeCampaign,
        items: activeCampaign.items.map(item => item.id === id ? { ...item, status: 'published', publishedAt: new Date().toISOString() } : item)
      });
    }
    alert('Kreatív sikeresen publikálva az Instagram / Meta Ads platformra!');
  };

  const handleScheduleItem = (id: string) => {
    if (scheduleDate) {
      setCreatives(prev => prev.map(c => c.id === id ? { ...c, status: 'scheduled', scheduledAt: scheduleDate } : c));
      if (activeCampaign) {
        setActiveCampaign({
          ...activeCampaign,
          items: activeCampaign.items.map(item => item.id === id ? { ...item, status: 'scheduled', scheduledAt: scheduleDate } : item)
        });
      }
      setShowDatePicker(null);
      setScheduleDate('');
    }
  };

  const handleApproveAll = () => {
    if (!activeCampaign) return;
    activeCampaign.items.forEach(item => {
      handleApproveItem(item.id);
    });
    alert('A kampány összes eleme jóváhagyva!');
  };

  const getLayoutCategory = (templateId: string | null): 'product' | 'quote' | 'testimonial' | 'list' | 'universal' => {
    if (!templateId) return 'universal';
    if (templateId === 'universal' || templateId === 'clean') return 'universal';
    if (templateId.startsWith('product') || templateId === 'product-callout' || templateId === 'product-showcase' || templateId === 'tag-feature') return 'product';
    if (templateId.startsWith('quote') || templateId === 'quote-card' || templateId === 'quote-minimal' || templateId === 'quote-bold') return 'quote';
    if (templateId.startsWith('testimonial') || templateId === 'testimonial-rating' || templateId === 'testimonial-bubble' || templateId === 'review-stars') return 'testimonial';
    if (templateId.startsWith('list') || templateId === 'numbered-list' || templateId === 'bullet-list' || templateId === 'steps-list') return 'list';
    
    const idLower = templateId.toLowerCase();
    if (idLower.includes('quote')) return 'quote';
    if (idLower.includes('product') || idLower.includes('feature') || idLower.includes('badge') || idLower.includes('promo')) return 'product';
    if (idLower.includes('testi') || idLower.includes('review') || idLower.includes('rating')) return 'testimonial';
    if (idLower.includes('list') || idLower.includes('step')) return 'list';
    
    return 'universal';
  };

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
      const activeTmplId = hoveredLayerTemplateId === 'clean' ? 'universal' : (hoveredLayerTemplateId || selectedLayerTemplateId);
      const category = getLayoutCategory(activeTmplId);
      if (category === 'quote') bgColor = activeBrandKit.colors.primary;
      else if (category === 'testimonial') bgColor = activeBrandKit.colors.secondary;
      else bgColor = activeBrandKit.colors.primary;
    }

    const activeTmplId = hoveredLayerTemplateId === 'clean' ? 'universal' : (hoveredLayerTemplateId || selectedLayerTemplateId);
    const category = getLayoutCategory(activeTmplId);
    const textColorVal = category === 'testimonial' ? activeBrandKit.colors.primary : activeBrandKit.colors.secondary;
    
    const scale = 240 / 1080;
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
    const scale = 240 / 1080;
    const fontSizeVal = editingFontSize * scale;
    const activeTmplId = hoveredLayerTemplateId === 'clean' ? 'universal' : (hoveredLayerTemplateId || selectedLayerTemplateId);
    const category = getLayoutCategory(activeTmplId);
    let textColorVal = category === 'testimonial' ? activeBrandKit.colors.primary : activeBrandKit.colors.secondary;
    
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
    const scale = 240 / 1080;
    const radiusVal = editingCtaRadius * scale;
    const fontSizeVal = editingCtaFontSize * scale;
    const spacingVal = (24 + editingCtaYOffset) * scale;

    const creative = creatives.find(c => c.id === editingItemId);
    const colorVar = creative?.colorVariation || 'default';

    let bgCol = getColorValue(editingCtaBgColor, activeBrandKit.colors.accent);
    if (editingCtaBgColor === 'default') {
      if (colorVar === 'inverted') bgCol = activeBrandKit.colors.secondary;
      else if (colorVar === 'accent') bgCol = activeBrandKit.colors.primary;
      else bgCol = activeBrandKit.colors.accent;
    }

    let textCol = '#FFFFFF';
    if (editingCtaBgColor === 'white' || editingCtaBgColor === 'secondary' || (editingCtaBgColor === 'default' && colorVar === 'inverted')) {
      textCol = activeBrandKit.colors.primary;
    }

    return {
      backgroundColor: bgCol,
      color: textCol,
      padding: `${10 * scale}px ${20 * scale}px`,
      borderRadius: `${radiusVal}px`,
      border: 'none',
      fontWeight: 700,
      fontSize: `${fontSizeVal}px`,
      cursor: 'pointer',
      width: '100%',
      marginTop: `${spacingVal}px`,
      boxSizing: 'border-box' as const,
      textAlign: 'center' as const,
      fontFamily: activeBrandKit.typography.fontName,
      transition: 'all 0.15s ease',
    };
  };

  const handleApplyLayerTemplate = (template: any) => {
    setSelectedLayerTemplateId(template.id);
    
    if (template.layoutDefaults) {
      if (template.layoutDefaults.bgBlur !== undefined) setEditingBgBlur(template.layoutDefaults.bgBlur);
      if (template.layoutDefaults.overlayOpacity !== undefined) setEditingOverlayOpacity(template.layoutDefaults.overlayOpacity);
      if (template.layoutDefaults.panelBgColor !== undefined) setEditingPanelBgColor(template.layoutDefaults.panelBgColor as any);
      if (template.layoutDefaults.panelPosition !== undefined) setEditingPanelPosition(template.layoutDefaults.panelPosition as any);
      if (template.layoutDefaults.panelPadding !== undefined) setEditingPanelPadding(template.layoutDefaults.panelPadding);
      if (template.layoutDefaults.panelRadius !== undefined) setEditingPanelRadius(template.layoutDefaults.panelRadius);
      if (template.layoutDefaults.fontSize !== undefined) setEditingFontSize(template.layoutDefaults.fontSize);
      if (template.layoutDefaults.textAlignment !== undefined) setEditingTextAlignment(template.layoutDefaults.textAlignment as any);
      if (template.layoutDefaults.fontWeight !== undefined) setEditingFontWeight(template.layoutDefaults.fontWeight);
      if (template.layoutDefaults.textColor !== undefined) setEditingTextColor(template.layoutDefaults.textColor as any);
      if (template.layoutDefaults.textYOffset !== undefined) setEditingTextYOffset(template.layoutDefaults.textYOffset);
      if (template.layoutDefaults.textXOffset !== undefined) setEditingTextXOffset(template.layoutDefaults.textXOffset);
      if (template.layoutDefaults.ctaBgColor !== undefined) setEditingCtaBgColor(template.layoutDefaults.ctaBgColor as any);
      if (template.layoutDefaults.ctaFontSize !== undefined) setEditingCtaFontSize(template.layoutDefaults.ctaFontSize);
      if (template.layoutDefaults.ctaYOffset !== undefined) setEditingCtaYOffset(template.layoutDefaults.ctaYOffset);
      if (template.layoutDefaults.ctaRadius !== undefined) setEditingCtaRadius(template.layoutDefaults.ctaRadius);
    }
  };

  const getFunnelLabel = (templateId: string, idx: number) => {
    if (idx === 4) return { phase: 'Konverzió (Conversion)', desc: 'Paid Meta Ad' };
    if (idx === 5) return { phase: 'Előnyök (Benefit Ad)', desc: 'Paid Meta Ad' };
    switch (templateId) {
      case 'quote': return { phase: 'Figyelemfelkeltés (Attention)', desc: 'Organic Post' };
      case 'product': return { phase: 'Érdeklődés (Interest)', desc: 'Organic Post' };
      case 'testimonial': return { phase: 'Vágyfokozás (Desire)', desc: 'Organic Post' };
      case 'list': return { phase: 'Aktivizálás (Action)', desc: 'Organic Post' };
      default: return { phase: 'Organic', desc: 'Social Post' };
    }
  };

  return (
    <div className="campaign-creator-view animate-slide-up">
      {!activeCampaign && (
        <div>
          {/* Campaign History (Screen 1) */}
          {campaignHistory.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Korábbi kampányok</h3>
                <button
                  onClick={() => { setCampaignHistory([]); localStorage.removeItem('campaign_history'); }}
                  style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                >Törlés</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {campaignHistory.map(c => (
                  <div
                    key={c.id}
                    onClick={() => { setActiveCampaign(c); setAbVariants(generateABVariants(c)); setActiveResultTab('funnel'); }}
                    style={{
                      padding: '12px 16px', borderRadius: 12,
                      border: '1.5px solid var(--border)', background: 'var(--bg2)',
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#8b5cf6'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#8b5cf6' }}>
                        {c.goalType ? goalTypeLabels[c.goalType] : '📊'}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {new Date(c.createdAt).toLocaleDateString('hu-HU')}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      {c.description.substring(0, 70)}...
                    </div>
                    <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                      <span>🎨 {c.items.length} kreatív</span>
                      {c.targetAge && <span>👤 {c.targetAge}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="creator-landing glass-panel">
            <div className="landing-header">
              <div className="spark-wrapper">
                <Sparkles size={24} className="spark-glow" />
              </div>
              <h2>AI Kampány Stúdió & Integrált Termék-beültető</h2>
              <p>Hozz létre teljes 30 napos AIDA marketing tölcsért és Meta hirdetéseket a terméked fotója alapján.</p>
            </div>
            <div className="landing-grid">
            {/* Left Column: Upload and Presets */}
            <div className="landing-left-col">
              <div className="form-group">
                <label>Kampány témája / Célja (Brief):</label>
                <textarea
                  value={briefText}
                  onChange={(e) => setBriefText(e.target.value)}
                  placeholder="Pl: Új tavaszi specialty kávék és pékáruk promóciója..."
                  rows={4}
                />
              </div>

              {/* Goal Type selector */}
              <div className="form-group">
                <label>Kampány célja:</label>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 6 }}>
                  {(Object.entries(goalTypeLabels) as [string, string][]).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setGoalType(v as Campaign['goalType'])}
                      style={{
                        padding: '5px 11px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                        border: `1.5px solid ${goalType === v ? '#8b5cf6' : 'var(--border)'}`,
                        background: goalType === v ? 'rgba(139,92,246,0.15)' : 'var(--bg3)',
                        color: goalType === v ? '#c4b5fd' : 'var(--text-muted)',
                        transition: 'all 0.12s'
                      }}
                    >{l}</button>
                  ))}
                </div>
              </div>

              {/* Target Audience inputs */}
              <div className="form-group">
                <label>Célcsoport:</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 6 }}>
                  <input
                    value={targetAge}
                    onChange={e => setTargetAge(e.target.value)}
                    placeholder="Korcsoport (pl. 25-45)"
                    style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12 }}
                  />
                  <input
                    value={targetLocation}
                    onChange={e => setTargetLocation(e.target.value)}
                    placeholder="Helyszín"
                    style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12 }}
                  />
                  <input
                    value={targetInterests}
                    onChange={e => setTargetInterests(e.target.value)}
                    placeholder="Érdeklődés (pl. kávé)"
                    style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12 }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Hátterek stílusa (AI Preset):</label>
                <div className="style-presets-grid">
                  {stylePresets.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      className={`preset-style-card ${stylePreset === preset.name ? 'active' : ''}`}
                      onClick={() => setStylePreset(preset.name)}
                    >
                      <span className="preset-name">{preset.name}</span>
                      <span className="preset-desc">{preset.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Drag & Drop Product File */}
            <div className="landing-right-col">
              <div className="form-group">
                <label>Képek csatolása (Claude Vision elemzéssel, termékhűség-védelemmel):</label>
                <ImageSlotUploader
                  slots={imageSlots}
                  onChange={setImageSlots}
                  maxSlots={3}
                  disabled={isGenerating}
                  label="Termékfotó és kontextus képek"
                />
                {preprocessWarning && (
                  <div className="preprocess-warning-badge" style={{ marginTop: 6 }}>
                    ⚠️ {preprocessWarning}
                  </div>
                )}
              </div>

              <button
                className="btn-primary start-campaign-btn"
                onClick={handleGenerateCampaign}
                disabled={isGenerating || !briefText.trim() || isPreprocessing}
              >
                {isGenerating ? (
                  <>
                    <Loader size={18} className="spinner" />
                    Kampány csatornák generálása...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Integrált AI Kampány Létrehozása (6 kreatív)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {activeCampaign && (
        /* Campaign Result View */
        <div className="campaign-result-workspace">
          {/* Header Row */}
          <div className="workspace-header glass-panel">
            <div className="header-info">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span className="badge-new">GENERÁLT KAMPÁNY</span>
                {activeCampaign.goalType && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#c4b5fd', background: 'rgba(139,92,246,0.15)', padding: '2px 8px', borderRadius: 6 }}>
                    {goalTypeLabels[activeCampaign.goalType]}
                  </span>
                )}
              </div>
              <h2>{activeCampaign.title}</h2>
              <p className="concept-desc">{activeCampaign.description}</p>
              {(activeCampaign.targetAge || activeCampaign.targetLocation || activeCampaign.targetInterests) && (
                <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                  {activeCampaign.targetAge && <span>👤 {activeCampaign.targetAge}</span>}
                  {activeCampaign.targetLocation && <span>📍 {activeCampaign.targetLocation}</span>}
                  {activeCampaign.targetInterests && <span>🎯 {activeCampaign.targetInterests}</span>}
                </div>
              )}
            </div>
            <div className="header-actions" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-secondary" onClick={() => setActiveCampaign(null)}>Új kampány</button>
                <button onClick={handleCloneCampaign} title="Kampány klónozása módosításra" style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--border)', background: 'var(--bg3)', color: 'var(--text-muted)' }}>
                  🔁 Klónozás
                </button>
                <button className="btn-primary" onClick={handleApproveAll}>
                  <CheckCircle size={14} /> Jóváhagyás
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleCopyCaptions} title="Összes caption vágólapra"
                  style={{ padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--border)', background: 'var(--bg3)', color: 'var(--text-muted)' }}>
                  📋 Caption
                </button>
                <button onClick={handleCampaignExportCSV} title="Kampány CSV export"
                  style={{ padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--border)', background: 'var(--bg3)', color: 'var(--text-muted)' }}>
                  📊 CSV
                </button>
                <button onClick={handleCampaignExportPDF} title="Kampány Brief PDF"
                  style={{ padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--border)', background: 'var(--bg3)', color: 'var(--text-muted)' }}>
                  📄 PDF
                </button>
                <button onClick={handleCampaignExportZIP} title="Kreatívok ZIP"
                  style={{ padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--border)', background: 'var(--bg3)', color: 'var(--text-muted)' }}>
                  📦 ZIP
                </button>
              </div>
            </div>
          </div>

          {/* Phase Structure bar + Tab selector */}
          <div style={{ marginBottom: 18 }}>
            {/* Phase sav (Screen 4) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>
              {DEFAULT_PHASES.map((phase, i) => (
                <div key={phase.name} style={{
                  padding: '9px 14px', borderRadius: 10,
                  background: (['rgba(139,92,246,0.1)', 'rgba(236,72,153,0.1)', 'rgba(16,185,129,0.1)', 'rgba(245,158,11,0.1)'] as string[])[i],
                  borderLeft: `3px solid ${(['#8b5cf6', '#ec4899', '#10b981', '#f59e0b'] as string[])[i]}`
                }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', opacity: 0.65, marginBottom: 2 }}>{phase.days} nap</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{phase.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>{phase.focus}</div>
                </div>
              ))}
            </div>

            {/* Tab gombsor */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
              {[
                { id: 'funnel', label: '📈 AIDA Funnel' },
                { id: 'ab-test', label: '🧪 A/B Teszt' },
                { id: 'stats', label: '📊 Statisztika' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setActiveResultTab(id as any)}
                  style={{
                    padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: 'none',
                    background: activeResultTab === id ? 'var(--bg)' : 'transparent',
                    color: activeResultTab === id ? 'var(--text)' : 'var(--text-muted)',
                    boxShadow: activeResultTab === id ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >{label}</button>
              ))}
            </div>
          </div>

          {/* A/B Test Panel */}
          {activeResultTab === 'ab-test' && (
            <div style={{ marginBottom: 20 }}>
              {abWinnerId && (
                <div style={{ marginBottom: 12, padding: '10px 16px', borderRadius: 10, background: 'rgba(16,185,129,0.12)', border: '1.5px solid #10b981', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🏆</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>Győztes: {abVariants.find(v => v.id === abWinnerId)?.label}</span>
                  <button onClick={() => setAbWinnerId(null)} style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Törlés</button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {abVariants.map(v => (
                  <div key={v.id} onClick={() => setAbWinnerId(v.id)}
                    style={{ padding: 20, borderRadius: 16, cursor: 'pointer', transition: 'all 0.15s',
                      border: `2px solid ${abWinnerId === v.id ? '#10b981' : 'var(--border)'}`,
                      background: abWinnerId === v.id ? 'rgba(16,185,129,0.06)' : 'var(--bg2)'
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {abWinnerId === v.id && <span style={{ fontSize: 16 }}>🏆</span>}
                        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{v.label}</span>
                      </div>
                      <span style={{ background: abWinnerId === v.id ? '#10b981' : '#8b5cf6', color: '#fff', borderRadius: 8, padding: '3px 12px', fontSize: 12, fontWeight: 700 }}>
                        AI score: {v.score}/100
                      </span>
                    </div>
                    {v.imageUrl && (
                      <img src={v.imageUrl} alt={v.label} style={{ width: '100%', borderRadius: 10, marginBottom: 12, objectFit: 'cover', maxHeight: 200 }} />
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                      <div><span style={{ fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>Headline:</span>{v.headline || '—'}</div>
                      <div><span style={{ fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>CTA:</span>{v.cta || '—'}</div>
                      <div><span style={{ fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>Tesztelő:</span>{v.differentiator}</div>
                    </div>
                    <div style={{ marginTop: 12, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${v.score}%`, background: abWinnerId === v.id ? 'linear-gradient(90deg,#10b981,#059669)' : 'linear-gradient(90deg, #8b5cf6, #ec4899)', borderRadius: 3, transition: 'width 0.6s ease' }} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>{v.score}% becsült CTR · Kattints a győztes kijelöléséhez</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats Panel */}
          {activeResultTab === 'stats' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
              {/* Platform mix */}
              <div style={{ padding: '16px 20px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--bg2)' }}>
                <h4 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>📱 Platform eloszlás</h4>
                {['instagram', 'facebook', 'meta-ads'].map(ch => {
                  const count = activeCampaign.items.filter(i => i.channel === ch).length;
                  const pct = activeCampaign.items.length > 0 ? Math.round(count / activeCampaign.items.length * 100) : 0;
                  return (
                    <div key={ch} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
                        <span style={{ textTransform: 'capitalize' }}>{ch}</span><span style={{ fontWeight: 700 }}>{count} db ({pct}%)</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: ch === 'instagram' ? '#ec4899' : ch === 'facebook' ? '#3b82f6' : '#f59e0b', borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Status mix */}
              <div style={{ padding: '16px 20px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--bg2)' }}>
                <h4 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>🔄 Státusz eloszlás</h4>
                {['draft','approved','scheduled','published'].map(s => {
                  const count = activeCampaign.items.filter(i => i.status === s).length;
                  const color: Record<string,string> = { draft:'#94a3b8', approved:'#8b5cf6', scheduled:'#f59e0b', published:'#10b981' };
                  return (
                    <div key={s} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: color[s], fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>{s}</span>
                      <span style={{ fontWeight: 700, color: 'var(--text)' }}>{count} db</span>
                    </div>
                  );
                })}
              </div>

              {/* Content type */}
              <div style={{ padding: '16px 20px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--bg2)' }}>
                <h4 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>🎨 Tartalom típus</h4>
                {['post','ad'].map(t => {
                  const count = activeCampaign.items.filter(i => i.type === t).length;
                  const pct = activeCampaign.items.length > 0 ? Math.round(count / activeCampaign.items.length * 100) : 0;
                  return (
                    <div key={t} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
                        <span>{t === 'post' ? '📸 Organikus poszt' : '🎯 Fizetett hird.'}</span>
                        <span style={{ fontWeight: 700 }}>{count} db</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: t === 'post' ? '#8b5cf6' : '#ec4899', borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(139,92,246,0.08)', borderRadius: 8, fontSize: 11, color: '#c4b5fd' }}>
                  ℹ️ {activeCampaign.items.length} kreatív &middot; 30 napos kampány
                </div>
              </div>

              {/* Strategy cards — editable */}
              {(activeCampaign.targetAudience || activeCampaign.adBudgetSplit || editingStrategy) && (
                <div style={{ gridColumn: '1/-1', padding: '16px 20px', borderRadius: 12, border: `1.5px solid ${editingStrategy ? '#8b5cf6' : 'var(--border)'}`, background: 'var(--bg2)', transition: 'border-color 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>🎯 Stratégiai adatok</h4>
                    {editingStrategy ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={handleSaveStrategyEdit}
                          style={{ padding: '4px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: '#8b5cf6', color: '#fff' }}>
                          Mentés
                        </button>
                        <button onClick={() => setEditingStrategy(false)}
                          style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', border: '1.5px solid var(--border)', background: 'none', color: 'var(--text-muted)' }}>
                          Mégsem
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditStrategyAudience(activeCampaign.targetAudience || ''); setEditStrategyBudget(activeCampaign.adBudgetSplit || ''); setEditingStrategy(true); }}
                        style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', border: '1.5px solid var(--border)', background: 'none', color: 'var(--text-muted)' }}>
                        ✏️ Szerkesztés
                      </button>
                    )}
                  </div>
                  {editingStrategy ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Célközönség:</label>
                        <input value={editStrategyAudience} onChange={e => setEditStrategyAudience(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #8b5cf6', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Büdzsé felosztás:</label>
                        <input value={editStrategyBudget} onChange={e => setEditStrategyBudget(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #8b5cf6', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12 }} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 12 }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Célközönség</span>
                        <span style={{ color: 'var(--text)' }}>{activeCampaign.targetAudience || '—'}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Büdzsé</span>
                        <span style={{ color: 'var(--text)' }}>{activeCampaign.adBudgetSplit || '—'}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Funnel Roadmap Timeline display */}
          {activeResultTab === 'funnel' && (
            <div className="funnel-roadmap-container">
              <div className="roadmap-header">
                <h3>Integrált Marketing Funnel Roadmap</h3>
                <p className="sub">Az AIDA tölcsér fázisai alapján összeállított organikus posztok és paid hirdetések sorrendje.</p>
              </div>
              <div className="funnel-timeline">
                {activeCampaign.items.map((item, idx) => {
                const funnel = getFunnelLabel(item.templateId, idx);
                const isEditing = editingItemId === item.id;

                return (
                  <div key={item.id} className="timeline-node">
                    {/* Visual Connector Line */}
                    <div className="connector-column">
                      <div className="bullet-node">
                        <span>{idx + 1}</span>
                      </div>
                      {idx < activeCampaign.items.length - 1 && <div className="connector-line" />}
                    </div>

                    {/* Content Box */}
                    <div className="node-content-card glass-panel">
                      <div className="node-grid">
                        {/* Image aspect preview */}
                        <div className="node-image-side">
                          {isEditing ? (
                            <div 
                              className="phone-image-canvas" 
                              style={{ 
                                position: 'relative', 
                                width: '240px', 
                                height: '300px', 
                                background: '#000', 
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: (getLayoutCategory(hoveredLayerTemplateId === 'clean' ? 'universal' : (hoveredLayerTemplateId || selectedLayerTemplateId)) === 'quote' || getLayoutCategory(hoveredLayerTemplateId === 'clean' ? 'universal' : (hoveredLayerTemplateId || selectedLayerTemplateId)) === 'testimonial') ? 'center' : 'flex-end',
                                alignItems: (getLayoutCategory(hoveredLayerTemplateId === 'clean' ? 'universal' : (hoveredLayerTemplateId || selectedLayerTemplateId)) === 'quote' || getLayoutCategory(hoveredLayerTemplateId === 'clean' ? 'universal' : (hoveredLayerTemplateId || selectedLayerTemplateId)) === 'testimonial') ? 'center' : 'stretch',
                                borderRadius: '8px',
                                border: '1px solid var(--panel-border)'
                              }}
                            >
                              <img 
                                src={item.originalImageUrl || item.imageUrl} 
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

                              {/* Hover Layer Template Preview – CSS overlay on the canvas */}
                              {hoveredLayerTemplateId && (() => {
                                const allTmpls = buildLayerTemplates(
                                  activeBrandKit.colors.primary,
                                  activeBrandKit.colors.accent,
                                  activeBrandKit.typography?.fontName || 'Inter'
                                );
                                const tmpl = allTmpls.find(t => t.id === hoveredLayerTemplateId);
                                if (!tmpl) return null;
                                const scaleX = 240 / 1080;
                                const scaleY = 300 / 1350;
                                return (
                                  <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none', overflow: 'hidden', transition: 'opacity 0.2s ease' }}>
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
                              {(() => {
                                const activeTmplId = hoveredLayerTemplateId === 'clean' ? 'universal' : (hoveredLayerTemplateId || selectedLayerTemplateId);
                                const category = getLayoutCategory(activeTmplId);
                                if (category === 'testimonial') {
                                  return (
                                    <div style={{
                                      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                      background: `rgba(0,0,0,${editingOverlayOpacity})`,
                                      pointerEvents: 'none', zIndex: 2
                                    }} />
                                  );
                                }
                                if (category === 'quote') {
                                  return (
                                    <>
                                      <div style={{
                                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                        background: `linear-gradient(135deg, rgba(0,0,0,${editingOverlayOpacity * 1.2}) 0%, rgba(0,0,0,${editingOverlayOpacity * 0.6}) 60%, rgba(0,0,0,${editingOverlayOpacity}) 100%)`,
                                        pointerEvents: 'none', zIndex: 2
                                      }} />
                                      <div style={{
                                        position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px',
                                        backgroundColor: activeBrandKit.colors.accent,
                                        zIndex: 4, pointerEvents: 'none'
                                      }} />
                                    </>
                                  );
                                }
                                return (
                                  <div style={{
                                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                    background: `linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,${editingOverlayOpacity}) 100%)`,
                                    pointerEvents: 'none', zIndex: 2
                                  }} />
                                );
                              })()}

                              {/* Real-time Logo Overlay */}
                              <div className="mock-watermark" style={{
                                position: 'absolute',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 8px',
                                background: editingLogoVariant === 'light' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.75)',
                                backdropFilter: 'none',
                                color: editingLogoVariant === 'light' ? '#fff' : activeBrandKit.colors.primary,
                                borderRadius: 4,
                                fontSize: 9,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                zIndex: 10,
                                transform: `scale(${editingLogoSize})`,
                                transformOrigin: editingLogoPosition.replace('-', ' '),
                                transition: 'all 0.15s ease',
                                ...(editingLogoPosition === 'top-right' ? { top: 10, right: 10 } :
                                   editingLogoPosition === 'bottom-left' ? { bottom: 10, left: 10 } :
                                   editingLogoPosition === 'bottom-right' ? { bottom: 10, right: 10 } :
                                   { top: 10, left: 10 })
                              }}>
                                {(() => {
                                  const brandNameLower = (activeBrandKit.name || '').toLowerCase();
                                  const isCup = activeBrandKit.logoUrl === 'coffee-cup-minimal' || 
                                                brandNameLower.includes('kávé') || 
                                                brandNameLower.includes('coffee') || 
                                                brandNameLower.includes('cafe') || 
                                                brandNameLower.includes('latte');
                                  return isCup ? (
                                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 2 }}>
                                      <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
                                      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
                                    </svg>
                                  ) : (
                                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 2 }}>
                                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                    </svg>
                                  );
                                })()}
                                <span>{activeBrandKit.name || 'Márka'}</span>
                              </div>

                              {/* Real-time Content Panel Overlays */}
                              {(() => {
                                const activeTmplId = hoveredLayerTemplateId === 'clean' ? 'universal' : (hoveredLayerTemplateId || selectedLayerTemplateId);
                                const category = getLayoutCategory(activeTmplId);
                                if (category === 'universal') return null;

                                const panelStyle = getPanelStyle();
                                const textStyle = getTextStyle();
                                const ctaStyle = getCtaStyle();
                                const scale = 240 / 1080;

                                if (category === 'product') {
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

                                if (category === 'quote') {
                                  return (
                                    <div style={{
                                      position: 'absolute',
                                      top: '50%',
                                      left: '50%',
                                      transform: 'translate(-50%, -50%)',
                                      width: 'calc(100% - 32px)',
                                      zIndex: 3,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      textAlign: 'center',
                                      gap: `${8 * scale}px`,
                                      color: activeBrandKit.colors.secondary
                                    }}>
                                      <span style={{
                                        fontSize: `${54 * scale}px`,
                                        color: activeBrandKit.colors.accent,
                                        fontFamily: "'Playfair Display', serif",
                                        lineHeight: 0.1,
                                        marginBottom: `${-8 * scale}px`
                                      }}>“</span>
                                      <p style={{ ...textStyle, fontStyle: 'italic', textAlign: 'center', color: '#fff' }}>{editingText}</p>
                                      <div style={{ width: `${30 * scale}px`, height: `${2 * scale}px`, background: activeBrandKit.colors.accent, marginTop: `${4 * scale}px` }} />
                                    </div>
                                  );
                                }

                                if (category === 'testimonial') {
                                  return (
                                    <div style={panelStyle}>
                                      <div style={{ display: 'flex', gap: `${3 * scale}px`, color: '#fbbf24', fontSize: `${14 * scale}px`, marginBottom: `${8 * scale}px`, justifyContent: 'center' }}>
                                        {[...Array(5)].map((_, i) => (
                                          <span key={i}>★</span>
                                        ))}
                                      </div>
                                      <p style={{ ...textStyle, fontStyle: 'italic', textAlign: 'center' }}>{editingText}</p>
                                      {editingCta && (
                                        <p style={{
                                          fontSize: `${11 * scale}px`,
                                          fontWeight: 700,
                                          color: activeBrandKit.colors.accent,
                                          textTransform: 'uppercase',
                                          textAlign: 'center',
                                          margin: `${8 * scale}px 0 0 0`,
                                          fontFamily: activeBrandKit.typography.fontName
                                        }}>{editingCta}</p>
                                      )}
                                    </div>
                                  );
                                }

                                if (category === 'list') {
                                  const lines = (editingText || '').split('\n');
                                  const listTitle = lines[0] || '';
                                  const listItems = lines.slice(1).map(l => l.replace(/^\d+\.\s*/, '')).filter(Boolean).slice(0, 4);
                                  return (
                                    <div style={panelStyle}>
                                      <h4 style={{ ...textStyle, fontSize: `${(editingFontSize + 4) * scale}px`, fontWeight: 800, marginBottom: `${10 * scale}px` }}>{listTitle}</h4>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: `${6 * scale}px` }}>
                                        {listItems.map((itemStr, idx) => (
                                          <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: `${8 * scale}px` }}>
                                            <div style={{
                                              width: `${16 * scale}px`, height: `${16 * scale}px`, borderRadius: '50%',
                                              backgroundColor: activeBrandKit.colors.accent, color: '#fff',
                                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                                              fontSize: `${10 * scale}px`, fontWeight: 'bold', flexShrink: 0, marginTop: `${2 * scale}px`
                                            }}>{idx + 1}</div>
                                            <p style={{ ...textStyle, fontSize: `${(editingFontSize - 4) * scale}px`, lineHeight: 1.3 }}>{itemStr}</p>
                                          </div>
                                        ))}
                                      </div>
                                      {editingCta && (
                                        <button style={ctaStyle}>{editingCta}</button>
                                      )}
                                    </div>
                                  );
                                }

                                return null;
                              })()}
                            </div>
                          ) : (
                            <>
                              {item.imageUrl ? (
                                <img src={fixImageUrl(item.imageUrl)} alt="Rendered template" className="node-preview-img" />
                              ) : (
                                <div className="img-placeholder">
                                  <Loader className="spinner" />
                                  <span>Háttér betöltése...</span>
                                </div>
                              )}
                              <a href={fixImageUrl(item.imageUrl)} target="_blank" rel="noreferrer" className="zoom-btn" title="Kép megtekintése">
                                <Eye size={14} /> Nagyítás
                              </a>
                            </>
                          )}
                        </div>

                        {/* Information & Controls */}
                        <div className="node-info-side">
                          <div className="node-meta-row">
                            <div className="badge-group">
                              <span className={`badge-channel ${item.channel}`}>
                                {item.channel === 'instagram' ? (
                                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
                                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                                  </svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
                                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                                  </svg>
                                )}
                                {item.channel.toUpperCase()}
                              </span>
                              <span className="badge-phase">
                                {funnel.phase}
                              </span>
                            </div>
                            <span className={`status-tag badge-${item.status}`}>
                              {item.status.toUpperCase()}
                            </span>
                          </div>

                          <div className="node-creative-details">
                            {isEditing ? (
                              <div className="node-editor-form" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div className="field-group">
                                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>Poszt szövege (magyarul):</label>
                                  <textarea
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    rows={4}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12 }}
                                  />
                                </div>
                                {item.cta && (
                                  <div className="field-group">
                                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>CTA felirat:</label>
                                    <input
                                      type="text"
                                      value={editingCta}
                                      onChange={(e) => setEditingCta(e.target.value)}
                                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12 }}
                                    />
                                  </div>
                                )}

                                {/* Layer Templates picker grid */}
                                {(() => {
                                  const layerTemplates = buildLayerTemplates(
                                    activeBrandKit.colors.primary,
                                    activeBrandKit.colors.accent,
                                    activeBrandKit.typography?.fontName || 'Inter'
                                  );
                                  return (
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
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
                                        gap: 6,
                                        maxHeight: 180,
                                        overflowY: 'auto',
                                        paddingRight: 4
                                      }}>
                                        {layerTemplates.map(tmpl => (
                                          <button
                                            key={tmpl.id}
                                            type="button"
                                            onClick={() => handleApplyLayerTemplate(tmpl)}
                                            onMouseEnter={() => setHoveredLayerTemplateId(tmpl.id)}
                                            onMouseLeave={() => setHoveredLayerTemplateId(null)}
                                            disabled={isApplyingLayerTemplate}
                                            style={{
                                              display: 'flex',
                                              flexDirection: 'column',
                                              alignItems: 'flex-start',
                                              gap: 2,
                                              padding: '6px 8px',
                                              borderRadius: 8,
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
                                                <Loader size={14} className="spin-icon" style={{ color: '#8b5cf6' }} />
                                              </div>
                                            )}
                                            <span style={{ fontSize: 14, lineHeight: 1 }}>{tmpl.emoji}</span>
                                            <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{tmpl.name}</span>
                                            <span style={{ fontSize: 8.5, color: 'var(--text-muted)', lineHeight: 1.3 }}>{tmpl.desc}</span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Custom Sliders panel */}
                                <div className="layer-editor-panel" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>Rétegek Testreszabása (Layer Editor):</label>
                                  
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                    {/* Column 1: Layout & Position */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 2 }}>Elrendezés & Pozíció</span>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Kártya Horgony:</label>
                                        <select value={editingPanelPosition} onChange={e => setEditingPanelPosition(e.target.value as any)} style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 10.5 }}>
                                          <option value="relative">Folyamatos (Relative)</option>
                                          <option value="top">Fent (Top)</option>
                                          <option value="center">Középen (Center)</option>
                                          <option value="bottom">Lent (Bottom)</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Vízszintes (X): <span style={{ color: '#8b5cf6', float: 'right' }}>{editingTextXOffset}px</span></label>
                                        <input type="range" min="-150" max="150" step="5" value={editingTextXOffset} onChange={e => setEditingTextXOffset(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Függőleges (Y): <span style={{ color: '#8b5cf6', float: 'right' }}>{editingTextYOffset}px</span></label>
                                        <input type="range" min="-300" max="300" step="5" value={editingTextYOffset} onChange={e => setEditingTextYOffset(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                                      </div>
                                    </div>

                                    {/* Column 2: Background & Overlays */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 2 }}>Kártya & Háttér</span>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Kártya Háttér:</label>
                                        <select value={editingPanelBgColor} onChange={e => setEditingPanelBgColor(e.target.value as any)} style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 10.5 }}>
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
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Belső Margó: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingPanelPadding}px</span></label>
                                        <input type="range" min="20" max="100" step="5" value={editingPanelPadding} onChange={e => setEditingPanelPadding(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Kártya Lekerekítés: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingPanelRadius}px</span></label>
                                        <input type="range" min="0" max="40" step="2" value={editingPanelRadius} onChange={e => setEditingPanelRadius(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Háttér Elmosás: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingBgBlur}px</span></label>
                                        <input type="range" min="0" max="15" step="1" value={editingBgBlur} onChange={e => setEditingBgBlur(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Sötétítő réteg: <span style={{ color: '#8b5cf6', float: 'right' }}>{Math.round(editingOverlayOpacity*100)}%</span></label>
                                        <input type="range" min="0.1" max="0.9" step="0.05" value={editingOverlayOpacity} onChange={e => setEditingOverlayOpacity(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                                      </div>
                                    </div>

                                    {/* Column 3: Typography & Text */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 2 }}>Szöveg & Betű</span>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Szöveg Igazítás:</label>
                                        <select value={editingTextAlignment} onChange={e => setEditingTextAlignment(e.target.value as any)} style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 10.5 }}>
                                          <option value="left">Balra</option>
                                          <option value="center">Középre</option>
                                          <option value="right">Jobbra</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Betű Vastagság:</label>
                                        <select value={editingFontWeight} onChange={e => setEditingFontWeight(e.target.value)} style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 10.5 }}>
                                          <option value="normal">Normal</option>
                                          <option value="600">Semi-Bold</option>
                                          <option value="700">Bold</option>
                                          <option value="800">Extra-Bold</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Szöveg Színe:</label>
                                        <select value={editingTextColor} onChange={e => setEditingTextColor(e.target.value as any)} style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 10.5 }}>
                                          <option value="default">Alapértelmezett</option>
                                          <option value="primary">Elsődleges</option>
                                          <option value="secondary">Másodlagos</option>
                                          <option value="accent">Kiemelő</option>
                                          <option value="white">Fehér</option>
                                          <option value="black">Fekete</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Betűméret: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingFontSize}px</span></label>
                                        <input type="range" min="18" max="64" step="2" value={editingFontSize} onChange={e => setEditingFontSize(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                                      </div>
                                    </div>

                                    {/* Column 4: CTA Button & Logo */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 2 }}>CTA Gomb & Logó</span>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Gomb Háttér:</label>
                                        <select value={editingCtaBgColor} onChange={e => setEditingCtaBgColor(e.target.value as any)} style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 10.5 }}>
                                          <option value="default">Alapértelmezett</option>
                                          <option value="primary">Elsődleges</option>
                                          <option value="secondary">Másodlagos</option>
                                          <option value="accent">Kiemelő</option>
                                          <option value="white">Fehér</option>
                                          <option value="black">Fekete</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Gomb Betűméret: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingCtaFontSize}px</span></label>
                                        <input type="range" min="12" max="36" step="1" value={editingCtaFontSize} onChange={e => setEditingCtaFontSize(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Gomb Margó Y: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingCtaYOffset}px</span></label>
                                        <input type="range" min="-50" max="150" step="5" value={editingCtaYOffset} onChange={e => setEditingCtaYOffset(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Gomb Lekerekítés: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingCtaRadius}px</span></label>
                                        <input type="range" min="0" max="24" step="2" value={editingCtaRadius} onChange={e => setEditingCtaRadius(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Logó Méret: <span style={{ color: '#8b5cf6', float: 'right' }}>{editingLogoSize}x</span></label>
                                        <input type="range" min="0.6" max="1.6" step="0.1" value={editingLogoSize} onChange={e => setEditingLogoSize(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                                      </div>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                                        <div>
                                          <label style={{ fontSize: 8, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 1, display: 'block' }}>Helye:</label>
                                          <select value={editingLogoPosition} onChange={e => setEditingLogoPosition(e.target.value as any)} style={{ width: '100%', padding: '2px 4px', borderRadius: 4, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 9 }}>
                                            <option value="top-left">Bal Fent</option>
                                            <option value="top-right">Jobb Fent</option>
                                            <option value="bottom-left">Bal Lent</option>
                                            <option value="bottom-right">Jobb Lent</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label style={{ fontSize: 8, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 1, display: 'block' }}>Szín:</label>
                                          <select value={editingLogoVariant} onChange={e => setEditingLogoVariant(e.target.value as any)} style={{ width: '100%', padding: '2px 4px', borderRadius: 4, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 9 }}>
                                            <option value="light">Világos</option>
                                            <option value="dark">Sötét</option>
                                          </select>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="editor-controls" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                                  <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingItemId(null)}>
                                    Mégse
                                  </button>
                                  <button type="button" className="btn-primary btn-sm" onClick={() => handleItemEditSave(item.id)} disabled={isUpdatingItem}>
                                    {isUpdatingItem ? <Loader className="spinner" size={12} /> : 'Kép Újrarenderelése'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="text-preview-block" onClick={() => handleItemEditStart(item)}>
                                  {(item as any).headline && (
                                    <span className="headline-badge">📌 {(item as any).headline}</span>
                                  )}
                                  <div className="caption-box">
                                    <span className="caption-label">Instagram felirat / Hirdetés szöveg</span>
                                    <p className="caption-text">{(item as any).caption || item.text}</p>
                                    <button 
                                      className="copy-caption-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText((item as any).caption || item.text);
                                        const btn = e.currentTarget;
                                        btn.textContent = '✅ Másolva!';
                                        setTimeout(() => { btn.textContent = '📋 Felirat másolása'; }, 1500);
                                      }}
                                    >
                                      📋 Felirat másolása
                                    </button>
                                  </div>
                                  <button className="edit-caption-btn">
                                    <Edit3 size={12} /> Szerkesztés
                                  </button>
                                </div>

                                {item.targetAudience && (
                                  <div className="ad-extra-detail">
                                    <span className="lbl">Target szegmens:</span>
                                    <span className="val">{item.targetAudience}</span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          {/* Quick Actions Panel */}
                          {!isEditing && (
                            <div className="node-actions-footer">
                              {item.status === 'draft' && (
                                <button className="btn-success-action" onClick={() => handleApproveItem(item.id)}>
                                  <Check size={14} /> Jóváhagyás
                                </button>
                              )}
                              {item.status === 'approved' && (
                                <div className="approved-actions-row">
                                  <button className="btn-schedule" onClick={() => setShowDatePicker(item.id)}>
                                    <Calendar size={14} /> Ütemezés
                                  </button>
                                  <button className="btn-post-now btn-primary" onClick={() => handlePostNowItem(item.id)}>
                                    <Send size={14} /> Publikálás Meta API-val
                                  </button>
                                </div>
                              )}
                              
                              {showDatePicker === item.id && (
                                <div className="datepicker-popover inline-popover glass-panel">
                                  <label>Ütemezési dátum és idő:</label>
                                  <input
                                    type="datetime-local"
                                    value={scheduleDate}
                                    onChange={(e) => setScheduleDate(e.target.value)}
                                  />
                                  <div className="popover-actions">
                                    <button className="btn-secondary btn-sm" onClick={() => setShowDatePicker(null)}>
                                      Bezár
                                    </button>
                                    <button className="btn-primary btn-sm" onClick={() => handleScheduleItem(item.id)} disabled={!scheduleDate}>
                                      Beütemez
                                    </button>
                                  </div>
                                </div>
                              )}

                              {item.status === 'scheduled' && item.scheduledAt && (
                                <div className="scheduled-info">
                                  <Calendar size={14} className="icon-purple" />
                                  <span>Ütemezve: {new Date(item.scheduledAt).toLocaleString('hu-HU')}</span>
                                </div>
                              )}

                              {item.status === 'published' && item.publishedAt && (
                                <div className="published-info">
                                  <Award size={14} className="icon-emerald" />
                                  <span>Publikálva: {new Date(item.publishedAt).toLocaleString('hu-HU')}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          )}
        </div>
      )}


      {/* Generation Overlay */}
      {isGenerating && (
        <div className="simulation-overlay">
          <div className="simulation-card glass-panel">
            <h4>AI Kampány és Termék-beültető csővezeték</h4>
            <p className="sim-sub">Teljes AIDA marketing tölcsér összeállítása és kép-harmonizálása</p>

            <div className="pipeline-steps">
              {steps.map((step, idx) => {
                const IconComponent = step.icon;
                let stepState = 'pending';
                if (idx < currentStep) stepState = 'completed';
                else if (idx === currentStep) stepState = 'active';

                return (
                  <div key={idx} className={`step-item ${stepState}`}>
                    <div className="step-icon-wrapper">
                      <IconComponent size={18} />
                    </div>
                    <div className="step-text">
                      <span className="step-title">{step.title}</span>
                      <span className="step-desc">{step.desc}</span>
                    </div>
                    {stepState === 'completed' && <div className="check-mark">✓</div>}
                    {stepState === 'active' && <div className="pulse-indicator" />}
                  </div>
                );
              })}
            </div>

            <div className="simulation-console">
              <span className="console-title">Részletes naplózás (Live logs):</span>
              <div className="console-lines">
                {simulatedLogs.map((log, idx) => (
                  <div key={idx} className={`console-line ${log.includes('[ERROR]') ? 'err' : log.includes('[WARNING]') ? 'warn' : log.includes('[SUCCESS]') || log.includes('sikeresen') ? 'success' : ''}`}>
                    {log}
                  </div>
                ))}
              </div>
            </div>

            {/* Live preview thumbnails */}
            {completedPreviews.length > 0 && (
              <div className="live-previews">
                <span className="console-title">Elkészült kreatívok:</span>
                <div className="preview-thumbs">
                  {completedPreviews.map((p) => (
                    <div key={p.index} className="preview-thumb">
                      <img src={fixImageUrl(p.imageUrl)} alt={p.headline} />
                      <span className="thumb-label">{p.headline}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .campaign-creator-view {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
        }

        /* Landing style */
        .creator-landing {
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .landing-header {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .spark-wrapper {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(139, 92, 246, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(139, 92, 246, 0.3);
          box-shadow: 0 0 15px rgba(139, 92, 246, 0.2);
          margin-bottom: 8px;
        }
        .spark-glow {
          color: var(--primary-neon);
          filter: drop-shadow(0 0 4px var(--primary-neon));
        }
        .landing-header h2 {
          font-size: 22px;
          font-weight: 800;
        }
        .landing-header p {
          color: var(--text-muted);
          font-size: 14px;
        }
        
        .landing-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          align-items: start;
        }
        @media (max-width: 768px) {
          .landing-grid {
            grid-template-columns: 1fr;
          }
        }

        .landing-left-col, .landing-right-col {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .form-group label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .style-presets-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .preset-style-card {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--panel-border);
          border-radius: 10px;
          padding: 12px;
          text-align: left;
          cursor: pointer;
          transition: var(--transition-smooth);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .preset-style-card:hover {
          border-color: rgba(139, 92, 246, 0.3);
          background: rgba(139, 92, 246, 0.05);
        }
        .preset-style-card.active {
          border-color: var(--primary-neon);
          background: rgba(139, 92, 246, 0.15);
          box-shadow: 0 0 15px rgba(139, 92, 246, 0.1);
        }
        .preset-name {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-main);
        }
        .preset-desc {
          font-size: 10px;
          color: var(--text-muted);
          line-height: 1.3;
        }

        /* Drag & Drop Area */
        .file-drop-area {
          border: 2px dashed var(--panel-border);
          border-radius: 12px;
          padding: 32px 16px;
          text-align: center;
          cursor: pointer;
          transition: var(--transition-smooth);
          background: rgba(0, 0, 0, 0.15);
          min-height: 180px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .file-drop-area:hover, .file-drop-area.active {
          border-color: var(--primary-neon);
          background: rgba(139, 92, 246, 0.04);
        }
        .file-drop-area.has-image {
          border-style: solid;
          background: rgba(0, 0, 0, 0.3);
          padding: 16px;
        }
        .drop-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          width: 100%;
        }
        .upload-icon {
          color: var(--text-muted);
          transition: var(--transition-smooth);
        }
        .file-drop-area:hover .upload-icon {
          color: var(--primary-neon);
          transform: translateY(-2px);
        }
        .drop-label .title {
          font-size: 13px;
          font-weight: 600;
        }
        .drop-label .sub {
          font-size: 11px;
          color: var(--text-muted);
        }
        .hidden-file-input {
          display: none;
        }
        .drop-loader {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          color: var(--text-muted);
          font-size: 13px;
        }
        .spinner {
          animation: spin-slow 1.2s infinite linear;
          color: var(--primary-neon);
        }

        /* Checkerboard background for transparent PNG previews */
        .isolated-preview-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          width: 100%;
        }
        .checkerboard-bg {
          width: 100%;
          max-width: 180px;
          height: 180px;
          border-radius: 8px;
          border: 1px solid var(--panel-border);
          background-color: #eee;
          background-image: linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc),
                            linear-gradient(45deg, #ccc 25%, #eee 25%, #eee 75%, #ccc 75%, #ccc);
          background-size: 20px 20px;
          background-position: 0 0, 10px 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          padding: 12px;
        }
        .isolated-img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 4px 10px rgba(0,0,0,0.25));
        }
        .remove-img-btn {
          background: rgba(239, 68, 68, 0.1);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.2);
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 11px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .remove-img-btn:hover {
          background: rgba(239, 68, 68, 0.25);
          border-color: rgba(239, 68, 68, 0.4);
        }
        .preprocess-warning-badge {
          background: rgba(251, 191, 36, 0.1);
          border: 1px solid rgba(251, 191, 36, 0.25);
          color: #fbbf24;
          font-size: 11px;
          padding: 8px 12px;
          border-radius: 6px;
          line-height: 1.35;
          text-align: center;
          width: 100%;
        }

        .start-campaign-btn {
          padding: 14px;
          font-size: 14px;
          margin-top: 10px;
          box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4);
        }

        /* Campaign workspace dashboard view */
        .campaign-result-workspace {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .workspace-header {
          padding: 24px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
        }
        @media (max-width: 768px) {
          .workspace-header {
            flex-direction: column;
          }
        }
        .header-info {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-width: 700px;
        }
        .badge-new {
          background: rgba(139, 92, 246, 0.15);
          color: var(--primary-neon);
          font-size: 10px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 4px;
          width: fit-content;
          border: 1px solid rgba(139, 92, 246, 0.25);
        }
        .concept-desc {
          font-size: 13px;
          color: var(--text-muted);
          line-height: 1.45;
        }
        .header-actions {
          display: flex;
          gap: 12px;
          flex-shrink: 0;
        }

        .strategy-cards-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        @media (max-width: 768px) {
          .strategy-cards-grid {
            grid-template-columns: 1fr;
          }
        }
        .strategy-card {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .card-icon-title {
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          padding-bottom: 8px;
        }
        .card-icon-title h3 {
          font-size: 14px;
          font-weight: 700;
        }
        .strategy-card p {
          font-size: 12px;
          color: var(--text-muted);
          line-height: 1.45;
        }

        /* Funnel Timeline */
        .funnel-roadmap-container {
          margin-top: 12px;
        }
        .roadmap-header {
          margin-bottom: 24px;
        }
        .roadmap-header h3 {
          font-size: 16px;
          font-weight: 700;
        }
        .roadmap-header .sub {
          font-size: 12px;
          color: var(--text-muted);
        }

        .funnel-timeline {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .timeline-node {
          display: flex;
          gap: 20px;
        }
        .connector-column {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 32px;
          flex-shrink: 0;
        }
        .bullet-node {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(139, 92, 246, 0.15);
          border: 2px solid var(--primary-neon);
          color: var(--text-main);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          box-shadow: 0 0 10px rgba(139, 92, 246, 0.2);
        }
        .connector-line {
          width: 2px;
          background: rgba(139, 92, 246, 0.2);
          flex-grow: 1;
          margin-top: 6px;
        }

        .node-content-card {
          flex-grow: 1;
          padding: 16px;
          background: rgba(25, 20, 48, 0.3);
        }
        .node-grid {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 20px;
        }
        @media (max-width: 768px) {
          .node-grid {
            grid-template-columns: 1fr;
          }
        }
        
        .node-image-side {
          display: flex;
          flex-direction: column;
          gap: 10px;
          position: relative;
        }
        .node-preview-img {
          width: 100%;
          aspect-ratio: 4/5;
          object-fit: cover;
          border-radius: 8px;
          border: 1px solid var(--panel-border);
          background: #000;
        }
        .img-placeholder {
          width: 100%;
          aspect-ratio: 4/5;
          background: rgba(0,0,0,0.3);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: var(--text-muted);
          font-size: 12px;
        }
        .zoom-btn {
          font-size: 11px;
          color: var(--text-muted);
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          justify-content: center;
          padding: 6px;
          background: rgba(255,255,255,0.03);
          border-radius: 6px;
          border: 1px solid var(--panel-border);
          transition: var(--transition-smooth);
        }
        .zoom-btn:hover {
          color: var(--text-main);
          background: rgba(255,255,255,0.08);
        }

        /* Info side */
        .node-info-side {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 16px;
        }
        .node-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .badge-group {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .badge-channel {
          font-size: 9px;
          font-weight: 800;
          padding: 3px 6px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .badge-channel.instagram { background: rgba(219, 39, 119, 0.15); color: #f472b6; border: 1px solid rgba(219,39,119,0.3); }
        .badge-channel.facebook { background: rgba(37, 99, 235, 0.15); color: #60a5fa; border: 1px solid rgba(37,99,235,0.3); }
        .badge-channel.meta-ads { background: rgba(14, 165, 233, 0.15); color: #38bdf8; border: 1px solid rgba(14,165,233,0.3); }
        
        .badge-phase {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-muted);
          background: rgba(255, 255, 255, 0.05);
          padding: 3px 8px;
          border-radius: 4px;
          border: 1px solid rgba(255,255,255,0.04);
        }
        
        .status-tag {
          font-size: 9px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 4px;
        }

        .text-preview-block {
          background: rgba(0,0,0,0.15);
          padding: 12px;
          border-radius: 8px;
          border: 1px solid transparent;
          cursor: pointer;
          transition: var(--transition-smooth);
          position: relative;
        }
        .text-preview-block:hover {
          background: rgba(0,0,0,0.25);
          border-color: rgba(255,255,255,0.08);
        }
        .creative-caption {
          font-size: 12px;
          line-height: 1.45;
          color: var(--text-main);
          white-space: pre-line;
        }
        .cta-preview {
          margin-top: 8px;
          font-size: 11px;
          display: flex;
          gap: 6px;
        }
        .cta-preview .label { color: var(--text-muted); }
        .cta-preview .val { font-weight: 700; color: var(--accent-amber); }
        
        .edit-caption-btn {
          position: absolute;
          top: 8px; right: 8px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 3px;
          opacity: 0.6;
          transition: var(--transition-smooth);
        }
        .text-preview-block:hover .edit-caption-btn {
          opacity: 1;
          color: var(--primary-neon);
        }

        .ad-extra-detail {
          margin-top: 8px;
          font-size: 11px;
          display: flex;
          gap: 6px;
        }
        .ad-extra-detail .lbl { color: var(--text-muted); }
        .ad-extra-detail .val { color: var(--text-main); font-weight: 500; }

        .node-editor-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .field-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field-group label {
          font-size: 11px;
          color: var(--text-muted);
        }
        .editor-controls {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .node-actions-footer {
          margin-top: 8px;
          border-top: 1px solid rgba(255,255,255,0.03);
          padding-top: 12px;
          position: relative;
        }
        .approved-actions-row {
          display: grid;
          grid-template-columns: 140px 1fr;
          gap: 10px;
        }

        .inline-popover {
          position: absolute;
          bottom: 100%;
          left: 0;
          width: 280px;
          margin-bottom: 8px;
          z-index: 100;
          padding: 12px;
          background: rgba(15, 12, 30, 0.95);
          border-color: rgba(139, 92, 246, 0.3);
        }

        /* Loading Simulation overlay */
        .simulation-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(5, 3, 10, 0.85);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 20px;
        }
        .simulation-card {
          width: 100%;
          max-width: 580px;
          padding: 24px;
          background: rgba(15, 12, 30, 0.95);
          border-color: rgba(139, 92, 246, 0.3);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .simulation-card h4 {
          font-size: 18px;
          font-weight: 700;
          text-align: center;
        }
        .sim-sub {
          font-size: 12px;
          color: var(--text-muted);
          text-align: center;
          margin-top: -8px;
        }
        .pipeline-steps {
          display: flex;
          flex-direction: column;
          gap: 10px;
          background: rgba(0,0,0,0.2);
          padding: 16px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.03);
        }
        .step-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          border-radius: 8px;
          transition: var(--transition-smooth);
        }
        .step-item.pending { opacity: 0.35; }
        .step-item.active {
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.25);
          opacity: 1;
        }
        .step-item.completed { opacity: 0.8; color: var(--text-main); }
        .step-icon-wrapper {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
        }
        .step-item.active .step-icon-wrapper {
          background: var(--primary-neon);
          color: #fff;
          box-shadow: 0 0 10px var(--primary-glow);
        }
        .step-item.completed .step-icon-wrapper {
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
        }
        .step-text {
          display: flex;
          flex-direction: column;
          flex-grow: 1;
        }
        .step-title { font-size: 13px; font-weight: 600; }
        .step-desc { font-size: 11px; color: var(--text-muted); margin-top: 1px; }
        .check-mark { color: #34d399; font-weight: bold; font-size: 15px; }
        .pulse-indicator {
          width: 8px;
          height: 8px;
          background: var(--primary-neon);
          border-radius: 50%;
          box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.7);
          animation: pulse 1.2s infinite linear;
        }
        .simulation-console {
          background: #050308;
          border-radius: 8px;
          border: 1px solid var(--panel-border);
          padding: 12px;
          font-family: monospace;
          font-size: 11px;
          height: 120px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .console-title {
          color: var(--primary-neon);
          font-weight: bold;
          margin-bottom: 4px;
          display: block;
        }
        .console-lines { display: flex; flex-direction: column; gap: 3px; }
        .console-line { color: var(--text-muted); line-height: 1.3; }
        .console-line.err { color: #ef4444; }
        .console-line.warn { color: #fbbf24; }
        .console-line.success { color: #10b981; }

        /* Live preview thumbnails during generation */
        .live-previews {
          margin-top: 12px;
        }
        .preview-thumbs {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 8px;
        }
        .preview-thumb {
          width: 80px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          animation: fadeIn 0.4s ease;
        }
        .preview-thumb img {
          width: 80px;
          height: 100px;
          object-fit: cover;
          border-radius: 6px;
          border: 1px solid rgba(139, 92, 246, 0.3);
        }
        .thumb-label {
          font-size: 9px;
          color: var(--text-muted);
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }

        /* Caption box in campaign results */
        .caption-box {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
          padding: 12px;
          margin-top: 8px;
          border: 1px solid var(--panel-border);
        }
        .caption-label {
          font-size: 10px;
          color: var(--primary-neon);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 6px;
          display: block;
        }
        .caption-text {
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.5;
          white-space: pre-wrap;
        }
        .copy-caption-btn {
          margin-top: 8px;
          padding: 4px 10px;
          border-radius: 4px;
          background: rgba(139, 92, 246, 0.15);
          border: 1px solid rgba(139, 92, 246, 0.3);
          color: var(--primary-neon);
          cursor: pointer;
          font-size: 11px;
          transition: all 0.2s;
        }
        .copy-caption-btn:hover {
          background: rgba(139, 92, 246, 0.3);
        }
        .headline-badge {
          display: inline-block;
          background: rgba(139, 92, 246, 0.2);
          color: var(--primary-neon);
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.05em;
          margin-bottom: 6px;
        }
      `}</style>
    </div>
  );
};
