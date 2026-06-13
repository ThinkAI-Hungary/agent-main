/**
 * InteractionsPage – 1:1 migration of legacy view-interactions + admin-interactions.js
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import Spinner from '../components/ui/Spinner';
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
const UGYTIPUS_OPTIONS = ['IDŐPONT', 'KÉRDÉS', 'KÉRÉS', 'PANASZ', 'EGYÉB'];
const CSATORNA_OPTIONS = ['Messenger', 'Telefon', 'Email', 'Instagram', 'WhatsApp'];
const IRANY_OPTIONS = ['Bejövő', 'Kimenő'];
const STATUSZ_OPTIONS = ['LEZÁRT', 'NYITOTT', 'SÜRGŐS'];

const SORT_OPTIONS = [
  { value: 'date_desc', label: '⬇ Legújabb elöl' },
  { value: 'date_asc', label: '⬆ Legrégebbi elöl' },
  { value: 'client_asc', label: 'A-Z Ügyfél név szerint' },
  { value: 'topic_asc', label: 'A-Z Téma szerint' },
];

export default function InteractionsPage() {
  const { user, isAdmin } = useAuth();
  const { openApproval } = useApproval();
  const { clients, clientsMap } = useClients();
  const { sessions, loading, refetch: refetchSessions } = useSessions(100);
  const { confirm, ConfirmDialog } = useConfirm();
  const { events } = useCalendarEvents();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');
  const [filterOpen, setFilterOpen] = useState(false);
  const [colDropdownOpen, setColDropdownOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(ALL_COLUMNS.map((c) => c.key))
  );
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [summaryModalRow, setSummaryModalRow] = useState<InteractionRow | null>(null);
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

  // Outside click to close dropdowns
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterContainerRef.current && !filterContainerRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
      if (colDropdownRef.current && !colDropdownRef.current.contains(e.target as Node)) {
        setColDropdownOpen(false);
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
          ugyTipus: 'EGYÉB',
          eredmeny: 'Rögzítve',
          statusz: 'LEZÁRT',
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

  // ── Member filtering: non-admins only see assigned clients' interactions ──
  const myRows = useMemo(() => {
    if (isAdmin) return allRows;
    const username = user?.username || '';
    const fullName = user?.fullName || '';
    return allRows.filter(r => {
      if (!r.clientId) return false;
      const client = clientsMap[String(r.clientId)];
      if (!client) return false;
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
      if (filterUgyTipus.size > 0 && !filterUgyTipus.has(r.ugyTipus)) return false;
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

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="page-title">Interakciós lista</div>
          <div className="page-subtitle">Összes beérkező és kimenő interakció</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Delete button */}
          {isAdmin && selectedRows.size > 0 && (
            <button
              className="int-toolbar-btn"
              onClick={handleDeleteSelected}
              style={{ display: 'flex', background: '#fee2e2', color: '#b91c1c', borderColor: '#fca5a5', gap: 6, alignItems: 'center', fontWeight: 600 }}
            >
              <svg fill="none" height="14" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
              {selectedRows.size} kijelölt törlése
            </button>
          )}

          {/* Search */}
          <input
            className="int-toolbar-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder=" Keresés..."
            type="text"
          />

          {/* Filter button */}
          <div style={{ position: 'relative', display: 'inline-block' }} ref={filterContainerRef}>
            <button
              className="int-toolbar-btn"
              style={{ gap: 6, display: 'flex', alignItems: 'center' }}
              title="Szűrés"
              onClick={() => setFilterOpen(!filterOpen)}
            >
              <svg fill="none" height="14" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Szűrés
              {activeFilterCount > 0 && (
                <span
                  style={{
                    background: '#1ceee0',
                    color: '#0a1628',
                    fontSize: 10,
                    fontWeight: 800,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 5px',
                    marginLeft: 2,
                  }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Filter panel */}
            {filterOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  zIndex: 999,
                  width: 340,
                  background: 'var(--card, #fff)',
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: 6,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
                  overflow: 'hidden',
                  animation: 'fadein 0.2s ease',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Szűrő</span>
                  <button
                    onClick={() => setFilterOpen(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ padding: '8px 0', maxHeight: 420, overflowY: 'auto' }}>
                  {/* Date */}
                  <FilterSection title="Dátum">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--bg, #fff)', color: 'var(--text)', fontFamily: 'inherit' }} />
                      <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--bg, #fff)', color: 'var(--text)', fontFamily: 'inherit' }} />
                    </div>
                  </FilterSection>

                  {/* Ügytípus */}
                  <FilterSection title="Ügytípus" bordered>
                    {UGYTIPUS_OPTIONS.map((v) => (
                      <FilterCheckbox key={v} label={v} checked={filterUgyTipus.has(v)} onChange={() => toggleFilter(filterUgyTipus, v, setFilterUgyTipus)} />
                    ))}
                  </FilterSection>

                  {/* Csatorna */}
                  <FilterSection title="Csatorna" bordered>
                    {CSATORNA_OPTIONS.map((v) => (
                      <FilterCheckbox key={v} label={v} checked={filterCsatorna.has(v)} onChange={() => toggleFilter(filterCsatorna, v, setFilterCsatorna)} />
                    ))}
                  </FilterSection>

                  {/* Irány */}
                  <FilterSection title="Irány" bordered>
                    {IRANY_OPTIONS.map((v) => (
                      <FilterCheckbox key={v} label={v} checked={filterIrany.has(v)} onChange={() => toggleFilter(filterIrany, v, setFilterIrany)} />
                    ))}
                  </FilterSection>

                  {/* Státusz */}
                  <FilterSection title="Státusz" bordered>
                    {STATUSZ_OPTIONS.map((v) => (
                      <FilterCheckbox key={v} label={v} checked={filterStatusz.has(v)} onChange={() => toggleFilter(filterStatusz, v, setFilterStatusz)} />
                    ))}
                  </FilterSection>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
                  <button onClick={resetFilters} style={{ flex: 1, padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'none', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Visszaállítás
                  </button>
                  <button
                    onClick={() => setFilterOpen(false)}
                    style={{ flex: 1, padding: 10, border: 'none', borderRadius: 8, background: '#1ceee0', color: '#0a1628', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(28,238,224,0.25)' }}
                  >
                    Alkalmaz
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sort */}
          <select
            className="int-toolbar-btn"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ gap: 6, display: 'flex', alignItems: 'center', appearance: 'none', paddingRight: 32, cursor: 'pointer' }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Columns */}
          <div style={{ position: 'relative', display: 'inline-block' }} ref={colDropdownRef}>
            <button
              className="int-toolbar-btn"
              style={{ gap: 6, display: 'flex', alignItems: 'center' }}
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
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 6,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  padding: '10px 0',
                  minWidth: 200,
                  zIndex: 50,
                }}
              >
                <div style={{ padding: '4px 14px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Látható oszlopok
                </div>
                {ALL_COLUMNS.map((col) => (
                  <label
                    key={col.key}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}
                  >
                    <input
                      type="checkbox"
                      checked={visibleCols.has(col.key)}
                      onChange={() => toggleCol(col.key)}
                      style={{ accentColor: '#1ceee0', width: 15, height: 15, cursor: 'pointer' }}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Count */}
      {filteredRows.length > 0 && (
        <div className="int-count" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
          {filteredRows.length} interakció
        </div>
      )}

      {/* Table */}
      <div className="int-table-wrapper">
        <table className="data-table" id="interactions-flat-table">
          <thead className="int-thead">
            <tr>
              {isAdmin && (
              <th className="int-checkbox-col" style={{ width: 40, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => { if (el) el.indeterminate = isIndeterminate; }}
                  onChange={(e) => toggleAll(e.target.checked)}
                  style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#1ceee0' }}
                />
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
                <td colSpan={visibleCols.size + 1} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
                  <Spinner />
                  <div style={{ marginTop: 10 }}>Adatok betöltése...</div>
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.size + 1} style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>
                  Nincs találat
                </td>
              </tr>
            ) : (
              filteredRows.map((r, i) => (
                <tr
                  key={`${r.sessionId}-${r.interactionId}-${i}`}
                  className="int-row"
                  onClick={() => setSummaryModalRow(r)}
                  style={{ cursor: 'pointer' }}
                >
                  {isAdmin && (
                  <td className="int-checkbox-col" style={{ padding: '12px 16px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedRows.has(i)}
                      onChange={() => toggleRow(i)}
                      style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#1ceee0' }}
                    />
                  </td>
                  )}
                  {visibleCols.has('date') && (
                    <td style={{ padding: '12px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 500 }}>{fmtDt(r.date)}</div>
                    </td>
                  )}
                  {visibleCols.has('client') && (
                    <td style={{ padding: '12px 16px', fontSize: 13 }} onClick={(e) => e.stopPropagation()}>
                      {r.clientId ? (
                        <button
                          style={{
                            background: 'rgba(0,212,200,0.1)',
                            border: '1px solid var(--accent, #1ceee0)',
                            color: 'var(--accent, #1ceee0)',
                            borderRadius: 6,
                            cursor: 'pointer',
                            padding: '5px 10px',
                            fontSize: 12,
                            fontWeight: 600,
                            maxWidth: 160,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: 'inline-block',
                            fontFamily: 'inherit',
                          }}
                          title="Ugrás az ügyfél adatlapjára"
                          onClick={() => setSelectedClientId(String(r.clientId))}
                        >
                          {r.client}
                        </button>
                      ) : (
                        <span style={{ fontWeight: 500 }}>{r.client || 'Ismeretlen'}</span>
                      )}
                    </td>
                  )}
                  {visibleCols.has('channel') && (
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text)' }}>{r.channel}</td>
                  )}
                  {visibleCols.has('direction') && (
                    <td style={{ padding: '12px 16px' }}>
                      <DirectionBadge value={r.direction} />
                    </td>
                  )}
                  {visibleCols.has('ugyTipus') && (
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>{r.ugyTipus}</span>
                    </td>
                  )}
                  {visibleCols.has('eredmeny') && (
                    <td style={{ padding: '12px 16px' }}>
                      <EredmenyBadge value={r.eredmeny} />
                    </td>
                  )}
                  {visibleCols.has('statusz') && (
                    <td style={{ padding: '12px 16px' }}>
                      <StatuszBadge value={r.statusz} />
                    </td>
                  )}
                  {visibleCols.has('teendo') && (
                    <td
                      style={{ padding: '12px 16px', fontSize: 12, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={r.teendo}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.teendo === 'Jóváhagyásra vár' && r.ai_draft_response ? (
                        <button
                          onClick={() => handleApprovalFromInteraction(r)}
                          style={{
                            background: 'rgba(251,191,36,0.12)',
                            color: '#d97706',
                            border: '1px solid rgba(251,191,36,0.3)',
                            borderRadius: 6,
                            padding: '4px 12px',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            fontFamily: 'inherit',
                          }}
                        >
                          ⚠ Jóváhagyásra vár
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>{r.teendo}</span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Summary Modal */}
      {summaryModalRow && (
        <InteractionSummaryModal
          row={summaryModalRow}
          onClose={() => setSummaryModalRow(null)}
          clients={clients}
          clientsMap={clientsMap}
        />
      )}
    </div>
  );
}

// ── Sub-components ──

function FilterSection({ title, bordered, children }: { title: string; bordered?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: '0 20px', borderTop: bordered ? '1px solid var(--border, #f3f4f6)' : undefined }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 0',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          color: 'var(--text)',
          fontSize: 14,
          fontWeight: 600,
          fontFamily: 'inherit',
        }}
      >
        <span>{title}</span>
        <svg
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          style={{ width: 16, height: 16, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div style={{ paddingBottom: 12 }}>{children}</div>}
    </div>
  );
}

function FilterCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ accentColor: '#1ceee0', width: 15, height: 15, cursor: 'pointer' }} />
      {label}
    </label>
  );
}
