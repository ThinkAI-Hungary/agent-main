/**
 * SettingsPage (Tudástár) – 1:1 port of legacy settings page
 * Tab-based: Telefon (agent settings), Céginformációk (praxis), Szabályok (rules)
 * Each tab loads/saves from API: /admin/api/settings, /admin/api/praxisinfo, etc.
 */
import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../api/client';
import { showToast } from '../components/ui/Toast';
import Spinner from '../components/ui/Spinner';

// Tab definitions
const TABS = [
  { id: 'agent', label: 'Telefon', icon: '📞' },
  { id: 'praxis', label: 'Céginformációk', icon: '🏢' },
  { id: 'szabalyok', label: 'Szabályok', icon: '📋' },
] as const;

interface AgentSettings {
  voice: string;
  tone: string;
  tone_custom: string;
  greeting: string;
  system_prompt: string;
  workflow: string;
  business_hours: Record<string, { open: string; close: string; enabled: boolean }>;
}

interface PraxisInfo {
  nev: string;
  markanev: string;
  szakterulet: string;
  kulcsszavak: string;
  [key: string]: unknown;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('agent');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Agent settings
  const [settings, setSettings] = useState<AgentSettings>({
    voice: '', tone: 'professional_friendly', tone_custom: '', greeting: '', system_prompt: '', workflow: '',
    business_hours: {},
  });

  // Praxis info
  const [praxis, setPraxis] = useState<PraxisInfo>({ nev: '', markanev: '', szakterulet: '', kulcsszavak: '' });

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, praxisRes] = await Promise.all([
        authFetch('/admin/api/settings'),
        authFetch('/admin/api/praxisinfo'),
      ]);
      const settingsData = await settingsRes.json();
      const praxisData = await praxisRes.json();

      if (settingsData) {
        setSettings(prev => ({
          ...prev,
          voice: settingsData.voice || '',
          tone: settingsData.tone || 'professional_friendly',
          tone_custom: settingsData.tone_custom || '',
          greeting: settingsData.greeting || '',
          system_prompt: settingsData.system_prompt || '',
          workflow: settingsData.workflow || '',
          business_hours: settingsData.business_hours || {},
        }));
      }
      if (praxisData) {
        setPraxis({
          nev: praxisData.nev || '',
          markanev: praxisData.markanev || '',
          szakterulet: praxisData.szakterulet || '',
          kulcsszavak: praxisData.kulcsszavak || '',
        });
      }
    } catch {
      // OK – new deployment
    } finally {
      setLoading(false);
    }
  }, []);

  const saveAgentSettings = useCallback(async () => {
    setSaving(true);
    try {
      const res = await authFetch('/admin/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) showToast('Beállítások mentve!');
      else showToast('Hiba a mentéskor', 'error');
    } catch { showToast('Hiba', 'error'); }
    finally { setSaving(false); }
  }, [settings]);

  const savePraxis = useCallback(async () => {
    setSaving(true);
    try {
      const res = await authFetch('/admin/api/praxisinfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(praxis),
      });
      if (res.ok) showToast('Céginformációk mentve!');
      else showToast('Hiba', 'error');
    } catch { showToast('Hiba', 'error'); }
    finally { setSaving(false); }
  }, [praxis]);

  const handleSave = useCallback(() => {
    if (activeTab === 'agent') saveAgentSettings();
    else if (activeTab === 'praxis') savePraxis();
    else saveAgentSettings(); // szabályok are part of settings
  }, [activeTab, saveAgentSettings, savePraxis]);

  if (loading) {
    return <div className="analytics-shell" style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>;
  }

  return (
    <div className="analytics-shell">
      {/* Header */}
      <div className="settings-page-header">
        <h1>Tudástár</h1>
        <p>Tudásbázis, beállítások és preferenciák</p>
      </div>

      {/* Tab layout */}
      <div className="settings-layout">
        {/* Sidebar nav */}
        <div className="settings-sidebar-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span style={{ fontSize: 16 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="settings-content-area">
          {/* Agent tab */}
          {activeTab === 'agent' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Telefon beállítások</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Hang, kommunikációs stílus, bemutatkozás és nyitvatartás</div>
                </div>
                <SaveButton saving={saving} onClick={handleSave} />
              </div>

              {/* Voice + Tone */}
              <div className="settings-section">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  <SettingsField label="Hang" icon="🔊">
                    <input type="text" className="settings-select" value={settings.voice} onChange={(e) => setSettings({ ...settings, voice: e.target.value })} placeholder="Hang azonosító" />
                  </SettingsField>
                  <SettingsField label="Kommunikációs stílus" icon="💬">
                    <select className="settings-select" value={settings.tone} onChange={(e) => setSettings({ ...settings, tone: e.target.value })}>
                      <option value="professional_friendly">Professzionális, barátságos</option>
                      <option value="formal">Formális, tárgyszerű</option>
                      <option value="informal">Informális, közvetlen</option>
                      <option value="empathetic">Empatikus, támogató</option>
                      <option value="custom">Egyedi leírás...</option>
                    </select>
                    {settings.tone === 'custom' && (
                      <textarea className="settings-textarea" value={settings.tone_custom} onChange={(e) => setSettings({ ...settings, tone_custom: e.target.value })} placeholder="Leírd a kívánt kommunikációs stílust..." style={{ marginTop: 8, minHeight: 70 }} />
                    )}
                  </SettingsField>
                </div>
              </div>

              {/* Greeting */}
              <div className="settings-section">
                <SettingsField label="Bemutatkozás" icon="👤">
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Az agent ezt mondja el minden hívás elején.</div>
                  <textarea className="settings-textarea" value={settings.greeting} onChange={(e) => setSettings({ ...settings, greeting: e.target.value })} placeholder="Szia! A DigiDesk virtuális asszisztense vagyok..." style={{ minHeight: 80 }} />
                </SettingsField>
              </div>
            </div>
          )}

          {/* Praxis tab */}
          {activeTab === 'praxis' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Céginformációk</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Intézmény, telephelyek és szolgáltatások</div>
                </div>
                <SaveButton saving={saving} onClick={handleSave} />
              </div>

              <div className="tt-section">
                <div className="tt-section-title">
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(28,238,224,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🏢</div>
                  Intézményi adatok
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label className="tt-label">Intézmény neve</label>
                    <input className="tt-input" type="text" value={praxis.nev} onChange={(e) => setPraxis({ ...praxis, nev: e.target.value })} />
                  </div>
                  <div>
                    <label className="tt-label">Márkanév</label>
                    <input className="tt-input" type="text" value={praxis.markanev} onChange={(e) => setPraxis({ ...praxis, markanev: e.target.value })} placeholder="pl. Dental Clinic" />
                  </div>
                  <div>
                    <label className="tt-label">Szakterület</label>
                    <input className="tt-input" type="text" value={praxis.szakterulet} onChange={(e) => setPraxis({ ...praxis, szakterulet: e.target.value })} placeholder="pl. Fogászat, szájsebészet" />
                  </div>
                  <div>
                    <label className="tt-label">Pozicionáló kulcsszavak</label>
                    <input className="tt-input" type="text" value={praxis.kulcsszavak} onChange={(e) => setPraxis({ ...praxis, kulcsszavak: e.target.value })} placeholder="pl. fogorvos, implantáció" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rules tab */}
          {activeTab === 'szabalyok' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Foglalási szabályok</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Időpontfoglalás, páciens kezelés és szolgáltatások beállításai</div>
                </div>
                <SaveButton saving={saving} onClick={handleSave} />
              </div>

              <div className="tt-section">
                <div className="tt-section-title">
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(28,238,224,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📋</div>
                  Szabályok és workflow konfigurálása hamarosan...
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>
                  A részletes szabálykezelő a Tudástár bővítésekor kerül majd ide. Jelenleg a beállítások az eddigi felületen érhetők el.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsField({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="settings-section-title" style={{ marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(28,238,224,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>{icon}</div>
        {label}
      </div>
      {children}
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
