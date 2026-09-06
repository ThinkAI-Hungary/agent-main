/**
 * InteractionsPage – 1:1 migration of legacy view-interactions + admin-interactions.js
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useAuth } from '../context/AuthContext';
import { useApproval } from '../context/ApprovalContext';
import { useClients } from '../hooks/useClients';
import { useSessions, type SessionSummary, type SessionInteraction } from '../hooks/useSessions';
import { useGroupedSessions } from '../hooks/useGroupedSessions';
import { resolveClientName, getRowChannel, parseCustomData, isAssignedToMe } from '../helpers/clientResolvers';
import {
  detectUgyTipus,
  detectEredmeny,
  detectStatusz,
  detectTeendo,
} from '../helpers/interactionClassifiers';
import { fmtDt, cleanStr } from '../helpers/formatters';
import { StatuszBadge } from '../components/ui/Badge';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { showToast } from '../components/ui/Toast';
import { authFetch } from '../api/client';
import InteractionSummaryModal from '../components/interactions/InteractionSummaryModal';
import ClientDetailView from '../components/clients/ClientDetailView';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { bestClientName } from '../helpers/clientResolvers';

// ── Row type ──
export interface InteractionRow {
  date: string;
  channel: string;
  client: string;
  clientId: number | string | null;
  clientStatus: string | null;
  clientCreatedAt: string | null;
  direction: string;
  ugyTipus: string;
  eredmeny: string;
  statusz: string;
  teendo: string;
  tags: string[];
  type: string;
  topic: string;
  summary: string;
  result: string;
  interactionId: number | null;
  sessionId: string | null;
  ai_draft_response: string | null;
  approval_status: string | null;
  aiDraftResponse?: string | null;
  approvalStatus?: string | null;
  // EAISY-241 — strukturált klasszifikáció a backend classifier.py-től
  classification?: {
    ugytipus?: string;
    idopont_altipus?: string | null;
    detected_types?: string[] | null;
    eredmeny?: string;
    statusz?: string;
    teendo?: string;
    osszefoglalas?: string;
    autonomous?: boolean;
    restriction?: string;
  } | null;
}

// ── Column visibility keys ──
// EAISY-241 §1.2.4: 'direction' (Irány) oszlop eltávolítva — a kimenő kommunikáció
// elrejtése a listanézetből. A Kimenő sorokat a filter is kizárja (l. myRows).
const ALL_COLUMNS = [
  { key: 'date', label: 'Időpont' },
  { key: 'client', label: 'Ügyfél' },
  { key: 'channel', label: 'Csatorna' },
  { key: 'ugyTipus', label: 'Ügytípus' },
  { key: 'eredmeny', label: 'Eredmény' },
  { key: 'statusz', label: 'Státusz' },
  { key: 'teendo', label: 'Teendő' },
] as const;

// ── Filter options ──
const UGYTIPUS_OPTIONS = ['Időpont', 'Kérdés', 'Kérés', 'Panasz', 'Egyéb'];
const CSATORNA_OPTIONS = ['Messenger', 'Telefon', 'Email', 'Instagram', 'WhatsApp'];
const STATUSZ_OPTIONS = ['Lezárt', 'Nyitott', 'Sürgős'];

// Lapozás (desktop tábla)
const PAGE_SIZE = 10;

/** Lokális dátum string (nem UTC) — az éjfél körüli elcsúszás ellen */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function InteractionsPage() {
  const isMobile = useIsMobile(768);
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  // mai dátum magyar formátumban a fejléc sávba
  const todayLabel = new Date().toLocaleDateString('hu-HU', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
  const { registerOnApproved } = useApproval();
  const { clients, clientsMap } = useClients();
  // Szerver-oldali aggregáció: 1 session = 1 sor (a kliens-oldali merge megszűnt).
  // 500 session — a KPI számlálók és a tábla több napra átfedő, stabil képet adjon.
  const { groups, loading, error, refetch: refetchSessions } = useGroupedSessions(500);
  // A ClientDetailView a régi hookot használja (tool-hívás részletekkel)
  const { sessions } = useSessions(100);
  const { confirm, ConfirmDialog } = useConfirm();
  const { events } = useCalendarEvents();
  const pullInteractions = usePullToRefresh({ onRefresh: refetchSessions, enabled: isMobile });

  // Register refetch so approval triggers an immediate data refresh
  useEffect(() => {
    registerOnApproved(refetchSessions);
  }, [registerOnApproved, refetchSessions]);

  // State
  const [searchQuery, setSearchQuery] = useState('');
  // Rendezés: egyetlen váltó — Időpont szerint fel/le (fejlécből)
  const [dateAsc, setDateAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const [colDropdownOpen, setColDropdownOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(ALL_COLUMNS.map((c) => c.key))
  );
  // Kijelölés sessionId alapján (stabil refetchen át — index-alapú volt és
  // minden frissítésnél elveszett)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [summaryModalRow, setSummaryModalRow] = useState<InteractionRow | null>(null);
  const [autoExpandApproval, setAutoExpandApproval] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Filters
  const [filterUgyTipus, setFilterUgyTipus] = useState<Set<string>>(new Set());
  const [filterCsatorna, setFilterCsatorna] = useState<Set<string>>(new Set());
  const [filterStatusz, setFilterStatusz] = useState<Set<string>>(new Set());
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const filterContainerRef = useRef<HTMLDivElement>(null);
  const colDropdownRef = useRef<HTMLDivElement>(null);

  // Outside click + Esc zárja a lenyílókat
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterContainerRef.current && !filterContainerRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
      if (colDropdownRef.current && !colDropdownRef.current.contains(e.target as Node)) {
        setColDropdownOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setFilterOpen(false);
        setColDropdownOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  // ── Build interaction rows (EAISY-241 §1.2.1: egy session = egy sor) ──
  // A sorokat a szerver-oldali grouped végpont adja: a reprezentatív interakciót
  // és a session-max státuszt az SQL választja (nincs kliens-oldali ablakos merge).
  const allRows = useMemo<InteractionRow[]>(() => {
    const rows: InteractionRow[] = [];
    groups.forEach((g) => {
      const representative = g.representative || {};
      if (representative.approval_status === 'spam') return;
      const sRoom = (g.room_name || '').toLowerCase();

      // Ügyfél-feloldás a reprezentatív interakcióra
      const clientInfo = resolveClientName(
        representative,
        { session_id: g.session_id, participant: g.participant || undefined, client_name: g.client_name || undefined },
        clientsMap,
        clients
      );
      let clientTags: string[] = [];
      if (clientInfo.id && clientsMap[String(clientInfo.id)]) {
        const cd = parseCustomData(clientsMap[String(clientInfo.id)].custom_data);
        clientTags = (cd?.tags as string[]) || [];
      }

      rows.push({
        date: g.last_created_at || representative.created_at || '',
        channel: getRowChannel(representative.type || '', sRoom, g.session_id || '', representative.type || ''),
        client: clientInfo.name,
        clientId: clientInfo.id,
        clientStatus: clientInfo.status,
        clientCreatedAt: clientInfo.created_at,
        direction: (representative.direction || 'inbound').toLowerCase() === 'outbound' ? 'Kimenő' : 'Bejövő',
        ugyTipus: detectUgyTipus(representative),
        // EAISY-241 §1: CSAK a reprezentatív interakció saját eredménye
        eredmeny: detectEredmeny(representative),
        // Státusz: a session legmagasabb prioritású státusza (szerver-oldalról),
        // fallback a reprezentatív saját státusza
        statusz: g.session_statusz || detectStatusz(representative),
        teendo: detectTeendo(representative),
        tags: clientTags,
        type: representative.type || '-',
        topic: representative.topic || '-',
        summary: representative.summary || '-',
        result: representative.result || '',
        interactionId: representative.id || null,
        sessionId: g.session_id || null,
        ai_draft_response: representative.ai_draft_response || null,
        approval_status: representative.approval_status || null,
        classification: representative.classification || null,  // EAISY-241
      });
    });
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return rows;
  }, [groups, clients, clientsMap]);

  // ── Member filtering: non-admins only see assigned or unassigned interactions ──
  const myRows = useMemo(() => {
    if (isAdmin) return allRows;
    const username = user?.username || '';
    const fullName = user?.fullName || '';
    return allRows.filter(r => {
      if (!r.clientId) return true;
      const client = clientsMap[String(r.clientId)];
      if (!client) return true;
      const cd = parseCustomData(client.custom_data);
      const assignedTo = ((cd.assigned_to || cd.felelos || '') as string).trim();
      if (!assignedTo) return true;
      return isAssignedToMe(client, username, fullName);
    });
  }, [allRows, isAdmin, user, clientsMap]);

  // ── Filter + sort ──
  // preStatusRows: minden szűrő ÉRVÉNYESül a státuszon kívül — ez adja a KPI
  // számlálókat (a chipre kattintva épp a státusz-szűrőt toggled)
  const preStatusRows = useMemo(() => {
    const q = cleanStr(searchQuery);
    return myRows.filter((r) => {
      // EAISY-241 §1.2.4: kimenő (outbound) kommunikáció elrejtése a listanézetből
      if (r.direction === 'Kimenő') return false;
      if (q) {
        const searchable = [r.channel, r.client, r.ugyTipus, r.eredmeny, r.statusz, r.teendo, r.summary].join(' ');
        if (!cleanStr(searchable).includes(q)) return false;
      }
      if (filterUgyTipus.size > 0 && !r.ugyTipus.split(', ').some(t => filterUgyTipus.has(t))) return false;
      if (filterCsatorna.size > 0 && !filterCsatorna.has(r.channel)) return false;
      if (filterDateFrom || filterDateTo) {
        const rd = (r.date || '').slice(0, 10);
        if (filterDateFrom && rd < filterDateFrom) return false;
        if (filterDateTo && rd > filterDateTo) return false;
      }
      return true;
    });
  }, [myRows, searchQuery, filterUgyTipus, filterCsatorna, filterDateFrom, filterDateTo]);

  const filteredRows = useMemo(() => {
    const rows = preStatusRows.filter((r) => filterStatusz.size === 0 || filterStatusz.has(r.statusz));
    rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (!dateAsc) rows.reverse();
    return rows;
  }, [preStatusRows, filterStatusz, dateAsc]);

  // ── KPI számlálók (Sürgős / Nyitott / Lezárt) ──
  // KIZÁRÓLAG a mai nap forgalmát mutatják (helyi dátum szerint, kimenő rejtve) —
  // a kereső és a többi szűrő NEM befolyásolja: a sáv "Mai nap" feliratához illő,
  // stabil napi számok. Nagy forgalomnál így nem duzzad óriásira.
  const kpiCounts = useMemo(() => {
    const c: Record<string, number> = { 'Sürgős': 0, 'Nyitott': 0, 'Lezárt': 0 };
    const today = toLocalDateStr(new Date());
    myRows.forEach((r) => {
      if (r.direction === 'Kimenő') return;
      const d = r.date ? toLocalDateStr(new Date(r.date)) : '';
      if (d !== today) return;
      const key = STATUSZ_OPTIONS.find((s) => s.toLowerCase() === (r.statusz || '').toLowerCase());
      if (key) c[key] += 1;
    });
    return c;
  }, [myRows]);

  const toggleStatusKpi = useCallback((s: string) => {
    setFilterStatusz((prev) => (prev.size === 1 && prev.has(s) ? new Set() : new Set([s])));
  }, []);

  // ── Lapozás (desktop) ──
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = useMemo(
    () => filteredRows.slice(pageStart, pageStart + PAGE_SIZE),
    [filteredRows, pageStart]
  );

  // Szűrő/keresés változásakor vissza az első oldalra
  useEffect(() => { setPage(1); }, [searchQuery, filterUgyTipus, filterCsatorna, filterStatusz, filterDateFrom, filterDateTo]);

  const activeFilterCount = filterUgyTipus.size + filterCsatorna.size + filterStatusz.size + (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0);

  // ── Checkbox handlers (sessionId-alapú kijelölés — túléli a refetchet) ──
  const toggleRow = useCallback((sessionId: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedRows(new Set(pageRows.map((r) => r.sessionId).filter(Boolean) as string[]));
      } else {
        setSelectedRows(new Set());
      }
    },
    [pageRows]
  );

  const isAllSelected = pageRows.length > 0 && selectedRows.size === pageRows.filter((r) => r.sessionId).length;
  const isIndeterminate = selectedRows.size > 0 && !isAllSelected;

  // ── Column toggle ──
  const toggleCol = useCallback((key: string) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Delete ──
  const handleDeleteSelected = useCallback(async () => {
    if (selectedRows.size === 0 || isDeleting) return;
    const ok = await confirm(
      `Biztosan törölni szeretnéd a kijelölt ${selectedRows.size} interakciót? Ez a művelet nem vonható vissza!`,
      { title: 'Interakciók törlése', danger: true }
    );
    if (!ok) return;

    const interactionIds = new Set<number>();
    const sessionIds = new Set<string>(selectedRows);
    selectedRows.forEach((sid) => {
      const row = filteredRows.find((r) => r.sessionId === sid);
      if (row?.interactionId) interactionIds.add(row.interactionId);
    });

    setIsDeleting(true);
    try {
      const res = await authFetch('/admin/api/interactions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interaction_ids: [...interactionIds],
          session_ids: [...sessionIds],
        }),
      });
      if (!res.ok) throw new Error('Delete failed');
      const data = await res.json();
      showToast(`Törölve: ${data.deleted_interactions || 0} interakció, ${data.deleted_sessions || 0} session`);
      setSelectedRows(new Set());
      refetchSessions();
    } catch {
      showToast('Hiba történt a törlés során!', 'error');
    } finally {
      setIsDeleting(false);
    }
  }, [selectedRows, filteredRows, confirm, refetchSessions, isDeleting]);

  // ── Filter toggle helpers ──
  function toggleFilter(set: Set<string>, val: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  }

  function resetFilters() {
    setFilterUgyTipus(new Set());
    setFilterCsatorna(new Set());
    setFilterStatusz(new Set());
    setFilterDateFrom('');
    setFilterDateTo('');
  }

  // ── Client Detail overlay ──
  if (selectedClientId) {
    const clientRaw = clients.find((c) => String(c.id) === selectedClientId);
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
          sessions={sessions}
          events={events}
          source="interactions"
          onBack={() => setSelectedClientId(null)}
          onRefresh={refetchSessions}
        />
      );
    }
  }

  // ── Render ──
  return (
    <div className="analytics-shell">
      <ConfirmDialog />

      {/* Fejléc sáv: morzsák + cím */}
      <header className="int-page-head">
        <nav className="int-breadcrumbs" aria-label="Navigációs morzsák">
          <span className="int-crumb-link">Ügyfélközpont</span>
          <span className="int-crumb-sep">/</span>
          <span className="int-crumb-current">Interakciós napló</span>
        </nav>
        <h1 className="page-title int-page-title">Interakciós napló</h1>
      </header>

      {/* Fetch-hiba megjelenítése (korábban örök „Nincs találat" állapot volt) */}
      {error && (
        <div className="int-error-banner">
          <span>{error}</span>
          <button className="btn btn-outline btn-sm" onClick={() => refetchSessions()}>Újrapróbálás</button>
        </div>
      )}

      {/* Fejléc sáv — minden vezérlő egy keretes sorban (mai nap | KPI-k | keresés | oszlopok | szűrés) */}
      {!isMobile && (
      <div className="int-header-bar">
        <span className="int-today">Mai nap · {todayLabel}</span>

        {/* KPI chipek (kit 08) — kattintva státusz-szűrők */}
        <div className="int-kpis">
          {STATUSZ_OPTIONS.map((s) => {
            const active = filterStatusz.size === 1 && filterStatusz.has(s);
            return (
              <button
                key={s}
                type="button"
                className={`int-kpi${active ? ' is-on' : ''} int-kpi--${s.toLowerCase()}`}
                onClick={() => toggleStatusKpi(s)}
              >
                <span className="int-kpi-num">{kpiCounts[s]}</span>
                <span className="int-kpi-label"><i className="int-kpi-dot" />{s}</span>
              </button>
            );
          })}
        </div>

        {/* Kereső */}
        <div className="int-searchbox">
          <svg className="int-search-icon" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.2" y2="16.2" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Keresés név, e-mail, ügytípus, eredmény szerint..."
            type="text"
            className="int-search-input"
          />
        </div>

        {/* Jobb akciók: Oszlopok, Törlés, Szűrés (utolsó) */}
        <div className="int-header-actions">
          {isAdmin && selectedRows.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="btn int-btn-danger"
            >
              <svg fill="none" height="15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="15">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
              {isDeleting ? 'Törlés…' : `${selectedRows.size} törlése`}
            </button>
          )}

          {/* Columns (kit 14) */}
          <div className="relative int-dropdown-wrap" ref={colDropdownRef}>
            <button
              className="btn int-btn-icon"
              title="Oszlopok"
              aria-label="Oszlopok"
              aria-expanded={colDropdownOpen}
              onClick={() => setColDropdownOpen(!colDropdownOpen)}
            >
              <svg fill="none" height="15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="15">
                <rect x="3" y="4" width="5" height="16" rx="1" /><rect x="9.5" y="4" width="5" height="16" rx="1" /><rect x="16" y="4" width="5" height="16" rx="1" />
              </svg>
            </button>
            {colDropdownOpen && (
              <div className="int-columns-pop" role="dialog" aria-label="Oszlopok megjelenítése">
                <div className="int-columns-title">Oszlopok</div>
                {ALL_COLUMNS.map((col) => (
                  <label key={col.key} className="int-col-toggle">
                    <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)} className="int-col-cb" />
                    <span>{col.label === 'Időpont' ? 'Interakció időpontja' : col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {/* Filter — primary (kit 05) */}
          <div className="relative int-dropdown-wrap" ref={filterContainerRef}>
            <button
              className="int-filter-btn flex-row gap-6"
              title="Szűrés"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen(!filterOpen)}
            >
              <svg fill="none" height="15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="15">
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
              <div className="int-filter-pop" role="dialog" aria-label="Szűrési feltételek">
                <div className="int-filter-grid">
                  <label className="int-filter-field">
                    <span>Dátum tól</span>
                    <input className="int-date-input" type="date" lang="hu" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
                  </label>
                  <label className="int-filter-field">
                    <span>Dátum ig</span>
                    <input className="int-date-input" type="date" lang="hu" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
                  </label>
                  <div className="int-filter-field">
                    <span>Ügytípus</span>
                    <div className="int-filter-checks">
                      {UGYTIPUS_OPTIONS.map((v) => (
                        <FilterCheckbox key={v} label={v} checked={filterUgyTipus.has(v)} onChange={() => toggleFilter(filterUgyTipus, v, setFilterUgyTipus)} />
                      ))}
                    </div>
                  </div>
                  <div className="int-filter-field">
                    <span>Csatorna</span>
                    <div className="int-filter-checks">
                      {CSATORNA_OPTIONS.map((v) => (
                        <FilterCheckbox key={v} label={v} checked={filterCsatorna.has(v)} onChange={() => toggleFilter(filterCsatorna, v, setFilterCsatorna)} />
                      ))}
                    </div>
                  </div>
                  <div className="int-filter-field int-filter-field--full">
                    <span>Státusz</span>
                    <div className="int-filter-checks">
                      {STATUSZ_OPTIONS.map((v) => (
                        <FilterCheckbox key={v} label={v} checked={filterStatusz.has(v)} onChange={() => toggleFilter(filterStatusz, v, setFilterStatusz)} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="int-filter-actions">
                  <span className="int-filter-hint">
                    {activeFilterCount > 0 ? `${activeFilterCount} aktív szűrő` : 'Nincs aktív szűrő'}
                  </span>
                  <button className="btn btn-sm" onClick={resetFilters}>
                    <svg fill="none" height="13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="13">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Szűrők törlése
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
      )}

      {/* Table card — table only */}
      <div className="card-container">

        {/* ═══ MOBILE: Card view ═══ */}
        {isMobile && (
          <div ref={pullInteractions.containerRef} className="int-mobile-scroll">
            {/* Pull-to-refresh indicator */}
            <div className="pull-to-refresh-indicator" style={{ height: pullInteractions.pullDistance > 0 || pullInteractions.isRefreshing ? Math.max(pullInteractions.pullDistance, pullInteractions.isRefreshing ? 36 : 0) : 0 }}>
              {pullInteractions.isRefreshing ? (
                <div className="pull-spinner" />
              ) : pullInteractions.pullDistance > 0 ? (
                <svg className={`pull-arrow${pullInteractions.pullDistance > 30 ? ' ready' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 15 12 9 18 15" /></svg>
              ) : null}
            </div>
            {/* Sticky search bar */}
            <div className="mobile-search-sticky">
              <div className="mobile-search-wrapper">
                <svg className="search-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Keresés interakciók között..."
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
                  {/* Filter */}
                  <div className="relative int-dropdown-wrap" ref={filterContainerRef}>
                    <button className="int-filter-btn int-filter-btn--sm flex-row gap-6" onClick={() => setFilterOpen(!filterOpen)} aria-expanded={filterOpen}>
                      <svg fill="none" height="12" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                      Szűrés
                      {activeFilterCount > 0 && (
                        <span className="int-filter-badge">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>
                    {filterOpen && (
                      <div className="int-filter-pop int-filter-pop--mobile" role="dialog" aria-label="Szűrési feltételek">
                        <div className="int-filter-grid">
                          <label className="int-filter-field">
                            <span>Dátum tól</span>
                            <input type="date" lang="hu" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="int-date-input" />
                          </label>
                          <label className="int-filter-field">
                            <span>Dátum ig</span>
                            <input type="date" lang="hu" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="int-date-input" />
                          </label>
                          <div className="int-filter-field int-filter-field--full">
                            <span>Ügytípus</span>
                            <div className="int-filter-checks">{UGYTIPUS_OPTIONS.map((v) => (<FilterCheckbox key={v} label={v} checked={filterUgyTipus.has(v)} onChange={() => toggleFilter(filterUgyTipus, v, setFilterUgyTipus)} />))}</div>
                          </div>
                          <div className="int-filter-field int-filter-field--full">
                            <span>Csatorna</span>
                            <div className="int-filter-checks">{CSATORNA_OPTIONS.map((v) => (<FilterCheckbox key={v} label={v} checked={filterCsatorna.has(v)} onChange={() => toggleFilter(filterCsatorna, v, setFilterCsatorna)} />))}</div>
                          </div>
                          <div className="int-filter-field int-filter-field--full">
                            <span>Státusz</span>
                            <div className="int-filter-checks">{STATUSZ_OPTIONS.map((v) => (<FilterCheckbox key={v} label={v} checked={filterStatusz.has(v)} onChange={() => toggleFilter(filterStatusz, v, setFilterStatusz)} />))}</div>
                          </div>
                        </div>
                        <div className="int-filter-actions">
                          <span className="int-filter-hint">
                            {activeFilterCount > 0 ? `${activeFilterCount} aktív szűrő` : 'Nincs aktív szűrő'}
                          </span>
                          <button className="btn btn-sm" onClick={resetFilters}>Szűrők törlése</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile card list with timeline separators */}
            <div className="int-mobile-list">
              {loading ? (
                <TableSkeleton columns={3} rows={6} />
              ) : filteredRows.length === 0 ? (
                <div className="int-empty-state"><span className="no-data">Nincs találat</span></div>
              ) : (() => {
                // Lokális dátum (nem UTC) — éjfél körül ne csússzon el a Ma/Tegnap
                const localDateStr = (d: Date) =>
                  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const todayStr = localDateStr(new Date());
                const yesterdayStr = localDateStr(new Date(Date.now() - 86400000));
                let lastDateGroup = '';
                return filteredRows.map((r, i) => {
                  const dateStr = r.date ? localDateStr(new Date(r.date)) : '';
                  let separator = null;
                  if (dateStr !== lastDateGroup) {
                    lastDateGroup = dateStr;
                    let label = dateStr;
                    if (dateStr === todayStr) label = 'Ma';
                    else if (dateStr === yesterdayStr) label = 'Tegnap';
                    else {
                      try { label = new Date(dateStr).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric', weekday: 'short' }); } catch { /* keep dateStr */ }
                    }
                    separator = (
                      <div className="mobile-timeline-separator" key={`sep-${dateStr}`}>
                        <span className="sep-label">{label}</span>
                        <div className="sep-line" />
                      </div>
                    );
                  }

                  // Avatar
                  const clientName = r.client || 'Ismeretlen';
                  const initials = clientName.split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
                  const avatarColors = ['#6366f1', '#0d9488', '#d946ef', '#f59e0b', '#3b82f6', '#ef4444', '#22c55e', '#8b5cf6'];
                  const avatarBg = avatarColors[clientName.length % avatarColors.length];
                  // Accent per status
                  const accentColor = (r.statusz === 'LEZÁRT' || r.statusz === 'Lezárt') ? '#22c55e' : (r.statusz === 'NYITOTT' || r.statusz === 'Nyitott' || r.statusz === 'Sürgős' || r.statusz === 'SÜRGŐS') ? '#f59e0b' : '#1ceee0';

                  return (
                    <React.Fragment key={`${r.sessionId}-${r.interactionId}-${i}`}>
                      {separator}
                      <div
                        className="mobile-card"
                        style={{ '--accent': accentColor } as React.CSSProperties}
                        onClick={() => { setAutoExpandApproval(false); setSummaryModalRow(r); }}
                      >
                        {/* Header: avatar + name + status */}
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

                        {/* Details — inline */}
                        <div className="mobile-card-details">
                          <div className="mobile-card-detail-row">
                            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                            <span>{r.channel}</span>
                          </div>
                          <div className="mobile-card-detail-row">
                            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                            <span>{r.ugyTipus}</span>
                          </div>
                        </div>

                        {/* Footer */}
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
          <div className="int-table-scroll">
          <table className="data-table int-table-norx" id="interactions-flat-table">
            <thead className="int-thead">
              <tr>
                {isAdmin && (
                <th className="int-checkbox-col">
                  <input type="checkbox" checked={isAllSelected} ref={(el) => { if (el) el.indeterminate = isIndeterminate; }} onChange={(e) => toggleAll(e.target.checked)} className="int-checkbox-input" />
                </th>
                )}
                {ALL_COLUMNS.map((col) => {
                  if (!visibleCols.has(col.key)) return null;
                  if (col.key === 'date') {
                    return (
                      <th key={col.key} className="int-th int-th--sort">
                        <button type="button" className="int-sort-btn" onClick={() => setDateAsc((v) => !v)} title="Időpont szerinti sorrend váltása">
                          Interakció időpontja
                          <span className="int-sort-ic">
                            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="13" height="13">
                              {dateAsc
                                ? <polyline points="6 14 12 8 18 14" />
                                : <polyline points="6 9 12 15 18 9" />}
                            </svg>
                          </span>
                        </button>
                      </th>
                    );
                  }
                  return <th key={col.key} className="int-th">{col.label}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleCols.size + 1} className="int-td--p0">
                    <TableSkeleton columns={visibleCols.size} rows={10} />
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleCols.size + 1} className="int-td--pad40">
                    <div className="int-empty">
                      <svg className="int-empty-ic" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="30" height="30">
                        <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.2" y2="16.2" /><line x1="8" y1="11" x2="14" y2="11" />
                      </svg>
                      <h3>Nincs találat</h3>
                      <p>Próbáld módosítani a keresést vagy a szűrőket.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((r, i) => (
                  <tr
                    key={`${r.sessionId}-${r.interactionId}-${i}`}
                    className={`int-row cursor-pointer${r.statusz === 'Sürgős' || r.statusz === 'SÜRGŐS' ? ' is-urgent' : ''}`}
                    onClick={() => { setAutoExpandApproval(false); setSummaryModalRow(r); }}
                  >
                    {isAdmin && (
                    <td className="int-checkbox-col int-td-checkbox" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={r.sessionId ? selectedRows.has(r.sessionId) : false}
                        onChange={() => r.sessionId && toggleRow(r.sessionId)}
                        className="int-checkbox-input"
                      />
                    </td>
                    )}
                    {visibleCols.has('date') && (
                      <td className="int-td int-td--date">
                        <div className="int-date-cell">{fmtDt(r.date)}</div>
                      </td>
                    )}
                    {visibleCols.has('client') && (
                      <td className="int-td int-td--client">
                        {r.clientId ? (
                          <button
                            className="int-client-link"
                            title="Ugrás az ügyfél adatlapjára"
                            onClick={(e) => { e.stopPropagation(); setSelectedClientId(String(r.clientId)); }}
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
                        <ChannelChip name={r.channel} />
                      </td>
                    )}
                    {visibleCols.has('ugyTipus') && (
                      <td className="int-td">
                        <span className="int-type-label">{r.ugyTipus}</span>
                      </td>
                    )}
                    {visibleCols.has('eredmeny') && (
                      <td className="int-td cp-result">{r.eredmeny}</td>
                    )}
                    {visibleCols.has('statusz') && (
                      <td className="int-td">
                        <StatuszBadge value={r.statusz} />
                      </td>
                    )}
                    {visibleCols.has('teendo') && (
                      <td className="int-td int-td--truncate" title={r.teendo}>
                        <span className="int-teendo-text">{r.teendo}</span>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        )}

        {/* Tábla lábléc: találat-számláló + lapozó (kit 09) — desktop */}
        {!isMobile && !loading && filteredRows.length > 0 && (
          <div className="int-table-foot">
            <span className="int-foot-count">
              {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredRows.length)} / {filteredRows.length} találat
            </span>
            {totalPages > 1 && (
              <nav className="int-pagination" aria-label="Lapozás">
                <button type="button" className="int-pg-btn" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="Előző oldal">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                {pageNumbers(safePage, totalPages).map((p, idx) =>
                  p === '…' ? (
                    <span key={`gap-${idx}`} className="int-pg-gap">…</span>
                  ) : (
                    <button key={p} type="button" className={`int-pg-btn${p === safePage ? ' is-on' : ''}`} onClick={() => setPage(p)}>{p}</button>
                  )
                )}
                <button type="button" className="int-pg-btn" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} aria-label="Következő oldal">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </nav>
            )}
          </div>
        )}
      </div>

      {/* Summary Modal */}
      {summaryModalRow && (
        <InteractionSummaryModal
          row={summaryModalRow}
          onClose={() => setSummaryModalRow(null)}
          clients={clients}
          clientsMap={clientsMap}
          onClientClick={(id) => { setSummaryModalRow(null); setAutoExpandApproval(false); setSelectedClientId(id); }}
          autoExpandApproval={autoExpandApproval}
          onApproved={() => { setAutoExpandApproval(false); refetchSessions(); }}
        />
      )}
    </div>
  );
}

// ── Sub-components ──

/** Kit 07: csatorna chip — ikon-tartó + címke (ikonok a UI kit készletéből) */
const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  Telefon: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
  Email: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22 6 12 13 2 6" /></>,
  WhatsApp: <><path d="M12 3a9 9 0 0 0-7.72 13.44L3 21l4.78-1.22A9 9 0 1 0 12 3z" /><g transform="translate(6 6) scale(0.5)"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></g></>,
  Messenger: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /><g transform="translate(6.5 7) scale(0.5)"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></g></>,
  Instagram: <><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></>,
};

function ChannelChip({ name }: { name: string }) {
  const icon = CHANNEL_ICONS[name];
  return (
    <span className="int-channel-chip">
      {icon && (
        <span className="int-channel-ic">
          <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            {icon}
          </svg>
        </span>
      )}
      <span className="int-channel-name">{name}</span>
    </span>
  );
}

/** Lapozó oldalszám-lista: max 7 elem, szélső eseteken gondolattal */
function pageNumbers(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: Array<number | '…'> = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);
  if (from > 2) pages.push('…');
  for (let p = from; p <= to; p++) pages.push(p);
  if (to < total - 1) pages.push('…');
  pages.push(total);
  return pages;
}

function FilterCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="filter-cb-label">
      <input type="checkbox" checked={checked} onChange={onChange} className="filter-cb-input" />
      {label}
    </label>
  );
}
