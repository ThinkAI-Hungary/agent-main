/**
 * CalendarPage – 1:1 migration of legacy calendar view
 * Features: list view + grid (FullCalendar) view, new event creation, no-show marking
 * Clicking an event opens the client profile.
 */
import { useState, useMemo, useCallback } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useClients } from '../hooks/useClients';
import { useSessions } from '../hooks/useSessions';
import { useAuth } from '../context/AuthContext';
import { parseCustomData, isAssignedToMe, bestClientName } from '../helpers/clientResolvers';
import { fmtDt } from '../helpers/formatters';
import { CalendarSkeleton } from '../components/ui/Skeleton';
import { showToast } from '../components/ui/Toast';
import { authFetch } from '../api/client';
import ClientDetailView from '../components/clients/ClientDetailView';
import type { EventClickArg } from '@fullcalendar/core';

export default function CalendarPage() {
  const { user, isAdmin } = useAuth();
  const { events, loading, refetch: refetchEvents } = useCalendarEvents();
  const { clients, clientsMap } = useClients();
  const { sessions } = useSessions(500);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [showNewEventModal, setShowNewEventModal] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const isMobile = useIsMobile(768);

  // Member filtering: build set of assigned client names/emails
  const myEvents = useMemo(() => {
    if (isAdmin) return events;
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
    return events.filter(ev => {
      const evName = (ev.attendee || '').toLowerCase().trim();
      const evEmail = (ev.attendee_email || '').toLowerCase().trim();
      if (evEmail && assignedEmails.has(evEmail)) return true;
      if (evName && assignedNames.has(evName)) return true;
      return false;
    });
  }, [events, clients, isAdmin, user]);

  // New event form
  const [newEvent, setNewEvent] = useState({
    attendee: '',
    email: '',
    phone: '',
    title: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    duration: '30',
  });

  // ── FullCalendar events ──
  const fcEvents = useMemo(() => {
    return myEvents.map((ev) => {
      let end: string | undefined;
      if (ev.duration_minutes && ev.start_dt) {
        end = new Date(new Date(ev.start_dt).getTime() + ev.duration_minutes * 60000).toISOString();
      }
      return {
        id: String(ev.id),
        title: ev.title + (ev.attendee ? ' - ' + ev.attendee : ''),
        start: ev.start_dt,
        end,
        extendedProps: { attendee: ev.attendee, attendee_email: ev.attendee_email },
      };
    });
  }, [myEvents]);

  // ── Find client by attendee name/email ──
  const findClientByAttendee = useCallback((attendeeName: string, attendeeEmail: string): string | null => {
    const name = (attendeeName || '').toLowerCase().trim();
    const email = (attendeeEmail || '').toLowerCase().trim();

    for (const c of clients) {
      const cd = parseCustomData(c.custom_data);
      const clientName = (bestClientName(c) || c.name || '').toLowerCase().trim();
      const clientEmail = ((cd?.email as string) || c.email || '').toLowerCase().trim();

      // Match by email (strongest)
      if (email && clientEmail && email === clientEmail) {
        return String(c.id);
      }
      // Match by name
      if (name && clientName && (name === clientName || clientName.includes(name) || name.includes(clientName))) {
        return String(c.id);
      }
    }
    return null;
  }, [clients]);

  // ── Open client profile from event ──
  const openClientFromEvent = useCallback((attendeeName: string, attendeeEmail: string) => {
    const clientId = findClientByAttendee(attendeeName, attendeeEmail);
    if (clientId) {
      setSelectedClientId(clientId);
    } else {
      showToast('Ügyfél nem található az adatbázisban', 'error');
    }
  }, [findClientByAttendee]);

  // ── FullCalendar eventClick handler ──
  const handleEventClick = useCallback((info: EventClickArg) => {
    const { attendee, attendee_email } = info.event.extendedProps;
    openClientFromEvent(attendee || '', attendee_email || '');
  }, [openClientFromEvent]);

  // ── Submit new event ──
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
        }),
      });
      if (!res.ok) {
        showToast('Hiba az időpont létrehozásakor', 'error');
        return;
      }
      setShowNewEventModal(false);
      setNewEvent({ attendee: '', email: '', phone: '', title: '', date: new Date().toISOString().split('T')[0], time: '09:00', duration: '30' });
      showToast('Időpont sikeresen létrehozva!');
      refetchEvents();
    } catch {
      showToast('Hiba az időpont létrehozásakor', 'error');
    }
  }, [newEvent, refetchEvents]);

  // ── Today's events for agenda panel (must be above early returns to satisfy rules-of-hooks) ──
  const todayStr = new Date().toISOString().split('T')[0];
  const todayEvents = useMemo(() => {
    return myEvents
      .filter((ev) => (ev.start_dt || '').startsWith(todayStr))
      .sort((a, b) => (a.start_dt || '').localeCompare(b.start_dt || ''));
  }, [myEvents, todayStr]);

  // ── No-show marking ──
  const handleMarkNoShow = useCallback(async (eventId: number, _attendeeEmail: string, _attendeeName: string) => {
    try {
      const res = await authFetch(`/admin/api/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: eventId, reminder_sent: true }),
      });
      if (res.ok) {
        showToast('No-show címke hozzáadva');
        refetchEvents();
      } else {
        showToast('Hiba a no-show jelöléskor', 'error');
      }
    } catch {
      showToast('Hiba', 'error');
    }
  }, [refetchEvents]);

  // ── Client Detail overlay ──
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

  // todayEvents and todayStr moved above early return to satisfy rules-of-hooks

  const now = new Date();

  return (
    <div className="analytics-shell">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Naptár</div>

        </div>
        <div className="flex-row gap-10" style={{ paddingRight: 48 }}>
          {/* View toggle */}
          <div className="flex-row gap-4 cal-view-toggle">
            <button
              className={`btn btn-ghost-sm ${viewMode === 'list' ? 'filter-btn active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              Lista
            </button>
            <button
              className={`btn btn-ghost-sm ${viewMode === 'grid' ? 'filter-btn active' : ''}`}
              onClick={() => setViewMode('grid')}
            >
              Naptár
            </button>
          </div>

          {/* New event button */}
          <button className="btn btn-primary" onClick={() => setShowNewEventModal(true)}>
            + Új időpont
          </button>
        </div>
      </div>

      {loading ? (
        <CalendarSkeleton />
      ) : (
        <>
          {/* List view */}
          {viewMode === 'list' && (
            <div className="table-card cal-table-card">
              <table className="data-table int-table-norx">
                <thead className="int-thead">
                  <tr>
                    <th>Időpont</th>
                    <th>Esemény</th>
                    <th>Ügyfél</th>
                    <th>Időtartam</th>
                    <th>Email</th>
                    <th className="text-center">Státusz</th>
                  </tr>
                </thead>
                <tbody>
                  {myEvents.length === 0 ? (
                    <tr className="int-row">
                      <td className="int-td" colSpan={6}>
                        <div className="empty-state">
                          <div className="empty-state-icon" />
                          <div className="empty-state-text no-data">Nincs naptári esemény</div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    myEvents.map((ev) => {
                      const isPast = new Date(ev.start_dt || '') < new Date();
                      return (
                        <tr
                          key={ev.id}
                          className="int-row cursor-pointer"
                          style={{ opacity: isPast ? 0.7 : 1 }}
                          onClick={() => openClientFromEvent(ev.attendee || '', ev.attendee_email || '')}
                        >
                          <td className="int-td"><div className="td-time">{fmtDt(ev.start_dt || '')}</div></td>
                          <td className="int-td cal-ev-title">{ev.title}</td>
                          <td className="int-td">
                            <span className="cal-attendee-link">
                              {ev.attendee || <span className="no-data">Nincs ügyfél</span>}
                            </span>
                          </td>
                          <td className="int-td"><span className="badge badge-teal">{ev.duration_minutes} perc</span></td>
                          <td className="int-td td-summary">{ev.attendee_email || <span className="no-data">Nincs email</span>}</td>
                          <td className="int-td cal-status-cell" onClick={(e) => e.stopPropagation()}>
                            {isPast ? (
                              <button
                                onClick={() => handleMarkNoShow(ev.id as number, ev.attendee_email || '', ev.attendee || '')}
                                className="btn btn-noshow"
                                title="No-show címke hozzáadása"
                              >
                                Nem jelent meg
                              </button>
                            ) : (
                              <span className="cal-waiting">Várakozik</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Grid (FullCalendar) view — two column layout */}
          {viewMode === 'grid' && (
            <div className="calendar-page-layout">
              {/* Left: Calendar grid */}
              <div className="calendar-grid-wrapper">
                <FullCalendar
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
                  initialView={isMobile ? 'timeGridDay' : 'timeGridWeek'}
                  locale="hu"
                  firstDay={1}
                  height="100%"
                  allDaySlot={false}
                  nowIndicator
                  slotMinTime="08:00:00"
                  slotMaxTime="19:00:00"
                  slotDuration="00:30:00"
                  expandRows
                  headerToolbar={isMobile ? {
                    left: 'prev,today,next',
                    center: 'title',
                    right: 'timeGridDay,dayGridMonth',
                  } : {
                    left: 'prev,today,next',
                    center: 'title',
                    right: 'timeGridDay,timeGridWeek,dayGridMonth',
                  }}
                  buttonText={{ today: 'Ma', month: 'Hónap', week: 'Hét', day: 'Nap' }}
                  eventColor="var(--accent)"
                  events={fcEvents}
                  eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false, hour12: false }}
                  eventClick={handleEventClick}
                  eventClassNames="fc-event-clickable"
                />
              </div>

              {/* Right: Agenda panel */}
              <div className="calendar-agenda-panel">
                <div className="agenda-header">
                  <div className="agenda-title">
                    Mai események
                    {todayEvents.length > 0 && (
                      <span className="agenda-count">{todayEvents.length}</span>
                    )}
                  </div>
                  <div className="agenda-date">
                    {new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
                  </div>
                </div>

                {todayEvents.length === 0 ? (
                  <div className="agenda-empty">
                    <div className="agenda-empty-icon"></div>
                    <div className="agenda-empty-text no-data">Nincs mai időpont</div>
                  </div>
                ) : (
                  <div className="agenda-list">
                    {todayEvents.map((ev) => {
                      const evStart = new Date(ev.start_dt || '');
                      const evEnd = new Date(evStart.getTime() + (ev.duration_minutes || 30) * 60000);
                      const isPast = evEnd < now;
                      const isNow = evStart <= now && now < evEnd;

                      return (
                        <div
                          key={ev.id}
                          className={`agenda-card${isPast ? ' is-past' : ''}${isNow ? ' is-now' : ''}`}
                          onClick={() => openClientFromEvent(ev.attendee || '', ev.attendee_email || '')}
                        >
                          <div className="agenda-card-time">
                            {evStart.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div className="agenda-card-info">
                            <div className="agenda-card-title">{ev.title}</div>
                            <div className="agenda-card-attendee">{ev.attendee || <span className="no-data">Nincs ügyfél</span>}</div>
                          </div>
                          <div className="agenda-card-duration">
                            {ev.duration_minutes || 30} perc
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* New Event Modal — Apple-style */}
      {showNewEventModal && (
        <div className="modal-overlay" onClick={() => setShowNewEventModal(false)}>
          <div className="modal-card modal-card--460" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Új időpont létrehozása</h3>
                <p className="text-sm text-muted cal-modal-sub">Adja meg az ügyfél és az esemény adatait</p>
              </div>
              <button className="modal-close" onClick={() => setShowNewEventModal(false)}>✕</button>
            </div>

            <div className="modal-body">
              {/* Section: Ügyfél */}
              <div className="mb-20">
                <div className="form-label form-label--section">Ügyfél adatai</div>
                <div className="flex-col gap-10">
                  <ModalInput label="Név" value={newEvent.attendee} onChange={(v) => setNewEvent({ ...newEvent, attendee: v })} required placeholder="pl. Kiss Anna" />
                  <div className="flex-row gap-10">
                    <div className="flex-1">
                      <ModalInput label="Email" value={newEvent.email} onChange={(v) => setNewEvent({ ...newEvent, email: v })} type="email" placeholder="email@pelda.hu" />
                    </div>
                    <div className="flex-1">
                      <ModalInput label="Telefon" value={newEvent.phone} onChange={(v) => setNewEvent({ ...newEvent, phone: v })} type="tel" placeholder="+36 20 123 4567" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Esemény */}
              <div className="mb-20">
                <div className="form-label form-label--section">Esemény részletei</div>
                <div className="flex-col gap-10">
                  <ModalInput label="Esemény címe" value={newEvent.title} onChange={(v) => setNewEvent({ ...newEvent, title: v })} required placeholder="pl. Konzultáció" />
                  <div className="flex-row gap-10">
                    <div className="flex-1">
                      <label className="form-label">Dátum *</label>
                      <input className="input" type="date" lang="hu" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} />
                    </div>
                    <div className="flex-1">
                      <label className="form-label">Időpont *</label>
                      <input className="input" type="time" value={newEvent.time} onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Időtartam</label>
                    <select className="input" value={newEvent.duration} onChange={(e) => setNewEvent({ ...newEvent, duration: e.target.value })}>
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
            </div>

            {/* Footer */}
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowNewEventModal(false)}>Mégse</button>
              <button className="btn btn-primary" onClick={handleSubmitEvent}>Létrehozás</button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile FAB — new event */}
      {isMobile && (
        <button className="mobile-fab" onClick={() => setShowNewEventModal(true)} title="Új időpont">
          <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="22" height="22">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}
    </div>
  );
}



function ModalInput({ label, value, onChange, type = 'text', required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}{required && ' *'}</label>
      <input className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} />
    </div>
  );
}
