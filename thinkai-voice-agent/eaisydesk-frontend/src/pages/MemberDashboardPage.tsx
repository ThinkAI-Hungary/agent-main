/**
 * MemberDashboardPage – "Irányítópult" for member users.
 * Mimics InteractionsPage (assigned client interactions only).
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApproval } from '../context/ApprovalContext';
import { authFetch } from '../api/client';
import { useClients } from '../hooks/useClients';
import { useSessions, type SessionSummary, type SessionInteraction } from '../hooks/useSessions';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import ClientDetailView from '../components/clients/ClientDetailView';
import {
  resolveClientName,
  getRowChannel,
  parseCustomData,
  isAssignedToMe,
  bestClientName,
} from '../helpers/clientResolvers';
import { StatuszBadge, DirectionBadge } from '../components/ui/Badge';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { showToast } from '../components/ui/Toast';
import InteractionSummaryModal from '../components/interactions/InteractionSummaryModal';
import {
  detectStatusz,
  detectUgyTipus,
  detectEredmeny,
  detectTeendo,
} from '../helpers/interactionClassifiers';
import { fmtDt, cleanStr } from '../helpers/formatters';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import type { InteractionRow } from './InteractionsPage';

// ── Column visibility keys ──
const ALL_COLUMNS = [
  { key: 'date', label: 'Időpont' },
  { key: 'client', label: 'Ügyfél' },
  { key: 'channel', label: 'Csatorna' },
  { key: 'direction', label: 'Irány' },
  { key: 'ugyTipus', label: 'Ügytípus' },
  { key: 'eredmeny', label: 'Eredmény' },
  { key: 'statusz', label: 'Státusz' },
  { key: 'teendo', label: 'Teendő' },
  { key: 'done', label: 'Elvégezve' },
] as const;

// ── Filter options ──
const UGYTIPUS_OPTIONS = ['Időpont', 'Kérdés', 'Kérés', 'Panasz', 'Egyéb'];
const CSATORNA_OPTIONS = ['Messenger', 'Telefon', 'Email', 'Instagram', 'WhatsApp'];
const IRANY_OPTIONS = ['Bejövő', 'Kimenő'];
const STATUSZ_OPTIONS = ['Lezárt', 'Nyitott', 'Sürgős'];

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Legújabb elöl' },
  { value: 'date_asc', label: 'Legrégebbi elöl' },
  { value: 'client_asc', label: 'Ügyfélnév szerint A–Z' },
  { value: 'topic_asc', label: 'Ügytípus szerint A–Z' },
];

const DAYS_HU = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
const MONTHS_HU = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];

function formatGreetingDate(d: Date): string {
  return `${d.getFullYear()}. ${MONTHS_HU[d.getMonth()]} ${d.getDate()}., ${DAYS_HU[d.getDay()]}`;
}

export default function MemberDashboardPage() {
  const isMobile = useIsMobile(768);
  const { user, isAdmin } = useAuth();
  const { openApproval, registerOnApproved } = useApproval();
  const navigate = useNavigate();
  
  const { clients: hookClients, clientsMap, loading: loadingClients } = useClients();
  const { sessions: hookSessions, loading: loadingSessions, refetch: refetchSessions } = useSessions(100);
  const { events, loading: loadingEvents } = useCalendarEvents();
  const { confirm, ConfirmDialog } = useConfirm();

  const pullInteractions = usePullToRefresh({ onRefresh: refetchSessions, enabled: isMobile });

  // Register refetch so approval triggers data refresh
  useEffect(() => {
    registerOnApproved(refetchSessions);
  }, [registerOnApproved, refetchSessions]);

  // ── Kézi teendők (ügyfélprofil „Teendő hozzáadása" → tasks tábla) ──
  const [manualTasks, setManualTasks] = useState<Array<{ id: number; text: string; priority: string; completed: number; created_at: string; client_id: number | null }>>([]);
  const loadManualTasks = useCallback(async () => {
    try {
      const res = await authFetch('/admin/api/tasks');
      if (res.ok) {
        const d = await res.json();
        setManualTasks(Array.isArray(d.tasks) ? d.tasks : []);
      }
    } catch { /* néma — a dashboard többi része működik nélküle is */ }
  }, []);
  useEffect(() => { loadManualTasks(); }, [loadManualTasks]);

  const handleMarkDone = async (e: React.MouseEvent, row: InteractionRow) => {
    e.stopPropagation();
    // Kézi teendő: completed toggle (a Lezárt szűrőből újra nyitható)
    const manual = row as InteractionRow & { isManual?: boolean; taskId?: number; taskCompleted?: boolean };
    if (manual.isManual && manual.taskId) {
      try {
        const res = await authFetch(`/admin/api/tasks/${manual.taskId}/complete`, { method: 'PATCH' });
        if (!res.ok) throw new Error('task toggle failed');
        showToast(manual.taskCompleted ? 'Teendő újraaktiválva' : 'Teendő elkészültnek jelölve', 'success');
        loadManualTasks();
      } catch {
        showToast('Hiba a teendő frissítésekor', 'error');
      }
      return;
    }
    if (row.statusz === 'Lezárt') return;

    try {
      const response = await authFetch(`/admin/api/interactions/${row.interactionId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'lezárt' }),
      });

      if (!response.ok) throw new Error('Failed to update status');
      
      showToast('Interakció lezárva', 'success');
      refetchSessions();
    } catch (err) {
      console.error('Error marking done:', err);
      showToast('Hiba a lezárás során', 'error');
    }
  };

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');
  const [filterOpen, setFilterOpen] = useState(false);
  const [colDropdownOpen, setColDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(ALL_COLUMNS.map((c) => c.key))
  );
  
  const [summaryModalRow, setSummaryModalRow] = useState<InteractionRow | null>(null);
  const [autoExpandApproval, setAutoExpandApproval] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Filters
  const [filterUgyTipus, setFilterUgyTipus] = useState<Set<string>>(new Set());
  const [filterCsatorna, setFilterCsatorna] = useState<Set<string>>(new Set());
  const [filterIrany, setFilterIrany] = useState<Set<string>>(new Set());
  const [filterStatusz, setFilterStatusz] = useState<Set<string>>(new Set());
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Dashboard quick filters
  const [dashboardFilter, setDashboardFilter] = useState<'all' | 'today' | 'overdue' | 'completed'>('all');

  const filterContainerRef = useRef<HTMLDivElement>(null);
  const colDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  const username = user?.username || '';
  const fullName = user?.fullName || '';
  const firstName = fullName ? fullName.split(' ').pop() || fullName : username;
  const initials = fullName
    ? fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : username.substring(0, 2).toUpperCase();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Load avatar
  useEffect(() => {
    if (!username) return;
    authFetch(`/admin/api/users/${username}/avatar`)
      .then(r => r.json())
      .then(d => { if (d.avatar_url) setAvatarUrl(d.avatar_url); })
      .catch(() => {});
  }, [username]);

  // Outside click to close dropdowns
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterContainerRef.current && !filterContainerRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
      if (colDropdownRef.current && !colDropdownRef.current.contains(e.target as Node)) {
        setColDropdownOpen(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // ── Compile flat rows (copied 1:1 from InteractionsPage.tsx) ──
  const allRows = useMemo<InteractionRow[]>(() => {
    const rows: InteractionRow[] = [];
    const sessions = hookSessions;
    const clients = hookClients;

    sessions.forEach((s: SessionSummary) => {
      const sessionDate = s.started_at || '';
      const sRoom = (s.room_name || '').toLowerCase();

      if (s.interactions && s.interactions.length > 0) {
        s.interactions.forEach((r: SessionInteraction) => {
          if (r.approval_status === 'spam') return;

          const clientInfo = resolveClientName(
            r,
            { session_id: s.session_id, participant: s.participant, client_name: s.client_name },
            clientsMap,
            clients
          );

          let clientTags: string[] = [];
          if (clientInfo.id && clientsMap[String(clientInfo.id)]) {
            const cd = parseCustomData(clientsMap[String(clientInfo.id)].custom_data);
            clientTags = (cd?.tags as string[]) || [];
          }

          rows.push({
            date: r.created_at || sessionDate,
            channel: getRowChannel(r.type || '', sRoom, s.session_id || '', s.channel),
            client: clientInfo.name,
            clientId: clientInfo.id,
            clientStatus: clientInfo.status,
            clientCreatedAt: clientInfo.created_at,
            direction: (r.direction || 'inbound').toLowerCase() === 'outbound' ? 'Kimenő' : 'Bejövő',
            ugyTipus: detectUgyTipus(r),
            eredmeny: detectEredmeny(r),
            statusz: detectStatusz(r),
            teendo: detectTeendo(r),
            tags: clientTags,
            type: r.type || '-',
            topic: r.topic || '-',
            summary: r.summary || '-',
            result: r.result || '',
            interactionId: r.id || null,
            sessionId: s.session_id || null,
            ai_draft_response: r.ai_draft_response || null,
            approval_status: r.approval_status || null,
          });
        });
      } else {
        const clientInfo = resolveClientName(
          {},
          { session_id: s.session_id, participant: s.participant, client_name: s.client_name },
          clientsMap,
          clients
        );
        rows.push({
          date: sessionDate,
          channel: getRowChannel('', sRoom, s.session_id || '', s.channel),
          client: clientInfo.name,
          clientId: clientInfo.id,
          clientStatus: clientInfo.status,
          clientCreatedAt: clientInfo.created_at,
          direction: 'Bejövő',
          ugyTipus: detectUgyTipus({ topic: '', summary: s.summary || '' }),
          eredmeny: detectEredmeny({ topic: '', summary: s.summary || '', approval_status: 'approved' }),
          statusz: 'Lezárt',
          teendo: 'Nincs további teendő',
          tags: [],
          type: 'session',
          topic: '-',
          summary: s.summary || '-',
          result: '',
          interactionId: null,
          sessionId: s.session_id || null,
          ai_draft_response: null,
          approval_status: null,
        });
      }
    });
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return rows;
  }, [hookSessions, hookClients, clientsMap]);

  // ── EAISY-241 §4: Minden nyitott/sürgős ügy bekerül, felelőstől függetlenül.
  // Lezárt ügyeknél marad az assignee-szűrés (azokat csak a saját klienseidnél látod).
  const myRows = useMemo(() => {
    return allRows.filter(r => {
      const sz = (r.statusz || '').toLowerCase();
      const isOpenOrUrgent = sz === 'nyitott' || sz === 'sürgős' || sz === 'surgos';
      if (isOpenOrUrgent) return true;   // minden nyitott/sürgős ügy — felelőstől függetlenül
      // Lezáttaknál assignee-szűrés
      if (!r.clientId) return false;
      const client = clientsMap[String(r.clientId)];
      if (!client) return false;
      return isAssignedToMe(client, username, fullName);
    });
  }, [allRows, clientsMap, username, fullName]);

  // ── Kézi teendők sorokká alakítva (ügyfélprofil „Teendő hozzáadása") ──
  const manualRows = useMemo(() => {
    return manualTasks
      .filter((t) => t.client_id)
      .map((t) => {
        const client = clientsMap[String(t.client_id)];
        const clientName = client ? (bestClientName(client) || client.name || 'Névtelen') : 'Névtelen';
        return {
          date: t.created_at || '',
          channel: 'Hozzáadott feladat',
          client: clientName,
          clientId: t.client_id,
          clientStatus: null,
          clientCreatedAt: null,
          direction: '',
          ugyTipus: '',
          eredmeny: '',
          statusz: t.completed ? 'Lezárt' : (t.priority === 'high' ? 'Sürgős' : 'Nyitott'),
          teendo: t.text,
          tags: [] as string[],
          type: 'task',
          topic: '',
          summary: '',
          result: '',
          interactionId: null,
          sessionId: null,
          ai_draft_response: null,
          approval_status: null,
          isManual: true,
          taskId: t.id,
          taskCompleted: !!t.completed,
        };
      });
  }, [manualTasks, clientsMap]);

  const combinedRows = useMemo(() => [...manualRows, ...myRows], [manualRows, myRows]);

  // ── KPI Calculations ──
  const myClients = useMemo(() => {
    return hookClients.filter(c => isAssignedToMe(c, username, fullName));
  }, [hookClients, username, fullName]);

  const clientCount = myClients.length;

  const nextAppointment = useMemo(() => {
    const now = new Date();
    const assignedClientIds = new Set(myClients.map(c => Number(c.id)));
    const assignedNames = new Set(myClients.map(c => (bestClientName(c) || c.name || '').toLowerCase().trim()));
    const assignedEmails = new Set(myClients.map(c => (c.email || '').toLowerCase().trim()));

    const myEvents = events.filter(ev => {
      if (ev.client_id && assignedClientIds.has(Number(ev.client_id))) return true;
      const attendee = ((ev.attendee || '') as string).toLowerCase().trim();
      const attendeeEmail = ((ev.attendee_email || '') as string).toLowerCase().trim();
      const title = ((ev.title || '') as string).toLowerCase().trim();
      if (attendeeEmail && assignedEmails.has(attendeeEmail)) return true;
      if (attendee && assignedNames.has(attendee)) return true;
      for (const name of assignedNames) {
        if (!name) continue;
        if (attendee && (attendee.includes(name) || name.includes(attendee))) return true;
        if (title && title.includes(name)) return true;
      }
      for (const email of assignedEmails) {
        if (!email) continue;
        if (attendeeEmail && attendeeEmail === email) return true;
        if (title && title.includes(email)) return true;
      }
      return false;
    });

    const futureEvents = myEvents
      .filter(ev => new Date(ev.start_dt as string) > now)
      .sort((a, b) => new Date(a.start_dt as string).getTime() - new Date(b.start_dt as string).getTime());

    if (futureEvents.length > 0) {
      const next = futureEvents[0];
      const nextDt = new Date(next.start_dt as string);
      return {
        text: nextDt.toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        sub: (next.attendee || next.title || 'naptárban') as string,
      };
    }
    return { text: 'Nincs közelgő', sub: 'naptárban' };
  }, [events, myClients]);

  // ── Calculate Today and Overdue thresholds ──
  const now = useMemo(() => new Date(), []);
  const todayStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);
  const todayEnd = useMemo(() => new Date(todayStart.getTime() + 86400000), [todayStart]);

  // ── Counts for summary cards ──
  const counts = useMemo(() => {
    let todayCount = 0;
    let overdueCount = 0;
    let completedCount = 0;
    let activeAllCount = 0;

    combinedRows.forEach((row) => {
      const r = row as typeof row & { isManual?: boolean; taskCompleted?: boolean };
      // Kézi feladatok: aktív → Összes aktív; kész → Lezárt (Mai/Lejárt nem vonatkozik rájuk)
      if (r.isManual) {
        if (r.taskCompleted) completedCount++;
        else activeAllCount++;
        return;
      }
      const rowDate = new Date(r.date);
      const isCompleted = r.statusz === 'Lezárt';
      if (isCompleted) {
        completedCount++;
      } else {
        activeAllCount++;
        if (rowDate >= todayStart && rowDate < todayEnd) {
          todayCount++;
        } else if (rowDate < todayStart) {
          overdueCount++;
        }
      }
    });

    return { today: todayCount, overdue: overdueCount, completed: completedCount, all: activeAllCount };
  }, [combinedRows, todayStart, todayEnd]);

  // ── Dashboard Quick Filters ──
  const dashboardFilteredRows = useMemo(() => {
    return combinedRows.filter((row) => {
      const r = row as typeof row & { isManual?: boolean; taskCompleted?: boolean };
      // Kézi feladatok: 'Minden aktív' alatt mindig látszanak, 'Lezárt' között a készük; Mai/Lejárt nem vonatkozik rájuk
      if (r.isManual) {
        if (dashboardFilter === 'completed') return r.taskCompleted;
        return !r.taskCompleted && dashboardFilter === 'all';
      }
      const rowDate = new Date(r.date);
      const isCompleted = r.statusz === 'Lezárt';
      if (dashboardFilter === 'completed') {
        return isCompleted;
      }
      if (isCompleted) return false;
      if (dashboardFilter === 'today') {
        return rowDate >= todayStart && rowDate < todayEnd;
      }
      if (dashboardFilter === 'overdue') {
        return rowDate < todayStart;
      }
      return true;
    });
  }, [combinedRows, dashboardFilter, todayStart, todayEnd]);

  // ── Searching + Dropdown Category Filters ──
  const filteredRows = useMemo(() => {
    const q = cleanStr(searchQuery);
    const rows = dashboardFilteredRows.filter((r) => {
      if (q) {
        const searchable = [r.channel, r.client, r.direction, r.ugyTipus, r.eredmeny, r.statusz, r.teendo, r.summary].join(' ');
        if (!cleanStr(searchable).includes(q)) return false;
      }
      if (filterUgyTipus.size > 0 && !r.ugyTipus.split(', ').some(t => filterUgyTipus.has(t))) return false;
      if (filterCsatorna.size > 0 && !filterCsatorna.has(r.channel)) return false;
      if (filterIrany.size > 0 && !filterIrany.has(r.direction)) return false;
      if (filterStatusz.size > 0 && !filterStatusz.has(r.statusz)) return false;
      if (filterDateFrom || filterDateTo) {
        const rd = (r.date || '').slice(0, 10);
        if (filterDateFrom && rd < filterDateFrom) return false;
        if (filterDateTo && rd > filterDateTo) return false;
      }
      return true;
    });

    rows.sort((a, b) => {
      if (sortBy === 'date_desc') return (b.date || '').localeCompare(a.date || '');
      if (sortBy === 'date_asc') return (a.date || '').localeCompare(b.date || '');
      if (sortBy === 'client_asc') return (a.client || '').localeCompare(b.client || '');
      if (sortBy === 'topic_asc') return (a.ugyTipus || '').localeCompare(b.ugyTipus || '');
      return 0;
    });

    return rows;
  }, [dashboardFilteredRows, searchQuery, sortBy, filterUgyTipus, filterCsatorna, filterIrany, filterStatusz, filterDateFrom, filterDateTo]);

  const activeFilterCount = filterUgyTipus.size + filterCsatorna.size + filterIrany.size + filterStatusz.size + (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0);

  // ── Filter helpers ──
  function toggleFilter(set: Set<string>, val: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  }

  function resetFilters() {
    setFilterUgyTipus(new Set());
    setFilterCsatorna(new Set());
    setFilterIrany(new Set());
    setFilterStatusz(new Set());
    setFilterDateFrom('');
    setFilterDateTo('');
  }

  function toggleCol(key: string) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── Loading state ──
  const isGlobalLoading = loadingClients || loadingSessions || loadingEvents;

  if (isGlobalLoading) {
    return (
      <div className="flex-row member-loading-center">
        <div className="spinner spinner--brand" />
      </div>
    );
  }

  // ── Client Detail Overlay ──
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
          source="member"
          onBack={() => setSelectedClientId(null)}
          onRefresh={refetchSessions}
        />
      );
    }
  }

  // ── Main Render ──
  return (
    <div id="member-analytics-shell" className="member-dashboard-shell">
      <ConfirmDialog />

      {/* Greeting */}
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

      {/* KPI Grid */}
      <div className="m-kpi-grid">
        <div className="m-kpi-card">
          <div className="m-kpi-header">
            <div className="m-kpi-label">Hozzám rendelt ügyfelek</div>
          </div>
          <div className="m-kpi-value m-kpi-value--accent">{clientCount}</div>
          <div className="m-kpi-sub">aktív ügyfél</div>
        </div>

        <div className="m-kpi-card">
          <div className="m-kpi-header">
            <div className="m-kpi-label">Következő időpont</div>
          </div>
          <div className="m-kpi-value m-kpi-value--sm">{nextAppointment.text}</div>
          <div className="m-kpi-sub">{nextAppointment.sub}</div>
        </div>
      </div>

      {/* Todos Section (Interactions log style) */}
      <div className="m-card todo-section card-container--overflow-visible">
        <div className="todo-section-header">
          <div className="todo-section-title">
            Teendők
            <span className="todo-section-count">{counts.all}</span>
          </div>
          <div className="flex-row gap-8">
            <select
              value={dashboardFilter}
              onChange={e => setDashboardFilter(e.target.value as typeof dashboardFilter)}
              className="todo-filter-select"
            >
              <option value="all">Minden aktív teendő</option>
              <option value="today">Mai teendők</option>
              <option value="overdue">Lejárt</option>
              <option value="completed">Lezárt</option>
            </select>
          </div>
        </div>

        {/* Summary cards */}
        <div className="todo-summary-grid">
          <div className={`todo-summary-card todo-summary-card--today${dashboardFilter === 'today' ? ' active' : ''}`} onClick={() => setDashboardFilter('today')}>
            <div className="todo-summary-row">
              <span className="todo-summary-lbl-today">Mai teendők</span>
            </div>
            <div className="todo-summary-num-today">{counts.today}</div>
          </div>
          <div className={`todo-summary-card todo-summary-card--overdue${dashboardFilter === 'overdue' ? ' active' : ''}`} onClick={() => setDashboardFilter('overdue')}>
            <div className="todo-summary-row">
              <span className="todo-summary-lbl-overdue">Lejárt teendők</span>
            </div>
            <div className="todo-summary-num-overdue">{counts.overdue}</div>
          </div>
          <div className={`todo-summary-card todo-summary-card--done${dashboardFilter === 'completed' ? ' active' : ''}`} onClick={() => setDashboardFilter('completed')}>
            <div className="todo-summary-row">
              <span className="todo-summary-lbl-done">Lezárt teendők</span>
            </div>
            <div className="todo-summary-num-done">{counts.completed}</div>
          </div>
          <div className={`todo-summary-card todo-summary-card--all${dashboardFilter === 'all' ? ' active' : ''}`} onClick={() => setDashboardFilter('all')}>
            <div className="todo-summary-row">
              <span className="todo-summary-lbl-all">Összes aktív</span>
            </div>
            <div className="todo-summary-num-all">{counts.all}</div>
          </div>
        </div>

        {/* Section title */}
        <div className="todo-filter-section-lbl">
          {dashboardFilter === 'overdue' ? 'Lejárt teendők' : dashboardFilter === 'today' ? 'Mai teendők' : dashboardFilter === 'completed' ? 'Lezárt interakciók' : 'Minden aktív teendő'} ({filteredRows.length})
        </div>

        {/* Desktop Toolbar strip */}
        {!isMobile && (
          <div className="toolbar-strip" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
            <div className="flex-row gap-12">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Keresés..."
                type="text"
                className="int-toolbar-input int-toolbar-input--w220"
              />
              {filteredRows.length > 0 && (
                <span className="text-desc font-semibold int-count-label">
                  {filteredRows.length} találat
                </span>
              )}
            </div>

            <div className="flex-row gap-8 flex-wrap">
              {/* Filter Section */}
              <div className="relative int-dropdown-wrap" ref={filterContainerRef}>
                <button
                  className="int-toolbar-btn flex-row gap-6"
                  title="Szűrés"
                  onClick={() => setFilterOpen(!filterOpen)}
                >
                  <svg fill="none" height="14" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                  </svg>
                  Szűrés
                  {activeFilterCount > 0 && (
                    <span className="int-filter-badge">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {filterOpen && (
                  <div className="dropdown-menu dropdown-menu--filter">
                    <div className="dropdown-header">Szűrők</div>
                    <div className="int-filter-list">
                      <FilterSection title="Dátum">
                        <div className="flex-row gap-8">
                          <input className="form-date int-date-input" type="date" lang="hu" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
                          <input className="form-date int-date-input" type="date" lang="hu" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
                        </div>
                      </FilterSection>
                      <FilterSection title="Ügytípus" bordered>
                        {UGYTIPUS_OPTIONS.map((v) => (
                          <FilterCheckbox key={v} label={v} checked={filterUgyTipus.has(v)} onChange={() => toggleFilter(filterUgyTipus, v, setFilterUgyTipus)} />
                        ))}
                      </FilterSection>
                      <FilterSection title="Csatorna" bordered>
                        {CSATORNA_OPTIONS.map((v) => (
                          <FilterCheckbox key={v} label={v} checked={filterCsatorna.has(v)} onChange={() => toggleFilter(filterCsatorna, v, setFilterCsatorna)} />
                        ))}
                      </FilterSection>
                      <FilterSection title="Irány" bordered>
                        {IRANY_OPTIONS.map((v) => (
                          <FilterCheckbox key={v} label={v} checked={filterIrany.has(v)} onChange={() => toggleFilter(filterIrany, v, setFilterIrany)} />
                        ))}
                      </FilterSection>
                      <FilterSection title="Státusz" bordered>
                        {STATUSZ_OPTIONS.map((v) => (
                          <FilterCheckbox key={v} label={v} checked={filterStatusz.has(v)} onChange={() => toggleFilter(filterStatusz, v, setFilterStatusz)} />
                        ))}
                      </FilterSection>
                    </div>
                    <div className="flex-row gap-8 int-filter-footer">
                      <button className="btn btn-outline int-filter-btn" onClick={resetFilters}>Visszaállítás</button>
                      <button className="btn btn-primary int-filter-btn" onClick={() => setFilterOpen(false)}>Alkalmaz</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Sort Selection */}
              <div className="relative int-dropdown-wrap" ref={sortDropdownRef}>
                <button
                  className="int-toolbar-btn flex-row gap-6"
                  onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                >
                  <svg fill="none" height="14" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14">
                    <path d="M3 6h18M6 12h12M9 18h6" />
                  </svg>
                  {SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Rendezés'}
                </button>
                {sortDropdownOpen && (
                  <div className="dropdown-menu dropdown-menu--sort">
                    {SORT_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        className={`dropdown-item ${sortBy === o.value ? 'active' : ''}`}
                        onClick={() => { setSortBy(o.value); setSortDropdownOpen(false); }}
                      >
                        {sortBy === o.value && <span className="int-sort-check">✓</span>}
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Columns Visibility */}
              <div className="relative int-dropdown-wrap" ref={colDropdownRef}>
                <button
                  className="int-toolbar-btn flex-row gap-6"
                  title="Oszlopok"
                  onClick={() => setColDropdownOpen(!colDropdownOpen)}
                >
                  <svg fill="none" height="14" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14">
                    <rect height="18" rx="2" ry="2" width="18" x="3" y="3" />
                    <line x1="9" x2="9" y1="3" y2="21" />
                  </svg>
                  Oszlopok
                </button>
                {colDropdownOpen && (
                  <div className="dropdown-menu">
                    <div className="dropdown-header">Látható oszlopok</div>
                    {ALL_COLUMNS.map((col) => (
                      <label key={col.key} className="int-col-label">
                        <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)} className="int-col-cb" />
                        {col.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ MOBILE: Card view ═══ */}
        {isMobile && (
          <div ref={pullInteractions.containerRef} className="int-mobile-scroll">
            <div className="pull-to-refresh-indicator" style={{ height: pullInteractions.pullDistance > 0 || pullInteractions.isRefreshing ? Math.max(pullInteractions.pullDistance, pullInteractions.isRefreshing ? 36 : 0) : 0 }}>
              {pullInteractions.isRefreshing ? (
                <div className="pull-spinner" />
              ) : pullInteractions.pullDistance > 0 ? (
                <svg className={`pull-arrow${pullInteractions.pullDistance > 30 ? ' ready' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 15 12 9 18 15" /></svg>
              ) : null}
            </div>

            <div className="mobile-search-sticky">
              <div className="mobile-search-wrapper">
                <svg className="search-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Keresés..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="mobile-search-clear" onClick={() => setSearchQuery('')}>✕</button>
                )}
              </div>
              <div className="mobile-search-meta">
                <span className="int-count-label">
                  {filteredRows.length} találat
                </span>
                <div className="flex-row gap-6">
                  <div className="relative int-dropdown-wrap" ref={filterContainerRef}>
                    <button className="int-toolbar-btn int-toolbar-btn--flex" onClick={() => setFilterOpen(!filterOpen)}>
                      <svg fill="none" height="12" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                      Szűrés
                      {activeFilterCount > 0 && <span className="int-filter-badge">{activeFilterCount}</span>}
                    </button>
                    {filterOpen && (
                      <div className="int-filter-dropdown">
                        <div className="int-filter-header">Szűrők</div>
                        <div className="int-filter-list">
                          <FilterSection title="Dátum">
                            <div className="flex-row gap-8">
                              <input type="date" lang="hu" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="int-date-input" />
                              <input type="date" lang="hu" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="int-date-input" />
                            </div>
                          </FilterSection>
                          <FilterSection title="Ügytípus" bordered>{UGYTIPUS_OPTIONS.map((v) => (<FilterCheckbox key={v} label={v} checked={filterUgyTipus.has(v)} onChange={() => toggleFilter(filterUgyTipus, v, setFilterUgyTipus)} />))}</FilterSection>
                          <FilterSection title="Csatorna" bordered>{CSATORNA_OPTIONS.map((v) => (<FilterCheckbox key={v} label={v} checked={filterCsatorna.has(v)} onChange={() => toggleFilter(filterCsatorna, v, setFilterCsatorna)} />))}</FilterSection>
                          <FilterSection title="Irány" bordered>{IRANY_OPTIONS.map((v) => (<FilterCheckbox key={v} label={v} checked={filterIrany.has(v)} onChange={() => toggleFilter(filterIrany, v, setFilterIrany)} />))}</FilterSection>
                          <FilterSection title="Státusz" bordered>{STATUSZ_OPTIONS.map((v) => (<FilterCheckbox key={v} label={v} checked={filterStatusz.has(v)} onChange={() => toggleFilter(filterStatusz, v, setFilterStatusz)} />))}</FilterSection>
                        </div>
                        <div className="flex-row gap-8 int-filter-footer">
                          <button className="btn btn-outline int-filter-btn" onClick={resetFilters}>Visszaállítás</button>
                          <button className="btn btn-primary int-filter-btn" onClick={() => setFilterOpen(false)}>Alkalmaz</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative int-dropdown-wrap" ref={sortDropdownRef}>
                    <button className="int-toolbar-btn int-toolbar-btn--flex" onClick={() => setSortDropdownOpen(!sortDropdownOpen)}>
                      <svg fill="none" height="12" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12"><path d="M3 6h18M6 12h12M9 18h6" /></svg>
                      Rendezés
                    </button>
                    {sortDropdownOpen && (
                      <div className="int-sort-dropdown">
                        {SORT_OPTIONS.map((o) => (
                          <button key={o.value} onClick={() => { setSortBy(o.value); setSortDropdownOpen(false); }} className={`int-sort-option ${sortBy === o.value ? 'active' : ''}`}>
                            {sortBy === o.value && <span className="int-sort-check">✓</span>}{o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="int-mobile-list">
              {filteredRows.length === 0 ? (
                <div className="int-empty-state"><span className="no-data">Nincs találat</span></div>
              ) : (() => {
                const todayStr = new Date().toISOString().split('T')[0];
                const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                let lastDateGroup = '';
                return filteredRows.map((r, i) => {
                  const dateStr = (r.date || '').split('T')[0] || (r.date || '').split(' ')[0];
                  let separator = null;
                  if (dateStr !== lastDateGroup) {
                    lastDateGroup = dateStr;
                    let label = dateStr;
                    if (dateStr === todayStr) label = 'Ma';
                    else if (dateStr === yesterdayStr) label = 'Tegnap';
                    else {
                      try { label = new Date(dateStr).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric', weekday: 'short' }); } catch { /* */ }
                    }
                    separator = (
                      <div className="mobile-timeline-separator" key={`sep-${dateStr}`}>
                        <span className="sep-label">{label}</span>
                        <div className="sep-line" />
                      </div>
                    );
                  }

                  const clientName = r.client || 'Ismeretlen';
                  const initials = clientName.split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
                  const avatarColors = ['#6366f1', '#0d9488', '#d946ef', '#f59e0b', '#3b82f6', '#ef4444', '#22c55e', '#8b5cf6'];
                  const avatarBg = avatarColors[clientName.length % avatarColors.length];
                  const accentColor = (r.statusz === 'Lezárt') ? '#22c55e' : '#f59e0b';

                  return (
                    <React.Fragment key={`${r.sessionId}-${r.interactionId}-${i}`}>
                      {separator}
                      <div
                        className="mobile-card"
                        style={{ '--accent': accentColor } as React.CSSProperties}
                        onClick={() => { setAutoExpandApproval(false); setSummaryModalRow(r); }}
                      >
                        <div className="mobile-card-header">
                          <div className="mobile-card-avatar" style={{ background: avatarBg }}>
                            {initials}
                          </div>
                          <div className="int-card-inner">
                            <div className="mobile-card-name">{clientName}</div>
                            <div className="mobile-card-subtitle">
                              {(() => { try { return new Date(r.date).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } })()}
                            </div>
                          </div>
                          <StatuszBadge value={r.statusz} />
                        </div>

                        <div className="mobile-card-details">
                          <div className="mobile-card-detail-row">
                            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                            <span>{r.channel}</span>
                            <DirectionBadge value={r.direction} />
                          </div>
                          <div className="mobile-card-detail-row">
                            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                            <span>{r.ugyTipus}</span>
                          </div>
                        </div>

                        <div className="mobile-card-footer">
                          <span className="cp-result">{r.eredmeny}</span>
                          <span className="int-teendo-text">{r.teendo}</span>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ═══ DESKTOP: Table ═══ */}
        {!isMobile && (
          <div className="int-table-wrapper todo-table-scroll" style={{ borderTop: 'none' }}>
            <table className="data-table int-table-norx data-table--full" id="interactions-flat-table">
              <thead className="int-thead">
                <tr>
                  {ALL_COLUMNS.map((col) =>
                    visibleCols.has(col.key) ? <th key={col.key}>{col.label === 'Időpont' ? 'Interakció időpontja' : col.label === 'Irány' ? 'Interakció iránya' : col.label}</th> : null
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleCols.size} className="int-td--pad40">
                      <span className="no-data">Nincs teendő — szuper!</span>
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r, i) => (
                    <tr
                      key={`${r.sessionId}-${r.interactionId}-${i}`}
                      className="int-row cursor-pointer"
                      onClick={() => { setAutoExpandApproval(false); setSummaryModalRow(r); }}
                    >
                      {visibleCols.has('date') && (
                        <td className="int-td int-td--date">
                          <div className="int-date-cell">{fmtDt(r.date)}</div>
                        </td>
                      )}
                      {visibleCols.has('client') && (
                        <td className="int-td">
                          {r.clientId ? (
                            <button
                              className="int-client-link"
                              title="Ugrás az ügyfél adatlapjára"
                              onClick={(e) => { e.stopPropagation(); setSelectedClientId(String(r.clientId)); }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = '#0d9488'; e.currentTarget.style.color = '#0f766e'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = 'transparent'; e.currentTarget.style.color = '#0d9488'; }}
                            >
                              {r.client}
                            </button>
                          ) : (
                            <span className="int-client-unknown">{r.client || <span className="no-data">Ismeretlen</span>}</span>
                          )}
                        </td>
                      )}
                      {visibleCols.has('channel') && (
                        <td className="int-td int-td--channel">
                          {(r as typeof r & { isManual?: boolean }).isManual ? (
                            <span className="cd-task-channel">
                              <span className="cd-task-channel-ic">
                                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                              </span>
                              Hozzáadott feladat
                            </span>
                          ) : r.channel}
                        </td>
                      )}
                      {visibleCols.has('direction') && (
                        <td className="int-td">
                          <DirectionBadge value={r.direction} />
                        </td>
                      )}
                      {visibleCols.has('ugyTipus') && (
                        <td className="int-td">
                          {(r as typeof r & { isManual?: boolean }).isManual ? <span className="cd-empty-cell">—</span> : <span className="int-type-label">{r.ugyTipus}</span>}
                        </td>
                      )}
                      {visibleCols.has('eredmeny') && (
                        <td className="int-td">
                          {(r as typeof r & { isManual?: boolean }).isManual ? <span className="cd-empty-cell">—</span> : <span className="cp-result">{r.eredmeny}</span>}
                        </td>
                      )}
                      {visibleCols.has('statusz') && (
                        <td className="int-td">
                          <StatuszBadge value={r.statusz} />
                        </td>
                      )}
                      {visibleCols.has('teendo') && (
                        <td className="int-td int-td--truncate" title={r.teendo}>
                          {(r as typeof r & { isManual?: boolean }).isManual ? (
                            <div className="todo-frame" title={r.teendo}>{r.teendo}</div>
                          ) : (
                            <span className="int-teendo-text">{r.teendo}</span>
                          )}
                        </td>
                      )}
                      {visibleCols.has('done') && (
                        <td className="int-td" style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={r.statusz === 'Lezárt'}
                            disabled={r.statusz === 'Lezárt' && !(r as typeof r & { isManual?: boolean }).isManual}
                            onChange={() => {}}
                            onClick={(e) => handleMarkDone(e, r)}
                            style={{ 
                              cursor: r.statusz === 'Lezárt' && !(r as typeof r & { isManual?: boolean }).isManual ? 'default' : 'pointer',
                              width: '18px',
                              height: '18px',
                              accentColor: '#1ceee0'
                            }}
                          />
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
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
          autoExpandApproval={autoExpandApproval}
          onApproved={() => {
            refetchSessions();
          }}
        />
      )}
    </div>
  );
}

// ── Sub-components (copied 1:1 from InteractionsPage.tsx) ──

function FilterSection({ title, bordered, children }: { title: string; bordered?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`filter-section${bordered ? ' filter-section--bordered' : ''}`}>
      <button
        onClick={() => setOpen(!open)}
        className="filter-section-btn"
      >
        <span>{title}</span>
        <svg
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          className={`filter-section-chevron${open ? ' filter-section-chevron--open' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="filter-section-body">{children}</div>}
    </div>
  );
}

function FilterCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="filter-cb-label">
      <input type="checkbox" checked={checked} onChange={onChange} className="filter-cb-input" />
      {label}
    </label>
  );
}
