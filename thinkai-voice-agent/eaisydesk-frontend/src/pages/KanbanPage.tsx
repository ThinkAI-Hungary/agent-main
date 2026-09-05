/**
 * KanbanPage – Érdeklődőkezelés (értékesítés-támogatás)
 *
 * Belépési szabály: csak az az ügyfél látszik, akinek van legalább egy
 * ÉRTÉKESÍTÉSI címkéje (SALES_TAGS), vagy akinek a státusza valamely kanban
 * oszlopra mutat (korábban áthelyezték / kézzel felvették).
 * Új belépők mindig az UTÁNKÖVETÉS oszlopba kerülnek (védett, fix első oszlop).
 * A kártya 🗑 gombja CSAK a kanbanról távolítja el az ügyfelet
 * (custom_data.kanban_removed jelző) — az ügyfél a rendszerben marad.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  MeasuringStrategy,
  defaultDropAnimationSideEffects,
  type DropAnimation,
} from '@dnd-kit/core';
import { useClients } from '../hooks/useClients';
import { useSessions } from '../hooks/useSessions';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useKanbanColumns } from '../hooks/useKanbanColumns';
import { parseCustomData, bestClientName, isAssignedToMe, type ClientRecord } from '../helpers/clientResolvers';
import { SALES_TAGS } from '../helpers/interactionClassifiers';
import { normalizeNameKey } from '../helpers/formatters';
import { useAuth } from '../context/AuthContext';

import { useConfirm } from '../components/ui/ConfirmDialog';
import { showToast } from '../components/ui/Toast';
import { authFetch } from '../api/client';
import { KanbanSkeleton } from '../components/ui/Skeleton';
import KanbanColumn from '../components/kanban/KanbanColumn';
import KanbanCard from '../components/kanban/KanbanCard';
import ClientDetailView from '../components/clients/ClientDetailView';

// ── Belépési oszlop (a SALES_TAGS az interactionClassifiers-ből) ──
export const FIRST_COL_ID = 'utankovetes';
const FIRST_COL_NAME = 'UTÁNKÖVETÉS';

// ── Enriched kanban card data ──
export interface KanbanCardData {
  id: string | number;
  name: string;
  tags: string[];
  contact: string;
  assignee: string;
  lastInteraction: string;
  isSurgos: boolean;
  status: string;
  created_at: string;
  raw: ClientRecord;
}

function initialsOf(name: string): string {
  const n = (name || '?').trim();
  const parts = n.split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : n.substring(0, 2).toUpperCase();
}

export default function KanbanPage() {
  const { user, isAdmin } = useAuth();
  const isMobile = useIsMobile(768);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
  const { clients, clientsMap, refetch: refetchClients } = useClients();
  const { sessions } = useSessions(500);
  const { events } = useCalendarEvents();
  const { columns, loading, addColumn, renameColumn, deleteColumn, refetch: refetchColumns } = useKanbanColumns();
  const { confirm, ConfirmDialog } = useConfirm();

  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [showAddCol, setShowAddCol] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const measuring = useMemo(() => ({
    droppable: { strategy: MeasuringStrategy.Always },
  }), []);

  const dropAnimation: DropAnimation = useMemo(() => ({
    duration: 200,
    easing: 'ease',
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: '0' } },
    }),
  }), []);

  // ── UTÁNKÖVETÉS oszlop kanonikus felismerése NÉV alapján is ──
  // Ha már létezik azonos nevű oszlop más id-vel (pl. régi 'uj'-ból átnevezve),
  // azt fogadjuk el — nem készítünk duplikátumot.
  const firstCol = useMemo(
    () => columns.find((c) => normalizeNameKey(c.name) === 'utankovetes'),
    [columns]
  );
  const firstColId = firstCol?.id ?? FIRST_COL_ID;

  // ── UTÁNKÖVETÉS oszlop biztosítása (fix, első, order 0) ──
  useEffect(() => {
    if (loading) return;
    if (!firstCol) {
      addColumn(FIRST_COL_ID, FIRST_COL_NAME, 0);
    }
  }, [loading, firstCol, addColumn]);

  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [columns]
  );

  // ── Utolsó interakció ügyfelenként (kártya lábléc + kontakt-csatorna) ──
  const lastInteractionByClient = useMemo(() => {
    const m: Record<string, { date: string; channel: string }> = {};
    sessions.forEach((s) => {
      s.interactions?.forEach((r) => {
        if (!r.client_id || !r.created_at) return;
        const k = String(r.client_id);
        const prev = m[k];
        if (!prev || r.created_at > prev.date) {
          m[k] = { date: r.created_at, channel: (r.type || s.channel || '').toLowerCase() };
        }
      });
    });
    return m;
  }, [sessions]);

  // ── Build card data grouped by column ──
  const cardsByColumn = useMemo<Record<string, KanbanCardData[]>>(() => {
    const map: Record<string, KanbanCardData[]> = {};
    sortedColumns.forEach((col) => { map[col.id] = []; });

    clients.forEach((c) => {
      // Member filtering: non-admins only see their assigned clients or unassigned ones
      if (!isAdmin) {
        const username = user?.username || '';
        const fullName = user?.fullName || '';
        const cd0 = parseCustomData(c.custom_data);
        const assignedTo = ((cd0.assigned_to || cd0.felelos || '') as string).trim();
        if (assignedTo && !isAssignedToMe(c, username, fullName)) return;
      }

      const cd = parseCustomData(c.custom_data);
      // Kanbanról eltávolítva jelző — nem jelenik meg újra automatikusan
      if (cd.kanban_removed) return;

      const tags: string[] = (cd?.tags as string[]) || [];
      const hasSalesTag = tags.some((t) => SALES_TAGS.includes(t));
      const status = c.status || '';
      const statusIsCol = sortedColumns.some((col) => col.id === status);
      // BELÉPÉSI SZABÁLY: értékesítési címke VAGY kanban oszlopra mutató státusz
      if (!hasSalesTag && !statusIsCol) return;

      const colId = statusIsCol ? status : firstColId;
      if (!map[colId]) return; // oszlop még nem töltődött be

      const name = bestClientName(c) || c.name || 'Névtelen';
      const isSurgos = cd?.prioritas === 'Sürgős' || cd?.priority === 'Sürgős' || cd?.prioritas === 'Kiemelt';

      // Kontakt: azon a csatornán, amin utoljára volt kapcsolat
      // (utolsó interakció email → email; egyéb → telefon), fallback sorrenddel
      const email = (cd?.email as string) || c.email || '';
      const phone = (cd?.telefonszam as string) || (cd?.phone as string) || (cd?.telefon as string) || c.phone || '';
      const lastCh = lastInteractionByClient[String(c.id)]?.channel || '';
      const contact = lastCh === 'email' ? (email || phone) : (phone || email);

      map[colId].push({
        id: c.id,
        name,
        tags,
        contact,
        assignee: ((cd?.assigned_to || cd?.felelos || '') as string).trim(),
        lastInteraction: lastInteractionByClient[String(c.id)]?.date || '',
        isSurgos: !!isSurgos,
        status,
        created_at: c.created_at || '',
        raw: c,
      });
    });

    // Sort: urgent first, then by created_at desc
    Object.values(map).forEach((cards) => {
      cards.sort((a, b) => {
        if (a.isSurgos && !b.isSurgos) return -1;
        if (!a.isSurgos && b.isSurgos) return 1;
        return (b.created_at || '').localeCompare(a.created_at || '');
      });
    });

    return map;
  }, [clients, sortedColumns, lastInteractionByClient, firstColId, user, isAdmin]);

  const activeCard = useMemo(() => {
    if (!activeCardId) return null;
    for (const cards of Object.values(cardsByColumn)) {
      const found = cards.find((c) => String(c.id) === activeCardId);
      if (found) return found;
    }
    return null;
  }, [activeCardId, cardsByColumn]);

  // ── DnD handlers ──
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveCardId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveCardId(null);
    const { active, over } = event;
    if (!over) return;

    const cardId = String(active.id);
    let targetColumnId = String(over.id);

    // If dropped on a card, find its column
    for (const [colId, cards] of Object.entries(cardsByColumn)) {
      if (cards.some((c) => String(c.id) === targetColumnId)) {
        targetColumnId = colId;
        break;
      }
    }

    // Verify it's a valid column
    if (!sortedColumns.some((col) => col.id === targetColumnId)) return;

    // Find current column
    let sourceColumnId = '';
    for (const [colId, cards] of Object.entries(cardsByColumn)) {
      if (cards.some((c) => String(c.id) === cardId)) {
        sourceColumnId = colId;
        break;
      }
    }

    if (sourceColumnId === targetColumnId) return;

    try {
      const res = await authFetch(`/admin/api/clients/${cardId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetColumnId }),
      });
      if (res.ok) {
        showToast('Ügyfél áthelyezve');
        refetchClients();
      } else {
        showToast('Hiba a mozgatás során!', 'error');
        refetchClients();
      }
    } catch {
      showToast('Hiba a mozgatás során!', 'error');
      refetchClients();
    }
  }, [cardsByColumn, sortedColumns, refetchClients]);

  // ── Címke törlése kártyáról (custom_data.tags) ──
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

  // ── Eltávolítás a kanbanról (ügyfél a rendszerben MARAD) ──
  const handleRemoveFromKanban = useCallback(async (clientId: string | number) => {
    const ok = await confirm(
      'Eltávolítod az ügyfelet az érdeklődőkezelésből? Az ügyfél a rendszerben marad, csak itt nem jelenik meg többé.',
      { title: 'Eltávolítás a kanbanról', danger: true }
    );
    if (!ok) return;
    const c = clients.find((cl) => String(cl.id) === String(clientId));
    if (!c) return;
    const cd = parseCustomData(c.custom_data);
    try {
      const res = await authFetch(`/admin/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_data: { ...cd, kanban_removed: true } }),
      });
      if (res.ok) { showToast('Eltávolítva a kanbanról'); refetchClients(); }
      else showToast('Hiba az eltávolításkor', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [clients, confirm, refetchClients]);

  // ── Column operations ──
  const handleAddColumn = useCallback(async () => {
    const name = newColName.trim();
    if (!name) { setShowAddCol(false); return; }
    const idStr = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '');
    if (!idStr) { showToast('Érvénytelen név', 'error'); return; }

    const ok = await addColumn(idStr, name);
    if (ok) {
      showToast('Oszlop hozzáadva');
    } else {
      showToast('Hiba: Már létezik ilyen oszlop', 'error');
    }
    setNewColName('');
    setShowAddCol(false);
  }, [newColName, addColumn]);

  const handleRenameColumn = useCallback(async (id: string, newName: string) => {
    const ok = await renameColumn(id, newName);
    if (!ok) showToast('Hiba az átnevezésnél', 'error');
  }, [renameColumn]);

  const handleDeleteColumn = useCallback(async (id: string) => {
    if (id === FIRST_COL_ID) return; // védett oszlop
    const ok = await confirm('Biztosan törlöd ezt az oszlopot? Csak akkor lehetséges, ha üres!', { title: 'Oszlop törlése', danger: true });
    if (!ok) return;
    const success = await deleteColumn(id);
    if (!success) showToast('Hiba a törlésnél. Biztosan üres az oszlop?', 'error');
    else showToast('Oszlop törölve');
  }, [confirm, deleteColumn]);

  const handleCardClick = useCallback((card: KanbanCardData) => {
    setSelectedClientId(String(card.id));
  }, []);

  if (loading) {
    return (
      <div className="analytics-shell">
        <div className="page-header">
          <div>
            <div className="page-title">Érdeklődőkezelés</div>
          </div>
        </div>
        <KanbanSkeleton />
      </div>
    );
  }

  // ── Client Detail overlay ──
  if (selectedClientId) {
    const enrichedClient = (() => {
      const c = clients.find((cl) => String(cl.id) === selectedClientId);
      if (!c) return null;
      const cd = parseCustomData(c.custom_data);
      return {
        id: c.id,
        name: bestClientName(c) || c.name || 'Névtelen',
        email: (cd?.email as string) || c.email || '',
        phone: (cd?.telefonszam as string) || (cd?.phone as string) || c.phone || '',
        status: c.status || '',
        created_at: c.created_at || '',
        tags: (cd?.tags as string[]) || [],
        assignee: (cd?.assigned_to as string) || '',
        lastInteraction: '',
        appointmentCount: 0,
        isNew: true,
        isInactive: false,
        raw: c,
      };
    })();
    if (enrichedClient) {
      return (
        <ClientDetailView
          client={enrichedClient}
          clientsMap={clientsMap}
          sessions={sessions}
          events={events}
          source="clients"
          onBack={() => setSelectedClientId(null)}
          onRefresh={refetchClients}
        />
      );
    }
  }

  return (
    <div className="analytics-shell">
      <ConfirmDialog />

      {/* Header — breadcrumbs + cím */}
      <header className="int-page-head">
        <nav className="int-breadcrumbs" aria-label="Navigációs morzsák">
          <span className="int-crumb-link">Ügyfélközpont</span>
          <span className="int-crumb-sep">/</span>
          <span className="int-crumb-current">Érdeklődőkezelés</span>
        </nav>
        <h1 className="page-title int-page-title">Érdeklődőkezelés</h1>
      </header>

      {/* Kanban Board */}
      {isMobile ? (
        /* ═══ MOBILE: Accordion view ═══ */
        <div className="kanban-mobile-accordion">
          {sortedColumns.map((col) => {
            const cards = cardsByColumn[col.id] || [];
            const isOpen = openAccordion === col.id;
            if (openAccordion === null && cards.length > 0) {
              setTimeout(() => setOpenAccordion(col.id), 0);
            }
            return (
              <div key={col.id} className="kanban-accordion-section">
                <div
                  className="kanban-accordion-header"
                  onClick={() => setOpenAccordion(isOpen ? null : col.id)}
                >
                  <div className="kanban-accordion-header-left">
                    <span className="kanban-accordion-title">{col.name}</span>
                    <span className="kanban-accordion-count">{cards.length}</span>
                  </div>
                  <svg className={`kanban-accordion-chevron${isOpen ? ' open' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
                {isOpen && (
                  <div className="kanban-accordion-body">
                    {cards.length === 0 ? (
                      <div className="kanban-accordion-empty">Üres oszlop</div>
                    ) : (
                      cards.map((card) => (
                        <KanbanCard
                          key={String(card.id)}
                          card={card}
                          onClick={() => handleCardClick(card)}
                          onRemove={() => handleRemoveFromKanban(String(card.id))}
                          onRemoveTag={handleRemoveTag}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ═══ DESKTOP: DnD board ═══ */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          measuring={measuring}
        >
          <div className="kanban-board">
            {sortedColumns.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                cards={cardsByColumn[col.id] || []}
                protectedColumn={col.id === firstColId}
                onRename={handleRenameColumn}
                onDelete={handleDeleteColumn}
                onRemoveClient={handleRemoveFromKanban}
                onCardClick={handleCardClick}
                onRemoveTag={handleRemoveTag}
              />
            ))}

            {/* Oszlop hozzáadása — muted, szaggatott oszlop a sor végén */}
            <div className="kanban-add-col">
              {showAddCol ? (
                <div className="kanban-add-col-form" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    className="cd-form-input"
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') { setShowAddCol(false); setNewColName(''); } }}
                    placeholder="Oszlop neve"
                    autoFocus
                  />
                  <div className="kanban-add-col-actions">
                    <button className="cd-btn" onClick={() => { setShowAddCol(false); setNewColName(''); }}>Mégse</button>
                    <button className="cd-btn cd-btn-primary" onClick={handleAddColumn}>Hozzáadás</button>
                  </div>
                </div>
              ) : (
                <button className="kanban-add-col-trigger" onClick={() => setShowAddCol(true)}>
                  <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="15" height="15"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Oszlop hozzáadása
                </button>
              )}
            </div>
          </div>

          {/* Drag Overlay */}
          <DragOverlay dropAnimation={dropAnimation}>
            {activeCard && <KanbanCard card={activeCard} isDragOverlay />}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
