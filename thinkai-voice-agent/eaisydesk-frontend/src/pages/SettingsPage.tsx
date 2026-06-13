/**
 * SettingsPage (Tudástár) – Full 1:1 port of legacy page-settings.html
 * 3 tabs: eaisyDesk beállítások (agent), Céginformációk (praxis), Szabályok (rules)
 * All reads/writes directly to Supabase.
 */
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { authFetch } from '../api/client';
import { supabase } from '../lib/supabase';
import { showToast } from '../components/ui/Toast';
import Spinner from '../components/ui/Spinner';

// ── Tab definitions ──
const _TABS = [
  { id: 'agent', label: 'eaisyDesk beállítások', icon: 'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.07 1.18 2 2 0 012.07 0h3a2 2 0 012 1.72c.12.8.3 1.6.56 2.37a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.77.25 1.57.44 2.37.56A2 2 0 0122 14.92z' },
  { id: 'praxis', label: 'Céginformációk', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10' },
  { id: 'szabalyok', label: 'Szabályok', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8' },
] as const;

const DAYS = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// ── Types ──
interface AgentSettings {
  voice_id: string;
  tone: string;
  tone_custom: string;
  greeting: string;
  language: string;
  business_hours: Record<string, { open: string; close: string; enabled: boolean }>;
}

interface PraxisInfo {
  practice_name: string;
  markanev: string;
  szakterulet: string;
  kulcsszavak: string;
  faq: { question: string; answer: string }[];
  campaigns: { active: boolean; text: string }[];
  exceptions: string[];
  modositas_eng: string;
  lemondas_24h: string;
  figyelmezteto_szoveg: string;
  pacient_id_question: string;
  new_patient_required: string;
  new_patient_auto_visit: boolean;
  returning_patient_required: string;
  [key: string]: unknown;
}

interface CartesiaVoice { id: string; name: string; language?: string; }
interface Clinic { id?: number; name_and_address: string; access_info: string; }
interface Doctor { id?: number; name: string; specialty: string; related_services: string; }
interface Service { id?: number; service_name: string; duration_minutes: number; doctor_id?: number | null; note: string; }
interface TriageRule { id?: number; situation: string; priority: string; escalation_email: string; }
interface ReminderSettings { id?: number; reminder_enabled: boolean; reminder_hours: number; reminder_template: string; }
interface OutboundAutomation { id: number; name: string; trigger_type: string; enabled: boolean; delay_hours: number; message_template: string; }

const _TRIGGER_LABELS: Record<string, { label: string; desc: string }> = {
  'no_show': { label: 'No-show utáni üzenet', desc: 'Automatikus email küldése no-show címke esetén' },
  'inactive_client': { label: 'Inaktív ügyfél reaktiválás', desc: 'Email inaktívvá vált ügyfeleknek' },
  'follow_up': { label: 'Utánkövetés (elégedettség)', desc: 'Email küldése sikeres időpont után' },
  'price_inquiry_follow': { label: 'Ajánlatkövetés', desc: 'Follow-up árkérdés címkéjű ügyfeleknek' },
  'cancelled_no_rebook': { label: 'Lemondás utáni újrafoglalás', desc: 'Email, ha lemondtak és nem foglaltak újat' },
};
const _DELAY_OPTIONS = [
  { value: 0, label: 'Azonnal' }, { value: 24, label: '24 óra' }, { value: 48, label: '48 óra' },
  { value: 72, label: '72 óra' }, { value: 168, label: '7 nap' }, { value: 720, label: '30 nap' },
];

// ── Default states ──
const VOICE_AGENTS = [
  { id: 'Puck', name: 'GÁBOR', desc: 'Bizalomkeltő, megnyugtató' },
  { id: 'Kore', name: 'ESZTER', desc: 'Figyelmes, kedves' },
  { id: 'Charon', name: 'BENCE', desc: 'Fókuszált, magabiztos' },
];

// SVG Flag components
const FLAGS: Record<string, React.ReactNode> = {
  hu: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="36" height="8" fill="#cd2a3e" /><rect y="8" width="36" height="8" fill="#fff" /><rect y="16" width="36" height="8" fill="#436f4d" /></svg>,
  en: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="36" height="24" fill="#012169" /><path d="M0 0L36 24M36 0L0 24" stroke="#fff" strokeWidth="4" /><path d="M0 0L36 24M36 0L0 24" stroke="#C8102E" strokeWidth="2.5" /><path d="M18 0v24M0 12h36" stroke="#fff" strokeWidth="6" /><path d="M18 0v24M0 12h36" stroke="#C8102E" strokeWidth="3.5" /></svg>,
  de: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="36" height="8" fill="#000" /><rect y="8" width="36" height="8" fill="#D00" /><rect y="16" width="36" height="8" fill="#FFCE00" /></svg>,
  sk: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="36" height="8" fill="#fff" /><rect y="8" width="36" height="8" fill="#0B4EA2" /><rect y="16" width="36" height="8" fill="#EE1C25" /><path d="M5 4v16c0 3 4 5 7 6 3-1 7-3 7-6V4z" fill="#EE1C25" stroke="#fff" strokeWidth="1" /></svg>,
  ro: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="12" height="24" fill="#002B7F" /><rect x="12" width="12" height="24" fill="#FCD116" /><rect x="24" width="12" height="24" fill="#CE1126" /></svg>,
  sr: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="36" height="8" fill="#C6363C" /><rect y="8" width="36" height="8" fill="#0C4076" /><rect y="16" width="36" height="8" fill="#fff" /></svg>,
  hr: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="36" height="8" fill="#FF0000" /><rect y="8" width="36" height="8" fill="#fff" /><rect y="16" width="36" height="8" fill="#171796" /></svg>,
  fr: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="12" height="24" fill="#002395" /><rect x="12" width="12" height="24" fill="#fff" /><rect x="24" width="12" height="24" fill="#ED2939" /></svg>,
  es: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="36" height="6" fill="#c60b1e" /><rect y="6" width="36" height="12" fill="#ffc400" /><rect y="18" width="36" height="6" fill="#c60b1e" /></svg>,
  it: <svg viewBox="0 0 36 24" width="22" height="15"><rect width="12" height="24" fill="#009246" /><rect x="12" width="12" height="24" fill="#fff" /><rect x="24" width="12" height="24" fill="#CE2B37" /></svg>,
};

const LANGUAGE_OPTIONS = [
  { code: 'hu', label: 'magyar' },
  { code: 'en', label: 'angol' },
  { code: 'de', label: 'német' },
  { code: 'sk', label: 'szlovák' },
  { code: 'ro', label: 'román' },
  { code: 'sr', label: 'szerb' },
  { code: 'hr', label: 'horvát' },
  { code: 'fr', label: 'francia' },
  { code: 'es', label: 'spanyol' },
  { code: 'it', label: 'olasz' },
];

const defaultAgent: AgentSettings = {
  voice_id: 'Puck', tone: 'professional_friendly', tone_custom: '', greeting: '', language: 'hu',
  business_hours: Object.fromEntries(DAY_KEYS.map(d => [d, { open: '08:00', close: '17:00', enabled: d !== 'saturday' && d !== 'sunday' }])),
};

const defaultPraxis: PraxisInfo = {
  practice_name: '', markanev: '', szakterulet: '', kulcsszavak: '',
  faq: [], campaigns: [], exceptions: [],
  modositas_eng: 'igen', lemondas_24h: 'figyelmeztetoSzoveggel',
  figyelmezteto_szoveg: 'Tájékoztatjuk, hogy 24 órán belüli lemondás esetén rendelőnk külön szabályzata lehet érvényben.',
  pacient_id_question: 'Korábban járt már a rendelőnkben?',
  new_patient_required: 'Születési dátum, teljes név',
  new_patient_auto_visit: true,
  returning_patient_required: 'Páciens azonosító vagy telefonszám',
};

const defaultReminder: ReminderSettings = {
  reminder_enabled: false, reminder_hours: 24,
  reminder_template: 'Tisztelt {nev}! Emlékeztetjük, hogy {idopont} időpontban várjuk {szolgaltatas} kezelésre a {telephely} címen.',
};

export default function SettingsPage() {
  const location = useLocation();
  const validTabs = ['agent', 'praxis', 'szabalyok'];
  const tabFromUrl = location.pathname.split('/').pop() || '';
  const activeTab = validTabs.includes(tabFromUrl) ? tabFromUrl : 'agent';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Data states
  const [agent, setAgent] = useState<AgentSettings>(defaultAgent);
  const [praxis, setPraxis] = useState<PraxisInfo>(defaultPraxis);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [triageRules, setTriageRules] = useState<TriageRule[]>([]);
  const [reminder, setReminder] = useState<ReminderSettings>(defaultReminder);
  const [_voices, setVoices] = useState<CartesiaVoice[]>([]);
  const [_voicesLoading, setVoicesLoading] = useState(false);
  const [_automations, setAutomations] = useState<OutboundAutomation[]>([]);
  const [_inactivityDays, setInactivityDays] = useState(60);
  const [showGreetingInfo, setShowGreetingInfo] = useState(false);
  const [showLangDropdown, setShowLangDropdown] = useState(false);

  // ── Load Cartesia voices from FastAPI ──
  useEffect(() => {
    (async () => {
      setVoicesLoading(true);
      try {
        const res = await authFetch('/admin/api/cartesia/voices');
        if (res.ok) {
          const data: CartesiaVoice[] = await res.json();
          data.sort((a, b) => {
            const aHu = (a.language || '').startsWith('hu');
            const bHu = (b.language || '').startsWith('hu');
            if (aHu && !bHu) return -1;
            if (!aHu && bHu) return 1;
            return (a.name || '').localeCompare(b.name || '', 'hu');
          });
          setVoices(data);
        }
      } catch { /* voices not available */ }
      setVoicesLoading(false);
    })();
  }, []);

  // ── Load all data ──
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, praxisRes, clinicsRes, doctorsRes, servicesRes, triageRes, reminderRes] = await Promise.all([
        supabase.from('app_settings').select('value').eq('key', 'agent_settings').single(),
        supabase.from('app_settings').select('value').eq('key', 'praxisinfo').single(),
        supabase.from('clinics').select('*').order('id'),
        supabase.from('doctors').select('*').order('id'),
        supabase.from('services').select('*').order('id'),
        supabase.from('triage_rules').select('*').order('id'),
        supabase.from('reminder_settings').select('*').limit(1).single(),
      ]);

      if (settingsRes.data?.value) {
        const v = settingsRes.data.value;
        setAgent(prev => ({
          ...prev,
          voice_id: v.voice_id || v.voice || 'Puck',
          tone: v.tone || 'professional_friendly',
          tone_custom: v.tone_custom || '',
          greeting: v.greeting || '',
          language: v.language || 'hu',
          business_hours: v.business_hours || prev.business_hours,
        }));
      }
      if (praxisRes.data?.value) {
        const p = praxisRes.data.value;
        setPraxis(prev => ({
          ...prev,
          practice_name: p.practice_name || p.nev || '',
          markanev: p.markanev || '',
          szakterulet: p.szakterulet || '',
          kulcsszavak: p.kulcsszavak || '',
          faq: Array.isArray(p.faq) ? p.faq : [],
          campaigns: Array.isArray(p.campaigns) ? p.campaigns : [],
          exceptions: Array.isArray(p.exceptions) ? p.exceptions : [],
          modositas_eng: p.modositas_eng || 'igen',
          lemondas_24h: p.lemondas_24h || 'figyelmeztetoSzoveggel',
          figyelmezteto_szoveg: p.figyelmezteto_szoveg || prev.figyelmezteto_szoveg,
          pacient_id_question: p.pacient_id_question || prev.pacient_id_question,
          new_patient_required: p.new_patient_required || prev.new_patient_required,
          new_patient_auto_visit: p.new_patient_auto_visit ?? true,
          returning_patient_required: p.returning_patient_required || prev.returning_patient_required,
        }));
      }
      if (clinicsRes.data) setClinics(clinicsRes.data);
      if (doctorsRes.data) setDoctors(doctorsRes.data);
      if (servicesRes.data) setServices(servicesRes.data);
      if (triageRes.data) setTriageRules(triageRes.data);
      if (reminderRes.data) setReminder(reminderRes.data as ReminderSettings);

      // Automations
      const autoRes = await supabase.from('outbound_automations').select('*').order('id');
      if (autoRes.data) setAutomations(autoRes.data);

      // Inactivity days from localStorage
      const savedDays = localStorage.getItem('thinkai_inactivity_days');
      if (savedDays) setInactivityDays(parseInt(savedDays) || 60);
    } catch { /* first load */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Save handlers ──
  const saveAgent = useCallback(async () => {
    setSaving(true);
    try {
      const res = await authFetch('/admin/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent),
      });
      if (res.ok) {
        await supabase.from('app_settings').upsert({ key: 'agent_settings', value: agent });
        showToast('Beállítások mentve!', 'success');
      } else {
        showToast('Hiba a mentésnél', 'error');
      }
    } catch { showToast('Hiba a mentésnél', 'error'); }
    setSaving(false);
  }, [agent]);

  const savePraxis = useCallback(async () => {
    setSaving(true);
    try {
      const res = await authFetch('/admin/api/praxisinfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(praxis),
      });
      if (res.ok) {
        await supabase.from('app_settings').upsert({ key: 'praxisinfo', value: praxis });
        showToast('Céginformációk mentve!', 'success');
      } else {
        showToast('Hiba a mentésnél', 'error');
      }
    } catch { showToast('Hiba a mentésnél', 'error'); }
    setSaving(false);
  }, [praxis]);

  // ── CRUD for sub-tables ──
  const saveClinic = useCallback(async (clinic: Clinic, idx: number) => {
    if (clinic.id) {
      await supabase.from('clinics').update({ name_and_address: clinic.name_and_address, access_info: clinic.access_info }).eq('id', clinic.id);
    } else {
      const { data } = await supabase.from('clinics').insert({ name_and_address: clinic.name_and_address, access_info: clinic.access_info }).select().single();
      if (data) setClinics(prev => prev.map((c, i) => i === idx ? data : c));
    }
    showToast('Telephely mentve');
  }, []);

  const deleteClinic = useCallback(async (id: number | undefined, idx: number) => {
    if (id) {
      try {
        await authFetch(`/admin/api/clinics/${id}`, { method: 'DELETE' });
      } catch { /* ignore */ }
    }
    setClinics(prev => prev.filter((_, i) => i !== idx));
    showToast('Telephely törölve');
  }, []);

  const saveDoctor = useCallback(async (doc: Doctor, idx: number) => {
    if (doc.id) {
      await supabase.from('doctors').update({ name: doc.name, specialty: doc.specialty, related_services: doc.related_services }).eq('id', doc.id);
    } else {
      const { data } = await supabase.from('doctors').insert({ name: doc.name, specialty: doc.specialty, related_services: doc.related_services }).select().single();
      if (data) setDoctors(prev => prev.map((d, i) => i === idx ? data : d));
    }
    showToast('Orvos mentve');
  }, []);

  const deleteDoctor = useCallback(async (id: number | undefined, idx: number) => {
    if (id) {
      try {
        await authFetch(`/admin/api/doctors/${id}`, { method: 'DELETE' });
      } catch { /* ignore */ }
    }
    setDoctors(prev => prev.filter((_, i) => i !== idx));
    showToast('Orvos törölve');
  }, []);

  const saveService = useCallback(async (svc: Service, idx: number) => {
    if (svc.id) {
      await supabase.from('services').update({ service_name: svc.service_name, duration_minutes: svc.duration_minutes, doctor_id: svc.doctor_id, note: svc.note }).eq('id', svc.id);
    } else {
      const { data } = await supabase.from('services').insert({ service_name: svc.service_name, duration_minutes: svc.duration_minutes, doctor_id: svc.doctor_id, note: svc.note }).select().single();
      if (data) setServices(prev => prev.map((s, i) => i === idx ? data : s));
    }
    showToast('Szolgáltatás mentve');
  }, []);

  const deleteService = useCallback(async (id: number | undefined, idx: number) => {
    if (id) {
      try {
        await authFetch(`/admin/api/services/${id}`, { method: 'DELETE' });
      } catch { /* ignore */ }
    }
    setServices(prev => prev.filter((_, i) => i !== idx));
    showToast('Szolgáltatás törölve');
  }, []);

  const saveTriageRule = useCallback(async (rule: TriageRule, idx: number) => {
    if (rule.id) {
      await supabase.from('triage_rules').update({ situation: rule.situation, priority: rule.priority, escalation_email: rule.escalation_email }).eq('id', rule.id);
    } else {
      const { data } = await supabase.from('triage_rules').insert({ situation: rule.situation, priority: rule.priority, escalation_email: rule.escalation_email }).select().single();
      if (data) setTriageRules(prev => prev.map((r, i) => i === idx ? data : r));
    }
    showToast('Triázs szabály mentve');
  }, []);

  const deleteTriageRule = useCallback(async (id: number | undefined, idx: number) => {
    if (id) {
      try {
        await authFetch(`/admin/api/triage_rules/${id}`, { method: 'DELETE' });
      } catch { /* ignore */ }
    }
    setTriageRules(prev => prev.filter((_, i) => i !== idx));
    showToast('Szabály törölve');
  }, []);

  const _saveReminder = useCallback(async () => {
    setSaving(true);
    try {
      if (reminder.id) {
        await supabase.from('reminder_settings').update({ reminder_enabled: reminder.reminder_enabled, reminder_hours: reminder.reminder_hours, reminder_template: reminder.reminder_template }).eq('id', reminder.id);
      } else {
        const { data } = await supabase.from('reminder_settings').insert({ reminder_enabled: reminder.reminder_enabled, reminder_hours: reminder.reminder_hours, reminder_template: reminder.reminder_template }).select().single();
        if (data) setReminder(data as ReminderSettings);
      }
      showToast('Emlékeztető mentve');
    } catch { showToast('Hiba', 'error'); }
    setSaving(false);
  }, [reminder]);

  const handleSave = useCallback(() => {
    if (activeTab === 'agent') saveAgent();
    else if (activeTab === 'praxis') savePraxis();
    else savePraxis(); // szabályok are stored in praxisinfo
  }, [activeTab, saveAgent, savePraxis]);

  if (loading) {
    return <div className="analytics-shell" style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>;
  }

  return (
    <div className="page active" id="page-settings">

          {/* ═══════════ eaisyDesk BEÁLLÍTÁSOK TAB ═══════════ */}
          {activeTab === 'agent' && (
            <div>
              {/* ── Page Header ── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 6, background: 'linear-gradient(135deg, rgba(28,238,224,0.15), rgba(59,130,246,0.12))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg fill="none" stroke="#1ceee0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="22" height="22">
                      <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>eaisyDesk beállítások</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Nyelv, kommunikáció, hang és üdvözlőszöveg beállításai</div>
                  </div>
                </div>
                <button className="btn-settings-save" onClick={handleSave} disabled={saving} style={{ fontFamily: 'inherit', padding: '10px 24px', fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {saving ? 'Mentés...' : 'Változtatások mentése'}
                </button>
              </div>

              {/* ══════ 1. ALAPBEÁLLÍTÁSOK ══════ */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(28,238,224,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg fill="none" stroke="#1ceee0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14">
                      <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                    </svg>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Alapbeállítások</span>
                  <div title="Az AI válaszgenerálás nyelve (messenger, email, WhatsApp, Instagram csatornákra). A telefonos voice agent fix magyar marad." style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>i</span>
                  </div>
                </div>
                <div className="settings-section" style={{ padding: 24 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                    {/* Nyelv beállítása */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(28,238,224,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13"><path d="M5 8l6 10M4 14h6M2 5h12M7 2v3M11 2a17 17 0 010 18M13 18h9M22 22l-4-4M17 13l5 9" /></svg>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1ceee0' }}>Nyelv beállítása</span>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <div
                          onClick={() => setShowLangDropdown(!showLangDropdown)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px', borderRadius: 10,
                            border: '1.5px solid var(--border)', background: 'var(--bg)',
                            cursor: 'pointer', transition: 'all 0.2s ease',
                            minWidth: 180,
                          }}
                        >
                          <div style={{ width: 22, height: 15, borderRadius: 2, overflow: 'hidden', flexShrink: 0, display: 'flex' }}>
                            {FLAGS[agent.language] || FLAGS.hu}
                          </div>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                            {LANGUAGE_OPTIONS.find(l => l.code === agent.language)?.label || 'magyar'}
                          </span>
                          <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14" style={{ transition: 'transform 0.2s', transform: showLangDropdown ? 'rotate(180deg)' : 'rotate(0)' }}>
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </div>
                        {showLangDropdown && (
                          <>
                            <div onClick={() => setShowLangDropdown(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                            <div style={{
                              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                              background: 'var(--card-bg, #fff)', border: '1.5px solid var(--border)',
                              borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                              zIndex: 100, overflow: 'hidden', maxHeight: 240, overflowY: 'auto',
                            }}>
                              {LANGUAGE_OPTIONS.map(l => (
                                <div
                                  key={l.code}
                                  onClick={() => { setAgent({ ...agent, language: l.code }); setShowLangDropdown(false); }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 14px', cursor: 'pointer',
                                    background: agent.language === l.code ? 'rgba(28,238,224,0.08)' : 'transparent',
                                    transition: 'background 0.15s',
                                  }}
                                  onMouseEnter={e => { if (agent.language !== l.code) (e.currentTarget as HTMLDivElement).style.background = 'rgba(28,238,224,0.04)'; }}
                                  onMouseLeave={e => { if (agent.language !== l.code) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                                >
                                  <div style={{ width: 22, height: 15, borderRadius: 2, overflow: 'hidden', flexShrink: 0, display: 'flex' }}>
                                    {FLAGS[l.code]}
                                  </div>
                                  <span style={{ fontSize: 13, fontWeight: agent.language === l.code ? 600 : 400, color: agent.language === l.code ? '#1ceee0' : 'var(--text)' }}>
                                    {l.label}
                                  </span>
                                  {agent.language === l.code && (
                                    <svg fill="none" stroke="#1ceee0" strokeWidth="2.5" viewBox="0 0 24 24" width="14" height="14" style={{ marginLeft: 'auto' }}>
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  )}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Kommunikációs stílus */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(28,238,224,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1ceee0' }}>Kommunikációs stílus kiválasztása</span>
                      </div>
                      <select className="settings-select" value={agent.tone} onChange={(e) => setAgent({ ...agent, tone: e.target.value })}>
                        <option value="professional_friendly">Professzionális, segítőkész</option>
                        <option value="formal">Formális, tárgyszerű</option>
                        <option value="informal">Informális, közvetlen</option>
                        <option value="empathetic">Empatikus, támogató</option>
                        <option value="custom">Egyedi leírás...</option>
                      </select>
                      {agent.tone === 'custom' && (
                        <textarea className="settings-textarea" value={agent.tone_custom} onChange={(e) => setAgent({ ...agent, tone_custom: e.target.value })} placeholder="Írd le a kívánt kommunikációs stílust..." style={{ marginTop: 10, minHeight: 70 }} />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ══════ 2. VOICE AGENT BEÁLLÍTÁSAI ══════ */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(28,238,224,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg fill="none" stroke="#1ceee0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14">
                      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
                    </svg>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Voice Agent beállításai</span>
                  <div title="A telefonos voice agent hangja. Ez határozza meg, hogy milyen hanggal beszéljen az AI a hívások során." style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>i</span>
                  </div>
                </div>
                <div className="settings-section" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(28,238,224,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="13" height="13"><path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" /></svg>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1ceee0' }}>Voice Agent kiválasztása</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {VOICE_AGENTS.map(va => {
                      const isSelected = agent.voice_id === va.id;
                      return (
                        <div
                          key={va.id}
                          onClick={() => setAgent({ ...agent, voice_id: va.id })}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                            padding: '14px 18px',
                            borderRadius: 6,
                            border: isSelected ? '2px solid #1ceee0' : '1.5px solid var(--border)',
                            background: isSelected ? 'rgba(28,238,224,0.05)' : 'var(--bg)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {/* Radio dot */}
                          <div style={{
                            width: 18, height: 18, borderRadius: '50%',
                            border: isSelected ? '2px solid #1ceee0' : '2px solid var(--text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1ceee0' }} />}
                          </div>
                          {/* Name + description */}
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: 0.5 }}>
                              {va.name}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                              – {va.desc}
                            </span>
                          </div>
                          {/* Play button */}
                          <div style={{
                            width: 36, height: 36, borderRadius: '50%',
                            background: isSelected ? '#1ceee0' : 'rgba(28,238,224,0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            transition: 'all 0.2s ease',
                          }}>
                            <svg fill={isSelected ? '#0d2538' : '#1ceee0'} viewBox="0 0 24 24" width="14" height="14">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ══════ 3. ÜDVÖZLŐSZÖVEG BEÁLLÍTÁSA ══════ */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(28,238,224,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg fill="none" stroke="#1ceee0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z" />
                    </svg>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Üdvözlőszöveg beállítása</span>
                  <div onClick={() => setShowGreetingInfo(!showGreetingInfo)} style={{ width: 18, height: 18, borderRadius: '50%', border: showGreetingInfo ? '1.5px solid #1ceee0' : '1.5px solid var(--text-muted)', background: showGreetingInfo ? 'rgba(28,238,224,0.1)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s ease' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: showGreetingInfo ? '#1ceee0' : 'var(--text-muted)' }}>i</span>
                  </div>
                </div>
                <div className="settings-section" style={{ padding: 24 }}>
                  {/* Info box - toggle */}
                  {showGreetingInfo && (
                  <div style={{
                    background: 'rgba(28,238,224,0.04)',
                    border: '1px solid rgba(28,238,224,0.25)',
                    borderRadius: 10,
                    padding: '14px 18px',
                    marginBottom: 18,
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: 'var(--text-muted)',
                  }}>
                    Az üdvözlőszöveg legyen rövid, természetes és egyértelmű. A Voice Agentet nevezheted egyszerűen virtuális asszisztensnek és/vagy adhatsz neki nevet is. Kerüld a túl hosszú vagy túl információsűrű megfogalmazást. Érdemes rögtön felkínálni a segítséget — a cél az, hogy a beszélgetés gyorsan és gördülékenyen elinduljon.
                  </div>
                  )}
                  <textarea
                    className="settings-textarea"
                    value={agent.greeting}
                    onChange={(e) => setAgent({ ...agent, greeting: e.target.value })}
                    placeholder="Írd ide az üdvözlőszöveget..."
                    style={{ minHeight: 90, fontSize: 14, lineHeight: 1.6 }}
                  />
                </div>
              </div>

              {/* ══════ 4. TRIÁZS SZABÁLYOK ══════ */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(28,238,224,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg fill="none" stroke="#1ceee0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14">
                      <path d="M22 12h-4l-3 9-6-18-3 9H2" />
                    </svg>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Prioritási szabályok</span>
                </div>
                <div className="settings-section" style={{ padding: 24 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ ...thStyle, width: '30%' }}>Helyzet</th>
                        <th style={{ ...thStyle, width: '25%' }}>Prioritás</th>
                        <th style={{ ...thStyle, width: '30%' }}>Eszkalációs e-mail</th>
                        <th style={{ ...thStyle, width: '15%' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {triageRules.map((r, i) => (
                        <tr key={r.id || i}>
                          <td style={tdStyle}>
                            <input className="tt-input" value={r.situation} onChange={e => setTriageRules(prev => prev.map((x, j) => j === i ? { ...x, situation: e.target.value } : x))} onBlur={() => saveTriageRule(r, i)} />
                          </td>
                          <td style={tdStyle}>
                            <select className="tt-select" value={r.priority} onChange={e => { const updated = { ...r, priority: e.target.value }; setTriageRules(prev => prev.map((x, j) => j === i ? updated : x)); saveTriageRule(updated, i); }}>
                              <option value="alacsony">Alacsony</option>
                              <option value="kozepes">Közepes</option>
                              <option value="magas">Magas</option>
                              <option value="surgos">Sürgős</option>
                            </select>
                          </td>
                          <td style={tdStyle}>
                            <input className="tt-input" value={r.escalation_email || ''} onChange={e => setTriageRules(prev => prev.map((x, j) => j === i ? { ...x, escalation_email: e.target.value } : x))} placeholder="email@example.com" onBlur={() => saveTriageRule(r, i)} />
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <DeleteBtn onClick={() => deleteTriageRule(r.id, i)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 14 }}>
                    <AddBtn label="Új szabály hozzáadása" onClick={() => setTriageRules(prev => [...prev, { situation: '', priority: 'kozepes', escalation_email: '' }])} />
                  </div>
                </div>
              </div>


              {/* ── Last modified footer ── */}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, opacity: 0.7 }}>
                Utolsó módosítás: {new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' })}
              </div>
            </div>
          )}

          {/* ═══════════ CÉGINFORMÁCIÓK TAB ═══════════ */}
          {activeTab === 'praxis' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 6,
                    background: 'linear-gradient(135deg, rgba(28,238,224,0.12), rgba(20,184,173,0.08))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid rgba(28,238,224,0.15)',
                  }}>
                    <svg fill="none" stroke="#1ceee0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="22" height="22">
                      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.5 }}>Cég- és szolgáltatásinformációk</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Minden, amit a cégedről tudni kell az eaisyDesk-nek</div>
                  </div>
                </div>
                <SaveButton saving={saving} onClick={handleSave} />
              </div>

              {/* Quick-nav pills */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                {[
                  { id: 'sec-cegadatok', label: 'Cég fő adatai' },
                  { id: 'sec-szolgaltatasok', label: 'Szolgáltatás leírása' },
                  { id: 'sec-nyitvatartas', label: 'Nyitvatartás' },
                  { id: 'sec-arak', label: 'Árak' },
                  { id: 'sec-kedvezmenyek', label: 'Kedvezmények' },
                  { id: 'sec-gyik', label: 'GYIK' },
                ].map(s => (
                  <button key={s.id} onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    style={{
                      padding: '7px 18px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      background: 'transparent', border: '1.5px solid var(--border)',
                      color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 0.2s ease', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#1ceee0'; e.currentTarget.style.color = '#1ceee0'; e.currentTarget.style.background = 'rgba(28,238,224,0.06)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                  >{s.label}</button>
                ))}
              </div>

              {/* ══════ 1. Cégadatok ══════ */}
              <div id="sec-cegadatok" style={{ scrollMarginTop: 20 }} />
              <SectionCard title="Cégadatok" svgPath="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  <LabelInput label="Cég neve" value={praxis.practice_name} onChange={v => setPraxis({ ...praxis, practice_name: v })} placeholder="pl. Rivergate Bútoráruház Kft." />
                  <LabelInput label="Cég rövid (hivatkozási) neve" value={praxis.markanev} onChange={v => setPraxis({ ...praxis, markanev: v })} placeholder="pl. Rivergate" />
                  <LabelInput label="Szakterület" value={praxis.szakterulet} onChange={v => setPraxis({ ...praxis, szakterulet: v })} placeholder="pl. Fogászat, szájsebészet" />
                  <LabelInput label="Fő profil" value={praxis.kulcsszavak} onChange={v => setPraxis({ ...praxis, kulcsszavak: v })} placeholder="pl. Bútor kis-és nagykereskedés" />
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>Telephelyek</div>
                  {clinics.map((c, i) => (
                    <div key={c.id || i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, marginBottom: 10, alignItems: 'center' }}>
                      <input className="tt-input" value={c.name_and_address} onChange={e => setClinics(prev => prev.map((x, j) => j === i ? { ...x, name_and_address: e.target.value } : x))} placeholder="Telephely / üzlet címe" onBlur={() => saveClinic(c, i)} />
                      <input className="tt-input" value={c.access_info || ''} onChange={e => setClinics(prev => prev.map((x, j) => j === i ? { ...x, access_info: e.target.value } : x))} placeholder="Megközelítés (opcionális)" onBlur={() => saveClinic(c, i)} />
                      <DeleteBtn onClick={() => deleteClinic(c.id, i)} />
                    </div>
                  ))}
                  <AddBtn label="Telephely hozzáadása" onClick={() => setClinics(prev => [...prev, { name_and_address: '', access_info: '' }])} />
                </div>
              </SectionCard>

              {/* ══════ 2. Szolgáltatással kapcsolatos információk ══════ */}
              <div id="sec-szolgaltatasok" style={{ scrollMarginTop: 20 }} />
              <SectionCard title="Szolgáltatással kapcsolatos információk" svgPath="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.5 3a4 4 0 100 8 4 4 0 000-8zM20 8v6M23 11h-6">
                {/* Szolgáltatás leírása */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(28,238,224,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="12" height="12"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Szolgáltatás leírása</span>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help' }} title="Ide írd le részletesen, milyen szolgáltatásokat kínál a cég. Ez segíti az AI-t a pontos tájékoztatásban.">
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)' }}>i</span>
                    </div>
                  </div>
                  <textarea className="tt-textarea" value={praxis.szakterulet || ''} onChange={e => setPraxis({ ...praxis, szakterulet: e.target.value })} placeholder="Írja le részletesen a cég fő szolgáltatásait..." style={{ minHeight: 80, fontSize: 13, lineHeight: 1.6 }} />
                </div>

                {/* Orvosok / Szolgáltatások lista */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(28,238,224,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="12" height="12"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 3a4 4 0 100 8 4 4 0 000-8z" /></svg>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Szolgáltatások</span>
                  </div>
                  {doctors.map((d, i) => (
                    <div key={d.id || i} style={listItemStyle}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, flex: 1 }}>
                        <input className="tt-input" value={d.name} onChange={e => setDoctors(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Név" onBlur={() => saveDoctor(d, i)} />
                        <input className="tt-input" value={d.specialty || ''} onChange={e => setDoctors(prev => prev.map((x, j) => j === i ? { ...x, specialty: e.target.value } : x))} placeholder="Szakterület" onBlur={() => saveDoctor(d, i)} />
                        <input className="tt-input" value={d.related_services || ''} onChange={e => setDoctors(prev => prev.map((x, j) => j === i ? { ...x, related_services: e.target.value } : x))} placeholder="Szolgáltatások" onBlur={() => saveDoctor(d, i)} />
                      </div>
                      <DeleteBtn onClick={() => deleteDoctor(d.id, i)} />
                    </div>
                  ))}
                  <AddBtn label="Hozzáadás" onClick={() => setDoctors(prev => [...prev, { name: '', specialty: '', related_services: '' }])} />
                </div>
              </SectionCard>

              {/* ══════ 3. Nyitvatartás / Ügyfélfogadási idő ══════ */}
              <div id="sec-nyitvatartas" style={{ scrollMarginTop: 20 }} />
              <SectionCard title="Nyitvatartás / Ügyfélfogadási idő" svgPath="M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2">
                <table className="bh-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Nap</th>
                      <th style={thStyle}>Nyitás</th>
                      <th style={thStyle}>Zárás</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>Nyitva?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DAY_KEYS.map((key, i) => {
                      const bh = agent.business_hours[key] || { open: '08:00', close: '17:00', enabled: true };
                      return (
                        <tr key={key}>
                          <td style={tdStyle}>{DAYS[i]}</td>
                          <td style={tdStyle}>
                            <input type="time" value={bh.open} onChange={(e) => setAgent({ ...agent, business_hours: { ...agent.business_hours, [key]: { ...bh, open: e.target.value } } })} style={timeInput} disabled={!bh.enabled} />
                          </td>
                          <td style={tdStyle}>
                            <input type="time" value={bh.close} onChange={(e) => setAgent({ ...agent, business_hours: { ...agent.business_hours, [key]: { ...bh, close: e.target.value } } })} style={timeInput} disabled={!bh.enabled} />
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <label className="tt-toggle" style={{ display: 'inline-flex' }}>
                              <input type="checkbox" checked={bh.enabled} onChange={(e) => setAgent({ ...agent, business_hours: { ...agent.business_hours, [key]: { ...bh, enabled: e.target.checked } } })} />
                              <span className="tt-toggle-slider" />
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </SectionCard>

              {/* ══════ 4. Árak ══════ */}
              <div id="sec-arak" style={{ scrollMarginTop: 20 }} />
              <SectionCard title="Árak" svgPath="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6">
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>Az aktuális árlista XLSX vagy CSV formátumban tölthető fel. A feltöltés a FastAPI-n keresztül történik.</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <button className="btn-settings-save" onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = '.csv,.xlsx'; input.onchange = async (e: Event) => { const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return; const formData = new FormData(); formData.append('file', file); try { const res = await authFetch('/admin/api/praxisinfo/pricelist', { method: 'POST', body: formData }); if (res.ok) showToast('Árlista feltöltve!'); else showToast('Feltöltési hiba', 'error'); } catch { showToast('Feltöltési hiba', 'error'); } }; input.click(); }} style={{ fontFamily: 'inherit', textAlign: 'center', justifyContent: 'center' }}>
                    Új árlista feltöltése
                  </button>
                  <button onClick={() => { window.open('/admin/api/praxisinfo/pricelist/template', '_blank'); }} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px solid var(--accent)', color: 'var(--accent)', background: 'transparent', padding: '12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit' }}>
                    Minta Excel letöltése
                  </button>
                </div>
              </SectionCard>

              {/* ══════ 5. Akciók, kedvezmények ══════ */}
              <div id="sec-kedvezmenyek" style={{ scrollMarginTop: 20 }} />
              <SectionCard title="Akciók, kedvezmények" svgPath="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z">
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Aktuális akciók, szezonális kedvezmények — az AI ezeket is megemlíti az ügyfeleknek.</div>
                {(praxis.campaigns || []).map((c: { active: boolean; text: string }, i: number) => (
                  <div key={i} style={{ ...listItemStyle, marginBottom: 8 }}>
                    <label className="tt-toggle" style={{ flexShrink: 0 }}>
                      <input type="checkbox" checked={c.active} onChange={e => { const campaigns = [...(praxis.campaigns || [])]; campaigns[i] = { ...campaigns[i], active: e.target.checked }; setPraxis({ ...praxis, campaigns }); }} />
                      <span className="tt-toggle-slider" />
                    </label>
                    <input className="tt-input" value={c.text} onChange={e => { const campaigns = [...(praxis.campaigns || [])]; campaigns[i] = { ...campaigns[i], text: e.target.value }; setPraxis({ ...praxis, campaigns }); }} placeholder="Akció leírása..." style={{ flex: 1 }} />
                    <DeleteBtn onClick={() => { const campaigns = (praxis.campaigns || []).filter((_: unknown, j: number) => j !== i); setPraxis({ ...praxis, campaigns }); }} />
                  </div>
                ))}
                <AddBtn label="Akció hozzáadása" onClick={() => setPraxis({ ...praxis, campaigns: [...(praxis.campaigns || []), { active: true, text: '' }] })} />
              </SectionCard>

              {/* ══════ 6. Gyakori Kérdések ══════ */}
              <div id="sec-gyik" style={{ scrollMarginTop: 20 }} />
              <SectionCard title="Gyakori Kérdések" svgPath="M12 2a10 10 0 100 20 10 10 0 000-20zM9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01">
                {(praxis.faq || []).map((f, i) => (
                  <div key={i} style={{ ...listItemStyle, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <input className="tt-input" value={f.question} onChange={e => { const faq = [...(praxis.faq || [])]; faq[i] = { ...faq[i], question: e.target.value }; setPraxis({ ...praxis, faq }); }} placeholder="Kérdés" style={{ flex: 1 }} />
                      <DeleteBtn onClick={() => { const faq = (praxis.faq || []).filter((_, j) => j !== i); setPraxis({ ...praxis, faq }); }} />
                    </div>
                    <textarea className="tt-textarea" value={f.answer} onChange={e => { const faq = [...(praxis.faq || [])]; faq[i] = { ...faq[i], answer: e.target.value }; setPraxis({ ...praxis, faq }); }} placeholder="Válasz" style={{ minHeight: 60 }} />
                  </div>
                ))}
                <AddBtn label="Kérdés hozzáadása" onClick={() => setPraxis({ ...praxis, faq: [...(praxis.faq || []), { question: '', answer: '' }] })} />
              </SectionCard>
            </div>
          )}

          {/* ═══════════ SZABÁLYOK TAB ═══════════ */}
          {activeTab === 'szabalyok' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 6,
                    background: 'linear-gradient(135deg, rgba(28,238,224,0.12), rgba(20,184,173,0.08))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid rgba(28,238,224,0.15)',
                  }}>
                    <svg fill="none" stroke="#1ceee0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="22" height="22">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.5 }}>Foglalási szabályok</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Időpontfoglalás, páciens kezelés és szolgáltatások beállításai</div>
                  </div>
                </div>
                <SaveButton saving={saving} onClick={handleSave} />
              </div>

              {/* 1. Új/visszatérő páciens */}
              <SectionCard title="Új és visszatérő páciensek kezelése" svgPath="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 3a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <LabelInput label="Páciens beazonosítását szolgáló kérdés" value={praxis.pacient_id_question} onChange={v => setPraxis({ ...praxis, pacient_id_question: v })} />
                  <LabelInput label="Új páciens -- kötelezően bekérendő adat" value={praxis.new_patient_required} onChange={v => setPraxis({ ...praxis, new_patient_required: v })} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label className="tt-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Új páciensnek automatikus első vizit</label>
                    <label className="tt-toggle">
                      <input type="checkbox" checked={praxis.new_patient_auto_visit} onChange={e => setPraxis({ ...praxis, new_patient_auto_visit: e.target.checked })} />
                      <span className="tt-toggle-slider" />
                    </label>
                  </div>
                  <LabelInput label="Visszatérő páciens -- kötelező szabály" value={praxis.returning_patient_required} onChange={v => setPraxis({ ...praxis, returning_patient_required: v })} />
                </div>
              </SectionCard>

              {/* 2. Szolgáltatások */}
              <SectionCard title="Szolgáltatások és időtartamok" svgPath="M2 7h20v14a2 2 0 01-2 2H4a2 2 0 01-2-2V7zM16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16">
                {services.map((s, i) => (
                  <div key={s.id || i} style={listItemStyle}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 12, flex: 1 }}>
                      <input className="tt-input" value={s.service_name} onChange={e => setServices(prev => prev.map((x, j) => j === i ? { ...x, service_name: e.target.value } : x))} placeholder="Szolgáltatás neve" onBlur={() => saveService(s, i)} />
                      <input className="tt-input" type="number" value={s.duration_minutes} onChange={e => setServices(prev => prev.map((x, j) => j === i ? { ...x, duration_minutes: Number(e.target.value) } : x))} placeholder="Perc" onBlur={() => saveService(s, i)} />
                      <input className="tt-input" value={s.note || ''} onChange={e => setServices(prev => prev.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} placeholder="Megjegyzés" onBlur={() => saveService(s, i)} />
                    </div>
                    <DeleteBtn onClick={() => deleteService(s.id, i)} />
                  </div>
                ))}
                <AddBtn label="Szolgáltatás hozzáadása" onClick={() => setServices(prev => [...prev, { service_name: '', duration_minutes: 30, note: '' }])} />
              </SectionCard>

              {/* 3. Kivételek + Lemondás */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
                {/* Kivételek */}
                <SectionCard title="Kivételek kezelése" svgPath="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01">
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Helyzetek, amikor a DigiDesk nem foglalhat automatikusan.</p>
                  {(praxis.exceptions || []).map((ex, i) => (
                    <div key={i} style={{ ...listItemStyle, marginBottom: 6 }}>
                      <input className="tt-input" value={ex} onChange={e => { const exceptions = [...(praxis.exceptions || [])]; exceptions[i] = e.target.value; setPraxis({ ...praxis, exceptions }); }} style={{ flex: 1 }} />
                      <DeleteBtn onClick={() => { const exceptions = (praxis.exceptions || []).filter((_, j) => j !== i); setPraxis({ ...praxis, exceptions }); }} />
                    </div>
                  ))}
                  <AddBtn label="Kivétel hozzáadása" onClick={() => setPraxis({ ...praxis, exceptions: [...(praxis.exceptions || []), ''] })} />
                </SectionCard>

                {/* Lemondás */}
                <SectionCard title="Lemondás és módosítás" svgPath="M12 2a10 10 0 100 20 10 10 0 000-20zM15 9l-6 6M9 9l6 6">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label className="tt-label">Időpont módosításának engedélyezése</label>
                      <select className="tt-select" value={praxis.modositas_eng} onChange={e => setPraxis({ ...praxis, modositas_eng: e.target.value })}>
                        <option value="igen">Igen</option>
                        <option value="nem">Nem</option>
                      </select>
                    </div>
                    <div>
                      <label className="tt-label">24 órán belüli lemondás kezelése</label>
                      <select className="tt-select" value={praxis.lemondas_24h} onChange={e => setPraxis({ ...praxis, lemondas_24h: e.target.value })}>
                        <option value="elfogadhato">Elfogadható</option>
                        <option value="figyelmeztetoSzoveggel">Elfogadható figyelmeztető szöveggel</option>
                        <option value="eloAtadas">Élő átadás szükséges</option>
                      </select>
                    </div>
                    {praxis.lemondas_24h === 'figyelmeztetoSzoveggel' && (
                      <textarea className="tt-textarea" value={praxis.figyelmezteto_szoveg} onChange={e => setPraxis({ ...praxis, figyelmezteto_szoveg: e.target.value })} />
                    )}
                  </div>
                </SectionCard>
              </div>


            </div>
          )}
    </div>
  );
}

// ── Shared styles ──
const thStyle: React.CSSProperties = { padding: '12px 16px', fontWeight: 600, textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 };
const tdStyle: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid var(--border)' };
const timeInput: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const listItemStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 };

// ── Sub-components ──
function _SettingsField({ label, svgPath, children }: { label: string; svgPath: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="settings-section-title" style={{ marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(28,238,224,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg fill="none" stroke="#1ceee0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14"><path d={svgPath} /></svg>
        </div>
        {label}
      </div>
      {children}
    </div>
  );
}

function SectionCard({ title, svgPath, children }: { title: string; svgPath: string; children: React.ReactNode }) {
  return (
    <div className="tt-section">
      <div className="tt-section-title" style={{ marginBottom: 16 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(28,238,224,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg fill="none" stroke="#1ceee0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14"><path d={svgPath} /></svg>
        </div>
        {title}
      </div>
      {children}
    </div>
  );
}

function LabelInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="tt-label">{label}</label>
      <input className="tt-input" type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button className="btn-settings-save" onClick={onClick} disabled={saving} style={{ fontFamily: 'inherit' }}>
      <svg fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="15" height="15">
        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
      {saving ? 'Mentés...' : 'Mentés'}
    </button>
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: 'transparent', border: 'none', color: '#10b981', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 13, fontFamily: 'inherit' }}>
      + {label}
    </button>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 16, cursor: 'pointer', padding: '4px 6px', borderRadius: 4, flexShrink: 0 }} title="Törlés">
      <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
    </button>
  );
}
