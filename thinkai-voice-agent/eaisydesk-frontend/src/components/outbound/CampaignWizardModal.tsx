/**
 * CampaignWizardModal – 3-step campaign creation wizard
 * Port of the legacy HTML campaign modal from page-settings.html
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useClients } from '../../hooks/useClients';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { parseCustomData, bestClientName } from '../../helpers/clientResolvers';
import { authFetch } from '../../api/client';
import { showToast } from '../ui/Toast';

interface Props {
  onClose: () => void;
  onCreated: () => void;
  initialSelectedIds?: string[];
}

const CHANNELS = [
  { key: 'email', label: 'EMAIL', color: '#3b82f6', bgColor: 'rgba(59,130,246,0.1)',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" style={{width:18,height:18}}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg> },
  { key: 'telefon', label: 'TELEFON', color: '#22c55e', bgColor: 'rgba(34,197,94,0.1)',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" style={{width:18,height:18}}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.12.8.3 1.6.56 2.37a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.77.25 1.57.44 2.37.56A2 2 0 0122 16.92z"/></svg> },
];

const STEP_TIPS = [
  { title: 'CÉLCSOPORT KIVÁLASZTÁSA', text: 'Válaszd ki a kampány célcsoportját ügyfélstátusz, címkék vagy egyedi kijelölés alapján. A pontos célzás segít, hogy a megfelelő ügyfelekhez a megfelelő üzenet jusson el.' },
  { title: 'KAMPÁNY BEÁLLÍTÁSAI', text: 'Ebben a lépésben beállíthatod a kampány nevét és a használt csatornákat. Érdemes egyértelmű nevet adni, amiről később könnyen beazonosítod a kampányt és olyan csatornát választani, amely legjobban illik a célcsoporthoz és a tervezett üzenet stílusához és terjedelméhez.' },
  { title: 'KAMPÁNYÜZENET', text: 'Írd meg az üzenetet szabadon vagy használd az AI szövegvarázslót. A Rich Text szerkesztővel formázott, professzionális üzeneteket hozhatsz létre.' },
];

const AI_STYLES = [
  { key: 'hivatalos', label: '🏢 Hivatalos' },
  { key: 'barátságos', label: '😊 Barátságos' },
  { key: 'akciós', label: '🔥 Akciós' },
  { key: 'személyes', label: '💬 Személyes' },
];

export default function CampaignWizardModal({ onClose, onCreated, initialSelectedIds }: Props) {
  const [step, setStep] = useState(1);
  const [tipVisible, setTipVisible] = useState([true, true, true]);

  // Step 1 state
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set());
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set(initialSelectedIds || []));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  // Step 2 state
  const [campaignName, setCampaignName] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set(['email']));

  // Step 3 state
  const [messageMode, setMessageMode] = useState<'manual' | 'ai'>('manual');
  const [messageContent, setMessageContent] = useState('');
  const [aiStyle, setAiStyle] = useState('barátságos');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState('');

  const editorRef = useRef<HTMLDivElement>(null);

  // Client data
  const { clients } = useClients();

  // Collect all unique tags from clients + default tags
  const allTags = useMemo(() => {
    const defaultTags = ['árkérdés', 'kampány lead', 'ajánlatkérés', 'törölt időpont', 'no-show', 'VIP'];
    const tags = new Set<string>(defaultTags);
    clients.forEach(c => {
      const cd = parseCustomData(c.custom_data);
      const clientTags = (cd?.tags as string[]) || [];
      clientTags.forEach(t => tags.add(t));
    });
    return Array.from(tags);
  }, [clients]);

  // Enriched clients for picker
  // Calendar events for Új/Visszatérő/Inaktív detection (same logic as old HTML)
  const { events: calendarEvents } = useCalendarEvents();

  const enrichedClients = useMemo(() => {
    const INACTIVITY_DAYS = 60;
    const now = Date.now();

    // Pre-count appointments per client matching old HTML logic
    function countAppointments(clientName: string, clientEmail: string): number {
      const cN = (clientName || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const cE = (clientEmail || '').toLowerCase().trim();
      let count = 0;
      calendarEvents.forEach((ev) => {
        const eE = (ev.attendee_email || '').toLowerCase().trim();
        const eA = (ev.attendee || '').toLowerCase().trim();
        const eT = (ev.title || '').toLowerCase().trim();
        let match = false;
        if (cE) { if (eE && cE === eE) match = true; if (eA && eA.includes(cE)) match = true; }
        if (cN) { if (eA && eA.includes(cN)) match = true; if (eT && eT.includes(cN)) match = true; }
        if (match) count++;
      });
      return count;
    }

    return clients.map(c => {
      const cd = parseCustomData(c.custom_data);
      const name = bestClientName(c) || c.name || 'Névtelen';
      const email = (cd?.email as string) || c.email || '';
      const phone = (cd?.telefonszam as string) || (cd?.phone as string) || c.phone || '';
      const tags: string[] = (cd?.tags as string[]) || [];
      
      // Determine client type matching old HTML logic exactly:
      // - aptCount > 1 → VISSZATÉRŐ
      // - daysSince > INACTIVITY_DAYS && no appointments → INAKTÍV
      // - else → ÚJ ÜGYFÉL
      const createdAt = c.created_at ? new Date(c.created_at).getTime() : 0;
      const daysSinceCreated = createdAt ? (now - createdAt) / (1000 * 60 * 60 * 24) : 999;
      const aptCount = countAppointments(name, email);
      
      let clientType: 'new' | 'returning' | 'inactive' = 'new';
      if (daysSinceCreated > INACTIVITY_DAYS && aptCount === 0) {
        clientType = 'inactive';
      } else if (aptCount > 1) {
        clientType = 'returning';
      }
      
      return { id: String(c.id), name, email, phone, tags, clientType };
    });
  }, [clients, calendarEvents]);

  // Filtered client list for picker
  const filteredPickerClients = useMemo(() => {
    let list = enrichedClients;
    if (clientSearch) {
      const q = clientSearch.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.includes(q));
    }
    return list;
  }, [enrichedClients, clientSearch]);

  // Apply status/tag filter to auto-select clients
  const applyStatusFilter = useCallback((status: string) => {
    setStatusFilters(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  }, []);

  const applyTagFilter = useCallback((tag: string) => {
    setTagFilters(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  }, []);

  // Status label → clientType mapping
  const STATUS_MAP: Record<string, string> = {
    'Új ügyfél': 'new',
    'Visszatérő': 'returning',
    'Inaktív': 'inactive',
  };

  // Auto-select based on filters
  useEffect(() => {
    if (statusFilters.size === 0 && tagFilters.size === 0) {
      setSelectedClientIds(new Set());
      return;
    }
    const matching = new Set<string>();
    enrichedClients.forEach(c => {
      let matchesStatus = true;
      let matchesTag = true;
      
      if (statusFilters.size > 0) {
        matchesStatus = Array.from(statusFilters).some(sf => STATUS_MAP[sf] === c.clientType);
      }
      if (tagFilters.size > 0) {
        matchesTag = c.tags.some(t => tagFilters.has(t));
      }
      
      // If both filters active, client must match at least one
      if (statusFilters.size > 0 && tagFilters.size > 0) {
        if (matchesStatus || matchesTag) matching.add(c.id);
      } else if (statusFilters.size > 0) {
        if (matchesStatus) matching.add(c.id);
      } else if (tagFilters.size > 0) {
        if (matchesTag) matching.add(c.id);
      }
    });
    setSelectedClientIds(matching);
  }, [tagFilters, statusFilters, enrichedClients]);

  const toggleClient = useCallback((id: string) => {
    setSelectedClientIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllClients = useCallback(() => {
    setSelectedClientIds(new Set(filteredPickerClients.map(c => c.id)));
  }, [filteredPickerClients]);

  const deselectAllClients = useCallback(() => {
    setSelectedClientIds(new Set());
  }, []);

  const toggleChannel = useCallback((ch: string) => {
    setSelectedChannels(prev => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
  }, []);

  // Rich text toolbar actions
  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  }, []);

  // Word count
  const wordCount = useMemo(() => {
    if (messageMode === 'manual') {
      // Strip HTML tags to get plain text from messageContent state
      const text = messageContent.replace(/<[^>]*>/g, ' ').trim();
      return text ? text.split(/\s+/).length : 0;
    }
    return aiResult.trim() ? aiResult.trim().split(/\s+/).length : 0;
  }, [messageContent, aiResult, messageMode]);

  // AI generate
  const generateAiMessage = useCallback(async () => {
    setAiGenerating(true);
    try {
      const res = await authFetch('/admin/api/campaigns/generate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: aiStyle, campaign_name: campaignName, channels: Array.from(selectedChannels) }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiResult(data.message || 'Kedves Ügyfelünk! Örömmel értesítjük, hogy...');
      } else {
        // Fallback demo message
        const demos: Record<string, string> = {
          hivatalos: 'Tisztelt Ügyfelünk!\n\nTisztelettel értesítjük, hogy klinikánk új szolgáltatásokat indított. Kérjük, látogasson el weboldalunkra a részletekért.\n\nÜdvözlettel,\nA csapat',
          barátságos: 'Szia! 😊\n\nRemek hírünk van! Új szolgáltatásainkkal még jobbá tesszük az élményt. Nézd meg, mit készítettünk neked!\n\nÜdv,\nA csapat',
          akciós: '🔥 KÜLÖNLEGES AJÁNLAT! 🔥\n\nCsak korlátozott ideig: 20% kedvezmény minden szolgáltatásunkra! Ne hagyd ki ezt a lehetőséget!\n\nFoglalj most!',
          személyes: 'Kedves Barátunk!\n\nSzemélyesen szeretnénk meghívni téged, hogy próbáld ki legújabb szolgáltatásainkat. Rád szabott ajánlattal várunk!\n\nSzeretettel,\nA csapat',
        };
        setAiResult(demos[aiStyle] || demos.barátságos);
      }
    } catch {
      setAiResult('Kedves Ügyfelünk!\n\nÖrömmel értesítjük, hogy új lehetőségek várják Önt klinikánkon. Foglaljon időpontot most!');
    } finally {
      setAiGenerating(false);
    }
  }, [aiStyle, campaignName, selectedChannels]);

  // Create campaign
  const handleCreate = useCallback(async () => {
    if (!campaignName.trim()) {
      showToast('A kampány neve kötelező!', 'error');
      return;
    }
    const content = messageMode === 'manual'
      ? (editorRef.current?.innerHTML || messageContent)
      : aiResult;

    try {
      const res = await authFetch('/admin/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName.trim(),
          channels: Array.from(selectedChannels),
          content,
          client_ids: Array.from(selectedClientIds).map(Number).filter(n => !isNaN(n)),
        }),
      });
      if (res.ok) {
        showToast('Kampány létrehozva!');
        onCreated();
        onClose();
      } else {
        showToast('Hiba a kampány létrehozásakor', 'error');
      }
    } catch {
      showToast('Hiba a kampány létrehozásakor', 'error');
    }
  }, [campaignName, selectedChannels, messageMode, messageContent, aiResult, selectedClientIds, onCreated, onClose]);

  // Navigation
  const nextStep = () => { if (step < 3) setStep(step + 1); };
  const prevStep = () => { if (step > 1) setStep(step - 1); };

  const hideTip = (idx: number) => {
    setTipVisible(prev => { const next = [...prev]; next[idx] = false; return next; });
  };

  // Tag colors
  const TAG_COLORS: Record<string, string> = {
    'árkérdés': '#ef4444', 'kampány lead': '#22c55e', 'ajánlatkérés': '#f59e0b',
    'törölt időpont': '#8b5cf6', 'no-show': '#ec4899', 'VIP': '#6366f1',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ width: 640, maxWidth: '92vw', padding: 0, overflow: 'hidden', borderRadius: 22, border: 'none', boxShadow: '0 32px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(28,238,224,0.08)', background: 'var(--card)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header with stepper */}
        <div style={{ background: 'var(--card)', padding: '24px 28px 6px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 6, background: 'linear-gradient(135deg, #1ceee0, #0bbdb1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg fill="none" stroke="#082432" strokeWidth="2.5" viewBox="0 0 24 24" style={{ width: 20, height: 20 }}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Új kampány</h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Hozz létre profi kampányokat - pár kattintással.</div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>✕</button>
          </div>

          {/* Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 20, gap: 0, padding: '0 4px' }}>
            {[1, 2, 3].map(s => (
              <React.Fragment key={s}>
                {s > 1 && (
                  <div style={{ flex: 1, height: 3, background: step > s - 1 ? 'var(--accent)' : 'var(--border)', transition: 'all 0.3s', borderRadius: 2 }} />
                )}
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', fontSize: 13, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.3s',
                  ...(step > s
                    ? { background: 'var(--accent)', color: '#082432', boxShadow: '0 2px 8px rgba(28,238,224,0.35)' }
                    : step === s
                      ? { background: 'var(--accent)', color: '#082432', boxShadow: '0 2px 8px rgba(28,238,224,0.35)' }
                      : { background: 'var(--card)', border: '2.5px solid var(--border)', color: 'var(--text-muted)' }
                  ),
                }}>
                  {step > s ? '✓' : s}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 28, minHeight: 260, maxHeight: '55vh', overflowY: 'auto' }}>

          {/* Tip box */}
          {tipVisible[step - 1] && (
            <div className="camp-tip-box" style={{ position: 'relative' }}>
              <div className="camp-tip-title">{STEP_TIPS[step - 1].title}</div>
              <div className="camp-tip-text">{STEP_TIPS[step - 1].text}</div>
              <button className="camp-tip-close" onClick={() => hideTip(step - 1)}>✕</button>
            </div>
          )}

          {/* STEP 1: Célcsoport */}
          {step === 1 && (
            <div>
              <div className="camp-content-card">
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 20, letterSpacing: 0.2 }}>CÉLCSOPORT</div>

                {/* Status badges */}
                <div style={{ marginBottom: 24 }}>
                  <div className="camp-section-title">
                    <div className="camp-section-icon">
                      <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" style={{width:16,height:16}}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    </div>
                    Kiválasztás ügyfélstátusz szerint
                  </div>
                  <div className="camp-status-badges">
                    {['Új ügyfél', 'Visszatérő', 'Inaktív'].map(s => (
                      <button key={s} className={`camp-status-badge ${statusFilters.has(s) ? 'active' : ''}`} onClick={() => applyStatusFilter(s)}>{s}</button>
                    ))}
                  </div>
                </div>

                {/* Tag badges */}
                <div style={{ marginBottom: 20 }}>
                  <div className="camp-section-title">
                    <div className="camp-section-icon">
                      <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" style={{width:16,height:16}}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                    </div>
                    Kiválasztás címkék szerint
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {allTags.length === 0 ? (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nincsenek elérhető címkék</span>
                    ) : allTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => applyTagFilter(tag)}
                        style={{
                          padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          border: tagFilters.has(tag) ? '1.5px solid var(--accent)' : '1px solid transparent',
                          background: TAG_COLORS[tag] ? `${TAG_COLORS[tag]}20` : 'rgba(107,139,153,0.1)',
                          color: TAG_COLORS[tag] || 'var(--text-muted)',
                          fontFamily: 'inherit',
                        }}
                      >{tag}</button>
                    ))}
                  </div>
                </div>

                {/* Client list link */}
                <div style={{ marginBottom: 16 }}>
                  <div className="camp-section-title">
                    <div className="camp-section-icon">
                      <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" style={{width:16,height:16}}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    </div>
                    Kiválasztás ügyféllistából
                  </div>
                  <a className="camp-client-link" onClick={() => { onClose(); window.location.hash = '#/clients'; }}>
                    Ugrás ügyféllistára
                    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{width:14,height:14}}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  </a>
                </div>

                {/* Client picker */}
                <div
                  onClick={() => setPickerOpen(!pickerOpen)}
                  style={{
                    background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 6,
                    padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                    cursor: 'pointer', transition: 'all 0.25s', marginBottom: 8,
                    ...(pickerOpen ? { borderColor: 'var(--accent)' } : {}),
                  }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(28,238,224,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24" style={{width:18,height:18}}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{selectedClientIds.size} ügyfél kiválasztva</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Kattints ide az ügyfelek kiválasztásához</div>
                  </div>
                  <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" width="18" height="18" style={{ flexShrink: 0, transition: 'transform 0.3s', transform: pickerOpen ? 'rotate(180deg)' : 'none' }}><path d="M6 9l6 6 6-6"/></svg>
                </div>

                {/* Picker panel */}
                <div style={{ maxHeight: pickerOpen ? 300 : 0, overflow: 'hidden', transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1)', borderRadius: '0 0 12px 12px', background: 'var(--card)' }}>
                  <div style={{ padding: '16px 16px 12px' }}>
                    <input
                      type="text" value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                      placeholder="Ügyfél keresése név, email vagy telefon alapján..."
                      style={{ width: '100%', padding: '10px 14px', background: 'var(--bg)', color: 'var(--text)', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 12 }}>
                      <button onClick={selectAllClients} style={{ background: 'rgba(28,238,224,0.06)', color: 'var(--accent)', border: '1px solid rgba(28,238,224,0.2)', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Összes kijelölése</button>
                      <button onClick={deselectAllClients} style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Összes törlése</button>
                      <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{selectedClientIds.size} / {filteredPickerClients.length} kijelölve</div>
                    </div>
                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)' }}>
                      {filteredPickerClients.length === 0 ? (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nincs találat</div>
                      ) : filteredPickerClients.map(c => (
                        <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                          <input type="checkbox" checked={selectedClientIds.has(c.id)} onChange={() => toggleClient(c.id)} style={{ accentColor: '#1ceee0', width: 16, height: 16, cursor: 'pointer' }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{c.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.email || c.phone || `ID: ${c.id}`}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Beállítások */}
          {step === 2 && (
            <div>
              <div className="camp-content-card" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16, letterSpacing: 0.2 }}>KAMPÁNY NEVE</div>
                <input
                  type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)}
                  placeholder="Pl. Tavaszi akció - 10% kedvezmény"
                  style={{ width: '100%', padding: '14px 16px', background: 'var(--bg)', color: 'var(--text)', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
              <div className="camp-content-card">
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16, letterSpacing: 0.2 }}>CSATORNA</div>
                <div className="camp-channel-grid">
                  {CHANNELS.map(ch => (
                    <button
                      key={ch.key}
                      className={`camp-channel-card ${selectedChannels.has(ch.key) ? 'active' : ''}`}
                      onClick={() => toggleChannel(ch.key)}
                    >
                      <div className="camp-channel-icon" style={{ background: ch.bgColor }}>{ch.icon}</div>
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Üzenet */}
          {step === 3 && (
            <div>
              {/* Mode toggle */}
              <div style={{ marginBottom: 6 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Üzenetírás módja</label>
                <div className="camp-mode-toggle">
                  <button className={`camp-mode-btn ${messageMode === 'manual' ? 'active' : ''}`} onClick={() => setMessageMode('manual')}>✏️ Szabadkéz</button>
                  <button className={`camp-mode-btn ${messageMode === 'ai' ? 'active' : ''}`} onClick={() => setMessageMode('ai')}>✨ AI varázsló</button>
                </div>
              </div>

              {/* Manual mode */}
              {messageMode === 'manual' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Kampányüzenet szövege</label>
                  <div className="camp-quill-wrap">
                    {/* Simple toolbar */}
                    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)', padding: '8px 10px', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select onChange={e => { execCommand('formatBlock', e.target.value); e.target.value = ''; }} style={{ padding: '4px 8px', border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', borderRadius: 6 }}>
                        <option value="">Szöveg</option>
                        <option value="h1">Címsor 1</option>
                        <option value="h2">Címsor 2</option>
                      </select>
                      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
                      <ToolbarBtn label="B" command="bold" onClick={() => execCommand('bold')} bold />
                      <ToolbarBtn label="I" command="italic" onClick={() => execCommand('italic')} italic />
                      <ToolbarBtn label="U" command="underline" onClick={() => execCommand('underline')} />
                      <ToolbarBtn label="S" command="strikeThrough" onClick={() => execCommand('strikeThrough')} strike />
                      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
                      <ToolbarBtn label="A" command="foreColor" onClick={() => {}} sup="▲" />
                      <ToolbarBtn label="A" command="hiliteColor" onClick={() => {}} sup="■" />
                      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
                      <button onClick={() => execCommand('insertOrderedList')} style={tbStyle} title="Számozott lista">
                        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                      </button>
                      <button onClick={() => execCommand('insertUnorderedList')} style={tbStyle} title="Felsorolás">
                        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                      </button>
                      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
                      <button onClick={() => { const url = prompt('Link URL:'); if (url) execCommand('createLink', url); }} style={tbStyle} title="Link">
                        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                      </button>
                      <button onClick={() => execCommand('formatBlock', 'blockquote')} style={tbStyle} title="Idézet">
                        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M6 17h3l2-4V7H5v6h3M14 17h3l2-4V7h-6v6h3"/></svg>
                      </button>
                      <button onClick={() => execCommand('removeFormat')} style={tbStyle} title="Formázás törlése">
                        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M17 10H3M21 6H3M21 14H3M17 18H3"/></svg>
                      </button>
                    </div>
                    {/* Editor */}
                    <div
                      ref={editorRef}
                      contentEditable
                      onInput={() => setMessageContent(editorRef.current?.innerHTML || '')}
                      style={{ minHeight: 180, maxHeight: 280, overflowY: 'auto', padding: 16, fontSize: 13, lineHeight: 1.7, color: 'var(--text)', outline: 'none' }}
                      data-placeholder="Írj formázott kampány tartalmat... Címsorok, linkek, listák, félkövér szöveg."
                    />
                    {/* Word count footer */}
                    <div className="camp-quill-word-count">
                      <div className="camp-quill-hints">
                        <span className="camp-quill-hint">
                          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                          Link = kattintás tracking
                        </span>
                        <span className="camp-quill-hint">
                          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16m-7 6h7"/></svg>
                          CTA gomb növeli a konverziót
                        </span>
                      </div>
                      <span className="camp-quill-count">{wordCount} szó</span>
                    </div>
                  </div>
                </div>
              )}

              {/* AI mode */}
              {messageMode === 'ai' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Kampány tartalma</label>
                  {/* AI editor area */}
                  <div className="camp-quill-wrap" style={{ marginBottom: 16 }}>
                    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)', padding: '8px 10px', display: 'flex', gap: 2, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 8px' }}>Szöveg</span>
                      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
                      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>B I U S</span>
                    </div>
                    <textarea
                      value={aiResult}
                      onChange={e => setAiResult(e.target.value)}
                      placeholder="Szerkeszd a kampány tartalmát formázottan..."
                      style={{ width: '100%', minHeight: 160, border: 'none', padding: 16, fontSize: 13, lineHeight: 1.7, color: 'var(--text)', background: 'transparent', fontFamily: 'inherit', resize: 'none', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* AI Wizard Card */}
                  <div style={{ background: 'linear-gradient(135deg, rgba(28,238,224,0.04), rgba(59,130,246,0.04))', border: '1.5px solid var(--border)', borderRadius: 6, padding: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <span style={{ fontSize: 16 }}>✨</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>AI Kampány Varázsló</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg)', padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>Gemini AI</span>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Stílus / Hangnem</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
                        {AI_STYLES.map(s => (
                          <button
                            key={s.key}
                            onClick={() => setAiStyle(s.key)}
                            style={{
                              padding: '8px 4px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              border: aiStyle === s.key ? '1px solid var(--accent)' : '1px solid var(--border)',
                              background: aiStyle === s.key ? 'rgba(28,238,224,0.1)' : 'var(--bg)',
                              color: aiStyle === s.key ? 'var(--accent)' : 'var(--text)',
                              transition: 'all 0.2s', textAlign: 'center', fontFamily: 'inherit',
                            }}
                          >{s.label}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        onClick={generateAiMessage}
                        disabled={aiGenerating}
                        style={{ background: 'linear-gradient(135deg, #1ceee0, #0bbdb1)', color: '#082432', border: 'none', padding: '9px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: aiGenerating ? 0.6 : 1 }}
                      >
                        {aiGenerating ? '⏳ Generálás...' : '✨ Generálás'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 28px 20px', display: 'flex', gap: 12, alignItems: 'center', borderTop: '1px solid var(--border)' }}>
          {step > 1 && (
            <button onClick={prevStep} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Előző</button>
          )}
          <div style={{ flex: 1 }} />
          {step < 3 && (
            <button onClick={nextStep} style={{ background: '#0d2538', color: '#fff', border: 'none', padding: '10px 28px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>Következő</button>
          )}
          {step === 3 && (
            <button onClick={handleCreate} style={{ background: 'linear-gradient(135deg, #1ceee0, #0bbdb1)', color: '#082432', border: 'none', padding: '10px 28px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(28,238,224,0.25)' }}>Létrehozás</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Toolbar button helper ──
const tbStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
  color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'center', transition: 'all 0.15s', fontFamily: 'inherit',
};

function ToolbarBtn({ label, onClick, bold, italic, strike, sup }: { label: string; command: string; onClick: () => void; bold?: boolean; italic?: boolean; strike?: boolean; sup?: string }) {
  return (
    <button onClick={onClick} style={{ ...tbStyle, fontWeight: bold ? 700 : 400, fontStyle: italic ? 'italic' : 'normal', textDecoration: strike ? 'line-through' : 'none', fontSize: 14, position: 'relative' }} title={label}>
      {label}
      {sup && <span style={{ position: 'absolute', top: 2, right: 2, fontSize: 6, color: 'var(--text-dim)' }}>{sup}</span>}
    </button>
  );
}

