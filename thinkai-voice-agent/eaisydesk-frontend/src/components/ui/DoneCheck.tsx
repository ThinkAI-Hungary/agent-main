/**
 * „Elvégezve" jelölő — nem-natív, vékony körvonalas checkbox a rendszer
 * ikonnyelvéhez illően (user-mockup 2026-10-06): lezárt állapotban zöld,
 * vékony stroke-os pipa. A natív <input type=checkbox accent-color> helyett.
 */
import './DoneCheck.css';

export default function DoneCheck({ checked, onToggle, title }: {
  checked: boolean;
  onToggle: (e: React.MouseEvent) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`donecb${checked ? ' checked' : ''}`}
      role="checkbox"
      aria-checked={checked}
      aria-label={title || 'Elvégezve'}
      title={title}
      onClick={(e) => { e.stopPropagation(); onToggle(e); }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </button>
  );
}
