/**
 * ClientsPage – 1:1 migration of legacy view-clients + admin-customers.js
 * Table view + Card view, search, column visibility, checkbox selection, bulk delete.
 * Client Detail overlay is handled by ClientDetailView component.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useAuth } from '../context/AuthContext';
import { useClients } from '../hooks/useClients';
import { useSessions } from '../hooks/useSessions';
import { useCalendarEvents, type CalendarEvent } from '../hooks/useCalendarEvents';
import { parseCustomData, bestClientName, isAssignedToMe, type ClientRecord } from '../helpers/clientResolvers';
import { fmtDt, cleanStr } from '../helpers/formatters';
import { TagBadge } from '../components/ui/Badge';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { showToast } from '../components/ui/Toast';

import { authFetch } from '../api/client';
import ClientDetailView from '../components/clients/ClientDetailView';
import CampaignWizardModal from '../components/outbound/CampaignWizardModal';
import { useKanbanColumns } from '../hooks/useKanbanColumns';

interface MemberUser {
  id: number;
  username: string;
  full_name: string;
  role: string;
}

// ── Enriched client type ──
interface EnrichedClient {
  id: number | string;
  name: string;
  email: string;
  phone: string;
  status: string;
  created_at: string;
  tags: string[];
  assignee: string;
  lastInteraction: string;
  appointmentCount: number;
  isNew: boolean;
  isInactive: boolean;
  raw: ClientRecord;
}

const CLIENT_COLUMNS = [
  { key: 'name', label: 'Ügyfél' },
  { key: 'status_badge', label: 'Új / Visszatérő' },
  { key: 'tags', label: 'Címkék' },
  { key: 'phone', label: 'Telefonszám' },
  { key: 'email', label: 'Email' },
  { key: 'assignee', label: 'Felelős' },
  { key: 'lastInteraction', label: 'Utolsó interakció' },
  { key: 'sales_status', label: 'Értékesítési státusz' },
] as const;

export default function ClientsPage() {
  const isMobile = useIsMobile(768);
  const { user, isAdmin } = useAuth();
  const { clients, clientsMap, refetch: refetchClients } = useClients();
  const { sessions } = useSessions(500);
  const { events } = useCalendarEvents();
  const { confirm, ConfirmDialog } = useConfirm();
  const { columns: kanbanColumns } = useKanbanColumns();
  const pullClients = usePullToRefresh({ onRefresh: refetchClients, enabled: isMobile });

  // Lookup: column ID → display name
  const kanbanNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    kanbanColumns.forEach(col => { map[col.id] = col.name; });
    return map;
  }, [kanbanColumns]);

  const [viewMode] = useState<'table' | 'cards'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(CLIENT_COLUMNS.map((c) => c.key)));
  const [colDropdownOpen, setColDropdownOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [detailSource, setDetailSource] = useState<'clients' | 'interactions'>('clients');
  const [showCampaignWizard, setShowCampaignWizard] = useState(false);
  const [members, setMembers] = useState<MemberUser[]>([]);

  const colDropdownRef = useRef<HTMLDivElement>(null);

  // Load member/manager users for Felelős dropdown
  useEffect(() => {
    authFetch('/admin/api/members').then(r => r.json()).then(data => {
      if (data?.data) setMembers(data.data);
    }).catch(() => {});
  }, []);

  // Outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (colDropdownRef.current && !colDropdownRef.current.contains(e.target as Node)) {
        setColDropdownOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // ── Enrich clients ──
  const enrichedClients = useMemo<EnrichedClient[]>(() => {
    return clients.map((c) => {
      const cd = parseCustomData(c.custom_data);
      const name = bestClientName(c) || c.name || 'Névtelen';
      const email = (cd?.email as string) || c.email || '';
      const phone = (cd?.telefonszam as string) || (cd?.phone as string) || (cd?.telefon as string) || c.phone || '';
      const tags: string[] = (cd?.tags as string[]) || [];
      const assignee = (cd?.assigned_to as string) || '';

      // Count calendar appointments for this client
      const clientNameLower = name.toLowerCase().trim();
      const clientEmailLower = email.toLowerCase().trim();
      const matchingEvents = events.filter((ev: CalendarEvent) => {
        const evName = (ev.attendee || '').toLowerCase().trim();
        const evEmail = (ev.attendee_email || '').toLowerCase().trim();
        return (clientNameLower && evName.includes(clientNameLower)) || (clientEmailLower && evEmail === clientEmailLower);
      });

      // Last interaction
      let lastInteraction = '';
      for (const s of sessions) {
        const participant = (s.participant || s.client_name || '').toLowerCase().trim();
        if (participant === clientNameLower || (clientEmailLower && s.session_id?.includes(clientEmailLower))) {
          if (!lastInteraction || (s.started_at || '') > lastInteraction) {
            lastInteraction = s.started_at || '';
          }
        }
      }

      // Is inactive: no appointment in last 90 days
      const now = new Date();
      const nowMs = now.getTime();
      const ninetyDaysAgo = nowMs - 90 * 24 * 60 * 60 * 1000;
      const hasRecentAppointment = matchingEvents.some((ev) => {
        if (!ev.start_dt) return false;
        return new Date(ev.start_dt).getTime() > ninetyDaysAgo;
      });
      const isInactive = matchingEvents.length > 0 && !hasRecentAppointment;
      const pastEvents = matchingEvents.filter(ev => ev.start_dt && new Date(ev.start_dt) < now);
      const isNew = pastEvents.length <= 1;

      return {
        id: c.id,
        name,
        email,
        phone,
        status: c.status || '',
        created_at: c.created_at || '',
        tags,
        assignee,
        lastInteraction,
        appointmentCount: matchingEvents.length,
        isNew,
        isInactive,
        raw: c,
      };
    });
  }, [clients, sessions, events]);

  // ── Member filtering: non-admins only see assigned clients ──
  const myClients = useMemo(() => {
    if (isAdmin) return enrichedClients;
    const username = user?.username || '';
    const fullName = user?.fullName || '';
    return enrichedClients.filter(c => isAssignedToMe(c.raw, username, fullName));
  }, [enrichedClients, isAdmin, user]);

  // ── Search filter ──
  const filteredClients = useMemo(() => {
    if (!searchQuery) return myClients;
    const q = cleanStr(searchQuery);
    return myClients.filter((c) => {
      const searchable = [c.name, c.email, c.phone, c.tags.join(' '), c.assignee, c.status].join(' ');
      return cleanStr(searchable).includes(q);
    });
  }, [myClients, searchQuery]);

  // Reset selection when data changes
  useEffect(() => setSelectedRows(new Set()), [filteredClients]);

  // ── Handlers ──
  const toggleRow = useCallback((id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((checked: boolean) => {
    if (checked) setSelectedRows(new Set(filteredClients.map((c) => String(c.id))));
    else setSelectedRows(new Set());
  }, [filteredClients]);

  const isAllSelected = filteredClients.length > 0 && selectedRows.size === filteredClients.length;
  const isIndeterminate = selectedRows.size > 0 && selectedRows.size < filteredClients.length;

  const handleBulkDelete = useCallback(async () => {
    if (selectedRows.size === 0) return;
    const ok = await confirm(`Biztosan törlöd a kijelölt ${selectedRows.size} ügyfelet? Ez nem vonható vissza!`, { title: 'Ügyfelek törlése', danger: true });
    if (!ok) return;

    try {
      const clientIds = [...selectedRows].map(id => Number(id));
      const res = await authFetch('/admin/api/clients/bulk_delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: clientIds }),
      });
      if (res.ok) {
        showToast(`${clientIds.length} ügyfél törölve`);
      } else {
        showToast('Hiba a törlés során', 'error');
      }
    } catch {
      showToast('Hiba a törlés során', 'error');
    }
    refetchClients();
  }, [selectedRows, confirm, refetchClients]);

  const toggleCol = useCallback((key: string) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const openClientDetail = useCallback((clientId: string, source: 'clients' | 'interactions' = 'clients') => {
    setSelectedClientId(clientId);
    setDetailSource(source);
  }, []);

  const closeClientDetail = useCallback(() => {
    setSelectedClientId(null);
  }, []);

  // ── Client Detail overlay ──
  if (selectedClientId) {
    const client = enrichedClients.find((c) => String(c.id) === selectedClientId);
    if (client) {
      return (
        <ClientDetailView
          client={client}
          clientsMap={clientsMap}
          sessions={sessions}
          events={events}
          source={detailSource}
          onBack={closeClientDetail}
          onRefresh={refetchClients}
        />
      );
    }
  }

  // ── Status badge ──
  function statusBadge(c: EnrichedClient) {
    if (c.isInactive) {
      return <span className="status-badge badge-inactive">INAKTÍV</span>;
    }
    if (c.isNew) {
      return <span className="status-badge badge-new">ÚJ</span>;
    }
    return <span className="status-badge badge-returning">VISSZATÉRŐ</span>;
  }

  return (
    <div className="analytics-shell">
      <ConfirmDialog />

      {/* Campaign Wizard Modal */}
      {showCampaignWizard && (
        <CampaignWizardModal
          onClose={() => setShowCampaignWizard(false)}
          onCreated={() => { setShowCampaignWizard(false); setSelectedRows(new Set()); }}
          initialSelectedIds={Array.from(selectedRows)}
        />
      )}

      {/* Page title — standalone */}
      <div className="mb-20">
        <div className="page-title">Ügyféllista</div>
      </div>


      {/* ═══ MOBILE: Search bar + Card view ═══ */}
      {isMobile && (
        <div ref={pullClients.containerRef} className="cl-pull-container">
          {/* Pull-to-refresh indicator */}
          <div className="pull-to-refresh-indicator" style={{ height: pullClients.pullDistance > 0 || pullClients.isRefreshing ? Math.max(pullClients.pullDistance, pullClients.isRefreshing ? 36 : 0) : 0 }}>
            {pullClients.isRefreshing ? (
              <div className="pull-spinner" />
            ) : pullClients.pullDistance > 0 ? (
              <svg className={`pull-arrow${pullClients.pullDistance > 30 ? ' ready' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 15 12 9 18 15" /></svg>
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
                placeholder="Keresés ügyfelek között..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="mobile-search-clear" onClick={() => setSearchQuery('')}>✕</button>
              )}
            </div>
            <div className="mobile-search-meta">
              <span className="cl-mobile-count">
                {filteredClients.length} ügyfél
              </span>
            </div>
          </div>

          {/* Mobile card list */}
          <div className="mobile-card-list">
            {filteredClients.length === 0 ? (
              clients.length === 0
                ? <TableSkeleton columns={3} rows={4} />
                : <div className="cl-empty-center"><span className="no-data">Nincs találat</span></div>
            ) : (
              filteredClients.map((c) => {
                // Avatar initials & color
                const initials = (c.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
                const avatarColors = ['#6366f1', '#0d9488', '#d946ef', '#f59e0b', '#3b82f6', '#ef4444', '#22c55e', '#8b5cf6'];
                const avatarBg = avatarColors[(c.name || '').length % avatarColors.length];
                // Accent color per status
                const accentColor = c.isNew ? '#1ceee0' : c.isInactive ? '#94a3b8' : '#22c55e';

                return (
                  <div
                    key={String(c.id)}
                    className="mobile-card"
                    style={{ '--accent': accentColor } as React.CSSProperties}
                    onClick={() => openClientDetail(String(c.id))}
                  >
                    {/* Card header: avatar + name + badge */}
                    <div className="mobile-card-header">
                      <div className="mobile-card-avatar" style={{ background: avatarBg }}>
                        {initials}
                      </div>
                      <div className="cl-card-info">
                        <div className="mobile-card-name">{c.name}</div>
                        {c.lastInteraction && (
                          <div className="mobile-card-subtitle">
                            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="10" height="10" className="cl-clock-icon">
                              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                            {fmtDt(c.lastInteraction)}
                          </div>
                        )}
                      </div>
                      {statusBadge(c)}
                    </div>

                    {/* Contact info — inline */}
                    <div className="mobile-card-details">
                      {c.phone && (
                        <div className="mobile-card-detail-row">
                          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13">
                            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                          </svg>
                          <span>{c.phone}</span>
                        </div>
                      )}
                      {c.email && (
                        <div className="mobile-card-detail-row">
                          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                          <span>{c.email}</span>
                        </div>
                      )}
                    </div>

                    {/* Tags + footer */}
                    <div className="mobile-card-footer">
                      {c.tags.length > 0 && (
                        <div className="flex-row gap-4 flex-wrap">
                          {c.tags.slice(0, 2).map((t) => <TagBadge key={t} tag={t} />)}
                          {c.tags.length > 2 && <span className="cl-tag-overflow">+{c.tags.length - 2}</span>}
                        </div>
                      )}
                      {c.assignee && (
                        <div className="mobile-card-footer-item cl-footer-right">
                          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12" height="12"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                          <span>{c.assignee}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
        </div>
        </div>
      )}

      {/* ═══ DESKTOP: Table view ═══ */}
      {!isMobile && viewMode === 'table' && (
        <div className="table-card card-container cl-table-wrap">
          {/* Toolbar strip */}
          <div className="toolbar-strip">
            {/* Left: search + count */}
            <div className="flex-row gap-12">
              <input
                type="text"
                className="int-toolbar-input int-toolbar-input--w220"
                placeholder="Keresés..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {filteredClients.length > 0 && (
                <span className="text-desc font-semibold cl-no-wrap">
                  {filteredClients.length} ügyfél
                </span>
              )}
            </div>

            {/* Right: actions */}
            <div className="flex-row gap-8 flex-wrap">
              {/* Bulk delete */}
              {isAdmin && selectedRows.size > 0 && (
                <button className="int-toolbar-btn cl-btn--delete" onClick={handleBulkDelete}>
                  Kijelöltek törlése ({selectedRows.size})
                </button>
              )}

              {/* Campaign export */}
              {selectedRows.size > 0 && (
                <button
                  className="cl-btn--export int-toolbar-btn"
                  onClick={() => setShowCampaignWizard(true)}
                >
                  Kampányba exportálás ({selectedRows.size})
                </button>
              )}

              {/* Column toggle */}
              <div className="cl-col-toggle" ref={colDropdownRef}>
                <button
                  className="int-toolbar-btn cl-col-toggle-btn"
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
                    {CLIENT_COLUMNS.map((col) => (
                      <label key={col.key} className="cl-col-label">
                        <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)} className="cl-col-checkbox" />
                        {col.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <table className="data-table data-table--no-radius">
            <thead>
              <tr>
                <th className="th-checkbox">
                  <input type="checkbox" checked={isAllSelected} ref={(el) => { if (el) el.indeterminate = isIndeterminate; }} onChange={(e) => toggleAll(e.target.checked)} className="th-select-checkbox" />
                </th>
                {CLIENT_COLUMNS.map((col) => visibleCols.has(col.key) ? <th key={col.key}>{col.label}</th> : null)}
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                <td colSpan={visibleCols.size + 1} className="td-empty">
                    {clients.length === 0 ? <TableSkeleton columns={visibleCols.size} rows={8} /> : <div className="cl-empty-center"><span className="no-data">Nincs találat</span></div>}
                  </td>
                </tr>
              ) : (
                filteredClients.map((c) => (
                  <tr key={String(c.id)} className="cursor-pointer" onClick={() => openClientDetail(String(c.id))}>
                    <td className="td-checkbox" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedRows.has(String(c.id))} onChange={() => toggleRow(String(c.id))} className="td-select-checkbox" />
                    </td>
                    {visibleCols.has('name') && (
                      <td className="td-p">
                        <div className="cl-name-cell">{c.name}</div>
                        <div className="cl-name-id">ID: {c.id}</div>
                      </td>
                    )}
                    {visibleCols.has('status_badge') && (
                      <td className="td-p">{statusBadge(c)}</td>
                    )}
                    {visibleCols.has('tags') && (
                      <td className="td-p">
                        <div className="flex-row gap-4 flex-wrap">
                          {c.tags.slice(0, 3).map((t) => <TagBadge key={t} tag={t} />)}
                          {c.tags.length > 3 && <span className="cl-tag-overflow--sm">+{c.tags.length - 3}</span>}
                        </div>
                      </td>
                    )}
                    {visibleCols.has('phone') && (
                      <td className="td-p-sm">{c.phone || '—'}</td>
                    )}
                    {visibleCols.has('email') && (
                      <td className="td-p-sm">{c.email || '—'}</td>
                    )}
                    {visibleCols.has('assignee') && (
                      <td className="td-p-fs13" onClick={e => e.stopPropagation()}>
                        {isAdmin ? (
                          <AssigneeDropdown
                            value={c.assignee || ''}
                            members={members}
                            onChange={async (newAssignee) => {
                              const cd = parseCustomData(c.raw.custom_data);
                              const updatedCd = { ...cd, assigned_to: newAssignee, felelos: newAssignee };
                              await authFetch(`/admin/api/clients/${c.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ custom_data: updatedCd }),
                              });
                              showToast(newAssignee ? `Felelős: ${newAssignee}` : 'Felelős eltávolítva');
                              refetchClients();
                            }}
                          />
                        ) : (
                          <span className="cl-assignee-muted">{c.assignee || '—'}</span>
                        )}
                      </td>
                    )}
                    {visibleCols.has('lastInteraction') && (
                      <td className="td-p-sm-nowrap">{c.lastInteraction ? fmtDt(c.lastInteraction) : '—'}</td>
                    )}
                    {visibleCols.has('sales_status') && (
                      <td className="td-p-fs13">
                        {kanbanNameMap[c.status] || c.status || '—'}
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
  );
}

function AssigneeDropdown({ value, members, onChange }: { value: string; members: MemberUser[]; onChange: (val: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const options = [
    { value: '', label: 'Nincs hozzárendelve' },
    ...members.map(m => ({ value: m.full_name || m.username, label: m.full_name || m.username }))
  ];
  
  const current = options.find(o => o.value === value);
  const displayLabel = current?.label || value || 'Nincs hozzárendelve';

  return (
    <div ref={ref} className="role-dd-wrap" onClick={e => e.stopPropagation()}>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className={`role-dd-btn${open ? ' role-dd-btn--open' : ''}`} style={{ minWidth: '160px', justifyContent: 'space-between' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayLabel}</span>
        <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="12" height="12" className={`role-dd-chevron${open ? ' role-dd-chevron--open' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="role-dd-panel" style={{ minWidth: '100%', left: 0, right: 'auto', zIndex: 9999 }}>
          {options.map(o => (
            <button key={o.value} type="button" onClick={(e) => { e.stopPropagation(); onChange(o.value); setOpen(false); }} className={`role-dd-option ${o.value === value ? 'role-dd-option--active' : 'role-dd-option--idle'}`}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
              {o.value === value && (
                <svg fill="none" stroke="var(--accent, #1ceee0)" strokeWidth="2.5" viewBox="0 0 24 24" width="14" height="14" style={{ flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
