import { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { isUnread, markInteractionRead } from '../../helpers/unreadInteractions';
import { detectUgyTipus, detectStatusz } from '../../helpers/interactionClassifiers';
import { getRowChannel } from '../../helpers/clientResolvers';
import './NotificationCenter.css';

/* ── Types ──────────────────────────────────────────────────── */

interface UnreadItem {
  id: number;
  sessionId: string;
  clientName: string;
  channel: string;
  ugyTipus: string;
  statusz: string;
  time: string;
  isUrgent: boolean;
}

/* ── Csatorna-ikonok (kit 07 — tile + ikon, a popup listacsetével azonos) ── */

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  Telefon: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
  Email: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22 6 12 13 2 6" /></>,
  WhatsApp: <path d="M12 3a9 9 0 0 0-7.72 13.44L3 21l4.78-1.22A9 9 0 1 0 12 3z" />,
  Messenger: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />,
  Instagram: <><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></>,
};

function pad2(n: number) { return (n < 10 ? '0' : '') + n; }

function itemTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  return d.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
}

function statusDotColor(statusz: string): string {
  if (statusz === 'Sürgős' || statusz === 'SÜRGŐS') return '#ef4444';
  if (statusz === 'Lezárt' || statusz === 'LEZÁRT') return '#22c55e';
  return '#f59e0b'; // Nyitott
}

function esc(s: string) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* ── Component ──────────────────────────────────────────────── */

export default function NotificationCenter() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<UnreadItem[]>([]);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<UnreadItem[]>([]);
  // Optimista eltűnés kattintáskor (a következő poll elveti is, mert olvasott lesz)
  const [locallyRead, setLocallyRead] = useState<Set<number>>(new Set());

  const dropdownRef = useRef<HTMLDivElement>(null);
  const urgentAudio = useRef<HTMLAudioElement | null>(null);
  const lastSeenTimeRef = useRef<string>('');
  const isFirstPollRef = useRef(true);

  useEffect(() => {
    urgentAudio.current = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts(prev => prev.slice(1)), 8000);
    return () => clearTimeout(timer);
  }, [toasts]);

  /* ── Olvasatlan bejövő interakciók (a lista az unread-dot rendszerrel szinkronban) ── */
  useEffect(() => {
    if (!isAuthenticated) return;

    async function poll() {
      try {
        const res = await authFetch('/admin/api/interactions?limit=250');
        if (!res.ok) return;
        const data = await res.json();
        const rows = data?.interactions || data;
        if (!Array.isArray(rows)) return;

        // Csak bejövő, emberi ügyfél-interakciók — automatikus kimenő üzenetek nem
        const visible = rows.filter((r: any) =>
          (r.direction || 'inbound').toLowerCase() !== 'outbound' &&
          r.tool_name !== 'outbound_notification' &&
          r.approval_status !== 'spam'
        );

        // Sürgős új beérkezésre: toast + hang (időalapú, a lastSeen mechanizmus)
        const sorted = [...visible].sort((a: any, b: any) =>
          (b.created_at || '').localeCompare(a.created_at || '')
        );
        const latestTime = sorted[0]?.created_at || '';
        if (isFirstPollRef.current) {
          isFirstPollRef.current = false;
          lastSeenTimeRef.current = localStorage.getItem('notif_lastSeenTime') || latestTime;
          if (!localStorage.getItem('notif_lastSeenTime')) {
            localStorage.setItem('notif_lastSeenTime', latestTime);
          }
        }
        if (latestTime > lastSeenTimeRef.current) {
          const fresh = visible.filter((r: any) => (r.created_at || '') > lastSeenTimeRef.current);
          for (const r of fresh) {
            const tags = r.alert_tags || [];
            const urgent = Array.isArray(tags)
              ? tags.includes('urgent')
              : String(tags).includes('urgent');
            if (urgent) {
              const item = toItem(r);
              setToasts(prev => [...prev.slice(-3), item]);
              urgentAudio.current?.play().catch(() => {});
            }
          }
          lastSeenTimeRef.current = latestTime;
          localStorage.setItem('notif_lastSeenTime', latestTime);
        }

        // Az olvasatlan bejövő interakciók — érkezési sorrend, felül a legújabb
        const unread: UnreadItem[] = sorted
          .filter((r: any) => isUnread(r.id))
          .map(toItem);
        setItems(unread);
      } catch { /* polling error */ }
    }

    function toItem(r: any): UnreadItem {
      const tags = r.alert_tags || [];
      const urgent = Array.isArray(tags)
        ? tags.includes('urgent')
        : String(tags).includes('urgent');
      return {
        id: r.id,
        sessionId: r.session_id || '',
        clientName: r.client_name || r.participant || 'Ismeretlen',
        channel: getRowChannel(r.type || '', r.room_name || '', r.session_id || ''),
        ugyTipus: detectUgyTipus(r),
        statusz: detectStatusz(r),
        time: r.created_at || '',
        isUrgent: urgent,
      };
    }

    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  /* ── Sor-kattintás: ugrás az adott interakcióra + olvasottság ── */
  const handleItemClick = useCallback((item: UnreadItem) => {
    markInteractionRead(item.id);
    setLocallyRead(prev => new Set(prev).add(item.id));
    setOpen(false);
    navigate('/interactions', {
      state: { openInteractionId: item.id, openSessionId: item.sessionId },
    });
  }, [navigate]);

  const visibleItems = items.filter(i => !locallyRead.has(i.id));
  const count = visibleItems.length;
  const nyitott = visibleItems.filter(i => i.statusz === 'Nyitott' || i.statusz === 'NYITOTT').length;
  const surgos = visibleItems.filter(i => i.statusz === 'Sürgős' || i.statusz === 'SÜRGŐS').length;

  return (
    <>
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
          {count > 0 && <span className="notif-badge">{count > 99 ? '99+' : count}</span>}
          {count > 0 && <span className="notif-bell-pulse" />}
        </button>

        {open && (
          <div className="notif-dropdown notif-dropdown--v2">
            <div className="notif-v2-header">
              <span className="notif-v2-title">Értesítések</span>
              <span className="notif-v2-counts">{nyitott} nyitott · {surgos} sürgős</span>
            </div>
            <div className="notif-v2-list">
              {visibleItems.length === 0 ? (
                <div className="notif-empty">
                  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="notif-empty-icon">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  Nincs olvasatlan értesítés.
                </div>
              ) : (
                visibleItems.slice(0, 30).map(item => {
                  const icon = CHANNEL_ICONS[item.channel];
                  return (
                    <div
                      key={item.id}
                      className="notif-v2-item"
                      onClick={() => handleItemClick(item)}
                    >
                      <span className="notif-v2-tile">
                        {icon && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                            {icon}
                          </svg>
                        )}
                      </span>
                      <span className="notif-v2-main">
                        <span className="notif-v2-name">{esc(item.clientName)}</span>
                        <span className="notif-v2-meta">{esc(item.channel)} · {esc(item.ugyTipus)}</span>
                      </span>
                      <span className="notif-v2-right">
                        <span
                          className="notif-v2-dot"
                          style={{ background: statusDotColor(item.statusz) }}
                          title={item.statusz}
                        />
                        <span className="notif-v2-time">{itemTimeLabel(item.time)}</span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <button
              className="notif-v2-footer"
              onClick={() => { setOpen(false); navigate('/interactions'); }}
            >
              Az interakciós listához <span aria-hidden="true">&gt;</span>
            </button>
          </div>
        )}
      </div>

      {/* Sürgős toastok (új sürgős beérkezésre) */}
      <div className="notif-toast-container">
        {toasts.map(t => (
          <div
            key={t.id}
            className="notif-toast"
            style={{ borderLeftColor: '#ef4444', cursor: 'pointer' }}
            onClick={() => {
              handleItemClick(t);
              setToasts(prev => prev.filter(x => x.id !== t.id));
            }}
          >
            <div className="notif-toast-header">
              <div className="notif-toast-type">
                <span>🔴</span>
                <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 12 }}>Sürgős</span>
              </div>
              <button
                className="notif-toast-close"
                onClick={(e) => { e.stopPropagation(); setToasts(prev => prev.filter(x => x.id !== t.id)); }}
              >
                ×
              </button>
            </div>
            <div className="notif-toast-body">
              <span className="notif-toast-name">{esc(t.clientName)}</span>
              <span className="notif-toast-channel">{esc(t.channel)}</span>
            </div>
            <div className="notif-toast-detail">{esc(t.channel)} · {esc(t.ugyTipus)} — új sürgős beérkezés</div>
          </div>
        ))}
      </div>
    </>
  );
}
