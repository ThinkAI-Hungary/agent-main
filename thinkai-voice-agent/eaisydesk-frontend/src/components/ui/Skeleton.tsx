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
    <div className="skel-kpi-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer skel-kpi-item" />
      ))}
    </div>
  );
}

/** Skeleton for table-based pages (Interactions, Clients) */
export function TableSkeleton({ columns = 6, rows = 8 }: { columns?: number; rows?: number }) {
  return (
    <div className="skel-table-wrap">
      {/* Header */}
      <div className="flex-row gap-12 skel-table-header">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className={`skeleton-shimmer ${i === 0 ? 'skel-th-first' : 'skel-th-rest'}`} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="skel-table-row">
          {Array.from({ length: columns }).map((_, c) => (
            <div key={c} className={`skeleton-shimmer ${c === 0 ? 'skel-td-narrow' : c === 1 ? 'skel-td-wide' : 'skel-td-std'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton for calendar page */
export function CalendarSkeleton() {
  return (
    <div className="flex-row gap-20">
      {/* Main calendar area */}
      <div className="flex-1">
        {/* Day headers */}
        <div className="skel-cal-days">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer skel-cal-day-item" />
          ))}
        </div>
        {/* Time grid */}
        <div className="skeleton-shimmer skel-cal-time" />
      </div>
      {/* Side panel */}
      <div className="skel-cal-side">
        <div className="skeleton-shimmer skel-cal-title" />
        <div className="skeleton-shimmer skel-cal-sub" />
        <div className="skeleton-shimmer skel-cal-event" />
        <div className="skeleton-shimmer skel-cal-event" />
        <div className="skeleton-shimmer skel-cal-event-last" />
      </div>
    </div>
  );
}

/** Skeleton for Kanban board */
export function KanbanSkeleton() {
  return (
    <div className="flex-row gap-16 skel-kanban">
      {Array.from({ length: 4 }).map((_, col) => (
        <div key={col} className="skel-kanban-col">
          {/* Column header */}
          <div className="flex-row gap-10 mb-20">
            <div className="skeleton-shimmer skel-kanban-dot" />
            <div className="skeleton-shimmer skel-kanban-title" />
            <div className="skeleton-shimmer skel-kanban-count" />
          </div>
          {/* Cards */}
          {Array.from({ length: col === 0 ? 4 : col === 1 ? 3 : 2 }).map((_, c) => (
            <div key={c} className="skeleton-shimmer skel-kanban-card" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton for Outbound / Campaign list */
export function OutboundSkeleton() {
  return (
      <div className="flex-col gap-12">
      {/* Stats row */}
      <div className="skel-outbound-stats">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer skel-out-stat" />
        ))}
      </div>
      {/* Campaign cards */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skel-outbound-card">
          <div className="skeleton-shimmer skel-out-avatar" />
          <div className="flex-1">
            <div className="skeleton-shimmer skel-out-name" />
            <div className="skeleton-shimmer skel-out-sub" />
          </div>
          <div className="skeleton-shimmer skel-out-badge" />
          <div className="skeleton-shimmer skel-out-date" />
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
      <div className="flex-row gap-8 skel-settings-tabs">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer skel-set-tab" />
        ))}
      </div>
      {/* Section cards */}
      {Array.from({ length: 3 }).map((_, s) => (
        <div key={s} className="skel-settings-card">
          <div className="skeleton-shimmer skel-set-section-title" />
          <div className="skel-settings-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="skeleton-shimmer skel-set-field-label" />
                <div className="skeleton-shimmer skel-set-input" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
