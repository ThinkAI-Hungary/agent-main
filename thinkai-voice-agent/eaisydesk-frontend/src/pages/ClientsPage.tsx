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
      return <span style={{ background: '#f3f4f6', color: '#9ca3af', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 9999, display: 'inline-block' }}>INAKTÍV</span>;
    }
    if (c.isNew) {
      return <span style={{ background: '#dbeafe', color: '#1e40af', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 9999, display: 'inline-block' }}>ÚJ</span>;
    }
    return <span style={{ background: '#dcfce7', color: '#166534', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 9999, display: 'inline-block' }}>VISSZATÉRŐ</span>;
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
      <div style={{ marginBottom: 20 }}>
        <div className="page-title">Ügyféllista</div>
      </div>


      {/* ═══ MOBILE: Search bar + Card view ═══ */}
      {isMobile && (
        <div ref={pullClients.containerRef} style={{ overflowY: 'auto' }}>
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
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                {filteredClients.length} ügyfél
              </span>
            </div>
          </div>

          {/* Mobile card list */}
          <div className="mobile-card-list">
            {filteredClients.length === 0 ? (
              clients.length === 0
                ? <TableSkeleton columns={3} rows={4} />
                : <div style={{ textAlign: 'center', padding: 40 }}><span className="no-data">Nincs találat</span></div>
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
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mobile-card-name">{c.name}</div>
                        {c.lastInteraction && (
                          <div className="mobile-card-subtitle">
                            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="10" height="10" style={{ verticalAlign: '-1px', marginRight: 3, opacity: 0.4 }}>
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
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {c.tags.slice(0, 2).map((t) => <TagBadge key={t} tag={t} />)}
                          {c.tags.length > 2 && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>+{c.tags.length - 2}</span>}
                        </div>
                      )}
                      {c.assignee && (
                        <div className="mobile-card-footer-item" style={{ marginLeft: 'auto' }}>
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
        <div className="table-card" style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
          {/* Toolbar strip */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 18px', borderBottom: '1px solid var(--border)',
            flexWrap: 'wrap', gap: 8,
          }}>
            {/* Left: search + count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="text"
                className="int-toolbar-input"
                placeholder="Keresés ügyfelek között..."
                style={{ width: 250 }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {filteredClients.length > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {filteredClients.length} ügyfél
                </span>
              )}
            </div>

            {/* Right: actions */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Bulk delete */}
              {isAdmin && selectedRows.size > 0 && (
                <button className="int-toolbar-btn" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={handleBulkDelete}>
                  Kijelöltek törlése ({selectedRows.size})
                </button>
              )}

              {/* Campaign export */}
              {selectedRows.size > 0 && (
                <button
                  className="int-toolbar-btn"
                  style={{ color: '#1ceee0', borderColor: '#1ceee0', background: 'rgba(28,238,224,0.08)', fontWeight: 600 }}
                  onClick={() => setShowCampaignWizard(true)}
                >
                  Kampányba exportálás ({selectedRows.size})
                </button>
              )}

              {/* Column toggle */}
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
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '10px 0', minWidth: 200, zIndex: 50 }}>
                    <div style={{ padding: '4px 14px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Látható oszlopok</div>
                    {CLIENT_COLUMNS.map((col) => (
                      <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                        <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)} style={{ accentColor: '#1ceee0', width: 15, height: 15, cursor: 'pointer' }} />
                        {col.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <table className="data-table" style={{ borderRadius: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: 'center' }}>
                  <input type="checkbox" checked={isAllSelected} ref={(el) => { if (el) el.indeterminate = isIndeterminate; }} onChange={(e) => toggleAll(e.target.checked)} style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#1ceee0' }} />
                </th>
                {CLIENT_COLUMNS.map((col) => visibleCols.has(col.key) ? <th key={col.key}>{col.label}</th> : null)}
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                <td colSpan={visibleCols.size + 1} style={{ padding: 0, border: 'none' }}>
                    {clients.length === 0 ? <TableSkeleton columns={visibleCols.size} rows={8} /> : <div style={{ textAlign: 'center', padding: 40 }}><span className="no-data">Nincs találat</span></div>}
                  </td>
                </tr>
              ) : (
                filteredClients.map((c) => (
                  <tr key={String(c.id)} style={{ cursor: 'pointer' }} onClick={() => openClientDetail(String(c.id))}>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedRows.has(String(c.id))} onChange={() => toggleRow(String(c.id))} style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#1ceee0' }} />
                    </td>
                    {visibleCols.has('name') && (
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ID: {c.id}</div>
                      </td>
                    )}
                    {visibleCols.has('status_badge') && (
                      <td style={{ padding: '12px 16px' }}>{statusBadge(c)}</td>
                    )}
                    {visibleCols.has('tags') && (
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {c.tags.slice(0, 3).map((t) => <TagBadge key={t} tag={t} />)}
                          {c.tags.length > 3 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{c.tags.length - 3}</span>}
                        </div>
                      </td>
                    )}
                    {visibleCols.has('phone') && (
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text)' }}>{c.phone || '—'}</td>
                    )}
                    {visibleCols.has('email') && (
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text)' }}>{c.email || '—'}</td>
                    )}
                    {visibleCols.has('assignee') && (
                      <td style={{ padding: '12px 16px', fontSize: 13 }} onClick={e => e.stopPropagation()}>
                        {isAdmin ? (
                          <select
                            value={c.assignee || ''}
                            onChange={async (e) => {
                              const newAssignee = e.target.value;
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
                            style={{
                              background: 'var(--card)', border: '1px solid var(--border)',
                              borderRadius: 6, padding: '4px 8px', fontSize: 12,
                              color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit',
                              minWidth: 140,
                            }}
                          >
                            <option value="">Nincs hozzárendelve</option>
                            {members.map(m => (
                              <option key={m.id} value={m.full_name || m.username}>
                                {m.full_name || m.username}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>{c.assignee || '—'}</span>
                        )}
                      </td>
                    )}
                    {visibleCols.has('lastInteraction') && (
                      <td style={{ padding: '12px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>{c.lastInteraction ? fmtDt(c.lastInteraction) : '—'}</td>
                    )}
                    {visibleCols.has('sales_status') && (
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>
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
