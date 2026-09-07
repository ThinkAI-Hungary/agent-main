/**
 * MemberDashboardPage – "Irányítópult" a member napi teendőivel.
 *
 * Design: user által adott HTML-mockup (hero + 3 KPI-kártya + 2 szekció).
 * A dashboard SZŰRŐKÉNT működik: csak a nyitott/sürgős interakciók látszanak;
 * a pipával lezártak eltűnnek (az interakciós naplóban maradnak Lezártan).
 *
 * Szekciók:
 *  - Sürgős / lejárt: Sürgős státuszúak + minden nyitott, ami ma 00:00 ELŐTT
 *    keletkezett (24 órás válaszablak-szabály — státusz nem változik, csak
 *    a szekcióba feljebb kerül).
 *  - Nyitott teendők: az aznapi nyitott interakciók + kézi teendők.
 *
 * Minden member MINDEN interakciót lát és dolgozhat velük (felelőshozrendelés
 * nem hozzáférés-vezérlés); a jóváhagyás/küldés minden szerep számára nyitott.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../components/ui/Toast';
import { authFetch } from '../api/client';
import { useClients } from '../hooks/useClients';
import { useSessions, type SessionSummary, type SessionInteraction } from '../hooks/useSessions';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import ClientDetailView from '../components/clients/ClientDetailView';
import InteractionSummaryModal from '../components/interactions/InteractionSummaryModal';
import {
  resolveClientName,
  getRowChannel,
  parseCustomData,
  bestClientName,
} from '../helpers/clientResolvers';
import {
  detectStatusz,
  detectUgyTipus,
  detectEredmeny,
  detectTeendo,
} from '../helpers/interactionClassifiers';
import type { InteractionRow } from './InteractionsPage';
import { useTheme } from '../context/ThemeContext';

// ── Segédek ──
function pad2(n: number) { return (n < 10 ? '0' : '') + n; }

const HU_DAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
const HU_MONTHS_SHORT = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];

const CHANNEL_META: Record<string, { label: string; icon: React.ReactNode }> = {
  Telefon: { label: 'Telefon', icon: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /> },
  Email: { label: 'Email', icon: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22 6 12 13 2 6" /></> },
  WhatsApp: { label: 'WhatsApp', icon: <path d="M12 3a9 9 0 0 0-7.72 13.44L3 21l4.78-1.22A9 9 0 1 0 12 3z" /> },
  Messenger: { label: 'Messenger', icon: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /> },
  Instagram: { label: 'Instagram', icon: <><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></> },
};
const CHANNEL_ICON_FALLBACK = <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>;

function ChannelChip({ name, t }: { name: string; t: ReturnType<typeof tokens> }) {
  const meta = CHANNEL_META[name] || { label: name || 'Üzenet', icon: CHANNEL_ICON_FALLBACK };
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
      <span style={{ width: 28, height: 28, flex: 'none', borderRadius: 8, background: t.surface, border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.text2 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>{meta.icon}</svg>
      </span>
      {meta.label}
    </span>
  );
}

function StatusBadge({ value, t }: { value: string; t: ReturnType<typeof tokens> }) {
  const v = value.toLowerCase();
  const cfg = v === 'sürgős' || v === 'surgos'
    ? { bg: '#fff2f0', bd: '#ffccc7', fg: '#d9363d', dot: '#ff4d4f' }
    : v === 'nyitott'
      ? { bg: '#fffbe6', bd: '#ffe58f', fg: '#d48806', dot: '#faad14' }
      : { bg: '#f6ffed', bd: '#b6eb8f', fg: '#389e0d', dot: '#52c41a' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', border: `1px solid ${cfg.bd}`, background: cfg.bg, color: cfg.fg }}>
      <span style={{ width: 6, height: 6, borderRadius: 8, flex: 'none', background: cfg.dot }} />
      {value}
    </span>
  );
}

function TeendoText({ value, t }: { value: string; t: ReturnType<typeof tokens> }) {
  if (/nincs további teendő/i.test(value || '')) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: t.muted, fontSize: 12.5, whiteSpace: 'nowrap' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><polyline points="20 6 9 17 4 12" /></svg>
        {value}
      </span>
    );
  }
  return <span style={{ color: t.text2, fontSize: 13 }}>{value}</span>;
}

function initialsOf(name: string) {
  return (name || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// ── Mockup tokenek (világos / sötét) ──
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

export default function MemberDashboardPage() {
  const { isDark } = useTheme();
  const t = tokens(isDark);
  const { user } = useAuth();
  const { clients, clientsMap } = useClients();
  const { sessions: hookSessions, loading: loadingSessions, refetch: refetchSessions } = useSessions(300);
  const { events, loading: loadingEvents } = useCalendarEvents();
  const username = user?.username || '';
  const fullName = user?.fullName || '';
  const firstName = fullName ? fullName.split(' ').pop() || fullName : username;

  const [manualTasks, setManualTasks] = useState<Array<{ id: number; text: string; priority: string; completed: number; created_at: string; client_id: number | null }>>([]);
  const loadManualTasks = useCallback(async () => {
    try {
      const res = await authFetch('/admin/api/tasks');
      if (res.ok) {
        const d = await res.json();
        setManualTasks(Array.isArray(d.tasks) ? d.tasks : []);
      }
    } catch { /* néma */ }
  }, []);
  useEffect(() => { loadManualTasks(); }, [loadManualTasks]);

  const [summaryModalRow, setSummaryModalRow] = useState<InteractionRow | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [apptExpanded, setApptExpanded] = useState(false);

  // ── Flat interakció-sorok (minden session, felelőshozrendelés nélkül) ──
  const allRows = useMemo<InteractionRow[]>(() => {
    const rows: InteractionRow[] = [];
    hookSessions.forEach((s: SessionSummary) => {
      const sessionDate = s.started_at || '';
      const sRoom = (s.room_name || '').toLowerCase();
      if (s.interactions && s.interactions.length > 0) {
        s.interactions.forEach((r: SessionInteraction) => {
          if (r.approval_status === 'spam') return;
          const clientInfo = resolveClientName(r, { session_id: s.session_id, participant: s.participant, client_name: s.client_name }, clientsMap, clients);
          rows.push({
            date: r.created_at || sessionDate,
            channel: getRowChannel(r.type || '', sRoom, s.session_id || '', s.channel),
            client: clientInfo.name,
            clientId: clientInfo.id,
            clientStatus: clientInfo.status,
            clientCreatedAt: clientInfo.created_at,
            direction: (r.direction || 'inbound').toLowerCase() === 'outbound' ? 'Kimenő' : 'Bejövő',
            ugyTipus: detectUgyTipus(r),
            eredmeny: detectEredmeny(r),
            statusz: detectStatusz(r),
            teendo: detectTeendo(r),
            tags: [],
            type: r.type || '-',
            topic: r.topic || '-',
            summary: r.summary || '-',
            result: r.result || '',
            interactionId: r.id || null,
            sessionId: s.session_id || null,
            ai_draft_response: r.ai_draft_response || null,
            approval_status: r.approval_status || null,
          });
        });
      }
    });
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return rows;
  }, [hookSessions, clients, clientsMap]);

  // ── Kézi teendők sorokká ──
  const manualRows = useMemo<InteractionRow[]>(() => {
    return manualTasks
      .filter(task => !task.completed)
      .map(task => {
        const client = task.client_id ? clientsMap[String(task.client_id)] : undefined;
        const clientName = client ? (bestClientName(client) || client.name || 'Névtelen') : 'Névtelen';
        return {
          date: task.created_at || '',
          channel: 'Hozzáadott feladat',
          client: clientName,
          clientId: task.client_id,
          clientStatus: '',
          clientCreatedAt: '',
          direction: '',
          ugyTipus: '',
          eredmeny: '',
          statusz: task.priority === 'high' ? 'Sürgős' : 'Nyitott',
          teendo: task.text,
          tags: [] as string[],
          type: 'task',
          topic: '',
          summary: '',
          result: '',
          interactionId: null,
          sessionId: null,
          ai_draft_response: null,
          approval_status: null,
          isManual: true,
          taskId: task.id,
          taskCompleted: !!task.completed,
        } as InteractionRow & { isManual?: boolean; taskId?: number };
      });
  }, [manualTasks, clientsMap]);

  // ── 24 órás szabály: Sürgős/lejárt vs Nyitott ──
  const { urgentRows, openRows } = useMemo(() => {
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const urgent: InteractionRow[] = [];
    const open: InteractionRow[] = [];
    const consider = (r: InteractionRow) => {
      const sz = (r.statusz || '').toLowerCase();
      if (sz !== 'nyitott' && sz !== 'sürgős' && sz !== 'surgos') return; // Lezárt → kizárva
      const created = r.date ? new Date(r.date) : new Date();
      const fromBeforeToday = created < startOfToday;
      if (sz === 'sürgős' || sz === 'surgos' || fromBeforeToday) urgent.push(r);
      else open.push(r);
    };
    allRows.forEach(consider);
    manualRows.forEach(consider);
    urgent.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    open.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return { urgentRows: urgent, openRows: open };
  }, [allRows, manualRows]);

  // ── Mai időpontok (minden esemény) ──
  const todayAppts = useMemo(() => {
    const todayKey = new Date().toDateString();
    return events
      .filter(ev => ev.start_dt && new Date(ev.start_dt).toDateString() === todayKey)
      .sort((a, b) => (a.start_dt || '').localeCompare(b.start_dt || ''));
  }, [events]);

  // ── Elvégezve pipa ──
  const handleMarkDone = useCallback(async (e: React.MouseEvent, row: InteractionRow) => {
    e.stopPropagation();
    const manual = row as InteractionRow & { isManual?: boolean; taskId?: number };
    if (manual.isManual && manual.taskId) {
      try {
        const res = await authFetch(`/admin/api/tasks/${manual.taskId}/complete`, { method: 'PATCH' });
        if (!res.ok) throw new Error('task complete failed');
        showToast('Teendő elkészültnek jelölve');
        loadManualTasks();
      } catch { showToast('Hiba a teendő frissítésekor', 'error'); }
      return;
    }
    if (!row.interactionId || row.statusz === 'Lezárt') return;
    try {
      const res = await authFetch(`/admin/api/interactions/${row.interactionId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'lezárt' }),
      });
      if (!res.ok) throw new Error('close failed');
      showToast('Interakció lezárva');
      refetchSessions();
    } catch { showToast('Hiba a lezárás során', 'error'); }
  }, [loadManualTasks, refetchSessions]);

  // ── Kézi teendő szerkesztő popup (#todoEditOverlay) ──
  const [editTask, setEditTask] = useState<{ id: number; text: string } | null>(null);
  const [editTaskText, setEditTaskText] = useState('');
  const openTaskEdit = useCallback((taskId: number) => {
    const task = manualTasks.find(x => x.id === taskId);
    if (!task) return;
    setEditTask({ id: task.id, text: task.text || '' });
    setEditTaskText(task.text || '');
  }, [manualTasks]);
  const saveTaskEdit = useCallback(async () => {
    if (!editTask) return;
    const text = editTaskText.trim();
    if (!text) { showToast('A teendő szövege kötelező!', 'error'); return; }
    try {
      const res = await authFetch(`/admin/api/tasks/${editTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('save failed');
      setEditTask(null);
      await loadManualTasks();
      showToast('Teendő mentve');
    } catch { showToast('Hiba a mentéskor', 'error'); }
  }, [editTask, editTaskText, loadManualTasks]);
  const deleteTaskEdit = useCallback(async () => {
    if (!editTask) return;
    try {
      const res = await authFetch(`/admin/api/tasks/${editTask.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setEditTask(null);
      await loadManualTasks();
      showToast('Teendő törölve');
    } catch { showToast('Hiba a törléskor', 'error'); }
  }, [editTask, loadManualTasks]);
  // Escape zárja a szerkesztő popupot
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && editTask) setEditTask(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editTask]);

  // ── Profil megnyitás ügyfélnévre kattintva ──

  // ── Design tokenek ──
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: t.muted, letterSpacing: '0.02em', paddingLeft: 2, marginBottom: 5 };
  const sectionTitleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: t.fg };
  const sectionCountStyle: React.CSSProperties = { color: t.muted, fontWeight: 500, marginLeft: 6, fontVariantNumeric: 'tabular-nums' };
  const tableCardStyle: React.CSSProperties = { marginTop: 8, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, overflow: 'hidden' };
  const thStyle: React.CSSProperties = { textAlign: 'left', background: t.surface, padding: '0 16px', height: 40, borderBottom: `1px solid ${t.border}`, fontSize: 11.5, fontWeight: 500, color: t.text2 };
  const tdBase: React.CSSProperties = { padding: '11px 14px', borderBottom: `1px solid ${t.border}`, verticalAlign: 'middle', fontSize: 13, whiteSpace: 'nowrap' };
  const emptyStyle: React.CSSProperties = { padding: '22px 14px', textAlign: 'center', color: t.muted, fontSize: 12.5 };

  const contactOf = (row: InteractionRow) => {
    const c = row.clientId ? clientsMap[String(row.clientId)] : undefined;
    if (!c) return '';
    const cd = parseCustomData(c.custom_data);
    return (cd?.email as string) || c.email || (cd?.telefonszam as string) || (cd?.phone as string) || c.phone || '';
  };

  const renderTaskTable = (rows: InteractionRow[], showCheckbox: boolean) => {
    if (rows.length === 0) {
      return <div style={tableCardStyle}><div style={emptyStyle}>Nincs teendő.</div></div>;
    }
    return (
      <div style={tableCardStyle}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={thStyle}>Ügyfél</th>
                <th style={thStyle}>Interakció időpontja</th>
                <th style={thStyle}>Csatorna</th>
                <th style={thStyle}>Irány</th>
                <th style={thStyle}>Ügytípus</th>
                <th style={thStyle}>Eredmény</th>
                <th style={thStyle}>Státusz</th>
                <th style={thStyle}>Teendő</th>
                {showCheckbox && <th style={{ ...thStyle, width: 70 }}>Elvégezve</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const created = r.date ? new Date(r.date) : null;
                const dateLabel = created
                  ? `${created.toDateString() === new Date().toDateString() ? 'Ma' : `${HU_MONTHS_SHORT[created.getMonth()]} ${created.getDate()}.`} · ${pad2(created.getHours())}:${pad2(created.getMinutes())}`
                  : '—';
                const manualRow = r as InteractionRow & { isManual?: boolean; taskId?: number };
                const isManualRow = !!manualRow.isManual && !!manualRow.taskId;
                const contact = contactOf(r);
                const clientIdStr = r.clientId ? String(r.clientId) : null;
                return (
                  <tr
                    key={`${r.interactionId ?? 'task'}-${r.sessionId ?? ''}-${i}`}
                    className={isManualRow ? 'row-task' : undefined}
                    tabIndex={isManualRow ? 0 : undefined}
                    style={{ cursor: 'pointer' }}
                    onClick={() => isManualRow && manualRow.taskId ? openTaskEdit(manualRow.taskId) : setSummaryModalRow(r)}
                    onKeyDown={e => { if (isManualRow && manualRow.taskId && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openTaskEdit(manualRow.taskId); } }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = t.surface; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <td style={tdBase}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: `color-mix(in srgb, ${t.accent2} 12%, ${t.bg})`, border: `1px solid color-mix(in srgb, ${t.accent2} 30%, ${t.border})`, color: t.accent2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
                          {initialsOf(r.client)}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span
                            onClick={e => { if (clientIdStr) { e.stopPropagation(); setSelectedClientId(clientIdStr); } }}
                            style={{ display: 'block', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: clientIdStr ? 'pointer' : 'default' }}
                            onMouseEnter={e => { if (clientIdStr) (e.currentTarget as HTMLElement).style.color = t.accent2; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = ''; }}
                          >
                            {r.client}
                          </span>
                          <span style={{ display: 'block', fontSize: 12, color: t.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contact}</span>
                        </span>
                      </span>
                    </td>
                    <td style={{ ...tdBase, fontVariantNumeric: 'tabular-nums', color: t.text2 }}>{dateLabel}</td>
                    <td style={tdBase}><ChannelChip name={r.channel} t={t} /></td>
                    <td style={tdBase}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 8, fontSize: 11.5, fontWeight: 500, border: `1px solid ${t.border}`, whiteSpace: 'nowrap', background: r.direction === 'Kimenő' ? `color-mix(in srgb, ${t.accent2} 10%, ${t.bg})` : 'transparent', color: r.direction === 'Kimenő' ? t.accent2 : t.text2 }}>
                        {r.direction || 'Bejövő'}
                      </span>
                    </td>
                    <td style={tdBase}>{r.ugyTipus || '—'}</td>
                    <td style={{ ...tdBase, color: t.text2 }}>{r.eredmeny || '—'}</td>
                    <td style={tdBase}><StatusBadge value={r.statusz} t={t} /></td>
                    <td style={tdBase}>
                      {isManualRow ? (
                        <div className="todo-frame" title={r.teendo}>{r.teendo}</div>
                      ) : (
                        <TeendoText value={r.teendo} t={t} />
                      )}
                    </td>
                    {showCheckbox && (
                      <td style={{ ...tdBase, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="done-check"
                          aria-label="Elvégezve"
                          title="Kipipálásra az interakció lezártra vált"
                          style={{ width: 16, height: 16, accentColor: t.accent2, cursor: 'pointer' }}
                          onClick={e => handleMarkDone(e, r)}
                          onChange={() => {}}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Profil overlay (ügyfélnévre kattintva) ──
  if (selectedClientId) {
    const clientRaw = clientsMap[String(selectedClientId)];
    if (clientRaw) {
      const cd = parseCustomData(clientRaw.custom_data);
      const enriched = {
        id: clientRaw.id,
        name: bestClientName(clientRaw) || clientRaw.name || 'Névtelen',
        email: (cd?.email as string) || clientRaw.email || '',
        phone: (cd?.telefonszam as string) || (cd?.phone as string) || clientRaw.phone || '',
        status: clientRaw.status || '',
        created_at: clientRaw.created_at || '',
        tags: (cd?.tags as string[]) || [],
        assignee: (cd?.assigned_to as string) || '',
        lastInteraction: '',
        appointmentCount: 0,
        isNew: true,
        isInactive: false,
        raw: clientRaw,
      };
      return (
        <ClientDetailView
          client={enriched}
          clientsMap={clientsMap}
          sessions={hookSessions}
          events={events}
          source="member"
          onBack={() => setSelectedClientId(null)}
          onRefresh={refetchSessions}
        />
      );
    }
  }

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 10 ? 'Jó reggelt' : hour < 18 ? 'Jó napot' : 'Jó estét';
  const todayLabel = `${HU_DAYS[now.getDay()]}, ${now.getFullYear()}. ${HU_MONTHS_SHORT[now.getMonth()]} ${now.getDate()}.`;

  const kpiIc = (kind: 'err' | 'warn' | 'info' | 'cal'): React.CSSProperties => {
    if (kind === 'err') return { background: '#fff2f0', color: '#ff4d4f', border: '1px solid #ffccc7' };
    if (kind === 'warn') return { background: '#fffbe6', color: '#faad14', border: '1px solid #ffe58f' };
    if (kind === 'cal') return { background: `color-mix(in srgb, ${t.accent2} 10%, ${t.bg})`, color: t.accent2, border: `1px solid color-mix(in srgb, ${t.accent2} 30%, ${t.border})` };
    return { background: '#ebfffa', color: '#00767a', border: '1px solid #99ffee' };
  };

  return (
    <div className="page active">
      {/* ── Hero ── */}
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 12, color: t.muted, marginBottom: 4 }}>
            Áttekintés <b style={{ color: t.fg, fontWeight: 600 }}>/ Irányítópult</b>
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.25, color: t.fg }}>Irányítópult</h1>
        </div>
      </header>

      <section style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', background: `color-mix(in srgb, ${t.accent} 22%, ${t.bg})`, border: `1px solid color-mix(in srgb, ${t.accent} 40%, ${t.border})`, borderRadius: 8, padding: '18px 20px', marginTop: 14 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', color: t.fg }}>{greeting}{firstName ? `, ${firstName.split(' ')[0]}!` : '!'}</h2>
          <p style={{ marginTop: 4, fontSize: 13, color: t.text2 }}>Íme a mai áttekintésed.</p>
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: t.accent2, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          {todayLabel}
        </span>
      </section>

      {/* ── KPI-kártyák ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 14 }}>
        <article style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ ...kpiIc('err'), width: 40, height: 40, flex: 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ width: 19, height: 19 }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
          </span>
          <span>
            <span style={{ display: 'block', fontSize: 26, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em', color: t.fg }}>{urgentRows.length}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: t.muted, fontWeight: 500, marginTop: 3 }}>Sürgős / lejárt teendő</span>
          </span>
        </article>
        <article style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ ...kpiIc('info'), width: 40, height: 40, flex: 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ width: 19, height: 19 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </span>
          <span>
            <span style={{ display: 'block', fontSize: 26, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em', color: t.fg }}>{openRows.length}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: t.muted, fontWeight: 500, marginTop: 3 }}>Nyitott teendő</span>
          </span>
        </article>
        <article style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: 16, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span style={{ ...kpiIc('cal'), width: 40, height: 40, flex: 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ width: 19, height: 19 }}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12.5, color: t.muted, fontWeight: 500 }}>Mai időpontok</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: t.fg, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: '1px 8px', fontVariantNumeric: 'tabular-nums' }}>{todayAppts.length}</span>
            </div>
            {todayAppts.length === 0 ? (
              <div style={{ marginTop: 8, padding: '9px 12px', border: `1px solid ${t.border}`, background: t.surface, borderRadius: 8, fontSize: 13, color: t.muted }}>Ma nincs időpont</div>
            ) : (
              <>
                <button
                  onClick={() => setApptExpanded(v => !v)}
                  aria-expanded={apptExpanded}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: `1px solid ${t.border}`, background: t.surface, borderRadius: 8, padding: '9px 12px', cursor: 'pointer', color: t.fg, marginTop: 8, fontFamily: 'inherit' }}
                >
                  <span style={{ fontSize: 18, fontWeight: 600, color: t.accent2, fontVariantNumeric: 'tabular-nums', lineHeight: 1, flex: 'none' }}>
                    {(() => { const d = new Date(todayAppts[0].start_dt ?? Date.now()); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; })()}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{todayAppts[0].attendee || '—'}</b>
                    <span style={{ display: 'block', fontSize: 12, color: t.muted, marginTop: 1 }}>{todayAppts[0].title || ''}</span>
                  </span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, marginLeft: 'auto', color: t.muted, transition: 'transform .15s', flex: 'none', transform: apptExpanded ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                {apptExpanded && todayAppts.length > 1 && (
                  <div style={{ marginTop: 8, padding: '2px 12px', border: `1px solid ${t.border}`, borderRadius: 8 }}>
                    {todayAppts.slice(1).map(ev => {
                      const d = new Date(ev.start_dt ?? Date.now());
                      return (
                        <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', fontSize: 12.5, borderBottom: `1px solid ${t.border}` }}>
                          <span style={{ minWidth: 40, fontWeight: 600, color: t.accent2, fontVariantNumeric: 'tabular-nums' }}>{pad2(d.getHours())}:{pad2(d.getMinutes())}</span>
                          <span style={{ color: t.fg, fontWeight: 500 }}>{ev.attendee || '—'}</span>
                          <span style={{ color: t.muted, marginLeft: 'auto', whiteSpace: 'nowrap', textAlign: 'right' }}>{ev.title || ''}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </article>
      </div>

      {/* ── Sürgős / lejárt teendők ── */}
      <section style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <h3 style={{ ...sectionTitleStyle }}>Sürgős / lejárt teendők<span style={sectionCountStyle}>{urgentRows.length}</span></h3>
        </div>
        {renderTaskTable(urgentRows, true)}
      </section>

      {/* ── Nyitott teendők ── */}
      <section style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <h3 style={{ ...sectionTitleStyle }}>Nyitott teendők<span style={sectionCountStyle}>{openRows.length}</span></h3>
        </div>
        {renderTaskTable(openRows, true)}
      </section>

      {/* ── Kézi teendő szerkesztő popup (#todoEditOverlay) ── */}
      {editTask && (
        <div className="modal-overlay" id="todoEditOverlay" onClick={() => setEditTask(null)}>
          <div className="cd-task-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Teendő szerkesztése">
            <div className="cd-task-modal-head">
              <h3 className="modal-title">Teendő szerkesztése</h3>
              <button className="cd-task-modal-x" onClick={() => setEditTask(null)} aria-label="Bezárás">
                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="cd-task-modal-body">
              <label className="cd-task-modal-label" htmlFor="mdTaskEditText">Teendő leírása</label>
              <textarea
                id="mdTaskEditText"
                className="cd-task-textarea"
                rows={4}
                value={editTaskText}
                onChange={e => setEditTaskText(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveTaskEdit(); }}
              />
            </div>
            <div className="cd-task-modal-foot">
              <button className="cd-btn cd-btn-danger" style={{ marginRight: 'auto' }} onClick={deleteTaskEdit}>
                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                Törlés
              </button>
              <button className="cd-btn" onClick={() => setEditTask(null)}>Mégse</button>
              <button className="cd-btn cd-btn-primary" onClick={saveTaskEdit} disabled={!editTaskText.trim()}>Mentés</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Interakciós modal ── */}
      {summaryModalRow && (
        <InteractionSummaryModal
          row={summaryModalRow}
          onClose={() => setSummaryModalRow(null)}
          clients={clients}
          clientsMap={clientsMap}
          onClientClick={cid => { setSummaryModalRow(null); setSelectedClientId(cid); }}
          autoExpandApproval
          onApproved={refetchSessions}
        />
      )}
    </div>
  );
}
