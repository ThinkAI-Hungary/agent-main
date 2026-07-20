import React, { useState, useEffect, useRef } from 'react';
import type { BrandKit, SystemLog, Campaign, CampaignItem, PostCreative } from '../types';
import AppleDateTimePicker from './AppleDateTimePicker';
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
  Award,
  GitBranch as Split,
  List,
  Grid,
  Download,
  X
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
  const [_rawProductImage, setRawProductImage] = useState<string | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [isPreprocessing, setIsPreprocessing] = useState(false);
  const [preprocessWarning, setPreprocessWarning] = useState<string | null>(null);
  
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

  // A/B test and Kanban states
  const [abTestItemId, setAbTestItemId] = useState<string | null>(null);
  const [abVariations, setAbVariations] = useState<{ [key: string]: CampaignItem[] }>({});
  const [isGeneratingAb, setIsGeneratingAb] = useState(false);
  const [abTestFocus, setAbTestFocus] = useState<'szöveg' | 'kép' | 'stílus'>('szöveg');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

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

  // Drag and Drop files upload handler
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };



  const processSelectedFile = (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Csak képfájlokat fogadunk el (PNG, JPG, WEBP).');
      return;
    }
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('A fájl túl nagy. Maximum 10 MB méretű képet tölthetsz fel.');
      return;
    }

    setPreprocessWarning(null);

    // Immediately show preview via object URL
    const objectUrl = URL.createObjectURL(file);
    setProductImageUrl(objectUrl);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setRawProductImage(base64);
      
      // Attempt background removal via Bria AI
      setIsPreprocessing(true);
      try {
        const response = await fetch('/api/image/preprocess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 })
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const data = await response.json();
        // Replace preview with the background-removed version
        URL.revokeObjectURL(objectUrl);
        setProductImageUrl(data.url);
      } catch (err: any) {
        console.error('[PREPROCESS]', err);
        // Keep the raw objectUrl as fallback — user can still proceed
        setPreprocessWarning('Hatter eltavolitas sikertelen — eredeti kep hasznalata. (' + (err.message || err) + ')');
      } finally {
        setIsPreprocessing(false);
      }
    };
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
      const response = await fetch('/api/campaign/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: fullBrief,
          brandKit: activeBrandKit,
          productImageUrl: productImageUrl
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
                  imageUrl: data.imageUrl, 
                  headline: data.headline || '' 
                }]);
                setSimulatedLogs(prev => [...prev, `[${ts}] [SUCCESS] ${data.message}`]);
                break;

              case 'complete': {
                const campaign = data.campaign;
                setIsGenerating(false);
                setCurrentStep(-1);
                setCreatives(prev => [...(campaign.items as any), ...prev]);
                setActiveCampaign(campaign);

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
  };

  const handleItemEditSave = async (id: string) => {
    setIsUpdatingItem(true);
    try {
      const creative = creatives.find(c => c.id === id);
      if (!creative) return;

      const response = await fetch('/api/render-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post: {
            ...creative,
            text: editingText,
            cta: editingCta
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
            imageUrl: updatedPost.imageUrl
          } : item)
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

  // A/B test generation logic using the existing /api/generate-adhoc endpoint
  const handleGenerateAbTest = async (item: CampaignItem, focus: 'szöveg' | 'kép' | 'stílus') => {
    setIsGeneratingAb(true);
    try {
      const bBrief = `A/B Teszt "B" Változat (${focus}): ${item.text.substring(0, 100)}`;
      const cBrief = `A/B Teszt "C" Változat (${focus}): ${item.text.substring(0, 100)}`;

      // B változat generálása
      const resB = await fetch('/api/generate-adhoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: bBrief,
          brandKit: activeBrandKit,
          templateId: item.templateId,
          productImageUrl: productImageUrl,
          customText: focus === 'szöveg' ? `${item.text} — Fedezd fel még ma a különbséget!` : item.text,
          cta: item.cta
        })
      });
      if (!resB.ok) throw new Error(await resB.text());
      const dataB = await resB.json();

      // C változat generálása
      const resC = await fetch('/api/generate-adhoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: cBrief,
          brandKit: activeBrandKit,
          templateId: item.templateId,
          productImageUrl: productImageUrl,
          customText: focus === 'szöveg' ? `Unod a megszokottat? ${item.text}` : item.text,
          cta: item.cta,
          colorVariation: 'accent' // más szín C-nek
        })
      });
      if (!resC.ok) throw new Error(await resC.text());
      const dataC = await resC.json();

      const newB: CampaignItem = {
        id: `ab-B-${Date.now()}`,
        templateId: item.templateId,
        channel: item.channel,
        status: 'draft',
        text: dataB.text || item.text,
        cta: dataB.cta || item.cta,
        imageUrl: dataB.imageUrl || item.imageUrl,
        scheduledAt: item.scheduledAt
      };
      
      const newC: CampaignItem = {
        id: `ab-C-${Date.now()}`,
        templateId: item.templateId,
        channel: item.channel,
        status: 'draft',
        text: dataC.text || item.text,
        cta: dataC.cta || item.cta,
        imageUrl: dataC.imageUrl || item.imageUrl,
        scheduledAt: item.scheduledAt
      };

      setAbVariations(prev => ({
        ...prev,
        [item.id]: [
          { ...item, id: `ab-A-${item.id}` }, // Eredeti "A"-ként
          newB,
          newC
        ]
      }));

      alert("A/B változatok sikeresen legenerálva!");
    } catch (err: any) {
      console.error(err);
      alert("Sikertelen A/B generálás: " + (err.message || err));
    } finally {
      setIsGeneratingAb(false);
    }
  };

  const handleSelectWinner = (parentItemId: string, winner: CampaignItem) => {
    if (!activeCampaign) return;
    setActiveCampaign({
      ...activeCampaign,
      items: activeCampaign.items.map(item => {
        if (item.id === parentItemId) {
          return {
            ...item,
            text: winner.text,
            cta: winner.cta,
            imageUrl: winner.imageUrl
          };
        }
        return item;
      })
    });
    setAbTestItemId(null);
    alert("Győztes változat alkalmazva a kampányra!");
  };

  const handleSaveAllAbToCalendar = (parentItemId: string) => {
    const variations = abVariations[parentItemId];
    if (!variations) return;
    
    const newCreatives: PostCreative[] = variations.map(v => ({
      id: `creative-${Math.random().toString(36).substring(2, 9)}`,
      platform: v.channel as PostCreative['platform'],
      format: 'feed',
      text: v.text,
      imageUrl: v.imageUrl,
      createdAt: new Date().toISOString(),
      scheduledAt: v.scheduledAt || new Date().toISOString(),
      status: 'draft'
    }));

    setCreatives(prev => [...prev, ...newCreatives]);
    setAbTestItemId(null);
    alert("Összes A/B változat hozzáadva külön posztként a naptárhoz!");
  };

  const handleExportMetaAds = () => {
    if (!activeCampaign) return;
    
    const metaCampaignData = {
      campaign_name: activeCampaign.name,
      objective: activeCampaign.objective,
      target_audience: activeCampaign.targetAudience,
      ad_budget_split: activeCampaign.adBudgetSplit,
      ad_sets: activeCampaign.items
        .filter(item => item.channel === 'meta-ads' || item.templateId.includes('conversion') || item.templateId.includes('benefit'))
        .map((item, idx) => ({
          ad_set_name: `Ad Set ${idx + 1} - ${item.channel.toUpperCase()}`,
          targeting: {
            age: "18-65+",
            location: "Hungary",
            interests: activeCampaign.targetAudience
          },
          ad_creative: {
            title: `Ad Creative ${idx + 1}`,
            headline: item.text.substring(0, 40),
            body_text: item.text,
            call_to_action: item.cta || 'SHOP_NOW',
            image_url: item.imageUrl
          }
        }))
    };

    const blob = new Blob([JSON.stringify(metaCampaignData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `meta-ads-campaign-${activeCampaign.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    link.click();
    alert("Meta Ads hirdetési terv sikeresen exportálva JSON formátumban!");
  };

  const handleMoveKanbanStatus = (itemId: string, newStatus: CampaignItem['status']) => {
    if (!activeCampaign) return;
    setActiveCampaign({
      ...activeCampaign,
      items: activeCampaign.items.map(item => item.id === itemId ? { ...item, status: newStatus } : item)
    });
    setCreatives(prev => prev.map(c => c.id === itemId ? { ...c, status: newStatus } : c));
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

  const renderTimeline = () => {
    if (!activeCampaign) return null;
    
    const phases = [
      { id: 'attention', label: 'Figyelem (Attention)', color: '#a855f7' },
      { id: 'interest', label: 'Érdeklődés (Interest)', color: '#ec4899' },
      { id: 'desire', label: 'Vágyfokozás (Desire)', color: '#3b82f6' },
      { id: 'action', label: 'Aktivizálás (Action)', color: '#eab308' },
      { id: 'conversion', label: 'Konverzió (Conversion)', color: '#10b981' }
    ];

    return (
      <div className="campaign-timeline-gantt glass-panel" style={{ padding: 16, borderRadius: 12, marginBottom: 24, background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Kampány Fázisok Idővonala</h4>
        <div style={{ display: 'flex', gap: 4, height: 28, borderRadius: 6, overflow: 'hidden' }}>
          {phases.map((p, idx) => {
            const count = activeCampaign.items.filter((item, itemIdx) => {
              const funnel = getFunnelLabel(item.templateId, itemIdx);
              return funnel.phase.toLowerCase().includes(p.id) || funnel.phase.toLowerCase().includes(p.label.toLowerCase());
            }).length;

            const widthPct = (count / activeCampaign.items.length) * 100 || 5;

            return (
              <div key={p.id} style={{ 
                width: `${widthPct}%`, 
                background: p.color, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                color: '#fff', 
                fontSize: 10, 
                fontWeight: 700,
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                transition: 'width 0.3s ease'
              }} title={`${p.label}: ${count} poszt`}>
                {count > 0 && `${idx + 1}. fázis (${count})`}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderKanbanBoard = () => {
    if (!activeCampaign) return null;
    
    const statuses: Array<{ id: CampaignItem['status']; label: string; color: string }> = [
      { id: 'draft', label: 'Vázlatok (Draft)', color: '#94a3b8' },
      { id: 'approved', label: 'Jóváhagyott (Approved)', color: '#10b981' },
      { id: 'scheduled', label: 'Ütemezett (Scheduled)', color: '#8b5cf6' },
      { id: 'published', label: 'Közzétett (Published)', color: '#06b6d4' }
    ];

    return (
      <div className="kanban-board-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 24, marginBottom: 24 }}>
        {statuses.map(col => {
          const colItems = activeCampaign.items.filter(item => item.status === col.id);
          return (
            <div key={col.id} className="kanban-column glass-panel" style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', minHeight: 450, display: 'flex', flexDirection: 'column' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: col.color, borderBottom: `2px solid ${col.color}`, paddingBottom: 6 }}>
                {col.label} ({colItems.length})
              </h4>
              <div className="kanban-cards-list" style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto' }}>
                {colItems.map(item => (
                  <div key={item.id} className="kanban-card glass-panel" style={{ padding: 12, borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: 12 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      {item.imageUrl && (
                        <img src={item.imageUrl} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4 }} />
                      )}
                      <div style={{ flex: 1 }}>
                        <span className={`badge-channel ${item.channel}`} style={{ fontSize: 9, padding: '1px 4px' }}>{item.channel.toUpperCase()}</span>
                        <p style={{ margin: '4px 0 0 0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.3 }}>{item.text}</p>
                      </div>
                    </div>
                    {/* Controls */}
                    <div className="kanban-card-actions" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 8 }}>
                      {col.id !== 'draft' && (
                        <button className="btn-secondary btn-xs" style={{ padding: '2px 6px', fontSize: 10, cursor: 'pointer' }} onClick={() => {
                          const prevStatus = col.id === 'approved' ? 'draft' : col.id === 'scheduled' ? 'approved' : 'scheduled';
                          handleMoveKanbanStatus(item.id, prevStatus);
                        }}>◀</button>
                      )}
                      {col.id !== 'published' && (
                        <button className="btn-primary btn-xs" style={{ padding: '2px 6px', fontSize: 10, cursor: 'pointer' }} onClick={() => {
                          const nextStatus = col.id === 'draft' ? 'approved' : col.id === 'approved' ? 'scheduled' : 'published';
                          if (nextStatus === 'scheduled') {
                            setShowDatePicker(item.id);
                          } else {
                            handleMoveKanbanStatus(item.id, nextStatus);
                          }
                        }}>▶</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="campaign-creator-view animate-slide-up">
      {!activeCampaign ? (
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
                <label>Termékfotó feltöltése (Bria AI háttér-eltávolítással):</label>
                <div
                  className={`file-drop-area ${dragActive ? 'active' : ''} ${productImageUrl ? 'has-image' : ''}`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                >
                  {isPreprocessing ? (
                    <div className="drop-loader">
                      <Loader size={36} className="spinner" />
                      <span>Termék kivágása a háttérből...</span>
                    </div>
                  ) : productImageUrl ? (
                    <div className="isolated-preview-container">
                      <div className="checkerboard-bg">
                        <img src={productImageUrl} alt="Isolated product" className="isolated-img" />
                      </div>
                      {preprocessWarning && (
                        <div className="preprocess-warning-badge">
                          ⚠️ {preprocessWarning}
                        </div>
                      )}
                      <button className="remove-img-btn" onClick={() => { setProductImageUrl(null); setRawProductImage(null); setPreprocessWarning(null); }}>
                        Törlés és Új feltöltés
                      </button>
                    </div>
                  ) : (
                    <label className="drop-label">
                      <UploadCloud size={38} className="upload-icon" />
                      <span className="title">Húzd ide a termékfotót, vagy kattints a tallózáshoz</span>
                      <span className="sub">PNG, JPG formátum támogatott</span>
                      <input type="file" onChange={handleFileChange} accept="image/*" className="hidden-file-input" />
                    </label>
                  )}
                </div>
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
      ) : (
        /* Campaign Result View */
        <div className="campaign-result-workspace">
          {/* Header Row */}
          <div className="workspace-header glass-panel">
            <div className="header-info">
              <span className="badge-new">GENERÁLT KAMPÁNY</span>
              <h2>{activeCampaign.title}</h2>
              <p className="concept-desc">{activeCampaign.description}</p>
            </div>
            <div className="header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn-secondary" onClick={() => setActiveCampaign(null)}>
                Új kampány indítása
              </button>
              <button className="btn-secondary" onClick={handleExportMetaAds} style={{ background: '#0284c7', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Download size={16} /> Meta Ads Export
              </button>
              <button className="btn-primary" onClick={handleApproveAll}>
                <CheckCircle size={16} /> Összes jóváhagyása
              </button>
            </div>
          </div>

          {/* Strategic stats rows */}
          <div className="strategy-cards-grid">
            <div className="strategy-card glass-panel">
              <div className="card-icon-title">
                <Target size={20} className="icon-purple" />
                <h3>Meghatározott Célközönség</h3>
              </div>
              <p>{activeCampaign.targetAudience}</p>
            </div>

            <div className="strategy-card glass-panel">
              <div className="card-icon-title">
                <DollarSign size={20} className="icon-pink" />
                <h3>Hirdetési Büdzsé Felosztás</h3>
              </div>
              <p>{activeCampaign.adBudgetSplit}</p>
            </div>
          </div>

          {/* Vizuális fázis timeline */}
          {renderTimeline()}

          {/* Nézetváltó és vezérlők */}
          <div className="view-mode-bar glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderRadius: 12, marginBottom: 20, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Megjelenítési Mód:</span>
            <div className="view-toggle-buttons" style={{ display: 'flex', gap: 8 }}>
              <button 
                className={`btn-toggle ${viewMode === 'list' ? 'active btn-primary' : 'btn-secondary'}`} 
                onClick={() => setViewMode('list')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', border: 'none' }}
              >
                <List size={14} /> Lista nézet (Roadmap)
              </button>
              <button 
                className={`btn-toggle ${viewMode === 'kanban' ? 'active btn-primary' : 'btn-secondary'}`} 
                onClick={() => setViewMode('kanban')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', border: 'none' }}
              >
                <Grid size={14} /> Kanban tábla
              </button>
            </div>
          </div>

          {viewMode === 'kanban' ? renderKanbanBoard() : (
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
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="Rendered template" className="node-preview-img" />
                          ) : (
                            <div className="img-placeholder">
                              <Loader className="spinner" />
                              <span>Háttér betöltése...</span>
                            </div>
                          )}
                          <a href={item.imageUrl} target="_blank" rel="noreferrer" className="zoom-btn" title="Kép megtekintése">
                            <Eye size={14} /> Nagyítás
                          </a>
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
                              <div className="node-editor-form">
                                <div className="field-group">
                                  <label>Poszt szövege (magyarul):</label>
                                  <textarea
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    rows={4}
                                  />
                                </div>
                                {item.cta && (
                                  <div className="field-group">
                                    <label>CTA felirat:</label>
                                    <input
                                      type="text"
                                      value={editingCta}
                                      onChange={(e) => setEditingCta(e.target.value)}
                                    />
                                  </div>
                                )}
                                <div className="editor-controls">
                                  <button className="btn-secondary btn-sm" onClick={() => setEditingItemId(null)}>
                                    Mégse
                                  </button>
                                  <button className="btn-primary btn-sm" onClick={() => handleItemEditSave(item.id)} disabled={isUpdatingItem}>
                                    {isUpdatingItem ? <Loader className="spinner" size={12} /> : 'Mentés és Újrarenderelés'}
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
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button className="btn-success-action" onClick={() => handleApproveItem(item.id)}>
                                    <Check size={14} /> Jóváhagyás
                                  </button>
                                  <button className="btn-secondary" onClick={() => setAbTestItemId(item.id)} style={{ background: '#475569', color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Split size={14} /> A/B Teszt
                                  </button>
                                </div>
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
                                <div className="datepicker-popover inline-popover glass-panel" style={{ width: 280, padding: 12 }}>
                                  <label style={{ display: 'block', marginBottom: 8, fontSize: 11, fontWeight: 700 }}>Ütemezési dátum és idő:</label>
                                  <AppleDateTimePicker
                                    value={scheduleDate}
                                    onChange={(val) => setScheduleDate(val)}
                                  />
                                  <div className="popover-actions" style={{ marginTop: 12 }}>
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
                      <img src={p.imageUrl} alt={p.headline} />
                      <span className="thumb-label">{p.headline}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* A/B Tesztelés Modal */}
      {abTestItemId && (
        <div className="preview-modal-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', padding: 20 }} onClick={() => setAbTestItemId(null)}>
          <div className="preview-modal-card glass-panel" style={{ width: 800, maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>A/B Teszt Konfiguráció és Generálás</h4>
                <span className="sub" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hozd létre az optimális változatot a hirdetésedhez</span>
              </div>
              <button className="close-modal-btn" onClick={() => setAbTestItemId(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)' }}><X size={18} /></button>
            </div>

            <div style={{ padding: 24 }}>
              {/* Teszt fókusz választó */}
              {!abVariations[abTestItemId] && !isGeneratingAb && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: 40 }}>🔬</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Válassz A/B teszt fókuszpontot</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 500, margin: 0 }}>
                    A rendszer a kiválasztott fókusz alapján automatikusan legenerál 2 alternatív változatot a meglévő bejegyzésből a Claude és a Flux segítségével.
                  </p>
                  
                  <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                    <button className="btn-primary" onClick={() => handleGenerateAbTest(activeCampaign!.items.find(x => x.id === abTestItemId)!, 'szöveg')}>
                      📝 Alternatív Szövegek
                    </button>
                    <button className="btn-primary" onClick={() => handleGenerateAbTest(activeCampaign!.items.find(x => x.id === abTestItemId)!, 'kép')}>
                      🖼️ Alternatív Képek/Színek
                    </button>
                  </div>
                </div>
              )}

              {isGeneratingAb && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0' }}>
                  <Loader className="spinner" size={32} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>A/B teszt változatok generálása folyamatban (Claude + Flux v2)...</span>
                </div>
              )}

              {/* Egymás melletti összehasonlítás */}
              {abVariations[abTestItemId] && !isGeneratingAb && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    {abVariations[abTestItemId].map((v, idx) => (
                      <div key={v.id} className="ab-card glass-panel" style={{ padding: 12, borderRadius: 12, background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: idx === 0 ? '#a855f7' : idx === 1 ? '#3b82f6' : '#ec4899' }}>
                            {idx === 0 ? 'A Változat (Eredeti)' : idx === 1 ? 'B Változat' : 'C Változat'}
                          </span>
                          <span className={`badge-channel ${v.channel}`} style={{ fontSize: 9, padding: '1px 4px' }}>{v.channel.toUpperCase()}</span>
                        </div>
                        {v.imageUrl && (
                          <img src={v.imageUrl} alt="" style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 8 }} />
                        )}
                        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, flex: 1, color: 'var(--text-muted)' }}>{v.text}</p>
                        
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <button className="btn-primary btn-sm" style={{ flex: 1, fontSize: 11, padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer' }} onClick={() => handleSelectWinner(abTestItemId!, v)}>
                            Győztes alkalmazása
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                    <button className="btn-secondary" style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }} onClick={() => setAbVariations(prev => { const copy = {...prev}; delete copy[abTestItemId!]; return copy; })}>
                      Változatok törlése és Újrakezdés
                    </button>
                    <button className="btn-primary" onClick={() => handleSaveAllAbToCalendar(abTestItemId!)} style={{ background: '#059669', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', border: 'none' }}>
                      Összes változat mentése a naptárba
                    </button>
                  </div>
                </div>
              )}
            </div>
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

        /* Premium hover states, active transitions, and responsive adaptations */
        
        .strategy-card, .node-content-card, .preset-style-card, .file-drop-area {
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        
        .strategy-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(139, 92, 246, 0.15) !important;
          border-color: rgba(139, 92, 246, 0.25) !important;
        }
        
        .node-content-card {
          border: 1px solid rgba(255, 255, 255, 0.03) !important;
        }
        .node-content-card:hover {
          transform: translateY(-3px);
          background: rgba(25, 20, 48, 0.5) !important;
          border-color: rgba(139, 92, 246, 0.35) !important;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(139, 92, 246, 0.15) !important;
        }
        
        .preset-style-card:hover {
          transform: translateY(-1px) scale(1.02);
          box-shadow: 0 6px 16px rgba(139, 92, 246, 0.12) !important;
        }
        
        .file-drop-area:hover {
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.08) !important;
        }
        
        /* Button hovers */
        .btn-exporter-csv, .btn-exporter-zip, .btn-select-all, .start-campaign-btn, .copy-caption-btn, .zoom-btn, .remove-img-btn {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        
        .btn-exporter-csv:hover, .btn-exporter-zip:hover, .btn-select-all:hover, .start-campaign-btn:hover, .copy-caption-btn:hover, .zoom-btn:hover {
          transform: translateY(-1.5px);
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.25) !important;
        }
        
        .start-campaign-btn:active, .copy-caption-btn:active {
          transform: translateY(0);
        }
        
        /* Responsive adjustments */
        @media (max-width: 768px) {
          .style-presets-grid {
            grid-template-columns: 1fr !important;
          }
          .approved-actions-row {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .approved-actions-row button {
            width: 100% !important;
            justify-content: center !important;
          }
          .node-meta-row {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 10px !important;
          }
          .connector-column {
            display: none !important;
          }
          .timeline-node {
            gap: 0 !important;
          }
          .node-content-card {
            margin-left: 0 !important;
          }
          .funnel-timeline {
            gap: 24px !important;
          }
        }
        
        @media (max-width: 480px) {
          .header-actions {
            width: 100% !important;
            flex-direction: column !important;
            gap: 10px !important;
          }
          .header-actions button {
            width: 100% !important;
            justify-content: center !important;
          }
          .creator-landing {
            padding: 16px !important;
          }
          .simulation-card {
            padding: 16px !important;
          }
        }
      `}</style>
    </div>
  );
};
