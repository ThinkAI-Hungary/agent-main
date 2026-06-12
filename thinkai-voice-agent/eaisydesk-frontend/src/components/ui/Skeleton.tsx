/**
 * Skeleton — shimmer loading placeholders
 * Usage: <Skeleton width={200} height={20} /> or <Skeleton variant="card" />
 */

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  variant?: 'text' | 'card' | 'kpi' | 'circle';
  count?: number;
}

export default function Skeleton({ width, height, borderRadius, variant = 'text', count = 1 }: SkeletonProps) {
  const variants: Record<string, React.CSSProperties> = {
    text: { width: width || '100%', height: height || 14, borderRadius: borderRadius || 6 },
    card: { width: width || '100%', height: height || 120, borderRadius: borderRadius || 14 },
    kpi: { width: width || '100%', height: height || 110, borderRadius: borderRadius || 14 },
    circle: { width: width || 40, height: height || 40, borderRadius: '50%' },
  };

  const style = variants[variant];

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton-shimmer"
          style={{
            ...style,
            marginBottom: count > 1 ? 8 : 0,
          }}
        />
      ))}
    </>
  );
}

/** Skeleton row for KPI grid */
export function KpiSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer" style={{ height: 110, borderRadius: 6 }} />
      ))}
    </div>
  );
}
