/**
 * KanbanPage – 1:1 migration of legacy kanban board with @dnd-kit instead of HTML5 DnD
 * Features: drag-drop cards between columns, add/rename/delete columns, priority sorting,
 * tags, clinic display, double-click to client detail.
 */
import { useState, useMemo, useCallback } from 'react';
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
import { useAuth } from '../context/AuthContext';

import { useConfirm } from '../components/ui/ConfirmDialog';
import { showToast } from '../components/ui/Toast';
import { authFetch } from '../api/client';
import { KanbanSkeleton } from '../components/ui/Skeleton';
import KanbanColumn from '../components/kanban/KanbanColumn';
import KanbanCard from '../components/kanban/KanbanCard';
import ClientDetailView from '../components/clients/ClientDetailView';

// ── Enriched kanban card data ──
export interface KanbanCardData {
  id: string | number;
  name: string;
  tags: string[];
  clinicName: string;
  extraFields: string[];
  isSurgos: boolean;
  status: string;
  created_at: string;
  raw: ClientRecord;
}

export default function KanbanPage() {
  const { user, isAdmin } = useAuth();
  const isMobile = useIsMobile(768);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
  const { clients, clientsMap, refetch: refetchClients } = useClients();
  const { sessions } = useSessions(500);
  const { events } = useCalendarEvents();
  const { columns, loading, addColumn, renameColumn, deleteColumn, refetch: _refetchColumns } = useKanbanColumns();
  const { confirm, ConfirmDialog } = useConfirm();

  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
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

  // ── Build card data grouped by column ──
  const cardsByColumn = useMemo<Record<string, KanbanCardData[]>>(() => {
    const map: Record<string, KanbanCardData[]> = {};
    columns.forEach((col) => { map[col.id] = []; });

    clients.forEach((c) => {
      // Member filtering: non-admins only see their assigned clients or unassigned ones
      if (!isAdmin) {
        const username = user?.username || '';
        const fullName = user?.fullName || '';
        const cd = parseCustomData(c.custom_data);
        const assignedTo = ((cd.assigned_to || cd.felelos || '') as string).trim();
        if (assignedTo && !isAssignedToMe(c, username, fullName)) return;
      }

      const status = c.status || 'uj';
      if (!map[status]) map[status] = [];

      const cd = parseCustomData(c.custom_data);
      const name = bestClientName(c) || c.name || 'Névtelen';
      const tags: string[] = (cd?.tags as string[]) || [];
      const isSurgos = cd?.prioritas === 'Sürgős' || cd?.priority === 'Sürgős' || cd?.prioritas === 'Kiemelt';

      // Extra fields from custom_data (fields 2-3)
      const extraFields: string[] = [];
      ['email', 'telefonszam', 'phone', 'telefon'].forEach((key) => {
        const val = cd?.[key] as string;
        if (val && extraFields.length < 2) extraFields.push(val);
      });

      let clinicName = '';
      if (cd?.clinic_id) {
        clinicName = `📍 Telephely ID: ${cd.clinic_id}`;
      }

      map[status].push({
        id: c.id,
        name,
        tags,
        clinicName,
        extraFields,
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
  }, [clients, columns]);

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
    if (!columns.some((col) => col.id === targetColumnId)) return;

    // Find current column
    let sourceColumnId = '';
    for (const [colId, cards] of Object.entries(cardsByColumn)) {
      if (cards.some((c) => String(c.id) === cardId)) {
        sourceColumnId = colId;
        break;
      }
    }

    if (sourceColumnId === targetColumnId) return;

    // Optimistic update
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
  }, [cardsByColumn, columns, refetchClients]);

  // ── Column operations ──
  const handleAddColumn = useCallback(async () => {
    const name = newColName.trim();
    if (!name) { setShowAddModal(false); return; }
    const idStr = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '');
    if (!idStr) { showToast('Érvénytelen név', 'error'); return; }

    const ok = await addColumn(idStr, name);
    if (ok) {
      showToast('Oszlop hozzáadva');
    } else {
      showToast('Hiba: Már létezik ilyen oszlop', 'error');
    }
    setNewColName('');
    setShowAddModal(false);
  }, [newColName, addColumn]);

  const handleRenameColumn = useCallback(async (id: string, newName: string) => {
    const ok = await renameColumn(id, newName);
    if (!ok) showToast('Hiba az átnevezésnél', 'error');
  }, [renameColumn]);

  const handleDeleteColumn = useCallback(async (id: string) => {
    const ok = await confirm('Biztosan törlöd ezt az oszlopot? Csak akkor lehetséges, ha üres!', { title: 'Oszlop törlése', danger: true });
    if (!ok) return;
    const success = await deleteColumn(id);
    if (!success) showToast('Hiba a törlésnél. Biztosan üres az oszlop?', 'error');
    else showToast('Oszlop törölve');
  }, [confirm, deleteColumn]);

  const handleDeleteClient = useCallback(async (clientId: string | number) => {
    const ok = await confirm('Biztosan törölni szeretnéd ezt az ügyfelet?', { title: 'Ügyfél törlése', danger: true });
    if (!ok) return;
    try {
      const res = await authFetch(`/admin/api/clients/${clientId}`, { method: 'DELETE' });
      if (res.ok) { showToast('Ügyfél törölve'); refetchClients(); }
      else showToast('Hiba a törlés során', 'error');
    } catch { showToast('Hiba a törlés során', 'error'); }
  }, [confirm, refetchClients]);

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

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Érdeklődőkezelés</div>

        </div>
      </div>

      {/* Add column button — right-aligned above board */}
      <div className="kanban-toolbar">
        <div className="kanban-add-col-wrap">
          <button
            onClick={() => setShowAddModal(true)}
            className="kanban-add-col-btn"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="15" height="15">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Oszlop hozzáadása
          </button>

          {/* Add Column Popover */}
          {showAddModal && (
            <>
              <div className="kanban-popover-backdrop" onClick={() => setShowAddModal(false)} />
              <div className="kanban-add-popover" onClick={(e) => e.stopPropagation()}>
                <div className="kanban-add-popover-title">Új oszlop hozzáadása</div>
                <input
                  type="text"
                  className="input"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') setShowAddModal(false); }}
                  placeholder="Pl. Ajánlatkérés, Tárgyalás..."
                  autoFocus
                />
                <div className="kanban-add-popover-actions">
                  <button
                    className="kanban-add-col-btn"
                    onClick={() => { setShowAddModal(false); setNewColName(''); }}
                  >
                    Mégse
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleAddColumn}
                  >
                    Hozzáadás
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Kanban Board */}
      {isMobile ? (
        /* ═══ MOBILE: Accordion view ═══ */
        <div className="kanban-mobile-accordion">
          {columns.map((col) => {
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
                          onDelete={() => handleDeleteClient(String(card.id))}
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
            {columns.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                cards={cardsByColumn[col.id] || []}
                onRename={handleRenameColumn}
                onDelete={handleDeleteColumn}
                onDeleteClient={handleDeleteClient}
                onCardClick={handleCardClick}
              />
            ))}
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
