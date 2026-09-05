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
import { fmtDt, cleanStr, formatPhoneHu } from '../helpers/formatters';
import { TagBadge } from '../components/ui/Badge';
import { SALES_TAGS, getTagColor } from '../helpers/interactionClassifiers';
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


const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Legújabbak elől' },
  { value: 'date_asc', label: 'Legrégebbiek elől' },
  { value: 'name_asc', label: 'Név alapján (A-Z)' },
  { value: 'name_desc', label: 'Név alapján (Z-A)' },
  { value: 'interaction_desc', label: 'Utolsó interakció' },
];

const CLIENT_COLUMNS = [
  { key: 'name', label: 'Ügyfél' },
  { key: 'status_badge', label: 'Ügyfélstátusz' },
  { key: 'phone', label: 'Telefonszám' },
  { key: 'email', label: 'Email' },
  { key: 'tags', label: 'Címkék' },
  { key: 'sales_status', label: 'Értékesítési státusz' },
  { key: 'lastInteraction', label: 'Utolsó interakció' },
  { key: 'assignee', label: 'Felelős' },
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

  // ── Új ügyfél modál ──
  const [showNewClient, setShowNewClient] = useState(false);
  const [ncName, setNcName] = useState('');
  const [ncPhone, setNcPhone] = useState('');
  const [ncEmail, setNcEmail] = useState('');
  const [ncSaving, setNcSaving] = useState(false);

  const handleCreateClient = useCallback(async () => {
    const name = ncName.trim();
    const phone = ncPhone.trim();
    const email = ncEmail.trim();
    if (!name) { showToast('Az ügyfél neve kötelező', 'error'); return; }
    if (!phone && !email) { showToast('Legalább egy elérhetőség (telefonszám vagy email) kötelező', 'error'); return; }
    setNcSaving(true);
    try {
      const res = await authFetch('/admin/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_data: { name, email, telefonszam: phone } }),
      });
      if (res.ok) {
        showToast('Ügyfél létrehozva');
        setShowNewClient(false);
        setNcName(''); setNcPhone(''); setNcEmail('');
        refetchClients();
      } else showToast('Hiba a mentéskor', 'error');
    } catch { showToast('Hiba', 'error'); }
    finally { setNcSaving(false); }
  }, [ncName, ncPhone, ncEmail, refetchClients]);

  // ── Értékesítési státusz: kanban-tagság szerint (olvasott) ──
  const salesStatusOf = useCallback((c: EnrichedClient): string => {
    const cd = parseCustomData(c.raw.custom_data);
    if (cd.kanban_removed) return '';
    const hasSalesTag = c.tags.some((t) => SALES_TAGS.includes(t));
    const statusIsCol = kanbanColumns.some((col) => col.id === c.status);
    if (!hasSalesTag && !statusIsCol) return '';
    const col = kanbanColumns.find((col) => col.id === c.status);
    return col ? col.name : 'UTÁNKÖVETÉS';
  }, [kanbanColumns]);

  // ── Címke törlése a listából ──
  const handleRemoveTag = useCallback(async (clientId: string | number, tag: string) => {
    const c = clients.find((cl) => String(cl.id) === String(clientId));
    if (!c) return;
    const cd = parseCustomData(c.custom_data);
    const tags = (((cd?.tags as string[]) || [])).filter((t) => t !== tag);
    try {
      const res = await authFetch(`/admin/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_data: { ...cd, tags } }),
      });
      if (res.ok) { showToast(`Címke eltávolítva: ${tag}`); refetchClients(); }
      else showToast('Hiba a címke törlésekor', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [clients, refetchClients]);

  // ── Lapozás ──
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [filterOpen, setFilterOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [filterKategoria, setFilterKategoria] = useState<Set<string>>(new Set());
  const [filterErtStatusz, setFilterErtStatusz] = useState<Set<string>>(new Set());
  const [filterFelelos, setFilterFelelos] = useState<Set<string>>(new Set());
  
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState('date_desc');
  // Szűrő/keresés/sorrend változásakor vissza az első oldalra
  useEffect(() => { setPage(1); }, [searchQuery, filterKategoria, filterErtStatusz, filterFelelos, sortBy]);

  const ALL_KATEGORIA = ['Új ügyfél', 'Visszatérő', 'Inaktív'];
  
  const activeFilterCount = filterKategoria.size + filterErtStatusz.size + filterFelelos.size;
  const resetFilters = () => {
    setFilterKategoria(new Set());
    setFilterErtStatusz(new Set());
    setFilterFelelos(new Set());
  };


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
      if (colDropdownRef.current && !colDropdownRef.current.contains(e.target as Node)) setColDropdownOpen(false);
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) setSortDropdownOpen(false);
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // ── Enrich clients ──
  // EAISY-241 §1.3.3: demo módban a default felelős mindig „Kis Béla".
  const enrichedClients = useMemo<EnrichedClient[]>(() => {
    // Először „Kis Béla"-t keresünk; ha nincs, az első member/worker
    const kisBela = members.find(m => {
      const n = ((m.full_name || m.username || '') + '').toLowerCase();
      return n.includes('kis bél') || n.includes('kis bel');
    });
    const defaultMunkatars = kisBela || members.find(m => (m.role || '').toLowerCase().includes('munkat') || m.role === 'worker' || m.role === 'member');
    const defaultAssigneeName = defaultMunkatars ? (defaultMunkatars.full_name || defaultMunkatars.username) : '';

    return clients.map((c) => {
      const cd = parseCustomData(c.custom_data);
      const name = bestClientName(c) || c.name || 'Névtelen';
      const email = (cd?.email as string) || c.email || '';
      const phone = (cd?.telefonszam as string) || (cd?.phone as string) || (cd?.telefon as string) || c.phone || '';
      const tags: string[] = (cd?.tags as string[]) || [];
      
      let assignee = ((cd?.assigned_to as string) || (cd?.felelos as string) || '').trim();
      if (!assignee && defaultAssigneeName) {
        assignee = defaultAssigneeName;
      }

      // Count calendar appointments for this client
      const clientNameLower = name.toLowerCase().trim();
      const clientEmailLower = email.toLowerCase().trim();
      const matchingEvents = events.filter((ev: CalendarEvent) => {
        const evName = (ev.attendee || '').toLowerCase().trim();
        const evEmail = (ev.attendee_email || '').toLowerCase().trim();
        return (clientNameLower && evName.includes(clientNameLower)) || (clientEmailLower && evEmail === clientEmailLower);
      });

      // Last interaction
      // EAISY-241 §1.3.1/2: gazdagabb matching — a korábbi csak a pontos név-egyezést
      // és az email-t session_id-ben nézte. Most: client_id, messenger_id, phone, email
      // és session_id voice-minták is. Így a voice-agent interakciók is hozzájárulnak.
      const clientPhoneDigits = phone.replace(/[^\d]/g, '');
      let lastInteraction = '';
      for (const s of sessions) {
        const participant = (s.participant || s.client_name || '').toLowerCase().trim();
        const sid = (s.session_id || '').toLowerCase();
        let match = false;
        // 1. Pontos név-egyezés
        if (participant && participant === clientNameLower) match = true;
        // 2. Email a session_id-ben
        if (!match && clientEmailLower && sid.includes(clientEmailLower)) match = true;
        // 3. Phone (session_id participant-ként vagy beleértve)
        if (!match && clientPhoneDigits.length >= 6) {
          const partDigits = participant.replace(/[^\d]/g, '');
          if (partDigits && (partDigits.endsWith(clientPhoneDigits) || clientPhoneDigits.endsWith(partDigits))) match = true;
          if (sid.includes(clientPhoneDigits)) match = true;
        }
        // 4. messenger_id / instagram_id session_id prefix
        const messengerId = ((cd?.messenger_id as string) || (cd?.messenger_psid as string) || '').toString();
        if (!match && messengerId && (sid.includes(messengerId) || sid.includes(`messenger_${messengerId}`))) match = true;
        if (match) {
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
  }, [clients, sessions, events, members]);

  // ── Member filtering: non-admins only see assigned or unassigned clients ──
  const myClients = useMemo(() => {
    if (isAdmin) return enrichedClients;
    const username = user?.username || '';
    const fullName = user?.fullName || '';
    return enrichedClients.filter(c => {
      const assignedTo = c.assignee;
      if (!assignedTo) return true;
      return assignedTo === username || (!!fullName && assignedTo === fullName);
    });
  }, [enrichedClients, isAdmin, user]);

  const { ALL_ERT_STATUSZ, ALL_FELELOS } = useMemo(() => {
    const statuses = kanbanColumns.map(col => col.name);
    if (myClients.some(c => !c.status)) {
      if (!statuses.includes('Üres')) statuses.push('Üres');
    }
    return {
      ALL_ERT_STATUSZ: statuses,
      ALL_FELELOS: Array.from(new Set(myClients.map(c => c.assignee || 'Nincs felelős'))).sort()
    };
  }, [myClients, kanbanColumns]);

  // ── Search & filter ──
  const filteredClients = useMemo(() => {
    let result = myClients;
    
    // Filters
    if (filterKategoria.size > 0 || filterErtStatusz.size > 0 || filterFelelos.size > 0) {
      result = result.filter(c => {
        let katMatch = true;
        if (filterKategoria.size > 0) {
          const kateg = c.isInactive ? 'Inaktív' : (c.isNew ? 'Új ügyfél' : 'Visszatérő');
          if (!filterKategoria.has(kateg)) katMatch = false;
        }
        
        let ertMatch = true;
        if (filterErtStatusz.size > 0) {
          const ertStatusz = kanbanNameMap[c.status] || c.status || 'Üres';
          if (!filterErtStatusz.has(ertStatusz)) ertMatch = false;
        }

        let felMatch = true;
        if (filterFelelos.size > 0) {
          const felelos = c.assignee || 'Nincs felelős';
          if (!filterFelelos.has(felelos)) felMatch = false;
        }

        return katMatch && ertMatch && felMatch;
      });
    }

    // Search
    if (searchQuery) {
      const q = cleanStr(searchQuery);
      result = result.filter((c) => {
        const searchable = [c.name, c.email, c.phone, c.tags.join(' '), c.assignee, c.status].join(' ');
        return cleanStr(searchable).includes(q);
      });
    }
    
    // Sort
    return result.sort((a, b) => {
      if (sortBy === 'date_desc') return (b.created_at || '').localeCompare(a.created_at || '');
      if (sortBy === 'date_asc') return (a.created_at || '').localeCompare(b.created_at || '');
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '', 'hu');
      if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '', 'hu');
      if (sortBy === 'interaction_desc') return (b.lastInteraction || '').localeCompare(a.lastInteraction || '');
      return 0;
    });
  }, [myClients, searchQuery, filterKategoria, filterErtStatusz, filterFelelos, sortBy, kanbanNameMap]);

  // ── Lapozás (oldal scroll, 10/oldal) ──
  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageClients = useMemo(
    () => filteredClients.slice(pageStart, pageStart + PAGE_SIZE),
    [filteredClients, pageStart]
  );

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

  // ── Status badge (UI Kit: Új ügyfél → accent tint, Visszatérő → navy tint) ──
  function statusBadge(c: EnrichedClient) {
    if (c.isInactive) {
      return <span className="cp-badge cp-grayb"><i className="cp-dot" />Inaktív</span>;
    }
    if (c.isNew) {
      return <span className="cp-badge cp-accentb"><i className="cp-dot" />Új ügyfél</span>;
    }
    return <span className="cp-badge cp-navyb"><i className="cp-dot" />Visszatérő ügyfél</span>;
  }

  function avatarInitials(name: string): string {
    const parts = (name || '?').trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : (name || '?').substring(0, 2).toUpperCase();
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

      {/* Fejléc sáv: morzsák + cím */}
      <header className="int-page-head">
        <nav className="int-breadcrumbs" aria-label="Navigációs morzsák">
          <span className="int-crumb-link">Ügyfélközpont</span>
          <span className="int-crumb-sep">/</span>
          <span className="int-crumb-current">Ügyféllista</span>
        </nav>
        <h1 className="page-title int-page-title">Ügyféllista</h1>
      </header>


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
                          <span>{formatPhoneHu(c.phone)}</span>
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
        <>
        {/* Fejléc sáv — kereső + akciók egy keretes sorban */}
        <div className="int-header-bar">
          {/* Kereső */}
          <div className="int-searchbox">
            <svg className="int-search-icon" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.2" y2="16.2" />
            </svg>
            <input
              type="text"
              className="int-search-input"
              placeholder="Keresés név, e-mail, telefonszám, címke szerint..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Jobb akciók */}
          <div className="int-header-actions">
            {/* Bulk delete */}
            {isAdmin && selectedRows.size > 0 && (
              <button className="cd-btn int-btn-danger" onClick={handleBulkDelete}>
                Kijelöltek törlése ({selectedRows.size})
              </button>
            )}

            {/* Campaign export */}
            {selectedRows.size > 0 && (
              <button
                className="cd-btn int-btn-danger"
                onClick={() => setShowCampaignWizard(true)}
              >
                Kampányba exportálás ({selectedRows.size})
              </button>
            )}

            {/* Filter — primary (kit 05) */}
            <div className="relative int-dropdown-wrap" ref={filterDropdownRef}>
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
                {activeFilterCount > 0 && <span className="int-filter-badge">{activeFilterCount}</span>}
              </button>
              {filterOpen && (
                <div className="dropdown-menu dropdown-menu--filter">
                  <div className="dropdown-header">Szűrők</div>
                  <div className="int-filter-list">
                    <FilterSection title="Ügyfél kategória">
                      {ALL_KATEGORIA.map((v) => (
                        <FilterCheckbox key={v} label={v} checked={filterKategoria.has(v)} onChange={() => toggleFilter(filterKategoria, v, setFilterKategoria)} />
                      ))}
                    </FilterSection>
                    <FilterSection title="Értékesítési státusz" bordered>
                      {ALL_ERT_STATUSZ.map((v) => (
                        <FilterCheckbox key={v} label={v} checked={filterErtStatusz.has(v)} onChange={() => toggleFilter(filterErtStatusz, v, setFilterErtStatusz)} />
                      ))}
                    </FilterSection>
                    <FilterSection title="Felelős" bordered>
                      {ALL_FELELOS.map((v) => (
                        <FilterCheckbox key={v} label={v} checked={filterFelelos.has(v)} onChange={() => toggleFilter(filterFelelos, v, setFilterFelelos)} />
                      ))}
                    </FilterSection>
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

            {/* Sort — ikon-only, tooltip (kit 14) */}
            <div className="relative int-dropdown-wrap" ref={sortDropdownRef}>
              <button
                className="cd-btn int-btn-icon"
                title="Sorrend"
                aria-label="Sorrend"
                aria-expanded={sortDropdownOpen}
                onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
              >
                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="15">
                  <polyline points="8 9 12 5 16 9" /><polyline points="16 15 12 19 8 15" />
                </svg>
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

            {/* Column toggle (kit 14) */}
            <div className="relative int-dropdown-wrap" ref={colDropdownRef}>
              <button
                className="cd-btn int-btn-icon"
                title="Oszlopok megjelenítése"
                aria-label="Oszlopok megjelenítése"
                aria-expanded={colDropdownOpen}
                onClick={() => setColDropdownOpen(!colDropdownOpen)}
              >
                <svg fill="none" height="15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="15">
                  <rect x="3" y="4" width="5" height="16" rx="1" /><rect x="9.5" y="4" width="5" height="16" rx="1" /><rect x="16" y="4" width="5" height="16" rx="1" />
                </svg>
              </button>
              {colDropdownOpen && (
                <div className="dropdown-menu dropdown-menu--columns">
                  <div className="dropdown-header">Látható oszlopok</div>
                  {CLIENT_COLUMNS.map((col) => (
                    <label key={col.key} className="int-col-label">
                      <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)} className="int-col-cb" />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* + Új ügyfél — accent (utolsó a sorban) */}
            <button className="cp-btn-accent" onClick={() => setShowNewClient(true)}>
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="15" height="15"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Új ügyfél
            </button>
          </div>
        </div>

        {/* Table card — kit, oldalgörgetéssel */}
        <div className="cd-table-card">
          <div className="cd-table-scroll">
          <table>
            <thead>
              <tr>
                <th className="int-checkbox-col">
                  <input type="checkbox" checked={isAllSelected} ref={(el) => { if (el) el.indeterminate = isIndeterminate; }} onChange={(e) => toggleAll(e.target.checked)} className="int-checkbox-input" />
                </th>
                {CLIENT_COLUMNS.map((col) => {
                  if (!visibleCols.has(col.key)) return null;
                  if (col.key === 'name') {
                    return (
                      <th key={col.key} className="cp-th-sort">
                        <button type="button" className="int-sort-btn" onClick={() => setSortBy(sortBy === 'name_asc' ? 'name_desc' : 'name_asc')} title="Név szerinti sorrend váltása">
                          Ügyfél
                          <span className="int-sort-ic">
                            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="13" height="13">
                              {sortBy === 'name_asc'
                                ? <polyline points="6 14 12 8 18 14" />
                                : <polyline points="6 9 12 15 18 9" />}
                            </svg>
                          </span>
                        </button>
                      </th>
                    );
                  }
                  return <th key={col.key}>{col.label}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr><td colSpan={visibleCols.size + 1}><TableSkeleton columns={visibleCols.size} rows={8} /></td></tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={visibleCols.size + 1}>
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
                pageClients.map((c) => (
                  <tr key={String(c.id)} className="cursor-pointer" onClick={() => openClientDetail(String(c.id))}>
                    <td className="int-checkbox-col" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedRows.has(String(c.id))} onChange={() => toggleRow(String(c.id))} className="int-checkbox-input" />
                    </td>
                    {visibleCols.has('name') && (
                      <td>
                        <span className="cp-channel">
                          <span className="cp-ch cp-ch-name">{avatarInitials(c.name)}</span>
                          <span className="cp-client-name">{c.name}</span>
                        </span>
                      </td>
                    )}
                    {visibleCols.has('status_badge') && (
                      <td>{statusBadge(c)}</td>
                    )}
                    {visibleCols.has('phone') && (
                      <td className={c.phone ? 'cp-time' : 'cp-result'}>{c.phone ? formatPhoneHu(c.phone) : '—'}</td>
                    )}
                    {visibleCols.has('email') && (
                      <td className={c.email ? '' : 'cp-result'}>{c.email || '—'}</td>
                    )}
                    {visibleCols.has('tags') && (
                      <td>
                        <div className="cd-tags">
                          {c.tags.slice(0, 3).map((t) => {
                            const col = getTagColor(t);
                            return (
                              <span key={t} className="cd-tag-chip" style={{ background: col.bg, color: col.color }}>
                                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
                                {t}
                                <button className="cd-tag-remove" aria-label={`Címke törlése: ${t}`} onClick={(e) => { e.stopPropagation(); handleRemoveTag(c.id, t); }}>
                                  <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                </button>
                              </span>
                            );
                          })}
                          {c.tags.length > 3 && <span className="cp-result">+{c.tags.length - 3}</span>}
                        </div>
                      </td>
                    )}
                    {visibleCols.has('sales_status') && (
                      <td className={salesStatusOf(c) ? '' : 'cp-result'}>
                        {salesStatusOf(c) || '—'}
                      </td>
                    )}
                    {visibleCols.has('lastInteraction') && (
                      <td className="cd-time-cell">{c.lastInteraction ? fmtDt(c.lastInteraction) : '—'}</td>
                    )}
                    {visibleCols.has('assignee') && (
                      <td onClick={e => e.stopPropagation()}>
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
                          <span className="cp-result">{c.assignee || '—'}</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>

          {/* Lapozó (kit 09) */}
          {filteredClients.length > 0 && (
            <div className="int-table-foot">
              <span className="int-foot-count">
                {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredClients.length)} / {filteredClients.length} ügyfél
              </span>
              {totalPages > 1 && (
                <nav className="int-pagination" aria-label="Lapozás">
                  <button type="button" className="int-pg-btn" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="Előző oldal">
                    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  {pageNumbers(safePage, totalPages).map((n, idx) =>
                    n === '…' ? (
                      <span key={`gap-${idx}`} className="int-pg-gap">…</span>
                    ) : (
                      <button key={n} type="button" className={`int-pg-btn${n === safePage ? ' is-on' : ''}`} onClick={() => setPage(n)}>{n}</button>
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
        </>
      )}

      {/* ═══ Új ügyfél modál ═══ */}
      {showNewClient && (
        <div className="modal-overlay" onClick={() => setShowNewClient(false)}>
          <div className="cd-task-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Új ügyfél">
            <div className="cd-task-modal-head">
              <h3 className="modal-title">Új ügyfél</h3>
              <button className="cd-task-modal-x" onClick={() => setShowNewClient(false)} aria-label="Bezárás">
                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="cd-task-modal-body">
              <div className="form-group">
                <label className="cd-task-modal-label" htmlFor="ncName">Név</label>
                <input id="ncName" className="cd-form-input" value={ncName} onChange={e => setNcName(e.target.value)} placeholder="Pl. Kovács Anna" autoFocus />
              </div>
              <div className="form-group">
                <label className="cd-task-modal-label" htmlFor="ncPhone">Telefonszám</label>
                <input id="ncPhone" className="cd-form-input" value={ncPhone} onChange={e => setNcPhone(e.target.value)} placeholder="+36 30 ..." />
              </div>
              <div className="form-group">
                <label className="cd-task-modal-label" htmlFor="ncEmail">Email</label>
                <input id="ncEmail" className="cd-form-input" value={ncEmail} onChange={e => setNcEmail(e.target.value)} placeholder="email@példa.hu" />
                <div className="int-filter-hint" style={{ marginTop: 4 }}>Legalább az egyik elérhetőséget ki kell tölteni.</div>
              </div>
            </div>
            <div className="cd-task-modal-foot">
              <button className="cd-btn" onClick={() => setShowNewClient(false)}>Mégse</button>
              <button className="cd-btn cd-btn-primary" onClick={handleCreateClient} disabled={ncSaving || !ncName.trim() || (!ncPhone.trim() && !ncEmail.trim())}>
                {ncSaving ? 'Mentés...' : 'Mentés'}
              </button>
            </div>
          </div>
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
              {o.value === value && (
                <svg fill="none" stroke="#1CEEE0" strokeWidth="2.5" viewBox="0 0 24 24" width="14" height="14" style={{ flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: o.value === value ? '#082432' : undefined }}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


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

function toggleFilter(current: Set<string>, val: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
  setter(prev => {
    const next = new Set(prev);
    if (next.has(val)) next.delete(val); else next.add(val);
    return next;
  });
}
