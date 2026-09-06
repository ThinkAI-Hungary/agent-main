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
 * Változók: {{név}} {{időpont}} {{szolgáltatás}} {{munkatárs}} {{telephely}} {{szolgáltató}}
 * (A régi eseményvezérelt automatizációk kikapcsolt állapotban megmaradnak
 * a DB-ben, de a felületen már nem jelennek meg.)
 */
import { useState, useEffect } from 'react';
import { authFetch } from '../api/client';
import { showToast } from '../components/ui/Toast';

// ── Interfaces ──
interface AppointmentNotification {
  kind: 'confirmation' | 'reminder' | 'modification' | 'cancellation';
  title: string;
  description: string;
  subject: string;
  body: string;
  enabled: boolean;
}

// ── Kártya-ikonok (kind → glyph + tint) ──
const KIND_ICONS: Record<string, { glyph: string; tint: string; fg: string }> = {
  confirmation: { glyph: '✓', tint: 'rgba(28, 238, 224, 0.12)', fg: '#0d9488' },
  reminder: { glyph: '⏱', tint: 'rgba(59, 130, 246, 0.12)', fg: '#2563eb' },
  modification: { glyph: '✎', tint: 'rgba(168, 85, 247, 0.12)', fg: '#7c3aed' },
  cancellation: { glyph: '✕', tint: 'rgba(239, 68, 68, 0.12)', fg: '#dc2626' },
};

const cardStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border, rgba(0,0,0,0.08))',
  borderRadius: 14,
  overflow: 'hidden',
  marginBottom: 24,
  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
};
const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '20px 26px',
  background: 'var(--bg-secondary, rgba(0,0,0,0.02))',
  borderBottom: '1px solid var(--border, rgba(0,0,0,0.06))',
};
const cardBodyStyle: React.CSSProperties = {
  padding: '26px',
};
const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 8,
};
const readOnlyInputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '13px 16px',
  borderRadius: 10,
  border: '1px solid var(--border, rgba(0,0,0,0.1))',
  background: 'var(--bg-secondary, transparent)',
  color: 'var(--text)',
  fontSize: 14.5,
  outline: 'none',
};
const readOnlyBodyStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 220,
  padding: '18px 20px',
  borderRadius: 10,
  border: '1px solid var(--border, rgba(0,0,0,0.1))',
  background: 'var(--bg-secondary, transparent)',
  color: 'var(--text)',
  fontSize: 14.5,
  lineHeight: 2.1,
  whiteSpace: 'pre-wrap',
};

/** A sablon-szöveg renderelése {{változó}} chipekkel */
function TemplateBody({ body }: { body: string }) {
  const parts = body.split(/(\{\{[^}]+\}\})/g);
  return (
    <div style={readOnlyBodyStyle}>
      {parts.map((p, i) =>
        /^\{\{[^}]+\}\}$/.test(p) ? (
          <span
            key={i}
            style={{
              background: 'rgba(28, 238, 224, 0.14)',
              color: '#0d9488',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 13.5,
              whiteSpace: 'nowrap',
            }}
          >
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </div>
  );
}

/** Toggle kapcsoló */
function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      aria-pressed={enabled}
      style={{
        width: 46,
        height: 26,
        borderRadius: 13,
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        background: enabled ? '#1d4ed8' : 'rgba(128,128,128,0.35)',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: enabled ? 23 : 3,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  );
}

export default function AutomatizaciokPage() {
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
    // Optimista frissítés
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
      // Visszaállítás hibánál
      setNotifications((prev) => prev.map((n) => (n.kind === kind ? { ...n, enabled: !enabled } : n)));
      showToast('Hiba a mentés során!', 'error');
    }
    setSavingKind(null);
  };

  if (loading) {
    return (
      <div className="flex-row auto-loading">
        <div className="spinner spinner--md" />
      </div>
    );
  }

  return (
    <div className="page active" id="page-automatizaciok">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-title">Automatikus értesítések</div>
      </div>

      {notifications.length === 0 && (
        <div style={{ color: 'var(--text-muted)', padding: '20px 4px' }}>
          Nincs megjeleníthető értesítés.
        </div>
      )}

      {notifications.map((n) => {
        const icon = KIND_ICONS[n.kind] || KIND_ICONS.confirmation;
        return (
          <div key={n.kind} style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: icon.tint,
                    color: icon.fg,
                    fontSize: 17,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {icon.glyph}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--text)' }}>{n.title}</div>
                  <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 2 }}>{n.description}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <span style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
                  {n.enabled ? 'Engedélyezve' : 'Letiltva'}
                </span>
                <ToggleSwitch
                  enabled={n.enabled}
                  onChange={(v) => !savingKind && toggleNotification(n.kind, v)}
                />
              </div>
            </div>

            <div style={cardBodyStyle}>
              <label style={fieldLabelStyle}>Email tárgya</label>
              <input style={readOnlyInputStyle} value={n.subject} readOnly />

              <label style={{ ...fieldLabelStyle, marginTop: 20 }}>Email szövege</label>
              <TemplateBody body={n.body} />

              <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--text-muted)' }}>
                Ez egy beégetett sablon — a szöveg nem módosítható, csak engedélyezhető vagy letiltható.
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
