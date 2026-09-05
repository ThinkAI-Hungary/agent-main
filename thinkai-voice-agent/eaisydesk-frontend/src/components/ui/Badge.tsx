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
  children?: React.ReactNode;
}

/** Generic pill badge — eaisyDesk UI Kit 06 stílus: tintelt háttér, 1px keret, 8px radius */
export function Badge({ value, colorMap, style, children }: BadgeProps) {
  if (!value) return <span>—</span>;
  const c = colorMap?.[value] || { bg: '#f3f4f6', color: '#374151' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: '8px',
        fontSize: '11.5px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        background: c.bg,
        color: c.color,
        border: `1px solid color-mix(in srgb, ${c.color} 28%, ${c.bg})`,
        ...style,
      }}
    >
      {children}
      {value}
    </span>
  );
}

export function EredmenyBadge({ value }: { value: string }) {
  if (!value) return <span>—</span>;
  const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {parts.map((p) => (
        <Badge key={p} value={p} colorMap={EREDMENY_COLORS} />
      ))}
    </div>
  );
}

/** Státusz badge — kit 06: színes pötty a szöveg előtt */
export function StatuszBadge({ value }: { value: string }) {
  const c = STATUSZ_COLORS[value];
  return (
    <Badge
      value={value}
      colorMap={STATUSZ_COLORS}
    >
      {c && <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, flex: 'none' }} />}
    </Badge>
  );
}

export function DirectionBadge({ value }: { value: string }) {
  return <Badge value={value} colorMap={DIRECTION_COLORS} />;
}

export function TagBadge({ tag, small }: { tag: string; small?: boolean }) {
  const c = getTagColor(tag);
  return (
    <span
      className="tag-badge"
      style={{
        background: c.bg,
        color: c.color,
      }}
    >
      {tag}
    </span>
  );
}
