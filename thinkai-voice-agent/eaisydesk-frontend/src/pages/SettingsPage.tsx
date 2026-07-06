/**
 * SettingsPage (Tudástár) – Full 1:1 port of legacy page-settings.html
 * 3 tabs: eaisyDesk beállítások (agent), Céginformációk (basic), Szabályok (rules)
 * All reads/writes directly to Supabase.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';
import CustomSelect from '../components/settings/CustomSelect';

import { showToast } from '../components/ui/Toast';
import { SettingsSkeleton } from '../components/ui/Skeleton';

// ── Tab definitions ──
const _TABS = [
  { id: 'basic', label: 'Céginformációk', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10' },
  { id: 'szabalyok', label: 'Ügykezelési és foglalási szabályok', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8' },
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

interface BusinessInfo {
  practice_name: string;
  markanev: string;
  szakterulet: string;
  service_description: string;
  kulcsszavak: string;
  faq: { question: string; answer: string }[];
  campaigns: { active: boolean; text: string; name?: string }[];
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
interface Service { id?: number; service_name: string; description: string; duration_minutes: number; assigned_to: string; note: string; }
interface TriageRule { id?: number; situation: string; priority: string; escalation_email: string; }
interface ReminderSettings { id?: number; reminder_enabled: boolean; reminder_hours: number; reminder_template: string; }
interface OutboundAutomation { id: number; name: string; trigger_type: string; enabled: boolean; delay_hours: number; message_template: string; }

// ── Fixed core issue types for Ügykezelési szabályok ──
const CORE_ISSUE_TYPES: TriageRule[] = [
  { situation: 'Kérdés',          priority: 'onallo',     escalation_email: '' },
  { situation: 'Kérés',           priority: 'ember',      escalation_email: '' },
  { situation: 'Időpont',         priority: 'onallo',     escalation_email: '' },
  { situation: 'Panasz',          priority: 'ember',      escalation_email: 'vezeto@mintaklinika.hu' },
  { situation: 'Egyéb',           priority: 'ember',      escalation_email: '' },
  { situation: 'Vegyes ügytípus', priority: 'jovahagyas', escalation_email: '' },
];

function normalizePriority(raw: string, fallback: string): string {
  const v = raw.toLowerCase().trim();
  if (['onallo'].includes(v)) return 'onallo';
  if (['jovahagyas'].includes(v)) return 'jovahagyas';
  if (['ember'].includes(v)) return 'ember';
  // Map old normal/default/medium values → onallo
  if (['altalanos', 'normal', 'normál', 'kozepes', 'közepes'].includes(v)) return 'onallo';
  // Map old high/urgent values → ember
  if (['surgos', 'sürgős', 'high', 'magas'].includes(v)) return 'ember';
  return fallback;
}

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

const defaultBusiness: BusinessInfo = {
  practice_name: '', markanev: '', szakterulet: '', service_description: '', kulcsszavak: '',
  faq: [], campaigns: [], exceptions: [],
  modositas_eng: 'igen', lemondas_24h: 'figyelmeztetoSzoveggel',
  figyelmezteto_szoveg: 'Tájékoztatjuk, hogy 24 órán belüli lemondás esetén külön szabályzatunk lehet érvényben.',
  pacient_id_question: 'Volt már korábban ügyfelünk?',
  new_patient_required: 'Születési dátum, teljes név',
  new_patient_auto_visit: true,
  returning_patient_required: 'Ügyfél azonosító vagy telefonszám',
};

const defaultReminder: ReminderSettings = {
  reminder_enabled: false, reminder_hours: 24,
  reminder_template: 'Tisztelt {nev}! Emlékeztetjük, hogy {idopont} időpontban várjuk {szolgaltatas} kezelésre a {telephely} címen.',
};

export default function SettingsPage() {
  const { isAdminOnly } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const validTabs = ['basic', 'szabalyok'];
  const tabFromUrl = location.pathname.split('/').pop() || '';
  const activeTab = validTabs.includes(tabFromUrl) ? tabFromUrl : 'szabalyok';

  // Redirect obsolete /settings/agent to active page
  useEffect(() => {
    if (tabFromUrl === 'agent') {
      navigate('/settings/szabalyok', { replace: true });
    }
  }, [tabFromUrl, navigate]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Data states
  const [agent, setAgent] = useState<AgentSettings>(defaultAgent);
  const [business, setBusiness] = useState<BusinessInfo>(defaultBusiness);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [triageRules, setTriageRules] = useState<TriageRule[]>([]);
  const [reminder, setReminder] = useState<ReminderSettings>(defaultReminder);
  const [_voices, setVoices] = useState<CartesiaVoice[]>([]);
  const [_voicesLoading, setVoicesLoading] = useState(false);
  const [_automations, setAutomations] = useState<OutboundAutomation[]>([]);
  const [_inactivityDays, setInactivityDays] = useState(60);
  const [showGreetingInfo, setShowGreetingInfo] = useState(false);
  const [_showLangDropdown, setShowLangDropdown] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [priceRows, setPriceRows] = useState<{ category: string; service: string; price: string; currency: string; note: string }[]>([]);
  const [priceSaving, setPriceSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string>('');

  const openPriceModal = useCallback(() => {
    const pl = (business as Record<string, unknown>).price_list;
    if (typeof pl === 'string' && pl.trim()) {
      const rows = pl.split('\n').filter(l => l.trim()).map(line => {
        const parts = line.split(' - ');
        return {
          category: (parts[0] || '').trim(),
          service: (parts[1] || '').trim(),
          price: (parts[2] || '').trim(),
          currency: (parts[3] || '').trim(),
          note: parts.slice(4).join(' - ').trim(),
        };
      });
      setPriceRows(rows);
    } else {
      setPriceRows([{ category: '', service: '', price: '', currency: 'HUF', note: '' }]);
    }
    setShowPriceModal(true);
  }, [business]);

  const savePriceRows = useCallback(async () => {
    setPriceSaving(true);
    try {
      const priceText = priceRows
        .filter(r => r.service.trim() || r.category.trim())
        .map(r => [r.category, r.service, r.price, r.currency, r.note].filter(Boolean).join(' - '))
        .join('\n');
      const updatedBusiness = { ...business, price_list: priceText };
      const res = await authFetch('/admin/api/business-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedBusiness),
      });
      if (res.ok) {
        const newBusiness = { ...business, price_list: priceText } as BusinessInfo;
        setBusiness(newBusiness);
        showToast('Árlista mentve!');
        setShowPriceModal(false);
      } else {
        showToast('Mentési hiba', 'error');
      }
    } catch {
      showToast('Mentési hiba', 'error');
    }
    setPriceSaving(false);
  }, [priceRows, business]);


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
      const [settingsRes, businessRes, clinicsRes, servicesRes, triageRes, reminderRes, autoRes] = await Promise.all([
        authFetch('/admin/api/settings'),
        authFetch('/admin/api/business-info'),
        authFetch('/admin/api/clinics'),
        authFetch('/admin/api/services'),
        authFetch('/admin/api/triage_rules'),
        authFetch('/admin/api/settings/reminder'),
        authFetch('/admin/api/outbound_automations'),
      ]);

      const settingsData = await settingsRes.json();
      const businessData = await businessRes.json();
      const clinicsData = await clinicsRes.json();
      const servicesData = await servicesRes.json();
      const triageData = await triageRes.json();
      const reminderData = await reminderRes.json();
      const autoData = await autoRes.json();

      if (settingsData && !settingsData.error) {
        const v = settingsData;
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
      if (businessData && !businessData.error) {
        const p = businessData;
        setBusiness(prev => ({
          ...prev,
          practice_name: p.practice_name || p.nev || '',
          markanev: p.markanev || '',
          szakterulet: p.szakterulet || '',
          service_description: p.service_description || '',
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
          price_list: p.price_list || '',
          price_list_file_meta: p.price_list_file_meta || null,
        }));
      }
      const cl = clinicsData?.clinics || clinicsData; if (Array.isArray(cl)) setClinics(cl);
      const sv = servicesData?.services || servicesData; if (Array.isArray(sv)) setServices(sv);
      const tr = triageData?.rules || triageData;
      if (Array.isArray(tr)) {
        const apiMap = new Map(tr.map((r: TriageRule) => [r.situation, r]));
        const merged = CORE_ISSUE_TYPES.map(core => {
          const db = apiMap.get(core.situation);
          if (db) return { ...db, priority: normalizePriority(db.priority, core.priority) };
          return { ...core };
        });
        setTriageRules(merged);
      } else {
        setTriageRules(CORE_ISSUE_TYPES.map(c => ({ ...c })));
      }
      if (reminderData && !reminderData.error) setReminder(reminderData as ReminderSettings);
      if (Array.isArray(autoData)) setAutomations(autoData);

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
        showToast('Beállítások mentve!', 'success');
        setLastSavedAt(new Date().toLocaleString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }));
      } else {
        showToast('Hiba a mentésnél', 'error');
      }
    } catch { showToast('Hiba a mentésnél', 'error'); }
    setSaving(false);
  }, [agent]);

  const saveBusiness = useCallback(async () => {
    setSaving(true);
    try {
      const res = await authFetch('/admin/api/business-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(business),
      });
      if (res.ok) {
        showToast('Céginformációk mentve!', 'success');
        setLastSavedAt(new Date().toLocaleString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }));
      } else {
        showToast('Hiba a mentésnél', 'error');
      }
    } catch { showToast('Hiba a mentésnél', 'error'); }
    setSaving(false);
  }, [business]);

  // ── Praxis auto-save (debounced, only when data actually changed) ──
  const businessLoaded = useRef(false);
  const businessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const businessSavedRef = useRef<string>('');

  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => {
        businessLoaded.current = true;
        businessSavedRef.current = JSON.stringify(business);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [loading]);

  useEffect(() => {
    if (!businessLoaded.current) return;
    const currentJson = JSON.stringify(business);
    if (currentJson === businessSavedRef.current) return;
    if (businessTimerRef.current) clearTimeout(businessTimerRef.current);
    businessTimerRef.current = setTimeout(() => {
      saveBusiness();
      businessSavedRef.current = currentJson;
    }, 1500);
    return () => { if (businessTimerRef.current) clearTimeout(businessTimerRef.current); };
  }, [business, saveBusiness]);

  // ── Agent auto-save (debounced, only when data actually changed) ──
  const agentSavedRef = useRef<string>('');
  const agentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Capture snapshot of agent state after initial load
  useEffect(() => {
    if (!loading && !agentSavedRef.current) {
      const t = setTimeout(() => {
        agentSavedRef.current = JSON.stringify(agent);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [loading, agent]);

  // Auto-save only when agent data actually changed from loaded/saved state
  useEffect(() => {
    if (!agentSavedRef.current) return;
    const current = JSON.stringify(agent);
    if (current === agentSavedRef.current) return;
    if (agentTimerRef.current) clearTimeout(agentTimerRef.current);
    agentTimerRef.current = setTimeout(() => {
      saveAgent();
      agentSavedRef.current = current;
    }, 1500);
    return () => { if (agentTimerRef.current) clearTimeout(agentTimerRef.current); };
  }, [agent, saveAgent]);

  // ── CRUD for sub-tables ──
  const saveClinic = useCallback(async (clinic: Clinic, idx: number) => {
    try {
      if (clinic.id) {
        await authFetch(`/admin/api/clinics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([clinic]) });
      } else {
        const res = await authFetch('/admin/api/clinics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([clinic]) });
        if (res.ok) { const data = await res.json(); if (data.clinics) setClinics(prev => prev.map((c, i) => i === idx ? (data.clinics[idx] || c) : c)); }
      }
      showToast('Telephely mentve');
    } catch { showToast('Hiba', 'error'); }
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



  const saveService = useCallback(async (svc: Service, idx: number) => {
    try {
      if (svc.id) {
        await authFetch(`/admin/api/services/${svc.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_name: svc.service_name, duration_minutes: svc.duration_minutes, description: svc.description, assigned_to: svc.assigned_to, note: svc.note }) });
      } else {
        const res = await authFetch('/admin/api/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_name: svc.service_name, duration_minutes: svc.duration_minutes, description: svc.description, assigned_to: svc.assigned_to, note: svc.note }) });
        if (res.ok) { const data = await res.json(); if (data.id) setServices(prev => prev.map((s, i) => i === idx ? { ...svc, id: data.id } : s)); }
      }
      showToast('Szolgáltatás mentve');
    } catch { showToast('Hiba', 'error'); }
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
    try {
      if (rule.id) {
        await authFetch(`/admin/api/triage_rules/${rule.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ situation: rule.situation, priority: rule.priority, escalation_email: rule.escalation_email }) });
      } else {
        const res = await authFetch('/admin/api/triage_rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ situation: rule.situation, priority: rule.priority, escalation_email: rule.escalation_email }) });
        if (res.ok) { const data = await res.json(); if (data.id) setTriageRules(prev => prev.map((r, i) => i === idx ? { ...rule, id: data.id } : r)); }
      }
      showToast('Ügykezelési szabály mentve');
    } catch { showToast('Hiba', 'error'); }
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
      const res = await authFetch('/admin/api/settings/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminder_enabled: reminder.reminder_enabled, reminder_hours: reminder.reminder_hours, reminder_template: reminder.reminder_template }),
      });
      if (res.ok) showToast('Emlékeztető mentve');
      else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
    setSaving(false);
  }, [reminder]);

  const handleSave = useCallback(() => {
    if (activeTab === 'agent') saveAgent();
  }, [activeTab, saveAgent]);

  if (loading) {
    return <div className="analytics-shell p-40"><SettingsSkeleton /></div>;
  }

  return (
    <>
      <div className="page active" id="page-settings">

        {/* ═══════════ eaisyDesk BEÁLLÍTÁSOK TAB ═══════════ */}
        {activeTab === 'agent' && (
          <div>
            {/* ── Page Header ── */}
            <div className="page-header">
              <div className="page-title">eaisyDesk beállítások</div>
            </div>


            {/* ══════ 1. VOICE AGENT BEÁLLÍTÁSAI — csak admin ══════ */}
            {isAdminOnly && (
            <div className="mb-24">
              <div className="flex-row gap-8 mb-16">
                <div className="icon-box">
                  <svg fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
                  </svg>
                </div>
                <span className="section-heading">Voice Agent beállításai</span>

              </div>
              <div className="settings-section p-24">

                <div className="flex-col gap-10">
                  {VOICE_AGENTS.map(va => {
                    const isSelected = agent.voice_id === va.id;
                    return (
                      <div
                        key={va.id}
                        onClick={() => setAgent({ ...agent, voice_id: va.id })}
                        className={`settings-voice-card ${isSelected ? 'settings-voice-card--active' : 'settings-voice-card--idle'}`}
                      >
                        <div className={`settings-voice-radio ${isSelected ? 'settings-voice-radio--active' : 'settings-voice-radio--idle'}`}>
                          {isSelected && <div className="settings-voice-radio-dot" />}
                        </div>
                        {/* Name + description */}
                        <div className="flex-1">
                          <span className="settings-voice-name">
                            {va.name}
                          </span>
                          <span className="settings-voice-desc">
                            – {va.desc}
                          </span>
                        </div>

                        {/* Selection indicator */}
                        {isSelected && (
                          <div className="settings-voice-check">
                            <svg fill="none" stroke="#0d2538" strokeWidth="3" viewBox="0 0 24 24" width="14" height="14">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            )}


            {/* ══════ 3. ÜGYKEZELÉSI SZABÁLYOK ══════ */}
            <div className="mb-24">
              <div className="flex-row gap-8 mb-16">
                <div className="icon-box">
                  <svg fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14">
                    <path d="M22 12h-4l-3 9-6-18-3 9H2" />
                  </svg>
                </div>
                <span className="section-heading">Ügykezelési szabályok</span>
              </div>
              <p className="tt-label" style={{ marginBottom: 12, fontWeight: 400, maxWidth: 620 }}>
                Állítsd be, hogy az eaisyDesk az egyes ügytípusokat önállóan kezelheti-e,
                jóváhagyásra készítse elő, vagy embernek adja tovább.
              </p>
              <div className="settings-section p-24">
                <table className="data-table">
                  <thead className="int-thead">
                    <tr>
                      <th className="sett-th sett-th--w30">Ügytípus</th>
                      <th className="sett-th sett-th--w30">eaisyDesk eljárás</th>
                      <th className="sett-th sett-th--w40">Értesítendő</th>
                    </tr>
                  </thead>
                  <tbody>
                    {triageRules.map((r, i) => (
                      <tr key={i} className="int-row">
                        <td className="int-td">
                          <span className="font-medium text-md">{r.situation}</span>
                        </td>
                        <td className="int-td">
                          <select className="tt-select" value={r.priority} onChange={e => { const updated = { ...r, priority: e.target.value, escalation_email: e.target.value === 'onallo' ? '' : r.escalation_email }; setTriageRules(prev => prev.map((x, j) => j === i ? updated : x)); saveTriageRule(updated, i); }}>
                            <option value="onallo">Önállóan kezelhető</option>
                            <option value="jovahagyas">Jóváhagyást igényel</option>
                            <option value="ember">Embernek továbbítandó</option>
                          </select>
                        </td>
                        <td className="int-td">
                          {r.priority === 'onallo' ? (
                            <span className="text-desc" style={{ opacity: 0.5 }}>Nincs értesítés</span>
                          ) : (
                            <input className="tt-input" value={r.escalation_email || ''} onChange={e => setTriageRules(prev => prev.map((x, j) => j === i ? { ...x, escalation_email: e.target.value } : x))} placeholder="Alapértelmezett cím" onBlur={() => saveTriageRule(r, i)} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>


            {/* ── Last modified footer ── */}
            {lastSavedAt && (
              <div className="text-desc mt-8 settings-last-saved">
                Utolsó módosítás: {lastSavedAt}
              </div>
            )}
          </div>
        )}

        {/* ═══════════ CÉGINFORMÁCIÓK TAB ═══════════ */}
        {activeTab === 'basic' && (
          <div>
            <div className="page-header">
              <div className="page-title">Cég- és szolgáltatásinformációk</div>
            </div>

            {/* Quick-nav pills */}
            <div className="flex-row gap-8 mb-24 flex-wrap">
              <div className="flex-row gap-8 flex-wrap flex-1">
              {[
                { id: 'sec-cegadatok', label: 'Cég fő adatai' },
                { id: 'sec-szolgaltatasok', label: 'Szolgáltatás leírása' },
                { id: 'sec-nyitvatartas', label: 'Nyitvatartás' },
                { id: 'sec-arak', label: 'Árak' },
                { id: 'sec-kedvezmenyek', label: 'Kedvezmények' },
                { id: 'sec-gyik', label: 'GYIK' },
              ].map(s => (
                <button key={s.id} className="btn pill-tab" onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >{s.label}</button>
              ))}
              </div>
            </div>

            {/* ══════ 1. Cégadatok ══════ */}
            <div id="sec-cegadatok" className="scroll-anchor" />
            <SectionCard title="Cégadatok" svgPath="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10">
              <div className="grid-2col gap-16 mb-20">
                <LabelInput label="Cég neve" value={business.practice_name} onChange={v => setBusiness({ ...business, practice_name: v })} placeholder="pl. Rivergate Bútoráruház Kft." />
                <LabelInput label="Cég rövid (hivatkozási) neve" value={business.markanev} onChange={v => setBusiness({ ...business, markanev: v })} placeholder="pl. Rivergate" />
                <LabelInput label="Szakterület" value={business.szakterulet} onChange={v => setBusiness({ ...business, szakterulet: v })} placeholder="pl. IT tanácsadás, marketing" />
                <LabelInput label="Fő profil" value={business.kulcsszavak} onChange={v => setBusiness({ ...business, kulcsszavak: v })} placeholder="pl. Bútor kis-és nagykereskedés" />
              </div>
              <div className="settings-section-divider">
                <div className="form-label font-semibold mb-12 settings-form-label-bold">Telephelyek</div>
                {clinics.map((c, i) => (
                  <div key={c.id || i} className="settings-clinic-row">
                    <input className="tt-input" value={c.name_and_address} onChange={e => setClinics(prev => prev.map((x, j) => j === i ? { ...x, name_and_address: e.target.value } : x))} placeholder="Telephely / üzlet címe" onBlur={() => saveClinic(c, i)} />
                    <input className="tt-input" value={c.access_info || ''} onChange={e => setClinics(prev => prev.map((x, j) => j === i ? { ...x, access_info: e.target.value } : x))} placeholder="Megközelítés (opcionális)" onBlur={() => saveClinic(c, i)} />
                    <DeleteBtn onClick={() => deleteClinic(c.id, i)} />
                  </div>
                ))}
                <AddBtn label="Telephely hozzáadása" onClick={() => setClinics(prev => [...prev, { name_and_address: '', access_info: '' }])} />
              </div>
            </SectionCard>

            {/* ══════ 2. Szolgáltatással kapcsolatos információk ══════ */}
            <div id="sec-szolgaltatasok" className="scroll-anchor" />
            <SectionCard title="Szolgáltatással kapcsolatos információk" svgPath="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.5 3a4 4 0 100 8 4 4 0 000-8zM20 8v6M23 11h-6">
              {/* Szolgáltatás leírása */}
              <div className="mb-20">
                <div className="flex-row gap-8 mb-10">
                  <div className="icon-box-sm settings-icon-sm-teal">
                    <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="12" height="12"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
                  </div>
                  <span className="font-semibold text-md settings-section-text">Szolgáltatás leírása</span>
                  <div className="settings-info-circle" title="Ide írd le részletesen, milyen szolgáltatásokat kínál a cég. Ez segíti az AI-t a pontos tájékoztatásban.">
                    <span className="settings-info-circle-i">i</span>
                  </div>
                </div>
                <textarea className="tt-textarea settings-textarea--desc" value={business.service_description || ''} onChange={e => setBusiness({ ...business, service_description: e.target.value })} placeholder="Írja le részletesen a cég fő szolgáltatásait..." />
              </div>

              {/* Szolgáltatások */}
              <div className="settings-svc-divider">
                <div className="flex-row gap-8 mb-12">
                  <div className="settings-icon-24">
                    <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="12" height="12"><path d="M2 7h20v14a2 2 0 01-2 2H4a2 2 0 01-2-2V7zM16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" /></svg>
                  </div>
                  <span className="font-semibold text-md settings-section-text">Szolgáltatások</span>
                </div>
                <div className="grid-5col gap-8 mb-6" style={{ paddingLeft: 4, paddingRight: 36 }}>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)', letterSpacing: '0.03em' }}>Szolgáltatás</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)', letterSpacing: '0.03em' }}>Leírás</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)', letterSpacing: '0.03em' }}>Időtartam (perc)</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)', letterSpacing: '0.03em' }}>Felelős</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)', letterSpacing: '0.03em' }}>Megjegyzés</span>
                </div>
                {services.map((s, i) => (
                  <div key={s.id || i} className="sett-list-item">
                    <div className="grid-5col gap-8 flex-1">
                      <input className="tt-input" value={s.service_name} onChange={e => setServices(prev => prev.map((x, j) => j === i ? { ...x, service_name: e.target.value } : x))} placeholder="Szolgáltatás neve" onBlur={() => saveService(s, i)} />
                      <input className="tt-input" value={s.description || ''} onChange={e => setServices(prev => prev.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="Leírás" onBlur={() => saveService(s, i)} />
                      <input className="tt-input" type="number" value={s.duration_minutes} onChange={e => setServices(prev => prev.map((x, j) => j === i ? { ...x, duration_minutes: Number(e.target.value) } : x))} placeholder="Perc" onBlur={() => saveService(s, i)} />
                      <input className="tt-input" value={s.assigned_to || ''} onChange={e => setServices(prev => prev.map((x, j) => j === i ? { ...x, assigned_to: e.target.value } : x))} placeholder="Felelős (opcionális)" onBlur={() => saveService(s, i)} />
                      <input className="tt-input" value={s.note || ''} onChange={e => setServices(prev => prev.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} placeholder="Megjegyzés" onBlur={() => saveService(s, i)} />
                    </div>
                    <DeleteBtn onClick={() => deleteService(s.id, i)} />
                  </div>
                ))}
                <AddBtn label="Szolgáltatás hozzáadása" onClick={() => setServices(prev => [...prev, { service_name: '', description: '', duration_minutes: 30, assigned_to: '', note: '' }])} />
              </div>
            </SectionCard>

            {/* ══════ 3. Nyitvatartás ══════ */}
            <div id="sec-nyitvatartas" className="scroll-anchor" />
            <SectionCard title="Nyitvatartás" svgPath="M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2">
              <table className="data-table">
                <thead className="int-thead">
                  <tr>
                    <th className="sett-th">Nap</th>
                    <th className="sett-th">Nyitás</th>
                    <th className="sett-th">Zárás</th>
                    <th className="sett-th sett-th--center"></th>
                  </tr>
                </thead>
                <tbody>
                  {DAY_KEYS.map((key, i) => {
                    const raw = agent.business_hours[key] || { open: '08:00', close: '17:00', enabled: true };
                    const bh = { open: raw.open || '', close: raw.close || '', enabled: !!raw.enabled };
                    return (
                      <tr key={key} className="int-row">
                        <td className="int-td">{DAYS[i]}</td>
                        <td className="int-td">
                          <input type="time" value={bh.open} onChange={(e) => setAgent({ ...agent, business_hours: { ...agent.business_hours, [key]: { ...bh, open: e.target.value } } })} className="sett-time-input" disabled={!bh.enabled} />
                        </td>
                        <td className="int-td">
                          <input type="time" value={bh.close} onChange={(e) => setAgent({ ...agent, business_hours: { ...agent.business_hours, [key]: { ...bh, close: e.target.value } } })} className="sett-time-input" disabled={!bh.enabled} />
                        </td>
                        <td className="int-td int-td--center">
                          <label className="tt-toggle settings-toggle-inline">
                            <input type="checkbox" checked={bh.enabled} onChange={(e) => {
                              const newEnabled = e.target.checked;
                              setAgent({ ...agent, business_hours: { ...agent.business_hours, [key]: {
                                open: newEnabled && !bh.open ? '09:00' : bh.open,
                                close: newEnabled && !bh.close ? '18:00' : bh.close,
                                enabled: newEnabled,
                              } } });
                            }} />
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
            <div id="sec-arak" className="scroll-anchor" />
            <SectionCard title="Árak" svgPath="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6">
              <div className="text-desc mb-16">Az aktuális árlista itt szerkeszthető és tekinthető meg.</div>
              {(() => {
                const pl = (business as Record<string, unknown>).price_list;
                const rows = typeof pl === 'string' ? pl.split('\n').filter(r => r.trim()).map(r => {
                  const parts = r.split(' - ');
                  return {
                    category: (parts[0] || '').trim(),
                    service: (parts[1] || '').trim(),
                    price: (parts[2] || '').trim(),
                    currency: (parts[3] || '').trim(),
                    note: parts.slice(4).join(' - ').trim(),
                  };
                }) : [];
                return (
                  <>
                    {rows.length === 0 && (
                      <div className="grid-2col gap-12 mb-16">
                        <button className="btn-settings-save settings-upload-btn" onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = '.csv,.xlsx'; input.onchange = async (e: any) => { const file = e.target.files?.[0]; if (!file) return; const formData = new FormData(); formData.append('file', file); try { const res = await authFetch('/admin/api/upload_prices', { method: 'POST', body: formData }); if (res.ok) { const data = await res.json(); showToast('Árlista feltöltve!', 'success'); if (data.price_list) { setBusiness({ ...business, price_list: data.price_list, price_list_file_meta: data.price_list_file_meta }); } } else { const errData = await res.json().catch(() => null); showToast(errData?.detail || 'Feltöltési hiba', 'error'); } } catch { showToast('Feltöltési hiba', 'error'); } }; input.click(); }}>
                          Új árlista feltöltése
                        </button>
                        <button className="btn btn-accent-outline settings-download-btn" onClick={async () => { try { const res = await authFetch('/admin/api/prices/template/download'); if (res.ok) { const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'arlista_minta.xlsx'; a.click(); URL.revokeObjectURL(url); } else { showToast('Letöltési hiba', 'error'); } } catch { showToast('Letöltési hiba', 'error'); } }}>
                          Minta Excel letöltése
                        </button>
                      </div>
                    )}
                    <InlinePriceEditor
                      initialRows={rows}
                      onSave={(updatedRows) => {
                        const newPl = updatedRows.map(r => `${r.category} - ${r.service} - ${r.price} - ${r.currency} - ${r.note}`).join('\n');
                        setBusiness({ ...business, price_list: newPl });
                      }}
                    />
                  </>
                );
              })()}
            </SectionCard>

            {/* ══════ 5. Akciók, kedvezmények ══════ */}
            <div id="sec-kedvezmenyek" className="scroll-anchor" />
            <SectionCard title="Akciók, kedvezmények" svgPath="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z">

              {(business.campaigns || []).map((c: { active: boolean; text: string, name?: string }, i: number) => (
                <div key={i} className="campaign-card">
                  <div className="campaign-card-header">
                    <div className="campaign-card-title">KEDVEZMÉNY #{i + 1}</div>
                    <div className="campaign-card-actions">
                      <DeleteBtn onClick={() => { const campaigns = (business.campaigns || []).filter((_: unknown, j: number) => j !== i); setBusiness({ ...business, campaigns }); }} />
                      <label className="tt-toggle" style={{ margin: 0 }}>
                        <input type="checkbox" checked={c.active !== false} onChange={e => { const campaigns = [...(business.campaigns || [])]; campaigns[i] = { ...campaigns[i], active: e.target.checked }; setBusiness({ ...business, campaigns }); }} />
                        <span className="tt-toggle-slider" />
                      </label>
                    </div>
                  </div>
                  <div className="campaign-card-body">
                    <div className="campaign-field">
                      <label className="campaign-label">Kedvezmény neve</label>
                      <input className="tt-input" style={{ width: '100%' }} value={c.name || ''} onChange={e => { const campaigns = [...(business.campaigns || [])]; campaigns[i] = { ...campaigns[i], name: e.target.value }; setBusiness({ ...business, campaigns }); }} placeholder="pl. Nyári 10% akció" />
                    </div>
                    <div className="campaign-field mt-16">
                      <label className="campaign-label">Kedvezmény leírása</label>
                      <textarea className="tt-input" style={{ width: '100%', resize: 'vertical' }} value={c.text || ''} onChange={e => { const campaigns = [...(business.campaigns || [])]; campaigns[i] = { ...campaigns[i], text: e.target.value }; setBusiness({ ...business, campaigns }); }} placeholder="Írd ide a kedvezmény részleteit..." rows={3} />
                    </div>
                  </div>
                </div>
              ))}
              <div className="mt-16">
                <button 
                  className="campaign-add-btn"
                  onClick={() => setBusiness({ ...business, campaigns: [...(business.campaigns || []), { active: true, name: '', text: '' }] })}
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
                  Kedvezmény hozzáadása
                </button>
              </div>
            </SectionCard>

            {/* ══════ 6. Gyakori Kérdések ══════ */}
            <div id="sec-gyik" className="scroll-anchor" />
            <SectionCard title="Gyakori Kérdések" svgPath="M12 2a10 10 0 100 20 10 10 0 000-20zM9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01">
              {(business.faq || []).length === 0 && (
                <div className="settings-faq-empty">
                  <svg fill="none" stroke="var(--text-muted)" strokeWidth="1.5" viewBox="0 0 24 24" width="36" height="36" className="settings-faq-empty-icon">
                    <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><circle cx="12" cy="17" r="0.5" fill="currentColor" />
                  </svg>
                  <div className="settings-faq-empty-title">Még nincsenek gyakori kérdések hozzáadva</div>
                  <div className="settings-faq-empty-sub">Kattints a „Kérdés hozzáadása" gombra az induláshoz</div>
                </div>
              )}
              <div className="flex-col gap-16">
                {(business.faq || []).map((f, i) => (
                  <div key={i} className="settings-faq-card">
                    {/* ── Question section ── */}
                    <div className="settings-faq-question">
                      <div className="settings-faq-num">{i + 1}</div>
                      <div className="settings-faq-q-col">
                        <span className="settings-faq-label">Kérdés</span>
                        <input className="tt-input settings-faq-q-input" value={f.question}
                          onChange={e => { const faq = [...(business.faq || [])]; faq[i] = { ...faq[i], question: e.target.value }; setBusiness({ ...business, faq }); }}
                          placeholder="Írd be a kérdést..."
                        />
                      </div>
                      <DeleteBtn onClick={() => { const faq = (business.faq || []).filter((_, j) => j !== i); setBusiness({ ...business, faq }); }} />
                    </div>
                    {/* ── Answer section ── */}
                    <div className="settings-faq-answer">
                      <span className="settings-faq-a-label">Válasz</span>
                      <textarea className="tt-textarea settings-faq-a-textarea" value={f.answer}
                        onChange={e => { const faq = [...(business.faq || [])]; faq[i] = { ...faq[i], answer: e.target.value }; setBusiness({ ...business, faq }); }}
                        placeholder="Írd be a választ..."
                        ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                        onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <AddBtn label="Kérdés hozzáadása" onClick={() => setBusiness({ ...business, faq: [...(business.faq || []), { question: '', answer: '' }] })} />
            </SectionCard>
          </div>
        )}

        {/* ═══════════ SZABÁLYOK TAB ═══════════ */}
        {activeTab === 'szabalyok' && (
          <div>
            <div className="page-header">
              <div className="page-title">Ügykezelési és foglalási szabályok</div>
            </div>

            {/* ── ÜGYKEZELÉSI SZABÁLYOK ── */}
            <IssueHandlingRulesSection />

            {/* ── FOGLALÁSI SZABÁLYOK ── */}
            <div className="tt-section-title mb-16" style={{ marginTop: 32 }}>
              <div className="icon-box">
                <svg fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </div>
              Foglalási szabályok
            </div>

            {/* 1. Új/visszatérő ügyfél */}
            <SectionCard title="Új és visszatérő ügyfelek kezelése" svgPath="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 3a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75">
              <div className="settings-clients-grid">
                <LabelInput label="Ügyfél beazonosítását szolgáló kérdés" value={business.pacient_id_question} onChange={v => setBusiness({ ...business, pacient_id_question: v })} />
                <LabelInput label="Új ügyfél -- kötelezően bekérendő adat" value={business.new_patient_required} onChange={v => setBusiness({ ...business, new_patient_required: v })} />
                <div className="flex-row gap-12">
                  <label className="tt-label settings-label-nowrap">Új ügyfélnek automatikus első találkozó</label>
                  <label className="tt-toggle">
                    <input type="checkbox" checked={business.new_patient_auto_visit} onChange={e => setBusiness({ ...business, new_patient_auto_visit: e.target.checked })} />
                    <span className="tt-toggle-slider" />
                  </label>
                </div>
                <LabelInput label="Visszatérő ügyfél -- kötelező szabály" value={business.returning_patient_required} onChange={v => setBusiness({ ...business, returning_patient_required: v })} />
              </div>
            </SectionCard>

            {/* 3. Kivételek + Lemondás */}
            <div className="settings-rules-2col">
              {/* Kivételek */}
              <SectionCard title="Kivételek kezelése" svgPath="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01">
                <p className="settings-exceptions-p">Helyzetek, amikor az eaisyDesk nem foglalhat automatikusan.</p>
                {(business.exceptions || []).map((ex, i) => (
                  <div key={i} className="sett-list-item sett-list-item--mb6">
                    <input className="tt-input flex-1" value={ex} onChange={e => { const exceptions = [...(business.exceptions || [])]; exceptions[i] = e.target.value; setBusiness({ ...business, exceptions }); }} />
                    <DeleteBtn onClick={() => { const exceptions = (business.exceptions || []).filter((_, j) => j !== i); setBusiness({ ...business, exceptions }); }} />
                  </div>
                ))}
                {(!business.exceptions || business.exceptions.length === 0) && (
                  <div className="settings-exceptions-empty">
                    Még nincsenek kivételek megadva.
                  </div>
                )}
                <AddBtn label="Kivétel hozzáadása" onClick={() => setBusiness({ ...business, exceptions: [...(business.exceptions || []), ''] })} />
              </SectionCard>

              {/* Lemondás */}
              <SectionCard title="Lemondás és módosítás" svgPath="M12 2a10 10 0 100 20 10 10 0 000-20zM15 9l-6 6M9 9l6 6">
                <div className="flex-col settings-cancel-col">
                  <div>
                    <label className="tt-label">Időpont módosításának engedélyezése</label>
                    <select className="tt-select" value={business.modositas_eng} onChange={e => setBusiness({ ...business, modositas_eng: e.target.value })}>
                      <option value="igen">Igen</option>
                      <option value="nem">Nem</option>
                    </select>
                  </div>
                  <div>
                    <label className="tt-label">24 órán belüli lemondás kezelése</label>
                    <select className="tt-select" value={business.lemondas_24h} onChange={e => setBusiness({ ...business, lemondas_24h: e.target.value })}>
                      <option value="elfogadhato">Elfogadható</option>
                      <option value="figyelmeztetoSzoveggel">Elfogadható figyelmeztető szöveggel</option>
                      <option value="eloAtadas">Élő átadás szükséges</option>
                    </select>
                  </div>
                  {business.lemondas_24h === 'figyelmeztetoSzoveggel' && (
                    <textarea className="tt-textarea" value={business.figyelmezteto_szoveg} onChange={e => setBusiness({ ...business, figyelmezteto_szoveg: e.target.value })} />
                  )}
                </div>
              </SectionCard>
            </div>


          </div>
        )}
      </div>

      {/* Árlista szerkesztő modal */}
      {showPriceModal && (
        <PriceListModal
          rows={priceRows}
          setRows={setPriceRows}
          onSave={savePriceRows}
          onClose={() => setShowPriceModal(false)}
          saving={priceSaving}
        />
      )}
    </>
  );
}


// ── localStorage key for issue handling rules (frontend-only persistence) ──
const ISSUE_RULES_LS_KEY = 'eaisydesk_issue_handling_rules';

interface IssueHandlingState {
  defaultRequestNotify: string;   // Adminisztratív → Átadás embernek
  defaultComplaintNotify: string; // Reklamáció → Sürgős átadás embernek
  writtenBehavior: string;
  customRules: { desc: string; behavior: string; notify: string }[];
}

const ISSUE_HANDLING_DEFAULTS: IssueHandlingState = {
  defaultRequestNotify: '',
  defaultComplaintNotify: '',
  writtenBehavior: 'autonomous',
  customRules: [
    { desc: 'Fájdalom, duzzanat, vérzés említése', behavior: 'urgent', notify: '' },
    { desc: 'Nagyértékű kezeléssel kapcsolatos érdeklődés', behavior: 'handoff', notify: '' },
  ],
};

function loadIssueHandlingState(): IssueHandlingState {
  try {
    const raw = localStorage.getItem(ISSUE_RULES_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate old key names if present
      if (parsed.defaultNotify1 !== undefined && parsed.defaultRequestNotify === undefined) {
        parsed.defaultRequestNotify = parsed.defaultNotify2 || '';  // old notify2 was Adminisztratív
        parsed.defaultComplaintNotify = parsed.defaultNotify1 || ''; // old notify1 was Reklamáció
        delete parsed.defaultNotify1;
        delete parsed.defaultNotify2;
      }
      return { ...ISSUE_HANDLING_DEFAULTS, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...ISSUE_HANDLING_DEFAULTS, customRules: ISSUE_HANDLING_DEFAULTS.customRules.map(r => ({ ...r })) };
}

/* Info circle SVG — reusable inline icon */
const InfoIcon = ({ onClick }: { onClick?: () => void }) => (
  <svg className="ih-info-icon" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
  </svg>
);

/* Inline info banner matching Figma reference */
function IhInfoBanner({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return (
    <div className="ih-info-banner">
      <div className="ih-info-banner-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
        </svg>
      </div>
      <div className="ih-info-banner-content">
        <div className="ih-info-banner-title">{title}</div>
        <div className="ih-info-banner-body">{body}</div>
      </div>
      <button className="ih-info-banner-close" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function IssueHandlingRulesSection() {
  const [state, setState] = useState<IssueHandlingState>(loadIssueHandlingState);
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  const toggleInfo = (id: string) => setOpenInfo(prev => prev === id ? null : id);

  const handleSave = useCallback(() => {
    localStorage.setItem(ISSUE_RULES_LS_KEY, JSON.stringify(state));
    showToast('Ügykezelési szabályok mentve', 'success');
  }, [state]);

  const updateCustomRule = (idx: number, field: string, value: string) => {
    setState(prev => {
      const customRules = prev.customRules.map((r, i) => i === idx ? { ...r, [field]: value } : r);
      return { ...prev, customRules };
    });
  };

  const addCustomRule = () => {
    setState(prev => ({
      ...prev,
      customRules: [...prev.customRules, { desc: '', behavior: 'handoff', notify: '' }],
    }));
  };

  const deleteCustomRule = (idx: number) => {
    setState(prev => ({
      ...prev,
      customRules: prev.customRules.filter((_, i) => i !== idx),
    }));
  };

  return (
    <>
      {/* Save button row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="beallitasok-save-btn" onClick={handleSave}>
          Változtatások mentése
        </button>
      </div>

      <div className="tt-section">
        {/* ── Card title row ── */}
        <div className="tt-section-title mb-16">
          <div className="icon-box">
            <svg fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />
            </svg>
          </div>
          Ügykezelési szabályok
        </div>

        {/* ══════ § 1. Alapértelmezett szabályok ══════ */}
        <div className="ih-subsection-title">
          <div className="ih-subsection-icon">
            <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          </div>
          Alapértelmezett szabályok
          <InfoIcon onClick={() => toggleInfo('defaults')} />
        </div>
        {openInfo === 'defaults' && (
          <IhInfoBanner
            title="Nem automatizálható ügyek"
            body="Olyan ügytípusok, amelyeknél az eaisyDesk nem adhat végleges választ vagy nem hajthat végre önálló intézkedést. Az ügyet rögzíti és embernek továbbítja, mert adminisztratív, fizikai, jogi vagy felelősségi döntést igényelhet."
            onClose={() => setOpenInfo(null)}
          />
        )}

        {/* Column labels */}
        <div className="ih-col-labels ih-col-labels-3">
          <span className="ih-col-label">Ügytípus</span>
          <span className="ih-col-label">eaisyDesk eljárás</span>
          <span className="ih-col-label">Értesítendő</span>
        </div>

        {/* Row 1: Adminisztratív → Átadás embernek */}
        <div className="ih-row ih-row-3">
          <div className="ih-readonly">Adminisztratív, vagy fizikai akciót kívánó kérés, igény</div>
          <div className="ih-readonly">Átadás embernek</div>
          <input
            className="tt-input"
            type="text"
            value={state.defaultRequestNotify}
            onChange={e => setState(prev => ({ ...prev, defaultRequestNotify: e.target.value }))}
            placeholder="pl. vezeto@klinika.hu"
          />
        </div>

        {/* Row 2: Reklamáció → Sürgős átadás embernek */}
        <div className="ih-row ih-row-3" style={{ marginBottom: 0 }}>
          <div className="ih-readonly">Reklamáció, hiba, elégedetlenség, sérelem, konfliktus</div>
          <div className="ih-readonly">Sürgős átadás embernek</div>
          <input
            className="tt-input"
            type="text"
            value={state.defaultComplaintNotify}
            onChange={e => setState(prev => ({ ...prev, defaultComplaintNotify: e.target.value }))}
            placeholder="pl. vezeto@klinika.hu"
          />
        </div>

        {/* ══════ § 2. Írásos kommunikáció beállításai ══════ */}
        <div className="ih-subsection-title">
          <div className="ih-subsection-icon">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </div>
          Írásos kommunikáció beállításai
          <InfoIcon onClick={() => toggleInfo('written')} />
        </div>
        {openInfo === 'written' && (
          <IhInfoBanner
            title="Küldés előtti jóváhagyás"
            body="Az írásos megkereséseknél beállítható, hogy az eaisyDesk önállóan válaszoljon-e a tudástár alapján, vagy csak jóváhagyásra készítsen elő választervet."
            onClose={() => setOpenInfo(null)}
          />
        )}

        {/* Column labels */}
        <div className="ih-col-labels ih-col-labels-2">
          <span className="ih-col-label">Ügytípus</span>
          <span className="ih-col-label">eaisyDesk eljárás</span>
        </div>

        {/* Row: Written comm */}
        <div className="ih-row ih-row-2" style={{ marginBottom: 0 }}>
          <div className="ih-readonly">Kérdéskezelés a feltöltött cég- és kínálati információk alapján</div>
          <select
            className="tt-select"
            value={state.writtenBehavior}
            onChange={e => setState(prev => ({ ...prev, writtenBehavior: e.target.value }))}
          >
            <option value="autonomous">Önállóan válaszolhat</option>
            <option value="approval">Jóváhagyás szükséges</option>
          </select>
        </div>

        {/* ══════ § 3. Egyedi korlátozó szabályok ══════ */}
        <div className="ih-subsection-title">
          <div className="ih-subsection-icon">
            <svg viewBox="0 0 24 24"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="M12 6v6l4 2" /></svg>
          </div>
          Egyedi korlátozó szabályok
          <InfoIcon onClick={() => toggleInfo('custom')} />
        </div>
        {openInfo === 'custom' && (
          <IhInfoBanner
            title="Speciális helyzetek kezelése"
            body="Olyan speciális helyzetek, amikor az eaisyDesk nem válaszolhat vagy intézkedhet önállóan."
            onClose={() => setOpenInfo(null)}
          />
        )}

        {/* Column labels */}
        <div className="ih-col-labels ih-col-labels-3-del">
          <span className="ih-col-label">Ügytípus</span>
          <span className="ih-col-label">eaisyDesk eljárás</span>
          <span className="ih-col-label">Értesítendő</span>
          <span></span>
        </div>

        {/* Editable custom rule rows */}
        {state.customRules.map((rule, i) => (
          <div className="ih-row ih-row-3-del" key={i}>
            <input
              className="tt-input"
              type="text"
              value={rule.desc}
              onChange={e => updateCustomRule(i, 'desc', e.target.value)}
              placeholder="Ügytípus leírása..."
            />
            <select
              className="tt-select"
              value={rule.behavior}
              onChange={e => updateCustomRule(i, 'behavior', e.target.value)}
            >
              <option value="handoff">Átadás embernek</option>
              <option value="urgent">Sürgős átadás embernek</option>
            </select>
            <input
              className="tt-input"
              type="text"
              value={rule.notify}
              onChange={e => updateCustomRule(i, 'notify', e.target.value)}
              placeholder="pl. vezeto@klinika.hu"
            />
            <div className="ih-delete-cell">
              <DeleteBtn onClick={() => deleteCustomRule(i)} />
            </div>
          </div>
        ))}

        {/* Add rule button — scoped turquoise style */}
        <button className="ih-add-btn" onClick={addCustomRule}>
          + Szabály hozzáadása
        </button>
      </div>
    </>
  );
}


const thStyle: React.CSSProperties = { padding: '12px 16px', fontWeight: 600, textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 };
const tdStyle: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid var(--border)' };
const timeInput: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.04)', color: 'var(--text)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const listItemStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 };

// ── Sub-components ──
function _SettingsField({ label, svgPath, children }: { label: string; svgPath: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="settings-section-title mb-10">
        <div className="icon-box">
          <svg fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14"><path d={svgPath} /></svg>
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
      <div className="tt-section-title mb-16">
        <div className="icon-box">
          <svg fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="14" height="14"><path d={svgPath} /></svg>
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
    <button className="btn btn-settings-save" onClick={onClick} disabled={saving}>
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
    <button className="btn-add" onClick={onClick}>
      + {label}
    </button>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn-icon btn-icon--danger" onClick={onClick} title="Törlés">
      <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
    </button>
  );
}

/* ═══════════════════════════ PRICE LIST MODAL ═══════════════════════════ */
function PriceListModal({
  rows, setRows, onSave, onClose, saving
}: {
  rows: { category: string; service: string; price: string; currency: string; note: string }[];
  setRows: React.Dispatch<React.SetStateAction<{ category: string; service: string; price: string; currency: string; note: string }[]>>;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  const updateRow = (idx: number, field: string, value: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };
  const addRow = () => {
    setRows(prev => [...prev, { category: '', service: '', price: '', currency: 'HUF', note: '' }]);
  };
  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div
      className="modal-overlay price-modal-overlay-top"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >

      {/* Modal */}
      <div className="price-modal">
        {/* Header */}
        <div className="price-modal-header">
          <div className="price-modal-icon">
            <svg fill="none" strokeWidth="1.5" viewBox="0 0 24 24" width="22" height="22">
              <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="price-modal-title">Árlista szerkesztő</div>
            <div className="price-modal-subtitle">{rows.length} tétel · Módosítsa közvetlenül a táblázatban</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="18" height="18">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Table header */}
        <div className="price-modal-thead">
          {['Kategória', 'Szolgáltatás', 'Ár', 'Pénznem', 'Megjegyzés', ''].map((h, i) => (
            <div key={i} className={`price-modal-th ${i < 5 ? 'price-modal-th--border' : 'price-modal-th--noborder'}`}>{h}</div>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="price-modal-body">
          {rows.map((row, idx) => (
            <div key={idx} className="price-modal-row"
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(28,238,224,0.03)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <input
                value={row.category}
                onChange={e => updateRow(idx, 'category', e.target.value)}
                placeholder="pl. Konzultáció"
                className="price-modal-input"
                onFocus={e => { e.currentTarget.style.borderBottomColor = '#1ceee0'; e.currentTarget.style.background = 'rgba(28,238,224,0.05)'; }}
                onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
              />
              <input
                value={row.service}
                onChange={e => updateRow(idx, 'service', e.target.value)}
                placeholder="Szolgáltatás megnevezése"
                className="price-modal-input"
                onFocus={e => { e.currentTarget.style.borderBottomColor = '#1ceee0'; e.currentTarget.style.background = 'rgba(28,238,224,0.05)'; }}
                onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
              />
              <input
                value={row.price}
                onChange={e => updateRow(idx, 'price', e.target.value)}
                placeholder="0"
                className="price-modal-input price-modal-input--price"
                onFocus={e => { e.currentTarget.style.borderBottomColor = '#1ceee0'; e.currentTarget.style.background = 'rgba(28,238,224,0.05)'; }}
                onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
              />
              <input
                value={row.currency}
                onChange={e => updateRow(idx, 'currency', e.target.value)}
                placeholder="HUF"
                className="price-modal-input price-modal-input--currency"
                onFocus={e => { e.currentTarget.style.borderBottomColor = '#1ceee0'; e.currentTarget.style.background = 'rgba(28,238,224,0.05)'; }}
                onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
              />
              <input
                value={row.note}
                onChange={e => updateRow(idx, 'note', e.target.value)}
                placeholder="Extra információ..."
                className="price-modal-input price-modal-input--note"
                onFocus={e => { e.currentTarget.style.borderBottomColor = '#1ceee0'; e.currentTarget.style.background = 'rgba(28,238,224,0.05)'; }}
                onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
              />
              <button
                onClick={() => removeRow(idx)}
                className="price-modal-del-btn"
                onMouseEnter={e => e.currentTarget.style.color = '#ff5050'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                title="Sor törlése"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            </div>
          ))}

          {/* Add row button */}
          <button onClick={addRow} className="price-modal-add-btn"
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" />
            </svg>
            Új tétel hozzáadása
          </button>
        </div>

        {/* Footer */}
        <div className="price-modal-footer">
          <div className="price-modal-count">
            {rows.filter(r => r.service.trim() || r.category.trim()).length} aktív tétel
          </div>
          <div className="flex-row gap-10">
            <button onClick={onClose} className="price-modal-cancel"
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-muted)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              Mégse
            </button>
            <button onClick={onSave} disabled={saving} className={`price-modal-save${saving ? ' price-modal-save--saving' : ''}`}>
              {saving ? (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spin-anim"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg> Mentés...</>
              ) : (
                <><svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg> Változtatások mentése</>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes priceModalFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes priceModalSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}


function InlinePriceEditor({ initialRows, onSave }: { initialRows: { category: string; service: string; price: string; currency: string; note: string }[], onSave: (rows: any[]) => void }) {
  const [rows, setRows] = useState(initialRows.length ? initialRows : [{ category: '', service: '', price: '', currency: 'HUF', note: '' }]);
  const [saving, setSaving] = useState(false);

  const updateRow = (idx: number, field: string, value: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };
  const addRow = () => {
    setRows(prev => [...prev, { category: '', service: '', price: '', currency: 'HUF', note: '' }]);
  };
  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };
  const clearAllRows = () => {
    if (window.confirm('Biztosan törölni szeretnéd a teljes árlistát? Ezt követően a Változtatások mentése gombbal véglegesítheted.')) {
      setRows([]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(rows);
    setSaving(false);
  };
  
  const handleCancel = () => {
    if (initialRows.length > 0) {
      setRows(initialRows);
    } else {
      setRows([{ category: '', service: '', price: '', currency: 'HUF', note: '' }]);
    }
  };

  return (
    <div className="price-inline-editor">
      {/* Table header */}
      <div className="price-modal-thead">
        {['KATEGÓRIA', 'SZOLGÁLTATÁS', 'ÁR', 'PÉNZNEM', 'MEGJEGYZÉS', ''].map((h, i) => (
          <div key={i} className={`price-modal-th ${i < 5 ? 'price-modal-th--border' : 'price-modal-th--noborder'}`}>{h}</div>
        ))}
      </div>

      {/* Scrollable body */}
      <div className="price-modal-body" style={{ maxHeight: 'none', overflowY: 'visible', paddingBottom: '16px' }}>
        {rows.map((row, idx) => (
          <div key={idx} className="price-modal-row"
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(28,238,224,0.03)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <input
              value={row.category}
              onChange={e => updateRow(idx, 'category', e.target.value)}
              placeholder="pl. Konzultáció"
              className="price-modal-input"
              onFocus={e => { e.currentTarget.style.borderBottomColor = '#1ceee0'; e.currentTarget.style.background = 'rgba(28,238,224,0.05)'; }}
              onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
            />
            <input
              value={row.service}
              onChange={e => updateRow(idx, 'service', e.target.value)}
              placeholder="Szolgáltatás megnevezése"
              className="price-modal-input"
              onFocus={e => { e.currentTarget.style.borderBottomColor = '#1ceee0'; e.currentTarget.style.background = 'rgba(28,238,224,0.05)'; }}
              onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
            />
            <input
              value={row.price}
              onChange={e => updateRow(idx, 'price', e.target.value)}
              placeholder="0"
              className="price-modal-input price-modal-input--price"
              onFocus={e => { e.currentTarget.style.borderBottomColor = '#1ceee0'; e.currentTarget.style.background = 'rgba(28,238,224,0.05)'; }}
              onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
            />
            <input
              value={row.currency}
              onChange={e => updateRow(idx, 'currency', e.target.value)}
              placeholder="HUF"
              className="price-modal-input price-modal-input--currency"
              onFocus={e => { e.currentTarget.style.borderBottomColor = '#1ceee0'; e.currentTarget.style.background = 'rgba(28,238,224,0.05)'; }}
              onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
            />
            <input
              value={row.note}
              onChange={e => updateRow(idx, 'note', e.target.value)}
              placeholder="Extra információ..."
              className="price-modal-input price-modal-input--note"
              onFocus={e => { e.currentTarget.style.borderBottomColor = '#1ceee0'; e.currentTarget.style.background = 'rgba(28,238,224,0.05)'; }}
              onBlur={e => { e.currentTarget.style.borderBottomColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
            />
            <button
              onClick={() => removeRow(idx)}
              className="price-modal-del-btn"
              onMouseEnter={e => e.currentTarget.style.color = '#ff5050'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
              title="Sor törlése"
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      
      {/* Add row / Clear all buttons */}
      <div style={{ padding: '0 0 16px 0', display: 'flex', gap: '24px', alignItems: 'center' }}>
        <button onClick={addRow} className="price-modal-add-btn"
          style={{ width: 'auto', margin: 0, padding: 0, color: '#1ceee0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, border: 'none', background: 'transparent', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
        >
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" />
          </svg>
          Új tétel hozzáadása
        </button>
        <button onClick={clearAllRows} className="price-modal-clear-btn"
          style={{ width: 'auto', margin: 0, padding: 0, color: '#ff5050', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, border: 'none', background: 'transparent', cursor: 'pointer', opacity: 0.7 }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
        >
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
          </svg>
          Teljes árlista törlése
        </button>
      </div>

      {/* Footer */}
      <div className="price-modal-footer" style={{ borderTop: '1px solid var(--border)', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="price-modal-count" style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          {rows.filter(r => r.service.trim() || r.category.trim()).length} aktív tétel
        </div>
        <div className="flex-row gap-10">
          <button onClick={handleCancel} className="price-modal-cancel" style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid var(--border)', background: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', color: '#082432' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            Mégse
          </button>
          <button onClick={handleSave} disabled={saving} className={`price-modal-save${saving ? ' price-modal-save--saving' : ''}`} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', background: '#1ceee0', color: '#082432', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            {saving ? (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spin-anim"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg> Mentés...</>
            ) : (
              <><svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg> Változtatások mentése</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
