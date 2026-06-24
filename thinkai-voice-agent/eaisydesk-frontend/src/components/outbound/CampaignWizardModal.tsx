/**
 * CampaignWizardModal – 3-step campaign creation wizard
 * Port of the legacy HTML campaign modal from page-settings.html
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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



const STEP_TIPS = [
  { title: 'Célcsoport kiválasztása', text: 'Válaszd ki a kampány célcsoportját ügyfélstátusz, címkék vagy egyedi kijelölés alapján. A pontos célzás segít, hogy a megfelelő ügyfelekhez a megfelelő üzenet jusson el.' },
  { title: 'Kampány beállításai', text: 'Ebben a lépésben beállíthatod a kampány nevét és a használt csatornákat. Érdemes egyértelmű nevet adni, amiről később könnyen beazonosítod a kampányt és olyan csatornát választani, amely legjobban illik a célcsoporthoz és a tervezett üzenet stílusához és terjedelméhez.' },
  { title: 'Kampányüzenet', text: 'Írd meg az üzenetet szabadon vagy használd az AI szövegvarázslót. A Rich Text szerkesztővel formázott, professzionális üzeneteket hozhatsz létre.' },
];

const AI_STYLES = [
  { key: 'hivatalos', label: 'Hivatalos' },
  { key: 'barátságos', label: 'Barátságos' },
  { key: 'akciós', label: 'Promóciós' },
  { key: 'személyes', label: 'Személyes' },
];

export default function CampaignWizardModal({ onClose, onCreated, initialSelectedIds }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [tipVisible, setTipVisible] = useState([false, false, false]);

  // Step 1 state
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set());
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set(initialSelectedIds || []));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  // Step 2 state
  const [campaignName, setCampaignName] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set(['E-Mail']));

  // Step 3 state
  const [messageMode, setMessageMode] = useState<'manual' | 'ai'>('manual');
  const [messageSubject, setMessageSubject] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [aiStyle, setAiStyle] = useState('barátságos');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});

  const [stepError, setStepError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const aiEditorRef = useRef<HTMLDivElement>(null);

  // Sync AI result to AI editor when generated
  useEffect(() => {
    if (messageMode === 'ai' && aiEditorRef.current && aiResult !== aiEditorRef.current.innerHTML) {
      aiEditorRef.current.innerHTML = aiResult;
    }
  }, [aiResult, messageMode]);

  // Clear error on input change
  useEffect(() => { setStepError(''); }, [selectedClientIds, step]);
  useEffect(() => { setStepError(''); }, [campaignName]);
  useEffect(() => { setStepError(''); }, [messageSubject, messageContent, aiResult]);

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
    setStatusFilters(new Set());
    setTagFilters(new Set());
  }, []);

  // Rich text toolbar actions
  const updateFormatState = useCallback(() => {
    if (!editorRef.current) return;
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
      blockquote: document.queryCommandValue('formatBlock') === 'blockquote',
    });
  }, []);

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    if (messageMode === 'manual') {
      editorRef.current?.focus();
    } else {
      aiEditorRef.current?.focus();
    }
    updateFormatState();
  }, [updateFormatState, messageMode]);

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
    if (!aiPrompt.trim()) {
      showToast('Írd le, miről szóljon a kampány!', 'error');
      return;
    }
    setAiGenerating(true);
    try {
      const rawChannel = (Array.from(selectedChannels)[0] as string) || 'email';
      const cleanChannel = rawChannel.toLowerCase().trim() === 'e-mail' ? 'email' : rawChannel.toLowerCase().trim();
      
      const res = await authFetch('/admin/api/campaigns/generate_message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: aiStyle, brief: aiPrompt.trim(), campaign_name: campaignName, channel: cleanChannel }),
      });
      if (res.ok) {
        const data = await res.json();
        let msg = data.message || '';
        while (msg.startsWith('SUBJECT:')) {
          const pipeIdx = msg.indexOf('|');
          if (pipeIdx >= 0) {
            msg = msg.substring(pipeIdx + 1);
          } else {
            break;
          }
        }
        setAiResult(msg);
        if (data.subject) setMessageSubject(data.subject);
      } else {
        showToast('Hiba a generálásnál, próbáld újra', 'error');
      }
    } catch {
      showToast('Hiba a generálásnál', 'error');
    } finally {
      setAiGenerating(false);
    }
  }, [aiStyle, aiPrompt, campaignName, selectedChannels]);

  // Create campaign
  const handleCreate = useCallback(async () => {
    if (!messageSubject.trim()) {
      setStepError('Az üzenet tárgyának megadása kötelező!');
      return;
    }

    const content = messageMode === 'manual'
      ? (editorRef.current?.innerHTML || messageContent)
      : (aiEditorRef.current?.innerHTML || aiResult);

    const cleanContent = content.replace(/<[^>]*>?/gm, '').trim();
    if (!cleanContent) {
      setStepError('Az üzenet szövegének megadása kötelező!');
      return;
    }

    try {
      setIsCreating(true);
      const cleanChannels = Array.from(selectedChannels).map(ch => {
        const low = (ch as string).toLowerCase().trim();
        return low === 'e-mail' ? 'email' : low;
      });
      const res = await authFetch('/admin/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName.trim(),
          channels: cleanChannels,
          ai_instructions: content,
          subject: messageSubject.trim(),
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
    } finally {
      setIsCreating(false);
    }
  }, [campaignName, selectedChannels, messageMode, messageContent, aiResult, selectedClientIds, onCreated, onClose]);

  // Navigation
  const nextStep = () => {
    if (step === 1 && selectedClientIds.size === 0) {
      setStepError('Kérlek válassz ki legalább egy ügyfelet a folytatáshoz!');
      return;
    }
    if (step === 2 && !campaignName.trim()) {
      setStepError('Kérlek adj meg egy nevet a kampánynak!');
      return;
    }
    setStepError('');
    if (step < 3) setStep(step + 1); 
  };
  const prevStep = () => {
    setStepError('');
    if (step > 1) setStep(step - 1); 
  };

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
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="camp-wizard-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with Step Info */}
        <div className="camp-wizard-header" style={{ paddingBottom: '16px' }}>
          <div className="flex-between mb-20">
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Új kampány
            </div>
            <button className="modal-close" onClick={onClose} style={{ top: 0, position: 'relative' }}>
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="22" height="22">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="flex-row items-center gap-16">
            <div style={{ 
              width: '42px', height: '42px', borderRadius: '50%', background: 'var(--accent)', 
              color: '#082432', display: 'flex', alignItems: 'center', justifyContent: 'center', 
              fontSize: '18px', fontWeight: 700 
            }}>
              {step}
            </div>
            <h3 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              {STEP_TIPS[step - 1].title}
            </h3>
            <button 
              onClick={() => {
                setTipVisible(prev => {
                  const next = [...prev];
                  next[step - 1] = !next[step - 1];
                  return next;
                });
              }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
              title="Információ megjelenítése"
            >
              <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" width="22" height="22">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4 M12 8h.01" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="camp-wizard-body" style={{ paddingTop: '20px', minHeight: '300px', display: 'flex', flexDirection: 'column' }}>

          {/* Expanded Info Box */}
          {tipVisible[step - 1] && (
            <div style={{
              background: 'rgba(28, 238, 224, 0.04)',
              border: '1px solid rgba(28, 238, 224, 0.2)',
              borderRadius: '8px',
              padding: '14px 18px',
              marginBottom: '24px',
              color: 'var(--text-muted)',
              fontSize: '13px',
              lineHeight: '1.6'
            }}>
              {STEP_TIPS[step - 1].text}
            </div>
          )}

          {/* STEP 1: Célcsoport */}
          {step === 1 && (
            <div>
              <div className="camp-content-card">

                {/* Status badges */}
                <div className="mb-24">
                  <div className="camp-section-title">
                    <div className="camp-section-icon">
                      <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" className="svg-16"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
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
                <div className="mb-20">
                  <div className="camp-section-title">
                    <div className="camp-section-icon">
                      <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" className="svg-16"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                    </div>
                    Kiválasztás címkék szerint
                  </div>
                  <div className="flex-row flex-wrap gap-8">
                    {allTags.length === 0 ? (
                      <span className="camp-no-tags">Nincsenek elérhető címkék</span>
                    ) : allTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => applyTagFilter(tag)}
                        className={`camp-tag-btn ${tagFilters.has(tag) ? 'active' : ''}`}
                        style={{
                          background: TAG_COLORS[tag] ? `${TAG_COLORS[tag]}20` : 'rgba(107,139,153,0.1)',
                          color: TAG_COLORS[tag] || 'var(--text-muted)',
                        }}
                      >{tag}</button>
                    ))}
                  </div>
                </div>

                {/* Client list link */}
                <div className="mb-16">
                  <div className="camp-section-title">
                    <div className="camp-section-icon">
                      <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" className="svg-16"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    </div>
                    Kiválasztás ügyféllistából
                  </div>
                  <a className="camp-client-link" onClick={() => { onClose(); navigate('/clients'); }}>
                    Ugrás ügyféllistára
                      <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  </a>
                </div>

                {/* Client picker */}
                <div
                  className={`camp-picker-trigger ${pickerOpen ? 'active' : ''}`}
                  onClick={() => setPickerOpen(!pickerOpen)}
                >
                  <div className="camp-picker-icon">
                    <svg fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24" className="svg-18"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="camp-picker-clients-text">{selectedClientIds.size} ügyfél kiválasztva</div>
                    <div className="camp-picker-sub-text">Kattints ide az ügyfelek kiválasztásához</div>
                  </div>
                  <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" width="18" height="18" className={`camp-picker-chevron ${pickerOpen ? 'rotated' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
                </div>

                {/* Picker panel */}
                <div className={`camp-picker-panel ${pickerOpen ? 'camp-picker-panel--open' : ''}`}>
                  <div className="camp-picker-inner">
                    <input
                      type="text" value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                      placeholder="Ügyfél keresése név, email vagy telefon alapján..."
                      className="camp-picker-search"
                    />
                    <div className="flex-row gap-8 camp-picker-controls">
                      <button onClick={selectAllClients} className="camp-picker-btn-select">Összes kijelölése</button>
                      <button onClick={deselectAllClients} className="camp-picker-btn-deselect">Összes törlése</button>
                      <div className="camp-picker-count">{selectedClientIds.size} / {filteredPickerClients.length} kijelölve</div>
                    </div>
                    <div className="camp-picker-list">
                      {filteredPickerClients.length === 0 ? (
                        <div className="camp-picker-empty">Nincs találat</div>
                      ) : filteredPickerClients.map(c => (
                        <label key={c.id} className={`camp-picker-item ${selectedClientIds.has(c.id) ? 'selected' : ''}`}>
                          <input type="checkbox" checked={selectedClientIds.has(c.id)} onChange={() => toggleClient(c.id)} className="camp-picker-checkbox" />
                          <div className="flex-1 min-w-0">
                            <div className="camp-client-name">{c.name}</div>
                            <div className="camp-client-email">{c.email || c.phone || `ID: ${c.id}`}</div>
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
              <div className="camp-content-card mb-16">
                <div className="camp-name-section-label">KAMPÁNY NEVE</div>
                <input
                  type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)}
                  placeholder="Pl. Tavaszi akció - 10% kedvezmény"
                  className="camp-name-input"
                />
              </div>

              {/* CHANNELS CARD */}
              <div className="camp-content-card">
                <div className="camp-name-section-label">CSATORNA KIVÁLASZTÁSA</div>
                <div className="flex-row flex-wrap gap-12 mt-12" style={{ marginBottom: 0 }}>
                  {['E-Mail', 'Telefon', 'SMS'].map(ch => {
                    const isActive = selectedChannels.has(ch);
                    return (
                      <button
                        key={ch}
                        onClick={() => {
                          const next = new Set(selectedChannels);
                          if (isActive) {
                            if (next.size > 1) next.delete(ch);
                          } else {
                            next.add(ch);
                          }
                          setSelectedChannels(next);
                        }}
                        style={{
                          flex: '1 1 calc(33.333% - 12px)',
                          minWidth: '120px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '16px 20px',
                          borderRadius: '12px',
                          border: isActive ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                          background: isActive ? 'rgba(28,238,224,0.06)' : 'var(--bg)',
                          color: 'var(--text)',
                          fontWeight: 700,
                          fontSize: '13px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: isActive ? '0 4px 12px rgba(28,238,224,0.1)' : 'none'
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.borderColor = 'var(--text-muted)';
                            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.background = 'var(--bg)';
                          }
                        }}
                      >
                        {ch}
                      </button>
                    )
                  })}
                </div>
              </div>

            </div>
          )}

          {/* STEP 3: Üzenet */}
          {step === 3 && (
            <div>
              {/* Mode toggle for Step 3 floating above card */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px', marginTop: '-12px', position: 'relative', zIndex: 10 }}>
                <div style={{ display: 'flex', background: '#f5f7f9', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <button 
                    onClick={() => setMessageMode('manual')}
                    style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: messageMode === 'manual' ? '#146f90' : 'transparent', color: messageMode === 'manual' ? '#fff' : '#6b8b99', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                  >
                    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    Saját szöveg
                  </button>
                  <button 
                    onClick={() => setMessageMode('ai')}
                    style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: messageMode === 'ai' ? '#146f90' : 'transparent', color: messageMode === 'ai' ? '#fff' : '#6b8b99', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                  >
                    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16"><path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
                    AI varázsló
                  </button>
                </div>
              </div>

              {/* Manual mode */}
              {messageMode === 'manual' && (
                <div style={{ background: '#f5f7f9', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
                  
                  {/* Tárgy */}
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#1a6f8f', marginBottom: '8px' }}>Üzenet tárgya</label>
                    <input 
                      type="text" 
                      placeholder="Ide írd az email tárgyát..." 
                      style={{ width: '100%', padding: '14px 16px', borderRadius: '8px', border: '1px solid #1ceee0', fontSize: '14px', outline: 'none', background: '#fff', color: '#082432' }} 
                      value={messageSubject}
                      onChange={e => setMessageSubject(e.target.value)}
                    />
                  </div>

                  {/* Szöveg */}
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#1a6f8f', marginBottom: '8px' }}>Üzenet szövege</label>
                    <div style={{ borderRadius: '8px', border: '1px solid #1ceee0', overflow: 'hidden', background: '#fff' }}>
                      <EditorToolbar activeFormats={activeFormats} execCommand={execCommand} />
                      {/* Editor */}
                      <div
                        ref={editorRef}
                        contentEditable
                        onInput={() => setMessageContent(editorRef.current?.innerHTML || '')}
                        onKeyUp={updateFormatState}
                        onMouseUp={updateFormatState}
                        onFocus={updateFormatState}
                        className="camp-editor"
                        style={{ minHeight: '280px', padding: '20px', outline: 'none', fontSize: '14px', color: '#082432', lineHeight: '1.6' }}
                        data-placeholder="Ide írd a kampányüzenet szövegét..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* AI mode */}
              {messageMode === 'ai' && (
                <div style={{ background: '#f5f7f9', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
                  
                  {/* Stílus választó */}
                  <div className="mb-24">
                    <label style={{ fontSize: '14px', fontWeight: 700, color: '#1a6f8f', marginBottom: '12px', display: 'block' }}>
                      Kommunikációs stílus
                    </label>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {AI_STYLES.map(s => (
                        <button
                          key={s.key}
                          onClick={() => setAiStyle(s.key)}
                          style={{
                            flex: 1,
                            minWidth: '100px',
                            padding: '10px 16px',
                            borderRadius: '8px',
                            border: aiStyle === s.key ? '1px solid #1ceee0' : '1px solid #e2e8f0',
                            background: aiStyle === s.key ? '#e6fcfb' : 'transparent',
                            color: aiStyle === s.key ? '#082432' : '#6b8b99',
                            fontSize: '13px',
                            fontWeight: aiStyle === s.key ? 700 : 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            textAlign: 'center'
                          }}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tárgy */}
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#1a6f8f', marginBottom: '8px' }}>Üzenet tárgya</label>
                    <input 
                      type="text" 
                      placeholder="A generált tárgysor itt fog megjelenni..." 
                      style={{ width: '100%', padding: '14px 16px', borderRadius: '8px', border: '1px solid #1ceee0', fontSize: '14px', outline: 'none', background: '#fff', color: '#082432' }} 
                      value={messageSubject}
                      onChange={e => setMessageSubject(e.target.value)}
                    />
                  </div>

                  {/* Üzenet szövege */}
                  <div>
                    <label style={{ fontSize: '14px', fontWeight: 700, color: '#1a6f8f', marginBottom: '12px', display: 'block' }}>
                      Üzenet szövege
                    </label>
                    <div style={{ 
                      position: 'relative', 
                      border: '1px solid #1ceee0', 
                      borderRadius: '8px', 
                      overflow: 'hidden', 
                      background: '#fff',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      {!aiResult && !aiGenerating ? (
                        <textarea
                          value={aiPrompt}
                          onChange={e => setAiPrompt(e.target.value)}
                          placeholder="Fogalmazd meg, miről szóljon a kampány..."
                          style={{ 
                            width: '100%', 
                            height: '240px', 
                            padding: '24px', 
                            border: 'none', 
                            resize: 'none', 
                            outline: 'none', 
                            fontSize: '14px', 
                            color: '#082432',
                            lineHeight: '1.6'
                          }}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '240px' }}>
                          <div style={{ opacity: aiGenerating ? 0.4 : 1, pointerEvents: aiGenerating ? 'none' : 'auto', transition: 'all 0.2s' }}>
                            <EditorToolbar activeFormats={activeFormats} execCommand={execCommand} />
                          </div>
                          
                          {/* AI Editor Body */}
                          <div
                            ref={aiEditorRef}
                            contentEditable={!aiGenerating}
                            onInput={() => setAiResult(aiEditorRef.current?.innerHTML || '')}
                            onKeyUp={updateFormatState}
                            onMouseUp={updateFormatState}
                            onFocus={updateFormatState}
                            className="camp-editor"
                            style={{ 
                              flex: 1, 
                              padding: '20px', 
                              outline: 'none', 
                              fontSize: '14px', 
                              color: aiGenerating ? '#9ca3af' : '#082432', 
                              lineHeight: '1.6',
                              opacity: aiGenerating ? 0.6 : 1
                            }}
                          />
                        </div>
                      )}

                      <button 
                        onClick={generateAiMessage}
                        disabled={aiGenerating || (!aiPrompt.trim() && !aiResult)}
                        style={{ 
                          width: '100%', 
                          height: '56px', 
                          background: aiGenerating ? '#8ff2ed' : '#1ceee0', 
                          border: 'none', 
                          borderTop: aiResult || aiGenerating ? '1px solid rgba(28,238,224,0.3)' : 'none',
                          color: '#082432', 
                          fontSize: '15px', 
                          fontWeight: 700, 
                          cursor: (aiGenerating || (!aiPrompt.trim() && !aiResult)) ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          position: 'relative',
                          overflow: 'hidden',
                          transition: 'background 0.2s',
                          opacity: (!aiPrompt.trim() && !aiResult) ? 0.6 : 1
                        }}
                      >
                        <span style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {aiGenerating ? (
                            'Kampányüzenet generálása folyamatban...'
                          ) : aiResult ? (
                            'Új verzió generálása'
                          ) : (
                            'Szöveg generálása'
                          )}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {step > 1 && (
            <button className="btn btn-outline" onClick={prevStep}>Előző</button>
          )}
          
          <div className="flex-1" style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '16px', alignItems: 'center' }}>
            {stepError && (
              <span style={{
                color: '#e11d48',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                animation: 'fadeIn 0.3s ease-out'
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                {stepError}
              </span>
            )}
          </div>

          {step < 3 && (
            <button className="btn btn-primary" onClick={nextStep}>Következő</button>
          )}
          {step === 3 && (
            <button className="btn btn-primary" onClick={handleCreate} disabled={isCreating}>
              {isCreating ? 'Létrehozás...' : 'Létrehozás'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({ icon, title, onClick, active }: { icon: React.ReactNode; title: string; onClick: () => void; active?: boolean }) {
  const classes = [
    'camp-toolbar-btn',
    active ? 'active' : ''
  ].filter(Boolean).join(' ');

  return (
    <button onClick={onClick} className={classes} title={title}>
      {icon}
    </button>
  );
}

function EditorToolbar({ activeFormats, execCommand }: { activeFormats: Record<string, boolean>; execCommand: (cmd: string, val?: string) => void }) {
  return (
    <div className="camp-toolbar-strip flex-row flex-wrap items-center gap-2" style={{ borderBottom: '1px solid rgba(28,238,224,0.3)', padding: '10px 16px', background: '#fff' }}>
      <select onChange={e => { execCommand('formatBlock', e.target.value); e.target.value = ''; }} className="camp-toolbar-select" style={{ border: 'none', outline: 'none', background: 'transparent', color: '#6b8b99', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
        <option value="">Szöveg</option>
        <option value="h1">Címsor 1</option>
        <option value="h2">Címsor 2</option>
      </select>
      <div className="camp-toolbar-sep" style={{ width: '1px', height: '16px', background: '#e2e8f0', margin: '0 8px' }} />
      <ToolbarBtn title="Félkövér" onClick={() => execCommand('bold')} active={activeFormats.bold} icon={<svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" /><path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" /></svg>} />
      <ToolbarBtn title="Dőlt" onClick={() => execCommand('italic')} active={activeFormats.italic} icon={<svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" /></svg>} />
      <ToolbarBtn title="Aláhúzott" onClick={() => execCommand('underline')} active={activeFormats.underline} icon={<svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><path d="M6 3v7a6 6 0 006 6 6 6 0 006-6V3" /><line x1="4" y1="21" x2="20" y2="21" /></svg>} />
      <ToolbarBtn title="Áthúzott" onClick={() => execCommand('strikeThrough')} active={activeFormats.strikeThrough} icon={<svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><line x1="5" y1="12" x2="19" y2="12" /><path d="M16 6C16 6 14.5 4 12 4 9.5 4 8 5.5 8 7.5 8 10.5 16 10.5 16 13.5 16 16.5 14.5 18 12 18 9.5 18 8 16 8 16" /></svg>} />
      <div className="camp-toolbar-sep" style={{ width: '1px', height: '16px', background: '#e2e8f0', margin: '0 8px' }} />
      <button onClick={() => execCommand('insertOrderedList')} className={`camp-toolbar-btn ${activeFormats.insertOrderedList ? 'active' : ''}`} title="Számozott lista">
        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
      </button>
      <button onClick={() => execCommand('insertUnorderedList')} className={`camp-toolbar-btn ${activeFormats.insertUnorderedList ? 'active' : ''}`} title="Felsorolásos lista">
        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
      </button>
      <div className="camp-toolbar-sep" style={{ width: '1px', height: '16px', background: '#e2e8f0', margin: '0 8px' }} />
      <button onClick={() => execCommand('justifyLeft')} className={`camp-toolbar-btn ${activeFormats.justifyLeft ? 'active' : ''}`} title="Balra igazítás">
        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><path d="M3 6h18M3 12h12M3 18h18"/></svg>
      </button>
      <button onClick={() => execCommand('justifyCenter')} className={`camp-toolbar-btn ${activeFormats.justifyCenter ? 'active' : ''}`} title="Középre igazítás">
        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><path d="M3 6h18M6 12h12M3 18h18"/></svg>
      </button>
      <div className="camp-toolbar-sep" style={{ width: '1px', height: '16px', background: '#e2e8f0', margin: '0 8px' }} />
      <button onClick={() => { 
        let url = prompt('Link URL:'); 
        if (url) {
          url = url.trim();
          if (!/^https?:\/\//i.test(url) && !url.startsWith('mailto:') && !url.startsWith('tel:')) {
            url = 'https://' + url;
          }
          execCommand('createLink', url); 
        }
      }} className="camp-toolbar-btn" title="Link">
        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
      </button>
      <button onClick={() => execCommand('formatBlock', 'blockquote')} className={`camp-toolbar-btn ${activeFormats.blockquote ? 'active' : ''}`} title="Idézet">
        <span style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'serif', marginTop: '-4px' }}>”</span>
      </button>
      <button onClick={() => execCommand('removeFormat')} className="camp-toolbar-btn" title="Formázás törlése">
        <span style={{ fontSize: '14px', fontWeight: 600 }}>T</span>
      </button>
    </div>
  );
}

