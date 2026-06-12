/**
 * AutomatizaciokPage – Automatizációk és beállítások.
 * 3 szekció: Időpont emlékeztetők, Címkerendszer, Eseményvezérelt kommunikáció.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
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
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  overflow: 'hidden',
  marginBottom: 24,
};
const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '20px 28px',
  borderBottom: '1px solid var(--border)',
};
const sectionBodyStyle: React.CSSProperties = {
  padding: '24px 28px',
};
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 8,
  letterSpacing: 0.3,
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
          supabase.from('reminder_settings').select('*').limit(1).single(),
          supabase.from('outbound_automations').select('*').order('id'),
        ]);
        if (remRes.data) setReminder(remRes.data as ReminderSettings);
        if (autoRes.data) setAutomations(autoRes.data as OutboundAutomation[]);
        const saved = localStorage.getItem('thinkai_inactivity_days');
        if (saved) setInactivityDays(Number(saved));
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const saveReminder = useCallback(async () => {
    try {
      if (reminder.id) {
        await supabase.from('reminder_settings').update({
          reminder_enabled: reminder.reminder_enabled,
          reminder_hours: reminder.reminder_hours,
          reminder_template: reminder.reminder_template,
        }).eq('id', reminder.id);
      } else {
        const { data } = await supabase.from('reminder_settings').insert({
          reminder_enabled: reminder.reminder_enabled,
          reminder_hours: reminder.reminder_hours,
          reminder_template: reminder.reminder_template,
        }).select().single();
        if (data) setReminder(data as ReminderSettings);
      }
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
        marginBottom: 32, paddingBottom: 20,
        borderBottom: '1px solid var(--border)',
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
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.5 }}>Automatizációk</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
              Időpont emlékeztetők, címkék és eseményvezérelt kommunikáció
            </div>
          </div>
        </div>

        {/* KPI pills */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{
            background: 'rgba(28,238,224,0.06)', border: '1px solid rgba(28,238,224,0.12)',
            borderRadius: 10, padding: '10px 18px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1ceee0' }}>{automations.filter(a => a.enabled).length}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>AKTÍV SZABÁLY</div>
          </div>
          <div style={{
            background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)',
            borderRadius: 10, padding: '10px 18px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#8b5cf6' }}>{automations.length}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>ÖSSZES</div>
          </div>
        </div>
      </div>

      {/* ═══════ 1. IDŐPONT EMLÉKEZTETŐK ═══════ */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: 'linear-gradient(135deg, rgba(28,238,224,0.1), rgba(28,238,224,0.05))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg fill="none" stroke="#1ceee0" strokeWidth="2" viewBox="0 0 24 24" width="18" height="18">
              <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Időpont emlékeztetők</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Automatikus emlékeztető küldése időpont előtt</div>
          </div>
          <div style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: reminder.reminder_enabled ? 'rgba(34,197,94,0.1)' : 'rgba(107,139,153,0.1)',
            color: reminder.reminder_enabled ? '#22c55e' : '#6b8b99',
          }}>
            {reminder.reminder_enabled ? '● Aktív' : '○ Kikapcsolva'}
          </div>
        </div>
        <div style={sectionBodyStyle}>
          {/* Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24,
            background: 'var(--bg)', borderRadius: 6, padding: '14px 18px', border: '1px solid var(--border)',
          }}>
            <label className="tt-toggle">
              <input type="checkbox" checked={reminder.reminder_enabled}
                onChange={async (e) => {
                  const enabled = e.target.checked;
                  setReminder(prev => ({ ...prev, reminder_enabled: enabled }));
                  try {
                    if (reminder.id) {
                      await supabase.from('reminder_settings').update({ reminder_enabled: enabled }).eq('id', reminder.id);
                    } else {
                      const { data } = await supabase.from('reminder_settings').insert({
                        reminder_enabled: enabled, reminder_hours: reminder.reminder_hours, reminder_template: reminder.reminder_template,
                      }).select().single();
                      if (data) setReminder(data as ReminderSettings);
                    }
                    showToast(enabled ? 'Emlékeztető bekapcsolva!' : 'Emlékeztető kikapcsolva!');
                  } catch { showToast('Hiba!', 'error'); }
                }}
              />
              <span className="tt-toggle-slider" />
            </label>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Automatikus emlékeztetők aktiválása</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Az AI automatikusan emlékeztető üzenetet küld a beállított idővel az időpont előtt</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20, marginBottom: 20 }}>
            {/* Hours */}
            <div>
              <label style={labelStyle}>Emlékeztetés ideje</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" className="tt-input" value={reminder.reminder_hours}
                  min={1} max={168}
                  onChange={e => setReminder({ ...reminder, reminder_hours: Number(e.target.value) })}
                  onBlur={() => saveReminder()}
                  style={{ maxWidth: 80, textAlign: 'center', fontSize: 16, fontWeight: 700 }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>órával az időpont előtt</span>
              </div>
            </div>
            {/* Template */}
            <div>
              <label style={labelStyle}>Üzenet sablon</label>
              <textarea className="tt-textarea" rows={3} value={reminder.reminder_template}
                onChange={e => setReminder({ ...reminder, reminder_template: e.target.value })}
                onBlur={() => saveReminder()}
                placeholder="Kedves {nev}! Emlékeztetjük, hogy holnap {idopont}-kor időpontja van..."
                style={{ fontSize: 13, lineHeight: 1.6 }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['{nev}', '{idopont}', '{szolgaltatas}', '{telephely}'].map(v => (
                  <span key={v} style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'monospace',
                    background: 'rgba(28,238,224,0.06)', color: '#1ceee0', border: '1px solid rgba(28,238,224,0.12)',
                  }}>{v}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ 2. CÍMKERENDSZER ═══════ */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.05))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg fill="none" stroke="#f59e0b" strokeWidth="2" viewBox="0 0 24 24" width="18" height="18">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
              <circle cx="7" cy="7" r="1" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Címkerendszer beállítások</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Automatikus ügyfél-címkézés konfigurálása</div>
          </div>
        </div>
        <div style={sectionBodyStyle}>
          <div style={{
            background: 'var(--bg)', borderRadius: 6, padding: '18px 20px',
            border: '1px solid var(--border)', marginBottom: 16,
          }}>
            <label style={labelStyle}>Inaktivitási küszöb</label>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Ha az ügyfél ennyi napja nem lépett kapcsolatba, automatikusan <strong style={{ color: '#f59e0b' }}>„INAKTÍV"</strong> címkét kap
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="number" className="tt-input" value={inactivityDays}
                min={7} max={365} style={{ maxWidth: 80, textAlign: 'center', fontSize: 16, fontWeight: 700 }}
                onChange={e => setInactivityDays(Number(e.target.value))}
                onBlur={() => {
                  localStorage.setItem('thinkai_inactivity_days', String(inactivityDays));
                  showToast('Mentve');
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>nap</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ 3. ESEMÉNYVEZÉRELT KOMMUNIKÁCIÓ ═══════ */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(139,92,246,0.05))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg fill="none" stroke="#8b5cf6" strokeWidth="2" viewBox="0 0 24 24" width="18" height="18">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Eseményvezérelt kommunikáció</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Automatikus üzenetek küldése meghatározott események bekövetkezésekor</div>
          </div>
          <div style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: 'rgba(139,92,246,0.1)', color: '#8b5cf6',
          }}>
            {automations.filter(a => a.enabled).length}/{automations.length} aktív
          </div>
        </div>
        <div style={{ padding: '16px 28px 28px' }}>
          {automations.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)',
              fontSize: 13, background: 'var(--bg)', borderRadius: 6,
              border: '1.5px dashed var(--border)',
            }}>
              <svg fill="none" stroke="var(--text-muted)" strokeWidth="1.5" viewBox="0 0 24 24" width="32" height="32" style={{ marginBottom: 10, opacity: 0.5 }}>
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8" />
              </svg>
              <div>Nincs beállított automatizáció.</div>
            </div>
          ) : (
            automations.map((a) => {
              const meta = TRIGGER_LABELS[a.trigger_type] || { label: a.name, desc: '', color: '#6b8b99' };
              const isExpanded = expandedAuto === a.id;
              return (
                <div key={a.id} style={{
                  background: 'var(--bg)',
                  border: `1px solid ${a.enabled ? `${meta.color}22` : 'var(--border)'}`,
                  borderRadius: 6, marginBottom: 10, overflow: 'hidden',
                  transition: 'all 0.2s ease',
                }}>
                  {/* Header row */}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 20px', cursor: 'pointer',
                    }}
                    onClick={() => setExpandedAuto(isExpanded ? null : a.id)}
                  >
                    <label className="tt-toggle" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={a.enabled}
                        onChange={e => {
                          const updated = { ...a, enabled: e.target.checked };
                          setAutomations(prev => prev.map(x => x.id === a.id ? updated : x));
                          supabase.from('outbound_automations').update({ enabled: e.target.checked }).eq('id', a.id)
                            .then(() => showToast(e.target.checked ? 'Aktiválva' : 'Kikapcsolva'));
                        }}
                      />
                      <span className="tt-toggle-slider" />
                    </label>
                    <div style={{
                      width: 4, height: 28, borderRadius: 2,
                      background: a.enabled ? meta.color : 'var(--border)',
                      transition: 'background 0.2s',
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: a.enabled ? 'var(--text)' : 'var(--text-muted)' }}>
                        {meta.label}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{meta.desc}</div>
                    </div>
                    <div style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: `${meta.color}12`, color: meta.color,
                    }}>
                      {DELAY_OPTIONS.find(o => o.value === a.delay_hours)?.label || `${a.delay_hours}h`}
                    </div>
                    <svg fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16"
                      style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div style={{
                      padding: '0 20px 18px',
                      borderTop: '1px solid var(--border)',
                      paddingTop: 16,
                    }}>
                      {/* Késleltetés inline */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Késleltetés:</label>
                        <select className="tt-input" value={a.delay_hours}
                          onChange={e => {
                            const updated = { ...a, delay_hours: Number(e.target.value) };
                            setAutomations(prev => prev.map(x => x.id === a.id ? updated : x));
                            supabase.from('outbound_automations').update({ delay_hours: Number(e.target.value) }).eq('id', a.id);
                          }}
                          style={{ width: 'auto', minWidth: 120, padding: '6px 12px', fontSize: 13, borderRadius: 8 }}>
                          {DELAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>

                      {/* Sablon teljes szélességben */}
                      <div>
                        <label style={labelStyle}>Üzenet sablon</label>
                        <textarea className="tt-textarea" value={a.message_template || ''}
                          onChange={e => {
                            setAutomations(prev => prev.map(x => x.id === a.id ? { ...x, message_template: e.target.value } : x));
                            // Auto-resize
                            e.target.style.height = 'auto';
                            e.target.style.height = e.target.scrollHeight + 'px';
                          }}
                          onFocus={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                          onBlur={() => supabase.from('outbound_automations').update({ message_template: a.message_template }).eq('id', a.id).then(() => showToast('Sablon mentve'))}
                          style={{ minHeight: 48, fontSize: 13, lineHeight: 1.6, width: '100%', resize: 'none', overflow: 'hidden' }}
                          placeholder="Üzenet sablon..."
                        />
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {['{nev}', '{szolgaltatas}', '{idopont}', '{telephely}'].map(v => (
                            <span key={v} style={{
                              padding: '1px 6px', borderRadius: 3, fontSize: 9, fontFamily: 'monospace',
                              background: `${meta.color}08`, color: meta.color, border: `1px solid ${meta.color}18`,
                            }}>{v}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
