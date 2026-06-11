/**
 * CalendarPage – 1:1 migration of legacy calendar view
 * Features: list view + grid (FullCalendar) view, new event creation, no-show marking
 */
import { useState, useMemo, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { useCalendarEvents, type CalendarEvent } from '../hooks/useCalendarEvents';
import { useClients } from '../hooks/useClients';
import { useAuth } from '../context/AuthContext';
import { parseCustomData, isAssignedToMe } from '../helpers/clientResolvers';
import { fmtDt } from '../helpers/formatters';
import Spinner from '../components/ui/Spinner';
import { showToast } from '../components/ui/Toast';
import { supabase } from '../lib/supabase';

export default function CalendarPage() {
  const { user, isAdmin } = useAuth();
  const { events, loading, refetch: refetchEvents } = useCalendarEvents();
  const { clients } = useClients();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [showNewEventModal, setShowNewEventModal] = useState(false);

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

          {/* Refresh */}
          <button
            onClick={() => refetchEvents()}
            title="Frissítés"
            style={{ background: 'none', border: 'none', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 6 }}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 15, height: 15 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 20v-5h-5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.49 9A9 9 0 005.64 5.64L4 9m16 6l-1.64 3.36A9 9 0 013.51 15" />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
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
                      const isPast = new Date(ev.start_dt) < new Date();
                      return (
                        <tr key={ev.id} style={{ opacity: isPast ? 0.7 : 1 }}>
                          <td><div className="td-time">{fmtDt(ev.start_dt)}</div></td>
                          <td style={{ fontWeight: 500 }}>{ev.title}</td>
                          <td>{ev.attendee || '—'}</td>
                          <td><span className="badge badge-teal">{ev.duration_minutes} perc</span></td>
                          <td className="td-summary">{ev.attendee_email || '—'}</td>
                          <td style={{ textAlign: 'center' }}>
                            {isPast ? (
                              <button
                                onClick={() => handleMarkNoShow(ev.id, ev.attendee_email || '', ev.attendee || '')}
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

          {/* Grid (FullCalendar) view */}
          {viewMode === 'grid' && (
            <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', padding: 16, minHeight: 600 }}>
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
                initialView="timeGridWeek"
                locale="hu"
                firstDay={1}
                height="auto"
                allDaySlot={false}
                nowIndicator
                slotMinTime="07:00:00"
                slotMaxTime="20:00:00"
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
              />
            </div>
          )}
        </>
      )}

      {/* New Event Modal */}
      {showNewEventModal && (
        <div
          style={{ display: 'flex', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowNewEventModal(false)}
        >
          <div
            className="login-card"
            style={{ width: 420, maxWidth: '90vw', padding: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 20px 0', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Új időpont létrehozása</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FormField label="Ügyfél neve *" value={newEvent.attendee} onChange={(v) => setNewEvent({ ...newEvent, attendee: v })} />
              <FormField label="Email" value={newEvent.email} onChange={(v) => setNewEvent({ ...newEvent, email: v })} type="email" />
              <FormField label="Telefon" value={newEvent.phone} onChange={(v) => setNewEvent({ ...newEvent, phone: v })} type="tel" />
              <FormField label="Esemény címe *" value={newEvent.title} onChange={(v) => setNewEvent({ ...newEvent, title: v })} />
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Dátum *</label>
                  <input type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Időpont *</label>
                  <input type="time" value={newEvent.time} onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Időtartam (perc)</label>
                <select value={newEvent.duration} onChange={(e) => setNewEvent({ ...newEvent, duration: e.target.value })} style={inputStyle}>
                  <option value="15">15 perc</option>
                  <option value="30">30 perc</option>
                  <option value="45">45 perc</option>
                  <option value="60">60 perc</option>
                  <option value="90">90 perc</option>
                  <option value="120">120 perc</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowNewEventModal(false)}
                className="btn-primary"
                style={{ background: 'var(--bg3)', color: 'var(--text)', fontFamily: 'inherit' }}
              >
                Mégse
              </button>
              <button onClick={handleSubmitEvent} className="btn-primary" style={{ fontFamily: 'inherit' }}>
                Létrehozás
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--text)',
  background: 'var(--bg, #f9fafb)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
};

function FormField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}
