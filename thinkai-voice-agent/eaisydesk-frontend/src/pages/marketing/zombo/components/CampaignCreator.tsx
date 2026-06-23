import React, { useState, useEffect, useRef } from 'react';
import type { BrandKit, SystemLog, Campaign, CampaignItem, PostCreative, ABTestVariant, CampaignPhase } from '../types';
import { fixImageUrl } from '../types';
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
  const [_rawProductImage, setRawProductImage] = useState<string | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [isPreprocessing, setIsPreprocessing] = useState(false);
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
        const response = await fetch('http://localhost:3001/api/image/preprocess', {
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
        setProductImageUrl(fixImageUrl(data.url));
      } catch (err: any) {
        console.error('[PREPROCESS]', err);
        // Keep the raw objectUrl as fallback — user can still proceed
        setPreprocessWarning('Hatter eltavolitas sikertelen — eredeti kep hasznalata. (' + (err.message || err) + ')');
      } finally {
        setIsPreprocessing(false);
      }
    };
  };

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
            imageUrl: fixImageUrl(updatedPost.imageUrl)
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
