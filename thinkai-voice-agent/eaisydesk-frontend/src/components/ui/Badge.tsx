import React from 'react';
import {
  EREDMENY_COLORS,
  STATUSZ_COLORS,
  DIRECTION_COLORS,
  getTagColor,
} from '../../helpers/interactionClassifiers';

interface BadgeProps {
  value: string;
  colorMap?: Record<string, { bg: string; color: string }>;
  style?: React.CSSProperties;
}

/** Generic pill badge */
export function Badge({ value, colorMap, style }: BadgeProps) {
  if (!value) return <span>—</span>;
  const c = colorMap?.[value] || { bg: '#f3f4f6', color: '#374151' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: '9999px',
        fontSize: '11px',
        fontWeight: 600,
        background: c.bg,
        color: c.color,
        ...style,
      }}
    >
      {value}
    </span>
  );
}

export function EredmenyBadge({ value }: { value: string }) {
  return <Badge value={value} colorMap={EREDMENY_COLORS} />;
}

export function StatuszBadge({ value }: { value: string }) {
  return (
    <Badge
      value={value}
      colorMap={STATUSZ_COLORS}
      style={{ borderRadius: '6px', fontWeight: 700, letterSpacing: '0.5px' }}
    />
  );
}

export function DirectionBadge({ value }: { value: string }) {
  return <Badge value={value} colorMap={DIRECTION_COLORS} />;
}

export function TagBadge({ tag, small }: { tag: string; small?: boolean }) {
  const c = getTagColor(tag);
  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        fontSize: '11px',
        padding: '3px 8px',
        borderRadius: '12px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {tag}
    </span>
  );
}
