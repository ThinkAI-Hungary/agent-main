/**
 * ClientDetailView – ügyfélprofil (eaisyDesk UI Kit)
 * Rendered as inline overlay within ClientsPage or InteractionsPage.
 * Kézi teendők: a tasks táblába kerülnek (client_id kötéssel), a member
 * irányítópult Teendők szekciójában is megjelennek.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseCustomData, type ClientRecord } from '../../helpers/clientResolvers';
import { fmtDt, formatPhoneHu, normalizeNameKey } from '../../helpers/formatters';
import { authFetch } from '../../api/client';
import { showToast } from '../ui/Toast';
import type { SessionSummary } from '../../hooks/useSessions';
import type { CalendarEvent } from '../../hooks/useCalendarEvents';
import {
  detectUgyTipus,
  detectEredmeny,
  detectStatusz,
  detectTeendo,
  getTagColor,
} from '../../helpers/interactionClassifiers';
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
  source: 'clients' | 'interactions' | 'calendar' | 'kanban' | 'member';
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

interface ManualTask {
  id: number;
  text: string;
  priority: string;
  completed: number;
  created_at: string;
  client_id: number | null;
}

// UI Kit csatorna-ikonok (mockup szerinti chipekhez)
const CP_CHANNEL_ICONS: Record<string, React.ReactNode> = {
  Telefon: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
  Email: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22 6 12 13 2 6" /></>,
  WhatsApp: <><path d="M12 3a9 9 0 0 0-7.72 13.44L3 21l4.78-1.22A9 9 0 1 0 12 3z" /><g transform="translate(6 6) scale(0.5)"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></g></>,
  Messenger: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /><g transform="translate(6.5 7) scale(0.5)"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></g></>,
  Instagram: <><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></>,
};

function CpChannelCell({ name }: { name: string }) {
  const icon = CP_CHANNEL_ICONS[name];
  return (
    <span className="cp-channel">
      {icon && (
        <span className="cp-ch">
          <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">{icon}</svg>
        </span>
      )}
      {name}
    </span>
  );
}

function cpStatusVariant(statusz: string): 'err' | 'open' | 'closed' {
  const s = (statusz || '').toLowerCase();
  if (s === 'sürgős' || s === 'surgos') return 'err';
  if (s === 'nyitott') return 'open';
  return 'closed';
}

function CpStatusBadge({ value }: { value: string }) {
  const v = cpStatusVariant(value);
  const label = v === 'err' ? 'Sürgős' : v === 'open' ? 'Nyitott' : 'Lezárt';
  return (
    <span className={`cp-badge cp-${v}`}>
      <i className="cp-dot" />
      {label}
    </span>
  );
}

// Teendő-cellák — egységesen sima szöveg (a státusz pill adja a színes jelzést)
function CpTeendoCell({ value }: { value: string }) {
  const t = (value || '').toLowerCase();
  if (!value || t === 'nincs további teendő') {
    return <span className="cp-result">Nincs további teendő</span>;
  }
  return <span className="cp-todo-text">{value}</span>;
}

function CpDirBadge({ value }: { value: string }) {
  return (
    <span className={`cp-dirbadge ${value === 'Kimenő' ? 'cp-dir-out' : 'cp-dir-in'}`}>
      {value || '—'}
    </span>
  );
}

export default function ClientDetailView({ client, clientsMap, sessions, events, source, onBack, onRefresh }: Props) {
  const navigate = useNavigate();
  const [notes, setNotes] = useState(() => {
    const cd = parseCustomData(client.raw.custom_data);
    return (cd?.notes as string) || (cd?.megjegyzes as string) || '';
  });
  const [saving, setSaving] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const tagPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showTagPicker) return;
    function handle(e: MouseEvent) {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setShowTagPicker(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showTagPicker]);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  // hárompontos overflow menu a profil-műveletekhez
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showOverflowMenu) return;
    function handle(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showOverflowMenu]);
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
  }, [client.id, cd?.messenger_id, profilePicUrl]);

  // ── Kézi teendők (tasks tábla, client_id kötéssel) ──
  const [manualTasks, setManualTasks] = useState<ManualTask[]>([]);
  const loadManualTasks = useCallback(async () => {
    try {
      const res = await authFetch(`/admin/api/tasks?client_id=${client.id}`);
      if (res.ok) {
        const d = await res.json();
        setManualTasks(Array.isArray(d.tasks) ? d.tasks : []);
      }
    } catch { /* néma — a profil többi része működik nélküle is */ }
  }, [client.id]);
  useEffect(() => { loadManualTasks(); }, [loadManualTasks]);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskText, setTaskText] = useState('');
  const [taskPriority, setTaskPriority] = useState<'normal' | 'high'>('normal');
  const [taskSaving, setTaskSaving] = useState(false);
  // Teendő szerkesztő popup (#todoEditOverlay)
  const [editTask, setEditTask] = useState<ManualTask | null>(null);
  const [editTaskText, setEditTaskText] = useState('');

  const openTaskEdit = useCallback((t: ManualTask) => {
    setEditTask(t);
    setEditTaskText(t.text || '');
  }, []);

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

  // Escape zárja a popupokat (szerkesztő előbb, majd a hozzáadás modál)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editTask) { setEditTask(null); return; }
      if (showTaskModal) setShowTaskModal(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editTask, showTaskModal]);

  const addManualTask = useCallback(async () => {
    const text = taskText.trim();
    if (!text) return;
    setTaskSaving(true);
    try {
      const res = await authFetch('/admin/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, priority: taskPriority, client_id: Number(client.id) || null }),
      });
      if (res.ok) {
        showToast('Teendő hozzáadva');
        setShowTaskModal(false);
        setTaskText('');
        setTaskPriority('normal');
        loadManualTasks();
      } else {
        const err = await res.json().catch(() => null);
        showToast(err?.detail || 'Hiba a mentéskor', 'error');
      }
    } catch { showToast('Hiba', 'error'); }
    finally { setTaskSaving(false); }
  }, [taskText, taskPriority, client.id, loadManualTasks]);

  const toggleManualTask = useCallback(async (t: ManualTask) => {
    try {
      const res = await authFetch(`/admin/api/tasks/${t.id}/complete`, { method: 'PATCH' });
      if (res.ok) {
        showToast(t.completed ? 'Teendő újraaktiválva' : 'Teendő elkészültnek jelölve');
        loadManualTasks();
      } else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
  }, [loadManualTasks]);

  const openManualTasks = useMemo(() => manualTasks.filter(t => !t.completed), [manualTasks]);
  const closedManualTasks = useMemo(() => manualTasks.filter(t => !!t.completed), [manualTasks]);

  // Avatar monogram (inicialok)
  const avatarInitials = useMemo(() => {
    const n = (displayName || client.name || '?').trim();
    const parts = n.split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : n.substring(0, 2).toUpperCase();
  }, [displayName, client.name]);

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
          eredmeny: detectEredmeny({ topic: '', summary, approval_status: 'approved' }),
          statusz: 'Lezárt',
          teendo: 'Nincs további teendő',
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

  // Find the date of the latest finalized appointment ('Új időpont')
  const latestBookedDate = clientInteractions
    .filter(r => r.eredmeny.includes('Új időpont'))
    .reduce((latest, r) => {
      const d = r.date || '';
      return d > latest ? d : latest;
    }, '');

  const openInteractions = clientInteractions.filter((r) => {
    const sz = (r.statusz || '').toLowerCase();
    const st = (r.status || '').toLowerCase();
    const isPending = st === 'pending';
    const isOpenStatus = sz === 'nyitott' || sz === 'sürgős';

    // If it's an appointment preparation, check if it was resolved by a later booking
    if (r.eredmeny.includes('Időpont előkészítve') && latestBookedDate && r.date && r.date <= latestBookedDate) {
      return false; // resolved by a later booking
    }

    return isPending || isOpenStatus;
  });

  const closedInteractions = clientInteractions.filter((r) => {
    return !openInteractions.includes(r);
  });

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

  // „Elvégezve" checkbox — interakció státusz „Lezárt"-ra
  const handleMarkDone = useCallback(async (e: React.MouseEvent, interactionId: number | null) => {
    e.stopPropagation();
    if (!interactionId) { showToast('Nem azonosítható interakció', 'error'); return; }
    try {
      const res = await authFetch(`/admin/api/interactions/${interactionId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'lezárt' }),
      });
      if (res.ok) {
        showToast('Interakció lezárva');
        onRefresh();
      } else {
        showToast('Hiba a lezáráskor', 'error');
      }
    } catch {
      showToast('Hiba', 'error');
    }
  }, [onRefresh]);

  // Status (mockup: Új → info tint, egyéb → navy tint, inaktív → szürke)
  function statusLabel() {
    if (client.isInactive) return { text: 'Inaktív', cls: 'cp-grayb' };
    if (client.isNew) return { text: 'Új ügyfél', cls: 'cp-infob' };
    return { text: 'Visszatérő', cls: 'cp-navyb' };
  }
  const sl = statusLabel();

  const regDate = client.created_at ? new Date(client.created_at).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';

  // Értékesítési címkék — kizárólag ezek szerepelnek a hozzáadás panelen
  const PREDEFINED_TAGS: string[] = [
    'kampánylead',
    'potenciális ügyfél',
    'árkérdés',
    'no-show',
    'törölt időpont',
  ];

  // „Ma · 18:23" stílusú dátum a kézi teendőkhöz
  function taskDateLabel(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    const time = d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `Ma · ${time}`;
    const yesterday = new Date(today.getTime() - 86400000);
    if (d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate()) {
      return `Tegnap · ${time}`;
    }
    return `${d.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })} · ${time}`;
  }

  return (
    <div className="analytics-shell">
      {/* Back button */}
      <div className="flex-between mb-20">
        <button className="cd-back-btn" onClick={onBack}>
          <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="15" height="15"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          {source === 'calendar' ? 'Vissza a naptárhoz'
            : source === 'interactions' ? 'Vissza az interakciós naplóhoz'
            : source === 'kanban' ? 'Vissza az érdeklődőkezeléshez'
            : source === 'member' ? 'Vissza az irányítópulthoz'
            : 'Vissza az ügyféllistához'}
        </button>
      </div>

      {/* ═══ Hero kártya (mint) — pill + kebab, avatar, név, kontakt, regisztráció ═══ */}
      <div className="cd-top-card-full cd-hero">
        <div className="cd-hero-top">
          <span className="cd-hero-pill">Ügyfélprofil</span>
          <div className="cd-overflow-wrap" ref={overflowRef}>
            <button
              className="cd-overflow-btn"
              onClick={() => setShowOverflowMenu(!showOverflowMenu)}
              title="Műveletek"
              aria-label="Műveletek"
              aria-expanded={showOverflowMenu}
            >
              <svg fill="currentColor" viewBox="0 0 24 24" width="20" height="20">
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
            {showOverflowMenu && (
              <div className="cd-overflow-menu" role="menu">
                <button onClick={() => { setShowOverflowMenu(false); setShowProfileEdit(true); }}>
                  <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg>
                  Profil szerkesztése
                </button>
                <button onClick={async () => {
                  setShowOverflowMenu(false);
                  try {
                    // Az UTÁNKÖVETÉS oszlop kanonikus id-jának feloldása név szerint
                    // (a védett első oszlop id-ja eltérhet a konstansától)
                    let targetId = 'utankovetes';
                    try {
                      const colsRes = await authFetch('/admin/api/kanban_columns');
                      if (colsRes.ok) {
                        const d = await colsRes.json();
                        const cols: Array<{ id: string; name: string }> = Array.isArray(d?.columns) ? d.columns : [];
                        const hit = cols.find((c) => normalizeNameKey(c.name) === 'utankovetes');
                        if (hit) targetId = hit.id;
                      }
                    } catch { /* fallback: konstans id */ }
                    // 1) státusz az UTÁNKÖVETÉS oszlopra, 2) kanban_removed jelző törlése
                    const res = await authFetch(`/admin/api/clients/${client.id}/status`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: targetId }),
                    });
                    const updatedCd = { ...cd };
                    delete updatedCd.kanban_removed;
                    await authFetch(`/admin/api/clients/${client.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ custom_data: updatedCd }),
                    });
                    if (res.ok) {
                      showToast('Felvéve az érdeklődőkezelésbe');
                      onRefresh();
                    } else showToast('Hiba a felvételkor', 'error');
                  } catch { showToast('Hiba', 'error'); }
                }}>
                  <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                  Felvétel Érdeklődőkezelésbe
                </button>
                <button onClick={() => {
                  setShowOverflowMenu(false);
                  navigate('/outbound');
                  onBack();
                }}>
                  <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                  Kimenő kommunikáció indítása
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="cd-hero-id">
          {profilePicUrl ? (
            <img
              src={profilePicUrl}
              alt={client.name}
              className="cd-profile-pic cd-hero-ava"
              onError={() => setProfilePicUrl(null)}
            />
          ) : (
            <div className="cd-hero-ava cd-hero-ava--initials">{avatarInitials}</div>
          )}
          <div className="cd-hero-main">
            <div className="flex-row gap-10 cd-name-row">
              <h2 className="cd-client-name">{displayName}</h2>
              <span className={`cp-badge ${sl.cls}`}><i className="cp-dot" />{sl.text}</span>
            </div>
            <div className="cd-client-sub cd-hero-sub">eaisyDesk azonosító: {client.id}</div>
            <div className="cd-hero-contact">
              <span className={displayPhone ? '' : 'cd-contact-na'}>
                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                {displayPhone ? formatPhoneHu(displayPhone) : 'Nincs megadva'}
              </span>
              <span className={displayEmail ? '' : 'cd-contact-na'}>
                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                {displayEmail || 'Nincs megadva'}
              </span>
            </div>
          </div>
        </div>

        <div className="cd-hero-reg">
          Regisztráció időpontja: <b>{regDate}</b>
        </div>
      </div>

      {/* ═══ Középső kártyák: Időpontok · Címkék · Megjegyzés ═══ */}
      <div className="cd-middle-grid cd-middle-grid-inner">
        {/* Időpontok */}
        <div className="cd-inner-card cd-appts-card">
          <h3 className="cd-section-title">
            <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            Időpontok
          </h3>
          {(() => {
            const upcoming = clientAppointments.filter(ev => ev.start_dt && new Date(ev.start_dt) >= new Date())
              .sort((a, b) => (a.start_dt || '').localeCompare(b.start_dt || ''));
            const past = clientAppointments.filter(ev => ev.start_dt && new Date(ev.start_dt) < new Date());
            return (
              <>
                <div className="cd-appt-next">
                  <div className="cd-appt-next-label">Következő időpont</div>
                  {upcoming.length === 0 ? (
                    <span className="cd-appt-next-value is-empty">Nincs közelgő időpont</span>
                  ) : (
                    <div className="cd-appt-next-value" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span>
                        {upcoming[0].start_dt ? fmtDt(upcoming[0].start_dt) : '—'}
                        {(upcoming[0] as CalendarEvent & { title?: string }).title ? ` · ${(upcoming[0] as CalendarEvent & { title?: string }).title}` : ''}
                      </span>
                      <button
                        className="cd-appt-edit-btn"
                        title="Időpont szerkesztése a naptárban"
                        aria-label="Időpont szerkesztése a naptárban"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/admin/calendar', { state: { editEventId: upcoming[0].id } });
                        }}
                      >
                        <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                      </button>
                    </div>
                  )}
                </div>
                <div className="cd-appt-past">
                  {past.length === 0 && <div className="cd-appt-row" style={{ opacity: 0.7 }}>Nincs korábbi időpont</div>}
                  {past.slice(0, 2).map((ev, i) => (
                    <div key={i} className="flex-row gap-8 cd-appt-row">
                      <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="13" height="13"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
                      {ev.start_dt ? fmtDt(ev.start_dt) : '—'}
                    </div>
                  ))}
                  {past.length > 3 && (
                    <div className="cd-appt-showmore">Összes időpont ({past.length})</div>
                  )}
                </div>
              </>
            );
          })()}
        </div>

        {/* Címkék */}
        <div className="cd-inner-card">
          <h3 className="cd-section-title">
            <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
            Címkék
          </h3>
          <div className="flex-row flex-wrap gap-8">
            {((cd?.tags as string[]) || []).length === 0 && <span className="cd-empty-tag">Nincs címke</span>}
            {((cd?.tags as string[]) || []).map((t) => {
              const c = getTagColor(t);
              return (
                <span key={t} className="cd-tag-chip" style={{ background: c.bg, color: c.color }}>
                  <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
                  {t}
                  <button onClick={() => removeTag(t)} className="cd-tag-remove" aria-label={`Címke törlése: ${t}`}>
                    <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </span>
              );
            })}
          </div>
          <div className="cd-tag-picker-wrap" ref={tagPickerRef}>
            <button onClick={() => setShowTagPicker(!showTagPicker)} className="cd-tag-add-btn">+ Címke hozzáadása</button>
            {showTagPicker && (
              <div className="cd-tag-picker-panel">
                <div className="cd-tag-picker-header">Előre definiált címkék</div>
                <div className="cd-tag-picker-list">
                  {PREDEFINED_TAGS.filter(t => !((cd?.tags as string[]) || []).includes(t)).map(t => (
                    <button key={t} onClick={() => addTag(t)} className="cd-predefined-row">
                      <svg className="cd-predefined-tag-ic" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
                      <span>{t}</span>
                      <svg className="cd-predefined-plus" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                  ))}
                </div>
                <div className="cd-tag-picker-divider" />
                <div className="flex-row gap-6">
                  <input value={customTag} onChange={e => setCustomTag(e.target.value)} placeholder="Új címke..." className="cd-custom-tag-input"
                    onKeyDown={e => { if (e.key === 'Enter' && customTag.trim()) { addTag(customTag.trim()); } }}
                  />
                  <button onClick={() => { if (customTag.trim()) addTag(customTag.trim()); }} className="cd-custom-tag-btn">Hozzáadás</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Megjegyzés */}
        <div className="cd-inner-card cd-notes-card">
          <h3 className="cd-section-title">
            <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            Megjegyzés
          </h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => saveNotes(notes)}
            placeholder="Írj megjegyzést az ügyfélhez…"
            className="cd-notes-textarea"
          />
        </div>
      </div>

      {/* ═══ Beavatkozást igénylő interakciók + kézi teendők ═══ */}
      <div className="mb-32">
        <div className="cd-section-head">
          <h3 className="cd-int-section-title">
            Beavatkozást igénylő interakciók
            <span className="cd-int-section-count">{openInteractions.length + openManualTasks.length}</span>
          </h3>
          <button className="cd-add-task-btn" onClick={() => setShowTaskModal(true)}>
            <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="15" height="15"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Teendő hozzáadása
          </button>
        </div>
        <div className="cd-table-card">
          <div className="cd-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Interakció időpontja</th>
                <th>Csatorna</th>
                <th>Interakció iránya</th>
                <th>Ügytípus</th>
                <th>Eredmény</th>
                <th>Státusz</th>
                <th>Teendő</th>
                <th className="cd-done-col">Elvégezve</th>
              </tr>
            </thead>
            <tbody>
              {/* Kézi teendők pszeudo-sorai (legfelül) */}
              {openManualTasks.map((t) => (
                <tr
                  key={`task-${t.id}`}
                  className="cd-task-row row-task"
                  tabIndex={0}
                  onClick={() => openTaskEdit(t)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTaskEdit(t); } }}
                >
                  <td className="cd-time-cell">{taskDateLabel(t.created_at)}</td>
                  <td>
                    <span className="cp-channel">
                      <span className="cp-ch">
                        <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      </span>
                      Hozzáadott feladat
                    </span>
                  </td>
                  <td />
                  <td />
                  <td />
                  <td><CpStatusBadge value={t.priority === 'high' ? 'Sürgős' : 'Nyitott'} /></td>
                  <td>
                    <div className="todo-frame" title={t.text}>{t.text}</div>
                  </td>
                  <td className="cd-done-col" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="cp-done-check"
                      aria-label="Elvégezve"
                      title="Kipipálásra a teendő lezártra vált"
                      checked={false}
                      onChange={() => toggleManualTask(t)}
                    />
                  </td>
                </tr>
              ))}
              {openInteractions.length === 0 && openManualTasks.length === 0 ? (
                <tr><td colSpan={8}><div className="cp-empty">Nincs beavatkozást igénylő interakció.</div></td></tr>
              ) : openInteractions.map((r, i) => (
                <tr
                  key={i}
                  className={`cursor-pointer${(r.statusz || '').toLowerCase() === 'sürgős' ? ' cd-is-urgent' : ''}`}
                  onClick={() => setSummaryModalRow(r)}
                >
                  <td className="cd-time-cell">{r.date ? `${new Date(r.date).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })} · ${new Date(r.date).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}` : '-'}</td>
                  <td><CpChannelCell name={r.channel} /></td>
                  <td><CpDirBadge value={r.direction} /></td>
                  <td>{r.ugyTipus}</td>
                  <td className="cp-result">{r.eredmeny}</td>
                  <td><CpStatusBadge value={r.statusz} /></td>
                  <td><CpTeendoCell value={r.teendo} /></td>
                  {/* Elvégezve checkbox */}
                  <td className="cd-done-col" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="cp-done-check"
                      aria-label="Elvégezve"
                      title="Kipipálásra az interakció lezártra vált"
                      checked={false}
                      onChange={(e) => handleMarkDone(e as unknown as React.MouseEvent, r.interactionId)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* ── Lezárt interakciók Table ── */}
      <div className="mb-32">
        <div className="cd-section-head">
          <h3 className="cd-int-section-title">
            Lezárt interakciók
            <span className="cd-int-section-count">{closedInteractions.length + closedManualTasks.length}</span>
          </h3>
        </div>
        <div className="cd-table-card">
          <div className="cd-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Interakció időpontja</th>
                <th>Csatorna</th>
                <th>Interakció iránya</th>
                <th>Ügytípus</th>
                <th>Eredmény</th>
                <th>Státusz</th>
                <th>Teendő</th>
                <th className="cd-done-col">Elvégezve</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                if (closedInteractions.length === 0 && closedManualTasks.length === 0) {
                  return <tr><td colSpan={8}><div className="cp-empty">Nincs lezárt interakció.</div></td></tr>;
                }
                // kézi feladatok + interakciók együtt, dátum szerint csökkenő
                const merged: Array<{ key: string; sortKey: string; task?: ManualTask; row?: InteractionRowDetail }> = [
                  ...closedManualTasks.map((t) => ({ key: `task-${t.id}`, sortKey: t.created_at || '', task: t })),
                  ...closedInteractions.map((r) => ({ key: `int-${r.interactionId}-${r.sessionId}`, sortKey: r.date || '', row: r })),
                ].sort((a, b) => b.sortKey.localeCompare(a.sortKey));

                return merged.slice(0, 20).map((item) => {
                  if (item.task) {
                    const t = item.task;
                    return (
                      <tr
                        key={item.key}
                        className="cd-task-row row-task"
                        tabIndex={0}
                        onClick={() => openTaskEdit(t)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTaskEdit(t); } }}
                      >
                        <td className="cd-time-cell">{taskDateLabel(t.created_at)}</td>
                        <td>
                          <span className="cp-channel">
                            <span className="cp-ch">
                              <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            </span>
                            Hozzáadott feladat
                          </span>
                        </td>
                        <td />
                        <td />
                        <td />
                        <td><CpStatusBadge value="Lezárt" /></td>
                        <td>
                          <div className="todo-frame" title={t.text}>{t.text}</div>
                        </td>
                        <td className="cd-done-col" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="cp-done-check" checked disabled aria-label="Elvégezte" />
                        </td>
                      </tr>
                    );
                  }
                  const r = item.row!;
                  return (
                    <tr
                      key={item.key}
                      className="cursor-pointer"
                      onClick={() => setSummaryModalRow(r)}
                    >
                      <td className="cd-time-cell">{r.date ? `${new Date(r.date).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })} · ${new Date(r.date).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}` : '-'}</td>
                      <td><CpChannelCell name={r.channel} /></td>
                      <td><CpDirBadge value={r.direction} /></td>
                      <td>{r.ugyTipus}</td>
                      <td className="cp-result">{r.eredmeny}</td>
                      <td><CpStatusBadge value={r.statusz} /></td>
                      <td><CpTeendoCell value={r.teendo} /></td>
                      <td className="cd-done-col" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="cp-done-check" checked disabled aria-label="Elvégezte" />
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
          </div>
        </div>
        {closedInteractions.length > 20 && (
          <div className="cd-more-label">+ {closedInteractions.length - 20} további</div>
        )}
      </div>

      {/* • • •  Profile Edit Modal • • •  */}
      {showProfileEdit && (
        <div className="modal-overlay" onClick={() => setShowProfileEdit(false)}>
          <div className="modal-card modal-card--480" onClick={e => e.stopPropagation()}>
            <div className="cd-modal-header">
              <div className="flex-between">
                <div>
                  <div className="text-xs font-bold cd-modal-label">Ügyfélkezelés</div>
                  <h3 className="text-xl font-bold cd-modal-title">Profil szerkesztése</h3>
                </div>
                <button className="modal-close cd-modal-close" onClick={() => setShowProfileEdit(false)}>✕</button>
              </div>
            </div>

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
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowProfileEdit(false)}>Mégsem</button>
              <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</button>
            </div>
          </div>
        </div>
      )}

      {/* • • •  Új teendő Modal • • •  */}
      {/* ── Teendő szerkesztő popup (#todoEditOverlay) ── */}
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
              <label className="cd-task-modal-label" htmlFor="cdTaskEditText">Teendő leírása</label>
              <textarea
                id="cdTaskEditText"
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

      {showTaskModal && (
        <div className="modal-overlay" onClick={() => setShowTaskModal(false)}>
          <div className="cd-task-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Új teendő">
            <div className="cd-task-modal-head">
              <h3 className="modal-title">Új teendő</h3>
              <button className="cd-task-modal-x" onClick={() => setShowTaskModal(false)} aria-label="Bezárás">
                <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="cd-task-modal-body">
              <label className="cd-task-modal-label" htmlFor="cdTaskDesc">Teendő leírása</label>
              <textarea
                id="cdTaskDesc"
                className="cd-task-textarea"
                rows={3}
                value={taskText}
                onChange={e => setTaskText(e.target.value)}
                placeholder="Pl. Felhívni még egyszer…"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addManualTask(); }}
              />
              <div className="cd-task-modal-label" id="cdTaskSegLabel">Státusz</div>
              <div className="cd-task-seg" role="radiogroup" aria-labelledby="cdTaskSegLabel">
                <button
                  type="button"
                  role="radio"
                  aria-checked={taskPriority === 'normal'}
                  className={taskPriority === 'normal' ? 'is-on' : ''}
                  onClick={() => setTaskPriority('normal')}
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
                  Nyitott
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={taskPriority === 'high'}
                  className={taskPriority === 'high' ? 'is-on' : ''}
                  onClick={() => setTaskPriority('high')}
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  Sürgős
                </button>
              </div>
            </div>
            <div className="cd-task-modal-foot">
              <button className="cd-btn" onClick={() => setShowTaskModal(false)}>Mégse</button>
              <button className="cd-btn cd-btn-primary" onClick={addManualTask} disabled={taskSaving || !taskText.trim()}>
                {taskSaving ? 'Mentés...' : 'Mentés'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/*  Interaction Summary Modal  */}
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
