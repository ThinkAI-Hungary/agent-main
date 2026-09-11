/**
 * VoiceProvisioningSection — Telnyx BYO telefonbeállítás varázsló (admin-only).
 * A user megadja a SAJÁT Telnyx API kulcsát, kiválasztja a számát,
 * és a rendszer API-n végzi a teljes LiveKit+Telnyx beállítást.
 */
import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../api/client';
import { showToast } from '../ui/Toast';
import Spinner from '../ui/Spinner';

interface VoiceStatus {
  telnyx_key_saved: boolean;
  connection_id: string | null;
  outbound_profile_id: string | null;
  phone_number: string | null;
  phone_number_masked: string | null;
  sip_host: string;
  agent: string;
}

interface TelnyxNumber {
  number: string;
  id: string;
  status: string;
  connection_id: string | null;
}

export default function VoiceProvisioningSection() {
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [numbers, setNumbers] = useState<TelnyxNumber[]>([]);
  const [selectedNumber, setSelectedNumber] = useState('');
  const [provisioning, setProvisioning] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/admin/api/voice/status');
      if (res.ok) setStatus(await res.json());
    } catch {
      showToast('Hiba a státusz betöltésekor', 'error');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // 1. lépés: API kulcs validálás + mentés
  const handleValidate = async () => {
    if (!apiKey.trim()) { showToast('Add meg a Telnyx API kulcsot', 'error'); return; }
    setValidating(true);
    try {
      const res = await authFetch('/admin/api/voice/telnyx/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Telnyx kulcs érvényes és elmentve!', 'success');
        setNumbers(data.numbers || []);
        setApiKey('');
        await loadStatus();
      } else {
        showToast(data.detail || 'A kulcs érvénytelen', 'error');
      }
    } catch {
      showToast('Hiba a validáláskor', 'error');
    }
    setValidating(false);
  };

  // 3. lépés: provision
  const handleProvision = async () => {
    if (!selectedNumber) { showToast('Válassz számot', 'error'); return; }
    const num = numbers.find((n) => n.id === selectedNumber);
    setProvisioning(true);
    try {
      const res = await authFetch('/admin/api/voice/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: num?.number || selectedNumber, number_id: selectedNumber }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Telefonbeállítás elkészült! A szám él.', 'success');
        setNumbers([]);
        await loadStatus();
      } else {
        showToast(data.detail || 'Hiba a beállítás során', 'error');
      }
    } catch {
      showToast('Hiba a beállítás során', 'error');
    }
    setProvisioning(false);
  };

  if (loading) {
    return (
      <div className="beallitasok-card" style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <style>{telStyles}</style>

      {/* Státusz panel */}
      <div className="beallitasok-card">
        <div className="tel-header">
          <div>
            <div className="beal-subtitle-16">Telefónia (Telnyx)</div>
            <div className="tel-desc">
              Saját Telnyx fiókod összekapcsolása a hangasszisztenssel.
              A számot a Telnyx portálon vedd meg és aktiváld — a beállítást ez a varázsló végzi el.
            </div>
          </div>
        </div>
        <div className="tel-status-grid">
          <StatusItem label="API kulcs" ok={!!status?.telnyx_key_saved} />
          <StatusItem label="Kapcsolat" ok={!!status?.connection_id} />
          <StatusItem label="Telefonszám" ok={!!status?.phone_number}
            extra={status?.phone_number_masked || undefined} />
          <StatusItem label="Agent" neutral value={status?.agent} />
        </div>
      </div>

      {/* 1. lépés: API kulcs */}
      <div className="beallitasok-card">
        <div className="tel-step-title">1. lépés — Telnyx API kulcs</div>
        <div className="tel-desc mb-8">
          A Telnyx portálon: <b>API Keys → Create API Key</b>. A kulcs titkosítva tárolódik.
        </div>
        <div className="tel-input-row">
          <input
            type="password"
            className="tel-input"
            placeholder="Telnyx API kulcs (KEY…)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
          <button className="tel-btn" onClick={handleValidate} disabled={validating || !apiKey.trim()}>
            {validating ? 'Ellenőrzés…' : 'Ellenőrzés és mentés'}
          </button>
        </div>
        {status?.telnyx_key_saved && !apiKey && (
          <div className="tel-saved-note">✓ Kulcs elmentve. Új kulcshoz írd be fölé.</div>
        )}
      </div>

      {/* 2. lépés: szám-választás */}
      <div className="beallitasok-card">
        <div className="tel-step-title">2. lépés — Telefonszám kiválasztása</div>
        {numbers.length === 0 ? (
          <div className="tel-empty">
            {status?.telnyx_key_saved
              ? 'Mentett kulccsal a számok itt jelennek meg. Új kulcs megadásával frissül a lista.'
              : 'Előbb add meg az API kulcsot (1. lépés).'}
          </div>
        ) : (
          <>
            <div className="tel-numbers">
              {numbers.map((n) => (
                <label key={n.id} className={`tel-number-row ${selectedNumber === n.id ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="telnyx-number"
                    checked={selectedNumber === n.id}
                    onChange={() => setSelectedNumber(n.id)}
                    disabled={n.status !== 'active'}
                  />
                  <span className="tel-number">{n.number}</span>
                  <span className={`tel-num-status ${n.status === 'active' ? 'ok' : 'wait'}`}>
                    {n.status === 'active' ? 'aktív' : n.status}
                  </span>
                  {n.connection_id && <span className="tel-num-conn">kapcsolódva</span>}
                </label>
              ))}
            </div>
            <button className="tel-btn tel-btn-primary" onClick={handleProvision} disabled={provisioning || !selectedNumber}>
              {provisioning ? 'Beállítás folyamatban… (kb. 20 mp)' : '3. lépés — Telefonbeállítás elvégzése'}
            </button>
            <div className="tel-hint">
              A beállítás létrehozza a kapcsolatot a LiveKit felé, hozzárendeli a számot,
              és engedélyezi a bejövő hívásokat az asszisztensnek.
            </div>
          </>
        )}
      </div>

      {/* Kapcsolat infó (support/debug) */}
      {status?.connection_id && (
        <div className="beallitasok-card">
          <div className="tel-step-title">Kapcsolat részletei (support)</div>
          <div className="tel-kv">Connection ID: <code>{status.connection_id}</code></div>
          <div className="tel-kv">LiveKit SIP host: <code>{status.sip_host}</code></div>
          <div className="tel-kv">Outbound profile: <code>{status.outbound_profile_id || '—'}</code></div>
        </div>
      )}
    </>
  );
}

function StatusItem({ label, ok, neutral, value, extra }: { label: string; ok?: boolean; neutral?: boolean; value?: string; extra?: string }) {
  return (
    <div className="tel-status-item">
      <div className="tel-status-label">{label}</div>
      <div className="tel-status-value">
        {neutral ? (value || '…') : ok ? '🟢 beállítva' : '⚪ nincs beállítva'}
        {ok && value ? ` (${value})` : ''}
      </div>
      {extra ? <div style={{ fontSize: 11, color: 'var(--text-muted, #5F7D95)', marginTop: 2 }}>{extra}</div> : null}
    </div>
  );
}

const telStyles = `
.tel-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.tel-desc { font-size: 13px; color: var(--text-muted, #5F7D95); margin-top: 4px; max-width: 640px; }
.tel-status-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 16px; }
.tel-status-item { background: var(--bg3, #F0F4F8); border-radius: 8px; padding: 10px 14px; }
.tel-status-label { font-size: 11px; font-weight: 600; color: var(--text-muted, #5F7D95); text-transform: uppercase; letter-spacing: 0.4px; }
.tel-status-value { font-size: 13px; font-weight: 600; color: var(--text, #082432); margin-top: 2px; word-break: break-all; }
.tel-step-title { font-size: 15px; font-weight: 700; color: var(--text, #082432); margin-bottom: 8px; }
.tel-input-row { display: flex; gap: 10px; flex-wrap: wrap; }
.tel-input { flex: 1; min-width: 280px; height: 40px; padding: 0 14px; font-size: 14px; border: 1px solid var(--border, #D9D9D9); border-radius: 8px; background: var(--bg, #fff); color: var(--text, #082432); outline: none; font-family: inherit; box-sizing: border-box; }
.tel-input:focus { border-color: #1ceee0; box-shadow: 0 0 0 3px rgba(28,238,224,0.1); }
.tel-btn { height: 40px; padding: 0 18px; border-radius: 8px; border: 1px solid var(--border, #D9D9D9); background: var(--bg, #fff); color: var(--text, #082432); font-size: 13px; font-weight: 600; cursor: pointer; }
.tel-btn:hover { border-color: #1ceee0; }
.tel-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.tel-btn-primary { background: #1ceee0; color: #082432; border: none; margin-top: 14px; }
.tel-saved-note { font-size: 12px; color: #0a8b82; margin-top: 8px; }
.tel-empty { font-size: 13px; color: var(--text-muted, #5F7D95); }
.tel-numbers { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.tel-number-row { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border: 1px solid var(--border, #D9D9D9); border-radius: 8px; cursor: pointer; font-size: 14px; }
.tel-number-row.selected { border-color: #1ceee0; box-shadow: 0 0 0 3px rgba(28,238,224,0.1); }
.tel-number { font-weight: 600; color: var(--text, #082432); }
.tel-num-status { font-size: 12px; padding: 2px 8px; border-radius: 4px; }
.tel-num-status.ok { background: rgba(28,238,224,0.12); color: #0a8b82; }
.tel-num-status.wait { background: rgba(245,158,11,0.12); color: #d97706; }
.tel-num-conn { font-size: 11px; color: var(--text-muted, #5F7D95); }
.tel-hint { font-size: 12px; color: var(--text-muted, #5F7D95); margin-top: 10px; }
.tel-kv { font-size: 13px; color: var(--text, #082432); margin-bottom: 6px; }
.tel-kv code { background: var(--bg3, #F0F4F8); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
@media (max-width: 768px) { .tel-status-grid { grid-template-columns: 1fr 1fr; } }
`;
