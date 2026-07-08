/**
 * CustomSelect — dark-mode-safe dropdown, extracted from SettingsPage.
 * Fully self-contained: no parent state dependencies.
 */
import { useState, useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

export default function CustomSelect({ value, onChange, options }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const current = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`custom-select-trigger${open ? ' custom-select-trigger--open' : ''}`}
      >
        {current?.label || value}
        <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="14" height="14" className={`custom-select-chevron${open ? ' custom-select-chevron--open' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="custom-select-panel">
          {options.map(o => (
            <button
              type="button"
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className="custom-select-option"
              style={{
                fontWeight: o.value === value ? 600 : 400,
                background: o.value === value ? 'rgba(28,238,224,0.08)' : 'transparent',
                color: o.value === value ? 'var(--accent)' : 'var(--text)',
              }}
              onMouseEnter={e => { if (o.value !== value) (e.currentTarget).style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { if (o.value !== value) (e.currentTarget).style.background = 'transparent'; }}
            >
              {o.label}
              {o.value === value && (
                <svg fill="none" stroke="var(--accent)" strokeWidth="2.5" viewBox="0 0 24 24" width="14" height="14">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`@keyframes customSelectDropIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}
