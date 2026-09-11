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
import { fmtDt } from '../../helpers/formatters';
import { parseCustomData, type ClientRecord } from '../../helpers/clientResolvers';
import { FormattedMessage } from '../../helpers/messageFormatter';
import { authFetch } from '../../api/client';
import { showToast } from '../ui/Toast';
import { StatuszBadge } from '../ui/Badge';
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
  /** 'thread' (alapértelmezett): az Interakciós napló összefűzött nézete előzmény-sávval.
      'single': ügyfélprofil / irányítópult — CSAK az adott interakció, előzménykezelés nélkül. */
  mode?: 'thread' | 'single';
}

interface ChatBlock {
  sender: 'user' | 'ai' | 'system';
  text: string;
  timestamp?: string;
}

// Csatorna ikonok (UI Kit: ikon + csatornanév pill a modál fejlécében)
const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  Telefon: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
  Email: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22 6 12 13 2 6" /></>,
  WhatsApp: <path d="M12 3a9 9 0 0 0-7.72 13.44L3 21l4.78-1.22A9 9 0 1 0 12 3z" />,
  Messenger: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />,
  Instagram: <><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></>,
};

export default function InteractionSummaryModal({
  row,
  onClose,
  clients,
  clientsMap,
  onClientClick,
  autoExpandApproval,
  onApproved,
  mode = 'thread',
}: Props) {
  // EAISY-241 §1.2.3 — CTA gombok jogosultság-kezelése.
  // Jogosultság-konzisztencia: ugyanaz az admin-VAGY-manager szabály, mint a
  // listanézetben (korábban a modal szigorúan csak admint nézett, a lista
  // manager-t is adminnak — következetlen volt).
  const rawDraft = row.ai_draft_response || row.aiDraftResponse || null;
  const approvalStatus = row.approval_status || row.approvalStatus || null;
  // EAISY-241 §1.1.2 — Ha az ügytípus eljárása „Önállóan kezelhető" (autonomous),
  // a jóváhagyási/szerkesztési UI nem jelenik meg (a válasz már auto-kiküldésre került).
  // Ez true ha approval folyamat szükséges ÉS nem autonóm.
  const isAutoSent = row.classification?.autonomous === true;
  const isAutonomous = isAutoSent || approvalStatus === 'approved';
  const isPendingApproval = !isAutonomous && (
    row.teendo === 'Jóváhagyásra vár' ||
    row.teendo === 'Jóváhagyás szükséges' ||
    approvalStatus === 'pending'
  );
  const [showDetails, setShowDetails] = useState(!!autoExpandApproval);
  const [chatBlocks, setChatBlocks] = useState<ChatBlock[]>([]);
  const [summaryText, setSummaryText] = useState('');
  // Korábbi levelezések (a 30 perces session-határokkal tagolt diary-szeletek,
  // amelyek NEM az aktuális interakcióhoz legközelebbiek) — popup alján lenyitható
  const [historyGroups, setHistoryGroups] = useState<{ label: string; blocks: ChatBlock[] }[]>([]);
  // Single módban kimenő sornál a kiküldött üzenet tárgya (fejléc-címke)
  const [outboundSubject, setOutboundSubject] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
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
  // Multi-channel draft: csatornánkénti szerkeszthető szövegek
  const [draftChannels, setDraftChannels] = useState<{ channel: string; body: string }[] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const approvalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // ── Derived values ──
  const channel = row.channel || 'Telefon';
  const channelUpper = channel.toUpperCase();
  const isMessengerOrInsta = channel === 'Messenger' || channel === 'Instagram';
  // A 'IDŐPONT' (nagybetűs) összevetés halott ág volt — a detectUgyTipus mindig
  // 'Időpont'-ot ad. A szándék-címkék (Foglalási/Módosítási/Lemondási szándék
  // rögzítve) nem tartalmazzák az „időpont" substringet, ezért az ugyTipus a
  // megbízható forrás.
  const isAppointmentType =
    row.ugyTipus === 'Időpont' ||
    (row.classification?.detected_types || []).includes('Időpont') ||
    row.eredmeny.includes('időpont') || row.eredmeny.includes('Időpont');

  // Client status: Új vs Visszatérő — badge CSAK ismert regisztrációs dátumnál
  // (ismeretlen ügyfélnél a „ÚJ ÜGYFÉL" félrevezető volt)
  const isNewClient = (() => {
    if (!row.clientCreatedAt) return false;
    const created = new Date(row.clientCreatedAt);
    const now = new Date();
    const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 30;
  })();

  // Formatted date
  const formattedDate = row.date ? fmtDt(row.date) : '';

  // ── 24 órás válaszablak info modal (Messenger/Instagram) — a korábbi
  // banner helyett; „Értem"-nel véglegesen eltűnik (localStorage) ──
  const [show24hModal, setShow24hModal] = useState(false);
  useEffect(() => {
    if (!isMessengerOrInsta) return;
    let dismissed = false;
    try {
      dismissed = !!localStorage.getItem('ism_24h_info_dismissed');
    } catch {
      dismissed = false;
    }
    if (!dismissed) setShow24hModal(true);
  }, [isMessengerOrInsta]);
  const dismiss24hModal = () => {
    try {
      localStorage.setItem('ism_24h_info_dismissed', '1');
    } catch {
      /* private mode — csak bezárjuk */
    }
    setShow24hModal(false);
  };

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

      // ── KIMENŐ kommunikáció (visszaigazolás/emlékeztető/kampány) single módban:
      // csak a KIKÜLDÖTT ÜZENET jelenik meg, közvetlen előzmény nélkül (260-as ügy) ──
      const isOutboundRow = /kimenő|outbound/i.test(row.direction || '');
      if (mode === 'single' && isOutboundRow) {
        let oBody = '';
        let oSubject = '';
        try {
          const d: unknown = typeof rawDraft === 'string' ? JSON.parse(rawDraft) : rawDraft;
          oBody = String((d as Record<string, unknown>)?.body || '');
          oSubject = String((d as Record<string, unknown>)?.subject || '');
        } catch {
          oBody = '';
        }
        if (!cancelled) {
          setOutboundSubject(oSubject);
          setHistoryGroups([]);
          setChatBlocks(
            oBody
              ? [{
                  sender: 'ai' as const,
                  text: oBody,
                  timestamp: (row.sent_at || row.date || '').replace('T', ' ').slice(0, 16) || undefined,
                }]
              : []
          );
          setSummaryText(oSubject || row.ugyTipus || '');
        }
        return;
      }

      let fullLog = (cData.beszelgetes_naplo as string) || '';
      if (!fullLog && row.result && row.result.trim()) {
        if (row.result.trim().startsWith('[')) {
          fullLog = row.result;
        } else {
          const dateStr = row.date ? row.date.replace('T', ' ').slice(0, 16) : new Date().toISOString().replace('T', ' ').slice(0, 16);
          fullLog = `[${dateStr}]\n${row.result}`;
        }
      }

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
          // A log időbélyegek helyi (Budapest) idők — timezone-suffix NÉLKÜL
          // parse-oljuk lokálisként (a korábbi fix '+02:00' télen 1 órát csúszott)
          const isoLocal = timestamp.replace(' ', 'T');
          const time = new Date(isoLocal).getTime() || 0;

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
            // Az AI összefoglaló sort NEM tesszük a chatbe — az ÖSSZEFOGLALÁS
            // doboz felül már megmutatja (duplikáció volt, 257-es ügy).
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
      const isEmailThread = (row.channel || '').toLowerCase() === 'email';

      const allEntries = parseLogEntries(fullLog);
      let historyGroups: { label: string; blocks: ChatBlock[] }[] = [];
      if (allEntries.length > 0 && row.date) {
        const interactionTime = new Date(row.date).getTime();
        const sessionGroups = groupIntoSessions(allEntries);

        // A legközelebbi session = az aktuális csere (chat); a TÖBBI session
        // a korábbi levelezés — popup alján lenyitható előzményként jelenik meg
        // (259-es ügy: korábban a régebbi cserék teljesen kiszűrődtek)
        let bestIdx = 0;
        let bestDistance = Infinity;
        sessionGroups.forEach((group, gi) => {
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
            bestIdx = gi;
          }
        });

        // 261-es ügy: e-mail szálban az AKTUÁLIS csere = az ügyfél LEGUTÓBBi
        // levele (+ a hozzá tartozó válasz) — a szessionben korábban lévő
        // további üzenetek (korábbi levél + kiküldött válasza) az ELŐZMÉNYEKBE
        // kerülnek, nem a kibontott részbe.
        const curSession = sessionGroups[bestIdx];
        let curStart = 0;
        if (isEmailThread) {
          if (mode === 'single') {
            // Ügyfélprofil/irányítópult: az EHHEZ az interakcióhoz tartozó üzenet —
            // időben legközelebbi ügyfél-bejegyzés a sor idejéhez
            let bestDist = Infinity;
            for (let i = 0; i < curSession.length; i++) {
              if (curSession[i].sender !== 'user') continue;
              const dist = Math.abs(curSession[i].time - interactionTime);
              if (dist < bestDist) {
                bestDist = dist;
                curStart = i;
              }
            }
          } else {
            // Interakciós napló (thread): a LEGUTÓBBi ügyfélüzenet az aktuális
            for (let i = 0; i < curSession.length; i++) {
              if (curSession[i].sender === 'user') curStart = i;
            }
          }
        }
        const preEntries = curSession.slice(0, curStart);
        const currentEntries = curSession.slice(curStart);

        const blocks: ChatBlock[] = [];
        for (const entry of currentEntries) {
          blocks.push({
            sender: entry.sender,
            text: entry.text,
            timestamp: entry.timestamp,
          });
        }
        parsedBlocks = blocks;

        // Ha a válasz MÁR KIKÜLDÉSRE került (approved/autonóm), a naplóban lévő
        // eredeti AI-szöveg helyett a ténylegesen kiküldött (esetleg SZERKESZTETT)
        // szöveg jelenik meg — az approve endpoint a rekordot frissíti.
        // Csak e-mail szálon (telefonosnál a napló a tényleges beszélgetést őrzi).
        let sentBody = '';
        if (isEmailThread && !isPendingApproval) {
          try {
            const d: unknown = typeof rawDraft === 'string' ? JSON.parse(rawDraft) : rawDraft;
            sentBody = String((d as Record<string, unknown> | null)?.body || '');
          } catch {
            sentBody = '';
          }
        }
        if (sentBody) {
          let replaced = false;
          for (let i = parsedBlocks.length - 1; i >= 0; i--) {
            if (parsedBlocks[i].sender === 'user') break;
            if (parsedBlocks[i].sender === 'ai') {
              parsedBlocks[i] = { ...parsedBlocks[i], text: sentBody };
              replaced = true;
              break;
            }
          }
          if (!replaced && parsedBlocks.length > 0) {
            parsedBlocks.push({
              sender: 'ai',
              text: sentBody,
              timestamp: row.date ? row.date.replace('T', ' ').slice(0, 16) : undefined,
            });
          }
        }

        // Előzmények: a régebbi sessionök + az aktuális sessionből korábban
        // kivágott csere (időrendben)
        const olderGroups = sessionGroups
          .map((g, gi) => ({ g, gi }))
          .filter(({ gi }) => gi !== bestIdx)
          .map(({ g }) => g);
        const allHistory: typeof olderGroups = preEntries.length
          ? [...olderGroups, preEntries].sort((a, b) => a[0].time - b[0].time)
          : olderGroups.sort((a, b) => a[0].time - b[0].time);
        historyGroups = allHistory.map(g => ({
          label: (() => {
            try {
              const first = new Date(g[0].time);
              const last = new Date(g[g.length - 1].time);
              const d = first.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
              const t1 = `${String(first.getHours()).padStart(2, '0')}:${String(first.getMinutes()).padStart(2, '0')}`;
              const t2 = `${String(last.getHours()).padStart(2, '0')}:${String(last.getMinutes()).padStart(2, '0')}`;
              return `${d} ${t1}${g.length > 1 ? ' – ' + t2 : ''}`;
            } catch {
              return 'Korábbi levelezés';
            }
          })(),
          blocks: g.map(e => ({ sender: e.sender, text: e.text, timestamp: e.timestamp })),
        }));
      } else if (fullLog) {
        parsedBlocks = parseSimpleLog(fullLog);
      } else {
        parsedBlocks = [];
      }
      if (mode === 'single') historyGroups = []; // nincs előzménykezelés — csak önálló interakció
      setHistoryGroups(historyGroups);

      // ── Fallback ha nincs user blokk a logban, de a topic tartalmazza az email szövegét és csatolmányát ──
      if (!parsedBlocks.some((b) => b.sender === 'user') && row.topic) {
        const emailTopicMatch = row.topic.match(
          /^Email AI válasz\s*-\s*[^:]*:\s*([\s\S]+)$/i
        );
        if (emailTopicMatch) {
          const userMsg = emailTopicMatch[1].trim();
          if (userMsg) {
            // A redundáns rendszerüzenetet (pl. "Igény rögzítve") kiszűrjük
            parsedBlocks = [
              {
                sender: 'user',
                text: userMsg,
                timestamp: row.date
                  ? row.date.replace('T', ' ').slice(0, 16)
                  : undefined,
              },
              ...parsedBlocks.filter((b) => b.text !== row.result),
            ];
          }
        }
      }

      // ── Set summary text ──
      // EAISY-241 §1.2.2: az összefoglalás CSAK az adott interakcióra vonatkozzon.
      // Korábban cData.problem_description (kliens-szintű, felülírt) jött először,
      // ami összekeverte az előző interakciók adataival. Most a sorrend:
      // 1. strukturált classification.osszefoglalas (a legpontosabb, AI által generált)
      // 2. row.summary (az adott interakció saját összefoglalója)
      // 3. row.result (eredmény szöveg)
      const baseSummary =
        (row.classification?.osszefoglalas as string) ||
        row.summary ||
        row.result ||
        '';

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

        // For Időpont type with appointment data, create structured summary
        if (isAppointmentType && (apptDate || apptService || apptDoctor)) {
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

  // ── Parse AI draft ──
  // MINDEN módban parse-oljuk (korábban csak pending módban → az autonóm és
  // sürgős „Kiküldött válasz" doboz SOHA nem jelenhetett meg).
  useEffect(() => {
    if (!rawDraft) return;
    let parsedDraft: string;
    try {
      const draftData = JSON.parse(rawDraft);
      if (
        draftData.multi_channel &&
        draftData.drafts &&
        draftData.drafts.length > 1
      ) {
        // Csatornánkénti szövegek külön state-be (szerkesztéshez)
        setDraftChannels(
          draftData.drafts.map((d: { channel: string; body?: string }) => ({
            channel: d.channel,
            body: (d.body || '').replace(/<br\s*\/?>/gi, '\n'),
          }))
        );
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
  }, [rawDraft]);

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

  // Close on Escape — submit közben NE záródjon be (a finally blokk különben
  // unmounted komponensen hívna state-settert)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submittingApproval) onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, submittingApproval]);

  // ── Approval submit ──
  const handleApprovalSubmit = async () => {
    if (!row.interactionId) return;
    setSubmittingApproval(true);
    try {
      const body: Record<string, unknown> = { modified_draft: draftText };
      // Multi-channel: csatornánként szerkesztett szövegek (a backend ezeket
      // küldi ki, nem az összefűzött preview-t)
      if (draftChannels) {
        body.modified_drafts = Object.fromEntries(
          draftChannels.map((d) => [d.channel, d.body])
        );
      }
      const res = await authFetch(
        `/admin/api/approvals/${row.interactionId}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
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
    <>
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
              {/* Badge csak ismert regisztrációs dátumnál — ismeretlen ügyfélnél
                  ne mutasson félrevezető „ÚJ ÜGYFÉL" címkét */}
              {row.clientCreatedAt && (
                <span
                  className={`ism-badge ${isNewClient ? 'ism-badge--new' : 'ism-badge--returning'}`}
                >
                  {isNewClient ? 'ÚJ ÜGYFÉL' : 'VISSZATÉRŐ'}
                </span>
              )}
            </div>
            {/* A fejléc dátuma a VALÓS beérkezési idő (email Date fejléc) */}
            <div className="ism-header-date">{fmtDt(row.received_at || row.date)}</div>
          </div>
          <div className="ism-header-right">
            <button
              className="ism-close-btn"
              onClick={onClose}
              aria-label="Bezárás"
            >
              ✕
            </button>
            {/* Csatorna-címke: ikon-tile + csatorna neve — a bezárás gomb ALATT */}
            <span className="ism-channel-chip">
              <span className="ism-channel-chip-icon">
                {CHANNEL_ICONS[channelUpper] && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                    {CHANNEL_ICONS[channelUpper]}
                  </svg>
                )}
              </span>
              <span className="ism-channel-chip-name">{channel}</span>
            </span>
          </div>
        </div>

        {/* ═══ BODY ═══ */}
        <div className="ism-body">
          {/* Summary + Status Box */}
          <div className="ism-summary-row">
            <div className="ism-summary-card">
              <div className="ism-section-label">ÖSSZEFOGLALÁS</div>
              <div className="ism-summary-scroll">
                <div className="ism-summary-text">
                  {summaryText ||
                    'Az asszisztens rögzítette az interakció adatait.'}
                </div>
              </div>
            </div>
            <div className="ism-side-col">
              <div className="ism-meta-card">
                <div className="ism-meta-label">Státusz</div>
                <StatuszBadge value={row.statusz} />
              </div>
              <div className="ism-meta-card">
                <div className="ism-meta-label">Teendő</div>
                <div className="ism-meta-value">{row.teendo || '—'}</div>
              </div>
            </div>
          </div>

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
                    {/* ── Korábbi levelezések (előzmények) — csak thread (napló) módban ── */}
                    {mode === 'thread' && historyGroups.length > 0 && (
                      <div className="ism-history">
                        <button
                          className="ism-history-toggle"
                          onClick={() => setHistoryOpen(v => !v)}
                          aria-expanded={historyOpen}
                        >
                          <span>Előzmények megtekintése ({historyGroups.length})</span>
                          <svg
                            className={`ism-chevron${historyOpen ? ' ism-chevron--open' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            viewBox="0 0 24 24"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                        {historyOpen &&
                          historyGroups.map((g, gi) => (
                            <div key={gi} className="ism-history-group">
                              <div className="ism-history-label">{g.label}</div>
                              {g.blocks.map((b, bi) => (
                                <div key={bi} className="ism-chat-entry">
                                  <div className="ism-chat-meta">
                                    {b.sender === 'user' ? (
                                      <div className="ism-chat-avatar ism-chat-avatar--user">
                                        {clientInitials}
                                      </div>
                                    ) : (
                                      <div className="ism-chat-avatar ism-chat-avatar--sent">
                                        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="15" height="15">
                                          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                                        </svg>
                                      </div>
                                    )}
                                    <span className="ism-chat-sender">
                                      {b.sender === 'user'
                                        ? (row.client || 'Ügyfél')
                                        : b.sender === 'ai'
                                          ? 'Elküldött válasz'
                                          : 'Rendszer'}
                                    </span>
                                    {b.timestamp && (
                                      <span className="ism-chat-time">
                                        {fmtDt(
                                          b.timestamp.includes('+') || b.timestamp.includes('Z')
                                            ? b.timestamp
                                            : b.timestamp.replace(' ', 'T')
                                        )}
                                      </span>
                                    )}
                                  </div>
                                  <div className={`ism-chat-bubble ${b.sender === 'user' ? 'ism-chat-bubble--user' : 'ism-chat-bubble--sent'}`}>
                                    <FormattedMessage text={b.text} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                      </div>
                    )}

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
                              /* Elküldött válasz — papírrepülő ikon (261-es ügy) */
                              <div className="ism-chat-avatar ism-chat-avatar--sent">
                                <svg
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  viewBox="0 0 24 24"
                                  width="15"
                                  height="15"
                                >
                                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                                </svg>
                              </div>
                            )}
                            <span className="ism-chat-sender">
                              {block.sender === 'user'
                                ? clientName
                                : mode === 'single' && outboundSubject
                                  ? outboundSubject
                                  : 'Elküldött válasz'}
                            </span>
                            {/* A kiküldött válasz a VALÓS küldési időt mutatja */}
                            {block.sender === 'ai' && row.sent_at ? (
                              <span className="ism-chat-time">
                                {fmtDt(String(row.sent_at))}
                              </span>
                            ) : (
                              <>
                                {block.timestamp && (
                                  <span className="ism-chat-time">
                                    {fmtDt(
                                      block.timestamp.includes('+') || block.timestamp.includes('Z')
                                        ? block.timestamp
                                        : block.timestamp.replace(' ', 'T')
                                    )}
                                  </span>
                                )}
                                {!block.timestamp && row.date && (
                                  <span className="ism-chat-time">
                                    {formattedDate}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          <div
                            className={`ism-chat-bubble ${
                              block.sender === 'user'
                                ? 'ism-chat-bubble--user'
                                : block.sender === 'ai'
                                  ? 'ism-chat-bubble--sent'
                                  : 'ism-chat-bubble--ai'
                            }`}
                          >
                            <FormattedMessage text={block.text} />
                          </div>
                        </div>
                      )
                    )}

                    {/* ── Kiküldött válasz NEM jelenik meg külön szekcióként ──
                    /* 261-es ügy: kiküldést követően a választerv nem marad meg
                    /* a popupban (nem duplikálódik) — a kiküldött (esetleg
                    /* szerkesztett) szöveg a chatben látszik, szürke blokkban. */}

                    {/* EAISY-241 §2.2c — Sürgős (panasz): mutatjuk a választ/átadási szöveget, gombok nélkül */}
                    {!isAutonomous && !isPendingApproval && (row.statusz === 'Sürgős' || row.statusz === 'SÜRGŐS') && draftText && (
                      <div className="ism-draft-section">
                        <div className="ism-draft-header">
                          <svg className="ism-draft-icon" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                          </svg>
                          <span className="ism-draft-label">eaisyDesk válasz (sürgős átadás)</span>
                        </div>
                        <div className="ism-draft-box">{draftText}</div>
                      </div>
                    )}

                    {isPendingApproval && draftText && (
                      <div className="ism-draft-section ism-draft-section--pending" ref={approvalRef}>
                        <div className="ism-draft-header">
                          <div className="ism-chat-avatar ism-chat-avatar--brand">
                            <img src="/eaisydesk-logo.png" alt="eaisyDesk" />
                          </div>
                          <span className="ism-draft-label">
                            eaisyDesk választerv
                          </span>
                        </div>

                        {draftChannels ? (
                          /* Multi-channel: csatornánként szerkeszthető szövegek —
                             a kiküldés is csatornánként történik (modified_drafts) */
                          draftChannels.map((d, idx) => (
                            <div key={d.channel} style={{ marginBottom: 8 }}>
                              <div className="ism-draft-label" style={{ marginBottom: 4 }}>{d.channel}</div>
                              {isEditing ? (
                                <textarea
                                  className="ism-draft-textarea"
                                  value={d.body}
                                  onChange={(e) =>
                                    setDraftChannels((prev) =>
                                      prev ? prev.map((x, i) => (i === idx ? { ...x, body: e.target.value } : x)) : prev
                                    )
                                  }
                                  disabled={submittingApproval}
                                  rows={4}
                                />
                              ) : (
                                <div className="ism-draft-box">{d.body}</div>
                              )}
                            </div>
                          ))
                        ) : isEditing ? (
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
                            // EAISY-241 §2.1: Szerkesztés gomb aktív minden jogosultságnál
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
                              : 'Jóváhagyás és elküldés'}
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


      </div>
    </div>

    {/* ═══ 24 órás válaszablak info modal (Messenger/Instagram) ═══ */}
    {show24hModal && (
      <div className="ism-24h-overlay" onClick={dismiss24hModal}>
        <div className="ism-24h-card" onClick={(e) => e.stopPropagation()}>
          <div className="ism-24h-icon">
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="22" height="22">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h3 className="ism-24h-title">24 órás válaszablak</h3>
          <p className="ism-24h-text">
            A Messenger és Instagram üzenetekre csak <b>24 órán belül</b> lehet
            ügyfélként válaszolni. Ha az ablak lejár, a válasz már „fizetett
            hirdetésként" vagy új üzenetként kezelődik — ezért a nyitott
            ügyeket érdemes mielőbb lezárni.
          </p>
          <div className="ism-24h-actions">
            <button className="ism-24h-ok" onClick={dismiss24hModal}>Értem</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
