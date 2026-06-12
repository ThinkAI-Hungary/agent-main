/**
 * KanbanColumn – droppable column for the kanban board
 */
import { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { KanbanColumn as KanbanColumnType } from '../../hooks/useKanbanColumns';
import type { KanbanCardData } from '../../pages/KanbanPage';
import KanbanCard from './KanbanCard';

interface Props {
  column: KanbanColumnType;
  cards: KanbanCardData[];
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDeleteClient: (clientId: string | number) => void;
  onCardClick?: (card: KanbanCardData) => void;
}

export default function KanbanColumn({ column, cards, onRename, onDelete, onDeleteClient, onCardClick }: Props) {
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
      {/* Header */}
      <div className="kanban-col-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
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
              style={{
                background: 'var(--card)',
                border: '1px solid #10b981',
                outline: 'none',
                borderRadius: 6,
                padding: '2px 6px',
                fontSize: 13,
                fontWeight: 600,
                color: '#0a1f2e',
                width: '100%',
                boxSizing: 'border-box',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            />
          ) : (
            <span
              style={{ cursor: 'pointer' }}
              onDoubleClick={() => { setEditName(column.name); setEditing(true); }}
              title="Kattints duplán az átnevezéshez"
            >
              {column.name}
            </span>
          )}
          <span className="kanban-col-count">{cards.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => { setEditName(column.name); setEditing(true); }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', opacity: 0.6 }}
            title="Átnevezés"
          >
            <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="13">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(column.id)}
            style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', opacity: 0.6 }}
            title="Törlés"
          >
            <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="13">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        </div>
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
          <KanbanCard key={String(card.id)} card={card} onDelete={onDeleteClient} onClick={onCardClick} />
        ))}
        {isOver && (
          <div className="kanban-drag-placeholder" />
        )}
      </div>
    </div>
  );
}
