/**
 * KanbanCard – draggable card for the kanban board (UI Kit / mockup stílus)
 * Click anywhere opens client detail. Drag anywhere works too.
 * Distinction: if pointer moves <5px → click, if ≥5px → drag.
 * A címke-chipek × gombja eltávolítja a címkét az ügyfélről;
 * a 🗑 gomb CSAK a kanbanról távolítja el (az ügyfél a rendszerben marad).
 */
import { useDraggable } from '@dnd-kit/core';
import { useRef, useCallback } from 'react';
import type { KanbanCardData } from '../../pages/KanbanPage';
import { getTagColor } from '../../helpers/interactionClassifiers';
import { relDateHu } from '../../helpers/formatters';

interface Props {
  card: KanbanCardData;
  isDragOverlay?: boolean;
  onRemove?: (clientId: string | number) => void;
  onClick?: (card: KanbanCardData) => void;
  onRemoveTag?: (clientId: string | number, tag: string) => void;
}

function initialsOf(name: string): string {
  const n = (name || '?').trim();
  const parts = n.split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : n.substring(0, 2).toUpperCase();
}

export default function KanbanCard({ card, isDragOverlay, onRemove, onClick, onRemoveTag }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(card.id),
  });

  // Track pointer start position to distinguish click vs drag
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const wasDragged = useRef(false);

  // Merge our pointerDown tracking with dnd-kit's pointerDown handler
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    wasDragged.current = false;
    // Call dnd-kit's original onPointerDown handler
    if (listeners?.onPointerDown) {
      (listeners.onPointerDown as (e: React.PointerEvent) => void)(e);
    }
  }, [listeners]);

  // On pointer move – track if we've exceeded the drag threshold
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerStart.current) return;
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    if (dx >= 5 || dy >= 5) {
      wasDragged.current = true;
    }
  }, []);

  // On pointer up – if we didn't drag, treat as click
  const handlePointerUp = useCallback(() => {
    if (!wasDragged.current && pointerStart.current && onClick) {
      onClick(card);
    }
    pointerStart.current = null;
    wasDragged.current = false;
  }, [onClick, card]);

  const style: React.CSSProperties = isDragOverlay
    ? {
        cursor: 'grabbing',
        boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
        opacity: 1,
        ...(card.isSurgos ? { borderColor: 'var(--error, #ff4d4f)' } : {}),
      }
    : {
        // Don't apply transform when dragging — DragOverlay handles the visual
        opacity: isDragging ? 0 : 1,
        cursor: 'pointer',
        pointerEvents: isDragging ? 'none' : undefined,
        ...(card.isSurgos ? { borderColor: 'var(--error, #ff4d4f)' } : {}),
      };

  // Build merged props: use dnd-kit's attributes but override onPointerDown with our merged version
  const mergedProps = !isDragOverlay
    ? {
        ...attributes,
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
      }
    : {};

  const footerParts = [
    card.assignee,
    relDateHu(card.lastInteraction) || relDateHu(card.created_at),
  ].filter(Boolean);

  return (
    <div
      ref={!isDragOverlay ? setNodeRef : undefined}
      className={`kanban-card${card.isSurgos ? ' is-urgent' : ''}`}
      style={style}
      {...mergedProps}
    >
      {/* Fejléc: avatar + név + eltávolítás a kanbanról */}
      <div className="kanban-card-head">
        <span className="kanban-card-ava">{initialsOf(card.name)}</span>
        <div className="kanban-card-id">
          <b className="kanban-card-name">{card.name}</b>
          {card.contact && <span className="kanban-card-sub">{card.contact}</span>}
        </div>
        {onRemove && (
          <button
            className="kanban-card-remove"
            title="Eltávolítás a kanbanról (az ügyfél a rendszerben marad)"
            aria-label="Eltávolítás a kanbanról"
            onClick={(e) => { e.stopPropagation(); onRemove(card.id); }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
        )}
      </div>

      {/* Tags */}
      {card.tags.length > 0 && (
        <div className="kanban-card-tags">
          {card.tags.map((t) => {
            const c = getTagColor(t);
            return (
              <span key={t} className="kanban-card-tag" style={{ background: c.bg, color: c.color }}>
                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
                {t}
                {onRemoveTag && !isDragOverlay && (
                  <button
                    className="kanban-card-tag-x"
                    aria-label={`Címke törlése: ${t}`}
                    title="Címke törlése"
                    onClick={(e) => { e.stopPropagation(); onRemoveTag(card.id, t); }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Lábléc: felelős · utolsó interakció */}
      {footerParts.length > 0 && (
        <>
          <div className="kanban-card-divider" />
          <div className="kanban-card-footer">
            <span>{footerParts.join(' · ')}</span>
          </div>
        </>
      )}

      {/* Extra fields (második elérhetőség) */}
      {card.extraFields.map((f, i) => (
        <div key={i} className="kanban-card-extra">{f}</div>
      ))}
    </div>
  );
}
