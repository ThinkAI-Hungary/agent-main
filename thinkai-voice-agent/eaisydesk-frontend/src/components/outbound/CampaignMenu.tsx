/**
 * CampaignMenu – státuszfüggő kebab menü (fehér, UI Kit popover)
 * Státusz szerinti műveletek: indítás / ütemezés / szüneteltetés / leállítás / törlés.
 */
import React, { useState, useEffect, useRef } from 'react';

export type CampaignStatusKey = 'tervezet' | 'aktiv' | 'utemezett' | 'lezart';

export function campaignStatusKey(status: string): CampaignStatusKey {
  if (status === 'Aktív') return 'aktiv';
  if (status === 'Ütemezett') return 'utemezett';
  if (status === 'Befejezett' || status === 'Megállítva') return 'lezart';
  return 'tervezet';
}

/** Mockup szerinti badge: Aktív → zöld, Ütemezett → sárga, Tervezet → teal, Lezárt → szürke */
export function campaignStatusDisplay(status: string): { label: string; cls: string } {
  const key = campaignStatusKey(status);
  if (key === 'aktiv') return { label: 'Aktív', cls: 'cp-camp-active' };
  if (key === 'utemezett') return { label: 'Ütemezett', cls: 'cp-camp-scheduled' };
  if (key === 'lezart') return { label: 'Lezárt', cls: 'cp-camp-closed' };
  return { label: 'Tervezet', cls: 'cp-camp-draft' };
}

/** Ütemezett dátum kiszedése az ai_instructions SCHED: előtagjából */
export function getScheduledDate(aiInstructions: string | undefined): string | null {
  if (!aiInstructions || !aiInstructions.startsWith('SCHED:')) return null;
  const pipeIdx = aiInstructions.indexOf('|');
  if (pipeIdx < 0) return null;
  return aiInstructions.substring(6, pipeIdx);
}

/** "2026. aug. 28." formátum */
export function fmtCreatedDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const month = d.toLocaleDateString('hu-HU', { month: 'short' }).replace('.', '');
  return `${d.getFullYear()}. ${month}. ${d.getDate()}.`;
}

interface Props {
  statusKey: CampaignStatusKey;
  onStart: () => void;
  onStop: () => void;
  onClose: () => void;
  onDelete: () => void;
  onSchedule: () => void;
}

export default function CampaignMenu({ statusKey, onStart, onStop, onClose, onDelete, onSchedule }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click + Esc
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // Státuszfüggő műveletek (a szabályok nem változnak)
  type MenuItem = { label: string; icon: React.ReactNode; handler: () => void; danger?: boolean };
  const items: MenuItem[] = [];
  const iconProps = {
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', width: 15, height: 15,
  };

  if (statusKey === 'tervezet') {
    items.push(
      { label: 'Indítás', icon: <svg {...iconProps}><polygon points="5 3 19 12 5 21 5 3" /></svg>, handler: onStart },
      { label: 'Ütemezés', icon: <svg {...iconProps}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>, handler: onSchedule },
    );
  } else if (statusKey === 'utemezett') {
    items.push(
      { label: 'Indítás most', icon: <svg {...iconProps}><polygon points="5 3 19 12 5 21 5 3" /></svg>, handler: onStart },
      { label: 'Átütemezés', icon: <svg {...iconProps}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>, handler: onSchedule },
    );
  } else if (statusKey === 'aktiv') {
    items.push(
      { label: 'Szüneteltetés', icon: <svg {...iconProps}><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>, handler: onStop },
      { label: 'Leállítás', icon: <svg {...iconProps}><rect x="3" y="3" width="18" height="18" rx="2" /></svg>, handler: onClose },
    );
  }
  items.push({ label: 'Törlés', icon: <svg {...iconProps}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>, handler: onDelete, danger: true });

  return (
    <div className="camp-menu" ref={menuRef}>
      <button
        className="camp-menu-btn"
        aria-label="Műveletek"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        <svg fill="currentColor" viewBox="0 0 24 24" width="18" height="18">
          <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open && (
        <div className="camp-menu-pop" role="menu" onClick={(e) => e.stopPropagation()}>
          {items.map((item) => (
            <button
              key={item.label}
              className={`camp-menu-item${item.danger ? ' camp-menu-item--danger' : ''}`}
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); setOpen(false); item.handler(); }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
