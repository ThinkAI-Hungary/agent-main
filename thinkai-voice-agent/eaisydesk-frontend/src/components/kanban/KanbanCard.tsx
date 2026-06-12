/**
 * KanbanCard – draggable card for the kanban board
 * Click anywhere opens client detail. Drag anywhere works too.
 * Distinction: if pointer moves <5px → click, if ≥5px → drag.
 */
import { useDraggable } from '@dnd-kit/core';
import { useRef, useCallback } from 'react';
import type { KanbanCardData } from '../../pages/KanbanPage';
import { TagBadge } from '../ui/Badge';

interface Props {
  card: KanbanCardData;
  isDragOverlay?: boolean;
  onDelete?: (clientId: string | number) => void;
  onClick?: (card: KanbanCardData) => void;
}

export default function KanbanCard({ card, isDragOverlay, onDelete, onClick }: Props) {
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
        ...(card.isSurgos ? {
          border: '2px solid #ef4444',
          backgroundColor: 'var(--bg-surgos, #fef2f2)',
        } : {}),
      }
    : {
        // Don't apply transform when dragging — DragOverlay handles the visual
        opacity: isDragging ? 0 : 1,
        cursor: 'pointer',
        pointerEvents: isDragging ? 'none' : undefined,
        ...(card.isSurgos ? {
          border: '2px solid #ef4444',
          backgroundColor: 'var(--bg-surgos, #fef2f2)',
        } : {}),
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

  return (
    <div
      ref={!isDragOverlay ? setNodeRef : undefined}
      className="kanban-card"
      style={style}
      {...mergedProps}
    >
      {/* Urgent badge */}
      {card.isSurgos && (
        <div style={{
          display: 'inline-block',
          background: '#ef4444',
          color: 'white',
          fontSize: 10,
          fontWeight: 'bold',
          padding: '2px 6px',
          borderRadius: 4,
          marginBottom: 6,
          boxShadow: '0 1px 2px rgba(239,68,68,0.4)',
        }}>
          🚨 SÜRGŐS
        </div>
      )}

      {/* Client name */}
      <div className="client-name">{card.name}</div>

      {/* Tags */}
      {card.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, margin: '4px 0' }}>
          {card.tags.map((t) => <TagBadge key={t} tag={t} small />)}
        </div>
      )}

      {/* Clinic */}
      {card.clinicName && (
        <div className="client-info" style={{ color: '#1ceee0', fontWeight: 600 }}>
          {card.clinicName}
        </div>
      )}

      {/* Extra fields */}
      {card.extraFields.map((f, i) => (
        <div key={i} className="client-info">{f}</div>
      ))}

      {/* Delete button */}
      {onDelete && (
        <div style={{ textAlign: 'right' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}
          >
            Törlés
          </button>
        </div>
      )}
    </div>
  );
}
