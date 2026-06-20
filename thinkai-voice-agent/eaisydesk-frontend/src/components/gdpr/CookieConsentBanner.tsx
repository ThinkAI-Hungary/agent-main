/**
 * CookieConsentBanner – GDPR-compliant cookie consent banner.
 * Appears from the TOP, per-user localStorage tracking.
 * Design adapted from visibill/eaisybooks.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

const COOKIE_KEY_PREFIX = 'eaisydesk_cookie_consent_';
const COOKIE_VERSION = '1.0';

export interface CookiePreferences {
  necessary: boolean;
  analytics: boolean;
  functional: boolean;
  version: string;
  acceptedAt: string;
}

function getKey(username: string) { return COOKIE_KEY_PREFIX + username; }

export function getCookieConsent(username: string): CookiePreferences | null {
  try {
    const raw = localStorage.getItem(getKey(username));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== COOKIE_VERSION) return null;
    return parsed;
  } catch { return null; }
}

export function hasCookieConsent(username: string): boolean {
  return getCookieConsent(username) !== null;
}

export default function CookieConsentBanner() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [functional, setFunctional] = useState(true);

  useEffect(() => {
    if (!user) return;
    const existing = getCookieConsent(user.username);
    if (!existing) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, [user]);

  const accept = (all: boolean) => {
    if (!user) return;
    const prefs: CookiePreferences = {
      necessary: true,
      analytics: all ? true : analytics,
      functional: all ? true : functional,
      version: COOKIE_VERSION,
      acceptedAt: new Date().toISOString(),
    };
    localStorage.setItem(getKey(user.username), JSON.stringify(prefs));
    setVisible(false);
  };

  if (!visible) return null;

  const cookies = [
    { id: 'necessary', label: 'Szükséges sütik', desc: 'Az alkalmazás alapvető működéséhez szükséges (pl. bejelentkezés, munkamenet)', checked: true, disabled: true },
    { id: 'functional', label: 'Funkcionális sütik', desc: 'Felhasználói beállítások megjegyzése (pl. téma, nyelv, szűrők)', checked: functional, disabled: false },
    { id: 'analytics', label: 'Analitikai sütik', desc: 'Használati statisztikák gyűjtése a termék fejlesztéséhez', checked: analytics, disabled: false },
  ];

  return (
    <>
      {/* Overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99998,
        background: 'rgba(0,0,0,0.35)',
        animation: 'ccFadeIn 0.3s ease',
      }} />

      {/* Banner — TOP position */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
        padding: 16,
        animation: 'ccSlideDown 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>
        <div style={{
          maxWidth: 540, margin: '0 auto',
          background: 'var(--card, #fff)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.05)',
          overflow: 'hidden',
        }}>
          {/* Main content */}
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'rgba(28,238,224,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {/* Cookie icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1ceee0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="8" cy="9" r="1" fill="#1ceee0" />
                  <circle cx="15" cy="7" r="1" fill="#1ceee0" />
                  <circle cx="10" cy="14" r="1" fill="#1ceee0" />
                  <circle cx="16" cy="13" r="1" fill="#1ceee0" />
                  <circle cx="13" cy="17" r="1" fill="#1ceee0" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  Süti beállítások
                </h3>
                <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                  Az eaisydesk sütiket használ a működéshez és a felhasználói élmény javításához.
                  Az „Összes elfogadása" gombra kattintva hozzájárulsz az összes süti használatához.
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => accept(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 18px', borderRadius: 8, border: 'none',
                  background: 'linear-gradient(135deg, #1ceee0, #0bbdb1)',
                  color: '#082432', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 2px 8px rgba(28,238,224,0.25)',
                  transition: 'all 0.15s',
                }}
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="13" height="13">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Összes elfogadása
              </button>
              <button
                onClick={() => accept(false)}
                style={{
                  padding: '9px 18px', borderRadius: 8,
                  border: '1.5px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                Csak szükségesek
              </button>
              <button
                onClick={() => setShowDetails(!showDetails)}
                style={{
                  marginLeft: 'auto',
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 10px', borderRadius: 6,
                  border: 'none', background: 'transparent',
                  color: 'var(--text-muted)', fontSize: 11, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'color 0.15s',
                }}
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
                Testreszabás
              </button>
            </div>
          </div>

          {/* Detailed settings — expandable */}
          <div style={{
            maxHeight: showDetails ? 400 : 0,
            overflow: 'hidden',
            transition: 'max-height 0.35s ease',
          }}>
            <div style={{
              padding: '0 20px 20px', paddingTop: 14,
              borderTop: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {cookies.map(c => {
                const isActive = c.checked;
                return (
                  <label
                    key={c.id}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '12px 14px', borderRadius: 10,
                      border: isActive ? '1.5px solid rgba(28,238,224,0.4)' : '1.5px solid var(--border)',
                      background: isActive ? 'rgba(28,238,224,0.04)' : 'transparent',
                      cursor: c.disabled ? 'default' : 'pointer',
                      transition: 'all 0.2s',
                      opacity: c.disabled ? 0.7 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={c.checked}
                      disabled={c.disabled}
                      onChange={() => {
                        if (c.id === 'functional') setFunctional(!functional);
                        if (c.id === 'analytics') setAnalytics(!analytics);
                      }}
                      style={{ marginTop: 1, accentColor: '#1ceee0', width: 15, height: 15 }}
                    />
                    <div>
                      <div style={{
                        fontSize: 12, fontWeight: 700, color: 'var(--text)',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        {c.label}
                        {c.disabled && (
                          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}>(kötelező)</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>
                        {c.desc}
                      </div>
                    </div>
                  </label>
                );
              })}

              <button
                onClick={() => accept(false)}
                style={{
                  width: '100%', padding: '10px 16px', borderRadius: 8, border: 'none',
                  background: 'linear-gradient(135deg, #1ceee0, #0bbdb1)',
                  color: '#082432', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', marginTop: 4,
                  boxShadow: '0 2px 8px rgba(28,238,224,0.2)',
                }}
              >
                Kiválasztottak mentése
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ccFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ccSlideDown { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </>
  );
}
