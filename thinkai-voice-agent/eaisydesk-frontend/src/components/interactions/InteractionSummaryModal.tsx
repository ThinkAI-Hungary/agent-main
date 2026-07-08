/**
 * InteractionSummaryModal – Complete redesign
 * Based on user-provided mockups (June 2026).
 *
 * Features:
 * - Header with client name + ÚJ/VISSZATÉRŐ badge, date, channel/direction/type pills
 * - Summary + Status/Eredmény box
 * - Messenger/Instagram 24h warning banner
 * - Collapsible "Interakció részletei" with chat bubbles
 * - Profile picture loading for Messenger/Instagram channels
 * - Draft approval: Szerkesztés + Jóváhagyás és küldés
 * - Dynamic footer: "Ugrás teendőkre" vs "Ugrás naptárra"
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDt } from '../../helpers/formatters';
import { parseCustomData, type ClientRecord } from '../../helpers/clientResolvers';
import { authFetch } from '../../api/client';
import { showToast } from '../ui/Toast';
import { EredmenyBadge, StatuszBadge } from '../ui/Badge';
import type { InteractionRow } from '../../pages/InteractionsPage';
import './InteractionSummaryModal.css';

interface Props {
  row: InteractionRow;
  onClose: () => void;
  clients: ClientRecord[];
  clientsMap: Record<string, ClientRecord>;
  onClientClick?: (clientId: string) => void;
  /** When true, auto-expand chat + approval section on mount */
  autoExpandApproval?: boolean;
  /** Called after successful approval to let parent refresh data */
  onApproved?: () => void;
}

interface ChatBlock {
  sender: 'user' | 'ai' | 'system';
  text: string;
  timestamp?: string;
}

export default function InteractionSummaryModal({
  row,
  onClose,
  clients,
  clientsMap,
  onClientClick,
  autoExpandApproval,
  onApproved,
}: Props) {
  const navigate = useNavigate();
  const rawDraft = row.ai_draft_response || row.aiDraftResponse || null;
  const approvalStatus = row.approval_status || row.approvalStatus || null;
  const isPendingApproval =
    row.teendo === 'Jóváhagyásra vár' ||
    row.teendo === 'Válasz jóváhagyása szükséges' ||
    approvalStatus === 'pending';
  const [showDetails, setShowDetails] = useState(!!autoExpandApproval);
  const [chatBlocks, setChatBlocks] = useState<ChatBlock[]>([]);
  const [summaryText, setSummaryText] = useState('');
  const [notificationText, setNotificationText] = useState('');

  // Appointment result data
  const [appointmentInfo, setAppointmentInfo] = useState<{
    date: string;
    service: string;
    doctor: string;
  } | null>(null);

  // Profile picture
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);

  // Approval state
  const [draftText, setDraftText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const approvalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // ── Derived values ──
  const channel = row.channel || 'Telefon';
  const channelUpper = channel.toUpperCase();
  const isMessengerOrInsta = channel === 'Messenger' || channel === 'Instagram';
  const isAppointmentType =
    row.eredmeny.includes('időpont') || row.eredmeny.includes('Időpont') || row.ugyTipus === 'IDŐPONT';

  // Client status: Új vs Visszatérő
  const isNewClient = (() => {
    if (!row.clientCreatedAt) return true;
    const created = new Date(row.clientCreatedAt);
    const now = new Date();
    const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 30;
  })();

  // Formatted date
  const formattedDate = row.date ? fmtDt(row.date) : '';

  // ── Load profile picture for Messenger/Instagram ──
  useEffect(() => {
    if (!row.clientId) return;
    const clientData = clientsMap[String(row.clientId)];
    if (!clientData) return;

    const cd = parseCustomData(clientData.custom_data);

    // Check for cached profile_pic_url first
    if (cd?.profile_pic_url) {
      setProfilePicUrl(cd.profile_pic_url as string);
      return;
    }

    // Only fetch for Messenger/Instagram channels
    if (!isMessengerOrInsta) return;
    if (!cd?.messenger_id) return;

    let cancelled = false;
    authFetch(`/admin/api/clients/${row.clientId}/profile-pic`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.profile_pic_url) {
          setProfilePicUrl(data.profile_pic_url);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [row.clientId, clientsMap, isMessengerOrInsta]);

  // ── Build summary, chat blocks, appointment info ──
  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Find client custom_data
      let cData: Record<string, unknown> = {};
      if (row.clientId && clientsMap[String(row.clientId)]) {
        cData = parseCustomData(clientsMap[String(row.clientId)].custom_data);
      } else {
        const rn = (row.client || '').toLowerCase().trim();
        const match = clients.find((c) => {
          const cd = parseCustomData(c.custom_data);
          const cn = (
            (cd?.nev as string) ||
            (cd?.name as string) ||
            c.name ||
            ''
          )
            .toLowerCase()
            .trim();
          return cn && cn === rn;
        });
        if (match) cData = parseCustomData(match.custom_data);
      }

      const fullLog = (cData.beszelgetes_naplo as string) || '';

      // ── Parse the full log into timestamped entries ──
      interface LogEntry {
        timestamp: string;
        time: number;
        sender: 'user' | 'ai' | 'system';
        text: string;
      }

      function parseLogEntries(log: string): LogEntry[] {
        if (!log) return [];
        const entries: LogEntry[] = [];
        const entryRegex =
          /\[(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}(?::\d{2})?)\]\s*(.*?)(?=\[\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}|$)/gs;
        let m;
        while ((m = entryRegex.exec(log)) !== null) {
          const timestamp = m[1].trim();
          let content = m[2].trim();
          // Log timestamps are in local Budapest time — append timezone so Date() doesn't treat as UTC
          const isoWithTz = timestamp.replace(' ', 'T') + (timestamp.includes('+') || timestamp.includes('Z') ? '' : '+02:00');
          const time = new Date(isoWithTz).getTime() || 0;

          const hasEmailMarker = /[-–]\s*Bejövő e-mail\s*\(/i.test(content);
          const emailIncoming = hasEmailMarker
            ? content.match(
                /[-–]\s*Bejövő e-mail\s*\(Tárgy:\s*([^)]*)\)\s*:\s*([\s\S]*?)(?=\n\s*(?:AI\s*Válasz|$))/i
              )
            : null;
          const aiResponseSplit = hasEmailMarker
            ? content.split(/\n\s*AI\s*Válasz\s*:\s*/i)
            : [content];

          if (hasEmailMarker && (emailIncoming || aiResponseSplit.length > 1)) {
            const beforeEmail = content.match(/^([\s\S]*?)(?=[-–]\s*Bejövő e-mail)/i);
            const summaryText = beforeEmail ? beforeEmail[1].trim() : '';
            if (summaryText) {
              entries.push({ timestamp, time, sender: 'system', text: summaryText });
            }
            if (emailIncoming) {
              const emailSubject = emailIncoming[1].trim();
              const emailBody = emailIncoming[2].trim();
              const userText = emailBody;
              entries.push({ timestamp, time, sender: 'user', text: userText });
            }
            if (aiResponseSplit.length > 1) {
              const aiText = aiResponseSplit.slice(1).join('\n').trim();
              if (aiText) {
                entries.push({ timestamp, time: time + 1, sender: 'ai', text: aiText });
              }
            }
            continue;
          }

          let sender: 'user' | 'ai' | 'system' = 'system';
          if (/^Ügyfél\s*\([^)]*\)\s*:/i.test(content)) {
            sender = 'user';
            content = content.replace(/^Ügyfél\s*\([^)]*\)\s*:\s*/i, '');
          } else if (/^(Felhasználó|User)\s*:/i.test(content)) {
            sender = 'user';
            content = content.replace(/^(Felhasználó|User)\s*:\s*/i, '');
          } else if (/^(AI\s*Válasz|AI|Asszisztens|Bot)\s*:/i.test(content)) {
            sender = 'ai';
            content = content.replace(/^(AI\s*Válasz|AI|Asszisztens|Bot)\s*:\s*/i, '');
          } else if (/^\[Rendszer\]/i.test(content)) {
            sender = 'system';
            content = content.replace(/^\[Rendszer\]\s*/i, '');
          }

          if (content) {
            entries.push({ timestamp, time, sender, text: content.trim() });
          }
        }
        return entries;
      }

      function parseSimpleLog(log: string): ChatBlock[] {
        const lines = log.split('\n');
        const blocks: ChatBlock[] = [];
        let currentSender: 'user' | 'ai' | 'system' = 'system';
        let currentBlock: string[] = [];

        for (let line of lines) {
          line = line.trim();
          if (!line && currentSender !== 'ai') continue;

          let sender: 'user' | 'ai' | 'system' = currentSender;
          if (line.startsWith('Felhasználó:') || line.startsWith('User:')) {
            sender = 'user';
            line = line.replace(/^(Felhasználó|User):\s*/, '');
          } else if (
            line.startsWith('AI:') ||
            line.startsWith('Asszisztens:') ||
            line.startsWith('Bot:')
          ) {
            sender = 'ai';
            line = line.replace(/^(AI|Asszisztens|Bot):\s*/, '');
          } else if (line.startsWith('[')) {
            sender = 'system';
          }

          if (sender !== currentSender && currentBlock.length > 0) {
            blocks.push({ sender: currentSender, text: currentBlock.join('\n') });
            currentBlock = [];
          }
          currentSender = sender;
          if (line) currentBlock.push(line);
        }
        if (currentBlock.length > 0) {
          blocks.push({ sender: currentSender, text: currentBlock.join('\n') });
        }
        return blocks;
      }

      // Group entries into conversation sessions (30 min gap = new session)
      function groupIntoSessions(entries: LogEntry[]): LogEntry[][] {
        if (entries.length === 0) return [];
        const sorted = [...entries].sort((a, b) => a.time - b.time);
        const sessions: LogEntry[][] = [[sorted[0]]];
        for (let i = 1; i < sorted.length; i++) {
          const gap = sorted[i].time - sorted[i - 1].time;
          if (gap > 30 * 60 * 1000) {
            sessions.push([sorted[i]]);
          } else {
            sessions[sessions.length - 1].push(sorted[i]);
          }
        }
        return sessions;
      }

      // Find the session closest to the interaction's date
      let parsedBlocks: ChatBlock[];

      const allEntries = parseLogEntries(fullLog);
      if (allEntries.length > 0 && row.date) {
        const interactionTime = new Date(row.date).getTime();
        const sessionGroups = groupIntoSessions(allEntries);

        let bestSession = sessionGroups[0];
        let bestDistance = Infinity;
        for (const group of sessionGroups) {
          const groupStart = group[0].time;
          const groupEnd = group[group.length - 1].time;
          const dist =
            interactionTime >= groupStart && interactionTime <= groupEnd
              ? 0
              : Math.min(
                  Math.abs(interactionTime - groupStart),
                  Math.abs(interactionTime - groupEnd)
                );
          if (dist < bestDistance) {
            bestDistance = dist;
            bestSession = group;
          }
        }

        const blocks: ChatBlock[] = [];
        for (const entry of bestSession) {
          blocks.push({
            sender: entry.sender,
            text: entry.text,
            timestamp: entry.timestamp,
          });
        }
        parsedBlocks = blocks;
      } else if (fullLog) {
        parsedBlocks = parseSimpleLog(fullLog);
      } else {
        parsedBlocks = [];
      }

      // ── Set summary text ──
      const baseSummary =
        (cData.problem_description as string) || row.summary || '';

      // ── Calendar lookup for appointment data ──
      let apptDate = '';
      let apptService = '';
      let apptDoctor = '';
      let notifText = '';

      try {
        const res = await authFetch('/admin/api/calendar');
        const calData = res.ok ? await res.json() : null;
        const events = calData?.events || calData || [];
        const clientName = (row.client || '').toLowerCase().trim();
        const clientEmail = (
          (cData.email as string) || ''
        )
          .toLowerCase()
          .trim();

        const matchedEvent = (events || [])
          .filter(
            (ev: { attendee?: string; attendee_email?: string }) => {
              const evAttendee = (ev.attendee || '').toLowerCase().trim();
              const evEmail = (ev.attendee_email || '').toLowerCase().trim();
              return (
                (clientName && evAttendee.includes(clientName)) ||
                (clientName &&
                  clientName.includes(evAttendee) &&
                  evAttendee.length > 2) ||
                (clientEmail && evEmail === clientEmail)
              );
            }
          )
          .sort(
            (
              a: { start_dt?: string },
              b: { start_dt?: string }
            ) => (b.start_dt || '').localeCompare(a.start_dt || '')
          )[0];

        if (matchedEvent) {
          if (matchedEvent.start_dt) apptDate = fmtDt(matchedEvent.start_dt);
          if (matchedEvent.doctor && matchedEvent.doctor !== '-')
            apptDoctor = matchedEvent.doctor;

          const rawTitle = matchedEvent.title || '';
          if (rawTitle && rawTitle !== '-') {
            const drMatch = rawTitle.match(/^(.+?)\s+(Dr\.?\s+.+)$/i);
            if (drMatch) {
              apptService = drMatch[1].trim();
              if (!apptDoctor) apptDoctor = drMatch[2].trim();
            } else {
              apptService = rawTitle;
            }
          }

          if (matchedEvent.reminder_sent) {
            notifText = 'Visszaigazoló kiküldve';
          }
        }

        // Fallbacks from custom_data
        if (!apptDoctor) {
          const cdDoctor =
            (cData.orvos as string) || (cData.doctor as string) || '';
          if (cdDoctor) apptDoctor = cdDoctor;
        }
      } catch {
        /* calendar fetch optional */
      }

      // Fallbacks from custom_data
      if (!apptDate && cData.booked_datetime) {
        apptDate = fmtDt(cData.booked_datetime as string);
      }

      if (!cancelled) {
        // Filter out blocks that duplicate the summary
        const filteredBlocks = parsedBlocks.filter((block) => {
          if (block.sender === 'system') {
            const normalizedBlock = block.text.replace(/\s+/g, ' ').trim().toLowerCase();
            const normalizedSummary = baseSummary.replace(/\s+/g, ' ').trim().toLowerCase();
            if (
              normalizedSummary.includes(normalizedBlock) ||
              normalizedBlock.includes(normalizedSummary) ||
              normalizedBlock === normalizedSummary
            ) {
              return false;
            }
          }
          return true;
        });
        setChatBlocks(filteredBlocks);
        setNotificationText(notifText);

        // Build appointment info if applicable
        if (apptDate || apptService || apptDoctor) {
          setAppointmentInfo({
            date: apptDate || '-',
            service: apptService || '-',
            doctor: apptDoctor || '-',
          });
        }

        // For IDŐPONT type with appointment data, create structured summary
        if (
          (row.ugyTipus === 'IDŐPONT' || isAppointmentType) &&
          (apptDate || apptService || apptDoctor)
        ) {
          const lines = [baseSummary];
          if (apptDate) lines.push(`Befoglalt időpont:  ${apptDate}`);
          if (apptService && apptService !== '-')
            lines.push(`Szolgáltatás:       ${apptService}`);
          if (apptDoctor && apptDoctor !== '-')
            lines.push(`Orvos:              ${apptDoctor}`);
          setSummaryText(lines.filter(Boolean).join('\n'));
        } else {
          setSummaryText(baseSummary);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [row, clients, clientsMap, isAppointmentType]);

  // ── Parse AI draft for approval ──
  useEffect(() => {
    if (!isPendingApproval || !rawDraft) return;
    let parsedDraft: string;
    try {
      const draftData = JSON.parse(rawDraft);
      if (
        draftData.multi_channel &&
        draftData.drafts &&
        draftData.drafts.length > 1
      ) {
        parsedDraft = draftData.drafts
          .map((d: { channel: string; body?: string }) => {
            const chIcon: Record<string, string> = {
              Email: '📧',
              Messenger: '💬',
              WhatsApp: '📱',
            };
            return `━━━ ${chIcon[d.channel] || '📨'} ${d.channel} ━━━\n${d.body || ''}`;
          })
          .join('\n\n');
      } else {
        parsedDraft = draftData.body || '';
      }
    } catch {
      parsedDraft = rawDraft || '';
    }
    setDraftText(parsedDraft.replace(/<br\s*\/?>/gi, '\n'));
  }, [isPendingApproval, rawDraft]);

  // Auto-scroll to approval section when auto-expanding
  useEffect(() => {
    if (autoExpandApproval && approvalRef.current) {
      setTimeout(() => {
        approvalRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 350);
    }
  }, [autoExpandApproval, showDetails]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // ── Approval submit ──
  const handleApprovalSubmit = async () => {
    if (!row.interactionId) return;
    setSubmittingApproval(true);
    try {
      const res = await authFetch(
        `/admin/api/approvals/${row.interactionId}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modified_draft: draftText }),
        }
      );
      if (!res.ok) {
        const d = await res
          .json()
          .catch(() => ({ detail: 'Ismeretlen hiba' }));
        throw new Error(d.detail || 'Hiba történt a mentés során');
      }
      const result = await res
        .json()
        .catch(() => ({ status: 'success' }));
      if (result.status === 'warning') {
        showToast(
          result.message || 'Jóváhagyva, de a küldés sikertelen',
          'error'
        );
      } else {
        showToast('Válasz jóváhagyva és elküldve!', 'success');
      }
      onApproved?.();
      onClose();
    } catch (e) {
      showToast((e as Error).message || 'Hiba történt', 'error');
    } finally {
      setSubmittingApproval(false);
    }
  };

  // ── Avatar helper ──
  const clientName = row.client || 'Ismeretlen';
  const clientInitials = clientName
    .split(/\s+/)
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // ── SÜRGŐS notification ──
  const isSurgos = row.statusz === 'SÜRGŐS' || row.statusz === 'Sürgős';
  const surgosEmail = (() => {
    if (!isSurgos || !row.clientId) return '';
    const clientData = clientsMap[String(row.clientId)];
    if (!clientData) return '';
    const cd = parseCustomData(clientData.custom_data);
    return (cd?.notification_email as string) || (cd?.email as string) || '';
  })();


  // Does this interaction have appointment result?
  const showCalendarButton = isAppointmentType && appointmentInfo && appointmentInfo.date !== '-';

  return (
    <div
      className="ism-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="ism-card" onClick={(e) => e.stopPropagation()}>
        {/* ═══ HEADER ═══ */}
        <div className="ism-header">
          <div className="ism-header-left">
            <div className="ism-header-name-row">
              <h2 className="ism-header-name">{clientName}</h2>
              <span
                className={`ism-badge ${isNewClient ? 'ism-badge--new' : 'ism-badge--returning'}`}
              >
                {isNewClient ? 'ÚJ ÜGYFÉL' : 'VISSZATÉRŐ'}
              </span>
            </div>
            <div className="ism-header-date">{formattedDate}</div>
          </div>
          <div className="ism-header-right">
            <button
              className="ism-close-btn"
              onClick={onClose}
              aria-label="Bezárás"
            >
              ✕
            </button>
            <div className="ism-pills">
              <span className="ism-pill ism-pill--filled">{channelUpper}</span>
              <span className="ism-pill ism-pill--outline">
                {row.direction.toUpperCase()}
              </span>
              <span className="ism-pill ism-pill--outline">{row.ugyTipus}</span>
            </div>
          </div>
        </div>

        {/* ═══ BODY ═══ */}
        <div className="ism-body">
          {/* Summary + Status Box */}
          <div className="ism-summary-row">
            <div className="ism-summary-content">
              <div className="ism-section-label">Összefoglaló</div>
              <div className="ism-summary-text">
                {summaryText ||
                  'Az asszisztens rögzítette az interakció adatait.'}
              </div>
            </div>
            <div className="ism-status-box">
              <div className="ism-status-row">
                <span className="ism-status-label">Státusz:</span>
                <StatuszBadge value={row.statusz} />
              </div>
              <div className="ism-status-row">
                <span className="ism-status-label">Eredmény:</span>
                <EredmenyBadge value={row.eredmeny} />
              </div>
              {(notificationText || (isSurgos && surgosEmail)) && (
                <div className="ism-status-row">
                  <span className="ism-status-label">Értesítés:</span>
                  <span className="ism-status-value">
                    {isSurgos && surgosEmail ? surgosEmail : notificationText}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Warning Banner for Messenger/Instagram */}
          {isMessengerOrInsta && (() => {
            const msgDate = new Date(row.date);
            const now = new Date();
            const hoursDiff = (now.getTime() - msgDate.getTime()) / (1000 * 60 * 60);
            const isExpired = hoursDiff >= 24;

            if (isExpired) {
              return (
                <div className="ism-warning-banner ism-warning-banner--expired">
                  <svg
                    className="ism-warning-icon"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  <span>
                    A válaszadási időablak lejárt, ezért Messenger/Instagram
                    csatornán már nem küldhető válasz.
                  </span>
                </div>
              );
            }

            if (isPendingApproval) {
              return (
                <div className="ism-warning-banner">
                  <svg
                    className="ism-warning-icon"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  <span>
                    Messenger/Instagram csatornán 24 órás időablak áll
                    rendelkezésre a válaszadásra.
                  </span>
                </div>
              );
            }

            return null;
          })()}

          {/* ═══ INTERAKCIÓ RÉSZLETEI ═══ */}
          <div className="ism-details-section">
            <button
              className="ism-details-toggle"
              onClick={() => setShowDetails(!showDetails)}
            >
              <span className="ism-details-title">Interakció részletei</span>
              <svg
                className={`ism-chevron${showDetails ? ' ism-chevron--open' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {showDetails && (
              <div className="ism-chat-list">
                {chatBlocks.length === 0 && !isPendingApproval ? (
                  <div className="ism-no-history">Nincs előzmény</div>
                ) : (
                  <>
                    {/* Chat messages — hide AI blocks when pending approval (shown as draft below) */}
                    {(isPendingApproval
                      ? chatBlocks.filter((b) => b.sender !== 'ai')
                      : chatBlocks
                    ).map((block, i) =>
                      block.sender === 'system' ? (
                        <div key={i} className="ism-chat-system">
                          {block.text.replace(
                            /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?/g,
                            (iso) => {
                              try {
                                const d = new Date(iso);
                                return d.toLocaleString('hu-HU', {
                                  year: 'numeric', month: '2-digit', day: '2-digit',
                                  hour: '2-digit', minute: '2-digit',
                                });
                              } catch { return iso; }
                            }
                          )}
                        </div>
                      ) : (
                        <div key={i} className="ism-chat-entry">
                          <div className="ism-chat-meta">
                            {block.sender === 'user' ? (
                              <div className="ism-chat-avatar ism-chat-avatar--user">
                                {profilePicUrl ? (
                                  <img
                                    src={profilePicUrl}
                                    alt={clientName}
                                    onError={() => {
                                      setProfilePicUrl(null);
                                    }}
                                  />
                                ) : (
                                  clientInitials
                                )}
                              </div>
                            ) : (
                              <div className="ism-chat-avatar ism-chat-avatar--ai">
                                <svg
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  viewBox="0 0 24 24"
                                  width="16"
                                  height="16"
                                >
                                  <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 5.2L8 14 2 9.2h7.6z" />
                                </svg>
                              </div>
                            )}
                            <span className="ism-chat-sender">
                              {block.sender === 'user'
                                ? clientName
                                : 'eaisyDesk'}
                            </span>
                            {block.timestamp && (
                              <span className="ism-chat-time">
                                {fmtDt(
                                  block.timestamp.includes('+') || block.timestamp.includes('Z')
                                    ? block.timestamp
                                    : block.timestamp.replace(' ', 'T') + '+02:00'
                                )}
                              </span>
                            )}
                            {!block.timestamp && row.date && (
                              <span className="ism-chat-time">
                                {formattedDate}
                              </span>
                            )}
                          </div>
                          <div
                            className={`ism-chat-bubble ${
                              block.sender === 'user'
                                ? 'ism-chat-bubble--user'
                                : 'ism-chat-bubble--ai'
                            }`}
                          >
                            {block.text}
                          </div>
                        </div>
                      )
                    )}

                    {/* ── Pending Approval Draft ── */}
                    {isPendingApproval && draftText && (
                      <div className="ism-draft-section" ref={approvalRef}>
                        <div className="ism-draft-header">
                          <svg
                            className="ism-draft-icon"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                          >
                            <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 5.2L8 14 2 9.2h7.6z" />
                          </svg>
                          <span className="ism-draft-label">
                            eaisyDesk választerv
                          </span>
                        </div>

                        {isEditing ? (
                          <textarea
                            ref={textareaRef}
                            className="ism-draft-textarea"
                            value={draftText}
                            onChange={(e) => setDraftText(e.target.value)}
                            disabled={submittingApproval}
                            rows={5}
                          />
                        ) : (
                          <div className="ism-draft-box">{draftText}</div>
                        )}

                        <div className="ism-draft-actions">
                          <button
                            className="ism-btn-edit"
                            onClick={() => {
                              setIsEditing(!isEditing);
                              if (!isEditing) {
                                setTimeout(
                                  () => textareaRef.current?.focus(),
                                  100
                                );
                              }
                            }}
                          >
                            {isEditing ? 'Mégsem' : 'Szerkesztés'}
                          </button>
                          <button
                            className="ism-btn-approve"
                            onClick={handleApprovalSubmit}
                            disabled={submittingApproval || !draftText.trim()}
                          >
                            {submittingApproval
                              ? 'Küldés...'
                              : 'Jóváhagyás és küldés'}
                          </button>
                        </div>
                      </div>
                    )}

                  </>
                )}

              </div>
            )}
          </div>
        </div>

        {/* ═══ FOOTER ═══ */}
        <div className="ism-footer">
          <button
            className="ism-footer-btn ism-footer-btn--outline"
            disabled={!row.clientId}
            onClick={() => {
              if (row.clientId && onClientClick) {
                onClose();
                onClientClick(String(row.clientId));
              }
            }}
          >
            Ugrás ügyfélprofilra
          </button>
          <button
            className={`ism-footer-btn ${showCalendarButton ? 'ism-footer-btn--calendar' : 'ism-footer-btn--solid'}`}
            onClick={() => {
              onClose();
              navigate(showCalendarButton ? '/calendar' : '/kanban');
            }}
          >
            {showCalendarButton ? 'Ugrás naptárra' : 'Ugrás teendőkre'}
          </button>
        </div>
      </div>
    </div>
  );
}
