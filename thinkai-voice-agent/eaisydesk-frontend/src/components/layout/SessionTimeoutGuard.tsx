/**
 * SessionTimeoutGuard – Monitors user inactivity and shows a warning
 * before automatically logging out. The timeout duration is configurable
 * from the Beállítások > Biztonság page and persisted in localStorage.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

const STORAGE_KEY = 'eaisydesk_session_timeout';
const WARNING_BEFORE_MS = 60_000; // Show warning 60s before logout

export function getSessionTimeoutMinutes(): number {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const val = parseInt(stored, 10);
    if ([5, 15, 30, 60].includes(val)) return val;
  }
  return 15; // default
}

export function setSessionTimeoutMinutes(minutes: number) {
  localStorage.setItem(STORAGE_KEY, String(minutes));
}

export default function SessionTimeoutGuard() {
  const { logout, isAuthenticated } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(60);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logoutTimeRef = useRef<number>(0);

  const clearAllTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    timeoutRef.current = null;
    warningRef.current = null;
    countdownRef.current = null;
  }, []);

  const doLogout = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);
    logout('Munkamenet lejárt inaktivitás miatt. Kérlek jelentkezz be újra.');
  }, [logout, clearAllTimers]);

  const resetTimers = useCallback(() => {
    if (!isAuthenticated) return;
    clearAllTimers();
    setShowWarning(false);

    const timeoutMinutes = getSessionTimeoutMinutes();
    const timeoutMs = timeoutMinutes * 60 * 1000;

    // Set the absolute logout time
    logoutTimeRef.current = Date.now() + timeoutMs;

    // Show warning 60s before logout (or immediately if timeout < 2 min)
    const warningDelay = Math.max(timeoutMs - WARNING_BEFORE_MS, 0);

    warningRef.current = setTimeout(() => {
      setShowWarning(true);
      setRemainingSeconds(Math.min(60, Math.ceil(timeoutMs / 1000)));

      // Start countdown
      countdownRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((logoutTimeRef.current - Date.now()) / 1000));
        setRemainingSeconds(remaining);
        if (remaining <= 0) {
          doLogout();
        }
      }, 1000);
    }, warningDelay);

    // Hard logout at timeout
    timeoutRef.current = setTimeout(doLogout, timeoutMs);
  }, [isAuthenticated, clearAllTimers, doLogout]);

  // Set up activity listeners
  useEffect(() => {
    if (!isAuthenticated) {
      clearAllTimers();
      return;
    }

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => {
      if (showWarning) return; // Don't reset if warning is showing
      resetTimers();
    };

    activityEvents.forEach(ev => document.addEventListener(ev, handleActivity, { passive: true }));

    // Start initial timer
    resetTimers();

    return () => {
      activityEvents.forEach(ev => document.removeEventListener(ev, handleActivity));
      clearAllTimers();
    };
  }, [isAuthenticated, resetTimers, clearAllTimers, showWarning]);

  const handleStayLoggedIn = () => {
    setShowWarning(false);
    resetTimers();
  };

  if (!showWarning) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'stFadeIn 0.3s ease',
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: '90vw',
          background: 'var(--card, #fff)',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          animation: 'stSlideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Warning header */}
        <div style={{
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24" width="22" height="22">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
              Biztonsági figyelmeztetés
            </div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>
              Munkamenet lejár
            </h3>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 24px 16px', textAlign: 'center' }}>
          <div style={{
            fontSize: 48, fontWeight: 800, color: '#d97706',
            fontVariantNumeric: 'tabular-nums',
            marginBottom: 8,
          }}>
            {remainingSeconds}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            másodperc múlva automatikusan kijelentkeztetünk inaktivitás miatt.
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '8px 24px 24px', display: 'flex', gap: 12 }}>
          <button
            onClick={doLogout}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            Kijelentkezés
          </button>
          <button
            onClick={handleStayLoggedIn}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #1ceee0, #0bbdb1)',
              color: '#082432',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              boxShadow: '0 4px 16px rgba(28,238,224,0.25)',
            }}
          >
            Maradok bejelentkezve
          </button>
        </div>
      </div>

      <style>{`
        @keyframes stFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes stSlideUp { from { opacity: 0; transform: translateY(24px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
}
