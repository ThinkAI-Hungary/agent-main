import { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './NotificationCenter.css';

/* ── Types ──────────────────────────────────────────────────── */

type NotifType = 'urgent' | 'interaction' | 'cancelled';

interface NotifData {
  clientId?: string;
  id?: string;
  name?: string;
  client?: string;
  email?: string;
  phone?: string;
  channel?: string;
  problem?: string;
  summary?: string;
}

interface Notification {
  id: number;
  type: NotifType;
  data: NotifData;
  time: Date;
  read: boolean;
}

/* ── Config ─────────────────────────────────────────────────── */

const TYPE_CONFIG: Record<NotifType, {
  label: string; color: string; bg: string; icon: string; borderColor: string;
}> = {
  urgent:      { label: 'Sürgős',          color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  icon: '🔴', borderColor: '#ef4444' },
  interaction: { label: 'Új interakció',   color: '#0d9488', bg: 'rgba(13,148,136,0.08)', icon: '💬', borderColor: '#1ceee0' },
  cancelled:   { label: 'Időpont lemondva', color: '#f97316', bg: 'rgba(249,115,22,0.08)', icon: '⚠️', borderColor: '#f97316' },
};

/* ── Helpers ────────────────────────────────────────────────── */

function esc(s: string) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function timeAgo(d: Date): string {
  return d.toLocaleString('hu-HU', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ── Component ──────────────────────────────────────────────── */

export default function NotificationCenter() {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Notification[]>([]);

  const idCounter = useRef(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const urgentAudio = useRef<HTMLAudioElement | null>(null);
  const initialized = useRef(false);

  // Init audio
  useEffect(() => {
    urgentAudio.current = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  /* ── Add notification ── */
  const addNotification = useCallback((type: NotifType, data: NotifData) => {
    const id = ++idCounter.current;
    const notif: Notification = { id, type, data, time: new Date(), read: false };

    setNotifications(prev => {
      const next = [notif, ...prev];
      if (next.length > 50) next.length = 50;
      return next;
    });

    if (type === 'urgent') {
      setToasts(prev => [...prev, notif]);
      urgentAudio.current?.play().catch(() => {});
    }
  }, []);

  /* ── Remove toast after timeout ── */
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts(prev => prev.slice(1));
    }, 8000);
    return () => clearTimeout(timer);
  }, [toasts]);

  /* ── Polling-based notification system (replaces Supabase Realtime) ── */
  const lastSeenTimeRef = useRef<string>('');
  const isFirstPollRef = useRef(true);

  useEffect(() => {
    if (!isAuthenticated) return;

    async function pollInteractions() {
      try {
        const res = await authFetch('/admin/api/interactions?limit=10');
        if (!res.ok) return;
        const data = await res.json();
        const rows = data?.interactions || data;
        if (!Array.isArray(rows) || rows.length === 0) return;

        // Kimenő automatikus üzenetek (visszaigazoló, emlékeztető, módosítás,
        // lemondás, kampány — tool_name='outbound_notification') nem értesítenek;
        // ezek csak az ügyfélprofil lezárt sorai között jelennek meg.
        const visibleRows = rows.filter((r: any) => r.tool_name !== 'outbound_notification');
        if (visibleRows.length === 0) return;

        // Sort by created_at DESC, find the latest timestamp
        const sorted = [...visibleRows].sort((a: any, b: any) =>
          (b.created_at || '').localeCompare(a.created_at || '')
        );
        const latestTime = sorted[0]?.created_at || '';

        // On first poll: load saved timestamp from localStorage
        if (isFirstPollRef.current) {
          isFirstPollRef.current = false;
          const saved = localStorage.getItem('lastSeenInteractionTime') || '';
          if (saved) {
            lastSeenTimeRef.current = saved;
            // Fall through to check for new rows against saved timestamp
          } else {
            lastSeenTimeRef.current = latestTime;
            localStorage.setItem('lastSeenInteractionTime', latestTime);
            return;
          }
        }

        // Find new rows: created_at > last seen time
        const newRows = visibleRows.filter((r: any) =>
          (r.created_at || '') > lastSeenTimeRef.current
        );

        for (const row of newRows) {
          const channel = row.type || row.channel || 'Üzenet';
          const rawTopic = (row.topic || '').replace(/\uFFFD/g, '');
          const rawSummary = (row.summary || '').replace(/\uFFFD/g, '');
          const incomingMessage = rawTopic.replace(/^.+?AI\s+v[áa]lasz\s*-\s*/i, '').trim();
          const displayText = incomingMessage
            ? `Beérkezett üzenet: ${incomingMessage}`
            : rawSummary || `Új ${channel} érkezett`;
          const alertTags = row.alert_tags || [];
          const isUrgent = Array.isArray(alertTags)
            ? alertTags.includes('urgent')
            : String(alertTags).includes('urgent');
          const clientName = row.client_name || row.participant || 'Ismeretlen';

          if (isUrgent) {
            addNotification('urgent', {
              name: clientName,
              channel,
              problem: incomingMessage || 'Sürgős megkeresés beérkezett.',
            });
            urgentAudio.current?.play().catch(() => {});
          } else {
            addNotification('interaction', {
              client: clientName,
              channel,
              summary: displayText,
            });
          }
        }

        if (latestTime > lastSeenTimeRef.current) {
          lastSeenTimeRef.current = latestTime;
          localStorage.setItem('lastSeenInteractionTime', latestTime);
        }
      } catch { /* polling error */ }
    }

    pollInteractions();
    const interval = setInterval(pollInteractions, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated, addNotification]);

  /* ── Handle notification click ── */
  const handleClick = useCallback((notifId: number) => {
    // Remove from list
    setNotifications(prev => prev.filter(x => x.id !== notifId));
    setOpen(false);

    // Navigate: admin -> /interactions, member/user -> /dashboard
    navigate(isAdmin ? '/interactions' : '/dashboard');
  }, [navigate, isAdmin]);

  /* ── Clear all notifications ── */
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const count = notifications.length;

  return (
    <>
      {/* Bell + Dropdown */}
      <div className="notif-center" ref={dropdownRef}>
        <button
          className="notif-bell"
          title="Értesítési központ"
          onClick={() => setOpen(o => !o)}
          aria-label="Értesítési központ"
        >
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {count > 0 && (
            <span className="notif-badge">{count > 99 ? '99+' : count}</span>
          )}
          {count > 0 && <span className="notif-bell-pulse" />}
        </button>

        {open && (
          <div className="notif-dropdown">
            <div className="notif-dropdown-header">
              <span>Értesítési központ</span>
              {count > 0 && (
                <button className="notif-clear-btn" onClick={clearAll}>
                  Összes törlése
                </button>
              )}
            </div>
            <div className="notif-dropdown-list">
              {notifications.length === 0 ? (
                <div className="notif-empty">
                  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="notif-empty-icon">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  Nincs új értesítés.
                </div>
              ) : (
                notifications.slice(0, 30).map(n => {
                  const cfg = TYPE_CONFIG[n.type];
                  const name = n.data.name || n.data.client || 'Ismeretlen';
                  const detail = n.data.problem || n.data.summary || '';
                  const channel = n.data.channel || '';

                  return (
                    <div
                      key={n.id}
                      className="notif-item"
                      style={{ background: cfg.bg }}
                      onClick={() => handleClick(n.id)}
                    >
                      <div className="notif-item-dot" style={{ background: cfg.color }} />
                      <div className="notif-item-body">
                        <div className="notif-item-top">
                          <span className="notif-item-type" style={{ color: cfg.color }}>
                            {cfg.label}
                          </span>
                          <span className="notif-item-time">{timeAgo(n.time)}</span>
                        </div>
                        <div className="notif-item-mid">
                          <span className="notif-item-name">{esc(name)}</span>
                          {channel && (
                            <span
                              className="notif-item-channel"
                              style={{ color: cfg.color, background: cfg.bg }}
                            >
                              {esc(channel)}
                            </span>
                          )}
                        </div>
                        {detail && (
                          <div className="notif-item-detail">{esc(detail)}</div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toasts */}
      <div className="notif-toast-container">
        {toasts.map((t, i) => {
          const cfg = TYPE_CONFIG[t.type];
          const name = t.data.name || t.data.client || 'Ismeretlen';
          const detail = t.data.problem || t.data.summary || '';
          const channel = t.data.channel || '';

          return (
            <div
              key={t.id}
              className="notif-toast"
              style={{
                borderLeftColor: cfg.borderColor,
                animationDelay: `${i * 100}ms`,
                cursor: 'pointer',
              }}
              onClick={() => {
                handleClick(t.id);
                setToasts(prev => prev.filter(x => x.id !== t.id));
              }}
            >
              <div className="notif-toast-header">
                <div className="notif-toast-type">
                  <span>{cfg.icon}</span>
                  <span style={{ color: cfg.color, fontWeight: 700, fontSize: 12 }}>{cfg.label}</span>
                </div>
                <button
                  className="notif-toast-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    setToasts(prev => prev.filter(x => x.id !== t.id));
                  }}
                >
                  ×
                </button>
              </div>
              <div className="notif-toast-body">
                <span className="notif-toast-name">{esc(name)}</span>
                {channel && <span className="notif-toast-channel">{esc(channel)}</span>}
              </div>
              {detail && <div className="notif-toast-detail">{esc(detail)}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
