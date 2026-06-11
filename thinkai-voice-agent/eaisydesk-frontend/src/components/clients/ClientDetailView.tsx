/**
 * ClientDetailView – 1:1 port of legacy openClientDetails() / view-client-details
 * Rendered as inline overlay within ClientsPage or InteractionsPage.
 */
import { useState, useMemo, useCallback } from 'react';
import { parseCustomData, type ClientRecord } from '../../helpers/clientResolvers';
import { fmtDt } from '../../helpers/formatters';
import { showToast } from '../ui/Toast';
import { supabase } from '../../lib/supabase';
import type { SessionSummary } from '../../hooks/useSessions';
import type { CalendarEvent } from '../../hooks/useCalendarEvents';
import {
  detectUgyTipus,
  detectEredmeny,
  detectStatusz,
  detectTeendo,
} from '../../helpers/interactionClassifiers';
import { EredmenyBadge, StatuszBadge, DirectionBadge } from '../ui/Badge';

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

interface InteractionRowDetail {
  date: string;
  channel: string;
  direction: string;
  ugyTipus: string;
  eredmeny: string;
  statusz: string;
  teendo: string;
  topic: string;
  summary: string;
  status: string;
  done: boolean;
}

export default function ClientDetailView({ client, clientsMap, sessions, events, source, onBack, onRefresh }: Props) {
  const [notes, setNotes] = useState(() => {
    const cd = parseCustomData(client.raw.custom_data);
    return (cd?.notes as string) || (cd?.megjegyzes as string) || '';
  });
  const [saving, setSaving] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [editName, setEditName] = useState(client.name);
  const [editEmail, setEditEmail] = useState(client.email);
  const [editPhone, setEditPhone] = useState(client.phone);
  const [editNotes, setEditNotes] = useState(() => {
    const c = parseCustomData(client.raw.custom_data);
    return (c?.notes as string) || (c?.megjegyzes as string) || '';
  });

  const cd = useMemo(() => parseCustomData(client.raw.custom_data), [client.raw.custom_data]);

  // Client appointments
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

  // Client interactions from sessions – enriched with classifiers
  const clientInteractions = useMemo(() => {
    const name = client.name.toLowerCase().trim();
    const email = client.email.toLowerCase().trim();
    const matchingSessions = sessions.filter((s) => {
      const participant = (s.participant || s.client_name || '').toLowerCase().trim();
      return participant === name || (email && s.session_id?.includes(email));
    });
    const rows: InteractionRowDetail[] = [];
    matchingSessions.forEach((s) => {
      if (s.interactions && s.interactions.length > 0) {
        s.interactions.forEach((r) => {
          const summary = r.summary || s.summary || '';
          const topic = r.topic || '';
          const channel = r.type || s.channel || 'Telefon';
          const direction = (r.direction || 'inbound').toLowerCase() === 'outbound' ? 'Kimenő' : 'Bejövő';
          rows.push({
            date: r.created_at || s.started_at || '',
            channel,
            direction,
            ugyTipus: detectUgyTipus(topic, summary),
            eredmeny: detectEredmeny(topic, summary),
            statusz: detectStatusz(r.approval_status || '', summary),
            teendo: detectTeendo(r.approval_status || '', summary),
            topic,
            summary,
            status: r.approval_status || 'lezárt',
            done: (r.approval_status || '').toLowerCase() === 'approved' || (r.approval_status || '').toLowerCase() === 'lezárt',
          });
        });
      } else {
        const summary = s.summary || '';
        rows.push({
          date: s.started_at || '',
          channel: s.channel || 'Telefon',
          direction: 'Bejövő',
          ugyTipus: detectUgyTipus('', summary),
          eredmeny: detectEredmeny('', summary),
          statusz: 'LEZÁRT',
          teendo: 'Nincs teendő',
          topic: '',
          summary,
          status: 'lezárt',
          done: true,
        });
      }
    });
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return rows;
  }, [client, sessions]);

  const openInteractions = clientInteractions.filter((r) => r.status === 'pending' || r.status === 'nyitott' || r.statusz === 'NYITOTT');
  const closedInteractions = clientInteractions.filter((r) => r.status !== 'pending' && r.status !== 'nyitott' && r.statusz !== 'NYITOTT');

  // Save notes
  const saveNotes = useCallback(async (value: string) => {
    setSaving(true);
    try {
      const updatedCd = { ...cd, notes: value };
      const { error } = await supabase.from('clients').update({ custom_data: updatedCd }).eq('id', client.id);
      if (!error) showToast('Jegyzetek mentve');
      else showToast('Hiba a mentéskor', 'error');
    } catch { showToast('Hiba', 'error'); }
    finally { setSaving(false); }
  }, [cd, client.id]);

  // Add tag
  const addTag = useCallback(async (tag: string) => {
    const currentTags = (cd?.tags as string[]) || [];
    if (currentTags.includes(tag)) return;
    const updatedTags = [...currentTags, tag];
    const updatedCd = { ...cd, tags: updatedTags };
    const { error } = await supabase.from('clients').update({ custom_data: updatedCd }).eq('id', client.id);
    if (!error) { showToast(`Címke hozzáadva: ${tag}`); onRefresh(); }
    else showToast('Hiba', 'error');
    setShowTagPicker(false);
    setCustomTag('');
  }, [cd, client.id, onRefresh]);

  // Remove tag
  const removeTag = useCallback(async (tag: string) => {
    const currentTags = (cd?.tags as string[]) || [];
    const updatedTags = currentTags.filter(t => t !== tag);
    const updatedCd = { ...cd, tags: updatedTags };
    const { error } = await supabase.from('clients').update({ custom_data: updatedCd }).eq('id', client.id);
    if (!error) { showToast('Címke eltávolítva'); onRefresh(); }
    else showToast('Hiba', 'error');
  }, [cd, client.id, onRefresh]);

  // Save profile
  const saveProfile = useCallback(async () => {
    setSaving(true);
    try {
      const updatedCd = { ...cd, email: editEmail, telefonszam: editPhone, notes: editNotes };
      const { error } = await supabase.from('clients').update({ name: editName, custom_data: updatedCd }).eq('id', client.id);
      if (!error) {
        showToast('Profil mentve');
        setShowProfileEdit(false);
        setNotes(editNotes);
        onRefresh();
      } else showToast('Hiba a mentéskor', 'error');
    } catch { showToast('Hiba', 'error'); }
    finally { setSaving(false); }
  }, [cd, client.id, editName, editEmail, editPhone, editNotes, onRefresh]);

  // Status
  function statusLabel() {
    if (client.isInactive) return { text: 'INAKTÍV', bg: '#f3f4f6', color: '#9ca3af' };
    if (client.isNew) return { text: 'ÚJ ÜGYFÉL', bg: '#082432', color: '#fff' };
    return { text: 'VISSZATÉRŐ', bg: '#dcfce7', color: '#166534' };
  }
  const sl = statusLabel();

  const regDate = client.created_at ? new Date(client.created_at).toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '. ') : 'N/A';

  const PREDEFINED_TAGS: { label: string; bg: string; color: string }[] = [
    { label: 'árkérdés', bg: '#fed7aa', color: '#c2410c' },
    { label: 'kampány lead', bg: '#e5e7eb', color: '#374151' },
    { label: 'ajánlatkérés', bg: '#a7f3d0', color: '#065f46' },
    { label: 'törölt időpont', bg: '#fecaca', color: '#b91c1c' },
    { label: 'no-show', bg: '#99f6e4', color: '#0f766e' },
    { label: 'VIP', bg: '#e9d5ff', color: '#7c3aed' },
  ];

  return (
    <div className="analytics-shell">
      {/* Back button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent, #1ceee0)', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', padding: 0 }}
        >
          <span>←</span>
          {source === 'interactions' ? 'Vissza az interakciós listához' : 'Vissza az ügyféllistához'}
        </button>
        {/* Notification bell */}
        <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 20, height: 20, opacity: 0.5 }}>
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
      </div>

      {/* ═══ Top Card (Mint gradient) ═══ */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'stretch',
        background: 'linear-gradient(90deg, #c4f2e8 0%, #b8eae0 100%)',
        padding: '24px 32px', borderRadius: 12, marginBottom: 24,
      }}>
        {/* Left: Avatar & Info */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg fill="none" height="28" stroke="#1ceee0" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="28">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 'bold', color: '#082432' }}>{client.name}</h2>
              <span style={{ background: sl.bg, color: sl.color, fontSize: 11, fontWeight: 'bold', padding: '4px 8px', borderRadius: 6, letterSpacing: '0.5px' }}>{sl.text}</span>
            </div>
            <div style={{ color: 'rgba(8,36,50,0.8)', fontSize: 14, marginBottom: 16 }}>
              Eaisydesk azonosító: {client.id}
            </div>
            <div style={{ display: 'flex', gap: 32, fontSize: 14, color: '#082432' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg fill="none" height="16" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" style={{ opacity: 0.7 }}>
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <span style={{ fontWeight: 500 }}>{client.phone || 'Nincs megadva'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg fill="none" height="16" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" style={{ opacity: 0.7 }}>
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <span style={{ fontWeight: 500 }}>{client.email || 'Nincs megadva'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Profile Edit & Registration Date */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <button
            onClick={() => setShowProfileEdit(true)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#082432', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}
          >
            <svg fill="none" height="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="16">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Profil módosítása
          </button>
          <div style={{ background: 'white', padding: '12px 20px', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 120, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 11, color: 'rgba(8,36,50,0.6)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, textTransform: 'uppercase' }}>
              <svg fill="none" height="12" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              Regisztrálva:
            </div>
            <div style={{ fontSize: 16, fontWeight: 'bold', color: '#082432', marginTop: 4 }}>{regDate}</div>
          </div>
        </div>
      </div>

      {/* ═══ Middle Cards: Tags, Appointments, Notes ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: 20, marginBottom: 24 }}>
        {/* Tags */}
        <div style={{ background: '#f3f4f6', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <h3 style={{ fontSize: 12, fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', marginTop: 0, marginBottom: 16 }}>Címkék</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {client.tags.length === 0 && <span style={{ fontSize: 13, color: '#9ca3af' }}>Nincs címke</span>}
            {client.tags.map((t) => (
              <span key={t} style={{ background: 'rgba(28,238,224,0.15)', color: '#0d9488', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 9999, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {t}
                <button onClick={() => removeTag(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0d9488', fontSize: 14, padding: 0, lineHeight: 1, fontFamily: 'inherit' }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ position: 'relative', marginTop: 16 }}>
            <button onClick={() => setShowTagPicker(!showTagPicker)} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: 12, fontWeight: 600, textAlign: 'left', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>+ Címke hozzáadása</button>
            {showTagPicker && (
              <div style={{ position: 'absolute', left: 0, bottom: 32, background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: 12, zIndex: 999, minWidth: 220 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Előre definiált címkék</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {PREDEFINED_TAGS.filter(t => !client.tags.includes(t.label)).map(t => (
                    <button key={t.label} onClick={() => addTag(t.label)} style={{ background: t.bg, color: t.color, border: 'none', padding: '5px 12px', textAlign: 'left', cursor: 'pointer', fontSize: 13, fontWeight: 600, borderRadius: 6, fontFamily: 'inherit', transition: 'opacity 0.15s' }}
                      onMouseOver={e => (e.currentTarget.style.opacity = '0.8')}
                      onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                    >{t.label}</button>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid #e5e7eb', margin: '10px 0' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={customTag} onChange={e => setCustomTag(e.target.value)} placeholder="Egyéni címke..." style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 8px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                    onKeyDown={e => { if (e.key === 'Enter' && customTag.trim()) { addTag(customTag.trim()); } }}
                  />
                  <button onClick={() => { if (customTag.trim()) addTag(customTag.trim()); }} style={{ background: '#1ceee0', color: '#000', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Hozzáadás</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Previous Appointments */}
        <div style={{ background: '#f3f4f6', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: 12, fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', marginTop: 0, marginBottom: 16 }}>Korábbi időpontok</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {clientAppointments.length === 0 && <span style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>Nincs korábbi foglalás.</span>}
            {clientAppointments.slice(0, 3).map((ev, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4b5563' }}>
                <svg fill="none" height="14" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                {ev.start_dt ? fmtDt(ev.start_dt) : '—'}
              </div>
            ))}
            {clientAppointments.length > 3 && (
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent, #1ceee0)', cursor: 'pointer', textAlign: 'right', marginTop: 4 }}>
                Összes időpont ({clientAppointments.length})
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div style={{ background: 'white', border: '2px solid var(--accent, #1ceee0)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column' }}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => saveNotes(notes)}
            placeholder="Megjegyzés"
            style={{ width: '100%', height: '100%', minHeight: 80, border: 'none', resize: 'none', fontFamily: 'inherit', fontSize: 14, color: '#082432', outline: 'none', background: 'transparent', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Total interactions count */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#4b5563', marginBottom: 16 }}>
        Összes interakció: {clientInteractions.length}
      </div>

      {/* ═══ Aktuális Ügyek Table ═══ */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 16, color: '#4b5563', textTransform: 'uppercase' }}>Aktuális ügyek</h3>
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'white' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={thStyle}>Interakció időpontja</th>
                <th style={thStyle}>Csatorna</th>
                <th style={thStyle}>Interakció iránya</th>
                <th style={thStyle}>Ügytípus</th>
                <th style={thStyle}>Eredmény</th>
                <th style={thStyle}>Státusz</th>
                <th style={thStyle}>Teendő</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Elvégezve</th>
              </tr>
            </thead>
            <tbody>
              {openInteractions.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Nincs aktuális ügy</td></tr>
              ) : openInteractions.map((r, i) => (
                <tr key={i}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{r.date ? new Date(r.date).toLocaleDateString('hu-HU') : '—'}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.date ? new Date(r.date).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                  </td>
                  <td style={tdStyle}>{r.channel}</td>
                  <td style={tdStyle}><DirectionBadge value={r.direction} /></td>
                  <td style={tdStyle}><span style={{ fontSize: 13, textTransform: 'uppercase', fontWeight: 600 }}>{r.ugyTipus}</span></td>
                  <td style={tdStyle}><EredmenyBadge value={r.eredmeny} /></td>
                  <td style={tdStyle}><StatuszBadge value={r.statusz} /></td>
                  <td style={tdStyle}>{r.teendo}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <input type="checkbox" checked={r.done} readOnly style={{ width: 16, height: 16, accentColor: '#1ceee0', cursor: 'default' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ Korábbi Interakciók Table ═══ */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 16, color: '#4b5563', textTransform: 'uppercase' }}>Korábbi interakciók</h3>
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', opacity: 0.85 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'white' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={thStyle}>Interakció időpontja</th>
                <th style={thStyle}>Csatorna</th>
                <th style={thStyle}>Interakció iránya</th>
                <th style={thStyle}>Ügytípus</th>
                <th style={thStyle}>Eredmény</th>
                <th style={thStyle}>Státusz</th>
                <th style={thStyle}>Teendő</th>
                <th style={thStyle}>Napló</th>
              </tr>
            </thead>
            <tbody>
              {closedInteractions.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Nincs korábbi interakció</td></tr>
              ) : closedInteractions.slice(0, 20).map((r, i) => (
                <tr key={i}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{r.date ? new Date(r.date).toLocaleDateString('hu-HU') : '—'}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.date ? new Date(r.date).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                  </td>
                  <td style={tdStyle}>{r.channel}</td>
                  <td style={tdStyle}><DirectionBadge value={r.direction} /></td>
                  <td style={tdStyle}><span style={{ fontSize: 13, textTransform: 'uppercase', fontWeight: 600 }}>{r.ugyTipus}</span></td>
                  <td style={tdStyle}><EredmenyBadge value={r.eredmeny} /></td>
                  <td style={tdStyle}><StatuszBadge value={r.statusz} /></td>
                  <td style={tdStyle}>{r.teendo}</td>
                  <td style={tdStyle}>
                    <button style={{ background: 'rgba(28,238,224,0.1)', border: '1px solid var(--accent, #1ceee0)', color: 'var(--accent, #1ceee0)', borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      Megtekintés
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {closedInteractions.length > 20 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>+ {closedInteractions.length - 20} további</div>
        )}
      </div>

      {/* ═══ Profile Edit Modal ═══ */}
      {showProfileEdit && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowProfileEdit(false)}>
          <div style={{ background: 'white', borderRadius: 16, width: 440, maxWidth: '90vw', boxShadow: '0 24px 48px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 28px 0' }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>Profil módosítása</h3>
              <button onClick={() => setShowProfileEdit(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 22, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, fontFamily: 'inherit' }}
                onMouseOver={e => (e.currentTarget.style.color = '#374151')}
                onMouseOut={e => (e.currentTarget.style.color = '#9ca3af')}
              >×</button>
            </div>

            {/* Form */}
            <div style={{ padding: '24px 28px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>Név</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} placeholder={client.name} style={modalInputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>Telefonszám</label>
                <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+36 30 ..." style={modalInputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>Email cím</label>
                <input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="email@példa.hu" style={modalInputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>Megjegyzés</label>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Adminisztrációs megjegyzések..." rows={4}
                  style={{ ...modalInputStyle, resize: 'vertical', minHeight: 80 }}
                />
              </div>

              {/* Footer buttons */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 4 }}>
                <button onClick={() => setShowProfileEdit(false)} style={{ padding: '11px 24px', background: 'white', color: '#374151', border: '1.5px solid #d1d5db', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                  onMouseOver={e => (e.currentTarget.style.borderColor = '#9ca3af')}
                  onMouseOut={e => (e.currentTarget.style.borderColor = '#d1d5db')}
                >Mégsem</button>
                <button onClick={saveProfile} disabled={saving} style={{ padding: '11px 24px', background: '#1a1a1a', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                  onMouseOver={e => (e.currentTarget.style.background = '#333')}
                  onMouseOut={e => (e.currentTarget.style.background = '#1a1a1a')}
                >{saving ? 'Mentés...' : 'Mentés'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared styles ──
const thStyle: React.CSSProperties = {
  padding: '16px',
  fontSize: 11,
  fontWeight: 600,
  color: '#6b8b99',
  borderBottom: '1px solid var(--border)',
  textTransform: 'uppercase',
};

const tdStyle: React.CSSProperties = {
  padding: '16px',
  fontSize: 13,
  borderBottom: '1px solid var(--border)',
  color: 'var(--text)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  border: '1.5px solid var(--border, #e5e7eb)',
  borderRadius: 10,
  fontSize: 14,
  color: 'var(--text)',
  fontFamily: 'inherit',
  outline: 'none',
  background: 'var(--bg, #fff)',
  boxSizing: 'border-box',
};

const modalInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  border: '1.5px solid #e5e7eb',
  borderRadius: 10,
  fontSize: 15,
  color: '#1a1a1a',
  fontFamily: 'inherit',
  outline: 'none',
  background: '#fafafa',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};
