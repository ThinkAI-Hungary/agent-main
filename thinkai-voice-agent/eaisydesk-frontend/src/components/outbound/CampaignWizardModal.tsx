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
  { title: 'CÉLCSOPORT KIVÁLASZTÁSA', text: 'Válaszd ki a kampány célcsoportját ügyfélstátusz, címkék vagy egyedi kijelölés alapján. A pontos célzás segít, hogy a megfelelő ügyfelekhez a megfelelő üzenet jusson el.' },
  { title: 'KAMPÁNY BEÁLLÍTÁSAI', text: 'Ebben a lépésben beállíthatod a kampány nevét és a használt csatornákat. Érdemes egyértelmű nevet adni, amiről később könnyen beazonosítod a kampányt és olyan csatornát választani, amely legjobban illik a célcsoporthoz és a tervezett üzenet stílusához és terjedelméhez.' },
  { title: 'KAMPÁNYÜZENET', text: 'Írd meg az üzenetet szabadon vagy használd az AI szövegvarázslót. A Rich Text szerkesztővel formázott, professzionális üzeneteket hozhatsz létre.' },
];

const AI_STYLES = [
  { key: 'hivatalos', label: 'Hivatalos' },
  { key: 'barátságos', label: 'Barátságos' },
  { key: 'akciós', label: 'Akciós' },
  { key: 'személyes', label: 'Személyes' },
];

export default function CampaignWizardModal({ onClose, onCreated, initialSelectedIds }: Props) {
  const navigate = useNavigate();
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
  const selectedChannels = new Set(['email']);

  // Step 3 state
  const [messageMode, setMessageMode] = useState<'manual' | 'ai'>('manual');
  const [messageContent, setMessageContent] = useState('');
  const [aiStyle, setAiStyle] = useState('barátságos');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});

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
    editorRef.current?.focus();
    updateFormatState();
  }, [updateFormatState]);

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
      const res = await authFetch('/admin/api/campaigns/generate_message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: aiStyle, brief: aiPrompt.trim(), campaign_name: campaignName, channel: Array.from(selectedChannels)[0] || 'email' }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiResult(data.message || '');
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
          ai_instructions: content,
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
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="camp-wizard-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with stepper */}
        <div className="camp-wizard-header">
          <div className="flex-between">
            <div className="flex-row gap-12">
              <div className="camp-header-icon">
                <svg fill="none" stroke="#082432" strokeWidth="2.5" viewBox="0 0 24 24" className="camp-header-svg"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
              </div>
              <div>
                <h3 className="camp-header-title">Új kampány</h3>
              </div>
            </div>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>

          {/* Stepper */}
          <div className="flex-row camp-wizard-stepper">
            {[1, 2, 3].map(s => (
              <React.Fragment key={s}>
                {s > 1 && (
                  <div className={`camp-step-connector ${step > s - 1 ? 'camp-step-connector--active' : ''}`} />
                )}
                <div className={`camp-step-dot ${step > s ? 'camp-step-dot--done' : step === s ? 'camp-step-dot--active' : 'camp-step-dot--idle'}`}>
                  {step > s ? '✓' : s}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="camp-wizard-body">

          {/* Tip box */}
          {tipVisible[step - 1] && (
            <div className="camp-tip-box">
              <div className="camp-tip-title">{STEP_TIPS[step - 1].title}</div>
              <div className="camp-tip-text">{STEP_TIPS[step - 1].text}</div>
              <button className="camp-tip-close" onClick={() => hideTip(step - 1)}>✕</button>
            </div>
          )}

          {/* STEP 1: Célcsoport */}
          {step === 1 && (
            <div>
              <div className="camp-content-card">
                <div className="camp-section-title-text">CÉLCSOPORT</div>

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

            </div>
          )}

          {/* STEP 3: Üzenet */}
          {step === 3 && (
            <div>
              {/* Mode toggle */}
              <div className="mb-6">
                <label className="camp-field-label camp-field-label--mb10">Üzenetírás módja</label>
                <div className="camp-mode-toggle">
                  <button className={`camp-mode-btn ${messageMode === 'manual' ? 'active' : ''}`} onClick={() => setMessageMode('manual')}>Saját szöveg</button>
                  <button className={`camp-mode-btn ${messageMode === 'ai' ? 'active' : ''}`} onClick={() => setMessageMode('ai')}>AI varázsló</button>
                </div>
              </div>

              {/* Manual mode */}
              {messageMode === 'manual' && (
                <div>
                  <label className="camp-field-label">Kampányüzenet szövege</label>
                  <div className="camp-quill-wrap">
                    {/* Simple toolbar */}
                    <div className="camp-toolbar-strip flex-row flex-wrap gap-2">
                      <select onChange={e => { execCommand('formatBlock', e.target.value); e.target.value = ''; }} className="camp-toolbar-select">
                        <option value="">Szöveg</option>
                        <option value="h1">Címsor 1</option>
                        <option value="h2">Címsor 2</option>
                      </select>
                      <div className="camp-toolbar-sep" />
                      <ToolbarBtn title="Félkövér" onClick={() => execCommand('bold')} active={activeFormats.bold} icon={<svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" /><path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" /></svg>} />
                      <ToolbarBtn title="Dőlt" onClick={() => execCommand('italic')} active={activeFormats.italic} icon={<svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" /></svg>} />
                      <ToolbarBtn title="Aláhúzott" onClick={() => execCommand('underline')} active={activeFormats.underline} icon={<svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><path d="M6 3v7a6 6 0 006 6 6 6 0 006-6V3" /><line x1="4" y1="21" x2="20" y2="21" /></svg>} />
                      <ToolbarBtn title="Áthúzott" onClick={() => execCommand('strikeThrough')} active={activeFormats.strikeThrough} icon={<svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><line x1="5" y1="12" x2="19" y2="12" /><path d="M16 6C16 6 14.5 4 12 4 9.5 4 8 5.5 8 7.5 8 10.5 16 10.5 16 13.5 16 16.5 14.5 18 12 18 9.5 18 8 16 8 16" /></svg>} />
                      <div className="camp-toolbar-sep" />
                      <button onClick={() => execCommand('insertOrderedList')} className={`camp-toolbar-btn ${activeFormats.insertOrderedList ? 'active' : ''}`} title="Számozott lista">
                        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
                      </button>
                      <button onClick={() => execCommand('insertUnorderedList')} className={`camp-toolbar-btn ${activeFormats.insertUnorderedList ? 'active' : ''}`} title="Felsorolásos lista">
                        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                      </button>
                      <div className="camp-toolbar-vsep" />
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
                        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><path d="M6 17h3l2-4V7H5v6h3M14 17h3l2-4V7h-6v6h3"/></svg>
                      </button>
                      <button onClick={() => execCommand('removeFormat')} className="camp-toolbar-btn" title="Formázás törlése">
                        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="svg-14"><path d="M17 10H3M21 6H3M21 14H3M17 18H3"/></svg>
                      </button>
                    </div>
                    {/* Editor */}
                    <div
                      ref={editorRef}
                      contentEditable
                      onInput={() => setMessageContent(editorRef.current?.innerHTML || '')}
                      onKeyUp={updateFormatState}
                      onMouseUp={updateFormatState}
                      onFocus={updateFormatState}
                      className="camp-editor"
                      data-placeholder="Írd ide a kampányüzenet szövegét…"
                    />
                    {/* Word count footer */}
                    <div className="camp-quill-word-count">
                      <div className="camp-quill-hints">
                        <span className="camp-quill-hint">
                          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                          A linkek kattintása mérhető
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
                  <label className="camp-field-label">Kampány tartalma</label>
                  {/* AI editor area */}
                  <div className="camp-quill-wrap mb-16">
                    <div className="camp-ai-toolbar flex-row gap-2">
                      <span className="camp-ai-toolbar-txt">Szöveg</span>
                      <div className="camp-toolbar-sep" />
                      <span className="camp-ai-toolbar-dim">B I U S</span>
                    </div>
                    <textarea
                      value={aiResult}
                      onChange={e => setAiResult(e.target.value)}
                      placeholder="Szerkeszd a kampány tartalmát formázottan..."
                      className="camp-ai-textarea"
                    />
                  </div>

                  {/* AI Wizard Card */}
                  <div className="camp-ai-card">
                    <div className="flex-row gap-8 mb-16">
                      <span className="camp-ai-card-title">AI Kampány Varázsló</span>
                      <span className="camp-ai-badge">Gemini AI</span>
                    </div>

                    {/* Prompt input */}
                    <div className="mb-16">
                      <div className="camp-ai-subsec-title">Miről szóljon a kampány?</div>
                      <textarea
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        placeholder="Pl. 20% akció fogfehérítésre a tavasz alkalmával, említsd meg hogy korlátozott ideig elérhető..."
                        className="camp-ai-prompt"
                        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'}
                      />
                    </div>

                    {/* Style selector */}
                    <div className="mb-16">
                      <div className="camp-ai-subsec-title">Stílus</div>
                      <div className="camp-ai-style-grid">
                        {AI_STYLES.map(s => (
                          <button
                            key={s.key}
                          className={`camp-ai-style-btn ${aiStyle === s.key ? 'camp-ai-style-btn--active' : ''}`}
                          onClick={() => setAiStyle(s.key)}
                          >{s.label}</button>
                        ))}
                      </div>
                    </div>

                    {/* Generate button */}
                    <button
                      onClick={generateAiMessage}
                      disabled={aiGenerating || !aiPrompt.trim()}
                      className={`camp-ai-generate-btn${(aiGenerating || !aiPrompt.trim()) ? ' camp-ai-generate-btn--disabled' : ''}`}
                    >
                      {aiGenerating ? 'Generálás...' : 'Levél generálása'}
                    </button>
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
          <div className="flex-1" />
          {step < 3 && (
            <button className="btn btn-primary" onClick={nextStep}>Következő</button>
          )}
          {step === 3 && (
            <button className="btn btn-primary" onClick={handleCreate}>Létrehozás</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Toolbar button helper ──
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

