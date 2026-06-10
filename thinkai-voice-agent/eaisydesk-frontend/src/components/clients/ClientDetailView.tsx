/**
 * ClientDetailView – 1:1 port of legacy openClientDetails() / view-client-details
 * Rendered as inline overlay within ClientsPage (no route change).
 */
import { useState, useMemo } from 'react';
import { parseCustomData, type ClientRecord } from '../../helpers/clientResolvers';
import { fmtDt } from '../../helpers/formatters';
import { TagBadge } from '../ui/Badge';
import { showToast } from '../ui/Toast';
import { authFetch } from '../../api/client';
import type { SessionSummary } from '../../hooks/useSessions';
import type { CalendarEvent } from '../../hooks/useCalendarEvents';

interface EnrichedClient {
  id: number | string;
  name: string;
  email: string;
  phone: string;
  status: string;
  created_at: string;
  tags: string[];
  assignee: string;
  lastInteraction: string;
  appointmentCount: number;
  isNew: boolean;
  isInactive: boolean;
  raw: ClientRecord;
}

interface Props {
  client: EnrichedClient;
  clientsMap: Record<string, ClientRecord>;
  sessions: SessionSummary[];
  events: CalendarEvent[];
  source: 'clients' | 'interactions';
  onBack: () => void;
  onRefresh: () => void;
}

export default function ClientDetailView({ client, clientsMap, sessions, events, source, onBack, onRefresh }: Props) {
  const [notes, setNotes] = useState(() => {
    const cd = parseCustomData(client.raw.custom_data);
    return (cd?.notes as string) || (cd?.megjegyzes as string) || '';
  });
  const [saving, setSaving] = useState(false);

  const cd = useMemo(() => parseCustomData(client.raw.custom_data), [client.raw.custom_data]);

  // Client appointments from calendar
  const clientAppointments = useMemo(() => {
    const name = client.name.toLowerCase().trim();
    const email = client.email.toLowerCase().trim();
    return events
      .filter((ev) => {
        const evName = (ev.attendee || '').toLowerCase().trim();
        const evEmail = (ev.attendee_email || '').toLowerCase().trim();
        return (name && evName.includes(name)) || (email && evEmail === email);
      })
      .sort((a, b) => (b.start_dt || '').localeCompare(a.start_dt || ''));
  }, [client, events]);

  // Client interactions from sessions
  const clientInteractions = useMemo(() => {
    const name = client.name.toLowerCase().trim();
    const email = client.email.toLowerCase().trim();
    const matchingSessions = sessions.filter((s) => {
      const participant = (s.participant || s.client_name || '').toLowerCase().trim();
      return participant === name || (email && s.session_id?.includes(email));
    });
    // Flatten to interaction rows
    const rows: Array<{ date: string; channel: string; direction: string; topic: string; summary: string; status: string }> = [];
    matchingSessions.forEach((s) => {
      if (s.interactions && s.interactions.length > 0) {
        s.interactions.forEach((r) => {
          rows.push({
            date: r.created_at || s.started_at || '',
            channel: r.type || 'Telefon',
            direction: (r.direction || 'inbound').toLowerCase() === 'outbound' ? 'Kimenő' : 'Bejövő',
            topic: r.topic || '-',
            summary: r.summary || '-',
            status: r.approval_status || 'lezárt',
          });
        });
      } else {
        rows.push({
          date: s.started_at || '',
          channel: s.channel || 'Telefon',
          direction: 'Bejövő',
          topic: '-',
          summary: s.summary || '-',
          status: 'lezárt',
        });
      }
    });
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return rows;
  }, [client, sessions]);

  const openInteractions = clientInteractions.filter((r) => r.status === 'pending' || r.status === 'nyitott');
  const closedInteractions = clientInteractions.filter((r) => r.status !== 'pending' && r.status !== 'nyitott');

  // Save notes
  async function saveNotes() {
    setSaving(true);
    try {
      const updatedCd = { ...cd, notes };
      const res = await authFetch(`/admin/api/clients/${client.id}/custom_data`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_data: updatedCd }),
      });
      if (res.ok) {
        showToast('Jegyzetek mentve');
        onRefresh();
      } else {
        showToast('Hiba a mentéskor', 'error');
      }
    } catch {
      showToast('Hiba a mentéskor', 'error');
    } finally {
      setSaving(false);
    }
  }

  // Status badge
  function statusLabel() {
    if (client.isInactive) return { text: 'INAKTÍV', bg: '#f3f4f6', color: '#9ca3af' };
    if (client.isNew) return { text: 'ÚJ', bg: '#dbeafe', color: '#1e40af' };
    return { text: 'VISSZATÉRŐ', bg: '#dcfce7', color: '#166534' };
  }
  const sl = statusLabel();

  return (
    <div className="analytics-shell">
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--accent, #1ceee0)',
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 20,
          fontFamily: 'inherit',
          padding: 0,
        }}
      >
        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
          <polyline points="15 18 9 12 15 6" />
        </svg>
        {source === 'interactions' ? 'Vissza az interakciós listához' : 'Vissza az ügyféllistához'}
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #1ceee0, #0bbdb1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#082432', flexShrink: 0 }}>
          {client.name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{client.name}</h2>
            <span style={{ background: sl.bg, color: sl.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 9999 }}>{sl.text}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            EaisyDesk ID: {client.id} • Regisztráció: {client.created_at ? fmtDt(client.created_at) : '—'}
          </div>
        </div>
      </div>

      {/* Tags */}
      {client.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {client.tags.map((t) => <TagBadge key={t} tag={t} />)}
        </div>
      )}

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Contact info */}
        <div style={{ background: 'var(--card)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 16px 0' }}>Elérhetőségek</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Email:</span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{client.email || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Telefon:</span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{client.phone || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Felelős:</span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{client.assignee || '—'}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={{ background: 'var(--card)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 16px 0' }}>Jegyzetek</h4>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text)', background: 'var(--bg, #f9fafb)', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
            placeholder="Jegyzetek..."
          />
          <button
            onClick={saveNotes}
            disabled={saving}
            style={{ marginTop: 8, padding: '8px 16px', background: 'linear-gradient(135deg,#1ceee0,#0bbdb1)', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#082432', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {saving ? 'Mentés...' : 'Mentés'}
          </button>
        </div>
      </div>

      {/* Appointments */}
      <div style={{ background: 'var(--card)', borderRadius: 14, padding: 20, border: '1px solid var(--border)', marginBottom: 20 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 16px 0' }}>
          Időpontok ({clientAppointments.length})
        </h4>
        {clientAppointments.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Nincs rögzített időpont</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {clientAppointments.slice(0, 5).map((ev, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg)', borderRadius: 10, fontSize: 13 }}>
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{ev.title || 'Időpont'}</span>
                  {ev.doctor && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>— {ev.doctor}</span>}
                </div>
                <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{ev.start_dt ? fmtDt(ev.start_dt) : '—'}</span>
              </div>
            ))}
            {clientAppointments.length > 5 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>+ {clientAppointments.length - 5} további</div>
            )}
          </div>
        )}
      </div>

      {/* Interaction history */}
      <div style={{ background: 'var(--card)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 16px 0' }}>
          Interakció-előzmények ({clientInteractions.length})
        </h4>

        {/* Open interactions */}
        {openInteractions.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', marginBottom: 8 }}>Aktuális ({openInteractions.length})</div>
            <InteractionTable rows={openInteractions} />
            <div style={{ height: 16 }} />
          </>
        )}

        {/* Closed interactions */}
        {closedInteractions.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Korábbi ({closedInteractions.length})</div>
            <InteractionTable rows={closedInteractions.slice(0, 20)} />
            {closedInteractions.length > 20 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
                + {closedInteractions.length - 20} további
              </div>
            )}
          </>
        )}

        {clientInteractions.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Nincs rögzített interakció</div>
        )}
      </div>
    </div>
  );
}

function InteractionTable({ rows }: { rows: Array<{ date: string; channel: string; direction: string; topic: string; summary: string }> }) {
  return (
    <table className="data-table" style={{ fontSize: 13 }}>
      <thead>
        <tr>
          <th>Dátum</th>
          <th>Csatorna</th>
          <th>Irány</th>
          <th>Téma</th>
          <th>Összefoglaló</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmtDt(r.date)}</td>
            <td style={{ padding: '10px 14px' }}>{r.channel}</td>
            <td style={{ padding: '10px 14px' }}>
              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600, background: r.direction === 'Kimenő' ? '#f3e8ff' : '#dbeafe', color: r.direction === 'Kimenő' ? '#6b21a8' : '#1e40af' }}>
                {r.direction}
              </span>
            </td>
            <td style={{ padding: '10px 14px' }}>{r.topic}</td>
            <td style={{ padding: '10px 14px', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.summary}>{r.summary}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
