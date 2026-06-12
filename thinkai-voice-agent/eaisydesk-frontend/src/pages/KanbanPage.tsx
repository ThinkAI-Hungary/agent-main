/**
 * KanbanPage – 1:1 migration of legacy kanban board with @dnd-kit instead of HTML5 DnD
 * Features: drag-drop cards between columns, add/rename/delete columns, priority sorting,
 * tags, clinic display, double-click to client detail.
 */
import { useState, useMemo, useCallback } from 'react';
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
import { supabase } from '../lib/supabase';
import Spinner from '../components/ui/Spinner';
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
      // Member filtering: non-admins only see their assigned clients
      if (!isAdmin) {
        const username = user?.username || '';
        const fullName = user?.fullName || '';
        if (!isAssignedToMe(c, username, fullName)) return;
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
      const { error } = await supabase
        .from('clients')
        .update({ status: targetColumnId })
        .eq('id', cardId);
      if (!error) {
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
      const { error } = await supabase.from('clients').delete().eq('id', clientId);
      if (!error) { showToast('Ügyfél törölve'); refetchClients(); }
      else showToast('Hiba a törlés során', 'error');
    } catch { showToast('Hiba a törlés során', 'error'); }
  }, [confirm, refetchClients]);

  const handleCardClick = useCallback((card: KanbanCardData) => {
    setSelectedClientId(String(card.id));
  }, []);

  if (loading) {
    return (
      <div className="analytics-shell" style={{ textAlign: 'center', padding: 40 }}>
        <Spinner />
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
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <div className="page-title">Érdeklődőkezelés</div>
          <div className="page-subtitle">Konverziós tölcsér és érdeklődők nyomon követése</div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--text)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.2s',
          }}
        >
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="15" height="15">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Oszlop hozzáadása
        </button>
      </div>

      {/* Kanban Board */}
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

      {/* Add Column Modal */}
      {showAddModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            style={{ background: 'var(--card, #fff)', borderRadius: 8, padding: 28, width: 380, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: 6, background: 'rgba(28,238,224,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Új oszlop hozzáadása</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Adj nevet az új kanban oszlopnak</div>
              </div>
            </div>
            <input
              type="text"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') setShowAddModal(false); }}
              placeholder="Pl. Ajánlatkérés, Tárgyalás..."
              autoFocus
              style={{ width: '100%', padding: '12px 16px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, color: 'var(--text)', background: 'var(--bg, #f9fafb)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button
                onClick={() => { setShowAddModal(false); setNewColName(''); }}
                style={{ padding: '10px 20px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Mégse
              </button>
              <button
                onClick={handleAddColumn}
                style={{ padding: '10px 20px', border: 'none', background: 'linear-gradient(135deg,#1ceee0,#0bbdb1)', color: '#082432', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'none' }}
              >
                Hozzáadás
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
