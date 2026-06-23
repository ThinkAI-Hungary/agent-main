/**
 * ClientDetailView â€“ 1:1 port of legacy openClientDetails() / view-client-details
 * Rendered as inline overlay within ClientsPage or InteractionsPage.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useApproval } from '../../context/ApprovalContext';
import { parseCustomData, type ClientRecord } from '../../helpers/clientResolvers';
import { fmtDt } from '../../helpers/formatters';
import { authFetch } from '../../api/client';
import { showToast } from '../ui/Toast';
import type { SessionSummary } from '../../hooks/useSessions';
import type { CalendarEvent } from '../../hooks/useCalendarEvents';
import {
  detectUgyTipus,
  detectEredmeny,
  detectStatusz,
  detectTeendo,
} from '../../helpers/interactionClassifiers';
import { EredmenyBadge, StatuszBadge, DirectionBadge } from '../ui/Badge';
import InteractionSummaryModal from '../interactions/InteractionSummaryModal';

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
  sessionId: string | null;
  interactionId: number | null;
  result: string;
  ai_draft_response: string | null;
  approval_status: string | null;
}

export default function ClientDetailView({ client, clientsMap, sessions, events, source, onBack, onRefresh }: Props) {
  const { openApproval } = useApproval();
  const [notes, setNotes] = useState(() => {
    const cd = parseCustomData(client.raw.custom_data);
    return (cd?.notes as string) || (cd?.megjegyzes as string) || '';
  });
  const [saving, setSaving] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [summaryModalRow, setSummaryModalRow] = useState<InteractionRowDetail | null>(null);
  const [editName, setEditName] = useState(client.name);
  const [editEmail, setEditEmail] = useState(client.email);
  const [editPhone, setEditPhone] = useState(client.phone);
  const [editNotes, setEditNotes] = useState(() => {
    const c = parseCustomData(client.raw.custom_data);
    return (c?.notes as string) || (c?.megjegyzes as string) || '';
  });

  // Local display states for optimistic updates
  const [displayName, setDisplayName] = useState(client.name);
  const [displayPhone, setDisplayPhone] = useState(client.phone);
  const [displayEmail, setDisplayEmail] = useState(client.email);

  const [cd, setCd] = useState(() => parseCustomData(client.raw.custom_data));
  // Keep cd in sync if client prop changes (e.g. after parent refetch)
  useEffect(() => {
    setCd(parseCustomData(client.raw.custom_data));
  }, [client.raw.custom_data]);

  // Auto-fetch profile picture from Meta if not cached
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>((cd?.profile_pic_url as string) || null);
  useEffect(() => {
    if (profilePicUrl) return; // Already have it
    if (!cd?.messenger_id) return; // No messenger ID to look up
    let cancelled = false;
    authFetch(`/admin/api/clients/${client.id}/profile-pic`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.profile_pic_url) {
          setProfilePicUrl(data.profile_pic_url);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [client.id, cd?.messenger_id, profilePicUrl, authFetch]);

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

  // Client interactions from sessions â€“ enriched with classifiers
  const clientInteractions = useMemo(() => {
    const name = client.name.toLowerCase().trim();
    const email = client.email.toLowerCase().trim();
    const phone = client.phone?.replace(/\s/g, '') || '';
    const clientId = String(client.id);
    // Get messenger_id from custom_data for matching against session_id
    const messengerId = ((cd?.messenger_id as string) || (cd?.messenger_psid as string) || '').toString().trim();

    const matchingSessions = sessions.filter((s) => {
      const participant = (s.participant || s.client_name || '').toLowerCase().trim();
      const sid = s.session_id || '';

      // 1. Match by participant name (exact or partial)
      if (name && participant && participant !== 'ismeretlen' && (
        participant === name ||
        participant.includes(name) ||
        (name.length > 2 && name.includes(participant) && participant.length > 2)
      )) return true;

      // 2. Match by email in session_id
      if (email && sid.includes(email)) return true;

      // 3. Match by messenger_id in session_id (e.g. session_id = "messenger_12345")
      if (messengerId) {
        if (sid === `messenger_${messengerId}` || sid === `instagram_${messengerId}` || sid === `whatsapp_${messengerId}`) return true;
      }

      // 4. Match by client_id from interactions
      if (s.interactions && s.interactions.length > 0) {
        if (s.interactions.some((r) => r.client_id && String(r.client_id) === clientId)) return true;
      }

      // 5. Match by phone in session_id
      if (phone && sid.includes(phone)) return true;

      return false;
    });

    const rows: InteractionRowDetail[] = [];
    matchingSessions.forEach((s) => {
      if (s.interactions && s.interactions.length > 0) {
        s.interactions.forEach((r) => {
          // Skip spam interactions
          if (r.approval_status === 'spam') return;
          const summary = r.summary || s.summary || '';
          const topic = r.topic || '';
          const channel = r.type || s.channel || 'Telefon';
          const direction = (r.direction || 'inbound').toLowerCase() === 'outbound' ? 'Kimenő' : 'Bejövő';
          rows.push({
            date: r.created_at || s.started_at || '',
            channel,
            direction,
            ugyTipus: detectUgyTipus(r),
            eredmeny: detectEredmeny(r),
            statusz: detectStatusz(r),
            teendo: detectTeendo(r),
            topic,
            summary,
            status: r.approval_status || 'lezárt',
            done: (r.approval_status || '').toLowerCase() === 'approved' || (r.approval_status || '').toLowerCase() === 'lezárt',
            sessionId: s.session_id || null,
            interactionId: r.id || null,
            result: r.result || '',
            ai_draft_response: r.ai_draft_response || null,
            approval_status: r.approval_status || null,
          });
        });
      } else {
        const summary = s.summary || '';
        rows.push({
          date: s.started_at || '',
          channel: s.channel || 'Telefon',
          direction: 'Bejövő',
          ugyTipus: detectUgyTipus({ topic: '', summary }),
          eredmeny: detectEredmeny({ topic: '', summary }),
          statusz: 'LEZĂÂRT',
          teendo: 'Nincs teendő',
          topic: '',
          summary,
          status: 'lezárt',
          done: true,
          sessionId: s.session_id || null,
          interactionId: null,
          result: '',
          ai_draft_response: null,
          approval_status: null,
        });
      }
    });
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return rows;
  }, [client, sessions, cd]);

  const openInteractions = clientInteractions.filter((r) => r.status === 'pending' || r.status === 'nyitott' || r.statusz === 'NYITOTT');
  const closedInteractions = clientInteractions.filter((r) => r.status !== 'pending' && r.status !== 'nyitott' && r.statusz !== 'NYITOTT');

  // Save notes
  const saveNotes = useCallback(async (value: string) => {
    setSaving(true);
    try {
      const updatedCd = { ...cd, notes: value };
      const res = await authFetch(`/admin/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_data: updatedCd }),
      });
      if (res.ok) showToast('Jegyzetek mentve');
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
    try {
      const res = await authFetch(`/admin/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_data: updatedCd }),
      });
      if (res.ok) { setCd(updatedCd); showToast(`Címke hozzáadva: ${tag}`); onRefresh(); }
      else showToast('Hiba a mentés során', 'error');
    } catch { showToast('Hiba', 'error'); }
    setShowTagPicker(false);
    setCustomTag('');
  }, [cd, client.id, onRefresh]);

  // Remove tag
  const removeTag = useCallback(async (tag: string) => {
    const currentTags = (cd?.tags as string[]) || [];
    const updatedTags = currentTags.filter(t => t !== tag);
    const updatedCd = { ...cd, tags: updatedTags };
    try {
      const res = await authFetch(`/admin/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_data: updatedCd }),
      });
      if (res.ok) { setCd(updatedCd); showToast('Címke eltávolítva'); onRefresh(); }
      else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [cd, client.id, onRefresh]);

  // Save profile
  const saveProfile = useCallback(async () => {
    setSaving(true);
    try {
      const updatedCd = { ...cd, name: editName, email: editEmail, telefonszam: editPhone, notes: editNotes };
      const res = await authFetch(`/admin/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_data: updatedCd }),
      });
      if (res.ok) {
        setCd(updatedCd);
        setDisplayName(editName);
        setDisplayPhone(editPhone);
        setDisplayEmail(editEmail);
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
      <div className="flex-between mb-20">
        <button
          className="btn btn-ghost btn-ghost--accent"
          onClick={onBack}
        >
          <span>← </span>
          {source === 'interactions' ? 'Vissza az interakciós listához' : 'Vissza az ügyféllistához'}
        </button>
      </div>

      {/* • • •  Top Card (Mint gradient) • • •  */}
      <div className="cd-top-card-full">
        {/* Left: Avatar & Info */}
        <div className="flex-row cd-avatar-row">
          {profilePicUrl ? (
            <img
              src={profilePicUrl}
              alt={client.name}
              className="cd-profile-pic"
              onError={() => setProfilePicUrl(null)}
            />
          ) : null}
          <div className={`cd-avatar-placeholder${profilePicUrl ? ' cd-avatar-placeholder--hidden' : ''}`}>
            <svg fill="none" height="28" stroke="#1ceee0" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="28">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <div className="flex-row gap-12 cd-name-row">
              <h2 className="cd-client-name">{displayName}</h2>
              <span className="cd-status-badge" style={{ background: sl.bg, color: sl.color }}>{sl.text}</span>
            </div>
            <div className="cd-client-sub">
              Eaisydesk azonosító: {client.id}
            </div>
            <div className="cd-info-contact cd-contact-info">
              <div className="flex-row gap-8">
                <svg fill="none" height="16" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" className="cd-contact-icon">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <span className="cd-contact-value">{displayPhone || 'Nincs megadva'}</span>
              </div>
              <div className="flex-row gap-8">
                <svg fill="none" height="16" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" className="cd-contact-icon">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <span className="cd-contact-value">{displayEmail || 'Nincs megadva'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Profile Edit & Registration Date */}
        <div className="cd-right-panel cd-right-panel-inner">
          <button
            className="btn btn-ghost"
            onClick={() => setShowProfileEdit(true)}
          >
            <svg fill="none" height="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="16">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Profil módosítása
          </button>
          <div className="cd-regdate-card">
            <div className="cd-regdate-label">
              <svg fill="none" height="12" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              Regisztrálva:
            </div>
            <div className="cd-regdate-value">{regDate}</div>
          </div>
        </div>
      </div>

      {/* ââ€˘Âââ€˘Âââ€˘Â Middle Cards: Tags, Appointments, Notes ââ€˘Âââ€˘Âââ€˘Â */}
      <div className="cd-middle-grid cd-middle-grid-inner">
        {/* Tags */}
        <div className="cd-inner-card">
          <h3 className="cd-section-title">Címkék</h3>
          <div className="flex-row flex-wrap gap-8">
            {((cd?.tags as string[]) || []).length === 0 && <span className="cd-empty-tag">Nincs címke</span>}
            {((cd?.tags as string[]) || []).map((t) => (
              <span key={t} className="cd-tag-chip">
                {t}
                <button onClick={() => removeTag(t)} className="cd-tag-remove">×</button>
              </span>
            ))}
          </div>
          <div className="cd-tag-picker-wrap">
            <button onClick={() => setShowTagPicker(!showTagPicker)} className="cd-tag-add-btn">+ Címke hozzáadása</button>
            {showTagPicker && (
              <div className="cd-tag-picker-panel">
                <div className="cd-tag-picker-header">Előre definiált címkék</div>
                <div className="flex-col gap-4">
                  {PREDEFINED_TAGS.filter(t => !((cd?.tags as string[]) || []).includes(t.label)).map(t => (
                    <button key={t.label} onClick={() => addTag(t.label)} className="cd-predefined-tag" style={{ background: t.bg, color: t.color }}
                      onMouseOver={e => (e.currentTarget.style.opacity = '0.8')}
                      onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                    >{t.label}</button>
                  ))}
                </div>
                <div className="cd-tag-picker-divider" />
                <div className="flex-row gap-6">
                  <input value={customTag} onChange={e => setCustomTag(e.target.value)} placeholder="Egyéni címke..." className="cd-custom-tag-input"
                    onKeyDown={e => { if (e.key === 'Enter' && customTag.trim()) { addTag(customTag.trim()); } }}
                  />
                  <button onClick={() => { if (customTag.trim()) addTag(customTag.trim()); }} className="cd-custom-tag-btn">Hozzáadás</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Previous Appointments */}
        <div className="cd-inner-card--appt">
          <h3 className="cd-section-title">Korábbi időpontok</h3>
          <div className="flex-col gap-8">
            {(() => {
              const past = clientAppointments.filter(ev => ev.start_dt && new Date(ev.start_dt) < new Date());
              if (past.length === 0) return <span className="cd-appt-empty">Nincs korábbi foglalás.</span>;
              return (
                <>
                  {past.slice(0, 3).map((ev, i) => (
                    <div key={i} className="flex-row gap-8 cd-appt-row">
                      <svg fill="none" height="14" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      {ev.start_dt ? fmtDt(ev.start_dt) : 'â€”'}
                    </div>
                  ))}
                  {past.length > 3 && (
                    <div className="cd-appt-showmore">
                      Összes időpont ({past.length})
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Notes */}
        <div className="cd-inner-card--notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => saveNotes(notes)}
            placeholder="Megjegyzés"
            className="cd-notes-textarea"
          />
        </div>
      </div>

      {/* Total interactions count */}
      <div className="cd-int-count">
        Összes interakció: {clientInteractions.length}
      </div>

      {/* â• â• â•  Aktuális Ügyek Table â• â• â•  */}
      <div className="mb-32">
        <h3 className="form-label form-label--uppercase">Aktuális ügyek</h3>
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Interakció időpontja</th>
                <th>Csatorna</th>
                <th>Interakció iránya</th>
                <th>Ügytípus</th>
                <th>Eredmény</th>
                <th>Státusz</th>
                <th>Teendő</th>
              </tr>
            </thead>
            <tbody>
              {openInteractions.length === 0 ? (
                <tr><td colSpan={7} className="empty-state">Nincs aktuális ügy</td></tr>
              ) : openInteractions.map((r, i) => (
                <tr key={i}>
                  <td>
                    <div className="cd-date-primary">{r.date ? new Date(r.date).toLocaleDateString('hu-HU') : '-'}</div>
                    <div className="cd-date-time">{r.date ? new Date(r.date).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                  </td>
                  <td>{r.channel}</td>
                  <td><DirectionBadge value={r.direction} /></td>
                  <td><span className="cd-ugytipus">{r.ugyTipus}</span></td>
                  <td><EredmenyBadge value={r.eredmeny} /></td>
                  <td><StatuszBadge value={r.statusz} /></td>
                  <td>
                    {r.teendo === 'Jóváhagyásra vár' ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openApproval({
                            interactionId: r.interactionId,
                            sessionId: r.sessionId,
                            clientName: client.name,
                            channel: r.channel,
                            date: r.date,
                            topic: r.topic,
                            summary: r.summary,
                            aiDraftResponse: r.ai_draft_response || undefined,
                            approvalStatus: r.approval_status || undefined,
                          });
                        }}
                        className="btn btn-warning"
                      >
                        Jóváhagyásra vár
                      </button>
                    ) : (
                      <span className="cd-teendo-muted">{r.teendo}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Korábbi Interakciók Table ── */}
      <div className="mb-32">
        <h3 className="form-label form-label--uppercase">Korábbi interakciók</h3>
        <div className="table-card table-card--dim">
          <table className="data-table">
            <thead>
              <tr>
                <th>Interakció időpontja</th>
                <th>Csatorna</th>
                <th>Interakció iránya</th>
                <th>Ügytípus</th>
                <th>Eredmény</th>
                <th>Státusz</th>
                <th>Teendő</th>
                <th>Napló</th>
              </tr>
            </thead>
            <tbody>
              {closedInteractions.length === 0 ? (
                <tr><td colSpan={8} className="empty-state">Nincs korábbi interakció</td></tr>
              ) : closedInteractions.slice(0, 20).map((r, i) => (
                <tr key={i}>
                  <td>
                    <div className="cd-date-primary">{r.date ? new Date(r.date).toLocaleDateString('hu-HU') : '-'}</div>
                    <div className="cd-date-time">{r.date ? new Date(r.date).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                  </td>
                  <td>{r.channel}</td>
                  <td><DirectionBadge value={r.direction} /></td>
                  <td><span className="cd-ugytipus">{r.ugyTipus}</span></td>
                  <td><EredmenyBadge value={r.eredmeny} /></td>
                  <td><StatuszBadge value={r.statusz} /></td>
                  <td>
                    {r.teendo === 'Jóváhagyásra vár' ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openApproval({
                            interactionId: r.interactionId,
                            sessionId: r.sessionId,
                            clientName: client.name,
                            channel: r.channel,
                            date: r.date,
                            topic: r.topic,
                            summary: r.summary,
                            aiDraftResponse: r.ai_draft_response || undefined,
                            approvalStatus: r.approval_status || undefined,
                          });
                        }}
                        className="btn btn-warning"
                      >
                        Jóváhagyásra vár
                      </button>
                    ) : (
                      <span className="cd-teendo-muted">{r.teendo}</span>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSummaryModalRow(r); }}
                      className="btn btn-teal-sm"
                    >
                      Megtekintés
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {closedInteractions.length > 20 && (
          <div className="cd-more-label">+ {closedInteractions.length - 20} további</div>
        )}
      </div>

      {/* ââ€˘Â ââ€˘Â ââ€˘Â  Profile Edit Modal ââ€˘Â ââ€˘Â ââ€˘Â  */}
      {showProfileEdit && (
        <div className="modal-overlay" onClick={() => setShowProfileEdit(false)}>
          <div className="modal-card modal-card--480" onClick={e => e.stopPropagation()}>
            {/* Header â€” teal gradient */}
            <div className="cd-modal-header">
              <div className="flex-between">
                <div>
                  <div className="text-xs font-bold cd-modal-label">Ügyfélkezelés</div>
                  <h3 className="text-xl font-bold cd-modal-title">Profil módosítása</h3>
                </div>
                <button className="modal-close cd-modal-close" onClick={() => setShowProfileEdit(false)}>✕</button>
              </div>
            </div>

            {/* Form */}
            <div className="modal-body flex-col gap-16">
              <div className="form-group">
                <label className="form-label">Név</label>
                <input className="input" value={editName} onChange={e => setEditName(e.target.value)} placeholder={client.name} />
              </div>
              <div className="form-group">
                <label className="form-label">Telefonszám</label>
                <input className="input" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+36 30 ..." />
              </div>
              <div className="form-group">
                <label className="form-label">Email cím</label>
                <input className="input" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="email@példa.hu" />
              </div>
              <div className="form-group">
                <label className="form-label">Megjegyzés</label>
                <textarea className="input" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Adminisztrációs megjegyzések..." rows={4}
                  className="input cd-textarea"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowProfileEdit(false)}>Mégsem</button>
              <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ââ€˘Â ââ€˘Â ââ€˘Â  Interaction Summary Modal ââ€˘Â ââ€˘Â ââ€˘Â  */}
      {summaryModalRow && (
        <InteractionSummaryModal
          row={{
            date: summaryModalRow.date,
            channel: summaryModalRow.channel,
            client: client.name,
            clientId: client.id,
            clientStatus: client.status,
            clientCreatedAt: client.created_at,
            direction: summaryModalRow.direction,
            ugyTipus: summaryModalRow.ugyTipus,
            eredmeny: summaryModalRow.eredmeny,
            statusz: summaryModalRow.statusz,
            teendo: summaryModalRow.teendo,
            tags: client.tags,
            type: summaryModalRow.channel,
            topic: summaryModalRow.topic,
            summary: summaryModalRow.summary,
            result: summaryModalRow.result,
            interactionId: summaryModalRow.interactionId,
            sessionId: summaryModalRow.sessionId,
            ai_draft_response: summaryModalRow.ai_draft_response,
            approval_status: summaryModalRow.approval_status,
          }}
          onClose={() => setSummaryModalRow(null)}
          clients={Object.values(clientsMap)}
          clientsMap={clientsMap}
        />
      )}
    </div>
  );
}

// â”€â”€ Shared styles â”€â”€
