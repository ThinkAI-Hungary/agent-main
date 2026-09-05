/**
 * KanbanColumn – droppable column (UI Kit stílus)
 * protectedColumn: nem nevezhető át és nem törölhető (UTÁNKÖVETÉS belépési pont).
 */
import { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { KanbanColumn as KanbanColumnType } from '../../hooks/useKanbanColumns';
import type { KanbanCardData } from '../../pages/KanbanPage';
import KanbanCard from './KanbanCard';

interface Props {
  column: KanbanColumnType;
  cards: KanbanCardData[];
  protectedColumn?: boolean;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onRemoveClient: (clientId: string | number) => void;
  onCardClick?: (card: KanbanCardData) => void;
  onRemoveTag?: (clientId: string | number, tag: string) => void;
}

export default function KanbanColumn({ column, cards, protectedColumn, onRename, onDelete, onRemoveClient, onCardClick, onRemoveTag }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(column.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function handleSave() {
    const newName = editName.trim();
    if (newName && newName !== column.name) {
      onRename(column.id, newName);
    }
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      className={`kanban-col ${isOver ? 'drag-over' : ''}`}
      id={`col-${column.id}`}
    >
      {/* Header: név + count pill + (nem védettnél) ceruza / kuka */}
      <div className="kanban-col-header">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="cd-form-input kanban-col-rename-input"
          />
        ) : (
          <span
            className="kanban-col-name"
            onDoubleClick={() => { if (!protectedColumn) { setEditName(column.name); setEditing(true); } }}
            title={protectedColumn ? undefined : 'Kattints duplán az átnevezéshez'}
          >
            {column.name}
          </span>
        )}
        <span className="kanban-col-count">{cards.length}</span>
        {!protectedColumn && !editing && (
          <span className="kanban-col-actions">
            <button
              className="kanban-col-icon-btn"
              title="Átnevezés"
              aria-label="Átnevezés"
              onClick={() => { setEditName(column.name); setEditing(true); }}
            >
              <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
            </button>
            <button
              className="kanban-col-icon-btn kanban-col-icon-btn--danger"
              title="Törlés"
              aria-label="Törlés"
              onClick={() => onDelete(column.id)}
            >
              <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          </span>
        )}
      </div>

      {/* Cards */}
      <div className="kanban-cards">
        {cards.length === 0 && !isOver && (
          <div className="kanban-empty-state">
            <svg fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" />
            </svg>
            <span>Üres oszlop</span>
          </div>
        )}
        {cards.map((card) => (
          <KanbanCard
            key={String(card.id)}
            card={card}
            onRemove={onRemoveClient}
            onClick={onCardClick}
            onRemoveTag={onRemoveTag}
          />
        ))}
        {isOver && (
          <div className="kanban-drag-placeholder" />
        )}
      </div>
    </div>
  );
}
