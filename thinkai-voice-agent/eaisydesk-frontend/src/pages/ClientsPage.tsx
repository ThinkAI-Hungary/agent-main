/**
 * ClientsPage – 1:1 migration of legacy view-clients + admin-customers.js
 * Table view + Card view, search, column visibility, checkbox selection, bulk delete.
 * Client Detail overlay is handled by ClientDetailView component.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useClients } from '../hooks/useClients';
import { useSessions, type SessionSummary } from '../hooks/useSessions';
import { useCalendarEvents, type CalendarEvent } from '../hooks/useCalendarEvents';
import { parseCustomData, bestClientName, isAssignedToMe, type ClientRecord } from '../helpers/clientResolvers';
import { fmtDt, cleanStr } from '../helpers/formatters';
import { TagBadge } from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { showToast } from '../components/ui/Toast';
import { supabase } from '../lib/supabase';
import { authFetch } from '../api/client';
import ClientDetailView from '../components/clients/ClientDetailView';
import CampaignWizardModal from '../components/outbound/CampaignWizardModal';

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
  { key: 'actions', label: 'Műveletek' },
] as const;

export default function ClientsPage() {
  const { user, isAdmin } = useAuth();
  const { clients, clientsMap, refetch: refetchClients } = useClients();
  const { sessions } = useSessions(500);
  const { events } = useCalendarEvents();
  const { confirm, ConfirmDialog } = useConfirm();

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
      const now = Date.now();
      const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
      const hasRecentAppointment = matchingEvents.some((ev) => {
        if (!ev.start_dt) return false;
        return new Date(ev.start_dt).getTime() > ninetyDaysAgo;
      });
      const isInactive = matchingEvents.length > 0 && !hasRecentAppointment;
      const isNew = matchingEvents.length === 0;

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

    let deleted = 0;
    for (const id of selectedRows) {
      try {
        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (!error) deleted++;
      } catch { /* continue */ }
    }
    showToast(`${deleted} ügyfél törölve`);
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

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Ügyféllista</div>
          <div className="page-subtitle">Ügyfelek listázása és alapadatok módosítása</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>


          {/* Search */}
          <input
            type="text"
            className="int-toolbar-input"
            placeholder="Keresés ügyfelek között..."
            style={{ width: 250 }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* Bulk delete */}
          {isAdmin && selectedRows.size > 0 && (
            <button className="int-toolbar-btn" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={handleBulkDelete}>
              🗑 Kijelöltek törlése ({selectedRows.size})
            </button>
          )}

          {/* Campaign export */}
          {selectedRows.size > 0 && (
            <button
              className="int-toolbar-btn"
              style={{ color: '#1ceee0', borderColor: '#1ceee0', background: 'rgba(28,238,224,0.08)', fontWeight: 600 }}
              onClick={() => setShowCampaignWizard(true)}
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
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
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '10px 0', minWidth: 200, zIndex: 50 }}>
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

      {/* Refresh */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button
          onClick={() => refetchClients()}
          title="Frissítés"
          style={{ background: 'none', border: 'none', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 6 }}
        >
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 15, height: 15 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 20v-5h-5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.49 9A9 9 0 005.64 5.64L4 9m16 6l-1.64 3.36A9 9 0 013.51 15" />
          </svg>
        </button>
      </div>

      {/* Table view */}
      {viewMode === 'table' && (
        <div className="table-card" style={{ overflowX: 'auto' }}>
          <table className="data-table">
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
                  <td colSpan={visibleCols.size + 1} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
                    {clients.length === 0 ? <><Spinner /><div style={{ marginTop: 10 }}>Betöltés...</div></> : 'Nincs találat'}
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
                              await supabase.from('clients').update({ custom_data: updatedCd }).eq('id', c.id);
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
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.status || '—'}</td>
                    )}
                    {visibleCols.has('actions') && (
                      <td style={{ padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openClientDetail(String(c.id))}
                          style={{ background: 'rgba(28,238,224,0.1)', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          Részletek
                        </button>
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
