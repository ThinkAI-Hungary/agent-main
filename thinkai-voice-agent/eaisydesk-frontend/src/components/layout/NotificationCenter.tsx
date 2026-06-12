import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
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
  const { isAuthenticated } = useAuth();
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

  /* ── Supabase Realtime: listen for new interactions ── */
  useEffect(() => {
    if (!isAuthenticated) return;

    // Subscribe to new rows in interactions table (interaction_list is a view — realtime only works on tables)
    const interactionChannel = supabase
      .channel('notif-interactions')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'interactions' },
        async (payload) => {
          const row = payload.new as Record<string, unknown>;
          const channel = (row.type as string) || (row.channel as string) || 'Üzenet';
          const summary = (row.summary as string) || (row.topic as string) || `Új ${channel} érkezett`;
          const alertTags = (row.alert_tags as string[]) || [];
          const isUrgent = alertTags.includes('urgent');
          const sessionId = (row.session_id as string) || '';

          // Resolve client name: interactions table doesn't have participant field
          // Try 1: look up session by session_id
          let clientName = 'Ismeretlen';
          if (sessionId) {
            try {
              const { data: sessionData } = await supabase
                .from('sessions')
                .select('participant')
                .eq('session_id', sessionId)
                .maybeSingle();
              if (sessionData?.participant) {
                clientName = sessionData.participant;
              }
            } catch { /* session lookup may fail */ }

            // Try 2: extract messenger/platform ID from session_id and look up in clients
            if (clientName === 'Ismeretlen') {
              let platformId = '';
              let idField = 'messenger_id';
              if (sessionId.startsWith('messenger_')) { platformId = sessionId.substring(10); idField = 'messenger_id'; }
              else if (sessionId.startsWith('instagram_')) { platformId = sessionId.substring(10); idField = 'instagram_id'; }
              else if (sessionId.startsWith('whatsapp_')) { platformId = sessionId.substring(9); idField = 'whatsapp_id'; }
              else if (sessionId.startsWith('email_')) clientName = sessionId.substring(6); // email address

              if (platformId) {
                try {
                  const { data: clients } = await supabase
                    .from('clients')
                    .select('name, custom_data')
                    .limit(200);
                  const match = (clients || []).find((c: Record<string, unknown>) => {
                    const cd = typeof c.custom_data === 'string' ? JSON.parse(c.custom_data) : (c.custom_data || {});
                    return String(cd[idField] || cd.messenger_id || '') === platformId;
                  });
                  if (match) {
                    const cd = typeof match.custom_data === 'string' ? JSON.parse(match.custom_data) : (match.custom_data || {});
                    clientName = cd.name || cd.nev || match.name || clientName;
                  }
                } catch { /* client lookup may fail */ }
              }
            }
          }

          if (isUrgent) {
            addNotification('urgent', {
              name: clientName,
              channel,
              problem: 'Sürgős megkeresés beérkezett.',
            });
            urgentAudio.current?.play().catch(() => {});
          } else {
            addNotification('interaction', {
              client: clientName,
              channel,
              summary,
            });
          }
        }
      )
      .subscribe();

    // Subscribe to cancelled appointments (calendar_events with status change)
    const calendarChannel = supabase
      .channel('notif-calendar')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calendar_events' },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const old = payload.old as Record<string, unknown>;
          // Detect cancellation: status changed to cancelled/lemondva
          const newStatus = ((row.status as string) || '').toLowerCase();
          const oldStatus = ((old.status as string) || '').toLowerCase();
          if (newStatus !== oldStatus && (newStatus.includes('cancel') || newStatus.includes('lemondva') || newStatus.includes('törölve'))) {
            addNotification('cancelled', {
              name: (row.title as string) || (row.patient_name as string) || 'Ismeretlen',
              summary: 'Időpont lemondva',
            });
          }
        }
      )
      .subscribe();

    // Fetch recent interactions to preload (skip notification for existing ones)
    if (!initialized.current) {
      initialized.current = true;
      supabase
        .from('interactions')
        .select('id, type, summary, topic, created_at')
        .order('created_at', { ascending: false })
        .limit(5)
        .then(() => {
          // Just mark as seen, don't create notifications for old ones
        });
    }

    return () => {
      supabase.removeChannel(interactionChannel);
      supabase.removeChannel(calendarChannel);
    };
  }, [isAuthenticated, addNotification]);

  /* ── Handle notification click ── */
  const handleClick = useCallback((notifId: number) => {
    const n = notifications.find(n => n.id === notifId);
    if (!n) return;

    // Remove from list
    setNotifications(prev => prev.filter(x => x.id !== notifId));
    setOpen(false);

    // Navigate based on type
    if (n.type === 'urgent') {
      navigate('/clients');
    } else if (n.type === 'cancelled') {
      navigate('/calendar');
    } else if (n.type === 'interaction') {
      navigate('/interactions');
    }
  }, [navigate, notifications]);

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
