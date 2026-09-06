/**
 * CalendarPage – Naptár (UI Kit) — saját renderelés: nap / hét / hónap + listanézet.
 * Esemény kattintás → ügyfélprofil. Múltbeli esemény: no-show jelölés.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useClients } from '../hooks/useClients';
import { useSessions } from '../hooks/useSessions';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { parseCustomData, isAssignedToMe, bestClientName } from '../helpers/clientResolvers';
import { CalendarSkeleton } from '../components/ui/Skeleton';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { showToast } from '../components/ui/Toast';
import { authFetch } from '../api/client';
import ClientDetailView from '../components/clients/ClientDetailView';

const HU_MONTHS = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];
const WD_SHORT = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];
const WD_FULL = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
const CAL_DAY_START = 7;
const CAL_DAY_END = 21;
const CAL_HOUR_PX = 48;

type CalMode = 'day' | 'week' | 'month';

interface CalendarEventItem {
  id: number;
  title: string;
  start_dt: string;
  duration_minutes?: number;
  attendee?: string;
  attendee_email?: string;
  reminder_sent?: boolean;
  doctor?: string; // {{munkatárs}} — calendar_events.doctor
}

function pad2(n: number) { return (n < 10 ? '0' : '') + n; }
function dateKey(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function startOfWeek(d: Date) {
  const r = new Date(d.getTime()); const day = r.getDay();
  r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day)); r.setHours(0, 0, 0, 0);
  return r;
}

export default function CalendarPage() {
  const isMobile = useIsMobile(768);
  const { user, isAdmin } = useAuth();
  const { events, loading, refetch: refetchEvents } = useCalendarEvents();
  const { clients, clientsMap } = useClients();
  const { sessions } = useSessions(500);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [calMode, setCalMode] = useState<'day' | 'week' | 'month'>('week');
  const [calCursor, setCalCursor] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const { confirm, ConfirmDialog } = useConfirm();
  const [showNewEventModal, setShowNewEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  // Tooltip állapot (hét nézet: teljes kártyaadatok hoverre)
  const [eventTip, setEventTip] = useState<{ ev: CalendarEventItem; x: number; y: number } | null>(null);

  const [newEvent, setNewEvent] = useState({
    attendee: '', email: '', phone: '', title: '', assigned_to: '',
    date: new Date().toISOString().split('T')[0], time: '09:00', duration: '30',
  });
  // Munkatárs-opciók (foglalási szabályok: services.assigned_to névsor)
  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  // Ügyfélprofil „Következő időpont" ceruza → naptár bejegyzés szerkesztése
  const location = useLocation();
  const handledEditIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/admin/api/services');
        const data = await res.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data?.services) ? data.services : []);
        // A Kolléga mező vesszővel elválasztott névlista — egyedi nevekre bontjuk,
        // a "minden fogorvos" jellegű szabad szövegeket kiszűrjük
        const names = new Set<string>();
        list.forEach((s: { assigned_to?: string }) => {
          (s.assigned_to || '').split(',').forEach(part => {
            const n = part.trim();
            if (!n || /^minden\b/i.test(n)) return;
            names.add(n);
          });
        });
        setStaffOptions(Array.from(names).sort((a, b) => a.localeCompare(b, 'hu')));
      } catch { /* ignore */ }
    })();
  }, []);

  // Ügyfélprofilból ide navigált szerkesztés: state.editEventId -> popup nyitás
  useEffect(() => {
    const st = (location.state as { editEventId?: number } | null)?.editEventId;
    if (!st || handledEditIds.current.has(st) || !events.length) return;
    const ev = (events as CalendarEventItem[]).find(e => e.id === st);
    if (ev) {
      handledEditIds.current.add(st);
      openEventEdit(ev);
    }
  }, [location.state, events]);

  // Member filtering: nem adminok csak a hozzájuk rendelt ügyfelek eseményeit látják
  const myEvents = useMemo(() => {
    if (isAdmin) return events as CalendarEventItem[];
    const username = user?.username || '';
    const fullName = user?.fullName || '';
    const assignedNames = new Set<string>();
    const assignedEmails = new Set<string>();
    clients.forEach(c => {
      if (isAssignedToMe(c, username, fullName)) {
        const cd = parseCustomData(c.custom_data);
        const name = ((cd.nev || cd.name || c.name || '') as string).toLowerCase().trim();
        const email = ((cd.email || c.email || '') as string).toLowerCase().trim();
        if (name) assignedNames.add(name);
        if (email) assignedEmails.add(email);
      }
    });
    return (events as CalendarEventItem[]).filter(ev => {
      const evName = (ev.attendee || '').toLowerCase().trim();
      const evEmail = (ev.attendee_email || '').toLowerCase().trim();
      if (evEmail && assignedEmails.has(evEmail)) return true;
      if (evName && assignedNames.has(evName)) return true;
      return false;
    });
  }, [events, clients, isAdmin, user]);

  // ── Események dátum szerint csoportosítva ──
  const eventsByDate = useMemo(() => {
    const m: Record<string, CalendarEventItem[]> = {};
    myEvents.forEach(ev => {
      if (!ev.start_dt) return;
      const k = dateKey(new Date(ev.start_dt));
      (m[k] = m[k] || []).push(ev);
    });
    Object.values(m).forEach(list => list.sort((a, b) => (a.start_dt || '').localeCompare(b.start_dt || '')));
    return m;
  }, [myEvents]);

  // ── Kolléga (ügyfél felelőse) + Ügyfélstátusz badge az email címhez ──
  const clientInfoByEmail = useMemo(() => {
    const m: Record<string, { assignee: string }> = {};
    clients.forEach(c => {
      const cd = parseCustomData(c.custom_data);
      const email = ((cd.email || c.email || '') as string).toLowerCase().trim();
      if (!email) return;
      m[email] = { assignee: ((cd.assigned_to || cd.felelos || '') as string).trim() };
    });
    return m;
  }, [clients]);

  const assigneeFor = useCallback((email: string) => {
    return clientInfoByEmail[email.toLowerCase().trim()]?.assignee || '';
  }, [clientInfoByEmail]);

  const pastEventCountByEmail = useMemo(() => {
    const m: Record<string, number> = {};
    const nowMs = Date.now();
    myEvents.forEach(ev => {
      const email = (ev.attendee_email || '').toLowerCase().trim();
      if (!email) return;
      if (new Date(ev.start_dt || '').getTime() < nowMs) m[email] = (m[email] || 0) + 1;
    });
    return m;
  }, [myEvents]);

  const clientBadgeFor = useCallback((email: string) => {
    const past = pastEventCountByEmail[email.toLowerCase().trim()] || 0;
    return past > 1 ? 'Visszatérő ügyfél' : 'Új ügyfél';
  }, [pastEventCountByEmail]);

  // ── Navigáció ──
  const calNav = useCallback((dir: number) => {
    setCalCursor(prev => {
      const d = new Date(prev.getTime());
      if (calMode === 'day') d.setDate(d.getDate() + dir);
      else if (calMode === 'week') d.setDate(d.getDate() + dir * 7);
      else d.setMonth(d.getMonth() + dir);
      return d;
    });
  }, [calMode]);

  const goToday = useCallback(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); setCalCursor(d);
  }, []);

  function calTitleText(): string {
    const y = calCursor.getFullYear();
    if (calMode === 'day') {
      return `${y}. ${HU_MONTHS[calCursor.getMonth()]} ${calCursor.getDate()}. · ${WD_FULL[calCursor.getDay()]}`;
    }
    if (calMode === 'week') {
      const s = startOfWeek(calCursor);
      const e = new Date(s.getTime()); e.setDate(s.getDate() + 6);
      const sTxt = `${HU_MONTHS[s.getMonth()]} ${s.getDate()}.`;
      const eTxt = (s.getMonth() === e.getMonth() ? `${e.getDate()}.` : `${HU_MONTHS[e.getMonth()]} ${e.getDate()}.`) + ` ${y}.`;
      return `${sTxt} – ${eTxt}`;
    }
    return `${y}. ${HU_MONTHS[calCursor.getMonth()]}`;
  }

  // ── Esemény-kártya (hónap/nap) ──
  function renderEv(ev: CalendarEventItem, compact: boolean) {
    const t = new Date(ev.start_dt);
    return (
      <div className={`cal-ev${compact ? ' cal-ev-xs' : ''}`} onClick={e => { e.stopPropagation(); openEventEdit(ev); }}>
        <span className="cal-ev-time">{pad2(t.getHours())}:{pad2(t.getMinutes())}</span>
        <span className="cal-ev-title">{ev.title}</span>
        {!compact && <span className="cal-ev-name">{ev.attendee || ''}</span>}
      </div>
    );
  }

  // ── NAP nézet ──
  function renderDay() {
    const key = dateKey(calCursor);
    const day = eventsByDate[key] || [];
    const rows: React.ReactNode[] = [];
    for (let h = CAL_DAY_START; h <= CAL_DAY_END; h++) {
      const evs = day.filter(ev => new Date(ev.start_dt).getHours() === h);
      rows.push(
        <div key={h} className="cal-day-row">
          <div className="cal-day-time">{pad2(h)}:00</div>
          <div className="cal-day-events">{evs.map(ev => renderEv(ev, false))}</div>
        </div>
      );
    }
    return <div className="cal-day-wrap">{rows}</div>;
  }

  // ── HÉT nézet ──
  function renderWeek() {
    const start = startOfWeek(calCursor);
    const todayKey = dateKey(new Date());
    const head: React.ReactNode[] = [
      // Sarok-cella az óra-oszlop fölé — enélkül a hétfő fejléce az órák
      // oszlopába csúszik és az egész napsáv balra tolódik (hot fix)
      <div key="corner" className="cal-week-corner" />,
    ];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getTime()); d.setDate(start.getDate() + i);
      const isToday = dateKey(d) === todayKey;
      head.push(
        <div key={i} className={`cal-wh${isToday ? ' is-today' : ''}`}>
          <span className="d-wd">{WD_SHORT[i]}</span>
          <span className="d-num">{d.getDate()}</span>
        </div>
      );
    }
    const gutter: React.ReactNode[] = [];
    for (let h = CAL_DAY_START; h <= CAL_DAY_END; h++) {
      gutter.push(<div key={h} className="cal-hr"><span>{pad2(h)}:00</span></div>);
    }
    const cols: React.ReactNode[] = [];
    for (let j = 0; j < 7; j++) {
      const d = new Date(start.getTime()); d.setDate(start.getDate() + j);
      const key = dateKey(d);
      const isToday = key === todayKey;
      const day = (eventsByDate[key] || []).slice().sort((a, b) => (a.start_dt || '').localeCompare(b.start_dt || ''));
      const slots: React.ReactNode[] = [];
      for (let h = CAL_DAY_START; h <= CAL_DAY_END; h++) slots.push(<div key={h} className="cal-wslot" />);
      const evs = day.map(ev => {
        const t = new Date(ev.start_dt);
        const startMin = (t.getHours() - CAL_DAY_START) * 60 + t.getMinutes();
        const top = (startMin / 60) * CAL_HOUR_PX;
        const dur = ev.duration_minutes || 30;
        const hpx = Math.max(22, (dur / 60) * CAL_HOUR_PX);
        const emailKey = (ev.attendee_email || '').toLowerCase().trim();
        const staff = ev.doctor || assigneeFor(emailKey);
        return (
          <div
            key={ev.id}
            className={`cal-ev-abs${hpx < 28 ? ' cal-ev-xs' : hpx < 44 ? ' cal-ev-sm' : ''}`}
            style={{ top: Math.round(top), height: Math.round(hpx) }}
            onClick={e => { e.stopPropagation(); openEventEdit(ev); }}
            onMouseEnter={e => showEventTip(ev, e.currentTarget)}
            onMouseLeave={hideEventTip}
          >
            <span className="cal-ev-time">{pad2(t.getHours())}:{pad2(t.getMinutes())}</span>
            <span className="cal-ev-name">{ev.attendee || ''}</span>
            <span className="cal-ev-title">{ev.title}</span>
          </div>
        );
      });
      cols.push(<div key={j} className={`cal-wcol${isToday ? ' is-today' : ''}`}>{slots}{evs}</div>);
    }
    return (
      <div className="cal-week">
        <div className="cal-week-head">{head}</div>
        <div className="cal-week-body">
          <div className="cal-week-gutter">{gutter}</div>
          {cols}
        </div>
      </div>
    );
  }

  // ── HÓNAP nézet ──
  function renderMonth() {
    const first = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1);
    const start = startOfWeek(first);
    const todayKey = dateKey(new Date());
    const head: React.ReactNode[] = [];
    for (let i = 0; i < 7; i++) head.push(<div key={i} className="cal-wd">{WD_SHORT[i]}</div>);
    const cells: React.ReactNode[] = [];
    for (let w = 0; w < 6; w++) {
      for (let j = 0; j < 7; j++) {
        const d = new Date(start.getTime()); d.setDate(start.getDate() + (w * 7 + j));
        const key = dateKey(d);
        const inMonth = d.getMonth() === calCursor.getMonth();
        const isToday = key === todayKey;
        const day = eventsByDate[key] || [];
        const evHtml = day.slice(0, 2).map(ev => {
          const t = new Date(ev.start_dt);
          return (
            <div key={ev.id} className="cal-ev" onClick={e => { e.stopPropagation(); openEventEdit(ev); }}>
              <span className="cal-ev-time">{pad2(t.getHours())}:{pad2(t.getMinutes())}</span>
              <span className="cal-ev-title">{ev.title}</span>
            </div>
          );
        });
        cells.push(
          <div key={key + `${w}-${j}`} className={`cal-mcell${!inMonth ? ' is-out' : ''}${isToday ? ' is-today' : ''}`}>
            <span className="d-num">{d.getDate()}</span>
            {evHtml}
            {day.length > 2 && <span className="cal-ev-more">+{day.length - 2} további</span>}
          </div>
        );
      }
    }
    return (
      <>
        <div className="cal-month-head">{head}</div>
        <div className="cal-month-grid">{cells}</div>
      </>
    );
  }

  // ── Tooltip (hét nézet): időpont · időtartam · ügyfél · ellátó munkatárs ──
  const showEventTip = useCallback((ev: CalendarEventItem, card: HTMLElement) => {
    const r = card.getBoundingClientRect();
    const tipW = 240, tipH = 120;
    let x = r.left;
    let y = r.bottom + 6;
    if (x + tipW > window.innerWidth - 12) x = Math.max(12, window.innerWidth - tipW - 12);
    if (y + tipH > window.innerHeight - 12) y = Math.max(12, r.top - tipH - 6);
    setEventTip({ ev, x, y });
  }, []);
  const hideEventTip = useCallback(() => setEventTip(null), []);

  // ── Ügyfélprofil megnyitás eseményből ──
  const findClientByAttendee = useCallback((attendeeName: string, attendeeEmail: string): string | null => {
    const name = (attendeeName || '').toLowerCase().trim();
    const email = (attendeeEmail || '').toLowerCase().trim();
    for (const c of clients) {
      const cd = parseCustomData(c.custom_data);
      const clientName = (bestClientName(c) || c.name || '').toLowerCase().trim();
      const clientEmail = ((cd?.email as string) || c.email || '').toLowerCase().trim();
      if (email && clientEmail && email === clientEmail) return String(c.id);
      if (name && clientName && (name === clientName || clientName.includes(name) || name.includes(clientName))) return String(c.id);
    }
    return null;
  }, [clients]);

  // Esemény kattintás → szerkesztő panel megnyitása
  const openEventEdit = useCallback((ev: CalendarEventItem) => {
    setNewEvent({
      attendee: ev.attendee || '',
      email: ev.attendee_email || '',
      phone: '',
      title: ev.title || '',
      assigned_to: ev.doctor || '',
      date: (ev.start_dt || '').split('T')[0],
      time: (ev.start_dt || '').split('T')[1]?.substring(0, 5) || '09:00',
      duration: String(ev.duration_minutes || 30),
    });
    setEditingEventId(ev.id);
    setShowNewEventModal(true);
  }, []);

  // Ügyfélprofil megnyitás (a szerkesztő panelből külön gombbal)
  const openClientFromEvent = useCallback((attendeeName: string, attendeeEmail: string) => {
    const clientId = findClientByAttendee(attendeeName, attendeeEmail);
    if (clientId) setSelectedClientId(clientId);
    else showToast('Ügyfél nem található az adatbázisban', 'error');
  }, [findClientByAttendee]);

  // ── Esemény frissítése / törlése ──
  const handleUpdateEvent = useCallback(async () => {
    if (!editingEventId) return;
    if (!newEvent.attendee || !newEvent.title || !newEvent.date || !newEvent.time) {
      showToast('Név, esemény címe, dátum és időpont kötelező!', 'error');
      return;
    }
    const start_dt = `${newEvent.date}T${newEvent.time}:00`;
    try {
      const res = await authFetch(`/admin/api/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingEventId,
          title: newEvent.title,
          attendee: newEvent.attendee,
          attendee_email: newEvent.email,
          attendee_phone: newEvent.phone,
          start_dt,
          duration_minutes: parseInt(newEvent.duration) || 30,
          assigned_to: newEvent.assigned_to,
        }),
      });
      if (res.ok) {
        showToast('Időpont frissítve!');
        setShowNewEventModal(false);
        refetchEvents();
      } else showToast('Hiba a frissítéskor', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [editingEventId, newEvent, refetchEvents]);

  const handleDeleteEvent = useCallback(async (eventId: number) => {
    const ok = await confirm('Biztosan törlöd ezt az időpontot?', { title: 'Időpont törlése', danger: true });
    if (!ok) return;
    try {
      const res = await authFetch(`/admin/api/clients/calendar/${eventId}`, { method: 'DELETE' });
      if (res.ok) { showToast('Időpont törölve'); refetchEvents(); }
      else showToast('Hiba a törléskor', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [refetchEvents]);

  // ── Új esemény ──
  const handleSubmitEvent = useCallback(async () => {
    if (!newEvent.attendee || !newEvent.title || !newEvent.date || !newEvent.time) {
      showToast('Ügyfél neve, esemény címe, dátum és időpont kötelező!', 'error');
      return;
    }
    const start_dt = `${newEvent.date}T${newEvent.time}:00`;
    try {
      const res = await authFetch('/admin/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEvent.title,
          attendee: newEvent.attendee,
          attendee_email: newEvent.email,
          attendee_phone: newEvent.phone,
          start_dt,
          duration_minutes: parseInt(newEvent.duration) || 30,
          assigned_to: newEvent.assigned_to,
        }),
      });
      if (!res.ok) { showToast('Hiba az időpont létrehozásakor', 'error'); return; }
      setShowNewEventModal(false);
      setNewEvent({ attendee: '', email: '', phone: '', title: '', assigned_to: '', date: new Date().toISOString().split('T')[0], time: '09:00', duration: '30' });
      showToast('Időpont sikeresen létrehozva!');
      refetchEvents();
    } catch { showToast('Hiba az időpont létrehozásakor', 'error'); }
  }, [newEvent, refetchEvents]);

  // ── No-show jelölés ──
  const handleMarkNoShow = useCallback(async (eventId: number) => {
    try {
      const res = await authFetch(`/admin/api/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: eventId, reminder_sent: true }),
      });
      if (res.ok) { showToast('No-show jelölve'); refetchEvents(); }
      else showToast('Hiba a no-show jelöléskor', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [refetchEvents]);

  // ── Ügyfél Detail overlay ──
  if (selectedClientId) {
    const clientRaw = clients.find((c) => String(c.id) === selectedClientId);
    if (clientRaw) {
      const cd = parseCustomData(clientRaw.custom_data);
      const enriched = {
        id: clientRaw.id,
        name: bestClientName(clientRaw) || clientRaw.name || 'Névtelen',
        email: (cd?.email as string) || clientRaw.email || '',
        phone: (cd?.telefonszam as string) || (cd?.phone as string) || (cd?.telefon as string) || clientRaw.phone || '',
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
          sessions={sessions}
          events={events}
          source="calendar"
          onBack={() => setSelectedClientId(null)}
          onRefresh={refetchEvents}
        />
      );
    }
  }

  const now = new Date();

  return (
    <div className="analytics-shell">
      <ConfirmDialog />

      {/* Fejléc sáv: morzsák + cím */}
      <header className="int-page-head">
        <nav className="int-breadcrumbs" aria-label="Navigációs morzsák">
          <span className="int-crumb-link">Ügyfélközpont</span>
          <span className="int-crumb-sep">/</span>
          <span className="int-crumb-current">Naptár</span>
        </nav>
        <h1 className="page-title int-page-title">Naptár</h1>
      </header>

      {loading ? (
        <CalendarSkeleton />
      ) : (
        <>
          {/* Toolbar: listanézet-ikon + navigáció + Ma + nézetváltó + Időpont hozzáadása */}
          <div className="cal-toolbar">
            <button
              className={`cal-list-toggle${viewMode === 'list' ? ' is-on' : ''}`}
              title={viewMode === 'list' ? 'Vissza a naptárhoz' : 'Listanézet'}
              aria-label={viewMode === 'list' ? 'Vissza a naptárhoz' : 'Listanézet'}
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
            >
              {viewMode === 'list' ? (
                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              ) : (
                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
              )}
            </button>

            <div className="cal-nav-center">
              <button className="cd-btn int-btn-icon" onClick={() => calNav(-1)} aria-label="Előző időszak">
                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span className="cal-title">{calTitleText()}</span>
              <button className="cd-btn int-btn-icon" onClick={() => calNav(1)} aria-label="Következő időszak">
                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>

            <div className="cal-actions">
              <button className="cd-btn btn-sm cal-today-btn" onClick={goToday}>Ma</button>
              <div className="cal-seg" role="tablist" aria-label="Naptár nézetváltás">
                {(['day', 'week', 'month'] as CalMode[]).map(m => (
                  <button key={m} className={`cal-seg-btn${calMode === m ? ' is-on' : ''}`} onClick={() => setCalMode(m)}>
                    {m === 'day' ? 'Nap' : m === 'week' ? 'Hét' : 'Hónap'}
                  </button>
                ))}
              </div>
              <button className="cp-btn-accent" onClick={() => setShowNewEventModal(true)}>
                <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="15" height="15"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Időpont hozzáadása
              </button>
            </div>
          </div>

          {/* Naptár rácsok (nap/hét/hónap) — saját renderelés */}
          {viewMode === 'grid' && (
            <section className="cal-main">
              {calMode === 'day' ? renderDay() : calMode === 'week' ? renderWeek() : renderMonth()}
            </section>
          )}

          {/* Tooltip (hét nézet): időpont · időtartam · ügyfél · munkatárs */}
          {viewMode === 'grid' && calMode === 'week' && eventTip && (() => {
            const t = new Date(eventTip.ev.start_dt);
            const dur = eventTip.ev.duration_minutes || 30;
            const emailKey = (eventTip.ev.attendee_email || '').toLowerCase().trim();
            const staff = eventTip.ev.doctor || assigneeFor(emailKey);
            return (
              <div
                className="cal-tip"
                style={{ left: eventTip.x, top: eventTip.y, display: 'block', pointerEvents: 'none' }}
                role="tooltip"
              >
                <div className="cal-tip-time">
                  {pad2(t.getHours())}:{pad2(t.getMinutes())} · {dur} perc
                </div>
                <div className="cal-tip-title">{eventTip.ev.title}</div>
                <div className="cal-tip-name">{eventTip.ev.attendee || '—'}</div>
                <div className="cal-tip-meta">
                  <span className="cal-tip-col">Ellátó munkatárs: {staff || '—'}</span>
                </div>
              </div>
            );
          })()}

          {/* Listanézet (mockup oszlopok + no-show jelölés) */}
          {viewMode === 'list' && (
            <div className="cd-table-card cal-list-card">
              <div className="cd-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Időpont</th>
                      <th>Időpont státusza</th>
                      <th>Ügyfél</th>
                      <th>Ügyfélstátusz</th>
                      <th>Esemény</th>
                      <th>Időtartam</th>
                      <th>Munkatárs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myEvents.length === 0 ? (
                      <tr><td colSpan={7}><div className="cp-empty">Nincs naptári esemény.</div></td></tr>
                    ) : (
                      [...myEvents]
                        .sort((a, b) => (b.start_dt || '').localeCompare(a.start_dt || ''))
                        .map(ev => {
                          const t = new Date(ev.start_dt);
                          const isPast = t.getTime() < now.getTime();
                          const isNoShow = !!ev.reminder_sent && isPast;
                          const dTxt = dateKey(t) === dateKey(new Date()) ? 'Ma' : `${HU_MONTHS[t.getMonth()]} ${t.getDate()}.`;
                          const emailKey = (ev.attendee_email || '').toLowerCase().trim();
                          const assignee = assigneeFor(emailKey);
                          const badge = clientBadgeFor(emailKey);
                          return (
                            <tr key={ev.id} className="cursor-pointer" onClick={() => openClientFromEvent(ev.attendee || '', ev.attendee_email || '')}>
                              <td className="cd-time-cell">
                                <span className="t-time">{pad2(t.getHours())}:{pad2(t.getMinutes())}</span>
                                <span className="t-date">{dTxt}</span>
                              </td>
                              <td>
                                {isNoShow
                                  ? <span className="cp-badge cp-camp-closed"><i className="cp-dot" />No-show</span>
                                  : isPast
                                    ? <button className="cd-btn btn-sm" onClick={e => { e.stopPropagation(); handleMarkNoShow(ev.id as number); }}>Nem jelent meg</button>
                                    : <span className="cp-result">Várakozik</span>}
                              </td>
                              <td>{ev.attendee || <span className="cp-result">Nincs ügyfél</span>}</td>
                              <td><span className={`cp-badge ${pastEventCountByEmail[emailKey] ? 'cp-navyb' : 'cp-accentb'}`}><i className="cp-dot" />{badge}</span></td>
                              <td>{ev.title}</td>
                              <td>{ev.duration_minutes || 30} perc</td>
                              <td>{assignee || <span className="cp-result">—</span>}</td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Új esemény modál */}
      {showNewEventModal && (
        <div className="modal-overlay" onClick={() => setShowNewEventModal(false)}>
          <div className="cd-task-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={editingEventId ? 'Időpont szerkesztése' : 'Új időpont'}>
            <div className="cd-task-modal-head">
              <h3 className="modal-title">{editingEventId ? 'Időpont szerkesztése' : 'Új időpont létrehozása'}</h3>
              <button className="cd-task-modal-x" onClick={() => setShowNewEventModal(false)} aria-label="Bezárás">
                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="cd-task-modal-body">
              <div className="form-group">
                <label className="cd-task-modal-label">Ügyfél neve</label>
                <input className="cd-form-input" value={newEvent.attendee} onChange={e => setNewEvent({ ...newEvent, attendee: e.target.value })} placeholder="pl. Kiss Anna" />
              </div>
              <div className="flex-row gap-10">
                <div className="flex-1">
                  <label className="cd-task-modal-label">Email</label>
                  <input className="cd-form-input" type="email" value={newEvent.email} onChange={e => setNewEvent({ ...newEvent, email: e.target.value })} placeholder="email@pelda.hu" />
                </div>
                <div className="flex-1">
                  <label className="cd-task-modal-label">Telefon</label>
                  <input className="cd-form-input" type="tel" value={newEvent.phone} onChange={e => setNewEvent({ ...newEvent, phone: e.target.value })} placeholder="+36 20 123 4567" />
                </div>
              </div>
              <div className="form-group">
                <label className="cd-task-modal-label">Esemény címe</label>
                <input className="cd-form-input" value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="pl. Konzultáció" />
              </div>
              <div className="form-group">
                <label className="cd-task-modal-label">Munkatárs</label>
                <select className="cd-form-input" value={newEvent.assigned_to} onChange={e => setNewEvent({ ...newEvent, assigned_to: e.target.value })}>
                  <option value="">— Munkatárs választás —</option>
                  {staffOptions.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                  {newEvent.assigned_to && !staffOptions.includes(newEvent.assigned_to) && (
                    <option value={newEvent.assigned_to}>{newEvent.assigned_to}</option>
                  )}
                </select>
              </div>
              <div className="flex-row gap-10">
                <div className="flex-1">
                  <label className="cd-task-modal-label">Dátum</label>
                  <input className="cd-form-input" type="date" lang="hu" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className="cd-task-modal-label">Időpont</label>
                  <input className="cd-form-input" type="time" value={newEvent.time} onChange={e => setNewEvent({ ...newEvent, time: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className="cd-task-modal-label">Időtartam</label>
                  <select className="cd-form-input" value={newEvent.duration} onChange={e => setNewEvent({ ...newEvent, duration: e.target.value })}>
                    <option value="15">15 perc</option>
                    <option value="30">30 perc</option>
                    <option value="45">45 perc</option>
                    <option value="60">60 perc</option>
                    <option value="90">90 perc</option>
                    <option value="120">120 perc</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="cd-task-modal-foot">
              {editingEventId && (
                <button className="cd-btn cd-btn-danger" style={{ marginRight: 'auto' }} onClick={() => { handleDeleteEvent(editingEventId); setShowNewEventModal(false); }}>
                  <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  Időpont törlése
                </button>
              )}
              <button className="cd-btn" onClick={() => { setShowNewEventModal(false); setEditingEventId(null); }}>Mégse</button>
              <button className="cd-btn cd-btn-primary" onClick={editingEventId ? handleUpdateEvent : handleSubmitEvent} disabled={!newEvent.attendee || !newEvent.title || !newEvent.date || !newEvent.time}>
                {editingEventId ? 'Mentés' : 'Létrehozás'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
