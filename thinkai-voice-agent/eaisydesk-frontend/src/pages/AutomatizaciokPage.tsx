/**
 * AutomatizaciokPage – Automatikus értesítések (időponthoz kapcsolódó emailek).
 *
 * NÉGY beégetett sablon — a szöveget a backend tartalmazza (a user NEM tudja
 * módosítani), csak toggle-lel engedélyezheti / tilthatja le:
 *   1. Időpont visszaigazolása   (foglalás után, .ics csatolmánnyal)
 *   2. Időpont emlékeztető       (24 órával az időpont előtt)
 *   3. Időpont módosításának visszaigazolása (frissített .ics)
 *   4. Időpont lemondása
 *
 * Design: user által adott HTML-mockup (co-section / nt-token rendszer,
 * 1120px szélesség, szekció-fejléc surface háttérrel, stroke SVG ikonok,
 * toggle-öléskor a kártya törzse elhalványul).
 */
import { useState, useEffect, type CSSProperties } from 'react';
import { authFetch } from '../api/client';
import { showToast } from '../components/ui/Toast';
import { useTheme } from '../context/ThemeContext';

// ── Interfaces ──
interface AppointmentNotification {
  kind: 'confirmation' | 'reminder' | 'modification' | 'cancellation';
  title: string;
  description: string;
  subject: string;
  body: string;
  enabled: boolean;
}

// ── Mockup-tokenek (világos / sötét) ──
const tokens = (dark: boolean) => ({
  bg: dark ? '#141414' : '#ffffff',
  surface: dark ? '#1d1d1d' : '#f5f5f5',
  fg: dark ? '#dcdcdc' : '#000000',
  muted: dark ? '#7e7e7e' : '#8c8c8c',
  border: dark ? '#3e3e3e' : '#dbdbdb',
  text2: dark ? '#adadad' : '#595959',
  accent: dark ? '#3fd8c8' : '#1ceee0',
  accent2: dark ? '#3fd8c8' : '#186d98',
});

// ── Stroke SVG ikonok (mockup symbol-jai) ──
const Icon = ({ d, style }: { d: React.ReactNode; style?: CSSProperties }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 16, height: 16, flex: 'none', ...style }}
  >
    {d}
  </svg>
);
const ICONS: Record<string, React.ReactNode> = {
  confirmation: <polyline points="20 6 9 17 4 12" />,
  reminder: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </>
  ),
  modification: <path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />,
  cancellation: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
};

/** Sablon-szöveg renderelése: bekezdések + {{változó}} token chipek */
function TemplateBody({ body, t }: { body: string; t: ReturnType<typeof tokens> }) {
  const tokenStyle: CSSProperties = {
    fontWeight: 600,
    color: t.accent2,
    background: `color-mix(in srgb, ${t.accent2} 10%, transparent)`,
    borderRadius: 8,
    padding: '1px 6px',
    whiteSpace: 'nowrap',
  };
  const paragraphs = body.split('\n\n');
  return (
    <div
      style={{
        padding: 14,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        background: t.bg,
        fontSize: 13,
        color: t.text2,
        lineHeight: 1.65,
      }}
    >
      {paragraphs.map((para, pi) => (
        <p key={pi} style={{ margin: 0, marginTop: pi > 0 ? 8 : 0 }}>
          {para.split('\n').map((line, li) => (
            <span key={li}>
              {li > 0 && <br />}
              {line.split(/(\{\{[^}]+\}\})/g).map((part, pi2) =>
                /^\{\{[^}]+\}\}$/.test(part) ? (
                  <span key={pi2} style={tokenStyle}>{part}</span>
                ) : (
                  <span key={pi2}>{part}</span>
                )
              )}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

/** Toggle kapcsoló (mockup: 40×22, pipánál accent-2 háttér) */
function ToggleSwitch({ enabled, onChange, t }: { enabled: boolean; onChange: (v: boolean) => void; t: ReturnType<typeof tokens> }) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'inline-flex',
        flex: 'none',
        width: 40,
        height: 22,
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', margin: 0, cursor: 'pointer', zIndex: 1 }}
      />
      <span
        style={{
          position: 'relative',
          display: 'block',
          width: '100%',
          height: '100%',
          borderRadius: 8,
          background: enabled ? t.accent2 : t.border,
          transition: 'background .15s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: 3,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#ffffff',
            transform: enabled ? 'translateX(18px)' : 'translateX(0)',
            transition: 'transform .15s',
          }}
        />
      </span>
    </label>
  );
}

export default function AutomatizaciokPage() {
  const { isDark } = useTheme();
  const t = tokens(isDark);
  const [notifications, setNotifications] = useState<AppointmentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKind, setSavingKind] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch('/admin/api/settings/reminder');
        const data = await res.json();
        if (Array.isArray(data?.notifications)) {
          setNotifications(data.notifications as AppointmentNotification[]);
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const toggleNotification = async (kind: AppointmentNotification['kind'], enabled: boolean) => {
    setSavingKind(kind);
    setNotifications((prev) => prev.map((n) => (n.kind === kind ? { ...n, enabled } : n)));
    try {
      const res = await authFetch('/admin/api/settings/reminder/notification-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, enabled }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast(enabled ? 'Értesítés engedélyezve.' : 'Értesítés letiltva.');
    } catch {
      setNotifications((prev) => prev.map((n) => (n.kind === kind ? { ...n, enabled: !enabled } : n)));
      showToast('Hiba a mentés során!', 'error');
    }
    setSavingKind(null);
  };

  const fieldLabelStyle: CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 500,
    color: t.muted,
    letterSpacing: '0.02em',
    paddingLeft: 2,
    marginBottom: 5,
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 32px 64px', color: t.text2 }}>
        <div className="spinner spinner--md" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 32px 64px' }}>
      {/* ── Page head ── */}
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 12, color: t.muted, marginBottom: 4 }}>
            Kimenő kommunikáció <b style={{ color: t.fg, fontWeight: 600 }}>/ Értesítések</b>
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.25, color: t.fg }}>
            Automatikus értesítések
          </h1>
        </div>
      </header>

      {notifications.length === 0 && (
        <div style={{ color: t.muted, marginTop: 16, fontSize: 13 }}>
          Nincs megjeleníthető értesítés.
        </div>
      )}

      {notifications.map((n) => {
        const sectionStyle: CSSProperties = {
          background: t.bg,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          marginTop: 12,
          overflow: 'hidden',
        };
        const off = !n.enabled;
        return (
          <section key={n.kind} style={sectionStyle}>
            {/* ── Szekció fejléc ── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '13px 16px',
                borderBottom: `1px solid ${t.border}`,
                background: t.surface,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: t.fg }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 28,
                      height: 28,
                      color: t.accent2,
                      background: `color-mix(in srgb, ${t.accent} 18%, ${t.bg})`,
                      borderRadius: 8,
                      flex: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <Icon d={ICONS[n.kind]} />
                  </span>
                  {n.title}
                </div>
                <div style={{ fontSize: 12, color: t.muted, marginTop: 1 }}>{n.description}</div>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, color: t.muted, whiteSpace: 'nowrap' }}>
                <span>Engedélyezve</span>
                <ToggleSwitch enabled={n.enabled} onChange={(v) => !savingKind && toggleNotification(n.kind, v)} t={t} />
              </div>
            </div>

            {/* ── Szekció törzs (kikapcsolva elhalványul) ── */}
            <div
              style={{
                padding: 16,
                opacity: off ? 0.55 : 1,
                pointerEvents: off ? 'none' : 'auto',
                transition: 'opacity .15s',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={fieldLabelStyle}>Email tárgya</span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: 40,
                      padding: '0 12px',
                      border: `1px solid ${t.border}`,
                      borderRadius: 8,
                      background: t.bg,
                      fontSize: 13,
                      color: t.text2,
                      cursor: 'default',
                    }}
                  >
                    {n.subject}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={fieldLabelStyle}>Email szövege</span>
                  <TemplateBody body={n.body} t={t} />
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
