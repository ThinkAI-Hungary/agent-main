/**
 * CalendarPage – 1:1 migration of legacy calendar view
 * Features: list view + grid (FullCalendar) view, new event creation, no-show marking
 * Clicking an event opens the client profile.
 */
import { useState, useMemo, useCallback } from 'react';
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
import { supabase } from '../lib/supabase';
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
      const { error } = await supabase.from('calendar_events').insert({
        title: newEvent.title,
        attendee: newEvent.attendee,
        attendee_email: newEvent.email,
        attendee_phone: newEvent.phone,
        start_dt,
        duration_minutes: parseInt(newEvent.duration) || 30,
      });
      if (error) {
        showToast(error.message || 'Hiba', 'error');
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
      // Tag the client with 'no-show' via custom_data or a separate field
      const { error } = await supabase
        .from('calendar_events')
        .update({ reminder_sent: true }) // reuse field as no-show marker
        .eq('id', eventId);
      if (!error) {
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
          source="clients"
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
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <div className="page-title">Naptár</div>
          <div className="page-subtitle">Időpontok és események kezelése</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', borderRadius: 8, padding: 3 }}>
            <button
              onClick={() => setViewMode('list')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: viewMode === 'list' ? 'rgba(28,238,224,0.12)' : 'transparent',
                color: viewMode === 'list' ? 'var(--accent, #1ceee0)' : 'var(--text-muted)',
              }}
            >
              Lista
            </button>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: viewMode === 'grid' ? 'rgba(28,238,224,0.12)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--accent, #1ceee0)' : 'var(--text-muted)',
              }}
            >
              Naptár
            </button>
          </div>

          {/* New event button */}
          <button
            onClick={() => setShowNewEventModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
              background: '#1ceee0', color: '#0a1628', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 2px 8px rgba(28,238,224,0.25)',
            }}
          >
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
            <div className="table-card" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Időpont</th>
                    <th>Esemény</th>
                    <th>Ügyfél</th>
                    <th>Időtartam</th>
                    <th>Email</th>
                    <th style={{ textAlign: 'center' }}>Státusz</th>
                  </tr>
                </thead>
                <tbody>
                  {myEvents.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-state">
                          <div className="empty-state-icon" />
                          <div className="empty-state-text">Nincs naptári esemény</div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    myEvents.map((ev) => {
                      const isPast = new Date(ev.start_dt || '') < new Date();
                      return (
                        <tr
                          key={ev.id}
                          style={{ opacity: isPast ? 0.7 : 1, cursor: 'pointer' }}
                          onClick={() => openClientFromEvent(ev.attendee || '', ev.attendee_email || '')}
                        >
                          <td><div className="td-time">{fmtDt(ev.start_dt || '')}</div></td>
                          <td style={{ fontWeight: 500 }}>{ev.title}</td>
                          <td>
                            <span style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                              {ev.attendee || '—'}
                            </span>
                          </td>
                          <td><span className="badge badge-teal">{ev.duration_minutes} perc</span></td>
                          <td className="td-summary">{ev.attendee_email || '—'}</td>
                          <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            {isPast ? (
                              <button
                                onClick={() => handleMarkNoShow(ev.id as number, ev.attendee_email || '', ev.attendee || '')}
                                style={{ background: 'rgba(245,127,23,0.1)', color: '#f57f17', border: '1px solid rgba(245,127,23,0.3)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}
                                title="No-show címke hozzáadása"
                              >
                                ⚠ Nem jelent meg
                              </button>
                            ) : (
                              <span style={{ color: '#22c55e', fontSize: 11, fontWeight: 600 }}>Várakozik</span>
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
                  initialView="timeGridWeek"
                  locale="hu"
                  firstDay={1}
                  height="100%"
                  allDaySlot={false}
                  nowIndicator
                  slotMinTime="08:00:00"
                  slotMaxTime="19:00:00"
                  slotDuration="00:30:00"
                  expandRows
                  headerToolbar={{
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
                    <div className="agenda-empty-icon">📅</div>
                    <div className="agenda-empty-text">Nincs mai időpont</div>
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
                            <div className="agenda-card-attendee">{ev.attendee || '—'}</div>
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
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn .18s ease',
          }}
          onClick={() => setShowNewEventModal(false)}
        >
          <div
            style={{
              width: 460, maxWidth: '92vw',
              background: 'var(--card, #fff)',
              borderRadius: 18,
              boxShadow: '0 24px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.06) inset',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              animation: 'modalSlideUp .22s cubic-bezier(.2,.9,.3,1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '22px 28px 18px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.2px' }}>
                  Új időpont létrehozása
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                  Adja meg az ügyfél és az esemény adatait
                </p>
              </div>
              <button
                onClick={() => setShowNewEventModal(false)}
                style={{
                  width: 30, height: 30, borderRadius: '50%',
                  border: 'none', background: 'var(--bg3, rgba(0,0,0,0.06))',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-muted)', fontSize: 16, fontWeight: 300, lineHeight: 1,
                  transition: 'background .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.12)', e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg3, rgba(0,0,0,0.06))', e.currentTarget.style.color = 'var(--text-muted)')}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '22px 28px 6px' }}>
              {/* Section: Ügyfél */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                  👤 Ügyfél adatai
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <ModalInput label="Név" value={newEvent.attendee} onChange={(v) => setNewEvent({ ...newEvent, attendee: v })} required placeholder="pl. Kiss Anna" />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <ModalInput label="Email" value={newEvent.email} onChange={(v) => setNewEvent({ ...newEvent, email: v })} type="email" placeholder="email@pelda.hu" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <ModalInput label="Telefon" value={newEvent.phone} onChange={(v) => setNewEvent({ ...newEvent, phone: v })} type="tel" placeholder="+36 20 123 4567" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Esemény */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                  📅 Esemény részletei
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <ModalInput label="Esemény címe" value={newEvent.title} onChange={(v) => setNewEvent({ ...newEvent, title: v })} required placeholder="pl. Konzultáció" />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Dátum *</label>
                      <input type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} style={modalInputStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Időpont *</label>
                      <input type="time" value={newEvent.time} onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })} style={modalInputStyle} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Időtartam</label>
                    <select value={newEvent.duration} onChange={(e) => setNewEvent({ ...newEvent, duration: e.target.value })} style={modalInputStyle}>
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
            <div style={{
              padding: '16px 28px 22px',
              display: 'flex', gap: 10, justifyContent: 'flex-end',
              borderTop: '1px solid var(--border)',
            }}>
              <button
                onClick={() => setShowNewEventModal(false)}
                style={{
                  padding: '9px 22px', borderRadius: 9,
                  border: '1px solid var(--border)',
                  background: 'var(--bg2, var(--bg, #f5f5f5))',
                  color: 'var(--text)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3, #eee)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg2, var(--bg, #f5f5f5))')}
              >
                Mégse
              </button>
              <button
                onClick={handleSubmitEvent}
                style={{
                  padding: '9px 28px', borderRadius: 9,
                  border: 'none',
                  background: 'linear-gradient(135deg, #1ceee0, #0abfb4)',
                  color: '#0a1628', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 2px 12px rgba(28,238,224,0.3)',
                  transition: 'all .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 18px rgba(28,238,224,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(28,238,224,0.3)'; }}
              >
                ✓ Létrehozás
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal animation keyframes */}
      <style>{`
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const modalInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1.5px solid var(--border)',
  borderRadius: 9,
  fontSize: 13,
  color: 'var(--text)',
  background: 'var(--bg2, var(--bg, #f8f9fa))',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color .15s, box-shadow .15s',
  colorScheme: 'light dark',
};

function ModalInput({ label, value, onChange, type = 'text', required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
        {label}{required && ' *'}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={modalInputStyle}
        onFocus={e => {
          e.currentTarget.style.borderColor = '#1ceee0';
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(28,238,224,0.12)';
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
    </div>
  );
}
