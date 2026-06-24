/**
 * MemberDashboardPage – "Irányítópult" for member users.
 * Shows: Greeting, KPI cards (assigned clients, next appointment),
 * and a filterable todos list (calendar events, approvals, interactions).
 *
 * Ported from the monolithic admin_backup_before_split.html member-analytics-shell.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApproval } from '../context/ApprovalContext';
import { authFetch } from '../api/client';
import { useClients } from '../hooks/useClients';
import { useSessions } from '../hooks/useSessions';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import ClientDetailView from '../components/clients/ClientDetailView';
import { bestClientName } from '../helpers/clientResolvers';
import { StatuszBadge, EredmenyBadge } from '../components/ui/Badge';
import InteractionSummaryModal from '../components/interactions/InteractionSummaryModal';
import type { InteractionRow } from './InteractionsPage';
import {
  detectStatusz,
  detectUgyTipus,
  detectEredmeny,
  detectTeendo,
} from '../helpers/interactionClassifiers';

// ── Types ───────────────────────────────────────────────────────────────────

interface Todo {
  id: string;
  type: 'calendar' | 'approval' | 'interaction';
  desc: string;
  sub: string;
  client: string;
  clientId: number | null;
  badge: string;
  badgeLabel: string;
  date: Date;
  createdAt: Date;
  completed: boolean;
  // Approval-specific fields
  interactionId?: number | null;
  sessionId?: string | null;
  aiDraftResponse?: string | null;
  ai_draft_response?: string | null;
  approvalStatus?: string | null;
  approval_status?: string | null;
  channel?: string | null;
  topic?: string | null;
  // Derived display fields
  csatorna?: string;
  ugyTipus?: string;
  eredmeny?: string;
  teendo?: string;
  statusz?: string;
}

type TodoFilter = 'all' | 'today' | 'overdue' | 'upcoming' | 'completed';

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseCustomData(cd: unknown): Record<string, unknown> {
  if (!cd) return {};
  if (typeof cd === 'string') { try { return JSON.parse(cd); } catch { return {}; } }
  return cd as Record<string, unknown>;
}

function isClientAssignedToMe(
  clientObj: Record<string, unknown>,
  username: string,
  fullName: string
): boolean {
  const cd = parseCustomData(clientObj.custom_data);
  const felelos = (cd.felelos || '') as string;
  return felelos === username || (!!fullName && felelos === fullName);
}

const DAYS_HU = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
const MONTHS_HU = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];

function formatGreetingDate(d: Date): string {
  return `${d.getFullYear()}. ${MONTHS_HU[d.getMonth()]} ${d.getDate()}., ${DAYS_HU[d.getDay()]}`;
}

function getCompletedStorageKey(): string {
  return 'completedTodos_' + new Date().toISOString().slice(0, 10);
}

function getCompletedIds(): string[] {
  try { return JSON.parse(localStorage.getItem(getCompletedStorageKey()) || '[]'); }
  catch { return []; }
}

// ── Channel / type detection helpers ────────────────────────────────────────

function detectTodoChannel(t: { channel?: string | null; sessionId?: string | null; type?: string }): string {
  if (t.channel) return t.channel;
  const sid = (t.sessionId || '').toLowerCase();
  if (sid.startsWith('instagram')) return 'Instagram';
  if (sid.startsWith('messenger')) return 'Messenger';
  if (sid.startsWith('whatsapp')) return 'WhatsApp';
  if (sid.includes('email')) return 'Email';
  if (sid.includes('call') || sid.includes('sip')) return 'Telefon';
  if (t.type === 'calendar') return 'Email';
  return '—';
}



const CSATORNA_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  'Messenger': { bg: 'rgba(59,130,246,0.08)', color: '#2563eb', border: 'rgba(59,130,246,0.25)' },
  'Instagram': { bg: 'rgba(168,85,247,0.08)', color: '#7c3aed', border: 'rgba(168,85,247,0.25)' },
  'Email': { bg: 'rgba(16,185,129,0.08)', color: '#059669', border: 'rgba(16,185,129,0.25)' },
  'Telefon': { bg: 'rgba(59,130,246,0.08)', color: '#2563eb', border: 'rgba(59,130,246,0.25)' },
  'WhatsApp': { bg: 'rgba(34,197,94,0.08)', color: '#16a34a', border: 'rgba(34,197,94,0.25)' },
  'Naptár': { bg: 'rgba(168,85,247,0.08)', color: '#7c3aed', border: 'rgba(168,85,247,0.25)' },
};

const TEENDO_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  'Azonnali beavatkozás szükséges': { bg: 'rgba(239,68,68,0.08)', color: '#dc2626', border: 'rgba(239,68,68,0.25)' },
  'Jóváhagyásra vár': { bg: 'rgba(245,158,11,0.08)', color: '#d97706', border: 'rgba(245,158,11,0.3)' },
  'Intézkedés szükséges': { bg: 'rgba(59,130,246,0.08)', color: '#2563eb', border: 'rgba(59,130,246,0.25)' },
  'Visszahívás szükséges': { bg: 'rgba(168,85,247,0.08)', color: '#7c3aed', border: 'rgba(168,85,247,0.25)' },
  'Válasz szükséges': { bg: 'rgba(245,158,11,0.08)', color: '#d97706', border: 'rgba(245,158,11,0.3)' },
  'Nincs további teendő': { bg: 'rgba(107,114,128,0.06)', color: '#6b7280', border: 'rgba(107,114,128,0.15)' },
};

function formatTodoDatum(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}.  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function saveCompletedIds(ids: string[]) {
  localStorage.setItem(getCompletedStorageKey(), JSON.stringify(ids));
}

function mapTodoToInteractionRow(t: Todo): InteractionRow {
  return {
    date: t.createdAt ? t.createdAt.toISOString() : t.date.toISOString(),
    channel: t.csatorna || 'Email',
    client: t.client || 'Ismeretlen',
    clientId: t.clientId,
    clientStatus: null,
    clientCreatedAt: null,
    direction: t.type === 'approval' ? 'Kimenő' : 'Bejövő',
    ugyTipus: t.ugyTipus || 'EGYÉB',
    eredmeny: t.eredmeny || 'Rögzítve',
    statusz: t.statusz || 'LEZÁRT',
    teendo: t.teendo || 'Nincs további teendő',
    tags: [],
    type: t.type,
    topic: t.topic || '',
    summary: t.desc || '',
    result: t.eredmeny || '',
    interactionId: t.interactionId || null,
    sessionId: t.sessionId || null,
    ai_draft_response: t.ai_draft_response || t.aiDraftResponse || null,
    approval_status: t.approval_status || t.approvalStatus || (t.type === 'approval' ? 'pending' : null),
  };
}

// ── Component ───────────────────────────────────────────────────────────────

export default function MemberDashboardPage() {
  const { user, isAdmin } = useAuth();
  const { openApproval } = useApproval();
  const navigate = useNavigate();
  const { clients: hookClients, clientsMap } = useClients();
  const { sessions: hookSessions, refetch: refetchSessions } = useSessions(100);
  const { events } = useCalendarEvents();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<TodoFilter>('all');
  const [clientCount, setClientCount] = useState(0);
  const [nextAppointment, setNextAppointment] = useState<{ text: string; sub: string }>({ text: '—', sub: 'naptárban' });
  const [loading, setLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [summaryModalRow, setSummaryModalRow] = useState<InteractionRow | null>(null);

  const username = user?.username || '';
  const fullName = user?.fullName || '';
  const firstName = fullName ? fullName.split(' ').pop() || fullName : username;
  const initials = fullName
    ? fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : username.substring(0, 2).toUpperCase();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    authFetch(`/admin/api/users/${username}/avatar`)
      .then(r => r.json())
      .then(d => { if (d.avatar_url) setAvatarUrl(d.avatar_url); })
      .catch(() => {});
  }, [username]);

  // ── Load data ─────────────────────────────────────────────────────────────

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, calRes, apRes, sRes] = await Promise.all([
        authFetch('/admin/api/clients'),
        authFetch('/admin/api/calendar'),
        authFetch('/admin/api/approvals'),
        authFetch('/admin/api/sessions/summary?limit=200'),
      ]);
      const [cData, calData, apData, sData] = await Promise.all([
        cRes.json(), calRes.json(), apRes.json(), sRes.json(),
      ]);

      const allClients: Record<string, unknown>[] = cData.clients || [];
      const now = new Date();

      // — Assigned client names/emails/messengerIds for filtering —
      const assignedNames = new Set<string>();
      const assignedEmails = new Set<string>();
      // Also collect client IDs for direct ID-based matching
      const assignedClientIds = new Set<number>();
      // Collect messenger_id (used for both Messenger & Instagram clients)
      // session_id format: "messenger_{sender_id}" or "instagram_{sender_id}"
      const assignedMessengerIds = new Set<string>();

      const myClients = allClients.filter(c => {
        const assigned = isClientAssignedToMe(c, username, fullName);
        if (assigned) {
          const cd = parseCustomData(c.custom_data);
          const name = ((cd.nev || cd.name || c.name || '') as string).toLowerCase().trim();
          const email = ((cd.email || c.email || '') as string).toLowerCase().trim();
          const messengerId = ((cd.messenger_id || '') as string).trim();
          if (name) assignedNames.add(name);
          if (email) assignedEmails.add(email);
          if (c.id) assignedClientIds.add(Number(c.id));
          if (messengerId) assignedMessengerIds.add(messengerId);
        }
        return assigned;
      });
      setClientCount(myClients.length);


      // — Calendar events assigned to me —
      const allEvents: Record<string, unknown>[] = calData.events || [];
      const myEvents = allEvents.filter(ev => {
        // Direct client_id match
        if (ev.client_id && assignedClientIds.has(Number(ev.client_id))) return true;
        const attendee = ((ev.attendee || '') as string).toLowerCase().trim();
        const attendeeEmail = ((ev.attendee_email || '') as string).toLowerCase().trim();
        const title = ((ev.title || '') as string).toLowerCase().trim();
        // Exact email match
        if (attendeeEmail && assignedEmails.has(attendeeEmail)) return true;
        // Exact name match
        if (attendee && assignedNames.has(attendee)) return true;
        // Partial name match: check if attendee contains any assigned name or vice versa
        for (const name of assignedNames) {
          if (!name) continue;
          if (attendee && (attendee.includes(name) || name.includes(attendee))) return true;
          if (title && title.includes(name)) return true;
        }
        // Partial email match
        for (const email of assignedEmails) {
          if (!email) continue;
          if (attendeeEmail && attendeeEmail === email) return true;
          if (title && title.includes(email)) return true;
        }
        return false;
      });


      // — Next appointment —
      const futureEvents = myEvents
        .filter(ev => new Date(ev.start_dt as string) > now)
        .sort((a, b) => new Date(a.start_dt as string).getTime() - new Date(b.start_dt as string).getTime());
      if (futureEvents.length > 0) {
        const next = futureEvents[0];
        const nextDt = new Date(next.start_dt as string);
        setNextAppointment({
          text: nextDt.toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          sub: (next.attendee || next.title || 'naptárban') as string,
        });
      } else {
        setNextAppointment({ text: 'Nincs közelgő', sub: 'naptárban' });
      }

      // — Build todos ───────────────────────────────────────────────────────
      const newTodos: Todo[] = [];

      // a) Calendar events → todos
      myEvents.forEach(ev => {
        const evDt = new Date(ev.start_dt as string);
        const helperObj = {
          type: 'calendar',
          approval_status: ev.completed === true ? 'approved' : 'pending',
          topic: (ev.title || '') as string,
        };
        newTodos.push({
          id: String(ev.id),
          type: 'calendar',
          desc: (ev.title || 'Időpont') as string,
          sub: (ev.attendee || '') as string,
          client: (ev.attendee || '') as string,
          clientId: null,
          badge: 'idopont',
          badgeLabel: 'Időpont',
          date: evDt,
          createdAt: evDt,
          completed: ev.completed === true,
          csatorna: 'Email',
          ugyTipus: detectUgyTipus(helperObj),
          eredmeny: detectEredmeny(helperObj),
          teendo: detectTeendo(helperObj),
          statusz: detectStatusz(helperObj),
        });
      });

      // b) Pending approvals → todos
      const allApprovals: Record<string, unknown>[] = apData.approvals || [];
      const myApprovals = allApprovals.filter(a => {
        if (isAdmin) return true;

        // If client/interaction is unassigned, allow anyone to see it
        let isUnassigned = true;
        if (a.client_id) {
          const clientObj = allClients.find(c => Number(c.id) === Number(a.client_id));
          if (clientObj) {
            const cd = parseCustomData(clientObj.custom_data);
            const felelos = ((cd.felelos || cd.assigned_to || '') as string).trim();
            if (felelos) {
              isUnassigned = false;
            }
          }
        }
        if (isUnassigned) return true;

        // Direct client_id match
        if (a.client_id && assignedClientIds.has(Number(a.client_id))) return true;
        let draftData: Record<string, unknown> = {};
        try { draftData = JSON.parse((a.ai_draft_response || '{}') as string); } catch { /* */ }
        if (draftData.campaign_name) return true;
        const toName = ((draftData.to_name || '') as string).toLowerCase().trim();
        if (toName && assignedNames.has(toName)) return true;
        // Partial name match for approvals
        for (const name of assignedNames) {
          if (name && toName && (toName.includes(name) || name.includes(toName))) return true;
        }
        const toEmail = ((draftData.to_email || '') as string).toLowerCase().trim();
        if (toEmail && assignedEmails.has(toEmail)) return true;
        const sid = ((a.session_id || '') as string).toLowerCase();
        for (const email of assignedEmails) { if (email && sid.includes(email)) return true; }
        // Match by messenger_id: session_id is "instagram_{sender_id}" or "messenger_{sender_id}"
        // and draft sender_id matches the client's messenger_id
        const draftSenderId = ((draftData.sender_id || '') as string).trim();
        if (draftSenderId && assignedMessengerIds.has(draftSenderId)) return true;
        for (const mid of assignedMessengerIds) {
          if (mid && sid.includes(mid)) return true;
        }
        return false;
      });


      myApprovals.filter(a => a.approval_status === 'pending').forEach(ap => {
        const apDt = ap.created_at ? new Date(ap.created_at as string) : new Date();
        const deadlineDt = new Date(apDt.getTime() + 2 * 60 * 60 * 1000);
        let clientName = 'Ismeretlen';
        let draftChannel = '';
        try {
          const draft = JSON.parse((ap.ai_draft_response || '{}') as string);
          clientName = draft.to_name || draft.sender_id || 'Ismeretlen';
          draftChannel = draft.channel || '';
        } catch { /* */ }

        const helperObj = {
          topic: (ap.topic || '') as string,
          handover_reason: (ap.handover_reason || '') as string,
          approval_status: (ap.approval_status || '') as string,
          alert_tags: (ap.alert_tags || []) as string[],
          type: 'approval',
          badge: 'jovahagyas',
        };
        newTodos.push({
          id: 'approval-' + (ap.id || Math.random()),
          type: 'approval',
          desc: 'Válasz jóváhagyása szükséges' + (ap.channel ? ` — ${ap.channel}` : ''),
          sub: clientName !== 'Ismeretlen' ? clientName : '',
          client: clientName,
          clientId: (ap.client_id || null) as number | null,
          badge: 'jovahagyas',
          badgeLabel: 'Jóváhagyás',
          date: deadlineDt,
          createdAt: apDt,
          completed: false,
          interactionId: (ap.id || null) as number | null,
          sessionId: (ap.session_id || null) as string | null,
          aiDraftResponse: (ap.ai_draft_response || null) as string | null,
          ai_draft_response: (ap.ai_draft_response || null) as string | null,
          approvalStatus: (ap.approval_status || null) as string | null,
          approval_status: (ap.approval_status || null) as string | null,
          channel: draftChannel || null,
          topic: (ap.topic || null) as string | null,
          csatorna: detectTodoChannel({ channel: draftChannel, sessionId: ap.session_id as string, type: 'approval' }),
          ugyTipus: detectUgyTipus(helperObj),
          eredmeny: detectEredmeny(helperObj),
          teendo: detectTeendo(helperObj),
          statusz: detectStatusz(helperObj),
        });
      });

      // c) Session handovers → todos
      const allSessions: Record<string, unknown>[] = sData.sessions || [];
      const mySessions = allSessions.filter(s => {
        if (isAdmin) return true;

        // If client/session is unassigned, allow anyone to see it
        let isUnassigned = true;
        if (s.client_id) {
          const clientObj = allClients.find(c => Number(c.id) === Number(s.client_id));
          if (clientObj) {
            const cd = parseCustomData(clientObj.custom_data);
            const felelos = ((cd.felelos || cd.assigned_to || '') as string).trim();
            if (felelos) {
              isUnassigned = false;
            }
          }
        }
        if (isUnassigned) return true;

        // Direct client_id match
        if (s.client_id && assignedClientIds.has(Number(s.client_id))) return true;
        const participant = ((s.participant || s.client_name || '') as string).toLowerCase().trim();
        const sid = ((s.session_id || '') as string).toLowerCase();
        // Exact name match
        if (participant && assignedNames.has(participant)) return true;
        // Partial name match
        for (const name of assignedNames) {
          if (name && participant && (participant.includes(name) || name.includes(participant))) return true;
        }
        for (const email of assignedEmails) { if (email && sid.includes(email)) return true; }
        // Match by messenger_id: session_id is "instagram_{sender_id}" or "messenger_{sender_id}"
        for (const mid of assignedMessengerIds) {
          if (mid && sid.includes(mid)) return true;
        }
        return false;
      });


      mySessions
        .filter(s => s.handover_reason && (s.handover_reason as string).trim() !== '')
        .slice(0, 30)
        .forEach(s => {
          const hr = ((s.handover_reason || '') as string).toLowerCase();
          const as_ = ((s.approval_status || '') as string).toLowerCase();
          let badge = 'egyeb', badgeLabel = 'Teendő';
          if (hr.includes('sürgős') || hr.includes('panasz')) { badge = 'surgos'; badgeLabel = 'Sürgős'; }
          else if (as_ === 'pending') return;
          else if (hr.includes('visszahív')) { badge = 'visszahivas'; badgeLabel = 'Visszahívás'; }
          else if (hr.includes('válasz')) { badge = 'valasz'; badgeLabel = 'Válasz'; }
          else if (hr.includes('intézked') || hr.includes('véglegesít')) { badge = 'intezked'; badgeLabel = 'Intézkedés'; }
          if (as_ === 'approved' || as_ === 'rejected' || as_ === 'spam') return;

          const sDt = s.started_at ? new Date(s.started_at as string) : new Date();
          let deadlineDt: Date;
          if (badge === 'surgos') deadlineDt = new Date(sDt);
          else if (badge === 'visszahivas' || badge === 'valasz') deadlineDt = new Date(sDt.getTime() + 4 * 60 * 60 * 1000);
          else deadlineDt = new Date(sDt.getTime() + 24 * 60 * 60 * 1000);

          const clientName = ((s.participant || s.client_name || 'Ismeretlen') as string);

          const helperObj = {
            topic: (s.handover_reason || '') as string,
            desc: (s.handover_reason || '') as string,
            handover_reason: (s.handover_reason || '') as string,
            type: 'interaction',
            approval_status: (s.approval_status || '') as string,
            badge,
            alert_tags: (s.alert_tags || []) as string[],
          };
          newTodos.push({
            id: 'session-' + (s.id || s.session_id || Math.random()),
            type: 'interaction',
            desc: (s.handover_reason || 'Interakciós teendő') as string,
            sub: (s.channel || '') as string,
            client: clientName,
            clientId: (s.client_id || null) as number | null,
            badge,
            badgeLabel,
            date: deadlineDt,
            createdAt: sDt,
            completed: false,
            csatorna: detectTodoChannel({ sessionId: (s.session_id || '') as string }),
            ugyTipus: detectUgyTipus(helperObj),
            eredmeny: detectEredmeny(helperObj),
            teendo: detectTeendo(helperObj),
            statusz: detectStatusz(helperObj),
          });
        });

      // Restore completed state from localStorage
      const completedIds = getCompletedIds();
      newTodos.forEach(t => {
        if (completedIds.includes(String(t.id))) t.completed = true;
      });

      // Sort: not completed first, then by date desc
      newTodos.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return b.date.getTime() - a.date.getTime();
      });

      setTodos(newTodos);
    } catch (e) {
      console.error('Member dashboard error', e);
    } finally {
      setLoading(false);
    }
  }, [username, fullName]);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  // ── Toggle todo completed ──────────────────────────────────────────────────

  const toggleTodoCompleted = useCallback((todoId: string, completed: boolean) => {
    setTodos(prev => {
      const next = prev.map(t => t.id === todoId ? { ...t, completed } : t);
      // Persist
      const ids = getCompletedIds();
      if (completed && !ids.includes(todoId)) ids.push(todoId);
      else if (!completed) {
        const idx = ids.indexOf(todoId);
        if (idx >= 0) ids.splice(idx, 1);
      }
      saveCompletedIds(ids);
      return next;
    });
  }, []);

  // ── Computed counts ────────────────────────────────────────────────────────

  const now = useMemo(() => new Date(), []);
  const todayStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);
  const todayEnd = useMemo(() => new Date(todayStart.getTime() + 86400000), [todayStart]);

  const counts = useMemo(() => {
    const today = todos.filter(t => !t.completed && t.date >= todayStart && t.date < todayEnd).length;
    const overdue = todos.filter(t => !t.completed && t.date < todayStart).length;
    const completed = todos.filter(t => t.completed).length;
    const all = todos.filter(t => !t.completed).length;
    return { today, overdue, completed, all };
  }, [todos, todayStart, todayEnd]);

  // ── Filtered todos ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    switch (filter) {
      case 'today': return todos.filter(t => !t.completed && t.date >= todayStart && t.date < todayEnd);
      case 'overdue': return todos.filter(t => t.date < todayStart && !t.completed);
      case 'upcoming': return todos.filter(t => t.date >= todayEnd && !t.completed);
      case 'completed': return todos.filter(t => t.completed);
      default: return todos;
    }
  }, [todos, filter, todayStart, todayEnd]);

  // ── Deadline formatting ────────────────────────────────────────────────────

  function formatDeadline(d: Date, completed: boolean): { text: string; cls: string } {
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (d < todayStart && !completed) {
      const daysAgo = Math.abs(diffDays);
      return { text: daysAgo === 0 ? 'Ma' : `${daysAgo} napja lejárt`, cls: 'overdue' };
    } else if (d >= todayStart && d < todayEnd) {
      return { text: 'Ma, ' + d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }), cls: 'today' };
    } else if (diffDays === 1) {
      return { text: 'Holnap, ' + d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }), cls: 'future' };
    } else {
      let text = d.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
      if (d.getHours() > 0 || d.getMinutes() > 0) {
        text += ' ' + d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
      }
      return { text, cls: 'future' };
    }
  }

  const typeIcon = (_type: string) => '';

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-row member-loading-center">
        <div className="spinner spinner--brand" />
      </div>
    );
  }

  // ── Client Detail overlay ──
  if (selectedClientId) {
    const clientRaw = hookClients.find((c) => String(c.id) === selectedClientId);
    if (clientRaw) {
      const cd = parseCustomData(clientRaw.custom_data);
      const enriched = {
        id: clientRaw.id,
        name: bestClientName(clientRaw) || clientRaw.name || 'Névtelen',
        email: (cd?.email as string) || clientRaw.email || '',
        phone: (cd?.telefonszam as string) || (cd?.phone as string) || (cd?.telefon as string) || clientRaw.phone || '',
        status: clientRaw.status || '',
        created_at: clientRaw.created_at || '',
        tags: (cd?.tags as string[]) || [],
        assignee: (cd?.assigned_to as string) || '',
        lastInteraction: '',
        appointmentCount: 0,
        isNew: true,
        isInactive: false,
        raw: clientRaw,
      };
      return (
        <ClientDetailView
          client={enriched}
          clientsMap={clientsMap}
          sessions={hookSessions}
          events={events}
          source="interactions"
          onBack={() => setSelectedClientId(null)}
          onRefresh={refetchSessions}
        />
      );
    }
  }

  return (
    <div id="member-analytics-shell" className="member-dashboard-shell">
      {/* ── Greeting ──────────────────────────────────────────────────────── */}
      <div className="mb-28">
        <div className="flex-row gap-12 mb-6">
          <div
            id="member-avatar"
            className={`member-avatar ${avatarUrl ? 'member-avatar--transparent' : 'member-avatar--gradient'}`}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="member-avatar-img" />
            ) : initials}
          </div>
          <div>
            <h2 className="member-greeting-title">
              Szia, <strong>{firstName}</strong>!
            </h2>
            <p className="member-greeting-date">
              {formatGreetingDate(now)}
            </p>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="m-kpi-grid">
        {/* Assigned clients */}
        <div className="m-kpi-card">
          <div className="m-kpi-header">
            <div className="m-kpi-label">Hozzám rendelt ügyfelek</div>
            <div className="m-kpi-icon m-kpi-icon--teal">
              <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
          </div>
          <div className="m-kpi-value m-kpi-value--accent">{clientCount}</div>
          <div className="m-kpi-sub">aktív ügyfél</div>
        </div>

        {/* Next appointment */}
        <div className="m-kpi-card">
          <div className="m-kpi-header">
            <div className="m-kpi-label">Következő időpont</div>
            <div className="m-kpi-icon m-kpi-icon--purple">
              <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
          </div>
          <div className="m-kpi-value m-kpi-value--sm">{nextAppointment.text}</div>
          <div className="m-kpi-sub">{nextAppointment.sub}</div>
        </div>
      </div>

      {/* ── Todos Section ─────────────────────────────────────────────────── */}
      <div className="m-card todo-section">
        <div className="todo-section-header">
          <div className="todo-section-title">
            <div className="m-card-title-icon m-card-title-icon--amber">
              <svg fill="none" stroke="#f59e0b" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            Teendők
            <span className="todo-section-count">{counts.all}</span>
          </div>
          <div className="flex-row gap-8">
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as TodoFilter)}
              className="todo-filter-select"
            >
              <option value="all">Minden teendő</option>
              <option value="today">Mai teendők</option>
              <option value="overdue">Lejárt</option>
              <option value="upcoming">Közelgő</option>
              <option value="completed">Lezárt</option>
            </select>
          </div>
        </div>

        {/* Summary cards */}
        <div className="todo-summary-grid">
          <div className="todo-summary-card todo-summary-card--today" onClick={() => setFilter('today')}>
            <div className="todo-summary-row">
              <span className="todo-summary-emoji">📋</span>
              <span className="todo-summary-lbl-today">Mai teendők</span>
            </div>
            <div className="todo-summary-num-today">{counts.today}</div>
          </div>
          <div className="todo-summary-card todo-summary-card--overdue" onClick={() => setFilter('overdue')}>
            <div className="todo-summary-row">
              <span className="todo-summary-emoji">🔴</span>
              <span className="todo-summary-lbl-overdue">Lejárt teendők</span>
            </div>
            <div className="todo-summary-num-overdue">{counts.overdue}</div>
          </div>
          <div className="todo-summary-card todo-summary-card--done" onClick={() => setFilter('completed')}>
            <div className="todo-summary-row">
              <span className="todo-summary-emoji">✅</span>
              <span className="todo-summary-lbl-done">Lezárt teendők</span>
            </div>
            <div className="todo-summary-num-done">{counts.completed}</div>
          </div>
          <div className="todo-summary-card todo-summary-card--all" onClick={() => setFilter('all')}>
            <div className="todo-summary-row">
              <span className="todo-summary-lbl-all-bullet">●</span>
              <span className="todo-summary-lbl-all">Összes teendő</span>
            </div>
            <div className="todo-summary-num-all">{counts.all}</div>
          </div>
        </div>

        {/* Section header */}
        <div className="todo-filter-section-lbl">
          {filter === 'overdue' ? 'Lejárt teendők' : filter === 'today' ? 'Mai teendők' : filter === 'completed' ? 'Lezárt ügyek' : 'Sürgős / Nyitott státuszú ügyek'} ({filtered.length})
        </div>

        {/* Todos table */}
        <div className="int-table-wrapper todo-table-scroll">
          <table className="data-table int-table-norx data-table--full">
            <thead className="int-thead">
              <tr>
                <th>Dátum</th>
                <th>Ügyfél</th>
                <th>Csatorna</th>
                <th>Ügytípus</th>
                <th>Eredmény</th>
                <th>Státusz</th>
                <th>Teendő</th>
                <th className="int-checkbox-col">Elvégzett</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr className="int-row">
                  <td colSpan={8} className="int-td--pad40">
                    <span className="no-data">
                      {filter === 'all' ? 'Nincs teendő — szuper!' : 'Nincs ilyen teendő.'}
                    </span>
                  </td>
                </tr>
              ) : (
                filtered.map(t => {
                  const teendoText = t.teendo || 'Nincs további teendő';
                  return (
                    <tr
                      key={t.id}
                      className={`int-row cursor-pointer${t.completed ? ' completed' : ''}`}
                      style={{ opacity: t.completed ? 0.5 : 1 }}
                      onClick={() => setSummaryModalRow(mapTodoToInteractionRow(t))}
                    >
                      {/* Dátum */}
                      <td className="int-td int-td--date">
                        <div className="int-date-cell">{formatTodoDatum(t.createdAt || t.date)}</div>
                      </td>
                      {/* Ügyfél */}
                      <td className="int-td" onClick={e => e.stopPropagation()}>
                        {t.client && t.client !== 'Ismeretlen' ? (
                          <button
                            className="int-client-link"
                            title="Ugrás az ügyfél adatlapjára"
                            onClick={() => {
                              if (t.clientId) {
                                setSelectedClientId(String(t.clientId));
                              } else {
                                const found = hookClients.find(c => {
                                  const cd = parseCustomData(c.custom_data);
                                  const cName = ((cd.nev || cd.name || c.name || '') as string).toLowerCase().trim();
                                  return cName === t.client.toLowerCase().trim();
                                });
                                if (found) setSelectedClientId(String(found.id));
                              }
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = '#0d9488'; e.currentTarget.style.color = '#0f766e'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = 'transparent'; e.currentTarget.style.color = '#0d9488'; }}
                          >
                            {t.client}
                          </button>
                        ) : (
                          <span className="int-client-unknown">{t.client || <span className="no-data">Ismeretlen</span>}</span>
                        )}
                      </td>
                      {/* Csatorna */}
                      <td className="int-td int-td--channel">
                        {t.csatorna || '—'}
                      </td>
                      {/* Ügytípus */}
                      <td className="int-td">
                        <span className="int-type-label">{t.ugyTipus || 'EGYÉB'}</span>
                      </td>
                      {/* Eredmény */}
                      <td className="int-td">
                        <EredmenyBadge value={t.eredmeny || 'Rögzítve'} />
                      </td>
                      {/* Státusz */}
                      <td className="int-td">
                        <StatuszBadge value={t.statusz || 'LEZÁRT'} />
                      </td>
                      {/* Teendő */}
                      <td className="int-td int-td--truncate" title={teendoText}>
                        <span className="int-teendo-text">{teendoText}</span>
                      </td>
                      {/* Checkbox */}
                      <td className="int-checkbox-col int-td-checkbox" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="int-checkbox-input"
                          checked={t.completed}
                          onChange={e => toggleTodoCompleted(t.id, e.target.checked)}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {summaryModalRow && (
        <InteractionSummaryModal
          row={summaryModalRow}
          onClose={() => setSummaryModalRow(null)}
          clients={hookClients}
          clientsMap={clientsMap}
          onClientClick={(id) => {
            setSummaryModalRow(null);
            setSelectedClientId(id);
          }}
          autoExpandApproval={summaryModalRow.type === 'approval'}
          onApproved={() => {
            refetchSessions();
            loadDashboardData();
          }}
        />
      )}
    </div>
  );
}
