/**
 * MemberDashboardPage – "Irányítópult" for member users.
 * Shows: Greeting, KPI cards (assigned clients, next appointment),
 * and a filterable todos list (calendar events, approvals, interactions).
 *
 * Ported from the monolithic admin_backup_before_split.html member-analytics-shell.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authFetch } from '../api/client';

// ── Types ───────────────────────────────────────────────────────────────────

interface Todo {
  id: string;
  type: 'calendar' | 'approval' | 'interaction';
  desc: string;
  sub: string;
  client: string;
  clientId: number | null;
  badge: string;
  badgeLabel: string;
  date: Date;
  completed: boolean;
}

type TodoFilter = 'all' | 'today' | 'overdue' | 'upcoming' | 'completed';

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseCustomData(cd: unknown): Record<string, unknown> {
  if (!cd) return {};
  if (typeof cd === 'string') { try { return JSON.parse(cd); } catch { return {}; } }
  return cd as Record<string, unknown>;
}

function isClientAssignedToMe(
  clientObj: Record<string, unknown>,
  username: string,
  fullName: string
): boolean {
  const cd = parseCustomData(clientObj.custom_data);
  const felelos = (cd.felelos || '') as string;
  return felelos === username || (!!fullName && felelos === fullName);
}

const DAYS_HU = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
const MONTHS_HU = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];

function formatGreetingDate(d: Date): string {
  return `${d.getFullYear()}. ${MONTHS_HU[d.getMonth()]} ${d.getDate()}., ${DAYS_HU[d.getDay()]}`;
}

function getCompletedStorageKey(): string {
  return 'completedTodos_' + new Date().toISOString().slice(0, 10);
}

function getCompletedIds(): string[] {
  try { return JSON.parse(localStorage.getItem(getCompletedStorageKey()) || '[]'); }
  catch { return []; }
}

function saveCompletedIds(ids: string[]) {
  localStorage.setItem(getCompletedStorageKey(), JSON.stringify(ids));
}

// ── Component ───────────────────────────────────────────────────────────────

export default function MemberDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<TodoFilter>('all');
  const [clientCount, setClientCount] = useState(0);
  const [nextAppointment, setNextAppointment] = useState<{ text: string; sub: string }>({ text: '—', sub: 'naptárban' });
  const [loading, setLoading] = useState(true);

  const username = user?.username || '';
  const fullName = user?.fullName || '';
  const firstName = fullName ? fullName.split(' ').pop() || fullName : username;
  const initials = fullName
    ? fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : username.substring(0, 2).toUpperCase();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    authFetch(`/admin/api/users/${username}/avatar`)
      .then(r => r.json())
      .then(d => { if (d.avatar_url) setAvatarUrl(d.avatar_url); })
      .catch(() => {});
  }, [username]);

  // ── Load data ─────────────────────────────────────────────────────────────

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, calRes, apRes, sRes] = await Promise.all([
        authFetch('/admin/api/clients'),
        authFetch('/admin/api/calendar'),
        authFetch('/admin/api/approvals'),
        authFetch('/admin/api/sessions/summary?limit=500'),
      ]);
      const [cData, calData, apData, sData] = await Promise.all([
        cRes.json(), calRes.json(), apRes.json(), sRes.json(),
      ]);

      const allClients: Record<string, unknown>[] = cData.clients || [];
      const now = new Date();

      // — Assigned client names/emails for filtering —
      const assignedNames = new Set<string>();
      const assignedEmails = new Set<string>();

      const myClients = allClients.filter(c => {
        const assigned = isClientAssignedToMe(c, username, fullName);
        if (assigned) {
          const cd = parseCustomData(c.custom_data);
          const name = ((cd.nev || cd.name || c.name || '') as string).toLowerCase().trim();
          const email = ((cd.email || c.email || '') as string).toLowerCase().trim();
          if (name) assignedNames.add(name);
          if (email) assignedEmails.add(email);
        }
        return assigned;
      });
      setClientCount(myClients.length);

      // — Calendar events assigned to me —
      const allEvents: Record<string, unknown>[] = calData.events || [];
      const myEvents = allEvents.filter(ev => {
        const attendee = ((ev.attendee || '') as string).toLowerCase().trim();
        const attendeeEmail = ((ev.attendee_email || '') as string).toLowerCase().trim();
        const title = ((ev.title || '') as string).toLowerCase().trim();
        if (attendeeEmail && assignedEmails.has(attendeeEmail)) return true;
        if (attendee && assignedNames.has(attendee)) return true;
        for (const name of assignedNames) { if (name && title.includes(name)) return true; }
        return false;
      });

      // — Next appointment —
      const futureEvents = myEvents
        .filter(ev => new Date(ev.start_dt as string) > now)
        .sort((a, b) => new Date(a.start_dt as string).getTime() - new Date(b.start_dt as string).getTime());
      if (futureEvents.length > 0) {
        const next = futureEvents[0];
        const nextDt = new Date(next.start_dt as string);
        setNextAppointment({
          text: nextDt.toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          sub: (next.attendee || next.title || 'naptárban') as string,
        });
      } else {
        setNextAppointment({ text: 'Nincs közelgő', sub: 'naptárban' });
      }

      // — Build todos ───────────────────────────────────────────────────────
      const newTodos: Todo[] = [];

      // a) Calendar events → todos
      myEvents.forEach(ev => {
        const evDt = new Date(ev.start_dt as string);
        newTodos.push({
          id: String(ev.id),
          type: 'calendar',
          desc: (ev.title || 'Időpont') as string,
          sub: (ev.attendee || '') as string,
          client: (ev.attendee || '') as string,
          clientId: null,
          badge: 'idopont',
          badgeLabel: 'Időpont',
          date: evDt,
          completed: ev.completed === true,
        });
      });

      // b) Pending approvals → todos
      const allApprovals: Record<string, unknown>[] = apData.approvals || [];
      const myApprovals = allApprovals.filter(a => {
        let draftData: Record<string, unknown> = {};
        try { draftData = JSON.parse((a.ai_draft_response || '{}') as string); } catch { /* */ }
        if (draftData.campaign_name) return true;
        const toName = ((draftData.to_name || '') as string).toLowerCase().trim();
        if (toName && assignedNames.has(toName)) return true;
        const toEmail = ((draftData.to_email || '') as string).toLowerCase().trim();
        if (toEmail && assignedEmails.has(toEmail)) return true;
        const sid = ((a.session_id || '') as string).toLowerCase();
        for (const email of assignedEmails) { if (email && sid.includes(email)) return true; }
        return false;
      });

      myApprovals.filter(a => a.approval_status === 'pending').forEach(ap => {
        const apDt = ap.created_at ? new Date(ap.created_at as string) : new Date();
        const deadlineDt = new Date(apDt.getTime() + 2 * 60 * 60 * 1000);
        let clientName = 'Ismeretlen';
        try {
          const draft = JSON.parse((ap.ai_draft_response || '{}') as string);
          clientName = draft.to_name || draft.sender_id || 'Ismeretlen';
        } catch { /* */ }

        newTodos.push({
          id: 'approval-' + (ap.id || Math.random()),
          type: 'approval',
          desc: 'Válasz jóváhagyása szükséges' + (ap.channel ? ` — ${ap.channel}` : ''),
          sub: clientName !== 'Ismeretlen' ? clientName : '',
          client: clientName,
          clientId: (ap.client_id || null) as number | null,
          badge: 'jovahagyas',
          badgeLabel: 'Jóváhagyás',
          date: deadlineDt,
          completed: false,
        });
      });

      // c) Session handovers → todos
      const allSessions: Record<string, unknown>[] = sData.sessions || [];
      const mySessions = allSessions.filter(s => {
        const participant = ((s.participant || s.client_name || '') as string).toLowerCase().trim();
        const sid = ((s.session_id || '') as string).toLowerCase();
        if (participant && assignedNames.has(participant)) return true;
        for (const email of assignedEmails) { if (email && sid.includes(email)) return true; }
        return false;
      });

      mySessions
        .filter(s => s.handover_reason && (s.handover_reason as string).trim() !== '')
        .slice(0, 30)
        .forEach(s => {
          const hr = ((s.handover_reason || '') as string).toLowerCase();
          const as_ = ((s.approval_status || '') as string).toLowerCase();
          let badge = 'egyeb', badgeLabel = 'Teendő';
          if (hr.includes('sürgős') || hr.includes('panasz')) { badge = 'surgos'; badgeLabel = 'Sürgős'; }
          else if (as_ === 'pending') return;
          else if (hr.includes('visszahív')) { badge = 'visszahivas'; badgeLabel = 'Visszahívás'; }
          else if (hr.includes('válasz')) { badge = 'valasz'; badgeLabel = 'Válasz'; }
          else if (hr.includes('intézked') || hr.includes('véglegesít')) { badge = 'intezked'; badgeLabel = 'Intézkedés'; }
          if (as_ === 'approved' || as_ === 'rejected') return;

          const sDt = s.started_at ? new Date(s.started_at as string) : new Date();
          let deadlineDt: Date;
          if (badge === 'surgos') deadlineDt = new Date(sDt);
          else if (badge === 'visszahivas' || badge === 'valasz') deadlineDt = new Date(sDt.getTime() + 4 * 60 * 60 * 1000);
          else deadlineDt = new Date(sDt.getTime() + 24 * 60 * 60 * 1000);

          const clientName = ((s.participant || s.client_name || 'Ismeretlen') as string);

          newTodos.push({
            id: 'session-' + (s.id || s.session_id || Math.random()),
            type: 'interaction',
            desc: (s.handover_reason || 'Interakciós teendő') as string,
            sub: (s.channel || '') as string,
            client: clientName,
            clientId: (s.client_id || null) as number | null,
            badge,
            badgeLabel,
            date: deadlineDt,
            completed: false,
          });
        });

      // Restore completed state from localStorage
      const completedIds = getCompletedIds();
      newTodos.forEach(t => {
        if (completedIds.includes(String(t.id))) t.completed = true;
      });

      // Sort: not completed first, then by date desc
      newTodos.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return b.date.getTime() - a.date.getTime();
      });

      setTodos(newTodos);
    } catch (e) {
      console.error('Member dashboard error', e);
    } finally {
      setLoading(false);
    }
  }, [username, fullName]);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  // ── Toggle todo completed ──────────────────────────────────────────────────

  const toggleTodoCompleted = useCallback((todoId: string, completed: boolean) => {
    setTodos(prev => {
      const next = prev.map(t => t.id === todoId ? { ...t, completed } : t);
      // Persist
      const ids = getCompletedIds();
      if (completed && !ids.includes(todoId)) ids.push(todoId);
      else if (!completed) {
        const idx = ids.indexOf(todoId);
        if (idx >= 0) ids.splice(idx, 1);
      }
      saveCompletedIds(ids);
      return next;
    });
  }, []);

  // ── Computed counts ────────────────────────────────────────────────────────

  const now = useMemo(() => new Date(), []);
  const todayStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);
  const todayEnd = useMemo(() => new Date(todayStart.getTime() + 86400000), [todayStart]);

  const counts = useMemo(() => {
    const today = todos.filter(t => !t.completed && t.date >= todayStart && t.date < todayEnd).length;
    const overdue = todos.filter(t => !t.completed && t.date < todayStart).length;
    const completed = todos.filter(t => t.completed).length;
    const all = todos.filter(t => !t.completed).length;
    return { today, overdue, completed, all };
  }, [todos, todayStart, todayEnd]);

  // ── Filtered todos ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    switch (filter) {
      case 'today': return todos.filter(t => !t.completed && t.date >= todayStart && t.date < todayEnd);
      case 'overdue': return todos.filter(t => t.date < todayStart && !t.completed);
      case 'upcoming': return todos.filter(t => t.date >= todayEnd && !t.completed);
      case 'completed': return todos.filter(t => t.completed);
      default: return todos;
    }
  }, [todos, filter, todayStart, todayEnd]);

  // ── Deadline formatting ────────────────────────────────────────────────────

  function formatDeadline(d: Date, completed: boolean): { text: string; cls: string } {
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (d < todayStart && !completed) {
      const daysAgo = Math.abs(diffDays);
      return { text: daysAgo === 0 ? 'Ma' : `${daysAgo} napja lejárt`, cls: 'overdue' };
    } else if (d >= todayStart && d < todayEnd) {
      return { text: 'Ma, ' + d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }), cls: 'today' };
    } else if (diffDays === 1) {
      return { text: 'Holnap, ' + d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }), cls: 'future' };
    } else {
      let text = d.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
      if (d.getHours() > 0 || d.getMinutes() > 0) {
        text += ' ' + d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
      }
      return { text, cls: 'future' };
    }
  }

  const typeIcon = (type: string) => type === 'calendar' ? '📅' : type === 'approval' ? '✉️' : '💬';

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="spinner" style={{ borderColor: '#e5e7eb', borderTopColor: '#1ceee0' }} />
      </div>
    );
  }

  return (
    <div id="member-analytics-shell" style={{ padding: '0 32px 32px' }}>
      {/* ── Greeting ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div
            id="member-avatar"
            style={{
              width: 44, height: 44, borderRadius: 6,
              background: avatarUrl ? 'transparent' : 'linear-gradient(135deg, #1ceee0, #3b82f6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 800, color: '#082432', flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : initials}
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>
              Szia, <strong>{firstName}</strong>!
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
              {formatGreetingDate(now)}
            </p>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="m-kpi-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* Assigned clients */}
        <div className="m-kpi-card">
          <div className="m-kpi-header">
            <div className="m-kpi-label">Hozzám rendelt ügyfelek</div>
            <div className="m-kpi-icon" style={{ background: 'rgba(28,238,224,0.1)' }}>
              <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
          </div>
          <div className="m-kpi-value" style={{ color: 'var(--accent)' }}>{clientCount}</div>
          <div className="m-kpi-sub">aktív ügyfél</div>
        </div>

        {/* Next appointment */}
        <div className="m-kpi-card">
          <div className="m-kpi-header">
            <div className="m-kpi-label">Következő időpont</div>
            <div className="m-kpi-icon" style={{ background: 'rgba(139,92,246,0.1)' }}>
              <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
          </div>
          <div className="m-kpi-value" style={{ fontSize: 22 }}>{nextAppointment.text}</div>
          <div className="m-kpi-sub">{nextAppointment.sub}</div>
        </div>
      </div>

      {/* ── Todos Section ─────────────────────────────────────────────────── */}
      <div className="m-card todo-section">
        <div className="todo-section-header">
          <div className="todo-section-title">
            <div className="m-card-title-icon" style={{ background: 'rgba(251,191,36,0.1)' }}>
              <svg fill="none" stroke="#f59e0b" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            Teendők
            <span className="todo-section-count">{counts.all}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as TodoFilter)}
              style={{
                padding: '6px 12px', borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)', color: 'var(--text)',
                fontSize: 12, fontWeight: 600,
              }}
            >
              <option value="all">Minden teendő</option>
              <option value="today">Mai teendők</option>
              <option value="overdue">Lejárt</option>
              <option value="upcoming">Közelgő</option>
              <option value="completed">Lezárt</option>
            </select>
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
          <div
            style={{ padding: '16px 18px', borderRadius: 6, border: '1px solid #dbeafe', background: '#eff6ff', cursor: 'pointer' }}
            onClick={() => setFilter('today')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>📋</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1e40af' }}>Mai teendők</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#1e40af' }}>{counts.today}</div>
          </div>
          <div
            style={{ padding: '16px 18px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fef2f2', cursor: 'pointer' }}
            onClick={() => setFilter('overdue')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>🔴</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#b91c1c' }}>Lejárt teendők</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#b91c1c' }}>{counts.overdue}</div>
          </div>
          <div
            style={{ padding: '16px 18px', borderRadius: 6, border: '1px solid #dcfce7', background: '#f0fdf4', cursor: 'pointer' }}
            onClick={() => setFilter('completed')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>✅</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>Lezárt teendők</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#15803d' }}>{counts.completed}</div>
          </div>
          <div
            style={{ padding: '16px 18px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer' }}
            onClick={() => setFilter('all')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>📊</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Összes teendő</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{counts.all}</div>
          </div>
        </div>

        {/* Todos table */}
        <div className="int-table-wrapper" style={{ maxHeight: 400, overflowY: 'auto' }}>
          <table className="todo-table">
            <thead>
              <tr>
                <th>✓</th>
                <th>Teendő leírása</th>
                <th>Típus</th>
                <th>Ügyfél</th>
                <th>Határidő</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="todo-empty">
                    <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {filter === 'all' ? 'Nincs teendő — szuper!' : 'Nincs ilyen teendő.'}
                  </td>
                </tr>
              ) : (
                filtered.map(t => {
                  const dl = formatDeadline(t.date, t.completed);
                  return (
                    <tr key={t.id} className={`todo-row${t.completed ? ' completed' : ''}`}>
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="todo-checkbox"
                          checked={t.completed}
                          onChange={e => toggleTodoCompleted(t.id, e.target.checked)}
                        />
                      </td>
                      <td>
                        <div className="todo-desc" title={t.desc}>
                          {typeIcon(t.type)} {t.desc}
                        </div>
                        {t.sub && <div className="todo-desc-sub">{t.sub}</div>}
                      </td>
                      <td>
                        <span className={`todo-badge ${t.badge}`}>{t.badgeLabel}</span>
                      </td>
                      <td>
                        {t.client ? (
                          <button
                            className="todo-client-btn"
                            onClick={e => { e.stopPropagation(); navigate('/clients'); }}
                            title={t.client}
                          >
                            {t.client}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td>
                        <span className={`todo-deadline ${dl.cls}`}>{dl.text}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
