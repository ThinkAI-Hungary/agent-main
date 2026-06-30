/**
 * InteractionsPage – 1:1 migration of legacy view-interactions + admin-interactions.js
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useAuth } from '../context/AuthContext';
import { useApproval } from '../context/ApprovalContext';
import { useClients } from '../hooks/useClients';
import { useSessions, type SessionSummary, type SessionInteraction } from '../hooks/useSessions';
import { resolveClientName, getRowChannel, parseCustomData, isAssignedToMe } from '../helpers/clientResolvers';
import {
  detectUgyTipus,
  detectEredmeny,
  detectStatusz,
  detectTeendo,
} from '../helpers/interactionClassifiers';
import { fmtDt, cleanStr } from '../helpers/formatters';
import { EredmenyBadge, StatuszBadge, DirectionBadge } from '../components/ui/Badge';
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
}

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
] as const;

// ── Filter options ──
const UGYTIPUS_OPTIONS = ['Időpont', 'Kérdés', 'Kérés', 'Panasz', 'Egyéb'];
const CSATORNA_OPTIONS = ['Messenger', 'Telefon', 'Email', 'Instagram', 'WhatsApp'];
const IRANY_OPTIONS = ['Bejövő', 'Kimenő'];
const STATUSZ_OPTIONS = ['Lezárt', 'Nyitott', 'Sürgős'];

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Legújabbak elől' },
  { value: 'date_asc', label: 'Legrégebbiek elől' },
  { value: 'client_asc', label: 'Ügyfélnév szerint A–Z' },
  { value: 'topic_asc', label: 'Ügytípus szerint A–Z' },
];

export default function InteractionsPage() {
  const isMobile = useIsMobile(768);
  const { user, isAdmin } = useAuth();
  const { openApproval, registerOnApproved } = useApproval();
  const { clients, clientsMap } = useClients();
  const { sessions, loading, refetch: refetchSessions } = useSessions(100);
  const { confirm, ConfirmDialog } = useConfirm();
  const { events } = useCalendarEvents();
  const pullInteractions = usePullToRefresh({ onRefresh: refetchSessions, enabled: isMobile });

  // Register refetch so approval triggers an immediate data refresh
  useEffect(() => {
    registerOnApproved(refetchSessions);
  }, [registerOnApproved, refetchSessions]);

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');
  const [filterOpen, setFilterOpen] = useState(false);
  const [colDropdownOpen, setColDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(ALL_COLUMNS.map((c) => c.key))
  );
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
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

  const filterContainerRef = useRef<HTMLDivElement>(null);
  const colDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

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

  // ── Build flat interaction rows (1:1 from legacy buildFlatInteractionRows) ──
  const allRows = useMemo<InteractionRow[]>(() => {
    const rows: InteractionRow[] = [];
    sessions.forEach((s: SessionSummary) => {
      const sessionDate = s.started_at || '';
      const sRoom = (s.room_name || '').toLowerCase();
      // const _sessionClientName = s.participant || s.client_name || 'Ismeretlen';

      if (s.interactions && s.interactions.length > 0) {
        s.interactions.forEach((r: SessionInteraction) => {
          // Skip spam interactions — users should never see these
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
  }, [sessions, clients, clientsMap]);

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
  const filteredRows = useMemo(() => {
    const q = cleanStr(searchQuery);
    const rows = myRows.filter((r) => {
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
  }, [myRows, searchQuery, sortBy, filterUgyTipus, filterCsatorna, filterIrany, filterStatusz, filterDateFrom, filterDateTo]);

  // Reset selection when data changes
  useEffect(() => setSelectedRows(new Set()), [filteredRows]);

  const activeFilterCount = filterUgyTipus.size + filterCsatorna.size + filterIrany.size + filterStatusz.size + (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0);

  // ── Checkbox handlers ──
  const toggleRow = useCallback((idx: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedRows(new Set(filteredRows.map((_, i) => i)));
      } else {
        setSelectedRows(new Set());
      }
    },
    [filteredRows]
  );

  const isAllSelected = filteredRows.length > 0 && selectedRows.size === filteredRows.length;
  const isIndeterminate = selectedRows.size > 0 && selectedRows.size < filteredRows.length;

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
    if (selectedRows.size === 0) return;
    const ok = await confirm(
      `Biztosan törölni szeretnéd a kijelölt ${selectedRows.size} interakciót? Ez a művelet nem vonható vissza!`,
      { title: 'Interakciók törlése', danger: true }
    );
    if (!ok) return;

    const interactionIds = new Set<number>();
    const sessionIds = new Set<string>();
    selectedRows.forEach((idx) => {
      const row = filteredRows[idx];
      if (row?.interactionId) interactionIds.add(row.interactionId);
      if (row?.sessionId) sessionIds.add(row.sessionId);
    });

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
      refetchSessions();
    } catch {
      showToast('Hiba történt a törlés során!', 'error');
    }
  }, [selectedRows, filteredRows, confirm, refetchSessions]);

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
    setFilterIrany(new Set());
    setFilterStatusz(new Set());
    setFilterDateFrom('');
    setFilterDateTo('');
  }

  // ── Approval from interaction ──
  const handleApprovalFromInteraction = useCallback(
    (row: InteractionRow) => {
      openApproval({
        interactionId: row.interactionId,
        sessionId: row.sessionId,
        clientName: row.client,
        channel: row.channel,
        date: row.date,
        topic: row.topic,
        summary: row.summary,
        aiDraftResponse: row.ai_draft_response || undefined,
        approvalStatus: row.approval_status || undefined,
      });
    },
    [openApproval]
  );

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

      {/* Page title — standalone */}
      <div className="page-header">
        <div className="page-title">Interakciós napló</div>
      </div>

      {/* Desktop toolbar — outside table card */}
      {!isMobile && (
      <div className="int-toolbar">
        {/* Left: result count */}
        <div className="flex-row gap-12">
          {filteredRows.length > 0 && (
            <span className="text-desc font-semibold int-count-label">
              {filteredRows.length} találat
            </span>
          )}
        </div>

        {/* Right: search + actions */}
        <div className="flex-row gap-8 flex-wrap">
          <div className="int-search-wrap">
            <svg className="int-search-icon" fill="none" stroke="#5F7D95" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Keresés a táblázatban"
              type="text"
              className="int-toolbar-input"
            />
          </div>

          {isAdmin && selectedRows.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="int-toolbar-btn int-toolbar-btn--danger"
            >
              <svg fill="none" height="14" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
              {selectedRows.size} törlése
            </button>
          )}

          {/* Filter */}
          <div className="relative int-dropdown-wrap" ref={filterContainerRef}>
            <button
              className="int-toolbar-btn flex-row gap-6"
              title="Szűrés"
              onClick={() => setFilterOpen(!filterOpen)}
            >
              <svg fill="none" height="14" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14">
                <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
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

          {/* Sort */}
          <div className="relative int-dropdown-wrap" ref={sortDropdownRef}>
            <button
              className="int-toolbar-btn flex-row gap-6"
              onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
            >
              <svg fill="none" height="14" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14">
                <path d="M7 15l5 5 5-5" /><path d="M7 9l5-5 5 5" />
              </svg>
              Sorrend
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

          {/* Columns */}
          <div className="relative int-dropdown-wrap" ref={colDropdownRef}>
            <button
              className="int-toolbar-btn flex-row gap-6"
              title="Oszlopok"
              onClick={() => setColDropdownOpen(!colDropdownOpen)}
            >
              <svg fill="none" height="14" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14">
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
              </svg>
              Oszlopok
            </button>
            {colDropdownOpen && (
              <div className="dropdown-menu dropdown-menu--columns">
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
                    <button className="int-toolbar-btn int-toolbar-btn--flex" onClick={() => setFilterOpen(!filterOpen)}>
                      <svg fill="none" height="12" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                      Szűrés
                      {activeFilterCount > 0 && (
                        <span className="int-filter-badge">
                          {activeFilterCount}
                        </span>
                      )}
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
                  {/* Sort */}
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

            {/* Mobile card list with timeline separators */}
            <div className="int-mobile-list">
              {loading ? (
                <TableSkeleton columns={3} rows={6} />
              ) : filteredRows.length === 0 ? (
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
                            <DirectionBadge value={r.direction} />
                          </div>
                          <div className="mobile-card-detail-row">
                            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                            <span>{r.ugyTipus}</span>
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="mobile-card-footer">
                          <EredmenyBadge value={r.eredmeny} />
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
          <table className="data-table int-table-norx" id="interactions-flat-table">
            <thead className="int-thead">
              <tr>
                {isAdmin && (
                <th className="int-checkbox-col">
                  <input type="checkbox" checked={isAllSelected} ref={(el) => { if (el) el.indeterminate = isIndeterminate; }} onChange={(e) => toggleAll(e.target.checked)} className="int-checkbox-input" />
                </th>
                )}
                {ALL_COLUMNS.map((col) =>
                  visibleCols.has(col.key) ? <th key={col.key}>{col.label === 'Időpont' ? 'Interakció időpontja' : col.label === 'Irány' ? 'Interakció iránya' : col.label}</th> : null
                )}
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
                    <span className="no-data">Nincs találat</span>
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, i) => (
                  <tr
                    key={`${r.sessionId}-${r.interactionId}-${i}`}
                    className="int-row cursor-pointer"
                    onClick={() => { setAutoExpandApproval(false); setSummaryModalRow(r); }}
                  >
                    {isAdmin && (
                    <td className="int-checkbox-col int-td-checkbox" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedRows.has(i)}
                        onChange={() => toggleRow(i)}
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
                      <td className="int-td int-td--channel">{r.channel}</td>
                    )}
                    {visibleCols.has('direction') && (
                      <td className="int-td">
                        <DirectionBadge value={r.direction} />
                      </td>
                    )}
                    {visibleCols.has('ugyTipus') && (
                      <td className="int-td">
                        <span className="int-type-label">{r.ugyTipus}</span>
                      </td>
                    )}
                    {visibleCols.has('eredmeny') && (
                      <td className="int-td">
                        <EredmenyBadge value={r.eredmeny} />
                      </td>
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
