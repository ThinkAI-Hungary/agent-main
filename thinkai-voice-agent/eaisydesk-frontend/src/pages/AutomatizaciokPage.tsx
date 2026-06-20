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
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Emlékeztető mentve!');
    } catch {
      showToast('Hiba a mentés során!', 'error');
    }
  }, [reminder]);

  if (loading) {
    return (
      <div className="page active" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return (
    <div className="page active" id="page-automatizaciok">
      {/* ── Page Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 36, paddingBottom: 24,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 6,
            background: 'linear-gradient(135deg, rgba(28,238,224,0.12), rgba(20,184,173,0.08))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(28,238,224,0.15)',
          }}>
            <svg fill="none" stroke="#1ceee0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="22" height="22">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.5 }}>Automatikus értesítések</div>
          </div>
        </div>

        {/* KPI pills */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{
            background: 'rgba(28,238,224,0.06)', border: '1px solid rgba(28,238,224,0.12)',
            borderRadius: 10, padding: '10px 18px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1ceee0' }}>{automations.filter(a => a.enabled).length + (reminder.reminder_enabled ? 1 : 0)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>AKTÍV SZABÁLY</div>
          </div>
          <div style={{
            background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)',
            borderRadius: 10, padding: '10px 18px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#8b5cf6' }}>{automations.length + 1}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>ÖSSZES</div>
          </div>
        </div>
      </div>

      {/* ═══════ EGYESÍTETT SZEKCIÓ ═══════ */}
      <div style={sectionStyle}>
        <div style={{ padding: '24px' }}>
          
          {/* 1. Időpont emlékeztető (Statikus sor) */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, marginBottom: 12, overflow: 'hidden',
            transition: 'all 0.25s ease',
          }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', cursor: 'pointer' }}
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

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: reminder.reminder_enabled ? 'var(--text)' : 'var(--text-muted)' }}>
                  Időpont emlékeztető
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Automatikus emlékeztető küldése időpont előtt</div>
              </div>
              <div style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: '#1ceee012', color: '#1ceee0' }}>
                {reminder.reminder_hours}h
              </div>
              <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16"
                style={{ transition: 'transform 0.2s', transform: expandedAuto === -1 ? 'rotate(180deg)' : 'rotate(0)' }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
            
              {expandedAuto === -1 && (
              <div style={{
                margin: '0 20px 20px',
                padding: 20,
                background: 'linear-gradient(135deg, rgba(28,238,224,0.04), rgba(28,238,224,0.01))',
                borderRadius: 12,
                border: '1px solid rgba(28,238,224,0.12)',
                borderLeft: '3px solid #1ceee0',
              }}>
                {/* Timing row */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
                      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                    </svg>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1ceee0', textTransform: 'uppercase', letterSpacing: 0.5 }}>Időzítés</span>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: 'rgba(255,255,255,0.04)', padding: '10px 14px', borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <input type="number" className="tt-input" value={reminder.reminder_hours} min={1} max={168}
                      onChange={e => setReminder({ ...reminder, reminder_hours: Number(e.target.value) })}
                      onBlur={() => saveReminder()}
                      style={{ width: 60, padding: '8px 14px', fontSize: 13, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(28,238,224,0.35)', color: 'var(--text)', fontWeight: 600 }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>órával az időpont előtt</span>
                  </div>
                </div>

                {/* Template */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1ceee0', textTransform: 'uppercase', letterSpacing: 0.5 }}>Üzenet sablon</span>
                  </div>
                  <textarea className="tt-textarea" value={reminder.reminder_template}
                    ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                    onChange={e => {
                      setReminder({ ...reminder, reminder_template: e.target.value });
                      e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onBlur={() => saveReminder()}
                    style={{
                      minHeight: 48, fontSize: 13, lineHeight: 1.6, width: '100%', resize: 'none', overflow: 'hidden',
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(28,238,224,0.35)', borderRadius: 10, padding: 14,
                    }}
                    placeholder="Kedves {nev}! Emlékeztetjük, hogy holnap {idopont}-kor időpontja van..."
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
              <div key={a.id} style={{
                background: isExpanded ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.03)',
                border: isExpanded ? `1px solid ${meta.color}22` : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12, marginBottom: 12, overflow: 'hidden',
                transition: 'all 0.25s ease',
              }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', cursor: 'pointer' }}
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

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: a.enabled ? 'var(--text)' : 'var(--text-muted)' }}>
                      {meta.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{meta.desc}</div>
                  </div>
                  <div style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${meta.color}12`, color: meta.color }}>
                    {DELAY_OPTIONS.find(o => o.value === a.delay_hours)?.label || `${a.delay_hours}h`}
                  </div>
                  <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16"
                    style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>

                {isExpanded && (
                  <div style={{
                    margin: '0 20px 20px',
                    padding: 20,
                    background: 'linear-gradient(135deg, rgba(28,238,224,0.04), rgba(28,238,224,0.01))',
                    borderRadius: 12,
                    border: '1px solid rgba(28,238,224,0.12)',
                    borderLeft: '3px solid #1ceee0',
                  }}>
                    {/* Timing row */}
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
                          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                        </svg>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#1ceee0', textTransform: 'uppercase', letterSpacing: 0.5 }}>Késleltetés</span>
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        background: 'rgba(255,255,255,0.04)', padding: '10px 14px', borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap',
                      }}>
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
                          }}
                          style={{ width: 'auto', minWidth: 130, padding: '8px 14px', fontSize: 13, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(28,238,224,0.35)', color: 'var(--text)', fontWeight: 600 }}>
                          {DELAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        
                        {/* Inaktivitási küszöb beállítás, csak az inaktív ügyfél opciónál */}
                        {a.trigger_type === 'inactive_client' && (
                          <>
                            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Inaktivitási küszöb:</label>
                            <input type="number" className="tt-input" value={inactivityDays} min={7} max={365}
                              onChange={e => setInactivityDays(Number(e.target.value))}
                              onBlur={() => {
                                localStorage.setItem('thinkai_inactivity_days', String(inactivityDays));
                                showToast('Mentve');
                              }}
                              style={{ width: 90, padding: '8px 14px', fontSize: 13, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(28,238,224,0.35)', color: '#ef4444', fontWeight: 700, textAlign: 'center' }}
                            />
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>nap elteltével</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Template */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
                          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                        </svg>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#1ceee0', textTransform: 'uppercase', letterSpacing: 0.5 }}>Üzenet sablon</span>
                      </div>
                      <textarea className="tt-textarea" value={a.message_template || ''}
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
                        style={{
                          minHeight: 48, fontSize: 13, lineHeight: 1.6, width: '100%', resize: 'none', overflow: 'hidden',
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(28,238,224,0.35)', borderRadius: 10, padding: 14,
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
