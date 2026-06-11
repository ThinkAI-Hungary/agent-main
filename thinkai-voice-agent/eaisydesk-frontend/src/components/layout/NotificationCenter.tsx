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
  interaction: { label: 'Új interakció',   color: '#1ceee0', bg: 'rgba(28,238,224,0.08)', icon: '💬', borderColor: '#1ceee0' },
  cancelled:   { label: 'Időpont lemondva', color: '#f97316', bg: 'rgba(249,115,22,0.08)', icon: '⚠️', borderColor: '#f97316' },
};

const POLL_INTERVAL = 15_000;

/* ── Helpers ────────────────────────────────────────────────── */

function esc(s: string) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function buildFriendlySummary(interaction: Record<string, unknown>, channel: string): string {
  const parts: string[] = [];
  const i = interaction as Record<string, string>;
  if (i.topic) parts.push(i.topic);
  if (i.summary) parts.push(i.summary);
  if (i.type) parts.push(i.type);

  const combined = parts.join(' ').toLowerCase();

  if (/időpont|foglal|booking|lemondás/.test(combined))
    return 'Időpontfoglalással kapcsolatos megkeresés';
  if (/panasz|reklamáció|complaint/.test(combined))
    return 'Panasz érkezett';
  if (/kérdés|question|információ|érdeklőd/.test(combined))
    return 'Kérdés érkezett';
  if (/kérés|request|igény/.test(combined))
    return 'Új kérés érkezett';
  if (/ár|árajánlat|költség/.test(combined))
    return 'Árajánlat kérés érkezett';
  if (/email|e-mail/.test(combined))
    return 'Email üzenet érkezett';

  const channelMap: Record<string, string> = {
    Messenger: 'Új Messenger üzenet érkezett',
    Instagram: 'Új Instagram üzenet érkezett',
    WhatsApp: 'Új WhatsApp üzenet érkezett',
    Email: 'Új email érkezett',
    Telefon: 'Új telefonos megkeresés',
  };
  return channelMap[channel] || 'Új üzenet érkezett';
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
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Notification[]>([]);

  const idCounter = useRef(0);
  const knownUrgent = useRef(new Set<string>());
  const viewedUrgent = useRef(new Set<string>());
  const knownCancelled = useRef(new Set<string>());
  const viewedCancelled = useRef(new Set<string>());
  const seenInteractions = useRef(new Set<string>());
  const firstInteractionPoll = useRef(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const urgentAudio = useRef<HTMLAudioElement | null>(null);

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

  /* ── Poll: Urgent cases ── */
  const pollUrgent = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await authFetch('/admin/api/alerts/urgent');
      if (!res.ok) return;
      const data = await res.json();
      const clients = (data.urgent_clients || []).filter(
        (c: { id: string }) => !viewedUrgent.current.has(c.id)
      );
      clients.forEach((c: { id: string; name: string; email?: string; phone?: string; channel?: string; problem?: string }) => {
        if (!knownUrgent.current.has(c.id)) {
          knownUrgent.current.add(c.id);
          addNotification('urgent', {
            clientId: c.id, name: c.name, email: c.email,
            phone: c.phone, channel: c.channel, problem: c.problem,
          });
        }
      });
    } catch { /* silent */ }
  }, [isAuthenticated, addNotification]);

  /* ── Poll: Cancelled appointments ── */
  const pollCancelled = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await authFetch('/admin/api/alerts/cancelled');
      if (!res.ok) return;
      const data = await res.json();
      const clients = (data.cancelled_clients || []).filter(
        (c: { id: string }) => !viewedCancelled.current.has(c.id)
      );
      clients.forEach((c: { id: string; name: string; email?: string; phone?: string; channel?: string }) => {
        if (!knownCancelled.current.has(c.id)) {
          knownCancelled.current.add(c.id);
          addNotification('cancelled', {
            clientId: c.id, name: c.name, email: c.email,
            phone: c.phone, channel: c.channel, summary: 'Időpont lemondva',
          });
        }
      });
    } catch { /* silent */ }
  }, [isAuthenticated, addNotification]);

  /* ── Poll: New interactions ── */
  const pollInteractions = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await authFetch('/admin/api/interactions?limit=30');
      if (!res.ok) return;
      const data = await res.json();
      const interactions = data.interactions || [];

      if (firstInteractionPoll.current) {
        interactions.forEach((i: { id: string }) => seenInteractions.current.add(i.id));
        firstInteractionPoll.current = false;
        return;
      }

      interactions.forEach((i: { id: string; type?: string; participant?: string; client_name?: string; alert_tags?: string[]; summary?: string; topic?: string }) => {
        if (!seenInteractions.current.has(i.id)) {
          seenInteractions.current.add(i.id);

          const t = (i.type || '').toLowerCase();
          let channel = 'Telefon';
          if (t.includes('messenger')) channel = 'Messenger';
          else if (t.includes('email')) channel = 'Email';
          else if (t.includes('instagram')) channel = 'Instagram';
          else if (t.includes('whatsapp')) channel = 'WhatsApp';

          const clientName = i.participant || i.client_name || 'Ismeretlen';
          const tags = i.alert_tags || [];
          const isUrgent = tags.includes('urgent');

          if (isUrgent) {
            addNotification('urgent', { name: clientName, channel, problem: 'Sürgős megkeresés beérkezett.' });
            urgentAudio.current?.play().catch(() => {});
          } else {
            const summary = buildFriendlySummary(i, channel);
            addNotification('interaction', { client: clientName, channel, summary });
          }
        }
      });
    } catch { /* silent */ }
  }, [isAuthenticated, addNotification]);

  /* ── Start polling ── */
  useEffect(() => {
    if (!isAuthenticated) return;

    // Initial polls with staggered delays
    const t1 = setTimeout(pollUrgent, 2000);
    const t2 = setTimeout(pollCancelled, 2500);
    const t3 = setTimeout(pollInteractions, 3000);

    const i1 = setInterval(pollUrgent, POLL_INTERVAL);
    const i2 = setInterval(pollCancelled, POLL_INTERVAL);
    const i3 = setInterval(pollInteractions, POLL_INTERVAL);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      clearInterval(i1); clearInterval(i2); clearInterval(i3);
    };
  }, [isAuthenticated, pollUrgent, pollCancelled, pollInteractions]);

  /* ── Handle notification click ── */
  const handleClick = useCallback((notifId: number) => {
    setNotifications(prev => {
      const idx = prev.findIndex(n => n.id === notifId);
      if (idx === -1) return prev;
      const n = prev[idx];

      if (n.type === 'urgent') {
        const cid = n.data.clientId || n.data.id;
        if (cid) {
          viewedUrgent.current.add(cid);
          authFetch(`/admin/api/alerts/urgent/${cid}/view`, { method: 'POST' }).catch(() => {});
        }
        navigate('/clients');
      } else if (n.type === 'cancelled') {
        const cid = n.data.clientId || n.data.id;
        if (cid) {
          viewedCancelled.current.add(cid);
          authFetch(`/admin/api/alerts/cancelled/${cid}/view`, { method: 'POST' }).catch(() => {});
        }
        navigate('/clients');
      } else if (n.type === 'interaction') {
        navigate('/interactions');
      }

      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
    setOpen(false);
  }, [navigate]);

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
                  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" width="32" height="32" style={{ opacity: 0.4 }}>
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
                            {cfg.icon} {cfg.label}
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
              }}
            >
              <div className="notif-toast-header">
                <div className="notif-toast-type">
                  <span>{cfg.icon}</span>
                  <span style={{ color: cfg.color, fontWeight: 700, fontSize: 12 }}>{cfg.label}</span>
                </div>
                <button
                  className="notif-toast-close"
                  onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
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
