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

/** Skeleton for table-based pages (Interactions, Clients) */
export function TableSkeleton({ columns = 6, rows = 8 }: { columns?: number; rows?: number }) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="skeleton-shimmer" style={{ height: 12, flex: i === 0 ? 0.5 : 1, borderRadius: 4 }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
          {Array.from({ length: columns }).map((_, c) => (
            <div key={c} className="skeleton-shimmer" style={{
              height: c === 0 ? 10 : 14,
              flex: c === 0 ? 0.5 : c === 1 ? 1.5 : 1,
              borderRadius: 6,
            }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton for calendar page */
export function CalendarSkeleton() {
  return (
    <div style={{ display: 'flex', gap: 20 }}>
      {/* Main calendar area */}
      <div style={{ flex: 1 }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 12 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer" style={{ height: 32, borderRadius: 6 }} />
          ))}
        </div>
        {/* Time grid */}
        <div className="skeleton-shimmer" style={{ height: 500, borderRadius: 14 }} />
      </div>
      {/* Side panel */}
      <div style={{ width: 220, flexShrink: 0 }}>
        <div className="skeleton-shimmer" style={{ height: 28, width: '70%', borderRadius: 6, marginBottom: 16 }} />
        <div className="skeleton-shimmer" style={{ height: 14, width: '50%', borderRadius: 4, marginBottom: 24 }} />
        <div className="skeleton-shimmer" style={{ height: 60, borderRadius: 10, marginBottom: 10 }} />
        <div className="skeleton-shimmer" style={{ height: 60, borderRadius: 10, marginBottom: 10 }} />
        <div className="skeleton-shimmer" style={{ height: 60, borderRadius: 10 }} />
      </div>
    </div>
  );
}

/** Skeleton for Kanban board */
export function KanbanSkeleton() {
  return (
    <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 12 }}>
      {Array.from({ length: 4 }).map((_, col) => (
        <div key={col} style={{
          width: 280, minWidth: 280, borderRadius: 14,
          border: '1px solid var(--border)', padding: 16,
          background: 'var(--card)',
        }}>
          {/* Column header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div className="skeleton-shimmer" style={{ width: 10, height: 10, borderRadius: '50%' }} />
            <div className="skeleton-shimmer" style={{ height: 14, flex: 1, borderRadius: 6 }} />
            <div className="skeleton-shimmer" style={{ width: 24, height: 18, borderRadius: 10 }} />
          </div>
          {/* Cards */}
          {Array.from({ length: col === 0 ? 4 : col === 1 ? 3 : 2 }).map((_, c) => (
            <div key={c} className="skeleton-shimmer" style={{
              height: 80, borderRadius: 10, marginBottom: 10,
            }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton for Outbound / Campaign list */
export function OutboundSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer" style={{ height: 80, borderRadius: 12 }} />
        ))}
      </div>
      {/* Campaign cards */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
          borderRadius: 12, border: '1px solid var(--border)',
        }}>
          <div className="skeleton-shimmer" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton-shimmer" style={{ height: 14, width: '40%', borderRadius: 6, marginBottom: 8 }} />
            <div className="skeleton-shimmer" style={{ height: 10, width: '60%', borderRadius: 4 }} />
          </div>
          <div className="skeleton-shimmer" style={{ width: 70, height: 26, borderRadius: 14 }} />
          <div className="skeleton-shimmer" style={{ width: 50, height: 14, borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

/** Skeleton for Settings pages */
export function SettingsSkeleton() {
  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer" style={{ height: 36, width: 140, borderRadius: 8 }} />
        ))}
      </div>
      {/* Section cards */}
      {Array.from({ length: 3 }).map((_, s) => (
        <div key={s} style={{
          borderRadius: 14, border: '1px solid var(--border)',
          padding: 24, marginBottom: 20,
        }}>
          <div className="skeleton-shimmer" style={{ height: 16, width: '30%', borderRadius: 6, marginBottom: 20 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="skeleton-shimmer" style={{ height: 10, width: '40%', borderRadius: 4, marginBottom: 8 }} />
                <div className="skeleton-shimmer" style={{ height: 38, borderRadius: 8 }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
