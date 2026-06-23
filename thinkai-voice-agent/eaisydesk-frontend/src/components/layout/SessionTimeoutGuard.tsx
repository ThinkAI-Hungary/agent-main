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
    <div className="modal-overlay st-modal-overlay">
      <div className="modal-card st-modal-card">
        {/* Warning header */}
        <div className="flex-row gap-12 st-warning-header">
          <div className="flex-center st-warning-icon">
            <svg fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24" width="22" height="22">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div>
            <div className="text-xs font-bold st-warning-subtitle">
              Biztonsági figyelmeztetés
            </div>
            <h3 className="text-xl font-bold st-warning-title">
              Munkamenet lejár
            </h3>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body text-center">
          <div className="font-extrabold st-countdown">
            {remainingSeconds}
          </div>
          <div className="text-md text-muted st-countdown-label">
            másodperc múlva automatikusan kijelentkeztetünk inaktivitás miatt.
          </div>
        </div>

        {/* Actions */}
        <div className="modal-footer">
          <button className="btn btn-outline flex-1" onClick={doLogout}>
            Kijelentkezés
          </button>
          <button className="btn btn-primary flex-1" onClick={handleStayLoggedIn}>
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
