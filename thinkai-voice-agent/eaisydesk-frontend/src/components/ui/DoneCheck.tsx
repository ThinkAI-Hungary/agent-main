/**
 * „Elvégezve" jelölő — nem-natív, vékony körvonalas checkbox a rendszer
 * ikonnyelvéhez illően (user-mockup 2026-10-06): lezárt állapotban zöld,
 * vékony stroke-os pipa. A natív <input type=checkbox accent-color> helyett.
 * disabled: az autonóm módon lezárt interakciók nem nyithatók újra (2026-10-07)
 * — világosszürke alapon sötétebb szürke pipa.
 */
import './DoneCheck.css';

export default function DoneCheck({ checked, onToggle, title, disabled = false }: {
  checked: boolean;
  onToggle: (e: React.MouseEvent) => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`donecb${checked ? ' checked' : ''}`}
      role="checkbox"
      aria-checked={checked}
      aria-label={title || 'Elvégezve'}
      title={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle(e); }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </button>
  );
}
