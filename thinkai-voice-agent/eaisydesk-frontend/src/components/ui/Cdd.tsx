/**
 * Nem-natív dropdown (open-design spec, 2026-09-23): trigger + chevron,
 * abszolút menü opciókkal és pipa-jelöléssel. A naptár időpont-modal
 * dropdownjaihoz készült (szolgáltatás, munkatárs, időtartam).
 */
import { useEffect, useRef, useState } from 'react';

export interface CddOption {
  value: string;
  label: string;
  sub?: string; // másodlagos magyarázó sor (open-design spec)
}

export default function Cdd({ value, values, options, placeholder, onChange, onChangeMulti, ariaLabel, multi = false, wide = false }: {
  value?: string;
  values?: string[];          // multi módban
  options: CddOption[];
  placeholder?: string;
  onChange?: (value: string) => void;
  onChangeMulti?: (values: string[]) => void;
  ariaLabel?: string;
  multi?: boolean;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [open]);

  const selected = options.find(o => o.value === value);
  const selectedMulti = values || [];
  const isPlaceholder = multi ? selectedMulti.length === 0 : !selected;
  const displayText = multi
    ? (selectedMulti.length ? options.filter(o => selectedMulti.includes(o.value)).map(o => o.label).join(', ') : (placeholder || '—'))
    : (selected ? selected.label : (placeholder || '—'));

  return (
    <div className={`cdd${open ? ' is-open' : ''}${wide ? ' cdd-wide' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="cdd-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
      >
        <span className={`cdd-value${isPlaceholder ? ' is-placeholder' : ''}`}>
          {displayText}
        </span>
        <svg className="cdd-chev" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="13" height="13">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="cdd-menu" role="listbox" aria-multiselectable={multi || undefined}>
          {options.map(o => {
            const on = multi ? selectedMulti.includes(o.value) : o.value === value;
            return (
              <button
                key={o.value || '__empty__'}
                type="button"
                className={`cdd-opt${on ? ' is-on' : ''}`}
                role="option"
                aria-selected={on}
                onClick={() => {
                  if (multi && onChangeMulti) {
                    onChangeMulti(on ? selectedMulti.filter(v => v !== o.value) : [...selectedMulti, o.value]);
                  } else {
                    onChange?.(o.value);
                    setOpen(false);
                  }
                }}
              >
                <span className="cdd-opt-txt">
                  {o.label}
                  {o.sub && <span className="cdd-opt-sub">{o.sub}</span>}
                </span>
                <svg className="cdd-check" style={{ display: on ? 'block' : 'none' }} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
