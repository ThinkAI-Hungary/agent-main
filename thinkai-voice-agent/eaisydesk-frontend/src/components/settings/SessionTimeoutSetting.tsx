/**
 * SessionTimeoutSetting — standalone component extracted from BeallitasokPage.
 * Fully independent: reads/writes only localStorage via SessionTimeoutGuard helpers.
 */
import { useState, useEffect, useRef } from 'react';
import { getSessionTimeoutMinutes, setSessionTimeoutMinutes } from '../layout/SessionTimeoutGuard';
import { showToast } from '../ui/Toast';

const TIMEOUT_OPTIONS = [
  { value: 5, label: '5 perc' },
  { value: 15, label: '15 perc' },
  { value: 30, label: '30 perc' },
  { value: 60, label: '60 perc' },
];

export default function SessionTimeoutSetting() {
  const [value, setValue] = useState(getSessionTimeoutMinutes());
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleSelect = (minutes: number) => {
    setValue(minutes);
    setSessionTimeoutMinutes(minutes);
    setOpen(false);
    showToast(`Munkamenet időtúllépés: ${minutes} perc`);
  };

  return (
    <div className="security-row">
      <div className="security-icon clock">
        <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="20" height="20">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <div className="security-info">
        <div className="security-title">Munkamenet időtúllépés</div>
        <div className="security-desc">{value} perc inaktivitás után automatikus kijelentkezés</div>
      </div>
      <div className="security-action security-action-relative" ref={ref}>
        <button className="btn-security-modify session-timeout-btn" onClick={() => setOpen(!open)}>
          <span>{value} perc</span>
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12" height="12" className={`session-chevron${open ? ' session-chevron--open' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {open && (
          <div className="session-dropdown-panel">
            {TIMEOUT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className="session-dropdown-option"
                style={{
                  fontWeight: opt.value === value ? 600 : 400,
                  background: opt.value === value ? 'rgba(28,238,224,0.08)' : 'transparent',
                  color: opt.value === value ? 'var(--accent)' : 'var(--text)',
                }}
                onMouseEnter={e => { if (opt.value !== value) (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={e => { if (opt.value !== value) (e.target as HTMLElement).style.background = 'transparent'; }}
              >
                {opt.label}
                {opt.value === value && (
                  <svg fill="none" stroke="var(--accent)" strokeWidth="2.5" viewBox="0 0 24 24" width="14" height="14">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
