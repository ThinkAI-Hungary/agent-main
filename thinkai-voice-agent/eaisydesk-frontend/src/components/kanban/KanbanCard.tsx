/**
 * KanbanCard – draggable card for the kanban board
 */
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { KanbanCardData } from '../../pages/KanbanPage';
import { TagBadge } from '../ui/Badge';

interface Props {
  card: KanbanCardData;
  isDragOverlay?: boolean;
  onDelete?: (clientId: string | number) => void;
}

export default function KanbanCard({ card, isDragOverlay, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(card.id),
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragOverlay ? 'grabbing' : 'grab',
    ...(card.isSurgos ? {
      border: '2px solid #ef4444',
      backgroundColor: 'var(--bg-surgos, #fef2f2)',
    } : {}),
    ...(isDragOverlay ? {
      boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
      transform: 'scale(1.03)',
    } : {}),
  };

  return (
    <div
      ref={!isDragOverlay ? setNodeRef : undefined}
      className="kanban-card"
      style={style}
      {...(!isDragOverlay ? { ...attributes, ...listeners } : {})}
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
