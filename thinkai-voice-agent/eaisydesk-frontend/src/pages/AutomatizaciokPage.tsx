/**
 * AutomatizaciokPage – Automatizációk és beállítások.
 * 3 szekció: Időpont emlékeztetők, Címkerendszer, Eseményvezérelt kommunikáció.
 */
import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../api/client';
import { showToast } from '../components/ui/Toast';

// ── Interfaces ──
interface ReminderSettings {
  id?: number;
  reminder_enabled: boolean;
  reminder_hours: number;
  reminder_template: string;
  confirmation_enabled?: boolean;
  confirmation_subject?: string;
  confirmation_template?: string;
  confirmation_cancel_link?: boolean;
}
interface OutboundAutomation {
  id: number;
  name: string;
  trigger_type: string;
  enabled: boolean;
  delay_hours: number;
  message_template: string;
}

// ── Constants ──
const TRIGGER_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  no_show: { label: 'No-show utáni üzenet', desc: 'Automatikus email küldése no-show címke esetén', color: '#ef4444' },
  inactive_client: { label: 'Inaktív ügyfél reaktiválás', desc: 'Email inaktívvá vált ügyfeleknek', color: '#f59e0b' },
  follow_up: { label: 'Utánkövetés (elégedettség)', desc: 'Email küldése sikeres időpont után', color: '#22c55e' },
  price_inquiry_follow: { label: 'Ajánlatkövetés', desc: 'Follow-up árkérdés címkéjű ügyfeleknek', color: '#3b82f6' },
  cancelled_no_rebook: { label: 'Lemondás utáni újrafoglalás', desc: 'Email, ha lemondtak és nem foglaltak újat', color: '#8b5cf6' },
};
const DELAY_OPTIONS = [
  { value: 0, label: 'Azonnal' },
  { value: 24, label: '24 óra' },
  { value: 48, label: '48 óra' },
  { value: 72, label: '72 óra' },
  { value: 168, label: '7 nap' },
  { value: 720, label: '30 nap' },
];

const sectionStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
  overflow: 'hidden',
  marginBottom: 28,
  boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
};
const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '22px 28px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(255,255,255,0.02)',
};
const sectionBodyStyle: React.CSSProperties = {
  padding: '28px',
};
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 8,
  letterSpacing: 0.3,
  textTransform: 'uppercase',
};

export default function AutomatizaciokPage() {
  const [reminder, setReminder] = useState<ReminderSettings>({
    reminder_enabled: false, reminder_hours: 24, reminder_template: '',
    confirmation_enabled: true, confirmation_subject: 'Időpont visszaigazolás',
    confirmation_template: '', confirmation_cancel_link: true,
  });
  const [automations, setAutomations] = useState<OutboundAutomation[]>([]);
  const [inactivityDays, setInactivityDays] = useState(60);
  const [loading, setLoading] = useState(true);
  const [expandedAuto, setExpandedAuto] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [remRes, autoRes] = await Promise.all([
          authFetch('/admin/api/settings/reminder'),
          authFetch('/admin/api/outbound_automations'),
        ]);
        const remData = await remRes.json();
        const autoData = await autoRes.json();
        if (remData && !remData.error) setReminder(remData as ReminderSettings);
        if (Array.isArray(autoData)) setAutomations(autoData as OutboundAutomation[]);
        const saved = localStorage.getItem('thinkai_inactivity_days');
        if (saved) setInactivityDays(Number(saved));
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const saveReminder = useCallback(async (overrides?: Partial<ReminderSettings>) => {
    const toSave = { ...reminder, ...overrides };
    try {
      const res = await authFetch('/admin/api/settings/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reminder_enabled: toSave.reminder_enabled,
          reminder_hours: toSave.reminder_hours,
          reminder_template: toSave.reminder_template,
          confirmation_enabled: toSave.confirmation_enabled ?? true,
          confirmation_subject: toSave.confirmation_subject ?? '',
          confirmation_template: toSave.confirmation_template ?? '',
          confirmation_cancel_link: toSave.confirmation_cancel_link ?? true,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Beállítások mentve!');
    } catch {
      showToast('Hiba a mentés során!', 'error');
    }
  }, [reminder]);

  if (loading) {
    return (
      <div className="flex-row auto-loading">
        <div className="spinner spinner--md" />
      </div>
    );
  }

  return (
    <div className="page active" id="page-automatizaciok">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-title">Automatikus értesítések</div>
      </div>




      {/* ═══════ EGYESÍTETT SZEKCIÓ ═══════ */}
      <div className="auto-section-card">
        <div className="p-24">
          
          {/* 1. Időpont emlékeztető (Statikus sor) */}
          <div className="auto-item-card">
            <div
              className="flex-row auto-row-trigger"
              onClick={() => setExpandedAuto(expandedAuto === -1 ? null : -1)}
            >
              <label className="tt-toggle" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={reminder.reminder_enabled}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    setReminder(prev => ({ ...prev, reminder_enabled: enabled }));
                    try {
                      const res = await authFetch('/admin/api/settings/reminder', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          reminder_enabled: enabled,
                          reminder_hours: reminder.reminder_hours,
                          reminder_template: reminder.reminder_template,
                        }),
                      });
                      if (!res.ok) throw new Error('Save failed');
                      showToast(enabled ? 'Aktiválva' : 'Kikapcsolva');
                    } catch { showToast('Hiba a mentés során!', 'error'); }
                  }}
                />
                <span className="tt-toggle-slider" />
              </label>

              <div className="flex-1">
                <div className={`auto-row-title ${reminder.reminder_enabled ? '' : 'auto-row-title--muted'}`}>
                  Időpont emlékeztető
                </div>
                <div className="auto-row-desc">Automatikus emlékeztető küldése időpont előtt</div>
              </div>
              <div className="auto-delay-badge auto-delay-badge--reminder">
                {reminder.reminder_hours}h
              </div>
              <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16"
                className={`auto-chevron ${expandedAuto === -1 ? 'auto-chevron--open' : 'auto-chevron--closed'}`}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
            
              {expandedAuto === -1 && (
              <div className="auto-expand-body">
                {/* Timing row */}
                <div className="mb-20">
                  <div className="flex-row gap-8 mb-12">
                    <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
                      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                    </svg>
                    <span className="auto-label-accent">Időzítés</span>
                  </div>
                  <div className="auto-timing-row">
                    <input type="number" className="tt-input auto-timing-input" value={reminder.reminder_hours} min={1} max={168}
                      onChange={e => setReminder({ ...reminder, reminder_hours: Number(e.target.value) })}
                      onBlur={() => saveReminder()}
                    />
                    <span className="auto-timing-lbl">órával az időpont előtt</span>
                  </div>
                </div>

                {/* Template */}
                <div>
                  <div className="flex-row gap-8 mb-12">
                    <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                    <span className="auto-label-accent">Üzenet sablon</span>
                  </div>
                  <textarea className="tt-textarea auto-template-textarea" value={reminder.reminder_template}
                    ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                    onChange={e => {
                      setReminder({ ...reminder, reminder_template: e.target.value });
                      e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onBlur={() => saveReminder()}
                    placeholder="Kedves {nev}! Emlékeztetjük, hogy holnap {idopont}-kor időpontja van..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* 1/b. Időpont visszaigazolás (Statikus sor) */}
          <div className="auto-item-card">
            <div
              className="flex-row auto-row-trigger"
              onClick={() => setExpandedAuto(expandedAuto === -2 ? null : -2)}
            >
              <label className="tt-toggle" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={reminder.confirmation_enabled ?? true}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    setReminder(prev => ({ ...prev, confirmation_enabled: enabled }));
                    try {
                      await saveReminder({ confirmation_enabled: enabled });
                    } catch { showToast('Hiba a mentés során!', 'error'); }
                  }}
                />
                <span className="tt-toggle-slider" />
              </label>

              <div className="flex-1">
                <div className={`auto-row-title ${(reminder.confirmation_enabled ?? true) ? '' : 'auto-row-title--muted'}`}>
                  Időpont visszaigazolás
                </div>
                <div className="auto-row-desc">Visszaigazoló email küldése foglaláskor</div>
              </div>
              <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16"
                className={`auto-chevron ${expandedAuto === -2 ? 'auto-chevron--open' : 'auto-chevron--closed'}`}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>

            {expandedAuto === -2 && (
              <div className="auto-expand-body">
                {/* Lemondási link kapcsoló */}
                <div className="mb-20">
                  <div className="flex-row gap-8 mb-12">
                    <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
                      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                    </svg>
                    <span className="auto-label-accent">Lemondási lehetőség</span>
                  </div>
                  <label className="check" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={reminder.confirmation_cancel_link ?? true}
                      onChange={e => { setReminder(prev => ({ ...prev, confirmation_cancel_link: e.target.checked })); }}
                      style={{ width: 16, height: 16, accentColor: '#1ceee0' }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>Az ügyfelek emailből lemondhassák az időpontjukat (lemondási gomb az emailben)</span>
                  </label>
                </div>

                {/* Tárgy */}
                <div className="mb-20">
                  <div className="flex-row gap-8 mb-12">
                    <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                    </svg>
                    <span className="auto-label-accent">Email tárgya</span>
                  </div>
                  <input type="text" className="tt-input" style={{ width: '100%' }} value={reminder.confirmation_subject ?? ''}
                    onChange={e => setReminder(prev => ({ ...prev, confirmation_subject: e.target.value }))}
                    onBlur={() => saveReminder()}
                    placeholder="Időpont visszaigazolás"
                  />
                </div>

                {/* Sablon */}
                <div>
                  <div className="flex-row gap-8 mb-12">
                    <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                    <span className="auto-label-accent">Email sablon</span>
                  </div>
                  <textarea className="tt-textarea auto-template-textarea" value={reminder.confirmation_template ?? ''}
                    ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                    onChange={e => {
                      setReminder(prev => ({ ...prev, confirmation_template: e.target.value }));
                      e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onBlur={() => saveReminder()}
                    placeholder="Üresen hagyva a beépített visszaigazoló sablon megy. Helyettesítők: {nev}, {idopont}, {szolgaltatas}, {lemondas_gomb}"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 2. Dinamikus Automatizációk */}
          {automations.map((a) => {
            const meta = TRIGGER_LABELS[a.trigger_type] || { label: a.name, desc: '', color: '#6b8b99' };
            const isExpanded = expandedAuto === a.id;
            return (
              <div key={a.id} className={`auto-item-card ${isExpanded ? 'auto-item-card--expanded' : ''}`} style={isExpanded ? { '--auto-color': meta.color, borderColor: `${meta.color}22` } as React.CSSProperties : undefined}>
            <div
                  className="flex-row auto-row-trigger"
                  onClick={() => setExpandedAuto(isExpanded ? null : a.id)}
                >
                  <label className="tt-toggle" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={a.enabled}
                      onChange={async (e) => {
                        const enabled = e.target.checked;
                        setAutomations(prev => prev.map(x => x.id === a.id ? { ...x, enabled } : x));
                        try {
                          const res = await authFetch(`/admin/api/outbound_automations/${a.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ enabled }),
                          });
                          if (!res.ok) throw new Error('Save failed');
                          showToast(enabled ? 'Aktiválva' : 'Kikapcsolva');
                        } catch {
                          setAutomations(prev => prev.map(x => x.id === a.id ? { ...x, enabled: !enabled } : x));
                          showToast('Hiba a mentés során!', 'error');
                        }
                      }}
                    />
                    <span className="tt-toggle-slider" />
                  </label>

                  <div className="flex-1">
                    <div className={`auto-row-title ${a.enabled ? '' : 'auto-row-title--muted'}`}>
                      {meta.label}
                    </div>
                    <div className="auto-row-desc">{meta.desc}</div>
                  </div>
                  <div className="auto-delay-badge" style={{ background: `${meta.color}12`, color: meta.color }}>
                    {DELAY_OPTIONS.find(o => o.value === a.delay_hours)?.label || `${a.delay_hours}h`}
                  </div>
                  <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16"
                    className={`auto-chevron ${isExpanded ? 'auto-chevron--open' : 'auto-chevron--closed'}`}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>

                {isExpanded && (
                  <div className="auto-expand-body">
                    {/* Timing row */}
                    <div className="mb-20">
                      <div className="flex-row gap-8 mb-12">
                        <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
                          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                        </svg>
                        <span className="auto-label-accent">Késleltetés</span>
                      </div>
                      <div className="auto-timing-row auto-timing-row--flex">
                        <select className="tt-input" value={a.delay_hours}
                          onChange={async (e) => {
                            const delay_hours = Number(e.target.value);
                            setAutomations(prev => prev.map(x => x.id === a.id ? { ...x, delay_hours } : x));
                            try {
                              const res = await authFetch(`/admin/api/outbound_automations/${a.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ delay_hours }),
                              });
                              if (!res.ok) throw new Error('Save failed');
                              showToast('Késleltetés mentve');
                            } catch { showToast('Hiba a mentés során!', 'error'); }
                          }}>
                          {DELAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        
                        {/* Inaktivitási küszöb beállítás, csak az inaktív ügyfél opciónál */}
                        {a.trigger_type === 'inactive_client' && (
                          <>
                            <div className="auto-timing-divider" />
                            <label className="auto-inactivity-lbl">Inaktivitási küszöb:</label>
                            <input type="number" className="tt-input auto-inactivity-input" value={inactivityDays} min={7} max={365}
                              onChange={e => setInactivityDays(Number(e.target.value))}
                              onBlur={() => {
                                localStorage.setItem('thinkai_inactivity_days', String(inactivityDays));
                                showToast('Mentve');
                              }}
                            />
                            <span className="auto-inactivity-after">nap elteltével</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Template */}
                    <div>
                      <div className="flex-row gap-8 mb-12">
                        <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
                          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                        </svg>
                        <span className="auto-label-accent">Üzenet sablon</span>
                      </div>
                      <textarea className="tt-textarea auto-template-textarea" value={a.message_template || ''}
                        ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                        onChange={e => {
                          setAutomations(prev => prev.map(x => x.id === a.id ? { ...x, message_template: e.target.value } : x));
                          e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        onBlur={async () => {
                          try {
                            const res = await authFetch(`/admin/api/outbound_automations/${a.id}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ message_template: a.message_template }),
                            });
                            if (!res.ok) throw new Error('Save failed');
                            showToast('Sablon mentve');
                          } catch { showToast('Hiba a mentés során!', 'error'); }
                        }}
                        placeholder="Üzenet sablon..."
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
